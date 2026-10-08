// Tree of hyperbolic planes for SL₂(ℤ[t]), in 3D, with the group acting on it.
//
// Every vertex of the tree is a hyperbolic plane drawn flat (layout.js); plane coordinates
// (x, y) at height z sit in the world at (x, z, −y), so the top view is the flat picture.
// Geometry is rebuilt from the camera: a plane and everything below it is skipped once it is
// under a pixel or out of view.
//
// The picture is always "the current element g applied to the standard tree": the planes sit
// where the layout puts them, and the plane at u shows the Farey tessellation of the plane at
// g⁻¹u carried over by the local map (treeAction.js). Applying a generator γ animates every
// plane to its image: planes ride the cusps of their parents while those turn by their local
// maps, except the few on the segment [γ⁻¹v₀, v₀], which change parent and fly straight.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { farey, diskSet, baseDiskSet } from './farey.js';
import { fromPoly, mmul, adj, det, IDENTITY, isScalar, lTex, normalizePGL } from './laurent.js';
import { parseRat } from './polyParse.js';
import { polyMatrix } from './poly.js';
import { frameOf, vertexOf, localMap, classify, keyOf, cuspKey, isPrefix, toFloat, fmul, finv, fdet, fnorm, RHO, mobiusPath } from './treeAction.js';
import { HALF, childFrame, standardChild, edgeGap, rootFrame, frameAt, lerpFrame, scaleOf } from './layout.js';
import * as UI from './panel.js';
import { EXAMPLES } from './examples.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv');

const MAXP = 30000;       // planes per build
const MIN_PX = 1.2;       // planes smaller than this (projected radius) are dropped with their subtrees
const DETAIL_PX = 18;     // Farey geodesics and horocycles only on planes at least this big
const ORTHO_DIST = 60;

const st = { dep: 3, N: 6, lam: 0.6, h: -1, edges: 'q', base: 'half', far: true, hor: false, ortho: false, dur: 1.6 };

// ---------- palette ----------
const PAL = {
    dark: { bg: '#0b0d16', fill: ['#26215C', '#04342C'], str: ['#AFA9EC', '#5DCAA5'], horo: ['#7F77DD', '#1D9E75'],
        line: ['#ffffff', 0.2], edge: ['#ffffff', 0.32], axis: ['#ffffff', 0.55], hi: '#F0997B', hiFill: '#712B13' },
    light: { bg: '#f3f5fb', fill: ['#E6E4FD', '#DAF2E8'], str: ['#534AB7', '#0F6E56'], horo: ['#AFA9EC', '#5DCAA5'],
        line: ['#000000', 0.17], edge: ['#000000', 0.28], axis: ['#000000', 0.45], hi: '#D85A30', hiFill: '#FAECE7' },
};
const rgba = (hex, a = 1) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b, a]; };
const isLight = () => document.documentElement.classList.contains('light');
let P;
function setPalette() {
    const p = isLight() ? PAL.light : PAL.dark;
    P = {
        bg: new THREE.Color(p.bg),
        fill: p.fill.map((h) => new THREE.Color(h)),
        hiFill: new THREE.Color(p.hiFill),
        str: p.str.map((h) => rgba(h)),
        horo: p.horo.map((h) => rgba(h, 0.9)),
        line: rgba(...p.line), edge: rgba(...p.edge), axis: rgba(...p.axis), hi: rgba(p.hi),
    };
    renderer.setClearColor(P.bg);
    paintHalf();
}

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const persp = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2 * ORTHO_DIST + 40);
let camera = persp;
const controls = new OrbitControls(camera, cv);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.zoomToCursor = true;
controls.minDistance = 1e-4;
controls.maxDistance = 30;
controls.minZoom = 0.03;
controls.maxZoom = 1e5;

const fillMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const flatDisk = (n) => new THREE.CircleGeometry(1, n).rotateX(-Math.PI / 2);
const diskHi = new THREE.InstancedMesh(flatDisk(160), fillMat, MAXP);
const diskLo = new THREE.InstancedMesh(flatDisk(28), fillMat, MAXP);
for (const m of [diskHi, diskLo]) {
    m.setColorAt(0, new THREE.Color());
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
}

// The upper half-plane, truncated to [−X, X] × [0, Y] and faded out at the cut.
const fade = (x, y) => {
    const s = (t) => { t = Math.min(1, Math.max(0, t / HALF.FADE)); return t * t * (3 - 2 * t); };
    return y < -1e-9 ? 0 : s(HALF.X - Math.abs(x)) * s(HALF.Y - y);
};
const halfGeo = new THREE.PlaneGeometry(2 * HALF.X, HALF.Y, 120, 48).rotateX(-Math.PI / 2).translate(0, 0, -HALF.Y / 2);
halfGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(halfGeo.attributes.position.count * 4), 4));
const halfMesh = new THREE.Mesh(halfGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
}));
scene.add(halfMesh);
function paintHalf() {
    const pos = halfGeo.attributes.position, col = halfGeo.attributes.color, c = P.fill[0];
    for (let i = 0; i < pos.count; i++) col.setXYZW(i, c.r, c.g, c.b, fade(pos.getX(i), -pos.getZ(i)));
    col.needsUpdate = true;
}

const lineMat = () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat());
const hiLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat());
lines.renderOrder = 1;
hiLines.renderOrder = 2;
for (const l of [lines, hiLines]) { l.frustumCulled = false; scene.add(l); }

// ---------- line buffer ----------
class Segs {
    constructor(n = 8192) { this.p = new Float32Array(6 * n); this.c = new Float32Array(8 * n); this.n = 0; }
    seg(x1, y1, z1, x2, y2, z2, col, a1 = 1, a2 = 1) {
        if (6 * (this.n + 1) > this.p.length) {
            const p = new Float32Array(this.p.length * 2), c = new Float32Array(this.c.length * 2);
            p.set(this.p); c.set(this.c); this.p = p; this.c = c;
        }
        const p = this.p, c = this.c, i = 6 * this.n, j = 8 * this.n++;
        p[i] = x1; p[i + 1] = y1; p[i + 2] = z1; p[i + 3] = x2; p[i + 4] = y2; p[i + 5] = z2;
        c[j] = c[j + 4] = col[0]; c[j + 1] = c[j + 5] = col[1]; c[j + 2] = c[j + 6] = col[2];
        c[j + 3] = col[3] * a1; c[j + 7] = col[3] * a2;
    }
    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, 6 * this.n), 3));
        g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, 8 * this.n), 4));
        return g;
    }
}

// ---------- drawing a disk plane: local (a, b) ↦ c + R(a·r + b·u), r = (u_y, −u_x) ----------
// In mid-flip the disk is turned by F.flip about its diameter through ∞: a·r becomes a·(cos θ·r + sin θ·up).
function tw(F, a, b) {
    const th = F.flip;
    const c = th ? Math.cos(th) * a : a;
    return [F.cx + F.R * (c * F.uy + b * F.ux), th ? F.z + F.R * Math.sin(th) * a : F.z, -(F.cy + F.R * (-c * F.ux + b * F.uy))];
}
const Bv = (P_, Q_) => { const s = P_ * P_ + Q_ * Q_; return [2 * P_ * Q_ / s, (P_ * P_ - Q_ * Q_) / s]; };
const vec = (C, p, q) => (C ? [C[0] * p + C[1] * q, C[2] * p + C[3] * q] : [p, q]);

function polyLocal(L_, F, k, f, col) {
    let p0 = tw(F, ...f(0));
    for (let i = 1; i <= k; i++) {
        const p1 = tw(F, ...f(i));
        L_.seg(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], col);
        p0 = p1;
    }
}
function circleLocal(L_, F, ca, cb, r, rs, col) {
    const k = Math.min(200, Math.max(10, Math.ceil(rs * 1.1)));
    polyLocal(L_, F, k, (i) => [ca + r * Math.cos(2 * Math.PI * i / k), cb + r * Math.sin(2 * Math.PI * i / k)], col);
}
// The geodesic of the unit disk between two boundary points.
function geodesicLocal(L_, F, [ax, ay], [cx, cy], rs, col) {
    const D = Math.acos(Math.max(-1, Math.min(1, ax * cx + ay * cy)));
    if (D < 1e-9) return;
    if (Math.PI - D < 1e-9) { polyLocal(L_, F, 1, (i) => (i ? [cx, cy] : [ax, ay]), col); return; }
    const ml = Math.hypot(ax + cx, ay + cy), dist = 1 / Math.cos(D / 2), rho = Math.tan(D / 2);
    const mx = (ax + cx) / ml * dist, my = (ay + cy) / ml * dist;
    const a1 = Math.atan2(ay - my, ax - mx);
    let da = Math.atan2(cy - my, cx - mx) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const k = Math.min(64, Math.max(2, Math.ceil(rho * Math.abs(da) * rs / 5)));
    polyLocal(L_, F, k, (i) => [mx + rho * Math.cos(a1 + da * i / k), my + rho * Math.sin(a1 + da * i / k)], col);
}

function drawDisk(L_, rec, rs) {
    const F = rec.F, C = rec.C;
    circleLocal(L_, F, 0, 0, 1, rs, mixRGBA(P.str, rec));
    if (!(rs > DETAIL_PX && (st.far || st.hor))) return;
    const Nc = rs > 140 ? st.N : rs > 50 ? Math.min(st.N, 4) : Math.min(st.N, 2);
    // carried contents can bring the cusps near ∞ into view, so use the set closed under S
    const full = C || rec.labels.length === 0, set = full ? baseDiskSet(Nc) : diskSet(Nc);
    if (st.far) {
        for (const [p1, q1, p2, q2] of set.e) geodesicLocal(L_, F, Bv(...vec(C, p1, q1)), Bv(...vec(C, p2, q2)), rs, P.line);
    }
    if (st.hor) {
        for (const [p, q] of full ? set.v : [...set.v, [1, 0]]) {
            const [P_, Q_] = vec(C, p, q), D = 2 / (1 + P_ * P_ + Q_ * Q_);
            if (D / 2 * rs < 0.8) continue;
            const [ba, bb] = Bv(P_, Q_);
            circleLocal(L_, F, ba * (1 - D / 2), bb * (1 - D / 2), D / 2, D / 2 * rs, mixRGBA(P.horo, rec));
        }
    }
}

// ---------- drawing the base half-plane (points of ℍ are plane coordinates) ----------
// mid-flip, the half-plane is turned by halfFlip about the line x = 0
let halfFlip = 0;
function fseg(L_, x1, y1, x2, y2, col) {
    const a1 = fade(x1, y1), a2 = fade(x2, y2);
    if (!(a1 > 0 || a2 > 0)) return;
    if (!halfFlip) { L_.seg(x1, 0, -y1, x2, 0, -y2, col, a1, a2); return; }
    const c = Math.cos(halfFlip), s = Math.sin(halfFlip);
    L_.seg(x1 * c, x1 * s, -y1, x2 * c, x2 * s, -y2, col, a1, a2);
}
function halfArc(L_, x0, y0, r, t0, t1, col) {
    const rs = pxRadius(x0, 0, y0, r);
    if (rs < 0.8) return;
    const k = Math.min(96, Math.max(4, Math.ceil(rs * Math.abs(t1 - t0) / 5)));
    for (let i = 0; i < k; i++) {
        const s0 = t0 + (t1 - t0) * i / k, s1 = t0 + (t1 - t0) * (i + 1) / k;
        fseg(L_, x0 + r * Math.cos(s0), y0 + r * Math.sin(s0), x0 + r * Math.cos(s1), y0 + r * Math.sin(s1), col);
    }
}
const xOf = ([P_, Q_]) => (Math.abs(Q_) <= 1e-12 * Math.abs(P_) ? Infinity : P_ / Q_);
function halfGeodesic(L_, V1, V2, col) {
    const x1 = xOf(V1), x2 = xOf(V2);
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
        const x = Number.isFinite(x1) ? x1 : x2;
        if (!Number.isFinite(x) || Math.abs(x) > HALF.X) return;
        for (let i = 0; i < 24; i++) fseg(L_, x, HALF.Y * i / 24, x, HALF.Y * (i + 1) / 24, col);
        return;
    }
    const m = (x1 + x2) / 2, r = Math.abs(x2 - x1) / 2;
    if (m - r > HALF.X || m + r < -HALF.X) return;
    if (r <= HALF.Y) { halfArc(L_, m, 0, r, 0, Math.PI, col); return; }
    const t = Math.min(Math.PI / 2, Math.asin(HALF.Y / r) * 1.05);   // only the feet of a big arc are under the cut
    halfArc(L_, m, 0, r, 0, t, col);
    halfArc(L_, m, 0, r, Math.PI - t, Math.PI, col);
}
function halfHorocycle(L_, [P_, Q_], col) {
    if (Math.abs(Q_) < 1e-9) {
        const y = P_ * P_;
        if (y <= HALF.Y) for (let i = 0; i < 60; i++) fseg(L_, -HALF.X + 2 * HALF.X * i / 60, y, -HALF.X + 2 * HALF.X * (i + 1) / 60, y, col);
        return;
    }
    const x = P_ / Q_, r = 1 / (2 * Q_ * Q_);
    if (Math.abs(x) - r > HALF.X || r < 1e-4) return;
    halfArc(L_, x, r, r, 0, 2 * Math.PI, col);
}
function drawHalf(L_, rec) {
    const { X } = HALF, C = rec.C;
    halfFlip = rec.F.flip || 0;
    halfMesh.rotation.z = halfFlip;
    for (let i = 0; i < 60; i++) fseg(L_, -X + 2 * X * i / 60, 0, -X + 2 * X * (i + 1) / 60, 0, P.axis);
    if (!C) {
        const R0 = farey(-X, X, st.N);
        if (st.far) {
            for (const [p1, q1, p2, q2] of R0.e) halfGeodesic(L_, [p1, q1], [p2, q2], P.line);
            for (let n = -X; n <= X; n++) halfGeodesic(L_, [n, 1], [1, 0], P.line);
        }
        if (st.hor) {
            for (const [p, q] of R0.v) halfHorocycle(L_, [p, q], P.horo[0]);
            halfHorocycle(L_, [1, 0], P.horo[0]);
        }
        return;
    }
    const set = baseDiskSet(st.N);
    if (st.far) for (const [p1, q1, p2, q2] of set.e) halfGeodesic(L_, vec(C, p1, q1), vec(C, p2, q2), P.line);
    if (st.hor) for (const [p, q] of set.v) halfHorocycle(L_, vec(C, p, q), P.horo[0]);
}

// Planes are coloured by the parity of their distance from v₀. An element whose determinant has
// odd valuation swaps the two classes, and the animation cross-fades: rec.mix = [k0, k1, e].
const mixC = new THREE.Color();
function mixColor(list, rec) {
    if (!rec.mix) return list[rec.dep % 2];
    const [k0, k1, e] = rec.mix;
    return mixC.copy(list[k0]).lerp(list[k1], e);
}
function mixRGBA(list, rec) {
    if (!rec.mix) return list[rec.dep % 2];
    const [k0, k1, e] = rec.mix, A = list[k0], B = list[k1];
    return A.map((x, i) => x + (B[i] - x) * e);
}

// ---------- the current element and the decorations it carries ----------
let gens = [];
let g = IDENTITY, gInv = IDENTITY, gIsId = true, word = [];
const decor = new Map();
function decorOf(labels, key) {
    if (gIsId) return null;
    let d = decor.get(key);
    if (!d) {
        const { labels: src, h } = localMap(gInv, labels);
        d = { C: fnorm(finv(toFloat(h))), src };
        decor.set(key, d);
    }
    return d.C;
}

// ---------- building the planes at rest ----------
let recs = [], truncated = false, buildCost = 0, lastBuild = 0;
const camPos = new THREE.Vector3(), frustum = new THREE.Frustum(), box = new THREE.Box3(), M4 = new THREE.Matrix4();
let pxk = 1;
function pxRadius(x, z, y, R) {
    if (st.ortho) return R * pxk;
    return R * pxk / Math.max(1e-9, Math.hypot(x - camPos.x, z - camPos.y, -y - camPos.z));
}
function setupCull() {
    camera.updateMatrixWorld();
    camPos.copy(camera.position);
    frustum.setFromProjectionMatrix(M4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    pxk = st.ortho ? (cv.clientHeight / 2) * ortho.zoom / ortho.top : (cv.clientHeight / 2) / fovTan();
}

const halfKids = (N) => [...farey(-HALF.KIDS, HALF.KIDS, N).v, [1, 0]];

function visit(F, gap, labels, parent, dep) {
    const rs = pxRadius(F.cx, F.z, F.cy, F.R);
    if (dep > 0 && rs < MIN_PX) return false;
    const left = st.dep - dep, R = F.R;
    const zext = st.edges === 'levels' ? st.h * left : 2 * st.h * R, ext = left > 0 ? 3 * R : R;
    box.min.set(F.cx - ext, Math.min(F.z, F.z + zext), -F.cy - ext);
    box.max.set(F.cx + ext, Math.max(F.z, F.z + zext), -F.cy + ext);
    if (!frustum.intersectsBox(box)) return false;
    if (recs.length >= MAXP) { truncated = true; return false; }
    const idx = recs.length, key = keyOf(labels);
    recs.push({ F, gap, labels, key, parent, dep, rs, C: decorOf(labels, key) });
    if (left > 0) {
        // every child lies within 2R across and one edge down, which bounds how close it can be
        const gapMax = Math.abs(st.h) * (st.edges === 'levels' ? 1 : R);
        const near = st.ortho ? 1 : Math.max(1e-9, Math.hypot(F.cx - camPos.x, F.z - camPos.y, -F.cy - camPos.z) - 2 * R - gapMax);
        for (const [p, q] of (dep === 0 ? baseDiskSet(st.N) : diskSet(st.N)).v) {
            const { sigma, ell } = standardChild(F, p, q, st), r = sigma * R;
            if (r * pxk / near < MIN_PX) break;                      // the cusps come largest first
            const gp = edgeGap(ell, R, st);
            visit(childFrame(F, p, q, r, gp), gp, [...labels, [BigInt(p), BigInt(q)]], idx, dep + 1);
        }
    }
    return true;
}

function build() {
    if (anim) return;
    const t0 = performance.now();
    setupCull();
    recs = []; truncated = false;
    const root = rootFrame(st);
    halfMesh.visible = !!root.half;
    if (root.half) {
        recs.push({ F: root, gap: 0, labels: [], key: '', parent: -1, dep: 0, rs: Infinity, C: decorOf([], '') });
        for (const [p, q] of halfKids(st.N)) {
            const { sigma, ell } = standardChild(root, p, q, st), gp = edgeGap(ell, 1, st);
            visit(childFrame(root, p, q, sigma, gp), gp, [[BigInt(p), BigInt(q)]], 0, 1);
        }
    } else visit(root, 0, [], -1, 0);
    drawRecs(recs);
    hoverIdx = -2;            // the old index means nothing now; force the highlight to redraw
    lastBuild = performance.now();
    buildCost = lastBuild - t0;
    if (lastPointer) hover(lastPointer.x, lastPointer.y);
    else setHover(-1);
}

// Draw a list of planes: fills as instances, everything else as one set of line segments.
const axis = new THREE.Vector3(), S3 = new THREE.Vector3();
function drawRecs(list) {
    let nHi = 0, nLo = 0;
    halfFlip = 0;
    halfMesh.rotation.z = 0;
    const L_ = new Segs();
    for (const rec of list) {
        const F = rec.F;
        rec.mesh = null;
        if (F.half) { drawHalf(L_, rec); continue; }
        const rs = rec.rs ?? pxRadius(F.cx, F.z, F.cy, F.R);
        if (rs < MIN_PX) continue;
        const hi = rs > 60;
        if ((hi ? nHi : nLo) >= MAXP) continue;
        const m = hi ? diskHi : diskLo, i = hi ? nHi++ : nLo++;
        if (F.flip) M4.makeRotationAxis(axis.set(F.ux, 0, -F.uy), -F.flip).scale(S3.set(F.R, 1, F.R)).setPosition(F.cx, F.z, -F.cy);
        else M4.makeScale(F.R, 1, F.R).setPosition(F.cx, F.z, -F.cy);
        m.setMatrixAt(i, M4);
        m.setColorAt(i, mixColor(P.fill, rec));
        rec.mesh = m; rec.inst = i;
        drawDisk(L_, rec, rs);
        if (rec.gap) {
            const ax = F.cx + F.R * F.ux, ay = F.cy + F.R * F.uy;
            L_.seg(ax, F.z, -ay, ax, F.z - rec.gap, -ay, P.edge);
        }
    }
    for (const [m, n] of [[diskHi, nHi], [diskLo, nLo]]) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
    }
    lines.geometry.dispose();
    lines.geometry = L_.geometry();
    dirty = true;
}

// Rebuild after the camera settles, or during the move when builds are cheap.
let buildTimer = 0;
function scheduleBuild() {
    clearTimeout(buildTimer);
    if (buildCost < 25 && performance.now() - lastBuild > 180) build();
    else buildTimer = setTimeout(build, 90);
}

// ---------- the action ----------
let anim = null;
const queue = [];
const ease = (s) => (s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2);

function applyGenerator(i, inverse) {
    const G = gens[i];
    if (!G) return;
    queue.push(inverse ? { M: G.Minv, Minv: G.M, letter: [i, -1] } : { M: G.M, Minv: G.Minv, letter: [i, 1] });
    if (!anim) startNext();
}

function startNext() {
    const job = queue.shift();
    if (!job) return;
    if (st.base === 'half' && vertexOf(job.M).length) {
        setBase('disk');
        flash('This element moves the base plane, so it is shown in the disk picture.');
    }
    clearTimeout(buildTimer);
    build();
    setHover(-1);
    // the planes on screen, and the planes that will land on them
    const items = new Map();
    const add = (labels, key) => { if (!items.has(key)) items.set(key, { labels, key }); };
    for (const r of recs) add(r.labels, r.key);
    for (const r of recs) { const lv = vertexOf(mmul(job.Minv, frameOf(r.labels))); add(lv, keyOf(lv)); }
    const spine = vertexOf(job.Minv);             // the planes on [v₀, γ⁻¹v₀] change parent
    const fc = new Map();
    for (const it of items.values()) {
        const { labels: lu, h } = localMap(job.M, it.labels);
        // an orientation-reversing local map is the flip ρ: z ↦ −z̄ after ρh, which turns the plane over
        const hf = toFloat(h);
        it.flip = fdet(hf) < 0;
        it.H = mobiusPath(it.flip ? fmul(RHO, hf) : hf);
        it.d = decorOf(it.labels, it.key);
        it.dep = it.labels.length;
        it.dep1 = lu.length;
        const a = frameAt(it.labels, st, fc), b = frameAt(lu, st, fc);
        Object.assign(it, { F0: a.F, F1: b.F, gap0: a.gap, gap1: b.gap });
        it.spine = isPrefix(it.labels, spine);
        if (it.spine) continue;
        it.parentKey = keyOf(it.labels.slice(0, -1));
        const w = it.labels[it.labels.length - 1].map(Number), w1 = lu[lu.length - 1].map(Number);
        const c0 = standardChild(frameAt(it.labels.slice(0, -1), st, fc).F, w[0], w[1], st);
        const c1 = standardChild(frameAt(lu.slice(0, -1), st, fc).F, w1[0], w1[1], st);
        Object.assign(it, { w, sig0: c0.sigma, sig1: c1.sigma, ell0: c0.ell, ell1: c1.ell });
    }
    const order = [...items.values()].sort((a, b) => a.dep - b.dep);
    for (const it of order) if (!it.spine && !items.has(it.parentKey)) it.spine = true;
    anim = { job, order, items, t0: performance.now(), dur: st.dur * 1000 };
}

function animFrame(s) {
    const e = ease(s), frames = new Map(), out = [];
    setupCull();
    for (const it of anim.order) {
        let F, gap;
        if (it.spine) {
            F = lerpFrame(it.F0, it.F1, e);
            gap = it.gap0 + (it.gap1 - it.gap0) * e;
        } else {
            // ride the parent's cusp while the parent turns by its local map
            const Pf = frames.get(it.parentKey), Hp = anim.items.get(it.parentKey).Hs;
            const V = [Hp[0] * it.w[0] + Hp[1] * it.w[1], Hp[2] * it.w[0] + Hp[3] * it.w[1]];
            const sc = scaleOf(Pf), sig = Math.exp(Math.log(it.sig0) + (Math.log(it.sig1) - Math.log(it.sig0)) * e);
            gap = edgeGap(it.ell0 + (it.ell1 - it.ell0) * e, sc, st);
            F = childFrame(Pf, V[0], V[1], sig * sc, gap);
        }
        if (it.flip) F = { ...F, flip: Math.PI * e };
        it.Hs = it.H(e);
        frames.set(it.key, F);
        const mix = it.dep % 2 !== it.dep1 % 2 ? [it.dep % 2, it.dep1 % 2, e] : null;
        out.push({ F, gap, labels: it.labels, key: it.key, dep: it.dep, mix, C: it.d ? fmul(it.Hs, it.d) : it.Hs });
    }
    recs = out;
    drawRecs(out);
}

function stepAnim(now) {
    if (!anim) return;
    const s = reduceMotion() ? 1 : Math.min(1, (now - anim.t0) / anim.dur);
    animFrame(s);
    if (s < 1) return;
    const { job } = anim;
    g = normalizePGL(mmul(job.M, g));
    gInv = normalizePGL(mmul(gInv, job.Minv));
    gIsId = isScalar(g);
    const [i, e] = job.letter;
    if (word.length && word[0][0] === i && word[0][1] === -e) word.shift(); else word.unshift(job.letter);
    decor.clear();
    anim = null;
    build();
    showElement();
    startNext();
}

function resetElement() {
    queue.length = 0;
    anim = null;
    g = gInv = IDENTITY;
    gIsId = true;
    word = [];
    decor.clear();
    build();
    showElement();
}

// ---------- generators ----------
// Entries are rational functions of t. In PGL₂ a matrix can be scaled, so each generator is
// cleared of denominators and common factors; the engine then works with polynomials in t.
const ENTRY = ['(1,1)', '(1,2)', '(2,1)', '(2,2)'];
function readGenerators() {
    return UI.readMatrices().map((entries, gi) => {
        const rats = entries.map((src, e) => {
            try { return parseRat(src); } catch (err) {
                throw Object.assign(new Error(`g${gi + 1}, entry ${ENTRY[e]}: ${err.message}.`), { where: { gen: gi, entry: e } });
            }
        });
        if (rats.every((r) => !r.num.length)) throw Object.assign(new Error(`g${gi + 1} is the zero matrix.`), { where: { gen: gi } });
        const M = polyMatrix(rats).map(fromPoly);
        if (det(M).isZero()) throw Object.assign(new Error(`g${gi + 1} has determinant 0, so it is not in PGL₂.`), { where: { gen: gi } });
        const at0 = localMap(M, []).h;
        return { M, Minv: adj(M), info: classify(M), flips: at0[0].mul(at0[3]).sub(at0[1].mul(at0[2])).sign() < 0 };
    });
}
function refreshGenerators() {
    try {
        gens = readGenerators();
        $('matrix-error-message').textContent = '';
        UI.markError(null);
    } catch (err) {
        $('matrix-error-message').textContent = err.message;
        UI.markError(err.where);
        gens = [];
    }
    UI.setGeneratorButtons(gens.length, applyGenerator);
    showGenSummary();
}
let editTimer = 0;
UI.onMatrixEdit(() => { clearTimeout(editTimer); editTimer = setTimeout(refreshGenerators, 350); });

const cuspName = (c) => cuspKey(c).replace('-', '−');
const pathName = (labels) => ['v₀', ...labels.map(cuspName)].join(' → ');
const gName = (i, e = 1) => `g<sub>${i + 1}</sub>${e < 0 ? '<sup>−1</sup>' : ''}`;
function showGenSummary() {
    const el = $('gen-summary');
    if (!gens.length) { el.innerHTML = '<span class="label-hint">No generators.</span>'; return; }
    el.innerHTML = gens.map(({ info, flips }, i) => {
        const d = info.moved.length;
        let s;
        if (info.kind === 'hyperbolic') s = `<span class="kind">hyperbolic</span>: translates an axis by ${info.ell}, and moves v₀ a distance ${d}`;
        else if (info.kind === 'inversion') s = `<span class="kind">inversion</span>: swaps the two ends of the edge from ${pathName(info.edge[0])} to ${pathName(info.edge[1])}`;
        else if (!d) s = `<span class="kind">fixes v₀</span>, ${flips ? 'reflecting its plane' : 'turning its plane'} by an element of PGL₂(ℚ)`;
        else s = `<span class="kind">elliptic</span>: turns the tree about ${pathName(info.fixed)}, moving v₀ a distance ${d}`;
        return `<div><b>${gName(i)}</b> ${s}</div>`;
    }).join('');
}
function showElement() {
    $('current-word').innerHTML = word.length ? word.map(([i, e]) => gName(i, e)).join(' ') : 'e';
    const el = $('current-matrix');
    el.innerHTML = `\\[\\begin{pmatrix} ${lTex(g[0])} & ${lTex(g[1])} \\\\ ${lTex(g[2])} & ${lTex(g[3])} \\end{pmatrix}\\]`;
    UI.typeset([el]);
}

function loadExample(i) {
    const ex = EXAMPLES[i];
    UI.setMatrices(ex.gens);
    $('example-note').textContent = ex.note || '';
    refreshGenerators();
    resetElement();
}

// ---------- hover & path ----------
let hoverIdx = -1, lastPointer = null, flashText = '', flashTimer = 0;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

function pick(X, Y) {
    ndc.set(X / cv.clientWidth * 2 - 1, 1 - Y / cv.clientHeight * 2);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-12) return -1;
    let best = -1, bt = Infinity;
    for (let i = 0; i < recs.length; i++) {
        const F = recs[i].F, t = (F.z - o.y) / d.y;
        if (t <= 0 || t >= bt) continue;
        if (!F.half && !recs[i].mesh) continue;
        const x = o.x + t * d.x, y = -(o.z + t * d.z);
        const inside = F.half ? Math.abs(x) <= HALF.X && y >= 0 && y <= HALF.Y && fade(x, y) > 0.3
            : (x - F.cx) ** 2 + (y - F.cy) ** 2 <= F.R * F.R;
        if (inside) { best = i; bt = t; }
    }
    return best;
}

const pathOf = (i) => { const out = []; for (; i >= 0; i = recs[i].parent) out.unshift(recs[i]); return out; };

// The path from v₀: each tree edge, and inside each plane on the way the geodesic from where the
// path comes in (∞, or the basepoint of the base) to the cusp where it leaves.
function drawPath(i) {
    const L_ = new Segs(256);
    if (i >= 0 && !anim) {
        const path = pathOf(i), last = path[path.length - 1];
        if (!last.F.half) circleLocal(L_, last.F, 0, 0, 1, 200, P.hi);
        for (let j = 1; j < path.length; j++) {
            const F = path[j].F, par = path[j - 1].F, w = path[j].labels[j - 1].map(Number);
            const ax = F.cx + F.R * F.ux, ay = F.cy + F.R * F.uy;
            L_.seg(ax, par.z, -ay, ax, F.z, -ay, P.hi);
            if (par.half) {
                if (w[1]) L_.seg(ax, 0, -1, ax, 0, 0, P.hi);
                else L_.seg(0, 0, -1, 0, 0, -HALF.Y, P.hi);
            } else if (j === 1) L_.seg(par.cx, par.z, -par.cy, ax, par.z, -ay, P.hi);
            else geodesicLocal(L_, par, [0, 1], Bv(w[0], w[1]), 200, P.hi);
        }
    }
    hiLines.geometry.dispose();
    hiLines.geometry = L_.geometry();
}

function setHover(i) {
    if (i === hoverIdx) return;
    const old = recs[hoverIdx];
    if (old && old.mesh) { old.mesh.setColorAt(old.inst, P.fill[old.dep % 2]); old.mesh.instanceColor.needsUpdate = true; }
    hoverIdx = i;
    const rec = recs[i];
    if (rec && rec.mesh) { rec.mesh.setColorAt(rec.inst, P.hiFill); rec.mesh.instanceColor.needsUpdate = true; }
    drawPath(i);
    showInfo();
    dirty = true;
}
function hover(X, Y) { if (!anim) setHover(pick(X, Y)); }

function showInfo() {
    const chip = $('hover-chip');
    if (flashText) { chip.textContent = flashText; return; }
    const rec = recs[hoverIdx];
    if (!rec || anim) { chip.textContent = ''; return; }
    const n = recs.length + (truncated ? '+' : '');
    const d = decor.get(rec.key);
    const carried = d && keyOf(d.src) !== rec.key ? ` · carries the plane of ${pathName(d.src)} under the current element` : '';
    chip.innerHTML = (rec.labels.length ? `<b>${pathName(rec.labels)}</b> · distance ${rec.dep} from v₀`
        : '<b>Base plane X(v₀)</b>, where SL₂(ℤ) acts') + carried + ` · ${n} planes drawn`;
}
function flash(text) {
    flashText = text;
    showInfo();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashText = ''; showInfo(); }, 4500);
}

// ---------- camera ----------
let fly = null, dirty = true, panelSpace = 0;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fovTan = () => Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
const viewDir = () => camera.position.clone().sub(controls.target).normalize();
// the half-height of the view at the target
const viewSize = () => (st.ortho ? ortho.top / ortho.zoom : camera.position.distanceTo(controls.target) * fovTan());
function setView(target, dir, size) {
    controls.target.copy(target);
    if (st.ortho) {
        ortho.zoom = ortho.top / size;
        ortho.updateProjectionMatrix();
        camera.position.copy(target).addScaledVector(dir, ORTHO_DIST);
    } else camera.position.copy(target).addScaledVector(dir, size / fovTan());
}

function flyTo(target, dir, size) {
    fly = { t0: performance.now(), T0: controls.target.clone(), T1: target.clone(), D0: viewDir(), D1: dir.clone().normalize(), s0: viewSize(), s1: size };
}
function stepFly(now) {
    if (!fly) return;
    const k = ease(reduceMotion() ? 1 : Math.min(1, (now - fly.t0) / 700));
    const s = Math.exp(Math.log(fly.s0) + (Math.log(fly.s1) - Math.log(fly.s0)) * k);
    const kk = Math.abs(fly.s1 - fly.s0) < 1e-9 ? k : (s - fly.s0) / (fly.s1 - fly.s0);
    setView(new THREE.Vector3().lerpVectors(fly.T0, fly.T1, kk), fly.D0.clone().lerp(fly.D1, k).normalize(), s);
    if (k >= 1) fly = null;
    dirty = true;
    if (!anim) scheduleBuild();
}

// Frame a rough bounding box of the tree from the front, a little above.
function defaultView() {
    const zext = st.h * (st.edges === 'levels' ? st.dep : 1.7);
    const E = 1 + 1.2 * st.lam;
    const [x0, x1, y0, y1] = st.base === 'disk' ? [-E, E, -E, E] : [-2.4, 2.4, -1 - 0.5 * st.lam, 1.8];
    const lo = new THREE.Vector3(x0, Math.min(0, zext), -y1), hi = new THREE.Vector3(x1, Math.max(0, zext), -y0);
    const target = lo.clone().add(hi).multiplyScalar(0.5);
    const dir = new THREE.Vector3(0, Math.cos(1.0), Math.sin(1.0));
    // smallest distance at which every corner is inside the free part of the view, with a margin
    const W = Math.max(1, cv.clientWidth - panelSpace), H = Math.max(1, cv.clientHeight);
    const ty = 0.86 * fovTan(), tx = 0.9 * fovTan() * W / H, cam = new THREE.PerspectiveCamera(), v = new THREE.Vector3();
    const fits = (d) => {
        cam.position.copy(target).addScaledVector(dir, d);
        cam.lookAt(target);
        cam.updateMatrixWorld();
        for (let i = 0; i < 8; i++) {
            v.set(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z).applyMatrix4(cam.matrixWorldInverse);
            if (v.z > -1e-6 || Math.abs(v.x / v.z) > tx || Math.abs(v.y / v.z) > ty) return false;
        }
        return true;
    };
    let a = 0.5, b = 40;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (fits(m)) b = m; else a = m; }
    return { target, dir, size: b * fovTan() };
}
function resetView(animate = true) {
    const v = defaultView();
    if (animate) { flyTo(v.target, v.dir, v.size); return; }
    setView(v.target, v.dir, v.size);
    controls.update();
}
function flyToPlane(i) {
    const F = recs[i].F;
    if (F.half) flyTo(new THREE.Vector3(0, 0, -0.8), viewDir(), 1.8);
    else flyTo(new THREE.Vector3(F.cx, F.z, -F.cy), viewDir(), F.R / 0.6);
}

function setProjection(isOrtho) {
    if (isOrtho === st.ortho) return;
    const T = controls.target.clone(), dir = viewDir(), size = viewSize();
    fly = null;
    st.ortho = isOrtho;
    camera = isOrtho ? ortho : persp;
    controls.object = camera;
    setView(T, dir, size);
    applyViewOffset();
    controls.update();
    build();
}

// Keep the picture centred in the part of the window the panel leaves free, and a little above
// the generator buttons.
function applyViewOffset() {
    const W = cv.clientWidth, H = cv.clientHeight, room = W > panelSpace + 200 ? panelSpace : 0, lift = 28;
    for (const c of [persp, ortho]) c.setViewOffset(W, H, room / 2, lift, W, H);
    document.documentElement.style.setProperty('--panel-space', `${room}px`);
}

// Near/far track the distance, so deep planes stay sharp.
function updateClip() {
    if (st.ortho) return;
    const d = persp.position.distanceTo(controls.target);
    persp.near = Math.max(1e-6, d * 0.01);
    persp.far = d * 40 + 20;
    persp.updateProjectionMatrix();
}

// ---------- events ----------
controls.addEventListener('change', () => { dirty = true; if (!anim) scheduleBuild(); });
controls.addEventListener('start', () => { fly = null; });

let down = null;
cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
cv.addEventListener('pointermove', (e) => {
    const b = cv.getBoundingClientRect();
    lastPointer = { x: e.clientX - b.left, y: e.clientY - b.top };
    if (e.buttons === 0) hover(lastPointer.x, lastPointer.y);
});
cv.addEventListener('pointerleave', () => { lastPointer = null; setHover(-1); });
cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
    down = null;
    if (anim) return;
    const b = cv.getBoundingClientRect(), i = pick(e.clientX - b.left, e.clientY - b.top);
    if (i >= 0) flyToPlane(i);
});

function setBase(v) {
    if (st.base === v) return;
    st.base = v;
    segBase.set(v);
    build();
    resetView(false);
}

UI.setupPanel({ onLayout: (w) => { panelSpace = w; applyViewOffset(); dirty = true; } });
const segBase = UI.segmented('seg-base', (v) => { st.base = v; build(); resetView(); });
const segProj = UI.segmented('seg-proj', (v) => setProjection(v === 'ortho'));
const segEdges = UI.segmented('seg-edges', (v) => { st.edges = v; build(); resetView(); });
segBase.set(st.base);
segProj.set('persp');
segEdges.set(st.edges);
UI.slider('dep', (v) => String(v), (v) => { st.dep = v; build(); });
UI.slider('den', (v) => String(v), (v) => { st.N = v; build(); });
UI.slider('lam', (v) => v.toFixed(2), (v) => { st.lam = v; build(); });
UI.slider('hgt', (v) => v.toFixed(2).replace('-', '−'), (v) => { st.h = v; build(); });
UI.slider('dur', (v) => `${v.toFixed(1)} s`, (v) => { st.dur = v; });
UI.toggle('toggle-farey', st.far, (v) => { st.far = v; build(); });
UI.toggle('toggle-horo', st.hor, (v) => { st.hor = v; build(); });
$('top-view').onclick = () => flyTo(controls.target, new THREE.Vector3(0, 1, 1e-4), viewSize());
$('reset-view').onclick = () => resetView();
$('save-png').onclick = () => {
    render();
    const a = document.createElement('a');
    a.download = 'tree-of-hyperbolic-planes.png';
    a.href = cv.toDataURL('image/png');
    a.click();
};
$('addMatrixBtn').onclick = () => { UI.addMatrixInput(); refreshGenerators(); };
$('refresh-btn').onclick = () => { refreshGenerators(); build(); };
$('reset-element').onclick = resetElement;

const exSel = $('example-select');
EXAMPLES.forEach((ex, i) => exSel.add(new Option(ex.name, String(i))));
exSel.onchange = () => loadExample(+exSel.value);

const themeBtns = [...document.querySelectorAll('.theme-opt')];
const syncTheme = () => themeBtns.forEach((b) => b.classList.toggle('active', (b.dataset.theme === 'light') === isLight()));
themeBtns.forEach((b) => b.addEventListener('click', () => {
    document.documentElement.classList.toggle('light', b.dataset.theme === 'light');
    try { localStorage.setItem('parshin-theme', b.dataset.theme); } catch (e) { /* storage blocked */ }
    syncTheme();
    setPalette();
    build();
}));
syncTheme();

function resize() {
    const w = cv.clientWidth, h = cv.clientHeight;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    Object.assign(ortho, { left: -w / h, right: w / h, top: 1, bottom: -1 });
    persp.updateProjectionMatrix();
    ortho.updateProjectionMatrix();
    applyViewOffset();
    build();
}
new ResizeObserver(resize).observe(cv);

function render() {
    updateClip();
    renderer.render(scene, camera);
}
function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    stepFly(now);
    controls.update();
    if (anim) stepAnim(now);
    if (dirty) { dirty = false; render(); }
}

setPalette();
resize();
resetView(false);
loadExample(0);
requestAnimationFrame(frameLoop);

// For headless checks (rAF may not run in a hidden pane).
window.__parshin = {
    st, build, render, get camera() { return camera; }, controls, get recs() { return recs; }, get anim() { return anim; },
    setHover, flyToPlane, resetView, stepFly, stepAnim, applyGenerator, setProjection, get g() { return g; },
};
