// Curves & Braids — UI: drawing, punctures, braid animations, panels.
import * as E from './engine.js';
import * as A from './algebra.js';
import { HyperbolicMetric, chooseDisk } from './hyperbolic.js';
import * as Z from './zip.js';

const $ = id => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const overlay = $('overlay');

const sim = E.createSim();
sim.h = 12;
const settler = new E.Settler(sim);

const state = {
    view: { x: 0, y: 0, zoom: 1 },
    W: 0, H: 0, dpr: 1,
    hTarget: 12,
    spacingMode: 'auto',
    spacingSlider: 50,
    running: true,
    settled: false, quiet: 0,
    anim: null, queue: [],
    drag: null, pending: null, stroke: null, pan: null,
    hoverP: -1, hoverGen: 0,
    history: [], future: [],
    braidLog: [], lastWord: [],
    analysis: null,
    showLabels: true, showWord: true, showVerts: false,
    palette: 'ink',
    look: 'geodesic',          // 'geodesic' (hyperbolic punctured disk) or 'track' (rope)
    zipMode: false,            // zip the settled curve to its train track
    zipT: 0, zipDir: 0,        // how far the zip has gone, and which way it is going
    track: null,               // the train track (zip.js) while zipped or zipping
    preset: null,
    message: null,
    dirty: true,
    lastAnalysis: 0,
};

// ------------------------------------------------------------------ KaTeX helpers

const tex = (s, display = false) => {
    if (!window.katex) return s;
    try { return katex.renderToString(s, { throwOnError: false, displayMode: display }); } catch (e) { return s; }
};
// $…$ inside a string of HTML → KaTeX
const texify = html => html.replace(/\$([^$]+)\$/g, (_, m) => tex(m));
const setTex = (el, s) => { el.innerHTML = tex(s); };

// ------------------------------------------------------------------ view

// width of the strip on the right that the open panel covers
function panelSpace() {
    const panel = $('control-panel');
    if (!panel || panel.classList.contains('collapsed') || state.W <= 860) return 0;
    const r = panel.getBoundingClientRect();
    return Math.max(0, state.W - r.left + 20);
}
function freeCenter() { return [(state.W - panelSpace()) / 2, state.H / 2]; }
function w2s(x, y) {
    const [fx, fy] = freeCenter(), v = state.view;
    return [fx + (x - v.x) * v.zoom, fy - (y - v.y) * v.zoom];
}
function s2w(sx, sy) {
    const [fx, fy] = freeCenter(), v = state.view;
    return [v.x + (sx - fx) / v.zoom, v.y - (sy - fy) / v.zoom];
}

function resize() {
    state.dpr = window.devicePixelRatio || 1;
    state.W = window.innerWidth; state.H = window.innerHeight;
    canvas.width = Math.round(state.W * state.dpr);
    canvas.height = Math.round(state.H * state.dpr);
    state.dirty = true;
}

function bbox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let g = 0; g < sim.N; g++) {
        const x = sim.X[g], y = sim.Y[g];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    for (const p of sim.P) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

function fitView(animate = false) {
    const b = bbox();
    if (!b) { state.view = { x: 0, y: 0, zoom: 1 }; state.dirty = true; return; }
    const pad = 70 + (state.showWord ? 30 : 0);
    const fw = Math.max(200, state.W - panelSpace() - 2 * pad), fh = Math.max(200, state.H - 2 * pad - 40);
    const bw = Math.max(b.x1 - b.x0, 40), bh = Math.max(b.y1 - b.y0, 40);
    const zoom = Math.max(0.02, Math.min(4, Math.min(fw / bw, fh / bh)));
    const target = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 - (state.showWord ? 14 / zoom : 0), zoom };
    if (animate) state.viewAnim = { from: { ...state.view }, to: target, t: 0 };
    else state.view = target;
    state.dirty = true;
}

// ------------------------------------------------------------------ status line

function setStatus(html, tone = 'accent') {
    const b = $('status-banner');
    b.classList.remove('accent', 'pending', 'ok', 'warning', 'failed', 'info');
    b.classList.add(tone);
    $('status-headline').innerHTML = html;
}
function flash(html, tone = 'warning', ms = 3500) {
    state.message = { html, tone, until: performance.now() + ms };
    setStatus(html, tone);
}
function updateStatus() {
    if (state.message && performance.now() < state.message.until) return;
    state.message = null;
    if (state.anim) {
        setStatus(`Twisting ${tex(genTex(state.anim.gen))}${state.queue.length ? ` · ${state.queue.length} to go` : ''}`, 'pending');
        return;
    }
    if (!sim.P.length && !sim.N) { setStatus('Click to place punctures', 'accent'); return; }
    if (!sim.N) { setStatus(`${sim.P.length} puncture${sim.P.length === 1 ? '' : 's'} · drag to draw a curve`, 'accent'); return; }
    const name = state.preset ? `${state.preset} · ` : '';
    if (state.drag?.active) { setStatus(`${name}pushing the curve`, 'pending'); return; }
    if (state.track && state.zipT > 0) {
        if (state.zipT < 1) { setStatus(`${name}${state.zipDir > 0 ? 'zipping' : 'unzipping'}…`, 'pending'); return; }
        const nb = state.track.branches.length;
        setStatus(`${name}zipped to a train track · ${nb} branch${nb === 1 ? '' : 'es'}`, 'ok');
        return;
    }
    if (state.zipMode && sim.N && !state.settled && state.running) { setStatus(`${name}tightening, then zipping…`, 'pending'); return; }
    if (!state.settled && state.running) { setStatus(`${name}tightening…`, 'pending'); return; }
    setStatus(`${name}${state.running ? 'tight' : 'paused'}`, state.running ? 'ok' : 'accent');
}

// ------------------------------------------------------------------ analysis, spacing

// The geodesic look: the complete hyperbolic metric on a disk around the
// punctures (cusps at the punctures, the circle infinitely far away). Rebuilt
// when the set of punctures changes or the curve leaves the disk; a half
// twist only exchanges two punctures, so it never needs a rebuild.
let metricKey = '';
function syncMetric(force = false) {
    if (state.look !== 'geodesic' || !sim.P.length) {
        sim.metric = null; metricKey = ''; sim.ellHyp = 0; sim.ellMax = 0;
        return;
    }
    if (state.anim || state.drag?.active) return;
    const key = sim.P.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort().join(';');
    const pts = [];
    for (let g = 0; g < sim.N; g += 3) pts.push({ x: sim.X[g], y: sim.Y[g] });
    const d = sim.metric?.disk;
    const outside = d && pts.some(p => Math.hypot(p.x - d.cx, p.y - d.cy) > 0.97 * d.R);
    if (!force && sim.metric && key === metricKey && !outside) { sim.useMetric = true; return; }
    const disk = chooseDisk(sim.P, pts);
    sim.metric = new HyperbolicMetric(sim.P, disk);
    sim.useMetric = true;
    sim.ellHyp = 0.03;
    sim.ellMax = disk.R / 200;
    metricKey = key;
    wake();
}

// While punctures move (a twist, a drag) the metric moves with them: a coarser
// copy on the same disk, re-solved from its last solution every time a
// puncture has gone a little way. The curve keeps flowing toward the geodesic
// of the metric of the moment, so it is carried from the old geodesic to the
// new one as a geodesic, instead of being pulled out of shape and let go.
const follow = { main: null, m: null };
function followStart() {
    if (state.look !== 'geodesic' || !sim.metric) return false;
    if (sim.metric !== follow.m) {
        if (follow.main !== sim.metric) { follow.main = sim.metric; follow.m = sim.metric.follower(); }
        else follow.m.refresh(sim.P, 6);
        sim.metric = follow.m;
    }
    sim.useMetric = true;
    return true;
}
const following = () => !!follow.m && sim.metric === follow.m;
function followStep() {
    if (!following()) return;
    // a puncture dragged up to the circle: the metric cannot follow it out,
    // and the curve goes on without one until the puncture is let go
    const { cx, cy, R } = follow.m.disk;
    if (sim.P.some(p => Math.hypot(p.x - cx, p.y - cy) > 0.94 * R)) { followEnd(); sim.useMetric = false; return; }
    follow.m.follow(sim.P);
}
function followEnd() {
    if (following()) sim.metric = follow.main;
}

// strand separation for the geodesic look: a hair, small enough that the
// bands fit between neighboring punctures
function geoSpacing(an) {
    const P = sim.P;
    if (P.length < 2) return 3;
    const nn = P.map((p, i) => Math.min(...P.filter((_, j) => j !== i).map(q => Math.hypot(p.x - q.x, p.y - q.y)))).sort((a, b) => a - b);
    let h = 0.012 * nn[nn.length >> 1];
    if (an) for (let i = 0; i + 1 < P.length; i++) {
        const p = P[an.F.order[i]], q = P[an.F.order[i + 1]];
        h = Math.min(h, 0.3 * Math.hypot(p.x - q.x, p.y - q.y) / (an.gapStrands[i] + 1));
    }
    return Math.max(0.6, h);
}

function hAutoNow(an) {
    if (state.look === 'geodesic') return geoSpacing(an);
    const extra = state.settled && sim.N && sim.P.length <= 14 ? E.pairCrossings(sim) : null;
    let h;
    if (!sim.N) {
        h = sim.P.length >= 2 ? E.autoSpacing(sim, { F: E.cutFrame(sim.P), gapStrands: new Array(sim.P.length).fill(0) }) : 14;
    } else h = E.autoSpacing(sim, an, { extra });
    return h;
}

function spacingFactor() { return Math.pow(2, (50 - state.spacingSlider) / 50); }   // 2 … 0.5
function manualSpacing() { return 2 * Math.pow(20, state.spacingSlider / 100); }    // 2 … 40

function refreshAnalysis() {
    syncMetric();
    const an = sim.P.length ? E.analyze(sim) : null;
    state.analysis = an;
    state.lastAnalysis = performance.now();
    const hAuto = an ? hAutoNow(an) : 14;
    state.hAuto = hAuto;
    state.hTarget = state.spacingMode === 'auto' ? hAuto * spacingFactor() : manualSpacing();
    renderCurvePanel();
    renderGenerators();
    renderLabels();
    renderCaption();
    writeHash();
    state.dirty = true;
}

function wake(resetTension = false) {
    settler.wake();
    state.settled = false;
    if (resetTension) sim.tension = 0.15;
    state.dirty = true;
}

// ------------------------------------------------------------------ panels

const KIND_TEXT = {
    essential: ['essential', 'ok'],
    peripheral: ['peripheral', 'warn'],
    outer: ['around everything', 'warn'],
    trivial: ['trivial', 'bad'],
};

function renderCurvePanel() {
    const an = state.analysis;
    const chip = $('curve-chip');
    const loops = an ? an.loops : [];
    if (!sim.N) { chip.className = 'chip'; chip.textContent = 'no curve'; }
    else if (loops.length > 1) {
        const ess = loops.filter(l => l.kind === 'essential').length;
        chip.className = 'chip ' + (ess === loops.length ? 'ok' : 'warn');
        chip.textContent = `multicurve · ${loops.length} components`;
    } else {
        const [t, c] = KIND_TEXT[loops[0].kind];
        chip.className = 'chip ' + c; chip.textContent = t;
    }
    const wordLen = loops.reduce((s, l) => s + l.word.length, 0);
    $('curve-summary').innerHTML =
        `<div><b>${sim.P.length}</b><span>punctures</span></div>` +
        `<div><b>${loops.length}</b><span>components</span></div>` +
        `<div><b>${wordLen}</b><span>word length</span></div>`;
    const dy = an ? E.dynnikov(an) : null;
    const dynEl = $('dyn-readout');
    if (!an || sim.P.length < 3) dynEl.innerHTML = '<span class="label-hint">Needs three or more punctures.</span>';
    else setTex(dynEl, `(a;b) = (${dy.a.join(',')}\\,;\\,${dy.b.join(',')})`);
    const wEl = $('word-readout');
    if (!sim.N) wEl.innerHTML = '<span class="label-hint">Draw a curve.</span>';
    else {
        // one KaTeX span per few letters, so a long word can wrap
        wEl.innerHTML = loops.map(l => {
            const w = A.canonicalCyclic(l.word);
            if (!w.length) return tex('1');
            const shown = w.slice(0, 240), chunks = [];
            for (let k = 0; k < shown.length; k += 6) chunks.push(tex(shown.slice(k, k + 6).map(A.letterTex).join('\\,')));
            if (w.length > shown.length) chunks.push(tex(`\\cdots\\ (${w.length}\\text{ letters})`));
            return `<span class="word-line">${chunks.join('<span class="wsp"> </span>')}</span>`;
        }).join('');
    }
    const n = sim.P.length;
    $('dyn-hint').innerHTML = n >= 3
        ? texify(`$${n - 2}$ numbers $a_i$, a semicolon, then $${n - 2}$ numbers $b_i$. The current curve is filled in.`)
        : 'Place at least three punctures first.';
    if (an && n >= 3 && sim.N && state.dynField && !state.dynField.__focused) {
        state.dynField.latex(`\\left(${dy.a.join(',')};${dy.b.join(',')}\\right)`);
    }
    $('undo-btn').disabled = !state.history.length;
    $('redo-btn').disabled = !state.future.length;
    renderBraidLog();
}

function genTex(g) {
    const i = Math.abs(g);
    return g > 0 ? `\\sigma_{${i}}` : `\\sigma_{${i}}^{-1}`;
}

let genCount = -1;
function renderGenerators() {
    const n = sim.P.length;
    if (n === genCount) return;
    genCount = n;
    const grid = $('gen-grid');
    grid.innerHTML = '';
    if (n < 2) {
        grid.innerHTML = '<p class="label-hint gen-empty">Place at least two punctures.</p>';
        return;
    }
    for (let i = 1; i < n; i++) {
        for (const s of [1, -1]) {
            const b = document.createElement('button');
            b.className = 'gen-btn';
            b.innerHTML = tex(genTex(s * i));
            b.title = `${s > 0 ? 'Counterclockwise' : 'Clockwise'} half twist of punctures ${i} and ${i + 1}` + (i <= 9 ? ` (${s > 0 ? '' : 'Shift-'}${i})` : '');
            b.addEventListener('click', () => applyBraid([s * i], true));
            b.addEventListener('mouseenter', () => { state.hoverGen = s * i; state.dirty = true; renderLabels(); });
            b.addEventListener('mouseleave', () => { state.hoverGen = 0; state.dirty = true; renderLabels(); });
            grid.appendChild(b);
        }
    }
}

function renderBraidLog() {
    const el = $('braid-log');
    if (!state.braidLog.length) el.innerHTML = '<span class="label-hint">Nothing yet.</span>';
    else setTex(el, A.braidTex(state.braidLog, 60));
    $('repeat-btn').disabled = !state.lastWord.length;
}

// puncture labels, numbered left to right
let labelEls = [];
function renderLabels() {
    const n = sim.P.length;
    if (!state.showLabels) { labelEls.forEach(e => e.remove()); labelEls = []; return; }
    while (labelEls.length < n) {
        const e = document.createElement('div');
        e.className = 'p-label';
        overlay.appendChild(e);
        labelEls.push(e);
    }
    while (labelEls.length > n) labelEls.pop().remove();
    const F = state.analysis?.F || E.cutFrame(sim.P);
    const hot = new Set();
    if (state.hoverGen) { const i = Math.abs(state.hoverGen); hot.add(i); hot.add(i + 1); }
    if (state.anim) { hot.add(state.anim.i); hot.add(state.anim.i + 1); }
    F.order.forEach((k, i) => {
        const e = labelEls[i];
        e.dataset.k = k;
        if (e.dataset.i !== String(i + 1)) { e.dataset.i = String(i + 1); e.innerHTML = tex(String(i + 1)); }
        e.classList.toggle('hot', hot.has(i + 1));
    });
    placeLabels();
}
function placeLabels() {
    const r = dotRadius();
    for (const e of labelEls) {
        const p = sim.P[+e.dataset.k];
        if (!p) continue;
        const [sx, sy] = w2s(p.x, p.y);
        e.style.left = `${sx}px`;
        e.style.top = `${sy + r + 3}px`;
    }
}

// the word, written under the curve as on the mural
let captionEl = null;
function renderCaption() {
    if (!captionEl) { captionEl = document.createElement('div'); captionEl.className = 'caption'; overlay.appendChild(captionEl); }
    const loops = state.analysis?.loops || [];
    const words = loops.filter(l => l.word.length).map(l => A.canonicalCyclic(l.word));
    if (!state.showWord || !sim.N || !words.length) { captionEl.style.display = 'none'; return; }
    captionEl.style.display = '';
    captionEl.innerHTML = tex(words.map(w => A.wordTex(w, 48)).join(',\\quad '));
    placeCaption();
}
function placeCaption() {
    if (!captionEl || captionEl.style.display === 'none') return;
    const b = bbox();
    if (!b) return;
    const [, sy] = w2s(b.x0, b.y0);
    const [sx1] = w2s(b.x1, b.y1);
    captionEl.style.left = `${sx1 - captionEl.offsetWidth}px`;
    captionEl.style.top = `${sy + 18}px`;
}

// ------------------------------------------------------------------ history

function pushHistory() {
    state.history.push({ snap: E.snapshot(sim), log: state.braidLog.slice(), preset: state.preset });
    if (state.history.length > 60) state.history.shift();
    state.future = [];
}
function restoreFrom(stackFrom, stackTo) {
    if (state.anim || !stackFrom.length) return;
    stackTo.push({ snap: E.snapshot(sim), log: state.braidLog.slice(), preset: state.preset });
    const s = stackFrom.pop();
    E.restore(sim, s.snap);
    sim.h = s.snap.h;
    state.braidLog = s.log;
    state.preset = s.preset;
    state.queue = [];
    refreshAnalysis();
    wake();
}
const undo = () => restoreFrom(state.history, state.future);
const redo = () => restoreFrom(state.future, state.history);

// ------------------------------------------------------------------ setting curves

function setCurveFromCounts(counts) {
    sim.h = state.hTarget;
    E.setLoops(sim, E.layoutFromCounts(sim, counts));
    refreshAnalysis();
    sim.h = state.hTarget;
    E.setLoops(sim, E.layoutFromCounts(sim, counts));
    E.remesh(sim, true);
    wake(true);
}

function setPunctures(pts) {
    sim.P = [];
    sim.nextId = 1;
    for (const [x, y] of pts) E.addPuncture(sim, x, y);
}

const EXAMPLES = [
    {
        id: 'mural', name: 'Thurston’s mural', sub: 'three punctures',
        load() {
            setPunctures([[-320, 8], [-16, 0], [320, -10]]);
            setCurveFromCounts(E.countsFromDynnikov(3, [-5], [3]));
        },
    },
    {
        id: 'pa', name: 'A pseudo-Anosov', sub: '$(\\sigma_1\\sigma_2^{-1})^3$ live',
        load() {
            setPunctures([[-260, 0], [0, 0], [260, 0]]);
            setCurveFromCounts(E.countsFromDynnikov(3, [0], [1]));
            return [1, -2, 1, -2, 1, -2];
        },
    },
    {
        id: 'four', name: 'Four punctures', sub: 'a longer curve',
        load() {
            setPunctures([[-360, -20], [-120, 40], [120, -40], [360, 20]]);
            setCurveFromCounts(E.countsFromDynnikov(4, [2, -1], [1, 2]));
        },
    },
    {
        id: 'blank', name: 'Start blank', sub: 'click, then draw',
        load() {
            setPunctures([]);
            E.setLoops(sim, []);
            refreshAnalysis();
        },
    },
];

function loadExample(ex, record = true) {
    if (state.anim) return;
    if (record) pushHistory();
    state.queue = [];
    state.braidLog = [];
    state.preset = ex.id === 'blank' ? null : ex.name;
    const word = ex.load();
    refreshAnalysis();
    fitView();
    wake(true);
    state.refitOnSettle = !word;
    document.querySelectorAll('.example-btn').forEach(b => b.classList.toggle('current', b.dataset.id === ex.id));
    if (word) setTimeout(() => applyBraid(word, false), 700);
}

// ------------------------------------------------------------------ braids

function applyBraid(word, record = true) {
    if (sim.P.length < 2 || !word.length) return;
    const n = sim.P.length;
    const bad = word.find(g => Math.abs(g) >= n);
    if (bad) { flash(`There is no ${tex(genTex(bad))} with ${n} punctures.`); return; }
    if (record) pushHistory();
    state.lastWord = word.slice();
    state.queue.push(...word);
    renderBraidLog();
}

function twistDuration() {
    const s = +$('speed').value;
    return 2.6 * Math.pow(0.08, s / 100);          // 2.6 s … 0.2 s
}

// the solver while punctures move: with the metric following them the curve
// is pulled harder than at rest, to keep up; with no metric to pull it right
// (or the solver paused) it is only kept apart
const movingOpts = () => (state.look !== 'geodesic' ? {}
    : following() && state.running ? { tensionMax: 0.3 } : { tension: false });

function startNextTwist() {
    if (!state.queue.length || state.anim) return;
    if (!followStart()) sim.useMetric = false;
    const g = state.queue.shift();
    const i = Math.abs(g);
    const F = E.cutFrame(sim.P);
    if (i >= F.order.length) { state.queue = []; return; }
    const tw = E.twistFrame(sim, F.order[i - 1], F.order[i], Math.sign(g));
    state.anim = { tw, gen: g, i, t: 0, dur: twistDuration() };
    wake();
    renderLabels();
}

const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function stepTwist(dt, t0, budget) {
    const a = state.anim;
    a.t += dt / a.dur;
    const goal = Math.PI * ease(Math.min(1, a.t));
    // with the metric following, the curve flows after every step of the twist
    const flow = following();
    let k = 0;
    while (!a.tw.done && a.tw.theta < goal - 1e-9 && performance.now() - t0 < budget) {
        E.twistStep(sim, a.tw, a.t >= 1 ? Math.PI : goal);
        followStep();
        if (flow || (k++ & 1) === 0) E.relaxIteration(sim, movingOpts());
    }
    if (a.t >= 1 && !a.tw.done) {
        while (!a.tw.done && performance.now() - t0 < budget) { E.twistStep(sim, a.tw, Math.PI); followStep(); E.relaxIteration(sim, movingOpts()); }
    }
    state.dirty = true;
    if (a.tw.done) {
        state.anim = null;
        followEnd();
        sim.useMetric = true;
        state.braidLog.push(a.gen);
        refreshAnalysis();
        wake();
        if (!state.queue.length) maybeRefit();
    }
}

function maybeRefit() {
    const b = bbox();
    if (!b) return;
    const [x0, y1] = w2s(b.x0, b.y0), [x1, y0] = w2s(b.x1, b.y1);
    const fw = state.W - panelSpace();
    if (x0 < 10 || y0 < 10 || x1 > fw - 10 || y1 > state.H - 30) fitView(true);
}

// ------------------------------------------------------------------ drawing a curve

function finishStroke(pts) {
    const loop = closeStroke(pts);
    if (!loop) { flash('That curve crosses itself. Draw a simple closed curve.'); return; }
    if (loop.length < 6) return;
    // resample at the solver's segment length
    const ell = 0.5 * Math.max(1, Math.min(sim.h, state.hTarget));
    const xs = [], ys = [];
    const n = loop.length;
    for (let k = 0; k < n; k++) {
        const [ax, ay] = loop[k], [bx, by] = loop[(k + 1) % n];
        const L = Math.hypot(bx - ax, by - ay);
        const m = Math.max(1, Math.ceil(L / ell));
        for (let s = 0; s < m; s++) { xs.push(ax + (bx - ax) * s / m); ys.push(ay + (by - ay) * s / m); }
    }
    // nudge off any puncture it passes exactly through
    for (const p of sim.P) {
        for (let k = 0; k < xs.length; k++) {
            const k2 = (k + 1) % xs.length;
            const r = E.segPoint(xs[k], ys[k], xs[k2], ys[k2], p.x, p.y);
            if (r.d < 1e-6) { xs[k] += 1e-3; ys[k] += 1e-3; xs[k2] += 1e-3; ys[k2] += 1e-3; }
        }
    }
    pushHistory();
    state.braidLog = [];
    state.preset = null;
    state.queue = [];
    document.querySelectorAll('.example-btn').forEach(b => b.classList.remove('current'));
    E.setLoops(sim, [{ x: xs, y: ys }]);
    refreshAnalysis();
    wake(true);
    const kind = state.analysis?.loops[0]?.kind;
    if (kind === 'trivial') flash('This curve bounds a disk with no punctures in it, so it shrinks away.', 'warning', 4500);
    else if (kind === 'peripheral') flash('This curve goes around a single puncture: it is peripheral.', 'info', 4000);
    else if (kind === 'outer') flash('This curve goes around every puncture: it is parallel to the boundary.', 'info', 4000);
}

// Close a hand-drawn stroke into a simple polygon: if the end runs past the
// start, cut at the crossing; refuse strokes that cross themselves otherwise.
function closeStroke(pts) {
    const n = pts.length;
    if (n < 4) return null;
    const hits = [];
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 2; j < n - 1; j++) {
            const [a, b, c, d] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
            if (E.segsIntersect(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])) hits.push([i, j]);
        }
    }
    if (!hits.length) {
        // closing segment must miss the rest
        const a = pts[n - 1], b = pts[0];
        for (let i = 1; i < n - 2; i++) {
            const c = pts[i], d = pts[i + 1];
            if (E.segsIntersect(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])) return null;
        }
        return pts;
    }
    // outermost crossing: the loop pts[i+1..j] closed at the crossing point
    hits.sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]));
    const [i, j] = hits[0];
    if (hits.some(([k, l]) => k > i && l < j)) return null;
    const [a, b, c, d] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    const t = den ? ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den : 0.5;
    const X = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    return [X, ...pts.slice(i + 1, j + 1)];
}

// ------------------------------------------------------------------ pointer input

function hitPuncture(sx, sy) {
    const r = Math.max(10, dotRadius() + 6);
    let best = -1, bd = r;
    sim.P.forEach((p, k) => {
        const [px, py] = w2s(p.x, p.y);
        const d = Math.hypot(px - sx, py - sy);
        if (d < bd) { bd = d; best = k; }
    });
    return best;
}

function busy() { return !!state.anim || state.queue.length > 0; }

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (e.shiftKey || state.space))) {
        const k = hitPuncture(sx, sy);
        if (e.button === 2 && k >= 0 && !busy()) { removePuncture(k); return; }
        state.pan = { sx, sy, vx: state.view.x, vy: state.view.y };
        canvas.classList.add('panning');
        return;
    }
    if (e.button !== 0 || busy()) return;
    const k = hitPuncture(sx, sy);
    if (k >= 0) {
        if (e.altKey) { removePuncture(k); return; }
        const [wx, wy] = s2w(sx, sy);
        const p = sim.P[k];
        unzipNow();
        state.drag = { q: k, ox: p.x - wx, oy: p.y - wy, tx: p.x, ty: p.y, active: false, recorded: false };
        canvas.classList.add('dragging');
        return;
    }
    const [wx, wy] = s2w(sx, sy);
    state.pending = { sx, sy, pts: [[wx, wy]] };
});

canvas.addEventListener('pointermove', e => {
    const sx = e.clientX, sy = e.clientY;
    if (state.pan) {
        const z = state.view.zoom;
        state.view.x = state.pan.vx - (sx - state.pan.sx) / z;
        state.view.y = state.pan.vy + (sy - state.pan.sy) / z;
        state.dirty = true;
        return;
    }
    if (state.drag) {
        const [wx, wy] = s2w(sx, sy);
        const d = state.drag;
        d.tx = wx + d.ox; d.ty = wy + d.oy;
        if (!d.active) {
            const p = sim.P[d.q];
            if (Math.hypot(d.tx - p.x, d.ty - p.y) * state.view.zoom > 3) {
                d.active = true;
                if (!d.recorded) { pushHistory(); d.recorded = true; }
                state.preset = null;
            }
        }
        return;
    }
    if (state.pending) {
        const pd = state.pending;
        if (!state.stroke && Math.hypot(sx - pd.sx, sy - pd.sy) > 6) state.stroke = pd.pts;
        if (state.stroke) {
            const [wx, wy] = s2w(sx, sy);
            const last = state.stroke[state.stroke.length - 1];
            if (Math.hypot(wx - last[0], wy - last[1]) * state.view.zoom > 2) state.stroke.push([wx, wy]);
            state.dirty = true;
        }
        return;
    }
    const k = hitPuncture(sx, sy);
    if (k !== state.hoverP) { state.hoverP = k; state.dirty = true; }
    canvas.classList.toggle('over-puncture', k >= 0);
});

function endPointer(e) {
    if (state.pan) { state.pan = null; canvas.classList.remove('panning'); return; }
    if (state.drag) {
        const d = state.drag;
        state.drag = null;
        canvas.classList.remove('dragging');
        followEnd();
        if (d.active) { refreshAnalysis(); wake(true); }
        return;
    }
    if (state.pending) {
        const pd = state.pending;
        state.pending = null;
        if (state.stroke) {
            const pts = state.stroke;
            state.stroke = null;
            if (e.type === 'pointerup') finishStroke(pts);
            state.dirty = true;
        } else if (e.type === 'pointerup') {
            addPunctureAt(pd.pts[0][0], pd.pts[0][1]);
        }
    }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('dblclick', e => {
    const k = hitPuncture(e.clientX, e.clientY);
    if (k >= 0 && !busy()) removePuncture(k);
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [wx, wy] = s2w(e.clientX, e.clientY);
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    const z = Math.max(0.02, Math.min(40, state.view.zoom * f));
    state.view.zoom = z;
    const [wx2, wy2] = s2w(e.clientX, e.clientY);
    state.view.x += wx - wx2; state.view.y += wy - wy2;
    state.dirty = true;
}, { passive: false });

function addPunctureAt(x, y) {
    const minD = 0.6 * Math.max(sim.h, 4);
    if (sim.P.some(p => Math.hypot(p.x - x, p.y - y) < minD)) return;
    // not exactly on the curve
    for (let g = 0; g < sim.N; g++) {
        const g1 = sim.next[g];
        if (E.segPoint(sim.X[g], sim.Y[g], sim.X[g1], sim.Y[g1], x, y).d < 1e-6) { x += 1e-3; y += 1e-3; break; }
    }
    pushHistory();
    state.preset = null;
    E.addPuncture(sim, x, y);
    refreshAnalysis();
    wake();
}

function removePuncture(k) {
    pushHistory();
    state.preset = null;
    sim.P.splice(k, 1);
    state.hoverP = -1;
    refreshAnalysis();
    wake(true);
}

// ------------------------------------------------------------------ keyboard

const typing = () => {
    const a = document.activeElement;
    return a && (a.closest?.('.mq-editable-field') || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
};
window.addEventListener('keydown', e => {
    if (e.key === ' ' && !typing()) { state.space = true; }
    if (typing() || e.metaKey && e.key !== 'z' || e.ctrlKey && e.key !== 'z') return;
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit && !e.metaKey && !e.ctrlKey) { applyBraid([(e.shiftKey ? -1 : 1) * +digit[1]]); e.preventDefault(); return; }
    if (e.key === 'z' || e.key === 'Z') { (e.shiftKey ? redo : undo)(); e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') { fitView(true); return; }
    if (e.key === 't' || e.key === 'T') { toggleZip(); return; }
    if (e.key === 'r' || e.key === 'R') { applyBraid(state.lastWord); return; }
    if (e.key === 'Escape') { state.queue = []; return; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && state.hoverP >= 0 && !busy()) { removePuncture(state.hoverP); return; }
});
window.addEventListener('keyup', e => {
    if (e.key === ' ') {
        state.space = false;
        if (!typing() && !state.pan) toggleSolver();
    }
});

function toggleSolver() {
    state.running = !state.running;
    $('t-solver').classList.toggle('active', state.running);
    $('t-solver').textContent = state.running ? 'Solver running' : 'Solver paused';
    wake();
}

// ------------------------------------------------------------------ rendering

const COLORS = ['#e4572e', '#2e86ab', '#4f9d69', '#c06fd1', '#e8a33d', '#3fb8af', '#d1495b', '#6c757d'];

function dotRadius() {
    if (state.look === 'geodesic') return Math.max(3, Math.min(7, 2.2 + 0.0025 * (sim.metric?.disk.R ?? 400) * state.view.zoom));
    return Math.max(3, Math.min(16, 0.42 * sim.h * state.view.zoom));
}

function inkColors() {
    const cs = getComputedStyle(document.documentElement);
    if (state.palette === 'mural') return { curve: cs.getPropertyValue('--mural-paint').trim(), dot: '#141414', bg: cs.getPropertyValue('--mural-wall').trim() };
    return { curve: cs.getPropertyValue('--curve-ink').trim(), dot: cs.getPropertyValue('--puncture-ink').trim(), bg: null };
}
let INK = null;

function tracePath(o, n, X = sim.X, Y = sim.Y) {
    const S = (g) => w2s(X[g], Y[g]);
    let [px, py] = S(o + n - 1);
    let [cx, cy] = S(o);
    ctx.moveTo((px + cx) / 2, (py + cy) / 2);
    for (let i = 0; i < n; i++) {
        const [nx, ny] = S(o + (i + 1) % n);
        ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
        cx = nx; cy = ny;
    }
    ctx.closePath();
}

// a closed polyline given as flat world coordinates [x0, y0, x1, y1, …]
function tracePts(pts) {
    const n = pts.length / 2;
    if (n < 2) return;
    const S = k => w2s(pts[2 * k], pts[2 * k + 1]);
    let [px, py] = S(n - 1);
    let [cx, cy] = S(0);
    ctx.moveTo((px + cx) / 2, (py + cy) / 2);
    for (let i = 0; i < n; i++) {
        const [nx, ny] = S((i + 1) % n);
        ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
        cx = nx; cy = ny;
    }
    ctx.closePath();
}

function drawTwistGuide(tw, alpha) {
    // the elliptic path the two punctures follow
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let k = 0; k <= 96; k++) {
        const t = 2 * Math.PI * k / 96;
        const u = tw.rhoP * Math.cos(t), v = tw.rhoP * Math.sin(t);
        const x = tw.cx + tw.SA * u * tw.ex + tw.SB * v * tw.nx, y = tw.cy + tw.SA * u * tw.ey + tw.SB * v * tw.ny;
        const [sx, sy] = w2s(x, y);
        if (k) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // arrowheads showing the direction, a quarter of the way along each path
    for (const start of [Math.PI, 0]) {
        const t = start + tw.sign * Math.PI * 0.5;
        const pt = th => { const u = tw.rhoP * Math.cos(th), v = tw.rhoP * Math.sin(th); return w2s(tw.cx + tw.SA * u * tw.ex + tw.SB * v * tw.nx, tw.cy + tw.SA * u * tw.ey + tw.SB * v * tw.ny); };
        const [ax, ay] = pt(t), [bx, by] = pt(t + tw.sign * 0.05);
        const ang = Math.atan2(by - ay, bx - ax);
        ctx.beginPath();
        ctx.moveTo(ax + 9 * Math.cos(ang), ay + 9 * Math.sin(ang));
        ctx.lineTo(ax + 9 * Math.cos(ang + 2.5), ay + 9 * Math.sin(ang + 2.5));
        ctx.lineTo(ax + 9 * Math.cos(ang - 2.5), ay + 9 * Math.sin(ang - 2.5));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
    }
    ctx.restore();
}

function draw() {
    if (!INK) INK = inkColors();
    const { dpr, W, H } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (INK.bg) { ctx.fillStyle = INK.bg; ctx.fillRect(0, 0, W, H); }
    const z = state.view.zoom;
    const geo = state.look === 'geodesic';
    const lw = geo ? Math.max(0.9, Math.min(2.4, 0.5 * sim.h * z)) : Math.max(0.8, 0.46 * sim.h * z);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the boundary of the disk: infinitely far away in the metric
    if (geo && sim.metric) {
        const { cx, cy, R } = sim.metric.disk;
        const [sx, sy] = w2s(cx, cy);
        ctx.save();
        ctx.strokeStyle = INK.curve;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, R * z, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }
    const zipped = state.track && state.zipT > 0 ? Z.zipLoops(state.track, sim, state.zipT) : null;
    ctx.lineWidth = zipped ? lw * (1 + 0.45 * state.zipT) : lw;
    for (let l = 0; l < sim.starts.length; l++) {
        ctx.beginPath();
        if (zipped) tracePts(zipped[l]);
        else tracePath(sim.starts[l], sim.lens[l]);
        ctx.strokeStyle = state.palette === 'color' ? COLORS[l % COLORS.length] : INK.curve;
        ctx.stroke();
    }
    if (state.showVerts) {
        ctx.fillStyle = '#f43f5e';
        for (let g = 0; g < sim.N; g++) { const [x, y] = w2s(sim.X[g], sim.Y[g]); ctx.fillRect(x - 1, y - 1, 2, 2); }
    }
    // twist guide
    if (state.anim) drawTwistGuide(state.anim.tw, 0.55);
    else if (state.hoverGen && sim.P.length >= 2) {
        const i = Math.abs(state.hoverGen);
        const F = state.analysis?.F || E.cutFrame(sim.P);
        if (i < F.order.length) drawTwistGuide(E.twistFrame(sim, F.order[i - 1], F.order[i], Math.sign(state.hoverGen)), 0.75);
    }
    // stroke in progress
    if (state.stroke && state.stroke.length > 1) {
        ctx.save();
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        state.stroke.forEach(([x, y], k) => { const [sx, sy] = w2s(x, y); if (k) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
        ctx.stroke();
        ctx.restore();
    }
    // punctures
    const r = dotRadius();
    sim.P.forEach((p, k) => {
        const [sx, sy] = w2s(p.x, p.y);
        if (k === state.hoverP || state.drag?.q === k) {
            ctx.beginPath();
            ctx.arc(sx, sy, r + 5, 0, 2 * Math.PI);
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim();
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, 2 * Math.PI);
        ctx.fillStyle = INK.dot;
        ctx.fill();
    });
    placeLabels();
    placeCaption();
    placeWeights();
}

// ------------------------------------------------------------------ zipping to a train track

// Zip when the curve is at rest; unzip (quickly) before anything moves it.
// While any of the zip shows, the solver and the braid queue wait, so the
// track's vertex data stay valid.
function stepZip(dt) {
    if (state.track && !Z.trackValid(state.track, sim)) unzipNow();
    const calm = !busy() && !state.drag && (state.settled || !state.running);
    const want = state.zipMode && calm && sim.N > 0;
    if (want && !state.track) {
        state.track = Z.buildTrack(sim);
        if (state.track) {
            renderWeights();
            renderZipHint();
        }
    }
    const goal = want && state.track ? 1 : 0;
    if (state.zipT === goal) return;
    state.zipDir = goal ? 1 : -1;
    state.zipT = goal ? Math.min(1, state.zipT + dt / 1.6) : Math.max(0, state.zipT - dt / 0.45);
    state.dirty = true;
    if (state.zipT === 0) { state.track = null; renderWeights(); renderZipHint(); }
}

function unzipNow() {
    if (!state.track && !state.zipT) return;
    state.zipT = 0;
    state.track = null;
    renderWeights();
    renderZipHint();
    state.dirty = true;
}

function toggleZip() {
    state.zipMode = !state.zipMode;
    $('zip-btn').classList.toggle('active', state.zipMode);
    $('zip-btn').textContent = state.zipMode ? 'Zipped' : 'Zip';
    if (state.zipMode && !sim.N) flash('Draw a curve first, then zip it.', 'info', 2500);
    renderZipHint();
    state.dirty = true;
}

function renderZipHint() {
    const el = $('zip-hint');
    if (!el) return;
    const tr = state.track;
    if (state.zipMode && tr) {
        const nb = tr.branches.length, ns = tr.trueSwitches;
        el.innerHTML = `<b>${nb}</b> branch${nb === 1 ? '' : 'es'} meeting at <b>${ns}</b> switch${ns === 1 ? '' : 'es'}. ` +
            'At every switch the weights coming in from the left and from the right both add up to the strands through it. ' +
            'A braid move unzips the track, moves the curve, and zips it again.';
    } else {
        el.innerHTML = 'Squeeze each band of parallel strands into one branch, and each bundle of strands crossing the ray above ' +
            'or below a puncture into one switch. Each branch is labeled with its weight: how many strands it carries.';
    }
}

// one weight per branch, beside the middle of its longest piece, on the side away from the punctures
function weightAnchor(b, off) {
    const p = state.track.families[b.host].path, M = p.length - 1, s = M >> 1;
    const [x, y] = p[s];
    let tx = p[s + 1][0] - p[s - 1][0], ty = p[s + 1][1] - p[s - 1][1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let best = null, bd = -1;
    for (const sg of [1, -1]) {
        const qx = x - sg * ty * off, qy = y + sg * tx * off;
        const d = Math.min(...sim.P.map(q => Math.hypot(q.x - qx, q.y - qy)));
        if (d > bd) { bd = d; best = [qx, qy]; }
    }
    return best;
}

let weightEls = [];
function renderWeights() {
    const bs = state.track ? state.track.branches : [];
    while (weightEls.length < bs.length) {
        const e = document.createElement('div');
        e.className = 'w-label';
        overlay.appendChild(e);
        weightEls.push(e);
    }
    while (weightEls.length > bs.length) weightEls.pop().remove();
    bs.forEach((b, k) => {
        const e = weightEls[k];
        if (e.dataset.w !== String(b.weight)) { e.dataset.w = String(b.weight); e.innerHTML = tex(String(b.weight)); }
    });
    placeWeights();
}
function placeWeights() {
    const tr = state.track;
    if (!tr) return;
    const a = Math.max(0, Math.min(1, (state.zipT - 0.75) / 0.25));
    tr.branches.forEach((b, k) => {
        const e = weightEls[k];
        if (!e) return;
        const [x, y] = weightAnchor(b, 13 / state.view.zoom);
        const [sx, sy] = w2s(x, y);
        e.style.left = `${sx}px`;
        e.style.top = `${sy}px`;
        e.style.opacity = a;
    });
}

// ------------------------------------------------------------------ main loop

let lastT = performance.now();
function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    const t0 = performance.now();
    const budget = 12;
    if (state.viewAnim) {
        const va = state.viewAnim;
        va.t = Math.min(1, va.t + dt / 0.45);
        const s = ease(va.t);
        const zf = Math.exp(Math.log(va.from.zoom) + (Math.log(va.to.zoom) - Math.log(va.from.zoom)) * s);
        state.view = { x: va.from.x + (va.to.x - va.from.x) * s, y: va.from.y + (va.to.y - va.from.y) * s, zoom: zf };
        if (va.t >= 1) state.viewAnim = null;
        state.dirty = true;
    }
    // spacing eases toward its target
    if (Math.abs(sim.h - state.hTarget) > 1e-3 * state.hTarget) {
        sim.h += (state.hTarget - sim.h) * Math.min(1, dt * 5);
        if (Math.abs(sim.h - state.hTarget) < 2e-3 * state.hTarget) sim.h = state.hTarget;
        wake();
    }
    stepZip(dt);
    if (!state.anim && state.queue.length && !state.drag?.active && state.zipT === 0) startNextTwist();
    if (state.anim) stepTwist(dt, t0, following() ? budget : budget * 0.75);
    else if (state.drag?.active) {
        const d = state.drag;
        let k = 0;
        if (!d.followed) { d.followed = true; if (!followStart()) sim.useMetric = false; }
        while (performance.now() - t0 < budget * 0.6) {
            // in the geodesic look the puncture takes its cusp along: the
            // curve never comes near a cusp, so it should not be run into
            const reach = following() ? Math.max(1, 0.3 * follow.m.s[d.q] / (1.6 * sim.h * sim.rpFactor)) : 1;
            const left = E.dragStep(sim, d.q, d.tx, d.ty, reach);
            followStep();
            if ((k++ % 3) === 0) E.relaxIteration(sim, movingOpts());
            if (left < 1e-6) break;
        }
        wake();
        if (performance.now() - state.lastAnalysis > 120) refreshAnalysis();
    }
    if (state.running && !state.settled && sim.N > 0 && state.zipT === 0) {
        const nLoops = sim.starts.length;
        const moving = state.anim || state.drag?.active;
        if (moving) settler.wake();
        while (performance.now() - t0 < budget) {
            settler.step(moving ? movingOpts() : undefined);
            if (settler.settled && !moving) {
                state.settled = true;
                if (state.refitOnSettle) { state.refitOnSettle = false; fitView(true); }
                // with the curve settled, check the gaps between all pairs of punctures
                if (state.spacingMode === 'auto' && state.analysis) {
                    const h = hAutoNow(state.analysis) * spacingFactor();
                    if (h < state.hTarget * 0.97) { state.hTarget = h; wake(); }
                }
                break;
            }
        }
        if (sim.starts.length !== nLoops) refreshAnalysis();
        state.dirty = true;
    }
    if (state.dirty) { draw(); state.dirty = false; }
    updateStatus();
    renderSolverReadout();
    requestAnimationFrame(tick);
}

let readoutAt = 0;
function renderSolverReadout() {
    const now = performance.now();
    if (now - readoutAt < 250) return;
    readoutAt = now;
    const el = $('solver-readout');
    if (!el.offsetParent) return;
    const rows = [
        ['Strand spacing', `${sim.h.toFixed(2)}`],
        ['Vertices', `${sim.N}`],
        ['Tension', `${(sim.tension / 0.15 * 100).toFixed(0)}%`],
        ['State', state.settled ? 'settled' : state.running ? 'moving' : 'paused'],
    ];
    el.innerHTML = rows.map(([k, v]) => `<div class="kv-row"><span>${k}</span><b>${v}</b></div>`).join('');
}

// ------------------------------------------------------------------ URL

function writeHash() {
    if (!sim.P.length) { history.replaceState(null, '', location.pathname + location.search); return; }
    const an = state.analysis;
    const p = sim.P.map(q => `${+q.x.toFixed(1)},${+q.y.toFixed(1)}`).join(';');
    let s = `p=${p}`;
    if (sim.N && an) {
        const c = an.F.order.map((_, i) => `${an.up[i]}.${an.down[i]}`).join(',');
        s += `&c=${c}|${an.beta.join(',')}`;
    }
    history.replaceState(null, '', '#' + s);
}

function readHash() {
    const h = location.hash.slice(1);
    if (!h) return false;
    try {
        const q = new URLSearchParams(h);
        const p = q.get('p');
        if (!p) return false;
        setPunctures(p.split(';').map(t => t.split(',').map(Number)));
        const c = q.get('c');
        if (c) {
            const [ud, b] = c.split('|');
            const pairs = ud.split(',').map(t => t.split('.').map(Number));
            const counts = { up: pairs.map(v => v[0]), down: pairs.map(v => v[1]), beta: b ? b.split(',').map(Number) : [] };
            setCurveFromCounts(counts);
        } else E.setLoops(sim, []);
        refreshAnalysis();
        return true;
    } catch (e) {
        console.warn('bad link', e);
        return false;
    }
}

// ------------------------------------------------------------------ SVG export

function exportSVG() {
    const b = bbox();
    if (!b) return;
    const pad = 3 * sim.h + 20;
    const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + 2 * pad, hh = b.y1 - b.y0 + 2 * pad;
    const tx = x => (x - x0).toFixed(2), ty = y => (y0 + hh - y).toFixed(2);
    const ink = state.palette === 'mural' ? '#3f4042' : '#23262e';
    let paths = '';
    const zipped = state.track && state.zipT >= 1;
    const zl = zipped ? Z.zipLoops(state.track, sim, 1) : null;
    for (let l = 0; l < sim.starts.length; l++) {
        const o = sim.starts[l], n = zipped ? zl[l].length / 2 : sim.lens[l];
        const P = zipped
            ? k => { const j = ((k % n) + n) % n; return [zl[l][2 * j], zl[l][2 * j + 1]]; }
            : k => [sim.X[o + ((k % n) + n) % n], sim.Y[o + ((k % n) + n) % n]];
        let [cx, cy] = P(0), [px, py] = P(-1);
        let d = `M${tx((px + cx) / 2)} ${ty((py + cy) / 2)}`;
        for (let i = 0; i < n; i++) {
            const [nx, ny] = P(i + 1);
            d += `Q${tx(cx)} ${ty(cy)} ${tx((cx + nx) / 2)} ${ty((cy + ny) / 2)}`;
            cx = nx; cy = ny;
        }
        const col = state.palette === 'color' ? COLORS[l % COLORS.length] : ink;
        const sw = (state.look === 'geodesic' ? Math.max(0.6, 0.5 * sim.h) : 0.46 * sim.h) * (zipped ? 1.45 : 1);
        paths += `<path d="${d}Z" fill="none" stroke="${col}" stroke-width="${sw.toFixed(2)}" stroke-linejoin="round"/>\n`;
    }
    if (zipped) {
        const fs = Math.max(10, 1.6 * sim.h);
        for (const br of state.track.branches) {
            const [x, y] = weightAnchor(br, 1.1 * fs);
            paths += `<text x="${tx(x)}" y="${ty(y)}" font-family="KaTeX_Main, 'Times New Roman', serif" font-size="${fs.toFixed(1)}" fill="${ink}" text-anchor="middle" dominant-baseline="central">${br.weight}</text>\n`;
        }
    }
    const dr = state.look === 'geodesic' ? dotRadius() / state.view.zoom : 0.42 * sim.h;
    const dots = sim.P.map(p => `<circle cx="${tx(p.x)}" cy="${ty(p.y)}" r="${dr.toFixed(2)}" fill="#111"/>`).join('\n');
    const bg = state.palette === 'mural' ? '#a9a9a5' : '#ffffff';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${hh.toFixed(1)}" width="${w.toFixed(0)}" height="${hh.toFixed(0)}">\n<rect width="100%" height="100%" fill="${bg}"/>\n${paths}${dots}\n</svg>\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = zipped ? 'train-track.svg' : 'curve.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ panel wiring

function wirePanel() {
    const ex = $('examples');
    for (const e of EXAMPLES) {
        const b = document.createElement('button');
        b.className = 'example-btn';
        b.dataset.id = e.id;
        b.innerHTML = `${e.name}<small>${texify(e.sub)}</small>`;
        b.addEventListener('click', () => loadExample(e));
        ex.appendChild(b);
    }
    $('clear-curve').addEventListener('click', () => {
        if (busy() || !sim.N) return;
        pushHistory(); E.setLoops(sim, []); state.braidLog = []; state.preset = null; refreshAnalysis();
    });
    $('clear-all').addEventListener('click', () => {
        if (busy()) return;
        pushHistory(); sim.P = []; E.setLoops(sim, []); state.braidLog = []; state.preset = null; refreshAnalysis();
    });
    $('undo-btn').addEventListener('click', undo);
    $('redo-btn').addEventListener('click', redo);
    $('copy-link').addEventListener('click', async () => {
        writeHash();
        try { await navigator.clipboard.writeText(location.href); flash('Link copied.', 'ok', 1800); }
        catch (e) { flash('Copy the address bar to share this curve.', 'info', 2500); }
    });
    $('repeat-btn').addEventListener('click', () => applyBraid(state.lastWord));
    $('zip-btn').addEventListener('click', toggleZip);
    renderZipHint();
    $('speed').addEventListener('input', () => { $('speed-val').textContent = `${twistDuration().toFixed(2)} s`; });
    $('speed-val').textContent = `${twistDuration().toFixed(2)} s`;

    const spacingUI = () => {
        $('spacing-name').textContent = state.spacingMode === 'auto' ? 'Looser ↔ tighter' : 'Strand spacing';
        $('spacing-val').textContent = state.spacingMode === 'auto' ? `× ${spacingFactor().toFixed(2)}` : manualSpacing().toFixed(1);
    };
    document.querySelectorAll('#spacing-mode .seg-opt').forEach(b => b.addEventListener('click', () => {
        state.spacingMode = b.dataset.mode;
        document.querySelectorAll('#spacing-mode .seg-opt').forEach(o => o.classList.toggle('active', o === b));
        if (state.spacingMode === 'manual') {
            state.spacingSlider = Math.round(100 * Math.log(sim.h / 2) / Math.log(20));
            state.spacingSlider = Math.max(0, Math.min(100, state.spacingSlider));
        } else state.spacingSlider = 50;
        $('spacing').value = state.spacingSlider;
        spacingUI();
        refreshAnalysis(); wake(true);
    }));
    $('spacing').addEventListener('input', () => {
        state.spacingSlider = +$('spacing').value;
        spacingUI();
        state.hTarget = state.spacingMode === 'auto' ? (state.hAuto ?? 12) * spacingFactor() : manualSpacing();
        wake(true);
    });
    spacingUI();
    const lookUI = () => {
        document.querySelectorAll('#look .seg-opt').forEach(o => o.classList.toggle('active', o.dataset.look === state.look));
        $('look-hint').innerHTML = state.look === 'geodesic'
            ? 'The curve is the geodesic of the hyperbolic metric on the disk minus the punctures (the faint circle is infinitely far away). Strands are kept a hair apart so each one stays visible.'
            : 'The curve is a band of fixed thickness pulled tight around the punctures: strands stack in parallel bands, like a train track.';
    };
    document.querySelectorAll('#look .seg-opt').forEach(b => b.addEventListener('click', () => {
        if (busy() || state.look === b.dataset.look) return;
        state.look = b.dataset.look;
        lookUI();
        syncMetric(true);
        refreshAnalysis();
        wake(true);
        state.refitOnSettle = true;
    }));
    lookUI();
    document.querySelectorAll('#palette .seg-opt').forEach(b => b.addEventListener('click', () => {
        state.palette = b.dataset.p;
        document.querySelectorAll('#palette .seg-opt').forEach(o => o.classList.toggle('active', o === b));
        document.documentElement.classList.toggle('mural', state.palette === 'mural');
        INK = null; state.dirty = true;
    }));
    const toggle = (id, key, after) => $(id).addEventListener('click', () => {
        state[key] = !state[key];
        $(id).classList.toggle('active', state[key]);
        after?.(); state.dirty = true;
    });
    toggle('t-labels', 'showLabels', renderLabels);
    toggle('t-word', 'showWord', renderCaption);
    toggle('t-verts', 'showVerts');
    $('t-solver').addEventListener('click', toggleSolver);
    $('fit-btn').addEventListener('click', () => fitView(true));
    $('svg-btn').addEventListener('click', exportSVG);
    document.addEventListener('themechange', () => { INK = null; state.dirty = true; });
    document.addEventListener('panel:collapse', () => { state.dirty = true; });

    $('solver-explain').innerHTML = texify(`
<p><b>Geodesic.</b> The punctured disk carries a unique complete hyperbolic metric $\\rho\\,|dz|$ (curvature $-1$, a cusp at each puncture, the boundary circle at infinite distance), and each essential curve has a unique geodesic in its isotopy class. With $u = \\log\\rho$, curvature $-1$ means $\\Delta u = e^{2u}$. The exact Poincaré disk and exact cusp profiles are glued together and a bounded correction is solved on a grid by nonlinear multigrid. The curve then flows by hyperbolic curve shortening, which moves it with speed $\\kappa - \\partial_n u$ along the normal. While punctures move, in a twist or a drag, a coarser copy of the metric is solved again every few steps, so the curve stays a geodesic of the surface of the moment all the way from the old one to the new one.</p>
<p><b>Train track.</b> A band of fixed thickness pulled tight: strands repel to one spacing apart and stack in bands.</p>
<p>Either way, no vertex moves more than $0.45\\times$ its clearance (its segments' distance to every other segment and puncture); twists and drags use the same test on relative motion. Nothing ever touches, so the isotopy class never changes.</p>`);
    $('braid-explain').innerHTML = texify(
        'A generator turns its two punctures half way round their midpoint, along the dashed path, inside an ellipse ' +
        'that holds no other puncture. The plane inside the ellipse turns with them and comes to rest at its rim, so ' +
        'the curve is carried by a homeomorphism of the plane. Dragging a puncture works the same way: a disk around ' +
        'it moves rigidly with it and the curve beyond is pushed aside. In the geodesic look the metric moves with the ' +
        'punctures and the curve keeps tightening as they go.');
    $('braid-subtitle').innerHTML = texify(
        '$\\sigma_i$ turns the $i$-th and $(i+1)$-st punctures from the left half way round each other ' +
        'counterclockwise, and $\\sigma_i^{-1}$ turns them clockwise, carrying the curve along.');

    $('help-body').innerHTML = texify(`
<p>Pick finitely many points in the plane and remove them. A <b>simple closed curve</b> in what is left can be moved
around freely as long as it never crosses itself or a puncture; curves related this way are <b>isotopic</b>. Isotopy
classes of curves, and how the braid group (the mapping class group of the punctured disk) acts on them, are at the
heart of Thurston's theory of surface homeomorphisms.</p>
<h4>Drawing</h4>
<ul>
<li><b>Click</b> to place a puncture; <b>double-click</b> or right-click one to remove it.</li>
<li><b>Drag</b> from empty space to draw a closed curve. If the end runs past the start it is trimmed there.</li>
<li><b>Drag a puncture</b> to push the curve along with it. Moving a puncture around a loop is a <i>point push</i>.</li>
<li>Scroll to zoom; Shift-drag or right-drag to pan; <kbd>F</kbd> fits the picture.</li>
</ul>
<h4>The nice representative</h4>
<p>The disk minus the punctures has a unique complete <b>hyperbolic metric</b>: curvature $-1$, a cusp at every
puncture, the boundary circle infinitely far away. Every essential simple closed curve has exactly one geodesic in its
isotopy class, and that is what the <b>Geodesic</b> look draws. Strands converge where the curve runs long stretches in
parallel and fan apart elsewhere. The <b>Train track</b> look instead pulls a band of fixed thickness tight, so the
strands stack evenly, as in Thurston's mural. Either way the solver only ever moves the curve by steps too small to
touch anything, so the isotopy class never changes.</p>
<h4>Invariants</h4>
<p>Cut the plane by vertical lines through the punctures and between neighbors. With
$\\alpha_{2i-1}, \\alpha_{2i}$ the minimal numbers of crossings with the rays above and below the $(i+1)$-st puncture
and $\\beta_i$ with the line between the $i$-th and $(i+1)$-st, the <b>Dynnikov coordinates</b> are
$$a_i = \\tfrac12(\\alpha_{2i}-\\alpha_{2i-1}), \\qquad b_i = \\tfrac12(\\beta_i-\\beta_{i+1}), \\qquad 1\\le i\\le n-2.$$
They determine the curve completely, and you can type them in to draw any multicurve. The <b>word</b> records the
crossings with the upward rays: $a, b, c, \\dots$ when the curve crosses the ray above the 1st, 2nd, 3rd, … puncture
from left to right, and $\\bar a, \\bar b, \\dots$ from right to left. It is the curve's class in
$\\pi_1$, which is free on these letters, up to conjugacy and inversion. On the mural it is painted under the curve.</p>
<h4>Zipping to a train track</h4>
<p>Cut along the rays above and below each puncture. Between neighboring rays, arcs of the curve that join the same
two rays are parallel, so the curve is a union of <b>bands</b>. <b>Zip</b> squeezes each band into one branch and
each bundle of strands crossing a ray into one <b>switch</b>, where branches meet tangentially. The result is a
<b>train track</b> carrying the curve, and each branch is labeled with its <b>weight</b>, the number of strands it
carries. At every switch the weights on the two sides add up to the same number, and the weights recover the curve.
Press <kbd>T</kbd> to zip or unzip.</p>
<h4>Braids</h4>
<p>$\\sigma_i$ exchanges the $i$-th and $(i+1)$-st punctures counterclockwise. On $\\pi_1$ it acts by
$x_i \\mapsto x_{i+1}$, $x_{i+1}\\mapsto x_{i+1}^{-1}x_i x_{i+1}$; the tests check the solver against this.
Words like $(\\sigma_1\\sigma_2^{-1})^k$ are pseudo-Anosov: the curve's length grows like $\\lambda^k$ with
$\\lambda = \\frac{3+\\sqrt5}{2}$, and the bands converge to the invariant train track.</p>`);
}

function initMathQuill() {
    const MQ = window.MathQuill?.getInterface?.(2);
    const mk = (id, latex, onEnter, opts = {}) => {
        const el = $(id);
        if (!MQ) {
            const inp = document.createElement('input');
            inp.className = 'text-field';
            inp.value = latex;
            el.replaceWith(inp);
            inp.id = id;
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
            return { latex: v => (v === undefined ? inp.value : (inp.value = v)) };
        }
        const f = MQ.MathField(el, { spaceBehavesLikeTab: false, handlers: { enter: onEnter }, ...opts });
        f.latex(latex);
        el.addEventListener('focusin', () => { f.__focused = true; });
        el.addEventListener('focusout', () => { f.__focused = false; });
        return f;
    };
    state.dynField = mk('dyn-input', '\\left(-5;3\\right)', applyDynInput);
    state.braidField = mk('braid-input', '\\sigma_1\\sigma_2^{-1}', applyBraidInput, { autoCommands: 'sigma' });
    $('dyn-apply').addEventListener('click', applyDynInput);
    $('braid-apply').addEventListener('click', applyBraidInput);
}

function applyBraidInput() {
    try {
        const w = A.parseBraid(state.braidField.latex());
        if (!w.length) return;
        applyBraid(w);
        $('curve-error').textContent = '';
    } catch (e) { flash(e.message); }
}

function applyDynInput() {
    if (busy()) return;
    const n = sim.P.length;
    if (n < 3) { flash('Place at least three punctures first.'); return; }
    let lists = A.parseIntLists(state.dynField.latex());
    let a, b;
    if (lists.length === 2) { [a, b] = lists; }
    else {
        const all = lists[0];
        a = all.slice(0, all.length / 2); b = all.slice(all.length / 2);
    }
    if (a.length !== n - 2 || b.length !== n - 2) {
        flash(`With ${n} punctures there are ${n - 2} numbers on each side of the semicolon.`);
        return;
    }
    if (a.every(v => v === 0) && b.every(v => v === 0)) { flash('All zeros: the empty curve.'); return; }
    pushHistory();
    state.braidLog = [];
    state.preset = null;
    try { setCurveFromCounts(E.countsFromDynnikov(n, a, b)); }
    catch (e) { flash(e.message); return; }
    refreshAnalysis();
    fitView(true);
}

// ------------------------------------------------------------------ start

function start() {
    resize();
    window.addEventListener('resize', () => { resize(); placeLabels(); });
    wirePanel();
    initMathQuill();
    if (readHash()) { fitView(); wake(true); }
    else loadExample(EXAMPLES[0], false);
    // settle the opening picture a little before the first frame
    const t0 = performance.now();
    while (performance.now() - t0 < 250) E.relaxIteration(sim);
    refreshAnalysis();
    fitView();
    requestAnimationFrame(tick);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

// console hook for experiments
window.cb = { sim, state, E, A, applyBraid, refreshAnalysis, fitView };
