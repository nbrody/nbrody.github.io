/**
 * Scene layers that ride the domain: the Cayley graph, translucent walls, the
 * dual (Dirichlet–Voronoi) tiling, polyhedral tiling by translates of the
 * domain, hyperbolic dust, and the growing orbit of the basepoint. All of them
 * are built in ball coordinates and pushed through toWorld / geomToWorld for
 * the upper half-space.
 */
import * as THREE from 'three';
import {
    Matrix2x2, getCayleyGraph, wallF, bisectorCov, covToGeom, hypDistProxy, hypDist,
    ballToMinkowski, projectToWall, pslKey, applyMatrixToBall
} from './math.js';
import { app, sceneMatrix, homeGeneratorsInterleaved } from './app.js';
import { standardGenerators, displayedDomain } from './domain.js';
import {
    view, theme, generatorColors, toWorld, geomToWorld, markerScale, disposeGroup, layer
} from './scene.js';

export const state = {
    cayleyMode: 'off',
    dualMode: 'off',
    dualOpacity: 0.3,
    wallsOpacity: 0,
    showTiling: false,
    showDust: false,
    focusKind: 'none',       // tiling focus: 'none' | 'edge' | 'vertex'
    focusPoint: null,
};

export const groups = {
    cayley: layer(false),
    walls: layer(false),
    dual: layer(false),
    tiling: layer(false),
    dust: layer(false),
    orbit: layer(true),
};

// ---------------- geodesics and tubes ----------------

/** Points along the hyperbolic geodesic p1 → p2 (ball model). */
export function geodesicPoints(p1, p2, segments = 16) {
    const cross = new THREE.Vector3().crossVectors(p1, p2);
    if (cross.length() < 1e-6) {
        const out = [];
        for (let i = 0; i <= segments; i++) out.push(new THREE.Vector3().lerpVectors(p1, p2, i / segments));
        return out;
    }
    const v1 = p1.clone(), v2 = p2.clone(), v3 = cross;
    const d1 = (p1.lengthSq() + 1) / 2;
    const d2 = (p2.lengthSq() + 1) / 2;
    const d3 = 0;
    const detM = (v1.x * (v2.y * v3.z - v2.z * v3.y) -
        v1.y * (v2.x * v3.z - v2.z * v3.x) +
        v1.z * (v2.x * v3.y - v2.y * v3.x));
    if (Math.abs(detM) < 1e-9) return [p1, p2];
    const center = new THREE.Vector3(
        (d1 * (v2.y * v3.z - v2.z * v3.y) - v1.y * (d2 * v3.z - v2.z * d3) + v1.z * (d2 * v3.y - v2.y * d3)) / detM,
        (v1.x * (d2 * v3.z - v2.z * d3) - d1 * (v2.x * v3.z - v2.z * v3.x) + v1.z * (v2.x * d3 - d2 * v3.x)) / detM,
        (v1.x * (v2.y * d3 - d2 * v3.y) - v1.y * (v2.x * d3 - d2 * v3.x) + d1 * (v2.x * v3.y - v2.y * v3.x)) / detM
    );
    const radius = Math.sqrt(Math.max(0, center.lengthSq() - 1));
    const r1 = p1.clone().sub(center);
    const r2 = p2.clone().sub(center);
    const arc = [];
    for (let i = 0; i <= segments; i++) {
        arc.push(new THREE.Vector3().lerpVectors(r1, r2, i / segments).normalize().multiplyScalar(radius).add(center));
    }
    return arc;
}

/**
 * A tube swept along a polyline in ball coordinates (rotation-minimising
 * frame), tapered toward the ideal boundary unless `taper` is false. Returns
 * a BufferGeometry already mapped to the current model.
 */
export function tubeGeometry(polylines, { radius = 0.011, sides = 7, taper = true, minScale = 0.07 } = {}) {
    const positions = [], normals = [], indices = [];
    const perp = (t) => Math.abs(t.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    for (const path of polylines) {
        const m = path.length;
        if (m < 2) continue;
        const base = positions.length / 3;
        let prevN = null;
        for (let i = 0; i < m; i++) {
            const p = path[i];
            const tan = (i === 0 ? path[1].clone().sub(path[0])
                : i === m - 1 ? path[i].clone().sub(path[i - 1])
                    : path[i + 1].clone().sub(path[i - 1]));
            if (tan.lengthSq() < 1e-14) tan.set(0, 0, 1);
            tan.normalize();
            let n = prevN ? prevN.clone().addScaledVector(tan, -prevN.dot(tan)) : perp(tan).addScaledVector(tan, -perp(tan).dot(tan));
            if (n.lengthSq() < 1e-12) n = perp(tan).addScaledVector(tan, -perp(tan).dot(tan));
            n.normalize();
            prevN = n;
            const b = new THREE.Vector3().crossVectors(tan, n);
            const r = taper ? radius * Math.max(minScale, 1 - p.length()) : radius;
            for (let k = 0; k < sides; k++) {
                const a = (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
                positions.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
                normals.push(nx, ny, nz);
            }
        }
        for (let i = 0; i < m - 1; i++) {
            for (let k = 0; k < sides; k++) {
                const k2 = (k + 1) % sides;
                const a = base + i * sides + k, b2 = base + i * sides + k2;
                const c = base + (i + 1) * sides + k2, d = base + (i + 1) * sides + k;
                indices.push(a, b2, c, a, c, d);
            }
        }
    }
    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(indices);
    return geomToWorld(g);
}

// ---------------- Cayley graph ----------------

function buildTGenerators() {
    const gens = standardGenerators().filter(g => !g.unpaired);
    const out = [];
    for (const g of gens) { out.push(g.home); out.push(g.home.inv().normalized()); }
    return { generators: out, numTypes: gens.length };
}

/**
 * Generating set for a mode ('S' = the typed generators, 'T' = the face
 * pairings), shared by the Cayley graph and the dual tiling, in the home
 * frame; plus a word-length cap.
 */
function modeGenerators(mode) {
    let generators, numTypes, depth = app.depth;
    if (mode === 'T') {
        const t = buildTGenerators();
        if (!t.numTypes) return null;
        generators = t.generators;
        numTypes = t.numTypes;
        if (numTypes > 20) depth = Math.min(depth, 2);
        else if (numTypes > 10) depth = Math.min(depth, 3);
        else depth = Math.min(depth, 4);
    } else {
        generators = homeGeneratorsInterleaved();
        numTypes = app.matrices.length;
        depth = Math.min(depth, 6);
    }
    if (!generators.length) return null;
    return { generators, numTypes, depth };
}

const CAYLEY_TUBE_LIMIT = 9000;

function buildCayleyVertices(points) {
    const seen = new Set();
    const uniq = [];
    for (const p of points) {
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(p);
    }
    if (!uniq.length) return;
    const T = theme().cayleyVertex;
    const mat = new THREE.MeshStandardMaterial({
        color: T.color, emissive: T.emissive, emissiveIntensity: T.intensity, roughness: 0.35, metalness: 0.1
    });
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.015, 10, 8), mat, uniq.length);
    const dummy = new THREE.Object3D();
    uniq.forEach((p, i) => {
        dummy.position.copy(toWorld(p));
        dummy.scale.setScalar(markerScale(p, 0.1, 1.5));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    groups.cayley.add(inst);
}

function buildCayleyLines(typeEdges, points, color) {
    const pts = [];
    for (const { u, v } of typeEdges) {
        if (points[u].distanceTo(points[v]) < 1e-5) continue;
        const geo = geodesicPoints(points[u], points[v]);
        for (let i = 0; i < geo.length - 1; i++) pts.push(geo[i], geo[i + 1]);
    }
    if (!pts.length) return null;
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    // Fade strands toward the page as they approach the ideal boundary.
    const cBase = new THREE.Color(color), cBg = new THREE.Color(theme().bg);
    const colors = new Float32Array(pts.length * 3);
    const tmp = new THREE.Color();
    pts.forEach((p, i) => {
        const f = THREE.MathUtils.smoothstep(p.length(), 0.72, 0.995);
        tmp.copy(cBase).lerp(cBg, f * 0.85);
        colors[3 * i] = tmp.r; colors[3 * i + 1] = tmp.g; colors[3 * i + 2] = tmp.b;
    });
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geomToWorld(geom);
    const lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.8, depthWrite: true
    }));
    lines.renderOrder = 1;
    return lines;
}

export function updateCayley(opts = {}) {
    disposeGroup(groups.cayley);
    groups.cayley.visible = state.cayleyMode !== 'off';
    if (state.cayleyMode === 'off') return;
    const sel = modeGenerators(state.cayleyMode);
    if (!sel) return;
    const { points, edges } = getCayleyGraph(sel.generators, sel.depth, sceneMatrix(), 15000);
    buildCayleyVertices(points);
    const useTubes = !opts.fast && edges.length <= CAYLEY_TUBE_LIMIT;
    for (let type = 0; type < sel.numTypes; type++) {
        const typeEdges = edges.filter(e => e.type === type);
        if (!typeEdges.length) continue;
        const color = generatorColors[type % generatorColors.length];
        let obj;
        if (useTubes) {
            const paths = typeEdges.filter(({ u, v }) => points[u].distanceTo(points[v]) > 1e-5)
                .map(({ u, v }) => geodesicPoints(points[u], points[v], 8));
            const g = tubeGeometry(paths);
            obj = g ? new THREE.Mesh(g, new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.2
            })) : null;
        } else {
            obj = buildCayleyLines(typeEdges, points, color);
        }
        if (obj) groups.cayley.add(obj);
    }
}

// ---------------- walls ----------------

function createWallMesh(geom, color, opacity) {
    let mesh = null;
    if (geom.type === 'plane') {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false
        }));
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), geom.n);
    } else {
        const { c: center, r: radius } = geom;
        const centerDist = center.length();
        if (centerDist < 0.001 || radius > 100) return null;
        const thetaMax = Math.acos(Math.min(1, Math.max(-1, Math.min(1, radius / centerDist))));
        const segments = 32, rings = 16;
        const vertices = [], indices = [];
        for (let i = 0; i <= rings; i++) {
            const phi = (i / rings) * thetaMax;
            const sp = Math.sin(phi), cp = Math.cos(phi);
            for (let j = 0; j <= segments; j++) {
                const th = (j / segments) * Math.PI * 2;
                vertices.push(sp * Math.cos(th) * radius, sp * Math.sin(th) * radius, cp * radius);
            }
        }
        for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
            const a = i * (segments + 1) + j, b = a + segments + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false
        }));
        mesh.position.copy(center);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), center.clone().negate().normalize());
    }
    return mesh;
}

export function updateWalls() {
    disposeGroup(groups.walls);
    groups.walls.visible = state.wallsOpacity > 0;
    const D = displayedDomain();
    if (!D || state.wallsOpacity <= 0) return;
    D.walls.forEach((w, i) => {
        const color = w.kind === 'cone' ? theme().cone : generatorColors[i % generatorColors.length];
        const m = createWallMesh(w.geom, color, state.wallsOpacity * 0.4);
        if (!m) return;
        if (view.model === 'uhs') {
            m.updateMatrix();
            m.geometry.applyMatrix4(m.matrix);
            m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
            geomToWorld(m.geometry);
        }
        groups.walls.add(m);
    });
}

export function setWallsOpacity(o) {
    state.wallsOpacity = o;
    groups.walls.visible = o > 0;
    groups.walls.children.forEach(ch => { if (ch.material) ch.material.opacity = o * 0.4; });
    if (o > 0 && groups.walls.children.length === 0) updateWalls();
}

/** A translucent bisector mesh (tutorial overlay), owned by the caller. */
export function bisectorMesh(p1, p2, color, opacity) {
    const cov = bisectorCov(p1, p2);
    return cov ? createWallMesh(covToGeom(cov), color, opacity) : null;
}

// ---------------- clipped faces (dual tiling, tiling, highlights) ----------------

const FACE_TOL = 1e-4;

/**
 * Tessellate the convex face carved out of wall `geom` around the interior
 * pole `P`, bounded by the unit ball and the half-spaces `neighborCovs`
 * (covectors oriented domain-side F<0): march outward from P in `dirs`
 * directions to the face boundary, then fan `rings` radial bands.
 */
export function buildClippedFace(geom, P, neighborCovs, out, dirs, rings) {
    if (P.lengthSq() >= 1) return;
    for (const Wq of neighborCovs) if (wallF(P, Wq) > FACE_TOL) return;
    const isSphere = geom.type === 'sphere';
    const nrm = isSphere ? P.clone().sub(geom.c).multiplyScalar(1 / geom.r) : geom.n.clone();
    const e1 = Math.abs(nrm.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    e1.sub(nrm.clone().multiplyScalar(e1.dot(nrm))).normalize();
    const e2 = new THREE.Vector3().crossVectors(nrm, e1);
    const at = (t, ct, st) => {
        const dx = e1.x * ct + e2.x * st, dy = e1.y * ct + e2.y * st, dz = e1.z * ct + e2.z * st;
        if (isSphere) {
            const cs = Math.cos(t) * geom.r, sn = Math.sin(t) * geom.r;
            return new THREE.Vector3(geom.c.x + nrm.x * cs + dx * sn, geom.c.y + nrm.y * cs + dy * sn, geom.c.z + nrm.z * cs + dz * sn);
        }
        return new THREE.Vector3(P.x + dx * t, P.y + dy * t, P.z + dz * t);
    };
    const inFace = (Q) => {
        if (Q.x * Q.x + Q.y * Q.y + Q.z * Q.z >= 1 - 1e-6) return false;
        for (const Wq of neighborCovs) if (wallF(Q, Wq) > FACE_TOL) return false;
        return true;
    };
    const tMax = isSphere ? Math.acos(Math.max(-1, Math.min(1, geom.r / geom.c.length()))) : 2.0;
    const rim = [];
    for (let i = 0; i < dirs; i++) {
        const th = (i / dirs) * Math.PI * 2;
        const ct = Math.cos(th), st = Math.sin(th);
        let lo = 0, hi = tMax;
        if (inFace(at(hi, ct, st))) { rim.push({ ct, st, t: hi }); continue; }
        for (let it = 0; it < 20; it++) {
            const mid = 0.5 * (lo + hi);
            if (inFace(at(mid, ct, st))) lo = mid; else hi = mid;
        }
        rim.push({ ct, st, t: lo });
    }
    for (let i = 0; i < dirs; i++) {
        const a = rim[i], b = rim[(i + 1) % dirs];
        for (let k = 0; k < rings; k++) {
            const r0 = k / rings, r1 = (k + 1) / rings;
            const A = at(a.t * r0, a.ct, a.st), B = at(a.t * r1, a.ct, a.st);
            const C = at(b.t * r1, b.ct, b.st), D = at(b.t * r0, b.ct, b.st);
            if (k === 0) out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
            else out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z);
        }
    }
}

// ---------------- dual tiling ----------------

const DUAL_NEIGHBORS = 64;

function buildDualFacet(p1, p2, neighborCovs, out, dirs, rings) {
    const W = bisectorCov(p1, p2);
    if (!W) return;
    const geom = covToGeom(W);
    const v1 = ballToMinkowski(p1), v2 = ballToMinkowski(p2);
    const sSp = v1.sp.clone().add(v2.sp), sT = v1.t + v2.t;
    const nm = Math.sqrt(Math.max(1e-12, sT * sT - sSp.lengthSq()));
    const poleT = sT / nm;
    let P = sSp.multiplyScalar(1 / nm).multiplyScalar(1 / (1 + poleT));
    P = projectToWall(P, geom);
    buildClippedFace(geom, P, neighborCovs, out, dirs, rings);
}

export function updateDual(opts = {}) {
    disposeGroup(groups.dual);
    groups.dual.visible = state.dualMode !== 'off';
    if (state.dualMode === 'off') return;
    const sel = modeGenerators(state.dualMode);
    if (!sel) return;
    let depth = Math.min(sel.depth, 4);
    if (opts.fast) depth = Math.min(depth, 2);
    const maxNodes = opts.fast ? 400 : 1500;
    const dirs = opts.fast ? 20 : 48, rings = opts.fast ? 2 : 5;
    const { points, edges } = getCayleyGraph(sel.generators, depth, sceneMatrix(), maxNodes);
    if (points.length < 2) return;
    const byType = new Map();
    for (const e of edges) {
        const p1 = points[e.u], p2 = points[e.v];
        if (p1.distanceTo(p2) < 1e-5) continue;
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        const ranked = [];
        for (let w = 0; w < points.length; w++) {
            if (w === e.u || w === e.v) continue;
            ranked.push([hypDistProxy(mid, points[w]), w]);
        }
        ranked.sort((a, b) => a[0] - b[0]);
        const neighborCovs = [];
        for (let n = 0; n < Math.min(DUAL_NEIGHBORS, ranked.length); n++) {
            const cov = bisectorCov(p1, points[ranked[n][1]]);
            if (cov) neighborCovs.push(cov);
        }
        let arr = byType.get(e.type);
        if (!arr) { arr = []; byType.set(e.type, arr); }
        buildDualFacet(p1, p2, neighborCovs, arr, dirs, rings);
    }
    for (const [type, arr] of byType) {
        if (!arr.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        geomToWorld(g);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            color: generatorColors[type % generatorColors.length],
            transparent: true, opacity: state.dualOpacity, side: THREE.DoubleSide, depthWrite: false
        }));
        m.renderOrder = 1;
        groups.dual.add(m);
    }
}

export function setDualOpacity(o) {
    state.dualOpacity = o;
    groups.dual.children.forEach(ch => { if (ch.material) ch.material.opacity = o; });
}

// ---------------- polyhedral tiling ----------------

const TILING_OPACITY = 0.14;
const TILING_MAX = 30;
const TILING_DEPTH = 2;
const FOCUS_TILE_TOL = 0.08;

function nearbyTiles(walls, maxDepth, maxTiles) {
    const moves = walls.map(w => w.elem);
    const seen = new Set([pslKey(Matrix2x2.identity())]);
    const out = [];
    let frontier = [Matrix2x2.identity()];
    for (let d = 0; d < maxDepth && out.length < maxTiles; d++) {
        const next = [];
        for (const m of frontier) {
            for (const mv of moves) {
                const prod = m.mul(mv).normalized();
                const key = pslKey(prod);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(prod);
                next.push(prod);
                if (out.length >= maxTiles) break;
            }
            if (out.length >= maxTiles) break;
        }
        frontier = next;
    }
    return out;
}

export function updateTiling(opts = {}) {
    disposeGroup(groups.tiling);
    groups.tiling.visible = state.showTiling;
    const H = app.home, S = app.scene;
    if (!state.showTiling || !H || !H.walls.length) return;
    const walls = H.walls;
    const V = sceneMatrix();
    const q0 = H.q0;
    const dirs = opts.fast ? 16 : 34, rings = opts.fast ? 2 : 3;
    const focused = !opts.fast && state.focusKind !== 'none' && state.focusPoint;
    const tiles = focused ? nearbyTiles(walls, 5, 400)
        : nearbyTiles(walls, opts.fast ? 1 : TILING_DEPTH, opts.fast ? 14 : TILING_MAX);
    const d0 = focused ? hypDist(state.focusPoint, S.conePoint) : 0;
    const byWall = new Map();
    for (const h of tiles) {
        const Vh = V.mul(h).normalized();
        const c_h = applyMatrixToBall(Vh, q0);
        if (c_h.lengthSq() >= 1) continue;
        if (focused && Math.abs(hypDist(state.focusPoint, c_h) - d0) > FOCUS_TILE_TOL) continue;
        const covs = [], geoms = [];
        for (const w of walls) {
            const cov = bisectorCov(c_h, applyMatrixToBall(Vh.mul(w.elem).normalized(), q0));
            covs.push(cov);
            geoms.push(cov ? covToGeom(cov) : null);
        }
        for (let j = 0; j < walls.length; j++) {
            if (!geoms[j]) continue;
            const pole = projectToWall(c_h, geoms[j]);
            const others = [];
            for (let k = 0; k < covs.length; k++) if (k !== j && covs[k]) others.push(covs[k]);
            let arr = byWall.get(j);
            if (!arr) { arr = []; byWall.set(j, arr); }
            buildClippedFace(geoms[j], pole, others, arr, dirs, rings);
        }
    }
    for (const [j, arr] of byWall) {
        if (!arr.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        geomToWorld(g);
        const color = walls[j].kind === 'cone' ? theme().cone : generatorColors[j % generatorColors.length];
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: TILING_OPACITY, side: THREE.DoubleSide, depthWrite: false
        }));
        m.renderOrder = 0;
        groups.tiling.add(m);
    }
}

// ---------------- dust ----------------

const DUST_COUNT = 15000;
const DUST_MAX_DIST = 9;
let dustPoints = null;

function randomHyperbolicPoint(maxDist) {
    // Direction uniform on the sphere; distance from the H³ volume density
    // sinh²r via inverse-CDF bisection on V(r) = (sinh 2r − 2r)/4.
    const V = (r) => (Math.sinh(2 * r) - 2 * r) / 4;
    const target = Math.random() * V(maxDist);
    let lo = 0, hi = maxDist;
    for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (V(mid) < target) lo = mid; else hi = mid;
    }
    const R = Math.tanh(0.25 * (lo + hi));
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return new THREE.Vector3(R * s * Math.cos(th), R * s * Math.sin(th), R * u);
}

/** The dust scatter rides the scene isometry (view-independent base scatter). */
export function repositionDust() {
    const inst = groups.dust.children[0];
    if (!inst || !dustPoints) return;
    const dummy = new THREE.Object3D();
    const S = sceneMatrix();
    dustPoints.forEach(({ p, jitter }, i) => {
        const q = applyMatrixToBall(S, p);
        dummy.position.copy(toWorld(q));
        dummy.scale.setScalar(markerScale(q, 0.22, 1.3) * jitter);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
}

export function updateDust(resample = false) {
    disposeGroup(groups.dust);
    groups.dust.visible = state.showDust;
    if (!state.showDust) return;
    if (!dustPoints || resample) {
        dustPoints = [];
        for (let i = 0; i < DUST_COUNT; i++) {
            dustPoints.push({ p: randomHyperbolicPoint(DUST_MAX_DIST), jitter: 0.55 + Math.random() * 0.9 });
        }
    }
    const T = theme().dust;
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({
        color: T.color, emissive: T.emissive, emissiveIntensity: T.intensity,
        roughness: 0.5, metalness: 0.05, transparent: true, opacity: T.opacity, depthWrite: false
    }), dustPoints.length);
    inst.renderOrder = 1;
    groups.dust.add(inst);
    repositionDust();
}

// ---------------- orbit growth ----------------

export let orbitRun = null;
const ORBIT_MAX = 2600, ORBIT_BATCH = 16, ORBIT_TICK = 70, ORBIT_POP = 420;
const ORBIT_ORIGIN = new THREE.Vector3(0, 0, 0);

export function stopOrbit() {
    if (orbitRun && orbitRun.timer) clearTimeout(orbitRun.timer);
    disposeGroup(groups.orbit);
    orbitRun = null;
}

export function startOrbit() {
    stopOrbit();
    const gens = homeGeneratorsInterleaved();
    if (!gens.length) return;
    const mat = new THREE.MeshStandardMaterial({
        color: theme().orbit, emissive: theme().orbit, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.1
    });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 12, 8), mat, ORBIT_MAX);
    mesh.frustumCulled = false;
    mesh.count = 1;
    groups.orbit.add(mesh);
    const I = Matrix2x2.identity();
    orbitRun = { mesh, mats: [I], born: [performance.now()], seen: new Set([pslKey(I)]), gens, head: 0, growing: true, dirty: true, timer: null };
    tickOrbit();
}

function tickOrbit() {
    const R = orbitRun;
    if (!R) return;
    R.timer = null;
    let added = 0;
    while (added < ORBIT_BATCH && R.head < R.mats.length && R.mats.length < ORBIT_MAX) {
        const m = R.mats[R.head++];
        for (const g of R.gens) {
            if (R.mats.length >= ORBIT_MAX) break;
            const prod = m.mul(g).normalized();
            const key = pslKey(prod);
            if (R.seen.has(key)) continue;
            R.seen.add(key);
            R.mats.push(prod);
            R.born.push(performance.now());
            added++;
        }
    }
    R.mesh.count = R.mats.length;
    R.dirty = true;
    if (R.mats.length >= ORBIT_MAX || R.head >= R.mats.length) R.growing = false;
    else R.timer = setTimeout(tickOrbit, ORBIT_TICK);
}

/** Re-place every orbit point; returns true while further frames are needed. */
export function updateOrbitInstances(now) {
    const R = orbitRun;
    if (!R) return false;
    const dummy = new THREE.Object3D();
    const S = sceneMatrix();
    let popping = false;
    for (let i = 0; i < R.mats.length; i++) {
        const q = applyMatrixToBall(S.mul(R.mats[i]).normalized(), ORBIT_ORIGIN);
        const age = (now - R.born[i]) / ORBIT_POP;
        let pop = 1;
        if (age < 1) { popping = true; const t = Math.max(0, age); pop = t * t * (3 - 2 * t); }
        dummy.position.copy(toWorld(q));
        dummy.scale.setScalar(markerScale(q, 0.12, 1.5) * pop);
        dummy.updateMatrix();
        R.mesh.setMatrixAt(i, dummy.matrix);
    }
    R.mesh.instanceMatrix.needsUpdate = true;
    R.dirty = popping || R.growing;
    return R.dirty;
}

export function markOrbitDirty() { if (orbitRun) orbitRun.dirty = true; }

export function recolorOrbit() {
    if (!orbitRun) return;
    orbitRun.mesh.material.color.set(theme().orbit);
    orbitRun.mesh.material.emissive.set(theme().orbit);
}

/** Rebuild every orbit/domain layer that is switched on. */
export function refreshLayers(opts = {}) {
    if (state.cayleyMode !== 'off') updateCayley(opts);
    if (state.dualMode !== 'off') updateDual(opts);
    if (state.showTiling) updateTiling(opts);
    if (state.wallsOpacity > 0) updateWalls();
    if (state.showDust) repositionDust();
    markOrbitDirty();
}
