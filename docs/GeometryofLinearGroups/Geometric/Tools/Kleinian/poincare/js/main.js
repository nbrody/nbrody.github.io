/**
 * The Poincaré workbench: wiring. Domain computation runs in a Web Worker
 * (domainService.js → compute.js); the page keeps the result in a home frame
 * and moves a scene copy rigidly, so animations, flight and basepoint drags
 * never block. See app.js for the frame conventions.
 */
import * as THREE from 'three';
import { Matrix2x2, reduceWord, invertWord, hypDist, translationTowards, applyMatrixToBall, wallSD, pslKey } from './math.js';
import { serializeTowerContext } from './tower.js';
import { exportDomainAs3MF } from './export3mf.js';
import { createInsideView } from './insideView.js';
import { createInsideHoneycomb } from './insideHoneycomb.js';
import { createQuestTiling } from './questTiling.js';
import { createHoneycombView } from './honeycombView.js';
import { createLimitSet } from './limitSet.js';
import { mirrorFragmentShader } from './mirror.js';
import { vertexShader } from './shaders.js';
import { setupMatrixInput, getMatricesFromUI, getExactContext, getInputState, loadExample } from './matrixInput.js';
import { setupControlPanel, readBoundedInteger, updateToggleBtn } from './controlPanel.js';
import { createDomainService } from './domainService.js';
import { matToArr } from './compute.js';
import {
    app, sceneMatrix, outerFrame, sceneAction, homeGenerators, wordToMatrix, viewIsDirty
} from './app.js';
import { kleinToBall } from './polyhedron.js';
import {
    installResult, retargetScene, displayedDomain, standardGenerators, faceColors, invalidateFaceColors, pairColors
} from './domain.js';
import { computeDelaunayDomain, planarHome } from './delaunay.js';
import { createDelaunayView } from './delaunayView.js';
import {
    scene, camera, renderer, controls, material, mesh, ballBox, uhsBox, view, theme,
    applyThemeUniforms, setModelCamera, loadDomainUniforms, applyViewOffset, toWorld
} from './scene.js';
import {
    setDomainProvider,
    state as layers, updateCayley, setWallsOpacity, updateDual, setDualOpacity,
    updateTiling, updateDust, startOrbit, stopOrbit, updateOrbitInstances,
    markOrbitDirty, recolorOrbit, refreshLayers, orbitRun, geodesicPoints, bisectorMesh
} from './overlays.js';
import { showIsometryAxis, showCharacteristicSet } from './isoAxis.js';
import { setUnwrapHooks } from './unwrap.js';
import {
    inspect, pickWall, rayFromEvent, pickVertex, selectVertex, handleFaceClick, clearFaceSelection,
    updateEdgeCycles, rebuildFaceLabels, updateFaceLabels, refreshInspectOverlays, fordPairingAt,
    invalidateSkeleton, worldToBall, redrawSelection, CYCLE_HUES, VERTEX_HUES, setLabelOverride, setCyclesHidden
} from './inspector.js';
import { renderDelaunayInfo } from './delaunayPanel.js';
import {
    setBanner, bannerForReport, renderCertificate, renderPresentation, renderStabilizer,
    renderStdGenerators, renderCurrentElement, renderUserElements, userElements, parseWord
} from './panels.js';
import { renderInvariants, clearGeodesicSelection } from './invariantsPanel.js';
import { horo, updateHoroballs } from './horoballs.js';
import {
    manifoldFragmentShader, makeTessellationUniforms, loadTessellationUniforms
} from './tessellation.js';
import { readStateFromURL, writeStateToURL } from './permalink.js';
import { createPlanarView, isRealGroup, framePlanarCamera, planarPick, planarRayPoint, PLANAR_MAX_WALLS } from './planar.js';
import { createPostFX } from './postfx.js';

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
const honeycombView = createHoneycombView(scene);
const manifoldMaterial = makeTessMaterial(manifoldFragmentShader);
const insideHoneycomb = createInsideHoneycomb(scene);
let insideHoneycombOn = false;
const questTiling = createQuestTiling(scene);
let questTilingOn = false;
const render = { honeycomb: false, manifold: false, tieDye: false, unwrapped: false };

// Every frame is smoothed by FXAA (postfx.js), which is nearly free. "Smooth"
// quality also renders 1.5× the pixels per side (about 2.25× the cost), and
// is remembered per browser.
const postfx = createPostFX(renderer);
const QUALITY_KEY = 'poincare.quality';
let quality = 'fast';
try { if (localStorage.getItem(QUALITY_KEY) === 'smooth') quality = 'smooth'; } catch (e) { /* storage blocked */ }

function applyPixelRatio() {
    const base = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(base * (quality === 'smooth' ? 1.5 : 1));
}

function setQuality(q, remember = true) {
    quality = q === 'smooth' ? 'smooth' : 'fast';
    if (remember) try { localStorage.setItem(QUALITY_KEY, quality); } catch (e) { /* storage blocked */ }
    document.querySelectorAll('.quality-opt').forEach(b => b.classList.toggle('active', b.dataset.quality === quality));
    applyPixelRatio();
}

// The plane picture (planar.js): a group in PGL₂(ℝ) is drawn as its tiling of
// the hyperbolic plane over ℝ, by default. A new group resets the choice.
const planarView = createPlanarView(scene, material.uniforms);
const planar = { on: false, available: false, groupKey: null, keep3d: false };

// The Delaunay domain (delaunay.js): the dual of the Dirichlet domain,
// assembled into one polyhedron whose corners are all copies of the
// basepoint. A view of the same group, drawn instead of the Dirichlet domain.
const delaunayView = createDelaunayView();
const dl = { on: false, result: null, home: null, dim: 0, colors: [], verified: false };

/** The Delaunay result for the domain on screen (cached per domain and dimension). */
function delaunayResult() {
    if (!app.home) return null;
    const dim = planar.on ? 2 : 3;
    if (dl.home === app.home && dl.dim === dim && dl.result) return dl.result;
    let R;
    if (!app.report || app.report.status !== 'verified') {
        R = { ok: false, reason: 'unverified', message: 'The Dirichlet domain is not certified, so its dual would not be either.' };
    } else if (dim === 2) {
        // The plane picture needs a centre ON the plane with trivial stabilizer.
        const { home, frame } = planarHome(app.home, homeGenerators(), { maxFaces: app.maxFaces, maxDepth: app.depth });
        R = computeDelaunayDomain(home, { dim, frame });
    } else {
        R = computeDelaunayDomain(app.home, { dim });
    }
    dl.result = R; dl.home = app.home; dl.dim = dim;
    // One colour per face pairing, the same on both of its sides.
    dl.colors = R.ok ? pairColors(R.sides.map((S, si) => {
        const P = R.pairs[S.pair];
        return P.minus === si ? P.plus : P.minus;
    })).colors : [];
    return R;
}

/** Whether the Delaunay domain is what is drawn (on, and available for this group). */
function delaunayShowing() {
    return dl.on && !!dl.result && dl.result.ok && !render.unwrapped;
}

/** Edge colours by cycle when Edge Cycles is on (3D): edge chain → its cycle's hue. */
function delaunayCycleColor(R) {
    if (R.dim !== 3) return null;
    const of = new Map();
    R.cycles.forEach((c, k) => (c.chains || []).forEach(ch => of.set(ch, k)));
    return (i) => {
        const c = {};
        CYCLE_HUES(of.has(i) ? of.get(i) : 0).getRGB(c, THREE.SRGBColorSpace);
        return [c.r, c.g, c.b];
    };
}

/** Rebuild the Delaunay meshes (new domain, palette, theme, cycle colouring). */
function rebuildDelaunay() {
    const R = dl.on ? delaunayResult() : null;
    if (!R || !R.ok) {
        delaunayView.clear();
    } else {
        delaunayView.build(R, dl.colors, {
            cycleColor: delaunayCycleColor(R), showEdges: inspect.showCycles,
            vertexColor: (k) => { const c = {}; VERTEX_HUES(k).getRGB(c, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; },
        });
    }
    if (render.honeycomb) rebuildHoneycomb();
    syncDomainVisibility();
}

/** Show the Delaunay domain instead of the Dirichlet one (or back). */
function setDelaunay(on, { quiet = false } = {}) {
    on = !!on;
    if (on) {
        if (questTilingOn) setQuestTiling(false);
        if (app.fordOn) setCuspView(false);
        if (insideView.isActive()) setInsideView(false);
        if (mirrorMode) setMirrorMode(false);
        if (render.tieDye) setTieDye(false);
        clearFaceSelection();
    }
    dl.on = on;
    document.querySelectorAll('.domain-opt').forEach(b => b.classList.toggle('active', (b.dataset.domain === 'delaunay') === on));
    const R = on ? delaunayResult() : null;
    if (on && R && !R.ok && !quiet) setBanner('warning', `No Delaunay domain, so the Dirichlet domain is shown. ${R.message}`);
    rebuildDelaunay();
    updateEdgeCycles();
    syncMaterial();
    if (app.scene) onSceneMoved();
    rebuildFaceLabels();
    showDelaunayInfo();
    if (app.home) updatePermalink();
}

function showDelaunayInfo() {
    renderDelaunayInfo(delaunayResult(), {
        on: dl.on,
        dirichletFaces: app.home ? app.home.walls.length : 0,
        planar: planar.on,
        onToggle: () => setDelaunay(!dl.on),
        onApply: (el, inverse) => {
            if (app.animating) return;
            const g = inverse ? el.inv() : el;
            animateMatrix(wordToMatrix(g.w), [...g.w]);
        },
    });
}

setCyclesHidden(() => delaunayShowing());

// The Cayley graph and the Tiling layer follow the domain shown: on the
// Delaunay domain's tiles, the graph's vertices are the tile centres and its
// T generators the Delaunay face pairings; the tiling is copies of it.
const dlLayer = { result: null, frame: null, tiles: null };
function delaunayLayerData(R) {
    if (dlLayer.result === R) return dlLayer;
    const c = kleinToBall(R.centre), r = c.length();
    const frame = r < 1e-9 ? Matrix2x2.identity() : translationTowards(c.clone().normalize(), 2 * Math.atanh(Math.min(r, 0.999999)));
    // Copies across the faces, and across theirs: words of length ≤ 2 in the pairings.
    const moves = R.pairs.flatMap(P => [P.el.m, P.el.m.inv().normalized()]);
    const seen = new Set([pslKey(Matrix2x2.identity())]);
    const tiles = [];
    let frontier = [Matrix2x2.identity()];
    for (let d = 0; d < 2 && tiles.length < 30; d++) {
        const next = [];
        for (const m of frontier) for (const g of moves) {
            if (tiles.length >= 30) break;
            const h = m.mul(g).normalized(), k = pslKey(h);
            if (seen.has(k)) continue;
            seen.add(k);
            tiles.push(h);
            next.push(h);
        }
        frontier = next;
    }
    Object.assign(dlLayer, { result: R, frame, tiles });
    return dlLayer;
}
setDomainProvider(() => {
    if (!delaunayShowing()) return null;
    const R = dl.result, D = delaunayLayerData(R);
    return {
        pairs: R.pairs.map(P => P.el.m), frame: D.frame,
        tiling: R.dim === 3 ? (on) => delaunayView.ensureTiling(on ? D.tiles : null) : null,
    };
});

// Face labels: in Delaunay view they name the Delaunay faces (s_k on one face, s_k⁻¹ on its partner).
setLabelOverride((box) => {
    if (!delaunayShowing()) return false;
    delaunayView.buildLabels(box, dl.result, dl.colors);
    return true;
});

function placeDelaunayLabels() {
    if (!inspect.showLabels || !delaunayShowing() || !delaunayView.hasLabels()) return;
    const S = sceneMatrix(), camPos = camera.position;
    const rect = renderer.domElement.getBoundingClientRect();
    delaunayView.placeLabels(camera, rect, (home, out) => {
        const p = applyMatrixToBall(S, home);
        const w = toWorld(p);
        if (out && view.model === 'ball') {
            const q = applyMatrixToBall(S, out);
            if (q.clone().sub(p).dot(p.clone().sub(camPos)) > 0) return null;     // the face looks away
        }
        const ndc = w.clone().project(camera);
        if (!(ndc.z < 1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1)) return null;
        return { x: ndc.x * 0.5 + 0.5, y: -ndc.y * 0.5 + 0.5 };
    });
}

/** The raymarched domain and the plane share the polyhedron opacity. */
function syncDomainVisibility() {
    const o = material.uniforms.u_opacity.value;
    const dlOn = delaunayShowing();
    // While unwrapped (unwrap.js) the domain is drawn among its neighbours as a mesh.
    // The honeycomb draws nearby tiles in place of the polyhedron.
    const honey = render.honeycomb && view.model === 'ball' && !insideView.isActive();
    mesh.visible = !honey && !questTilingOn && !insideHoneycombOn && !planar.on && o > 0 && !render.unwrapped && !(dlOn && dl.result.dim === 3 && !honey);
    planarView.setVisible(planar.on && o > 0);
    planarView.setOpacity(o);
    delaunayView.setVisible(dlOn && (dl.result.dim === 2) === planar.on && !(honey && !planar.on));
    for (const id of ['honeycomb-walls-row', 'honeycomb-faces-row']) {
        document.getElementById(id)?.classList.toggle('disabled', !render.honeycomb);
    }
    delaunayView.setOpacity(o);
}

function activeMaterial() {
    if (render.manifold && insideView.isActive()) return manifoldMaterial;
    return material;
}

function loadTessUniforms(m) {
    return loadTessellationUniforms(m.uniforms, app.scene, faceColors(app.scene));
}

function syncMaterial() {
    const m = activeMaterial();
    if (mesh.material !== m) mesh.material = m;
    syncDomainVisibility();
    if (m === material) {
        const frag = mirrorMode ? mirrorFragmentShader : domainFragment;
        if (material.fragmentShader !== frag) { material.fragmentShader = frag; material.needsUpdate = true; }
    }
    if (m !== material) {
        const ok = loadTessUniforms(m);
        if (!ok) {
            const why = !app.scene ? 'no domain yet'
                : app.scene.walls.length > 64 ? `the domain has ${app.scene.walls.length} faces (the view holds 64)`
                    : 'some face has no pairing (the certificate failed)';
            setBanner('warning', `Manifold view unavailable: ${why}.`);
            setManifold(false);
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
    if (on && render.honeycomb) setHoneycomb(false);
    if (on && questTilingOn) setQuestTiling(false);
    if (on && planar.on) setPlanar(false);
    if (on && dl.on) setDelaunay(false);
    if (on && render.tieDye) setTieDye(false);
    mirrorMode = on;
    updateToggleBtn(document.getElementById('toggle-mirror'), on);
    syncMaterial();
}

/** Tie-Dye is a uniform of the domain shader; Mirror and Honeycomb replace
    that shader, so they exclude it. */
function setTieDye(on) {
    if (on && questTilingOn) setQuestTiling(false);
    if (on && planar.on) setPlanar(false);
    if (on && dl.on) setDelaunay(false);
    if (on && mirrorMode) setMirrorMode(false);
    if (on && render.honeycomb) setHoneycomb(false);
    render.tieDye = on;
    material.uniforms.u_tieDye.value = on;
    updateToggleBtn(document.getElementById('toggle-tiedye'), on);
}

function rebuildHoneycomb() {
    honeycombView.rebuild(app.home, app.report, faceColors(app.home),
        delaunayShowing() ? dl.result : null, dl.colors, view.theme);
}

function setHoneycomb(on) {
    if (on && insideView.isActive()) setInsideView(false);
    if (on && mirrorMode) setMirrorMode(false);
    if (on && questTilingOn) setQuestTiling(false);
    if (on && planar.on) setPlanar(false);
    if (on && app.fordOn) setCuspView(false);
    if (on && render.tieDye) setTieDye(false);
    render.honeycomb = on;
    if (on && app.home) rebuildHoneycomb();
    honeycombView.setVisible(on && !!app.home);
    if (on) honeycombView.setFrame(sceneMatrix());
    updateToggleBtn(document.getElementById('toggle-honeycomb'), on);
    if (on && view.model !== 'ball') setViewModel('ball');
    applyPixelRatio();
    syncMaterial();
}

function setManifold(on) {
    if (on && questTilingOn) setQuestTiling(false);
    if (on && insideHoneycombOn) setInsideHoneycomb(false);
    render.manifold = on;
    updateToggleBtn(document.getElementById('toggle-manifold'), on);
    if (on && !insideView.isActive()) setInsideView(true);
    syncMaterial();
}

function setInsideHoneycomb(on) {
    if (on && questTilingOn) setQuestTiling(false);
    if (on && render.manifold) setManifold(false);
    if (on && !insideView.isActive()) setInsideView(true);
    insideHoneycombOn = on;
    updateToggleBtn(document.getElementById('toggle-inside-honeycomb'), on);
    if (on && app.home) insideHoneycomb.rebuild(app.home, app.report, faceColors(app.home));
    insideHoneycomb.setVisible(on && !!app.home);
    if (on) insideHoneycomb.setFrame(sceneMatrix());
    syncMaterial();
}

function rebuildQuestTiling() {
    questTiling.rebuild(app.home, app.report, faceColors(app.home), view.theme);
}

function setQuestTiling(on) {
    if (on) {
        if (insideView.isActive()) setInsideView(false);
        if (planar.on) setPlanar(false);
        if (dl.on) setDelaunay(false);
        if (app.fordOn) setCuspView(false);
        if (mirrorMode) setMirrorMode(false);
        if (render.tieDye) setTieDye(false);
        if (render.honeycomb) setHoneycomb(false);
        if (view.model !== 'ball') setViewModel('ball');
    }
    questTilingOn = on;
    updateToggleBtn(document.getElementById('toggle-tiling'), on);
    if (on && app.home) rebuildQuestTiling();
    questTiling.setVisible(on && !!app.home);
    if (on) questTiling.setFrame(sceneMatrix());
    syncMaterial();
}

// ---------------- scene updates ----------------

/** Everything that rides the scene isometry. `fast` while moving. */
function onSceneMoved({ fast = false } = {}) {
    retargetScene();
    if (insideHoneycombOn) insideHoneycomb.setFrame(sceneMatrix());
    if (questTilingOn) questTiling.setFrame(sceneMatrix());
    if (render.honeycomb) honeycombView.setFrame(sceneMatrix());
    const D = displayedDomain();
    loadDomainUniforms(D, faceColors(D));
    delaunayView.setFrame(sceneMatrix(), view.model === 'uhs');
    const dlPlane = planar.on && delaunayShowing() ? delaunayView.planarDomain(dl.result, sceneMatrix(), dl.colors) : null;
    if (dlPlane) dlPlane.fold = app.home;               // the plane shader folds into the Dirichlet polygon first (home frame, as dlPlane)
    if (planar.on && !(dlPlane ? planarView.update(dlPlane, dlPlane.colors) : planarView.update(app.scene, faceColors(app.scene)))) {
        setBanner('warning', `2D view unavailable: the polygon has more than ${PLANAR_MAX_WALLS} edges.`);
        setPlanar(false);
        return;
    }
    refreshLayers({ fast });
    updateLimitSet();
    if (mesh.material !== material && app.scene) loadTessUniforms(mesh.material);
    if (!fast) {
        refreshInspectOverlays();
        updateHoroballs();
    } else {
        redrawSelection();
    }
    markOrbitDirty();
    updateMark();
}

// ---------------- a marked generator ----------------
// The permalink's `mark` (a generator's index) or PoincareAPI.setMark(i): its characteristic set
// (axis, fixed point, or fixed point at infinity) stays drawn as the view moves.
let markIndex = null;
function updateMark() {
    const g = markIndex === null ? null : app.matrices[markIndex];
    showCharacteristicSet(g && !g.anti ? sceneAction(g) : null, { planar: planar.on });
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
        exact: exact ? serializeTowerContext(exact) : null,
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
    if (questTilingOn) { rebuildQuestTiling(); questTiling.setVisible(!!app.home); }
    if (render.honeycomb) { rebuildHoneycomb(); honeycombView.setVisible(!!app.home); }
    if (insideHoneycombOn) {
        insideHoneycomb.rebuild(app.home, app.report, faceColors(app.home));
        insideHoneycomb.setVisible(!!app.home);
    }
    invalidateSkeleton();
    clearFaceSelection();
    clearGeodesicSelection();
    if (dl.on) {
        const R = delaunayResult();
        if (R && !R.ok) setBanner('warning', `No Delaunay domain, so the Dirichlet domain is shown. ${R.message}`);
        rebuildDelaunay();
    }
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
    showDelaunayInfo();
    staleShown = false;           // renderCertificate above drew the fresh report
    if (!(dl.on && dl.result && !dl.result.ok)) showReportBanner();
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
    const msg = /[.!?]$/.test(inputError) ? inputError : `${inputError}.`;
    setBanner('stale', `Input error — ${msg} The picture still shows the last valid group.`, { persist: true });
    renderCertificate(app.report, true);
}

function showReportBanner() {
    if (inputError) { showInputError(); return; }
    if (staleShown) { staleShown = false; renderCertificate(app.report); }
    const faces = app.home ? app.home.walls.length : 0;
    const exactCtx = getExactContext();
    const exactNote = app.report && app.report.exactUsed && exactCtx
        ? ` Relations exact over ${exactCtx.field.describe()}; geometry numerical.` : '';
    if (app.home && app.home.stabilizer.capped && !(app.report && app.report.nondiscrete)) {
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
    if (markIndex !== null && markIndex >= app.matrices.length) markIndex = null;
    // A group in PGL₂(ℝ) is drawn in its plane by default; a new group resets the choice.
    planar.available = isRealGroup(app.matrices);
    const key = groupKey(app.matrices);
    if (key !== planar.groupKey) {
        planar.groupKey = key;
        const want = planar.available && !planar.keep3d;
        planar.keep3d = false;
        setPlanar(want);
    } else if (planar.on && !planar.available) {
        setPlanar(false);
    }
    syncPlanarControls();
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
        if (insideHoneycombOn) setInsideHoneycomb(false);
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
    if (on && questTilingOn) setQuestTiling(false);
    if (!on) { insideView.exit(); return; }
    if (planar.on) setPlanar(false);
    if (dl.on) setDelaunay(false);
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
    planarView.setModel(model);
    limitSet.setViewModel(model);
    if (uhs) {
        if (questTilingOn) setQuestTiling(false);
        if (mirrorMode) setMirrorMode(false);
        if (render.honeycomb) setHoneycomb(false);
    }
    if (planar.on) framePlanarCamera(camera, controls, model); else setModelCamera();
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
    if (questTilingOn) rebuildQuestTiling();
    if (render.honeycomb) rebuildHoneycomb();
    applyThemeUniforms();
    limitSet.setLightMode(mode === 'light');
    if (layers.showDust) updateDust();
    recolorOrbit();
    if (dl.on) rebuildDelaunay();
    onSceneMoved();
    document.getElementById('theme-dark')?.classList.toggle('active', mode === 'dark');
    document.getElementById('theme-light')?.classList.toggle('active', mode === 'light');
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        themeBtn.title = mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        themeBtn.setAttribute('aria-label', themeBtn.title);
    }
}

// ---------------- the plane picture ----------------

/** Signature of the generators, to tell a new group from a refresh of the same one. */
function groupKey(mats) {
    return mats.map(m => [m.a, m.b, m.c, m.d].map(z => `${z.re.toFixed(9)},${z.im.toFixed(9)}`).join(';') + (m.anti ? 'a' : '')).join('|');
}

function syncPlanarControls() {
    const btn = document.getElementById('toggle-planar');
    if (btn) {
        updateToggleBtn(btn, planar.on);
        btn.disabled = !planar.available;
        btn.title = planar.available
            ? 'The group lies in PGL₂(ℝ), so it preserves the hyperbolic plane over the real line: draw its tiling of that plane (2D), or the domain in hyperbolic space (3D).'
            : 'Only for groups in PGL₂(ℝ), which preserve the hyperbolic plane over the real line.';
    }
    // The picture is the slice through the plane, so the basepoint stays on it.
    const bpY = document.getElementById('bp-y');
    if (bpY) bpY.disabled = planar.on;
}

/** Draw a group in PGL₂(ℝ) as its tiling of the plane over ℝ (true), or in 3D. */
function setPlanar(on) {
    on = !!on && planar.available;
    if (on === planar.on) { syncPlanarControls(); return; }
    planar.on = on;
    if (on) {
        if (questTilingOn) setQuestTiling(false);
        if (insideView.isActive()) setInsideView(false);
        if (app.fordOn) setCuspView(false);
        if (render.honeycomb) setHoneycomb(false);
        if (mirrorMode) setMirrorMode(false);
        controls.autoRotate = false;
        updateToggleBtn(document.getElementById('auto-rotate'), false);
        if (Math.abs(app.basepointBall[1]) > 1e-12) {
            const el = document.getElementById('bp-y');
            if (el) el.value = '0';
            setBasepointFromBall([app.basepointBall[0], 0, app.basepointBall[2]]);
        }
    }
    inspect.planar = on;
    clearFaceSelection();
    syncPlanarControls();
    if (dl.on) rebuildDelaunay();
    syncMaterial();
    if (on) framePlanarCamera(camera, controls, view.model); else setModelCamera();
    if (app.scene) onSceneMoved();
    rebuildFaceLabels();
    if (dl.on) showDelaunayInfo();
    if (app.home) updatePermalink();
}

// ---------------- cusp view (Ford domain + horoballs) ----------------

let opacityBeforeCusp = null;

function setCuspView(on, { recompute = true } = {}) {
    if (on && planar.on) setPlanar(false);
    if (on && dl.on) setDelaunay(false);
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
    return {
        v: 1,
        ...inputs,
        plane: planar.available && !planar.on ? false : undefined,
        depth: app.depth, faces: app.maxFaces,
        bp: app.basepointBall.some(x => Math.abs(x) > 1e-9) ? app.basepointBall : undefined,
        cusp: app.fordOn ? app.fordCusp : undefined,
        dom: dl.on ? 'delaunay' : undefined,
        model: view.model !== 'ball' ? view.model : undefined,
        theme: view.theme !== 'dark' ? view.theme : undefined,
        mark: markIndex !== null ? markIndex : undefined,
    };
}

function updatePermalink() {
    if (EMBED || inputError) return null;       // the URL keeps the last valid group
    try { return writeStateToURL(currentState()); } catch (e) { return null; }
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
    syncDomainVisibility();
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
    setUnwrapHooks({
        onSceneMoved,
        setDomainHidden(on) { render.unwrapped = on; syncDomainVisibility(); },
    });
    panelUI = setupControlPanel({
        onPolyhedronOpacity: (o) => { material.uniforms.u_opacity.value = o; syncDomainVisibility(); },
        onWallsOpacity: (o) => setWallsOpacity(o),
        onCayleyModeChange: (mode) => { layers.cayleyMode = mode; updateCayley(); },
        onDualModeChange: (mode) => {
            layers.dualMode = mode;
            document.getElementById('dual-opacity-row')?.classList.toggle('disabled', mode === 'off');
            updateDual();
        },
        onDualOpacityChange: (o) => setDualOpacity(o),
        onAutoRotateToggle: (btn) => { controls.autoRotate = !controls.autoRotate; updateToggleBtn(btn, controls.autoRotate); },
        onResetCamera: (btn) => {
            if (planar.on) framePlanarCamera(camera, controls, view.model); else setModelCamera();
            controls.autoRotate = false;
            updateToggleBtn(btn, false);
        },
        onFaceCountChange: (count) => { app.maxFaces = count; requestCompute(); },
        onWordLengthChange: (depth) => { app.depth = depth; requestCompute(); },
        onPaletteChange: () => {
            invalidateFaceColors();
            if (questTilingOn) rebuildQuestTiling();
            if (dl.result && dl.result.ok) { dl.home = null; delaunayResult(); }
            if (dl.on) rebuildDelaunay();
            else if (render.honeycomb) rebuildHoneycomb();
            onSceneMoved();
            rebuildFaceLabels();
        },
        onPanelLayout: (width) => applyViewOffset(width),
        controls, mesh, material
    });

    bindToggle('toggle-planar', () => setPlanar(!planar.on));
    bindToggle('toggle-mirror', () => setMirrorMode(!mirrorMode));
    bindToggle('toggle-tiedye', () => setTieDye(!render.tieDye));
    bindToggle('toggle-honeycomb', () => setHoneycomb(!render.honeycomb));
    bindToggle('toggle-manifold', () => setManifold(!render.manifold));
    bindToggle('toggle-inside-honeycomb', () => setInsideHoneycomb(!insideHoneycombOn));
    bindToggle('view-uhs', () => setViewModel(view.model === 'uhs' ? 'ball' : 'uhs'));
    bindToggle('view-inside', () => setInsideView(!insideView.isActive()));
    bindToggle('toggle-full-domain', (btn) => {
        app.fullDirichlet = !app.fullDirichlet;
        updateToggleBtn(btn, app.fullDirichlet);
        requestCompute();
    });
    bindToggle('toggle-tiling', () => setQuestTiling(!questTilingOn));
    bindToggle('toggle-cycles', (btn) => {
        inspect.showCycles = !inspect.showCycles;
        updateToggleBtn(btn, inspect.showCycles);
        material.uniforms.u_edgeLines.value = inspect.showCycles ? 1 : 0;
        updateEdgeCycles();
        if (dl.on) rebuildDelaunay();
    });
    document.querySelectorAll('.domain-opt').forEach(btn => btn.addEventListener('click', () => setDelaunay(btn.dataset.domain === 'delaunay')));
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

    document.querySelectorAll('.quality-opt').forEach(btn => btn.addEventListener('click', () => setQuality(btn.dataset.quality)));
    setQuality(quality, false);

    const hcWalls = document.getElementById('honeycomb-walls');
    const setHoneycombWalls = () => { honeycombView.setWalls(parseFloat(hcWalls.value)); };
    hcWalls?.addEventListener('input', setHoneycombWalls);
    if (hcWalls) setHoneycombWalls();
    const hcFaces = document.getElementById('honeycomb-faces');
    const setHoneycombFaces = () => { honeycombView.setFaces(parseFloat(hcFaces.value)); };
    hcFaces?.addEventListener('input', setHoneycombFaces);
    if (hcFaces) setHoneycombFaces();

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

    document.querySelectorAll('.theme-opt').forEach(btn => btn.addEventListener('click', () => setTheme(btn.dataset.theme)));
    document.getElementById('theme-btn')?.addEventListener('click', () => setTheme(view.theme === 'light' ? 'dark' : 'light'));

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

    // Picking: the 3D walls, or in the plane picture the edges of the polygon
    // (a click in a neighbouring tile picks the edge it lies across).
    const pickAt = (e) => (planar.on ? planarPick(rayFromEvent(e), app.scene, view.model === 'uhs') : pickWall(rayFromEvent(e)));
    let downPos = null;
    renderer.domElement.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
    renderer.domElement.addEventListener('click', (e) => {
        if (app.animating || !app.scene || insideView.isActive() || delaunayShowing()) return;
        if (downPos && (e.clientX - downPos.x) ** 2 + (e.clientY - downPos.y) ** 2 > 36) return;
        if (!e.shiftKey && !planar.on) {
            const v = pickVertex(e.clientX, e.clientY);
            if (v) { selectVertex(v, () => { if (layers.showTiling) updateTiling(); }); return; }
        }
        const hit = pickAt(e);
        if (hit.index < 0) { clearFaceSelection({ animate: true }); if (layers.showTiling) updateTiling(); return; }
        handleFaceClick(hit.index, e.shiftKey, () => { if (layers.showTiling) updateTiling(); });
    });
    renderer.domElement.addEventListener('dblclick', (e) => {
        if (insideView.isActive() || app.animating) return;
        if (delaunayShowing()) {
            // Roll the Delaunay domain across the face under the cursor: the
            // copy across a face f is s⁻¹·U, s the pairing carrying f to its partner.
            // In the plane: onto the tile under the cursor, found by walking to it
            // side by side (as the plane shader does), not by the side whose line
            // the point is farthest beyond: the Delaunay polygon's corners are
            // sharp, so that is often the wrong side.
            const R = dl.result, ray = rayFromEvent(e);
            let g = null;
            if (planar.on) {
                const hit = planarRayPoint(ray, view.model === 'uhs');
                if (hit) g = delaunayView.planarTile(R, sceneMatrix(), hit.p, hit.scale);
            } else {
                const idx = delaunayView.pick(ray, sceneMatrix(), view.model === 'uhs');
                if (idx >= 0) g = R.raw[idx].el.inv();
            }
            if (!g || !g.w.length) return;
            try { animateMatrix(wordToMatrix(g.w), [...g.w]); } catch (err) { /* */ }
            return;
        }
        const hit = pickAt(e);
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
    if (planar.on) planarView.setSelection(app.scene, delaunayShowing() ? -1 : inspect.selectedFace);
    updateFaceLabels();
    if (dl.on) { delaunayView.setFrame(sceneMatrix(), view.model === 'uhs'); placeDelaunayLabels(); }
    const m = mesh.material;
    if (m.uniforms.u_cameraPos) m.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_time.value = time * 0.001;
    postfx.render(scene, camera, material.uniforms.u_bgColor.value);
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
    /** Keep generator i's characteristic set drawn (null clears it). */
    setMark(i) {
        markIndex = Number.isInteger(i) && i >= 0 && i < app.matrices.length ? i : null;
        updateMark();
        updatePermalink();
    },
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
    setTiling(on) { setQuestTiling(!!on); },
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
    setDelaunay: (on) => setDelaunay(on),
    delaunay: () => delaunayResult(),
    setQuality,
    getQuality: () => quality,
    setAntialias(on) { postfx.setEnabled(on); },
    /** Draw one frame now (the loop may be paused in a hidden tab). */
    renderNow() { postfx.render(scene, camera, material.uniforms.u_bgColor.value); },
    setHoneycombWalls(v) {
        const el = document.getElementById('honeycomb-walls');
        if (el) { el.value = String(v); el.dispatchEvent(new Event('input')); }
    },
    setHoneycombFaces(v) {
        const el = document.getElementById('honeycomb-faces');
        if (el) { el.value = String(v); el.dispatchEvent(new Event('input')); }
    },
    setBasepoint: (p) => setBasepointFromBall(p),
    flyBy,
    setDual(mode) {
        layers.dualMode = mode;
        document.getElementById('dual-opacity-row')?.classList.toggle('disabled', mode === 'off');
        updateDual();
    },
    setMirror(on) { if (on !== mirrorMode) setMirrorMode(on); },
    setTieDye(on) { if (on !== render.tieDye) setTieDye(on); },
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
// a page that frames this one in a small space can ask for the panel closed (`panel: 'closed'`)
if (urlState && urlState.panel === 'closed') document.getElementById('control-panel')?.classList.add('collapsed');
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
planar.keep3d = !!(urlState && (urlState.plane === false || urlState.cusp !== undefined));
if (urlState && Number.isInteger(urlState.mark) && urlState.mark >= 0) markIndex = urlState.mark;
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
    if (urlState && urlState.dom === 'delaunay') setDelaunay(true, { quiet: true });
    refreshFromUI();
    // The request above already asked for the Ford domain; this sets up the
    // rest of cusp view (buttons, translucency, framing once it arrives).
    if (app.fordOn) setCuspView(true, { recompute: false });
}, 200);
animate(0);
