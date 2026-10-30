// folded_section.js - Controls and read-outs for the "Folded Square Complex" section.

import { buildVHComplex, zarankiewicz } from '../quaternionPackage/vhComplex.js';
import { formatQuaternion } from '../quaternionPackage/projectiveQuaternion.js';
import { FoldedComplexView, VIEW_PRESETS, COLORS, hEdgeColor, vEdgeColor } from './vis_folded.js';
import { HyperplaneRelax } from './hyperplane_relax.js';

// Beyond (17, 19) — 90 squares — the hyperplane arcs crowd too closely to separate at this scale.
const PRIMES = [3, 5, 7, 11, 13, 17, 19];
const TOGGLES = ['squares', 'edges', 'vertical', 'horizontal'];

let view = null;
let relax = null;
let cx = null;
let primes = [5, 13];

const $ = (id) => document.getElementById(id);

function typeset(el) {
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => { });
}

/** LaTeX name of generator g of A (horizontal) or B (vertical). */
function genName(kind, g) {
    const G = kind === 'a' ? cx.A[g] : cx.B[g];
    const base = `${kind}_{${G.edge + 1}}`;
    return G.sign > 0 ? base : `${base}^{-1}`;
}

function genChip(kind, g) {
    const G = kind === 'a' ? cx.A[g] : cx.B[g];
    const color = kind === 'a' ? hEdgeColor(G.edge, cx.hEdges.length) : vEdgeColor(G.edge, cx.vEdges.length);
    return `<span class="folded-chip" style="--c:${color}">\\(${genName(kind, g)}\\)</span>`;
}

function hyperplaneLine(label, H, check, cover, letter, color, regular, dual) {
    const comps = H.components;
    const n = comps.length;
    const parts = comps.map((c) =>
        `${c.edges.length} vertices, ${c.squares.length} edges, \\(\\pi_1\\) free of rank ${c.rank}, ${c.twoSided ? 'two-sided' : 'one-sided'};
        its double cover, on the ${2 * c.edges.length} vertices \\(${letter}^{\\pm1}\\), is ${c.coverComponents === 1 ? 'connected' : 'two copies'}`);
    const ok = check.clearance > 0.004 && check.angle > 0.5;
    const clr = check.clearance >= 0.1199 ? '≥ 0.12' : check.clearance.toFixed(3);
    const coverOk = cover.clearance > 0.004 && cover.angle > 0.5;
    const coverClr = cover.clearance >= 0.1199 ? '≥ 0.12' : cover.clearance.toFixed(3);
    return `<div class="folded-stat">
        <div><span class="swatch" style="--c:${color}"></span><strong>${label}</strong>
        (dual to the ${dual}; ${n === 1 ? 'one hyperplane, covered by' : `${n} hyperplanes, each covered by`} \\(T_{${regular}}\\))</div>
        <div class="folded-sub">${parts.join('<br>')}</div>
        <div class="folded-sub ${ok ? 'ok' : 'warn'}">${ok
            ? `Embedded: arcs stay ${clr} apart away from shared vertices and leave each vertex at angles ≥ ${check.angle.toFixed(1)}° (sampled check).`
            : `Arcs come within ${check.clearance.toFixed(4)} of each other, too close to certify by sampling; try “New immersion”.`}</div>
        <div class="folded-sub">${coverOk
            ? `Double cover (the ¼ and ¾ slices of the squares) embedded: ${coverClr} apart away from its vertices, angles ≥ ${cover.angle.toFixed(1)}°.`
            : `Double cover (the ¼ and ¾ slices of the squares, which follow the patches and are not spread out): closest approach ${cover.clearance.toFixed(4)} away from its vertices, angles ≥ ${cover.angle.toFixed(1)}° (sampled).`}</div>
    </div>`;
}

function renderInfo() {
    const box = $('folded-info');
    if (!cx || !view) { box.innerHTML = ''; return; }
    const st = view.stats();
    const { p, q } = cx;
    const m = cx.hEdges.length, n = cx.vEdges.length, S = cx.squares.length;
    const Z = zarankiewicz(p + 1, q + 1);
    const proven = Math.min(p, q) <= 5;
    const linkNote = st.linkCrossings === Z
        ? `${st.linkCrossings} rays out of the vertex, which is ${proven ? 'the crossing number of' : 'Zarankiewicz’s conjectured crossing number of'} \\(K_{${p + 1},${q + 1}}\\)${proven ? ' (Kleitman)' : ''}`
        : `${st.linkCrossings} rays out of the vertex (Zarankiewicz’s number is ${Z}; shrink the vertex spread to approach it)`;
    const refining = view.polishing ? '<div class="folded-sub">Refining the layout…</div>' : '';
    box.innerHTML = `
        <div class="folded-group-title">\\(X_{${p},${q}}\\)</div>${refining}
        <div class="folded-stat">1 vertex, ${m} horizontal + ${n} vertical loops, ${S} squares;
            \\(\\chi = ${cx.euler} = \\tfrac{(p-1)(q-1)}{4}\\).</div>
        <div class="folded-stat">The link of the vertex is \\(K_{${p + 1},${q + 1}}\\), which is not planar, so no
            neighbourhood of the vertex embeds in \\(\\mathbb{R}^3\\). Here the corner sectors cross along ${linkNote}.
            The 1-skeleton is an embedded bouquet of circles.</div>
        ${hyperplaneLine('Vertical hyperplanes', cx.vHyperplanes, st.vertical, st.vCover, 'a', COLORS.vHyper, q + 1, `${p}-edges`)}
        ${hyperplaneLine('Horizontal hyperplanes', cx.hHyperplanes, st.horizontal, st.hCover, 'b', COLORS.hHyper, p + 1, `${q}-edges`)}
        <div class="folded-sub">Together they meet only at the ${S} square centres; otherwise ${st.both.clearance >= 0.1199 ? '≥ 0.12' : st.both.clearance.toFixed(3)} apart.</div>`;
    typeset(box);
}

function renderLegend() {
    const box = $('folded-legend');
    if (!cx) { box.innerHTML = ''; return; }
    const row = (kind, edges, color) => edges.map((e, i) =>
        `<div class="folded-legend-row"><span class="folded-chip" style="--c:${color(i, edges.length)}">\\(${kind}_{${i + 1}}\\)</span>
        \\(= ${formatQuaternion(e.q)}\\)</div>`).join('');
    box.innerHTML = `
        <div class="folded-group-title">Generators</div>
        <div class="folded-sub">Horizontal loops: norm ${cx.p}</div>${row('a', cx.hEdges, hEdgeColor)}
        <div class="folded-sub">Vertical loops: norm ${cx.q}</div>${row('b', cx.vEdges, vEdgeColor)}`;
    typeset(box);
}

/** How a square's hyperplane arc runs between the midpoints of edges g0, g1. */
function arcSentence(family, kind, g0, g1) {
    const e0 = `\\(${kind}_{${g0.edge + 1}}\\)`, e1 = `\\(${kind}_{${g1.edge + 1}}\\)`;
    if (g0.edge !== g1.edge) return `Its ${family} arc joins the midpoints of ${e0} and ${e1}.`;
    return g0.sign === g1.sign
        ? `Its ${family} arc is a loop at the midpoint of ${e0}.`
        : `Its ${family} arc is a loop at the midpoint of ${e0}, and the square runs along ${e0} in opposite directions at the loop's two ends, so the ${family} hyperplane is one-sided.`;
}

function renderSelection(s) {
    const box = $('folded-selection');
    if (!cx || s < 0) {
        box.innerHTML = '<div class="folded-sub">Click a square or a hyperplane arc to see its relation.</div>';
        return;
    }
    const sq = cx.squares[s];
    const Q = (kind, g) => `(${formatQuaternion(kind === 'a' ? cx.A[g].q : cx.B[g].q)})`;
    box.innerHTML = `
        <div class="folded-group-title">Square ${s + 1} of ${cx.squares.length}</div>
        <div class="folded-relation">${genChip('a', sq.bottom)}${genChip('b', sq.right)} \\(=\\) ${genChip('b', sq.left)}${genChip('a', sq.top)}</div>
        <div class="folded-sub">\\(${Q('a', sq.bottom)}${Q('b', sq.right)} = ${sq.sign < 0 ? '-' : ''}${Q('b', sq.left)}${Q('a', sq.top)}\\)</div>
        <div class="folded-sub">Bottom \\(${genName('a', sq.bottom)}\\), right \\(${genName('b', sq.right)}\\),
            top \\(${genName('a', sq.top)}\\), left \\(${genName('b', sq.left)}\\).
            ${arcSentence('vertical', 'a', cx.A[sq.bottom], cx.A[sq.top])}
            ${arcSentence('horizontal', 'b', cx.B[sq.left], cx.B[sq.right])}</div>`;
    typeset(box);
}

function rebuild() {
    const p = +$('folded-p').value, q = +$('folded-q').value;
    const msg = $('folded-message');
    if (p === q) {
        msg.textContent = 'Choose two different primes.';
        return;
    }
    msg.textContent = '';
    try {
        cx = buildVHComplex(p, q);
    } catch (err) {
        msg.textContent = err.message;
        return;
    }
    if (!view) return;
    view.setComplex(cx);
    syncFoldControls(view.params.fold);
    renderInfo();
    renderLegend();
    renderSelection(-1);
}

function syncFoldControls(t) {
    $('folded-fold').value = String(t);
    $('folded-fold-btn').textContent = t > 0.5 ? 'Unfold' : 'Fold';
    $('folded-fold-val').textContent = t >= 0.999 ? 'folded' : t <= 0.001 ? 'flat squares' : `${Math.round(t * 100)}%`;
}

function syncCoverControls(c) {
    $('folded-cover').value = String(c);
    $('folded-cover-btn').textContent = c > 0.5 ? 'Spread to ¼, ¾' : 'Double cover';
}

function syncPresetButtons() {
    const current = Object.fromEntries(TOGGLES.map((k) => [k, $(`folded-show-${k}`).checked]));
    document.querySelectorAll('#folded-view button').forEach((b) => {
        const preset = VIEW_PRESETS[b.dataset.view];
        b.classList.toggle('active', TOGGLES.every((k) => preset[k] === current[k]));
    });
}

/** Status line and buttons of “Relax into a nice embedding”. */
function renderRelaxStatus({ state, html }) {
    const box = $('folded-relax-status');
    box.innerHTML = html;
    box.className = `folded-sub ${state === 'settled' ? 'ok' : state === 'error' ? 'warn' : state === 'waiting' ? 'muted' : ''}`;
    $('folded-relax-restart').disabled = !(state === 'running' || state === 'settled');
    $('folded-relax-open').disabled = !(state === 'running' || state === 'settled');
}

function ensureView() {
    if (view) return true;
    const container = $('folded-vis-container');
    if (!container || container.clientWidth === 0) return false;
    view = new FoldedComplexView(container, { onSelect: renderSelection });
    view.onFold = syncFoldControls;
    view.onCover = syncCoverControls;
    view.onRefine = () => renderInfo();
    relax = new HyperplaneRelax(view, { onStatus: renderRelaxStatus });
    view.relax = relax;
    relax.setEnabled($('folded-relax').checked);
    if (/[?&]debug\b/.test(location.search)) window.foldedView = view;
    const params = { opacity: +$('folded-opacity').value, kappa: +$('folded-kappa').value };
    TOGGLES.forEach((k) => { params[k] = $(`folded-show-${k}`).checked; });
    params.ribbons = $('folded-ribbons').checked;
    params.labels = $('folded-labels').checked;
    params.arcColors = $('folded-arc-colors').value;
    Object.assign(view.params, params);
    view.mats.squares.opacity = params.opacity;
    rebuild();
    return true;
}

/** Use the first two distinct primes from the main prime list. */
export function setFoldedPrimes(list) {
    const ok = [...new Set(list.filter((p) => PRIMES.includes(p)))];
    if (ok.length >= 2) primes = ok.slice(0, 2);
    else if (ok.length === 1) primes = [ok[0], ok[0] === 3 ? 5 : 3];
    else return;
    $('folded-p').value = String(primes[0]);
    $('folded-q').value = String(primes[1]);
    if (view) rebuild();
}

export function initFoldedSection() {
    const selP = $('folded-p'), selQ = $('folded-q');
    if (!selP) return;
    for (const sel of [selP, selQ]) {
        sel.innerHTML = PRIMES.map((p) => `<option value="${p}">${p}</option>`).join('');
        sel.addEventListener('change', () => rebuild());
    }
    selP.value = String(primes[0]);
    selQ.value = String(primes[1]);

    document.querySelectorAll('#folded-view button').forEach((b) => {
        b.addEventListener('click', () => {
            const preset = VIEW_PRESETS[b.dataset.view];
            TOGGLES.forEach((k) => { $(`folded-show-${k}`).checked = preset[k]; });
            syncPresetButtons();
            if (view) view.setParams({ ...preset });
        });
    });
    TOGGLES.forEach((k) => {
        $(`folded-show-${k}`).addEventListener('change', (e) => {
            syncPresetButtons();
            if (view) view.setParams({ [k]: e.target.checked });
        });
    });
    $('folded-ribbons').addEventListener('change', (e) => view && view.setParams({ ribbons: e.target.checked }));
    $('folded-labels').addEventListener('change', (e) => view && view.setParams({ labels: e.target.checked }));
    $('folded-arc-colors').addEventListener('change', (e) => view && view.setParams({ arcColors: e.target.value }));

    $('folded-opacity').addEventListener('input', (e) => view && view.setParams({ opacity: +e.target.value }));
    const kappa = $('folded-kappa');
    kappa.addEventListener('input', () => view && view.setParams({ kappa: +kappa.value }));
    kappa.addEventListener('change', () => renderInfo());
    $('folded-reseed').addEventListener('click', () => {
        if (!view) return;
        view.newImmersion();
        renderInfo();
    });
    $('folded-reset-cam').addEventListener('click', () => view && view.resetCamera());
    $('folded-relax').addEventListener('change', (e) => relax && relax.setEnabled(e.target.checked));
    $('folded-relax-restart').addEventListener('click', () => relax && relax.restart());
    $('folded-relax-open').addEventListener('click', () => relax && relax.openInRelaxer());

    const cover = $('folded-cover');
    cover.addEventListener('input', () => {
        if (!view) return;
        view.setCover(+cover.value);
        syncCoverControls(+cover.value);
    });
    $('folded-cover-btn').addEventListener('click', () => {
        if (!view) return;
        // show the hyperplanes if neither family is on
        if (!view.params.vertical && !view.params.horizontal) $('folded-view').querySelector('[data-view="both"]').click();
        view.animateCover(view.params.cover > 0.5 ? 0 : 1);
    });

    const fold = $('folded-fold');
    fold.addEventListener('input', () => {
        if (!view) return;
        view.setFold(+fold.value);
        syncFoldControls(+fold.value);
    });
    $('folded-fold-btn').addEventListener('click', () => {
        if (!view) return;
        view.animateFold(view.params.fold > 0.5 ? 0 : 1);
    });

    syncPresetButtons();
    window.addEventListener('resize', () => {
        if (ensureView()) view.resize();
    });
    ensureView();
}
