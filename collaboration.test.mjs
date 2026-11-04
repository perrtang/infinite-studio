import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  COLLABORATION_DEFAULT_INVITE_ROLE,
  LOCAL_COLLABORATION_ORIGIN,
  REMOTE_COLLABORATION_ORIGIN,
  applyCollaborationUpdate,
  assertVerifiedCollaborationUser,
  collaborationId,
  collaborationAccessRequestStatusLabel,
  combineCollaborationChunks,
  createCollaborationDocument,
  createCollaborationInviteUrl,
  encodeCollaborationDocument,
  listenToCollaborationUpdates,
  loadCollaborationResume,
  normalizeCollaborationInvite,
  normalizeCollaborationAccessRequestStatus,
  readBoardFromCollaborationDocument,
  saveCollaborationResume,
  splitCollaborationUpdate,
  writeBoardToCollaborationDocument,
} from "./collaboration.js";
import { createBoard, ensureBoard } from "./model.js";

const appSource = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const documentSource = await readFile(new URL("./index.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("./styles.css", import.meta.url), "utf8");

function sampleBoard() {
  return ensureBoard(createBoard({
    id: "board-collaboration-test",
    name: "共同編輯測試",
    view: { x: 120, y: -40, zoom: 1.5 },
    objects: [
      {
        id: "object-a",
        sourceId: "asset-a",
        type: "image",
        name: "A",
        layerName: "A",
        src: `data:image/png;base64,${"a".repeat(120_000)}`,
        mime: "image/png",
        originalFilename: "a.png",
        pivotX: 10,
        pivotY: 20,
        width: 100,
        height: 100,
      },
      {
        id: "object-b",
        type: "shape",
        name: "B",
        layerName: "B",
        pivotX: 40,
        pivotY: 50,
        width: 80,
        height: 60,
      },
    ],
  }));
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("collaboration ids and invitation links are URL safe", () => {
  const invite = collaborationId("invite", 24);
  assert.match(invite, /^invite_[A-Za-z0-9_-]{20,96}$/);
  const url = createCollaborationInviteUrl(invite, "https://example.com/moodboard.html?theme=dark&driveFile=secret#old");
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/moodboard.html");
  assert.equal(parsed.searchParams.get("collab"), invite);
  assert.deepEqual([...parsed.searchParams.keys()], ["collab"]);
  assert.equal(parsed.hash, "");
  assert.equal(normalizeCollaborationInvite(url), invite);
  assert.equal(normalizeCollaborationInvite("not a valid invite"), "");
});

test("cross-origin requests identify the website for Picker without exposing invitation paths or queries", () => {
  assert.match(documentSource, /<meta name="referrer" content="strict-origin-when-cross-origin" \/>/);
});

test("collaboration updates split and combine without changing bytes", () => {
  const input = new Uint8Array(900_000).map((_, index) => index % 251);
  const chunks = splitCollaborationUpdate(input, 100_000);
  assert.equal(chunks.length, 9);
  assert.deepEqual(combineCollaborationChunks(chunks), input);
});

test("verified identity is required for cloud collaboration", () => {
  assert.throws(() => assertVerifiedCollaborationUser({ uid: "u1", emailVerified: false }), /Email 驗證/);
  assert.equal(assertVerifiedCollaborationUser({ uid: "u1", emailVerified: true }).uid, "u1");
});

test("shared collaboration links start as view only and access request states are normalized", () => {
  assert.equal(COLLABORATION_DEFAULT_INVITE_ROLE, "viewer");
  assert.equal(normalizeCollaborationAccessRequestStatus("pending"), "pending");
  assert.equal(normalizeCollaborationAccessRequestStatus("unexpected"), "none");
  assert.equal(collaborationAccessRequestStatusLabel("approved"), "已核准編輯");
});

test("shared Moodboard links open one exact Google Drive file after verified sign-in", () => {
  assert.match(appSource, /title="分享 Google Drive 工作檔"/);
  assert.match(appSource, /直接開啟這份工作檔/);
  assert.match(appSource, /實際存取權仍以 Google Drive 為準/);
  assert.match(appSource, /requestAdvancedFeature\("shared-moodboard"\)/);
  assert.match(appSource, /openGoogleDriveMoodboardPicker\(\{[\s\S]*?expectedFileId: incoming\.fileId/);
  assert.match(appSource, /openGoogleDriveFile\(selection\.file, \{ sharedLink: true \}\)/);
  assert.match(appSource, /openGoogleDriveFile\(\{ id: incoming\.fileId, resourceKey: incoming\.resourceKey/);
  assert.doesNotMatch(appSource, /loadCollaborationRuntime|collaboration-firestore/);
});

test("opening sharing never creates a second cloud room", () => {
  assert.match(appSource, /status: "needs-drive"/);
  assert.match(appSource, /saveCurrentBoardForSharing/);
  assert.match(appSource, /listGoogleDrivePermissions/);
  assert.match(appSource, /同一份檔案，沒有第二個分享空間/);
  assert.doesNotMatch(appSource, /createMoodboardCollaborationRoom|resumeMoodboardCollaborationRoom/);
});

test("shared links compare their Drive file id before replacing the active Moodboard", () => {
  assert.match(appSource, /currentLink\?\.fileId === incoming\.fileId/);
  assert.match(appSource, /status: "needs-picker-access"/);
  assert.match(appSource, /expectedFileId: incoming\.fileId/);
  assert.match(appSource, /載入前的畫面已保留/);
});

test("every opened Drive file applies its edit capability before canvas interaction", () => {
  assert.match(appSource, /const role = driveFileRole\(metadata\);[\s\S]*status: "linked"/);
  assert.match(appSource, /canEdit: role !== "viewer"/);
  assert.match(appSource, /const cloudReadOnly = isCloudBoardReadOnly\(driveSharing, boardDriveLink\)/);
});

test("sharing refresh ignores stale file responses and keeps viewer ACL details private", () => {
  assert.match(appSource, /driveSharingRequestRef\.current === requestId[\s\S]*boardRef\.current\.id === activeBoardId/);
  assert.match(appSource, /if \(!requestIsCurrent\(\)\) return false/);
  assert.match(appSource, /sharing\.canShare && sharing\.permissionsVisible \? <section/);
  assert.match(appSource, /Google Drive 未提供完整分享名單/);
});

test("sharing panel exposes the link and direct member permissions without expanding a details control", () => {
  assert.match(appSource, /擁有存取權的使用者/);
  assert.match(appSource, /<select[\s\S]{0,560}<option value="viewer">檢視者<\/option>[\s\S]{0,120}<option value="editor">編輯者<\/option>/);
  assert.doesNotMatch(appSource, /<details className="collaboration-member-management">\s*<summary><Users[^>]*\/>管理成員權限/);
  assert.match(appSource, /一般存取權限/);
  assert.match(appSource, /編輯權必須以 Google 帳號 Email 個別授予/);
  assert.match(appSource, /onSetGeneralAccess/);
  assert.match(appSource, /onInviteMember/);
  assert.match(appSource, /正在讀取 Google Drive/);
  assert.match(stylesSource, /\.collaboration-role-control select \{[\s\S]*min-height: 36px;/);
  assert.match(stylesSource, /\.collaboration-role-control,[\s\S]*\.collaboration-role-control select,[\s\S]*min-height: 44px;[\s\S]*width: 100%;/);
});

test("collaboration document keeps assets while preserving each device viewport", () => {
  const board = sampleBoard();
  const document = createCollaborationDocument(board);
  const restored = readBoardFromCollaborationDocument(document, board, { x: -10, y: 30, zoom: 0.8 });
  assert.equal(restored.objects[0].src, board.objects[0].src);
  assert.deepEqual(restored.view, { x: -10, y: 30, zoom: 0.8 });
  document.destroy();
});

test("collaboration keeps global and individual guide locks with the shared board", () => {
  const board = {
    ...sampleBoard(),
    guidesLocked: true,
    rulerOrigin: { x: 24, y: -12 },
    guides: [
      { id: "guide-locked", axis: "x", position: 144, locked: true, groupId: "guide-group-a" },
      { id: "guide-open", axis: "y", position: 240, locked: false, groupId: "guide-group-a" },
    ],
    guideGroups: [{ id: "guide-group-a", name: "Shared guides", memberIds: ["guide-locked", "guide-open"] }],
  };
  const document = createCollaborationDocument(board);
  const restored = readBoardFromCollaborationDocument(document, board);
  assert.equal(restored.guidesLocked, true);
  assert.deepEqual(restored.rulerOrigin, { x: 24, y: -12 });
  assert.deepEqual(restored.guides, board.guides);
  assert.deepEqual(restored.guideGroups.map((group) => ({ id: group.id, name: group.name, memberIds: group.memberIds })), [
    { id: "guide-group-a", name: "Shared guides", memberIds: ["guide-locked", "guide-open"] },
  ]);
  document.destroy();
});

test("transforming an image does not resend its large source asset", () => {
  const board = sampleBoard();
  const document = createCollaborationDocument(board);
  const updates = [];
  const stop = listenToCollaborationUpdates(document, (update, origin) => {
    if (origin === LOCAL_COLLABORATION_ORIGIN) updates.push(update);
  });
  const next = { ...board, objects: board.objects.map((object) => object.id === "object-a" ? { ...object, pivotX: 88 } : object) };
  writeBoardToCollaborationDocument(document, next);
  assert.equal(updates.length, 1);
  assert.ok(updates[0].byteLength < 20_000, `unexpected update size ${updates[0].byteLength}`);
  stop();
  document.destroy();
});

test("concurrent edits to different objects merge and converge", () => {
  const base = sampleBoard();
  const left = createCollaborationDocument(base);
  const right = createCollaborationDocument();
  applyCollaborationUpdate(right, encodeCollaborationDocument(left), REMOTE_COLLABORATION_ORIGIN);
  const leftUpdates = [];
  const rightUpdates = [];
  const stopLeft = listenToCollaborationUpdates(left, (update, origin) => origin === LOCAL_COLLABORATION_ORIGIN && leftUpdates.push(update));
  const stopRight = listenToCollaborationUpdates(right, (update, origin) => origin === LOCAL_COLLABORATION_ORIGIN && rightUpdates.push(update));

  writeBoardToCollaborationDocument(left, {
    ...base,
    objects: base.objects.map((object) => object.id === "object-a" ? { ...object, pivotX: 111 } : object),
  });
  writeBoardToCollaborationDocument(right, {
    ...base,
    objects: base.objects.map((object) => object.id === "object-b" ? { ...object, pivotY: 222 } : object),
  });
  leftUpdates.forEach((update) => applyCollaborationUpdate(right, update, REMOTE_COLLABORATION_ORIGIN));
  rightUpdates.forEach((update) => applyCollaborationUpdate(left, update, REMOTE_COLLABORATION_ORIGIN));

  const leftBoard = readBoardFromCollaborationDocument(left, base);
  const rightBoard = readBoardFromCollaborationDocument(right, base);
  assert.equal(leftBoard.objects.find((object) => object.id === "object-a").pivotX, 111);
  assert.equal(leftBoard.objects.find((object) => object.id === "object-b").pivotY, 222);
  assert.deepEqual(leftBoard.objects, rightBoard.objects);
  stopLeft();
  stopRight();
  left.destroy();
  right.destroy();
});

test("collaboration resume data is normalized", () => {
  const storage = memoryStorage();
  const inviteId = collaborationId("invite", 24);
  saveCollaborationResume(storage, { roomId: "room_12345678901234567890", boardId: "board-a", inviteId });
  assert.deepEqual(loadCollaborationResume(storage), {
    roomId: "room_12345678901234567890",
    boardId: "board-a",
    inviteId,
    savedAt: loadCollaborationResume(storage).savedAt,
  });
});
