/**
 * scene.js — the Cayley graph of the Long–Reid group Γ₉ drawn in the
 * hyperbolic plane, then lifted into a cost landscape.
 *
 * Γ₉ ≤ SL₂(Z[1/6]) acts on H², so its Cayley graph draws honestly in the
 * Poincaré disk: a node is the orbit point g·i, an edge is the hyperbolic
 * geodesic to g·s·i for a generator s.
 *
 * The cost of an element is the number of primes (with multiplicity) in the
 * denominator once it is fully cancelled. Exact Z[1/6] arithmetic keeps every
 * element as N / (2^e2 · 3^e3) in lowest terms, so that number is just
 * e2 + e3 — read straight off the normalized matrix, no floating point
 * anywhere near it. Lifting each node to that height turns the flat graph
 * into the landscape the search has to navigate.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const LR = window.LRMath;
const LABELS = ['a', 'A', 'b', 'B'];
const MAX_NODES = 4400;
// Edge sampling. A geodesic of the disk is an arc of a circle orthogonal to
// the ideal boundary, so a fixed segment count leaves the strongly curved
// ones visibly polygonal. Segments are spent per edge instead: the deviation
// of a polyline from an arc falls like sagitta / n², so n ~ √(sagitta / tol).
const ARC_TOL = 0.0009;
const MIN_SEG = 6;
const MAX_SEG = 96;
const TOP_HEIGHT = 1.45;     // world height of the tallest element
const LIFT_SECONDS = 2.6;

// ---------------------------------------------------------------- group ---

/**
 * Projective key: g and −g are the same isometry of H², so they must be the
 * same node. Normalize the sign of the first non-zero entry.
 */
function projKey(m) {
    let neg = false;
    for (const x of m.n) {
        if (x !== 0n) { neg = x < 0n; break; }
    }
    const n = neg ? m.n.map(x => -x) : m.n;
    return `${m.e2}.${m.e3}:${n.join(',')}`;
}

function buildGraph() {
    const root = LR.Mat2.identity();
    const nodes = [{ m: root, h: root.height }];
    const byKey = new Map([[projKey(root), 0]]);
    const edges = [];
    const seenEdge = new Set();

    let head = 0;
    while (head < nodes.length) {
        const ci = head++;
        const cur = nodes[ci];
        for (const L of LABELS) {
            const m = cur.m.mul(LR.GEN[L]);
            const key = projKey(m);
            let j = byKey.get(key);
            if (j === undefined) {
                if (nodes.length >= MAX_NODES) continue;
                j = nodes.length;
                nodes.push({ m, h: m.height });
                byKey.set(key, j);
            }
            const ek = ci < j ? `${ci}|${j}` : `${j}|${ci}`;
            if (ci !== j && !seenEdge.has(ek)) {
                seenEdge.add(ek);
                edges.push([ci, j]);
            }
        }
    }
    return { nodes, edges };
}

// ---------------------------------------------------------------- colour ---

// Warm (cheap) → cool (expensive); mirrored by the CSS legend gradient.
const STOPS = [
    [0.00, [0.984, 0.749, 0.141]],
    [0.32, [0.957, 0.475, 0.357]],
    [0.62, [0.690, 0.424, 0.816]],
    [0.84, [0.310, 0.388, 0.847]],
    [1.00, [0.165, 0.184, 0.502]],
];

function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < STOPS.length; i++) {
        if (t <= STOPS[i][0]) {
            const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
            const u = (t - t0) / (t1 - t0);
            return [
                c0[0] + (c1[0] - c0[0]) * u,
                c0[1] + (c1[1] - c0[1]) * u,
                c0[2] + (c1[2] - c0[2]) * u,
            ];
        }
    }
    return STOPS[STOPS.length - 1][1];
}

// ----------------------------------------------------------------- scene ---

const container = document.getElementById('scene');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const key = new THREE.DirectionalLight(0xffffff, 0.85);
key.position.set(2, 4, 3);
scene.add(key);

// The ideal boundary of the hyperbolic plane.
{
    const pts = [];
    for (let i = 0; i <= 256; i++) {
        const a = (i / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const rim = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x7c8aff, transparent: true, opacity: 0.5 }));
    scene.add(rim);
    const disk = new THREE.Mesh(
        new THREE.CircleGeometry(1, 128),
        new THREE.MeshBasicMaterial({
            color: 0x0d1730, transparent: true, opacity: 0.55,
            side: THREE.DoubleSide, depthWrite: false
        }));
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = -0.004;      // sit just under the graph
    disk.renderOrder = -1;
    scene.add(disk);
}

const { nodes, edges } = buildGraph();
const maxH = nodes.reduce((m, n) => Math.max(m, n.h), 1);
const HSCALE = TOP_HEIGHT / maxH;

// Disk positions (fixed — only the height animates).
const pos = nodes.map(n => LR.nodeDiskPos(n.m.toComplex()));

// ---- nodes: one instanced sphere cloud ----
const nodeMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.011, 10, 7),
    new THREE.MeshStandardMaterial({
        roughness: 0.42, metalness: 0.08,
        emissive: 0xffffff, emissiveIntensity: 0.18,
    }),
    nodes.length);
nodeMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(nodes.length * 3), 3);
nodeMesh.frustumCulled = false;
scene.add(nodeMesh);

const nodeScale = new Float32Array(nodes.length);
{
    const c = new THREE.Color();
    for (let i = 0; i < nodes.length; i++) {
        const r = Math.hypot(pos[i].re, pos[i].im);
        nodeScale[i] = Math.max(0.3, 1 - r);          // gentle hyperbolic falloff
        const [cr, cg, cb] = ramp(nodes[i].h / maxH);
        c.setRGB(cr, cg, cb);
        nodeMesh.setColorAt(i, c);
    }
    nodeMesh.instanceColor.needsUpdate = true;
}

// ---- edges: hyperbolic geodesics, adaptively sampled ----
// Each vertex remembers the height it should rise to, so lifting the whole
// graph is one pass writing the y components.

/** How far this geodesic bows away from its chord, in the disk. */
function sagitta(z1, z2) {
    const mid = LR.geodesicPoint(z1, z2, 0.5);
    return Math.hypot(mid.re - 0.5 * (z1.re + z2.re),
                      mid.im - 0.5 * (z1.im + z2.im));
}

function segmentsFor(z1, z2) {
    const n = Math.ceil(2 * Math.sqrt(sagitta(z1, z2) / ARC_TOL));
    return Math.max(MIN_SEG, Math.min(MAX_SEG, n));
}

const edgeSegs = edges.map(([i, j]) => segmentsFor(pos[i], pos[j]));
const vertCount = edgeSegs.reduce((a, n) => a + n * 2, 0);
const edgePos = new Float32Array(vertCount * 3);
const edgeCol = new Float32Array(vertCount * 3);
const edgeH = new Float32Array(vertCount);
{
    let v = 0;
    const put = (z, hv) => {
        edgePos[v * 3] = z.re;
        edgePos[v * 3 + 2] = z.im;
        edgeH[v] = hv;
        const [cr, cg, cb] = ramp(hv / maxH);
        edgeCol[v * 3] = cr; edgeCol[v * 3 + 1] = cg; edgeCol[v * 3 + 2] = cb;
        v++;
    };
    edges.forEach(([i, j], e) => {
        const z1 = pos[i], z2 = pos[j];
        const h1 = nodes[i].h, h2 = nodes[j].h;
        const segs = edgeSegs[e];
        let prevZ = z1, prevT = 0;
        for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            const z = LR.geodesicPoint(z1, z2, t);
            put(prevZ, h1 + (h2 - h1) * prevT);
            put(z, h1 + (h2 - h1) * t);
            prevZ = z; prevT = t;
        }
    });
}
const edgeGeom = new THREE.BufferGeometry();
edgeGeom.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
edgeGeom.setAttribute('color', new THREE.BufferAttribute(edgeCol, 3));
const edgeMesh = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.62,
}));
edgeMesh.frustumCulled = false;
scene.add(edgeMesh);

// ------------------------------------------------------------ animation ---

// The camera moves in SPHERICAL coordinates about the target with the azimuth
// held fixed, so the reveal is a pure drop from overhead to a raking view —
// interpolating Cartesian endpoints instead swings the azimuth round (and is
// degenerate directly above, where the azimuth is undefined), which reads as
// the whole scene rotating.
const CAM_POLAR_FLAT = 0.05;     // ~3° off vertical: still reads as top-down,
const CAM_POLAR_TILT = 1.14;     //   but never degenerate for lookAt
const CAM_RADIUS_FLAT = 3.05;
const CAM_RADIUS_TILT = 4.28;
const CAM_TARGET_Y = 0.52;
let camAzimuth = Math.PI * 0.25;
const sph = new THREE.Spherical();

let lift = 0;                 // 0 = flat in the plane, 1 = fully raised
let liftTarget = 0;
let cameraAuto = true;        // stop steering once the user grabs the scene
controls.addEventListener('start', () => { cameraAuto = false; });

/** Place the camera for lift-progress e ∈ [0,1]: same azimuth throughout. */
function placeCamera(e) {
    controls.target.set(0, CAM_TARGET_Y * e, 0);
    sph.set(
        CAM_RADIUS_FLAT + (CAM_RADIUS_TILT - CAM_RADIUS_FLAT) * e,
        CAM_POLAR_FLAT + (CAM_POLAR_TILT - CAM_POLAR_FLAT) * e,
        camAzimuth);
    camera.position.setFromSpherical(sph).add(controls.target);
}

const dummy = new THREE.Object3D();
function applyLift() {
    for (let i = 0; i < nodes.length; i++) {
        dummy.position.set(pos[i].re, nodes[i].h * HSCALE * lift, pos[i].im);
        dummy.scale.setScalar(nodeScale[i]);
        dummy.updateMatrix();
        nodeMesh.setMatrixAt(i, dummy.matrix);
    }
    nodeMesh.instanceMatrix.needsUpdate = true;
    for (let v = 0; v < vertCount; v++) {
        edgePos[v * 3 + 1] = edgeH[v] * HSCALE * lift;
    }
    edgeGeom.attributes.position.needsUpdate = true;
    edgeGeom.computeBoundingSphere();
}

const captionText = document.getElementById('caption-text');
const legend = document.getElementById('legend');
document.querySelector('.legend-hi').textContent = String(maxH);

function setCaption(raised) {
    captionText.innerHTML = raised
        ? 'Each element rises to its <strong>cost</strong>: the number of primes, with ' +
          'multiplicity, in the denominator of its matrix once cancelled.'
        : 'The Cayley graph of <em>\u0393\u2089</em>, drawn in the hyperbolic plane.';
    legend.classList.toggle('hidden', !raised);
}

function setLift(target) {
    liftTarget = target ? 1 : 0;
    setCaption(!!target);
}

function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
window.addEventListener('resize', resize);

placeCamera(0);
resize();
applyLift();

let last = performance.now();
function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (lift !== liftTarget) {
        const step = dt / LIFT_SECONDS;
        lift = liftTarget > lift ? Math.min(liftTarget, lift + step)
                                 : Math.max(liftTarget, lift - step);
        applyLift();
        if (cameraAuto) {
            // Drop from overhead to a raking view as the relief appears.
            placeCamera(lift * lift * (3 - 2 * lift));
        }
    }

    controls.update();
    renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// -------------------------------------------------------------- control ---

function handle(cmd) {
    if (cmd === 'lift' || cmd === 'raise') setLift(true);
    else if (cmd === 'flatten' || cmd === 'drop') setLift(false);
    else if (cmd === 'toggle' || cmd === 'play') setLift(liftTarget === 0);
    else if (cmd === 'reset') {
        setLift(false);
        cameraAuto = true;
        camAzimuth = Math.PI * 0.25;
        placeCamera(0);
    }
}

window.addEventListener('message', (e) => {
    const d = e.data;
    if (typeof d === 'string') handle(d);
    else if (d && typeof d.cmd === 'string') handle(d.cmd);
});

window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handle('toggle'); }
    else if (e.key === 'r' || e.key === 'R') handle('reset');
});

// Handy for the console / the deck.
window.cayleyHeights = {
    handle, camera, controls, nodes: nodes.length, edges: edges.length, maxH,
    vertices: vertCount,
    segs: { min: Math.min(...edgeSegs), max: Math.max(...edgeSegs),
            avg: +(edgeSegs.reduce((a, b) => a + b, 0) / edgeSegs.length).toFixed(1) },
};
