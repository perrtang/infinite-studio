import assert from "node:assert/strict";
import test from "node:test";
import { detectInterfaceLocale, loadInterfaceLocalePreference, translateInterfaceText } from "./i18n.js";

test("sharing permission requests and recovery have English and Simplified Chinese copy", () => {
  const phrases = [
    "需要編輯權限", "重新檢查權限", "正在確認權限…",
    "目前仍是檢視權限；請確認擁有者已授予編輯權限。",
    "無法確認權限，請檢查 Google Drive 連線後再試。",
    "請先重新連結 Google Drive，再變更權限。", "權限已更新。",
    "你好，請將我的 Google 帳號設為這份 Infinite Studio 工作檔的編輯者：", "我的 Google 帳號：",
  ];
  for (const phrase of phrases) {
    assert.doesNotMatch(translateInterfaceText(phrase, "en"), /[\u3400-\u9fff]/u, phrase);
    assert.notEqual(translateInterfaceText(phrase, "zh-Hans"), phrase, phrase);
  }
  assert.match(translateInterfaceText("請將你的 Google 帳號與工作檔連結傳給擁有者，請對方在 Google Drive 的「共用」中授予編輯權限。核准後回到此處重新整理權限。", "zh-Hans"), /文件链接/);
});

test("automatic Drive authorization explains storage and recovery in English", () => {
  assert.equal(translateInterfaceText("移除自動連線授權", "en"), "Remove automatic connection authorization");
  assert.match(translateInterfaceText("為了在新分頁恢復連線，Infinite Studio 會在伺服器加密保存 Drive 授權。", "en"), /encrypted/);
  assert.match(translateInterfaceText("目前無法完成 Google Drive 連結；請稍後重試，目前工作內容未受影響。", "en"), /unchanged/);
  assert.equal(translateInterfaceText("移除自動連線授權", "zh-Hans"), "移除自动连接授权");
});

test("automatic locale follows the device time zone and falls back safely", () => {
  assert.equal(detectInterfaceLocale(["en-US"], "Asia/Taipei"), "zh-Hant");
  assert.equal(detectInterfaceLocale(["en-US"], "Asia/Shanghai"), "zh-Hans");
  assert.equal(detectInterfaceLocale(["zh-TW"], "Asia/Urumqi"), "zh-Hans");
  for (const zone of ["Asia/Hong_Kong", "Asia/Singapore", "Asia/Tokyo", "America/New_York", "UTC"]) {
    assert.equal(detectInterfaceLocale(["zh-TW"], zone), "en", zone);
  }
  assert.equal(detectInterfaceLocale(["zh-TW"], ""), "zh-Hant");
  assert.equal(detectInterfaceLocale(["zh-CN"], ""), "zh-Hans");
  assert.equal(detectInterfaceLocale(["zh-HK", "zh-TW"], ""), "en");
  assert.equal(detectInterfaceLocale(["zh-Hans"], ""), "en");
  assert.equal(detectInterfaceLocale([], ""), "en");
});

test("current English Drive and workspace wording uses the Infinite Studio name", () => {
  const messages = [
    "Drive 授權和 PETFASHION 登入分開；不會讀取整個雲端硬碟，也不會因登入而自動上傳。",
    "目前本機畫布",
    "系統會嘗試自動儲存本機副本，請留意備份狀態。",
    "Google Drive 已連結；尚未主動儲存前不會上傳畫布。",
    "Google Drive 空間不足；畫布仍安全保存在這台裝置。",
  ];
  for (const message of messages) assert.doesNotMatch(translateInterfaceText(message, "en"), /moodboard/i);
  assert.equal(translateInterfaceText("支援 .studio 與舊版工作檔", "en"), "Supports .studio and legacy project files");
});

test("a saved manual language wins; absent, auto and inaccessible storage use automatic mode", () => {
  const storage = (value) => ({ getItem: () => value });
  assert.equal(loadInterfaceLocalePreference(storage("zh-Hant")), "zh-Hant");
  assert.equal(loadInterfaceLocalePreference(storage("zh-Hans")), "zh-Hans");
  assert.equal(loadInterfaceLocalePreference(storage("en")), "en");
  assert.equal(loadInterfaceLocalePreference(storage("auto")), "auto");
  assert.equal(loadInterfaceLocalePreference(storage(null)), "auto");
  assert.equal(loadInterfaceLocalePreference(storage("invalid")), "auto");
  assert.equal(loadInterfaceLocalePreference({ getItem: () => { throw new Error("blocked"); } }), "auto");
});

test("automatic setting and public-view messages have translated interface copy", () => {
  assert.equal(translateInterfaceText("自動（依裝置時區）", "en"), "Automatic (device time zone)");
  assert.equal(translateInterfaceText("登入後編輯", "en"), "Sign in to edit");
  assert.equal(translateInterfaceText(" · 模擬資料", "en"), " · Sample data");
  assert.equal(translateInterfaceText("登入後編輯", "zh-Hans"), "登录后编辑");
});

test("account access copy is available in all built-in locales", () => {
  assert.equal(translateInterfaceText("查看更新說明", "en"), "View release notes");
  assert.equal(translateInterfaceText("版本資訊與更新方式", "en"), "Version details and update options");
  assert.equal(translateInterfaceText("帳號與隱私", "en"), "Account & privacy");
  assert.equal(translateInterfaceText("使用 Google 帳號登入", "en"), "Sign in with Google");
  assert.equal(translateInterfaceText("Email 驗證登入", "en"), "Verified email sign-in");
  assert.equal(translateInterfaceText("Facebook（僅限本機測試）", "en"), "Facebook (local test only)");
  assert.equal(translateInterfaceText("寄送連結", "en"), "Send link");
  assert.match(translateInterfaceText("登入方式沒有連結到原本帳號，已停止處理；原 Moodboard 不受影響。", "en"), /original account/);
  assert.equal(translateInterfaceText("會員身份由 PETFASHION 統一管理", "en"), "Membership is managed through PETFASHION");
  assert.match(translateInterfaceText("共用電腦使用完畢後，請登出並從設定清除本機 Moodboard；關閉登入工作階段不會自動刪除工作檔。", "en"), /shared computer/);
  assert.match(translateInterfaceText("這是可選項，不影響登入、同步或 3D 功能。", "en"), /optional/);
  assert.equal(translateInterfaceText("登入與資料說明", "en"), "Sign-in and data details");
  assert.match(translateInterfaceText("作品、素材與版本預設保存在這台裝置，不會自動上傳。", "en"), /never uploaded automatically/);
  assert.match(translateInterfaceText("公開 Beta 只保存在此裝置，不會加入寄送名單；正式啟用前會再次確認。", "en"), /does not add you to a mailing list/);
  assert.equal(translateInterfaceText("選填，只保存在此裝置", "zh-Hans"), "选填，只保存在此设备");
  assert.equal(translateInterfaceText("選填，可隨時取消", "zh-Hans"), "选填，可随时取消");
  assert.equal(translateInterfaceText("。", "en"), ".");
  assert.equal(translateInterfaceText("帳號與隱私", "zh-Hans"), "账号与隐私");
});

test("the default fashion monochrome palette name is localized", () => {
  assert.equal(translateInterfaceText("時尚黑白", "en"), "Fashion Monochrome");
  assert.equal(translateInterfaceText("時尚黑白", "zh-Hans"), "时尚黑白");
});

test("dynamic account labels retain the user name", () => {
  assert.equal(translateInterfaceText("帳號：Perr Tang", "en"), "Account: Perr Tang");
  assert.equal(translateInterfaceText("帳號與設定", "en"), "Account & settings");
  assert.equal(translateInterfaceText("帳號與設定：Perr Tang", "en"), "Account & settings: Perr Tang");
});

test("paper, annotation, grid, and semantic grouping copy is localized", () => {
  assert.equal(translateInterfaceText("紙張", "en"), "Paper");
  assert.equal(translateInterfaceText("符合內容", "en"), "Fit to content");
  assert.equal(translateInterfaceText("右下外側", "en"), "Bottom right outside");
  assert.equal(translateInterfaceText("紙張＋內容", "en"), "Paper + content");
  assert.equal(translateInterfaceText("3 欄、2 列、共 6 個物件", "en"), "3 columns, 2 rows, 6 objects total");
  assert.equal(translateInterfaceText("已建立 3 欄、2 列，共 6 個物件的 Grid。", "en"), "Created a 3-column × 2-row grid with 6 objects.");
  assert.equal(translateInterfaceText("已將 4 個物件建立為群組；按住 ⌘／Ctrl 可穿透選取。", "en"), "Grouped 4 objects. Hold ⌘/Ctrl to select through the group.");
  assert.equal(translateInterfaceText("右下外側", "zh-Hans"), "右下外侧");
  assert.equal(translateInterfaceText("紙張＋內容", "zh-Hans"), "纸张＋内容");
});

test("shape quick sizes and editable polygon or star controls are localized", () => {
  assert.equal(translateInterfaceText("多邊形", "en"), "Polygon");
  assert.equal(translateInterfaceText("多邊形邊數", "en"), "Polygon sides");
  assert.equal(translateInterfaceText("星形樣式", "en"), "Star style");
  assert.equal(translateInterfaceText("內縮比例", "en"), "Inner radius");
  assert.equal(translateInterfaceText("快速尺寸", "en"), "Quick sizes");
  assert.equal(translateInterfaceText("紙張尺寸", "en"), "Paper sizes");
  assert.equal(translateInterfaceText("限時動態／短影音", "en"), "Story / short video");
  assert.equal(translateInterfaceText("12 芒 · 32%", "en"), "12 points · 32%");
  assert.equal(translateInterfaceText("紙張尺寸", "zh-Hans"), "纸张尺寸");
  assert.equal(translateInterfaceText("多邊形邊數", "zh-Hans"), "多边形边数");
});

test("object color library controls and feedback are localized", () => {
  assert.equal(translateInterfaceText("色彩庫", "en"), "Color library");
  assert.equal(translateInterfaceText("加入目前色彩", "en"), "Add current color");
  assert.equal(translateInterfaceText("文字色彩色彩庫", "en"), "Text color library");
  assert.equal(translateInterfaceText("已載入 3 個新色彩。", "en"), "Loaded 3 new colors.");
  assert.equal(translateInterfaceText("儲存在這台裝置", "zh-Hans"), "保存在这台设备");
  assert.equal(translateInterfaceText("色彩組合", "en"), "Color set");
  assert.equal(translateInterfaceText("紙張色彩色彩組合 我的色彩", "en"), "Paper color color set: My colors");
  assert.equal(translateInterfaceText("已建立「我的色彩」並加入 #ABCDEF。", "en"), "Created “My colors” and added #ABCDEF.");
  assert.equal(translateInterfaceText("已匯入 2 組、共 18 個色彩；另有 1 組因上限略過。", "en"), "Imported 2 sets with 18 colors; skipped 1 sets because of the limit.");
  assert.equal(translateInterfaceText("這個色碼無法加入色彩組合。", "en"), "This color value cannot be added to the color set.");
  assert.equal(translateInterfaceText("舊版色彩庫超過 48 色上限。", "en"), "The legacy color library exceeds the 48-color limit.");
  assert.equal(translateInterfaceText("全域可用 · 儲存在這台裝置", "zh-Hans"), "全局可用 · 保存在这台设备");
});

test("workspace search, ruler, and shortcut copy is localized", () => {
  assert.equal(translateInterfaceText("搜尋或篩選圖層", "en"), "Search or filter layers");
  assert.equal(translateInterfaceText("尺規與輔助導引線", "en"), "Rulers and guides");
  assert.equal(translateInterfaceText("鎖定所有輔助導引線", "en"), "Lock all guides");
  assert.equal(translateInterfaceText("解除鎖定所有輔助導引線", "en"), "Unlock all guides");
  assert.equal(translateInterfaceText("已重新設定尺規與導引線原點", "en"), "Ruler and guide origin updated");
  assert.equal(translateInterfaceText("拖曳以重新設定尺規原點；點擊切換 px 單位", "en"), "Drag to reposition the ruler origin; click to change px units");
  assert.equal(translateInterfaceText("已吸附", "en"), "Snapped");
  assert.equal(translateInterfaceText("鎖定此導引線", "en"), "Lock this guide");
  assert.equal(translateInterfaceText("刪除此導引線", "en"), "Delete this guide");
  assert.equal(translateInterfaceText("垂直導引線 24 px；已鎖定", "en"), "Vertical guide 24 px; locked");
  assert.equal(translateInterfaceText("水平導引線 12 mm；目前僅檢視", "en"), "Horizontal guide 12 mm; view-only");
  assert.equal(translateInterfaceText("已刪除輔助導引線", "en"), "Guide deleted");
  assert.equal(translateInterfaceText("輔助導引線，顯示於所有物件上方", "en"), "Guides, shown above all objects");
  assert.equal(translateInterfaceText("至少選取 2 條未鎖定的導引線才能建立群組。", "en"), "Select at least 2 unlocked guides to create a group.");
  assert.equal(translateInterfaceText("導引線群組 01", "en"), "Guide group 01");
  assert.equal(translateInterfaceText("目前為僅檢視；無法刪除輔助導引線。", "en"), "This board is view-only. Guides cannot be deleted.");
  assert.equal(translateInterfaceText("平移工具 Shift+H（按住 Shift 可暫時選取）", "en"), "Hand tool Shift+H (hold Shift to select temporarily)");
  assert.equal(translateInterfaceText("平移工具 Shift+H（按住 Space 可暫時使用；按住 Shift 可暫時選取）；連按兩下回到 100%", "en"), "Hand tool Shift+H (hold Space to use temporarily; hold Shift to select temporarily); double-click or double-tap to return to 100%");
  assert.equal(translateInterfaceText("平移工具 Shift+H（按住 Space 可暫時使用；按住 Shift 可暫時選取）；連按兩下回到 100%", "zh-Hans"), "平移工具 Shift+H（按住 Space 可暂时使用；按住 Shift 可暂时选择）；双击回到 100%");
  assert.match(translateInterfaceText("縮放範圍：拖曳框住要檢視的區域；按住 Option／Alt 可反向縮小，Esc 取消。", "en"), /hold Option\/Alt/);
  assert.equal(translateInterfaceText("已縮小框選區域。", "en"), "The selected area is now zoomed out.");
  assert.equal(translateInterfaceText("已放大框選區域。", "en"), "The selected area is now enlarged.");
  assert.equal(translateInterfaceText("縮放視窗", "zh-Hans"), "缩放视窗");
  assert.equal(translateInterfaceText("拖曳放大區域", "zh-Hans"), "拖动放大区域");
  assert.equal(translateInterfaceText("搜尋快速鍵", "en"), "Search shortcuts");
  assert.equal(translateInterfaceText("顯示或隱藏兩側欄", "en"), "Show or hide both side panels");
  assert.equal(translateInterfaceText("移動畫布工具列", "en"), "Move canvas toolbar");
  assert.equal(translateInterfaceText("畫布工具列已回到預設位置。", "zh-Hans"), "画布工具栏已回到默认位置。");
  assert.equal(translateInterfaceText("取消目前調整？", "en"), "Cancel the current adjustment?");
  assert.equal(translateInterfaceText("移動 3 個物件", "en"), "Move 3 objects");
  assert.equal(translateInterfaceText("調整「標題」文字框", "en"), "Resize the text frame for “標題”");
  assert.equal(translateInterfaceText("3D 旋轉物件", "en"), "Rotate object in 3D");
  assert.equal(translateInterfaceText("搜尋構圖名稱", "zh-Hans"), "搜索构图名称");
});

test("source workspace controls and isolation feedback are localized", () => {
  assert.equal(translateInterfaceText("素材工具", "en"), "Source tools");
  assert.equal(translateInterfaceText("新增到 Moodboard", "en"), "Add to Moodboard");
  assert.equal(translateInterfaceText("定位 3 個可見畫布實例", "en"), "Locate 3 visible canvas instances");
  assert.equal(translateInterfaceText("2 個來源素材", "en"), "2 source assets");
  assert.equal(translateInterfaceText("目前正在操作來源素材；畫布物件未被變更。", "en"), "You are working with a source asset. Canvas objects were not changed.");
  assert.equal(translateInterfaceText("符合素材到視窗", "en"), "Fit source to window");
  assert.equal(translateInterfaceText("素材縮放 75%；點擊回到 100%", "en"), "Source zoom 75%; click to return to 100%");
  assert.equal(translateInterfaceText("下載目前的原始素材", "zh-Hans"), "下载当前的原始素材");
  assert.equal(translateInterfaceText("回到 Moodboard 後復原 ⌘Z", "en"), "Return to the Moodboard to undo ⌘Z");
  assert.equal(translateInterfaceText("素材檢視中 · Moodboard 名稱唯讀", "en"), "Source view · Moodboard name is read-only");
});

test("Google Drive storage and recovery copy is localized", () => {
  assert.equal(translateInterfaceText("正在整理更新結果…", "en"), "Finalizing the update result…");
  assert.equal(translateInterfaceText("前往下載本機備份", "en"), "Go to download a local backup");
  assert.match(translateInterfaceText("本機復原副本也未完成，請先下載 .moodboard 備份；不要關閉目前分頁。", "en"), /keep this tab open/);
  assert.equal(translateInterfaceText("尚未確認更新完成", "en"), "Update not yet confirmed");
  assert.equal(translateInterfaceText("儲存與同步", "en"), "Storage & sync");
  assert.equal(translateInterfaceText("選擇主要儲存位置", "en"), "Choose the primary storage location");
  assert.equal(translateInterfaceText("這台裝置", "en"), "This device");
  assert.equal(translateInterfaceText("登入並連結 Google Drive", "en"), "Sign in and connect Google Drive");
  assert.equal(translateInterfaceText("使用這台裝置", "en"), "Use this device");
  assert.equal(translateInterfaceText("適合跨裝置開啟；登入與 Drive 授權會在同一流程完成。", "en"), "Best for cross-device access. Sign-in and Drive authorization complete in one flow.");
  assert.match(translateInterfaceText("切換時不會刪除原本檔案；選擇 Drive 後會先說明，並在同一流程完成登入與授權。", "en"), /one flow/);
  assert.match(translateInterfaceText("PETFASHION 身分與 Drive 權限彼此獨立，但會在同一個連結流程完成。", "en"), /stay independent/);
  assert.match(translateInterfaceText("繼續後會登入 PETFASHION，並由 Google 授予 drive.file 權限；只存取 Infinite Moodboard 建立或你指定的檔案。連結完成不會立即上傳，第一次儲存才會建立 Drive 工作檔，本機安全副本仍會保留。", "en"), /Connecting does not upload immediately/);
  assert.equal(translateInterfaceText("我的 Moodboards", "en"), "My Moodboards");
  assert.equal(translateInterfaceText("下載 `.moodboard` 備份", "en"), "Download `.moodboard` backup");
  assert.equal(translateInterfaceText("已儲存在這台裝置 · 上午10:42", "en"), "Saved on this device · 10:42");
  assert.equal(translateInterfaceText("本機安全副本已更新 · 下午02:42", "en"), "Local safety copy updated · 14:42");
  assert.equal(translateInterfaceText("本機復原副本已更新 · 下午02:42；主要位置等待手動儲存", "en"), "Local recovery copy updated · 14:42; primary location awaiting manual save");
  assert.equal(translateInterfaceText("主要位置：Google Drive", "en"), "Primary location: Google Drive");
  assert.equal(translateInterfaceText("儲存失敗；變更仍留在目前分頁", "en"), "Save failed. Changes remain in this tab.");
  assert.equal(translateInterfaceText("只要求 drive.file 最小權限", "en"), "Requests only the minimum drive.file permission");
  assert.match(translateInterfaceText("Google Drive 是主要保存位置；每次編輯仍會先安全保存在這台裝置。", "en"), /saved on this device first/);
  assert.equal(translateInterfaceText("Google Drive 已同步", "en"), "Google Drive synced");
  assert.equal(translateInterfaceText("Google Drive 已同步；本機同步佇列待整理", "en"), "Google Drive synced; the local sync queue needs cleanup");
  assert.equal(translateInterfaceText("本機同步佇列狀態暫時無法更新。", "en"), "The local sync queue could not be updated temporarily.");
  assert.equal(translateInterfaceText("本機安全暫存", "en"), "Local safety cache");
  assert.equal(translateInterfaceText("等待同步", "en"), "Waiting to sync");
  assert.equal(translateInterfaceText("新增 Moodboard", "en"), "New Moodboard");
  assert.equal(translateInterfaceText("Google Drive 版本", "en"), "Google Drive versions");
  assert.equal(translateInterfaceText("Drive 版本 19", "en"), "Drive version 19");
  assert.equal(translateInterfaceText("內容 r12 · 2 個物件 · 10/20 15:20", "en"), "Content r12 · 2 objects · 10/20 15:20");
  assert.equal(translateInterfaceText("2 / 5 份 Moodboard", "en"), "2 / 5 Moodboards");
  assert.equal(translateInterfaceText("2 / 5 個 Drive 檔案", "en"), "2 / 5 Drive files");
  assert.equal(translateInterfaceText("目前 Drive 帳號：person@example.com", "en"), "Current Drive account: person@example.com");
  assert.match(translateInterfaceText("Google Drive 空間不足；畫布仍安全保存在這台裝置。", "en"), /remains safely saved/);
  assert.match(translateInterfaceText("正在嘗試更新本機復原副本，再確認 Drive 空間與遠端版本…", "en"), /Trying to update the local recovery copy/);
  assert.match(translateInterfaceText("已中斷這個分頁的 Google Drive；雲端檔案、本機畫布與 PETFASHION 登入都未受影響。", "en"), /disconnected from this tab/);
  assert.equal(translateInterfaceText("儲存與同步", "zh-Hans"), "保存与同步");
  assert.equal(translateInterfaceText("選擇主要儲存位置", "zh-Hans"), "选择主要保存位置");
  assert.equal(translateInterfaceText("這台裝置", "zh-Hans"), "这台设备");
  assert.equal(translateInterfaceText("中斷 Drive 連結", "zh-Hans"), "中断 Drive 连接");
  assert.equal(translateInterfaceText("同步已暫停：選擇要保留的版本", "en"), "Sync paused: choose which version to keep");
  assert.equal(translateInterfaceText("將 Drive 版本開成新 Moodboard", "en"), "Open the Drive version as a new Moodboard");
  assert.equal(translateInterfaceText("將目前內容另存新檔", "en"), "Save current work as a new file");
  assert.equal(translateInterfaceText("更多處理方式", "en"), "More options");
  assert.equal(translateInterfaceText("以目前內容覆寫 Drive…", "en"), "Replace Drive with current work…");
  assert.equal(translateInterfaceText("確認覆寫 Drive", "zh-Hans"), "确认覆盖 Drive");
  assert.equal(translateInterfaceText("最後編輯 下午12:30", "en"), "Last edited 下午12:30");
});

test("file menu and independent paper workflow are localized", () => {
  assert.equal(translateInterfaceText("檔案", "en"), "File");
  assert.equal(translateInterfaceText("另存為 .moodboard…", "en"), "Save a .moodboard copy…");
  assert.equal(translateInterfaceText("匯出瀏覽器版（HTML）", "en"), "Export browser copy (HTML)");
  assert.equal(translateInterfaceText("輸出選取合成圖…", "en"), "Output selected composition…");
  assert.equal(translateInterfaceText("符合內容的參考邊距", "en"), "Reference padding for fitting content");
  assert.equal(translateInterfaceText("另存為 .moodboard…", "zh-Hans"), "另存为 .moodboard…");
});

test("local file autosave choice and status are localized", () => {
  assert.equal(translateInterfaceText("選擇本機自動儲存檔案", "en"), "Choose a local autosave file");
  assert.equal(translateInterfaceText("選擇 Finder／檔案位置", "en"), "Choose Finder / Files location");
  assert.equal(translateInterfaceText("主要位置：這個瀏覽器", "en"), "Primary location: this browser");
  assert.equal(translateInterfaceText("尚未指定 .moodboard 檔案", "en"), "No .moodboard file selected");
  assert.equal(translateInterfaceText("已自動儲存至 Campaign.moodboard · 下午02:42", "en"), "Autosaved to Campaign.moodboard · 下午02:42");
  assert.equal(translateInterfaceText("選擇本機自動儲存檔案", "zh-Hans"), "选择本地自动保存文件");
});

test("real-time collaboration copy is localized", () => {
  assert.equal(translateInterfaceText("建立共編空間", "en"), "Create collaboration room");
  assert.equal(translateInterfaceText("分享", "en"), "Share");
  assert.equal(translateInterfaceText("建立分享連結", "en"), "Create share link");
  assert.equal(translateInterfaceText("複製分享連結", "en"), "Copy share link");
  assert.match(translateInterfaceText("任何持有連結且已登入的用戶都能檢視；編輯仍需由擁有者核准。", "en"), /owner still approves/);
  assert.equal(translateInterfaceText("擁有存取權的使用者", "en"), "People with access");
  assert.equal(translateInterfaceText("連線後才能更新成員權限", "en"), "Reconnect to update member access");
  assert.equal(translateInterfaceText("一般存取權限", "en"), "General access");
  assert.equal(translateInterfaceText("檢視者", "en"), "Viewer");
  assert.equal(translateInterfaceText("編輯者", "zh-Hans"), "编辑者");
  assert.equal(translateInterfaceText("正在準備分享連結…", "en"), "Preparing share link…");
  assert.equal(translateInterfaceText("加入別人分享的 Moodboard", "en"), "Join a Moodboard someone shared");
  assert.match(translateInterfaceText("建立分享連結期間已切換 Moodboard；剛才的內容已保留，請重新開啟分享。", "en"), /previous work is safe/);
  assert.match(translateInterfaceText("上次的分享連結屬於另一份 Moodboard；可為目前內容建立新連結。", "en"), /another Moodboard/);
  assert.match(translateInterfaceText("恢復分享連結期間已切換 Moodboard；目前內容不會被取代。", "en"), /was not replaced/);
  assert.match(translateInterfaceText("上次的共編空間缺少可複製的分享連結；原空間與協作者不會變更。請明確建立新連結，並把新連結重新提供給協作者。", "en"), /remain unchanged/);
  assert.equal(translateInterfaceText("登入後開啟分享的 Moodboard", "en"), "Sign in to open the shared Moodboard");
  assert.equal(translateInterfaceText("可編輯", "en"), "Can edit");
  assert.equal(translateInterfaceText("3 個變更等待同步", "en"), "3 changes waiting to sync");
  assert.equal(translateInterfaceText("協作，2 位成員在線", "en"), "Collaboration, 2 collaborators online");
  assert.equal(translateInterfaceText("分享，2 位成員在線", "en"), "Share, 2 collaborators online");
  assert.equal(translateInterfaceText("所有變更已同步。", "en"), "All changes are synced.");
  assert.match(translateInterfaceText("目前帳號沒有這個共編空間的權限，或雲端安全規則尚未啟用。", "en"), /cannot access/);
  assert.equal(translateInterfaceText("離線與隱私", "zh-Hans"), "离线与隐私");
});
