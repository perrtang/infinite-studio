import test from "node:test";
import assert from "node:assert/strict";
import { openDriveCredential, sealDriveCredential } from "./cloudflare/drive-credential-vault.js";

const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const context = { key, keyId: "key-1", uid: "user-a", accountId: "google-oidc-sub-a", purpose: "drive-refresh" };

test("server credential encryption binds identity and uses a fresh nonce", async () => {
  const first = await sealDriveCredential("example-only-refresh-token", context);
  const second = await sealDriveCredential("example-only-refresh-token", context);
  assert.notEqual(first.iv, second.iv);
  assert.equal(JSON.stringify(first).includes("example-only-refresh-token"), false);
  assert.equal(await openDriveCredential(first, context), "example-only-refresh-token");
  await assert.rejects(openDriveCredential(first, { ...context, uid: "user-b" }));
  await assert.rejects(openDriveCredential(first, { ...context, accountId: "drive-account-b" }));
  await assert.rejects(openDriveCredential(first, { ...context, purpose: "oauth-pkce" }));
  await assert.rejects(openDriveCredential(first, { ...context, keyId: "key-2" }));
  await assert.rejects(openDriveCredential({ ...first, keyId: "key-2" }, { ...context, keyId: "key-2" }));
  const damaged = { ...first, ciphertext: `${first.ciphertext[0] === "A" ? "B" : "A"}${first.ciphertext.slice(1)}` };
  await assert.rejects(openDriveCredential(damaged, context));
});

test("invalid key, record and credential fail closed", async () => {
  await assert.rejects(sealDriveCredential("token", { ...context, key: "AAAA" }));
  await assert.rejects(sealDriveCredential("", context));
  await assert.rejects(sealDriveCredential("token", { ...context, uid: "" }));
  await assert.rejects(openDriveCredential({ version: 2, iv: "AA", ciphertext: "AA" }, context));
  const valid = await sealDriveCredential("token", context);
  await assert.rejects(openDriveCredential({ ...valid, iv: "A".repeat(100_000) }, context));
  await assert.rejects(openDriveCredential(valid, { ...context, key: "A".repeat(100_000) }));
  await assert.rejects(openDriveCredential({ ...valid, ciphertext: "A".repeat(100_000) }, context));
  const otherKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  await assert.rejects(openDriveCredential(valid, { ...context, key: otherKey }));
});
