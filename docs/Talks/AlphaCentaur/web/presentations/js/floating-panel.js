// Keep a floating panel visible even when its container becomes smaller.
export function fitPanel(rect, bounds, minimized = false) {
  const gap = 10, bar = 42;
  const maxW = Math.max(1, bounds.w - 2 * gap), maxH = Math.max(1, bounds.h - 2 * gap);
  const width = Math.max(1, Math.min(maxW, Math.max(Math.min(200, maxW), rect.width)));
  const height = Math.max(1, Math.min(maxH, Math.max(Math.min(180, maxH), rect.height)));
  const visibleH = minimized ? Math.min(bar, maxH) : height;
  return { width, height, x: Math.max(gap, Math.min(rect.x, bounds.w - gap - width)), y: Math.max(gap, Math.min(rect.y, bounds.h - gap - visibleH)) };
}
export function defaultPanel(bounds) {
  const width = Math.min(300, Math.max(1, bounds.w - 20));
  const height = Math.min(550, Math.max(1, bounds.h - 20));
  return fitPanel({ x: bounds.w - width - 10, y: bounds.h - height - 10, width, height }, bounds);
}
