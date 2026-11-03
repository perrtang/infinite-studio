import { getApps, initializeApp } from "@firebase/app";
import {
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getAdditionalUserInfo,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
} from "@firebase/auth";
import {
  assertMoodboardProviderLinkIdentity,
  clearPendingMoodboardEmailAuth,
  createMoodboardEmailActionUrl,
  createPendingMoodboardEmailAuth,
  emailActionContextFromUrl,
  loadPendingMoodboardEmailAuth,
  maskMoodboardEmail,
  normalizeMoodboardEmail,
  savePendingMoodboardEmailAuth,
} from "./email-auth-state.js";
import { currentFirebaseDriveCredential } from "./firebase-drive-credential.js";

const runtimeEnv = import.meta.env || {};

// Firebase Web App configuration is a public client identifier, not a secret.
// Environment values can replace the canonical PETFASHION app when staging needs
// a separate Firebase project.
const publicFirebaseConfig = {
  apiKey: "AIzaSyCKNbO1yOmB3LhWtQ71gW1Pek0vmD-AWQs",
  authDomain: "auth.petfashion.tw",
  projectId: "pet-fashion-tw",
  storageBucket: "pet-fashion-tw.firebasestorage.app",
  messagingSenderId: "1068479226042",
  appId: "1:1068479226042:web:71ecbc7f1a62ecf2992283",
};

const firebaseConfig = {
  apiKey: runtimeEnv.VITE_FIREBASE_API_KEY || publicFirebaseConfig.apiKey,
  authDomain: runtimeEnv.VITE_FIREBASE_AUTH_DOMAIN || publicFirebaseConfig.authDomain,
  projectId: runtimeEnv.VITE_FIREBASE_PROJECT_ID || publicFirebaseConfig.projectId,
  storageBucket: runtimeEnv.VITE_FIREBASE_STORAGE_BUCKET || publicFirebaseConfig.storageBucket,
  messagingSenderId: runtimeEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || publicFirebaseConfig.messagingSenderId,
  appId: runtimeEnv.VITE_FIREBASE_APP_ID || publicFirebaseConfig.appId,
};

export const isMoodboardAuthConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const firebaseApp = isMoodboardAuthConfigured
  ? (getApps().find((app) => app.name === "infinite-moodboard")
      || initializeApp(firebaseConfig, "infinite-moodboard"))
  : null;

export function getMoodboardFirebaseApp() {
  if (!firebaseApp) throw new Error("PETFASHION Authentication 尚未設定完成。");
  return firebaseApp;
}

let authPromise;

async function moodboardAuth() {
  if (!firebaseApp) throw new Error("PETFASHION Authentication 尚未設定完成。");
  if (!authPromise) {
    authPromise = Promise.resolve(getAuth(firebaseApp));
  }
  return authPromise;
}

export async function getFirebaseDriveCredential() {
  return currentFirebaseDriveCredential(await moodboardAuth());
}

function setMoodboardAuthLanguage(auth, locale) {
  auth.languageCode = { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", en: "en" }[locale] || "en";
}

async function setMoodboardAuthPersistence(auth, rememberSession) {
  await setPersistence(auth, rememberSession ? browserLocalPersistence : browserSessionPersistence);
}

export function normalizeAccountUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    emailVerified: Boolean(user.emailVerified),
    providerIds: [...new Set((user.providerData || []).map((provider) => provider.providerId).filter(Boolean))],
  };
}

export async function observeMoodboardSession(callback) {
  try {
    const auth = await moodboardAuth();
    return onAuthStateChanged(
      auth,
      (user) => callback({ status: user ? "signed-in" : "signed-out", user: normalizeAccountUser(user), error: null }),
      (error) => callback({ status: "error", user: null, error }),
    );
  } catch (error) {
    callback({ status: "error", user: null, error });
    return () => {};
  }
}

export async function signInMoodboardWithGoogle(locale = "zh-Hant", {
  rememberSession = false,
  additionalScopes = [],
} = {}) {
  const auth = await moodboardAuth();
  await setMoodboardAuthPersistence(auth, rememberSession);
  setMoodboardAuthLanguage(auth, locale);
  const provider = new GoogleAuthProvider();
  [...new Set(additionalScopes.map((scope) => String(scope || "").trim()).filter(Boolean))]
    .forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  const oauthCredential = GoogleAuthProvider.credentialFromResult(credential);
  return {
    user: normalizeAccountUser(credential.user),
    isNewUser: Boolean(getAdditionalUserInfo(credential)?.isNewUser),
    oauthAccessToken: String(oauthCredential?.accessToken || ""),
  };
}

export async function sendMoodboardEmailSignInLink(email, locale = "zh-Hant", {
  storage = globalThis.localStorage,
  href = globalThis.location?.href,
  rememberSession = false,
  feature = "account",
  marketingOptIn = false,
  accepted = false,
  mode = "sign-in",
} = {}) {
  const auth = await moodboardAuth();
  const normalizedEmail = normalizeMoodboardEmail(email);
  const currentUser = auth.currentUser;
  const accountUid = mode === "link" ? currentUser?.uid : null;

  if (mode === "link") {
    if (!currentUser || !currentUser.emailVerified) {
      const error = new Error("請先重新登入並確認目前帳號，再連結 Email 登入。");
      error.code = "auth/requires-recent-login";
      throw error;
    }
    if (normalizeMoodboardEmail(currentUser.email) !== normalizedEmail) {
      const error = new Error("Email 登入只能連結目前已驗證的帳號地址。");
      error.code = "auth/link-email-mismatch";
      throw error;
    }
  }

  const request = createPendingMoodboardEmailAuth({
    email: normalizedEmail,
    feature,
    mode,
    accountUid,
    rememberSession,
    marketingOptIn,
    accepted,
  });
  await setMoodboardAuthPersistence(auth, rememberSession);
  setMoodboardAuthLanguage(auth, locale);
  await sendSignInLinkToEmail(auth, normalizedEmail, {
    url: createMoodboardEmailActionUrl(href, { feature, mode }),
    handleCodeInApp: true,
  });
  savePendingMoodboardEmailAuth(storage, request);
  return { request, maskedEmail: maskMoodboardEmail(normalizedEmail) };
}

export async function isMoodboardEmailSignInLink(href = globalThis.location?.href) {
  const auth = await moodboardAuth();
  return isSignInWithEmailLink(auth, href);
}

export function pendingMoodboardEmailSignIn(storage = globalThis.localStorage) {
  return loadPendingMoodboardEmailAuth(storage);
}

export async function completeMoodboardEmailSignInLink(email, href = globalThis.location?.href, {
  storage = globalThis.localStorage,
} = {}) {
  const auth = await moodboardAuth();
  if (!isSignInWithEmailLink(auth, href)) {
    const error = new Error("這不是有效的 Email 登入連結。");
    error.code = "auth/invalid-action-code";
    throw error;
  }

  const normalizedEmail = normalizeMoodboardEmail(email);
  const pending = loadPendingMoodboardEmailAuth(storage);
  const context = emailActionContextFromUrl(href);
  const mode = pending?.mode || context.mode;

  if (pending && pending.email !== normalizedEmail) {
    const error = new Error("輸入的 Email 與驗證連結不符。");
    error.code = "auth/email-link-account-mismatch";
    throw error;
  }

  await setMoodboardAuthPersistence(auth, pending?.rememberSession === true);
  let credential;
  if (mode === "link") {
    if (!pending || context.mode !== "link") {
      const error = new Error("找不到原本的帳號連結工作階段，請回到設定重新寄送。");
      error.code = "auth/missing-link-state";
      throw error;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const error = new Error("原本的登入工作階段已結束，請重新登入後再連結 Email。");
      error.code = "auth/requires-recent-login";
      throw error;
    }
    const emailCredential = EmailAuthProvider.credentialWithLink(normalizedEmail, href);
    credential = await linkWithCredential(currentUser, emailCredential);
    assertMoodboardProviderLinkIdentity({
      currentUid: currentUser.uid,
      expectedUid: pending.accountUid,
      resultUid: credential.user.uid,
    });
  } else {
    credential = await signInWithEmailLink(auth, normalizedEmail, href);
  }

  clearPendingMoodboardEmailAuth(storage);
  return {
    user: normalizeAccountUser(credential.user),
    isNewUser: mode === "sign-in" && Boolean(getAdditionalUserInfo(credential)?.isNewUser),
    pending,
    mode,
  };
}

export async function linkMoodboardGoogle(locale = "zh-Hant") {
  return linkMoodboardPopupProvider(new GoogleAuthProvider(), "google.com", locale);
}

export async function linkMoodboardFacebook(locale = "zh-Hant") {
  return linkMoodboardPopupProvider(new FacebookAuthProvider(), "facebook.com", locale);
}

async function linkMoodboardPopupProvider(provider, providerId, locale) {
  const auth = await moodboardAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    const error = new Error("請先登入目前帳號，再連結 Google。");
    error.code = "auth/requires-recent-login";
    throw error;
  }
  if (currentUser.providerData.some((entry) => entry.providerId === providerId)) {
    return { user: normalizeAccountUser(currentUser), alreadyLinked: true };
  }
  setMoodboardAuthLanguage(auth, locale);
  if (providerId === "google.com") provider.setCustomParameters({ prompt: "select_account" });
  const result = await linkWithPopup(currentUser, provider);
  assertMoodboardProviderLinkIdentity({
    currentUid: currentUser.uid,
    expectedUid: currentUser.uid,
    resultUid: result.user.uid,
  });
  return { user: normalizeAccountUser(result.user), alreadyLinked: false };
}

export async function signOutMoodboardSession() {
  const auth = await moodboardAuth();
  await signOut(auth);
}

export function moodboardAuthPreviewUser() {
  const previewEnabled = import.meta.env.DEV || runtimeEnv.VITE_ENABLE_AUTH_PREVIEW === "true";
  if (!previewEnabled || typeof window === "undefined") return null;
  if (new URLSearchParams(window.location.search).get("authPreview") !== "signed-in") return null;
  return {
    uid: "local-auth-preview",
    displayName: "Local Preview",
    email: "preview@example.invalid",
    photoURL: "",
    emailVerified: true,
    providerIds: ["google.com"],
  };
}
