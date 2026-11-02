import { normalizeDriveFileId, normalizeDriveResourceKey } from "./drive-share.js";

// Public link access uses only the exact file named in the link and never an OAuth token.
export async function readPublicSharedBoard({ fileId, resourceKey = "", apiKey, signal, fetchImpl = globalThis.fetch, metadataTimeoutMs = 20_000, mediaTimeoutMs = 120_000 }) {
  const id = normalizeDriveFileId(fileId);
  const key = normalizeDriveResourceKey(resourceKey);
  if (!id || !apiKey) throw new Error("目前無法直接讀取這份分享檔案。");
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  const headers = key ? { "X-Goog-Drive-Resource-Keys": `${id}/${key}` } : {};
  const request = async (params, responseType, timeoutMs) => {
    const query = new URLSearchParams({ ...params, key: apiKey });
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, Math.max(1, timeoutMs));
    try {
      const aborted = new Promise((_, reject) => {
        if (controller.signal.aborted) reject(new Error("讀取已取消或逾時，請重新嘗試。"));
        else controller.signal.addEventListener("abort", () => reject(new Error("讀取已取消或逾時，請重新嘗試。")), { once: true });
      });
      const result = (async () => {
        const response = await fetchImpl(`${base}?${query}`, { headers, signal: controller.signal, referrerPolicy: "origin" });
        if (!response.ok) throw new Error("這份檔案目前無法免登入開啟。請確認分享權限，或登入 Google Drive。");
        return responseType === "json" ? response.json() : response.text();
      })();
      return await Promise.race([result, aborted]);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  };
  const params = { fields: "id,name,mimeType,version,resourceKey", supportsAllDrives: "true" };
  const before = await request(params, "json", metadataTimeoutMs);
  if (before.id !== id || !before.version || before.mimeType !== "application/json") throw new Error("無法確認分享檔案的身分或格式。");
  const content = await request({ alt: "media", supportsAllDrives: "true" }, "text", mediaTimeoutMs);
  const after = await request(params, "json", metadataTimeoutMs);
  if (after.id !== id || !after.version || after.version !== before.version) throw new Error("檔案在讀取期間已變更，請重新開啟連結。");
  return { content, name: String(after.name || "分享的工作檔") };
}
