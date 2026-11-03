import test from "node:test";
import assert from "node:assert/strict";
import { createDriveAuthCoordinator } from "./drive-auth-coordinator.js";
import { createDriveAuthRouter } from "./drive-auth-router.js";
import { oauthHash } from "./drive-oauth.js";

function storage() {
  const values = new Map(); let queue = Promise.resolve();
  return { values, transaction(fn) { const p = queue.then(() => fn({ get: async k => values.get(k), put: async (k, v) => { values.set(k, v); }, delete: async k => { values.delete(k); } })); queue = p.catch(() => {}); return p; } };
}
test("HTTP popup flow retains original page and requires original Firebase user and cookie", async () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const stores = new Map(); let nonceHash = "", challenge = "";
  const storageForUid = uid => { if (!stores.has(uid)) stores.set(uid, storage()); return stores.get(uid); };
  const identity = {
    firebase: async token => { if (!["uid-a", "uid-b"].includes(token)) throw new Error("bad token"); return { uid: token }; },
    google: async (token, actualNonce) => { if (token !== "google-id" || actualNonce !== nonceHash) throw new Error("bad nonce"); return { accountId: "google-sub" }; },
  };
  const exchange = async ({ code, verifier }) => { if (code !== "test-code" || await oauthHash(verifier) !== challenge) throw new Error("bad code"); return { idToken: "google-id", refreshToken: "fixture-secret-refresh", scope: "openid email https://www.googleapis.com/auth/drive.file" }; };
  const coordinator = createDriveAuthCoordinator({ clientId: "client", clientSecret: "secret", stateKey: crypto.getRandomValues(new Uint8Array(32)), vaultKey: key, vaultKeyId: "key-1", identity, storageForUid, exchange });
  const route = createDriveAuthRouter({ coordinator, identity, refreshServiceForUid: () => ({ refresh: async () => { throw new Error("unused"); } }) });
  const origin = "https://infinite.petfashion.tw";
  const post = (path, uid, cookie = "") => new Request(`${origin}${path}`, { method: "POST", headers: { origin, "content-type": "application/json", authorization: `Bearer ${uid}`, cookie } });
  const start = await route(post("/api/drive/connect", "uid-a"));
  const pending = start.headers.getSetCookie().find(value => value.startsWith("__Host-infinite-drive-pending=")).split(";")[0];
  const url = new URL((await start.json()).authorizationUrl);
  nonceHash = await oauthHash(url.searchParams.get("nonce")); challenge = url.searchParams.get("code_challenge");
  const callbackUrl = new URL(`${origin}/api/drive/oauth/callback`); callbackUrl.searchParams.set("state", url.searchParams.get("state")); callbackUrl.searchParams.set("code", "test-code");
  const callback = await route(new Request(callbackUrl, { headers: { cookie: pending } }));
  assert.equal(callback.headers.get("location"), `${origin}/drive-auth-complete.html?result=success`);
  const staged = callback.headers.getSetCookie().find(value => value.startsWith("__Host-infinite-drive-staged=")).split(";")[0];
  const cookies = `${pending}; ${staged}`;
  assert.equal((await route(post("/api/drive/complete", "uid-b", cookies))).status, 503);
  assert.equal(stores.get("uid-a").values.has("grant"), false);
  assert.deepEqual(await (await route(post("/api/drive/complete", "uid-a", cookies))).json(), { authorized: true });
  assert.equal(stores.get("uid-a").values.get("grant").accountId, "google-sub");
  assert.doesNotMatch(JSON.stringify([...stores.get("uid-a").values]), /fixture-secret-refresh/);
});
