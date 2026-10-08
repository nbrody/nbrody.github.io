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
import { HALF, attach, childFrame, standardChild, edgeGap, rootFrame, frameAt, lerpFrame, scaleOf, toCF, lerpCF, cfPoint, cfDisk } from './layout.js';
import { Q } from './rational.js';
import { primitive } from './poly.js';
import { specMat, qmul, qdet, latticeKey } from './specialize.js';
import * as UI from './panel.js';
import { EXAMPLES } from './examples.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv');

const MAXP = 30000;       // planes per build
const MIN_PX = 0.6;       // planes smaller than this (projected radius) are dropped with their subtrees
const DETAIL_PX = 18;     // Farey geodesics and horocycles only on planes at least this big
const ORTHO_DIST = 60;

const st = { dep: 4, N: 8, lam: 0.6, h: -1, edges: 'q', base: 'half', far: true, hor: false, ortho: false, dur: 1.6 };

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

// Translucent disks for planes landing on the base when t is specialized (a per-instance opacity).
const GHOSTS = 8000;
const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
ghostMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor.a *= vAlpha;');
};
const ghostGeo = flatDisk(64);
ghostGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(GHOSTS), 1));
const ghosts = new THREE.InstancedMesh(ghostGeo, ghostMat, GHOSTS);
ghosts.setColorAt(0, new THREE.Color());
ghosts.count = 0;
ghosts.frustumCulled = false;
scene.add(ghosts);

// The upper half-plane, truncated to [−X, X] × [0, Y] and faded out at the cut.
const fade = (x, y) => {
    const s = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
    return y < -1e-9 ? 0 : s((HALF.X - Math.abs(x)) / HALF.FADEX) * s((HALF.Y - y) / HALF.FADEY);
};
const halfGeo = new THREE.PlaneGeometry(2 * HALF.X, HALF.Y, 40 * HALF.X, 48).rotateX(-Math.PI / 2).translate(0, 0, -HALF.Y / 2);
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
    if (!rec.noAxis) circleLocal(L_, F, 0, 0, 1, rs, mixRGBA(P.str, rec));
    if (rec.bare || !(rs > DETAIL_PX && (st.far || st.hor))) return;
    const Nc = Math.min(rec.Nc || st.N, rs > 140 ? st.N : rs > 50 ? 4 : 2);
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
        const n = 20 * HALF.X;
        if (y <= HALF.Y) for (let i = 0; i < n; i++) fseg(L_, -HALF.X + 2 * HALF.X * i / n, y, -HALF.X + 2 * HALF.X * (i + 1) / n, y, col);
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
    if (!rec.noAxis) for (let i = 0, n = 20 * X; i < n; i++) fseg(L_, -X + 2 * X * i / n, 0, -X + 2 * X * (i + 1) / n, 0, P.axis);
    if (rec.bare) return;
    const N = rec.Nc || st.N;
    if (!C) {
        const R0 = farey(-X, X, N);
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
    const set = baseDiskSet(N);
    if (st.far) for (const [p1, q1, p2, q2] of set.e) halfGeodesic(L_, vec(C, p1, q1), vec(C, p2, q2), P.line);
    if (st.hor) for (const [p, q] of set.v) halfHorocycle(L_, vec(C, p, q), P.horo[0]);
}

// ---------- a plane between the half-plane and a disk (layout.js, conformal frames) ----------
// Its contents are sampled in the unit-disk picture ζ, carried to ℍ by z = (1 − iζ)/(ζ − i),
// and drawn by the frame. While it is mostly the half-plane it fades out where the strip does;
// as it rounds into a disk the rest of it fades in. Only the base plane and the plane replacing
// it ever morph, so two fills are enough.
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
function invCay(a, b) {
    const nr = 1 + b, ni = -a, dr = a, di = b - 1, d2 = dr * dr + di * di;
    if (d2 < 1e-12) return [0, 1e4];
    return [(nr * dr + ni * di) / d2, (ni * dr - nr * di) / d2];
}
function morphMesh() {
    const NR = 36, NA = 144, zeta = [], idx = [];
    for (let i = 0; i <= NR; i++) {
        const r = 1 - Math.pow(1 - i / NR, 1.7);            // rings crowd toward the boundary, where the strip is
        for (let j = 0; j < NA; j++) zeta.push(r * Math.cos(2 * Math.PI * j / NA), r * Math.sin(2 * Math.PI * j / NA));
    }
    for (let i = 0; i < NR; i++) {
        for (let j = 0; j < NA; j++) {
            const a = i * NA + j, b = i * NA + (j + 1) % NA, c = a + NA, d = b + NA;
            idx.push(a, b, c, b, d, c);
        }
    }
    const n = zeta.length / 2, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(4 * n), 4));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    mesh.userData.zeta = new Float32Array(zeta);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
}
const morphMeshes = [morphMesh(), morphMesh()];

// the arc of the unit disk joining two boundary points, as a parametrized curve
function zetaArc([ax, ay], [cx, cy], k) {
    const D = Math.acos(Math.max(-1, Math.min(1, ax * cx + ay * cy)));
    if (D < 1e-9) return null;
    if (Math.PI - D < 1e-9) return (i) => [ax + (cx - ax) * i / k, ay + (cy - ay) * i / k];
    const ml = Math.hypot(ax + cx, ay + cy), dist = 1 / Math.cos(D / 2), rho = Math.tan(D / 2);
    const mx = (ax + cx) / ml * dist, my = (ay + cy) / ml * dist, a1 = Math.atan2(ay - my, ax - mx);
    let da = Math.atan2(cy - my, cx - mx) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return (i) => [mx + rho * Math.cos(a1 + da * i / k), my + rho * Math.sin(a1 + da * i / k)];
}

// a point of the unit-disk picture ζ on a conformal frame: world position and the strip's fade there
function cfAt(F, a, b) {
    const lam = smooth01(F.tau / 2), [x, y] = invCay(a, b), [px, py, lift] = cfPoint(F, x, y);
    return [px, F.z + lift, -py, lam + (1 - lam) * fade(x, y)];
}
const farPt = (p) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) > 1e3;
function cfPoly(L_, F, k, f, col, mult = 1) {
    let p0 = cfAt(F, ...f(0));
    for (let i = 1; i <= k; i++) {
        const p1 = cfAt(F, ...f(i)), a0 = p0[3] * mult, a1 = p1[3] * mult;
        if ((a0 > 0.003 || a1 > 0.003) && !farPt(p0) && !farPt(p1)) L_.seg(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], col, a0, a1);
        p0 = p1;
    }
}
const circleZ = (k) => (i) => [Math.cos(2 * Math.PI * i / k), Math.sin(2 * Math.PI * i / k)];
// the Farey tessellation (and the Ford horocycles) carried by C, drawn on a conformal frame
function cfFarey(L_, F, C, Nc, k, mult, rec) {
    const set = baseDiskSet(Nc);
    if (st.far) {
        for (const [p1, q1, p2, q2] of set.e) {
            const f = zetaArc(Bv(...vec(C, p1, q1)), Bv(...vec(C, p2, q2)), k);
            if (f) cfPoly(L_, F, k, f, P.line, mult);
        }
    }
    if (st.hor) {
        for (const [p, q] of set.v) {
            const [P_, Q_] = vec(C, p, q), D = 2 / (1 + P_ * P_ + Q_ * Q_);
            if (D < 0.004) continue;
            const [ba, bb] = Bv(P_, Q_), ca = ba * (1 - D / 2), cb = bb * (1 - D / 2), r = D / 2;
            cfPoly(L_, F, 48, (i) => [ca + r * Math.cos(2 * Math.PI * i / 48), cb + r * Math.sin(2 * Math.PI * i / 48)], mixRGBA(P.horo, rec), mult);
        }
    }
}

function drawMorph(L_, rec, mesh) {
    const F = rec.F, C = rec.C, lam = smooth01(F.tau / 2), at = (a, b) => cfAt(F, a, b);
    if (mesh) {
        const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, Z = mesh.userData.zeta, c = mixColor(P.fill, rec);
        for (let i = 0; i < pos.count; i++) {
            const p = at(Z[2 * i], Z[2 * i + 1]);
            pos.setXYZ(i, p[0], p[1], p[2]);
            col.setXYZW(i, c.r, c.g, c.b, p[3]);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        mesh.visible = true;
    }
    // the boundary: the real axis curling up into the circle
    const S = mixRGBA(P.str, rec), edgeCol = P.axis.map((x, i) => x + (S[i] - x) * lam);
    cfPoly(L_, F, 360, circleZ(360), edgeCol);
    cfFarey(L_, F, C, st.N, 40, 1, rec);
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
    if (spec.items) {                       // specialized: draw the collapse instead of the tree
        if (spec.run || spec.act) return;
        if (spec.sig !== settingsSig()) refreshItems();
        drawCollapse(ease(spec.s));
        return;
    }
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
// a disk frame's instance matrix, turned about its diameter through ∞ when flipping
function diskMatrix(F) {
    if (F.flip) return M4.makeRotationAxis(axis.set(F.ux, 0, -F.uy), -F.flip).scale(S3.set(F.R, 1, F.R)).setPosition(F.cx, F.z, -F.cy);
    return M4.makeScale(F.R, 1, F.R).setPosition(F.cx, F.z, -F.cy);
}
function drawRecs(list) {
    ghosts.count = 0;
    let nHi = 0, nLo = 0, nMorph = 0;
    halfFlip = 0;
    halfMesh.rotation.z = 0;
    halfMesh.visible = list.some((r) => r.F.half);
    const L_ = new Segs();
    for (const rec of list) {
        const F = rec.F;
        rec.mesh = null;
        if (F.half) { drawHalf(L_, rec); continue; }
        if (F.cf) {
            drawMorph(L_, rec, morphMeshes[nMorph++]);
            if (rec.gap) {
                const [ax, ay, , , lift] = attach(F, 1, 0);
                L_.seg(ax, F.z + lift, -ay, ax, F.z + lift - rec.gap, -ay, P.edge);
            }
            continue;
        }
        const rs = rec.rs ?? pxRadius(F.cx, F.z, F.cy, F.R);
        if (rs < MIN_PX) continue;
        const hi = rs > 60;
        if ((hi ? nHi : nLo) >= MAXP) continue;
        const m = hi ? diskHi : diskLo, i = hi ? nHi++ : nLo++;
        m.setMatrixAt(i, diskMatrix(F));
        m.setColorAt(i, mixColor(P.fill, rec));
        rec.mesh = m; rec.inst = i;
        drawDisk(L_, rec, rs);
        if (rec.gap) {
            const ax = F.cx + F.R * F.ux, ay = F.cy + F.R * F.uy;
            L_.seg(ax, F.z, -ay, ax, F.z - rec.gap, -ay, P.edge);
        }
    }
    for (let k = nMorph; k < morphMeshes.length; k++) morphMeshes[k].visible = false;
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
    if (spec.items) {                       // collapsed: γ acts on the one plane by γ(a)
        if (spec.s >= 1) { specQueue.push([i, inverse]); if (!spec.act && !spec.run) startSpecAct(); }
        return;
    }
    queue.push(inverse ? { M: G.Minv, Minv: G.M, letter: [i, -1] } : { M: G.M, Minv: G.Minv, letter: [i, 1] });
    if (!anim) startNext();
}

function startNext() {
    const job = queue.shift();
    if (!job) return;
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
        // the half-plane rolls up into a disk (or a disk unrolls into it) through conformal frames
        it.morph = it.spine && !a.F.half !== !b.F.half;
        if (it.morph) { it.C0 = toCF(a.F); it.C1 = toCF(b.F); }
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
            F = it.morph ? lerpCF(it.C0, it.C1, e) : lerpFrame(it.F0, it.F1, e);
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
    commitJob(anim.job);
    anim = null;
    build();
    showElement();
    startNext();
}

// The current element becomes γ·g.
function commitJob(job) {
    g = normalizePGL(mmul(job.M, g));
    gInv = normalizePGL(mmul(gInv, job.Minv));
    gIsId = isScalar(g);
    const [i, e] = job.letter;
    if (word.length && word[0][0] === i && word[0][1] === -e) word.shift(); else word.unshift(job.letter);
    decor.clear();
}

function resetElement() {
    queue.length = 0;
    anim = null;
    g = gInv = IDENTITY;
    gIsId = true;
    word = [];
    decor.clear();
    if (spec.items) refreshItems();
    build();
    showElement();
}

// ---------- specializing t ↦ a: the planes collapse onto one ----------
// Evaluating at t = a sends PGL₂(ℚ[t, 1/t]) to PGL₂(ℚ), which acts on a single hyperbolic plane;
// the plane X(v) is identified with it by its frame, z ↦ g_v(a)·z (specialize.js). The tree
// view shows g applied to the standard tree, so the plane at u = gv, which carries X(v) by the
// local map h, lands as g(a)·g_v(a). The collapse unrolls every plane onto the base through
// the conformal frames of layout.js while its contents move from h to g(a)·g_v(a); collapsed,
// the generators act on the one plane by γ(a). The planes landing as the same tessellation
// (the same lattice g(a)·g_v(a)·ℤ² up to scale) are drawn once.
const spec = { a: Q.ONE, s: 0, items: null, sources: null, sig: '', run: null, act: null };
const specQueue = [];
const OVERLAYS = 24, SPEC_MIN_PX = 2;
const ID = [1, 0, 0, 1];
const settingsSig = () => `${st.base}|${st.edges}|${st.h}|${st.lam}`;

function specItems(sources) {
    const ga = specMat(g, spec.a), fc = new Map(), baseCF = toCF(rootFrame(st));
    return sources.map((v) => {
        let u = v, d = null;
        if (!gIsId) { const lm = localMap(g, v); u = lm.labels; d = fnorm(toFloat(lm.h)); }
        const { F, gap } = frameAt(u, st, fc);
        const Mq = qmul(ga, specMat(frameOf(v), spec.a)), M = fnorm(Mq.map((x) => x.toNumber()));
        // Where it lands: on the half-plane, M = A·K with A: z ↦ β + αz taking i to M·i and K a
        // rotation about i, so the plane unrolls around its own place in the frame A and only K
        // turns its contents. (A disk base has no such frames, so there it is the base and K = M.)
        let CFt = baseCF, K = M;
        if (baseCF.tau === 0) {
            const z0 = fdet(M) > 0 ? [0, 1] : [0, -1];   // the isometry is z ↦ M·z, or M·z̄ when det M < 0
            const nr = M[0] * z0[0] + M[1], ni = M[0] * z0[1], dr = M[2] * z0[0] + M[3], di = M[2] * z0[1], dd = dr * dr + di * di;
            const beta = (nr * dr + ni * di) / dd, alpha = (ni * dr - nr * di) / dd;
            CFt = { ...baseCF, T: [beta, 0], kap: alpha };
            K = fnorm(fmul([1, -beta, 0, alpha], M));
        }
        const rel = d ? fmul(K, finv(d)) : K, flip = fdet(rel) < 0;
        return {
            key: keyOf(v), v, u, root: !u.length, dep: u.length, F0: F, CF0: F.half ? null : toCF(F), CFt, gap0: gap,
            d, M, Mq, flip, P: mobiusPath(flip ? fmul(RHO, rel) : rel),
        };
    });
}
// The planes with the biggest pictures keep their tessellations, one for each lattice.
function chooseOverlays(items) {
    setupCull();
    for (const it of items) it.rs = it.root ? Infinity : pxRadius(it.F0.cx, it.F0.z, it.F0.cy, it.F0.R);
    const seen = new Set();
    for (const it of [...items].sort((a, b) => b.rs - a.rs)) {
        const k = latticeKey(it.Mq);
        it.overlay = !seen.has(k) && seen.size < OVERLAYS;
        if (it.overlay) seen.add(k);
    }
}
function prepareCollapse() {
    setupCull();
    const seen = new Set(), sources = [];
    for (const r of recs) {
        if (r.labels.length && (r.rs ?? 0) < SPEC_MIN_PX) continue;
        const src = (decor.get(r.key) || {}).src || r.labels, k = keyOf(src);
        if (!seen.has(k)) { seen.add(k); sources.push(src); }
    }
    spec.sources = sources;
    spec.items = specItems(sources);
    chooseOverlays(spec.items);
    spec.sig = settingsSig();
    setHover(-1);
    recs = [];
}
// Recompute after the element, the settings or a change: the same planes, the same overlays.
function refreshItems(rechoose = false) {
    const keep = new Map(spec.items.map((it) => [it.key, it]));
    spec.items = specItems(spec.sources);
    if (rechoose) chooseOverlays(spec.items);
    else for (const it of spec.items) { const o = keep.get(it.key); it.overlay = o && o.overlay; it.rs = o ? o.rs : 0; }
    spec.sig = settingsSig();
}

// One frame of the collapse at amount e (0 the tree, 1 one plane), or of γ(a) acting once collapsed.
function drawCollapse(e, act) {
    setupCull();
    const L_ = new Segs(), root = rootFrame(st), ga = ghosts.geometry.attributes.aAlpha;
    let nHi = 0, nLo = 0, nG = 0, rootDrawn = false;
    halfFlip = 0;
    halfMesh.rotation.z = 0;
    halfMesh.visible = !!root.half;
    for (const k of morphMeshes) k.visible = false;
    const drawBase = (rec) => {
        if (root.half) { drawHalf(L_, rec); return; }
        const m = diskHi, i = nHi++;
        m.setMatrixAt(i, diskMatrix(rec.F));
        m.setColorAt(i, P.fill[0]);
        drawDisk(L_, rec, pxRadius(rec.F.cx, rec.F.z, rec.F.cy, rec.F.R));
    };
    for (const it of spec.items) {
        // its contents: from the tree picture (h) to the identification g(a)·g_v(a), then γ(a)
        let C, flip;
        if (e >= 1) { C = it.M; flip = 0; } else { C = fmul(it.P(e), it.d || ID); flip = it.flip ? Math.PI * e : 0; }
        if (act) { C = fmul(act.Hs, C); flip += act.flip; }
        if (it.root) { drawBase({ F: { ...root, flip }, C, labels: [], dep: 0, gap: 0 }); rootDrawn = true; continue; }
        if (e >= 1) {                       // landed: only the overlays remain, drawn on the base itself
            if (it.overlay) {
                const rec = { F: { ...root, flip }, C, labels: [], dep: it.dep, gap: 0, noAxis: true, Nc: Math.min(st.N, 6) };
                if (root.half) drawHalf(L_, rec); else drawDisk(L_, rec, pxRadius(root.cx, root.z, root.cy, root.R));
            }
            continue;
        }
        const F = { ...lerpCF(it.CF0, it.CFt, e), flip }, fadeA = 1 - e;
        const D = F.tau > 0.02 ? cfDisk(F) : null, rs = D ? pxRadius(D.cx, D.z, D.cy, D.R) : Infinity;
        if (fadeA > 0.01) {
            if (D && rs > MIN_PX && nG < GHOSTS) {
                ghosts.setMatrixAt(nG, diskMatrix(D));
                ghosts.setColorAt(nG, P.fill[it.dep % 2]);
                ga.setX(nG++, 0.9 * fadeA * fadeA);
            }
            const k = Math.min(200, Math.max(16, Math.ceil(rs * 0.8)));
            if (rs > 1.5) cfPoly(L_, F, k, circleZ(k), P.str[it.dep % 2], fadeA);
            const [ax, ay, , , lift] = attach(F, 1, 0), gp = it.gap0 * fadeA;
            if (gp) L_.seg(ax, F.z + lift, -ay, ax, F.z + lift - gp, -ay, P.edge, fadeA, fadeA);
        }
        // the overlays keep their tessellations; the rest fade as they land on a copy of one
        const rsNow = Math.min(rs, it.rs || 0, 400);
        if (it.overlay) cfFarey(L_, F, C, Math.min(st.N, 5), 36, 1, it);
        else if (fadeA > 0.01 && rsNow > DETAIL_PX) cfFarey(L_, F, C, rsNow > 140 ? Math.min(st.N, 5) : 2, 24, fadeA, it);
    }
    if (!rootDrawn) drawBase({ F: { ...root, flip: act ? act.flip : 0 }, C: null, labels: [], dep: 0, gap: 0, bare: true });
    ghosts.count = nG;
    ghosts.instanceMatrix.needsUpdate = true;
    if (ghosts.instanceColor) ghosts.instanceColor.needsUpdate = true;
    ga.needsUpdate = true;
    for (const [mm, n] of [[diskHi, nHi], [diskLo, nLo]]) {
        mm.count = n;
        mm.instanceMatrix.needsUpdate = true;
        mm.instanceColor.needsUpdate = true;
    }
    lines.geometry.dispose();
    lines.geometry = L_.geometry();
    hiLines.geometry.dispose();
    hiLines.geometry = new THREE.BufferGeometry();
    dirty = true;
}

function startSpecRun(to) {
    if (anim || spec.act || spec.run) return;
    if (!spec.items) { if (to <= 0) return; clearTimeout(buildTimer); prepareCollapse(); }
    spec.run = { from: spec.s, to, t0: performance.now(), dur: st.dur * 1600 };
    // the camera follows: down onto the one plane, or back out to the tree
    const v = to > 0 ? collapsedView() : defaultView();
    flyTo(v.target, v.dir, v.size, spec.run.dur);
    syncSpecUI();
}
function collapsedView() {
    const half = st.base === 'half', dir = new THREE.Vector3(0, Math.cos(0.75), Math.sin(0.75));
    return { target: new THREE.Vector3(0, 0, half ? -0.9 : 0), dir, size: half ? 1.7 : 1.4 };
}
function startSpecAct() {
    const next = specQueue.shift();
    if (!next) return;
    const [i, inverse] = next, G = gens[i];
    if (!G) return;
    const job = inverse ? { M: G.Minv, Minv: G.M, letter: [i, -1] } : { M: G.M, Minv: G.Minv, letter: [i, 1] };
    const Ma = specMat(job.M, spec.a);
    if (qdet(Ma).isZero()) { startSpecAct(); return; }
    const hf = fnorm(toFloat(Ma)), fl = fdet(hf) < 0;
    spec.act = { job, H: mobiusPath(fl ? fmul(RHO, hf) : hf), fl, t0: performance.now(), dur: st.dur * 1000 };
}
function stepSpec(now) {
    if (spec.act) {
        const A = spec.act, k = reduceMotion() ? 1 : Math.min(1, (now - A.t0) / A.dur), e = ease(k);
        drawCollapse(1, { Hs: A.H(e), flip: A.fl ? Math.PI * e : 0 });
        if (k < 1) return;
        commitJob(A.job);
        spec.act = null;
        refreshItems();
        drawCollapse(1);
        showElement();
        syncSpecUI();
        startSpecAct();
        return;
    }
    if (!spec.run) return;
    const r = spec.run, k = reduceMotion() ? 1 : Math.min(1, (now - r.t0) / r.dur);
    spec.s = r.from + (r.to - r.from) * k;
    if (k >= 1) {
        spec.s = r.to;
        spec.run = null;
        if (spec.s <= 0) { spec.items = null; spec.s = 0; build(); } else drawCollapse(ease(spec.s));
    } else drawCollapse(ease(spec.s));
    syncSpecUI();
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
    syncSpecUI();
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
    showSpecList();
}

// ---------- the specialization panel ----------
const aName = () => spec.a.toString().replace('-', '−');
function qMatTex(Mq) {
    const e = primitive(Mq.map((q) => (q.isZero() ? [] : [q]))).map((p) => (p.length ? p[0].toString() : '0'));
    return `\\begin{pmatrix} ${e[0]} & ${e[1]} \\\\ ${e[2]} & ${e[3]} \\end{pmatrix}`;
}
function showSpecList() {
    const el = $('spec-list'), a = aName();
    const rows = gens.map((G, i) => {
        const Ma = specMat(G.M, spec.a);
        return qdet(Ma).isZero() ? `<div><b>${gName(i)}</b>(${a}) is singular, so it does not act once t = ${a}</div>`
            : `<div><b>${gName(i)}</b>(${a}) = \\(${qMatTex(Ma)}\\)</div>`;
    });
    rows.push(`<div>current element at t = ${a}: \\(${qMatTex(specMat(g, spec.a))}\\)</div>`);
    el.innerHTML = rows.join('');
    UI.typeset([el]);
}
function syncSpecUI() {
    const collapsed = !!spec.items && spec.s >= 1 && !spec.run;
    $('spec-s').value = spec.s;
    $('spec-sO').textContent = spec.s <= 0 ? 't = ∞' : spec.s >= 1 ? `t = ${aName()}` : '→';
    $('spec-go').textContent = collapsed ? 'Expand back to the tree' : `Collapse to t = ${aName()}`;
    document.querySelectorAll('#isometry-controls .isometry-btn').forEach((b, i) => {
        const G = gens[i], singular = G && qdet(specMat(G.M, spec.a)).isZero();
        b.disabled = !!spec.items && (!collapsed || singular);
        b.title = !spec.items ? 'Apply this generator (⌘/Ctrl-click for its inverse)'
            : !collapsed ? 'Finish collapsing or expanding first'
                : singular ? `Singular at t = ${aName()}` : `Act on the plane by its value at t = ${aName()} (⌘/Ctrl-click for the inverse)`;
    });
}
function readSpecA() {
    try {
        const { num, den } = parseRat($('spec-a').value);
        if (den.length !== 1 || num.length > 1) throw new Error('t can only be set to a number.');
        if (!num.length) throw new Error('t = 0 is not allowed: frames and entries involve 1/t.');
        spec.a = num[0];
        $('spec-err').textContent = '';
    } catch (err) {
        $('spec-err').textContent = err.message;
        return;
    }
    if (spec.items) { refreshItems(true); if (!spec.run && !spec.act) drawCollapse(ease(spec.s)); }
    showSpecList();
    syncSpecUI();
}
let specTimer = 0;
$('spec-a').addEventListener('input', () => { clearTimeout(specTimer); specTimer = setTimeout(readSpecA, 300); });
$('spec-s').addEventListener('input', (ev) => {
    if (anim || spec.run || spec.act) { syncSpecUI(); return; }
    const s = parseFloat(ev.target.value);
    if (!spec.items) {
        if (s <= 0) return;
        clearTimeout(buildTimer);
        prepareCollapse();
    }
    spec.s = s;
    if (s <= 0) { spec.items = null; spec.s = 0; build(); } else drawCollapse(ease(s));
    syncSpecUI();
});
$('spec-go').onclick = () => startSpecRun(spec.items && spec.s >= 1 ? 0 : 1);

function loadExample(i) {
    const ex = EXAMPLES[i];
    UI.setMatrices(ex.gens);
    $('example-note').textContent = ex.note || '';
    refreshGenerators();
    resetElement();
}

// ---------- hover & path ----------
let hoverIdx = -1, lastPointer = null;
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
function hover(X, Y) { if (!anim && !spec.items) setHover(pick(X, Y)); }

function showInfo() {
    const chip = $('hover-chip');
    const rec = recs[hoverIdx];
    if (!rec || anim) { chip.textContent = ''; return; }
    const n = recs.length + (truncated ? '+' : '');
    const d = decor.get(rec.key);
    const carried = d && keyOf(d.src) !== rec.key ? ` · carries the plane of ${pathName(d.src)} under the current element` : '';
    chip.innerHTML = (rec.labels.length ? `<b>${pathName(rec.labels)}</b> · distance ${rec.dep} from v₀`
        : '<b>Base plane X(v₀)</b>, where SL₂(ℤ) acts') + carried + ` · ${n} planes drawn`;
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

function flyTo(target, dir, size, dur = 700) {
    fly = { t0: performance.now(), dur, T0: controls.target.clone(), T1: target.clone(), D0: viewDir(), D1: dir.clone().normalize(), s0: viewSize(), s1: size };
}
function stepFly(now) {
    if (!fly) return;
    const k = ease(reduceMotion() ? 1 : Math.min(1, (now - fly.t0) / fly.dur));
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
    if (anim || spec.items) return;
    const b = cv.getBoundingClientRect(), i = pick(e.clientX - b.left, e.clientY - b.top);
    if (i >= 0) flyToPlane(i);
});

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
    if (spec.run || spec.act) stepSpec(now);
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
    spec, startSpecRun, stepSpec, drawCollapse,
    nonFinite: () => [...lines.geometry.attributes.position.array].filter((x) => !Number.isFinite(x)).length,
};
