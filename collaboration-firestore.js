import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "@firebase/firestore";
import {
  COLLABORATION_DEFAULT_INVITE_ROLE,
  COLLABORATION_INVITE_TTL_MS,
  LOCAL_COLLABORATION_ORIGIN,
  REMOTE_COLLABORATION_ORIGIN,
  applyCollaborationUpdate,
  assertVerifiedCollaborationUser,
  collaborationId,
  combineCollaborationChunks,
  createCollaborationDocument,
  createCollaborationInviteUrl,
  encodeCollaborationDocument,
  listenToCollaborationUpdates,
  normalizeCollaborationAccessRequestStatus,
  normalizeCollaborationInvite,
  normalizeCollaborationRole,
  readBoardFromCollaborationDocument,
  splitCollaborationUpdate,
  writeBoardToCollaborationDocument,
} from "./collaboration.js";
import {
  listQueuedCollaborationUpdates,
  queueCollaborationUpdate,
  removeQueuedCollaborationUpdate,
  updateQueuedCollaborationUpdate,
} from "./collaboration-queue.js";
import { getMoodboardFirebaseApp } from "./auth.js";

export const COLLABORATION_ROOMS_COLLECTION = "infiniteMoodboardRooms";
export const COLLABORATION_INVITES_COLLECTION = "infiniteMoodboardInvites";
const CHUNK_UPLOAD_BATCH_SIZE = 16;
const PRESENCE_STALE_MS = 45_000;
const PRESENCE_HEARTBEAT_MS = 15_000;

let firestoreInstance;

export function getMoodboardCollaborationDatabase() {
  if (firestoreInstance) return firestoreInstance;
  const app = getMoodboardFirebaseApp();
  try {
    firestoreInstance = initializeFirestore(app, { localCache: memoryLocalCache() });
  } catch (error) {
    if (!/already|initialized/i.test(String(error?.message || ""))) throw error;
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

function requireOnline() {
  if (globalThis.navigator?.onLine === false) {
    const error = new Error("目前離線；畫布仍保存在這台裝置，連線後才能建立或加入共編空間。");
    error.code = "collaboration/offline";
    throw error;
  }
}

export function collaborationErrorMessage(error) {
  if (error?.code === "collaboration/verified-account-required") return error.message;
  if (error?.code === "collaboration/offline" || error?.code === "unavailable") return "目前離線；共編更新已保留在這台裝置，恢復連線後會繼續送出。";
  if (error?.code === "permission-denied") return "目前帳號沒有這個共編空間的權限，或雲端安全規則尚未啟用。";
  if (error?.code === "unauthenticated") return "登入狀態已失效；請重新登入後再加入共編。";
  if (error?.code === "not-found" || error?.code === "collaboration/invite-not-found") return "找不到這個共編邀請；它可能已失效或被停用。";
  if (error?.code === "collaboration/invite-expired") return "這個共編邀請已過期，請擁有者重新產生邀請。";
  if (error?.code === "collaboration/not-initialized") return "共編空間仍在準備初始內容，請稍後再試。";
  if (error?.code === "collaboration/request-not-allowed") return error.message;
  if (error?.code === "collaboration/request-not-found") return "這筆編輯權限申請已處理；成員狀態會自動更新。";
  if (error?.code === "collaboration/update-too-large") return error.message;
  return error?.message || "即時共編暫時無法使用；本機工作檔未受影響。";
}

function roomReferences(database, roomId) {
  const room = doc(database, COLLABORATION_ROOMS_COLLECTION, roomId);
  return {
    room,
    members: collection(room, "members"),
    accessRequests: collection(room, "accessRequests"),
    updates: collection(room, "updates"),
    presence: collection(room, "presence"),
  };
}

function timestampMillis(value) {
  return value?.toMillis?.() || Number(value || 0) || 0;
}

function normalizeMemberSnapshot(entry) {
  const data = entry.data();
  return {
    uid: String(data.uid || entry.id),
    name: String(data.name || "協作者"),
    role: normalizeCollaborationRole(data.role),
    joinedAt: timestampMillis(data.joinedAt),
  };
}

function normalizeAccessRequestSnapshot(entry) {
  if (!entry?.exists?.()) return null;
  const data = entry.data();
  return {
    uid: String(data.uid || entry.id),
    name: String(data.name || "協作者"),
    requestedRole: "editor",
    status: normalizeCollaborationAccessRequestStatus(data.status),
    requestedAt: timestampMillis(data.requestedAt),
    decidedAt: timestampMillis(data.decidedAt),
    decidedBy: String(data.decidedBy || ""),
  };
}

export async function requestMoodboardCollaborationEditAccess({ roomId, user }) {
  assertVerifiedCollaborationUser(user);
  requireOnline();
  const database = getMoodboardCollaborationDatabase();
  const refs = roomReferences(database, roomId);
  const memberSnapshot = await getDoc(doc(refs.members, user.uid));
  if (!memberSnapshot.exists() || normalizeCollaborationRole(memberSnapshot.data().role) !== "viewer") {
    const error = new Error("只有僅檢視成員需要申請編輯權限。");
    error.code = "collaboration/request-not-allowed";
    throw error;
  }
  const requestRef = doc(refs.accessRequests, user.uid);
  const current = await getDoc(requestRef);
  if (current.exists() && normalizeCollaborationAccessRequestStatus(current.data().status) === "pending") {
    return normalizeAccessRequestSnapshot(current);
  }
  const name = String(user.displayName || "協作者").slice(0, 80);
  await setDoc(requestRef, {
    uid: user.uid,
    name,
    requestedRole: "editor",
    status: "pending",
    requestedAt: serverTimestamp(),
  });
  return { uid: user.uid, name, requestedRole: "editor", status: "pending" };
}

export async function resolveMoodboardCollaborationAccessRequest({ roomId, requesterUid, decision, user }) {
  assertVerifiedCollaborationUser(user);
  requireOnline();
  if (!["approved", "denied"].includes(decision)) throw new Error("編輯權限決定不正確。");
  const database = getMoodboardCollaborationDatabase();
  const refs = roomReferences(database, roomId);
  const requestRef = doc(refs.accessRequests, requesterUid);
  const requestSnapshot = await getDoc(requestRef);
  if (!requestSnapshot.exists() || normalizeCollaborationAccessRequestStatus(requestSnapshot.data().status) !== "pending") {
    const error = new Error("這筆編輯權限申請已不存在或已處理。");
    error.code = "collaboration/request-not-found";
    throw error;
  }
  const batch = writeBatch(database);
  if (decision === "approved") batch.update(doc(refs.members, requesterUid), { role: "editor" });
  batch.update(requestRef, { status: decision, decidedAt: serverTimestamp(), decidedBy: user.uid });
  await batch.commit();
}

export async function setMoodboardCollaborationMemberRole({ roomId, memberUid, role, user }) {
  assertVerifiedCollaborationUser(user);
  requireOnline();
  const nextRole = normalizeCollaborationRole(role);
  if (!["editor", "viewer"].includes(nextRole)) throw new Error("只能設定為可編輯或僅檢視。");
  const database = getMoodboardCollaborationDatabase();
  const refs = roomReferences(database, roomId);
  await updateDoc(doc(refs.members, memberUid), { role: nextRole });
}

function updateReference(database, roomId, updateId) {
  return doc(database, COLLABORATION_ROOMS_COLLECTION, roomId, "updates", updateId);
}

function makeQueuedUpdate({ roomId, clientId, senderUid, update }) {
  const bytes = update instanceof Uint8Array ? update : new Uint8Array(update || []);
  return {
    id: collaborationId("update", 15),
    roomId,
    clientId,
    senderUid,
    chunks: splitCollaborationUpdate(bytes),
    byteLength: bytes.byteLength,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: "",
  };
}

async function uploadQueuedUpdate(database, user, record) {
  if (record.senderUid !== user.uid) {
    const error = new Error("離線協作更新屬於另一個帳號，已保留但不會送出。");
    error.code = "collaboration/account-mismatch";
    throw error;
  }
  const updateRef = updateReference(database, record.roomId, record.id);
  const existingManifest = await getDoc(updateRef);
  if (existingManifest.exists() && existingManifest.data().ready === true) {
    await removeQueuedCollaborationUpdate(record.id);
    return;
  }
  if (existingManifest.exists()) {
    const manifest = existingManifest.data();
    const matchesQueuedUpdate = manifest.roomId === record.roomId
      && manifest.senderUid === user.uid
      && manifest.clientId === record.clientId
      && manifest.chunkCount === record.chunks.length
      && manifest.byteLength === record.byteLength;
    if (!matchesQueuedUpdate) {
      const error = new Error("雲端已有同名但內容不同的共編更新；本機變更已保留，請重新加入共編空間。");
      error.code = "collaboration/update-conflict";
      throw error;
    }
  } else {
    await setDoc(updateRef, {
      roomId: record.roomId,
      senderUid: user.uid,
      clientId: record.clientId,
      ready: false,
      chunkCount: record.chunks.length,
      byteLength: record.byteLength,
      encoding: "base64-chunks-v1",
      clientCreatedAt: Date.parse(record.createdAt) || Date.now(),
      createdAt: serverTimestamp(),
    });
  }

  for (let offset = 0; offset < record.chunks.length; offset += CHUNK_UPLOAD_BATCH_SIZE) {
    const batch = writeBatch(database);
    record.chunks.slice(offset, offset + CHUNK_UPLOAD_BATCH_SIZE).forEach((data, localIndex) => {
      const index = offset + localIndex;
      batch.set(doc(updateRef, "chunks", String(index).padStart(4, "0")), { index, data });
    });
    await batch.commit();
  }

  await updateDoc(updateRef, { ready: true, committedAt: serverTimestamp() });
  // Room metadata is an owner-only convenience. Editors must still be able to
  // finish and remove a successfully uploaded update from their local queue.
  await updateDoc(doc(database, COLLABORATION_ROOMS_COLLECTION, record.roomId), {
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);
  await removeQueuedCollaborationUpdate(record.id);
}

async function queueAndUploadUpdate(database, user, details) {
  const record = await queueCollaborationUpdate(makeQueuedUpdate({ ...details, senderUid: user.uid }));
  try {
    await uploadQueuedUpdate(database, user, record);
  } catch (error) {
    await updateQueuedCollaborationUpdate(record.id, {
      attemptCount: Number(record.attemptCount || 0) + 1,
      lastError: collaborationErrorMessage(error),
    }).catch(() => undefined);
    throw error;
  }
  return record.id;
}

async function readManifestUpdate(database, roomId, manifest) {
  const data = manifest.data();
  if (!data?.ready || !Number.isInteger(data.chunkCount) || data.chunkCount < 1) return null;
  const chunkSnapshot = await getDocs(collection(manifest.ref, "chunks"));
  const chunks = chunkSnapshot.docs
    .map((entry) => entry.data())
    .filter((entry) => Number.isInteger(entry.index) && typeof entry.data === "string")
    .sort((a, b) => a.index - b.index);
  if (chunks.length !== data.chunkCount || chunks.some((entry, index) => entry.index !== index)) {
    const error = new Error("協作更新分段尚未完整，已保留目前畫布。");
    error.code = "collaboration/incomplete-update";
    throw error;
  }
  const update = combineCollaborationChunks(chunks.map((entry) => entry.data));
  if (data.byteLength && update.byteLength !== data.byteLength) {
    const error = new Error("協作更新大小不符，已保留目前畫布。");
    error.code = "collaboration/incomplete-update";
    throw error;
  }
  return update;
}

function presenceList(snapshot, ownClientId) {
  const cutoff = Date.now() - PRESENCE_STALE_MS;
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    const seenAt = data.seenAt?.toMillis?.() || Number(data.clientSeenAt || 0);
    return {
      id: entry.id,
      uid: String(data.uid || ""),
      name: String(data.name || "協作者"),
      seenAt,
      self: entry.id === ownClientId,
    };
  }).filter((peer) => peer.self || peer.seenAt >= cutoff);
}

async function openCollaborationSession({
  roomId,
  inviteId = "",
  board,
  user,
  clientId,
  displayName,
  onBoard,
  onState,
}) {
  assertVerifiedCollaborationUser(user);
  const database = getMoodboardCollaborationDatabase();
  const refs = roomReferences(database, roomId);
  const [roomSnapshot, memberSnapshot] = await Promise.all([
    getDoc(refs.room),
    getDoc(doc(refs.members, user.uid)),
  ]);
  if (!roomSnapshot.exists()) {
    const error = new Error("找不到共編空間。");
    error.code = "not-found";
    throw error;
  }
  if (!memberSnapshot.exists()) {
    const error = new Error("目前帳號不是這個共編空間的成員。");
    error.code = "permission-denied";
    throw error;
  }
  if (roomSnapshot.data().initialized !== true) {
    const error = new Error("共編空間尚未完成初始化。");
    error.code = "collaboration/not-initialized";
    throw error;
  }

  let role = normalizeCollaborationRole(memberSnapshot.data().role);
  let canEdit = ["owner", "editor"].includes(role);
  const document = createCollaborationDocument();
  const processedUpdates = new Set();
  const cleanup = [];
  let destroyed = false;
  let ready = false;
  let peers = [];
  let members = [];
  let accessRequests = [];
  let accessRequest = null;
  let pendingCount = 0;
  let status = "connecting";
  let message = "正在取得共編內容…";
  let publishChain = Promise.resolve();
  let boardEmissionScheduled = false;

  const emitState = (patch = {}) => {
    if (destroyed) return;
    if (patch.status) status = patch.status;
    if (patch.message !== undefined) message = patch.message;
    if (patch.peers) peers = patch.peers;
    if (Number.isFinite(patch.pendingCount)) pendingCount = patch.pendingCount;
    onState?.({
      status,
      message,
      roomId,
      inviteId,
      inviteUrl: inviteId ? createCollaborationInviteUrl(inviteId) : "",
      role,
      canEdit,
      peers,
      members,
      accessRequests,
      accessRequest,
      pendingCount,
    });
  };

  const emitBoard = () => {
    if (destroyed || boardEmissionScheduled) return;
    boardEmissionScheduled = true;
    queueMicrotask(() => {
      boardEmissionScheduled = false;
      if (!destroyed) onBoard?.(readBoardFromCollaborationDocument(document, board, board?.view));
    });
  };

  const publishRecord = (record) => {
    publishChain = publishChain.then(async () => {
      const queued = await listQueuedCollaborationUpdates(roomId);
      pendingCount = queued.filter((entry) => entry.senderUid === user.uid).length;
      emitState({ pendingCount, status: navigator.onLine === false ? "offline" : status });
      await uploadQueuedUpdate(database, user, record);
      const remaining = await listQueuedCollaborationUpdates(roomId);
      pendingCount = remaining.filter((entry) => entry.senderUid === user.uid).length;
      emitState({ pendingCount, status: "connected", message: "所有變更已同步。" });
    }).catch((error) => {
      emitState({ status: navigator.onLine === false ? "offline" : "degraded", message: collaborationErrorMessage(error) });
    });
    return publishChain;
  };

  const queueLocalUpdate = async (update) => {
    if (!ready || !canEdit || destroyed) return;
    try {
      const record = await queueCollaborationUpdate(makeQueuedUpdate({ roomId, clientId, senderUid: user.uid, update }));
      pendingCount += 1;
      emitState({ pendingCount, status: navigator.onLine === false ? "offline" : "syncing", message: "正在同步最新變更…" });
      publishRecord(record);
    } catch (error) {
      emitState({ status: "degraded", message: collaborationErrorMessage(error) });
    }
  };

  cleanup.push(listenToCollaborationUpdates(document, (update, origin) => {
    if (origin === LOCAL_COLLABORATION_ORIGIN) queueLocalUpdate(update);
    if (origin === REMOTE_COLLABORATION_ORIGIN) emitBoard();
  }));

  emitState();
  let resolveInitial;
  let rejectInitial;
  const initialUpdates = new Promise((resolve, reject) => {
    resolveInitial = resolve;
    rejectInitial = reject;
  });
  let processing = Promise.resolve();
  const updatesQuery = query(refs.updates, where("ready", "==", true));
  const unsubscribeUpdates = onSnapshot(updatesQuery, (snapshot) => {
    processing = processing.then(async () => {
      for (const change of snapshot.docChanges()) {
        if (!["added", "modified"].includes(change.type) || processedUpdates.has(change.doc.id)) continue;
        const update = await readManifestUpdate(database, roomId, change.doc);
        if (!update) continue;
        processedUpdates.add(change.doc.id);
        applyCollaborationUpdate(document, update, REMOTE_COLLABORATION_ORIGIN);
      }
    }).then(() => resolveInitial()).catch((error) => {
      if (!ready) rejectInitial(error);
      emitState({ status: "degraded", message: collaborationErrorMessage(error) });
    });
  }, (error) => {
    if (!ready) rejectInitial(error);
    emitState({ status: "error", message: collaborationErrorMessage(error) });
  });
  cleanup.push(unsubscribeUpdates);

  const ownMemberRef = doc(refs.members, user.uid);
  cleanup.push(onSnapshot(ownMemberRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const previouslyEditable = canEdit;
    role = normalizeCollaborationRole(snapshot.data().role);
    canEdit = ["owner", "editor"].includes(role);
    if (!previouslyEditable && canEdit) emitState({ message: "擁有者已核准編輯權限。" });
    else if (previouslyEditable && !canEdit) emitState({ message: "目前已改為僅檢視；未同步的本機變更仍保留在這台裝置。" });
    else emitState();
  }, (error) => emitState({ status: "degraded", message: collaborationErrorMessage(error) })));

  cleanup.push(onSnapshot(refs.members, (snapshot) => {
    members = snapshot.docs.map(normalizeMemberSnapshot).sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      return a.name.localeCompare(b.name, "zh-Hant");
    });
    emitState();
  }, (error) => emitState({ status: "degraded", message: collaborationErrorMessage(error) })));

  const ownRequestRef = doc(refs.accessRequests, user.uid);
  cleanup.push(onSnapshot(ownRequestRef, (snapshot) => {
    accessRequest = normalizeAccessRequestSnapshot(snapshot);
    emitState();
  }, (error) => emitState({ status: "degraded", message: collaborationErrorMessage(error) })));

  if (role === "owner") {
    cleanup.push(onSnapshot(refs.accessRequests, (snapshot) => {
      accessRequests = snapshot.docs
        .map(normalizeAccessRequestSnapshot)
        .filter(Boolean)
        .sort((a, b) => b.requestedAt - a.requestedAt);
      emitState();
    }, (error) => emitState({ status: "degraded", message: collaborationErrorMessage(error) })));
  }

  await initialUpdates;
  const queued = (await listQueuedCollaborationUpdates(roomId)).filter((entry) => entry.senderUid === user.uid);
  queued.forEach((record) => {
    try {
      applyCollaborationUpdate(document, combineCollaborationChunks(record.chunks), REMOTE_COLLABORATION_ORIGIN);
    } catch {
      // Keep malformed queued records for explicit recovery instead of deleting user work.
    }
  });
  ready = true;
  emitBoard();

  const ownPresenceRef = doc(refs.presence, clientId);
  const writePresence = (name = displayName) => setDoc(ownPresenceRef, {
    uid: user.uid,
    name: String(name || user.displayName || "協作者").slice(0, 48),
    clientSeenAt: Date.now(),
    seenAt: serverTimestamp(),
  }, { merge: true }).catch(() => undefined);
  await writePresence();
  const unsubscribePresence = onSnapshot(refs.presence, (snapshot) => {
    peers = presenceList(snapshot, clientId);
    emitState({ peers });
  }, () => undefined);
  cleanup.push(unsubscribePresence);
  const heartbeat = globalThis.setInterval(() => writePresence(), PRESENCE_HEARTBEAT_MS);
  cleanup.push(() => globalThis.clearInterval(heartbeat));

  const flushQueued = async () => {
    const records = (await listQueuedCollaborationUpdates(roomId)).filter((entry) => entry.senderUid === user.uid);
    records.forEach(publishRecord);
  };
  const onOnline = () => {
    emitState({ status: "syncing", message: "已恢復連線，正在送出離線變更…" });
    flushQueued();
  };
  const onOffline = () => emitState({ status: "offline", message: "目前離線；變更會先保存在這台裝置。" });
  globalThis.addEventListener?.("online", onOnline);
  globalThis.addEventListener?.("offline", onOffline);
  cleanup.push(() => globalThis.removeEventListener?.("online", onOnline));
  cleanup.push(() => globalThis.removeEventListener?.("offline", onOffline));

  status = queued.length ? "syncing" : "connected";
  message = queued.length ? "正在送出先前的離線變更…" : "即時共編已連線。";
  pendingCount = queued.length;
  emitState({ status, message, pendingCount });
  queued.forEach(publishRecord);

  return {
    roomId,
    inviteId,
    get role() { return role; },
    get canEdit() { return canEdit; },
    updateBoard(nextBoard) {
      if (!canEdit) return false;
      writeBoardToCollaborationDocument(document, nextBoard, LOCAL_COLLABORATION_ORIGIN);
      return true;
    },
    requestEditAccess() {
      return requestMoodboardCollaborationEditAccess({ roomId, user });
    },
    resolveAccessRequest(requesterUid, decision) {
      return resolveMoodboardCollaborationAccessRequest({ roomId, requesterUid, decision, user });
    },
    setMemberRole(memberUid, nextRole) {
      return setMoodboardCollaborationMemberRole({ roomId, memberUid, role: nextRole, user });
    },
    setDisplayName(name) { writePresence(name); },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      cleanup.splice(0).forEach((dispose) => {
        try { dispose?.(); } catch { /* no-op */ }
      });
      await deleteDoc(ownPresenceRef).catch(() => undefined);
      document.destroy();
    },
  };
}

export async function createMoodboardCollaborationRoom(options) {
  const { board, user, clientId, displayName } = options;
  assertVerifiedCollaborationUser(user);
  requireOnline();
  const database = getMoodboardCollaborationDatabase();
  const roomId = collaborationId("room", 15);
  const inviteId = collaborationId("invite", 24);
  const refs = roomReferences(database, roomId);
  const inviteRef = doc(database, COLLABORATION_INVITES_COLLECTION, inviteId);
  const batch = writeBatch(database);
  batch.set(refs.room, {
    schemaVersion: 1,
    boardId: String(board.id),
    boardName: String(board.name || "未命名 Infinite Studio").slice(0, 120),
    ownerUid: user.uid,
    initialized: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(refs.members, user.uid), {
    uid: user.uid,
    role: "owner",
    name: String(user.displayName || "擁有者").slice(0, 80),
    joinedAt: serverTimestamp(),
    inviteId: "",
  });
  batch.set(inviteRef, {
    roomId,
    role: COLLABORATION_DEFAULT_INVITE_ROLE,
    active: true,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + COLLABORATION_INVITE_TTL_MS),
  });
  await batch.commit();

  const initialDocument = createCollaborationDocument(board);
  await queueAndUploadUpdate(database, user, {
    roomId,
    clientId,
    update: encodeCollaborationDocument(initialDocument),
  });
  initialDocument.destroy();
  await updateDoc(refs.room, { initialized: true, updatedAt: serverTimestamp() });
  return openCollaborationSession({ ...options, roomId, inviteId });
}

export async function joinMoodboardCollaborationInvite(options) {
  const { user } = options;
  assertVerifiedCollaborationUser(user);
  requireOnline();
  const inviteId = normalizeCollaborationInvite(options.inviteId);
  if (!inviteId) {
    const error = new Error("請輸入有效的共編邀請連結或代碼。");
    error.code = "collaboration/invite-not-found";
    throw error;
  }
  const database = getMoodboardCollaborationDatabase();
  const inviteSnapshot = await getDoc(doc(database, COLLABORATION_INVITES_COLLECTION, inviteId));
  if (!inviteSnapshot.exists() || inviteSnapshot.data().active !== true || inviteSnapshot.data().role !== COLLABORATION_DEFAULT_INVITE_ROLE) {
    const error = new Error("找不到可用的共編邀請。");
    error.code = "collaboration/invite-not-found";
    throw error;
  }
  const invite = inviteSnapshot.data();
  if (invite.expiresAt?.toMillis?.() <= Date.now()) {
    const error = new Error("共編邀請已過期。");
    error.code = "collaboration/invite-expired";
    throw error;
  }
  const roomId = String(invite.roomId || "");
  const refs = roomReferences(database, roomId);
  const memberRef = doc(refs.members, user.uid);
  let memberExists = false;
  try {
    memberExists = (await getDoc(memberRef)).exists();
  } catch (error) {
    if (error?.code !== "permission-denied") throw error;
  }
  if (!memberExists) {
    await setDoc(memberRef, {
      uid: user.uid,
      role: COLLABORATION_DEFAULT_INVITE_ROLE,
      name: String(user.displayName || "協作者").slice(0, 80),
      joinedAt: serverTimestamp(),
      inviteId,
    });
  }
  return openCollaborationSession({ ...options, roomId, inviteId });
}

export async function resumeMoodboardCollaborationRoom(options) {
  assertVerifiedCollaborationUser(options.user);
  requireOnline();
  if (!/^room_[A-Za-z0-9_-]{16,96}$/.test(String(options.roomId || ""))) {
    const error = new Error("找不到可續接的共編空間。");
    error.code = "not-found";
    throw error;
  }
  return openCollaborationSession(options);
}
