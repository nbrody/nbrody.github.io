// ────────────────────────────────────────────────────────────────
//  tour.js — the looping, chaptered animation
//
//  Each chapter is a pure function of its local time t: every frame
//  the renderer resets the per-hat arrays to the palette at rest,
//  then chapter.frame(F) dims, tints, lifts, flips, moves and adds to
//  them, sets the camera, and queues overlay drawings. Chapters begin
//  and end in the state their neighbours expect, so the loop is seamless.
// ────────────────────────────────────────────────────────────────

const TAU = PI * 2;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = t => { t = clamp01(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const envelope = (t, dur, a, b) => smooth(0, a, t) * (1 - smooth(dur - b, dur, t));
const hash01 = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const fmt = n => n.toLocaleString('en-US');

function hexRgb(h) {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}
function hslRgb(h, s, l) {
    const f = n => {
        const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
}
const cssRgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const GOLD = hexRgb('#ffcf5c'), CYAN = hexRgb('#5cc8ff'), TEAL = hexRgb('#2ee6c5'),
      CORAL = hexRgb('#ff5a5f'), ORANGE = hexRgb('#ff9f43'), WHITE = [1, 1, 1];
const KIND_RGB = { H: hexRgb('#4cc9f0'), T: hexRgb('#f72585'), P: hexRgb('#ffd166'), F: hexRgb('#06d6a0') };
const orientRgb = code => code < 6 ? hslRgb(code * 60 + 15, 0.78, 0.64) : hslRgb((code - 6) * 60 + 15, 0.95, 0.42);
const coronaRgb = id => id < 0 ? [0.35, 0.36, 0.4] : hslRgb((id * 137.508 + 200) % 360, 0.72, 0.62);

// ── Per-hat helpers ───────────────────────────────────────────
function mixCol(F, i, rgb, k) {
    const c = F.col, o = i * 4;
    c[o] += (rgb[0] - c[o]) * k; c[o + 1] += (rgb[1] - c[o + 1]) * k; c[o + 2] += (rgb[2] - c[o + 2]) * k;
}
const dimCol = (F, i, k) => mixCol(F, i, F.pal.bg, k);

// ── Overlay helpers (world-space drawing on the 2D canvas) ────
function tracePoly(ov, pts) {
    const c = ov.ctx;
    c.beginPath();
    pts.forEach((p, i) => { const s = ov.toS(p.x, p.y); i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
    c.closePath();
}
const hatPts = (T, shape = HAT14) => shape.map(p => transPt(T, p));

function drawKiteGrid(ov, Tc, radius, alpha, rgb) {
    if (alpha <= 0.01) return;
    const c = ov.ctx;
    c.save();
    c.lineWidth = 1;
    const R = Math.ceil(radius / 3) + 1;
    for (let m = -R; m <= R; m++) for (let q = -R; q <= R; q++) {
        const hx = 3 * m, hy = 2 * hr3 * m + 4 * hr3 * q;
        const d = mag(hx, hy);
        if (d > radius * 2) continue;
        const a = alpha * (1 - smooth(radius * 0.8, radius * 2, d));
        if (a < 0.01) continue;
        c.strokeStyle = cssRgb(rgb, a);
        c.beginPath();
        for (let k = 0; k < 6; k++) {
            const v0 = transPt(Tc, pt(hx + 2 * cos(k * PI / 3), hy + 2 * sin(k * PI / 3)));
            const v1 = transPt(Tc, pt(hx + 2 * cos((k + 1) * PI / 3), hy + 2 * sin((k + 1) * PI / 3)));
            const s0 = ov.toS(v0.x, v0.y), s1 = ov.toS(v1.x, v1.y);
            c.moveTo(s0.x, s0.y); c.lineTo(s1.x, s1.y);
            const o = transPt(Tc, pt(hx, hy)), mdp = transPt(Tc, pt(hx + sqrt(3) * cos(k * PI / 3 + PI / 6), hy + sqrt(3) * sin(k * PI / 3 + PI / 6)));
            const so = ov.toS(o.x, o.y), sm = ov.toS(mdp.x, mdp.y);
            c.moveTo(so.x, so.y); c.lineTo(sm.x, sm.y);
        }
        c.stroke();
    }
    c.restore();
}

function fitSpan(W, H, w, h, margin = 1.12) {
    const m = Math.min(W, H);
    return Math.max(w * m / W, h * m / H) * margin;
}
function polyBox(pts) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

// ── Chapters ──────────────────────────────────────────────────
function makeTour(P) {
    const n = P.n, C = P.center;
    const Tc = P.hats[C].T;
    const nFlip = P.refl.reduce((s, v) => s + v, 0), nUp = n - nFlip;
    const legal = P.pairs.length, legalFlip = P.pairs.filter(p => p.refl).length;
    const dead = P.fits.filter(f => !f.legal).length, nCor = P.coronas.length;
    const L = P.level, root = P.levels[L][0];
    const rootBox = polyBox(root.shape);

    const chapters = [];

    // 1 ─ One tile ─────────────────────────────────────────────
    chapters.push({
        id: 'hat', title: 'The hat', dur: 16,
        text: F => F.t < 11
            ? 'A single 13-sided shape, glued together from eight kites cut from a grid of hexagons. In 2023 David Smith, Joseph Myers, Craig Kaplan and Chaim Goodman-Strauss proved that it tiles the plane, but never periodically: the first “einstein”, a one-stone aperiodic tile.'
            : 'Its edges come in just two lengths, 1 and √3 (the long flat side is two unit edges end to end). Keep that in mind.',
        frame(F) {
            const t = F.t;
            for (let i = 0; i < n; i++) F.col[i * 4 + 3] = 0;
            const hatA = 1 - smooth(2.4, 3.2, t) + smooth(9.6, 10.6, t);
            F.col[C * 4 + 3] = hatA;
            F.cam.span = 10;
            const gridA = 0.32 * smooth(0, 2, t) * (1 - smooth(13.5, 16, t));
            const kiteA = smooth(2.4, 3.2, t) * (1 - smooth(9.6, 10.6, t));
            const burst = smooth(3, 5, t) * (1 - smooth(8, 9.8, t));
            const edgeA = smooth(10.8, 11.8, t) * (1 - smooth(14.8, 16, t));
            const shown = Math.floor(clamp01((t - 3.2) / 3.4) * 8 + 1e-6);
            const hatC = transPt(Tc, HAT_CENTROID);
            F.stat = t > 3 && t < 10.5 ? `kites: ${Math.max(1, Math.min(8, shown + 1))} of 8` : t >= 10.8 ? 'edges: 8 of length 1 · 6 of length √3' : '';
            F.under.push(ov => drawKiteGrid(ov, Tc, 14, gridA, F.pal.ink));
            F.over.push(ov => {
                const c = ov.ctx;
                if (kiteA > 0.01) {
                    HAT_KITE_POLYS.forEach((K, k) => {
                        const on = smooth(3.2 + k * 0.42, 3.6 + k * 0.42, t);
                        const kc = transPt(Tc, HAT_KITE_CENTROIDS[k]);
                        const dx = (kc.x - hatC.x) * 0.45 * burst, dy = (kc.y - hatC.y) * 0.45 * burst;
                        const pts = K.map(p => { const w = transPt(Tc, p); return pt(w.x + dx, w.y + dy); });
                        const hex = k < 4 ? 0 : k < 6 ? 1 : 2;
                        const base = F.pal.byLabel[[1, 3, 4][hex]];
                        const a = kiteA * lerp(0.35, 1, on);
                        tracePoly(ov, pts);
                        c.fillStyle = cssRgb(base, a * lerp(0.15, 0.95, on));
                        c.fill();
                        c.lineWidth = 1.5;
                        c.strokeStyle = cssRgb(F.pal.ink, a * 0.8);
                        c.stroke();
                    });
                }
                if (edgeA > 0.01) {
                    const W = hatPts(Tc);
                    c.lineCap = 'round';
                    for (let e = 0; e < 14; e++) {
                        const on = smooth(10.8 + e * 0.12, 11.1 + e * 0.12, t) * edgeA;
                        if (on < 0.01) continue;
                        const a = ov.toS(W[e].x, W[e].y), b = ov.toS(W[(e + 1) % 14].x, W[(e + 1) % 14].y);
                        const col = HAT_EDGE_UNIT[e] ? F.pal.gold : F.pal.cyan;
                        c.strokeStyle = cssRgb(col, on);
                        c.lineWidth = 5;
                        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
                        // label outside the edge
                        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                        const cs = ov.toS(hatC.x, hatC.y);
                        let nx = mx - cs.x, ny = my - cs.y;
                        const nl = Math.hypot(nx, ny) || 1;
                        nx /= nl; ny /= nl;
                        c.font = '600 15px Inter, system-ui, sans-serif';
                        c.textAlign = 'center'; c.textBaseline = 'middle';
                        c.fillStyle = cssRgb(col, on);
                        c.fillText(HAT_EDGE_UNIT[e] ? '1' : '√3', mx + nx * 16, my + ny * 16);
                    }
                }
            });
        }
    });

    // 2 ─ Growing ─────────────────────────────────────────────
    const growR = t => 1.4 * Math.pow(58 / 1.4, clamp01(t / 15));
    chapters.push({
        id: 'grow', title: 'Growing', dur: 20,
        text: 'Copies of the hat, a few of them flipped over, fit together edge to edge. Ring after ring they cover the plane with no gaps and no overlaps, and the pattern can be continued forever.',
        frame(F) {
            const R = growR(F.t), ramp = Math.max(1.3, Math.min(3.5, 0.3 * R));
            let placed = 0;
            for (let i = 0; i < n; i++) {
                const p = i === C ? 1 : clamp01((R - P.dist[i]) / ramp);
                const o = i * 4;
                if (p <= 0) { F.col[o + 3] = 0; continue; }
                if (p > 0.5) placed++;
                const e = easeOutCubic(p);
                F.col[o + 3] = smooth(0, 0.18, p);
                F.anim[o] = lerp(1.3, 1, e);
                F.anim[o + 1] = (1 - e) * (hash01(i) - 0.5) * 1.4;
                F.anim[o + 3] = (1 - e) * 1.6;
                mixCol(F, i, WHITE, (1 - p) * (1 - p) * 0.35);
            }
            F.cam.span = Math.max(10, Math.min(F.home.span, 2.7 * R));
            F.stat = `${fmt(placed)} hats placed`;
        }
    });

    // 3 ─ Mirror images ───────────────────────────────────────
    chapters.push({
        id: 'mirror', title: 'Mirror images', dur: 18,
        text: F => (F.t > 6 && F.t < 13.5)
            ? 'The flipped hats are essential: turn them face-up again and they no longer fit. Every hat tiling needs both hands.'
            : `About one hat in eight is a mirror image. In every hat tiling the face-up hats outnumber the flipped ones by φ⁴ ≈ 6.854 to 1. That ratio is irrational, which by itself rules out any periodic arrangement.`,
        frame(F) {
            const t = F.t, k = envelope(t, 18, 1.5, 2);
            const flip = PI * (smooth(6, 8, t) + smooth(11, 13, t));
            const clash = smooth(7.5, 8.5, t) * (1 - smooth(10.5, 11.5, t));
            for (let i = 0; i < n; i++) {
                const o = i * 4;
                if (P.refl[i]) {
                    mixCol(F, i, GOLD, 0.85 * k);
                    mixCol(F, i, CORAL, clash);
                    F.anim[o + 2] = flip;
                    F.anim[o + 3] = k;
                    F.col[o + 3] = 1 - 0.18 * clash;
                } else dimCol(F, i, 0.7 * k);
            }
            F.cam.span = lerp(F.home.span, 30, k);
            F.stat = `face-up ${fmt(nUp)} : flipped ${fmt(nFlip)} = ${(nUp / nFlip).toFixed(4)}  ·  φ⁴ = ${(((1 + sqrt(5)) / 2) ** 4).toFixed(4)}`;
        }
    });

    // 4 ─ Twelve orientations ─────────────────────────────────
    const orientCount = new Array(12).fill(0);
    for (let i = 0; i < n; i++) orientCount[P.code[i]]++;
    chapters.push({
        id: 'orient', title: 'Twelve orientations', dur: 14,
        text: 'Each hat points in one of six directions and is either face-up or flipped: twelve orientations. Colour by orientation and all twelve turn up everywhere, woven together without any preferred axis.',
        frame(F) {
            const t = F.t, k = envelope(t, 14, 1.5, 1.5);
            const slot = (t - 2) / 0.8, cur = Math.floor(slot);
            const spot = cur >= 0 && cur < 12 ? smooth(0, 0.2, slot - cur) * (1 - smooth(0.8, 1, slot - cur)) : 0;
            for (let i = 0; i < n; i++) {
                mixCol(F, i, orientRgb(P.code[i]), k);
                if (cur >= 0 && cur < 12) {
                    if (P.code[i] === cur) { F.anim[i * 4 + 3] = 0.9 * spot; mixCol(F, i, WHITE, 0.15 * spot); }
                    else dimCol(F, i, 0.45 * spot);
                }
            }
            if (cur >= 0 && cur < 12) {
                F.stat = `direction ${(cur % 6) * 60}°${cur >= 6 ? ', flipped' : ', face-up'}: ${fmt(orientCount[cur])} hats (${(100 * orientCount[cur] / n).toFixed(1)}%)`;
            }
            const legendA = k;
            F.over.push(ov => {
                const c = ov.ctx;
                const s = Math.min(46, ov.W / 16), pad = 16;
                const x0 = ov.W - pad - 6 * s, y0 = pad + 6;
                for (let code = 0; code < 12; code++) {
                    const col = code % 6, row = code < 6 ? 0 : 1;
                    const cx = x0 + (col + 0.5) * s, cy = y0 + (row + 0.5) * s;
                    const r = (code % 6) * PI / 3, f = code >= 6 ? -1 : 1;
                    const sc = s / 7.5;
                    const hl = code === cur ? spot : 0;
                    c.beginPath();
                    HAT14.forEach((p, j) => {
                        const q = psub(p, HAT_CENTROID);
                        const x = q.x, y = q.y * f;
                        const X = cx + sc * (cos(r) * x - sin(r) * y) * (1 + 0.25 * hl);
                        const Y = cy - sc * (sin(r) * x + cos(r) * y) * (1 + 0.25 * hl);
                        j ? c.lineTo(X, Y) : c.moveTo(X, Y);
                    });
                    c.closePath();
                    c.fillStyle = cssRgb(orientRgb(code), legendA * (cur >= 0 && cur < 12 && code !== cur ? lerp(1, 0.45, spot) : 1));
                    c.fill();
                    if (hl > 0.05) { c.lineWidth = 2; c.strokeStyle = cssRgb(F.pal.ink, hl * legendA); c.stroke(); }
                }
            });
        }
    });

    // 5 ─ Local connections ───────────────────────────────────
    {
        const legalT = P.pairs.map(p => ({ T: mul(Tc, p.rel), refl: p.refl }));
        const deadT = P.fits.filter(f => !f.legal).map(f => ({ T: mul(Tc, f.rel), refl: f.refl }));
        const slots = new Map();
        const cor = P.coronas.map(c => c.rels.map((r, m) => {
            const k = relKey(r);
            if (!slots.has(k)) slots.set(k, mul(Tc, r));
            return { k, label: c.labels[m] };
        }));
        const A0 = 2.6, stepA = Math.min(0.44, 11 / Math.max(1, legal));
        const B0 = 14.4, stepB = Math.min(0.62, 7.8 / Math.max(1, dead));
        const C0 = 24, stepC = Math.min(0.6, 11 / Math.max(1, nCor));
        const hatC = transPt(Tc, HAT_CENTROID);
        chapters.push({
            id: 'connections', title: 'Local connections', dur: 38,
            text: F => F.t < B0 - 0.3
                ? `Which neighbours are possible? A hat sharing an edge with this one can sit in exactly ${legal} positions; in ${legalFlip} of them it is flipped.`
                : F.t < C0 - 0.3
                    ? `Another ${dead} placements (red) fit snugly on the grid but never occur in any hat tiling: each one eventually paints itself into a corner.`
                    : `Surround a hat completely and only ${nCor} different neighbourhoods are possible, counting rotations and reflections as the same.`,
            frame(F) {
                const t = F.t;
                const away = smooth(0.3, 2.2, t) * (1 - smooth(35, 37.6, t));
                for (let i = 0; i < n; i++) if (i !== C) F.col[i * 4 + 3] = 1 - away;
                F.cam.x = lerp(F.home.x, hatC.x, away);
                F.cam.y = lerp(F.home.y, hatC.y, away);
                F.cam.span = Math.exp(lerp(Math.log(F.home.span), Math.log(17), away));
                const ghosts = [];
                // Phase A: the legal edge-to-edge neighbours, one at a time.
                const fadeAB = 1 - smooth(C0 - 0.8, C0 - 0.1, t);
                legalT.forEach((g, i) => {
                    const s = A0 + i * stepA, age = t - s;
                    if (age < 0) return;
                    const rgb = g.refl ? ORANGE : TEAL;
                    if (age < stepA) {
                        const e = easeOutBack(age / 0.22);
                        F.extras.push({ T: g.T, rgb, a: smooth(0, 0.12, age), s: lerp(1.3, 1, clamp01(e)), l: 0.8 });
                    } else {
                        const a = (t < B0 ? 0.16 : 0.07) * fadeAB;
                        F.extras.push({ T: g.T, rgb, a, s: 1, l: 0 });
                        ghosts.push({ T: g.T, rgb, a: (t < B0 ? 0.6 : 0.35) * fadeAB, dash: false });
                    }
                });
                // Phase B: placements that fit but never occur.
                deadT.forEach((g, i) => {
                    const s = B0 + i * stepB, age = t - s;
                    if (age < 0) return;
                    if (age < stepB) {
                        const e = easeOutBack(age / 0.22);
                        F.extras.push({ T: g.T, rgb: CORAL, a: smooth(0, 0.12, age), s: lerp(1.3, 1, clamp01(e)), l: 0.8, cross: true });
                    } else {
                        F.extras.push({ T: g.T, rgb: CORAL, a: 0.12 * fadeAB, s: 1, l: 0 });
                        ghosts.push({ T: g.T, rgb: CORAL, a: 0.7 * fadeAB, dash: true });
                    }
                });
                // Phase C: complete neighbourhoods, morphing one into the next.
                const x = (t - C0) / stepC, k = Math.floor(x), a = (x - k) * stepC;
                const cOut = 1 - smooth(34.8, 35.6, t);
                if (k >= 0 && k < nCor + 1) {
                    const cur = k < nCor ? cor[k] : [], prev = k > 0 ? cor[k - 1] : [];
                    const curK = new Map(cur.map(e => [e.k, e.label])), prevK = new Map(prev.map(e => [e.k, e.label]));
                    for (const [key, T] of slots) {
                        const inC = curK.has(key), inP = prevK.has(key);
                        if (!inC && !inP) continue;
                        const lab = inC ? curK.get(key) : prevK.get(key);
                        let al = 1, sc = 1;
                        if (inC && !inP) { al = smooth(0, 0.12, a); sc = lerp(1.25, 1, clamp01(easeOutBack(a / 0.2))); }
                        if (!inC && inP) { al = 1 - smooth(0, 0.1, a); sc = lerp(1, 0.7, smooth(0, 0.1, a)); }
                        F.extras.push({ T, rgb: F.pal.byLabel[lab], a: al * cOut, s: sc, l: 0.35 * al });
                    }
                    if (k < nCor) F.stat = `neighbourhood ${k + 1} of ${nCor} · found around ${fmt(P.coronas[k].count)} hats in this patch`;
                } else if (t >= A0 && t < B0) {
                    F.stat = `edge-to-edge neighbour ${Math.min(legal, Math.floor((t - A0) / stepA) + 1)} of ${legal}`;
                } else if (t >= B0 && t < C0) {
                    F.stat = `dead end ${Math.min(dead, Math.floor((t - B0) / stepB) + 1)} of ${dead} · ${legal} legal, ${dead} impossible`;
                }
                const gridA = 0.28 * away * (1 - smooth(33, 35, t));
                F.under.push(ov => drawKiteGrid(ov, Tc, 9, gridA, F.pal.ink));
                F.over.push(ov => {
                    const c = ov.ctx;
                    if (away > 0.05) {
                        tracePoly(ov, hatPts(Tc));
                        c.lineJoin = 'round';
                        c.lineWidth = 2.5;
                        c.strokeStyle = cssRgb(F.pal.gold, 0.9 * away);
                        c.stroke();
                    }
                    for (const g of ghosts) {
                        if (g.a < 0.01) continue;
                        tracePoly(ov, hatPts(g.T));
                        c.setLineDash(g.dash ? [4, 4] : []);
                        c.lineWidth = 1.4;
                        c.strokeStyle = cssRgb(g.rgb, g.a);
                        c.stroke();
                    }
                    c.setLineDash([]);
                    for (const e of F.extras) {
                        if (!e.cross || e.a < 0.05) continue;
                        const m = transPt(e.T, HAT_CENTROID), s = ov.toS(m.x, m.y), r = 7;
                        c.lineWidth = 3; c.strokeStyle = cssRgb(WHITE, e.a);
                        c.beginPath(); c.moveTo(s.x - r, s.y - r); c.lineTo(s.x + r, s.y + r);
                        c.moveTo(s.x + r, s.y - r); c.lineTo(s.x - r, s.y + r); c.stroke();
                    }
                });
            }
        });
    }

    // 6 ─ Every neighbourhood recurs ──────────────────────────
    {
        const interior = P.coronaType.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0);
        const picks = [0, 3, 7, 11, 15, nCor - 1].filter((v, i, a) => v >= 0 && v < nCor && a.indexOf(v) === i);
        chapters.push({
            id: 'recur', title: 'Every neighbourhood recurs', dur: 17,
            text: `Now colour every hat by its neighbourhood. Each of the ${nCor} kinds keeps coming back all over the plane, each with its own fixed frequency, yet they never settle into a repeating lattice.`,
            frame(F) {
                const t = F.t, k = envelope(t, 17, 2, 2);
                const slot = (t - 3) / 1.9, cur = Math.floor(slot);
                const on = cur >= 0 && cur < picks.length;
                const spot = on ? smooth(0, 0.25, slot - cur) * (1 - smooth(0.85, 1, slot - cur)) : 0;
                const type = on ? picks[cur] : -2;
                for (let i = 0; i < n; i++) {
                    const ct = P.coronaType[i];
                    mixCol(F, i, coronaRgb(ct), k);
                    if (ct < 0) dimCol(F, i, 0.5 * k);
                    if (on) {
                        if (ct === type) { F.anim[i * 4 + 3] = spot; mixCol(F, i, WHITE, 0.2 * spot); }
                        else dimCol(F, i, 0.5 * spot);
                    }
                }
                F.cam.span = lerp(F.home.span, 46, k);
                if (on) F.stat = `neighbourhood ${type + 1}: ${fmt(P.coronas[type].count)} hats, about 1 in ${Math.round(interior / P.coronas[type].count)}`;
            }
        });
    }

    // 7 ─ No period ───────────────────────────────────────────
    {
        const shifts = [];
        for (const s of P.nearPeriods) if (!shifts.length || s.frac > shifts[shifts.length - 1].frac) shifts.push(s);
        const use = shifts.slice(0, 5);
        const occ = new Set();
        const hk = (x, y, code) => latKey(x, y) * 12 + code;
        for (let i = 0; i < n; i++) occ.add(hk(P.hats[i].T[2], P.hats[i].T[5], P.code[i]));
        const match = use.map(s => {
            const m = new Uint8Array(n);
            for (let i = 0; i < n; i++) m[i] = occ.has(hk(P.hats[i].T[2] - s.vx, P.hats[i].T[5] - s.vy, P.code[i])) ? 1 : 0;
            return m;
        });
        const T0 = 1.6, seg = 3.7, move = 1.3;
        const pcts = use.map(s => Math.round(s.frac * 100) + '%').join(', ');
        chapters.push({
            id: 'noperiod', title: 'No period', dur: 22,
            text: `Slide a copy of the tiling across itself. Longer shifts line up more and more of it (${pcts}), but no shift ever lines up everything. No translation maps the tiling onto itself: it is aperiodic.`,
            frame(F) {
                const t = F.t;
                const x = (t - T0) / seg, k = Math.min(use.length - 1, Math.floor(x));
                let ox = 0, oy = 0, hl = 0, cur = -1;
                if (x >= 0) {
                    const a = (t - T0) - k * seg;
                    const from = k > 0 ? use[k - 1] : { vx: 0, vy: 0 };
                    const e = smooth(0, move, a);
                    ox = lerp(from.vx, use[k].vx, e); oy = lerp(from.vy, use[k].vy, e);
                    cur = k;
                    hl = smooth(move, move + 0.35, a) * (1 - smooth(seg - 0.25, seg, a));
                    if (k === use.length - 1) hl = smooth(move, move + 0.35, a) * (1 - smooth(20, 21, t));
                }
                const gA = smooth(0.3, 1.4, t) * (1 - smooth(20.4, 21.6, t));
                F.ghost = { dx: ox, dy: oy, rgba: [...F.pal.ink, 0.55 * gA] };
                const k2 = envelope(t, 22, 1.2, 1.5);
                for (let i = 0; i < n; i++) {
                    if (cur >= 0 && match[cur][i]) { mixCol(F, i, GOLD, 0.75 * hl); F.anim[i * 4 + 3] = 0.45 * hl; }
                    else dimCol(F, i, 0.35 * k2 + 0.35 * hl);
                }
                F.cam.span = lerp(F.home.span, 52, k2);
                F.cam.rot = 0;
                if (cur >= 0 && hl > 0.2) F.stat = `shift ≈ ${(use[cur].len / 3).toFixed(1)} hat-widths → ${(use[cur].frac * 100).toFixed(1)}% of hats line up`;
                else if (cur >= 0) F.stat = 'sliding…';
            }
        });
    }

    // 8 ─ Supertiles ──────────────────────────────────────────
    {
        const stages = [1, 2, 3, 4];
        const stageT = [0, 5.5, 11, 16.5];
        const centreOf = (k, h) => { const s = P.levels[k][P.hats[h].anc[k]]; return s; };
        const spansFor = F => [40, 72, 140, fitSpan(F.W, F.H, rootBox.w, rootBox.h, 1.15)];
        const sizeAt = k => rootBox.w / Math.pow(2.618, L - k);   // typical level-k extent
        const countKinds = k => {
            const c = { H: 0, T: 0, P: 0, F: 0 };
            for (const s of P.levels[k]) c[s.kind]++;
            return c;
        };
        const kindCounts = [null, 1, 2, 3, 4, 5].map(k => k ? countKinds(k) : null);
        chapters.push({
            id: 'supertiles', title: 'Supertiles', dur: 28,
            text: F => F.t < 21.5
                ? 'Hats cluster into four metatiles, H, T, P and F. These fit together like tiles themselves, grouping into larger H, T, P and F supertiles, which group again, and again, forever. This hierarchy is what forces the tiling to be aperiodic.'
                : `This whole patch of ${fmt(n)} hats is one single level-${L} H supertile.`,
            frame(F) {
                const t = F.t;
                let si = 0;
                for (let s = 0; s < stages.length; s++) if (t >= stageT[s]) si = s;
                const lvl = stages[si], a = t - stageT[si];
                const prevLvl = si > 0 ? stages[si - 1] : 0;
                const mixK = smooth(0, 1.4, a);
                const colorOn = smooth(0, 1.5, t) * (1 - smooth(22, 25, t));
                const burst = 0.14 * smooth(1.6, 2.8, a) * (1 - smooth(3.4, 4.8, a)) * (1 - smooth(21.5, 22, t));
                for (let i = 0; i < n; i++) {
                    const cur = centreOf(lvl, i);
                    const kc = KIND_RGB[cur.kind];
                    if (prevLvl) {
                        const pk = KIND_RGB[centreOf(prevLvl, i).kind];
                        mixCol(F, i, [lerp(pk[0], kc[0], mixK), lerp(pk[1], kc[1], mixK), lerp(pk[2], kc[2], mixK)], colorOn * 0.85);
                    } else mixCol(F, i, kc, colorOn * 0.85 * mixK);
                    if (burst > 0) {
                        const up = lvl < L ? centreOf(lvl + 1, i) : root;
                        F.off[i * 2] = (cur.cx - up.cx) * burst;
                        F.off[i * 2 + 1] = (cur.cy - up.cy) * burst;
                    }
                }
                const zi = smooth(0, 3.5, a);
                const spans = spansFor(F);
                const s0 = si > 0 ? spans[si - 1] : F.home.span, s1 = spans[si];
                const span = Math.exp(lerp(Math.log(s0), Math.log(s1), zi));
                const toRoot = clamp01((Math.log(span) - Math.log(F.home.span)) / (Math.log(spans[3]) - Math.log(F.home.span)));
                F.cam.span = span;
                F.cam.x = lerp(F.home.x, rootBox.cx, toRoot);
                F.cam.y = lerp(F.home.y, rootBox.cy, toRoot);
                const kc = kindCounts[lvl];
                F.stat = t < 21.5
                    ? `level ${lvl}: ${fmt(P.levels[lvl].length)} supertiles · ${kc.H} H, ${kc.T} T, ${kc.P} P, ${kc.F} F`
                    : `level ${L}: 1 H supertile · ${fmt(n)} hats`;
                const outA = smooth(0.4, 1.6, t);
                F.over.push(ov => {
                    const c = ov.ctx;
                    c.lineJoin = 'round';
                    for (let k = 1; k <= Math.min(L, lvl + (t > 21 ? 1 : 0)); k++) {
                        const fresh = k === lvl ? smooth(0.3, 1.5, a) : 1;
                        const isTop = k === lvl || (k === L && t > 21);
                        const tiny = smooth(5, 18, sizeAt(k) * ov.scale);
                        const alpha = tiny * outA * fresh * (isTop ? 0.95 : 0.38) * (k === L && t > 21 ? smooth(21, 22.5, t) : 1);
                        if (alpha < 0.02) continue;
                        const wpx = 0.8 + 0.55 * (k - 1) * (k === lvl ? 1 : 0.75);
                        c.lineWidth = wpx;
                        c.strokeStyle = cssRgb(F.pal.ink, alpha);
                        const burstK = k === lvl ? burst : 0;
                        for (const s of P.levels[k]) {
                            let pts = s.shape;
                            if (burstK > 0) {
                                const up = k < L ? P.levels[k + 1][s.parent] : root;
                                const dx = (s.cx - up.cx) * burstK, dy = (s.cy - up.cy) * burstK;
                                pts = pts.map(p => pt(p.x + dx, p.y + dy));
                            }
                            if (!ov.visible(pts)) continue;
                            tracePoly(ov, pts);
                            c.stroke();
                        }
                    }
                    // Kind letters on the current level.
                    const la = 0.85 * outA * smooth(0.6, 1.8, a) * (1 - smooth(20.5, 21.5, t));
                    if (la > 0.02) {
                        c.textAlign = 'center'; c.textBaseline = 'middle';
                        for (const s of P.levels[lvl]) {
                            const box = polyBox(s.shape);
                            const px = Math.min(box.w, box.h) * ov.scale;
                            if (px < 30 || !ov.visible(s.shape)) continue;
                            const fs = Math.min(64, px * 0.32);
                            const up = lvl < L ? P.levels[lvl + 1][s.parent] : root;
                            const sp = ov.toS(s.cx + (s.cx - up.cx) * burst, s.cy + (s.cy - up.cy) * burst);
                            c.font = `700 ${fs.toFixed(0)}px Inter, system-ui, sans-serif`;
                            c.lineWidth = Math.max(2, fs / 8);
                            c.strokeStyle = cssRgb(F.pal.bg, 0.8 * la);
                            c.strokeText(s.kind, sp.x, sp.y);
                            c.fillStyle = cssRgb(WHITE, la);
                            c.fillText(s.kind, sp.x, sp.y);
                        }
                    }
                });
            }
        });
    }

    // 9 ─ Fibonacci squares ───────────────────────────────────
    {
        const chainS = P.chain.map((id, i) => P.levels[L - i][id]);   // level L … 1
        const Th = P.hats[P.chainHat].T;
        const hatBox = polyBox(hatPts(Th));
        const views = chainS.map(s => ({ box: polyBox(s.shape), count: s.hats.length, set: new Set(s.hats) }));
        views.push({ box: hatBox, count: 1, set: new Set([P.chainHat]) });
        const levelOf = j => L - j;      // views[j] is level L - j
        const step = 2.7, Z0 = 1.2, Zn = views.length - 1;
        chapters.push({
            id: 'fibonacci', title: 'Fibonacci squares', dur: 19,
            text: `Zoom into nested H supertiles. They hold ${views.map(v => fmt(v.count)).join(', ')} hats: the squares of ${views.map(v => Math.round(sqrt(v.count))).join(', ')}, every other Fibonacci number. Each level is φ⁴ ≈ 6.854 times the size of the one inside it.`,
            frame(F) {
                const t = F.t;
                const x = clamp01((t - Z0) / (step * Zn)) * Zn;
                const j = Math.min(Zn - 1, Math.floor(x)), f = smooth(0.45, 1, x - j);
                const lam = j + f;             // 0 = root … Zn = single hat
                const v0 = views[j], v1 = views[Math.min(Zn, j + 1)];
                const spanOf = v => v === views[Zn] ? 10 : fitSpan(F.W, F.H, v.box.w, v.box.h, 1.15);
                F.cam.span = Math.exp(lerp(Math.log(spanOf(v0)), Math.log(spanOf(v1)), f));
                const hatC = transPt(Th, HAT_CENTROID);
                const c0 = v0 === views[Zn] ? hatC : pt(v0.box.cx, v0.box.cy);
                const c1 = v1 === views[Zn] ? hatC : pt(v1.box.cx, v1.box.cy);
                F.cam.x = lerp(c0.x, c1.x, f); F.cam.y = lerp(c0.y, c1.y, f);
                const focus = Math.round(lam);
                const fv = views[focus];
                const k = smooth(0.2, 1.2, t) * (1 - smooth(Z0 + step * Zn + 0.4, Z0 + step * Zn + 1.8, t));
                for (let i = 0; i < n; i++) if (!fv.set.has(i)) dimCol(F, i, 0.62 * k);
                const lvl = levelOf(focus);
                const r = Math.round(sqrt(fv.count));
                F.stat = lvl > 0 ? `level-${lvl} H supertile: ${fmt(fv.count)} = ${r}² hats` : 'one hat: 1 = 1²';
                F.over.push(ov => {
                    const c = ov.ctx;
                    c.lineJoin = 'round';
                    for (let m = 0; m < Zn; m++) {
                        const near = 1 - Math.min(1, Math.abs(m - lam) / 1.2);
                        const a = k * (m === focus ? 0.95 : 0.2 + 0.5 * near);
                        if (a < 0.03) continue;
                        tracePoly(ov, chainS[m].shape);
                        c.lineWidth = m === focus ? 3 : 1.5;
                        c.strokeStyle = cssRgb(m === focus ? F.pal.gold : F.pal.ink, a);
                        c.stroke();
                    }
                });
            }
        });
    }

    // 10 ─ A family of monotiles ──────────────────────────────
    {
        const keys = [[0, 60], [3, 60], [6, 45], [9.6, 45], [12.6, 30], [16.2, 30], [19.6, 8], [21.4, 8], [25.4, 82], [27.2, 82], [30.4, 60], [32, 60]];
        const phiAt = t => {
            for (let i = 0; i < keys.length - 1; i++) {
                const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
                if (t <= t1) return lerp(p0, p1, smooth(t0, t1, t));
            }
            return 60;
        };
        const names = [
            [60, 'Tile(1, √3): the hat.'],
            [45, 'Tile(1, 1) tiles periodically if flips are allowed, but only aperiodically if they are forbidden. Curve its edges and you get the Spectre, which needs no flips at all.'],
            [30, 'Tile(√3, 1): the turtle, another aperiodic monotile.'],
            [8, 'Heading to Tile(1, 0), the comet, which can tile periodically.'],
            [82, 'Heading to Tile(0, 1), the chevron, which can tile periodically.']
        ];
        const shapeOf = phi => {
            const a = cos(phi * PI / 180), b = sin(phi * PI / 180);
            let al = a, be = b / sqrt(3);
            const s = sqrt(HAT_AREA / Math.abs(polyArea(tileShape(al, be))));
            return { a, b, alpha: al * s, beta: be * s };
        };
        chapters.push({
            id: 'family', title: 'A family of monotiles', dur: 32,
            text: F => {
                const phi = phiAt(F.t);
                const near = names.find(([p]) => Math.abs(p - phi) < 3);
                return 'Stretch every edge of length 1 to a, and every edge of length √3 to b. The same pattern survives for each shape Tile(a, b), and whenever a ≠ b are both positive the shape is itself an aperiodic monotile. ' + (near ? near[1] : '');
            },
            frame(F) {
                const t = F.t, phi = phiAt(t), sh = shapeOf(phi);
                F.morph = { alpha: sh.alpha, beta: sh.beta };
                const lin = [Tc[0], Tc[1], 0, Tc[3], Tc[4], 0];
                const cc = transPt(lin, polyCentroid(tileShape(sh.alpha, sh.beta)));
                const from = transPt(P.hats[P.chainHat].T, HAT_CENTROID), go = smooth(0.2, 3, t);
                F.cam.x = lerp(from.x, Tc[2] + cc.x, go); F.cam.y = lerp(from.y, Tc[5] + cc.y, go);
                F.cam.span = t < 3 ? Math.exp(lerp(Math.log(10), Math.log(28), smooth(0, 3, t)))
                    : Math.exp(lerp(Math.log(28), Math.log(F.home.span), smooth(29.5, 32, t)));
                const m = Math.min(sh.a, sh.b);
                F.stat = m < 0.2
                    ? `Tile(${sh.a.toFixed(2)}, ${sh.b.toFixed(2)})`
                    : `Tile(a, b) with a : b = ${(sh.a / m).toFixed(3)} : ${(sh.b / m).toFixed(3)}`;
                const panelA = smooth(1, 2.5, t) * (1 - smooth(30, 31.5, t));
                F.over.push(ov => drawShapePanel(ov, F, sh, phi, panelA));
            }
        });
    }

    // 11 ─ …and back to one ───────────────────────────────────
    chapters.push({
        id: 'shrink', title: '…and back to one', dur: 14,
        text: 'Every finite patch of the tiling turns up again and again all over the plane, yet no two hats have identical surroundings out to every distance: order without repetition.',
        frame(F) {
            const t = F.t;
            const R = 58 * Math.pow(1.4 / 58, smooth(0.8, 11.5, t));
            let left = 0;
            for (let i = 0; i < n; i++) {
                if (i === C) { left++; continue; }
                const p = clamp01((P.dist[i] - R) / Math.max(1.3, Math.min(3.5, 0.3 * R)));
                const o = i * 4;
                if (p >= 1) { F.col[o + 3] = 0; continue; }
                if (p < 0.5) left++;
                F.col[o + 3] = 1 - smooth(0.4, 1, p);
                F.anim[o] = lerp(1, 0.35, p);
                F.anim[o + 1] = p * (hash01(i) - 0.5) * 2.4;
                F.anim[o + 3] = p * 1.4;
                mixCol(F, i, WHITE, p * 0.4);
            }
            F.cam.span = Math.max(10, Math.min(F.home.span, 2.7 * R));
            F.stat = `${fmt(left)} hats`;
        }
    });

    let start = 0;
    for (const ch of chapters) { ch.start = start; start += ch.dur; }
    return { chapters, total: start };
}

// The Tile(a, b) inset: the single tile with its two edge classes, and a dial.
function drawShapePanel(ov, F, sh, phi, alpha) {
    if (alpha < 0.02) return;
    const c = ov.ctx;
    const w = Math.min(210, ov.W * 0.42), h = w * 0.82, pad = 16;
    const x0 = ov.W - w - pad, y0 = pad;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = cssRgb(F.pal.panel, 0.9);
    c.strokeStyle = cssRgb(F.pal.ink, 0.18);
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect ? c.roundRect(x0, y0, w, h, 12) : c.rect(x0, y0, w, h);
    c.fill(); c.stroke();
    // Tile outline, fitted to the upper part of the panel.
    const S = tileShape(sh.alpha, sh.beta);
    const box = polyBox(S);
    const sc = Math.min((w - 36) / box.w, (h * 0.62) / box.h);
    const ox = x0 + w / 2 - box.cx * sc, oy = y0 + 12 + h * 0.31 + box.cy * sc;
    c.beginPath();
    S.forEach((p, i) => i ? c.lineTo(ox + p.x * sc, oy - p.y * sc) : c.moveTo(ox + p.x * sc, oy - p.y * sc));
    c.closePath();
    c.fillStyle = cssRgb(F.pal.byLabel[1], 0.9);
    c.fill();
    c.lineCap = 'round';
    c.lineWidth = 3;
    for (let e = 0; e < 14; e++) {
        const p = S[e], q = S[(e + 1) % 14];
        c.strokeStyle = cssRgb(HAT_EDGE_UNIT[e] ? F.pal.gold : F.pal.cyan, 1);
        c.beginPath(); c.moveTo(ox + p.x * sc, oy - p.y * sc); c.lineTo(ox + q.x * sc, oy - q.y * sc); c.stroke();
    }
    // Dial: φ from 0° (comet) to 90° (chevron), marks at the named tiles.
    const dy = y0 + h - 22, dx0 = x0 + 18, dx1 = x0 + w - 18;
    const X = p => lerp(dx0, dx1, p / 90);
    c.lineWidth = 2;
    c.strokeStyle = cssRgb(F.pal.ink, 0.35);
    c.beginPath(); c.moveTo(dx0, dy); c.lineTo(dx1, dy); c.stroke();
    c.font = '600 10px Inter, system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (const [p, lab] of [[0, 'comet'], [30, 'turtle'], [45, '(1,1)'], [60, 'hat'], [90, 'chevron']]) {
        c.fillStyle = cssRgb(F.pal.ink, Math.abs(p - phi) < 3 ? 1 : 0.55);
        c.beginPath(); c.arc(X(p), dy, 3, 0, TAU); c.fill();
        c.fillText(lab, X(p), dy + 6);
    }
    c.fillStyle = cssRgb(F.pal.gold, 1);
    c.beginPath(); c.arc(X(phi), dy, 6, 0, TAU); c.fill();
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.font = '600 11px Inter, system-ui, sans-serif';
    c.fillStyle = cssRgb(F.pal.gold, 1); c.fillText('a', x0 + 12, y0 + 10);
    c.fillStyle = cssRgb(F.pal.cyan, 1); c.fillText('b', x0 + 24, y0 + 10);
    c.restore();
}
