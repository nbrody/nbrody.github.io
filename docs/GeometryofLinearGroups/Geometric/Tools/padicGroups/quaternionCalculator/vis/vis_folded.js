// vis_folded.js - The square complex X_{p,q} folded into ℝ³ (three.js).
//
// Geometry. The vertex sits at the origin. Horizontal loop i is the circle of
// radius RH through 0 in the plane spanned by tᵢ and n⁰ᵢ = (0, cos φᵢ, sin φᵢ),
// where tᵢ = cos κ·x̂ + sin κ·(x̂ × n⁰ᵢ) is its direction at 0; vertical loop j is
// the circle of radius RV through 0 in the plane of sⱼ = cos κ·ẑ + sin κ·(ẑ × w⁰ⱼ)
// and w⁰ⱼ = (cos ψⱼ, sin ψⱼ, 0), with φᵢ, ψⱼ equally spaced. (Tilting sideways keeps
// each circle off its axis; the two pencils are then rotated so that no two circles
// come close away from 0.)
//
// Hyperplanes first. Square s (sides bottom a, right b, top a', left b') gets a
// centre Cₛ. Its vertical hyperplane arc γₛ runs from the midpoint of a through Cₛ
// to the midpoint of a', and its horizontal arc ηₛ from the midpoint of b' through
// Cₛ to that of b. Every arc leaves an edge midpoint perpendicular to the edge, and
// the q + 1 (or p + 1) arcs at a midpoint leave in evenly spaced directions around
// the edge, in the cyclic order of the directions toward their centres; between
// its ends an arc is two cubic Bézier pieces through Cₛ. A relaxation, then a
// polishing pass, move the centres until arcs of each family keep apart away from
// the midpoints. The square itself is the Gordon (transfinite) patch through its
// four sides and the two midlines γₛ, ηₛ, with quadratic Lagrange blending in u and
// in v.
//
// Each hyperplane is drawn as the ¼ and ¾ slices of its squares (u = ¼, ¾ for a
// vertical one). They glue along the edges into the boundary of the carrier, the
// orientation double cover of the hyperplane (connected exactly when the
// hyperplane is one-sided). Its vertices are the ¼ and ¾ points of the edges the
// hyperplane crosses: for a vertical hyperplane, the p + 1 generators a^{±1} (the
// first half of a lies on the side of a, the second on the side of a⁻¹). Sliding
// both slices along the squares to ½ is the covering map.
//
// Near the vertex each corner of a square is, to first order, the flat sector
// spanned by the tangents of its two sides, so the link of the vertex is drawn
// on S² by great-circle arcs. As κ → 0 the horizontal ends cluster at ±x̂ and the
// vertical ends at ±ẑ, which is Zarankiewicz's drawing of K_{p+1,q+1}.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TAU = Math.PI * 2;
const RH = 1.0;
const RV = 0.82;
const SLICE = 0.25;
const CHECK_SAMPLES = 32;
const CHECK_CELL = 0.12;
const RELAX_TARGET = 0.16;
const CENTRE_LEASH = 1.6;
// ---------- small helpers ----------

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function hslRgb(h, s, l) {
    const c = new THREE.Color();
    c.setHSL(((h % 360) + 360) % 360 / 360, s, l);
    return [c.r, c.g, c.b];
}

/**
 * Closest points of segments p1q1 and p2q2 (Ericson, RTCD §5.1.9).
 * Writes [distance, s, t, dx, dy, dz] into out, where (dx, dy, dz) points from
 * the second closest point to the first.
 */
function segClosest(p1, q1, p2, q2, out) {
    const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2];
    const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
    const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    if (a < 1e-14 && e < 1e-14) { s = t = 0; }
    else if (a < 1e-14) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e < 1e-14) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z;
            const den = a * e - b * b;
            s = den > 1e-14 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
            else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
        }
    }
    const x = rx + d1x * s - d2x * t, y = ry + d1y * s - d2y * t, z = rz + d1z * s - d2z * t;
    out[0] = Math.sqrt(x * x + y * y + z * z); out[1] = s; out[2] = t;
    out[3] = x; out[4] = y; out[5] = z;
    return out;
}

/**
 * Visit every pair of segments from the polylines that come within `cap` of each
 * other, except neighbouring segments of one polyline, pairs within `ball` of a
 * vertex both polylines end at, and (unless sameGroupOk) pairs from one group.
 * Each polyline: { pts: [[x,y,z]…], ends: [key0, key1] (graph vertices or null), group }.
 * visit(S, T, r) gets segments { pi, k, a, b } and r = segClosest(…).
 */
function forClosePairs(polys, cap, ball, sameGroupOk, visit) {
    const vpos = new Map();
    polys.forEach((P) => {
        if (P.ends[0] != null) vpos.set(P.ends[0], P.pts[0]);
        if (P.ends[1] != null) vpos.set(P.ends[1], P.pts[P.pts.length - 1]);
    });
    const cells = new Map();
    const segs = [];
    const pad = cap / 2;
    polys.forEach((P, pi) => {
        for (let k = 0; k + 1 < P.pts.length; k++) {
            const a = P.pts[k], b = P.pts[k + 1];
            const lo = [0, 1, 2].map((d) => Math.floor((Math.min(a[d], b[d]) - pad) / cap));
            const hi = [0, 1, 2].map((d) => Math.floor((Math.max(a[d], b[d]) + pad) / cap));
            if (!lo.every(Number.isFinite) || !hi.every(Number.isFinite)) continue;
            if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 4096) continue;
            const id = segs.length;
            segs.push({ pi, k, a, b, lo });
            for (let x = lo[0]; x <= hi[0]; x++)
                for (let y = lo[1]; y <= hi[1]; y++)
                    for (let z = lo[2]; z <= hi[2]; z++) {
                        const key = ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
                        let list = cells.get(key);
                        if (!list) cells.set(key, list = []);
                        list.push(id);
                    }
        }
    });
    const near = (p, v) => Math.hypot(p[0] - v[0], p[1] - v[1], p[2] - v[2]) < ball;
    const skip = (S, T) => {
        const P = polys[S.pi], Q = polys[T.pi];
        if (S.pi === T.pi) {
            if (Math.abs(S.k - T.k) <= 1) return true;
        } else if (!sameGroupOk && P.group === Q.group) return true;
        for (const v of P.ends) {
            if (v == null || !Q.ends.includes(v)) continue;
            const x = vpos.get(v);
            if ((near(S.a, x) || near(S.b, x)) && (near(T.a, x) || near(T.b, x))) return true;
        }
        return false;
    };
    const r = new Float64Array(6);
    for (const [cell, list] of cells) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const S = segs[list[i]], T = segs[list[j]];
                // visit each pair once: in the first cell both segments occupy
                const x = Math.max(S.lo[0], T.lo[0]), y = Math.max(S.lo[1], T.lo[1]), z = Math.max(S.lo[2], T.lo[2]);
                if (((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024) !== cell) continue;
                if (skip(S, T)) continue;
                segClosest(S.a, S.b, T.a, T.b, r);
                if (r[0] < cap) visit(S, T, r);
            }
        }
    }
}

/**
 * Sampled embedding check for a graph drawn by polylines.
 * Each polyline: { pts: [[x,y,z]…], ends: [key0, key1] (graph vertices or null), group }.
 * Returns { clearance, angle }: the minimum distance between distinct arcs
 * outside a ball of radius VERTEX_BALL around their common vertices (capped at
 * CHECK_CELL, which is as far as the spatial hash looks), and the minimum angle
 * (degrees) between arcs leaving a common vertex (from P.tan, the unit outward
 * tangents at the two ends, when given; else from the end segments). Arcs in the
 * same group are not compared when sameGroupOk is false.
 */
const VERTEX_BALL = 0.18;
function embeddingCheck(polys, sameGroupOk = true) {
    const tangents = new Map();
    const pushTan = (key, a, b) => {
        if (key == null) return;
        if (!tangents.has(key)) tangents.set(key, []);
        tangents.get(key).push(unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
    };
    polys.forEach((P) => {
        const n = P.pts.length;
        if (P.tan) {
            for (const e of [0, 1]) {
                if (P.ends[e] == null) continue;
                if (!tangents.has(P.ends[e])) tangents.set(P.ends[e], []);
                tangents.get(P.ends[e]).push(P.tan[e]);
            }
            return;
        }
        pushTan(P.ends[0], P.pts[0], P.pts[1]);
        pushTan(P.ends[1], P.pts[n - 1], P.pts[n - 2]);
    });
    let angle = 180;
    for (const list of tangents.values()) {
        for (let i = 0; i < list.length; i++)
            for (let j = i + 1; j < list.length; j++)
                angle = Math.min(angle, Math.acos(Math.max(-1, Math.min(1, dot(list[i], list[j])))) * 180 / Math.PI);
    }
    let best = CHECK_CELL;
    forClosePairs(polys, CHECK_CELL, VERTEX_BALL, sameGroupOk, (S, T, r) => { if (r[0] < best) best = r[0]; });
    return { clearance: best, angle };
}

/** Do great-circle arcs a1a2 and b1b2 (unit vectors) cross? */
function arcsCross(a1, a2, b1, b2) {
    const na = cross(a1, a2), nb = cross(b1, b2);
    let x = cross(na, nb);
    const len = Math.hypot(x[0], x[1], x[2]);
    if (len < 1e-12) return false;
    x = x.map((c) => c / len);
    const inArc = (y, p, q, n) => dot(cross(p, y), n) > 1e-12 && dot(cross(y, q), n) > 1e-12;
    for (const y of [x, x.map((c) => -c)]) if (inArc(y, a1, a2, na) && inArc(y, b1, b2, nb)) return true;
    return false;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- batched tubes ----------

export class TubeBatch {
    constructor(count, segs, radial, material) {
        this.count = count; this.segs = segs; this.radial = radial;
        const perTube = (segs + 1) * radial;
        const nv = count * perTube;
        this.pos = new Float32Array(nv * 3);
        this.nrm = new Float32Array(nv * 3);
        this.col = new Float32Array(nv * 3);
        const idx = new Uint32Array(count * segs * radial * 6);
        let k = 0;
        for (let t = 0; t < count; t++) {
            const base = t * perTube;
            for (let i = 0; i < segs; i++) {
                for (let j = 0; j < radial; j++) {
                    const a = base + i * radial + j, b = base + i * radial + (j + 1) % radial;
                    const c = a + radial, d = b + radial;
                    idx[k++] = a; idx[k++] = c; idx[k++] = b;
                    idx[k++] = b; idx[k++] = c; idx[k++] = d;
                }
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        this.geometry = g;
        this.mesh = new THREE.Mesh(g, material);
        this.mesh.frustumCulled = false;
        this.trisPerTube = segs * radial * 2;
    }

    /** pts: flat array of (segs+1) xyz triples. */
    setTube(t, pts, radius) {
        const { segs, radial } = this;
        let o = t * (segs + 1) * radial * 3;
        let nx = 0, ny = 0, nz = 0;
        let px = 0, py = 0, pz = 0;
        for (let i = 0; i <= segs; i++) {
            const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(segs, i + 1) * 3;
            let tx = pts[i1] - pts[i0], ty = pts[i1 + 1] - pts[i0 + 1], tz = pts[i1 + 2] - pts[i0 + 2];
            const tl = Math.hypot(tx, ty, tz);
            if (tl > 1e-12) { tx /= tl; ty /= tl; tz /= tl; px = tx; py = ty; pz = tz; }
            else { tx = px; ty = py; tz = pz; }
            if (i === 0) {
                // any vector not parallel to the tangent
                const ax = Math.abs(tx) < 0.8 ? 1 : 0, ay = ax ? 0 : 1;
                nx = ay * tz; ny = -ax * tz; nz = ax * ty - ay * tx;
            }
            // project previous normal (rotation-minimising up to first order)
            const d = nx * tx + ny * ty + nz * tz;
            nx -= d * tx; ny -= d * ty; nz -= d * tz;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
            const cx = pts[i * 3], cy = pts[i * 3 + 1], cz = pts[i * 3 + 2];
            for (let j = 0; j < radial; j++) {
                const th = TAU * j / radial, c = Math.cos(th), s = Math.sin(th);
                const ux = c * nx + s * bx, uy = c * ny + s * by, uz = c * nz + s * bz;
                this.pos[o] = cx + radius * ux; this.pos[o + 1] = cy + radius * uy; this.pos[o + 2] = cz + radius * uz;
                this.nrm[o] = ux; this.nrm[o + 1] = uy; this.nrm[o + 2] = uz;
                o += 3;
            }
        }
    }

    setColor(t, rgb) {
        const n = (this.segs + 1) * this.radial;
        for (let i = 0, o = t * n * 3; i < n; i++, o += 3) {
            this.col[o] = rgb[0]; this.col[o + 1] = rgb[1]; this.col[o + 2] = rgb[2];
        }
    }

    commit(colors = false) {
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.normal.needsUpdate = true;
        if (colors) this.geometry.attributes.color.needsUpdate = true;
    }

    dispose() { this.geometry.dispose(); }
}

/** A strip of (cols+1) × (rows+1) vertices per item, indexed as a grid. */
class GridBatch {
    constructor(count, cols, rows, material) {
        this.count = count; this.cols = cols; this.rows = rows;
        this.perItem = (cols + 1) * (rows + 1);
        const nv = count * this.perItem;
        this.pos = new Float32Array(nv * 3);
        this.col = new Float32Array(nv * 3);
        const idx = new Uint32Array(count * cols * rows * 6);
        let k = 0;
        for (let t = 0; t < count; t++) {
            const base = t * this.perItem;
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
                    idx[k++] = a; idx[k++] = b; idx[k++] = d;
                    idx[k++] = a; idx[k++] = d; idx[k++] = c;
                }
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        this.geometry = g;
        this.mesh = new THREE.Mesh(g, material);
        this.mesh.frustumCulled = false;
        this.trisPerItem = cols * rows * 2;
    }

    setColor(t, rgb) {
        for (let i = 0, o = t * this.perItem * 3; i < this.perItem; i++, o += 3) {
            this.col[o] = rgb[0]; this.col[o + 1] = rgb[1]; this.col[o + 2] = rgb[2];
        }
    }

    commit(colors = false) {
        this.geometry.attributes.position.needsUpdate = true;
        if (colors) this.geometry.attributes.color.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }

    dispose() { this.geometry.dispose(); }
}

/**
 * One translucent grid patch per square, as separate meshes so that they can be
 * drawn back to front (sortFor) instead of in triangle order.
 */
class PatchSet {
    constructor(count, cols, rows, material, baseOrder) {
        this.baseOrder = baseOrder;
        this.mesh = new THREE.Group();
        this.items = Array.from({ length: count }, (_, s) => {
            const b = new GridBatch(1, cols, rows, material);
            b.mesh.userData.s = s;
            b.centre = [0, 0, 0];
            this.mesh.add(b.mesh);
            return b;
        });
        this.cols = cols; this.rows = rows;
    }

    setColor(s, rgb) { this.items[s].setColor(0, rgb); }

    colorsChanged() { for (const b of this.items) b.geometry.attributes.color.needsUpdate = true; }

    /** Far patches first: renderOrder runs from baseOrder (farthest) to baseOrder + 0.9. */
    sortFor(camera) {
        const c = camera.position;
        let dmax = 1e-9;
        const d = this.items.map((b) => {
            const x = Math.hypot(b.centre[0] - c.x, b.centre[1] - c.y, b.centre[2] - c.z);
            dmax = Math.max(dmax, x);
            return x;
        });
        this.items.forEach((b, s) => { b.mesh.renderOrder = this.baseOrder + 0.9 * (1 - d[s] / dmax); });
    }

    dispose() { for (const b of this.items) b.dispose(); }
}

function textSprite(text, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fs = 44;
    ctx.font = `italic 600 ${fs}px "Times New Roman", serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 24, h = fs + 18;
    canvas.width = w; canvas.height = h;
    ctx.font = `italic 600 ${fs}px "Times New Roman", serif`;
    ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 12); else ctx.rect(0, 0, w, h);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(0.0042 * w, 0.0042 * h, 1);
    sprite.renderOrder = 10;
    return sprite;
}

// ---------- the view ----------

export const VIEW_PRESETS = {
    complex: { squares: true, edges: true, vertical: false, horizontal: false },
    vertical: { squares: false, edges: false, vertical: true, horizontal: false },
    horizontal: { squares: false, edges: false, vertical: false, horizontal: true },
    both: { squares: false, edges: false, vertical: true, horizontal: true }
};

export const COLORS = {
    vHyper: '#ff4fa3',
    hHyper: '#a3e635',
    vertex: '#ffd166'
};

export function hEdgeColor(i, m) { return `hsl(${(352 + 62 * (m > 1 ? i / (m - 1) : 0)) % 360}, 88%, 60%)`; }
export function vEdgeColor(j, n) { return `hsl(${172 + 108 * (n > 1 ? j / (n - 1) : 0)}, 78%, 62%)`; }

export class FoldedComplexView {
    constructor(container, { onSelect } = {}) {
        this.container = container;
        this.onSelect = onSelect || (() => { });
        this.params = {
            kappa: 0.28, opacity: 0.42, fold: 1,
            squares: true, edges: true, vertical: false, horizontal: false,
            ribbons: false, labels: true, arcColors: 'hyperplane', seed: 1, cover: 0
        };
        this.selected = -1;
        this.cx = null;
        // relaxation settings: polyline samples, clearance target, step, how far centres may move
        this.tune = { K: 24, target: RELAX_TARGET, step: 0.12, leash: CENTRE_LEASH };

        const w = container.clientWidth || 600, h = container.clientHeight || 500;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.setClearColor(0x0c111c, 1);
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 200);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(6.4, -7.6, 4.4);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 0.2, 0.1);

        this.scene.add(new THREE.HemisphereLight(0xf2f5ff, 0x3a4152, 2.4));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(4, -6, 9);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fb8ff, 0.7);
        rim.position.set(-6, 5, -3);
        this.scene.add(rim);

        this.root = new THREE.Group();
        this.scene.add(this.root);

        this.mats = {
            squares: new THREE.MeshStandardMaterial({
                vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: this.params.opacity,
                depthWrite: false, roughness: 0.55, metalness: 0.0
            }),
            edges: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }),
            arcs: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 }),
            ribbons: new THREE.MeshStandardMaterial({
                vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.45
            }),
            dots: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 }),
            vertex: new THREE.MeshStandardMaterial({ color: COLORS.vertex, emissive: 0x3a2a00, roughness: 0.3 })
        };

        this.raycaster = new THREE.Raycaster();
        this._down = null;
        const canvas = this.renderer.domElement;
        canvas.addEventListener('pointerdown', (e) => { this._down = [e.clientX, e.clientY]; });
        canvas.addEventListener('pointerup', (e) => {
            if (!this._down) return;
            const moved = Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]);
            this._down = null;
            if (moved < 5) this.pick(e);
        });

        this._tweens = {};
        this._dirty = true;
        this.controls.addEventListener('change', () => { this._dirty = true; });
        const loop = (now) => {
            requestAnimationFrame(loop);
            this._step(now);
        };
        requestAnimationFrame(loop);
    }

    // ----- public API -----

    setComplex(cx) {
        this.cx = cx;
        this.selected = -1;
        this.net = this._frames = this._flightCache = null;
        this._buildLayout();
        this._chooseShapes();
        this._allocate();
        this.fitCamera();
        if (this.params.fold < 1) this._captureNetFrame();
        this.update(true);
        this._startPolish();
        return this.stats();
    }

    setParams(patch) {
        Object.assign(this.params, patch);
        if (!this.cx) return;
        if ('kappa' in patch) { this._buildLayout(); this._stats = null; }
        this.mats.squares.opacity = this.params.opacity;
        this.update('arcColors' in patch || 'ribbons' in patch);
    }

    /** Start again from fresh random centres. */
    newImmersion() {
        if (!this.cx) return null;
        this.params.seed = (this.params.seed * 48271 + 11) % 2147483647;
        this._polishToken = null;
        this.shape = this._relax(this._makeShapes(this.params.seed), this._relaxIterations());
        this._shapeChanged();
        this._startPolish();
        return this.stats();
    }

    animateFold(target, ms = 2200) {
        if (target < 1 && this.params.fold >= 0.999) this._captureNetFrame();
        this._tweens.fold = { from: this.params.fold, to: target, start: performance.now(), ms };
    }

    setFold(t) {
        if (t < 1 && this.params.fold >= 0.999) this._captureNetFrame();
        delete this._tweens.fold;
        this.params.fold = t;
        this.update(false);
    }

    /** Slide the ¼, ¾ slices to ½ (cover = 1) or back (cover = 0). */
    animateCover(target, ms = 1600) {
        this._tweens.cover = { from: this.params.cover, to: target, start: performance.now(), ms };
    }

    setCover(c) {
        delete this._tweens.cover;
        this.params.cover = c;
        this.update(false);
    }

    select(s) {
        this.selected = s;
        this._paint();
        this._dirty = true;
        this.onSelect(s);
    }

    resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this._dirty = true;
    }

    resetCamera() {
        this.camera.position.set(6.4, -7.6, 4.4);
        this.fitCamera();
    }

    /** Aim at the folded complex and back off until it fits, keeping the view direction. */
    fitCamera() {
        if (!this.cx) return;
        const pts = [[0, 0, 0]];
        if (this.relax && this.relax.active) pts.push(...this.relax.points());
        else {
            for (const P of this._arcPolys(this.shape, 8)) pts.push(...P.pts);
            for (const L of [...this.hLoops, ...this.vLoops]) {
                for (let k = 1; k < 8; k++) pts.push(this._loop(L, k / 8, 1, [0, 0, 0]));
            }
        }
        const box = new THREE.Box3().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
        const centre = box.getCenter(new THREE.Vector3());
        let r = 0;
        for (const p of pts) r = Math.max(r, centre.distanceTo(new THREE.Vector3(...p)));
        const dir = this.camera.position.clone().sub(this.controls.target).normalize();
        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect));
        this.controls.target.copy(centre);
        this.camera.position.copy(centre).addScaledVector(dir, 1.08 * r / Math.sin(fit / 2));
        this.controls.update();
        this._dirty = true;
    }

    /** Clearances of the hyperplane graphs and the 1-skeleton, and link crossings. */
    stats() {
        if (!this.cx) return null;
        if (!this._stats) {
            this._stats = { ...this._clearances(), linkCrossings: this._linkCrossings() };
        }
        return this._stats;
    }

    // ----- geometry -----

    _buildLayout() {
        const { cx } = this;
        if (!this.offsets || this.offsets.cx !== cx) this.offsets = { cx, ...this._chooseOffsets() };
        const { phi0, psi0 } = this.offsets;
        this.hLoops = this._hLoops(phi0, this.params.kappa);
        this.vLoops = this._vLoops(psi0, this.params.kappa);
        // side lookup: generator index → loop + orientation
        this.sideA = cx.A.map((g) => ({ L: this.hLoops[g.edge], sign: g.sign }));
        this.sideB = cx.B.map((g) => ({ L: this.vLoops[g.edge], sign: g.sign }));
        this._stats = null;
    }

    _hLoops(phi0, k) {
        const m = this.cx.hEdges.length;
        return this.cx.hEdges.map((_, i) => {
            const phi = TAU * (i + 0.5) / m + phi0;
            const c = Math.cos(phi), s = Math.sin(phi);
            return { R: RH, t: [Math.cos(k), -Math.sin(k) * s, Math.sin(k) * c], n: [0, c, s] };
        });
    }

    _vLoops(psi0, k) {
        const n = this.cx.vEdges.length;
        return this.cx.vEdges.map((_, j) => {
            const psi = TAU * (j + 0.5) / n + psi0;
            const c = Math.cos(psi), s = Math.sin(psi);
            return { R: RV, t: [-Math.sin(k) * s, Math.sin(k) * c, Math.cos(k)], n: [c, s, 0] };
        });
    }

    /**
     * Rotate the two pencils of loops so that no two circles nearly meet. Two
     * circles through 0 in different planes can only meet on the line ℓ where the
     * planes cross, at their second points 2(c·d)d (c the centre, d along ℓ), so
     * the gap between those points measures how close they come. The offsets also
     * keep the tangent offsets at 0 distinct, which is what makes the link drawing
     * Zarankiewicz's.
     */
    _chooseOffsets() {
        const k = this.params.kappa, STEPS = 24;
        const m = this.cx.hEdges.length, n = this.cx.vEdges.length;
        const circle = (L) => ({ c: L.n.map((x) => x * L.R), N: unit(cross(L.t, L.n)) });
        const gap = (A, B) => {
            const d = cross(A.N, B.N), l = Math.hypot(d[0], d[1], d[2]);
            if (l < 1e-6) return 0;
            return 2 * Math.abs(dot(A.c, d) - dot(B.c, d)) / l;
        };
        const spread = (vals) => {
            let best = Infinity;
            for (let i = 0; i < vals.length; i++)
                for (let j = i + 1; j < vals.length; j++) best = Math.min(best, Math.abs(vals[i] - vals[j]));
            return best;
        };
        let best = null, bestScore = -Infinity;
        for (let a = 0; a < STEPS; a++) {
            const phi0 = (a + 0.5) / STEPS * TAU / m;
            const H = this._hLoops(phi0, k).map(circle);
            const sepH = spread(H.map((_, i) => Math.sin(TAU * (i + 0.5) / m + phi0)));
            for (let b = 0; b < STEPS; b++) {
                const psi0 = (b + 0.5) / STEPS * TAU / n;
                const V = this._vLoops(psi0, k).map(circle);
                const sepV = spread(V.map((_, j) => Math.cos(TAU * (j + 0.5) / n + psi0)));
                let score = Math.min(sepH, sepV);
                const all = [...H, ...V];
                for (let i = 0; i < all.length && score > bestScore; i++)
                    for (let j = i + 1; j < all.length; j++) score = Math.min(score, gap(all[i], all[j]));
                if (score > bestScore) { bestScore = score; best = { phi0, psi0 }; }
            }
        }
        return best;
    }

    /** Midpoint of horizontal (kind 'h') or vertical edge e: the far point of its circle. */
    _mid(kind, e) {
        const L = kind === 'h' ? this.hLoops[e] : this.vLoops[e];
        return [2 * L.R * L.n[0], 2 * L.R * L.n[1], 2 * L.R * L.n[2]];
    }

    /**
     * Direction at angle θ around edge e at the point x along it (in its own
     * orientation): cos θ·N + sin θ·(T × N), with T the edge's tangent there and N
     * the normal of its circle's plane. Always perpendicular to the edge.
     */
    _edgeDir(kind, e, x, theta) {
        const L = kind === 'h' ? this.hLoops[e] : this.vLoops[e];
        const a = TAU * x, ca = Math.cos(a), sa = Math.sin(a);
        const T = [0, 1, 2].map((i) => ca * L.t[i] + sa * L.n[i]);
        const N = cross(L.t, L.n), B = cross(T, N);
        const c = Math.cos(theta), sn = Math.sin(theta);
        return [0, 1, 2].map((i) => c * N[i] + sn * B[i]);
    }

    /** Edges of the vertical / horizontal slices of square s (bottom/top, left/right). */
    _arcEnds(s) {
        const sq = this.cx.squares[s], A = this.cx.A, B = this.cx.B;
        return {
            v: [A[sq.bottom].edge, A[sq.top].edge],
            h: [B[sq.left].edge, B[sq.right].edge]
        };
    }

    /** Random start: centres near the Coons centres, jittered. */
    _makeShapes(seed) {
        const rand = mulberry32(seed * 7919 + 17);
        const rnd = () => unit([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
        return this.cx.squares.map((sq, s) => {
            const { v, h } = this._arcEnds(s);
            const c = [0, 0, 0];
            for (const m of [this._mid('h', v[0]), this._mid('h', v[1]), this._mid('v', h[0]), this._mid('v', h[1])]) {
                c[0] += 0.5 * m[0]; c[1] += 0.5 * m[1]; c[2] += 0.5 * m[2];
            }
            const j = rnd();
            const C = [c[0] + 0.25 * j[0], c[1] + 0.25 * j[1], c[2] + 0.25 * j[2]];
            return { C, C0: C.slice() };
        });
    }

    /**
     * The angle around each edge at which each square meets it (its page): evenly
     * spaced, in the cyclic order of the directions from the edge's midpoint to the
     * squares' centres, rotated to fit those directions best. Returns a Map from
     * "s,family,end" (end 0: bottom or left side, 1: top or right) to the angle.
     */
    _slots(shape) {
        const groups = new Map();
        shape.forEach((_, s) => {
            const ends = this._arcEnds(s);
            for (const family of ['v', 'h']) {
                const kind = family === 'v' ? 'h' : 'v';
                ends[family].forEach((e, end) => {
                    const key = kind + e;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push({ s, family, end });
                });
            }
        });
        const slots = new Map();
        for (const [key, list] of groups) {
            const kind = key[0], e = +key.slice(1), M = this._mid(kind, e);
            const n0 = this._edgeDir(kind, e, 0.5, 0), n1 = this._edgeDir(kind, e, 0.5, Math.PI / 2);
            // the two sides of a loop square share a centre: break the tie in a fixed order
            const ang = list.map(({ s, end }) => {
                const C = shape[s].C, d = [C[0] - M[0], C[1] - M[1], C[2] - M[2]];
                return Math.atan2(dot(d, n1), dot(d, n0)) + end * 1e-9;
            });
            const order = list.map((_, i) => i).sort((i, j) => ang[i] - ang[j]);
            const step = TAU / list.length;
            let sx = 0, sy = 0;
            order.forEach((i, j) => { sx += Math.cos(ang[i] - j * step); sy += Math.sin(ang[i] - j * step); });
            const theta0 = Math.atan2(sy, sx);
            order.forEach((i, j) => {
                const { s, family, end } = list[i];
                slots.set(`${s},${family},${end}`, theta0 + j * step);
            });
        }
        return slots;
    }

    /**
     * Smooth arc from A (leaving along d0) through C at t = ½ to B (arriving along
     * −d1): two cubic Bézier pieces, with the tangent at C along the chord between
     * the inner control points.
     */
    _bezierArc(A, C, B, d0, d1) {
        const la = 0.55 * Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
        const lb = 0.55 * Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
        const P1 = A.map((x, i) => x + la * d0[i]), Q2 = B.map((x, i) => x + lb * d1[i]);
        const tc = unit(Q2.map((x, i) => x - P1[i])), hc = 0.3 * (la + lb);
        const P2 = C.map((x, i) => x - hc * tc[i]), Q1 = C.map((x, i) => x + hc * tc[i]);
        return (t, out) => {
            const [p0, p1, p2, p3, u] = t <= 0.5 ? [A, P1, P2, C, 2 * t] : [C, Q1, Q2, B, 2 * t - 1];
            const w = 1 - u, k0 = w * w * w, k1 = 3 * w * w * u, k2 = 3 * w * u * u, k3 = u * u * u;
            for (let i = 0; i < 3; i++) out[i] = k0 * p0[i] + k1 * p1[i] + k2 * p2[i] + k3 * p3[i];
            return out;
        };
    }

    /**
     * Per-square data for the Gordon patch: its sides, its two midline arcs (leaving
     * the edge midpoints in their slots), the side midpoints and the centre. Cached
     * per shape and loop layout.
     */
    _geom(shape = this.shape) {
        const c = this._geomCache;
        if (c && c.shape === shape && c.hLoops === this.hLoops && c.vLoops === this.vLoops) return c.list;
        const slots = this._slots(shape), A = this.sideA, B = this.sideB;
        const list = this.cx.squares.map((sq, s) => {
            const ends = this._arcEnds(s), C = shape[s].C;
            const arc = (family) => {
                const kind = family === 'v' ? 'h' : 'v', e = ends[family];
                return this._bezierArc(this._mid(kind, e[0]), C, this._mid(kind, e[1]),
                    this._edgeDir(kind, e[0], 0.5, slots.get(`${s},${family},0`)),
                    this._edgeDir(kind, e[1], 0.5, slots.get(`${s},${family},1`)));
            };
            return {
                bot: A[sq.bottom], top: A[sq.top], left: B[sq.left], right: B[sq.right],
                gv: arc('v'), gh: arc('h'),
                Mb: this._mid('h', ends.v[0]), Mt: this._mid('h', ends.v[1]),
                Ml: this._mid('v', ends.h[0]), Mr: this._mid('v', ends.h[1]),
                C
            };
        });
        this._geomCache = { shape, hLoops: this.hLoops, vLoops: this.vLoops, list };
        return list;
    }

    _polishTries() {
        const S = this.cx.squares.length;
        return S <= 30 ? 100 : S <= 80 ? 50 : 20;
    }

    _relaxIterations() {
        const S = this.cx.squares.length;
        return S <= 30 ? 80 : S <= 80 ? 45 : 24;
    }

    /**
     * Move the centres so that hyperplane arcs keep RELAX_TARGET apart away from
     * the edge midpoints (where their directions are fixed by the slots). Moving
     * Cₛ moves an arc point at parameter t by roughly 4t(1−t)·δC. The forces never
     * balance exactly, so the step shrinks over time and the best state is kept.
     */
    _relax(shape, iterations) {
        const { K, target: TARGET, step: STEP, leash: LEASH } = this.tune;
        const S = shape.length;
        const push = shape.map(() => [0, 0, 0]);
        const add = (v, w, n) => { v[0] += w * n[0]; v[1] += w * n[1]; v[2] += w * n[2]; };
        const n = [0, 0, 0];
        let best = null, bestScore = -1;
        for (let it = 0; it <= iterations; it++) {
            this._geomCache = null;
            const polys = this._arcPolys(shape, K);
            push.forEach((q) => { q[0] = q[1] = q[2] = 0; });
            let dmin = TARGET;
            forClosePairs(polys, TARGET, VERTEX_BALL, false, (A, B, r) => {
                const P = polys[A.pi], Q = polys[B.pi];
                if (P.family !== Q.family) return;
                if (r[0] > 1e-9) { n[0] = r[3] / r[0]; n[1] = r[4] / r[0]; n[2] = r[5] / r[0]; }
                else { n[0] = 0; n[1] = 0; n[2] = 1; }
                const w = (TARGET - r[0]) / TARGET;
                const ta = (A.k + r[1]) / K, tb = (B.k + r[2]) / K;
                add(push[P.group], w * 4 * ta * (1 - ta), n);
                add(push[Q.group], -w * 4 * tb * (1 - tb), n);
                if (r[0] < dmin) dmin = r[0];
            });
            const score = dmin / TARGET;
            if (score > bestScore) { bestScore = score; best = shape.map((sh) => sh.C.slice()); }
            if (score >= 1 || it === iterations) break;
            const step = 1 - 0.85 * it / iterations;
            for (let s = 0; s < S; s++) {
                const sh = shape[s];
                add(sh.C, STEP * step, push[s]);
                const d = [sh.C[0] - sh.C0[0], sh.C[1] - sh.C0[1], sh.C[2] - sh.C0[2]];
                const l = Math.hypot(d[0], d[1], d[2]);
                if (l > LEASH) for (let i = 0; i < 3; i++) sh.C[i] = sh.C0[i] + d[i] * LEASH / l;
            }
        }
        best.forEach((C, s) => { shape[s].C = C; });
        this._geomCache = null;
        return shape;
    }

    /** Worst clearance between hyperplane arcs (per family, away from shared vertices) and its two squares. */
    _worstPair(shape) {
        this._geomCache = null;
        const polys = this._arcPolys(shape, CHECK_SAMPLES);
        let worst = { d: CHECK_CELL, a: -1, b: -1 };
        forClosePairs(polys, CHECK_CELL, VERTEX_BALL, false, (A, B, r) => {
            const P = polys[A.pi], Q = polys[B.pi];
            if (P.family === Q.family && r[0] < worst.d) worst = { d: r[0], a: P.group, b: Q.group };
        });
        return worst;
    }

    /**
     * Polish, in the background: move the centre of one of the two squares at the
     * worst spot at random, keeping the change only if the worst clearance
     * improves. Runs in short chunks between frames; when done it redraws and calls
     * onRefine. A new complex or immersion cancels it.
     */
    _startPolish() {
        const token = this._polishToken = {}, shape = this.shape, tries = this._polishTries();
        const rand = mulberry32(this.params.seed * 31 + 7);
        const rnd = () => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
        let worst = this._worstPair(shape), k = 0;
        this.polishing = true;
        if (this.onRefine) this.onRefine(null);
        const chunk = () => {
            if (token !== this._polishToken) return;
            const t0 = performance.now();
            while (k < tries && worst.a >= 0 && performance.now() - t0 < 14) {
                const s = rand() < 0.5 ? worst.a : worst.b, sh = shape[s];
                const saved = sh.C.slice();
                const size = 0.25 * (1 - 0.7 * k / tries), dC = rnd();
                for (let i = 0; i < 3; i++) sh.C[i] += size * dC[i];
                const next = this._worstPair(shape);
                if (next.d > worst.d) worst = next;
                else sh.C = saved;
                k++;
            }
            if (k < tries && worst.a >= 0) { setTimeout(chunk, 0); return; }
            this.polishing = false;
            this._shapeChanged();
            if (this.onRefine) this.onRefine(this.stats());
        };
        setTimeout(chunk, 0);
    }

    /** The shape changed in place or was replaced: drop what depends on it and redraw. */
    _shapeChanged() {
        this._geomCache = this._frames = this._flightCache = null;
        this._stats = null;
        this.update(false);
    }

    /** Try a few random starts, relax each, keep the best. */
    _chooseShapes() {
        const S = this.cx.squares.length;
        const tries = 1;
        let best = null, bestScore = -1;
        for (let k = 0; k < tries; k++) {
            const seed = 1 + k;
            const shape = this._relax(this._makeShapes(seed), this._relaxIterations());
            const checks = this._clearances(shape);
            const sc = this._score(checks);
            if (sc > bestScore) { bestScore = sc; best = { seed, shape, checks }; }
        }
        this.params.seed = best.seed;
        this.shape = best.shape;
        this._geomCache = null;
        this._stats = { ...best.checks, linkCrossings: this._linkCrossings() };
    }

    _score(c) {
        return Math.min(c.vertical.clearance, c.horizontal.clearance) * Math.min(1, Math.min(c.vertical.angle, c.horizontal.angle) / 20);
    }

    _loop(L, s, sign, out, o = 0) {
        const t = sign > 0 ? s : 1 - s;
        const a = TAU * t, c = Math.sin(a), d = 1 - Math.cos(a);
        out[o] = L.R * (c * L.t[0] + d * L.n[0]);
        out[o + 1] = L.R * (c * L.t[1] + d * L.n[1]);
        out[o + 2] = L.R * (c * L.t[2] + d * L.n[2]);
        return out;
    }

    /** Folded position of square s at (u, v): Gordon patch through sides and midlines. */
    _folded(s, u, v, out, shape = this.shape) {
        const G = this._geom(shape)[s];
        const T = this._tmpG || (this._tmpG = new Float64Array(12));
        this._loop(G.bot.L, u, G.bot.sign, T, 0);
        this._loop(G.top.L, u, G.top.sign, T, 3);
        this._loop(G.left.L, v, G.left.sign, T, 6);
        this._loop(G.right.L, v, G.right.sign, T, 9);
        const g = G.gv(v, this._tmpV || (this._tmpV = [0, 0, 0]));
        const h = G.gh(u, this._tmpH || (this._tmpH = [0, 0, 0]));
        const { Mb, Mt, Ml, Mr, C } = G;
        // quadratic Lagrange basis at 0, ½, 1
        const u0 = (2 * u - 1) * (u - 1), uh = 4 * u * (1 - u), u1 = u * (2 * u - 1);
        const v0 = (2 * v - 1) * (v - 1), vh = 4 * v * (1 - v), v1 = v * (2 * v - 1);
        for (let i = 0; i < 3; i++) {
            out[i] = u0 * T[6 + i] + uh * g[i] + u1 * T[9 + i]
                + v0 * T[i] + vh * h[i] + v1 * T[3 + i]
                - (uh * v0 * Mb[i] + uh * v1 * Mt[i] + u0 * vh * Ml[i] + u1 * vh * Mr[i] + uh * vh * C[i]);
        }
        return out;
    }

    /** The net of flat squares faces the camera and fills most of the view. */
    _captureNetFrame() {
        const cam = this.camera;
        cam.updateMatrixWorld();
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        const S = this.cx.squares.length;
        const cols = Math.ceil(Math.sqrt(S * cam.aspect)), rows = Math.ceil(S / cols);
        const h = 2 * cam.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
        const cell = Math.min(0.86 * h * cam.aspect / cols, 0.8 * h / rows);
        this.net = { right: right.toArray(), up: up.toArray(), center: this.controls.target.toArray(), cols, rows, cell };
    }

    _flat(s, u, v, out) {
        if (!this.net) this._captureNetFrame();
        const { right, up, center, cols, rows, cell } = this.net, side = 0.74 * cell;
        const col = s % cols, row = Math.floor(s / cols);
        const x = (col - (cols - 1) / 2) * cell + (u - 0.5) * side;
        const y = ((rows - 1) / 2 - row) * cell + (v - 0.5) * side;
        for (let d = 0; d < 3; d++) out[d] = center[d] + x * right[d] + y * up[d];
        return out;
    }

    /** A flat square centred at Cₛ in the tangent plane of the folded patch there. */
    _placed(s, u, v, out) {
        const side = this.net ? 0.74 * this.net.cell : 0.9;
        const f = this._frames;
        if (!f || f.shape !== this.shape || f.kappa !== this.params.kappa || f.side !== side) {
            const h = 1e-3, a = [0, 0, 0], b = [0, 0, 0];
            const frames = this.cx.squares.map((_, k) => {
                this._folded(k, 0.5 + h, 0.5, a); this._folded(k, 0.5 - h, 0.5, b);
                const du = unit([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
                this._folded(k, 0.5, 0.5 + h, a); this._folded(k, 0.5, 0.5 - h, b);
                const dv0 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
                const t = dot(dv0, du);
                const dv = unit([dv0[0] - t * du[0], dv0[1] - t * du[1], dv0[2] - t * du[2]]);
                return { du: du.map((x) => x * side), dv: dv.map((x) => x * side), C: this.shape[k].C };
            });
            this._frames = { list: frames, shape: this.shape, kappa: this.params.kappa, side };
        }
        const F = this._frames.list[s];
        for (let d = 0; d < 3; d++) out[d] = F.C[d] + (u - 0.5) * F.du[d] + (v - 0.5) * F.dv[d];
        return out;
    }

    /**
     * Position of square s at (u, v) for the current fold: the first half moves the
     * flat squares from the net to their centres, the second half bends them in.
     */
    _eval(s, u, v, out) {
        const t = this._t;
        if (t >= 1) return this._folded(s, u, v, out);
        if (t <= 0.5) {
            // rigid flight: centre moves on a line, frame turns by slerp
            const F = this._flight(s, smoother(2 * t));
            for (let d = 0; d < 3; d++) out[d] = F.c[d] + (u - 0.5) * F.x[d] + (v - 0.5) * F.y[d];
            return out;
        }
        const e = smoother(2 * t - 1), A = this._tmpF || (this._tmpF = [0, 0, 0]);
        this._placed(s, u, v, A);
        this._folded(s, u, v, out);
        for (let d = 0; d < 3; d++) out[d] = A[d] + e * (out[d] - A[d]);
        return out;
    }

    /** Frame of square s part-way (e ∈ [0, 1]) from the net to its tangent plane. */
    _flight(s, e) {
        const cache = this._flightCache || (this._flightCache = {});
        if (cache.e !== e || cache.net !== this.net || cache.frames !== this._frames) {
            this._placed(0, 0.5, 0.5, [0, 0, 0]); // make sure the frames exist
            const { right, up, cell } = this.net, side = 0.74 * cell;
            const R = new THREE.Vector3(...right), U = new THREE.Vector3(...up);
            const q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, R.clone().cross(U)));
            const q = new THREE.Quaternion(), X = new THREE.Vector3(), Y = new THREE.Vector3();
            const c0 = [0, 0, 0];
            cache.list = this._frames.list.map((F, k) => {
                const du = new THREE.Vector3(...F.du).normalize(), dv = new THREE.Vector3(...F.dv).normalize();
                const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(du, dv, du.clone().cross(dv)));
                q.slerpQuaternions(q0, q1, e);
                X.set(1, 0, 0).applyQuaternion(q).multiplyScalar(side);
                Y.set(0, 1, 0).applyQuaternion(q).multiplyScalar(side);
                this._flat(k, 0.5, 0.5, c0);
                return {
                    c: [0, 1, 2].map((d) => c0[d] + e * (F.C[d] - c0[d])),
                    x: X.toArray(), y: Y.toArray()
                };
            });
            Object.assign(cache, { e, net: this.net, frames: this._frames });
        }
        return cache.list[s];
    }

    // ----- scene objects -----

    _allocate() {
        this._disposeObjects();
        const S = this.cx.squares.length;
        // surface grid, and a finer one along curves (sides and slices)
        const N = S <= 30 ? 40 : S <= 60 ? 30 : 22;
        const TS = S <= 30 ? 128 : S <= 60 ? 96 : 64;
        const radial = S <= 60 ? 12 : 10;
        this.N = N; this.TS = TS;

        // translucent patches, one mesh per square, sorted back to front every frame;
        // everything else is opaque and drawn first, so it depth-tests normally
        this.squaresMesh = new PatchSet(S, N, N, this.mats.squares, 2);
        this.edgeTubes = new TubeBatch(4 * S, TS, radial, this.mats.edges);
        this.vArcs = new TubeBatch(2 * S, TS, radial, this.mats.arcs);
        this.hArcs = new TubeBatch(2 * S, TS, radial, this.mats.arcs);
        this.vRibbons = new PatchSet(S, 6, TS / 2, this.mats.ribbons, 3);
        this.hRibbons = new PatchSet(S, 6, TS / 2, this.mats.ribbons, 3);

        const sc = Math.min(1, 2.4 / Math.sqrt(S));
        this.scale = sc;
        this.arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.14, 12), this.mats.dots, 4 * S);
        this.corners = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 12, 8), this.mats.vertex, 4 * S);
        this.hypVerts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 20, 14), this.mats.dots, 8 * S);
        this.centers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 16, 10), this.mats.dots, 4 * S);
        for (const im of [this.arrows, this.corners, this.hypVerts, this.centers]) {
            im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            im.frustumCulled = false;
        }
        this.vertexBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), this.mats.vertex);

        this.labels = new THREE.Group();
        const m = this.cx.hEdges.length, n = this.cx.vEdges.length;
        this.labelSprites = [];
        this.cx.hEdges.forEach((_, i) => {
            const sp = textSprite(`a${sub(i + 1)}`, hEdgeColor(i, m));
            sp.userData = { kind: 'h', i };
            this.labels.add(sp); this.labelSprites.push(sp);
        });
        this.cx.vEdges.forEach((_, j) => {
            const sp = textSprite(`b${sub(j + 1)}`, vEdgeColor(j, n));
            sp.userData = { kind: 'v', i: j };
            this.labels.add(sp); this.labelSprites.push(sp);
        });
        // the vertices of the double covers: aᵢ at the ¼ point of its loop, aᵢ⁻¹ at the ¾ point
        for (const [kind, edges, letter, color] of [['h', this.cx.hEdges, 'a', hEdgeColor], ['v', this.cx.vEdges, 'b', vEdgeColor]]) {
            edges.forEach((_, i) => {
                for (const inverse of [false, true]) {
                    const sp = textSprite(`${letter}${sub(i + 1)}${inverse ? '⁻¹' : ''}`, color(i, edges.length));
                    sp.userData = { kind, i, lift: inverse ? 0.75 : 0.25 };
                    this.labels.add(sp); this.labelSprites.push(sp);
                }
            });
        }

        this.root.add(this.squaresMesh.mesh, this.edgeTubes.mesh, this.vArcs.mesh, this.hArcs.mesh,
            this.vRibbons.mesh, this.hRibbons.mesh, this.arrows, this.corners, this.hypVerts, this.centers,
            this.vertexBall, this.labels);
        this._paint();
    }

    _disposeObjects() {
        for (const key of ['squaresMesh', 'edgeTubes', 'vArcs', 'hArcs', 'vRibbons', 'hRibbons']) {
            if (this[key]) { this.root.remove(this[key].mesh); this[key].dispose(); this[key] = null; }
        }
        for (const key of ['arrows', 'corners', 'hypVerts', 'centers', 'vertexBall']) {
            if (this[key]) { this.root.remove(this[key]); this[key].geometry.dispose(); this[key] = null; }
        }
        if (this.labels) {
            this.labels.children.forEach((sp) => { sp.material.map.dispose(); sp.material.dispose(); });
            this.root.remove(this.labels);
            this.labels = null;
        }
    }

    _arcColor(family, s) {
        const cx = this.cx;
        if (s === this.selected) return [1, 0.95, 0.55];
        if (this.params.arcColors === 'square') return hslRgb(s * 137.508, 0.82, 0.6);
        const H = family === 'v' ? cx.vHyperplanes : cx.hHyperplanes;
        const base = family === 'v' ? COLORS.vHyper : COLORS.hHyper;
        const comp = H.ofArc[s];
        if (H.components.length === 1 || comp === 0) return new THREE.Color(base).toArray();
        const c = new THREE.Color(base);
        const hsl = {}; c.getHSL(hsl);
        c.setHSL((hsl.h + 0.11 * comp) % 1, hsl.s, hsl.l);
        return c.toArray();
    }

    /** Colours (on selection / colouring change). */
    _paint() {
        const cx = this.cx;
        if (!cx || !this.squaresMesh) return;
        const S = cx.squares.length;
        const m = cx.hEdges.length, n = cx.vEdges.length;
        const hCol = cx.hEdges.map((_, i) => new THREE.Color(hEdgeColor(i, m)).toArray());
        const vCol = cx.vEdges.map((_, j) => new THREE.Color(vEdgeColor(j, n)).toArray());
        const dim = this.selected >= 0;
        for (let s = 0; s < S; s++) {
            const sq = cx.squares[s];
            const tint = s === this.selected ? [1, 0.88, 0.35] : hslRgb(s * 137.508, 0.5, dim ? 0.3 : 0.52);
            this.squaresMesh.setColor(s, tint);
            this.edgeTubes.setColor(4 * s, hCol[cx.A[sq.bottom].edge]);
            this.edgeTubes.setColor(4 * s + 1, vCol[cx.B[sq.right].edge]);
            this.edgeTubes.setColor(4 * s + 2, hCol[cx.A[sq.top].edge]);
            this.edgeTubes.setColor(4 * s + 3, vCol[cx.B[sq.left].edge]);
            const vc = this._arcColor('v', s), hc = this._arcColor('h', s);
            for (const k of [0, 1]) { this.vArcs.setColor(2 * s + k, vc); this.hArcs.setColor(2 * s + k, hc); }
            this.vRibbons.setColor(s, vc); this.hRibbons.setColor(s, hc);
            const sides = [hCol[cx.A[sq.bottom].edge], vCol[cx.B[sq.right].edge], hCol[cx.A[sq.top].edge], vCol[cx.B[sq.left].edge]];
            sides.forEach((c, k) => this.arrows.setColorAt(4 * s + k, new THREE.Color(...c)));
            const vv = new THREE.Color(COLORS.vHyper), hh = new THREE.Color(COLORS.hHyper);
            for (let k = 0; k < 4; k++) { this.hypVerts.setColorAt(8 * s + k, vv); this.hypVerts.setColorAt(8 * s + 4 + k, hh); }
            const centre = s === this.selected ? new THREE.Color(1, 0.9, 0.4) : new THREE.Color(0.95, 0.97, 1);
            for (let k = 0; k < 4; k++) this.centers.setColorAt(4 * s + k, centre);
        }
        for (const b of [this.edgeTubes, this.vArcs, this.hArcs]) b.geometry.attributes.color.needsUpdate = true;
        for (const set of [this.squaresMesh, this.vRibbons, this.hRibbons]) set.colorsChanged();
        for (const im of [this.arrows, this.hypVerts, this.centers]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
        if (this.relax) this.relax.paint();
        this._dirty = true;
    }

    /** Where the slices sit: ¼ and ¾ when cover = 0, sliding along the squares to ½ at cover = 1. */
    _slices() {
        const a = SLICE + (0.5 - SLICE) * Math.min(1, Math.max(0, this.params.cover));
        return [a, 1 - a];
    }

    /** Recompute positions for the current fold and visibility. */
    update(recolor = false) {
        const cx = this.cx;
        if (!cx || !this.squaresMesh) return;
        if (recolor) this._paint();
        const P = this.params;
        this._t = Math.min(1, Math.max(0, P.fold));
        const S = cx.squares.length, N = this.N, TS = this.TS, W = N + 1;
        const p = [0, 0, 0];
        const sc = this.scale;

        const showSquares = P.squares && P.opacity > 0.01;
        this.squaresMesh.mesh.visible = showSquares;
        if (showSquares) {
            for (let s = 0; s < S; s++) {
                const item = this.squaresMesh.items[s], G = item.pos;
                for (let j = 0; j <= N; j++) {
                    for (let i = 0; i <= N; i++) {
                        this._eval(s, i / N, j / N, p);
                        const o = (j * W + i) * 3;
                        G[o] = p[0]; G[o + 1] = p[1]; G[o + 2] = p[2];
                    }
                }
                const c = (N / 2 * W + N / 2) * 3;
                item.centre = [G[c], G[c + 1], G[c + 2]];
                item.commit();
            }
        }

        // a curve u ↦ (u, v) or v ↦ (u, v) across square s, sampled finely
        const line = this._line && this._line.length === (TS + 1) * 3 ? this._line : (this._line = new Float32Array((TS + 1) * 3));
        const across = (s, f) => {
            for (let k = 0; k <= TS; k++) { f(k / TS, p); line[3 * k] = p[0]; line[3 * k + 1] = p[1]; line[3 * k + 2] = p[2]; }
            return line;
        };
        const M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
        const dot3 = (im, k, s, u, v) => { this._eval(s, u, v, p); im.setMatrixAt(k, M.makeTranslation(p[0], p[1], p[2])); };

        // 1-skeleton: each square's four sides (they coincide once folded)
        this.edgeTubes.mesh.visible = this.arrows.visible = this.corners.visible = P.edges;
        if (P.edges) {
            const r = 0.016 * (0.7 + 0.3 * sc) + 0.006;
            for (let s = 0; s < S; s++) {
                this.edgeTubes.setTube(4 * s, across(s, (t, o) => this._eval(s, t, 0, o)), r);
                this.edgeTubes.setTube(4 * s + 1, across(s, (t, o) => this._eval(s, 1, t, o)), r);
                this.edgeTubes.setTube(4 * s + 2, across(s, (t, o) => this._eval(s, t, 1, o)), r);
                this.edgeTubes.setTube(4 * s + 3, across(s, (t, o) => this._eval(s, 0, t, o)), r);
                [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([u, v], k) => dot3(this.corners, 4 * s + k, s, u, v));
            }
            this.edgeTubes.commit();
            this.corners.instanceMatrix.needsUpdate = true;
            this._placeArrows();
        }
        this.vertexBall.visible = P.edges && this._t >= 0.999;

        // hyperplanes: the ¼ and ¾ slices of each square (vertical: u, horizontal: v)
        const sl = this._slices();
        const showV = P.vertical, showH = P.horizontal;
        this.vArcs.mesh.visible = showV;
        this.hArcs.mesh.visible = showH;
        this.vRibbons.mesh.visible = showV && P.ribbons;
        this.hRibbons.mesh.visible = showH && P.ribbons;
        const ra = 0.017 * (0.6 + 0.4 * sc) + 0.005;
        for (const [family, show, batch, bands] of [['v', showV, this.vArcs, this.vRibbons], ['h', showH, this.hArcs, this.hRibbons]]) {
            if (!show) continue;
            for (let s = 0; s < S; s++) {
                for (const k of [0, 1]) {
                    batch.setTube(2 * s + k, across(s, (t, o) => (family === 'v' ? this._eval(s, sl[k], t, o) : this._eval(s, t, sl[k], o))), ra);
                }
            }
            batch.commit();
            if (P.ribbons) this._fillBands(bands, family, sl);
        }
        // vertices of the double covers: where the slices meet the edges
        this.hypVerts.visible = showV || showH;
        if (showV || showH) {
            for (let s = 0; s < S; s++) {
                for (const k of [0, 1]) {
                    for (const e of [0, 1]) {
                        if (showV) dot3(this.hypVerts, 8 * s + 2 * k + e, s, sl[k], e);
                        else this.hypVerts.setMatrixAt(8 * s + 2 * k + e, Z);
                        if (showH) dot3(this.hypVerts, 8 * s + 4 + 2 * k + e, s, e, sl[k]);
                        else this.hypVerts.setMatrixAt(8 * s + 4 + 2 * k + e, Z);
                    }
                }
            }
            this.hypVerts.instanceMatrix.needsUpdate = true;
        }
        // where the vertical and horizontal slices of a square cross
        this.centers.visible = showV && showH;
        if (showV && showH) {
            for (let s = 0; s < S; s++) {
                for (const k of [0, 1]) for (const l of [0, 1]) dot3(this.centers, 4 * s + 2 * k + l, s, sl[k], sl[l]);
            }
            this.centers.instanceMatrix.needsUpdate = true;
        }

        // labels: edges at the far point of each loop; double-cover vertices (generators)
        // at the slices' ends, until the slices have slid most of the way to ½
        const showLabels = P.labels && this._t > 0.985;
        this.labels.visible = showLabels;
        if (showLabels) {
            const lifted = P.cover < 0.6;
            for (const sp of this.labelSprites) {
                const { kind, i, lift } = sp.userData;
                const L = kind === 'h' ? this.hLoops[i] : this.vLoops[i];
                const hyper = kind === 'h' ? P.vertical : P.horizontal;
                if (lift === undefined) {
                    sp.visible = P.edges || (hyper && !lifted);
                    const k = 2 * L.R + 0.42;
                    sp.position.set(k * L.n[0], k * L.n[1], k * L.n[2] + 0.06);
                } else {
                    sp.visible = hyper && lifted;
                    if (!sp.visible) continue;
                    const x = lift < 0.5 ? sl[0] : sl[1], q = this._loop(L, x, 1, [0, 0, 0]);
                    // push away from the circle's centre
                    for (let k = 0; k < 3; k++) q[k] = L.R * L.n[k] + 1.3 * (q[k] - L.R * L.n[k]);
                    sp.position.set(q[0], q[1], q[2]);
                }
            }
        }
        if (this.relax) this.relax.afterUpdate();
        this._dirty = true;
    }

    /** The strip of each square between its two slices: the carrier, collapsing with them. */
    _fillBands(set, family, sl) {
        const S = this.cx.squares.length, cols = set.cols, rows = set.rows;
        const p = [0, 0, 0];
        for (let s = 0; s < S; s++) {
            const item = set.items[s];
            for (let j = 0; j <= rows; j++) {
                for (let i = 0; i <= cols; i++) {
                    const a = sl[0] + (sl[1] - sl[0]) * i / cols, b = j / rows;
                    if (family === 'v') this._eval(s, a, b, p); else this._eval(s, b, a, p);
                    const o = (j * (cols + 1) + i) * 3;
                    item.pos[o] = p[0]; item.pos[o + 1] = p[1]; item.pos[o + 2] = p[2];
                }
            }
            const c = (Math.floor(rows / 2) * (cols + 1) + Math.floor(cols / 2)) * 3;
            item.centre = [item.pos[c], item.pos[c + 1], item.pos[c + 2]];
            item.commit();
        }
    }

    _placeArrows() {
        const S = this.cx.squares.length, cx = this.cx;
        const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
        const pos = new THREE.Vector3(), dir = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
        const a = [0, 0, 0], b = [0, 0, 0], h = 0.01;
        const s0 = 0.64; // arrow position along the edge, in its own orientation
        for (let s = 0; s < S; s++) {
            const sq = cx.squares[s];
            const sides = [
                { sign: cx.A[sq.bottom].sign, at: (t, o) => this._eval(s, t, 0, o) },
                { sign: cx.B[sq.right].sign, at: (t, o) => this._eval(s, 1, t, o) },
                { sign: cx.A[sq.top].sign, at: (t, o) => this._eval(s, t, 1, o) },
                { sign: cx.B[sq.left].sign, at: (t, o) => this._eval(s, 0, t, o) }
            ];
            sides.forEach((side, k) => {
                const t = side.sign > 0 ? s0 : 1 - s0;
                side.at(t - h, a); side.at(t + h, b);
                dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).multiplyScalar(side.sign).normalize();
                side.at(t, a);
                pos.set(a[0], a[1], a[2]);
                Q.setFromUnitVectors(Y, dir);
                M.compose(pos, Q, one);
                this.arrows.setMatrixAt(4 * s + k, M);
            });
        }
        this.arrows.instanceMatrix.needsUpdate = true;
    }

    // ----- checks -----

    /** The hyperplane arcs (midlines) of every square, as polylines with exact end tangents. */
    _arcPolys(shape, K) {
        const geom = this._geom(shape), polys = [];
        for (const family of ['v', 'h']) {
            geom.forEach((G, s) => {
                const arc = family === 'v' ? G.gv : G.gh, pts = [];
                for (let k = 0; k <= K; k++) pts.push(arc(k / K, [0, 0, 0]));
                const out = (t, d) => { const q = arc(t + d, [0, 0, 0]), p0 = pts[t ? K : 0]; return unit([q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]); };
                const e = this._arcEnds(s)[family], tag = family === 'v' ? 'h' : 'v';
                polys.push({ pts, ends: [`${tag}${e[0]}`, `${tag}${e[1]}`], group: s, family, tan: [out(0, 1e-5), out(1, -1e-5)] });
            });
        }
        return polys;
    }

    /**
     * The ¼ and ¾ slices of every square's patch (the double covers), as polylines.
     * Each ends at the point of an edge a quarter or three quarters of the way
     * along it (in the edge's own orientation), keyed "h3@1" or "h3@3".
     */
    _slicePolys(shape, K) {
        const cx = this.cx, polys = [];
        const key = (tag, g, a) => `${tag}${g.edge}@${Math.round(4 * (g.sign > 0 ? a : 1 - a))}`;
        cx.squares.forEach((sq, s) => {
            for (const family of ['v', 'h']) {
                const [g0, g1] = family === 'v' ? [cx.A[sq.bottom], cx.A[sq.top]] : [cx.B[sq.left], cx.B[sq.right]];
                const tag = family === 'v' ? 'h' : 'v';
                for (const a of [SLICE, 1 - SLICE]) {
                    const at = (t) => (family === 'v' ? this._folded(s, a, t, [0, 0, 0], shape) : this._folded(s, t, a, [0, 0, 0], shape));
                    const pts = [];
                    for (let k = 0; k <= K; k++) pts.push(at(k / K));
                    const out = (t, d) => { const q = at(t + d), p0 = pts[t ? K : 0]; return unit([q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]]); };
                    polys.push({ pts, ends: [key(tag, g0, a), key(tag, g1, a)], group: s, family, tan: [out(0, 1e-5), out(1, -1e-5)] });
                }
            }
        });
        return polys;
    }

    /** Sampled embedding checks of the folded state for the given shape. */
    _clearances(shape = this.shape) {
        const K = CHECK_SAMPLES;
        const mids = this._arcPolys(shape, K), slices = this._slicePolys(shape, K);
        const loops = [];
        const addLoop = (L, tag) => {
            const pts = [];
            for (let k = 0; k <= 4 * K; k++) pts.push(this._loop(L, k / (4 * K), 1, [0, 0, 0]));
            loops.push({ pts, ends: ['o', 'o'], group: tag });
        };
        this.hLoops.forEach((L, i) => addLoop(L, `h${i}`));
        this.vLoops.forEach((L, j) => addLoop(L, `v${j}`));
        return {
            vertical: embeddingCheck(mids.filter((P) => P.family === 'v')),
            horizontal: embeddingCheck(mids.filter((P) => P.family === 'h')),
            both: embeddingCheck(mids, false),
            vCover: embeddingCheck(slices.filter((P) => P.family === 'v')),
            hCover: embeddingCheck(slices.filter((P) => P.family === 'h')),
            skeleton: embeddingCheck(loops),
            cap: CHECK_CELL
        };
    }

    /** Crossings in the drawing of the vertex link K_{p+1,q+1} by corner sectors. */
    _linkCrossings() {
        const cx = this.cx;
        const tan = (L, sign, atStart) => {
            // direction from the vertex along the side near its start (atStart) or end
            const t = unit(L.t);
            return atStart === (sign > 0) ? t : t.map((c) => -c);
        };
        const arcs = [];
        cx.squares.forEach((sq) => {
            const A = this.sideA, B = this.sideB;
            const bot = A[sq.bottom], top = A[sq.top], left = B[sq.left], right = B[sq.right];
            // endpoints labelled by generator so arcs at a common link vertex are not counted
            arcs.push([tan(bot.L, bot.sign, true), tan(left.L, left.sign, true), `a${sq.bottom}`, `b${sq.left}`]);
            arcs.push([tan(bot.L, bot.sign, false), tan(right.L, right.sign, true), `a${cx.A[sq.bottom].inv}`, `b${sq.right}`]);
            arcs.push([tan(top.L, top.sign, true), tan(left.L, left.sign, false), `a${sq.top}`, `b${cx.B[sq.left].inv}`]);
            arcs.push([tan(top.L, top.sign, false), tan(right.L, right.sign, false), `a${cx.A[sq.top].inv}`, `b${cx.B[sq.right].inv}`]);
        });
        let count = 0;
        for (let i = 0; i < arcs.length; i++) {
            for (let j = i + 1; j < arcs.length; j++) {
                const [a1, a2, ka, kb] = arcs[i], [b1, b2, kc, kd] = arcs[j];
                if (ka === kc || kb === kd) continue;
                if (arcsCross(a1, a2, b1, b2)) count++;
            }
        }
        return count;
    }

    // ----- interaction & loop -----

    pick(event) {
        if (!this.cx) return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.raycaster.setFromCamera(ndc, this.camera);
        if (this.relax && this.relax.active) {
            const s = this.relax.pick(this.raycaster);
            this.select(s >= 0 && s !== this.selected ? s : -1);
            return;
        }
        let best = null;
        const consider = (hit, sq) => {
            if (hit && (!best || hit.distance < best.distance - 1e-6)) best = { distance: hit.distance, s: sq(hit) };
        };
        for (const b of [this.vArcs, this.hArcs]) {
            if (!b.mesh.visible) continue;
            b.geometry.computeBoundingSphere(); b.geometry.computeBoundingBox();
            consider(this.raycaster.intersectObject(b.mesh, false)[0], (hit) => Math.floor(hit.faceIndex / b.trisPerTube / 2));
        }
        for (const set of [this.vRibbons, this.hRibbons, this.squaresMesh]) {
            if (!set.mesh.visible) continue;
            for (const it of set.items) { it.geometry.computeBoundingSphere(); it.geometry.computeBoundingBox(); }
            consider(this.raycaster.intersectObjects(set.mesh.children, false)[0], (hit) => hit.object.userData.s);
        }
        this.select(best ? (best.s === this.selected ? -1 : best.s) : -1);
    }

    _step(now) {
        let moved = false;
        for (const [key, tw] of Object.entries(this._tweens)) {
            const k = Math.min(1, (now - tw.start) / tw.ms);
            this.params[key] = tw.from + (tw.to - tw.from) * (key === 'cover' ? smoother(k) : k);
            if (k >= 1) delete this._tweens[key];
            moved = true;
        }
        if (moved) {
            this.update(false);
            if (this.onFold) this.onFold(this.params.fold);
            if (this.onCover) this.onCover(this.params.cover);
        }
        this.controls.update();
        if (this.relax) this.relax.frame(now);   // the relaxed hyperplane graph (hyperplane_relax.js), when it is on
        const visible = this.container.offsetParent !== null && this.container.clientWidth > 0;
        if (visible && this._dirty) {
            for (const set of [this.squaresMesh, this.vRibbons, this.hRibbons]) if (set && set.mesh.visible) set.sortFor(this.camera);
            this.renderer.render(this.scene, this.camera);
            this._dirty = false;
        }
    }
}

function sub(n) {
    const d = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).split('').map((c) => d[+c]).join('');
}
