import { createDriveAuthorization, exchangeDriveAuthorizationCode, oauthHash } from "./drive-oauth.js";
import { openOAuthStateEnvelope } from "./drive-oauth-state.js";
import { openDriveCredential, sealDriveCredential } from "./drive-credential-vault.js";
import { beginDriveAuthorization, completeDriveAuthorization, consumeDriveAuthorization, stageDriveGrantIfCurrent } from "./drive-grant-state.js";

// Internal service only: it does not define an HTTP route. The eventual router
// must enforce Origin, method, content type, no-store and host-only HttpOnly
// cookie policy, and must not return browserSecret or stateHash to scripts.
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const failure = () => new Error("Unable to complete Google Drive authorization.");

export function createDriveAuthCoordinator({ clientId, clientSecret, stateKey, vaultKey, vaultKeyId, identity, storageForUid, resolveVaultKey = async id => id === vaultKeyId ? vaultKey : null, exchange = exchangeDriveAuthorizationCode }) {
  if (!clientId || !clientSecret || !stateKey || !vaultKey || !vaultKeyId || !identity?.firebase || !identity?.google || !storageForUid) throw new Error("Drive authorization configuration is incomplete");
  return {
    async begin(firebaseToken) {
      const { uid } = await identity.firebase(firebaseToken);
      const authorization = await createDriveAuthorization(clientId, { uid, stateKey });
      const stateHash = await oauthHash(authorization.state);
      const browserHash = await oauthHash(authorization.browserSecret);
      const nonceHash = await oauthHash(authorization.nonce);
      const sealedVerifier = await sealDriveCredential(authorization.verifier, { key: vaultKey, keyId: vaultKeyId, uid, accountId: stateHash, purpose: "oauth-pkce" });
      await beginDriveAuthorization(storageForUid(uid), { stateHash, browserHash, nonceHash, sealedVerifier, expiresAt: Date.now() + 299_000 });
      return { authorizationUrl: authorization.url, browserSecret: authorization.browserSecret };
    },
    async callback({ state, browserSecret, code }) {
      if (typeof state !== "string" || !OPAQUE.test(browserSecret || "") || typeof code !== "string" || !code || code.length > 4096) throw failure();
      const { uid } = await openOAuthStateEnvelope(state, stateKey);
      const stateHash = await oauthHash(state), browserHash = await oauthHash(browserSecret);
      const storage = storageForUid(uid);
      const pending = await consumeDriveAuthorization(storage, { stateHash, browserHash });
      if (!pending) throw failure();
      const verifierKey = await resolveVaultKey(pending.sealedVerifier.keyId);
      if (!verifierKey) throw failure();
      const verifier = await openDriveCredential(pending.sealedVerifier, { key: verifierKey, keyId: pending.sealedVerifier.keyId, uid, accountId: stateHash, purpose: "oauth-pkce" });
      const tokens = await exchange({ clientId, clientSecret, code, verifier });
      const google = await identity.google(tokens.idToken, pending.nonceHash);
      const sealedRefreshToken = await sealDriveCredential(JSON.stringify({ refreshToken: tokens.refreshToken, scope: tokens.scope }), { key: vaultKey, keyId: vaultKeyId, uid, accountId: google.accountId, purpose: "drive-refresh" });
      const staged = await stageDriveGrantIfCurrent(storage, { stateHash, expectedEpoch: pending.epoch, expectedGeneration: pending.generation, accountId: google.accountId, sealedRefreshToken });
      if (!staged) throw failure();
      return { stateHash };
    },
    async complete({ firebaseToken, stateHash, browserSecret }) {
      if (!OPAQUE.test(stateHash || "") || !OPAQUE.test(browserSecret || "")) throw failure();
      const { uid } = await identity.firebase(firebaseToken);
      const complete = await completeDriveAuthorization(storageForUid(uid), { stateHash, browserHash: await oauthHash(browserSecret) });
      if (!complete) throw failure();
      return { connected: true };
    },
  };
}
