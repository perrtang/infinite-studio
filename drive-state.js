const runtimeEnv = import.meta.env || {};

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_FOLDER_NAME = "Infinite Moodboard";
export const GOOGLE_DRIVE_CLIENT_ID = runtimeEnv.VITE_GOOGLE_DRIVE_CLIENT_ID
  || "1068479226042-u90bs7m2d64p0q7r9ip53uca2ir3la50.apps.googleusercontent.com";
export const DRIVE_STATE_STORAGE_KEY = "infinite-moodboard-drive-state-v1";
export const DRIVE_FILE_MIME_TYPE = "application/json";

export class DriveApiError extends Error {
  constructor(message, { code = "drive/unknown", status = 0, reason = "", details = null } = {}) {
    super(message);
    this.name = "DriveApiError";
    this.code = code;
    this.status = status;
    this.reason = reason;
    this.details = details;
  }
}

export class DriveConflictError extends DriveApiError {
  constructor(remoteFile) {
    super("Google Drive 上已有較新的版本。", {
      code: "drive/conflict",
      status: 409,
      reason: "versionConflict",
      details: remoteFile,
    });
    this.name = "DriveConflictError";
    this.remoteFile = remoteFile;
  }
}

export function isGoogleDriveConfigured() {
  return Boolean(GOOGLE_DRIVE_CLIENT_ID);
}

export function isGoogleDriveTokenUsable(token, now = Date.now()) {
  return Boolean(token?.accessToken && Number(token.expiresAt) > now);
}

export function googleDriveTokenFromOAuthAccessToken(accessToken, now = Date.now()) {
  const normalizedAccessToken = String(accessToken || "").trim();
  if (!normalizedAccessToken) return null;
  return {
    accessToken: normalizedAccessToken,
    // Google access tokens normally last one hour. Keep a conservative in-memory
    // window because Firebase does not expose the exact expiry for this credential.
    expiresAt: Number(now) + 50 * 60 * 1000,
    scope: GOOGLE_DRIVE_SCOPE,
  };
}

export function isGoogleDriveAuthorizationError(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  return error?.code === "drive/authorization"
    || error?.code === "drive/permission"
    || ["authorization_required", "authentication_required"].includes(error?.code)
    || error?.status === 401
    || ["authError", "invalidCredentials", "insufficientPermissions"].includes(reason);
}

export function driveReconnectFailure(error) {
  const authorizationRequired = isGoogleDriveAuthorizationError(error);
  return {
    status: authorizationRequired ? "authorization-required" : error?.code === "drive/offline" ? "offline" : "error",
    connected: false,
    busy: false,
    message: authorizationRequired
      ? "無法在背景恢復 Google Drive；請重新連結，並確認本機備份狀態。"
      : driveErrorMessage(error),
  };
}

export function isGoogleDriveRetryableError(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  const status = Number(error?.status || 0);
  if (isGoogleDriveAuthorizationError(error)) return false;
  if (["drive/offline", "drive/timeout", "drive/network"].includes(error?.code)) return true;
  if (["rateLimitExceeded", "userRateLimitExceeded", "backendError"].includes(reason)) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function serializeMoodboardSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function contentByteLength(content) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(String(content || "")).byteLength;
  return new Blob([String(content || "")]).size;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function normalizeDriveQuota(storageQuota = {}) {
  const hasLimit = storageQuota.limit !== undefined && storageQuota.limit !== null && storageQuota.limit !== "";
  const limit = hasLimit ? finiteNumber(storageQuota.limit, null) : null;
  const usage = finiteNumber(storageQuota.usage);
  return {
    limit,
    usage,
    usageInDrive: finiteNumber(storageQuota.usageInDrive),
    usageInDriveTrash: finiteNumber(storageQuota.usageInDriveTrash),
    remaining: limit === null ? null : Math.max(0, limit - usage),
  };
}

export function evaluateDriveQuota(storageQuota, uploadBytes, { safetyBytes = 64 * 1024 } = {}) {
  const quota = normalizeDriveQuota(storageQuota);
  const upload = finiteNumber(uploadBytes);
  const safety = Math.max(finiteNumber(safetyBytes), Math.ceil(upload * 0.1));
  const required = upload + safety;
  if (quota.limit === null) return { allowed: true, level: "unknown", required, ...quota };
  if (quota.remaining < required) return { allowed: false, level: "insufficient", required, ...quota };
  if (quota.remaining < required * 3) return { allowed: true, level: "low", required, ...quota };
  return { allowed: true, level: "ok", required, ...quota };
}

export function normalizeDriveFile(file = {}) {
  return {
    id: String(file.id || ""),
    name: String(file.name || "未命名.studio"),
    mimeType: String(file.mimeType || DRIVE_FILE_MIME_TYPE),
    createdTime: String(file.createdTime || ""),
    modifiedTime: String(file.modifiedTime || ""),
    size: finiteNumber(file.size),
    version: String(file.version || ""),
    headRevisionId: String(file.headRevisionId || ""),
    webViewLink: String(file.webViewLink || ""),
    resourceKey: String(file.resourceKey || ""),
    ownedByMe: file.ownedByMe === true,
    parents: Array.isArray(file.parents) ? file.parents.map(String) : [],
    boardId: String(file.appProperties?.boardId || ""),
    capabilities: {
      canDownload: file.capabilities?.canDownload !== false,
      canReadRevisions: file.capabilities?.canReadRevisions !== false,
      canEdit: file.capabilities?.canEdit === true,
      canShare: file.capabilities?.canShare === true,
    },
  };
}

function defaultDriveState() {
  return {
    enabled: false,
    autoSync: true,
    folderId: "",
    connectionOwnerUid: "",
    connectionEmail: "",
    links: {},
  };
}

export function normalizeDriveState(value) {
  const fallback = defaultDriveState();
  if (!value || typeof value !== "object") return fallback;
  const links = {};
  for (const [boardId, link] of Object.entries(value.links || {})) {
    if (!boardId || !link?.fileId) continue;
    links[boardId] = {
      fileId: String(link.fileId),
      name: String(link.name || ""),
      version: String(link.version || ""),
      modifiedTime: String(link.modifiedTime || ""),
      size: finiteNumber(link.size),
      headRevisionId: String(link.headRevisionId || ""),
      webViewLink: String(link.webViewLink || ""),
      resourceKey: String(link.resourceKey || ""),
      ownedByMe: link.ownedByMe === true,
      canEdit: link.canEdit === true,
      canShare: link.canShare === true,
      syncedRevision: finiteNumber(link.syncedRevision),
      syncedUpdatedAt: String(link.syncedUpdatedAt || ""),
    };
  }
  return {
    enabled: value.enabled === true,
    autoSync: value.autoSync !== false,
    folderId: String(value.folderId || ""),
    connectionOwnerUid: String(value.connectionOwnerUid || ""),
    connectionEmail: String(value.connectionEmail || ""),
    links,
  };
}

export function loadDriveState(storage = globalThis.localStorage) {
  try {
    return normalizeDriveState(JSON.parse(storage?.getItem(DRIVE_STATE_STORAGE_KEY) || "null"));
  } catch {
    return defaultDriveState();
  }
}

export function saveDriveState(storage, value) {
  const state = normalizeDriveState(value);
  storage?.setItem(DRIVE_STATE_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function linkDriveFile(state, board, file) {
  const normalized = normalizeDriveState(state);
  const remote = normalizeDriveFile(file);
  return normalizeDriveState({
    ...normalized,
    enabled: true,
    links: {
      ...normalized.links,
      [board.id]: {
        fileId: remote.id,
        name: remote.name,
        version: remote.version,
        modifiedTime: remote.modifiedTime,
        size: remote.size,
        headRevisionId: remote.headRevisionId,
        webViewLink: remote.webViewLink,
        resourceKey: remote.resourceKey,
        ownedByMe: remote.ownedByMe,
        canEdit: remote.capabilities.canEdit,
        canShare: remote.capabilities.canShare,
        syncedRevision: finiteNumber(board.revision),
        syncedUpdatedAt: String(board.updatedAt || ""),
      },
    },
  });
}

export function driveErrorMessage(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  if (["authorization_required", "authentication_required"].includes(error?.code)) return "Google Drive 授權已失效；請重新連結後再同步。";
  if (error?.code === "popup_blocked") return "瀏覽器封鎖了 Google 授權視窗；請允許彈出式視窗後重試。";
  if (error?.code === "authorization_cancelled") return "已取消 Google Drive 連結；目前工作內容未受影響。";
  if (error?.code === "authorization_timeout") return "Google 授權等待逾時；請重新連結。";
  if (["unavailable", "invalid_token_response", "invalid_authorization_url", "authorization_failed"].includes(error?.code)) return "目前無法完成 Google Drive 連結；請稍後重試，目前工作內容未受影響。";
  if (error?.code === "account_changed") return "登入帳號已變更；請回到目前帳號重新連結 Google Drive。";
  if (error?.code === "drive/picker-unconfigured") return "網站尚未完成 Google 共享檔案選擇器設定；目前沒有開啟任何內容。";
  if (error?.code === "drive/picker-mismatch") return "你選的不是此分享連結指定的檔案；沒有開啟任何內容。";
  if (error?.code === "drive/picker-empty") return "Google Drive 沒有回傳可開啟的檔案；沒有開啟任何內容。";
  if (["drive/picker-timeout", "drive/picker-unavailable", "drive/picker-error"].includes(error?.code)) return error?.message || "Google 檔案選擇器暫時無法使用；沒有開啟任何內容。";
  if (error?.code === "drive/conflict") return "這台裝置與 Drive 的內容不同；同步已暫停，兩份內容都已保留。";
  if (error?.code === "drive/revision") return error?.message || "無法安全建立或讀取 Google Drive 版本；目前工作檔未受影響。";
  if (reason === "storageQuotaExceeded" || error?.code === "drive/quota") return "Google Drive 空間不足；畫布仍安全保存在這台裝置。";
  if (["authError", "invalidCredentials"].includes(reason) || error?.status === 401) return "Google Drive 授權已失效；請重新連結後再同步。";
  if (["rateLimitExceeded", "userRateLimitExceeded"].includes(reason) || error?.status === 429) return "Google Drive 暫時忙碌；本機版本已保留，稍後會再同步。";
  if (reason === "appNotAuthorizedToFile") return "Infinite Studio 尚未獲得這份檔案的存取授權；請重新選取該檔案。";
  if (["insufficientFilePermissions", "notFound"].includes(reason) || error?.status === 404) return "目前帳號沒有這份 Google Drive 檔案的存取權，或檔案已不存在。";
  if (reason === "domainPolicy") return "目前 Google Workspace 組織政策不允許這個 App 存取 Drive。";
  if (["insufficientPermissions", "forbidden"].includes(reason) || error?.status === 403) return "Google Drive 拒絕了這次操作；請檢查檔案權限或稍後再試。";
  if (error?.code === "drive/timeout") return "Google Drive 回應逾時；本機版本已保留，請稍後再試。";
  if (error?.code === "drive/offline") return "目前離線；變更已保存在這台裝置，連線後可再同步。";
  if (error?.name === "AbortError" || error?.code === "drive/cancelled") return "Google Drive 操作已取消；本機版本未受影響。";
  return error?.message || "Google Drive 暫時無法使用；請稍後再試。";
}
