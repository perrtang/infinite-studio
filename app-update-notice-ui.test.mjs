import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

test("the update notice pauses while any blocking dialog is open", () => {
  assert.match(main, /const hasBlockingDialog = Boolean\([\s\S]*showSettings[\s\S]*showDriveLibrary[\s\S]*showCollaboration[\s\S]*preparedDownloads\.length/);
  assert.match(main, /!updateNoticeDismissed && !hasBlockingDialog/);
  assert.match(styles, /\.app-update-notice \{[\s\S]*z-index: 90;/);
});

test("an available update starts as an accessible, collapsed header action", () => {
  assert.match(main, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(main, /className="app-update-trigger" aria-expanded=\{expanded\} aria-controls="app-update-details"/);
  assert.match(main, /\{expanded \? <Modal title="有新版本可更新"[\s\S]*?<aside id="app-update-details"/);
  assert.match(styles, /\.moodboard-app\[data-interface-mode="dark"\] \.app-update-trigger/);
  assert.match(main, /className="app-update-trigger"[\s\S]*?<Info size=\{15\}/);
  assert.match(main, /className="topbar-secondary">[\s\S]*?<AppUpdateNotice[\s\S]*?className=\{`topbar-save-button/);
});

test("update toast is temporary and can be dismissed without hiding the update entry", () => {
  assert.match(main, /setTimeout\(\(\) => setToastVisible\(false\), 5000\)/);
  assert.match(main, /aria-label="關閉更新提示" onClick=\{\(\) => setToastVisible\(false\)\}/);
  assert.match(main, /app-update-toast-details[\s\S]*?setExpanded\(true\)/);
});

test("the update notice uses one clear type hierarchy and consistent actions", () => {
  assert.match(styles, /\.app-update-notice-heading strong \{[\s\S]*font-size: calc\(14px \+ var\(--ui-font-offset, 0px\)\)/);
  assert.match(styles, /\.app-update-notice-heading small,[\s\S]*\.app-update-notice > p \{[\s\S]*font-size: calc\(11px \+ var\(--ui-font-offset, 0px\)\)/);
  assert.match(styles, /\.app-update-notice-actions :is\(button, a\) \{[\s\S]*font-size: calc\(11px \+ var\(--ui-font-offset, 0px\)\);[\s\S]*min-height: 38px;/);
  assert.match(styles, /\.app-update-notice-actions \.text-button \{[\s\S]*margin-top: 0;/);
});
