import test from "node:test";
import assert from "node:assert/strict";
import { createDriveActor, createDriveActorBridge, createDriveActorEndpoint } from "./drive-actor-bridge.js";
import { createDriveAuthRouter } from "./drive-auth-router.js";
import { oauthHash } from "./drive-oauth.js";

function storage() {
  const values = new Map(); let queue = Promise.resolve();
  return { values, transaction(fn) { const result = queue.then(() => fn({ get: async k => values.get(k), put: async (k, v) => { values.set(k, v); }, delete: async k => { values.delete(k); } })); queue = result.catch(() => {}); return result; } };
}
test("a failed cleanup alarm prevents creating an authorization transaction", async () => {
  const db = storage();
  const actor = createDriveActor({ uid: "a", storage: db, identity: { firebase: async () => ({ uid: "a" }), google: async () => ({}) }, clientId: "client", clientSecret: "secret", stateKey: new Uint8Array(32), vaultKey: "A".repeat(43), vaultKeyId: "v1", scheduleExpiry: async () => { throw new Error("alarm unavailable"); } });
  await assert.rejects(actor.begin("a"), /alarm unavailable/);
  assert.equal(db.values.has("pending"), false);
});
test("router and per-account actor bridge complete a bound authorization and restore across calls", async () => {
  const stateKey = crypto.getRandomValues(new Uint8Array(32));
  const vaultKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const identity = { firebase: async token => { if (!["a", "b"].includes(token)) throw new Error("invalid"); return { uid: token }; }, google: async (_, nonceHash) => { assert.equal(nonceHash, expectedNonceHash); return { accountId: "google-a" }; } };
  let expectedNonceHash = "", expectedChallenge = "", refreshCalls = 0;
  const stores = new Map(), actors = new Map();
  const actorForUid = uid => {
    if (!actors.has(uid)) {
      const db = storage(); stores.set(uid, db);
      actors.set(uid, createDriveActorEndpoint(createDriveActor({ uid, storage: db, identity, clientId: "client", clientSecret: "secret", stateKey, vaultKey, vaultKeyId: "v1", exchange: async ({ verifier }) => { assert.equal(await oauthHash(verifier), expectedChallenge); return { idToken: "google-id", refreshToken: "secret-refresh", scope: "openid email https://www.googleapis.com/auth/drive.file" }; }, refresh: async ({ refreshToken }) => { assert.equal(refreshToken, "secret-refresh"); refreshCalls++; await new Promise(resolve => setTimeout(resolve, 5)); return { accessToken: "short-token", expiresAt: Date.now() + 300000, scope: "openid email https://www.googleapis.com/auth/drive.file" }; } })));
    }
    return actors.get(uid);
  };
  const bridge = createDriveActorBridge({ identity, stateKey, actorForUid });
  const route = createDriveAuthRouter({ identity, ...bridge });
  const origin = "https://infinite.petfashion.tw";
  const post = (path, uid, cookie = "") => new Request(`${origin}${path}`, { method: "POST", headers: { origin, "content-type": "application/json", authorization: `Bearer ${uid}`, cookie } });
  const start = await route(post("/api/drive/connect", "a"));
  const pending = start.headers.getSetCookie()[0].split(";")[0];
  const url = new URL((await start.json()).authorizationUrl);
  expectedNonceHash = await oauthHash(url.searchParams.get("nonce")); expectedChallenge = url.searchParams.get("code_challenge");
  const callbackUrl = new URL(`${origin}/api/drive/oauth/callback`); callbackUrl.searchParams.set("state", url.searchParams.get("state")); callbackUrl.searchParams.set("code", "code");
  const callback = await route(new Request(callbackUrl, { headers: { cookie: pending } }));
  const staged = callback.headers.getSetCookie()[0].split(";")[0];
  const cookies = `${pending}; ${staged}`;
  assert.equal((await route(post("/api/drive/complete", "b", cookies))).status, 503);
  assert.equal((await route(post("/api/drive/complete", "a", cookies))).status, 200);
  const [one, two] = await Promise.all([route(post("/api/drive/access-token", "a")), route(post("/api/drive/access-token", "a"))]);
  assert.equal((await one.json()).accessToken, "short-token"); assert.equal((await two.json()).accessToken, "short-token");
  assert.equal(refreshCalls, 1);
  assert.doesNotMatch(JSON.stringify([...stores.get("a").values]), /secret-refresh/);
  assert.equal((await route(post("/api/drive/access-token", "b"))).status, 401);
  assert.deepEqual(await (await route(post("/api/drive/revoke", "a"))).json(), { removed: true });
  assert.equal((await route(post("/api/drive/access-token", "a"))).status, 401);
  assert.equal(stores.get("a").values.has("grant"), false);
});
