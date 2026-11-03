import test from "node:test";
import assert from "node:assert/strict";
import { createDriveAuthRouter } from "./drive-auth-router.js";

const origin = "https://infinite.petfashion.tw", secret = "A".repeat(43), stateHash = "B".repeat(43);
function setup() {
  let called = 0;
  const coordinator = {
    begin: async token => { called++; if (token !== "valid.firebase.jwt") throw new Error("private-token"); return { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque", browserSecret: secret }; },
    callback: async input => { called++; if (input.state !== "opaque" || input.code !== "private-code" || input.browserSecret !== secret) throw new Error("private-code"); return { stateHash }; },
    complete: async input => { called++; if (input.firebaseToken !== "valid.firebase.jwt" || input.stateHash !== stateHash || input.browserSecret !== secret) throw new Error("private-secret"); return { connected: true }; },
  };
  const identity = { firebase: async token => { if (token !== "valid.firebase.jwt") throw new Error("private-token"); return { uid: "verified-user" }; } };
  const refreshServiceForUid = uid => ({ refresh: async () => { if (uid !== "verified-user") throw new Error("wrong user"); return { accessToken: "short-lived-access", expiresAt: Date.now() + 60_000, refreshToken: "never-return" }; } });
  return { handler: createDriveAuthRouter({ coordinator, identity, refreshServiceForUid }), calls: () => called };
}
const post = (path, options = {}) => new Request(`${origin}${path}`, { method: "POST", headers: { origin, "content-type": "application/json", authorization: "Bearer valid.firebase.jwt", ...options.headers } });
const pending = `__Host-infinite-drive-pending=${secret}`, staged = `__Host-infinite-drive-staged=${stateHash}`;

test("connect requires same-origin JSON and Firebase bearer, and keeps secrets HttpOnly", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(post("/api/drive/connect", { headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await handler(post("/api/drive/connect", { headers: { "content-type": "text/plain" } }))).status, 403);
  assert.equal((await handler(post("/api/drive/connect", { headers: { authorization: "" } }))).status, 401);
  assert.equal(calls(), 0);
  const response = await handler(post("/api/drive/connect"));
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes(secret), false);
  assert.match(text, /accounts\.google\.com/);
  assert.match(response.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("callback never reflects code and requires one state, code and original cookie", async () => {
  const { handler, calls } = setup();
  const path = "/api/drive/oauth/callback?state=opaque&code=private-code";
  const missing = await handler(new Request(`${origin}${path}`));
  assert.match(missing.headers.get("location"), /result=error$/);
  assert.equal(calls(), 0);
  const duplicate = await handler(new Request(`${origin}${path}&state=second`, { headers: { cookie: pending } }));
  assert.match(duplicate.headers.get("location"), /result=error$/);
  const response = await handler(new Request(`${origin}${path}`, { headers: { cookie: pending } }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/drive-auth-complete.html?result=success`);
  assert.equal(response.headers.get("location").includes("private-code"), false);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("completion uses both host-only cookies and clears them after success", async () => {
  const { handler } = setup();
  assert.equal((await handler(post("/api/drive/complete", { headers: { cookie: pending } }))).status, 401);
  assert.equal((await handler(post("/api/drive/complete", { headers: { cookie: `${pending}; ${pending}; ${staged}` } }))).status, 401);
  const response = await handler(post("/api/drive/complete", { headers: { cookie: `${pending}; ${staged}` } }));
  assert.deepEqual(await response.json(), { authorized: true });
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("access-token API authenticates caller and does not expose refresh credentials", async () => {
  const { handler } = setup();
  const response = await handler(post("/api/drive/access-token"));
  const body = await response.json();
  assert.equal(body.accessToken, "short-lived-access");
  assert.equal("refreshToken" in body, false);
  const failed = await handler(post("/api/drive/access-token", { headers: { authorization: "Bearer other.token" } }));
  assert.equal(failed.status, 401);
  assert.equal((await failed.text()).includes("private-token"), false);
});

test("revoking a Firebase session during a provider refresh prevents token delivery", async () => {
  let active = true, release;
  const pending = new Promise(resolve => { release = resolve; });
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  const identity = { firebase: async () => { if (!active) throw new Error("revoked"); return { uid: "user" }; } };
  const coordinator = {};
  const handler = createDriveAuthRouter({ identity, coordinator, refreshServiceForUid: () => ({ refresh: async () => { started(); await pending; return { accessToken: "private-access", expiresAt: Date.now() + 300_000 }; } }) });
  const response = handler(post("/api/drive/access-token"));
  await entered;
  active = false;
  release();
  const result = await response;
  assert.equal(result.status, 401);
  assert.doesNotMatch(await result.text(), /private-access/);
});

test("a Firebase outage returns a retryable service failure rather than a false sign-in error", async () => {
  const identity = { firebase: async () => { throw Object.assign(new Error("offline"), { code: "identity_unavailable" }); } };
  const handler = createDriveAuthRouter({ identity, coordinator: {}, refreshServiceForUid: () => ({ refresh: async () => { throw new Error("must not run"); } }) });
  const response = await handler(post("/api/drive/access-token"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "unavailable" });
});
