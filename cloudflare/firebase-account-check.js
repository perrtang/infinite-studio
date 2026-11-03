// Firebase's account lookup returns disabled and validSince, allowing the
// signed ID token's auth_time to be checked against session revocation.
export function createFirebaseAccountCheck({ apiKey, fetchImpl = fetch }) {
  if (typeof apiKey !== "string" || !apiKey || apiKey.length > 512) throw new Error("Firebase API key missing");
  return async ({ token, uid, authTime }) => {
    if (typeof token !== "string" || !token || token.length > 16384 || typeof uid !== "string" || !uid || !Number.isSafeInteger(authTime)) throw new Error("Invalid identity");
    const url = new URL("https://identitytoolkit.googleapis.com/v1/accounts:lookup");
    url.searchParams.set("key", apiKey);
    let response, payload;
    try {
      response = await fetchImpl(url.href, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ idToken: token }), redirect: "error", signal: AbortSignal.timeout(10000) });
      if (response.status === 429 || response.status >= 500) throw new Error("identity_unavailable");
      if (!response.ok) throw Object.assign(new Error("invalid_identity"), { code: "invalid_identity" });
      payload = await response.json();
    } catch (error) {
      if (error?.code === "invalid_identity") throw error;
      throw Object.assign(new Error("identity_unavailable"), { code: "identity_unavailable" });
    }
    if (!Array.isArray(payload?.users) || payload.users.length !== 1) throw new Error("Invalid Firebase account");
    const user = payload.users[0];
    const validSince = user?.validSince === undefined ? 0 : Number(user.validSince);
    if (user?.localId !== uid || user.disabled === true || user.emailVerified !== true
      || !Number.isSafeInteger(validSince) || validSince < 0 || authTime < validSince) throw new Error("Firebase session revoked");
    return true;
  };
}
