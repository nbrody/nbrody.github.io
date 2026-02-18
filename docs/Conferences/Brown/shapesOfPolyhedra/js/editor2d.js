// ─────────────────────────────────────────────────
// 2D Canvas Editor — drag interior vertices to set a,b,c,d
// ─────────────────────────────────────────────────

import { params, corners, PARAM_MIN, PARAM_MAX, PAIR_COLORS, notify } from './state.js';
import { getOctagonVertices, getEdgePairs } from './geometry.js';

const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const panel = document.getElementById('editor-panel');

let W, H, sc, ox, oy;
let dragIdx = -1, hoverIdx = -1;

export function resize() {
    W = panel.clientWidth;
    H = panel.clientHeight;
    canvas.width = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const pad = 80;
    sc = Math.min(W - 2 * pad, H - 2 * pad);
    ox = (W - sc) / 2;
    oy = (H - sc) / 2;
}

function toS(p) { return [ox + p[0] * sc, oy + (1 - p[1]) * sc]; }
function fromS(sx, sy) { return [(sx - ox) / sc, 1 - (sy - oy) / sc]; }

function vertices() {
    return getOctagonVertices(corners, params.a, params.b, params.c, params.d);
}

function hitTest(sx, sy) {
    const v = vertices();
    // Hit test all 8 vertices
    for (let i = 0; i < 8; i++) {
        const s = toS(v[i]);
        if ((sx - s[0]) ** 2 + (sy - s[1]) ** 2 < 225) return i;
    }
    return -1;
}

function applyDrag(sx, sy) {
    const w = fromS(sx, sy);

    if (dragIdx % 2 === 0) {
        // Dragging a corner
        const cornerIdx = dragIdx / 2;
        corners[cornerIdx][0] = w[0];
        corners[cornerIdx][1] = w[1];
    } else {
        // Dragging an interior point
        const paramIdx = (dragIdx - 1) / 2;
        const keys = ['a', 'b', 'c', 'd'];

        // Calculate distance from midpoint along inward normal
        const v1 = corners[paramIdx];
        const v2 = corners[(paramIdx + 1) % 4];
        const mx = (v1[0] + v2[0]) / 2;
        const my = (v1[1] + v2[1]) / 2;

        const dx = v2[0] - v1[0];
        const dy = v2[1] - v1[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len;
        const ny = dx / len;

        const pvx = w[0] - mx;
        const pvy = w[1] - my;
        const dist = pvx * nx + pvy * ny;

        params[keys[paramIdx]] = Math.max(-0.5, Math.min(0.5, dist));
    }

    updateLabels();
    draw();
    notify();
}

// ── Drawing ──────────────────────────────────────

export function draw() {
    ctx.clearRect(0, 0, W, H);
    const verts = vertices();
    const pairs = getEdgePairs(PAIR_COLORS);

    // Ghost polygon of the 4 corners
    ctx.beginPath();
    corners.forEach((c, i) => {
        const s = toS(c);
        i === 0 ? ctx.moveTo(s[0], s[1]) : ctx.lineTo(s[0], s[1]);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill octagon
    ctx.beginPath();
    verts.forEach((v, i) => {
        const s = toS(v);
        i === 0 ? ctx.moveTo(s[0], s[1]) : ctx.lineTo(s[0], s[1]);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(139, 92, 246, 0.06)';
    ctx.fill();

    // Triangles being cut
    const triDefs = [[7, 0, 1], [1, 2, 3], [3, 4, 5], [5, 6, 7]];
    const triAlphas = ['rgba(255,107,107,0.07)', 'rgba(255,217,61,0.07)', 'rgba(107,203,119,0.07)', 'rgba(77,150,255,0.07)'];
    triDefs.forEach((tri, i) => {
        ctx.beginPath();
        tri.forEach((vi, j) => {
            const s = toS(verts[vi]);
            j === 0 ? ctx.moveTo(s[0], s[1]) : ctx.lineTo(s[0], s[1]);
        });
        ctx.closePath();
        ctx.fillStyle = triAlphas[i];
        ctx.fill();
    });

    // Dashed midpoint→interior lines
    const intPts = [verts[1], verts[3], verts[5], verts[7]];
    corners.forEach((v1, i) => {
        const v2 = corners[(i + 1) % 4];
        const m = toS([(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2]);
        const p = toS(intPts[i]);
        ctx.beginPath(); ctx.moveTo(m[0], m[1]); ctx.lineTo(p[0], p[1]);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    });

    // Edges with pair colors + tick marks + arrows
    for (const pair of pairs) {
        for (const eIdx of pair.edges) {
            const s1 = toS(verts[eIdx]);
            const s2 = toS(verts[(eIdx + 1) % 8]);
            ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]);
            ctx.strokeStyle = pair.color; ctx.lineWidth = 2.5; ctx.stroke();

            // Tick marks
            const mx = (s1[0] + s2[0]) / 2, my = (s1[1] + s2[1]) / 2;
            const dx = s2[0] - s1[0], dy = s2[1] - s1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len * 6, ny = dx / len * 6;
            const pairIdx = Math.floor(eIdx / 2);
            const numT = pairIdx + 1;
            for (let t = 0; t < numT; t++) {
                const o = (t - (numT - 1) / 2) * 5;
                const cx = mx + (dx / len) * o, cy = my + (dy / len) * o;
                ctx.beginPath(); ctx.moveTo(cx - nx, cy - ny); ctx.lineTo(cx + nx, cy + ny);
                ctx.strokeStyle = pair.color; ctx.lineWidth = 1.5; ctx.stroke();
            }

            // Direction arrow
            const at = 0.4;
            const ax = s1[0] + dx * at, ay = s1[1] + dy * at;
            const aL = 6, adx = dx / len, ady = dy / len;
            ctx.beginPath();
            ctx.moveTo(ax - adx * aL - ny / len * aL * 0.5, ay - ady * aL - (-nx) / len * aL * 0.5);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax - adx * aL + ny / len * aL * 0.5, ay - ady * aL + (-nx) / len * aL * 0.5);
            ctx.strokeStyle = pair.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    // Corner vertices
    for (let i = 0; i < 8; i += 2) {
        const s = toS(verts[i]);
        const hover = dragIdx === i || hoverIdx === i;
        const r = hover ? 7 : 5;
        ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // Interior draggable vertices
    const pNames = ['a', 'b', 'c', 'd'];
    const labelOff = [[0, 20], [-20, 0], [0, -16], [20, 0]];
    intPts.forEach((pt, i) => {
        const s = toS(pt);
        const hover = dragIdx === i || hoverIdx === i;
        const r = hover ? 9 : 7;
        ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
        ctx.fillStyle = PAIR_COLORS[i]; ctx.fill();
        if (hover) {
            ctx.beginPath(); ctx.arc(s[0], s[1], r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = PAIR_COLORS[i]; ctx.globalAlpha = 0.3; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = PAIR_COLORS[i]; ctx.font = '600 13px Inter';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pNames[i], s[0] + labelOff[i][0], s[1] + labelOff[i][1]);
    });

    // Edge length labels
    pairs.forEach(pair => {
        const eIdx = pair.edges[0];
        const v1 = verts[eIdx], v2 = verts[(eIdx + 1) % 8];
        const len = Math.sqrt((v2[0] - v1[0]) ** 2 + (v2[1] - v1[1]) ** 2);
        const mid = toS([(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2]);
        ctx.fillStyle = pair.color; ctx.globalAlpha = 0.55; ctx.font = '500 10px Inter';
        ctx.textAlign = 'center'; ctx.fillText(len.toFixed(3), mid[0], mid[1] - 12);
        ctx.globalAlpha = 1;
    });
}

function updateLabels() {
    ['a', 'b', 'c', 'd'].forEach(k => {
        document.getElementById('val-' + k).textContent = params[k].toFixed(2);
    });
}

// ── Input events ─────────────────────────────────

canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    const idx = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (idx >= 0) { dragIdx = idx; canvas.style.cursor = 'grabbing'; }
});
canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (dragIdx >= 0) { applyDrag(sx, sy); }
    else { hoverIdx = hitTest(sx, sy); canvas.style.cursor = hoverIdx >= 0 ? 'grab' : 'default'; draw(); }
});
canvas.addEventListener('mouseup', () => { dragIdx = -1; canvas.style.cursor = 'default'; });
canvas.addEventListener('mouseleave', () => { dragIdx = -1; hoverIdx = -1; draw(); });

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    const idx = hitTest(t.clientX - r.left, t.clientY - r.top);
    if (idx >= 0) dragIdx = idx;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (dragIdx < 0) return;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    applyDrag(t.clientX - r.left, t.clientY - r.top);
}, { passive: false });
canvas.addEventListener('touchend', () => { dragIdx = -1; });
