import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GOOGLE_DRIVE_SCOPE,
  googleDriveTokenFromOAuthAccessToken,
  isGoogleDriveTokenUsable,
} from "./drive-state.js";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const auth = await readFile(new URL("./auth.js", import.meta.url), "utf8");

test("cloud storage choice requires explicit Drive consent before continuing", () => {
  const modalStart = main.indexOf("function StorageLocationModal");
  const modalEnd = main.indexOf("function LocalFileLocationModal", modalStart);
  const modal = main.slice(modalStart, modalEnd);

  assert.match(modal, /const canContinue = Boolean\(draftTarget\) && \(!choosingDrive \|\| driveConsentAcknowledged\)/);
  assert.match(modal, /Google 授予 drive\.file/);
  assert.match(modal, /連結完成不會立即上傳/);
  assert.match(modal, /disabled=\{!canContinue\}/);
  assert.match(modal, /onChoose\(draftTarget, \{ driveConsentAcknowledged \}\)/);
  assert.doesNotMatch(modal, /onChoose\("drive"\)/);
});

test("Google sign-in can request drive.file in the same user-initiated flow", () => {
  assert.match(auth, /additionalScopes = \[\]/);
  assert.match(auth, /provider\.addScope\(scope\)/);
  assert.match(auth, /GoogleAuthProvider\.credentialFromResult\(credential\)/);
  assert.match(auth, /oauthAccessToken: String\(oauthCredential\?\.accessToken \|\| ""\)/);

  const token = googleDriveTokenFromOAuthAccessToken(" oauth-token ", 1_000);
  assert.equal(token.accessToken, "oauth-token");
  assert.equal(token.scope, GOOGLE_DRIVE_SCOPE);
  assert.equal(token.expiresAt, 3_001_000);
  assert.equal(isGoogleDriveTokenUsable(token, 3_000_999), true);
  assert.equal(isGoogleDriveTokenUsable(token, 3_001_000), false);
  assert.equal(googleDriveTokenFromOAuthAccessToken("  "), null);
});

test("persistent Drive onboarding cannot treat a temporary Google token as a stored grant", () => {
  const start = main.indexOf("const signInToMoodboard = useCallback");
  const end = main.indexOf("const sendEmailLinkToMoodboard", start);
  const signIn = main.slice(start, end);
  assert.match(signIn, /additionalScopes: isDriveOnboarding && !DRIVE_GRANT_BACKEND_ENABLED/);
  assert.match(signIn, /const token = DRIVE_GRANT_BACKEND_ENABLED \? null : googleDriveTokenFromOAuthAccessToken\(oauthAccessToken\)/);
  assert.match(signIn, /else \{\s*driveResult = await connectGoogleDrive\(\{[\s\S]*?onboarding: true/);
  assert.match(signIn, /if \(!driveResult\) setAuthMessage/);
});

test("Drive retry preserves the prior remember-login preference", () => {
  const start = main.indexOf("const acceptMoodboardAccess = useCallback");
  const end = main.indexOf("const signInToMoodboard", start);
  const retry = main.slice(start, end);
  assert.match(retry, /rememberSession: authReceipt\?\.authPersistence === "local"/);
  assert.match(retry, /pendingAdvancedFeature === "drive-onboarding"[\s\S]*connectGoogleDrive/);
  assert.match(retry, /if \(!result\) setAuthMessage/);
});

test("Drive becomes primary only after verified connection success and then returns to the workspace", () => {
  const completionStart = main.indexOf("const driveConnectionReady = driveSession.connected");
  const completionEnd = main.indexOf("const closeDriveLibrary = useCallback", completionStart);
  const completion = main.slice(completionStart, completionEnd);
  const choiceStart = main.indexOf("const choosePrimaryStorageTarget = useCallback");
  const choiceEnd = main.indexOf("const setAutoSavePreference", choiceStart);
  const choice = main.slice(choiceStart, choiceEnd);

  assert.match(completion, /!driveSession\.busy/);
  assert.match(completion, /\["ready", "synced", "synced-local-warning"\]\.includes\(driveSession\.status\)/);
  assert.match(completion, /driveSession\.status === "conflict"/);
  assert.match(completion, /driveConflictNeedsDecision[\s\S]*setShowDriveLibrary\(true\)/);
  assert.match(completion, /setBoardPrimaryStorage\(driveOnboardingIntent\.boardId, "drive"\)/);
  assert.match(completion, /setShowDriveLibrary\(false\)/);
  assert.match(completion, /setShowSettings\(false\)/);
  assert.match(completion, /已回到工作畫面/);
  assert.match(completion, /completedBySync[\s\S]*已儲存至 Google Drive/);

  assert.match(choice, /if \(target === "local"\) \{[\s\S]*setBoardPrimaryStorage\(boardId, target\)/);
  assert.match(choice, /setDriveOnboardingIntent\(\{ boardId, operationEpoch \}\)/);
  assert.match(choice, /requestAdvancedFeature\("drive-onboarding"\)/);
  assert.match(choice, /driveSession\.connected && existingDriveToken && \["ready", "synced", "synced-local-warning"\]\.includes\(driveSession\.status\)/);
  assert.match(choice, /if \(existingDriveToken\) \{[\s\S]*await refreshGoogleDrive\(\)/);
  assert.match(choice, /await connectGoogleDrive\(\{ onboarding: true \}\)/);
  assert.doesNotMatch(choice, /saveBoardToGoogleDrive/);
  assert.doesNotMatch(choice, /setBoardPrimaryStorage\(boardId, "drive"\)/);
});

test("closing My Moodboards cancels only the unfinished storage onboarding intent", () => {
  const closeStart = main.indexOf("const closeDriveLibrary = useCallback");
  const closeEnd = main.indexOf("useEffect(() =>", closeStart);
  const close = main.slice(closeStart, closeEnd);

  assert.match(close, /setShowDriveLibrary\(false\)/);
  assert.match(close, /if \(!driveOnboardingIntent\) return/);
  assert.match(close, /storageTargetOperationEpochRef\.current \+= 1/);
  assert.match(close, /cancelDriveOperations\(\)/);
  assert.match(close, /setDriveOnboardingIntent\(null\)/);
  assert.match(main, /onClose=\{closeDriveLibrary\}/);
});

test("signing out invalidates any unfinished cloud storage onboarding", () => {
  const signOutStart = main.indexOf("const signOutOfMoodboard = useCallback");
  const signOutEnd = main.indexOf("const clearMoodboardFromThisDevice", signOutStart);
  const signOut = main.slice(signOutStart, signOutEnd);

  assert.match(signOut, /storageTargetOperationEpochRef\.current \+= 1/);
  assert.match(signOut, /setDriveOnboardingIntent\(null\)/);
  assert.match(signOut, /setPendingAdvancedFeature\(null\)/);
});
