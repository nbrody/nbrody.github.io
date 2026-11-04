// panel.js — the control panel: readouts, twist buttons, the presentation and its checks.
// main.js hands its state and actions to init() (importing it here would load a second copy)
let state, setGenus, addCurve, deleteSelected, clearAll, undo, redo, busy, applyTwistWord, ensureAux, flash, writeHash, pushHistory, setViewMode, V3;
import * as M from './mcg.js';
import * as TW from './twist.js';
import * as R from './render.js';
import { toDisk } from './hyp.js';

const $ = id => document.getElementById(id);
export const tex = (s, display = false) => {
    if (!window.katex) return s;
    try { return katex.renderToString(s, { throwOnError: false, displayMode: display }); } catch (e) { return s; }
};
const texify = html => html.replace(/\$\$([^$]+)\$\$/g, (_, m) => tex(m, true)).replace(/\$([^$]+)\$/g, (_, m) => tex(m));
// yield to the page without timer throttling (background tabs clamp setTimeout)
const chan = new MessageChannel();
const nextFrame = () => new Promise(r => { chan.port1.onmessage = () => r(); chan.port2.postMessage(0); });

// ------------------------------------------------------------------ names
const letterTex = L => `${L < 0 ? '\\bar ' : ''}${Math.abs(L) % 2 ? 'a' : 'b'}_{${Math.ceil(Math.abs(L) / 2)}}`;
function wordHtml(w) {
    if (!w.length) return tex('1');
    // the least rotation, so the same curve always reads the same
    let best = w;
    for (let i = 1; i < w.length; i++) {
        const r = w.slice(i).concat(w.slice(0, i));
        if (r.join(',') < best.join(',')) best = r;
    }
    const chunks = [];
    for (let i = 0; i < best.length; i += 12) chunks.push(tex(best.slice(i, i + 12).map(letterTex).join('')));
    return chunks.join('<span class="wsp"> </span>');
}
function homologyTex(w) {
    const v = new Array(2 * state.g).fill(0);
    for (const L of w) v[Math.abs(L) - 1] += Math.sign(L);
    const terms = [];
    v.forEach((m, i) => {
        if (!m) return;
        const name = `${i % 2 ? 'b' : 'a'}_{${(i >> 1) + 1}}`;
        terms.push(`${m < 0 ? '-' : terms.length ? '+' : ''}${Math.abs(m) === 1 ? '' : Math.abs(m)}${name}`);
    });
    return terms.length ? terms.join(' ') : '0';
}
const genNames = () => state.P.gens;

// ------------------------------------------------------------------ init
export function init(api) {
    ({ state, setGenus, addCurve, deleteSelected, clearAll, undo, redo, busy, applyTwistWord, ensureAux, flash, writeHash, pushHistory, setViewMode, V3 } = api);
    document.querySelectorAll('#view-switch .seg-opt, #view-mode .seg-opt').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.v)));
    $('t-see').addEventListener('click', () => {
        state.seeThrough = !state.seeThrough;
        $('t-see').classList.toggle('active', state.seeThrough);
        V3.setSeeThrough();
    });
    $('t-poly3d').addEventListener('click', () => {
        state.showPolygon3d = !state.showPolygon3d;
        $('t-poly3d').classList.toggle('active', state.showPolygon3d);
        V3.invalidate();
    });
    $('draw3d').addEventListener('click', () => {
        const on = !$('draw3d').classList.contains('active');
        $('draw3d').classList.toggle('active', on);
        V3.setDrawMode(on);
    });
    $('reset3d').addEventListener('click', () => V3.resetCamera());
    for (const [id, c, t] of [['turn-x', 'iota', '\\iota'], ['turn-z', 'rho', '\\rho'], ['turn-y', 'iotarho', '\\iota\\rho']]) {
        $(id).innerHTML = tex(t);
        $(id).addEventListener('click', () => applyTwistWord([{ c, e: 1 }], t));
    }
    document.querySelectorAll('#genus .seg-opt').forEach(b => b.addEventListener('click', () => {
        if (busy() || +b.dataset.g === state.g) return;
        setGenus(+b.dataset.g);
        loadExample(0, false);
    }));
    $('delete-curve').addEventListener('click', deleteSelected);
    $('clear-all').addEventListener('click', clearAll);
    $('undo-btn').addEventListener('click', undo);
    $('redo-btn').addEventListener('click', redo);
    $('copy-link').addEventListener('click', async () => {
        writeHash();
        try { await navigator.clipboard.writeText(location.href); flash('Link copied.', 'ok', 1800); }
        catch (e) { flash('Copy the address bar to share these curves.', 'info', 2500); }
    });
    $('tw-sel').addEventListener('click', () => twistSelected(1));
    $('tw-sel-inv').addEventListener('click', () => twistSelected(-1));
    $('repeat-btn').addEventListener('click', repeat);
    const speedUI = () => { $('speed-val').textContent = `${(1.5 * Math.pow(0.12, +$('speed').value / 100)).toFixed(2)} s`; };
    $('speed').addEventListener('input', speedUI); speedUI();
    const toggle = (id, key, after) => $(id).addEventListener('click', () => {
        state[key] = !state[key];
        $(id).classList.toggle('active', state[key]);
        after?.(); state.dirty = true;
    });
    toggle('t-refs', 'showRefs', placeLabels);
    toggle('t-lifts', 'showLifts');
    toggle('t-sides', 'showSides', placeLabels);
    toggle('t-verts', 'showVerts');
    $('t-solver').addEventListener('click', toggleSolver);
    document.querySelectorAll('#palette .seg-opt').forEach(b => b.addEventListener('click', () => {
        state.palette = b.dataset.p;
        document.querySelectorAll('#palette .seg-opt').forEach(o => o.classList.toggle('active', o === b));
        state.dirty = true;
    }));
    $('svg-btn').addEventListener('click', () => {
        const blob = new Blob([R.svgOf(state)], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `curves-genus-${state.g}.svg`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('check-all').addEventListener('click', () => runChecks(state.P.rel.map((_, i) => i)));
    $('show-aux').addEventListener('click', async () => {
        if (state.g === 2) return;
        if (!state.auxReady) { flash('Building the auxiliary curves…', 'pending', 800); await nextFrame(); ensureAux(); }
        state.showAux = !state.showAux;
        $('show-aux').classList.toggle('active', state.showAux);
        placeLabels(); state.dirty = true;
    });
    initMathQuill();
    writeTexts();
}

export function onViewMode() {
    for (const b of document.querySelectorAll('#view-switch .seg-opt, #view-mode .seg-opt')) b.classList.toggle('active', b.dataset.v === state.viewPref);
    $('stage-hint').innerHTML = state.viewMode === 'surface'
        ? '<b>Drag</b> to turn the surface · <b>click</b> a curve to select it · switch on <b>Draw on the surface</b> to draw'
        : state.viewMode === 'disk'
            ? '<b>Drag</b> to draw a closed curve (crossing a side brings you back in through its partner) · <b>click</b> a curve to select it'
            : '<b>Drag</b> in the disk to draw a closed curve · <b>drag</b> the surface to turn it · <b>click</b> a curve to select it';
}
export function toggleSolver() {
    state.running = !state.running;
    $('t-solver').classList.toggle('active', state.running);
}
export function twistSelected(e) {
    const u = state.curves[state.sel];
    if (!u) { flash('Select a curve to twist about: click it.', 'info'); return; }
    if (state.curves.length < 2) { flash('Twisting about this curve moves the other curves; add another curve first.', 'info'); return; }
    if (TW.selfCrossings(u.curve)) { flash('Twists are about simple curves, and this one crosses itself.'); return; }
    const k = u.name.match(/\d+/)[0];
    applyTwistWord([{ c: 'g' + k, e }], `T_{${u.name}}${e < 0 ? '^{-1}' : ''}`);
}
export function repeat() {
    if (!state.lastWord || busy()) return;
    applyTwistWord(state.lastWord.word, state.lastWord.tex);
}

// ------------------------------------------------------------------ genus-dependent parts
export function onGenus() {
    document.querySelectorAll('#genus .seg-opt').forEach(o => o.classList.toggle('active', +o.dataset.g === state.g));
    $('show-aux').classList.remove('active');
    $('show-aux').style.display = state.g === 2 ? 'none' : '';
    renderExamples();
    renderGenerators();
    renderRelations();
    $('curves-subtitle').innerHTML = texify(`A closed surface of genus ${state.g}, cut open into the regular hyperbolic ` +
        `${4 * state.g}-gon whose sides are glued in matching colors. Every curve is pulled tight to the unique closed geodesic in its class.`);
    refresh();
}

const EXAMPLES = [
    { name: 'Two curves', sub: '$a_1$ and $b_1$, meeting once', build: () => [state.refs.c1.clone(), state.refs.c2.clone()] },
    { name: 'Around a handle', sub: 'a separating curve', build: () => [M.curveFromWord(state.S, [1, 2, -1, -2])] },
    {
        name: 'Penner', sub: 'image of $c_3$ under $T_1T_3T_5T_2^{-1}T_4^{-1}$',
        build: () => [M.applyTwists(M.parseTwists('1 3 5 -2 -4'), state.refs.c3, state.refs)],
    },
    { name: 'Blank', sub: 'draw your own', build: () => [] },
];
function renderExamples() {
    const ex = $('examples');
    ex.innerHTML = '';
    EXAMPLES.forEach((e, i) => {
        const b = document.createElement('button');
        b.className = 'example-btn';
        b.innerHTML = `${e.name}<small>${texify(e.sub)}</small>`;
        b.addEventListener('click', () => loadExample(i));
        ex.appendChild(b);
    });
}
export function loadExample(i, record = true) {
    if (busy()) return;
    if (record) pushHistory();
    state.curves = []; state.sel = -1; state.log = [];
    state.nextName = 1; state.nextHue = 0;
    for (const c of EXAMPLES[i].build()) addCurve(c, false);
    state.sel = state.curves.length ? 0 : -1;
    refresh();
    state.dirty = true;
}

function renderGenerators() {
    const grid = $('gen-grid');
    grid.innerHTML = '';
    for (const name of genNames()) {
        const i = name.slice(1);
        for (const e of [1, -1]) {
            const b = document.createElement('button');
            b.className = 'gen-btn';
            b.innerHTML = tex(`T_{${i}}${e < 0 ? '^{-1}' : ''}`);
            b.title = `${e > 0 ? 'Left' : 'Right'} twist about c${i} (${e > 0 ? '' : 'Shift-'}${i})`;
            b.addEventListener('click', () => applyTwistWord([{ c: name, e }], M.twistTex([{ c: name, e }])));
            b.addEventListener('mouseenter', () => { state.hotRef = state.refs[name]; state.dirty = true; });
            b.addEventListener('mouseleave', () => { state.hotRef = null; state.dirty = true; });
            grid.appendChild(b);
        }
    }
    const g = state.g;
    $('gen-hint').innerHTML = texify(g === 2
        ? 'The chain $c_1,\\dots,c_5$: consecutive curves meet once, the others are disjoint. Keys 1–5 twist, Shift for inverses.'
        : `The Humphries curves: the chain $c_1,\\dots,c_{${2 * g}}$ and $c_0$, which meets only $c_4$. Keys 0–9 twist, Shift for inverses.`);
}

// ------------------------------------------------------------------ readouts
export function refresh() {
    if (!state.S) return;
    const list = $('curve-list');
    list.innerHTML = '';
    if (!state.curves.length) list.innerHTML = '<div class="curve-empty">No curves yet: drag in the disk to draw one, or draw on the surface.</div>';
    state.curves.forEach((u, i) => {
        const row = document.createElement('div');
        row.className = 'curve-row' + (i === state.sel ? ' selected' : '');
        const L = u.curve.length();
        const simple = u.curve.converged ? (TW.selfCrossings(u.curve) ? 'not simple' : '') : 'settling';
        row.innerHTML = `<span class="swatch" style="background:${state.palette === 'ink' ? 'var(--curve-ink)' : u.hue}"></span>${tex(u.name)}` +
            `<span class="meta">${tex(`\\ell = ${L.toFixed(3)}`)}${simple ? ' · ' + simple : ''}</span>`;
        row.addEventListener('click', () => { state.sel = i; refresh(); state.dirty = true; });
        list.appendChild(row);
    });
    $('curve-chip').textContent = state.curves.length ? `${state.curves.length} curve${state.curves.length > 1 ? 's' : ''}` : '—';
    const u = state.curves[state.sel];
    if (!u) {
        $('sel-readout').innerHTML = '—'; $('word-readout').innerHTML = '—'; $('int-readout').innerHTML = '—';
    } else {
        const c = u.curve, w = c.word();
        const self = TW.selfCrossings(c);
        const hom = homologyTex(w);
        $('sel-key').innerHTML = `Selected curve ${tex(u.name)}`;
        $('sel-readout').innerHTML = texify(`$\\ell(${u.name}) = ${c.length().toFixed(6)}$` +
            `<br>$[${u.name}] = ${hom}$ in $H_1(S_${state.g})$, so it is ${hom === '0' ? '<b>separating</b>' : 'nonseparating'}` +
            `${self ? `<br>it crosses itself ${self} time${self > 1 ? 's' : ''}` : ''}`);
        $('word-readout').innerHTML = wordHtml(w);
        const ints = genNames().map(n => `i(${u.name}, c_{${n.slice(1)}}) = ${TW.intersectionNumber(c, state.refs[n])}`);
        const others = state.curves.filter(v => v !== u).map(v => `i(${u.name}, ${v.name}) = ${TW.intersectionNumber(c, v.curve)}`);
        const rows = [];
        for (let k = 0; k < ints.length; k += 2) rows.push(ints.slice(k, k + 2).join(',\\quad '));
        if (others.length) rows.push(others.join(',\\quad '));
        $('int-readout').innerHTML = rows.map(r => `<span class="word-line">${tex(r)}</span>`).join('');
    }
    $('tw-sel').disabled = $('tw-sel-inv').disabled = !u || state.curves.length < 2;
    $('twist-log').innerHTML = state.log.length ? tex(state.log.slice(-12).join('\\;')) + (state.log.length > 12 ? ' …' : '') : '—';
    $('solver-readout').innerHTML = u ? [
        ['vertices', u.curve.n], ['length', u.curve.length().toFixed(9)],
        ['max curvature', u.curve.converged ? '< 1e-9' : (u.curve.kappa ?? 0).toExponential(1)],
    ].map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('') : '';
}

// ------------------------------------------------------------------ labels over the picture
export function placeLabels() {
    const ov = $('overlay');
    if (!ov || !state.S) return;
    ov.innerHTML = '';
    if (!state.diskOn) return;
    const { S, view } = state;
    const put = (cls, html, d) => {
        const el = document.createElement('div');
        el.className = cls; el.innerHTML = html;
        el.style.left = `${view.cx + d[0] * view.r}px`; el.style.top = `${view.cy - d[1] * view.r}px`;
        ov.appendChild(el);
    };
    if (state.showSides) {
        const rm = Math.tanh(S.rm / 2);
        for (let i = 0; i < S.n; i++) {
            const t = S.theta[i], r = rm - 0.055;
            put('s-label', tex(letterTex(S.sideLetter[i])), [r * Math.cos(t), r * Math.sin(t)]);
        }
    }
    const placed = [];
    const names = Object.keys(state.refs).filter(k => (/^c\d+$/.test(k) ? state.showRefs && !(state.g === 2 && k === 'c0') : state.showAux));
    for (const k of names) {
        const c = state.refs[k];
        // label at a vertex well inside the polygon and away from the labels placed so far
        let best = null, bs = -Infinity;
        for (let j = 0; j < c.n; j += 2) {
            const p = c.P[j], d = toDisk(p);
            let depth = Infinity;
            for (const nrm of S.normals) depth = Math.min(depth, -(p[0] * nrm[0] + p[1] * nrm[1] - p[2] * nrm[2]));
            if (depth < 0.12) continue;
            let away = 1;
            for (const q of placed) away = Math.min(away, Math.hypot(d[0] - q[0], d[1] - q[1]));
            const score = away - 0.15 * Math.hypot(d[0], d[1]);
            if (score > bs) { bs = score; best = p; }
        }
        if (!best) continue;
        placed.push(toDisk(best));
        const lab = /^c\d+$/.test(k) ? `c_{${k.slice(1)}}` : k.replace(/^([a-z])(\d+)$/, '$1_{$2}');
        put('c-label', tex(lab), toDisk(best));
    }
}
export function placeCurveLabels() { }

// ------------------------------------------------------------------ the presentation
function relationGroups() {
    const P = state.P, groups = [];
    const braid = P.rel.map((r, i) => i).filter(i => P.rel[i].kind === 'braid');
    const disj = P.rel.map((r, i) => i).filter(i => P.rel[i].kind === 'disjoint');
    const pairs = idx => idx.map(i => P.rel[i].lhs.split(' ').slice(0, 2).map(x => `c_{${x}}`).join('')).join(',\\ ');
    groups.push({ key: 'disjoint', name: 'Disjointness', idx: disj, tex: 'T_iT_j = T_jT_i',
        note: `when $c_i \\cap c_j = \\varnothing$ (${disj.length} relations).` });
    groups.push({ key: 'braid', name: 'Braid relations', idx: braid, tex: 'T_iT_jT_i = T_jT_iT_j',
        note: `when $c_i$ and $c_j$ meet once: $${pairs(braid)}$.` });
    P.rel.forEach((r, i) => {
        if (r.kind === 'braid' || r.kind === 'disjoint') return;
        const notes = {
            chain: state.g === 2 ? 'The chain relation for a chain of five curves.'
                : '$b_0$ is the other boundary curve of a neighborhood of $c_1\\cup c_2\\cup c_3$; $c_0$ is the first.',
            lantern: '$c_1, c_3, c_5, b_3$ bound a sphere with four holes, and $c_0, b_1, b_2$ lie inside it.',
            hyper: state.g === 2 ? 'This is the hyperelliptic involution $\\iota$, which reverses every curve of the chain.'
                : `$d = c_{${2 * state.g + 1}}$ is the last curve of the chain $c_1,\\dots,c_{${2 * state.g + 1}}$. The relation says the hyperelliptic involution commutes with $T_d$.`,
        };
        groups.push({ key: 'r' + i, name: r.name, idx: [i], tex: r.tex, note: notes[r.kind], animate: true });
    });
    return groups;
}
function renderRelations() {
    const g = state.g;
    $('pres-title').innerHTML = texify(`A presentation of $\\mathrm{Mod}(S_${g})$`);
    $('pres-subtitle').innerHTML = texify(g === 2
        ? 'Birman and Hilden (1973): the Dehn twists $T_1,\\dots,T_5$ about the chain curves generate, subject to these relations.'
        : `Wajnryb (1983): the Dehn twists $T_0,\\dots,T_{${2 * g}}$ about the Humphries curves generate, subject to these relations.`);
    const box = $('relations');
    box.innerHTML = '';
    for (const grp of relationGroups()) {
        const card = document.createElement('div');
        card.className = 'rel-card';
        card.dataset.key = grp.key;
        card.innerHTML = `<div class="rel-head">${grp.name}<span class="badge" data-badge></span></div>
<div class="rel-tex">${tex(grp.tex, true)}</div><div class="rel-note">${texify(grp.note)}</div>
<div class="rel-actions"><button class="toggle-btn" data-check>Check</button>${grp.animate ? '<button class="toggle-btn" data-anim title="Apply the left side, then the inverse of the right side, to your curves: they come back where they started">Animate</button>' : ''}</div>`;
        card.querySelector('[data-check]').addEventListener('click', () => runChecks(grp.idx, grp.key));
        card.querySelector('[data-anim]')?.addEventListener('click', () => animateRelation(grp.idx[0]));
        box.appendChild(card);
    }
    if (g > 2) {
        const card = document.createElement('div');
        card.className = 'rel-card';
        card.innerHTML = `<div class="rel-head">Auxiliary curves</div><div class="aux-list">${texify(
            'For a curve $x = f(c)$, the twist is $T_x = f\\,T_c\\,f^{-1}$. ' +
            '$$b_0 = (T_4T_3T_2T_1^2T_2T_3T_4)(c_0)$$ $$b_1 = (T_4T_5T_3T_4)^{-1}(c_0), \\quad b_2 = (T_2T_3T_1T_2)^{-1}(b_1)$$' +
            'are Wajnryb\'s. The meridians $a_1 = c_1$, $a_2 = c_0$ and $$a_{k+1} = (T_{a_k}T_{2k}T_{2k+1}T_{2k+2})^{-1}\\,\\Delta(a_{k-1}, c_{2k-2}, \\dots, c_{2k+2})\\,(a_k)$$ ' +
            'shift one handle at a time, where $\\Delta(x_1,\\dots,x_6) = (T_{x_1}\\cdots T_{x_6})(T_{x_1}\\cdots T_{x_5})\\cdots T_{x_1}$ is the half twist of a chain. ' +
            `Then $b_3 = a_3$ and $d = a_${g}$. Wajnryb writes these last two twists with different words; the curves are the same.`)}</div>`;
        box.appendChild(card);
    }
    $('pres-progress').textContent = '';
    renderBadges();
}
function renderBadges() {
    for (const grp of relationGroups()) {
        const el = document.querySelector(`.rel-card[data-key="${grp.key}"] [data-badge]`);
        if (!el) continue;
        const st = grp.idx.map(i => state.relStatus[i]);
        el.className = 'badge';
        if (st.some(s => s === 'failed')) { el.textContent = 'fails'; el.classList.add('failed'); }
        else if (st.some(s => s === 'pending')) { el.textContent = 'checking…'; el.classList.add('pending'); }
        else if (st.every(s => s === 'ok')) { el.textContent = 'verified'; el.classList.add('ok'); }
        else el.textContent = '';
    }
}
async function runChecks(idx) {
    if (state.checking) return;
    state.checking = true;
    const P = state.P;
    if (P.rel.some((r, i) => idx.includes(i) && r.kind !== 'braid' && r.kind !== 'disjoint') || idx.length > 1) {
        if (!state.auxReady && state.g > 2) { $('pres-progress').textContent = 'Building the auxiliary curves…'; await nextFrame(); ensureAux(); }
    }
    for (const i of idx) state.relStatus[i] = 'pending';
    renderBadges();
    const tests = P.gens;
    const t0 = performance.now();
    let done = 0;
    for (const i of idx) {
        const r = P.rel[i];
        let ok = true;
        for (const t of tests) {
            const v = M.verify(r, state.refs, [t]);
            if (!v.ok) ok = false;
            done++;
            if (performance.now() - t0 > 30) {
                $('pres-progress').textContent = `Checking… ${Math.round(100 * done / (idx.length * tests.length))}%`;
                await nextFrame();
            }
        }
        state.relStatus[i] = ok ? 'ok' : 'failed';
        renderBadges();
    }
    const okAll = idx.every(i => state.relStatus[i] === 'ok');
    $('pres-progress').innerHTML = texify(okAll
        ? `Both sides agree on every oriented curve $${tests.map(n => `c_{${n.slice(1)}}`).join(', ')}$ (${((performance.now() - t0) / 1000).toFixed(1)} s).`
        : 'Some relation failed: the two sides send a test curve to different curves.');
    state.checking = false;
}
function animateRelation(i) {
    if (busy()) return;
    if (!state.curves.length) { flash('Draw or add a curve first: the animation moves your curves and brings them back.', 'info'); return; }
    const r = state.P.rel[i];
    const word = r.L.concat(M.invert(r.R));
    applyTwistWord(word, `(${r.tex.split('=')[0].trim()})${r.R.length ? `(${r.tex.split('=')[1].trim()})^{-1}` : ''}`);
    flash(`Applying ${word.length} twists; at the end every curve is back where it started.`, 'pending', 2500);
}

// ------------------------------------------------------------------ inputs
function initMathQuill() {
    const MQ = window.MathQuill?.getInterface?.(2);
    const mk = (id, latex, onEnter, opts = {}) => {
        const el = $(id);
        if (!MQ) {
            const inp = document.createElement('input');
            inp.className = 'text-field'; inp.value = latex; inp.id = id;
            el.replaceWith(inp);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
            return { latex: v => (v === undefined ? inp.value : (inp.value = v)) };
        }
        const f = MQ.MathField(el, { spaceBehavesLikeTab: false, handlers: { enter: onEnter }, ...opts });
        f.latex(latex);
        return f;
    };
    state.wordField = mk('word-input', 'a_1b_2', addWordCurve, { autoCommands: 'bar' });
    state.twistField = mk('twist-input', 'T_1T_2^{-1}', applyTwistInput, { autoCommands: 'gamma iota rho' });
    $('word-apply').addEventListener('click', addWordCurve);
    $('twist-apply').addEventListener('click', applyTwistInput);
}
const clean = s => s.replace(/\\left|\\right|\\ |\\,|\\;|\s+/g, '').replace(/\\cdot/g, '');
// a word in a_k, b_k (bars or ^{-1} for inverses, powers, parentheses) → letters
export function parseWord(latex, g) {
    const s = clean(latex);
    let i = 0;
    const num = () => { const m = /^\{?(-?\d+)\}?/.exec(s.slice(i)); if (!m) throw new Error('expected a number'); i += m[0].length; return +m[1]; };
    function seq() {
        const out = [];
        while (i < s.length && s[i] !== ')') {
            let item, bar = false;
            if (s[i] === '(') { i++; item = seq(); if (s[i] !== ')') throw new Error('unbalanced parentheses'); i++; }
            else {
                if (s.startsWith('\\bar', i) || s.startsWith('\\overline', i)) { bar = true; i += s.startsWith('\\bar', i) ? 4 : 9; if (s[i] === '{') i++; }
                const ch = s[i++];
                if (ch !== 'a' && ch !== 'b') throw new Error(`unexpected “${ch}”`);
                let closed = false;
                if (bar && s[i] === '}') { i++; closed = true; }      // \bar{b}_1
                if (s[i] === '_') i++;
                const k = num();
                if (bar && !closed && s[i] === '}') i++;               // \bar{b_1}
                if (k < 1 || k > g) throw new Error(`the handles are numbered 1 to ${g}`);
                item = [(2 * k - (ch === 'a' ? 1 : 0)) * (bar ? -1 : 1)];
            }
            if (s[i] === '^') { i++; const p = num(); let base = p < 0 ? item.slice().reverse().map(x => -x) : item; item = []; for (let r = 0; r < Math.abs(p); r++) item.push(...base); }
            out.push(...item);
        }
        return out;
    }
    const w = seq();
    if (i < s.length) throw new Error('unbalanced parentheses');
    return w;
}
function addWordCurve() {
    if (busy()) return;
    let w;
    try { w = parseWord(state.wordField.latex(), state.g); }
    catch (e) { $('word-hint').textContent = e.message; return; }
    if (!w.length) { $('word-hint').textContent = 'That word is trivial.'; return; }
    const c = M.curveFromWord(state.S, w);
    if (c.trivial) { $('word-hint').textContent = 'That word is trivial in the surface group.'; return; }
    $('word-hint').innerHTML = TW.selfCrossings(c) ? 'Added; it is not simple, so you cannot twist about it.' : '';
    addCurve(c);
}
// T_i, T_{b_0}, T_d, T_{\gamma_k}, powers and parentheses → a twist word
export function parseTwistInput(latex) {
    const s = clean(latex);
    let i = 0;
    const num = () => { const m = /^\{?(-?\d+)\}?/.exec(s.slice(i)); if (!m) throw new Error('expected a power'); i += m[0].length; return +m[1]; };
    function name() {
        if (s[i] === '_') i++;
        let body;
        if (s[i] === '{') { const j = s.indexOf('}', i); let depth = 0, k = i; for (; k < s.length; k++) { if (s[k] === '{') depth++; if (s[k] === '}' && --depth === 0) break; } body = s.slice(i + 1, k); i = k + 1; }
        else body = s[i++];
        body = body.replace(/[{}]/g, '');
        let m;
        if ((m = /^\\gamma_?(\d+)$/.exec(body))) return 'g' + m[1];
        if ((m = /^(\d+)$/.exec(body))) return 'c' + m[1];
        if ((m = /^([ab])_?(\d+)$/.exec(body))) return m[1] + m[2];
        if (body === 'd') return 'd';
        throw new Error(`unknown twist T_${body}`);
    }
    function seq() {
        const out = [];
        while (i < s.length && s[i] !== ')') {
            let item;
            if (s[i] === '(') { i++; item = seq(); if (s[i] !== ')') throw new Error('unbalanced parentheses'); i++; }
            else if (s.startsWith('\\iota\\rho', i)) { i += 9; item = [{ c: 'iotarho', e: 1 }]; }
            else if (s.startsWith('\\iota', i)) { i += 5; item = [{ c: 'iota', e: 1 }]; }
            else if (s.startsWith('\\rho', i)) { i += 4; item = [{ c: 'rho', e: 1 }]; }
            else if (s[i] === 'T') { i++; item = [{ c: name(), e: 1 }]; }
            else throw new Error(`unexpected “${s[i]}”`);
            if (s[i] === '^') { i++; const p = num(); const base = p < 0 ? M.invert(item) : item; item = []; for (let r = 0; r < Math.abs(p); r++) item.push(...base); }
            out.push(...item);
        }
        return out;
    }
    const w = seq();
    if (i < s.length) throw new Error('unbalanced parentheses');
    return w;
}
function applyTwistInput() {
    if (busy()) return;
    let w;
    try { w = parseTwistInput(state.twistField.latex()); }
    catch (e) { flash(e.message); return; }
    if (!w.length) return;
    for (const x of w) if (/^c\d+$/.test(x.c) && !genNames().includes(x.c)) { flash(`There is no generator ${tex('T_{' + x.c.slice(1) + '}')} in genus ${state.g}.`); return; }
    applyTwistWord(w, state.twistField.latex().replace(/\\left|\\right/g, ''));
}

// ------------------------------------------------------------------ prose
function writeTexts() {
    $('word-hint').innerHTML = texify('Type $a_1b_2$, with $a_1^{-1}$ or \\bar for inverses. The letter $a_k$ crosses the side marked $a_k$, outward.');
    $('twist-subtitle').innerHTML = texify('$T_c$ is the <b>left</b> Dehn twist about $c$: a curve crossing $c$ turns left onto it, goes once around, and carries on. ' +
        'Words act right to left, so $T_1T_2$ means $T_2$ first.');
    $('twist-explain').innerHTML = texify('A Dehn twist is a map of the surface: cut along $c$, turn one side a full turn, and glue back. ' +
        'The animation does exactly that to a collar around $c$. Its two halves slide around $c$ in opposite directions (watch the stripes), so the surface tears along $c$ while they slide, ' +
        'and after a full turn the edges match again. Curves crossing $c$ are carried along; then the solver pulls them tight. ' +
        'Twists about the curve you select move all the other curves.');
    $('turn-hint').innerHTML = texify('The pretzel has three symmetries by a half turn, and each is a mapping class. $\\iota$, about the axis through the holes, is the hyperelliptic involution: it reverses every chain curve $c_1, \\dots, c_{2g+1}$. $\\rho$ swaps the two ends, taking $c_i$ to $c_{2g+2-i}$. Each moves your curves as a map of the surface; then they are pulled tight.');
    $('pres-explain').innerHTML = texify('<p>A mapping class is determined by what it does to the oriented curves $c_i$ (the Alexander method: they fill the surface and meet in a tree-like pattern). ' +
        'So to check $L = R$, the app applies both sides to each $c_i$, pulls the results tight, and compares the geodesics, with their orientations. ' +
        'Orientation matters: the hyperelliptic involution fixes every $c_i$ but reverses it.</p>' +
        '<p>A geodesic is pinned down by its length and one point and direction on it, which the solver gets to about $10^{-9}$.</p>');
    $('solver-explain').innerHTML = texify(`
<p><b>The surface.</b> The regular hyperbolic $4g$-gon with interior angles $2\\pi/4g$ has center-to-side distance $r$ with $\\cosh r = \\cot(\\pi/4g)$. Gluing side $4k$ to $4k+2$ and $4k+1$ to $4k+3$ by isometries gives a closed hyperbolic surface; all $4g$ corners become one point with total angle $2\\pi$. The faint tiles are copies of the polygon in the hyperbolic plane, its universal cover.</p>
<p><b>Curves.</b> A curve is a closed polygon whose vertices sit in the polygon. Each edge remembers which copy of the polygon its far end is in, so every computation involves only a vertex and its two neighbors, and long curves lose no precision.</p>
<p><b>The flow.</b> Each step moves the curve by $\\psi$ along its normal, where $(-\\partial_s^2 + 1)\\psi = \\kappa$. This is Newton's method for length: $\\int \\psi'^2 + \\psi^2$ is the second variation of length on a surface of curvature $-1$. While the curve still has corners, each vertex is first moved to the midpoint of its neighbors (Birkhoff's curve shortening). The curve stays in its homotopy class, and in a closed hyperbolic surface that class has exactly one geodesic.</p>`);
    $('help-body').innerHTML = texify(`
<p>A closed surface of genus $g \\ge 2$ carries hyperbolic metrics, and each one gives every essential closed curve a unique <b>geodesic</b> representative. Here the surface is the regular $4g$-gon with its sides glued in pairs (matching colors), and every curve you draw is pulled tight to its geodesic.</p>
<h4>Drawing</h4>
<ul>
<li><b>Drag</b> inside the disk to draw a closed curve. When you cross a side of the polygon you keep drawing in the neighboring copy, and the curve comes back in through the partner side. Letting go closes the curve to the nearest copy of its start.</li>
<li><b>Click</b> a curve to select it. Its length, word, homology class and intersection numbers are on the Curves tab.</li>
<li>Or type a word in $\\pi_1(S_g)$; the letters $a_k, b_k$ are the loops through the sides with those labels.</li>
</ul>
<h4>The surface</h4>
<p>The <b>Surface</b> view shows the same surface in space, as a pretzel, with every curve on it. The chain $c_1, \\dots, c_{2g+1}$ is the standard one: circles around the tubes and around the holes. Drag to turn it; switch on <b>Draw on the surface</b> to draw there. The colored loops are the polygon's sides: glued up, they are $2g$ loops through a single point.</p>
<p>The picture comes from a map from the hyperbolic surface to the pretzel. The chain cuts both into two disks (the front and back halves of the pretzel), and each hyperbolic piece is laid onto its half by a harmonic embedding, so the chain geodesics land exactly on the pretzel's chain.</p>
<h4>Dehn twists</h4>
<p>The <b>left Dehn twist</b> $T_c$ about a simple closed curve $c$ cuts the surface along $c$ and reglues it after a full turn. Twists about the <b>Humphries curves</b> $c_0, \\dots, c_{2g}$ generate the mapping class group $\\mathrm{Mod}(S_g)$, the group of homeomorphisms up to isotopy. You can also twist about any simple curve you have drawn.</p>
<h4>The presentation</h4>
<p>The Presentation tab lists Birman and Hilden's presentation of $\\mathrm{Mod}(S_2)$, and Wajnryb's for $g \\ge 3$, as in Farb and Margalit's <i>Primer</i>. <b>Check</b> verifies a relation by applying both sides to the oriented Humphries curves. <b>Animate</b> applies the relator to your own curves; they travel and come back.</p>
<h4>Keys</h4>
<p><kbd>0</kbd>–<kbd>9</kbd> twist about $c_i$, with Shift for inverses · <kbd>T</kbd> twists about the selected curve · <kbd>I</kbd> turns the pretzel by $\\iota$ · <kbd>R</kbd> repeats · <kbd>V</kbd> switches the picture · <kbd>Z</kbd>/<kbd>Shift-Z</kbd> undo and redo · <kbd>Delete</kbd> deletes the selected curve · <kbd>Space</kbd> pauses the solver.</p>`);
}

