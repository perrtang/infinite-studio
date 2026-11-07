import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleDriveMoodboardUrl,
  driveFileRole,
  drivePermissionRole,
  drivePermissionRoleLabel,
  googleDriveGeneralAccess,
  googleDriveFileAccessUrl,
  googleDriveMembers,
  parseGoogleDriveMoodboardLink,
  preserveGoogleDriveResourceKey,
  sharedEditorUrl,
  sharedViewerEditorLabel,
} from "./drive-share.js";
import { linkDriveFile } from "./drive-state.js";
import {
  createGoogleDrivePermission,
  deleteGoogleDrivePermission,
  listGoogleDrivePermissions,
  updateGoogleDrivePermission,
} from "./drive-storage.js";

test("shared viewer never assumes sign-out while session is unresolved or unavailable", () => {
  assert.equal(sharedViewerEditorLabel("checking", "ready"), "開啟編輯");
  assert.equal(sharedViewerEditorLabel("error", "ready"), "開啟編輯");
  assert.equal(sharedViewerEditorLabel("signed-in", "ready"), "開啟編輯");
  assert.equal(sharedViewerEditorLabel("signed-out", "ready"), "登入後編輯");
  assert.equal(sharedViewerEditorLabel("signed-out", "error"), "登入以開啟");
});

test("every recipient gets a native recovery link for the exact file without account-specific access", () => {
  for (const fileId of ["file_alpha-1234567890", "file_beta_0987654321"]) {
    const url = new URL(googleDriveFileAccessUrl({ fileId, resourceKey: "resource_123" }));
    assert.equal(url.origin, "https://drive.google.com");
    assert.equal(url.pathname, `/file/d/${fileId}/view`);
    assert.deepEqual([...url.searchParams], [["resourcekey", "resource_123"]]);
  }
  assert.equal(googleDriveFileAccessUrl({ fileId: "https://malicious.example/" }), "");
  assert.equal(googleDriveFileAccessUrl(), "");
  assert.equal(new URL(googleDriveFileAccessUrl({ fileId: "file_alpha-1234567890" })).search, "");
});

test("a shared file's resource key survives repeated metadata reads and persistence for reopening", () => {
  const first = preserveGoogleDriveResourceKey({ id: "shared_file_123456", resourceKey: "" }, "link_resource_123");
  const verified = preserveGoogleDriveResourceKey({ ...first, resourceKey: "", version: "3" }, first.resourceKey);
  const state = linkDriveFile({ links: {} }, { id: "board-123", revision: 7 }, verified);
  const reopenedState = JSON.parse(JSON.stringify(state));
  assert.equal(reopenedState.links["board-123"].resourceKey, "link_resource_123");
  const refreshed = preserveGoogleDriveResourceKey({ ...verified, resourceKey: "fresh_resource_456" }, "older_resource");
  assert.equal(refreshed.resourceKey, "fresh_resource_456");
  assert.equal(verified.resourceKey, "link_resource_123");
});

test("Drive Moodboard links identify one exact file and discard unrelated page state", () => {
  const url = createGoogleDriveMoodboardUrl(
    { fileId: "drive_file-1234567890", resourceKey: "resource-key_123" },
    "https://moodboard.petfashion.tw/moodboard.html?acceptance=old&v=0.47.0#canvas",
  );
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.pathname, "/moodboard.html");
  assert.deepEqual([...parsedUrl.searchParams.keys()], ["driveFile", "resourceKey"]);
  assert.equal(parsedUrl.hash, "");
  assert.deepEqual(parseGoogleDriveMoodboardLink(url), {
    fileId: "drive_file-1234567890",
    resourceKey: "resource-key_123",
  });
  assert.equal(parseGoogleDriveMoodboardLink("https://moodboard.petfashion.tw/?driveFile=bad"), null);
});

test("Drive permissions map to owner, editor, viewer, and link access", () => {
  const permissions = [
    { id: "owner", type: "user", role: "owner", displayName: "Owner" },
    { id: "writer", type: "user", role: "writer", emailAddress: "editor@example.com" },
    { id: "reader", type: "user", role: "reader", displayName: "Viewer" },
    { id: "anyone", type: "anyone", role: "reader", allowFileDiscovery: false },
  ];
  assert.equal(drivePermissionRole(permissions[0]), "owner");
  assert.equal(drivePermissionRole(permissions[1]), "editor");
  assert.equal(drivePermissionRoleLabel("editor"), "可編輯");
  assert.equal(drivePermissionRoleLabel("writer"), "可編輯");
  assert.equal(drivePermissionRoleLabel("owner"), "擁有者");
  assert.equal(drivePermissionRoleLabel("viewer"), "僅檢視");
  assert.equal(drivePermissionRoleLabel(permissions[2]), "僅檢視");
  assert.equal(driveFileRole({ ownedByMe: true, capabilities: {} }), "owner");
  assert.equal(driveFileRole({ capabilities: { canEdit: true } }), "editor");
  assert.deepEqual(googleDriveMembers(permissions).map((member) => member.appRole), ["owner", "editor", "viewer"]);
  assert.deepEqual(googleDriveGeneralAccess(permissions), { enabled: true, permissionId: "anyone", role: "viewer" });
  assert.deepEqual(googleDriveGeneralAccess([]), { enabled: false, permissionId: "", role: "viewer" });
});

test("Drive ACL requests preserve resource keys and use native reader or writer roles", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body ? JSON.parse(options.body) : null,
    });
    if ((options.method || "GET") === "DELETE") return { ok: true, status: 204, json: async () => null };
    if ((options.method || "GET") === "GET") {
      return { ok: true, status: 200, json: async () => ({ permissions: [{ id: "owner", type: "user", role: "owner" }] }) };
    }
    return { ok: true, status: 200, json: async () => ({ id: "permission-1", type: "user", role: options.method === "PATCH" ? "reader" : "writer", emailAddress: "editor@example.com" }) };
  };

  const options = { resourceKey: "resource-key_123" };
  assert.equal((await listGoogleDrivePermissions("token", "drive-file-123", options))[0].role, "owner");
  await createGoogleDrivePermission("token", "drive-file-123", {
    ...options,
    type: "user",
    role: "writer",
    emailAddress: "Editor@Example.com",
  });
  await updateGoogleDrivePermission("token", "drive-file-123", "permission-1", "reader", options);
  await deleteGoogleDrivePermission("token", "drive-file-123", "permission-1", options);

  calls.forEach((call) => assert.equal(call.headers["X-Goog-Drive-Resource-Keys"], "drive-file-123/resource-key_123"));
  assert.equal(calls[1].body.emailAddress, "editor@example.com");
  assert.equal(calls[1].body.role, "writer");
  assert.equal(calls[2].body.role, "reader");
  assert.equal(calls[3].method, "DELETE");
});

test("Drive ACL listing aggregates every permission page", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    calls.push(parsed);
    const secondPage = parsed.searchParams.get("pageToken") === "page-2";
    return {
      ok: true,
      status: 200,
      json: async () => secondPage
        ? { permissions: [{ id: "viewer", type: "user", role: "reader" }] }
        : { nextPageToken: "page-2", permissions: [{ id: "owner", type: "user", role: "owner" }] },
    };
  };

  const permissions = await listGoogleDrivePermissions("token", "drive-file-123");
  assert.deepEqual(permissions.map((permission) => permission.id), ["owner", "viewer"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("pageSize"), "100");
  assert.equal(calls[1].searchParams.get("pageToken"), "page-2");
});

test("Drive ACL rejects invalid emails before making an external request", async (t) => {
  const originalFetch = globalThis.fetch;
  let called = false;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => {
    called = true;
    throw new Error("should not run");
  };
  await assert.rejects(
    createGoogleDrivePermission("token", "drive-file-123", { type: "user", role: "writer", emailAddress: "invalid" }),
    /有效的 Email/,
  );
  assert.equal(called, false);
});


test("switching to editing preserves the exact shared file and resource key", () => {
  const source = "https://infinite.petfashion.tw/?driveFile=shared_file_123456&resourceKey=resource_123&other=keep#canvas";
  const url = new URL(sharedEditorUrl(source));
  assert.equal(url.searchParams.get("driveFile"), "shared_file_123456");
  assert.equal(url.searchParams.get("resourceKey"), "resource_123");
  assert.equal(url.searchParams.get("sharedEdit"), "1");
  assert.equal(url.searchParams.get("requestEdit"), "1");
  assert.equal(url.searchParams.get("other"), "keep");
  assert.equal(url.hash, "#canvas");
  const errorPath = new URL(sharedEditorUrl(url.href, {requestEdit:false}));
  assert.equal(errorPath.searchParams.get("driveFile"), "shared_file_123456");
  assert.equal(errorPath.searchParams.has("requestEdit"), false);
});
