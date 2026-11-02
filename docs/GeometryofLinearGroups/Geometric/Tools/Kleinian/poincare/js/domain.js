/**
 * The computed domain on the page: deserialisation of worker results into a
 * HOME-frame domain (never moved; used for certificates, invariants and
 * picking data) and a SCENE-frame clone that is retargeted rigidly whenever
 * the view moves — isometry animations and flight cost a few hundred matrix
 * products per frame instead of a recomputation.
 */
import * as THREE from 'three';
import { covToGeom, invertWord } from './math.js';
import { retargetDomain, cloneDomain } from './canonical.js';
import { buildPolyhedron } from './polyhedron.js';
import { arrToMat } from './compute.js';
import { app, sceneMatrix, fordSceneMatrix, wordToMatrix } from './app.js';
import { colorPalettes, getCurrentPalette } from './controlPanel.js';

const vec3 = (a) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : null);

export function deserializeDomain(d) {
    const walls = d.walls.map(w => {
        const cov = new THREE.Vector4(w.cov[0], w.cov[1], w.cov[2], w.cov[3]);
        const pairing = w.pairing ? {
            alg: arrToMat(w.pairing.alg), matrix: arrToMat(w.pairing.alg),
            word: w.pairing.word, partner: w.pairing.partner, residual: w.pairing.residual
        } : null;
        return {
            cov, cov0: cov.clone(), geom: covToGeom(cov),
            elem: arrToMat(w.elem), word: w.word, kind: w.kind,
            isParabolic: w.isParabolic, pairing
        };
    });
    const dom = {
        mode: d.mode, walls,
        stabilizer: d.stabilizer,
        q0: vec3(d.q0), conePoint: vec3(d.conePoint), basepoint: vec3(d.basepoint), ref: vec3(d.ref),
        notes: d.notes || [], maxRadius: d.maxRadius,
        count: Math.min(walls.length, 256)
    };
    dom.poly = buildPolyhedron(walls);
    return dom;
}

/** Install a compute result (see compute.js runCompute) as the page's domain. */
export function installResult(result) {
    app.home = deserializeDomain(result.domain);
    app.scene = cloneDomain(app.home);
    app.report = result.report;
    app.invariants = result.invariants;
    app.ford = result.ford || null;
    if (app.ford && app.ford.domain) {
        app.fordHome = deserializeDomain(app.ford.domain);
        app.fordScene = cloneDomain(app.fordHome);
        app.fordFrame = arrToMat(app.ford.Kf);
    } else {
        app.fordHome = app.fordScene = null;
    }
    faceColorCache = null;
    retargetScene();
}

/** Move the scene copies to the current view (exact rigid motion). */
export function retargetScene() {
    if (app.scene) retargetDomain(app.scene, sceneMatrix());
    if (app.fordScene) retargetDomain(app.fordScene, fordSceneMatrix());
}

/** The domain being drawn: the Ford domain in cusp view, else the Dirichlet one. */
export function displayedDomain() {
    return app.fordOn && app.fordScene ? app.fordScene : app.scene;
}
export function displayedHome() {
    return app.fordOn && app.fordHome ? app.fordHome : app.home;
}

// ---------------- face-pairing generators ----------------

/**
 * One entry per {face, partner} pair: the pairing written as an ACTUAL group
 * element (word in the typed generators), plus its home-frame matrix for the
 * orbit layers. Sorted: stabilizer rotations first, then by word length.
 */
export function standardGenerators() {
    const out = [];
    const H = app.home;
    if (!H) return out;
    const taken = new Set();
    H.walls.forEach((w, i) => {
        if (taken.has(i)) return;
        const pairing = w.pairing;
        if (!pairing) {
            out.push({ word: w.word, kind: w.kind, isParabolic: w.isParabolic, wallIndex: i, unpaired: true,
                matrix: safeWord(w.word), home: w.elem });
            return;
        }
        taken.add(i);
        if (pairing.partner >= 0) taken.add(pairing.partner);
        // pairing.alg is s = g⁻¹; list the generator g whose wall is Bis(q, g·q).
        const word = invertWord(pairing.word);
        out.push({
            word, kind: w.kind, isParabolic: w.isParabolic,
            wallIndex: i, partnerIndex: pairing.partner,
            matrix: safeWord(word),
            home: pairing.alg.inv().normalized()
        });
    });
    out.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'cone' ? -1 : 1;
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        for (let i = 0; i < a.word.length; i++) if (a.word[i] !== b.word[i]) return a.word[i] - b.word[i];
        return 0;
    });
    return out;
}

function safeWord(word) {
    try { return wordToMatrix(word); } catch (e) { return null; }
}

// ---------------- face colours ----------------

let faceColorCache = null;

/** Golden-ratio hues through the chosen palette: class k → [r,g,b]. */
function classColor(k, n) {
    const p = colorPalettes[getCurrentPalette()] || colorPalettes.rainbow;
    const t = (k * 0.6180339887 + 0.13) % 1;
    if (p.mode === 1) {
        const g = 0.32 + 0.4 * t;
        return [g, g, g * 1.04];
    }
    const x = t * 2 * Math.PI * Math.max(1, p.freq * 2.2);
    return [0.5 + 0.5 * Math.cos(x + p.offset.x), 0.5 + 0.5 * Math.cos(x + p.offset.y), 0.5 + 0.5 * Math.cos(x + p.offset.z)];
}

/**
 * Colour per wall of the displayed domain. A face and its partner have the
 * same colour (the pairing class), so the gluing reads at a glance; Face
 * Labels (s_k on one, s_k⁻¹ on the other) tell the two sides apart.
 */
export function faceColors(domain = displayedDomain()) {
    if (!domain) return [];
    if (faceColorCache && faceColorCache.domain === domain) return faceColorCache.colors;
    const { colors, classes } = pairColors(domain.walls.map(w => (w.pairing ? w.pairing.partner : -1)));
    faceColorCache = { domain, colors, classes };
    return colors;
}

/**
 * Colours for faces paired up by `partner` (each face's partner index, −1
 * if none): one colour per pair, exactly the same on both faces.
 */
export function pairColors(partner) {
    const classes = new Array(partner.length).fill(-1);
    let n = 0;
    partner.forEach((j, i) => {
        if (classes[i] >= 0) return;
        classes[i] = n;
        if (j >= 0 && classes[j] < 0) classes[j] = n;
        n++;
    });
    const colors = partner.map((_, i) => classColor(classes[i], n));
    return { colors, classes };
}

export function faceClasses(domain = displayedDomain()) {
    faceColors(domain);
    return faceColorCache ? faceColorCache.classes : [];
}

export function invalidateFaceColors() { faceColorCache = null; }
