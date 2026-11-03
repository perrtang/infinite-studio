import { openOAuthStateEnvelope } from "./drive-oauth-state.js";
import { createDriveAuthCoordinator } from "./drive-auth-coordinator.js";
import { createDriveRefreshService } from "./drive-refresh-service.js";
import { invalidateDriveGrant } from "./drive-grant-state.js";

// A storage instance belongs to exactly one Firebase UID. Actor methods are
// internal RPC endpoints; the public router authenticates and routes callers.
export function createDriveActor({ uid, storage, identity, clientId, clientSecret, stateKey, vaultKey, vaultKeyId, previousKeys = {}, exchange, refresh, scheduleExpiry = async () => {} }) {
  if (typeof uid !== "string" || !uid || uid.length > 128) throw new Error("Invalid actor identity");
  const storageForUid = requested => {
    if (requested !== uid) throw new Error("Actor identity mismatch");
    return storage;
  };
  const resolveVaultKey = async keyId => keyId === vaultKeyId ? vaultKey : Object.hasOwn(previousKeys, keyId) ? previousKeys[keyId] : null;
  const coordinator = createDriveAuthCoordinator({ identity, clientId, clientSecret, stateKey, vaultKey, vaultKeyId, storageForUid, resolveVaultKey, ...(exchange ? { exchange } : {}) });
  const refreshService = createDriveRefreshService({ storage, uid, clientId, clientSecret, activeKeyId: vaultKeyId, resolveVaultKey, ...(refresh ? { refresh } : {}) });
  return {
    begin: async token => {
      // Schedule before creating a pending transaction, so a crash cannot
      // leave an uncollected sealed credential without a cleanup alarm.
      await scheduleExpiry();
      return coordinator.begin(token);
    },
    callback: args => coordinator.callback(args),
    complete: args => coordinator.complete(args),
    refresh: () => refreshService.refresh(),
    revoke: async () => { await invalidateDriveGrant(storage); return { removed: true }; },
  };
}

// RPC implementations may not preserve custom Error properties across the
// isolate boundary. Return only a small, non-sensitive status envelope.
export function createDriveActorEndpoint(actor) {
  const execute = async (method, args) => {
    try { return { ok: true, value: await actor[method](args) }; }
    catch (error) { return { ok: false, code: error?.code === "authorization_required" ? "authorization_required" : "unavailable" }; }
  };
  return {
    begin: token => execute("begin", token),
    callback: args => execute("callback", args),
    complete: args => execute("complete", args),
    refresh: () => execute("refresh"),
    revoke: () => execute("revoke"),
  };
}

// Only verified Firebase UIDs or authenticated, encrypted OAuth states select
// an actor. No browser-supplied UID is accepted as a routing key.
export function createDriveActorBridge({ identity, stateKey, actorForUid }) {
  if (!identity?.firebase || !(stateKey instanceof Uint8Array) || stateKey.length !== 32 || typeof actorForUid !== "function") throw new Error("Invalid actor bridge configuration");
  const invoke = async (uid, method, argument) => {
    const envelope = await actorForUid(uid)[method](argument);
    if (!envelope || envelope.ok !== true) {
      const error = new Error("Drive authorization is unavailable");
      error.code = envelope?.code === "authorization_required" ? "authorization_required" : "unavailable";
      throw error;
    }
    return envelope.value;
  };
  return {
    coordinator: {
      async begin(token) {
        const { uid } = await identity.firebase(token);
        return invoke(uid, "begin", token);
      },
      async callback(args) {
        const { uid } = await openOAuthStateEnvelope(args.state, stateKey);
        return invoke(uid, "callback", args);
      },
      async complete(args) {
        const { uid } = await identity.firebase(args.firebaseToken);
        return invoke(uid, "complete", args);
      },
    },
    refreshServiceForUid(uid) { return { refresh: () => invoke(uid, "refresh") }; },
    revokeGrantForUid(uid) { return () => invoke(uid, "revoke"); },
  };
}
