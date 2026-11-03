const KEY = /^[A-Za-z0-9_-]{43}$/;
export function readDriveWorkerConfig(env) {
  if (!env || !KEY.test(env.DRIVE_STATE_KEY || "") || !KEY.test(env.DRIVE_VAULT_KEY || "")
    || !/^[A-Za-z0-9_-]{1,64}$/.test(env.DRIVE_VAULT_KEY_ID || "")
    || typeof env.GOOGLE_OAUTH_CLIENT_ID !== "string" || !env.GOOGLE_OAUTH_CLIENT_ID
    || typeof env.GOOGLE_OAUTH_CLIENT_SECRET !== "string" || !env.GOOGLE_OAUTH_CLIENT_SECRET
    || typeof env.FIREBASE_WEB_API_KEY !== "string" || !env.FIREBASE_WEB_API_KEY) throw new Error("Drive service configuration missing");
  const decoded = Uint8Array.from(atob(env.DRIVE_STATE_KEY.replaceAll("-", "+").replaceAll("_", "/") + "="), char => char.charCodeAt(0));
  if (decoded.length !== 32) throw new Error("Invalid Drive state key");
  let previousKeys = {};
  if (env.DRIVE_VAULT_PREVIOUS_KEYS) {
    try { previousKeys = JSON.parse(env.DRIVE_VAULT_PREVIOUS_KEYS); } catch { throw new Error("Invalid previous vault keys"); }
    if (!previousKeys || typeof previousKeys !== "object" || Array.isArray(previousKeys) || Object.keys(previousKeys).length > 4) throw new Error("Invalid previous vault keys");
    for (const [id, key] of Object.entries(previousKeys)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id === env.DRIVE_VAULT_KEY_ID || !KEY.test(key)) throw new Error("Invalid previous vault keys");
    }
  }
  return { stateKey: decoded, vaultKey: env.DRIVE_VAULT_KEY, vaultKeyId: env.DRIVE_VAULT_KEY_ID, previousKeys, clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET, firebaseApiKey: env.FIREBASE_WEB_API_KEY };
}
