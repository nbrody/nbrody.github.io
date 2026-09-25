/**
 * Looking at the domain: picking faces and vertices, the face inspector,
 * highlights, and overlays that make the gluing readable — edges coloured by
 * edge cycle, face labels s_k / s_k⁻¹, certificate lines lit up in the
 * scene, and closed geodesics folded into the domain.
 */
import * as THREE from 'three';
import {
    Matrix2x2, wallSD, projectToWall, applyMatrixToBall, invertWord, reduceWord,
    wallOutwardNormal, ballToMinkowski
} from './math.js';
import { edgeSamples, kleinToBall, ballToKlein } from './polyhedron.js';
import { geodesicInDomain } from './invariants.js';
import { app, sceneMatrix, fordSceneMatrix, sceneAction, wordToMatrix } from './app.js';
import { displayedDomain, displayedHome, faceColors, faceClasses } from './domain.js';
import { camera, renderer, view, toWorld, geomToWorld, disposeGroup, layer } from './scene.js';
import { buildClippedFace, tubeGeometry, state as layerState } from './overlays.js';
import { wordTex, matrixLatex, typeset, escapeHtml } from './format.js';

const highlightGroup = layer(true);
const cycleGroup = layer(false);
const geodesicGroup = layer(true);
const certGroup = layer(true);

export const inspect = {
    selectedFace: -1,
    showCycles: false,
    showLabels: false,
    labels: [],            // [{el, home: Vector3, wall}]
};

/** Scene isometry of the displayed domain's home frame. */
export function displayedScene() {
    return app.fordOn && app.fordScene ? fordSceneMatrix() : sceneMatrix();
}

// ---------------- picking ----------------

function uhsWallSD(p, W) {
    const d = W.z - W.w;
    if (Math.abs(d) < 1e-4) {
        const nl = Math.hypot(W.x, W.y);
        if (nl < 1e-9) return 1e9;
        return (W.x * p.x + W.y * p.z - 0.5 * (W.z + W.w)) / nl;
    }
    const rr = (W.x * W.x + W.y * W.y) / (d * d) + (W.z + W.w) / d;
    if (rr <= 0) return 1e9;
    return Math.sign(d) * (Math.hypot(p.x + W.x / d, p.y, p.z + W.y / d) - Math.sqrt(rr));
}

function mapSDF(p, walls) {
    const uhs = view.model === 'uhs';
    let d = uhs ? -p.y : p.length() - 1.0;
    let bestId = -1;
    for (let i = 0; i < walls.length; i++) {
        const df = uhs ? uhsWallSD(p, walls[i].cov) : wallSD(p, walls[i].geom);
        if (df > d) { d = df; bestId = i; }
    }
    return { d, bestId };
}

export function rayFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    return raycaster.ray;
}

/** Index of the displayed wall hit by the ray, or -1. Also returns the hit point. */
export function pickWall(ray) {
    const D = displayedDomain();
    if (!D || !D.walls.length) return { index: -1 };
    const uhs = view.model === 'uhs';
    const EPS = 0.002, MAX = uhs ? 26 : 10;
    let t = 0.01;
    for (let iter = 0; iter < 300; iter++) {
        const p = ray.origin.clone().addScaledVector(ray.direction, t);
        const outside = uhs ? (p.y < -0.3 || p.y > 16 || Math.abs(p.x) > 16 || Math.abs(p.z) > 16) : p.length() > 2.0;
        if (outside) { t += 0.05; if (t > MAX) return { index: -1 }; continue; }
        const { d, bestId } = mapSDF(p, D.walls);
        if (Math.abs(d) < EPS && bestId >= 0) return { index: bestId, point: p };
        t += Math.max(EPS, Math.abs(d) * 0.9);
        if (t > MAX) return { index: -1 };
    }
    return { index: -1 };
}

/** World point → ball point of the displayed model. */
export function worldToBall(w) {
    if (view.model === 'ball') return w.clone();
    // UHS world (x, t, y) → ball
    const x = w.x, y = w.z, t = w.y;
    const n = x * x + y * y, den = n + (t + 1) * (t + 1);
    return new THREE.Vector3(2 * x / den, 2 * y / den, (n + t * t - 1) / den);
}

// ---------------- skeleton ----------------

let skeleton = null;       // { frameKey, edges: [{id,i,j,samples}], vertices: [{p, ideal, walls}] }

export function invalidateSkeleton() { skeleton = null; }

/** Edges and vertices of the displayed domain, in the scene frame. */
export function getSkeleton() {
    const H = displayedHome();
    if (!H) return { edges: [], vertices: [] };
    const S = displayedScene();
    const key = [S.a.re, S.a.im, S.b.re, S.b.im, S.c.re, S.c.im, S.d.re, S.d.im, H.walls.length].join(',');
    if (skeleton && skeleton.key === key && skeleton.home === H) return skeleton;
    const poly = H.poly;
    const edges = poly.edges.map(e => ({
        id: e.id, i: e.i, j: e.j, angle: e.angle,
        samples: edgeSamples(e, 40).map(p => applyMatrixToBall(S, p))
    }));
    const vertices = poly.vertices.map(v => ({
        p: applyMatrixToBall(S, kleinToBall(v.k.clone().multiplyScalar(v.ideal ? 0.999999 : 1))),
        ideal: v.ideal, walls: v.walls
    }));
    skeleton = { key, home: H, edges, vertices };
    return skeleton;
}

// ---------------- highlights ----------------

export function clearHighlights() {
    disposeGroup(highlightGroup);
}

export function highlightFace(idx, color, group = highlightGroup) {
    const D = displayedDomain();
    if (!D || idx < 0 || idx >= D.walls.length) return;
    const geom = D.walls[idx].geom;
    const pole = projectToWall(D.conePoint, geom);
    const covs = [];
    D.walls.forEach((w, j) => { if (j !== idx) covs.push(w.cov); });
    const out = [];
    buildClippedFace(geom, pole, covs, out, 56, 4);
    if (!out.length) {
        // The pole projection can miss a small face; start from its centre.
        const c = faceCenterScene(idx);
        if (c) buildClippedFace(geom, projectToWall(c, geom), covs, out, 56, 4);
    }
    if (!out.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    geomToWorld(g);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, depthTest: false
    }));
    m.renderOrder = 5;
    group.add(m);
}

export function highlightEdgePath(samples, color, group = highlightGroup, radius = 0.016) {
    const g = tubeGeometry([samples], { radius, sides: 6, taper: false });
    if (!g) return;
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
        transparent: true, depthTest: false, depthWrite: false
    }));
    mesh.renderOrder = 6;
    group.add(mesh);
}

export function highlightPoint(p, color, group = highlightGroup, r = 0.03) {
    const w = toWorld(p);
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(view.model === 'uhs' ? r * Math.max(0.3, w.y) : r, 16, 12),
        new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
            transparent: true, depthTest: false, depthWrite: false
        }));
    mesh.position.copy(w);
    mesh.renderOrder = 6;
    group.add(mesh);
}

// ---------------- face inspector ----------------

export function showFaceInfo(html) {
    const info = document.getElementById('face-info');
    if (!info) return;
    info.innerHTML = html;
    info.style.display = 'block';
    typeset(info);
}

export function hideFaceInfo() {
    const info = document.getElementById('face-info');
    if (info) info.style.display = 'none';
}

export function clearFaceSelection() {
    inspect.selectedFace = -1;
    layerState.focusKind = 'none';
    layerState.focusPoint = null;
    clearHighlights();
    hideFaceInfo();
}

const VERTEX_PICK_PX = 16;

export function pickVertex(clientX, clientY) {
    const sk = getSkeleton();
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    let best = null, bestCam = Infinity;
    for (const v of sk.vertices) {
        if (v.ideal) continue;
        const w = toWorld(v.p);
        const ndc = w.clone().project(camera);
        const px = (ndc.x * 0.5 + 0.5) * rect.width, py = (-ndc.y * 0.5 + 0.5) * rect.height;
        if ((px - cx) ** 2 + (py - cy) ** 2 > VERTEX_PICK_PX * VERTEX_PICK_PX) continue;
        const camDist = w.distanceToSquared(camera.position);
        if (camDist < bestCam) { bestCam = camDist; best = v; }
    }
    return best;
}

/** The edge cycle (certificate) that contains edge `id` of the Dirichlet domain. */
function cycleOfEdge(id) {
    if (app.fordOn || !app.report) return null;
    return (app.report.edgeCycles || []).find(c => c.edges && c.edges.includes(id)) || null;
}

export function selectVertex(v, onFocus) {
    layerState.focusKind = 'vertex';
    layerState.focusPoint = v.p.clone();
    inspect.selectedFace = -1;
    clearHighlights();
    highlightPoint(v.p, 0xfbbf24);
    showFaceInfo(
        `<div class="fi-row"><span class="fi-key">Vertex</span><span>${v.walls.length} faces meet here</span></div>` +
        `<div class="fi-hint">${layerState.showTiling ? 'showing the cells around this vertex' : 'enable Tiling to see the cells around it'}</div>`);
    if (onFocus) onFocus();
}

export function faceLabelText(i) {
    const P = app.report && app.report.presentation;
    if (!P || app.fordOn) return `${i}`;
    const k = P.generators.findIndex(g => g.walls[0] === i || g.walls[1] === i);
    if (k < 0) return `${i}`;
    const g = P.generators[k];
    const sub = String(k + 1).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');
    return g.walls[0] === g.walls[1] ? `s${sub}` : (g.walls[0] === i ? `s${sub}` : `s${sub}⁻¹`);
}

/** Face click: element / edge / plane angle (shift-click a second face). */
export function handleFaceClick(idx, shift, onFocus) {
    const D = displayedDomain();
    const H = displayedHome();
    if (!D || !H) return;
    const wall = D.walls[idx];
    if (shift && inspect.selectedFace >= 0 && inspect.selectedFace !== idx) {
        const a = Math.min(inspect.selectedFace, idx), b = Math.max(inspect.selectedFace, idx);
        const ref = D.walls[inspect.selectedFace];
        const sk = getSkeleton();
        const matching = sk.edges.filter(e => e.i === a && e.j === b);
        const wA = `\\(${wordTex(ref.word, 16)}\\)`, wB = `\\(${wordTex(wall.word, 16)}\\)`;
        clearHighlights();
        if (matching.length) {
            for (const e of matching) highlightEdgePath(e.samples, 0xfde047);
            layerState.focusKind = 'edge';
            layerState.focusPoint = matching[0].samples[Math.floor(matching[0].samples.length / 2)].clone();
            const ang = matching[0].angle * 180 / Math.PI;
            const cyc = cycleOfEdge(matching[0].id);
            const cycLine = cyc && cyc.m ? `<div class="fi-sub">edge cycle of ${cyc.pairs.length} edge${cyc.pairs.length > 1 ? 's' : ''}; ` +
                `angles sum to 2π/${cyc.m}${cyc.m > 1 ? ` — an order-${cyc.m} rotation axis` : ''}</div>` : '';
            showFaceInfo(
                `<div class="fi-row"><span class="fi-key">Edge</span><span>${wA} ∩ ${wB}</span></div>` +
                `<div class="fi-angle">∠ = ${ang.toFixed(2)}°<span class="fi-sub"> = ${(ang / 180).toFixed(4)}π</span></div>` + cycLine +
                (layerState.showTiling ? '<div class="fi-hint">showing the cells around this edge</div>' : ''));
        } else {
            layerState.focusKind = 'none'; layerState.focusPoint = null;
            highlightFace(inspect.selectedFace, 0x38bdf8);
            highlightFace(idx, 0xfbbf24);
            const c1 = ref.cov, c2 = wall.cov;
            const ip = c1.x * c2.x + c1.y * c2.y + c1.z * c2.z - c1.w * c2.w;
            const body = Math.abs(ip) > 1 + 1e-9
                ? `<div class="fi-angle">ultraparallel — distance ${Math.acosh(Math.abs(ip)).toFixed(4)}</div>`
                : `<div class="fi-angle">∠ = ${(Math.acos(Math.max(-1, Math.min(1, -ip))) * 180 / Math.PI).toFixed(2)}°<span class="fi-sub"> (planes, not adjacent)</span></div>`;
            showFaceInfo(`<div class="fi-row"><span class="fi-key">Faces</span><span>${wA} &amp; ${wB}</span></div>${body}`);
        }
        if (onFocus) onFocus();
        return;
    }
    layerState.focusKind = 'none'; layerState.focusPoint = null;
    inspect.selectedFace = idx;
    clearHighlights();
    highlightFace(idx, 0x38bdf8);
    if (wall.pairing && wall.pairing.partner >= 0 && wall.pairing.partner !== idx) highlightFace(wall.pairing.partner, 0xf472b6);
    let typeLabel;
    if (app.fordOn) {
        const M = wall.elem.normalized();
        typeLabel = Math.sqrt(M.c.normSq()) < 1e-9 ? 'chimney wall (fixes the cusp)' : `isometric sphere, radius ${(1 / Math.sqrt(M.c.normSq())).toFixed(4)}`;
    } else {
        typeLabel = wall.kind === 'cone' ? 'rotation (stabilizer cone)' : (wall.isParabolic ? 'cusp (parabolic)' : 'face pairing');
        if (wall.elem.anti) typeLabel = wall.kind === 'cone' ? 'mirror (stabilizer cone)' : 'orientation-reversing pairing';
    }
    let M = null;
    try { M = wordToMatrix(wall.word); } catch (e) { M = null; }
    const partner = wall.pairing && wall.pairing.partner >= 0 && wall.pairing.partner !== idx
        ? `<div class="fi-sub">paired with the pink face by \\(${wordTex(invertWord(wall.word), 16)}\\)</div>` : '';
    showFaceInfo(
        `<div class="fi-row"><span class="fi-key">${escapeHtml(faceLabelText(idx))}</span><span>\\(${wordTex(wall.word, 20)}\\)</span></div>` +
        `<div class="fi-type">${typeLabel}</div>` + partner +
        (M ? `<div class="fi-matrix">${matrixLatex(M)}</div>` : '') +
        '<div class="fi-hint">shift-click a neighbour for the edge · double-click to roll across · click a corner for a vertex</div>');
    if (onFocus) onFocus();
}

// ---------------- Ford pairings (per piece) ----------------

/**
 * The element pairing the piece of Ford face i through scene point p: g⁻¹,
 * then the chimney translation folding the image back. Returns the ACTUAL
 * element and its word.
 */
export function fordPairingAt(i, pScene) {
    const H = app.fordHome;
    if (!H || !app.fordFrame) return null;
    const K = app.fordFrame, Ki = K.inv().normalized();
    const Sf = fordSceneMatrix();
    const p = applyMatrixToBall(Sf.inv().normalized(), pScene);        // Ford home frame
    const w = H.walls[i];
    const vertical = H.walls.map((x, j) => (Math.sqrt(x.elem.normalized().c.normSq()) < 1e-9 ? j : -1)).filter(j => j >= 0);
    let M = w.elem.inv().normalized();
    let word = invertWord(w.word);
    if (!vertical.includes(i)) {
        let y = applyMatrixToBall(M, p);
        for (let it = 0; it < 64; it++) {
            const ky = ballToKlein(y);
            let worst = 1e-9, k = -1;
            for (const j of vertical) {
                const W = H.walls[j].cov;
                const r = (W.x * ky.x + W.y * ky.y + W.z * ky.z - W.w) / Math.hypot(W.x, W.y, W.z);
                if (r > worst) { worst = r; k = j; }
            }
            if (k < 0) break;
            const s = H.walls[k].elem.inv().normalized();
            y = applyMatrixToBall(s, y);
            M = s.mul(M).normalized();
            word = [...invertWord(H.walls[k].word), ...word];
        }
    }
    return { matrix: Ki.mul(M).mul(K).normalized(), word: reduceWord(word) };
}

// ---------------- edge cycles ----------------

const CYCLE_HUES = (k) => new THREE.Color().setHSL((k * 0.6180339887 + 0.05) % 1, 0.78, 0.6);

export function updateEdgeCycles() {
    disposeGroup(cycleGroup);
    cycleGroup.visible = inspect.showCycles;
    if (!inspect.showCycles) return;
    const sk = getSkeleton();
    const cycles = (!app.fordOn && app.report) ? app.report.edgeCycles || [] : [];
    const cycleOf = new Map();
    cycles.forEach((c, k) => (c.edges || []).forEach(id => cycleOf.set(id, k)));
    const byCycle = new Map();
    for (const e of sk.edges) {
        const k = cycleOf.has(e.id) ? cycleOf.get(e.id) : -1;
        if (!byCycle.has(k)) byCycle.set(k, []);
        byCycle.get(k).push(e.samples);
    }
    for (const [k, paths] of byCycle) {
        const g = tubeGeometry(paths, { radius: 0.012, sides: 6, taper: true, minScale: 0.15 });
        if (!g) continue;
        const color = k < 0 ? new THREE.Color(0xcbd5e1) : CYCLE_HUES(k);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1
        }));
        m.renderOrder = 3;
        cycleGroup.add(m);
    }
}

// ---------------- face labels ----------------

function faceCenterHome(i, H = displayedHome()) {
    const poly = H.poly;
    const f = poly.faces[i];
    const pts = f.vertices.map(v => poly.vertices[v].k.clone());
    const fa = poly.freeArcs.find(x => x.wall === i);
    if (fa) for (const [a, b] of fa.arcs) {
        const t = 0.5 * (a + b);
        pts.push(fa.center.clone().addScaledVector(fa.u, fa.rho * Math.cos(t)).addScaledVector(fa.v, fa.rho * Math.sin(t)));
    }
    if (!pts.length) return null;
    const g = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const P = poly.planes[i];
    g.addScaledVector(P.n, (P.c - P.n.dot(g)) / P.n.lengthSq());
    if (g.lengthSq() >= 1) g.multiplyScalar(0.999 / g.length());
    return kleinToBall(g);
}

function faceCenterScene(i) {
    const c = faceCenterHome(i);
    return c ? applyMatrixToBall(displayedScene(), c) : null;
}

export function rebuildFaceLabels() {
    const box = document.getElementById('face-labels');
    if (!box) return;
    box.innerHTML = '';
    inspect.labels = [];
    const H = displayedHome();
    if (!inspect.showLabels || !H) return;
    const colors = faceColors();
    H.walls.forEach((w, i) => {
        const home = faceCenterHome(i, H);
        if (!home) return;
        const el = document.createElement('div');
        el.className = 'face-label';
        el.textContent = faceLabelText(i);
        const c = colors[i] || [0.7, 0.7, 0.8];
        el.style.borderColor = `rgb(${c.map(x => Math.round(255 * Math.min(1, x))).join(',')})`;
        box.appendChild(el);
        inspect.labels.push({ el, home, wall: i });
    });
}

/** Per frame: place the labels, hiding those on faces turned away. */
export function updateFaceLabels() {
    if (!inspect.showLabels || !inspect.labels.length) return;
    const D = displayedDomain();
    if (!D) return;
    const S = displayedScene();
    const rect = renderer.domElement.getBoundingClientRect();
    const camPos = camera.position;
    for (const L of inspect.labels) {
        const p = applyMatrixToBall(S, L.home);
        const w = toWorld(p);
        const wall = D.walls[L.wall];
        let facing = true;
        if (view.model === 'ball' && wall) {
            const n = wallOutwardNormal(p, wall.geom);
            facing = n.dot(w.clone().sub(camPos)) < 0.05;
        }
        const ndc = w.clone().project(camera);
        const vis = facing && ndc.z < 1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
        L.el.style.display = vis ? 'block' : 'none';
        if (!vis) continue;
        L.el.style.transform = `translate(${(ndc.x * 0.5 + 0.5) * rect.width}px, ${(-ndc.y * 0.5 + 0.5) * rect.height}px) translate(-50%, -50%)`;
    }
}

// ---------------- certificate references ----------------

let certRef = null;

/** Light up what a certificate line refers to (toggle). */
export function showCertRef(ref) {
    disposeGroup(certGroup);
    if (!ref || certRef === ref) { certRef = null; return false; }
    certRef = ref;
    if (app.fordOn) return false;
    const sk = getSkeleton();
    for (const i of ref.walls || []) highlightFace(i, 0x38bdf8, certGroup);
    for (const id of ref.edges || []) {
        const e = sk.edges.find(x => x.id === id);
        if (e) highlightEdgePath(e.samples, 0xfde047, certGroup, 0.018);
    }
    const S = displayedScene();
    for (const p of ref.points || []) {
        const v = new THREE.Vector3(p[0], p[1], p[2]);
        const q = applyMatrixToBall(S, v.lengthSq() >= 1 ? v.clone().multiplyScalar(0.9995) : v);
        highlightPoint(q, 0xf472b6, certGroup, 0.04);
    }
    return true;
}

export function clearCertRef() { certRef = null; disposeGroup(certGroup); }

// ---------------- closed geodesics ----------------

let geodesicSel = null;       // { word, color }

export function showGeodesic(word, color = 0xfbbf24) {
    const was = !!geodesicSel;
    geodesicSel = word ? { word, color } : null;
    if (was !== !!geodesicSel) window.dispatchEvent(new CustomEvent('poincare:geodesic', { detail: !!geodesicSel }));
    updateGeodesic();
}

export function updateGeodesic() {
    disposeGroup(geodesicGroup);
    if (!geodesicSel || !app.scene) return null;
    let res = null;
    try {
        const m = sceneAction(wordToMatrix(geodesicSel.word));
        res = geodesicInDomain(app.scene.walls, m);
    } catch (e) { res = null; }
    if (!res || !res.segments.length) return res;
    const g = tubeGeometry(res.segments, { radius: 0.013, sides: 8, taper: true, minScale: 0.12 });
    if (g) {
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
            color: geodesicSel.color, emissive: geodesicSel.color, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.1
        }));
        m.renderOrder = 4;
        geodesicGroup.add(m);
    }
    // Where each segment crosses a face, mark it: the geodesic continues
    // from the matching point of the partner face.
    for (const seg of res.segments) {
        highlightPoint(seg[0], geodesicSel.color, geodesicGroup, 0.012);
        highlightPoint(seg[seg.length - 1], geodesicSel.color, geodesicGroup, 0.012);
    }
    return res;
}

export function refreshInspectOverlays() {
    invalidateSkeleton();
    if (inspect.showCycles) updateEdgeCycles();
    updateGeodesic();
    if (certRef) { const r = certRef; certRef = null; showCertRef(r); }
}
