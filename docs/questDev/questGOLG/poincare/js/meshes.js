/**
 * Meshes of fundamental domains, built once in HOME-frame Poincaré-ball
 * coordinates. A vertex shader applies the scene isometry (a 4×4 Lorentz
 * matrix u_L, and per instance a tile matrix), so animations, flight and
 * tilings never rebuild geometry — the approach of the desktop tool's
 * Delaunay view, which this follows closely.
 *
 * Faces are geodesic polygons: flat in the Klein model, so each is meshed
 * there (a fan of spokes from an interior point, with every corner on a
 * spoke so straight edges stay exact) and mapped to the ball.
 */
import * as THREE from 'three';
import { kleinToBall, covToGeom, cuspNull, horoballInBall } from './engine.js';

// ---------------- shaders ----------------

const MAP_GLSL = /* glsl */`
uniform mat4 u_L;
vec4 toHyp(vec3 p) {
    float r2 = min(dot(p, p), 0.9999995);
    float f = 1.0 / (1.0 - r2);
    return vec4(2.0 * p * f, (1.0 + r2) * f);
}
vec3 mapP(vec3 p) {
    vec4 H = toHyp(p);
#ifdef USE_INSTANCING
    H = instanceMatrix * H;
#endif
    H = u_L * H;
    return H.xyz / (1.0 + H.w);
}`;

const VS = MAP_GLSL + /* glsl */`
attribute vec3 a_color;
attribute vec3 a_dir;
attribute float a_tag;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying float vTag;
varying float vR;
void main() {
    vec3 w = mapP(position);
    float r2 = dot(position, position);
    // The map is conformal, so a short step along the normal maps to the image normal.
    vec3 n = w - mapP(position - a_dir * 1e-3 * max(1.0 - r2, 1e-2));
    vN = normalize(normalMatrix * (dot(n, n) > 1e-20 ? n : vec3(0.0, 1.0, 0.0)));
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    vV = -mv.xyz;
    vC = a_color;
    vTag = a_tag;
    vR = length(w);
    gl_Position = projectionMatrix * mv;
}`;

const FS = /* glsl */`
uniform float u_opacity;
uniform float u_gloss;
uniform float u_fade;      // > 0: fade alpha toward the sphere at infinity
uniform float u_selA;
uniform float u_selB;
uniform float u_hover;
uniform float u_time;
uniform vec3 u_selColor;
uniform vec3 u_tint;
uniform float u_tintAmt;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying float vTag;
varying float vR;
void main() {
    vec3 N = normalize(vN), V = normalize(vV);
    vec3 L = normalize(vec3(0.35, 0.6, 1.0));
    float ndl = abs(dot(N, L)), ndv = abs(dot(N, V));
    float spec = pow(abs(dot(N, normalize(L + V))), 36.0);
    float rim = pow(1.0 - ndv, 2.0);
    vec3 c = mix(vC, u_tint, u_tintAmt);
    float sel = (abs(vTag - u_selA) < 0.5 || abs(vTag - u_selB) < 0.5) ? 1.0 : 0.0;
    float hov = abs(vTag - u_hover) < 0.5 ? 1.0 : 0.0;
    c = mix(c, vec3(1.0), 0.28 * hov);
    c = mix(c, u_selColor, sel * (0.42 + 0.18 * sin(u_time * 4.0)));
    vec3 col = c * (0.36 + 0.64 * ndl) + vec3(u_gloss * spec) + c * rim * 0.22;
    float a = u_opacity;
    if (u_fade > 0.0) a *= 1.0 - smoothstep(u_fade, 1.0, vR);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
}`;

/** Uniforms every domain material shares (the scene isometry moves them all). */
export function sharedUniforms() {
    return {
        u_L: { value: new THREE.Matrix4() },
        u_time: { value: 0 },
    };
}

/**
 * A material that draws home-frame geometry through the scene isometry.
 * Selection uniforms (u_selA/u_selB/u_hover) compare against the a_tag attribute.
 */
export function mapMaterial(shared, { opacity = 1, gloss = 0.16, fade = 0, side = THREE.DoubleSide, transparent = null, depthWrite = null, polygonOffset = false } = {}) {
    const tr = transparent ?? opacity < 1;
    return new THREE.ShaderMaterial({
        uniforms: {
            u_L: shared.u_L, u_time: shared.u_time,
            u_opacity: { value: opacity }, u_gloss: { value: gloss }, u_fade: { value: fade },
            u_selA: { value: -9 }, u_selB: { value: -9 }, u_hover: { value: -9 },
            u_selColor: { value: new THREE.Color(1, 1, 1) },
            u_tint: { value: new THREE.Color(1, 1, 1) }, u_tintAmt: { value: 0 },
        },
        vertexShader: VS, fragmentShader: FS,
        side, transparent: tr, depthWrite: depthWrite ?? !tr, depthTest: true,
        polygonOffset, polygonOffsetFactor: polygonOffset ? 1 : 0, polygonOffsetUnits: polygonOffset ? 1 : 0,
    });
}

/** Points (limit set dust) through the same map: round sprites of a fixed pixel size. */
export function pointsMaterial(shared, size = 3) {
    return new THREE.ShaderMaterial({
        uniforms: { u_L: shared.u_L, u_size: { value: size }, u_opacity: { value: 0.9 } },
        vertexShader: MAP_GLSL + /* glsl */`
            attribute vec3 a_color;
            uniform float u_size;
            varying vec3 vC;
            void main() {
                vec3 w = mapP(position);
                vec4 mv = modelViewMatrix * vec4(w, 1.0);
                vC = a_color;
                gl_PointSize = u_size;
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */`
            uniform float u_opacity;
            varying vec3 vC;
            void main() {
                vec2 d = gl_PointCoord - 0.5;
                if (dot(d, d) > 0.25) discard;
                gl_FragColor = vec4(vC, u_opacity);
            }`,
        transparent: true, depthWrite: false,
    });
}

// ---------------- geometry buffers ----------------

class Buf {
    constructor() { this.pos = []; this.dir = []; this.col = []; this.tag = []; this.idx = []; }
    get n() { return this.pos.length / 3; }
    vert(p, d, c, tag = -1) {
        this.pos.push(p.x, p.y, p.z);
        this.dir.push(d.x, d.y, d.z);
        this.col.push(c[0], c[1], c[2]);
        this.tag.push(tag);
        return this.n - 1;
    }
    geometry() {
        if (!this.idx.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('a_dir', new THREE.Float32BufferAttribute(this.dir, 3));
        g.setAttribute('a_color', new THREE.Float32BufferAttribute(this.col, 3));
        g.setAttribute('a_tag', new THREE.Float32BufferAttribute(this.tag, 1));
        g.setIndex(this.idx);
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.01);
        return g;
    }
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Normal of a geodesic plane (covToGeom result) at a ball point. */
function ballNormal(geom, p) {
    if (geom.type === 'plane') return geom.n.clone();
    return p.clone().sub(geom.c).normalize();
}

/** Unit covector of a Klein plane n·k = c (|n|² − c² = 1). */
function unitCov(n, c) {
    const s = 1 / Math.sqrt(Math.max(1e-300, n.lengthSq() - c * c));
    return new THREE.Vector4(n.x * s, n.y * s, n.z * s, c * s);
}

/**
 * Mesh of the convex region of the Klein plane n·k = c cut out by the ball and
 * the constraints {n, c} (n·k ≤ c). `corners` are Klein points on its
 * boundary (vertices, ideal or not): each gets a spoke, so straight sides are
 * exact. Writes into `buf`; returns the ball point of the region's centre
 * (or null when the region is empty).
 */
export function regionMesh(buf, n, c, cons, corners, { color, tag = -1, rings = 8, spokes = 48 } = {}) {
    const nl = n.length();
    const nh = n.clone().divideScalar(nl);
    const h = c / nl;
    const rho2 = 1 - h * h;
    if (rho2 <= 1e-12) return null;
    const rho = Math.sqrt(rho2);
    const o = nh.clone().multiplyScalar(h);
    const u = Math.abs(nh.x) > 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
    u.addScaledVector(nh, -u.dot(nh)).normalize();
    const v = new THREE.Vector3().crossVectors(nh, u);
    const C2 = cons.map(K => ({ A: K.n.dot(u), B: K.n.dot(v), C: K.c - K.n.dot(o), s: K.n.length() }));
    const feasible = (x, y, tol = 1e-9) => C2.every(K => K.A * x + K.B * y <= K.C + tol * K.s);

    // Boundary points: the corners, and the free part of the circle at infinity.
    const bd = corners.map(k => [k.clone().sub(o).dot(u), k.clone().sub(o).dot(v)]);
    for (let i = 0; i < 96; i++) {
        const t = (i / 96) * 2 * Math.PI, x = rho * Math.cos(t), y = rho * Math.sin(t);
        if (feasible(x, y)) bd.push([x, y]);
    }
    if (bd.length < 2) return null;
    let gx = 0, gy = 0;
    for (const [x, y] of bd) { gx += x; gy += y; }
    gx /= bd.length; gy /= bd.length;
    if (!feasible(gx, gy, 1e-7) || gx * gx + gy * gy >= rho2) return null;

    // Spoke angles: uniform, plus one through every corner.
    const ang = [];
    for (let i = 0; i < spokes; i++) ang.push((i / spokes) * 2 * Math.PI);
    for (const [x, y] of bd.slice(0, corners.length)) {
        let a = Math.atan2(y - gy, x - gx);
        if (a < 0) a += 2 * Math.PI;
        ang.push(a);
    }
    ang.sort((a, b) => a - b);
    const A = ang.filter((a, i) => i === 0 || a - ang[i - 1] > 1e-6);
    if (A.length > 1 && 2 * Math.PI - A[A.length - 1] + A[0] < 1e-6) A.pop();

    const geom = covToGeom(unitCov(n, c));
    const tmp = new THREE.Vector3();
    const kleinAt = (x, y) => {
        tmp.copy(o).addScaledVector(u, x).addScaledVector(v, y);
        const r2 = tmp.lengthSq();
        if (r2 >= 1 - 1e-9) tmp.multiplyScalar((1 - 1e-7) / Math.sqrt(r2));
        return kleinToBall(tmp);
    };
    const put = (x, y) => {
        const p = kleinAt(x, y);
        return buf.vert(p, ballNormal(geom, p), color, tag);
    };
    const centre = put(gx, gy);
    const M = A.length;
    const ring0 = buf.n;
    for (const a of A) {
        const dx = Math.cos(a), dy = Math.sin(a);
        // Exit along the spoke: the circle, or the first constraint.
        const gd = gx * dx + gy * dy;
        let t = -gd + Math.sqrt(Math.max(0, gd * gd - (gx * gx + gy * gy) + rho2));
        let ideal = true;
        for (const K of C2) {
            const den = K.A * dx + K.B * dy;
            if (den <= 1e-14) continue;
            const s = (K.C - (K.A * gx + K.B * gy)) / den;
            if (s < t) { t = s; ideal = false; }
        }
        t = Math.max(0, t);
        for (let i = 1; i <= rings; i++) {
            // Toward an ideal exit the ball map stretches the Klein spacing: bunch the rings.
            const s = ideal ? 1 - (1 - i / rings) ** 2 : i / rings;
            put(gx + s * t * dx, gy + s * t * dy);
        }
    }
    const at = (j, i) => ring0 + (j % M) * rings + (i - 1);
    for (let j = 0; j < M; j++) {
        buf.idx.push(centre, at(j, 1), at(j + 1, 1));
        for (let i = 1; i < rings; i++) {
            buf.idx.push(at(j, i), at(j, i + 1), at(j + 1, i + 1), at(j, i), at(j + 1, i + 1), at(j + 1, i));
        }
    }
    return kleinAt(gx, gy).clone();
}

/**
 * A tube of constant hyperbolic radius along a Klein segment ka → kb (ball
 * radius r·(1 − |p|²)). Ideal ends are stopped `stopA`/`stopB` short of the
 * sphere (in ball distance) so no vertex sits at infinity.
 */
export function kleinTube(buf, ka, kb, { idealA = false, idealB = false, radius = 0.01, color, tag = -1, samples = 28, sides = 7, stopA = 0.01, stopB = 0.01 } = {}) {
    const xa = ka.clone().normalize(), xb = kb.clone().normalize();
    const a = idealA ? nearIdeal(idealB ? xb : kb, xa, stopA) : ka;
    const b = idealB ? nearIdeal(idealA ? xa : ka, xb, stopB) : kb;
    const n = idealA || idealB ? Math.round(samples * 1.6) : samples;
    const pts = [];
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
        let t = i / n;
        if (idealA && !idealB) t = t * t;
        else if (idealB && !idealA) t = 1 - (1 - t) * (1 - t);
        pts.push(kleinToBall(tmp.copy(a).lerp(b, t)).clone());
    }
    ballTube(buf, pts, { radius, color, tag, sides });
}

/** A tube along a polyline of ball points, radius scaled by (1 − |p|²). */
export function ballTube(buf, pts, { radius = 0.01, color, tag = -1, sides = 7, hyperbolic = true } = {}) {
    if (pts.length < 2) return;
    const base = buf.n;
    let prevN = null;
    const d = new THREE.Vector3(), bn = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const tan = i === 0 ? pts[1].clone().sub(pts[0]) : i === pts.length - 1 ? p.clone().sub(pts[i - 1]) : pts[i + 1].clone().sub(pts[i - 1]);
        if (tan.lengthSq() < 1e-20) tan.set(0, 0, 1);
        tan.normalize();
        const seed = prevN || (Math.abs(tan.x) > 0.9 ? V3(0, 1, 0) : V3(1, 0, 0));
        const nn = seed.clone().addScaledVector(tan, -seed.dot(tan));
        if (nn.lengthSq() < 1e-12) nn.copy(Math.abs(tan.x) > 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).addScaledVector(tan, -tan.x);
        nn.normalize();
        prevN = nn;
        bn.crossVectors(tan, nn);
        const r = radius * (hyperbolic ? Math.max(0, 1 - p.lengthSq()) : 1);
        for (let k = 0; k < sides; k++) {
            const a = (k / sides) * Math.PI * 2;
            d.copy(nn).multiplyScalar(Math.cos(a)).addScaledVector(bn, Math.sin(a));
            buf.vert(V3(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r), d, color, tag);
        }
    }
    for (let i = 0; i + 1 < pts.length; i++) {
        for (let k = 0; k < sides; k++) {
            const k2 = (k + 1) % sides;
            const a = base + i * sides + k, b = base + i * sides + k2;
            const c = base + (i + 1) * sides + k2, e = base + (i + 1) * sides + k;
            buf.idx.push(a, b, c, a, c, e);
        }
    }
}

/** A ball of Euclidean radius r at ball point p (for vertices and horoballs). */
export function ballSphere(buf, p, r, color, tag = -1, detail = 2) {
    const ico = SPHERES[detail] || (SPHERES[detail] = new THREE.IcosahedronGeometry(1, detail));
    const P = ico.attributes.position;
    const base = buf.n;
    const d = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
        d.set(P.getX(i), P.getY(i), P.getZ(i)).normalize();
        buf.vert(V3(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r), d, color, tag);
    }
    // Non-indexed icosahedron: consecutive triples.
    for (let i = 0; i < P.count; i++) buf.idx.push(base + i);
}
const SPHERES = {};

/** The Klein point on the segment from a to the ideal point ξ whose ball point is δ from ξ. */
function nearIdeal(a, xi, delta) {
    const k = new THREE.Vector3();
    let lo = 0, hi = 1;
    for (let it = 0; it < 48; it++) {
        const t = 0.5 * (lo + hi);
        if (kleinToBall(k.copy(a).lerp(xi, t)).distanceTo(xi) > delta) lo = t; else hi = t;
    }
    return k.copy(a).lerp(xi, lo).clone();
}

// ---------------- the Dirichlet domain ----------------

const CYCLE_HUE = (k) => { const c = new THREE.Color().setHSL((k * 0.6180339887 + 0.05) % 1, 0.78, 0.6); return [c.r, c.g, c.b]; };
const VERTEX_HUE = (k) => { const c = new THREE.Color().setHSL((k * 0.6180339887 + 0.38) % 1, 1.0, 0.72); return [c.r, c.g, c.b]; };
export { CYCLE_HUE, VERTEX_HUE };

/**
 * Meshes of a Dirichlet (or Ford) home domain H = { walls, poly, q0 }.
 *  - faces: one region per face, tag = wall index, colored `faceColors[i]`;
 *  - edges: tubes colored by their edge cycle (report.edgeCycles);
 *  - vertices: finite vertices colored by vertex class; ideal ones as horoballs.
 * `lite` builds a coarse face mesh for tilings.
 * Returns { faces, edges, vertices, centres: [ball point | null per wall] }.
 */
export function dirichletMeshes(H, faceColors, report, { lite = false, classes = null } = {}) {
    const poly = H.poly;
    const P = poly.planes;
    const fb = new Buf(), eb = new Buf(), vb = new Buf();
    const centres = [];
    const freeWalls = new Set(poly.freeArcs.map(f => f.wall));
    poly.faces.forEach((f, m) => {
        if (!f.edges.length && !freeWalls.has(m)) { centres.push(null); return; }
        const cons = P.filter((_, l) => l !== m);
        const corners = f.vertices.map(vi => poly.vertices[vi].k);
        const c = regionMesh(fb, P[m].n, P[m].c, cons, corners, {
            color: faceColors[m] || [0.7, 0.7, 0.8], tag: m,
            rings: lite ? 3 : 8, spokes: lite ? 18 : 44
        });
        centres.push(c);
    });

    // Edge cycles and cusps from the certificate.
    const cycleOf = new Map();
    (report && report.edgeCycles || []).forEach((c, k) => (c.edges || []).forEach(id => cycleOf.set(id, k)));
    const horo = horoballs(H);
    for (const e of poly.edges) {
        const A = poly.vertices[e.a], B = poly.vertices[e.b];
        const k = cycleOf.has(e.id) ? cycleOf.get(e.id) : -1;
        const color = k < 0 ? [0.82, 0.85, 0.9] : CYCLE_HUE(k);
        const stop = (i) => 0.5 * (horo.has(i) ? horo.get(i).radius : 0.01);
        kleinTube(eb, A.k, B.k, {
            idealA: A.ideal, idealB: B.ideal, radius: lite ? 0.008 : 0.011, color, tag: e.id,
            samples: lite ? 10 : 28, sides: lite ? 5 : 7, stopA: stop(e.a), stopB: stop(e.b)
        });
    }
    if (!lite) {
        poly.vertices.forEach((v, i) => {
            const cls = classes ? classes[i] : 0;
            const color = VERTEX_HUE(cls >= 0 ? cls : 0);
            if (v.ideal) {
                const hb = horo.get(i);
                if (hb) ballSphere(vb, hb.centre, hb.radius * (1 - 1e-3), color, 1000 + i, 3);
                return;
            }
            const p = kleinToBall(v.k);
            ballSphere(vb, p, 0.022 * (1 - p.lengthSq()), color, 1000 + i, 2);
        });
    }
    return { faces: fb.geometry(), edges: eb.geometry(), vertices: vb.geometry(), centres, horoballs: horo };
}

/** Horoball at each ideal vertex (the desktop tool's cusp markers), by vertex index. */
function horoballs(H) {
    const out = new Map();
    const q = H.q0 || V3(0, 0, 0);
    const r2 = q.lengthSq(), f = 1 / (1 - r2);
    const orbit = [[2 * q.x * f, 2 * q.y * f, 2 * q.z * f, (1 + r2) * f]];
    H.poly.vertices.forEach((v, i) => {
        if (!v.ideal) return;
        const N = cuspNull(v.k.clone().normalize(), orbit);
        if (N) out.set(i, horoballInBall(N));
    });
    return out;
}

/**
 * Vertex classes of a home domain: one index per vertex (the vertices glued
 * together by the pairings share it). `vertexClass(H, v)` lists v's class.
 */
export function vertexClasses(H, vertexClass) {
    const n = H.poly.vertices.length;
    const cls = new Array(n).fill(-1);
    let k = 0;
    for (let i = 0; i < n; i++) {
        if (cls[i] >= 0) continue;
        let members = [i];
        try { members = vertexClass(H, i); } catch (e) { /* keep it alone */ }
        for (const u of members) if (cls[u] < 0) cls[u] = k;
        if (cls[i] < 0) cls[i] = k;
        k++;
    }
    return cls;
}

// ---------------- a Fuchsian group's polygon ----------------

/**
 * The polygon D ∩ P (P = the ball's y = 0 disk) of a Fuchsian group, from the
 * 3D domain's walls: faces by the polyhedron of the walls plus the half-space
 * y ≤ 0, whose face on y = 0 is the polygon. Sides are colored like the
 * walls they lie on; tag = wall index.
 */
export function planarMeshes(H, faceColors, buildPolyhedron, { lite = false, fill = [0.93, 0.94, 0.97] } = {}) {
    const yWall = { cov: new THREE.Vector4(0, 1, 0, 0) };
    const walls = [...H.walls, yWall];
    const m = walls.length - 1;
    const poly = buildPolyhedron(walls);
    const f = poly.faces[m];
    const fb = new Buf(), eb = new Buf();
    const P = poly.planes;
    const corners = f.vertices.map(vi => poly.vertices[vi].k);
    regionMesh(fb, P[m].n, P[m].c, P.filter((_, l) => l !== m), corners, {
        color: fill, tag: -2, rings: lite ? 3 : 8, spokes: lite ? 18 : 56
    });
    const sides = [];
    for (const e of poly.edges) {
        if (e.i !== m && e.j !== m) continue;
        const w = e.i === m ? e.j : e.i;
        const A = poly.vertices[e.a], B = poly.vertices[e.b];
        kleinTube(eb, A.k, B.k, {
            idealA: A.ideal, idealB: B.ideal, radius: lite ? 0.009 : 0.014,
            color: faceColors[w] || [0.5, 0.5, 0.6], tag: w, samples: lite ? 12 : 32, sides: lite ? 5 : 7,
            stopA: 0.004, stopB: 0.004
        });
        sides.push({ wall: w, a: A.k.clone(), b: B.k.clone() });
    }
    return { faces: fb.geometry(), edges: eb.geometry(), sides };
}

// ---------------- the Delaunay domain ----------------

/**
 * Meshes of a Delaunay domain R (computeDelaunayDomain, dim 3): every boundary
 * facet (tag = its side index, colored `colors[side]`), tubes where the
 * boundary bends (full width where the pairing changes, thin at a fold), and
 * corners colored by vertex class.
 */
export function delaunayMeshes(R, colors, { lite = false } = {}) {
    const fb = new Buf(), eb = new Buf(), vb = new Buf();
    const finiteK = (k, ideal) => (ideal ? k.clone().normalize().multiplyScalar(1 - 1e-5) : k.clone());
    for (const f of R.raw) {
        const c = colors[f.region] || [0.7, 0.7, 0.8];
        const P = f.pts.map((k, i) => (f.ideal[i] ? k.clone().normalize() : k.clone()));
        if (P.length < 3) continue;
        const a = finiteK(P[0], f.ideal[0]), b = finiteK(P[1], f.ideal[1]), d = finiteK(P[2], f.ideal[2]);
        const n = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a));
        if (n.lengthSq() < 1e-24) continue;
        const cK = n.dot(a);
        // The facet as a region of its plane: the triangle's own sides as constraints.
        const g = P.reduce((s, q, i) => s.add(finiteK(q, f.ideal[i])), new THREE.Vector3()).multiplyScalar(1 / P.length);
        const cons = [];
        for (let i = 0; i < P.length; i++) {
            const A = P[i], B = P[(i + 1) % P.length];
            // Plane through the side A–B containing the facet normal; keep the side facing g.
            let m = new THREE.Vector3().crossVectors(B.clone().sub(A), n);
            let c = m.dot(A);
            if (m.dot(g) > c) { m.negate(); c = -c; }
            cons.push({ n: m, c });
        }
        regionMesh(fb, n, cK, cons, P, { color: c, tag: f.region, rings: lite ? 3 : 6, spokes: lite ? 9 : 18 });
    }
    const vertsUsed = R.vertices;
    if (R.lines) {
        for (const l of R.lines) {
            const A = vertsUsed[l.a], B = vertsUsed[l.b];
            const color = l.kind === 'edge' ? [0.16, 0.18, 0.24] : [0.4, 0.42, 0.5];
            kleinTube(eb, A.k, B.k, {
                idealA: A.ideal, idealB: B.ideal, radius: l.kind === 'edge' ? (lite ? 0.007 : 0.010) : 0.0045,
                color, samples: lite ? 10 : 24, sides: lite ? 5 : 6, stopA: 0.01, stopB: 0.01
            });
        }
    }
    if (!lite) {
        for (const v of vertsUsed) {
            if (!v.corner || v.ideal) continue;
            const p = kleinToBall(v.k);
            ballSphere(vb, p, 0.022 * (1 - p.lengthSq()), VERTEX_HUE(v.cls ?? 0), -1, 2);
        }
    }
    return { faces: fb.geometry(), edges: eb.geometry(), vertices: vb.geometry() };
}

// ---------------- generic ----------------

/** Ball points of the geodesic from p to q (both inside the ball). */
export function geodesicPoints(p, q, n = 16) {
    const toK = (x) => { const s = 2 / (1 + x.lengthSq()); return x.clone().multiplyScalar(s); };
    const a = toK(p), b = toK(q);
    const out = [];
    const t = new THREE.Vector3();
    for (let i = 0; i <= n; i++) out.push(kleinToBall(t.copy(a).lerp(b, i / n)).clone());
    return out;
}

export { Buf };
