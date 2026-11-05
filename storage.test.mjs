import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_DATABASE_NAME,
  compactLocalRecoveryStorage,
  deleteLocalBoard,
  deleteVersion,
  describeLocalPersistenceError,
  enqueueSync,
  getActiveBoardId,
  getDueSyncJobs,
  getLocalBoard,
  getLocalLibrarySummary,
  getSyncJob,
  listLocalBoards,
  listSyncJobs,
  listVersions,
  loadLocalFileHandle,
  loadCurrentBoard,
  recoverInterruptedSyncJobs,
  removeLocalFileHandle,
  removeSyncJob,
  saveCurrentBoard,
  saveLocalFileHandle,
  saveVersion,
  setActiveBoardId,
  setVersionPinned,
  updateSyncJob,
  upsertLocalBoard,
} from "./storage.js";

function board(id, overrides = {}) {
  return {
    schemaVersion: 11,
    id,
    name: `Board ${id}`,
    createdAt: "2026-10-20T00:00:00.000Z",
    updatedAt: "2026-10-20T00:00:00.000Z",
    revision: 1,
    objects: [],
    groups: [],
    guides: [],
    captures: [],
    lastComposition: null,
    view: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LOCAL_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("test database deletion blocked"));
  });
}

function seedLegacyDatabase(legacyBoard) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("state", { keyPath: "key" });
      const versions = database.createObjectStore("versions", { keyPath: "id" });
      versions.createIndex("boardId", "boardId", { unique: false });
      versions.createIndex("createdAt", "createdAt", { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readwrite");
      transaction.objectStore("state").put({
        key: "current-board",
        board: legacyBoard,
        savedAt: "2026-10-20T01:00:00.000Z",
      });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

test("v1 current board migrates into the multi-board local library", async () => {
  await deleteDatabase();
  const legacy = board("legacy", { name: "Legacy Moodboard" });
  await seedLegacyDatabase(legacy);

  assert.equal((await loadCurrentBoard()).id, "legacy");
  assert.equal(await getActiveBoardId(), "legacy");
  const records = await listLocalBoards();
  assert.equal(records.length, 1);
  assert.equal(records[0].board.name, "Legacy Moodboard");
});

test("local library preserves several boards while the active board remains explicit", async () => {
  await deleteDatabase();
  const first = board("one", { updatedAt: "2026-10-20T01:00:00.000Z" });
  const second = board("two", { updatedAt: "2026-10-20T02:00:00.000Z", objects: [{ id: "object-1" }] });
  await saveCurrentBoard(first);
  await upsertLocalBoard(second);

  assert.equal((await loadCurrentBoard()).id, "one");
  assert.equal((await listLocalBoards()).map((entry) => entry.id).join(","), "two,one");
  assert.equal((await getLocalBoard("two")).objectCount, 1);

  await setActiveBoardId("two");
  assert.equal((await loadCurrentBoard()).id, "two");
});

test("offline sync queue coalesces to the newest snapshot and keeps recoverable state", async () => {
  await deleteDatabase();
  await enqueueSync(board("queued", { revision: 1 }), { fileId: "drive-1", expectedVersion: "3" });
  await enqueueSync(board("queued", { revision: 2 }), { fileId: "drive-1", expectedVersion: "3" });

  let jobs = await listSyncJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].board, undefined);
  assert.equal(jobs[0].snapshotRevision, 2);
  assert.equal(jobs[0].snapshotObjectCount, 0);
  assert.equal(jobs[0].fileId, "drive-1");

  await updateSyncJob("queued", {
    state: "offline",
    attemptCount: 1,
    lastError: "network unavailable",
    nextAttemptAt: "2099-01-01T00:00:00.000Z",
  });
  assert.equal((await getSyncJob("queued")).state, "offline");
  assert.equal((await getDueSyncJobs(new Date("2026-10-20T00:00:00.000Z"))).length, 0);

  await removeSyncJob("queued");
  assert.equal(await getSyncJob("queued"), null);
});

test("a page refresh recovers an interrupted syncing job while the board store keeps the snapshot", async () => {
  await deleteDatabase();
  const snapshot = board("interrupted", { revision: 8 });
  await saveCurrentBoard(snapshot);
  await enqueueSync(snapshot, { fileId: "drive-8", expectedVersion: "21" });
  await updateSyncJob("interrupted", {
    state: "syncing",
    attemptCount: 2,
    lastError: "",
    nextAttemptAt: "",
  });

  const recoveredAt = new Date("2026-10-23T02:00:00.000Z");
  const recovered = await recoverInterruptedSyncJobs(recoveredAt);
  const job = recovered.find((entry) => entry.boardId === "interrupted");

  assert.equal(job.state, "pending");
  assert.equal(job.board, undefined);
  assert.equal(job.snapshotRevision, 8);
  assert.equal((await loadCurrentBoard()).revision, 8);
  assert.equal(job.fileId, "drive-8");
  assert.equal(job.nextAttemptAt, recoveredAt.toISOString());
  assert.match(job.lastError, /頁面更新或關閉而中斷/);
  assert.equal((await getDueSyncJobs(recoveredAt)).length, 1);
});

test("terminal Drive queue states never become due without an explicit retry deadline", async () => {
  await deleteDatabase();
  const now = new Date("2026-10-23T03:00:00.000Z");
  for (const state of ["authorization-required", "quota", "conflict"]) {
    const id = `terminal-${state}`;
    await enqueueSync(board(id), { fileId: `drive-${state}` });
    await updateSyncJob(id, { state, nextAttemptAt: "" });
  }

  assert.deepEqual(await getDueSyncJobs(now), []);
});

test("deleting a local board also removes its queued sync and versions", async () => {
  await deleteDatabase();
  const current = board("remove-me");
  await saveCurrentBoard(current);
  await saveVersion(current, "Before delete");
  await enqueueSync(current, { fileId: "drive-remove" });
  await saveLocalFileHandle(current.id, { kind: "file", name: "remove-me.moodboard" });

  await deleteLocalBoard(current.id);

  assert.equal(await getLocalBoard(current.id), null);
  assert.equal(await getSyncJob(current.id), null);
  assert.equal((await listVersions(current.id)).length, 0);
  assert.equal(await loadLocalFileHandle(current.id), null);
  assert.equal(await getActiveBoardId(), "");
  assert.equal(await loadCurrentBoard(), null);
});

test("a stable recovery slot replaces only its latest snapshot", async () => {
  await deleteDatabase();
  const first = await saveVersion(board("stable-slot", { revision: 1 }), "Tab recovery", "automatic", { slot: "tab-a" });
  const latest = await saveVersion(board("stable-slot", { revision: 2 }), "Tab recovery", "automatic", { slot: "tab-a" });

  const versions = await listVersions("stable-slot");
  assert.equal(versions.length, 1);
  assert.equal(first.id, latest.id);
  assert.equal(versions[0].slot, "tab-a");
  assert.equal(versions[0].board.revision, 2);
});

test("separate recovery source slots coexist for one board", async () => {
  await deleteDatabase();
  await saveVersion(board("two-slots", { revision: 3 }), "Tab A", "automatic", { slot: "tab-a" });
  await saveVersion(board("two-slots", { revision: 4 }), "Tab B", "automatic", { slot: "tab-b" });

  const versions = await listVersions("two-slots");
  assert.equal(versions.length, 2);
  assert.deepEqual(new Set(versions.map((entry) => entry.slot)), new Set(["tab-a", "tab-b"]));
});

test("stable recovery slots do not replace ordinary manual versions", async () => {
  await deleteDatabase();
  const current = board("manual-unaffected", { revision: 5 });
  const firstManual = await saveVersion(current, "Manual one");
  const recovery = await saveVersion(board("manual-unaffected", { revision: 6 }), "Tab recovery", "automatic", { slot: "tab-a" });
  const secondManual = await saveVersion(board("manual-unaffected", { revision: 7 }), "Manual two");

  const versions = await listVersions("manual-unaffected");
  assert.equal(versions.length, 3);
  assert.notEqual(firstManual.id, secondManual.id);
  assert.equal(versions.filter((entry) => entry.kind === "manual").length, 2);
  assert.equal(versions.find((entry) => entry.id === recovery.id).board.revision, 6);
});

test("the same recovery slot is isolated between board IDs", async () => {
  await deleteDatabase();
  const first = await saveVersion(board("slot-board-a", { revision: 8 }), "Tab recovery", "automatic", { slot: "tab-a" });
  const second = await saveVersion(board("slot-board-b", { revision: 9 }), "Tab recovery", "automatic", { slot: "tab-a" });

  assert.notEqual(first.id, second.id);
  assert.equal((await listVersions("slot-board-a"))[0].board.revision, 8);
  assert.equal((await listVersions("slot-board-b"))[0].board.revision, 9);
});

test("repeated identical automatic versions reuse a checkpoint without changing manual or pinned versions", async () => {
  await deleteDatabase();
  const snapshot = board("dedupe", { objects: [{ id: "img", src: `data:image/png;base64,${"a".repeat(20000)}` }] });
  const first = await saveVersion(snapshot, "儲存 Drive 前", "automatic");
  const repeat = await saveVersion(structuredClone(snapshot), "儲存 Drive 前", "automatic");
  assert.equal(repeat.id, first.id);
  const changed = await saveVersion({ ...snapshot, view: { x: 2, y: 0, zoom: 1 } }, "儲存 Drive 前", "automatic");
  const manual = await saveVersion(snapshot, "儲存 Drive 前", "manual");
  const pinned = await saveVersion(snapshot, "儲存 Drive 前", "automatic", { pinned: true });
  assert.notEqual(changed.id, first.id);
  assert.notEqual(manual.id, first.id);
  assert.notEqual(pinned.id, first.id);
  assert.equal((await listVersions(snapshot.id)).length, 4);
});

test("deleting a version requires its board and never deletes a pinned recovery", async () => {
  await deleteDatabase();
  const current = board("delete-version");
  await saveCurrentBoard(current);
  const normal = await saveVersion(current, "可整理", "manual");
  const pinned = await saveVersion(current, "受保護", "automatic", { pinned: true });
  const slot = await saveVersion(current, "跨分頁復原", "automatic", { slot: "tab-a" });
  assert.equal(await deleteVersion(normal.id, { boardId: "another-board" }), false);
  assert.equal(await deleteVersion(pinned.id, { boardId: current.id }), false);
  assert.equal(await deleteVersion(slot.id, { boardId: current.id }), false);
  assert.equal(await deleteVersion(normal.id, { boardId: current.id }), true);
  assert.equal(await deleteVersion(normal.id, { boardId: current.id }), false);
  assert.deepEqual(new Set((await listVersions(current.id)).map((item) => item.id)), new Set([pinned.id, slot.id]));
  assert.equal((await loadCurrentBoard()).id, current.id);
});

test("simultaneous identical automatic checkpoints retain one record", async () => {
  await deleteDatabase();
  const snapshot = board("concurrent-dedupe", { objects: [{ id: "img", src: `data:image/png;base64,${"a".repeat(20000)}` }] });
  const saved = await Promise.all(Array.from({ length: 4 }, () => saveVersion(structuredClone(snapshot), "同一備份", "automatic")));
  assert.equal(new Set(saved.map((item) => item.id)).size, 1);
  assert.equal((await listVersions(snapshot.id)).length, 1);
});

test("a recovery slot survives ordinary version retention", async () => {
  await deleteDatabase();
  const snapshot = board("slot-retention");
  const protectedVersion = await saveVersion(snapshot, "跨分頁復原", "automatic", { slot: "tab-a" });
  for (let revision = 1; revision <= 25; revision += 1) await saveVersion(board(snapshot.id, { revision }), `版本 ${revision}`);
  assert.ok((await listVersions(snapshot.id)).some((item) => item.id === protectedVersion.id));
});

test("quota errors retain previous checkpoints and the current board", async (t) => {
  await deleteDatabase();
  const current = board("quota-check");
  await saveCurrentBoard(current);
  const existing = await saveVersion(current, "原版本", "manual");
  const originalPut = IDBObjectStore.prototype.put;
  t.after(() => { IDBObjectStore.prototype.put = originalPut; });
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "versions") throw new DOMException("quota", "QuotaExceededError");
    return originalPut.apply(this, args);
  };
  await assert.rejects(saveVersion(board(current.id, { revision: 2 }), "新版本", "automatic"), (error) => error.name === "QuotaExceededError");
  assert.equal((await listVersions(current.id))[0].id, existing.id);
  assert.equal((await loadCurrentBoard()).revision, current.revision);
});

test("a pinned oldest recovery survives retention and becomes evictable after unpinning", async () => {
  await deleteDatabase();
  const boardId = "pinned-retention";
  const recovery = await saveVersion(board(boardId, { revision: 0 }), "Before loading", "automatic", { pinned: true });
  await new Promise((resolve) => setTimeout(resolve, 2));

  for (let revision = 1; revision <= 30; revision += 1) {
    await saveVersion(board(boardId, { revision }), `Version ${revision}`);
  }

  let versions = await listVersions(boardId);
  assert.equal(versions.length, 24);
  assert.equal(versions.find((entry) => entry.id === recovery.id)?.pinned, true);

  await setVersionPinned(recovery.id, false);
  await saveVersion(board(boardId, { revision: 31 }), "Version 31");

  versions = await listVersions(boardId);
  assert.equal(versions.length, 24);
  assert.equal(versions.some((entry) => entry.id === recovery.id), false);
});

test("local file handles are stored per board and can be removed independently", async () => {
  await deleteDatabase();
  const firstHandle = { kind: "file", name: "one.moodboard" };
  const secondHandle = { kind: "file", name: "two.moodboard" };
  await saveLocalFileHandle("one", firstHandle);
  await saveLocalFileHandle("two", secondHandle);

  assert.deepEqual(await loadLocalFileHandle("one"), firstHandle);
  assert.deepEqual(await loadLocalFileHandle("two"), secondHandle);

  await removeLocalFileHandle("one");
  assert.equal(await loadLocalFileHandle("one"), null);
  assert.deepEqual(await loadLocalFileHandle("two"), secondHandle);
});

test("local library summary reports board and pending sync counts", async () => {
  await deleteDatabase();
  await saveCurrentBoard(board("summary"));
  await enqueueSync(board("summary", { revision: 2 }));
  const summary = await getLocalLibrarySummary();
  assert.equal(summary.boardCount, 1);
  assert.equal(summary.pendingSyncCount, 1);
  assert.ok(summary.estimatedBoardBytes > 0);
  assert.equal(typeof summary.storage, "object");
});

test("large boards are stored once while the sync queue keeps only scheduling metadata", async () => {
  await deleteDatabase();
  const large = board("large", {
    revision: 42,
    objects: [{ id: "image-1", type: "image", source: `data:image/png;base64,${"a".repeat(2 * 1024 * 1024)}` }],
  });

  await saveCurrentBoard(large);
  await enqueueSync(large, { fileId: "drive-large", expectedVersion: "7" });

  const local = await getLocalBoard("large");
  const queued = await getSyncJob("large");
  assert.equal(local.board.objects[0].source.length > 2 * 1024 * 1024, true);
  assert.equal(queued.board, undefined);
  assert.equal(queued.snapshotRevision, 42);
  assert.equal(queued.snapshotObjectCount, 1);
});

test("compaction removes legacy and queued full-board copies only after an authoritative board exists", async () => {
  await deleteDatabase();
  const snapshot = board("compact", { revision: 9, objects: [{ id: "object-9" }] });
  await saveCurrentBoard(snapshot);
  await enqueueSync(snapshot, { fileId: "drive-compact", retainSnapshot: true });

  await new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DATABASE_NAME, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", "readwrite");
      transaction.objectStore("state").put({ key: "current-board", board: snapshot, savedAt: snapshot.updatedAt });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  });

  const result = await compactLocalRecoveryStorage(snapshot.id);
  assert.deepEqual(result, { removedLegacyCopy: true, compactedSyncJob: true });
  assert.equal((await getSyncJob(snapshot.id)).board, undefined);
  assert.equal((await loadCurrentBoard()).revision, 9);
});

test("compaction never removes a queued snapshot newer than the authoritative local board", async () => {
  await deleteDatabase();
  await saveCurrentBoard(board("newer-queue", { revision: 3, updatedAt: "2026-10-20T03:00:00.000Z" }));
  await enqueueSync(board("newer-queue", { revision: 4, updatedAt: "2026-10-20T04:00:00.000Z" }), {
    fileId: "drive-newer",
    retainSnapshot: true,
  });

  const result = await compactLocalRecoveryStorage("newer-queue");
  assert.equal(result.compactedSyncJob, false);
  assert.equal((await getSyncJob("newer-queue")).board.revision, 4);
});

test("local persistence failures are classified into actionable messages", () => {
  assert.match(describeLocalPersistenceError(new DOMException("quota", "QuotaExceededError")), /空間不足/);
  assert.match(describeLocalPersistenceError(new Error("The storage quota was reached.")), /空間不足/);
  assert.match(describeLocalPersistenceError(new Error("There is not enough remaining storage space.")), /空間不足/);
  assert.match(describeLocalPersistenceError(new Error("No space left on device")), /空間不足/);
  assert.match(describeLocalPersistenceError(new DOMException("clone", "DataCloneError")), /無法寫入/);
  assert.match(describeLocalPersistenceError(new DOMException("transaction inactive", "InvalidStateError")), /其他 Infinite Studio 分頁/);
  assert.match(describeLocalPersistenceError(new Error("Storage is disabled")), /未能更新/);
  assert.match(describeLocalPersistenceError(new Error("Storage access failure")), /未能更新/);
  assert.match(describeLocalPersistenceError(new Error("unknown")), /未能更新/);
});

test("saving an identical snapshot avoids rewriting the board and active pointer", async (t) => {
  await deleteDatabase();
  const initial = board("unchanged", { objects: [{ id: "large", src: `data:image/png;base64,${"a".repeat(10000)}` }] });
  await saveCurrentBoard(initial);
  const originalPut = IDBObjectStore.prototype.put;
  const writes = [];
  IDBObjectStore.prototype.put = function (...args) { writes.push(this.name); return originalPut.apply(this, args); };
  t.after(() => { IDBObjectStore.prototype.put = originalPut; });
  await saveCurrentBoard(structuredClone(initial));
  assert.equal(writes.includes("boards"), false);
  assert.equal(writes.includes("meta"), false);
  await saveCurrentBoard({ ...initial, view: { x: 1, y: 0, zoom: 1 } });
  assert.equal(writes.includes("boards"), true);
  assert.equal((await loadCurrentBoard()).view.x, 1);
});

test("identical board still updates the active pointer when switching files", async () => {
  await deleteDatabase();
  const first = board("first-active");
  await saveCurrentBoard(first);
  await saveCurrentBoard(board("second-active"));
  await saveCurrentBoard(structuredClone(first));
  assert.equal(await getActiveBoardId(), first.id);
});

test("quota failure preserves the prior snapshot while identical saves avoid a board write", async (t) => {
  await deleteDatabase();
  const initial = board("quota-idempotent", { objects: [{ id: "one" }] });
  await saveCurrentBoard(initial);
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "boards") throw new DOMException("quota", "QuotaExceededError");
    return originalPut.apply(this, args);
  };
  t.after(() => { IDBObjectStore.prototype.put = originalPut; });
  await saveCurrentBoard(structuredClone(initial));
  await assert.rejects(saveCurrentBoard({ ...initial, revision: 2 }), { name: "QuotaExceededError" });
  assert.equal((await loadCurrentBoard()).revision, initial.revision);
});
