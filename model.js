export const BOARD_SCHEMA_VERSION = 15;

export const ANCHORS = {
  tl: { x: 0, y: 0, label: "左上" },
  tc: { x: 0.5, y: 0, label: "上中" },
  tr: { x: 1, y: 0, label: "右上" },
  ml: { x: 0, y: 0.5, label: "左中" },
  mc: { x: 0.5, y: 0.5, label: "中心" },
  mr: { x: 1, y: 0.5, label: "右中" },
  bl: { x: 0, y: 1, label: "左下" },
  bc: { x: 0.5, y: 1, label: "下中" },
  br: { x: 1, y: 1, label: "右下" },
};

export const RESIZE_HANDLES = {
  nw: { x: 0, y: 0, label: "左上" },
  n: { x: 0.5, y: 0, label: "上方" },
  ne: { x: 1, y: 0, label: "右上" },
  e: { x: 1, y: 0.5, label: "右側" },
  se: { x: 1, y: 1, label: "右下" },
  s: { x: 0.5, y: 1, label: "下方" },
  sw: { x: 0, y: 1, label: "左下" },
  w: { x: 0, y: 0.5, label: "左側" },
};

export const RESIZE_HANDLE_OPPOSITES = {
  nw: "br",
  n: "bc",
  ne: "bl",
  e: "ml",
  se: "tl",
  s: "tc",
  sw: "tr",
  w: "mr",
};

export const SHAPE_KINDS = ["rectangle", "triangle", "polygon", "star"];
export const SHAPE_SIDE_LIMITS = Object.freeze({ minimum: 3, maximum: 24 });
export const STAR_POINT_LIMITS = Object.freeze({ minimum: 3, maximum: 24 });
export const STAR_INNER_RATIO_LIMITS = Object.freeze({ minimum: 0.15, maximum: 0.85 });
export const PAPER_PRESETS = Object.freeze({
  fit: { label: "符合內容", width: null, height: null },
  a3: { label: "A3", width: 1123, height: 1587 },
  a4: { label: "A4", width: 794, height: 1123 },
  a5: { label: "A5", width: 559, height: 794 },
  b5: { label: "B5", width: 665, height: 945 },
  letter: { label: "Letter", width: 816, height: 1056 },
  custom: { label: "自訂", width: null, height: null },
});
export const ANNOTATION_POSITIONS = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
export const DEFAULT_TEXT_FONT = '"Inter", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"];
export const TEXT_LAST_ALIGNMENTS = ["left", "center", "right"];
export const TEXT_VERTICAL_ALIGNMENTS = ["top", "middle", "bottom"];

export const MARKER_SYMBOLS = ["heart", "star", "sparkle", "diamond", "circle", "flag"];
export const MARKER_COLORS = ["white", "cyan", "pink", "amber", "green", "violet", "red"];
export const ROTATION_SNAP_DELTAS = [-180, -120, -90, -60, -45, -30, 0, 30, 45, 60, 90, 120, 180];

export function createId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createBoard(overrides = {}) {
  const now = new Date().toISOString();
  return {
    format: "infinite-moodboard",
    schemaVersion: BOARD_SCHEMA_VERSION,
    id: createId("board"),
    name: "未命名 Infinite Studio",
    createdAt: now,
    updatedAt: now,
    revision: 0,
    objects: [],
    groups: [],
    guides: [],
    guideGroups: [],
    guidesLocked: false,
    rulerOrigin: { x: 0, y: 0 },
    captures: [],
    lastComposition: null,
    view: { x: 0, y: 0, zoom: 1 },
    ...overrides,
  };
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function minimumObjectDimension(objectOrType) {
  const type = typeof objectOrType === "string" ? objectOrType : objectOrType?.type;
  if (["image", "video"].includes(type)) return 1;
  if (["text", "shape", "artboard"].includes(type)) return 24;
  const mime = typeof objectOrType === "object" && typeof objectOrType?.mime === "string" ? objectOrType.mime : "";
  return mime.startsWith("image/") || mime.startsWith("video/") ? 1 : 24;
}

export function initialMediaDimensions(naturalWidth, naturalHeight, { isVideo = false } = {}) {
  const sourceWidth = Math.max(1, Math.round(finiteNumber(naturalWidth, 320)));
  const sourceHeight = Math.max(1, Math.round(finiteNumber(naturalHeight, 240)));
  if (!isVideo) return { width: sourceWidth, height: sourceHeight };

  const scale = Math.min(1, 420 / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(48, Math.round(sourceWidth * scale)),
    height: Math.max(48, Math.round(sourceHeight * scale)),
  };
}

function clampNumber(value, fallback, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
}

function normalizeGuide(guide, index) {
  return {
    id: typeof guide?.id === "string" && guide.id ? guide.id : `guide-${index + 1}`,
    axis: guide?.axis === "x" ? "x" : "y",
    position: clampNumber(guide?.position, 0, -10000000, 10000000),
    locked: Boolean(guide?.locked),
    groupId: typeof guide?.groupId === "string" && guide.groupId ? guide.groupId : null,
  };
}

function normalizeGuideGroup(group, index, validGuideIds) {
  const now = new Date().toISOString();
  const memberIds = [...new Set((Array.isArray(group?.memberIds) ? group.memberIds : [])
    .filter((id) => typeof id === "string" && validGuideIds.has(id)))];
  return {
    id: typeof group?.id === "string" && group.id ? group.id : createId("guide-group"),
    name: typeof group?.name === "string" && group.name.trim()
      ? group.name.trim()
      : `導引線群組 ${String(index + 1).padStart(2, "0")}`,
    memberIds,
    createdAt: typeof group?.createdAt === "string" ? group.createdAt : now,
    updatedAt: typeof group?.updatedAt === "string" ? group.updatedAt : now,
  };
}

function normalizeGuideStructure(rawGuides, rawGuideGroups) {
  const guides = (Array.isArray(rawGuides) ? rawGuides : []).map(normalizeGuide);
  const validGuideIds = new Set(guides.map((guide) => guide.id));
  const claimedGuideIds = new Set();
  const guideGroups = (Array.isArray(rawGuideGroups) ? rawGuideGroups : [])
    .map((group, index) => normalizeGuideGroup(group, index, validGuideIds))
    .map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((id) => {
        if (claimedGuideIds.has(id)) return false;
        claimedGuideIds.add(id);
        return true;
      }),
    }))
    .filter((group) => group.memberIds.length >= 2);
  const membership = new Map();
  guideGroups.forEach((group) => group.memberIds.forEach((id) => membership.set(id, group.id)));
  return {
    guides: guides.map((guide) => ({
      ...guide,
      groupId: membership.get(guide.id) || null,
    })),
    guideGroups,
  };
}

export function createGuideGroup(memberIds, overrides = {}) {
  const now = overrides.createdAt || new Date().toISOString();
  return {
    id: overrides.id || createId("guide-group"),
    name: overrides.name || "新導引線群組",
    memberIds: [...new Set((memberIds || []).filter((id) => typeof id === "string" && id))],
    createdAt: now,
    updatedAt: overrides.updatedAt || now,
  };
}

function stableSourceId(src, mime, fallbackId) {
  if (!src) return `source-${fallbackId}`;
  let hash = 2166136261;
  const value = `${mime}:${src}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `source-${(hash >>> 0).toString(36)}`;
}

function normalizeObject(object, index) {
  const now = new Date().toISOString();
  const id = typeof object?.id === "string" && object.id ? object.id : createId("object");
  const mime = typeof object?.mime === "string" ? object.mime : "image/png";
  const inferredType = ["text", "shape", "artboard"].includes(object?.type)
    ? object.type
    : (mime.startsWith("video/") ? "video" : "image");
  const typeLabel = inferredType === "text" ? "文字" : inferredType === "shape" ? "形狀" : inferredType === "artboard" ? "紙張" : inferredType === "video" ? "影片" : "圖片";
  const fallbackName = `${typeLabel} ${String(index + 1).padStart(2, "0")}`;
  const minimumDimension = minimumObjectDimension(inferredType);
  const width = Math.max(minimumDimension, finiteNumber(object?.width, 240));
  const height = Math.max(minimumDimension, finiteNumber(object?.height, 180));
  const fontSize = Math.max(6, finiteNumber(object?.fontSize, 32));
  const text = typeof object?.text === "string" ? object.text : "輸入文字";
  const textFlowId = inferredType === "text" && typeof object?.textFlowId === "string" && object.textFlowId.trim()
    ? object.textFlowId.trim()
    : null;
  const sourceId = ["image", "video"].includes(inferredType)
    ? (typeof object?.sourceId === "string" && object.sourceId.trim()
      ? object.sourceId.trim()
      : stableSourceId(typeof object?.src === "string" ? object.src : "", mime, id))
    : null;
  return {
    id,
    sourceId,
    type: inferredType,
    name: typeof object?.name === "string" && object.name.trim() ? object.name.trim() : fallbackName,
    layerName:
      typeof object?.layerName === "string" && object.layerName.trim()
        ? object.layerName.trim()
        : fallbackName,
    src: typeof object?.src === "string" ? object.src : "",
    mime,
    originalFilename:
      typeof object?.originalFilename === "string" ? object.originalFilename : `${fallbackName}.png`,
    pivotX: finiteNumber(object?.pivotX, 0),
    pivotY: finiteNumber(object?.pivotY, 0),
    width,
    height,
    originalWidth: Math.max(minimumDimension, finiteNumber(object?.originalWidth, width)),
    originalHeight: Math.max(minimumDimension, finiteNumber(object?.originalHeight, height)),
    aspectLocked: object?.aspectLocked !== false,
    rotation: finiteNumber(object?.rotation, 0),
    tiltX: clampNumber(object?.tiltX, 0, -60, 60),
    tiltY: clampNumber(object?.tiltY, 0, -60, 60),
    depth: clampNumber(object?.depth, 0, -240, 240),
    perspective: clampNumber(object?.perspective, 1000, 400, 3000),
    videoControlsVisible: object?.videoControlsVisible !== false,
    anchor: ANCHORS[object?.anchor] ? object.anchor : "mc",
    text,
    textFlowId,
    textFlowOrder: textFlowId ? Math.max(0, Math.floor(finiteNumber(object?.textFlowOrder, 0))) : 0,
    flowText: textFlowId && typeof object?.flowText === "string" ? object.flowText : text,
    textFlowOverflow: textFlowId && object?.textFlowOverflow === true,
    fontFamily: typeof object?.fontFamily === "string" && object.fontFamily.trim()
      ? object.fontFamily
      : DEFAULT_TEXT_FONT,
    fontWeight: typeof object?.fontWeight === "string" || typeof object?.fontWeight === "number"
      ? String(object.fontWeight)
      : "600",
    fontSize,
    originalFontSize: Math.max(6, finiteNumber(object?.originalFontSize, fontSize)),
    color: typeof object?.color === "string" && object.color ? object.color : "#edf7fb",
    textAlign: TEXT_ALIGNMENTS.includes(object?.textAlign) ? object.textAlign : "left",
    textAlignLast: TEXT_LAST_ALIGNMENTS.includes(object?.textAlignLast) ? object.textAlignLast : "left",
    textVerticalAlign: TEXT_VERTICAL_ALIGNMENTS.includes(object?.textVerticalAlign) ? object.textVerticalAlign : "top",
    shapeKind: SHAPE_KINDS.includes(object?.shapeKind) ? object.shapeKind : "rectangle",
    shapeSides: Math.round(clampNumber(object?.shapeSides, 6, SHAPE_SIDE_LIMITS.minimum, SHAPE_SIDE_LIMITS.maximum)),
    starPoints: Math.round(clampNumber(object?.starPoints, 5, STAR_POINT_LIMITS.minimum, STAR_POINT_LIMITS.maximum)),
    starInnerRatio: clampNumber(object?.starInnerRatio, 0.42, STAR_INNER_RATIO_LIMITS.minimum, STAR_INNER_RATIO_LIMITS.maximum),
    fill: typeof object?.fill === "string" && object.fill
      ? object.fill
      : inferredType === "artboard" ? "#fffdf7" : "#58e6ff",
    paperPreset: Object.hasOwn(PAPER_PRESETS, object?.paperPreset) ? object.paperPreset : inferredType === "artboard" ? "fit" : null,
    paperOrientation: object?.paperOrientation === "landscape" ? "landscape" : "portrait",
    paperPadding: clampNumber(object?.paperPadding, 40, 0, 400),
    groupId: typeof object?.groupId === "string" && object.groupId ? object.groupId : null,
    artboardId: typeof object?.artboardId === "string" && object.artboardId ? object.artboardId : null,
    annotationKind: ["title", "description"].includes(object?.annotationKind) ? object.annotationKind : null,
    annotationPosition: ANNOTATION_POSITIONS.includes(object?.annotationPosition) ? object.annotationPosition : null,
    annotationTargetIds: Array.isArray(object?.annotationTargetIds)
      ? [...new Set(object.annotationTargetIds.filter((value) => typeof value === "string" && value))]
      : [],
    markers: Array.isArray(object?.markers)
      ? object.markers.filter(
          (marker) =>
            MARKER_SYMBOLS.includes(marker?.symbol) && MARKER_COLORS.includes(marker?.color),
        ).map((marker) => ({ symbol: marker.symbol, color: marker.color }))
      : [],
    visible: object?.visible !== false,
    locked: object?.locked === true,
    createdAt: typeof object?.createdAt === "string" ? object.createdAt : now,
    updatedAt: typeof object?.updatedAt === "string" ? object.updatedAt : now,
  };
}

export function createObjectDuplicate(object, options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  return {
    ...object,
    id: options.id || createId("object"),
    name: `${object.name} 複本`,
    layerName: `${object.layerName} 複本`,
    pivotX: object.pivotX + finiteNumber(options.offset, 28),
    pivotY: object.pivotY + finiteNumber(options.offset, 28),
    groupId: options.groupId === undefined ? object.groupId || null : options.groupId,
    artboardId: null,
    annotationTargetIds: Array.isArray(object.annotationTargetIds) ? [...object.annotationTargetIds] : [],
    markers: Array.isArray(object.markers)
      ? object.markers.map((marker) => ({ symbol: marker.symbol, color: marker.color }))
      : [],
    ...(object.type === "text" ? {
      textFlowId: null,
      textFlowOrder: 0,
      flowText: object.text,
      textFlowOverflow: false,
    } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createSourceInstance(object, point = { x: 0, y: 0 }, options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  const baseName = String(object?.originalFilename || object?.name || "素材").replace(/\.[^.]+$/, "") || "素材";
  const width = Math.max(1, finiteNumber(object?.originalWidth, object?.width || 1));
  const height = Math.max(1, finiteNumber(object?.originalHeight, object?.height || 1));
  return {
    ...createObjectDuplicate(object, {
      id: options.id,
      offset: 0,
      groupId: null,
      timestamp,
    }),
    name: `${baseName} 實例`,
    layerName: `${baseName} 實例`,
    pivotX: finiteNumber(point?.x, 0),
    pivotY: finiteNumber(point?.y, 0),
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    aspectLocked: true,
    rotation: 0,
    tiltX: 0,
    tiltY: 0,
    depth: 0,
    perspective: 1000,
    videoControlsVisible: true,
    anchor: "mc",
    groupId: null,
    artboardId: null,
    annotationTargetIds: [],
    markers: [],
    visible: true,
    locked: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeGroup(group, index, validObjectIds) {
  const now = new Date().toISOString();
  const memberIds = [...new Set((Array.isArray(group?.memberIds) ? group.memberIds : [])
    .filter((id) => typeof id === "string" && validObjectIds.has(id)))];
  return {
    id: typeof group?.id === "string" && group.id ? group.id : createId("group"),
    name: typeof group?.name === "string" && group.name.trim() ? group.name.trim() : `群組 ${String(index + 1).padStart(2, "0")}`,
    memberIds,
    aspectLocked: group?.aspectLocked !== false,
    createdAt: typeof group?.createdAt === "string" ? group.createdAt : now,
    updatedAt: typeof group?.updatedAt === "string" ? group.updatedAt : now,
  };
}

export function createGroup(memberIds, overrides = {}) {
  const now = overrides.createdAt || new Date().toISOString();
  const ids = [...new Set((memberIds || []).filter((id) => typeof id === "string" && id))];
  return {
    id: overrides.id || createId("group"),
    name: overrides.name || "新群組",
    memberIds: ids,
    aspectLocked: overrides.aspectLocked !== false,
    createdAt: now,
    updatedAt: overrides.updatedAt || now,
  };
}

export function createArtboardFromObjects(objects, options = {}) {
  const bounds = selectionWorldBounds(objects || []);
  if (!bounds) return null;
  const padding = clampNumber(options.padding, 40, 0, 400);
  const now = options.createdAt || new Date().toISOString();
  const width = Math.max(24, bounds.width + padding * 2);
  const height = Math.max(24, bounds.height + padding * 2);
  const name = options.name || "內容紙張";
  return normalizeObject({
    id: options.id || createId("object"),
    type: "artboard",
    name,
    layerName: name,
    src: "",
    mime: "application/x-infinite-moodboard-artboard",
    originalFilename: `${name}.svg`,
    pivotX: bounds.left + bounds.width / 2,
    pivotY: bounds.top + bounds.height / 2,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    aspectLocked: false,
    rotation: 0,
    anchor: "mc",
    fill: options.fill || "#fffdf7",
    paperPreset: "fit",
    paperOrientation: width >= height ? "landscape" : "portrait",
    paperPadding: padding,
    visible: true,
    locked: false,
    createdAt: now,
    updatedAt: now,
  }, 0);
}

export function resizeArtboardToPreset(object, presetKey, orientation = "portrait") {
  if (object?.type !== "artboard" || !Object.hasOwn(PAPER_PRESETS, presetKey)) return object;
  const preset = PAPER_PRESETS[presetKey];
  if (!preset.width || !preset.height) {
    return { ...object, paperPreset: presetKey, paperOrientation: orientation };
  }
  const landscape = orientation === "landscape";
  const width = landscape ? preset.height : preset.width;
  const height = landscape ? preset.width : preset.height;
  return {
    ...object,
    width,
    height,
    originalWidth: width,
    originalHeight: height,
    paperPreset: presetKey,
    paperOrientation: landscape ? "landscape" : "portrait",
  };
}

export function resizeObjectToDimensions(object, nextWidth, nextHeight) {
  if (!object || typeof object !== "object") return object;
  const minimumDimension = minimumObjectDimension(object);
  const width = Math.max(minimumDimension, finiteNumber(nextWidth, object.width));
  const height = Math.max(minimumDimension, finiteNumber(nextHeight, object.height));
  const originalAnchor = ANCHORS[object.anchor] ? object.anchor : "mc";
  const centered = originalAnchor === "mc" ? { ...object, anchor: "mc" } : movePivotPreservingPlacement(object, "mc");
  const resized = {
    ...centered,
    width,
    height,
    updatedAt: new Date().toISOString(),
  };
  return originalAnchor === "mc" ? resized : movePivotPreservingPlacement(resized, originalAnchor);
}

export function shapePolygonPoints(object = {}) {
  if (object.shapeKind === "triangle") {
    return [[0.5, 0.02], [0.98, 0.98], [0.02, 0.98]];
  }

  if (object.shapeKind === "polygon") {
    const sides = Math.round(clampNumber(object.shapeSides, 6, SHAPE_SIDE_LIMITS.minimum, SHAPE_SIDE_LIMITS.maximum));
    const startAngle = -Math.PI / 2 - (sides % 2 === 0 ? Math.PI / sides : 0);
    return Array.from({ length: sides }, (_, index) => {
      const angle = startAngle + (Math.PI * 2 * index) / sides;
      return [0.5 + Math.cos(angle) * 0.49, 0.5 + Math.sin(angle) * 0.49];
    });
  }

  if (object.shapeKind === "star") {
    const points = Math.round(clampNumber(object.starPoints, 5, STAR_POINT_LIMITS.minimum, STAR_POINT_LIMITS.maximum));
    const innerRatio = clampNumber(object.starInnerRatio, 0.42, STAR_INNER_RATIO_LIMITS.minimum, STAR_INNER_RATIO_LIMITS.maximum);
    return Array.from({ length: points * 2 }, (_, index) => {
      const radius = index % 2 === 0 ? 0.49 : 0.49 * innerRatio;
      const angle = -Math.PI / 2 + (Math.PI * index) / points;
      return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius];
    });
  }

  return null;
}

function formatShapeCoordinate(value) {
  return String(Number((value * 100).toFixed(3)));
}

export function shapeClipPath(object) {
  const points = shapePolygonPoints(object);
  if (!points) return "none";
  return `polygon(${points.map(([x, y]) => `${formatShapeCoordinate(x)}% ${formatShapeCoordinate(y)}%`).join(", ")})`;
}

export function arrangeObjectsInGrid(objects, options = {}) {
  if (!Array.isArray(objects) || !objects.length) return [];
  const columns = Math.max(1, Math.min(objects.length, Math.floor(finiteNumber(options.columns, Math.ceil(Math.sqrt(objects.length))))));
  const gapX = Math.max(0, finiteNumber(options.gapX, 24));
  const gapY = Math.max(0, finiteNumber(options.gapY, 24));
  const cellWidth = Math.max(...objects.map((object) => Math.max(minimumObjectDimension(object), finiteNumber(object.width, 24))));
  const cellHeight = Math.max(...objects.map((object) => Math.max(minimumObjectDimension(object), finiteNumber(object.height, 24))));
  const currentBounds = selectionWorldBounds(objects);
  const startX = finiteNumber(options.startX, currentBounds?.left || 0);
  const startY = finiteNumber(options.startY, currentBounds?.top || 0);
  return objects.map((object, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const anchor = ANCHORS[object.anchor] || ANCHORS.mc;
    const minimumDimension = minimumObjectDimension(object);
    const width = Math.max(minimumDimension, finiteNumber(object.width, 24));
    const height = Math.max(minimumDimension, finiteNumber(object.height, 24));
    const left = startX + column * (cellWidth + gapX) + (cellWidth - width) / 2;
    const top = startY + row * (cellHeight + gapY) + (cellHeight - height) / 2;
    return {
      ...object,
      pivotX: left + anchor.x * width,
      pivotY: top + anchor.y * height,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function selectionIdsForObject(board, objectId, options = {}) {
  const object = board?.objects?.find((item) => item.id === objectId);
  if (!object) return [];
  if (options.penetrate) return [objectId];
  if (object.groupId) {
    const group = board?.groups?.find((item) => item.id === object.groupId);
    if (group?.memberIds?.length) return group.memberIds.filter((id) => board.objects.some((item) => item.id === id));
  }
  return [objectId];
}

export function selectionIdsForGuide(board, guideId, options = {}) {
  if (board?.guidesLocked) return [];
  const guide = board?.guides?.find((item) => item.id === guideId);
  if (!guide || guide.locked) return [];
  if (options.penetrate || !guide.groupId) return [guideId];
  const group = board?.guideGroups?.find((item) => item.id === guide.groupId);
  if (!group?.memberIds?.length) return [guideId];
  return group.memberIds.filter((id) => board.guides.some((item) => item.id === id && !item.locked));
}

export function selectionAspectLocked(board, objectIds = []) {
  const ids = [...new Set(objectIds)].filter((id) => typeof id === "string" && id);
  if (!ids.length) return false;
  const exactGroup = (board?.groups || []).find((group) => (
    group.memberIds.length === ids.length
    && group.memberIds.every((id) => ids.includes(id))
  ));
  if (exactGroup) return exactGroup.aspectLocked !== false;
  const selected = (board?.objects || []).filter((object) => ids.includes(object.id));
  return selected.length === ids.length && selected.every((object) => object.aspectLocked !== false);
}

export function compactBoardStructure(board) {
  const objects = Array.isArray(board?.objects) ? board.objects : [];
  const validIds = new Set(objects.map((object) => object.id));
  const groups = (Array.isArray(board?.groups) ? board.groups : [])
    .map((group, index) => normalizeGroup(group, index, validIds))
    .filter((group) => group.memberIds.length >= 2);
  const groupIds = new Set(groups.map((group) => group.id));
  const { guides, guideGroups } = normalizeGuideStructure(board?.guides, board?.guideGroups);
  return {
    ...board,
    groups,
    guideGroups,
    guides,
    objects: objects.map((object) => ({
      ...object,
      groupId: groupIds.has(object.groupId) ? object.groupId : null,
      artboardId: null,
      annotationTargetIds: Array.isArray(object.annotationTargetIds)
        ? object.annotationTargetIds.filter((id) => validIds.has(id))
        : [],
    })),
  };
}

export function sourceAssetsFromObjects(objects = []) {
  const sources = new Map();
  objects.forEach((object) => {
    if (!["image", "video"].includes(object?.type) || !object.src) return;
    const sourceId = object.sourceId || stableSourceId(object.src, object.mime || "", object.id || "legacy");
    const existing = sources.get(sourceId);
    if (existing) {
      existing.instanceIds.push(object.id);
      return;
    }
    sources.set(sourceId, {
      sourceId,
      representative: object,
      instanceIds: [object.id],
    });
  });
  return [...sources.values()];
}

function normalizeCapture(capture, index) {
  const now = new Date().toISOString();
  const viewportWidth = Math.max(1, finiteNumber(capture?.viewport?.width, 1280));
  const viewportHeight = Math.max(1, finiteNumber(capture?.viewport?.height, 720));
  const suppliedName = typeof capture?.name === "string" ? capture.name.trim() : "";
  const normalizedName = suppliedName.replace(/^畫面\s+(\d+)$/, "構圖 $1");
  return {
    id: typeof capture?.id === "string" && capture.id ? capture.id : createId("capture"),
    name: normalizedName || `構圖 ${String(index + 1).padStart(2, "0")}`,
    createdAt: typeof capture?.createdAt === "string" ? capture.createdAt : now,
    updatedAt: typeof capture?.updatedAt === "string" ? capture.updatedAt : now,
    view: {
      x: finiteNumber(capture?.view?.x, 0),
      y: finiteNumber(capture?.view?.y, 0),
      zoom: Math.min(4, Math.max(0.08, finiteNumber(capture?.view?.zoom, 1))),
    },
    viewport: { width: viewportWidth, height: viewportHeight },
    objects: Array.isArray(capture?.objects)
      ? capture.objects
          .filter((object) => typeof object?.id === "string" && object.id)
          .map((object) => ({
            id: object.id,
            pivotX: finiteNumber(object.pivotX, 0),
            pivotY: finiteNumber(object.pivotY, 0),
            width: Math.max(1, finiteNumber(object.width, 240)),
            height: Math.max(1, finiteNumber(object.height, 180)),
            rotation: finiteNumber(object.rotation, 0),
            tiltX: clampNumber(object.tiltX, 0, -60, 60),
            tiltY: clampNumber(object.tiltY, 0, -60, 60),
            depth: clampNumber(object.depth, 0, -240, 240),
            perspective: clampNumber(object.perspective, 1000, 400, 3000),
            videoControlsVisible: object.videoControlsVisible !== false,
            anchor: ANCHORS[object.anchor] ? object.anchor : "mc",
            ...(Number.isFinite(Number(object.fontSize))
              ? { fontSize: Math.max(6, Number(object.fontSize)) }
              : {}),
            visible: object.visible !== false,
          }))
      : [],
  };
}

export function parseBoardFile(text, filename = "") {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("這不是有效的 Infinite Studio 工作檔。"); }
  if (/\.studio$/i.test(filename)) {
    const legacyStudio = parsed?.format == null && Number.isInteger(parsed?.schemaVersion) && parsed.schemaVersion > 0
      && typeof parsed.id === "string" && parsed.id.length > 0 && Array.isArray(parsed.objects);
    if (parsed?.format !== "infinite-moodboard" && !legacyStudio) {
      throw new Error("這不是 Infinite Studio 工作檔；其他軟體的 .studio 格式不相容。");
    }
  }
  return ensureBoard(parsed);
}

export function ensureBoard(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.objects)) {
    throw new Error("這不是有效的 Infinite Studio 檔案。");
  }

  if (Number(value.schemaVersion || 1) > BOARD_SCHEMA_VERSION) {
    throw new Error("這份檔案來自較新的版本，請先更新應用程式。");
  }

  const base = createBoard();
  const objects = value.objects
    .map(normalizeObject)
    .filter((object) => ["text", "shape", "artboard"].includes(object.type) || object.src);
  const validObjectIds = new Set(objects.map((object) => object.id));
  const groups = (Array.isArray(value.groups) ? value.groups : [])
    .map((group, index) => normalizeGroup(group, index, validObjectIds))
    .filter((group) => group.memberIds.length >= 2);
  const groupIds = new Set(groups.map((group) => group.id));
  const { guides, guideGroups } = normalizeGuideStructure(value.guides, value.guideGroups);
  return {
    ...base,
    ...value,
    format: "infinite-moodboard",
    schemaVersion: BOARD_SCHEMA_VERSION,
    id: typeof value.id === "string" && value.id ? value.id : base.id,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : base.name,
    revision: Math.max(0, finiteNumber(value.revision, 0)),
    view: {
      x: finiteNumber(value.view?.x, 0),
      y: finiteNumber(value.view?.y, 0),
      zoom: Math.min(4, Math.max(0.08, finiteNumber(value.view?.zoom, 1))),
    },
    objects: objects.map((object) => ({
      ...object,
      groupId: groupIds.has(object.groupId) ? object.groupId : null,
      artboardId: null,
      annotationTargetIds: object.annotationTargetIds.filter((id) => validObjectIds.has(id)),
    })),
    groups,
    guides,
    guideGroups,
    guidesLocked: Boolean(value.guidesLocked),
    rulerOrigin: {
      x: finiteNumber(value.rulerOrigin?.x, 0),
      y: finiteNumber(value.rulerOrigin?.y, 0),
    },
    captures: Array.isArray(value.captures) ? value.captures.map(normalizeCapture) : [],
    lastComposition: value.lastComposition && typeof value.lastComposition === "object"
      ? normalizeCapture({ ...value.lastComposition, name: "切換前的構圖" }, -1)
      : null,
  };
}

export function createViewCapture(board, view, viewport, overrides = {}) {
  const now = new Date().toISOString();
  const captures = Array.isArray(board?.captures) ? board.captures : [];
  const index = Math.max(
    captures.length,
    ...captures.map((capture) => Number(capture?.name?.match(/^(?:畫面|構圖|构图|Composition)\s+(\d+)$/i)?.[1] || 0)),
  );
  return normalizeCapture(
    {
      id: overrides.id || createId("capture"),
      name: overrides.name || `構圖 ${String(index + 1).padStart(2, "0")}`,
      createdAt: overrides.createdAt || now,
      updatedAt: now,
      view,
      viewport,
      objects: (board?.objects || []).map((object) => ({
        id: object.id,
        pivotX: object.pivotX,
        pivotY: object.pivotY,
        width: object.width,
        height: object.height,
        rotation: object.rotation,
        tiltX: object.tiltX,
        tiltY: object.tiltY,
        depth: object.depth,
        perspective: object.perspective,
        videoControlsVisible: object.videoControlsVisible,
        anchor: object.anchor,
        fontSize: object.fontSize,
        visible: object.visible,
      })),
    },
    index,
  );
}

function convexPolygonOverlapsRect(points, rect) {
  const rectangle = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    ...points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      return { x: -(next.y - point.y), y: next.x - point.x };
    }),
  ];

  return axes.every((axis) => {
    const length = Math.hypot(axis.x, axis.y);
    if (length < 1e-9) return true;
    const normalized = { x: axis.x / length, y: axis.y / length };
    const polygonProjection = points.map((point) => point.x * normalized.x + point.y * normalized.y);
    const rectangleProjection = rectangle.map((point) => point.x * normalized.x + point.y * normalized.y);
    const overlap = Math.min(Math.max(...polygonProjection), Math.max(...rectangleProjection))
      - Math.max(Math.min(...polygonProjection), Math.min(...rectangleProjection));
    return overlap > 1e-7;
  });
}

function capturedObjectAffectsViewport(composition, object) {
  if (object?.visible === false) return false;

  const viewX = Number(composition?.view?.x);
  const viewY = Number(composition?.view?.y);
  const zoom = Number(composition?.view?.zoom);
  const viewportWidth = Number(composition?.viewport?.width);
  const viewportHeight = Number(composition?.viewport?.height);
  const pivotX = Number(object?.pivotX);
  const pivotY = Number(object?.pivotY);
  const width = Number(object?.width);
  const height = Number(object?.height);
  const hasViewportGeometry = [viewX, viewY, zoom, viewportWidth, viewportHeight].every(Number.isFinite)
    && zoom > 0
    && viewportWidth > 0
    && viewportHeight > 0;
  const hasObjectGeometry = [pivotX, pivotY, width, height].every(Number.isFinite)
    && width > 0
    && height > 0;

  // Older work files may not have enough geometry to prove that deletion is harmless.
  if (!hasViewportGeometry || !hasObjectGeometry) return true;

  const viewportWorldRect = {
    left: -viewX / zoom,
    right: (viewportWidth - viewX) / zoom,
    top: -viewY / zoom,
    bottom: (viewportHeight - viewY) / zoom,
  };
  const corners = objectWorldCorners({
    ...object,
    pivotX,
    pivotY,
    width,
    height,
    rotation: finiteNumber(object?.rotation, 0),
    tiltX: clampNumber(object?.tiltX, 0, -60, 60),
    tiltY: clampNumber(object?.tiltY, 0, -60, 60),
    depth: clampNumber(object?.depth, 0, -240, 240),
    perspective: clampNumber(object?.perspective, 1000, 400, 3000),
    anchor: ANCHORS[object?.anchor] ? object.anchor : "mc",
  });

  // Merely touching a viewport edge does not leave a visible gap after deletion.
  return convexPolygonOverlapsRect(corners, viewportWorldRect);
}

export function findCompositionsAffectedByObjectDeletion(board, objectIds) {
  const ids = new Set((objectIds || []).filter((id) => typeof id === "string" && id));
  if (!ids.size) return [];

  const compositions = [
    ...(Array.isArray(board?.captures) ? board.captures : []),
    ...(board?.lastComposition ? [board.lastComposition] : []),
  ];
  const seen = new Set();

  return compositions.filter((composition) => {
    const identity = composition?.id || composition;
    if (seen.has(identity)) return false;
    const affectsComposition = Array.isArray(composition?.objects)
      && composition.objects.some((object) => ids.has(object?.id) && capturedObjectAffectsViewport(composition, object));
    if (affectsComposition) seen.add(identity);
    return affectsComposition;
  });
}

export function restoreViewCapture(board, capture) {
  const capturedStates = new Map((capture?.objects || []).map((object) => [object.id, object]));
  const currentObjects = new Map((board?.objects || []).map((object) => [object.id, object]));
  const now = new Date().toISOString();
  const restoredObjects = (capture?.objects || []).flatMap((state) => {
    const current = currentObjects.get(state.id);
    if (!current) return [];
    const minimumDimension = minimumObjectDimension(current);
    return [
      {
        ...current,
        pivotX: finiteNumber(state.pivotX, current.pivotX),
        pivotY: finiteNumber(state.pivotY, current.pivotY),
        width: Math.max(minimumDimension, finiteNumber(state.width, current.width)),
        height: Math.max(minimumDimension, finiteNumber(state.height, current.height)),
        rotation: finiteNumber(state.rotation, current.rotation),
        tiltX: clampNumber(state.tiltX, current.tiltX, -60, 60),
        tiltY: clampNumber(state.tiltY, current.tiltY, -60, 60),
        depth: clampNumber(state.depth, current.depth, -240, 240),
        perspective: clampNumber(state.perspective, current.perspective, 400, 3000),
        videoControlsVisible: state.videoControlsVisible !== false,
        anchor: ANCHORS[state.anchor] ? state.anchor : current.anchor,
        fontSize: Math.max(6, finiteNumber(state.fontSize, current.fontSize)),
        visible: state.visible !== false,
        updatedAt: now,
      },
    ];
  });
  const uncapturedObjects = (board?.objects || []).filter((object) => !capturedStates.has(object.id));
  return { ...board, objects: [...restoredObjects, ...uncapturedObjects] };
}

export function rotateVector(x, y, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  };
}

export function movePivotPreservingPlacement(object, nextAnchorKey) {
  const previousAnchor = ANCHORS[object.anchor] || ANCHORS.mc;
  const nextAnchor = ANCHORS[nextAnchorKey] || ANCHORS.mc;
  const localDelta = {
    x: (nextAnchor.x - previousAnchor.x) * object.width,
    y: (nextAnchor.y - previousAnchor.y) * object.height,
  };
  const worldDelta = rotateVector(localDelta.x, localDelta.y, object.rotation);

  return {
    ...object,
    anchor: nextAnchorKey,
    pivotX: object.pivotX + worldDelta.x,
    pivotY: object.pivotY + worldDelta.y,
    updatedAt: new Date().toISOString(),
  };
}

export function objectLocalPointToWorld(object, point) {
  const anchor = ANCHORS[object.anchor] || ANCHORS.mc;
  const center = { x: object.width / 2, y: object.height / 2 };
  const tiltX = (finiteNumber(object.tiltX, 0) * Math.PI) / 180;
  const tiltY = (finiteNumber(object.tiltY, 0) * Math.PI) / 180;
  const cosineX = Math.cos(tiltX);
  const sineX = Math.sin(tiltX);
  const cosineY = Math.cos(tiltY);
  const sineY = Math.sin(tiltY);
  const perspective = clampNumber(object.perspective, 1000, 400, 3000);
  const depth = clampNumber(object.depth, 0, -240, 240);
  const centeredX = point.x - center.x;
  const centeredY = point.y - center.y;
  // Match CSS: perspective() translateZ() rotateX() rotateY().
  const rotatedX = centeredX * cosineY;
  const afterYDepth = -centeredX * sineY;
  const rotatedY = centeredY * cosineX - afterYDepth * sineX;
  const projectedDepth = centeredY * sineX + afterYDepth * cosineX + depth;
  const projection = perspective / Math.max(perspective * 0.08, perspective - projectedDepth);
  const projected = {
    x: center.x + rotatedX * projection,
    y: center.y + rotatedY * projection,
  };
  const local = rotateVector(
    projected.x - anchor.x * object.width,
    projected.y - anchor.y * object.height,
    object.rotation,
  );
  return { x: object.pivotX + local.x, y: object.pivotY + local.y };
}

export function objectWorldCorners(object) {
  return [
    { x: 0, y: 0 },
    { x: object.width, y: 0 },
    { x: object.width, y: object.height },
    { x: 0, y: object.height },
  ].map((point) => objectLocalPointToWorld(object, point));
}

export function objectWorldBounds(object) {
  const corners = objectWorldCorners(object);
  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function objectsVisuallyOnArtboard(objects = [], artboardId) {
  const artboardIndex = objects.findIndex((object) => object.id === artboardId && object.type === "artboard");
  if (artboardIndex < 0) return [];
  const bounds = objectWorldBounds(objects[artboardIndex]);
  return objects.filter((object, index) => {
    if (index <= artboardIndex || object.id === artboardId || object.visible === false || object.type === "artboard") return false;
    const objectBounds = objectWorldBounds(object);
    return objectBounds.centerX >= bounds.left
      && objectBounds.centerX <= bounds.right
      && objectBounds.centerY >= bounds.top
      && objectBounds.centerY <= bounds.bottom;
  });
}

export function selectionWorldBounds(objects) {
  if (!objects?.length) return null;
  const bounds = objects.map(objectWorldBounds);
  const left = Math.min(...bounds.map((item) => item.left));
  const right = Math.max(...bounds.map((item) => item.right));
  const top = Math.min(...bounds.map((item) => item.top));
  const bottom = Math.max(...bounds.map((item) => item.bottom));
  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function selectionActionAnchorInViewport(bounds, view, viewport, gap = 10) {
  const viewportWidth = finiteNumber(viewport?.width, 0);
  const viewportHeight = finiteNumber(viewport?.height, 0);
  const zoom = finiteNumber(view?.zoom, 0);
  const left = finiteNumber(bounds?.left, Number.NaN);
  const top = finiteNumber(bounds?.top, Number.NaN);
  const width = finiteNumber(bounds?.width, Number.NaN);
  const height = finiteNumber(bounds?.height, Number.NaN);
  if (viewportWidth <= 0 || viewportHeight <= 0 || zoom <= 0) return null;
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

  const screenLeft = finiteNumber(view?.x, 0) + left * zoom;
  const screenTop = finiteNumber(view?.y, 0) + top * zoom;
  const screenRight = screenLeft + width * zoom;
  const screenBottom = screenTop + height * zoom;
  const intersectsViewport = screenRight > 0
    && screenLeft < viewportWidth
    && screenBottom > 0
    && screenTop < viewportHeight;
  if (!intersectsViewport) return null;

  return {
    x: Math.min(viewportWidth, screenRight) + finiteNumber(gap, 10),
    y: clampNumber(screenTop, 0, 0, viewportHeight),
  };
}

export function boundsAnchorPoint(bounds, anchorKey = "mc") {
  if (!bounds) return { x: 0, y: 0 };
  const anchor = ANCHORS[anchorKey] || ANCHORS.mc;
  return {
    x: bounds.left + bounds.width * anchor.x,
    y: bounds.top + bounds.height * anchor.y,
  };
}

export function resizePivotAnchor(handleKey, fromCenter = false) {
  if (fromCenter) return "mc";
  return RESIZE_HANDLE_OPPOSITES[handleKey] || "tl";
}

function resizeScales(width, height, handleKey, localDelta, options = {}) {
  const handle = RESIZE_HANDLES[handleKey] || RESIZE_HANDLES.se;
  const pivot = ANCHORS[resizePivotAnchor(handleKey, options.fromCenter)] || ANCHORS.mc;
  const startVector = {
    x: (handle.x - pivot.x) * width,
    y: (handle.y - pivot.y) * height,
  };
  const currentVector = {
    x: startVector.x + finiteNumber(localDelta?.x, 0),
    y: startVector.y + finiteNumber(localDelta?.y, 0),
  };
  const changesX = Math.abs(startVector.x) > 0.00001;
  const changesY = Math.abs(startVector.y) > 0.00001;
  let scaleX = changesX ? currentVector.x / startVector.x : 1;
  let scaleY = changesY ? currentVector.y / startVector.y : 1;

  if (options.preserveAspect !== false) {
    let uniformScale;
    if (changesX && changesY) {
      const magnitude = startVector.x ** 2 + startVector.y ** 2;
      uniformScale = magnitude > 0.00001
        ? (currentVector.x * startVector.x + currentVector.y * startVector.y) / magnitude
        : 1;
    } else {
      uniformScale = changesX ? scaleX : scaleY;
    }
    scaleX = uniformScale;
    scaleY = uniformScale;
  }

  const minimumScaleX = Math.max(0.0001, finiteNumber(options.minimumScaleX, 24 / width));
  const minimumScaleY = Math.max(0.0001, finiteNumber(options.minimumScaleY, 24 / height));
  if (options.preserveAspect !== false) {
    const minimumScale = Math.max(minimumScaleX, minimumScaleY);
    scaleX = Math.max(minimumScale, finiteNumber(scaleX, 1));
    scaleY = scaleX;
  } else {
    scaleX = changesX ? Math.max(minimumScaleX, finiteNumber(scaleX, 1)) : 1;
    scaleY = changesY ? Math.max(minimumScaleY, finiteNumber(scaleY, 1)) : 1;
  }

  return { scaleX, scaleY, pivotAnchor: resizePivotAnchor(handleKey, options.fromCenter) };
}

export function resizeObjectFromHandle(object, handleKey, startPoint, currentPoint, options = {}) {
  const rotation = finiteNumber(object?.rotation, 0);
  const worldDelta = {
    x: finiteNumber(currentPoint?.x, 0) - finiteNumber(startPoint?.x, 0),
    y: finiteNumber(currentPoint?.y, 0) - finiteNumber(startPoint?.y, 0),
  };
  const localDelta = rotateVector(worldDelta.x, worldDelta.y, -rotation);
  const minimumDimension = minimumObjectDimension(object);
  const transform = resizeScales(object.width, object.height, handleKey, localDelta, {
    ...options,
    minimumScaleX: finiteNumber(options.minimumScaleX, minimumDimension / object.width),
    minimumScaleY: finiteNumber(options.minimumScaleY, minimumDimension / object.height),
  });
  const objectAnchor = ANCHORS[object.anchor] || ANCHORS.mc;
  const fixedAnchor = ANCHORS[transform.pivotAnchor] || ANCHORS.mc;
  const originalFixedOffset = rotateVector(
    (fixedAnchor.x - objectAnchor.x) * object.width,
    (fixedAnchor.y - objectAnchor.y) * object.height,
    rotation,
  );
  const fixedWorld = {
    x: object.pivotX + originalFixedOffset.x,
    y: object.pivotY + originalFixedOffset.y,
  };
  const width = object.width * transform.scaleX;
  const height = object.height * transform.scaleY;
  const nextFixedOffset = rotateVector(
    (fixedAnchor.x - objectAnchor.x) * width,
    (fixedAnchor.y - objectAnchor.y) * height,
    rotation,
  );
  const next = {
    ...object,
    pivotX: fixedWorld.x - nextFixedOffset.x,
    pivotY: fixedWorld.y - nextFixedOffset.y,
    width,
    height,
    updatedAt: new Date().toISOString(),
  };
  if (object.type === "text" && options.scaleText !== false) {
    next.fontSize = Math.max(6, finiteNumber(object.fontSize, 32) * transform.scaleY);
  }
  return next;
}

export function resizeTextFrameToDimension(object, dimension, targetSize) {
  const axis = dimension === "height" ? "height" : "width";
  const handleKey = axis === "width" ? "e" : "s";
  const currentSize = Math.max(24, finiteNumber(object?.[axis], 24));
  const nextSize = Math.max(24, finiteNumber(targetSize, currentSize));
  const localDelta = axis === "width"
    ? { x: nextSize - currentSize, y: 0 }
    : { x: 0, y: nextSize - currentSize };
  const worldDelta = rotateVector(localDelta.x, localDelta.y, finiteNumber(object?.rotation, 0));

  return resizeObjectFromHandle(
    object,
    handleKey,
    { x: 0, y: 0 },
    worldDelta,
    { preserveAspect: false, scaleText: false },
  );
}

export function resizeTransformFromHandle(bounds, handleKey, startPoint, currentPoint, options = {}) {
  const delta = {
    x: finiteNumber(currentPoint?.x, 0) - finiteNumber(startPoint?.x, 0),
    y: finiteNumber(currentPoint?.y, 0) - finiteNumber(startPoint?.y, 0),
  };
  const transform = resizeScales(bounds.width, bounds.height, handleKey, delta, options);
  return {
    ...transform,
    pivot: boundsAnchorPoint(bounds, transform.pivotAnchor),
  };
}

export function scaleObjectsAroundPoint(objects, selectedIds, point, requestedScaleX, requestedScaleY = requestedScaleX) {
  const selected = new Set(selectedIds);
  const targets = objects.filter((object) => selected.has(object.id));
  if (!targets.length) return [...objects];
  const minimumScaleX = targets.reduce((minimum, object) => Math.max(minimum, minimumObjectDimension(object) / object.width), 0.0001);
  const minimumScaleY = targets.reduce((minimum, object) => Math.max(minimum, minimumObjectDimension(object) / object.height), 0.0001);
  const scaleX = Math.max(minimumScaleX, finiteNumber(requestedScaleX, 1));
  const scaleY = Math.max(minimumScaleY, finiteNumber(requestedScaleY, 1));
  return objects.map((object) => {
    if (!selected.has(object.id)) return object;
    const next = {
      ...object,
      pivotX: point.x + (object.pivotX - point.x) * scaleX,
      pivotY: point.y + (object.pivotY - point.y) * scaleY,
      width: object.width * scaleX,
      height: object.height * scaleY,
    };
    if (object.type === "text") next.fontSize = Math.max(6, finiteNumber(object.fontSize, 32) * scaleY);
    return next;
  });
}

export function resizeObjectsFromHandle(objects, selectedIds, bounds, handleKey, startPoint, currentPoint, options = {}) {
  const selected = new Set(selectedIds);
  const targets = objects.filter((object) => selected.has(object.id));
  if (!targets.length || !bounds) return [...objects];
  const minimumScaleX = targets.reduce((minimum, object) => Math.max(minimum, minimumObjectDimension(object) / object.width), 0.0001);
  const minimumScaleY = targets.reduce((minimum, object) => Math.max(minimum, minimumObjectDimension(object) / object.height), 0.0001);
  const transform = resizeTransformFromHandle(bounds, handleKey, startPoint, currentPoint, {
    ...options,
    minimumScaleX,
    minimumScaleY,
  });
  return scaleObjectsAroundPoint(
    objects,
    selectedIds,
    transform.pivot,
    transform.scaleX,
    transform.scaleY,
  );
}

export function rotateObjectsAroundPoint(objects, selectedIds, point, requestedDegrees) {
  const selected = new Set(selectedIds);
  const degrees = finiteNumber(requestedDegrees, 0);
  return objects.map((object) => {
    if (!selected.has(object.id)) return object;
    const offset = rotateVector(object.pivotX - point.x, object.pivotY - point.y, degrees);
    return {
      ...object,
      pivotX: point.x + offset.x,
      pivotY: point.y + offset.y,
      rotation: object.rotation + degrees,
    };
  });
}

export function alignObjectsToKey(objects, selectedIds, keyObjectId, mode) {
  const selected = new Set(selectedIds);
  const targets = objects.filter((object) => selected.has(object.id));
  const keyObject = targets.find((object) => object.id === keyObjectId) || targets[0];
  if (!keyObject || targets.length < 2) return [...objects];
  const keyBounds = objectWorldBounds(keyObject);
  const targetValue = {
    left: keyBounds.left,
    hcenter: keyBounds.centerX,
    right: keyBounds.right,
    top: keyBounds.top,
    vcenter: keyBounds.centerY,
    bottom: keyBounds.bottom,
  }[mode];
  if (!Number.isFinite(targetValue)) return [...objects];

  return objects.map((object) => {
    if (!selected.has(object.id) || object.id === keyObject.id) return object;
    const bounds = objectWorldBounds(object);
    const currentValue = {
      left: bounds.left,
      hcenter: bounds.centerX,
      right: bounds.right,
      top: bounds.top,
      vcenter: bounds.centerY,
      bottom: bounds.bottom,
    }[mode];
    const horizontal = ["left", "hcenter", "right"].includes(mode);
    return {
      ...object,
      pivotX: object.pivotX + (horizontal ? targetValue - currentValue : 0),
      pivotY: object.pivotY + (horizontal ? 0 : targetValue - currentValue),
    };
  });
}

export function distributeObjectsByGap(objects, selectedIds, keyObjectId, axis) {
  const selected = new Set(selectedIds);
  const targets = objects.filter((object) => selected.has(object.id));
  const keyObject = targets.find((object) => object.id === keyObjectId) || targets[0];
  if (!keyObject || targets.length < 3 || !["horizontal", "vertical"].includes(axis)) return [...objects];
  const horizontal = axis === "horizontal";
  const entries = targets.map((object) => ({ object, bounds: objectWorldBounds(object) }));
  entries.sort((a, b) => {
    const startDelta = horizontal ? a.bounds.left - b.bounds.left : a.bounds.top - b.bounds.top;
    return startDelta || a.object.id.localeCompare(b.object.id);
  });
  const startKey = horizontal ? "left" : "top";
  const endKey = horizontal ? "right" : "bottom";
  const sizeKey = horizontal ? "width" : "height";
  const spanStart = Math.min(...entries.map((entry) => entry.bounds[startKey]));
  const spanEnd = Math.max(...entries.map((entry) => entry.bounds[endKey]));
  const totalSize = entries.reduce((total, entry) => total + entry.bounds[sizeKey], 0);
  const gap = (spanEnd - spanStart - totalSize) / (entries.length - 1);
  const desiredStarts = new Map();
  let cursor = spanStart;
  entries.forEach((entry) => {
    desiredStarts.set(entry.object.id, cursor);
    cursor += entry.bounds[sizeKey] + gap;
  });
  const keyEntry = entries.find((entry) => entry.object.id === keyObject.id);
  const offset = keyEntry.bounds[startKey] - desiredStarts.get(keyObject.id);

  return objects.map((object) => {
    if (!selected.has(object.id)) return object;
    const entry = entries.find((item) => item.object.id === object.id);
    const delta = desiredStarts.get(object.id) + offset - entry.bounds[startKey];
    return {
      ...object,
      pivotX: object.pivotX + (horizontal ? delta : 0),
      pivotY: object.pivotY + (horizontal ? 0 : delta),
    };
  });
}

export function viewWorldRectInViewport(rect, viewport, options = {}) {
  const padding = Math.max(0, finiteNumber(options.padding, 48));
  const minZoom = Math.max(0.01, finiteNumber(options.minZoom, 0.08));
  const maxZoom = Math.max(minZoom, finiteNumber(options.maxZoom, 1.5));
  const viewportWidth = Math.max(1, finiteNumber(viewport?.width, 1));
  const viewportHeight = Math.max(1, finiteNumber(viewport?.height, 1));
  const x1 = finiteNumber(rect?.left ?? rect?.x, 0);
  const y1 = finiteNumber(rect?.top ?? rect?.y, 0);
  const x2 = finiteNumber(rect?.right, x1 + finiteNumber(rect?.width, 1));
  const y2 = finiteNumber(rect?.bottom, y1 + finiteNumber(rect?.height, 1));
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const zoom = Math.min(maxZoom, Math.max(minZoom, Math.min(availableWidth / worldWidth, availableHeight / worldHeight)));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    zoom,
    x: viewportWidth / 2 - centerX * zoom,
    y: viewportHeight / 2 - centerY * zoom,
  };
}

export function viewObjectInViewport(object, viewport, options = {}) {
  const points = objectWorldCorners(object);
  return viewWorldRectInViewport({
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  }, viewport, { padding: 72, ...options });
}

export function restoreObjectSize(object) {
  const minimumDimension = minimumObjectDimension(object);
  const restored = {
    ...object,
    width: Math.max(minimumDimension, finiteNumber(object.originalWidth, object.width)),
    height: Math.max(minimumDimension, finiteNumber(object.originalHeight, object.height)),
    updatedAt: new Date().toISOString(),
  };
  if (object.type === "text") {
    restored.fontSize = Math.max(6, finiteNumber(object.originalFontSize, object.fontSize));
  }
  return restored;
}

export function snapRotationDelta(value) {
  const normalized = ((finiteNumber(value, 0) + 180) % 360 + 360) % 360 - 180;
  return ROTATION_SNAP_DELTAS.reduce((closest, candidate) =>
    Math.abs(candidate - normalized) < Math.abs(closest - normalized) ? candidate : closest,
  ROTATION_SNAP_DELTAS[0]);
}

export function objectIntersectsWorldRect(object, rect) {
  const corners = objectWorldCorners(object);
  const bounds = {
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    bottom: Math.max(...corners.map((point) => point.y)),
  };
  return bounds.right >= rect.left && bounds.left <= rect.right && bounds.bottom >= rect.top && bounds.top <= rect.bottom;
}

export function resolveLayerSelection({
  visibleIds = [],
  currentIds = [],
  targetId = "",
  anchorId = "",
  shiftKey = false,
  toggleKey = false,
  defaultIds = [],
} = {}) {
  const visible = [...new Set(visibleIds)].filter(Boolean);
  const current = [...new Set(currentIds)].filter(Boolean);
  const target = String(targetId || "");

  if (!target) return { ids: current, anchorId: anchorId || null, keyId: current[0] || null };

  if (toggleKey) {
    const selected = current.includes(target);
    const ids = selected ? current.filter((id) => id !== target) : [...current, target];
    return { ids, anchorId: target, keyId: selected ? ids[0] || null : target };
  }

  const anchorIndex = visible.indexOf(anchorId);
  const targetIndex = visible.indexOf(target);
  if (shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return { ids: visible.slice(start, end + 1), anchorId, keyId: target };
  }

  const ids = [...new Set(defaultIds.length ? defaultIds : [target])].filter(Boolean);
  return { ids, anchorId: target, keyId: ids.includes(target) ? target : ids[0] || null };
}

export function reorderObjectsByVisualDrop(objects, movingIdOrIds, targetId, placement = "before") {
  const movingIds = new Set(
    (Array.isArray(movingIdOrIds) ? movingIdOrIds : [movingIdOrIds]).filter(Boolean),
  );
  if (!movingIds.size || movingIds.has(targetId)) return [...objects];
  const visualOrder = [...objects].reverse();
  const moving = visualOrder.filter((object) => movingIds.has(object.id));
  const remaining = visualOrder.filter((object) => !movingIds.has(object.id));
  const targetIndex = remaining.findIndex((object) => object.id === targetId);
  if (!moving.length || targetIndex < 0) return [...objects];
  const insertIndex = targetIndex + (placement === "after" ? 1 : 0);
  remaining.splice(insertIndex, 0, ...moving);
  return remaining.reverse();
}

export function moveObjectsByVisualStep(objects, movingIdOrIds, direction) {
  const movingIds = new Set(
    (Array.isArray(movingIdOrIds) ? movingIdOrIds : [movingIdOrIds]).filter(Boolean),
  );
  const visualOrder = [...objects].reverse();
  if (!movingIds.size || !visualOrder.some((object) => movingIds.has(object.id))) return [...objects];

  if (direction > 0) {
    for (let index = 1; index < visualOrder.length; index += 1) {
      if (movingIds.has(visualOrder[index].id) && !movingIds.has(visualOrder[index - 1].id)) {
        [visualOrder[index - 1], visualOrder[index]] = [visualOrder[index], visualOrder[index - 1]];
      }
    }
  } else if (direction < 0) {
    for (let index = visualOrder.length - 2; index >= 0; index -= 1) {
      if (movingIds.has(visualOrder[index].id) && !movingIds.has(visualOrder[index + 1].id)) {
        [visualOrder[index], visualOrder[index + 1]] = [visualOrder[index + 1], visualOrder[index]];
      }
    }
  }

  return visualOrder.reverse();
}

export function reorderCapturesByVisualDrop(captures, movingId, targetId, placement = "before") {
  return reorderObjectsByVisualDrop(captures, movingId, targetId, placement);
}

export function markerKey(marker) {
  return `${marker.symbol}:${marker.color}`;
}

export function upsertMarkerBySymbol(markers, marker) {
  const current = Array.isArray(markers) ? markers : [];
  const existingIndex = current.findIndex((item) => item.symbol === marker.symbol);
  const matchingCount = current.filter((item) => item.symbol === marker.symbol).length;

  if (existingIndex < 0) return [...current, { ...marker }];
  if (matchingCount === 1 && current[existingIndex].color === marker.color) return current;

  return current.flatMap((item, index) => {
    if (item.symbol !== marker.symbol) return [item];
    return index === existingIndex ? [{ ...marker }] : [];
  });
}

export function matchesFilters(object, filters) {
  const symbols = filters?.symbols || [];
  const colors = filters?.colors || [];
  const requested = [
    ...symbols.map((value) => ({ type: "symbol", value })),
    ...colors.map((value) => ({ type: "color", value })),
  ];

  if (!requested.length) return true;
  const tests = requested.map((filter) =>
    object.markers.some((marker) => marker[filter.type] === filter.value),
  );
  return filters?.mode === "all" ? tests.every(Boolean) : tests.some(Boolean);
}

export function objectsForExport(objects, selectedIds, scope) {
  const selected = new Set(selectedIds);
  if (scope === "selected") return objects.filter((object) => selected.has(object.id));
  if (scope === "unselected") return objects.filter((object) => !selected.has(object.id));
  return [...objects];
}

export function safeFilename(value, fallback = "moodboard-object") {
  const safe = String(value || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 96);
  return safe || fallback;
}

export function stampBoard(board, sourceId = "local") {
  const now = new Date().toISOString();
  return {
    ...board,
    updatedAt: now,
    revision: Number(board.revision || 0) + 1,
    lastSourceId: sourceId,
  };
}
