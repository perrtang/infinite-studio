import { RULER_UNITS, normalizeRulerUnit } from "./workspace-tools.js";

const EDITABLE_SHORTCUT_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(", ");

export function isEditableShortcutTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName || "").toUpperCase();
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || target.isContentEditable) return true;
  return typeof target.closest === "function" && Boolean(target.closest(EDITABLE_SHORTCUT_SELECTOR));
}

export function isEditableShortcutEvent(event, activeElement = globalThis.document?.activeElement) {
  return isEditableShortcutTarget(event?.target) || isEditableShortcutTarget(activeElement);
}

export function objectNudgeDelta(event, unit = "px") {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null;
  const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const direction = directions[event.key];
  if (!direction) return null;
  const resolvedUnit = normalizeRulerUnit(unit);
  const step = RULER_UNITS[resolvedUnit].pixelsPerUnit * (["px", "mm"].includes(resolvedUnit) ? (event.shiftKey ? 10 : 1) : (event.shiftKey ? 1 : 0.1));
  return { x: direction[0] * step, y: direction[1] * step };
}

export function nudgeSelectedObjects(objects, selectedIds, delta) {
  const ids = new Set(selectedIds);
  return objects.map((object) => ids.has(object.id) && !object.locked && object.visible !== false
    ? { ...object, pivotX: object.pivotX + delta.x, pivotY: object.pivotY + delta.y }
    : object);
}
