// Xia's Theorem (1992) — five-body non-collision singularity.
//
// Configuration: two binary pairs above and below z=0, counter-rotating, with a
// fifth oscillator on the z-axis. The oscillator slingshots back and forth
// between the binaries; in the exact (unsoftened) Newtonian system the cycle
// time decreases geometrically and all five bodies escape to infinity in finite
// time. Here we use Plummer softening so the simulation stays well-defined,
// which captures the qualitative "shooting around" behavior without the actual
// finite-time singularity.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─────────────────────────── Three.js setup ───────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x02030a, 0.012);

const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 2000
);
camera.position.set(9, 5, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2;
controls.maxDistance = 200;

// Postprocessing — bloom for glow.
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85,   // strength
    0.55,   // radius
    0.05    // threshold
);
composer.addPass(bloomPass);
const outputPass = new OutputPass();
composer.addPass(outputPass);

// Starfield backdrop.
function makeStars(count = 1500) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Sample on a large sphere
        const r = 400 + Math.random() * 200;
        const phi = Math.random() * Math.PI * 2;
        const cosTheta = Math.random() * 2 - 1;
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        positions[3 * i] = r * sinTheta * Math.cos(phi);
        positions[3 * i + 1] = r * cosTheta;
        positions[3 * i + 2] = r * sinTheta * Math.sin(phi);
        const tint = 0.6 + Math.random() * 0.4;
        const warm = Math.random();
        colors[3 * i] = tint * (0.85 + 0.15 * warm);
        colors[3 * i + 1] = tint * 0.92;
        colors[3 * i + 2] = tint * (1.0 - 0.1 * warm);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 1.4,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
    });
    return new THREE.Points(geo, mat);
}
scene.add(makeStars());

// ─────────────────────────── Physics state ───────────────────────────
const N = 5;
const G = 1.0;
let SOFT = 0.005;         // Plummer softening length — tiny by default so
                          // close encounters can actually slingshot. The
                          // adaptive timestep below keeps Verlet stable
                          // through them.

// Body palette (also drives trail/halo color).
const colorHex = [0xff5577, 0x55aaff, 0xff9944, 0x44ddaa, 0xffee66];
const colors = colorHex.map(c => new THREE.Color(c));

// Defaults; reset() rebuilds these.
const masses = new Array(N).fill(1);
const positions = Array.from({ length: N }, () => [0, 0, 0]);
const velocities = Array.from({ length: N }, () => [0, 0, 0]);
const accelA = Array.from({ length: N }, () => [0, 0, 0]);
const accelB = Array.from({ length: N }, () => [0, 0, 0]);

// Tunables driven by UI.
let centralMass = 0.5;
let initialKick = 1.8;
let timeSpeed = 1.0;
let running = true;
let trailLen = 600;
let autoOrbit = false;
let followCom = true;
let autoZoom = true;
let bloomEnabled = true;
let simTime = 0;

// Initial-condition factory. We use:
//   bodies 0,1 = upper binary  (asymmetric mass ratio within the pair)
//   bodies 2,3 = lower binary  (mirror image, counter-rotating)
//   body  4    = oscillator launched off-axis so it slingshots ONE body of
//                each binary on every pass — the actual Xia mechanism. With
//                a clean on-axis launch the oscillator just sees the binary
//                COM and no slingshot pumping happens.
function reset() {
    const D = 2.0;          // half-distance between binary pairs
    const r = 0.45;         // binary half-separation
    const m1 = 2.0, m2 = 0.6;   // strongly asymmetric binary masses
    masses[0] = m1; masses[1] = m2;
    masses[2] = m1; masses[3] = m2;
    masses[4] = centralMass;

    // Each binary orbits its own center of mass. Using G=1:
    //   relative orbit: μ = m1 + m2, separation 2r
    //   for circular orbit, v_rel = sqrt(G·μ / (2r))
    //   v1 = (m2/μ)·v_rel,   v2 = (m1/μ)·v_rel  (opposing)
    const sep = 2 * r;
    const muBin = m1 + m2;
    const vRel = Math.sqrt(G * muBin / sep);
    const v1 = (m2 / muBin) * vRel;
    const v2 = (m1 / muBin) * vRel;

    // Heavy body sits closer to the binary COM, light body further out.
    const xHeavy = +(m2 / muBin) * sep;
    const xLight = -(m1 / muBin) * sep;

    // Upper binary in plane z = +D, COM at (0,0,+D), motion in y.
    positions[0] = [xHeavy, 0, +D];
    positions[1] = [xLight, 0, +D];
    velocities[0] = [0, +v1, 0];
    velocities[1] = [0, -v2, 0];

    // Lower binary in plane z = -D — counter-rotating mirror image.
    positions[2] = [xHeavy, 0, -D];
    positions[3] = [xLight, 0, -D];
    velocities[2] = [0, -v1, 0];
    velocities[3] = [0, +v2, 0];

    // Oscillator OFFSET in +x so it dives close to the *light* body of the
    // upper binary at one phase, then close to the light body of the lower
    // binary half a period later. This breaks the z-axis symmetry that
    // would otherwise zero out all slingshot effects.
    const xOff = xLight + 0.05;   // grazes the light body's orbital ring
    positions[4] = [xOff, 0, 0];
    velocities[4] = [0, 0, initialKick];

    // Cancel net linear momentum so the COM stays put.
    let pX = 0, pY = 0, pZ = 0, mTot = 0;
    for (let i = 0; i < N; i++) {
        pX += masses[i] * velocities[i][0];
        pY += masses[i] * velocities[i][1];
        pZ += masses[i] * velocities[i][2];
        mTot += masses[i];
    }
    for (let i = 0; i < N; i++) {
        velocities[i][0] -= pX / mTot;
        velocities[i][1] -= pY / mTot;
        velocities[i][2] -= pZ / mTot;
    }

    simTime = 0;
    peakSpeedEver = 0;
    lastDt = 0;

    // Snap camera tracking back to the new COM so the view doesn't drift
    // for several seconds after a reset.
    let _cx = 0, _cy = 0, _cz = 0, _mTot = 0;
    for (let i = 0; i < N; i++) {
        _cx += masses[i] * positions[i][0];
        _cy += masses[i] * positions[i][1];
        _cz += masses[i] * positions[i][2];
        _mTot += masses[i];
    }
    comSmoothed.set(_cx / _mTot, _cy / _mTot, _cz / _mTot);
    comTarget.copy(comSmoothed);
    controls.target.copy(comSmoothed);
    cameraDistSmoothed = 14;
    // Place camera at a clean default angle relative to the new target.
    camera.position.set(_cx / _mTot + 9, _cy / _mTot + 5, _cz / _mTot + 12);

    // Reset visual trails to current positions.
    for (let i = 0; i < N; i++) {
        const arr = trailBuffers[i].positions;
        for (let j = 0; j < arr.length; j += 3) {
            arr[j] = positions[i][0];
            arr[j + 1] = positions[i][1];
            arr[j + 2] = positions[i][2];
        }
        trails[i].geometry.attributes.position.needsUpdate = true;
        trails[i].geometry.computeBoundingSphere();
    }

    // Resize body meshes to reflect current masses.
    for (let i = 0; i < N; i++) {
        const r = 0.10 + Math.cbrt(masses[i]) * 0.13;
        bodyMeshes[i].scale.setScalar(r);
        haloSprites[i].scale.set(r * 7.5, r * 7.5, 1);
    }
}

// Pairwise softened gravity. Writes accelerations into `out`.
function computeAccelerations(out) {
    for (let i = 0; i < N; i++) {
        out[i][0] = 0; out[i][1] = 0; out[i][2] = 0;
    }
    const eps2 = SOFT * SOFT;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const dx = positions[j][0] - positions[i][0];
            const dy = positions[j][1] - positions[i][1];
            const dz = positions[j][2] - positions[i][2];
            const r2 = dx * dx + dy * dy + dz * dz + eps2;
            const invR = 1 / Math.sqrt(r2);
            const invR3 = invR * invR * invR;
            const fx = G * dx * invR3;
            const fy = G * dy * invR3;
            const fz = G * dz * invR3;
            out[i][0] += masses[j] * fx;
            out[i][1] += masses[j] * fy;
            out[i][2] += masses[j] * fz;
            out[j][0] -= masses[i] * fx;
            out[j][1] -= masses[i] * fy;
            out[j][2] -= masses[i] * fz;
        }
    }
}

// One velocity-Verlet step (symplectic).
function stepVerlet(dt) {
    computeAccelerations(accelA);
    for (let i = 0; i < N; i++) {
        velocities[i][0] += 0.5 * dt * accelA[i][0];
        velocities[i][1] += 0.5 * dt * accelA[i][1];
        velocities[i][2] += 0.5 * dt * accelA[i][2];
        positions[i][0] += dt * velocities[i][0];
        positions[i][1] += dt * velocities[i][1];
        positions[i][2] += dt * velocities[i][2];
    }
    computeAccelerations(accelB);
    for (let i = 0; i < N; i++) {
        velocities[i][0] += 0.5 * dt * accelB[i][0];
        velocities[i][1] += 0.5 * dt * accelB[i][1];
        velocities[i][2] += 0.5 * dt * accelB[i][2];
    }
}

// Adaptive timestep: shortest free-fall time across all pairs, scaled by an
// accuracy factor. Crucial for resolving close approaches without softening.
function adaptiveDt(maxDt) {
    const eps2 = SOFT * SOFT;
    let dtMin = maxDt;
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const dx = positions[j][0] - positions[i][0];
            const dy = positions[j][1] - positions[i][1];
            const dz = positions[j][2] - positions[i][2];
            const r2 = dx * dx + dy * dy + dz * dz + eps2;
            const r = Math.sqrt(r2);
            // Free-fall timescale: ~ sqrt(r^3 / (G·M_pair))
            const tff = Math.sqrt(r2 * r / (G * (masses[i] + masses[j])));
            if (tff < dtMin) dtMin = tff;
        }
    }
    // η = 0.015 → about 60+ substeps over the closest free-fall time
    return Math.max(1e-6, 0.015 * dtMin);
}

function maxBodySpeed() {
    let vMax = 0;
    for (let i = 0; i < N; i++) {
        const v = velocities[i];
        const s = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (s > vMax) vMax = s;
    }
    return vMax;
}

function systemExtent() {
    // Mass-weighted RMS distance from COM — proxy for system size.
    let cx = 0, cy = 0, cz = 0, mTot = 0;
    for (let i = 0; i < N; i++) {
        cx += masses[i] * positions[i][0];
        cy += masses[i] * positions[i][1];
        cz += masses[i] * positions[i][2];
        mTot += masses[i];
    }
    cx /= mTot; cy /= mTot; cz /= mTot;
    let rMax = 0;
    for (let i = 0; i < N; i++) {
        const dx = positions[i][0] - cx;
        const dy = positions[i][1] - cy;
        const dz = positions[i][2] - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > rMax) rMax = d;
    }
    return rMax;
}

function totalEnergy() {
    let ke = 0, pe = 0;
    const eps2 = SOFT * SOFT;
    for (let i = 0; i < N; i++) {
        const v = velocities[i];
        ke += 0.5 * masses[i] * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        for (let j = i + 1; j < N; j++) {
            const dx = positions[j][0] - positions[i][0];
            const dy = positions[j][1] - positions[i][1];
            const dz = positions[j][2] - positions[i][2];
            pe -= G * masses[i] * masses[j] / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
        }
    }
    return ke + pe;
}

// ─────────────────────────── Visual bodies ───────────────────────────
const bodyMeshes = [];
const haloSprites = [];

// Generate a soft circular halo texture once.
function makeHaloTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const haloTex = makeHaloTexture();

for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshStandardMaterial({
        color: colors[i],
        emissive: colors[i],
        emissiveIntensity: 1.6,
        roughness: 0.4,
        metalness: 0.0,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), mat);
    scene.add(mesh);
    bodyMeshes.push(mesh);

    const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        color: colors[i],
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.85,
    });
    const halo = new THREE.Sprite(haloMat);
    scene.add(halo);
    haloSprites.push(halo);
}

// Subtle ambient + key light so spheres aren't pure flat color.
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const keyLight = new THREE.PointLight(0xffffff, 1.0, 0, 1.5);
keyLight.position.set(0, 0, 0);
scene.add(keyLight);

// ─────────────────────────── Trails ───────────────────────────
const MAX_TRAIL = 1500;
const trails = [];
const trailBuffers = [];

for (let i = 0; i < N; i++) {
    const positionsArr = new Float32Array(MAX_TRAIL * 3);
    const colorsArr = new Float32Array(MAX_TRAIL * 3);
    const c = colors[i];
    for (let j = 0; j < MAX_TRAIL; j++) {
        // Fade from full intensity at head to zero at tail.
        const t = 1 - j / (MAX_TRAIL - 1);
        const fade = t * t;
        colorsArr[3 * j] = c.r * fade;
        colorsArr[3 * j + 1] = c.g * fade;
        colorsArr[3 * j + 2] = c.b * fade;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));
    geo.setDrawRange(0, trailLen);
    const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    trails.push(line);
    trailBuffers.push({ positions: positionsArr, colors: colorsArr });
}

function pushTrail(i) {
    const arr = trailBuffers[i].positions;
    // Shift all points one slot toward the tail.
    arr.copyWithin(3, 0, (MAX_TRAIL - 1) * 3);
    arr[0] = positions[i][0];
    arr[1] = positions[i][1];
    arr[2] = positions[i][2];
    trails[i].geometry.attributes.position.needsUpdate = true;
}

// ─────────────────────────── UI binding ───────────────────────────
const $ = id => document.getElementById(id);

const playPauseEl = $('playPause');
const speedEl = $('speedSlider');
const speedVal = $('speedValue');
const softEl = $('softSlider');
const softVal = $('softValue');
const centralEl = $('centralMass');
const centralVal = $('centralValue');
const kickEl = $('kickSlider');
const kickVal = $('kickValue');
const trailEl = $('trailLen');
const trailVal = $('trailValue');
const autoOrbitEl = $('autoOrbit');
const followComEl = $('followCom');
const autoZoomEl = $('autoZoom');
const showBloomEl = $('showBloom');
const resetBtn = $('resetBtn');
const simTimeEl = $('simTime');
const energyBadge = $('energyBadge');
const speedBadge = $('speedBadge');
const extentBadge = $('extentBadge');
const peakBadge = $('peakBadge');
const dtBadge = $('dtBadge');
const controlsPanel = $('controls');

playPauseEl.addEventListener('change', () => { running = playPauseEl.checked; });
speedEl.addEventListener('input', () => {
    timeSpeed = parseFloat(speedEl.value);
    speedVal.textContent = timeSpeed.toFixed(2) + '×';
});
softEl.addEventListener('input', () => {
    SOFT = parseFloat(softEl.value);
    softVal.textContent = SOFT.toFixed(3);
});
centralEl.addEventListener('input', () => {
    centralMass = parseFloat(centralEl.value);
    centralVal.textContent = centralMass.toFixed(2);
});
kickEl.addEventListener('input', () => {
    initialKick = parseFloat(kickEl.value);
    kickVal.textContent = initialKick.toFixed(2);
});
trailEl.addEventListener('input', () => {
    trailLen = parseInt(trailEl.value, 10);
    trailVal.textContent = trailLen;
    for (let i = 0; i < N; i++) trails[i].geometry.setDrawRange(0, trailLen);
});
autoOrbitEl.addEventListener('change', () => {
    autoOrbit = autoOrbitEl.checked;
    controls.autoRotate = autoOrbit;
});
followComEl.addEventListener('change', () => { followCom = followComEl.checked; });
autoZoomEl.addEventListener('change', () => { autoZoom = autoZoomEl.checked; });
showBloomEl.addEventListener('change', () => {
    bloomEnabled = showBloomEl.checked;
    bloomPass.enabled = bloomEnabled;
});
resetBtn.addEventListener('click', () => reset());

controls.autoRotate = autoOrbit;
controls.autoRotateSpeed = 0.5;

// Keyboard shortcuts
window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
        e.preventDefault();
        playPauseEl.checked = !playPauseEl.checked;
        running = playPauseEl.checked;
    } else if (e.key === 'r' || e.key === 'R') {
        reset();
    } else if (e.key === 'h' || e.key === 'H') {
        controlsPanel.classList.toggle('hidden');
    }
});

// ─────────────────────────── Resize handling ───────────────────────────
function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// ─────────────────────────── Main loop ───────────────────────────
const clock = new THREE.Clock();
let energyRefresh = 0;
const comTarget = new THREE.Vector3();
const comSmoothed = new THREE.Vector3();
let cameraDistSmoothed = 14;
const cameraDirection = new THREE.Vector3();
let peakSpeedEver = 0;
let lastDt = 0;

reset();

// Expose for debugging from preview console.
window.__xia = {
    camera, controls, positions, velocities, masses,
    stepVerlet, adaptiveDt, totalEnergy, maxBodySpeed, systemExtent,
};

function animate() {
    requestAnimationFrame(animate);

    const dtFrame = Math.min(clock.getDelta(), 0.05);

    if (running) {
        // Adaptive sub-stepping. Each frame we burn through `totalDt` of
        // simulation time, taking sub-steps sized to the current closest-pair
        // free-fall timescale. During a near-collision dt drops to 1e-4 or
        // below; in calmer periods it climbs back toward 0.01.
        const totalDt = dtFrame * timeSpeed;
        const subStepCap = 4000;        // hard ceiling per frame
        let consumed = 0;
        let steps = 0;
        while (consumed < totalDt && steps < subStepCap) {
            const dt = Math.min(adaptiveDt(0.01), totalDt - consumed);
            stepVerlet(dt);
            simTime += dt;
            consumed += dt;
            steps++;
            lastDt = dt;
        }
        const v = maxBodySpeed();
        if (v > peakSpeedEver) peakSpeedEver = v;
        for (let i = 0; i < N; i++) pushTrail(i);
    }

    // Update mesh + halo positions.
    for (let i = 0; i < N; i++) {
        bodyMeshes[i].position.set(positions[i][0], positions[i][1], positions[i][2]);
        haloSprites[i].position.copy(bodyMeshes[i].position);
    }

    // Compute COM and system extent each frame (cheap with N=5).
    let cx = 0, cy = 0, cz = 0, mTot = 0;
    for (let i = 0; i < N; i++) {
        cx += masses[i] * positions[i][0];
        cy += masses[i] * positions[i][1];
        cz += masses[i] * positions[i][2];
        mTot += masses[i];
    }
    cx /= mTot; cy /= mTot; cz /= mTot;
    comTarget.set(cx, cy, cz);

    if (followCom) {
        comSmoothed.lerp(comTarget, 0.08);
        controls.target.copy(comSmoothed);
    }

    // Let OrbitControls apply user input first (rotation + damping), then
    // override the radial distance so auto-zoom can frame escaping bodies.
    controls.update();

    if (autoZoom) {
        let rMax = 0;
        for (let i = 0; i < N; i++) {
            const dx = positions[i][0] - cx;
            const dy = positions[i][1] - cy;
            const dz = positions[i][2] - cz;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > rMax) rMax = d;
        }
        const desired = Math.max(8, rMax * 2.4 + 4);
        cameraDistSmoothed += (desired - cameraDistSmoothed) * 0.06;
        cameraDirection.subVectors(camera.position, controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(cameraDirection, cameraDistSmoothed);
    }

    // Refresh stats roughly 4 times per second.
    energyRefresh += dtFrame;
    if (energyRefresh > 0.25) {
        energyRefresh = 0;
        simTimeEl.textContent = `t = ${simTime.toFixed(2)}`;
        energyBadge.textContent = `E = ${totalEnergy().toFixed(3)}`;
        speedBadge.textContent = `v_max = ${maxBodySpeed().toFixed(2)}`;
        extentBadge.textContent = `R = ${systemExtent().toFixed(2)}`;
        peakBadge.textContent = `v_peak = ${peakSpeedEver.toFixed(2)}`;
        dtBadge.textContent = `dt = ${lastDt.toExponential(1)}`;
    }

    composer.render();
}
animate();
