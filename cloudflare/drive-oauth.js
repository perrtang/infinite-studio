import { createOAuthStateEnvelope } from "./drive-oauth-state.js";

// Server-only OAuth protocol primitives. No routes or credentials are enabled.
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_URI = "https://infinite.petfashion.tw/api/drive/oauth/callback";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const ALLOWED_SCOPES = new Set(["openid", "email", "https://www.googleapis.com/auth/userinfo.email", DRIVE_SCOPE]);
const encoder = new TextEncoder();
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const randomSecret = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function oauthHash(value) { return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }

export class DriveOAuthError extends Error {
  constructor(code) { super("Google Drive authorization could not be completed."); this.name = "DriveOAuthError"; this.code = code; }
}
function validString(value, max = 4096) { return typeof value === "string" && value.length > 0 && value.length <= max; }
function scopesAreAllowed(scope) {
  if (typeof scope !== "string" || scope.length > 4096) return false;
  const scopes = scope.split(/\s+/).filter(Boolean);
  return scopes.includes(DRIVE_SCOPE) && scopes.every((value) => ALLOWED_SCOPES.has(value));
}
function normalizeResponse(body, { isRefresh, previousScope = "", now = Date.now() }) {
  if (!body || typeof body !== "object" || Array.isArray(body)
    || (body.scope !== undefined && !validString(body.scope))
    || (body.id_token !== undefined && !validString(body.id_token, 16_384))) throw new DriveOAuthError("invalid_response");
  const scope = body.scope || (isRefresh ? previousScope : "");
  const lifetime = body.expires_in;
  if (!validString(body.access_token) || typeof body.token_type !== "string" || body.token_type.toLowerCase() !== "bearer"
    || !Number.isInteger(lifetime) || lifetime <= 60 || lifetime > 86_400 || !scopesAreAllowed(scope)
    || (!isRefresh && (!validString(body.refresh_token) || !validString(body.id_token, 16_384)))
    || (body.refresh_token !== undefined && !validString(body.refresh_token))) throw new DriveOAuthError("invalid_response");
  return { accessToken: body.access_token, refreshToken: body.refresh_token || "", idToken: body.id_token || "", scope, expiresAt: now + (lifetime - 60) * 1000 };
}
async function tokenRequest(fields, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
      body: new URLSearchParams(fields), signal, redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) throw new DriveOAuthError("provider_error");
    let body;
    try { body = await response.json(); } catch { throw new DriveOAuthError(signal.aborted ? "network_error" : "invalid_response"); }
    if (!response.ok) throw new DriveOAuthError(body?.error === "invalid_grant" ? "invalid_grant" : "provider_error");
    return body;
  } catch (error) {
    if (error instanceof DriveOAuthError) throw error;
    throw new DriveOAuthError("network_error");
  }
}

export async function createDriveAuthorization(clientId, { uid, stateKey } = {}) {
  if (!validString(clientId, 512)) throw new DriveOAuthError("configuration");
  const state = await createOAuthStateEnvelope(uid, stateKey);
  const nonce = randomSecret(), verifier = randomSecret(), browserSecret = randomSecret();
  const challenge = await oauthHash(verifier);
  const url = new URL(AUTHORIZE_URL);
  for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: REDIRECT_URI, response_type: "code", scope: `openid email ${DRIVE_SCOPE}`, access_type: "offline", include_granted_scopes: "false", prompt: "consent", state, nonce, code_challenge: challenge, code_challenge_method: "S256" })) url.searchParams.set(key, value);
  return { url: url.href, state, nonce, verifier, browserSecret };
}

export async function exchangeDriveAuthorizationCode({ clientId, clientSecret, code, verifier }, options = {}) {
  if (![clientId, clientSecret, code].every((value) => validString(value)) || typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new DriveOAuthError("configuration");
  const body = await tokenRequest({ client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }, options);
  return normalizeResponse(body, { isRefresh: false });
}

export async function refreshDriveAuthorization({ clientId, clientSecret, refreshToken, previousScope }, options = {}) {
  if (![clientId, clientSecret, refreshToken].every((value) => validString(value)) || !scopesAreAllowed(previousScope)) throw new DriveOAuthError("configuration");
  const body = await tokenRequest({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }, options);
  return normalizeResponse(body, { isRefresh: true, previousScope });
}
