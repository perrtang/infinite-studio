import test from "node:test";
import assert from "node:assert/strict";
import { beginDriveAuthorization, completeDriveAuthorization, consumeDriveAuthorization, invalidateDriveGrant, pruneExpiredDriveAuthorization, stageDriveGrantIfCurrent } from "./cloudflare/drive-grant-state.js";

function transactionalStorage() {
  const values = new Map();
  let queue = Promise.resolve();
  return { values, transaction(fn) {
    const result = queue.then(() => fn({
      get: async (key) => values.get(key),
      put: async (key, value) => { values.set(key, value); },
      delete: async (key) => { values.delete(key); },
    }));
    queue = result.catch(() => {});
    return result;
  } };
}
const hashA = "A".repeat(43), hashB = "B".repeat(43), browser = "C".repeat(43);
const sealed = { version: 1, keyId: "key-1", iv: "D".repeat(16), ciphertext: "ciphertext" };
const params = (stateHash) => ({ stateHash, browserHash: browser, nonceHash: "N".repeat(43), sealedVerifier: sealed, expiresAt: 100_000 });
const grant = (attempt, stateHash = hashA) => ({ stateHash, expectedEpoch: attempt.epoch, expectedGeneration: attempt.generation, accountId: "google-sub", sealedRefreshToken: sealed });

test("a state can be consumed only once and only by its bound browser", async () => {
  const storage = transactionalStorage();
  await beginDriveAuthorization(storage, params(hashA), 1);
  assert.equal(await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: hashB }, 2), null);
  const results = await Promise.all([1, 2].map(() => consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 2)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.filter(Boolean)[0].generation, 1);
  assert.equal(results.filter(Boolean)[0].nonceHash, "N".repeat(43));
});

test("expired, superseded, and revoked authorization attempts cannot store a grant", async () => {
  const storage = transactionalStorage();
  const first = await beginDriveAuthorization(storage, params(hashA), 1);
  const second = await beginDriveAuthorization(storage, params(hashB), 2);
  assert.equal(await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 3), null);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(first), 3), false);
  const accepted = await consumeDriveAuthorization(storage, { stateHash: hashB, browserHash: browser }, 3);
  assert.deepEqual({ epoch: accepted.epoch, generation: accepted.generation }, second);
  await invalidateDriveGrant(storage);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(accepted, hashB), 4), false);
  assert.equal(storage.values.has("grant"), false);
  const expired = await beginDriveAuthorization(storage, params(hashA), 4);
  assert.equal(await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 100_000), null);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(expired), 100_000), false);
});

test("a grant cannot be stored before consumption, after expiry, or twice", async () => {
  const storage = transactionalStorage();
  const first = await beginDriveAuthorization(storage, params(hashA), 1);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(first), 2), false);
  const accepted = await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 3);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(accepted), 100_000), false);
  const next = await beginDriveAuthorization(storage, params(hashB), 4);
  const consumed = await consumeDriveAuthorization(storage, { stateHash: hashB, browserHash: browser }, 5);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(consumed, hashB), 6), true);
  assert.equal(storage.values.has("grant"), false);
  assert.equal(await completeDriveAuthorization(storage, { stateHash: hashB, browserHash: hashA }, 7), false);
  assert.equal(await completeDriveAuthorization(storage, { stateHash: hashB, browserHash: browser }, 8), true);
  assert.equal(await completeDriveAuthorization(storage, { stateHash: hashB, browserHash: browser }, 9), false);
  assert.equal(await stageDriveGrantIfCurrent(storage, { ...grant(next, hashB), accountId: "different-sub" }, 10), false);
  assert.equal(storage.values.get("grant").accountId, "google-sub");
  assert.equal(storage.values.get("grant").generation, next.generation);
});

test("plaintext tokens and malformed state are rejected", async () => {
  const storage = transactionalStorage();
  await assert.rejects(beginDriveAuthorization(storage, { ...params(hashA), sealedVerifier: "plaintext" }, 1));
  await assert.rejects(beginDriveAuthorization(storage, params("raw-state"), 1));
  await assert.rejects(stageDriveGrantIfCurrent(storage, { ...grant({ epoch: 0, generation: 1 }), sealedRefreshToken: "plaintext" }));
});

test("a staged grant cannot be activated after revocation or expiration", async () => {
  for (const finish of ["revoke", "expire"]) {
    const storage = transactionalStorage();
    await beginDriveAuthorization(storage, params(hashA), 1);
    const attempt = await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 2);
    assert.equal(await stageDriveGrantIfCurrent(storage, grant(attempt), 3), true);
    if (finish === "revoke") await invalidateDriveGrant(storage);
    assert.equal(await completeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, finish === "expire" ? 100_000 : 4), false);
    assert.equal(storage.values.has("grant"), false);
  }
});

test("authorization storage stays bounded and expiry pruning preserves grants", async () => {
  const storage = transactionalStorage();
  const first = await beginDriveAuthorization(storage, params(hashA), 1);
  await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 2);
  assert.equal(await stageDriveGrantIfCurrent(storage, grant(first), 3), true);
  assert.equal(await completeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 3), true);
  await beginDriveAuthorization(storage, params(hashA), 4);
  await beginDriveAuthorization(storage, params(hashB), 5);
  assert.equal(storage.values.has("pending"), true);
  assert.equal(storage.values.size, 3);
  await pruneExpiredDriveAuthorization(storage, 100_000);
  assert.equal(storage.values.has("pending"), false);
  assert.equal(storage.values.has("grant"), true);
});

test("alarm pruning removes expired staged credentials but keeps a completed grant and newer attempts", async () => {
  const storage = transactionalStorage();
  await beginDriveAuthorization(storage, params(hashA), 1);
  const first = await consumeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 2);
  await stageDriveGrantIfCurrent(storage, grant(first), 3);
  await completeDriveAuthorization(storage, { stateHash: hashA, browserHash: browser }, 4);
  await beginDriveAuthorization(storage, params(hashB), 5);
  const second = await consumeDriveAuthorization(storage, { stateHash: hashB, browserHash: browser }, 6);
  await stageDriveGrantIfCurrent(storage, grant(second, hashB), 7);
  await pruneExpiredDriveAuthorization(storage, 99_999);
  assert.equal(storage.values.has("staged"), true);
  await pruneExpiredDriveAuthorization(storage, 100_000);
  assert.equal(storage.values.has("staged"), false);
  assert.equal(storage.values.get("grant").generation, first.generation);
  await beginDriveAuthorization(storage, { ...params(hashA), expiresAt: 200_000 }, 100_001);
  await pruneExpiredDriveAuthorization(storage, 100_002);
  assert.equal(storage.values.has("pending"), true);
});
