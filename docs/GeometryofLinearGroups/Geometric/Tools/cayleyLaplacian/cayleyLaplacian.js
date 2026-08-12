import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ============================================================================
// Cayley graphs of Fuchsian groups, with Laplace eigenmodes.
//  · Δ⁺(2,3,7) = ⟨x,y | x², y³, (xy)⁷⟩ — von Dyck triangle group, rotations
//    of the (2,3,7) triangle tiling; Cayley graph is 3-regular (default).
//  · Γ₂ = ⟨a,b,c,d | [a,b][c,d]⟩ — genus-2 surface group via the Bolza {8,8}
//    octagon side pairings; Cayley graph is the 1-skeleton of {8,8}.
// We build a ball in the graph by BFS on SU(1,1) matrices (vertices sit at
// the orbit of a generic basepoint), diagonalize the graph Laplacian on the
// ball (Lanczos + tridiagonal QL) and display eigenfunctions as
// heights/colors over the Poincaré disk.
// ============================================================================

// ---------------------------------------------------------------------------
// SU(1,1) arithmetic.  g = [ar, ai, br, bi] represents [[a, b], [conj b, conj a]]
// with |a|² − |b|² = 1, acting on the disk by z ↦ (az + b)/(conj(b) z + conj(a)).
// ---------------------------------------------------------------------------
const ID = [1, 0, 0, 0];

function mul(g, h) {
    const [ar, ai, br, bi] = g, [cr, ci, dr, di] = h;
    return [
        ar * cr - ai * ci + br * dr + bi * di,
        ar * ci + ai * cr + bi * dr - br * di,
        ar * dr - ai * di + br * cr + bi * ci,
        ar * di + ai * dr + bi * cr - br * ci
    ];
}

function inv(g) { return [g[0], -g[1], -g[2], -g[3]]; }

function applyMobius(g, x, y) {    // z ↦ (a z + b)/(conj(b) z + conj(a))
    const [ar, ai, br, bi] = g;
    const nr = ar * x - ai * y + br, ni = ar * y + ai * x + bi;
    const dr = br * x + bi * y + ar, di = br * y - bi * x - ai;
    const dd = dr * dr + di * di;
    return [(nr * dr + ni * di) / dd, (ni * dr - nr * di) / dd];
}

function rotationAbout(px, py, theta) {   // elliptic rotation by theta about p
    const s = 1 / Math.sqrt(1 - px * px - py * py);
    const Tp = [s, 0, s * px, s * py];
    const R = [Math.cos(theta / 2), Math.sin(theta / 2), 0, 0];
    return mul(mul(Tp, R), inv(Tp));
}

function hypDist(x1, y1, x2, y2) {
    const q = 2 * ((x1 - x2) ** 2 + (y1 - y2) ** 2) /
        ((1 - x1 * x1 - y1 * y1) * (1 - x2 * x2 - y2 * y2));
    return Math.acosh(1 + Math.max(q, 0));
}

// ---------------------------------------------------------------------------
// Group definitions
// ---------------------------------------------------------------------------
const GROUPS = {
    triangle237: (() => {
        // Fundamental triangle: angle π/2 at the origin, π/3 at P3 on the
        // x-axis, π/7 at P7 on the y-axis; legs from the right angle via the
        // hyperbolic law of cosines.
        const d3 = Math.acosh(Math.cos(Math.PI / 7) / Math.sin(Math.PI / 3));
        const d7 = Math.acosh(Math.cos(Math.PI / 3) / Math.sin(Math.PI / 7));
        const r3 = Math.tanh(d3 / 2), r7 = Math.tanh(d7 / 2);
        const x = rotationAbout(0, 0, Math.PI);
        let y = rotationAbout(r3, 0, 2 * Math.PI / 3);
        // orientation: x·y must be the order-7 rotation, |tr| = 2cos(π/7)
        if (Math.abs(Math.abs(2 * mul(x, y)[0]) - 2 * Math.cos(Math.PI / 7)) > 1e-9)
            y = rotationAbout(r3, 0, -2 * Math.PI / 3);
        console.assert(sameElement(mul(x, x), ID), '(2,3,7): x² ≠ 1');
        console.assert(sameElement(mul(y, mul(y, y)), ID), '(2,3,7): y³ ≠ 1');
        const xy = mul(x, y);
        let acc = xy.slice();
        for (let i = 1; i < 7; i++) acc = mul(acc, xy);
        console.assert(sameElement(acc, ID), '(2,3,7): (xy)⁷ ≠ 1');
        return {
            key: 'triangle237', label: 'Δ(2,3,7)',
            subtitle: 'Δ⁺(2,3,7) = ⟨x, y | x², y³, (xy)⁷⟩ — rotations of the (2,3,7) triangle tiling of ℍ²; 3-regular Cayley graph, S = {x, y, y⁻¹}.',
            gens: [x, y, inv(y)], deg: 3,
            base: [r3 / 3, r7 / 3],      // ≈ incenter of the triangle: trivial stabilizer
            radius: { min: 8, max: 24, def: 18 },
            sizeBase: 0.93
        };
    })(),
    genus2: (() => {
        // Side-pairing translations of the regular {8,8} octagon (Bolza).
        // Translation length ℓ with cosh(ℓ/2) = 1 + √2 = cot(π/8).
        const C0 = 1 + Math.SQRT2;
        const S0 = Math.sqrt(C0 * C0 - 1);
        const gens = [];
        for (let j = 0; j < 8; j++) {
            const th = j * Math.PI / 4;
            gens.push([C0, 0, S0 * Math.cos(th), S0 * Math.sin(th)]);   // G_j⁻¹ = G_{j+4}
        }
        return {
            key: 'genus2', label: 'Γ₂ (genus 2)',
            subtitle: 'Γ₂ = ⟨a, b, c, d | [a,b][c,d]⟩ — genus-2 surface group, the {8,8} tiling of ℍ²; 8-regular Cayley graph.',
            gens, deg: 8,
            base: [0, 0],
            radius: { min: 2, max: 4, def: 3 },
            sizeBase: 0.62
        };
    })()
};
let G = GROUPS.triangle237;

function sameElement(g, h) {
    const b = mul(inv(g), h);
    const dp = Math.max(Math.abs(b[0] - 1), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]));
    if (dp < 0.05) return true;
    const dm = Math.max(Math.abs(b[0] + 1), Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]));
    return dm < 0.05;               // ±I both mean equality in PSU(1,1)
}

// ---------------------------------------------------------------------------
// BFS ball in the Cayley graph, with matrix dedupe (position hash → exact test)
// ---------------------------------------------------------------------------
function buildBall(maxDepth) {
    const [bx, by] = G.base;
    const mats = [ID.slice()];
    const pos = [[bx, by]];
    const depth = [0];
    const buckets = new Map();      // coarse position hash → candidate indices
    const RES = 50000;

    const bucketKey = (ix, iy) => ix * 4000037 + iy;
    function addToBucket(i) {
        const k = bucketKey(Math.round(pos[i][0] * RES), Math.round(pos[i][1] * RES));
        let arr = buckets.get(k);
        if (!arr) buckets.set(k, arr = []);
        arr.push(i);
    }
    function lookup(m, p) {
        const ix = Math.round(p[0] * RES), iy = Math.round(p[1] * RES);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const arr = buckets.get(bucketKey(ix + dx, iy + dy));
            if (!arr) continue;
            for (const i of arr) if (sameElement(mats[i], m)) return i;
        }
        return -1;
    }

    addToBucket(0);
    const edgeSet = new Set();
    const edges = [];

    for (let i = 0; i < mats.length; i++) {
        if (depth[i] >= maxDepth) continue;
        for (let j = 0; j < G.gens.length; j++) {
            const h = mul(mats[i], G.gens[j]);
            const p = applyMobius(h, bx, by);
            let idx = lookup(h, p);
            if (idx < 0) {
                idx = mats.length;
                mats.push(h); pos.push(p); depth.push(depth[i] + 1);
                addToBucket(idx);
            }
            const a = Math.min(i, idx), b = Math.max(i, idx);
            const key = a * 262144 + b;
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([a, b]); }
        }
    }

    const n = mats.length;
    const deg = new Int32Array(n);
    for (const [a, b] of edges) { deg[a]++; deg[b]++; }
    const adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + deg[i];
    const fill = adjStart.slice(0, n);
    const adjList = new Int32Array(2 * edges.length);
    for (const [a, b] of edges) { adjList[fill[a]++] = b; adjList[fill[b]++] = a; }

    // sanity: for genus2 the ball sizes should be 1, 9, 65, 457, 3193
    const counts = new Array(maxDepth + 1).fill(0);
    for (const d of depth) counts[d]++;
    console.log(`[cayley] ${G.key} ball(${maxDepth}): n=${n}, E=${edges.length}, spheres=[${counts}]`);

    return { n, pos, depth, edges, deg, adjStart, adjList };
}

// ---------------------------------------------------------------------------
// Symmetric tridiagonal eigensolver (tql2, ported from JAMA / EISPACK).
// d: diagonal (out: eigenvalues ascending); e: e[i] = subdiag(i-1,i), e[0] unused;
// Z: flat row-major m×m starting as identity; column k becomes eigenvector k.
// ---------------------------------------------------------------------------
function tql2(d, e, Z, m) {
    for (let i = 1; i < m; i++) e[i - 1] = e[i];
    e[m - 1] = 0;
    let f = 0, tst1 = 0;
    const eps = Math.pow(2, -52);
    for (let l = 0; l < m; l++) {
        tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
        let mm = l;
        while (mm < m) { if (Math.abs(e[mm]) <= eps * tst1) break; mm++; }
        if (mm > l) {
            do {
                let g = d[l];
                let p = (d[l + 1] - g) / (2 * e[l]);
                let r = Math.hypot(p, 1);
                if (p < 0) r = -r;
                d[l] = e[l] / (p + r);
                d[l + 1] = e[l] * (p + r);
                const dl1 = d[l + 1];
                let h = g - d[l];
                for (let i = l + 2; i < m; i++) d[i] -= h;
                f += h;
                p = d[mm];
                let c = 1, c2 = c, c3 = c;
                const el1 = e[l + 1];
                let s = 0, s2 = 0;
                for (let i = mm - 1; i >= l; i--) {
                    c3 = c2; c2 = c; s2 = s;
                    g = c * e[i];
                    h = c * p;
                    r = Math.hypot(p, e[i]);
                    e[i + 1] = s * r;
                    s = e[i] / r;
                    c = p / r;
                    p = c * d[i] - s * g;
                    d[i + 1] = h + s * (c * g + s * d[i]);
                    for (let k = 0; k < m; k++) {
                        h = Z[k * m + i + 1];
                        Z[k * m + i + 1] = s * Z[k * m + i] + c * h;
                        Z[k * m + i] = c * Z[k * m + i] - s * h;
                    }
                }
                p = -s * s2 * c3 * el1 * e[l] / dl1;
                e[l] = s * p;
                d[l] = c * p;
            } while (Math.abs(e[l]) > eps * tst1);
        }
        d[l] += f;
        e[l] = 0;
    }
    for (let i = 0; i < m - 1; i++) {          // sort ascending, permute columns
        let k = i, p = d[i];
        for (let j = i + 1; j < m; j++) if (d[j] < p) { k = j; p = d[j]; }
        if (k !== i) {
            d[k] = d[i]; d[i] = p;
            for (let r = 0; r < m; r++) {
                p = Z[r * m + i]; Z[r * m + i] = Z[r * m + k]; Z[r * m + k] = p;
            }
        }
    }
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const dot = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return s; };
const axpy = (y, a, x) => { for (let i = 0; i < y.length; i++) y[i] += a * x[i]; };
// setTimeout is clamped hard in hidden tabs; MessageChannel is not
const tick = () => new Promise(r => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => r();
    ch.port2.postMessage(null);
});

// Lanczos with full reorthogonalization: lowest K eigenpairs of symmetric matvec
async function lanczosLowest(n, matvec, K, m, onProgress) {
    m = Math.min(n, m);
    const rand = mulberry32(1234567);
    const V = new Array(m);
    let v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = rand() - 0.5;
    let nrm = Math.sqrt(dot(v, v));
    for (let i = 0; i < n; i++) v[i] /= nrm;
    V[0] = v;

    const alpha = new Float64Array(m);
    const beta = new Float64Array(m);
    const w = new Float64Array(n);

    for (let j = 0; j < m; j++) {
        matvec(V[j], w);
        if (j > 0) axpy(w, -beta[j - 1], V[j - 1]);
        alpha[j] = dot(w, V[j]);
        axpy(w, -alpha[j], V[j]);
        // full reorthogonalization (one pass, second if heavy cancellation)
        for (let pass = 0; pass < 2; pass++) {
            const before = Math.sqrt(dot(w, w));
            for (let i = 0; i <= j; i++) axpy(w, -dot(w, V[i]), V[i]);
            const after = Math.sqrt(dot(w, w));
            if (after > 0.7 * before) break;
        }
        if (j < m - 1) {
            let b = Math.sqrt(dot(w, w));
            const nv = new Float64Array(n);
            if (b < 1e-10) {                      // invariant subspace: random restart
                for (let i = 0; i < n; i++) nv[i] = rand() - 0.5;
                for (let i = 0; i <= j; i++) axpy(nv, -dot(nv, V[i]), V[i]);
                const bn = Math.sqrt(dot(nv, nv));
                for (let i = 0; i < n; i++) nv[i] /= bn;
                beta[j] = 0;
            } else {
                for (let i = 0; i < n; i++) nv[i] = w[i] / b;
                beta[j] = b;
            }
            V[j + 1] = nv;
        }
        if ((j & 31) === 0) { onProgress && onProgress(j, m); await tick(); }
    }

    const d = Float64Array.from(alpha);
    const e = new Float64Array(m);
    for (let i = 1; i < m; i++) e[i] = beta[i - 1];
    const Z = new Float64Array(m * m);
    for (let i = 0; i < m; i++) Z[i * m + i] = 1;
    onProgress && onProgress(m, m);
    await tick();
    tql2(d, e, Z, m);

    const nev = Math.min(K, m);
    const vals = new Float64Array(nev);
    const vecs = [];
    for (let k = 0; k < nev; k++) {
        vals[k] = d[k];
        const x = new Float64Array(n);
        for (let j = 0; j < m; j++) {
            const zjk = Z[j * m + k];
            if (zjk !== 0) axpy(x, zjk, V[j]);
        }
        const xn = Math.sqrt(dot(x, x));
        for (let i = 0; i < n; i++) x[i] /= xn;
        vecs.push(x);
    }
    return { vals, vecs };
}

// ---------------------------------------------------------------------------
// Parameters & state
// ---------------------------------------------------------------------------
const S = 10;                        // world radius of the Poincaré disk
const params = {
    group: 'triangle237',
    radius: 12,
    k: 1,
    amp: 0.55,                       // 0..1 → world height uAmp
    speed: 8,
    anim: 'mode',                    // 'mode' | 'heat' | 'wave'
    bc: 'dirichlet',                 // 'dirichlet' | 'neumann'
    proj: 'exp',                     // 'exp' | 'poincare'
    playing: true,
    spin: true
};

let graph = null;                    // {n, pos, depth, edges, deg, adjStart, adjList}
let eig = null;                      // {vals, vecs}
let srcVertex = 0;                   // impulse location for heat/wave
let coeffs = null;                   // expansion coefficients of the impulse
let waveNorm = 1;
let tauMax = 20;
let time = 0, tau = 0;
let busy = false;

const isEmbedded = document.documentElement.classList.contains('embedded');

// ---------------------------------------------------------------------------
// three.js scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x020617, isEmbedded ? 0 : 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, S * 1.5, S * 1.75);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.8, 0);
controls.autoRotate = params.spin;
controls.autoRotateSpeed = 0.5;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 4;
controls.maxDistance = 80;

// ground disc + rim
const ground = new THREE.Mesh(
    new THREE.CircleGeometry(S, 96),
    new THREE.MeshBasicMaterial({
        color: 0x0b1120, transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, depthWrite: false
    })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
ground.renderOrder = 0;
scene.add(ground);

const rimPts = [];
for (let i = 0; i <= 128; i++) {
    const a = i / 128 * Math.PI * 2;
    rimPts.push(new THREE.Vector3(Math.cos(a) * S, 0, Math.sin(a) * S));
}
const rim = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(rimPts),
    new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.35 })
);
scene.add(rim);

// shared uniforms for eigenfunction display
const uniforms = {
    uAmp: { value: params.amp * 3.2 },
    uWave: { value: 1.0 },
    uCPos: { value: new THREE.Color(0xff3366) },
    uCNeg: { value: new THREE.Color(0x00ccff) },
    uPtScale: { value: 1.35 * Math.min(window.devicePixelRatio, 2) }
};

const pointsVert = /* glsl */`
    attribute float aPhi;
    attribute float aSize;
    uniform float uAmp, uWave, uPtScale;
    varying float vT;
    void main() {
        vec3 p = position;
        p.y += aPhi * uWave * uAmp;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPtScale * aSize * (300.0 / -mv.z);
        vT = clamp(aPhi * uWave, -1.0, 1.0);
    }
`;
const pointsFrag = /* glsl */`
    precision highp float;
    uniform vec3 uCPos, uCNeg;
    varying float vT;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.36, d);
        if (alpha < 0.01) discard;
        vec3 base = vec3(0.92);
        vec3 col = vT >= 0.0 ? mix(base, uCPos, vT) : mix(base, uCNeg, -vT);
        float glow = 0.5 + 0.5 * abs(vT);
        gl_FragColor = vec4(col * glow, alpha * 0.95);
    }
`;
const linesVert = /* glsl */`
    attribute float aPhi;
    uniform float uAmp, uWave;
    varying float vT;
    void main() {
        vec3 p = position;
        p.y += aPhi * uWave * uAmp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vT = clamp(aPhi * uWave, -1.0, 1.0);
    }
`;
const linesFrag = /* glsl */`
    precision highp float;
    uniform vec3 uCPos, uCNeg;
    varying float vT;
    void main() {
        vec3 base = vec3(0.45, 0.5, 0.75);
        vec3 col = vT >= 0.0 ? mix(base, uCPos, vT) : mix(base, uCNeg, -vT);
        gl_FragColor = vec4(col * (0.35 + 0.65 * abs(vT)), 1.0);
    }
`;

const pointsMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: pointsVert, fragmentShader: pointsFrag,
    transparent: true, depthWrite: false
});
const linesMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: linesVert, fragmentShader: linesFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
});
const shadowMat = new THREE.LineBasicMaterial({ color: 0x323c66, transparent: true, opacity: 0.30 });

// dynamic objects & buffers
let pointsObj = null, linesObj = null, shadowObj = null;
let pointsGeo = null, linesGeo = null;
let lineTrue = null;                 // Float64Array(2 * nLineVerts) true disk coords
let lineU = null, lineV = null, lineT = null;   // per line-vertex endpoint refs
let nLineVerts = 0;

function disposeGraphObjects() {
    for (const o of [pointsObj, linesObj, shadowObj]) {
        if (o) { scene.remove(o); }
    }
    if (pointsGeo) pointsGeo.dispose();
    if (linesGeo) linesGeo.dispose();
    pointsObj = linesObj = shadowObj = null;
    pointsGeo = linesGeo = null;
}

// geodesic from z1 to z2 in the disk: Möbius-straighten, sample uniformly in
// hyperbolic arclength, map back
function sampleGeodesic(x1, y1, x2, y2, nSeg, out, o) {
    // w = (z2 - z1) / (1 - conj(z1) z2)
    const nr = x2 - x1, ni = y2 - y1;
    const dr = 1 - (x1 * x2 + y1 * y2), di = x1 * y2 - y1 * x2;
    const dd = dr * dr + di * di;
    const wr = (nr * dr + ni * di) / dd, wi = (ni * dr - nr * di) / dd;
    const wAbs = Math.min(Math.hypot(wr, wi), 1 - 1e-15);
    const D = 2 * Math.atanh(wAbs);                    // hyperbolic edge length
    for (let s = 0; s <= nSeg; s++) {
        const t = wAbs < 1e-12 ? s / nSeg : Math.tanh((s / nSeg) * D / 2) / wAbs;
        const ur = t * wr, ui = t * wi;
        // back: (u + z1) / (1 + conj(z1) u)
        const pr = ur + x1, pi = ui + y1;
        const qr = 1 + (x1 * ur + y1 * ui), qi = x1 * ui - y1 * ur;
        const qq = qr * qr + qi * qi;
        out[o + 2 * s] = (pr * qr + pi * qi) / qq;
        out[o + 2 * s + 1] = (pi * qr - pr * qi) / qq;
    }
}

function buildGeometry(g) {
    disposeGraphObjects();
    const n = g.n;

    // --- points ---
    pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
    pointsGeo.setAttribute('aPhi', new THREE.BufferAttribute(new Float32Array(n), 1));
    pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    pointsObj = new THREE.Points(pointsGeo, pointsMat);
    pointsObj.frustumCulled = false;
    pointsObj.renderOrder = 4;
    scene.add(pointsObj);

    // --- edges: sampled geodesic arcs as line segments ---
    const segsOf = e => {
        const hd = hypDist(g.pos[e[0]][0], g.pos[e[0]][1], g.pos[e[1]][0], g.pos[e[1]][1]);
        return Math.max(2, Math.min(12, Math.round(hd * 2.5) + 2));
    };
    let total = 0;
    for (const e of g.edges) total += segsOf(e) * 2;
    nLineVerts = total;

    lineTrue = new Float64Array(2 * total);
    lineU = new Int32Array(total);
    lineV = new Int32Array(total);
    lineT = new Float32Array(total);
    const scratch = new Float64Array(2 * 16);

    let o = 0;
    for (const e of g.edges) {
        const [a, b] = e;
        const nSeg = segsOf(e);
        sampleGeodesic(g.pos[a][0], g.pos[a][1], g.pos[b][0], g.pos[b][1], nSeg, scratch, 0);
        for (let s = 0; s < nSeg; s++) {
            for (const q of [s, s + 1]) {
                lineTrue[2 * o] = scratch[2 * q];
                lineTrue[2 * o + 1] = scratch[2 * q + 1];
                lineU[o] = a; lineV[o] = b;
                lineT[o] = q / nSeg;
                o++;
            }
        }
    }

    linesGeo = new THREE.BufferGeometry();
    linesGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * total), 3));
    linesGeo.setAttribute('aPhi', new THREE.BufferAttribute(new Float32Array(total), 1));
    linesObj = new THREE.LineSegments(linesGeo, linesMat);
    linesObj.frustumCulled = false;
    linesObj.renderOrder = 3;
    scene.add(linesObj);

    shadowObj = new THREE.LineSegments(linesGeo, shadowMat);   // flat copy at y = 0
    shadowObj.frustumCulled = false;
    shadowObj.position.y = -0.015;
    shadowObj.renderOrder = 2;
    scene.add(shadowObj);

    applyProjection();
}

// radial projections of the disk: true Poincaré, or azimuthal-equidistant
// ("exponential coordinates" — BFS shells land on evenly spaced circles)
function projectXY(x, y, dMax) {
    if (params.proj === 'poincare') return [x * S, y * S];
    const r = Math.hypot(x, y);
    if (r < 1e-14) return [0, 0];
    const rc = Math.min(r, 1 - 1e-15);
    const d = Math.log((1 + rc) / (1 - rc));       // 2 artanh r
    const f = (S * d / dMax) / r;
    return [x * f, y * f];
}

function applyProjection() {
    if (!graph) return;
    const g = graph;
    // radial extent: farthest vertex from the disk center (distance to a point
    // on a geodesic is convex, so edge samples never exceed the endpoints)
    let dTop = 0;
    for (let i = 0; i < g.n; i++) {
        const r = Math.min(Math.hypot(g.pos[i][0], g.pos[i][1]), 1 - 1e-15);
        dTop = Math.max(dTop, Math.log((1 + r) / (1 - r)));
    }
    const dMax = dTop * 1.08 + 0.2;

    const pp = pointsGeo.attributes.position.array;
    const ps = pointsGeo.attributes.aSize.array;
    for (let i = 0; i < g.n; i++) {
        const [wx, wy] = projectXY(g.pos[i][0], g.pos[i][1], dMax);
        pp[3 * i] = wx; pp[3 * i + 1] = 0; pp[3 * i + 2] = wy;
        if (params.proj === 'poincare') {
            const r2 = g.pos[i][0] ** 2 + g.pos[i][1] ** 2;
            ps[i] = Math.max(Math.sqrt(Math.max(1 - r2, 0)), 0.006);
        } else {
            ps[i] = Math.max(Math.pow(G.sizeBase, g.depth[i]), 0.06);
        }
    }
    pointsGeo.attributes.position.needsUpdate = true;
    pointsGeo.attributes.aSize.needsUpdate = true;

    const lp = linesGeo.attributes.position.array;
    for (let i = 0; i < nLineVerts; i++) {
        const [wx, wy] = projectXY(lineTrue[2 * i], lineTrue[2 * i + 1], dMax);
        lp[3 * i] = wx; lp[3 * i + 1] = 0; lp[3 * i + 2] = wy;
    }
    linesGeo.attributes.position.needsUpdate = true;
    pointsGeo.computeBoundingSphere();
    linesGeo.computeBoundingSphere();
}

// write a (max-normalized) field into the phi attributes
function fillField(u) {
    const pf = pointsGeo.attributes.aPhi.array;
    for (let i = 0; i < graph.n; i++) pf[i] = u[i];
    pointsGeo.attributes.aPhi.needsUpdate = true;
    const lf = linesGeo.attributes.aPhi.array;
    for (let i = 0; i < nLineVerts; i++) {
        const t = lineT[i];
        lf[i] = u[lineU[i]] * (1 - t) + u[lineV[i]] * t;
    }
    linesGeo.attributes.aPhi.needsUpdate = true;
}

const scratchField = { arr: null };
function getScratch() {
    if (!scratchField.arr || scratchField.arr.length !== graph.n)
        scratchField.arr = new Float64Array(graph.n);
    return scratchField.arr;
}

// ---------------------------------------------------------------------------
// Eigen-analysis of the ball
// ---------------------------------------------------------------------------
async function recomputeEigen() {
    const g = graph;
    const dirichlet = params.bc === 'dirichlet';
    const matvec = (x, y) => {
        for (let i = 0; i < g.n; i++) {
            let s = 0;
            for (let p = g.adjStart[i]; p < g.adjStart[i + 1]; p++) s += x[g.adjList[p]];
            y[i] = (dirichlet ? G.deg : g.deg[i]) * x[i] - s;
        }
    };
    const K = Math.min(g.n, 96);
    const m = Math.min(g.n, Math.max(4 * K, 240));
    eig = await lanczosLowest(g.n, matvec, K, m,
        (j, mm) => setStatus(`Diagonalizing Laplacian… ${j}/${mm}`));
    console.log(`[cayley] lowest eigenvalues:`, Array.from(eig.vals.slice(0, 8)).map(v => v.toFixed(4)).join(', '));

    const slider = document.getElementById('range-mode');
    slider.max = String(eig.vals.length - 1);
    params.k = Math.min(params.k, eig.vals.length - 1);
    srcVertex = Math.min(srcVertex, g.n - 1);
    prepareImpulse();
    drawSpectrum();
}

function prepareImpulse() {
    if (!eig) return;
    const K = eig.vals.length;
    coeffs = new Float64Array(K);
    for (let k = 0; k < K; k++) coeffs[k] = eig.vecs[k][srcVertex];
    // normalization for wave mode: max of the band-limited delta at τ = 0
    const u = getScratch();
    u.fill(0);
    for (let k = 0; k < K; k++) axpy(u, coeffs[k], eig.vecs[k]);
    waveNorm = 0;
    for (let i = 0; i < u.length; i++) waveNorm = Math.max(waveNorm, Math.abs(u[i]));
    if (waveNorm < 1e-12) waveNorm = 1;
    // heat: run until only the slowest few modes survive
    const gap = Math.max(eig.vals[Math.min(6, K - 1)] - eig.vals[0], 0.08);
    tauMax = Math.min(40, 7 / gap);
    tau = 0;
}

// nodal domains of the current eigenfunction (union-find over same-sign edges)
function nodalDomains(phi) {
    const g = graph;
    let mx = 0;
    for (let i = 0; i < g.n; i++) mx = Math.max(mx, Math.abs(phi[i]));
    const tol = 1e-7 * mx;
    const parent = new Int32Array(g.n);
    for (let i = 0; i < g.n; i++) parent[i] = i;
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (const [a, b] of g.edges) {
        const sa = phi[a] > tol ? 1 : phi[a] < -tol ? -1 : 0;
        const sb = phi[b] > tol ? 1 : phi[b] < -tol ? -1 : 0;
        if (sa !== 0 && sa === sb) {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent[ra] = rb;
        }
    }
    const roots = new Set();
    for (let i = 0; i < g.n; i++) {
        if (Math.abs(phi[i]) > tol) roots.add(find(i));
    }
    return roots.size;
}

function multiplicityOf(k) {
    const lam = eig.vals[k];
    const tol = 1e-5 * (1 + Math.abs(lam));
    let c = 0;
    for (const v of eig.vals) if (Math.abs(v - lam) < tol) c++;
    return c;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const statusEl = document.getElementById('status');
function setStatus(msg) {
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('show', !!msg);
}

function updateReadout() {
    const el = document.getElementById('readout');
    if (!eig || !graph) { el.innerHTML = '&nbsp;'; return; }
    if (params.anim === 'mode') {
        const lam = eig.vals[params.k];
        const mult = multiplicityOf(params.k);
        const nod = nodalDomains(eig.vecs[params.k]);
        el.innerHTML =
            `&lambda;<sub>${params.k}</sub> = ${lam.toFixed(4)}` +
            (mult > 1 ? ` &nbsp;(mult &times;${mult})` : '') +
            ` &nbsp;&middot;&nbsp; ${nod} nodal domain${nod === 1 ? '' : 's'}<br>` +
            `|B| = ${graph.n} vertices &nbsp;&middot;&nbsp; ${graph.edges.length} edges`;
    } else {
        const what = params.anim === 'heat'
            ? `heat flow &part;<sub>t</sub>u = &minus;&Delta;u`
            : `wave eq. &part;<sub>t</sub><sup>2</sup>u = &minus;&Delta;u`;
        el.innerHTML =
            `${what}<br>&delta;-impulse at vertex ${srcVertex}, ` +
            `expanded in ${eig.vals.length} lowest modes`;
    }
}

function setModeK(k) {
    params.k = Math.max(0, Math.min(k, eig ? eig.vals.length - 1 : 0));
    const slider = document.getElementById('range-mode');
    slider.value = String(params.k);
    document.getElementById('display-mode').textContent =
        eig ? `k=${params.k} · λ=${eig.vals[params.k].toFixed(3)}` : String(params.k);
    document.getElementById('fill-mode').style.width =
        `${(params.k / Math.max(1, (eig ? eig.vals.length - 1 : 1))) * 100}%`;
    if (eig && params.anim === 'mode') {
        const phi = eig.vecs[params.k];
        let mx = 0;
        for (let i = 0; i < phi.length; i++) mx = Math.max(mx, Math.abs(phi[i]));
        const u = getScratch();
        for (let i = 0; i < phi.length; i++) u[i] = phi[i] / mx;
        fillField(u);
    }
    drawSpectrum();
    updateReadout();
}

// spectrum strip
const spectrumCanvas = document.getElementById('spectrum');
function drawSpectrum() {
    if (!eig) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = spectrumCanvas.clientWidth, h = spectrumCanvas.clientHeight;
    spectrumCanvas.width = w * dpr; spectrumCanvas.height = h * dpr;
    const ctx = spectrumCanvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const lmin = eig.vals[0], lmax = eig.vals[eig.vals.length - 1];
    const span = Math.max(lmax - lmin, 1e-9);
    const X = lam => 8 + (lam - lmin) / span * (w - 16);
    ctx.globalAlpha = 0.55;
    for (let k = 0; k < eig.vals.length; k++) {
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const x = X(eig.vals[k]);
        ctx.moveTo(x, h * 0.28);
        ctx.lineTo(x, h * 0.72);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const xk = X(eig.vals[params.k]);
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(xk, h * 0.12);
    ctx.lineTo(xk, h * 0.88);
    ctx.stroke();
    ctx.fillStyle = 'rgba(248,250,252,0.5)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(lmin.toFixed(2), 6, h - 4);
    const txt = lmax.toFixed(2);
    ctx.fillText(txt, w - 6 - ctx.measureText(txt).width, h - 4);
}
spectrumCanvas.addEventListener('pointerdown', ev => {
    if (!eig) return;
    const rect = spectrumCanvas.getBoundingClientRect();
    const w = rect.width;
    const lmin = eig.vals[0], lmax = eig.vals[eig.vals.length - 1];
    const span = Math.max(lmax - lmin, 1e-9);
    const lam = lmin + (ev.clientX - rect.left - 8) / (w - 16) * span;
    let best = 0, bd = Infinity;
    for (let k = 0; k < eig.vals.length; k++) {
        const d = Math.abs(eig.vals[k] - lam);
        if (d < bd) { bd = d; best = k; }
    }
    setAnim('mode');
    setModeK(best);
});

// sliders
function wireSlider(id, fillId, dispId, fmt, apply) {
    const el = document.getElementById(id);
    const handler = () => {
        const v = parseFloat(el.value);
        const frac = (v - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min) || 1);
        document.getElementById(fillId).style.width = `${frac * 100}%`;
        document.getElementById(dispId).textContent = fmt(v);
        apply(v);
    };
    el.addEventListener('input', handler);
    return handler;
}

wireSlider('range-radius', 'fill-radius', 'display-radius',
    v => String(v),
    v => { if (v !== params.radius && !busy) { params.radius = v; rebuild(); } });

document.getElementById('range-mode').addEventListener('input', ev => {
    setAnim('mode');
    setModeK(parseInt(ev.target.value));
});

wireSlider('range-amp', 'fill-amp', 'display-amp',
    v => `${v}%`,
    v => { params.amp = v / 100; uniforms.uAmp.value = params.amp * 3.2; });

wireSlider('range-speed', 'fill-speed', 'display-speed',
    v => String(v),
    v => { params.speed = v; });

// segmented controls
function wireSeg(id, apply) {
    const group = document.getElementById(id);
    group.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            apply(btn.dataset.val);
        });
    });
}
function setSegActive(id, val) {
    const group = document.getElementById(id);
    group.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b.dataset.val === val));
}

function setAnim(val) {
    if (params.anim === val) return;
    params.anim = val;
    setSegActive('seg-anim', val);
    uniforms.uWave.value = 1.0;
    if (val === 'mode') {
        setModeK(params.k);
    } else {
        tau = 0;
        prepareImpulse();
    }
    updateReadout();
}

wireSeg('seg-anim', setAnim);
wireSeg('seg-bc', async val => {
    if (busy || val === params.bc) return;
    params.bc = val;
    busy = true;
    await recomputeEigen();
    busy = false;
    setStatus('');
    setModeK(params.k);
    updateReadout();
});
wireSeg('seg-proj', val => {
    params.proj = val;
    applyProjection();
});

function applyGroupDefaults() {
    G = GROUPS[params.group];
    params.radius = G.radius.def;
    const el = document.getElementById('range-radius');
    el.min = String(G.radius.min);
    el.max = String(G.radius.max);
    el.value = String(params.radius);
    document.getElementById('display-radius').textContent = String(params.radius);
    document.getElementById('fill-radius').style.width =
        `${(params.radius - G.radius.min) / (G.radius.max - G.radius.min) * 100}%`;
    document.getElementById('ui-subtitle').textContent = G.subtitle;
    setSegActive('seg-group', params.group);
}

wireSeg('seg-group', val => {
    if (busy || val === params.group) { setSegActive('seg-group', params.group); return; }
    params.group = val;
    applyGroupDefaults();
    rebuild();
});

document.getElementById('play-pause').addEventListener('click', () => {
    params.playing = !params.playing;
    document.getElementById('play-pause').textContent = params.playing ? 'Pause' : 'Play';
});
document.getElementById('spin-btn').addEventListener('click', () => {
    params.spin = !params.spin;
    controls.autoRotate = params.spin;
    document.getElementById('spin-btn').style.opacity = params.spin ? 1 : 0.5;
});

// click-to-excite in heat/wave modes (with drag detection)
let downXY = null;
renderer.domElement.addEventListener('pointerdown', ev => {
    downXY = [ev.clientX, ev.clientY];
    if (params.spin) {
        params.spin = false;
        controls.autoRotate = false;
        document.getElementById('spin-btn').style.opacity = 0.5;
    }
});
renderer.domElement.addEventListener('pointerup', ev => {
    if (!downXY || !graph || !eig) return;
    const moved = Math.hypot(ev.clientX - downXY[0], ev.clientY - downXY[1]);
    downXY = null;
    if (moved > 5 || params.anim === 'mode') return;
    const ndc = new THREE.Vector2(
        (ev.clientX / window.innerWidth) * 2 - 1,
        -(ev.clientY / window.innerHeight) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.params.Points.threshold = 0.35;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(pointsObj);
    if (hits.length) {
        srcVertex = hits[0].index;
        prepareImpulse();
        updateReadout();
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// deck integration: simple string messages, like the other Boise tools
window.addEventListener('message', ev => {
    const msg = ev.data;
    if (msg === 'play') { params.playing = true; }
    else if (msg === 'pause') { params.playing = false; }
    else if (msg === 'toggle') { params.playing = !params.playing; }
    else if (msg === 'next') { setAnim('mode'); setModeK(params.k + 1); }
    else if (msg === 'prev') { setAnim('mode'); setModeK(params.k - 1); }
    else if (msg === 'heat') { setAnim('heat'); }
    else if (msg === 'wave') { setAnim('wave'); }
    else if (msg === 'standing') { setAnim('mode'); }
    document.getElementById('play-pause').textContent = params.playing ? 'Pause' : 'Play';
});

// ---------------------------------------------------------------------------
// Rebuild pipeline
// ---------------------------------------------------------------------------
async function rebuild() {
    busy = true;
    setStatus('Enumerating group elements…');
    await tick();
    graph = buildBall(params.radius);
    srcVertex = 0;
    setStatus('Building geometry…');
    await tick();
    buildGeometry(graph);
    await recomputeEigen();
    busy = false;
    setStatus('');
    setModeK(params.k);
    updateReadout();
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    stepFrame(Math.min(clock.getDelta(), 0.1));
}

function stepFrame(dt) {
    controls.update();

    if (eig && graph && params.playing && !busy) {
        const sp = params.speed / 8;
        if (params.anim === 'mode') {
            time += dt * sp;
            const om = Math.sqrt(Math.max(eig.vals[params.k], 0)) * 2.2 + 0.4;
            uniforms.uWave.value = Math.cos(om * time);
        } else if (params.anim === 'heat') {
            tau += dt * sp * (tauMax / 9);
            if (tau > tauMax) tau = 0;
            const u = getScratch();
            u.fill(0);
            for (let k = 0; k < eig.vals.length; k++) {
                const c = coeffs[k] * Math.exp(-eig.vals[k] * tau);
                if (Math.abs(c) > 1e-14) axpy(u, c, eig.vecs[k]);
            }
            let mx = 0;
            for (let i = 0; i < u.length; i++) mx = Math.max(mx, Math.abs(u[i]));
            if (mx > 1e-13) for (let i = 0; i < u.length; i++) u[i] /= mx;
            fillField(u);
        } else {                                     // wave packet
            tau += dt * sp * 1.6;
            const u = getScratch();
            u.fill(0);
            for (let k = 0; k < eig.vals.length; k++) {
                const c = coeffs[k] * Math.cos(Math.sqrt(Math.max(eig.vals[k], 0)) * tau);
                axpy(u, c, eig.vecs[k]);
            }
            for (let i = 0; i < u.length; i++) u[i] /= waveNorm;
            fillField(u);
        }
    }
    renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
document.getElementById('range-mode').value = String(params.k);
if (isEmbedded) { params.spin = true; controls.autoRotate = true; }
applyGroupDefaults();
rebuild();
animate();

// debug/verification hook (also lets the deck script drive frames if needed)
window.__cl = {
    stepFrame, params, setAnim, setModeK, applyProjection, setSegActive,
    get graph() { return graph; }, get eig() { return eig; },
    get uniforms() { return uniforms; }, get busy() { return busy; }
};
