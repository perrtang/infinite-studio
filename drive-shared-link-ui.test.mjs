import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./main.jsx", import.meta.url), "utf8");

test("a shared Drive link retains an exact-file Picker fallback", () => {
  assert.match(source, /const loadDrivePickerRuntime = \(\) => import\("\.\/drive-picker\.js"\)/);
  assert.match(source, /status: "needs-picker-access"/);
  assert.match(source, /選取這份共享檔案/);
  assert.match(source, /openGoogleDriveMoodboardPicker\(\{[\s\S]*?expectedFileId: incoming\.fileId,[\s\S]*?expectedResourceKey: incoming\.resourceKey/);
  assert.match(source, /openGoogleDriveFile\(selection\.file, \{ sharedLink: true \}\)/);
});

test("shared-link startup attempts direct access without automatically opening Picker", () => {
  const sharedLinkEffect = source.match(/useEffect\(\(\) => \{\n    const incoming = initialDriveShareRef\.current;[\s\S]*?\n  \}, \[authReady,[^;]+;/)?.[0] || "";
  assert.ok(sharedLinkEffect, "shared-link startup effect should remain discoverable");
  assert.match(sharedLinkEffect, /openIncomingDirectly\(\)/);
  assert.doesNotMatch(sharedLinkEffect, /openGoogleDriveMoodboardPicker\(/);
  assert.match(source, /openGoogleDriveFile\(\{ id: incoming\.fileId, resourceKey: incoming\.resourceKey/);
});

test("failed or cancelled shared-file opening never adopts a blank board", () => {
  assert.match(source, /沒有把空白畫布當成共享檔案/);
  assert.match(source, /status: "shared-file-denied"/);
  assert.match(source, /目前畫布沒有被當成該檔案/);
  assert.match(source, /if \(!opened\) return false/);
  assert.match(source, /startsWith\("drive\/picker-"\)[\s\S]*?\? "needs-picker-access"/);
});

test("a viewer requesting editing is prompted even if that file is already open", () => {
  assert.match(source, /currentLink\?\.fileId === incoming\.fileId\) \{\s*(?:return )?refreshDriveSharing\(incoming, \{ onRole: promptForPendingSharedEdit \}\)/);
  assert.match(source, /pendingSharedEditRef\.current = false;\s*if \(role === "viewer"\)/);
  assert.match(source, /sharedEditorUrl\(window\.location\.href/);
});

test("closing the sharing dialog preserves the incoming file and resource key", () => {
  const close = source.match(/const closeDriveSharing = useCallback\(\(\) => \{[\s\S]*?\}, \[cancelDriveRead\]\);/)?.[0] || "";
  assert.ok(close);
  assert.doesNotMatch(close, /delete\("(?:driveFile|resourceKey|lockedShare)"\)|initialDriveShareRef\.current\s*=\s*null/);
});

test("successfully opened share is no longer the target of later board sharing actions", () => {
  const open = source.match(/const openIncomingDirectly = useCallback\(async \(\) => \{[\s\S]*?\}, \[currentDriveAccessToken, openGoogleDriveFile, promptForPendingSharedEdit, refreshDriveSharing\]\);/)?.[0] || "";
  assert.match(open, /if \(!opened\) return false;[\s\S]*initialDriveShareRef\.current === incoming\) initialDriveShareRef\.current = null/);
});

test("the public viewer observes an existing session before labeling its editor action", () => {
  const viewer = source.slice(source.indexOf("function PublicSharedViewer"), source.indexOf("function DriveSharingPreview"));
  assert.match(viewer, /observeMoodboardSession/);
  assert.match(viewer, /useState\("checking"\)/);
  assert.match(viewer, /sharedViewerEditorLabel\(viewerSessionStatus, state\.status\)/);
});


test("explicit sharing uses the open board without discarding an unopened incoming link", () => {
  assert.match(source, /sharingCurrentBoardRef = useRef\(false\)/);
  assert.match(source, /feature === "collaboration"\) \{ sharingCurrentBoardRef\.current = true/);
  assert.match(source, /sharingCurrentBoardRef\.current \? linked : incoming \|\| linked/);
  assert.match(source, /!sharingCurrentBoardRef\.current && initialDriveShareRef\.current\?\.fileId/);
  assert.match(source, /if \(sharingCurrentBoardRef\.current\) return refreshDriveSharing\(\)/);
});


test("shared-link authorization shows the login gate before the Drive sharing dialog", () => {
  const effect = source.match(/useEffect\(\(\) => \{\n    const incoming = initialDriveShareRef\.current;[\s\S]*?\n  \}, \[authReady,[^;]+;/)?.[0] || "";
  assert.ok(effect);
  assert.ok(effect.indexOf('if (!authReady)') < effect.indexOf('setShowCollaboration(true)'));
  assert.match(effect, /requestAdvancedFeature\("shared-moodboard"\)/);
  assert.match(source, /showCollaboration && !pendingAdvancedFeature \? \(/);
});
