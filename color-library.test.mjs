import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OBJECT_COLOR_SET,
  DEFAULT_OBJECT_COLORS,
  OBJECT_COLOR_LIBRARY_STORAGE_KEY,
  OBJECT_COLOR_SETS_FILE_KIND,
  OBJECT_COLOR_SETS_STORAGE_KEY,
  activeObjectColorSet,
  addObjectColorToSet,
  createObjectColorSet,
  deleteObjectColorSet,
  loadObjectColorLibrary,
  loadObjectColorSets,
  mergeObjectColorLibrary,
  mergeImportedObjectColorSets,
  normalizeObjectColor,
  parseObjectColorSetsFile,
  parseObjectColorLibraryFile,
  removeObjectColorFromSet,
  renameObjectColorSet,
  saveObjectColorLibrary,
  saveObjectColorSets,
  selectObjectColorSet,
  serializeObjectColorSets,
  serializeObjectColorLibrary,
} from "./color-library.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("object colors normalize shorthand, casing, duplicates, and invalid values", () => {
  assert.equal(normalizeObjectColor("#abc"), "#AABBCC");
  assert.equal(normalizeObjectColor("#a1B2c3"), "#A1B2C3");
  assert.equal(normalizeObjectColor("rgb(0, 0, 0)"), null);
  assert.deepEqual(mergeObjectColorLibrary(["#fff", "#FFFFFF", "#000000", "bad"]), ["#FFFFFF", "#000000"]);
});

test("object color library persists locally while retaining the built-in palette", () => {
  const storage = memoryStorage();
  const saved = saveObjectColorLibrary(storage, ["#123456", "#FFFFFF"]);
  const loaded = loadObjectColorLibrary(storage);

  assert.equal(storage.getItem(OBJECT_COLOR_LIBRARY_STORAGE_KEY), JSON.stringify(saved));
  assert.deepEqual(loaded.slice(0, DEFAULT_OBJECT_COLORS.length), DEFAULT_OBJECT_COLORS);
  assert.equal(loaded.at(-1), "#123456");
});

test("portable object color libraries round-trip and unrelated JSON fails closed", () => {
  const colors = ["#123456", "#ABCDEF"];
  assert.deepEqual(parseObjectColorLibraryFile(serializeObjectColorLibrary(colors)), colors);
  assert.deepEqual(parseObjectColorLibraryFile(JSON.stringify(colors)), colors);
  assert.throws(
    () => parseObjectColorLibraryFile(JSON.stringify({ kind: "other-library", colors })),
    /不是 Infinite Studio/,
  );
});

test("fresh storage gets a protected built-in color set and v1 storage migrates without losing colors", () => {
  const fresh = loadObjectColorSets(memoryStorage());
  assert.equal(fresh.activeSetId, DEFAULT_OBJECT_COLOR_SET.id);
  assert.deepEqual(activeObjectColorSet(fresh).colors, DEFAULT_OBJECT_COLORS);

  const storage = memoryStorage();
  storage.setItem(OBJECT_COLOR_LIBRARY_STORAGE_KEY, JSON.stringify(["#123456"]));
  const migrated = loadObjectColorSets(storage);
  assert.equal(migrated.sets[0].id, DEFAULT_OBJECT_COLOR_SET.id);
  assert.equal(migrated.sets[0].builtin, true);
  assert.deepEqual(migrated.sets[0].colors, DEFAULT_OBJECT_COLORS);
  assert.equal(activeObjectColorSet(migrated).name, "我的色彩");
  assert.deepEqual(activeObjectColorSet(migrated).colors, ["#123456"]);
  const saved = saveObjectColorSets(storage, migrated);
  assert.deepEqual(JSON.parse(storage.getItem(OBJECT_COLOR_SETS_STORAGE_KEY)), saved);
});

test("named color sets can be selected, renamed, edited, and deleted without mutating the built-in set", () => {
  const base = loadObjectColorSets(memoryStorage());
  const created = createObjectColorSet(base, "客戶品牌", ["#123456"]);
  const customId = created.activeSetId;
  const renamed = renameObjectColorSet(created, customId, "  春夏品牌  ");
  const edited = addObjectColorToSet(renamed, customId, "#abcdef");
  const removed = removeObjectColorFromSet(edited, customId, "#123456");
  assert.equal(activeObjectColorSet(removed).name, "春夏品牌");
  assert.deepEqual(activeObjectColorSet(removed).colors, ["#ABCDEF"]);
  assert.equal(selectObjectColorSet(removed, "basic").activeSetId, "basic");
  assert.throws(() => deleteObjectColorSet(removed, "basic"), /內建色彩組合不能刪除/);
  assert.equal(deleteObjectColorSet(removed, customId).sets.length, 1);
});

test("v2 color set files round-trip while legacy files remain importable", () => {
  const state = createObjectColorSet(loadObjectColorSets(memoryStorage()), "Editorial", ["#010203", "#AABBCC"]);
  const parsed = parseObjectColorSetsFile(serializeObjectColorSets(state));
  assert.equal(parsed.sets.length, 2);
  assert.equal(activeObjectColorSet(parsed).name, "Editorial");
  assert.deepEqual(activeObjectColorSet(parseObjectColorSetsFile(JSON.stringify(["#123456"]))).colors, ["#123456"]);
  assert.deepEqual(activeObjectColorSet(parseObjectColorSetsFile(serializeObjectColorLibrary(["#654321"]))).colors, ["#654321"]);
});

test("import appends color sets without overwriting colliding names or ids", () => {
  const current = createObjectColorSet(loadObjectColorSets(memoryStorage()), "Brand", ["#111111"]);
  const imported = {
    activeSetId: current.activeSetId,
    sets: [{ id: current.activeSetId, name: "Brand", colors: ["#222222"] }],
  };
  const merged = mergeImportedObjectColorSets(current, imported);
  assert.equal(merged.addedSetCount, 1);
  assert.equal(merged.state.sets.length, 3);
  assert.notEqual(merged.state.sets[1].id, merged.state.sets[2].id);
  assert.equal(merged.state.sets[2].name, "Brand（匯入）");
  assert.deepEqual(merged.state.sets[2].colors, ["#222222"]);
});

test("stored built-in data is repaired and custom set names stay distinguishable", () => {
  const repaired = loadObjectColorSets({
    getItem: (key) => key === OBJECT_COLOR_SETS_STORAGE_KEY ? JSON.stringify({
      activeSetId: "basic",
      sets: [
        { id: "basic", name: "Changed", colors: ["#123456"], builtin: true },
        { id: "brand", name: "基本色彩", colors: ["#010203"] },
      ],
    }) : null,
  });
  assert.deepEqual(repaired.sets[0], { ...DEFAULT_OBJECT_COLOR_SET, colors: [...DEFAULT_OBJECT_COLORS] });
  assert.equal(repaired.sets[1].name, "基本色彩（2）");

  const created = createObjectColorSet(repaired, "基本色彩", [], "brand-copy");
  assert.equal(activeObjectColorSet(created).name, "基本色彩（3）");
  const renamed = renameObjectColorSet(created, created.activeSetId, "基本色彩");
  assert.equal(activeObjectColorSet(renamed).name, "基本色彩（3）");
});

test("v2 import does not duplicate the protected built-in set", () => {
  const current = loadObjectColorSets(memoryStorage());
  const imported = parseObjectColorSetsFile(serializeObjectColorSets(
    createObjectColorSet(current, "Editorial", ["#010203"], "editorial"),
  ));
  const merged = mergeImportedObjectColorSets(current, imported);
  assert.equal(merged.addedSetCount, 1);
  assert.equal(merged.state.sets.filter((set) => set.builtin).length, 1);
  assert.equal(merged.state.sets.at(-1).name, "Editorial");
});

test("color set import rejects unrelated, invalid, oversized, and over-limit payloads", () => {
  assert.throws(() => parseObjectColorSetsFile("not json"), /不是有效的 JSON/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify({ kind: "other", sets: [] })), /不是 Infinite Studio/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify({
    kind: "infinite-moodboard-object-colors",
    version: 99,
    colors: ["#123456"],
  })), /版本目前不支援/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify({
    kind: "infinite-moodboard-object-colors",
    version: 1,
  })), /缺少 colors/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify([])), /沒有可使用的色彩/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify({
    kind: "infinite-moodboard-object-colors",
    version: 1,
    colors: Array.from({ length: 49 }, () => "#123456"),
  })), /48 色上限/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify({
    kind: OBJECT_COLOR_SETS_FILE_KIND,
    version: 2,
    sets: [{ id: "bad", name: "Bad", colors: ["rgb(0,0,0)"] }],
  })), /無效的色碼/);
  assert.throws(() => parseObjectColorSetsFile(" ".repeat(128 * 1024 + 1)), /128 KB/);
  assert.throws(() => parseObjectColorSetsFile(JSON.stringify({
    kind: OBJECT_COLOR_SETS_FILE_KIND,
    version: 2,
    sets: Array.from({ length: 25 }, (_, index) => ({ id: `set-${index}`, name: `Set ${index}`, colors: [] })),
  })), /24 組上限/);
});
