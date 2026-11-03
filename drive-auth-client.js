// The server stores the long-lived grant; this client only handles short-lived tokens.
const GOOGLE_AUTHORIZE_ORIGIN = "https://accounts.google.com";
const failure = code => Object.assign(new Error(code), { code });

async function post(path, firebaseToken, fetchImpl) {
  if (!firebaseToken) throw failure("authentication_required");
  let response;
  try {
    response = await fetchImpl(path, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${firebaseToken}` },
      body: "{}", signal: AbortSignal.timeout(15_000),
    });
  } catch { throw failure("unavailable"); }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || "unavailable");
    error.code = payload.error || "unavailable";
    error.status = response.status;
    throw error;
  }
  try { return await response.json(); } catch { throw failure("unavailable"); }
}

export async function restoreDriveGrant(firebaseToken, fetchImpl = fetch) {
  const response = await post("/api/drive/access-token", firebaseToken, fetchImpl);
  if (typeof response.accessToken !== "string" || !response.accessToken || !Number.isSafeInteger(response.expiresAt) || response.expiresAt <= Date.now() + 60_000) throw failure("invalid_token_response");
  return { accessToken: response.accessToken, expiresAt: response.expiresAt - 60_000 };
}

export async function removeDriveGrant(firebaseToken, fetchImpl = fetch) {
  const result = await post("/api/drive/revoke", firebaseToken, fetchImpl);
  if (result?.removed !== true) throw failure("unavailable");
}

export async function connectDriveGrant({ getCredential, popup, browserWindow = window, fetchImpl = fetch, timeoutMs = 180_000 }) {
  if (!popup || popup.closed) throw failure("popup_blocked");
  try {
    const initial = await getCredential();
    if (!initial?.uid || !initial?.token) throw failure("authentication_required");
    const firebaseToken = initial.token;
    const response = await post("/api/drive/connect", firebaseToken, fetchImpl);
    const destination = new URL(response.authorizationUrl);
    if (destination.origin !== GOOGLE_AUTHORIZE_ORIGIN || destination.pathname !== "/o/oauth2/v2/auth") throw failure("invalid_authorization_url");
    await new Promise((resolve, reject) => {
      let timeout, closeCheck;
      const cleanup = () => { browserWindow.removeEventListener("message", onMessage); browserWindow.clearTimeout(timeout); browserWindow.clearInterval(closeCheck); };
      const onMessage = (event) => {
        if (event.origin !== browserWindow.location.origin || event.source !== popup || event.data?.type !== "infinite-studio-drive-oauth" || !["success", "error"].includes(event.data.result)) return;
        cleanup();
        event.data.result === "success" ? resolve() : reject(failure("authorization_failed"));
      };
      browserWindow.addEventListener("message", onMessage);
      timeout = browserWindow.setTimeout(() => { cleanup(); reject(failure("authorization_timeout")); }, timeoutMs);
      closeCheck = browserWindow.setInterval(() => { if (popup.closed) { cleanup(); reject(failure("authorization_cancelled")); } }, 500);
      try { popup.location.replace(destination.href); } catch (error) { cleanup(); reject(error); }
    });
    const current = await getCredential();
    if (!current?.token || current.uid !== initial.uid) throw failure("account_changed");
    await post("/api/drive/complete", current.token, fetchImpl);
    return await restoreDriveGrant(current.token, fetchImpl);
  } finally {
    if (!popup.closed) popup.close();
  }
}
