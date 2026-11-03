import test from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createDriveIdentityVerifier } from "./drive-identity.js";

const pair = await generateKeyPair("RS256", { extractable: true });
const jwk = { ...await exportJWK(pair.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
const keys = createLocalJWKSet({ keys: [jwk] });
const verify = createDriveIdentityVerifier({ firebaseProjectId: "test-project", googleClientId: "test-client", firebaseKeys: keys, googleKeys: keys });
const now = Math.floor(Date.now() / 1000);
const firebaseClaims = { sub: "user-a", iss: "https://securetoken.google.com/test-project", aud: "test-project", iat: now, auth_time: now, exp: now + 300, email: "user@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } };
const googleClaims = { sub: "google-a", iss: "https://accounts.google.com", aud: "test-client", iat: now, exp: now + 300, nonce: "nonce-for-test", email: "owner@example.com", email_verified: true };
const sign = (claims, privateKey = pair.privateKey) => new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(privateKey);
const nonceHash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("nonce-for-test"))))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

test("Firebase identity comes only from a valid signed token for this project", async () => {
  assert.deepEqual(await verify.firebase(await sign(firebaseClaims)), { uid: "user-a" });
  for (const changes of [{ aud: "other-project" }, { iss: "https://securetoken.google.com/other-project" }, { exp: now - 1 }, { auth_time: now + 100 }, { iat: now + 100 }, { sub: "" }, { email_verified: false }, { firebase: { sign_in_provider: "anonymous" } }, { firebase: { sign_in_provider: "google.com", tenant: "other-tenant" } }]) {
    await assert.rejects(verify.firebase(await sign({ ...firebaseClaims, ...changes })));
  }
  const attacker = await generateKeyPair("RS256");
  await assert.rejects(verify.firebase(await sign(firebaseClaims, attacker.privateKey)));
  const withoutKid = await new SignJWT(firebaseClaims).setProtectedHeader({ alg: "RS256" }).sign(pair.privateKey);
  await assert.rejects(verify.firebase(withoutKid));
});

test("Google account identity requires the correct client and transaction nonce", async () => {
  assert.deepEqual(await verify.google(await sign(googleClaims), nonceHash), { accountId: "google-a", email: "owner@example.com" });
  for (const changes of [{ aud: "other-client" }, { azp: "other-client" }, { iss: "https://attacker.example" }, { exp: now - 1 }, { iat: now + 100 }, { nonce: "wrong" }, { sub: "" }]) {
    await assert.rejects(verify.google(await sign({ ...googleClaims, ...changes }), nonceHash));
  }
  assert.equal((await verify.google(await sign({ ...googleClaims, email_verified: false }), nonceHash)).email, "");
  const attacker = await generateKeyPair("RS256");
  await assert.rejects(verify.google(await sign(googleClaims, attacker.privateKey), nonceHash));
  await assert.rejects(verify.google(await sign(googleClaims), "invalid"));
});
