// Curves & Twists — state, input, the twist queue and the animation loop.
import { Surface, freeReduce } from './surface.js';
import { Curve } from './curve.js';
import * as TW from './twist.js';
import * as M from './mcg.js';
import { fromDisk, dist, normPoint, mapply, minv } from './hyp.js';
import * as R from './render.js';
import * as UI from './panel.js';
import { TwistMap, dragSamples, dragImage, dragCurve } from './homeo.js';
import { atlasFromData, curveFromPoints, samplePoints } from './atlas.js';
import * as V3 from './view3d.js';

const $ = id => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');

export const state = {
    g: 2, S: null, refs: {}, P: null, auxReady: false,
    curves: [], sel: -1, nextHue: 0, nextName: 1,
    W: 0, H: 0, dpr: 1, view: { cx: 0, cy: 0, r: 1 },
    showRefs: true, showLifts: true, showSides: true, showVerts: false, showAux: false,
    running: true, palette: 'color',
    viewMode: 'both', viewPref: 'both', seeThrough: false, showPolygon3d: true,
    atlas: null, hotTw: null, spinning: false, dirty3d: true,
    anim: null, queue: [], log: [], lastWord: null,
    stroke: null, history: [], future: [],
    dirty: true, message: null, hotRef: null,
    relStatus: {},
};

// ------------------------------------------------------------------ view
function panelSpace() {
    const panel = $('control-panel');
    if (!panel || panel.classList.contains('collapsed') || state.W <= 860) return 0;
    return panel.offsetWidth + 40;          // its width, not its position: it slides in and out
}
// the disk and the surface share the picture area: side by side, or one above the other
export function layout() {
    state.dpr = window.devicePixelRatio || 1;
    state.W = window.innerWidth; state.H = window.innerHeight;
    canvas.width = Math.round(state.W * state.dpr);
    canvas.height = Math.round(state.H * state.dpr);
    // side by side needs room: on a narrow screen "both" shows the disk
    state.viewMode = state.viewPref === 'both' && state.W < 700 ? 'disk' : state.viewPref;
    const fw = state.W - panelSpace(), top = 64, fh = state.H - top - 30;
    let disk = { x: 0, y: top, w: fw, h: fh }, surf = { x: 0, y: 0, w: fw, h: state.H };
    if (state.viewMode === 'both') {
        if (Math.min(fw / 2, fh) >= Math.min(fw, fh / 2)) { disk = { x: 0, y: top, w: fw / 2, h: fh }; surf = { x: fw / 2, y: 0, w: fw / 2, h: state.H }; }
        else { disk = { x: 0, y: top, w: fw, h: fh / 2 }; surf = { x: 0, y: top + fh / 2, w: fw, h: state.H - top - fh / 2 }; }
    }
    state.diskRect = disk;
    state.view = { cx: disk.x + disk.w / 2, cy: disk.y + disk.h / 2, r: Math.max(80, 0.47 * Math.min(disk.w, disk.h)) };
    state.diskOn = state.viewMode !== 'surface';
    state.surfOn = state.viewMode !== 'disk';
    V3.show(state.surfOn);
    if (state.surfOn) { V3.resize({ x: Math.round(surf.x), y: Math.round(surf.y), w: Math.round(surf.w), h: Math.round(surf.h) }); ensureAtlas(); }
    document.documentElement.style.setProperty('--picture-w', `${fw}px`);
    state.dirty = true;
    UI.placeLabels();
    UI.onViewMode?.();
}
const s2d = (sx, sy) => [(sx - state.view.cx) / state.view.r, -(sy - state.view.cy) / state.view.r];
export function setViewMode(m) {
    state.viewPref = m;
    try { localStorage.setItem('curvesAndTwists.view', m); } catch (e) { /* storage off */ }
    layout();
}

// ------------------------------------------------------------------ the map onto the pretzel
// built once per genus in a worker; the first request starts it
const atlases = new Map(), pending = new Map();
let worker = null;
export function ensureAtlas(g = state.g) {
    if (atlases.has(g)) {
        if (g === state.g && state.atlas !== atlases.get(g)) useAtlas(atlases.get(g));
        return Promise.resolve(atlases.get(g));
    }
    if (pending.has(g)) return pending.get(g).promise;
    const job = {};
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    pending.set(g, job);
    if (!worker) {
        worker = new Worker(new URL('./atlasWorker.js', import.meta.url), { type: 'module' });
        worker.onmessage = e => {
            const { g, ok, data, error } = e.data, h = pending.get(g);
            pending.delete(g);
            if (!ok) { h?.reject(new Error(error)); return; }
            const a = atlasFromData(new Surface(g), data);
            atlases.set(g, a);
            if (g === state.g) useAtlas(a);
            h?.resolve(a);
        };
        // a worker that fails to load says so only here: fail everything waiting, start afresh next time
        worker.onerror = e => {
            e.preventDefault?.();
            worker.terminate(); worker = null;
            for (const [, h] of pending) h.reject(new Error('the builder did not load'));
            pending.clear();
        };
    }
    worker.postMessage({ g });
    job.promise.catch(err => flash(`The surface view failed: ${err.message}`, 'failed', 6000));
    return job.promise;
}
function useAtlas(a) {
    // the atlas was built from the same chain words, but on its own copy of the surface
    a.S = state.S;
    state.atlas = a;
    V3.setAtlas(a);
    state.dirty = true;
}

// ------------------------------------------------------------------ status
export function setStatus(html, tone = 'accent') {
    const b = $('status-banner');
    b.classList.remove('accent', 'pending', 'ok', 'warning', 'failed', 'info');
    b.classList.add(tone);
    $('status-headline').innerHTML = html;
}
export function flash(html, tone = 'warning', ms = 3500) {
    state.message = { until: performance.now() + ms };
    setStatus(html, tone);
}
function idleStatus() {
    if (state.message && performance.now() < state.message.until) return;
    state.message = null;
    if (state.anim) {
        setStatus(`${state.anim.kind === 'sym' ? 'Turning by' : 'Twisting'} ${UI.tex(state.anim.item.tex)}${state.queue.length ? ` · ${state.queue.length} to go` : ''}`, 'pending');
        return;
    }
    if (state.surfOn && !state.atlas) { setStatus(`Building the surface of genus ${state.g}…`, 'pending'); return; }
    const moving = state.curves.some(u => !u.curve.converged);
    if (moving && state.running) { setStatus('Pulling tight…', 'pending'); return; }
    const n = state.curves.length;
    setStatus(n ? `Genus ${state.g} · ${n} curve${n > 1 ? 's' : ''}, each a closed geodesic` : `Genus ${state.g}: draw a closed curve`, n ? 'ok' : 'accent');
}

// ------------------------------------------------------------------ genus, curves, history
export function setGenus(g, { record = true, keepCurves = null } = {}) {
    if (record) pushHistory();
    state.g = g;
    state.S = new Surface(g);
    state.refs = {};
    for (const [k, w] of Object.entries(M.chainWords(g))) state.refs[k] = M.curveFromWord(state.S, w);
    state.P = M.presentation(g);
    state.auxReady = false;
    state.showAux = false;
    state.relStatus = {};
    state.curves = keepCurves || [];
    state.sel = state.curves.length ? 0 : -1;
    state.log = [];
    state.atlas = null; state.hotTw = null;
    V3.setAtlas(null);
    UI.onGenus();
    layout();
}

// the auxiliary curves of the presentation (built on demand: they cost a few twists each)
export function ensureAux() {
    if (state.auxReady) return;
    for (const [k, def] of Object.entries(state.P.aux))
        state.refs[k] = def.by ? M.applyTwists(M.parseTwists(def.by), state.refs[def.of], state.refs) : state.refs[def.of];
    state.auxReady = true;
}

export function addCurve(curve, record = true) {
    if (record) pushHistory();
    const u = { curve, hue: R.HUES[state.nextHue++ % R.HUES.length], name: `\\gamma_{${state.nextName++}}` };
    state.curves.push(u);
    state.sel = state.curves.length - 1;
    state.dirty = true;
    UI.refresh();
    return u;
}
export function deleteSelected() {
    if (state.sel < 0 || busy()) return;
    pushHistory();
    state.curves.splice(state.sel, 1);
    state.sel = Math.min(state.sel, state.curves.length - 1);
    state.dirty = true; UI.refresh();
}
export function clearAll() {
    if (busy() || !state.curves.length) return;
    pushHistory();
    state.curves = []; state.sel = -1; state.log = [];
    state.nextName = 1; state.nextHue = 0;
    state.dirty = true; UI.refresh();
}
function select(i) { state.sel = i; state.dirty = true; V3.invalidate(); UI.refresh(); }

const snapshot = () => ({
    g: state.g, sel: state.sel, log: state.log.slice(),
    curves: state.curves.map(u => ({ ...u, curve: u.curve.clone() })),
});
export function pushHistory() {
    if (!state.S) return;
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
    state.future = [];
}
function restore(snap) {
    if (snap.g !== state.g) setGenus(snap.g, { record: false, keepCurves: snap.curves });
    else state.curves = snap.curves;
    state.sel = snap.sel; state.log = snap.log;
    state.dirty = true; UI.refresh();
}
export function undo() {
    if (busy() || !state.history.length) return;
    state.future.push(snapshot());
    restore(state.history.pop());
}
export function redo() {
    if (busy() || !state.future.length) return;
    state.history.push(snapshot());
    restore(state.future.pop());
}
export const busy = () => !!state.anim || state.queue.length > 0;

// ------------------------------------------------------------------ twists and turns
// item = {c: Curve, e: ±1, tex} for a twist, {sym: 'x' | 'y' | 'z', tex} for a turn of the pretzel
function twistDuration() {
    const s = +$('speed').value / 100;
    const base = 1.5 * Math.pow(0.12, s);
    return state.queue.length > 6 ? base * 0.45 : base;
}
export function enqueue(items) {
    state.queue.push(...items);
    if (!state.anim) startNext();
}
export const SYMS = { iota: { axis: 'x', tex: '\\iota' }, rho: { axis: 'z', tex: '\\rho' }, iotarho: { axis: 'y', tex: '\\iota\\rho' } };
// a word in functional order: the rightmost letter acts first
export function applyTwistWord(word, texLabel) {
    if (!state.curves.length) { flash('Draw or add a curve first, then twist it.', 'info'); return; }
    if (word.some(x => !/^c\d+$/.test(x.c) && !/^g\d+$/.test(x.c) && !SYMS[x.c])) ensureAux();
    const items = [];
    for (let i = word.length - 1; i >= 0; i--) {
        const { c, e } = word[i];
        if (SYMS[c]) { items.push({ sym: SYMS[c].axis, tex: SYMS[c].tex }); continue; }
        let curve = state.refs[c];
        if (/^g\d+$/.test(c)) curve = state.curves.find(u => u.name === `\\gamma_{${c.slice(1)}}`)?.curve;
        if (!curve) { flash(`There is no curve ${UI.tex(M.twistTex([{ c, e: 1 }]).replace('T_', ''))}.`); return; }
        items.push({ c: curve, e, tex: M.twistTex([{ c, e }]), name: c });
    }
    pushHistory();
    state.lastWord = { word, tex: texLabel };
    if (texLabel) state.log.push(texLabel);
    enqueue(items);
}
function startNext() {
    const item = state.queue.shift();
    if (!item) { state.anim = null; UI.refresh(); return; }
    for (const u of state.curves) if (!u.curve.converged) u.curve.relax({ maxSteps: 3000 });
    if (item.sym) { startTurn(item); return; }
    const c = item.c;
    if (TW.selfCrossings(c) > 0) { flash('Twists are about simple curves, and this one crosses itself.'); state.queue = []; state.anim = null; return; }
    // the twist as a map of the surface: the collar of c slides around, tearing along c
    const tw = new TwistMap(c, item.e);
    const samples = new Map(), images = new Map(), orig = new Map();
    for (const u of state.curves) {
        if (u.curve === c || u.curve.trivial || TW.sameCurve(u.curve, c) !== 0) continue;
        if (!TW.crossings(u.curve, c).length) continue;
        samples.set(u, dragSamples(u.curve, tw));
        orig.set(u, u.curve);
    }
    state.anim = { kind: 'twist', item, c, tw, phase: 'wind', t: 0, t0: performance.now(), dur: twistDuration() * 1000, samples, images, orig };
    // nothing crosses c: show the collar sliding anyway when the surface is on screen
    if (!samples.size && !state.surfOn) state.anim.phase = 'done';
}
function startTurn(item) {
    state.anim = { kind: 'sym', item, axis: item.sym, phase: 'wait', t: 0, dur: Math.max(900, 1.6 * twistDuration() * 1000), results: new Map() };
    ensureAtlas().catch(() => { state.anim = null; state.queue = []; });
}
function stepAnim(now) {
    const a = state.anim;
    if (a.kind === 'sym') stepTurn(a, now);
    else if (a.phase === 'wind') {
        a.t = Math.min(1, (now - a.t0) / a.dur);
        a.t = a.t < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * a.t) : 1;
        if (state.freezeT != null) a.t = state.freezeT;          // debugging: hold the frame
        if (a.t < 1) for (const [u, smp] of a.samples) a.images.set(u, { pts: dragImage(smp, a.tw, a.t), tear: smp.tear });
        else {
            // the map at t = 1 is the twist: its image of each curve is pulled tight from here
            for (const [u, smp] of a.samples) {
                let y = dragCurve(smp, a.tw);
                if ([...y.W.keys()].some(k => y.edgeLength(k) > 0.6)) y = TW.surgery(a.orig.get(u), a.c, a.item.e);
                y.touch();
                u.curve = y;
            }
            a.images.clear();
            a.phase = 'relax';
            a.relaxStart = now;
        }
    } else if (a.phase === 'relax') relaxStep(a, [...a.samples.keys()]);
    if (a.phase === 'done') {
        if (a.kind === 'twist') checkTwist(a);
        state.anim = null;
        startNext();
        if (!state.anim) UI.refresh();
    }
    state.dirty = true;
}
function relaxStep(a, list) {
    const t0 = performance.now();
    const cap = 0.03 + 0.25 * (+$('speed').value / 100) + (state.queue.length > 6 ? 0.2 : 0);
    let all = true;
    do {
        all = true;
        for (const u of list) if (!u.curve.iterate({ maxCap: cap })) all = false;
    } while (!all && performance.now() - t0 < 12);
    if (all) a.phase = 'done';
}
// the drawn twist must agree with the twist computed by surgery, which the presentation checks use
function checkTwist(a) {
    for (const [u, g0] of a.orig) {
        const ref = TW.twist(g0, a.c, a.item.e);
        if (TW.sameCurve(u.curve, ref) !== 1) { console.warn('twist map and surgery disagree; using surgery'); u.curve = ref; }
    }
}
function stepTurn(a, now) {
    if (a.phase === 'wait') {
        if (!state.atlas) return;
        a.phase = 'rotate'; a.t0 = now;
        state.spinning = true;
        if (!state.surfOn) a.dur = 1;
    }
    if (a.phase === 'rotate') {
        let t = Math.min(1, (now - a.t0) / a.dur);
        t = t < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * t) : 1;
        if (state.freezeT != null) t = state.freezeT;
        V3.spin(a.axis, t);
        if (t >= 1) {
            // the pretzel is back where it was; each curve is now its image under the turn
            const at = state.atlas;
            for (const u of state.curves) {
                if (u.curve.trivial) continue;
                const y = curveFromPoints(state.S, samplePoints(u.curve, 0.03).map(p => at.symmetry(a.axis, p)));
                y.touch();
                u.curve = y;
            }
            state.spinning = false;
            a.phase = 'relax';
        }
    } else if (a.phase === 'relax') relaxStep(a, state.curves);
}

// ------------------------------------------------------------------ drawing
function hitCurve(sx, sy) {
    let best = -1, bd = 9;
    state.curves.forEach((u, i) => {
        const lines = R.curvePolylines(u.curve).concat(state.showLifts ? R.liftPolylines(u.curve, state.S) : []);
        for (const l of lines)
            for (let k = 0; k + 1 < l.length; k++) {
                const ax = state.view.cx + l[k][0] * state.view.r, ay = state.view.cy - l[k][1] * state.view.r;
                const bx = state.view.cx + l[k + 1][0] * state.view.r, by = state.view.cy - l[k + 1][1] * state.view.r;
                const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
                const t = L2 ? Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2)) : 0;
                const d = Math.hypot(ax + t * dx - sx, ay + t * dy - sy);
                if (d < bd) { bd = d; best = i; }
            }
    });
    return best;
}
function pointAt(sx, sy) {
    let [x, y] = s2d(sx, sy);
    const r = Math.hypot(x, y);
    if (r > 0.995) { x *= 0.995 / r; y *= 0.995 / r; }
    return fromDisk(x, y);
}
function onDown(e) {
    if (e.button !== 0 || busy() || !state.diskOn) return;
    const [x, y] = s2d(e.offsetX, e.offsetY);
    if (Math.hypot(x, y) > 1) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const { p, word } = state.S.reduce(pointAt(e.offsetX, e.offsetY));
    state.stroke = { pts: [p], words: [], frame: word, screen: [[e.offsetX, e.offsetY]], moved: 0, start: [e.offsetX, e.offsetY] };
}
function onMove(e) {
    const s = state.stroke;
    if (!s) return;
    const last = s.screen[s.screen.length - 1];
    if (Math.hypot(e.offsetX - last[0], e.offsetY - last[1]) < 3) return;
    s.moved = Math.max(s.moved, Math.hypot(e.offsetX - s.start[0], e.offsetY - s.start[1]));
    const S = state.S;
    const Mf = S.wordMatrix(s.frame);
    const h = pointAt(e.offsetX, e.offsetY);
    const local = Mf ? normPoint(mapply(minv(Mf), h)) : h;
    const { p, word } = S.reduce(local);
    s.pts.push(p); s.words.push(word);
    s.frame = freeReduce(s.frame.concat(word));
    s.screen.push([e.offsetX, e.offsetY]);
    state.dirty = true;
}
function onUp(e) {
    const s = state.stroke;
    if (!s) return;
    state.stroke = null;
    state.dirty = true;
    if (s.moved < 6) { select(hitCurve(e.offsetX, e.offsetY)); return; }
    finishStroke(s);
}
function finishStroke(s) {
    const S = state.S;
    if (s.pts.length < 6) return;
    // close up to the nearest copy of the start
    const last = s.pts[s.pts.length - 1];
    let best = null, bd = Infinity;
    for (const t of S.tiles(2)) {
        const d = dist(last, normPoint(mapply(t.M, s.pts[0])));
        if (d < bd) { bd = d; best = t.word; }
    }
    const c = new Curve(S, s.pts.map(p => p.slice()), s.words.concat([best]).map(w => w.slice()));
    for (let k = 0; k < c.n; k++) c.normalizeEdge(k);
    c.remesh();
    keepStroke(c);
}
// a stroke drawn on the pretzel: points of D, consecutive ones close on the surface
function finishSurfaceStroke(pts) {
    if (busy()) return;
    keepStroke(curveFromPoints(state.S, pts));
}
function keepStroke(c) {
    if (c.length() < 0.1) return;
    const self = TW.selfCrossings(c);
    c.touch();
    addCurve(c);
    if (self) flash('That curve crosses itself, so its geodesic will too. Twisting about it is off.', 'info', 4000);
}

// ------------------------------------------------------------------ loop
function tick(now) {
    if (state.anim) stepAnim(now);
    else if (state.running) {
        const t0 = performance.now();
        let moved = false;
        for (const u of state.curves) {
            if (u.curve.converged) continue;
            moved = true;
            while (!u.curve.iterate({ maxCap: 0.05 }) && performance.now() - t0 < 4);
            if (u.curve.converged) {
                if (u.curve.trivial) {
                    state.curves.splice(state.curves.indexOf(u), 1);
                    state.sel = Math.min(state.sel, state.curves.length - 1);
                    flash('That curve bounds a disk, so it shrank to a point.', 'info');
                }
                UI.refresh();
                break;
            }
        }
        if (moved) state.dirty = true;
    }
    // the collar under the mouse, for the generator buttons
    const hot = state.anim ? null : state.hotRef;
    if (hot && (!state.hotTw || state.hotTw.c !== hot) && state.surfOn) state.hotTw = new TwistMap(hot, 1);
    if (!hot && state.hotTw) state.hotTw = null;
    idleStatus();
    if (state.dirty) {
        state.dirty = false;
        state.dirty3d = true;
        if (state.diskOn) R.draw(ctx, state);
        else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
        UI.placeCurveLabels();
    }
    V3.frame();
    requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ keys, hash, start
function onKey(e) {
    if (e.target.closest && e.target.closest('input, textarea, .mq-editable-field')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'Delete' || k === 'Backspace') { deleteSelected(); e.preventDefault(); }
    else if (k === 'z') undo();
    else if (k === 'Z') redo();
    else if (k === ' ') { UI.toggleSolver(); e.preventDefault(); }
    else if (k === 't' || k === 'T') UI.twistSelected(k === 'T' ? -1 : 1);
    else if (k === 'r') UI.repeat();
    else if (k === 'i') applyTwistWord([{ c: 'iota', e: 1 }], '\\iota');
    else if (k === 'v') setViewMode({ disk: 'both', both: 'surface', surface: 'disk' }[state.viewPref]);
    else if (k === 'Escape') select(-1);
    else if (/^[0-9]$/.test(k) || (e.shiftKey && /^Digit[0-9]$/.test(e.code))) {
        const i = +(e.code?.startsWith('Digit') ? e.code.slice(5) : k);
        if (state.refs['c' + i] && i <= 2 * state.g && !(state.g === 2 && i === 0))
            applyTwistWord([{ c: 'c' + i, e: e.shiftKey ? -1 : 1 }], M.twistTex([{ c: 'c' + i, e: e.shiftKey ? -1 : 1 }]));
    }
}
export function writeHash() {
    const words = state.curves.map(u => u.curve.word().join('.')).join('~');
    history.replaceState(null, '', `#g=${state.g}${words ? '&c=' + words : ''}`);
}
function readHash() {
    const m = /g=(\d)/.exec(location.hash);
    if (!m) return false;
    const g = Math.max(2, Math.min(5, +m[1]));
    setGenus(g, { record: false });
    const c = /c=([-0-9.~]+)/.exec(location.hash);
    if (c) for (const w of c[1].split('~')) {
        const word = w.split('.').map(Number).filter(x => x && Math.abs(x) <= 2 * g);
        if (word.length) addCurve(M.curveFromWord(state.S, word), false);
    }
    return true;
}

function start() {
    try { const v = localStorage.getItem('curvesAndTwists.view'); if (['disk', 'surface', 'both'].includes(v)) state.viewPref = v; } catch (e) { /* storage off */ }
    V3.init($('stage3d'), state, { select, busy, finishSurfaceStroke, tex: s => UI.tex(s) });
    UI.init({ state, setGenus, addCurve, deleteSelected, clearAll, undo, redo, busy, applyTwistWord, ensureAux, flash, writeHash, pushHistory, setViewMode, V3 });
    if (!readHash()) { setGenus(2, { record: false }); UI.loadExample(0, false); }
    layout();
    window.addEventListener('resize', layout);
    document.addEventListener('panel:collapse', () => layout());
    document.addEventListener('themechange', () => { state.dirty = true; });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', () => { state.stroke = null; state.dirty = true; });
    window.addEventListener('keydown', onKey);
    requestAnimationFrame(tick);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

window.ct = { state, M, TW, R, V3, applyTwistWord, setGenus, addCurve, ensureAux, ensureAtlas, setViewMode, Curve };
