import test from "node:test";
import assert from "node:assert/strict";
import { currentFirebaseDriveCredential } from "./firebase-drive-credential.js";
test("credential is bound to the still-current Firebase account", async () => {
  const auth = { currentUser: { uid: "a", getIdToken: async () => "token" } };
  assert.deepEqual(await currentFirebaseDriveCredential(auth), { uid: "a", token: "token" });
  auth.currentUser.getIdToken = async () => { auth.currentUser = { uid: "b" }; return "token"; };
  await assert.rejects(currentFirebaseDriveCredential(auth), /account_changed/);
  await assert.rejects(currentFirebaseDriveCredential({ currentUser: null }), /authentication_required/);
});
