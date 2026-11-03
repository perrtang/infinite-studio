import { objectWorldBounds, selectionWorldBounds } from "./model.js";

const EPSILON = 0.001;

function rangesOverlap(startA, endA, startB, endB) {
  return Math.min(endA, endB) >= Math.max(startA, startB) - EPSILON;
}

function intersectionCenter(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return (start + end) / 2;
}

function translatedBounds(bounds, deltaX, deltaY) {
  return {
    ...bounds,
    left: bounds.left + deltaX,
    right: bounds.right + deltaX,
    top: bounds.top + deltaY,
    bottom: bounds.bottom + deltaY,
    centerX: bounds.centerX + deltaX,
    centerY: bounds.centerY + deltaY,
  };
}

export function selectionSpacingMeasurements(objects = [], selectedIds = []) {
  const selected = new Set(selectedIds);
  const targets = objects.filter((object) => selected.has(object.id) && object.visible !== false);
  const bounds = selectionWorldBounds(targets);
  if (!bounds) return [];

  const candidates = objects
    .filter((object) => object.visible !== false && !selected.has(object.id))
    .map((object) => ({ object, bounds: objectWorldBounds(object) }));
  const nearest = new Map();

  const consider = (direction, candidate, distance, start, end, overlap) => {
    if (distance < -EPSILON) return;
    const current = nearest.get(direction);
    if (current && (current.distance < distance - EPSILON || (
      Math.abs(current.distance - distance) <= EPSILON && current.overlap >= overlap
    ))) return;
    nearest.set(direction, {
      direction,
      distance: Math.max(0, distance),
      start,
      end,
      overlap,
      objectId: candidate.object.id,
    });
  };

  candidates.forEach((candidate) => {
    const item = candidate.bounds;
    if (rangesOverlap(bounds.top, bounds.bottom, item.top, item.bottom)) {
      const y = intersectionCenter(bounds.top, bounds.bottom, item.top, item.bottom);
      const overlap = Math.max(0, Math.min(bounds.bottom, item.bottom) - Math.max(bounds.top, item.top));
      if (item.right <= bounds.left + EPSILON) {
        consider("left", candidate, bounds.left - item.right, { x: item.right, y }, { x: bounds.left, y }, overlap);
      }
      if (item.left >= bounds.right - EPSILON) {
        consider("right", candidate, item.left - bounds.right, { x: bounds.right, y }, { x: item.left, y }, overlap);
      }
    }
    if (rangesOverlap(bounds.left, bounds.right, item.left, item.right)) {
      const x = intersectionCenter(bounds.left, bounds.right, item.left, item.right);
      const overlap = Math.max(0, Math.min(bounds.right, item.right) - Math.max(bounds.left, item.left));
      if (item.bottom <= bounds.top + EPSILON) {
        consider("top", candidate, bounds.top - item.bottom, { x, y: item.bottom }, { x, y: bounds.top }, overlap);
      }
      if (item.top >= bounds.bottom - EPSILON) {
        consider("bottom", candidate, item.top - bounds.bottom, { x, y: bounds.bottom }, { x, y: item.top }, overlap);
      }
    }
  });

  return ["left", "right", "top", "bottom"]
    .map((direction) => nearest.get(direction))
    .filter(Boolean)
    .map(({ overlap, ...measurement }) => measurement);
}

function axisAnchors(bounds, axis) {
  return axis === "x"
    ? [
        { key: "start", value: bounds.left },
        { key: "center", value: bounds.centerX },
        { key: "end", value: bounds.right },
      ]
    : [
        { key: "start", value: bounds.top },
        { key: "center", value: bounds.centerY },
        { key: "end", value: bounds.bottom },
      ];
}

function perpendicularGap(boundsA, boundsB, axis) {
  if (axis === "x") {
    if (boundsA.bottom < boundsB.top) return boundsB.top - boundsA.bottom;
    if (boundsB.bottom < boundsA.top) return boundsA.top - boundsB.bottom;
    return 0;
  }
  if (boundsA.right < boundsB.left) return boundsB.left - boundsA.right;
  if (boundsB.right < boundsA.left) return boundsA.left - boundsB.right;
  return 0;
}

function nearestAlignment(axis, movingBounds, candidates, previewThreshold) {
  const movingAnchors = axisAnchors(movingBounds, axis);
  let best = null;
  candidates.forEach((candidate) => {
    const candidateAnchors = axisAnchors(candidate.bounds, axis);
    movingAnchors.forEach((movingAnchor) => {
      candidateAnchors.forEach((candidateAnchor) => {
        const correction = candidateAnchor.value - movingAnchor.value;
        const distance = Math.abs(correction);
        if (distance > previewThreshold + EPSILON) return;
        const sameAnchorBonus = movingAnchor.key === candidateAnchor.key ? 1 : 0;
        if (best && (
          best.distance < distance - EPSILON
          || (Math.abs(best.distance - distance) <= EPSILON && best.sameAnchorBonus >= sameAnchorBonus)
        )) return;
        best = {
          axis,
          correction,
          distance,
          sameAnchorBonus,
          position: candidateAnchor.value,
          movingAnchor: movingAnchor.key,
          candidateAnchor: candidateAnchor.key,
          candidate,
        };
      });
    });
  });
  return best;
}

export function resolveSmartAlignment({
  objects = [],
  movingIds = [],
  excludedIds = movingIds,
  deltaX = 0,
  deltaY = 0,
  zoom = 1,
  previewThresholdPx = 12,
  snapThresholdPx = 5,
  viewport = null,
  manualGuides = [],
  disabled = false,
  alternateAxis = false,
} = {}) {
  if (disabled) return { deltaX, deltaY, guides: [] };
  const moving = new Set(movingIds);
  const excluded = new Set(excludedIds);
  const movingObjects = objects.filter((object) => moving.has(object.id));
  const baseBounds = selectionWorldBounds(movingObjects);
  if (!baseBounds) return { deltaX, deltaY, guides: [] };

  const candidates = objects
    .filter((object) => object.visible !== false && !excluded.has(object.id))
    .map((object) => ({ object, bounds: objectWorldBounds(object) }))
    .filter(({bounds}) => !viewport || (bounds.right >= viewport.left && bounds.left <= viewport.right && bounds.bottom >= viewport.top && bounds.top <= viewport.bottom));

  const safeZoom = Math.max(0.01, Number(zoom) || 1);
  const previewThreshold = Math.max(0, previewThresholdPx) / safeZoom;
  const snapThreshold = Math.min(Math.max(0, snapThresholdPx), Math.max(0, previewThresholdPx)) / safeZoom;
  const proposedBounds = translatedBounds(baseBounds, deltaX, deltaY);
  const guideCandidates = (axis) => manualGuides.filter((g) => g.axis === axis && (!viewport || (axis === "x" ? g.position >= viewport.left && g.position <= viewport.right : g.position >= viewport.top && g.position <= viewport.bottom))).map((g) => ({object:{id:g.id},bounds:axis === "x" ? {left:g.position,right:g.position,centerX:g.position,top:proposedBounds.top,bottom:proposedBounds.bottom,centerY:proposedBounds.centerY} : {top:g.position,bottom:g.position,centerY:g.position,left:proposedBounds.left,right:proposedBounds.right,centerX:proposedBounds.centerX}}));
  const activeAxis = alternateAxis ? (Math.abs(deltaX) >= Math.abs(deltaY) ? "y" : "x") : null;
  const xMatch = activeAxis === "y" ? null : nearestAlignment(
    "x",
    proposedBounds,
    [...candidates, ...guideCandidates("x")],
    previewThreshold,
  );
  const yMatch = activeAxis === "x" ? null : nearestAlignment(
    "y",
    proposedBounds,
    [...candidates, ...guideCandidates("y")],
    previewThreshold,
  );
  const xSnapped = Boolean(xMatch && xMatch.distance <= snapThreshold + EPSILON);
  const ySnapped = Boolean(yMatch && yMatch.distance <= snapThreshold + EPSILON);
  const nextDeltaX = deltaX + (xSnapped ? xMatch.correction : 0);
  const nextDeltaY = deltaY + (ySnapped ? yMatch.correction : 0);
  const adjustedBounds = translatedBounds(baseBounds, nextDeltaX, nextDeltaY);
  const guides = [];

  if (xMatch) {
    guides.push({
      axis: "x",
      position: xMatch.position,
      start: Math.min(adjustedBounds.top, xMatch.candidate.bounds.top),
      end: Math.max(adjustedBounds.bottom, xMatch.candidate.bounds.bottom),
      snapped: xSnapped,
      movingAnchor: xMatch.movingAnchor,
      candidateAnchor: xMatch.candidateAnchor,
      objectId: xMatch.candidate.object.id,
    });
  }
  if (yMatch) {
    guides.push({
      axis: "y",
      position: yMatch.position,
      start: Math.min(adjustedBounds.left, yMatch.candidate.bounds.left),
      end: Math.max(adjustedBounds.right, yMatch.candidate.bounds.right),
      snapped: ySnapped,
      movingAnchor: yMatch.movingAnchor,
      candidateAnchor: yMatch.candidateAnchor,
      objectId: yMatch.candidate.object.id,
    });
  }

  return { deltaX: nextDeltaX, deltaY: nextDeltaY, guides };
}
