import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [main, styles] = await Promise.all([
  readFile(new URL("./main.jsx", import.meta.url), "utf8"),
  readFile(new URL("./styles.css", import.meta.url), "utf8"),
]);

test("text, shape, and paper colors use the same global Color Set control", () => {
  assert.equal((main.match(/<ObjectColorSetControl/g) || []).length, 4);
  assert.match(main, /label="文字色彩"[\s\S]*?colorSetsState=\{objectColorSets\}/);
  assert.match(main, /label="填滿色彩"[\s\S]*?colorSetsState=\{objectColorSets\}/);
  assert.match(main, /label="紙張色彩"[\s\S]*?colorSetsState=\{objectColorSets\}/);
  assert.match(main, /label="外框色彩"[\s\S]*?colorSetsState=\{objectColorSets\}/);
  assert.doesNotMatch(main, /<span>紙張色彩<\/span>\s*<span className="color-input-row">/);
});

test("Color Set management exposes named sets, safe import/export, and protected built-in colors", () => {
  assert.match(main, /aria-label="管理色彩組合"/);
  assert.match(main, /aria-controls=\{managerId\}/);
  assert.match(main, /onCreateSet\(name\)/);
  assert.match(main, /onRenameSet\(activeSet\.id, renameDraft\)/);
  assert.match(main, /onRemoveColor\(activeSet\.id, color\)/);
  assert.match(main, /disabled=\{activeSet\.builtin \|\| colorSetsState\.sets\.length <= 1\}/);
  assert.match(main, /serializeObjectColorSets\(objectColorSets\)/);
  assert.match(main, /mergeImportedObjectColorSets\(current, imported\)\.state/);
  assert.match(main, /file\.size > OBJECT_COLOR_SETS_FILE_SIZE_LIMIT/);
  assert.match(main, /window\.confirm\(message\)/);
});

test("Color Set controls retain clear focus and mobile touch targets", () => {
  assert.match(styles, /\.object-color-set-manager \{[\s\S]*background:[\s\S]*display: grid;/);
  assert.match(styles, /\.object-color-set-file-actions button:focus-visible/);
  assert.match(styles, /\.object-color-set-removals button \{[\s\S]*border-radius: 50%;/);
  assert.match(styles, /\.object-color-set-removals button \{[\s\S]*height: 44px;[\s\S]*width: 44px;/);
});
