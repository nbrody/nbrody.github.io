// Reveal labels use actual click order, even if stored build numbers have gaps.
export function revealOrder(elements, countSteps) {
  const steps = new Set();
  for (const e of elements) if (e.build > 0) {
    for (let i = 0; i < countSteps(e); i++) steps.add(e.build + i);
  }
  return [...steps].sort((a, b) => a - b);
}

// Place badges near their elements in screen pixels. Search a widening grid so
// overlapping elements still get separate, readable labels at any zoom.
export function placeRevealBadges(items, width, height) {
  const placed = [];
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  for (const item of items) {
    const w = Math.max(20, item.label.length * 7 + 12), h = 20;
    const x0 = clamp(item.x - w / 2, 0, Math.max(0, width - w));
    const y0 = clamp(item.y - h / 2, 0, Math.max(0, height - h));
    let chosen;
    const fits = (x, y) => !placed.some(p => x < p.x + p.w + 4 && x + w + 4 > p.x && y < p.y + p.h + 4 && y + h + 4 > p.y);
    for (let ring = 0; ring < 100 && !chosen; ring++) {
      for (let dy = -ring; dy <= ring && !chosen; dy++) for (let dx = -ring; dx <= ring && !chosen; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = clamp(x0 + dx * (w + 5), 0, Math.max(0, width - w));
        const y = clamp(y0 + dy * 25, 0, Math.max(0, height - h));
        if (fits(x, y)) chosen = { x, y, w, h };
      }
    }
    // If the slide is completely full, continue below it rather than overlap.
    if (!chosen) chosen = { x: 0, y: height + placed.length * 24, w, h };
    placed.push({ ...item, anchorX: item.x, anchorY: item.y, ...chosen });
  }
  return placed;
}
