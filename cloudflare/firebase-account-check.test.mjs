import test from "node:test";
import assert from "node:assert/strict";
import { createFirebaseAccountCheck } from "./firebase-account-check.js";

const input = { token: "fixture-token", uid: "user-a", authTime: 100 };
const check = (body, ok = true) => createFirebaseAccountCheck({ apiKey: "fixture-key", fetchImpl: async (url, options) => {
  assert.equal(new URL(url).origin, "https://identitytoolkit.googleapis.com");
  assert.equal(JSON.parse(options.body).idToken, input.token);
  assert.equal(options.redirect, "manual");
  return { ok, json: async () => body };
} });

test("Firebase account must match the token, remain enabled, and precede no revocation", async () => {
  assert.equal(await check({ users: [{ localId: "user-a", emailVerified: true, validSince: "100" }] })(input), true);
  assert.equal(await check({ users: [{ localId: "user-a", emailVerified: true }] })(input), true);
  for (const user of [
    { localId: "user-b", emailVerified: true },
    { localId: "user-a", emailVerified: true, disabled: true },
    { localId: "user-a", emailVerified: false },
    { localId: "user-a", emailVerified: true, validSince: "101" },
    { localId: "user-a", emailVerified: true, validSince: "bad" },
  ]) await assert.rejects(check({ users: [user] })(input));
  await assert.rejects(check({ users: [] })(input));
  await assert.rejects(check({}, false)(input));
});

test("temporary Firebase failure stays distinct from an invalid identity", async () => {
  const unavailable = createFirebaseAccountCheck({ apiKey: "fixture", fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(unavailable(input), { code: "identity_unavailable" });
  const invalid = createFirebaseAccountCheck({ apiKey: "fixture", fetchImpl: async () => ({ ok: false, status: 400 }) });
  await assert.rejects(invalid(input), { code: "invalid_identity" });
  const redirect = createFirebaseAccountCheck({ apiKey: "fixture", fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://example.com" } }) });
  await assert.rejects(redirect(input), { code: "identity_unavailable" });
});
