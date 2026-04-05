/**
 * Canvas drawing primitives: grid, transformed grid, coordinate frame,
 * arrows, dots, polygons, labels, dashed lines.
 */
import { applyTf } from './transforms.js';

let canvas, ctx;

export const C = {
    grid: 'rgba(124, 138, 255, 0.07)',
    gridMajor: 'rgba(124, 138, 255, 0.16)',
    accent: '#7c8aff',
    warm: '#f59e0b',
    teal: '#2dd4bf',
    rose: '#f472b6',
    violet: '#a78bfa',
    framePrimary: '#7c8aff',
    frameSecondary: '#f59e0b',
    tGrid: 'rgba(245, 158, 11, 0.08)',
    tGridMajor: 'rgba(245, 158, 11, 0.2)',
};

/* ── Bootstrap ─────────────────────────────────────── */

export function initDrawing(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
}

export function resizeCanvas() {
    const main = document.getElementById('viz-main');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = main.clientWidth * dpr;
    canvas.height = main.clientHeight * dpr;
    canvas.style.width = main.clientWidth + 'px';
    canvas.style.height = main.clientHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── Viewport helpers ──────────────────────────────── */

export function vp() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    return { w, h, cx: w / 2, cy: h / 2 };
}

export function scale() {
    const { w, h } = vp();
    return Math.min(w, h) / 14;
}

export function toS(x, y) {
    const { cx, cy } = vp();
    const s = scale();
    return [cx + x * s, cy - y * s];
}

export function clear() {
    const { w, h } = vp();
    ctx.clearRect(0, 0, w, h);
}

export function setInfo(text) {
    document.getElementById('info-text').textContent = text;
}

export function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ── Standard Grid ─────────────────────────────────── */

export function drawGrid() {
    const { w, h, cx, cy } = vp();
    const s = scale();
    const range = Math.ceil(Math.max(w, h) / s / 2) + 1;
    for (let i = -range; i <= range; i++) {
        const major = i === 0;
        ctx.strokeStyle = major ? C.gridMajor : C.grid;
        ctx.lineWidth = major ? 1.5 : 0.5;
        const x = cx + i * s;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        const y = cy + i * s;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
}

/* ── Transformed Grid ──────────────────────────────── */

export function drawTransformedGrid(tf, opts = {}) {
    const {
        color = C.tGrid,
        majorColor = C.tGridMajor,
        majorWidth = 1.5,
        minorWidth = 0.5,
    } = opts;
    const { w, h } = vp();
    const s = scale();
    const range = Math.ceil(Math.max(w, h) / s / 2) + 2;

    for (let i = -range; i <= range; i++) {
        const p1 = applyTf(tf, { x: i, y: -range });
        const p2 = applyTf(tf, { x: i, y: range });
        const [sx1, sy1] = toS(p1.x, p1.y);
        const [sx2, sy2] = toS(p2.x, p2.y);
        ctx.strokeStyle = i === 0 ? majorColor : color;
        ctx.lineWidth = i === 0 ? majorWidth : minorWidth;
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
    }

    for (let j = -range; j <= range; j++) {
        const p1 = applyTf(tf, { x: -range, y: j });
        const p2 = applyTf(tf, { x: range, y: j });
        const [sx1, sy1] = toS(p1.x, p1.y);
        const [sx2, sy2] = toS(p2.x, p2.y);
        ctx.strokeStyle = j === 0 ? majorColor : color;
        ctx.lineWidth = j === 0 ? majorWidth : minorWidth;
        ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
    }
}

/* ── Coordinate Frame ──────────────────────────────── */

export function drawFrame(tf, opts = {}) {
    const {
        color1 = C.framePrimary,
        color2 = C.frameSecondary,
        lw = 3,
        size = 1,
        dotRadius = 5,
        dotColor = '#fff',
        showLabels = false,
        alpha = 1,
    } = opts;

    const o  = applyTf(tf, { x: 0, y: 0 });
    const e1 = applyTf(tf, { x: size, y: 0 });
    const e2 = applyTf(tf, { x: 0, y: size });

    ctx.globalAlpha = alpha;
    _arrowWorld(o, e1, color1, lw);
    _arrowWorld(o, e2, color2, lw);

    // origin dot
    const [sx, sy] = toS(o.x, o.y);
    ctx.beginPath(); ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = dotColor; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();

    if (showLabels) {
        const [ex1, ey1] = toS(e1.x, e1.y);
        const [ex2, ey2] = toS(e2.x, e2.y);
        ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'start';
        ctx.fillStyle = color1; ctx.fillText('e₁', ex1 + 8, ey1 + 4);
        ctx.fillStyle = color2; ctx.fillText('e₂', ex2 + 8, ey2 + 4);
    }
    ctx.globalAlpha = 1;
}

/* ── Arrow (world coordinates) ─────────────────────── */

function _arrowWorld(from, to, color, lw) {
    const [x1, y1] = toS(from.x, from.y);
    const [x2, y2] = toS(to.x, to.y);
    _arrowScreen(x1, y1, x2, y2, color, lw);
}

function _arrowScreen(x1, y1, x2, y2, color, lw) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 8 + lw * 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.35), y2 - headLen * Math.sin(angle - 0.35));
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.35), y2 - headLen * Math.sin(angle + 0.35));
    ctx.closePath(); ctx.fill();
}

export function drawScreenArrow(from, to, color, lw = 2.5) {
    _arrowWorld(from, to, color, lw);
}

/* ── Dot ───────────────────────────────────────────── */

export function drawDot(x, y, r, color) {
    const [sx, sy] = toS(x, y);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
}

/* ── Polygon ───────────────────────────────────────── */

export function drawPoly(pts, fill, stroke, lw = 2) {
    if (!pts.length) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
        const [sx, sy] = toS(p.x, p.y);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

/* ── Dashed Line ───────────────────────────────────── */

export function drawDashedLine(from, to, color, lw = 1.5, dash = [8, 5]) {
    const [x1, y1] = toS(from.x, from.y);
    const [x2, y2] = toS(to.x, to.y);
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
}

/* ── Label ─────────────────────────────────────────── */

export function drawLabel(x, y, text, color, opts = {}) {
    const { font = '600 12px Inter, sans-serif', dx = 0, dy = 0, align = 'start' } = opts;
    const [sx, sy] = toS(x, y);
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align;
    ctx.fillText(text, sx + dx, sy + dy);
    ctx.textAlign = 'start';
}
