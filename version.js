export const APP_VERSION = "0.56.72";
export const APP_VERSION_LABEL = `App v${APP_VERSION}`;
export const APP_RELEASE_DATE = "2026-11-08";
export const APP_UPDATE_PREFERENCE_STORAGE_KEY = "infinite-moodboard-update-preference-v1";
export const APP_UPDATE_SNOOZE_STORAGE_KEY = "infinite-moodboard-update-snooze-v1";
export const APP_UPDATE_ATTEMPT_STORAGE_KEY = "infinite-moodboard-update-attempt-v1";
export const APP_UPDATE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;
const APP_BASE_URL = import.meta.env?.BASE_URL || "/";
export const APP_RELEASE_NOTES_URL = `${APP_BASE_URL.endsWith("/") ? APP_BASE_URL : `${APP_BASE_URL}/`}release-notes/v${APP_VERSION}.html`;
export const APP_UPDATE_MANIFEST_URL = import.meta.env?.VITE_MOODBOARD_UPDATE_MANIFEST_URL
  || `${APP_BASE_URL.endsWith("/") ? APP_BASE_URL : `${APP_BASE_URL}/`}infinite-moodboard-update.json`;

const SEMANTIC_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function semanticVersionParts(version) {
  const match = String(version || "").trim().match(SEMANTIC_VERSION_PATTERN);
  if (!match) throw new Error("版本編號格式不正確。");
  return match.slice(1).map(Number);
}

export function compareSemanticVersions(currentVersion, latestVersion) {
  const current = semanticVersionParts(currentVersion);
  const latest = semanticVersionParts(latestVersion);
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] < latest[index]) return -1;
    if (current[index] > latest[index]) return 1;
  }
  return 0;
}

export function normalizeUpdateManifest(value) {
  if (!value || typeof value !== "object") throw new Error("更新資訊格式不正確。");
  const version = String(value.version || "").trim();
  semanticVersionParts(version);
  const notesUrl = String(value.notesUrl || "").trim();
  if (notesUrl && notesUrl !== `release-notes/v${version}.html`) {
    throw new Error("更新說明連結格式不正確。");
  }
  return {
    product: String(value.product || "Infinite Studio").trim(),
    channel: String(value.channel || "stable").trim(),
    version,
    releasedAt: String(value.releasedAt || "").trim(),
    summary: String(value.summary || "").trim(),
    url: String(value.url || "").trim(),
    notesUrl,
  };
}

export function resolveUpdateNotesUrl(notesUrl, manifestUrl) {
  const value = String(notesUrl || "").trim();
  if (!value) return "";
  const resolved = new URL(value, manifestUrl);
  return ["http:", "https:"].includes(resolved.protocol) ? resolved.href : "";
}

export function normalizeUpdatePreference(value) {
  return value === "auto" ? "auto" : "manual";
}

export function loadUpdatePreference(storage = globalThis.localStorage) {
  try {
    return normalizeUpdatePreference(storage?.getItem(APP_UPDATE_PREFERENCE_STORAGE_KEY));
  } catch {
    return "manual";
  }
}

export function saveUpdatePreference(storage = globalThis.localStorage, value = "manual") {
  const preference = normalizeUpdatePreference(value);
  try {
    storage?.setItem(APP_UPDATE_PREFERENCE_STORAGE_KEY, preference);
  } catch {
    // Private or embedded browsing contexts can deny storage without blocking editing.
  }
  return preference;
}

export function snoozeAppUpdate(
  storage = globalThis.localStorage,
  version,
  now = Date.now(),
  durationMs = APP_UPDATE_SNOOZE_DURATION_MS,
) {
  const record = {
    version: String(version || "").trim(),
    until: Number(now) + Math.max(0, Number(durationMs) || 0),
  };
  try {
    storage?.setItem(APP_UPDATE_SNOOZE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // The current in-memory dismissal still protects the session when storage is unavailable.
  }
  return record;
}

export function isAppUpdateSnoozed(storage = globalThis.localStorage, version, now = Date.now()) {
  try {
    const record = JSON.parse(storage?.getItem(APP_UPDATE_SNOOZE_STORAGE_KEY) || "null");
    return record?.version === String(version || "").trim()
      && Number.isFinite(Number(record.until))
      && Number(record.until) > Number(now);
  } catch {
    return false;
  }
}

export function buildUpdateReloadUrl(href, version) {
  const url = new URL(href);
  url.searchParams.set("appUpdate", String(version || "latest").trim() || "latest");
  url.searchParams.set("updatedAt", String(Date.now()));
  return url.href;
}
