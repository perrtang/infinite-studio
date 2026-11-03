import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isEditableShortcutEvent, isEditableShortcutTarget, objectNudgeDelta, nudgeSelectedObjects } from "./workspace-keyboard.js";

test("arrow keys move selected unlocked objects one or ten canvas units", () => {
  for (const [key, x, y] of [["ArrowLeft",-1,0],["ArrowRight",1,0],["ArrowUp",0,-1],["ArrowDown",0,1]]) {
    assert.deepEqual(objectNudgeDelta({ key }), { x, y });
    assert.deepEqual(objectNudgeDelta({ key, shiftKey: true }), { x: x*10, y: y*10 });
    assert.equal(objectNudgeDelta({ key, altKey: true }), null);
    assert.equal(objectNudgeDelta({ key, ctrlKey: true }), null);
  }
  const objects = [{id:"a",pivotX:2,pivotY:3},{id:"b",pivotX:10,pivotY:11},{id:"locked",pivotX:0,pivotY:0,locked:true},{id:"other",pivotX:5,pivotY:6}];
  const moved = nudgeSelectedObjects(objects,["a","b","locked"],objectNudgeDelta({key:"ArrowDown",shiftKey:true}));
  assert.deepEqual(moved.map(o=>[o.pivotX,o.pivotY]),[[2,13],[10,21],[0,0],[5,6]]);
  assert.deepEqual(objects.map(o=>[o.pivotX,o.pivotY]),[[2,3],[10,11],[0,0],[5,6]]);
  assert.ok(Math.abs(objectNudgeDelta({key:"ArrowDown"},"mm").y - 96/25.4) < 1e-9);
  assert.ok(Math.abs(objectNudgeDelta({key:"ArrowDown",shiftKey:true},"mm").y - 10*96/25.4) < 1e-9);
  for (const [unit, pixels] of [["cm",96/2.54],["in",96]]) {
    assert.ok(Math.abs(objectNudgeDelta({key:"ArrowDown"},unit).y - pixels/10) < 1e-9);
    assert.ok(Math.abs(objectNudgeDelta({key:"ArrowDown",shiftKey:true},unit).y - pixels) < 1e-9);
  }
});

test("temporary workspace shortcuts leave native and custom text editors alone", () => {
  assert.equal(isEditableShortcutTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "textarea" }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "SELECT" }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "SPAN", closest: () => ({ role: "textbox" }) }), true);
  assert.equal(isEditableShortcutTarget({ tagName: "DIV", closest: () => null }), false);
  assert.equal(isEditableShortcutEvent({ target: { tagName: "DIV", closest: () => null } }, { tagName: "INPUT" }), true);
});

test("Space temporarily pans without changing tool selection or pointer focus styling", () => {
  const source = fs.readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
  assert.match(source, /if \(event\.code === "Space"\) \{\s*if \(event\.target\?\.closest\?\.\("button, a, \[role='button'\]"\)\) return;\s*event\.preventDefault\(\);\s*if \(!event\.repeat\) setSpaceDown\(true\);\s*return;/);
  assert.match(source, /if \(event\.code === "Space"\) setSpaceDown\(false\)/);
  assert.match(source, /const blur = \(\) => \{\s*setSpaceDown\(false\)/);
  assert.match(source, /event\.currentTarget\.blur\?\.\(\)/);
  assert.match(source, /active=\{tool === "hand"\} aria-pressed=\{tool === "hand"\}/);
  assert.doesNotMatch(source, /active=\{tool === "hand" \|\| spaceDown\}/);
  assert.match(source, /className=\{`canvas-viewport[\s\S]*tool === "hand" \|\| spaceDown \? "uses-hand"/);
  assert.match(source, /\(tool === "hand" \|\| spaceDown\)[\s\S]*startCanvasPan\(event\)/);
});
