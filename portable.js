import { normalizeInterfaceLocale, translateInterfaceText } from "./i18n.js";
import { shapeClipPath } from "./model.js";

const VIEWER_MARKERS = {
  heart: "♥",
  star: "★",
  sparkle: "✦",
  diamond: "◆",
  circle: "●",
  flag: "⚑",
};

const VIEWER_COLORS = {
  white: "#ffffff",
  cyan: "#58e6ff",
  pink: "#ff8fc7",
  amber: "#f3b75f",
  green: "#7df0b1",
  violet: "#b99cff",
  red: "#ff776f",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeForHtml(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function createPortableHtml(board, options = {}) {
  const locale = normalizeInterfaceLocale(options.locale || "zh-Hant");
  const shared = options.shared === true;
  const translate = (value) => translateInterfaceText(value, locale);
  const sourceBoard = board && typeof board === "object" ? board : { name: "", objects: [] };
  const viewerBoard = {
    name: sourceBoard.name || translate("未命名 Infinite Studio"),
    view: {
      x: Number(sourceBoard.view?.x) || 0,
      y: Number(sourceBoard.view?.y) || 0,
      zoom: Number(sourceBoard.view?.zoom) || 1,
    },
    objects: (Array.isArray(sourceBoard.objects) ? sourceBoard.objects : [])
      .filter((object) => object?.visible !== false && (["text", "shape", "artboard"].includes(object?.type) || (typeof object?.src === "string" && object.src)))
      .map((object) => ({
        name: object.name,
        type: object.type,
        src: object.src,
        mime: object.mime,
        pivotX: object.pivotX,
        pivotY: object.pivotY,
        width: object.width,
        height: object.height,
        rotation: object.rotation,
        tiltX: object.tiltX,
        tiltY: object.tiltY,
        depth: object.depth,
        perspective: object.perspective,
        anchor: object.anchor,
        text: object.textFlowId && typeof object.flowText === "string" ? object.flowText : object.text,
        fontFamily: object.fontFamily,
        fontWeight: object.fontWeight,
        fontSize: object.fontSize,
        lineHeight: object.lineHeight,
        color: object.color,
        textAlign: ["left", "center", "right", "justify"].includes(object.textAlign) ? object.textAlign : "left",
        textAlignLast: ["left", "center", "right"].includes(object.textAlignLast) ? object.textAlignLast : "left",
        textVerticalAlign: ["top", "middle", "bottom"].includes(object.textVerticalAlign) ? object.textVerticalAlign : "top",
        shapeKind: object.shapeKind,
        shapeSides: object.shapeSides,
        starPoints: object.starPoints,
        starInnerRatio: object.starInnerRatio,
        shapeClipPath: shapeClipPath(object),
        fill: object.fill,
        paperPreset: object.paperPreset,
        markers: Array.isArray(object.markers)
          ? object.markers.map(({ symbol, color }) => ({ symbol, color }))
          : [],
      })),
  };
  const title = escapeHtml(viewerBoard.name);
  const serializedBoard = serializeForHtml(viewerBoard);
  const serializedMarkers = serializeForHtml(VIEWER_MARKERS);
  const serializedColors = serializeForHtml(VIEWER_COLORS);
  const viewerCopy = {
    textObject: translate("文字物件"),
    shapeObject: translate("形狀物件"),
    canvasObject: translate("畫布物件"),
    objectSuffix: locale === "en" ? " objects" : locale === "zh-Hans" ? " 个对象" : " 個物件",
    emptyTitle: translate("這份 Infinite Studio 目前沒有可見物件"),
    emptyBody: translate("這是唯讀瀏覽檔；請回到 Infinite Studio 編輯原始 .studio 檔。"),
  };
  const serializedCopy = serializeForHtml(viewerCopy);

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>${title} — Infinite Studio ${escapeHtml(shared ? "分享檢視" : translate("離線瀏覽版"))}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; overflow: hidden; }
    body { background: #05090d; color: #e9f4f8; }
    .app { display: grid; grid-template-rows: 58px minmax(0, 1fr); height: 100%; }
    header { align-items: center; background: rgba(6, 11, 16, 0.98); border-bottom: 1px solid rgba(113, 177, 200, 0.2); display: flex; gap: 18px; justify-content: space-between; padding: 0 16px; position: relative; z-index: 3; }
    .identity { min-width: 0; }
    .identity strong { display: block; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .identity small { color: #86a4b2; display: block; font-size: 10px; margin-top: 2px; }
    ${shared ? "header { justify-content: flex-end; }" : ""}
    .controls { align-items: center; display: flex; flex: 0 0 auto; gap: 6px; }
    button { align-items: center; background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(113, 177, 200, 0.24); border-radius: 6px; color: #c7dce5; cursor: pointer; display: inline-flex; font: inherit; font-size: 11px; font-weight: 700; justify-content: center; min-height: 36px; padding: 0 11px; }
    button:hover, button:focus-visible { background: rgba(88, 230, 255, 0.09); border-color: #58e6ff; color: #b9f6ff; outline: none; }
    .zoom-button { font-size: 18px; min-width: 36px; padding: 0; }
    output { color: #8aa5b3; font-size: 11px; min-width: 42px; text-align: center; }
    .viewport { background-color: #071017; background-image: radial-gradient(circle, rgba(117, 174, 194, 0.22) 1px, transparent 1.2px); background-size: 18px 18px; cursor: grab; min-height: 0; overflow: hidden; position: relative; touch-action: none; }
    .viewport.is-panning { cursor: grabbing; }
    .world { left: 0; position: absolute; top: 0; transform-origin: 0 0; }
    .object { height: 0; position: absolute; transform-origin: 0 0; width: 0; }
    .frame { background: #101a21; box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28); position: absolute; transform-origin: 50% 50%; transform-style: preserve-3d; }
    .frame > img, .frame > video, .frame > .shape { display: block; height: 100%; object-fit: fill; width: 100%; }
    .frame > img { pointer-events: none; }
    .text { display: flex; flex-direction: column; height: 100%; line-height: 1.2; overflow: hidden; overflow-wrap: anywhere; white-space: pre-wrap; width: 100%; }
    .shape { background: var(--shape-fill, #58e6ff); }
    .artboard { background: var(--paper-fill, #fffdf7); box-shadow: 0 18px 54px rgba(0, 0, 0, 0.24); height: 100%; width: 100%; }
    .markers { align-items: center; background: rgba(7, 11, 16, 0.88); border: 1px solid rgba(113, 177, 200, 0.24); border-radius: 5px; display: flex; gap: 4px; left: 6px; line-height: 1; padding: 4px 5px; pointer-events: none; position: absolute; top: 6px; }
    .marker { font-family: Arial, sans-serif; font-size: 15px; }
    .status { align-items: center; backdrop-filter: blur(8px); background: rgba(6, 11, 16, 0.84); border: 1px solid rgba(113, 177, 200, 0.24); border-radius: 6px; bottom: 12px; color: #8aa5b3; display: flex; font-size: 10px; gap: 8px; left: 12px; padding: 7px 9px; pointer-events: none; position: absolute; z-index: 2; }
    .status b { color: #b9f6ff; font-weight: 700; }
    .empty { left: 50%; max-width: 300px; position: absolute; text-align: center; top: 50%; transform: translate(-50%, -50%); }
    .empty strong { display: block; font-size: 15px; }
    .empty p { color: #8aa5b3; font-size: 12px; line-height: 1.6; margin: 7px 0 0; }
    @media (max-width: 720px) {
      .app { grid-template-rows: auto minmax(0, 1fr); }
      header { align-items: flex-start; flex-direction: column; gap: 8px; padding: 10px; }
      .controls { width: 100%; }
      .controls button { min-height: 44px; }
      .controls .wide { flex: 1 1 auto; }
      .identity { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      ${shared ? "" : `<div class="identity"><strong>${title}</strong><small>Infinite Studio · ${escapeHtml(translate("單檔離線瀏覽版（唯讀）"))}</small></div>`}
      <div class="controls" aria-label="${escapeHtml(translate("畫面控制"))}">
        <button class="wide" id="saved-view" type="button">${escapeHtml(translate("儲存視角"))}</button>
        <button class="wide" id="fit" type="button">${escapeHtml(translate("全部顯示"))}</button>
        <button class="zoom-button" id="zoom-out" type="button" aria-label="${escapeHtml(translate("縮小"))}">−</button>
        <output id="zoom" aria-live="polite">100%</output>
        <button class="zoom-button" id="zoom-in" type="button" aria-label="${escapeHtml(translate("放大"))}">＋</button>
      </div>
    </header>
    <main class="viewport" id="viewport" aria-label="${escapeHtml(translate("Infinite Studio 唯讀畫布"))}">
      <div class="world" id="world"></div>
      <div class="status"><b id="count">0${escapeHtml(viewerCopy.objectSuffix)}</b><span>${escapeHtml(translate("拖曳平移 · Ctrl／⌘＋滾輪縮放"))}</span></div>
    </main>
  </div>
  <script type="application/json" id="board-data">${serializedBoard}</script>
  <script>
    (() => {
      const board = JSON.parse(document.getElementById("board-data").textContent);
      const markerSymbols = ${serializedMarkers};
      const markerColors = ${serializedColors};
      const copy = ${serializedCopy};
      const anchors = {
        tl: { x: 0, y: 0 }, tc: { x: 0.5, y: 0 }, tr: { x: 1, y: 0 },
        ml: { x: 0, y: 0.5 }, mc: { x: 0.5, y: 0.5 }, mr: { x: 1, y: 0.5 },
        bl: { x: 0, y: 1 }, bc: { x: 0.5, y: 1 }, br: { x: 1, y: 1 },
      };
      const viewport = document.getElementById("viewport");
      const world = document.getElementById("world");
      const zoomOutput = document.getElementById("zoom");
      const visibleObjects = Array.isArray(board.objects) ? board.objects.filter((object) => object.visible !== false) : [];
      let view = { x: 0, y: 0, zoom: 1 };

      function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
      function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
      function applyView() {
        world.style.transform = "translate(" + view.x + "px, " + view.y + "px) scale(" + view.zoom + ")";
        zoomOutput.value = Math.round(view.zoom * 100) + "%";
        zoomOutput.textContent = zoomOutput.value;
      }
      function rotate(x, y, degrees) {
        const radians = degrees * Math.PI / 180;
        return { x: x * Math.cos(radians) - y * Math.sin(radians), y: x * Math.sin(radians) + y * Math.cos(radians) };
      }
      function objectCorners(object) {
        const anchor = anchors[object.anchor] || anchors.mc;
        const width = Math.max(24, finite(object.width, 240));
        const height = Math.max(24, finite(object.height, 180));
        const center = { x: width / 2, y: height / 2 };
        const tiltX = finite(object.tiltX, 0) * Math.PI / 180;
        const tiltY = finite(object.tiltY, 0) * Math.PI / 180;
        const cosineX = Math.cos(tiltX);
        const sineX = Math.sin(tiltX);
        const cosineY = Math.cos(tiltY);
        const sineY = Math.sin(tiltY);
        const perspective = clamp(finite(object.perspective, 1000), 400, 3000);
        const depth = clamp(finite(object.depth, 0), -240, 240);
        return [[0, 0], [width, 0], [width, height], [0, height]].map((point) => {
          const centeredX = point[0] - center.x;
          const centeredY = point[1] - center.y;
          const rotatedX = centeredX * cosineY;
          const afterYDepth = -centeredX * sineY;
          const rotatedY = centeredY * cosineX - afterYDepth * sineX;
          const projectedDepth = centeredY * sineX + afterYDepth * cosineX + depth;
          const projection = perspective / Math.max(perspective * 0.08, perspective - projectedDepth);
          const local = rotate(
            center.x + rotatedX * projection - anchor.x * width,
            center.y + rotatedY * projection - anchor.y * height,
            finite(object.rotation, 0),
          );
          return { x: finite(object.pivotX, 0) + local.x, y: finite(object.pivotY, 0) + local.y };
        });
      }
      function render() {
        visibleObjects.forEach((object) => {
          const anchor = anchors[object.anchor] || anchors.mc;
          const width = Math.max(24, finite(object.width, 240));
          const height = Math.max(24, finite(object.height, 180));
          const item = document.createElement("article");
          item.className = "object";
          item.style.left = finite(object.pivotX, 0) + "px";
          item.style.top = finite(object.pivotY, 0) + "px";
          item.style.transform = "rotate(" + finite(object.rotation, 0) + "deg)";
          const frame = document.createElement("div");
          frame.className = "frame";
          frame.style.left = -anchor.x * width + "px";
          frame.style.top = -anchor.y * height + "px";
          frame.style.width = width + "px";
          frame.style.height = height + "px";
          frame.style.transform = "perspective(" + clamp(finite(object.perspective, 1000), 400, 3000) + "px) translateZ(" + clamp(finite(object.depth, 0), -240, 240) + "px) rotateX(" + clamp(finite(object.tiltX, 0), -60, 60) + "deg) rotateY(" + clamp(finite(object.tiltY, 0), -60, 60) + "deg)";
          const isVideo = object.type === "video" || String(object.mime || "").startsWith("video/");
          if (object.type === "artboard") {
            const artboard = document.createElement("div");
            artboard.className = "artboard";
            artboard.setAttribute("role", "img");
            artboard.setAttribute("aria-label", object.name || "Artboard");
            artboard.style.setProperty("--paper-fill", object.fill || "#fffdf7");
            frame.appendChild(artboard);
          } else if (object.type === "text") {
            const text = document.createElement("div");
            text.className = "text";
            text.textContent = object.text || "";
            text.setAttribute("aria-label", object.name || copy.textObject);
            text.style.color = object.color || "#edf7fb";
            text.style.fontFamily = object.fontFamily || "Inter, sans-serif";
            text.style.fontWeight = object.fontWeight || "600";
            text.style.fontSize = Math.max(6, finite(object.fontSize, 32)) + "px";
            text.style.lineHeight = String(finite(object.lineHeight, 1.2));
            text.style.textAlign = ["left", "center", "right", "justify"].includes(object.textAlign) ? object.textAlign : "left";
            text.style.textAlignLast = object.textAlign === "justify" && ["left", "center", "right"].includes(object.textAlignLast) ? object.textAlignLast : "auto";
            text.style.justifyContent = { top: "flex-start", middle: "safe center", bottom: "safe flex-end" }[object.textVerticalAlign] || "flex-start";
            frame.appendChild(text);
          } else if (object.type === "shape") {
            const shape = document.createElement("div");
            shape.className = "shape";
            shape.setAttribute("role", "img");
            shape.setAttribute("aria-label", object.name || copy.shapeObject);
            shape.style.setProperty("--shape-fill", object.fill || "#58e6ff");
            shape.style.clipPath = object.shapeClipPath || "none";
            frame.appendChild(shape);
          } else {
            const media = document.createElement(isVideo ? "video" : "img");
            media.src = object.src || "";
            media.setAttribute("aria-label", object.name || copy.canvasObject);
            if (isVideo) {
              media.controls = true;
              media.playsInline = true;
              media.preload = "metadata";
            } else {
              media.alt = object.name || copy.canvasObject;
              media.draggable = false;
            }
            frame.appendChild(media);
          }
          if (Array.isArray(object.markers) && object.markers.length) {
            const markers = document.createElement("div");
            markers.className = "markers";
            object.markers.slice(0, 5).forEach((marker) => {
              const symbol = document.createElement("span");
              symbol.className = "marker";
              symbol.textContent = markerSymbols[marker.symbol] || "●";
              symbol.style.color = markerColors[marker.color] || markerColors.white;
              markers.appendChild(symbol);
            });
            frame.appendChild(markers);
          }
          item.appendChild(frame);
          world.appendChild(item);
        });
        document.getElementById("count").textContent = visibleObjects.length + copy.objectSuffix;
        if (!visibleObjects.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          const emptyTitle = document.createElement("strong");
          emptyTitle.textContent = copy.emptyTitle;
          const emptyBody = document.createElement("p");
          emptyBody.textContent = copy.emptyBody;
          empty.append(emptyTitle, emptyBody);
          viewport.appendChild(empty);
        }
      }
      function fitAll() {
        const rect = viewport.getBoundingClientRect();
        if (!visibleObjects.length) {
          view = { x: rect.width / 2, y: rect.height / 2, zoom: 1 };
          applyView();
          return;
        }
        const points = visibleObjects.flatMap(objectCorners);
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const zoom = clamp(Math.min((rect.width - 72) / width, (rect.height - 72) / height), 0.05, 2);
        view = { zoom, x: rect.width / 2 - ((minX + maxX) / 2) * zoom, y: rect.height / 2 - ((minY + maxY) / 2) * zoom };
        applyView();
      }
      function setSavedView() {
        view = {
          x: finite(board.view && board.view.x, 0),
          y: finite(board.view && board.view.y, 0),
          zoom: clamp(finite(board.view && board.view.zoom, 1), 0.05, 4),
        };
        applyView();
      }
      function zoomAround(nextZoom, clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        const zoom = clamp(nextZoom, 0.05, 4);
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const worldX = (localX - view.x) / view.zoom;
        const worldY = (localY - view.y) / view.zoom;
        view = { zoom, x: localX - worldX * zoom, y: localY - worldY * zoom };
        applyView();
      }

      render();
      requestAnimationFrame(fitAll);
      if (typeof ResizeObserver === "function") {
        const initialFitObserver = new ResizeObserver(() => {
          const rect = viewport.getBoundingClientRect();
          if (rect.width <= 72 || rect.height <= 72) return;
          initialFitObserver.disconnect();
          fitAll();
        });
        initialFitObserver.observe(viewport);
      }
      document.getElementById("fit").addEventListener("click", fitAll);
      document.getElementById("saved-view").addEventListener("click", setSavedView);
      document.getElementById("zoom-in").addEventListener("click", () => {
        const rect = viewport.getBoundingClientRect();
        zoomAround(view.zoom * 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
      document.getElementById("zoom-out").addEventListener("click", () => {
        const rect = viewport.getBoundingClientRect();
        zoomAround(view.zoom / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
      viewport.addEventListener("wheel", (event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) zoomAround(view.zoom * Math.exp(-event.deltaY * 0.005), event.clientX, event.clientY);
        else { view = { ...view, x: view.x - event.deltaX, y: view.y - event.deltaY }; applyView(); }
      }, { passive: false });

      let drag = null;
      viewport.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.target.closest("button, video")) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
        viewport.classList.add("is-panning");
        viewport.setPointerCapture(event.pointerId);
      });
      viewport.addEventListener("pointermove", (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        view = { ...view, x: drag.viewX + event.clientX - drag.x, y: drag.viewY + event.clientY - drag.y };
        applyView();
      });
      function endDrag(event) {
        if (!drag || drag.id !== event.pointerId) return;
        drag = null;
        viewport.classList.remove("is-panning");
      }
      viewport.addEventListener("pointerup", endDrag);
      viewport.addEventListener("pointercancel", endDrag);
    })();
  </script>
</body>
</html>
`;
}
