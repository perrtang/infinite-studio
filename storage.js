export const LOCAL_DATABASE_NAME = "moodboard-lab";
export const LOCAL_DATABASE_VERSION = 2;

const STATE_STORE = "state";
const VERSION_STORE = "versions";
const BOARD_STORE = "boards";
const SYNC_QUEUE_STORE = "syncQueue";
const META_STORE = "meta";
const CURRENT_BOARD_KEY = "current-board";
const ACTIVE_BOARD_KEY = "active-board-id";
const LOCAL_FILE_HANDLE_PREFIX = "local-file-handle:";
const MAX_VERSIONS_PER_BOARD = 24;
const RETRYABLE_SYNC_STATES = new Set(["pending", "offline", "error"]);

function localFileHandleKey(boardId) {
  return `${LOCAL_FILE_HANDLE_PREFIX}${String(boardId || "")}`;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function textByteLength(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return new TextEncoder().encode(text).byteLength;
}

function localBoardRecord(board, savedAt = new Date().toISOString()) {
  if (!board?.id) throw new Error("工作檔缺少可辨識的 ID。");
  return {
    id: String(board.id),
    name: String(board.name || "未命名 Infinite Studio"),
    nameNormalized: String(board.name || "").trim().toLocaleLowerCase(),
    createdAt: String(board.createdAt || savedAt),
    updatedAt: String(board.updatedAt || savedAt),
    savedAt,
    revision: Number.isFinite(Number(board.revision)) ? Number(board.revision) : 0,
    objectCount: Array.isArray(board.objects) ? board.objects.length : 0,
    byteSize: textByteLength(board),
    board,
  };
}

function compactSyncJobRecord(job, fallbackBoard = null) {
  const snapshot = job?.board || fallbackBoard;
  const compacted = {
    ...job,
    name: String(job?.name || snapshot?.name || "未命名 Infinite Studio"),
    snapshotRevision: Number.isFinite(Number(job?.snapshotRevision))
      ? Number(job.snapshotRevision)
      : Number(snapshot?.revision || 0),
    snapshotUpdatedAt: String(job?.snapshotUpdatedAt || snapshot?.updatedAt || ""),
    snapshotObjectCount: Number.isFinite(Number(job?.snapshotObjectCount))
      ? Number(job.snapshotObjectCount)
      : Array.isArray(snapshot?.objects) ? snapshot.objects.length : 0,
  };
  delete compacted.board;
  return compacted;
}

function boardRecordCoversSnapshot(record, snapshot) {
  if (!record?.board?.id || !snapshot?.id || String(record.board.id) !== String(snapshot.id)) return false;
  const recordRevision = Number(record.revision ?? record.board.revision ?? 0);
  const snapshotRevision = Number(snapshot.revision ?? 0);
  if (recordRevision !== snapshotRevision) return recordRevision > snapshotRevision;
  const recordUpdatedAt = String(record.updatedAt || record.board.updatedAt || "");
  const snapshotUpdatedAt = String(snapshot.updatedAt || "");
  return !snapshotUpdatedAt || !recordUpdatedAt || recordUpdatedAt >= snapshotUpdatedAt;
}

export function describeLocalPersistenceError(error) {
  const name = String(error?.name || error?.details?.name || "");
  const message = String(error?.message || error?.details?.message || "");
  const quotaExceededMessage = /\b(?:quotaexceedederror|(?:storage\s+)?quota\s+(?:has\s+been\s+|was\s+)?(?:exceeded|reached)|(?:exceeded|reached)\s+(?:the\s+)?(?:storage\s+)?quota|no\s+space\s+left(?:\s+on\s+device)?|not\s+enough\s+(?:remaining\s+)?(?:storage|disk)\s+space|insufficient\s+(?:storage|disk)\s+space|out\s+of\s+(?:storage|disk)\s+space)\b/i;
  if (name === "QuotaExceededError" || quotaExceededMessage.test(message)) {
    return "這個瀏覽器的本機儲存空間不足。";
  }
  if (name === "DataCloneError" || /clone/i.test(message)) {
    return "目前內容含有瀏覽器無法寫入本機復原副本的資料。";
  }
  if (name === "InvalidStateError" || /blocked|transaction|database|indexeddb/i.test(message)) {
    return "本機資料庫暫時無法寫入，可能有其他 Infinite Studio 分頁正在使用。";
  }
  return "這個瀏覽器的本機復原副本未能更新。";
}

function ensureIndex(store, name, keyPath) {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

function openDatabase() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("這個瀏覽器不支援 IndexedDB。"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DATABASE_NAME, LOCAL_DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      const oldVersion = Number(event.oldVersion || 0);

      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(VERSION_STORE)) {
        const store = database.createObjectStore(VERSION_STORE, { keyPath: "id" });
        store.createIndex("boardId", "boardId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(BOARD_STORE)) {
        const store = database.createObjectStore(BOARD_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("nameNormalized", "nameNormalized", { unique: false });
      } else {
        const store = transaction.objectStore(BOARD_STORE);
        ensureIndex(store, "updatedAt", "updatedAt");
        ensureIndex(store, "nameNormalized", "nameNormalized");
      }
      if (!database.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = database.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id" });
        store.createIndex("state", "state", { unique: false });
        store.createIndex("nextAttemptAt", "nextAttemptAt", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "key" });
      }

      if (oldVersion < 2) {
        const legacyRequest = transaction.objectStore(STATE_STORE).get(CURRENT_BOARD_KEY);
        legacyRequest.onsuccess = () => {
          const legacyBoard = legacyRequest.result?.board;
          if (!legacyBoard?.id) return;
          const savedAt = String(legacyRequest.result?.savedAt || new Date().toISOString());
          transaction.objectStore(BOARD_STORE).put(localBoardRecord(legacyBoard, savedAt));
          transaction.objectStore(META_STORE).put({ key: ACTIVE_BOARD_KEY, value: String(legacyBoard.id), updatedAt: savedAt });
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("無法開啟本機資料庫。"));
    request.onblocked = () => reject(new Error("另一個分頁正在更新本機工作檔資料庫，請關閉舊分頁後重試。"));
  });
}

async function withDatabase(callback) {
  const database = await openDatabase();
  try {
    return await callback(database);
  } finally {
    database.close();
  }
}

export async function getActiveBoardId() {
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, "readonly");
    const result = await requestToPromise(transaction.objectStore(META_STORE).get(ACTIVE_BOARD_KEY));
    return result?.value || "";
  });
}

export async function setActiveBoardId(boardId) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, "readwrite");
    if (boardId) {
      transaction.objectStore(META_STORE).put({ key: ACTIVE_BOARD_KEY, value: String(boardId), updatedAt: new Date().toISOString() });
    } else {
      transaction.objectStore(META_STORE).delete(ACTIVE_BOARD_KEY);
    }
    await transactionToPromise(transaction);
  });
}

export async function loadLocalFileHandle(boardId) {
  if (!boardId) return null;
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, "readonly");
    const record = await requestToPromise(transaction.objectStore(META_STORE).get(localFileHandleKey(boardId)));
    return record?.handle || null;
  });
}

export async function saveLocalFileHandle(boardId, handle) {
  if (!boardId || !handle) throw new Error("缺少可保存的本機檔案位置。");
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put({
      key: localFileHandleKey(boardId),
      handle,
      name: String(handle.name || ""),
      updatedAt: new Date().toISOString(),
    });
    await transactionToPromise(transaction);
    return handle;
  });
}

export async function removeLocalFileHandle(boardId) {
  if (!boardId) return;
  return withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).delete(localFileHandleKey(boardId));
    await transactionToPromise(transaction);
  });
}

export async function getLocalBoard(boardId) {
  if (!boardId) return null;
  return withDatabase(async (database) => {
    const transaction = database.transaction(BOARD_STORE, "readonly");
    const result = await requestToPromise(transaction.objectStore(BOARD_STORE).get(String(boardId)));
    return result || null;
  });
}

export async function listLocalBoards() {
  return withDatabase(async (database) => {
    const transaction = database.transaction(BOARD_STORE, "readonly");
    const records = await requestToPromise(transaction.objectStore(BOARD_STORE).getAll());
    return records.sort((a, b) => String(b.updatedAt || b.savedAt).localeCompare(String(a.updatedAt || a.savedAt)));
  });
}

export async function upsertLocalBoard(board) {
  const record = localBoardRecord(board);
  await withDatabase(async (database) => {
    const transaction = database.transaction(BOARD_STORE, "readwrite");
    transaction.objectStore(BOARD_STORE).put(record);
    await transactionToPromise(transaction);
  });
  return record;
}

export async function loadCurrentBoard(preferredBoardId = "") {
  return withDatabase(async (database) => {
    const transaction = database.transaction([META_STORE, BOARD_STORE, STATE_STORE], "readonly");
    // An explicit tab identity must never fall back to another tab's board.
    if (preferredBoardId) {
      const record = await requestToPromise(transaction.objectStore(BOARD_STORE).get(String(preferredBoardId)));
      return record?.board || null;
    }
    const meta = await requestToPromise(transaction.objectStore(META_STORE).get(ACTIVE_BOARD_KEY));
    if (meta?.value) {
      const record = await requestToPromise(transaction.objectStore(BOARD_STORE).get(meta.value));
      if (record?.board) return record.board;
    }
    const legacy = await requestToPromise(transaction.objectStore(STATE_STORE).get(CURRENT_BOARD_KEY));
    return legacy?.board || null;
  });
}

export async function compactLocalRecoveryStorage(boardId) {
  const id = String(boardId || "");
  if (!id) return { removedLegacyCopy: false, compactedSyncJob: false };
  return withDatabase(async (database) => {
    const transaction = database.transaction([STATE_STORE, BOARD_STORE, SYNC_QUEUE_STORE], "readwrite");
    const stateStore = transaction.objectStore(STATE_STORE);
    const boardStore = transaction.objectStore(BOARD_STORE);
    const queueStore = transaction.objectStore(SYNC_QUEUE_STORE);
    const boardRequest = boardStore.get(id);
    const legacyRequest = stateStore.get(CURRENT_BOARD_KEY);
    const queueRequest = queueStore.get(id);
    let pendingRequests = 3;
    let boardRecord;
    let legacyRecord;
    let queuedJob;
    let removedLegacyCopy = false;
    let compactedSyncJob = false;
    const applyCompaction = () => {
      pendingRequests -= 1;
      if (pendingRequests > 0) return;
      const hasAuthoritativeBoard = Boolean(boardRecord?.board?.id);
      const legacyMatches = String(legacyRecord?.board?.id || "") === id;
      const legacyIsCovered = legacyMatches && boardRecordCoversSnapshot(boardRecord, legacyRecord.board);
      const queuedSnapshotIsCovered = queuedJob?.board && boardRecordCoversSnapshot(boardRecord, queuedJob.board);
      removedLegacyCopy = Boolean(hasAuthoritativeBoard && legacyIsCovered);
      compactedSyncJob = Boolean(hasAuthoritativeBoard && queuedSnapshotIsCovered);
      if (removedLegacyCopy) stateStore.delete(CURRENT_BOARD_KEY);
      if (compactedSyncJob) queueStore.put(compactSyncJobRecord(queuedJob, boardRecord.board));
    };
    boardRequest.onsuccess = () => {
      boardRecord = boardRequest.result;
      applyCompaction();
    };
    legacyRequest.onsuccess = () => {
      legacyRecord = legacyRequest.result;
      applyCompaction();
    };
    queueRequest.onsuccess = () => {
      queuedJob = queueRequest.result;
      applyCompaction();
    };
    await transactionToPromise(transaction);
    return {
      removedLegacyCopy,
      compactedSyncJob,
    };
  });
}

export async function saveCurrentBoard(board) {
  const savedAt = new Date().toISOString();
  const record = localBoardRecord(board, savedAt);
  await compactLocalRecoveryStorage(record.id).catch(() => undefined);
  let saved = record;
  await withDatabase(async (database) => {
    const transaction = database.transaction([BOARD_STORE, META_STORE], "readwrite");
    const boardStore = transaction.objectStore(BOARD_STORE);
    const metaStore = transaction.objectStore(META_STORE);
    const boardRequest = boardStore.get(record.id);
    const metaRequest = metaStore.get(ACTIVE_BOARD_KEY);
    let existing;
    let active;
    let remaining = 2;
    let operationError = null;
    const updateIfNeeded = () => {
      if (--remaining) return;
      try {
        // Compare the complete snapshot. Revision alone cannot detect view,
        // metadata, or older clients that reuse a revision number.
        if (existing?.board && JSON.stringify(existing.board) === JSON.stringify(board)) saved = existing;
        else boardStore.put(record);
        if (active?.value !== record.id) metaStore.put({ key: ACTIVE_BOARD_KEY, value: record.id, updatedAt: savedAt });
      } catch (error) { operationError = error; transaction.abort(); }
    };
    boardRequest.onsuccess = () => { existing = boardRequest.result; updateIfNeeded(); };
    metaRequest.onsuccess = () => { active = metaRequest.result; updateIfNeeded(); };
    try { await transactionToPromise(transaction); }
    catch (error) { throw operationError || error; }
  });
  return saved;
}

export async function deleteLocalBoard(boardId, { deleteVersions = true } = {}) {
  if (!boardId) return;
  await withDatabase(async (database) => {
    const stores = [BOARD_STORE, SYNC_QUEUE_STORE, META_STORE, STATE_STORE];
    if (deleteVersions) stores.push(VERSION_STORE);
    const transaction = database.transaction(stores, "readwrite");
    transaction.objectStore(BOARD_STORE).delete(boardId);
    transaction.objectStore(SYNC_QUEUE_STORE).delete(boardId);
    transaction.objectStore(META_STORE).delete(localFileHandleKey(boardId));

    const activeRequest = transaction.objectStore(META_STORE).get(ACTIVE_BOARD_KEY);
    activeRequest.onsuccess = () => {
      if (activeRequest.result?.value === boardId) {
        transaction.objectStore(META_STORE).delete(ACTIVE_BOARD_KEY);
        transaction.objectStore(STATE_STORE).delete(CURRENT_BOARD_KEY);
      }
    };

    if (deleteVersions) {
      const cursorRequest = transaction.objectStore(VERSION_STORE).index("boardId").openCursor(boardId);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    }
    await transactionToPromise(transaction);
  });
}

export async function enqueueSync(board, metadata = {}) {
  if (!board?.id) throw new Error("無法排入沒有 ID 的工作檔。");
  const now = new Date().toISOString();
  const id = String(board.id);
  await withDatabase(async (database) => {
    const transaction = database.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const existingRequest = store.get(id);
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result;
      const next = compactSyncJobRecord({
        id,
        boardId: id,
        name: String(board.name || existing?.name || "未命名 Infinite Studio"),
        snapshotRevision: Number(board.revision || 0),
        snapshotUpdatedAt: String(board.updatedAt || ""),
        snapshotObjectCount: Array.isArray(board.objects) ? board.objects.length : 0,
        fileId: String(metadata.fileId || existing?.fileId || ""),
        expectedVersion: String(metadata.expectedVersion || existing?.expectedVersion || ""),
        state: "pending",
        attemptCount: Number(existing?.attemptCount || 0),
        lastError: "",
        createdAt: String(existing?.createdAt || now),
        updatedAt: now,
        nextAttemptAt: now,
      }, board);
      if (metadata.retainSnapshot) next.board = board;
      store.put(next);
    };
    await transactionToPromise(transaction);
  });
  return getSyncJob(id);
}

export async function getSyncJob(boardId) {
  if (!boardId) return null;
  return withDatabase(async (database) => {
    const transaction = database.transaction(SYNC_QUEUE_STORE, "readonly");
    return (await requestToPromise(transaction.objectStore(SYNC_QUEUE_STORE).get(String(boardId)))) || null;
  });
}

export async function listSyncJobs() {
  return withDatabase(async (database) => {
    const transaction = database.transaction(SYNC_QUEUE_STORE, "readonly");
    const records = await requestToPromise(transaction.objectStore(SYNC_QUEUE_STORE).getAll());
    return records.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  });
}

export async function recoverInterruptedSyncJobs(now = new Date()) {
  const recoveredAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return withDatabase(async (database) => {
    const transaction = database.transaction(SYNC_QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    const records = await requestToPromise(store.getAll());
    const recovered = records.map((job) => {
      if (job.state !== "syncing") return job;
      const next = {
        ...job,
        state: "pending",
        lastError: "上次同步因頁面更新或關閉而中斷，本機內容仍已保留。",
        nextAttemptAt: recoveredAt,
        updatedAt: recoveredAt,
      };
      store.put(next);
      return next;
    });
    await transactionToPromise(transaction);
    return recovered.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  });
}

export async function getDueSyncJobs(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const jobs = await listSyncJobs();
  return jobs.filter((job) => {
    const retryAt = Date.parse(String(job.nextAttemptAt || ""));
    return RETRYABLE_SYNC_STATES.has(job.state)
      && Number.isFinite(retryAt)
      && retryAt <= timestamp;
  });
}

export async function updateSyncJob(boardId, patch = {}) {
  if (!boardId) return null;
  const current = await getSyncJob(boardId);
  if (!current) return null;
  const updated = {
    ...current,
    ...patch,
    id: current.id,
    boardId: current.boardId,
    updatedAt: new Date().toISOString(),
  };
  await withDatabase(async (database) => {
    const transaction = database.transaction(SYNC_QUEUE_STORE, "readwrite");
    transaction.objectStore(SYNC_QUEUE_STORE).put(updated);
    await transactionToPromise(transaction);
  });
  return updated;
}

export async function removeSyncJob(boardId) {
  if (!boardId) return;
  await withDatabase(async (database) => {
    const transaction = database.transaction(SYNC_QUEUE_STORE, "readwrite");
    transaction.objectStore(SYNC_QUEUE_STORE).delete(String(boardId));
    await transactionToPromise(transaction);
  });
}

export async function localStorageEstimate() {
  const storage = globalThis.navigator?.storage;
  const estimate = await storage?.estimate?.().catch(() => null);
  const persisted = await storage?.persisted?.().catch(() => null);
  return {
    usage: Number.isFinite(Number(estimate?.usage)) ? Number(estimate.usage) : null,
    quota: Number.isFinite(Number(estimate?.quota)) ? Number(estimate.quota) : null,
    persisted: typeof persisted === "boolean" ? persisted : null,
  };
}

export async function getLocalLibrarySummary() {
  const [boards, queue, storage] = await Promise.all([
    listLocalBoards(),
    listSyncJobs(),
    localStorageEstimate(),
  ]);
  return {
    boardCount: boards.length,
    pendingSyncCount: queue.length,
    estimatedBoardBytes: boards.reduce((total, record) => total + Number(record.byteSize || 0), 0),
    storage,
  };
}

export async function listVersions(boardId) {
  return withDatabase(async (database) => {
    const transaction = database.transaction(VERSION_STORE, "readonly");
    const index = transaction.objectStore(VERSION_STORE).index("boardId");
    const versions = await requestToPromise(index.getAll(boardId));
    return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

async function pruneVersions(boardId) {
  const versions = await listVersions(boardId);
  const protectedCount = versions.filter((item) => item.pinned || item.slot).length;
  const unpinnedLimit = Math.max(0, MAX_VERSIONS_PER_BOARD - protectedCount);
  const overflow = versions.filter((item) => !item.pinned && !item.slot).slice(unpinnedLimit);
  if (!overflow.length) return;

  await withDatabase(async (database) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    overflow.forEach((item) => {
      const request = store.get(item.id);
      request.onsuccess = () => {
        const current = request.result;
        if (current && !current.pinned && !current.slot) store.delete(item.id);
      };
    });
    await transactionToPromise(transaction);
  });
}

export async function saveVersion(board, label, kind = "manual", { slot = "", pinned = false } = {}) {
  const createdAt = new Date().toISOString();
  const versionSlot = String(slot ?? "").trim();
  if (versionSlot.length > 128) throw new Error("版本儲存位置名稱過長。");
  const version = {
    id: versionSlot
      ? `version-slot:${JSON.stringify([String(board.id), versionSlot])}`
      : `version-${board.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    boardId: board.id,
    createdAt,
    label: String(label || "未命名版本").trim().slice(0, 80) || "未命名版本",
    kind,
    pinned: Boolean(pinned),
    ...(versionSlot ? { slot: versionSlot } : {}),
    objectCount: board.objects.length,
    board,
  };
  // Identical automatic checkpoints can share the existing record. Compare the
  // entire snapshot, not just its revision; pinned and manual versions remain
  // independent, and existing records are never deleted by this optimisation.
  const mayReuse = kind === "automatic" && !pinned && !versionSlot;
  const serializedBoard = mayReuse ? JSON.stringify(board) : "";
  let savedVersion = version;
  let inserted = true;
  await withDatabase(async (database) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    let cursorFailure = null;
    if (!mayReuse) store.put(version);
    else {
      const request = store.index("boardId").openCursor(String(board.id));
      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (!cursor) { store.put(version); return; }
          const existing = cursor.value;
          if (existing.kind === "automatic" && !existing.pinned && !existing.slot
            && existing.label === version.label && existing.board?.revision === board.revision
            && existing.board?.updatedAt === board.updatedAt && JSON.stringify(existing.board) === serializedBoard) {
            savedVersion = existing;
            inserted = false;
            return;
          }
          cursor.continue();
        } catch (error) {
          cursorFailure = error;
          transaction.abort();
        }
      };
    }
    try { await transactionToPromise(transaction); }
    catch (error) { throw cursorFailure || error; }
  });
  if (inserted) await pruneVersions(board.id);
  return savedVersion;
}

export async function setVersionPinned(versionId, pinned) {
  if (!versionId) return null;
  const updated = await withDatabase(async (database) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const completed = transactionToPromise(transaction);
    const store = transaction.objectStore(VERSION_STORE);
    const existing = await requestToPromise(store.get(String(versionId)));
    if (!existing) {
      await completed;
      return null;
    }
    const record = { ...existing, pinned: Boolean(pinned) };
    store.put(record);
    await completed;
    return record;
  });
  if (updated) await pruneVersions(updated.boardId);
  return updated;
}

export async function deleteVersion(versionId, { boardId = "" } = {}) {
  if (!versionId || !boardId) return false;
  return withDatabase(async (database) => {
    const transaction = database.transaction(VERSION_STORE, "readwrite");
    const store = transaction.objectStore(VERSION_STORE);
    let deleted = false;
    let deleteFailure = null;
    const request = store.get(String(versionId));
    request.onsuccess = () => {
      const version = request.result;
      if (version && String(version.boardId) === String(boardId) && !version.pinned && !version.slot) {
        try { store.delete(String(versionId)); deleted = true; }
        catch (error) { deleteFailure = error; transaction.abort(); }
      }
    };
    try { await transactionToPromise(transaction); }
    catch (error) { throw deleteFailure || error; }
    return deleted;
  });
}

export async function clearLocalMoodboardData() {
  return withDatabase(async (database) => {
    const transaction = database.transaction([STATE_STORE, VERSION_STORE, BOARD_STORE, SYNC_QUEUE_STORE, META_STORE], "readwrite");
    transaction.objectStore(STATE_STORE).clear();
    transaction.objectStore(VERSION_STORE).clear();
    transaction.objectStore(BOARD_STORE).clear();
    transaction.objectStore(SYNC_QUEUE_STORE).clear();
    transaction.objectStore(META_STORE).clear();
    await transactionToPromise(transaction);
  });
}
