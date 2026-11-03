import test from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createDriveAuthCoordinator } from "./drive-auth-coordinator.js";
import { createDriveIdentityVerifier } from "./drive-identity.js";
import { exchangeDriveAuthorizationCode } from "./drive-oauth.js";

function storage() {
  const values = new Map(); let queue = Promise.resolve();
  return { values, transaction(fn) { const result = queue.then(() => fn({ get: async k => values.get(k), put: async (k, v) => { values.set(k, v); }, delete: async k => { values.delete(k); } })); queue = result.catch(() => {}); return result; } };
}
test("signed identities, PKCE and one-time staged grant work together without exposing tokens", async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...await exportJWK(pair.publicKey), kid: "test", alg: "RS256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const identity = createDriveIdentityVerifier({ firebaseProjectId: "test-project", googleClientId: "test-client", firebaseKeys: keys, googleKeys: keys });
  const now = Math.floor(Date.now() / 1000);
  const sign = claims => new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "test" }).sign(pair.privateKey);
  const firebaseToken = await sign({ sub: "user-a", iss: "https://securetoken.google.com/test-project", aud: "test-project", iat: now, auth_time: now, exp: now + 300, email: "user@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } });
  let nonce = "";
  const fetchImpl = async () => {
    const googleToken = await sign({ sub: "google-sub", iss: "https://accounts.google.com", aud: "test-client", iat: now, exp: now + 300, nonce });
    return new Response(JSON.stringify({ id_token: googleToken, access_token: "fixture-access", refresh_token: "fixture-refresh", scope: "openid email https://www.googleapis.com/auth/drive.file", token_type: "Bearer", expires_in: 3600 }));
  };
  const stateKey = crypto.getRandomValues(new Uint8Array(32));
  const vaultKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const stores = new Map();
  const storageForUid = uid => { if (!stores.has(uid)) stores.set(uid, storage()); return stores.get(uid); };
  const coordinator = createDriveAuthCoordinator({ clientId: "test-client", clientSecret: "fixture-secret", stateKey, vaultKey, vaultKeyId: "key-1", identity, storageForUid, exchange: args => exchangeDriveAuthorizationCode(args, { fetchImpl }) });
  const started = await coordinator.begin(firebaseToken), url = new URL(started.authorizationUrl);
  nonce = url.searchParams.get("nonce");
  const staged = await coordinator.callback({ state: url.searchParams.get("state"), browserSecret: started.browserSecret, code: "fixture-code" });
  assert.deepEqual(Object.keys(staged), ["stateHash"]);
  assert.deepEqual(await coordinator.complete({ firebaseToken, stateHash: staged.stateHash, browserSecret: started.browserSecret }), { connected: true });
  const saved = stores.get("user-a").values.get("grant");
  assert.equal(saved.accountId, "google-sub");
  assert.doesNotMatch(JSON.stringify(saved), /fixture-(?:access|refresh)/);
});
