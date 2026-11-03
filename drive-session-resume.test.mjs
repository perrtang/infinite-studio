import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const driveState = await readFile(new URL("./drive-state.js", import.meta.url), "utf8");
const driveStorage = await readFile(new URL("./drive-storage.js", import.meta.url), "utf8");

test("refresh restores an enabled Drive connection silently for the same signed-in owner", () => {
  assert.match(main, /const driveRestoreAttemptRef = useRef\(""\)/);
  assert.match(main, /status: initialDriveSettingsRef\.current\.enabled \? "authorization-required" : "disconnected"/);
  assert.match(main, /busy: false,\s*message: initialDriveSettingsRef\.current\.enabled \? "Drive 檔案連結仍已保留/);
  assert.match(main, /connectionOwnerUid && driveSettings\.connectionOwnerUid !== connectionOwnerUid/);
  assert.match(main, /requestGoogleDriveToken\(\{[\s\S]*prompt: "none",[\s\S]*timeoutMs: 8_000/);
  assert.match(main, /if \(!online\) \{[\s\S]*status: "offline",[\s\S]*busy: false/);
  assert.match(main, /if \(!authReady\) \{[\s\S]*status: "authorization-required",[\s\S]*busy: false/);
  assert.match(main, /if \(driveRestoreAttemptRef\.current === attemptKey\) driveRestoreAttemptRef\.current = "";/);
  assert.match(main, /if \(driveSession\.busy \|\| \["checking", "connecting", "syncing", "quota"\]/);
  assert.match(main, /driveRenewPromiseRef/);
  assert.match(main, /initialEpoch !== driveOperationEpochRef\.current \|\| boardRef\.current\.id !== initialBoardId/);
  assert.match(main, /\.\.\.driveReconnectFailure\(error\)/);
  assert.match(driveState, /無法在背景恢復 Google Drive；點一下重新連結，本機變更仍安全保留/);
});

test("current Drive requests always clear busy state even when a request aborts", () => {
  const refreshStart = main.indexOf("const refreshGoogleDrive = useCallback");
  const connectStart = main.indexOf("const connectGoogleDrive = useCallback", refreshStart);
  const openStart = main.indexOf("const openGoogleDriveFile = useCallback");
  const openEnd = main.indexOf("const recoverGoogleDriveVersionAsCopy", openStart);
  const refreshBlock = main.slice(refreshStart, connectStart);
  const openBlock = main.slice(openStart, openEnd);

  assert.doesNotMatch(refreshBlock, /error\?\.name === "AbortError"/);
  assert.match(refreshBlock, /catch \(error\) \{[\s\S]*busy: false/);
  assert.doesNotMatch(openBlock, /error\?\.name === "AbortError"/);
  assert.match(openBlock, /catch \(error\) \{[\s\S]*busy: false/);
});

test("Drive owner metadata persists but OAuth access tokens remain memory-only", () => {
  for (const source of [driveState, driveStorage]) {
    assert.match(source, /connectionOwnerUid: ""/);
    assert.match(source, /connectionEmail: ""/);
  }
  assert.doesNotMatch(main, /localStorage\.setItem\([^\n]*(accessToken|driveToken)/i);
  assert.doesNotMatch(driveStorage, /localStorage\.setItem\([^\n]*(accessToken|driveToken)/i);
});
