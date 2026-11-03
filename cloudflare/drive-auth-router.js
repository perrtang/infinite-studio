// Isolated HTTP adapter. Not attached to the production gateway yet.
const ORIGIN = "https://infinite.petfashion.tw";
const PENDING_COOKIE = "__Host-infinite-drive-pending";
const STAGED_COOKIE = "__Host-infinite-drive-staged";
const OPAQUE = /^[A-Za-z0-9_-]{43}$/;
const BASE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const cookie = (name, value, age = 300) => `${name}=${value}; Max-Age=${age}; Path=/; Secure; HttpOnly; SameSite=Lax`;
const json = (body, status = 200, headers = new Headers()) => {
  for (const [name, value] of Object.entries(BASE_HEADERS)) headers.set(name, value);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
};
const identityFailure = error => error?.code === "identity_unavailable"
  ? json({ error: "unavailable" }, 503)
  : json({ error: "authentication_required" }, 401);
function singleCookie(request, name) {
  const matches = String(request.headers.get("cookie") || "").split(";").map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return "";
  const value = matches[0].slice(name.length + 1);
  return OPAQUE.test(value) ? value : "";
}
function bearer(request) {
  const header = request.headers.get("authorization") || "";
  if (header.length > 16_400) return "";
  return /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header)?.[1] || "";
}
function validPost(request) {
  return request.method === "POST" && request.headers.get("origin") === ORIGIN
    && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") || "");
}
function callbackRedirect(result, stateHash = "") {
  const headers = new Headers({ ...BASE_HEADERS, location: `${ORIGIN}/drive-auth-complete.html?result=${result}` });
  if (stateHash) headers.append("set-cookie", cookie(STAGED_COOKIE, stateHash));
  return new Response(null, { status: 303, headers });
}

export function createDriveAuthRouter({ coordinator, identity, refreshServiceForUid, revokeGrantForUid = null }) {
  if (!coordinator || !identity?.firebase || typeof refreshServiceForUid !== "function") throw new Error("Drive router configuration is incomplete");
  return async function handleDriveAuth(request) {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) return json({ error: "invalid_request" }, 400);
    if (url.pathname === "/api/drive/oauth/callback") {
      if (request.method !== "GET" || url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1) return callbackRedirect("error");
      const browserSecret = singleCookie(request, PENDING_COOKIE);
      if (!browserSecret) return callbackRedirect("error");
      try {
        const result = await coordinator.callback({ state: url.searchParams.get("state"), code: url.searchParams.get("code"), browserSecret });
        if (!OPAQUE.test(result?.stateHash || "")) return callbackRedirect("error");
        return callbackRedirect("success", result.stateHash);
      } catch { return callbackRedirect("error"); }
    }
    if (!["/api/drive/connect", "/api/drive/complete", "/api/drive/access-token", "/api/drive/revoke"].includes(url.pathname)) return json({ error: "not_found" }, 404);
    if (!validPost(request)) return json({ error: "invalid_request" }, 403);
    const firebaseToken = bearer(request);
    if (!firebaseToken) return json({ error: "authentication_required" }, 401);
    let verified;
    try { verified = await identity.firebase(firebaseToken); }
    catch (error) { return identityFailure(error); }
    try {
      if (url.pathname === "/api/drive/revoke") {
        if (typeof revokeGrantForUid !== "function") return json({ error: "unavailable" }, 503);
        await revokeGrantForUid(verified.uid)();
        return json({ removed: true });
      }
      if (url.pathname === "/api/drive/connect") {
        const result = await coordinator.begin(firebaseToken);
        const destination = new URL(result.authorizationUrl);
        if (destination.origin !== "https://accounts.google.com" || destination.pathname !== "/o/oauth2/v2/auth" || !OPAQUE.test(result.browserSecret || "")) throw new Error("Invalid authorization response");
        const headers = new Headers();
        headers.append("set-cookie", cookie(PENDING_COOKIE, result.browserSecret));
        headers.append("set-cookie", cookie(STAGED_COOKIE, "", 0));
        return json({ authorizationUrl: destination.href }, 200, headers);
      }
      if (url.pathname === "/api/drive/complete") {
        const stateHash = singleCookie(request, STAGED_COOKIE), browserSecret = singleCookie(request, PENDING_COOKIE);
        if (!stateHash || !browserSecret) return json({ error: "authorization_required" }, 401);
        await coordinator.complete({ firebaseToken, stateHash, browserSecret });
        const headers = new Headers();
        headers.append("set-cookie", cookie(PENDING_COOKIE, "", 0));
        headers.append("set-cookie", cookie(STAGED_COOKIE, "", 0));
        // A saved grant is not yet proof that a Drive API request succeeds.
        return json({ authorized: true }, 200, headers);
      }
      const result = await refreshServiceForUid(verified.uid).refresh();
      if (typeof result?.accessToken !== "string" || !result.accessToken || result.accessToken.length > 4096 || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= Date.now()) throw new Error("Invalid token response");
      // The provider refresh is asynchronous: an account can be disabled or
      // revoked while it is in flight. Never return the token without a fresh
      // identity check after the refresh finishes.
      try {
        const stillVerified = await identity.firebase(firebaseToken);
        if (stillVerified.uid !== verified.uid) return json({ error: "authentication_required" }, 401);
      } catch (error) { return identityFailure(error); }
      if (result.expiresAt <= Date.now()) return json({ error: "unavailable" }, 503);
      return json({ accessToken: result.accessToken, expiresAt: result.expiresAt });
    } catch (error) {
      const code = error?.code === "authorization_required" ? "authorization_required" : "unavailable";
      return json({ error: code }, code === "authorization_required" ? 401 : 503);
    }
  };
}
