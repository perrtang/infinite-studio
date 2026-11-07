import test from "node:test";
import assert from "node:assert/strict";
import { isCloudBoardReadOnly, updateDriveLinkAccess } from "./drive-access.js";

test("a transient authorization failure retains known local editing rights but not viewer rights", () => {
  const pending = { fileId: "file-1", status: "authorization-required", canEdit: false };
  assert.equal(isCloudBoardReadOnly(pending, { fileId: "file-1", canEdit: true }), false);
  assert.equal(isCloudBoardReadOnly(pending, { fileId: "file-1", canEdit: false }), true);
  assert.equal(isCloudBoardReadOnly({ ...pending, status: "ready" }, { fileId: "file-1", canEdit: true }), true);
  assert.equal(isCloudBoardReadOnly(pending, { fileId: "other", canEdit: false }), true);
});

test("a confirmed viewer remains read-only while permissions reload or access is revoked", () => {
  const link = { fileId: "file-1", canEdit: true, ownedByMe: false };
  assert.equal(isCloudBoardReadOnly({ fileId: "file-1", status: "loading", role: "viewer", canEdit: false }, link), true);
  assert.equal(isCloudBoardReadOnly({ fileId: "file-1", status: "error", role: "viewer", canEdit: false }, link), true);
  assert.equal(isCloudBoardReadOnly({ fileId: "file-1", status: "ready", role: "editor", canEdit: true }, link), false);
  assert.equal(isCloudBoardReadOnly({}, { ...link, canEdit: false }), true);
});

test("permission refresh preserves sync identity and ignores other files", () => {
  const link = { fileId: "file-1", version: "42", headRevisionId: "head", syncedRevision: 7, canEdit: true };
  const state = { links: { board: link } };
  const next = updateDriveLinkAccess(state, "board", "file-1", { canEdit: false, canShare: false });
  assert.deepEqual(next.links.board, { ...link, canEdit: false, canShare: false });
  assert.equal(updateDriveLinkAccess(state, "board", "other", { canEdit: false }), state);
  assert.equal(state.links.board.canEdit, true);
});
