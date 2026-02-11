import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------- Parameters ----------
let globalP = 3;
let numLayers = 1;              // Number of covers ABOVE the target
const N = 360;                  // samples per layer
const Rtarget = 1.1;
const layerGap = 2.4;

const TAU = Math.PI * 2;
const modTau = (x) => ((x % TAU) + TAU) % TAU;

// ---------- Scene Setup ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d12, 10, 500); // Linear fog: starts at 10, completely obscure at 500

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 2000);
camera.position.set(10, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0b0d12, 1);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0); // Always look at the center of the stack

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.5);
dir.position.set(5, 8, 10);
scene.add(dir);

// ---------- Layer Management ----------
class Layer {
    constructor(index, p) {
        this.index = index; // 0 is codomain, 1...n are domain layers
        this.p = p;         // degree relative to layer below

        // Visuals
        const color = index === 0 ? 0xff5ac8 : 0x82aaff;
        this.lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
        this.line = new THREE.Line(new THREE.BufferGeometry(), this.lineMat);
        scene.add(this.line);

        if (index > 0) {
            // Chords to layer below
            this.segGeom = new THREE.BufferGeometry();
            this.segPos = new Float32Array(N * 2 * 3);
            this.segGeom.setAttribute("position", new THREE.BufferAttribute(this.segPos, 3));
            this.segMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });
            this.segLines = new THREE.LineSegments(this.segGeom, this.segMat);
            scene.add(this.segLines);

            // Points
            this.ptsGeom = new THREE.BufferGeometry();
            this.ptsPos = new Float32Array(N * 3);
            this.ptsGeom.setAttribute("position", new THREE.BufferAttribute(this.ptsPos, 3));
            this.ptsMat = new THREE.PointsMaterial({ color: 0x82aaff, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.4 });
            this.points = new THREE.Points(this.ptsGeom, this.ptsMat);
            scene.add(this.points);

            this.domainPts = new Array(N);
            this.targetPts = new Array(N);
        }
    }

    dispose() {
        scene.remove(this.line);
        this.line.geometry.dispose();
        if (this.index > 0) {
            scene.remove(this.segLines);
            this.segGeom.dispose();
            scene.remove(this.points);
            this.ptsGeom.dispose();
        }
    }
}

let layers = [];
const highlightGroup = new THREE.Group();
scene.add(highlightGroup);

const fiberColors = [0xff5ac8, 0x00f2ff, 0x82aaff, 0x7e57c2, 0x42a5f5, 0x26a69a]; // Colorful fiber layers

const sphereGeomLarge = new THREE.SphereGeometry(0.12, 16, 16);
const sphereGeomSmall = new THREE.SphereGeometry(0.08, 12, 12);
const chordHighlightMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });

function rebuildMap() {
    // Cleanup
    layers.forEach(l => l.dispose());
    layers = [];

    // Create Layers
    layers.push(new Layer(0, 1)); // L0: Target
    for (let i = 1; i <= numLayers; i++) {
        layers.push(new Layer(i, globalP)); // Every layer cover uses globalP
    }

    // Update Geometry
    let cumulativeP = 1;
    let maxRadius = Rtarget;
    for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        if (i > 0) cumulativeP *= globalP;
        const radius = cumulativeP * Rtarget;
        if (radius > maxRadius) maxRadius = radius;
        const z = - (layers.length - 1) * 0.5 * layerGap + i * layerGap;
        l.center = new THREE.Vector3(0, 0, z);
        l.radius = radius;

        // Circle Line
        const pts = [];
        const seg = 128;
        for (let j = 0; j <= seg; j++) {
            const a = (j / seg) * TAU;
            pts.push(new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), z));
        }
        l.line.geometry.setFromPoints(pts);

        if (i > 0) {
            const prev = layers[i - 1];
            for (let j = 0; j < N; j++) {
                const theta = (j / N) * TAU;
                const phi_mapped = modTau(globalP * theta);
                l.domainPts[j] = new THREE.Vector3(l.radius * Math.cos(theta), l.radius * Math.sin(theta), l.center.z);
                l.targetPts[j] = new THREE.Vector3(prev.radius * Math.cos(phi_mapped), prev.radius * Math.sin(phi_mapped), prev.center.z);
                l.segPos[6 * j + 0] = l.domainPts[j].x; l.segPos[6 * j + 1] = l.domainPts[j].y; l.segPos[6 * j + 2] = l.domainPts[j].z;
                l.segPos[6 * j + 3] = l.targetPts[j].x; l.segPos[6 * j + 4] = l.targetPts[j].y; l.segPos[6 * j + 5] = l.targetPts[j].z;
            }
            l.segGeom.attributes.position.needsUpdate = true;
        }
    }

    // Dynamic camera distance
    const dist = Math.max(10, maxRadius * 2.2);
    camera.position.set(dist, 0, 0);
    controls.update();

    setT(t);
}

// ---------- Animation Variables ----------
let t = 1.0;
let phi = 0;
let playing = false;
let fiberPlaying = false;

function setT(newT) {
    t = Math.max(0, Math.min(1, newT));
    tSlider.value = t.toFixed(3);

    layers.forEach(l => {
        if (l.index > 0) {
            for (let j = 0; j < N; j++) {
                const mix = new THREE.Vector3().lerpVectors(l.domainPts[j], l.targetPts[j], t);
                l.ptsPos[3 * j + 0] = mix.x;
                l.ptsPos[3 * j + 1] = mix.y;
                l.ptsPos[3 * j + 2] = mix.z;
            }
            l.ptsGeom.attributes.position.needsUpdate = true;
        }
    });
    updateFiber();
}

function updateFiber() {
    highlightGroup.children.forEach(c => {
        if (c.geometry) c.geometry.dispose();
    });
    while (highlightGroup.children.length > 0) highlightGroup.remove(highlightGroup.children[0]);

    if (!layers.length) return;

    // Propagate fiber from L0 up to Ln
    let currentAngles = [phi]; // Angles at Layer 0

    // Add point to Layer 0
    const l0 = layers[0];
    const p0 = new THREE.Vector3(l0.radius * Math.cos(phi), l0.radius * Math.sin(phi), l0.center.z);
    addHighlightPoint(p0, new THREE.MeshBasicMaterial({ color: fiberColors[0] }), sphereGeomSmall);

    for (let i = 1; i < layers.length; i++) {
        const l = layers[i];
        const prev = layers[i - 1];
        const nextAngles = [];
        const layerMat = new THREE.MeshBasicMaterial({ color: fiberColors[Math.min(i, fiberColors.length - 1)] });

        currentAngles.forEach(angBelow => {
            const pLower = new THREE.Vector3(prev.radius * Math.cos(angBelow), prev.radius * Math.sin(angBelow), prev.center.z);

            for (let k = 0; k < globalP; k++) {
                const angAbove = (angBelow + k * TAU) / globalP;
                const pUpper = new THREE.Vector3(l.radius * Math.cos(angAbove), l.radius * Math.sin(angAbove), l.center.z);

                // Interpolated moving point
                const pMid = new THREE.Vector3().lerpVectors(pUpper, pLower, t);
                addHighlightPoint(pMid, layerMat, sphereGeomLarge);

                // Edge
                const geom = new THREE.BufferGeometry().setFromPoints([pUpper, pLower]);
                highlightGroup.add(new THREE.Line(geom, chordHighlightMat));

                nextAngles.push(angAbove);
            }
        });
        currentAngles = nextAngles;
    }
}

function addHighlightPoint(pos, mat, geom) {
    const m = new THREE.Mesh(geom, mat);
    m.position.copy(pos);
    highlightGroup.add(m);
}

// ---------- UI Interaction ----------
const tSlider = document.getElementById("tSlider");
const playBtn = document.getElementById("playBtn");
const fiberBtn = document.getElementById("fiberBtn");
const addLayerBtn = document.getElementById("addLayerBtn");
const pInput = document.getElementById("pInput");

pInput.addEventListener("input", () => {
    globalP = Math.max(1, parseInt(pInput.value) || 1);
    rebuildMap();
});

addLayerBtn.addEventListener("click", () => {
    numLayers++;
    rebuildMap();
});

tSlider.addEventListener("input", () => setT(parseFloat(tSlider.value)));

playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "⏸" : "▶";
    if (playing && t >= 1) setT(0);
});

fiberBtn.addEventListener("click", () => {
    fiberPlaying = !fiberPlaying;
    fiberBtn.style.background = fiberPlaying ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.08)";
});

// ---------- Main Loop ----------
let last = performance.now();
function animate(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (playing) {
        setT(t + dt * 0.4);
        if (t >= 1) { playing = false; playBtn.textContent = "▶"; }
    }
    if (fiberPlaying) {
        phi = modTau(phi + dt * 0.8);
        updateFiber();
    }

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

rebuildMap();
requestAnimationFrame(animate);

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
// --- Message Listener for Presentation Control ---
window.addEventListener('message', (event) => {
    if (event.data === 'rotate') {
        const btn = document.getElementById('fiberBtn');
        if (btn) btn.click();
    } else if (event.data === 'play') {
        const btn = document.getElementById('playBtn');
        if (btn) btn.click();
    } else if (event.data === 'add') {
        const btn = document.getElementById('addLayerBtn');
        if (btn) btn.click();
    }
});
