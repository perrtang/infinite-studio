import {
  ANCHORS,
  DEFAULT_TEXT_FONT,
  TEXT_ALIGNMENTS,
  TEXT_LAST_ALIGNMENTS,
  TEXT_VERTICAL_ALIGNMENTS,
  objectWorldCorners,
  shapeClipPath,
  shapePolygonPoints,
} from "./model.js";

function isVideoObject(object) {
  return object?.type === "video" || object?.mime?.startsWith("video/");
}

function isTextObject(object) {
  return object?.type === "text";
}

function isShapeObject(object) {
  return object?.type === "shape";
}

function isArtboardObject(object) {
  return object?.type === "artboard";
}

function textLayoutStyle(object) {
  const textAlign = TEXT_ALIGNMENTS.includes(object?.textAlign) ? object.textAlign : "left";
  const textAlignLast = TEXT_LAST_ALIGNMENTS.includes(object?.textAlignLast) ? object.textAlignLast : "left";
  const textVerticalAlign = TEXT_VERTICAL_ALIGNMENTS.includes(object?.textVerticalAlign) ? object.textVerticalAlign : "top";
  return {
    justifyContent: { top: "flex-start", middle: "safe center", bottom: "safe flex-end" }[textVerticalAlign],
    textAlign,
    textAlignLast: textAlign === "justify" ? textAlignLast : "auto",
  };
}

function objectDisplayText(object) {
  if (!isTextObject(object)) return "";
  if (object.textFlowId && typeof object.flowText === "string") return object.flowText;
  return typeof object.text === "string" ? object.text : "";
}

function escapeXmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function shapeSvgPoints(object) {
  const points = shapePolygonPoints(object);
  if (!points) return "";
  return points.map(([x, y]) => `${Number((x * 100).toFixed(3))},${Number((y * 100).toFixed(3))}`).join(" ");
}

function shapeSvgMarkup(object, x, y, width, height) {
  const fill = escapeXmlAttribute(object.fill || "#58e6ff");
  const points = shapeSvgPoints(object);
  const content = points
    ? `<polygon points="${points}" fill="${fill}"/>`
    : `<rect x="1" y="1" width="98" height="98" rx="2" fill="${fill}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${width / 100} ${height / 100})">${content}</g>`;
}

function objectHtmlVisualMarkup(object, sourceOverride = "") {
  if (isArtboardObject(object)) {
    return `<div style="box-sizing:border-box;width:100%;height:100%;background:${escapeXmlAttribute(object.fill || "#fffdf7")};"></div>`;
  }
  if (isTextObject(object)) {
    const layout = textLayoutStyle(object);
    return `<div style="box-sizing:border-box;display:flex;flex-direction:column;justify-content:${layout.justifyContent};text-align:${layout.textAlign};text-align-last:${layout.textAlignLast};width:100%;height:100%;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;color:${escapeXmlAttribute(object.color || "#edf7fb")};font-family:${escapeXmlAttribute(object.fontFamily || DEFAULT_TEXT_FONT)};font-size:${Math.max(6, Number(object.fontSize) || 32)}px;font-weight:${escapeXmlAttribute(object.fontWeight || "600")};line-height:${Number(object.lineHeight) || 1.2};">${escapeXmlAttribute(objectDisplayText(object))}</div>`;
  }
  if (isShapeObject(object)) {
    return `<div style="width:100%;height:100%;background:${escapeXmlAttribute(object.fill || "#58e6ff")};clip-path:${shapeClipPath(object)};"></div>`;
  }
  return `<img src="${escapeXmlAttribute(sourceOverride || object.src)}" alt="" style="display:block;width:100%;height:100%;object-fit:fill;"/>`;
}

function objectToSvgBlob(object) {
  const radians = (object.rotation * Math.PI) / 180;
  const width = Math.max(1, Math.round(object.width));
  const height = Math.max(1, Math.round(object.height));
  const tiltX = Number(object.tiltX) || 0;
  const tiltY = Number(object.tiltY) || 0;
  const depth = Number(object.depth) || 0;
  const perspective = Number(object.perspective) || 1000;
  const hasMicro3D = Math.abs(tiltX) > 0.01 || Math.abs(tiltY) > 0.01 || Math.abs(depth) > 0.01 || Math.abs(perspective - 1000) > 0.01;

  if (hasMicro3D) {
    const anchor = ANCHORS[object.anchor] || ANCHORS.mc;
    const corners = objectWorldCorners({ ...object, pivotX: 0, pivotY: 0, width, height });
    const left = Math.min(...corners.map((point) => point.x));
    const right = Math.max(...corners.map((point) => point.x));
    const top = Math.min(...corners.map((point) => point.y));
    const bottom = Math.max(...corners.map((point) => point.y));
    const outputWidth = Math.max(1, Math.ceil(right - left) + 2);
    const outputHeight = Math.max(1, Math.ceil(bottom - top) + 2);
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}"><foreignObject x="0" y="0" width="${outputWidth}" height="${outputHeight}"><div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:100%;height:100%;overflow:hidden;"><div style="position:absolute;left:${1 - left}px;top:${1 - top}px;width:0;height:0;transform-origin:0 0;transform:rotate(${Number(object.rotation) || 0}deg);"><div style="position:absolute;left:${-anchor.x * width}px;top:${-anchor.y * height}px;width:${width}px;height:${height}px;transform-origin:50% 50%;transform-style:preserve-3d;transform:perspective(${perspective}px) translateZ(${depth}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg);backface-visibility:hidden;">${objectHtmlVisualMarkup(object)}</div></div></div></foreignObject></svg>`;
    return new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  }

  const outputWidth = Math.max(1, Math.ceil(Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))));
  const outputHeight = Math.max(1, Math.ceil(Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))));
  const x = (outputWidth - width) / 2;
  const y = (outputHeight - height) / 2;
  let content;
  if (isTextObject(object)) {
    const layout = textLayoutStyle(object);
    content = `<foreignObject x="${x}" y="${y}" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;display:flex;flex-direction:column;justify-content:${layout.justifyContent};text-align:${layout.textAlign};text-align-last:${layout.textAlignLast};width:100%;height:100%;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;color:${escapeXmlAttribute(object.color || "#edf7fb")};font-family:${escapeXmlAttribute(object.fontFamily || DEFAULT_TEXT_FONT)};font-size:${Math.max(6, Number(object.fontSize) || 32)}px;font-weight:${escapeXmlAttribute(object.fontWeight || "600")};line-height:${Number(object.lineHeight) || 1.2};">${escapeXmlAttribute(objectDisplayText(object))}</div></foreignObject>`;
  } else if (isShapeObject(object)) {
    content = shapeSvgMarkup(object, x, y, width, height);
  } else if (isArtboardObject(object)) {
    content = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeXmlAttribute(object.fill || "#fffdf7")}"/>`;
  } else {
    content = `<image href="${escapeXmlAttribute(object.src)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
  }
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${outputWidth} ${outputHeight}"><g transform="rotate(${object.rotation} ${outputWidth / 2} ${outputHeight / 2})">${content}</g></svg>`;
  return new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
}

export function objectExportArtifact(object) {
  if (isVideoObject(object)) {
    const [, payload = ""] = object.src.split(",", 2);
    const bytes = atob(payload);
    const data = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) data[index] = bytes.charCodeAt(index);
    const extension = object.originalFilename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
      || ({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }[object.mime])
      || "video";
    return { blob: new Blob([data], { type: object.mime || "video/mp4" }), extension };
  }
  return { blob: objectToSvgBlob(object), extension: "svg" };
}

const SOURCE_EXTENSION_BY_MIME = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

function sourceExtension(object, blob) {
  return object?.originalFilename?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    || SOURCE_EXTENSION_BY_MIME[object?.mime]
    || SOURCE_EXTENSION_BY_MIME[blob?.type]
    || (isVideoObject(object) ? "video" : "image");
}

export async function sourceExportArtifact(object) {
  if (!object?.src || !["image", "video"].includes(object.type)) {
    throw new Error("這個項目沒有可下載的原始素材。");
  }
  const response = await fetch(object.src);
  if (!response.ok) throw new Error("無法讀取原始素材；畫布實例未受影響。");
  const blob = await response.blob();
  const mime = blob.type || object.mime;
  return {
    blob: mime ? blob.slice(0, blob.size, mime) : blob,
    extension: sourceExtension(object, blob),
  };
}
