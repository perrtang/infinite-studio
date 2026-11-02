export const MOODBOARD_ACCESS_CONSENT_VERSION = "2026-10-18-v2";
export const MOODBOARD_MARKETING_CONSENT_VERSION = "2026-10-18-v1";
export const MOODBOARD_ACCESS_CONSENT_STORAGE_KEY = "infinite-moodboard-account-consent-v2";
export const MOODBOARD_PRODUCT_ID = "infinite-moodboard";
export const MOODBOARD_MARKETING_TOPIC = "infinite-moodboard-product-updates";
export const MOODBOARD_ALLOWED_AUTH_PROVIDERS = Object.freeze(["google.com", "password", "facebook.com"]);

export const PETFASHION_ACCOUNT_URL = "https://petfashion.tw/account";
export const PETFASHION_PRIVACY_URL = "https://petfashion.tw/privacy";
export const PETFASHION_TERMS_URL = "https://petfashion.tw/terms";

export function isMoodboardIdentityEligible(user) {
  if (!user?.uid || !user?.email || user.emailVerified !== true) return false;
  const providers = Array.isArray(user.providerIds) ? user.providerIds : [];
  return providers.some((provider) => MOODBOARD_ALLOWED_AUTH_PROVIDERS.includes(provider));
}

function readReceipts(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(MOODBOARD_ACCESS_CONSENT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function hasMoodboardAccessConsent(storage, uid) {
  if (!uid) return false;
  const receipt = readReceipts(storage)[uid];
  return Boolean(receipt && receipt.version === MOODBOARD_ACCESS_CONSENT_VERSION);
}

export function getMoodboardAccessReceipt(storage, uid) {
  if (!uid) return null;
  const receipt = readReceipts(storage)[uid];
  return receipt && receipt.version === MOODBOARD_ACCESS_CONSENT_VERSION ? receipt : null;
}

function normalizeFeature(feature) {
  return ["account", "collaboration", "3d"].includes(feature) ? feature : "account";
}

function accessOptions(value) {
  if (typeof value === "string") return { acceptedAt: value };
  return value && typeof value === "object" ? value : {};
}

export function saveMoodboardAccessConsent(storage, user, value = {}) {
  if (!user?.uid) throw new Error("找不到可記錄授權的帳號。");
  const options = accessOptions(value);
  const acceptedAt = options.acceptedAt || new Date().toISOString();
  const feature = normalizeFeature(options.feature);
  const receipts = readReceipts(storage);
  const previous = receipts[user.uid];
  const previousActivation = previous?.productActivation;
  const isNewUser = options.isNewUser === true;
  receipts[user.uid] = {
    version: MOODBOARD_ACCESS_CONSENT_VERSION,
    acceptedAt,
    provider: Array.isArray(user.providerIds) && user.providerIds.length ? user.providerIds[0] : "google.com",
    fields: ["displayName", "photoURL", "email"],
    moodboardUpload: false,
    authPersistence: options.rememberSession === true ? "local" : "session",
    productActivation: {
      productId: MOODBOARD_PRODUCT_ID,
      source: MOODBOARD_PRODUCT_ID,
      reason: `advanced-feature:${feature}`,
      feature,
      firstActivatedAt: previousActivation?.firstActivatedAt || acceptedAt,
      lastActivatedAt: acceptedAt,
      accountRelationship: previousActivation?.accountRelationship || (isNewUser ? "created-through-product" : "existing-member"),
      firstJoinSource: previousActivation?.firstJoinSource ?? (isNewUser ? MOODBOARD_PRODUCT_ID : null),
      preserveOriginalJoinSource: previousActivation?.preserveOriginalJoinSource ?? !isNewUser,
    },
    marketing: {
      enabled: options.marketingOptIn === true,
      channel: "email",
      topic: MOODBOARD_MARKETING_TOPIC,
      version: MOODBOARD_MARKETING_CONSENT_VERSION,
      decidedAt: acceptedAt,
    },
    backendSync: {
      status: "pending",
      updatedAt: acceptedAt,
    },
  };
  storage?.setItem(MOODBOARD_ACCESS_CONSENT_STORAGE_KEY, JSON.stringify(receipts));
  return receipts[user.uid];
}

export function saveMoodboardMarketingPreference(storage, user, enabled, changedAt = new Date().toISOString()) {
  if (!user?.uid) throw new Error("找不到可更新偏好的帳號。");
  const receipts = readReceipts(storage);
  const current = receipts[user.uid];
  if (!current || current.version !== MOODBOARD_ACCESS_CONSENT_VERSION) {
    throw new Error("請先完成 Infinite Studio 帳號授權。");
  }
  const next = {
    ...current,
    marketing: {
      enabled: enabled === true,
      channel: "email",
      topic: MOODBOARD_MARKETING_TOPIC,
      version: MOODBOARD_MARKETING_CONSENT_VERSION,
      decidedAt: changedAt,
    },
    backendSync: {
      status: "pending",
      updatedAt: changedAt,
    },
  };
  receipts[user.uid] = next;
  storage?.setItem(MOODBOARD_ACCESS_CONSENT_STORAGE_KEY, JSON.stringify(receipts));
  return next;
}

export function moodboardMembershipActivationPayload(user, receipt) {
  if (!user?.uid || !receipt || receipt.version !== MOODBOARD_ACCESS_CONSENT_VERSION) {
    throw new Error("會員啟用資料不完整。");
  }
  return {
    uid: user.uid,
    productId: MOODBOARD_PRODUCT_ID,
    consentVersion: receipt.version,
    consentAcceptedAt: receipt.acceptedAt,
    accountRelationship: receipt.productActivation.accountRelationship,
    claimedFirstJoinSource: receipt.productActivation.firstJoinSource,
    activationSource: receipt.productActivation.source,
    activationReason: receipt.productActivation.reason,
    activationFeature: receipt.productActivation.feature,
    firstActivatedAt: receipt.productActivation.firstActivatedAt,
    lastActivatedAt: receipt.productActivation.lastActivatedAt,
    preserveOriginalJoinSource: receipt.productActivation.preserveOriginalJoinSource,
    marketing: { ...receipt.marketing },
  };
}

export function moodboardAuthErrorMessage(error, online = true) {
  if (!online) return "目前沒有網路連線。已登入過的裝置仍可離線工作；首次登入請先連線。";
  const code = String(error?.code || "");
  const messages = {
    "auth/popup-blocked": "瀏覽器阻擋了 Google 登入視窗。請允許彈出式視窗後再試一次。",
    "auth/popup-closed-by-user": "Google 登入視窗已關閉，尚未完成登入。",
    "auth/cancelled-popup-request": "另一個登入視窗仍在處理中，請完成或關閉後再試。",
    "auth/unauthorized-domain": "這個網址尚未獲准使用 PETFASHION 登入。",
    "auth/operation-not-allowed": "PETFASHION 尚未啟用這個登入方式。",
    "auth/network-request-failed": "登入服務暫時無法連線，請確認網路後再試。",
    "auth/too-many-requests": "登入嘗試過於頻繁，請稍後再試。",
    "auth/invalid-email": "請輸入有效的 Email 地址。",
    "auth/missing-email": "請輸入收到驗證連結的 Email 地址。",
    "auth/invalid-action-code": "這個 Email 驗證連結無效或已使用，請重新寄送。",
    "auth/expired-action-code": "這個 Email 驗證連結已過期，請重新寄送。",
    "auth/email-link-account-mismatch": "輸入的 Email 與驗證連結不符，請確認後再試。",
    "auth/missing-link-state": "找不到原本的帳號連結工作階段，請回到設定重新寄送。",
    "auth/link-email-mismatch": "Email 登入只能連結目前已驗證的帳號地址。",
    "auth/email-already-in-use": "這個 Email 已屬於另一個 PETFASHION 帳號，無法自動合併。請先用該 Email 登入。",
    "auth/credential-already-in-use": "這個登入方式已屬於另一個 PETFASHION 帳號，無法自動合併。",
    "auth/account-exists-with-different-credential": "這個 Email 已有 PETFASHION 帳號。請先使用原本方式登入，再到設定連結新的登入方式。",
    "auth/provider-already-linked": "這個登入方式已經連結目前帳號。",
    "auth/requires-recent-login": "為了保護帳號，請重新登入後再連結登入方式。",
    "auth/provider-link-uid-mismatch": "登入方式沒有連結到原本帳號，已停止處理；原工作檔不受影響。",
    "auth/unverified-email": "這個帳號的 Email 尚未完成驗證，暫時不能使用進階功能。",
    "auth/provider-not-allowed": "這個登入方式尚未獲准用於 Infinite Studio。",
  };
  return messages[code] || error?.message || "登入未完成，請稍後再試。";
}

export function accountProviderLabel(user) {
  const providers = new Set(Array.isArray(user?.providerIds) ? user.providerIds : []);
  if (providers.has("google.com") && providers.has("password")) return "Google＋Email 驗證";
  if (providers.has("google.com")) return "Google 登入";
  if (providers.has("password")) return "Email 驗證登入";
  if (providers.has("facebook.com")) return "Facebook 登入";
  return "PETFASHION 帳號";
}

export function accountDisplayName(user) {
  return String(user?.displayName || user?.email || "PETFASHION 帳號").trim();
}

export function accountInitials(user) {
  const name = accountDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  return [...name].slice(0, 2).join("").toUpperCase();
}
