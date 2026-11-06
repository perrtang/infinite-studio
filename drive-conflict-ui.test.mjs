import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./main.jsx", import.meta.url), "utf8");

test("Drive conflict keeps upload primary and uses one target-bound confirmation", () => {
  assert.match(source, /!driveSession\.conflict \? \(\s*<section className=\{`drive-status-panel/);
  assert.match(source, /雲端與目前內容不同/);
  assert.match(source, /將 Drive 版本開成新工作檔/);
  assert.match(source, /將目前內容另存新檔/);
  assert.match(source, /<details className="drive-conflict-more"/);
  assert.match(source, /更多處理方式/);
  assert.match(source, /以目前內容更新雲端？/);
  assert.match(source, /className="quiet-button"[^>]*>稍後處理<\/button>/);
  assert.doesNotMatch(source, /overwriteAcknowledged/);
  assert.match(source, /driveSession\.conflictActionError/);
  assert.match(source, /上次操作未完成：/);
  assert.match(source, /forceOverwrite: true, overwriteTarget: driveSaveConfirmation/);
});

test("saving a Drive copy creates an independent board and keeps the current Drive link", () => {
  assert.match(source, /const uploadSnapshot = asCopy \? \{ \.\.\.createRecoveredMoodboard\(snapshot, \{ label: "Drive 複本" \}\), \.\.\.\(copyName \? \{ name: copyName \} : \{\}\) \} : snapshot/);
  assert.match(source, /if \(!asCopy\) \{\s*updateDriveSettings\([\s\S]*?setBoardPrimaryStorage\(snapshot\.id, "drive"\);[\s\S]*?await withOperationTimeout\(removeSyncJob\(snapshot\.id\), DRIVE_QUEUE_TIMEOUT_MS/);
  assert.match(source, /conflict: asCopy \? current\.conflict : null/);
  assert.match(source, /if \(!asCopy\) \{\s*let queuePreparationActive = true;\s*try \{\s*await withOperationTimeout\([\s\S]*?const queuedJob = await getSyncJob/);
  assert.match(source, /conflict: asCopy \|\| forceOverwrite \? current\.conflict : null/);
  assert.match(source, /\(asCopy \|\| forceOverwrite\) && current\.conflict/);
  assert.match(source, /status: authorizationRequired \? "authorization-required" : preservesExistingConflict \? "conflict" : status/);
});

test("autosync pauses after bounded retries and manual save uses the latest-writer policy", () => {
  assert.match(source, /currentDriveLink \|\| driveSession\.conflict\) return undefined/);
  assert.match(source, /latestWins: !forceOverwrite/);
  assert.match(source, /status: current\.conflict \? "conflict" : "ready"/);
});

test("overwrite stays bound to the reviewed board and Drive file", () => {
  assert.match(source, /overwriteTarget\.boardId === snapshot\.id/);
  assert.match(source, /overwriteTarget\.fileId === linkedFile\?\.fileId/);
  assert.match(source, /overwriteTarget\.boardId === activeConflict\?\.boardId/);
  assert.match(source, /overwriteTarget\.fileId === activeConflict\?\.id/);
  assert.match(source, /status: current\.connected \? "ready" : current\.status,[\s\S]*?conflict: null/);
});
