import { EncryptJWT, jwtDecrypt } from "jose";

// A state envelope only routes a callback to the Firebase UID's Durable
// Object. The object must still check the state hash and browser-cookie hash,
// consume the transaction exactly once, and verify the Google nonce.
const ISSUER = "infinite-studio-drive-oauth";
const AUDIENCE = "infinite-studio-drive-callback";
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const validUid = (uid) => typeof uid === "string" && uid.length > 0 && uid.length <= 128;
const validKey = (key) => key instanceof Uint8Array && key.length === 32;

export async function createOAuthStateEnvelope(uid, key, now = Date.now()) {
  if (!validUid(uid) || !validKey(key) || !Number.isSafeInteger(now)) throw new Error("Invalid OAuth state configuration");
  const issuedAt = Math.floor(now / 1000);
  const transactionId = encode(crypto.getRandomValues(new Uint8Array(32)));
  const state = await new EncryptJWT({ uid, transactionId })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt(issuedAt).setExpirationTime(issuedAt + 300)
    .encrypt(key);
  return state;
}

export async function openOAuthStateEnvelope(state, key, now = Date.now()) {
  if (typeof state !== "string" || !state || state.length > 2048 || !validKey(key) || !Number.isSafeInteger(now)) throw new Error("Invalid OAuth state");
  const { payload } = await jwtDecrypt(state, key, {
    issuer: ISSUER, audience: AUDIENCE, keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"], requiredClaims: ["iat", "exp"], currentDate: new Date(now),
  });
  const current = Math.floor(now / 1000);
  if (!validUid(payload.uid) || typeof payload.transactionId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(payload.transactionId)
    || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat > current
    || payload.exp > payload.iat + 300 || payload.aud !== AUDIENCE) throw new Error("Invalid OAuth state");
  return { uid: payload.uid, transactionId: payload.transactionId };
}
