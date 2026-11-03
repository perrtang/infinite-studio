import test from "node:test";
import assert from "node:assert/strict";
import { createDriveAuthorization, DriveOAuthError, exchangeDriveAuthorizationCode, oauthHash, refreshDriveAuthorization } from "./drive-oauth.js";
import { openOAuthStateEnvelope } from "./drive-oauth-state.js";

const scope = "openid email https://www.googleapis.com/auth/drive.file";
const success = { access_token: "access", refresh_token: "refresh", id_token: "identity", scope, token_type: "Bearer", expires_in: 3600 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("authorization uses random state, nonce, browser binding and S256 PKCE with fixed redirect and scope", async () => {
  const stateKey = crypto.getRandomValues(new Uint8Array(32));
  const one = await createDriveAuthorization("client", { uid: "verified-user", stateKey }), two = await createDriveAuthorization("client", { uid: "verified-user", stateKey });
  const url = new URL(one.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://infinite.petfashion.tw/api/drive/oauth/callback");
  assert.equal(url.searchParams.get("code_challenge"), await oauthHash(one.verifier));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), scope);
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.get("nonce"), one.nonce);
  assert.equal(url.searchParams.get("state"), one.state);
  assert.equal((await openOAuthStateEnvelope(one.state, stateKey)).uid, "verified-user");
  assert.notEqual(one.state, two.state);
  assert.notEqual(one.browserSecret, two.browserSecret);
  assert.equal(one.url.includes(one.browserSecret), false);
  assert.equal(one.url.includes(one.verifier), false);
});

test("code exchange contacts only Google and rejects missing credentials and broad scopes", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(options.redirect, "manual");
    assert.equal(options.body.get("grant_type"), "authorization_code");
    assert.equal(options.body.get("code_verifier"), "v".repeat(43));
    return json(success);
  };
  const input = { clientId: "client", clientSecret: "secret", code: "code", verifier: "v".repeat(43) };
  assert.equal((await exchangeDriveAuthorizationCode(input, { fetchImpl })).refreshToken, "refresh");
  for (const body of [null, { ...success, expires_in: 60 }, { ...success, expires_in: "3600" }, { ...success, token_type: 123 }, { ...success, refresh_token: "" }, { ...success, id_token: "" }, { ...success, scope: `${scope} https://www.googleapis.com/auth/drive` }, { ...success, scope: `${scope} https://www.googleapis.com/auth/gmail.readonly` }]) {
    await assert.rejects(exchangeDriveAuthorizationCode(input, { fetchImpl: async () => json(body) }), { code: "invalid_response" });
  }
  await assert.rejects(exchangeDriveAuthorizationCode({ ...input, verifier: "short" }, { fetchImpl }), { code: "configuration" });
  await assert.rejects(exchangeDriveAuthorizationCode(input, { fetchImpl: async () => new Response("invalid json") }), { code: "invalid_response" });
  await assert.rejects(exchangeDriveAuthorizationCode(input, { fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://example.com" } }) }), { code: "provider_error" });
});

test("refresh handles omitted scope and invalid_grant without disclosing secrets", async () => {
  const input = { clientId: "client", clientSecret: "secret", refreshToken: "private-refresh", previousScope: scope };
  const result = await refreshDriveAuthorization(input, { fetchImpl: async () => json({ access_token: "next", token_type: "Bearer", expires_in: 3600 }) });
  assert.equal(result.scope, scope);
  assert.equal(result.accessToken, "next");
  await assert.rejects(refreshDriveAuthorization(input, { fetchImpl: async () => json({ access_token: "next", token_type: "Bearer", expires_in: 3600, id_token: 123 }) }), { code: "invalid_response" });
  await assert.rejects(refreshDriveAuthorization(input, { fetchImpl: async () => json({ error: "invalid_grant", error_description: "private-refresh" }, 400) }), (error) => error instanceof DriveOAuthError && error.code === "invalid_grant" && !error.message.includes("private-refresh"));
  await assert.rejects(refreshDriveAuthorization(input, { fetchImpl: async () => { throw new Error("private-refresh"); } }), { code: "network_error" });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(refreshDriveAuthorization(input, { timeoutMs: 10, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason))) }), { code: "network_error" });
    await assert.rejects(refreshDriveAuthorization(input, { timeoutMs: 10, fetchImpl: async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason))) }) }), { code: "network_error" });
  } finally { clearTimeout(keepAlive); }
});
