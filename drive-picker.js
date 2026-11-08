import {
  DRIVE_FILE_MIME_TYPE,
  DriveApiError,
  GOOGLE_DRIVE_CLIENT_ID,
} from "./drive-state.js";

const runtimeEnv = import.meta.env || {};
const GOOGLE_PICKER_SCRIPT = "https://apis.google.com/js/api.js";
const GOOGLE_PICKER_LOAD_TIMEOUT_MS = 15_000;
// Selection is a human decision and may take longer than loading the picker.
const GOOGLE_PICKER_SELECTION_TIMEOUT_MS = 5 * 60_000;
const GOOGLE_API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/;
const GOOGLE_PROJECT_NUMBER_PATTERN = /^\d{6,20}$/;

export const GOOGLE_DRIVE_PICKER_API_KEY = runtimeEnv.VITE_GOOGLE_DRIVE_PICKER_API_KEY || "";
export const GOOGLE_DRIVE_PROJECT_NUMBER = runtimeEnv.VITE_GOOGLE_DRIVE_PROJECT_NUMBER || "";

let pickerScriptPromise;
let pickerApiPromise;

export function getGoogleDrivePickerConfiguration({
  clientId = GOOGLE_DRIVE_CLIENT_ID,
  apiKey = GOOGLE_DRIVE_PICKER_API_KEY,
  projectNumber = GOOGLE_DRIVE_PROJECT_NUMBER,
  origin = globalThis.location?.origin || "",
} = {}) {
  const configuration = {
    clientId: String(clientId || "").trim(),
    apiKey: String(apiKey || "").trim(),
    projectNumber: String(projectNumber || "").trim(),
    origin: String(origin || "").trim(),
  };
  const missing = Object.entries(configuration)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const invalid = [];
  if (configuration.apiKey && !GOOGLE_API_KEY_PATTERN.test(configuration.apiKey)) invalid.push("apiKey");
  if (configuration.projectNumber && !GOOGLE_PROJECT_NUMBER_PATTERN.test(configuration.projectNumber)) {
    invalid.push("projectNumber");
  }
  if (configuration.origin) {
    try {
      const parsedOrigin = new URL(configuration.origin);
      if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.origin !== configuration.origin) {
        invalid.push("origin");
      }
    } catch {
      invalid.push("origin");
    }
  }
  return {
    ...configuration,
    missing,
    invalid,
    configured: missing.length === 0 && invalid.length === 0,
  };
}

export function isGoogleDrivePickerConfigured(configuration = getGoogleDrivePickerConfiguration()) {
  return configuration?.configured === true;
}

export function normalizeGoogleDrivePickerDocument(document = {}) {
  const source = document && typeof document === "object" ? document : {};
  return {
    id: String(source.id || source.fileId || ""),
    name: String(source.name || source.title || "分享的工作檔"),
    mimeType: String(source.mimeType || source.type || DRIVE_FILE_MIME_TYPE),
    resourceKey: String(source.resourceKey || source.resource_key || ""),
  };
}

export function resolveGoogleDrivePickerSelection(
  documents,
  { expectedFileId = "", expectedResourceKey = "" } = {},
) {
  const selected = normalizeGoogleDrivePickerDocument(Array.isArray(documents) ? documents[0] : null);
  if (!selected.id) {
    throw new DriveApiError("Google Drive 沒有回傳可開啟的檔案。", {
      code: "drive/picker-empty",
      reason: "pickerEmpty",
    });
  }
  const expected = String(expectedFileId || "").trim();
  if (expected && selected.id !== expected) {
    throw new DriveApiError("你選的不是此分享連結指定的檔案；沒有開啟任何內容。", {
      code: "drive/picker-mismatch",
      reason: "pickerFileMismatch",
      details: { expectedFileId: expected, selectedFileId: selected.id },
    });
  }
  return {
    ...selected,
    resourceKey: String(selected.resourceKey || expectedResourceKey || ""),
  };
}

function loadGooglePickerScript() {
  if (globalThis.gapi?.load) return Promise.resolve();
  if (pickerScriptPromise) return pickerScriptPromise;
  if (!globalThis.document) {
    return Promise.reject(new DriveApiError("目前環境無法載入 Google 檔案選擇器。", {
      code: "drive/picker-unavailable",
      reason: "documentUnavailable",
    }));
  }
  pickerScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_PICKER_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      script.remove();
      pickerScriptPromise = null;
      reject(new DriveApiError("無法載入 Google 檔案選擇器。", {
        code: "drive/picker-unavailable",
        reason: "scriptLoadFailed",
      }));
    };
    const onTimeout = () => {
      cleanup();
      script.remove();
      pickerScriptPromise = null;
      reject(new DriveApiError("Google 檔案選擇器載入逾時。", {
        code: "drive/picker-timeout",
        reason: "pickerScriptLoadTimeout",
      }));
    };
    const timeoutId = globalThis.setTimeout(onTimeout, GOOGLE_PICKER_LOAD_TIMEOUT_MS);
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = GOOGLE_PICKER_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return pickerScriptPromise;
}

async function loadGooglePickerApi() {
  if (globalThis.google?.picker?.PickerBuilder) return;
  if (pickerApiPromise) return pickerApiPromise;
  pickerApiPromise = loadGooglePickerScript().then(() => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    try {
      globalThis.gapi.load("picker", {
        callback: () => {
          if (globalThis.google?.picker?.PickerBuilder) finish(resolve);
          else finish(reject, new DriveApiError("Google 檔案選擇器未完成初始化。", {
            code: "drive/picker-unavailable",
            reason: "pickerNamespaceMissing",
          }));
        },
        onerror: () => finish(reject, new DriveApiError("Google 檔案選擇器無法初始化。", {
          code: "drive/picker-unavailable",
          reason: "pickerLoadFailed",
        })),
        timeout: GOOGLE_PICKER_LOAD_TIMEOUT_MS,
        ontimeout: () => finish(reject, new DriveApiError("Google 檔案選擇器載入逾時。", {
          code: "drive/picker-timeout",
          reason: "pickerLoadTimeout",
        })),
      });
    } catch (error) {
      finish(reject, error instanceof DriveApiError ? error : new DriveApiError(
        error?.message || "Google 檔案選擇器無法啟動。",
        { code: "drive/picker-unavailable", reason: "pickerLoadException", details: error },
      ));
    }
  })).catch((error) => {
    pickerApiPromise = null;
    throw error;
  });
  return pickerApiPromise;
}

export async function openGoogleDriveMoodboardPicker({
  accessToken,
  expectedFileId = "",
  expectedResourceKey = "",
  clientId,
  apiKey,
  projectNumber,
  origin,
  timeoutMs = GOOGLE_PICKER_SELECTION_TIMEOUT_MS,
} = {}) {
  const configuration = getGoogleDrivePickerConfiguration({ clientId, apiKey, projectNumber, origin });
  if (!configuration.configured) {
    throw new DriveApiError("Google Drive 檔案選擇器尚未完成網站設定。", {
      code: "drive/picker-unconfigured",
      reason: "pickerConfigurationMissing",
      details: { missing: configuration.missing, invalid: configuration.invalid },
    });
  }
  if (!accessToken) {
    throw new DriveApiError("請先連結 Google Drive，再選取共享檔案。", {
      code: "drive/authorization",
      status: 401,
      reason: "accessTokenMissing",
    });
  }
  const expected = String(expectedFileId || "").trim();
  if (!expected) {
    throw new DriveApiError("分享連結缺少 Google Drive 檔案 ID。", {
      code: "drive/picker-invalid-target",
      reason: "expectedFileMissing",
    });
  }

  await loadGooglePickerApi();
  const pickerNamespace = globalThis.google.picker;

  return new Promise((resolve, reject) => {
    let settled = false;
    let picker;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      if (callback === reject) {
        try { picker?.dispose(); } catch { /* Keep the original actionable error. */ }
      }
      callback(value);
    };
    const timeoutId = globalThis.setTimeout(() => finish(reject, new DriveApiError(
      "Google 檔案選擇器等待逾時；沒有開啟任何內容。",
      { code: "drive/picker-timeout", reason: "pickerSelectionTimeout" },
    )), Math.max(1_000, Number(timeoutMs) || GOOGLE_PICKER_SELECTION_TIMEOUT_MS));

    try {
      const view = new pickerNamespace.DocsView(pickerNamespace.ViewId.DOCS)
        .setMimeTypes(DRIVE_FILE_MIME_TYPE)
        .setIncludeFolders(false);
      if (typeof view.setMode === "function" && pickerNamespace.DocsViewMode?.LIST) {
        view.setMode(pickerNamespace.DocsViewMode.LIST);
      }
      if (typeof view.setFileIds === "function") view.setFileIds(expected);
      // Without file-ID filtering, show supported files and validate the exact ID after selection.

      picker = new pickerNamespace.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(configuration.apiKey)
        .setAppId(configuration.projectNumber)
        .setOrigin(configuration.origin)
        .setTitle("選取此分享連結指定的工作檔")
        .setCallback((response = {}) => {
          const action = response.action || response[pickerNamespace.Response?.ACTION];
          if (action === pickerNamespace.Action.CANCEL) {
            finish(resolve, { status: "cancelled" });
            return;
          }
          if (action === pickerNamespace.Action.ERROR) {
            finish(reject, new DriveApiError("Google 檔案選擇器發生錯誤；沒有開啟任何內容。", {
              code: "drive/picker-error",
              reason: "pickerResponseError",
              details: response,
            }));
            return;
          }
          if (action !== pickerNamespace.Action.PICKED) return;
          try {
            const documents = response.docs || response[pickerNamespace.Response?.DOCUMENTS] || [];
            const file = resolveGoogleDrivePickerSelection(documents, {
              expectedFileId: expected,
              expectedResourceKey,
            });
            finish(resolve, { status: "picked", file });
          } catch (error) {
            finish(reject, error);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (error) {
      finish(reject, error instanceof DriveApiError ? error : new DriveApiError(
        error?.message || "Google 檔案選擇器無法啟動。",
        { code: "drive/picker-unavailable", reason: "pickerBuildFailed", details: error },
      ));
    }
  });
}
