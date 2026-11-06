import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");

test("canvas status and export controls share one collision-free HUD row", () => {
  assert.match(main, /className=\{`canvas-bottom-hud \$\{rulersVisible && !inspectionActive \? "has-rulers" : ""\}`\}/);
  assert.match(styles, /\.canvas-bottom-hud \{[\s\S]*display: flex;[\s\S]*justify-content: space-between;[\s\S]*pointer-events: none;/);
  assert.match(styles, /\.canvas-bottom-hud\.has-rulers \{[\s\S]*--canvas-hud-inline-start: 34px;/);
  assert.match(styles, /\.export-dock \{[\s\S]*flex: 0 0 auto;[\s\S]*pointer-events: auto;/);
});

test("canvas status yields secondary details before controls can overlap", () => {
  assert.doesNotMatch(main, /className="canvas-status-save"/);
  assert.match(styles, /@container canvas-workspace \(max-width: 780px\) \{\s*\.canvas-status-save \{\s*display: none;/);
  assert.match(styles, /@container canvas-workspace \(max-width: 650px\) \{[\s\S]*\.canvas-status span:not\(\.app-version\) \{\s*display: none;/);
  assert.match(styles, /@container canvas-workspace \(max-width: 650px\) \{[\s\S]*\.export-dock \{[\s\S]*flex-direction: column;[\s\S]*left: var\(--canvas-hud-inline-start\);[\s\S]*right: 12px;[\s\S]*width: auto;/);
});

test("mobile keeps the app version separate from the bottom export dock", () => {
  assert.match(styles, /\.canvas-bottom-hud,[\s\S]*\.canvas-bottom-hud\.has-rulers \{[\s\S]*display: block;[\s\S]*top: 0;/);
  assert.match(styles, /\.canvas-status span:not\(\.app-version\) \{\s*display: none;/);
  assert.match(styles, /\.export-dock \{[\s\S]*bottom: 9px;[\s\S]*position: absolute;/);
});
