(() => {
  const copies = {
    "zh-Hant": ["Google Drive 連結｜Infinite Studio", "無法完成 Google Drive 連結", "沒有收到有效的授權結果。", "請回到原本的工作頁面，重新連結 Google Drive。", "請回到工作頁面", "無法通知原本的頁面完成連結。", "請回到 Infinite Studio，重新連結 Google Drive。", "Google Drive 尚未連結", "請回到原本的工作頁面查看狀態，並視需要重新嘗試。", "正在返回 Infinite Studio", "正在完成連結，請稍候。", "如果這個視窗沒有自動關閉，請回到原本的工作頁面。"],
    "zh-Hans": ["Google Drive 连接｜Infinite Studio", "无法完成 Google Drive 连接", "没有收到有效的授权结果。", "请回到原来的工作页面，重新连接 Google Drive。", "请回到工作页面", "无法通知原来的页面完成连接。", "请回到 Infinite Studio，重新连接 Google Drive。", "Google Drive 尚未连接", "请回到原来的工作页面查看状态，并根据需要重试。", "正在返回 Infinite Studio", "正在完成连接，请稍候。", "如果此窗口没有自动关闭，请回到原来的工作页面。"],
    en: ["Google Drive connection | Infinite Studio", "Unable to connect Google Drive", "No valid authorization result was received.", "Return to your project and reconnect Google Drive.", "Return to your project", "The original page could not be notified.", "Return to Infinite Studio and reconnect Google Drive.", "Google Drive is not connected", "Return to your project to check the status and try again if needed.", "Returning to Infinite Studio", "Completing your connection. Please wait.", "If this window does not close automatically, return to your project."],
  };
  let locale = "auto";
  try { locale = window.localStorage.getItem("infinite-moodboard-interface-locale-v1") || "auto"; } catch { /* Storage may be blocked. */ }
  if (!["zh-Hant", "zh-Hans", "en"].includes(locale)) {
    let zone = "";
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone.toLowerCase(); } catch { /* Use locale fallback below. */ }
    if (zone) locale = zone === "asia/taipei" ? "zh-Hant" : ["asia/shanghai", "asia/chongqing", "asia/chungking", "asia/harbin", "asia/urumqi"].includes(zone) ? "zh-Hans" : "en";
    else {
      try { const region = new Intl.Locale(window.navigator.language).region; locale = region === "TW" ? "zh-Hant" : region === "CN" ? "zh-Hans" : "en"; } catch { locale = "en"; }
    }
  }
  const copy = copies[locale];
  document.documentElement.lang = locale;
  document.title = copy[0];
  const result = new URLSearchParams(window.location.search).get("result");
  const title = document.getElementById("title");
  const message = document.getElementById("message");
  const help = document.getElementById("help");
  help.textContent = copy[11];
  if (result !== "success" && result !== "error") {
    title.textContent = copy[1];
    message.textContent = copy[2];
    help.textContent = copy[3];
    return;
  }
  if (!window.opener || window.opener.closed) {
    title.textContent = copy[4];
    message.textContent = copy[5];
    help.textContent = copy[6];
    return;
  }
  window.opener.postMessage({ type: "infinite-studio-drive-oauth", result }, window.location.origin);
  if (result === "error") {
    title.textContent = copy[7];
    message.textContent = copy[8];
  } else {
    title.textContent = copy[9];
    message.textContent = copy[10];
  }
  window.setTimeout(() => window.close(), 400);
})();
