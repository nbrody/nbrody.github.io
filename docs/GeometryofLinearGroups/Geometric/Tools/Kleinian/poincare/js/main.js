/**
 * The Poincaré workbench: wiring. Domain computation runs in a Web Worker
 * (domainService.js → compute.js); the page keeps the result in a home frame
 * and moves a scene copy rigidly, so animations, flight and basepoint drags
 * never block. See app.js for the frame conventions.
 */
import * as THREE from 'three';
import { Matrix2x2, reduceWord, invertWord, hypDist, translationTowards, applyMatrixToBall, wallSD } from './math.js';
import { NumberField, parsePoly, serializeExactContext } from './exact.js';
import { exportDomainAs3MF } from './export3mf.js';
import { createInsideView } from './insideView.js';
import { createLimitSet } from './limitSet.js';
import { mirrorFragmentShader } from './mirror.js';
import { vertexShader } from './shaders.js';
import { setupMatrixInput, getMatricesFromUI, configureExact, getExactContext, getInputState, loadExample } from './matrixInput.js';
import { setupControlPanel, readBoundedInteger, updateToggleBtn } from './controlPanel.js';
import { createDomainService } from './domainService.js';
import { matToArr } from './compute.js';
import {
    app, sceneMatrix, outerFrame, homeGenerators, wordToMatrix, viewIsDirty
} from './app.js';
import {
    installResult, retargetScene, displayedDomain, standardGenerators, faceColors, invalidateFaceColors
} from './domain.js';
import {
    scene, camera, renderer, controls, material, mesh, ballBox, uhsBox, view, theme,
    applyThemeUniforms, setModelCamera, loadDomainUniforms, applyViewOffset
} from './scene.js';
import {
    state as layers, updateCayley, setWallsOpacity, updateDual, setDualOpacity,
    updateTiling, updateDust, startOrbit, stopOrbit, updateOrbitInstances,
    markOrbitDirty, recolorOrbit, refreshLayers, orbitRun, geodesicPoints, bisectorMesh
} from './overlays.js';
import { showIsometryAxis } from './isoAxis.js';
import {
    inspect, pickWall, rayFromEvent, pickVertex, selectVertex, handleFaceClick, clearFaceSelection,
    updateEdgeCycles, rebuildFaceLabels, updateFaceLabels, refreshInspectOverlays, fordPairingAt,
    invalidateSkeleton, worldToBall
} from './inspector.js';
import {
    setBanner, bannerForReport, renderCertificate, renderPresentation, renderStabilizer,
    renderStdGenerators, renderCurrentElement, renderUserElements, userElements, parseWord
} from './panels.js';
import { renderInvariants, clearGeodesicSelection } from './invariantsPanel.js';
import { horo, updateHoroballs } from './horoballs.js';
import {
    manifoldFragmentShader, honeycombFragmentShader, makeTessellationUniforms, loadTessellationUniforms
} from './tessellation.js';
import { readStateFromURL, writeStateToURL } from './permalink.js';

const EMBED = document.documentElement.classList.contains('embed-mode');
const service = createDomainService({ version: window.APP_VERSION || '' });

// ---------------- render modes ----------------

const limitSet = createLimitSet(scene);
const domainFragment = material.fragmentShader;
let mirrorMode = false;

function makeTessMaterial(fragmentShader) {
    const uniforms = {
        ...makeTessellationUniforms(),
        u_cameraPos: { value: new THREE.Vector3() },
        u_lightMode: material.uniforms.u_lightMode,
        u_bgColor: material.uniforms.u_bgColor,
        u_opacity: { value: 1 },
    };
    return new THREE.ShaderMaterial({
        uniforms, vertexShader, fragmentShader,
        transparent: true, depthWrite: true, depthTest: true, side: THREE.BackSide
    });
}
const honeycombMaterial = makeTessMaterial(honeycombFragmentShader);
const manifoldMaterial = makeTessMaterial(manifoldFragmentShader);
const render = { honeycomb: false, manifold: false };

function activeMaterial() {
    if (render.manifold && insideView.isActive()) return manifoldMaterial;
    if (render.honeycomb && view.model === 'ball' && !insideView.isActive()) return honeycombMaterial;
    return material;
}

function syncMaterial() {
    const m = activeMaterial();
    if (mesh.material !== m) mesh.material = m;
    if (m === material) {
        const frag = mirrorMode ? mirrorFragmentShader : domainFragment;
        if (material.fragmentShader !== frag) { material.fragmentShader = frag; material.needsUpdate = true; }
    }
    if (m !== material) {
        const ok = loadTessellationUniforms(m.uniforms, app.scene, faceColors(app.scene));
        if (!ok) {
            const why = !app.scene ? 'no domain yet'
                : app.scene.walls.length > 64 ? `the domain has ${app.scene.walls.length} faces (the view holds 64)`
                    : 'some face has no pairing (the certificate failed)';
            setBanner('warning', `${m === honeycombMaterial ? 'Honeycomb' : 'Manifold'} view unavailable: ${why}.`);
            if (m === honeycombMaterial) setHoneycomb(false); else setManifold(false);
            return;
        }
        if (m === manifoldMaterial && app.scene) {
            const c = app.scene.conePoint;
            const r2 = c.lengthSq();
            m.uniforms.u_center.value.set(2 * c.x / (1 - r2), 2 * c.y / (1 - r2), 2 * c.z / (1 - r2), (1 + r2) / (1 - r2));
        }
    }
}

function setMirrorMode(on) {
    mirrorMode = on;
    updateToggleBtn(document.getElementById('toggle-mirror'), on);
    syncMaterial();
}

function setHoneycomb(on) {
    render.honeycomb = on;
    updateToggleBtn(document.getElementById('toggle-honeycomb'), on);
    if (on && view.model !== 'ball') setViewModel('ball');
    // The honeycomb marches through every tile per pixel: keep it affordable.
    renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, 2));
    syncMaterial();
}

function setManifold(on) {
    render.manifold = on;
    updateToggleBtn(document.getElementById('toggle-manifold'), on);
    if (on && !insideView.isActive()) setInsideView(true);
    syncMaterial();
}

// ---------------- scene updates ----------------

/** Everything that rides the scene isometry. `fast` while moving. */
function onSceneMoved({ fast = false } = {}) {
    retargetScene();
    const D = displayedDomain();
    loadDomainUniforms(D, faceColors(D));
    refreshLayers({ fast });
    updateLimitSet();
    if (mesh.material !== material && app.scene) loadTessellationUniforms(mesh.material.uniforms, app.scene, faceColors(app.scene));
    if (!fast) {
        refreshInspectOverlays();
        updateHoroballs();
    }
    markOrbitDirty();
}

function limitWallColor(wall) {
    const w = wall.word;
    const k = (w && w.length) ? w[0] : 1;
    const slot = 2 * (Math.abs(k) - 1) + (k < 0 ? 1 : 0);
    const cols = theme().generators;
    return cols[slot % cols.length];
}

function updateLimitSet() {
    if (!limitSet.isEnabled()) return;
    if (!app.scene || !app.scene.walls.some(w => w.pairing)) return;
    limitSet.update(app.scene, limitWallColor);
}

// ---------------- computing ----------------

let computeSeq = 0;

function computeInput() {
    const exact = getExactContext();
    return {
        gens: homeGenerators().map(matToArr),
        origGens: app.matrices.map(matToArr),
        B: matToArr(app.basepoint),
        maxFaces: app.maxFaces,
        maxDepth: app.depth,
        fullDirichlet: app.fullDirichlet,
        exact: exact ? serializeExactContext(exact) : null,
        ford: app.fordOn ? { cusp: app.fordCusp } : null,
    };
}

let installedSig = null;      // input signature of the domain on screen
let pendingSig = null;        // …and of the request in flight

/**
 * Compute the domain for the current inputs (worker; coalesced). A request
 * identical to the one on screen or in flight is not repeated — loading a
 * preset fires both the exact-field handler and the editor's refresh.
 */
async function requestCompute({ quiet = false, force = false } = {}) {
    if (!app.matrices.length) {
        setBanner('warning', 'Add at least one generator.');
        return;
    }
    const input = computeInput();
    const sig = JSON.stringify(input);
    if (!force && sig === pendingSig) return;
    if (!force && sig === installedSig && !pendingSig) {
        if (staleShown) showReportBanner();      // a typo was fixed back to the group on screen
        window.dispatchEvent(new CustomEvent('poincare:refreshed'));
        return;
    }
    pendingSig = sig;
    const seq = ++computeSeq;
    app.computing = true;
    const pendingTimer = quiet ? null : setTimeout(() => {
        if (seq === computeSeq && app.computing) setBanner('pending', 'Computing the domain and its certificate…', { persist: true });
    }, 150);
    const t0 = performance.now();
    const res = await service.request(input);
    if (pendingTimer) clearTimeout(pendingTimer);
    if (res.stale || seq !== computeSeq) return;
    app.computing = false;
    pendingSig = null;
    installedSig = res.error ? null : sig;
    if (res.error) {
        console.error('[compute]', res.error);
        setBanner('failed', `Computation error: ${res.error}`, { persist: true });
        return;
    }
    const result = res.result;
    installResult(result);
    if (app.fordOn && (!app.ford || app.ford.error)) {
        const msg = app.ford ? app.ford.error : 'Cusp view unavailable.';
        setCuspView(false, { recompute: false });
        setBanner('warning', msg);
    }
    afterInstall(result, performance.now() - t0);
}

function afterInstall(result, ms) {
    invalidateFaceColors();
    invalidateSkeleton();
    clearFaceSelection();
    clearGeodesicSelection();
    onSceneMoved();
    syncMaterial();
    renderStabilizer();
    renderStdGenerators(applyStdGenerator);
    renderCurrentElement();
    renderUserElements(applyMatrixWord);
    renderCertificate(app.report);
    renderPresentation(app.report && app.report.presentation, app.report && app.report.ok);
    renderInvariants(applyMatrixWord);
    updateCuspControls();
    updateEdgeCycles();
    rebuildFaceLabels();
    staleShown = false;           // renderCertificate above drew the fresh report
    showReportBanner();
    const faces = app.home ? app.home.walls.length : 0;
    const notes = [...(app.home ? app.home.notes : []), ...((app.fordHome && app.fordHome.notes) || [])];
    if (notes.length) console.info('[domain]', notes.join('; '));
    console.info(`[domain] ${faces} faces, ${app.report ? app.report.status : '?'} in ${Math.round(ms)} ms`, result.timing);
    updatePermalink();
    window.dispatchEvent(new CustomEvent('poincare:refreshed'));
}

// The inputs failed to parse: whatever is on screen (or still arriving from
// the worker) belongs to the last valid group.
let inputError = null;
let staleShown = false;

function showInputError() {
    staleShown = true;
    setBanner('stale', `Input error — ${inputError} The picture still shows the last valid group.`, { persist: true });
    renderCertificate(app.report, true);
}

function showReportBanner() {
    if (inputError) { showInputError(); return; }
    if (staleShown) { staleShown = false; renderCertificate(app.report); }
    const faces = app.home ? app.home.walls.length : 0;
    const exactCtx = getExactContext();
    const exactNote = app.report && app.report.exactUsed && exactCtx
        ? ` Relations exact over ${exactCtx.field.describe()}; geometry numerical.` : '';
    if (app.home && app.home.stabilizer.capped) {
        setBanner('failed', '✗ Basepoint stabilizer did not close into a finite group — the group is likely NOT discrete.');
    } else {
        bannerForReport(app.report, faces, exactNote);
    }
}

/** Read the inputs, reset the view, and recompute. */
function refreshFromUI() {
    const errorEl = document.getElementById('matrix-error-message');
    try {
        app.matrices = getMatricesFromUI();
        app.exactCtx = getExactContext();
        const wl = document.getElementById('wordLength');
        if (wl) app.depth = readBoundedInteger(wl, 8);
        if (errorEl) errorEl.textContent = '';
    } catch (e) {
        if (errorEl) errorEl.textContent = e.message;
        inputError = e.message;
        showInputError();
        return;
    }
    inputError = null;
    app.viewMatrix = Matrix2x2.identity();
    app.cumulativeWord = [];
    if (insideView.isActive()) app.flyMatrix = entryFlyMatrix();
    updateIsometryButtons();
    renderUserElements(applyMatrixWord);
    if (orbitRun) startOrbit();
    if (app.home) onSceneMoved();
    requestCompute();
}

// ---------------- isometry animation ----------------

function applyMatrixInstant(g, word, onDone) {
    app.viewMatrix = app.viewMatrix.mul(g).normalized();
    app.cumulativeWord = reduceWord([...app.cumulativeWord, ...word]);
    onSceneMoved();
    renderCurrentElement();
    if (onDone) onDone();
}

function animateMatrix(g, word, onDone) {
    if (app.animating) return;
    if (g.anti) { applyMatrixInstant(g, word, onDone); return; }
    let X;
    try { X = g.log(); } catch (e) { applyMatrixInstant(g, word, onDone); return; }
    const startView = app.viewMatrix;
    const S0 = sceneMatrix();
    const axis = showIsometryAxis(g, outerFrame(), X, S0, sceneMatrix, layers.showDust);
    const duration = 1000;
    const t0 = performance.now();
    app.animating = true;
    const step = (now) => {
        const t = Math.min((now - t0) / duration, 1);
        const e = t * t * (3 - 2 * t);
        const tX = new Matrix2x2(X.a.mul(e), X.b.mul(e), X.c.mul(e), X.d.mul(e));
        app.viewMatrix = startView.mul(Matrix2x2.exp(tX));
        axis.onFrame();
        onSceneMoved({ fast: true });
        if (t < 1) { requestAnimationFrame(step); return; }
        app.animating = false;
        app.viewMatrix = startView.mul(g).normalized();
        app.cumulativeWord = reduceWord([...app.cumulativeWord, ...word]);
        onSceneMoved();
        axis.finish();
        renderCurrentElement();
        if (onDone) onDone();
    };
    requestAnimationFrame(step);
}

function applyMatrixWord(M, word) { animateMatrix(M, word); }

function applyStdGenerator(gen, e) {
    if (app.animating || !gen.matrix) return;
    const inv = e && (e.metaKey || e.ctrlKey);
    animateMatrix(inv ? gen.matrix.inv().normalized() : gen.matrix, inv ? invertWord(gen.word) : [...gen.word]);
}

function animateGenerator(idx, e) {
    if (app.animating || idx >= app.matrices.length) return;
    const inv = e && (e.metaKey || e.ctrlKey);
    const g = app.matrices[idx];
    animateMatrix(inv ? g.inv().normalized() : g, [inv ? -(idx + 1) : idx + 1]);
}

// ---------------- inside view ----------------

const ORIGIN = new THREE.Vector3(0, 0, 0);
const FLY_HORIZON = 1 - 1e-9;

const insideView = createInsideView({
    camera, controls, renderer,
    onExit: () => {
        app.flying = false;
        app.flyMatrix = Matrix2x2.identity();
        document.documentElement.classList.remove('inside-mode');
        updateToggleBtn(document.getElementById('view-inside'), false);
        const uhsBtn = document.getElementById('view-uhs');
        if (uhsBtn) uhsBtn.disabled = false;
        if (render.manifold) { render.manifold = false; updateToggleBtn(document.getElementById('toggle-manifold'), false); }
        syncMaterial();
        onSceneMoved();
    }
});

/** Fly matrix that puts the eye at the domain's centre (S = identity). */
function entryFlyMatrix() {
    const was = app.flying;
    app.flying = false;
    const S = sceneMatrix();
    app.flying = was;
    return S.inv().normalized();
}

function setInsideView(on) {
    if (on === insideView.isActive()) return;
    if (!on) { insideView.exit(); return; }
    if (view.model !== 'ball') setViewModel('ball');
    if (mirrorMode) setMirrorMode(false);
    if (render.honeycomb) setHoneycomb(false);
    clearFaceSelection();
    app.flyMatrix = entryFlyMatrix();
    app.flying = true;
    document.documentElement.classList.add('inside-mode');
    updateToggleBtn(document.getElementById('view-inside'), true);
    const uhsBtn = document.getElementById('view-uhs');
    if (uhsBtn) uhsBtn.disabled = true;
    insideView.enter();
    onSceneMoved({ fast: true });
    syncMaterial();
    updateInsideHud();
}

function updateInsideHud() {
    const el = document.getElementById('inside-distance');
    if (!el) return;
    const d = app.scene ? hypDist(ORIGIN, app.scene.conePoint) : 0;
    el.textContent = Number.isFinite(d) ? d.toFixed(2) : '—';
}

// Stepping through a face re-enters through its partner: the walk is through
// the quotient manifold, not out of a lone polyhedron.
function wrapIntoDomain() {
    const walls = app.scene && app.scene.walls;
    if (!walls || !walls.length) return false;
    let wrapped = false;
    for (let iter = 0; iter < 12; iter++) {
        let crossed = -1, worst = 1e-6;
        for (let i = 0; i < walls.length; i++) {
            const sd = wallSD(ORIGIN, walls[i].geom);
            if (sd > worst) { worst = sd; crossed = i; }
        }
        if (crossed < 0 || !walls[crossed].pairing) break;
        const S = sceneMatrix();
        app.flyMatrix = S.mul(app.home.walls[crossed].elem).mul(S.inv()).mul(app.flyMatrix).normalized();
        retargetScene();
        wrapped = true;
    }
    return wrapped;
}

function applyFly(move) {
    const next = move.mul(app.flyMatrix).normalized();
    const q0 = app.home ? app.home.q0 : ORIGIN;
    const was = app.flyMatrix;
    app.flyMatrix = next;
    if (applyMatrixToBall(sceneMatrix(), q0).lengthSq() >= FLY_HORIZON) { app.flyMatrix = was; return false; }
    retargetScene();
    wrapIntoDomain();
    onSceneMoved({ fast: true });
    updateInsideHud();
    return true;
}

const _flyHeading = new THREE.Vector3();
function flyBy(delta) {
    if (!insideView.isActive() || !delta) return false;
    return applyFly(translationTowards(camera.getWorldDirection(_flyHeading), -delta));
}

// ---------------- view model / theme ----------------

function setViewModel(model) {
    if (model === view.model) return;
    view.model = model;
    const uhs = model === 'uhs';
    material.uniforms.u_uhs.value = uhs;
    mesh.geometry = uhs ? uhsBox : ballBox;
    limitSet.setViewModel(model);
    if (uhs) {
        if (mirrorMode) setMirrorMode(false);
        if (render.honeycomb) setHoneycomb(false);
    }
    setModelCamera();
    clearFaceSelection();
    invalidateSkeleton();
    for (const id of ['toggle-mirror', 'toggle-honeycomb']) {
        const b = document.getElementById(id);
        if (b) b.disabled = uhs;
    }
    const row = document.getElementById('cutaway-row');
    if (row) row.classList.toggle('disabled', !uhs);
    updateToggleBtn(document.getElementById('view-uhs'), uhs);
    if (layers.showDust) updateDust();
    onSceneMoved();
    rebuildFaceLabels();
    syncMaterial();
}

function setTheme(mode) {
    if (mode !== 'light' && mode !== 'dark') return;
    view.theme = mode;
    applyThemeUniforms();
    limitSet.setLightMode(mode === 'light');
    if (layers.showDust) updateDust();
    recolorOrbit();
    onSceneMoved();
    document.getElementById('theme-dark')?.classList.toggle('active', mode === 'dark');
    document.getElementById('theme-light')?.classList.toggle('active', mode === 'light');
}

// ---------------- cusp view (Ford domain + horoballs) ----------------

let opacityBeforeCusp = null;

function setCuspView(on, { recompute = true } = {}) {
    app.fordOn = on;
    updateToggleBtn(document.getElementById('toggle-cusp'), on);
    const hbBtn = document.getElementById('toggle-horoballs');
    if (hbBtn) hbBtn.disabled = !on;
    if (on) {
        horo.on = true;
        updateToggleBtn(hbBtn, true);
        if (view.model !== 'uhs') setViewModel('uhs');
        frameCuspPending = true;
        // The horoballs sit under the floor of isometric spheres: see through it.
        if (material.uniforms.u_opacity.value > 0.5) { opacityBeforeCusp = material.uniforms.u_opacity.value; setPolyhedronOpacity(0.45); }
    } else {
        if (opacityBeforeCusp !== null) { setPolyhedronOpacity(opacityBeforeCusp); opacityBeforeCusp = null; }
        horo.on = false;
        updateToggleBtn(hbBtn, false);
        updateHoroballs();
    }
    if (recompute && on && !(app.ford && app.ford.domain && app.ford.cusp === app.fordCusp)) {
        requestCompute();
    } else {
        onSceneMoved();
        updateCuspControls();
    }
    rebuildFaceLabels();
    renderInvariants(applyMatrixWord);
}

function updateCuspControls() {
    const sel = document.getElementById('cusp-select');
    const info = document.getElementById('cusp-info');
    if (!sel || !info) return;
    const F = app.ford;
    if (!app.fordOn || !F || F.error) {
        sel.innerHTML = '';
        sel.disabled = true;
        info.textContent = F && F.error ? F.error : '';
        return;
    }
    sel.disabled = F.cusps.length < 2;
    sel.innerHTML = F.cusps.map((_, i) => `<option value="${i}"${i === F.cusp ? ' selected' : ''}>cusp ${i + 1}</option>`).join('');
    const vol = F.volume != null ? `Ford domain volume ${F.volume.toFixed(9)}` : 'infinite volume';
    const H = F.horoballs ? ` · maximal cusp height H = ${F.horoballs.H.toFixed(4)}` : '';
    info.textContent = `${F.domain.walls.length} faces · ${vol}${H}. The certificate refers to the Dirichlet domain.`;
    // Open the chimney above the tallest isometric sphere.
    const cut = document.getElementById('cutaway');
    const R = F.domain.maxRadius || 1;
    if (cut && !cutawayTouched) {
        cut.value = String(Math.min(4, 1.25 * R));
        material.uniforms.u_ceiling.value = parseFloat(cut.value);
    }
    if (frameCuspPending) { frameCuspPending = false; frameCuspCamera(); }
}
let cutawayTouched = false;
let frameCuspPending = false;

/** Stand back far enough to see the chimney over a few cusp-lattice cells. */
function frameCuspCamera() {
    const lat = app.ford && app.ford.horoballs ? app.ford.horoballs.lattice : [];
    const E = Math.max(1, ...lat.map(t => Math.hypot(t[0], t[1])));
    camera.position.set(0.3 * E, 1.45 * E + 1.2, 1.3 * E + 1);
    controls.target.set(0, 0.35, 0);
    controls.update();
}

// ---------------- basepoint ----------------

function setBasepointFromBall(p) {
    const r = Math.hypot(p[0], p[1], p[2]);
    app.basepointBall = p.slice();
    if (r < 1e-9) app.basepoint = Matrix2x2.identity();
    else {
        const dir = new THREE.Vector3(p[0] / r, p[1] / r, p[2] / r);
        app.basepoint = translationTowards(dir, 2 * Math.atanh(Math.min(r, 0.999)));
    }
    const out = document.getElementById('basepoint-readout');
    if (out) out.textContent = r < 1e-9 ? 'at j = (0, 0, 1)' : `hyperbolic distance ${(2 * Math.atanh(r)).toFixed(3)} from j`;
    if (app.home) onSceneMoved({ fast: true });
    requestCompute({ quiet: true });
}

// ---------------- permalinks ----------------

function currentState() {
    const inputs = getInputState();
    const exact = getExactContext();
    return {
        v: 1,
        ...inputs,
        exact: exact ? {
            gen: exact.field.gen,
            minpoly: document.getElementById('field-minpoly')?.value || '',
            rootIndex: exact.field.rootIndex,
            conj: pendingConjExpr
        } : null,
        depth: app.depth, faces: app.maxFaces,
        bp: app.basepointBall.some(x => Math.abs(x) > 1e-9) ? app.basepointBall : undefined,
        cusp: app.fordOn ? app.fordCusp : undefined,
        model: view.model !== 'ball' ? view.model : undefined,
        theme: view.theme !== 'dark' ? view.theme : undefined,
    };
}

function updatePermalink() {
    if (EMBED || inputError) return null;       // the URL keeps the last valid group
    try { return writeStateToURL(currentState()); } catch (e) { return null; }
}

// ---------------- exact arithmetic panel ----------------

let exactOn = false;
let currentField = null;
let pendingConjExpr = null;

function applyConj(field) {
    try { field.setConjugation(pendingConjExpr); }
    catch (e) { field.conjPowers = null; field.conjIsIdentity = false; }
}

function rebuildField({ rootIndex = null } = {}) {
    const rootSel = document.getElementById('field-root');
    const fieldErr = document.getElementById('field-error');
    if (!exactOn) { currentField = null; configureExact(null); refreshFromUI(); return; }
    const gen = (document.getElementById('field-gen-name').value || 'w').trim();
    const mp = (document.getElementById('field-minpoly').value || gen).trim();
    try {
        const field = new NumberField(parsePoly(mp, gen), gen);
        const prev = rootIndex ?? (parseInt(rootSel.value || '0', 10) || 0);
        rootSel.innerHTML = '';
        field.roots.forEach((r, i) => {
            const o = document.createElement('option');
            o.value = String(i);
            const re = r.re.toFixed(6), im = Math.abs(r.im).toFixed(6);
            o.textContent = r.im === 0 ? `${gen} ≈ ${re}` : `${gen} ≈ ${re} ${r.im > 0 ? '+' : '−'} ${im}i`;
            rootSel.appendChild(o);
        });
        field.rootIndex = Math.min(prev, field.roots.length - 1);
        rootSel.value = String(field.rootIndex);
        if (fieldErr) fieldErr.textContent = '';
        applyConj(field);
        currentField = field;
        configureExact(field);
    } catch (e) {
        if (fieldErr) fieldErr.textContent = e.message;
        currentField = null;
        configureExact(null);
    }
    refreshFromUI();
}

function setExactUI(on) {
    exactOn = on;
    updateToggleBtn(document.getElementById('toggle-exact'), on);
    const panel = document.getElementById('exact-field-panel');
    if (panel) panel.style.display = on ? 'block' : 'none';
}

function initExactPanel() {
    const exactBtn = document.getElementById('toggle-exact');
    const rootSel = document.getElementById('field-root');
    exactBtn?.addEventListener('click', () => { setExactUI(!exactOn); rebuildField(); });
    ['field-gen-name', 'field-minpoly'].forEach(id => document.getElementById(id)?.addEventListener('change', () => rebuildField()));
    rootSel?.addEventListener('change', () => {
        if (!currentField) return;
        currentField.rootIndex = parseInt(rootSel.value, 10) || 0;
        applyConj(currentField);
        configureExact(currentField);
        refreshFromUI();
    });
    // Presets and permalinks configure exact mode programmatically:
    //   detail = { gen?, minpoly, root: {re, im}?, rootIndex?, conj? } | null
    window.addEventListener('poincare:set-exact', (ev) => {
        const spec = ev.detail;
        if (!spec) {
            if (exactOn) { setExactUI(false); pendingConjExpr = null; rebuildField(); }
            else refreshFromUI();
            return;
        }
        document.getElementById('field-gen-name').value = spec.gen || 'w';
        document.getElementById('field-minpoly').value = spec.minpoly;
        pendingConjExpr = spec.conj || null;
        setExactUI(true);
        let idx = spec.rootIndex ?? null;
        if (idx === null && spec.root) {
            try {
                const f = new NumberField(parsePoly(spec.minpoly, spec.gen || 'w'), spec.gen || 'w');
                let bd = Infinity;
                f.roots.forEach((r, i) => {
                    const d = Math.hypot(r.re - spec.root.re, r.im - spec.root.im);
                    if (d < bd) { bd = d; idx = i; }
                });
            } catch (e) { idx = 0; }
        }
        rebuildField({ rootIndex: idx ?? 0 });
    });
}

// ---------------- UI wiring ----------------

let metaHeld = false;
function isoLabel(idx) {
    const anti = app.matrices[idx] && app.matrices[idx].anti;
    const base = anti ? `<span class="anti-gen">g<sub>${idx + 1}</sub></span>` : `g<sub>${idx + 1}</sub>`;
    return base + (metaHeld ? '<sup>−1</sup>' : '');
}

function updateIsometryButtons() {
    const c = document.getElementById('isometry-controls');
    if (!c) return;
    c.innerHTML = '';
    app.matrices.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.dataset.gen = idx;
        btn.innerHTML = isoLabel(idx);
        btn.title = 'Apply this generator (⌘/Ctrl-click for its inverse)';
        btn.addEventListener('click', (e) => animateGenerator(idx, e));
        c.appendChild(btn);
    });
}

function setMetaHeld(v) {
    if (metaHeld === v) return;
    metaHeld = v;
    document.querySelectorAll('#isometry-controls .isometry-btn').forEach(btn => {
        btn.innerHTML = isoLabel(parseInt(btn.dataset.gen, 10));
    });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMetaHeld(true); });
document.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMetaHeld(false); });
window.addEventListener('blur', () => setMetaHeld(false));

function bindToggle(id, fn) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => { if (!btn.disabled) fn(btn); });
    return btn;
}

let panelUI = null;

/** Polyhedron opacity through the slider, so its display stays in sync. */
function setPolyhedronOpacity(o) {
    material.uniforms.u_opacity.value = o;
    mesh.visible = o > 0;
    panelUI?.sliders?.polyhedron?.setValue(o);
}

// A closed geodesic runs INSIDE the domain: make the domain translucent while
// one is shown, and restore the opacity afterwards.
let opacityBeforeGeodesic = null;
window.addEventListener('poincare:geodesic', (e) => {
    const on = !!e.detail;
    if (on && opacityBeforeGeodesic === null) {
        opacityBeforeGeodesic = material.uniforms.u_opacity.value;
        if (opacityBeforeGeodesic > 0.4) setPolyhedronOpacity(0.3);
    } else if (!on && opacityBeforeGeodesic !== null) {
        setPolyhedronOpacity(opacityBeforeGeodesic);
        opacityBeforeGeodesic = null;
    }
});

function initUI() {
    panelUI = setupControlPanel({
        onPolyhedronOpacity: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onWallsOpacity: (o) => setWallsOpacity(o),
        onCayleyModeChange: (mode) => { layers.cayleyMode = mode; updateCayley(); },
        onDualModeChange: (mode) => {
            layers.dualMode = mode;
            document.getElementById('dual-opacity-row')?.classList.toggle('disabled', mode === 'off');
            updateDual();
        },
        onDualOpacityChange: (o) => setDualOpacity(o),
        onAutoRotateToggle: (btn) => { controls.autoRotate = !controls.autoRotate; updateToggleBtn(btn, controls.autoRotate); },
        onResetCamera: (btn) => { setModelCamera(); controls.autoRotate = false; updateToggleBtn(btn, false); },
        onFaceCountChange: (count) => { app.maxFaces = count; requestCompute(); },
        onWordLengthChange: (depth) => { app.depth = depth; requestCompute(); },
        onPaletteChange: () => { invalidateFaceColors(); onSceneMoved(); rebuildFaceLabels(); },
        onPanelLayout: (width) => applyViewOffset(width),
        controls, mesh, material
    });

    bindToggle('toggle-mirror', () => setMirrorMode(!mirrorMode));
    bindToggle('toggle-honeycomb', () => setHoneycomb(!render.honeycomb));
    bindToggle('toggle-manifold', () => setManifold(!render.manifold));
    bindToggle('view-uhs', () => setViewModel(view.model === 'uhs' ? 'ball' : 'uhs'));
    bindToggle('view-inside', () => setInsideView(!insideView.isActive()));
    bindToggle('toggle-full-domain', (btn) => {
        app.fullDirichlet = !app.fullDirichlet;
        updateToggleBtn(btn, app.fullDirichlet);
        requestCompute();
    });
    bindToggle('toggle-tiling', (btn) => {
        layers.showTiling = !layers.showTiling;
        updateToggleBtn(btn, layers.showTiling);
        updateTiling();
    });
    bindToggle('toggle-cycles', (btn) => {
        inspect.showCycles = !inspect.showCycles;
        updateToggleBtn(btn, inspect.showCycles);
        updateEdgeCycles();
    });
    bindToggle('toggle-labels', (btn) => {
        inspect.showLabels = !inspect.showLabels;
        updateToggleBtn(btn, inspect.showLabels);
        rebuildFaceLabels();
    });
    bindToggle('toggle-cusp', () => setCuspView(!app.fordOn));
    bindToggle('toggle-horoballs', (btn) => {
        horo.on = !horo.on;
        updateToggleBtn(btn, horo.on);
        updateHoroballs();
    });
    document.getElementById('cusp-select')?.addEventListener('change', (e) => {
        app.fordCusp = parseInt(e.target.value, 10) || 0;
        requestCompute();
    });
    const cut = document.getElementById('cutaway');
    cut?.addEventListener('input', () => {
        cutawayTouched = true;
        material.uniforms.u_ceiling.value = parseFloat(cut.value);
    });

    const limitBtn = document.getElementById('toggle-limitset');
    const limitRow = document.getElementById('limit-depth-row');
    const limitIters = document.getElementById('limit-iters');
    limitBtn?.addEventListener('click', () => {
        const on = !limitSet.isEnabled();
        limitSet.setEnabled(on);
        updateToggleBtn(limitBtn, on);
        limitRow?.classList.toggle('disabled', !on);
        if (on) {
            const used = app.scene ? limitSet.update(app.scene, limitWallColor) : 0;
            if (used === 0) setBanner('warning', 'No face pairings yet — the limit set needs a domain whose faces pair up.');
        }
    });
    if (limitIters) {
        limitIters.addEventListener('input', () => limitSet.setIterations(parseInt(limitIters.value, 10)));
        limitSet.setIterations(parseInt(limitIters.value, 10));
    }

    initExactPanel();

    document.querySelectorAll('.theme-opt').forEach(btn => btn.addEventListener('click', () => setTheme(btn.dataset.theme)));

    // Stored elements
    const wordInput = document.getElementById('word-input');
    const wordErr = document.getElementById('word-error');
    const setWordError = (msg) => { if (wordErr) wordErr.textContent = msg || ''; };
    const addElement = (word) => { userElements.push({ word }); setWordError(''); renderUserElements(applyMatrixWord); };
    const storeTyped = () => {
        try {
            const w = parseWord(wordInput.value, app.matrices.length);
            if (!w.length) throw new Error('type a word first, e.g. “a b A B”');
            addElement(w);
            wordInput.value = '';
        } catch (e) { setWordError(e.message); }
    };
    document.getElementById('word-store')?.addEventListener('click', storeTyped);
    wordInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); storeTyped(); } });
    wordInput?.addEventListener('input', () => setWordError(''));
    document.getElementById('word-from-current')?.addEventListener('click', () => {
        const w = reduceWord(app.cumulativeWord);
        if (!w.length) { setWordError('the current element is the identity'); return; }
        addElement([...w]);
    });

    bindToggle('toggle-orbit', (btn) => {
        const on = !orbitRun;
        updateToggleBtn(btn, on);
        if (on) startOrbit(); else stopOrbit();
    });
    bindToggle('toggle-dust', (btn) => {
        layers.showDust = !layers.showDust;
        updateToggleBtn(btn, layers.showDust);
        updateDust(true);
    });

    // Basepoint sliders
    const bp = ['bp-x', 'bp-y', 'bp-z'].map(id => document.getElementById(id));
    const readBp = () => {
        let p = bp.map(el => parseFloat(el.value) || 0);
        const r = Math.hypot(...p);
        if (r > 0.95) p = p.map(x => x * 0.95 / r);
        return p;
    };
    bp.forEach(el => el?.addEventListener('input', () => setBasepointFromBall(readBp())));
    document.getElementById('bp-reset')?.addEventListener('click', () => {
        bp.forEach(el => { if (el) el.value = '0'; });
        setBasepointFromBall([0, 0, 0]);
    });

    // Permalink
    const linkBtn = document.getElementById('copy-link');
    linkBtn?.addEventListener('click', async () => {
        const url = updatePermalink() || location.href;
        try { await navigator.clipboard.writeText(url); linkBtn.textContent = 'Link copied ✓'; }
        catch (e) { window.prompt('Copy this link:', url); }
        setTimeout(() => { linkBtn.textContent = 'Copy link to this group'; }, 1800);
    });

    // 3MF
    const exportBtn = document.getElementById('export-3mf');
    exportBtn?.addEventListener('click', async () => {
        if (exportBtn.disabled) return;
        const label = exportBtn.textContent;
        exportBtn.disabled = true;
        exportBtn.textContent = 'Exporting…';
        try {
            await new Promise(r => setTimeout(r, 30));
            const { vertices, triangles } = await exportDomainAs3MF(displayedDomain());
            console.log(`3MF export: ${vertices} vertices, ${triangles} triangles`);
        } catch (e) {
            console.error('3MF export failed:', e);
            setBanner('warning', '3MF export failed: ' + e.message);
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = label;
        }
    });

    // Picking
    let downPos = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('click', (e) => {
        if (app.animating || !app.scene || insideView.isActive()) return;
        if (downPos && (e.clientX - downPos.x) ** 2 + (e.clientY - downPos.y) ** 2 > 36) return;
        if (!e.shiftKey) {
            const v = pickVertex(e.clientX, e.clientY);
            if (v) { selectVertex(v, () => { if (layers.showTiling) updateTiling(); }); return; }
        }
        const hit = pickWall(rayFromEvent(e));
        if (hit.index < 0) { clearFaceSelection(); if (layers.showTiling) updateTiling(); return; }
        handleFaceClick(hit.index, e.shiftKey, () => { if (layers.showTiling) updateTiling(); });
    });
    renderer.domElement.addEventListener('dblclick', (e) => {
        if (insideView.isActive() || app.animating) return;
        const hit = pickWall(rayFromEvent(e));
        if (hit.index < 0) return;
        // Roll the domain across THIS face: apply the element g whose wall it
        // is, sending the domain to the adjacent tile g·D.
        if (app.fordOn && app.fordHome) {
            const pr = fordPairingAt(hit.index, worldToBall(hit.point));
            if (pr) animateMatrix(pr.matrix.inv().normalized(), invertWord(pr.word));
            return;
        }
        const wall = app.home.walls[hit.index];
        if (!wall.pairing) return;
        try { animateMatrix(wordToMatrix(wall.word), [...wall.word]); } catch (err) { /* */ }
    });
}

// ---------------- frame loop ----------------

let lastFrame = 0;
function animate(time) {
    requestAnimationFrame(animate);
    const dt = lastFrame ? (time - lastFrame) / 1000 : 0;
    lastFrame = time;
    if (insideView.isActive()) {
        const move = insideView.step(dt);
        if (move) applyFly(move);
    } else {
        controls.update();
    }
    if (orbitRun && orbitRun.dirty) updateOrbitInstances(time);
    updateFaceLabels();
    const m = mesh.material;
    if (m.uniforms.u_cameraPos) m.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_time.value = time * 0.001;
    renderer.render(scene, camera);
}

controls.addEventListener('start', () => {
    controls.autoRotate = false;
    updateToggleBtn(document.getElementById('auto-rotate'), false);
});
window.addEventListener('poincare:layout', () => applyViewOffset(panelWidth()));
function panelWidth() {
    const p = document.getElementById('control-panel');
    if (!p || p.classList.contains('collapsed') || EMBED) return 0;
    return p.getBoundingClientRect().width + 24;
}

// ---------------- tutorial / embed API ----------------

window.PoincareAPI = {
    THREE, scene, camera, controls,
    refresh: refreshFromUI,
    compute: requestCompute,
    state: () => ({
        domain: app.scene,
        home: app.home,
        matrices: app.matrices,
        stdGenerators: standardGenerators(),
        viewMatrix: app.viewMatrix,
        report: app.report,
        invariants: app.invariants,
        ford: app.ford,
    }),
    isAnimating: () => app.animating,
    isViewDirty: viewIsDirty,
    setPolyhedronOpacity,
    setDomainVisible(v) { material.uniforms.u_faceCount.value = (v && displayedDomain()) ? displayedDomain().count : 0; },
    setWallsOpacity,
    setCayleyMode(mode) { layers.cayleyMode = mode; updateCayley(); },
    setTiling(on) { layers.showTiling = on; updateTiling(); },
    setLimitSet(on) {
        limitSet.setEnabled(on);
        updateToggleBtn(document.getElementById('toggle-limitset'), on);
        document.getElementById('limit-depth-row')?.classList.toggle('disabled', !on);
        if (on && app.scene) limitSet.update(app.scene, limitWallColor);
    },
    setLimitDepth(n) { limitSet.setIterations(n); },
    setInsideView,
    isInsideView: () => insideView.isActive(),
    setManifold, setHoneycomb, setCuspView, setViewModel,
    setBasepoint: (p) => setBasepointFromBall(p),
    flyBy,
    setDual(mode) {
        layers.dualMode = mode;
        document.getElementById('dual-opacity-row')?.classList.toggle('disabled', mode === 'off');
        updateDual();
    },
    setMirror(on) { if (on !== mirrorMode) setMirrorMode(on); },
    setTheme,
    getTheme: () => view.theme,
    setOrbit(on) {
        if (on) startOrbit(); else stopOrbit();
        updateToggleBtn(document.getElementById('toggle-orbit'), !!on);
    },
    orbitSize: () => (orbitRun ? orbitRun.mats.length : 0),
    setDust(on) {
        layers.showDust = on;
        updateDust(true);
        updateToggleBtn(document.getElementById('toggle-dust'), on);
    },
    setAutoRotate(on, speed = 1.0) { controls.autoRotate = on; controls.autoRotateSpeed = speed; },
    geodesic: geodesicPoints,
    buildBisectorMesh: (p1, p2, color, opacity) => bisectorMesh(p1, p2, color, opacity),
    animateMatrix,
    animateGenerator,
    animateFacePairing(idx, e) {
        const gens = standardGenerators();
        if (idx < gens.length) applyStdGenerator(gens[idx], e);
    },
    loadExample,
    permalink: () => updatePermalink(),
};

// Remote joystick: the deck forwards {type:'orbit', dx, dy} from the phone.
window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'orbit') return;
    controls.autoRotate = false;
    const offset = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= (d.dx || 0) * 0.006;
    sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi - (d.dy || 0) * 0.006));
    camera.position.setFromSpherical(sph).add(controls.target);
});

// ---------------- boot ----------------

const urlState = EMBED ? null : readStateFromURL();
initUI();
applyThemeUniforms();
if (urlState) {
    if (urlState.depth) { const wl = document.getElementById('wordLength'); if (wl) wl.value = String(urlState.depth); }
    if (urlState.faces) {
        app.maxFaces = urlState.faces;
        const fc = document.getElementById('face-count-input');
        if (fc) fc.value = String(urlState.faces);
    }
    if (urlState.theme) setTheme(urlState.theme);
}
setupMatrixInput(refreshFromUI, urlState);
applyViewOffset(panelWidth());
setTimeout(() => {
    if (urlState && urlState.bp) {
        ['bp-x', 'bp-y', 'bp-z'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.value = String(urlState.bp[i]); });
        const r = Math.hypot(...urlState.bp);
        app.basepointBall = urlState.bp.slice();
        if (r > 1e-9) {
            app.basepoint = translationTowards(new THREE.Vector3(...urlState.bp).normalize(), 2 * Math.atanh(Math.min(r, 0.999)));
        }
    }
    if (urlState && urlState.cusp !== undefined) { app.fordOn = true; app.fordCusp = urlState.cusp; horo.on = true; }
    if (urlState && urlState.model === 'uhs') setViewModel('uhs');
    if (urlState && urlState.exact) {
        window.dispatchEvent(new CustomEvent('poincare:set-exact', { detail: urlState.exact }));
    } else {
        refreshFromUI();
    }
    // The request above already asked for the Ford domain; this sets up the
    // rest of cusp view (buttons, translucency, framing once it arrives).
    if (app.fordOn) setCuspView(true, { recompute: false });
}, 200);
animate(0);
