import test from "node:test";
import assert from "node:assert/strict";
import { createDriveAuthCoordinator } from "./drive-auth-coordinator.js";
import { openDriveCredential } from "./drive-credential-vault.js";
import { invalidateDriveGrant } from "./drive-grant-state.js";
import { oauthHash } from "./drive-oauth.js";

function makeStorage() {
  const values = new Map(); let queue = Promise.resolve();
  return { values, transaction(fn) {
    const next = queue.then(() => fn({ get: async key => values.get(key), put: async (key, value) => { values.set(key, value); }, delete: async key => { values.delete(key); } }));
    queue = next.catch(() => {}); return next;
  } };
}
function setup() {
  const stores = new Map(), stateKey = crypto.getRandomValues(new Uint8Array(32));
  const vaultKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const scope = "openid email https://www.googleapis.com/auth/drive.file";
  let expectedNonceHash = "", expectedChallenge = "";
  const storageForUid = uid => { if (!stores.has(uid)) stores.set(uid, makeStorage()); return stores.get(uid); };
  const identity = {
    firebase: async token => { if (!["user-a", "user-b"].includes(token)) throw new Error("bad identity"); return { uid: token }; },
    google: async (token, nonceHash) => { if (token !== "signed-google" || nonceHash !== expectedNonceHash) throw new Error("bad identity"); return { accountId: "google-sub" }; },
  };
  const exchange = async ({ code, verifier }) => {
    if (code !== "valid-code" || await oauthHash(verifier) !== expectedChallenge) throw new Error("bad code");
    return { idToken: "signed-google", refreshToken: "private-refresh", accessToken: "private-access", scope };
  };
  const service = createDriveAuthCoordinator({ clientId: "client", clientSecret: "secret", stateKey, vaultKey, vaultKeyId: "key-1", identity, storageForUid, exchange });
  async function begin() {
    const result = await service.begin("user-a"), url = new URL(result.authorizationUrl);
    expectedNonceHash = await oauthHash(url.searchParams.get("nonce")); expectedChallenge = url.searchParams.get("code_challenge");
    return { ...result, state: url.searchParams.get("state") };
  }
  return { service, begin, storageForUid, vaultKey, scope, stateKey, identity, exchange };
}

test("an authorization started before vault key rotation can complete", async () => {
  const old = setup();
  const attempt = await old.begin();
  const nextKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const service = createDriveAuthCoordinator({ clientId: "client", clientSecret: "secret", stateKey: old.stateKey, vaultKey: nextKey, vaultKeyId: "key-2", identity: old.identity, storageForUid: old.storageForUid, exchange: old.exchange, resolveVaultKey: async id => id === "key-1" ? old.vaultKey : id === "key-2" ? nextKey : null });
  const staged = await service.callback({ state: attempt.state, browserSecret: attempt.browserSecret, code: "valid-code" });
  await service.complete({ firebaseToken: "user-a", stateHash: staged.stateHash, browserSecret: attempt.browserSecret });
  assert.equal(old.storageForUid("user-a").values.get("grant").sealedRefreshToken.keyId, "key-2");
});

test("only the original signed-in user and browser can activate the staged Google account", async () => {
  const { service, begin, storageForUid, vaultKey, scope } = setup();
  const attempt = await begin();
  assert.equal(attempt.authorizationUrl.includes(attempt.browserSecret), false);
  await assert.rejects(service.callback({ state: attempt.state, browserSecret: "X".repeat(43), code: "valid-code" }));
  const staged = await service.callback({ state: attempt.state, browserSecret: attempt.browserSecret, code: "valid-code" });
  assert.deepEqual(Object.keys(staged), ["stateHash"]);
  assert.equal(storageForUid("user-a").values.has("grant"), false);
  await assert.rejects(service.complete({ firebaseToken: "user-b", stateHash: staged.stateHash, browserSecret: attempt.browserSecret }));
  await assert.rejects(service.complete({ firebaseToken: "user-a", stateHash: staged.stateHash, browserSecret: "X".repeat(43) }));
  assert.deepEqual(await service.complete({ firebaseToken: "user-a", stateHash: staged.stateHash, browserSecret: attempt.browserSecret }), { connected: true });
  await assert.rejects(service.complete({ firebaseToken: "user-a", stateHash: staged.stateHash, browserSecret: attempt.browserSecret }));
  await assert.rejects(service.callback({ state: attempt.state, browserSecret: attempt.browserSecret, code: "valid-code" }));
  const grant = storageForUid("user-a").values.get("grant");
  const payload = await openDriveCredential(grant.sealedRefreshToken, { key: vaultKey, keyId: "key-1", uid: "user-a", accountId: "google-sub", purpose: "drive-refresh" });
  assert.deepEqual(JSON.parse(payload), { refreshToken: "private-refresh", scope });
  assert.equal(JSON.stringify(grant).includes("private-refresh"), false);
});

test("revoking a staged authorization prevents completion", async () => {
  const { service, begin, storageForUid } = setup();
  const attempt = await begin();
  const staged = await service.callback({ state: attempt.state, browserSecret: attempt.browserSecret, code: "valid-code" });
  await invalidateDriveGrant(storageForUid("user-a"));
  await assert.rejects(service.complete({ firebaseToken: "user-a", stateHash: staged.stateHash, browserSecret: attempt.browserSecret }));
  assert.equal(storageForUid("user-a").values.has("grant"), false);
});
