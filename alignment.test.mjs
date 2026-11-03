import assert from "node:assert/strict";
import test from "node:test";
import { resolveSmartAlignment, selectionSpacingMeasurements } from "./alignment.js";

function rectangle(id, left, top, width = 100, height = 100, overrides = {}) {
  return {
    id,
    type: "shape",
    visible: true,
    width,
    height,
    pivotX: left + width / 2,
    pivotY: top + height / 2,
    anchor: "mc",
    rotation: 0,
    ...overrides,
  };
}

test("Option or Alt spacing finds only the nearest projected neighbour in each direction", () => {
  const objects = [
    rectangle("selected", 0, 0),
    rectangle("left", -50, 20, 30, 40),
    rectangle("far-left", -100, 20, 30, 40),
    rectangle("right", 130, 10, 40, 60),
    rectangle("top", 20, -40, 40, 20),
    rectangle("bottom", 10, 120, 50, 30),
    rectangle("diagonal", 130, 130, 20, 20),
    rectangle("hidden", 105, 10, 20, 20, { visible: false }),
  ];
  const measurements = selectionSpacingMeasurements(objects, ["selected"]);

  assert.deepEqual(measurements.map(({ direction, distance }) => ({ direction, distance })), [
    { direction: "left", distance: 20 },
    { direction: "right", distance: 30 },
    { direction: "top", distance: 20 },
    { direction: "bottom", distance: 20 },
  ]);
  assert.deepEqual(measurements.find((item) => item.direction === "right").start, { x: 100, y: 40 });
  assert.deepEqual(measurements.find((item) => item.direction === "right").end, { x: 130, y: 40 });
});

test("spacing measurements use the complete multi-selection bounds", () => {
  const objects = [
    rectangle("selected-a", 0, 0, 40, 40),
    rectangle("selected-b", 60, 10, 40, 40),
    rectangle("right", 125, 0, 20, 50),
  ];
  const measurements = selectionSpacingMeasurements(objects, ["selected-a", "selected-b"]);
  assert.deepEqual(measurements.map(({ direction, distance }) => ({ direction, distance })), [
    { direction: "right", distance: 25 },
  ]);
});

test("smart alignment previews first, then snaps edges at a screen-based threshold", () => {
  const objects = [rectangle("moving", 0, 0), rectangle("neighbour", 110, 0)];

  const preview = resolveSmartAlignment({ objects, movingIds: ["moving"], deltaX: 0, zoom: 1 });
  assert.equal(preview.deltaX, 0);
  assert.equal(preview.guides.length, 2);
  assert.equal(preview.guides.find((guide) => guide.axis === "x").snapped, false);

  const snapped = resolveSmartAlignment({ objects, movingIds: ["moving"], deltaX: 7, zoom: 1 });
  assert.equal(snapped.deltaX, 10);
  assert.equal(snapped.guides.find((guide) => guide.axis === "x").position, 110);
  assert.equal(snapped.guides.find((guide) => guide.axis === "x").snapped, true);
});

test("smart alignment can snap both axes and keeps tolerance stable across zoom", () => {
  const objects = [rectangle("moving", 0, 0), rectangle("neighbour", 110, 110)];
  const snapped = resolveSmartAlignment({ objects, movingIds: ["moving"], deltaX: 7, deltaY: 8, zoom: 1 });
  assert.deepEqual({ deltaX: snapped.deltaX, deltaY: snapped.deltaY }, { deltaX: 10, deltaY: 10 });
  assert.deepEqual(snapped.guides.map((guide) => [guide.axis, guide.snapped]), [["x", true], ["y", true]]);

  const zoomedOut = resolveSmartAlignment({ objects, movingIds: ["moving"], deltaX: 0, deltaY: 0, zoom: 0.5 });
  assert.deepEqual({ deltaX: zoomedOut.deltaX, deltaY: zoomedOut.deltaY }, { deltaX: 10, deltaY: 10 });
});

test("alignment considers visible viewport targets and visible manual guides and can be temporarily disabled", () => {
  const objects = [rectangle("moving", 0, 0), rectangle("offscreen", 110, 600)];
  const viewport = {left:-10,top:-10,right:200,bottom:300};
  assert.equal(resolveSmartAlignment({objects,movingIds:["moving"],deltaX:7,viewport}).deltaX, 7);
  const visible = resolveSmartAlignment({objects,movingIds:["moving"],deltaX:7,viewport:{...viewport,bottom:800}});
  assert.equal(visible.deltaX, 10);
  const guide = resolveSmartAlignment({objects:[objects[0]],movingIds:["moving"],deltaX:7,viewport,manualGuides:[{id:"g",axis:"x",position:110}]});
  assert.equal(guide.deltaX, 10);
  assert.deepEqual(resolveSmartAlignment({objects,movingIds:["moving"],deltaX:7,deltaY:8,disabled:true}).guides, []);
  const otherAxis = resolveSmartAlignment({objects,movingIds:["moving"],deltaX:7,deltaY:0,alternateAxis:true,viewport:{...viewport,bottom:800}});
  assert.equal(otherAxis.deltaX, 7);
});

test("smart alignment ignores distant and explicitly excluded selected objects", () => {
  const objects = [
    rectangle("moving", 0, 0),
    rectangle("locked-selected", 110, 0, 100, 100, { locked: true }),
    rectangle("distant", 260, 0),
  ];
  const result = resolveSmartAlignment({
    objects,
    movingIds: ["moving"],
    excludedIds: ["moving", "locked-selected"],
    deltaX: 0,
    zoom: 1,
    viewport: {left:-10,top:-10,right:200,bottom:200},
  });
  assert.equal(result.deltaX, 0);
  assert.deepEqual(result.guides, []);
});
