const COLOR_KEYS = ["background", "panel", "canvas", "text", "muted", "accent"];

export const THEME_STORAGE_KEY = "infinite-moodboard-interface-themes-v1";
export const ACTIVE_THEME_STORAGE_KEY = "infinite-moodboard-active-interface-theme-v1";
export const INTERFACE_MODE_STORAGE_KEY = "infinite-moodboard-interface-mode-v1";
export const INTERFACE_THEME_FILE_TYPE = "infinite-moodboard-interface-theme";
export const DEFAULT_INTERFACE_THEME_ID = "fashion-monochrome";

export const FASHION_MONOCHROME_COLORS = Object.freeze({
  light: Object.freeze({
    background: "#F4F4F4",
    panel: "#FFFFFF",
    canvas: "#F8F8F8",
    text: "#151515",
    muted: "#5F5F5F",
    accent: "#262626",
  }),
  dark: Object.freeze({
    background: "#080808",
    panel: "#121212",
    canvas: "#0D0D0D",
    text: "#F5F5F5",
    muted: "#A3A3A3",
    accent: "#E7E7E7",
  }),
});

export const BUILT_IN_THEMES = Object.freeze([
  {
    id: DEFAULT_INTERFACE_THEME_ID,
    name: "時尚黑白",
    builtin: true,
    category: "product",
    monochrome: true,
    colors: FASHION_MONOCHROME_COLORS.dark,
  },
  {
    id: "deep-cyan",
    name: "Infinite 未來青",
    builtin: true,
    category: "product",
    colors: {
      background: "#070B10",
      panel: "#091018",
      canvas: "#090E13",
      text: "#EDF7FB",
      muted: "#8AA5B3",
      accent: "#58E6FF",
    },
  },
  {
    id: "petfashion-editorial",
    name: "PETFASHION 編輯米金",
    builtin: true,
    category: "product",
    colors: {
      background: "#F7F5EF",
      panel: "#FFFEFA",
      canvas: "#F7F5EF",
      text: "#141412",
      muted: "#6F6D65",
      accent: "#D8A20B",
    },
  },
  {
    id: "true-tree-editorial",
    name: "真象樹 森林紙本",
    builtin: true,
    category: "product",
    colors: {
      background: "#FFFFFF",
      panel: "#FFFAF1",
      canvas: "#FBF8F1",
      text: "#191714",
      muted: "#756D60",
      accent: "#31502E",
    },
  },
  {
    id: "violet-night",
    name: "紫霧夜",
    builtin: true,
    category: "mood",
    colors: {
      background: "#0B0911",
      panel: "#15101E",
      canvas: "#100D18",
      text: "#F6EEFF",
      muted: "#A899B8",
      accent: "#C79BFF",
    },
  },
  {
    id: "amber-graphite",
    name: "石墨琥珀",
    builtin: true,
    category: "mood",
    colors: {
      background: "#0D0C0A",
      panel: "#191611",
      canvas: "#12110F",
      text: "#FFF7E8",
      muted: "#B0A28C",
      accent: "#F3B75F",
    },
  },
  {
    id: "forest-signal",
    name: "森林訊號",
    builtin: true,
    category: "mood",
    colors: {
      background: "#07100D",
      panel: "#0D1915",
      canvas: "#091410",
      text: "#EEFFF8",
      muted: "#8DADA0",
      accent: "#7DF0B1",
    },
  },
  {
    id: "brand-coca-cola",
    name: "可口可樂 紅白靈感",
    builtin: true,
    category: "brand",
    colors: {
      background: "#F4F1EC",
      panel: "#FFFFFF",
      canvas: "#F8F5F0",
      text: "#201A19",
      muted: "#746765",
      accent: "#F40000",
    },
  },
  {
    id: "brand-starbucks",
    name: "星巴克 咖啡綠靈感",
    builtin: true,
    category: "brand",
    colors: {
      background: "#F3F1E7",
      panel: "#FFFEF7",
      canvas: "#EDEADF",
      text: "#17342B",
      muted: "#64766E",
      accent: "#00754A",
    },
  },
  {
    id: "brand-apple",
    name: "Apple 銀灰靈感",
    builtin: true,
    category: "brand",
    colors: {
      background: "#F5F5F7",
      panel: "#FFFFFF",
      canvas: "#ECECEF",
      text: "#1D1D1F",
      muted: "#6E6E73",
      accent: "#0071E3",
    },
  },
  {
    id: "brand-netflix",
    name: "Netflix 黑紅靈感",
    builtin: true,
    category: "brand",
    colors: {
      background: "#090909",
      panel: "#141414",
      canvas: "#0E0E0E",
      text: "#F5F5F1",
      muted: "#A7A7A3",
      accent: "#E50914",
    },
  },
  {
    id: "brand-lv",
    name: "LV 棕金靈感",
    builtin: true,
    category: "brand",
    colors: {
      background: "#17120D",
      panel: "#221A12",
      canvas: "#1B1510",
      text: "#F3EBDD",
      muted: "#B7A68D",
      accent: "#B88A4A",
    },
  },
]);

export function normalizeHexColor(value, fallback = "#000000") {
  const normalized = String(value || "").trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9A-F]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map((character) => character.repeat(2)).join("")}`;
  }
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  return [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
}

function rgba(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixColors(first, second, ratio = 0.5) {
  const start = hexToRgb(first);
  const end = hexToRgb(second);
  const amount = Math.min(1, Math.max(0, Number(ratio) || 0));
  const mixed = start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function relativeLuminance(hex) {
  const [red, green, blue] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function minimumContrast(color, backgrounds) {
  return Math.min(...backgrounds.map((background) => contrastRatio(color, background)));
}

function bestContrastTarget(backgrounds) {
  const dark = "#000000";
  const light = "#FFFFFF";
  return minimumContrast(dark, backgrounds) >= minimumContrast(light, backgrounds) ? dark : light;
}

function ensureContrast(color, backgrounds, threshold, toward) {
  const normalized = normalizeHexColor(color);
  if (minimumContrast(normalized, backgrounds) >= threshold) return normalized;
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mixColors(normalized, toward, step / 100);
    if (minimumContrast(candidate, backgrounds) >= threshold) return candidate;
  }
  return normalizeHexColor(toward);
}

function cursorDataUrl({ background, text, accent, signal }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${background}" fill-opacity=".96" stroke="${text}" stroke-width="1.4"/><path d="M23.8 13A8.4 8.4 0 0 0 9.1 9.2" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round"/><path d="M9 5.8v3.6h3.6" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.2 19A8.4 8.4 0 0 0 22.9 22.8" fill="none" stroke="${text}" stroke-width="2" stroke-linecap="round"/><path d="M23 26.2v-3.6h-3.6" fill="none" stroke="${text}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="16" r="2" fill="${signal}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
}

function textFlowCursorDataUrl({ background, text, signal }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M4 2 4 24 9.7 18.5 13.5 27 17 25.4 13.1 17H21Z" fill="${background}" stroke="${text}" stroke-width="1.4" stroke-linejoin="round"/><rect x="17" y="4" width="12" height="12" rx="2" fill="${background}" stroke="${signal}"/><path d="M20 8h6M23 6v5" stroke="${signal}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 2, copy`;
}

function micro3DCursorDataUrl({ background, text, axisX, axisY, axisZ }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${background}" fill-opacity=".92" stroke="${text}" stroke-width="1.5"/><ellipse cx="16" cy="16" rx="10" ry="4" fill="none" stroke="${axisX}" stroke-width="1.5"/><ellipse cx="16" cy="16" rx="4" ry="10" fill="none" stroke="${axisY}" stroke-width="1.5"/><path d="M5.5 16a10.5 10.5 0 0 0 18 7.4" fill="none" stroke="${axisZ}" stroke-width="1.5" stroke-linecap="round"/><path d="m23.6 20.6-.2 3.1-3-.4" fill="none" stroke="${axisZ}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="16" r="2" fill="${text}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, grab`;
}

function isGrayscaleColor(color) {
  const [red, green, blue] = hexToRgb(color);
  return red === green && green === blue;
}

export function normalizeInterfaceTheme(value, fallback = BUILT_IN_THEMES[0]) {
  const source = value && typeof value === "object" ? value : {};
  const colors = source.colors && typeof source.colors === "object" ? source.colors : {};
  const normalizedColors = Object.fromEntries(COLOR_KEYS.map((key) => [
    key,
    normalizeHexColor(colors[key], fallback.colors[key]),
  ]));
  return {
    id: String(source.id || fallback.id).slice(0, 96),
    name: String(source.name || fallback.name).trim().slice(0, 40) || fallback.name,
    builtin: source.builtin === true,
    category: source.builtin === true && ["product", "brand", "mood"].includes(source.category)
      ? source.category
      : "custom",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : null,
    monochrome: source.monochrome === true || COLOR_KEYS.every((key) => isGrayscaleColor(normalizedColors[key])),
    colors: normalizedColors,
  };
}

export function interfaceThemeMode(theme) {
  const normalized = normalizeInterfaceTheme(theme);
  return relativeLuminance(normalized.colors.background) > 0.45 ? "light" : "dark";
}

export function normalizeInterfaceMode(value) {
  return ["system", "light", "dark"].includes(value) ? value : "system";
}

export function resolveInterfaceMode(preference, prefersDark = false) {
  const normalized = normalizeInterfaceMode(preference);
  return normalized === "system" ? (prefersDark ? "dark" : "light") : normalized;
}

export function loadInterfaceModePreference(storage, legacyTheme = null) {
  try {
    const stored = storage?.getItem?.(INTERFACE_MODE_STORAGE_KEY);
    if (["system", "light", "dark"].includes(stored)) return stored;
    const legacyThemeId = storage?.getItem?.(ACTIVE_THEME_STORAGE_KEY);
    if (legacyThemeId && legacyTheme) return interfaceThemeMode(legacyTheme);
  } catch {
    // Storage can be unavailable; system-follow remains the safe default.
  }
  return "system";
}

export function resolveInterfaceThemeForMode(theme, mode) {
  const normalized = normalizeInterfaceTheme(theme);
  if (normalized.id !== DEFAULT_INTERFACE_THEME_ID) return normalized;
  const resolvedMode = mode === "dark" ? "dark" : "light";
  return {
    ...normalized,
    monochrome: true,
    colors: { ...FASHION_MONOCHROME_COLORS[resolvedMode] },
  };
}

export function interfaceThemeCssVariables(theme) {
  const normalized = normalizeInterfaceTheme(theme);
  const { background, panel, canvas, text, muted, accent } = normalized.colors;
  const surfaces = [background, panel, canvas];
  const contrastTarget = bestContrastTarget(surfaces);
  const readableText = ensureContrast(text, surfaces, 4.5, contrastTarget);
  const readableMuted = ensureContrast(muted, surfaces, 4.5, readableText);
  const accentUi = ensureContrast(accent, surfaces, 3, readableText);
  const accentText = ensureContrast(accent, surfaces, 4.5, readableText);
  const accentOn = bestContrastTarget([accent]);
  const accentHoverTarget = accentOn === "#000000" ? "#FFFFFF" : "#000000";
  const accentHover = ensureContrast(mixColors(accent, accentHoverTarget, 0.12), [accentOn], 4.5, accentHoverTarget);
  const success = ensureContrast(normalized.monochrome ? "#F0F0F0" : "#3FAE72", surfaces, 4.5, readableText);
  const signal = ensureContrast(normalized.monochrome ? "#CACACA" : "#D08A27", surfaces, 4.5, readableText);
  const danger = ensureContrast(normalized.monochrome ? "#FFFFFF" : "#E2554D", surfaces, 4.5, readableText);
  const axisX = normalized.monochrome ? "#FFFFFF" : "#FF6F73";
  const axisY = normalized.monochrome ? "#C4C4C4" : "#69DF9B";
  const axisZ = normalized.monochrome ? "#8E8E8E" : "#62A8FF";
  const [accentRed, accentGreen, accentBlue] = hexToRgb(accent);
  const [mutedRed, mutedGreen, mutedBlue] = hexToRgb(readableMuted);
  const [successRed, successGreen, successBlue] = hexToRgb(success);
  const [signalRed, signalGreen, signalBlue] = hexToRgb(signal);
  const [dangerRed, dangerGreen, dangerBlue] = hexToRgb(danger);
  const isLight = interfaceThemeMode(normalized) === "light";
  return {
    "--bg": background,
    "--surface": rgba(panel, 0.96),
    "--surface-soft": rgba(panel, 0.76),
    "--surface-strong": mixColors(panel, readableText, 0.08),
    "--text": readableText,
    "--text-muted": readableMuted,
    "--text-soft": mixColors(readableMuted, readableText, 0.46),
    "--border": rgba(accentUi, 0.24),
    "--border-strong": rgba(accentUi, 0.54),
    "--accent-base": accent,
    "--accent": accentText,
    "--accent-fill": accent,
    "--accent-ui": accentUi,
    "--accent-on": accentOn,
    "--accent-hover": accentHover,
    "--accent-strong": accentText,
    "--success": success,
    "--signal": signal,
    "--danger": danger,
    "--axis-x": axisX,
    "--axis-y": axisY,
    "--axis-z": axisZ,
    "--topbar-bg": rgba(background, 0.96),
    "--panel-bg": rgba(panel, 0.98),
    "--canvas-bg": canvas,
    "--toolbar-bg": rgba(panel, 0.93),
    "--stage-bg": rgba(panel, 0.96),
    "--modal-bg": mixColors(panel, background, 0.22),
    "--control-bg": isLight ? mixColors(panel, readableText, 0.08) : rgba(background, 0.64),
    "--quiet-bg": isLight ? mixColors(panel, readableText, 0.035) : rgba(readableText, 0.025),
    "--floating-bg": isLight ? rgba(panel, 0.97) : rgba(background, 0.9),
    "--segmented-bg": isLight ? mixColors(panel, readableText, 0.06) : rgba("#000000", 0.24),
    "--accent-rgb": `${accentRed} ${accentGreen} ${accentBlue}`,
    "--muted-rgb": `${mutedRed} ${mutedGreen} ${mutedBlue}`,
    "--success-rgb": `${successRed} ${successGreen} ${successBlue}`,
    "--signal-rgb": `${signalRed} ${signalGreen} ${signalBlue}`,
    "--danger-rgb": `${dangerRed} ${dangerGreen} ${dangerBlue}`,
    "--rotation-cursor": cursorDataUrl({
      background: isLight ? panel : background,
      text: readableText,
      accent: accentUi,
      signal,
    }),
    "--text-flow-cursor": textFlowCursorDataUrl({
      background: isLight ? panel : background,
      text: readableText,
      signal,
    }),
    "--micro-3d-cursor": micro3DCursorDataUrl({
      background: isLight ? panel : background,
      text: readableText,
      axisX,
      axisY,
      axisZ,
    }),
    colorScheme: isLight ? "light" : "dark",
  };
}

export function serializeInterfaceTheme(theme) {
  const normalized = normalizeInterfaceTheme(theme);
  return JSON.stringify({
    type: INTERFACE_THEME_FILE_TYPE,
    version: 1,
    theme: {
      name: normalized.name,
      colors: normalized.colors,
    },
  }, null, 2);
}

export function parseInterfaceThemeFile(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("這不是有效的介面配色檔案。");
  }
  if (payload?.type !== INTERFACE_THEME_FILE_TYPE || payload?.version !== 1 || !payload?.theme) {
    throw new Error("這個檔案不是 Infinite Studio 介面配色。");
  }
  if (typeof payload.theme.name !== "string" || !payload.theme.name.trim()) {
    throw new Error("介面配色缺少名稱。");
  }
  if (!payload.theme.colors || COLOR_KEYS.some((key) => !/^#[0-9A-Fa-f]{6}$/.test(String(payload.theme.colors[key] || "")))) {
    throw new Error("介面配色缺少完整的六組色彩。");
  }
  const theme = normalizeInterfaceTheme({
    ...payload.theme,
    id: "imported-theme",
    builtin: false,
  });
  return theme;
}
