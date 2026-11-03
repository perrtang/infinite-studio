import { assertVaultKey, openDriveCredential, sealDriveCredential } from "./drive-credential-vault.js";
import { finishDriveRefreshIfCurrent, invalidateDriveGrantIfCurrent, readDriveGrant } from "./drive-grant-state.js";
import { refreshDriveAuthorization } from "./drive-oauth.js";

export class DriveSessionError extends Error {
  constructor(code) { super("Google Drive authorization is unavailable."); this.name = "DriveSessionError"; this.code = code; }
}

// One manager per verified Firebase UID's Durable Object. Its caller must
// authenticate every request before entering this object. Only the returned
// short-lived access token may leave the server; refresh credentials stay here.
export function createDriveRefreshService({ storage, uid, clientId, clientSecret, activeKeyId, resolveVaultKey, refresh = refreshDriveAuthorization }) {
  if (!storage || !uid || !clientId || !clientSecret || !/^[A-Za-z0-9_-]{1,64}$/.test(activeKeyId || "") || typeof resolveVaultKey !== "function") throw new Error("Drive session configuration is incomplete");
  let inFlight = null;
  let pendingPersistence = null;
  async function persistPending() {
    const pending = pendingPersistence;
    let completed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const current = await finishDriveRefreshIfCurrent(storage, pending.snapshot, pending.replacement);
        if (!current) { pendingPersistence = null; throw new DriveSessionError("superseded"); }
        completed = true;
        break;
      } catch (error) {
        if (error instanceof DriveSessionError) throw error;
      }
    }
    if (!completed) throw new DriveSessionError("storage_error");
    pendingPersistence = null;
    if (pending.result.expiresAt <= Date.now() + 1000) throw new DriveSessionError("access_token_expired");
    return pending.result;
  }
  async function perform() {
    if (pendingPersistence) {
      return persistPending();
    }
    const snapshot = await readDriveGrant(storage);
    if (!snapshot) throw new DriveSessionError("authorization_required");
    const oldKey = await resolveVaultKey(snapshot.sealedRefreshToken.keyId);
    if (!oldKey) throw new DriveSessionError("vault_key_unavailable");
    let credential;
    try {
      credential = JSON.parse(await openDriveCredential(snapshot.sealedRefreshToken, { key: oldKey, keyId: snapshot.sealedRefreshToken.keyId, uid, accountId: snapshot.accountId, purpose: "drive-refresh" }));
    } catch { throw new DriveSessionError("vault_error"); }
    if (!credential || typeof credential.refreshToken !== "string" || !credential.refreshToken || typeof credential.scope !== "string") throw new DriveSessionError("vault_error");
    // Google may rotate the refresh credential. Verify the destination key
    // before the network call so a configuration error cannot lose it.
    const activeKey = await resolveVaultKey(activeKeyId);
    try { await assertVaultKey(activeKey); } catch { throw new DriveSessionError("vault_key_unavailable"); }
    let result;
    try {
      result = await refresh({ clientId, clientSecret, refreshToken: credential.refreshToken, previousScope: credential.scope });
    } catch (error) {
      if (error?.code === "invalid_grant") {
        const removed = await invalidateDriveGrantIfCurrent(storage, snapshot);
        throw new DriveSessionError(removed ? "authorization_required" : "superseded");
      }
      throw new DriveSessionError(error?.code === "network_error" ? "network_error" : "provider_error");
    }
    // Re-seal on rotation or key change, preserving only the validated scope.
    let replacement = null;
    if (result.refreshToken || result.scope !== credential.scope || snapshot.sealedRefreshToken.keyId !== activeKeyId) {
      replacement = await sealDriveCredential(JSON.stringify({ refreshToken: result.refreshToken || credential.refreshToken, scope: result.scope }), { key: activeKey, keyId: activeKeyId, uid, accountId: snapshot.accountId, purpose: "drive-refresh" });
    }
    pendingPersistence = { snapshot, replacement, result: { accessToken: result.accessToken, expiresAt: result.expiresAt } };
    return persistPending();
  }
  return {
    refresh() {
      if (inFlight) return inFlight;
      const request = perform();
      inFlight = request;
      request.finally(() => { if (inFlight === request) inFlight = null; }).catch(() => {});
      return request;
    },
  };
}
