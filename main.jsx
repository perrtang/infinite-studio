import { shouldAutoLoadDriveChange } from "./drive-live-refresh.js";
import { driveHeaderIndicator } from "./drive-header-indicator.js";
import { connectCanvasAgent } from "./mcp-live-client.js";
import { assertUpdateSnapshotUnchanged, savePrimaryBeforeUpdate } from "./update-safety.js";
import { parseObjectClipboard, serializeObjectClipboard } from "./object-clipboard.js";
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { workspaceReadIsCurrent, remoteContentChanged } from "./workspace-read-guard.js";
import { createProtectedShareLink, unlockProtectedShare } from "./protected-share.js";
import { isCloudBoardReadOnly } from "./drive-access.js";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  AlertTriangle,
  ArrowLeft,
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  CloudOff,
  CloudUpload,
  Copy,
  Crosshair,
  Diamond,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  ExternalLink,
  FileArchive,
  FileCode2,
  FileUp,
  Flag,
  FolderOpen,
  GripVertical,
  Hand,
  HardDrive,
  Heart,
  History,
  Hexagon,
  Image as ImageIcon,
  ImageDown,
  ImagePlus,
  Images,
  Info,
  Languages,
  LayoutGrid,
  Layers3,
  Keyboard,
  ListFilter,
  LocateFixed,
  Lock,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  Minus,
  Minimize2,
  Monitor,
  Moon,
  MousePointer2,
  Palette,
  Pencil,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  RectangleHorizontal,
  Redo2,
  RefreshCw,
  Ruler,
  RotateCcw,
  RotateCcwSquare,
  RotateCw,
  Save,
  Scaling,
  Search,
  Settings as SettingsIcon,
  Share2,
  ShieldCheck,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Sun,
  Tags,
  Triangle,
  Trash2,
  Type,
  Undo2,
  Unlock,
  UserRound,
  Users,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ANCHORS,
  ANNOTATION_POSITIONS,
  DEFAULT_TEXT_FONT,
  MARKER_COLORS,
  MARKER_SYMBOLS,
  PAPER_PRESETS,
  RESIZE_HANDLES,
  TEXT_ALIGNMENTS,
  TEXT_LAST_ALIGNMENTS,
  TEXT_VERTICAL_ALIGNMENTS,
  alignObjectsToKey,
  arrangeObjectsInGrid,
  boundsAnchorPoint,
  compactBoardStructure,
  createArtboardFromObjects,
  createBoard,
  createGuideGroup,
  createGroup,
  createId,
  createObjectDuplicate,
  createSourceInstance,
  createViewCapture,
  distributeObjectsByGap,
  ensureBoard,
  parseBoardFile,
  findCompositionsAffectedByObjectDeletion,
  initialMediaDimensions,
  markerKey,
  matchesFilters,
  minimumObjectDimension,
  moveObjectsByVisualStep,
  movePivotPreservingPlacement,
  objectIntersectsWorldRect,
  objectLocalPointToWorld,
  objectWorldCorners,
  objectsVisuallyOnArtboard,
  objectsForExport,
  reorderCapturesByVisualDrop,
  reorderObjectsByVisualDrop,
  resizeArtboardToPreset,
  resizeObjectToDimensions,
  restoreObjectSize,
  restoreViewCapture,
  resizeObjectFromHandle,
  resizeObjectsFromHandle,
  resizePivotAnchor,
  resizeTextFrameToDimension,
  resizeTransformFromHandle,
  resolveLayerSelection,
  rotateObjectsAroundPoint,
  safeFilename,
  shapeClipPath,
  shapePolygonPoints,
  selectionActionAnchorInViewport,
  selectionAspectLocked,
  selectionIdsForGuide,
  selectionIdsForObject,
  selectionWorldBounds,
  snapRotationDelta,
  sourceAssetsFromObjects,
  stampBoard,
  upsertMarkerBySymbol,
  viewObjectInViewport,
  viewWorldRectInViewport,
} from "./model.js";
import { mergeMoodboardLibrary } from "./library.js";
import { createRecoveredMoodboard, describeDriveConflict } from "./versioning.js";
import {
  localFileWritePermission,
  pickMoodboardLocalFile,
  shouldWriteLocalAutosaveFile,
  writeMoodboardToLocalFile,
} from "./local-file.js";
import {
  clearLocalMoodboardData,
  compactLocalRecoveryStorage,
  deleteVersion,
  describeLocalPersistenceError,
  enqueueSync,
  getLocalLibrarySummary,
  getSyncJob,
  listLocalBoards,
  loadLocalFileHandle,
  listSyncJobs,
  loadCurrentBoard,
  listVersions,
  recoverInterruptedSyncJobs,
  removeSyncJob,
  saveLocalFileHandle,
  saveCurrentBoard,
  saveVersion,
  setVersionPinned,
  updateSyncJob,
  upsertLocalBoard,
} from "./storage.js";
import {
  isCurrentStorageTargetOperation,
  loadStoragePreferences,
  saveStoragePreferences,
  setBoardStorageTarget,
  storageTargetForBoard,
} from "./storage-preferences.js";
import {
  DriveApiError,
  DriveConflictError,
  GOOGLE_DRIVE_SCOPE,
  contentByteLength,
  driveErrorMessage,
  evaluateDriveQuota,
  googleDriveTokenFromOAuthAccessToken,
  isGoogleDriveAuthorizationError,
  isGoogleDriveConfigured,
  isGoogleDriveRetryableError,
  isGoogleDriveTokenUsable,
  linkDriveFile,
  loadDriveState,
  saveDriveState,
  serializeMoodboardSnapshot,
} from "./drive-state.js";
import { driveSaveFailureFeedback } from "./drive-save-feedback.js";
import {
  createGoogleDriveMoodboardUrl,
  driveFileRole,
  drivePermissionRoleLabel,
  googleDriveGeneralAccess,
  googleDriveFileAccessUrl,
  googleDriveMembers,
  parseGoogleDriveMoodboardLink,
} from "./drive-share.js";
import {
  completeMoodboardEmailSignInLink,
  isMoodboardEmailSignInLink,
  linkMoodboardFacebook,
  linkMoodboardGoogle,
  moodboardAuthPreviewUser,
  observeMoodboardSession,
  pendingMoodboardEmailSignIn,
  sendMoodboardEmailSignInLink,
  signInMoodboardWithGoogle,
  signOutMoodboardSession,
} from "./auth.js";
import {
  PETFASHION_ACCOUNT_URL,
  PETFASHION_PRIVACY_URL,
  PETFASHION_TERMS_URL,
  accountDisplayName,
  accountInitials,
  accountProviderLabel,
  getMoodboardAccessReceipt,
  hasMoodboardAccessConsent,
  isMoodboardIdentityEligible,
  moodboardAuthErrorMessage,
  saveMoodboardAccessConsent,
  saveMoodboardMarketingPreference,
} from "./auth-policy.js";
import {
  cleanMoodboardEmailActionUrl,
  emailActionContextFromUrl,
  moodboardProviderStates,
} from "./email-auth-state.js";
import {
  ACTIVE_THEME_STORAGE_KEY,
  BUILT_IN_THEMES,
  DEFAULT_INTERFACE_THEME_ID,
  INTERFACE_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  interfaceThemeCssVariables,
  interfaceThemeMode,
  loadInterfaceModePreference,
  normalizeInterfaceMode,
  normalizeInterfaceTheme,
  parseInterfaceThemeFile,
  resolveInterfaceMode,
  resolveInterfaceThemeForMode,
  serializeInterfaceTheme,
} from "./theme.js";
import {
  activeObjectColorSet,
  addObjectColorToSet,
  createObjectColorSet,
  deleteObjectColorSet,
  loadObjectColorSets,
  mergeImportedObjectColorSets,
  normalizeObjectColor,
  OBJECT_COLOR_LIBRARY_LIMIT,
  OBJECT_COLOR_SETS_FILE_SIZE_LIMIT,
  parseObjectColorSetsFile,
  removeObjectColorFromSet,
  renameObjectColorSet,
  saveObjectColorSets,
  selectObjectColorSet,
  serializeObjectColorSets,
} from "./color-library.js";
import {
  CANVAS_BACKGROUND_STORAGE_KEY,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_INTERFACE_TYPOGRAPHY,
  UI_FONT_FAMILY_PRESETS,
  UI_FONT_SIZE_PRESETS,
  UI_TYPOGRAPHY_STORAGE_KEY,
  canvasBackgroundCssVariables,
  changeCanvasBackgroundMode,
  interfaceTypographyCssVariables,
  normalizeCanvasBackground,
  normalizeInterfaceTypography,
  resetCanvasBackgroundAppearance,
  resolveInterfaceTypography,
  toggleCanvasBackgroundVisibility,
} from "./ui-preferences.js";
import { resolveSmartAlignment, selectionSpacingMeasurements } from "./alignment.js";
import {
  APP_RELEASE_DATE,
  APP_RELEASE_NOTES_URL,
  APP_UPDATE_ATTEMPT_STORAGE_KEY,
  APP_UPDATE_MANIFEST_URL,
  APP_VERSION,
  APP_VERSION_LABEL,
  buildUpdateReloadUrl,
  compareSemanticVersions,
  isAppUpdateSnoozed,
  loadUpdatePreference,
  normalizeUpdateManifest,
  resolveUpdateNotesUrl,
  saveUpdatePreference,
  snoozeAppUpdate,
} from "./version.js";
import {
  INTERFACE_LOCALES,
  INTERFACE_LOCALE_STORAGE_KEY,
  applyLocalizedDocumentMetadata,
  detectInterfaceLocale,
  interfaceLocaleToIntl,
  loadInterfaceLocalePreference,
  localizedDefaultBoardName,
  localizeInterfaceDom,
  normalizeInterfaceLocale,
  setActiveInterfaceLocale,
  translateInterfaceText,
} from "./i18n.js";
import {
  RULER_UNITS,
  buildCanvasGridMetrics,
  buildRulerTicks,
  clampCanvasToolbarPosition,
  formatGuideValue,
  matchesListQuery,
  normalizeCanvasToolbarPosition,
  normalizeRulerUnit,
  resolveDraggedGuidePosition,
  resolveGuidePosition,
  shouldConfirmEscapeCancellation,
} from "./workspace-tools.js";
import { isEditableShortcutEvent, objectNudgeDelta, nudgeSelectedObjects } from "./workspace-keyboard.js";
import {
  fitSourceView,
  panSourceView,
  zoomSourceViewAtPoint,
} from "./source-view.js";
import "./styles.css";

const loadAssetExportRuntime = () => import("./asset-export.js");
const loadDriveRuntime = () => import("./drive-storage.js");
const loadDrivePickerRuntime = () => import("./drive-picker.js");
const loadOutputRuntime = () => import("./output.js");
const loadPortableRuntime = () => import("./portable.js");
const LazyMicro3DActiveControls = React.lazy(() => import("./micro3d-ui.jsx").then((module) => ({ default: module.Micro3DActiveControls })));
const LazyRotation3DGizmo = React.lazy(() => import("./micro3d-ui.jsx").then((module) => ({ default: module.Rotation3DGizmo })));

const MARKER_ICONS = {
  heart: Heart,
  star: Star,
  sparkle: Sparkles,
  diamond: Diamond,
  circle: Circle,
  flag: Flag,
};

const MARKER_LABELS = {
  heart: "愛心",
  star: "星星",
  sparkle: "亮點",
  diamond: "菱形",
  circle: "圓點",
  flag: "旗標",
};

const MARKER_COLOR_VALUES = {
  white: "#ffffff",
  cyan: "#58e6ff",
  pink: "#ff8fc7",
  amber: "#f3b75f",
  green: "#7df0b1",
  violet: "#b99cff",
  red: "#ff776f",
};

const MARKER_COLOR_LABELS = {
  white: "白色",
  cyan: "青色",
  pink: "粉色",
  amber: "琥珀",
  green: "綠色",
  violet: "紫色",
  red: "紅色",
};

const DEFAULT_FILTERS = { symbols: [], colors: [], mode: "any" };
const EMPTY_DRIVE_SHARING = Object.freeze({
  status: "idle",
  message: "",
  fileId: "",
  fileName: "",
  resourceKey: "",
  shareUrl: "",
  webViewLink: "",
  role: "",
  canEdit: false,
  canShare: false,
  permissionsVisible: false,
  permissions: [],
  members: [],
  generalAccess: { enabled: false, permissionId: "", role: "viewer" },
});

function isSharedDriveFileAccessError(error) {
  const reason = error?.reason || error?.details?.error?.errors?.[0]?.reason || "";
  return error?.status === 404
    || ["appNotAuthorizedToFile", "insufficientFilePermissions", "notFound"].includes(reason);
}
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 4;
const DRIVE_LOCAL_RECOVERY_TIMEOUT_MS = 30_000;
const DRIVE_QUEUE_TIMEOUT_MS = 10_000;
const SESSION_ADJECTIVES = ["青色", "安靜", "敏捷", "明亮", "琥珀", "深夜"];
const SESSION_NOUNS = ["編輯者", "觀察者", "整理者", "策展人", "設計者", "夥伴"];

function withOperationTimeout(promise, timeoutMs, createError) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(createError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => globalThis.clearTimeout(timeoutId));
}

const FONT_OPTIONS = [
  { label: "介面黑體", value: DEFAULT_TEXT_FONT },
  { label: "思源黑體", value: '"Noto Sans TC", "Source Han Sans TC", "PingFang TC", sans-serif' },
  { label: "思源宋體", value: '"Noto Serif TC", "Source Han Serif TC", "Songti TC", serif' },
  { label: "蘋方／微軟正黑", value: '"PingFang TC", "Microsoft JhengHei", sans-serif' },
  { label: "系統宋體", value: '"Songti TC", "PMingLiU", serif' },
  { label: "等寬字體", value: '"JetBrains Mono", "SFMono-Regular", monospace' },
];

function localFontCssValue(family) {
  return `"${String(family).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

const FONT_WEIGHTS = [
  ["300", "細體"],
  ["400", "一般"],
  ["500", "中等"],
  ["600", "半粗"],
  ["700", "粗體"],
  ["800", "特粗"],
  ["900", "黑體"],
];

const TEXT_ALIGN_CONTROLS = [
  { value: "left", label: "向左", accessibleLabel: "文字向左對齊", Icon: AlignLeft },
  { value: "center", label: "置中", accessibleLabel: "文字置中對齊", Icon: AlignCenter },
  { value: "right", label: "向右", accessibleLabel: "文字向右對齊", Icon: AlignRight },
  { value: "justify", label: "齊行", accessibleLabel: "文字左右齊行", Icon: AlignJustify },
];

const TEXT_LAST_ALIGN_CONTROLS = TEXT_ALIGN_CONTROLS.filter(({ value }) => value !== "justify");

const TEXT_VERTICAL_ALIGN_CONTROLS = [
  { value: "top", label: "向上", accessibleLabel: "文字在文字框內向上對齊", Icon: AlignStartHorizontal },
  { value: "middle", label: "置中", accessibleLabel: "文字在文字框內上下置中", Icon: AlignCenterHorizontal },
  { value: "bottom", label: "向下", accessibleLabel: "文字在文字框內向下對齊", Icon: AlignEndHorizontal },
];

const TEXT_FRAME_HANDLES = [
  { key: "width", handle: "e", dimension: "width", x: 1, y: 0.72, label: "文字內容寬度" },
  { key: "height", handle: "s", dimension: "height", x: 0.72, y: 1, label: "文字內容高度" },
];

const SHAPE_LABELS = {
  rectangle: "矩形",
  triangle: "三角形",
  polygon: "多邊形",
  star: "星形",
};

const SHAPE_PRINT_SIZE_PRESETS = Object.entries(PAPER_PRESETS)
  .filter(([, preset]) => preset.width && preset.height)
  .flatMap(([key, preset]) => [
    { id: `${key}-portrait`, label: `${preset.label} · ${preset.width} × ${preset.height}`, width: preset.width, height: preset.height },
    { id: `${key}-landscape`, label: `${preset.label} · ${preset.height} × ${preset.width}`, width: preset.height, height: preset.width },
  ]);

const SHAPE_SOCIAL_SIZE_PRESETS = [
  { id: "social-square", label: "正方形貼文", width: 1080, height: 1080 },
  { id: "social-portrait", label: "直式貼文", width: 1080, height: 1350 },
  { id: "social-story", label: "限時動態／短影音", width: 1080, height: 1920 },
  { id: "social-share", label: "橫式分享圖", width: 1200, height: 630 },
  { id: "social-video", label: "16:9 影片封面", width: 1920, height: 1080 },
];

const STAR_STYLE_PRESETS = [
  { id: "classic", label: "經典", starPoints: 5, starInnerRatio: 0.42 },
  { id: "sharp", label: "銳利", starPoints: 5, starInnerRatio: 0.24 },
  { id: "full", label: "飽滿", starPoints: 5, starInnerRatio: 0.64 },
  { id: "burst", label: "放射", starPoints: 12, starInnerRatio: 0.32 },
];

const LAYER_TYPE_FILTERS = [
  ["all", "全部"],
  ["guide", "導引線"],
  ["artboard", "紙張"],
  ["group", "群組"],
  ["text", "文字"],
  ["media", "素材"],
  ["shape", "形狀"],
];

const ANNOTATION_POSITION_LABELS = {
  tl: "左上外側",
  tc: "上方置中",
  tr: "右上外側",
  ml: "左側置中",
  mr: "右側置中",
  bl: "左下外側",
  bc: "下方置中",
  br: "右下外側",
};

const LEFT_PANEL_MIN_WIDTH = 300;
const LEFT_PANEL_MAX_WIDTH = 560;
const RIGHT_PANEL_MIN_WIDTH = 260;
const RIGHT_PANEL_MAX_WIDTH = 560;
const THEME_COLOR_FIELDS = [
  ["background", "整體背景"],
  ["panel", "面板"],
  ["canvas", "畫布"],
  ["text", "主要文字"],
  ["muted", "次要文字"],
  ["accent", "強調色"],
];
const LAST_LIGHT_THEME_STORAGE_KEY = "infinite-moodboard-last-light-theme-v1";
const LAST_DARK_THEME_STORAGE_KEY = "infinite-moodboard-last-dark-theme-v1";
const RULERS_VISIBLE_STORAGE_KEY = "infinite-moodboard-rulers-visible-v1";
const GUIDES_VISIBLE_STORAGE_KEY = "infinite-moodboard-guides-visible-v1";
const RULER_UNIT_STORAGE_KEY = "infinite-moodboard-ruler-unit-v1";
const CANVAS_TOOLBAR_POSITION_STORAGE_KEY = "infinite-moodboard-canvas-toolbar-position-v1";
const RULER_SIZE = 22;

function currentSystemInterfaceMode() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, String(value || ""));
  } catch {
    // Session storage can be unavailable without preventing safe local editing.
  }
}

const SHORTCUT_SECTIONS = [
  {
    title: "檔案與編輯",
    items: [
      ["mod+S", "儲存工作檔"],
      ["mod+O", "開啟工作檔"],
      ["mod+Z", "復原"],
      ["mod+shift+Z", "重做"],
      ["mod+A", "選取全部可見物件"],
      ["mod+C", "複製選取物件"],
      ["mod+X", "剪下選取物件"],
      ["mod+V", "貼上物件或媒體"],
      ["mod+F", "搜尋目前列表"],
    ],
  },
  {
    title: "工具與物件",
    items: [
      ["shift+V", "選取工具"],
      ["shift+H", "平移工具"],
      ["shift+3", "切換進階 3D"],
      ["shift+D", "複製選取物件"],
      ["shift+G", "建立或解散群組"],
      ["Space", "暫時平移畫布"],
      ["Shift", "平移工具中暫時選取"],
      ["Delete", "刪除選取物件"],
    ],
  },
  {
    title: "工作區顯示",
    items: [
      ["shift+R", "顯示或隱藏尺規"],
      ["shift+;", "顯示或隱藏輔助導引線"],
      ["shift+'", "顯示或隱藏格點／格線"],
      ["shift+[", "顯示或隱藏左側欄"],
      ["shift+]", "顯示或隱藏右側欄"],
      ["shift+\\", "顯示或隱藏兩側欄"],
      ["shift+F", "切換專注模式"],
      ["?", "顯示或隱藏快速鍵"],
      ["Escape", "取消目前操作或關閉最上層介面"],
    ],
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getLeftPanelMaxWidth(rightWidth = 304) {
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  if (viewportWidth <= 900) return LEFT_PANEL_MAX_WIDTH;
  return Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(LEFT_PANEL_MAX_WIDTH, viewportWidth - rightWidth - 300));
}

function normalizeLeftPanelWidth(value, rightWidth = 304) {
  return Math.round(clamp(Number(value) || LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MIN_WIDTH, getLeftPanelMaxWidth(rightWidth)));
}

function getRightPanelMaxWidth(leftWidth = LEFT_PANEL_MIN_WIDTH) {
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  if (viewportWidth <= 900) return RIGHT_PANEL_MAX_WIDTH;
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(RIGHT_PANEL_MAX_WIDTH, viewportWidth - leftWidth - 300));
}

function normalizeRightPanelWidth(value, leftWidth = LEFT_PANEL_MIN_WIDTH) {
  return Math.round(clamp(Number(value) || 304, RIGHT_PANEL_MIN_WIDTH, getRightPanelMaxWidth(leftWidth)));
}

function loadStoredInterfaceThemes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((theme) => theme && typeof theme === "object")
      .map((theme) => normalizeInterfaceTheme({ ...theme, builtin: false }));
  } catch {
    return [];
  }
}

function loadStoredInterfaceTypography() {
  try {
    return normalizeInterfaceTypography(JSON.parse(localStorage.getItem(UI_TYPOGRAPHY_STORAGE_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_INTERFACE_TYPOGRAPHY };
  }
}

function loadStoredCanvasBackground() {
  try {
    return normalizeCanvasBackground(JSON.parse(localStorage.getItem(CANVAS_BACKGROUND_STORAGE_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_CANVAS_BACKGROUND };
  }
}

function loadStoredCanvasToolbarPosition() {
  try {
    return normalizeCanvasToolbarPosition(JSON.parse(localStorage.getItem(CANVAS_TOOLBAR_POSITION_STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat(interfaceLocaleToIntl(), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStorageSize(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = -1;
  do {
    amount /= 1024;
    unit += 1;
  } while (amount >= 1024 && unit < units.length - 1);
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function createSessionName() {
  const adjective = SESSION_ADJECTIVES[Math.floor(Math.random() * SESSION_ADJECTIVES.length)];
  const noun = SESSION_NOUNS[Math.floor(Math.random() * SESSION_NOUNS.length)];
  const separator = interfaceLocaleToIntl().startsWith("en") ? " " : "";
  return `${translateInterfaceText(adjective)}${separator}${translateInterfaceText(noun)}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`無法讀取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error("圖片解碼逾時，請重新匯入這張圖片。")), 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("圖片格式無法讀取。"));
    };
    image.src = src;
  });
}

function loadVideoElement(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timer = window.setTimeout(() => reject(new Error("影片解碼逾時，請重新匯入這段影片。")), 12000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(video);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("影片格式無法讀取。"));
    };
    video.src = src;
  });
}

function isVideoObject(object) {
  return object?.type === "video" || object?.mime?.startsWith("video/");
}

function isTextObject(object) {
  return object?.type === "text";
}

function textLayoutStyle(object) {
  const textAlign = TEXT_ALIGNMENTS.includes(object?.textAlign) ? object.textAlign : "left";
  const textAlignLast = TEXT_LAST_ALIGNMENTS.includes(object?.textAlignLast) ? object.textAlignLast : "left";
  const textVerticalAlign = TEXT_VERTICAL_ALIGNMENTS.includes(object?.textVerticalAlign) ? object.textVerticalAlign : "top";
  return {
    display: "flex",
    flexDirection: "column",
    justifyContent: { top: "flex-start", middle: "safe center", bottom: "safe flex-end" }[textVerticalAlign],
    textAlign,
    textAlignLast: textAlign === "justify" ? textAlignLast : "auto",
    lineHeight: Number(object?.lineHeight) || 1.2,
  };
}

function objectDisplayText(object) {
  if (!isTextObject(object)) return "";
  if (object.textFlowId && typeof object.flowText === "string") return object.flowText;
  return typeof object.text === "string" ? object.text : "";
}

function isShapeObject(object) {
  return object?.type === "shape";
}

function isArtboardObject(object) {
  return object?.type === "artboard";
}

function isSvgFile(file) {
  return file?.type === "image/svg+xml" || /\.svg$/i.test(file?.name || "");
}

function createTextMeasurementNode(object, overrides = {}) {
  const measuringNode = document.createElement("div");
  Object.assign(measuringNode.style, {
    boxSizing: "border-box",
    contain: "layout style",
    fontFamily: object.fontFamily || DEFAULT_TEXT_FONT,
    fontSize: `${Math.max(6, Number(object.fontSize) || 32)}px`,
    fontWeight: String(object.fontWeight || "600"),
    height: `${Math.max(24, Number(object.height) || 24)}px`,
    left: "-100000px",
    lineHeight: String(Number(object.lineHeight) || 1.2),
    margin: "0",
    maxWidth: "none",
    overflow: "hidden",
    overflowWrap: "anywhere",
    padding: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    width: `${Math.max(24, Number(object.width) || 24)}px`,
    textAlign: textLayoutStyle(object).textAlign,
    textAlignLast: textLayoutStyle(object).textAlignLast,
    ...overrides,
  });
  document.body.appendChild(measuringNode);
  return measuringNode;
}

function setMeasuredText(node, text) {
  const value = String(text || "");
  node.textContent = value ? `${value}${value.endsWith("\n") ? "\u200b" : ""}` : "\u200b";
}

function textGraphemes(value) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("zh-Hant", { granularity: "grapheme" });
    return [...segmenter.segment(value)].map((segment) => segment.segment);
  }
  return Array.from(value);
}

function splitTextForFrame(object, text) {
  const source = String(text || "");
  if (!source || typeof document === "undefined") return { fitted: source, overflow: "" };
  const measuringNode = createTextMeasurementNode(object);
  const fits = (candidate) => {
    setMeasuredText(measuringNode, candidate);
    return measuringNode.scrollHeight <= measuringNode.clientHeight + 1
      && measuringNode.scrollWidth <= measuringNode.clientWidth + 1;
  };
  if (fits(source)) {
    measuringNode.remove();
    return { fitted: source, overflow: "" };
  }

  const characters = textGraphemes(source);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(characters.slice(0, middle).join(""))) low = middle;
    else high = middle - 1;
  }
  measuringNode.remove();
  return {
    fitted: characters.slice(0, low).join(""),
    overflow: characters.slice(low).join(""),
  };
}

function reflowTextThreads(objects) {
  if (typeof document === "undefined") return objects;
  const groups = new Map();
  objects.forEach((object, index) => {
    if (!isTextObject(object) || !object.textFlowId) return;
    const group = groups.get(object.textFlowId) || [];
    group.push({ object, index });
    groups.set(object.textFlowId, group);
  });
  if (!groups.size) return objects;

  const updates = new Map();
  groups.forEach((frames) => {
    frames.sort((left, right) => (left.object.textFlowOrder - right.object.textFlowOrder) || (left.index - right.index));
    const story = String(frames[0]?.object.text || "");
    let remainder = story;
    frames.forEach(({ object }, index) => {
      const result = splitTextForFrame(object, remainder);
      remainder = result.overflow;
      const textFlowOverflow = index === frames.length - 1 && Boolean(remainder);
      if (object.text !== story || object.flowText !== result.fitted || object.textFlowOverflow !== textFlowOverflow || object.textFlowOrder !== index) {
        updates.set(object.id, {
          ...object,
          text: story,
          flowText: result.fitted,
          textFlowOverflow,
          textFlowOrder: index,
        });
      }
    });
  });
  return updates.size ? objects.map((object) => updates.get(object.id) || object) : objects;
}

function measureTextFrameContent(object, dimension) {
  if (typeof document === "undefined") return Math.max(24, Number(object?.[dimension]) || 24);
  const measuringNode = createTextMeasurementNode(object, { height: "auto", overflow: "visible" });
  setMeasuredText(measuringNode, objectDisplayText(object));
  if (dimension === "width") {
    measuringNode.style.width = "max-content";
    measuringNode.style.whiteSpace = "pre";
    measuringNode.style.overflowWrap = "normal";
  } else {
    measuringNode.style.width = `${Math.max(24, Number(object.width) || 24)}px`;
    measuringNode.style.whiteSpace = "pre-wrap";
    measuringNode.style.overflowWrap = "anywhere";
  }
  const rect = measuringNode.getBoundingClientRect();
  const measured = dimension === "width"
    ? Math.max(rect.width, measuringNode.scrollWidth)
    : Math.max(rect.height, measuringNode.scrollHeight);
  measuringNode.remove();
  return Math.max(24, Math.ceil(measured) + 1);
}

async function mediaFileToObject(file, point, index) {
  const svgFile = isSvgFile(file);
  const readableFile = svgFile && !file.type ? new Blob([file], { type: "image/svg+xml" }) : file;
  const src = await readFileAsDataUrl(readableFile);
  const isVideo = file.type.startsWith("video/");
  const media = isVideo ? await loadVideoElement(src) : await loadImageElement(src);
  const naturalWidth = (isVideo ? media.videoWidth : media.naturalWidth) || 320;
  const naturalHeight = (isVideo ? media.videoHeight : media.naturalHeight) || 240;
  const { width, height } = initialMediaDimensions(naturalWidth, naturalHeight, { isVideo });
  const baseName = file.name.replace(/\.[^.]+$/, "") || `${translateInterfaceText("素材")} ${index + 1}`;
  const now = new Date().toISOString();

  return {
    id: createId("object"),
    sourceId: createId("source"),
    type: isVideo ? "video" : "image",
    name: baseName,
    layerName: baseName,
    src,
    mime: file.type || (isVideo ? "video/mp4" : svgFile ? "image/svg+xml" : "image/png"),
    originalFilename: file.name || `${baseName}.png`,
    pivotX: point.x + index * 36,
    pivotY: point.y + index * 36,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    aspectLocked: true,
    rotation: 0,
    tiltX: 0,
    tiltY: 0,
    depth: 0,
    perspective: 1000,
    videoControlsVisible: true,
    anchor: "mc",
    markers: [],
    visible: true,
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createTextObject(point) {
  const now = new Date().toISOString();
  const textName = translateInterfaceText("文字");
  const textValue = translateInterfaceText("輸入文字");
  return {
    id: createId("object"),
    type: "text",
    name: textName,
    layerName: textName,
    src: "",
    mime: "text/plain",
    originalFilename: `${textName}.txt`,
    pivotX: point.x,
    pivotY: point.y,
    width: 320,
    height: 120,
    originalWidth: 320,
    originalHeight: 120,
    aspectLocked: true,
    rotation: 0,
    tiltX: 0,
    tiltY: 0,
    depth: 0,
    perspective: 1000,
    anchor: "mc",
    text: textValue,
    fontFamily: DEFAULT_TEXT_FONT,
    fontWeight: "600",
    fontSize: 36,
    lineHeight: 1.3,
    originalFontSize: 36,
    color: "#edf7fb",
    textAlign: "left",
    textAlignLast: "left",
    textVerticalAlign: "top",
    markers: [],
    visible: true,
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createAnnotationObject(targetObjects, options = {}) {
  const bounds = selectionWorldBounds(targetObjects);
  if (!bounds) return null;
  const kind = options.kind === "description" ? "description" : "title";
  const position = ANNOTATION_POSITIONS.includes(options.position) ? options.position : "tl";
  const gap = Math.max(0, Number(options.gap) || 16);
  const width = Math.max(180, Math.min(460, kind === "title" ? bounds.width : Math.max(280, bounds.width * 0.72)));
  const height = kind === "title" ? 58 : 96;
  const horizontal = position[1];
  const vertical = position[0];
  let centerX = bounds.centerX;
  let centerY = bounds.centerY;
  if (horizontal === "l") centerX = bounds.left + width / 2;
  if (horizontal === "r") centerX = bounds.right - width / 2;
  if (vertical === "t") centerY = bounds.top - gap - height / 2;
  if (vertical === "b") centerY = bounds.bottom + gap + height / 2;
  if (position === "ml") centerX = bounds.left - gap - width / 2;
  if (position === "mr") centerX = bounds.right + gap + width / 2;
  const object = createTextObject({ x: centerX, y: centerY });
  const text = String(options.text || "").trim() || translateInterfaceText(kind === "title" ? "標題" : "說明文字");
  return {
    ...object,
    name: text,
    layerName: text,
    text,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    fontSize: kind === "title" ? 28 : 18,
    originalFontSize: kind === "title" ? 28 : 18,
    fontWeight: kind === "title" ? "700" : "400",
    annotationKind: kind,
    annotationPosition: position,
    annotationTargetIds: targetObjects.map((target) => target.id),
    artboardId: null,
  };
}

function createShapeObject(kind, point) {
  const now = new Date().toISOString();
  const preset = {
    square: { shapeKind: "rectangle", name: "正方形", width: 180, height: 180 },
    rectangle: { shapeKind: "rectangle", name: "矩形", width: 260, height: 160 },
    triangle: { shapeKind: "triangle", name: "三角形", width: 190, height: 170 },
    polygon: { shapeKind: "polygon", name: "六邊形", width: 190, height: 170 },
    star: { shapeKind: "star", name: "星形", width: 190, height: 190 },
  }[kind] || { shapeKind: "rectangle", name: "矩形", width: 260, height: 160 };
  const localizedName = translateInterfaceText(preset.name);
  return {
    id: createId("object"),
    type: "shape",
    name: localizedName,
    layerName: localizedName,
    src: "",
    mime: "image/svg+xml",
    originalFilename: `${localizedName}.svg`,
    pivotX: point.x,
    pivotY: point.y,
    width: preset.width,
    height: preset.height,
    originalWidth: preset.width,
    originalHeight: preset.height,
    aspectLocked: true,
    rotation: 0,
    tiltX: 0,
    tiltY: 0,
    depth: 0,
    perspective: 1000,
    anchor: "mc",
    shapeKind: preset.shapeKind,
    shapeSides: 6,
    starPoints: 5,
    starInnerRatio: 0.42,
    fill: "#58e6ff",
    markers: [],
    visible: true,
    locked: false,
    createdAt: now,
    updatedAt: now,
  };
}

function shapeSvgPoints(object) {
  const points = shapePolygonPoints(object);
  if (!points) return "";
  return points.map(([x, y]) => `${Number((x * 100).toFixed(3))},${Number((y * 100).toFixed(3))}`).join(" ");
}

function waitForVideoFrame(video, timeout = 7000) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
    return Promise.resolve(video);
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("影片影格載入逾時。")), timeout);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
    };
    const finish = (error) => {
      cleanup();
      if (error) reject(error);
      else resolve(video);
    };
    const onReady = () => {
      if (video.videoWidth && video.videoHeight) finish();
    };
    const onError = () => finish(new Error("影片影格無法讀取。"));
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
  });
}

async function captureVideoFrame(object) {
  const liveObject = [...document.querySelectorAll(".board-object[data-object-id]")]
    .find((element) => element.dataset.objectId === object.id);
  let video = liveObject?.querySelector("video") || null;
  let temporaryVideo = null;

  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    temporaryVideo = document.createElement("video");
    temporaryVideo.muted = true;
    temporaryVideo.playsInline = true;
    temporaryVideo.preload = "auto";
    temporaryVideo.src = object.src;
    temporaryVideo.load();
    video = temporaryVideo;
  }

  try {
    await waitForVideoFrame(video);
    const sourceWidth = Math.max(1, video.videoWidth);
    const sourceHeight = Math.max(1, video.videoHeight);
    const sizeScale = Math.min(1, 2048 / sourceWidth, 2048 / sourceHeight);
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = Math.max(1, Math.round(sourceWidth * sizeScale));
    frameCanvas.height = Math.max(1, Math.round(sourceHeight * sizeScale));
    const frameContext = frameCanvas.getContext("2d", { alpha: false });
    if (!frameContext) throw new Error("瀏覽器無法建立影片影格畫布。");
    frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    return frameCanvas.toDataURL("image/png");
  } catch (error) {
    throw new Error(`影片「${object.name}」的目前影格無法擷取；請先播放到想輸出的畫面再重試。`, { cause: error });
  } finally {
    if (temporaryVideo) {
      temporaryVideo.removeAttribute("src");
      temporaryVideo.load();
    }
  }
}

function wrapCanvasText(context, value, maxWidth) {
  const paragraphs = String(value || "").replaceAll("\r\n", "\n").split("\n");
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const characters = Array.from(paragraph);
    if (!characters.length) {
      lines.push({ text: "", paragraphEnd: true });
      return;
    }
    let current = "";
    characters.forEach((character) => {
      const candidate = `${current}${character}`;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push({ text: current, paragraphEnd: false });
        current = character;
      } else {
        current = candidate;
      }
    });
    lines.push({ text: current, paragraphEnd: true });
  });
  return lines;
}

function drawJustifiedCanvasText(context, text, width, y) {
  const characters = Array.from(text);
  if (characters.length < 2) {
    context.textAlign = "left";
    context.fillText(text, 0, y);
    return;
  }
  const glyphWidths = characters.map((character) => context.measureText(character).width);
  const gap = Math.max(0, (width - glyphWidths.reduce((sum, value) => sum + value, 0)) / (characters.length - 1));
  let x = 0;
  context.textAlign = "left";
  characters.forEach((character, index) => {
    context.fillText(character, x, y);
    x += glyphWidths[index] + gap;
  });
}

function drawTextObjectSource(context, object, width, height) {
  const fontSize = Math.max(6, Number(object.fontSize) || 32);
  const lineHeight = fontSize * (Number(object.lineHeight) || 1.2);
  const alignment = TEXT_ALIGNMENTS.includes(object.textAlign) ? object.textAlign : "left";
  const lastAlignment = TEXT_LAST_ALIGNMENTS.includes(object.textAlignLast) ? object.textAlignLast : "left";
  const verticalAlignment = TEXT_VERTICAL_ALIGNMENTS.includes(object.textVerticalAlign) ? object.textVerticalAlign : "top";
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.fillStyle = object.color || "#edf7fb";
  context.font = `${object.fontWeight || "600"} ${fontSize}px ${object.fontFamily || DEFAULT_TEXT_FONT}`;
  context.textBaseline = "top";
  const lines = wrapCanvasText(context, objectDisplayText(object), width);
  const maxLines = Math.max(1, Math.floor(height / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const contentHeight = visibleLines.length * lineHeight;
  const startY = verticalAlignment === "bottom"
    ? Math.max(0, height - contentHeight)
    : verticalAlignment === "middle"
    ? Math.max(0, (height - contentHeight) / 2)
    : 0;

  visibleLines.forEach((line, index) => {
    const y = startY + index * lineHeight + (lineHeight - fontSize) / 2;
    if (alignment === "justify" && !line.paragraphEnd) {
      drawJustifiedCanvasText(context, line.text, width, y);
      return;
    }
    const lineAlignment = alignment === "justify" ? lastAlignment : alignment;
    context.textAlign = lineAlignment;
    const x = lineAlignment === "center" ? width / 2 : lineAlignment === "right" ? width : 0;
    context.fillText(line.text, x, y);
  });
  context.restore();
}

function drawShapeObjectSource(context, object, width, height) {
  const normalizedPoints = shapePolygonPoints(object);
  context.fillStyle = object.fill || "#58e6ff";
  context.beginPath();
  if (normalizedPoints) {
    normalizedPoints.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x * width, y * height);
      else context.lineTo(x * width, y * height);
    });
    context.closePath();
  } else if (typeof context.roundRect === "function") {
    context.roundRect(width * 0.01, height * 0.01, width * 0.98, height * 0.98, Math.min(width, height) * 0.02);
  } else {
    context.rect(width * 0.01, height * 0.01, width * 0.98, height * 0.98);
  }
  context.fill();
}

async function createObjectSourceCanvas(object, sourceOverride, renderScale) {
  const width = Math.max(1, Number(object.width) || 1);
  const height = Math.max(1, Number(object.height) || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * renderScale));
  canvas.height = Math.max(1, Math.ceil(height * renderScale));
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error(`無法建立「${object.name}」的輸出畫布。`);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.scale(canvas.width / width, canvas.height / height);

  if (isArtboardObject(object)) {
    context.fillStyle = object.fill || "#fffdf7";
    context.fillRect(0, 0, width, height);
  } else if (isTextObject(object)) {
    drawTextObjectSource(context, object, width, height);
  } else if (isShapeObject(object)) {
    drawShapeObjectSource(context, object, width, height);
  } else {
    const image = await loadImageElement(sourceOverride || object.src);
    context.drawImage(image, 0, 0, width, height);
  }
  return canvas;
}

function objectHasMicro3D(object) {
  return Math.abs(Number(object.tiltX) || 0) > 0.01
    || Math.abs(Number(object.tiltY) || 0) > 0.01
    || Math.abs(Number(object.depth) || 0) > 0.01
    || Math.abs((Number(object.perspective) || 1000) - 1000) > 0.01;
}

function drawFlatCompositionObject(context, source, object, bounds, padding, renderScale) {
  const anchor = ANCHORS[object.anchor] || ANCHORS.mc;
  const width = Math.max(1, Number(object.width) || 1);
  const height = Math.max(1, Number(object.height) || 1);
  context.save();
  context.translate(
    (Number(object.pivotX) - bounds.left + padding) * renderScale,
    (Number(object.pivotY) - bounds.top + padding) * renderScale,
  );
  context.rotate(((Number(object.rotation) || 0) * Math.PI) / 180);
  context.drawImage(
    source,
    -anchor.x * width * renderScale,
    -anchor.y * height * renderScale,
    width * renderScale,
    height * renderScale,
  );
  context.restore();
}

function expandTriangle(points, amount = 0.45) {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (dx / length) * amount, y: point.y + (dy / length) * amount };
  });
}

function drawImageTriangle(context, image, sourcePoints, destinationPoints) {
  const [s0, s1, s2] = sourcePoints;
  const [d0, d1, d2] = destinationPoints;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 0.000001) return;
  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;
  const clipPoints = expandTriangle(destinationPoints);

  context.save();
  context.beginPath();
  context.moveTo(clipPoints[0].x, clipPoints[0].y);
  context.lineTo(clipPoints[1].x, clipPoints[1].y);
  context.lineTo(clipPoints[2].x, clipPoints[2].y);
  context.closePath();
  context.clip();
  context.transform(a, b, c, d, e, f);
  context.drawImage(image, 0, 0);
  context.restore();
}

function drawProjectedCompositionObject(context, source, object, bounds, padding, renderScale) {
  const width = Math.max(1, Number(object.width) || 1);
  const height = Math.max(1, Number(object.height) || 1);
  const divisions = Math.min(24, Math.max(8, Math.ceil(Math.max(width, height) / 48)));
  const destinationPoint = (x, y) => {
    const worldPoint = objectLocalPointToWorld(object, { x, y });
    return {
      x: (worldPoint.x - bounds.left + padding) * renderScale,
      y: (worldPoint.y - bounds.top + padding) * renderScale,
    };
  };

  for (let row = 0; row < divisions; row += 1) {
    const top = (row / divisions) * height;
    const bottom = ((row + 1) / divisions) * height;
    const sourceTop = (row / divisions) * source.height;
    const sourceBottom = ((row + 1) / divisions) * source.height;
    for (let column = 0; column < divisions; column += 1) {
      const left = (column / divisions) * width;
      const right = ((column + 1) / divisions) * width;
      const sourceLeft = (column / divisions) * source.width;
      const sourceRight = ((column + 1) / divisions) * source.width;
      const d00 = destinationPoint(left, top);
      const d10 = destinationPoint(right, top);
      const d11 = destinationPoint(right, bottom);
      const d01 = destinationPoint(left, bottom);
      const s00 = { x: sourceLeft, y: sourceTop };
      const s10 = { x: sourceRight, y: sourceTop };
      const s11 = { x: sourceRight, y: sourceBottom };
      const s01 = { x: sourceLeft, y: sourceBottom };
      drawImageTriangle(context, source, [s00, s10, s11], [d00, d10, d11]);
      drawImageTriangle(context, source, [s00, s11, s01], [d00, d11, d01]);
    }
  }
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error(`${mime} 編碼失敗。`));
      else resolve(blob);
    }, mime, quality);
  });
}

let avifEncoderModulePromise = null;

async function encodeAvifImageData(imageData) {
  if (!avifEncoderModulePromise) {
    avifEncoderModulePromise = Promise.all([
      import("@jsquash/avif/codec/enc/avif_enc.js"),
      import("@jsquash/avif/meta.js"),
    ]).then(async ([codec, meta]) => ({
      module: await codec.default({ noInitialRun: true }),
      options: meta.defaultOptions,
    }));
  }
  const encoder = await avifEncoderModulePromise;
  const rgba = new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
  const output = encoder.module.encode(rgba, imageData.width, imageData.height, {
    ...encoder.options,
    quality: 62,
    speed: 6,
  });
  if (!output) throw new Error("AVIF 編碼失敗。");
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

async function encodeCompositionCanvas(canvas, format) {
  const { buildImagePdf, compositionOutputFormat } = await loadOutputRuntime();
  const config = compositionOutputFormat(format);
  if (format === "pdf") {
    const pdfCanvas = document.createElement("canvas");
    pdfCanvas.width = canvas.width;
    pdfCanvas.height = canvas.height;
    const context = pdfCanvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("瀏覽器無法建立 PDF 畫布。");
    context.fillStyle = "#090e13";
    context.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    context.drawImage(canvas, 0, 0);
    const jpeg = await canvasToBlob(pdfCanvas, "image/jpeg", 0.94);
    const pdfBytes = buildImagePdf(await jpeg.arrayBuffer(), pdfCanvas.width, pdfCanvas.height);
    return new Blob([pdfBytes], { type: config.mime });
  }

  if (format === "avif") {
    const nativeBlob = await canvasToBlob(canvas, config.mime, 0.9);
    if (nativeBlob.type === config.mime) return nativeBlob;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("瀏覽器無法讀取 AVIF 畫布。");
    const encoded = await encodeAvifImageData(context.getImageData(0, 0, canvas.width, canvas.height));
    return new Blob([encoded], { type: config.mime });
  }

  const blob = await canvasToBlob(canvas, config.mime, format === "webp" ? 0.94 : undefined);
  if (blob.type !== config.mime) {
    throw new Error(`此瀏覽器無法輸出 ${config.label}；請改用 PNG。`);
  }
  return blob;
}

async function renderSelectionComposition(objects, requestedScale) {
  const { planCompositionSize } = await loadOutputRuntime();
  const bounds = selectionWorldBounds(objects);
  if (!bounds) throw new Error("請先選取要輸出的物件。");
  await document.fonts?.ready;
  const videoFrames = await Promise.all(objects.filter(isVideoObject).map(async (object) => [object.id, await captureVideoFrame(object)]));
  const sourceOverrides = new Map(videoFrames);
  const padding = 2;
  const logicalWidth = Math.max(1, Math.ceil(bounds.width + padding * 2));
  const logicalHeight = Math.max(1, Math.ceil(bounds.height + padding * 2));
  const outputPlan = planCompositionSize(logicalWidth, logicalHeight, requestedScale);
  const canvas = document.createElement("canvas");
  canvas.width = outputPlan.pixelWidth;
  canvas.height = outputPlan.pixelHeight;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("瀏覽器無法建立合成圖畫布。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, canvas.width, canvas.height);
  const sources = await Promise.all(objects.map((object) => createObjectSourceCanvas(
    object,
    sourceOverrides.get(object.id),
    outputPlan.renderScale,
  )));
  objects.forEach((object, index) => {
    if (objectHasMicro3D(object)) {
      drawProjectedCompositionObject(context, sources[index], object, bounds, padding, outputPlan.renderScale);
    } else {
      drawFlatCompositionObject(context, sources[index], object, bounds, padding, outputPlan.renderScale);
    }
  });
  return { canvas, ...outputPlan };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class FeatureChunkBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`feature-chunk-state is-error${this.props.compact ? " is-compact" : ""}`} role="alert">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>{`${this.props.label || "進階功能"}載入失敗；目前畫布未受影響。`}</span>
        <button type="button" className="text-button" onClick={() => window.location.reload()}>重新載入程式</button>
      </div>
    );
  }
}

function FeatureChunkLoading({ label, compact = false }) {
  return (
    <div className={`feature-chunk-state${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
      <RefreshCw size={15} className="is-spinning" aria-hidden="true" />
      <span>{`正在載入${label}…`}</span>
    </div>
  );
}

function IconButton({ label, children, active = false, className = "", ...props }) {
  return (
    <button
      className={`icon-button ${active ? "is-active" : ""} ${className}`}
      type="button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

function platformShortcutLabel(shortcut) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return shortcut
    .replaceAll("mod", isMac ? "⌘" : "Ctrl")
    .replaceAll("shift", "⇧")
    .split("+")
    .join(" + ");
}

function useListSearch(listId) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  const focusSearch = useCallback(() => {
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const openRequestedSearch = (event) => {
      if (event.detail?.listId === listId) focusSearch();
    };
    window.addEventListener("infinite-moodboard:list-search", openRequestedSearch);
    return () => window.removeEventListener("infinite-moodboard:list-search", openRequestedSearch);
  }, [focusSearch, listId]);

  return { open, setOpen, query, setQuery, inputRef, focusSearch };
}

function ListSearchToggle({ search, resultCount, totalCount, label = "搜尋／篩選列表", forceActive = false }) {
  const active = forceActive || Boolean(search.query.trim());
  return (
    <button
      className={`list-search-toggle ${search.open ? "is-open" : ""} ${active ? "is-active" : ""}`}
      type="button"
      aria-label={search.open ? "收合搜尋／篩選" : label}
      aria-expanded={search.open}
      aria-pressed={active}
      onClick={() => search.open ? search.setOpen(false) : search.focusSearch()}
      title={label}
    >
      <ListFilter size={16} aria-hidden="true" />
      {active ? <span>{resultCount}/{totalCount}</span> : null}
    </button>
  );
}

function ListSearchField({ search, placeholder, children = null }) {
  if (!search.open) return null;
  return (
    <div className="list-search-controls">
      <label className="list-search-field">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">{placeholder}</span>
        <input
          ref={search.inputRef}
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            search.setOpen(false);
          }}
          placeholder={placeholder}
        />
        {search.query ? (
          <button type="button" aria-label="清除搜尋" onClick={() => { search.setQuery(""); search.inputRef.current?.focus(); }}>
            <X size={14} />
          </button>
        ) : null}
      </label>
      {children}
    </div>
  );
}

function WorkspaceRulers({
  rulersVisible,
  guidesVisible,
  guidesLocked,
  readOnly,
  guides,
  selectedGuideIds,
  draggingGuide,
  view,
  viewportSize,
  unit,
  rulerOrigin,
  onUnitChange,
  onSetRulerOrigin,
  onStartGuide,
  onToggleGuideLocked,
  onDeleteGuide,
}) {
  const [unitMenu, setUnitMenu] = useState(null);
  const [guideMenu, setGuideMenu] = useState(null);
  const [originDrag, setOriginDrag] = useState(null);
  const guideMenuRef = useRef(null);
  const guideMenuTriggerRef = useRef(null);
  const suppressCornerClickRef = useRef(false);
  const origin = rulerOrigin || { x: 0, y: 0 };
  const horizontalTicks = useMemo(
    () => buildRulerTicks(Math.max(0, viewportSize.width - RULER_SIZE), view.x - RULER_SIZE, view.zoom, unit, origin.x),
    [origin.x, unit, view.x, view.zoom, viewportSize.width],
  );
  const verticalTicks = useMemo(
    () => buildRulerTicks(Math.max(0, viewportSize.height - RULER_SIZE), view.y - RULER_SIZE, view.zoom, unit, origin.y),
    [origin.y, unit, view.y, view.zoom, viewportSize.height],
  );

  useEffect(() => {
    if (!unitMenu && !guideMenu) return undefined;
    const focusFrame = guideMenu ? window.requestAnimationFrame(() => {
      guideMenuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    }) : null;
    const close = () => {
      setUnitMenu(null);
      setGuideMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const trigger = guideMenuTriggerRef.current;
      close();
      if (trigger) window.requestAnimationFrame(() => trigger.focus());
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [guideMenu, unitMenu]);

  if (!rulersVisible && !guidesVisible && !draggingGuide) return null;

  const openUnitMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setGuideMenu(null);
    setUnitMenu({ x: event.clientX, y: event.clientY });
  };
  const startOriginDrag = (event) => {
    if (readOnly || event.button !== 0) return;
    const viewport = event.currentTarget.closest(".canvas-viewport");
    const rect = viewport?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    setUnitMenu(null);
    setGuideMenu(null);
    const start = { x: event.clientX, y: event.clientY };
    let latest = null;
    let moved = false;

    const resolve = (pointerEvent) => {
      const screenX = Math.max(RULER_SIZE, Math.min(rect.width, pointerEvent.clientX - rect.left));
      const screenY = Math.max(RULER_SIZE, Math.min(rect.height, pointerEvent.clientY - rect.top));
      return {
        screenX,
        screenY,
        worldX: (screenX - view.x) / view.zoom,
        worldY: (screenY - view.y) / view.zoom,
      };
    };
    const move = (pointerEvent) => {
      if (!moved && Math.hypot(pointerEvent.clientX - start.x, pointerEvent.clientY - start.y) < 4) return;
      moved = true;
      latest = resolve(pointerEvent);
      setOriginDrag(latest);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", cancelWithEscape, true);
    };
    const finish = (pointerEvent) => {
      if (moved) {
        latest = resolve(pointerEvent);
        suppressCornerClickRef.current = true;
        onSetRulerOrigin({ x: latest.worldX, y: latest.worldY });
      }
      setOriginDrag(null);
      cleanup();
    };
    const cancel = () => {
      setOriginDrag(null);
      cleanup();
    };
    const cancelWithEscape = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("keydown", cancelWithEscape, true);
  };
  const handleCornerClick = (event) => {
    if (suppressCornerClickRef.current) {
      suppressCornerClickRef.current = false;
      event.preventDefault();
      return;
    }
    openUnitMenu(event);
  };
  const openGuideMenu = (event, guide, screenPosition = null) => {
    event.preventDefault();
    event.stopPropagation();
    guideMenuTriggerRef.current = event.currentTarget;
    const pointerPositionAvailable = Number.isFinite(event.clientX) && Number.isFinite(event.clientY) && (event.clientX !== 0 || event.clientY !== 0);
    const fallbackX = guide.axis === "x" ? screenPosition : RULER_SIZE + 16;
    const fallbackY = guide.axis === "y" ? screenPosition : RULER_SIZE + 16;
    setUnitMenu(null);
    setGuideMenu({
      guide,
      x: Math.max(8, Math.min(pointerPositionAvailable ? event.clientX : fallbackX, window.innerWidth - 224)),
      y: Math.max(8, Math.min(pointerPositionAvailable ? event.clientY : fallbackY, window.innerHeight - 112)),
    });
  };
  const activateGuideMenu = (callback) => {
    const guide = guideMenu?.guide;
    setGuideMenu(null);
    if (guide) callback(guide);
  };
  const navigateGuideMenu = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(guideMenuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };
  const draggingMembers = draggingGuide?.members?.length ? draggingGuide.members : draggingGuide ? [draggingGuide] : [];
  const draggingById = new Map(draggingMembers.map((guide) => [guide.id, guide]));
  const shownGuides = [
    ...guides.map((guide) => draggingById.has(guide.id) ? { ...guide, ...draggingById.get(guide.id) } : guide),
    ...draggingMembers.filter((guide) => guide.isNew || !guides.some((item) => item.id === guide.id)),
  ];
  const draggingGuideScreenPosition = draggingGuide
    ? (draggingGuide.axis === "x" ? view.x : view.y) + draggingGuide.position * view.zoom
    : null;
  const rulerInset = rulersVisible ? RULER_SIZE : 0;
  const readoutStyle = draggingGuide ? (
    draggingGuide.axis === "x"
      ? draggingGuideScreenPosition > viewportSize.width / 2
        ? { right: Math.max(8, viewportSize.width - draggingGuideScreenPosition + 8), top: rulerInset + 8 }
        : { left: Math.max(rulerInset + 8, draggingGuideScreenPosition + 8), top: rulerInset + 8 }
      : draggingGuideScreenPosition > viewportSize.height / 2
        ? { bottom: Math.max(8, viewportSize.height - draggingGuideScreenPosition + 8), left: rulerInset + 8 }
        : { top: Math.max(rulerInset + 8, draggingGuideScreenPosition + 8), left: rulerInset + 8 }
  ) : null;

  return (
    <div className="workspace-measurement-layer" aria-label="尺規與輔助導引線">
      {rulersVisible ? (
        <>
          <button
            className={`ruler-corner ${readOnly ? "is-read-only" : ""}`}
            type="button"
            onPointerDown={startOriginDrag}
            onContextMenu={openUnitMenu}
            onClick={handleCornerClick}
            aria-label={readOnly ? `尺規原點；目前僅檢視。按右鍵切換 ${RULER_UNITS[unit].label} 單位` : `拖曳以重新設定尺規原點；點擊切換 ${RULER_UNITS[unit].label} 單位`}
            title={readOnly ? "尺規原點目前僅檢視；按右鍵切換單位" : "按住並拖曳以重新設定尺規原點；點擊切換單位"}
          >
            <Crosshair size={13} />
          </button>
          <div
            className={`workspace-ruler is-horizontal ${guidesLocked || readOnly ? "is-guide-locked" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={readOnly ? "頂部尺規；目前僅檢視" : guidesLocked ? "頂部尺規；輔助導引線已鎖定" : "頂部尺規；拖曳可建立水平導引線"}
            onPointerDown={(event) => onStartGuide(event, "y")}
            onContextMenu={openUnitMenu}
          >
            {horizontalTicks.map((tick) => (
              <span className={tick.major ? "is-major" : ""} style={{ left: tick.position }} key={`${tick.position}-${tick.value}`}>
                {tick.major ? <b>{tick.label}</b> : null}
              </span>
            ))}
          </div>
          <div
            className={`workspace-ruler is-vertical ${guidesLocked || readOnly ? "is-guide-locked" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={readOnly ? "左側尺規；目前僅檢視" : guidesLocked ? "左側尺規；輔助導引線已鎖定" : "左側尺規；拖曳可建立垂直導引線"}
            onPointerDown={(event) => onStartGuide(event, "x")}
            onContextMenu={openUnitMenu}
          >
            {verticalTicks.map((tick) => (
              <span className={tick.major ? "is-major" : ""} style={{ top: tick.position }} key={`${tick.position}-${tick.value}`}>
                {tick.major ? <b>{tick.label}</b> : null}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {(guidesVisible || draggingGuide) ? (
        <div className="workspace-guides">
          {shownGuides.map((guide) => {
            const screenPosition = (guide.axis === "x" ? view.x : view.y) + guide.position * view.zoom;
            const relativePosition = guide.position - (guide.axis === "x" ? origin.x : origin.y);
            return (
              <button
                className={`workspace-guide is-${guide.axis === "x" ? "vertical" : "horizontal"} ${draggingById.has(guide.id) ? "is-dragging" : ""} ${selectedGuideIds.includes(guide.id) ? "is-selected" : ""} ${guidesLocked || guide.locked || readOnly ? "is-locked" : ""}`}
                style={guide.axis === "x" ? { left: screenPosition } : { top: screenPosition }}
                type="button"
                aria-disabled={guidesLocked || guide.locked || readOnly}
                aria-pressed={selectedGuideIds.includes(guide.id)}
                aria-label={readOnly
                  ? `${guide.axis === "x" ? "垂直" : "水平"}導引線 ${formatGuideValue(relativePosition, unit)}；目前僅檢視`
                  : guidesLocked || guide.locked
                  ? `${guide.axis === "x" ? "垂直" : "水平"}導引線 ${formatGuideValue(relativePosition, unit)}；已鎖定`
                  : `${guide.axis === "x" ? "垂直" : "水平"}導引線 ${formatGuideValue(relativePosition, unit)}；拖曳移動，按右鍵更多`}
                title={readOnly ? "目前為僅檢視；無法調整導引線" : guidesLocked ? "所有導引線已鎖定；請從「檔案」解除鎖定" : guide.locked ? "此導引線已鎖定；按右鍵解除或刪除" : "拖曳移動；按右鍵更多"}
                onPointerDown={(event) => onStartGuide(event, guide.axis, guide.id)}
                onContextMenu={(event) => openGuideMenu(event, guide, screenPosition)}
                onKeyDown={(event) => {
                  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                  openGuideMenu(event, guide, screenPosition);
                }}
                key={guide.id}
              />
            );
          })}
          {draggingGuide ? (
            <div className="workspace-guide-readout" style={readoutStyle} aria-hidden="true">
              <span>{formatGuideValue(draggingGuide.position - (draggingGuide.axis === "x" ? origin.x : origin.y), unit)}</span>
              {draggingGuide.snapped ? <strong>已吸附</strong> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {originDrag ? (
        <div className="ruler-origin-preview" aria-hidden="true">
          <i className="is-vertical" style={{ left: originDrag.screenX }} />
          <i className="is-horizontal" style={{ top: originDrag.screenY }} />
          <span style={{ left: originDrag.screenX, top: originDrag.screenY }}><Crosshair size={15} /><b>0, 0</b></span>
        </div>
      ) : null}
      {unitMenu ? (
        <div className="ruler-unit-menu" style={{ left: unitMenu.x, top: unitMenu.y }} role="menu" aria-label="尺規單位" onPointerDown={(event) => event.stopPropagation()}>
          {Object.entries(RULER_UNITS).map(([id, option]) => (
            <button type="button" role="menuitemradio" aria-checked={unit === id} className={unit === id ? "is-active" : ""} onClick={() => { onUnitChange(id); setUnitMenu(null); }} key={id}>
              <span>{option.label}</span>{unit === id ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
      {guideMenu ? (
        <div
          className="guide-context-menu"
          style={{ left: guideMenu.x, top: guideMenu.y }}
          role="menu"
          aria-label={`${guideMenu.guide.axis === "x" ? "垂直" : "水平"}導引線操作`}
          ref={guideMenuRef}
          onKeyDown={navigateGuideMenu}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" disabled={guidesLocked || readOnly} onClick={() => activateGuideMenu(onToggleGuideLocked)}>
            {guideMenu.guide.locked ? <Unlock size={15} /> : <Lock size={15} />}
            <span>{guideMenu.guide.locked ? "解除鎖定此導引線" : "鎖定此導引線"}</span>
          </button>
          <button className="is-danger" type="button" role="menuitem" disabled={guidesLocked || readOnly} onClick={() => activateGuideMenu((guide) => onDeleteGuide(guide.id, true))}>
            <Trash2 size={15} /><span>刪除此導引線</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AccountAvatar({ user, size = 28 }) {
  return (
    <span className="account-avatar" style={{ "--account-avatar-size": `${size}px` }} aria-hidden="true">
      <span>{accountInitials(user)}</span>
      {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
    </span>
  );
}

function FileMenu({
  onOpenLibrary,
  onOpenFile,
  onSave,
  onSaveAs,
  onExportBrowser,
  onExportObjects,
  onOutputComposition,
  canExportObjects,
  canOutputComposition,
  onOpenCollaboration,
  onOpenAgent,
  onToggleGuidesLocked,
  onOpenVersions,
  onOpenAbout,
  guidesLocked = false,
  guideControlsDisabled = false,
  saveTitle,
  saveLabel = "儲存",
  collaborationCount = 0,
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    });
    const closeFromOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeWithEscape, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeWithEscape, true);
    };
  }, [open]);

  const activate = (callback) => {
    setOpen(false);
    callback();
  };

  const navigateMenu = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  return (
    <div
      className="file-menu"
      ref={wrapperRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className={`topbar-button file-menu-trigger ${open ? "is-active" : ""}`}
        type="button"
        aria-label="主選單"
        title="主選單"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="file-menu-popover"
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
      >
        <Menu size={18} />
      </button>
      {open ? (
        <div
          className="file-menu-popover"
          id="file-menu-popover"
          role="menu"
          aria-label="主選單"
          ref={menuRef}
          onKeyDown={navigateMenu}
        >
          <div className="file-menu-section" aria-label="檔案操作">
            <span className="file-menu-section-label">檔案</span>
            <button type="button" role="menuitem" onClick={() => activate(onOpenLibrary)}>
              <FolderOpen size={17} /><span><strong>我的工作檔…</strong><small>本機與 Google Drive 檔案</small></span>
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onOpenFile)}>
              <FileUp size={17} /><span><strong>開啟工作檔…</strong><small>支援 .studio 與舊版工作檔</small></span><kbd>{platformShortcutLabel("mod+o")}</kbd>
            </button>
            <button type="button" role="menuitem" title={saveTitle} onClick={() => activate(onSave)}>
              <Save size={17} /><span><strong>{saveLabel}</strong><small>{saveTitle}</small></span><kbd>{platformShortcutLabel("mod+s")}</kbd>
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onSaveAs)}>
              <FileArchive size={17} /><span><strong>下載本機副本…</strong><small>下載 .studio；不改變主要儲存位置</small></span>
            </button>
          </div>
          <div className="file-menu-section" aria-label="輸出操作">
            <span className="file-menu-section-label">輸出</span>
            <button type="button" role="menuitem" onClick={() => activate(onExportBrowser)}>
              <FileCode2 size={17} /><span><strong>匯出瀏覽器版（HTML）</strong><small>唯讀，可離線開啟</small></span>
            </button>
            <button type="button" role="menuitem" disabled={!canExportObjects} onClick={() => activate(onExportObjects)}>
              <ImageDown size={17} /><span><strong>匯出選取素材…</strong><small>{canExportObjects ? "保留每個物件的原始內容" : "先選取至少 1 個物件"}</small></span>
            </button>
            <button type="button" role="menuitem" disabled={!canOutputComposition} onClick={() => activate(onOutputComposition)}>
              <Images size={17} /><span><strong>輸出選取合成圖…</strong><small>{canOutputComposition ? "保留目前的位置、縮放與旋轉" : "先選取至少 1 個物件"}</small></span>
            </button>
          </div>
          <div className="file-menu-section" aria-label="檔案管理">
            <span className="file-menu-section-label">管理</span>
            <button type="button" role="menuitem" onClick={() => activate(onOpenCollaboration)}>
              <Share2 size={17} /><span><strong>分享與共同編輯</strong><small>建立連結與管理權限</small></span>{collaborationCount > 0 ? <b>{collaborationCount}</b> : null}
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onOpenAgent)}>
              <Box size={17} /><span><strong>AI 連線</strong><small>連接本機 Codex 或 Claude</small></span>
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label={guidesLocked ? "解除鎖定所有輔助導引線" : "鎖定所有輔助導引線"}
              disabled={guideControlsDisabled}
              onClick={() => activate(onToggleGuidesLocked)}
            >
              {guidesLocked ? <Unlock size={17} /> : <Lock size={17} />}
              <span>
                <strong>{guidesLocked ? "解除鎖定所有輔助導引線" : "鎖定所有輔助導引線"}</strong>
                <small>{guideControlsDisabled ? "回到畫布後調整" : guidesLocked ? "允許新增、移動與刪除" : "防止新增、移動與刪除"}</small>
              </span>
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onOpenVersions)}>
              <History size={17} /><span><strong>版本紀錄</strong><small>查看與復原內容版本</small></span>
            </button>
            <button type="button" role="menuitem" onClick={() => activate(onOpenAbout)}>
              <Info size={17} /><span><strong>關於 Infinite Studio</strong><small>版本與更新資訊</small></span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({ user, signedIn, onOpenSection, onCloseSettings }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus());
    const outside = (event) => { if (!wrapperRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape, true);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape, true); };
  }, [open]);
  const sections = [["account", "帳號與隱私", UserRound], ["storage", "儲存與同步", Cloud], ["general", "一般設定", Languages], ["appearance", "外觀", Palette], ["workspace", "工作區", LayoutGrid], ["about", "關於", Info]];
  const navigate = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (index + 1 + items.length) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };
  return <div className="account-menu" ref={wrapperRef}>
    <button ref={triggerRef} className="account-menu-button" type="button" aria-label={signedIn ? `帳號與設定：${accountDisplayName(user)}` : "帳號與設定"} title="帳號與設定" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu-popover" onClick={() => { if (!open) onCloseSettings(); setOpen((current) => !current); }}>
      {signedIn ? <AccountAvatar user={user} size={26} /> : <UserRound size={17} />}
    </button>
    {open ? <div id="account-menu-popover" className="file-menu-popover account-menu-popover" role="menu" aria-label="帳號與設定" ref={menuRef} onKeyDown={navigate}>
      <div className="account-menu-profile"><strong data-l10n-ignore>{signedIn ? accountDisplayName(user) : "訪客模式"}</strong>{signedIn && user?.email ? <small data-l10n-ignore>{user.email}</small> : null}</div>
      <div className="file-menu-section">{sections.map(([key, label, Icon]) => <button type="button" role="menuitem" key={key} onClick={() => { setOpen(false); onOpenSection(key); }}><Icon size={17} /><span><strong>{label}</strong></span></button>)}</div>
    </div> : null}
  </div>;
}

function MobileTopbarMoreMenu({
  open,
  onOpenChange,
  onOpenAccount,
  onZoomWindow,
  showZoomWindow,
  zoomWindowActive,
  zoomWindowZoomOut,
}) {
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    });
    const closeFromOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) onOpenChange(false);
    };
    const closeWithEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const closeOnDesktop = () => {
      if (window.innerWidth > 900) onOpenChange(false);
    };
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeWithEscape, true);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeWithEscape, true);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, [onOpenChange, open]);

  const activate = (callback) => {
    onOpenChange(false);
    callback();
  };

  const navigateMenu = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  return (
    <div className="mobile-topbar-more" ref={wrapperRef}>
      <button
        className={`icon-button mobile-topbar-more-button ${open ? "is-active" : ""}`}
        type="button"
        aria-label="更多功能"
        title="更多功能"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="mobile-topbar-more-menu"
        ref={triggerRef}
        onClick={() => onOpenChange(!open)}
      >
        <Ellipsis size={20} />
      </button>
      {open ? (
        <div
          className="mobile-topbar-menu"
          id="mobile-topbar-more-menu"
          role="menu"
          aria-label="更多功能"
          ref={menuRef}
          onKeyDown={navigateMenu}
        >
          {showZoomWindow ? (
            <button type="button" role="menuitem" aria-pressed={zoomWindowActive} onClick={() => activate(onZoomWindow)}>
              {zoomWindowZoomOut ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
              <span>縮放視窗</span>
              <b>{zoomWindowActive ? "使用中" : zoomWindowZoomOut ? "拖曳縮小區域" : "拖曳放大區域"}</b>
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => activate(onOpenAccount)}>
            <UserRound size={18} />
            <span>帳號與設定</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SelectionActionBar({ count, grouped, onAddArtboard, onAddAnnotation, onGrid, onToggleGroup, onDuplicate, onDelete, style }) {
  const selectionLabel = count > 1 ? `${count} 個選取物件` : "選取物件";
  const stopCanvasGesture = (event) => event.stopPropagation();

  return (
    <div
      className="selection-action-bar"
      role="toolbar"
      aria-label={`${selectionLabel}操作`}
      style={style}
      onPointerDown={stopCanvasGesture}
      onClick={stopCanvasGesture}
      onDoubleClick={stopCanvasGesture}
      onKeyDown={stopCanvasGesture}
    >
      <IconButton label="在選取物件後方加入紙張" onClick={onAddArtboard}>
        <Square size={16} />
      </IconButton>
      <IconButton label="在選取範圍四周加入標題或說明" onClick={onAddAnnotation}>
        <Type size={16} />
      </IconButton>
      <IconButton label="建立或重新排列 Grid" onClick={onGrid}>
        <LayoutGrid size={16} />
      </IconButton>
      <IconButton label={grouped ? "解散群組 Shift+G" : "建立群組 Shift+G"} onClick={onToggleGroup} disabled={!grouped && count < 2} active={grouped}>
        <Layers3 size={16} />
      </IconButton>
      <span className="selection-action-divider" aria-hidden="true" />
      <IconButton label={`複製${selectionLabel} Shift+D`} onClick={onDuplicate}>
        <Copy size={16} />
      </IconButton>
      <IconButton className="danger-icon-button" label={`刪除${selectionLabel}；可按 ⌘Z 復原`} onClick={onDelete}>
        <Trash2 size={16} />
      </IconButton>
    </div>
  );
}

function displayTextColor(color) {
  return !color || color.toLowerCase() === "#edf7fb" ? "var(--canvas-default-text, #edf7fb)" : color;
}

function MediaElement({ object, className = "", controls = false, decorative = false, style }) {
  if (isArtboardObject(object)) {
    return (
      <div
        className={`object-artboard-visual ${className}`}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : `${object.name}，紙張`}
        aria-hidden={decorative || undefined}
        style={{ backgroundColor: object.fill || "#fffdf7", ...style }}
      >
        <span data-l10n-ignore>{object.name}</span>
      </div>
    );
  }
  if (isTextObject(object)) {
    const displayText = objectDisplayText(object);
    return (
      <div
        className={`object-text-visual ${className}`}
        data-l10n-ignore
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : `${object.name}：${displayText}`}
        aria-hidden={decorative || undefined}
        style={{
          color: displayTextColor(object.color),
          fontFamily: object.fontFamily,
          fontSize: object.fontSize,
          fontWeight: object.fontWeight,
          ...textLayoutStyle(object),
          ...style,
        }}
      >
        {displayText}
      </div>
    );
  }
  if (isShapeObject(object)) {
    const points = shapeSvgPoints(object);
    return (
      <svg
        className={`object-shape-visual ${className}`}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : `${object.name}，${SHAPE_LABELS[object.shapeKind] || "形狀"}`}
        aria-hidden={decorative || undefined}
        style={style}
      >
        {points ? <polygon points={points} fill={object.fill} /> : <rect x="1" y="1" width="98" height="98" rx="2" fill={object.fill} />}
      </svg>
    );
  }
  if (isVideoObject(object)) {
    return (
      <video
        className={className}
        src={object.src}
        aria-label={decorative ? undefined : object.name}
        aria-hidden={decorative || undefined}
        controls={controls}
        muted={!controls}
        playsInline
        preload="metadata"
        draggable="false"
        style={style}
      />
    );
  }
  return <img className={className} src={object.src} alt={decorative ? "" : object.name} draggable="false" style={style} />;
}

function CanvasTextEditor({ object, editSession, onChange, onFinish }) {
  const editorRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.textContent = objectDisplayText(object);
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    if (editSession?.selectAll) range.selectNodeContents(editor);
    else {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editSession?.selectAll, object.id]);

  return (
    <div
      ref={editorRef}
      className="object-text-visual canvas-text-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`直接編輯「${object.name}」`}
      aria-multiline="true"
      data-placeholder="輸入文字"
      spellCheck="true"
      style={{
        color: displayTextColor(object.color),
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        fontWeight: object.fontWeight,
        ...textLayoutStyle(object),
      }}
      onInput={(event) => onChange(object.id, event.currentTarget.innerText.replace(/\r\n/g, "\n"))}
      onBlur={onFinish}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function formatMediaTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60);
  return `${minutes}:${seconds}`;
}

function CanvasVideoPlayer({ object, onControlsVisibilityChange }) {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const controlsVisible = object.videoControlsVisible !== false;

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setFailed(false);
  }, [object.src]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const stopObjectGesture = (event) => event.stopPropagation();
  const togglePlayback = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const video = videoRef.current;
    if (!video || failed) return;
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      try {
        await video.play();
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
    }
  };
  const seek = (event) => {
    event.stopPropagation();
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const nextTime = Number(event.target.value) || 0;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };
  const toggleFullscreen = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const player = playerRef.current;
    const video = videoRef.current;
    try {
      if (document.fullscreenElement === player) {
        await document.exitFullscreen?.();
      } else if (player?.requestFullscreen) {
        await player.requestFullscreen();
      } else if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    } catch {
      setFullscreen(false);
    }
  };
  const setControlsVisible = (event, visible) => {
    event.preventDefault();
    event.stopPropagation();
    onControlsVisibilityChange?.(visible);
  };

  return (
    <div
      ref={playerRef}
      className="canvas-video-player"
      onPointerDown={(event) => { if (fullscreen) event.stopPropagation(); }}
      onClick={(event) => { if (fullscreen) togglePlayback(event); }}
      onDoubleClick={(event) => { if (fullscreen) event.stopPropagation(); }}
    >
      <video
        ref={videoRef}
        src={object.src}
        aria-label={object.name}
        playsInline
        preload="metadata"
        draggable="false"
        onLoadedMetadata={(event) => {
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          setFailed(false);
        }}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => { setPlaying(true); setFailed(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setFailed(true); }}
      />
      {controlsVisible ? (
        <div
          className="canvas-video-controls"
          role="group"
          aria-label={`${object.name} 影片控制`}
          onPointerDown={stopObjectGesture}
          onClick={stopObjectGesture}
          onDoubleClick={stopObjectGesture}
          onKeyDown={stopObjectGesture}
        >
          <button
            className="canvas-video-control-button"
            type="button"
            aria-label={playing ? "暫停影片" : "播放影片"}
            title={playing ? "暫停" : "播放"}
            onClick={togglePlayback}
            disabled={failed}
          >
            {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <input
            type="range"
            min="0"
            max={Math.max(duration, 0)}
            step="0.01"
            value={Math.min(currentTime, Math.max(duration, 0))}
            aria-label="影片播放位置"
            onChange={seek}
            disabled={!duration || failed}
          />
          <output aria-live="off">{failed ? "無法播放" : `${formatMediaTime(currentTime)} / ${formatMediaTime(duration)}`}</output>
          <button
            className="canvas-video-control-button"
            type="button"
            aria-label={fullscreen ? "離開全螢幕" : "以全螢幕播放"}
            title={fullscreen ? "離開全螢幕" : "全螢幕"}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            className="canvas-video-control-button"
            type="button"
            aria-label="隱藏影片控制器"
            title="隱藏控制器"
            onClick={(event) => setControlsVisible(event, false)}
          >
            <EyeOff size={14} />
          </button>
        </div>
      ) : (
        <button
          className="canvas-video-reveal"
          type="button"
          aria-label="顯示影片控制器"
          title="顯示影片控制器"
          onPointerDown={stopObjectGesture}
          onDoubleClick={stopObjectGesture}
          onKeyDown={stopObjectGesture}
          onClick={(event) => setControlsVisible(event, true)}
        >
          <Eye size={14} />
        </button>
      )}
    </div>
  );
}

function InsertToolbar({ open, disabled = false, onToggle, onClose, onAddText, onImportText, onAddShape, onChooseImage, onChooseVideo, onChooseSvg, onAddGrid }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);
  const shapeActions = [
    ["square", "正方形", Square],
    ["rectangle", "矩形", RectangleHorizontal],
    ["triangle", "三角形", Triangle],
    ["polygon", "六邊形", Hexagon],
    ["star", "星形", Star],
  ];
  const activate = (action) => { onClose(); action(); };
  const onMenuKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      triggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (index + 1 + items.length) % items.length
      : (index - 1 + items.length) % items.length;
    items[next].focus();
  };
  return (
    <div className="insert-tools" role="group" aria-label="加入物件">
      <button className="toolbar-action insert-tool" type="button" aria-label="加入文字" title="加入文字" onClick={onAddText} disabled={disabled}>
        <Type size={17} />
      </button>
      <div className="insert-menu-wrap">
        <button className="toolbar-action insert-tool" type="button" aria-label="加入圖片" title="加入圖片"
          onClick={() => activate(onChooseImage)} disabled={disabled}>
          <ImagePlus size={17} />
        </button>
        <button ref={triggerRef} className={`toolbar-action insert-tool insert-menu-trigger ${open ? "is-active" : ""}`} type="button"
          aria-label="加入素材與形狀" title="加入其他素材、形狀或 Grid" aria-haspopup="menu"
          aria-expanded={open} aria-controls="insert-tools-menu" onClick={onToggle} disabled={disabled}>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {open ? (
          <div ref={menuRef} id="insert-tools-menu" className="insert-menu shape-menu" role="menu" aria-label="加入素材、形狀或 Grid" onKeyDown={onMenuKeyDown}>
            <button type="button" role="menuitem" onClick={() => activate(onImportText)}><FileUp size={17} /><span><strong>匯入文字文件</strong><small>TXT、Markdown、CSV、DOCX</small></span></button>
            <button type="button" role="menuitem" onClick={() => activate(onChooseImage)}><ImagePlus size={17} /><span><strong>加入圖片</strong></span></button>
            <button type="button" role="menuitem" onClick={() => activate(onChooseVideo)}><Video size={17} /><span><strong>加入影片</strong></span></button>
            <button type="button" role="menuitem" onClick={() => activate(onAddGrid)}><LayoutGrid size={17} /><span><strong>建立 Grid</strong></span></button>
            <button type="button" role="menuitem" onClick={() => activate(onChooseSvg)}><FileUp size={17} /><span><strong>匯入 SVG</strong></span></button>
            <span className="insert-menu-heading">基本形狀</span>
            <div className="insert-shape-grid">
              {shapeActions.map(([kind, label, Icon]) => (
                <button key={kind} type="button" role="menuitem" aria-label={`加入${label}`} title={`加入${label}`} onClick={() => activate(() => onAddShape(kind))}>
                  <Icon size={18} /><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MarkerIcon({ symbol, color, size = 15 }) {
  const Icon = MARKER_ICONS[symbol] || Circle;
  return <Icon size={size} fill="currentColor" strokeWidth={1.75} style={{ color: MARKER_COLOR_VALUES[color] }} aria-hidden="true" />;
}

function MarkerPill({ marker, onRemove }) {
  return (
    <span className="marker-pill">
      <MarkerIcon symbol={marker.symbol} color={marker.color} />
      <span>{MARKER_LABELS[marker.symbol]} · {MARKER_COLOR_LABELS[marker.color]}</span>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`移除${MARKER_LABELS[marker.symbol]}標記`} title="移除標記">
          <X size={13} />
          <span>移除</span>
        </button>
      ) : null}
    </span>
  );
}

function AxisPicker({ value, onChange }) {
  return (
    <div className="axis-picker" role="radiogroup" aria-label="九點軸心">
      {Object.entries(ANCHORS).map(([key, anchor]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={anchor.label}
          title={anchor.label}
          className={value === key ? "is-active" : ""}
          onClick={() => onChange(key)}
        >
          <span />
        </button>
      ))}
    </div>
  );
}

function TextAlignmentControl({ label, accessibleLabel, value, options, onChange, columns = 3 }) {
  return (
    <div className="text-alignment-control">
      <strong>{label}</strong>
      <div
        className="text-alignment-buttons"
        style={{ "--alignment-columns": columns }}
        role="group"
        aria-label={accessibleLabel}
      >
        {options.map(({ value: optionValue, label: optionLabel, accessibleLabel: optionAccessibleLabel, Icon }) => (
          <button
            key={optionValue}
            type="button"
            className={value === optionValue ? "is-active" : ""}
            aria-label={optionAccessibleLabel}
            aria-pressed={value === optionValue}
            title={optionAccessibleLabel}
            onClick={() => onChange(optionValue)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{optionLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarkerComposer({ markerDraft, setMarkerDraft, onAdd, disabled = false }) {
  return (
    <div className="marker-composer">
      <div className="marker-preview" aria-live="polite">
        <span className="marker-preview-icon"><MarkerIcon symbol={markerDraft.symbol} color={markerDraft.color} size={19} /></span>
        <span><small>標記預覽</small><strong>{MARKER_LABELS[markerDraft.symbol]} · {MARKER_COLOR_LABELS[markerDraft.color]}</strong></span>
      </div>
      <fieldset className="marker-option-group">
        <legend>符號</legend>
        <div className="marker-choice-grid">
          {MARKER_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              className={markerDraft.symbol === symbol ? "is-active" : ""}
              onClick={() => setMarkerDraft((current) => ({ ...current, symbol }))}
              aria-label={`符號：${MARKER_LABELS[symbol]}`}
              aria-pressed={markerDraft.symbol === symbol}
              title={MARKER_LABELS[symbol]}
            >
              <MarkerIcon symbol={symbol} color="white" size={17} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="marker-option-group marker-color-group">
        <legend>顏色</legend>
        <div className="color-choice-grid">
          {MARKER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={markerDraft.color === color ? "is-active" : ""}
              onClick={() => setMarkerDraft((current) => ({ ...current, color }))}
              aria-label={`顏色：${MARKER_COLOR_LABELS[color]}`}
              aria-pressed={markerDraft.color === color}
              title={MARKER_COLOR_LABELS[color]}
            >
              <span className="marker-color-swatch" style={{ backgroundColor: MARKER_COLOR_VALUES[color] }} />
              {markerDraft.color === color ? <Check className="marker-color-check" size={12} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        className="quiet-button marker-add-button"
        type="button"
        onClick={onAdd}
        disabled={disabled}
        aria-label={`套用「${MARKER_LABELS[markerDraft.symbol]} · ${MARKER_COLOR_LABELS[markerDraft.color]}」到選取項目`}
      >
        {disabled ? "套用到物件" : "套用到選取項目"}
      </button>
    </div>
  );
}

function LayersPanel({
  board,
  selectedIds,
  selectedGuideIds,
  onSelectLayers,
  onSelectGroup,
  onSelectGuide,
  onSelectGuideGroup,
  onToggleGuideLocked,
  onToggleGuidesLocked,
  onLockSelectedGuides,
  onDeleteGuides,
  onToggleSelectedGuideGroup,
  onUngroupGuideGroup,
  onToggleVisible,
  onSetSelectedVisibility,
  onExportSelected,
  onOutputSelected,
  onDeleteSelected,
  onUngroup,
  onDuplicateLayer,
  onDeleteLayer,
  onMoveLayer,
  onReorderLayer,
  onLocate,
  layerTypeFilter,
  setLayerTypeFilter,
  guidesVisible,
  rulerUnit,
  rulerOrigin,
  readOnly,
}) {
  const [layerDrag, setLayerDrag] = useState(null);
  const layerSelectionAnchorRef = useRef(null);
  const suppressLayerClickRef = useRef(false);
  const [guideLayerExpanded, setGuideLayerExpanded] = useState(false);
  const [objectLayerExpanded, setObjectLayerExpanded] = useState(true);
  const guideLayerContentId = useId();
  const objectLayerContentId = useId();
  const search = useListSearch("layers");
  const query = search.query.trim().toLocaleLowerCase("zh-Hant");
  const objects = [...board.objects]
    .reverse()
    .filter((object) =>
      query
        ? `${object.layerName} ${object.name}`.toLocaleLowerCase("zh-Hant").includes(query)
        : true,
    )
    .filter((object) => {
      if (layerTypeFilter === "guide") return false;
      if (layerTypeFilter === "all") return true;
      if (layerTypeFilter === "group") return Boolean(object.groupId);
      if (layerTypeFilter === "media") return ["image", "video"].includes(object.type);
      return object.type === layerTypeFilter;
    });
  const visibleSelected = board.objects.filter((object) => selectedIds.includes(object.id) && object.visible).length;
  const groupNames = new Map((board.groups || []).map((group) => [group.id, group.name]));
  const guideGroupNames = new Map((board.guideGroups || []).map((group) => [group.id, group.name]));
  const showGuideSection = ["all", "guide"].includes(layerTypeFilter);
  const filteredGuides = showGuideSection ? (board.guides || []).filter((guide) => {
    const origin = guide.axis === "x" ? Number(rulerOrigin?.x) || 0 : Number(rulerOrigin?.y) || 0;
    const orientation = guide.axis === "x" ? "垂直" : "水平";
    const groupName = guide.groupId ? guideGroupNames.get(guide.groupId) || "" : "";
    return matchesListQuery([orientation, `${orientation}導引線`, formatGuideValue(guide.position - origin, rulerUnit), groupName], query);
  }) : [];
  const filteredGuideGroups = showGuideSection ? (board.guideGroups || []).filter((group) => {
    const members = (board.guides || []).filter((guide) => group.memberIds.includes(guide.id));
    if (!members.length) return false;
    if (!query) return true;
    return matchesListQuery([
      group.name,
      ...members.flatMap((guide) => {
        const origin = guide.axis === "x" ? Number(rulerOrigin?.x) || 0 : Number(rulerOrigin?.y) || 0;
        return [guide.axis === "x" ? "垂直" : "水平", formatGuideValue(guide.position - origin, rulerUnit)];
      }),
    ], query);
  }) : [];
  const filteredGroups = (board.groups || []).filter((group) => {
    if (!["all", "group"].includes(layerTypeFilter)) return false;
    const members = board.objects.filter((object) => group.memberIds.includes(object.id));
    if (!members.length) return false;
    if (!query) return true;
    return `${group.name} ${members.map((object) => `${object.name} ${object.layerName}`).join(" ")}`.toLocaleLowerCase("zh-Hant").includes(query);
  });
  const resultCount = objects.length + filteredGroups.length + filteredGuides.length + filteredGuideGroups.length;
  const totalCount = board.objects.length + (board.groups || []).length + (board.guides || []).length + (board.guideGroups || []).length;
  const selectedGuideGroup = (board.guideGroups || []).find((group) => (
    selectedGuideIds.length === group.memberIds.length && group.memberIds.every((id) => selectedGuideIds.includes(id))
  ));

  useEffect(() => {
    if (query || layerTypeFilter === "guide") setGuideLayerExpanded(true);
    if (query || !["all", "guide"].includes(layerTypeFilter)) setObjectLayerExpanded(true);
  }, [layerTypeFilter, query]);

  const selectLayerRow = (event, object) => {
    if (suppressLayerClickRef.current) {
      event.preventDefault();
      suppressLayerClickRef.current = false;
      return;
    }
    const result = resolveLayerSelection({
      visibleIds: objects.map((item) => item.id),
      currentIds: selectedIds,
      targetId: object.id,
      anchorId: layerSelectionAnchorRef.current,
      shiftKey: event.shiftKey,
      toggleKey: event.metaKey || event.ctrlKey,
      defaultIds: selectionIdsForObject(board, object.id),
    });
    layerSelectionAnchorRef.current = result.anchorId;
    onSelectLayers(result.ids, result.keyId);
  };

  const startLayerDrag = (event, movingId) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const movingObject = objects.find((object) => object.id === movingId);
    const movingIds = selectedIds.includes(movingId) ? [...selectedIds] : [movingId];
    const movingSet = new Set(movingIds);
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    let dropTarget = null;

    const resolveTarget = (clientX, clientY) => {
      const row = document.elementFromPoint(clientX, clientY)?.closest("[data-layer-id]");
      const targetId = row?.dataset.layerId;
      if (!row || !targetId || movingSet.has(targetId)) return null;
      const rect = row.getBoundingClientRect();
      return {
        targetId,
        placement: row.dataset.dropPlacement || (clientY < rect.top + rect.height / 2 ? "before" : "after"),
      };
    };

    const move = (moveEvent) => {
      if (!dragging) {
        const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
        if (distance < 5) return;
        dragging = true;
        if (!selectedIds.includes(movingId)) {
          layerSelectionAnchorRef.current = movingId;
          onSelectLayers([movingId], movingId);
        }
        window.getSelection()?.removeAllRanges();
        setLayerDrag({ ids: movingIds, name: movingObject?.layerName || "圖層", targetId: null, placement: "before" });
      }
      moveEvent.preventDefault();
      dropTarget = resolveTarget(moveEvent.clientX, moveEvent.clientY);
      setLayerDrag({
        ids: movingIds,
        name: movingObject?.layerName || "圖層",
        targetId: dropTarget?.targetId || null,
        placement: dropTarget?.placement || "before",
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", cancelOnEscape, true);
    };
    const up = (upEvent) => {
      if (dragging) dropTarget = resolveTarget(upEvent.clientX, upEvent.clientY) || dropTarget;
      cleanup();
      if (dragging) {
        suppressLayerClickRef.current = true;
        globalThis.setTimeout(() => { suppressLayerClickRef.current = false; }, 0);
        if (dropTarget) onReorderLayer(movingIds, dropTarget.targetId, dropTarget.placement);
      }
      setLayerDrag(null);
    };
    const cancel = () => {
      cleanup();
      setLayerDrag(null);
    };
    const cancelOnEscape = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("keydown", cancelOnEscape, true);
  };

  return (
    <div className="panel-scroll layers-panel">
      <div className="panel-list-toolbar">
        <span>{`${resultCount} / ${totalCount}`}</span>
        <ListSearchToggle
          search={search}
          resultCount={resultCount}
          totalCount={totalCount}
          forceActive={layerTypeFilter !== "all"}
          label="搜尋或篩選圖層"
        />
      </div>
      <ListSearchField search={search} placeholder="搜尋圖層或物件">
        <div className="layer-type-filters" role="radiogroup" aria-label="依物件類型篩選圖層">
          {LAYER_TYPE_FILTERS.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={layerTypeFilter === value} className={layerTypeFilter === value ? "is-active" : ""} onClick={() => setLayerTypeFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </ListSearchField>
      {showGuideSection ? (
        <section className="guide-layer-section" aria-label="輔助導引線，顯示於所有物件上方">
          <div className="guide-layer-heading">
            <button
              className="layer-section-disclosure"
              type="button"
              aria-expanded={guideLayerExpanded}
              aria-controls={guideLayerContentId}
              onClick={() => setGuideLayerExpanded((current) => !current)}
            >
              <ChevronDown className={guideLayerExpanded ? "" : "is-collapsed"} size={15} aria-hidden="true" />
              <Ruler size={16} aria-hidden="true" />
              <strong>輔助導引線</strong>
              <small>{board.guides?.length || 0}</small>
            </button>
            <IconButton
              label={board.guidesLocked ? "解除鎖定所有輔助導引線" : "鎖定所有輔助導引線"}
              active={Boolean(board.guidesLocked)}
              aria-pressed={Boolean(board.guidesLocked)}
              disabled={readOnly}
              onClick={onToggleGuidesLocked}
            >{board.guidesLocked ? <Lock size={15} /> : <Unlock size={15} />}</IconButton>
          </div>
          <div className="guide-layer-content" id={guideLayerContentId} hidden={!guideLayerExpanded}>
            <p className="guide-layer-helper">{guidesVisible ? "固定顯示於所有物件上方，不會輸出。" : "工作區目前隱藏；仍可在這裡管理，且不會輸出。"}</p>
            {selectedGuideIds.length ? (
              <div className="guide-layer-bulk-actions" role="toolbar" aria-label={`${selectedGuideIds.length} 條選取導引線批次操作`}>
                <span><strong>{selectedGuideIds.length}</strong> 條選取</span>
                <IconButton
                  label={selectedGuideGroup ? `解散「${selectedGuideGroup.name}」` : "將選取導引線建立群組"}
                  onClick={onToggleSelectedGuideGroup}
                  disabled={readOnly || board.guidesLocked || selectedGuideIds.length < 2}
                >{selectedGuideGroup ? <X size={15} /> : <Layers3 size={15} />}</IconButton>
                <IconButton label="鎖定選取導引線" onClick={onLockSelectedGuides} disabled={readOnly || board.guidesLocked}><Lock size={15} /></IconButton>
                <IconButton className="danger-icon-button" label="刪除選取導引線" onClick={() => onDeleteGuides(selectedGuideIds)} disabled={readOnly || board.guidesLocked}><Trash2 size={15} /></IconButton>
              </div>
            ) : null}
            {filteredGuideGroups.length ? (
              <div className="guide-layer-group-list" aria-label="導引線群組">
              {filteredGuideGroups.map((group) => {
                const members = (board.guides || []).filter((guide) => group.memberIds.includes(guide.id));
                const selectableIds = members.filter((guide) => !guide.locked).map((guide) => guide.id);
                const selected = selectableIds.length > 0 && selectableIds.every((id) => selectedGuideIds.includes(id));
                const containsLocked = members.some((guide) => guide.locked);
                return (
                  <div className={`guide-layer-group-row ${selected ? "is-selected" : ""}`} key={group.id}>
                    <button type="button" onClick={(event) => onSelectGuideGroup(group.id, event.shiftKey)} aria-pressed={selected} disabled={board.guidesLocked || !selectableIds.length}>
                      <Layers3 size={15} /><span data-l10n-ignore>{group.name}</span><small>{group.memberIds.length}</small>
                    </button>
                    <IconButton label={`解散「${group.name}」`} onClick={() => onUngroupGuideGroup(group.id)} disabled={readOnly || board.guidesLocked || containsLocked}><X size={14} /></IconButton>
                  </div>
                );
              })}
              </div>
            ) : null}
            {filteredGuides.length ? (
              <div className="guide-layer-list" aria-label="導引線">
              {filteredGuides.map((guide) => {
                const selected = selectedGuideIds.includes(guide.id);
                const origin = guide.axis === "x" ? Number(rulerOrigin?.x) || 0 : Number(rulerOrigin?.y) || 0;
                const orientation = guide.axis === "x" ? "垂直" : "水平";
                const groupName = guide.groupId ? guideGroupNames.get(guide.groupId) : "";
                const blocked = Boolean(board.guidesLocked || guide.locked);
                return (
                  <div className={`guide-layer-row ${selected ? "is-selected" : ""} ${blocked ? "is-locked" : ""}`} key={guide.id}>
                    <button
                      className="guide-layer-main"
                      type="button"
                      onClick={(event) => onSelectGuide(guide.id, event.shiftKey, event.metaKey || event.ctrlKey)}
                      aria-pressed={selected}
                      disabled={blocked}
                    >
                      <span className={`guide-layer-orientation is-${guide.axis === "x" ? "vertical" : "horizontal"}`} aria-hidden="true" />
                      <span><strong>{`${orientation}導引線`}</strong><small data-l10n-ignore>{`${formatGuideValue(guide.position - origin, rulerUnit)}${groupName ? ` · ${groupName}` : ""}`}</small></span>
                      {guide.locked || board.guidesLocked ? <Lock size={13} aria-label="已鎖定" /> : null}
                    </button>
                    <div className="guide-layer-actions">
                      <IconButton
                        label={guide.locked ? `解除鎖定${orientation}導引線` : `鎖定${orientation}導引線`}
                        onClick={() => onToggleGuideLocked(guide)}
                        disabled={readOnly || board.guidesLocked}
                      >{guide.locked ? <Unlock size={14} /> : <Lock size={14} />}</IconButton>
                      <IconButton className="danger-icon-button" label={`刪除${orientation}導引線`} onClick={() => onDeleteGuides([guide.id], true)} disabled={readOnly || board.guidesLocked}><Trash2 size={14} /></IconButton>
                    </div>
                  </div>
                );
              })}
              </div>
            ) : (
              <div className="guide-layer-empty"><span>{board.guides?.length ? "找不到符合的導引線" : "尚未建立導引線"}</span></div>
            )}
          </div>
        </section>
      ) : null}
      {layerTypeFilter !== "guide" ? (
        <section className="object-layer-section" aria-label="一般圖層">
          <div className="object-layer-heading">
            <button
              className="layer-section-disclosure"
              type="button"
              aria-expanded={objectLayerExpanded}
              aria-controls={objectLayerContentId}
              onClick={() => setObjectLayerExpanded((current) => !current)}
            >
              <ChevronDown className={objectLayerExpanded ? "" : "is-collapsed"} size={15} aria-hidden="true" />
              <Layers3 size={16} aria-hidden="true" />
              <strong>一般圖層</strong>
              <small>{board.objects.length}</small>
            </button>
          </div>
          <div className="object-layer-content" id={objectLayerContentId} hidden={!objectLayerExpanded}>
            {selectedIds.length ? (
              <div className="layer-bulk-actions" role="toolbar" aria-label={`${selectedIds.length} 個選取物件批次操作`}>
                <span><strong>{selectedIds.length}</strong> 個選取</span>
                <IconButton label="顯示選取物件" onClick={() => onSetSelectedVisibility(true)} disabled={visibleSelected === selectedIds.length}><Eye size={15} /></IconButton>
                <IconButton label="隱藏選取物件" onClick={() => onSetSelectedVisibility(false)} disabled={!visibleSelected}><EyeOff size={15} /></IconButton>
                <IconButton label="批次匯出每個選取物件" onClick={onExportSelected}><Download size={15} /></IconButton>
                <IconButton label="將選取物件輸出為一張合成圖" onClick={onOutputSelected}><ImageDown size={15} /></IconButton>
                <IconButton className="danger-icon-button" label="批次刪除選取物件" onClick={onDeleteSelected}><Trash2 size={15} /></IconButton>
              </div>
            ) : null}
            {filteredGroups.length ? (
              <div className="layer-group-list" aria-label="群組">
                {filteredGroups.map((group) => {
                  const selected = group.memberIds.length > 0 && group.memberIds.every((id) => selectedIds.includes(id));
                  return (
                    <div className={`layer-group-row ${selected ? "is-selected" : ""}`} key={group.id}>
                      <button type="button" onClick={(event) => onSelectGroup(group.id, event.shiftKey)} aria-pressed={selected}>
                        <Layers3 size={16} /><span data-l10n-ignore>{group.name}</span><small>{group.memberIds.length}</small>
                      </button>
                      <IconButton label={`解散「${group.name}」`} onClick={() => onUngroup(group.id)}><X size={14} /></IconButton>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {objects.length ? (
              <div className="layer-list">
                {objects.map((object) => {
            const selected = selectedIds.includes(object.id);
            const groupName = object.groupId ? groupNames.get(object.groupId) : "";
            const dropBefore = layerDrag?.targetId === object.id && layerDrag.placement === "before";
            const dropAfter = layerDrag?.targetId === object.id && layerDrag.placement === "after";
            const renderPlaceholder = (placement) => (
              <div
                className="layer-drop-indicator"
                data-layer-id={object.id}
                data-drop-placement={placement}
                aria-hidden="true"
              />
            );
            return (
              <React.Fragment key={object.id}>
                {dropBefore ? renderPlaceholder("before") : null}
                <div
                  className={`layer-row ${selected ? "is-selected" : ""} ${layerDrag?.ids?.includes(object.id) ? "is-dragging" : ""} ${object.groupId ? "is-group-member" : ""} ${isArtboardObject(object) ? "is-artboard" : ""}`}
                  data-layer-id={object.id}
                >
                  <button
                    className="layer-main"
                    type="button"
                    onClick={(event) => selectLayerRow(event, object)}
                    onPointerDown={(event) => startLayerDrag(event, object.id)}
                    onDoubleClick={() => onLocate(object.id)}
                    onKeyDown={(event) => {
                      if (!event.altKey) return;
                      const movingIds = selectedIds.includes(object.id) ? selectedIds : [object.id];
                      if (event.key === "ArrowUp") { event.preventDefault(); onMoveLayer(movingIds, 1); }
                      if (event.key === "ArrowDown") { event.preventDefault(); onMoveLayer(movingIds, -1); }
                    }}
                    aria-pressed={selected}
                    title="點擊選取；Shift 連續選取；Command/Ctrl 個別加入；按住拖曳排序；Option/Alt + ↑/↓ 微調順序；連按兩下置中顯示"
                  >
                    <MediaElement object={object} decorative />
                    <span>
                      <strong data-l10n-ignore>{object.layerName}</strong>
                      <small data-l10n-ignore>{`${isArtboardObject(object) ? `${object.name} · ${PAPER_PRESETS[object.paperPreset]?.label || "紙張"}` : object.annotationKind ? `${object.name} · ${object.annotationKind === "title" ? "標題" : "說明"}` : object.name}${groupName ? ` · ${groupName}` : ""}`}</small>
                    </span>
                    {object.markers.length ? (
                      <span className="layer-markers" aria-label={`${object.markers.length} 個標記`}>
                        {object.markers.slice(0, 3).map((marker) => (
                          <MarkerIcon key={markerKey(marker)} symbol={marker.symbol} color={marker.color} size={12} />
                        ))}
                      </span>
                    ) : null}
                  </button>
                  <div className="layer-actions">
                    <IconButton label={`將「${object.layerName}」置中顯示`} onClick={() => onLocate(object.id)}>
                      <LocateFixed size={15} />
                    </IconButton>
                    <IconButton label={`複製圖層「${object.layerName}」`} onClick={() => onDuplicateLayer(object.id)}>
                      <Copy size={15} />
                    </IconButton>
                    <IconButton label={object.visible ? "隱藏圖層" : "顯示圖層"} onClick={() => onToggleVisible(object.id)}>
                      {object.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </IconButton>
                    <IconButton className="danger-icon-button" label={`刪除圖層「${object.layerName}」；可按 ⌘Z 復原`} onClick={() => onDeleteLayer(object.id)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
                {dropAfter ? renderPlaceholder("after") : null}
              </React.Fragment>
            );
                })}
                <span className="sr-only" aria-live="polite">
                  {layerDrag?.targetId
                    ? `將「${layerDrag.name}」放在「${objects.find((object) => object.id === layerDrag.targetId)?.layerName || "目標圖層"}」${layerDrag.placement === "before" ? "上方" : "下方"}`
                    : ""}
                </span>
              </div>
            ) : (
              <div className="panel-empty">
                <Layers3 size={24} />
                <strong>{board.objects.length ? "找不到符合的圖層" : "還沒有圖層"}</strong>
                <p>{board.objects.length ? "保留搜尋內容，調整關鍵字或清除搜尋。" : "加入文字、形狀或素材後，每個物件會自動建立自己的圖層。"}</p>
                {query ? <button type="button" className="text-button" onClick={() => search.setQuery("")}>清除搜尋</button> : null}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FiltersPanel({ board, filters, setFilters, matchCount }) {
  const active = filters.symbols.length + filters.colors.length > 0;
  const toggle = (kind, value) => {
    setFilters((current) => ({
      ...current,
      [kind]: current[kind].includes(value)
        ? current[kind].filter((item) => item !== value)
        : [...current[kind], value],
    }));
  };

  return (
    <div className="panel-scroll filters-panel">
      <div className="filter-heading">
        <div>
          <strong>把物件叫來排隊</strong>
          <p>篩選只改變暫時視圖；清除後會回到原本位置。</p>
        </div>
        {active ? <span>{matchCount} / {board.objects.length}</span> : null}
      </div>

      <fieldset>
        <legend>符號</legend>
        <div className="filter-symbol-grid">
          {MARKER_SYMBOLS.map((symbol) => {
            const Icon = MARKER_ICONS[symbol];
            const selected = filters.symbols.includes(symbol);
            const count = board.objects.filter((object) => object.markers.some((marker) => marker.symbol === symbol)).length;
            return (
              <button
                key={symbol}
                type="button"
                className={selected ? "is-active" : ""}
                onClick={() => toggle("symbols", symbol)}
                aria-pressed={selected}
              >
                <Icon size={18} />
                <span>{MARKER_LABELS[symbol]}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>色彩</legend>
        <div className="filter-color-grid">
          {MARKER_COLORS.map((color) => {
            const selected = filters.colors.includes(color);
            const count = board.objects.filter((object) => object.markers.some((marker) => marker.color === color)).length;
            return (
              <button
                key={color}
                type="button"
                className={selected ? "is-active" : ""}
                onClick={() => toggle("colors", color)}
                aria-pressed={selected}
              >
                <span style={{ background: MARKER_COLOR_VALUES[color] }} />
                <strong>{MARKER_COLOR_LABELS[color]}</strong>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>符合方式</legend>
        <div className="segmented-control">
          <button type="button" className={filters.mode === "any" ? "is-active" : ""} onClick={() => setFilters((current) => ({ ...current, mode: "any" }))}>
            任一標記
          </button>
          <button type="button" className={filters.mode === "all" ? "is-active" : ""} onClick={() => setFilters((current) => ({ ...current, mode: "all" }))}>
            全部符合
          </button>
        </div>
      </fieldset>

      {active ? (
        <button className="secondary-button full-width" type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>
          <X size={16} /> 清除篩選，回到原位
        </button>
      ) : (
        <div className="filter-tip">
          <Sparkles size={18} />
          <p>先為物件加上符號和色彩，再從這裡組合篩選。</p>
        </div>
      )}
    </div>
  );
}

function CaptureThumbnail({ capture, board }) {
  const mediaById = new Map(board.objects.map((object) => [object.id, object]));
  const width = Math.max(1, capture.viewport.width);
  const height = Math.max(1, capture.viewport.height);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${capture.name} 預覽`} preserveAspectRatio="xMidYMid slice">
      <rect width={width} height={height} fill="var(--canvas-bg)" />
      <g opacity="0.32">
        {Array.from({ length: Math.ceil(width / 36) + 1 }, (_, index) => <line key={`x-${index}`} x1={index * 36} y1="0" x2={index * 36} y2={height} stroke="var(--text-muted)" strokeWidth="1" />)}
        {Array.from({ length: Math.ceil(height / 36) + 1 }, (_, index) => <line key={`y-${index}`} x1="0" y1={index * 36} x2={width} y2={index * 36} stroke="var(--text-muted)" strokeWidth="1" />)}
      </g>
      {capture.objects.filter((state) => state.visible).map((state) => {
        const object = mediaById.get(state.id);
        if (!object) return null;
        const anchor = ANCHORS[state.anchor] || ANCHORS.mc;
        const scaledWidth = state.width * capture.view.zoom;
        const scaledHeight = state.height * capture.view.zoom;
        const pivotX = capture.view.x + state.pivotX * capture.view.zoom;
        const pivotY = capture.view.y + state.pivotY * capture.view.zoom;
        return (
          <g key={state.id} transform={`translate(${pivotX} ${pivotY}) rotate(${state.rotation})`}>
            {isVideoObject(object) ? (
              <g>
                <rect x={-anchor.x * scaledWidth} y={-anchor.y * scaledHeight} width={scaledWidth} height={scaledHeight} rx="5" fill="var(--surface-strong)" stroke="var(--accent-ui)" strokeOpacity="0.55" />
                <circle cx={(0.5 - anchor.x) * scaledWidth} cy={(0.5 - anchor.y) * scaledHeight} r={Math.max(8, Math.min(scaledWidth, scaledHeight) * 0.11)} fill="var(--accent-fill)" fillOpacity="0.86" />
                <path d="M -3 -5 L 6 0 L -3 5 Z" transform={`translate(${(0.5 - anchor.x) * scaledWidth} ${(0.5 - anchor.y) * scaledHeight})`} fill="var(--accent-on)" />
              </g>
            ) : isTextObject(object) ? (
              <foreignObject x={-anchor.x * scaledWidth} y={-anchor.y * scaledHeight} width={scaledWidth} height={scaledHeight}>
                <div
                  xmlns="http://www.w3.org/1999/xhtml"
                  style={{
                    boxSizing: "border-box",
                    color: displayTextColor(object.color),
                    height: "100%",
                    fontFamily: object.fontFamily,
                    fontSize: Math.max(3, (state.fontSize || object.fontSize) * capture.view.zoom),
                    fontWeight: object.fontWeight,
                    lineHeight: Number(object.lineHeight) || 1.2,
                    overflow: "hidden",
                    overflowWrap: "anywhere",
                    whiteSpace: "pre-wrap",
                    width: "100%",
                    ...textLayoutStyle(object),
                  }}
                >
                  {objectDisplayText(object)}
                </div>
              </foreignObject>
            ) : isShapeObject(object) ? (
              <g transform={`translate(${-anchor.x * scaledWidth} ${-anchor.y * scaledHeight}) scale(${scaledWidth / 100} ${scaledHeight / 100})`}>
                {shapeSvgPoints(object) ? <polygon points={shapeSvgPoints(object)} fill={object.fill} /> : <rect x="1" y="1" width="98" height="98" rx="2" fill={object.fill} />}
              </g>
            ) : (
              <image href={object.src} x={-anchor.x * scaledWidth} y={-anchor.y * scaledHeight} width={scaledWidth} height={scaledHeight} preserveAspectRatio="none" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function CapturesPanel({
  board,
  selectedCaptureId,
  onCapture,
  onRestoreCapture,
  onRestoreLastComposition,
  onReplaceCapture,
  onMoveCapture,
  onReorderCapture,
  onDeleteCapture,
}) {
  const [captureDrag, setCaptureDrag] = useState(null);
  const search = useListSearch("captures");
  const selectedCapture = board.captures.find((capture) => capture.id === selectedCaptureId);
  const captures = [...board.captures]
    .reverse()
    .filter((capture) => matchesListQuery([capture.name, formatTime(capture.updatedAt), `${Math.round(capture.view.zoom * 100)}%`], search.query));

  const startCaptureDrag = (event, movingId) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    const movingCapture = captures.find((capture) => capture.id === movingId);
    let dropTarget = null;
    setCaptureDrag({ id: movingId, name: movingCapture?.name || "構圖", targetId: null, placement: "before" });

    const resolveTarget = (clientX, clientY) => {
      const row = document.elementFromPoint(clientX, clientY)?.closest("[data-capture-id]");
      const targetId = row?.dataset.captureId;
      if (!row || !targetId || targetId === movingId) return null;
      const rect = row.getBoundingClientRect();
      return {
        targetId,
        placement: row.dataset.dropPlacement || (clientY < rect.top + rect.height / 2 ? "before" : "after"),
      };
    };

    const move = (moveEvent) => {
      dropTarget = resolveTarget(moveEvent.clientX, moveEvent.clientY);
      setCaptureDrag({
        id: movingId,
        name: movingCapture?.name || "構圖",
        targetId: dropTarget?.targetId || null,
        placement: dropTarget?.placement || "before",
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", cancelOnEscape, true);
    };
    const up = (upEvent) => {
      dropTarget = resolveTarget(upEvent.clientX, upEvent.clientY) || dropTarget;
      cleanup();
      if (dropTarget) onReorderCapture(movingId, dropTarget.targetId, dropTarget.placement);
      setCaptureDrag(null);
    };
    const cancel = () => {
      cleanup();
      setCaptureDrag(null);
    };
    const cancelOnEscape = (keyEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("keydown", cancelOnEscape, true);
  };

  return (
    <div className="panel-scroll captures-panel">
      <div className="capture-heading">
        <div>
          <strong>構圖</strong>
          <p>保存目前物件與視窗；切換前會自動保留當下構圖。</p>
        </div>
        <ListSearchToggle search={search} resultCount={captures.length} totalCount={board.captures.length} label="搜尋構圖" />
      </div>
      <ListSearchField search={search} placeholder="搜尋構圖名稱" />
      <button className="primary-button full-width capture-button" type="button" onClick={onCapture}>
        <Camera size={17} /> 記錄目前構圖
      </button>
      {board.lastComposition ? (
        <button className="last-composition-card" type="button" onClick={onRestoreLastComposition}>
          <span className="last-composition-preview"><CaptureThumbnail capture={board.lastComposition} board={board} /></span>
          <span>
            <strong>回到切換前構圖</strong>
            <small>{`${Math.round(board.lastComposition.view.zoom * 100)}% · ${board.lastComposition.objects.length} 個物件`}</small>
            <time dateTime={board.lastComposition.updatedAt}>{formatTime(board.lastComposition.updatedAt)}</time>
          </span>
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      ) : null}
      {captures.length ? (
        <div className="capture-list">
          {captures.map((capture) => {
            const dropBefore = captureDrag?.targetId === capture.id && captureDrag.placement === "before";
            const dropAfter = captureDrag?.targetId === capture.id && captureDrag.placement === "after";
            const renderPlaceholder = (placement) => (
              <div
                className="capture-drop-indicator"
                data-capture-id={capture.id}
                data-drop-placement={placement}
                aria-hidden="true"
              />
            );
            return (
              <React.Fragment key={capture.id}>
                {dropBefore ? renderPlaceholder("before") : null}
                <div
                  className={`capture-row ${selectedCaptureId === capture.id ? "is-selected" : ""} ${captureDrag?.id === capture.id ? "is-dragging" : ""}`}
                  data-capture-id={capture.id}
                >
                  <button
                    className="capture-drag-handle"
                    type="button"
                    aria-label={`拖曳「${capture.name}」調整構圖順序`}
                    aria-pressed={captureDrag?.id === capture.id}
                    title="按住拖曳排序；鍵盤可用上下方向鍵"
                    onClick={(event) => event.preventDefault()}
                    onPointerDown={(event) => startCaptureDrag(event, capture.id)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") { event.preventDefault(); onMoveCapture(capture.id, 1); }
                      if (event.key === "ArrowDown") { event.preventDefault(); onMoveCapture(capture.id, -1); }
                    }}
                  >
                    <GripVertical size={16} />
                  </button>
                  <button
                    className="capture-card"
                    type="button"
                    aria-pressed={selectedCaptureId === capture.id}
                    onClick={() => onRestoreCapture(capture)}
                  >
                    <span className="capture-preview"><CaptureThumbnail capture={capture} board={board} /></span>
                    <span className="capture-copy">
                      <strong data-l10n-ignore>{capture.name}</strong>
                      <small>{`${Math.round(capture.view.zoom * 100)}% · ${capture.objects.length} 個物件`}</small>
                      <time dateTime={capture.updatedAt}>{formatTime(capture.updatedAt)}</time>
                    </span>
                  </button>
                  <IconButton className="capture-delete-button" label={`刪除「${capture.name}」`} onClick={() => onDeleteCapture(capture.id)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                {dropAfter ? renderPlaceholder("after") : null}
              </React.Fragment>
            );
          })}
          <span className="sr-only" aria-live="polite">
            {captureDrag?.targetId
              ? `將「${captureDrag.name}」放在「${captures.find((capture) => capture.id === captureDrag.targetId)?.name || "目標構圖"}」${captureDrag.placement === "before" ? "上方" : "下方"}`
              : ""}
          </span>
        </div>
      ) : board.captures.length ? (
        <div className="panel-empty capture-empty">
          <Search size={25} />
          <strong>找不到符合的構圖</strong>
          <p>搜尋條件會保留，可以調整或清除。</p>
          <button type="button" className="text-button" onClick={() => search.setQuery("")}>清除搜尋</button>
        </div>
      ) : (
        <div className="panel-empty capture-empty">
          <Images size={25} />
          <strong>還沒有構圖</strong>
          <p>把常用構圖存成縮圖，之後可一鍵回復位置、大小、角度與視窗。</p>
        </div>
      )}
      {selectedCapture ? (
        <button className="secondary-button full-width replace-capture-button" type="button" onClick={() => onReplaceCapture(selectedCapture)}>
          <RotateCcw size={16} /> 以目前構圖取代選取項目
        </button>
      ) : null}
    </div>
  );
}

function SourcesPanel({ sourceAssets, board }) {
  const imageCount = sourceAssets.filter(({ representative }) => !isVideoObject(representative)).length;
  const videoCount = sourceAssets.length - imageCount;
  const instanceCount = sourceAssets.reduce((total, source) => total + source.instanceIds.length, 0);
  return (
    <div className="panel-scroll sources-panel">
      <div className="source-heading">
        <div>
          <strong>來源素材</strong>
          <p>每個匯入來源只列一次；主工作區可切換縮圖與原圖。</p>
        </div>
        <span>{sourceAssets.length}</span>
      </div>
      <div className="source-model-note">
        <Copy size={18} />
        <div>
          <strong>複製品是獨立實例</strong>
          <p>每份複製品都有自己的物件、圖層、位置與標記，但沿用同一份來源素材。</p>
        </div>
      </div>
      {sourceAssets.length ? (
        <dl className="source-stats">
          <div><dt>圖片 / SVG</dt><dd>{imageCount}</dd></div>
          <div><dt>影片</dt><dd>{videoCount}</dd></div>
          <div><dt>畫布實例</dt><dd>{instanceCount} / {board.objects.length}</dd></div>
        </dl>
      ) : (
        <div className="panel-empty source-empty">
          <ImageIcon size={25} />
          <strong>還沒有來源素材</strong>
          <p>加入圖片、影片或 SVG 後，每個來源會在這裡只列一次。</p>
        </div>
      )}
      {sourceAssets.length ? <p className="source-panel-tip">提示：連按主工作區中的縮圖兩下，可直接開啟原圖檢視。</p> : null}
    </div>
  );
}

function PanelEdge({ side, visible, mobile = false, onToggle, width, min, max, onResizeStart, onResizeKeyDown, onResetWidth }) {
  const isLeft = side === "left";
  const label = isLeft ? "左側欄" : "右側欄";
  const clickTimer = useRef(null);
  const dragState = useRef({ startX: 0, moved: false });
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const start = (event) => {
    if (mobile || !visible || event.button !== 0) return;
    dragState.current = { startX: event.clientX, moved: false };
    const track = (moveEvent) => { if (Math.abs(moveEvent.clientX - dragState.current.startX) > 4) dragState.current.moved = true; };
    const stop = () => { window.removeEventListener("pointermove", track); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
    window.addEventListener("pointermove", track);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
    onResizeStart?.(event);
  };
  const click = (event) => {
    if (dragState.current.moved) { dragState.current.moved = false; return; }
    if (mobile || !visible || event.detail === 0) { onToggle(); return; }
    if (event.detail > 1) { window.clearTimeout(clickTimer.current); return; }
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(onToggle, 280);
  };
  const reset = () => { window.clearTimeout(clickTimer.current); if (!mobile && visible) onResetWidth?.(); };
  return <div className={`panel-edge is-${side} ${visible ? "is-open" : "is-closed"} ${mobile ? "is-mobile" : "is-desktop"}`}>
    <button className="panel-edge-toggle" type="button" onClick={click} onDoubleClick={reset} onPointerDown={start} onKeyDown={visible ? onResizeKeyDown : undefined} aria-label={`${visible ? "收合" : "展開"}${label}`} aria-expanded={visible} title={visible ? (mobile ? `收合${label}` : `點擊收合${label}；拖曳調整寬度；雙擊恢復預設`) : `展開${label}`}>
      <span className="panel-edge-dots" aria-hidden="true" />
    </button>
  </div>;
}

function LeftSidebar(props) {
  const {
    leftTab,
    setLeftTab,
    mobilePanel,
    setMobilePanel,
  } = props;
  return (
    <aside className={`left-sidebar ${mobilePanel === "left" ? "is-mobile-open" : ""}`} aria-label="圖層、分群、素材與構圖">
      <div className="sidebar-heading">
        <div className="sidebar-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={leftTab === "layers"} className={leftTab === "layers" ? "is-active" : ""} onClick={() => setLeftTab("layers")}>
            <Layers3 size={17} /> 圖層
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "filters"} className={leftTab === "filters" ? "is-active" : ""} onClick={() => setLeftTab("filters")}>
            <Tags size={17} /> 分群
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "sources"} className={leftTab === "sources" ? "is-active" : ""} onClick={() => setLeftTab("sources")}>
            <ImageIcon size={17} /> 素材
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "captures"} className={leftTab === "captures" ? "is-active" : ""} onClick={() => setLeftTab("captures")}>
            <Camera size={17} /> 構圖
          </button>
        </div>
        <IconButton className="mobile-close" label="關閉側欄" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
      </div>
      {leftTab === "layers" ? <LayersPanel {...props} /> : null}
      {leftTab === "filters" ? <FiltersPanel {...props} /> : null}
      {leftTab === "sources" ? <SourcesPanel {...props} /> : null}
      {leftTab === "captures" ? <CapturesPanel {...props} /> : null}
    </aside>
  );
}

function Micro3DControls({ objects, onChange, active, onActiveChange }) {
  const first = objects[0];
  if (!first) return null;

  return (
    <section className={`inspector-section micro-3d-section ${active ? "is-active" : ""}`}>
      <div className="section-heading-row">
        <h3>進階 3D</h3>
        <button
          className={`micro-3d-mode-toggle ${active ? "is-active" : ""}`}
          type="button"
          role="switch"
          aria-checked={active}
          onClick={() => onActiveChange(!active)}
        >
          <Box size={15} /> {active ? "3D 操作中" : "切換到 3D"}
        </button>
      </div>
      {active ? (
        <FeatureChunkBoundary label="3D 控制器">
          <React.Suspense fallback={<FeatureChunkLoading label="3D 控制器" />}>
            <LazyMicro3DActiveControls objects={objects} onChange={onChange} />
          </React.Suspense>
        </FeatureChunkBoundary>
      ) : (
        <p className="micro-3d-inactive-copy">一般選取維持 2D 操作；切換後選取物件會改用 3D 軌道游標與旋轉操作。</p>
      )}
    </section>
  );
}

function ObjectColorSetControl({
  label,
  value,
  colorSetsState,
  onChange,
  onSelectSet,
  onAdd,
  onCreateSet,
  onRenameSet,
  onRemoveColor,
  onDeleteSet,
  onLoad,
  onExport,
}) {
  const activeSet = activeObjectColorSet(colorSetsState);
  const currentColor = String(value || "#000000").toUpperCase();
  const [managerOpen, setManagerOpen] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [renameDraft, setRenameDraft] = useState(activeSet.name);
  const managerId = useId();

  useEffect(() => {
    setRenameDraft(activeSet.name);
  }, [activeSet.id, activeSet.name]);

  const createSet = () => {
    const name = newSetName.trim();
    if (!name) return;
    onCreateSet(name);
    setNewSetName("");
  };

  return (
    <div className="object-color-control">
      <label>
        <span>{label}</span>
        <span className="color-input-row">
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
          <code>{currentColor}</code>
        </span>
      </label>
      <div className="object-color-library-heading">
        <strong>色彩組合</strong>
        <small>全域可用 · 儲存在這台裝置</small>
      </div>
      <label className="object-color-set-selector">
        <span className="sr-only">目前色彩組合</span>
        <select value={activeSet.id} onChange={(event) => onSelectSet(event.target.value)}>
          {colorSetsState.sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
        </select>
      </label>
      <div className="object-color-swatches" role="group" aria-label={`${label}色彩組合 ${activeSet.name}`}>
        {activeSet.colors.map((color) => {
          const active = color === currentColor;
          return (
            <button
              key={color}
              type="button"
              aria-pressed={active}
              className={active ? "is-active" : ""}
              style={{ "--object-swatch": color }}
              title={color}
              onClick={() => onChange(color)}
            >
              {active ? <Check size={12} aria-hidden="true" /> : null}
              <span className="sr-only">{color}</span>
            </button>
          );
        })}
        {!activeSet.colors.length ? <p className="object-color-set-empty">這組色彩尚未加入色票。</p> : null}
      </div>
      <div className="object-color-library-actions">
        <button type="button" onClick={() => onAdd(currentColor)}><Plus size={14} /> 加入目前色彩</button>
        <button type="button" aria-expanded={managerOpen} aria-controls={managerId} onClick={() => setManagerOpen((open) => !open)}><Palette size={14} /> 管理</button>
      </div>
      {managerOpen ? (
        <div id={managerId} className="object-color-set-manager" aria-label="管理色彩組合">
          <div className="object-color-set-manager-heading">
            <strong>{activeSet.name}</strong>
            <small>{activeSet.builtin ? "內建組合 · 唯讀" : `${activeSet.colors.length} 個色彩`}</small>
          </div>
          {!activeSet.builtin ? (
            <>
              <div className="object-color-set-edit-row">
                <label><span className="sr-only">重新命名色彩組合</span><input maxLength={48} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} /></label>
                <button type="button" disabled={!renameDraft.trim() || renameDraft.trim() === activeSet.name} onClick={() => onRenameSet(activeSet.id, renameDraft)}><Save size={14} /><span>儲存名稱</span></button>
              </div>
              {activeSet.colors.length ? (
                <div className="object-color-set-removals" role="group" aria-label={`移除 ${activeSet.name} 的色彩`}>
                  {activeSet.colors.map((color) => (
                    <button key={color} type="button" style={{ "--object-swatch": color }} aria-label={`移除 ${color}`} title={`移除 ${color}`} onClick={() => onRemoveColor(activeSet.id, color)}><X size={11} /></button>
                  ))}
                </div>
              ) : null}
            </>
          ) : <p className="object-color-set-helper">內建色票保持不變；加入目前色彩時會自動建立「我的色彩」。</p>}
          <div className="object-color-set-create-row">
            <label><span className="sr-only">新色彩組合名稱</span><input maxLength={48} value={newSetName} placeholder="新色彩組合名稱" onChange={(event) => setNewSetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createSet(); } }} /></label>
            <button type="button" disabled={!newSetName.trim()} onClick={createSet}><Plus size={14} /><span>新增組合</span></button>
          </div>
          <div className="object-color-set-file-actions">
            <button type="button" onClick={onLoad}><FolderOpen size={14} /> 匯入</button>
            <button type="button" onClick={onExport}><Download size={14} /> 匯出全部</button>
            <button className="is-danger" type="button" disabled={activeSet.builtin || colorSetsState.sets.length <= 1} onClick={() => onDeleteSet(activeSet.id)}><Trash2 size={14} /> 刪除組合</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatCommittedNumber(value, precision = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (!Number.isInteger(precision) || precision < 0) return String(number);
  const factor = 10 ** precision;
  return String(Math.round(number * factor) / factor);
}

function CommittedNumberInput({ value, onCommit, min, max, step = 1, precision = 0, ...props }) {
  const formattedValue = formatCommittedNumber(value, precision);
  const [draft, setDraft] = useState(formattedValue);
  const [editing, setEditing] = useState(false);
  const cancelBlurRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(formattedValue);
  }, [editing, formattedValue]);

  const commitDraft = () => {
    if (!dirtyRef.current) {
      setDraft(formattedValue);
      setEditing(false);
      return;
    }
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(formattedValue);
      setEditing(false);
      dirtyRef.current = false;
      return;
    }
    const next = Math.min(
      Number.isFinite(Number(max)) ? Number(max) : Number.POSITIVE_INFINITY,
      Math.max(Number.isFinite(Number(min)) ? Number(min) : Number.NEGATIVE_INFINITY, parsed),
    );
    setDraft(formatCommittedNumber(next, precision));
    setEditing(false);
    dirtyRef.current = false;
    if (Math.abs(next - Number(value)) > 0.000001) onCommit(next);
  };

  return (
    <input
      {...props}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      onFocus={() => {
        cancelBlurRef.current = false;
        dirtyRef.current = false;
        setDraft(formattedValue);
        setEditing(true);
      }}
      onChange={(event) => {
        dirtyRef.current = true;
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (cancelBlurRef.current) {
          cancelBlurRef.current = false;
          dirtyRef.current = false;
          setDraft(formattedValue);
          setEditing(false);
          return;
        }
        commitDraft();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelBlurRef.current = true;
          dirtyRef.current = false;
          setDraft(formattedValue);
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function Inspector({
  board,
  selectedIds,
  onUpdateObject,
  onPivotChange,
  onRestoreSize,
  onResetRotation,
  onSetAspectLock,
  onMicro3DChange,
  micro3DMode,
  onMicro3DModeChange,
  markerDraft,
  setMarkerDraft,
  onAddMarker,
  onRemoveMarker,
  batchPrefix,
  setBatchPrefix,
  onBatchRename,
  selectionAnchor,
  onSelectionAnchorChange,
  keyObjectId,
  onAlign,
  onDistribute,
  resizeGesture,
  groupGesture,
  localFontOptions,
  localFontState,
  onLoadLocalFonts,
  onStartTextEdit,
  onResizeTextFrame,
  onFitArtboard,
  onResizeArtboardPreset,
  selectionGrouped,
  onToggleGroup,
  objectColorSets,
  onSelectObjectColorSet,
  onAddObjectColor,
  onCreateObjectColorSet,
  onRenameObjectColorSet,
  onRemoveObjectColor,
  onDeleteObjectColorSet,
  onLoadObjectColorSets,
  onExportObjectColorSets,
  readOnly = false,
  mobilePanel,
  setMobilePanel,
}) {
  const selected = board.objects.filter((object) => selectedIds.includes(object.id));
  const object = selected.length === 1 ? selected[0] : null;
  const keyObject = selected.find((item) => item.id === keyObjectId) || selected[0];
  const allAspectLocked = selectionAspectLocked(board, selectedIds);
  const activeResize = object && resizeGesture?.objectId === object.id ? resizeGesture : selected.length > 1 && groupGesture?.type === "scale" ? groupGesture : null;
  const temporaryUnlocked = Boolean(activeResize?.shift && allAspectLocked);
  const effectiveAspectLocked = allAspectLocked && !temporaryUnlocked;
  const knownFont = object && [...FONT_OPTIONS, ...localFontOptions].some((font) => font.value === object.fontFamily);
  const printSizePreset = object && SHAPE_PRINT_SIZE_PRESETS.find((preset) => preset.width === Math.round(object.width) && preset.height === Math.round(object.height));
  const socialSizePreset = object && SHAPE_SOCIAL_SIZE_PRESETS.find((preset) => preset.width === Math.round(object.width) && preset.height === Math.round(object.height));
  const activeStarStyle = object?.shapeKind === "star"
    ? STAR_STYLE_PRESETS.find((preset) => preset.starPoints === object.starPoints && Math.abs(preset.starInnerRatio - object.starInnerRatio) < 0.001)
    : null;
  const minimumDimension = object && ["image", "video"].includes(object.type) ? 1 : 24;

  const updateDimension = (dimension, nextValue) => {
    if (!object) return;
    const value = Math.max(minimumDimension, Number(nextValue) || minimumDimension);
    const ratio = object.width / object.height || 1;
    const patch = object.aspectLocked === false
      ? { [dimension]: value }
      : dimension === "width"
        ? { width: value, height: Math.max(minimumDimension, value / ratio) }
        : { height: value, width: Math.max(minimumDimension, value * ratio) };
    if (isTextObject(object) && patch.height) {
      patch.fontSize = Math.max(6, object.fontSize * (patch.height / object.height));
    }
    if (isArtboardObject(object)) patch.paperPreset = "custom";
    onUpdateObject(object.id, patch);
  };

  const applyShapeSizePreset = (preset) => {
    if (!object || !preset) return;
    onUpdateObject(object.id, resizeObjectToDimensions(object, preset.width, preset.height));
  };

  return (
    <aside className={`inspector ${mobilePanel === "right" ? "is-mobile-open" : ""}`} aria-label="物件屬性">
      <div className="inspector-heading">
        <div>
          <span>Inspector</span>
          <strong>{selected.length ? `${selected.length} 個已選取` : "尚未選取"}</strong>
        </div>
        <IconButton className="mobile-close" label="關閉屬性" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
      </div>

      <div className={`panel-scroll inspector-content${readOnly ? " is-read-only" : ""}`}>
        {readOnly ? <button className="inspector-read-only-note" type="button" onClick={() => setMobilePanel(null)}><Eye size={15} /><span><strong>僅檢視模式</strong><small>可查看屬性，但目前不能修改。</small></span></button> : null}
        <fieldset className="inspector-content-fieldset" disabled={readOnly}>
        {!selected.length ? (
          <div className="inspector-empty">
            <SlidersHorizontal size={27} />
            <strong>選取一個物件開始編輯</strong>
            <p>選取工具可操作物件；空白處拖曳可框選，按住 Space 可暫時平移畫布，雙擊第二下按住拖曳也可平移。平移工具中按住 Shift 可暫時選取。</p>
            <dl>
              <div><dt>物件</dt><dd>{board.objects.length}</dd></div>
              <div><dt>標記</dt><dd>{board.objects.reduce((total, item) => total + item.markers.length, 0)}</dd></div>
              <div><dt>版本</dt><dd>r{board.revision}</dd></div>
            </dl>
          </div>
        ) : null}

        {object ? (
          <>
            <section className="inspector-section">
              <h3>命名</h3>
              <label>
                <span>物件名稱</span>
                <input value={object.name} onChange={(event) => onUpdateObject(object.id, { name: event.target.value })} />
              </label>
              <label>
                <span>圖層名稱</span>
                <input value={object.layerName} onChange={(event) => onUpdateObject(object.id, { layerName: event.target.value })} />
              </label>
            </section>

            {isTextObject(object) ? (
              <section className="inspector-section text-properties">
                <div className="section-heading-row">
                  <h3>文字</h3>
                  <button className="inline-text-edit-button" type="button" onClick={(event) => onStartTextEdit(event, object.id, true)}>
                    <Type size={14} /> 在畫布編輯
                  </button>
                </div>
                <label>
                  <span>內容</span>
                  <textarea rows="4" value={object.text} onChange={(event) => onUpdateObject(object.id, { text: event.target.value })} />
                </label>
                <label>
                  <span>字體</span>
                  <select value={object.fontFamily} onChange={(event) => onUpdateObject(object.id, { fontFamily: event.target.value })}>
                    {!knownFont ? <option value={object.fontFamily}>目前檔案字體</option> : null}
                    <optgroup label="內建字體">
                      {FONT_OPTIONS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
                    </optgroup>
                    {localFontOptions.length ? (
                      <optgroup label="這台裝置的字體">
                        {localFontOptions.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <button className="local-font-button" type="button" onClick={onLoadLocalFonts} disabled={["loading", "unsupported"].includes(localFontState.status)}>
                  <HardDrive size={14} />
                  {localFontState.status === "loading" ? "正在讀取字體…" : localFontState.status === "loaded" ? `重新讀取本機字體（${localFontOptions.length}）` : "載入本機字體"}
                </button>
                <p className={`font-access-status is-${localFontState.status}`} aria-live="polite">{localFontState.message}</p>
                <div className="property-grid">
                  <label>
                    <span>粗細</span>
                    <select value={String(object.fontWeight)} onChange={(event) => onUpdateObject(object.id, { fontWeight: event.target.value })}>
                      {FONT_WEIGHTS.map(([value, label]) => <option key={value} value={value}>{value} · {label}</option>)}
                    </select>
                  </label>
                  <label><span>大小</span><div className="input-with-suffix"><input type="number" min="6" max="512" value={Math.round(object.fontSize * 10) / 10} onChange={(event) => onUpdateObject(object.id, { fontSize: Math.max(6, Number(event.target.value) || 6) })} /><b>px</b></div></label>
                </div>
                <label><span>行高</span><div className="input-with-suffix"><input key={`${object.id}:${object.lineHeight}`} type="number" min="0.5" max="4" step="0.1" defaultValue={object.lineHeight ?? 1.2} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0.5 && value <= 4) onUpdateObject(object.id, { lineHeight: value }); else event.target.value = String(object.lineHeight ?? 1.2); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><b>×</b></div></label>
                <ObjectColorSetControl
                  label="文字色彩"
                  value={object.color}
                  colorSetsState={objectColorSets}
                  onChange={(color) => onUpdateObject(object.id, { color })}
                  onSelectSet={onSelectObjectColorSet}
                  onAdd={onAddObjectColor}
                  onCreateSet={onCreateObjectColorSet}
                  onRenameSet={onRenameObjectColorSet}
                  onRemoveColor={onRemoveObjectColor}
                  onDeleteSet={onDeleteObjectColorSet}
                  onLoad={onLoadObjectColorSets}
                  onExport={onExportObjectColorSets}
                />
                <div className="text-alignment-fields">
                  <TextAlignmentControl
                    label="段落對齊"
                    accessibleLabel="文字段落對齊"
                    value={object.textAlign}
                    options={TEXT_ALIGN_CONTROLS}
                    columns={4}
                    onChange={(textAlign) => onUpdateObject(object.id, { textAlign })}
                  />
                  {object.textAlign === "justify" ? (
                    <TextAlignmentControl
                      label="齊行最後一行"
                      accessibleLabel="左右齊行的最後一行對齊"
                      value={object.textAlignLast}
                      options={TEXT_LAST_ALIGN_CONTROLS}
                      onChange={(textAlignLast) => onUpdateObject(object.id, { textAlignLast })}
                    />
                  ) : null}
                  <TextAlignmentControl
                    label="文字框內上下對齊"
                    accessibleLabel="文字框內上下對齊"
                    value={object.textVerticalAlign}
                    options={TEXT_VERTICAL_ALIGN_CONTROLS}
                    onChange={(textVerticalAlign) => onUpdateObject(object.id, { textVerticalAlign })}
                  />
                </div>
                <div className="text-frame-fields">
                  <strong>文字框範圍</strong>
                  <div className="property-grid">
                    <label><span>寬 W</span><CommittedNumberInput key={`text-frame-width-${object.id}`} min={24} value={object.width} onCommit={(width) => onResizeTextFrame(object.id, { width })} /></label>
                    <label><span>高 H</span><CommittedNumberInput key={`text-frame-height-${object.id}`} min={24} value={object.height} onCommit={(height) => onResizeTextFrame(object.id, { height })} /></label>
                  </div>
                  <p>只調整換行與排版範圍，不改變字級。右側與底部圓點分別調整寬、高；連按兩下可自動符合內容。右下角方框＋可把溢出文字續接到新的連結文字框。</p>
                </div>
              </section>
            ) : null}

            {isShapeObject(object) ? (
              <section className="inspector-section shape-properties">
                <h3>形狀</h3>
                <label>
                  <span>種類</span>
                  <select value={object.shapeKind} onChange={(event) => onUpdateObject(object.id, { shapeKind: event.target.value })}>
                    <option value="rectangle">正方形／矩形</option>
                    <option value="triangle">三角形</option>
                    <option value="polygon">多邊形</option>
                    <option value="star">星形</option>
                  </select>
                </label>
                {object.shapeKind === "polygon" ? (
                  <label>
                    <span>多邊形邊數</span>
                    <input
                      type="number"
                      min="3"
                      max="24"
                      step="1"
                      value={object.shapeSides}
                      onChange={(event) => onUpdateObject(object.id, { shapeSides: Math.max(3, Math.min(24, Math.round(Number(event.target.value) || 3))) })}
                    />
                  </label>
                ) : null}
                {object.shapeKind === "star" ? (
                  <div className="star-shape-controls">
                    <div className="shape-style-heading">
                      <strong>星形樣式</strong>
                      <span>{object.starPoints} 芒 · {Math.round(object.starInnerRatio * 100)}%</span>
                    </div>
                    <div className="shape-style-presets" role="group" aria-label="星形樣式">
                      {STAR_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={activeStarStyle?.id === preset.id ? "is-active" : ""}
                          aria-pressed={activeStarStyle?.id === preset.id}
                          onClick={() => onUpdateObject(object.id, { starPoints: preset.starPoints, starInnerRatio: preset.starInnerRatio })}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="property-grid">
                      <label>
                        <span>星芒數</span>
                        <input
                          type="number"
                          min="3"
                          max="24"
                          step="1"
                          value={object.starPoints}
                          onChange={(event) => onUpdateObject(object.id, { starPoints: Math.max(3, Math.min(24, Math.round(Number(event.target.value) || 3))) })}
                        />
                      </label>
                      <label>
                        <span>內縮比例</span>
                        <div className="input-with-suffix">
                          <input
                            type="number"
                            min="15"
                            max="85"
                            step="1"
                            value={Math.round(object.starInnerRatio * 100)}
                            onChange={(event) => onUpdateObject(object.id, { starInnerRatio: Math.max(0.15, Math.min(0.85, (Number(event.target.value) || 15) / 100)) })}
                          />
                          <b>%</b>
                        </div>
                      </label>
                    </div>
                  </div>
                ) : null}
                <ObjectColorSetControl
                  label="填滿色彩"
                  value={object.fill}
                  colorSetsState={objectColorSets}
                  onChange={(fill) => onUpdateObject(object.id, { fill })}
                  onSelectSet={onSelectObjectColorSet}
                  onAdd={onAddObjectColor}
                  onCreateSet={onCreateObjectColorSet}
                  onRenameSet={onRenameObjectColorSet}
                  onRemoveColor={onRemoveObjectColor}
                  onDeleteSet={onDeleteObjectColorSet}
                  onLoad={onLoadObjectColorSets}
                  onExport={onExportObjectColorSets}
                />
                <div className="shape-quick-sizes">
                  <strong>快速尺寸</strong>
                  <label>
                    <span>紙張尺寸</span>
                    <select
                      value={printSizePreset?.id || ""}
                      onChange={(event) => applyShapeSizePreset(SHAPE_PRINT_SIZE_PRESETS.find((preset) => preset.id === event.target.value))}
                    >
                      <option value="">選擇快速尺寸</option>
                      {SHAPE_PRINT_SIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>社群圖片尺寸</span>
                    <select
                      value={socialSizePreset?.id || ""}
                      onChange={(event) => applyShapeSizePreset(SHAPE_SOCIAL_SIZE_PRESETS.find((preset) => preset.id === event.target.value))}
                    >
                      <option value="">選擇快速尺寸</option>
                      {SHAPE_SOCIAL_SIZE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {translateInterfaceText(preset.label)} · {preset.width} × {preset.height}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>紙張尺寸依 96ppi 換算；套用後仍可在變形欄調整。</p>
                </div>
              </section>
            ) : null}

            {isArtboardObject(object) ? (
              <section className="inspector-section artboard-properties">
                <div className="section-heading-row">
                  <h3>紙張</h3>
                  <span className="semantic-object-badge">背景畫板</span>
                </div>
                <label>
                  <span>常用尺寸</span>
                  <select value={object.paperPreset || "custom"} onChange={(event) => onResizeArtboardPreset(object.id, event.target.value, object.paperOrientation)}>
                    {Object.entries(PAPER_PRESETS).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
                  </select>
                </label>
                <div className="segmented-control" role="radiogroup" aria-label="紙張方向">
                  <button type="button" role="radio" aria-checked={object.paperOrientation !== "landscape"} className={object.paperOrientation !== "landscape" ? "is-active" : ""} onClick={() => onResizeArtboardPreset(object.id, object.paperPreset, "portrait")}>直式</button>
                  <button type="button" role="radio" aria-checked={object.paperOrientation === "landscape"} className={object.paperOrientation === "landscape" ? "is-active" : ""} onClick={() => onResizeArtboardPreset(object.id, object.paperPreset, "landscape")}>橫式</button>
                </div>
                <ObjectColorSetControl
                  label="紙張色彩"
                  value={object.fill}
                  colorSetsState={objectColorSets}
                  onChange={(fill) => onUpdateObject(object.id, { fill })}
                  onSelectSet={onSelectObjectColorSet}
                  onAdd={onAddObjectColor}
                  onCreateSet={onCreateObjectColorSet}
                  onRenameSet={onRenameObjectColorSet}
                  onRemoveColor={onRemoveObjectColor}
                  onDeleteSet={onDeleteObjectColorSet}
                  onLoad={onLoadObjectColorSets}
                  onExport={onExportObjectColorSets}
                />
                <label><span>符合內容的參考邊距</span><div className="input-with-suffix"><input type="number" min="0" max="400" value={Math.round(object.paperPadding || 0)} onChange={(event) => onUpdateObject(object.id, { paperPadding: Math.max(0, Math.min(400, Number(event.target.value) || 0)) })} /><b>px</b></div></label>
                <button className="secondary-button full-width" type="button" onClick={() => onFitArtboard(object.id)}>
                  <Maximize2 size={15} /> 依目前紙上物件重新符合
                </button>
                <p className="section-helper">此數值只在建立或手動重新符合紙張時計算；不會顯示導引線，也不會限制、裁切或連動其它物件。只有建立群組後才會共同變形。</p>
              </section>
            ) : null}

            <section className="inspector-section">
              <h3>變形</h3>
              <div className="dimension-grid">
                <label><span>寬 W</span><CommittedNumberInput key={`object-width-${object.id}`} min={minimumDimension} value={object.width} onCommit={(value) => updateDimension("width", value)} /></label>
                <button
                  className={`aspect-lock-button ${effectiveAspectLocked ? "is-locked" : "is-unlocked"}`}
                  type="button"
                  aria-pressed={effectiveAspectLocked}
                  aria-label={effectiveAspectLocked ? "等比例已鎖定" : temporaryUnlocked ? "Shift 暫時解除等比例" : "等比例未鎖定"}
                  title={temporaryUnlocked ? "Shift 暫時解除；放開後恢復鎖定" : allAspectLocked ? "點一下解除等比例" : "點一下鎖定等比例"}
                  onClick={() => onSetAspectLock(!allAspectLocked)}
                >
                  {effectiveAspectLocked ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
                <label><span>高 H</span><CommittedNumberInput key={`object-height-${object.id}`} min={minimumDimension} value={object.height} onCommit={(value) => updateDimension("height", value)} /></label>
              </div>
              <div className="property-grid">
                <label className="property-wide"><span>旋轉角度</span><div className="input-with-suffix"><input type="number" value={Math.round(object.rotation * 10) / 10} onChange={(event) => onUpdateObject(object.id, { rotation: Number(event.target.value) || 0 })} /><b>°</b></div></label>
              </div>
              <div className="transform-reset-actions">
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => onRestoreSize(object.id)}
                  disabled={Math.abs(object.width - object.originalWidth) < 0.01 && Math.abs(object.height - object.originalHeight) < 0.01}
                >
                  <Scaling size={15} /> 還原原始尺寸
                </button>
                <button className="quiet-button" type="button" onClick={() => onResetRotation(object.id)} disabled={Math.abs(object.rotation) < 0.01}>
                  <RotateCcwSquare size={15} /> 旋轉歸零
                </button>
              </div>
              <p className="transform-helper">八個控制點預設維持比例；縮放時按住 Shift 暫時解除，按住 Option／Alt 改為中心對稱縮放。連按兩下控制點可還原尺寸。{isTextObject(object) ? " 這裡會連同字級一起縮放。" : ""}</p>
              {activeResize ? <p className="shortcut-status" aria-live="polite">{activeResize.alt ? "中心對稱縮放" : `${RESIZE_HANDLES[activeResize.handle]?.label || "控制點"}縮放`} · {effectiveAspectLocked ? "比例鎖定" : temporaryUnlocked ? "Shift 暫時解鎖" : "自由比例"}</p> : null}
              <p className="transform-helper">旋轉時按住 Shift，會吸附 30°、45°、60°、90°、120°、180°。</p>
              <div className="axis-setting">
                <div>
                  <strong>旋轉軸心</strong>
                  <small>{ANCHORS[object.anchor].label}；縮放軸心由控制點決定</small>
                </div>
                <AxisPicker value={object.anchor} onChange={(anchor) => onPivotChange(object.id, anchor)} />
              </div>
            </section>

            <Micro3DControls objects={selected} onChange={onMicro3DChange} active={micro3DMode} onActiveChange={onMicro3DModeChange} />

            <section className="inspector-section">
              <h3>分群標記</h3>
              {object.markers.length ? (
                <div className="marker-pills">
                  {object.markers.map((marker) => (
                    <MarkerPill key={markerKey(marker)} marker={marker} onRemove={() => onRemoveMarker(marker)} />
                  ))}
                </div>
              ) : <p className="section-empty-copy">尚未加上標記。</p>}
              <MarkerComposer markerDraft={markerDraft} setMarkerDraft={setMarkerDraft} onAdd={onAddMarker} />
            </section>
          </>
        ) : null}

        {selected.length > 1 ? (
          <>
            <section className="inspector-section selection-structure-section">
              <div className="section-heading-row">
                <h3>選取結構</h3>
                <span className="semantic-object-badge">{selectionGrouped ? "群組" : "多選"}</span>
              </div>
              <p className="section-helper">外框就是目前操作邊界；{selectionGrouped ? "一般點選會選取整組，按住 ⌘／Ctrl 可穿透選取成員。" : "建立群組後可維持共同選取，成員仍保留各自圖層。"}</p>
              <button className="secondary-button full-width" type="button" onClick={onToggleGroup}>
                <Layers3 size={15} /> {selectionGrouped ? "解散群組" : "建立群組"}
              </button>
            </section>
            <section className="inspector-section group-transform-section">
              <h3>共同變形</h3>
              <div className="key-object-summary">
                <span>對齊／排列基準</span>
                <strong>{keyObject?.layerName || "第一個選取物件"}</strong>
              </div>
              <p className="transform-helper">再次點選任一已選物件，可改設為基準。拖曳畫布上的共同控制框，可同時縮放或旋轉。</p>
              <button
                className={`aspect-lock-row ${effectiveAspectLocked ? "is-locked" : "is-unlocked"}`}
                type="button"
                aria-pressed={effectiveAspectLocked}
                onClick={() => onSetAspectLock(!allAspectLocked)}
              >
                {effectiveAspectLocked ? <Lock size={16} /> : <Unlock size={16} />}
                <span><strong>{effectiveAspectLocked ? "等比例已鎖定" : temporaryUnlocked ? "Shift 暫時解鎖" : "自由比例"}</strong><small>Shift 暫時解除；Option／Alt 由中心對稱縮放</small></span>
              </button>
              {activeResize ? <p className="shortcut-status" aria-live="polite">{activeResize.alt ? "中心對稱縮放" : `${RESIZE_HANDLES[activeResize.handle]?.label || "控制點"}縮放`} · {effectiveAspectLocked ? "比例鎖定" : temporaryUnlocked ? "Shift 暫時解鎖" : "自由比例"}</p> : null}
              <div className="axis-setting">
                <div>
                  <strong>共同旋轉軸心</strong>
                  <small>{ANCHORS[selectionAnchor].label}；縮放軸心由控制點決定</small>
                </div>
                <AxisPicker value={selectionAnchor} onChange={onSelectionAnchorChange} />
              </div>
            </section>
            <Micro3DControls objects={selected} onChange={onMicro3DChange} active={micro3DMode} onActiveChange={onMicro3DModeChange} />
            <section className="inspector-section alignment-section">
              <h3>對齊與排列</h3>
              <p className="section-helper">基準物件保持不動，其餘物件依可視邊界調整。</p>
              <div className="alignment-control-group">
                <strong>對齊</strong>
                <div className="alignment-button-grid">
                  <IconButton label="靠左對齊基準物件" onClick={() => onAlign("left")}><AlignStartVertical size={17} /></IconButton>
                  <IconButton label="水平置中對齊基準物件" onClick={() => onAlign("hcenter")}><AlignCenterVertical size={17} /></IconButton>
                  <IconButton label="靠右對齊基準物件" onClick={() => onAlign("right")}><AlignEndVertical size={17} /></IconButton>
                  <IconButton label="靠上對齊基準物件" onClick={() => onAlign("top")}><AlignStartHorizontal size={17} /></IconButton>
                  <IconButton label="垂直置中對齊基準物件" onClick={() => onAlign("vcenter")}><AlignCenterHorizontal size={17} /></IconButton>
                  <IconButton label="靠下對齊基準物件" onClick={() => onAlign("bottom")}><AlignEndHorizontal size={17} /></IconButton>
                </div>
              </div>
              <div className="alignment-control-group">
                <strong>平均分布間距</strong>
                <div className="distribution-button-grid">
                  <button className="quiet-button" type="button" onClick={() => onDistribute("horizontal")} disabled={selected.length < 3} title={selected.length < 3 ? "至少選取 3 個物件" : "水平平均分布；基準物件保持不動"}>
                    <AlignHorizontalSpaceBetween size={17} /> 水平
                  </button>
                  <button className="quiet-button" type="button" onClick={() => onDistribute("vertical")} disabled={selected.length < 3} title={selected.length < 3 ? "至少選取 3 個物件" : "垂直平均分布；基準物件保持不動"}>
                    <AlignVerticalSpaceBetween size={17} /> 垂直
                  </button>
                </div>
                {selected.length < 3 ? <small className="control-note">平均分布至少需要 3 個物件。</small> : null}
              </div>
            </section>
            <section className="inspector-section multi-summary">
              <h3>批次圖層命名</h3>
              <p>依目前圖層順序加上流水號，物件名稱不會被覆蓋。</p>
              <label>
                <span>名稱前綴</span>
                <input value={batchPrefix} onChange={(event) => setBatchPrefix(event.target.value)} placeholder="例如：巴黎靈感" />
              </label>
              <button className="secondary-button full-width" type="button" onClick={onBatchRename} disabled={!batchPrefix.trim()}>
                套用為 {batchPrefix.trim() || "圖層"} 01…
              </button>
            </section>
            <section className="inspector-section">
              <h3>批次加入標記</h3>
              <MarkerComposer markerDraft={markerDraft} setMarkerDraft={setMarkerDraft} onAdd={onAddMarker} />
            </section>
          </>
        ) : null}
        </fieldset>
      </div>

    </aside>
  );
}

function ResizeHandles({ onStart, onRestore, activeHandle = null, group = false }) {
  return Object.entries(RESIZE_HANDLES).map(([key, handle]) => (
    <button
      key={key}
      type="button"
      className={`resize-handle resize-handle-${key} ${activeHandle === key ? "is-active" : ""}`}
      aria-label={`${handle.label}縮放控制點${group ? "，同時縮放選取物件" : ""}`}
      title="拖曳縮放；Shift 暫時解除比例；Option／Alt 中心對稱縮放"
      style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%` }}
      onPointerDown={(event) => onStart(event, key)}
      onDoubleClick={onRestore ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        onRestore();
      } : undefined}
    />
  ));
}

function TextFrameHandles({ onStart, onAutoFit, activeHandle = null }) {
  return TEXT_FRAME_HANDLES.map((handle) => (
    <button
      key={handle.key}
      type="button"
      className={`text-frame-handle text-frame-handle-${handle.key} ${activeHandle === handle.handle ? "is-active" : ""}`}
      aria-label={`${handle.label}控制點`}
      title={`拖曳調整${handle.label}；連按兩下自動符合內容`}
      style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%` }}
      onPointerDown={(event) => onStart(event, handle.handle)}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail === 0) onAutoFit(handle.dimension);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAutoFit(handle.dimension);
        }
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onAutoFit(handle.dimension);
      }}
    />
  ));
}

function CanvasObject({
  object,
  selected,
  soleSelected,
  multiSelected,
  keyObject,
  selectionEnabled,
  editable = true,
  inverseZoom,
  onPointerDown,
  onPointerUp,
  onDoubleClick,
  onRotateStart,
  onResizeStart,
  onRestoreSize,
  onResetRotation,
  micro3DMode,
  micro3DGesture,
  onMicro3DRotateStart,
  onResetMicro3D,
  onVideoControlsChange,
  onSelect,
  resizeGesture,
  editingText,
  textFrameGesture,
  onStartTextEdit,
  onTextChange,
  onFinishTextEdit,
  onTextFrameResizeStart,
  onAutoFitTextFrame,
  onLoadTextOverflow,
  textFlowLoaded,
}) {
  const anchor = ANCHORS[object.anchor] || ANCHORS.mc;
  const activeResize = resizeGesture?.objectId === object.id ? resizeGesture : null;
  const activePivot = ANCHORS[activeResize?.pivotAnchor] || anchor;
  const tiltX = Number(object.tiltX) || 0;
  const tiltY = Number(object.tiltY) || 0;
  const depth = Number(object.depth) || 0;
  const perspective = Number(object.perspective) || 1000;
  const hasMicro3D = Math.abs(tiltX) > 0.01 || Math.abs(tiltY) > 0.01 || Math.abs(depth) > 0.01 || Math.abs(perspective - 1000) > 0.01;
  const isEditingText = isTextObject(object) && editingText?.id === object.id;
  const activeTextFrame = textFrameGesture?.objectId === object.id ? textFrameGesture : null;
  const objectFrameRef = useRef(null);
  const [textOverflow, setTextOverflow] = useState(false);
  const hasTextOverflow = object.textFlowId ? Boolean(object.textFlowOverflow) : textOverflow;

  useLayoutEffect(() => {
    if (!isTextObject(object)) {
      setTextOverflow(false);
      return undefined;
    }
    const frame = objectFrameRef.current;
    if (!frame) return undefined;
    let cancelled = false;
    let animationFrame = 0;
    const measureOverflow = () => {
      animationFrame = 0;
      if (cancelled) return;
      const textElement = frame.querySelector(".object-text-visual");
      if (!textElement) return;
      const overflowing = textElement.scrollHeight > textElement.clientHeight + 1
        || textElement.scrollWidth > textElement.clientWidth + 1;
      setTextOverflow((current) => current === overflowing ? current : overflowing);
    };
    const scheduleMeasure = () => {
      if (cancelled) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measureOverflow);
    };
    scheduleMeasure();
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(frame);
    document.fonts?.ready?.then(scheduleMeasure);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [isEditingText, object.color, object.flowText, object.fontFamily, object.fontSize, object.fontWeight, object.id, object.text, object.textAlign, object.textAlignLast, object.textVerticalAlign]);

  return (
    <div
      className={`board-object ${selected ? "is-selected" : ""} ${multiSelected && keyObject ? "is-key-object" : ""} ${object.locked ? "is-locked" : ""} ${!editable ? "is-read-only" : ""} ${hasMicro3D ? "has-micro-3d" : ""} ${isEditingText ? "is-text-editing" : ""} ${isArtboardObject(object) ? "is-artboard" : ""} ${object.annotationKind ? "is-annotation" : ""} ${object.groupId ? "is-group-member" : ""}`}
      data-object-id={object.id}
      style={{
        left: object.pivotX,
        top: object.pivotY,
        transform: `rotate(${object.rotation}deg)`,
        "--inverse-zoom": inverseZoom,
      }}
      role="button"
      tabIndex={object.visible ? 0 : -1}
      aria-label={`${object.name}，${selected ? "已選取" : "未選取"}${multiSelected && keyObject ? "，對齊與排列基準物件" : ""}`}
      onPointerDown={(event) => {
        if (editable && micro3DMode && selected && !object.locked) {
          onMicro3DRotateStart(event, "free", () => onSelect(object.id, event.shiftKey));
          return;
        }
        onPointerDown(event, object.id);
      }}
      onPointerUp={(event) => onPointerUp(event, object.id)}
      onDoubleClick={(event) => {
        if (editable && isTextObject(object) && selectionEnabled && !micro3DMode && !object.locked) {
          onStartTextEdit(event, object.id);
          return;
        }
        onDoubleClick(event, object.id);
      }}
      onKeyDown={(event) => {
        if (editable && event.key === "Enter" && isTextObject(object) && selectionEnabled && !micro3DMode && !object.locked) {
          event.preventDefault();
          onStartTextEdit(event, object.id);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (selectionEnabled || event.metaKey || event.ctrlKey) onSelect(object.id, event.shiftKey);
        }
      }}
    >
      <div
        ref={objectFrameRef}
        className="object-frame"
        style={{
          left: -anchor.x * object.width,
          top: -anchor.y * object.height,
          width: object.width,
          height: object.height,
          transform: `perspective(${perspective}px) translateZ(${depth}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
        }}
      >
        {isEditingText
          ? <CanvasTextEditor object={object} editSession={editingText} onChange={onTextChange} onFinish={onFinishTextEdit} />
          : isVideoObject(object)
          ? <CanvasVideoPlayer object={object} onControlsVisibilityChange={(visible) => onVideoControlsChange(object.id, visible)} />
          : <MediaElement object={object} />}
        {object.markers.length ? (
          <div className="object-markers" aria-label={`${object.markers.length} 個標記`}>
            {object.markers.slice(0, 5).map((marker) => (
              <span key={markerKey(marker)}><MarkerIcon symbol={marker.symbol} color={marker.color} size={14} /></span>
            ))}
          </div>
        ) : null}
        {multiSelected && keyObject ? <span className="key-object-badge">基準</span> : null}
        {editable && soleSelected && hasTextOverflow && !isEditingText ? (
          <button
            type="button"
            className={`text-overflow-port ${textFlowLoaded ? "is-loaded" : ""}`}
            aria-label={textFlowLoaded ? "溢出文字已載入，請在空白畫布點一下建立連結文字框" : "文字內容超出文字框，點一下載入溢出文字"}
            title={textFlowLoaded ? "已載入溢出文字；在空白畫布點一下建立連結文字框" : "溢出文字；點一下載入並建立下一個文字框"}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onLoadTextOverflow(object.id);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          >
            <Plus size={13} strokeWidth={2.8} aria-hidden="true" />
          </button>
        ) : null}
        {editable && soleSelected && !micro3DMode && !isEditingText ? (
          <>
            <button
              type="button"
              className="rotation-handle"
              aria-label="拖曳旋轉；連按兩下旋轉歸零"
              title="拖曳旋轉；按住 Shift 吸附固定角度；連按兩下歸零"
              onPointerDown={(event) => onRotateStart(event, object.id)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onResetRotation(object.id);
              }}
            >
              <RotateCw size={14} />
            </button>
            <span
              className="pivot-indicator"
              style={{ left: `${activePivot.x * 100}%`, top: `${activePivot.y * 100}%` }}
              aria-hidden="true"
            />
            <ResizeHandles
              activeHandle={activeResize?.handle}
              onStart={(event, handle) => onResizeStart(event, object.id, handle)}
              onRestore={() => onRestoreSize(object.id)}
            />
            {isTextObject(object) ? (
              <TextFrameHandles
                activeHandle={activeTextFrame?.handle}
                onStart={(event, handle) => onTextFrameResizeStart(event, object.id, handle)}
                onAutoFit={(dimension) => onAutoFitTextFrame(object.id, dimension)}
              />
            ) : null}
          </>
        ) : null}
        {editable && soleSelected && isEditingText ? (
          <>
            <span className="text-frame-label" aria-hidden="true">文字框</span>
            <TextFrameHandles
              activeHandle={activeTextFrame?.handle}
              onStart={(event, handle) => onTextFrameResizeStart(event, object.id, handle)}
              onAutoFit={(dimension) => onAutoFitTextFrame(object.id, dimension)}
            />
          </>
        ) : null}
      </div>
      {editable && soleSelected && micro3DMode ? (
        <FeatureChunkBoundary label="3D 軌道" compact>
          <React.Suspense fallback={<FeatureChunkLoading label="3D 軌道" compact />}>
            <LazyRotation3DGizmo
              inverseZoom={inverseZoom}
              left={(0.5 - anchor.x) * object.width}
              top={(0.5 - anchor.y) * object.height}
              counterRotation={-object.rotation}
              activeAxis={micro3DGesture?.axis || null}
              onStart={onMicro3DRotateStart}
              onReset={onResetMicro3D}
            />
          </React.Suspense>
        </FeatureChunkBoundary>
      ) : null}
    </div>
  );
}

function SelectionGroupOverlay({
  bounds,
  anchorKey,
  inverseZoom,
  gesture,
  onRotateStart,
  onResizeStart,
  micro3DMode,
  micro3DGesture,
  onMicro3DRotateStart,
  onResetMicro3D,
  semanticLabel,
}) {
  if (!bounds) return null;
  const anchor = ANCHORS[anchorKey] || ANCHORS.mc;
  const sourceBounds = gesture?.bounds || bounds;
  const pivot = gesture?.pivot || boundsAnchorPoint(sourceBounds, anchorKey);
  let displayBounds = sourceBounds;
  let transform = undefined;
  let transformOrigin = undefined;

  if (gesture?.type === "scale") {
    const scaleX = gesture.scaleX || 1;
    const scaleY = gesture.scaleY || 1;
    displayBounds = {
      ...sourceBounds,
      left: pivot.x + (sourceBounds.left - pivot.x) * scaleX,
      top: pivot.y + (sourceBounds.top - pivot.y) * scaleY,
      width: sourceBounds.width * scaleX,
      height: sourceBounds.height * scaleY,
    };
  } else if (gesture?.type === "rotate") {
    transform = `rotate(${gesture.degrees || 0}deg)`;
    transformOrigin = `${pivot.x - sourceBounds.left}px ${pivot.y - sourceBounds.top}px`;
  }

  return (
    <div
      className={`selection-group-frame ${micro3DMode ? "is-3d-mode" : ""} ${semanticLabel ? "is-semantic-group" : ""}`}
      role="group"
      aria-label={micro3DMode ? "多選 3D 旋轉控制框" : "多選共同變形控制框"}
      style={{
        left: displayBounds.left,
        top: displayBounds.top,
        width: displayBounds.width,
        height: displayBounds.height,
        transform,
        transformOrigin,
        "--inverse-zoom": inverseZoom,
      }}
    >
      {semanticLabel ? <span className="selection-group-label">{semanticLabel}</span> : null}
      {micro3DMode ? (
        <FeatureChunkBoundary label="3D 軌道" compact>
          <React.Suspense fallback={<FeatureChunkLoading label="3D 軌道" compact />}>
            <LazyRotation3DGizmo
              inverseZoom={inverseZoom}
              activeAxis={micro3DGesture?.axis || null}
              onStart={onMicro3DRotateStart}
              onReset={onResetMicro3D}
              group
            />
          </React.Suspense>
        </FeatureChunkBoundary>
      ) : (
        <>
          <button
            type="button"
            className="rotation-handle"
            aria-label="同時旋轉選取物件"
            title="拖曳以同時旋轉；按住 Shift 吸附固定角度"
            onPointerDown={onRotateStart}
          >
            <RotateCw size={14} />
          </button>
          <span
            className="pivot-indicator"
            style={{
              left: gesture ? pivot.x - displayBounds.left : `${anchor.x * 100}%`,
              top: gesture ? pivot.y - displayBounds.top : `${anchor.y * 100}%`,
            }}
            aria-hidden="true"
          />
          <ResizeHandles
            group
            activeHandle={gesture?.type === "scale" ? gesture.handle : null}
            onStart={onResizeStart}
          />
        </>
      )}
    </div>
  );
}

function SelectionSpacingOverlay({ measurements, view, unit }) {
  if (!measurements?.length) return null;
  return (
    <div className="selection-spacing-overlay" aria-hidden="true">
      {measurements.map((measurement) => {
        const start = {
          x: view.x + measurement.start.x * view.zoom,
          y: view.y + measurement.start.y * view.zoom,
        };
        const end = {
          x: view.x + measurement.end.x * view.zoom,
          y: view.y + measurement.end.y * view.zoom,
        };
        const horizontal = measurement.direction === "left" || measurement.direction === "right";
        const style = horizontal
          ? {
              left: Math.min(start.x, end.x),
              top: start.y,
              width: Math.max(1, Math.abs(end.x - start.x)),
            }
          : {
              left: start.x,
              top: Math.min(start.y, end.y),
              height: Math.max(1, Math.abs(end.y - start.y)),
            };
        return (
          <div
            className={`selection-spacing-measurement is-${horizontal ? "horizontal" : "vertical"}`}
            style={style}
            key={`${measurement.direction}-${measurement.objectId}`}
          >
            <span>{formatGuideValue(measurement.distance, unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

function SmartAlignmentOverlay({ guides, view }) {
  if (!guides?.length) return null;
  return (
    <div className="smart-alignment-overlay" aria-hidden="true">
      {guides.map((guide) => {
        const vertical = guide.axis === "x";
        const style = vertical
          ? {
              left: view.x + guide.position * view.zoom,
              top: view.y + guide.start * view.zoom,
              height: Math.max(1, (guide.end - guide.start) * view.zoom),
            }
          : {
              left: view.x + guide.start * view.zoom,
              top: view.y + guide.position * view.zoom,
              width: Math.max(1, (guide.end - guide.start) * view.zoom),
            };
        return (
          <span
            className={`smart-alignment-guide is-${vertical ? "vertical" : "horizontal"} ${guide.snapped ? "is-snapped" : "is-preview"}`}
            style={style}
            key={`${guide.axis}-${guide.position}-${guide.objectId}`}
          />
        );
      })}
    </div>
  );
}

function FilterStage({ objects, selectedIds, onSelect, onClear, filters }) {
  const [viewMode, setViewMode] = useState("grid");
  const [slideIndex, setSlideIndex] = useState(0);
  const search = useListSearch("filter-results");
  const swipeStartRef = useRef(null);
  const thumbnailTapRef = useRef({ id: null, time: 0 });
  const listedObjects = objects.filter((object) => matchesListQuery([object.name, object.layerName, object.type], search.query));
  const activeIndex = listedObjects.length ? Math.min(slideIndex, listedObjects.length - 1) : 0;
  const activeObject = listedObjects[activeIndex];
  const goToSlide = useCallback((nextIndex) => {
    if (!listedObjects.length) return;
    setSlideIndex((nextIndex + listedObjects.length) % listedObjects.length);
  }, [listedObjects.length]);

  useEffect(() => {
    setSlideIndex((current) => listedObjects.length ? Math.min(current, listedObjects.length - 1) : 0);
  }, [listedObjects.length]);

  useEffect(() => {
    if (viewMode !== "original") return undefined;
    const onKeyDown = (event) => {
      if (event.target?.closest?.("video[controls], input, textarea, select")) return;
      if (event.key === "Escape" && !document.fullscreenElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setViewMode("grid");
        return;
      }
      if (event.key === "ArrowLeft") { event.preventDefault(); goToSlide(activeIndex - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); goToSlide(activeIndex + 1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goToSlide, viewMode]);

  return (
    <div className={`filter-stage ${search.open ? "has-list-search" : ""}`} aria-label="篩選排隊結果">
      <header>
        <div>
          <Tags size={18} />
          <span>排隊檢視</span>
          <strong>{search.query ? `${listedObjects.length} / ${objects.length}` : `${objects.length} 個符合`}</strong>
        </div>
        <div className="filter-stage-actions">
          <ListSearchToggle search={search} resultCount={listedObjects.length} totalCount={objects.length} label="搜尋排隊結果" />
          <div className="view-mode-control" role="group" aria-label="檢視方式">
            <button type="button" className={viewMode === "grid" ? "is-active" : ""} aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}><LayoutGrid size={15} /> 縮圖</button>
            <button type="button" className={viewMode === "original" ? "is-active" : ""} aria-pressed={viewMode === "original"} onClick={() => setViewMode("original")}><Square size={15} /> 原圖</button>
          </div>
          <button className="secondary-button" type="button" onClick={onClear}><ArrowLeft size={16} /> 回到畫布</button>
        </div>
      </header>
      <ListSearchField search={search} placeholder="搜尋物件或圖層" />
      {listedObjects.length && viewMode === "grid" ? (
        <div className="filter-stage-grid">
          {listedObjects.map((object, index) => (
            <button
              type="button"
              className={selectedIds.includes(object.id) ? "is-selected" : ""}
              key={object.id}
              onClick={(event) => { setSlideIndex(index); onSelect(object.id, event.shiftKey); }}
              onDoubleClick={() => { setSlideIndex(index); setViewMode("original"); }}
              onPointerUp={(event) => {
                if (event.pointerType === "mouse") return;
                const now = Date.now();
                const previous = thumbnailTapRef.current;
                thumbnailTapRef.current = { id: object.id, time: now };
                if (previous.id === object.id && now - previous.time < 360) {
                  setSlideIndex(index);
                  setViewMode("original");
                  thumbnailTapRef.current = { id: null, time: 0 };
                }
              }}
              title="點一下選取；連按兩下開啟原圖檢視"
            >
              <span className="stage-image">
                <MediaElement object={object} decorative style={{ transform: `rotate(${object.rotation}deg)`, ...(isTextObject(object) ? { fontSize: Math.min(object.fontSize, 22) } : {}) }} />
                {isVideoObject(object) ? <span className="video-badge"><Play size={14} fill="currentColor" /> 影片</span> : null}
              </span>
              <span className="stage-copy"><strong data-l10n-ignore>{object.name}</strong><small data-l10n-ignore>{object.layerName}</small></span>
              <span className="stage-markers">
                {object.markers.map((marker) => <MarkerIcon key={markerKey(marker)} symbol={marker.symbol} color={marker.color} size={14} />)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {listedObjects.length && viewMode === "original" && activeObject ? (
        <div
          className="filter-slideshow"
          onPointerDown={(event) => {
            if (event.target.closest("button, video[controls]")) return;
            swipeStartRef.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (swipeStartRef.current === null) return;
            const delta = event.clientX - swipeStartRef.current;
            swipeStartRef.current = null;
            if (Math.abs(delta) < 48) return;
            goToSlide(activeIndex + (delta < 0 ? 1 : -1));
          }}
        >
          <button className="slide-arrow is-previous" type="button" onClick={() => goToSlide(activeIndex - 1)} aria-label="上一個素材"><ChevronLeft size={26} /></button>
          <figure>
            <div className="slide-media">
              <MediaElement object={activeObject} controls={isVideoObject(activeObject)} />
            </div>
            <figcaption>
              <div>
                <strong data-l10n-ignore>{activeObject.name}</strong>
                <small data-l10n-ignore>{activeObject.layerName}</small>
              </div>
              <span className="slide-markers">
                {activeObject.markers.map((marker) => <MarkerIcon key={markerKey(marker)} symbol={marker.symbol} color={marker.color} size={15} />)}
              </span>
              <span className="slide-count">{activeIndex + 1} / {listedObjects.length}</span>
              <button type="button" className="quiet-button" onClick={() => onSelect(activeObject.id, false)}>選取此物件</button>
            </figcaption>
          </figure>
          <button className="slide-arrow is-next" type="button" onClick={() => goToSlide(activeIndex + 1)} aria-label="下一個素材"><ChevronRight size={26} /></button>
        </div>
      ) : (
        !listedObjects.length ? <div className="stage-empty">
          <AlertTriangle size={26} />
          <strong>{objects.length ? "找不到符合搜尋的物件" : "目前組合沒有符合的物件"}</strong>
          <p>{objects.length ? "搜尋條件會保留，可以調整或清除。" : filters.mode === "all" ? "改用「任一標記」，或減少條件。" : "調整符號、色彩，或清除篩選。"}</p>
          <button type="button" className="secondary-button" onClick={objects.length ? () => search.setQuery("") : onClear}>{objects.length ? "清除搜尋" : "清除篩選"}</button>
        </div> : null
      )}
    </div>
  );
}

function sourceTypeLabel(object) {
  if (isVideoObject(object)) return "影片";
  if (object?.mime === "image/svg+xml") return "SVG";
  return "圖片";
}

function SourceStage({ sourceAssets, activeSourceId, onSelectSource, onExit, spaceDown = false }) {
  const [viewMode, setViewMode] = useState("grid");
  const [sourceView, setSourceView] = useState({ x: 0, y: 0, zoom: 1 });
  const [sourceViewFit, setSourceViewFit] = useState(true);
  const [sourcePanning, setSourcePanning] = useState(false);
  const search = useListSearch("sources");
  const thumbnailTapRef = useRef({ id: null, time: 0 });
  const sourceViewportRef = useRef(null);
  const sourcePanRef = useRef(null);
  const listedSources = sourceAssets.filter((source) => matchesListQuery([
    source.representative.originalFilename,
    source.representative.name,
    source.representative.mime,
  ], search.query));
  const selectedIndex = listedSources.findIndex((source) => source.sourceId === activeSourceId);
  const activeIndex = listedSources.length ? Math.max(0, selectedIndex) : 0;
  const activeSource = listedSources[activeIndex];
  const activeObject = activeSource?.representative || null;
  const mediaSize = {
    width: Math.max(1, Number(activeObject?.originalWidth || activeObject?.width) || 1),
    height: Math.max(1, Number(activeObject?.originalHeight || activeObject?.height) || 1),
  };
  const goToSlide = useCallback((nextIndex) => {
    if (!listedSources.length) return;
    const source = listedSources[(nextIndex + listedSources.length) % listedSources.length];
    onSelectSource(source.sourceId);
  }, [listedSources, onSelectSource]);

  const fitActiveSource = useCallback(() => {
    const rect = sourceViewportRef.current?.getBoundingClientRect();
    if (!rect || !activeObject) return;
    setSourceView(fitSourceView({ width: rect.width, height: rect.height }, {
      width: activeObject.originalWidth || activeObject.width,
      height: activeObject.originalHeight || activeObject.height,
    }));
    setSourceViewFit(true);
  }, [activeObject]);

  const resetSourceTo100 = useCallback(() => {
    setSourceView({ x: 0, y: 0, zoom: 1 });
    setSourceViewFit(false);
  }, []);

  const zoomSourceAt = useCallback((nextZoom, point) => {
    const rect = sourceViewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSourceView((current) => zoomSourceViewAtPoint(current, nextZoom, point || {
      x: rect.width / 2,
      y: rect.height / 2,
    }, { width: rect.width, height: rect.height }));
    setSourceViewFit(false);
  }, []);

  useEffect(() => {
    if (listedSources.length && selectedIndex < 0) onSelectSource(listedSources[0].sourceId);
  }, [listedSources, onSelectSource, selectedIndex]);

  useEffect(() => {
    if (viewMode !== "original") return undefined;
    const onKeyDown = (event) => {
      if (event.target?.closest?.("video[controls], input, textarea, select")) return;
      if (event.key === "Escape" && !document.fullscreenElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setViewMode("grid");
        return;
      }
      if (event.key === "ArrowLeft") { event.preventDefault(); goToSlide(activeIndex - 1); }
      if (event.key === "ArrowRight") { event.preventDefault(); goToSlide(activeIndex + 1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goToSlide, viewMode]);

  useLayoutEffect(() => {
    if (viewMode !== "original" || !activeObject) return undefined;
    const frame = window.requestAnimationFrame(fitActiveSource);
    return () => window.cancelAnimationFrame(frame);
  }, [activeObject?.sourceId, activeSource?.sourceId, fitActiveSource, viewMode]);

  useEffect(() => {
    if (viewMode !== "original" || !sourceViewFit || !sourceViewportRef.current || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => fitActiveSource());
    observer.observe(sourceViewportRef.current);
    return () => observer.disconnect();
  }, [fitActiveSource, sourceViewFit, viewMode]);

  const openOriginal = useCallback((index) => {
    const source = listedSources[index];
    if (source) onSelectSource(source.sourceId);
    setViewMode("original");
  }, [listedSources, onSelectSource]);

  const startSourcePan = (event) => {
    if (event.button !== 0 || event.target.closest("button, video[controls]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sourcePanRef.current = { clientX: event.clientX, clientY: event.clientY, view: sourceView };
    setSourcePanning(true);
    setSourceViewFit(false);
  };
  const moveSourcePan = (event) => {
    const pan = sourcePanRef.current;
    if (!pan) return;
    event.preventDefault();
    setSourceView(panSourceView(pan.view, event.clientX - pan.clientX, event.clientY - pan.clientY));
  };
  const endSourcePan = (event) => {
    if (!sourcePanRef.current) return;
    sourcePanRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setSourcePanning(false);
  };
  const wheelSource = (event) => {
    if (event.target.closest("video[controls]")) return;
    event.preventDefault();
    const rect = sourceViewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomSourceAt(sourceView.zoom * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div className={`filter-stage source-stage ${search.open ? "has-list-search" : ""}`} aria-label="來源素材檢視">
      <header>
        <div>
          <button className="source-stage-back" type="button" onClick={onExit} aria-label="回到畫布"><ArrowLeft size={16} /><span>回到畫布</span></button>
          <span className="source-stage-separator" aria-hidden="true" />
          <ImageIcon size={18} />
          <span>來源素材</span>
          <strong>{search.query ? `${listedSources.length} / ${sourceAssets.length}` : `${sourceAssets.length} 個來源`}</strong>
        </div>
        <div className="filter-stage-actions">
          {viewMode === "original" && activeSource ? (
            <div className="source-view-controls" role="group" aria-label="素材縮放">
              <IconButton label="縮小素材" onClick={() => zoomSourceAt(sourceView.zoom / 1.2)}><ZoomOut size={16} /></IconButton>
              <button type="button" className="source-view-value" onClick={resetSourceTo100} title="回到素材原始 100%" aria-label={`素材縮放 ${Math.round(sourceView.zoom * 100)}%；點擊回到 100%`}>{Math.round(sourceView.zoom * 100)}%</button>
              <IconButton label="放大素材" onClick={() => zoomSourceAt(sourceView.zoom * 1.2)}><ZoomIn size={16} /></IconButton>
              <IconButton label="符合素材到視窗" active={sourceViewFit} aria-pressed={sourceViewFit} onClick={fitActiveSource}><Maximize2 size={16} /></IconButton>
            </div>
          ) : null}
          <ListSearchToggle search={search} resultCount={listedSources.length} totalCount={sourceAssets.length} label="搜尋來源素材" />
          <div className="view-mode-control" role="group" aria-label="來源素材檢視方式">
            <button type="button" className={viewMode === "grid" ? "is-active" : ""} aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}><LayoutGrid size={15} /> 縮圖</button>
            <button type="button" className={viewMode === "original" ? "is-active" : ""} aria-pressed={viewMode === "original"} onClick={() => setViewMode("original")} disabled={!listedSources.length}><Square size={15} /> 原圖</button>
          </div>
        </div>
      </header>
      <ListSearchField search={search} placeholder="搜尋檔名或素材類型" />
      {listedSources.length && viewMode === "grid" ? (
        <div className="filter-stage-grid source-stage-grid">
          {listedSources.map((source, index) => {
            const object = source.representative;
            const typeLabel = sourceTypeLabel(object);
            return (
              <button
                type="button"
                className={activeSource?.sourceId === source.sourceId ? "is-active" : ""}
                key={source.sourceId}
                onClick={() => onSelectSource(source.sourceId)}
                onDoubleClick={() => openOriginal(index)}
                onPointerUp={(event) => {
                  if (event.pointerType === "mouse") return;
                  const now = Date.now();
                  const previous = thumbnailTapRef.current;
                  thumbnailTapRef.current = { id: source.sourceId, time: now };
                  if (previous.id === source.sourceId && now - previous.time < 360) {
                    openOriginal(index);
                    thumbnailTapRef.current = { id: null, time: 0 };
                  }
                }}
                title="連按兩下開啟原圖檢視"
              >
                <span className="stage-image">
                  <MediaElement object={object} decorative />
                  {isVideoObject(object) ? <span className="video-badge"><Play size={14} fill="currentColor" /> 影片</span> : null}
                </span>
                <span className="stage-copy"><strong data-l10n-ignore>{object.originalFilename || object.name}</strong><small>{typeLabel}</small></span>
                <span className="stage-source-meta">{`${source.instanceIds.length} 個畫布實例`}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {listedSources.length && viewMode === "original" && activeSource ? (
        <div className="filter-slideshow source-slideshow">
          <button className="slide-arrow is-previous" type="button" onClick={() => goToSlide(activeIndex - 1)} aria-label="上一個來源素材"><ChevronLeft size={26} /></button>
          <figure>
            <div
              ref={sourceViewportRef}
              className={`slide-media source-inspection-canvas ${spaceDown ? "is-hand-ready" : ""} ${sourcePanning ? "is-panning" : ""}`}
              onPointerDown={startSourcePan}
              onPointerMove={moveSourcePan}
              onPointerUp={endSourcePan}
              onPointerCancel={endSourcePan}
              onWheel={wheelSource}
              onDoubleClick={fitActiveSource}
              role="region"
              tabIndex={0}
              aria-label="素材原圖檢視區；拖曳平移，滾輪縮放，連按兩下符合視窗"
            >
              <div
                className="source-inspection-world"
                style={{
                  width: mediaSize.width,
                  height: mediaSize.height,
                  transform: `translate(calc(-50% + ${sourceView.x}px), calc(-50% + ${sourceView.y}px)) scale(${sourceView.zoom})`,
                }}
              >
                <MediaElement
                  object={activeSource.representative}
                  controls={isVideoObject(activeSource.representative)}
                  style={{ width: mediaSize.width, height: mediaSize.height }}
                />
              </div>
            </div>
            <figcaption>
              <div>
                <strong data-l10n-ignore>{activeSource.representative.originalFilename || activeSource.representative.name}</strong>
                <small>{`原始素材 · ${activeSource.instanceIds.length} 個畫布實例`}</small>
              </div>
              <span className="slide-count">{activeIndex + 1} / {listedSources.length}</span>
            </figcaption>
          </figure>
          <button className="slide-arrow is-next" type="button" onClick={() => goToSlide(activeIndex + 1)} aria-label="下一個來源素材"><ChevronRight size={26} /></button>
        </div>
      ) : (
        !listedSources.length ? <div className="stage-empty">
          {sourceAssets.length ? <Search size={26} /> : <ImageIcon size={26} />}
          <strong>{sourceAssets.length ? "找不到符合的來源素材" : "還沒有來源素材"}</strong>
          <p>{sourceAssets.length ? "搜尋條件會保留，可以調整或清除。" : "加入圖片、影片或 SVG 後，這裡會依來源各列一份。"}</p>
          {sourceAssets.length ? <button type="button" className="secondary-button" onClick={() => search.setQuery("")}>清除搜尋</button> : null}
        </div> : null
      )}
    </div>
  );
}

function SourceInspector({ source, visibleInstanceCount = 0, readOnly = false, busy = false, onAddInstance, onShowInstances, onExportSource, mobilePanel, setMobilePanel }) {
  const object = source?.representative;
  const sourceName = object?.originalFilename || object?.name || "尚未選取";
  return (
    <aside className={`inspector source-inspector ${mobilePanel === "right" ? "is-mobile-open" : ""}`} aria-label="素材資訊">
      <div className="inspector-heading">
        <div>
          <span>Source</span>
          <strong>{source ? "1 個素材已選取" : "尚未選取"}</strong>
        </div>
        <IconButton className="mobile-close" label="關閉素材資訊" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
      </div>
      <div className="panel-scroll source-inspector-content">
        {source ? (
          <>
            <div className="source-inspector-preview"><MediaElement object={object} decorative /></div>
            <section className="inspector-section">
              <h3>來源素材</h3>
              <strong className="source-inspector-name" data-l10n-ignore>{sourceName}</strong>
              <dl className="source-inspector-meta">
                <div><dt>類型</dt><dd>{sourceTypeLabel(object)}</dd></div>
                <div><dt>原始尺寸</dt><dd>{`${Math.round(object.originalWidth || object.width)} × ${Math.round(object.originalHeight || object.height)} px`}</dd></div>
                <div><dt>畫布實例</dt><dd>{source.instanceIds.length}</dd></div>
              </dl>
            </section>
            <section className="inspector-section source-inspector-actions" aria-label="素材操作">
              <button className="primary-button full-width" type="button" onClick={() => onAddInstance(source.sourceId)} disabled={readOnly || busy}>
                <ImagePlus size={16} /> 新增到工作檔
              </button>
              <button className="secondary-button full-width" type="button" onClick={() => onShowInstances(source.sourceId)}>
                <LocateFixed size={16} /> {`定位 ${visibleInstanceCount} 個可見畫布實例`}
              </button>
              <button className="secondary-button full-width" type="button" onClick={() => onExportSource(source.sourceId)} disabled={busy}>
                <Download size={16} /> {busy ? "準備下載…" : "下載原始素材"}
              </button>
            </section>
            <p className="source-inspector-note">尺寸、旋轉、標記與圖層屬於各自的畫布實例；在這裡操作不會改到背景中看不見的物件。</p>
          </>
        ) : (
          <div className="inspector-empty source-inspector-empty">
            <ImageIcon size={27} />
            <strong>還沒有可操作的來源素材</strong>
            <p>回到畫布加入圖片、影片或 SVG 後，就能在這裡檢視與下載原始素材。</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function Modal({ title, description, onClose, children, wide = false, dialogRole = "dialog", busy = false, className = "" }) {
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? "is-wide" : ""} ${className}`} role={dialogRole} aria-modal="true" aria-label={title}>
        <header>
          <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <IconButton label="關閉" onClick={onClose} disabled={busy}><X size={19} /></IconButton>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

const AGENT_FIELD_LABELS = {type:"類型", text:"文字內容", shapeKind:"形狀", x:"水平位置", y:"垂直位置", name:"名稱", textAlign:"水平對齊", textVerticalAlign:"垂直對齊", fontSize:"文字大小", color:"文字色彩", fill:"填滿色彩", pivotX:"水平位置", pivotY:"垂直位置", width:"寬度", height:"高度", rotation:"旋轉角度", visible:"顯示", locked:"鎖定"};
const AGENT_VALUE_LABELS = { text:"文字", shape:"形狀", rectangle:"矩形", triangle:"三角形", polygon:"多邊形", star:"星形", left:"靠左", center:"置中", right:"靠右", justify:"左右對齊", top:"靠上", middle:"置中", bottom:"靠下", true:"是", false:"否" };

function ShortcutReferenceModal({ onClose }) {
  const search = useListSearch("shortcuts");
  const totalCount = SHORTCUT_SECTIONS.reduce((count, section) => count + section.items.length, 0);
  const sections = SHORTCUT_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter(([shortcut, label]) => matchesListQuery([
        shortcut,
        platformShortcutLabel(shortcut),
        label,
        section.title,
      ], search.query)),
    }))
    .filter((section) => section.items.length);
  const resultCount = sections.reduce((count, section) => count + section.items.length, 0);

  return (
    <Modal title="快速鍵" description="自訂工作區指令統一使用 Shift；檔案與編輯保留熟悉的瀏覽器快速鍵語意。" onClose={onClose} wide>
      <div className="modal-list-toolbar"><strong>{`${resultCount} / ${totalCount} 個指令`}</strong><ListSearchToggle search={search} resultCount={resultCount} totalCount={totalCount} label="搜尋快速鍵" /></div>
      <ListSearchField search={search} placeholder="搜尋指令或按鍵" />
      {sections.length ? (
        <div className="shortcut-sections">
          {sections.map((section) => (
            <section className="shortcut-section" key={section.title}>
              <h3>{section.title}</h3>
              <div className="shortcut-list">
                {section.items.map(([shortcut, label]) => (
                  <div key={`${section.title}-${shortcut}`}>
                    <span>{label}</span>
                    <kbd>{platformShortcutLabel(shortcut)}</kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="modal-empty"><Search size={24} /><strong>找不到符合的快速鍵</strong><p>搜尋條件會保留，可以調整或清除。</p><button className="text-button" type="button" onClick={() => search.setQuery("")}>清除搜尋</button></div>
      )}
    </Modal>
  );
}

function GridModal({ selectedCount, onApply, onClose }) {
  const minimum = Math.max(1, selectedCount);
  const [count, setCount] = useState(Math.max(minimum, selectedCount ? 6 : 9));
  const [columns, setColumns] = useState(3);
  const [gapX, setGapX] = useState(24);
  const [gapY, setGapY] = useState(24);
  const rows = Math.ceil(count / columns);
  return (
    <Modal
      title="建立 Grid"
      description={selectedCount
        ? `會保留目前 ${selectedCount} 個選取物件，並複製到指定總數後重新排列。`
        : "沒有選取物件時，會建立矩形預留位置並排列。"}
      onClose={onClose}
    >
      <div className="grid-dialog-layout">
        <div className="grid-dialog-fields">
          <label><span>物件總數</span><input type="number" min={minimum} max="100" value={count} onChange={(event) => setCount(Math.max(minimum, Math.min(100, Number(event.target.value) || minimum)))} /></label>
          <label><span>每列欄數</span><input type="number" min="1" max={count} value={columns} onChange={(event) => setColumns(Math.max(1, Math.min(count, Number(event.target.value) || 1)))} /></label>
          <div className="property-grid">
            <label><span>水平間距</span><input type="number" min="0" max="500" value={gapX} onChange={(event) => setGapX(Math.max(0, Number(event.target.value) || 0))} /></label>
            <label><span>垂直間距</span><input type="number" min="0" max="500" value={gapY} onChange={(event) => setGapY(Math.max(0, Number(event.target.value) || 0))} /></label>
          </div>
        </div>
        <div className="grid-dialog-preview" aria-label={`${columns} 欄、${rows} 列、共 ${count} 個物件`}>
          <div style={{ gridTemplateColumns: `repeat(${columns}, minmax(8px, 1fr))` }}>
            {Array.from({ length: count }, (_, index) => <i key={index} className={index < selectedCount ? "is-source" : ""} />)}
          </div>
          <span>{columns} 欄 × {rows} 列</span>
        </div>
      </div>
      <p className="feature-dialog-note">建立後會一次選取完整 Grid，清楚顯示這次操作會影響的範圍；每個物件仍可個別編輯。</p>
      <div className="feature-dialog-actions">
        <button className="quiet-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" onClick={() => onApply({ count, columns, gapX, gapY })}>
          <LayoutGrid size={16} /> {selectedCount ? "建立並排列" : "建立預留位置"}
        </button>
      </div>
    </Modal>
  );
}

function AnnotationModal({ targetCount, onApply, onClose }) {
  const [kind, setKind] = useState("title");
  const [text, setText] = useState("");
  const [position, setPosition] = useState("tl");
  return (
    <Modal
      title="加入標題或說明"
      description={`文字會依 ${targetCount} 個選取物件的整體邊界定位，建立後仍可獨立移動與編輯。`}
      onClose={onClose}
    >
      <div className="annotation-dialog-layout">
        <div className="segmented-control" role="radiogroup" aria-label="文字類型">
          <button type="button" role="radio" aria-checked={kind === "title"} className={kind === "title" ? "is-active" : ""} onClick={() => setKind("title")}>標題</button>
          <button type="button" role="radio" aria-checked={kind === "description"} className={kind === "description" ? "is-active" : ""} onClick={() => setKind("description")}>說明</button>
        </div>
        <label><span>文字內容</span><textarea rows="3" autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={kind === "title" ? "輸入標題" : "輸入說明文字"} /></label>
        <fieldset className="annotation-position-field">
          <legend>放置位置</legend>
          <div className="annotation-position-picker">
            {["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"].map((key) => key === "mc" ? <span key={key} aria-hidden="true" /> : (
              <button
                key={key}
                type="button"
                className={position === key ? "is-active" : ""}
                aria-pressed={position === key}
                aria-label={ANNOTATION_POSITION_LABELS[key]}
                title={ANNOTATION_POSITION_LABELS[key]}
                onClick={() => setPosition(key)}
              />
            ))}
          </div>
          <small>{ANNOTATION_POSITION_LABELS[position]}</small>
        </fieldset>
      </div>
      <div className="feature-dialog-actions">
        <button className="quiet-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" onClick={() => onApply({ kind, text, position })}>
          <Type size={16} /> 加入{kind === "title" ? "標題" : "說明"}
        </button>
      </div>
    </Modal>
  );
}

function AuthGate({
  feature,
  session,
  locale,
  online,
  busy,
  errorMessage,
  emailLinkFlow,
  onSetLocale,
  onGoogleSignIn,
  onSendEmailLink,
  onCompleteEmailLink,
  onAccept,
  onSignOut,
  onRetry,
  onClose,
}) {
  const isDriveOnboarding = feature === "drive-onboarding";
  const [accepted, setAccepted] = useState(isDriveOnboarding);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [email, setEmail] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const signedInAccount = session.status === "signed-in" && session.user;
  const signedIn = signedInAccount && isMoodboardIdentityEligible(session.user);
  const loading = session.status === "loading";
  const unavailable = session.status === "error";
  const actionDisabled = !accepted || busy || loading || (!online && !signedIn);
  const needsEmailAddress = emailLinkFlow?.status === "needs-email";
  const featureCopy = needsEmailAddress
    ? {
      title: "完成 Email 驗證登入",
      description: "請輸入收到這封驗證信的 Email；地址只用來完成登入，不會寫進網址。",
    }
    : feature === "collaboration"
    ? {
      title: "登入後分享 Google Drive 工作檔",
      description: "登入後可把同一份 Drive 工作檔分享給指定帳號；本機編輯與輸出仍不需登入。",
    }
    : feature === "shared-moodboard"
      ? {
        title: "登入後開啟 Drive 分享檔案",
        description: "登入並連結 Google Drive 後，會依檔案擁有者授予的檢視或編輯權限開啟。",
      }
    : isDriveOnboarding
      ? {
        title: "登入並連結 Google Drive",
        description: "這是一個連續流程：Google 登入完成後會直接授權 Drive，成功後回到工作畫面，不需要再按一次連結。",
      }
    : feature === "drive"
      ? {
        title: "登入後連結 Google Drive",
        description: "PETFASHION 登入只確認身份；下一步仍會另外詢問 Google Drive 檔案權限。",
      }
    : feature === "3d"
      ? {
        title: "登入後使用進階 3D",
        description: "進階 3D 操作需要登入；你目前的選取與本機工作檔不會被改動。",
      }
      : {
        title: "登入以使用進階功能",
        description: "Drive 分享、同步與進階 3D 需要登入；本機編輯、儲存與匯出不需登入。",
      };
  const statusFeedback = errorMessage
    ? { kind: "error", icon: AlertTriangle, message: errorMessage }
    : signedInAccount && !signedIn
      ? { kind: "error", icon: AlertTriangle, message: "這個帳號必須先完成 Email 驗證，並使用允許的登入方式。" }
      : !online && !signedIn
        ? { kind: "notice", icon: CloudOff, message: "首次登入需要網路連線；完成一次登入後，這台裝置可繼續離線工作。" }
        : emailNotice
          ? { kind: "success", icon: Check, message: emailNotice }
          : null;

  useEffect(() => {
    setAccepted(isDriveOnboarding);
    setMarketingOptIn(false);
    setRememberSession(true);
    setEmail("");
    setEmailNotice("");
  }, [isDriveOnboarding, session.status, session.user?.uid]);

  const submitEmail = async (event) => {
    event.preventDefault();
    setEmailNotice("");
    const result = needsEmailAddress
      ? await onCompleteEmailLink({ email, marketingOptIn, rememberSession, accepted })
      : await onSendEmailLink({ email, marketingOptIn, rememberSession, accepted });
    if (result?.maskedEmail) setEmailNotice(`驗證連結已寄到 ${result.maskedEmail}。請在一小時內完成。`);
  };

  return (
    <div className="auth-gate" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-gate-panel" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title" aria-describedby="auth-gate-description">
        <IconButton className="auth-gate-close" label="先繼續訪客模式" onClick={onClose}><X size={18} /></IconButton>
        <div className="auth-gate-locale" role="group" aria-label="介面語言">
          {INTERFACE_LOCALES.map((option) => (
            <button
              type="button"
              className={locale === option.id ? "is-active" : ""}
              aria-pressed={locale === option.id}
              onClick={() => onSetLocale(option.id)}
              data-l10n-ignore
              key={option.id}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>
        <div className="auth-gate-brand" aria-hidden="true"><span>∞</span><strong>Infinite Studio</strong></div>
        <div className="auth-gate-heading">
          <span className="auth-gate-kicker">PETFASHION FREE CREATIVE TOOL</span>
          <h1 id="auth-gate-title">{featureCopy.title}</h1>
          <p id="auth-gate-description">{featureCopy.description}</p>
        </div>

        {signedIn && !needsEmailAddress ? (
          <div className="auth-gate-account">
            <AccountAvatar user={session.user} size={42} />
            <span><small>目前登入帳號</small><strong data-l10n-ignore>{accountDisplayName(session.user)}</strong><em data-l10n-ignore>{session.user.email}</em></span>
            <button className="quiet-button" type="button" onClick={onSignOut} disabled={busy}>換其他帳號</button>
          </div>
        ) : null}

        <label className="auth-consent-check">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          <span>
            <strong>{isDriveOnboarding ? "同意登入並連結 Google Drive" : "同意使用 PETFASHION 帳號登入"} <em>必填</em></strong>
            <small>{isDriveOnboarding
              ? "登入只使用名稱、頭像與 Email；Drive 僅要求 drive.file。完成連結不會自動上傳工作檔。"
              : "只使用名稱、頭像與 Email；工作檔不會因登入自動上傳。"}</small>
          </span>
        </label>

        <div className="auth-quick-preferences" aria-label="登入偏好">
          <label className="auth-quick-check">
            <input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} />
            <span>預先設定產品 Email 偏好 <small>選填，只保存在此裝置</small></span>
          </label>
          {!signedIn && !needsEmailAddress ? (
            <label className="auth-quick-check">
              <input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} />
              <span>在這台裝置保持登入 <small>僅限個人裝置</small></span>
            </label>
          ) : null}
        </div>

        {statusFeedback ? (
          <p
            className={`auth-gate-message${statusFeedback.kind === "error" ? " is-error" : statusFeedback.kind === "success" ? " is-success" : ""}`}
            role={statusFeedback.kind === "error" ? "alert" : "status"}
          >
            <statusFeedback.icon size={16} />
            {statusFeedback.message}
          </p>
        ) : null}
        {unavailable ? (
          <button className="primary-button auth-primary-action" type="button" onClick={onRetry}><RefreshCw size={17} />重新連線</button>
        ) : signedIn && !needsEmailAddress ? (
          <button
            className="primary-button auth-primary-action"
            type="button"
            disabled={actionDisabled}
            onClick={() => onAccept({ marketingOptIn })}
          >
            {busy || loading ? <RefreshCw size={17} className="is-spinning" /> : <UserRound size={17} />}
            {loading ? "正在確認登入狀態…" : busy ? (isDriveOnboarding ? "正在連結 Google Drive…" : "登入處理中…") : (isDriveOnboarding ? "同意並連結 Google Drive" : "同意並繼續")}
          </button>
        ) : (
          <div className="auth-methods">
            {!needsEmailAddress ? (
              <>
                <button
                  className="primary-button auth-primary-action auth-google-action"
                  type="button"
                  disabled={actionDisabled}
                  onClick={() => onGoogleSignIn({ marketingOptIn, rememberSession })}
                >
                  {busy || loading ? <RefreshCw size={17} className="is-spinning" /> : <span className="auth-google-mark" aria-hidden="true">G</span>}
                  {loading ? "正在確認登入狀態…" : busy ? (isDriveOnboarding ? "正在連結 Google Drive…" : "登入處理中…") : (isDriveOnboarding ? "使用 Google 登入並連結 Drive" : "使用 Google 帳號登入")}
                </button>
                <div className="auth-method-divider"><span>或使用 Email 驗證連結</span></div>
              </>
            ) : null}
            <form className="auth-email-method" onSubmit={submitEmail}>
              <label htmlFor="moodboard-auth-email">Email</label>
              <div className="auth-email-row">
                <input
                  id="moodboard-auth-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  data-l10n-ignore
                />
                <button className="secondary-button" type="submit" disabled={actionDisabled || !email.trim()}>
                  {busy ? <RefreshCw size={16} className="is-spinning" /> : <Mail size={16} />}
                  {needsEmailAddress ? "完成驗證" : emailNotice ? "重新寄送" : "寄送連結"}
                </button>
              </div>
              <small>{needsEmailAddress ? "為防止他人冒用連結，必須再次確認收件地址。" : "免設密碼；驗證連結一小時內有效，請勿轉寄給他人。"}</small>
            </form>
          </div>
        )}

        <details className="auth-data-details">
          <summary><Info size={16} /><span>登入與資料說明</span><ChevronDown size={16} /></summary>
          <div>
            <ul>
              <li>PETFASHION 只使用名稱、頭像與 Email 登入及辨識帳號。</li>
              {isDriveOnboarding ? <li>Google Drive 只授予 drive.file 權限；連結不等於上傳，第一次儲存前不會建立雲端工作檔。</li> : null}
              <li>會員由 PETFASHION 統一管理，並記錄 Infinite Studio 啟用來源。</li>
              <li>作品、素材與版本預設保存在這台裝置，不會自動上傳。</li>
            </ul>
            <p><Info size={14} />共用電腦用畢請登出，並在設定清除本機工作檔。</p>
          </div>
        </details>

        <button className="quiet-button auth-guest-action" type="button" onClick={onClose}>先繼續訪客模式</button>

        <p className="auth-legal-links">
          繼續即表示你已閱讀
          <a href={PETFASHION_TERMS_URL} target="_blank" rel="noreferrer">服務條款 <ExternalLink size={12} /></a>
          與
          <a href={PETFASHION_PRIVACY_URL} target="_blank" rel="noreferrer">隱私權政策 <ExternalLink size={12} /></a>。
        </p>
      </section>
    </div>
  );
}

function DeleteCompositionWarningModal({ request, onCancel, onConfirm }) {
  const search = useListSearch("delete-impact");
  const matchingCompositions = request.affectedCompositions.filter((composition) => matchesListQuery([
    composition.name,
    composition.kind,
  ], search.query));
  const visibleCompositions = matchingCompositions.slice(0, search.query ? 20 : 5);
  const hiddenCount = matchingCompositions.length - visibleCompositions.length;
  const objectLabel = request.objectIds.length === 1 ? "這個物件" : `這 ${request.objectIds.length} 個物件`;
  const compositionLabel = request.affectedCompositions.length === 1
    ? "1 個構圖"
    : `${request.affectedCompositions.length} 個構圖`;

  return (
    <Modal
      title="刪除會影響已儲存的構圖"
      description="構圖只記錄物件狀態，不會另外複製素材。"
      onClose={onCancel}
      dialogRole="alertdialog"
    >
      <div className="delete-composition-warning">
        <div className="delete-impact-summary">
          <span className="delete-impact-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
          <div>
            <strong>{objectLabel}被 {compositionLabel} 使用</strong>
            <p>刪除後，構圖仍會保留，但無法完整還原被刪除的物件。</p>
          </div>
        </div>
        <div className="modal-list-toolbar"><strong>受影響的構圖</strong><ListSearchToggle search={search} resultCount={matchingCompositions.length} totalCount={request.affectedCompositions.length} label="搜尋受影響的構圖" /></div>
        <ListSearchField search={search} placeholder="搜尋構圖名稱" />
        <ul className="delete-impact-list" aria-label="受影響的構圖">
          {visibleCompositions.map((composition) => <li key={composition.id || composition.name}>{composition.name || "未命名構圖"}</li>)}
          {hiddenCount > 0 ? <li className="delete-impact-more">{`另有 ${hiddenCount} 個構圖`}</li> : null}
        </ul>
        {!matchingCompositions.length ? <div className="modal-empty compact"><Search size={22} /><strong>找不到符合的構圖</strong><button className="text-button" type="button" onClick={() => search.setQuery("")}>清除搜尋</button></div> : null}
        <p className="delete-recovery-note"><Undo2 size={15} aria-hidden="true" /> 若仍要刪除，可立即按 ⌘Z 復原。</p>
        <div className="delete-warning-actions">
          <button className="secondary-button" type="button" onClick={onCancel} autoFocus>取消</button>
          <button className="danger-button" type="button" onClick={onConfirm}><Trash2 size={16} />仍要刪除</button>
        </div>
      </div>
    </Modal>
  );
}

function EscapeCancellationModal({ request, onKeep, onCancel }) {
  return (
    <Modal
      title="取消目前調整？"
      description="這會放棄尚未完成的調整並回到操作前；其他已完成的編輯不受影響。"
      onClose={onKeep}
      dialogRole="alertdialog"
    >
      <div className="delete-composition-warning">
        <div className="delete-impact-summary">
          <span className="delete-impact-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
          <div>
            <strong>{request.label}</strong>
            <p>選擇保留會套用目前畫面中的結果；取消則精確回到這次操作開始前。</p>
          </div>
        </div>
        <div className="delete-warning-actions">
          <button className="secondary-button" type="button" onClick={onKeep} autoFocus>保留目前調整</button>
          <button className="danger-button" type="button" onClick={onCancel}><X size={16} />取消這次調整</button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteLocalDataModal({ onCancel, onConfirm, isBusy }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal
      title="清除這台裝置的工作檔資料"
      description="這是永久刪除，無法用復原功能取回。"
      onClose={onCancel}
      dialogRole="alertdialog"
    >
      <div className="delete-composition-warning">
        <div className="delete-impact-summary">
          <span className="delete-impact-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
          <div>
            <strong>將刪除目前自動儲存與所有本機版本</strong>
            <p>你主動下載的 `.studio`、HTML 與輸出圖片不受影響；登入帳號也不會被刪除。</p>
          </div>
        </div>
        <label className="delete-local-confirmation">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>我已確認需要永久清除這台裝置上的工作檔資料。</span>
        </label>
        <div className="delete-warning-actions">
          <button className="secondary-button" type="button" onClick={onCancel} autoFocus>取消</button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={!confirmed || isBusy}><Trash2 size={16} />{isBusy ? "清除中…" : "永久清除"}</button>
        </div>
      </div>
    </Modal>
  );
}

function VersionModal({
  versions,
  loadRecovery,
  onRestoreLoad,
  pendingTabUpdate,
  onOpenTabUpdate,
  board,
  versionLabel,
  setVersionLabel,
  driveVersions,
  driveLinked,
  onCreate,
  onRestore,
  onOpenLocalCopy,
  onDeleteLocalVersion,
  preview = false,
  readOnly,
  onRefreshDrive,
  onRecoverDrive,
  onClose,
  isBusy,
}) {
  const search = useListSearch("versions");
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const listedVersions = versions.filter((version) => matchesListQuery([
    version.label,
    version.kind === "manual" ? "手動" : "自動",
    formatTime(version.createdAt),
    `${version.objectCount} 個物件`,
  ], search.query));
  const listedDriveVersions = (driveVersions.items || []).filter((revision) => matchesListQuery([
    revision.id,
    revision.keepForever ? "已保留" : "Drive 暫存",
    revision.lastModifyingUser?.displayName,
    revision.lastModifyingUser?.emailAddress,
    formatTime(revision.modifiedTime),
    formatStorageSize(revision.size),
  ], search.query));
  const totalVersions = versions.length + (driveVersions.items?.length || 0);
  const totalListedVersions = listedVersions.length + listedDriveVersions.length;
  return (
    <Modal title="版本紀錄" description="本機保留近期版本與固定的復原點；更新雲端前也會保留 Drive 版本。" onClose={onClose} wide>
      {preview ? <p className="drive-inline-message" role="status">這是模擬資料，不會讀取或刪除實際版本。</p> : null}
      {loadRecovery ? <div className="version-cloud-state"><History size={19} /><span><strong>載入雲端前的畫面</strong><small>還原後暫停自動上傳，確認後再更新雲端。</small></span><button className="secondary-button" type="button" disabled={isBusy} onClick={onRestoreLoad}>復原載入前內容</button></div> : null}
      {pendingTabUpdate ? <div className="version-cloud-state"><Info size={19} /><span><strong>另一個分頁有更新</strong><small>目前畫布沒有被取代；可將另一分頁的內容開成獨立副本。</small></span><button className="secondary-button" type="button" onClick={onOpenTabUpdate} disabled={isBusy}>開成新副本</button></div> : null}
      <form className="version-create" onSubmit={(event) => { event.preventDefault(); onCreate(); }}>
        <label><span>版本備註</span><input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="例如：完成第一輪素材篩選" /></label>
        <button className="primary-button" type="submit" disabled={isBusy}><History size={16} /> 建立版本</button>
      </form>
      <div className="version-current"><span>目前</span><strong>r{board.revision}</strong><small>{`${board.objects.length} 個物件 · ${formatTime(board.updatedAt)}`}</small></div>
      {totalVersions ? <div className="modal-list-toolbar"><strong>版本清單</strong><ListSearchToggle search={search} resultCount={totalListedVersions} totalCount={totalVersions} label="搜尋版本紀錄" /></div> : null}
      <ListSearchField search={search} placeholder="搜尋版本備註或日期" />
      <div className="version-section-heading"><strong>本機版本</strong><small>可檢視並逐一刪除不需要的版本；受保護的復原點不會被刪除。</small></div>
      {listedVersions.length ? (
        <div className="version-list">
          {listedVersions.map((version) => (
            <article key={version.id}>
              <div><strong data-l10n-ignore>{version.label}</strong><small>{`${version.objectCount} 個物件 · ${formatTime(version.createdAt)}`}</small></div>
              <span className={`version-kind kind-${version.kind}`}>{version.kind === "manual" ? "手動" : "自動"}</span>
              <div className="version-actions">
                <button className="quiet-button" type="button" onClick={() => onOpenLocalCopy(version)} disabled={isBusy}>開成新副本</button>
                <button className="quiet-button" type="button" onClick={() => onRestore(version)} disabled={isBusy || readOnly}>還原</button>
                {version.pinned || version.slot ? <span className="version-protected">受保護的復原點</span> : <button className="quiet-button" type="button" onClick={() => setDeleteCandidate(version)} disabled={isBusy} aria-label={`刪除本機版本 ${version.label}`}>刪除</button>}
              </div>
              {deleteCandidate?.id === version.id ? <div className="version-delete-confirmation" role="alert">
                <p>刪除「{version.label}」後無法復原此本機版本；目前畫布和 Drive 檔案不會被刪除。請先確認已有需要的備份。</p>
                <div><button className="secondary-button" type="button" onClick={() => setDeleteCandidate(null)} disabled={isBusy}>取消</button><button className="danger-button" type="button" disabled={isBusy} onClick={async () => { if (await onDeleteLocalVersion(version)) setDeleteCandidate(null); }}>刪除此版本</button></div>
              </div> : null}
            </article>
          ))}
        </div>
      ) : versions.length ? (
        <div className="modal-empty"><Search size={24} /><strong>找不到符合的版本</strong><p>搜尋條件會保留，可以調整或清除。</p><button className="text-button" type="button" onClick={() => search.setQuery("")}>清除搜尋</button></div>
      ) : (
        <div className="modal-empty"><History size={24} /><strong>尚未建立版本</strong><p>目前畫布仍會自動存到這台裝置；手動版本適合重要節點。</p></div>
      )}
      <div className="version-section-heading is-drive">
        <div><strong>Google Drive 版本</strong><small>復原時會開成新的本機工作檔，不會覆蓋目前工作。</small></div>
        {driveLinked ? <button className="quiet-button" type="button" onClick={onRefreshDrive} disabled={driveVersions.status === "loading" || isBusy}><RefreshCw size={15} className={driveVersions.status === "loading" ? "is-spinning" : ""} />重新整理</button> : null}
      </div>
      {!driveLinked ? (
        <div className="version-cloud-state"><CloudOff size={19} /><span><strong>尚未連結 Drive 檔案</strong><small>先把目前工作檔儲存到 Drive，之後同步會自動保留舊版本。</small></span></div>
      ) : driveVersions.status === "loading" ? (
        <div className="version-cloud-state"><RefreshCw size={19} className="is-spinning" /><span><strong>正在讀取 Drive 版本…</strong><small>目前工作檔不會受影響。</small></span></div>
      ) : driveVersions.status === "error" || driveVersions.status === "authorization-required" ? (
        <div className="version-cloud-state is-error"><AlertTriangle size={19} /><span><strong>無法讀取 Drive 版本</strong><small>{driveVersions.message}</small></span></div>
      ) : listedDriveVersions.length ? (
        <div className="version-list is-drive-list">
          {listedDriveVersions.map((revision) => {
            const isHead = revision.id === driveVersions.headRevisionId;
            const recoverable = isHead || revision.keepForever;
            return (
              <article key={revision.id}>
                <div><strong>{isHead ? "目前 Drive 版本" : `Drive 版本 ${revision.id}`}</strong><small>{`${formatStorageSize(revision.size)} · ${formatTime(revision.modifiedTime)}${revision.lastModifyingUser?.displayName ? ` · ${revision.lastModifyingUser.displayName}` : ""}`}</small></div>
                <span className={`version-kind ${recoverable ? "kind-manual" : ""}`}>{isHead ? "目前" : revision.keepForever ? "已保留" : "暫存"}</span>
                <button className="quiet-button" type="button" onClick={() => onRecoverDrive(revision)} disabled={isBusy || !recoverable} title={recoverable ? "開成新的本機工作檔" : "這個 Drive 暫存版本無法下載"}>開成新副本</button>
              </article>
            );
          })}
        </div>
      ) : driveVersions.status === "ready" ? (
        <div className="version-cloud-state"><Cloud size={19} /><span><strong>Drive 尚無可列出的歷史版本</strong><small>下次同步前會先保留目前 Drive 內容。</small></span></div>
      ) : null}
    </Modal>
  );
}

function driveStatusPresentation(driveSession) {
  if (driveSession.status === "connecting") return { icon: RefreshCw, label: "正在連結 Google Drive…", tone: "working" };
  if (driveSession.status === "checking") return { icon: RefreshCw, label: "正在確認 Google Drive…", tone: "working" };
  if (driveSession.status === "syncing") return { icon: RefreshCw, label: "正在上傳目前內容至 Google Drive…", tone: "working" };
  if (driveSession.status === "synced-local-warning") return { icon: AlertTriangle, label: "已儲存至 Google Drive；本機備份未更新", tone: "warning" };
  if (driveSession.status === "synced") return { icon: Check, label: "已儲存至 Google Drive", tone: "success" };
  if (driveSession.status === "pending") return { icon: CloudUpload, label: "有變更尚未儲存至雲端", tone: "warning" };
  if (driveSession.status === "offline") return { icon: CloudOff, label: "目前離線；尚未儲存至雲端", tone: "warning" };
  if (driveSession.status === "quota") return { icon: AlertTriangle, label: "Google Drive 空間不足", tone: "error" };
  if (driveSession.status === "conflict") return { icon: AlertTriangle, label: "雲端與目前內容不同；自動上傳已暫停", tone: "warning" };
  if (driveSession.status === "authorization-required") return { icon: CloudOff, label: "需要重新連結 Google Drive", tone: "warning" };
  if (driveSession.status === "error") return { icon: AlertTriangle, label: "尚未儲存至 Google Drive", tone: "error" };
  if (driveSession.connected) return { icon: Cloud, label: "Google Drive 已連結", tone: "success" };
  return { icon: CloudOff, label: "Google Drive 尚未連結", tone: "muted" };
}

function libraryItemPresentation(item) {
  const presentations = {
    synced: { label: "本機與 Drive 已同步", tone: "success" },
    "needs-review": { label: "雲端與目前內容不同", tone: "warning" },
    "local-changed": { label: "本機有尚未同步的變更", tone: "warning" },
    linked: { label: "已連結 Drive", tone: "success" },
    "local-only": { label: "僅保存在本機", tone: "local" },
    "remote-only": { label: "僅保存在 Drive", tone: "remote" },
    pending: { label: "等待同步", tone: "warning" },
    syncing: { label: "正在上傳目前內容至 Google Drive…", tone: "working" },
    offline: { label: "離線等待同步", tone: "warning" },
    quota: { label: "Drive 空間不足", tone: "error" },
    "authorization-required": { label: "需要重新連結 Drive", tone: "warning" },
    conflict: { label: "需要處理版本衝突", tone: "error" },
    error: { label: "同步失敗", tone: "error" },
  };
  return presentations[item.status] || presentations["local-only"];
}

function StorageLocationModal({ currentTarget, onChoose, onClose }) {
  const [draftTarget, setDraftTarget] = useState(currentTarget || "");
  const [driveConsentAcknowledged, setDriveConsentAcknowledged] = useState(false);
  const choosingDrive = draftTarget === "drive";
  const canContinue = Boolean(draftTarget) && (!choosingDrive || driveConsentAcknowledged);

  return (
    <Modal
      title="選擇主要儲存位置"
      description="每份工作檔只有一個主要位置，之後可在設定中更改。"
      onClose={onClose}
    >
      <div className="storage-location-options" role="radiogroup" aria-label="主要儲存位置">
        <button
          className={`storage-location-option ${draftTarget === "local" ? "is-selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={draftTarget === "local"}
          onClick={() => setDraftTarget("local")}
        >
          <span className="storage-location-option-icon"><HardDrive size={22} /></span>
          <span><strong>這台裝置</strong><small>選擇一份 .studio 檔案供自動儲存；瀏覽器另保留復原副本。</small></span>
          {draftTarget === "local" ? <Check size={17} /> : <ChevronRight size={17} />}
        </button>
        <button
          className={`storage-location-option ${draftTarget === "drive" ? "is-selected" : ""}`}
          type="button"
          role="radio"
          aria-checked={draftTarget === "drive"}
          onClick={() => setDraftTarget("drive")}
        >
          <span className="storage-location-option-icon"><Cloud size={22} /></span>
          <span><strong>Google Drive</strong><small>適合跨裝置開啟；登入與 Drive 授權會在同一流程完成。</small></span>
          {draftTarget === "drive" ? <Check size={17} /> : <ChevronRight size={17} />}
        </button>
      </div>
      {choosingDrive ? (
        <label className="storage-drive-consent">
          <input
            type="checkbox"
            checked={driveConsentAcknowledged}
            onChange={(event) => setDriveConsentAcknowledged(event.target.checked)}
          />
          <span>
            <strong>我同意登入並自動連結 Google Drive <em>必填</em></strong>
            <small>繼續後會登入 PETFASHION，並由 Google 授予 drive.file 權限；只存取 Infinite Studio 建立或你指定的檔案。連結完成不會立即上傳，第一次儲存才會建立 Drive 工作檔，本機安全副本仍會保留。</small>
          </span>
        </label>
      ) : null}
      <p className="storage-location-note"><ShieldCheck size={16} />切換位置不會刪除另一端的檔案；未同步變更會先留在這台裝置。</p>
      <div className="storage-location-actions">
        <button className="quiet-button" type="button" onClick={onClose}>取消</button>
        <button
          className="primary-button"
          type="button"
          disabled={!canContinue}
          onClick={() => onChoose(draftTarget, { driveConsentAcknowledged })}
        >
          {choosingDrive ? <Cloud size={16} /> : <HardDrive size={16} />}
          {choosingDrive ? "登入並連結 Google Drive" : "使用這台裝置"}
        </button>
      </div>
    </Modal>
  );
}

function LocalFileAutosaveModal({ binding, supported, onChoose, onDownload, onClose }) {
  const needsPermission = binding.status === "permission-required";
  const hasError = binding.status === "error";
  return (
    <Modal
      title={supported ? "選擇本機自動儲存檔案" : "這個瀏覽器無法持續寫入檔案"}
      description={supported
        ? "基於瀏覽器安全限制，必須由你點一下按鈕，才會開啟 Finder／檔案視窗。選定後，後續變更會自動寫入該 .studio 檔案。"
        : "目前仍會自動保存在這個瀏覽器，並可下載 .studio 備份；瀏覽器不會假裝已寫入 Finder／檔案。"}
      onClose={onClose}
    >
      <div className={`local-file-location-summary ${hasError ? "is-error" : ""}`}>
        <HardDrive size={20} />
        <span>
          <strong>{needsPermission && binding.name ? `重新授權「${binding.name}」` : supported ? "指定可編輯的 .studio 檔案" : "瀏覽器本機復原副本"}</strong>
          <small>無論選擇哪一種方式，Infinite Studio 都會先保留瀏覽器內的復原副本。</small>
        </span>
      </div>
      <div className="feature-dialog-actions">
        <button className="quiet-button" type="button" onClick={onClose}>暫時只存這個瀏覽器</button>
        {supported ? (
          <button className="primary-button" type="button" onClick={onChoose}>
            <FolderOpen size={16} /> {needsPermission ? "重新授權檔案" : "選擇 Finder／檔案位置"}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onDownload}>
            <Download size={16} /> 下載 .studio 備份
          </button>
        )}
      </div>
    </Modal>
  );
}

function DriveSaveConfirmation({ target, busy, status, onConfirm, onResolve, onClose }) {
  const bodyRef = useRef(null);
  const feedback = target.feedback;
  const needsResolution = feedback && feedback.action !== "retry";
  const settlingFailure = busy && !["checking", "syncing"].includes(status);
  useEffect(() => {
    const dialog = bodyRef.current.closest('[role="dialog"]');
    const previous = document.activeElement;
    bodyRef.current.querySelector("button")?.focus();
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled), a[href], [tabindex='0']")];
      if (!controls.length) { event.preventDefault(); return; }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => { dialog.removeEventListener("keydown", trapFocus); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <Modal title="以目前內容更新雲端？" description="Google Drive 上的內容與目前畫布不同。" onClose={busy ? () => {} : onClose} busy={busy}>
    <div className="drive-save-confirmation" ref={bodyRef}>
      <strong data-l10n-ignore>{target.name}</strong>
      <p>將目前畫布儲存到同一份 Drive 檔案，分享連結不變。舊版會先保留，可從「版本紀錄」復原。</p>
      {busy ? <div className="drive-save-feedback" role="status" aria-live="polite">
        <RefreshCw size={18} className="is-spinning" aria-hidden="true" />
        <div><strong>{settlingFailure ? "正在整理更新結果…" : "正在更新雲端…"}</strong><p>{settlingFailure ? "更新尚未確認完成，正在保留錯誤與復原資訊。請稍候。" : status === "checking" ? "正在準備本機復原副本，並檢查雲端空間與版本。" : "正在上傳並確認雲端版本；確認完成後會自動關閉此視窗。"}</p></div>
      </div> : feedback ? <div className="drive-save-feedback" role="alert">
        <AlertTriangle size={18} aria-hidden="true" />
        <div><strong>{feedback.title}</strong><p>{feedback.message}</p>{feedback.warning ? <p>{feedback.warning}</p> : <p>目前編輯畫面仍保留，不會載入雲端內容。</p>}</div>
      </div> : null}
      <div className="drive-save-confirmation-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="primary-button" type="button" disabled={busy} onClick={needsResolution ? onResolve : onConfirm}>{busy ? <RefreshCw size={16} className="is-spinning" /> : <CloudUpload size={16} />}{busy ? "更新中…" : needsResolution ? (feedback.action === "backup" ? "前往下載本機備份" : feedback.action === "reconnect" ? "前往重新連結" : "檢查雲端狀態") : feedback ? "再次以目前內容更新" : "以目前內容更新"}</button>
      </div>
    </div>
  </Modal>;
}

function DriveLibraryModal({
  board,
  currentContentBytes,
  currentLink,
  driveSession,
  driveSettings,
  primaryStorageTarget,
  localBoards,
  syncJobs,
  onConnect,
  onCreateLocal,
  onDisconnect,
  onDownloadBackup,
  onOpenDeviceFile,
  onOpenLocal,
  onOpenFile,
  onRecoverRemote,
  onRefresh,
  onRename,
  onSave,
  onSaveCopy,
  onSetAutoSync,
  onClose,
}) {
  const search = useListSearch("drive-files");
  const [renameKey, setRenameKey] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState("");
  const status = driveStatusPresentation(driveSession);
  const StatusIcon = status.icon;
  const files = driveSession.files || [];
  const libraryItems = mergeMoodboardLibrary({ localBoards, remoteFiles: files, syncJobs, links: driveSettings.links });
  const listedItems = libraryItems.filter((item) => matchesListQuery([
    item.name,
    libraryItemPresentation(item).label,
    formatTime(item.updatedAt || Date.now()),
    item.local ? "本機" : "",
    item.remote ? "Drive" : "",
  ], search.query));
  const quota = driveSession.quota;
  const quotaAssessment = quota ? evaluateDriveQuota(quota, currentContentBytes) : null;
  const busy = ["connecting", "syncing", "checking"].includes(driveSession.status);
  const conflictSummary = driveSession.conflict ? describeDriveConflict(board, driveSession.conflict) : null;
  const configured = isGoogleDriveConfigured();
  const quotaLabel = quota?.limit === null
    ? "Google Drive 未提供固定個人上限；儲存時仍會確認結果。"
    : quota
      ? `${formatStorageSize(quota.remaining)} 可用，共 ${formatStorageSize(quota.limit)}`
      : "連結後會在儲存前檢查可用空間。";

  return (
    <Modal title="我的工作檔" description="在同一個檔案庫開啟這台裝置與 Infinite Studio 可存取的 Drive 檔案。" onClose={onClose} wide>
      <div className="drive-library">
        <section className="library-primary-location" aria-label="目前主要儲存位置">
          {primaryStorageTarget === "drive" ? <Cloud size={19} /> : primaryStorageTarget === "local" ? <HardDrive size={19} /> : <Info size={19} />}
          <div>
            <strong>{primaryStorageTarget === "drive" ? "主要儲存位置：Google Drive" : primaryStorageTarget === "local" ? "主要儲存位置：這台裝置" : "尚未選擇主要儲存位置"}</strong>
            <small>{primaryStorageTarget === "drive" ? "更新至雲端只會上傳目前畫布；下載本機副本不會切換主要位置。" : "儲存會更新選定的 .studio 檔案；瀏覽器暫存只用於復原。"}</small>
          </div>
        </section>
        {!driveSession.conflict ? (
          <section className={`drive-status-panel is-${status.tone}`} aria-live="polite">
            <span className="drive-status-icon" aria-hidden="true"><StatusIcon size={22} className={busy ? "is-spinning" : ""} /></span>
            <div>
              <strong>{status.label}</strong>
              <small>{driveSession.message || quotaLabel}</small>
            </div>
            {driveSession.connected ? (
              <button className="quiet-button" type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={15} />重新整理</button>
            ) : null}
          </section>
        ) : null}

        {!driveSession.connected ? (
          <section className="drive-permission-intro">
            <div><ShieldCheck size={23} aria-hidden="true" /><span><strong>只存取你在 Infinite Studio 建立的檔案</strong><small>Drive 授權和 PETFASHION 登入分開；不會讀取整個雲端硬碟，也不會因登入而自動上傳。</small></span></div>
            <div><HardDrive size={23} aria-hidden="true" /><span><strong>優先更新本機安全副本</strong><small>若瀏覽器空間不足，Drive 仍會繼續同步並明確提示；也可隨時下載 `.studio` 備份。</small></span></div>
            <button className="primary-button" type="button" onClick={onConnect} disabled={!configured || busy}>
              {busy ? <RefreshCw size={17} className="is-spinning" /> : <Cloud size={17} />}
              {configured ? (driveSettings.enabled ? "重新授權 Google Drive" : "連結 Google Drive") : "Google Drive 尚未設定"}
            </button>
          </section>
        ) : (
          <>
            {!driveSession.conflict ? (
              <div className="drive-toolbar">
                <label className="drive-auto-sync-choice">
                  <input type="checkbox" checked={driveSettings.autoSync} onChange={(event) => onSetAutoSync(event.target.checked)} />
                  <span><strong>自動更新至雲端</strong><small>停止操作後上傳目前內容，不會載入雲端版本</small></span>
                </label>
                <div className="drive-toolbar-actions">
                  <button className="secondary-button" type="button" onClick={onSaveCopy} disabled={busy}><Copy size={15} />另存雲端複本</button>
                  <button className="primary-button" type="button" onClick={onSave} disabled={busy || quotaAssessment?.allowed === false}><CloudUpload size={16} />更新至雲端</button>
                </div>
              </div>
            ) : null}

            {quotaAssessment?.level === "insufficient" ? (
              <p className="drive-inline-message is-error" role="alert"><AlertTriangle size={16} />空間不足以安全儲存目前約 {formatStorageSize(currentContentBytes)} 的檔案；畫布仍保存在這台裝置。</p>
            ) : quotaAssessment?.level === "low" ? (
              <p className="drive-inline-message is-warning" role="status"><AlertTriangle size={16} />Drive 剩餘空間偏低；建議先清理空間或下載離線備份。</p>
            ) : null}

            {driveSession.conflict ? (
              <section className="drive-conflict" role="alert">
                <AlertTriangle size={20} aria-hidden="true" />
                <div><strong>雲端與目前內容不同</strong><p>自動上傳已暫停，目前畫布沒有被取代。「更新至雲端」會上傳目前內容；載入雲端版本則會先備份目前畫布。</p></div>
                <dl className="drive-conflict-comparison">
                  <div><dt>這台裝置</dt><dd><span>{`${conflictSummary.local.objectCount} 個物件`}</span><span>{`最後編輯 ${formatTime(conflictSummary.local.updatedAt)}`}</span></dd></div>
                  <div><dt>Google Drive</dt><dd><span>{formatStorageSize(conflictSummary.remote.size)}</span><span>{`最後編輯 ${formatTime(conflictSummary.remote.modifiedTime)}`}</span></dd></div>
                </dl>
                {driveSession.conflictActionError ? (
                  <p className="drive-conflict-error" role="status"><strong>上次操作未完成：</strong>{driveSession.conflictActionError}</p>
                ) : null}
                <div className="drive-conflict-actions">
                  <button className="primary-button" type="button" onClick={onSave} disabled={busy}><CloudUpload size={16} />更新至雲端</button>
                  <button className="quiet-button" type="button" onClick={onClose} disabled={busy}>稍後處理</button>
                </div>
                <div className="drive-conflict-secondary-actions">
                  <details className="drive-conflict-more" key={driveSession.conflict.version}>
                    <summary><Ellipsis size={15} aria-hidden="true" />更多處理方式</summary>
                    <div className="drive-conflict-more-panel">
                      <button className="quiet-button" type="button" onClick={() => onOpenFile(driveSession.conflict)} disabled={busy}>載入雲端版本</button>
                      <button className="quiet-button" type="button" onClick={() => onRecoverRemote(driveSession.conflict)} disabled={busy}>將 Drive 版本開成新工作檔</button>
                      <button className="quiet-button" type="button" onClick={onSaveCopy} disabled={busy}>將目前內容另存新檔</button>
                    </div>
                  </details>
                </div>
              </section>
            ) : null}

            <div className="drive-footer-actions">
              <span><ShieldCheck size={15} />只使用 drive.file 最小權限</span>
              <button className="quiet-button" type="button" onClick={onDisconnect} title="只中斷目前分頁，不影響 PETFASHION 登入"><CloudOff size={15} />中斷此分頁</button>
            </div>
          </>
        )}

        <div className="modal-list-toolbar moodboard-library-toolbar">
          <strong>{`${listedItems.length} / ${libraryItems.length} 份工作檔`}</strong>
          <div className="drive-library-list-actions">
            <ListSearchToggle search={search} resultCount={listedItems.length} totalCount={libraryItems.length} label="搜尋我的工作檔" />
            <button className="quiet-button" type="button" onClick={onOpenDeviceFile}><FileUp size={15} />從檔案開啟</button>
            <button className="quiet-button" type="button" onClick={onDownloadBackup}><Download size={15} />下載 `.studio` 備份</button>
            <button className="quiet-button" type="button" onClick={onCreateLocal}><Plus size={15} />新增工作檔</button>
          </div>
        </div>
        <ListSearchField search={search} placeholder="搜尋工作檔名稱、位置或同步狀態" />
        {listedItems.length ? (
          <div className="drive-file-list">
            {listedItems.map((item) => {
              const itemStatus = libraryItemPresentation(item);
              const isCurrent = item.boardId === board.id;
              const detail = [
                item.local ? `本機內容 r${item.local.revision}` : null,
                item.remote ? `Drive ${formatStorageSize(item.remote.size)}` : null,
                item.updatedAt ? formatTime(item.updatedAt) : null,
              ].filter(Boolean).join(" · ");
              return (
                <article className={isCurrent ? "is-current" : ""} key={item.key}>
                  <span className="drive-file-icon" aria-hidden="true">{item.local ? <HardDrive size={19} /> : <FileArchive size={19} />}</span>
                  <div>{renameKey === item.key ? <form className="drive-rename-form" onSubmit={async (event) => { event.preventDefault(); const name = renameValue.trim(); if (!name) { setRenameError("請輸入名稱。"); return; } setRenameBusy(true); setRenameError(""); try { const result = await onRename(item, name); if (result) setRenameKey(""); else setRenameError("名稱尚未完成儲存；請查看同步狀態並重試。"); } catch (error) { setRenameError(error?.message || "無法更新名稱，請重試。"); } finally { setRenameBusy(false); } }}><input aria-label="工作檔名稱" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus disabled={renameBusy} /><button type="submit" className="quiet-button" disabled={renameBusy}>{renameBusy ? "儲存中…" : "儲存"}</button><button type="button" className="quiet-button" disabled={renameBusy} onClick={() => setRenameKey("")}>取消</button>{renameError ? <small role="alert">{renameError}</small> : null}</form> : <strong data-l10n-ignore title={item.name}>{item.name}</strong>}<small>{detail}</small></div>
                  <span className={`drive-file-badge is-${itemStatus.tone}`}>{itemStatus.tone === "success" ? <Check size={13} /> : itemStatus.tone === "error" ? <AlertTriangle size={13} /> : item.remote ? <Cloud size={13} /> : <HardDrive size={13} />}{isCurrent ? "目前檔案" : itemStatus.label}</span>
                  <button className="icon-button" type="button" title="重新命名" aria-label={`重新命名 ${item.name}`} disabled={busy || renameBusy} onClick={() => { setRenameValue(item.name); setRenameError(""); setRenameKey(item.key); }}><Pencil size={15} /></button>
                  {!isCurrent ? <button className="quiet-button" type="button" onClick={() => item.local ? onOpenLocal(item.local) : onOpenFile(item.remote)} disabled={busy}>開啟</button> : null}
                  {item.remote?.webViewLink ? <a className="icon-button" href={item.remote.webViewLink} target="_blank" rel="noreferrer" aria-label="在 Google Drive 查看" title="在 Google Drive 查看"><ExternalLink size={15} /></a> : null}
                </article>
              );
            })}
          </div>
        ) : libraryItems.length ? (
          <div className="modal-empty"><Search size={24} /><strong>找不到符合的工作檔</strong><p>搜尋條件會保留，可以調整或清除。</p><button className="text-button" type="button" onClick={() => search.setQuery("")}>清除搜尋</button></div>
        ) : (
          <div className="modal-empty"><HardDrive size={25} /><strong>還沒有工作檔</strong><p>建立第一份本機工作檔；需要跨裝置時再連結 Google Drive。</p><button className="primary-button" type="button" onClick={onCreateLocal}><Plus size={15} />新增工作檔</button></div>
        )}
      </div>
    </Modal>
  );
}

function DriveSharingModal({
  boardName,
  sharing,
  legacyLink,
  onConnectDrive,
  onAuthorizeIncomingDriveFile,
  onSaveToDrive,
  onRefresh,
  onCopyLink,
  onSetGeneralAccess,
  onInviteMember,
  onSetMemberRole,
  onRemoveMember,
  onClose,
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [permissionAction, setPermissionAction] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [confirmLinkPassword, setConfirmLinkPassword] = useState("");
  const [protectedLink, setProtectedLink] = useState("");
  const [protectedLinkMessage, setProtectedLinkMessage] = useState("");
  const [protectedLinkBusy, setProtectedLinkBusy] = useState(false);
  const protectedLinkGeneration = useRef(0);
  useEffect(() => { protectedLinkGeneration.current += 1; setLinkPassword(""); setConfirmLinkPassword(""); setProtectedLink(""); setProtectedLinkMessage(""); }, [sharing.fileId]);
  const ready = sharing.status === "ready" && Boolean(sharing.fileId);
  const busy = ["loading", "saving", "authorizing", "picker-authorizing", "opening-shared-file"].includes(sharing.status);
  const preparationIsError = ["error", "picker-unconfigured", "shared-file-denied"].includes(sharing.status);
  const accessUrl = googleDriveFileAccessUrl(sharing);
  const restrictedLink = sharing.permissionsVisible && !sharing.generalAccess.enabled;
  const publicCanEdit = sharing.permissionsVisible && sharing.generalAccess.enabled && sharing.generalAccess.role === "editor";
  const preparationTitle = {
    legacy: "舊版分享連結已停用",
    "authorization-required": "連結 Google Drive",
    "needs-picker-access": "授權並開啟共享檔案",
    "picker-authorizing": "正在開啟 Google 檔案選擇器…",
    "opening-shared-file": "正在讀取共享工作檔…",
    "picker-unconfigured": "網站尚未完成共享檔案設定",
    "shared-file-denied": "共享檔案尚未開啟",
    "needs-drive": "先儲存到 Google Drive",
    error: "無法讀取 Drive 分享權限",
  }[sharing.status] || "正在讀取 Google Drive…";

  const runPermissionAction = async (key, action) => {
    if (permissionAction) return;
    setPermissionAction(key);
    try {
      const succeeded = await action();
      if (succeeded && key === "invite") setEmail("");
    } finally {
      setPermissionAction("");
    }
  };

  return (
    <Modal
      title="分享 Google Drive 工作檔"
      description="分享的是目前這一份 Google Drive 工作檔；連結、成員與權限都由檔案擁有者的 Google Drive 管理。"
      onClose={onClose}
      wide
    >
      {legacyLink ? (
        <div className="status-banner warning" role="status">
          <AlertTriangle size={16} />
          <span>這是舊版 Firestore 分享連結。請由檔案擁有者重新使用 Google Drive 分享；舊分享空間不會再續用。</span>
        </div>
      ) : null}
      <section className={`cloud-collaboration-panel is-${sharing.status}`} aria-live="polite">
        {ready ? (
          <>
            <div className="cloud-collaboration-heading">
              <div>
                <strong data-l10n-ignore>{sharing.fileName || boardName || "未命名 Infinite Studio"}</strong>
                <small>同一份工作檔 · Google Drive</small>
              </div>
              <span className="cloud-role-badge">{drivePermissionRoleLabel(sharing.role)}</span>
            </div>

            <section className="collaboration-share-card" aria-labelledby="drive-share-link-title">
              <div className="collaboration-share-summary">
                <span className="collaboration-permission-icon" aria-hidden="true"><Share2 size={18} /></span>
                <div>
                  <strong id="drive-share-link-title">{restrictedLink ? "受限的分享連結" : "工作檔分享連結"}</strong>
                  <small>{!sharing.permissionsVisible ? "存取權由 Google Drive 管理；目前帳號只能確認自己的權限。" : publicCanEdit ? "目前知道連結的人可編輯；擁有者可改為僅檢視。" : sharing.generalAccess.enabled ? "知道連結的人可檢視；編輯仍需個別授權。" : "目前是受限連結；只有已獲 Drive 授權的帳號能開啟。"}</small>
                </div>
              </div>
              <label className="collaboration-invite-field">
                <span>直接開啟這份工作檔</span>
                <div>
                  <input
                    value={sharing.shareUrl || ""}
                    readOnly
                    data-l10n-ignore
                    aria-label="目前 Google Drive 工作檔的分享連結"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button className="primary-button" type="button" onClick={() => restrictedLink && sharing.canShare ? runPermissionAction("enable-viewer-link", async () => (await onSetGeneralAccess(true)) && onCopyLink("viewer")) : onCopyLink()} disabled={!sharing.shareUrl || Boolean(permissionAction)}>
                    <Copy size={16} />{restrictedLink && sharing.canShare ? "開啟連結檢視並複製" : restrictedLink ? "複製受限連結" : publicCanEdit ? "複製可編輯連結" : sharing.permissionsVisible && sharing.generalAccess.enabled ? "複製檢視連結" : "複製連結"}
                  </button>
                </div>
              </label>
              <p className="collaboration-share-note"><ShieldCheck size={14} />{restrictedLink && sharing.canShare ? "點擊上方按鈕會開放知道連結的人檢視；連結可轉傳，也可改為僅邀請指定帳號。" : "實際存取權仍以 Google Drive 為準；複製連結不會變更權限。"}</p>
              {restrictedLink && sharing.canShare ? <button className="quiet-button" type="button" onClick={() => onCopyLink("restricted")} disabled={Boolean(permissionAction)}>只複製受限連結</button> : null}
              {sharing.canShare ? <div className="protected-link-controls">
                <label className="collaboration-invite-field"><span>建立密碼連結</span><input type="password" autoComplete="new-password" value={linkPassword} onChange={(event) => { setLinkPassword(event.target.value); setProtectedLink(""); }} placeholder="至少 8 個字元" maxLength={128} disabled={protectedLinkBusy} /></label>
                <label className="collaboration-invite-field"><span>再次輸入密碼</span><input type="password" autoComplete="new-password" value={confirmLinkPassword} onChange={(event) => setConfirmLinkPassword(event.target.value)} maxLength={128} disabled={protectedLinkBusy} /></label>
                {confirmLinkPassword && confirmLinkPassword !== linkPassword ? <p role="status">兩次輸入的密碼不一致。</p> : null}
                <p>密碼只保護這個連結；已取得原始 Drive 檔案或一般連結的人仍可依 Drive 權限開啟。請使用不易猜測的密碼並另行傳送。舊連結不會自動失效。</p>
                <button className="secondary-button" type="button" disabled={protectedLinkBusy || linkPassword.length < 8 || linkPassword !== confirmLinkPassword} onClick={async () => {
                  const generation = protectedLinkGeneration.current;
                  setProtectedLinkBusy(true); setProtectedLinkMessage("");
                  try {
                    const link = await createProtectedShareLink(sharing, linkPassword, window.location.origin + window.location.pathname);
                    if (generation === protectedLinkGeneration.current) { setProtectedLink(link); setLinkPassword(""); setConfirmLinkPassword(""); setProtectedLinkMessage("密碼連結已建立，請複製並另行傳送密碼。"); }
                  } catch (error) { if (generation === protectedLinkGeneration.current) setProtectedLinkMessage(error.message || "無法建立密碼連結。"); }
                  finally { setProtectedLinkBusy(false); }
                }}>建立密碼連結</button>
                {protectedLink ? <label className="collaboration-invite-field"><span>密碼連結</span><div><input readOnly value={protectedLink} data-l10n-ignore onFocus={(event) => event.currentTarget.select()} /><button className="secondary-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(protectedLink); setProtectedLinkMessage("已複製密碼連結。"); } catch { setProtectedLinkMessage("無法自動複製，請選取連結後複製。"); } }}>複製密碼連結</button></div></label> : null}
                {protectedLinkMessage ? <p role="status">{protectedLinkMessage}</p> : null}
              </div> : null}
            </section>

            {sharing.permissionsVisible ? <section className="collaboration-permission-section collaboration-general-access" aria-labelledby="drive-general-access-title">
              <div className="collaboration-general-access-row">
                <div className="collaboration-permission-heading">
                  <span className="collaboration-permission-icon"><Share2 size={17} /></span>
                  <div>
                    <strong id="drive-general-access-title">一般存取權限</strong>
                    <small>{publicCanEdit ? "知道連結的人可編輯" : sharing.generalAccess.enabled ? "知道連結的人可檢視" : "受限：只有已授權帳號可開啟"}</small>
                  </div>
                </div>
                {sharing.canShare ? (
                  <div className="collaboration-general-actions"><button
                    className="secondary-button"
                    type="button"
                    aria-pressed={sharing.generalAccess.enabled}
                    onClick={() => runPermissionAction("general", () => onSetGeneralAccess(!sharing.generalAccess.enabled))}
                    disabled={Boolean(permissionAction)}
                  >
                    {permissionAction === "general" ? <RefreshCw className="is-spinning" size={14} /> : sharing.generalAccess.enabled ? <Lock size={14} /> : <Eye size={14} />}
                    {sharing.generalAccess.enabled ? "改為受限" : "開啟連結檢視"}
                  </button>{publicCanEdit ? <button className="secondary-button" type="button" onClick={() => runPermissionAction("general-view", () => onSetGeneralAccess(true))} disabled={Boolean(permissionAction)}>改為僅檢視</button> : null}</div>
                ) : (
                  <span className="collaboration-fixed-role"><Eye size={14} />{publicCanEdit ? "可編輯" : sharing.generalAccess.enabled ? "可檢視" : "受限"}</span>
                )}
              </div>
              <p>{publicCanEdit ? "目前連結具有編輯權。建議改為僅檢視，再以 Email 個別授予編輯權。" : "連結檢視不會讓他人修改檔案；編輯權必須以 Google 帳號 Email 個別授予。"}</p>
            </section> : null}

            {sharing.canShare && sharing.permissionsVisible ? (
              <section className="collaboration-permission-section collaboration-access-section" aria-labelledby="drive-member-access-title">
                <div className="collaboration-permission-heading">
                  <span className="collaboration-permission-icon"><Mail size={17} /></span>
                  <div>
                    <strong id="drive-member-access-title">新增協作者</strong>
                    <small>Google Drive 會把正式邀請寄到對方的 Google 帳號。</small>
                  </div>
                </div>
                <div className="drive-member-invite-row">
                  <label>
                    <span className="sr-only">協作者 Email</span>
                    <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" />
                  </label>
                  <select aria-label="新協作者權限" value={role} onChange={(event) => setRole(event.target.value)}>
                    <option value="viewer">檢視者</option>
                    <option value="editor">編輯者</option>
                  </select>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => runPermissionAction("invite", () => onInviteMember(email, role))}
                    disabled={Boolean(permissionAction) || !email.trim()}
                  >
                    {permissionAction === "invite" ? <RefreshCw className="is-spinning" size={15} /> : <Plus size={15} />}邀請
                  </button>
                </div>
              </section>
            ) : null}

            {sharing.canShare && sharing.permissionsVisible ? <section className="collaboration-permission-section collaboration-access-section" aria-labelledby="drive-member-list-title">
              <div className="collaboration-permission-heading">
                <span className="collaboration-permission-icon"><Users size={17} /></span>
                <div>
                  <strong id="drive-member-list-title">擁有存取權的使用者</strong>
                  <small>{`${sharing.members.length} 位成員；權限直接寫入 Google Drive。`}</small>
                </div>
              </div>
              <div className="collaboration-member-list">
                {sharing.members.map((member) => {
                  const roleActionKey = `role:${member.id}`;
                  const removeActionKey = `remove:${member.id}`;
                  return (
                    <article key={member.id}>
                      <span className="collaboration-member-identity">
                        <UserRound size={15} />
                        <span>
                          <b data-l10n-ignore>{member.name}</b>
                          <small>{member.emailAddress || drivePermissionRoleLabel(member.appRole)}</small>
                        </span>
                      </span>
                      {member.appRole === "owner" || !sharing.canShare ? (
                        <span className="collaboration-fixed-role"><Lock size={14} />{drivePermissionRoleLabel(member.appRole)}</span>
                      ) : (
                        <span className="collaboration-role-control" aria-busy={permissionAction === roleActionKey || undefined}>
                          <select
                            aria-label={`${member.name} 的權限`}
                            value={member.appRole}
                            onChange={(event) => runPermissionAction(roleActionKey, () => onSetMemberRole(member.id, event.target.value))}
                            disabled={Boolean(permissionAction)}
                          >
                            <option value="viewer">檢視者</option>
                            <option value="editor">編輯者</option>
                          </select>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`移除 ${member.name} 的存取權`}
                            title="移除存取權"
                            onClick={() => runPermissionAction(removeActionKey, () => onRemoveMember(member))}
                            disabled={Boolean(permissionAction)}
                          >
                            {permissionAction === removeActionKey ? <RefreshCw className="is-spinning" size={14} /> : <Trash2 size={14} />}
                          </button>
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            </section> : null}

            {sharing.role === "viewer" ? (
              <section className="collaboration-permission-section" aria-labelledby="drive-viewer-access-title">
                <div className="collaboration-permission-heading">
                  <span className="collaboration-permission-icon"><Eye size={17} /></span>
                  <div>
                    <strong id="drive-viewer-access-title">目前只能檢視</strong>
                    <small>如需編輯，請到 Google Drive 的「共用」申請權限；由檔案擁有者決定是否核准。</small>
                  </div>
                </div>
                {accessUrl ? <a className="secondary-button" href={accessUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />到 Google Drive 申請編輯權</a> : null}
              </section>
            ) : null}

            <div className="collaboration-live-status">
              <p className="cloud-collaboration-message">{sharing.message || "已讀取 Google Drive 的最新權限。"}</p>
            </div>
            <div className="cloud-collaboration-actions">
              <button className="quiet-button" type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={15} />重新整理權限</button>
              {sharing.webViewLink ? <a className="secondary-button" href={sharing.webViewLink} target="_blank" rel="noreferrer"><ExternalLink size={15} />在 Google Drive 開啟</a> : null}
            </div>
          </>
        ) : (
          <div className={`collaboration-preparation-state${preparationIsError ? " is-error" : ""}`}>
            <span className="collaboration-permission-icon" aria-hidden="true">
              {preparationIsError ? <AlertTriangle size={19} /> : busy ? <RefreshCw className="is-spinning" size={19} /> : <Cloud size={19} />}
            </span>
            <div>
              <strong>{preparationTitle}</strong>
              <small>{sharing.message || "作品、版本與分享權限都會留在你自己的 Google Drive。"}</small>
              <div className="collaboration-preparation-actions">
                {sharing.status === "authorization-required" ? <button className="primary-button" type="button" onClick={onConnectDrive} disabled={busy}><Cloud size={15} />連結 Google Drive</button> : null}
                {sharing.status === "shared-file-denied" && accessUrl ? <a className="primary-button" href={accessUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />在 Google Drive 檢查或申請權限</a> : null}
                {sharing.status === "shared-file-denied" ? <button className="secondary-button" type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={15} />重新開啟分享檔案</button> : null}
                {["needs-picker-access", "shared-file-denied"].includes(sharing.status) ? <button className={sharing.status === "shared-file-denied" ? "secondary-button" : "primary-button"} type="button" onClick={onAuthorizeIncomingDriveFile} disabled={busy}><FolderOpen size={15} />選取這份共享檔案</button> : null}
                {!busy && sharing.status !== "shared-file-denied" && accessUrl ? <a className="secondary-button" href={accessUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />在 Google Drive 檢查存取權</a> : null}
                {sharing.status === "needs-drive" ? <button className="primary-button" type="button" onClick={onSaveToDrive} disabled={busy}><CloudUpload size={15} />儲存並準備分享</button> : null}
                {sharing.status === "error" ? <button className="primary-button" type="button" onClick={onRefresh} disabled={busy}><RefreshCw size={15} />重新嘗試</button> : null}
              </div>
            </div>
          </div>
        )}
      </section>
      <div className="architecture-note">
        <strong>同一份檔案，沒有第二個分享空間</strong>
        <p>分享的是同一份 Google Drive 檔案。擁有者決定誰能檢視或編輯；需要更多權限時，請透過 Google Drive 申請。</p>
      </div>
    </Modal>
  );
}

function DriveEditPermissionModal({ sharing, onClose }) {
  const accessUrl = googleDriveFileAccessUrl(sharing);
  return <Modal title="需要編輯權限" description="你目前可以檢視這份工作檔；編輯與儲存需要檔案擁有者授權。" onClose={onClose}>
    <div className="drive-save-confirmation">
      <p>前往 Google Drive 申請編輯權限；擁有者核准後，請回到分享面板重新整理權限。</p>
      <div className="drive-save-confirmation-actions"><button className="secondary-button" type="button" onClick={onClose}>稍後</button>{accessUrl ? <a className="primary-button" href={accessUrl} target="_blank" rel="noreferrer">前往 Google Drive 申請</a> : null}</div>
    </div>
  </Modal>;
}

function StudioBrandMark() {
  return <span className="brand-mark" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}brand/infinite-ribbon.png`} alt="" /></span>;
}

// A fresh interval begins after the pointer and keyboard focus both leave.
function useToastPause(active, duration, dismiss) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!active) { setHovered(false); setFocused(false); }
  }, [active]);
  useEffect(() => {
    if (!active || hovered || focused) return undefined;
    const timer = window.setTimeout(() => dismissRef.current(), duration);
    return () => window.clearTimeout(timer);
  }, [active, duration, hovered, focused]);
  return {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); },
  };
}

function AppUpdateNotice({
  updateCheck,
  updateAction,
  autoUpdateEnabled,
  onEnableAutoUpdate,
  onUpdateNow,
  onSnooze,
}) {
  const [expanded, setExpanded] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  useEffect(() => {
    if (updateCheck.status !== "available" || !updateCheck.manifest?.version) return undefined;
    setToastVisible(true);
    return undefined;
  }, [updateCheck.status, updateCheck.manifest?.version]);
  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && updateAction.status !== "saving" && updateAction.status !== "reloading") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded, updateAction.status]);
  const toastPause = useToastPause(toastVisible && !expanded, 5000, () => setToastVisible(false));
  if (updateCheck.status !== "available" || !updateCheck.manifest) return null;
  const busy = updateAction.status === "saving" || updateAction.status === "reloading";
  const version = updateCheck.manifest.version;

  return (
    <>
    <button type="button" className="app-update-trigger" aria-expanded={expanded} aria-controls="app-update-details" onClick={() => { setToastVisible(false); setExpanded((value) => !value); }}>
      <Info size={15} aria-hidden="true" /><span aria-live="polite">有新版本可更新</span>
    </button>
    {toastVisible && !expanded ? <div className="app-update-toast" role="status" {...toastPause}>
      <Info size={17} aria-hidden="true" />
      <span>有新版本可更新</span>
      <button type="button" className="app-update-toast-details" onClick={() => { setToastVisible(false); setExpanded(true); }}>查看</button>
      <button type="button" className="app-update-toast-close" aria-label="關閉更新提示" onClick={() => setToastVisible(false)}><X size={16} /></button>
    </div> : null}
    {expanded ? <Modal title="有新版本可更新" onClose={() => setExpanded(false)} busy={busy} className="update-details-dialog"><aside id="app-update-details" className={`app-update-notice${updateAction.status === "error" ? " is-error" : ""}`} aria-labelledby="app-update-notice-title" aria-live="polite">
      <div className="app-update-notice-heading">
        <span className="app-update-notice-icon" aria-hidden="true"><Download size={19} /></span>
        <div>
          <strong id="app-update-notice-title">{`Infinite Studio v${version} 可以更新`}</strong>
          <small>{updateCheck.manifest.summary || "新的穩定版本已可使用。"}</small>
        </div>
      </div>
      <p>更新前會保存目前工作及建立復原備份；若儲存未完成或畫面繼續變更，將停止更新並保留畫面。</p>
      {updateAction.message ? (
        <div className={`app-update-action-status is-${updateAction.status}`} role="status">
          {updateAction.status === "error" ? <AlertTriangle size={15} /> : <RefreshCw size={15} className={busy ? "is-spinning" : ""} />}
          <span>{updateAction.message}</span>
        </div>
      ) : null}
      <div className="app-update-notice-actions">
        {updateCheck.manifest.notesUrl ? (
          <a className="secondary-button app-update-notes-link" href={updateCheck.manifest.notesUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />查看更新說明
          </a>
        ) : null}
        <button className="primary-button" type="button" onClick={onUpdateNow} disabled={busy}>
          <RefreshCw size={15} className={busy ? "is-spinning" : ""} />
          {busy ? "正在安全更新…" : "立即更新"}
        </button>
        <button className="secondary-button" type="button" onClick={onEnableAutoUpdate} disabled={busy || autoUpdateEnabled} aria-pressed={autoUpdateEnabled}>
          <Check size={15} />{autoUpdateEnabled ? "自動更新已開啟" : "自動更新"}
        </button>
        <button className="text-button" type="button" onClick={onSnooze} disabled={busy}>稍後更新</button>
      </div>
      <small className="app-update-auto-note">自動更新只會在下一次安全開啟時套用，不會在編輯途中突然重整。</small>
    </aside></Modal> : null}
    </>
  );
}

function SettingsModal({
  activeTheme,
  accountLinkBusy,
  accountLinkMessage,
  accountReceipt,
  accountSignedIn,
  accountUser,
  canvasBackground,
  currentDriveLink,
  driveCurrentContentBytes,
  driveSession,
  driveSettings,
  primaryStorageTarget,
  storagePreferences,
  localLibrarySummary,
  enableProviderTesting = false,
  initialSection = "general",
  locale,
  localePreference,
  mode,
  resolvedMode,
  typography,
  updateCheck,
  updateAction,
  autoUpdateEnabled,
  leftPanelVisible,
  rightPanelVisible,
  rulersVisible,
  guidesVisible,
  rulerUnit,
  onSetMode,
  onSetCanvasBackground,
  onUpdateCanvasBackground,
  onResetCanvasBackground,
  onSetLocale,
  onSetTypography,
  onResetTypography,
  onCheckForUpdates,
  onSetAutoUpdate,
  onUpdateNow,
  onSnoozeUpdate,
  onConnectDrive,
  onDisconnectDrive,
  onManageThemes,
  onMarketingPreferenceChange,
  onLinkEmail,
  onLinkFacebook,
  onLinkGoogle,
  onSignInRequest,
  onSignOut,
  onClearLocalData,
  onToggleLeftPanel,
  onToggleRightPanel,
  onResetPanelWidths,
  onToggleRulers,
  onToggleGuides,
  onSetRulerUnit,
  onOpenShortcuts,
  onOpenDriveLibrary,
  onOpenVersions,
  onDownloadBackup,
  onSetStorageTarget,
  onSetAutoSave,
  onSetShowSaveStatus,
  onSaveDrive,
  onSetDriveAutoSync,
  onClose,
}) {
  const [section, setSection] = useState(initialSection);
  const panelRef = useRef(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector('.settings-nav .is-active')?.focus());
    const closeOutside = (event) => {
      if (!panelRef.current?.contains(event.target) && !event.target.closest?.('.account-menu')) onClose();
    };
    const closeEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
      document.querySelector('.account-menu-button')?.focus();
    };
    window.addEventListener('pointerdown', closeOutside, true);
    window.addEventListener('keydown', closeEscape, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', closeOutside, true);
      window.removeEventListener('keydown', closeEscape, true);
    };
  }, [onClose]);
  const resolvedTypography = resolveInterfaceTypography(typography);
  const [customFontDraft, setCustomFontDraft] = useState(typography.customFamily || "");
  const providerStates = moodboardProviderStates(accountUser)
    .filter((provider) => provider.public || (enableProviderTesting && provider.testable));
  const canvasBackgroundPreviewStyle = canvasBackgroundCssVariables(canvasBackground);

  useEffect(() => {
    setCustomFontDraft(typography.customFamily || "");
  }, [typography.customFamily]);

  const applyCustomFont = () => {
    if (!customFontDraft.trim()) return;
    onSetTypography({ ...typography, familyMode: "custom", customFamily: customFontDraft });
  };

  const updateStatus = (() => {
    if (updateCheck.status === "checking") {
      return { icon: <RefreshCw size={18} className="is-spinning" />, title: "正在檢查更新…", detail: "正在取得穩定版資訊。" };
    }
    if (updateCheck.status === "current") {
      return { icon: <Check size={18} />, title: "目前已是最新版本", detail: `已於 ${formatTime(updateCheck.checkedAt)} 檢查穩定版 v${updateCheck.manifest.version}。` };
    }
    if (updateCheck.status === "available") {
      return { icon: <Download size={18} />, title: `有新版 v${updateCheck.manifest.version}`, detail: updateCheck.manifest.summary || "已有新的穩定版本可用。" };
    }
    if (updateCheck.status === "preview") {
      return { icon: <Sparkles size={18} />, title: "目前版本比穩定版更新", detail: `發布中的穩定版是 v${updateCheck.manifest.version}；這可能是開發中的版本。` };
    }
    if (updateCheck.status === "error") {
      return { icon: <AlertTriangle size={18} />, title: "目前無法檢查更新", detail: updateCheck.message };
    }
    return { icon: <Info size={18} />, title: "尚未檢查", detail: "檢查時需要連線；離線工作不受影響。" };
  })();

  return (
    <section ref={panelRef} id="account-settings-popover" className="modal is-wide settings-dialog settings-popover" role="dialog" aria-label="帳號與設定">
      <header><div><h2>帳號與設定</h2><p>管理帳號、儲存與介面偏好。</p></div><IconButton label="關閉" onClick={onClose}><X size={19} /></IconButton></header>
      <div className="modal-body"><div className="settings-layout">
        <nav className="settings-nav" aria-label="設定分類">
          <button className={section === "account" ? "is-active" : ""} type="button" onClick={() => setSection("account")}>
            <UserRound size={17} /><span>帳號與隱私</span>
          </button>
          <button className={section === "storage" ? "is-active" : ""} type="button" onClick={() => setSection("storage")}>
            <Cloud size={17} /><span>儲存與同步</span>
          </button>
          <button className={section === "general" ? "is-active" : ""} type="button" onClick={() => setSection("general")}>
            <Languages size={17} /><span>一般設定</span>
          </button>
          <button className={section === "appearance" ? "is-active" : ""} type="button" onClick={() => setSection("appearance")}>
            <Palette size={17} /><span>外觀</span>
          </button>
          <button className={section === "workspace" ? "is-active" : ""} type="button" onClick={() => setSection("workspace")}>
            <LayoutGrid size={17} /><span>工作區</span>
          </button>
          <button className={section === "about" ? "is-active" : ""} type="button" onClick={() => setSection("about")}>
            <Info size={17} /><span>關於</span>
          </button>
        </nav>
        <div className="settings-content">
          {section === "account" ? (
            <section className="settings-section" aria-labelledby="settings-account-title">
              <div className="settings-section-heading">
                <div><h3 id="settings-account-title">帳號與隱私</h3><p>訪客可直接使用本機功能；登入後解鎖協作、同步與進階 3D。</p></div>
              </div>
              <div className="settings-account-profile">
                {accountSignedIn ? <AccountAvatar user={accountUser} size={52} /> : <span className="account-avatar" style={{ "--account-avatar-size": "52px" }} aria-hidden="true"><UserRound size={22} /></span>}
                {accountSignedIn ? (
                  <div><strong data-l10n-ignore>{accountDisplayName(accountUser)}</strong><small data-l10n-ignore>{accountUser?.email}</small><span><Check size={13} />{accountProviderLabel(accountUser)}</span></div>
                ) : (
                  <div><strong>訪客模式</strong><small>本機編輯、儲存與匯出可直接使用</small><span className="is-guest"><HardDrive size={13} />僅保存在這台裝置</span></div>
                )}
              </div>
              <div className="settings-account-boundary">
                <ShieldCheck size={20} />
                <div><strong>Drive 授權由你另外決定</strong><p>登入、登出或切換帳號都不會刪除目前瀏覽器中的工作檔。只有另外連結 Google Drive 並啟用同步後，作品才會上傳。</p></div>
              </div>
              {accountSignedIn ? (
                <div className="settings-login-methods">
                  <div className="settings-login-methods-heading">
                    <div><strong>登入方式</strong><small>把不同登入方式連到同一個 PETFASHION UID；不會自動合併其它帳號。</small></div>
                  </div>
                  {providerStates.map((provider) => (
                    <div className="settings-login-method" key={provider.id}>
                      <span className="settings-login-method-icon" aria-hidden="true">{provider.id === "google.com" ? "G" : provider.id === "facebook.com" ? "f" : <Mail size={16} />}</span>
                      <span><strong>{provider.label}{!provider.public ? "（僅限本機測試）" : ""}</strong><small>{provider.linked ? "已連結目前帳號" : provider.id === "password" ? `寄送到 ${accountUser?.email || "目前 Email"}` : "尚未連結"}</small></span>
                      {provider.linked ? <span className="settings-login-method-status"><Check size={14} />已連結</span> : (
                        <button
                          className="quiet-button"
                          type="button"
                          disabled={accountLinkBusy}
                          onClick={provider.id === "google.com" ? onLinkGoogle : provider.id === "facebook.com" ? onLinkFacebook : onLinkEmail}
                        >
                          {accountLinkBusy ? <RefreshCw size={14} className="is-spinning" /> : null}
                          {provider.id === "password" ? "寄送連結" : "連結"}
                        </button>
                      )}
                    </div>
                  ))}
                  {accountLinkMessage ? <p className={`settings-login-method-message ${accountLinkMessage.tone === "error" ? "is-error" : ""}`} role="status">{accountLinkMessage.tone === "error" ? <AlertTriangle size={14} /> : <Check size={14} />}{accountLinkMessage.text}</p> : null}
                </div>
              ) : null}
              {accountSignedIn && accountReceipt ? (
                <div className="settings-membership-record">
                  <div className="settings-membership-summary">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Infinite Studio 已啟用</strong>
                      <small>{accountReceipt.productActivation?.accountRelationship === "created-through-product"
                        ? "加入來源：Infinite Studio"
                        : "保留原始加入來源，另記 Infinite Studio 啟用"}</small>
                      <small>{accountReceipt.authPersistence === "local" ? "此裝置會保持登入" : "關閉瀏覽工作階段後會登出"}</small>
                    </div>
                  </div>
                  <label className="settings-marketing-choice">
                    <input
                      type="checkbox"
                      checked={accountReceipt.marketing?.enabled === true}
                      onChange={(event) => onMarketingPreferenceChange(event.target.checked)}
                    />
                    <span><strong>產品 Email 偏好（尚未啟用）</strong><small>公開 Beta 只保存在此裝置，不會加入寄送名單；正式啟用前會再次確認。</small></span>
                  </label>
                  <p className="settings-development-note">目前不會寄送 Email；PETFASHION 後台同步與刪除流程完成後，才會另行啟用。</p>
                </div>
              ) : null}
              <div className="settings-account-links">
                {accountSignedIn ? <a className="secondary-button" href={PETFASHION_ACCOUNT_URL} target="_blank" rel="noreferrer">管理或刪除 PETFASHION 帳號 <ExternalLink size={15} /></a> : <button className="primary-button" type="button" onClick={onSignInRequest}><UserRound size={15} />登入解鎖進階功能</button>}
                <a className="quiet-button" href={PETFASHION_PRIVACY_URL} target="_blank" rel="noreferrer">隱私權政策 <ExternalLink size={14} /></a>
                {accountSignedIn ? <button className="quiet-button" type="button" onClick={onSignOut}><LogOut size={15} />登出</button> : null}
              </div>
              <div className="settings-danger-zone">
                <div><strong>這台裝置的工作檔資料</strong><small>永久清除目前自動儲存與所有本機版本；已下載的檔案不受影響。</small></div>
                <button className="danger-button" type="button" onClick={onClearLocalData}><Trash2 size={15} />清除本機資料</button>
              </div>
            </section>
          ) : section === "storage" ? (
            <section className="settings-section" aria-labelledby="settings-storage-title">
              <div className="settings-section-heading">
                <div><h3 id="settings-storage-title">儲存與同步</h3><p>每份工作檔只有一個主要儲存位置；本機安全副本不會變成第二份競爭的主檔。</p></div>
              </div>
              <div className="settings-subsection-heading">
                <Save size={17} />
                <div><strong>目前工作檔的主要儲存位置</strong><small>改用本機會另開獨立副本；原雲端檔案與分享連結保留。下載備份不會切換位置。</small></div>
              </div>
              <div className="settings-storage-targets" role="radiogroup" aria-label="主要儲存位置">
                <button className={primaryStorageTarget === "local" ? "is-active" : ""} type="button" role="radio" aria-checked={primaryStorageTarget === "local"} onClick={() => onSetStorageTarget("local")}>
                  <HardDrive size={18} /><span><strong>這台裝置</strong><small>可離線、不需要登入</small></span>{primaryStorageTarget === "local" ? <Check size={16} /> : null}
                </button>
                <button className={primaryStorageTarget === "drive" ? "is-active" : ""} type="button" role="radio" aria-checked={primaryStorageTarget === "drive"} onClick={() => onSetStorageTarget("drive")}>
                  <Cloud size={18} /><span><strong>Google Drive</strong><small>跨裝置使用，仍保留本機安全副本</small></span>{primaryStorageTarget === "drive" ? <Check size={16} /> : null}
                </button>
              </div>
              <button className="settings-toggle-row" type="button" aria-pressed={storagePreferences.autoSave} onClick={() => onSetAutoSave(!storagePreferences.autoSave)}>
                <span><Save size={18} /><span><strong>自動儲存</strong><small>本機模式會先請你選擇 .studio 檔案；瀏覽器復原副本始終保留。</small></span></span>
                <b>{storagePreferences.autoSave ? "啟用" : "停用"}</b>
              </button>
              <button className="settings-toggle-row" type="button" aria-pressed={storagePreferences.showSaveStatus} onClick={() => onSetShowSaveStatus(!storagePreferences.showSaveStatus)}>
                <span><Check size={18} /><span><strong>顯示儲存完成狀態</strong><small>在檔名下方安靜顯示位置與完成時間，不會中斷編輯。</small></span></span>
                <b>{storagePreferences.showSaveStatus ? "啟用" : "停用"}</b>
              </button>
              <div className="settings-drive-quota">
                <HardDrive size={18} />
                <div>
                  <strong>本機安全暫存</strong>
                  <small><span>本機工作檔</span>{`: ${localLibrarySummary.boardCount} · `}<span>等待同步</span>{`: ${localLibrarySummary.pendingSyncCount}`}{localLibrarySummary.storage.persisted === false ? <><span aria-hidden="true"> · </span><span>瀏覽器可能自動清理</span></> : null}</small>
                </div>
                <span>{localLibrarySummary.storage.usage !== null ? formatStorageSize(localLibrarySummary.storage.usage) : formatStorageSize(localLibrarySummary.estimatedBoardBytes)}</span>
              </div>
              <p className="drive-inline-message">{localLibrarySummary.storage.quota !== null ? `瀏覽器估計上限：${formatStorageSize(localLibrarySummary.storage.quota)}；實際可用空間由瀏覽器決定。` : "瀏覽器未提供空間上限；實際可用空間由瀏覽器決定。"}</p>
              <button className="secondary-button" type="button" onClick={onOpenVersions}><History size={15} />檢視與整理本機版本</button>
              {(() => {
                const status = driveStatusPresentation(driveSession);
                const StatusIcon = status.icon;
                return (
                  <div className={`settings-drive-status is-${status.tone}`}>
                    <span aria-hidden="true"><StatusIcon size={20} className={["connecting", "syncing", "checking"].includes(driveSession.status) ? "is-spinning" : ""} /></span>
                    <div><strong>{status.label}</strong><small>{driveSession.message || (driveSession.user?.emailAddress ? `目前 Drive 帳號：${driveSession.user.emailAddress}` : "PETFASHION 身分與 Drive 權限彼此獨立，但會在同一個連結流程完成。")}</small></div>
                  </div>
                );
              })()}
              <div className="settings-account-boundary settings-drive-boundary">
                <ShieldCheck size={20} />
                <div><strong>只要求 drive.file 最小權限</strong><p>Infinite Studio 只能存取本服務建立的檔案；不會掃描整個 Google Drive，也不會保存 Google 存取權杖。</p></div>
              </div>
              {driveSession.connected ? (
                <>
                  <button className="settings-toggle-row" type="button" aria-pressed={driveSettings.autoSync} onClick={() => onSetDriveAutoSync(!driveSettings.autoSync)}>
                    <span><CloudUpload size={18} /><span><strong>自動更新至雲端</strong><small>編輯先寫入本機，停止操作後再同步到 Drive。</small></span></span>
                    <b>{driveSettings.autoSync ? "啟用" : "停用"}</b>
                  </button>
                  <div className="settings-drive-quota">
                    <HardDrive size={18} />
                    <div><strong>Drive 可用空間</strong><small>{driveSession.quota?.limit === null ? "此帳號未提供固定個人上限，儲存時仍會確認結果。" : driveSession.quota ? `${formatStorageSize(driveSession.quota.remaining)} 可用，共 ${formatStorageSize(driveSession.quota.limit)}` : "重新整理後顯示容量資訊。"}</small></div>
                    <span>{formatStorageSize(driveCurrentContentBytes)}</span>
                  </div>
                  <div className="settings-account-links settings-drive-actions">
                    <button className="primary-button" type="button" onClick={onSaveDrive} disabled={["syncing", "checking"].includes(driveSession.status)}><CloudUpload size={16} />更新至雲端</button>
                    <button className="quiet-button" type="button" onClick={onDisconnectDrive} title="只中斷目前分頁，不影響 PETFASHION 登入"><CloudOff size={15} />中斷此分頁</button>
                  </div>
                </>
              ) : (
                <div className="settings-drive-connect">
                  <div><Cloud size={22} /><span><strong>連結後才會開始雲端保存</strong><small>目前畫布仍持續自動儲存在這台裝置。</small></span></div>
                  <button className="primary-button" type="button" onClick={onConnectDrive} disabled={driveSession.status === "connecting"}><Cloud size={16} />連結 Google Drive</button>
                </div>
              )}
              <div className="settings-account-links settings-storage-file-actions">
                <button className="secondary-button" type="button" onClick={onOpenDriveLibrary}><FolderOpen size={15} />我的工作檔</button>
                <button className="quiet-button" type="button" onClick={onDownloadBackup}><Download size={15} />下載 `.studio` 備份</button>
              </div>
              <p className="settings-update-note">若離線、容量不足或授權失效，編輯不會中斷；畫布會標示等待同步，並可隨時下載 `.studio` 備份。</p>
            </section>
          ) : section === "general" ? (
            <section className="settings-section" aria-labelledby="settings-general-title">
              <div className="settings-section-heading">
                <div><h3 id="settings-general-title">一般設定</h3><p>選擇操作介面使用的語言；不會翻譯工作檔內的文字內容。</p></div>
              </div>
              <div className="settings-subsection-heading">
                <Languages size={17} />
                <div><strong>介面語言</strong><small>自動依裝置時區判斷語言，也可自行選擇；設定保存在這台裝置。</small></div>
              </div>
              <div className="settings-language-options" role="radiogroup" aria-label="介面語言">
                <button type="button" role="radio" aria-checked={localePreference === "auto"} className={localePreference === "auto" ? "is-active" : ""} onClick={() => onSetLocale("auto")}>
                  <span>自動（依裝置時區）</span>{localePreference === "auto" ? <Check size={16} aria-hidden="true" /> : null}
                </button>
                {INTERFACE_LOCALES.map((option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={localePreference === option.id}
                    className={localePreference === option.id ? "is-active" : ""}
                    onClick={() => onSetLocale(option.id)}
                    data-l10n-ignore
                    key={option.id}
                  >
                    <span lang={option.id}>{option.label}</span>
                    {localePreference === option.id ? <Check size={16} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : section === "appearance" ? (
            <section className="settings-section" aria-labelledby="settings-appearance-title">
              <div className="settings-section-heading">
                <div><h3 id="settings-appearance-title">外觀</h3><p>快速調整明暗配色與介面文字；偏好只保存在這台裝置。</p></div>
              </div>
              <div className="settings-row settings-mode-row">
                <div>
                  <strong>介面模式</strong>
                  <small>{mode === "system" ? `目前跟隨裝置：${resolvedMode === "dark" ? "深色" : "淺色"}` : "自動會即時跟隨裝置；也會記住淺色與深色最近使用的配色。"}</small>
                </div>
                <div className="settings-segmented settings-mode-options" role="radiogroup" aria-label="介面明暗模式">
                  <button type="button" role="radio" className={mode === "system" ? "is-active" : ""} aria-checked={mode === "system"} onClick={() => onSetMode("system")}><Monitor size={16} />自動跟隨裝置</button>
                  <button type="button" role="radio" className={mode === "light" ? "is-active" : ""} aria-checked={mode === "light"} onClick={() => onSetMode("light")}><Sun size={16} />淺色</button>
                  <button type="button" role="radio" className={mode === "dark" ? "is-active" : ""} aria-checked={mode === "dark"} onClick={() => onSetMode("dark")}><Moon size={16} />深色</button>
                </div>
              </div>
              <div className="settings-row settings-theme-row">
                <div className="settings-current-theme">
                  <span className="theme-swatches" aria-hidden="true">
                    <i style={{ background: activeTheme.colors.background }} />
                    <i style={{ background: activeTheme.colors.panel }} />
                    <i style={{ background: activeTheme.colors.canvas }} />
                    <i style={{ background: activeTheme.colors.accent }} />
                  </span>
                  <span><strong>目前配色</strong><small data-l10n-ignore={activeTheme.builtin ? undefined : true}>{activeTheme.name}</small></span>
                </div>
                <button className="secondary-button" type="button" onClick={onManageThemes}><Palette size={16} />管理介面配色</button>
              </div>
              <div className="settings-subsection-heading">
                <Type size={17} />
                <div><strong>介面文字</strong><small>只調整操作介面，不會改變工作檔裡的文字物件。</small></div>
              </div>
              <div className="settings-row settings-type-size-row">
                <div><strong>字體大小</strong><small>選擇預設，或用滑桿精細調整。</small></div>
                <div className="settings-segmented settings-type-presets" aria-label="介面字體大小">
                  {UI_FONT_SIZE_PRESETS.map((preset) => (
                    <button
                      type="button"
                      className={typography.sizeMode === preset.id ? "is-active" : ""}
                      aria-pressed={typography.sizeMode === preset.id}
                      onClick={() => onSetTypography({ ...typography, sizeMode: preset.id })}
                      key={preset.id}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="settings-custom-size">
                <span><strong>自訂大小</strong><small>{`目前 ${resolvedTypography.offset > 0 ? "+" : ""}${resolvedTypography.offset}px`}</small></span>
                <input
                  type="range"
                  min="-1"
                  max="4"
                  step="0.5"
                  value={resolvedTypography.offset}
                  onChange={(event) => onSetTypography({ ...typography, sizeMode: "custom", customOffset: Number(event.target.value) })}
                />
              </label>
              <div className="settings-font-family">
                <div><strong>字體樣式</strong><small>快速選擇會立即套用；自訂名稱需主機已安裝，找不到時會使用後備字體。</small></div>
                <div className="settings-font-options" role="group" aria-label="介面字體樣式">
                  {UI_FONT_FAMILY_PRESETS.map((preset) => (
                    <button
                      type="button"
                      className={typography.familyMode === preset.id ? "is-active" : ""}
                      aria-pressed={typography.familyMode === preset.id}
                      onClick={() => onSetTypography({ ...typography, familyMode: preset.id })}
                      style={{ fontFamily: preset.family }}
                      key={preset.id}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-custom-font">
                <label>
                  <span>自訂字體名稱</span>
                  <input
                    value={customFontDraft}
                    onChange={(event) => setCustomFontDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyCustomFont();
                      }
                    }}
                    placeholder="例如：Avenir Next, Noto Sans TC"
                  />
                </label>
                <button className="secondary-button" type="button" disabled={!customFontDraft.trim()} onClick={applyCustomFont}>套用自訂字體</button>
              </div>
              <div className="settings-type-preview" style={{ fontFamily: resolvedTypography.family }}>
                <span>Aa</span><strong>Infinite Studio 無限靈感 123</strong>
                <button className="quiet-button" type="button" onClick={onResetTypography}><RotateCcw size={15} />恢復預設</button>
              </div>
            </section>
          ) : section === "workspace" ? (
            <section className="settings-section" aria-labelledby="settings-workspace-title">
              <div className="settings-section-heading">
                <div><h3 id="settings-workspace-title">工作區</h3><p>調整畫布輔助背景，以及桌面工作區預設顯示的面板。</p></div>
              </div>
              <div className="settings-row"><div><strong>側欄寬度</strong><small>可拖曳側欄圓點把手調整；雙擊把手可恢復單側寬度。</small></div><button className="secondary-button" type="button" onClick={onResetPanelWidths}>恢復預設寬度</button></div>
              <div className="settings-subsection-heading settings-canvas-heading">
                <LayoutGrid size={17} />
                <div><strong>畫布背景</strong><small>只影響這台裝置的工作區，不會寫入工作檔或輸出成品。</small></div>
              </div>
              <div className="settings-canvas-background-options" role="radiogroup" aria-label="畫布背景樣式">
                {[
                  { id: "dots", label: "格點", detail: "跟隨尺規的定位點" },
                  { id: "lines", label: "格線", detail: "跟隨尺規的尺寸格線" },
                  { id: "hidden", label: "隱藏", detail: "純色畫布" },
                ].map((option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={canvasBackground.mode === option.id}
                    className={canvasBackground.mode === option.id ? "is-active" : ""}
                    onClick={() => onSetCanvasBackground(option.id)}
                    key={option.id}
                  >
                    <span className={`canvas-background-preview is-${option.id}`} style={canvasBackgroundPreviewStyle} aria-hidden="true" />
                    <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                    {canvasBackground.mode === option.id ? <Check size={15} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
              <div className="settings-canvas-appearance" aria-label="格點與格線外觀">
                <div className="settings-canvas-appearance-row">
                  <span className="canvas-background-preview is-dots" style={canvasBackgroundPreviewStyle} aria-hidden="true" />
                  <span><strong>格點</strong><small>調整工作區格點的色彩與不透明度。</small></span>
                  <input
                    type="color"
                    value={canvasBackground.dotsColor}
                    onChange={(event) => onUpdateCanvasBackground({ dotsColor: event.target.value })}
                    aria-label="格點色彩"
                  />
                  <span className="settings-canvas-opacity-control">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={canvasBackground.dotsOpacity}
                      onChange={(event) => onUpdateCanvasBackground({ dotsOpacity: Number(event.target.value) })}
                      aria-label="格點不透明度"
                    />
                    <output>{`${Math.round(canvasBackground.dotsOpacity * 100)}%`}</output>
                  </span>
                </div>
                <div className="settings-canvas-appearance-row">
                  <span className="canvas-background-preview is-lines" style={canvasBackgroundPreviewStyle} aria-hidden="true" />
                  <span><strong>格線</strong><small>調整工作區格線的色彩與不透明度。</small></span>
                  <input
                    type="color"
                    value={canvasBackground.linesColor}
                    onChange={(event) => onUpdateCanvasBackground({ linesColor: event.target.value })}
                    aria-label="格線色彩"
                  />
                  <span className="settings-canvas-opacity-control">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={canvasBackground.linesOpacity}
                      onChange={(event) => onUpdateCanvasBackground({ linesOpacity: Number(event.target.value) })}
                      aria-label="格線不透明度"
                    />
                    <output>{`${Math.round(canvasBackground.linesOpacity * 100)}%`}</output>
                  </span>
                </div>
                <button className="quiet-button settings-canvas-reset" type="button" onClick={onResetCanvasBackground}>
                  <RotateCcw size={15} />恢復格點與格線預設
                </button>
              </div>
              <p className="settings-shortcut-note">格點與格線會跟隨目前的尺規單位、原點與縮放比例。</p>
              <p className="settings-shortcut-note">Shift + ' ：隱藏或顯示，重新顯示會回到上次的格點或格線。</p>
              <div className="settings-subsection-heading">
                <Ruler size={17} />
                <div><strong>尺規與輔助導引線</strong><small>尺規是本機偏好；導引線位置會寫入 .studio，但不會輸出到成品。</small></div>
              </div>
              <div className="settings-ruler-controls">
                <button className="settings-toggle-row" type="button" aria-pressed={rulersVisible} onClick={onToggleRulers}>
                  <span><Ruler size={18} /><span><strong>顯示尺規</strong><small>Shift + R</small></span></span>
                  <b>{rulersVisible ? "顯示" : "隱藏"}</b>
                </button>
                <button className="settings-toggle-row" type="button" aria-pressed={guidesVisible} onClick={onToggleGuides}>
                  <span><LayoutGrid size={18} /><span><strong>顯示輔助導引線</strong><small>Shift + ;</small></span></span>
                  <b>{guidesVisible ? "顯示" : "隱藏"}</b>
                </button>
              </div>
              <div className="settings-row settings-ruler-unit-row">
                <div><strong>尺規單位</strong><small>也可在尺規上按右鍵切換。</small></div>
                <div className="settings-segmented" role="radiogroup" aria-label="尺規單位">
                  {Object.entries(RULER_UNITS).map(([id, option]) => (
                    <button key={id} type="button" role="radio" aria-checked={rulerUnit === id} className={rulerUnit === id ? "is-active" : ""} onClick={() => onSetRulerUnit(id)}>{option.label}</button>
                  ))}
                </div>
              </div>
              <button className="settings-toggle-row" type="button" aria-pressed={leftPanelVisible} onClick={onToggleLeftPanel}>
                <span><PanelLeft size={18} /><span><strong>左側工作面板</strong><small>圖層、分群、素材與構圖</small></span></span>
                <b>{leftPanelVisible ? "顯示" : "隱藏"}</b>
              </button>
              <button className="settings-toggle-row" type="button" aria-pressed={rightPanelVisible} onClick={onToggleRightPanel}>
                <span><SlidersHorizontal size={18} /><span><strong>右側屬性面板</strong><small>選取物件的內容與變形設定</small></span></span>
                <b>{rightPanelVisible ? "顯示" : "隱藏"}</b>
              </button>
              <button className="settings-toggle-row" type="button" onClick={onOpenShortcuts}>
                <span><Keyboard size={18} /><span><strong>快速鍵清單</strong><small>開啟可搜尋的指令參考，也可直接按 ?。</small></span></span>
                <b>查看</b>
              </button>
            </section>
          ) : (
            <section className="settings-section" aria-labelledby="settings-about-title">
              <div className="settings-section-heading">
                <div><h3 id="settings-about-title">關於 Infinite Studio</h3><p>查看目前安裝版本，並向穩定版資訊來源檢查更新。</p></div>
              </div>
              <div className="settings-version-row">
                <div className="settings-version-identity">
                  <span aria-hidden="true">∞</span>
                  <div><strong>{APP_VERSION_LABEL}</strong><small>發布日期 {APP_RELEASE_DATE} · 穩定版頻道</small></div>
                </div>
                <button className="primary-button" type="button" disabled={updateCheck.status === "checking"} onClick={onCheckForUpdates}>
                  <RefreshCw size={16} className={updateCheck.status === "checking" ? "is-spinning" : ""} />
                  {updateCheck.status === "checking" ? "檢查中…" : updateCheck.status === "idle" ? "檢查更新" : "重新檢查"}
                </button>
              </div>
              <div className={`settings-update-status is-${updateCheck.status}`} role="status" aria-live="polite">
                <span aria-hidden="true">{updateStatus.icon}</span>
                <div><strong>{updateStatus.title}</strong><small>{updateStatus.detail}</small></div>
              </div>
              <button className="settings-toggle-row" type="button" aria-pressed={autoUpdateEnabled} onClick={() => onSetAutoUpdate(!autoUpdateEnabled)}>
                <span><RefreshCw size={18} /><span><strong>安全自動更新</strong><small>只在下一次安全開啟時套用；編輯途中不會突然重新載入。</small></span></span>
                <b>{autoUpdateEnabled ? "已開啟" : "關閉"}</b>
              </button>
              <div className="settings-update-actions" role="group" aria-label="版本資訊與更新方式">
                <a className="secondary-button" href={updateCheck.manifest?.notesUrl || APP_RELEASE_NOTES_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} />查看更新說明</a>
                {updateCheck.status === "available" ? (
                  <>
                  <button className="primary-button" type="button" onClick={onUpdateNow} disabled={updateAction.status === "saving" || updateAction.status === "reloading"}>
                    <RefreshCw size={16} className={updateAction.status === "saving" || updateAction.status === "reloading" ? "is-spinning" : ""} />
                    {updateAction.status === "saving" || updateAction.status === "reloading" ? "正在安全更新…" : "立即更新"}
                  </button>
                  <button className="quiet-button" type="button" onClick={onSnoozeUpdate} disabled={updateAction.status === "saving" || updateAction.status === "reloading"}>稍後更新</button>
                  </>
                ) : null}
              </div>
              {updateAction.message ? <p className={`settings-update-action-message is-${updateAction.status}`} role="status">{updateAction.message}</p> : null}
              <p className="settings-update-note">版本檢查不會上傳工作檔、素材或使用紀錄；若目前離線，可以繼續編輯並稍後重試。</p>
            </section>
          )}
        </div>
      </div></div>
    </section>
  );
}

function InterfaceThemeModal({
  themes,
  activeTheme,
  previewTheme,
  locale,
  onPreview,
  onConfirm,
  onSave,
  onDelete,
  onImport,
  onExport,
  onClose,
}) {
  const displayedTheme = previewTheme || activeTheme;
  const search = useListSearch("themes");
  const editableTheme = useCallback((theme) => {
    const next = normalizeInterfaceTheme({ ...theme, builtin: false });
    return { ...next, name: theme.builtin ? translateInterfaceText(theme.name, locale) : theme.name };
  }, [locale]);
  const [draft, setDraft] = useState(() => editableTheme(activeTheme));
  const sameColors = (first, second) => THEME_COLOR_FIELDS.every(([key]) => first.colors[key].toUpperCase() === second.colors[key].toUpperCase());
  const matchingTheme = themes.find((theme) => sameColors(theme, displayedTheme));
  const listedThemes = themes.filter((theme) => matchesListQuery([
    theme.name,
    theme.category,
    interfaceThemeMode(theme) === "light" ? "淺色" : "深色",
  ], search.query));
  const themeGroups = [
    ["product", "Infinite 與專案"],
    ["brand", "品牌識別靈感"],
    ["mood", "氣氛主題"],
    ["custom", "我的配色"],
  ].map(([id, label]) => ({ id, label, themes: listedThemes.filter((theme) => (theme.category || (theme.builtin ? "mood" : "custom")) === id) }))
    .filter((group) => group.themes.length);

  useEffect(() => {
    setDraft(editableTheme(activeTheme));
  }, [activeTheme, editableTheme]);

  const previewPreset = (theme) => {
    setDraft(editableTheme(theme));
    onPreview(theme);
  };

  const updateDraftColor = (key, value) => {
    setDraft((current) => {
      const next = normalizeInterfaceTheme({
        ...current,
        builtin: false,
        colors: { ...current.colors, [key]: value },
      });
      onPreview(next);
      return next;
    });
  };

  const resetDraft = () => {
    const next = editableTheme(activeTheme);
    setDraft(next);
    onPreview(null);
  };

  return (
    <Modal
      title="介面配色"
      description="點選會先在整個介面預覽；只有按下套用才會儲存。配色屬於這台裝置，不會改變工作檔內容。"
      onClose={onClose}
      wide
    >
      <div className="theme-confirm-bar" aria-live="polite">
        <span><small>正在檢視</small><strong data-l10n-ignore={displayedTheme.builtin ? undefined : true}>{displayedTheme.name}</strong></span>
        <span className="theme-confirm-actions">
          <button className="quiet-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="button" disabled={!matchingTheme || matchingTheme.id === activeTheme.id} onClick={() => onConfirm(matchingTheme?.id)}><Check size={16} />套用配色</button>
        </span>
      </div>
      <div className="modal-list-toolbar"><strong>可用介面配色</strong><ListSearchToggle search={search} resultCount={listedThemes.length} totalCount={themes.length} label="搜尋介面配色" /></div>
      <ListSearchField search={search} placeholder="搜尋配色名稱或類型" />
      <section className="theme-library" aria-label="可用介面配色">
        {themeGroups.map((group) => (
          <div className="theme-group" key={group.id}>
            <div className="theme-group-heading">
              <strong>{group.label}</strong>
              {group.id === "brand" ? <small>色彩靈感 · 非官方主題</small> : null}
            </div>
            <div className="theme-group-grid">
              {group.themes.map((theme) => {
                const isPreview = matchingTheme?.id === theme.id;
                const isActive = activeTheme.id === theme.id;
                return (
                  <article className={`theme-option ${isPreview ? "is-preview" : ""} ${isActive ? "is-active" : ""}`} key={theme.id}>
                    <button
                      className="theme-option-select"
                      type="button"
                      aria-pressed={isPreview}
                      onClick={() => previewPreset(theme)}
                    >
                      <span className="theme-swatches" aria-hidden="true">
                        <i style={{ background: theme.colors.background }} />
                        <i style={{ background: theme.colors.panel }} />
                        <i style={{ background: theme.colors.canvas }} />
                        <i style={{ background: theme.colors.accent }} />
                      </span>
                      <span><strong data-l10n-ignore={theme.builtin ? undefined : true}>{theme.name}</strong><small>{isActive ? "目前使用" : theme.builtin ? interfaceThemeMode(theme) === "light" ? "淺色" : "深色" : "我的配色"}</small></span>
                      {isPreview ? <Check size={16} aria-hidden="true" /> : null}
                    </button>
                    {!theme.builtin ? (
                      <IconButton label={`刪除配色「${theme.name}」`} onClick={() => onDelete(theme.id)}><Trash2 size={15} /></IconButton>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
        {!themeGroups.length ? (
          <div className="modal-empty"><Search size={24} /><strong>找不到符合的配色</strong><p>搜尋條件會保留，可以調整或清除。</p><button className="text-button" type="button" onClick={() => search.setQuery("")}>清除搜尋</button></div>
        ) : null}
      </section>

      <section className="theme-editor" aria-labelledby="theme-editor-title">
        <div className="theme-editor-heading">
          <div><strong id="theme-editor-title">建立自己的配色</strong><small>調整時會即時預覽；「儲存並套用」會新增一組，不覆蓋原配色。</small></div>
          <button className="quiet-button" type="button" onClick={resetDraft}>回到目前配色</button>
        </div>
        <label className="theme-name-field">
          <span>配色名稱</span>
          <input value={draft.name} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <div className="theme-color-grid">
          {THEME_COLOR_FIELDS.map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <span className="theme-color-input">
                <input type="color" value={draft.colors[key]} aria-label={`${label}色彩`} onChange={(event) => updateDraftColor(key, event.target.value)} />
                <output>{draft.colors[key]}</output>
              </span>
            </label>
          ))}
        </div>
        <div className="theme-actions">
          <button className="secondary-button" type="button" onClick={onImport}><FileUp size={16} /> 匯入配色</button>
          <button className="secondary-button" type="button" onClick={() => onExport(displayedTheme)}><Download size={16} /> 匯出預覽配色</button>
          <button className="primary-button" type="button" disabled={!draft.name.trim()} onClick={() => onSave(draft)}><Save size={16} /> 儲存並套用</button>
        </div>
      </section>
    </Modal>
  );
}

function ExportDownloadModal({ downloads, canPickDirectory, isExporting, onExportDirectory, onClose }) {
  const search = useListSearch("downloads");
  const listedDownloads = downloads.filter((item) => matchesListQuery([item.filename], search.query));
  return (
    <Modal
      title="匯出檔案已準備"
      description={canPickDirectory
        ? "可直接選擇資料夾批次匯出，也可以逐一下載。圖片、文字與形狀會保留尺寸與旋轉，影片則匯出原檔。"
        : "這個內嵌瀏覽器請逐一下載；在桌面 Chrome 開啟同一網址即可直接選擇匯出資料夾。"}
      onClose={onClose}
    >
      {canPickDirectory ? (
        <button className="primary-button export-folder-button" type="button" onClick={onExportDirectory} disabled={isExporting}>
          <FolderOpen size={17} /> {isExporting ? "匯出中…" : `選擇資料夾並匯出 ${downloads.length} 個檔案`}
        </button>
      ) : null}
      <div className="modal-list-toolbar"><strong>已準備檔案</strong><ListSearchToggle search={search} resultCount={listedDownloads.length} totalCount={downloads.length} label="搜尋已準備檔案" /></div>
      <ListSearchField search={search} placeholder="搜尋檔名" />
      <div className="export-download-list">
        {listedDownloads.map((item) => (
          <a className="export-download-link" href={item.url} download={item.filename} key={item.url}>
            <span><ImageIcon size={18} /><strong>{item.filename}</strong></span>
            <span><Download size={16} /> 下載檔案</span>
          </a>
        ))}
      </div>
      {!listedDownloads.length ? <div className="modal-empty compact"><Search size={22} /><strong>找不到符合的檔案</strong><button className="text-button" type="button" onClick={() => search.setQuery("")}>清除搜尋</button></div> : null}
      <p className="export-download-note">圖片、文字與形狀會輸出為自含 SVG；影片保留原始檔案格式。下載後皆可離線開啟。</p>
    </Modal>
  );
}

function StartupSequence({ onComplete }) {
  const skipButtonRef = useRef(null);

  useEffect(() => {
    skipButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      className="startup-sequence"
      role="dialog"
      aria-modal="true"
      aria-labelledby="startup-title"
      aria-describedby="startup-status"
      onKeyDown={(event) => {
        if (event.key === "Tab") event.preventDefault();
      }}
    >
      <div className="startup-grid" aria-hidden="true" />
      <div className="startup-scan" aria-hidden="true" />
      <div className="startup-frame startup-frame-top" aria-hidden="true" />
      <div className="startup-frame startup-frame-right" aria-hidden="true" />
      <div className="startup-frame startup-frame-bottom" aria-hidden="true" />
      <div className="startup-frame startup-frame-left" aria-hidden="true" />
      <div className="startup-rail startup-rail-top" aria-hidden="true" />
      <div className="startup-rail startup-rail-right" aria-hidden="true" />
      <div className="startup-rail startup-rail-bottom" aria-hidden="true" />
      <div className="startup-rail startup-rail-left" aria-hidden="true" />

      <div className="startup-telemetry startup-telemetry-top" aria-hidden="true">
        <span>LOCAL CORE / READY</span><i /> <span>CANVAS / ∞</span>
      </div>
      <div className="startup-telemetry startup-telemetry-bottom" aria-hidden="true">
        <span>OBJECT GRAPH / LINKED</span><i /> <span>OFFLINE / SECURE</span>
      </div>

      <div className="startup-core">
        <span className="startup-eyebrow">PETFASHION CREATIVE SYSTEM</span>
        <span className="startup-emblem" aria-hidden="true">∞</span>
        <h1 id="startup-title"><span>Infinite</span><span>Studio</span></h1>
        <div className="startup-progress" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
        </div>
        <p id="startup-status"><span>WORKSPACE</span><b>ASSEMBLING</b></p>
      </div>

      <button ref={skipButtonRef} className="startup-skip" type="button" onClick={onComplete}>
        略過開場 <ChevronRight size={16} />
      </button>
    </section>
  );
}

function useInterfaceLocale() {
  const [preference, setPreference] = useState(loadInterfaceLocalePreference);
  const [automaticLocale, setAutomaticLocale] = useState(detectInterfaceLocale);
  useEffect(() => {
    const update = () => setAutomaticLocale(detectInterfaceLocale());
    window.addEventListener("languagechange", update);
    window.addEventListener("focus", update);
    return () => { window.removeEventListener("languagechange", update); window.removeEventListener("focus", update); };
  }, []);
  const chooseLocale = useCallback((next) => {
    const value = next === "auto" ? "auto" : normalizeInterfaceLocale(next);
    if (value === "auto") setAutomaticLocale(detectInterfaceLocale());
    setPreference(value);
    try { localStorage.setItem(INTERFACE_LOCALE_STORAGE_KEY, value); } catch { /* Preference remains active for this session. */ }
  }, []);
  return { locale: preference === "auto" ? automaticLocale : preference, preference, chooseLocale };
}

function App({ initialProtectedShare = null }) {
  const { locale: interfaceLocale, preference: interfaceLocalePreference, chooseLocale } = useInterfaceLocale();
  setActiveInterfaceLocale(interfaceLocale);
  const authPreviewUserRef = useRef(moodboardAuthPreviewUser());
  const initialDriveSettingsRef = useRef(loadDriveState());
  const initialStoragePreferencesRef = useRef(loadStoragePreferences());
  const initialBoardRef = useRef(createBoard({ name: localizedDefaultBoardName(interfaceLocale) }));
  const [board, setBoard] = useState(initialBoardRef.current);
  const boardRef = useRef(initialBoardRef.current);
  const [view, setView] = useState(initialBoardRef.current.view);
  const viewRef = useRef(initialBoardRef.current.view);
  const [hydrated, setHydrated] = useState(false);
  const [isBooting, setIsBooting] = useState(() => (
    typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedIdsRef = useRef([]);
  const [selectedGuideIds, setSelectedGuideIds] = useState([]);
  const selectedGuideIdsRef = useRef([]);
  const [keyObjectId, setKeyObjectId] = useState(null);
  const [selectionAnchor, setSelectionAnchor] = useState("mc");
  const [groupGesture, setGroupGesture] = useState(null);
  const [rotationGesture, setRotationGesture] = useState(false);
  const [resizeGesture, setResizeGesture] = useState(null);
  const [textFrameGesture, setTextFrameGesture] = useState(null);
  const [micro3DGesture, setMicro3DGesture] = useState(null);
  const [smartAlignmentGuides, setSmartAlignmentGuides] = useState([]);
  const [editingText, setEditingText] = useState(null);
  const [loadedTextFlow, setLoadedTextFlow] = useState(null);
  const [localFontOptions, setLocalFontOptions] = useState([]);
  const [localFontState, setLocalFontState] = useState(() => typeof window.queryLocalFonts === "function"
    ? { status: "idle", message: "需點擊後允許瀏覽器權限；字體檔不會存入工作檔。" }
    : { status: "unsupported", message: "此瀏覽器不支援讀取本機字體，仍可使用內建字體。" });
  const [tool, setTool] = useState("select");
  const [spaceDown, setSpaceDown] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const [modifierDown, setModifierDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [marquee, setMarquee] = useState(null);
  const [zoomWindowRect, setZoomWindowRect] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [leftTab, setLeftTab] = useState("layers");
  const [activeSourceId, setActiveSourceId] = useState(null);
  const [selectedCaptureId, setSelectedCaptureId] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [layerTypeFilter, setLayerTypeFilter] = useState("all");
  const [markerDraft, setMarkerDraft] = useState({ symbol: "heart", color: "white" });
  const [batchPrefix, setBatchPrefix] = useState("");
  const [exportScope, setExportScope] = useState("selected");
  const [isExporting, setIsExporting] = useState(false);
  const [compositionFormat, setCompositionFormat] = useState("png");
  const [compositionScale, setCompositionScale] = useState(1);
  const [isRenderingComposition, setIsRenderingComposition] = useState(false);
  const [preparedDownloads, setPreparedDownloads] = useState([]);
  const [saveState, setSaveState] = useState("載入中");
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const [pendingObjectDeletion, setPendingObjectDeletion] = useState(null);
  const [escapeCancellationRequest, setEscapeCancellationRequest] = useState(null);
  const [showGridBuilder, setShowGridBuilder] = useState(false);
  const [showAnnotationBuilder, setShowAnnotationBuilder] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showCollaboration, setShowCollaboration] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [agentAddress, setAgentAddress] = useState("");
  const [agentStatus, setAgentStatus] = useState("disconnected");
  const [agentError, setAgentError] = useState("");
  const [agentAutoEdit, setAgentAutoEdit] = useState(true);
  const [agentRequest, setAgentRequest] = useState(null);
  const agentSocketRef = useRef(null);
  const agentPendingRef = useRef(null);
  const agentBlockingRef = useRef(false);
  const [showEditPermissionRequest, setShowEditPermissionRequest] = useState(false);
  const [showDriveLibrary, setShowDriveLibrary] = useState(false);
  const [driveSaveConfirmation, setDriveSaveConfirmation] = useState(null);
  const [pendingTabUpdate, setPendingTabUpdate] = useState(null);
  const [driveIncomingVersion, setDriveIncomingVersion] = useState(null);
  const [driveLoadRecovery, setDriveLoadRecovery] = useState(null);
  const [localSwitchConfirmation, setLocalSwitchConfirmation] = useState(false);
  const [showStorageLocation, setShowStorageLocation] = useState(false);
  const [driveOnboardingIntent, setDriveOnboardingIntent] = useState(null);
  const [showLocalFileLocation, setShowLocalFileLocation] = useState(false);
  const [localFileBinding, setLocalFileBinding] = useState(() => ({
    status: typeof window !== "undefined" && window.showSaveFilePicker ? "checking" : "unsupported",
    name: "",
  }));
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState("general");
  const [showInterfaceThemes, setShowInterfaceThemes] = useState(false);
  const [showDeleteLocalData, setShowDeleteLocalData] = useState(false);
  const [isClearingLocalData, setIsClearingLocalData] = useState(false);
  const [authSession, setAuthSession] = useState(() => authPreviewUserRef.current
    ? { status: "signed-in", user: authPreviewUserRef.current, error: null }
    : { status: "loading", user: null, error: null });
  const [authConsentGranted, setAuthConsentGranted] = useState(Boolean(authPreviewUserRef.current));
  const [authReceipt, setAuthReceipt] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [emailLinkFlow, setEmailLinkFlow] = useState({ status: "idle", href: "", context: null });
  const [accountLinkMessage, setAccountLinkMessage] = useState(null);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [pendingAdvancedFeature, setPendingAdvancedFeature] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [driveSettings, setDriveSettings] = useState(initialDriveSettingsRef.current);
  const [storagePreferences, setStoragePreferences] = useState(initialStoragePreferencesRef.current);
  const [driveSession, setDriveSession] = useState(() => ({
    status: initialDriveSettingsRef.current.enabled ? "authorization-required" : "disconnected",
    connected: false,
    busy: false,
    message: initialDriveSettingsRef.current.enabled ? "Drive 檔案連結仍已保留；登入完成後會自動恢復授權。" : "",
    user: null,
    quota: null,
    files: [],
    conflict: null,
    lastSyncedAt: "",
  }));
  const [localLibrarySummary, setLocalLibrarySummary] = useState({
    boardCount: 0,
    pendingSyncCount: 0,
    estimatedBoardBytes: 0,
    storage: { usage: null, quota: null, persisted: null },
  });
  const [localBoards, setLocalBoards] = useState([]);
  const [syncJobs, setSyncJobs] = useState([]);
  const [customThemes, setCustomThemes] = useState(loadStoredInterfaceThemes);
  const [activeThemeId, setActiveThemeId] = useState(() => localStorage.getItem(ACTIVE_THEME_STORAGE_KEY) || DEFAULT_INTERFACE_THEME_ID);
  const [systemInterfaceMode, setSystemInterfaceMode] = useState(currentSystemInterfaceMode);
  const [interfaceModePreference, setInterfaceModePreference] = useState(() => {
    const legacyTheme = [...BUILT_IN_THEMES, ...customThemes].find((theme) => theme.id === activeThemeId)
      || BUILT_IN_THEMES[0];
    return loadInterfaceModePreference(localStorage, legacyTheme);
  });
  const [previewTheme, setPreviewTheme] = useState(null);
  const [interfaceTypography, setInterfaceTypography] = useState(loadStoredInterfaceTypography);
  const [canvasBackground, setCanvasBackground] = useState(loadStoredCanvasBackground);
  const [objectColorSets, setObjectColorSets] = useState(loadObjectColorSets);
  const [updateCheck, setUpdateCheck] = useState({ status: "idle", manifest: null, checkedAt: null, message: "" });
  const [updatePreference, setUpdatePreference] = useState(loadUpdatePreference);
  const [updateAction, setUpdateAction] = useState({ status: "idle", message: "" });
  const [updateNoticeDismissed, setUpdateNoticeDismissed] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const [driveVersions, setDriveVersions] = useState({ status: "idle", items: [], fileId: "", headRevisionId: "", message: "" });
  const [mobilePanel, setMobilePanel] = useState(null);
  const [mobileTopbarMenuOpen, setMobileTopbarMenuOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => normalizeLeftPanelWidth(localStorage.getItem("moodboard-left-panel-width")));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => normalizeRightPanelWidth(localStorage.getItem("studio-right-panel-width"), normalizeLeftPanelWidth(localStorage.getItem("moodboard-left-panel-width"))));
  const [leftPanelVisible, setLeftPanelVisible] = useState(() => localStorage.getItem("moodboard-left-panel-visible") !== "false");
  const [rightPanelVisible, setRightPanelVisible] = useState(() => localStorage.getItem("moodboard-right-panel-visible") !== "false");
  const [focusMode, setFocusMode] = useState(false);
  const [rulersVisible, setRulersVisible] = useState(() => localStorage.getItem(RULERS_VISIBLE_STORAGE_KEY) !== "false");
  const [guidesVisible, setGuidesVisible] = useState(() => localStorage.getItem(GUIDES_VISIBLE_STORAGE_KEY) !== "false");
  const [rulerUnit, setRulerUnit] = useState(() => normalizeRulerUnit(localStorage.getItem(RULER_UNIT_STORAGE_KEY)));
  const canvasGridMetrics = useMemo(() => buildCanvasGridMetrics({
    viewX: view.x,
    viewY: view.y,
    zoom: view.zoom,
    unit: rulerUnit,
    originX: board.rulerOrigin?.x,
    originY: board.rulerOrigin?.y,
  }), [board.rulerOrigin?.x, board.rulerOrigin?.y, rulerUnit, view.x, view.y, view.zoom]);
  const canvasGridStyle = {
    ...canvasBackgroundCssVariables(canvasBackground),
    ...(canvasBackground.mode === "hidden" ? {} : {
      "--canvas-grid-major-step": `${canvasGridMetrics.majorScreenStep}px`,
      "--canvas-grid-minor-step": `${canvasGridMetrics.minorScreenStep}px`,
      "--canvas-grid-origin-x": `${canvasGridMetrics.screenOriginX}px`,
      "--canvas-grid-origin-y": `${canvasGridMetrics.screenOriginY}px`,
    }),
  };
  const [guideDrag, setGuideDrag] = useState(null);
  const [leftPanelResizing, setLeftPanelResizing] = useState(false);
  const [rightPanelResizing, setRightPanelResizing] = useState(false);
  const [canvasViewportSize, setCanvasViewportSize] = useState({ width: 0, height: 0 });
  const [canvasToolbarPosition, setCanvasToolbarPosition] = useState(loadStoredCanvasToolbarPosition);
  const [canvasToolbarDragging, setCanvasToolbarDragging] = useState(false);
  const [sessionName, setSessionNameState] = useState(() => localStorage.getItem("moodboard-session-name") || createSessionName());
  const [peers, setPeers] = useState([]);
  const [driveSharing, setDriveSharing] = useState(EMPTY_DRIVE_SHARING);
  const boardDriveLink = driveSettings.links[board.id];
  const cloudReadOnly = isCloudBoardReadOnly(driveSharing, boardDriveLink);
  const cloudReadOnlyRef = useRef(cloudReadOnly);
  cloudReadOnlyRef.current = cloudReadOnly;

  useEffect(() => {
    if (!cloudReadOnly) return;
    setEditingText(null);
    setLoadedTextFlow(null);
    setShapeMenuOpen(false);
    setShowGridBuilder(false);
    setShowAnnotationBuilder(false);
    setTool((current) => current === "3d" ? "select" : current);
  }, [cloudReadOnly]);
  const [historySignal, setHistorySignal] = useState(0);
  const canUseDirectoryPicker = typeof window.showDirectoryPicker === "function" && navigator.webdriver !== true;
  const canUseFileSystemPicker = typeof window.showSaveFilePicker === "function";
  const providerTestMode = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get("authProviderTest") === "facebook";
  const identitySignedIn = authSession.status === "signed-in" && isMoodboardIdentityEligible(authSession.user);
  const authReady = identitySignedIn && authConsentGranted;

  const appRootRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasToolbarRef = useRef(null);
  const imageInputRef = useRef(null);
  const textDocumentInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const svgInputRef = useRef(null);
  const boardInputRef = useRef(null);
  const themeInputRef = useRef(null);
  const objectColorSetsInputRef = useRef(null);
  const fileHandleRef = useRef(null);
  const driveTokenRef = useRef(null);
  const driveRenewPromiseRef = useRef(null);
  const driveRestoreAttemptRef = useRef("");
  const driveOperationEpochRef = useRef(0);
  const driveReadEpochRef = useRef(0);
  const driveReadPendingRef = useRef(null);
  const storageTargetOperationEpochRef = useRef(0);
  const driveSaveControllerRef = useRef(null);
  const driveSavePromiseRef = useRef(null);
  const driveRefreshEpochRef = useRef(0);
  const versionActionRef = useRef(false);
  const tabRecoveryQueueRef = useRef(Promise.resolve());
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const channelRef = useRef(null);
  const peersRef = useRef(new Map());
  const sessionIdRef = useRef(createId("session"));
  const initialDriveShareRef = useRef(initialProtectedShare || parseGoogleDriveMoodboardLink(window.location.href));
  const sharingCurrentBoardRef = useRef(false);
  const directShareAttemptRef = useRef(null);
  const pendingSharedEditRef = useRef(new URL(window.location.href).searchParams.get("requestEdit") === "1");
  const legacyCollaborationLinkRef = useRef(new URL(window.location.href).searchParams.has("collab"));
  const driveSharingRequestRef = useRef(0);
  const saveTimerRef = useRef(null);
  const localSavePromiseRef = useRef(Promise.resolve());
  const localFileSavePromiseRef = useRef(Promise.resolve());
  const localFilePromptDismissedRef = useRef(new Set());
  const localPersistenceGenerationRef = useRef(0);
  const driveSyncTimerRef = useRef(null);

  const startupUserInteractedRef = useRef(false);
  const autoUpdateDeferredVersionRef = useRef("");
  const updateApplyPromiseRef = useRef(null);
  const updateSavePrimaryRef = useRef(null);
  const updateCheckStateRef = useRef(updateCheck);
  updateCheckStateRef.current = updateCheck;
  const updateNoticeStateRef = useRef({ dismissed: updateNoticeDismissed, preference: updatePreference });
  updateNoticeStateRef.current = { dismissed: updateNoticeDismissed, preference: updatePreference };
  const preparedDownloadsRef = useRef([]);
  const emailLinkHandledRef = useRef(false);
  const doubleClickPanMovedRef = useRef(false);
  const zoomValueTapRef = useRef(0);
  const canvasToolTapRef = useRef({ select: 0, hand: 0 });
  const zoomWindowReturnToolRef = useRef("select");
  const altDownRef = useRef(false);
  const blankClickRef = useRef(null);
  const objectClickRef = useRef(null);
  const objectTapRef = useRef(null);
  const textEditUndoRef = useRef(false);
  const textEditSessionRef = useRef(null);
  const objectClipboardRef = useRef([]);
  const activePointerGestureRef = useRef(null);

  const availableThemes = useMemo(() => [...BUILT_IN_THEMES, ...customThemes], [customThemes]);
  const activeTheme = useMemo(
    () => availableThemes.find((theme) => theme.id === activeThemeId)
      || availableThemes.find((theme) => theme.id === DEFAULT_INTERFACE_THEME_ID)
      || BUILT_IN_THEMES[0],
    [activeThemeId, availableThemes],
  );
  const resolvedInterfaceMode = useMemo(
    () => resolveInterfaceMode(interfaceModePreference, systemInterfaceMode === "dark"),
    [interfaceModePreference, systemInterfaceMode],
  );
  const effectiveActiveTheme = useMemo(
    () => resolveInterfaceThemeForMode(activeTheme, resolvedInterfaceMode),
    [activeTheme, resolvedInterfaceMode],
  );
  const effectivePreviewTheme = useMemo(
    () => previewTheme ? resolveInterfaceThemeForMode(previewTheme, resolvedInterfaceMode) : null,
    [previewTheme, resolvedInterfaceMode],
  );
  const displayedAvailableThemes = useMemo(
    () => availableThemes.map((theme) => resolveInterfaceThemeForMode(theme, resolvedInterfaceMode)),
    [availableThemes, resolvedInterfaceMode],
  );
  const visualInterfaceTheme = effectivePreviewTheme || effectiveActiveTheme;
  const interfaceThemeStyle = useMemo(
    () => ({
      ...interfaceThemeCssVariables(visualInterfaceTheme),
      ...interfaceTypographyCssVariables(interfaceTypography),
    }),
    [interfaceTypography, visualInterfaceTheme],
  );

  const themeForResolvedMode = useCallback((targetMode) => {
    const supportsMode = (theme) => theme.id === DEFAULT_INTERFACE_THEME_ID || interfaceThemeMode(theme) === targetMode;
    const current = availableThemes.find((theme) => theme.id === activeThemeId);
    if (current && supportsMode(current)) return current;
    const storageKey = targetMode === "light" ? LAST_LIGHT_THEME_STORAGE_KEY : LAST_DARK_THEME_STORAGE_KEY;
    const rememberedId = localStorage.getItem(storageKey);
    return availableThemes.find((theme) => theme.id === rememberedId && supportsMode(theme))
      || availableThemes.find((theme) => theme.id === DEFAULT_INTERFACE_THEME_ID)
      || availableThemes.find(supportsMode)
      || BUILT_IN_THEMES[0];
  }, [activeThemeId, availableThemes]);

  const registerPointerGesture = useCallback((gesture) => {
    const entry = { ...gesture };
    activePointerGestureRef.current = entry;
    return () => {
      if (activePointerGestureRef.current === entry) activePointerGestureRef.current = null;
    };
  }, []);

  const requestActivePointerCancellation = useCallback(() => {
    const gesture = activePointerGestureRef.current;
    if (!gesture) return false;
    activePointerGestureRef.current = null;
    gesture.pause?.();
    const hasChanges = Boolean(gesture.hasChanges?.());
    if (shouldConfirmEscapeCancellation({ affectsDocument: gesture.affectsDocument, hasChanges })) {
      setEscapeCancellationRequest({
        label: gesture.label || "目前調整",
        cancel: gesture.cancel,
        keep: gesture.keep,
      });
    } else {
      gesture.cancel?.();
    }
    return true;
  }, []);

  const keepEscapeAdjustment = useCallback(() => {
    const request = escapeCancellationRequest;
    if (!request) return;
    setEscapeCancellationRequest(null);
    request.keep?.();
  }, [escapeCancellationRequest]);

  const cancelEscapeAdjustment = useCallback(() => {
    const request = escapeCancellationRequest;
    if (!request) return;
    setEscapeCancellationRequest(null);
    request.cancel?.();
  }, [escapeCancellationRequest]);

  const finishStartup = useCallback(() => setIsBooting(false), []);
  const changeLeftTab = useCallback((nextTab) => {
    if (nextTab === "sources") {
      setShapeMenuOpen(false);
      setDragActive(false);
      setSpaceDown(false);
      setZoomWindowRect(null);
      setTool((current) => current === "zoom-window" ? zoomWindowReturnToolRef.current : current);
      setLoadedTextFlow(null);
      setEditingText(null);
    }
    setLeftTab(nextTab);
    if (nextTab !== "filters") setFilters(DEFAULT_FILTERS);
  }, []);

  const updateLeftPanelWidth = useCallback((value) => {
    const nextWidth = normalizeLeftPanelWidth(value, rightPanelWidth);
    setLeftPanelWidth(nextWidth);
    localStorage.setItem("moodboard-left-panel-width", String(nextWidth));
    return nextWidth;
  }, [rightPanelWidth]);

  const updateRightPanelWidth = useCallback((value) => {
    const nextWidth = normalizeRightPanelWidth(value, leftPanelWidth);
    setRightPanelWidth(nextWidth);
    localStorage.setItem("studio-right-panel-width", String(nextWidth));
    return nextWidth;
  }, [leftPanelWidth]);

  const toggleLeftPanel = useCallback(() => {
    setFocusMode(false);
    setLeftPanelVisible((current) => {
      const next = !current;
      localStorage.setItem("moodboard-left-panel-visible", String(next));
      return next;
    });
  }, []);

  const toggleRightPanel = useCallback(() => {
    setFocusMode(false);
    setRightPanelVisible((current) => {
      const next = !current;
      localStorage.setItem("moodboard-right-panel-visible", String(next));
      return next;
    });
  }, []);

  const toggleBothPanels = useCallback(() => {
    setFocusMode(false);
    const nextVisible = !(leftPanelVisible && rightPanelVisible);
    setLeftPanelVisible(nextVisible);
    setRightPanelVisible(nextVisible);
    localStorage.setItem("moodboard-left-panel-visible", String(nextVisible));
    localStorage.setItem("moodboard-right-panel-visible", String(nextVisible));
  }, [leftPanelVisible, rightPanelVisible]);

  const showBothPanels = useCallback(() => {
    setFocusMode(false);
    setMobilePanel(null);
    setLeftPanelVisible(true);
    setRightPanelVisible(true);
    localStorage.setItem("moodboard-left-panel-visible", "true");
    localStorage.setItem("moodboard-right-panel-visible", "true");
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((current) => !current);
    setMobilePanel(null);
  }, []);

  const restoreWorkspaceChrome = useCallback(() => {
    setFocusMode(false);
    setMobilePanel(null);
  }, []);

  const toggleRulers = useCallback(() => setRulersVisible((current) => !current), []);
  const toggleGuides = useCallback(() => setGuidesVisible((current) => !current), []);
  const changeRulerUnit = useCallback((nextUnit) => setRulerUnit(normalizeRulerUnit(nextUnit)), []);

  const openListSearch = useCallback((listId) => {
    window.dispatchEvent(new CustomEvent("infinite-moodboard:list-search", { detail: { listId } }));
  }, []);

  const onLeftPanelResizeStart = useCallback((event) => {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = leftPanelWidth;
    let latestWidth = startWidth;
    let releaseGesture = () => {};
    setLeftPanelResizing(true);
    const move = (moveEvent) => {
      latestWidth = updateLeftPanelWidth(startWidth + moveEvent.clientX - startX);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setLeftPanelResizing(false);
    };
    const cancel = () => {
      cleanup();
      if (latestWidth !== startWidth) updateLeftPanelWidth(startWidth);
      setLeftPanelResizing(false);
    };
    releaseGesture = registerPointerGesture({
      label: "調整側欄寬度",
      affectsDocument: false,
      hasChanges: () => latestWidth !== startWidth,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [leftPanelWidth, registerPointerGesture, updateLeftPanelWidth]);

  const onLeftPanelResizeKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 32 : 8;
    let nextWidth = null;
    if (event.key === "ArrowLeft") nextWidth = leftPanelWidth - step;
    if (event.key === "ArrowRight") nextWidth = leftPanelWidth + step;
    if (event.key === "Home") nextWidth = LEFT_PANEL_MIN_WIDTH;
    if (event.key === "End") nextWidth = getLeftPanelMaxWidth(rightPanelWidth);
    if (nextWidth === null) return;
    event.preventDefault();
    updateLeftPanelWidth(nextWidth);
  }, [leftPanelWidth, rightPanelWidth, updateLeftPanelWidth]);

  const onRightPanelResizeStart = useCallback((event) => {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = rightPanelWidth;
    let latestWidth = startWidth;
    let releaseGesture = () => {};
    setRightPanelResizing(true);
    const move = (moveEvent) => { latestWidth = updateRightPanelWidth(startWidth + startX - moveEvent.clientX); };
    const cleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); releaseGesture(); };
    const up = () => { cleanup(); setRightPanelResizing(false); };
    const cancel = () => { cleanup(); if (latestWidth !== startWidth) updateRightPanelWidth(startWidth); setRightPanelResizing(false); };
    releaseGesture = registerPointerGesture({ label: "調整側欄寬度", affectsDocument: false, hasChanges: () => latestWidth !== startWidth, pause: cleanup, cancel, keep: up });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [registerPointerGesture, rightPanelWidth, updateRightPanelWidth]);

  const onRightPanelResizeKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 32 : 8;
    let nextWidth = null;
    if (event.key === "ArrowLeft") nextWidth = rightPanelWidth + step;
    if (event.key === "ArrowRight") nextWidth = rightPanelWidth - step;
    if (event.key === "Home") nextWidth = RIGHT_PANEL_MIN_WIDTH;
    if (event.key === "End") nextWidth = getRightPanelMaxWidth(leftPanelWidth);
    if (nextWidth === null) return;
    event.preventDefault();
    updateRightPanelWidth(nextWidth);
  }, [leftPanelWidth, rightPanelWidth, updateRightPanelWidth]);

  useEffect(() => {
    if (!isBooting) return undefined;
    const timer = window.setTimeout(finishStartup, 4100);
    const onKeyDown = (event) => {
      if (event.key === "Escape") finishStartup();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [finishStartup, isBooting]);

  useEffect(() => {
    const keepPanelInsideViewport = () => {
      if (window.innerWidth <= 900) return;
      setLeftPanelWidth((current) => {
        const next = normalizeLeftPanelWidth(current, rightPanelWidth);
        if (next !== current) localStorage.setItem("moodboard-left-panel-width", String(next));
        return next;
      });
      setRightPanelWidth((current) => {
        const next = normalizeRightPanelWidth(current, leftPanelWidth);
        if (next !== current) localStorage.setItem("studio-right-panel-width", String(next));
        return next;
      });
    };
    window.addEventListener("resize", keepPanelInsideViewport);
    return () => window.removeEventListener("resize", keepPanelInsideViewport);
  }, [leftPanelWidth, rightPanelWidth]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setCanvasViewportSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };
    measure();
    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    resizeObserver?.observe(canvas);
    if (!resizeObserver) window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", measure);
    };
  }, []);

  useLayoutEffect(() => {
    const toolbar = canvasToolbarRef.current;
    if (!toolbar || !canvasToolbarPosition || !canvasViewportSize.width || !canvasViewportSize.height) return;
    if (window.matchMedia("(max-width: 900px)").matches) return;
    const rect = toolbar.getBoundingClientRect();
    const next = clampCanvasToolbarPosition(
      canvasToolbarPosition,
      canvasViewportSize,
      { width: rect.width, height: rect.height },
      { margin: 8 },
    );
    if (next.x === canvasToolbarPosition.x && next.y === canvasToolbarPosition.y) return;
    setCanvasToolbarPosition(next);
  }, [canvasToolbarPosition, canvasViewportSize]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const update = (event) => setSystemInterfaceMode(event.matches ? "dark" : "light");
    setSystemInterfaceMode(media.matches ? "dark" : "light");
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener?.(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", update);
      else media.removeListener?.(update);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(INTERFACE_MODE_STORAGE_KEY, interfaceModePreference);
  }, [interfaceModePreference]);

  useEffect(() => {
    if (interfaceModePreference !== "system") return;
    const nextTheme = themeForResolvedMode(resolvedInterfaceMode);
    if (nextTheme?.id && nextTheme.id !== activeThemeId) setActiveThemeId(nextTheme.id);
  }, [activeThemeId, interfaceModePreference, resolvedInterfaceMode, themeForResolvedMode]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(customThemes));
  }, [customThemes]);

  useEffect(() => {
    saveObjectColorSets(localStorage, objectColorSets);
  }, [objectColorSets]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_THEME_STORAGE_KEY, activeTheme.id);
    if (activeTheme.id !== activeThemeId) setActiveThemeId(activeTheme.id);
  }, [activeTheme, activeThemeId]);

  useEffect(() => {
    localStorage.setItem(UI_TYPOGRAPHY_STORAGE_KEY, JSON.stringify(interfaceTypography));
  }, [interfaceTypography]);

  useEffect(() => {
    localStorage.setItem(CANVAS_BACKGROUND_STORAGE_KEY, JSON.stringify(canvasBackground));
  }, [canvasBackground]);

  useEffect(() => {
    if (canvasToolbarDragging) return;
    if (canvasToolbarPosition) {
      localStorage.setItem(CANVAS_TOOLBAR_POSITION_STORAGE_KEY, JSON.stringify(canvasToolbarPosition));
    } else {
      localStorage.removeItem(CANVAS_TOOLBAR_POSITION_STORAGE_KEY);
    }
  }, [canvasToolbarDragging, canvasToolbarPosition]);

  useEffect(() => {
    localStorage.setItem(RULERS_VISIBLE_STORAGE_KEY, String(rulersVisible));
  }, [rulersVisible]);

  useEffect(() => {
    localStorage.setItem(GUIDES_VISIBLE_STORAGE_KEY, String(guidesVisible));
  }, [guidesVisible]);

  useEffect(() => {
    localStorage.setItem(RULER_UNIT_STORAGE_KEY, rulerUnit);
  }, [rulerUnit]);

  useLayoutEffect(() => {
    applyLocalizedDocumentMetadata(interfaceLocale);
    return localizeInterfaceDom(appRootRef.current, interfaceLocale);
  }, [interfaceLocale]);

  useEffect(() => {
    const updateOnlineState = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (authPreviewUserRef.current) return undefined;
    let active = true;
    let unsubscribe = () => {};
    setAuthSession({ status: "loading", user: null, error: null });
    setAuthMessage("");
    observeMoodboardSession((nextSession) => {
      if (!active) return;
      setAuthSession(nextSession);
      const receipt = nextSession.user ? getMoodboardAccessReceipt(localStorage, nextSession.user.uid) : null;
      setAuthReceipt(receipt);
      setAuthConsentGranted(Boolean(receipt) && isMoodboardIdentityEligible(nextSession.user));
      if (nextSession.status === "error") {
        setAuthMessage(moodboardAuthErrorMessage(nextSession.error, navigator.onLine !== false));
      } else if (nextSession.user && !isMoodboardIdentityEligible(nextSession.user)) {
        setAuthMessage(nextSession.user.emailVerified === false
          ? moodboardAuthErrorMessage({ code: "auth/unverified-email" })
          : moodboardAuthErrorMessage({ code: "auth/provider-not-allowed" }));
      }
    }).then((stop) => {
      if (active) unsubscribe = stop;
      else stop();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authRetryKey]);

  useEffect(() => {
    const activeThemeSupportsMode = activeTheme.id === DEFAULT_INTERFACE_THEME_ID
      || interfaceThemeMode(activeTheme) === resolvedInterfaceMode;
    if (!activeThemeSupportsMode) return;
    const storageKey = resolvedInterfaceMode === "light" ? LAST_LIGHT_THEME_STORAGE_KEY : LAST_DARK_THEME_STORAGE_KEY;
    localStorage.setItem(storageKey, activeTheme.id);
  }, [activeTheme, resolvedInterfaceMode]);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { selectedGuideIdsRef.current = selectedGuideIds; }, [selectedGuideIds]);
  useEffect(() => {
    if (!selectedIds.length || !selectedGuideIdsRef.current.length) return;
    selectedGuideIdsRef.current = [];
    setSelectedGuideIds([]);
  }, [selectedIds]);
  useEffect(() => {
    const selectable = new Set(board.guidesLocked
      ? []
      : (board.guides || []).filter((guide) => !guide.locked).map((guide) => guide.id));
    setSelectedGuideIds((current) => {
      const next = current.filter((id) => selectable.has(id));
      if (next.length === current.length && next.every((id, index) => id === current[index])) return current;
      selectedGuideIdsRef.current = next;
      return next;
    });
  }, [board.guides, board.guidesLocked]);
  useEffect(() => {
    if (loadedTextFlow && !board.objects.some((object) => object.id === loadedTextFlow.sourceId)) {
      setLoadedTextFlow(null);
    }
  }, [board.objects, loadedTextFlow]);
  useEffect(() => {
    if (!shapeMenuOpen) return undefined;
    const close = (event) => {
      if (!event.target.closest?.(".insert-menu-wrap")) setShapeMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [shapeMenuOpen]);
  useEffect(() => {
    if (!selectedIds.length) {
      setKeyObjectId(null);
      if (tool === "3d") setTool("select");
      return;
    }
    if (!selectedIds.includes(keyObjectId)) setKeyObjectId(selectedIds[0]);
  }, [keyObjectId, selectedIds, tool]);
  useEffect(() => {
    if (!editingText) return;
    const editableObject = board.objects.find((object) => object.id === editingText.id);
    if (!editableObject || editableObject.locked || tool !== "select" || !selectedIds.includes(editingText.id)) {
      setEditingText(null);
      textEditUndoRef.current = false;
      textEditSessionRef.current = null;
    }
  }, [board.objects, editingText, selectedIds, tool]);

  const closePreparedDownloads = useCallback(() => {
    preparedDownloadsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    preparedDownloadsRef.current = [];
    setPreparedDownloads([]);
  }, []);

  useEffect(() => () => {
    preparedDownloadsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  const announce = useCallback((message, tone = "info") => {
    setToast({ message, tone });
  }, []);

  const toastPause = useToastPause(toast, 3600, () => setToast(null));

  const resetPanelWidths = useCallback(() => {
    const left = normalizeLeftPanelWidth(LEFT_PANEL_MIN_WIDTH, 304);
    const right = normalizeRightPanelWidth(304, left);
    setLeftPanelWidth(left);
    setRightPanelWidth(right);
    localStorage.setItem("moodboard-left-panel-width", String(left));
    localStorage.setItem("studio-right-panel-width", String(right));
    announce("已恢復左右側欄的預設寬度。", "success");
  }, [announce]);

  const resetCanvasToolbarPosition = useCallback(() => {
    setCanvasToolbarPosition(null);
    announce("畫布工具列已回到預設位置。", "success");
  }, [announce]);

  const onCanvasToolbarDragStart = useCallback((event) => {
    if (event.button !== 0 || window.matchMedia("(max-width: 900px)").matches) return;
    const toolbar = canvasToolbarRef.current;
    const container = toolbar?.parentElement;
    if (!toolbar || !container) return;
    event.preventDefault();
    event.stopPropagation();
    const containerRect = container.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const startPointer = { x: event.clientX, y: event.clientY };
    const startPosition = {
      x: toolbarRect.left - containerRect.left,
      y: toolbarRect.top - containerRect.top,
    };
    const previousPosition = canvasToolbarPosition ? { ...canvasToolbarPosition } : null;
    const bounds = { width: containerRect.width, height: containerRect.height };
    const toolbarSize = { width: toolbarRect.width, height: toolbarRect.height };
    let moved = false;
    let releaseGesture = () => {};
    setCanvasToolbarDragging(true);

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startPointer.x;
      const dy = moveEvent.clientY - startPointer.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      setCanvasToolbarPosition(clampCanvasToolbarPosition(
        { x: startPosition.x + dx, y: startPosition.y + dy },
        bounds,
        toolbarSize,
        { margin: 8 },
      ));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const finish = () => {
      cleanup();
      setCanvasToolbarDragging(false);
    };
    const cancel = () => {
      cleanup();
      setCanvasToolbarPosition(previousPosition);
      setCanvasToolbarDragging(false);
    };
    releaseGesture = registerPointerGesture({
      label: "移動畫布工具列",
      affectsDocument: false,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: finish,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [canvasToolbarPosition, registerPointerGesture]);

  const onCanvasToolbarHandleKeyDown = useCallback((event) => {
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      resetCanvasToolbarPosition();
      return;
    }
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction || window.matchMedia("(max-width: 900px)").matches) return;
    const toolbar = canvasToolbarRef.current;
    const container = toolbar?.parentElement;
    if (!toolbar || !container) return;
    event.preventDefault();
    event.stopPropagation();
    const toolbarRect = toolbar.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const currentPosition = canvasToolbarPosition || {
      x: toolbarRect.left - containerRect.left,
      y: toolbarRect.top - containerRect.top,
    };
    const step = event.shiftKey ? 24 : 8;
    setCanvasToolbarPosition(clampCanvasToolbarPosition(
      {
        x: currentPosition.x + direction[0] * step,
        y: currentPosition.y + direction[1] * step,
      },
      { width: containerRect.width, height: containerRect.height },
      { width: toolbarRect.width, height: toolbarRect.height },
      { margin: 8 },
    ));
  }, [canvasToolbarPosition, resetCanvasToolbarPosition]);

  const updateDriveSettings = useCallback((updater) => {
    setDriveSettings((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return saveDriveState(localStorage, next);
    });
  }, []);

  const updateStoragePreferences = useCallback((updater) => {
    setStoragePreferences((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return saveStoragePreferences(localStorage, next);
    });
  }, []);

  const setBoardPrimaryStorage = useCallback((boardId, target) => {
    updateStoragePreferences((current) => setBoardStorageTarget(current, boardId, target));
  }, [updateStoragePreferences]);

  const currentDriveAccessToken = useCallback(() => {
    const token = driveTokenRef.current;
    if (!isGoogleDriveTokenUsable(token)) return "";
    return token.accessToken;
  }, []);

  const cancelDriveRead = useCallback(() => {
    driveReadEpochRef.current += 1;
    if (driveReadPendingRef.current !== null) {
      driveReadPendingRef.current = null;
      if (!driveSavePromiseRef.current) setDriveSession((current) => ({ ...current, busy: false, status: current.conflict ? "conflict" : current.connected ? "ready" : "disconnected", message: "" }));
    }
  }, []);

  const cancelDriveOperations = useCallback(() => {
    driveOperationEpochRef.current += 1;
    driveRefreshEpochRef.current += 1;
    cancelDriveRead();
    setDriveSaveConfirmation(null);
    driveSaveControllerRef.current?.abort();
    driveSaveControllerRef.current = null;
    driveSavePromiseRef.current = null;
    setDriveSession((current) => ({ ...current, busy: false, status: current.conflict ? "conflict" : current.connected ? "ready" : "disconnected" }));
  }, [cancelDriveRead]);

  const persistBoardLocally = useCallback((snapshot) => {
    const generation = localPersistenceGenerationRef.current;
    const previous = localSavePromiseRef.current.catch(() => undefined);
    const write = previous.then(async () => {
      if (generation !== localPersistenceGenerationRef.current) {
        const error = new Error("本機儲存已取消。");
        error.name = "AbortError";
        throw error;
      }
      try {
        await saveCurrentBoard(snapshot);
      } catch (firstError) {
        await compactLocalRecoveryStorage(snapshot.id).catch(() => undefined);
        try {
          await saveCurrentBoard(snapshot);
        } catch (retryError) {
          throw retryError;
        }
      }
      return snapshot;
    });
    localSavePromiseRef.current = write.catch(() => undefined);
    return write;
  }, []);

  const writeBoardToBoundLocalFile = useCallback(async (snapshot, { requestPermission = false } = {}) => {
    const handle = fileHandleRef.current;
    if (!handle) {
      setLocalFileBinding((current) => ["browser-only", "unsupported", "unlinked"].includes(current.status)
        ? current
        : { status: "unlinked", name: "" });
      return false;
    }
    const previous = localFileSavePromiseRef.current.catch(() => undefined);
    const write = previous.then(() => writeMoodboardToLocalFile(handle, snapshot, { requestPermission }));
    localFileSavePromiseRef.current = write.catch(() => undefined);
    try {
      const result = await write;
      if (boardRef.current.id === snapshot.id) {
        setLocalFileBinding({ status: "linked", name: result.filename });
      }
      return true;
    } catch (error) {
      if (boardRef.current.id === snapshot.id) {
        const status = error?.code === "local-file/permission-required" ? "permission-required" : "error";
        const name = String(handle.name || "");
        setLocalFileBinding((current) => current.status === status && current.name === name ? current : { status, name });
      }
      return false;
    }
  }, []);

  const refreshLocalLibrarySummary = useCallback(async () => {
    try {
      const [summary, boards, jobs] = await Promise.all([
        getLocalLibrarySummary(),
        listLocalBoards(),
        listSyncJobs(),
      ]);
      setLocalLibrarySummary(summary);
      setLocalBoards(boards);
      setSyncJobs(jobs);
      return summary;
    } catch {
      return null;
    }
  }, []);

  const refreshGoogleDrive = useCallback(async (providedToken = "", providedFolderId = "", {
    resetLinks = false,
    connectionUser = null,
  } = {}) => {
    // Metadata refresh must not clear the busy/success state of an active upload.
    if (driveSavePromiseRef.current) return null;
    const operationEpoch = driveOperationEpochRef.current;
    const startingBoardId = boardRef.current.id;
    const refreshEpoch = ++driveRefreshEpochRef.current;
    const refreshIsCurrent = () => refreshEpoch === driveRefreshEpochRef.current && operationEpoch === driveOperationEpochRef.current && boardRef.current.id === startingBoardId;
    const linked = resetLinks ? null : loadDriveState(localStorage).links[startingBoardId];
    const accessToken = providedToken || currentDriveAccessToken();
    const resolvedConnectionUser = connectionUser || authSession.user;
    if (!accessToken) {
      setDriveSession((current) => ({ ...current, status: "authorization-required", connected: false, busy: false, message: "請重新連結 Google Drive；本機變更仍安全保留。" }));
      return null;
    }
    setDriveSession((current) => ({ ...current, status: "checking", connected: true, busy: true, message: "正在確認 Drive 檔案與可用空間…" }));
    try {
      const { ensureGoogleDriveFolder, getGoogleDriveAbout, listGoogleDriveMoodboards, getGoogleDriveFile } = await loadDriveRuntime();
      const folderId = await ensureGoogleDriveFolder(accessToken, providedFolderId || driveSettings.folderId, { create: false });
      const [about, files, linkedMetadata] = await Promise.all([
        getGoogleDriveAbout(accessToken),
        listGoogleDriveMoodboards(accessToken, folderId),
        linked ? getGoogleDriveFile(accessToken, linked.fileId, { resourceKey: linked.resourceKey || "" }) : null,
      ]);
      if (!refreshIsCurrent()) return null;
      const changedRemote = boardRef.current.id === startingBoardId && remoteContentChanged(linked, linkedMetadata)
        ? { ...linkedMetadata, boardId: startingBoardId } : null;
      if (changedRemote) setDriveIncomingVersion(changedRemote);
      updateDriveSettings((current) => ({
        ...current,
        enabled: true,
        folderId,
        connectionOwnerUid: String(resolvedConnectionUser?.uid || current.connectionOwnerUid || ""),
        connectionEmail: String(about.user?.emailAddress || resolvedConnectionUser?.email || current.connectionEmail || ""),
        links: resetLinks ? {} : current.links,
      }));
      setDriveSession((current) => ({
        ...current,
        status: changedRemote || current.conflict ? "conflict" : "ready",
        conflict: changedRemote || current.conflict,
        connected: true,
        busy: false,
        message: "",
        user: about.user,
        quota: about.quota,
        files,
      }));
      return { accessToken, folderId, about, files };
    } catch (error) {
      if (!refreshIsCurrent()) return null;
      const authorizationRequired = isGoogleDriveAuthorizationError(error);
      if (authorizationRequired) driveTokenRef.current = null;
      setDriveSession((current) => ({
        ...current,
        status: authorizationRequired ? "authorization-required" : (error?.code === "drive/offline" ? "offline" : "error"),
        connected: !authorizationRequired,
        busy: false,
        message: driveErrorMessage(error),
      }));
      return null;
    }
  }, [authSession.user, currentDriveAccessToken, driveSettings.folderId, updateDriveSettings]);

  const connectGoogleDrive = useCallback(async ({
    allowIdentitySession = false,
    connectionUser = null,
    onboarding = false,
  } = {}) => {
    const resolvedConnectionUser = connectionUser || authSession.user;
    const isOnboarding = onboarding || Boolean(driveOnboardingIntent);
    if (!authReady && !(allowIdentitySession && isMoodboardIdentityEligible(resolvedConnectionUser))) {
      setShowSettings(false);
      setShowDriveLibrary(false);
      setPendingAdvancedFeature(isOnboarding ? "drive-onboarding" : "drive");
      return null;
    }
    const operationEpoch = driveOperationEpochRef.current;
    const connectionOwnerUid = String(resolvedConnectionUser?.uid || "");
    const ownerChanged = Boolean(
      driveSettings.connectionOwnerUid
      && connectionOwnerUid
      && driveSettings.connectionOwnerUid !== connectionOwnerUid
    );
    setDriveSession((current) => ({ ...current, status: "connecting", busy: true, message: "Google 會另外詢問 Drive 檔案權限。" }));
    try {
      const { requestGoogleDriveToken } = await loadDriveRuntime();
      const token = await requestGoogleDriveToken({ loginHint: resolvedConnectionUser?.email || "" });
      if (operationEpoch !== driveOperationEpochRef.current) return null;
      driveTokenRef.current = token;
      const result = await refreshGoogleDrive(
        token.accessToken,
        ownerChanged ? "" : driveSettings.folderId,
        { resetLinks: ownerChanged, connectionUser: resolvedConnectionUser },
      );
      if (result && !isOnboarding) announce("Google Drive 已連結；尚未主動儲存前不會上傳畫布。", "success");
      return result;
    } catch (error) {
      if (operationEpoch !== driveOperationEpochRef.current) return null;
      const authorizationRequired = isGoogleDriveAuthorizationError(error);
      if (authorizationRequired) driveTokenRef.current = null;
      setDriveSession((current) => ({
        ...current,
        status: authorizationRequired ? "authorization-required" : error?.code === "drive/offline" ? "offline" : "error",
        connected: false,
        busy: false,
        message: driveErrorMessage(error),
      }));
      announce(driveErrorMessage(error), "error");
      return null;
    }
  }, [announce, authReady, authSession.user, driveOnboardingIntent, driveSettings.connectionOwnerUid, driveSettings.folderId, refreshGoogleDrive]);

  const disconnectGoogleDrive = useCallback(() => {
    cancelDriveOperations();
    driveTokenRef.current = null;
    driveRestoreAttemptRef.current = "";
    window.clearTimeout(driveSyncTimerRef.current);
    updateDriveSettings((current) => ({ ...current, enabled: false }));
    setDriveSession({
      status: "disconnected",
      connected: false,
      busy: false,
      message: "Drive 檔案仍保留在你的帳號中。",
      user: null,
      quota: null,
      files: [],
      conflict: null,
      lastSyncedAt: "",
    });
    announce("已中斷這個分頁的 Google Drive；雲端檔案、本機畫布與 PETFASHION 登入都未受影響。", "success");
  }, [announce, cancelDriveOperations, updateDriveSettings]);

  useEffect(() => {
    const driveConnectionReady = driveSession.connected
      && !driveSession.busy
      && ["ready", "synced", "synced-local-warning"].includes(driveSession.status);
    const driveConflictNeedsDecision = driveSession.connected
      && !driveSession.busy
      && driveSession.status === "conflict";
    if (driveOnboardingIntent && driveConflictNeedsDecision) {
      setPendingAdvancedFeature(null);
      setShowStorageLocation(false);
      setShowDriveLibrary(true);
      setAuthMessage("");
      return;
    }
    if (!driveOnboardingIntent || !driveConnectionReady) return;
    const intentIsCurrent = isCurrentStorageTargetOperation({
      expectedEpoch: driveOnboardingIntent.operationEpoch,
      currentEpoch: storageTargetOperationEpochRef.current,
      expectedBoardId: driveOnboardingIntent.boardId,
      currentBoardId: boardRef.current.id,
    });
    if (!intentIsCurrent) {
      setDriveOnboardingIntent(null);
      return;
    }
    setBoardPrimaryStorage(driveOnboardingIntent.boardId, "drive");
    setDriveOnboardingIntent(null);
    setPendingAdvancedFeature(null);
    setShowStorageLocation(false);
    setShowDriveLibrary(false);
    setShowSettings(false);
    setAuthMessage("");
    const completedBySync = ["synced", "synced-local-warning"].includes(driveSession.status);
    setSaveState(completedBySync ? "已儲存至 Google Drive" : "Google Drive 已連結；第一次儲存前不會上傳");
    announce(completedBySync
      ? "Drive 版本已處理完成；已回到工作畫面。"
      : "Google Drive 已連結；已回到工作畫面。第一次儲存前不會上傳，且本機安全副本會持續保留。", "success");
  }, [announce, driveOnboardingIntent, driveSession.busy, driveSession.connected, driveSession.status, setBoardPrimaryStorage]);

  const closeDriveLibrary = useCallback(() => {
    setShowDriveLibrary(false);
    cancelDriveRead();
    if (!driveOnboardingIntent) return;
    storageTargetOperationEpochRef.current += 1;
    cancelDriveOperations();
    setDriveOnboardingIntent(null);
    if (pendingAdvancedFeature === "drive-onboarding") setPendingAdvancedFeature(null);
    setSaveState("Google Drive 尚未設為主要位置；本機安全副本持續保留");
  }, [cancelDriveOperations, cancelDriveRead, driveOnboardingIntent, pendingAdvancedFeature]);

  useEffect(() => {
    if (!driveSettings.enabled || currentDriveAccessToken()) return undefined;
    if (!online) {
      setDriveSession((current) => ({
        ...current,
        status: "offline",
        connected: false,
        busy: false,
        message: "Drive 檔案連結仍已保留；回復網路後會再嘗試恢復授權。",
      }));
      return undefined;
    }
    if (!authReady) {
      if (authSession.status !== "loading") {
        setDriveSession((current) => ({
          ...current,
          status: "authorization-required",
          connected: false,
          busy: false,
          message: "Drive 檔案連結仍已保留；登入後可恢復同步。",
        }));
      }
      return undefined;
    }
    const connectionOwnerUid = String(authSession.user?.uid || "");
    if (!connectionOwnerUid) {
      setDriveSession((current) => ({
        ...current,
        status: "authorization-required",
        connected: false,
        busy: false,
        message: "Drive 檔案連結仍已保留；請重新登入後恢復同步。",
      }));
      return undefined;
    }
    if (driveSettings.connectionOwnerUid && driveSettings.connectionOwnerUid !== connectionOwnerUid) {
      setDriveSession((current) => ({
        ...current,
        status: "authorization-required",
        connected: false,
        busy: false,
        message: "這台裝置的 Drive 連結屬於另一個 PETFASHION 帳號；請手動重新連結。",
      }));
      return undefined;
    }

    const attemptKey = `${connectionOwnerUid}:${driveSettings.connectionOwnerUid || "legacy"}`;
    if (driveRestoreAttemptRef.current === attemptKey) return undefined;
    driveRestoreAttemptRef.current = attemptKey;
    const operationEpoch = driveOperationEpochRef.current;
    let active = true;
    setDriveSession((current) => ({
      ...current,
      status: "checking",
      connected: false,
      busy: true,
      message: "正在恢復 Google Drive 連線…",
    }));

    const restoreDriveConnection = async () => {
      try {
        const { requestGoogleDriveToken } = await loadDriveRuntime();
        const token = await requestGoogleDriveToken({
          loginHint: authSession.user?.email || driveSettings.connectionEmail || "",
          prompt: "none",
          timeoutMs: 8_000,
        });
        if (!active || operationEpoch !== driveOperationEpochRef.current) return;
        driveTokenRef.current = token;
        await refreshGoogleDrive(token.accessToken, driveSettings.folderId);
      } catch (error) {
        if (!active || operationEpoch !== driveOperationEpochRef.current) return;
        const authorizationRequired = isGoogleDriveAuthorizationError(error);
        if (authorizationRequired) driveTokenRef.current = null;
        setDriveSession((current) => ({
          ...current,
          status: authorizationRequired ? "authorization-required" : error?.code === "drive/offline" ? "offline" : "error",
          connected: false,
          busy: false,
          message: authorizationRequired
            ? "無法在背景恢復 Google Drive；點一下重新連結，本機變更仍安全保留。"
            : driveErrorMessage(error),
        }));
      }
    };
    restoreDriveConnection();
    return () => {
      active = false;
      if (driveRestoreAttemptRef.current === attemptKey) driveRestoreAttemptRef.current = "";
    };
  }, [
    authReady,
    authSession.status,
    authSession.user?.email,
    authSession.user?.uid,
    currentDriveAccessToken,
    driveSettings.connectionEmail,
    driveSettings.connectionOwnerUid,
    driveSettings.enabled,
    driveSettings.folderId,
    online,
    refreshGoogleDrive,
  ]);

  const setDriveAutoSync = useCallback((enabled) => {
    updateDriveSettings((current) => ({ ...current, autoSync: Boolean(enabled) }));
    announce(enabled ? "已開啟 Google Drive 自動同步。" : "已關閉自動同步；仍可隨時手動同步。", "success");
  }, [announce, updateDriveSettings]);

  const completeAdvancedFeature = useCallback((feature) => {
    if (feature === "collaboration" || feature === "shared-moodboard") {
      if (feature === "collaboration") { sharingCurrentBoardRef.current = true; setDriveSharing(EMPTY_DRIVE_SHARING); }
      setShowLocalFileLocation(false);
      setShowStorageLocation(false);
      setShowCollaboration(true);
      return;
    }
    if (feature === "drive") {
      setShowDriveLibrary(true);
      return;
    }
    if (feature === "drive-onboarding") return;
    if (feature === "3d") {
      if (selectedIdsRef.current.length) setTool("3d");
      else announce("請先選取要進行 3D 操作的物件。", "warning");
    }
  }, [announce]);

  const requestAdvancedFeature = useCallback((feature) => {
    if (authReady) {
      completeAdvancedFeature(feature);
      return;
    }
    setAuthMessage("");
    setPendingAdvancedFeature(feature);
  }, [authReady, completeAdvancedFeature]);

  const openGoogleDriveLibrary = useCallback(() => {
    setShowDriveLibrary(true);
    refreshLocalLibrarySummary();
    const accessToken = currentDriveAccessToken();
    if (accessToken) refreshGoogleDrive(accessToken);
  }, [currentDriveAccessToken, refreshGoogleDrive, refreshLocalLibrarySummary]);

  const closeAdvancedFeatureGate = useCallback(() => {
    if (authBusy) return;
    if (pendingAdvancedFeature === "drive-onboarding") setDriveOnboardingIntent(null);
    setPendingAdvancedFeature(null);
    setAuthMessage("");
  }, [authBusy, pendingAdvancedFeature]);

  useEffect(() => {
    if (!authReady || !pendingAdvancedFeature) return;
    const feature = pendingAdvancedFeature;
    if (feature === "drive-onboarding") return;
    setPendingAdvancedFeature(null);
    completeAdvancedFeature(feature);
  }, [authReady, completeAdvancedFeature, pendingAdvancedFeature]);

  const acceptMoodboardAccess = useCallback(async ({ marketingOptIn = false } = {}) => {
    if (!authSession.user) return;
    try {
      const receipt = saveMoodboardAccessConsent(localStorage, authSession.user, {
        feature: pendingAdvancedFeature,
        marketingOptIn,
        rememberSession: false,
      });
      setAuthReceipt(receipt);
      setAuthConsentGranted(true);
      setAuthMessage("");
      if (pendingAdvancedFeature === "drive-onboarding") {
        setAuthBusy(true);
        setAuthMessage("帳號登入完成，正在連結 Google Drive…");
        const result = await connectGoogleDrive({
          allowIdentitySession: true,
          connectionUser: authSession.user,
          onboarding: true,
        });
        if (!result) setAuthMessage("帳號已登入，但 Google Drive 尚未連結。請重試；本機內容仍安全保留。");
      } else {
        announce("帳號授權完成；工作檔仍保存在這台裝置。", "success");
      }
    } catch (error) {
      setAuthMessage(error.message || "無法保存帳號授權，請再試一次。");
    } finally {
      setAuthBusy(false);
    }
  }, [announce, authSession.user, connectGoogleDrive, pendingAdvancedFeature]);

  const signInToMoodboard = useCallback(async ({ marketingOptIn = false, rememberSession = false } = {}) => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const isDriveOnboarding = pendingAdvancedFeature === "drive-onboarding";
      const { user, isNewUser, oauthAccessToken } = await signInMoodboardWithGoogle(interfaceLocale, {
        rememberSession,
        additionalScopes: isDriveOnboarding ? [GOOGLE_DRIVE_SCOPE] : [],
      });
      if (!isMoodboardIdentityEligible(user)) {
        const identityError = new Error("登入身份尚未通過驗證。");
        identityError.code = user?.emailVerified === false ? "auth/unverified-email" : "auth/provider-not-allowed";
        throw identityError;
      }
      const receipt = saveMoodboardAccessConsent(localStorage, user, {
        feature: pendingAdvancedFeature,
        isNewUser,
        marketingOptIn,
        rememberSession,
      });
      setAuthSession({ status: "signed-in", user, error: null });
      setAuthReceipt(receipt);
      setAuthConsentGranted(true);
      if (isDriveOnboarding) {
        setAuthMessage("Google 登入完成，正在確認 Drive 權限…");
        const token = googleDriveTokenFromOAuthAccessToken(oauthAccessToken);
        let driveResult = null;
        if (token) {
          const connectionOwnerUid = String(user.uid || "");
          const ownerChanged = Boolean(
            driveSettings.connectionOwnerUid
            && connectionOwnerUid
            && driveSettings.connectionOwnerUid !== connectionOwnerUid
          );
          driveTokenRef.current = token;
          driveResult = await refreshGoogleDrive(
            token.accessToken,
            ownerChanged ? "" : driveSettings.folderId,
            { resetLinks: ownerChanged, connectionUser: user },
          );
        } else {
          driveResult = await connectGoogleDrive({
            allowIdentitySession: true,
            connectionUser: user,
            onboarding: true,
          });
        }
        if (!driveResult) setAuthMessage("Google 帳號已登入，但 Drive 尚未連結。請重試；本機內容仍安全保留。");
      } else {
        announce("已使用 PETFASHION 帳號登入；本機作品保持不變。", "success");
      }
    } catch (error) {
      setAuthMessage(moodboardAuthErrorMessage(error, navigator.onLine !== false));
    } finally {
      setAuthBusy(false);
    }
  }, [announce, connectGoogleDrive, driveSettings.connectionOwnerUid, driveSettings.folderId, interfaceLocale, pendingAdvancedFeature, refreshGoogleDrive]);

  const sendEmailLinkToMoodboard = useCallback(async ({
    email,
    marketingOptIn = false,
    rememberSession = false,
    accepted = false,
  } = {}) => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      return await sendMoodboardEmailSignInLink(email, interfaceLocale, {
        feature: pendingAdvancedFeature,
        marketingOptIn,
        rememberSession,
        accepted,
      });
    } catch (error) {
      setAuthMessage(moodboardAuthErrorMessage(error, navigator.onLine !== false));
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, [interfaceLocale, pendingAdvancedFeature]);

  const completeEmailLinkToMoodboard = useCallback(async ({
    email,
    href = window.location.href,
    marketingOptIn = false,
    rememberSession = false,
    accepted = false,
  } = {}) => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const context = emailActionContextFromUrl(href);
      const result = await completeMoodboardEmailSignInLink(email, href);
      const preferences = result.pending || { marketingOptIn, rememberSession, accepted, feature: context.feature };
      if (!isMoodboardIdentityEligible(result.user)) {
        const identityError = new Error("登入身份尚未通過驗證。");
        identityError.code = result.user?.emailVerified === false ? "auth/unverified-email" : "auth/provider-not-allowed";
        throw identityError;
      }

      let receipt = getMoodboardAccessReceipt(localStorage, result.user.uid);
      if (preferences.accepted === true && result.mode === "sign-in") {
        receipt = saveMoodboardAccessConsent(localStorage, result.user, {
          feature: preferences.feature || context.feature,
          isNewUser: result.isNewUser,
          marketingOptIn: preferences.marketingOptIn,
          rememberSession: preferences.rememberSession,
        });
      }

      setAuthSession({ status: "signed-in", user: result.user, error: null });
      setAuthReceipt(receipt);
      setAuthConsentGranted(Boolean(receipt));
      setEmailLinkFlow({ status: "idle", href: "", context: null });
      window.history.replaceState(window.history.state, "", cleanMoodboardEmailActionUrl(href));

      if (result.mode === "link") {
        setAccountLinkMessage({ tone: "success", text: "Email 驗證登入已連結到同一個 PETFASHION 帳號。" });
        setSettingsInitialSection("account");
        setShowSettings(true);
      } else {
        announce("Email 驗證完成；本機作品保持不變。", "success");
      }
      return result;
    } catch (error) {
      setAuthMessage(moodboardAuthErrorMessage(error, navigator.onLine !== false));
      setEmailLinkFlow((current) => ({ ...current, status: "needs-email", href }));
      return null;
    } finally {
      setAuthBusy(false);
    }
  }, [announce]);

  useEffect(() => {
    if (authPreviewUserRef.current || emailLinkHandledRef.current) return undefined;
    let active = true;
    const inspectEmailLink = async () => {
      const href = window.location.href;
      try {
        if (!(await isMoodboardEmailSignInLink(href)) || !active) return;
        emailLinkHandledRef.current = true;
        const context = emailActionContextFromUrl(href);
        const pending = pendingMoodboardEmailSignIn();
        setPendingAdvancedFeature(pending?.feature || context.feature);
        if (!pending?.email) {
          setEmailLinkFlow({ status: "needs-email", href, context });
          return;
        }
        setEmailLinkFlow({ status: "completing", href, context });
        const result = await completeEmailLinkToMoodboard({ email: pending.email, href });
        if (!result && active) setEmailLinkFlow({ status: "needs-email", href, context });
      } catch (error) {
        if (!active) return;
        setAuthMessage(moodboardAuthErrorMessage(error, navigator.onLine !== false));
      }
    };
    inspectEmailLink();
    return () => { active = false; };
  }, [completeEmailLinkToMoodboard]);

  const linkEmailToMoodboardAccount = useCallback(async () => {
    if (!authSession.user?.email) return;
    setAuthBusy(true);
    setAccountLinkMessage(null);
    try {
      const result = await sendMoodboardEmailSignInLink(authSession.user.email, interfaceLocale, {
        feature: "account",
        mode: "link",
        accepted: true,
        rememberSession: authReceipt?.authPersistence === "local",
      });
      setAccountLinkMessage({ tone: "success", text: `驗證連結已寄到 ${result.maskedEmail}；請在一小時內用同一瀏覽器完成。` });
    } catch (error) {
      setAccountLinkMessage({ tone: "error", text: moodboardAuthErrorMessage(error, navigator.onLine !== false) });
    } finally {
      setAuthBusy(false);
    }
  }, [authReceipt?.authPersistence, authSession.user?.email, interfaceLocale]);

  const linkGoogleToMoodboardAccount = useCallback(async () => {
    setAuthBusy(true);
    setAccountLinkMessage(null);
    try {
      const result = await linkMoodboardGoogle(interfaceLocale);
      setAuthSession({ status: "signed-in", user: result.user, error: null });
      setAccountLinkMessage({ tone: "success", text: result.alreadyLinked ? "Google 已連結目前帳號。" : "Google 已連結到同一個 PETFASHION 帳號。" });
    } catch (error) {
      setAccountLinkMessage({ tone: "error", text: moodboardAuthErrorMessage(error, navigator.onLine !== false) });
    } finally {
      setAuthBusy(false);
    }
  }, [interfaceLocale]);

  const linkFacebookToMoodboardAccount = useCallback(async () => {
    setAuthBusy(true);
    setAccountLinkMessage(null);
    try {
      const result = await linkMoodboardFacebook(interfaceLocale);
      setAuthSession({ status: "signed-in", user: result.user, error: null });
      setAccountLinkMessage({ tone: "success", text: result.alreadyLinked ? "Facebook 已連結目前帳號。" : "Facebook 已連結到同一個 PETFASHION 帳號。" });
    } catch (error) {
      setAccountLinkMessage({ tone: "error", text: moodboardAuthErrorMessage(error, navigator.onLine !== false) });
    } finally {
      setAuthBusy(false);
    }
  }, [interfaceLocale]);

  const updateMoodboardMarketingPreference = useCallback((enabled) => {
    if (!authSession.user) return;
    try {
      const receipt = saveMoodboardMarketingPreference(localStorage, authSession.user, enabled);
      setAuthReceipt(receipt);
      announce(enabled ? "已在這台裝置記錄 Email 偏好；目前不會寄送。" : "已清除這台裝置的 Email 偏好。", "success");
    } catch (error) {
      announce(error.message || "無法更新消息偏好。", "warning");
    }
  }, [announce, authSession.user]);

  const signOutOfMoodboard = useCallback(async () => {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      setDriveSharing(EMPTY_DRIVE_SHARING);
      cancelDriveOperations();
      driveTokenRef.current = null;
      driveRestoreAttemptRef.current = "";
      window.clearTimeout(driveSyncTimerRef.current);
      if (!authPreviewUserRef.current) await signOutMoodboardSession();
      setAuthSession({ status: "signed-out", user: null, error: null });
      setAuthReceipt(null);
      setAuthConsentGranted(false);
      storageTargetOperationEpochRef.current += 1;
      setDriveOnboardingIntent(null);
      setPendingAdvancedFeature(null);
      setShowCollaboration(false);
      setShowDriveLibrary(false);
      setDriveSession((current) => ({ ...current, status: driveSettings.enabled ? "authorization-required" : "disconnected", connected: false, busy: false, message: driveSettings.enabled ? "再次登入並連結 Drive 後可繼續同步。" : "", user: null, quota: null, files: [], conflict: null }));
      setTool("select");
      setShowSettings(false);
      setShowInterfaceThemes(false);
      announce("已登出；這台裝置上的工作檔沒有被刪除。", "success");
    } catch (error) {
      setAuthMessage(moodboardAuthErrorMessage(error, navigator.onLine !== false));
    } finally {
      setAuthBusy(false);
    }
  }, [announce, cancelDriveOperations, driveSettings.enabled]);

  const clearMoodboardFromThisDevice = useCallback(async () => {
    setIsClearingLocalData(true);
    cancelDriveOperations();
    localPersistenceGenerationRef.current += 1;
    window.clearTimeout(saveTimerRef.current);
    window.clearTimeout(driveSyncTimerRef.current);
    try {
      await localSavePromiseRef.current.catch(() => undefined);
      await clearLocalMoodboardData();
      setDriveSharing(EMPTY_DRIVE_SHARING);
      driveTokenRef.current = null;
      driveRestoreAttemptRef.current = "";
      const clearedDriveState = saveDriveState(localStorage, {});
      setDriveSettings(clearedDriveState);
      const clearedStoragePreferences = saveStoragePreferences(localStorage, {});
      setStoragePreferences(clearedStoragePreferences);
      setDriveSession({ status: "disconnected", connected: false, busy: false, message: "", user: null, quota: null, files: [], conflict: null, lastSyncedAt: "" });
      const freshBoard = createBoard({ name: localizedDefaultBoardName(interfaceLocale) });
      initialBoardRef.current = freshBoard;
      boardRef.current = freshBoard;
      viewRef.current = freshBoard.view;
      selectedIdsRef.current = [];
      fileHandleRef.current = null;
      localFileSavePromiseRef.current = Promise.resolve();
      localFilePromptDismissedRef.current.clear();
      undoRef.current = [];
      redoRef.current = [];
      setBoard(freshBoard);
      setView(freshBoard.view);
      setSelectedIds([]);
      setKeyObjectId(null);
      setVersions([]);
      setDirty(false);
      setSaveState("已建立空白本機工作檔");
      setLocalFileBinding({ status: canUseFileSystemPicker ? "unlinked" : "unsupported", name: "" });
      setShowLocalFileLocation(false);
      setBoardPrimaryStorage(freshBoard.id, "pending");
      await refreshLocalLibrarySummary();
      setShowDeleteLocalData(false);
      announce("這台裝置上的工作檔、版本與 Drive 連結資料已清除；雲端檔案未刪除。", "success");
    } catch {
      announce("本機資料無法清除，請關閉其他 Infinite Studio 分頁後再試。", "error");
    } finally {
      setIsClearingLocalData(false);
    }
  }, [announce, canUseFileSystemPicker, cancelDriveOperations, interfaceLocale, refreshLocalLibrarySummary, setBoardPrimaryStorage]);

  const setCanvasBackgroundMode = useCallback((mode) => {
    setCanvasBackground((current) => changeCanvasBackgroundMode(current, mode));
    announce({ dots: "畫布背景已切換為格點。", lines: "畫布背景已切換為格線。", hidden: "畫布輔助背景已隱藏。" }[mode]);
  }, [announce]);

  const updateCanvasBackgroundAppearance = useCallback((patch) => {
    setCanvasBackground((current) => normalizeCanvasBackground({ ...current, ...patch }));
  }, []);

  const resetCanvasBackground = useCallback(() => {
    setCanvasBackground((current) => resetCanvasBackgroundAppearance(current));
    announce("格點與格線外觀已恢復預設。", "success");
  }, [announce]);

  const toggleCanvasBackground = useCallback(() => {
    const next = toggleCanvasBackgroundVisibility(canvasBackground);
    setCanvasBackground(next);
    announce(next.mode === "hidden"
      ? "畫布輔助背景已隱藏。"
      : `已重新顯示畫布${next.mode === "lines" ? "格線" : "格點"}。`);
  }, [announce, canvasBackground]);

  const updateInterfaceTypography = useCallback((nextValue) => {
    setInterfaceTypography((current) => normalizeInterfaceTypography(
      typeof nextValue === "function" ? nextValue(current) : nextValue,
    ));
  }, []);

  const resetInterfaceTypography = useCallback(() => {
    setInterfaceTypography({ ...DEFAULT_INTERFACE_TYPOGRAPHY });
    announce("已恢復預設介面字體。", "success");
  }, [announce]);

  const checkForAppUpdates = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    setUpdateCheck({ status: "checking", manifest: null, checkedAt: null, message: "" });
    try {
      const testVersion = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("updateVersion") : "";
      let manifest;
      if (testVersion) {
        manifest = normalizeUpdateManifest({
          version: testVersion,
          summary: "測試新版：驗證不中斷工作的更新流程。",
          url: window.location.href,
        });
      } else {
        const manifestUrl = new URL(APP_UPDATE_MANIFEST_URL, window.location.href);
        manifestUrl.searchParams.set("checked", String(Date.now()));
        const response = await fetch(manifestUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`更新服務回應 ${response.status}`);
        const normalizedManifest = normalizeUpdateManifest(await response.json());
        manifest = {
          ...normalizedManifest,
          notesUrl: resolveUpdateNotesUrl(normalizedManifest.notesUrl, manifestUrl),
        };
      }
      const comparison = compareSemanticVersions(APP_VERSION, manifest.version);
      const next = {
        status: comparison < 0 ? "available" : comparison > 0 ? "preview" : "current",
        manifest,
        checkedAt: new Date().toISOString(),
        message: "",
      };
      setUpdateCheck(next);
      setUpdateNoticeDismissed(next.status === "available" && isAppUpdateSnoozed(localStorage, manifest.version));
      if (next.status !== "available") setUpdateAction({ status: "idle", message: "" });
      return next;
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "連線逾時，請稍後重試。"
        : navigator.onLine === false
          ? "目前沒有網路連線；連線後即可重新檢查。"
          : "無法取得穩定版資訊，請稍後重試。";
      const next = { status: "error", manifest: null, checkedAt: new Date().toISOString(), message };
      setUpdateCheck(next);
      return next;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  const confirmInterfaceTheme = useCallback((themeId) => {
    const theme = [...BUILT_IN_THEMES, ...customThemes].find((item) => item.id === themeId);
    if (!theme) return;
    const themeMode = theme.id === DEFAULT_INTERFACE_THEME_ID ? resolvedInterfaceMode : interfaceThemeMode(theme);
    if (theme.id !== DEFAULT_INTERFACE_THEME_ID && themeMode !== resolvedInterfaceMode) {
      setInterfaceModePreference(themeMode);
    }
    setPreviewTheme(null);
    setActiveThemeId(theme.id);
    setShowInterfaceThemes(false);
    announce(`已套用介面配色「${theme.name}」。`, "success");
  }, [announce, customThemes, resolvedInterfaceMode]);

  const setInterfaceMode = useCallback((preference) => {
    const nextPreference = normalizeInterfaceMode(preference);
    const nextResolvedMode = resolveInterfaceMode(nextPreference, systemInterfaceMode === "dark");
    const theme = themeForResolvedMode(nextResolvedMode);
    if (!theme) return;
    setPreviewTheme(null);
    setInterfaceModePreference(nextPreference);
    setActiveThemeId(theme.id);
    announce(nextPreference === "system"
      ? `已切換為自動跟隨裝置；目前使用${nextResolvedMode === "dark" ? "深色" : "淺色"}模式。`
      : `已切換為${nextResolvedMode === "light" ? "淺色" : "深色"}模式。`, "success");
  }, [announce, systemInterfaceMode, themeForResolvedMode]);

  const saveCustomInterfaceTheme = useCallback((draft) => {
    const theme = normalizeInterfaceTheme({
      ...draft,
      id: createId("theme"),
      name: draft.name.trim(),
      builtin: false,
      createdAt: new Date().toISOString(),
    });
    setCustomThemes((current) => [...current, theme]);
    const themeMode = interfaceThemeMode(theme);
    if (themeMode !== resolvedInterfaceMode) setInterfaceModePreference(themeMode);
    setPreviewTheme(null);
    setActiveThemeId(theme.id);
    setShowInterfaceThemes(false);
    announce(`已儲存介面配色「${theme.name}」。`, "success");
  }, [announce, resolvedInterfaceMode]);

  const deleteCustomInterfaceTheme = useCallback((themeId) => {
    const theme = customThemes.find((item) => item.id === themeId);
    if (!theme) return;
    setCustomThemes((current) => current.filter((item) => item.id !== themeId));
    setPreviewTheme(null);
    if (activeThemeId === themeId) setActiveThemeId(DEFAULT_INTERFACE_THEME_ID);
    announce(`已刪除介面配色「${theme.name}」。`, "success");
  }, [activeThemeId, announce, customThemes]);

  const exportInterfaceTheme = useCallback((theme) => {
    const blob = new Blob([serializeInterfaceTheme(theme)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${safeFilename(theme.name)}.moodtheme`);
    announce(`已匯出介面配色「${theme.name}」。`, "success");
  }, [announce]);

  const importInterfaceThemeFile = useCallback(async (file) => {
    try {
      const imported = parseInterfaceThemeFile(await file.text());
      const theme = normalizeInterfaceTheme({
        ...imported,
        id: createId("theme"),
        builtin: false,
        createdAt: new Date().toISOString(),
      });
      setCustomThemes((current) => [...current, theme]);
      setPreviewTheme(theme);
      setShowInterfaceThemes(true);
      announce(`已匯入並預覽「${theme.name}」；按下套用才會儲存為目前配色。`, "success");
    } catch (error) {
      announce(error.message || "介面配色匯入失敗。", "error");
    }
  }, [announce]);

  const selectActiveObjectColorSet = useCallback((setId) => {
    setObjectColorSets((current) => selectObjectColorSet(current, setId));
  }, []);

  const addObjectColorToActiveSet = useCallback((color) => {
    const normalizedColor = normalizeObjectColor(color);
    if (!normalizedColor) {
      announce("這個色碼無法加入色彩組合。", "error");
      return;
    }
    const activeSet = activeObjectColorSet(objectColorSets);
    const existingCustom = activeSet.builtin
      ? objectColorSets.sets.find((set) => !set.builtin && set.name === "我的色彩")
      : activeSet;
    if (existingCustom?.colors.includes(normalizedColor)) {
      announce("這個色彩已經在目前的色彩組合中。", "success");
      return;
    }
    if (existingCustom && existingCustom.colors.length >= OBJECT_COLOR_LIBRARY_LIMIT) {
      announce(`這組色彩已達 ${OBJECT_COLOR_LIBRARY_LIMIT} 色上限。`, "warning");
      return;
    }
    const autoSetId = createId("color-set");
    setObjectColorSets((current) => {
      const currentSet = activeObjectColorSet(current);
      if (!currentSet.builtin) return addObjectColorToSet(current, currentSet.id, normalizedColor);
      const currentCustom = current.sets.find((set) => !set.builtin && set.name === "我的色彩");
      if (currentCustom) {
        return addObjectColorToSet(selectObjectColorSet(current, currentCustom.id), currentCustom.id, normalizedColor);
      }
      return createObjectColorSet(current, "我的色彩", [normalizedColor], autoSetId);
    });
    announce(activeSet.builtin && !existingCustom
      ? `已建立「我的色彩」並加入 ${normalizedColor}。`
      : `已將 ${normalizedColor} 加入「${existingCustom?.name || activeSet.name}」。`, "success");
  }, [announce, objectColorSets]);

  const createNamedObjectColorSet = useCallback((name) => {
    try {
      const next = createObjectColorSet(objectColorSets, name, [], createId("color-set"));
      setObjectColorSets(next);
      announce(`已建立色彩組合「${activeObjectColorSet(next).name}」。`, "success");
    } catch (error) {
      announce(error.message || "無法建立色彩組合。", "error");
    }
  }, [announce, objectColorSets]);

  const renameNamedObjectColorSet = useCallback((setId, name) => {
    const next = renameObjectColorSet(objectColorSets, setId, name);
    setObjectColorSets(next);
    const renamed = next.sets.find((set) => set.id === setId);
    announce(`已重新命名為「${renamed?.name || String(name).trim()}」。`, "success");
  }, [announce, objectColorSets]);

  const removeObjectColorFromNamedSet = useCallback((setId, color) => {
    setObjectColorSets((current) => removeObjectColorFromSet(current, setId, color));
    announce(`已從色彩組合移除 ${String(color).toUpperCase()}。`, "warning");
  }, [announce]);

  const deleteNamedObjectColorSet = useCallback((setId) => {
    const target = objectColorSets.sets.find((set) => set.id === setId);
    try {
      const next = deleteObjectColorSet(objectColorSets, setId);
      const message = interfaceLocale === "en"
        ? `Delete the global color set “${target?.name || "Untitled colors"}”? Existing objects will keep their colors.`
        : interfaceLocale === "zh-Hans"
          ? `删除全局色彩组合“${target?.name || "未命名色彩"}”？现有对象会保留当前颜色。`
          : `刪除全域色彩組合「${target?.name || "未命名色彩"}」？現有物件會保留目前色彩。`;
      if (!window.confirm(message)) return;
      setObjectColorSets(next);
      announce(`已刪除色彩組合「${target?.name || "未命名色彩"}」。`, "warning");
    } catch (error) {
      announce(error.message || "無法刪除色彩組合。", "error");
    }
  }, [announce, interfaceLocale, objectColorSets]);

  const exportObjectColorSets = useCallback(() => {
    const blob = new Blob([serializeObjectColorSets(objectColorSets)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, "Infinite-Moodboard-Color-Sets.moodcolors");
    const colorCount = objectColorSets.sets.reduce((total, set) => total + set.colors.length, 0);
    announce(`已匯出 ${objectColorSets.sets.length} 組、共 ${colorCount} 個色彩。`, "success");
  }, [announce, objectColorSets]);

  const importObjectColorSetsFile = useCallback(async (file) => {
    try {
      if (file.size > OBJECT_COLOR_SETS_FILE_SIZE_LIMIT) throw new Error("Color Set 檔案超過 128 KB 上限。");
      const imported = parseObjectColorSetsFile(await file.text());
      const preview = mergeImportedObjectColorSets(objectColorSets, imported);
      if (!preview.addedSetCount) {
        announce("Color Set 已達 24 組上限，沒有匯入任何組合。", "warning");
        return;
      }
      setObjectColorSets((current) => mergeImportedObjectColorSets(current, imported).state);
      announce(`已匯入 ${preview.addedSetCount} 組、共 ${preview.addedColorCount} 個色彩${preview.skippedSetCount ? `；另有 ${preview.skippedSetCount} 組因上限略過` : ""}。`, "success");
    } catch (error) {
      announce(error.message || "Color Set 匯入失敗。", "error");
    }
  }, [announce, objectColorSets]);

  const closeInterfaceThemes = useCallback(() => {
    setPreviewTheme(null);
    setShowInterfaceThemes(false);
  }, []);

  const closeAccountSettings = useCallback(() => setShowSettings(false), []);

  const openAccountSettings = useCallback(() => {
    setPreviewTheme(null);
    setShowInterfaceThemes(false);
    setSettingsInitialSection("account");
    setShowSettings(true);
  }, []);

  const openAboutSettings = useCallback(() => {
    setPreviewTheme(null);
    setShowInterfaceThemes(false);
    setSettingsInitialSection("about");
    setShowSettings(true);
  }, []);

  const openInterfaceThemes = useCallback(() => {
    setShowSettings(false);
    setPreviewTheme(null);
    setShowInterfaceThemes(true);
  }, []);

  useEffect(() => {
    if (!loadedTextFlow || tool === "select") return;
    setLoadedTextFlow(null);
    announce("已取消放置溢出文字。", "warning");
  }, [announce, loadedTextFlow, tool]);

  const publishBoard = useCallback((nextBoard) => {
    channelRef.current?.postMessage({
      type: "board-update",
      sourceId: sessionIdRef.current,
      board: { ...nextBoard, view: viewRef.current },
      sentAt: new Date().toISOString(),
    });
  }, []);

  const pushUndo = useCallback((snapshot = boardRef.current) => {
    undoRef.current = [...undoRef.current.slice(-59), { ...snapshot, view: { ...viewRef.current } }];
    redoRef.current = [];
    setHistorySignal((value) => value + 1);
  }, []);

  const captureGestureHistory = useCallback(() => ({
    undo: undoRef.current,
    redo: redoRef.current,
  }), []);

  const restoreGestureHistory = useCallback((snapshot) => {
    if (!snapshot) return;
    undoRef.current = snapshot.undo;
    redoRef.current = snapshot.redo;
    setHistorySignal((value) => value + 1);
  }, []);

  const applyBoard = useCallback((nextOrUpdater, options = {}) => {
    const current = boardRef.current;
    if (cloudReadOnly && !options.allowReadOnly) return current;
    const {
      record = true,
      transient = false,
      broadcast = !transient,
      markDirty = !transient,
    } = options;
    if (record) pushUndo(current);
    const proposed = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
    const next = transient ? proposed : stampBoard(proposed, sessionIdRef.current);
    boardRef.current = next;
    setBoard(next);
    if (markDirty) setDirty(true);
    if (broadcast) publishBoard(next);
    return next;
  }, [cloudReadOnly, publishBoard, pushUndo]);

  const finishAgentRequest = useCallback((approved) => {
    const pending = agentPendingRef.current;
    agentPendingRef.current = null;
    setAgentRequest(null);
    if (pending?.timer) clearTimeout(pending.timer);
    pending?.resolve(approved);
  }, []);

  const disconnectAgent = useCallback(() => {
    finishAgentRequest(false);
    agentSocketRef.current?.close();
    agentSocketRef.current = null;
    setAgentStatus("disconnected");
    setAgentAddress("");
    setAgentAutoEdit(true);
  }, [finishAgentRequest]);

  const closeAgent = useCallback(() => {
    if (agentStatus === "connecting") disconnectAgent();
    setShowAgent(false);
  }, [agentStatus, disconnectAgent]);

  useEffect(() => () => { disconnectAgent(); }, [board.id, disconnectAgent]);

  const connectAgent = useCallback(() => {
    if (agentSocketRef.current) return;
    setAgentError("");
    try {
      setAgentStatus("connecting");
      let socket;
      socket = connectCanvasAgent(agentAddress.trim(), {
        getBoard: () => boardRef.current,
        isReadOnly: () => cloudReadOnlyRef.current,
        approveEdit: (request) => {
          if (agentPendingRef.current || agentBlockingRef.current) throw new Error("請先關閉目前的對話框，再重新提出修改。");
          if (agentAutoEdit) return Promise.resolve(true);
          return new Promise((resolve) => {
            const timer = setTimeout(() => finishAgentRequest(false), 110000);
            agentPendingRef.current = { resolve, timer };
            setAgentRequest(request);
          });
        },
        applyEdit: (id, patch) => {
          const current = boardRef.current.objects.find((object) => object.id === id);
          if (!current || current.locked || cloudReadOnlyRef.current) throw new Error("目前沒有這個物件的編輯權限。");
          const next = applyBoard((boardValue) => ({ ...boardValue, objects: boardValue.objects.map((object) => object.id === id ? { ...object, ...patch, updatedAt: new Date().toISOString() } : object) }));
          return { id, revision: next.revision };
        },
        applyCreate: ({type, text, shapeKind, x, y}) => {
          if (cloudReadOnlyRef.current) throw new Error("目前沒有工作檔的編輯權限。");
          const object = type === "text" ? { ...createTextObject({x, y}), text } : createShapeObject(shapeKind, {x, y});
          const next = applyBoard((boardValue) => ({ ...boardValue, objects: [...boardValue.objects, object] }));
          selectedIdsRef.current = [object.id];
          setSelectedIds([object.id]);
          return { id: object.id, revision: next.revision };
        },
        onStatus: (status) => {
          if (agentSocketRef.current !== socket) return;
          setAgentStatus(status);
          if (status === "connected") { setAgentAddress(""); setShowAgent(false); announce(agentAutoEdit ? "已連接本機 AI；本次連線可自動修改畫布。" : "已連接本機 AI；修改須經確認。", "success"); }
          if (status === "error") setAgentError("無法連接本機 Agent。請確認它仍在執行、重新取得連線資訊，並檢查瀏覽器是否允許此網站連接本機網路。");
          if (status === "disconnected") { agentSocketRef.current = null; setAgentAutoEdit(true); finishAgentRequest(false); announce("本機 AI 已中斷連線。", "info"); }
        },
      });
      agentSocketRef.current = socket;
    } catch (error) {
      setAgentStatus("disconnected");
      setAgentError(error.message || "無法連接本機 Agent。");
    }
  }, [agentAddress, agentAutoEdit, announce, applyBoard, finishAgentRequest]);

  useLayoutEffect(() => {
    if (textFrameGesture || resizeGesture || groupGesture) return;
    const current = boardRef.current;
    const objects = reflowTextThreads(current.objects);
    if (objects === current.objects) return;
    applyBoard({ ...current, objects }, { record: false });
  }, [applyBoard, board.objects, groupGesture, resizeGesture, textFrameGesture]);

  const previewBoard = useCallback((next) => {
    if (cloudReadOnly) return boardRef.current;
    boardRef.current = next;
    setBoard(next);
    return next;
  }, [cloudReadOnly]);

  const finalizeGesture = useCallback(() => {
    applyBoard(boardRef.current, { record: false });
  }, [applyBoard]);

  const setSessionName = (value) => {
    setSessionNameState(value);
    localStorage.setItem("moodboard-session-name", value);
    channelRef.current?.postMessage({ type: "presence", sourceId: sessionIdRef.current, name: value, sentAt: Date.now() });
  };

  useEffect(() => {
    let cancelled = false;
    const hydrateWorkspace = async () => {
      try {
        const saved = await loadCurrentBoard();
        if (cancelled) return;
        if (saved) {
          const normalized = ensureBoard(saved);
          boardRef.current = normalized;
          setBoard(normalized);
          setView(normalized.view || { x: 0, y: 0, zoom: 1 });
          if (!storageTargetForBoard(initialStoragePreferencesRef.current, normalized.id) && initialStoragePreferencesRef.current.targets[normalized.id] !== "pending") {
            setBoardPrimaryStorage(normalized.id, initialDriveSettingsRef.current.links?.[normalized.id] ? "drive" : "local");
          }
          setSaveState("已從本機恢復");
        } else {
          setSaveState("本機自動儲存");
          setBoardPrimaryStorage(boardRef.current.id, "pending");
        }
      } catch {
        if (!cancelled) setSaveState("自動儲存不可用");
      } finally {
        await recoverInterruptedSyncJobs().catch(() => []);
        if (cancelled) return;
        setHydrated(true);
        refreshLocalLibrarySummary();
      }
    };
    hydrateWorkspace();
    return () => { cancelled = true; };
  }, [refreshLocalLibrarySummary, setBoardPrimaryStorage]);

  useEffect(() => {
    const markInteraction = () => { startupUserInteractedRef.current = true; };
    window.addEventListener("pointerdown", markInteraction, true);
    window.addEventListener("keydown", markInteraction, true);
    return () => {
      window.removeEventListener("pointerdown", markInteraction, true);
      window.removeEventListener("keydown", markInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !online) return undefined;
    const timer = window.setTimeout(() => { checkForAppUpdates(); }, 900);
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || updateApplyPromiseRef.current) return;
      const existing = updateCheckStateRef.current;
      if (existing.status !== "available") void checkForAppUpdates();
      else if (updateNoticeStateRef.current.dismissed && updateNoticeStateRef.current.preference !== "auto" && !isAppUpdateSnoozed(localStorage, existing.manifest?.version)) setUpdateNoticeDismissed(false);
    }, 15 * 60 * 1000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [checkForAppUpdates, hydrated, online]);

  useEffect(() => {
    if (!hydrated) return undefined;
    window.clearTimeout(saveTimerRef.current);
    setSaveState(storagePreferences.autoSave ? "儲存中…" : "正在更新本機復原副本…");
    const snapshot = { ...board, view };
    const primaryTarget = storageTargetForBoard(storagePreferences, snapshot.id);
    saveTimerRef.current = window.setTimeout(() => {
      persistBoardLocally(snapshot)
        .then(async () => {
          const link = driveSettings.links[snapshot.id];
          const localFileSaved = shouldWriteLocalAutosaveFile({
            autoSave: storagePreferences.autoSave,
            target: primaryTarget,
            status: localFileBinding.status,
            hasHandle: Boolean(fileHandleRef.current),
          })
            ? await writeBoardToBoundLocalFile(snapshot)
            : false;
          if (storagePreferences.autoSave && primaryTarget === "drive" && driveSettings.enabled && driveSettings.autoSync && link) {
            await enqueueSync(snapshot, { fileId: link.fileId, expectedVersion: link.version });
          }
          await refreshLocalLibrarySummary();
          const savedAt = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
          setSaveState(!storagePreferences.autoSave
            ? `本機復原副本已更新 · ${savedAt}；主要位置等待手動儲存`
            : primaryTarget === "local"
              ? localFileSaved
                ? `已自動儲存至 ${fileHandleRef.current?.name || ".studio 檔案"} · ${savedAt}`
                : localFileBinding.status === "browser-only" || localFileBinding.status === "unsupported"
                  ? `已自動儲存在這個瀏覽器 · ${savedAt}`
                  : `本機復原副本已更新 · ${savedAt}；等待選擇 .studio 檔案`
              : primaryTarget === "drive"
                ? `本機安全副本已更新 · ${savedAt}`
                : `安全暫存已更新 · ${savedAt}`);
          if (
            storagePreferences.autoSave
            && primaryTarget === "local"
            && (localFileSaved || localFileBinding.status === "browser-only" || localFileBinding.status === "unsupported")
            && boardRef.current.revision === snapshot.revision
            && boardRef.current.updatedAt === snapshot.updatedAt
          ) setDirty(false);
        })
        .catch((error) => {
          if (error?.name !== "AbortError") setSaveState("本機復原副本寫入失敗");
        });
    }, 550);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [board, driveSettings.autoSync, driveSettings.enabled, driveSettings.links, hydrated, localFileBinding.status, persistBoardLocally, refreshLocalLibrarySummary, storagePreferences, view, writeBoardToBoundLocalFile]);

  useEffect(() => {
    const flushRecoveryCopy = () => {
      if (!dirty) return;
      persistBoardLocally({ ...boardRef.current, view: viewRef.current }).catch(() => undefined);
    };
    const warnBeforeUnload = (event) => {
      if (!dirty || storagePreferences.autoSave) return;
      flushRecoveryCopy();
      event.preventDefault();
      event.returnValue = "";
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushRecoveryCopy();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [dirty, persistBoardLocally, storagePreferences.autoSave]);

  useEffect(() => {
    if (!authReady || !hydrated || !("BroadcastChannel" in window)) return undefined;
    const channel = new BroadcastChannel(`moodboard-lab:${board.id}`);
    channelRef.current = channel;

    const refreshPeers = () => {
      const cutoff = Date.now() - 30_000;
      for (const [id, peer] of peersRef.current) if (peer.seenAt < cutoff) peersRef.current.delete(id);
      setPeers([...peersRef.current.values()]);
    };
    const sendPresence = (type = "presence") => channel.postMessage({ type, sourceId: sessionIdRef.current, name: sessionName, sentAt: Date.now() });
    channel.onmessage = (event) => {
      const message = event.data;
      if (!message || message.sourceId === sessionIdRef.current) return;
      if (["hello", "presence"].includes(message.type)) {
        peersRef.current.set(message.sourceId, { id: message.sourceId, name: message.name || "協作者", seenAt: Date.now() });
        refreshPeers();
        if (message.type === "hello") sendPresence();
      }
      if (message.type === "bye") {
        peersRef.current.delete(message.sourceId);
        refreshPeers();
      }
      if (message.type === "board-update" && message.board) {
        try {
          const incoming = ensureBoard(message.board);
          const current = boardRef.current;
          const isNewer = incoming.revision > current.revision || (incoming.revision === current.revision && incoming.updatedAt > current.updatedAt);
          if (incoming.id === current.id && isNewer) {
            // A tab's revision counter is not a merge or proof that it includes
            // this tab's edits. Keep the incoming document separate for review.
            setPendingTabUpdate({ boardId: current.id, board: incoming });
            tabRecoveryQueueRef.current = tabRecoveryQueueRef.current.catch(() => undefined).then(async () => {
              await saveVersion(current, translateInterfaceText("另一分頁更新前"), "automatic", { slot: `tab-local-${sessionIdRef.current}` });
              await saveVersion(incoming, translateInterfaceText("另一分頁副本"), "automatic", { slot: `tab-incoming-${message.sourceId}` });
            }).catch(() => announce("分頁版本備份失敗；目前畫布未被取代，請先下載備份。", "warning"));
            announce("另一個分頁有更新；目前畫布已保留，可從版本紀錄開啟副本。", "info");
          }
        } catch {
          announce("收到無法辨識的協作更新，已保留目前畫布。", "warning");
        }
      }
    };
    sendPresence("hello");
    const heartbeat = window.setInterval(() => { sendPresence(); refreshPeers(); }, 10_000);
    return () => {
      sendPresence("bye");
      window.clearInterval(heartbeat);
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
      peersRef.current.clear();
      setPeers([]);
    };
  }, [announce, authReady, board.id, hydrated, sessionName]);

  const screenToWorld = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const currentView = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - currentView.x) / currentView.zoom,
      y: (clientY - rect.top - currentView.y) / currentView.zoom,
    };
  }, []);

  const commitGuideSelection = useCallback((ids) => {
    const selectable = new Set(boardRef.current.guidesLocked
      ? []
      : (boardRef.current.guides || []).filter((guide) => !guide.locked).map((guide) => guide.id));
    const next = [...new Set(ids || [])].filter((id) => selectable.has(id));
    selectedGuideIdsRef.current = next;
    setSelectedGuideIds(next);
    return next;
  }, []);

  const selectGuide = useCallback((guideId, additive = false, penetrate = false) => {
    const targetIds = selectionIdsForGuide(boardRef.current, guideId, { penetrate });
    if (!targetIds.length) return [];
    const current = selectedGuideIdsRef.current;
    const next = additive
      ? targetIds.every((id) => current.includes(id))
        ? current.filter((id) => !targetIds.includes(id))
        : [...new Set([...current, ...targetIds])]
      : targetIds;
    selectedIdsRef.current = [];
    setSelectedIds([]);
    setKeyObjectId(null);
    setTool("select");
    return commitGuideSelection(next);
  }, [commitGuideSelection]);

  const selectGuideGroup = useCallback((groupId, additive = false) => {
    const group = (boardRef.current.guideGroups || []).find((item) => item.id === groupId);
    if (!group || boardRef.current.guidesLocked) return;
    const selectable = group.memberIds.filter((id) => boardRef.current.guides.some((guide) => guide.id === id && !guide.locked));
    if (!selectable.length) return;
    const current = selectedGuideIdsRef.current;
    const next = additive
      ? selectable.every((id) => current.includes(id))
        ? current.filter((id) => !selectable.includes(id))
        : [...new Set([...current, ...selectable])]
      : selectable;
    selectedIdsRef.current = [];
    setSelectedIds([]);
    setKeyObjectId(null);
    setTool("select");
    commitGuideSelection(next);
  }, [commitGuideSelection]);

  const deleteGuides = useCallback((guideIds, explicit = false) => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；無法刪除輔助導引線。", "warning");
      return 0;
    }
    if (boardRef.current.guidesLocked) {
      announce("輔助導引線已鎖定；請先從「檔案」解除鎖定。", "info");
      return 0;
    }
    const requested = new Set(guideIds || []);
    const deletable = boardRef.current.guides.filter((guide) => requested.has(guide.id) && (explicit || !guide.locked));
    if (!deletable.length && [...requested].some((id) => boardRef.current.guides.some((guide) => guide.id === id && guide.locked))) {
      announce("此導引線已鎖定；按右鍵可解除鎖定或刪除。", "info");
      return 0;
    }
    if (!deletable.length) return 0;
    const deleting = new Set(deletable.map((guide) => guide.id));
    applyBoard((current) => compactBoardStructure({
      ...current,
      guides: current.guides.filter((guide) => !deleting.has(guide.id)),
    }));
    commitGuideSelection(selectedGuideIdsRef.current.filter((id) => !deleting.has(id)));
    setGuideDrag(null);
    announce(deletable.length === 1 ? "已刪除輔助導引線" : `已刪除 ${deletable.length} 條輔助導引線`, "warning");
    return deletable.length;
  }, [announce, applyBoard, cloudReadOnly, commitGuideSelection]);

  const deleteGuide = useCallback((guideId, explicit = false) => {
    deleteGuides([guideId], explicit);
  }, [deleteGuides]);

  const toggleGuideLocked = useCallback((guide) => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；無法變更輔助導引線狀態。", "warning");
      return;
    }
    if (boardRef.current.guidesLocked) {
      announce("所有輔助導引線已鎖定；請先從「檔案」解除鎖定。", "info");
      return;
    }
    const nextLocked = !Boolean(guide.locked);
    applyBoard((current) => ({
      ...current,
      guides: current.guides.map((item) => item.id === guide.id ? { ...item, locked: nextLocked } : item),
    }));
    if (nextLocked) commitGuideSelection(selectedGuideIdsRef.current.filter((id) => id !== guide.id));
    announce(nextLocked ? "已鎖定此輔助導引線" : "已解除鎖定此輔助導引線", "success");
  }, [announce, applyBoard, cloudReadOnly, commitGuideSelection]);

  const lockSelectedGuides = useCallback(() => {
    if (cloudReadOnly || boardRef.current.guidesLocked) return;
    const selected = new Set(selectedGuideIdsRef.current);
    if (!selected.size) return;
    applyBoard((current) => ({
      ...current,
      guides: current.guides.map((guide) => selected.has(guide.id) ? { ...guide, locked: true } : guide),
    }));
    commitGuideSelection([]);
    announce(`已鎖定 ${selected.size} 條輔助導引線`, "success");
  }, [announce, applyBoard, cloudReadOnly, commitGuideSelection]);

  const groupGuideSelection = useCallback(() => {
    if (cloudReadOnly || boardRef.current.guidesLocked) return;
    const ids = [...new Set(selectedGuideIdsRef.current)].filter((id) => boardRef.current.guides.some((guide) => guide.id === id && !guide.locked));
    if (ids.length < 2) {
      announce("至少選取 2 條未鎖定的導引線才能建立群組。", "warning");
      return;
    }
    const group = createGuideGroup(ids, {
      name: `導引線群組 ${String((boardRef.current.guideGroups?.length || 0) + 1).padStart(2, "0")}`,
    });
    applyBoard((current) => compactBoardStructure({
      ...current,
      guideGroups: [
        ...(current.guideGroups || []).map((item) => ({ ...item, memberIds: item.memberIds.filter((id) => !ids.includes(id)) })),
        group,
      ],
      guides: current.guides.map((guide) => ids.includes(guide.id) ? { ...guide, groupId: group.id } : guide),
    }));
    announce(`已將 ${ids.length} 條導引線建立為群組`, "success");
  }, [announce, applyBoard, cloudReadOnly]);

  const ungroupGuideSelection = useCallback((explicitGroupId = null) => {
    if (cloudReadOnly || boardRef.current.guidesLocked) return;
    const selected = new Set(selectedGuideIdsRef.current);
    const groupIds = explicitGroupId
      ? [explicitGroupId]
      : (boardRef.current.guideGroups || [])
        .filter((group) => group.memberIds.some((id) => selected.has(id)))
        .map((group) => group.id);
    if (!groupIds.length) {
      announce("目前選取沒有可解散的導引線群組。", "warning");
      return;
    }
    const targets = new Set(groupIds);
    applyBoard((current) => compactBoardStructure({
      ...current,
      guideGroups: (current.guideGroups || []).filter((group) => !targets.has(group.id)),
      guides: current.guides.map((guide) => targets.has(guide.groupId) ? { ...guide, groupId: null } : guide),
    }));
    announce(`已解散 ${groupIds.length} 個導引線群組`, "success");
  }, [announce, applyBoard, cloudReadOnly]);

  const toggleGuideSelectionGroup = useCallback(() => {
    const selected = selectedGuideIdsRef.current;
    const shared = (boardRef.current.guideGroups || []).find((group) => (
      selected.length === group.memberIds.length && group.memberIds.every((id) => selected.includes(id))
    ));
    if (shared) ungroupGuideSelection(shared.id);
    else groupGuideSelection();
  }, [groupGuideSelection, ungroupGuideSelection]);

  const toggleGuidesLocked = useCallback(() => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；無法變更輔助導引線狀態。", "warning");
      return;
    }
    const nextLocked = !Boolean(boardRef.current.guidesLocked);
    setGuideDrag(null);
    if (nextLocked) commitGuideSelection([]);
    applyBoard((current) => ({ ...current, guidesLocked: nextLocked }));
    announce(nextLocked ? "已鎖定所有輔助導引線" : "已解除鎖定所有輔助導引線", "success");
  }, [announce, applyBoard, cloudReadOnly, commitGuideSelection]);

  const setRulerOrigin = useCallback((nextOrigin) => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；無法變更尺規原點。", "warning");
      return;
    }
    const x = Number(nextOrigin?.x);
    const y = Number(nextOrigin?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    applyBoard((current) => ({ ...current, rulerOrigin: { x, y } }));
    announce("已重新設定尺規與導引線原點", "success");
  }, [announce, applyBoard, cloudReadOnly]);

  const startGuideDrag = useCallback((event, axis, guideId = null) => {
    if (cloudReadOnly) return;
    if (event.button !== 0) return;
    if (boardRef.current.guidesLocked) {
      event.preventDefault();
      event.stopPropagation();
      announce("輔助導引線已鎖定；請先從「檔案」解除鎖定。", "info");
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const existing = boardRef.current.guides.find((guide) => guide.id === guideId);
    if (existing?.locked) {
      announce("此導引線已鎖定；按右鍵可解除鎖定或刪除。", "info");
      return;
    }
    const id = existing?.id || createId("guide");
    const guideAxis = existing?.axis || axis;
    const currentSelection = [...selectedGuideIdsRef.current];
    const targetIds = existing
      ? selectionIdsForGuide(boardRef.current, existing.id, { penetrate: event.metaKey || event.ctrlKey })
      : [id];
    const clickWouldToggleOff = Boolean(existing && event.shiftKey && targetIds.every((targetId) => currentSelection.includes(targetId)));
    const activeSelection = existing
      ? event.shiftKey
        ? clickWouldToggleOff
          ? currentSelection
          : [...new Set([...currentSelection, ...targetIds])]
        : currentSelection.includes(existing.id)
          ? currentSelection
          : targetIds
      : [id];
    selectedIdsRef.current = [];
    setSelectedIds([]);
    setKeyObjectId(null);
    setTool("select");
    if (existing) {
      commitGuideSelection(activeSelection);
    }
    const baselines = existing
      ? boardRef.current.guides
        .filter((guide) => activeSelection.includes(guide.id) && guide.axis === guideAxis && !guide.locked)
        .map((guide) => ({ id: guide.id, axis: guide.axis, position: guide.position, locked: false, groupId: guide.groupId || null }))
      : [{ id, axis: guideAxis, position: 0, locked: false, groupId: null }];
    const primaryStartPosition = existing?.position || 0;
    let latest = existing || { id, axis: guideAxis, position: 0, isNew: true, members: baselines };
    const pointerSnapshot = (pointerEvent) => ({
      clientX: Number(pointerEvent?.clientX) || 0,
      clientY: Number(pointerEvent?.clientY) || 0,
      shiftKey: Boolean(pointerEvent?.shiftKey),
    });
    let latestPointer = pointerSnapshot(event);
    let snapActive = Boolean(event.shiftKey);
    const startPointer = { x: latestPointer.clientX, y: latestPointer.clientY };
    let moved = false;
    let releaseGesture = () => {};
    setGuidesVisible(true);

    const update = () => {
      const currentView = viewRef.current;
      const viewOffset = guideAxis === "x" ? currentView.x : currentView.y;
      const origin = guideAxis === "x"
        ? Number(boardRef.current.rulerOrigin?.x) || 0
        : Number(boardRef.current.rulerOrigin?.y) || 0;
      const clientPosition = guideAxis === "x" ? latestPointer.clientX : latestPointer.clientY;
      const position = existing
        ? resolveDraggedGuidePosition({
          initialPosition: primaryStartPosition,
          startClientPosition: guideAxis === "x" ? startPointer.x : startPointer.y,
          clientPosition,
          zoom: currentView.zoom,
          unit: rulerUnit,
          snap: snapActive,
          origin,
        })
        : resolveGuidePosition({
          clientPosition,
          canvasStart: guideAxis === "x" ? rect.left : rect.top,
          viewOffset,
          zoom: currentView.zoom,
          unit: rulerUnit,
          snap: snapActive,
          origin,
        });
      const delta = existing ? position - primaryStartPosition : 0;
      const members = baselines.map((guide) => ({
        ...guide,
        position: existing ? guide.position + delta : position,
      }));
      latest = {
        id,
        axis: guideAxis,
        position,
        isNew: !existing,
        snapped: snapActive,
        members,
      };
      setGuideDrag(latest);
    };

    const move = (pointerEvent) => {
      latestPointer = pointerSnapshot(pointerEvent);
      if (!moved && Math.hypot(latestPointer.clientX - startPointer.x, latestPointer.clientY - startPointer.y) >= 3) moved = true;
      if (pointerEvent.shiftKey) snapActive = true;
      if (moved || !existing) update();
    };
    const keyDown = (keyEvent) => {
      if (keyEvent.key !== "Shift" || snapActive) return;
      snapActive = true;
      if (moved || !existing) update();
    };
    const keyUp = (keyEvent) => {
      if (keyEvent.key !== "Shift" || !snapActive) return;
      snapActive = false;
      if (moved || !existing) update();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp, true);
      releaseGesture();
    };
    const finish = (pointerEvent = latestPointer) => {
      if (Number.isFinite(pointerEvent?.clientX) && Number.isFinite(pointerEvent?.clientY)) latestPointer = pointerSnapshot(pointerEvent);
      if (pointerEvent?.shiftKey) snapActive = true;
      if (moved || !existing) update();
      cleanup();
      setGuideDrag(null);
      if (existing && !moved) {
        if (clickWouldToggleOff) commitGuideSelection(currentSelection.filter((selectedId) => !targetIds.includes(selectedId)));
        return;
      }
      const inside = latestPointer.clientX >= rect.left
        && latestPointer.clientX <= rect.right
        && latestPointer.clientY >= rect.top
        && latestPointer.clientY <= rect.bottom;
      const droppedOnOriginRuler = rulersVisible && (
        (guideAxis === "x" && latestPointer.clientX - rect.left <= RULER_SIZE)
        || (guideAxis === "y" && latestPointer.clientY - rect.top <= RULER_SIZE)
      );
      if (!inside) return;
      if (droppedOnOriginRuler) {
        if (existing) deleteGuide(id);
        return;
      }
      applyBoard((current) => ({
        ...current,
        guides: existing
          ? current.guides.map((guide) => {
            const preview = latest.members.find((member) => member.id === guide.id);
            return preview ? { ...guide, position: preview.position } : guide;
          })
          : [...current.guides, { id, axis: guideAxis, position: latest.position, locked: false, groupId: null }],
      }));
      if (!existing) commitGuideSelection([id]);
      const origin = guideAxis === "x"
        ? Number(boardRef.current.rulerOrigin?.x) || 0
        : Number(boardRef.current.rulerOrigin?.y) || 0;
      const movedCount = existing ? latest.members.length : 1;
      announce(`${existing && movedCount > 1 ? `已同時移動 ${movedCount} 條` : existing ? "已移動" : "已建立"}${guideAxis === "x" ? "垂直" : "水平"}導引線：${formatGuideValue(latest.position - origin, rulerUnit)}`, "success");
    };
    const cancel = () => {
      cleanup();
      setGuideDrag(null);
    };
    if (!existing) update();
    releaseGesture = registerPointerGesture({
      label: existing ? "移動導引線" : "建立導引線",
      affectsDocument: false,
      hasChanges: () => moved || !existing,
      pause: cleanup,
      cancel,
      keep: () => finish(latestPointer),
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
  }, [announce, applyBoard, cloudReadOnly, commitGuideSelection, deleteGuide, registerPointerGesture, rulerUnit, rulersVisible]);

  const selectObject = useCallback((id, additive = false, penetrate = false) => {
    if (loadedTextFlow) {
      setLoadedTextFlow(null);
      announce("已取消放置溢出文字。", "warning");
    }
    setTool((current) => current === "3d" ? current : "select");
    const current = selectedIdsRef.current;
    const targetIds = selectionIdsForObject(boardRef.current, id, { penetrate });
    if (!targetIds.length) return;
    if (!penetrate && !additive && targetIds.length === 1 && current.length > 1 && current.includes(id)) {
      setKeyObjectId(id);
      announce(`已將「${boardRef.current.objects.find((object) => object.id === id)?.layerName || "物件"}」設為對齊基準`, "success");
      return;
    }
    const next = additive
      ? (targetIds.every((targetId) => current.includes(targetId))
        ? current.filter((item) => !targetIds.includes(item))
        : [...new Set([...current, ...targetIds])])
      : targetIds;
    selectedIdsRef.current = next;
    setSelectedIds(next);
    if (!additive || !current.length) setKeyObjectId(next[0] || null);
  }, [announce, loadedTextFlow]);

  const selectLayerObjects = useCallback((ids, keyId = null) => {
    if (loadedTextFlow) {
      setLoadedTextFlow(null);
      announce("已取消放置溢出文字。", "warning");
    }
    setTool((current) => current === "3d" ? current : "select");
    const existing = new Set(boardRef.current.objects.map((object) => object.id));
    const next = [...new Set(ids)].filter((id) => existing.has(id));
    selectedIdsRef.current = next;
    setSelectedIds(next);
    setKeyObjectId(next.includes(keyId) ? keyId : next[0] || null);
  }, [announce, loadedTextFlow]);

  const addMediaFiles = useCallback(async (fileList, point) => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；請先申請編輯權限。", "warning");
      return false;
    }
    const files = [...fileList].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || isSvgFile(file));
    if (!files.length) {
      announce("沒有找到可加入的圖片、影片或 SVG。", "warning");
      return;
    }
    try {
      const objects = await Promise.all(files.map((file, index) => mediaFileToObject(file, point, index)));
      const next = applyBoard((current) => ({ ...current, objects: [...current.objects, ...objects] }));
      const nextSelection = objects.map((object) => object.id);
      selectedIdsRef.current = nextSelection;
      setSelectedIds(nextSelection);
      setKeyObjectId(nextSelection[0] || null);
      setTool("select");
      await saveVersion({ ...next, view: viewRef.current }, translateInterfaceText(`匯入 ${objects.length} 個素材`), "automatic");
      announce(`已加入 ${objects.length} 個素材`, "success");
    } catch (error) {
      announce(error.message || "素材加入失敗。", "error");
    }
  }, [announce, applyBoard, cloudReadOnly]);

  const canvasCenterWorld = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [screenToWorld]);

  const addGeneratedObject = useCallback((object, message) => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；請先申請編輯權限。", "warning");
      return false;
    }
    applyBoard((current) => ({ ...current, objects: [...current.objects, object] }));
    selectedIdsRef.current = [object.id];
    setSelectedIds([object.id]);
    setKeyObjectId(object.id);
    setTool("select");
    setShapeMenuOpen(false);
    announce(message, "success");
    return true;
  }, [announce, applyBoard, cloudReadOnly]);

  const addTextObject = useCallback(() => {
    const object = createTextObject(canvasCenterWorld());
    if (!addGeneratedObject(object, "已加入文字物件，可直接輸入文字")) return;
    textEditUndoRef.current = false;
    setEditingText({ id: object.id, selectAll: true });
  }, [addGeneratedObject, canvasCenterWorld]);

  const importTextDocument = useCallback(async (file, point) => {
    if (cloudReadOnly) { announce("目前為僅檢視；請先申請編輯權限。", "warning"); return; }
    const targetBoardId = boardRef.current.id;
    try {
      const { readTextDocument } = await import("./text-document.js");
      const text = await readTextDocument(file);
      if (boardRef.current.id !== targetBoardId) throw new Error("已切換檔案；請重新匯入文字文件。" );
      if (cloudReadOnlyRef.current) throw new Error("目前為僅檢視；請先申請編輯權限。" );
      const name = file.name.replace(/\.[^.]+$/, "") || "文字文件";
      const object = { ...createTextObject(point), name, layerName: name, originalFilename: file.name, text, fontSize: 18, originalFontSize: 18, width: 560, height: 400, originalWidth: 560, originalHeight: 400 };
      addGeneratedObject(object, `已匯入「${file.name}」；內容可編輯。`);
    } catch (error) { announce(error?.message || "無法匯入文字文件。", "error"); }
  }, [addGeneratedObject, announce, cloudReadOnly]);

  const addShapeObject = useCallback((kind) => {
    const object = createShapeObject(kind, canvasCenterWorld());
    addGeneratedObject(object, `已加入${object.name}`);
  }, [addGeneratedObject, canvasCenterWorld]);

  const onMediaInput = (event) => {
    addMediaFiles(event.target.files || [], canvasCenterWorld());
    event.target.value = "";
    setShapeMenuOpen(false);
  };

  const onSvgInput = (event) => {
    addMediaFiles(event.target.files || [], canvasCenterWorld());
    event.target.value = "";
    setShapeMenuOpen(false);
  };

  const importBoardFile = useCallback(async (file, handle = null, { shouldCommit = () => true, broadcast = true, onCommit = null, preserveView = false } = {}) => {
    try {
      const parsedBoard = parseBoardFile(await file.text(), file.name || "");
      const imported = !onCommit && loadDriveState(localStorage).links[parsedBoard.id]
        ? createRecoveredMoodboard(parsedBoard, { label: "本機副本" }) : parsedBoard;
      if (!shouldCommit()) return null;
      pushUndo(boardRef.current);
      boardRef.current = imported;
      setBoard(imported);
      setDirty(false);
      if (!preserveView) setView(imported.view || { x: 0, y: 0, zoom: 1 });
      setSelectedIds([]);
      setFilters(DEFAULT_FILTERS);
      setSelectedCaptureId(null);
      fileHandleRef.current = handle;
      if (handle) {
        await saveLocalFileHandle(imported.id, handle).catch(() => undefined);
        setLocalFileBinding({ status: "linked", name: String(handle.name || file.name || "") });
      } else {
        setLocalFileBinding(canUseFileSystemPicker ? { status: "unlinked", name: "" } : { status: "unsupported", name: "" });
      }
      if (onCommit) onCommit(imported);
      else setBoardPrimaryStorage(imported.id, "local");
      try {
        await persistBoardLocally(imported);
        if (boardRef.current === imported) setDirty(false);
      } catch (error) {
        if (boardRef.current === imported) setDirty(true);
        announce(error?.message || "檔案已開啟，但本機復原副本尚未建立。請立即儲存。", "warning");
        return imported;
      }
      if (broadcast && boardRef.current === imported) publishBoard(imported);
      if (!onCommit && boardRef.current === imported) announce(`已開啟「${imported.name}」`, "success");
      return imported;
    } catch (error) {
      announce(error.message || "Infinite Studio 檔案無法開啟。", "error");
      return null;
    }
  }, [announce, canUseFileSystemPicker, persistBoardLocally, publishBoard, pushUndo, setBoardPrimaryStorage]);

  const importLocalBoardFile = useCallback(async (file, handle = null) => {
    if (driveSavePromiseRef.current) { announce("正在儲存目前內容；完成後再開啟其他檔案。", "info"); return null; }
    cancelDriveOperations();
    const startingBoard = boardRef.current;
    const operationEpoch = driveOperationEpochRef.current;
    const shouldCommit = () => startingBoard === boardRef.current && operationEpoch === driveOperationEpochRef.current;
    const current = { ...boardRef.current, view: viewRef.current };
    try {
      await persistBoardLocally(current);
      if (dirty || current.objects.length) {
        await saveVersion(current, translateInterfaceText("切換工作檔前"), "automatic");
      }
    } catch (error) {
      announce(error?.message || "目前工作檔無法先建立復原副本，因此未開啟另一份檔案。", "error");
      return null;
    }
    if (!shouldCommit()) return null;
    return importBoardFile(file, handle, { shouldCommit });
  }, [announce, cancelDriveOperations, dirty, importBoardFile, persistBoardLocally]);

  const openBoardFile = useCallback(async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: "Infinite Studio 檔案", accept: { "application/json": [".studio", ".moodboard", ".json"] } }],
          multiple: false,
        });
        await importLocalBoardFile(await handle.getFile(), handle);
      } catch (error) {
        if (error.name !== "AbortError") announce("無法開啟檔案。", "error");
      }
    } else {
      boardInputRef.current?.click();
    }
  }, [announce, importLocalBoardFile]);

  const boardSnapshot = useCallback(() => ({ ...boardRef.current, view: viewRef.current }), []);

  const setAppAutoUpdate = useCallback((enabled) => {
    const next = saveUpdatePreference(localStorage, enabled ? "auto" : "manual");
    setUpdatePreference(next);
    if (enabled) {
      const availableVersion = updateCheck.status === "available" ? updateCheck.manifest?.version : "";
      autoUpdateDeferredVersionRef.current = availableVersion || "";
      setUpdateNoticeDismissed(true);
      setUpdateAction({ status: "scheduled", message: "已開啟安全自動更新；目前工作不中斷，下次安全開啟時套用。" });
      announce("已開啟安全自動更新；不會在編輯途中重新載入。", "success");
    } else {
      autoUpdateDeferredVersionRef.current = "";
      setUpdateNoticeDismissed(false);
      setUpdateAction({ status: "idle", message: "" });
      announce("已關閉自動更新；仍可在更新通知中選擇立即更新。", "success");
    }
  }, [announce, updateCheck.manifest?.version, updateCheck.status]);

  const snoozeCurrentAppUpdate = useCallback(() => {
    const version = updateCheck.status === "available" ? updateCheck.manifest?.version : "";
    if (!version) return;
    snoozeAppUpdate(localStorage, version);
    setUpdateNoticeDismissed(true);
    setUpdateAction({ status: "idle", message: "" });
    announce("已稍後處理更新；24 小時內不會再次提示。", "success");
  }, [announce, updateCheck.manifest?.version, updateCheck.status]);

  const applyAppUpdate = useCallback(({ automatic = false } = {}) => {
    if (updateApplyPromiseRef.current) return updateApplyPromiseRef.current;
    const manifest = updateCheck.status === "available" ? updateCheck.manifest : null;
    if (!manifest) return Promise.resolve(false);

    const task = (async () => {
      setUpdateNoticeDismissed(false);
      setUpdateAction({ status: "saving", message: automatic ? "正在安全保存並準備自動更新…" : "正在保存目前工作並建立更新前備份…" });
      window.clearTimeout(saveTimerRef.current);
      const snapshot = boardSnapshot();
      const assertUnchanged = () => assertUpdateSnapshotUnchanged(snapshot, boardRef.current, viewRef.current);
      if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("updateFailure") === "save") {
        throw new Error("測試：無法完成本機儲存");
      }
      await persistBoardLocally(snapshot);
      await saveVersion(snapshot, translateInterfaceText("更新前自動備份"), "automatic");
      assertUnchanged();
      if (!updateSavePrimaryRef.current || !(await updateSavePrimaryRef.current())) {
        throw new Error("尚未能儲存至主要位置，請先完成儲存後再更新");
      }
      assertUnchanged();
      setSaveState(`本機安全暫存已更新 ${new Date().toLocaleTimeString(interfaceLocaleToIntl(interfaceLocale), { hour: "2-digit", minute: "2-digit" })}`);
      setUpdateAction({ status: "reloading", message: `備份完成，正在載入 v${manifest.version}…` });
      writeSessionValue(APP_UPDATE_ATTEMPT_STORAGE_KEY, manifest.version);
      window.location.assign(buildUpdateReloadUrl(window.location.href, manifest.version));
      return true;
    })().catch((error) => {
      const message = error?.message
        ? `更新已停止：${error.message}。目前畫面與工作內容保持不變。`
        : "更新已停止；無法完成本機儲存或備份，目前畫面與工作內容保持不變。";
      setUpdateAction({ status: "error", message });
      return false;
    }).finally(() => {
      updateApplyPromiseRef.current = null;
    });
    updateApplyPromiseRef.current = task;
    return task;
  }, [boardSnapshot, interfaceLocale, persistBoardLocally, updateCheck.manifest, updateCheck.status]);

  useEffect(() => {
    const version = updateCheck.status === "available" ? updateCheck.manifest?.version : "";
    if (!hydrated || !version || updatePreference !== "auto" || updateNoticeDismissed) return;
    if (startupUserInteractedRef.current) return;
    if (autoUpdateDeferredVersionRef.current === version) return;
    if (readSessionValue(APP_UPDATE_ATTEMPT_STORAGE_KEY) === version) return;
    applyAppUpdate({ automatic: true });
  }, [applyAppUpdate, hydrated, updateCheck.manifest?.version, updateCheck.status, updateNoticeDismissed, updatePreference]);

  const activateLocalMoodboard = useCallback(async (nextBoard, message, { newBoard = false } = {}) => {
    if (driveSavePromiseRef.current) { announce("正在儲存目前內容；完成後再開啟其他檔案。", "info"); return null; }
    cancelDriveOperations();
    const startingBoard = boardRef.current;
    const operationEpoch = driveOperationEpochRef.current;
    const current = boardSnapshot();
    try {
      await persistBoardLocally(current);
      if (dirty || current.objects.length) {
        await saveVersion(current, translateInterfaceText("切換工作檔前"), "automatic");
      }
      if (boardRef.current !== startingBoard || operationEpoch !== driveOperationEpochRef.current) {
        announce("目前內容已變更；未切換檔案，請再試一次。", "info");
        return null;
      }
      setDriveSharing(EMPTY_DRIVE_SHARING);
      const next = ensureBoard(nextBoard);
      setDriveSession((current) => ({
        ...current,
        status: current.connected ? "ready" : current.status,
        busy: false,
        message: "",
        conflict: null,
      }));
      if (newBoard) {
        setBoardPrimaryStorage(next.id, "pending");
      } else if (!storageTargetForBoard(storagePreferences, next.id) && storagePreferences.targets[next.id] !== "pending") {
        setBoardPrimaryStorage(next.id, driveSettings.links[next.id] ? "drive" : "local");
      }
      initialBoardRef.current = next;
      boardRef.current = next;
      viewRef.current = next.view || { x: 0, y: 0, zoom: 1 };
      selectedIdsRef.current = [];
      fileHandleRef.current = null;
      undoRef.current = [];
      redoRef.current = [];
      setBoard(next);
      setView(viewRef.current);
      setSelectedIds([]);
      setKeyObjectId(null);
      setVersions([]);
      setDriveVersions({ status: "idle", items: [], fileId: "", headRevisionId: "", message: "" });
      setDirty(false);
      setSaveState("已從本機資料庫開啟");
      try { await persistBoardLocally(next); }
      catch { if (boardRef.current.id === next.id) { setDirty(true); setSaveState("本機復原副本寫入失敗"); } }
      await refreshLocalLibrarySummary();
      if (boardRef.current.id !== next.id) return null;
      setShowDriveLibrary(false);
      announce(message || `已開啟「${next.name}」。`, "success");
      return next;
    } catch (error) {
      announce(error?.message || "無法切換工作檔；目前畫布未受影響。", "error");
      return null;
    }
  }, [announce, boardSnapshot, cancelDriveOperations, dirty, driveSettings.links, persistBoardLocally, refreshLocalLibrarySummary, setBoardPrimaryStorage, storagePreferences]);

  const openLocalMoodboard = useCallback((record) => {
    if (!record?.board) {
      announce("找不到這份本機工作檔的內容。", "error");
      return;
    }
    if (record.id === boardRef.current.id) {
      setShowDriveLibrary(false);
      return;
    }
    activateLocalMoodboard(record.board);
  }, [activateLocalMoodboard, announce]);

  const createLocalMoodboard = useCallback(() => {
    const next = createBoard({ name: localizedDefaultBoardName(interfaceLocale) });
    activateLocalMoodboard(next, "已建立新的工作檔；原本的工作檔已安全保留。", { newBoard: true });
  }, [activateLocalMoodboard, interfaceLocale]);

  const currentDriveContentBytes = useMemo(
    () => contentByteLength(serializeMoodboardSnapshot(board)),
    [board],
  );
  const currentDriveLink = driveSettings.links[board.id] || null;
  const currentPrimaryStorageTarget = storageTargetForBoard(storagePreferences, board.id);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) return undefined;
    if (currentPrimaryStorageTarget !== "local") {
      fileHandleRef.current = null;
      setShowLocalFileLocation(false);
      return undefined;
    }
    if (!canUseFileSystemPicker) {
      fileHandleRef.current = null;
      setLocalFileBinding({ status: "unsupported", name: "" });
      return undefined;
    }
    setLocalFileBinding((current) => current.status === "linked" && fileHandleRef.current
      ? current
      : { status: "checking", name: "" });
    loadLocalFileHandle(board.id)
      .then(async (handle) => {
        if (cancelled) return;
        if (!handle) {
          fileHandleRef.current = null;
          setLocalFileBinding({ status: "unlinked", name: "" });
          return;
        }
        const permission = await localFileWritePermission(handle);
        if (cancelled) return;
        fileHandleRef.current = handle;
        setLocalFileBinding({
          status: permission === "granted" ? "linked" : "permission-required",
          name: String(handle.name || ""),
        });
      })
      .catch(() => {
        if (!cancelled) setLocalFileBinding({ status: "error", name: "" });
      });
    return () => { cancelled = true; };
  }, [board.id, canUseFileSystemPicker, currentPrimaryStorageTarget, hydrated]);

  useEffect(() => {
    if (!hydrated || showStorageLocation || currentPrimaryStorageTarget !== "local" || !storagePreferences.autoSave) return;
    if (showCollaboration) {
      setShowLocalFileLocation(false);
      return;
    }
    if (!["unlinked", "permission-required", "unsupported", "error"].includes(localFileBinding.status)) return;
    if (localFilePromptDismissedRef.current.has(board.id)) return;
    setShowLocalFileLocation(true);
  }, [board.id, currentPrimaryStorageTarget, hydrated, localFileBinding.status, showCollaboration, showStorageLocation, storagePreferences.autoSave]);

  const chooseLocalFileForAutosave = useCallback(async () => {
    const snapshot = boardSnapshot();
    const operationEpoch = storageTargetOperationEpochRef.current;
    const operationIsCurrent = () => isCurrentStorageTargetOperation({
      expectedEpoch: operationEpoch,
      currentEpoch: storageTargetOperationEpochRef.current,
      expectedBoardId: snapshot.id,
      currentBoardId: boardRef.current.id,
    });
    let handle = fileHandleRef.current;
    try {
      if (handle) {
        await writeMoodboardToLocalFile(handle, snapshot, { requestPermission: true });
      } else {
        handle = await pickMoodboardLocalFile(snapshot, window.showSaveFilePicker?.bind(window));
      }
      if (!operationIsCurrent()) return false;
      fileHandleRef.current = handle;
      await Promise.all([
        saveLocalFileHandle(snapshot.id, handle),
        persistBoardLocally(snapshot),
      ]);
      if (!operationIsCurrent()) return false;
      setBoardPrimaryStorage(snapshot.id, "local");
      localFilePromptDismissedRef.current.delete(snapshot.id);
      setLocalFileBinding({ status: "linked", name: String(handle.name || "") });
      setShowLocalFileLocation(false);
      if (boardRef.current.id === snapshot.id
        && boardRef.current.revision === snapshot.revision
        && boardRef.current.updatedAt === snapshot.updatedAt) setDirty(false);
      const savedAt = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      setSaveState(`已儲存至 ${handle.name || ".studio 檔案"} · ${savedAt}`);
      announce(`已設定「${handle.name || ".studio 檔案"}」為本機自動儲存位置。`, "success");
      return true;
    } catch (error) {
      if (error?.name === "AbortError") return false;
      if (!operationIsCurrent()) return false;
      const status = error?.code === "local-file/permission-required"
        ? "permission-required"
        : error?.code === "local-file/unsupported"
          ? "unsupported"
          : "error";
      setLocalFileBinding({ status, name: String(handle?.name || "") });
      announce(error?.message || "無法寫入本機 .studio 檔案；瀏覽器復原副本仍保留。", "error");
      return false;
    }
  }, [announce, boardSnapshot, persistBoardLocally, setBoardPrimaryStorage]);

  const dismissLocalFileLocation = useCallback(() => {
    localFilePromptDismissedRef.current.add(board.id);
    setShowLocalFileLocation(false);
    setLocalFileBinding((current) => current.status === "unsupported"
      ? current
      : { status: "browser-only", name: current.name });
    setSaveState("自動儲存在這個瀏覽器；尚未指定 .studio 檔案");
  }, [board.id]);

  const saveBoardToGoogleDrive = useCallback(({ asCopy = false, silent = false, forceOverwrite = false, overwriteTarget = null } = {}) => {
    const showConfirmationFailure = (error) => {
      setToast(null);
      setDriveSaveConfirmation((current) => current ? { ...current, feedback: driveSaveFailureFeedback(error) } : current);
    };
    if (cloudReadOnly) {
      if (forceOverwrite) showConfirmationFailure(new DriveApiError("目前為僅檢視；請先申請編輯權限。", { status: 403 }));
      else if (!silent) announce("目前為僅檢視；請先申請編輯權限。", "warning");
      return Promise.resolve(false);
    }
    if (!authReady) {
      if (forceOverwrite) showConfirmationFailure(new DriveApiError("需要重新登入。", { code: "drive/authorization" }));
      else if (!silent) requestAdvancedFeature("drive");
      return Promise.resolve(false);
    }
    if (driveSavePromiseRef.current) {
      if (!silent) announce("正在上傳目前內容至 Google Drive…", "info");
      return driveSavePromiseRef.current;
    }
    const accessToken = currentDriveAccessToken();
    if (!accessToken) {
      if (driveSettings.enabled && !forceOverwrite && (!driveSettings.connectionOwnerUid || driveSettings.connectionOwnerUid === authSession.user?.uid)) {
        if (driveRenewPromiseRef.current) return driveRenewPromiseRef.current;
        const initialBoardId = boardRef.current.id;
        const initialEpoch = driveOperationEpochRef.current;
        const renewal = (async () => {
          try {
            const { requestGoogleDriveToken } = await loadDriveRuntime();
            const token = await requestGoogleDriveToken({ loginHint: authSession.user?.email || driveSettings.connectionEmail || "", prompt: "none", timeoutMs: 8_000 });
            if (initialEpoch !== driveOperationEpochRef.current || boardRef.current.id !== initialBoardId) return false;
            driveTokenRef.current = token;
            if (!currentDriveAccessToken()) throw new Error("Google Drive 授權已過期。" );
            return await saveBoardToGoogleDrive({ asCopy, silent, forceOverwrite, overwriteTarget });
          } catch {
            if (initialEpoch === driveOperationEpochRef.current) {
              setDriveSession((current) => ({ ...current, status: "authorization-required", connected: false, busy: false, message: "無法自動恢復 Google Drive；請重新連結，本機內容仍保留。" }));
              if (!silent) setShowDriveLibrary(true);
            }
            return false;
          } finally { if (driveRenewPromiseRef.current === renewal) driveRenewPromiseRef.current = null; }
        })();
        driveRenewPromiseRef.current = renewal;
        return renewal;
      }
      setDriveSession((current) => ({ ...current, status: "authorization-required", connected: false, busy: false, message: "請重新連結 Google Drive；本機變更仍安全保留。" }));
      if (forceOverwrite) showConfirmationFailure(new DriveApiError("需要重新授權。", { code: "drive/authorization" }));
      else if (!silent) setShowDriveLibrary(true);
      return Promise.resolve(false);
    }

    const snapshot = boardSnapshot();
    const linkedFile = !asCopy ? driveSettings.links[snapshot.id] : null;
    // Saving is upload-only. An older download must not commit after this save.
    cancelDriveRead();
    driveRefreshEpochRef.current += 1;
    if (forceOverwrite) {
      const activeConflict = driveSession.conflict;
      const targetStillMatches = Boolean(
        overwriteTarget?.boardId
        && overwriteTarget?.fileId
        && overwriteTarget?.version
        && overwriteTarget.boardId === snapshot.id
        && overwriteTarget.fileId === linkedFile?.fileId
        && overwriteTarget.boardId === activeConflict?.boardId
        && overwriteTarget.fileId === activeConflict?.id
        && String(overwriteTarget.version) === String(activeConflict?.version),
      );
      if (!targetStillMatches) {
        showConfirmationFailure(new DriveApiError("覆寫目標已變更。", { code: "drive/overwrite-target" }));
        return Promise.resolve(false);
      }
      setDriveSaveConfirmation((current) => current ? { ...current, feedback: null } : current);
    }
    const uploadSnapshot = asCopy ? createRecoveredMoodboard(snapshot, { label: "Drive 複本" }) : snapshot;
    const content = serializeMoodboardSnapshot(uploadSnapshot);
    const uploadBytes = contentByteLength(content);
    const timestamp = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" })
      .format(new Date())
      .replaceAll(":", "-")
      .replace(" ", "-");
    const fileExtension = !asCopy && linkedFile && (!linkedFile.name || /\.moodboard$/i.test(linkedFile.name)) ? "moodboard" : "studio";
    const filename = asCopy
      ? `${safeFilename(snapshot.name, "moodboard")}-${translateInterfaceText("複本")}-${timestamp}.studio`
      : `${safeFilename(snapshot.name, "moodboard")}.${fileExtension}`;
    const operationEpoch = driveOperationEpochRef.current;
    const controller = new AbortController();
    driveSaveControllerRef.current = controller;

    let operation;
    operation = (async () => {
      let localRecoveryWarning = "";
      let queueStateWarning = "";
      const noteLocalRecoveryFailure = (error) => {
        localRecoveryWarning = error?.code === "drive/local-save-timeout"
          ? "本機復原副本寫入逾時。"
          : describeLocalPersistenceError(error?.details || error);
        setSaveState(`${localRecoveryWarning} Google Drive 同步仍會繼續。`);
      };
      const noteQueueStateFailure = (error) => {
        queueStateWarning = "本機同步佇列狀態暫時無法更新。";
        console.warn("Unable to update the local Google Drive sync queue.", error);
      };
      const assertCurrentOperation = () => {
        if (operationEpoch !== driveOperationEpochRef.current || controller.signal.aborted) {
          const error = new Error("Google Drive 操作已取消。");
          error.name = "AbortError";
          throw error;
        }
      };
      setDriveSession((current) => ({ ...current, status: "checking", connected: true, busy: true, message: "正在嘗試更新本機復原副本，再確認 Drive 空間與遠端版本…", conflict: asCopy || forceOverwrite ? current.conflict : null, conflictActionError: "" }));
      try {
        const {
          ensureGoogleDriveFolder,
          getGoogleDriveAbout,
          listGoogleDriveMoodboards,
          uploadGoogleDriveMoodboard,
        } = await loadDriveRuntime();
        try {
          await withOperationTimeout(
            persistBoardLocally(snapshot).then(async () => {
              if (!silent) await saveVersion(snapshot, translateInterfaceText("儲存 Drive 前"), "automatic");
            }),
            DRIVE_LOCAL_RECOVERY_TIMEOUT_MS,
            () => new DriveApiError("本機安全副本在 30 秒內未完成寫入。", { code: "drive/local-save-timeout" }),
          );
          setSaveState(`本機安全暫存已更新 ${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`);
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          noteLocalRecoveryFailure(error instanceof DriveApiError
            ? error
            : new DriveApiError("本機安全副本寫入失敗。", { code: "drive/local-save", details: error }));
        }
        if (!asCopy) {
          let queuePreparationActive = true;
          try {
            await withOperationTimeout((async () => {
              const queuedJob = await getSyncJob(snapshot.id);
              if (!queuePreparationActive || operationEpoch !== driveOperationEpochRef.current) return;
              if (queuedJob) {
                await updateSyncJob(snapshot.id, {
                  state: "syncing",
                  attemptCount: Number(queuedJob.attemptCount || 0) + 1,
                  lastError: "",
                });
              }
            })(), DRIVE_QUEUE_TIMEOUT_MS, () => new Error("Unable to prepare local sync bookkeeping."));
          } catch (error) {
            noteQueueStateFailure(error);
          } finally {
            queuePreparationActive = false;
          }
        }
        assertCurrentOperation();
        const about = await getGoogleDriveAbout(accessToken);
        assertCurrentOperation();
        const quotaAssessment = evaluateDriveQuota(about.quota, uploadBytes);
        if (!quotaAssessment.allowed) {
          throw new DriveApiError("Google Drive 空間不足；畫布仍安全保存在這台裝置。", { code: "drive/quota", reason: "storageQuotaExceeded" });
        }
        const folderId = await ensureGoogleDriveFolder(accessToken, driveSettings.folderId);
        assertCurrentOperation();
        setDriveSession((current) => ({
          ...current,
          status: "syncing",
          connected: true,
          busy: true,
          quota: about.quota,
          user: about.user,
          message: localRecoveryWarning
            ? `${localRecoveryWarning} 正在上傳最新的 \`.studio\` 工作檔…`
            : "正在上傳最新的 `.studio` 工作檔…",
        }));
        const savedFile = await uploadGoogleDriveMoodboard(accessToken, {
          board: uploadSnapshot,
          content,
          filename,
          folderId,
          existingFile: linkedFile ? { id: linkedFile.fileId, resourceKey: linkedFile.resourceKey || "" } : null,
          expectedVersion: linkedFile?.version || "",
          expectedHeadRevisionId: linkedFile?.headRevisionId || "",
          forceOverwrite,
          confirmedRemoteVersion: overwriteTarget?.version || "",
          latestWins: !forceOverwrite,
          signal: controller.signal,
        });
        assertCurrentOperation();
        if (!asCopy) {
          updateDriveSettings((current) => linkDriveFile({ ...current, enabled: true, folderId }, snapshot, savedFile));
          setBoardPrimaryStorage(snapshot.id, "drive");
          updateStoragePreferences((current) => ({ ...current, uploadPaused: { ...current.uploadPaused, [snapshot.id]: false } }));
          setDriveIncomingVersion(null);
          try {
            await withOperationTimeout(removeSyncJob(snapshot.id), DRIVE_QUEUE_TIMEOUT_MS, () => new Error("Unable to complete local sync bookkeeping."));
          } catch (error) {
            noteQueueStateFailure(error);
            setSyncJobs((current) => current.filter((job) => String(job.boardId || job.id) !== String(snapshot.id)));
            window.setTimeout(() => {
              if (operationEpoch !== driveOperationEpochRef.current || boardRef.current.id !== snapshot.id || boardRef.current.updatedAt !== snapshot.updatedAt) return;
              void removeSyncJob(snapshot.id)
                .then(() => refreshLocalLibrarySummary())
                .catch(() => undefined);
            }, 1_500);
          }
        }
        assertCurrentOperation();
        const syncedAt = new Date().toISOString();
        const postSyncWarning = [localRecoveryWarning, queueStateWarning].filter(Boolean).join(" ");
        setDriveSession((current) => ({
          ...current,
          status: asCopy
            ? (current.conflict ? "conflict" : "ready")
            : localRecoveryWarning ? "synced-local-warning" : "synced",
          connected: true,
          busy: false,
          message: asCopy
            ? `已儲存新的 Drive 檔案；目前編輯內容與原 Drive 檔案仍分開保留。${postSyncWarning ? ` ${postSyncWarning}` : ""}`
            : localRecoveryWarning
              ? `已儲存至 Google Drive；${localRecoveryWarning} 請下載 .studio 備份；需要釋放空間時，可至「設定」的「儲存與同步」檢視本機版本。${queueStateWarning ? ` ${queueStateWarning}` : ""}`
              : queueStateWarning
                ? `已儲存至 Google Drive；${queueStateWarning}`
                : `已儲存至 Google Drive · ${formatTime(savedFile.modifiedTime || new Date().toISOString())}`,
          quota: about.quota,
          user: about.user,
          conflict: asCopy ? current.conflict : null,
          conflictActionError: "",
          lastSyncedAt: asCopy ? current.lastSyncedAt : syncedAt,
        }));
        if (!asCopy) setSaveState(localRecoveryWarning
          ? "已儲存至 Google Drive；本機復原副本未更新"
          : queueStateWarning
            ? "已儲存至 Google Drive；本機同步佇列待整理"
            : "已儲存至 Google Drive");
        if (forceOverwrite) setDriveSaveConfirmation(null);
        if (forceOverwrite) setShowDriveLibrary(false);
        void Promise.all([
          getGoogleDriveAbout(accessToken).catch(() => about),
          listGoogleDriveMoodboards(accessToken, folderId).catch(() => null),
        ]).then(([postAbout, files]) => {
          if (operationEpoch !== driveOperationEpochRef.current) return;
          setDriveSession((current) => ({
            ...current,
            quota: postAbout.quota,
            user: postAbout.user,
            files: files || current.files,
          }));
        });
        // A completed cloud write must not wait for unrelated library reads
        // before the user receives its success feedback.
        void refreshLocalLibrarySummary();
        if (!asCopy && queueStateWarning) {
          setSyncJobs((current) => current.filter((job) => String(job.boardId || job.id) !== String(snapshot.id)));
        }
        if (!asCopy && boardRef.current.id === snapshot.id && boardRef.current.revision === snapshot.revision && boardRef.current.updatedAt === snapshot.updatedAt) setDirty(false);
        if (!silent) {
          const successMessage = asCopy
            ? "已儲存為新的 Drive 檔案；原檔與目前內容都已保留。"
            : forceOverwrite
              ? "已以目前內容更新 Drive；先前 Drive 版本可從版本紀錄復原。"
              : "已儲存至 Google Drive。";
          announce(postSyncWarning ? `${successMessage} ${postSyncWarning}` : successMessage, postSyncWarning ? "warning" : "success");
        }
        return true;
      } catch (error) {
        if (operationEpoch !== driveOperationEpochRef.current) return false;
        const isConflict = error?.code === "drive/conflict";
        const authorizationRequired = isGoogleDriveAuthorizationError(error);
        const retryable = isGoogleDriveRetryableError(error);
        const failureFeedback = driveSaveFailureFeedback(error, { localRecoveryWarning });
        const driveFailureMessage = forceOverwrite || localRecoveryWarning ? failureFeedback.message : driveErrorMessage(error);
        const errorMessage = localRecoveryWarning
          ? `${driveFailureMessage} ${localRecoveryWarning} 請先下載 .studio 備份。`
          : driveFailureMessage;
        const status = isConflict
          ? "conflict"
          : error?.code === "drive/quota"
            ? "quota"
            : error?.code === "drive/offline"
              ? "offline"
              : authorizationRequired
                ? "authorization-required"
                : "error";
        if (authorizationRequired) driveTokenRef.current = null;
        setDriveSession((current) => {
          const preservesExistingConflict = Boolean((asCopy || forceOverwrite) && current.conflict);
          return {
            ...current,
            status: authorizationRequired ? "authorization-required" : preservesExistingConflict ? "conflict" : status,
            connected: status !== "authorization-required",
            busy: true,
            message: errorMessage,
            conflict: isConflict
              ? { ...error.remoteFile, boardId: snapshot.id, fileId: linkedFile?.fileId || error.remoteFile?.id || "" }
              : preservesExistingConflict
                ? current.conflict
                : null,
            conflictActionError: preservesExistingConflict ? errorMessage : "",
          };
        });
        if (linkedFile && driveSettings.autoSync) {
          let queueRecoveryActive = true;
          try {
            await withOperationTimeout((async () => {
              await enqueueSync(snapshot, {
                fileId: linkedFile.fileId,
                expectedVersion: linkedFile.version,
                retainSnapshot: Boolean(localRecoveryWarning),
              });
              if (!queueRecoveryActive || operationEpoch !== driveOperationEpochRef.current) return;
              await updateSyncJob(snapshot.id, {
                state: status,
                lastError: errorMessage,
                nextAttemptAt: retryable
                  ? new Date(Date.now() + (status === "offline" ? 15_000 : 60_000)).toISOString()
                  : "",
              });
              if (!queueRecoveryActive || operationEpoch !== driveOperationEpochRef.current) return;
              await refreshLocalLibrarySummary();
            })(), DRIVE_QUEUE_TIMEOUT_MS, () => new Error("Unable to finish local sync bookkeeping."));
          } catch {
            if (operationEpoch === driveOperationEpochRef.current) setSaveState(localRecoveryWarning
              ? "本機復原副本與雲端同步都未完成；請下載 .studio 備份"
              : "雲端同步失敗；本機內容仍已保留");
          } finally {
            queueRecoveryActive = false;
          }
        }
        if (operationEpoch !== driveOperationEpochRef.current) return false;
        if (!silent || isConflict) {
          if (!silent && forceOverwrite) {
            setToast(null);
            setDriveSaveConfirmation({
              ...overwriteTarget,
              ...(isConflict ? { version: error.remoteFile?.version || overwriteTarget.version } : {}),
              feedback: failureFeedback,
            });
            setShowDriveLibrary(false);
          } else if (!silent && isConflict && !asCopy) {
            setToast(null);
            setDriveSaveConfirmation({ boardId: snapshot.id, fileId: linkedFile?.fileId || error.remoteFile?.id, version: error.remoteFile?.version, name: snapshot.name });
            setShowDriveLibrary(false);
            setShowSettings(false);
            setShowCollaboration(false);
          } else {
            setDriveSaveConfirmation(null);
            setShowDriveLibrary(true);
          }
          // The dedicated confirmation explains this conflict; don't cover it
          // with a second toast (especially the mobile bottom-sheet layout).
          if (!forceOverwrite && (!isConflict || asCopy)) announce(errorMessage, status === "offline" ? "warning" : "error");
        }
        return false;
      } finally {
        if (driveSavePromiseRef.current === operation) {
          driveSavePromiseRef.current = null;
          driveSaveControllerRef.current = null;
          if (operationEpoch === driveOperationEpochRef.current) setDriveSession((current) => ({ ...current, busy: false }));
        }
      }
    })();
    driveSavePromiseRef.current = operation;
    return operation;
  }, [announce, authReady, authSession.user?.email, authSession.user?.uid, boardSnapshot, cancelDriveRead, cloudReadOnly, currentDriveAccessToken, driveSession.conflict, driveSettings.autoSync, driveSettings.connectionEmail, driveSettings.connectionOwnerUid, driveSettings.enabled, driveSettings.folderId, driveSettings.links, persistBoardLocally, refreshLocalLibrarySummary, requestAdvancedFeature, setBoardPrimaryStorage, updateDriveSettings, updateStoragePreferences]);

  const openGoogleDriveFile = useCallback(async (file, { sharedLink = false, automatic = false } = {}) => {
    if (driveSavePromiseRef.current) {
      announce("正在儲存目前內容；完成後再開啟其他檔案。", "info");
      if (sharedLink) setDriveSharing((current) => ({ ...current, status: "error", message: "正在儲存目前內容；完成後請重新嘗試開啟。" }));
      return null;
    }
    const operationEpoch = driveOperationEpochRef.current;
    driveRefreshEpochRef.current += 1;
    const readEpoch = ++driveReadEpochRef.current;
    const startingBoard = boardRef.current;
    const readIsCurrent = () => workspaceReadIsCurrent(startingBoard, boardRef.current, readEpoch, driveReadEpochRef.current, operationEpoch, driveOperationEpochRef.current) && (!automatic || (!activePointerGestureRef.current && !textEditSessionRef.current && document.visibilityState === "visible" && !document.querySelector('[role="dialog"][aria-modal="true"]')));
    const assertReadIsCurrent = () => {
      if (!readIsCurrent()) throw new DriveApiError("已保留目前編輯內容，未套用較早開始讀取的 Drive 檔案。", { code: "drive/open-superseded" });
    };
    driveSharingRequestRef.current += 1;
    const accessToken = currentDriveAccessToken();
    if (!accessToken) {
      setDriveSession((current) => ({ ...current, status: "authorization-required", connected: false, busy: false, message: "請重新連結 Google Drive 後再開啟檔案。" }));
      return null;
    }
    setDriveSession((current) => ({ ...current, status: "checking", connected: true, busy: true, message: `正在開啟「${file.name}」…` }));
    driveReadPendingRef.current = readEpoch;
    let recovery = null;
    let committed = false;
    try {
      const { downloadCurrentGoogleDriveMoodboard } = await loadDriveRuntime();
      const resourceKey = String(file.resourceKey || "");
      const { content, metadata } = await downloadCurrentGoogleDriveMoodboard(accessToken, file.id, { resourceKey });
      assertReadIsCurrent();
      // Preserve the outgoing document immediately before the replacement.
      recovery = await saveVersion(boardSnapshot(), translateInterfaceText("載入雲端前"), "automatic", { pinned: true });
      assertReadIsCurrent();
      const recoveryPreferences = loadStoragePreferences(localStorage);
      const recoveryTarget = recoveryPreferences.targets[recovery.boardId] === "pending" ? "pending" : storageTargetForBoard(recoveryPreferences, recovery.boardId);
      const imported = await importBoardFile(
        new File([content], metadata.name, { type: "application/json" }),
        null,
        { shouldCommit: readIsCurrent, broadcast: false, preserveView: automatic, onCommit: (openedBoard) => {
      // Canvas, permissions and file identity change together, before any await.
      committed = true;
      driveReadPendingRef.current = null;
      updateDriveSettings((state) => linkDriveFile(state, openedBoard, metadata));
      setBoardPrimaryStorage(openedBoard.id, "drive");
      setDriveIncomingVersion(null);
      setDriveLoadRecovery({ version: recovery, target: recoveryTarget, loadedBoardId: openedBoard.id });
      const previousRecovery = loadStoragePreferences(localStorage).loadRecoveries[openedBoard.id];
      if (previousRecovery) void setVersionPinned(previousRecovery.versionId, false).catch(() => undefined);
      updateStoragePreferences((current) => ({ ...current, loadRecoveries: { ...current.loadRecoveries, [openedBoard.id]: { boardId: recovery.boardId, versionId: recovery.id, target: recoveryTarget } } }));
      const resolvedResourceKey = metadata.resourceKey || resourceKey;
      const role = driveFileRole(metadata);
      setDriveSharing({
        ...EMPTY_DRIVE_SHARING,
        status: "linked",
        message: role === "viewer" ? "已依 Google Drive 權限以僅檢視模式開啟。" : "已依 Google Drive 權限開啟檔案。",
        fileId: metadata.id,
        fileName: metadata.name,
        resourceKey: resolvedResourceKey,
        shareUrl: createGoogleDriveMoodboardUrl(
          { fileId: metadata.id, resourceKey: resolvedResourceKey },
          `${window.location.origin}${window.location.pathname}`,
        ),
        webViewLink: metadata.webViewLink,
        role,
        canEdit: role !== "viewer",
        canShare: metadata.capabilities.canShare,
      });
      setDriveSession((session) => ({
        ...session,
        status: "synced",
        connected: true,
        busy: false,
        message: `已開啟 ${metadata.name}`,
        conflict: null,
        files: session.files.map((entry) => entry.id === metadata.id ? metadata : entry),
        lastSyncedAt: new Date().toISOString(),
      }));
      if (!automatic) setShowDriveLibrary(false);
      announce(automatic ? "已載入 Google Drive 的最新內容；更新前版本已保留。" : `已從 Google Drive 開啟「${openedBoard.name}」；載入前版本已保留。`, "success");
        } },
      );
      if (!imported && !readIsCurrent()) assertReadIsCurrent();
      if (!imported) throw new DriveApiError("Google Drive 檔案內容無法辨識。", { code: "drive/invalid-file" });
      return { board: imported, metadata };
    } catch (error) {
      if (operationEpoch !== driveOperationEpochRef.current || readEpoch !== driveReadEpochRef.current) return null;
      if (error?.code === "drive/open-superseded") {
        setDriveSession((current) => ({ ...current, status: current.conflict ? "conflict" : "ready", busy: false, message: error.message }));
        announce(error.message, "info");
        return null;
      }
      const isConflict = error?.code === "drive/conflict";
      if (sharedLink && isSharedDriveFileAccessError(error)) {
        const message = "無法讀取這份檔案。請先到 Google Drive 確認檔案與登入帳號；需要時向擁有者申請存取權，再回來選取同一份檔案授權 App。";
        setDriveSharing((current) => ({
          ...current,
          status: "shared-file-denied",
          fileId: String(file?.id || current.fileId || ""),
          resourceKey: String(file?.resourceKey || current.resourceKey || ""),
          message,
        }));
        setDriveSession((current) => ({
          ...current,
          status: "ready",
          connected: true,
          busy: false,
          message: "共享檔案尚未開啟；目前畫布沒有被當成該檔案。",
        }));
        announce(message, "error");
        return null;
      }
      if (sharedLink) {
        const authorizationRequired = isGoogleDriveAuthorizationError(error);
        if (authorizationRequired) driveTokenRef.current = null;
        const message = isConflict ? "共享檔案在讀取期間已變更；目前畫布未變更，請重新嘗試開啟。" : driveErrorMessage(error);
        setDriveSharing((current) => ({ ...current, status: authorizationRequired ? "authorization-required" : "error", message }));
        setDriveSession((current) => ({ ...current, status: authorizationRequired ? "authorization-required" : current.conflict ? "conflict" : "ready", connected: authorizationRequired ? false : current.connected, busy: false, message }));
        announce(message, "error");
        return null;
      }
      const authorizationRequired = isGoogleDriveAuthorizationError(error);
      if (authorizationRequired) driveTokenRef.current = null;
      setDriveSession((current) => ({
        ...current,
        status: isConflict ? "conflict" : authorizationRequired ? "authorization-required" : "error",
        connected: !authorizationRequired,
        busy: false,
        message: driveErrorMessage(error),
        conflict: isConflict ? error.remoteFile : current.conflict,
      }));
      announce(driveErrorMessage(error), "error");
      return null;
    } finally {
      if (recovery && !committed) void setVersionPinned(recovery.id, false).catch(() => undefined);
      if (driveReadPendingRef.current === readEpoch) driveReadPendingRef.current = null;
    }
  }, [announce, boardSnapshot, currentDriveAccessToken, importBoardFile, setBoardPrimaryStorage, updateDriveSettings, updateStoragePreferences]);

  // Only replace a clean workspace after confirming the exact linked Drive file changed.
  // The existing open path creates a recovery version and rejects reads superseded by edits.
  useEffect(() => {
    if (!hydrated || !online || !driveSession.connected || !driveSettings.enabled) return undefined;
    const link = driveSettings.links[board.id];
    if (!link?.fileId || (!link.version && !link.headRevisionId)) return undefined;
    let cancelled = false;
    let checking = false;
    let warnedVersion = "";
    const check = async () => {
      if (cancelled || checking || document.visibilityState !== "visible" || driveSavePromiseRef.current || driveReadPendingRef.current || activePointerGestureRef.current || textEditSessionRef.current || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const token = currentDriveAccessToken();
      if (!token) return;
      const snapshot = boardRef.current;
      if (snapshot.id !== board.id) return;
      checking = true;
      try {
        const { getGoogleDriveFile } = await loadDriveRuntime();
        const remote = await getGoogleDriveFile(token, link.fileId, {resourceKey:link.resourceKey || ""});
        if (cancelled || boardRef.current !== snapshot || !remoteContentChanged(link, remote)) return;
        const clean = shouldAutoLoadDriveChange({ link, remote, board: snapshot, dirty });
        if (!clean) {
          const revision = `${remote.version || ""}:${remote.headRevisionId || ""}`;
          if (warnedVersion !== revision) { warnedVersion = revision; announce("雲端有更新；此分頁仍有編輯，已保留目前內容。", "warning"); }
          return;
        }
        if (driveSavePromiseRef.current || driveReadPendingRef.current || activePointerGestureRef.current || textEditSessionRef.current) return;
        await openGoogleDriveFile({...remote, resourceKey:remote.resourceKey || link.resourceKey || ""}, {automatic:true});
      } catch { /* Keep the current canvas when offline or authorization expires. */ }
      finally { checking = false; }
    };
    const timer = window.setInterval(check, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [announce, board.id, board.revision, board.updatedAt, currentDriveAccessToken, dirty, driveSession.connected, driveSettings, hydrated, online, openGoogleDriveFile]);

  const refreshDriveSharing = useCallback(async (target = null, { onRole = null } = {}) => {
    const requestId = driveSharingRequestRef.current + 1;
    driveSharingRequestRef.current = requestId;
    const activeBoardId = boardRef.current.id;
    const requestIsCurrent = () => (
      driveSharingRequestRef.current === requestId
      && boardRef.current.id === activeBoardId
    );
    const currentState = loadDriveState(localStorage);
    const linked = currentState.links[boardRef.current.id] || null;
    const incoming = initialDriveShareRef.current;
    const selected = target?.fileId || target?.id ? target : (sharingCurrentBoardRef.current ? linked : incoming || linked);
    const fileId = String(selected?.fileId || selected?.id || "");
    const resourceKey = String(selected?.resourceKey || "");
    if (!fileId) {
      setDriveSharing({
        ...EMPTY_DRIVE_SHARING,
        status: "needs-drive",
        message: "先把目前工作檔儲存成你 Google Drive 裡的 `.studio` 檔案，才能建立同一份檔案的分享連結。",
      });
      return false;
    }
    const accessToken = currentDriveAccessToken();
    if (!accessToken) {
      setDriveSharing({
        ...EMPTY_DRIVE_SHARING,
        status: "authorization-required",
        fileId,
        resourceKey,
        message: "請連結 Google Drive，才能讀取這份檔案與它目前的分享權限。",
      });
      return false;
    }
    setDriveSharing((current) => ({
      ...current,
      status: "loading",
      fileId,
      resourceKey,
      message: "正在讀取 Google Drive 的檔案與權限…",
    }));
    try {
      const { getGoogleDriveFile, listGoogleDrivePermissions } = await loadDriveRuntime();
      const metadata = await getGoogleDriveFile(accessToken, fileId, { resourceKey });
      if (!requestIsCurrent()) return false;
      let permissions = [];
      let permissionsVisible = false;
      let permissionMessage = "";
      try {
        permissions = await listGoogleDrivePermissions(accessToken, fileId, { resourceKey });
        permissionsVisible = true;
      } catch (permissionError) {
        if (!requestIsCurrent()) return false;
        if (metadata.capabilities.canShare) throw permissionError;
        permissionMessage = "目前帳號可開啟這份檔案，但 Google Drive 未提供完整分享名單；權限仍由 Drive 管理。";
      }
      if (!requestIsCurrent()) return false;
      const resolvedResourceKey = metadata.resourceKey || resourceKey;
      const role = driveFileRole(metadata);
      setDriveSharing({
        status: "ready",
        message: permissionMessage || "已讀取 Google Drive 的最新分享權限。",
        fileId: metadata.id,
        fileName: metadata.name,
        resourceKey: resolvedResourceKey,
        shareUrl: createGoogleDriveMoodboardUrl(
          { fileId: metadata.id, resourceKey: resolvedResourceKey },
          `${window.location.origin}${window.location.pathname}`,
        ),
        webViewLink: metadata.webViewLink,
        role,
        canEdit: role !== "viewer",
        canShare: metadata.capabilities.canShare,
        permissionsVisible,
        permissions,
        members: googleDriveMembers(permissions),
        generalAccess: googleDriveGeneralAccess(permissions),
      });
      if (typeof onRole === "function") onRole(role);
      return true;
    } catch (error) {
      if (!requestIsCurrent()) return false;
      const authorizationRequired = isGoogleDriveAuthorizationError(error);
      if (authorizationRequired) driveTokenRef.current = null;
      setDriveSharing((current) => ({
        ...current,
        status: authorizationRequired ? "authorization-required" : "error",
        message: driveErrorMessage(error),
      }));
      return false;
    }
  }, [currentDriveAccessToken]);

  const promptForPendingSharedEdit = useCallback((role) => {
    if (!pendingSharedEditRef.current) return;
    pendingSharedEditRef.current = false;
    if (role === "viewer") { setShowCollaboration(false); setShowEditPermissionRequest(true); }
  }, []);

  const openIncomingDirectly = useCallback(async () => {
    const incoming = initialDriveShareRef.current;
    const accessToken = currentDriveAccessToken();
    if (!incoming?.fileId || !accessToken) return false;
    const previous = directShareAttemptRef.current;
    if (previous?.fileId === incoming.fileId && previous?.resourceKey === incoming.resourceKey && previous?.accessToken === accessToken) return false;
    directShareAttemptRef.current = { fileId: incoming.fileId, resourceKey: incoming.resourceKey, accessToken };
    setDriveSharing((current) => ({ ...current, status: "opening-shared-file", fileId: incoming.fileId, resourceKey: incoming.resourceKey, message: "正在開啟分享的工作檔…" }));
    const opened = await openGoogleDriveFile({ id: incoming.fileId, resourceKey: incoming.resourceKey, name: "分享的工作檔" }, { sharedLink: true });
    if (!opened) return false;
    await refreshDriveSharing({ fileId: opened.metadata.id, resourceKey: opened.metadata.resourceKey || incoming.resourceKey });
    // The URL remains shareable, but subsequent sharing actions must follow the
    // currently open board instead of this already-consumed incoming link.
    if (initialDriveShareRef.current === incoming) initialDriveShareRef.current = null;
    setShowCollaboration(false);
    promptForPendingSharedEdit(driveFileRole(opened.metadata));
    return true;
  }, [currentDriveAccessToken, openGoogleDriveFile, promptForPendingSharedEdit, refreshDriveSharing]);

  const connectDriveForSharing = useCallback(async () => {
    setDriveSharing((current) => ({ ...current, status: "authorizing", message: "正在連結你的 Google Drive…" }));
    const connection = await connectGoogleDrive();
    if (!connection) return false;
    if (sharingCurrentBoardRef.current) return refreshDriveSharing();
    const incoming = initialDriveShareRef.current;
    if (incoming?.fileId) {
      const currentLink = loadDriveState(localStorage).links[boardRef.current.id];
      if (currentLink?.fileId === incoming.fileId) {
        return refreshDriveSharing(incoming, { onRole: promptForPendingSharedEdit });
      }
      return openIncomingDirectly();
    }
    return refreshDriveSharing(incoming || null);
  }, [connectGoogleDrive, openIncomingDirectly, promptForPendingSharedEdit, refreshDriveSharing]);

  const authorizeIncomingDriveFile = useCallback(async () => {
    const incoming = initialDriveShareRef.current;
    if (!incoming?.fileId) return false;
    const accessToken = currentDriveAccessToken();
    if (!accessToken) {
      setDriveSharing({
        ...EMPTY_DRIVE_SHARING,
        status: "authorization-required",
        fileId: incoming.fileId,
        resourceKey: incoming.resourceKey,
        message: "請先連結你的 Google Drive，再選取這個連結指定的檔案。",
      });
      return false;
    }
    setDriveSharing((current) => ({
      ...current,
      status: "picker-authorizing",
      fileId: incoming.fileId,
      resourceKey: incoming.resourceKey,
      message: "請在 Google 視窗中選取此連結指定的同一份 `.studio` 檔案。",
    }));
    try {
      const { openGoogleDriveMoodboardPicker } = await loadDrivePickerRuntime();
      const selection = await openGoogleDriveMoodboardPicker({
        accessToken,
        expectedFileId: incoming.fileId,
        expectedResourceKey: incoming.resourceKey,
      });
      if (selection.status === "cancelled") {
        setDriveSharing((current) => ({
          ...current,
          status: "needs-picker-access",
          message: "你已取消選取；沒有開啟任何內容，也沒有把空白畫布當成共享檔案。",
        }));
        return false;
      }
      setDriveSharing((current) => ({
        ...current,
        status: "opening-shared-file",
        message: "正在驗證並讀取共享工作檔的原始內容…",
      }));
      const opened = await openGoogleDriveFile(selection.file, { sharedLink: true });
      if (!opened) return false;
      const refreshed = await refreshDriveSharing({
        fileId: opened.metadata.id,
        resourceKey: opened.metadata.resourceKey || selection.file.resourceKey || incoming.resourceKey,
      });
      promptForPendingSharedEdit(driveFileRole(opened.metadata));
      return refreshed;
    } catch (error) {
      const status = error?.code === "drive/picker-unconfigured"
        ? "picker-unconfigured"
        : String(error?.code || "").startsWith("drive/picker-")
          ? "needs-picker-access"
          : "error";
      const message = driveErrorMessage(error);
      setDriveSharing((current) => ({
        ...current,
        status,
        fileId: incoming.fileId,
        resourceKey: incoming.resourceKey,
        message,
      }));
      announce(message, status === "needs-picker-access" ? "warning" : "error");
      return false;
    }
  }, [announce, currentDriveAccessToken, openGoogleDriveFile, promptForPendingSharedEdit, refreshDriveSharing]);

  const saveCurrentBoardForSharing = useCallback(async () => {
    setDriveSharing((current) => ({ ...current, status: "saving", message: "正在先建立本機版本，再儲存到 Google Drive…" }));
    const saved = await saveBoardToGoogleDrive();
    if (!saved) {
      const accessToken = currentDriveAccessToken();
      setDriveSharing((current) => ({
        ...current,
        status: accessToken ? "error" : "authorization-required",
        message: accessToken ? "尚未完成 Google Drive 儲存；目前本機內容仍安全保留。" : "請先連結 Google Drive。",
      }));
      return false;
    }
    const link = loadDriveState(localStorage).links[boardRef.current.id];
    return refreshDriveSharing(link ? { fileId: link.fileId, resourceKey: link.resourceKey } : null);
  }, [currentDriveAccessToken, refreshDriveSharing, saveBoardToGoogleDrive]);

  const copyDriveSharingLink = useCallback(async (newRole = "") => {
    if (!driveSharing.shareUrl) return false;
    try {
      await navigator.clipboard.writeText(driveSharing.shareUrl);
      announce(
        newRole === "restricted" ? "受限的工作檔連結已複製；只有已獲 Drive 授權的帳號能開啟。"
          : newRole === "viewer" ? "工作檔檢視連結已複製；知道連結的人可檢視。"
          : driveSharing.generalAccess.enabled && driveSharing.generalAccess.role === "editor"
          ? "可編輯的工作檔連結已複製；知道連結的人可依 Drive 權限編輯。"
          : driveSharing.generalAccess.enabled
          ? "工作檔檢視連結已複製；知道連結的人可依 Drive 權限開啟。"
          : "受限的工作檔連結已複製；只有已獲 Drive 授權的帳號能開啟。",
        "success",
      );
      return true;
    } catch {
      announce("無法自動複製；請選取連結後手動複製。", "warning");
      return false;
    }
  }, [announce, driveSharing.generalAccess.enabled, driveSharing.generalAccess.role, driveSharing.shareUrl]);

  const setDriveSharingGeneralAccess = useCallback(async (enabled) => {
    const accessToken = currentDriveAccessToken();
    if (!accessToken || !driveSharing.fileId) return false;
    try {
      const { setGoogleDriveGeneralAccess } = await loadDriveRuntime();
      await setGoogleDriveGeneralAccess(accessToken, driveSharing.fileId, enabled, { resourceKey: driveSharing.resourceKey });
      await refreshDriveSharing({ fileId: driveSharing.fileId, resourceKey: driveSharing.resourceKey });
      announce(enabled ? "已允許知道連結的人檢視；編輯權仍需個別授予。" : "已將這份 Drive 檔案改為受限存取。", "success");
      return true;
    } catch (error) {
      announce(driveErrorMessage(error), "error");
      return false;
    }
  }, [announce, currentDriveAccessToken, driveSharing.fileId, driveSharing.resourceKey, refreshDriveSharing]);

  const inviteDriveSharingMember = useCallback(async (email, role) => {
    const accessToken = currentDriveAccessToken();
    if (!accessToken || !driveSharing.fileId) return false;
    try {
      const { createGoogleDrivePermission } = await loadDriveRuntime();
      await createGoogleDrivePermission(accessToken, driveSharing.fileId, {
        type: "user",
        role: role === "editor" ? "writer" : "reader",
        emailAddress: email,
        resourceKey: driveSharing.resourceKey,
        sendNotificationEmail: true,
      });
      await refreshDriveSharing({ fileId: driveSharing.fileId, resourceKey: driveSharing.resourceKey });
      announce(`已透過 Google Drive 邀請 ${email.trim()}。`, "success");
      return true;
    } catch (error) {
      announce(driveErrorMessage(error), "error");
      return false;
    }
  }, [announce, currentDriveAccessToken, driveSharing.fileId, driveSharing.resourceKey, refreshDriveSharing]);

  const setDriveSharingMemberRole = useCallback(async (permissionId, role) => {
    const accessToken = currentDriveAccessToken();
    if (!accessToken || !driveSharing.fileId) return false;
    try {
      const { updateGoogleDrivePermission } = await loadDriveRuntime();
      await updateGoogleDrivePermission(
        accessToken,
        driveSharing.fileId,
        permissionId,
        role === "editor" ? "writer" : "reader",
        { resourceKey: driveSharing.resourceKey },
      );
      await refreshDriveSharing({ fileId: driveSharing.fileId, resourceKey: driveSharing.resourceKey });
      announce(role === "editor" ? "已允許這位成員編輯。" : "已將這位成員改為僅檢視。", "success");
      return true;
    } catch (error) {
      announce(driveErrorMessage(error), "error");
      return false;
    }
  }, [announce, currentDriveAccessToken, driveSharing.fileId, driveSharing.resourceKey, refreshDriveSharing]);

  const removeDriveSharingMember = useCallback(async (member) => {
    if (!window.confirm(`確定要移除「${member.name}」對這份 Google Drive 檔案的存取權嗎？`)) return false;
    const accessToken = currentDriveAccessToken();
    if (!accessToken || !driveSharing.fileId) return false;
    try {
      const { deleteGoogleDrivePermission } = await loadDriveRuntime();
      await deleteGoogleDrivePermission(accessToken, driveSharing.fileId, member.id, { resourceKey: driveSharing.resourceKey });
      await refreshDriveSharing({ fileId: driveSharing.fileId, resourceKey: driveSharing.resourceKey });
      announce(`已移除 ${member.name} 的 Drive 存取權。`, "success");
      return true;
    } catch (error) {
      announce(driveErrorMessage(error), "error");
      return false;
    }
  }, [announce, currentDriveAccessToken, driveSharing.fileId, driveSharing.resourceKey, refreshDriveSharing]);

  useEffect(() => {
    const incoming = initialDriveShareRef.current;
    if (!hydrated || !incoming?.fileId || sharingCurrentBoardRef.current) return;
    setShowCollaboration(true);
    if (!authReady) {
      if (authSession.status !== "loading") requestAdvancedFeature("shared-moodboard");
      return;
    }
    if (!currentDriveAccessToken()) {
      setDriveSharing({
        ...EMPTY_DRIVE_SHARING,
        status: "authorization-required",
        fileId: incoming.fileId,
        resourceKey: incoming.resourceKey,
        message: "連結 Google Drive 後，會嘗試直接開啟分享的檔案。",
      });
      return;
    }
    const currentLink = loadDriveState(localStorage).links[boardRef.current.id];
    if (currentLink?.fileId === incoming.fileId) {
      refreshDriveSharing(incoming, { onRole: promptForPendingSharedEdit });
      return;
    }
    void openIncomingDirectly();
  }, [authReady, authSession.status, currentDriveAccessToken, driveSession.connected, hydrated, openIncomingDirectly, promptForPendingSharedEdit, refreshDriveSharing, requestAdvancedFeature]);

  useEffect(() => {
    if (!hydrated || !legacyCollaborationLinkRef.current || initialDriveShareRef.current?.fileId) return;
    setShowCollaboration(true);
    setDriveSharing({
      ...EMPTY_DRIVE_SHARING,
      status: "legacy",
      message: "這個 `?collab=` 連結屬於舊版 Firestore 分享空間，已不再使用。請聯絡檔案擁有者，以 Google Drive 重新分享同一份 `.studio` 檔案。",
    });
  }, [hydrated]);

  const closeDriveSharing = useCallback(() => {
    cancelDriveRead();
    if (legacyCollaborationLinkRef.current) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("collab");
      window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      legacyCollaborationLinkRef.current = false;
      setDriveSharing(EMPTY_DRIVE_SHARING);
    }
    // Closing a dialog must not discard an unopened shared-file link. The
    // recipient may reconnect Drive and retry without losing the target file.
    setShowCollaboration(false);
  }, [cancelDriveRead]);

  useEffect(() => {
    if (!showCollaboration || (!sharingCurrentBoardRef.current && initialDriveShareRef.current?.fileId) || legacyCollaborationLinkRef.current) return;
    if (!authReady) {
      requestAdvancedFeature("collaboration");
      return;
    }
    const linked = loadDriveState(localStorage).links[boardRef.current.id];
    refreshDriveSharing(linked ? { fileId: linked.fileId, resourceKey: linked.resourceKey } : null);
  }, [authReady, board.id, refreshDriveSharing, requestAdvancedFeature, showCollaboration]);

  const refreshDriveVersions = useCallback(async () => {
    const boardId = boardRef.current.id;
    const link = driveSettings.links[boardId];
    if (!link?.fileId) {
      setDriveVersions({ status: "idle", items: [], fileId: "", headRevisionId: "", message: "" });
      return [];
    }
    const accessToken = currentDriveAccessToken();
    if (!accessToken) {
      setDriveVersions({ status: "authorization-required", items: [], fileId: link.fileId, headRevisionId: link.headRevisionId || "", message: "請重新連結 Google Drive 後再讀取版本。" });
      return [];
    }
    setDriveVersions((current) => ({ ...current, status: "loading", fileId: link.fileId, message: "" }));
    try {
      const { getGoogleDriveFile, listGoogleDriveRevisions } = await loadDriveRuntime();
      const metadata = await getGoogleDriveFile(accessToken, link.fileId, { resourceKey: link.resourceKey });
      if (metadata.capabilities?.canReadRevisions === false) {
        throw new DriveApiError("目前帳號沒有讀取這份檔案版本紀錄的權限。", { code: "drive/permission", status: 403 });
      }
      const items = await listGoogleDriveRevisions(accessToken, link.fileId, { resourceKey: link.resourceKey });
      setDriveVersions({ status: "ready", items, fileId: link.fileId, headRevisionId: metadata.headRevisionId, message: "" });
      return items;
    } catch (error) {
      const authorizationRequired = isGoogleDriveAuthorizationError(error);
      if (authorizationRequired) driveTokenRef.current = null;
      setDriveVersions({
        status: authorizationRequired ? "authorization-required" : "error",
        items: [],
        fileId: link.fileId,
        headRevisionId: link.headRevisionId || "",
        message: driveErrorMessage(error),
      });
      return [];
    }
  }, [currentDriveAccessToken, driveSettings.links]);

  const recoverGoogleDriveVersionAsCopy = useCallback(async (file, revision = null) => {
    if (!file?.id) {
      announce("找不到要復原的 Google Drive 檔案。", "error");
      return null;
    }
    const accessToken = currentDriveAccessToken();
    if (!accessToken) {
      setDriveVersions((current) => ({ ...current, status: "authorization-required", message: "請重新連結 Google Drive 後再復原版本。" }));
      announce("請重新連結 Google Drive 後再復原版本。", "error");
      return null;
    }
    setVersionBusy(true);
    try {
      const { downloadGoogleDriveMoodboard, getGoogleDriveFile } = await loadDriveRuntime();
      const resourceKey = file.resourceKey || driveSettings.links[boardRef.current.id]?.resourceKey || "";
      const metadata = await getGoogleDriveFile(accessToken, file.id, { resourceKey });
      const isHead = !revision || revision.id === metadata.headRevisionId;
      if (!isHead && !revision.keepForever) {
        throw new DriveApiError("這個 Drive 暫存版本無法下載；目前工作檔未受影響。", { code: "drive/revision" });
      }
      const content = await downloadGoogleDriveMoodboard(accessToken, file.id, {
        revisionId: isHead ? "" : revision.id,
        resourceKey,
      });
      const parsed = ensureBoard(JSON.parse(content));
      const versionTime = revision?.modifiedTime || metadata.modifiedTime || new Date().toISOString();
      const recovered = createRecoveredMoodboard(parsed, { label: `Drive 復原 ${formatTime(versionTime)}` });
      const activated = await activateLocalMoodboard(recovered, `已將 Drive 版本開成新的本機工作檔；原本內容仍安全保留。`);
      if (!activated) return null;
      setDriveVersions({ status: "idle", items: [], fileId: "", headRevisionId: "", message: "" });
      setShowVersions(false);
      return activated;
    } catch (error) {
      const authorizationRequired = isGoogleDriveAuthorizationError(error);
      if (authorizationRequired) driveTokenRef.current = null;
      const message = driveErrorMessage(error);
      setDriveVersions((current) => ({ ...current, status: authorizationRequired ? "authorization-required" : "error", message }));
      announce(message, "error");
      return null;
    } finally {
      setVersionBusy(false);
    }
  }, [activateLocalMoodboard, announce, currentDriveAccessToken, driveSettings.links]);

  const saveBoardFile = useCallback(async (forceDownload = false) => {
    const snapshot = boardSnapshot();
    const filename = `${safeFilename(snapshot.name, "studio")}.studio`;
    const content = `${JSON.stringify(snapshot, null, 2)}\n`;
    try {
      if (!forceDownload && window.showSaveFilePicker) {
        let handle = fileHandleRef.current;
        if (!handle) {
          handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "Infinite Studio 檔案", accept: { "application/json": [".studio", ".moodboard"] } }],
          });
          fileHandleRef.current = handle;
        }
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } else {
        downloadBlob(new Blob([content], { type: "application/json" }), filename);
      }
      if (!forceDownload) setDirty(false);
      announce(forceDownload ? "離線備份已下載" : "Infinite Studio 檔案已儲存", "success");
    } catch (error) {
      if (error.name !== "AbortError") announce("儲存失敗，畫布仍保留在本機自動儲存。", "error");
    }
  }, [announce, boardSnapshot]);

  const saveBoardToLocalPrimary = useCallback(async ({ silent = false } = {}) => {
    const snapshot = boardSnapshot();
    const operationEpoch = storageTargetOperationEpochRef.current;
    const operationIsCurrent = () => isCurrentStorageTargetOperation({
      expectedEpoch: operationEpoch,
      currentEpoch: storageTargetOperationEpochRef.current,
      expectedBoardId: snapshot.id,
      currentBoardId: boardRef.current.id,
    });
    try {
      setSaveState("儲存中…");
      await persistBoardLocally(snapshot);
      if (!operationIsCurrent()) return false;
      setBoardPrimaryStorage(snapshot.id, "local");
      const fileSaved = await writeBoardToBoundLocalFile(snapshot);
      if (!operationIsCurrent()) return false;
      await refreshLocalLibrarySummary();
      if (!operationIsCurrent()) return false;
      if (!fileSaved) {
        setSaveState("本機復原副本已更新；等待選擇 .studio 檔案");
        if (!localFilePromptDismissedRef.current.has(snapshot.id)) setShowLocalFileLocation(true);
        if (!silent) announce("請選擇 .studio 檔案位置，之後才能自動寫入 Finder／檔案。", "warning");
        return false;
      }
      if (
        boardRef.current.revision === snapshot.revision
        && boardRef.current.updatedAt === snapshot.updatedAt
      ) setDirty(false);
      const savedAt = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      setSaveState(`已儲存至 ${fileHandleRef.current?.name || ".studio 檔案"} · ${savedAt}`);
      if (!silent) announce(`已儲存至「${fileHandleRef.current?.name || ".studio 檔案"}」。`, "success");
      return true;
    } catch (error) {
      if (error?.name !== "AbortError") {
        setSaveState("儲存失敗；變更仍留在目前分頁");
        if (!silent) announce("無法儲存到這台裝置；目前畫布未被取代。", "error");
      }
      return false;
    }
  }, [announce, boardSnapshot, persistBoardLocally, refreshLocalLibrarySummary, setBoardPrimaryStorage, writeBoardToBoundLocalFile]);

  const savePreferredBoard = useCallback(() => {
    if (!currentPrimaryStorageTarget) {
      setShowStorageLocation(true);
      return;
    }
    if (currentPrimaryStorageTarget === "local") {
      if (localFileBinding.status !== "linked" || !fileHandleRef.current) {
        setShowLocalFileLocation(true);
        return;
      }
      saveBoardToLocalPrimary();
      return;
    }
    if (!authReady) {
      requestAdvancedFeature("drive");
      return;
    }
    if (!currentDriveAccessToken() && !driveSettings.enabled) {
      setShowDriveLibrary(true);
      setDriveSession((current) => ({ ...current, status: driveSettings.enabled ? "authorization-required" : "disconnected", connected: false, busy: false, message: driveSettings.enabled ? "請重新連結後繼續同步。" : "連結 Drive 後即可把目前工作檔保存到雲端。" }));
      return;
    }
    saveBoardToGoogleDrive();
  }, [authReady, currentDriveAccessToken, currentPrimaryStorageTarget, driveSettings.enabled, localFileBinding.status, requestAdvancedFeature, saveBoardToGoogleDrive, saveBoardToLocalPrimary]);

  updateSavePrimaryRef.current = () => savePrimaryBeforeUpdate({
    dirty, target: currentPrimaryStorageTarget, localStatus: localFileBinding.status,
    hasHandle: Boolean(fileHandleRef.current), driveBusy: Boolean(driveSavePromiseRef.current),
    saveLocal: () => saveBoardToLocalPrimary({ silent: true }),
    saveDrive: () => saveBoardToGoogleDrive({ silent: true }),
  });

  const choosePrimaryStorageTarget = useCallback(async (target, { driveConsentAcknowledged = false } = {}) => {
    if (driveSavePromiseRef.current) { announce("正在儲存目前內容；完成後再變更儲存位置。", "info"); return; }
    if (target === "local" && storageTargetForBoard(loadStoragePreferences(localStorage), boardRef.current.id) === "drive") {
      setToast(null);
      setShowSettings(false);
      setShowStorageLocation(false);
      setLocalSwitchConfirmation(true);
      return;
    }
    if (target === "drive" && !driveConsentAcknowledged) {
      setShowSettings(false);
      setShowStorageLocation(true);
      return;
    }
    const operationEpoch = storageTargetOperationEpochRef.current + 1;
    storageTargetOperationEpochRef.current = operationEpoch;
    const boardId = boardRef.current.id;
    setShowStorageLocation(false);
    if (target === "local") {
      setDriveOnboardingIntent(null);
      setBoardPrimaryStorage(boardId, target);
      cancelDriveOperations();
      window.clearTimeout(driveSyncTimerRef.current);
      await removeSyncJob(boardId).catch(() => undefined);
      if (!isCurrentStorageTargetOperation({
        expectedEpoch: operationEpoch,
        currentEpoch: storageTargetOperationEpochRef.current,
        expectedBoardId: boardId,
        currentBoardId: boardRef.current.id,
      })) return;
      setDriveSession((current) => ({
        ...current,
        status: current.connected ? "ready" : "disconnected",
        busy: false,
        message: "已切換到這台裝置；既有 Drive 檔案未刪除。",
        conflict: null,
      }));
      const snapshot = boardSnapshot();
      await persistBoardLocally(snapshot);
      if (!isCurrentStorageTargetOperation({
        expectedEpoch: operationEpoch,
        currentEpoch: storageTargetOperationEpochRef.current,
        expectedBoardId: boardId,
        currentBoardId: boardRef.current.id,
      })) return;
      await refreshLocalLibrarySummary();
      localFilePromptDismissedRef.current.delete(boardId);
      setShowLocalFileLocation(true);
      return;
    }

    setDriveOnboardingIntent({ boardId, operationEpoch });
    setSaveState("正在連結 Google Drive；本機安全副本持續保留");
    setShowSettings(false);
    if (!authReady) {
      requestAdvancedFeature("drive-onboarding");
      return;
    }
    const existingDriveToken = currentDriveAccessToken();
    if (driveSession.connected && existingDriveToken && ["ready", "synced", "synced-local-warning"].includes(driveSession.status)) return;
    setShowDriveLibrary(true);
    if (existingDriveToken && ["checking", "connecting", "syncing", "conflict"].includes(driveSession.status)) return;
    if (existingDriveToken) {
      await refreshGoogleDrive();
      return;
    }
    await connectGoogleDrive({ onboarding: true });
  }, [announce, authReady, boardSnapshot, cancelDriveOperations, connectGoogleDrive, currentDriveAccessToken, driveSession.connected, driveSession.status, persistBoardLocally, refreshGoogleDrive, refreshLocalLibrarySummary, requestAdvancedFeature, setBoardPrimaryStorage]);

  const setAutoSavePreference = useCallback((enabled) => {
    updateStoragePreferences((current) => ({ ...current, autoSave: Boolean(enabled) }));
    if (!enabled) {
      window.clearTimeout(saveTimerRef.current);
      window.clearTimeout(driveSyncTimerRef.current);
      setSaveState("已關閉主要位置自動儲存；本機復原副本仍會更新");
    } else {
      setSaveState("自動儲存已開啟");
    }
    announce(enabled ? "已開啟自動儲存。" : "已關閉主要位置自動儲存；本機復原副本仍會保留。", enabled ? "success" : "warning");
  }, [announce, updateStoragePreferences]);

  const setSaveStatusPreference = useCallback((enabled) => {
    updateStoragePreferences((current) => ({ ...current, showSaveStatus: Boolean(enabled) }));
  }, [updateStoragePreferences]);

  useEffect(() => {
    window.clearTimeout(driveSyncTimerRef.current);
    if (!hydrated || !authReady || !storagePreferences.autoSave || storagePreferences.uploadPaused[board.id] || currentPrimaryStorageTarget !== "drive" || !driveSettings.enabled || !driveSettings.autoSync || !currentDriveLink || driveSession.conflict) return undefined;
    const alreadySynced = currentDriveLink.syncedRevision >= board.revision
      && (!board.updatedAt || currentDriveLink.syncedUpdatedAt === board.updatedAt);
    if (alreadySynced) return undefined;
    if (!online) {
      setDriveSession((current) => ({ ...current, status: "offline", busy: false, message: "目前離線；最新變更已先保存在這台裝置。" }));
      return undefined;
    }
    if (driveSession.status === "error") {
      const currentSyncJob = syncJobs.find((job) => String(job.boardId || job.id) === String(board.id));
      const retryAt = Date.parse(currentSyncJob?.nextAttemptAt || "");
      if (!Number.isFinite(retryAt)) return undefined;
      driveSyncTimerRef.current = window.setTimeout(() => {
        saveBoardToGoogleDrive({ silent: true });
      }, Math.max(0, retryAt - Date.now()));
      return () => window.clearTimeout(driveSyncTimerRef.current);
    }
    if (driveSession.busy || ["checking", "connecting", "syncing", "quota"].includes(driveSession.status)) return undefined;
    if (!currentDriveAccessToken() && driveSession.status === "authorization-required") return undefined;
    setDriveSession((current) => ({ ...current, status: "pending", connected: true, busy: false, message: "停止操作後會同步最新版本。" }));
    driveSyncTimerRef.current = window.setTimeout(() => {
      saveBoardToGoogleDrive({ silent: true });
    }, 6000);
    return () => window.clearTimeout(driveSyncTimerRef.current);
  }, [authReady, board.id, board.revision, board.updatedAt, currentDriveAccessToken, currentDriveLink, currentPrimaryStorageTarget, driveSession.busy, driveSession.conflict, driveSession.status, driveSettings.autoSync, driveSettings.enabled, hydrated, online, saveBoardToGoogleDrive, storagePreferences.autoSave, storagePreferences.uploadPaused, syncJobs]);

  const exportBrowserHtml = useCallback(async () => {
    try {
      announce("正在準備瀏覽器版…", "info");
      const { createPortableHtml } = await loadPortableRuntime();
      const snapshot = boardSnapshot();
      const filename = `${safeFilename(snapshot.name, "moodboard")}-${safeFilename(translateInterfaceText("瀏覽版"), "browser-view")}.html`;
      const content = createPortableHtml(snapshot, { locale: interfaceLocale });
      downloadBlob(new Blob([content], { type: "text/html;charset=utf-8" }), filename);
      announce("瀏覽器版 HTML 已下載；可離線開啟，但不會改動原始工作檔。", "success");
    } catch {
      announce("瀏覽器版匯出失敗；原始 Infinite Studio 仍保留。", "error");
    }
  }, [announce, boardSnapshot, interfaceLocale]);

  const duplicateObjects = useCallback((objectIds) => {
    const selected = new Set(objectIds);
    if (!selected.size) return;
    const current = boardRef.current;
    const sources = current.objects.filter((object) => selected.has(object.id));
    const idMap = new Map(sources.map((object) => [object.id, createId("object")]));
    const selectedGroups = (current.groups || []).filter((group) => group.memberIds.length >= 2 && group.memberIds.every((id) => selected.has(id)));
    const groupMap = new Map(selectedGroups.map((group) => [group.id, createId("group")]));
    const copies = sources.map((object) => {
      const copy = createObjectDuplicate(object, {
        id: idMap.get(object.id),
        groupId: groupMap.get(object.groupId) || null,
      });
      return {
        ...copy,
        annotationTargetIds: (object.annotationTargetIds || []).map((id) => idMap.get(id) || id),
      };
    });
    if (!copies.length) return;
    const newGroups = selectedGroups.map((group) => createGroup(
      group.memberIds.map((id) => idMap.get(id)).filter(Boolean),
      { id: groupMap.get(group.id), name: `${group.name} 複本`, aspectLocked: group.aspectLocked !== false },
    ));
    applyBoard((boardState) => ({ ...boardState, objects: [...boardState.objects, ...copies], groups: [...(boardState.groups || []), ...newGroups] }));
    const copyIds = copies.map((object) => object.id);
    selectedIdsRef.current = copyIds;
    setSelectedIds(copyIds);
    setKeyObjectId(copyIds[0] || null);
    announce(`已複製 ${copies.length} 個物件`, "success");
  }, [announce, applyBoard]);

  const duplicateSelected = useCallback(() => duplicateObjects(selectedIdsRef.current), [duplicateObjects]);
  const duplicateLayerObject = useCallback((objectId) => duplicateObjects([objectId]), [duplicateObjects]);

  const copySelectedObjects = useCallback((clipboardData = null) => {
    const selected = new Set(selectedIdsRef.current);
    const objects = boardRef.current.objects.filter((object) => selected.has(object.id));
    if (!objects.length) return false;
    const groups = (boardRef.current.groups || []).filter((group) => group.memberIds.every((id) => selected.has(id)));
    objectClipboardRef.current = {
      objects: objects.map((object) => ({ ...object, markers: object.markers.map((marker) => ({ ...marker })) })),
      groups: groups.map((group) => ({ ...group, memberIds: [...group.memberIds] })),
    };
    if (clipboardData) {
      try {
        if (objects.some((object) => String(object.src || "").startsWith("blob:"))) throw new Error("temporary media");
        clipboardData.setData("text/plain", serializeObjectClipboard(objectClipboardRef.current));
        announce(`已複製 ${objects.length} 個物件，可貼到其他分頁`, "success");
      } catch {
        announce("無法複製物件，請重試或下載 .studio 備份。", "warning");
        return false;
      }
    } else announce(`已複製 ${objects.length} 個物件到內部剪貼簿`, "success");
    return true;
  }, [announce]);

  const pasteCopiedObjects = useCallback((value = null) => {
    const clipboard = value || objectClipboardRef.current;
    if (!clipboard?.objects?.length) return false;
    const idMap = new Map(clipboard.objects.map((object) => [object.id, createId("object")]));
    const groupMap = new Map((clipboard.groups || []).map((group) => [group.id, createId("group")]));
    const flowMap = new Map(clipboard.objects.filter((object) => object.textFlowId).map((object) => [object.textFlowId, createId("text-flow")]));
    const copies = clipboard.objects.map((object) => createObjectDuplicate(object, {
      id: idMap.get(object.id),
      groupId: groupMap.get(object.groupId) || null,
    })).map((copy, index) => ({
      ...copy,
      artboardId: idMap.get(clipboard.objects[index].artboardId) || null,
      annotationTargetIds: copy.annotationTargetIds.map((id) => idMap.get(id)).filter(Boolean),
      ...(clipboard.objects[index].textFlowId ? {
        textFlowId: flowMap.get(clipboard.objects[index].textFlowId),
        textFlowOrder: clipboard.objects[index].textFlowOrder,
        flowText: clipboard.objects[index].flowText,
        textFlowOverflow: clipboard.objects[index].textFlowOverflow,
      } : {}),
    }));
    const groups = (clipboard.groups || []).map((group) => createGroup(
      group.memberIds.map((id) => idMap.get(id)).filter(Boolean),
      { id: groupMap.get(group.id), name: `${group.name} 複本`, aspectLocked: group.aspectLocked !== false },
    ));
    applyBoard((current) => ({ ...current, objects: [...current.objects, ...copies], groups: [...(current.groups || []), ...groups] }));
    const ids = copies.map((object) => object.id);
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
    setKeyObjectId(ids[0] || null);
    setTool("select");
    announce(`已貼上 ${copies.length} 個物件`, "success");
    return true;
  }, [announce, applyBoard]);

  const performDeleteObjects = useCallback((objectIds) => {
    const selected = new Set(objectIds);
    if (!selected.size) return;
    const count = boardRef.current.objects.filter((object) => selected.has(object.id)).length;
    if (!count) return;
    applyBoard((current) => compactBoardStructure({ ...current, objects: current.objects.filter((object) => !selected.has(object.id)) }));
    setSelectedIds((current) => current.filter((id) => !selected.has(id)));
    announce(`已刪除 ${count} 個物件；可按 ⌘Z 復原。`, "warning");
  }, [announce, applyBoard]);

  const requestDeleteObjects = useCallback((objectIds) => {
    const current = boardRef.current;
    const requested = new Set(objectIds);
    const existingIds = current.objects.filter((object) => requested.has(object.id)).map((object) => object.id);
    if (!existingIds.length) return;
    const affectedCompositions = findCompositionsAffectedByObjectDeletion(current, existingIds);
    if (affectedCompositions.length) {
      setPendingObjectDeletion({ objectIds: existingIds, affectedCompositions });
      return;
    }
    performDeleteObjects(existingIds);
  }, [performDeleteObjects]);

  const cancelPendingObjectDeletion = useCallback(() => setPendingObjectDeletion(null), []);
  const confirmPendingObjectDeletion = useCallback(() => {
    if (!pendingObjectDeletion) return;
    const { objectIds } = pendingObjectDeletion;
    setPendingObjectDeletion(null);
    performDeleteObjects(objectIds);
  }, [pendingObjectDeletion, performDeleteObjects]);

  const deleteSelected = useCallback(() => {
    if (selectedGuideIdsRef.current.length) {
      deleteGuides(selectedGuideIdsRef.current);
      return;
    }
    requestDeleteObjects(selectedIdsRef.current);
  }, [deleteGuides, requestDeleteObjects]);
  const deleteLayerObject = useCallback((objectId) => requestDeleteObjects([objectId]), [requestDeleteObjects]);
  const cutSelectedObjects = useCallback((clipboardData) => {
    if (!clipboardData || !copySelectedObjects(clipboardData)) return false;
    requestDeleteObjects(selectedIdsRef.current);
    return true;
  }, [copySelectedObjects, requestDeleteObjects]);

  const selectGroup = useCallback((groupId, additive = false) => {
    const group = (boardRef.current.groups || []).find((item) => item.id === groupId);
    if (!group) return;
    const current = selectedIdsRef.current;
    const memberIds = group.memberIds.filter((id) => boardRef.current.objects.some((object) => object.id === id));
    const next = additive
      ? memberIds.every((id) => current.includes(id))
        ? current.filter((id) => !memberIds.includes(id))
        : [...new Set([...current, ...memberIds])]
      : memberIds;
    selectedIdsRef.current = next;
    setSelectedIds(next);
    setKeyObjectId(next[0] || null);
    setTool("select");
  }, []);

  const groupSelection = useCallback(() => {
    const ids = [...new Set(selectedIdsRef.current)].filter((id) => boardRef.current.objects.some((object) => object.id === id));
    if (ids.length < 2) {
      announce("至少選取 2 個物件才能建立群組。", "warning");
      return;
    }
    const group = createGroup(ids, { name: `群組 ${String((boardRef.current.groups?.length || 0) + 1).padStart(2, "0")}` });
    applyBoard((current) => {
      const strippedGroups = (current.groups || []).map((item) => ({ ...item, memberIds: item.memberIds.filter((id) => !ids.includes(id)) }));
      const next = {
        ...current,
        groups: [...strippedGroups, group],
        objects: current.objects.map((object) => ids.includes(object.id) ? { ...object, groupId: group.id } : object),
      };
      return compactBoardStructure(next);
    });
    announce(`已將 ${ids.length} 個物件建立為群組；按住 ⌘／Ctrl 可穿透選取。`, "success");
  }, [announce, applyBoard]);

  const ungroupSelection = useCallback((explicitGroupId = null) => {
    const selected = new Set(selectedIdsRef.current);
    const groupIds = explicitGroupId
      ? [explicitGroupId]
      : (boardRef.current.groups || []).filter((group) => group.memberIds.some((id) => selected.has(id))).map((group) => group.id);
    if (!groupIds.length) {
      announce("目前選取沒有可解散的群組。", "warning");
      return;
    }
    const targets = new Set(groupIds);
    applyBoard((current) => ({
      ...current,
      groups: (current.groups || []).filter((group) => !targets.has(group.id)),
      objects: current.objects.map((object) => targets.has(object.groupId) ? { ...object, groupId: null } : object),
    }));
    announce(`已解散 ${groupIds.length} 個群組；物件與圖層都保留。`, "success");
  }, [announce, applyBoard]);

  const toggleSelectionGroup = useCallback(() => {
    if (selectedGuideIdsRef.current.length) {
      toggleGuideSelectionGroup();
      return;
    }
    const selected = selectedIdsRef.current;
    const groups = boardRef.current.groups || [];
    const shared = groups.find((group) => selected.length === group.memberIds.length && group.memberIds.every((id) => selected.includes(id)));
    if (shared) ungroupSelection(shared.id);
    else groupSelection();
  }, [groupSelection, toggleGuideSelectionGroup, ungroupSelection]);

  const setSelectedVisibility = useCallback((visible) => {
    const selected = new Set(selectedIdsRef.current);
    if (!selected.size) return;
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => selected.has(object.id) ? { ...object, visible } : object),
    }));
    announce(`已${visible ? "顯示" : "隱藏"} ${selected.size} 個選取物件`, "success");
  }, [announce, applyBoard]);

  const addArtboardBehindSelection = useCallback(() => {
    const selected = new Set(selectedIdsRef.current);
    const targets = boardRef.current.objects.filter((object) => selected.has(object.id) && object.visible);
    if (!targets.length) {
      announce("請先選取要放到紙張上的物件。", "warning");
      return;
    }
    const artboard = createArtboardFromObjects(targets, { padding: 40, name: `紙張 ${(boardRef.current.objects.filter(isArtboardObject).length + 1).toString().padStart(2, "0")}` });
    if (!artboard) return;
    applyBoard((current) => {
      const targetIds = new Set(targets.map((object) => object.id));
      const objects = [...current.objects];
      const firstTargetIndex = Math.min(...objects.map((object, index) => targetIds.has(object.id) ? index : Number.POSITIVE_INFINITY));
      objects.splice(Number.isFinite(firstTargetIndex) ? firstTargetIndex : 0, 0, artboard);
      return { ...current, objects };
    });
    const nextSelection = [artboard.id];
    selectedIdsRef.current = nextSelection;
    setSelectedIds(nextSelection);
    setKeyObjectId(artboard.id);
    announce("已加入獨立紙張；40px 只作建立尺寸參考，如需連動請再建立群組。", "success");
  }, [announce, applyBoard]);

  const fitArtboardToContents = useCallback((artboardId) => {
    const artboard = boardRef.current.objects.find((object) => object.id === artboardId && isArtboardObject(object));
    const children = objectsVisuallyOnArtboard(boardRef.current.objects, artboardId);
    if (!artboard || !children.length) {
      announce("這張紙目前沒有可用來符合的內容。", "warning");
      return;
    }
    const fitted = createArtboardFromObjects(children, {
      id: artboard.id,
      name: artboard.name,
      fill: artboard.fill,
      padding: artboard.paperPadding,
      createdAt: artboard.createdAt,
    });
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === artboardId ? { ...artboard, ...fitted, updatedAt: new Date().toISOString() } : object),
    }));
    announce(`已依內容重新符合紙張，保留 ${Math.round(artboard.paperPadding)}px 邊距。`, "success");
  }, [announce, applyBoard]);

  const resizeArtboardPreset = useCallback((artboardId, preset, orientation) => {
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === artboardId ? resizeArtboardToPreset(object, preset, orientation) : object),
    }));
  }, [applyBoard]);

  const applyAnnotation = useCallback((options) => {
    const selected = new Set(selectedIdsRef.current);
    const targets = boardRef.current.objects.filter((object) => selected.has(object.id) && object.visible);
    const annotation = createAnnotationObject(targets, options);
    if (!annotation) return;
    applyBoard((current) => ({ ...current, objects: [...current.objects, annotation] }));
    selectedIdsRef.current = [annotation.id];
    setSelectedIds([annotation.id]);
    setKeyObjectId(annotation.id);
    setShowAnnotationBuilder(false);
    setTool("select");
    setEditingText({ id: annotation.id, selectAll: !String(options.text || "").trim() });
    announce(`已加入${options.kind === "description" ? "說明" : "標題"}文字。`, "success");
  }, [announce, applyBoard]);

  const applyGrid = useCallback((options) => {
    const selected = new Set(selectedIdsRef.current);
    let sources = boardRef.current.objects.filter((object) => selected.has(object.id) && object.visible && !isArtboardObject(object));
    const center = canvasCenterWorld();
    if (!sources.length) {
      const placeholder = createShapeObject("rectangle", center);
      placeholder.name = "Grid 預留位置 01";
      placeholder.layerName = placeholder.name;
      placeholder.fill = "#58e6ff";
      sources = [placeholder];
    }
    const count = Math.max(sources.length, Math.min(100, Number(options.count) || sources.length));
    const originalsAreNew = !sources.every((source) => boardRef.current.objects.some((object) => object.id === source.id));
    const items = originalsAreNew ? sources : [...sources];
    while (items.length < count) {
      const source = sources[items.length % sources.length];
      const copy = createObjectDuplicate(source, { offset: 0, groupId: null, artboardId: null });
      copy.name = `${source.name} Grid ${String(items.length + 1).padStart(2, "0")}`;
      copy.layerName = copy.name;
      items.push(copy);
    }
    const cellWidth = Math.max(...items.map((object) => object.width));
    const cellHeight = Math.max(...items.map((object) => object.height));
    const columns = Math.max(1, Math.min(count, Number(options.columns) || 1));
    const rows = Math.ceil(count / columns);
    const startX = originalsAreNew
      ? center.x - (columns * cellWidth + (columns - 1) * options.gapX) / 2
      : selectionWorldBounds(sources)?.left;
    const startY = originalsAreNew
      ? center.y - (rows * cellHeight + (rows - 1) * options.gapY) / 2
      : selectionWorldBounds(sources)?.top;
    const arranged = arrangeObjectsInGrid(items, { ...options, columns, startX, startY });
    const arrangedMap = new Map(arranged.map((object) => [object.id, object]));
    const existingIds = new Set(boardRef.current.objects.map((object) => object.id));
    const created = arranged.filter((object) => !existingIds.has(object.id));
    applyBoard((current) => ({
      ...current,
      objects: [...current.objects.map((object) => arrangedMap.get(object.id) || object), ...created],
    }));
    const ids = arranged.map((object) => object.id);
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
    setKeyObjectId(ids[0] || null);
    setShowGridBuilder(false);
    setTool("select");
    announce(`已建立 ${columns} 欄、${rows} 列，共 ${count} 個物件的 Grid。`, "success");
  }, [announce, applyBoard, canvasCenterWorld]);

  const undo = useCallback(() => {
    if (cloudReadOnly) return;
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push({ ...boardRef.current, view: { ...viewRef.current } });
    const next = stampBoard(previous, sessionIdRef.current);
    const nextView = previous.view || viewRef.current;
    viewRef.current = nextView;
    setView(nextView);
    boardRef.current = next;
    setBoard(next);
    setSelectedIds((current) => current.filter((id) => next.objects.some((object) => object.id === id)));
    publishBoard(next);
    setDirty(true);
    setHistorySignal((value) => value + 1);
  }, [cloudReadOnly, publishBoard]);

  const redo = useCallback(() => {
    if (cloudReadOnly) return;
    const nextSnapshot = redoRef.current.pop();
    if (!nextSnapshot) return;
    undoRef.current.push({ ...boardRef.current, view: { ...viewRef.current } });
    const next = stampBoard(nextSnapshot, sessionIdRef.current);
    const nextView = nextSnapshot.view || viewRef.current;
    viewRef.current = nextView;
    setView(nextView);
    boardRef.current = next;
    setBoard(next);
    publishBoard(next);
    setDirty(true);
    setHistorySignal((value) => value + 1);
  }, [cloudReadOnly, publishBoard]);

  const updateObject = useCallback((id, patch) => {
    if (loadedTextFlow?.sourceId === id) setLoadedTextFlow(null);
    applyBoard((current) => {
      const target = current.objects.find((object) => object.id === id);
      const updatesStory = Object.prototype.hasOwnProperty.call(patch, "text");
      const now = new Date().toISOString();
      return {
        ...current,
        objects: current.objects.map((object) => {
          if (object.id === id) return { ...object, ...patch, updatedAt: now };
          if (updatesStory && target?.textFlowId && object.textFlowId === target.textFlowId) {
            return { ...object, text: patch.text, updatedAt: now };
          }
          return object;
        }),
      };
    });
  }, [applyBoard, loadedTextFlow]);

  const startTextEdit = useCallback((event, id, selectAll = false) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (cloudReadOnly) {
      announce("目前為僅檢視；請先申請編輯權限。", "warning");
      return;
    }
    if (loadedTextFlow) {
      setLoadedTextFlow(null);
      announce("已取消放置溢出文字；如要編輯，請再操作一次文字框。", "warning");
      return;
    }
    const object = boardRef.current.objects.find((item) => item.id === id);
    if (!isTextObject(object) || object.locked) {
      if (object?.locked) announce("這個文字物件已鎖定。", "warning");
      return;
    }
    selectedIdsRef.current = [id];
    setSelectedIds([id]);
    setKeyObjectId(id);
    setTool("select");
    setFilters(DEFAULT_FILTERS);
    setMobilePanel(null);
    textEditUndoRef.current = false;
    const displayText = objectDisplayText(object);
    let rangeStart = 0;
    if (object.textFlowId) {
      const frames = boardRef.current.objects
        .filter((item) => item.textFlowId === object.textFlowId)
        .sort((left, right) => left.textFlowOrder - right.textFlowOrder);
      for (const frame of frames) {
        if (frame.id === object.id) break;
        rangeStart += objectDisplayText(frame).length;
      }
    }
    textEditSessionRef.current = {
      id,
      flowId: object.textFlowId || null,
      rangeStart,
      rangeLength: displayText.length,
    };
    setEditingText({ id, selectAll });
  }, [announce, cloudReadOnly, loadedTextFlow]);

  const finishTextEdit = useCallback(() => {
    textEditUndoRef.current = false;
    textEditSessionRef.current = null;
    setEditingText(null);
  }, []);

  const updateInlineText = useCallback((id, text) => {
    if (!textEditUndoRef.current) {
      pushUndo(boardRef.current);
      textEditUndoRef.current = true;
    }
    applyBoard((current) => {
      const object = current.objects.find((item) => item.id === id);
      const session = textEditSessionRef.current;
      const now = new Date().toISOString();
      if (object?.textFlowId && session?.id === id && session.flowId === object.textFlowId) {
        const story = String(object.text || "");
        const start = Math.max(0, Math.min(story.length, session.rangeStart));
        const end = Math.max(start, Math.min(story.length, start + session.rangeLength));
        const nextStory = `${story.slice(0, start)}${text}${story.slice(end)}`;
        session.rangeLength = text.length;
        return {
          ...current,
          objects: current.objects.map((item) => item.textFlowId === object.textFlowId
            ? { ...item, text: nextStory, updatedAt: now }
            : item),
        };
      }
      return {
        ...current,
        objects: current.objects.map((item) => item.id === id
          ? { ...item, text, updatedAt: now }
          : item),
      };
    }, { record: false });
  }, [applyBoard, pushUndo]);

  const resizeTextFrame = useCallback((id, patch) => {
    if (loadedTextFlow?.sourceId === id) setLoadedTextFlow(null);
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === id && isTextObject(object)
        ? {
            ...object,
            ...(Number.isFinite(patch.width) ? { width: Math.max(24, patch.width) } : {}),
            ...(Number.isFinite(patch.height) ? { height: Math.max(24, patch.height) } : {}),
            updatedAt: new Date().toISOString(),
          }
        : object),
    }));
  }, [applyBoard, loadedTextFlow]);

  const autoFitTextFrame = useCallback((id, dimension) => {
    const object = boardRef.current.objects.find((item) => item.id === id);
    if (!isTextObject(object) || object.locked) return;
    const axis = dimension === "height" ? "height" : "width";
    const targetSize = measureTextFrameContent({ ...object, text: objectDisplayText(object), textFlowId: null }, axis);
    if (Math.abs(targetSize - object[axis]) < 0.5) {
      announce(`文字內容${axis === "width" ? "寬度" : "高度"}已經符合。`, "success");
      return;
    }
    const nextObject = resizeTextFrameToDimension(object, axis, targetSize);
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((item) => item.id === id ? nextObject : item),
    }));
    announce(`已讓文字框${axis === "width" ? "寬度" : "高度"}自動符合內容。`, "success");
    requestAnimationFrame(() => document.querySelector(`[data-object-id="${id}"] .canvas-text-editor`)?.focus({ preventScroll: true }));
  }, [announce, applyBoard]);

  const loadTextOverflow = useCallback((id) => {
    const object = boardRef.current.objects.find((item) => item.id === id);
    if (!isTextObject(object) || object.locked) return;
    if (loadedTextFlow?.sourceId === id) {
      setLoadedTextFlow(null);
      announce("已取消放置溢出文字。", "warning");
      return;
    }
    selectedIdsRef.current = [id];
    setSelectedIds([id]);
    setKeyObjectId(id);
    setTool("select");
    setFilters(DEFAULT_FILTERS);
    setLoadedTextFlow({ sourceId: id });
    announce("已載入溢出文字；請在空白畫布點一下建立連結文字框，Esc 可取消。", "success");
  }, [announce, loadedTextFlow]);

  const placeTextOverflow = useCallback((event) => {
    const sourceId = loadedTextFlow?.sourceId;
    if (!sourceId) return false;
    const current = boardRef.current;
    const source = current.objects.find((object) => object.id === sourceId);
    if (!isTextObject(source)) {
      setLoadedTextFlow(null);
      announce("原文字框已不存在，已取消放置。", "warning");
      return true;
    }

    const point = screenToWorld(event.clientX, event.clientY);
    const flowId = source.textFlowId || createId("text-flow");
    const frames = current.objects
      .filter((object) => object.id === source.id || object.textFlowId === flowId)
      .sort((left, right) => left.textFlowOrder - right.textFlowOrder);
    const story = String(source.text || "");
    const now = new Date().toISOString();
    const width = Math.max(24, Number(source.width) || 320);
    const height = Math.max(24, Number(source.height) || 120);
    const continuationNumber = frames.length + 1;
    const continuation = {
      ...createTextObject({ x: point.x + width / 2, y: point.y + height / 2 }),
      id: createId("object"),
      name: `${source.name} 續 ${continuationNumber}`,
      layerName: `${source.layerName} 續 ${continuationNumber}`,
      pivotX: point.x + width / 2,
      pivotY: point.y + height / 2,
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      text: story,
      textFlowId: flowId,
      textFlowOrder: frames.length,
      flowText: "",
      textFlowOverflow: true,
      fontFamily: source.fontFamily,
      fontWeight: source.fontWeight,
      fontSize: source.fontSize,
      lineHeight: source.lineHeight ?? 1.2,
      originalFontSize: source.fontSize,
      color: source.color,
      textAlign: source.textAlign,
      textAlignLast: source.textAlignLast,
      textVerticalAlign: source.textVerticalAlign,
      createdAt: now,
      updatedAt: now,
    };
    applyBoard({
      ...current,
      objects: [
        ...current.objects.map((object) => {
          if (object.id === source.id && !source.textFlowId) {
            return {
              ...object,
              textFlowId: flowId,
              textFlowOrder: 0,
              flowText: objectDisplayText(object),
              textFlowOverflow: false,
              updatedAt: now,
            };
          }
          return object;
        }),
        continuation,
      ],
    });
    selectedIdsRef.current = [continuation.id];
    setSelectedIds([continuation.id]);
    setKeyObjectId(continuation.id);
    setLoadedTextFlow(null);
    announce("已建立連結文字框；調整前一框尺寸時，文字會重新流向下一框。", "success");
    return true;
  }, [announce, applyBoard, loadedTextFlow, screenToWorld]);

  const loadLocalFonts = useCallback(async () => {
    if (typeof window.queryLocalFonts !== "function") {
      setLocalFontState({ status: "unsupported", message: "此瀏覽器不支援讀取本機字體，仍可使用內建字體。" });
      announce("目前瀏覽器不支援本機字體存取。", "warning");
      return;
    }
    setLocalFontState({ status: "loading", message: "等待瀏覽器讀取本機字體…" });
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map((font) => font.family?.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "zh-Hant"));
      setLocalFontOptions(families.map((family) => ({ label: family, value: localFontCssValue(family) })));
      setLocalFontState({
        status: "loaded",
        message: families.length
          ? `已載入 ${families.length} 個字體家族；工作檔只保存字體名稱。`
          : "瀏覽器沒有回傳可用的本機字體。",
      });
      announce(families.length ? `已載入 ${families.length} 個本機字體家族` : "沒有找到可用的本機字體。", families.length ? "success" : "warning");
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      setLocalFontState({
        status: denied ? "denied" : "error",
        message: denied
          ? "未取得本機字體權限；可在瀏覽器的網站設定重新允許。"
          : "無法讀取本機字體，仍可使用內建字體。",
      });
      announce(denied ? "未取得本機字體權限。" : "本機字體讀取失敗。", "warning");
    }
  }, [announce]);

  const setVideoControlsVisible = useCallback((id, visible) => {
    updateObject(id, { videoControlsVisible: visible });
  }, [updateObject]);

  const setSelectedAspectLock = useCallback((locked) => {
    const selected = new Set(selectedIdsRef.current);
    if (!selected.size) return;
    applyBoard((current) => {
      const exactGroup = (current.groups || []).find((group) => (
        group.memberIds.length === selected.size
        && group.memberIds.every((id) => selected.has(id))
      ));
      if (exactGroup) {
        return {
          ...current,
          groups: current.groups.map((group) => group.id === exactGroup.id
            ? { ...group, aspectLocked: locked, updatedAt: new Date().toISOString() }
            : group),
        };
      }
      return {
        ...current,
        objects: current.objects.map((object) => selected.has(object.id)
          ? { ...object, aspectLocked: locked, updatedAt: new Date().toISOString() }
          : object),
      };
    });
  }, [applyBoard]);

  const updateSelectedMicro3D = useCallback((patch) => {
    const selected = new Set(selectedIdsRef.current);
    if (!selected.size) return;
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => selected.has(object.id)
        ? { ...object, ...patch, updatedAt: new Date().toISOString() }
        : object),
    }));
  }, [applyBoard]);

  const resetSelectedMicro3D = useCallback(() => {
    updateSelectedMicro3D({ tiltX: 0, tiltY: 0, depth: 0, perspective: 1000 });
  }, [updateSelectedMicro3D]);

  const changePivot = useCallback((id, anchor) => {
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === id ? movePivotPreservingPlacement(object, anchor) : object),
    }));
  }, [applyBoard]);

  const restoreSize = useCallback((id) => {
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === id ? restoreObjectSize(object) : object),
    }));
    announce("已還原物件的原始尺寸", "success");
  }, [announce, applyBoard]);

  const resetRotation = useCallback((id) => {
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === id
        ? { ...object, rotation: 0, updatedAt: new Date().toISOString() }
        : object),
    }));
    announce("已將旋轉角度歸零", "success");
  }, [announce, applyBoard]);

  const addMarker = useCallback(() => {
    const selected = new Set(selectedIdsRef.current);
    if (!selected.size) return;
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!selected.has(object.id)) return object;
        const markers = upsertMarkerBySymbol(object.markers, markerDraft);
        return markers === object.markers
          ? object
          : { ...object, markers, updatedAt: new Date().toISOString() };
      }),
    }));
    announce(`已套用「${MARKER_LABELS[markerDraft.symbol]} · ${MARKER_COLOR_LABELS[markerDraft.color]}」`, "success");
  }, [announce, applyBoard, markerDraft]);

  const removeMarker = useCallback((markerToRemove) => {
    const selected = new Set(selectedIdsRef.current);
    const key = markerKey(markerToRemove);
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => selected.has(object.id)
        ? { ...object, markers: object.markers.filter((marker) => markerKey(marker) !== key), updatedAt: new Date().toISOString() }
        : object),
    }));
  }, [applyBoard]);

  const batchRename = useCallback(() => {
    const prefix = batchPrefix.trim();
    const selected = new Set(selectedIdsRef.current);
    if (!prefix || !selected.size) return;
    let index = 0;
    applyBoard((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!selected.has(object.id)) return object;
        index += 1;
        return { ...object, layerName: `${prefix} ${String(index).padStart(2, "0")}`, updatedAt: new Date().toISOString() };
      }),
    }));
    announce(`已重新命名 ${index} 個圖層`, "success");
  }, [announce, applyBoard, batchPrefix]);

  const alignSelected = useCallback((mode) => {
    const selected = selectedIdsRef.current;
    if (selected.length < 2) return;
    const keyId = selected.includes(keyObjectId) ? keyObjectId : selected[0];
    applyBoard((current) => ({
      ...current,
      objects: alignObjectsToKey(current.objects, selected, keyId, mode),
    }));
    const labels = {
      left: "靠左對齊",
      hcenter: "水平置中",
      right: "靠右對齊",
      top: "靠上對齊",
      vcenter: "垂直置中",
      bottom: "靠下對齊",
    };
    announce(`已依基準物件${labels[mode] || "對齊"}`, "success");
  }, [announce, applyBoard, keyObjectId]);

  const distributeSelected = useCallback((axis) => {
    const selected = selectedIdsRef.current;
    if (selected.length < 3) {
      announce("平均分布至少需要 3 個物件。", "warning");
      return;
    }
    const keyId = selected.includes(keyObjectId) ? keyObjectId : selected[0];
    applyBoard((current) => ({
      ...current,
      objects: distributeObjectsByGap(current.objects, selected, keyId, axis),
    }));
    announce(`已依基準物件${axis === "horizontal" ? "水平" : "垂直"}平均分布`, "success");
  }, [announce, applyBoard, keyObjectId]);

  const toggleVisibility = useCallback((id) => {
    applyBoard((current) => ({ ...current, objects: current.objects.map((object) => object.id === id ? { ...object, visible: !object.visible } : object) }));
  }, [applyBoard]);

  const moveLayer = useCallback((ids, direction) => {
    applyBoard((current) => ({
      ...current,
      objects: moveObjectsByVisualStep(current.objects, ids, direction),
    }));
  }, [applyBoard]);

  const reorderLayer = useCallback((ids, targetId, placement) => {
    applyBoard((current) => ({
      ...current,
      objects: reorderObjectsByVisualDrop(current.objects, ids, targetId, placement),
    }));
  }, [applyBoard]);

  const centerObjectView = useCallback((id) => {
    const object = boardRef.current.objects.find((item) => item.id === id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!object || !rect) return false;
    if (!object.visible) {
      announce(`「${object.layerName}」目前已隱藏，請先按眼睛顯示圖層。`, "warning");
      return false;
    }
    const nextView = viewObjectInViewport(object, { width: rect.width, height: rect.height });
    viewRef.current = nextView;
    setView(nextView);
    setSelectedCaptureId(null);
    setMobilePanel(null);
    if (filters.symbols.length || filters.colors.length) setFilters(DEFAULT_FILTERS);
    announce(`已將「${object.layerName}」置中顯示；物件原始位置未改變。`, "success");
    return true;
  }, [announce, filters.colors.length, filters.symbols.length]);

  const locateObject = useCallback((id) => {
    if (!centerObjectView(id)) return;
    selectedIdsRef.current = [id];
    setSelectedIds([id]);
    setKeyObjectId(id);
    setTool("select");
  }, [centerObjectView]);

  const captureCurrentView = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawCapture = createViewCapture(
      boardRef.current,
      viewRef.current,
      { width: rect.width, height: rect.height },
    );
    const capture = { ...rawCapture, name: translateInterfaceText(rawCapture.name) };
    applyBoard((current) => ({ ...current, captures: [...current.captures, capture] }));
    setSelectedCaptureId(capture.id);
    changeLeftTab("captures");
    announce(`已建立「${capture.name}」`, "success");
  }, [announce, applyBoard, changeLeftTab]);

  const restoreComposition = useCallback((capture, selectedId = null, label = capture?.name || "構圖") => {
    if (!capture) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const current = boardRef.current;
    const previous = current.lastComposition;
    const leavingComposition = createViewCapture(
      current,
      viewRef.current,
      { width: rect?.width || capture.viewport.width, height: rect?.height || capture.viewport.height },
      {
        id: previous?.id || createId("capture"),
        name: translateInterfaceText("切換前的構圖"),
        createdAt: previous?.createdAt,
      },
    );
    const nextView = {
      ...capture.view,
      x: capture.view.x + ((rect?.width || capture.viewport.width) - capture.viewport.width) / 2,
      y: capture.view.y + ((rect?.height || capture.viewport.height) - capture.viewport.height) / 2,
    };
    const restored = restoreViewCapture(current, capture);
    applyBoard({ ...restored, lastComposition: leavingComposition, view: nextView });
    viewRef.current = nextView;
    setView(nextView);
    setSelectedCaptureId(selectedId);
    setEditingText(null);
    textEditUndoRef.current = false;
    setSelectedIds([]);
    selectedIdsRef.current = [];
    setFilters(DEFAULT_FILTERS);
    setTool("select");
    setMobilePanel(null);
    announce(`已回到「${label}」；切換前構圖已保留`, "success");
  }, [announce, applyBoard]);

  const restoreCapture = useCallback((capture) => {
    restoreComposition(capture, capture.id, capture.name);
  }, [restoreComposition]);

  const restoreLastComposition = useCallback(() => {
    const previous = boardRef.current.lastComposition;
    if (!previous) return;
    restoreComposition(previous, null, translateInterfaceText("切換前構圖"));
  }, [restoreComposition]);

  const replaceCapture = useCallback((capture) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const replacement = createViewCapture(
      boardRef.current,
      viewRef.current,
      { width: rect.width, height: rect.height },
      capture,
    );
    applyBoard((current) => ({
      ...current,
      captures: current.captures.map((item) => item.id === capture.id ? replacement : item),
    }));
    setSelectedCaptureId(capture.id);
    announce(`已取代「${capture.name}」`, "success");
  }, [announce, applyBoard]);

  const moveCapture = useCallback((id, direction) => {
    applyBoard((current) => {
      const captures = [...current.captures];
      const index = captures.findIndex((capture) => capture.id === id);
      const nextIndex = clamp(index + direction, 0, captures.length - 1);
      if (index < 0 || nextIndex === index) return current;
      const [capture] = captures.splice(index, 1);
      captures.splice(nextIndex, 0, capture);
      return { ...current, captures };
    });
  }, [applyBoard]);

  const reorderCapture = useCallback((id, targetId, placement) => {
    applyBoard((current) => ({
      ...current,
      captures: reorderCapturesByVisualDrop(current.captures, id, targetId, placement),
    }));
  }, [applyBoard]);

  const deleteCapture = useCallback((id) => {
    const capture = boardRef.current.captures.find((item) => item.id === id);
    if (!capture) return;
    applyBoard((current) => ({
      ...current,
      captures: current.captures.filter((item) => item.id !== id),
    }));
    setSelectedCaptureId((current) => current === id ? null : current);
    announce(`已刪除「${capture.name}」；可按 ⌘Z 復原。`, "warning");
  }, [announce, applyBoard]);

  const startCanvasPan = useCallback((event, { clearSelectionOnClick = false, onMoveStart } = {}) => {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, view: viewRef.current };
    let moved = false;
    let releaseGesture = () => {};
    const move = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      onMoveStart?.();
      setIsPanning(true);
      const nextView = { ...start.view, x: start.view.x + dx, y: start.view.y + dy };
      viewRef.current = nextView;
      setView(nextView);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setIsPanning(false);
      if (!moved && clearSelectionOnClick) {
        selectedIdsRef.current = [];
        setSelectedIds([]);
      }
    };
    const cancel = () => {
      cleanup();
      setIsPanning(false);
      viewRef.current = start.view;
      setView(start.view);
    };
    releaseGesture = registerPointerGesture({
      label: "平移畫布",
      affectsDocument: false,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [registerPointerGesture]);

  const onObjectPointerDown = useCallback((event, id) => {
    if (event.button !== 0 || filters.symbols.length || filters.colors.length) return;
    event.stopPropagation();
    if (loadedTextFlow) {
      event.preventDefault();
      announce("請在空白畫布點一下，以建立連結文字框。", "warning");
      return;
    }
    const penetrate = event.metaKey || event.ctrlKey;
    const temporarySelect = (tool === "hand" || spaceDown) && event.shiftKey;
    const selectionOverride = temporarySelect || penetrate;
    const additive = event.shiftKey && !temporarySelect;
    if ((tool === "hand" || spaceDown) && !temporarySelect) {
      startCanvasPan(event);
      return;
    }
    if (!["select", "3d"].includes(tool) && !selectionOverride) return;
    const targetObject = boardRef.current.objects.find((object) => object.id === id);
    if (!targetObject) return;
    const targetIds = selectionIdsForObject(boardRef.current, id, { penetrate });
    const pressTime = performance.now();
    objectClickRef.current = { id, time: pressTime, x: event.clientX, y: event.clientY };
    const previousSelection = [...selectedIdsRef.current];
    let movingIds;
    if (temporarySelect) {
      movingIds = targetIds;
      selectedIdsRef.current = movingIds;
      setSelectedIds(movingIds);
      setKeyObjectId(id);
    } else if (additive) {
      if (targetIds.every((targetId) => previousSelection.includes(targetId))) {
        const next = previousSelection.filter((item) => !targetIds.includes(item));
        selectedIdsRef.current = next;
        setSelectedIds(next);
        return;
      }
      movingIds = [...new Set([...previousSelection, ...targetIds])];
      selectedIdsRef.current = movingIds;
      setSelectedIds(movingIds);
      if (!previousSelection.length) setKeyObjectId(id);
    } else if (targetIds.every((targetId) => previousSelection.includes(targetId))) {
      movingIds = previousSelection;
    } else {
      movingIds = targetIds;
      selectedIdsRef.current = movingIds;
      setSelectedIds(movingIds);
      setKeyObjectId(id);
    }
    if (cloudReadOnly || tool === "3d") return;
    if (targetObject.locked) return;
    event.preventDefault();
    const base = boardRef.current;
    const historyBefore = captureGestureHistory();
    const initial = new Map(base.objects.filter((object) => movingIds.includes(object.id) && !object.locked).map((object) => [object.id, { x: object.pivotX, y: object.pivotY }]));
    const movableIds = [...initial.keys()];
    if (!movableIds.length) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const zoom = viewRef.current.zoom;
    let moved = false;
    let releaseGesture = () => {};
    const move = (moveEvent) => {
      const rawDx = (moveEvent.clientX - startX) / zoom;
      const rawDy = (moveEvent.clientY - startY) / zoom;
      if (!moved && Math.hypot(rawDx, rawDy) * zoom < 3) return;
      if (!moved) {
        moved = true;
        pushUndo(base);
      }
      const alignment = resolveSmartAlignment({
        objects: base.objects,
        movingIds: movableIds,
        excludedIds: movingIds,
        deltaX: rawDx,
        deltaY: rawDy,
        zoom,
        viewport: (() => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const current = viewRef.current;
          return { left: -current.x / current.zoom, top: -current.y / current.zoom, right: (rect.width - current.x) / current.zoom, bottom: (rect.height - current.y) / current.zoom };
        })(),
        manualGuides: guidesVisible ? base.guides || [] : [],
        disabled: moveEvent.metaKey || moveEvent.ctrlKey,
        alternateAxis: moveEvent.altKey,
      });
      setSmartAlignmentGuides(alignment.guides);
      previewBoard({
        ...base,
        objects: base.objects.map((object) => initial.has(object.id) ? {
          ...object,
          pivotX: initial.get(object.id).x + alignment.deltaX,
          pivotY: initial.get(object.id).y + alignment.deltaY,
        } : object),
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      setSmartAlignmentGuides([]);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      if (moved) {
        objectClickRef.current = null;
        objectTapRef.current = null;
        finalizeGesture();
      } else {
        if (!selectionOverride && !additive && targetIds.length === 1 && previousSelection.length > 1 && previousSelection.includes(id)) {
          setKeyObjectId(id);
          announce(`已將「${targetObject.layerName}」設為對齊基準`, "success");
        }
      }
    };
    const cancel = () => {
      cleanup();
      objectClickRef.current = null;
      objectTapRef.current = null;
      previewBoard(base);
      if (moved) restoreGestureHistory(historyBefore);
    };
    releaseGesture = registerPointerGesture({
      label: movingIds.length > 1 ? `移動 ${movingIds.length} 個物件` : `移動「${targetObject.layerName}」`,
      affectsDocument: true,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [announce, captureGestureHistory, cloudReadOnly, filters.colors.length, filters.symbols.length, finalizeGesture, guidesVisible, loadedTextFlow, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory, spaceDown, startCanvasPan, tool]);

  const onObjectPointerUp = useCallback((event, id) => {
    if (event.button !== 0 || tool === "hand" || tool === "3d" || spaceDown || filters.symbols.length || filters.colors.length) return;
    if (event.target.closest?.("button, input, video, .canvas-video-controls, .canvas-text-editor")) return;
    const pending = objectClickRef.current;
    if (!pending || pending.id !== id) return;
    const now = performance.now();
    const previous = objectTapRef.current;
    const rapidSecondTap = previous
      && previous.id === id
      && now - previous.time <= 900
      && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 12;
    if (!rapidSecondTap) {
      objectTapRef.current = { id, time: now, x: event.clientX, y: event.clientY };
      return;
    }
    objectTapRef.current = null;
    objectClickRef.current = null;
    const object = boardRef.current.objects.find((item) => item.id === id);
    if (isTextObject(object) && !object.locked) requestAnimationFrame(() => startTextEdit(null, id));
    else centerObjectView(id);
  }, [centerObjectView, filters.colors.length, filters.symbols.length, spaceDown, startTextEdit, tool]);

  const onRotateStart = useCallback((event, id) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    const base = boardRef.current;
    const object = base.objects.find((item) => item.id === id);
    if (!object) return;
    const historyBefore = captureGestureHistory();
    pushUndo(base);
    setRotationGesture(true);
    let moved = false;
    let releaseGesture = () => {};
    const startPoint = screenToWorld(event.clientX, event.clientY);
    const startAngle = Math.atan2(startPoint.y - object.pivotY, startPoint.x - object.pivotX) * 180 / Math.PI;
    const move = (moveEvent) => {
      const point = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const angle = Math.atan2(point.y - object.pivotY, point.x - object.pivotX) * 180 / Math.PI;
      const delta = angle - startAngle;
      const rotation = object.rotation + (moveEvent.shiftKey ? snapRotationDelta(delta) : delta);
      if (Math.abs(rotation - object.rotation) > 0.01) moved = true;
      previewBoard({ ...base, objects: base.objects.map((item) => item.id === id ? { ...item, rotation } : item) });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setRotationGesture(false);
      if (moved) finalizeGesture();
      else restoreGestureHistory(historyBefore);
    };
    const cancel = () => {
      cleanup();
      setRotationGesture(false);
      previewBoard(base);
      restoreGestureHistory(historyBefore);
    };
    releaseGesture = registerPointerGesture({
      label: `旋轉「${object.layerName}」`,
      affectsDocument: true,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [captureGestureHistory, finalizeGesture, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory, screenToWorld]);

  const onResizeStart = useCallback((event, id, handleKey) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    const base = boardRef.current;
    const object = base.objects.find((item) => item.id === id);
    if (!object || object.locked) return;
    const historyBefore = captureGestureHistory();
    pushUndo(base);
    let moved = false;
    let releaseGesture = () => {};
    const startPoint = screenToWorld(event.clientX, event.clientY);
    const locked = object.aspectLocked !== false;
    setResizeGesture({
      objectId: id,
      handle: handleKey,
      pivotAnchor: resizePivotAnchor(handleKey, event.altKey),
      shift: event.shiftKey && locked,
      alt: event.altKey,
      scaleX: 1,
      scaleY: 1,
    });
    const move = (moveEvent) => {
      const point = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const nextObject = resizeObjectFromHandle(object, handleKey, startPoint, point, {
        fromCenter: moveEvent.altKey,
        preserveAspect: locked && !moveEvent.shiftKey,
      });
      if (Math.abs(nextObject.width - object.width) > 0.1 || Math.abs(nextObject.height - object.height) > 0.1) moved = true;
      previewBoard({ ...base, objects: base.objects.map((item) => item.id === id ? nextObject : item) });
      setResizeGesture({
        objectId: id,
        handle: handleKey,
        pivotAnchor: resizePivotAnchor(handleKey, moveEvent.altKey),
        shift: moveEvent.shiftKey && locked,
        alt: moveEvent.altKey,
        scaleX: nextObject.width / object.width,
        scaleY: nextObject.height / object.height,
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setResizeGesture(null);
      if (moved) finalizeGesture();
      else restoreGestureHistory(historyBefore);
    };
    const cancel = () => {
      cleanup();
      setResizeGesture(null);
      previewBoard(base);
      restoreGestureHistory(historyBefore);
    };
    releaseGesture = registerPointerGesture({
      label: `縮放「${object.layerName}」`,
      affectsDocument: true,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [captureGestureHistory, finalizeGesture, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory, screenToWorld]);

  const onTextFrameResizeStart = useCallback((event, id, handleKey) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    const base = boardRef.current;
    const object = base.objects.find((item) => item.id === id);
    if (!isTextObject(object) || object.locked) return;
    const historyBefore = captureGestureHistory();
    let didMove = false;
    let releaseGesture = () => {};
    const startPoint = screenToWorld(event.clientX, event.clientY);
    setTextFrameGesture({ objectId: id, handle: handleKey });
    const move = (moveEvent) => {
      if (!didMove) {
        pushUndo(base);
        didMove = true;
      }
      const point = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const nextObject = resizeObjectFromHandle(object, handleKey, startPoint, point, {
        fromCenter: moveEvent.altKey,
        preserveAspect: false,
        scaleText: false,
      });
      previewBoard({ ...base, objects: base.objects.map((item) => item.id === id ? nextObject : item) });
      setTextFrameGesture({ objectId: id, handle: handleKey });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const refocusEditor = () => {
      requestAnimationFrame(() => document.querySelector(`[data-object-id="${id}"] .canvas-text-editor`)?.focus({ preventScroll: true }));
    };
    const up = () => {
      cleanup();
      setTextFrameGesture(null);
      if (didMove) finalizeGesture();
      refocusEditor();
    };
    const cancel = () => {
      cleanup();
      setTextFrameGesture(null);
      previewBoard(base);
      if (didMove) restoreGestureHistory(historyBefore);
      refocusEditor();
    };
    releaseGesture = registerPointerGesture({
      label: `調整「${object.layerName}」文字框`,
      affectsDocument: true,
      hasChanges: () => didMove,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [captureGestureHistory, finalizeGesture, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory, screenToWorld]);

  const onGroupRotateStart = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const base = boardRef.current;
    const selected = new Set(selectedIdsRef.current);
    const targets = base.objects.filter((object) => selected.has(object.id));
    if (targets.length < 2) return;
    const bounds = selectionWorldBounds(targets);
    const pivot = boundsAnchorPoint(bounds, selectionAnchor);
    const startPoint = screenToWorld(event.clientX, event.clientY);
    const startAngle = Math.atan2(startPoint.y - pivot.y, startPoint.x - pivot.x) * 180 / Math.PI;
    const historyBefore = captureGestureHistory();
    pushUndo(base);
    let moved = false;
    let releaseGesture = () => {};
    setRotationGesture(true);
    setGroupGesture({ type: "rotate", bounds, pivot, degrees: 0 });
    const move = (moveEvent) => {
      const point = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const angle = Math.atan2(point.y - pivot.y, point.x - pivot.x) * 180 / Math.PI;
      const rawDelta = angle - startAngle;
      const degrees = moveEvent.shiftKey ? snapRotationDelta(rawDelta) : rawDelta;
      if (Math.abs(degrees) > 0.01) moved = true;
      previewBoard({ ...base, objects: rotateObjectsAroundPoint(base.objects, selectedIdsRef.current, pivot, degrees) });
      setGroupGesture({ type: "rotate", bounds, pivot, degrees });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setRotationGesture(false);
      setGroupGesture(null);
      if (moved) finalizeGesture();
      else restoreGestureHistory(historyBefore);
    };
    const cancel = () => {
      cleanup();
      setRotationGesture(false);
      setGroupGesture(null);
      previewBoard(base);
      restoreGestureHistory(historyBefore);
    };
    releaseGesture = registerPointerGesture({
      label: `旋轉 ${targets.length} 個物件`,
      affectsDocument: true,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [captureGestureHistory, finalizeGesture, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory, screenToWorld, selectionAnchor]);

  const onGroupResizeStart = useCallback((event, handleKey) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    const base = boardRef.current;
    const selected = new Set(selectedIdsRef.current);
    const targets = base.objects.filter((object) => selected.has(object.id));
    if (targets.length < 2) return;
    const bounds = selectionWorldBounds(targets);
    const startPoint = screenToWorld(event.clientX, event.clientY);
    const locked = selectionAspectLocked(base, selectedIdsRef.current);
    const minimumScaleX = targets.reduce((minimum, object) => Math.max(minimum, minimumObjectDimension(object) / object.width), 0.0001);
    const minimumScaleY = targets.reduce((minimum, object) => Math.max(minimum, minimumObjectDimension(object) / object.height), 0.0001);
    const initialTransform = resizeTransformFromHandle(bounds, handleKey, startPoint, startPoint, {
      fromCenter: event.altKey,
      preserveAspect: locked && !event.shiftKey,
      minimumScaleX,
      minimumScaleY,
    });
    const historyBefore = captureGestureHistory();
    pushUndo(base);
    let moved = false;
    let releaseGesture = () => {};
    setGroupGesture({
      type: "scale",
      bounds,
      pivot: initialTransform.pivot,
      pivotAnchor: initialTransform.pivotAnchor,
      handle: handleKey,
      scaleX: 1,
      scaleY: 1,
      shift: event.shiftKey && locked,
      alt: event.altKey,
    });
    const move = (moveEvent) => {
      const point = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const options = {
        fromCenter: moveEvent.altKey,
        preserveAspect: locked && !moveEvent.shiftKey,
        minimumScaleX,
        minimumScaleY,
      };
      const transform = resizeTransformFromHandle(bounds, handleKey, startPoint, point, options);
      if (Math.abs(transform.scaleX - 1) > 0.001 || Math.abs(transform.scaleY - 1) > 0.001) moved = true;
      previewBoard({ ...base, objects: resizeObjectsFromHandle(base.objects, selectedIdsRef.current, bounds, handleKey, startPoint, point, options) });
      setGroupGesture({
        type: "scale",
        bounds,
        pivot: transform.pivot,
        pivotAnchor: transform.pivotAnchor,
        handle: handleKey,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        shift: moveEvent.shiftKey && locked,
        alt: moveEvent.altKey,
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setGroupGesture(null);
      if (moved) finalizeGesture();
      else restoreGestureHistory(historyBefore);
    };
    const cancel = () => {
      cleanup();
      setGroupGesture(null);
      previewBoard(base);
      restoreGestureHistory(historyBefore);
    };
    releaseGesture = registerPointerGesture({
      label: `縮放 ${targets.length} 個物件`,
      affectsDocument: true,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [captureGestureHistory, finalizeGesture, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory, screenToWorld]);

  const onMicro3DRotateStart = useCallback((event, axis = "free", onClick) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 1) return;
    const base = boardRef.current;
    const selected = new Set(selectedIdsRef.current);
    const targetIds = new Set(base.objects.filter((object) => selected.has(object.id) && !object.locked).map((object) => object.id));
    if (!targetIds.size) return;
    const historyBefore = captureGestureHistory();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let releaseGesture = () => {};
    setMicro3DGesture({ axis, deltaX: 0, deltaY: 0, deltaZ: 0 });
    const move = (moveEvent) => {
      const precision = moveEvent.altKey ? 0.16 : 0.42;
      const horizontal = (moveEvent.clientX - startX) * precision;
      const vertical = (moveEvent.clientY - startY) * precision;
      if (!moved && Math.hypot(horizontal, vertical) < 1) return;
      if (!moved) {
        moved = true;
        pushUndo(base);
      }
      let deltaX = 0;
      let deltaY = 0;
      let deltaZ = 0;
      let activeAxis = axis;
      if (axis === "x") deltaX = -vertical;
      else if (axis === "y") deltaY = horizontal;
      else if (axis === "z") deltaZ = moveEvent.shiftKey ? snapRotationDelta(horizontal) : horizontal;
      else if (moveEvent.shiftKey) {
        activeAxis = Math.abs(horizontal) >= Math.abs(vertical) ? "y" : "x";
        if (activeAxis === "x") deltaX = -vertical;
        else deltaY = horizontal;
      } else {
        deltaX = -vertical;
        deltaY = horizontal;
      }
      previewBoard({
        ...base,
        objects: base.objects.map((object) => {
          if (!targetIds.has(object.id)) return object;
          return {
            ...object,
            tiltX: Math.max(-60, Math.min(60, (Number(object.tiltX) || 0) + deltaX)),
            tiltY: Math.max(-60, Math.min(60, (Number(object.tiltY) || 0) + deltaY)),
            rotation: (Number(object.rotation) || 0) + deltaZ,
          };
        }),
      });
      setMicro3DGesture({ axis: activeAxis, deltaX, deltaY, deltaZ });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      setMicro3DGesture(null);
      if (moved) finalizeGesture();
      else onClick?.();
    };
    const cancel = () => {
      cleanup();
      setMicro3DGesture(null);
      previewBoard(base);
      if (moved) restoreGestureHistory(historyBefore);
    };
    releaseGesture = registerPointerGesture({
      label: targetIds.size > 1 ? `3D 旋轉 ${targetIds.size} 個物件` : "3D 旋轉物件",
      affectsDocument: true,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [captureGestureHistory, finalizeGesture, previewBoard, pushUndo, registerPointerGesture, restoreGestureHistory]);

  const onObjectDoubleClick = useCallback((event, id) => {
    event.preventDefault();
    event.stopPropagation();
    centerObjectView(id);
  }, [centerObjectView]);

  const onCanvasPointerDown = useCallback((event) => {
    if (event.target.closest("button, input, select, a, .board-object, .filter-stage, .canvas-empty, .canvas-status, .export-dock")) return;
    if (event.button === 0 && loadedTextFlow) {
      event.preventDefault();
      placeTextOverflow(event);
      return;
    }
    if (event.button === 1 || spaceDown || (tool === "hand" && !event.shiftKey)) {
      startCanvasPan(event);
      return;
    }
    if (event.button !== 0 || filters.symbols.length || filters.colors.length) return;
    const previousBlankClick = blankClickRef.current;
    const isRapidSecondPress = previousBlankClick
      && performance.now() - previousBlankClick.time <= 900
      && Math.hypot(event.clientX - previousBlankClick.x, event.clientY - previousBlankClick.y) <= 12;
    if (event.detail > 1 || isRapidSecondPress) {
      blankClickRef.current = null;
      doubleClickPanMovedRef.current = false;
      startCanvasPan(event, { onMoveStart: () => { doubleClickPanMovedRef.current = true; } });
      return;
    }

    doubleClickPanMovedRef.current = false;
    event.preventDefault();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    const startClient = { x: event.clientX, y: event.clientY };
    const previousSelected = [...selectedIdsRef.current];
    const previousGuideSelected = [...selectedGuideIdsRef.current];
    const previousKeyObjectId = keyObjectId;
    const initialSelected = event.shiftKey ? [...selectedIdsRef.current] : [];
    let moved = false;
    let releaseGesture = () => {};

    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startClient.x;
      const dy = moveEvent.clientY - startClient.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) commitGuideSelection([]);
      moved = true;
      const left = Math.min(startClient.x, moveEvent.clientX) - canvasRect.left;
      const top = Math.min(startClient.y, moveEvent.clientY) - canvasRect.top;
      setMarquee({ left, top, width: Math.abs(dx), height: Math.abs(dy) });

      const startWorld = screenToWorld(startClient.x, startClient.y);
      const endWorld = screenToWorld(moveEvent.clientX, moveEvent.clientY);
      const worldRect = {
        left: Math.min(startWorld.x, endWorld.x),
        right: Math.max(startWorld.x, endWorld.x),
        top: Math.min(startWorld.y, endWorld.y),
        bottom: Math.max(startWorld.y, endWorld.y),
      };
      const hits = boardRef.current.objects
        .filter((object) => object.visible && objectIntersectsWorldRect(object, worldRect))
        .flatMap((object) => selectionIdsForObject(boardRef.current, object.id, { penetrate: event.metaKey || event.ctrlKey }));
      const nextSelection = [...new Set([...initialSelected, ...hits])];
      selectedIdsRef.current = nextSelection;
      setSelectedIds(nextSelection);
      if (!event.shiftKey) setKeyObjectId(nextSelection[0] || null);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const up = () => {
      cleanup();
      if (!moved && !event.shiftKey) {
        selectedIdsRef.current = [];
        setSelectedIds([]);
        commitGuideSelection([]);
      }
      blankClickRef.current = moved ? null : { time: performance.now(), x: startClient.x, y: startClient.y };
      setMarquee(null);
    };
    const cancel = () => {
      cleanup();
      selectedIdsRef.current = previousSelected;
      setSelectedIds(previousSelected);
      commitGuideSelection(previousGuideSelected);
      setKeyObjectId(previousKeyObjectId);
      setMarquee(null);
      blankClickRef.current = null;
    };
    releaseGesture = registerPointerGesture({
      label: "框選物件",
      affectsDocument: false,
      hasChanges: () => moved,
      pause: cleanup,
      cancel,
      keep: up,
    });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [commitGuideSelection, filters.colors.length, filters.symbols.length, keyObjectId, loadedTextFlow, placeTextOverflow, registerPointerGesture, screenToWorld, spaceDown, startCanvasPan, tool]);

  const zoomAround = useCallback((clientX, clientY, nextZoom) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const current = viewRef.current;
    const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const worldX = (clientX - rect.left - current.x) / current.zoom;
    const worldY = (clientY - rect.top - current.y) / current.zoom;
    const nextView = { zoom, x: clientX - rect.left - worldX * zoom, y: clientY - rect.top - worldY * zoom };
    viewRef.current = nextView;
    setView(nextView);
  }, []);

  const resetZoomAtCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAround(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
    announce("畫面已以中央為軸回到 100%", "success");
  }, [announce, zoomAround]);

  const onCanvasDoubleClick = useCallback((event) => {
    if (event.target.closest("button, input, select, a, .board-object, .filter-stage, .canvas-empty, .canvas-status, .export-dock")) return;
    event.preventDefault();
    if (doubleClickPanMovedRef.current) {
      doubleClickPanMovedRef.current = false;
      return;
    }
    resetZoomAtCenter();
  }, [resetZoomAtCenter]);

  const onWheel = useCallback((event) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      zoomAround(event.clientX, event.clientY, viewRef.current.zoom * Math.exp(-event.deltaY * 0.005));
    } else {
      setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
    }
  }, [zoomAround]);

  const fitToContent = useCallback(() => {
    const visible = boardRef.current.objects.filter((object) => object.visible);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (!visible.length) {
      const nextView = { x: rect.width / 2, y: rect.height / 2, zoom: 1 };
      viewRef.current = nextView;
      setView(nextView);
      announce("畫布目前沒有可顯示的物件。", "warning");
      return;
    }
    const points = visible.flatMap(objectWorldCorners);
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const zoom = clamp(Math.min((rect.width - 96) / width, (rect.height - 96) / height), MIN_ZOOM, 1.8);
    const nextView = { zoom, x: rect.width / 2 - ((minX + maxX) / 2) * zoom, y: rect.height / 2 - ((minY + maxY) / 2) * zoom };
    viewRef.current = nextView;
    setView(nextView);
    announce(`已將 ${visible.length} 個可見物件完整顯示在視窗中。`, "success");
  }, [announce]);

  const toggleViewportScale = useCallback(() => {
    if (Math.abs(viewRef.current.zoom - 1) < 0.005) fitToContent();
    else resetZoomAtCenter();
  }, [fitToContent, resetZoomAtCenter]);

  const onZoomValueClick = useCallback((event) => {
    if (event.detail > 0) event.currentTarget.blur?.();
    const now = performance.now();
    const isRapidSecondActivation = event.detail >= 2
      || (zoomValueTapRef.current > 0 && now - zoomValueTapRef.current <= 420);
    if (!isRapidSecondActivation) {
      zoomValueTapRef.current = now;
      return;
    }
    event.preventDefault();
    zoomValueTapRef.current = 0;
    toggleViewportScale();
  }, [toggleViewportScale]);

  const onZoomValueKeyDown = useCallback((event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat) return;
    zoomValueTapRef.current = 0;
    toggleViewportScale();
  }, [toggleViewportScale]);

  const onPrimaryCanvasToolClick = useCallback((event, nextTool) => {
    setTool(nextTool);
    if (event.detail === 0) return;
    event.currentTarget.blur?.();
    const now = performance.now();
    const previousActivation = canvasToolTapRef.current[nextTool];
    const isRapidSecondActivation = event.detail >= 2
      || (previousActivation > 0 && now - previousActivation <= 420);
    if (!isRapidSecondActivation) {
      canvasToolTapRef.current = { select: 0, hand: 0, [nextTool]: now };
      return;
    }
    canvasToolTapRef.current = { select: 0, hand: 0 };
    if (nextTool === "select") fitToContent();
    else resetZoomAtCenter();
  }, [fitToContent, resetZoomAtCenter]);

  const finishZoomWindowTool = useCallback(() => {
    setZoomWindowRect(null);
    setTool((current) => current === "zoom-window" ? zoomWindowReturnToolRef.current || "select" : current);
  }, []);

  const activateZoomWindowTool = useCallback((event) => {
    if (event?.detail > 0) event.currentTarget?.blur?.();
    if (tool === "zoom-window") {
      finishZoomWindowTool();
      return;
    }
    zoomWindowReturnToolRef.current = tool;
    setLoadedTextFlow(null);
    setZoomWindowRect(null);
    setTool("zoom-window");
    announce("縮放範圍：拖曳框住要檢視的區域；按住 Option／Alt 可反向縮小，Esc 取消。", "info");
  }, [announce, finishZoomWindowTool, tool]);

  const onZoomWindowPointerDown = useCallback((event) => {
    if (tool !== "zoom-window" || spaceDown || event.button !== 0) return;
    if (event.target.closest("button, input, select, a, .workspace-measurement-layer, .filter-stage, .canvas-empty, .canvas-status, .export-dock, .cloud-read-only-banner")) return;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    event.preventDefault();
    event.stopPropagation();

    const canvasPoint = (pointerEvent) => ({
      x: clamp(pointerEvent.clientX - canvasRect.left, 0, canvasRect.width),
      y: clamp(pointerEvent.clientY - canvasRect.top, 0, canvasRect.height),
    });
    const start = canvasPoint(event);
    let latest = start;
    let moved = false;
    let releaseGesture = () => {};
    const updateRect = (pointerEvent) => {
      latest = canvasPoint(pointerEvent);
      const dx = latest.x - start.x;
      const dy = latest.y - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      setZoomWindowRect({
        left: Math.min(start.x, latest.x),
        top: Math.min(start.y, latest.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", updateRect);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      releaseGesture();
    };
    const cancel = () => {
      cleanup();
      finishZoomWindowTool();
    };
    const finish = (pointerEvent) => {
      updateRect(pointerEvent);
      cleanup();
      const width = Math.abs(latest.x - start.x);
      const height = Math.abs(latest.y - start.y);
      if (width < 12 || height < 12) {
        finishZoomWindowTool();
        announce("請拖曳出一個較大的區域。", "warning");
        return;
      }
      const startWorld = screenToWorld(canvasRect.left + start.x, canvasRect.top + start.y);
      const endWorld = screenToWorld(canvasRect.left + latest.x, canvasRect.top + latest.y);
      const fittedView = viewWorldRectInViewport({
        left: startWorld.x,
        top: startWorld.y,
        right: endWorld.x,
        bottom: endWorld.y,
      }, { width: canvasRect.width, height: canvasRect.height }, {
        padding: 36,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
      const zoomOut = pointerEvent.altKey || altDownRef.current;
      let nextView = fittedView;
      if (zoomOut) {
        const currentView = viewRef.current;
        const inverseFactor = Math.max(1.2, fittedView.zoom / currentView.zoom);
        const zoom = clamp(currentView.zoom / inverseFactor, MIN_ZOOM, MAX_ZOOM);
        const centerWorld = {
          x: (startWorld.x + endWorld.x) / 2,
          y: (startWorld.y + endWorld.y) / 2,
        };
        nextView = {
          zoom,
          x: canvasRect.width / 2 - centerWorld.x * zoom,
          y: canvasRect.height / 2 - centerWorld.y * zoom,
        };
      }
      viewRef.current = nextView;
      setView(nextView);
      finishZoomWindowTool();
      announce(zoomOut ? "已縮小框選區域。" : "已放大框選區域。", "success");
    };
    releaseGesture = registerPointerGesture({
      label: "縮放視窗",
      affectsDocument: false,
      hasChanges: () => false,
      pause: cleanup,
      cancel,
      keep: cleanup,
    });
    window.addEventListener("pointermove", updateRect);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }, [announce, finishZoomWindowTool, registerPointerGesture, screenToWorld, spaceDown, tool]);

  useEffect(() => {
    const copy = (event) => {
      if (isEditableShortcutEvent(event, document.activeElement) || leftTab === "sources") return;
      if (!event.clipboardData) return;
      if (copySelectedObjects(event.clipboardData)) event.preventDefault();
    };
    const cut = (event) => {
      if (isEditableShortcutEvent(event, document.activeElement) || leftTab === "sources") return;
      if (cloudReadOnly) return;
      if (cutSelectedObjects(event.clipboardData)) event.preventDefault();
    };
    const paste = (event) => {
      if (isEditableShortcutEvent(event, document.activeElement)) return;
      const text = event.clipboardData?.getData("text/plain") || "";
      const objects = parseObjectClipboard(text, ensureBoard);
      if (objects && leftTab !== "sources") {
        event.preventDefault();
        if (cloudReadOnly) { announce("目前是僅檢視模式，無法貼上物件。", "warning"); return; }
        pasteCopiedObjects(objects);
        return;
      }
      const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || isSvgFile(file));
      if (files.length) {
        event.preventDefault();
        if (leftTab === "sources") {
          announce("素材檢視不會新增或改動畫布物件；請先回到畫布。", "warning");
          return;
        }
        addMediaFiles(files, canvasCenterWorld());
      }
    };
    window.addEventListener("copy", copy);
    window.addEventListener("cut", cut);
    window.addEventListener("paste", paste);
    return () => { window.removeEventListener("copy", copy); window.removeEventListener("cut", cut); window.removeEventListener("paste", paste); };
  }, [addMediaFiles, announce, canvasCenterWorld, cloudReadOnly, copySelectedObjects, cutSelectedObjects, leftTab, pasteCopiedObjects]);

  useEffect(() => {
    const selectAllVisibleObjects = () => {
      const ids = boardRef.current.objects.filter((object) => object.visible).map((object) => object.id);
      selectedIdsRef.current = ids;
      setSelectedIds(ids);
      setKeyObjectId(ids[0] || null);
      if (ids.length) setTool("select");
      announce(ids.length ? `已選取全部 ${ids.length} 個可見物件` : "目前沒有可選取的物件。", ids.length ? "success" : "warning");
    };
    const openCurrentListSearch = () => {
      let listId = "layers";
      if (pendingObjectDeletion) listId = "delete-impact";
      else if (preparedDownloads.length) listId = "downloads";
      else if (showShortcuts) listId = "shortcuts";
      else if (showVersions) listId = "versions";
      else if (showInterfaceThemes) listId = "themes";
      else if (leftTab === "sources") listId = "sources";
      else if (leftTab === "captures") listId = "captures";
      else if (leftTab === "filters" && (filters.symbols.length || filters.colors.length)) listId = "filter-results";
      else {
        setFocusMode(false);
        setLeftTab("layers");
        if (!leftPanelVisible) {
          setLeftPanelVisible(true);
          localStorage.setItem("moodboard-left-panel-visible", "true");
        }
      }
      window.requestAnimationFrame(() => openListSearch(listId));
    };
    const keyDown = (event) => {
      if (event.key === "Escape" && document.fullscreenElement) return;
      if (escapeCancellationRequest) {
        if (event.key === "Escape") {
          event.preventDefault();
          keepEscapeAdjustment();
        }
        return;
      }
      if (pendingAdvancedFeature) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeAdvancedFeatureGate();
        }
        return;
      }
      if (driveSaveConfirmation) {
        if (event.key === "Escape" && !driveSavePromiseRef.current) {
          event.preventDefault();
          setDriveSaveConfirmation(null);
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") event.preventDefault();
        return;
      }
      if (localSwitchConfirmation) {
        if (event.key === "Escape" && !versionActionRef.current) { event.preventDefault(); setLocalSwitchConfirmation(false); }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") event.preventDefault();
        return;
      }
      if (showDeleteLocalData) {
        if (event.key === "Escape" && !isClearingLocalData) {
          event.preventDefault();
          setShowDeleteLocalData(false);
        }
        return;
      }
      if (pendingObjectDeletion) {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelPendingObjectDeletion();
        }
        return;
      }
      if (event.key === "Escape" && requestActivePointerCancellation()) {
        event.preventDefault();
        return;
      }
      if (event.key === "Shift") {
        setModifierDown(true);
        setResizeGesture((current) => current ? { ...current, shift: true } : current);
        setGroupGesture((current) => current?.type === "scale" ? { ...current, shift: true } : current);
      }
      if (event.key === "Alt") {
        altDownRef.current = true;
        setAltDown(true);
        setResizeGesture((current) => current ? { ...current, alt: true, pivotAnchor: "mc" } : current);
        setGroupGesture((current) => current?.type === "scale" ? { ...current, alt: true, pivotAnchor: "mc", pivot: boundsAnchorPoint(current.bounds, "mc") } : current);
      }
      const typing = isEditableShortcutEvent(event, document.activeElement);
      if (event.key === "Escape" && loadedTextFlow) {
        event.preventDefault();
        setLoadedTextFlow(null);
        announce("已取消放置溢出文字。", "warning");
        return;
      }
      if (event.key === "Escape" && showInterfaceThemes) {
        event.preventDefault();
        closeInterfaceThemes();
        return;
      }
      if (event.key === "Escape" && showLocalFileLocation) {
        event.preventDefault();
        dismissLocalFileLocation();
        return;
      }
      if (event.key === "Escape" && showStorageLocation) {
        event.preventDefault();
        setShowStorageLocation(false);
        return;
      }
      if (event.key === "Escape" && showDriveLibrary) {
        event.preventDefault();
        closeDriveLibrary();
        return;
      }
      if (event.key === "Escape" && showSettings) {
        event.preventDefault();
        setShowSettings(false);
        return;
      }
      if (event.key === "Escape" && showGridBuilder) {
        event.preventDefault();
        setShowGridBuilder(false);
        return;
      }
      if (event.key === "Escape" && showAnnotationBuilder) {
        event.preventDefault();
        setShowAnnotationBuilder(false);
        return;
      }
      if (event.key === "Escape" && showShortcuts) {
        event.preventDefault();
        setShowShortcuts(false);
        return;
      }
      if (leftTab === "sources" && event.key === "Escape") return;
      if (typing) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const shiftOnly = event.shiftKey && !modifier && !event.altKey;
      const nudge = objectNudgeDelta(event, rulerUnit);
      if (nudge && leftTab !== "sources" && !cloudReadOnly && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        const ids = selectedIdsRef.current;
        const canMove = boardRef.current.objects.some((object) => ids.includes(object.id) && !object.locked && object.visible !== false);
        if (canMove) {
          event.preventDefault();
          applyBoard((current) => ({ ...current, objects: nudgeSelectedObjects(current.objects, ids, nudge) }));
          return;
        }
      }
      if (leftTab === "sources") {
        const blockedModifier = modifier && !event.altKey && ["a", "c", "x", "v", "z"].includes(key);
        const blockedShift = shiftOnly && ["KeyV", "KeyH", "Digit3", "KeyR", "Semicolon", "Quote", "KeyD", "KeyG"].includes(event.code);
        const blockedDirect = ["Backspace", "Delete"].includes(event.key);
        if (blockedModifier || blockedShift || blockedDirect) {
          event.preventDefault();
          if (!event.repeat) announce("目前正在操作來源素材；畫布物件未被變更。", "info");
          return;
        }
      }
      if (event.code === "Space") {
        if (event.target?.closest?.("button, a, [role='button']")) return;
        event.preventDefault();
        if (!event.repeat) setSpaceDown(true);
        return;
      }
      if (modifier && !event.altKey) {
        if (key === "s") { event.preventDefault(); savePreferredBoard(); return; }
        if (key === "o") { event.preventDefault(); openBoardFile(); return; }
        if (key === "f") { event.preventDefault(); openCurrentListSearch(); return; }
        if (key === "a") { event.preventDefault(); selectAllVisibleObjects(); return; }
        if (key === "z" && event.shiftKey) { event.preventDefault(); redo(); return; }
        if (key === "z") { event.preventDefault(); undo(); return; }
      }
      if (shiftOnly) {
        if (event.code === "Slash") { event.preventDefault(); setShowShortcuts((current) => !current); return; }
        if (event.code === "KeyV") { event.preventDefault(); setTool("select"); return; }
        if (event.code === "KeyH") { event.preventDefault(); setTool("hand"); return; }
        if (event.code === "Digit3") {
          event.preventDefault();
          if (selectedIdsRef.current.length) {
            if (tool === "3d") setTool("select");
            else requestAdvancedFeature("3d");
          }
          return;
        }
        if (event.code === "KeyR") { event.preventDefault(); toggleRulers(); return; }
        if (event.code === "Semicolon") { event.preventDefault(); toggleGuides(); return; }
        if (event.code === "Quote") { event.preventDefault(); toggleCanvasBackground(); return; }
        if (event.code === "BracketLeft") { event.preventDefault(); toggleLeftPanel(); return; }
        if (event.code === "BracketRight") { event.preventDefault(); toggleRightPanel(); return; }
        if (event.code === "Backslash") { event.preventDefault(); toggleBothPanels(); return; }
        if (event.code === "KeyF") { event.preventDefault(); toggleFocusMode(); return; }
        if (event.code === "KeyD") {
          event.preventDefault();
          if (!event.repeat) duplicateSelected();
          return;
        }
        if (event.code === "KeyG") {
          event.preventDefault();
          if (!event.repeat) toggleSelectionGroup();
          return;
        }
      }
      if (["Backspace", "Delete"].includes(event.key)) { event.preventDefault(); deleteSelected(); }
      if (event.key === "Escape") {
        event.preventDefault();
        if (shapeMenuOpen) setShapeMenuOpen(false);
        else if (dragActive) setDragActive(false);
        else if (preparedDownloads.length) closePreparedDownloads();
        else if (agentRequest) finishAgentRequest(false);
        else if (showAgent) closeAgent();
        else if (showVersions) setShowVersions(false);
        else if (showCollaboration) closeDriveSharing();
        else if (mobilePanel) setMobilePanel(null);
        else if (filters.symbols.length || filters.colors.length) setFilters(DEFAULT_FILTERS);
        else if (tool === "zoom-window") finishZoomWindowTool();
        else if (tool === "3d") setTool("select");
        else if (focusMode) restoreWorkspaceChrome();
        else if (!leftPanelVisible && !rightPanelVisible) showBothPanels();
        else if (selectedGuideIdsRef.current.length) {
          selectedGuideIdsRef.current = [];
          setSelectedGuideIds([]);
        }
        else if (selectedIdsRef.current.length) {
          selectedIdsRef.current = [];
          setSelectedIds([]);
          setKeyObjectId(null);
        }
      }
    };
    const keyUp = (event) => {
      if (event.code === "Space") setSpaceDown(false);
      if (event.key === "Shift") {
        setModifierDown(false);
        setResizeGesture((current) => current ? { ...current, shift: false } : current);
        setGroupGesture((current) => current?.type === "scale" ? { ...current, shift: false } : current);
      }
      if (event.key === "Alt") {
        altDownRef.current = false;
        setAltDown(false);
        setResizeGesture((current) => current ? { ...current, alt: false, pivotAnchor: resizePivotAnchor(current.handle, false) } : current);
        setGroupGesture((current) => {
          if (current?.type !== "scale") return current;
          const pivotAnchor = resizePivotAnchor(current.handle, false);
          return { ...current, alt: false, pivotAnchor, pivot: boundsAnchorPoint(current.bounds, pivotAnchor) };
        });
      }
    };
    const blur = () => {
      setSpaceDown(false);
      altDownRef.current = false;
      setAltDown(false);
      setModifierDown(false);
      setResizeGesture((current) => current ? { ...current, shift: false, alt: false } : current);
      setGroupGesture((current) => current?.type === "scale" ? { ...current, shift: false, alt: false } : current);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }, [agentRequest, applyBoard, cloudReadOnly, rulerUnit, finishAgentRequest, showAgent, closeAgent, announce, cancelPendingObjectDeletion, closeAdvancedFeatureGate, closeDriveLibrary, closeDriveSharing, closeInterfaceThemes, closePreparedDownloads, copySelectedObjects, cutSelectedObjects, deleteSelected, dismissLocalFileLocation, dragActive, driveSaveConfirmation, duplicateSelected, escapeCancellationRequest, filters.colors.length, filters.symbols.length, finishZoomWindowTool, focusMode, isClearingLocalData, keepEscapeAdjustment, leftPanelVisible, leftTab, loadedTextFlow, localSwitchConfirmation, mobilePanel, openBoardFile, openListSearch, pasteCopiedObjects, pendingAdvancedFeature, pendingObjectDeletion, preparedDownloads.length, redo, requestActivePointerCancellation, requestAdvancedFeature, restoreWorkspaceChrome, rightPanelVisible, savePreferredBoard, shapeMenuOpen, showAnnotationBuilder, showBothPanels, showCollaboration, showDeleteLocalData, showDriveLibrary, showGridBuilder, showInterfaceThemes, showLocalFileLocation, showSettings, showShortcuts, showStorageLocation, showVersions, toggleBothPanels, toggleCanvasBackground, toggleFocusMode, toggleGuides, toggleLeftPanel, toggleRightPanel, toggleRulers, toggleSelectionGroup, tool, undo]);

  const exportObjects = useCallback(async (scopeOverride) => {
    const scope = typeof scopeOverride === "string" ? scopeOverride : exportScope;
    const targets = objectsForExport(boardRef.current.objects.filter((object) => object.visible), selectedIdsRef.current, scope);
    if (!targets.length) {
      announce("這個匯出範圍沒有物件。", "warning");
      return;
    }
    setIsExporting(true);
    try {
      const { objectExportArtifact } = await loadAssetExportRuntime();
      closePreparedDownloads();
      const downloads = targets.map((object, index) => {
        const artifact = objectExportArtifact(object);
        return {
          blob: artifact.blob,
          url: URL.createObjectURL(artifact.blob),
          filename: `${String(index + 1).padStart(2, "0")}-${safeFilename(object.name)}.${artifact.extension}`,
        };
      });
      preparedDownloadsRef.current = downloads;
      setPreparedDownloads(downloads);
      announce(`已準備 ${targets.length} 個匯出檔`, "success");
    } catch (error) {
      announce(error?.message || "匯出功能載入失敗；目前畫布未受影響。", "error");
    } finally {
      setIsExporting(false);
    }
  }, [announce, closePreparedDownloads, exportScope]);

  const exportPreparedToDirectory = useCallback(() => {
    if (!canUseDirectoryPicker || !preparedDownloadsRef.current.length) return;
    const picker = window.showDirectoryPicker({ mode: "readwrite" });
    setIsExporting(true);
    picker.then(async (directory) => {
      for (const download of preparedDownloadsRef.current) {
        const fileHandle = await directory.getFileHandle(download.filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(download.blob);
        await writable.close();
      }
      announce(`已匯出 ${preparedDownloadsRef.current.length} 個物件到指定資料夾`, "success");
    }).catch((error) => {
      if (error.name !== "AbortError") announce(error.message || "匯出失敗。", "error");
    }).finally(() => setIsExporting(false));
  }, [announce, canUseDirectoryPicker]);

  const outputSelectionComposition = useCallback(async () => {
    const selected = new Set(selectedIdsRef.current);
    const targets = boardRef.current.objects.filter((object) => object.visible && selected.has(object.id));
    if (!targets.length) {
      announce("請先選取要輸出的物件。", "warning");
      return;
    }

    setIsRenderingComposition(true);
    let format = { extension: compositionFormat, label: compositionFormat.toUpperCase() };
    try {
      const { compositionOutputFormat } = await loadOutputRuntime();
      format = compositionOutputFormat(compositionFormat);
      const rendered = await renderSelectionComposition(targets, compositionScale);
      const blob = await encodeCompositionCanvas(rendered.canvas, compositionFormat);
      const filename = `${safeFilename(`${boardRef.current.name}-選取合成`, "moodboard-composition")}.${format.extension}`;
      downloadBlob(blob, filename);
      const reducedNote = rendered.reduced ? "；尺寸過大，已在不改變比例下自動縮小" : "";
      announce(`已輸出 ${format.label} · ${rendered.pixelWidth} × ${rendered.pixelHeight}px${reducedNote}`, "success");
    } catch (error) {
      const fallbackMessage = compositionFormat === "avif"
        ? "AVIF 輸出失敗；請重試，或改用 WebP／PNG。"
        : `${format.label} 輸出失敗；原始物件仍保留。`;
      announce(error?.message || fallbackMessage, "error");
    } finally {
      setIsRenderingComposition(false);
    }
  }, [announce, compositionFormat, compositionScale]);

  const openVersionModal = useCallback(async () => {
    setShowVersions(true);
    const localRequest = listVersions(boardRef.current.id)
      .then(setVersions)
      .catch(() => announce("無法讀取本機版本紀錄。", "error"));
    await Promise.all([localRequest, refreshDriveVersions()]);
  }, [announce, refreshDriveVersions]);

  useEffect(() => {
    if (!hydrated) return undefined;
    let active = true;
    const record = storagePreferences.loadRecoveries[board.id];
    if (record) listVersions(record.boardId).then((items) => {
      const version = items.find((entry) => entry.id === record.versionId);
      if (active && version) setDriveLoadRecovery({ version, target: record.target, loadedBoardId: board.id });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [board.id, hydrated, storagePreferences.loadRecoveries]);

  const createManualVersion = useCallback(async () => {
    setVersionBusy(true);
    try {
      await saveVersion(boardSnapshot(), versionLabel || translateInterfaceText(`手動版本 ${formatTime(new Date())}`), "manual");
      setVersions(await listVersions(boardRef.current.id));
      setVersionLabel("");
      announce("版本已建立", "success");
    } catch { announce("版本建立失敗。", "error"); }
    finally { setVersionBusy(false); }
  }, [announce, boardSnapshot, versionLabel]);

  const removeLocalVersion = useCallback(async (version) => {
    if (driveSavePromiseRef.current || versionActionRef.current || !version?.id || version.pinned || version.slot || version.boardId !== boardRef.current.id) return false;
    const recoveryRecords = Object.values(loadStoragePreferences(localStorage).loadRecoveries || {});
    if (recoveryRecords.some((record) => record.versionId === version.id)) {
      announce("這是受保護的復原點，無法刪除。", "warning");
      return false;
    }
    versionActionRef.current = true;
    setVersionBusy(true);
    try {
      const deleted = await deleteVersion(version.id, { boardId: version.boardId });
      if (!deleted) { announce("版本已不存在或受保護，沒有刪除任何內容。", "warning"); return false; }
      if (boardRef.current.id === version.boardId) setVersions((current) => current.filter((item) => item.id !== version.id));
      void refreshLocalLibrarySummary().catch(() => undefined);
      announce("已刪除此本機版本；目前畫布與 Drive 檔案未變更。", "success");
      return true;
    } catch {
      announce("無法刪除本機版本，請稍後再試。", "error");
      return false;
    } finally {
      versionActionRef.current = false;
      setVersionBusy(false);
    }
  }, [announce, refreshLocalLibrarySummary]);

  const restoreVersion = useCallback(async (version) => {
    if (driveSavePromiseRef.current || versionActionRef.current) return;
    versionActionRef.current = true;
    setVersionBusy(true);
    try {
      cancelDriveOperations();
      updateStoragePreferences((current) => ({ ...current, uploadPaused: { ...current.uploadPaused, [boardRef.current.id]: true } }));
      await saveVersion(boardSnapshot(), translateInterfaceText("還原前自動備份"), "automatic");
      const restored = ensureBoard(version.board);
      const restoredView = restored.view || viewRef.current;
      viewRef.current = restoredView;
      const next = applyBoard({ ...restored, id: boardRef.current.id, view: restoredView });
      setView(restoredView);
      setSelectedIds([]);
      setSelectedCaptureId(null);
      setFilters(DEFAULT_FILTERS);
      setVersions(await listVersions(next.id));
      announce(`已還原「${version.label}」`, "success");
    } catch { announce("版本還原失敗。", "error"); }
    finally { versionActionRef.current = false; setVersionBusy(false); }
  }, [announce, applyBoard, boardSnapshot, cancelDriveOperations, updateStoragePreferences]);

  const openVersionCopy = useCallback(async (snapshot, label) => {
    if (versionActionRef.current || driveSavePromiseRef.current) return;
    versionActionRef.current = true;
    setVersionBusy(true);
    try {
      const opened = await activateLocalMoodboard(createRecoveredMoodboard(snapshot, { label }));
      if (opened) { setPendingTabUpdate(null); setShowVersions(false); }
      return opened;
    } finally { versionActionRef.current = false; setVersionBusy(false); }
  }, [activateLocalMoodboard]);

  const restoreBeforeDriveLoad = useCallback(async () => {
    if (!driveLoadRecovery || versionActionRef.current || driveSavePromiseRef.current) return;
    versionActionRef.current = true;
    setVersionBusy(true);
    try {
      const recovery = driveLoadRecovery;
      // Restoring a local snapshot is never consent to upload it over Drive.
      updateStoragePreferences((current) => ({ ...current, uploadPaused: { ...current.uploadPaused, [recovery.version.boardId]: true } }));
      const restored = await activateLocalMoodboard(recovery.version.board, "已復原載入前內容；確認後再按更新至雲端。");
      if (restored) {
        setBoardPrimaryStorage(restored.id, recovery.target || "local");
        setDriveLoadRecovery(null);
        setDriveIncomingVersion(null);
        setDirty(true);
        setShowVersions(false);
        updateStoragePreferences((current) => {
          const loadRecoveries = { ...current.loadRecoveries };
          delete loadRecoveries[recovery.loadedBoardId];
          return { ...current, loadRecoveries };
        });
        void setVersionPinned(recovery.version.id, false).catch(() => undefined);
      }
    } finally { versionActionRef.current = false; setVersionBusy(false); }
  }, [activateLocalMoodboard, driveLoadRecovery, setBoardPrimaryStorage, updateStoragePreferences]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    if (cloudReadOnly) {
      announce("目前為僅檢視；請先申請編輯權限。", "warning");
      return;
    }
    const files = [...event.dataTransfer.files];
    const boardFile = files.find((file) => /\.(studio|moodboard|json)$/i.test(file.name));
    if (boardFile && files.length === 1) importLocalBoardFile(boardFile);
    else if (files.length === 1 && /\.(txt|md|markdown|csv|docx|doc)$/i.test(files[0].name)) void importTextDocument(files[0], screenToWorld(event.clientX, event.clientY));
    else addMediaFiles(files, screenToWorld(event.clientX, event.clientY));
  }, [addMediaFiles, announce, cloudReadOnly, importLocalBoardFile, importTextDocument, screenToWorld]);

  const onSourceModeDrop = useCallback((event) => {
    event.preventDefault();
    setDragActive(false);
    announce("素材檢視不會新增或改動畫布物件；請先回到畫布。", "warning");
  }, [announce]);

  const filteredObjects = useMemo(() => board.objects.filter((object) => object.visible && matchesFilters(object, filters)), [board.objects, filters]);
  const sourceAssets = useMemo(() => sourceAssetsFromObjects(board.objects), [board.objects]);
  const sourceModeActive = leftTab === "sources";
  const resolvedActiveSourceId = sourceAssets.some((source) => source.sourceId === activeSourceId)
    ? activeSourceId
    : sourceAssets[0]?.sourceId || null;
  const activeSourceAsset = sourceAssets.find((source) => source.sourceId === resolvedActiveSourceId) || null;
  const activeSourceVisibleInstanceCount = activeSourceAsset
    ? activeSourceAsset.instanceIds.filter((id) => board.objects.some((object) => object.id === id && object.visible)).length
    : 0;
  const filtersActive = filters.symbols.length + filters.colors.length > 0;
  const inspectionActive = filtersActive || sourceModeActive;
  const exportCount = objectsForExport(board.objects.filter((object) => object.visible), selectedIds, exportScope).length;
  const soleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedObjects = useMemo(
    () => board.objects.filter((object) => object.visible && selectedIds.includes(object.id)),
    [board.objects, selectedIds],
  );
  const spacingMeasurements = useMemo(
    () => selectionSpacingMeasurements(board.objects, selectedIds),
    [board.objects, selectedIds],
  );
  const compositionCount = selectedObjects.length;
  const selectedSemanticGroup = (board.groups || []).find((group) => (
    group.memberIds.length === selectedIds.length
    && group.memberIds.every((id) => selectedIds.includes(id))
  ));
  const selectionGrouped = Boolean(selectedSemanticGroup);
  const selectionSemanticLabel = selectedSemanticGroup?.name || null;
  const selectionActionBounds = selectedObjects.length ? selectionWorldBounds(selectedObjects) : null;
  const multiSelectionBounds = selectedObjects.length > 1 ? selectionWorldBounds(selectedObjects) : null;
  const selectionActionAnchor = selectionActionBounds
    ? selectionActionAnchorInViewport(selectionActionBounds, view, canvasViewportSize)
    : null;
  const selectionActionStyle = selectionActionAnchor ? {
    left: `clamp(8px, ${selectionActionAnchor.x}px, calc(100% - 252px))`,
    top: `clamp(84px, ${selectionActionAnchor.y}px, calc(100% - 28px))`,
  } : undefined;
  const showSelectionActions = Boolean(
    selectionActionAnchor
    && !inspectionActive
    && !editingText
    && !rotationGesture
    && !resizeGesture
    && !groupGesture
    && !textFrameGesture
    && !micro3DGesture,
  );
  const showSpacingMeasurements = Boolean(
    altDown
    && selectedObjects.length
    && tool === "select"
    && !spaceDown
    && !inspectionActive
    && !editingText
    && !rotationGesture
    && !resizeGesture
    && !groupGesture
    && !textFrameGesture
    && !micro3DGesture,
  );

  const addSourceInstanceToBoard = useCallback((sourceId) => {
    if (cloudReadOnly) {
      announce("目前為僅檢視；請先申請編輯權限。", "warning");
      return;
    }
    const source = sourceAssetsFromObjects(boardRef.current.objects).find((item) => item.sourceId === sourceId);
    if (!source) {
      announce("找不到這份來源素材。", "warning");
      return;
    }
    const instance = createSourceInstance(source.representative, canvasCenterWorld());
    applyBoard((current) => ({ ...current, objects: [...current.objects, instance] }));
    selectedIdsRef.current = [instance.id];
    setSelectedIds([instance.id]);
    setKeyObjectId(instance.id);
    setTool("select");
    setMobilePanel(null);
    changeLeftTab("layers");
    announce(`已從「${source.representative.originalFilename || source.representative.name}」新增一個畫布實例`, "success");
  }, [announce, applyBoard, canvasCenterWorld, changeLeftTab, cloudReadOnly]);

  const showSourceInstances = useCallback((sourceId) => {
    const source = sourceAssetsFromObjects(boardRef.current.objects).find((item) => item.sourceId === sourceId);
    const targets = source
      ? boardRef.current.objects.filter((object) => source.instanceIds.includes(object.id) && object.visible)
      : [];
    if (!targets.length) {
      announce(source ? "這份素材的畫布實例目前都已隱藏。" : "找不到這份來源素材。", "warning");
      return;
    }
    const ids = targets.map((object) => object.id);
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
    setKeyObjectId(ids[0]);
    setTool("select");
    setMobilePanel(null);
    changeLeftTab("layers");
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const points = targets.flatMap(objectWorldCorners);
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const zoom = clamp(Math.min((rect.width - 96) / width, (rect.height - 96) / height), MIN_ZOOM, 1.8);
      const nextView = {
        zoom,
        x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
        y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
      };
      viewRef.current = nextView;
      setView(nextView);
    }
    announce(`已在畫布顯示並選取 ${targets.length} 個畫布實例`, "success");
  }, [announce, changeLeftTab]);

  const exportSourceAsset = useCallback(async (sourceId) => {
    const source = sourceAssetsFromObjects(boardRef.current.objects).find((item) => item.sourceId === sourceId);
    if (!source) {
      announce("找不到這份來源素材。", "warning");
      return;
    }
    setIsExporting(true);
    try {
      const { sourceExportArtifact } = await loadAssetExportRuntime();
      const artifact = await sourceExportArtifact(source.representative);
      const sourceName = source.representative.originalFilename || source.representative.name || "source";
      const baseName = sourceName.replace(/\.[^.]+$/, "");
      downloadBlob(artifact.blob, `${safeFilename(baseName, "source")}.${artifact.extension}`);
      announce(`已下載原始素材「${sourceName}」`, "success");
    } catch (error) {
      announce(error?.message || "原始素材下載失敗；畫布實例未受影響。", "error");
    } finally {
      setIsExporting(false);
    }
  }, [announce]);

  const renameLibraryItem = async (item, name) => {
    if (item.boardId === boardRef.current.id) {
      if (cloudReadOnly) throw new Error("此檔案為僅檢視，請先取得編輯權限。");
      const renamed = applyBoard((current) => ({ ...current, name }));
      await persistBoardLocally({ ...renamed, view: viewRef.current });
      await refreshLocalLibrarySummary();
      if (storageTargetForBoard(storagePreferences, renamed.id) === "drive") {
        const saved = await saveBoardToGoogleDrive();
        return Boolean(saved);
      }
      announce("名稱已更新；請儲存工作檔以更新本機檔案內容。", "success");
      return true;
    }
    if (driveSavePromiseRef.current || driveSession.busy) throw new Error("目前正在儲存，請稍後再試。");
    if (!item.remote && !item.linkedFileId) {
      if (!item.local?.board) throw new Error("找不到本機檔案內容。");
      await upsertLocalBoard(stampBoard({ ...item.local.board, name }, sessionIdRef.current));
      await refreshLocalLibrarySummary();
      announce("本機工作檔名稱已更新。", "success");
      return true;
    }
    const accessToken = currentDriveAccessToken();
    if (!accessToken) throw new Error("請先連結 Google Drive，再更新雲端檔案名稱。");
    const fileId = item.remote?.id || item.linkedFileId;
    const resourceKey = item.remote?.resourceKey || item.link?.resourceKey || "";
    const { downloadCurrentGoogleDriveMoodboard, uploadGoogleDriveMoodboard } = await loadDriveRuntime();
    const { content, metadata } = await downloadCurrentGoogleDriveMoodboard(accessToken, fileId, { resourceKey });
    if (driveFileRole(metadata) === "viewer") throw new Error("此檔案為僅檢視，請先取得編輯權限。");
    const original = item.local?.board || ensureBoard(JSON.parse(content));
    const renamed = stampBoard({ ...original, name }, sessionIdRef.current);
    const saved = await uploadGoogleDriveMoodboard(accessToken, {
      board: renamed, content: serializeMoodboardSnapshot(renamed), filename: `${safeFilename(name, "studio")}.${/\.moodboard$/i.test(metadata.name || "") ? "moodboard" : "studio"}`,
      existingFile: { id: fileId, resourceKey }, expectedVersion: item.link?.version || metadata.version,
      expectedHeadRevisionId: item.link?.headRevisionId || "",
      latestWins: true,
    });
    if (item.local?.board) await upsertLocalBoard(renamed);
    updateDriveSettings((current) => linkDriveFile(current, renamed, saved));
    await refreshLocalLibrarySummary();
    await refreshGoogleDrive();
    announce("名稱已更新至 Google Drive。", "success");
    return true;
  };

  const resolvedKeyObjectId = selectedIds.includes(keyObjectId) ? keyObjectId : (selectedIds[0] || null);
  const effectiveLeftPanelVisible = !focusMode && leftPanelVisible;
  const effectiveRightPanelVisible = !focusMode && rightPanelVisible;
  const driveUploadPaused = Boolean(storagePreferences.uploadPaused[board.id]);
  const drivePresentation = driveUploadPaused && !driveSession.busy
    ? { icon: CloudUpload, label: "已復原本機內容；請確認後更新至雲端", tone: "warning" }
    : dirty && !driveSession.busy && ["synced", "ready"].includes(driveSession.status)
      ? { icon: CloudUpload, label: "有變更尚未儲存至雲端", tone: "warning" }
      : driveStatusPresentation(driveSession);
  const DriveStatusIcon = drivePresentation.icon;
  const driveNeedsAttention = ["offline", "quota", "conflict", "authorization-required", "error", "synced-local-warning"].includes(driveSession.status);
  const cloudHeaderStatus = driveHeaderIndicator({ status: driveSession.status, busy: driveSession.busy, dirty, paused: driveUploadPaused });
  const localSaveNeedsAttention = ["本機復原副本寫入失敗", "儲存失敗；變更仍留在目前分頁", "自動儲存不可用"].includes(saveState);
  const preferLocalSaveState = localSaveNeedsAttention || (!storagePreferences.autoSave && dirty);
  const topbarSaveState = currentPrimaryStorageTarget === "drive"
    ? (preferLocalSaveState
      ? saveState
      : storagePreferences.showSaveStatus || driveNeedsAttention || dirty
      ? (dirty || driveUploadPaused ? drivePresentation.label : driveSession.message || drivePresentation.label)
      : "主要位置：Google Drive")
    : currentPrimaryStorageTarget === "local"
      ? (storagePreferences.showSaveStatus || dirty
        ? saveState
        : localFileBinding.status === "linked"
          ? `主要位置：${localFileBinding.name || ".studio 檔案"}`
          : localFileBinding.status === "browser-only" || localFileBinding.status === "unsupported"
            ? "主要位置：這個瀏覽器"
            : "尚未指定 .studio 檔案")
      : "尚未選擇主要儲存位置";
  const hasBlockingDialog = Boolean(
    isBooting
    || escapeCancellationRequest
    || pendingObjectDeletion
    || showStorageLocation
    || (showLocalFileLocation && currentPrimaryStorageTarget === "local")
    || showGridBuilder
    || showAnnotationBuilder
    || pendingAdvancedFeature
    || showDeleteLocalData
    || showInterfaceThemes
    || showVersions
    || showShortcuts
    || showDriveLibrary
    || driveSaveConfirmation
    || localSwitchConfirmation
    || showCollaboration
    || showAgent
    || agentRequest
    || showEditPermissionRequest
    || preparedDownloads.length,
  );
  agentBlockingRef.current = hasBlockingDialog;

  return (
    <main
      ref={appRootRef}
      className={`moodboard-app ${isPanning ? "is-panning" : ""} ${isBooting ? "is-booting" : "is-boot-ready"} ${focusMode ? "is-focus-mode" : ""}`}
      data-interface-theme={visualInterfaceTheme.id}
      data-interface-mode={resolvedInterfaceMode}
      data-interface-mode-preference={interfaceModePreference}
      style={interfaceThemeStyle}
      aria-busy={isBooting}
    >
      {isBooting ? <StartupSequence onComplete={finishStartup} /> : null}
      <header className="app-topbar" aria-hidden={isBooting || focusMode || undefined} inert={isBooting || focusMode ? true : undefined}>
        <div className="topbar-primary">
          <div className="brand-block" role="img" aria-label="Infinite Studio" title="Infinite Studio｜PETFASHION 創意工具">
            <StudioBrandMark />
            <span className="brand-name" aria-hidden="true">INFINITE <span>studio</span></span>
          </div>
        </div>

        <label className="board-title-field">
          <span className="sr-only">{sourceModeActive ? "回到畫布後修改名稱" : "Infinite Studio 名稱"}</span>
          <input
            value={board.name}
            onChange={(event) => applyBoard((current) => ({ ...current, name: event.target.value }))}
            disabled={cloudReadOnly || sourceModeActive}
            title={`${board.name} · ${sourceModeActive ? "素材檢視中；回到畫布後才能修改名稱" : topbarSaveState}`}
          />
          <small className="sr-only" aria-live="polite">{sourceModeActive ? "素材檢視中 · 工作檔名稱唯讀" : topbarSaveState}</small>
        </label>

        <div className="topbar-secondary">
          {!updateNoticeDismissed && !hasBlockingDialog ? (
            <AppUpdateNotice updateCheck={updateCheck} updateAction={updateAction}
              autoUpdateEnabled={updatePreference === "auto"} onEnableAutoUpdate={() => setAppAutoUpdate(true)}
              onUpdateNow={() => applyAppUpdate()} onSnooze={snoozeCurrentAppUpdate} />
          ) : null}
          <button className={`topbar-save-button ${currentPrimaryStorageTarget === "drive" ? `is-${drivePresentation.tone}` : ""}`} type="button" onClick={cloudReadOnly ? () => setShowEditPermissionRequest(true) : savePreferredBoard}
            disabled={sourceModeActive || driveSession.busy}
            title={cloudReadOnly ? "申請編輯權限" : currentPrimaryStorageTarget === "drive" ? `上傳目前畫布至 Google Drive；不會載入雲端內容。 ${drivePresentation.label}` : topbarSaveState}>
            {currentPrimaryStorageTarget === "drive" ? (driveSession.busy ? <RefreshCw size={16} className="is-spinning" aria-hidden="true" /> : <DriveStatusIcon size={16} aria-hidden="true" />) : <Save size={16} aria-hidden="true" />}
            <span>{cloudReadOnly ? "申請編輯權" : currentPrimaryStorageTarget === "drive" ? "更新至雲端" : "儲存"}</span>
            {currentPrimaryStorageTarget === "drive" && cloudHeaderStatus ? <span className="topbar-save-status">{cloudHeaderStatus}</span> : null}
          </button>
          {currentPrimaryStorageTarget === "drive" ? <span className="sr-only" role="status" aria-live="polite">{drivePresentation.label}</span> : null}
          <IconButton
            label={sourceModeActive ? "回到畫布後復原 ⌘Z" : "復原 ⌘Z"}
            onClick={undo}
            disabled={cloudReadOnly || sourceModeActive || !undoRef.current.length}
          ><Undo2 size={18} /></IconButton>
          <IconButton
            label={sourceModeActive ? "回到畫布後重做 ⇧⌘Z" : "重做 ⇧⌘Z"}
            onClick={redo}
            disabled={cloudReadOnly || sourceModeActive || !redoRef.current.length}
          ><Redo2 size={18} /></IconButton>
          <AccountMenu user={authSession.user} signedIn={authReady} onCloseSettings={closeAccountSettings} onOpenSection={(section) => { setSettingsInitialSection(section); setShowSettings(true); }} />
          <div className="file-actions">
            <FileMenu
              onOpenLibrary={openGoogleDriveLibrary}
              onOpenFile={openBoardFile}
              onSave={cloudReadOnly ? () => setShowEditPermissionRequest(true) : savePreferredBoard}
              saveLabel={currentPrimaryStorageTarget === "drive" ? "更新至雲端" : "儲存"}
              onSaveAs={() => saveBoardFile(true)}
              onExportBrowser={exportBrowserHtml}
              onExportObjects={() => exportObjects("selected")}
              onOutputComposition={outputSelectionComposition}
              canExportObjects={!sourceModeActive && selectedObjects.length > 0}
              canOutputComposition={!sourceModeActive && selectedObjects.length > 0}
              onOpenCollaboration={() => requestAdvancedFeature("collaboration")}
              onOpenAgent={() => setShowAgent(true)}
              onToggleGuidesLocked={toggleGuidesLocked}
              onOpenVersions={openVersionModal}
              onOpenAbout={openAboutSettings}
              guidesLocked={Boolean(board.guidesLocked)}
              guideControlsDisabled={cloudReadOnly || sourceModeActive}
              saveTitle={currentPrimaryStorageTarget === "drive"
                ? "儲存到 Google Drive"
                : currentPrimaryStorageTarget === "local"
                  ? localFileBinding.status === "linked"
                    ? `儲存到 ${localFileBinding.name || ".studio 檔案"}`
                    : "選擇 .studio 儲存位置"
                  : "選擇主要儲存位置"}
              collaborationCount={authReady && driveSharing.fileId
                ? Math.max(1, driveSharing.members.length)
                : authReady && peers.length ? peers.length + 1 : 0}
            />
          </div>
          <MobileTopbarMoreMenu
            open={mobileTopbarMenuOpen}
            onOpenChange={setMobileTopbarMenuOpen}
            onOpenAccount={openAccountSettings}
            onZoomWindow={activateZoomWindowTool}
            showZoomWindow={!sourceModeActive}
            zoomWindowActive={tool === "zoom-window"}
            zoomWindowZoomOut={altDown}
          />
        </div>
      </header>

      {focusMode ? (
        <button
          className={`workspace-chrome-restore ${focusMode ? "" : "is-panels-only"}`}
          type="button"
          onClick={focusMode ? restoreWorkspaceChrome : showBothPanels}
          title="顯示工作區面板（Esc）"
        >
          <PanelLeft size={17} /><span>顯示面板</span><kbd>Esc</kbd>
        </button>
      ) : null}

      <div
        className={`app-body ${effectiveLeftPanelVisible ? "" : "is-left-hidden"} ${effectiveRightPanelVisible ? "" : "is-right-hidden"} ${leftPanelResizing ? "is-resizing-left" : ""} ${rightPanelResizing ? "is-resizing-right" : ""} ${mobilePanel ? `is-mobile-${mobilePanel}-open` : ""}`}
        style={{ "--panel-width": `${leftPanelWidth}px`, "--inspector-width": `${rightPanelWidth}px` }}
        aria-hidden={isBooting || undefined}
        inert={isBooting ? true : undefined}
      >
        {!focusMode ? <>
          <PanelEdge side="left" visible={effectiveLeftPanelVisible} onToggle={toggleLeftPanel} width={leftPanelWidth} min={LEFT_PANEL_MIN_WIDTH} max={getLeftPanelMaxWidth(rightPanelWidth)} onResizeStart={onLeftPanelResizeStart} onResizeKeyDown={onLeftPanelResizeKeyDown} onResetWidth={() => updateLeftPanelWidth(LEFT_PANEL_MIN_WIDTH)} />
          <PanelEdge side="right" visible={effectiveRightPanelVisible} onToggle={toggleRightPanel} width={rightPanelWidth} min={RIGHT_PANEL_MIN_WIDTH} max={getRightPanelMaxWidth(leftPanelWidth)} onResizeStart={onRightPanelResizeStart} onResizeKeyDown={onRightPanelResizeKeyDown} onResetWidth={() => updateRightPanelWidth(304)} />
          <PanelEdge mobile side="left" visible={mobilePanel === "left"} onToggle={() => setMobilePanel((current) => current === "left" ? null : "left")} />
          <PanelEdge mobile side="right" visible={mobilePanel === "right"} onToggle={() => setMobilePanel((current) => current === "right" ? null : "right")} />
        </> : null}
        <LeftSidebar
          board={board}
          selectedIds={selectedIds}
          selectedGuideIds={selectedGuideIds}
          onSelect={selectObject}
          onSelectLayers={selectLayerObjects}
          onSelectGroup={selectGroup}
          onSelectGuide={selectGuide}
          onSelectGuideGroup={selectGuideGroup}
          onToggleGuideLocked={toggleGuideLocked}
          onToggleGuidesLocked={toggleGuidesLocked}
          onLockSelectedGuides={lockSelectedGuides}
          onDeleteGuides={deleteGuides}
          onToggleSelectedGuideGroup={toggleGuideSelectionGroup}
          onUngroupGuideGroup={ungroupGuideSelection}
          onToggleVisible={toggleVisibility}
          onSetSelectedVisibility={setSelectedVisibility}
          onExportSelected={() => exportObjects("selected")}
          onOutputSelected={outputSelectionComposition}
          onDeleteSelected={deleteSelected}
          onUngroup={ungroupSelection}
          onDuplicateLayer={duplicateLayerObject}
          onDeleteLayer={deleteLayerObject}
          onMoveLayer={moveLayer}
          onReorderLayer={reorderLayer}
          onLocate={locateObject}
          layerTypeFilter={layerTypeFilter}
          setLayerTypeFilter={setLayerTypeFilter}
          guidesVisible={guidesVisible}
          rulerUnit={rulerUnit}
          rulerOrigin={board.rulerOrigin}
          readOnly={cloudReadOnly}
          leftTab={leftTab}
          setLeftTab={changeLeftTab}
          sourceAssets={sourceAssets}
          filters={filters}
          setFilters={setFilters}
          matchCount={filteredObjects.length}
          selectedCaptureId={selectedCaptureId}
          onCapture={captureCurrentView}
          onRestoreCapture={restoreCapture}
          onRestoreLastComposition={restoreLastComposition}
          onReplaceCapture={replaceCapture}
          onMoveCapture={moveCapture}
          onReorderCapture={reorderCapture}
          onDeleteCapture={deleteCapture}
          mobilePanel={mobilePanel}
          setMobilePanel={setMobilePanel}
        />

        <section className="canvas-column">
          {!hasBlockingDialog && !sourceModeActive && (driveIncomingVersion?.boardId === board.id || driveLoadRecovery?.loadedBoardId === board.id || (driveUploadPaused && currentPrimaryStorageTarget === "drive")) ? (
            <div className="workspace-storage-notice" role="status">
              {driveIncomingVersion?.boardId === board.id ? <>
                <span><strong>雲端與目前內容不同</strong><small>載入前會備份目前畫布，可隨時復原。</small></span>
                <button className="secondary-button" disabled={driveSession.busy} onClick={() => openGoogleDriveFile(driveIncomingVersion)}>載入雲端版本</button>
                <button className="quiet-button" onClick={() => setDriveIncomingVersion(null)}>保留目前工作</button>
              </> : driveLoadRecovery?.loadedBoardId === board.id ? <>
                <span><strong>已載入雲端版本</strong><small>載入前的畫面已保留。</small></span>
                <button className="secondary-button" disabled={versionBusy || driveSession.busy} onClick={restoreBeforeDriveLoad}>復原載入前內容</button>
                <button className="quiet-button" onClick={() => setDriveLoadRecovery(null)}>暫時隱藏提示</button>
              </> : <>
                <span><strong>自動上傳已暫停</strong><small>已復原目前內容，確認後請按上方「更新至雲端」。</small></span>
              </>}
            </div>
          ) : null}
          <div
            ref={canvasToolbarRef}
            className={`canvas-toolbar ${sourceModeActive ? "is-source-toolbar" : ""} ${canvasToolbarPosition ? "has-custom-position" : ""} ${canvasToolbarDragging ? "is-dragging" : ""}`}
            style={canvasToolbarPosition ? {
              "--canvas-toolbar-x": `${canvasToolbarPosition.x}px`,
              "--canvas-toolbar-y": `${canvasToolbarPosition.y}px`,
            } : undefined}
            aria-label={sourceModeActive ? "素材工具" : "畫布工具"}
          >
            <button
              className="canvas-toolbar-drag-handle"
              type="button"
              aria-label={sourceModeActive ? "移動素材工具列" : "移動畫布工具列"}
              title="拖曳移動；方向鍵微調；連按兩下或 Home 回到預設位置"
              onPointerDown={onCanvasToolbarDragStart}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                resetCanvasToolbarPosition();
              }}
              onKeyDown={onCanvasToolbarHandleKeyDown}
            >
              <GripVertical size={15} aria-hidden="true" />
            </button>
            {sourceModeActive ? (
              <div className="source-toolbar-context">
                <button className="source-toolbar-action source-toolbar-back" type="button" onClick={() => changeLeftTab("layers")} aria-label="回到畫布" title="回到畫布">
                  <ArrowLeft size={17} /><span>回到畫布</span>
                </button>
                <div className="tool-divider" />
                <div className="source-toolbar-target" title={activeSourceAsset?.representative.originalFilename || activeSourceAsset?.representative.name || "尚無來源素材"}>
                  <ImageIcon size={16} />
                  <span data-l10n-ignore>{activeSourceAsset?.representative.originalFilename || activeSourceAsset?.representative.name || "尚無來源素材"}</span>
                  {activeSourceAsset ? <small>{`${activeSourceAsset.instanceIds.length} 個實例`}</small> : null}
                </div>
                <button className="source-toolbar-action" type="button" onClick={() => addSourceInstanceToBoard(resolvedActiveSourceId)} disabled={!activeSourceAsset || cloudReadOnly} aria-label="從目前素材新增畫布實例" title="從目前素材新增畫布實例">
                  <ImagePlus size={17} /><span>新增實例</span>
                </button>
                <button className="source-toolbar-action" type="button" onClick={() => showSourceInstances(resolvedActiveSourceId)} disabled={!activeSourceAsset} aria-label="在畫布定位目前素材的可見畫布實例" title="在畫布定位目前素材的可見畫布實例">
                  <LocateFixed size={17} /><span>定位實例</span>
                </button>
                <button className="source-toolbar-action" type="button" onClick={() => exportSourceAsset(resolvedActiveSourceId)} disabled={!activeSourceAsset || isExporting} aria-label="下載目前的原始素材" title="下載目前的原始素材">
                  <Download size={17} /><span>{isExporting ? "準備中…" : "下載原檔"}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="tool-group">
                  <IconButton label="選取工具 Shift+V；連按兩下顯示全部物件" active={tool === "select"} aria-pressed={tool === "select"} onClick={(event) => onPrimaryCanvasToolClick(event, "select")}><MousePointer2 size={18} /></IconButton>
                  <IconButton label="平移工具 Shift+H（按住 Space 可暫時使用；按住 Shift 可暫時選取）；連按兩下回到 100%" active={tool === "hand"} aria-pressed={tool === "hand"} onClick={(event) => onPrimaryCanvasToolClick(event, "hand")}><Hand size={18} /></IconButton>
                  <IconButton
                    className="desktop-zoom-window-tool"
                    label={altDown
                      ? "縮小範圍：拖曳框住區域；放開 Option／Alt 回到放大"
                      : "縮放範圍：拖曳框住要放大的區域；按住 Option／Alt 反向縮小；Esc 取消"}
                    active={tool === "zoom-window"}
                    aria-pressed={tool === "zoom-window"}
                    onClick={activateZoomWindowTool}
                  >
                    {altDown ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
                  </IconButton>
                  <IconButton
                    label={authReady ? "進階 3D 旋轉工具 Shift+3（拖曳選取物件旋轉）" : "進階 3D 旋轉工具 Shift+3（需要登入）"}
                    active={tool === "3d"}
                    aria-pressed={tool === "3d"}
                    disabled={cloudReadOnly || !selectedIds.length}
                    onClick={() => tool === "3d" ? setTool("select") : requestAdvancedFeature("3d")}
                  >
                    <Box size={18} />
                  </IconButton>
                </div>
                <div className="tool-divider" />
                <InsertToolbar
                  open={shapeMenuOpen}
                  disabled={cloudReadOnly}
                  onToggle={() => setShapeMenuOpen((current) => !current)}
                  onClose={() => setShapeMenuOpen(false)}
                  onAddGrid={() => setShowGridBuilder(true)}
                  onAddText={addTextObject}
                  onImportText={() => textDocumentInputRef.current?.click()}
                  onAddShape={addShapeObject}
                  onChooseImage={() => { setShapeMenuOpen(false); imageInputRef.current?.click(); }}
                  onChooseVideo={() => { setShapeMenuOpen(false); videoInputRef.current?.click(); }}
                  onChooseSvg={() => { setShapeMenuOpen(false); svgInputRef.current?.click(); }}
                />
                <div className="tool-divider" />
                <div className="zoom-group">
                  <IconButton label="縮小" onClick={() => { const rect = canvasRef.current.getBoundingClientRect(); zoomAround(rect.left + rect.width / 2, rect.top + rect.height / 2, view.zoom / 1.2); }}><Minus size={17} /></IconButton>
                  <button
                    className="zoom-value"
                    type="button"
                    aria-label={`縮放 ${Math.round(view.zoom * 100)}%；連按兩下切換顯示全部與 100%`}
                    title="連按兩下切換顯示全部與 100%"
                    onClick={onZoomValueClick}
                    onKeyDown={onZoomValueKeyDown}
                  >
                    {Math.round(view.zoom * 100)}%
                  </button>
                  <IconButton label="放大" onClick={() => { const rect = canvasRef.current.getBoundingClientRect(); zoomAround(rect.left + rect.width / 2, rect.top + rect.height / 2, view.zoom * 1.2); }}><Plus size={17} /></IconButton>
                </div>
              </>
            )}
          </div>

          <div
            ref={canvasRef}
            className={`canvas-viewport canvas-background-${canvasBackground.mode} ${dragActive ? "is-drag-active" : ""} ${sourceModeActive ? "is-source-mode" : ""} ${tool === "hand" || spaceDown ? "uses-hand" : ""} ${tool === "zoom-window" ? "uses-zoom-window" : ""} ${tool === "zoom-window" && altDown ? "uses-zoom-window-out" : ""} ${tool === "3d" ? "uses-3d" : ""} ${rotationGesture ? "is-rotating" : ""} ${micro3DGesture ? "is-3d-rotating" : ""} ${modifierDown ? "can-temporary-select" : ""} ${loadedTextFlow ? "is-text-flow-loaded" : ""}`}
            style={canvasGridStyle}
            onPointerDownCapture={sourceModeActive ? undefined : onZoomWindowPointerDown}
            onPointerDown={sourceModeActive ? undefined : onCanvasPointerDown}
            onDoubleClick={sourceModeActive ? undefined : onCanvasDoubleClick}
            onWheel={sourceModeActive ? undefined : onWheel}
            onDragEnter={(event) => { event.preventDefault(); if (!cloudReadOnly && !sourceModeActive) setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.target === event.currentTarget) setDragActive(false); }}
            onDrop={sourceModeActive ? onSourceModeDrop : onDrop}
          >
            {!inspectionActive ? (
              <WorkspaceRulers
                rulersVisible={rulersVisible}
                guidesVisible={guidesVisible}
                guidesLocked={Boolean(board.guidesLocked)}
                readOnly={cloudReadOnly}
                guides={board.guides || []}
                selectedGuideIds={selectedGuideIds}
                draggingGuide={guideDrag}
                view={view}
                viewportSize={canvasViewportSize}
                unit={rulerUnit}
                rulerOrigin={board.rulerOrigin}
                onUnitChange={changeRulerUnit}
                onSetRulerOrigin={setRulerOrigin}
                onStartGuide={startGuideDrag}
                onToggleGuideLocked={toggleGuideLocked}
                onDeleteGuide={deleteGuide}
              />
            ) : null}
            {!sourceModeActive ? <div
              className={`world-layer ${filtersActive ? "is-filter-muted" : ""}`}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
              aria-hidden={filtersActive}
              inert={filtersActive ? true : undefined}
            >
              {board.objects.filter((object) => object.visible).map((object) => (
                <CanvasObject
                  key={object.id}
                  object={object}
                  selected={selectedIds.includes(object.id)}
                  soleSelected={soleSelectedId === object.id}
                  multiSelected={selectedIds.length > 1 && selectedIds.includes(object.id)}
                  keyObject={selectedIds.length > 1 && resolvedKeyObjectId === object.id}
                  selectionEnabled={(tool !== "hand" || modifierDown) && tool !== "zoom-window"}
                  editable={!cloudReadOnly}
                  inverseZoom={1 / view.zoom}
                  onPointerDown={onObjectPointerDown}
                  onPointerUp={onObjectPointerUp}
                  onDoubleClick={onObjectDoubleClick}
                  onRotateStart={onRotateStart}
                  onResizeStart={onResizeStart}
                  onRestoreSize={restoreSize}
                  onResetRotation={resetRotation}
                  micro3DMode={tool === "3d"}
                  micro3DGesture={micro3DGesture}
                  onMicro3DRotateStart={onMicro3DRotateStart}
                  onResetMicro3D={resetSelectedMicro3D}
                  onVideoControlsChange={setVideoControlsVisible}
                  onSelect={selectObject}
                  resizeGesture={resizeGesture}
                  editingText={editingText}
                  textFrameGesture={textFrameGesture}
                  onStartTextEdit={startTextEdit}
                  onTextChange={updateInlineText}
                  onFinishTextEdit={finishTextEdit}
                  onTextFrameResizeStart={onTextFrameResizeStart}
                  onAutoFitTextFrame={autoFitTextFrame}
                  onLoadTextOverflow={loadTextOverflow}
                  textFlowLoaded={loadedTextFlow?.sourceId === object.id}
                />
              ))}
              {multiSelectionBounds && !cloudReadOnly ? (
                <SelectionGroupOverlay
                  bounds={multiSelectionBounds}
                  anchorKey={selectionAnchor}
                  inverseZoom={1 / view.zoom}
                  gesture={groupGesture}
                  onRotateStart={onGroupRotateStart}
                  onResizeStart={onGroupResizeStart}
                  micro3DMode={tool === "3d"}
                  micro3DGesture={micro3DGesture}
                  onMicro3DRotateStart={onMicro3DRotateStart}
                  onResetMicro3D={resetSelectedMicro3D}
                  semanticLabel={selectionSemanticLabel}
                />
              ) : null}
            </div> : null}

            {!sourceModeActive && smartAlignmentGuides.length ? (
              <SmartAlignmentOverlay guides={smartAlignmentGuides} view={view} />
            ) : null}

            {showSpacingMeasurements ? (
              <SelectionSpacingOverlay measurements={spacingMeasurements} view={view} unit={rulerUnit} />
            ) : null}

            {showSelectionActions && !cloudReadOnly ? (
              <SelectionActionBar
                count={selectedObjects.length}
                grouped={selectionGrouped}
                onAddArtboard={addArtboardBehindSelection}
                onAddAnnotation={() => setShowAnnotationBuilder(true)}
                onGrid={() => setShowGridBuilder(true)}
                onToggleGroup={toggleSelectionGroup}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
                style={selectionActionStyle}
              />
            ) : null}

            {marquee && !inspectionActive ? <div className="selection-marquee" style={marquee} aria-hidden="true" /> : null}
            {zoomWindowRect && !inspectionActive ? <div className="zoom-window-marquee" style={zoomWindowRect} aria-hidden="true">{zoomWindowRect.width >= 96 && zoomWindowRect.height >= 48 ? <span>{altDown ? "縮小此區域" : "放大此區域"}</span> : null}</div> : null}

            {cloudReadOnly && !sourceModeActive ? (
              <button className="cloud-read-only-banner" type="button" onClick={() => setShowEditPermissionRequest(true)}>
                <Eye size={15} /><span><strong>僅檢視</strong><small>申請編輯權限</small></span>
              </button>
            ) : null}

            {loadedTextFlow && !inspectionActive ? (
              <div className="text-flow-placement-status" role="status">
                <span className="text-flow-cursor-symbol" aria-hidden="true"><Type size={13} /><Plus size={9} /></span>
                <span><strong>已載入溢出文字</strong><small>在空白畫布點一下建立連結文字框 · Esc 取消</small></span>
              </div>
            ) : null}

            {!board.objects.length && !inspectionActive ? (
              <div className="canvas-empty">
                <div className="empty-visual" aria-hidden="true"><span /><span /><span /></div>
                <h1>把靈感放到一個沒有邊界的地方。</h1>
                <p>加入文字與基本形狀，或從桌面拖入圖片、影片與 SVG；也可以按 ⌘V 貼上。</p>
                <button className="primary-button" type="button" onClick={() => imageInputRef.current?.click()}><ImagePlus size={18} /> 加入第一張圖片</button>
                <small>素材只會留在你的瀏覽器與你主動儲存的檔案中。</small>
              </div>
            ) : null}

            {sourceModeActive ? (
              <SourceStage
                sourceAssets={sourceAssets}
                activeSourceId={resolvedActiveSourceId}
                onSelectSource={setActiveSourceId}
                onExit={() => changeLeftTab("layers")}
                spaceDown={spaceDown}
              />
            ) : null}

            {filtersActive && leftTab !== "sources" ? (
              <FilterStage objects={filteredObjects} selectedIds={selectedIds} onSelect={selectObject} onClear={() => setFilters(DEFAULT_FILTERS)} filters={filters} />
            ) : null}

            {dragActive && !sourceModeActive ? <div className="drop-overlay"><ImagePlus size={34} /><strong>放開以加入圖片、影片或 SVG</strong><span>原始檔不會上傳到伺服器</span></div> : null}

            <div className={`canvas-bottom-hud ${rulersVisible && !inspectionActive ? "has-rulers" : ""}`}>
              <div className="canvas-status" aria-label="工作檔狀態">
                <span className="canvas-status-primary">{sourceModeActive ? `${sourceAssets.length} 個來源素材` : `${board.objects.length} 個物件`}</span>
                {sourceModeActive && activeSourceAsset ? <span className="canvas-status-source" data-l10n-ignore>{activeSourceAsset.representative.originalFilename || activeSourceAsset.representative.name}</span> : null}
                <span className="canvas-status-revision" title="目前工作檔內容版本">內容 r{board.revision}</span>
                <span className="canvas-status-save">{saveState}</span>
                <span className="app-version" aria-label={`Infinite Studio 應用程式版本 ${APP_VERSION}`} title={`Infinite Studio ${APP_VERSION_LABEL}`}>{APP_VERSION_LABEL}</span>
              </div>

              {!sourceModeActive ? <div className="export-dock" role="toolbar" aria-label="匯出與合成輸出">
                <div className="export-dock-group" role="group" aria-label="匯出個別素材">
                  <label>
                    <span className="sr-only">匯出範圍</span>
                    <select value={exportScope} onChange={(event) => setExportScope(event.target.value)} aria-label="匯出範圍">
                      <option value="selected">選取的物件</option>
                      <option value="unselected">未選取的物件</option>
                      <option value="all">全部物件</option>
                    </select>
                  </label>
                  <button type="button" onClick={exportObjects} disabled={!exportCount || isExporting || isRenderingComposition} title="每個物件各自匯出一個素材檔">
                    <Download size={16} /> {isExporting ? "匯出中…" : `匯出素材 ${exportCount ? `(${exportCount})` : ""}`}
                  </button>
                </div>
                <span className="export-dock-divider" aria-hidden="true" />
                <div className="export-dock-group composition-output-group" role="group" aria-label="輸出選取物件合成圖">
                  <label>
                    <span className="sr-only">合成圖格式</span>
                    <select value={compositionFormat} onChange={(event) => setCompositionFormat(event.target.value)} aria-label="合成圖格式" disabled={isRenderingComposition}>
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                      <option value="avif">AVIF</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">合成圖解析度</span>
                    <select className="composition-scale-select" value={compositionScale} onChange={(event) => setCompositionScale(Number(event.target.value))} aria-label="合成圖解析度" disabled={isRenderingComposition}>
                      <option value="1">1×</option>
                      <option value="2">2×</option>
                    </select>
                  </label>
                  <button
                    className="composition-output-button"
                    type="button"
                    onClick={outputSelectionComposition}
                    disabled={!compositionCount || isExporting || isRenderingComposition}
                    title={compositionCount ? "依目前位置、尺寸、旋轉與 3D 外觀輸出成一張檔案；不含操作框。點陣圖保留透明背景，PDF 使用深色畫布背景。" : "請先選取要合成輸出的物件"}
                  >
                    <ImageDown size={16} /> {isRenderingComposition ? "輸出中…" : `輸出合成圖 ${compositionCount ? `(${compositionCount})` : ""}`}
                  </button>
                </div>
              </div> : null}
            </div>
          </div>
        </section>

        {sourceModeActive ? (
          <SourceInspector
            source={activeSourceAsset}
            visibleInstanceCount={activeSourceVisibleInstanceCount}
            readOnly={cloudReadOnly}
            busy={isExporting}
            onAddInstance={addSourceInstanceToBoard}
            onShowInstances={showSourceInstances}
            onExportSource={exportSourceAsset}
            mobilePanel={mobilePanel}
            setMobilePanel={setMobilePanel}
          />
        ) : <Inspector
          board={board}
          selectedIds={selectedIds}
          onUpdateObject={updateObject}
          onPivotChange={changePivot}
          onRestoreSize={restoreSize}
          onResetRotation={resetRotation}
          onSetAspectLock={setSelectedAspectLock}
          onMicro3DChange={updateSelectedMicro3D}
          micro3DMode={tool === "3d"}
          onMicro3DModeChange={(active) => active ? requestAdvancedFeature("3d") : setTool("select")}
          markerDraft={markerDraft}
          setMarkerDraft={setMarkerDraft}
          onAddMarker={addMarker}
          onRemoveMarker={removeMarker}
          batchPrefix={batchPrefix}
          setBatchPrefix={setBatchPrefix}
          onBatchRename={batchRename}
          selectionAnchor={selectionAnchor}
          onSelectionAnchorChange={setSelectionAnchor}
          keyObjectId={resolvedKeyObjectId}
          onAlign={alignSelected}
          onDistribute={distributeSelected}
          resizeGesture={resizeGesture}
          groupGesture={groupGesture}
          localFontOptions={localFontOptions}
          localFontState={localFontState}
          onLoadLocalFonts={loadLocalFonts}
          onStartTextEdit={startTextEdit}
          onResizeTextFrame={resizeTextFrame}
          onFitArtboard={fitArtboardToContents}
          onResizeArtboardPreset={resizeArtboardPreset}
          selectionGrouped={selectionGrouped}
          onToggleGroup={toggleSelectionGroup}
          objectColorSets={objectColorSets}
          onSelectObjectColorSet={selectActiveObjectColorSet}
          onAddObjectColor={addObjectColorToActiveSet}
          onCreateObjectColorSet={createNamedObjectColorSet}
          onRenameObjectColorSet={renameNamedObjectColorSet}
          onRemoveObjectColor={removeObjectColorFromNamedSet}
          onDeleteObjectColorSet={deleteNamedObjectColorSet}
          onLoadObjectColorSets={() => objectColorSetsInputRef.current?.click()}
          onExportObjectColorSets={exportObjectColorSets}
          readOnly={cloudReadOnly}
          mobilePanel={mobilePanel}
          setMobilePanel={setMobilePanel}
        />}
      </div>

      {mobilePanel ? <button className="mobile-scrim" type="button" aria-label="關閉面板" onClick={() => setMobilePanel(null)} /> : null}
      {toast ? <div className={`toast toast-${toast.tone}`} role="status" tabIndex={0} {...toastPause}>{toast.tone === "success" ? <Check size={16} /> : toast.tone === "error" ? <AlertTriangle size={16} /> : null}<span>{toast.message}</span></div> : null}

      {escapeCancellationRequest ? (
        <EscapeCancellationModal
          request={escapeCancellationRequest}
          onKeep={keepEscapeAdjustment}
          onCancel={cancelEscapeAdjustment}
        />
      ) : null}

      {pendingObjectDeletion ? (
        <DeleteCompositionWarningModal
          request={pendingObjectDeletion}
          onCancel={cancelPendingObjectDeletion}
          onConfirm={confirmPendingObjectDeletion}
        />
      ) : null}

      {showStorageLocation ? (
        <StorageLocationModal
          currentTarget={currentPrimaryStorageTarget}
          onChoose={choosePrimaryStorageTarget}
          onClose={() => setShowStorageLocation(false)}
        />
      ) : null}

      {showLocalFileLocation && currentPrimaryStorageTarget === "local" ? (
        <LocalFileAutosaveModal
          binding={localFileBinding}
          supported={canUseFileSystemPicker}
          onChoose={chooseLocalFileForAutosave}
          onDownload={() => {
            saveBoardFile(true);
            dismissLocalFileLocation();
          }}
          onClose={dismissLocalFileLocation}
        />
      ) : null}

      {showGridBuilder ? (
        <GridModal selectedCount={selectedObjects.filter((object) => !isArtboardObject(object)).length} onApply={applyGrid} onClose={() => setShowGridBuilder(false)} />
      ) : null}

      {showAnnotationBuilder ? (
        <AnnotationModal targetCount={selectedObjects.length} onApply={applyAnnotation} onClose={() => setShowAnnotationBuilder(false)} />
      ) : null}

      {showSettings ? (
        <SettingsModal
          activeTheme={effectiveActiveTheme}
          accountLinkBusy={authBusy}
          accountLinkMessage={accountLinkMessage}
          accountReceipt={authReceipt}
          accountSignedIn={identitySignedIn}
          accountUser={authSession.user}
          canvasBackground={canvasBackground}
          currentDriveLink={currentDriveLink}
          driveCurrentContentBytes={currentDriveContentBytes}
          driveSession={driveSession}
          driveSettings={driveSettings}
          primaryStorageTarget={currentPrimaryStorageTarget}
          storagePreferences={storagePreferences}
          localLibrarySummary={localLibrarySummary}
          enableProviderTesting={providerTestMode}
          initialSection={settingsInitialSection}
          locale={interfaceLocale}
          localePreference={interfaceLocalePreference}
          mode={interfaceModePreference}
          resolvedMode={resolvedInterfaceMode}
          typography={interfaceTypography}
          updateCheck={updateCheck}
          updateAction={updateAction}
          autoUpdateEnabled={updatePreference === "auto"}
          leftPanelVisible={leftPanelVisible}
          rightPanelVisible={rightPanelVisible}
          rulersVisible={rulersVisible}
          guidesVisible={guidesVisible}
          rulerUnit={rulerUnit}
          onSetMode={setInterfaceMode}
          onSetCanvasBackground={setCanvasBackgroundMode}
          onUpdateCanvasBackground={updateCanvasBackgroundAppearance}
          onResetCanvasBackground={resetCanvasBackground}
          onSetLocale={chooseLocale}
          onSetTypography={updateInterfaceTypography}
          onResetTypography={resetInterfaceTypography}
          onCheckForUpdates={checkForAppUpdates}
          onSetAutoUpdate={setAppAutoUpdate}
          onUpdateNow={() => applyAppUpdate()}
          onSnoozeUpdate={snoozeCurrentAppUpdate}
          onConnectDrive={connectGoogleDrive}
          onDisconnectDrive={disconnectGoogleDrive}
          onManageThemes={openInterfaceThemes}
          onMarketingPreferenceChange={updateMoodboardMarketingPreference}
          onLinkEmail={linkEmailToMoodboardAccount}
          onLinkFacebook={linkFacebookToMoodboardAccount}
          onLinkGoogle={linkGoogleToMoodboardAccount}
          onSignInRequest={() => {
            setShowSettings(false);
            requestAdvancedFeature("account");
          }}
          onSignOut={signOutOfMoodboard}
          onClearLocalData={() => {
            setShowSettings(false);
            setShowDeleteLocalData(true);
          }}
          onResetPanelWidths={resetPanelWidths}
          onToggleLeftPanel={toggleLeftPanel}
          onToggleRightPanel={toggleRightPanel}
          onToggleRulers={toggleRulers}
          onToggleGuides={toggleGuides}
          onSetRulerUnit={changeRulerUnit}
          onOpenShortcuts={() => {
            setShowSettings(false);
            setShowShortcuts(true);
          }}
          onOpenDriveLibrary={() => {
            setShowSettings(false);
            openGoogleDriveLibrary();
          }}
          onOpenVersions={() => { setShowSettings(false); void openVersionModal(); }}
          onDownloadBackup={() => saveBoardFile(true)}
          onSetStorageTarget={choosePrimaryStorageTarget}
          onSetAutoSave={setAutoSavePreference}
          onSetShowSaveStatus={setSaveStatusPreference}
          onSaveDrive={() => saveBoardToGoogleDrive()}
          onSetDriveAutoSync={setDriveAutoSync}
          onClose={closeAccountSettings}
        />
      ) : null}

      {pendingAdvancedFeature ? (
        <AuthGate
          feature={pendingAdvancedFeature}
          session={authSession}
          locale={interfaceLocale}
          online={online}
          busy={authBusy}
          errorMessage={authMessage}
          emailLinkFlow={emailLinkFlow}
          onSetLocale={chooseLocale}
          onGoogleSignIn={signInToMoodboard}
          onSendEmailLink={sendEmailLinkToMoodboard}
          onCompleteEmailLink={completeEmailLinkToMoodboard}
          onAccept={acceptMoodboardAccess}
          onSignOut={signOutOfMoodboard}
          onRetry={() => setAuthRetryKey((value) => value + 1)}
          onClose={closeAdvancedFeatureGate}
        />
      ) : null}

      {showDeleteLocalData ? (
        <DeleteLocalDataModal
          isBusy={isClearingLocalData}
          onCancel={() => !isClearingLocalData && setShowDeleteLocalData(false)}
          onConfirm={clearMoodboardFromThisDevice}
        />
      ) : null}

      {showInterfaceThemes ? (
        <InterfaceThemeModal
          themes={displayedAvailableThemes}
          activeTheme={effectiveActiveTheme}
          previewTheme={effectivePreviewTheme}
          locale={interfaceLocale}
          onPreview={setPreviewTheme}
          onConfirm={confirmInterfaceTheme}
          onSave={saveCustomInterfaceTheme}
          onDelete={deleteCustomInterfaceTheme}
          onImport={() => themeInputRef.current?.click()}
          onExport={exportInterfaceTheme}
          onClose={closeInterfaceThemes}
        />
      ) : null}

      {showVersions ? (
        <VersionModal
          versions={versions}
          loadRecovery={driveLoadRecovery?.loadedBoardId === board.id ? driveLoadRecovery : null}
          onRestoreLoad={restoreBeforeDriveLoad}
          pendingTabUpdate={pendingTabUpdate?.boardId === board.id ? pendingTabUpdate : null}
          onOpenTabUpdate={() => pendingTabUpdate?.boardId === boardRef.current.id && openVersionCopy(pendingTabUpdate.board, "另一分頁副本")}
          board={board}
          versionLabel={versionLabel}
          setVersionLabel={setVersionLabel}
          driveVersions={driveVersions}
          driveLinked={Boolean(currentDriveLink)}
          onCreate={createManualVersion}
          onRestore={restoreVersion}
          readOnly={cloudReadOnly}
          onOpenLocalCopy={(version) => openVersionCopy(version.board, "本機復原")}
          onDeleteLocalVersion={removeLocalVersion}
          onRefreshDrive={refreshDriveVersions}
          onRecoverDrive={(revision) => recoverGoogleDriveVersionAsCopy({ id: currentDriveLink?.fileId, name: currentDriveLink?.name }, revision)}
          onClose={() => setShowVersions(false)}
          isBusy={versionBusy || driveSession.busy}
        />
      ) : null}
      {showShortcuts ? <ShortcutReferenceModal onClose={() => setShowShortcuts(false)} /> : null}
      {showDriveLibrary ? (
        <DriveLibraryModal
          board={board}
          currentContentBytes={currentDriveContentBytes}
          currentLink={currentDriveLink}
          driveSession={driveSession}
          driveSettings={driveSettings}
          primaryStorageTarget={currentPrimaryStorageTarget}
          localBoards={localBoards}
          syncJobs={syncJobs}
          onConnect={connectGoogleDrive}
          onCreateLocal={createLocalMoodboard}
          onDisconnect={disconnectGoogleDrive}
          onDownloadBackup={() => saveBoardFile(true)}
          onOpenDeviceFile={openBoardFile}
          onOpenLocal={openLocalMoodboard}
          onOpenFile={openGoogleDriveFile}
          onRecoverRemote={(file) => recoverGoogleDriveVersionAsCopy(file)}
          onRefresh={() => refreshGoogleDrive()}
          onRename={renameLibraryItem}
          onSave={() => saveBoardToGoogleDrive()}
          onSaveCopy={() => saveBoardToGoogleDrive({ asCopy: true })}
          onSetAutoSync={setDriveAutoSync}
          onClose={closeDriveLibrary}
        />
      ) : null}
      {driveSaveConfirmation ? <DriveSaveConfirmation
        target={driveSaveConfirmation}
        busy={Boolean(driveSession.busy)}
        status={driveSession.status}
        onClose={() => setDriveSaveConfirmation(null)}
        onConfirm={() => saveBoardToGoogleDrive({ forceOverwrite: true, overwriteTarget: driveSaveConfirmation })}
        onResolve={async () => {
          const action = driveSaveConfirmation.feedback?.action;
          const startingBoardId = boardRef.current.id;
          // Resolve only after the upload and its failure bookkeeping settle.
          await driveSavePromiseRef.current;
          if (boardRef.current.id !== startingBoardId) return;
          const reconnect = action === "reconnect";
          setDriveSaveConfirmation(null);
          if (reconnect && !authReady) requestAdvancedFeature("drive");
          else {
            setShowDriveLibrary(true);
            if (action === "review") void refreshGoogleDrive();
          }
        }}
      /> : null}
      {localSwitchConfirmation ? <Modal title="改用本機副本？" description="原雲端檔案與分享連結都會保留。" busy={versionBusy} onClose={() => !versionBusy && setLocalSwitchConfirmation(false)}>
        <div className="drive-save-confirmation">
          <p>將目前畫布另開為獨立的本機文件，之後的儲存不會更新原雲端檔案。若只想備份，請使用「下載本機副本」。</p>
          <div className="drive-save-confirmation-actions">
            <button className="secondary-button" disabled={versionBusy} onClick={() => setLocalSwitchConfirmation(false)}>取消</button>
            <button className="primary-button" disabled={versionBusy} onClick={async () => {
              const opened = await openVersionCopy(boardSnapshot(), "本機副本");
              if (opened) { setLocalSwitchConfirmation(false); setShowLocalFileLocation(true); }
            }}>另開本機副本</button>
          </div>
        </div>
      </Modal> : null}
      {showCollaboration ? (
        <DriveSharingModal
          boardName={board.name}
          sharing={driveSharing}
          legacyLink={legacyCollaborationLinkRef.current}
          onConnectDrive={connectDriveForSharing}
          onAuthorizeIncomingDriveFile={authorizeIncomingDriveFile}
          onSaveToDrive={saveCurrentBoardForSharing}
          onRefresh={() => { if (!sharingCurrentBoardRef.current && initialDriveShareRef.current?.fileId && !["ready", "linked"].includes(driveSharing.status)) { directShareAttemptRef.current = null; void openIncomingDirectly(); } else void refreshDriveSharing({ fileId: driveSharing.fileId, resourceKey: driveSharing.resourceKey }); }}
          onCopyLink={copyDriveSharingLink}
          onSetGeneralAccess={setDriveSharingGeneralAccess}
          onInviteMember={inviteDriveSharingMember}
          onSetMemberRole={setDriveSharingMemberRole}
          onRemoveMember={removeDriveSharingMember}
          onClose={closeDriveSharing}
        />
      ) : null}
      {showAgent ? <Modal title="AI 連線" description="連接此分頁的目前工作檔。" onClose={closeAgent}>
        <div className="drive-save-confirmation">
          {agentStatus === "connected" ? <><p>已連接本機 AI。它可以讀取目前工作檔的物件名稱、位置與文字內容。</p><p>{agentAutoEdit ? "本次連線可自動修改畫布；可使用復原，或中斷連線停止。" : "每次修改都需經你確認。"}</p><div className="drive-save-confirmation-actions"><button className="secondary-button" type="button" onClick={disconnectAgent}>中斷連線</button><button className="primary-button" type="button" onClick={() => setShowAgent(false)}>完成</button></div></> : <>
            <p>請先啟動 Infinite Studio 本機 Agent，從 Codex 或 Claude 取得連線資訊並貼在這裡。只連接你信任的 Agent。連線後可讀取物件名稱、位置與文字內容。</p>
            <p><a href="https://github.com/perrtang/infinite-studio/blob/main/mcp/README.md" target="_blank" rel="noreferrer">安裝與連線說明</a></p>
            <label className="agent-pairing-field">本機連線資訊<input type="text" autoComplete="off" spellCheck={false} value={agentAddress} onChange={(event) => setAgentAddress(event.target.value)} placeholder="ws://127.0.0.1:…" /></label>
            <label className="agent-auto-edit"><input type="checkbox" checked={agentAutoEdit} disabled={agentStatus === "connecting"} onChange={(event) => setAgentAutoEdit(event.target.checked)} /> <span>允許 AI 在本次連線自動修改畫布</span></label>
            <p>預設允許本次連線直接新增及修改物件；取消勾選後，每次修改會先徵求確認。可使用復原；中斷連線或切換工作檔時權限結束。自動儲存依工作檔設定運作；分享權限不變。</p>
            {agentError ? <p role="alert">{agentError}</p> : null}
            <div className="drive-save-confirmation-actions"><button className="secondary-button" type="button" onClick={closeAgent}>取消</button><button className="primary-button" type="button" disabled={!agentAddress.trim() || agentStatus === "connecting"} onClick={connectAgent}>{agentStatus === "connecting" ? "正在連線…" : "連線"}</button></div>
          </>}
        </div>
      </Modal> : null}
      {agentRequest ? <Modal title={agentRequest.action === "create" ? "AI 請求新增物件" : "AI 請求修改物件"} description="確認後會修改目前畫布，可以使用復原。" onClose={() => finishAgentRequest(false)}>
        <div className="drive-save-confirmation"><p>物件：<span data-l10n-ignore>{agentRequest.name}</span></p><dl className="agent-request-preview">{Object.entries(agentRequest.patch).map(([key, value]) => <div key={key}><dt>{AGENT_FIELD_LABELS[key] || key}</dt><dd data-l10n-ignore={key === "text" || key === "name" || undefined}>{["type", "shapeKind", "textAlign", "textVerticalAlign", "visible", "locked"].includes(key) ? AGENT_VALUE_LABELS[String(value)] || String(value) : String(value)}</dd></div>)}</dl><div className="drive-save-confirmation-actions"><button className="secondary-button" type="button" onClick={() => finishAgentRequest(false)}>拒絕</button><button className="primary-button" type="button" onClick={() => finishAgentRequest(true)}>套用修改</button></div></div>
      </Modal> : null}
      {showEditPermissionRequest && cloudReadOnly ? <DriveEditPermissionModal sharing={driveSharing} onClose={() => setShowEditPermissionRequest(false)} /> : null}
      {preparedDownloads.length ? (
        <ExportDownloadModal
          downloads={preparedDownloads}
          canPickDirectory={canUseDirectoryPicker}
          isExporting={isExporting}
          onExportDirectory={exportPreparedToDirectory}
          onClose={closePreparedDownloads}
        />
      ) : null}

      <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={onMediaInput} />
      <input ref={textDocumentInputRef} className="sr-only" type="file" accept=".txt,.md,.markdown,.csv,.docx,.doc,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTextDocument(file, canvasCenterWorld()); event.target.value = ""; }} />
      <input ref={videoInputRef} className="sr-only" type="file" accept="video/*" multiple onChange={onMediaInput} />
      <input ref={svgInputRef} className="sr-only" type="file" accept=".svg,image/svg+xml" multiple onChange={onSvgInput} />
      <input ref={boardInputRef} className="sr-only" type="file" accept=".studio,.moodboard,.json,application/json" onChange={(event) => { const [file] = event.target.files || []; if (file) importLocalBoardFile(file); event.target.value = ""; }} />
      <input ref={themeInputRef} className="sr-only" type="file" accept=".moodtheme,.json,application/json" onChange={(event) => { const [file] = event.target.files || []; if (file) importInterfaceThemeFile(file); event.target.value = ""; }} />
      <input ref={objectColorSetsInputRef} className="sr-only" type="file" accept=".moodcolors,.json,application/json" onChange={(event) => { const [file] = event.target.files || []; if (file) importObjectColorSetsFile(file); event.target.value = ""; }} />
    </main>
  );
}

function PublicSharedViewer({ incoming, preview = false, onProtectedEdit = null }) {
  const { locale } = useInterfaceLocale();
  const viewerRef = useRef(null);
  useLayoutEffect(() => {
    applyLocalizedDocumentMetadata(locale);
    return localizeInterfaceDom(viewerRef.current, locale);
  }, [locale]);
  const [state, setState] = useState({ status: "loading", html: "", name: "" });
  const [viewerSignedIn, setViewerSignedIn] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    observeMoodboardSession((session) => {
      if (active) setViewerSignedIn(session.status === "signed-in" && isMoodboardIdentityEligible(session.user));
    }).then((stop) => { if (active) unsubscribe = stop; else stop(); }).catch(() => {
      if (active) setViewerSignedIn(false);
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", html: "", name: "" });
    (async () => {
      try {
        const { createPortableHtml } = await loadPortableRuntime();
        let data;
        if (preview) {
          data = { name: "分享的工作檔（模擬資料）", objects: [{ id: "preview-text", type: "text", text: "無須登入即可檢視", pivotX: 140, pivotY: 100, width: 420, height: 100, fontSize: 30, color: "#ffffff", visible: true }] };
        } else {
          const { readPublicSharedBoard } = await import("./drive-public.js");
          const result = await readPublicSharedBoard({ ...incoming, apiKey: import.meta.env.VITE_GOOGLE_DRIVE_PICKER_API_KEY, signal: controller.signal });
          data = parseBoardFile(result.content, result.name);
        }
        const board = ensureBoard(data);
        if (!controller.signal.aborted) setState({ status: "ready", html: createPortableHtml(board, { shared: true, locale }), name: board.name });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", message: error?.message || "目前無法開啟這份工作檔。" });
      }
    })();
    return () => controller.abort();
  }, [incoming?.fileId, incoming?.resourceKey, preview, retryCount, locale]);
  const openEditor = () => {
    if (preview) return;
    if (onProtectedEdit) { onProtectedEdit(state.status !== "error"); return; }
    const url = new URL(window.location.href);
    url.searchParams.set("sharedEdit", "1");
    if (state.status !== "error") url.searchParams.set("requestEdit", "1");
    window.location.assign(url.href);
  };
  return <main ref={viewerRef} className="public-share-viewer">
    <header>
      <div className="public-share-brand" aria-label="Infinite Studio"><StudioBrandMark /></div>
      <strong className="public-share-title" title={state.name || "分享的工作檔"} data-l10n-ignore={state.name ? true : undefined}>{state.name || "分享的工作檔"}</strong>
      <div className="public-share-actions"><span><span>僅檢視</span>{preview ? <span> · 模擬資料</span> : null}</span><button className="primary-button" type="button" onClick={openEditor}>{viewerSignedIn ? "開啟編輯" : state.status === "error" ? "登入以開啟" : "登入後編輯"}</button></div>
    </header>
    {state.status === "ready" ? <iframe title="工作檔檢視畫面" sandbox="allow-scripts" srcDoc={state.html} /> : <div className="public-share-message" role="status"><strong>{state.status === "loading" ? "正在開啟分享內容…" : "無法免登入開啟"}</strong>{state.status === "error" ? <><p>{state.message}</p><button className="secondary-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>重新嘗試</button></> : null}{state.status === "error" && googleDriveFileAccessUrl(incoming || {}) ? <p><a href={googleDriveFileAccessUrl(incoming)} target="_blank" rel="noreferrer">在 Google Drive 檢查或申請存取權</a></p> : null}</div>}
  </main>;
}

function DriveSharingPreview({ initialMode }) {
  const [mode, setMode] = useState(initialMode);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [closed, setClosed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const fileId = "preview_shared_file_123456";
  const owner = mode.startsWith("owner");
  const denied = mode === "denied";
  const pickerError = mode === "picker-error";
  const sharing = {
    ...EMPTY_DRIVE_SHARING,
    status: denied ? "shared-file-denied" : pickerError ? "needs-picker-access" : "ready",
    fileId,
    fileName: "團隊研究工作檔（模擬資料）",
    shareUrl: createGoogleDriveMoodboardUrl({ fileId }),
    webViewLink: googleDriveFileAccessUrl({ fileId }),
    role: owner ? "owner" : "viewer",
    canEdit: owner,
    canShare: owner,
    permissionsVisible: owner,
    generalAccess: { enabled: mode === "owner-link" || mode === "owner-editor-link" || linkEnabled, role: mode === "owner-editor-link" ? "editor" : "viewer" },
    members: owner ? [{ id: "preview_owner", name: "檔案擁有者", emailAddress: "owner@example.com", appRole: "owner" }] : [],
    message: denied ? "無法讀取這份檔案。請先到 Google Drive 確認檔案與登入帳號；需要時向擁有者申請存取權。"
      : pickerError ? "Google 檔案選擇器等待逾時；沒有開啟任何內容。" : "介面預覽：未讀取或修改任何真實檔案。",
  };
  const previewAction = () => { setFeedback("這是介面預覽，沒有連結 Google Drive、寄出邀請或修改權限。"); return false; };
  return (
    <div className="sharing-preview">
      <style>{`.sharing-preview .modal-backdrop{bottom:76px}.sharing-preview .modal{max-height:calc(100dvh - 116px)}.sharing-preview-controls{position:fixed;inset:auto 0 0;z-index:101;min-height:76px;padding:8px 16px;background:var(--surface-strong);display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px}.sharing-preview-controls label{display:flex;gap:8px;align-items:center}.sharing-preview-controls select{min-height:44px;max-width:100%;font:inherit;color:var(--text);background:var(--control-bg)}.sharing-preview-controls p{margin:0;flex:1;min-width:160px}@media(max-width:600px){.sharing-preview .modal-backdrop{bottom:116px}.sharing-preview .modal{max-height:calc(100dvh - 156px)}.sharing-preview-controls{min-height:116px}}`}</style>
      {!closed && mode === "edit-request" ? <DriveEditPermissionModal sharing={sharing} onClose={() => setClosed(true)} /> : !closed ? <DriveSharingModal
        boardName={sharing.fileName}
        sharing={sharing}
        onConnectDrive={previewAction}
        onAuthorizeIncomingDriveFile={previewAction}
        onSaveToDrive={previewAction}
        onRefresh={previewAction}
        onCopyLink={previewAction}
        onInviteMember={previewAction}
        onSetMemberRole={previewAction}
        onRemoveMember={previewAction}
        onSetGeneralAccess={async enabled => { setLinkEnabled(enabled); setMode(enabled ? "owner-link" : "owner-restricted"); setFeedback("預覽已切換；未修改 Google Drive 權限。"); return true; }}
        onClose={() => setClosed(true)}
      /> : null}
      <div className="sharing-preview-controls">
        <label>預覽狀態<select aria-label="分享預覽狀態" value={mode} onChange={event => { setMode(event.target.value); setLinkEnabled(false); setClosed(false); setFeedback(""); }}>
          <option value="owner-restricted">擁有者：受限連結</option>
          <option value="owner-link">擁有者：連結可檢視</option>
          <option value="owner-editor-link">擁有者：連結可編輯</option>
          <option value="viewer">其他帳號：僅檢視</option>
          <option value="edit-request">其他帳號：申請編輯</option>
          <option value="denied">其他帳號：無存取權</option>
          <option value="picker-error">Google 選檔錯誤</option>
        </select></label>
        <p role="status">{feedback || "僅本機介面預覽：使用模擬資料，不連結 Drive，也不變更任何帳號權限。"}</p>
        {closed ? <button className="secondary-button" onClick={() => setClosed(false)}>重新開啟預覽</button> : null}
      </div>
    </div>
  );
}

function ProtectedShareGate({ token }) {
  const { locale } = useInterfaceLocale();
  const t = (value) => translateInterfaceText(value, locale);
  const [password, setPassword] = useState("");
  const [share, setShare] = useState(null);
  const [editing, setEditing] = useState(() => new URL(window.location.href).searchParams.get("sharedEdit") === "1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (share && editing) return <App initialProtectedShare={share} />;
  if (share) return <PublicSharedViewer incoming={share} onProtectedEdit={(requestEdit) => {
    const url = new URL(window.location.href);
    url.searchParams.set("sharedEdit", "1");
    if (requestEdit) url.searchParams.set("requestEdit", "1");
    else url.searchParams.delete("requestEdit");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setEditing(true);
  }} />;
  return <main className="protected-share-page"><form className="protected-share-form" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try { setShare(await unlockProtectedShare(token, password)); setPassword(""); }
    catch (error) { setMessage(t(error.message || "分享連結或密碼不正確。")); }
    finally { setBusy(false); }
  }}>
    <Lock size={24} /><h1>{t("輸入分享密碼")}</h1>
    <p>{t("請向分享者取得密碼。開啟後仍需符合 Google Drive 的存取權限。")}</p>
    {new URL(window.location.href).searchParams.has("oobCode") ? <p>{t("請先輸入分享密碼，再繼續完成電子郵件登入。")}</p> : null}
    <label htmlFor="share-password">{t("密碼")}</label><input id="share-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" maxLength={128} autoFocus />
    {message ? <p role="alert">{message}</p> : null}
    <button className="primary-button" type="submit" disabled={busy || !password}>{t(busy ? "正在開啟…" : "開啟分享連結")}</button>
  </form></main>;
}

const rootElement = document.getElementById("root");
const moodboardRoot = rootElement.__moodboardRoot || createRoot(rootElement);
rootElement.__moodboardRoot = moodboardRoot;
const sharingPreviewMode = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("sharingPreview") : null;
const currentUrl = new URL(window.location.href);
const publicPreview = import.meta.env.DEV && currentUrl.searchParams.has("publicPreview");
const incomingPublicShare = parseGoogleDriveMoodboardLink(currentUrl.href);
const protectedShareToken = currentUrl.searchParams.get("lockedShare");
moodboardRoot.render(publicPreview ? <PublicSharedViewer preview /> : sharingPreviewMode ? <DriveSharingPreview initialMode={sharingPreviewMode} /> : protectedShareToken !== null ? <ProtectedShareGate token={protectedShareToken} /> : incomingPublicShare && currentUrl.searchParams.get("sharedEdit") !== "1" ? <PublicSharedViewer incoming={incomingPublicShare} /> : <App />);
