/**
 * Drawing the Delaunay domain (delaunay.js).
 *
 * In 3D it is a mesh built once in home-frame ball coordinates — the faces,
 * the edges as thin tubes, and the corners, every one a copy of the
 * basepoint — and the vertex shader applies the scene isometry, so the mesh
 * rides every view move and isometry animation without being rebuilt (as the
 * unwrapped cells of unwrap.js do). Faces are geodesic polygons: flat in the
 * Klein model, so they are subdivided there and mapped to the ball. The
 * isometry is conformal, so tubes and corner spheres keep a constant
 * hyperbolic size wherever the view carries them.
 *
 * In the plane picture the polygon is handed to the plane's fold shader
 * (planar.js) as walls with side pairings, which then draws the whole tiling
 * of the plane by copies of it.
 */
import * as THREE from 'three';
import { lorentzMatrix, lorentzApply, covToGeom } from './math.js';
import { kleinToBall } from './polyhedron.js';
import { layer, disposeGroup, view } from './scene.js';
import { typeset } from './format.js';

const MAP_GLSL = `
uniform mat4 u_L;
uniform bool u_uhs;
vec3 toScene(vec3 p) {
    float r2 = min(dot(p, p), 0.9999995);
    float f = 1.0 / (1.0 - r2);
    vec4 H = u_L * vec4(2.0 * p * f, (1.0 + r2) * f);
    vec3 b = H.xyz / (1.0 + H.w);
    if (u_uhs) {
        float D = max(b.x * b.x + b.y * b.y + (1.0 - b.z) * (1.0 - b.z), 1e-12);
        return vec3(2.0 * b.x / D, (1.0 - dot(b, b)) / D, 2.0 * b.y / D);
    }
    return b;
}`;

const VS = MAP_GLSL + `
attribute vec3 a_color;
attribute vec3 a_dir;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
    vec3 w = toScene(position);
    float r2 = dot(position, position);
    vec3 n = toScene(position + a_dir * 1e-3 * max(1.0 - r2, 1e-2)) - w;   // conformal: normals map along
    vN = normalize(normalMatrix * (dot(n, n) > 1e-20 ? n : vec3(0.0, 1.0, 0.0)));
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    vV = -mv.xyz;
    vW = w;
    vC = a_color;
    gl_Position = projectionMatrix * mv;
}`;

const FS = `
uniform bool u_uhs;
uniform float u_opacity;
uniform float u_gloss;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
    if (u_uhs && any(greaterThan(abs(vW), vec3(40.0)))) discard;
    vec3 N = normalize(vN), V = normalize(vV);
    vec3 L = normalize(vec3(0.35, 0.6, 1.0));
    float ndl = abs(dot(N, L)), ndv = abs(dot(N, V));
    float spec = pow(abs(dot(N, normalize(L + V))), 36.0);
    float rim = pow(1.0 - ndv, 2.0);
    vec3 col = vC * (0.34 + 0.66 * ndl) + vec3(u_gloss * spec) + vC * rim * 0.22;
    gl_FragColor = vec4(col, u_opacity);
}`;

const FACE_DIV = 12;          // subdivisions per fan triangle
const FACE_DIV_TRI = 9;       // … per facet of the barycentric subdivision
const TUBE_SIDES = 7;
const TUBE_SAMPLES = 28;

const rgb = (hex) => { const c = new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace); return [c.r, c.g, c.b]; };

/** A Klein point pulled just inside the sphere when it is ideal. */
const finiteK = (k, ideal) => (ideal ? k.clone().normalize().multiplyScalar(1 - 1e-5) : k);

/** Geodesic plane through three Klein points: { cov (unit covector), geom (ball sphere or plane) }. */
function planeOf(a, b, c) {
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    const cK = n.dot(a);
    const s = 1 / Math.sqrt(Math.max(1e-300, n.lengthSq() - cK * cK));
    const cov = new THREE.Vector4(n.x * s, n.y * s, n.z * s, cK * s);
    return { cov, geom: covToGeom(cov) };
}

function ballNormal(geom, p) {
    if (geom.type === 'plane') return geom.n.clone();
    return p.clone().sub(geom.c).normalize();
}

/** Corners of a boundary piece, ideal ones on the sphere. */
const pieceCorners = (f) => f.pts.map((k, i) => (f.ideal[i] ? k.clone().normalize() : k.clone()));

/** Klein → unit hyperboloid vector [x, y, z, t]. */
const hyp = (k) => { const s = 1 / Math.sqrt(Math.max(1e-12, 1 - k.lengthSq())); return [k.x * s, k.y * s, k.z * s, s]; };
const mdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];

/**
 * Where a side's label goes: its hyperbolic midpoint (its Klein midpoint when
 * an end is ideal), moved 0.35 toward the centre c of the polygon.
 */
function sideLabelPoint(f, c) {
    const [A, B] = f.pts;
    let M;
    if (f.ideal[0] || f.ideal[1]) M = hyp(finiteK(A, f.ideal[0]).clone().lerp(finiteK(B, f.ideal[1]), 0.5));
    else {
        const a = hyp(A), b = hyp(B), s = a.map((x, i) => x + b[i]);
        const n = Math.sqrt(-mdot(s, s));
        M = s.map(x => x / n);
    }
    const C = hyp(c);
    const k = -mdot(M, C);                       // cosh d(M, C)
    const u = C.map((x, i) => x - k * M[i]);     // tangent at M toward C
    const un = Math.sqrt(Math.max(1e-20, mdot(u, u)));
    const d = 0.35;
    const P = M.map((x, i) => Math.cosh(d) * x + Math.sinh(d) * u[i] / un);
    return new THREE.Vector3(P[0] / P[3], P[1] / P[3], P[2] / P[3]);
}

export function createDelaunayView() {
    const group = layer(false);
    const shared = { u_L: { value: new THREE.Matrix4() }, u_uhs: { value: false } };
    const faceMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, u_opacity: { value: 1 }, u_gloss: { value: 0.16 } },
        vertexShader: VS, fragmentShader: FS,
        side: THREE.DoubleSide, transparent: true, depthWrite: true, depthTest: true,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const lineMat = new THREE.ShaderMaterial({
        uniforms: { ...shared, u_opacity: { value: 1 }, u_gloss: { value: 0.3 } },
        vertexShader: VS, fragmentShader: FS, transparent: false, depthWrite: true, depthTest: true,
    });
    let built = null;               // { result, meshes }
    let labels = [];                // { el, home, out }
    let pickData = null;            // { pos (home ball), idx, triPiece }: the face mesh, for double-clicks

    function clear() {
        group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        group.clear();
        built = null;
        pickData = null;
    }

    /**
     * Faces: every boundary facet (a triangle of the barycentric subdivision),
     * subdivided in Klein coordinates and coloured by its face pairing. No
     * lines are drawn between them: lines go only where the boundary bends.
     */
    function faceGeometry(R, colors) {
        const pos = [], dir = [], col = [], idx = [], triPiece = [];
        for (const [pi, f] of R.raw.entries()) {
            const c = colors[f.region] || [0.7, 0.7, 0.8];
            const P = pieceCorners(f);
            const pl = planeOf(finiteK(P[0], f.ideal[0]), finiteK(P[1], f.ideal[1]),
                P.length > 2 ? finiteK(P[2], f.ideal[2]) : P[0].clone().setY(P[0].y + 0.5));
            // A triangle is gridded directly (origin P0, sides to P1 and P2); a polygon is fanned from its centre.
            const tri = P.length === 3;
            const g = tri ? P[0] : P.reduce((s, q, i) => s.add(finiteK(q, f.ideal[i])), new THREE.Vector3()).multiplyScalar(1 / P.length);
            for (let i = 0; i < (tri ? 1 : P.length); i++) {
                const A = tri ? P[1] : P[i], B = tri ? P[2] : P[(i + 1) % P.length];
                const base = pos.length / 3;
                const N = tri ? FACE_DIV_TRI : FACE_DIV;
                const at = (a, b) => base + (a * (2 * N + 3 - a)) / 2 + b;      // row a has N + 1 − a points
                for (let a = 0; a <= N; a++) {
                    for (let b = 0; b <= N - a; b++) {
                        const k = g.clone().addScaledVector(A.clone().sub(g), a / N).addScaledVector(B.clone().sub(g), b / N);
                        if (k.lengthSq() > 1) k.normalize();
                        const p = kleinToBall(k.multiplyScalar(1 - 1e-7));
                        const n = ballNormal(pl.geom, p);
                        pos.push(p.x, p.y, p.z);
                        dir.push(n.x, n.y, n.z);
                        col.push(c[0], c[1], c[2]);
                    }
                }
                for (let a = 0; a < N; a++) {
                    for (let b = 0; b < N - a; b++) {
                        idx.push(at(a, b), at(a + 1, b), at(a, b + 1));
                        triPiece.push(pi);
                        if (b < N - a - 1) { idx.push(at(a + 1, b), at(a + 1, b + 1), at(a, b + 1)); triPiece.push(pi); }
                    }
                }
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('a_dir', new THREE.Float32BufferAttribute(dir, 3));
        geo.setAttribute('a_color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        pickData = { pos, idx, triPiece };
        return geo;
    }

    /**
     * Edges as tubes of constant hyperbolic radius, only where the boundary
     * bends: full width where two face pairings meet, thin where one pairing
     * carries on round the bend (a fold).
     */
    function edgeGeometry(R, edgeColor, cycleColor) {
        const pos = [], dir = [], col = [], idx = [];
        const segs = R.dim === 3
            ? R.lines.map(l => ({
                a: l.a, b: l.b, r: l.kind === 'edge' ? 0.010 : 0.0045,
                color: l.kind === 'edge' && cycleColor && l.chain >= 0 ? cycleColor(l.chain) : edgeColor
            }))
            : R.raw.map(f => ({ a: f.vi[0], b: f.vi[1], r: 0.010, color: edgeColor }));
        const tmp = new THREE.Vector3();
        for (const s of segs) {
            const A = R.vertices[s.a], B = R.vertices[s.b];
            const ka = finiteK(A.k, A.ideal), kb = finiteK(B.k, B.ideal);
            const pts = [];
            for (let i = 0; i <= TUBE_SAMPLES; i++) {
                // Denser toward an ideal end, where the arc runs off to the sphere.
                let t = i / TUBE_SAMPLES;
                if (A.ideal && !B.ideal) t = t * t;
                else if (B.ideal && !A.ideal) t = 1 - (1 - t) * (1 - t);
                pts.push(kleinToBall(tmp.copy(ka).lerp(kb, t)));
            }
            const base = pos.length / 3;
            let prevN = null;
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                const tan = (i === 0 ? pts[1].clone().sub(pts[0]) : i === pts.length - 1 ? p.clone().sub(pts[i - 1]) : pts[i + 1].clone().sub(pts[i - 1]));
                if (tan.lengthSq() < 1e-20) tan.set(0, 0, 1);
                tan.normalize();
                const seed = prevN || (Math.abs(tan.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
                const n = seed.clone().addScaledVector(tan, -seed.dot(tan)).normalize();
                prevN = n;
                const bnm = new THREE.Vector3().crossVectors(tan, n);
                const r = s.r * Math.max(0.02, 1 - p.lengthSq());
                for (let k = 0; k < TUBE_SIDES; k++) {
                    const ang = (k / TUBE_SIDES) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
                    const d = n.clone().multiplyScalar(ca).addScaledVector(bnm, sa);
                    pos.push(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r);
                    dir.push(d.x, d.y, d.z);
                    col.push(s.color[0], s.color[1], s.color[2]);
                }
            }
            for (let i = 0; i + 1 < pts.length; i++) {
                for (let k = 0; k < TUBE_SIDES; k++) {
                    const k2 = (k + 1) % TUBE_SIDES;
                    const a = base + i * TUBE_SIDES + k, b = base + i * TUBE_SIDES + k2;
                    const c = base + (i + 1) * TUBE_SIDES + k2, d = base + (i + 1) * TUBE_SIDES + k;
                    idx.push(a, b, c, a, c, d);
                }
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('a_dir', new THREE.Float32BufferAttribute(dir, 3));
        geo.setAttribute('a_color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        return geo;
    }

    /** The corners as small spheres: copies of the basepoint in `color`, cone points in `coneColor`. */
    function cornerGeometry(R, color, coneColor, size) {
        const ico = new THREE.IcosahedronGeometry(1, 2);
        const V = ico.attributes.position, I = ico.index ? ico.index.array : null;
        const pos = [], dir = [], col = [], idx = [];
        for (const v of R.vertices) {
            if (v.ideal || !v.corner) continue;
            const orbit = v.kind === 'orbit';
            const c = orbit ? color : coneColor;
            const p = kleinToBall(v.k);
            const r = size * (orbit ? 1 : 0.8) * (1 - p.lengthSq());
            const base = pos.length / 3;
            for (let i = 0; i < V.count; i++) {
                const d = new THREE.Vector3(V.getX(i), V.getY(i), V.getZ(i)).normalize();
                pos.push(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r);
                dir.push(d.x, d.y, d.z);
                col.push(c[0], c[1], c[2]);
            }
            if (I) for (let i = 0; i < I.length; i++) idx.push(base + I[i]);
            else for (let i = 0; i < V.count; i++) idx.push(base + i);
        }
        ico.dispose();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('a_dir', new THREE.Float32BufferAttribute(dir, 3));
        geo.setAttribute('a_color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        return geo;
    }

    function addMesh(geo, mat, order) {
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;          // the shader moves the geometry
        m.renderOrder = order;
        group.add(m);
        return m;
    }

    return {
        group,
        /**
         * Build the meshes for a result of computeDelaunayDomain. `colors` is one
         * colour per merged face; `cycleColor(k)` (optional) colours edge k by
         * its cycle.
         */
        build(R, colors, { cycleColor = null } = {}) {
            clear();
            if (!R || !R.ok) return;
            const light = view.theme === 'light';
            const edgeColor = rgb(light ? 0x1f2937 : 0xe6e9f5);
            const cornerColor = rgb(light ? 0xb45309 : 0xfbbf24);
            const coneColor = rgb(light ? 0x0e7490 : 0x67e8f9);
            const meshes = {};
            // Light mode washes the hues toward pastel, as the Dirichlet raymarcher does.
            const faceCols = light ? colors.map(c => c.map(x => x + (1 - x) * 0.62)) : colors;
            if (R.dim === 3) {
                meshes.faces = addMesh(faceGeometry(R, faceCols), faceMat, 2);
                meshes.edges = addMesh(edgeGeometry(R, edgeColor, cycleColor), lineMat, 3);
            } else if (!R.convex) {
                // The plane's fold shader needs a convex polygon: outline it instead.
                meshes.edges = addMesh(edgeGeometry(R, edgeColor, null), lineMat, 3);
            }
            meshes.corners = addMesh(cornerGeometry(R, cornerColor, coneColor, R.dim === 3 ? 0.026 : 0.02), lineMat, 4);
            built = { result: R, meshes };
        },
        clear,
        setVisible(on) { group.visible = on; },
        setOpacity(o) {
            faceMat.uniforms.u_opacity.value = o;
            if (built && built.meshes.faces) built.meshes.faces.visible = o > 0.001;
            faceMat.depthWrite = o > 0.98;
        },
        /** The scene isometry (home frame → scene) and the model, once per frame or move. */
        setFrame(S, uhs) {
            shared.u_L.value.set(...lorentzMatrix(S));
            shared.u_uhs.value = uhs;
        },
        get result() { return built ? built.result : null; },

        /**
         * The boundary facet under a world-space ray (index into R.raw), or −1:
         * the face mesh is carried through the scene isometry S as the shader
         * does, and the nearest triangle hit wins.
         */
        pick(ray, S, uhs) {
            if (!pickData || !group.visible) return -1;
            const L = lorentzMatrix(S), P = pickData.pos;
            const n = P.length / 3, W = new Float64Array(P.length);
            for (let i = 0; i < n; i++) {
                const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
                const r2 = Math.min(x * x + y * y + z * z, 0.9999995), f = 1 / (1 - r2);
                const v = [2 * x * f, 2 * y * f, 2 * z * f, (1 + r2) * f];
                const H = [0, 1, 2, 3].map(r => L[4 * r] * v[0] + L[4 * r + 1] * v[1] + L[4 * r + 2] * v[2] + L[4 * r + 3] * v[3]);
                let bx = H[0] / (1 + H[3]), by = H[1] / (1 + H[3]), bz = H[2] / (1 + H[3]);
                if (uhs) {
                    const D = Math.max(bx * bx + by * by + (1 - bz) * (1 - bz), 1e-12), b2 = bx * bx + by * by + bz * bz;
                    [bx, by, bz] = [2 * bx / D, (1 - b2) / D, 2 * by / D];
                }
                W[3 * i] = bx; W[3 * i + 1] = by; W[3 * i + 2] = bz;
            }
            const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
            let best = -1, bestD = Infinity;
            const I = pickData.idx;
            for (let t = 0; t < I.length; t += 3) {
                a.fromArray(W, 3 * I[t]); b.fromArray(W, 3 * I[t + 1]); c.fromArray(W, 3 * I[t + 2]);
                if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
                const d = hit.distanceToSquared(ray.origin);
                if (d < bestD) { bestD = d; best = pickData.triPiece[t / 3]; }
            }
            return best;
        },

        // ---------------- the plane picture ----------------

        /**
         * The polygon as a domain the plane shader can fold into: one wall per
         * side (its covector and pairing in the SCENE frame S), paired sides
         * cross-referenced. Colours are per side. Null unless the polygon is
         * convex (the fold needs a convex polygon).
         */
        planarDomain(R, S, colors) {
            if (!R || !R.ok || R.dim !== 2 || !R.convex) return null;
            const L = lorentzMatrix(S), Si = S.inv().normalized();
            const centre = R.centre.clone();
            const walls = R.raw.map(f => {
                const [A, B] = pieceCorners(f);
                const d = B.clone().sub(A);
                let n = new THREE.Vector3(-d.z, 0, d.x);
                let c = n.dot(A);
                if (n.dot(centre) > c) { n.negate(); c = -c; }
                const s = 1 / Math.sqrt(Math.max(1e-300, n.lengthSq() - c * c));
                const cov = lorentzApply(L, new THREE.Vector4(n.x * s, 0, n.z * s, c * s));
                return {
                    cov,
                    pairing: { matrix: S.mul(f.el.m).mul(Si).normalized(), partner: f.partner }
                };
            });
            // Where the plane shader starts its walk (Klein, scene frame): the
            // polygon's centre, as far from its sides and corners as can be, so
            // that no segment from it runs along a side.
            const v = new THREE.Vector4(centre.x, 0, centre.z, 1).applyMatrix4(new THREE.Matrix4().set(...L));
            return {
                walls, colors: R.raw.map(f => colors[f.region] || [0.7, 0.7, 0.8]),
                centre: new THREE.Vector3(v.x / v.w, 0, v.z / v.w)
            };
        },

        // ---------------- face labels ----------------

        /**
         * Labels s_k on the minus side of pair k and s_k^{-1} on the plus side (s_k
         * alone on a side paired with itself),
         * typeset once and placed per frame (placeLabels).
         */
        buildLabels(box, R, colors) {
            for (const L of labels) L.el.remove();
            labels = [];
            if (!box || !R || !R.ok) return;
            R.sides.forEach((S, si) => {
                const pieces = S.parts.map(i => {
                    const f = R.raw[i];
                    const P = pieceCorners(f).map((q, j) => finiteK(q, f.ideal[j]));
                    const a = P.length > 2 ? new THREE.Vector3().crossVectors(P[1].clone().sub(P[0]), P[2].clone().sub(P[0])).length()
                        : P[1].distanceTo(P[0]);
                    const g = P.reduce((acc, q) => acc.add(q), new THREE.Vector3()).multiplyScalar(1 / P.length);
                    return { f, P, a, g };
                });
                if (!pieces.length) return;
                let at, out = null;
                if (R.dim === 3) {
                    // At the facet nearest the middle of the side, on the side.
                    const total = pieces.reduce((acc, q) => acc + q.a, 0) || 1;
                    const mid = pieces.reduce((acc, q) => acc.addScaledVector(q.g, q.a / total), new THREE.Vector3());
                    const best = pieces.reduce((x, y) => (y.g.distanceTo(mid) < x.g.distanceTo(mid) ? y : x));
                    at = best.g;
                    const n = new THREE.Vector3().crossVectors(best.P[1].clone().sub(best.P[0]), best.P[2].clone().sub(best.P[0])).normalize();
                    if (n.dot(best.f.inward.clone().sub(at)) > 0) n.negate();
                    out = at.clone().addScaledVector(n, 0.02);
                } else {
                    // The side's two ends (its pieces are collinear), then just inside its midpoint.
                    const ends = [];
                    for (const q of pieces) q.f.pts.forEach((k, j) => ends.push({ k, ideal: q.f.ideal[j] }));
                    let A = ends[0], B = ends[1] || ends[0], far = -1;
                    for (const x of ends) for (const y of ends) { const d = x.k.distanceTo(y.k); if (d > far) { far = d; A = x; B = y; } }
                    at = sideLabelPoint({ pts: [A.k, B.k], ideal: [A.ideal, B.ideal] }, R.centre);
                }
                const el = document.createElement('div');
                el.className = 'face-label delaunay-label';
                const k = S.pair + 1;
                const self = R.pairs[S.pair].minus === R.pairs[S.pair].plus;
                el.innerHTML = S.sign < 0 || self ? `\\(s_{${k}}\\)` : `\\(s_{${k}}^{-1}\\)`;
                const c = colors[si] || [0.7, 0.7, 0.8];
                el.style.borderColor = `rgb(${c.map(x => Math.round(255 * Math.min(1, x))).join(',')})`;
                box.appendChild(el);
                labels.push({ el, home: kleinToBall(at), out: out ? kleinToBall(out) : null });
            });
            typeset(labels.map(L => L.el));
        },
        clearLabels() { for (const L of labels) L.el.remove(); labels = []; },
        /** Per frame: project the labels; in 3D hide those on faces turned away. */
        placeLabels(camera, rect, toScreen) {
            for (const L of labels) {
                const s = toScreen(L.home, L.out);
                if (!s) { L.el.style.display = 'none'; continue; }
                L.el.style.display = 'block';
                L.el.style.transform = `translate(${s.x * rect.width}px, ${s.y * rect.height}px) translate(-50%, -50%)`;
            }
        },
        hasLabels: () => labels.length > 0,
    };
}
