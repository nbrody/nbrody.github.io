// ─────────────────────────────────────────────────
// 3D Viewer — folding + creasing with cursor & slider control
// ─────────────────────────────────────────────────

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    params, corners as cornersState, foldAngles, PAIR_HEX, PAIR_COLORS, CREASE_HEX,
    creaseType, creaseAngle, notify
} from './state.js';
import {
    getOctagonVertices, FLAP_DEFS, to3D,
    foldCorner, applyCrease, creaseCorner, isFlapOnMovingSide
} from './geometry.js';

const viewerPanel = document.getElementById('viewer-panel');
const threeCanvas = document.getElementById('three-canvas');
const infoPanel = document.getElementById('info-panel');
const foldHint = document.getElementById('fold-hint');

// ── Scene ────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.FogExp2(0x0a0a0f, 0.25);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0.8, 1.4, 1.8);

const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const controls = new OrbitControls(camera, threeCanvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.2, 0);

scene.add(new THREE.AmbientLight(0x404060, 0.7));
const dL = new THREE.DirectionalLight(0xffffff, 1.3);
dL.position.set(3, 5, 4);
scene.add(dL);
const dL2 = new THREE.DirectionalLight(0x8888ff, 0.35);
dL2.position.set(-3, 2, -3);
scene.add(dL2);
scene.add(new THREE.GridHelper(4, 20, 0x1a1a2e, 0x14142a));

// ── Mesh group & raycast state ───────────────────
const polyGroup = new THREE.Group();
scene.add(polyGroup);

let flapMeshes = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let activeFlapIdx = -1, dragStartY = 0, dragStartAngle = 0;
let hoveredFlapIdx = -1;

// ── Build / rebuild 3D geometry ──────────────────

export function rebuild() {
    while (polyGroup.children.length) {
        const c = polyGroup.children[0];
        polyGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
    }
    flapMeshes = [];

    const { a, b, c, d } = params;
    const verts2 = getOctagonVertices(cornersState, a, b, c, d);

    // Base interior points (flat, Y=0)
    const interiorBase = [to3D(verts2[1]), to3D(verts2[3]), to3D(verts2[5]), to3D(verts2[7])];
    // Corner points (flat)
    const cornersBase = [to3D(verts2[0]), to3D(verts2[2]), to3D(verts2[4]), to3D(verts2[6])];

    // Apply crease to interior points
    const interior = applyCrease(interiorBase, creaseType, creaseAngle);

    // Central quad — two triangles
    if (creaseType === 'ac') {
        // Split along Pa(0)–Pc(2)
        addTri(interior[0], interior[1], interior[2], 0x8b5cf6, 0.55); // fixed side
        addTri(interior[0], interior[2], interior[3], 0x7c3aed, 0.55); // moved side
        // Draw crease edge
        addEdge(interior[0], interior[2], CREASE_HEX, 1.0);
    } else if (creaseType === 'bd') {
        // Split along Pb(1)–Pd(3)
        addTri(interior[0], interior[1], interior[3], 0x8b5cf6, 0.55); // fixed side
        addTri(interior[1], interior[2], interior[3], 0x7c3aed, 0.55); // moved side
        addEdge(interior[1], interior[3], CREASE_HEX, 1.0);
    } else {
        addTri(interior[0], interior[1], interior[2], 0x8b5cf6, 0.55);
        addTri(interior[0], interior[2], interior[3], 0x8b5cf6, 0.55);
    }
    addQuadWire(interior[0], interior[1], interior[2], interior[3], 0xffffff, 0.3);

    // Four flaps
    const foldedCorners = [];
    for (let i = 0; i < 4; i++) {
        const def = FLAP_DEFS[i];
        const h1 = interior[def.h1];
        const h2 = interior[def.h2];

        // Corner flat position — may need crease transform
        let cornerFlat = cornersBase[def.corner];
        if (creaseType !== 'none' && Math.abs(creaseAngle) > 1e-6 && isFlapOnMovingSide(i, creaseType)) {
            cornerFlat = creaseCorner(cornerFlat, creaseType, creaseAngle, interiorBase);
        }

        const fc = foldCorner(cornerFlat, h1, h2, foldAngles[i]);
        foldedCorners.push(fc);

        const isHovered = hoveredFlapIdx === i;
        const isActive = activeFlapIdx === i;
        const opacity = isActive ? 0.8 : (isHovered ? 0.75 : 0.6);

        const mesh = addTri(h1, h2, fc, PAIR_HEX[i], opacity, true);
        flapMeshes.push({ mesh, flapIdx: i });
        addTriWire(h1, h2, fc, PAIR_HEX[i], isActive ? 1.0 : 0.7);

        if (foldAngles[i] > 0.05) {
            const sGeo = new THREE.SphereGeometry(0.014, 12, 12);
            const sMat = new THREE.MeshPhongMaterial({
                color: PAIR_HEX[i], emissive: PAIR_HEX[i], emissiveIntensity: 0.3
            });
            const sMesh = new THREE.Mesh(sGeo, sMat);
            sMesh.position.copy(fc);
            polyGroup.add(sMesh);
        }
    }

    if (activeFlapIdx >= 0) {
        const def = FLAP_DEFS[activeFlapIdx];
        addEdge(interior[def.h1], interior[def.h2], 0xffffff, 1.0);
    }

    updateInfo(foldedCorners);
}

// ── Primitive helpers ────────────────────────────

function addTri(a, b, c, color, opacity, returnMesh = false) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z
    ]), 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhongMaterial({
        color, transparent: true, opacity, side: THREE.DoubleSide, shininess: 60
    });
    const mesh = new THREE.Mesh(geo, mat);
    polyGroup.add(mesh);
    return returnMesh ? mesh : undefined;
}

function addTriWire(a, b, c, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z
    ]), 3));
    geo.setIndex([0, 1, 1, 2, 2, 0]);
    polyGroup.add(new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    ));
}

function addQuadWire(a, b, c, d, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z
    ]), 3));
    geo.setIndex([0, 1, 1, 2, 2, 3, 3, 0]);
    polyGroup.add(new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    ));
}

function addEdge(a, b, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        a.x, a.y, a.z, b.x, b.y, b.z
    ]), 3));
    polyGroup.add(new THREE.LineSegments(geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    ));
}

// ── Info display ─────────────────────────────────

function updateInfo(foldedCorners) {
    const anyFolded = foldAngles.some(a => a > 0.01);
    const creased = creaseType !== 'none' && Math.abs(creaseAngle) > 0.01;
    if (!anyFolded && !creased) {
        infoPanel.innerHTML = '';
        foldHint.style.opacity = '1';
        return;
    }
    foldHint.style.opacity = '0';

    let maxDist = 0;
    for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++)
            maxDist = Math.max(maxDist, foldedCorners[i].distanceTo(foldedCorners[j]));

    const avg = new THREE.Vector3();
    foldedCorners.forEach(fc => avg.add(fc));
    avg.divideScalar(4);

    infoPanel.innerHTML = `Corner spread: ${maxDist.toFixed(4)}<br>Apex height: ${avg.y.toFixed(4)}`;
}

// ── Slider sync ──────────────────────────────────
// Sliders update state → rebuild. Cursor drag also updates sliders.

export function syncSlidersFromState() {
    for (let i = 0; i < 4; i++) {
        const deg = Math.round(foldAngles[i] * 180 / Math.PI);
        const slider = document.getElementById('fold-slider-' + i);
        const valEl = document.getElementById('fold-val-' + i);
        if (slider) slider.value = deg;
        if (valEl) valEl.textContent = deg + '°';
    }
}

// ── Raycasting ───────────────────────────────────

function getFlapAtMouse(e) {
    const rect = threeCanvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = flapMeshes.map(f => f.mesh);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
        const entry = flapMeshes.find(f => f.mesh === hits[0].object);
        return entry ? entry.flapIdx : -1;
    }
    return -1;
}

// ── Mouse interaction ────────────────────────────

threeCanvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const idx = getFlapAtMouse(e);
    if (idx >= 0) {
        activeFlapIdx = idx;
        dragStartY = e.clientY;
        dragStartAngle = foldAngles[idx];
        controls.enabled = false;
        threeCanvas.style.cursor = 'ns-resize';
        e.preventDefault();
        e.stopPropagation();
    }
});

window.addEventListener('mousemove', e => {
    if (activeFlapIdx >= 0) {
        const dy = dragStartY - e.clientY;
        let newAngle = dragStartAngle + dy * (Math.PI / 200);
        newAngle = Math.max(0, Math.min(Math.PI, newAngle));
        foldAngles[activeFlapIdx] = newAngle;
        syncSlidersFromState();
        rebuild();
    } else {
        const prevHover = hoveredFlapIdx;
        hoveredFlapIdx = getFlapAtMouse(e);
        if (hoveredFlapIdx !== prevHover) {
            threeCanvas.style.cursor = hoveredFlapIdx >= 0 ? 'grab' : 'default';
            rebuild();
        }
    }
});

window.addEventListener('mouseup', () => {
    if (activeFlapIdx >= 0) {
        activeFlapIdx = -1;
        controls.enabled = true;
        threeCanvas.style.cursor = 'default';
        rebuild();
    }
});

// ── Touch interaction ────────────────────────────

let touchFlapIdx = -1, touchStartY = 0, touchStartAngle = 0;

threeCanvas.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = threeCanvas.getBoundingClientRect();
    mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = flapMeshes.map(f => f.mesh);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
        const entry = flapMeshes.find(f => f.mesh === hits[0].object);
        if (entry) {
            touchFlapIdx = entry.flapIdx;
            touchStartY = touch.clientY;
            touchStartAngle = foldAngles[touchFlapIdx];
            controls.enabled = false;
            e.preventDefault();
        }
    }
}, { passive: false });

threeCanvas.addEventListener('touchmove', e => {
    if (touchFlapIdx < 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dy = touchStartY - touch.clientY;
    let newAngle = touchStartAngle + dy * (Math.PI / 200);
    newAngle = Math.max(0, Math.min(Math.PI, newAngle));
    foldAngles[touchFlapIdx] = newAngle;
    syncSlidersFromState();
    rebuild();
}, { passive: false });

threeCanvas.addEventListener('touchend', () => {
    if (touchFlapIdx >= 0) {
        touchFlapIdx = -1;
        controls.enabled = true;
        rebuild();
    }
});

// ── Resize & animate ─────────────────────────────

export function resize() {
    const w = viewerPanel.clientWidth, h = viewerPanel.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

export function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
