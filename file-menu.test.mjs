import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

test("file menu consolidates file, output, and management actions", () => {
  assert.match(main, /function FileMenu\(/);
  assert.match(main, /下載本機副本…/);
  assert.match(main, /匯出瀏覽器版（HTML）/);
  assert.match(main, /匯出選取素材…/);
  assert.match(main, /輸出選取合成圖…/);
  assert.match(main, /分享與共同編輯/);
  assert.match(main, /鎖定所有輔助導引線/);
  assert.match(main, /解除鎖定所有輔助導引線/);
  assert.match(main, /版本紀錄/);
  assert.match(main, /關於 Infinite Studio/);
  assert.match(main, /const \{ createPortableHtml \} = await loadPortableRuntime\(\)/);
});

test("file menu supports keyboard navigation, escape recovery, and disabled output items", () => {
  assert.match(main, /className=\{`topbar-button file-menu-trigger[\s\S]{0,180}aria-label="主選單"/);
  assert.match(main, /aria-label="主選單"\s*title="主選單"/);
  assert.match(main, /aria-haspopup="menu"/);
  assert.match(main, /role="menu"[\s\S]*aria-label="主選單"/);
  assert.match(main, /querySelectorAll\('\[role="menuitem"\]:not\(:disabled\)'\)/);
  assert.match(main, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/);
  assert.match(main, /event\.stopImmediatePropagation\(\)/);
  assert.match(main, /disabled=\{!canExportObjects\}/);
  assert.match(main, /disabled=\{!canOutputComposition\}/);
  assert.match(main, /guideControlsDisabled=\{cloudReadOnly \|\| sourceModeActive\}/);
});

test("header keeps the file menu visible on mobile without restoring scattered file actions", () => {
  assert.match(main, /<FileMenu[\s\S]*onOpenLibrary=\{openGoogleDriveLibrary\}/);
  assert.doesNotMatch(main, /<button className="topbar-button" type="button" onClick=\{exportBrowserHtml\}/);
  assert.doesNotMatch(main, /<button className="topbar-button" type="button" onClick=\{openVersionModal\}/);
  assert.match(styles, /\.file-actions \.file-menu-trigger \{[\s\S]*display: flex;[\s\S]*min-height: 44px;/);
  assert.match(styles, /\.file-menu-section > button \{[\s\S]*min-height: 48px;/);
});


test("header menus are non-modal and account settings remain accessible", () => {
  const file = main.slice(main.indexOf("function FileMenu("), main.indexOf("function AccountMenu("));
  const account = main.slice(main.indexOf("function AccountMenu("), main.indexOf("function MobileTopbarMoreMenu("));
  const settings = main.slice(main.indexOf("function SettingsModal("), main.indexOf("function InterfaceThemeModal("));
  assert.doesNotMatch(file, /<Modal/);
  assert.match(file, /aria-haspopup="menu"/);
  assert.match(account, /aria-haspopup="menu"/);
  assert.match(account, /aria-expanded=\{open\}/);
  for (const name of ["帳號與隱私", "儲存與同步", "一般設定", "外觀", "工作區", "關於"]) assert.ok(account.includes(name));
  assert.match(account, /ArrowDown[\s\S]*ArrowUp/);
  assert.match(settings, /settings-popover/);
  assert.doesNotMatch(settings, /aria-modal="true"/);
  assert.match(settings, /closeOutside/);
});
