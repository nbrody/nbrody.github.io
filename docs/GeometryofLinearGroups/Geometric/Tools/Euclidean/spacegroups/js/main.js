import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    Iso, formatWordMathJax, reduceWord, invertWord,
    getCayleyGraph, wallSD, covToGeom, bisectorCov, eucDistProxy, eucDist,
    wallF, projectToWall, isoKey, applyIso, RBOUND, classifyIso,
    isoPath, composeAffine, transformPlaneCov, affineToMatrix4
} from './math.js';
import { computeCanonicalDomain } from './canonical.js';
import { certifyDomain, findEdges } from './certifier.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { setupMatrixInput, getMatricesFromUI } from './matrixInput.js';
import { setupControlPanel, updateToggleBtn, colorPalettes, getPaletteSettings } from './controlPanel.js';
import { mirrorFragmentShader, mirrorDefaults } from './mirror.js';
import { exportDomainAs3MF } from './export3mf.js';

// --- Three.js setup ---
const container = document.getElementById('viz-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.2, 1.4, 2.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;
controls.addEventListener('start', () => {
    controls.autoRotate = false;
    updateToggleBtn(document.getElementById('auto-rotate'), false);
});

// Raymarch entry box: must enclose the bounding sphere of radius RBOUND.
const geometry = new THREE.BoxGeometry(2.14 * RBOUND, 2.14 * RBOUND, 2.14 * RBOUND);
let currentMaxFaces = 96;
let currentDepth = 8;
let viewIso = Iso.identity();
let animatingIsometry = false;

let currentMatrices = [];
let currentGenerators = [];   // interleaved [g, g^-1, ...]

const initialDomain = computeCanonicalDomain([], viewIso, currentMaxFaces);
const initialPalette = getPaletteSettings();

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_cameraPos: { value: new THREE.Vector3() },
        u_faces: { value: initialDomain.facesBuffer },
        u_faceCount: { value: initialDomain.count },
        u_time: { value: 0 },
        u_opacity: { value: 1.0 },
        u_colorMode: { value: initialPalette.mode },
        u_colorOffset: { value: initialPalette.offset.clone() },
        u_colorFreq: { value: initialPalette.freq },
        u_showTiling: { value: false },
        u_maxBounces: { value: mirrorDefaults.maxBounces },
        u_edgeLightWidth: { value: mirrorDefaults.edgeLightWidth },
        u_lightIntensity: { value: mirrorDefaults.lightIntensity }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.BackSide
});

const mesh = new THREE.Mesh(geometry, material);
mesh.renderOrder = -1;
scene.add(mesh);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

const cayleyGroup = new THREE.Group();
cayleyGroup.visible = false;
scene.add(cayleyGroup);
let cayleyMode = 'off';

const wallsGroup = new THREE.Group();
wallsGroup.visible = false;
scene.add(wallsGroup);
let wallsOpacity = 0;

// Dual tiling: Dirichlet–Voronoi walls dual to the (S or T) Cayley graph.
const dualGroup = new THREE.Group();
dualGroup.visible = false;
scene.add(dualGroup);
let dualMode = 'off';
let dualOpacity = 0.3;

// Face inspection: highlight clicked faces (drawn over the polyhedron).
const highlightGroup = new THREE.Group();
scene.add(highlightGroup);
let selectedFace = -1;          // last plain-clicked wall index (angle reference)

// Polyhedral tiling: translucent copies g·D of the fundamental domain.
const tilingGroup = new THREE.Group();
tilingGroup.visible = false;
scene.add(tilingGroup);
let showTiling = false;
const TILING_OPACITY = 0.14;
const TILING_MAX = 30;          // max neighbour tiles to draw
const TILING_DEPTH = 2;         // rings of neighbours (face-pairing word length)

// Edge/vertex focus: when set, the tiling shows only the cells meeting it.
let domainSkeleton = null;      // cached { edges, vertices } from findEdges
let focusKind = 'none';         // 'none' | 'edge' | 'vertex'
let focusPoint = null;          // point used to filter tiles (edge midpoint / vertex)
const VERTEX_PICK_PX = 16;      // screen radius for clicking a vertex
const FOCUS_TILE_TOL = 0.05;    // distance slack on the "equidistant" cell test

let showTiedye = false;
let mirrorMode = false;

function setMirrorMode(enabled) {
    mirrorMode = enabled;
    material.fragmentShader = mirrorMode ? mirrorFragmentShader : fragmentShader;
    material.needsUpdate = true;
    updateToggleBtn(document.getElementById('toggle-mirror'), mirrorMode);
}

const generatorColors = [
    0x38bdf8, 0xf472b6, 0xfbbf24, 0x22c55e,
    0xa78bfa, 0xfb7185, 0x34d399, 0xf97316
];

// --- Domain state ---
let cachedDomain = null;
let stdGenerators = [];       // [{matrix, word, kind, wallIndex}]
let cumulativeWord = [];
let certToken = 0;            // staleness token for deferred certification
let fullDirichlet = false;    // show full symmetric Dirichlet domain (uncut by stabilizer cone)

function updateDomain(opts = {}) {
    cachedDomain = computeCanonicalDomain(currentGenerators, viewIso, currentMaxFaces, {
        maxDepth: currentDepth,
        skipPairings: opts.fast === true,
        fullDirichlet
    });
    material.uniforms.u_faces.value = cachedDomain.facesBuffer;
    material.uniforms.u_faceCount.value = cachedDomain.count;
    window.__domain = cachedDomain;   // debug handle
    return cachedDomain;
}

// --- Status banner + certificate ---
function setBanner(state, text) {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    banner.className = 'status-banner ' + state;   // 'verified' | 'warning' | 'failed' | 'pending'
    banner.innerHTML = '';
    if (text) {
        const span = document.createElement('span');
        span.className = 'status-banner-text';
        span.textContent = text;
        banner.appendChild(span);
        const close = document.createElement('button');
        close.className = 'status-banner-close';
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = '×';
        close.addEventListener('click', () => { banner.style.display = 'none'; });
        banner.appendChild(close);
    }
    banner.style.display = text ? 'flex' : 'none';
}

function setCertLog(lines) {
    const el = document.getElementById('cert-log');
    if (!el) return;
    el.textContent = lines.join('\n');
}

function runCertifier() {
    if (!cachedDomain || cachedDomain.count === 0) {
        setBanner('warning', currentGenerators.length ? 'No domain faces found.' : '');
        return;
    }
    // The full Dirichlet domain at a symmetric basepoint is |H| copies of a
    // fundamental domain, so the Poincaré conditions don't apply — show an
    // informational note rather than a misleading failure.
    if (fullDirichlet && cachedDomain.stabilizer.order > 1) {
        const k = cachedDomain.stabilizer.order;
        setBanner('warning', `Full Dirichlet domain — ${k} copies of a fundamental domain (symmetric view; Poincaré check disabled).`);
        setCertLog([
            'Full Dirichlet domain at the basepoint.',
            `Basepoint stabilizer order |H| = ${k}.`,
            'This polyhedron is H-invariant — it is |H| copies of a fundamental',
            'domain — so the Poincaré fundamental-domain conditions do not apply.',
            'Turn off "Full Domain" to certify the canonical fundamental domain.'
        ]);
        return;
    }
    const token = ++certToken;
    setBanner('pending', 'Verifying domain (Poincaré conditions)…');
    // Defer so the UI paints first
    setTimeout(() => {
        if (token !== certToken) return;
        try {
            const report = certifyDomain(cachedDomain.walls, cachedDomain.basepoint);
            if (token !== certToken) return;
            setCertLog(report.log);
            if (report.status === 'verified') {
                setBanner('verified', `✓ Discrete (crystallographic): all Poincaré conditions verified numerically (${cachedDomain.count} faces).`);
            } else if (report.status === 'incomplete') {
                setBanner('warning', `✓ All resolvable Poincaré conditions pass (${cachedDomain.count} faces) — see certificate for caveats (unbounded domain / near-degenerate edges).`);
            } else {
                setBanner('failed', '✗ Discreteness NOT verified — see certificate log. Try a larger word length, or the group may be non-discrete.');
            }
            if (cachedDomain.stabilizer.capped) {
                setBanner('failed', '✗ Basepoint stabilizer did not close into a finite group — the group is likely NOT discrete.');
            }
        } catch (e) {
            console.error('Certifier error:', e);
            setBanner('warning', 'Certifier error: ' + e.message);
        }
    }, 30);
}

// --- Isometry type labels ---
function classLabel(m) {
    const c = classifyIso(m);
    const deg = (a) => {
        const d = a * 180 / Math.PI;
        const r = Math.round(d);
        return Math.abs(d - r) < 0.05 ? `${r}` : d.toFixed(1);
    };
    switch (c.type) {
        case 'identity': return 'identity';
        case 'translation': return 'translation';
        case 'rotation': return `rotation ${deg(c.angle)}°`;
        case 'screw': return `screw ${deg(c.angle)}°`;
        case 'reflection': return 'reflection';
        case 'glide': return 'glide';
        case 'rotoreflection': return `rotoreflection ${deg(c.angle)}°`;
        case 'inversion': return 'inversion';
    }
    return c.type;
}

// --- Standard generators UI ---
function updateStdGeneratorsList() {
    clearFaceSelection();   // wall indices changed — drop any face highlight
    domainSkeleton = null;  // recompute edges/vertices lazily for the new domain
    const container = document.getElementById('std-generators-list');
    const stabInfo = document.getElementById('stabilizer-info');
    if (!container || !cachedDomain) return;

    // The standard geometric generators are the face-pairing transformations.
    // Keep one per {s, s^-1} pair.
    stdGenerators = [];
    const taken = new Set();
    cachedDomain.walls.forEach((w, i) => {
        if (taken.has(i)) return;
        const pairing = w.pairing;
        if (!pairing) {
            stdGenerators.push({ matrix: w.elem, word: w.word, kind: w.kind, wallIndex: i, unpaired: true });
            return;
        }
        taken.add(i);
        if (pairing.partner >= 0) taken.add(pairing.partner);
        stdGenerators.push({
            // pairing.alg is the pure word s = g^{-1} in the basepoint frame;
            // list the generator g whose wall is Bis(q, g·q).
            matrix: pairing.alg.inv().normalized(),
            sMatrix: pairing.alg,
            word: invertWord(pairing.word),
            kind: w.kind,
            wallIndex: i,
            partnerIndex: pairing.partner
        });
    });

    stdGenerators.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'cone' ? -1 : 1;
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        for (let i = 0; i < a.word.length; i++) {
            if (a.word[i] !== b.word[i]) return a.word[i] - b.word[i];
        }
        return 0;
    });

    // Stabilizer summary
    if (stabInfo) {
        const H = cachedDomain.stabilizer;
        if (H.order <= 1) {
            stabInfo.innerHTML = '<span class="stab-trivial">Basepoint stabilizer: trivial</span>';
        } else {
            const capNote = H.capped ? ' <strong class="stab-warning">(did not close — likely non-discrete!)</strong>' : '';
            const note = fullDirichlet
                ? `Showing the full Dirichlet domain — ${H.order} copies of a fundamental domain (symmetric view).`
                : 'Domain = Dirichlet domain ∩ fundamental cone for the stabilizer.';
            stabInfo.innerHTML = `Basepoint stabilizer: order <strong>${H.order}</strong>${capNote}` +
                `<br><span class="stab-note">${note}</span>`;
        }
    }

    // The "Full Domain" toggle only does anything when the basepoint has a
    // symmetry; grey it out otherwise so its scope is self-evident.
    const fullBtn = document.getElementById('toggle-full-domain');
    if (fullBtn) fullBtn.disabled = cachedDomain.stabilizer.order <= 1;

    container.innerHTML = '';
    if (stdGenerators.length === 0) {
        container.innerHTML = '<p class="empty-message">No faces — click Refresh to compute.</p>';
        return;
    }

    stdGenerators.forEach((gen, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item'
            + (gen.kind === 'cone' ? ' stabilizer' : '')
            + (gen.unpaired ? ' unpaired' : '');

        const wordSpan = document.createElement('span');
        wordSpan.className = 'std-gen-word';
        wordSpan.innerHTML = `\\(${formatWordMathJax(gen.word)}\\)`;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'std-gen-type';
        typeSpan.textContent = gen.unpaired ? 'unpaired!' : classLabel(gen.matrix);

        item.appendChild(wordSpan);
        item.appendChild(typeSpan);
        item.addEventListener('click', (e) => animateStdGenerator(idx, e));
        container.appendChild(item);
    });

    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]);
    }
    updateCurrentElementDisplay();
}

function updateCurrentElementDisplay() {
    const display = document.getElementById('current-element-display');
    if (!display) return;
    display.innerHTML = `\\(${formatWordMathJax(reduceWord(cumulativeWord))}\\)`;
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([display]);
    }
}

// --- Cayley graph ---

function buildTGenerators() {
    const tGens = [];
    const seen = new Set();
    for (const gen of stdGenerators) {
        if (gen.unpaired) continue;
        const wordKey = gen.word.join(',');
        const invKey = invertWord(gen.word).join(',');
        if (seen.has(wordKey) || seen.has(invKey)) continue;
        seen.add(wordKey);
        tGens.push(gen);
    }
    const generators = [];
    for (const g of tGens) {
        generators.push(g.matrix);
        generators.push(g.matrix.inv().normalized());
    }
    return { generators, numTypes: tGens.length };
}

/**
 * Resolve the generating set for a given mode ('S' = input generators,
 * 'T' = standard geometric generators), shared by the Cayley graph and the
 * dual tiling. Returns null if no generators are available.
 */
function getModeGenerators(mode) {
    let generators, numTypes;
    let depth = currentDepth;
    if (mode === 'T') {
        if (stdGenerators.length === 0) return null;
        const t = buildTGenerators();
        generators = t.generators;
        numTypes = t.numTypes;
        if (numTypes > 20) depth = Math.min(depth, 2);
        else if (numTypes > 10) depth = Math.min(depth, 3);
        else if (numTypes > 5) depth = Math.min(depth, 4);
    } else {
        if (currentGenerators.length === 0) return null;
        generators = currentGenerators;
        numTypes = currentMatrices.length;
    }
    if (generators.length === 0) return null;
    return { generators, numTypes, depth };
}

// Above this many edges, render flat lines instead of tubes (build cost guard).
const CAYLEY_TUBE_LIMIT = 9000;
// Cull graph geometry outside the bounding sphere (plus a little slack).
const CAYLEY_CULL = RBOUND + 0.6;

function disposeGroup(group) {
    group.traverse(obj => {
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => m.dispose());
        }
    });
    group.clear();
}

// Distinct vertices as one instanced, lightly-lit sphere cloud — a single
// draw call regardless of vertex count.
function buildCayleyVertices(points) {
    const seen = new Set();
    const uniq = [];
    for (const p of points) {
        if (p.length() > CAYLEY_CULL) continue;
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(p);
    }
    if (uniq.length === 0) return;
    const geom = new THREE.SphereGeometry(0.022, 10, 8);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xbcd4ff, emissiveIntensity: 0.25,
        roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.95, depthWrite: false
    });
    const inst = new THREE.InstancedMesh(geom, mat, uniq.length);
    const dummy = new THREE.Object3D();
    uniq.forEach((p, i) => {
        dummy.position.copy(p);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 1;
    cayleyGroup.add(inst);
}

// Straight tubes along each Cayley edge (geodesics of R^3 are lines), merged
// into one lit mesh per generator type.
function buildCayleyTubes(typeEdges, points, color) {
    const R = 5, BASE_R = 0.0115;
    const positions = [], normals = [], indices = [];
    const perpAxis = (t) => Math.abs(t.x) > 0.9
        ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    for (const { u, v } of typeEdges) {
        const p1 = points[u], p2 = points[v];
        if (p1.distanceTo(p2) < 1e-5) continue;
        if (p1.length() > CAYLEY_CULL && p2.length() > CAYLEY_CULL) continue;
        const tan = p2.clone().sub(p1).normalize();
        let n = perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan)).normalize();
        const b = new THREE.Vector3().crossVectors(tan, n);
        const base = positions.length / 3;
        for (const p of [p1, p2]) {
            for (let k = 0; k < R; k++) {
                const a = (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
                positions.push(p.x + nx * BASE_R, p.y + ny * BASE_R, p.z + nz * BASE_R);
                normals.push(nx, ny, nz);
            }
        }
        for (let k = 0; k < R; k++) {
            const k2 = (k + 1) % R;
            const a = base + k, b2 = base + k2;
            const c = base + R + k2, d = base + R + k;
            indices.push(a, b2, c, a, c, d);
        }
    }
    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(indices);
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.4,
        roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.96, depthWrite: false
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1;
    return mesh;
}

// Cheap fallback: flat line segments (used for huge graphs).
function buildCayleyLines(typeEdges, points, color) {
    const pts = [];
    for (const { u, v } of typeEdges) {
        const p1 = points[u], p2 = points[v];
        if (p1.distanceTo(p2) < 1e-5) continue;
        if (p1.length() > CAYLEY_CULL && p2.length() > CAYLEY_CULL) continue;
        pts.push(p1, p2);
    }
    if (pts.length === 0) return null;
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    const lines = new THREE.LineSegments(geom, mat);
    lines.renderOrder = 1;
    return lines;
}

function updateCayley(opts = {}) {
    disposeGroup(cayleyGroup);
    if (cayleyMode === 'off') return;

    const sel = getModeGenerators(cayleyMode);
    if (!sel) return;
    const { generators, numTypes, depth } = sel;

    const { points, edges } = getCayleyGraph(generators, depth, viewIso, 15000);

    buildCayleyVertices(points);

    const useTubes = !opts.fast && edges.length <= CAYLEY_TUBE_LIMIT;
    for (let type = 0; type < numTypes; type++) {
        const typeEdges = edges.filter(e => e.type === type);
        if (typeEdges.length === 0) continue;
        const color = generatorColors[type % generatorColors.length];
        const obj = useTubes
            ? buildCayleyTubes(typeEdges, points, color)
            : buildCayleyLines(typeEdges, points, color);
        if (obj) cayleyGroup.add(obj);
    }
}

// --- Walls (translucent disks of accepted domain wall planes) ---
function createWallMesh(wall, color) {
    const geom = wall.geom;
    // Plane n·x = d meets the bounding sphere in a disk of radius √(R²−d²)
    const d = geom.d;
    const rad2 = RBOUND * RBOUND - d * d;
    if (rad2 <= 1e-8) return null;
    const g = new THREE.CircleGeometry(Math.sqrt(rad2), 64);
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: wallsOpacity * 0.4,
        side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.copy(geom.n.clone().multiplyScalar(d));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), geom.n);
    return mesh;
}

function updateWalls() {
    disposeGroup(wallsGroup);
    if (!cachedDomain) return;
    cachedDomain.walls.forEach((w, i) => {
        const color = w.kind === 'cone' ? 0xffffff : generatorColors[i % generatorColors.length];
        const m = createWallMesh(w, color);
        if (m) wallsGroup.add(m);
    });
}

// --- Dual tiling (walls dual to the Cayley graph) ---
// Each Cayley edge (u, v) is dual to the perpendicular-bisector plane between
// the orbit points q_u, q_v. The actual Dirichlet tile face is the part of
// that bisector closer to q_u, q_v than to any other orbit point — a convex
// polygon. We render it cleanly: locate the face's pole (the midpoint of
// q_u, q_v, which is interior to the face iff the two tiles are adjacent),
// march outward along the plane in each direction to the face boundary, and
// fan-tessellate.
const DUAL_NEIGHBORS = 64;       // # nearest orbit points whose bisectors bound a face
const FACE_TOL = 1e-4;

/**
 * Tessellate the convex face carved out of the plane `geom` around the
 * interior pole `P`, bounded by the bounding sphere and the half-spaces
 * `neighborCovs` (covectors oriented domain-side F<0). Marches outward from P
 * in each of `dirs` directions to the face boundary, then fans `rings` radial
 * bands. Appends triangles to `out`.
 */
function buildClippedFace(geom, P, neighborCovs, out, dirs, rings) {
    if (P.lengthSq() >= RBOUND * RBOUND) return;
    // If the pole is outside any bounding half-space, there is no face here.
    for (const Wq of neighborCovs) if (wallF(P, Wq) > FACE_TOL) return;

    const nrm = geom.n;
    let e1 = Math.abs(nrm.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    e1.sub(nrm.clone().multiplyScalar(e1.dot(nrm))).normalize();
    const e2 = new THREE.Vector3().crossVectors(nrm, e1);

    // Point on the plane at radius t in tangent direction (ct, st).
    const at = (t, ct, st) => new THREE.Vector3(
        P.x + (e1.x * ct + e2.x * st) * t,
        P.y + (e1.y * ct + e2.y * st) * t,
        P.z + (e1.z * ct + e2.z * st) * t
    );
    const inFace = (Q) => {
        if (Q.x * Q.x + Q.y * Q.y + Q.z * Q.z >= RBOUND * RBOUND - 1e-6) return false;
        for (const Wq of neighborCovs) if (wallF(Q, Wq) > FACE_TOL) return false;
        return true;
    };
    const tMax = 2.0 * RBOUND;

    // For each direction, binary-search the face boundary radius.
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

    // Fan from the pole outward, `rings` radial bands, wrapping around.
    for (let i = 0; i < dirs; i++) {
        const a = rim[i], b = rim[(i + 1) % dirs];
        for (let k = 0; k < rings; k++) {
            const r0 = k / rings, r1 = (k + 1) / rings;
            const A = at(a.t * r0, a.ct, a.st), B = at(a.t * r1, a.ct, a.st);
            const C = at(b.t * r1, b.ct, b.st), D = at(b.t * r0, b.ct, b.st);
            if (k === 0) { out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z); }
            else {
                out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z,
                    A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z);
            }
        }
    }
}

/**
 * Dual-tiling face on Bis(p1, p2): pole = midpoint of p1, p2 (in the face
 * interior iff the two tiles are adjacent), bounded by `neighborCovs`.
 */
function buildDualFacet(p1, p2, neighborCovs, out, dirs, rings) {
    const W = bisectorCov(p1, p2);
    if (!W) return;                       // coincident points (e.g. torsion edge)
    const geom = covToGeom(W);
    const P = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    buildClippedFace(geom, P, neighborCovs, out, dirs, rings);
}

function updateDual(opts = {}) {
    dualGroup.clear();
    if (dualMode === 'off') return;
    const sel = getModeGenerators(dualMode);
    if (!sel) return;

    // The per-face boundary search is the costly part; cap depth/orbit size and
    // tessellation density, harder during animation (opts.fast) for smoothness.
    let depth = Math.min(sel.depth, 4);
    if (opts.fast) depth = Math.min(depth, 2);
    const maxNodes = opts.fast ? 400 : 1500;
    const dirs = opts.fast ? 20 : 48;
    const rings = opts.fast ? 2 : 5;

    const { points, edges } = getCayleyGraph(sel.generators, depth, viewIso, maxNodes);
    if (points.length < 2) return;

    // One triangle soup per generator type so each wall family shares its Cayley color.
    const byType = new Map();
    for (const e of edges) {
        const p1 = points[e.u], p2 = points[e.v];
        if (p1.distanceTo(p2) < 1e-5) continue;     // zero-length (torsion) edge
        if (p1.length() > CAYLEY_CULL && p2.length() > CAYLEY_CULL) continue;

        // The face is bounded by the nearest orbit points' bisectors against p1.
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        const ranked = [];
        for (let w = 0; w < points.length; w++) {
            if (w === e.u || w === e.v) continue;
            ranked.push([eucDistProxy(mid, points[w]), w]);
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
        if (arr.length === 0) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const mat = new THREE.MeshBasicMaterial({
            color: generatorColors[type % generatorColors.length],
            transparent: true, opacity: dualOpacity,
            side: THREE.DoubleSide, depthWrite: false
        });
        const m = new THREE.Mesh(g, mat);
        m.renderOrder = 1;
        dualGroup.add(m);
    }
}

// --- Polyhedral tiling (translucent copies of the fundamental domain) ---
// BFS over the face-pairing moves (each wall's element steps to the tile across
// that wall) to collect the nearest group elements, excluding the identity.
function nearbyTiles(walls, maxDepth, maxTiles) {
    const moves = walls.map(w => w.elem);
    const seen = new Set([isoKey(Iso.identity())]);
    const out = [];
    let frontier = [Iso.identity()];
    for (let d = 0; d < maxDepth && out.length < maxTiles; d++) {
        const next = [];
        for (const m of frontier) {
            for (const mv of moves) {
                const prod = m.mul(mv).normalized();
                const key = isoKey(prod);
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

function updateTiling(opts = {}) {
    disposeGroup(tilingGroup);
    if (!showTiling || !cachedDomain || cachedDomain.walls.length === 0) return;

    const walls = cachedDomain.walls;
    const vInv = viewIso.inv().normalized();
    const q0 = applyIso(vInv, cachedDomain.conePoint);  // basepoint-frame center
    const dirs = opts.fast ? 16 : 34, rings = opts.fast ? 2 : 3;

    // When an edge/vertex is focused, show only the cells meeting it: a cell g·D
    // meets the focus iff the focus point is equidistant from g·q0 and the
    // central q0 (it lies on the shared boundary). Explore deeper to reach the
    // whole edge cycle / vertex star, then keep only the equidistant cells.
    const focused = !opts.fast && focusKind !== 'none' && focusPoint;
    const tiles = focused
        ? nearbyTiles(walls, 5, 400)
        : nearbyTiles(walls, opts.fast ? 1 : TILING_DEPTH, opts.fast ? 14 : TILING_MAX);
    const d0 = focused ? eucDist(focusPoint, cachedDomain.conePoint) : 0;

    // A copy of the fundamental domain at element h has walls
    //   Bis(h·q0, h·g_j·q0)   (g_j = walls[j].elem),
    // i.e. h applied to D's walls. Group faces by wall index so corresponding
    // faces across all tiles share a colour.
    const byWall = new Map();
    for (const h of tiles) {
        const Vh = viewIso.mul(h).normalized();
        const c_h = applyIso(Vh, q0);
        if (c_h.lengthSq() >= RBOUND * RBOUND) continue;
        if (focused && Math.abs(eucDist(focusPoint, c_h) - d0) > FOCUS_TILE_TOL) continue;
        const covs = [], geoms = [];
        for (const w of walls) {
            const cn = applyIso(Vh.mul(w.elem).normalized(), q0);
            const cov = bisectorCov(c_h, cn);
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
        if (arr.length === 0) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const color = walls[j].kind === 'cone' ? 0xffffff : generatorColors[j % generatorColors.length];
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: TILING_OPACITY,
            side: THREE.DoubleSide, depthWrite: false
        });
        const m = new THREE.Mesh(g, mat);
        m.renderOrder = 0;
        tilingGroup.add(m);
    }
}

// --- Isometry animation ---
//
// Unlike the hyperbolic tool (which re-ran the whole domain computation with
// an interpolated view matrix every frame), we animate as a pure DISPLAY
// transform: the wall covectors and overlay groups are moved by the affine
// path W(s) = V ∘ path_g(s) ∘ V⁻¹, and the exact domain is recomputed once at
// the end. For proper motions path_g is the screw interpolation (rigid at
// every s); for improper ones (reflections, glides, rotoinversions) no rigid
// path exists — the isoPath "flip" passes through the mirror plane, flattening
// and re-opening the polyhedron on the other side.
const overlayGroups = [cayleyGroup, wallsGroup, dualGroup, tilingGroup, highlightGroup];

function animateMatrix(gAlg, wordToAppend, onDone) {
    if (!cachedDomain) return;
    try {
        const path = isoPath(gAlg);
        const V = viewIso;
        const Vi = viewIso.inv().normalized();
        const baseCovs = cachedDomain.walls.map(w => w.cov.clone());
        const count = cachedDomain.count;
        const duration = 1000;
        const startTime = performance.now();
        animatingIsometry = true;
        overlayGroups.forEach(g => { g.matrixAutoUpdate = false; });

        function step(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = t * t * (3 - 2 * t);
            const A = path(eased);                                    // basepoint frame
            const W = composeAffine(V, composeAffine(A, Vi));         // world frame
            const buf = material.uniforms.u_faces.value;
            for (let i = 0; i < count; i++) {
                buf[i].copy(transformPlaneCov(baseCovs[i], W));
            }
            const M4 = affineToMatrix4(W);
            overlayGroups.forEach(g => { g.matrix.copy(M4); });

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingIsometry = false;
                overlayGroups.forEach(g => {
                    g.matrix.identity();
                    g.matrixAutoUpdate = true;
                    g.position.set(0, 0, 0);
                    g.quaternion.identity();
                    g.scale.set(1, 1, 1);
                });
                viewIso = V.mul(gAlg).normalized();
                cumulativeWord = reduceWord([...cumulativeWord, ...wordToAppend]);
                updateDomain();          // full recompute with pairings
                updateStdGeneratorsList();
                if (wallsOpacity > 0) updateWalls();
                if (cayleyMode !== 'off') updateCayley();
                if (dualMode !== 'off') updateDual();
                if (showTiling) updateTiling();
                runCertifier();
                if (onDone) onDone();
            }
        }
        requestAnimationFrame(step);
    } catch (e) {
        console.error('Animation error:', e);
        animatingIsometry = false;
    }
}

function animateStdGenerator(idx, event) {
    if (animatingIsometry || idx >= stdGenerators.length) return;
    const gen = stdGenerators[idx];
    let g = gen.matrix;
    let word = [...gen.word];
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv().normalized();
        word = invertWord(gen.word);
    }
    animateMatrix(g, word);
}

function animateIsometry(genIndex, event) {
    if (animatingIsometry || genIndex >= currentMatrices.length) return;
    let g = currentMatrices[genIndex];
    let word = [genIndex + 1];
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv().normalized();
        word = [-(genIndex + 1)];
    }
    animateMatrix(g, word);
}

// --- Face picking (double-click) ---
function mapSDF(p) {
    const walls = cachedDomain ? cachedDomain.walls : [];
    let d = p.length() - RBOUND;
    let bestId = -1;
    for (let i = 0; i < walls.length; i++) {
        const df = wallSD(p, walls[i].geom);
        if (df > d) { d = df; bestId = i; }
    }
    return { d, bestId };
}

function findClickedWall(ray) {
    if (!cachedDomain || cachedDomain.count === 0) return -1;
    const EPSILON = 0.002, MAX_DIST = 20;
    let t = 0.01;
    for (let iter = 0; iter < 260; iter++) {
        const p = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
        const { d, bestId } = mapSDF(p);
        if (Math.abs(d) < EPSILON && bestId >= 0) return bestId;
        t += Math.max(EPSILON, Math.abs(d) * 0.9);
        if (t > MAX_DIST) return -1;
    }
    return -1;
}

function handleDoubleClick(event) {
    if (animatingIsometry || !cachedDomain) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const wallIdx = findClickedWall(raycaster.ray);
    if (wallIdx < 0) return;
    const wall = cachedDomain.walls[wallIdx];
    if (!wall.pairing) return;
    // Roll the domain across THIS face. The wall is Bis(q, g·q) with g = wall.elem,
    // so applying g (= pairing.alg⁻¹) sends the basepoint to g·q and the domain to
    // the adjacent tile g·D, which shares exactly this face (its g⁻¹ wall = this one).
    animateMatrix(wall.pairing.alg.inv().normalized(), invertWord(wall.pairing.word));
}
renderer.domElement.addEventListener('dblclick', handleDoubleClick);

// --- Face inspection (single-click: element / vertex; shift-click: edge) ---
function clearFaceSelection() {
    selectedFace = -1;
    focusKind = 'none';
    focusPoint = null;
    highlightGroup.clear();
    const info = document.getElementById('face-info');
    if (info) info.style.display = 'none';
}

// Translucent overlay of exactly face `idx` (clipped against the other walls).
function addFaceHighlight(idx, color) {
    if (!cachedDomain || idx < 0 || idx >= cachedDomain.walls.length) return;
    const geom = cachedDomain.walls[idx].geom;
    const pole = projectToWall(cachedDomain.conePoint, geom);
    const neighborCovs = [];
    cachedDomain.walls.forEach((w, j) => { if (j !== idx) neighborCovs.push(w.cov); });
    const out = [];
    buildClippedFace(geom, pole, neighborCovs, out, 56, 4);
    if (out.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false
    }));
    m.renderOrder = 5;
    highlightGroup.add(m);
}

// Interior dihedral angle (degrees) between two wall planes, from their unit
// outward normals: cos θ = -(n1·n2). Returns null if the planes are parallel.
function dihedralAngleDeg(c1, c2) {
    const ip = c1.x * c2.x + c1.y * c2.y + c1.z * c2.z;
    if (Math.abs(ip) > 1 - 1e-9) return null;     // parallel — no shared edge
    return Math.acos(Math.max(-1, Math.min(1, -ip))) * 180 / Math.PI;
}

// --- Exact-arithmetic LaTeX for matrix entries (integers, rationals, √-surds). ---
function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

// Closest low-denominator rational p/q to x, or null.
function asRational(x, maxDen = 64, tol = 1e-7) {
    for (let q = 1; q <= maxDen; q++) {
        const p = Math.round(x * q);
        if (Math.abs(x - p / q) < tol) {
            const g = gcdInt(p, q);
            return { p: p / g, q: q / g };
        }
    }
    return null;
}

// Pull square factors out of √n → { m, k } meaning m·√k.
function simplifySqrt(n) {
    let m = 1;
    for (let f = 2; f * f <= n; f++) {
        while (n % (f * f) === 0) { n /= f * f; m *= f; }
    }
    return { m, k: n };
}

// Exact LaTeX for a real number (integer / rational / √-surd) or null.
function exactReal(x) {
    if (Math.abs(x) < 1e-9) return '0';
    const rat = asRational(x);
    if (rat) return rat.q === 1 ? `${rat.p}` : `${rat.p < 0 ? '-' : ''}\\tfrac{${Math.abs(rat.p)}}{${rat.q}}`;
    const sq = asRational(x * x);                 // x = ±√(p·q)/q when x² is rational
    if (sq && sq.p > 0) {
        const { m, k } = simplifySqrt(sq.p * sq.q);
        if (k === 1) return null;                 // perfect square → would be rational
        const g = gcdInt(m, sq.q), num = m / g, den = sq.q / g;
        const sign = x < 0 ? '-' : '';
        const rad = num === 1 ? `\\sqrt{${k}}` : `${num}\\sqrt{${k}}`;
        return den === 1 ? `${sign}${rad}` : `${sign}\\tfrac{${rad}}{${den}}`;
    }
    return null;
}

const decReal = (x) => `${+x.toFixed(4)}`;
const entryLatex = (x) => exactReal(x) ?? decReal(x);

// LaTeX for a Seitz matrix (R | t).
function seitzLatex(m) {
    const R = m.R, t = m.t;
    const row = (i, ti) => `${entryLatex(R[3 * i])} & ${entryLatex(R[3 * i + 1])} & ${entryLatex(R[3 * i + 2])} & ${entryLatex(ti)}`;
    return `\\(\\left(\\begin{array}{ccc|c} ${row(0, t.x)} \\\\ ${row(1, t.y)} \\\\ ${row(2, t.z)} \\end{array}\\right)\\)`;
}

function showFaceInfo(html) {
    const info = document.getElementById('face-info');
    if (!info) return;
    info.innerHTML = html;
    info.style.display = 'block';
    if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([info]);
}

// Domain edges + finite vertices, computed lazily and cached (invalidated when
// the domain changes). Vertices are the endpoints of the edge segments that
// lie well inside the bounding sphere.
function getSkeleton() {
    if (domainSkeleton) return domainSkeleton;
    if (!cachedDomain || cachedDomain.walls.length === 0) {
        domainSkeleton = { edges: [], vertices: [] };
        return domainSkeleton;
    }
    const edges = findEdges(cachedDomain.walls);
    const vertices = [];
    const addV = (p) => {
        if (!p || p.length() > RBOUND * 0.95) return;   // runs to infinity — skip
        // A genuine vertex has ≥3 faces meeting at it.
        let nW = 0;
        for (const w of cachedDomain.walls) if (Math.abs(wallSD(p, w.geom)) < 3e-3) nW++;
        if (nW < 3) return;
        for (const q of vertices) if (q.distanceToSquared(p) < 4e-4) return;
        vertices.push(p.clone());
    };
    for (const e of edges) {
        if (e.samples && e.samples.length) { addV(e.samples[0]); addV(e.samples[e.samples.length - 1]); }
    }
    domainSkeleton = { edges, vertices };
    return domainSkeleton;
}

// A glowing tube swept along a polyline (the edge segment), drawn over everything.
function highlightEdge(samples, color) {
    const R = 6, radius = 0.016, m = samples.length;
    if (m < 2) return;
    const positions = [], normals = [], indices = [];
    const perpAxis = (t) => Math.abs(t.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    let prevN = null;
    for (let i = 0; i < m; i++) {
        const p = samples[i];
        const tan = (i === 0 ? samples[1].clone().sub(samples[0])
            : i === m - 1 ? samples[i].clone().sub(samples[i - 1])
                : samples[i + 1].clone().sub(samples[i - 1]));
        if (tan.lengthSq() < 1e-12) tan.set(0, 0, 1);
        tan.normalize();
        let n = prevN ? prevN.clone().addScaledVector(tan, -prevN.dot(tan)) : perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan));
        if (n.lengthSq() < 1e-12) n = perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan));
        n.normalize();
        prevN = n;
        const b = new THREE.Vector3().crossVectors(tan, n);
        for (let k = 0; k < R; k++) {
            const a = (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
            positions.push(p.x + nx * radius, p.y + ny * radius, p.z + nz * radius);
            normals.push(nx, ny, nz);
        }
    }
    for (let i = 0; i < m - 1; i++) {
        for (let k = 0; k < R; k++) {
            const k2 = (k + 1) % R;
            indices.push(i * R + k, i * R + k2, (i + 1) * R + k2, i * R + k, (i + 1) * R + k2, (i + 1) * R + k);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(indices);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
        transparent: true, depthTest: false, depthWrite: false
    }));
    mesh.renderOrder = 6;
    highlightGroup.add(mesh);
}

function highlightVertex(v, color) {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 16, 12),
        new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
            transparent: true, depthTest: false, depthWrite: false
        }));
    mesh.position.copy(v);
    mesh.renderOrder = 6;
    highlightGroup.add(mesh);
}

// Nearest domain vertex to a click, in screen space (front-most within range).
function pickVertex(clientX, clientY) {
    const skel = getSkeleton();
    if (!skel.vertices.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    let best = null, bestCam = Infinity;
    for (const v of skel.vertices) {
        const ndc = v.clone().project(camera);
        const px = (ndc.x * 0.5 + 0.5) * rect.width, py = (-ndc.y * 0.5 + 0.5) * rect.height;
        if ((px - cx) ** 2 + (py - cy) ** 2 > VERTEX_PICK_PX * VERTEX_PICK_PX) continue;
        const camDist = v.distanceToSquared(camera.position);
        if (camDist < bestCam) { bestCam = camDist; best = v; }
    }
    return best;
}

function selectVertex(v) {
    focusKind = 'vertex'; focusPoint = v.clone();
    selectedFace = -1;
    highlightGroup.clear();
    highlightVertex(v, 0xfbbf24);
    const nWalls = cachedDomain.walls.filter(w => Math.abs(wallSD(v, w.geom)) < 2e-3).length;
    showFaceInfo(
        `<div class="fi-row"><span class="fi-key">Vertex</span><span>${nWalls} faces meet here</span></div>` +
        `<div class="fi-hint">${showTiling ? 'showing the cells around this vertex' : 'enable Tiling to see the cells around it'}</div>`);
    if (showTiling) updateTiling();
}

function handleFaceClick(idx, shift) {
    const wall = cachedDomain.walls[idx];
    if (shift && selectedFace >= 0 && selectedFace !== idx) {
        // Highlight the EDGE shared by the two faces (and focus the tiling on it).
        const ref = cachedDomain.walls[selectedFace];
        const a = Math.min(selectedFace, idx), b = Math.max(selectedFace, idx);
        const matching = getSkeleton().edges.filter(ed =>
            Math.min(ed.i, ed.j) === a && Math.max(ed.i, ed.j) === b);
        const wA = `\\(${formatWordMathJax(ref.word)}\\)`, wB = `\\(${formatWordMathJax(wall.word)}\\)`;
        highlightGroup.clear();
        if (matching.length) {
            for (const ed of matching) highlightEdge(ed.samples, 0xfde047);
            focusKind = 'edge'; focusPoint = matching[0].mid.clone();
            const ang = matching[0].angle * 180 / Math.PI;
            showFaceInfo(
                `<div class="fi-row"><span class="fi-key">Edge</span><span>${wA} ∩ ${wB}</span></div>` +
                `<div class="fi-angle">∠ = ${ang.toFixed(1)}°<span class="fi-sub"> = ${(ang / 180).toFixed(3)}π</span></div>` +
                (showTiling ? '<div class="fi-hint">showing the cells around this edge</div>' : ''));
        } else {
            // Faces don't share an edge of the domain: report the plane angle only.
            focusKind = 'none'; focusPoint = null;
            addFaceHighlight(selectedFace, 0x38bdf8);
            addFaceHighlight(idx, 0xfbbf24);
            const ang = dihedralAngleDeg(ref.cov, wall.cov);
            const body = ang === null
                ? '<div class="fi-angle">parallel — no shared edge</div>'
                : `<div class="fi-angle">∠ = ${ang.toFixed(1)}°<span class="fi-sub"> (planes, not adjacent)</span></div>`;
            showFaceInfo(`<div class="fi-row"><span class="fi-key">Faces</span><span>${wA} &amp; ${wB}</span></div>${body}`);
        }
        if (showTiling) updateTiling();
        return;
    }
    // Plain click: report the element this face comes from, make it the reference.
    focusKind = 'none'; focusPoint = null;
    selectedFace = idx;
    highlightGroup.clear();
    addFaceHighlight(idx, 0x38bdf8);
    const typeLabel = (wall.kind === 'cone' ? 'stabilizer cone · ' : 'face pairing · ') + classLabel(wall.elem);
    const word = `\\(${formatWordMathJax(wall.word)}\\)`;
    showFaceInfo(
        `<div class="fi-row"><span class="fi-key">Element</span><span>${word}</span></div>` +
        `<div class="fi-type">${typeLabel}</div>` +
        `<div class="fi-matrix">${seitzLatex(wall.elem)}</div>` +
        `<div class="fi-hint">shift-click a neighbour for the edge; click a corner for a vertex</div>`);
    if (showTiling) updateTiling();
}

let pointerDownPos = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('click', (e) => {
    if (animatingIsometry || !cachedDomain) return;
    // Ignore camera drags: only treat near-stationary press/release as a click.
    if (pointerDownPos) {
        const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y;
        if (dx * dx + dy * dy > 36) return;
    }
    // A plain click on (or very near) a domain vertex selects that vertex.
    if (!e.shiftKey) {
        const v = pickVertex(e.clientX, e.clientY);
        if (v) { selectVertex(v); return; }
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const idx = findClickedWall(raycaster.ray);
    if (idx < 0) { clearFaceSelection(); if (showTiling) updateTiling(); return; }
    handleFaceClick(idx, e.shiftKey);
});

// --- UI plumbing ---
let metaHeld = false;   // Cmd/Ctrl held → label generators as inverses (g_i^{-1})

function isoLabel(idx) {
    return `g<sub>${idx + 1}</sub>` + (metaHeld ? '<sup>−1</sup>' : '');
}

function updateIsometryButtons() {
    const c = document.getElementById('isometry-controls');
    if (!c) return;
    c.innerHTML = '';
    currentMatrices.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.dataset.gen = idx;
        btn.innerHTML = isoLabel(idx);
        btn.addEventListener('click', (e) => animateIsometry(idx, e));
        c.appendChild(btn);
    });
}

function refreshIsoLabels() {
    document.querySelectorAll('#isometry-controls .isometry-btn').forEach(btn => {
        btn.innerHTML = isoLabel(parseInt(btn.dataset.gen, 10));
    });
}

function setMetaHeld(v) {
    if (metaHeld === v) return;
    metaHeld = v;
    refreshIsoLabels();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMetaHeld(true); });
document.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMetaHeld(false); });
window.addEventListener('blur', () => setMetaHeld(false));


function refreshFromUI() {
    const errorEl = document.getElementById('matrix-error-message');
    try {
        currentMatrices = getMatricesFromUI();
        currentGenerators = [];
        for (const m of currentMatrices) {
            currentGenerators.push(m);
            currentGenerators.push(m.inv().normalized());
        }
        const wordLengthInput = document.getElementById('wordLength');
        if (wordLengthInput) currentDepth = parseInt(wordLengthInput.value) || 8;

        if (errorEl) errorEl.textContent = '';
        viewIso = Iso.identity();
        cumulativeWord = [];

        updateDomain();
        updateIsometryButtons();
        updateStdGeneratorsList();
        if (cayleyMode !== 'off') updateCayley();
        if (dualMode !== 'off') updateDual();
        if (showTiling) updateTiling();
        if (wallsOpacity > 0) updateWalls();
        runCertifier();
    } catch (e) {
        if (errorEl) errorEl.textContent = e.message;
        console.error('Error parsing matrices:', e);
    }
}

function initUI() {
    setupControlPanel({
        onOpacityChange: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onPolyhedronOpacity: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onWallsOpacity: (o) => {
            wallsOpacity = o;
            wallsGroup.visible = o > 0;
            wallsGroup.children.forEach(ch => { if (ch.material) ch.material.opacity = o * 0.4; });
            if (o > 0 && wallsGroup.children.length === 0) updateWalls();
        },
        onCayleyModeChange: (mode) => {
            cayleyMode = mode;
            cayleyGroup.visible = mode !== 'off';
            if (mode !== 'off') updateCayley();
        },
        onDualModeChange: (mode) => {
            dualMode = mode;
            dualGroup.visible = mode !== 'off';
            const row = document.getElementById('dual-opacity-row');
            if (row) row.classList.toggle('disabled', mode === 'off');
            updateDual();   // clears when off, rebuilds otherwise
        },
        onDualOpacityChange: (o) => {
            dualOpacity = o;
            dualGroup.children.forEach(ch => { if (ch.material) ch.material.opacity = o; });
        },
        onTiedyeToggle: (btn) => {
            showTiedye = !showTiedye;
            material.uniforms.u_showTiling.value = showTiedye;
            updateToggleBtn(btn, showTiedye);
        },
        onAutoRotateToggle: (btn) => {
            controls.autoRotate = !controls.autoRotate;
            updateToggleBtn(btn, controls.autoRotate);
        },
        onResetCamera: (autoRotateBtn) => {
            camera.position.set(2.2, 1.4, 2.2);
            controls.target.set(0, 0, 0);
            controls.autoRotate = false;
            updateToggleBtn(autoRotateBtn, false);
        },
        onFaceCountChange: (count) => {
            currentMaxFaces = count;
            updateDomain();
            updateStdGeneratorsList();
            if (dualMode !== 'off') updateDual();
            if (showTiling) updateTiling();
            runCertifier();
        },
        onWordLengthChange: (depth) => {
            currentDepth = depth;
            updateDomain();
            updateStdGeneratorsList();
            if (cayleyMode !== 'off') updateCayley();
            if (dualMode !== 'off') updateDual();
            if (showTiling) updateTiling();
            if (wallsOpacity > 0) updateWalls();
            runCertifier();
        },
        onPaletteChange: (paletteKey) => {
            const p = colorPalettes[paletteKey];
            material.uniforms.u_colorMode.value = p.mode;
            material.uniforms.u_colorOffset.value.copy(p.offset);
            material.uniforms.u_colorFreq.value = p.freq;
        },
        controls, mesh, cayleyGroup, material
    });

    const mirrorBtn = document.getElementById('toggle-mirror');
    if (mirrorBtn) {
        mirrorBtn.addEventListener('click', () => { if (!mirrorBtn.disabled) setMirrorMode(!mirrorMode); });
    }

    const fullDomainBtn = document.getElementById('toggle-full-domain');
    if (fullDomainBtn) {
        fullDomainBtn.addEventListener('click', () => {
            fullDirichlet = !fullDirichlet;
            updateToggleBtn(fullDomainBtn, fullDirichlet);
            updateDomain();
            updateStdGeneratorsList();
            if (wallsOpacity > 0) updateWalls();
            if (dualMode !== 'off') updateDual();
            if (showTiling) updateTiling();
            runCertifier();
        });
    }

    const tilingBtn = document.getElementById('toggle-tiling');
    if (tilingBtn) {
        tilingBtn.addEventListener('click', () => {
            showTiling = !showTiling;
            updateToggleBtn(tilingBtn, showTiling);
            tilingGroup.visible = showTiling;
            updateTiling();
        });
    }

    const exportBtn = document.getElementById('export-3mf');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (exportBtn.disabled) return;
            const label = exportBtn.textContent;
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting…';
            try {
                // Yield a frame so the button repaints before the mesh build
                await new Promise(r => setTimeout(r, 30));
                const { vertices, triangles } = await exportDomainAs3MF(cachedDomain);
                console.log(`3MF export: ${vertices} vertices, ${triangles} triangles`);
            } catch (e) {
                console.error('3MF export failed:', e);
                setBanner('warning', '3MF export failed: ' + e.message);
            } finally {
                exportBtn.disabled = false;
                exportBtn.textContent = label;
            }
        });
    }
}

function animate(time) {
    requestAnimationFrame(animate);
    controls.update();
    material.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_time.value = time * 0.001;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

initUI();
setupMatrixInput(refreshFromUI);
setTimeout(refreshFromUI, 200);
animate(0);
