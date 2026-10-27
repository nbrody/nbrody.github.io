// main.js — the Dehn filling and drilling calculator.
//
//   Manifold  the census entry: triangulation, volume, cusp shapes, π₁, export to poincare
//   Unfold    knot → ideal tetrahedra → the fundamental polyhedron and its face pairings → the cusp
//   Fill      slopes, the path through cone manifolds, the filled manifold's invariants,
//             orbifolds along the way, Dehn surgery space
//   Drill     the inverse: the cone angle along a geodesic from 2π down to 0
//   View      models and overlays

import { CENSUS } from './census.js';
import { Triangulation } from './triangulation.js';
import { Solver, coreLength, coprime } from './solver.js';
import { holonomy, evalWord } from './develop.js';
import { fillingHomology, homologyTex } from './homology.js';
import { C, exp, add, scale, sub, abs } from './complex.js';
import { totalVolume } from './volume.js';
import { cuspedFrame, filledFrame, poincareLink, exactLink, exactRecordLink } from './export.js';
import {
    $, esc, tex, mix, renderTexIn, fmt, cTex, nameTex, slopeTex, wordTex, banner, wireBanner, openModal, wireModals,
    isLight, cssVar, palette,
} from './ui.js';
import { Stage } from './stage.js';
import { PolyView } from './polyView.js';
import { KnotView } from './knotView.js';
import { CuspView } from './cuspView.js';
import { SurgeryPlot } from './surgeryPlot.js';

const BY_ID = new Map(CENSUS.map((e) => [e.id, e]));
const PATH_N = 240;
const PLAY_SECONDS = 7;
const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;

const state = {
    entry: null, tri: null, sol: null,
    view: 'knot',
    slopes: [],                 // per cusp: {p, q} or null (complete)
    path: null,                 // { frames, ok, sMax, collapsed, why }
    s: 0, dir: 1, playing: false,
    assembly: 1, unfoldPlaying: false,
    frame: null, dirty: true,
    highlight: -1,
    plotCache: new Map(),
    mq: [],
};

// ---------------- setup ----------------

const stage = new Stage($('canvas3d'));
const texLayer = $('tex-layer');
const poly = new PolyView(stage, texLayer);
const knot = new KnotView(stage, texLayer);
const cusp = new CuspView($('cusp-canvas'), texLayer);
const plot = new SurgeryPlot($('surgery-plot'), { onPick: (pt) => { setSlopeFields([{ p: pt.p, q: pt.q }]); fill(); } });

function themeColors() {
    const pal = palette();
    return {
        pal,
        ink: cssVar('--ink'), dim: cssVar('--ink-dim'), edge: cssVar('--edge'), core: cssVar('--core'),
        slope: cssVar('--slope'), mer: cssVar('--mer'), lon: cssVar('--lon'), accent: cssVar('--accent'),
        light: isLight(),
    };
}
function applyTheme() {
    const c = themeColors();
    poly.setColors({ pair: c.pal, edge: c.edge, core: c.core, ink: c.ink, sphere: c.accent, light: c.light });
    knot.setColors({ knot: c.light ? '#3b4257' : '#dfe6f5', torus: c.accent, slope: c.slope, mer: c.mer, lon: c.lon });
    cusp.setColors({ tet: c.pal, ink: c.ink, core: c.core, slope: c.slope, mer: c.mer, lon: c.lon, light: c.light });
    plot.render();
    state.dirty = true;
}
function setTheme(light, save = true) {
    document.documentElement.classList.toggle('light', light);
    const b = $('theme-btn');
    const label = light ? 'Switch to dark mode' : 'Switch to light mode';
    b.title = label; b.setAttribute('aria-label', label);
    if (save) { try { localStorage.setItem('dehnFillings-theme', light ? 'light' : 'dark'); } catch { /* storage blocked */ } }
    applyTheme();
    if (state.entry) { renderManifoldTab(); renderUnfoldTab(); }
}

/** Frame the current 3D view in the free area. */
function fitView() {
    if (state.view === 'knot') stage.fit(1.3);
    else if (state.view === 'poly') stage.fit(1.05);
}

function layoutInsets() {
    const r = $('control-panel').getBoundingClientRect();
    const right = r.left > innerWidth / 2 && r.width > 80 ? innerWidth - r.left + 10 : 0;
    const bottom = r.top > innerHeight / 2 ? innerHeight - r.top + 10 : 0;
    stage.setInset(right, bottom);
    cusp.setInset(right, bottom);
    if (state.entry) fitView();
    state.dirty = true;
}

// ---------------- loading a manifold ----------------

function loadManifold(id, { slopes = null, s = null, dir = 1, play = false, view = null } = {}) {
    const entry = BY_ID.get(id) || BY_ID.get('4_1');
    state.entry = entry;
    state.tri = new Triangulation(entry);
    state.sol = new Solver(state.tri);
    state.highlight = -1;
    state.frame = null;
    poly.setManifold(state.tri);
    poly.showGhost(null);
    cusp.setManifold(state.tri);
    knot.setKnot(entry.curve || null);
    state.slopes = slopes || new Array(entry.nCusp).fill(null);
    state.path = null;
    state.s = 0;
    setPlaying(false);
    state.unfoldPlaying = false;
    state.assembly = 1;
    poly.setAssembly(1);
    $('unfold-range').value = '1000';
    state.dir = dir;
    $('cusp-pick').innerHTML = Array.from({ length: entry.nCusp }, (_, k) => `<option value="${k}">cusp ${k}</option>`).join('');
    renderManifoldTab();
    renderUnfoldTab();
    renderSlopeFields();
    renderDrillTab();
    if (state.slopes.some(Boolean)) computePath({ s, play });
    else { setCompleteFrame(); renderFillResults(); }
    setView(view || (entry.curve ? state.view : (state.view === 'knot' ? 'poly' : state.view)));
    computePlot();
    syncURL();
}

function setCompleteFrame() {
    const st = state.sol.completeState();
    state.frame = state.sol.frame(st, 0, state.slopes.map(() => null));
    state.path = null;
    $('timeline').hidden = true;
    state.dirty = true;
}

// ---------------- the path through cone manifolds ----------------

function specAt(s) {
    return state.slopes.map((sl) => (sl ? { p: sl.p, q: sl.q, t: s } : null));
}

function computePath({ s = null, play = false } = {}) {
    const t0 = performance.now();
    const path = state.sol.follow(state.sol.completeState(), specAt, { N: PATH_N });
    const last = path.frames[path.frames.length - 1];
    state.path = { ...path, sMax: path.ok ? 1 : last.s };
    const ms = performance.now() - t0;
    state.s = s === null ? (play ? (state.dir > 0 ? 0 : state.path.sMax) : state.path.sMax) : Math.min(s, state.path.sMax);
    $('timeline').hidden = false;
    renderTicks();
    setS(state.s);
    renderFillResults();
    knot.setSlope(state.slopes[0] && state.entry.nCusp === 1 ? state.slopes[0] : null);
    plot.setCurrent(state.slopes[0] && state.entry.nCusp === 1 ? state.slopes[0] : null);
    if (play) setPlaying(true);
    console.debug(`[dehn] path ${path.frames.length} frames in ${ms.toFixed(1)} ms`);
}

/** The structure at s, interpolated between path frames (linear in log-shapes). */
function frameAt(s) {
    const F = state.path.frames;
    if (s <= F[0].s) return F[0];
    if (s >= F[F.length - 1].s) return F[F.length - 1];
    let lo = 0, hi = F.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].s <= s) lo = mid; else hi = mid; }
    const a = F[lo], b = F[hi];
    const u = (s - a.s) / (b.s - a.s || 1);
    const lerp = (x, y) => add(x, scale(sub(y, x), u));
    const st = { w: a.st.w.map((x, j) => lerp(x, b.st.w[j])), L: a.st.L.map((x, j) => lerp(x, b.st.L[j])) };
    return state.sol.frame(st, s, specAt(s));
}

function setS(s) {
    if (!state.path) return;
    state.s = Math.max(0, Math.min(s, state.path.sMax));
    state.frame = frameAt(state.s);
    $('scrub').value = String(Math.round(state.s * 1000));
    renderReadout();
    state.dirty = true;
}

/** Snap a dragged cone angle to the marked angles (0, 2π/n, π, 2π) within about 4°. */
function snapS(s) {
    if (!state.path) return s;
    const targets = [0, 1];
    for (let n = 2; n <= 8; n++) targets.push(1 / n);
    let best = s, d = 0.012;
    for (const t of targets) if (t <= state.path.sMax + 1e-9 && Math.abs(s - t) < d) { best = t; d = Math.abs(s - t); }
    return best;
}

function renderTicks() {
    const P = state.path;
    const ticks = $('scrub-ticks'), labels = $('scrub-labels');
    let h = '';
    for (let n = 2; n <= 8; n++) if (1 / n <= P.sMax + 1e-9) h += `<span class="tick orb" style="left:${100 / n}%" title="cone angle 2π/${n}: an orbifold"></span>`;
    if (P.sMax < 1 - 1e-9) h += `<span class="dead" style="left:${100 * P.sMax}%; right:0"></span>`;
    ticks.innerHTML = h;
    labels.innerHTML = [[0, '0', 'translateX(0)'], [0.5, '\\pi', 'translateX(-50%)'], [1, '2\\pi', 'translateX(-100%)']]
        .map(([x, t, tr]) => `<span style="left:${100 * x}%; transform:${tr}">${tex(t)}</span>`).join('');
}

function renderReadout() {
    const fr = state.frame;
    if (!fr) return;
    const theta = 360 * state.s;
    const core = fr.cores.find(Boolean);
    const n = Math.round(1 / state.s);
    const orb = state.s > 0 && n >= 2 && Math.abs(state.s - 1 / n) < 0.0021 && n <= 12;
    const rows = [
        ['\\theta', state.s >= 0.9995 ? '2\\pi' : orb ? (n === 2 ? '\\pi' : n % 2 === 0 ? `\\pi/${n / 2}` : `2\\pi/${n}`) : `${theta.toFixed(1)}^\\circ`],
        ['\\mathrm{vol}', fmt(fr.volume, 5)],
    ];
    if (core) rows.push(['\\ell_{\\mathrm{core}}', fmt(core.re, 5)]);
    $('readout').innerHTML = rows.map(([k, v]) => `<span class="k">${tex(k)}</span><span class="v">${tex(v)}</span>`).join('');
    $('dir-btn').textContent = state.dir > 0 ? 'fill →' : '← drill';
}

function setPlaying(on) {
    state.playing = on;
    $('play-btn').classList.toggle('playing', on);
    if (on && state.path) {
        if (state.dir > 0 && state.s >= state.path.sMax - 1e-6) setS(0);
        if (state.dir < 0 && state.s <= 1e-6) setS(state.path.sMax);
    }
}

// ---------------- views ----------------

function setView(v) {
    if (v === 'knot' && !state.entry.curve) v = 'poly';
    state.view = v;
    document.querySelectorAll('.view-chip[data-view]').forEach((b) => {
        b.classList.toggle('active', b.dataset.view === v);
        if (b.dataset.view === 'knot') b.disabled = !state.entry.curve;
    });
    $('cusp-modes').hidden = v !== 'cusp';
    knot.setVisible(v === 'knot');
    poly.setVisible(v === 'poly');
    $('canvas3d').hidden = v === 'cusp';
    cusp.setVisible(v === 'cusp');
    stage.controls.autoRotate = $('opt-spin').checked && v !== 'cusp';
    fitView();
    $('view-caption').innerHTML = mix({
        knot: 'The knot in $S^3$, the boundary torus of a neighbourhood, its meridian $m$ and Seifert longitude $l$, and the filling slope $p\\,m + q\\,l$. Drag to turn.',
        poly: 'The ideal tetrahedra in the Poincaré ball (or the Klein model, where they are straight). Assembled, they form a fundamental polyhedron $D$; faces of the same color are glued by the face pairings $g_k$. Drag to turn, scroll to zoom.',
        cusp: 'The view from the cusp: the tetrahedra meet a horosphere in triangles, which tile the plane by the holonomy of the cusp torus. As the cone angle grows, the tiling winds around the core; in log coordinates $w = \\log(z - c)$ it stays a lattice and the filling curve is a vertical segment of length $\\theta$, which closes up at $\\theta = 2\\pi$. Scroll to zoom, drag to pan.',
    }[v]);
    state.dirty = true;
}

// ---------------- Manifold tab ----------------

function renderManifoldTab() {
    const e = state.entry;
    const kind = { knot: 'knot complement', census: 'census manifold', link: 'link complement', drilled: 'drilled manifold' }[e.kind];
    const aliases = e.aliases.filter((a) => a !== e.id).slice(0, 4).map((a) => tex(nameTex(a))).join(', ');
    $('manifold-card').innerHTML = `
        <div class="m-head"><span class="m-name">${tex(nameTex(e.id))}</span> <span class="badge">${esc(kind)}</span></div>
        <p class="card-text">${mix(e.title.replace(/(\d)_(\d)/g, '$$$1_$2$$'))}${aliases ? ` <span class="dim">— also ${aliases}</span>` : ''}</p>
        <p class="card-note">${mix(e.note.replace(/(\d)_(\d)/g, '$$$1_$2$$'))}</p>`;
    const pres = e.pres;
    const gens = pres.gens.join(', ');
    const rels = pres.rels.map((w) => wordTex(w)).join(',\\; ');
    const shapes = e.cuspShapes.map((s, k) => `${e.nCusp > 1 ? `\\tau_${k} = ` : '\\tau = '}${cTex(C(s[0], s[1]), 5)}`).join(',\\quad ');
    const periph = pres.periph.map(([m, l], k) => `${tex(e.nCusp > 1 ? `m_${k} = ${wordTex(m)},\\; l_${k} = ${wordTex(l)}` : `m = ${wordTex(m)},\\; l = ${wordTex(l)}`)}`).join('<br>');
    const hom = fillingHomology(pres, pres.periph.map(() => null));
    $('manifold-results').innerHTML = `
        <div class="control-group">
            <span class="control-label">Hyperbolic structure</span>
            <dl class="facts">
                <dt>tetrahedra</dt><dd>${tex(String(e.nTet))} ideal tetrahedra, ${tex(String(e.nTet))} edges</dd>
                <dt>cusps</dt><dd>${tex(String(e.nCusp))}</dd>
                <dt>volume</dt><dd>${tex(fmt(e.volume, 10))}</dd>
                <dt>cusp shape</dt><dd>${tex(shapes)}</dd>
                <dt>${tex('H_1')}</dt><dd>${tex(homologyTex(hom))}</dd>
            </dl>
        </div>
        <div class="control-group">
            <span class="control-label">Fundamental group</span>
            <p class="card-text">${tex(`\\pi_1 = \\langle ${gens} \\mid ${rels} \\rangle`)}</p>
            <p class="card-text dim">${periph}</p>
            <p class="card-note">SnapPy's simplified presentation; ${tex('m')} and ${tex('l')} are the meridian and longitude${e.kind === 'knot' ? ' (the Seifert longitude, null-homologous in the knot complement)' : ''}, and the slope ${tex('p/q')} is the curve ${tex('p\\,m + q\\,l')}.</p>
            <div class="btn-row"><a class="btn btn-add-alt grow" id="poincare-cusped" target="_blank" rel="noopener">Open ${tex('\\pi_1')} in poincare</a></div>
        </div>`;
    const link = $('poincare-cusped');
    link.href = cuspedPoincareLink();
    link.title = 'The holonomy in floating point';
    const note = document.createElement('p');
    note.className = 'card-note';
    link.parentElement.after(note);
    note.innerHTML = 'In floating point (decimals).';
    if (PRESET_OF[e.id]) {
        presetLink(PRESET_OF[e.id]).then((u) => { if (u && state.entry === e) { link.href = u; note.innerHTML = `poincare's exact preset “${esc(PRESET_OF[e.id])}”.`; } });
    } else {
        loadExact(e.id).then((x) => {
            if (!x?.complete || state.entry !== e) return;
            link.href = exactRecordLink(x.complete);
            note.innerHTML = `Exact: the holonomy lies in ${tex('\\mathrm{PGL}_2(K)')} for the shape field ${tex(`K = \\mathbb Q(w)`)}, ${tex(`${x.complete.poly} = 0`)}.`;
        });
    }
}

const PRESET_OF = { '4_1': 'Figure eight knot group', L6a4: 'Borromean rings group' };
const exactCache = new Map();
/** Exact holonomy from tools/make_exact.py (exact/<id>.json), or null. */
function loadExact(id) {
    if (!exactCache.has(id)) {
        exactCache.set(id, fetch(`exact/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    }
    return exactCache.get(id);
}
let libraryPromise = null;
/** poincare's exact preset of the given name, as a permalink. */
function presetLink(name) {
    libraryPromise = libraryPromise || import('../../poincare/js/groupLibrary.js').catch(() => null);
    return libraryPromise.then((mod) => {
        const ex = mod?.exampleLibrary?.find((x) => x.name === name);
        if (!ex) return null;
        return exactLink({ mats: ex.mats, consts: ex.consts || [], anti: ex.anti || null, depth: ex.depth || 8 });
    });
}

function cuspedPoincareLink() {
    const z = state.sol.shapes(state.sol.completeState());
    const H = holonomy(state.tri, z);
    const X = cuspedFrame(H.periph[0].m);
    return poincareLink(X, H.simple.slice(1));
}

// ---------------- Unfold tab ----------------

const UNFOLD_STEPS = [
    { title: 'The knot', text: 'The complement of the knot is the manifold; its hyperbolic structure is made of ideal tetrahedra whose vertices all lie on the knot.', go: () => { setView('knot'); } },
    { title: 'Ideal tetrahedra', text: 'Cut along the triangulation: ideal tetrahedra, vertices at infinity. Faces of the same color are glued; the arrows mark which edges become one edge.', go: () => { setView('poly'); setAssembly(0); } },
    { title: 'Unfold into hyperbolic space', text: 'Glue the tetrahedra across the faces of a maximal tree, one at a time: a fundamental polyhedron for the holonomy.', go: () => { setView('poly'); setAssembly(0); state.unfoldPlaying = true; } },
    { title: 'Face pairings', text: 'The faces left on the boundary come in pairs. The isometries pairing them generate π₁, the knot group. Hover a pairing below to see its translate of the polyhedron.', go: () => { setView('poly'); setAssembly(1); } },
    { title: 'The cusp', text: 'Near the knot, the tetrahedra meet a torus in triangles: the view from the cusp. Filling changes this picture most visibly.', go: () => { setView('cusp'); } },
];

function renderUnfoldTab() {
    const e = state.entry, tri = state.tri;
    const tree = e.nTet - 1;
    $('unfold-sub').innerHTML = mix(`$${nameTex(e.id)}$ is made of ${e.nTet} ideal tetrahedra with ${tri.facePairs.length} pairs of glued faces: ${tree === 1 ? 'one glues' : `${tree} glue`} the tetrahedra into a polyhedron along SnapPy's maximal tree, and the other ${tri.nOrig} are its face pairings.`);
    $('unfold-steps').innerHTML = UNFOLD_STEPS.map((s, i) => `
        <button class="step" data-step="${i}"><span class="num">${i + 1}</span><span><span class="st">${esc(s.title)}</span><br><span class="sd">${mix(s.text.replace('π₁', '$\\pi_1$'))}</span></span></button>`).join('');
    const pal = palette();
    const gens = [];
    for (const fp of tri.facePairs) if (fp.gen > 0) gens.push(fp);
    gens.sort((a, b) => a.gen - b.gen);
    // the face pairings of the complete structure (the cusped group)
    const H = holonomy(tri, state.sol.shapes(state.sol.completeState()));
    const X = cuspedFrame(H.periph[0].m);
    const conj = (M) => { const P = [X[0], X[1], X[2], X[3]]; const Pi = [X[3], { re: -X[1].re, im: -X[1].im }, { re: -X[2].re, im: -X[2].im }, X[0]]; return mul2(mul2(P, M), Pi); };
    const items = gens.map((fp) => {
        const M = conj(H.gens[fp.gen]);
        const m = M.map((x) => cTex(x, 3));
        return `<div class="matrix-item" data-pair="${fp.index}" data-gen="${fp.gen}">
            <span class="swatch" style="background:${pal[(fp.gen - 1) % pal.length]}"></span>
            <span>${tex(`g_{${fp.gen}} = \\begin{pmatrix} ${m[0]} & ${m[1]} \\\\ ${m[2]} & ${m[3]} \\end{pmatrix}`)}</span></div>`;
    }).join('');
    const orig = (ch) => `g_{${ch.charCodeAt(0) - 96}}`;
    const words = e.pres.inOrig.map((w, i) => tex(`${e.pres.gens[i]} = ${wordTex(w, orig)}`)).join('<br>');
    const valences = tri.edgeClasses.map((c) => c.length);
    $('unfold-results').innerHTML = `
        <div class="control-group">
            <span class="control-label">Face pairings</span>
            <p class="card-note">Normalized so the meridian is ${tex('z \\mapsto z + 1')} (the cusp at ${tex('\\infty')}); the face labelled ${tex('g_k')} is where ${tex('D')} meets ${tex('g_k D')}.</p>
            <div class="matrix-list">${items}</div>
            <p class="card-text word-list">${words}</p>
        </div>
        <div class="control-group">
            <span class="control-label">Edges</span>
            <p class="card-text">${tex(String(tri.edgeClasses.length))} edges, of valences ${tex(valences.join(',\\,'))}: around each, the dihedral angles add up to ${tex('2\\pi')} (Thurston's gluing equations). Edge ${tex('e_k')} is marked with ${tex('k')} arrows.</p>
        </div>`;
    document.querySelectorAll('#unfold-steps .step').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('#unfold-steps .step').forEach((x) => x.classList.toggle('active', x === b));
        UNFOLD_STEPS[+b.dataset.step].go();
    }));
    document.querySelectorAll('#unfold-results .matrix-item').forEach((it) => {
        it.addEventListener('mouseenter', () => highlightPair(+it.dataset.pair, +it.dataset.gen));
        it.addEventListener('mouseleave', () => highlightPair(-1));
        it.addEventListener('click', () => { setView('poly'); setAssembly(1); highlightPair(+it.dataset.pair, +it.dataset.gen); });
    });
}
function mul2(A, B) {
    const m = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
    const ad = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
    return [ad(m(A[0], B[0]), m(A[1], B[2])), ad(m(A[0], B[1]), m(A[1], B[3])), ad(m(A[2], B[0]), m(A[3], B[2])), ad(m(A[2], B[1]), m(A[3], B[3]))];
}

function highlightPair(pair, gen = 0) {
    state.highlight = pair;
    poly.setHighlight(pair);
    if (pair >= 0 && gen > 0 && state.frame) {
        const H = holonomy(state.tri, state.frame.z);
        poly.showGhost(H.gens[gen]);
    } else poly.showGhost(null);
    state.dirty = true;
}

function setAssembly(a) {
    state.assembly = a;
    $('unfold-range').value = String(Math.round(a * 1000));
    poly.setAssembly(a);
    if (a < 1) poly.showGhost(null);
    state.dirty = true;
}

// ---------------- Fill tab ----------------

function renderSlopeFields() {
    const e = state.entry;
    const box = $('slope-fields');
    box.innerHTML = '';
    state.mq = [];
    for (let k = 0; k < e.nCusp; k++) {
        const row = document.createElement('div');
        row.className = 'slope-row';
        const label = e.nCusp === 1 ? 'Slope' : `Cusp ${k}`;
        row.innerHTML = `<span class="control-label">${label} ${e.nCusp === 1 ? '<span class="label-tex">' + tex('p/q') + '</span>' : ''}</span><span class="mq-field"></span>`;
        box.appendChild(row);
        const span = row.querySelector('.mq-field');
        const sl = state.slopes[k];
        if (MQ) {
            const f = MQ.MathField(span, { spaceBehavesLikeTab: true, handlers: { enter: () => fill(), edit: () => validateSlopes() } });
            f.latex(sl ? slopeLatex(sl) : '');
            state.mq.push(f);
        } else {
            span.contentEditable = 'true';
            span.textContent = sl ? `${sl.p}/${sl.q}` : '';
            state.mq.push({ latex: (v) => (v === undefined ? span.textContent : (span.textContent = v)) });
        }
    }
    const sugg = suggestions();
    $('slope-hint').innerHTML = (e.nCusp === 1 ? 'Leave empty for the complete structure; ' + tex('\\infty') + ' is the meridian. ' : 'Leave a cusp empty to keep it complete. ')
        + (sugg.length ? 'Try ' + sugg.map((s) => `<a href="#" class="sugg" data-s="${s.p},${s.q}${s.k !== undefined ? ',' + s.k : ''}">${tex(slopeTex(s.p, s.q))}</a>`).join(', ') + '.' : '');
    document.querySelectorAll('#slope-hint .sugg').forEach((a) => a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const [p, q, k] = a.dataset.s.split(',').map(Number);
        const sl = state.slopes.slice();
        sl[Number.isFinite(k) ? k : 0] = { p, q };
        setSlopeFields(sl);
        fill();
    }));
}
function suggestions() {
    const e = state.entry;
    if (e.nCusp !== 1) return e.kind === 'drilled' ? [{ p: 1, q: 0, k: e.nCusp - 1 }] : [{ p: 5, q: 1, k: 0 }];
    const out = [];
    for (const f of e.fillings || []) if (f.famous && !out.some((o) => o.p === f.slope[0] && o.q === f.slope[1])) out.push({ p: f.slope[0], q: f.slope[1] });
    for (const s of [[5, 1], [-5, 1], [7, 2], [1, 0]]) {
        if (out.length >= 4) break;
        if (!out.some((o) => o.p === s[0] && o.q === s[1])) out.push({ p: s[0], q: s[1] });
    }
    return out.slice(0, 4);
}
const slopeLatex = ({ p, q }) => (q === 0 ? '\\infty' : q === 1 ? String(p) : `${p < 0 ? '-' : ''}\\frac{${Math.abs(p)}}{${q}}`);

function setSlopeFields(slopes) {
    state.mq.forEach((f, k) => f.latex(slopes[k] ? slopeLatex(slopes[k]) : ''));
}

/** Parse a slope field: '' → null (complete); p, p/q, \frac{p}{q}, (p, q), \infty. */
export function parseSlope(latex) {
    let s = String(latex || '').replace(/\\left|\\right|\\ |\s/g, '').replace(/\\cdot/g, '');
    if (s === '') return { ok: true, value: null };
    if (s === '\\infty' || s === '∞') return { ok: true, value: { p: 1, q: 0 } };
    let m = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(s) || /^(-?)\\frac(\d)(\d)$/.exec(s);
    let p, q;
    if (m) { p = (m[1] ? -1 : 1) * +m[2]; q = +m[3]; }
    else if ((m = /^(-?\d+)\/(-?\d+)$/.exec(s))) { p = +m[1]; q = +m[2]; }
    else if ((m = /^\((-?\d+),(-?\d+)\)$/.exec(s))) { p = +m[1]; q = +m[2]; }
    else if ((m = /^(-?\d+)$/.exec(s))) { p = +m[1]; q = 1; }
    else return { ok: false, error: 'write a slope as p/q, p or (p, q)' };
    if (q < 0) { p = -p; q = -q; }
    if (p === 0 && q === 0) return { ok: false, error: '(0, 0) is not a slope' };
    if (!coprime(p, q)) return { ok: false, error: `${p} and ${q} are not coprime` };
    if (q === 0) p = 1;
    return { ok: true, value: { p, q } };
}

function validateSlopes() {
    let ok = true;
    state.mq.forEach((f, k) => {
        const r = parseSlope(f.latex());
        const span = $('slope-fields').querySelectorAll('.mq-field')[k];
        span.classList.toggle('invalid', !r.ok);
        if (!r.ok) ok = false;
    });
    return ok;
}

function fill() {
    const parsed = state.mq.map((f) => parseSlope(f.latex()));
    const bad = parsed.find((r) => !r.ok);
    if (bad) { banner(esc(bad.error), 'warning'); return; }
    state.slopes = parsed.map((r) => r.value);
    state.dir = 1;
    if (!state.slopes.some(Boolean)) { setCompleteFrame(); renderFillResults(); syncURL(); return; }
    computePath({ play: true });
    if (state.view === 'knot' && state.entry.nCusp > 1) setView('cusp');
    syncURL();
}

function isExceptional(sl) {
    const e = state.entry;
    return !!(e.exceptional || []).find(([p, q]) => p === sl.p && q === sl.q);
}
function censusInfo(sl) {
    const e = state.entry;
    return (e.fillings || []).find((f) => f.slope[0] === sl.p && f.slope[1] === sl.q) || null;
}

function renderFillResults() {
    const e = state.entry;
    const box = $('fill-results');
    if (!state.path) {
        box.innerHTML = `<div class="verdict info"><div class="vh">Complete structure</div>${mix('All cusps complete: the holonomy of each cusp torus is a lattice of parabolic translations.')}</div>`;
        return;
    }
    const P = state.path;
    const filled = state.slopes.map((s, k) => (s ? k : -1)).filter((k) => k >= 0);
    const name = (() => {
        const sl = state.slopes.map((s) => (s ? `(${s.p},\\,${s.q})` : '(\\cdot)')).join('');
        const base = nameTex(e.id);
        return `${e.kind === 'drilled' ? `(${base})` : base}${sl}`;
    })();
    const last = P.frames[P.frames.length - 1];
    const hom = fillingHomology(e.pres, state.slopes);
    const one = e.nCusp === 1 ? state.slopes[0] : null;
    const exc = one && isExceptional(one);
    const cinfo = one && censusInfo(one);
    const allFilled = state.slopes.every(Boolean);
    let verdict;
    if (P.ok) {
        verdict = `<div class="verdict yes"><div class="vh">${tex(name)} is hyperbolic</div>${mix(`The cone manifolds reach $\\theta = 2\\pi$: ${allFilled ? 'a closed' : 'a'} hyperbolic manifold of volume $${fmt(last.volume, 8)}$ (the cusped volume is $${fmt(e.volume, 8)}$).`)}</div>`;
    } else if (P.collapsed) {
        verdict = `<div class="verdict no"><div class="vh">The cone manifolds collapse at ${tex(`\\theta \\approx ${(360 * P.sFail).toFixed(1)}^\\circ`)}</div>${mix(`The volume goes to $0$ (Schläfli: $dV/d\\theta = -\\ell/2$), and the hyperbolic structures degenerate${Math.abs(P.sFail - 1 / 3) < 0.002 ? ' — at $2\\pi/3$ the orbifold is Euclidean' : ''}.`)} ${exc ? mix('The slope is exceptional: SnapPy finds no hyperbolic structure on the filling.') : one ? mix('The filling may still be hyperbolic, but it is not reached through these cone manifolds.') : ''}</div>`;
    } else {
        verdict = `<div class="verdict no"><div class="vh">The tetrahedra degenerate at ${tex(`\\theta \\approx ${(360 * P.sFail).toFixed(1)}^\\circ`)}</div>${mix(exc ? 'The slope is exceptional: SnapPy finds no hyperbolic structure on the filling.' : 'A shape reaches $0$, $1$ or $\\infty$; this triangulation cannot follow the deformation further.')}</div>`;
    }
    const facts = [];
    facts.push(['filling', tex(state.slopes.map((s, k) => (s ? `${e.nCusp > 1 ? `\\text{cusp }${k}:\\ ` : ''}${s.p}\\,m ${s.q < 0 ? '-' : '+'} ${Math.abs(s.q)}\\,l` : null)).filter(Boolean).join(',\\quad '))]);
    facts.push([tex('H_1'), tex(homologyTex(hom))]);
    if (P.ok) {
        facts.push(['volume', tex(fmt(last.volume, 10))]);
        filled.forEach((k) => {
            const c = last.cores[k];
            if (c) facts.push([filled.length > 1 ? `core ${k}` : 'core geodesic', `${tex(`\\ell + i\\tau = ${cTex(c, 6)}`)}`]);
        });
    }
    if (cinfo?.census) facts.push(['census', `${tex(`\\mathrm{${cinfo.census.replace(',', ',\\,')}}`)}${cinfo.famous ? ` — ${esc(cinfo.famous)}` : ''}`]);
    // orbifolds along the way
    const orbs = [];
    for (let n = 2; n <= 6; n++) if (1 / n <= P.sMax + 1e-9) orbs.push(n);
    const orbChips = orbs.map((n) => `<span class="chip orb">${tex(`\\theta = 2\\pi/${n}`)} <button class="btn btn-ghost small" data-orb="${n}">go</button><a class="btn btn-add-alt small" data-orb-link="${n}" target="_blank" rel="noopener">poincare</a></span>`).join('');
    box.innerHTML = `${verdict}
        <div class="control-group">
            <span class="control-label">${tex(name)}</span>
            <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
            ${P.ok && allFilled ? `<div class="btn-row"><a class="btn btn-add-alt grow" id="poincare-filled" target="_blank" rel="noopener">Open ${tex(name)} in poincare</a></div>` : ''}
            ${cinfo?.poincare ? `<div class="btn-row"><a class="btn btn-ghost grow" id="poincare-preset" target="_blank" rel="noopener">poincare's exact preset: ${esc(cinfo.poincare)}</a></div>` : ''}
        </div>
        ${orbs.length ? `<div class="control-group"><span class="control-label">Orbifolds on the way</span>
            <p class="card-note">${mix('At cone angle $2\\pi/n$ the cone manifold is a hyperbolic orbifold, and its holonomy is a discrete group with elliptic elements of order $n$ along the core.')}</p>
            <div class="chips">${orbChips}</div></div>` : ''}`;
    const fl = $('poincare-filled');
    if (fl) {
        fl.href = filledPoincareLink(1);
        const note = document.createElement('p');
        note.className = 'card-note';
        fl.parentElement.after(note);
        note.textContent = 'In floating point (decimals).';
        if (one) loadExact(e.id).then((x) => {
            const rec = x?.fillings?.[`${one.p}/${one.q}`];
            if (!rec || state.entry !== e || state.slopes[0] !== one) return;
            fl.href = exactRecordLink(rec);
            note.innerHTML = `Exact over the shape field ${tex('\\mathbb Q(w)')} of degree ${tex(String(rec.degree))}.`;
        });
    }
    const pr = $('poincare-preset');
    if (pr) presetLink(cinfo.poincare).then((u) => { if (u) pr.href = u; });
    box.querySelectorAll('[data-orb]').forEach((b) => b.addEventListener('click', () => { setPlaying(false); setS(1 / +b.dataset.orb); }));
    box.querySelectorAll('[data-orb-link]').forEach((a) => { a.href = filledPoincareLink(1 / +a.dataset.orbLink); });
}

function filledPoincareLink(s) {
    const fr = Math.abs(s - state.s) < 1e-12 ? state.frame : frameAt(s);
    const H = holonomy(state.tri, fr.z);
    const k = state.slopes.findIndex(Boolean);
    const X = filledFrame(H.periph[k].m, H.periph[k].l);
    return X ? poincareLink(X, H.simple.slice(1), { depth: 8 }) : '#';
}

// ---------------- Dehn surgery space ----------------

function computePlot() {
    const e = state.entry;
    $('plot-group').hidden = e.nCusp !== 1;
    if (e.nCusp !== 1) return;
    const pmax = 12, qmax = 4;
    const cached = state.plotCache.get(e.id);
    if (cached) { plot.setData({ ...cached, current: state.slopes[0] }); return; }
    const pts = [];
    for (let q = 0; q <= qmax; q++) for (let p = -pmax; p <= pmax; p++) {
        if (q === 0 && p !== 1) continue;
        if (!coprime(p, q)) continue;
        pts.push({ p, q });
    }
    const sol = state.sol, entry = e;
    let i = 0;
    $('plot-note').textContent = 'computing…';
    const step = () => {
        if (state.entry !== entry) return;
        const t0 = performance.now();
        while (i < pts.length && performance.now() - t0 < 30) {
            const pt = pts[i++];
            const sl = { p: pt.p, q: pt.q };
            pt.homology = homologyTex(fillingHomology(e.pres, [sl]));
            const ci = (e.fillings || []).find((f) => f.slope[0] === pt.p && f.slope[1] === pt.q);
            if (ci) { pt.census = ci.census; pt.famous = ci.famous; }
            if ((e.exceptional || []).some(([a, b]) => a === pt.p && b === pt.q)) { pt.status = 'exc'; continue; }
            const r = sol.solve([{ p: pt.p, q: pt.q, t: 1 }], { N: 10 });
            if (r.ok) { pt.status = 'hyp'; pt.volume = r.frame.volume; } else pt.status = 'fail';
        }
        if (i < pts.length) { setTimeout(step, 0); return; }
        const vols = pts.filter((x) => x.status === 'hyp').map((x) => x.volume);
        const data = { points: pts, vmin: Math.min(...vols), vmax: e.volume, pmax, qmax };
        state.plotCache.set(e.id, data);
        plot.setData({ ...data, current: state.slopes[0] });
        $('plot-note').innerHTML = `${tex(`|p| \\le ${pmax},\\ q \\le ${qmax}`)}`;
    };
    setTimeout(step, 30);
}

// ---------------- Drill tab ----------------

const CLOSED = [
    { name: 'Weeks manifold', census: 'm003(-3,1)', id: 'm003', slope: { p: -3, q: 1 }, preset: 'Weeks manifold (closed)', note: 'the smallest closed hyperbolic 3-manifold, volume $0.9427$' },
    { name: 'Meyerhoff manifold', census: 'm003(-2,3)', id: 'm003', slope: { p: -2, q: 3 }, preset: 'Meyerhoff manifold (closed)', note: 'the second smallest, volume $0.9814$ — also $4_1(5)$ and $5_2(5)$' },
    { name: 'FLMS manifold', census: 'm003(-4,1)', id: 'm003', slope: { p: -4, q: 1 }, preset: 'FLMS', note: 'non-arithmetic, with no immersed totally geodesic surfaces, volume $1.4236$' },
];

function renderDrillTab() {
    const e = state.entry;
    const parts = [];
    if (e.kind === 'drilled') {
        const parent = BY_ID.get(e.parent);
        const len = e.drilledCurveLength;
        parts.push(`<div class="control-group">
            <span class="control-label">This manifold</span>
            <p class="card-text">${mix(`$${nameTex(parent.id)}$ with its shortest closed geodesic drilled out (complex length $${cTex(C(len[0], len[1]), 4)}$). Cusp ${e.nCusp - 1} is the new cusp: filling it along its meridian $(1, 0)$ gives back $${nameTex(parent.id)}$.`)}</p>
            <p class="card-note">${mix(e.note)}</p>
            <div class="btn-row"><button class="btn btn-add grow" id="drill-here">Drill: ${tex('\\theta: 2\\pi \\to 0')}</button><button class="btn btn-ghost" id="fill-back">Fill back</button></div>
        </div>`);
    }
    const children = CENSUS.filter((c) => c.kind === 'drilled' && c.parent === e.id);
    for (const c of children) {
        const len = c.drilledCurveLength;
        parts.push(`<div class="control-group">
            <span class="control-label">A short geodesic</span>
            <p class="card-text">${mix(`The shortest closed geodesic of $${nameTex(e.id)}$ has complex length $${cTex(C(len[0], len[1]), 4)}$. Drilling it leaves a two-cusped manifold of volume $${fmt(c.volume, 6)}$.`)} ${mix(c.note)}</p>
            <div class="btn-row"><button class="btn btn-add grow" data-drill-child="${c.id}">Drill it</button></div>
        </div>`);
    }
    if (state.slopes.some(Boolean) && e.kind !== 'drilled') {
        parts.push(`<div class="control-group">
            <span class="control-label">The core of the filling</span>
            <p class="card-text">${mix('Undo the current filling: the core geodesic of the solid torus is drilled back out as the cone angle along it shrinks to $0$.')}</p>
            <div class="btn-row"><button class="btn btn-add grow" id="drill-core">Drill the core</button></div>
        </div>`);
    }
    parts.push(`<div class="control-group">
        <span class="control-label">Closed manifolds in poincare</span>
        <p class="card-note">${mix('Three closed manifolds in poincare\'s library are fillings of the figure-eight sister $\\mathrm{m003}$. Drilling the core of the filling recovers $\\mathrm{m003}$.')}</p>
        ${CLOSED.map((m, i) => `<div class="drill-item"><div><span class="st">${esc(m.name)}</span> ${tex(`= \\mathrm{${m.census.replace(',', ',\\,')}}`)}<br><span class="card-note">${mix(m.note)}</span></div>
            <div class="btn-row"><button class="btn btn-add small" data-closed="${i}">Drill</button><a class="btn btn-ghost small" data-closed-link="${i}" target="_blank" rel="noopener">poincare</a></div></div>`).join('')}
    </div>`);
    $('drill-results').innerHTML = parts.join('');
    $('drill-here')?.addEventListener('click', () => {
        const sl = new Array(e.nCusp).fill(null);
        sl[e.nCusp - 1] = { p: 1, q: 0 };
        state.slopes = sl; setSlopeFields(sl);
        state.dir = -1;
        computePath({ s: 1 });
        setPlaying(true);
        if (state.view === 'knot') setView('cusp');
    });
    $('fill-back')?.addEventListener('click', () => {
        const sl = new Array(e.nCusp).fill(null);
        sl[e.nCusp - 1] = { p: 1, q: 0 };
        state.slopes = sl; setSlopeFields(sl);
        state.dir = 1;
        computePath({ s: 0 });
        setPlaying(true);
    });
    document.querySelectorAll('[data-drill-child]').forEach((b) => b.addEventListener('click', () => {
        const c = BY_ID.get(b.dataset.drillChild);
        const sl = new Array(c.nCusp).fill(null);
        sl[c.nCusp - 1] = { p: 1, q: 0 };
        loadManifold(c.id, { slopes: sl, s: 1, dir: -1, view: 'cusp' });
        setPlaying(true);
        banner(mix(`Drilling the shortest geodesic of $${nameTex(e.id)}$: the cone angle along it runs from $2\\pi$ to $0$.`), 'pending');
    }));
    $('drill-core')?.addEventListener('click', () => {
        state.dir = -1;
        if (!state.path) computePath({ s: 1 });
        setS(state.path.sMax);
        setPlaying(true);
    });
    document.querySelectorAll('[data-closed]').forEach((b) => b.addEventListener('click', () => {
        const m = CLOSED[+b.dataset.closed];
        loadManifold(m.id, { slopes: [m.slope], s: 1, dir: -1, view: 'cusp' });
        setPlaying(true);
        banner(mix(`${m.name} $= \\mathrm{${m.census.replace(',', ',\\,')}}$: drilling the core of the filling.`), 'pending');
    }));
    document.querySelectorAll('[data-closed-link]').forEach((a) => {
        const m = CLOSED[+a.dataset.closedLink];
        presetLink(m.preset).then((u) => { if (u) a.href = u; });
    });
}

// ---------------- examples and help ----------------

function renderExamples() {
    const cats = [
        ['Knots', (e) => e.kind === 'knot'],
        ['Census manifolds', (e) => e.kind === 'census'],
        ['Links', (e) => e.kind === 'link'],
        ['Drilled geodesics', (e) => e.kind === 'drilled'],
    ];
    $('example-body').innerHTML = cats.map(([title, f]) => {
        const list = CENSUS.filter(f);
        if (!list.length) return '';
        return `<div class="example-cat">${esc(title)}</div><div class="example-grid">${list.map((e) => `
            <button class="example-card" data-id="${e.id}"><span class="example-name">${tex(nameTex(e.id))} — ${mix(e.title.replace(/(\d)_(\d)/g, '$$$1_$2$$'))}</span>
            <span class="example-desc">${mix(`${e.nTet} tetrahedra, ${e.nCusp} cusp${e.nCusp > 1 ? 's' : ''}, volume $${fmt(e.volume, 4)}$`)}</span></button>`).join('')}</div>`;
    }).join('');
    $('example-body').querySelectorAll('.example-card').forEach((b) => b.addEventListener('click', () => {
        $('example-modal').hidden = true;
        loadManifold(b.dataset.id);
    }));
}

function renderHelp() {
    $('help-body').innerHTML = `
        <h4>What this is</h4>
        <p>${mix('A cusped hyperbolic 3-manifold $M$ — a knot complement, say — is glued from ideal tetrahedra. Each has a shape $z \\in \\mathbb C$, and the shapes solve Thurston\'s gluing equations: around every edge the tetrahedra close up, $\\sum \\log z = 2\\pi i$. The complete structure also makes the holonomy of every cusp parabolic.')}</p>
        <h4>Dehn filling</h4>
        <p>${mix('Filling a cusp along the slope $p/q$ glues in a solid torus whose meridian disk bounds the curve $p\\,m + q\\,l$. Thurston\'s hyperbolic Dehn surgery theorem: replace the cusp equation by $p\\,H(m) + q\\,H(l) = i\\theta$. For small $\\theta$ the solution is an incomplete structure whose completion is a cone manifold with cone angle $\\theta$ along the core; at $\\theta = 2\\pi/n$ it is an orbifold, and at $\\theta = 2\\pi$ the filled manifold $M(p/q)$. The volume falls along the way by Schläfli\'s formula $dV/d\\theta = -\\ell/2$, $\\ell$ the length of the core. All but finitely many slopes give hyperbolic manifolds; the others are exceptional.')}</p>
        <h4>Drilling</h4>
        <p>${mix('Run the same path backwards: the cone angle along a closed geodesic shrinks to $0$, the geodesic moves off to infinity and becomes a cusp, and the volume increases to that of the drilled manifold.')}</p>
        <h4>The pictures</h4>
        <p>${mix('<b>Knot</b>: the knot with its meridian $m$, Seifert longitude $l$ and the filling slope on the boundary torus. <b>Polyhedron</b>: the tetrahedra developed into $\\mathbb H^3$ (Klein or Poincaré ball) along a maximal tree, forming a fundamental polyhedron; matching colors are glued, arrows mark the edge classes, and during a filling the core geodesic is drawn. <b>Cusp</b>: the horospherical cross-section, tiled by the holonomy; in a filling the tiles wind around the core, and the filling curve closes into a circle at $\\theta = 2\\pi$.').replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')}</p>
        <h4>Where the numbers come from</h4>
        <p>${mix('The triangulations, peripheral curves and presentations are exported from SnapPy (tools/make_census.py); the 3D knots are SnapPy\'s diagrams relaxed by Möbius energy and checked against SnapPy, chirality included. Everything else is computed here: Newton\'s method on the gluing equations, the Bloch–Wigner volume, the developing map and holonomy. The tests compare volumes, core geodesics, homology and traces with SnapPy.')}</p>
        <p>${mix('The "Open in poincare" links send the holonomy to the Dirichlet domain tool: in decimals for computed groups, or as poincare\'s exact presets where it has one.')}</p>`;
}

// ---------------- URL ----------------

function syncURL() {
    const q = new URLSearchParams(location.search);
    q.set('m', state.entry.id);
    const sl = state.slopes.map((s) => (s ? `${s.p}/${s.q}` : '-')).join(',');
    if (state.slopes.some(Boolean)) q.set('fill', sl); else q.delete('fill');
    q.delete('t');
    try { history.replaceState(null, '', `${location.pathname}?${q.toString()}`); } catch { /* sandboxed */ }
}

// ---------------- wiring ----------------

function wire() {
    wireBanner();
    wireModals();
    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((x) => x.classList.toggle('active', x === b));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${b.dataset.tab}`));
        if (b.dataset.tab === 'unfold' && state.view === 'cusp') setView('poly');
    }));
    $('collapse-btn').addEventListener('click', () => { $('control-panel').classList.toggle('collapsed'); setTimeout(layoutInsets, 480); });
    $('help-btn').addEventListener('click', () => openModal('help-modal'));
    $('theme-btn').addEventListener('click', () => setTheme(!isLight()));
    $('examples-btn').addEventListener('click', () => openModal('example-modal'));
    document.querySelectorAll('.view-chip[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('[data-cusp-mode]').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('[data-cusp-mode]').forEach((x) => x.classList.toggle('active', x === b));
        cusp.setMode(b.dataset.cuspMode);
        if (b.dataset.cuspMode === 'log' && !state.path) banner(mix('Log coordinates need a deformed cusp: fill a slope first (the complete cusp has no core).'), 'info');
    }));
    $('play-btn').addEventListener('click', () => setPlaying(!state.playing));
    $('dir-btn').addEventListener('click', () => { state.dir = -state.dir; renderReadout(); if (!state.playing) setPlaying(true); });
    $('scrub').addEventListener('input', () => { setPlaying(false); setS(snapS(+$('scrub').value / 1000)); });
    $('fill-btn').addEventListener('click', fill);
    $('complete-btn').addEventListener('click', () => { setSlopeFields(state.slopes.map(() => null)); state.slopes = state.slopes.map(() => null); setCompleteFrame(); renderFillResults(); knot.setSlope(null); plot.setCurrent(null); renderDrillTab(); syncURL(); });
    $('unfold-range').addEventListener('input', () => { state.unfoldPlaying = false; setAssembly(+$('unfold-range').value / 1000); if (state.view !== 'poly') setView('poly'); });
    $('unfold-play').addEventListener('click', () => { setView('poly'); if (state.assembly >= 1) setAssembly(0); state.unfoldPlaying = true; });
    document.querySelectorAll('#model-seg .seg-opt').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('#model-seg .seg-opt').forEach((x) => x.classList.toggle('active', x === b));
        poly.setModel(b.dataset.model);
        state.dirty = true;
    }));
    const opt = () => {
        poly.setOptions({ arrows: $('opt-arrows').checked, labels: $('opt-labels').checked, core: $('opt-core').checked, sphere: $('opt-sphere').checked });
        stage.controls.autoRotate = $('opt-spin').checked && state.view !== 'cusp';
        cusp.setOptions({ tiles: $('opt-tiles').checked, curves: $('opt-curves').checked });
        state.dirty = true;
    };
    ['opt-arrows', 'opt-labels', 'opt-core', 'opt-sphere', 'opt-spin', 'opt-tiles', 'opt-curves'].forEach((id) => $(id).addEventListener('change', opt));
    $('cusp-pick').addEventListener('change', () => { cusp.setCusp(+$('cusp-pick').value); state.dirty = true; });
    $('reset-view').addEventListener('click', () => { stage.reset(); fitView(); cusp.resetView(); });
    document.addEventListener('keydown', (e) => {
        if (e.target.closest('input, textarea, .mq-editable-field, [contenteditable="true"]')) return;
        if (e.key === ' ' && state.path) { e.preventDefault(); setPlaying(!state.playing); }
        if (e.key === 'h' || e.key === 'H') $('collapse-btn').click();
        if (e.key === 'ArrowRight' && state.path) { setPlaying(false); setS(state.s + 1 / PATH_N); }
        if (e.key === 'ArrowLeft' && state.path) { setPlaying(false); setS(state.s - 1 / PATH_N); }
    });
    addEventListener('resize', layoutInsets);
    stage.controls.addEventListener('change', () => { state.labelsDirty = true; });
}

// ---------------- the loop ----------------

let lastT = performance.now();
function loop(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (state.playing && state.path) {
        const span = Math.max(state.path.sMax, 0.05);
        let s = state.s + state.dir * dt * span / (PLAY_SECONDS * span);
        if (s >= state.path.sMax) { s = state.path.sMax; setPlaying(false); }
        if (s <= 0) { s = 0; setPlaying(false); }
        setS(s);
    }
    if (state.unfoldPlaying) {
        const a = Math.min(1, state.assembly + dt / (0.9 * state.tri.n + 0.6));
        setAssembly(a);
        if (a >= 1) state.unfoldPlaying = false;
    }
    if (state.dirty && state.frame) {
        state.dirty = false;
        if (state.view === 'poly') poly.update(state.frame.z, state.frame);
        if (state.view === 'cusp') cusp.update(state.frame);
    }
    if (state.view !== 'cusp') {
        stage.render();
        poly.placeLabels();
        knot.placeLabels();
    }
    requestAnimationFrame(loop);
}

// ---------------- start ----------------

renderTexIn();
renderExamples();
renderHelp();
wire();
applyTheme();
setTheme(isLight(), false);
layoutInsets();
{
    const q = new URLSearchParams(location.search);
    const id = q.get('m') || '4_1';
    const e = BY_ID.get(id) || BY_ID.get('4_1');
    let slopes = null;
    if (q.get('fill')) {
        slopes = q.get('fill').split(',').map((x) => (x === '-' ? null : parseSlope(x).value || null));
        while (slopes.length < e.nCusp) slopes.push(null);
        slopes = slopes.slice(0, e.nCusp);
    }
    // ?t= the cone angle as a fraction of 2π (a number or p/q), e.g. t=1/3 for 2π/3
    let s = null;
    const tq = q.get('t');
    if (tq && slopes) {
        const m = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*$/.exec(tq);
        if (m) s = Math.max(0, Math.min(1, m[2] ? +m[1] / +m[2] : +m[1]));
    }
    loadManifold(e.id, { slopes, s });
}
requestAnimationFrame(loop);

// handy from the console
window.dehn = { state, loadManifold, setS, setView, setAssembly, CENSUS, poly, cusp, knot, stage };
