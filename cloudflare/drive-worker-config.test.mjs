import test from "node:test";
import assert from "node:assert/strict";
import { readDriveWorkerConfig } from "./drive-worker-config.js";
const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const config = { DRIVE_STATE_KEY: key, DRIVE_VAULT_KEY: key, DRIVE_VAULT_KEY_ID: "v1", GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret", FIREBASE_WEB_API_KEY: "firebase-key" };
test("worker config decodes the state key and rejects missing cryptographic settings", () => {
  assert.equal(readDriveWorkerConfig(config).stateKey.length, 32);
  for (const field of Object.keys(config)) assert.throws(() => readDriveWorkerConfig({ ...config, [field]: "" }));
  assert.throws(() => readDriveWorkerConfig({ ...config, DRIVE_STATE_KEY: "bad" }));
});
test("previous vault keys remain available for safe grant migration", () => {
  const result = readDriveWorkerConfig({ ...config, DRIVE_VAULT_PREVIOUS_KEYS: JSON.stringify({ old: key }) });
  assert.equal(result.previousKeys.old, key);
  for (const invalid of ["bad", "[]", JSON.stringify({ v1: key }), JSON.stringify({ old: "short" })]) {
    assert.throws(() => readDriveWorkerConfig({ ...config, DRIVE_VAULT_PREVIOUS_KEYS: invalid }));
  }
});
