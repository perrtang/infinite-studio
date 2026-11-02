import { driveHeaderIndicator } from "./drive-header-indicator.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

test("cloud status remains inside the existing save button", () => {
  const header = main.slice(main.indexOf('<div className="topbar-secondary">'), main.indexOf('label={sourceModeActive ? "回到畫布後復原'));
  assert.doesNotMatch(header, /topbar-cloud-status/);
  assert.match(header, /topbar-save-status/);
  assert.match(header, /DriveStatusIcon/);
  assert.match(header, /is-spinning/);
  assert.match(header, /savePreferredBoard/);
  assert.match(header, /aria-live="polite"/);
});

test("a confirmed upload stops the spinner before optional Drive metadata refresh", () => {
  const syncedStateIndex = main.indexOf('const syncedAt = new Date().toISOString();');
  const backgroundRefreshIndex = main.indexOf("void Promise.all([", syncedStateIndex);
  assert.ok(syncedStateIndex > -1);
  assert.ok(backgroundRefreshIndex > syncedStateIndex);
  assert.match(main.slice(syncedStateIndex, backgroundRefreshIndex), /status: asCopy[\s\S]*"synced-local-warning" : "synced"[\s\S]*busy: false/);
});

test("autosync waits while Drive is busy and retries recoverable errors on the queued deadline", () => {
  assert.match(main, /if \(driveSession\.status === "error"\) \{[\s\S]*currentSyncJob[\s\S]*nextAttemptAt[\s\S]*saveBoardToGoogleDrive\(\{ silent: true \}\);/);
  assert.match(main, /if \(driveSession\.busy \|\| \["checking", "connecting", "syncing", "quota"\]\.includes\(driveSession\.status\)\) return undefined;/);
});

test("Drive failure recovery is time-bounded and keeps retry disabled until bookkeeping settles", () => {
  const saveStart = main.indexOf("const saveBoardToGoogleDrive = useCallback");
  const failureStart = main.indexOf("const isConflict = error?.code === \"drive/conflict\"", saveStart);
  const queueStart = main.indexOf("if (linkedFile && driveSettings.autoSync)", failureStart);
  const failureBlock = main.slice(failureStart, queueStart);
  assert.ok(saveStart > -1 && failureStart > saveStart && queueStart > failureStart);
  assert.match(failureBlock, /setDriveSession\(\(current\) => \{[\s\S]*busy: true/);
  const completionBlock = main.slice(queueStart, main.indexOf("const openGoogleDriveFile", queueStart));
  assert.match(completionBlock, /await withOperationTimeout\([\s\S]*DRIVE_QUEUE_TIMEOUT_MS/);
  assert.match(completionBlock, /finally[\s\S]*driveSavePromiseRef\.current = null;[\s\S]*busy: false/);
  assert.match(main, /DRIVE_QUEUE_TIMEOUT_MS = 10_000/);
  assert.match(main.slice(failureStart, main.indexOf("return false;", queueStart)), /isGoogleDriveRetryableError\(error\)[\s\S]*nextAttemptAt: retryable/);
  assert.match(main, /DRIVE_LOCAL_RECOVERY_TIMEOUT_MS = 30_000/);
  assert.match(main, /retainSnapshot: Boolean\(localRecoveryWarning\)/);
});

test("a local recovery-copy failure warns but does not block the Drive upload", () => {
  const saveStart = main.indexOf("const saveBoardToGoogleDrive = useCallback");
  const warningStart = main.indexOf("noteLocalRecoveryFailure(error instanceof DriveApiError", saveStart);
  const driveAboutStart = main.indexOf("const about = await getGoogleDriveAbout(accessToken);", warningStart);
  const uploadStart = main.indexOf("const savedFile = await uploadGoogleDriveMoodboard", driveAboutStart);
  const localFailureBlock = main.slice(warningStart, driveAboutStart);

  assert.ok(saveStart > -1 && warningStart > saveStart && driveAboutStart > warningStart && uploadStart > driveAboutStart);
  assert.doesNotMatch(localFailureBlock, /throw new DriveApiError/);
  assert.match(main.slice(uploadStart, main.indexOf("return true;", uploadStart)), /"synced-local-warning"[\s\S]*已儲存至 Google Drive/);
});

test("sync-queue bookkeeping failures never masquerade as local recovery-copy failures", () => {
  const saveStart = main.indexOf("const saveBoardToGoogleDrive = useCallback");
  const queueReadStart = main.indexOf("const queuedJob = await getSyncJob(snapshot.id);", saveStart);
  const driveAboutStart = main.indexOf("const about = await getGoogleDriveAbout(accessToken);", queueReadStart);
  const queueRemovalStart = main.indexOf("await withOperationTimeout(removeSyncJob(snapshot.id)", driveAboutStart);
  const syncedStateStart = main.indexOf("const syncedAt = new Date().toISOString();", queueRemovalStart);

  assert.match(main.slice(queueReadStart, driveAboutStart), /catch \(error\) \{\s*noteQueueStateFailure\(error\);/);
  assert.match(main.slice(queueReadStart, driveAboutStart), /queuePreparationActive[\s\S]*DRIVE_QUEUE_TIMEOUT_MS/);
  assert.match(main.slice(queueRemovalStart, syncedStateStart), /DRIVE_QUEUE_TIMEOUT_MS/);
  assert.doesNotMatch(main.slice(queueReadStart, driveAboutStart), /noteLocalRecoveryFailure\(error\)/);
  assert.match(main.slice(queueRemovalStart, syncedStateStart), /noteQueueStateFailure\(error\)[\s\S]*setSyncJobs[\s\S]*setTimeout[\s\S]*removeSyncJob/);
  assert.match(main.slice(syncedStateStart, main.indexOf("return true;", syncedStateStart)), /queueStateWarning[\s\S]*已儲存至 Google Drive；本機同步佇列待整理/);
});

test("cloud save indicator distinguishes saved, pending, working and recoverable failures", () => {
  assert.equal(driveHeaderIndicator({ status: "synced" }), "已儲存");
  assert.equal(driveHeaderIndicator({ status: "synced", dirty: true }), "尚未儲存");
  assert.equal(driveHeaderIndicator({ status: "syncing", busy: true }), "上傳中");
  assert.equal(driveHeaderIndicator({ status: "authorization-required" }), "需要重新連結");
  assert.equal(driveHeaderIndicator({ status: "offline" }), "目前離線");
  assert.equal(driveHeaderIndicator({ status: "quota" }), "空間不足");
  assert.equal(driveHeaderIndicator({ status: "conflict" }), "需處理衝突");
  assert.equal(driveHeaderIndicator({ status: "error", dirty: true }), "更新失敗");
  assert.equal(driveHeaderIndicator({ status: "synced-local-warning" }), "本機備份未更新");
  assert.equal(driveHeaderIndicator({ status: "ready", paused: true }), "待更新");
});
