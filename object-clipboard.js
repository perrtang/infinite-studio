// A plain-text envelope works across browser tabs and the two Studio domains.
const PREFIX = 'INFINITE-STUDIO-OBJECTS-V1\n';

export function serializeObjectClipboard(value) {
  return PREFIX + JSON.stringify({ objects: value.objects, groups: value.groups });
}

export function parseObjectClipboard(text, normalizeBoard) {
  if (typeof text !== 'string' || !text.startsWith(PREFIX)) return null;
  try {
    const value = JSON.parse(text.slice(PREFIX.length));
    if (!Array.isArray(value.objects) || !value.objects.length || !Array.isArray(value.groups)) return null;
    const board = normalizeBoard({ objects: value.objects, groups: value.groups });
    if (board.objects.length !== value.objects.length) return null;
    return { objects: board.objects, groups: board.groups };
  } catch {
    return null;
  }
}
