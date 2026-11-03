// Storage operations for one already-authenticated Firebase UID's Durable
// Object. This module exposes no endpoint and performs no identity validation.
// All OAuth transaction identifiers and browser bindings must be SHA-256
// base64url hashes; never store raw state, cookies, or authorization codes.
// A refresh credential's sealed payload must include the actual validated
// Google scope alongside the refresh token, for refresh responses omitting scope.
const HASH = /^[A-Za-z0-9_-]{43}$/;
const validHash = (value) => typeof value === "string" && HASH.test(value);
const validSealed = (sealed) => sealed?.version === 1 && typeof sealed.keyId === "string"
  && /^[A-Za-z0-9_-]{1,64}$/.test(sealed.keyId) && typeof sealed.iv === "string"
  && /^[A-Za-z0-9_-]{16}$/.test(sealed.iv) && typeof sealed.ciphertext === "string"
  && sealed.ciphertext.length > 0 && sealed.ciphertext.length <= 22_000
  && /^[A-Za-z0-9_-]+$/.test(sealed.ciphertext);
const sameSealed = (a, b) => validSealed(a) && validSealed(b) && a.version === b.version
  && a.keyId === b.keyId && a.iv === b.iv && a.ciphertext === b.ciphertext;
const sameGrant = (a, b) => Boolean(a && b && a.epoch === b.epoch && a.generation === b.generation
  && a.accountId === b.accountId && sameSealed(a.sealedRefreshToken, b.sealedRefreshToken));

export async function beginDriveAuthorization(storage, { stateHash, browserHash, nonceHash, sealedVerifier, expiresAt }, now = Date.now()) {
  if (!validHash(stateHash) || !validHash(browserHash) || !validHash(nonceHash) || !validSealed(sealedVerifier)
    || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 300_000) throw new Error("Invalid authorization transaction");
  return storage.transaction(async (tx) => {
    const current = await tx.get("pending");
    if (current?.stateHash === stateHash) throw new Error("Duplicate authorization transaction");
    const epoch = (await tx.get("epoch")) || 0;
    const generation = ((await tx.get("authorizationGeneration")) || 0) + 1;
    await tx.put("authorizationGeneration", generation);
    await tx.put("pending", { stateHash, browserHash, nonceHash, sealedVerifier, expiresAt, epoch, generation });
    await tx.delete("exchange");
    await tx.delete("staged");
    return { epoch, generation };
  });
}

export async function consumeDriveAuthorization(storage, { stateHash, browserHash }, now = Date.now()) {
  if (!validHash(stateHash) || !validHash(browserHash)) return null;
  return storage.transaction(async (tx) => {
    const pending = await tx.get("pending");
    if (!pending || pending.stateHash !== stateHash) return null;
    if (pending.expiresAt <= now || pending.epoch !== ((await tx.get("epoch")) || 0)
      || pending.generation !== (await tx.get("authorizationGeneration"))) { await tx.delete("pending"); return null; }
    if (pending.browserHash !== browserHash) return null;
    await tx.delete("pending");
    await tx.put("exchange", { stateHash, browserHash, expiresAt: pending.expiresAt, epoch: pending.epoch, generation: pending.generation });
    return { nonceHash: pending.nonceHash, sealedVerifier: pending.sealedVerifier, epoch: pending.epoch, generation: pending.generation };
  });
}

export async function stageDriveGrantIfCurrent(storage, { stateHash, expectedEpoch, expectedGeneration, accountId, sealedRefreshToken }, now = Date.now()) {
  if (!validHash(stateHash) || !Number.isSafeInteger(expectedEpoch) || expectedEpoch < 0 || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1 || typeof accountId !== "string"
    || !accountId || accountId.length > 256 || !validSealed(sealedRefreshToken)) throw new Error("Invalid Drive grant");
  return storage.transaction(async (tx) => {
    const epoch = (await tx.get("epoch")) || 0;
    const receiptKey = "exchange";
    const receipt = await tx.get(receiptKey);
    if (!receipt || receipt.stateHash !== stateHash) return false;
    if (epoch !== expectedEpoch || receipt.epoch !== epoch || receipt.generation !== expectedGeneration
      || expectedGeneration !== (await tx.get("authorizationGeneration")) || receipt.expiresAt <= now) {
      await tx.delete(receiptKey);
      return false;
    }
    await tx.delete(receiptKey);
    await tx.put("staged", { stateHash, browserHash: receipt.browserHash, expiresAt: receipt.expiresAt, generation: expectedGeneration, accountId, sealedRefreshToken, epoch });
    return true;
  });
}

// Caller must first verify a current Firebase identity and select that UID's
// Durable Object. The cookie binds completion to the initiating browser.
export async function completeDriveAuthorization(storage, { stateHash, browserHash }, now = Date.now()) {
  if (!validHash(stateHash) || !validHash(browserHash)) return false;
  return storage.transaction(async (tx) => {
    const stage = await tx.get("staged");
    if (!stage || stage.stateHash !== stateHash || stage.browserHash !== browserHash) return false;
    const epoch = (await tx.get("epoch")) || 0;
    if (stage.expiresAt <= now || stage.epoch !== epoch || stage.generation !== (await tx.get("authorizationGeneration"))) {
      await tx.delete("staged");
      return false;
    }
    await tx.put("grant", { accountId: stage.accountId, sealedRefreshToken: stage.sealedRefreshToken, epoch, generation: stage.generation });
    await tx.delete("staged");
    return true;
  });
}

export async function invalidateDriveGrant(storage) {
  return storage.transaction(async (tx) => {
    const epoch = ((await tx.get("epoch")) || 0) + 1;
    await tx.put("epoch", epoch);
    await tx.delete("grant");
    await tx.delete("pending");
    await tx.delete("exchange");
    await tx.delete("staged");
    return epoch;
  });
}

// Snapshot identity is the CAS guard: a reconnect, revoke, or rotation during
// a network request must prevent the previous token from being returned.
export async function readDriveGrant(storage) {
  return storage.transaction(async (tx) => {
    const grant = await tx.get("grant");
    return grant && grant.epoch === ((await tx.get("epoch")) || 0) ? grant : null;
  });
}

export async function finishDriveRefreshIfCurrent(storage, snapshot, replacement = null) {
  if (replacement !== null && !validSealed(replacement)) throw new Error("Invalid Drive grant");
  return storage.transaction(async (tx) => {
    const current = await tx.get("grant");
    if (!sameGrant(current, snapshot) || current.epoch !== ((await tx.get("epoch")) || 0)) return false;
    if (replacement) await tx.put("grant", { ...current, sealedRefreshToken: replacement });
    return true;
  });
}

export async function invalidateDriveGrantIfCurrent(storage, snapshot) {
  return storage.transaction(async (tx) => {
    const current = await tx.get("grant");
    if (!sameGrant(current, snapshot) || current.epoch !== ((await tx.get("epoch")) || 0)) return false;
    await tx.delete("grant");
    return true;
  });
}

// The Durable Object alarm invokes this after the transaction deadline;
// fixed slots also bound storage when an alarm has not yet fired.
export async function pruneExpiredDriveAuthorization(storage, now = Date.now()) {
  return storage.transaction(async (tx) => {
    for (const key of ["pending", "exchange", "staged"]) {
      const entry = await tx.get(key);
      if (entry && entry.expiresAt <= now) await tx.delete(key);
    }
  });
}
