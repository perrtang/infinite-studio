import test from "node:test";
import assert from "node:assert/strict";
import { connectDriveGrant, restoreDriveGrant, restoreOrConnectDriveGrant } from "./drive-auth-client.js";

test("reconnect restores an existing grant without requesting consent", async () => {
  const f = fixture(); let requested = false;
  const token = await restoreOrConnectDriveGrant({ popup: f.popup, restore: async () => ({ accessToken: "existing" }), connect: async () => { requested = true; } });
  assert.equal(token.accessToken, "existing");
  assert.equal(requested, false);
  assert.equal(f.popup.closed, true);
});

test("reconnect requests consent only when authorization is required", async () => {
  const f = fixture(); let requested = false;
  const token = await restoreOrConnectDriveGrant({ popup: f.popup, restore: async () => { throw Object.assign(new Error(), { code: "authorization_required" }); }, connect: async () => { requested = true; return { accessToken: "new" }; } });
  assert.equal(token.accessToken, "new");
  assert.equal(requested, true);
});

test("reconnect stops on service failure or account changes without requesting consent", async () => {
  for (const code of ["unavailable", "account_changed"]) {
    const f = fixture(); let requested = false;
    await assert.rejects(restoreOrConnectDriveGrant({ popup: f.popup, restore: async () => { throw Object.assign(new Error(code), { code }); }, connect: async () => { requested = true; } }), { code });
    assert.equal(requested, false);
    assert.equal(f.popup.closed, true);
  }
});

function fixture() {
  const listeners = new Set(); const requests = [];
  const popup = { closed: false, close() { this.closed = true; }, location: { replace(url) { popup.url = url; } } };
  const browserWindow = { location: { origin: "https://infinite.petfashion.tw" }, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), setTimeout, clearTimeout, setInterval, clearInterval };
  const fetchImpl = async (path, options) => {
    requests.push({ path, options });
    const value = path.endsWith("connect") ? { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?fixture=1" } : path.endsWith("complete") ? { authorized: true } : { accessToken: "short-token", expiresAt: Date.now() + 300_000 };
    return { ok: true, json: async () => value };
  };
  const send = (source, origin, result) => { for (const listener of listeners) listener({ source, origin, data: { type: "infinite-studio-drive-oauth", result } }); };
  return { popup, browserWindow, fetchImpl, requests, send, listeners };
}

test("popup only accepts its own same-origin result and completes before requesting access", async () => {
  const f = fixture();
  const pending = connectDriveGrant({ ...f, getCredential: async () => ({ uid: "a", token: "id-token" }) });
  await new Promise(resolve => setImmediate(resolve));
  f.send({}, f.browserWindow.location.origin, "success");
  f.send(f.popup, "https://other.example", "success");
  assert.equal(f.requests.length, 1);
  f.send(f.popup, f.browserWindow.location.origin, "success");
  assert.equal((await pending).accessToken, "short-token");
  assert.deepEqual(f.requests.map(r => r.path), ["/api/drive/connect", "/api/drive/complete", "/api/drive/access-token"]);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.popup.closed, true);
});

test("failed authorization never completes or obtains a token", async () => {
  const f = fixture();
  const pending = connectDriveGrant({ ...f, getCredential: async () => ({ uid: "a", token: "id-token" }) });
  await new Promise(resolve => setImmediate(resolve));
  f.send(f.popup, f.browserWindow.location.origin, "error");
  await assert.rejects(pending, /authorization_failed/);
  assert.deepEqual(f.requests.map(r => r.path), ["/api/drive/connect"]);
  assert.equal(f.listeners.size, 0);
});

test("expired or near-expiry access tokens cannot be restored", async () => {
  await assert.rejects(restoreDriveGrant("id", async () => ({ ok: true, json: async () => ({ accessToken: "x", expiresAt: Date.now() + 1000 }) })), /invalid_token_response/);
});

test("network failure and malformed responses do not expose raw details", async () => {
  await assert.rejects(restoreDriveGrant("id", async () => { throw new Error("private network details"); }), { code: "unavailable", message: "unavailable" });
  await assert.rejects(restoreDriveGrant("id", async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } })), { code: "unavailable" });
});

test("switching Firebase accounts while the popup is open never activates the grant", async () => {
  const f = fixture(); let currentUid = "a";
  const pending = connectDriveGrant({ ...f, getCredential: async () => ({ uid: currentUid, token: "id-token" }) });
  await new Promise(resolve => setImmediate(resolve));
  currentUid = "b";
  f.send(f.popup, f.browserWindow.location.origin, "success");
  await assert.rejects(pending, /account_changed/);
  assert.deepEqual(f.requests.map(r => r.path), ["/api/drive/connect"]);
});
