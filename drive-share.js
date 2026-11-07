export const DRIVE_SHARE_FILE_PARAM = "driveFile";
export const DRIVE_SHARE_RESOURCE_KEY_PARAM = "resourceKey";

export function normalizeDriveFileId(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9_-]{10,200}$/.test(candidate) ? candidate : "";
}

export function normalizeDriveResourceKey(value) {
  const candidate = String(value || "").trim();
  return /^[A-Za-z0-9_-]{4,200}$/.test(candidate) ? candidate : "";
}

export function parseGoogleDriveMoodboardLink(value, baseUrl = globalThis.location?.href || "https://moodboard.petfashion.tw/") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    const fileId = normalizeDriveFileId(url.searchParams.get(DRIVE_SHARE_FILE_PARAM));
    if (!fileId) return null;
    return {
      fileId,
      resourceKey: normalizeDriveResourceKey(url.searchParams.get(DRIVE_SHARE_RESOURCE_KEY_PARAM)),
    };
  } catch {
    return null;
  }
}

export function createGoogleDriveMoodboardUrl(
  { fileId, resourceKey = "" },
  baseUrl = globalThis.location?.href || "https://moodboard.petfashion.tw/",
) {
  const normalizedFileId = normalizeDriveFileId(fileId);
  if (!normalizedFileId) throw new Error("Google Drive 檔案 ID 不完整。");
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set(DRIVE_SHARE_FILE_PARAM, normalizedFileId);
  const normalizedResourceKey = normalizeDriveResourceKey(resourceKey);
  if (normalizedResourceKey) url.searchParams.set(DRIVE_SHARE_RESOURCE_KEY_PARAM, normalizedResourceKey);
  return url.href;
}

export function googleDriveFileAccessUrl({ fileId, resourceKey = "" } = {}) {
  const id = normalizeDriveFileId(fileId);
  if (!id) return "";
  const url = new URL(`https://drive.google.com/file/d/${id}/view`);
  const key = normalizeDriveResourceKey(resourceKey);
  if (key) url.searchParams.set("resourcekey", key);
  return url.href;
}

export function preserveGoogleDriveResourceKey(file = {}, fallbackResourceKey = "") {
  return { ...file, resourceKey: String(file.resourceKey || fallbackResourceKey || "") };
}

export function normalizeGoogleDrivePermission(permission = {}) {
  const type = ["user", "group", "domain", "anyone"].includes(permission.type) ? permission.type : "user";
  const role = ["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"].includes(permission.role)
    ? permission.role
    : "reader";
  return {
    id: String(permission.id || ""),
    type,
    role,
    displayName: String(permission.displayName || ""),
    emailAddress: String(permission.emailAddress || ""),
    photoLink: String(permission.photoLink || ""),
    domain: String(permission.domain || ""),
    allowFileDiscovery: permission.allowFileDiscovery === true,
    pendingOwner: permission.pendingOwner === true,
    deleted: permission.deleted === true,
  };
}

export function drivePermissionRole(value) {
  const role = typeof value === "string" ? value : value?.role;
  if (["owner", "organizer", "fileOrganizer"].includes(role)) return "owner";
  if (role === "writer" || role === "editor") return "editor";
  return "viewer";
}

export function drivePermissionRoleLabel(value) {
  return { owner: "擁有者", editor: "可編輯", viewer: "僅檢視" }[drivePermissionRole(value)];
}

export function driveFileRole(file = {}) {
  if (file.ownedByMe === true) return "owner";
  return file.capabilities?.canEdit === true ? "editor" : "viewer";
}

export function googleDriveMembers(permissions = []) {
  return permissions
    .map(normalizeGoogleDrivePermission)
    .filter((permission) => permission.id && !permission.deleted && permission.type !== "anyone")
    .map((permission) => ({
      ...permission,
      name: permission.displayName || permission.emailAddress || permission.domain || "Google Drive 使用者",
      appRole: drivePermissionRole(permission),
    }))
    .sort((left, right) => {
      const rank = { owner: 0, editor: 1, viewer: 2 };
      return rank[left.appRole] - rank[right.appRole] || left.name.localeCompare(right.name, "zh-Hant");
    });
}

export function googleDriveGeneralAccess(permissions = []) {
  const anyone = permissions.map(normalizeGoogleDrivePermission).find((permission) => permission.type === "anyone" && !permission.deleted);
  return anyone ? { enabled: true, permissionId: anyone.id, role: drivePermissionRole(anyone) } : { enabled: false, permissionId: "", role: "viewer" };
}

// Preserve the exact shared-file URL and unrelated navigation context when
// switching from public viewing to the editor.
export function sharedViewerEditorLabel(sessionStatus, shareStatus) {
  if (sessionStatus !== 'signed-out') return '開啟編輯';
  return shareStatus === 'error' ? '登入以開啟' : '登入後編輯';
}

export function sharedEditorUrl(href, { requestEdit = true } = {}) {
  const url = new URL(href);
  url.searchParams.set('sharedEdit', '1');
  if (requestEdit) url.searchParams.set('requestEdit', '1');
  else url.searchParams.delete('requestEdit');
  return url.href;
}
