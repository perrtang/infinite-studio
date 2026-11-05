const KEY = "infinite-studio-recent-files-v1";
const MAX_RECENT = 20;

export function readRecentFiles(storage) {
  try {
    const entries = JSON.parse(storage.getItem(KEY) || "[]");
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry) => entry && ["local", "drive"].includes(entry.kind) && typeof entry.id === "string" && entry.id && typeof entry.openedAt === "string").slice(0, MAX_RECENT);
  } catch { return []; }
}

export function recordRecentFile(storage, entry, now = new Date()) {
  if (!["local", "drive"].includes(entry?.kind) || !entry.id) return readRecentFiles(storage);
  const next = [{ kind: entry.kind, id: String(entry.id), name: String(entry.name || "未命名 Infinite Studio"), resourceKey: String(entry.resourceKey || ""), openedAt: now.toISOString() }, ...readRecentFiles(storage).filter((item) => item.kind !== entry.kind || item.id !== String(entry.id))].slice(0, MAX_RECENT);
  try { storage.setItem(KEY, JSON.stringify(next)); } catch { /* History is optional; opening the file must still succeed. */ }
  return next;
}
