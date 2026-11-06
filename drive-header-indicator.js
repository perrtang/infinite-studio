// Compact status text for the existing save action; this never changes save behavior.
export function driveHeaderIndicator({ status, busy, dirty, paused } = {}) {
  if (busy) {
    if (status === "connecting") return "連結中";
    if (status === "checking") return "確認中";
    return "上傳中";
  }
  if (paused) return "待更新";
  if (dirty && (status === "synced" || status === "ready")) return "尚未儲存";
  return ({
    synced: "已儲存",
    "synced-local-warning": "本機備份未更新",
    "synced-history-warning": "本機版本紀錄未更新",
    pending: "尚未儲存",
    offline: "目前離線",
    quota: "空間不足",
    conflict: "需處理衝突",
    "authorization-required": "需要重新連結",
    disconnected: "尚未連結",
    error: "更新失敗",
    connecting: "連結中",
    checking: "確認中",
    syncing: "上傳中",
  })[status] || "";
}
