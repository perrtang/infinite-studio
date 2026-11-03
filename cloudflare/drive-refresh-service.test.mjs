import test from "node:test";
import assert from "node:assert/strict";
import { createDriveRefreshService } from "./drive-refresh-service.js";
import { openDriveCredential, sealDriveCredential } from "./drive-credential-vault.js";
import { beginDriveAuthorization, completeDriveAuthorization, consumeDriveAuthorization, invalidateDriveGrant, stageDriveGrantIfCurrent } from "./drive-grant-state.js";

function storage() {
  const values = new Map(); let queue = Promise.resolve();
  return { values, transaction(fn) { const p = queue.then(() => fn({ get: async k => values.get(k), put: async (k, v) => { values.set(k, v); }, delete: async k => { values.delete(k); } })); queue = p.catch(() => {}); return p; } };
}
const makeKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const scope = "openid email https://www.googleapis.com/auth/drive.file";
const browser = "B".repeat(43), nonce = "N".repeat(43);
const verifier = { version: 1, keyId: "key-1", iv: "I".repeat(16), ciphertext: "ciphertext" };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function installGrant(store, key, stateHash, refreshToken = "refresh-one") {
  const sealed = await sealDriveCredential(JSON.stringify({ refreshToken, scope }), { key, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  await beginDriveAuthorization(store, { stateHash, browserHash: browser, nonceHash: nonce, sealedVerifier: verifier, expiresAt: Date.now() + 120_000 });
  const attempt = await consumeDriveAuthorization(store, { stateHash, browserHash: browser });
  assert.equal(await stageDriveGrantIfCurrent(store, { stateHash, expectedEpoch: attempt.epoch, expectedGeneration: attempt.generation, accountId: "google-sub", sealedRefreshToken: sealed }), true);
  assert.equal(await completeDriveAuthorization(store, { stateHash, browserHash: browser }), true);
}
const validResult = { accessToken: "access", refreshToken: "", scope, expiresAt: Date.now() + 60_000 };
const serviceFor = (store, key, refresh) => createDriveRefreshService({ storage: store, uid: "user-a", clientId: "client", clientSecret: "secret", activeKeyId: "key-1", resolveVaultKey: async id => id === "key-1" ? key : null, refresh });

test("key rotation re-encrypts a previously saved grant with the active key", async () => {
  const store = storage(), oldKey = makeKey(), newKey = makeKey();
  await installGrant(store, oldKey, "A".repeat(43));
  const service = createDriveRefreshService({ storage: store, uid: "user-a", clientId: "client", clientSecret: "secret", activeKeyId: "key-2", resolveVaultKey: async id => id === "key-1" ? oldKey : id === "key-2" ? newKey : null, refresh: async () => validResult });
  await service.refresh();
  const grant = store.values.get("grant");
  assert.equal(grant.sealedRefreshToken.keyId, "key-2");
  const credential = await openDriveCredential(grant.sealedRefreshToken, { key: newKey, keyId: "key-2", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.equal(JSON.parse(credential).refreshToken, "refresh-one");
});

test("concurrent tabs share one refresh, and refresh credentials never leave the service", async () => {
  const store = storage(), key = makeKey(), gate = deferred(), entered = deferred(); let calls = 0;
  await installGrant(store, key, "A".repeat(43));
  const service = serviceFor(store, key, async () => { calls++; entered.resolve(); return gate.promise; });
  const first = service.refresh(), second = service.refresh(); await entered.promise;
  assert.equal(calls, 1); gate.resolve(validResult);
  assert.deepEqual(await first, { accessToken: "access", expiresAt: validResult.expiresAt });
  assert.deepEqual(await second, { accessToken: "access", expiresAt: validResult.expiresAt });
});

test("revocation during refresh cannot return an old token or restore the grant", async () => {
  const store = storage(), key = makeKey(), gate = deferred(), entered = deferred();
  await installGrant(store, key, "A".repeat(43));
  const pending = serviceFor(store, key, async () => { entered.resolve(); return gate.promise; }).refresh();
  await entered.promise; await invalidateDriveGrant(store); gate.resolve(validResult);
  await assert.rejects(pending, { code: "superseded" });
  assert.equal(store.values.has("grant"), false);
});

test("an old invalid_grant cannot delete a newer authorization for the same account", async () => {
  const store = storage(), key = makeKey(), gate = deferred(), entered = deferred();
  await installGrant(store, key, "A".repeat(43));
  const pending = serviceFor(store, key, async () => { entered.resolve(); return gate.promise; }).refresh();
  await entered.promise; await installGrant(store, key, "C".repeat(43), "refresh-new"); gate.reject(Object.assign(new Error("fixture"), { code: "invalid_grant" }));
  await assert.rejects(pending, { code: "superseded" });
  const grant = store.values.get("grant");
  const plain = await openDriveCredential(grant.sealedRefreshToken, { key, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.equal(JSON.parse(plain).refreshToken, "refresh-new");
});

test("a successful old refresh cannot replace or return a token after reauthorization", async () => {
  const store = storage(), key = makeKey(), gate = deferred(), entered = deferred();
  await installGrant(store, key, "A".repeat(43));
  const pending = serviceFor(store, key, async () => { entered.resolve(); return gate.promise; }).refresh();
  await entered.promise; await installGrant(store, key, "C".repeat(43), "refresh-new");
  gate.resolve({ ...validResult, refreshToken: "obsolete-rotation" });
  await assert.rejects(pending, { code: "superseded" });
  const grant = store.values.get("grant");
  const plain = await openDriveCredential(grant.sealedRefreshToken, { key, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.equal(JSON.parse(plain).refreshToken, "refresh-new");
});

test("invalid_grant removes only the matching grant; transient errors retain it", async () => {
  const store = storage(), key = makeKey(); await installGrant(store, key, "A".repeat(43));
  await assert.rejects(serviceFor(store, key, async () => { throw Object.assign(new Error(), { code: "network_error" }); }).refresh(), { code: "network_error" });
  assert.equal(store.values.has("grant"), true);
  await assert.rejects(serviceFor(store, key, async () => { throw Object.assign(new Error(), { code: "invalid_grant" }); }).refresh(), { code: "authorization_required" });
  assert.equal(store.values.has("grant"), false);
});

test("rotated refresh credentials are encrypted and replace only the current grant", async () => {
  const store = storage(), key = makeKey(); await installGrant(store, key, "A".repeat(43));
  await serviceFor(store, key, async () => ({ ...validResult, refreshToken: "rotated-refresh" })).refresh();
  const grant = store.values.get("grant");
  assert.equal(JSON.stringify(grant).includes("rotated-refresh"), false);
  const plain = await openDriveCredential(grant.sealedRefreshToken, { key, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.equal(JSON.parse(plain).refreshToken, "rotated-refresh");
});

test("a missing or malformed active key prevents the Google refresh request", async () => {
  const store = storage(), key = makeKey(); await installGrant(store, key, "A".repeat(43));
  let calls = 0;
  for (const invalidKey of [null, "invalid"]) {
    const service = createDriveRefreshService({ storage: store, uid: "user-a", clientId: "client", clientSecret: "secret", activeKeyId: "key-2", resolveVaultKey: async id => id === "key-1" ? key : invalidKey, refresh: async () => { calls++; return validResult; } });
    await assert.rejects(service.refresh(), { code: "vault_key_unavailable" });
  }
  assert.equal(calls, 0);
  assert.equal(store.values.has("grant"), true);
});

test("a rotated credential survives temporary storage failures without contacting Google twice", async () => {
  const store = storage(), key = makeKey(); await installGrant(store, key, "A".repeat(43));
  const originalTransaction = store.transaction; let failures = 0, calls = 0;
  store.transaction = (fn) => { if (failures > 0) { failures--; return Promise.reject(new Error("temporary")); } return originalTransaction(fn); };
  const service = serviceFor(store, key, async () => { calls++; failures = 3; return { ...validResult, refreshToken: "rotated-refresh" }; });
  await assert.rejects(service.refresh(), { code: "storage_error" });
  assert.equal(calls, 1);
  assert.deepEqual(await service.refresh(), { accessToken: "access", expiresAt: validResult.expiresAt });
  assert.equal(calls, 1);
  const grant = store.values.get("grant");
  const plain = await openDriveCredential(grant.sealedRefreshToken, { key, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.equal(JSON.parse(plain).refreshToken, "rotated-refresh");
});

test("an expired access token is never returned after persistence", async () => {
  const store = storage(), key = makeKey(); await installGrant(store, key, "A".repeat(43));
  const service = serviceFor(store, key, async () => ({ ...validResult, refreshToken: "rotated-refresh", expiresAt: Date.now() - 1 }));
  await assert.rejects(service.refresh(), { code: "access_token_expired" });
  const grant = store.values.get("grant");
  const plain = await openDriveCredential(grant.sealedRefreshToken, { key, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.equal(JSON.parse(plain).refreshToken, "rotated-refresh");
});
