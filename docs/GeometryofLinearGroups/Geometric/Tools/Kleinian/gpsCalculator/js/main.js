// main.js — the page: poincare's glass panel over the picture of the splitting.
//
//   Lattice    the form, the hypersurface, the level; the chamber P, its walls,
//              the covolume (as a zeta value in dimension 3), the export of W⁺
//   Pieces     the hypersurface, the cover Γ(N) in which it embeds, the pieces
//   Glue       the workbench: pieces of covers and right-angled chambers, their
//              gluings, the hybrid's invariants at every place, its export,
//              and a search for chambers that glue to a given one
//   View       the picture: the cover, or the glued chambers

import { coxeterSVG, graphSVG } from './diagram.js';
import { SplitRenderer } from './render.js';
import { glueCheck, assemble } from './glue.js';
import { EXAMPLES } from './examples.js';
import { parseForm, parseVector } from './gps.js';
import { bil, kernelOfRow, lll, signature, adjugateB, primitive } from './linalg.js';
import { isRoot } from './vinberg.js';
import { describeForm, similarQ } from './forms.js';
import { rightAngledWalls, chamberRecord, glueChambers, mixingBase } from './chamber.js';
import { spinSetup, rotationGenerators, poincareState, stateHash, basepointBall, interiorPoint } from './spin.js';
import { MultiQuad } from './multiquad.js';
import { hybridInvariants, multiquadTex, quadDisc, zetaTerm, zetaTex, catalanTex, recognizeRational } from './arith.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------- math formatting ----------------

const tex = (s, display = false) => {
    try { return window.katex.renderToString(String(s), { throwOnError: false, displayMode: display }); } catch { return esc(s); }
};
/** Prose with $…$ math. */
const mix = (s) => String(s).split(/(\$[^$]*\$)/g).map((part) => (part.startsWith('$') && part.endsWith('$') && part.length > 1 ? tex(part.slice(1, -1)) : esc(part))).join('');
const isDiag = (A) => A.every((r, i) => r.every((x, j) => i === j || x === 0));
const matTex = (M) => `\\begin{pmatrix}${M.map((r) => r.join(' & ')).join(' \\\\ ')}\\end{pmatrix}`;
const formTex = (A) => (isDiag(A) ? `\\langle ${A.map((r, i) => r[i]).join(',\\,')} \\rangle` : matTex(A));
const vecTex = (v) => `(${v.join(',\\,')})`;
const fieldTex = (d) => (d === -1 ? '\\mathbb Q(i)' : `\\mathbb Q(\\sqrt{${d}})`);
const texInt = (k) => String(k).replace(/\B(?=(\d{3})+(?!\d))/g, '{,}');
const numFmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d).replace(/\.?0+$/, '') : '\\infty');
const numTex = (x, d = 4) => tex(numFmt(x, d));
const plural = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`;
const PIECE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const areaTex = (A) => { const r = A / Math.PI; const q = recognizeSmall(r); return q ? (q === '1' ? '\\pi' : `${q}\\pi`) : `${numFmt(r, 4)}\\pi`; };
function recognizeSmall(x) {
    for (let q = 1; q <= 48; q++) { const p = Math.round(x * q); if (Math.abs(p / q - x) < 1e-7) return q === 1 ? String(p) : `\\tfrac{${p}}{${q}}`; }
    return null;
}
const formTexOf = (text) => { try { return formTex(parseForm(text)); } catch { return esc(text); } };
const ratTex = (p, q) => (q === 1 ? String(p) : `\\tfrac{${p}}{${q}}`);

/**
 * A volume in exact form when possible, as TeX: in dimension 3, c·√r·ζ_k(2)/π² for the invariant
 * trace field k = ℚ(√d) of the lattice it comes from (and a multiple of Catalan's G over ℚ(i)); in even
 * dimension n, a rational multiple of π^{n/2} (Gauss–Bonnet); otherwise the number. With approx, the
 * decimal value follows.
 */
function volExact(V, n, d, { approx = true, catalan = false, digits = 4 } = {}) {
    if (!Number.isFinite(V)) return null;
    let exact = null;
    if (n === 2) exact = areaTex(V);
    else if (n === 3 && d < 0) {
        const t = zetaTerm(V, d);
        if (t) { exact = zetaTex([t]); const g = catalan && catalanTex(t); if (g) exact += ` = ${g}`; }
    } else if (n % 2 === 0) {
        const r = recognizeRational(V / Math.PI ** (n / 2), { maxDen: 1000000, tol: 1e-12 });
        if (r) exact = `${r.q === 1 ? (Math.abs(r.p) === 1 ? (r.p < 0 ? '-' : '') : r.p) : ratTex(r.p, r.q)}\\pi^{${n / 2}}`;
    }
    if (!exact) return numFmt(V, digits);
    return approx && n !== 2 ? `${exact} \\approx ${numFmt(V, digits)}` : exact;
}
/** The squarefree discriminant of the class of a record or view (dimension 3), cached. */
const fieldCache = new WeakMap();
function fieldOf(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (fieldCache.has(obj)) return fieldCache.get(obj);
    let d = null;
    const info = obj.formInfo && !obj.formInfo.error ? obj.formInfo : (() => { try { return describeForm(obj.AL || obj.A); } catch { return null; } })();
    if (info && info.kind === 'kleinian') d = info.field;
    fieldCache.set(obj, d);
    return d;
}

function invariantsTex(info) {
    if (!info || info.error) return `<span class="dim">${esc(info?.error || 'unavailable')}</span>`;
    if (info.kind === 'kleinian') {
        const A = info.ramAbove.length ? `ramified exactly at the primes of ${tex('k')} above ${tex(info.ramAbove.join(',\\,'))}` : tex('A \\cong M_2(k)');
        return `${tex('k = ' + fieldTex(info.field))}; invariant quaternion algebra ${A}`;
    }
    if (info.kind === 'fuchsian') {
        const [a, b] = info.algebra;
        const ram = info.ram.length ? `ramified at ${tex('\\{' + info.ram.map((p) => (p === Infinity ? '\\infty' : p)).join(',\\,') + '\\}')}` : `split, ${tex('\\cong M_2(\\mathbb Q)')}`;
        return `quaternion algebra ${tex(`\\left(\\frac{${a},\\,${b}}{\\mathbb Q}\\right)`)}, ${ram}`;
    }
    const h = info.hasse && info.hasse.length ? `Hasse invariant ${tex('-1')} at ${tex(info.hasse.join(',\\,'))}` : 'all Hasse invariants trivial';
    return `discriminant ${tex(String(info.disc))} (mod squares), ${h}`;
}

// ---------------- theme ----------------

const PALETTE = {
    dark: ['#3a4f8f', '#1f6b78', '#2e6a4a', '#7a5c2c', '#6e3757', '#4f428a', '#2b5f8f', '#5d5d3c'],
    light: ['#c9d6f5', '#bfe6ea', '#cfead8', '#f3e1bd', '#f1cfdc', '#ddd5f5', '#c8def3', '#e6e6cf'],
};
const isLight = () => document.documentElement.classList.contains('light');
const pieceColor = (i) => (isLight() ? PALETTE.light : PALETTE.dark)[i % 8];
const hexRGB = (h) => { const x = String(h).trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255); };
function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => hexRGB(cs.getPropertyValue(name) || '#000000');
    return {
        palette: (isLight() ? PALETTE.light : PALETTE.dark).map(hexRGB),
        bg: v('--bg'), rim: v('--rim'), edge: v('--edge'), sigma: v('--sigma'), sigma2: v('--sigma2'), lift: v('--lift'),
    };
}
function setTheme(light, save = true) {
    document.documentElement.classList.toggle('light', light);
    const b = $('theme-btn');
    const label = light ? 'Switch to dark mode' : 'Switch to light mode';
    b.title = label; b.setAttribute('aria-label', label);
    if (save) { try { localStorage.setItem('gpsCalc-theme', light ? 'light' : 'dark'); } catch { /* storage blocked */ } }
    if (state.renderer) state.renderer.setTheme(themeColors());
    rerenderAll();
}

// ---------------- state ----------------

const state = {
    worker: null, jobs: new Map(), jobId: 0, view: null, renderer: null,
    bench: { pieces: [], pairs: [] }, selected: null,
    source: 'cover', hybrid: null, hybridCache: new Map(), partnerWorker: null, partners: null, mq: {},
};

const BENCH_KEY = 'gpsCalc.bench.v2';
function loadBench() {
    try {
        const s = JSON.parse(localStorage.getItem(BENCH_KEY) || 'null');
        if (s && Array.isArray(s.pieces)) {
            // JSON turns ∞ into null: Coxeter labels come back as Infinity
            for (const p of s.pieces) if (p.coxM) p.coxM = p.coxM.map((r) => r.map((x) => (x === null ? Infinity : x)));
            state.bench = s;
        }
    } catch { /* storage blocked */ }
}
function saveBench() { try { localStorage.setItem(BENCH_KEY, JSON.stringify(state.bench)); } catch { /* storage blocked */ } }

// ---------------- panel chrome ----------------

function setupPanel() {
    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('collapse-btn').addEventListener('click', togglePanel);
    document.addEventListener('keydown', (e) => {
        if (e.target.closest && e.target.closest('input, textarea, .mq-field')) return;
        if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey) togglePanel();
        if (e.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; });
    });
    $('theme-btn').addEventListener('click', () => setTheme(!isLight()));
    $('help-btn').addEventListener('click', () => { $('help-modal').hidden = false; });
    document.querySelectorAll('.modal [data-close]').forEach((el) => el.addEventListener('click', () => { el.closest('.modal').hidden = true; }));
    $('status-close').addEventListener('click', (e) => { e.stopPropagation(); $('status-banner').classList.add('collapsed'); });
    $('status-banner').addEventListener('click', () => $('status-banner').classList.remove('collapsed'));
    window.addEventListener('resize', updateInset);
    if (window.ResizeObserver) new ResizeObserver(() => updateInset()).observe($('control-panel'));
    updateInset();
}
function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
}
function togglePanel() {
    $('control-panel').classList.toggle('collapsed');
    updateInset();
}
function updateInset() {
    const collapsed = $('control-panel').classList.contains('collapsed');
    const wide = window.innerWidth > 768;
    const inset = !collapsed && wide ? $('control-panel').offsetWidth + 40 : 0;
    const insetB = !collapsed && !wide ? $('control-panel').offsetHeight + 90 : 0;     // the panel docks at the bottom of a phone
    document.documentElement.style.setProperty('--panel-w', collapsed ? '12px' : '');
    if (state.renderer) state.renderer.setInset(inset, insetB);
}

function setStatus(kind, html) {
    const b = $('status-banner');
    b.hidden = false;
    b.classList.remove('collapsed', 'verified', 'warning', 'failed', 'pending');
    if (kind) b.classList.add(kind);
    $('status-text').innerHTML = html;
}

// ---------------- MathQuill inputs ----------------

const MQ_CONFIG = { spaceBehavesLikeTab: false, supSubsRequireOperand: true, charsThatBreakOutOfSupSub: '+-=<>,;', autoSubscriptNumerals: false };

function setupInputs() {
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    for (const id of ['form-in', 'v-in']) {
        const host = $(id);
        const initial = host.dataset.latex || '';
        if (MQ) {
            const mf = MQ.MathField(host, { ...MQ_CONFIG, handlers: { edit: () => preview(), enter: () => compute().catch(() => { }) } });
            mf.latex(initial);
            state.mq[id] = { get: () => mf.latex(), set: (t) => mf.latex(String(t).replace(/-/g, '-')) };
        } else {
            const input = document.createElement('input');
            input.className = 'mq-field'; input.id = id; input.value = initial; input.spellcheck = false;
            input.addEventListener('input', preview);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') compute().catch(() => { }); });
            host.replaceWith(input);
            state.mq[id] = { get: () => input.value, set: (t) => { input.value = t; } };
        }
    }
}
/** MathQuill LaTeX → the plain text gps.js parses ("−1, 1, 1, 1" or Gram rows "a b; c d"). */
function plainOf(latex) {
    return String(latex)
        .replace(/\\left|\\right/g, '')
        .replace(/\\langle|\\rangle/g, ' ')
        .replace(/\\\\/g, ';')
        .replace(/\\(?:[ ,;:!]|quad|qquad|cdot)/g, ' ')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
const formText = () => plainOf(state.mq['form-in'].get());
const vText = () => plainOf(state.mq['v-in'].get());
const latexOf = (plain) => String(plain).replace(/\s*,\s*/g, ', ').trim();

// ---------------- worker ----------------

function getWorker() {
    if (state.worker) return state.worker;
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (ev) => {
        const { id, type } = ev.data;
        const job = state.jobs.get(id);
        if (!job) return;
        if (type === 'progress') { if (job.onProgress) job.onProgress(ev.data.progress); return; }
        state.jobs.delete(id);
        if (type === 'result') job.resolve(ev.data.view);
        else job.reject(new Error(type === 'fail' ? ev.data.reason : ev.data.message));
    };
    w.onerror = (e) => { for (const job of state.jobs.values()) job.reject(new Error(e.message || 'worker error')); state.jobs.clear(); state.worker = null; };
    state.worker = w;
    return w;
}
function runJob(input, onProgress, job = null) {
    const id = ++state.jobId;
    return new Promise((resolve, reject) => {
        state.jobs.set(id, { resolve, reject, onProgress });
        getWorker().postMessage({ id, input, job });
    });
}

function readInput() {
    return {
        formText: formText(), vText: vText(), N: parseInt($('n-in').value, 10),
        cut: document.querySelector('#cut-seg .active')?.dataset.cut || 'one',
        lattice: document.querySelector('#lattice-seg .active')?.dataset.lattice || 'auto',
        vinbergMs: 1000 * (parseFloat($('vin-ms').value) || 15), cap: parseInt($('cap-in').value, 10) || 800000,
    };
}
function setSeg(segId, key, value) {
    document.querySelectorAll(`#${segId} .seg-opt`).forEach((b) => b.classList.toggle('active', b.dataset[key] === value));
}

const STAGES = { lattice: 'setting up the lattice', vinberg: "running Vinberg's algorithm", group: 'enumerating $\\Gamma/\\Gamma(N)$', boundary: 'tracing the hypersurface', homology: 'computing $H_1$ of the pieces' };

async function compute(input = readInput(), { quiet = false } = {}) {
    $('compute-btn').disabled = true;
    setStatus('pending', 'Starting…');
    try {
        const view = await runJob(input, (p) => {
            let msg = STAGES[p.stage] || p.stage;
            if (p.stage === 'group' && p.order) msg += ` — ${p.order.toLocaleString()} elements so far`;
            setStatus('pending', mix(msg[0].toUpperCase() + msg.slice(1) + '…'));
        });
        const c = view.cover;
        setStatus('verified', `${tex(`\\Gamma(${c.N})`)} has index ${tex(texInt(c.order))}; ${plural(c.pieces.length, 'piece')} after cutting. Done in ${tex(numFmt(view.ms / 1000, 2))} s.`);
        if (!quiet) { updateURL(input); state.source = 'cover'; }
        showResults(view);
        return view;
    } catch (e) {
        setStatus('failed', esc(e.message));
        throw e;
    } finally {
        $('compute-btn').disabled = false;
    }
}

function updateURL(input) {
    const p = new URLSearchParams({ f: input.formText, v: input.vText, N: input.N });
    if (input.cut === 'fix') p.set('cut', 'fix');
    if (input.lattice !== 'auto') p.set('lattice', input.lattice);
    if (isLight()) p.set('theme', 'light');
    history.replaceState(null, '', '?' + p.toString());
}

// ---------------- live preview of the input ----------------

function preview() {
    let A = null;
    const fhost = document.getElementById('form-in'), vhost = document.getElementById('v-in');
    try {
        A = parseForm(formText());
        const sig = signature(A);
        const n = A.length - 1;
        const ok = sig.neg === 1 && !sig.zero && n >= 2;
        fhost.classList.toggle('invalid', !ok);
        $('form-hint').innerHTML = ok
            ? `Signature ${tex(`(${n},1)`)}: ${tex('\\Gamma')} acts on ${tex(`\\mathbb H^{${n}}`)}. Diagonal entries, or the rows of the Gram matrix separated by ${tex(';')}.`
            : `<span class="no">Signature ${tex(`(${sig.pos},${sig.neg})`)}${sig.zero ? `, ${sig.zero} null` : ''}: it must be ${tex('(n,1)')} with ${tex('n \\ge 2')}.</span>`;
    } catch (e) {
        fhost.classList.add('invalid');
        $('form-hint').innerHTML = `<span class="no">${esc(e.message)}</span>`;
        $('v-hint').textContent = '';
        return;
    }
    try {
        const v = primitive(parseVector(vText(), A.length));
        const fv = bil(A, v, v);
        if (fv <= 0) { vhost.classList.add('invalid'); $('v-hint').innerHTML = `<span class="no">${tex(`f(v) = ${fv}`)}: ${tex('v')} must be spacelike.</span>`; return; }
        vhost.classList.remove('invalid');
        const row = A.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
        const Lb = lll(kernelOfRow(row));
        const g = Lb.map((a) => Lb.map((b) => bil(A, a, b)));
        const root = isRoot(A, v);
        $('v-hint').innerHTML = `${tex(`f(v) = ${fv}`)}; ${tex('v^\\perp')} carries a form of determinant ${tex(String(detSmall(g)))}; ` +
            (root ? `the reflection ${tex('r_v')} is integral.` : `${tex('r_v')} is not integral, so the split lattice ${tex('L_v \\oplus \\mathbb Z v')} is used.`);
    } catch (e) {
        vhost.classList.add('invalid');
        $('v-hint').innerHTML = `<span class="no">${esc(e.message)}</span>`;
    }
}
function detSmall(M) {
    const n = M.length;
    if (n === 1) return M[0][0];
    let s = 0;
    for (let j = 0; j < n; j++) s += (j % 2 ? -1 : 1) * M[0][j] * detSmall(M.slice(1).map((r) => r.filter((_, t) => t !== j)));
    return s;
}

// ---------------- results ----------------

function showResults(view) {
    state.view = view;
    $('viz-empty').hidden = true;
    renderLatticeTab(view);
    renderPiecesTab(view);
    if (state.source === 'cover' || !state.hybrid) renderPicture();
}

function rerenderAll() {
    if (state.view) { renderLatticeTab(state.view); renderPiecesTab(state.view); }
    renderBench();
    renderPicture();
}

const sigmaTex = (i) => `\\Sigma_{${i}}`;

function splitPhrase(view) {
    const c = view.cover, n = view.lattice.n;
    const S = n === 2 ? 'The geodesic' : 'The hypersurface';
    if (c.comps === 1) {
        const e = c.edges[0];
        if (e.plus === e.minus) return { kind: 'hnn', text: `${S} ${tex('\\Sigma_0')} does not separate ${tex("M'")}, so ${tex("\\pi_1 M' = \\pi_1 A \\ast_{\\pi_1 \\Sigma_0}")} is an HNN extension with one arithmetic piece ${tex('A')}.` };
        return { kind: 'amalgam', text: `${S} ${tex('\\Sigma_0')} separates ${tex("M'")}, so ${tex("\\pi_1 M' = \\pi_1 A \\ast_{\\pi_1 \\Sigma_0} \\pi_1 B")} is an amalgam of two arithmetic pieces.` };
    }
    return { kind: 'graph', text: `The fixed set of the involution induced by ${tex('r_v')} has ${c.comps} components ${tex('\\Sigma_0, \\dots, \\Sigma_{' + (c.comps - 1) + '}')}. Cutting along all of them gives a graph of groups with ${plural(c.nPieces, 'vertex', 'vertices')} and ${plural(c.comps, 'edge')}.` };
}

function pieceSizeTex(n, vol, d = null) {
    if (n === 2) return `area ${tex(areaTex(vol))}, ${tex(`\\chi = ${Math.round(-vol / (2 * Math.PI))}`)}`;
    if (Number.isFinite(vol)) return `volume ${tex(volExact(vol, n, d))}`;
    return '';
}

// ---------- Lattice tab ----------

function renderLatticeTab(view) {
    const L = view.lattice, P = view.poly, n = L.n, c = view.cover;
    const out = [];
    // summary
    const ph = splitPhrase(view);
    const chips = c.pieces.map((p, i) => `<span class="chip"><span class="swatch" style="background:${pieceColor(i)}"></span><b>${tex(PIECE[i])}</b> ${plural(p.tiles, 'tile')}, ${pieceSizeTex(n, p.tiles * P.volume, fieldOf(view))}<button class="btn btn-add small" data-save="${i}">save</button></span>`).join('');
    out.push(`<div class="verdict info"><div class="vh">${tex('\\Sigma_0')} embeds in ${tex(`M' = \\mathbb H^{${n}}/\\Gamma(${c.N})`)}, a cover of degree ${tex(texInt(c.order))} of ${tex(`\\Gamma\\backslash\\mathbb H^{${n}}`)}.</div>${ph.text}<div class="chips" style="margin-top:8px">${chips}${c.pieces.length > 1 ? '<button class="btn btn-add small" data-save="all">save all</button>' : ''}</div></div>`);

    // the lattice
    const nIdeal = P.vertices.filter((v) => v.ideal).length;
    const covol = P.volume / view.sym;
    const latticeDesc = L.mode === 'given'
        ? `${tex(`\\Gamma = \\mathrm O'(f, \\mathbb Z^{${n + 1}})`)}, ${tex('f = ' + formTex(L.A))}`
        : `${tex(`\\Gamma = \\mathrm O'(\\Lambda_v)`)}, ${tex('\\Lambda_v = L_v \\oplus \\mathbb Z v')} of index ${tex(String(L.D))} in ${tex(`\\mathbb Z^{${n + 1}}`)}, Gram matrix ${tex(formTex(L.AL))}`;
    let volText;
    const dv = fieldOf(view);
    if (!Number.isFinite(P.volume)) volText = `<span class="dim">not computed in dimension ${tex(String(n))}</span>`;
    else if (n === 2) volText = `${tex(`\\mathrm{area}(\\Gamma\\backslash\\mathbb H^2) = ${areaTex(covol)}`)}`;
    else {
        volText = tex(`\\mathrm{vol}(\\Gamma\\backslash\\mathbb H^{${n}}) = ${volExact(covol, n, dv, { catalan: true, digits: 8 })}`);
        if (view.sym > 1) volText += `, ${tex(`\\mathrm{vol}\\,P = ${volExact(P.volume, n, dv, { approx: false })}`)}`;
        if (n === 3 && dv === -1 && zetaTerm(covol, -1)) volText += ` <span class="dim">(${tex('G')} is Catalan's constant)</span>`;
    }
    out.push(`<div class="control-group"><div class="card-head"><span class="control-label">The chamber ${tex('P')}</span><span class="badge">${P.vertices.some((v) => v.ideal) ? 'cusped' : 'compact'}</span></div>` +
        coxeterSVG(P, { highlight: view.i0, cls: view.mirrorClass.filter((i) => i !== view.i0), width: 360, tex }) +
        `<dl class="facts">` +
        `<dt>Lattice</dt><dd>${latticeDesc}</dd>` +
        `<dt>Chamber</dt><dd>Vinberg's algorithm closes after ${plural(P.k, 'wall')}: ${tex('P')} has ${plural(P.vertices.length, 'vertex', 'vertices')}${nIdeal ? `, ${tex(String(nIdeal))} ideal` : ''}; ${tex("\\Gamma = W \\rtimes \\mathrm{Sym}\\,P")}, ${tex(`|\\mathrm{Sym}\\,P| = ${view.sym}`)}.</dd>` +
        `<dt>${n === 2 ? 'Coarea' : 'Covolume'}</dt><dd>${volText}</dd>` +
        `<dt>Class</dt><dd>${invariantsTex(view.formInfo)}</dd>` +
        `</dl></div>`);

    // walls
    const ra = new Set(view.rightAngled || []);
    const rows = P.roots.map((e, i) => {
        const tags = [i === view.i0 ? '<span class="badge warn">H</span>' : '', ra.has(i) ? '<span class="badge ok" title="every adjacent wall meets it at a right angle">right-angled</span>' : ''].join(' ');
        return `<tr class="clickable${i === view.i0 ? ' current' : ''}" data-wall="${i}"><td>${tex(String(i + 1))}</td><td>${tex(vecTex(e))}</td><td class="num">${tex(String(P.norms[i]))}</td><td>${tags}</td></tr>`;
    }).join('');
    out.push(`<div class="control-group"><span class="control-label">Walls of ${tex('P')}</span>` +
        `<p class="card-note">Click a wall to cut along it instead. A right-angled wall bounds a chamber that can be glued to another one with no cover at all (Glue tab).</p>` +
        `<div class="scroll-x"><table class="t"><tr><th>wall</th><th>root ${tex('e')}</th><th>${tex('f(e)')}</th><th></th></tr>${rows}</table></div></div>`);

    // chamber gluing
    if (ra.has(view.i0)) {
        const face = P.coxM[view.i0].filter((m, j) => j !== view.i0 && m === 2).length;
        out.push(`<div class="control-group"><span class="control-label">A right-angled chamber</span>` +
            `<p class="card-text">Every wall adjacent to ${tex('H')} meets it at a right angle, so ${tex('F = H \\cap P')} (${faceName(n, face)}) is a fundamental ${n === 2 ? 'segment' : 'polytope'} for the reflections of its neighbors. Two such chambers with congruent faces glue into a Coxeter polytope ${tex('P_1 \\cup_F P_2')}: a Gromov–Piatetski-Shapiro hybrid of orbifolds, of volume ${tex('\\mathrm{vol}\\,P_1 + \\mathrm{vol}\\,P_2')}.</p>` +
            `<div class="btn-row"><button class="btn btn-add grow" id="save-chamber">Save chamber</button><button class="btn btn-add-alt grow" id="find-partners">Find partners</button></div></div>`);
    }

    // export
    if (n === 2 || n === 3) {
        out.push(`<div class="control-group"><span class="control-label">Open the lattice</span>` +
            `<p class="card-note">The rotation subgroup ${tex('W^+')} of the reflection group ${tex('W')} (finite index in ${tex('\\Gamma')}), as ${tex(n === 3 ? '\\mathrm{PGL}_2(\\mathbb C)' : '\\mathrm{PGL}_2(\\mathbb R)')} matrices through the spin isomorphism, exactly.</p>` +
            `<div class="btn-row"><a class="btn btn-add-alt grow" id="open-poincare-lattice" target="_blank" rel="noopener">poincare ↗</a><a class="btn btn-add-alt grow" id="open-pc-lattice" target="_blank" rel="noopener">Presentation Calculator ↗</a></div></div>`);
    }

    const el = $('lattice-results');
    el.innerHTML = out.join('');
    el.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
        const which = b.dataset.save;
        const recs = which === 'all' ? view.records : [view.records[+which]];
        for (const r of recs) addToBench(r);
        b.textContent = 'saved ✓';
    }));
    el.querySelectorAll('tr[data-wall]').forEach((tr) => tr.addEventListener('click', () => useWall(view, +tr.dataset.wall)));
    const sc = $('save-chamber');
    if (sc) sc.addEventListener('click', () => { addToBench(chamberRecord(view, view.i0, chamberLabel(view.input))); sc.textContent = 'saved ✓'; });
    const fp = $('find-partners');
    if (fp) fp.addEventListener('click', () => startPartnerSearch(chamberRecord(view, view.i0, chamberLabel(view.input))));
    if (n === 2 || n === 3) wireLatticeExport(view);
}

const faceName = (n, k) => (n === 2 ? 'a segment' : n === 3 ? ({ 3: 'a triangle', 4: 'a quadrilateral', 5: 'a pentagon', 6: 'a hexagon' }[k] || `a ${k}-gon`) : `a polytope with ${k} walls`);
const chamberLabel = (input) => `P(${input.formText.replace(/\s+/g, '')})`;

function useWall(view, i) {
    const L = view.lattice;
    const e = view.poly.roots[i];
    // lattice coordinates → the coordinates of the given form
    const orig = primitive(L.M.map((r) => r.reduce((s, x, j) => s + x * e[j], 0)));
    state.mq['v-in'].set(latexOf(orig.join(', ')));
    preview();
    compute().catch(() => { });
}

function wireLatticeExport(view) {
    const a1 = $('open-poincare-lattice'), a2 = $('open-pc-lattice');
    if (!a1) return;
    const make = () => {
        if (view._export) return view._export;
        const S = spinSetup(view.lattice.AL);
        const gens = rotationGenerators(S, view.poly.roots);
        // basepoint inside P: its stabilizer is trivial
        const bp = basepointBall(S, interiorPoint(view.lattice.AL, view.poly.vertices));
        view._export = poincareState(S.K, gens.map((g) => g.mat), { faces: 128, bp });
        return view._export;
    };
    lazyHref(a1, () => POINCARE_URL + stateHash(make()));
    lazyHref(a2, () => PRESENTATION_URL + stateHash(make()));
}

/** Fill in a link's href only when it is about to be used (the export takes a moment). */
function lazyHref(a, make) {
    const fill = () => { if (a.getAttribute('href')) return; try { a.href = make(); } catch (e) { setStatus('failed', esc(e.message)); } };
    for (const ev of ['pointerdown', 'focus', 'mouseenter']) a.addEventListener(ev, fill);
}
const POINCARE_URL = new URL('../poincare/index.html', location.href).href;
const PRESENTATION_URL = new URL('../../../../PresentationCalc/index.html', location.href).href;

// ---------- Pieces tab ----------

function exponentOf(M) {
    const MB = M.map((r) => r.map(BigInt));
    const { adj, det } = adjugateB(MB);
    const ab = (x) => (x < 0n ? -x : x);
    const gcd = (a, b) => { a = ab(a); b = ab(b); while (b) [a, b] = [b, a % b]; return a; };
    let e = 1n;
    for (const r of adj) for (const x of r) { const t = ab(det) / gcd(det, x); e = (e / gcd(e, t)) * t; }
    return Number(e);
}

function surfaceTex(sf, n) {
    if (!sf) return '';
    if (n === 2) return sf.closed ? `closed geodesic of length ${numTex(sf.length, 6)}` : 'bi-infinite geodesic, cusp to cusp';
    if (n === 3) {
        const g = sf.genus !== null && sf.genus !== undefined ? `genus ${tex(String(sf.genus))}` : '';
        const p = sf.punctures ? `, ${plural(sf.punctures, 'puncture')}` : ', closed';
        return `${g}${p}, area ${tex(areaTex(sf.area))}`;
    }
    return `${plural(sf.faces, 'face')} of ${tex('P')}`;
}

function homologyTex(h) {
    if (!h) return '<span class="dim">—</span>';
    let t = h.b1 ? `\\mathbb Z^{${h.b1}}` : '0';
    for (const [p] of h.torsion || []) t += ` \\oplus T_{${p}}`;
    return tex(t);
}

function renderPiecesTab(view) {
    const c = view.cover, L = view.lattice, n = L.n, P = view.poly;
    $('pieces-sub').innerHTML = `The pieces of ${tex(`M' = \\mathbb H^{${n}}/\\Gamma(${c.N})`)} cut along the embedded ${n === 2 ? 'geodesic' : 'hypersurface'} ${tex('\\Sigma_0')}. Save a piece to glue it on the workbench.`;
    const out = [];
    // hypersurface
    const g = L.gH, hInfo = view.hypInfo;
    const what = n === 2 ? 'geodesic' : n === 3 ? 'totally geodesic surface' : 'totally geodesic hypersurface';
    let stab;
    if (n === 2) {
        const closed = hInfo && !hInfo.error && !hInfo.cusped;
        stab = closed ? `${tex('g')} is anisotropic over ${tex('\\mathbb Q')}: the image of ${tex('H')} is a closed geodesic` : `${tex('g')} is isotropic over ${tex('\\mathbb Q')}: ${tex('H')} runs from cusp to cusp`;
    } else {
        stab = `${tex('\\mathrm{Stab}_\\Gamma(H)')} is an arithmetic lattice in ${tex(`\\mathrm{Isom}\\,\\mathbb H^{${n - 1}}`)}: ${invariantsTex(hInfo)}${hInfo && !hInfo.error ? (hInfo.cusped ? '; non-cocompact' : '; cocompact') : ''}`;
    }
    out.push(`<div class="control-group"><span class="control-label">The hypersurface</span><dl class="facts">` +
        `<dt>${tex('H')}</dt><dd>${tex('v^\\perp')}, ${tex('v = ' + vecTex(L.v))}, ${tex(`f(v) = ${L.fv}`)}: a ${what}</dd>` +
        `<dt>Form</dt><dd>${tex('g = f|_{L_v} = ' + matTex(g))}</dd>` +
        `<dt>Stabilizer</dt><dd>${stab}</dd>` +
        `<dt>Reflection</dt><dd>${L.rootGiven ? `${tex('r_v')} is integral: ${tex('v')} is a root, ${tex('r_v \\in \\Gamma')}` : `${tex('r_v')} is integral only on ${tex('\\Lambda_v')}`}</dd>` +
        `<dt>Orbifold</dt><dd>${tex('H')} is the mirror of wall ${tex(String(view.i0 + 1))}; the immersed ${n === 2 ? 'geodesic' : 'hypersurface'} is made of the face${view.mirrorClass.length > 1 ? 's' : ''} ${tex(view.mirrorClass.map((i) => i + 1).join(',\\,'))} of ${tex('P')}.</dd>` +
        `</dl></div>`);
    // cover
    const vol = c.tiles * P.volume, cert = c.certificates;
    let coversText = '';
    if (L.mode === 'split') {
        const e = exponentOf(L.M);
        coversText = `<dt>Given lattice</dt><dd>${c.N % e === 0 ? `${tex(`${e} \\mid N`)}, so ${tex("M'")} also covers ${tex(`\\mathrm O'(f,\\mathbb Z^{${n + 1}})\\backslash\\mathbb H^{${n}}`)}` : `a level divisible by ${tex(String(e))} gives a cover of ${tex(`\\mathrm O'(f,\\mathbb Z^{${n + 1}})\\backslash\\mathbb H^{${n}}`)} itself`}</dd>`;
    }
    out.push(`<div class="control-group"><span class="control-label">The cover</span><dl class="facts">` +
        `<dt>Subgroup</dt><dd>${tex(`K = \\Gamma(${c.N}) = \\ker(\\Gamma \\to \\mathrm{GL}(\\Lambda/${c.N}\\Lambda))`)}, of index ${tex(texInt(c.order))}</dd>` +
        `<dt>${tex("M'")}</dt><dd>${tex(texInt(c.tiles))} copies of ${tex('P')}; ${n === 2 ? `area ${tex(areaTex(vol))}` : Number.isFinite(vol) ? `volume ${tex(volExact(vol, n, fieldOf(view)))}` : ''}; ${c.cusps ? plural(c.cusps.count, 'cusp') : 'closed'}</dd>` +
        coversText + `</dl>` +
        `<ul class="cert">` +
        `<li class="${cert.torsionFree && cert.verticesInject ? '' : 'fail'}">${tex('K')} is torsion-free (Minkowski, ${tex('N \\ge 3')}); every finite vertex group and symmetry of ${tex('P')} survives mod ${tex(String(c.N))}.</li>` +
        `<li class="${cert.embedded ? '' : 'fail'}">${tex('H')} embeds (Millson): around every ridge of ${tex("M'")} at most one sheet passes.</li>` +
        `<li class="${cert.twoSided ? '' : 'fail'}">${tex('\\Sigma_0')} is two-sided: tracing it never reaches its own other side.</li>` +
        `</ul></div>`);
    // splitting
    const gv = c.pieces.map((p, i) => ({ label: PIECE[i], color: pieceColor(i), sub: `${p.tiles}` }));
    const ge = c.edges.map((e, i) => ({ plus: e.plus, minus: e.minus, label: sigmaTex(i) }));
    const rows = c.pieces.map((p, i) => {
        const bd = p.boundary.map((b) => `${sigmaTex(b.comp)}^{${b.side === '+' ? '+' : '-'}}`).join(',\\,');
        return `<tr><td><span class="swatch" style="background:${pieceColor(i)}"></span> ${tex(PIECE[i])}</td><td class="num">${tex(texInt(p.tiles))}</td><td>${tex(volExact(p.tiles * P.volume, n, fieldOf(view), { approx: false }))}</td><td>${tex(bd)}</td><td>${homologyTex(p.homology)}</td></tr>`;
    }).join('');
    const surf = c.edges.map((e, i) => `<tr><td>${tex(sigmaTex(i))}</td><td>${surfaceTex(c.surfaces[i], n)}</td><td>${tex(`${PIECE[e.plus]} \\mid ${PIECE[e.minus]}`)}</td></tr>`).join('');
    const b0 = view.boundary.find((b) => b.wall === c.edges[0].wall);
    const gensHtml = b0 ? b0.gens.slice(0, 24).map((M) => tex(matTex(M))).join('') : '';
    out.push(`<div class="control-group"><span class="control-label">The splitting</span>` +
        graphSVG(gv, ge, { width: 340, height: c.pieces.length > 2 ? 210 : 150, tex }) +
        `<p class="card-text">${splitPhrase(view).text}</p>` +
        `<div class="scroll-x"><table class="t"><tr><th>piece</th><th>tiles</th><th>${n === 2 ? 'area' : 'volume'}</th><th>boundary</th><th>${tex('H_1')}</th></tr>${rows}</table></div>` +
        `<div class="scroll-x"><table class="t"><tr><th></th><th>${n === 2 ? 'geodesic' : 'surface'}</th><th>sides</th></tr>${surf}</table></div>` +
        (b0 ? `<details class="fold"><summary>generators of ${tex('\\pi_1\\Sigma_0')} on ${tex('L_v')} (${b0.gens.length})</summary><div class="fold-body"><div class="gens">${gensHtml || '<span class="dim">trivial</span>'}</div></div></details>` : '') +
        `<p class="card-note">${tex('H_1')}: the rank over ${tex('\\mathbb Q')} and the extra rank over ${tex('\\mathbb F_2, \\mathbb F_3')}, from the dual cell complex of the tiling.</p></div>`);
    $('pieces-results').innerHTML = out.join('');
}

// ---------------- the picture ----------------

function ensureRenderer() {
    if (state.renderer) return state.renderer;
    const R = new SplitRenderer($('canvas'));
    state.renderer = R;
    if (R.failed) setStatus('failed', esc(R.failed));
    R.setTheme(themeColors());
    updateInset();
    return R;
}

function hybridRenderData(G) {
    if (G._renderData) return G._renderData;
    const k = G.render.k;
    G._renderData = { n: G.render.n, k, walls: G.render.walls, R: new Int32Array(k), pieceOf: new Int32Array(1), mark: new Uint8Array(k), order: 1, hybrid: G.render.hybrid };
    return G._renderData;
}

function renderPicture() {
    const haveCover = !!state.view, haveHybrid = !!(state.hybrid && state.hybrid.glued);
    if (state.source === 'hybrid' && !haveHybrid) state.source = 'cover';
    if (state.source === 'cover' && !haveCover && haveHybrid) state.source = 'hybrid';
    $('source-row').hidden = !(haveCover && haveHybrid);
    setSeg('source-seg', 'source', state.source);
    const data = state.source === 'hybrid' && haveHybrid ? hybridRenderData(state.hybrid.glued) : haveCover ? state.view.render : null;
    if (!data) { $('legend-bar').hidden = true; $('legend-group').hidden = true; return; }
    $('viz-empty').hidden = true;
    const n = data.n;
    if (n > 3) {
        $('view-caption').innerHTML = `There is no picture in dimension ${tex(String(n))}.`;
        $('legend-bar').hidden = true; $('legend-group').hidden = true;
        $('mode-row').hidden = true; $('rho-row').hidden = true;
        return;
    }
    const R = ensureRenderer();
    if (R.failed) return;
    if (R.data !== data) R.setData(data);
    $('mode-row').hidden = n !== 3;
    setSeg('mode-seg', 'mode', R.mode);
    $('rho-row').hidden = !(n === 3 && R.mode === 'sphere');
    $('rho-in').value = R.rho; $('rho-val').textContent = R.rho.toFixed(2);
    // legend
    let items;
    if (data.hybrid) {
        const h = state.hybrid;
        items = [
            `<span class="swatch" style="background:${pieceColor(0)}"></span>${tex('P_1')} ${tex(formTexOf(h.c1.formText))}`,
            `<span class="swatch" style="background:${pieceColor(1)}"></span>${tex('P_2')} ${tex(formTexOf(h.c2.formText))}`,
            `<span class="ln"></span>the gluing ${n === 2 ? 'geodesics' : 'planes'}`,
        ];
    } else {
        const c = state.view.cover;
        items = c.pieces.map((p, i) => `<span class="swatch" style="background:${pieceColor(i)}"></span>${tex(PIECE[i])}`);
        items.push(`<span class="ln"></span>lifts of ${tex('\\Sigma_0')}`);
        if (c.comps > 1) items.push(`<span class="ln mid"></span>other ${tex('\\Sigma_i')}`);
        items.push(`<span class="ln thin"></span>other lifts of ${tex('H')}`);
    }
    $('legend-bar').innerHTML = items.map((x) => `<span class="legend-chip">${x}</span>`).join('');
    $('legend-bar').hidden = false;
    $('legend').innerHTML = items.map((x) => `<span class="legend-chip">${x}</span>`).join('');
    $('legend-group').hidden = false;
    caption(data);
}

function caption(data) {
    const n = data.n, mode = state.renderer?.mode;
    let t;
    if (data.hybrid) {
        t = n === 2
            ? `The Poincaré disk tiled by copies of ${tex('P = P_1 \\cup_F P_2')}, each colored by its two halves. The heavy lines are the lifts of the gluing geodesic: they never meet. Drag to move.`
            : mode === 'sphere'
                ? `The sphere of radius ${tex('\\rho')} about a point of the face ${tex('F')}, tiled by copies of ${tex('P = P_1 \\cup_F P_2')}; each copy is colored by its halves, and the heavy curves are the lifts of the gluing plane, disjoint totally geodesic planes. Drag to rotate, scroll to zoom.`
                : `A cross-section of ${tex('\\mathbb H^3')} through ${tex('P = P_1 \\cup_F P_2')}, colored by halves; heavy lines are the lifts of the gluing plane. Drag to move, shift-drag to tilt.`;
    } else if (n === 2) t = `The Poincaré disk tiled by copies of ${tex('P')}, each colored by the piece of ${tex("M'")} it covers. Heavy lines are the lifts of ${tex('\\Sigma_0')}, thin ones the other lifts of ${tex('H')}. Drag to move; double-click to reset.`;
    else if (mode === 'sphere') t = `The sphere of radius ${tex('\\rho')} about a point of ${tex('P')}, colored by the piece of ${tex("M'")} each point covers and shaded by its distance in the Bass–Serre tree; the heavy curves are the lifts of ${tex('\\Sigma_0')}. As ${tex('\\rho \\to \\infty')} they become circles at infinity. Drag to rotate, scroll to zoom.`;
    else t = `A totally geodesic cross-section of ${tex('\\mathbb H^3')} through ${tex('P')}, colored by piece; heavy lines are the lifts of ${tex('\\Sigma_0')}, thin ones the other lifts of ${tex('H')}. Drag to move, shift-drag to tilt.`;
    $('view-caption').innerHTML = t;
}

function setupView() {
    document.querySelectorAll('#mode-seg .seg-opt').forEach((b) => b.addEventListener('click', () => {
        if (!state.renderer) return;
        state.renderer.setMode(b.dataset.mode);
        renderPicture();
    }));
    document.querySelectorAll('#source-seg .seg-opt').forEach((b) => b.addEventListener('click', () => { state.source = b.dataset.source; renderPicture(); }));
    $('rho-in').addEventListener('input', () => { if (!state.renderer) return; state.renderer.rho = parseFloat($('rho-in').value); $('rho-val').textContent = state.renderer.rho.toFixed(2); state.renderer.draw(); });
    $('reset-view').addEventListener('click', () => state.renderer && state.renderer.reset());
}

// ---------------- workbench ----------------

function addToBench(rec) {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.bench.pieces.push({ ...rec, id });
    saveBench();
    renderBench();
    return id;
}

const isChamber = (pc) => pc.kind === 'gps-chamber';

function pieceTitle(pc) {
    if (isChamber(pc)) return `${tex(`P(${formTexOf(pc.formText)})`)} <span class="dim">chamber</span>`;
    const f = formTexOf(pc.formText);
    return `${tex(`${f},\\ v = ${vecTex(String(pc.vText).split(/[\s,]+/).filter(Boolean))},\\ N = ${pc.N}`)}${pc.nPieces > 1 ? ` <span class="dim">piece ${tex(PIECE[pc.pieceIndex])} of ${pc.nPieces}</span>` : ''}`;
}

function boundaryLabel(pc, b) {
    if (isChamber(pc)) return `${tex('F')} · ${faceName(pc.n, pc.face.length).replace(/^an? /, '')}`;
    const bd = pc.boundary[b];
    const sf = pc.surfaces[bd.wall]?.surface;
    const nm = tex(`${sigmaTex(bd.comp)}^{${bd.side === '+' ? '+' : '-'}}`);
    if (!sf) return nm;
    if (pc.n === 2) return `${nm} · ${sf.closed ? tex(`\\ell = ${numFmt(sf.length, 4)}`) : 'line'}`;
    if (pc.n === 3) return `${nm} · ${tex(`g = ${sf.genus}`)}${sf.punctures ? `, ${sf.punctures} punct.` : ''}`;
    return nm;
}
const nBoundary = (pc) => (isChamber(pc) ? 1 : pc.boundary.length);

function pairOf(id, b) {
    return state.bench.pairs.findIndex((p) => (p.a.id === id && p.a.b === b) || (p.b.id === id && p.b.b === b));
}

function renderBench() {
    const { pieces, pairs } = state.bench;
    $('glue-count').textContent = pieces.length ? String(pieces.length) : '';
    const list = $('bench-list');
    if (!pieces.length) { list.innerHTML = ''; $('assembly').innerHTML = ''; state.hybrid = null; renderPartners(); return; }
    const idx = new Map(pieces.map((p, i) => [p.id, i]));
    list.innerHTML = pieces.map((pc, i) => {
        const meta = isChamber(pc)
            ? [`${tex(`n = ${pc.n}`)}`, plural(pc.roots.length, 'wall'), pc.n === 2 ? `area ${tex(areaTex(pc.volume))}` : `volume ${tex(volExact(pc.volume, pc.n, fieldOf(pc)))}`, pc.compact ? 'compact' : 'cusped', pc.formInfo && pc.formInfo.kind === 'kleinian' ? tex(fieldTex(pc.formInfo.field)) : null]
            : [`${tex(`n = ${pc.n}`)}`, plural(pc.tiles, 'tile'), pc.b1 != null ? tex(`b_1 = ${pc.b1}`) : null,
                pc.n === 2 ? `area ${tex(areaTex(pc.volume))}` : Number.isFinite(pc.volume) ? `volume ${tex(volExact(pc.volume, pc.n, fieldOf(pc)))}` : null,
                pc.cuspSections ? plural(pc.cuspSections - pc.cutSections, 'cusp') : (pc.n >= 3 ? 'no cusps' : null)];
        const chips = Array.from({ length: nBoundary(pc) }, (_, b) => {
            const k = pairOf(pc.id, b);
            const sel = state.selected && state.selected.id === pc.id && state.selected.b === b;
            let partner = '';
            if (k >= 0) {
                const pr = pairs[k];
                const other = pr.a.id === pc.id && pr.a.b === b ? pr.b : pr.a;
                partner = ` ↔ ${tex(PIECE[idx.get(other.id)] ?? '?')}`;
            }
            return `<button class="bchip${sel ? ' sel' : ''}${k >= 0 ? ' glued' : ''}" data-id="${pc.id}" data-b="${b}" title="${k >= 0 ? 'click to unglue' : 'click, then click a boundary of another piece'}">${boundaryLabel(pc, b)}${partner}</button>`;
        }).join('');
        return `<div class="bench-piece"><span class="swatch" style="background:${pieceColor(i)}"></span>` +
            `<div><div class="bp-title"><b>${tex(PIECE[i] ?? '#' + (i + 1))}</b> ${pieceTitle(pc)}</div><div class="bp-meta">${meta.filter(Boolean).join(' · ')}</div><div class="bp-bounds">${chips}</div></div>` +
            `<button class="del" data-del="${pc.id}" title="Remove" aria-label="Remove">×</button></div>`;
    }).join('') + `<div class="bench-actions"><button class="btn btn-ghost small" id="unglue-all">Clear gluings</button><button class="btn btn-ghost small" id="clear-bench">Clear workbench</button></div>`;
    list.querySelectorAll('.bchip').forEach((b) => b.addEventListener('click', () => chipClick(b.dataset.id, +b.dataset.b)));
    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.del;
        state.bench.pieces = state.bench.pieces.filter((p) => p.id !== id);
        state.bench.pairs = state.bench.pairs.filter((p) => p.a.id !== id && p.b.id !== id);
        if (state.selected?.id === id) state.selected = null;
        saveBench(); renderBench();
    }));
    $('unglue-all').addEventListener('click', () => { state.bench.pairs = []; saveBench(); renderBench(); $('glue-msg').innerHTML = ''; });
    $('clear-bench').addEventListener('click', () => { state.bench = { pieces: [], pairs: [] }; state.selected = null; saveBench(); renderBench(); $('glue-msg').innerHTML = ''; renderPicture(); });
    renderAssembly();
    renderPartners();
}

function chipClick(id, b) {
    const k = pairOf(id, b);
    if (k >= 0) { state.bench.pairs.splice(k, 1); saveBench(); renderBench(); renderPicture(); return; }
    if (!state.selected) { state.selected = { id, b }; renderBench(); return; }
    const s = state.selected;
    state.selected = null;
    if (s.id === id && s.b === b) { renderBench(); return; }
    tryGlue(s, { id, b });
    renderBench();
    renderPicture();
}

/** glue.js writes its reasons with a little Unicode math; set it in TeX. */
function reasonHtml(r) {
    const sub = (t) => t.replace(/[₀-₉]/g, (c) => '₀₁₂₃₄₅₆₇₈₉'.indexOf(c));
    const t = String(r)
        .replace(/Φ⁻¹/g, '$\\Phi^{-1}$').replace(/Φ/g, '$\\Phi$')
        .replace(/δ(′?)([₀-₉]+)/g, (m, pr, d) => `$\\delta${pr ? "'" : ''}_{${sub(d)}}$`)
        .replace(/(\d+(?:\.\d+)?)π/g, '$$$1\\pi$$')
        .replace(/≡ I mod (\d+)/g, '$$\\equiv I \\bmod $1$$');
    return mix(t);
}

/** Test and record one gluing; returns the verdict. */
function tryGlue(s, t) {
    const pa = state.bench.pieces.find((p) => p.id === s.id), pb = state.bench.pieces.find((p) => p.id === t.id);
    const idx = new Map(state.bench.pieces.map((p, i) => [p.id, i]));
    const nm = (pc, bb) => `${tex(PIECE[idx.get(pc.id)])} ${boundaryLabel(pc, bb).split(' · ')[0]}`;
    let v;
    if (isChamber(pa) !== isChamber(pb)) v = { status: 'no', reason: 'a chamber glues only to a chamber, and a piece of a cover only to a piece of a cover' };
    else if (isChamber(pa)) {
        try { v = glueChambers(pa, pb); } catch (e) { v = { status: 'open', reason: e.message }; }
    } else {
        try { v = glueCheck(pa.surfaces[pa.boundary[s.b].wall], pb.surfaces[pb.boundary[t.b].wall]); } catch (e) { v = { status: 'open', reason: e.message }; }
    }
    const head = { yes: 'They glue.', no: 'They do not glue.', open: 'Undecided.' }[v.status];
    const phi = v.phi ? ` The gluing map is ${tex('\\Phi = ' + matTex(v.phi))} on the hyperplane lattices.` : '';
    const place = v.n1 ? ` The second chamber goes across ${tex('H')} by ${tex(`\\Psi(v_2) = -\\sqrt{${v.n2}/${v.n1}}\\,v_1`)}.` : '';
    $('glue-msg').innerHTML = `<div class="verdict ${v.status}"><div class="vh">${nm(pa, s.b)} and ${nm(pb, t.b)}: ${head}</div>${reasonHtml(v.reason)}.${phi}${place}</div>`;
    if (v.status === 'yes') {
        state.bench.pairs.push({ a: { id: s.id, b: s.b }, b: { id: t.id, b: t.b }, phi: v.phi || null, chamber: isChamber(pa) });
        saveBench();
    }
    return v;
}

function renderAssembly() {
    const { pieces, pairs } = state.bench;
    const el = $('assembly');
    state.hybrid = null;
    if (!pairs.length) { el.innerHTML = ''; return; }
    const out = [];
    // chamber gluings: one hybrid each
    for (const pr of pairs.filter((p) => p.chamber)) {
        const c1 = pieces.find((p) => p.id === pr.a.id), c2 = pieces.find((p) => p.id === pr.b.id);
        if (!c1 || !c2) continue;
        const key = `${c1.id}|${c2.id}`;
        let h = state.hybridCache.get(key);
        if (!h) { h = buildHybrid(c1, c2); state.hybridCache.set(key, h); }
        if (!state.hybrid && h.glued) state.hybrid = h;
        out.push(hybridCard(h, pieces.indexOf(c1), pieces.indexOf(c2)));
    }
    // gluings of pieces of covers
    const cover = pairs.filter((p) => !p.chamber);
    if (cover.length) out.push(coverAssemblyCard(cover));
    el.innerHTML = out.join('');
    wireHybridButtons();
}

// ---------- hybrids of chambers ----------

function buildHybrid(c1, c2) {
    const h = { c1, c2 };
    let S = null;
    try {
        const g = glueChambers(c1, c2, (rads) => {
            if (c1.n === 2 || c1.n === 3) { S = spinSetup(c1.AL, rads); return S.K; }
            return new MultiQuad(rads);
        });
        h.glue = g;
        h.glued = g.glued || null;
        h.spin = S;
    } catch (e) { h.error = e.message; }
    if (h.glued && c1.n === 3 && c1.formInfo?.kind === 'kleinian' && c2.formInfo?.kind === 'kleinian') {
        let surface = c1.hypInfo;
        if (!surface || surface.error) { try { surface = describeForm(hypGram(c1)); } catch { surface = null; } }
        h.inv = hybridInvariants([{ d: c1.formInfo.field, V: c1.volume }, { d: c2.formInfo.field, V: c2.volume }], surface);
    }
    try { h.similar = similarQ(c1.AL, c2.AL); } catch { h.similar = null; }
    return h;
}
function hypGram(c) {
    const e = c.roots[c.wall];
    const row = c.AL.map((r) => r.reduce((s, x, t) => s + x * e[t], 0));
    const C = lll(kernelOfRow(row));
    return C.map((a) => C.map((b) => bil(c.AL, a, b)));
}

function hybridCard(h, i1, i2) {
    if (h.error || !h.glued) return `<div class="verdict open"><div class="vh">The glued polytope could not be built</div>${esc(h.error || h.glue?.reason || '')}</div>`;
    const G = h.glued, n = h.c1.n;
    const A = (i) => tex(PIECE[i]);
    const kind = G.compact ? 'compact' : 'finite-volume, cusped';
    const nonArith = h.similar === false;
    const bad = G.bad.length;
    const out = [];
    out.push(`<div class="verdict ${bad ? 'open' : nonArith ? 'nonarith' : 'info'}"><div class="vh">${tex('P = P_1 \\cup_F P_2')} (${A(i1)} ${tex('\\cup')} ${A(i2)}) is a ${kind} Coxeter polytope with ${plural(G.walls.length, 'wall')}.</div>` +
        (bad ? `${bad} pairs of walls meet at angles that are not ${tex('\\pi/m')}: this is not a Coxeter polytope.` :
            nonArith ? `The forms are not similar over ${tex('\\mathbb Q')}, so ${tex('W(P)')} is a non-arithmetic lattice in ${tex(`\\mathrm{Isom}\\,\\mathbb H^{${n}}`)}: a Gromov–Piatetski-Shapiro hybrid of the two chambers.`
                : `The forms are similar over ${tex('\\mathbb Q')}: both chambers come from one commensurability class, and ${tex('W(P)')} may be arithmetic.`) + `</div>`);
    const labels = (i) => (G.origin[i].face ? `${G.origin[i].index + 1}` : G.origin[i].piece === 1 ? `${G.origin[i].index + 1}` : `${G.origin[i].index + 1}'`);
    const nodeClass = (i) => (G.origin[i].face ? 'face' : G.origin[i].piece === 2 ? 'p2' : '');
    const d1 = fieldOf(h.c1), d2 = fieldOf(h.c2);
    const t1 = n === 3 ? zetaTerm(h.c1.volume, d1) : null, t2 = n === 3 ? zetaTerm(h.c2.volume, d2) : null;
    const sumTex = n === 3 ? zetaTex([t1, t2]) : null;
    const size = n === 2 ? `${tex(`\\mathrm{area}\\,P = ${areaTex(h.c1.volume)} + ${areaTex(h.c2.volume)} = ${areaTex(G.volume)}`)}`
        : sumTex ? `${tex(`\\mathrm{vol}\\,P = ${sumTex} \\approx ${numFmt(G.volume, 6)}`)}`
            : `${tex(`\\mathrm{vol}\\,P = ${volExact(h.c1.volume, n, d1, { approx: false })} + ${volExact(h.c2.volume, n, d2, { approx: false })} \\approx ${numFmt(G.volume, 6)}`)}`;
    const facts = [`<dt>Size</dt><dd>${size}</dd>`,
        `<dt>Gluing</dt><dd>${tex(`\\Psi(v_2) = -\\sqrt{${G.n2}/${G.n1}}\\,v_1`)}; walls in ${tex(G.K.tex())}</dd>`];
    if (h.inv) {
        const I = h.inv, K = I.field;
        facts.push(`<dt>${tex('k\\Gamma')}</dt><dd>${tex(multiquadTex(K.basis))}, degree ${tex(String(K.degree))}, discriminant ${tex(texInt(String(K.disc)))}: ${plural(K.r2, 'complex place')}</dd>`);
        if (I.algebra) {
            const ram = I.algebra.split ? `${tex('A\\Gamma \\cong M_2(k\\Gamma)')}: the ramification of ${tex('A_g')} at ${tex(I.algebra.ramQ.join(',\\,') || '\\varnothing')} dies in ${tex('k\\Gamma')}` : `ramified at the ${tex(String(I.algebra.primesAbove))} primes above ${I.algebra.ram.length > 1 ? 'each of ' : ''}${tex(I.algebra.ram.join(',\\,'))}`;
            facts.push(`<dt>${tex('A\\Gamma')}</dt><dd>${tex('A_g \\otimes k\\Gamma')}, ${tex('A_g')} the algebra of the face; ${ram}</dd>`);
        }
        if (t1 && t2) facts.push(`<dt>Pieces</dt><dd>${tex(`\\mathrm{vol}\\,P_1 = ${zetaTex([t1])}`)}, ${tex(`\\mathrm{vol}\\,P_2 = ${zetaTex([t2])}`)}</dd>`);
    }
    out.push(`<div class="control-group"><div class="card-head"><span class="control-label">The glued polytope</span><button class="btn btn-add-alt small" data-show-hybrid>show</button></div>` +
        coxeterSVG({ k: G.walls.length, coxM: G.coxM }, { nodeClass, labels, width: 360, tex }) +
        `<p class="card-note">Walls of ${tex('P_1')} in gray, of ${tex('P_2')} in cyan (primed), the walls through the face ${tex('F')} in amber.</p>` +
        `<dl class="facts">${facts.join('')}</dl></div>`);
    if (h.inv && h.inv.places.length) {
        const rows = h.inv.places.map((p, j) => {
            const sg = p.value < 0 ? -1 : 1;                       // |vol|: flip the signs together
            const fold = p.signs.map((x, i) => `${sg * x > 0 ? (i ? '+' : '') : '-'}V_${i + 1}`).join('');
            const ex = t1 && t2 ? zetaTex([{ ...t1, p: sg * p.signs[0] * t1.p }, { ...t2, p: sg * p.signs[1] * t2.p }]) : null;
            return `<dt>${tex(`\\mathbb C_{${j + 1}}`)}</dt><dd>${tex(`${fold} = ${ex ? ex + ' \\approx ' : ''}${numFmt(Math.abs(p.value), 10)}`)}</dd>`;
        }).join('');
        out.push(`<div class="control-group"><span class="control-label">Volume at each complex place of ${tex('k\\Gamma')}</span>` +
            `<dl class="facts">${rows}</dl>` +
            `<p class="card-note">At the place ${tex('\\sigma')} the gluing radical ${tex(`\\sqrt{${G.n1 * G.n2}}`)} changes sign, so ${tex('\\rho^\\sigma')} is ${tex('\\rho')} on ${tex('P_1')} and ${tex('\\rho')} conjugated by the reflection in the gluing plane on ${tex('P_2')}: the fold, which reverses the orientation of ${tex('P_2')}. These are the volumes of ${tex('W(P)')}; ${tex('W^+(P)')} has twice them. The Presentation Calculator recomputes them from a Dirichlet domain (Bloch–Wigner).</p></div>`);
    }
    if (h.spin) {
        out.push(`<div class="control-group"><span class="control-label">Open the hybrid</span>` +
            `<p class="card-note">${tex('W^+(P)')}, generated by the products ${tex('s_b s_j')} of the reflection in a wall ${tex('b')} of ${tex('P_1')} with the others, as exact ${tex(n === 3 ? '\\mathrm{PGL}_2(\\mathbb C)' : '\\mathrm{PGL}_2(\\mathbb R)')} matrices over ${tex(h.spin.K.tex())}.</p>` +
            `<div class="btn-row"><a class="btn btn-add-alt grow" data-open="poincare" target="_blank" rel="noopener">poincare ↗</a><a class="btn btn-add-alt grow" data-open="pc" target="_blank" rel="noopener">Presentation Calculator ↗</a></div>` +
            `<button class="btn btn-ghost small" data-copy-hybrid>Copy the matrices (JSON)</button></div>`);
    }
    return out.join('');
}

function hybridState(h) {
    if (h._state) return h._state;
    const G = h.glued;
    const gens = rotationGenerators(h.spin, G.walls, { base: mixingBase(G) });
    // basepoint at the centre of the face F, inside P = P₁ ∪ P₂: trivial stabilizer
    const bp = basepointBall(h.spin, interiorPoint(h.c1.AL, h.c1.verts, (v) => v.walls.includes(h.c1.wall)));
    h._state = poincareState(h.spin.K, gens.map((g) => g.mat), { faces: 160, depth: 8, bp });
    return h._state;
}

function wireHybridButtons() {
    const h = state.hybrid;
    document.querySelectorAll('[data-show-hybrid]').forEach((b) => b.addEventListener('click', () => { state.source = 'hybrid'; renderPicture(); showTab('view'); }));
    if (!h || !h.spin) return;
    document.querySelectorAll('a[data-open]').forEach((a) => lazyHref(a, () => (a.dataset.open === 'poincare' ? POINCARE_URL : PRESENTATION_URL) + stateHash(hybridState(h))));
    document.querySelectorAll('[data-copy-hybrid]').forEach((b) => b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(JSON.stringify(hybridState(h), null, 1)); b.textContent = 'copied ✓'; } catch (e) { setStatus('failed', esc(e.message)); }
    }));
}

// ---------- hybrids of covers ----------

function coverAssemblyCard(pairs) {
    const { pieces } = state.bench;
    const involved = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
    const use = pieces.filter((p) => involved.has(p.id));
    const pos = new Map(use.map((p, i) => [p.id, i]));
    const asm = assemble(use, pairs.map((p) => ({ a: { piece: pos.get(p.a.id), b: p.a.b }, b: { piece: pos.get(p.b.id), b: p.b.b } })));
    const names = use.map((p) => PIECE[pieces.indexOf(p)]).join(' \\cup ');
    const n = use[0].n;
    let head;
    if (asm.closedUp && asm.connected) {
        const cusped = use.some((p) => p.cuspSections > 0);
        let size = n === 2 ? `area ${tex(areaTex(asm.volume))}` : Number.isFinite(asm.volume) ? `volume ${numTex(asm.volume)}` : '';
        if (n !== 2 && Number.isFinite(asm.volume)) {
            const terms = use.map((p) => (n === 3 ? zetaTerm(p.volume, fieldOf(p)) : null));
            const zt = n === 3 ? zetaTex(terms) : null;
            size = `volume ${tex(zt ? `${zt} \\approx ${numFmt(asm.volume, 4)}` : volExact(asm.volume, n, null))}`;
        }
        head = `${tex('M = ' + names)} is a ${cusped ? 'finite-volume, cusped' : 'closed'} hyperbolic ${n === 2 ? 'surface' : `${n}-manifold`}${size ? ` of ${size}` : ''}.`;
    } else {
        head = `${plural(pairs.length, 'gluing')} so far; ${plural(asm.open.length, 'boundary component')} still free${asm.connected ? '' : ', and the glued pieces are not yet connected'}.`;
    }
    const out = [`<div class="verdict ${asm.closedUp && asm.connected && asm.verdict.status === 'nonarithmetic' ? 'nonarith' : 'info'}"><div class="vh">${head}</div>${asm.closedUp && asm.connected ? esc(asm.verdict.text) : ''}</div>`];
    const cls = asm.classes.map((c, i) => `<dt>${tex(`[f_{${i + 1}}]`)}</dt><dd>${invariantsTex(c.info)}</dd>`).join('');
    let extra = '';
    if (n === 3 && asm.classes.length >= 2 && asm.classes.every((c) => c.info && c.info.kind === 'kleinian')) {
        const V = asm.classes.map(() => 0);
        use.forEach((p, i) => { V[asm.classOf[i]] += p.volume; });
        const gH = Object.values(use[0].surfaces)[0]?.gH;
        let surface = null;
        try { surface = gH ? describeForm(gH) : null; } catch { surface = null; }
        const I = hybridInvariants(asm.classes.map((c, i) => ({ d: c.info.field, V: V[i] })), surface);
        const K = I.field;
        extra += `<dt>${tex('k\\Gamma')}</dt><dd>${tex(multiquadTex(K.basis))}, ${plural(K.r2, 'complex place')}</dd>`;
        if (I.algebra) extra += `<dt>${tex('A\\Gamma')}</dt><dd>${I.algebra.split ? tex('M_2(k\\Gamma)') : `ramified above ${tex(I.algebra.ram.join(',\\,'))}`}</dd>`;
        if (asm.closedUp && asm.connected) {
            const ts = asm.classes.map((c, i) => zetaTerm(V[i], c.info.field));
            extra += I.places.map((p, j) => {
                const sg = p.value < 0 ? -1 : 1;
                const ex = zetaTex(ts.map((t, i) => (t ? { ...t, p: sg * p.signs[i] * t.p } : null)));
                return `<dt>${tex(`\\mathbb C_{${j + 1}}`)}</dt><dd>${tex(`|\\mathrm{vol}| = ${ex ? ex + ' \\approx ' : ''}${numFmt(Math.abs(p.value), 4)}`)}${j ? ' (the fold)' : ''}</dd>`;
            }).join('');
        }
    }
    out.push(`<div class="control-group"><span class="control-label">Commensurability classes (${asm.classes.length})</span><dl class="facts">${cls}${extra}</dl></div>`);
    return out.join('');
}

// ---------------- gluing partners ----------------

function startPartnerSearch(chamber) {
    if (state.partnerWorker) state.partnerWorker.terminate();
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    state.partnerWorker = w;
    const amax = 40;
    state.partners = { chamber, results: [], amax, done: false };
    w.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'partner') { state.partners.results.push(m.result); renderPartners(); }
        else if (m.type === 'result' || m.type === 'error') { state.partners.done = true; if (m.type === 'error') state.partners.error = m.message; renderPartners(); w.terminate(); if (state.partnerWorker === w) state.partnerWorker = null; }
    };
    w.postMessage({ id: 1, job: 'partners', input: { chamber, amin: 1, amax, perFormMs: 2500 } });
    renderPartners();
    showTab('glue');
}

function renderPartners() {
    const el = $('partners');
    const P = state.partners;
    if (!P) { el.innerHTML = ''; return; }
    const v = P.chamber.roots[P.chamber.wall];
    const nv = P.chamber.norms[P.chamber.wall];
    const found = P.results.filter((r) => r.ok);
    const rows = found.map((r) => {
        const d = r.rec.formInfo && r.rec.formInfo.kind === 'kleinian' ? tex(fieldTex(r.rec.formInfo.field)) : '';
        return `<tr><td>${tex(String(r.a))}</td><td>${d}<br><span class="dim" style="font-size:10.5px">${r.rec.compact ? 'compact' : 'cusped'}</span></td><td class="num">${tex(volExact(r.rec.volume, r.rec.n, fieldOf(r.rec), { approx: false }))}</td>` +
            `<td>${r.similar ? '<span class="badge warn" title="similar forms: the same commensurability class">similar</span>' : `<button class="btn btn-add small" data-partner="${r.a}">glue</button>`}</td></tr>`;
    }).join('');
    const done = P.results.length;
    el.innerHTML = `<div class="control-group"><div class="card-head"><span class="control-label">Gluing partners of ${tex(formTexOf(P.chamber.formText))}</span>${P.done ? '' : '<button class="btn btn-ghost small" id="stop-partners">stop</button>'}</div>` +
        `<p class="card-note">Forms ${tex('g \\oplus \\langle a \\rangle')}, ${tex('g')} the form of ${tex('v^\\perp')} (${tex(`f(v) = ${nv}`)}), for ${tex(`1 \\le a \\le ${P.amax}`)}: Vinberg's algorithm (${tex('2.5')} s each; most forms are not reflective) and a test that ${tex('e^\\perp')} is a right-angled wall with a congruent face.</p>` +
        `<div class="progress-line"><span style="width:${(100 * done / P.amax).toFixed(1)}%"></span></div>` +
        (found.length ? `<div class="scroll-x"><table class="t"><tr><th>${tex('a')}</th><th>chamber</th><th>${P.chamber.n === 2 ? 'area' : 'volume'}</th><th></th></tr>${rows}</table></div>` : `<p class="card-note">${P.done ? 'No partners found.' : 'Searching…'}</p>`) +
        (P.error ? `<p class="card-note">${esc(P.error)}</p>` : '') + `</div>`;
    const stop = $('stop-partners');
    if (stop) stop.addEventListener('click', () => { if (state.partnerWorker) state.partnerWorker.terminate(); state.partnerWorker = null; P.done = true; renderPartners(); });
    el.querySelectorAll('[data-partner]').forEach((b) => b.addEventListener('click', () => {
        const r = P.results.find((x) => String(x.a) === b.dataset.partner);
        if (!r) return;
        // make sure the searched chamber is on the bench, then add the partner and glue
        let base = state.bench.pieces.find((p) => isChamber(p) && p.formText === P.chamber.formText && p.wall === P.chamber.wall);
        const baseId = base ? base.id : addToBench({ ...P.chamber, label: `P(${P.chamber.formText})` });
        const pid = addToBench({ ...r.rec, label: `P(${r.rec.formText})` });
        tryGlue({ id: baseId, b: 0 }, { id: pid, b: 0 });
        renderBench();
        state.source = 'hybrid';
        renderPicture();
    }));
}

// ---------------- examples ----------------

function buildExamples() {
    let html = '', cat = null, open = false;
    EXAMPLES.forEach((ex, i) => {
        if (ex.cat !== cat) {
            if (open) html += '</div>';
            cat = ex.cat; html += `<div class="example-cat">${mix(cat)}</div><div class="example-grid">`; open = true;
        }
        html += `<button class="example-card" data-ex="${i}"><span class="example-name">${mix(ex.name)}</span>${ex.desc ? `<span class="example-desc">${mix(ex.desc)}</span>` : ''}</button>`;
    });
    if (open) html += '</div>';
    $('example-body').innerHTML = html;
    $('examples-btn').addEventListener('click', () => { $('example-modal').hidden = false; });
    $('example-body').querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
        $('example-modal').hidden = true;
        loadExample(EXAMPLES[+b.dataset.ex]);
    }));
}

function setInputs(ex) {
    state.mq['form-in'].set(latexOf(ex.f));
    state.mq['v-in'].set(latexOf(ex.v));
    $('n-in').value = ex.N;
    setSeg('cut-seg', 'cut', ex.cut || 'one');
    setSeg('lattice-seg', 'lattice', ex.lattice || 'auto');
    preview();
}

async function loadExample(ex) {
    if (ex.chambers) return loadChamberExample(ex);
    if (!ex.hybrid) { setInputs(ex); showTab('lattice'); compute().catch(() => { }); return; }
    // a GPS hybrid of covers: compute both, save the pieces, glue them
    const recs = [];
    try {
        for (const part of ex.hybrid) {
            setInputs(part);
            const view = await compute(readInput(), { quiet: true });
            recs.push(view.records);
        }
    } catch { return; }
    const [r1, r2] = recs;
    let A = [r1[0]], B = [r2[0]];
    const b1 = r1[0].boundary.length, b2 = r2[0].boundary.length;
    if (b1 === 1 && b2 === 2 && r1.length >= 2) A = [r1[0], r1[1]];
    if (b1 === 2 && b2 === 1 && r2.length >= 2) B = [r2[0], r2[1]];
    const idsA = A.map(addToBench), idsB = B.map(addToBench);
    const slotsA = A.flatMap((p, i) => p.boundary.map((bd, b) => ({ id: idsA[i], p, b, side: bd.side })));
    const slotsB = B.flatMap((p, i) => p.boundary.map((bd, b) => ({ id: idsB[i], p, b, side: bd.side })));
    const usedB = new Set();
    let glued = 0;
    for (const a of slotsA) {
        const order = slotsB.filter((x) => !usedB.has(x)).sort((x, y) => (x.side === a.side) - (y.side === a.side));
        for (const bb of order) {
            const v = glueCheck(a.p.surfaces[a.p.boundary[a.b].wall], bb.p.surfaces[bb.p.boundary[bb.b].wall]);
            if (v.status === 'yes') { state.bench.pairs.push({ a: { id: a.id, b: a.b }, b: { id: bb.id, b: bb.b }, phi: v.phi || null, chamber: false }); usedB.add(bb); glued++; break; }
        }
    }
    saveBench();
    renderBench();
    state.source = 'cover';
    renderPicture();
    const all = glued === slotsA.length && glued === slotsB.length;
    $('glue-msg').innerHTML = `<div class="verdict ${all ? 'yes' : 'open'}"><div class="vh">${mix(ex.name)}</div>Both lattices computed and ${plural(A.length + B.length, 'piece')} saved; ${plural(glued, 'gluing')} certified by conjugating the boundary groups${all ? ', and no boundary is left free' : ''}.</div>`;
    showTab('glue');
}

async function loadChamberExample(ex) {
    // only the Vinberg chambers are needed: no cover
    const recs = [];
    try {
        for (const part of ex.chambers) {
            setStatus('pending', `Running Vinberg's algorithm for ${tex(formTexOf(part.f))}…`);
            const rec = await runJob({ formText: part.f, vText: part.v, lattice: part.lattice || 'auto', vinbergMs: 20000 }, null, 'chamber');
            rec.label = `P(${part.f})`;
            recs.push(rec);
        }
    } catch (e) { setStatus('failed', esc(e.message)); return; }
    setInputs(ex.chambers[0]);
    const ids = recs.map((r) => {
        const same = state.bench.pieces.find((p) => isChamber(p) && p.formText === r.formText && p.vText === r.vText && pairOf(p.id, 0) < 0);
        return same ? same.id : addToBench(r);
    });
    const v = pairOf(ids[0], 0) >= 0 && pairOf(ids[1], 0) >= 0 ? { status: 'yes' } : tryGlue({ id: ids[0], b: 0 }, { id: ids[1], b: 0 });
    renderBench();
    if (v.status === 'yes') {
        state.source = 'hybrid';
        renderPicture();
        setStatus('verified', `${mix(ex.name)}: the chambers glue into a Coxeter polytope of ${state.hybrid?.glued ? (recs[0].n === 2 ? `area ${tex(areaTex(state.hybrid.glued.volume))}` : `volume ${tex(zetaTex([zetaTerm(recs[0].volume, fieldOf(recs[0])), zetaTerm(recs[1].volume, fieldOf(recs[1]))]) || numFmt(state.hybrid.glued.volume))}`) : ''}.`);
    }
    showTab('glue');
}

// ---------------- help ----------------

function buildHelp() {
    $('help-body').innerHTML = [
        `<h4>Arithmetic pieces</h4><p>${mix('A form $f$ of signature $(n,1)$ over $\\mathbb Z$ gives an arithmetic lattice $\\Gamma = \\mathrm O\'(f,\\mathbb Z)$ in $\\mathrm{Isom}\\,\\mathbb H^n$, and a spacelike vector $v$ an immersed totally geodesic hypersurface $H = v^\\perp$. Vinberg\'s algorithm finds the Coxeter chamber $P$ with $H$ as a wall. In the principal congruence cover $\\mathbb H^n/\\Gamma(N)$, $N \\ge 3$, the image of $H$ is embedded and two-sided (Millson), and cutting along it leaves arithmetic pieces with totally geodesic boundary.')}</p>`,
        `<h4>Gluing pieces</h4><p>${mix('Two boundary components glue when an isometry of the hyperplane lattices conjugates one boundary group onto the other; the workbench certifies it generator by generator. Pieces from lattices whose forms are not similar over $\\mathbb Q$ give a non-arithmetic manifold (Gromov–Piatetski-Shapiro). The covers are large: thousands of copies of $P$.')}</p>`,
        `<h4>Gluing chambers</h4><p>${mix('If every wall adjacent to $H$ meets it at a right angle, the face $F = H \\cap P$ is a fundamental polytope for the reflections of its neighbors, and two such chambers with congruent faces glue into a Coxeter polytope $P_1 \\cup_F P_2$ with no cover at all: the walls through the edges of $F$ continue straight across. Its reflection group is a lattice of volume $\\mathrm{vol}\\,P_1 + \\mathrm{vol}\\,P_2$, non-arithmetic when the forms are not similar. Only right angles allow this: at an angle $\\pi/3$, $\\pi/4$ or $\\pi/6$ the two forms would be similar. "Find partners" searches the forms $g \\oplus \\langle a\\rangle$ for chambers that glue to the current one.')}</p>`,
        `<h4>Invariants at every place</h4><p>${mix('In dimension 3, a hybrid of chambers or pieces with invariant trace fields $\\mathbb Q(\\sqrt{d_1})$ and $\\mathbb Q(\\sqrt{d_2})$ has $k\\Gamma = \\mathbb Q(\\sqrt{d_1},\\sqrt{d_2})$, with two complex places, and $A\\Gamma = A_g \\otimes k\\Gamma$ for the quaternion algebra $A_g$ of the gluing surface. At the second place the Galois conjugate is the fold: $\\rho$ on one side and $\\rho$ conjugated by the reflection in the gluing plane on the other, of volume $\\pm(V_1 - V_2)$. Each $V_i$ is a rational multiple of $|D_i|^{3/2}\\zeta_{k_i}(2)/4\\pi^2$.')}</p>`,
        `<h4>Export</h4><p>${mix('The rotation subgroups $W^+$ of the lattice and of a glued polytope open in poincare and in the Presentation Calculator as exact matrices: the spin isomorphism through the even Clifford algebra of $f$, over a multiquadratic field written as $\\mathbb Q(w)$ with a small minimal polynomial. The Presentation Calculator then finds the invariant trace field, the places where $\\Gamma$ is unbounded, and the volume at each of them.')}</p>`,
        `<h4>Keys</h4><p>${mix('H collapses the panel; Escape closes a dialog. The 2D companion page draws hybrids of surfaces: ')}<a href="hybrid2d/index.html">hybrid picture</a>.</p>`,
    ].join('');
}

// ---------------- boot ----------------

function typeset(root) {
    root.querySelectorAll('[data-tex]').forEach((el) => { el.innerHTML = tex(el.getAttribute('data-tex')); el.removeAttribute('data-tex'); });
}

function boot() {
    typeset(document.body);
    setupPanel();
    setupInputs();
    setupView();
    buildExamples();
    buildHelp();
    setTheme(isLight(), false);
    document.querySelectorAll('#cut-seg .seg-opt').forEach((b) => b.addEventListener('click', () => setSeg('cut-seg', 'cut', b.dataset.cut)));
    document.querySelectorAll('#lattice-seg .seg-opt').forEach((b) => b.addEventListener('click', () => setSeg('lattice-seg', 'lattice', b.dataset.lattice)));
    $('compute-btn').addEventListener('click', () => { showTab('lattice'); compute().catch(() => { }); });
    $('n-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') compute().catch(() => { }); });
    loadBench();
    renderBench();
    const q = new URLSearchParams(location.search);
    if (q.has('f')) {
        state.mq['form-in'].set(latexOf(q.get('f')));
        if (q.has('v')) state.mq['v-in'].set(latexOf(q.get('v')));
        if (q.has('N')) $('n-in').value = q.get('N');
        if (q.has('cut')) setSeg('cut-seg', 'cut', q.get('cut'));
        if (q.has('lattice')) setSeg('lattice-seg', 'lattice', q.get('lattice'));
        preview();
        compute().catch(() => { });
    } else {
        preview();
        if (state.hybrid) renderPicture();
    }
    window.__gps = { state, compute, loadExample, EXAMPLES };
}

boot();
