export const STROKE_STYLES = Object.freeze(['none', 'solid', 'dashed', 'dotted']);

export function objectStroke(object) {
  const style = STROKE_STYLES.includes(object?.strokeStyle) ? object.strokeStyle : 'none';
  const rawWidth = Number(object?.strokeWidth);
  const width = Number.isFinite(rawWidth) ? Math.max(0.1, Math.min(100, rawWidth)) : 2;
  const color = /^#[0-9a-f]{6}$/i.test(object?.strokeColor || '') ? object.strokeColor : '#000000';
  return { style, width, color, enabled: style !== 'none' };
}

export function strokeDashArray(stroke) {
  if (stroke.style === 'dashed') return [stroke.width * 4, stroke.width * 2];
  if (stroke.style === 'dotted') return [stroke.width, stroke.width * 2];
  return [];
}

export function strokeOutlineStyle(object) {
  const stroke = objectStroke(object);
  return stroke.enabled ? { outline: `${stroke.width}px ${stroke.style} ${stroke.color}`, outlineOffset: -stroke.width } : {};
}
