export const OBJECT_COLOR_LIBRARY_STORAGE_KEY = "infinite-moodboard-object-colors-v1";
export const OBJECT_COLOR_LIBRARY_FILE_KIND = "infinite-moodboard-object-colors";
export const OBJECT_COLOR_LIBRARY_FILE_VERSION = 1;
export const OBJECT_COLOR_LIBRARY_LIMIT = 48;

export const OBJECT_COLOR_SETS_STORAGE_KEY = "infinite-moodboard-color-sets-v2";
export const OBJECT_COLOR_SETS_FILE_KIND = "infinite-moodboard-color-sets";
export const OBJECT_COLOR_SETS_FILE_VERSION = 2;
export const OBJECT_COLOR_SET_LIMIT = 24;
export const OBJECT_COLOR_SET_NAME_LIMIT = 48;
export const OBJECT_COLOR_SETS_FILE_SIZE_LIMIT = 128 * 1024;

export const DEFAULT_OBJECT_COLORS = Object.freeze([
  "#FFFFFF",
  "#111111",
  "#737373",
  "#D9D9D9",
  "#EB5757",
  "#F2994A",
  "#F2C94C",
  "#27AE60",
  "#2F80ED",
  "#9B51E0",
]);

export const DEFAULT_OBJECT_COLOR_SET = Object.freeze({
  id: "basic",
  name: "基本色彩",
  colors: DEFAULT_OBJECT_COLORS,
  builtin: true,
});

export function normalizeObjectColor(value) {
  const color = String(value || "").trim();
  const short = color.match(/^#([0-9a-f]{3})$/i);
  if (short) return `#${[...short[1]].map((digit) => `${digit}${digit}`).join("")}`.toUpperCase();
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
  return color.toUpperCase();
}

export function mergeObjectColorLibrary(...collections) {
  const colors = [];
  const seen = new Set();
  collections.flat().forEach((value) => {
    const color = normalizeObjectColor(value);
    if (!color || seen.has(color) || colors.length >= OBJECT_COLOR_LIBRARY_LIMIT) return;
    seen.add(color);
    colors.push(color);
  });
  return colors;
}

export function normalizeObjectColorSetName(value, fallback = "未命名色彩") {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OBJECT_COLOR_SET_NAME_LIMIT);
  return normalized || fallback;
}

function normalizeSetId(value, fallback) {
  const normalized = String(value || "").trim();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(normalized) ? normalized : fallback;
}

function uniqueSetId(seed, usedIds) {
  const base = normalizeSetId(seed, "color-set");
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function uniqueSetName(value, usedNames, { fallback = "未命名色彩", imported = false } = {}) {
  const base = normalizeObjectColorSetName(value, fallback);
  if (!usedNames.has(base.toLocaleLowerCase())) {
    usedNames.add(base.toLocaleLowerCase());
    return base;
  }
  let suffix = imported ? 1 : 2;
  let candidate = "";
  do {
    const suffixLabel = imported ? `匯入${suffix > 1 ? ` ${suffix}` : ""}` : String(suffix);
    const suffixText = `（${suffixLabel}）`;
    const availableBaseLength = Math.max(1, OBJECT_COLOR_SET_NAME_LIMIT - suffixText.length);
    candidate = `${base.slice(0, availableBaseLength).trimEnd()}${suffixText}`;
    suffix += 1;
  } while (usedNames.has(candidate.toLocaleLowerCase()));
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

export function normalizeObjectColorSetsState(value) {
  const legacyColors = Array.isArray(value) ? value : Array.isArray(value?.colors) ? value.colors : null;
  if (legacyColors) {
    const defaultColors = new Set(DEFAULT_OBJECT_COLORS);
    const customColors = mergeObjectColorLibrary(legacyColors).filter((color) => !defaultColors.has(color));
    const sets = [{ ...DEFAULT_OBJECT_COLOR_SET, colors: [...DEFAULT_OBJECT_COLORS] }];
    if (customColors.length) {
      sets.push({ id: "my-colors", name: "我的色彩", colors: customColors, builtin: false });
    }
    return {
      activeSetId: customColors.length ? "my-colors" : DEFAULT_OBJECT_COLOR_SET.id,
      sets,
    };
  }

  const rawSets = Array.isArray(value?.sets)
    ? value.sets.filter((set) => String(set?.id || "").trim() !== DEFAULT_OBJECT_COLOR_SET.id).slice(0, OBJECT_COLOR_SET_LIMIT - 1)
    : [];
  const usedIds = new Set([DEFAULT_OBJECT_COLOR_SET.id]);
  const usedNames = new Set([DEFAULT_OBJECT_COLOR_SET.name.toLocaleLowerCase()]);
  const customSets = rawSets.map((set, index) => {
    const fallbackId = `color-set-${index + 1}`;
    const id = uniqueSetId(normalizeSetId(set?.id, fallbackId), usedIds);
    return {
      id,
      name: uniqueSetName(set?.name, usedNames, { fallback: `色彩組合 ${index + 1}` }),
      colors: mergeObjectColorLibrary(Array.isArray(set?.colors) ? set.colors : []),
      builtin: false,
    };
  });
  const sets = [{ ...DEFAULT_OBJECT_COLOR_SET, colors: [...DEFAULT_OBJECT_COLORS] }, ...customSets];
  const activeSetId = sets.some((set) => set.id === value?.activeSetId) ? value.activeSetId : DEFAULT_OBJECT_COLOR_SET.id;
  return { activeSetId, sets };
}

export function activeObjectColorSet(state) {
  const normalized = normalizeObjectColorSetsState(state);
  return normalized.sets.find((set) => set.id === normalized.activeSetId) || normalized.sets[0];
}

export function loadObjectColorSets(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(OBJECT_COLOR_SETS_STORAGE_KEY);
    if (stored) return normalizeObjectColorSetsState(JSON.parse(stored));
    const legacy = storage?.getItem(OBJECT_COLOR_LIBRARY_STORAGE_KEY);
    if (legacy) return normalizeObjectColorSetsState(JSON.parse(legacy));
  } catch {
    // Invalid or unavailable storage falls back to the built-in set.
  }
  return normalizeObjectColorSetsState(null);
}

export function saveObjectColorSets(storage = globalThis.localStorage, state) {
  const normalized = normalizeObjectColorSetsState(state);
  try {
    storage?.setItem(OBJECT_COLOR_SETS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Private or embedded browsing contexts may deny storage; in-memory sets remain usable.
  }
  return normalized;
}

export function selectObjectColorSet(state, setId) {
  const normalized = normalizeObjectColorSetsState(state);
  return normalized.sets.some((set) => set.id === setId) ? { ...normalized, activeSetId: setId } : normalized;
}

export function createObjectColorSet(state, name, colors = [], idSeed = `color-set-${Date.now().toString(36)}`) {
  const normalized = normalizeObjectColorSetsState(state);
  if (normalized.sets.length >= OBJECT_COLOR_SET_LIMIT) throw new Error(`最多可建立 ${OBJECT_COLOR_SET_LIMIT} 組色彩。`);
  const usedIds = new Set(normalized.sets.map((set) => set.id));
  const usedNames = new Set(normalized.sets.map((set) => set.name.toLocaleLowerCase()));
  const id = uniqueSetId(idSeed, usedIds);
  const nextSet = {
    id,
    name: uniqueSetName(name, usedNames, { fallback: `色彩組合 ${normalized.sets.length + 1}` }),
    colors: mergeObjectColorLibrary(colors),
    builtin: false,
  };
  return { activeSetId: id, sets: [...normalized.sets, nextSet] };
}

export function renameObjectColorSet(state, setId, name) {
  const normalized = normalizeObjectColorSetsState(state);
  const usedNames = new Set(normalized.sets.filter((set) => set.id !== setId).map((set) => set.name.toLocaleLowerCase()));
  const nextName = uniqueSetName(name, usedNames);
  return {
    ...normalized,
    sets: normalized.sets.map((set) => set.id === setId && !set.builtin ? { ...set, name: nextName } : set),
  };
}

export function deleteObjectColorSet(state, setId) {
  const normalized = normalizeObjectColorSetsState(state);
  const target = normalized.sets.find((set) => set.id === setId);
  if (target?.builtin) throw new Error("內建色彩組合不能刪除。");
  if (normalized.sets.length <= 1) throw new Error("至少要保留一組色彩。");
  const sets = normalized.sets.filter((set) => set.id !== setId);
  if (sets.length === normalized.sets.length) return normalized;
  return {
    activeSetId: normalized.activeSetId === setId ? sets[0].id : normalized.activeSetId,
    sets,
  };
}

export function addObjectColorToSet(state, setId, color) {
  const normalized = normalizeObjectColorSetsState(state);
  return {
    ...normalized,
    sets: normalized.sets.map((set) => set.id === setId && !set.builtin
      ? { ...set, colors: mergeObjectColorLibrary(set.colors, [color]) }
      : set),
  };
}

export function removeObjectColorFromSet(state, setId, color) {
  const normalized = normalizeObjectColorSetsState(state);
  const target = normalizeObjectColor(color);
  return {
    ...normalized,
    sets: normalized.sets.map((set) => set.id === setId && !set.builtin
      ? { ...set, colors: set.colors.filter((item) => item !== target) }
      : set),
  };
}

export function serializeObjectColorSets(state) {
  const normalized = normalizeObjectColorSetsState(state);
  return JSON.stringify({
    product: "Infinite Moodboard",
    kind: OBJECT_COLOR_SETS_FILE_KIND,
    version: OBJECT_COLOR_SETS_FILE_VERSION,
    activeSetId: normalized.activeSetId,
    sets: normalized.sets,
  }, null, 2);
}

function validateImportedSet(set, index) {
  if (!set || typeof set !== "object") throw new Error(`第 ${index + 1} 組色彩格式不正確。`);
  if (!String(set.name || "").trim()) throw new Error(`第 ${index + 1} 組色彩缺少名稱。`);
  if (String(set.name).trim().length > OBJECT_COLOR_SET_NAME_LIMIT) throw new Error(`第 ${index + 1} 組色彩名稱過長。`);
  if (!Array.isArray(set.colors)) throw new Error(`第 ${index + 1} 組色彩缺少 colors 清單。`);
  if (set.colors.length > OBJECT_COLOR_LIBRARY_LIMIT) throw new Error(`第 ${index + 1} 組色彩超過 ${OBJECT_COLOR_LIBRARY_LIMIT} 色上限。`);
  set.colors.forEach((color) => {
    if (!normalizeObjectColor(color)) throw new Error(`第 ${index + 1} 組色彩包含無效的色碼。`);
  });
}

export function parseObjectColorSetsFile(text) {
  const source = String(text || "");
  if (source.length > OBJECT_COLOR_SETS_FILE_SIZE_LIMIT) throw new Error("Color Set 檔案超過 128 KB 上限。");
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Color Set 檔案不是有效的 JSON。");
  }

  if (Array.isArray(parsed) || parsed?.kind === OBJECT_COLOR_LIBRARY_FILE_KIND || (!parsed?.kind && Array.isArray(parsed?.colors))) {
    const values = Array.isArray(parsed) ? parsed : parsed.colors;
    if (parsed?.kind === OBJECT_COLOR_LIBRARY_FILE_KIND && parsed.version != null && Number(parsed.version) !== OBJECT_COLOR_LIBRARY_FILE_VERSION) {
      throw new Error("這個舊版色彩庫版本目前不支援。");
    }
    if (!Array.isArray(values)) throw new Error("舊版色彩庫缺少 colors 清單。");
    if (!values.length) throw new Error("舊版色彩庫沒有可使用的色彩。");
    if (values.length > OBJECT_COLOR_LIBRARY_LIMIT) throw new Error(`舊版色彩庫超過 ${OBJECT_COLOR_LIBRARY_LIMIT} 色上限。`);
    values.forEach((color) => {
      if (!normalizeObjectColor(color)) throw new Error("舊版色彩庫包含無效的色碼。");
    });
    return normalizeObjectColorSetsState({
      activeSetId: "imported-colors",
      sets: [{ id: "imported-colors", name: "匯入色彩", colors: values }],
    });
  }
  if (parsed?.kind !== OBJECT_COLOR_SETS_FILE_KIND) throw new Error("這不是 Infinite Studio 的 Color Set 檔案。");
  if (Number(parsed?.version) !== OBJECT_COLOR_SETS_FILE_VERSION) throw new Error("這個 Color Set 版本目前不支援。");
  if (!Array.isArray(parsed?.sets) || !parsed.sets.length) throw new Error("Color Set 檔案缺少 sets 清單。");
  if (parsed.sets.length > OBJECT_COLOR_SET_LIMIT) throw new Error(`Color Set 檔案超過 ${OBJECT_COLOR_SET_LIMIT} 組上限。`);
  parsed.sets.forEach(validateImportedSet);
  return normalizeObjectColorSetsState(parsed);
}

export function mergeImportedObjectColorSets(state, importedState) {
  const current = normalizeObjectColorSetsState(state);
  const imported = normalizeObjectColorSetsState(importedState);
  const available = Math.max(0, OBJECT_COLOR_SET_LIMIT - current.sets.length);
  const portableSets = imported.sets.filter((set) => !set.builtin);
  const candidates = portableSets.slice(0, available);
  const usedIds = new Set(current.sets.map((set) => set.id));
  const usedNames = new Set(current.sets.map((set) => set.name.toLocaleLowerCase()));
  const additions = candidates.map((set, index) => ({
    ...set,
    id: uniqueSetId(`imported-${normalizeSetId(set.id, index + 1)}`, usedIds),
    name: uniqueSetName(set.name, usedNames, { fallback: "匯入色彩", imported: true }),
    builtin: false,
  }));
  return {
    state: { ...current, sets: [...current.sets, ...additions] },
    addedSetCount: additions.length,
    skippedSetCount: portableSets.length - additions.length,
    addedColorCount: additions.reduce((total, set) => total + set.colors.length, 0),
  };
}

// v1 compatibility helpers remain available for older integrations and files.
export function loadObjectColorLibrary(storage = globalThis.localStorage) {
  const state = loadObjectColorSets(storage);
  return mergeObjectColorLibrary(
    DEFAULT_OBJECT_COLORS,
    state.sets.filter((set) => !set.builtin).flatMap((set) => set.colors),
  );
}

export function saveObjectColorLibrary(storage = globalThis.localStorage, colors = []) {
  const normalized = mergeObjectColorLibrary(DEFAULT_OBJECT_COLORS, colors);
  try {
    storage?.setItem(OBJECT_COLOR_LIBRARY_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Keep the in-memory palette available.
  }
  return normalized;
}

export function serializeObjectColorLibrary(colors = []) {
  return JSON.stringify({
    product: "Infinite Moodboard",
    kind: OBJECT_COLOR_LIBRARY_FILE_KIND,
    version: OBJECT_COLOR_LIBRARY_FILE_VERSION,
    colors: mergeObjectColorLibrary(colors),
  }, null, 2);
}

export function parseObjectColorLibraryFile(text) {
  return activeObjectColorSet(parseObjectColorSetsFile(text)).colors;
}
