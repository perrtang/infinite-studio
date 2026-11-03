export const MOODBOARD_PENDING_EMAIL_AUTH_KEY = "infinite-moodboard-pending-email-auth-v1";
export const MOODBOARD_EMAIL_AUTH_TTL_MS = 60 * 60 * 1000;

const ALLOWED_FEATURES = new Set(["account", "collaboration", "shared-moodboard", "3d"]);
const ALLOWED_MODES = new Set(["sign-in", "link"]);

export const MOODBOARD_AUTH_PROVIDERS = Object.freeze([
  Object.freeze({ id: "google.com", label: "Google", enabled: true, public: true, testable: true }),
  Object.freeze({ id: "password", label: "Email 驗證連結", enabled: true, public: true, testable: true }),
  Object.freeze({ id: "facebook.com", label: "Facebook", enabled: false, public: false, testable: true }),
]);

export function normalizeMoodboardEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("請輸入有效的 Email 地址。");
    error.code = "auth/invalid-email";
    throw error;
  }
  return email;
}

export function maskMoodboardEmail(value) {
  const email = normalizeMoodboardEmail(value);
  const [name, domain] = email.split("@");
  const visible = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}

export function normalizeMoodboardAuthFeature(value) {
  return ALLOWED_FEATURES.has(value) ? value : "account";
}

export function normalizeMoodboardEmailAuthMode(value) {
  return ALLOWED_MODES.has(value) ? value : "sign-in";
}

export function createMoodboardEmailActionUrl(href, { feature = "account", mode = "sign-in" } = {}) {
  const url = new URL(href);
  ["mode", "oobCode", "apiKey", "continueUrl", "lang", "tenantId", "email", "moodboardAuth", "moodboardAuthMode", "moodboardFeature"]
    .forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  url.searchParams.set("moodboardAuth", "email-link");
  url.searchParams.set("moodboardAuthMode", normalizeMoodboardEmailAuthMode(mode));
  url.searchParams.set("moodboardFeature", normalizeMoodboardAuthFeature(feature));
  return url.toString();
}

export function cleanMoodboardEmailActionUrl(href) {
  const url = new URL(href);
  ["mode", "oobCode", "apiKey", "continueUrl", "lang", "tenantId", "email", "moodboardAuth", "moodboardAuthMode", "moodboardFeature"]
    .forEach((key) => url.searchParams.delete(key));
  return url.toString();
}

export function emailActionContextFromUrl(href) {
  const url = new URL(href);
  return {
    feature: normalizeMoodboardAuthFeature(url.searchParams.get("moodboardFeature")),
    mode: normalizeMoodboardEmailAuthMode(url.searchParams.get("moodboardAuthMode")),
  };
}

export function createPendingMoodboardEmailAuth({
  email,
  feature = "account",
  mode = "sign-in",
  accountUid = null,
  rememberSession = false,
  marketingOptIn = false,
  accepted = false,
  now = Date.now(),
} = {}) {
  const normalizedMode = normalizeMoodboardEmailAuthMode(mode);
  if (normalizedMode === "link" && !accountUid) {
    const error = new Error("連結登入方式前必須先確認目前帳號。");
    error.code = "auth/requires-recent-login";
    throw error;
  }
  return {
    version: 1,
    email: normalizeMoodboardEmail(email),
    feature: normalizeMoodboardAuthFeature(feature),
    mode: normalizedMode,
    accountUid: normalizedMode === "link" ? String(accountUid) : null,
    rememberSession: rememberSession === true,
    marketingOptIn: marketingOptIn === true,
    accepted: accepted === true,
    requestedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + MOODBOARD_EMAIL_AUTH_TTL_MS).toISOString(),
  };
}

export function savePendingMoodboardEmailAuth(storage, request) {
  storage?.setItem(MOODBOARD_PENDING_EMAIL_AUTH_KEY, JSON.stringify(request));
  return request;
}

export function clearPendingMoodboardEmailAuth(storage) {
  storage?.removeItem?.(MOODBOARD_PENDING_EMAIL_AUTH_KEY);
}

export function loadPendingMoodboardEmailAuth(storage, now = Date.now()) {
  try {
    const parsed = JSON.parse(storage?.getItem(MOODBOARD_PENDING_EMAIL_AUTH_KEY) || "null");
    if (!parsed || parsed.version !== 1 || Date.parse(parsed.expiresAt) <= now) {
      clearPendingMoodboardEmailAuth(storage);
      return null;
    }
    const request = createPendingMoodboardEmailAuth({
      ...parsed,
      now: Date.parse(parsed.requestedAt),
    });
    if (request.expiresAt !== parsed.expiresAt) return null;
    return request;
  } catch {
    clearPendingMoodboardEmailAuth(storage);
    return null;
  }
}

export function assertMoodboardProviderLinkIdentity({ currentUid, expectedUid, resultUid } = {}) {
  if (!currentUid || !expectedUid || !resultUid || currentUid !== expectedUid || resultUid !== expectedUid) {
    const error = new Error("登入方式沒有連結到原本的 PETFASHION 帳號，已停止處理。");
    error.code = "auth/provider-link-uid-mismatch";
    throw error;
  }
  return true;
}

export function moodboardProviderStates(user) {
  const linked = new Set(Array.isArray(user?.providerIds) ? user.providerIds : []);
  return MOODBOARD_AUTH_PROVIDERS.map((provider) => ({
    ...provider,
    linked: linked.has(provider.id),
  }));
}
