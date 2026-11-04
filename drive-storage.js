import { normalizeGoogleDrivePermission } from "./drive-share.js";

const runtimeEnv = import.meta.env || {};

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_FOLDER_NAME = "Infinite Moodboard";
export const GOOGLE_DRIVE_CLIENT_ID = runtimeEnv.VITE_GOOGLE_DRIVE_CLIENT_ID
  || "1068479226042-u90bs7m2d64p0q7r9ip53uca2ir3la50.apps.googleusercontent.com";
export const DRIVE_STATE_STORAGE_KEY = "infinite-moodboard-drive-state-v1";
export const DRIVE_FILE_MIME_TYPE = "application/json";

const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3";
// v2 exposes a strong ETag in JSON. Keep its GET and conditional update on
// the same API version; v3 does not guarantee a browser-readable ETag header.
const DRIVE_CONDITIONAL_API_ROOT = "https://www.googleapis.com/drive/v2";
const DRIVE_CONDITIONAL_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v2";
const DRIVE_CONDITIONAL_FILE_FIELDS = "id,etag,title,mimeType,modifiedDate,fileSize,version,headRevisionId,alternateLink,resourceKey,ownedByMe,capabilities(canEdit,canShare,canDownload,canReadRevisions)";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const DEFAULT_QUOTA_SAFETY_BYTES = 64 * 1024;
const DRIVE_REQUEST_TIMEOUT_MS = 20_000;
const DRIVE_TRANSFER_TIMEOUT_MS = 120_000;
export const MAX_RETAINED_DRIVE_REVISIONS = 200;

let identityScriptPromise;

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

export function normalizeGoogleDriveTokenResponse(response, now = Date.now()) {
  if (!response || response.error || !response.access_token) {
    throw new DriveApiError(response?.error_description || "Google Drive 授權未完成。", {
      code: "drive/authorization",
      reason: response?.error || "authorizationFailed",
      details: response || null,
    });
  }
  const scopes = new Set(String(response.scope || "").split(/\s+/).filter(Boolean));
  const driveScopes = [...scopes].filter((scope) => scope.startsWith("https://www.googleapis.com/auth/drive"));
  if (!scopes.has(GOOGLE_DRIVE_SCOPE) || driveScopes.some((scope) => scope !== GOOGLE_DRIVE_SCOPE)) {
    throw new DriveApiError("Google Drive 未授予工作檔所需權限。", {
      code: "drive/permission",
      status: 403,
      reason: "insufficientPermissions",
      details: response,
    });
  }
  return {
    accessToken: String(response.access_token),
    expiresAt: now + Math.max(0, Number(response.expires_in || 3600) - 60) * 1000,
    scope: [...scopes].join(" "),
  };
}

export function isGoogleDriveTokenUsable(token, now = Date.now()) {
  return Boolean(token?.accessToken && Number(token.expiresAt) > now);
}

export function isGoogleDriveAuthorizationError(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  return error?.code === "drive/authorization"
    || error?.code === "drive/permission"
    || error?.status === 401
    || ["authError", "invalidCredentials", "insufficientPermissions"].includes(reason);
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

export function evaluateDriveQuota(storageQuota, uploadBytes, {
  safetyBytes = DEFAULT_QUOTA_SAFETY_BYTES,
} = {}) {
  const quota = normalizeDriveQuota(storageQuota);
  const upload = finiteNumber(uploadBytes);
  const safety = Math.max(finiteNumber(safetyBytes), Math.ceil(upload * 0.1));
  const required = upload + safety;
  if (quota.limit === null) {
    return { allowed: true, level: "unknown", required, ...quota };
  }
  if (quota.remaining < required) {
    return { allowed: false, level: "insufficient", required, ...quota };
  }
  if (quota.remaining < required * 3) {
    return { allowed: true, level: "low", required, ...quota };
  }
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
    sha256Checksum: String(file.sha256Checksum || "").toLowerCase(),
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

export function normalizeDriveRevision(revision = {}) {
  return {
    id: String(revision.id || ""),
    mimeType: String(revision.mimeType || DRIVE_FILE_MIME_TYPE),
    modifiedTime: String(revision.modifiedTime || ""),
    size: finiteNumber(revision.size),
    keepForever: revision.keepForever === true,
    originalFilename: String(revision.originalFilename || ""),
    lastModifyingUser: {
      displayName: String(revision.lastModifyingUser?.displayName || ""),
      emailAddress: String(revision.lastModifyingUser?.emailAddress || ""),
      photoLink: String(revision.lastModifyingUser?.photoLink || ""),
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

export function unlinkDriveFile(state, boardId) {
  const normalized = normalizeDriveState(state);
  const links = { ...normalized.links };
  delete links[boardId];
  return { ...normalized, links };
}

export function driveErrorMessage(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  if (error?.code === "drive/picker-unconfigured") return "網站尚未完成 Google 共享檔案選擇器設定；目前沒有開啟任何內容。";
  if (error?.code === "drive/picker-mismatch") return "你選的不是此分享連結指定的檔案；沒有開啟任何內容。";
  if (error?.code === "drive/picker-empty") return "Google Drive 沒有回傳可開啟的檔案；沒有開啟任何內容。";
  if (["drive/picker-timeout", "drive/picker-unavailable", "drive/picker-error"].includes(error?.code)) return error?.message || "Google 檔案選擇器暫時無法使用；沒有開啟任何內容。";
  if (error?.code === "drive/conflict") return "Drive 上已有較新的版本；請選擇要開啟雲端版本或另存複本。";
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

function loadIdentityScript() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (identityScriptPromise) return identityScriptPromise;
  if (!globalThis.document) return Promise.reject(new DriveApiError("目前環境無法載入 Google Drive 授權。", { code: "drive/unavailable" }));
  identityScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      identityScriptPromise = null;
      reject(new DriveApiError("無法載入 Google Drive 授權服務。", { code: "drive/unavailable" }));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return identityScriptPromise;
}

export async function requestGoogleDriveToken({ loginHint = "", prompt = "", timeoutMs = 12_000 } = {}) {
  if (!isGoogleDriveConfigured()) {
    throw new DriveApiError("Google Drive OAuth 尚未設定完成。", { code: "drive/unconfigured" });
  }
  if (globalThis.navigator?.onLine === false) {
    throw new DriveApiError("目前沒有網路連線。", { code: "drive/offline" });
  }
  await loadIdentityScript();
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      callback(value);
    };
    timeoutId = globalThis.setTimeout(() => {
      finish(reject, new DriveApiError(
        prompt === "none" ? "無法在背景恢復 Google Drive 授權。" : "Google Drive 授權逾時，請再試一次。",
        { code: "drive/authorization", reason: "timeout" },
      ));
    }, Math.max(1_000, Number(timeoutMs) || 12_000));
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_DRIVE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        login_hint: loginHint || undefined,
        callback: (response) => {
          try {
            finish(resolve, normalizeGoogleDriveTokenResponse(response));
          } catch (error) {
            finish(reject, error);
          }
        },
        error_callback: (response) => finish(reject, new DriveApiError(
          response?.message || (prompt === "none" ? "無法在背景恢復 Google Drive 授權。" : "Google Drive 授權視窗已關閉。"),
          {
            code: "drive/authorization",
            reason: response?.type || "popupClosed",
            details: response,
          },
        )),
      });
      tokenClient.requestAccessToken({
        prompt: prompt === "none" ? "none" : "",
        include_granted_scopes: false,
        login_hint: loginHint || undefined,
      });
    } catch (error) {
      finish(reject, error instanceof DriveApiError ? error : new DriveApiError(
        error?.message || "Google Drive 授權無法啟動。",
        { code: "drive/authorization", reason: "requestFailed", details: error },
      ));
    }
  });
}

function googleApiError(payload, response) {
  const reason = payload?.error?.errors?.[0]?.reason || payload?.error?.status || "";
  const message = payload?.error?.message || `Google Drive 回應 ${response.status}`;
  return new DriveApiError(message, {
    code: response.status === 412 ? "drive/conflict" : reason === "storageQuotaExceeded" ? "drive/quota" : "drive/api",
    status: response.status,
    reason,
    details: payload,
  });
}

async function driveRequest(accessToken, url, options = {}) {
  if (!accessToken) throw new DriveApiError("Google Drive 尚未連結。", { code: "drive/authorization", status: 401 });
  if (globalThis.navigator?.onLine === false) throw new DriveApiError("目前沒有網路連線。", { code: "drive/offline" });
  const {
    includeResponse = false,
    responseType = "json",
    timeoutMs = DRIVE_REQUEST_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId = null;
  const abortFromCaller = () => {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  if (!controller.signal.aborted) {
    timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, Number(timeoutMs) || DRIVE_REQUEST_TIMEOUT_MS));
  }
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      // Version checks and file contents must reflect Drive, not an earlier
      // browser cache entry from before an upload.
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(fetchOptions.headers || {}),
      },
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    let payload = null;
    try {
      payload = response.ok && responseType === "text"
        ? await response.text()
        : response.ok && responseType === "arrayBuffer"
          ? await response.arrayBuffer()
          : await response.json();
    } catch (error) {
      if (timedOut || error?.name === "AbortError") throw error;
      if (response.ok && (responseType === "text" || responseType === "arrayBuffer")) throw error;
    }
    if (!response.ok) throw googleApiError(payload, response);
    return includeResponse ? { payload, response } : payload;
  } catch (error) {
    if (timedOut) {
      throw new DriveApiError("Google Drive 回應逾時；本機版本已保留，請稍後再試。", {
        code: "drive/timeout",
        reason: "timeout",
        details: error,
      });
    }
    if (error?.name === "AbortError") throw error;
    if (error instanceof DriveApiError) throw error;
    throw new DriveApiError(error?.message || "無法連線 Google Drive。", { code: "drive/network", details: error });
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function getGoogleDriveAbout(accessToken, options = {}) {
  const fields = "storageQuota,user(displayName,emailAddress,photoLink)";
  const result = await driveRequest(accessToken, `${DRIVE_API_ROOT}/about?fields=${encodeURIComponent(fields)}`, options);
  return {
    quota: normalizeDriveQuota(result?.storageQuota),
    user: {
      displayName: String(result?.user?.displayName || ""),
      emailAddress: String(result?.user?.emailAddress || ""),
      photoLink: String(result?.user?.photoLink || ""),
    },
  };
}

async function findDriveFolder(accessToken) {
  const query = `name = '${GOOGLE_DRIVE_FOLDER_NAME.replaceAll("'", "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "10",
    fields: "files(id,name,modifiedTime)",
  });
  const result = await driveRequest(accessToken, `${DRIVE_API_ROOT}/files?${params}`);
  return result?.files?.[0] || null;
}

export async function ensureGoogleDriveFolder(accessToken, knownFolderId = "", { create = true } = {}) {
  if (knownFolderId) {
    try {
      const folder = await driveRequest(accessToken, `${DRIVE_API_ROOT}/files/${encodeURIComponent(knownFolderId)}?fields=id,name,trashed`);
      if (!folder?.trashed) return knownFolderId;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  const existing = await findDriveFolder(accessToken);
  if (existing?.id) return existing.id;
  if (!create) return "";
  const folder = await driveRequest(accessToken, `${DRIVE_API_ROOT}/files?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { infiniteMoodboard: "true" },
    }),
  });
  return String(folder.id);
}

const DRIVE_FILE_FIELDS = "id,name,mimeType,createdTime,modifiedTime,size,version,headRevisionId,sha256Checksum,webViewLink,resourceKey,ownedByMe,parents,appProperties,capabilities(canDownload,canReadRevisions,canEdit,canShare)";
const DRIVE_REVISION_FIELDS = "id,mimeType,modifiedTime,size,keepForever,originalFilename,lastModifyingUser(displayName,emailAddress,photoLink)";
const DRIVE_PERMISSION_FIELDS = "id,type,role,displayName,emailAddress,photoLink,domain,allowFileDiscovery,pendingOwner,deleted";

function driveResourceKeyHeaders(fileId, resourceKey = "") {
  const normalized = String(resourceKey || "").trim();
  return normalized ? { "X-Goog-Drive-Resource-Keys": `${fileId}/${normalized}` } : {};
}

export async function listGoogleDrivePermissions(accessToken, fileId, { resourceKey = "", signal } = {}) {
  if (!fileId) throw new DriveApiError("Google Drive 檔案 ID 不完整。", { code: "drive/permission" });
  const permissions = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      fields: `nextPageToken,permissions(${DRIVE_PERMISSION_FIELDS})`,
      pageSize: "100",
      supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveRequest(
      accessToken,
      `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/permissions?${params}`,
      { headers: driveResourceKeyHeaders(fileId, resourceKey), signal },
    );
    permissions.push(...(result?.permissions || []).map(normalizeGoogleDrivePermission).filter((permission) => permission.id));
    pageToken = String(result?.nextPageToken || "");
  } while (pageToken);
  return permissions;
}

export async function createGoogleDrivePermission(accessToken, fileId, {
  type = "user",
  role = "reader",
  emailAddress = "",
  allowFileDiscovery = false,
  resourceKey = "",
  sendNotificationEmail = true,
  signal,
} = {}) {
  if (!fileId) throw new DriveApiError("Google Drive 檔案 ID 不完整。", { code: "drive/permission" });
  if (!["user", "anyone"].includes(type) || !["reader", "writer"].includes(role)) {
    throw new DriveApiError("Google Drive 分享權限不正確。", { code: "drive/permission" });
  }
  const normalizedEmail = String(emailAddress || "").trim().toLowerCase();
  if (type === "user" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new DriveApiError("請輸入有效的 Email。", { code: "drive/permission" });
  }
  const params = new URLSearchParams({
    fields: DRIVE_PERMISSION_FIELDS,
    supportsAllDrives: "true",
  });
  if (type === "user") params.set("sendNotificationEmail", sendNotificationEmail ? "true" : "false");
  const payload = {
    type,
    role,
    ...(type === "user" ? { emailAddress: normalizedEmail } : { allowFileDiscovery: allowFileDiscovery === true }),
  };
  const result = await driveRequest(
    accessToken,
    `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/permissions?${params}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...driveResourceKeyHeaders(fileId, resourceKey) },
      body: JSON.stringify(payload),
      signal,
    },
  );
  return normalizeGoogleDrivePermission(result);
}

export async function updateGoogleDrivePermission(accessToken, fileId, permissionId, role, { resourceKey = "", signal } = {}) {
  if (!fileId || !permissionId || !["reader", "writer"].includes(role)) {
    throw new DriveApiError("Google Drive 分享權限不正確。", { code: "drive/permission" });
  }
  const params = new URLSearchParams({ fields: DRIVE_PERMISSION_FIELDS, supportsAllDrives: "true" });
  const result = await driveRequest(
    accessToken,
    `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?${params}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...driveResourceKeyHeaders(fileId, resourceKey) },
      body: JSON.stringify({ role }),
      signal,
    },
  );
  return normalizeGoogleDrivePermission(result);
}

export async function deleteGoogleDrivePermission(accessToken, fileId, permissionId, { resourceKey = "", signal } = {}) {
  if (!fileId || !permissionId) throw new DriveApiError("Google Drive 分享權限不正確。", { code: "drive/permission" });
  const params = new URLSearchParams({ supportsAllDrives: "true" });
  await driveRequest(
    accessToken,
    `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?${params}`,
    { method: "DELETE", headers: driveResourceKeyHeaders(fileId, resourceKey), signal },
  );
  return true;
}

export async function setGoogleDriveGeneralAccess(accessToken, fileId, enabled, { resourceKey = "", signal } = {}) {
  const permissions = await listGoogleDrivePermissions(accessToken, fileId, { resourceKey, signal });
  const anyonePermissions = permissions.filter((permission) => permission.type === "anyone");
  if (enabled) {
    const current = anyonePermissions[0];
    if (current?.role === "reader") return current;
    if (current) return updateGoogleDrivePermission(accessToken, fileId, current.id, "reader", { resourceKey, signal });
    return createGoogleDrivePermission(accessToken, fileId, {
      type: "anyone",
      role: "reader",
      allowFileDiscovery: false,
      resourceKey,
      signal,
    });
  }
  for (const permission of anyonePermissions) {
    await deleteGoogleDrivePermission(accessToken, fileId, permission.id, { resourceKey, signal });
  }
  return null;
}

export async function listGoogleDriveMoodboards(accessToken, folderId) {
  if (!folderId) return [];
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`,
      spaces: "drive",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveRequest(accessToken, `${DRIVE_API_ROOT}/files?${params}`);
    files.push(...(result?.files || []).filter((file) => /\.(studio|moodboard)$/i.test(file.name || "")).map(normalizeDriveFile));
    pageToken = result?.nextPageToken || "";
  } while (pageToken);
  return files;
}

export async function getGoogleDriveFile(accessToken, fileId, { resourceKey = "", signal } = {}) {
  const params = new URLSearchParams({
    fields: DRIVE_FILE_FIELDS,
    supportsAllDrives: "true",
  });
  const result = await driveRequest(accessToken, `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}?${params}`, {
    headers: driveResourceKeyHeaders(fileId, resourceKey),
    signal,
  });
  return normalizeDriveFile(result);
}

export async function listGoogleDriveRevisions(accessToken, fileId, { resourceKey = "", signal } = {}) {
  if (!fileId) return [];
  const revisions = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      pageSize: "200",
      fields: `nextPageToken,revisions(${DRIVE_REVISION_FIELDS})`,
      supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveRequest(
      accessToken,
      `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/revisions?${params}`,
      { headers: driveResourceKeyHeaders(fileId, resourceKey), signal },
    );
    revisions.push(...(result?.revisions || []).map(normalizeDriveRevision).filter((revision) => revision.id));
    pageToken = String(result?.nextPageToken || "");
  } while (pageToken);
  return revisions.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)) || b.id.localeCompare(a.id));
}

export async function updateGoogleDriveRevisionRetention(accessToken, fileId, revisionId, keepForever, {
  resourceKey = "",
  signal,
} = {}) {
  if (!fileId || !revisionId) {
    throw new DriveApiError("Google Drive 版本缺少可辨識的 ID。", { code: "drive/revision" });
  }
  const result = await driveRequest(
    accessToken,
    `${DRIVE_API_ROOT}/files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}?fields=${encodeURIComponent(DRIVE_REVISION_FIELDS)}&supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...driveResourceKeyHeaders(fileId, resourceKey) },
      body: JSON.stringify({ keepForever: keepForever === true }),
      signal,
    },
  );
  return normalizeDriveRevision(result);
}

export async function enforceGoogleDriveRevisionRetention(accessToken, fileId, {
  maxRetained = MAX_RETAINED_DRIVE_REVISIONS,
  resourceKey = "",
  signal,
} = {}) {
  const limit = Math.max(0, Math.floor(Number(maxRetained) || 0));
  const revisions = await listGoogleDriveRevisions(accessToken, fileId, { resourceKey, signal });
  const retained = revisions.filter((revision) => revision.keepForever);
  // Google Drive does not allow a kept-forever blob revision to be unpinned.
  // Never delete revisions to make space automatically: they are recovery data.
  return { revisions, retained, limit, released: [] };
}

function normalizeConditionalDriveFile(file = {}) {
  return normalizeDriveFile({
    ...file,
    name: file.title,
    modifiedTime: file.modifiedDate,
    size: file.fileSize,
    webViewLink: file.alternateLink,
  });
}

function requireStrongDriveEtag(etag) {
  // Empty, weak and wildcard validators must never turn into an unconditional
  // write. ETags are opaque; preserve the exact quoted value from Drive.
  if (!/^"[^"\r\n]+"$/.test(etag)) {
    throw new DriveApiError("無法確認 Google Drive 檔案版本，更新已停止。請重試或先下載工作檔備份。", { code: "drive/safety-check" });
  }
}

function driveMultipartBody(metadata, content) {
  const boundary = `moodboard_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  return {
    contentType: `multipart/related; boundary=${boundary}`,
    body: new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${DRIVE_FILE_MIME_TYPE}\r\n\r\n`,
      content,
      `\r\n--${boundary}--\r\n`,
    ]),
  };
}

async function getGoogleDriveFileState(accessToken, fileId, { resourceKey = "", signal } = {}) {
  const params = new URLSearchParams({
    fields: DRIVE_CONDITIONAL_FILE_FIELDS,
    supportsAllDrives: "true",
  });
  const payload = await driveRequest(
    accessToken,
    `${DRIVE_CONDITIONAL_API_ROOT}/files/${encodeURIComponent(fileId)}?${params}`,
    { signal, headers: driveResourceKeyHeaders(fileId, resourceKey) },
  );
  return {
    file: normalizeConditionalDriveFile(payload),
    etag: String(payload?.etag || ""),
  };
}

export async function downloadGoogleDriveMoodboard(accessToken, fileId, {
  revisionId = "",
  resourceKey = "",
  signal,
  timeoutMs = DRIVE_TRANSFER_TIMEOUT_MS,
  rawBytes = false,
} = {}) {
  const encodedFileId = encodeURIComponent(fileId);
  const endpoint = revisionId
    ? `${DRIVE_API_ROOT}/files/${encodedFileId}/revisions/${encodeURIComponent(revisionId)}?alt=media&supportsAllDrives=true`
    : `${DRIVE_API_ROOT}/files/${encodedFileId}?alt=media&supportsAllDrives=true`;
  return driveRequest(accessToken, endpoint, {
    headers: driveResourceKeyHeaders(fileId, resourceKey),
    signal,
    timeoutMs,
    responseType: rawBytes ? "arrayBuffer" : "text",
  });
}

export async function downloadCurrentGoogleDriveMoodboard(accessToken, fileId, { resourceKey = "", signal } = {}) {
  let after;
  // Drive can advance metadata immediately after creating or updating a file.
  // Retry bounded read-only snapshots, but never return a mismatched version.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await getGoogleDriveFile(accessToken, fileId, { resourceKey, signal });
    if (before.id !== String(fileId)) throw new DriveApiError("Google Drive 回傳的檔案與分享連結不符；目前畫布未變更。", { code: "drive/file-mismatch" });
    if (!before.version) throw new DriveApiError("Google Drive 未提供檔案版本，無法安全開啟；目前畫布未變更。", { code: "drive/version-unavailable" });
    const resolvedKey = before.resourceKey || resourceKey;
    const bytes = await downloadGoogleDriveMoodboard(accessToken, fileId, { resourceKey: resolvedKey, signal, rawBytes: true });
    after = await getGoogleDriveFile(accessToken, fileId, { resourceKey: resolvedKey, signal });
    if (after.version && before.version === after.version && after.id === before.id) {
      const checksum = before.sha256Checksum || after.sha256Checksum;
      if (checksum) {
        if (!/^[a-f0-9]{64}$/.test(checksum) || (before.sha256Checksum && after.sha256Checksum && before.sha256Checksum !== after.sha256Checksum)) continue;
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        if (actual !== checksum) continue;
      }
      return { content: new TextDecoder().decode(bytes), metadata: { ...after, resourceKey: after.resourceKey || resolvedKey } };
    }
  }
  throw new DriveConflictError(after);
}

export async function uploadGoogleDriveMoodboard(accessToken, {
  board,
  content,
  filename,
  folderId,
  existingFile = null,
  expectedVersion = "",
  expectedHeadRevisionId = "",
  forceOverwrite = false,
  confirmedRemoteVersion = "",
  latestWins = false,
  latestWinsRetries = 2,
  signal,
}) {
  if (forceOverwrite && (!existingFile?.id || !confirmedRemoteVersion)) {
    throw new DriveApiError("覆寫目標已變更，因此未更新 Google Drive。", {
      code: "drive/overwrite-target",
      details: { existingFile, confirmedRemoteVersion },
    });
  }
  let remoteState = null;
  const resourceKey = existingFile?.resourceKey || "";
  if (existingFile?.id) {
    remoteState = await getGoogleDriveFileState(accessToken, existingFile.id, { resourceKey, signal });
    const matchesExpectedVersion = Boolean(expectedVersion && remoteState.file.version
      && String(remoteState.file.version) === String(expectedVersion));
    const matchesExpectedHead = Boolean(expectedHeadRevisionId && remoteState.file.headRevisionId
      && String(remoteState.file.headRevisionId) === String(expectedHeadRevisionId)
      && remoteState.file.name === filename);
    const matchesConfirmedOverwrite = Boolean(forceOverwrite && confirmedRemoteVersion && remoteState.file.version
      && String(remoteState.file.version) === String(confirmedRemoteVersion));
    if (forceOverwrite ? !matchesConfirmedOverwrite : !latestWins && !matchesExpectedVersion && !matchesExpectedHead) {
      throw new DriveConflictError(remoteState.file);
    }
    requireStrongDriveEtag(remoteState.etag);
    if (!remoteState.file.headRevisionId) {
      throw new DriveApiError("無法先保留目前 Drive 版本，因此已停止覆寫。", { code: "drive/revision", details: remoteState.file });
    }
    const protectedHeadRevisionId = remoteState.file.headRevisionId;
    const protectedName = remoteState.file.name;
    const retention = await enforceGoogleDriveRevisionRetention(accessToken, existingFile.id, {
      maxRetained: MAX_RETAINED_DRIVE_REVISIONS,
      resourceKey,
      signal,
    });
    const headAlreadyRetained = retention.retained.some((revision) => revision.id === protectedHeadRevisionId);
    if (!headAlreadyRetained && retention.retained.length >= retention.limit) {
      throw new DriveApiError("Google Drive 已達永久保留版本上限，無法先保留目前雲端版本，因此未上傳。請先下載備份，並在 Google Drive 管理版本後再試。", { code: "drive/revision", details: remoteState.file });
    }
    if (!headAlreadyRetained) await updateGoogleDriveRevisionRetention(accessToken, existingFile.id, protectedHeadRevisionId, true, { resourceKey, signal });
    remoteState = await getGoogleDriveFileState(accessToken, existingFile.id, { resourceKey, signal });
    // Retaining a revision changes Drive's file version even when the file
    // contents did not change. Compare the head revision instead, then use the
    // freshly returned ETag so our own metadata update is never misread as a
    // cross-device edit.
    requireStrongDriveEtag(remoteState.etag);
    if (!remoteState.file.headRevisionId || remoteState.file.headRevisionId !== protectedHeadRevisionId
      || remoteState.file.name !== protectedName) {
      if (latestWins && !forceOverwrite && latestWinsRetries > 0) return uploadGoogleDriveMoodboard(accessToken, { board, content, filename, folderId, existingFile, expectedVersion, expectedHeadRevisionId, latestWins, latestWinsRetries: latestWinsRetries - 1, signal });
      throw new DriveConflictError(remoteState.file);
    }
  }

  const metadata = existingFile?.id ? { title: filename, mimeType: DRIVE_FILE_MIME_TYPE } : {
    name: filename,
    mimeType: DRIVE_FILE_MIME_TYPE,
    appProperties: {
      infiniteMoodboard: "true",
      boardId: String(board.id || ""),
      schemaVersion: String(board.schemaVersion || ""),
    },
  };
  if (!existingFile?.id && folderId) metadata.parents = [folderId];
  const multipart = driveMultipartBody(metadata, content);
  const endpoint = existingFile?.id
    ? `${DRIVE_CONDITIONAL_UPLOAD_ROOT}/files/${encodeURIComponent(existingFile.id)}?uploadType=multipart&supportsAllDrives=true&newRevision=true&fields=${encodeURIComponent(DRIVE_CONDITIONAL_FILE_FIELDS)}`
    : `${DRIVE_UPLOAD_ROOT}/files?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`;
  let result;
  try {
    result = await driveRequest(accessToken, endpoint, {
      method: existingFile?.id ? "PUT" : "POST",
      headers: {
        "Content-Type": multipart.contentType,
        ...driveResourceKeyHeaders(existingFile?.id, resourceKey),
        ...(remoteState ? { "If-Match": remoteState.etag } : {}),
      },
      body: multipart.body,
      signal,
      timeoutMs: DRIVE_TRANSFER_TIMEOUT_MS,
    });
  } catch (error) {
    if (error?.code === "drive/conflict" || error?.status === 412) {
      if (latestWins && !forceOverwrite && latestWinsRetries > 0) return uploadGoogleDriveMoodboard(accessToken, { board, content, filename, folderId, existingFile, expectedVersion, expectedHeadRevisionId, latestWins, latestWinsRetries: latestWinsRetries - 1, signal });
      throw new DriveConflictError(remoteState?.file || existingFile);
    }
    throw error;
  }
  const saved = existingFile?.id ? normalizeConditionalDriveFile(result) : normalizeDriveFile(result);
  if (existingFile?.id) {
    try {
      const verified = await getGoogleDriveFile(accessToken, existingFile.id, { resourceKey, signal });
      if (!saved.version || verified.version !== saved.version) throw new DriveConflictError(verified);
      return verified;
    } catch (error) {
      // The write returned successfully; a failed readback must not imply no
      // write occurred, nor silently renew consent for an unverified version.
      throw new DriveApiError("已送出更新，但未能確認雲端結果。請先檢查雲端狀態。", { code: "drive/verification", details: error });
    }
  }
  return saved;
}
