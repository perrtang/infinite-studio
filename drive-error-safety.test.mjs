import assert from "node:assert/strict";
import test from "node:test";
import { driveErrorMessage as stateErrorMessage } from "./drive-state.js";
import { driveErrorMessage as storageErrorMessage } from "./drive-storage.js";
import { translateInterfaceText } from "./i18n.js";

test("Drive failures do not claim an unverified local save or automatic retry", () => {
  for (const error of [{ code: "drive/quota" }, { status: 429 }, { code: "drive/timeout" }, { code: "drive/offline" }]) {
    const messages = [stateErrorMessage(error), storageErrorMessage(error)];
    assert.equal(messages[0], messages[1]);
    for (const message of messages) {
      assert.doesNotMatch(message, /已保留|已保存|安全保存|會再同步/);
      assert.doesNotMatch(translateInterfaceText(message, "en"), /safely saved|local version is safe|changes are saved|will (?:retry|sync)/i);
      assert.doesNotMatch(translateInterfaceText(message, "en"), /[\u3400-\u9fff]/u);
    }
  }
});
