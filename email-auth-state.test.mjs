import test from "node:test";
import assert from "node:assert/strict";
import {
  MOODBOARD_PENDING_EMAIL_AUTH_KEY,
  assertMoodboardProviderLinkIdentity,
  cleanMoodboardEmailActionUrl,
  createMoodboardEmailActionUrl,
  createPendingMoodboardEmailAuth,
  emailActionContextFromUrl,
  loadPendingMoodboardEmailAuth,
  maskMoodboardEmail,
  moodboardProviderStates,
  normalizeMoodboardEmail,
  savePendingMoodboardEmailAuth,
} from "./email-auth-state.js";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("email addresses are normalized, validated, and safely masked", () => {
  assert.equal(normalizeMoodboardEmail(" Perr@Example.COM "), "perr@example.com");
  assert.equal(maskMoodboardEmail("perr@example.com"), "pe••@example.com");
  assert.throws(() => normalizeMoodboardEmail("not-an-email"), { code: "auth/invalid-email" });
});

test("email action URLs never contain the member email", () => {
  const actionUrl = createMoodboardEmailActionUrl("https://moodboard.petfashion.tw/app?email=remove-me#private", {
    feature: "3d",
    mode: "sign-in",
  });
  assert.equal(new URL(actionUrl).searchParams.get("email"), null);
  assert.equal(new URL(actionUrl).hash, "");
  assert.deepEqual(emailActionContextFromUrl(actionUrl), { feature: "3d", mode: "sign-in" });
});

test("one-time email-link parameters are removed after completion", () => {
  const cleaned = cleanMoodboardEmailActionUrl("https://moodboard.petfashion.tw/?mode=signIn&oobCode=secret&apiKey=public&moodboardAuth=email-link&moodboardFeature=3d&keep=yes");
  const url = new URL(cleaned);
  assert.equal(url.searchParams.get("oobCode"), null);
  assert.equal(url.searchParams.get("moodboardFeature"), null);
  assert.equal(url.searchParams.get("keep"), "yes");
});

test("email sign-in preserves the shared file and its editing context", () => {
  const source = "https://infinite.petfashion.tw/?driveFile=shared_file_123456&resourceKey=resource_123&sharedEdit=1&requestEdit=1";
  const action = createMoodboardEmailActionUrl(source, { feature: "shared-moodboard" });
  const context = emailActionContextFromUrl(action);
  assert.equal(context.feature, "shared-moodboard");
  const pending = createPendingMoodboardEmailAuth({ email: "member@example.com", feature: context.feature });
  assert.equal(pending.feature, "shared-moodboard");
  const clean = new URL(cleanMoodboardEmailActionUrl(`${action}&oobCode=one-time-code`));
  assert.equal(clean.searchParams.get("driveFile"), "shared_file_123456");
  assert.equal(clean.searchParams.get("resourceKey"), "resource_123");
  assert.equal(clean.searchParams.get("sharedEdit"), "1");
  assert.equal(clean.searchParams.get("requestEdit"), "1");
  assert.equal(clean.searchParams.has("oobCode"), false);
});

test("pending email authentication expires and keeps consent separate", () => {
  const storage = createStorage();
  const now = Date.parse("2026-10-18T12:00:00.000Z");
  const request = createPendingMoodboardEmailAuth({
    email: "member@example.com",
    feature: "collaboration",
    rememberSession: true,
    marketingOptIn: false,
    accepted: true,
    now,
  });
  savePendingMoodboardEmailAuth(storage, request);
  assert.equal(loadPendingMoodboardEmailAuth(storage, now + 1000).accepted, true);
  assert.equal(loadPendingMoodboardEmailAuth(storage, now + 60 * 60 * 1000 + 1), null);
  assert.equal(storage.getItem(MOODBOARD_PENDING_EMAIL_AUTH_KEY), null);
});

test("provider linking requires the original UID throughout", () => {
  assert.equal(assertMoodboardProviderLinkIdentity({ currentUid: "member-1", expectedUid: "member-1", resultUid: "member-1" }), true);
  assert.throws(
    () => assertMoodboardProviderLinkIdentity({ currentUid: "member-1", expectedUid: "member-1", resultUid: "member-2" }),
    { code: "auth/provider-link-uid-mismatch" },
  );
});

test("Google and Email are public while Facebook is testable but hidden until live linking passes", () => {
  const states = moodboardProviderStates({ providerIds: ["google.com"] });
  assert.deepEqual(states.map(({ id, public: isPublic, testable, linked }) => [id, isPublic, testable, linked]), [
    ["google.com", true, true, true],
    ["password", true, true, false],
    ["facebook.com", false, true, false],
  ]);
});

test("email linking cannot be prepared without an authenticated account", () => {
  assert.throws(
    () => createPendingMoodboardEmailAuth({ email: "member@example.com", mode: "link" }),
    { code: "auth/requires-recent-login" },
  );
});
