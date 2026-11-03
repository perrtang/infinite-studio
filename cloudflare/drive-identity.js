import { createRemoteJWKSet, jwtVerify } from "jose";

// These trust roots are fixed in code; request data must never select a JWKS.
const FIREBASE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const B64URL_HASH = /^[A-Za-z0-9_-]{43}$/;
const nowSeconds = () => Math.floor(Date.now() / 1000);

function checkIdentityTokenSize(token) {
  if (typeof token !== "string" || !token || token.length > 16_384) throw new Error("Invalid identity token");
}
function checkSubjectAndIssuedAt(payload, now) {
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128
    || !Number.isSafeInteger(payload.iat) || payload.iat > now) throw new Error("Invalid identity claims");
}
async function hashNonce(nonce) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function equalHash(a, b) {
  if (!B64URL_HASH.test(a) || !B64URL_HASH.test(b)) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

// Dependency injection is for isolated tests and trusted worker configuration,
// never for data supplied by the browser.
export function createDriveIdentityVerifier({ firebaseProjectId, googleClientId, firebaseKeys = FIREBASE_KEYS, googleKeys = GOOGLE_KEYS, checkFirebaseAccount = null }) {
  if (!firebaseProjectId || !googleClientId) throw new Error("Identity configuration is missing");
  return {
    async firebase(token) {
      checkIdentityTokenSize(token);
      const { payload, protectedHeader } = await jwtVerify(token, firebaseKeys, {
        algorithms: ["RS256"], issuer: `https://securetoken.google.com/${firebaseProjectId}`,
        audience: firebaseProjectId, requiredClaims: ["sub", "iat", "exp", "auth_time"],
      });
      const now = nowSeconds();
      checkSubjectAndIssuedAt(payload, now);
      if (typeof protectedHeader.kid !== "string" || !protectedHeader.kid || payload.aud !== firebaseProjectId || !Number.isSafeInteger(payload.auth_time) || payload.auth_time > now
        || typeof payload.email !== "string" || !payload.email || payload.email_verified !== true || payload.firebase?.tenant !== undefined
        || !["google.com", "password", "facebook.com"].includes(payload.firebase?.sign_in_provider)) throw new Error("Invalid Firebase identity");
      if (checkFirebaseAccount) await checkFirebaseAccount({ token, uid: payload.sub, authTime: payload.auth_time });
      return { uid: payload.sub };
    },
    async google(token, expectedNonceHash) {
      checkIdentityTokenSize(token);
      if (!B64URL_HASH.test(expectedNonceHash || "")) throw new Error("Invalid OAuth transaction");
      const { payload } = await jwtVerify(token, googleKeys, {
        algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: googleClientId, requiredClaims: ["sub", "iat", "exp", "nonce"],
      });
      checkSubjectAndIssuedAt(payload, nowSeconds());
      if (payload.aud !== googleClientId || (payload.azp !== undefined && payload.azp !== googleClientId) || typeof payload.nonce !== "string" || payload.nonce.length > 256
        || !equalHash(await hashNonce(payload.nonce), expectedNonceHash)) throw new Error("Invalid Google identity");
      return { accountId: payload.sub, email: typeof payload.email === "string" && payload.email_verified === true ? payload.email : "" };
    },
  };
}
