import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   Riley Slice — half-spaces in the upper half-space model of H^3
   ------------------------------------------------------------
   Coordinates: a point of H^3 is (zeta, t) with zeta in C, t > 0.
   In the three.js scene we map  (Re zeta, Im zeta, t)  ->  (x, t, y),
   i.e. three.js Y axis is the hyperbolic height t, and the boundary
   plane d(H^3) = C is the three.js plane Y = 0.
   ============================================================ */

/* ---------- complex arithmetic (numbers as [re, im]) ---------- */
const cadd  = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cmul  = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cconj = (a)    => [a[0], -a[1]];
const cabs2 = (a)    => a[0] * a[0] + a[1] * a[1];
const cabs  = (a)    => Math.hypot(a[0], a[1]);
const cscale= (a, s) => [a[0] * s, a[1] * s];
const cinv  = (a)    => { const d = cabs2(a); return [a[0] / d, -a[1] / d]; };

/* Action of g = [[a,b],[c,d]] in SL(2,C) on a point (z in C, r > 0) of H^3
   (Elstrodt–Grunewald–Mennicke formula):
      z' = ( (az+b) conj(cz+d) + a conj(c) r^2 ) / ( |cz+d|^2 + |c|^2 r^2 )
      r' =                       r              / ( |cz+d|^2 + |c|^2 r^2 )      */
function mobiusAction(a, b, c, d, z, r) {
    const czd  = cadd(cmul(c, z), d);
    const azb  = cadd(cmul(a, z), b);
    const num1 = cmul(azb, cconj(czd));
    const num2 = cscale(cmul(a, cconj(c)), r * r);
    const num  = cadd(num1, num2);
    const den  = cabs2(czd) + cabs2(c) * r * r;
    return { z: cscale(num, 1 / den), r: r / den };
}

/* One-parameter parabolic flows g_s, s in [0,1], for the four moves.
   X = [[1, z],[0,1]],  Y = [[1,0],[z,1]]  (and inverses use -z). */
const ONE = [1, 0], ZERO = [0, 0];
function flowMatrix(kind, z, s) {
    const w = cscale(z, s);                 // s * z
    const wn = cscale(z, -s);               // -s * z
    switch (kind) {
        case 'X':  return [ONE, w,    ZERO, ONE];  // [[1, sz],[0,1]]
        case 'Xi': return [ONE, wn,   ZERO, ONE];  // [[1,-sz],[0,1]]
        case 'Y':  return [ONE, ZERO, w,    ONE];  // [[1,0],[sz,1]]
        case 'Yi': return [ONE, ZERO, wn,   ONE];  // [[1,0],[-sz,1]]
    }
}
function applyFlow(kind, z, s, p) {
    const [a, b, c, d] = flowMatrix(kind, z, s);
    return mobiusAction(a, b, c, d, p.z, p.r);
}

/* ============================================================
   State
   ============================================================ */
let Z = [1, 1];                              // Riley parameter z = 1 + i
let basepoint = { z: [0, 0], r: 1 };         // current basepoint (0,0,1)
const trailPts = [ new THREE.Vector3(0, 1, 0) ];
let anim = null;                             // active animation, or null
let speed = 1.0;
const show = { X: true, Y: true, trail: true, axes: true };

/* ============================================================
   three.js scene
   ============================================================ */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x04060c, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04060c, 0.04);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(2.6, 2.4, 3.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.7, 0);

scene.add(new THREE.AmbientLight(0x4a5a7a, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(4, 7, 3);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
fill.position.set(-4, 2, -3);
scene.add(fill);

/* ---------- boundary floor (the complex plane C = d H^3) ---------- */
const floorGroup = new THREE.Group();
scene.add(floorGroup);

const grid = new THREE.GridHelper(10, 40, 0x2a3656, 0x141d33);
grid.position.y = 0;
floorGroup.add(grid);

// real / imaginary axes on the boundary
function axisLine(from, to, color) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
}
floorGroup.add(axisLine(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0), 0x4d6080)); // Re
floorGroup.add(axisLine(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 5), 0x4d6080)); // Im

// origin marker = common fixed point of Y, Y^-1
const originDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd34d })
);
floorGroup.add(originDot);

/* ---------- basepoint ---------- */
const baseMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x335577, emissiveIntensity: 0.6, roughness: 0.3 })
);
scene.add(baseMesh);
// faint vertical drop line from basepoint to the boundary
const dropMat = new THREE.LineDashedMaterial({ color: 0x556688, dashSize: 0.08, gapSize: 0.06 });
let dropLine = new THREE.Line(new THREE.BufferGeometry(), dropMat);
scene.add(dropLine);

/* ---------- orbit trail ---------- */
const trailMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
let trailLine = new THREE.Line(new THREE.BufferGeometry(), trailMat);
scene.add(trailLine);

/* ---------- X horoball: half-space { t >= h }, h = 1/|z| ----------
   Drawn as a translucent sheet (the horoball "floor") with a grid so it
   reads as a surface; it is tangent to the tops of the Y, Y^-1 spheres. */
const horoGroup = new THREE.Group();
scene.add(horoGroup);
const horoMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff, transparent: true, opacity: 0.12,
    side: THREE.DoubleSide, roughness: 0.5, metalness: 0.0,
    depthWrite: false
});
const horoPlane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), horoMat);
horoPlane.rotation.x = -Math.PI / 2;          // make it horizontal
horoGroup.add(horoPlane);
const horoGrid = new THREE.GridHelper(10, 20, 0x00f0ff, 0x00aacc);
horoGrid.material.transparent = true;
horoGrid.material.opacity = 0.35;
horoGroup.add(horoGrid);
const horoEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(10, 10)),
    new THREE.LineBasicMaterial({ color: 0x66f7ff, transparent: true, opacity: 0.7 })
);
horoEdge.rotation.x = -Math.PI / 2;
horoGroup.add(horoEdge);

/* ---------- Y, Y^-1 isometric spheres (unit hemisphere, scaled) ---------- */
function makeHemisphere(color) {
    const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); // upper half
    const mat = new THREE.MeshStandardMaterial({
        color, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
        roughness: 0.35, metalness: 0.1, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, wireframe: true, transparent: true, opacity: 0.12
    }));
    mesh.add(wire);
    scene.add(mesh);
    return mesh;
}
const sphereY  = makeHemisphere(0xc084fc);   // isometric sphere of Y    (center -1/z)
const sphereYi = makeHemisphere(0xe9a3ff);   // isometric sphere of Y^-1 (center +1/z)

/* ============================================================
   Updating geometry from z and basepoint
   ============================================================ */
function hpToVec(p) { return new THREE.Vector3(p.z[0], p.r, p.z[1]); }

function updateHalfSpaces() {
    const absz = Math.max(cabs(Z), 1e-4);
    const h = 1 / absz;                       // horoball height for X
    horoGroup.position.y = h;

    const r = 1 / absz;                       // isometric-sphere radius
    const cY  = cscale(cinv(Z), -1);          // -1/z
    const cYi = cinv(Z);                      // +1/z
    sphereY.position.set(cY[0], 0, cY[1]);    sphereY.scale.setScalar(r);
    sphereYi.position.set(cYi[0], 0, cYi[1]); sphereYi.scale.setScalar(r);

    horoGroup.visible = show.X;
    sphereY.visible = sphereYi.visible = show.Y;
}

function updateBasepoint() {
    const v = hpToVec(basepoint);
    baseMesh.position.copy(v);
    dropLine.geometry.dispose();
    dropLine.geometry = new THREE.BufferGeometry().setFromPoints([v, new THREE.Vector3(v.x, 0, v.z)]);
    dropLine.computeLineDistances();

    document.getElementById('hudPoint').textContent =
        `ζ = ${fmt(basepoint.z[0])} + ${fmt(basepoint.z[1])} i,  t = ${fmt(basepoint.r)}`;
}

function rebuildTrail() {
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry().setFromPoints(trailPts);
    trailLine.visible = show.trail && trailPts.length > 1;
}

const fmt = (x) => (x >= 0 ? ' ' : '') + x.toFixed(3);

/* ============================================================
   Animation of an isometry on the basepoint (parabolic flow)
   ============================================================ */
const WORDSYM = { X: 'X', Xi: 'X⁻¹', Y: 'Y', Yi: 'Y⁻¹' };
let word = [];

function startMove(kind) {
    if (anim) return;
    anim = { kind, s: 0, from: { z: basepoint.z.slice(), r: basepoint.r } };
    setButtonsDisabled(true);
}

function stepAnim(dt) {
    if (!anim) return;
    anim.s = Math.min(1, anim.s + dt * speed * 0.9);
    const p = applyFlow(anim.kind, Z, anim.s, anim.from);
    basepoint = p;
    updateBasepoint();
    // live trail: base trail + current flowing point
    trailLine.geometry.dispose();
    trailLine.geometry = new THREE.BufferGeometry().setFromPoints([...trailPts, hpToVec(p)]);
    trailLine.visible = show.trail;

    if (anim.s >= 1) {
        trailPts.push(hpToVec(p));
        word.push(WORDSYM[anim.kind]);
        document.getElementById('hudWord').textContent = word.join(' ') || '·';
        anim = null;
        setButtonsDisabled(false);
        rebuildTrail();
    }
}

/* ============================================================
   Riley-slice parameter patch (2D canvas, [-2.5,2.5]^2)
   ============================================================ */
const sliceCanvas = document.getElementById('sliceCanvas');
const sctx = sliceCanvas.getContext('2d');
const SR = 2.5;                              // slice half-range
const SW = sliceCanvas.width, SH = sliceCanvas.height;
const toPx = (z) => [ (z[0] + SR) / (2 * SR) * SW, (SR - z[1]) / (2 * SR) * SH ];
const toZ  = (px, py) => [ px / SW * 2 * SR - SR, SR - py / SH * 2 * SR ];

function drawSlice() {
    sctx.clearRect(0, 0, SW, SH);
    // grid
    sctx.strokeStyle = 'rgba(120,140,180,0.12)';
    sctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
        const [gx] = toPx([i, 0]);  const [, gy] = toPx([0, i]);
        sctx.beginPath(); sctx.moveTo(gx, 0); sctx.lineTo(gx, SH); sctx.stroke();
        sctx.beginPath(); sctx.moveTo(0, gy); sctx.lineTo(SW, gy); sctx.stroke();
    }
    // axes
    const [ox, oy] = toPx([0, 0]);
    sctx.strokeStyle = 'rgba(150,170,210,0.45)';
    sctx.beginPath(); sctx.moveTo(0, oy); sctx.lineTo(SW, oy); sctx.stroke();
    sctx.beginPath(); sctx.moveTo(ox, 0); sctx.lineTo(ox, SH); sctx.stroke();
    // unit circle (helpful reference)
    sctx.strokeStyle = 'rgba(120,140,180,0.20)';
    const [, uy] = toPx([0, 1]);
    sctx.beginPath(); sctx.arc(ox, oy, Math.abs(oy - uy), 0, 2 * Math.PI); sctx.stroke();

    // marker at the parameter z
    const [px, py] = toPx(Z);
    sctx.fillStyle = 'rgba(0,240,255,0.20)';
    sctx.beginPath(); sctx.arc(px, py, 11, 0, 2 * Math.PI); sctx.fill();
    sctx.fillStyle = '#00f0ff';
    sctx.beginPath(); sctx.arc(px, py, 5, 0, 2 * Math.PI); sctx.fill();
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 1.5;
    sctx.beginPath(); sctx.arc(px, py, 5, 0, 2 * Math.PI); sctx.stroke();
}

function setZFromEvent(e) {
    const rect = sliceCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (SW / rect.width);
    const y = (e.clientY - rect.top) * (SH / rect.height);
    let z = toZ(x, y);
    z = [ Math.max(-SR, Math.min(SR, z[0])), Math.max(-SR, Math.min(SR, z[1])) ];
    // Keep z away from 0: scaling [0,0] is a no-op, so pick a fallback direction.
    const az = cabs(z);
    if (az < 0.08) z = az < 1e-12 ? [0.08, 0] : cscale(z, 0.08 / az);
    Z = z;
    onZChanged();
}

let dragging = false;
sliceCanvas.addEventListener('pointerdown', (e) => { dragging = true; sliceCanvas.setPointerCapture(e.pointerId); setZFromEvent(e); });
sliceCanvas.addEventListener('pointermove', (e) => { if (dragging) setZFromEvent(e); });
sliceCanvas.addEventListener('pointerup',   () => { dragging = false; });

function onZChanged() {
    drawSlice();
    updateHalfSpaces();
    document.getElementById('sliceZ').textContent =
        `z = ${fmt(Z[0]).trim()} ${Z[1] >= 0 ? '+' : '−'} ${Math.abs(Z[1]).toFixed(3)} i`;
    document.getElementById('matX').innerHTML =
        `X = [ 1&nbsp;&nbsp;${cstr(Z)} ; 0&nbsp;&nbsp;1 ]`;
    document.getElementById('matY').innerHTML =
        `Y = [ 1&nbsp;&nbsp;0 ; ${cstr(Z)}&nbsp;&nbsp;1 ]`;
}
const cstr = (z) => `${z[0].toFixed(2)}${z[1] >= 0 ? '+' : '−'}${Math.abs(z[1]).toFixed(2)}i`;

/* ============================================================
   UI wiring
   ============================================================ */
function setButtonsDisabled(d) {
    ['btnX', 'btnXi', 'btnY', 'btnYi'].forEach(id => document.getElementById(id).disabled = d);
}
document.getElementById('btnX').onclick  = () => startMove('X');
document.getElementById('btnXi').onclick = () => startMove('Xi');
document.getElementById('btnY').onclick  = () => startMove('Y');
document.getElementById('btnYi').onclick = () => startMove('Yi');

document.getElementById('btnReset').onclick = () => {
    if (anim) return;
    basepoint = { z: [0, 0], r: 1 };
    updateBasepoint();
};
document.getElementById('btnClear').onclick = () => {
    trailPts.length = 0;
    trailPts.push(hpToVec(basepoint));
    word = [];
    document.getElementById('hudWord').textContent = '·';
    rebuildTrail();
};

const speedSlider = document.getElementById('speedSlider');
speedSlider.oninput = () => {
    speed = parseFloat(speedSlider.value);
    document.getElementById('speedValue').textContent = speed.toFixed(1) + '×';
};

function toggle(id, key, after) {
    const btn = document.getElementById(id);
    btn.onclick = () => {
        show[key] = !show[key];
        btn.classList.toggle('active', show[key]);
        after();
    };
}
toggle('tglX', 'X', updateHalfSpaces);
toggle('tglY', 'Y', updateHalfSpaces);
toggle('tglTrail', 'trail', rebuildTrail);
toggle('tglAxes', 'axes', () => { floorGroup.visible = show.axes; });

/* ============================================================
   Render loop
   ============================================================ */
let last = performance.now();
function animate(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    stepAnim(dt);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* init */
resize();
onZChanged();
updateBasepoint();
rebuildTrail();
requestAnimationFrame(animate);
