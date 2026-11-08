import assert from "node:assert/strict";
import test from "node:test";
import {
  contentByteLength,
  driveErrorMessage,
  DriveConflictError,
  downloadCurrentGoogleDriveMoodboard,
  downloadGoogleDriveMoodboard,
  enforceGoogleDriveRevisionRetention,
  ensureGoogleDriveFolder,
  evaluateDriveQuota,
  getGoogleDriveAbout,
  linkDriveFile,
  listGoogleDriveRevisions,
  listGoogleDriveMoodboards,
  loadDriveState,
  isGoogleDriveAuthorizationError,
  isGoogleDriveRetryableError,
  isGoogleDriveTokenUsable,
  normalizeDriveFile,
  normalizeDriveQuota,
  normalizeDriveRevision,
  normalizeGoogleDriveTokenResponse,
  requestGoogleDriveToken,
  saveDriveState,
  serializeMoodboardSnapshot,
  unlinkDriveFile,
  uploadGoogleDriveMoodboard,
} from "./drive-storage.js";

test("Drive library includes new studio and legacy moodboard project files", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ files: [
    { id: "new", name: "New.studio" }, { id: "old", name: "Old.moodboard" }, { id: "other", name: "Other.txt" },
  ] }));
  try { assert.deepEqual((await listGoogleDriveMoodboards("token", "folder")).map((file) => file.id), ["new", "old"]); }
  finally { globalThis.fetch = previousFetch; }
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("serializes a portable moodboard snapshot and measures UTF-8 bytes", () => {
  const content = serializeMoodboardSnapshot({ id: "board-1", name: "靈感" });
  assert.ok(content.endsWith("\n"));
  assert.equal(JSON.parse(content).name, "靈感");
  assert.ok(contentByteLength(content) > content.length);
});

test("Google Drive tokens require the exact drive.file scope and expire safely", () => {
  const token = normalizeGoogleDriveTokenResponse({
    access_token: "token-1",
    expires_in: 3600,
    scope: "openid https://www.googleapis.com/auth/drive.file",
  }, 10_000);
  assert.equal(token.accessToken, "token-1");
  assert.equal(isGoogleDriveTokenUsable(token, 10_001), true);
  assert.equal(isGoogleDriveTokenUsable(token, token.expiresAt), false);
  assert.throws(
    () => normalizeGoogleDriveTokenResponse({ access_token: "token-2", scope: "openid email" }),
    (error) => error.code === "drive/permission" && error.status === 403,
  );
  assert.throws(
    () => normalizeGoogleDriveTokenResponse({
      access_token: "token-3",
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
    }),
    (error) => error.code === "drive/permission" && error.status === 403,
  );
  assert.throws(
    () => normalizeGoogleDriveTokenResponse({ error: "access_denied", error_description: "Denied" }),
    (error) => error.code === "drive/authorization" && error.reason === "access_denied",
  );
});

test("Google Drive authorization failures include missing and excessive permissions", () => {
  assert.equal(isGoogleDriveAuthorizationError({ status: 401 }), true);
  assert.equal(isGoogleDriveAuthorizationError({ code: "drive/permission", status: 403 }), true);
  assert.equal(isGoogleDriveAuthorizationError({ reason: "insufficientPermissions" }), true);
  assert.equal(isGoogleDriveAuthorizationError({ status: 403, reason: "rateLimitExceeded" }), false);
  assert.equal(isGoogleDriveAuthorizationError({ status: 403, reason: "forbidden" }), false);
  assert.equal(isGoogleDriveAuthorizationError({ code: "drive/quota", reason: "storageQuotaExceeded" }), false);
});

test("only transient Google Drive failures are automatically retried", () => {
  assert.equal(isGoogleDriveRetryableError({ code: "drive/offline" }), true);
  assert.equal(isGoogleDriveRetryableError({ code: "drive/timeout" }), true);
  assert.equal(isGoogleDriveRetryableError({ status: 429, reason: "rateLimitExceeded" }), true);
  assert.equal(isGoogleDriveRetryableError({ status: 503, reason: "backendError" }), true);
  assert.equal(isGoogleDriveRetryableError({ reason: "insufficientPermissions" }), false);
  assert.equal(isGoogleDriveRetryableError({ code: "drive/quota", reason: "storageQuotaExceeded" }), false);
  assert.equal(isGoogleDriveRetryableError({ code: "drive/conflict" }), false);
  assert.equal(isGoogleDriveRetryableError({ status: 403, reason: "appNotAuthorizedToFile" }), false);
});

test("normalizes finite and unlimited Drive quota", () => {
  assert.deepEqual(normalizeDriveQuota({ limit: "1000", usage: "250", usageInDrive: "200" }), {
    limit: 1000,
    usage: 250,
    usageInDrive: 200,
    usageInDriveTrash: 0,
    remaining: 750,
  });
  assert.equal(normalizeDriveQuota({ usage: "250" }).limit, null);
  assert.equal(normalizeDriveQuota({ usage: "250" }).remaining, null);
});

test("quota evaluation keeps a safety margin and blocks unsafe uploads", () => {
  const insufficient = evaluateDriveQuota({ limit: 10_000, usage: 9_500 }, 400, { safetyBytes: 200 });
  assert.equal(insufficient.allowed, false);
  assert.equal(insufficient.level, "insufficient");
  const healthy = evaluateDriveQuota({ limit: 100_000, usage: 1_000 }, 400, { safetyBytes: 200 });
  assert.equal(healthy.allowed, true);
  assert.equal(healthy.level, "ok");
  assert.equal(evaluateDriveQuota({ usage: 1_000 }, 400).level, "unknown");
  assert.equal(evaluateDriveQuota({ limit: 10_000_000, usage: 6_000_000 }, 10_000).allowed, true);
});

test("Drive file links stay device-local and preserve sync metadata", () => {
  const storage = memoryStorage();
  const board = { id: "board-1", revision: 7, updatedAt: "2026-10-20T01:02:03.000Z" };
  let state = linkDriveFile({
    ...loadDriveState(storage),
    connectionOwnerUid: "petfashion-user-1",
    connectionEmail: "person@example.com",
  }, board, {
    id: "drive-1",
    name: "研究.moodboard",
    version: "12",
    modifiedTime: "2026-10-20T01:02:04.000Z",
    size: "2048",
  });
  saveDriveState(storage, state);
  state = loadDriveState(storage);
  assert.equal(state.enabled, true);
  assert.equal(state.links[board.id].fileId, "drive-1");
  assert.equal(state.links[board.id].syncedRevision, 7);
  assert.equal(state.links[board.id].size, 2048);
  assert.equal(state.connectionOwnerUid, "petfashion-user-1");
  assert.equal(state.connectionEmail, "person@example.com");
  state = unlinkDriveFile(state, board.id);
  assert.equal(state.links[board.id], undefined);
});

test("Drive can silently restore a granted session without persisting the access token", async (t) => {
  const previousGoogle = globalThis.google;
  let tokenConfig = null;
  let requestOptions = null;
  t.after(() => {
    if (previousGoogle === undefined) delete globalThis.google;
    else globalThis.google = previousGoogle;
  });
  globalThis.google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          tokenConfig = config;
          return {
            requestAccessToken(options) {
              requestOptions = options;
              queueMicrotask(() => config.callback({
                access_token: "silent-token",
                expires_in: 3600,
                scope: "https://www.googleapis.com/auth/drive.file",
              }));
            },
          };
        },
      },
    },
  };

  const token = await requestGoogleDriveToken({
    loginHint: "person@example.com",
    prompt: "none",
    timeoutMs: 1000,
  });

  assert.equal(token.accessToken, "silent-token");
  assert.equal(tokenConfig.login_hint, "person@example.com");
  assert.equal(requestOptions.prompt, "none");
  assert.equal(requestOptions.login_hint, "person@example.com");
});

test("normalizes Drive files and maps recoverable errors", () => {
  assert.deepEqual(normalizeDriveFile({
    id: "1",
    name: "test.moodboard",
    size: "99",
    version: "3",
    headRevisionId: "",
    appProperties: { boardId: "board-1" },
  }), {
    id: "1",
    name: "test.moodboard",
    mimeType: "application/json",
    createdTime: "",
    modifiedTime: "",
    size: 99,
    version: "3",
    headRevisionId: "",
    webViewLink: "",
    sha256Checksum: "",
    resourceKey: "",
    ownedByMe: false,
    parents: [],
    boardId: "board-1",
    capabilities: {
      canDownload: true,
      canReadRevisions: true,
      canEdit: false,
      canShare: false,
    },
  });
  assert.match(driveErrorMessage({ reason: "storageQuotaExceeded" }), /空間不足/);
  assert.match(driveErrorMessage({ status: 401 }), /重新連結/);
  assert.match(driveErrorMessage({ status: 403, reason: "rateLimitExceeded" }), /暫時忙碌/);
  assert.match(driveErrorMessage({ status: 403, reason: "appNotAuthorizedToFile" }), /重新選取/);
  assert.match(driveErrorMessage({ status: 404, reason: "notFound" }), /沒有這份/);
  assert.match(driveErrorMessage({ code: "drive/offline" }), /離線/);
});

test("connecting to Drive can discover storage without creating a folder", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    return {
      ok: true,
      status: 200,
      json: async () => ({ files: [] }),
    };
  };
  try {
    assert.equal(await ensureGoogleDriveFolder("token", "", { create: false }), "");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive requests time out instead of leaving synchronization pending forever", async (t) => {
  const originalFetch = globalThis.fetch;
  let aborted = false;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    getGoogleDriveAbout("token", { timeoutMs: 10 }),
    (error) => error.code === "drive/timeout" && /檢查雲端狀態/.test(error.message),
  );
  assert.equal(aborted, true);
});

test("Drive response body parsing shares the request timeout", async (t) => {
  const originalFetch = globalThis.fetch;
  let aborted = false;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options = {}) => ({
    status: 200,
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("aborted while reading body");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });

  await assert.rejects(
    getGoogleDriveAbout("token", { timeoutMs: 10 }),
    (error) => error.code === "drive/timeout" && /檢查雲端狀態/.test(error.message),
  );
  assert.equal(aborted, true);
});

test("an updated remote file stops the upload before any overwrite", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "drive-1", name: "Board.moodboard", version: "9" }),
    };
  };
  try {
    await assert.rejects(
      uploadGoogleDriveMoodboard("token", {
        board: { id: "board-1" },
        content: "{}",
        filename: "Board.moodboard",
        existingFile: { id: "drive-1" },
        expectedVersion: "8",
      }),
      DriveConflictError,
    );
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a remote rename conflicts even when the media head is unchanged", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ id: "drive-1", title: "Colleague renamed.moodboard", version: "9", headRevisionId: "same-head", etag: '"fresh"' }));
  };
  try {
    await assert.rejects(uploadGoogleDriveMoodboard("token", {
      board: { id: "board-1" }, content: "{}", filename: "Old title.moodboard",
      existingFile: { id: "drive-1" }, expectedVersion: "8", expectedHeadRevisionId: "same-head",
    }), DriveConflictError);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

for (const etag of ["", 'W/"weak"', "*", '"bad\r\ntag"']) test(`an existing file fails closed with invalid JSON ETag ${JSON.stringify(etag)}`, async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    return {
      ok: true,
      status: 200,
      headers: { get: () => '"irrelevant-header"' },
      json: async () => ({ id: "drive-1", title: "Board.moodboard", version: "8", etag }),
    };
  };
  try {
    await assert.rejects(
      uploadGoogleDriveMoodboard("token", {
        board: { id: "board-1" },
        content: "{}",
        filename: "Board.moodboard",
        existingFile: { id: "drive-1" },
        expectedVersion: "8",
      }),
      (error) => error?.code === "drive/safety-check" && /更新已停止/.test(error.message),
    );
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("latest-writer save preserves the current revision and updates despite an older local version", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let fileGetCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    calls.push({ url: String(url), method, headers: options.headers || {} });
    if (String(url).includes("/revisions?") && method === "GET") return new Response(JSON.stringify({ revisions: [] }));
    if (String(url).includes("/revisions/revision-8") && method === "PATCH") return new Response(JSON.stringify({ id: "revision-8", keepForever: true }));
    if (String(url).includes("/upload/") && method === "PUT") return new Response(JSON.stringify({ id: "drive-1", title: "New.moodboard", version: "10", headRevisionId: "revision-10" }));
    fileGetCount++;
    const version = fileGetCount === 1 ? "8" : fileGetCount === 2 ? "9" : "10";
    return new Response(JSON.stringify({ id: "drive-1", title: fileGetCount < 3 ? "Old.moodboard" : "New.moodboard", name: fileGetCount < 3 ? "Old.moodboard" : "New.moodboard", etag: `"v${version}"`, version, headRevisionId: fileGetCount < 3 ? "revision-8" : "revision-10" }));
  };
  try {
    const saved = await uploadGoogleDriveMoodboard("token", { board: { id: "board-1" }, content: "{}", filename: "New.moodboard", existingFile: { id: "drive-1" }, expectedVersion: "1", latestWins: true });
    assert.equal(saved.version, "10");
    assert.equal(calls.find((call) => call.method === "PUT").headers["If-Match"], '"v9"');
    assert.ok(calls.some((call) => call.method === "PATCH" && call.url.includes("revision-8")));
  } finally { globalThis.fetch = originalFetch; }
});

test("metadata-only Drive version changes keep syncing through the matching head revision", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let fileGetCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method || "GET", headers: options.headers || {} };
    calls.push(call);
    if (call.url.includes("/revisions?") && call.method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ revisions: [] }),
      };
    }
    if (call.url.includes("/revisions/revision-8") && call.method === "PATCH") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "revision-8", modifiedTime: "2026-10-20T01:00:00.000Z", keepForever: true }),
      };
    }
    if (call.url.includes("/upload/") && call.method === "PUT") {
      return {
        ok: true,
        status: 200,
        headers: { get: () => '"v10"' },
        json: async () => ({ id: "drive-1", name: "Board.moodboard", version: "10", headRevisionId: "revision-10" }),
      };
    }
    fileGetCount += 1;
    const currentVersion = fileGetCount === 1 ? "8" : fileGetCount === 2 ? "9" : "10";
    const currentRevision = fileGetCount < 3 ? "revision-8" : "revision-10";
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: "drive-1", title: "Board.moodboard", name: "Board.moodboard", etag: `"v${currentVersion}"`, version: currentVersion, headRevisionId: currentRevision }),
    };
  };
  try {
    const saved = await uploadGoogleDriveMoodboard("token", {
      board: { id: "board-1" },
      content: "{}",
      filename: "Board.moodboard",
      existingFile: { id: "drive-1" },
      expectedVersion: "7",
      expectedHeadRevisionId: "revision-8",
    });
    assert.equal(saved.version, "10");
    assert.deepEqual(calls.map((call) => call.method), ["GET", "GET", "PATCH", "GET", "PUT", "GET"]);
    assert.equal(calls[4].headers["If-Match"], '"v9"');
    assert.match(calls[2].url, /revisions\/revision-8/);
    assert.doesNotMatch(calls[4].url, /keepRevisionForever=true/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a stale conditional PUT returns conflict without retrying", async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, options = {}) => {
    const endpoint = String(url);
    if (endpoint.includes("/revisions")) return new Response(JSON.stringify(endpoint.includes("?") ? { revisions: [] } : { id: "head-1", keepForever: true }));
    if (endpoint.includes("/upload/")) {
      writes++;
      assert.match(endpoint, /\/upload\/drive\/v2\/files\/drive-1/);
      assert.equal(options.method, "PUT");
      assert.equal(options.headers["If-Match"], '"before-colleague-edit"');
      // Another client commits after our final GET, before our PUT arrives.
      return new Response(JSON.stringify({ error: { message: "Precondition Failed" } }), { status: 412 });
    }
    assert.match(endpoint, /\/drive\/v2\/files\//);
    return new Response(JSON.stringify({ id: "drive-1", etag: '"before-colleague-edit"', version: "1", headRevisionId: "head-1" }));
  };
  try {
    await assert.rejects(uploadGoogleDriveMoodboard("token", {
      board: { id: "board-1" }, content: "my edit", filename: "Board.moodboard",
      existingFile: { id: "drive-1" }, expectedVersion: "1",
    }), DriveConflictError);
    assert.equal(writes, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("new files use multipart/related with v3 metadata and intact UTF-8 content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/upload\/drive\/v3\/files\?/);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["If-Match"], undefined);
    const boundary = options.headers["Content-Type"].match(/^multipart\/related; boundary=(.+)$/)?.[1];
    assert.ok(boundary);
    const body = await options.body.text();
    const parts = body.split(`--${boundary}`);
    assert.equal(parts.length, 4);
    assert.deepEqual(JSON.parse(parts[1].split("\r\n\r\n")[1].trim()), {
      name: "台灣.moodboard", mimeType: "application/json",
      appProperties: { infiniteMoodboard: "true", boardId: "board-1", schemaVersion: "10" }, parents: ["folder-1"],
    });
    assert.equal(parts[2].split("\r\n\r\n")[1], '{"name":"台灣靈感"}\r\n');
    return new Response(JSON.stringify({ id: "drive-1", name: "台灣.moodboard", version: "1" }));
  };
  try {
    await uploadGoogleDriveMoodboard("token", { board: { id: "board-1", schemaVersion: 10 }, content: '{"name":"台灣靈感"}', filename: "台灣.moodboard", folderId: "folder-1" });
  } finally { globalThis.fetch = originalFetch; }
});

test("conditional updates retain shared-file resource keys and v2 metadata without a visible HTTP ETag", async () => {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, options = {}) => {
    const endpoint = String(url);
    assert.equal(options.headers["X-Goog-Drive-Resource-Keys"], "drive-1/key-1");
    if (endpoint.includes("/revisions")) return new Response(JSON.stringify(endpoint.includes("?") ? { revisions: [] } : { id: "head-1", keepForever: true }));
    if (endpoint.includes("/upload/")) {
      writes++;
      assert.equal(options.method, "PUT");
      assert.equal(options.headers["If-Match"], '"json-only"');
      assert.match(options.headers["Content-Type"], /^multipart\/related;/);
      const body = await options.body.text();
      assert.match(body, /"title":"Renamed.moodboard"/);
      assert.doesNotMatch(body, /"appProperties"|"name"/);
      return new Response(JSON.stringify({ id: "drive-1", title: "Renamed.moodboard", version: "2", headRevisionId: "head-2" }));
    }
    return new Response(JSON.stringify(endpoint.includes("/v2/")
      ? { id: "drive-1", title: "Old.moodboard", etag: '"json-only"', version: "1", headRevisionId: "head-1" }
      : { id: "drive-1", name: "Renamed.moodboard", version: "2", headRevisionId: "head-2", appProperties: { boardId: "board-1" } }));
  };
  try {
    const saved = await uploadGoogleDriveMoodboard("token", { board: { id: "board-1" }, content: "{}", filename: "Renamed.moodboard", existingFile: { id: "drive-1", resourceKey: "key-1" }, expectedVersion: "1" });
    assert.equal(saved.name, "Renamed.moodboard");
    assert.equal(saved.boardId, "board-1");
    assert.equal(writes, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("confirmed overwrite accepts the reviewed remote version and still uses a fresh ETag", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let fileGetCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method || "GET", headers: options.headers || {} };
    calls.push(call);
    if (call.url.includes("/revisions?") && call.method === "GET") {
      return { ok: true, status: 200, json: async () => ({ revisions: [] }) };
    }
    if (call.url.includes("/revisions/revision-9") && call.method === "PATCH") {
      return { ok: true, status: 200, json: async () => ({ id: "revision-9", keepForever: true }) };
    }
    if (call.url.includes("/upload/") && call.method === "PUT") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "drive-1", name: "Board.moodboard", version: "11", headRevisionId: "revision-11" }),
      };
    }
    fileGetCount += 1;
    const file = fileGetCount === 1
      ? { version: "9", headRevisionId: "revision-9" }
      : fileGetCount === 2
        ? { version: "10", headRevisionId: "revision-9" }
        : { version: "11", headRevisionId: "revision-11" };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: "drive-1", title: "Board.moodboard", name: "Board.moodboard", etag: `"v${file.version}"`, ...file }),
    };
  };
  try {
    const saved = await uploadGoogleDriveMoodboard("token", {
      board: { id: "board-1" },
      content: "{}",
      filename: "Board.moodboard",
      existingFile: { id: "drive-1" },
      expectedVersion: "8",
      forceOverwrite: true,
      confirmedRemoteVersion: "9",
    });
    assert.equal(saved.version, "11");
    assert.equal(calls.find((call) => call.url.includes("/upload/")).headers["If-Match"], '"v10"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const outcome of ["mismatch", "network-error"]) test(`successful PUT followed by ${outcome} readback reports an unverified write`, async () => {
  const originalFetch = globalThis.fetch;
  let reads = 0;
  let writes = 0;
  globalThis.fetch = async (url, options = {}) => {
    const endpoint = String(url);
    if (endpoint.includes("/revisions")) return new Response(JSON.stringify(endpoint.includes("?") ? { revisions: [] } : { id: "h1", keepForever: true }));
    if (endpoint.includes("/upload/")) {
      writes++;
      return new Response(JSON.stringify({ id: "drive-1", version: "3", headRevisionId: "h3" }));
    }
    reads++;
    if (reads === 3 && outcome === "network-error") throw new TypeError("network error");
    return new Response(JSON.stringify({ id: "drive-1", etag: '"safe"', version: reads === 3 ? "4" : String(reads), headRevisionId: reads === 3 ? "h4" : "h1" }));
  };
  try {
    await assert.rejects(uploadGoogleDriveMoodboard("token", {
      board: { id: "board-1" }, content: "{}", filename: "Board.moodboard",
      existingFile: { id: "drive-1" }, expectedVersion: "1", forceOverwrite: true, confirmedRemoteVersion: "1",
    }), (error) => error.code === "drive/verification" && /已送出更新/.test(error.message));
    assert.equal(writes, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("confirmed overwrite stops when Drive changed after the user reviewed it", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    return {
      ok: true,
      status: 200,
      headers: { get: () => '"v10"' },
      json: async () => ({ id: "drive-1", name: "Board.moodboard", version: "10", headRevisionId: "revision-10" }),
    };
  };
  try {
    await assert.rejects(
      uploadGoogleDriveMoodboard("token", {
        board: { id: "board-1" },
        content: "{}",
        filename: "Board.moodboard",
        existingFile: { id: "drive-1" },
        expectedVersion: "8",
        forceOverwrite: true,
        confirmedRemoteVersion: "9",
      }),
      DriveConflictError,
    );
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("confirmed overwrite fails closed when the target Drive file is missing", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  };
  try {
    await assert.rejects(
      uploadGoogleDriveMoodboard("token", {
        board: { id: "board-1" },
        content: "{}",
        filename: "Board.moodboard",
        forceOverwrite: true,
        confirmedRemoteVersion: "9",
      }),
      (error) => error?.code === "drive/overwrite-target",
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an update arriving while the old revision is retained stops before upload", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let fileGetCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const call = { url: String(url), method: options.method || "GET" };
    calls.push(call);
    if (call.url.includes("/revisions?") && call.method === "GET") {
      return { ok: true, status: 200, json: async () => ({ revisions: [] }) };
    }
    if (call.url.includes("/revisions/revision-8") && call.method === "PATCH") {
      return { ok: true, status: 200, json: async () => ({ id: "revision-8", keepForever: true }) };
    }
    fileGetCount += 1;
    const file = fileGetCount === 1
      ? { version: "8", headRevisionId: "revision-8" }
      : { version: "9", headRevisionId: "revision-9" };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: "drive-1", title: "Board.moodboard", etag: `"v${file.version}"`, ...file }),
    };
  };
  try {
    await assert.rejects(
      uploadGoogleDriveMoodboard("token", {
        board: { id: "board-1" },
        content: "{}",
        filename: "Board.moodboard",
        existingFile: { id: "drive-1" },
        expectedVersion: "8",
        expectedHeadRevisionId: "revision-8",
      }),
      DriveConflictError,
    );
    assert.deepEqual(calls.map((call) => call.method), ["GET", "GET", "PATCH", "GET"]);
    assert.equal(calls.some((call) => call.url.includes("/upload/")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive revisions are normalized, paginated, and sorted newest first", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {} });
    const secondPage = String(url).includes("pageToken=next-page");
    return {
      ok: true,
      status: 200,
      json: async () => secondPage
        ? { revisions: [{ id: "r2", modifiedTime: "2026-10-20T02:00:00.000Z", size: "20", keepForever: true }] }
        : { nextPageToken: "next-page", revisions: [{ id: "r1", modifiedTime: "2026-10-20T01:00:00.000Z", size: "10" }] },
    };
  };
  try {
    const revisions = await listGoogleDriveRevisions("token", "file-1", { resourceKey: "resource-1" });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.url.includes("supportsAllDrives=true")));
    assert.ok(calls.every((call) => call.headers["X-Goog-Drive-Resource-Keys"] === "file-1/resource-1"));
    assert.deepEqual(revisions.map((revision) => revision.id), ["r2", "r1"]);
    assert.equal(revisions[0].size, 20);
    assert.equal(revisions[0].keepForever, true);
    assert.deepEqual(normalizeDriveRevision({ id: "r3" }).lastModifyingUser, { displayName: "", emailAddress: "", photoLink: "" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Drive revision retention never unpins or deletes preserved versions", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body || "" });
    if ((options.method || "GET") === "PATCH") {
      return { ok: true, status: 200, json: async () => ({ id: "r1", keepForever: false }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ revisions: [
        { id: "r3", modifiedTime: "2026-10-20T03:00:00.000Z", keepForever: true },
        { id: "r2", modifiedTime: "2026-10-20T02:00:00.000Z", keepForever: false },
        { id: "r1", modifiedTime: "2026-10-20T01:00:00.000Z", keepForever: true },
      ] }),
    };
  };
  try {
    const result = await enforceGoogleDriveRevisionRetention("token", "file-1", { maxRetained: 1 });
    assert.deepEqual(result.released, []);
    assert.equal(result.retained.length, 2);
    assert.equal(result.limit, 1);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saving with previously preserved versions never tries to unpin them", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let reads = 0;
  globalThis.fetch = async (url, options = {}) => {
    const endpoint = String(url);
    const method = options.method || "GET";
    calls.push({ endpoint, method, body: options.body });
    if (endpoint.includes("/revisions?")) return new Response(JSON.stringify({ revisions: Array.from({ length: 25 }, (_, i) => ({ id: `revision-${i}`, keepForever: true })) }));
    if (endpoint.includes("/revisions/") && method === "PATCH") return new Response(JSON.stringify({ id: "revision-25", keepForever: true }));
    if (endpoint.includes("/upload/")) return new Response(JSON.stringify({ id: "drive-1", title: "Board.studio", version: "3", headRevisionId: "revision-new" }));
    reads++;
    const current = reads < 3;
    return new Response(JSON.stringify({ id: "drive-1", title: "Board.studio", name: "Board.studio", etag: '"safe"', version: current ? "1" : "3", headRevisionId: current ? "revision-25" : "revision-new" }));
  };
  try {
    const saved = await uploadGoogleDriveMoodboard("token", { board: { id: "board-1" }, content: "{}", filename: "Board.studio", existingFile: { id: "drive-1" }, expectedVersion: "1" });
    assert.equal(saved.version, "3");
    const patches = calls.filter((call) => call.method === "PATCH");
    assert.equal(patches.length, 1);
    assert.deepEqual(JSON.parse(patches[0].body), { keepForever: true });
    assert.equal(calls.filter((call) => call.method === "DELETE").length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("saving stops safely at Drive's permanent revision limit without deleting history", async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];
  globalThis.fetch = async (url, options = {}) => {
    methods.push(options.method || "GET");
    if (String(url).includes("/revisions?")) return new Response(JSON.stringify({ revisions: Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, keepForever: true })) }));
    return new Response(JSON.stringify({ id: "drive-1", title: "Board.studio", etag: '"safe"', version: "1", headRevisionId: "current" }));
  };
  try {
    await assert.rejects(uploadGoogleDriveMoodboard("token", { board: { id: "board-1" }, content: "{}", filename: "Board.studio", existingFile: { id: "drive-1" }, expectedVersion: "1" }), (error) => error.code === "drive/revision" && /上限/.test(error.message));
    assert.ok(methods.every((method) => method === "GET"));
  } finally { globalThis.fetch = originalFetch; }
});

test("saving remains possible at the limit when the current head is already retained", async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];
  let reads = 0;
  globalThis.fetch = async (url, options = {}) => {
    const endpoint = String(url);
    const method = options.method || "GET";
    methods.push(method);
    if (endpoint.includes("/revisions?")) return new Response(JSON.stringify({ revisions: Array.from({ length: 200 }, (_, i) => ({ id: i === 0 ? "current" : `old-${i}`, keepForever: true })) }));
    if (endpoint.includes("/upload/")) return new Response(JSON.stringify({ id: "drive-1", title: "Board.studio", version: "2", headRevisionId: "next" }));
    reads++;
    return new Response(JSON.stringify({ id: "drive-1", title: "Board.studio", name: "Board.studio", etag: '"safe"', version: reads < 3 ? "1" : "2", headRevisionId: reads < 3 ? "current" : "next" }));
  };
  try {
    const saved = await uploadGoogleDriveMoodboard("token", { board: { id: "board-1" }, content: "{}", filename: "Board.studio", existingFile: { id: "drive-1" }, expectedVersion: "1" });
    assert.equal(saved.version, "2");
    assert.equal(methods.includes("PATCH"), false);
    assert.equal(methods.includes("DELETE"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("downloads the exact head revision when a revision id is supplied", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, text: async () => "{\"id\":\"board-1\"}" };
  };
  try {
    const content = await downloadGoogleDriveMoodboard("token", "file-1", { revisionId: "revision-8" });
    assert.equal(content, "{\"id\":\"board-1\"}");
    assert.match(requestedUrl, /files\/file-1\/revisions\/revision-8\?alt=media&supportsAllDrives=true/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("opens the current Drive file for a viewer and verifies the same version", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.cache, "no-store");
    calls.push({ url: String(url), headers: options.headers });
    if (String(url).includes("alt=media")) return new Response('{"id":"board-1","objects":[{"id":"image"}]}');
    return new Response(JSON.stringify({ id: "file-1", name: "Board.moodboard", version: "7", headRevisionId: "head-7", capabilities: { canReadRevisions: false, canEdit: false } }));
  };
  const result = await downloadCurrentGoogleDriveMoodboard("token", "file-1", { resourceKey: "shared-key" });
  assert.equal(JSON.parse(result.content).objects.length, 1);
  assert.equal(result.metadata.version, "7");
  assert.equal(result.metadata.resourceKey, "shared-key");
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /files\/file-1\?alt=media/);
  assert.doesNotMatch(calls[1].url, /revisions/);
  assert.ok(calls.every((call) => new Headers(call.headers).get("X-Goog-Drive-Resource-Keys") === "file-1/shared-key"));
});

test("retries a changing Drive snapshot and only returns a stable version", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let reads = 0, downloads = 0;
  globalThis.fetch = async (url) => String(url).includes("alt=media")
    ? new Response(JSON.stringify({ attempt: ++downloads }))
    : new Response(JSON.stringify({ id: "file-1", version: reads++ === 0 ? "1" : "2" }));
  const result = await downloadCurrentGoogleDriveMoodboard("token", "file-1");
  assert.equal(result.metadata.version, "2");
  assert.equal(JSON.parse(result.content).attempt, 2);
});

test("rejects content that does not match Drive's checksum even if metadata versions match", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("old content"));
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  globalThis.fetch = async (url) => String(url).includes("alt=media")
    ? new Response("different content")
    : new Response(JSON.stringify({ id: "file-1", version: "1", sha256Checksum: checksum }));
  await assert.rejects(downloadCurrentGoogleDriveMoodboard("token", "file-1"), DriveConflictError);
});

test("checks original UTF-8 bytes including BOM before decoding legacy text", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const content = '{"文字":"測試"}';
  const encoded = new TextEncoder().encode(content);
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encoded]);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  globalThis.fetch = async (url) => String(url).includes("alt=media")
    ? new Response(bytes)
    : new Response(JSON.stringify({ id: "file-1", version: "1", sha256Checksum: checksum }));
  assert.equal((await downloadCurrentGoogleDriveMoodboard("token", "file-1")).content, content);
});

test("reports a failed response body read as a Drive network error", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => String(url).includes("alt=media")
    ? { ok: true, status: 200, arrayBuffer: async () => { throw new Error("connection dropped"); } }
    : new Response(JSON.stringify({ id: "file-1", version: "1" }));
  await assert.rejects(downloadCurrentGoogleDriveMoodboard("token", "file-1"), { code: "drive/network" });
});

test("does not open a Drive file that changes during the download", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let reads = 0;
  globalThis.fetch = async (url) => String(url).includes("alt=media")
    ? new Response('{"id":"board-1"}')
    : new Response(JSON.stringify({ id: "file-1", version: String(++reads) }));
  await assert.rejects(downloadCurrentGoogleDriveMoodboard("token", "file-1"), DriveConflictError);
});

test("does not download a Drive file whose version cannot be verified", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ id: "file-1" })); };
  await assert.rejects(downloadCurrentGoogleDriveMoodboard("token", "file-1"), (error) => error.code === "drive/version-unavailable");
  assert.equal(calls, 1);
});

test("Drive downloads time out while waiting for the response", async (t) => {
  const originalFetch = globalThis.fetch;
  let aborted = false;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      aborted = true;
      const error = new Error("download aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });

  await assert.rejects(
    downloadGoogleDriveMoodboard("token", "file-1", { timeoutMs: 10 }),
    (error) => error.code === "drive/timeout",
  );
  assert.equal(aborted, true);
});

test("Drive downloads keep the timeout active while reading file contents", async (t) => {
  const originalFetch = globalThis.fetch;
  let aborted = false;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_url, options = {}) => ({
    ok: true,
    status: 200,
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("download body aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });

  await assert.rejects(
    downloadGoogleDriveMoodboard("token", "file-1", { timeoutMs: 10 }),
    (error) => error.code === "drive/timeout",
  );
  assert.equal(aborted, true);
});
