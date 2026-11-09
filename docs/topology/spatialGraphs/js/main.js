// main.js — wires the engine, the picture and the panel together.

import { buildGraph, parseText, graphToText, TEXT_HELP, mulberry32 } from './model.js';
import { Relaxer, DEFAULT_PARAMS } from './engine.js';
import { detectSymmetry, symmetrizeField } from './symmetry.js';
import { View, PALETTES } from './render.js';
import { DiagramEditor } from './editor.js';
import { EXAMPLES, findExample } from './examples.js';
import { graphInvariants } from './invariants.js';
import { Poly } from './polynomials.js';

const $ = id => document.getElementById(id);
const store = {
    get(k, d) { try { const v = localStorage.getItem('spatialGraphs.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('spatialGraphs.' + k, v); } catch (e) { /* private mode */ } },
};

const STYLES = {
    balanced: { range: 0.25, bend: 0.2, junction: 0.25, equal: 8 },
    round: { range: 0, bend: 0.08, junction: 0.15, equal: 6 },
    elastic: { range: 0.2, bend: 1.0, junction: 0.25, equal: 8 },
    tight: { range: 0.85, bend: 0.12, junction: 0.2, equal: 6 },
};

const S = {
    g: null, relaxer: null, view: null, editor: null,
    params: { ...DEFAULT_PARAMS, ...STYLES.balanced },
    beadsPerEdge: 18,
    running: true, mode: 'relax', modeSteps: 0, field: null,
    sym: null, symAt: 0, settledSince: 0, autoPaused: false,
    name: '', desc: '', exampleId: null,
    grab: null, rng: mulberry32(7),
    its: 0, itsT: performance.now(), rate: 0,
    showSym: false,
};

// ============================================================ loading

function loadSpec(spec, { name, desc = '', exampleId = null, keepView = false } = {}) {
    let g;
    try {
        const m = (spec.edges?.length || 0) + (spec.circles?.length || 0);
        const circles = spec.circles?.length || 0;
        const total = Math.max(64, Math.min(320, Math.round(S.beadsPerEdge * Math.max(1, m - circles))) + Math.min(240, 5 * S.beadsPerEdge * circles));
        g = buildGraph(spec, { totalBeads: total });
    } catch (e) {
        showError(e.message);
        return false;
    }
    showError('');
    S.g = g;
    S.relaxer = new Relaxer(g, S.params);
    S.name = name || spec.name || 'Untitled';
    S.desc = desc;
    S.exampleId = exampleId;
    S.sym = null;
    S.symAt = 0;
    S.settledSince = 0;
    S.autoPaused = false;
    S.mode = 'relax';
    S.view.setGraph(g);
    S.view.update(g, S.relaxer.clearance(g.x));
    if (!keepView) S.view.frame(g);
    setRunning(true);
    S.view.showSymmetry(null, false);
    renderSummary();
    renderSym();
    hideInspector();
    S.inv0 = null; S.inv = null; S.hl = null;
    S.view.highlight(null);
    setTimeout(() => updateInvariants(true), 30);
    return true;
}

// ============================================================ invariants

// ---- invariants readout

const tex = (s, display = false) => (window.katex ? window.katex.renderToString(s, { throwOnError: false, displayMode: display }) : s);
const knotTeX = n => (n === 'unknot' ? '0_1' : n.replace(/#/g, '\\mathbin{\\#}'));
const knotHTML = n => (n === 'unknot' ? 'unknot' : n.replace(/(\d+)_(\d+)/g, '$1<sub>$2</sub>').replace(/#/g, ' # '));
const polyTeX = (p, v, den = 1) => (p ? Poly.tex(p, v, den) : null);

/** Equal wherever both were computed (a polynomial past the time budget is null). */
function sameInv(a, b) {
    if (a.cycles.length !== b.cycles.length || a.links.length !== b.links.length) return false;
    const eqP = (p, q) => !p || !q || Poly.eq(p, q);
    for (let i = 0; i < a.cycles.length; i++) {
        const c = a.cycles[i], d = b.cycles[i];
        if (c.det !== d.det || !eqP(c.alex, d.alex) || !eqP(c.jones, d.jones)) return false;
    }
    for (let i = 0; i < a.links.length; i++) {
        const l = a.links[i], m = b.links[i];
        if (l.i !== m.i || l.j !== m.j || Math.abs(l.lk) !== Math.abs(m.lk)) return false;
    }
    // Yamada's R is an isotopy invariant (up to (−A)^k) only for max degree ≤ 3
    if (a.graph.maxDegree <= 3 && !eqP(a.graph.yamada, b.graph.yamada)) return false;
    return eqP(a.graph.linkJones, b.graph.linkJones);
}

function updateInvariants(initial = false) {
    if (!S.g) return;
    const inv = graphInvariants(S.g, 1200);
    S.inv = inv;
    if (initial || !S.inv0) S.inv0 = inv;
    renderInvariants();
}

/** Δ, V and a line about chirality for one cycle. */
function knotDetail(c) {
    const rows = [];
    const alex = polyTeX(c.alex, 't'), V = polyTeX(c.jones, 't', 2);
    rows.push(`<div class="inv-poly"><span class="inv-pk">${tex('\\Delta(t)')}</span><span class="inv-pv">${alex ? tex(alex) : `<span class="label-hint">too many crossings (${c.n})</span>`}</span></div>`);
    rows.push(`<div class="inv-poly"><span class="inv-pk">${tex('V(t)')}</span><span class="inv-pv">${V ? tex(V) : `<span class="label-hint">${c.n != null ? `too many crossings (${c.n})` : 'not computed (time budget)'}</span>`}</span></div>`);
    rows.push(`<div class="inv-poly"><span class="inv-pk">${tex('\\det')}</span><span class="inv-pv">${tex(String(c.det))}</span></div>`);
    let note = '';
    if (c.name && c.name !== 'unknot' && !c.name.startsWith('knotted')) {
        note = `Its Alexander polynomial is that of ${tex(knotTeX(c.name))}, the only knot with at most 7 crossings that has it`;
        if (c.name.includes('#')) note = `Its Alexander polynomial factors as that of ${tex(knotTeX(c.name))}`;
        if (c.chiral === true) {
            const hand = /^(3_1|5_1|7_1)$/.test(c.name) && c.jones ? (Poly.hi(c.jones) > 0 ? ', right-handed' : ', left-handed') : '';
            note += `; ${tex('V(t) \\ne V(t^{-1})')}, so it is chiral${hand}.`;
        } else if (c.chiral === false) note += `; ${tex('V(t) = V(t^{-1})')}.`;
        else note += '.';
    } else if (c.name === 'unknot') {
        note = c.n != null && c.n < 3 ? 'Fewer than three crossings in this projection: unknotted.' : `${tex('\\Delta = V = 1')}, as for the unknot (no proof it is one).`;
    } else if (c.trivialAlex) {
        note = `${tex('\\Delta = 1')} but ${tex('V \\ne 1')}: certainly knotted.`;
    } else if (c.alex && !Poly.eq(c.alex, Poly.mono(0))) {
        note = 'Knotted, but not a knot with at most 7 crossings (or a sum of two).';
    }
    return rows.join('') + (note ? `<p class="inv-line inv-note">${note}</p>` : '');
}

function cycleLabel(c) {
    if (c.name === 'unknot') return 'unknot';
    if (c.name && !c.name.startsWith('knotted')) return c.name;
    if (c.trivialAlex) return 'knotted, Δ = 1';
    return c.det === 1 && !c.alex ? 'det 1' : (c.alex ? 'knotted' : `det ${c.det}`);
}

function renderInvariants() {
    const inv = S.inv, el = $('inv-readout'), st = $('inv-status');
    if (!inv) return;
    const same = sameInv(inv, S.inv0);
    st.textContent = inv === S.inv0 ? '' : same ? 'unchanged since the start ✓' : 'changed!';
    st.className = `inv-status ${inv === S.inv0 ? '' : same ? 'ok' : 'bad'}`;
    const k = S.g.counts();
    const isKnot = k.circles === 1 && k.arcs === 0;
    const nC = inv.cycles.length;
    let html = '';
    if (isKnot) {
        const c = inv.cycles[0];
        const nm = cycleLabel(c);
        html += `<p class="inv-line">Knot type <b>${knotHTML(nm)}</b>${c.n != null ? ` · ${c.n} crossings seen` : ''}</p>`;
        html += knotDetail(c);
    } else if (nC) {
        const groups = new Map();
        inv.cycles.forEach((c, i) => { const key = cycleLabel(c); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); });
        const knotted = inv.cycles.filter(c => c.det !== 1 || (c.name && c.name !== 'unknot') || c.trivialAlex).length;
        html += `<p class="inv-line"><b>${nC}${inv.capped ? '+' : ''}</b> cycle${nC === 1 ? '' : 's'}; ${knotted ? `<b>${knotted}</b> knotted` : 'none knotted as far as Δ, V see'}. Click a type for its polynomials.</p>`;
        const order = [...groups.entries()].sort((a, b) => (a[0] === 'unknot') - (b[0] === 'unknot') || b[1].length - a[1].length);
        html += `<div class="inv-chips">${order.map(([key, list]) =>
            `<button class="sym-chip ${key !== 'unknot' ? 'knotted' : ''}" data-cycles="${list.join(',')}" data-detail="${list[0]}" title="${list.length} cycle${list.length === 1 ? '' : 's'}: ${key}">${knotHTML(key)} × ${list.length}</button>`).join('')}</div>`;
        html += '<div id="inv-detail"></div>';
    }
    if (inv.pairs) {
        const linked = inv.links.length;
        const sumAbs = inv.links.reduce((s, l) => s + Math.abs(l.lk), 0);
        html += `<p class="inv-line"><b>${inv.pairs}</b> pair${inv.pairs === 1 ? '' : 's'} of disjoint cycles; ${linked ? `<b>${linked}</b> linked (${tex('\\sum|\\mathrm{lk}|')} = ${sumAbs})` : 'none linked'}.</p>`;
        if (linked) html += `<div class="inv-chips">${inv.links.slice(0, 12).map(l => `<button class="sym-chip" data-cycles="${l.i},${l.j}" title="Highlight this pair">lk ${l.lk > 0 ? '+' : '−'}${Math.abs(l.lk)}</button>`).join('')}${linked > 12 ? `<span class="label-hint">…${linked - 12} more</span>` : ''}</div>`;
    }
    const G = inv.graph || {};
    if (G.linkJones) {
        html += `<div class="inv-poly"><span class="inv-pk">${tex('V_L(t)')}</span><span class="inv-pv">${tex(Poly.tex(G.linkJones, 't', 2))}</span></div>`;
    }
    if (!isKnot && G.yamadaCrossings != null) {
        const R = G.yamada;
        html += `<div class="inv-poly"><span class="inv-pk">${tex('R(A)')}</span><span class="inv-pv">${R
            ? tex(Poly.tex(R, 'A'))
            : `<span class="label-hint">${G.yamadaCrossings} crossings in the best view: too many</span>`}</span></div>`;
        const notes = [`Yamada polynomial, up to ${tex('(-A)^k')}`];
        if (R && !R.c.length) notes.push('it vanishes, as it does when a cut edge joins two pieces that can be pulled apart');
        if (G.maxDegree > 3) notes.push('with a vertex of degree > 3 it is an invariant of rigid-vertex graphs only');
        html += `<p class="inv-line inv-note">${notes.join('; ')}.</p>`;
    }
    if (!html) html = '<p class="label-hint">No cycles.</p>';
    el.innerHTML = html;
    el.querySelectorAll('[data-cycles]').forEach(b => b.addEventListener('click', () => {
        const key = b.dataset.cycles;
        const det = $('inv-detail');
        if (S.hl === key) {
            S.hl = null; S.view.highlight(null); b.classList.remove('on');
            if (det) det.innerHTML = '';
            return;
        }
        S.hl = key;
        el.querySelectorAll('[data-cycles]').forEach(c => c.classList.toggle('on', c === b));
        const set = new Set();
        for (const ci of key.split(',').map(Number)) for (const [e] of inv.cycles[ci].edges) set.add(e);
        S.view.highlight(set, S.g);
        if (det && b.dataset.detail != null) det.innerHTML = knotDetail(inv.cycles[+b.dataset.detail]);
    }));
    // keep the selection across re-renders
    if (S.hl) {
        const b = [...el.querySelectorAll('[data-cycles]')].find(c => c.dataset.cycles === S.hl);
        if (b) {
            b.classList.add('on');
            const det = $('inv-detail');
            if (det && b.dataset.detail != null) det.innerHTML = knotDetail(inv.cycles[+b.dataset.detail]);
        } else { S.hl = null; S.view.highlight(null); }
    }
}

function loadExample(id) {
    const ex = findExample(id);
    if (!ex) return;
    if (loadSpec(ex.spec(), { name: ex.name, desc: ex.desc, exampleId: id })) {
        history.replaceState(null, '', `${location.pathname}?ex=${id}`);
    }
}

/** Rebuild the current shape at a new resolution (positions kept). */
function rebuildAtResolution() {
    const g = S.g;
    const spec = {
        name: S.name, dense: true,
        vertices: g.vertexNodes.map((n, v) => ({ id: g.vertexNames[v], pos: [g.x[3 * n], g.x[3 * n + 1], g.x[3 * n + 2]] })),
        edges: [], circles: [],
    };
    for (const e of g.edges) {
        const pts = e.nodes.map(n => [g.x[3 * n], g.x[3 * n + 1], g.x[3 * n + 2]]);
        if (e.circle) spec.circles.push({ way: pts.slice(0, -1) });
        else spec.edges.push({ a: g.vertexNames[e.a], b: g.vertexNames[e.b], way: pts.slice(1, -1) });
    }
    loadSpec(spec, { name: S.name, desc: S.desc, exampleId: S.exampleId, keepView: true });
}

// ============================================================ modes

function setRunning(on) {
    S.running = on;
    if (on) S.autoPaused = false;
    for (const el of [$('play-btn'), $('pill-play')]) el.classList.toggle('paused', !on);
    $('pill-play-label').textContent = on ? 'Pause' : 'Relax';
    $('play-btn').title = on ? 'Pause (Space)' : 'Relax (Space)';
}

function setMode(mode) {
    S.mode = mode;
    S.modeSteps = 0;
    $('pill-scramble').classList.toggle('on', mode === 'scramble');
    $('pill-sym').classList.toggle('on', mode === 'symmetrize');
    $('pill-explore').classList.toggle('on', mode === 'explore');
    if (mode !== 'explore') S.explore = null;
    if (mode === 'relax') { S.relaxer.history = []; S.relaxer.settled = false; S.settledSince = 0; }
}

function scramble() {
    if (!S.g) return;
    S.relaxer.release();
    S.field = S.relaxer.makeSwirls(S.rng);
    setMode('scramble');
    setRunning(true);
}

function symmetrize() {
    if (!S.g) return;
    const sym = detectSymmetry(S.g, { tol: 0.06 });
    if (sym.group.order <= 1) {
        setBanner('warning', 'No symmetry close enough to snap to yet. Let it settle first.');
        return;
    }
    S.sym = sym;
    S.field = symmetrizeField(S.g, sym, 0.5);
    setMode('symmetrize');
    setRunning(true);
}

/** Basin hopping: kick, settle, keep the lowest energy; restore the best at the end. */
function explore(trials = 8) {
    if (!S.g) return;
    S.relaxer.release();
    const E = S.relaxer.cache?.E ?? S.relaxer.energy(S.g.x, new Float64Array(3 * S.g.N)).E;
    S.explore = { trial: 0, trials, phase: 'kick', steps: 0, best: S.g.clone(), bestE: E, startE: E, improved: 0 };
    setMode('explore');
    setRunning(true);
}

function restoreGraph(c) {
    const g = S.g;
    g.N = c.N; g.x = c.x.slice(); g.kind = c.kind.slice();
    g.edges = c.edges.map(e => ({ ...e, nodes: e.nodes.slice() }));
    g.vertexNodes = c.vertexNodes.slice();
    g.rebuild();
    S.relaxer.invalidate();
    S.relaxer.history = [];
}

function exploreStep() {
    const X = S.explore, r = S.relaxer;
    if (X.phase === 'kick') {
        if (X.steps % 40 === 0) S.field = r.makeSwirls(S.rng, 4);
        r.pushStep(S.field);
        if (++X.steps >= 80) { X.phase = 'relax'; X.steps = 0; r.history = []; r.settled = false; r.tau = 0; }
        return;
    }
    r.step();
    X.steps++;
    if (!((r.settled && X.steps > 300) || X.steps > 3000)) return;
    const E = r.cache?.E ?? Infinity;
    if (E < X.bestE * (1 - 2e-3)) { X.best = S.g.clone(); X.bestE = E; X.improved++; }
    X.trial++;
    if (X.trial < X.trials) { X.phase = 'kick'; X.steps = 0; return; }
    restoreGraph(X.best);
    S.sym = detectSymmetry(S.g);
    renderSym();
    if (S.showSym) S.view.showSymmetry(S.sym, true);
    updateInvariants();
    const msg = X.improved
        ? `Explored ${X.trials} basins: energy ${X.startE.toFixed(2)} → <b>${X.bestE.toFixed(2)}</b>. ${symSentence(S.sym)}`
        : `Explored ${X.trials} basins: none lower than ${X.startE.toFixed(2)}. ${symSentence(S.sym)}`;
    S.explore = null;
    setMode('relax');
    setRunning(false);
    setBanner('verified', msg);
}

function stepOnce() {
    const r = S.relaxer;
    if (S.mode === 'explore') { exploreStep(); return; }
    if (S.mode === 'relax') {
        r.step();
    } else if (S.mode === 'scramble') {
        if (S.modeSteps > 0 && S.modeSteps % 45 === 0) S.field = r.makeSwirls(S.rng);
        r.pushStep(S.field);
        if (++S.modeSteps >= 240) { setMode('relax'); updateInvariants(); }
    } else if (S.mode === 'symmetrize') {
        r.pushStep(S.field);
        S.modeSteps++;
        if (S.modeSteps % 20 === 0) {
            const sym = detectSymmetry(S.g, { tol: 0.06 });
            if (sym.group.order > 1) { S.sym = sym; S.field = symmetrizeField(S.g, sym, 0.5); }
        }
        if (S.modeSteps >= 100) {
            S.sym = detectSymmetry(S.g);
            renderSym();
            setMode('relax');
            setRunning(false);
            setBanner('verified', `Symmetrized: ${groupHTML(S.sym.group.name)}, order ${ordStr(S.sym.group.order)}. Press Relax to let it go again.`);
        }
    }
}

// ============================================================ the frame loop

function frame() {
    requestAnimationFrame(frame);
    frameBody(performance.now());
}

function frameBody(now) {
    if (S.g && S.running) {
        const t0 = performance.now();
        const budget = S.grab ? 9 : 13;
        while (performance.now() - t0 < budget) {
            stepOnce();
            S.its++;
            if (S.mode === 'relax' && S.relaxer.settled && !S.relaxer.grabbed) break;
            if (!S.running) break;
        }
        handleSettling(now);
    }
    if (S.g) {
        const base = 0.03 * S.g.totalLength() / Math.sqrt(S.g.edges.length) * S.view.radiusScale;
        S.view.update(S.g, S.relaxer.clearance(S.g.x, 2.2 * base));
        S.view.follow(S.g);
    }
    if (now - (S.uiAt || 0) > 250) { S.uiAt = now; renderLive(now); }
    S.view.render();
}

function handleSettling(now) {
    const r = S.relaxer;
    if (S.mode !== 'relax' || r.grabbed) { S.settledSince = 0; return; }
    if (now - S.symAt > 1500) {
        S.symAt = now;
        S.sym = detectSymmetry(S.g);
        renderSym();
        if (S.showSym) S.view.showSymmetry(S.sym, true);
    }
    if (r.settled) {
        if (!S.settledSince) {
            S.settledSince = now;
            updateInvariants();
            S.sym = detectSymmetry(S.g);
            renderSym();
            if (S.showSym) S.view.showSymmetry(S.sym, true);
        } else if (now - S.settledSince > 5000) {
            setRunning(false);
            S.autoPaused = true;
        }
    } else S.settledSince = 0;
}

// ============================================================ readouts

const ordStr = n => (n === Infinity ? '∞' : String(n));

function groupHTML(name) {
    const m = name.match(/^([A-Z])(.*)$/);
    return m && m[2] ? `${m[1]}<sub>${m[2]}</sub>` : name;
}

function setBanner(kind, html) {
    const b = $('status-banner');
    b.className = `status-banner ${kind}${b.classList.contains('collapsed') ? ' collapsed' : ''}`;
    const t = b.querySelector('.status-banner-text');
    if (t.innerHTML !== html) t.innerHTML = html;
}

function showError(msg) { $('graph-error').textContent = msg; if (msg) setBanner('failed', msg); }

function renderLive(now) {
    const r = S.relaxer;
    if (!r) return;
    const dt = (now - S.itsT) / 1000;
    if (dt > 0.6) { S.rate = S.its / dt; S.its = 0; S.itsT = now; }
    const E = r.cache?.E;
    if (S.grab && S.grab.moved) setBanner('pending', 'Pulling — the strand pushes others aside; nothing passes through anything.');
    else if (S.mode === 'scramble') setBanner('warning', 'Scrambling: twisting the space around the graph. It is an isotopy, so the graph’s type is unchanged.');
    else if (S.mode === 'symmetrize') setBanner('pending', `Symmetrizing over ${groupHTML(S.sym?.group.name || '')}…`);
    else if (S.mode === 'explore' && S.explore) setBanner('pending', `Exploring: basin ${S.explore.trial + 1} of ${S.explore.trials} (${S.explore.phase === 'kick' ? 'kicking' : 'settling'}) · lowest energy so far <b>${S.explore.bestE.toFixed(2)}</b>`);
    else if (!S.running) {
        const g = S.sym?.group;
        if (S.autoPaused && g) setBanner('verified', `<b>Settled.</b> ${symSentence(S.sym)} <span style="opacity:.7">Explore looks for a lower minimum.</span>`);
        else setBanner('', `Paused${g ? ` · ${groupHTML(g.name)}` : ''}. Press Relax (Space) to continue.`);
    } else if (r.settled) setBanner('verified', `<b>Settled.</b> ${S.sym ? symSentence(S.sym) : ''} <span style="opacity:.7">Explore looks for a lower minimum.</span>`);
    else setBanner('pending', `Relaxing${E !== undefined ? ` · energy <b>${E.toFixed(2)}</b>` : ''}${S.sym && S.sym.group.order > 1 ? ` · currently ${groupHTML(S.sym.group.name)}` : ''}`);
    renderEnergy();
    if (!$('diagram-card').hidden) $('diagram-stats').textContent = statsLine();
}

function symSentence(sym) {
    const g = sym.group;
    if (g.order === 1) return 'No rigid symmetry.';
    let s = `Rigid symmetry ${groupHTML(g.name)} (order ${ordStr(g.order)}${g.chiral ? ', rotations only' : ''})`;
    if (sym.autCount && sym.realized) s += sym.realized === sym.autCount ? `: all ${sym.autCount} graph automorphisms are realized.` : `: ${sym.realized} of ${sym.autCount} graph automorphisms realized.`;
    else s += '.';
    return s;
}

const PART_COLORS = { tp: '#818cf8', bend: '#22d3ee', junction: '#fbbf24', equal: '#f472b6', spacing: '#5e6880', contact: '#fb7185' };
const PART_NAMES = { tp: 'repulsion', bend: 'bending', junction: 'junctions', equal: 'edge lengths', spacing: 'spacing', contact: 'contact' };

function renderEnergy() {
    const r = S.relaxer, c = r.cache;
    const el = $('energy-readout');
    if (!c) return;
    const parts = Object.entries(c.parts).filter(([, v]) => v > 1e-9);
    const tot = parts.reduce((s, [, v]) => s + v, 0) || 1;
    const probe = 6 * r.meanSeg;
    const clear = r.clearance(S.g.x, probe);
    el.innerHTML = `
        <div class="energy-bar">${parts.map(([k, v]) => `<i style="width:${(100 * v / tot).toFixed(2)}%;background:${PART_COLORS[k]}"></i>`).join('')}</div>
        <div class="energy-legend">${parts.map(([k, v]) => `<span><i style="background:${PART_COLORS[k]}"></i>${PART_NAMES[k]} ${v.toFixed(2)}</span>`).join('')}</div>
        <div style="margin-top:8px">
        <div class="inv-row"><span class="inv-key">Total</span><span class="inv-val">${c.E.toFixed(3)}</span></div>
        <div class="inv-row"><span class="inv-key">Clearance</span><span class="inv-val">${clear >= probe ? '≥ ' : ''}${(clear / S.g.totalLength()).toExponential(2)} <span class="dim">× length</span></span></div>
        <div class="inv-row"><span class="inv-key">Beads</span><span class="inv-val">${S.g.N} <span class="dim">· ${S.g.S} segments</span></span></div>
        <div class="inv-row"><span class="inv-key">Steps</span><span class="inv-val">${r.it.toLocaleString()} <span class="dim">· ${S.running ? Math.round(S.rate) + '/s' : 'paused'}</span></span></div>
        </div>`;
}

function renderSummary() {
    const k = S.g.counts();
    $('graph-name').textContent = S.name;
    $('graph-desc').textContent = S.desc;
    $('graph-desc').style.display = S.desc ? '' : 'none';
    const cells = [['Vertices', k.V], ['Edges', k.arcs], ['Circles', k.circles], ['β₁', k.betti]];
    $('graph-summary').innerHTML = cells.map(([n, v]) => `<div><b>${v}</b><span>${n}</span></div>`).join('');
    $('graph-summary').title = `${k.components} component${k.components === 1 ? '' : 's'}; degrees ${k.degrees.join(', ') || '—'}`;
}

function renderSym() {
    const el = $('sym-readout');
    const sym = S.sym;
    if (!sym) { el.innerHTML = '<p class="label-hint">Detected as the shape settles.</p>'; return; }
    const g = sym.group;
    const chips = [];
    const axes = new Map();
    let mirrors = 0, inv = false;
    const rotos = new Map();
    for (const e of sym.elements) {
        if (e.kind === 'rotation') {
            const key = e.axis.map(v => Math.round(Math.abs(v) * 50)).join(',');
            const prev = axes.get(key);
            if (!prev || prev.order < e.order) axes.set(key, { order: e.order, axis: e.axis });
        } else if (e.kind === 'mirror') mirrors++;
        else if (e.kind === 'inversion') inv = true;
        else if (e.kind === 'rotoreflection') rotos.set(e.order, (rotos.get(e.order) || 0) + 1);
    }
    const byOrder = new Map();
    for (const a of axes.values()) { if (!byOrder.has(a.order)) byOrder.set(a.order, []); byOrder.get(a.order).push(a.axis); }
    [...byOrder.entries()].sort((a, b) => b[0] - a[0]).forEach(([n, list]) => {
        list.forEach((ax, i) => chips.push(`<button class="sym-chip" data-axis="${ax.join(',')}" title="Look down this axis">C<sub>${n || '?'}</sub>${list.length > 1 ? ` ${i + 1}` : ''}</button>`));
    });
    if (mirrors) chips.push(`<span class="sym-chip" title="Mirror planes">σ × ${mirrors}</span>`);
    if (inv) chips.push('<span class="sym-chip" title="Inversion through the centre">i</span>');
    for (const [n, c] of rotos) if (n > 2) chips.push(`<span class="sym-chip" title="Rotoreflections">S<sub>${n}</sub> × ${c}</span>`);
    const worst = Math.max(...sym.elements.map(e => e.rms || 0)) / sym.Rg;
    el.innerHTML = `
        <div class="sym-name">${groupHTML(g.name)}</div>
        <div class="sym-line">order ${ordStr(g.order)}${g.chiral ? ' · chiral picture (no reflections)' : ''}${sym.autCount ? ` · ${sym.realized} of ${sym.autCount} automorphisms realized` : ''}${g.order > 1 ? ` · fit ${(100 * worst).toFixed(2)}% of size` : ''}</div>
        ${chips.length ? `<div class="sym-chips">${chips.join('')}</div>` : ''}`;
    el.querySelectorAll('[data-axis]').forEach(b => b.addEventListener('click', () => S.view.lookAlong(b.dataset.axis.split(',').map(Number))));
}

function statsLine() {
    const s = S.editor.stats();
    return `${s.vertices} vert${s.vertices === 1 ? 'ex' : 'ices'} · ${s.strands} strand${s.strands === 1 ? '' : 's'} · ${s.crossings} crossing${s.crossings === 1 ? '' : 's'}`;
}

// ============================================================ inspector

function nearestNode(edge, p) {
    const g = S.g;
    let best = -1, bd = Infinity;
    for (const n of g.edges[edge].nodes) {
        const d = (g.x[3 * n] - p[0]) ** 2 + (g.x[3 * n + 1] - p[1]) ** 2 + (g.x[3 * n + 2] - p[2]) ** 2;
        if (d < bd) { bd = d; best = n; }
    }
    return best;
}

function inspect(hit) {
    const g = S.g, el = $('inspector');
    if (hit.vertex !== undefined) {
        const v = hit.vertex, n = g.vertexNodes[v], o = 3 * n;
        const U = g.stars[v].map(q => { const d = [0, 1, 2].map(c => g.x[3 * q + c] - g.x[o + c]); const l = Math.hypot(...d); return d.map(c => c / l); });
        const angs = [];
        for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) angs.push(Math.acos(Math.max(-1, Math.min(1, U[i][0] * U[j][0] + U[i][1] * U[j][1] + U[i][2] * U[j][2]))) * 180 / Math.PI);
        const ideal = { 2: 180, 3: 120, 4: 109.47 }[U.length];
        el.innerHTML = `<div class="fi-key">Vertex</div>
            <div class="fi-big">${g.vertexNames[v]} <span style="font-size:13px;color:var(--ink-dim);font-weight:500">· degree ${U.length}</span></div>
            ${angs.length ? `<div class="fi-line">angles between its edges: ${angs.map(a => a.toFixed(1) + '°').join(', ')}</div>` : ''}
            ${ideal ? `<div class="fi-line">evenly spread would be ${ideal}°${U.length === 3 ? ', in a plane' : ''}</div>` : ''}
            <div class="fi-hint">Drag to pull it.</div>`;
    } else if (hit.edge !== undefined) {
        const e = g.edges[hit.edge];
        const L = g.edgeLength(hit.edge), Lbar = g.totalLength() / g.edges.length;
        const col = S.view.color(hit.edge);
        el.innerHTML = `<div class="fi-key">${e.circle ? 'Circle' : 'Edge'}</div>
            <div class="fi-big"><i style="background:${col}"></i>${e.circle ? e.name : `${g.vertexNames[e.a]} → ${g.vertexNames[e.b]}`}</div>
            <div class="fi-line">length ${L.toFixed(3)} · ${(L / Lbar).toFixed(2)} × the mean</div>
            <div class="fi-line">${e.nodes.length - 1} segments</div>
            <div class="fi-hint">Drag to pull it.</div>`;
    }
    el.hidden = false;
}

function hideInspector() { $('inspector').hidden = true; }

// ============================================================ pointer: grab and pull

function bindPointer() {
    const box = $('viz-container');
    const view = S.view;
    box.addEventListener('pointerdown', ev => {
        if (ev.button !== 0 || !S.g) return;
        const hit = view.pick(ev.clientX, ev.clientY);
        if (!hit) { hideInspector(); return; }
        view.controls.enabled = false;
        const node = hit.vertex !== undefined ? S.g.vertexNodes[hit.vertex] : nearestNode(hit.edge, hit.point);
        S.grab = { node, hit, plane: hit.point, x: ev.clientX, y: ev.clientY, moved: false, wasRunning: S.running };
        box.classList.add('grabbing');
        try { box.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic or finished pointer */ }
    }, true);
    window.addEventListener('pointermove', ev => {
        if (S.grab) {
            if (!S.grab.moved && Math.hypot(ev.clientX - S.grab.x, ev.clientY - S.grab.y) > 4) {
                S.grab.moved = true;
                hideInspector();
                if (S.mode !== 'relax') setMode('relax');
                setRunning(true);
            }
            if (S.grab.moved) {
                const t = view.pointOnPlane(ev.clientX, ev.clientY, S.grab.plane);
                if (t) S.relaxer.grab(S.relaxer.grabbed ? S.relaxer.grabbed.node : S.grab.node, t);
            }
            return;
        }
        if (ev.target.tagName === 'CANVAS' && ev.target.parentElement === box && !ev.buttons) {
            const now = performance.now();
            if (now - (S.hoverAt || 0) > 60) {
                S.hoverAt = now;
                box.classList.toggle('can-grab', !!view.pick(ev.clientX, ev.clientY));
            }
        }
    });
    const end = () => {
        if (!S.grab) return;
        if (!S.grab.moved) inspect(S.grab.hit);
        else S.relaxer.release();
        S.grab = null;
        view.controls.enabled = true;
        box.classList.remove('grabbing');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
}

// ============================================================ panel plumbing

function sliderButton(id, { min, max, value, step = 0.01, format = v => v.toFixed(2), onChange }) {
    const btn = $(id);
    let v = value, pointerId = null, startX = 0, startV = 0, moved = false;
    const out = document.createElement('span');
    out.className = 'slider-value';
    btn.appendChild(out);
    btn.setAttribute('role', 'slider');
    btn.setAttribute('aria-valuemin', String(min));
    btn.setAttribute('aria-valuemax', String(max));
    const show = () => {
        btn.style.setProperty('--fill', `${(100 * (v - min)) / (max - min)}%`);
        out.textContent = format(v);
        btn.setAttribute('aria-valuenow', String(v));
    };
    const set = (nv, ended) => {
        v = Math.max(min, Math.min(max, Math.round(nv / step) * step));
        show();
        onChange(v, ended);
    };
    show();
    btn.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.button !== 0) return;
        pointerId = e.pointerId; startX = e.clientX; startV = v; moved = false;
        btn.setPointerCapture(pointerId);
        btn.classList.add('dragging');
        btn.focus();
    });
    btn.addEventListener('pointermove', e => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 3) moved = true;
        if (moved) set(startV + (dx / Math.max(1, btn.offsetWidth)) * (max - min), false);
    });
    const end = e => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        btn.classList.remove('dragging');
        if (moved) set(v, true);
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('keydown', e => {
        const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        set(v + d * (max - min) / 40, true);
    });
    return { set: nv => { v = nv; show(); }, get: () => v };
}

function bindPanel() {
    // tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${btn.dataset.tab}`));
    }));
    // collapse
    const panel = $('control-panel');
    const updateSpace = () => {
        const px = panel.classList.contains('collapsed') ? 0 : panel.offsetWidth + 40;
        document.documentElement.style.setProperty('--panel-space', `${px}px`);
        S.view.setPanelSpace(px);
    };
    $('collapse-btn').addEventListener('click', () => { panel.classList.toggle('collapsed'); setTimeout(updateSpace, 0); });
    if (window.innerWidth < 760) panel.classList.add('collapsed');      // phones: the picture first
    updateSpace();
    window.addEventListener('resize', updateSpace);
    // banner collapse
    const banner = $('status-banner');
    banner.querySelector('.status-banner-close').addEventListener('click', e => { e.stopPropagation(); banner.classList.add('collapsed'); });
    banner.addEventListener('click', () => banner.classList.remove('collapsed'));
    // play
    const toggle = () => { if (!S.g) return; if (S.mode !== 'relax') setMode('relax'); setRunning(!S.running); if (S.running) { S.relaxer.settled = false; S.relaxer.history = []; S.settledSince = 0; } };
    $('play-btn').addEventListener('click', toggle);
    $('pill-play').addEventListener('click', toggle);
    $('pill-scramble').addEventListener('click', scramble);
    $('pill-sym').addEventListener('click', symmetrize);
    $('pill-explore').addEventListener('click', () => (S.mode === 'explore' ? (restoreGraph(S.explore.best), setMode('relax')) : explore()));
    $('explore-btn').addEventListener('click', () => explore());
    $('symmetrize-btn').addEventListener('click', symmetrize);
    $('detect-btn').addEventListener('click', () => { S.sym = detectSymmetry(S.g); renderSym(); if (S.showSym) S.view.showSymmetry(S.sym, true); });
    // theme
    const setTheme = t => {
        document.documentElement.classList.toggle('light', t === 'light');
        S.view.setTheme(t);
        S.editor.theme = t; S.editor.draw();
        document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.theme === t));
        $('theme-btn').title = t === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        store.set('theme', t);
        if (S.showSym) S.view.showSymmetry(S.sym, true);
    };
    $('theme-btn').addEventListener('click', () => setTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light'));
    document.querySelectorAll('.theme-opt').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
    // palette
    const sel = $('palette-select');
    sel.innerHTML = Object.entries(PALETTES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
    sel.value = store.get('palette', 'aurora');
    S.view.setPalette(sel.value);
    sel.addEventListener('change', () => { S.view.setPalette(sel.value); store.set('palette', sel.value); S.editor.draw(); });
    // view toggles
    $('toggle-sym').addEventListener('click', e => {
        S.showSym = !S.showSym;
        e.currentTarget.classList.toggle('active', S.showSym);
        if (S.showSym && !S.sym) S.sym = detectSymmetry(S.g);
        S.view.showSymmetry(S.sym, S.showSym);
        renderSym();
    });
    $('toggle-rotate').addEventListener('click', e => { S.view.controls.autoRotate = !S.view.controls.autoRotate; e.currentTarget.classList.toggle('active', S.view.controls.autoRotate); });
    $('reset-view').addEventListener('click', () => { S.view.camera.position.set(0, 0.6, 9); S.view.camera.up.set(0, 1, 0); S.view.frame(S.g); });
    $('axis-btn').addEventListener('click', () => {
        const sym = S.sym || (S.sym = detectSymmetry(S.g));
        const rot = sym.elements.filter(e => e.kind === 'rotation').sort((a, b) => b.order - a.order)[0];
        if (rot) S.view.lookAlong(rot.axis);
        else setBanner('warning', 'No rotation axis yet.');
    });
    // exports
    $('export-png').addEventListener('click', () => {
        S.view.render();
        download(S.view.renderer.domElement.toDataURL('image/png'), `${slug(S.name)}.png`);
    });
    $('export-obj').addEventListener('click', async () => {
        const { OBJExporter } = await import('three/addons/exporters/OBJExporter.js');
        const text = new OBJExporter().parse(S.view.root);
        download(URL.createObjectURL(new Blob([text], { type: 'text/plain' })), `${slug(S.name)}.obj`);
    });

    // shape sliders
    const sl = {};
    const changeParams = (p, ended) => {
        Object.assign(S.params, p);
        S.relaxer.setParams(p);
        document.querySelectorAll('#style-options .seg-opt').forEach(b => b.classList.remove('active'));
        if (S.mode !== 'relax') setMode('relax');
        setRunning(true);
        S.settledSince = 0;
    };
    sl.range = sliderButton('sl-range', { min: 0, max: 1, value: S.params.range, onChange: v => changeParams({ range: v }) });
    sl.bend = sliderButton('sl-bend', { min: 0, max: 2, value: S.params.bend, onChange: v => changeParams({ bend: v }) });
    sl.junction = sliderButton('sl-junction', { min: 0, max: 1.5, value: S.params.junction, onChange: v => changeParams({ junction: v }) });
    sl.equal = sliderButton('sl-equal', { min: 0, max: 20, step: 0.1, value: S.params.equal, format: v => v.toFixed(1), onChange: v => changeParams({ equal: v }) });
    sliderButton('sl-res', { min: 8, max: 40, step: 1, value: S.beadsPerEdge, format: v => `${v}/edge`, onChange: (v, ended) => { S.beadsPerEdge = v; if (ended) rebuildAtResolution(); } });
    sliderButton('sl-thick', { min: 0.3, max: 2.5, value: 1, format: v => `${v.toFixed(2)}×`, onChange: v => { S.view.radiusScale = v; } });
    document.querySelectorAll('#style-options .seg-opt').forEach(b => b.addEventListener('click', () => {
        const st = STYLES[b.dataset.style];
        changeParams(st);
        for (const k of Object.keys(st)) sl[k].set(st[k]);
        b.classList.add('active');
    }));

    // examples modal
    const modal = $('example-modal');
    $('example-body').innerHTML = EXAMPLES.map(cat => `
        <div class="example-cat-title">${cat.cat}</div>
        <div class="example-grid">${cat.items.map(it => `
            <button class="example-card" data-id="${it.id}">
                <div class="example-card-head"><span class="example-name">${it.name}</span>
                ${(it.badges || []).map(b => `<span class="ex-badge ${b.split(' ')[0].toLowerCase()}">${b}</span>`).join('')}</div>
                ${it.desc ? `<div class="example-desc">${it.desc}</div>` : ''}
            </button>`).join('')}</div>`).join('');
    const openModal = m => { m.hidden = false; m.querySelector('.example-modal-close').focus(); };
    $('load-example-btn').addEventListener('click', () => {
        modal.querySelectorAll('.example-card').forEach(c => c.classList.toggle('current', c.dataset.id === S.exampleId));
        openModal(modal);
    });
    modal.querySelectorAll('.example-card').forEach(c => c.addEventListener('click', () => { modal.hidden = true; loadExample(c.dataset.id); }));
    for (const m of [modal, $('help-modal')]) {
        m.querySelector('.example-modal-close').addEventListener('click', () => { m.hidden = true; });
        m.querySelector('.example-modal-backdrop').addEventListener('click', () => { m.hidden = true; });
    }
    $('help-btn').addEventListener('click', () => openModal($('help-modal')));

    // text
    $('text-help').textContent = TEXT_HELP;
    $('text-toggle').addEventListener('click', () => {
        const f = $('text-fold');
        f.classList.toggle('open');
        $('text-toggle').setAttribute('aria-expanded', f.classList.contains('open'));
        if (!$('text-input').value) $('text-input').value = '# K₅ from a random straight-line drawing\ngraph K5\nlayout random 3';
    });
    $('text-apply').addEventListener('click', () => {
        try {
            const spec = parseText($('text-input').value);
            loadSpec(spec, { name: spec.name || 'From text' });
        } catch (e) { showError(e.message); }
    });
    $('text-current').addEventListener('click', () => { $('text-input').value = graphToText(S.g); });
    $('copy-link').addEventListener('click', async () => {
        const url = await shapeLink();
        try { await navigator.clipboard.writeText(url); setBanner('verified', 'Link copied: it encodes the current shape.'); }
        catch (e) { setBanner('warning', 'Could not copy; the link is in the address bar.'); }
        history.replaceState(null, '', url);
    });

    // diagram editor
    $('draw-btn').addEventListener('click', () => openEditor());
    $('pill-draw').addEventListener('click', () => ($('diagram-card').hidden ? openEditor() : closeEditor()));
    $('from-view-btn').addEventListener('click', () => { openEditor(); fromView(); });
    $('diagram-close').addEventListener('click', closeEditor);
    $('diagram-undo').addEventListener('click', () => S.editor.undo());
    $('diagram-clear').addEventListener('click', () => S.editor.clear());
    $('diagram-mirror').addEventListener('click', () => S.editor.mirror());
    $('diagram-alt').addEventListener('click', () => S.editor.alternate());
    $('diagram-lift').addEventListener('click', () => {
        try {
            const spec = S.editor.toSpec();
            if (loadSpec(spec, { name: 'Your diagram', desc: `${statsLine()}, lifted to ℝ³.` })) {
                history.replaceState(null, '', location.pathname);
            }
        } catch (e) { showError(e.message); }
    });
    document.querySelectorAll('#tool-options .seg-opt').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#tool-options .seg-opt').forEach(c => c.classList.toggle('active', c === b));
        S.editor.tool = b.dataset.tool;
    }));

    // keys
    window.addEventListener('keydown', e => {
        if (e.target.closest('textarea, input, select')) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !$('diagram-card').hidden) { e.preventDefault(); S.editor.undo(); return; }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (!$('diagram-card').hidden && ['1', '2', '3'].includes(e.key)) {
            const b = document.querySelectorAll('#tool-options .seg-opt')[+e.key - 1];
            if (b) b.click();
            return;
        }
        if (e.key === ' ') { e.preventDefault(); toggle(); }
        else if (e.key === 's' || e.key === 'S') scramble();
        else if (e.key === 'y' || e.key === 'Y') symmetrize();
        else if (e.key === 'e' || e.key === 'E') explore();
        else if (e.key === 'd' || e.key === 'D') ($('diagram-card').hidden ? openEditor() : closeEditor());
        else if (e.key === 'Escape') {
            for (const m of [$('example-modal'), $('help-modal')]) if (!m.hidden) { m.hidden = true; return; }
            if (!$('diagram-card').hidden) closeEditor();
            else hideInspector();
        }
    });
}

// ---- live invariants of the diagram being drawn

let diagTimer = 0;
function scheduleDiagramInvariants() {
    clearTimeout(diagTimer);
    diagTimer = setTimeout(diagramInvariants, 280);
}

function diagramInvariants() {
    const el = $('diagram-inv');
    if (!el || $('diagram-card').hidden) return;
    if (!S.editor.edges.length) { el.innerHTML = ''; return; }
    let g, inv;
    try {
        g = diagramGraph(S.editor.toSpec());
        inv = graphInvariants(g, 200, { budgetMs: 250, dir: [0, 0, 1] });
    } catch (e) { el.innerHTML = `<p class="label-hint">${e.message}</p>`; return; }
    const k = g.counts();
    const isLink = k.degrees.every(d => d === 2);
    k.arcs = isLink ? 0 : k.arcs;
    let html = '';
    if (isLink && inv.cycles.length === 1) {
        const c = inv.cycles[0];
        html += `<p class="inv-line">Knot type <b>${knotHTML(cycleLabel(c))}</b></p>` + knotDetail(c);
    } else {
        const groups = new Map();
        for (const c of inv.cycles) { const key = cycleLabel(c); groups.set(key, (groups.get(key) || 0) + 1); }
        const list = [...groups.entries()].sort((a, b) => (a[0] === 'unknot') - (b[0] === 'unknot') || b[1] - a[1]);
        html += `<p class="inv-line">${k.arcs === 0 ? 'Components' : 'Cycles'}: ${list.map(([n, m]) => `<b>${knotHTML(n)}</b>${m > 1 ? ` × ${m}` : ''}`).join(', ')}${inv.capped ? ', …' : ''}${inv.links.length ? ` · ${inv.links.length} linked pair${inv.links.length === 1 ? '' : 's'}` : ''}</p>`;
        const G = inv.graph;
        if (G.linkJones) html += `<div class="inv-poly"><span class="inv-pk">${tex('V_L(t)')}</span><span class="inv-pv">${tex(Poly.tex(G.linkJones, 't', 2))}</span></div>`;
        if (k.arcs > 0) html += `<div class="inv-poly"><span class="inv-pk">${tex('R(A)')}</span><span class="inv-pv">${G.yamada ? tex(Poly.tex(G.yamada, 'A')) : `<span class="label-hint">${G.yamadaCrossings} crossings: too many</span>`}</span></div>`;
    }
    el.innerHTML = html;
}

/**
 * The lifted diagram as a bare graph for the invariants: the drawn points as
 * nodes, degree-2 vertices kept (no smoothing, no embedding checks).
 */
function diagramGraph(spec) {
    const x = [], vertexNodes = [], vid = new Map();
    spec.vertices.forEach(v => { vid.set(v.id, vertexNodes.length); vertexNodes.push(x.length / 3); x.push(...v.pos); });
    const edges = spec.edges.map(e => {
        const nodes = [vertexNodes[vid.get(e.a)]];
        for (const p of e.way) { nodes.push(x.length / 3); x.push(...p); }
        nodes.push(vertexNodes[vid.get(e.b)]);
        return { a: vid.get(e.a), b: vid.get(e.b), nodes, circle: false };
    });
    const degrees = vertexNodes.map(() => 0);
    for (const e of edges) { degrees[e.a]++; degrees[e.b]++; }
    return {
        x: Float64Array.from(x), vertexNodes, edges,
        counts: () => ({ V: vertexNodes.length, arcs: edges.length, circles: 0, degrees }),
    };
}

function openEditor() {
    $('diagram-card').hidden = false;
    document.documentElement.classList.add('editing');
    $('pill-draw').classList.add('on');
    S.editor.resize();
    $('diagram-stats').textContent = statsLine();
    scheduleDiagramInvariants();
}

function closeEditor() {
    $('diagram-card').hidden = true;
    document.documentElement.classList.remove('editing');
    $('pill-draw').classList.remove('on');
}

function fromView() {
    const g = S.g;
    S.editor.fromGraph(g, i => S.view.project([g.x[3 * i], g.x[3 * i + 1], g.x[3 * i + 2]]));
    $('diagram-stats').textContent = statsLine();
}

// ============================================================ links & files

async function shapeLink() {
    const text = graphToText(S.g);
    let code = 't' + b64(new TextEncoder().encode(text));
    if (typeof CompressionStream !== 'undefined') {
        const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        code = 'z' + b64(new Uint8Array(await new Response(stream).arrayBuffer()));
    }
    return `${location.origin}${location.pathname}#g=${code}`;
}

async function readLink(code) {
    const bytes = unb64(code.slice(1));
    if (code[0] === 'z') {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return await new Response(stream).text();
    }
    return new TextDecoder().decode(bytes);
}

function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function download(url, name) {
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
}

const slug = s => (s || 'spatial-graph').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spatial-graph';

// ============================================================ start

async function start() {
    S.view = new View($('viz-container'));
    S.editor = new DiagramEditor($('diagram-canvas'), {
        color: i => S.view.color(Math.max(0, i)),
        onChange: () => { $('diagram-stats').textContent = statsLine(); scheduleDiagramInvariants(); },
    });
    bindPanel();
    bindPointer();
    const q = new URLSearchParams(location.search);
    const hash = location.hash.match(/g=([\w-]+)/);
    let loaded = false, linkError = '';
    if (hash) {
        try {
            const spec = parseText(await readLink(hash[1]));
            spec.dense = true;
            loaded = loadSpec(spec, { name: spec.name || 'Shared graph' });
            if (!loaded) linkError = $('graph-error').textContent;
        } catch (e) { linkError = e.message; }
    }
    if (!loaded) loadExample(findExample(q.get('ex')) ? q.get('ex') : 'theta-tangled');
    if (linkError) showError(`Could not read the link (${linkError}), so here is an example instead.`);
    requestAnimationFrame(frame);
    window.spatialGraphs = S;     // for poking at from the console
    S.tick = (frames = 1) => { for (let i = 0; i < frames; i++) frameBody(performance.now()); };   // drive it by hand when rAF is paused
}

start();
