import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// -----------------------------
// Parameters & State
// -----------------------------
const params = {
    fold: -1.0,
    opacity: 0.95,
    speed: 5,
    isPlaying: false,
    direction: 1,
    pauseTimer: 0
};

// -----------------------------
// Global Variables
// -----------------------------
const edgeColors = [0xff3366, 0x10b981, 0xff3366, 0x00ccff, 0x10b981, 0x00ccff];
let scene, camera, renderer, controls, mainMaterial;
let hexagonGeo, hexagonMesh, edgeLines, conePoints;
let hexEdgesRaw, diskVertsRaw, gridInfo, edgePointsInfo, conePointsInfo;
let backgroundMesh, backgroundEdges, backgroundRim;
let H_total, GLOBAL_SCALE = 12.5, GLOBAL_SHIFT = 0;

// -----------------------------
// Hyperbolic Math Helpers
// -----------------------------
function toDisk(z) {
    const denR = z.re, denI = z.im + 1;
    const numR = z.re, numI = z.im - 1;
    const magSq = denR * denR + denI * denI;
    if (magSq < 1e-12) return { re: 1, im: 0 };
    return { re: (numR * denR + numI * denI) / magSq, im: (numI * denR - numR * denI) / magSq };
}

function samplePath(d1, d2, samples = 100) {
    const pts = [];
    const x1 = d1.re, y1 = d1.im, x2 = d2.re, y2 = d2.im;
    const det = x1 * y2 - x2 * y1;
    if (Math.abs(det) < 1e-7) {
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            pts.push(new THREE.Vector2(x1 * (1 - t) + x2 * t, y1 * (1 - t) + y2 * t));
        }
    } else {
        const r1sq = x1 * x1 + y1 * y1, r2sq = x2 * x2 + y2 * y2;
        const b1 = (r1sq + 1) / 2, b2 = (r2sq + 1) / 2;
        const cx = (b1 * y2 - b2 * y1) / det, cy = (x1 * b2 - x2 * b1) / det;
        const r = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
        let a1 = Math.atan2(y1 - cy, x1 - cx), a2 = Math.atan2(y2 - cy, x2 - cx);
        if (Math.abs(a2 - a1) > Math.PI) a1 += (a2 > a1 ? 2 : -2) * Math.PI;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const ang = a1 * (1 - t) + a2 * t;
            pts.push(new THREE.Vector2(cx + r * Math.cos(ang), cy + r * Math.sin(ang)));
        }
    }
    return pts;
}

// -----------------------------
// Core Initialization
// -----------------------------
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.Fog(0x020617, 10, 80);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(18, -2, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.2);
    scene.add(hemiLight);

    const p1 = new THREE.PointLight(0x6366f1, 6, 80); p1.position.set(10, 10, 20); scene.add(p1);
    const p2 = new THREE.PointLight(0xff3366, 6, 80); p2.position.set(-10, -5, 20); scene.add(p2);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8); fillLight.position.set(0, 0, 30); scene.add(fillLight);
}

function initGeometryData() {
    const engine = new TilingEngine();
    const uhpVerts = engine.computeFundamentalDomain();
    console.log(`Fundamental domain: ${uhpVerts.length} vertices`);
    uhpVerts.forEach((v, i) => console.log(`  v${i}: (${v.re.toFixed(10)}, ${v.im.toFixed(10)})`));

    // Verify: each domainGen should map some vertex to another vertex
    engine.domainGens.forEach((g, gi) => {
        const labels = ['a', 'A', 'a²B', 'aBa', 'AbA', 'bA²'];
        uhpVerts.forEach((v, vi) => {
            const img = g.action(v);
            uhpVerts.forEach((w, wi) => {
                const dist = Math.sqrt((img.re - w.re) ** 2 + (img.im - w.im) ** 2);
                if (dist < 0.1) {
                    console.log(`  ${labels[gi]}(v${vi}) ≈ v${wi}, error = ${dist.toExponential(3)}`);
                }
            });
        });
    });
    let rawDisk = uhpVerts.map(v => toDisk(v));

    const v0 = rawDisk[0], v3 = rawDisk[3];
    const angle = -Math.atan2(v3.im - v0.im, v3.re - v0.re) + Math.PI;
    const rot = (p) => ({
        re: p.re * Math.cos(angle) - p.im * Math.sin(angle),
        im: p.re * Math.sin(angle) + p.im * Math.cos(angle)
    });

    const transformed = rawDisk.map(rot);

    hexEdgesRaw = [];
    for (let i = 0; i < 6; i++) {
        const pts = samplePath(transformed[i], transformed[(i + 1) % 6], 120);
        hexEdgesRaw.push(pts.map(v => v.multiplyScalar(GLOBAL_SCALE)));
    }

    let minV_raw = Infinity, maxV_raw = -Infinity;
    hexEdgesRaw.forEach(e => e.forEach(p => { minV_raw = Math.min(minV_raw, p.y); maxV_raw = Math.max(maxV_raw, p.y); }));
    GLOBAL_SHIFT = (minV_raw + maxV_raw) / 2;
    hexEdgesRaw.forEach(e => e.forEach(p => p.y -= GLOBAL_SHIFT));

    H_total = maxV_raw - minV_raw;
    diskVertsRaw = transformed.map(v => new THREE.Vector2(v.re * GLOBAL_SCALE, v.im * GLOBAL_SCALE - GLOBAL_SHIFT));

    hexagonGeo = createHexGrid();
    mainMaterial = new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: params.opacity,
        roughness: 0.3,
        metalness: 0.7
    });
    hexagonMesh = new THREE.Mesh(hexagonGeo, mainMaterial);
    scene.add(hexagonMesh);

    edgeLines = [];
    hexEdgesRaw.forEach((pts, i) => {
        const geo = new THREE.BufferGeometry().setFromPoints(pts.map(v => new THREE.Vector3(v.x, v.y, 0)));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: edgeColors[i], linewidth: 4 }));
        edgeLines.push(line); scene.add(line);
    });

    const cpMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 });
    conePoints = [];
    for (let i = 0; i < 2; i++) {
        const cp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), cpMat);
        scene.add(cp); conePoints.push(cp);
    }

    precomputeBoundaryST();
    createFullTiling(engine, uhpVerts, rot);
}

function createFullTiling(engine, baseVerts, rotFunc) {
    const orbit = engine.getTilingOrbit(600);
    const tilePositions = [];
    const edgePositions = [];

    const tileMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.1
    });

    // ── Vertex welding infrastructure ──
    // Two adjacent tiles compute the same shared vertex/edge-point through
    // different Möbius transformations, producing slightly different floats.
    // We snap all computed positions to a spatial hash so that the first 
    // computation wins and all later ones reuse the same exact coordinates.
    const WELD_TOL = 0.001;   // screen-coord snap radius
    const GRID_SZ = 0.005;   // spatial hash cell size
    const weldPool = [];       // [{x, y}]
    const weldGrid = {};       // "gx,gy" -> [index into weldPool]

    function weld(x, y) {
        const gx = Math.round(x / GRID_SZ);
        const gy = Math.round(y / GRID_SZ);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const bucket = weldGrid[`${gx + dx},${gy + dy}`];
                if (bucket) {
                    for (const idx of bucket) {
                        const v = weldPool[idx];
                        if (Math.abs(v.x - x) < WELD_TOL && Math.abs(v.y - y) < WELD_TOL) {
                            return v;
                        }
                    }
                }
            }
        }
        const v = { x, y };
        const key = `${gx},${gy}`;
        if (!weldGrid[key]) weldGrid[key] = [];
        weldGrid[key].push(weldPool.length);
        weldPool.push(v);
        return v;
    }

    // ── Pre-compute reference edge samples in UHP ──
    const EDGE_SAMPLES = 60;
    const refEdgeSamples = [];
    for (let i = 0; i < 6; i++) {
        const samples = [];
        const z1 = baseVerts[i], z2 = baseVerts[(i + 1) % 6];
        for (let k = 0; k <= EDGE_SAMPLES; k++) {
            samples.push(uhpGeodesicSample(z1, z2, k / EDGE_SAMPLES));
        }
        refEdgeSamples.push(samples);
    }

    // Convert UHP → Disk → rotate → scale/shift, then weld
    function toScreenWelded(z) {
        const d = rotFunc(toDisk(z));
        return weld(d.re * GLOBAL_SCALE, d.im * GLOBAL_SCALE - GLOBAL_SHIFT);
    }

    // Unwelded version for tile centers (no need to snap centers)
    function toScreen(z) {
        const d = rotFunc(toDisk(z));
        return { x: d.re * GLOBAL_SCALE, y: d.im * GLOBAL_SCALE - GLOBAL_SHIFT };
    }

    orbit.forEach((cell, idx) => {
        if (idx === 0) return;

        const centerUHP = cell.g.action(engine.z0);
        const centerDisk = toDisk(centerUHP);
        const diskR2 = centerDisk.re * centerDisk.re + centerDisk.im * centerDisk.im;
        if (diskR2 > 0.998) return;

        const cScreen = toScreen(centerUHP);
        const cx = cScreen.x, cy = cScreen.y;

        // Build tile boundary — all points are welded
        const tilePath = [];
        for (let i = 0; i < 6; i++) {
            const edgeSamples = refEdgeSamples[i];
            for (let k = 0; k < EDGE_SAMPLES; k++) {
                const zUHP = cell.g.action(edgeSamples[k]);
                tilePath.push(toScreenWelded(zUHP));
            }
        }

        // Fan triangulation from tile center
        for (let i = 0; i < tilePath.length; i++) {
            const p1 = tilePath[i], p2 = tilePath[(i + 1) % tilePath.length];
            tilePositions.push(cx, cy, -0.2, p1.x, p1.y, -0.2, p2.x, p2.y, -0.2);
        }

        // Edge lines (geodesic polylines along the 6 sides)
        for (let i = 0; i < 6; i++) {
            const edgeSamples = refEdgeSamples[i];
            for (let k = 0; k < edgeSamples.length - 1; k++) {
                const pa = toScreenWelded(cell.g.action(edgeSamples[k]));
                const pb = toScreenWelded(cell.g.action(edgeSamples[k + 1]));
                edgePositions.push(pa.x, pa.y, -0.15, pb.x, pb.y, -0.15);
            }
        }
    });

    const tGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tilePositions, 3));
    tGeo.computeVertexNormals();
    backgroundMesh = new THREE.Mesh(tGeo, tileMat);
    scene.add(backgroundMesh);

    const eGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    backgroundEdges = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0
    }));
    scene.add(backgroundEdges);

    const rimGeo = new THREE.TorusGeometry(GLOBAL_SCALE, 0.04, 16, 128);
    backgroundRim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0
    }));
    backgroundRim.position.set(0, -GLOBAL_SHIFT, -0.25);
    scene.add(backgroundRim);
}

// Sample a point along the UHP geodesic from z1 to z2 at parameter t ∈ [0,1]
function uhpGeodesicSample(z1, z2, t) {
    const x1 = z1.re, y1 = z1.im, x2 = z2.re, y2 = z2.im;
    if (Math.abs(x1 - x2) < 1e-9) {
        const logY = Math.log(y1) * (1 - t) + Math.log(y2) * t;
        return { re: x1, im: Math.exp(logY) };
    }
    const center = (x2 * x2 + y2 * y2 - x1 * x1 - y1 * y1) / (2 * (x2 - x1));
    const radius = Math.sqrt((x1 - center) * (x1 - center) + y1 * y1);
    let a1 = Math.atan2(y1, x1 - center);
    let a2 = Math.atan2(y2, x2 - center);
    if (a1 <= 0) a1 += Math.PI * 2;
    if (a2 <= 0) a2 += Math.PI * 2;
    const ang = a1 * (1 - t) + a2 * t;
    return { re: center + radius * Math.cos(ang), im: radius * Math.sin(ang) };
}

function createHexGrid() {
    const cBottom = hexEdgesRaw[4], cTop = [...hexEdgesRaw[1]].reverse();
    const cLeft = [...[...hexEdgesRaw[3]].reverse(), ...[...hexEdgesRaw[2]].reverse()];
    const cRight = [...hexEdgesRaw[5], ...hexEdgesRaw[0]];
    const getPt = (path, t) => {
        const idx = Math.max(0, Math.min(path.length - 1, t * (path.length - 1)));
        const i = Math.floor(idx);
        return (i >= path.length - 1) ? path[path.length - 1].clone() : path[i].clone().lerp(path[i + 1], idx - i);
    };

    const resS = 100, resT = 160;
    const positions = [], indices = []; gridInfo = [];
    for (let j = 0; j <= resT; j++) {
        const t = j / resT, pl = getPt(cLeft, t), pr = getPt(cRight, t);
        const sliceWidth = pr.x - pl.x;
        const sliceMid = (pl.x + pr.x) / 2;
        for (let i = 0; i <= resS; i++) {
            const s = i / resS, pb = getPt(cBottom, s), pt = getPt(cTop, s);
            const corner00 = cBottom[0], corner10 = cBottom[cBottom.length - 1], corner01 = cTop[0], corner11 = cTop[cTop.length - 1];
            const l1 = pb.clone().lerp(pt, t), l2 = pl.clone().lerp(pr, s);
            const b = new THREE.Vector2((1 - s) * (1 - t) * corner00.x + s * (1 - t) * corner10.x + (1 - s) * t * corner01.x + s * t * corner11.x, (1 - s) * (1 - t) * corner00.y + s * (1 - t) * corner10.y + (1 - s) * t * corner01.y + s * t * corner11.y);
            const p = l1.add(l2).sub(b);
            positions.push(p.x, p.y, 0);
            gridInfo.push({ u: p.x, v: p.y, s, t, w: sliceWidth, mid: sliceMid });
        }
    }
    for (let j = 0; j < resT; j++) for (let i = 0; i < resS; i++) { const a = j * (resS + 1) + i, b = (j + 1) * (resS + 1) + i, c = (j + 1) * (resS + 1) + i + 1, d = j * (resS + 1) + i + 1; indices.push(a, d, b, b, d, c); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

function precomputeBoundaryST() {
    const cLeft = [...[...hexEdgesRaw[3]].reverse(), ...[...hexEdgesRaw[2]].reverse()];
    const cRight = [...hexEdgesRaw[5], ...hexEdgesRaw[0]];
    const getPt = (path, t) => {
        const idx = Math.max(0, Math.min(path.length - 1, t * (path.length - 1)));
        const i = Math.floor(idx);
        return (i >= path.length - 1) ? path[path.length - 1].clone() : path[i].clone().lerp(path[i + 1], idx - i);
    };

    edgePointsInfo = [];
    hexEdgesRaw.forEach((edge, eIdx) => {
        const info = [];
        edge.forEach((p, pIdx) => {
            const f = pIdx / (edge.length - 1);
            let s, t;
            if (eIdx === 4) { s = f; t = 0; } else if (eIdx === 1) { s = 1 - f; t = 1; } else if (eIdx === 3) { s = 0; t = 0.5 * (1 - f); } else if (eIdx === 2) { s = 0; t = 0.5 + 0.5 * (1 - f); } else if (eIdx === 5) { s = 1; t = 0.5 * f; } else if (eIdx === 0) { s = 1; t = 0.5 + 0.5 * f; }

            const pl = getPt(cLeft, t), pr = getPt(cRight, t);
            info.push({ u: p.x, v: p.y, s, t, w: pr.x - pl.x, mid: (pr.x + pl.x) / 2 });
        });
        edgePointsInfo.push(info);
    });
    conePointsInfo = [
        { u: diskVertsRaw[0].x, v: diskVertsRaw[0].y, s: 1, t: 0.5, w: 12.0, mid: 0 },
        { u: diskVertsRaw[3].x, v: diskVertsRaw[3].y, s: 0, t: 0.5, w: 12.0, mid: 0 }
    ];
}

function foldUnified(d, p) {
    if (p <= 0.0001) return new THREE.Vector3(d.u, d.v, 0);
    const { s, t, u, v, w, mid } = d;
    const yTarget = H_total * (t - 0.5);

    if (p <= 0.5) {
        const f = p * 2;
        const r = (w / (2 * Math.PI)) / Math.max(f, 0.001);
        const theta = (s - 0.5) * (2 * Math.PI) * f;
        return new THREE.Vector3(mid + r * Math.sin(theta), v * (1 - f) + yTarget * f, r * (1 - Math.cos(theta)));
    } else {
        const f = (p - 0.5) * 2;
        const rMin = w / (2 * Math.PI), rMaj = (H_total / (2 * Math.PI)) / Math.max(f, 0.001);
        const theta = (s - 0.5) * (2 * Math.PI), phi = (t - 0.5) * (2 * Math.PI) * f;
        const currR = rMaj + rMin * (1 - Math.cos(theta));
        return new THREE.Vector3(mid + rMin * Math.sin(theta), currR * Math.sin(phi), currR * Math.cos(phi) - rMaj);
    }
}

function updateFold() {
    const p = params.fold;

    // Tiling fade out: p in [-1, 0]
    const tileAlpha = p < 0 ? params.opacity * (-p) : 0;
    if (backgroundMesh) {
        backgroundMesh.material.opacity = tileAlpha;
        backgroundMesh.visible = tileAlpha > 0.01;
    }
    if (backgroundEdges) {
        backgroundEdges.material.opacity = tileAlpha * 0.6;
        backgroundEdges.visible = tileAlpha > 0.01;
    }
    if (backgroundRim) {
        backgroundRim.material.opacity = tileAlpha * 0.8;
        backgroundRim.visible = tileAlpha > 0.01;
    }

    const foldProg = Math.max(0, p);
    if (hexagonGeo && hexagonGeo.attributes && hexagonGeo.attributes.position) {
        const pos = hexagonGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const fp = foldUnified(gridInfo[i], foldProg);
            pos.setXYZ(i, fp.x, fp.y, fp.z);
        }
        pos.needsUpdate = true; hexagonGeo.computeVertexNormals();
    }

    edgeLines.forEach((line, i) => {
        const eP = line.geometry.attributes.position;
        edgePointsInfo[i].forEach((d, j) => {
            const fp = foldUnified(d, foldProg);
            eP.setXYZ(j, fp.x, fp.y, fp.z);
        });
        eP.needsUpdate = true;
    });
    conePoints.forEach((cp, i) => cp.position.copy(foldUnified(conePointsInfo[i], foldProg)));
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
    if (params.isPlaying) {
        if (params.pauseTimer > 0) params.pauseTimer--;
        else {
            params.fold += 0.01 * params.direction;
            if (params.fold >= 1.0) { params.fold = 1.0; params.direction = -1; params.pauseTimer = 120; }
            else if (params.fold <= -1.0) { params.fold = -1.0; params.direction = 1; params.pauseTimer = 120; }
            updateFold(); updateUI();
        }
    }
}

const updateUI = () => {
    ['fold', 'opacity'].forEach(k => {
        const fill = document.getElementById(`fill-${k}`), label = document.getElementById(k === 'fold' ? 'display-fold' : `display-${k}`);
        let val = params[k];
        if (k === 'fold') {
            if (label) {
                if (val < 0) label.innerText = `Tiling: ${Math.round(-val * 100)}%`;
                else label.innerText = `Fold: ${Math.round(val * 100)}%`;
            }
            if (fill) fill.style.width = (val + 1) * 50 + '%';
        } else {
            if (label) label.innerText = Math.round(val * 100) + '%';
            if (fill) fill.style.width = (val * 100) + '%';
        }
        const range = document.getElementById(`range-${k}`);
        if (range) range.value = val * 100;
    });
    if (mainMaterial) mainMaterial.opacity = params.opacity;
};

// Start
initScene();
initGeometryData();
['fold', 'opacity'].forEach(k => {
    const el = document.getElementById(`range-${k}`);
    if (el) el.oninput = (e) => { params[k] = e.target.value / 100; updateFold(); updateUI(); };
});
const playPauseBtn = document.getElementById('play-pause');
if (playPauseBtn) {
    playPauseBtn.onclick = (e) => {
        params.isPlaying = !params.isPlaying;
        e.target.innerText = params.isPlaying ? "Pause" : "Play";
    };
    if (params.isPlaying) playPauseBtn.innerText = "Pause";
}

updateFold(); updateUI(); animate();

window.addEventListener('message', (e) => {
    if (e.data === 'play') params.isPlaying = true;
    if (e.data === 'pause') params.isPlaying = false;
    if (e.data === 'toggle') params.isPlaying = !params.isPlaying;
    if (playPauseBtn) playPauseBtn.innerText = params.isPlaying ? "Pause" : "Play";
});