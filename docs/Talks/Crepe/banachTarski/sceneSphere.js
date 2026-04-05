import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { C } from './config.js';

// ═══════════════════════════════════════════════════════════
// ROTATION MATRICES
// ═══════════════════════════════════════════════════════════

// Cube symmetry generators
// α = 90° rotation around z-axis
const MAT_ALPHA = new THREE.Matrix4().set(
    0,-1, 0, 0,
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
);
// β = cyclic permutation (x,y,z)→(z,x,y), 120° around (1,1,1)
const MAT_BETA = new THREE.Matrix4().set(
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1
);

const QUAT_ALPHA = new THREE.Quaternion().setFromRotationMatrix(MAT_ALPHA);
const QUAT_ALPHA_INV = QUAT_ALPHA.clone().invert();
const QUAT_BETA = new THREE.Quaternion().setFromRotationMatrix(MAT_BETA);
const QUAT_BETA_INV = QUAT_BETA.clone().invert();

// Banach–Tarski generators (free group F₂)
// a = 1/3 [[1,2,2],[2,1,-2],[-2,2,-1]]
// b = 1/3 [[1,-2,-2],[-2,1,-2],[2,2,-1]]
const MAT_A = new THREE.Matrix4().set(
    1/3,  2/3,  2/3, 0,
    2/3,  1/3, -2/3, 0,
   -2/3,  2/3, -1/3, 0,
      0,    0,    0, 1
);
const MAT_B = new THREE.Matrix4().set(
    1/3, -2/3, -2/3, 0,
   -2/3,  1/3, -2/3, 0,
    2/3,  2/3, -1/3, 0,
      0,    0,    0, 1
);

const QUAT_A = new THREE.Quaternion().setFromRotationMatrix(MAT_A);
const QUAT_A_INV = QUAT_A.clone().invert();
const QUAT_B = new THREE.Quaternion().setFromRotationMatrix(MAT_B);
const QUAT_B_INV = QUAT_B.clone().invert();

const GENERATORS = {
    alpha:    { quat: QUAT_ALPHA,     label: 'α',   inverse: 'alphaInv' },
    alphaInv: { quat: QUAT_ALPHA_INV, label: 'α⁻¹', inverse: 'alpha' },
    beta:     { quat: QUAT_BETA,      label: 'β',   inverse: 'betaInv' },
    betaInv:  { quat: QUAT_BETA_INV,  label: 'β⁻¹', inverse: 'beta' },
    a:    { quat: QUAT_A,     label: 'a',   inverse: 'aInv' },
    aInv: { quat: QUAT_A_INV, label: 'a⁻¹', inverse: 'a' },
    b:    { quat: QUAT_B,     label: 'b',   inverse: 'bInv' },
    bInv: { quat: QUAT_B_INV, label: 'b⁻¹', inverse: 'b' },
};

const GEN_COLORS = {
    alpha: 0xf59e0b, alphaInv: 0xf59e0b,
    beta: 0x7c8aff, betaInv: 0x7c8aff,
    a: 0x2dd4bf, aInv: 0x2dd4bf,
    b: 0xf472b6, bInv: 0xf472b6,
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let scene, camera, renderer, controls, sphereGroup;
let container, initialized = false;
let animating = false, animStartTime, quatFrom, quatTo;
const ANIM_DUR = 800;
let wordStack = [];
let onWordChange = null;

// Axis visualization state
let axisVizGroup, arcLine, arrowCone;
let currentRotViz = null;
let vizFading = false, vizFadeStart = 0;
const ARC_SEGS = 64;
const ARC_R = 0.28;       // tight arc radius
const ARC_OFFSET = 1.5;   // distance above sphere along axis

// Persistent generator axis lines
let cubeAxesGroup, freeAxesGroup;

const MARKERS = [
    { pos: [1, 0, 0],  color: 0xff4455 },
    { pos: [-1, 0, 0], color: 0xff8844 },
    { pos: [0, 1, 0],  color: 0x44dd66 },
    { pos: [0, -1, 0], color: 0xdddd44 },
    { pos: [0, 0, 1],  color: 0x4488ff },
    { pos: [0, 0, -1], color: 0xbb55ff },
];

function easeInOutCubic(x) {
    return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2;
}

// ═══════════════════════════════════════════════════════════
// AXIS VISUALIZATION HELPERS
// ═══════════════════════════════════════════════════════════
function getAxisAngle(quat) {
    let w = quat.w, x = quat.x, y = quat.y, z = quat.z;
    if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
    const halfAngle = Math.acos(Math.min(1, w));
    const sinHalf = Math.sin(halfAngle);
    if (sinHalf < 0.0001) return null;
    return {
        axis: new THREE.Vector3(x/sinHalf, y/sinHalf, z/sinHalf).normalize(),
        angle: 2 * halfAngle,
    };
}

// ── Persistent generator axes ──
function makeAxisLine(axis, color) {
    const ext = 1.8;
    const pts = [
        new THREE.Vector3(-axis.x*ext, -axis.y*ext, -axis.z*ext),
        new THREE.Vector3( axis.x*ext,  axis.y*ext,  axis.z*ext),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25 });
    return new THREE.Line(geo, mat);
}

function buildPersistentAxes() {
    // Cube generators: α around z, β around (1,1,1)/√3
    cubeAxesGroup = new THREE.Group();
    cubeAxesGroup.visible = false;
    const alphaAxis = new THREE.Vector3(0, 0, 1);
    const betaInfo = getAxisAngle(QUAT_BETA);
    cubeAxesGroup.add(makeAxisLine(alphaAxis, 0xf59e0b));
    if (betaInfo) cubeAxesGroup.add(makeAxisLine(betaInfo.axis, 0x7c8aff));
    scene.add(cubeAxesGroup);

    // Free group generators: a, b
    freeAxesGroup = new THREE.Group();
    freeAxesGroup.visible = false;
    const aInfo = getAxisAngle(QUAT_A);
    const bInfo = getAxisAngle(QUAT_B);
    if (aInfo) freeAxesGroup.add(makeAxisLine(aInfo.axis, 0x2dd4bf));
    if (bInfo) freeAxesGroup.add(makeAxisLine(bInfo.axis, 0xf472b6));
    scene.add(freeAxesGroup);
}

// ── Animation arc + arrowhead ──
function setupAxisViz() {
    axisVizGroup = new THREE.Group();
    axisVizGroup.visible = false;
    scene.add(axisVizGroup);

    // Arc sweep
    const arcGeo = new THREE.BufferGeometry();
    arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((ARC_SEGS+1)*3), 3));
    arcGeo.setDrawRange(0, 0);
    arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
    }));
    axisVizGroup.add(arcLine);

    // Arrowhead cone (smaller for tight arc)
    const coneGeo = new THREE.ConeGeometry(0.035, 0.09, 8);
    arrowCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9,
    }));
    arrowCone.visible = false;
    axisVizGroup.add(arrowCone);
}

function startAxisViz(genKey) {
    const info = getAxisAngle(GENERATORS[genKey].quat);
    if (!info) return;

    const { axis, angle } = info;

    // Perpendicular frame
    const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    const u = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();

    // Arc center: above the sphere along the axis
    const center = axis.clone().multiplyScalar(ARC_OFFSET);

    const color = GEN_COLORS[genKey];
    arcLine.material.color.setHex(color);
    arcLine.material.opacity = 0.85;
    arrowCone.material.color.setHex(color);
    arrowCone.material.opacity = 0.9;
    arrowCone.visible = false;

    currentRotViz = { axis, angle, u, v, center };
    axisVizGroup.visible = true;
    vizFading = false;
}

function updateArcViz(progress) {
    if (!currentRotViz) return;
    const { angle, u, v, center } = currentRotViz;
    const swept = angle * progress;
    const n = Math.max(2, Math.round(Math.abs(progress) * ARC_SEGS));
    const positions = arcLine.geometry.attributes.position.array;

    for (let i = 0; i <= n; i++) {
        const t = (i / n) * swept;
        positions[i*3]   = center.x + ARC_R * (Math.cos(t)*u.x + Math.sin(t)*v.x);
        positions[i*3+1] = center.y + ARC_R * (Math.cos(t)*u.y + Math.sin(t)*v.y);
        positions[i*3+2] = center.z + ARC_R * (Math.cos(t)*u.z + Math.sin(t)*v.z);
    }
    arcLine.geometry.attributes.position.needsUpdate = true;
    arcLine.geometry.setDrawRange(0, n + 1);

    // Arrowhead at arc tip, oriented along tangent
    if (progress > 0.05) {
        arrowCone.visible = true;
        const endT = swept;
        arrowCone.position.set(
            center.x + ARC_R * (Math.cos(endT)*u.x + Math.sin(endT)*v.x),
            center.y + ARC_R * (Math.cos(endT)*u.y + Math.sin(endT)*v.y),
            center.z + ARC_R * (Math.cos(endT)*u.z + Math.sin(endT)*v.z),
        );
        const tangent = new THREE.Vector3(
            -Math.sin(endT)*u.x + Math.cos(endT)*v.x,
            -Math.sin(endT)*u.y + Math.cos(endT)*v.y,
            -Math.sin(endT)*u.z + Math.cos(endT)*v.z,
        ).normalize();
        arrowCone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), tangent);
    }
}

function fadeAxisViz() {
    vizFading = true;
    vizFadeStart = performance.now();
}

function tickAxisFade() {
    if (!vizFading || !axisVizGroup) return;
    const p = (performance.now() - vizFadeStart) / 500;
    if (p >= 1) {
        axisVizGroup.visible = false;
        vizFading = false;
        currentRotViz = null;
    } else {
        const a = 1 - p;
        arcLine.material.opacity = 0.85 * a;
        arrowCone.material.opacity = 0.9 * a;
    }
}

// ═══════════════════════════════════════════════════════════
// BUILD SCENE
// ═══════════════════════════════════════════════════════════
export function initSphere(containerEl, wordCallback) {
    if (initialized) return;
    container = containerEl;
    onWordChange = wordCallback;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(1.8, 1.4, 3.2);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x060a14, 1);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 8;

    // ── Rotatable group ──
    sphereGroup = new THREE.Group();
    scene.add(sphereGroup);

    // Main sphere
    const sphereGeo = new THREE.SphereGeometry(1, 64, 64);
    const sphereMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a2444, metalness: 0.1, roughness: 0.3,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    sphereGroup.add(new THREE.Mesh(sphereGeo, sphereMat));

    // Wireframe
    const wireGeo = new THREE.SphereGeometry(1.003, 24, 12);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x7c8aff, wireframe: true, transparent: true, opacity: 0.06,
    });
    sphereGroup.add(new THREE.Mesh(wireGeo, wireMat));

    addGridRings(sphereGroup);

    // Coordinate axis lines through sphere
    const axisData = [
        { dir: [1.3,0,0], color: 0xff4455 },
        { dir: [0,1.3,0], color: 0x44dd66 },
        { dir: [0,0,1.3], color: 0x4488ff },
    ];
    for (const { dir, color } of axisData) {
        const pts = [
            new THREE.Vector3(-dir[0],-dir[1],-dir[2]),
            new THREE.Vector3(dir[0],dir[1],dir[2]),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
        sphereGroup.add(new THREE.Line(geo, mat));
    }

    // Markers at axis endpoints
    for (const { pos, color } of MARKERS) {
        const geo = new THREE.SphereGeometry(0.055, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.5,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(...pos);
        sphereGroup.add(m);
    }

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(3, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x7c8aff, 0.3);
    fill.position.set(-3, -2, 3); scene.add(fill);

    // ── Persistent generator axes + animation overlay ──
    buildPersistentAxes();
    setupAxisViz();

    initialized = true;
    resizeSphere();
}

function addGridRings(group) {
    const mat = new THREE.LineBasicMaterial({ color: 0x7c8aff, transparent: true, opacity: 0.12 });
    for (let lat = -60; lat <= 60; lat += 30) {
        const theta = (lat * Math.PI) / 180;
        const r = Math.cos(theta), y = Math.sin(theta);
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const phi = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi)));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
    for (let lon = 0; lon < 180; lon += 30) {
        const phi = (lon * Math.PI) / 180;
        const pts = [];
        for (let i = 0; i <= 64; i++) {
            const th = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(th)*Math.cos(phi), Math.sin(th), Math.cos(th)*Math.sin(phi)));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════
export function resizeSphere() {
    if (!renderer || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
}

export function applyRotation(which) {
    if (animating) return;
    const gen = GENERATORS[which];
    if (!gen) return;

    if (wordStack.length > 0 && wordStack[wordStack.length - 1] === gen.inverse) {
        wordStack.pop();
    } else {
        wordStack.push(which);
    }

    quatFrom = sphereGroup.quaternion.clone();
    quatTo = new THREE.Quaternion().multiplyQuaternions(gen.quat, quatFrom);
    animating = true;
    animStartTime = performance.now();

    startAxisViz(which);

    if (onWordChange) onWordChange(getWordString());
}

export function resetSphere() {
    if (animating) return;
    wordStack = [];
    quatFrom = sphereGroup.quaternion.clone();
    quatTo = new THREE.Quaternion();
    animating = true;
    animStartTime = performance.now();
    if (onWordChange) onWordChange(getWordString());
}

export function getWordString() {
    if (wordStack.length === 0) return 'e';
    return wordStack.map(w => GENERATORS[w].label).join('');
}

export function tickSphere() {
    if (!renderer) return;

    if (animating) {
        const raw = Math.min(1, (performance.now() - animStartTime) / ANIM_DUR);
        const t = easeInOutCubic(raw);
        sphereGroup.quaternion.slerpQuaternions(quatFrom, quatTo, t);
        updateArcViz(t);
        if (raw >= 1) {
            sphereGroup.quaternion.copy(quatTo);
            sphereGroup.quaternion.normalize();
            animating = false;
            fadeAxisViz();
        }
    }

    tickAxisFade();
    controls.update();
    renderer.render(scene, camera);
}

export function isInitialized() { return initialized; }

export function showGeneratorAxes(set) {
    if (cubeAxesGroup) cubeAxesGroup.visible = set === 'cube';
    if (freeAxesGroup) freeAxesGroup.visible = set === 'free';
}
