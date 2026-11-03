import test from "node:test";
import assert from "node:assert/strict";
import { createOAuthStateEnvelope, openOAuthStateEnvelope } from "./drive-oauth-state.js";

const key = crypto.getRandomValues(new Uint8Array(32));
const now = Date.now();
test("callback state hides identity and binds a random expiring transaction", async () => {
  const first = await createOAuthStateEnvelope("private-user-id", key, now);
  const second = await createOAuthStateEnvelope("private-user-id", key, now);
  assert.notEqual(first, second);
  assert.equal(first.includes("private-user-id"), false);
  const decoded = await openOAuthStateEnvelope(first, key, now + 1000);
  assert.equal(decoded.uid, "private-user-id");
  assert.notEqual(decoded.transactionId, (await openOAuthStateEnvelope(second, key, now + 1000)).transactionId);
  await assert.rejects(openOAuthStateEnvelope(first, key, now + 301_000));
  await assert.rejects(openOAuthStateEnvelope(first, crypto.getRandomValues(new Uint8Array(32)), now));
  const segments = first.split(".");
  segments[3] = `${segments[3][0] === "A" ? "B" : "A"}${segments[3].slice(1)}`;
  await assert.rejects(openOAuthStateEnvelope(segments.join("."), key, now));
});

test("callback state rejects invalid identities, keys and oversized values", async () => {
  await assert.rejects(createOAuthStateEnvelope("", key, now));
  await assert.rejects(createOAuthStateEnvelope("user", new Uint8Array(16), now));
  await assert.rejects(openOAuthStateEnvelope("A".repeat(3000), key, now));
});
