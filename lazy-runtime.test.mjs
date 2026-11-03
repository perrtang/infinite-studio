import assert from "node:assert/strict";
import test from "node:test";
import { objectExportArtifact } from "./asset-export.js";
import {
  collaborationAccessRequestStatusLabel,
  loadCollaborationResume,
  normalizeCollaborationInvite,
  saveCollaborationResume,
} from "./collaboration-state.js";
import {
  contentByteLength,
  isGoogleDriveAuthorizationError,
  isGoogleDriveRetryableError,
  linkDriveFile,
  loadDriveState,
  saveDriveState,
  serializeMoodboardSnapshot,
} from "./drive-state.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("lazy asset export keeps shape appearance in a self-contained SVG", async () => {
  const artifact = objectExportArtifact({
    type: "shape",
    shapeKind: "star",
    starPoints: 5,
    starInnerRatio: 0.42,
    fill: "#123456",
    width: 160,
    height: 140,
    rotation: 18,
    anchor: "mc",
  });
  assert.equal(artifact.extension, "svg");
  assert.equal(artifact.blob.type, "image/svg+xml;charset=utf-8");
  const markup = await artifact.blob.text();
  assert.match(markup, /<svg/);
  assert.match(markup, /#123456/);
  assert.match(markup, /rotate\(18/);
});

test("startup-safe Drive state preserves local links without loading the network runtime", () => {
  const storage = memoryStorage();
  const board = { id: "board-1", name: "研究", revision: 7, updatedAt: "2026-10-20T10:00:00.000Z" };
  const linked = linkDriveFile({}, board, { id: "file-1", name: "研究.moodboard", version: "8", size: 2048 });
  saveDriveState(storage, linked);
  assert.deepEqual(loadDriveState(storage), linked);
  const serialized = serializeMoodboardSnapshot(board);
  assert.equal(contentByteLength(serialized), new TextEncoder().encode(serialized).byteLength);
});

test("startup-safe Drive error policy matches the lazy network runtime", () => {
  assert.equal(isGoogleDriveAuthorizationError({ reason: "insufficientPermissions" }), true);
  assert.equal(isGoogleDriveRetryableError({ code: "drive/offline" }), true);
  assert.equal(isGoogleDriveRetryableError({ status: 429, reason: "rateLimitExceeded" }), true);
  assert.equal(isGoogleDriveRetryableError({ code: "drive/quota", reason: "storageQuotaExceeded" }), false);
  assert.equal(isGoogleDriveRetryableError({ code: "drive/conflict" }), false);
});

test("startup-safe collaboration state keeps invite and resume behavior", () => {
  const storage = memoryStorage();
  const inviteId = `invite_${"a".repeat(24)}`;
  assert.equal(normalizeCollaborationInvite(`https://example.com/?collab=${inviteId}`), inviteId);
  const saved = saveCollaborationResume(storage, { roomId: "room-1", boardId: "board-1", inviteId });
  assert.deepEqual(loadCollaborationResume(storage), saved);
  assert.equal(collaborationAccessRequestStatusLabel("pending"), "等待擁有者回覆");
});

test('exported text preserves chosen line height', async () => {
  const artifact = objectExportArtifact({type:'text',text:'one\ntwo',width:200,height:100,fontSize:20,lineHeight:1.8});
  assert.match(await artifact.blob.text(), /line-height:1\.8/);
});
