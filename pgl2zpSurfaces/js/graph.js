/* ============================================================
   graph.js – SVG coset / Schreier graph drawing
   ============================================================ */

import { cycleDecomposition } from './math.js';

/**
 * Render the coset graph into an SVG element.
 */
export function drawGraph(svgEl, a, b, u) {
    const n = a.length;
    const cx = 380, cy = 240;
    const r = Math.min(190, 26 * n / Math.PI);
    const pts = Array.from({ length: n }, (_, i) => {
        const th = -Math.PI / 2 + 2 * Math.PI * i / n;
        return { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) };
    });
    let html = '';

    // Defs
    html += `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f8fafc" opacity="0.6"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

    function edgePath(p1, p2, curv) {
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        return `M ${p1.x} ${p1.y} Q ${mx + curv * nx} ${my + curv * ny} ${p2.x} ${p2.y}`;
    }

    // a-edges
    for (let i = 0; i < n; i++) {
        const j = a[i];
        if (i <= j) {
            if (i === j) {
                html += `<path d="M ${pts[i].x} ${pts[i].y - 14} C ${pts[i].x + 22} ${pts[i].y - 34}, ${pts[i].x - 22} ${pts[i].y - 34}, ${pts[i].x} ${pts[i].y - 14}" fill="none" stroke="var(--edgeA)" stroke-width="2" opacity="0.85"/>`;
            } else {
                html += `<path d="${edgePath(pts[i], pts[j], 20)}" fill="none" stroke="var(--edgeA)" stroke-width="2" opacity="0.85"/>`;
            }
        }
    }

    // b-edges
    for (let i = 0; i < n; i++) {
        const j = b[i];
        if (i <= j) {
            if (i === j) {
                html += `<path d="M ${pts[i].x} ${pts[i].y + 14} C ${pts[i].x + 22} ${pts[i].y + 34}, ${pts[i].x - 22} ${pts[i].y + 34}, ${pts[i].x} ${pts[i].y + 14}" fill="none" stroke="var(--edgeB)" stroke-width="2" stroke-dasharray="6 4" opacity="0.85"/>`;
            } else {
                html += `<path d="${edgePath(pts[i], pts[j], -20)}" fill="none" stroke="var(--edgeB)" stroke-width="2" stroke-dasharray="6 4" opacity="0.85"/>`;
            }
        }
    }

    // Commutator cycle arrows
    const cycles = cycleDecomposition(u).filter(c => c.length > 1);
    for (const cyc of cycles) {
        for (let k = 0; k < cyc.length; k++) {
            const i = cyc[k], j = cyc[(k + 1) % cyc.length];
            html += `<path d="${edgePath(pts[i], pts[j], 0)}" fill="none" stroke="#f8fafc" stroke-width="1.1" marker-end="url(#arrow)" opacity="0.45"/>`;
        }
    }

    // Vertices
    for (let i = 0; i < n; i++) {
        html += `<circle cx="${pts[i].x}" cy="${pts[i].y}" r="14" fill="#0d1430" stroke="rgba(203,213,225,0.5)" stroke-width="1.2" filter="url(#glow)"/>`;
        html += `<text x="${pts[i].x}" y="${pts[i].y + 4.5}" font-size="12" font-family="Inter, sans-serif" font-weight="600" fill="#cbd5e1" text-anchor="middle">${i + 1}</text>`;
    }

    svgEl.innerHTML = html;
}
