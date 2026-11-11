/**
 * App state and the compute pipeline.
 *
 * The group is plain data { mats, anti, consts } (LaTeX entries, mirror flags,
 * constants), read exactly when every entry is algebraic by the desktop tool's
 * reader (buildGroup). The domain, certificate and invariants are computed in
 * the desktop tool's worker (createDomainService → compute.js) and kept in a
 * HOME frame with the domain's centre at the ball origin.
 *
 * View: the picture is home-frame geometry moved by the scene isometry S.
 * Applying a group element g (as typed) right-multiplies S by its home-frame
 * conjugate h = B⁻¹·g·B, and records V ← V·g with its word, like the desktop
 * tool's "current element". The inside view also left-multiplies S by its
 * flight (never a group element).
 */
import * as THREE from 'three';
import {
    Matrix2x2, buildGroup, exampleLibrary, createDomainService, serializeTowerContext,
    matToArr, arrToMat, buildPolyhedron, covToGeom, readStateFromURL, encodeState, isRealGroup,
    invertWord, reduceWord, translationTowards, computeDelaunayDomain, faceColoringReady, vertexClass
} from './engine.js';
import { isometryPath } from './hyper.js';
import { vertexClasses } from './meshes.js';

const I2 = () => Matrix2x2.identity();
const VERSION = window.APP_VERSION || '';

export const PALETTES = {
    hiroshige: { name: 'Hiroshige', colors: ['#a2d2d6', '#e88542', '#376794', '#f5a03e', '#6eb5cd', '#ffd88e', '#e65a4c', '#ffc335'] },
    tiepolo: { name: 'Tiepolo', colors: ['#b23624', '#eb7f45', '#25689d', '#f6daa9', '#f2af57', '#818e4e', '#63aec6', '#3e7a70'] },
    hokusai: { name: 'Hokusai', colors: ['#d8d97a', '#9fcf75', '#7bd3cd', '#6eafdc', '#427fc6', '#1f63b0', '#58ae76', '#8ef3ed'] },
    cross: { name: 'Cross', colors: ['#fa995e', '#75adb6', '#d88cb6', '#006e89', '#e7665f', '#9cb57f', '#f2a99e', '#ffd79b'] },
    flexoki: { name: 'Flexoki', colors: ['#d14d41', '#3aa99f', '#d0a215', '#8b7ec8', '#879a39', '#ce5d97', '#4385be', '#da702c'] },
    okabeIto: { name: 'Okabe–Ito', colors: ['#e59f00', '#55b3e9', '#009d73', '#efe342', '#0072b1', '#d45e00', '#cc78a7', '#b4dcf5'] },
};

export const app = {
    // the group
    name: '',
    presetIndex: -1,
    input: null,              // { mats, anti, consts }
    matrices: [],             // generators as typed, det 1
    exactCtx: null,
    fieldTex: '',             // the field the entries were read in, if exact
    depth: 8,
    maxFaces: 96,
    basepoint: I2(),          // B
    // the view
    S: I2(),                  // scene isometry (home frame → scene)
    V: I2(),                  // current element (as typed)
    word: [],
    // results
    status: 'idle',           // idle | computing | ready | error
    error: null,
    home: null, report: null, invariants: null, timing: null,
    faceColors: [], faceClass: [], vertexClass: [],
    delaunay: null,           // computeDelaunayDomain result, on demand
    delaunayColors: [],
    planar: false,            // a group in PGL₂(ℝ)
    // display settings
    settings: {
        domain: 'dirichlet',  // dirichlet | delaunay
        plane: true,          // draw a Fuchsian group in its plane
        faces: true, edges: true, vertices: true, labels: true,
        opacity: 1,
        tiling: true, tilingRadius: 1.4,
        honeycomb: false,     // edges of the tiling only (inside view)
        cayley: false, limit: false,
        palette: 'hiroshige',
        theme: 'light',
        ballRadius: 0.22,
    },
    selected: -1,             // wall (Dirichlet) or side (Delaunay) index
    hover: -1,
    anim: null,
    inside: false,
};

// ---------------- events ----------------

const listeners = new Map();
export function on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, []);
    listeners.get(ev).push(fn);
}
export function emit(ev, data) {
    for (const fn of listeners.get(ev) || []) {
        try { fn(data); } catch (e) { console.error(`[${ev}]`, e); }
    }
}

// ---------------- loading a group ----------------

/**
 * A preset name (which may carry <sup>…</sup>, as the desktop tool's HTML
 * does) as rich-text parts for the panels: superscripts become LaTeX.
 */
export function nameParts(name) {
    const parts = [];
    const re = /<sup>(.*?)<\/sup>/g;
    let last = 0, m;
    while ((m = re.exec(name))) {
        if (m.index > last) parts.push(name.slice(last, m.index));
        parts.push({ tex: `{}^{${m[1]}}` });
        last = re.lastIndex;
    }
    if (last < name.length) parts.push(name.slice(last));
    return parts.length ? parts : [name];
}

/** The same name as plain text (for the page title bar). */
export const namePlain = (name) => name.replace(/<sup>(.*?)<\/sup>/g, '^($1)').replace(/<[^>]+>/g, '');

/** Library presets grouped by category, in the desktop tool's order. */
export const CATEGORY_ORDER = [
    'Knots, links & bundles', 'Closed 3-manifolds', 'Arithmetic & Bianchi groups',
    'Surfaces & Fuchsian groups', 'Kaleidoscopes — reflection groups', 'Fractal limit sets',
    'Riley slice — pleating-ray cusps'
];
export function libraryByCategory() {
    const cats = new Map();
    exampleLibrary.forEach((e, i) => {
        const c = e.cat || 'Other';
        if (!cats.has(c)) cats.set(c, []);
        cats.get(c).push({ index: i, name: e.name, desc: (e.desc || '').replace(/<[^>]+>/g, '') });
    });
    const order = [...CATEGORY_ORDER.filter(c => cats.has(c)), ...[...cats.keys()].filter(c => !CATEGORY_ORDER.includes(c))];
    return order.map(c => ({ name: c, items: cats.get(c) }));
}

export function loadPreset(idx) {
    const e = exampleLibrary[idx];
    if (!e) return;
    app.presetIndex = idx;
    const consts = (e.consts || []).slice();
    let name = e.name;
    // As in the desktop tool: the Hecke group gets a random n from 3 to 10 on each load.
    if (e.name === 'Hecke group') {
        const n = 3 + Math.floor(Math.random() * 8);
        consts.push(['n', String(n)]);
        name = `Hecke group, n = ${n}`;
    }
    setGroup({ mats: e.mats, anti: e.anti || [], consts }, { name, depth: e.depth || 8 });
}

export function randomPreset() {
    let i;
    do { i = Math.floor(Math.random() * exampleLibrary.length); } while (exampleLibrary.length > 1 && i === app.presetIndex);
    loadPreset(i);
}

/**
 * Read a group { mats, anti, consts } and compute it. Returns false (and sets
 * app.error) when the entries do not parse.
 */
export function setGroup(input, { name = '', depth = 8, bp = null } = {}) {
    let built;
    try {
        built = buildGroup(input);
    } catch (e) {
        app.error = e.message;
        app.status = 'error';
        emit('status');
        return false;
    }
    app.input = JSON.parse(JSON.stringify(input));
    app.name = name;
    app.matrices = built.matrices;
    app.exactCtx = built.exactCtx;
    app.fieldTex = built.exactCtx && built.exactCtx.field && built.exactCtx.field.tex ? safe(() => built.exactCtx.field.tex()) : '';
    app.depth = depth;
    app.basepoint = bp ? basepointFrom(bp) : I2();
    app.planar = isRealGroup(app.matrices);
    app.error = null;
    resetView({ quiet: true });
    app.selected = -1;
    emit('group');
    requestCompute();
    return true;
}

const safe = (f) => { try { return f(); } catch (e) { return ''; } };

function basepointFrom(bp) {
    const v = new THREE.Vector3(...bp);
    const r = v.length();
    if (r < 1e-9) return I2();
    return translationTowards(v.normalize(), 2 * Math.atanh(Math.min(r, 0.999)));
}

/** The URL state of the desktop tool (#s=…), if any: opens the same group here. */
export function loadFromURL() {
    const st = readStateFromURL();
    if (!st || !Array.isArray(st.mats) || !st.mats.length) return false;
    if (st.theme === 'light' || st.theme === 'dark') app.settings.theme = st.theme;
    if (st.dom === 'delaunay') app.settings.domain = 'delaunay';
    if (st.faces) app.maxFaces = st.faces;
    return setGroup({ mats: st.mats, anti: st.anti || [], consts: st.consts || [] },
        { name: st.name || 'Linked group', depth: st.depth || 8, bp: st.bp || null });
}

/** A permalink for the desktop tool (same #s= format). */
export function desktopState() {
    if (!app.input) return '';
    return encodeState({ v: 1, ...app.input, depth: app.depth, faces: app.maxFaces, dom: app.settings.domain === 'delaunay' ? 'delaunay' : undefined });
}

// ---------------- computing ----------------

const service = createDomainService({ version: VERSION });
let seq = 0;

function homeGenerators() {
    const B = app.basepoint, Bi = B.inv();
    return app.matrices.map(m => Bi.mul(m).mul(B).normalized());
}

export async function requestCompute() {
    if (!app.matrices.length) return;
    const input = {
        gens: homeGenerators().map(matToArr),
        origGens: app.matrices.map(matToArr),
        B: matToArr(app.basepoint),
        maxFaces: app.maxFaces,
        maxDepth: app.depth,
        fullDirichlet: false,
        exact: app.exactCtx ? safe(() => serializeTowerContext(app.exactCtx)) || null : null,
        ford: null,
    };
    const my = ++seq;
    app.status = 'computing';
    emit('status');
    const t0 = performance.now();
    const res = await service.request(input);
    if (res.stale || my !== seq) return;
    if (res.error) {
        app.status = 'error';
        app.error = `Computation error: ${res.error}`;
        emit('status');
        return;
    }
    install(res.result);
    app.status = 'ready';
    console.info(`[domain] ${app.home.walls.length} faces, ${app.report.status} in ${Math.round(performance.now() - t0)} ms`, res.result.timing);
    emit('domain');
    emit('status');
}

function deserializeDomain(d) {
    const walls = d.walls.map(w => {
        const cov = new THREE.Vector4(...w.cov);
        return {
            cov, geom: covToGeom(cov), elem: arrToMat(w.elem), word: w.word, kind: w.kind,
            isParabolic: w.isParabolic,
            pairing: w.pairing ? {
                alg: arrToMat(w.pairing.alg), word: w.pairing.word,
                partner: w.pairing.partner, residual: w.pairing.residual
            } : null
        };
    });
    const v3 = (a) => (a ? new THREE.Vector3(...a) : null);
    const H = {
        mode: d.mode, walls, stabilizer: d.stabilizer,
        q0: v3(d.q0), conePoint: v3(d.conePoint), basepoint: v3(d.basepoint), ref: v3(d.ref),
        notes: d.notes || []
    };
    H.poly = buildPolyhedron(walls);
    return H;
}

function install(result) {
    app.home = deserializeDomain(result.domain);
    app.report = result.report;
    app.invariants = result.invariants;
    app.timing = result.timing;
    app.delaunay = null;
    app.selected = -1;
    recolor();
    try { app.vertexClass = vertexClasses(app.home, vertexClass); } catch (e) { app.vertexClass = []; }
    if (app.settings.domain === 'delaunay') ensureDelaunay();
}

// ---------------- face colors ----------------

const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

/**
 * Until (or unless) the desktop tool's face coloring loads: one color per
 * pairing class, in palette order, then lighter and darker rounds.
 */
const simpleColoring = {
    colorClasses(partner, contacts, pool) {
        const classes = new Array(partner.length).fill(-1);
        let k = 0;
        partner.forEach((j, i) => {
            if (classes[i] >= 0) return;
            classes[i] = k;
            if (j >= 0 && j < partner.length && classes[j] < 0) classes[j] = k;
            k++;
        });
        const P = pool(k);
        return { classes, colors: classes.map(c => P[c % P.length].rgb), count: k };
    },
    polyhedronContacts: () => [],
    delaunayContacts: () => [],
    discretePool(hex, k) {
        const out = [];
        for (let i = 0; i < Math.max(k, hex.length); i++) {
            const base = hexRgb(hex[i % hex.length]), round = Math.floor(i / hex.length);
            const t = round === 0 ? 0 : (round % 2 ? 0.35 : -0.3);
            out.push({ rgb: base.map(x => (t > 0 ? x + (1 - x) * t : x * (1 + t))), cost: 0 });
        }
        return out;
    },
};
let coloring = simpleColoring;
faceColoringReady.then((c) => {
    if (!c) return;
    coloring = c;
    if (app.home) { recolor(); emit('recolor'); }
});

/** Pairing-class colors: paired faces alike, touching faces apart (faceColoring.js). */
export function recolor() {
    if (!app.home) return;
    const { colorClasses, polyhedronContacts, delaunayContacts, discretePool } = coloring;
    const pal = (PALETTES[app.settings.palette] || PALETTES.hiroshige).colors;
    const pool = (k) => discretePool(pal, k);
    const partner = app.home.walls.map(w => (w.pairing ? w.pairing.partner : -1));
    let contacts = [];
    try { contacts = polyhedronContacts(app.home.poly); } catch (e) { contacts = []; }
    const { colors, classes } = colorClasses(partner, contacts, pool);
    app.faceColors = colors;
    app.faceClass = classes;
    if (app.delaunay && app.delaunay.ok) {
        const R = app.delaunay;
        const p2 = R.sides.map((S, si) => { const P = R.pairs[S.pair]; return P.minus === si ? P.plus : P.minus; });
        app.delaunayColors = colorClasses(p2, safe(() => delaunayContacts(R)) || [], pool).colors;
    }
}

/** The Delaunay domain of the current group (main thread; built once per domain). */
export function ensureDelaunay() {
    if (!app.home) return null;
    if (!app.delaunay) {
        try { app.delaunay = computeDelaunayDomain(app.home, { dim: 3 }); }
        catch (e) { app.delaunay = { ok: false, message: e.message }; }
        recolor();
    }
    return app.delaunay;
}

// ---------------- labels: face pairings as s_k ----------------

/**
 * The face pairings as generators s_k, in the desktop tool's order (basepoint
 * stabilizer first, then by word length): [{ k, wall, partner, word, home }].
 * `home` is the home-frame element g with wall = Bis(q, g·q); `word` is g's
 * word in the input generators. Face `wall` is labeled s_k, `partner` s_k⁻¹.
 */
export function pairingGenerators() {
    const H = app.home;
    if (!H) return [];
    const out = [];
    const taken = new Set();
    H.walls.forEach((w, i) => {
        if (taken.has(i)) return;
        taken.add(i);
        const p = w.pairing;
        if (p && p.partner >= 0) taken.add(p.partner);
        out.push({
            wall: i, partner: p ? p.partner : -1, kind: w.kind,
            word: p ? invertWord(p.word) : w.word,
            home: p ? p.alg.inv().normalized() : w.elem,
            unpaired: !p
        });
    });
    out.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'cone' ? -1 : 1;
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        for (let i = 0; i < a.word.length; i++) if (a.word[i] !== b.word[i]) return a.word[i] - b.word[i];
        return 0;
    });
    out.forEach((g, k) => { g.k = k + 1; });
    return out;
}

/** LaTeX label of face (wall) i: s_k, s_k^{-1}, or s_k for a self-paired face. */
export function faceLabel(i, gens = pairingGenerators()) {
    for (const g of gens) {
        if (g.wall === i) return `s_{${g.k}}`;
        if (g.partner === i) return `s_{${g.k}}^{-1}`;
    }
    return '?';
}

// ---------------- the view ----------------

export function resetView({ quiet = false } = {}) {
    app.S = I2();
    app.V = I2();
    app.word = [];
    app.anim = null;
    if (!quiet) emit('view');
}

/**
 * Animate the view by the home-frame element h (S ← S·h). `g`/`word` record
 * the element as typed for the current-element readout.
 */
export function applyHome(h, g, word, { duration = 1100 } = {}) {
    if (app.anim) return;
    const S0 = app.S;
    const done = () => {
        app.S = S0.mul(h).normalized();
        app.V = app.V.mul(g).normalized();
        app.word = reduceWord([...app.word, ...word]);
        app.anim = null;
        emit('view');
    };
    const path = isometryPath(h);
    if (!path) { done(); return; }
    app.anim = { t0: performance.now(), duration, step: (t) => { app.S = S0.mul(path(t)); }, done };
    emit('anim');
}

/** Apply input generator i (or its inverse). */
export function applyGenerator(i, inverse = false) {
    const g0 = app.matrices[i];
    if (!g0) return;
    const g = inverse ? g0.inv().normalized() : g0;
    const B = app.basepoint;
    applyHome(B.inv().mul(g).mul(B).normalized(), g, [inverse ? -(i + 1) : i + 1]);
}

/**
 * Go through face i: the tile across it comes to the centre (S ← S·h⁻¹ for
 * the wall element h, the face's pairing s⁻¹ in the desktop tool's terms).
 */
export function goThroughFace(i) {
    const H = app.home;
    if (!H || !H.walls[i]) return;
    const w = H.walls[i];
    const h = w.elem.inv().normalized();
    const B = app.basepoint;
    applyHome(h, B.mul(h).mul(B.inv()).normalized(), invertWord(w.word || []));
}

/** Go through Delaunay side si (its facets' element, inverted). */
export function goThroughSide(si) {
    const R = app.delaunay;
    if (!R || !R.ok || !R.sides[si]) return;
    const el = R.sides[si].el;
    if (!el) return;
    const h = el.m.inv().normalized();
    const B = app.basepoint;
    applyHome(h, B.mul(h).mul(B.inv()).normalized(), invertWord(el.w || []));
}

/** Step the running animation (call every frame). */
export function stepAnimation(now) {
    const a = app.anim;
    if (!a) return false;
    const t = Math.min(1, (now - a.t0) / a.duration);
    a.step(t);
    if (t >= 1) a.done();
    return true;
}

/** Left-multiply the scene by a flight isometry (inside view). */
export function fly(T) {
    app.S = T.mul(app.S).normalized();
}

/**
 * Keep the eye (scene origin) inside the domain during flight: when it
 * leaves across wall i, re-anchor S ← S·elem_i — the tiling looks the same,
 * and the current element records where in the cover the eye is.
 */
export function reanchor(violatedWall, ballToHyp, applyMatrixToBall) {
    const H = app.home;
    if (!H) return;
    for (let it = 0; it < 6; it++) {
        const e = applyMatrixToBall(app.S.inv().normalized(), new THREE.Vector3());
        const i = violatedWall(H.walls, ballToHyp(e), 1e-7);
        if (i < 0) return;
        const w = H.walls[i];
        app.S = app.S.mul(w.elem).normalized();
        const B = app.basepoint;
        app.V = app.V.mul(B.mul(w.elem).mul(B.inv())).normalized();
        app.word = reduceWord([...app.word, ...(w.word || [])]);
        emit('reanchor');
    }
}

export function setSetting(key, value) {
    if (app.settings[key] === value) return;
    app.settings[key] = value;
    if (key === 'palette') recolor();
    if (key === 'domain' && value === 'delaunay') ensureDelaunay();
    emit('settings', key);
}

/** Plain-text status line. */
export function statusSummary() {
    if (app.status === 'computing') return { kind: 'pending', text: 'Computing the domain and its certificate…' };
    if (app.status === 'error') return { kind: 'fail', text: app.error || 'Error' };
    const rep = app.report;
    if (!rep) return { kind: 'pending', text: 'Choose a group' };
    const nd = rep.nondiscrete;
    if (nd && nd.exact) return { kind: 'fail', text: 'Not discrete (exact certificate)' };
    if (rep.classical) return { kind: 'ok', text: 'Discrete (classical certificate)' };
    if (nd) return { kind: 'fail', text: 'Probably not discrete' };
    if (rep.status === 'verified') return { kind: 'ok', text: rep.exactUsed ? 'Discrete — verified exactly' : 'Discrete — verified numerically' };
    if (rep.status === 'incomplete') return { kind: 'warn', text: 'Resolvable conditions pass' };
    return { kind: 'fail', text: 'Discreteness not verified' };
}
