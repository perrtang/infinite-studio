import { driveErrorMessage, isGoogleDriveAuthorizationError } from "./drive-state.js";

// A failed request or readback is not proof that Drive never received a write.
// Keep feedback scoped to what is known, and preserve the active canvas.
export function driveSaveFailureFeedback(error, { localRecoveryWarning = "" } = {}) {
  const feedback = cloudFailureFeedback(error);
  if (!localRecoveryWarning) return feedback;
  return {
    ...feedback,
    warning: "本機復原副本也未完成，請先下載 .studio 備份；不要關閉目前分頁。",
    action: "backup",
  };
}

function cloudFailureFeedback(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  if (isGoogleDriveAuthorizationError(error)) return {
    title: "需要重新連結 Google Drive",
    message: "Google Drive 授權已失效，無法繼續更新。請重新連結後，再按「更新至雲端」。",
    action: "reconnect",
  };
  if (error?.code === "drive/overwrite-target") return {
    title: "更新已停止",
    message: "目前文件或雲端目標已變更。請重新檢查檔案，再決定要更新哪一份內容。",
    action: "review",
  };
  if (error?.code === "drive/conflict") return {
    title: "尚未確認更新完成",
    message: "雲端版本檢查未通過，可能在確認後又有變動。請重新確認後再試；目前畫布沒有被取代。",
    action: "retry",
  };
  if (error?.code === "drive/verification") return {
    title: "已送出更新，尚未確認結果",
    message: "更新已送出，但未能確認目前內容仍是雲端最新版本。請先檢查雲端狀態，再決定是否重新更新。",
    action: "review",
  };
  if (["drive/timeout", "drive/network"].includes(error?.code)) return {
    title: "尚未確認更新完成",
    message: "未收到 Google Drive 的完成確認，更新可能已送出。請檢查連線與雲端狀態後再試；目前畫布沒有被取代。",
    action: "review",
  };
  // Cloud errors cannot establish that a local recovery write succeeded.
  const message = error?.code === "drive/quota" || reason === "storageQuotaExceeded"
    ? "Google Drive 空間不足，請釋放空間後再試。"
    : error?.code === "drive/offline"
      ? "目前離線，請檢查網路連線後再試。"
      : error?.status === 429 || ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason)
        ? "Google Drive 暫時忙碌，請稍後再試。"
        : driveErrorMessage(error).replace("；畫布仍保存在這台裝置。", "，請稍後再試。");
  return {
    title: "更新未完成",
    message,
    action: error?.code === "drive/safety-check" || error?.status === 403 || error?.status === 404 ? "review" : "retry",
  };
}
