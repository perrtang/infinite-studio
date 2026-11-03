// Primitives for a future server-side vault. No endpoint or storage binding is
// enabled here. The caller must authenticate the Firebase UID and verify the
// Google OIDC subject (accountId) before use; neither is trusted from a request.
// For OAuth PKCE, bind accountId to the hashed OAuth state instead.
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
// A sealed JSON payload contains both the provider credential and granted
// scope, so allow enough room for the bounded OAuth response plus JSON.
const MAX_TOKEN_BYTES = 16_384;
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function decode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid vault data");
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (char) => char.charCodeAt(0));
}
function binding(uid, accountId, keyId, purpose) {
  if (typeof uid !== "string" || !uid || uid.length > 128 || typeof accountId !== "string" || !accountId || accountId.length > 256 || typeof keyId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || !["drive-refresh", "oauth-pkce"].includes(purpose)) throw new Error("Invalid vault identity");
  return encoder.encode(JSON.stringify(["infinite-studio-drive-vault", 1, purpose, uid, accountId, keyId]));
}
async function importVaultKey(encodedKey) {
  if (typeof encodedKey !== "string" || encodedKey.length !== 43) throw new Error("Vault key must be 256 bits");
  const key = decode(encodedKey);
  if (key.length !== 32) throw new Error("Vault key must be 256 bits");
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function assertVaultKey(encodedKey) { await importVaultKey(encodedKey); }

export async function sealDriveCredential(refreshToken, { key, keyId, uid, accountId, purpose }) {
  if (typeof refreshToken !== "string" || !refreshToken || encoder.encode(refreshToken).length > MAX_TOKEN_BYTES) throw new Error("Invalid credential");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: binding(uid, accountId, keyId, purpose), tagLength: 128 }, await importVaultKey(key), encoder.encode(refreshToken));
  return { version: 1, keyId, iv: encode(iv), ciphertext: encode(new Uint8Array(sealed)) };
}

export async function openDriveCredential(record, { key, keyId, uid, accountId, purpose }) {
  if (record?.version !== 1 || record.keyId !== keyId || typeof record.iv !== "string" || record.iv.length !== 16 || typeof record.ciphertext !== "string" || record.ciphertext.length > 22_000) throw new Error("Invalid vault data");
  const iv = decode(record.iv);
  if (iv.length !== 12) throw new Error("Invalid vault data");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: binding(uid, accountId, keyId, purpose), tagLength: 128 }, await importVaultKey(key), decode(record.ciphertext));
  if (!plain.byteLength || plain.byteLength > MAX_TOKEN_BYTES) throw new Error("Invalid vault data");
  return decoder.decode(plain);
}
