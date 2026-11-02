/**
 * Canvas drawings of the finite piece of the tree produced by treeGeneration.js,
 * in two models (the 3D tower lives in tower.js):
 *
 *   half-plane  levels k increase downward, towards the ends in K_𝔭; the ray at
 *               the top runs to the end ∞, and the faint horizontal guides are
 *               the horocycles about ∞ (one per level).
 *   disk        the Poincaré disk centred on the base vertex v: its q+1
 *               neighbours surround it, radius depends only on the distance to
 *               it, and edges are hyperbolic geodesics running out to the ends.
 *
 * Each branch is tinted by the direction it heads in, and lines and vertices
 * thin out towards the ends. The picture depends only on the orbit, not on the
 * current element W, so it is the same before and after an isometry.
 *
 * animateTo() shows an isometry h at work: every drawn vertex x glides to where
 * h·x is drawn while the axis (or fixed set) of h lights up, and the tree lands
 * back on the same picture with the copy W·v and its cell moved.
 *
 * Labels are LaTeX, typeset by MathJax in an HTML layer over the canvas.
 */
import { computeConvexHull } from './convexHull.js';
import { computeVoronoiCell } from './voronoiCell.js';

const BASE_Y = 120;           // first level gap of the half-plane
const SHRINK_Y = 0.85;        // level gaps shrink with depth
const VERTEX_SHRINK = 0.88;   // and so do vertices and lines
const depthToY = (depth) => BASE_Y * (1 - Math.pow(SHRINK_Y, depth)) / (1 - SHRINK_Y);
const yToDepth = (y) => {
    const u = 1 - y * (1 - SHRINK_Y) / BASE_Y;
    return u <= 1e-6 ? 60 : Math.log(u) / Math.log(SHRINK_Y);
};
const DISK_R = 340;           // pixel radius of the disk
const DISK_RIM = 0.93;        // the farthest vertex lands here, as a fraction of the radius

// vertex radii (scene px at full scale) and their floors
const DOT_R = { plain: 3.4, hull: 4.2, orbit: 6, image: 6, base: 8, current: 8.5 };
const DOT_MIN = { plain: 0, hull: 1.3, orbit: 2.6, image: 2.6, base: 4.2, current: 4.6 };
const EDGE_W = 1.7, HULL_W = 3.4, CELL_W = 12, RAT_W = 9;

const TIMING = { move: [0, 0.92], settle: [0.74, 1] };

// ───────────────────────── state ─────────────────────────

const S = {
    canvas: null, ctx: null, tip: null,
    dpr: 1, w: 0, h: 0,
    zoom: null, t: null,            // d3 zoom behaviour and its transform
    scene: null,                    // the picture at rest
    anim: null,                     // the running animation
    queue: [],                      // isometries applied while one is running
    glow: null,                     // the axis of the last isometry, fading out
    userMoved: false,
    lastModel: null,
    hoverId: null,
    pal: null, palLight: null,
};

const reducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

export function resetZoom() {
    S.userMoved = false;
    if (S.scene) fitToView(S.scene, true);
}

/** Redraw at rest (after a theme change). */
export function redraw() {
    if (S.scene && !S.anim) paintStatic();
}

export function isAnimating() { return !!S.anim; }

/** For checking the motion frame by frame: hold the running animation at fraction t (returns ms to paint). */
export function seekAnimation(t) {
    const job = S.anim;
    if (!job) return null;
    cancelAnimationFrame(job.raf);
    const t0 = performance.now();
    paint(frameAt(job, t));
    return performance.now() - t0;
}

function ensureCanvas() {
    if (S.canvas) return;
    const canvas = document.getElementById('tree-vis');
    S.canvas = canvas;
    S.ctx = canvas.getContext('2d');
    S.t = d3.zoomIdentity;
    S.zoom = d3.zoom().scaleExtent([0.02, 14])
        .filter((ev) => (!ev.ctrlKey || ev.type === 'wheel') && !ev.button)
        .on('zoom', (ev) => {
            S.t = ev.transform;
            if (ev.sourceEvent) S.userMoved = true;
            if (!S.anim) paintStatic();
        });
    d3.select(canvas).call(S.zoom).on('dblclick.zoom', null);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('dblclick', onDblClick);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => setHover(null));
    S.tip = document.getElementById('tree-tip');
    S.labels = document.getElementById('tree-labels');
}

function resize() {
    const c = document.getElementById('container');
    const w = c.clientWidth, h = c.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w === S.w && h === S.h && dpr === S.dpr) return;
    S.w = w; S.h = h; S.dpr = dpr;
    S.canvas.width = Math.max(1, Math.round(w * dpr));
    S.canvas.height = Math.max(1, Math.round(h * dpr));
    S.canvas.style.width = `${w}px`;
    S.canvas.style.height = `${h}px`;
}

function availableRect() {
    const container = document.getElementById('container');
    const W = container.clientWidth, H = container.clientHeight;
    const panel = document.getElementById('control-panel');
    let right = W;
    if (panel && !panel.classList.contains('collapsed')) {
        const r = panel.getBoundingClientRect(), c = container.getBoundingClientRect();
        if (r.left - c.left > W * 0.45) right = r.left - c.left - 12;
    }
    return { x0: 70, y0: 56, x1: Math.max(right, 200), y1: H - 84, W, H };
}

function fitTransform(sc) {
    const b = sc.bounds;
    const A = availableRect();
    const bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
    const s = Math.min((A.x1 - A.x0) / bw, (A.y1 - A.y0) / bh, 2.2);
    const tx = (A.x0 + A.x1) / 2 - s * (b.x0 + b.x1) / 2;
    const ty = sc.model === 'disk'
        ? (A.y0 + A.y1) / 2 - s * (b.y0 + b.y1) / 2
        : A.y0 - s * b.y0 + Math.max(0, ((A.y1 - A.y0) - s * bh) / 3);
    return d3.zoomIdentity.translate(tx, ty).scale(s);
}

function fitToView(sc, animate) {
    const t = fitTransform(sc);
    const sel = d3.select(S.canvas);
    if (animate) sel.transition().duration(650).ease(d3.easeCubicInOut).call(S.zoom.transform, t);
    else sel.call(S.zoom.transform, t);
}

/**
 * The hierarchy with its hull and Dirichlet cell, shared by every model. The
 * cell is that of `cellId` (the current copy W·v, or v itself) against the
 * orbit; W·v counts as an orbit point even when its word is longer than the
 * orbit's word length. A one-point orbit (a group fixing v) has the whole tree
 * as its cell, which says nothing, so then no cell is drawn.
 */
export function analyzeTree(tree, orbitIds, cellId) {
    const root = d3.hierarchy(tree.root, (d) => d.children);
    const hull = computeConvexHull(orbitIds, root);
    const cellOrbit = orbitIds.has(cellId) ? orbitIds : new Set([...orbitIds, cellId]);
    const voronoi = cellOrbit.size > 1 ? computeVoronoiCell(cellOrbit, cellId, root)
        : { vertices: new Set(), fullEdges: new Set(), partialEdges: new Map() };
    return { root, hull, voronoi };
}

// ───────────────────────── colours ─────────────────────────

function oklchToRgb(L, C, h) {
    const hr = h * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const lin = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
    return lin.map((c) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
        return Math.round(255 * Math.min(1, Math.max(0, v)));
    });
}
const rgbStr = ([r, g, b]) => `rgb(${r},${g},${b})`;

const HUES = 48;
/** The branch colours: cyan → periwinkle → violet and back, around the circle of ends. */
const hueOf = (u) => 202 + 104 * (0.5 - 0.5 * Math.cos(2 * Math.PI * u));

function palette() {
    const light = document.documentElement.classList.contains('light');
    if (S.pal && S.palLight === light) return S.pal;
    const ramp = (L, C) => Array.from({ length: HUES }, (_, i) => rgbStr(oklchToRgb(L, C, hueOf(i / HUES))));
    S.pal = light ? {
        light,
        edge: ramp(0.6, 0.12), plain: ramp(0.55, 0.13), hull: ramp(0.44, 0.15), hullDot: ramp(0.4, 0.15),
        edgeAlpha: 0.78, hullAlpha: 0.85,
        orbit: '#d97706', orbitRing: '#ffffff', orbitHalo: 'rgba(217,119,6,0.16)',
        base: '#b45309', baseRing: '#7c2d12',
        current: '#db2777', currentRing: '#ffffff', currentHalo: 'rgba(219,39,119,0.18)',
        cell: 'rgba(236,72,153,0.2)', cellHalo: 'rgba(236,72,153,0.11)',
        axis: '#1e1b4b', axisGlow: 'rgba(79,70,229,0.16)',
        origin: '#b45309', select: '#0f172a',
        rat: 'rgba(51,65,85,0.13)',
        ink: '#171c2b', inkDim: '#545d75', inkFaint: '#8b93a8', halo: 'rgba(238,241,248,0.92)', linkPt: '#4338ca',
        guide: 'rgba(23,28,43,0.07)',
    } : {
        light,
        edge: ramp(0.76, 0.1), plain: ramp(0.82, 0.09), hull: ramp(0.9, 0.07), hullDot: ramp(0.93, 0.05),
        edgeAlpha: 0.82, hullAlpha: 0.9,
        orbit: '#fbbf24', orbitRing: '#05070f', orbitHalo: 'rgba(251,191,36,0.16)',
        base: '#fde68a', baseRing: '#ffffff',
        current: '#f472b6', currentRing: '#fdf2f8', currentHalo: 'rgba(244,114,182,0.24)',
        cell: 'rgba(244,114,182,0.3)', cellHalo: 'rgba(244,114,182,0.14)',
        axis: '#f8fafc', axisGlow: 'rgba(226,232,255,0.16)',
        origin: '#fbbf24', select: '#ffffff',
        rat: 'rgba(245,245,244,0.13)',
        ink: '#eef1f8', inkDim: '#9aa5bd', inkFaint: '#5e6880', halo: 'rgba(5,7,15,0.9)', linkPt: '#c7d2fe',
        guide: 'rgba(255,255,255,0.045)',
    };
    S.palLight = light;
    return S.pal;
}

// ───────────────────────── layouts ─────────────────────────

/** Rooted at the end ∞: the tidy tree, with the width and height fitted separately. */
function halfPlaneLayout(root) {
    d3.tree().nodeSize([1, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.5))(root);
    const A = availableRect();
    let ux0 = Infinity, ux1 = -Infinity;
    root.each((d) => { ux0 = Math.min(ux0, d.x); ux1 = Math.max(ux1, d.x); });
    const sx = Math.max(1.2, Math.min(24, (A.x1 - A.x0 - 60) / Math.max(ux1 - ux0, 1)));
    const yNatural = depthToY(root.height) + BASE_Y * 0.7;
    const sy = Math.max(0.3, Math.min(1, (A.y1 - A.y0) / yNatural));
    const dotScale = Math.max(0.4, Math.min(1, sx / 9));
    const pos = new Map();
    root.each((d) => pos.set(d, { x: (d.x - ux0) * sx, y: depthToY(d.depth) * sy }));
    const width = Math.max((ux1 - ux0) * sx, 1);
    const stepUp = BASE_Y * 0.55 * sy;
    return {
        pos,
        metrics: { model: 'halfplane', sy, dotScale, x0: 0, x1: width },
        /** Where an undrawn vertex goes: d steps beyond drawn `a` through its link point r (−1 = up). */
        beyond(a, r, d, q, up) {
            const p = pos.get(a.d);
            if (r < 0) return { x: p.x + 0.35 * sx * Math.max(0, d - up), y: p.y - stepUp * up };
            const off = ((r + 0.5) / q - 0.5) * sx * 0.9;
            return { x: p.x + off, y: depthToY(a.d.depth + d) * sy };
        },
        bounds: null,
        width, sx,
    };
}

/**
 * The Poincaré disk centred on the current copy. Each vertex gets an angular
 * wedge, split among its branches in proportion to their numbers of leaves;
 * radius is tanh of half the hyperbolic distance, scaled so the farthest vertex
 * sits at DISK_RIM. `turn` rotates the whole picture.
 */
function diskLayout(root, centerId, place) {
    const nodes = root.descendants();
    const adj = new Map(nodes.map((n) => [n, []]));
    for (const n of nodes) if (n.parent) { adj.get(n).push(n.parent); adj.get(n.parent).push(n); }
    const center = nodes.find((n) => n.data.id === centerId) || root;
    // breadth-first from the centre; branches in the order of the link P¹(F_q) (∞ first)
    const kids = new Map(), dist = new Map([[center, 0]]);
    const order = [center];
    for (let i = 0; i < order.length; i++) {
        const u = order[i];
        const next = adj.get(u).filter((w) => !dist.has(w));
        const key = (w) => { const lp = place.linkPoint(u.data.vt, w.data.vt); return lp === Infinity ? -1 : lp; };
        next.sort((a, b) => key(a) - key(b));
        for (const w of next) { dist.set(w, dist.get(u) + 1); order.push(w); }
        kids.set(u, next);
    }
    const leaves = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
        const u = order[i], ks = kids.get(u);
        leaves.set(u, ks.length ? ks.reduce((s, w) => s + leaves.get(w), 0) : 1);
    }
    let maxDist = 0;
    for (const d of dist.values()) maxDist = Math.max(maxDist, d);
    const step = 2 * Math.atanh(DISK_RIM) / Math.max(1, maxDist);
    const radius = (n) => DISK_R * Math.tanh(n * step / 2);
    const pos = new Map(), wedge = new Map();
    const place_ = (u, a0, a1) => {
        const r = radius(dist.get(u)), th = (a0 + a1) / 2;
        wedge.set(u, [a0, a1]);
        pos.set(u, dist.get(u) === 0 ? { x: 0, y: 0 } : { x: r * Math.cos(th), y: r * Math.sin(th) });
        const ks = kids.get(u);
        const total = ks.reduce((s, w) => s + leaves.get(w), 0);
        let a = a0;
        for (const w of ks) {
            const span = (a1 - a0) * leaves.get(w) / total;
            place_(w, a, a + span);
            a += span;
        }
    };
    const a0 = -Math.PI / 2;
    place_(center, a0, a0 + 2 * Math.PI);
    return {
        pos,
        dist,
        maxDist,
        radius,
        metrics: { model: 'disk' },
        beyond(a, r, d, q) {
            const [w0, w1] = wedge.get(a.d);
            const n = dist.get(a.d) + d;
            const rad = radius(n);
            const span = Math.min(w1 - w0, Math.PI / 2);
            const th = dist.get(a.d) === 0 && r < 0 ? a0
                : (w0 + w1) / 2 + ((r < 0 ? q : r) + 0.5 - (q + 1) / 2) / (q + 1) * span * 0.5;
            return { x: rad * Math.cos(th), y: rad * Math.sin(th) };
        },
        bounds: { x0: -DISK_R - 24, x1: DISK_R + 24, y0: -DISK_R - 24, y1: DISK_R + 24 },
    };
}

// ── metric helpers shared by both models ──

function scaleAt(m, p) {
    if (m.model === 'disk') {
        const r2 = (p.x * p.x + p.y * p.y) / (DISK_R * DISK_R);
        return Math.max(0.02, 1 - r2);
    }
    return Math.pow(VERTEX_SHRINK, Math.max(0, yToDepth(p.y / m.sy)));
}
function hueAt(m, p) {
    if (m.model === 'disk') {
        let u = (Math.atan2(p.y, p.x) + Math.PI / 2) / (2 * Math.PI);
        u -= Math.floor(u);
        return u;
    }
    const u = (p.x - m.x0) / Math.max(1, m.x1 - m.x0);
    return 0.5 * Math.min(1, Math.max(0, u));
}
function mixMetrics(m0, m1, s) {
    if (m0.model === 'disk' || s <= 0) return m0;
    if (s >= 1) return m1;
    const l = (a, b) => a + (b - a) * s;
    return { model: m0.model, sy: l(m0.sy, m1.sy), dotScale: l(m0.dotScale, m1.dotScale), x0: l(m0.x0, m1.x0), x1: l(m0.x1, m1.x1) };
}

// ───────────────────────── disk geometry ─────────────────────────

/** The circle through a and b meeting the boundary at right angles, or null for (nearly) a diameter. */
function orthogonalCircle(a, b) {
    const det = 2 * (a.x * b.y - a.y * b.x);
    if (Math.abs(det) < 1e-6 * DISK_R * DISK_R) return null;
    const R2 = DISK_R * DISK_R;
    const ka = a.x * a.x + a.y * a.y + R2, kb = b.x * b.x + b.y * b.y + R2;
    const cx = (ka * b.y - kb * a.y) / det, cy = (kb * a.x - ka * b.x) / det;
    const rr = cx * cx + cy * cy - R2;
    if (rr <= 1e-9) return null;
    const r = Math.sqrt(rr);
    if (r > 60 * DISK_R) return null;
    return { cx, cy, r };
}
/** The point a fraction t of the way along the geodesic from a to b (by arc). */
function geodesicPoint(a, b, t) {
    const c = orthogonalCircle(a, b);
    if (!c) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const ta = Math.atan2(a.y - c.cy, a.x - c.cx);
    let dt = Math.atan2(b.y - c.cy, b.x - c.cx) - ta;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    const th = ta + dt * t;
    return { x: c.cx + c.r * Math.cos(th), y: c.cy + c.r * Math.sin(th) };
}
/** Add the geodesic from a (a fraction t of the way to b) to the current path. */
function addGeodesic(ctx, a, b, t = 1) {
    const c = orthogonalCircle(a, b);
    ctx.moveTo(a.x, a.y);
    if (!c) { ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); return; }
    const ta = Math.atan2(a.y - c.cy, a.x - c.cx);
    let dt = Math.atan2(b.y - c.cy, b.x - c.cx) - ta;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    ctx.arc(c.cx, c.cy, c.r, ta, ta + dt * t, dt < 0);
}
function addStraight(ctx, a, b, t = 1) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}

// complex numbers, for isometries of the unit disk
const cx = (re, im) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cconj = (a) => cx(a.re, -a.im);
const cabs = (a) => Math.hypot(a.re, a.im);
const ONE = cx(1, 0);
/** z ↦ (z − a)/(1 − āz), taking a to 0, and its inverse. */
const toZero = (a, z) => cdiv(csub(z, a), csub(ONE, cmul(cconj(a), z)));
const fromZero = (a, z) => cdiv(cadd(z, a), cadd(ONE, cmul(cconj(a), z)));
const unit = (p) => cx(p.x / DISK_R, p.y / DISK_R);
const px = (z) => ({ x: z.re * DISK_R, y: z.im * DISK_R });
const clampDisk = (z) => { const r = cabs(z); return r < 0.999 ? z : cx(z.re * 0.999 / r, z.im * 0.999 / r); };

/** Constant-speed hyperbolic interpolation from a to b (pixel coordinates). */
function hypLerp(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const A = clampDisk(unit(a)), w = toZero(A, clampDisk(unit(b))), r = cabs(w);
    if (r < 1e-12) return a;
    const rr = Math.tanh(t * Math.atanh(Math.min(r, 0.9999999)));
    return px(fromZero(A, cx(w.re / r * rr, w.im / r * rr)));
}
/**
 * The disk's blend between a picture and its re-laid-out version: hyperbolic distance from
 * the centre and angle are interpolated separately, so points sweep around their rings
 * instead of cutting through the middle (near the centre, a geodesic step).
 */
function polarLerp(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const ra = Math.hypot(a.x, a.y), rb = Math.hypot(b.x, b.y);
    if (Math.min(ra, rb) < 0.06 * DISK_R) return hypLerp(a, b, t);
    const ha = Math.atanh(Math.min(ra / DISK_R, 0.999999)), hb = Math.atanh(Math.min(rb / DISK_R, 0.999999));
    const r = DISK_R * Math.tanh(ha + (hb - ha) * t);
    const ta = Math.atan2(a.y, a.x);
    let d = Math.atan2(b.y, b.x) - ta;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const th = ta + d * t;
    return { x: r * Math.cos(th), y: r * Math.sin(th) };
}
/** polarLerp about a pivot P of the disk: move P to the centre, sweep there, move back. */
function sweepDiskAbout(P) {
    const c = clampDisk(unit(P));
    return (a, b, t) => {
        if (t <= 0) return a;
        if (t >= 1) return b;
        const A = px(toZero(c, unit(a))), B = px(toZero(c, unit(b)));
        return px(fromZero(c, clampDisk(unit(polarLerp(A, B, t)))));
    };
}
/** In the half-plane: angle and distance about F, interpolated separately. */
function sweepPlaneAbout(F) {
    return (a, b, t) => {
        if (t <= 0) return a;
        if (t >= 1) return b;
        const ra = Math.hypot(a.x - F.x, a.y - F.y), rb = Math.hypot(b.x - F.x, b.y - F.y);
        if (Math.min(ra, rb) < 2) return lerp(a, b, t);
        const ta = Math.atan2(a.y - F.y, a.x - F.x);
        let d = Math.atan2(b.y - F.y, b.x - F.x) - ta;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const r = ra + (rb - ra) * t, th = ta + d * t;
        return { x: F.x + r * Math.cos(th), y: F.y + r * Math.sin(th) };
    };
}
const lerp = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Flows: f(p, s) moves p by the s-th power of an isometry (s = 1 the isometry,
 * s = −1 its inverse). In the disk they are hyperbolic translations and
 * rotations; in the half-plane, plane rotations about a point (or nothing).
 */
const still = (p) => p;
function diskTranslation(A, B) {
    const a = clampDisk(unit(A)), Bp = toZero(a, clampDisk(unit(B))), r = cabs(Bp);
    if (r < 1e-9) return still;
    const dir = cx(Bp.re / r, Bp.im / r), D = Math.atanh(Math.min(r, 0.9999999));
    return (p, s) => {
        if (s === 0) return p;
        const rho = Math.tanh(s * D);
        return px(fromZero(a, fromZero(cx(dir.re * rho, dir.im * rho), toZero(a, unit(p)))));
    };
}
function diskRotation(A, theta) {
    const a = clampDisk(unit(A));
    return (p, s) => {
        if (s === 0) return p;
        const e = cx(Math.cos(theta * s), Math.sin(theta * s));
        return px(fromZero(a, cmul(e, toZero(a, unit(p)))));
    };
}
/**
 * The disk isometry z ↦ e^{iθ}·(z + b)/(1 + b̄z) that best carries the points z_i to w_i
 * (weighted least squares), and a path to it from the identity: the translation part grows
 * along its geodesic while the turn grows with it. Returns a flow with an exact inverse.
 */
function fittedDiskMotion(pairs) {
    const cost = (b) => {
        let sr = 0, si = 0;
        const us = pairs.map((q) => fromZero(b, q.z));
        us.forEach((u, i) => { const q = pairs[i], c = cmul(cconj(u), q.w); sr += q.wt * c.re; si += q.wt * c.im; });
        const th = Math.atan2(si, sr), e = cx(Math.cos(th), Math.sin(th));
        let f = 0;
        us.forEach((u, i) => { const d = csub(cmul(e, u), pairs[i].w); f += pairs[i].wt * (d.re * d.re + d.im * d.im); });
        return { f, th };
    };
    // start where the centre should go, then a shrinking pattern search
    const c0 = pairs.find((q) => cabs(q.z) < 1e-9);
    let b = c0 ? clampDisk(c0.w) : cx(0, 0), best = cost(b), step = 0.12;
    for (let it = 0; it < 80 && step > 2e-4; it++) {
        let moved = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nb = cx(b.re + dx * step, b.im + dy * step);
            if (cabs(nb) > 0.97) continue;
            const c = cost(nb);
            if (c.f < best.f) { b = nb; best = c; moved = true; }
        }
        if (!moved) step /= 2;
    }
    const r = cabs(b), dir = r > 1e-9 ? cx(b.re / r, b.im / r) : cx(1, 0), D = Math.atanh(Math.min(r, 0.9999999));
    let th = best.th;
    while (th > Math.PI) th -= 2 * Math.PI;
    while (th < -Math.PI) th += 2 * Math.PI;
    const f = (p, s) => {
        if (s === 0) return p;
        const rho = Math.tanh(s * D), e = cx(Math.cos(th * s), Math.sin(th * s));
        return px(cmul(e, fromZero(cx(dir.re * rho, dir.im * rho), unit(p))));
    };
    f.inv = (p) => px(toZero(b, cmul(cx(Math.cos(-th), Math.sin(-th)), unit(p))));
    return f;
}
/**
 * A translation, drawn as a conveyor along its axis. axis: the axis vertices A_0, A_1, …
 * in the direction of translation, with their places in the picture. Each vertex is held by
 * its projection onto the axis and its offset from there (distance, and angle from the
 * axis's forward direction); the projection slides along the drawn axis while the offset
 * turns into the image's. Returns { hold(x, y) → particle data, at(data, s) → point }.
 */
function makeConveyor(model, place, axis) {
    const disk = model === 'disk';
    const n = axis.length;
    const P = axis.map((a) => a.pos);
    const norm = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
    // the direction from P[i] to q, in the frame at P[i]
    const dirAt = (X, q) => {
        if (disk) { const w = toZero(clampDisk(unit(X)), clampDisk(unit(q))); return Math.atan2(w.im, w.re); }
        return Math.atan2(q.y - X.y, q.x - X.x);
    };
    const fwd = P.map((X, i) => (i + 1 < n ? dirAt(X, P[i + 1]) : null));
    const back = P.map((X, i) => (i > 0 ? dirAt(X, P[i - 1]) : null));
    // the axis's forward tangent at each vertex: the bisector of its bend
    const tau = P.map((_, i) => {
        if (fwd[i] === null) return norm(back[i] + Math.PI);
        if (back[i] === null) return fwd[i];
        return Math.atan2(Math.sin(fwd[i]) - Math.sin(back[i]), Math.cos(fwd[i]) - Math.cos(back[i]));
    });
    const dOut = tau.map((t, i) => (fwd[i] === null ? 0 : norm(t - fwd[i])));
    const dIn = tau.map((t, i) => (back[i] === null ? 0 : norm(t - back[i] - Math.PI)));
    const frame = new Map();
    /** The point at axis parameter u and the forward angle there. */
    const axisFrame = (u) => {
        const key = Math.round(u * 1e4);
        let f = frame.get(key);
        if (f) return f;
        const i = Math.max(0, Math.min(n - 2, Math.floor(u))), t = Math.max(0, Math.min(1, u - i));
        const X = disk ? hypLerp(P[i], P[i + 1], t) : lerp(P[i], P[i + 1], t);
        const psi = t < 0.999 ? dirAt(X, P[i + 1]) : norm(dirAt(X, P[i]) + Math.PI);
        f = { X, ang: psi + dOut[i] + (dIn[i + 1] - dOut[i]) * t };
        frame.set(key, f);
        return f;
    };
    const projection = (vt) => {
        let best = 0, bd = Infinity;
        for (let i = 0; i < n; i++) { const d = place.dist(vt, axis[i].vt); if (d < bd) { bd = d; best = i; } }
        return best;
    };
    const offset = (i, q) => {
        const X = P[i];
        if (disk) {
            const w = toZero(clampDisk(unit(X)), clampDisk(unit(q))), r = cabs(w);
            return { rho: Math.atanh(Math.min(r, 0.9999999)), phi: norm(Math.atan2(w.im, w.re) - tau[i]) };
        }
        return { rho: Math.hypot(q.x - X.x, q.y - X.y), phi: norm(Math.atan2(q.y - X.y, q.x - X.x) - tau[i]) };
    };
    return {
        hold(x, A, y, B) {
            const i = projection(x), j = projection(y);
            const o0 = offset(i, A), o1 = offset(j, B);
            return { i, j, r0: o0.rho, r1: o1.rho, f0: o0.phi, df: norm(o1.phi - o0.phi) };
        },
        at(c, s) {
            const { X, ang } = axisFrame(c.i + (c.j - c.i) * s);
            const rho = c.r0 + (c.r1 - c.r0) * s, th = ang + c.f0 + c.df * s;
            if (disk) {
                const rr = Math.tanh(rho);
                return px(fromZero(clampDisk(unit(X)), cx(rr * Math.cos(th), rr * Math.sin(th))));
            }
            return { x: X.x + rho * Math.cos(th), y: X.y + rho * Math.sin(th) };
        },
        reset() { frame.clear(); },
    };
}

function planeRotation(F, theta) {
    return (p, s) => {
        if (s === 0) return p;
        const c = Math.cos(theta * s), sn = Math.sin(theta * s), x = p.x - F.x, y = p.y - F.y;
        return { x: F.x + c * x - sn * y, y: F.y + sn * x + c * y };
    };
}
// ───────────────────────── scenes ─────────────────────────

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * A marked element's characteristic set among the drawn vertices: those v with d(v, g·v) = target,
 * its least displacement (ℓ on the axis of a hyperbolic g, 0 on the fixed subtree of an elliptic,
 * 1 at the ends of an edge it inverts). The edges between them, oriented along the translation.
 * mark: { G (place.prepare'd), target, hyperbolic }.
 */
function markedSet(place, nodes, links, mark) {
    const ids = new Set(), img = new Map();
    for (const n of nodes) {
        const g = place.act(mark.G, n.vt);
        img.set(n.id, g);
        if (place.dist(n.vt, g) === mark.target) ids.add(n.id);
    }
    const edges = [];
    for (const l of links) {
        if (!ids.has(l.s.id) || !ids.has(l.t.id)) continue;
        let [from, to] = [l.s, l.t];
        if (mark.hyperbolic) {
            const gf = img.get(from.id);
            if (place.dist(to.vt, gf) > place.dist(from.vt, gf)) [from, to] = [to, from];
        }
        edges.push({ from, to });
    }
    return { ids, edges, arrows: !!mark.hyperbolic };
}

function buildScene(opts) {
    const { tree, place, baseId, imageId, orbitIds } = opts;
    const currentId = opts.currentId ?? baseId;
    const model = opts.model === 'disk' ? 'disk' : 'halfplane';
    const { root, hull, voronoi } = analyzeTree(tree, orbitIds, currentId);
    // the picture is laid out about v, whatever W is
    const L = model === 'disk' ? diskLayout(root, baseId, place) : halfPlaneLayout(root);
    const kind = (id) => (id === currentId ? 'current' : orbitIds.has(id) ? 'orbit' : hull.vertices.has(id) ? 'hull' : 'plain');
    const nodes = [], byId = new Map();
    root.each((d) => {
        const id = d.data.id;
        const n = { id, vt: d.data.vt, d, pos: L.pos.get(d), kind: kind(id), cell: voronoi.vertices.has(id) };
        nodes.push(n);
        byId.set(id, n);
    });
    const rat = opts.rationalSubtree ? (n) => place.isRational(n.vt) : () => false;
    const links = [], linkByPair = new Map();
    for (const l of root.links()) {
        const s = byId.get(l.source.data.id), t = byId.get(l.target.data.id);
        const key = `${s.id}->${t.id}`;
        let cell = null;
        if (voronoi.fullEdges.has(key)) cell = { from: s, to: t, t: 1 };
        else if (voronoi.partialEdges.has(key)) {
            const { fromChild, t: frac } = voronoi.partialEdges.get(key);
            cell = fromChild ? { from: t, to: s, t: frac } : { from: s, to: t, t: frac };
        }
        const link = { s, t, hull: hull.edges.has(key), cell, rat: rat(s) && rat(t) };
        links.push(link);
        linkByPair.set(pairKey(s.id, t.id), link);
    }
    // frame: the bounds to fit, the ray to ∞ and the level guides of the half-plane
    let bounds = L.bounds, levels = null, stub = null;
    if (model === 'halfplane') {
        let x0 = Infinity, x1 = -Infinity, yMax = 0;
        for (const n of nodes) { x0 = Math.min(x0, n.pos.x); x1 = Math.max(x1, n.pos.x); yMax = Math.max(yMax, n.pos.y); }
        levels = [];
        for (let i = 0; i <= root.height; i++) levels.push({ k: tree.root.k + i, y: depthToY(i) * L.metrics.sy });
        const r0 = byId.get(root.data.id).pos;
        stub = { x: r0.x, y: r0.y, len: BASE_Y * 1.05 * L.metrics.sy };
        bounds = { x0: x0 - 36, x1: x1 + 36, y0: -stub.len - 24, y1: yMax + 46 };
        L.metrics.x0 = x0; L.metrics.x1 = x1;
        levels.yEnds = yMax + 30;
    }
    const sc = {
        model, opts, place, root, hull, voronoi, L, metrics: L.metrics, nodes, byId, links, linkByPair,
        baseId, currentId, imageId, rootK: tree.root.k, rootNode: byId.get(root.data.id),
        bounds, levels, stub, endsTex: opts.endsTex || null,
        maxDist: L.maxDist, radius: L.radius,
    };
    sc.marked = opts.mark ? markedSet(place, nodes, links, opts.mark) : null;
    // W·v beyond the drawn tree (W longer than the word length): a marker where it lies
    sc.ghost = !byId.has(currentId) && opts.currentVt ? placeOf(sc, opts.currentVt) : null;
    return sc;
}

/** Where a vertex is drawn in a scene: its own place, or (if undrawn) a spot beyond the nearest drawn vertex. */
function placeOf(sc, vt) {
    const { place, byId } = sc;
    const n = byId.get(place.id(vt));
    if (n) return n.pos;
    for (let j = vt.k - 1; j >= sc.rootK; j--) {
        const a = byId.get(place.id(place.ancestor(vt, j)));
        if (a) {
            const b = place.ancestor(vt, j + 1);
            const lp = place.linkPoint(a.vt, b);
            return sc.L.beyond(a, lp === Infinity ? -1 : lp, vt.k - j, place.q, 0);
        }
    }
    // the way out runs up the ray to ∞ above the drawing, then down again
    const meet = vt.d.length ? Math.min(vt.lo, vt.k) : vt.k;
    const up = Math.max(1, sc.rootK - meet);
    return sc.L.beyond(sc.rootNode, -1, up + (vt.k - meet), place.q, up);
}

const infoOf = (sc) => ({ root: sc.root, hullVertices: sc.hull.vertices, voronoi: sc.voronoi, marked: sc.marked ? sc.marked.ids.size : 0 });

// ───────────────────────── frames ─────────────────────────

/** Everything one picture needs: positions, weights and looks, ready to paint. */
function staticFrame(sc) {
    const P = (n) => n.pos;
    return {
        model: sc.model,
        metrics: sc.metrics,
        frames: [[sc, 1]],
        edges: sc.links.map((l) => ({ a: P(l.t), b: P(l.s), alpha: 1, hull: l.hull ? 1 : 0 })),
        rat: sc.links.filter((l) => l.rat).map((l) => ({ a: P(l.s), b: P(l.t), alpha: 1 })),
        cell: sc.links.filter((l) => l.cell).map((l) => ({ a: P(l.cell.from), b: P(l.cell.to), t: l.cell.t, alpha: 1 })),
        halos: sc.nodes.filter((n) => n.cell).map((n) => ({ p: P(n), alpha: 1 })),
        dots: sc.nodes.map((n) => ({ p: P(n), kind: n.kind, alpha: 1 })),
        axis: null,
        fixed: sc,
        transient: [[sc, 1]],
    };
}

// ───────────────────────── painting ─────────────────────────

function paintStatic() {
    if (!S.scene) return;
    const fr = staticFrame(S.scene);
    if (S.glow) fr.axis = S.glow.frameAxis();
    paint(fr);
}

const quant = (v, step) => Math.round(v / step);

function paint(fr) {
    const ctx = S.ctx, dpr = S.dpr, t = S.t, pal = palette();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);
    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const disk = fr.model === 'disk';
    const seg = disk ? addGeodesic : addStraight;
    const m = fr.metrics;
    const zk = t.k;

    for (const [sc, a] of fr.frames) if (a > 0.004) paintFrame(ctx, sc, a, pal, zk);

    // ── the ℚ_p-subtree and the Dirichlet cell: soft bands under everything ──
    const band = (items, color, width) => {
        const buckets = new Map();
        for (const it of items) {
            if (it.alpha < 0.01) continue;
            const s = scaleAt(m, lerp(it.a, it.b, 0.5));
            const w = Math.max(width * Math.pow(s, 0.8), 1.2 / zk);
            const key = `${quant(Math.log(w), 0.12)}|${quant(it.alpha, 0.1)}`;
            let b = buckets.get(key);
            if (!b) { b = { w, alpha: quant(it.alpha, 0.1) * 0.1, list: [] }; buckets.set(key, b); }
            b.list.push(it);
        }
        ctx.strokeStyle = color;
        for (const b of buckets.values()) {
            ctx.globalAlpha = b.alpha;
            ctx.lineWidth = b.w;
            ctx.beginPath();
            for (const it of b.list) seg(ctx, it.a, it.b, it.t ?? 1);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    };
    if (fr.rat.length) band(fr.rat, pal.rat, RAT_W);
    if (fr.cell.length) band(fr.cell, pal.cell, CELL_W);
    if (fr.halos.length) {
        ctx.fillStyle = pal.cellHalo;
        const byA = new Map();
        for (const h of fr.halos) {
            if (h.alpha < 0.01) continue;
            const k = quant(h.alpha, 0.1);
            if (!byA.has(k)) byA.set(k, []);
            byA.get(k).push(h);
        }
        for (const [k, list] of byA) {
            ctx.globalAlpha = k * 0.1;
            ctx.beginPath();
            for (const h of list) {
                const r = Math.max(13 * Math.pow(scaleAt(m, h.p), 0.8), 2 / zk);
                ctx.moveTo(h.p.x + r, h.p.y);
                ctx.arc(h.p.x, h.p.y, r, 0, 2 * Math.PI);
            }
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── the axis (or fixed set) of the isometry in motion: a glow ──
    if (fr.axis && fr.axis.alpha > 0.01) paintAxis(ctx, fr.axis, m, seg, pal, zk, 'glow');
    for (const [sc, a] of fr.transient) if (a > 0.01 && sc.marked) paintAxis(ctx, markedAxis(sc, a), m, seg, pal, zk, 'glow');

    // ── edges, bucketed by colour, width and opacity ──
    const ebk = new Map();
    for (const e of fr.edges) {
        if (e.alpha < 0.01) continue;
        const mid = lerp(e.a, e.b, 0.5);
        const s = scaleAt(m, mid);
        const hi = Math.min(HUES - 1, Math.max(0, Math.round(hueAt(m, mid) * HUES) % HUES));
        const put = (layer, w, alpha) => {
            const key = `${layer}|${hi}|${quant(Math.log(w), 0.1)}|${quant(alpha, 0.08)}`;
            let b = ebk.get(key);
            if (!b) { b = { layer, hi, w, alpha: quant(alpha, 0.08) * 0.08, list: [] }; ebk.set(key, b); }
            b.list.push(e);
        };
        const ea = e.alpha * pal.edgeAlpha * (0.4 + 0.6 * Math.min(1, s * 1.6));
        if (e.hull < 0.999) put(0, Math.max(EDGE_W * Math.pow(s, 0.7), 0.35 / zk), ea * (1 - e.hull * 0.6));
        if (e.hull > 0.001) put(1, Math.max(HULL_W * Math.pow(s, 0.7), 0.9 / zk), e.alpha * e.hull * pal.hullAlpha);
    }
    const ebs = [...ebk.values()].sort((a, b) => a.layer - b.layer);
    for (const b of ebs) {
        ctx.strokeStyle = (b.layer ? pal.hull : pal.edge)[b.hi];
        ctx.globalAlpha = Math.min(1, b.alpha);
        ctx.lineWidth = b.w;
        ctx.beginPath();
        for (const e of b.list) seg(ctx, e.a, e.b, 1);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (fr.axis && fr.axis.alpha > 0.01) paintAxis(ctx, fr.axis, m, seg, pal, zk, 'core');
    for (const [sc, a] of fr.transient) if (a > 0.01 && sc.marked) paintAxis(ctx, markedAxis(sc, a), m, seg, pal, zk, 'core');

    // ── vertices ──
    const dotScale = m.model === 'disk' ? 1 : m.dotScale;
    const order = ['plain', 'hull', 'orbit', 'current'];
    const groups = new Map(order.map((k) => [k, []]));
    for (const d of fr.dots) if (d.alpha > 0.01) groups.get(d.kind).push(d);
    for (const kind of order) {
        const list = groups.get(kind);
        if (!list.length) continue;
        const sized = list.map((d) => {
            const s = scaleAt(m, d.p);
            return { d, s, r: Math.max(DOT_R[kind] * Math.pow(s, 0.8) * dotScale, DOT_MIN[kind] / Math.max(zk, 0.5)) };
        });
        if (kind === 'plain' || kind === 'hull') {
            const fills = kind === 'plain' ? pal.plain : pal.hullDot;
            const bk = new Map();
            for (const it of sized) {
                if (it.r * zk < 0.45) continue;
                const hi = Math.min(HUES - 1, Math.max(0, Math.round(hueAt(m, it.d.p) * HUES) % HUES));
                const a = quant(it.d.alpha * (kind === 'plain' ? 0.92 : 1), 0.1);
                const key = `${hi}|${a}`;
                if (!bk.has(key)) bk.set(key, { hi, a, list: [] });
                bk.get(key).list.push(it);
            }
            for (const b of bk.values()) {
                ctx.fillStyle = fills[b.hi];
                ctx.globalAlpha = b.a * 0.1;
                ctx.beginPath();
                for (const it of b.list) { ctx.moveTo(it.d.p.x + it.r, it.d.p.y); ctx.arc(it.d.p.x, it.d.p.y, it.r, 0, 2 * Math.PI); }
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            continue;
        }
        for (const it of sized) {
            const { p, alpha } = it.d, r = it.r;
            ctx.globalAlpha = alpha;
            if (kind === 'current') {
                ctx.fillStyle = pal.currentHalo;
                ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, 2 * Math.PI); ctx.fill();
                ctx.fillStyle = pal.current;
                ctx.strokeStyle = pal.currentRing;
                ctx.lineWidth = Math.max(r * 0.28, 0.8 / zk);
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            } else {
                ctx.fillStyle = pal.orbitHalo;
                ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, 2 * Math.PI); ctx.fill();
                ctx.fillStyle = pal.orbit;
                ctx.strokeStyle = pal.orbitRing;
                ctx.lineWidth = Math.max(r * 0.22, 0.5 / zk);
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    // ── rings, then the LaTeX labels ──
    paintRings(ctx, fr, pal, m);
    placeLabels(fr, m);
}

/** The half-plane's frame: the horocycles about ∞ and the ray up to it. (The disk has none: just the tree.) */
function paintFrame(ctx, sc, alpha, pal, zk) {
    ctx.globalAlpha = alpha;
    if (sc.model === 'halfplane' && sc.levels) {
        // horocycles about ∞: one faint line per level, across the whole view
        const x0 = (-S.t.x) / zk - 10, x1 = (S.w - S.t.x) / zk + 10;
        ctx.strokeStyle = pal.guide;
        ctx.lineWidth = 1 / zk;
        ctx.beginPath();
        for (const L of sc.levels) { ctx.moveTo(x0, L.y); ctx.lineTo(x1, L.y); }
        ctx.stroke();
        // the ray up to the end ∞
        const { x, y, len } = sc.stub;
        const g = ctx.createLinearGradient(x, y, x, y - len);
        g.addColorStop(0, pal.edge[0]);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = EDGE_W;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function markedAxis(sc, alpha) {
    return { segs: sc.marked.edges.map((e) => ({ a: e.from.pos, b: e.to.pos })), arrows: sc.marked.arrows, alpha };
}

/** An axis or fixed set: a wide soft glow, then a fine bright core with arrowheads. */
function paintAxis(ctx, ax, m, seg, pal, zk, pass) {
    const points = ax.points || [];
    if (!ax.segs.length && !points.length) return;
    const seg2 = (a, b) => seg(ctx, a, b, 1);
    const ptR = (p, k) => Math.max(k * Math.pow(scaleAt(m, p), 0.8), 4 / zk);
    if (pass === 'glow') {
        ctx.globalAlpha = ax.alpha;
        ctx.fillStyle = pal.axisGlow;
        for (const p of points) { ctx.beginPath(); ctx.arc(p.x, p.y, ptR(p, 20), 0, 2 * Math.PI); ctx.fill(); }
        ctx.strokeStyle = pal.axisGlow;
        for (const s of ax.segs) {
            const sc = scaleAt(m, lerp(s.a, s.b, 0.5));
            ctx.globalAlpha = ax.alpha * (s.alpha ?? 1);
            ctx.lineWidth = Math.max(16 * Math.pow(sc, 0.8), 3 / zk);
            ctx.beginPath(); seg2(s.a, s.b); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        return;
    }
    ctx.strokeStyle = pal.axis;
    ctx.fillStyle = pal.axis;
    ctx.globalAlpha = ax.alpha * 0.92;
    for (const p of points) {
        ctx.lineWidth = Math.max(2 * Math.pow(scaleAt(m, p), 0.7), 0.8 / zk);
        ctx.beginPath(); ctx.arc(p.x, p.y, ptR(p, 14), 0, 2 * Math.PI); ctx.stroke();
    }
    for (const s of ax.segs) {
        const sc = scaleAt(m, lerp(s.a, s.b, 0.5));
        ctx.globalAlpha = ax.alpha * 0.92 * (s.alpha ?? 1);
        ctx.lineWidth = Math.max(2.4 * Math.pow(sc, 0.7), 0.8 / zk);
        ctx.beginPath(); seg2(s.a, s.b); ctx.stroke();
        if (ax.arrows) {
            const at = m.model === 'disk' ? geodesicPoint : (a, b, t) => lerp(a, b, t);
            const p0 = at(s.a, s.b, 0.47), p1 = at(s.a, s.b, 0.53);
            const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const r = Math.max(7.5 * Math.pow(sc, 0.8), 2.2 / zk);
            const c = lerp(p0, p1, 0.5);
            const pt = (rr, th) => [c.x + rr * Math.cos(ang + th), c.y + rr * Math.sin(ang + th)];
            ctx.beginPath();
            ctx.moveTo(...pt(r, 0)); ctx.lineTo(...pt(r * 0.9, 2.45)); ctx.lineTo(...pt(r * 0.9, -2.45));
            ctx.closePath(); ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
}

/**
 * Rings in the scene. Fixed to the picture: the base vertex v, ⌊0⌋₀ and the selection.
 * Carried with W: the marked generator's set and the copy W·v when it lies beyond the drawing.
 */
function paintRings(ctx, fr, pal, m) {
    const zk = S.t.k;
    const ringAt = (pos, color, dash, rr = 12, w = 1.8) => {
        const s = scaleAt(m, pos), r = Math.max(rr * Math.pow(s, 0.8), (rr / 2.4) / zk);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(w * Math.pow(s, 0.7), 0.9 / zk);
        ctx.setLineDash(dash ? [3 * Math.pow(s, 0.6), 2.6 * Math.pow(s, 0.6)] : []);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI); ctx.stroke();
        ctx.setLineDash([]);
    };
    const sc = fr.fixed;
    const origin = sc.nodes.find((n) => n.vt.k === 0 && !n.vt.d.length);
    ctx.globalAlpha = 0.8;
    if (origin) ringAt(origin.pos, pal.origin, true, 17);
    const base = sc.byId.get(sc.baseId);
    ctx.globalAlpha = 1;
    if (base) ringAt(base.pos, pal.base, false, 12.5, 2.4);
    const sel = S.selectedId ? sc.byId.get(S.selectedId) : null;
    if (sel) ringAt(sel.pos, pal.select, false, 15);
    for (const [t, a] of fr.transient) {
        if (a < 0.01) continue;
        if (t.marked) {
            ctx.globalAlpha = a * 0.7;
            for (const n of t.nodes) if (t.marked.ids.has(n.id)) ringAt(n.pos, pal.axis, false, 9);
        }
        if (t.ghost) {
            const g = t.ghost, r = Math.max(4 * Math.pow(scaleAt(m, g), 0.8), 2.5 / zk);
            ctx.globalAlpha = a;
            ctx.fillStyle = pal.current;
            ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, 2 * Math.PI); ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
}

/** The labels of a frame, as LaTeX at screen positions: { key, tex, x, y, anchor, cls, alpha }. */
function placeLabels(fr, m) {
    const t = S.t, zk = t.k, sc = fr.fixed, out = [];
    const scr = (p) => ({ x: t.x + zk * p.x, y: t.y + zk * p.y });
    const vtex = (s, n) => `\\lfloor ${s.place.labelTex(n.vt)} \\rfloor_{${n.vt.k}}`;
    const near = (s, n, alpha, cls, key) => {
        const r = Math.max(DOT_R[n.kind] * Math.pow(scaleAt(m, n.pos), 0.8) * (m.dotScale ?? 1), 4) * zk;
        const p = scr(n.pos), below = s.model === 'halfplane' && !n.d.children;
        out.push({ key, tex: vtex(s, n), x: p.x, y: below ? p.y + r + 5 : p.y - r - 5, anchor: below ? 'below' : 'above', cls, alpha });
    };
    // fixed to the picture: the level ruler, ∞ and the ends of the half-plane; v and g₁·v
    if (sc.model === 'halfplane' && sc.levels) {
        let lastY = -Infinity;
        for (const L of sc.levels) {
            const y = t.y + zk * L.y;
            if (y < 64 || y > S.h - 10 || y - lastY < 15) continue;      // (below the certificate)
            lastY = y;
            out.push({ key: `k${L.k}`, tex: `k = ${L.k}`, x: 16, y, anchor: 'left', cls: 'faint small', alpha: 1 });
        }
        const top = scr({ x: sc.stub.x, y: sc.stub.y - sc.stub.len });
        out.push({ key: 'inf', tex: '\\infty', x: top.x, y: top.y - 6, anchor: 'above', cls: 'dim', alpha: 1 });
        const yE = t.y + zk * sc.levels.yEnds;
        if (sc.endsTex && yE < S.h - 6) out.push({ key: 'ends', tex: `\\text{ends: } ${sc.endsTex}`, x: 16, y: yE, anchor: 'left', cls: 'faint small', alpha: 1 });
    }
    // (the names of vertices step aside while the tree moves under them)
    const named = fr.namedAlpha ?? 1;
    const base = sc.byId.get(sc.baseId);
    if (base) near(sc, base, named, 'ink', `v${base.id}`);
    const img = sc.byId.get(sc.imageId);
    if (img && sc.imageId !== sc.baseId) near(sc, img, named, 'ink', `v${img.id}`);
    // carried with W: the current copy's label
    for (const [s, a] of fr.transient) {
        if (a < 0.01 || s.currentId === s.baseId) continue;
        const n = s.byId.get(s.currentId);
        if (n && s.currentId !== s.imageId) near(s, n, a, 'current', `v${n.id}`);
    }
    // the element in motion: a caption
    for (const nt of fr.notes || []) {
        if (nt.alpha < 0.01) continue;
        out.push({ key: nt.key, tex: nt.tex, x: S.w / 2, y: 26, anchor: 'below', cls: 'caption', alpha: nt.alpha });
    }
    // the selected vertex's link, labelled by P¹(F_q)
    const sel = S.selectedId ? sc.byId.get(S.selectedId) : null;
    if (sel && sc.place.q <= 30) {
        const items = (sel.d.children || []).map((c) => ({ to: sc.byId.get(c.data.id).pos, tex: sc.place.digitTex(sc.place.linkPoint(sel.vt, c.data.vt)) }));
        if (sel.d.parent) items.push({ to: sc.byId.get(sel.d.parent.data.id).pos, tex: '\\infty' });
        else if (sc.model === 'halfplane') items.push({ to: { x: sel.pos.x, y: sel.pos.y - sc.stub.len }, tex: '\\infty', straight: true });
        items.forEach((it, i) => {
            const mid = sc.model === 'disk' && !it.straight ? geodesicPoint(sel.pos, it.to, 0.55) : lerp(sel.pos, it.to, 0.55);
            const p = scr(mid);
            out.push({ key: `link${i}`, tex: it.tex, x: p.x, y: p.y - 3, anchor: 'center', cls: 'link small', alpha: 1 });
        });
    }
    setLabels(out);
}

const ANCHOR = { center: 'translate(-50%, -50%)', above: 'translate(-50%, -100%)', below: 'translate(-50%, 0)', left: 'translate(0, -50%)' };
const labelEls = new Map();         // key → { el, tex, cls }

/** Typeset an element with MathJax, one job at a time (it may not have loaded yet). */
function typesetEl(el) {
    const run = () => {
        const MJ = window.MathJax;
        MJ.startup.promise = MJ.startup.promise.then(() => MJ.typesetPromise([el])).catch(() => { });
        return MJ.startup.promise;
    };
    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function' && window.MathJax.startup) return run();
    return new Promise((resolve) => {
        const iv = setInterval(() => {
            if (window.MathJax && typeof window.MathJax.typesetPromise === 'function' && window.MathJax.startup) { clearInterval(iv); run().then(resolve, resolve); }
        }, 120);
    });
}

function setLabels(list) {
    const host = S.labels;
    if (!host) return;
    const seen = new Set();
    for (const L of list) {
        if (L.alpha < 0.01) continue;
        let it = labelEls.get(L.key);
        if (!it) {
            const el = document.createElement('div');
            host.appendChild(el);
            it = { el, tex: null, cls: null };
            labelEls.set(L.key, it);
        }
        if (it.cls !== L.cls) { it.cls = L.cls; it.el.className = `tree-label ${L.cls}`; }
        if (it.tex !== L.tex) {
            it.tex = L.tex;
            const el = it.el;
            el.style.visibility = 'hidden';
            el.innerHTML = `\\(${L.tex}\\)`;
            typesetEl(el).then(() => { if (it.tex === L.tex) el.style.visibility = ''; });
        }
        it.el.style.transform = `translate(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px) ${ANCHOR[L.anchor]}`;
        it.el.style.opacity = String(Math.min(1, L.alpha));
        it.el.style.display = '';
        seen.add(L.key);
    }
    for (const [k, it] of labelEls) if (!seen.has(k)) it.el.style.display = 'none';
    if (labelEls.size > 300) for (const [k, it] of labelEls) if (!seen.has(k)) { it.el.remove(); labelEls.delete(k); }
}

// ───────────────────────── interaction ─────────────────────────

let handlers = { click: null, dbl: null };

function nodeAt(ev) {
    const sc = S.scene;
    if (!sc || S.anim) return null;
    const rect = S.canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left - S.t.x) / S.t.k, y = (ev.clientY - rect.top - S.t.y) / S.t.k;
    let best = null, bd = Infinity;
    for (const n of sc.nodes) {
        const dx = n.pos.x - x, dy = n.pos.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = n; }
    }
    if (!best) return null;
    const s = scaleAt(sc.metrics, best.pos);
    const r = Math.max(DOT_R[best.kind] * Math.pow(s, 0.8) * (sc.metrics.dotScale ?? 1), 1) * S.t.k;
    return Math.sqrt(bd) * S.t.k <= Math.max(r + 5, 9) ? best : null;
}

function onClick(ev) {
    const n = nodeAt(ev);
    if (!n) return;
    S.selectedId = n.id;
    paintStatic();
    if (handlers.click) handlers.click(n.vt);
}
function onDblClick(ev) {
    const n = nodeAt(ev);
    if (n && handlers.dbl) handlers.dbl(n.vt);
}
function onMove(ev) {
    if (ev.buttons) { setHover(null); return; }
    setHover(nodeAt(ev), ev);
}
function setHover(n, ev) {
    const id = n ? n.id : null;
    S.canvas.style.cursor = n ? 'pointer' : '';
    if (!S.tip) return;
    if (!n) { S.tip.hidden = true; S.hoverId = null; return; }
    if (id !== S.hoverId) {
        S.hoverId = id;
        const tip = S.tip;
        tip.style.visibility = 'hidden';
        tip.innerHTML = `\\(\\lfloor ${S.scene.place.labelTex(n.vt)} \\rfloor_{${n.vt.k}}\\)`;
        typesetEl(tip).then(() => { if (S.hoverId === id) tip.style.visibility = ''; });
    }
    S.tip.hidden = false;
    const rect = S.canvas.getBoundingClientRect();
    S.tip.style.left = `${ev.clientX - rect.left + 14}px`;
    S.tip.style.top = `${ev.clientY - rect.top - 30}px`;
}

// ───────────────────────── drawing at rest ─────────────────────────

/**
 * opts: { tree (from generateTree), place, baseId, currentId (W·v; defaults to
 *         baseId), imageId, orbitIds (Set), selectedId, onVertexClick(vt),
 *         onVertexDblClick(vt), refit, currentVt (W·v, marked even when it lies
 *         beyond the drawn tree), model ('halfplane' | 'disk'), rationalSubtree,
 *         mark, endsTex (LaTeX for the ends of the half-plane) }
 */
export function drawTree(opts) {
    ensureCanvas();
    stopAnimation();
    resize();
    handlers = { click: opts.onVertexClick || null, dbl: opts.onVertexDblClick || null };
    S.selectedId = opts.selectedId ?? null;
    const sc = buildScene(opts);
    S.scene = sc;
    const model = sc.model;
    if (opts.refit || !S.userMoved || S.lastModel !== model) { S.userMoved = false; S.t = fitTransform(sc); d3.select(S.canvas).call(S.zoom.transform, S.t); }
    S.lastModel = model;
    paintStatic();
    return infoOf(sc);
}

// ───────────────────────── motion ─────────────────────────

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
const win = (t, [a, b]) => smooth((t - a) / (b - a));

function stopAnimation() {
    if (S.anim) { cancelAnimationFrame(S.anim.raf); S.anim = null; }
    S.queue = [];
    if (S.glow) { cancelAnimationFrame(S.glow.raf); clearTimeout(S.glow.timer); S.glow = null; }
}

/**
 * Draw opts like drawTree, getting there by an isometry h: motion = { forward(vt) = h·vt,
 * backward(vt) = h⁻¹·vt, ell (translation length of h) }. The current picture moves by h
 * onto itself, then glides to the new one. Returns drawTree's summary of the new picture.
 */
export function animateTo(opts, motion) {
    ensureCanvas();
    handlers = { click: opts.onVertexClick || null, dbl: opts.onVertexDblClick || null };
    const model = opts.model === 'disk' ? 'disk' : 'halfplane';
    if (!S.scene || S.scene.model !== model || S.lastModel !== model || reducedMotion() || document.hidden) {
        return drawTree(opts);
    }
    resize();
    if (S.anim) {
        // finish what is moving first, a little faster
        const neu = buildPending(opts);
        S.queue.push({ opts, motion, neu });
        return infoOf(neu);
    }
    const job = prepare(S.scene, opts, motion);
    start(job);
    return infoOf(job.neu);
}

/** A scene for opts, built now so the caller gets its summary (the disk turn is fixed when it runs). */
function buildPending(opts) { return buildScene(opts); }

function prepare(old, opts, motion, neuHint = null) {
    const place = old.place;
    const model = old.model;
    S.selectedId = opts.selectedId ?? null;
    const hc = motion.forward(old.byId.get(old.currentId)?.vt ?? opts.currentVt);
    const B_hc = placeOf(old, hc);
    const neu = neuHint || buildScene(opts);

    // particles: every vertex y that is drawn before, after, or is the image of a drawn one
    const Y = new Map();
    const get = (vt, id = place.id(vt)) => {
        let p = Y.get(id);
        if (!p) { p = { id, vt, pre: null }; Y.set(id, p); }
        return p;
    };
    let target = null;
    const disp = new Map();
    for (const n of old.nodes) {
        const y = motion.forward(n.vt);
        get(y).pre = n.vt;
        const d = place.dist(n.vt, y);
        disp.set(n.id, { d, img: y });
        if (target === null || d < target) target = d;
    }
    for (const n of old.nodes) get(n.vt, n.id);
    for (const n of neu.nodes) get(n.vt, n.id);
    for (const p of Y.values()) if (!p.pre) p.pre = motion.backward(p.vt);

    // the characteristic set of h in the old picture: its axis, fixed vertices, or inverted edge
    const least = motion.ell > 0 ? motion.ell : (target ?? 0) % 2;
    const charIds = new Set();
    for (const [id, e] of disp) if (e.d === least) charIds.add(id);
    const cur = old.byId.get(old.currentId) || old.byId.get(old.baseId) || old.rootNode;
    const nearest = (ids) => {
        let best = null, bd = Infinity;
        for (const id of ids) { const n = old.byId.get(id); const d = place.dist(n.vt, cur.vt); if (d < bd) { bd = d; best = n; } }
        return best;
    };

    // How the old picture moves: a flow that carries it roughly by h, and a sweep that takes
    // each point the rest of the way. A translation runs along the axis; about a fixed vertex,
    // each branch swings straight round to its image (a link permutation is seldom a rotation);
    // an inverted edge turns half way round its midpoint.
    let flow = still, pivot = null;
    // in the disk, a translation drawn with a bend at v is best followed by a fitted motion
    const fitted = () => {
        const pairs = [];
        for (const n of old.nodes) {
            const d = place.dist(n.vt, cur.vt);
            if (d > 2) continue;
            pairs.push({ z: unit(n.pos), w: clampDisk(unit(placeOf(old, disp.get(n.id).img))), wt: d === 0 ? 6 : d === 1 ? 2 : 1 });
        }
        return pairs.length >= 2 ? fittedDiskMotion(pairs) : diskTranslation(cur.pos, B_hc);
    };
    if (charIds.size) {
        const a = nearest(charIds);
        if (motion.ell > 0) {
            if (model === 'disk') flow = fitted();
        } else if (least === 0) {
            pivot = a.pos;
        } else {
            const b = old.byId.get(place.id(disp.get(a.id).img));
            if (b) {
                pivot = model === 'disk' ? hypLerp(a.pos, b.pos, 0.5) : lerp(a.pos, b.pos, 0.5);
                flow = model === 'disk' ? diskRotation(pivot, Math.PI) : planeRotation(pivot, Math.PI);
            }
        }
    } else if (model === 'disk') {
        flow = fitted();
    }
    const mixPt = model === 'disk' ? polarLerp : lerp;
    const sweep = !pivot ? mixPt : model === 'disk' ? sweepDiskAbout(pivot) : sweepPlaneAbout(pivot);

    // a translation whose axis is drawn rides a conveyor along it
    let conveyor = null, axisIndex = null;
    if (motion.ell > 0 && charIds.size) {
        const a0 = nearest(charIds).vt;
        // the axis neighbour of v towards h·v (forward) or h⁻¹·v (backward)
        const step = (v, dir) => {
            const t = dir > 0 ? motion.forward(v) : motion.backward(v);
            const d = place.dist(v, t);
            return place.neighbors(v).find((w) => place.dist(w, t) === d - 1);
        };
        const walk = (dir) => {
            const out = [];
            let v = a0, beyond = 0;
            while (out.length < 200) {
                v = step(v, dir);
                if (!v) break;
                out.push(v);
                if (!old.byId.has(place.id(v)) && ++beyond > motion.ell + 1) break;
            }
            return out;
        };
        const verts = [...walk(-1).reverse(), a0, ...walk(1)];
        if (verts.length >= 2) {
            conveyor = makeConveyor(model, place, verts.map((vt) => ({ vt, pos: placeOf(old, vt) })));
            axisIndex = new Map(verts.map((vt, n) => [place.id(vt), n]));     // backward → forward
        }
    }
    const parts = [];
    for (const p of Y.values()) {
        const preNode = old.byId.get(place.id(p.pre));
        const mid = old.byId.get(p.id), end = neu.byId.get(p.id);
        p.A = preNode ? preNode.pos : placeOf(old, p.pre);
        p.B = mid ? mid.pos : placeOf(old, p.vt);
        p.E = end ? end.pos : placeOf(neu, p.vt);
        p.Bm = flow.inv ? flow.inv(p.B) : flow(p.B, -1);
        if (conveyor) p.belt = conveyor.hold(p.pre, p.A, p.vt, p.B);
        p.axisIdx = axisIndex ? axisIndex.get(p.id) : undefined;
        p.o = [preNode ? 1 : 0, mid ? 1 : 0, end ? 1 : 0];
        p.k0 = (preNode || mid || end || { kind: 'plain' }).kind;
        p.k2 = (end || mid || preNode || { kind: 'plain' }).kind;
        p.h0 = preNode ? preNode.cell : false;
        p.h2 = end ? end.cell : false;
        p.preId = preNode ? preNode.id : null;
        if (p.o[0] || p.o[1] || p.o[2]) parts.push(p);
    }
    // edges between particles, with the looks of their preimages (old) and of themselves (new)
    const edges = [];
    for (const p of parts) {
        const q = Y.get(place.id(place.parent(p.vt)));
        if (!q || !(q.o[0] || q.o[1] || q.o[2])) continue;
        const l0 = p.preId && q.preId ? old.linkByPair.get(pairKey(p.preId, q.preId)) : null;
        const l2 = neu.linkByPair.get(pairKey(p.id, q.id)) || null;
        const cellOf = (l, aId) => (l && l.cell ? { fromP: l.cell.from.id === aId, t: l.cell.t } : null);
        const len = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const onAxis = p.axisIdx !== undefined && q.axisIdx !== undefined;
        edges.push({
            p, q,
            axis: onAxis ? (p.axisIdx < q.axisIdx ? [p, q] : [q, p]) : null,          // [from, to] along the translation
            ref: Math.max(len(p.A, q.A), len(p.B, q.B), len(p.E, q.E), 4),
            hull0: l0 && l0.hull ? 1 : 0, hull2: l2 && l2.hull ? 1 : 0,
            rat0: !!(l0 && l0.rat), rat2: !!(l2 && l2.rat),
            cell0: cellOf(l0, p.preId), cell2: cellOf(l2, p.id),
        });
    }
    // the axis, carried by the camera
    const axisSegs = [];
    const axisPt = (n) => ({ B: n.pos, E: placeOf(neu, n.vt) });
    for (const l of old.links) {
        if (!charIds.has(l.s.id) || !charIds.has(l.t.id)) continue;
        let [from, to] = [l.s, l.t];
        if (motion.ell > 0) {
            const gf = disp.get(from.id).img;
            if (place.dist(to.vt, gf) > place.dist(from.vt, gf)) [from, to] = [to, from];
        }
        axisSegs.push({ a: axisPt(from), b: axisPt(to) });
    }
    if (least === 0 && !axisSegs.length && charIds.size === 1) {
        // a lone fixed vertex: a short glowing ring is drawn by its point (a degenerate segment)
        const n = old.byId.get([...charIds][0]);
        axisSegs.push({ a: axisPt(n), b: axisPt(n), point: true });
    }

    // what h is, in words
    let caption = null;
    if (motion.tex) {
        const fixedAt = least === 0 && charIds.size ? nearest(charIds) : null;
        caption = motion.ell > 0 ? `${motion.tex}\\colon\\ \\text{translation by } \\ell = ${motion.ell}`
            : least === 1 ? `${motion.tex}\\colon\\ \\text{inverts an edge}`
                : fixedAt ? `${motion.tex}\\colon\\ \\text{elliptic, fixing } \\lfloor ${place.labelTex(fixedAt.vt)} \\rfloor_{${fixedAt.vt.k}}`
                    : `${motion.tex}\\colon\\ \\text{elliptic}`;
    }
    return {
        old, neu, model, parts, edges, flow, mixPt, sweep, conveyor, axisSegs, arrows: motion.ell > 0,
        caption,
        movingAxis: !!axisIndex,
        dur: 1400,
    };
}

function start(job) {
    S.anim = job;
    job.t0 = performance.now();
    if (S.glow) { cancelAnimationFrame(S.glow.raf); clearTimeout(S.glow.timer); S.glow = null; }
    setHover(null);
    const speed = 1 + 0.7 * S.queue.length;
    const dur = job.dur / speed;
    const step = (now) => {
        const t = Math.min(1, (now - job.t0) / dur);
        paint(frameAt(job, t));
        if (t < 1) { job.raf = requestAnimationFrame(step); return; }
        finish(job);
    };
    job.raf = requestAnimationFrame(step);
}

function finish(job) {
    S.anim = null;
    S.scene = job.neu;
    S.lastModel = job.model;
    if (S.queue.length) {
        const next = S.queue.shift();
        start(prepare(S.scene, next.opts, next.motion));
        return;
    }
    // let the axis linger, then fade
    if (job.axisSegs.length) {
        const segs = job.axisSegs.map((s) => ({ a: s.a.E, b: s.b.E, point: s.point }));
        const glow = { t0: performance.now(), raf: 0, alpha: 1 };
        glow.frameAxis = () => ({ segs: segs.filter((s) => !s.point), points: segs.filter((s) => s.point).map((s) => s.a), arrows: job.arrows, alpha: glow.alpha });
        S.glow = glow;
        const fade = (now) => {
            const u = (now - glow.t0) / 900;
            glow.alpha = 1 - smooth(Math.max(0, (u - 0.35) / 0.65));
            paintStatic();
            if (u < 1) { glow.raf = requestAnimationFrame(fade); return; }
            S.glow = null;
            paintStatic();
        };
        glow.raf = requestAnimationFrame(fade);
        // without animation frames (a hidden tab) the glow still goes
        glow.timer = setTimeout(() => { if (S.glow === glow) { cancelAnimationFrame(glow.raf); S.glow = null; paintStatic(); } }, 1400);
    } else paintStatic();
}

/** The picture a fraction t of the way through an animation. */
function frameAt(job, t) {
    const { old, neu, model, flow, mixPt, sweep, conveyor } = job;
    if (conveyor) conveyor.reset();
    // s1: the tree moves by h; s2: the looks it carried settle into the new picture's
    const s1 = win(t, TIMING.move), s2 = win(t, TIMING.settle);
    // where each particle is now
    for (const p of job.parts) {
        let q = s1 >= 1 ? p.B : s1 <= 0 ? p.A : p.belt ? conveyor.at(p.belt, s1) : sweep(flow(p.A, s1), flow(p.Bm, s1), s1);
        if (s2 > 0) q = mixPt(q, p.E, s2);          // only if the picture itself changed
        p.now = q;
        const o1 = p.o[0] + (p.o[1] - p.o[0]) * s1;
        p.alpha = o1 + (p.o[2] - o1) * s2;
    }
    const edges = [], cell = [], rat = [], halos = [], dots = [], glowSegs = [];
    for (const e of job.edges) {
        // an edge whose ends swing apart fades rather than slicing across the picture
        const stretch = Math.hypot(e.p.now.x - e.q.now.x, e.p.now.y - e.q.now.y) / e.ref;
        const a = Math.min(e.p.alpha, e.q.alpha) * (stretch < 1.6 ? 1 : Math.max(0, 1 - (stretch - 1.6) / 1.4));
        if (a < 0.01) continue;
        // a translation's axis: the tree's own axis edges glow as they travel
        if (e.axis && job.movingAxis) glowSegs.push({ a: e.axis[0].now, b: e.axis[1].now, alpha: a });
        edges.push({ a: e.p.now, b: e.q.now, alpha: a, hull: e.hull0 + (e.hull2 - e.hull0) * s2 });
        if (e.rat0 || e.rat2) rat.push({ a: e.p.now, b: e.q.now, alpha: a * ((e.rat0 ? 1 - s2 : 0) + (e.rat2 ? s2 : 0)) });
        for (const [c, w] of [[e.cell0, 1 - s2], [e.cell2, s2]]) {
            if (!c || w < 0.01) continue;
            cell.push(c.fromP ? { a: e.p.now, b: e.q.now, t: c.t, alpha: a * w } : { a: e.q.now, b: e.p.now, t: c.t, alpha: a * w });
        }
    }
    for (const p of job.parts) {
        if (p.alpha < 0.01) continue;
        const k0 = p.k0, k2 = p.k2;
        if (k0 === k2) dots.push({ p: p.now, kind: k0, alpha: p.alpha });
        else {
            if (1 - s2 > 0.01) dots.push({ p: p.now, kind: k0, alpha: p.alpha * (1 - s2) });
            if (s2 > 0.01) dots.push({ p: p.now, kind: k2, alpha: p.alpha * s2 });
        }
        const h = (p.h0 ? 1 - s2 : 0) + (p.h2 ? s2 : 0);
        if (h > 0.01) halos.push({ p: p.now, alpha: p.alpha * h });
    }
    // the axis: still while the tree slides along it
    let axis = null;
    if (job.movingAxis) {
        // the axis is the tree's own axis edges, glowing as they travel
        axis = { segs: glowSegs, points: [], arrows: true, alpha: smooth(t / 0.14) };
    } else if (job.axisSegs.length) {
        const pt = (a) => mixPt(a.B, a.E, s2);
        axis = {
            segs: job.axisSegs.filter((s) => !s.point).map((s) => ({ a: pt(s.a), b: pt(s.b) })),
            points: job.axisSegs.filter((s) => s.point).map((s) => pt(s.a)),
            arrows: job.arrows,
            alpha: smooth(t / 0.14),
        };
    }
    dots.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    const fadeOut = 1 - smooth(t / 0.12), fadeIn = smooth((t - 0.86) / 0.14);
    return {
        model,
        metrics: mixMetrics(old.metrics, neu.metrics, s2),
        frames: sameFrame(old, neu) ? [[neu, 1]] : [[old, 1 - s2], [neu, s2]],
        edges, rat, cell, halos, dots, axis,
        fixed: neu,
        namedAlpha: Math.max(fadeOut, fadeIn),
        transient: [[old, fadeOut], [neu, fadeIn]],
        notes: frameNotes(job, t),
    };
}
/** The caption naming h, as a LaTeX label. */
function frameNotes(job, t) {
    const env = (u0, u1, v0, v1) => Math.min(smooth((t - u0) / (u1 - u0)), 1 - smooth((t - v0) / (v1 - v0)));
    return job.caption ? [{ key: 'caption', tex: job.caption, screen: 'caption', alpha: env(0, 0.08, 0.9, 1) }] : [];
}
function sameFrame(a, b) {
    if (a === b) return true;
    if (a.model === 'disk') return a.maxDist === b.maxDist;
    return a.rootK === b.rootK && a.levels.length === b.levels.length && Math.abs(a.metrics.sy - b.metrics.sy) < 1e-6
        && Math.abs(a.stub.x - b.stub.x) < 0.5;
}
const KIND_ORDER = { plain: 0, hull: 1, orbit: 2, current: 3 };
