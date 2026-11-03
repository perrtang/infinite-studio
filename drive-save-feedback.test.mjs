import assert from "node:assert/strict";
import test from "node:test";
import { driveSaveFailureFeedback } from "./drive-save-feedback.js";

test("repeated conflicts explain the failed check instead of silently repeating confirmation", () => {
  const feedback = driveSaveFailureFeedback({ code: "drive/conflict" });
  assert.equal(feedback.title, "尚未確認更新完成");
  assert.equal(feedback.action, "retry");
  assert.match(feedback.message, /版本檢查未通過/);
  assert.doesNotMatch(feedback.message, /未上傳|沒有上傳/);
});

test("expired authorization has one reconnect recovery path", () => {
  for (const error of [{ code: "drive/authorization" }, { status: 401 }]) {
    const feedback = driveSaveFailureFeedback(error);
    assert.equal(feedback.action, "reconnect");
    assert.match(feedback.message, /重新連結/);
  }
});

test("uncertain writes require inspection, not an unqualified retry or false failure claim", () => {
  for (const code of ["drive/timeout", "drive/network", "drive/verification"]) {
    const feedback = driveSaveFailureFeedback({ code });
    assert.equal(feedback.action, "review");
    assert.match(feedback.title, /未確認/);
    assert.doesNotMatch(feedback.message, /未上傳|沒有上傳/);
  }
});

test("known failures retain their specific reason and a safe recovery action", () => {
  assert.match(driveSaveFailureFeedback({ code: "drive/quota" }).message, /空間不足/);
  assert.equal(driveSaveFailureFeedback({ code: "drive/safety-check", message: "缺少版本資訊" }).action, "review");
  assert.equal(driveSaveFailureFeedback({ code: "drive/overwrite-target" }).action, "review");
  assert.equal(driveSaveFailureFeedback({ status: 403 }).action, "review");
});

test("local recovery failure is never hidden behind a cloud failure or uncertain result", () => {
  for (const code of ["drive/conflict", "drive/timeout", "drive/verification", "drive/authorization", "drive/quota", "drive/offline"]) {
    const feedback = driveSaveFailureFeedback({ code }, { localRecoveryWarning: "本機復原副本寫入失敗。" });
    assert.equal(feedback.action, "backup");
    assert.match(feedback.warning, /本機復原副本也未完成/);
    assert.match(feedback.warning, /不要關閉目前分頁/);
    assert.match(feedback.warning, /\.studio/);
    assert.doesNotMatch(feedback.warning, /moodboard/i);
    assert.equal(feedback.message, driveSaveFailureFeedback({ code }).message);
    assert.doesNotMatch(feedback.message, /已保存|已保留|安全保存/);
  }
});
