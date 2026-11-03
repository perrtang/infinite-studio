// Capture and recheck the active identity around asynchronous token refresh.
export async function currentFirebaseDriveCredential(auth) {
  const user = auth?.currentUser;
  if (!user?.uid || typeof user.getIdToken !== "function") throw Object.assign(new Error("authentication_required"), { code: "authentication_required" });
  const token = await user.getIdToken();
  if (!token || auth.currentUser !== user || auth.currentUser.uid !== user.uid) throw Object.assign(new Error("account_changed"), { code: "account_changed" });
  return { uid: user.uid, token };
}
