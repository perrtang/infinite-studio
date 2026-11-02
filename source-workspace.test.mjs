import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sourceExportArtifact } from "./asset-export.js";

const source = await readFile(new URL("./main.jsx", import.meta.url), "utf8");

test("source workspace fully replaces the Moodboard surface with source-specific controls", () => {
  assert.match(source, /className="source-stage-back"[\s\S]*onClick=\{onExit\}/);
  assert.match(source, /sourceModeActive \? \(\s*<SourceInspector/);
  assert.match(source, /\{!sourceModeActive \? <div className="export-dock"/);
  assert.match(source, /\{!sourceModeActive \? <div\s+className=\{`world-layer/);
  assert.match(source, /onPointerDown=\{sourceModeActive \? undefined : onCanvasPointerDown\}/);
  assert.match(source, /onWheel=\{sourceModeActive \? undefined : onWheel\}/);
  assert.match(source, /onDrop=\{sourceModeActive \? onSourceModeDrop : onDrop\}/);
  assert.match(source, /disabled=\{cloudReadOnly \|\| sourceModeActive \|\| !undoRef\.current\.length\}/);
  assert.match(source, /disabled=\{cloudReadOnly \|\| sourceModeActive \|\| !redoRef\.current\.length\}/);
  assert.match(source, /disabled=\{cloudReadOnly \|\| sourceModeActive\}/);
  assert.match(source, /sourceModeActive \? "素材檢視中 · 工作檔名稱唯讀" : topbarSaveState/);
});

test("source workspace blocks hidden canvas mutation shortcuts and media paste", () => {
  assert.match(source, /if \(leftTab === "sources"\) \{[\s\S]*blockedModifier[\s\S]*blockedShift[\s\S]*blockedDirect/);
  assert.match(source, /if \(leftTab === "sources"\) \{\s*announce\("素材檢視不會新增或改動畫布物件/);
  assert.match(source, /const blockedDirect = \["Backspace", "Delete"\]\.includes\(event\.key\)/);
});

test("source originals use an isolated pan and zoom viewport", () => {
  assert.match(source, /fitSourceView/);
  assert.match(source, /zoomSourceViewAtPoint/);
  assert.match(source, /panSourceView/);
  assert.match(source, /className=\{`slide-media source-inspection-canvas/);
  assert.match(source, /onDoubleClick=\{fitActiveSource\}/);
  assert.match(source, /role="region"\s+tabIndex=\{0\}\s+aria-label="素材原圖檢視區/);
  assert.match(source, /onExit=\{\(\) => changeLeftTab\("layers"\)\}/);
  assert.doesNotMatch(source, /<SourceStage[\s\S]{0,300}view=\{view\}/);
});

test("source export returns the original bytes and filename extension", async () => {
  const artifact = await sourceExportArtifact({
    type: "image",
    mime: "image/png",
    originalFilename: "original-reference.png",
    src: "data:image/png;base64,AQIDBA==",
  });
  assert.equal(artifact.extension, "png");
  assert.equal(artifact.blob.type, "image/png");
  assert.deepEqual([...new Uint8Array(await artifact.blob.arrayBuffer())], [1, 2, 3, 4]);
});
