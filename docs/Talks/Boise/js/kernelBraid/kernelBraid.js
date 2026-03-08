/**
 * Kernel Braid Visualizer
 *
 * A standalone Three.js scene that renders a long kernel element of the
 * Burau representation of B₄ (the t=2 specialisation).
 * On load the camera starts at the bottom of the braid and smoothly
 * flies upward, revealing the full structure.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================
//  The kernel word
// ============================================================

// t=2 kernel element w2 (length 89 in Birman generators x,X,y,Y)
const BIRMAN_WORD =
    'x Y Y X X Y X Y X X Y X X Y X X Y X Y X X Y X Y X X Y X X Y X Y X X Y X Y X X Y X Y X X Y X Y X X Y X X Y X Y X X Y X Y X X Y X Y X X Y X X Y X Y X X Y X Y X X Y X X Y X X Y X Y X X Y';

// Expand Birman generators to braid generators for B₄:
//   x = σ₁σ₃⁻¹     X = σ₃σ₁⁻¹
//   y = σ₂σ₁σ₃⁻¹σ₂⁻¹   Y = σ₂σ₃σ₁⁻¹σ₂⁻¹
const BIRMAN_MAP = {
    'x': ['s1', 'S3'],
    'X': ['s3', 'S1'],
    'y': ['s2', 's1', 'S3', 'S2'],
    'Y': ['s2', 's3', 'S1', 'S2']
};

function expandWord(birmanWord) {
    const tokens = birmanWord.trim().split(/\s+/);
    const out = [];
    for (const tok of tokens) {
        const block = BIRMAN_MAP[tok];
        if (block) out.push(...block);
    }
    return out;
}

const BRAID_SYMBOLS = expandWord(BIRMAN_WORD);

// ============================================================
//  Braid geometry constants
// ============================================================

const NUM_STRANDS = 4;
const STRAND_SPACING = 0.5;
const STRAND_RADIUS = 0.045;
const CROSSING_LENGTH = 0.8;
const STRAIGHT_LENGTH = 0.15;
const ARC_HEIGHT = 0.22;
const RADIAL_SEGMENTS = 10;

const STRAND_PALETTE = [
    0x00e5ff,   // cyan
    0xb388ff,   // purple
    0x69f0ae,   // green
    0xffab40    // orange
];

// ============================================================
//  Path computation (same logic as braidAnimations.js)
// ============================================================

function parseCrossings(symbols) {
    return symbols.map(sym => {
        const isInverse = sym[0] === 'S';
        const gen = parseInt(sym.replace(/[sS]/, ''));
        return { gen, inverse: isInverse };
    }).filter(c => !isNaN(c.gen));
}

function computeStrandPaths(crossings) {
    const totalWidth = (NUM_STRANDS - 1) * STRAND_SPACING;
    const startX = -totalWidth / 2;
    const totalLen = STRAIGHT_LENGTH + crossings.length * (CROSSING_LENGTH + STRAIGHT_LENGTH);
    const botY = -totalLen / 2;

    const perm = Array.from({ length: NUM_STRANDS }, (_, i) => i);
    const paths = Array.from({ length: NUM_STRANDS }, () => []);
    const xPos = Array.from({ length: NUM_STRANDS }, (_, i) => startX + i * STRAND_SPACING);

    let y = botY;

    // Bottom anchors
    for (let p = 0; p < NUM_STRANDS; p++) paths[perm[p]].push(new THREE.Vector3(xPos[p], y, 0));

    for (const { gen, inverse } of crossings) {
        const p1 = gen - 1, p2 = gen;

        y += STRAIGHT_LENGTH;
        for (let p = 0; p < NUM_STRANDS; p++) paths[perm[p]].push(new THREE.Vector3(xPos[p], y, 0));

        const s1 = perm[p1], s2 = perm[p2];
        const x1 = xPos[p1], x2 = xPos[p2];
        const over = inverse ? s2 : s1;
        const under = inverse ? s1 : s2;
        const midY = y + CROSSING_LENGTH / 2;
        const topY = y + CROSSING_LENGTH;

        for (let p = 0; p < NUM_STRANDS; p++) {
            if (p === p1 || p === p2) continue;
            paths[perm[p]].push(new THREE.Vector3(xPos[p], midY, 0));
            paths[perm[p]].push(new THREE.Vector3(xPos[p], topY, 0));
        }

        paths[over].push(new THREE.Vector3((x1 + x2) / 2, midY, ARC_HEIGHT));
        paths[over].push(new THREE.Vector3(over === s1 ? x2 : x1, topY, 0));

        paths[under].push(new THREE.Vector3((x1 + x2) / 2, midY, -ARC_HEIGHT));
        paths[under].push(new THREE.Vector3(under === s1 ? x2 : x1, topY, 0));

        y = topY;
        perm[p1] = s2;
        perm[p2] = s1;
    }

    y += STRAIGHT_LENGTH;
    for (let p = 0; p < NUM_STRANDS; p++) paths[perm[p]].push(new THREE.Vector3(xPos[p], y, 0));

    return { paths, totalLength: totalLen };
}

// ============================================================
//  Scene setup
// ============================================================

const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0a0a0f, 1);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// No fog — we need the braid visible at all zoom levels

// Camera
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 800);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.65));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(4, 10, 6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.35);
fillLight.position.set(-3, -5, -3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xff8844, 0.2);
rimLight.position.set(0, 0, -5);
scene.add(rimLight);

// Controls (available after fly-through)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = 1.2;
controls.minDistance = 1;
controls.maxDistance = 300;
controls.enabled = false; // disabled during fly-through

// ============================================================
//  Build the braid geometry
// ============================================================

const loadingFill = document.getElementById('loading-fill');
const loadingEl = document.getElementById('loading');
const hudWord = document.getElementById('hud-word');

// Show the word in the HUD
const displayWord = BRAID_SYMBOLS.map(s => {
    const inv = s[0] === 'S';
    const idx = s.replace(/[sS]/, '');
    return inv ? `σ${idx}⁻¹` : `σ${idx}`;
}).join(' · ');
hudWord.textContent = displayWord;

// Parse and compute
const crossings = parseCrossings(BRAID_SYMBOLS);
loadingFill.style.width = '30%';

const { paths, totalLength } = computeStrandPaths(crossings);
loadingFill.style.width = '50%';

// Build tube meshes
const strandMeshes = [];
for (let i = 0; i < NUM_STRANDS; i++) {
    const pts = paths[i];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const tubeSegments = Math.min(2048, Math.max(256, pts.length * 2));
    const geometry = new THREE.TubeGeometry(curve, tubeSegments, STRAND_RADIUS, RADIAL_SEGMENTS, false);

    const color = STRAND_PALETTE[i % STRAND_PALETTE.length];
    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.18,
        metalness: 0.55,
        roughness: 0.28,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    strandMeshes.push(mesh);

    loadingFill.style.width = `${50 + (i + 1) / NUM_STRANDS * 30}%`;
}

// Endpoint spheres
const sphereGeo = new THREE.SphereGeometry(STRAND_RADIUS * 2.2, 16, 16);
const totalWidth = (NUM_STRANDS - 1) * STRAND_SPACING;
const startX = -totalWidth / 2;

for (let i = 0; i < NUM_STRANDS; i++) {
    const color = STRAND_PALETTE[i % STRAND_PALETTE.length];
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.5,
        metalness: 0.3, roughness: 0.4
    });

    // Bottom endpoint
    const bot = new THREE.Mesh(sphereGeo.clone(), mat.clone());
    bot.position.set(startX + i * STRAND_SPACING, -totalLength / 2, 0);
    scene.add(bot);

    // Top endpoint
    const top = new THREE.Mesh(sphereGeo.clone(), mat.clone());
    top.position.set(startX + i * STRAND_SPACING, totalLength / 2, 0);
    scene.add(top);
}

// Faint vertical guide lines
const guideGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -totalLength / 2 - 1, 0),
    new THREE.Vector3(0, totalLength / 2 + 1, 0)
]);
const guideMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.03 });
scene.add(new THREE.Line(guideGeo, guideMat));

loadingFill.style.width = '100%';

// ============================================================
//  Camera fly-through animation  (two phases)
//
//  Phase 1 — SCAN:  Camera sits close to the braid and pans
//            upward from bottom to top, showing the crossings
//            scrolling past.
//  Phase 2 — ZOOM OUT:  From the top, the camera pulls back
//            until the full braid fits on screen.
// ============================================================

const bottomY = -totalLength / 2;
const topY = totalLength / 2;

// How close the camera sits during the upward scan.
// We want roughly 8 crossings visible at a time.
const visibleHeight = 8 * (CROSSING_LENGTH + STRAIGHT_LENGTH);
const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);
const scanZ = (visibleHeight / 2) / Math.tan(halfFovRad);

// Final pull-back distance to see everything
const vertFov = THREE.MathUtils.degToRad(camera.fov);
const horizFov = 2 * Math.atan(Math.tan(vertFov / 2) * camera.aspect);
const fitHeight = (totalLength / 2 * 1.15) / Math.tan(vertFov / 2);
const fitWidth = ((NUM_STRANDS * STRAND_SPACING) / 2 * 1.3) / Math.tan(horizFov / 2);
const finalDistance = Math.max(4, fitHeight, fitWidth);

// Timing
const SCAN_DURATION = 20000;   // ms — bottom-to-top pan
const ZOOM_DURATION = 3000;    // ms — pull-back to full view

// Initial camera state
camera.position.set(0, bottomY, scanZ);
camera.far = Math.max(800, totalLength * 3, finalDistance * 4);
camera.updateProjectionMatrix();
controls.target.set(0, bottomY, 0);
camera.lookAt(controls.target);

let flyStartTime = null;
let flyComplete = false;
let paused = false;
let pausedElapsed = 0;

function resetFlyThrough() {
    flyStartTime = performance.now();
    flyComplete = false;
    paused = false;
    pausedElapsed = 0;
    controls.enabled = false;
    camera.position.set(0, bottomY, scanZ);
    controls.target.set(0, bottomY, 0);
    camera.lookAt(controls.target);
    // Re-show loading briefly
    loadingEl.style.display = 'flex';
    loadingEl.classList.remove('fade-out');
    loadingFill.style.width = '100%';
    setTimeout(() => {
        loadingEl.classList.add('fade-out');
        setTimeout(() => loadingEl.style.display = 'none', 900);
    }, 300);
}

// Listen for messages from the parent presentation
window.addEventListener('message', (e) => {
    const msg = (typeof e.data === 'string') ? e.data : '';
    if (msg === 'play' || msg === 'reset') {
        resetFlyThrough();
    } else if (msg === 'toggle') {
        if (!flyComplete) {
            paused = !paused;
            if (!paused && flyStartTime) {
                // Resume: adjust flyStartTime so elapsed stays correct
                flyStartTime = performance.now() - pausedElapsed;
            }
        }
    }
});

function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// A gentler ease for the scan (mostly linear with soft start/end)
function easeScan(t) {
    // quintic smoothstep — almost linear in the middle, gentle at edges
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// Dismiss loading screen
setTimeout(() => {
    loadingEl.classList.add('fade-out');
    flyStartTime = performance.now();
    setTimeout(() => loadingEl.style.display = 'none', 900);
}, 400);

// ============================================================
//  Render loop
// ============================================================

function animate() {
    requestAnimationFrame(animate);

    if (flyStartTime && !flyComplete && !paused) {
        const elapsed = performance.now() - flyStartTime;
        pausedElapsed = elapsed;

        if (elapsed < SCAN_DURATION) {
            // ── Phase 1: upward scan ──
            const t = easeScan(Math.min(elapsed / SCAN_DURATION, 1));
            const camY = bottomY + (topY - bottomY) * t;

            camera.position.set(0, camY, scanZ);
            controls.target.set(0, camY, 0);
            camera.lookAt(controls.target);

        } else {
            // ── Phase 2: zoom out from top ──
            const t2 = Math.min((elapsed - SCAN_DURATION) / ZOOM_DURATION, 1);
            const e = easeInOut(t2);

            // Interpolate from (top, scanZ) to (center, finalDistance)
            const camY = topY + (0 - topY) * e;
            const camZ = scanZ + (finalDistance - scanZ) * e;

            camera.position.set(0, camY, camZ);
            controls.target.set(0, 0, 0);
            camera.lookAt(controls.target);

            if (t2 >= 1) {
                flyComplete = true;
                controls.enabled = true;
                controls.target.set(0, 0, 0);
                camera.position.set(0, 0, finalDistance);
                controls.maxDistance = Math.max(300, finalDistance * 4);
                controls.update();
            }
        }
    }

    if (flyComplete) {
        controls.update();
    }

    // Keep the key light near the camera so the braid stays lit at any distance
    keyLight.position.copy(camera.position).add(new THREE.Vector3(2, 3, 2));
    fillLight.position.copy(camera.position).add(new THREE.Vector3(-2, -1, -2));

    renderer.render(scene, camera);
}

animate();

// ============================================================
//  Resize handling
// ============================================================

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
