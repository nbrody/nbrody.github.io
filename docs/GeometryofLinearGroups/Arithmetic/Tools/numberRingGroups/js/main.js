// Presentations of PGL_2(O_k): the page. The computation runs in a module worker (worker.js).
import { tex, rich, renderStaticMath, TexLayer } from './tex.js';
import { latexToPlain } from './latexInput.js';
import { wordTeX, gapExport, magmaExport, abelianTeX } from './format.js';

// ------------------------------------------------------------------ examples
const PRESETS = [
    { group: 'The rationals', items: [{ poly: 'x', name: 'a', label: '\\Q' }] },
    { group: 'Imaginary quadratic', items: [
        { poly: 'x^2+1', name: 'i', label: '\\Q(i)' },
        { poly: 'x^2+2', name: '\\sqrt{-2}', label: '\\Q(\\sqrt{-2})' },
        { poly: 'x^2-x+1', name: '\\omega', label: '\\Q(\\sqrt{-3})', note: '\\omega = e^{\\pi i/3}' },
        { poly: 'x^2+7', name: '\\sqrt{-7}', label: '\\Q(\\sqrt{-7})' },
        { poly: 'x^2+11', name: '\\sqrt{-11}', label: '\\Q(\\sqrt{-11})' },
        { poly: 'x^2+19', name: '\\sqrt{-19}', label: '\\Q(\\sqrt{-19})' },
        { poly: 'x^2+5', name: '\\sqrt{-5}', label: '\\Q(\\sqrt{-5})', note: 'h = 2' },
        { poly: 'x^2+6', name: '\\sqrt{-6}', label: '\\Q(\\sqrt{-6})', note: 'h = 2' },
        { poly: 'x^2+15', name: '\\sqrt{-15}', label: '\\Q(\\sqrt{-15})', note: 'h = 2' },
        { poly: 'x^2+23', name: '\\sqrt{-23}', label: '\\Q(\\sqrt{-23})', note: 'h = 3' },
    ] },
    { group: 'Real quadratic (Hilbert modular groups)', items: [
        { poly: 'x^2-2', name: '\\sqrt{2}', label: '\\Q(\\sqrt{2})' },
        { poly: 'x^2-3', name: '\\sqrt{3}', label: '\\Q(\\sqrt{3})' },
        { poly: 'x^2-x-1', name: '\\varphi', label: '\\Q(\\sqrt{5})', note: '\\varphi = \\tfrac{1+\\sqrt5}{2}' },
        { poly: 'x^2-6', name: '\\sqrt{6}', label: '\\Q(\\sqrt{6})' },
        { poly: 'x^2-7', name: '\\sqrt{7}', label: '\\Q(\\sqrt{7})' },
        { poly: 'x^2-10', name: '\\sqrt{10}', label: '\\Q(\\sqrt{10})', note: 'h = 2' },
        { poly: 'x^2-13', name: '\\sqrt{13}', label: '\\Q(\\sqrt{13})' },
    ] },
    { group: 'Cubic', items: [
        { poly: 'x^3-2', name: '\\sqrt[3]{2}', label: '\\Q(\\sqrt[3]{2})', note: 'one complex place' },
        { poly: 'x^3-x-1', name: '\\theta', label: '\\Q(\\theta),\\ \\theta^3 = \\theta + 1', note: 'disc. -23' },
        { poly: 'x^3+x^2-2x-1', name: '\\eta', label: '\\Q(\\zeta_7)^+', note: '\\eta = \\zeta_7 + \\zeta_7^{-1}' },
    ] },
    { group: 'Quartic CM', items: [
        { poly: 'x^4+x^3+x^2+x+1', name: '\\zeta_5', label: '\\Q(\\zeta_5)' },
        { poly: 'x^4+1', name: '\\zeta_8', label: '\\Q(\\zeta_8)' },
        { poly: 'x^4-x^2+1', name: '\\zeta_{12}', label: '\\Q(\\zeta_{12})' },
    ] },
];
const DEFAULT = { poly: 'x^2+5', name: '\\sqrt{-5}' };
const GROUPS = [
    { key: 'PGL2', tex: '\\PGL_2(\\O_k)', proj: true },
    { key: 'PSL2', tex: '\\PSL_2(\\O_k)', proj: true },
    { key: 'GL2', tex: '\\GL_2(\\O_k)', proj: false },
    { key: 'SL2', tex: '\\SL_2(\\O_k)', proj: false },
];

const $ = (id) => document.getElementById(id);
const state = { data: null, tab: 'PGL2', name: DEFAULT.name, busy: false, seconds: 120, hl: -1, reqId: 0 };
let MQ = null, polyField = null, matFields = [];
let worker = null, workerReady = false, pending = [];

// ------------------------------------------------------------------ worker
// The worker's modules use top-level await, so it only listens once it says 'ready'; queue until then.
// A worker that fails to load (a dev server dropping one of its many module requests) is retried.
let loadAttempts = 0;
function startWorker(keepPending = false) {
    if (worker) worker.terminate();
    workerReady = false;
    if (!keepPending) { pending = []; loadAttempts = 0; }
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => onWorker(ev.data);
    worker.onerror = (e) => {
        if (!workerReady && loadAttempts < 4) { loadAttempts++; setTimeout(() => startWorker(true), 250 * loadAttempts); return; }
        setBusy(false);
        setStatus(`The worker failed${e.message ? `: ${e.message}` : ' to load'}. Reload the page to try again.`, 'error');
    };
}
function send(msg) { if (workerReady) worker.postMessage(msg); else pending.push(msg); }
function onWorker(msg) {
    if (msg.type === 'ready') { workerReady = true; for (const m of pending.splice(0)) worker.postMessage(m); return; }
    if (msg.type === 'progress') return showProgress(msg);
    if (msg.type === 'result') { if (msg.id !== state.reqId) return; setBusy(false); showResult(msg.data); return; }
    if (msg.type === 'error') { if (msg.id !== state.reqId) return; setBusy(false); state.data = null; $('results').hidden = true; setStatus(msg.message, 'error'); return; }
    if (msg.type === 'word') return showWord(msg);
    if (msg.type === 'word-error') { $('word-err').textContent = msg.message; $('word-out').replaceChildren(); return; }
    if (msg.type === 'random') { fillMatrix(msg.entries); $('word-err').textContent = ''; return; }
}

function setBusy(b) {
    state.busy = b;
    $('run').disabled = b;
    $('stop').hidden = !b;
}
function setStatus(html, kind = '') {
    const s = $('status');
    s.className = 'status' + (kind === 'error' ? ' is-error' : '');
    s.innerHTML = (kind === 'busy' ? '<span class="spinner" aria-hidden="true"></span>' : '') + `<span>${html}</span>`;
}
let t0 = 0;
function showProgress(p) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    let msg = '';
    if (p.stage === 'field') msg = 'The ring of integers is ready. Next: the units.';
    else if (p.stage === 'units') msg = p.phase === 'done' ? 'Units done. Now Voronoi\'s algorithm for perfect binary forms.' : `Units: Voronoi's algorithm in rank one, ${p.cells || 0} cell orbits so far`;
    else if (p.stage === 'voronoi') msg = p.phase === 'done' ? `${p.cells} orbits of perfect forms. Assembling Brown's presentation.` : `Perfect forms: ${p.cells || 0} orbits so far${p.last ? ` (latest: ${p.last.vecs} minimal vectors, ${p.last.facets} facets)` : ''}`;
    else if (p.stage === 'brown') msg = `Brown's presentation: ${p.letters} generators, ${p.relators} relators. Simplifying and passing to ${rich('$\\PGL_2$, $\\SL_2$, $\\PSL_2$')}.`;
    if (msg) setStatus(`${msg} <span class="c-soft">(${secs} s)</span>`, 'busy');
}

// ------------------------------------------------------------------ compute
function compute() {
    let plain;
    try { plain = latexToPlain(polyField.latex(), { variable: 'x' }); } catch (e) { setStatus(e.message, 'error'); return; }
    if (!plain) { setStatus('Enter a polynomial f(x).', 'error'); return; }
    const preset = findPreset(plain);
    state.name = preset ? preset.name : 'a';
    state.lastPlain = plain;
    history.replaceState(null, '', `#f=${encodeURIComponent(plain)}`);
    state.reqId++;
    t0 = Date.now();
    setBusy(true);
    setStatus('Starting…', 'busy');
    send({ type: 'compute', id: state.reqId, src: plain, name: state.name, seconds: state.seconds });
}
const normPoly = (s) => s.replace(/\s+/g, '').replace(/\*/g, '');
function findPreset(plain) {
    const k = normPoly(plain);
    for (const g of PRESETS) for (const it of g.items) if (normPoly(latexToPlain(it.poly, { variable: 'x' })) === k) return it;
    return null;
}

// ------------------------------------------------------------------ results
function showResult(data) {
    state.data = data;
    $('results').hidden = false;
    const F = data.field;
    const secs = (data.timing.total / 1000).toFixed(2);
    setStatus(`${rich(`$k = \\Q(${F.name === 'a' ? 'a' : F.name})$`)}: ${data.cells.length} orbit${data.cells.length === 1 ? '' : 's'} of perfect forms, presentations of four groups, every relator checked. <span class="c-soft">(${secs} s)</span>`);
    renderRing(data);
    renderTabs();
    renderGroup();
    renderCells(data);
    setupWordHint(data);
    $('word-out').replaceChildren(); $('word-err').textContent = '';
}

function renderRing(data) {
    const F = data.field;
    const n = F.n, sig = `(${F.r1}, ${F.r2})`;
    const kindText = { real: 'totally real', cm: 'CM', cubic: 'cubic with one complex place' }[F.kind] || F.kind;
    const gen = F.name;
    const cards = [];
    cards.push(`<div class="card"><h3>The field</h3>
      <div class="big">${tex(`k = \\Q(${gen})`)}</div>
      <div class="row"><span>minimal polynomial of ${tex(gen)}</span><span>${tex(F.poly)}</span></div>
      <div class="row"><span>degree</span><span>${tex(`${n}`)}</span></div>
      <div class="row"><span>signature ${tex('(r_1, r_2)')}</span><span>${tex(sig)}</span></div>
      <div class="row"><span>discriminant</span><span>${tex(F.disc)}</span></div>
      <div class="row"><span>type</span><span>${kindText}</span></div></div>`);
    cards.push(`<div class="card"><h3>Integral basis</h3>
      <div class="big">${tex(`\\O_k = ${F.basis.map((b) => (b === '1' ? '\\Z' : `\\Z\\,${/ [+-] /.test(b) && !/^\\tfrac/.test(b) ? `\\left(${b}\\right)` : b}`)).join(' \\oplus ')}`)}</div>
      ${F.certified ? '' : '<div class="note">The discriminant was not fully factored; the basis is maximal at the primes found.</div>'}</div>`);
    const units = [];
    units.push(`<div class="row"><span>roots of unity</span><span>${tex(`\\mu_k = \\langle ${F.zeta} \\rangle \\cong \\Z/${F.w}`)}</span></div>`);
    if (F.fundamental.length) {
        F.fundamental.forEach((u, i) => units.push(`<div class="row"><span>${tex(`\\varepsilon_{${i + 1}}`)}</span><span>${tex(u)}</span></div>`));
        units.push(`<div class="row"><span>regulator</span><span>${tex(F.regulator.toFixed(6))}</span></div>`);
        units.push(`<div class="note">From Voronoi's algorithm for ${tex('\\GL_1(\\O_k)')}: ${data.units.cells} cell orbit${data.units.cells === 1 ? '' : 's'}.</div>`);
    } else units.push(`<div class="note">${tex(`\\O_k^\\times = \\mu_k`)} is finite.</div>`);
    cards.push(`<div class="card"><h3>Units</h3>${units.join('')}</div>`);
    const model = {
        real: `symmetric forms over ${tex('k')}: ${tex('V \\cong \\mathrm{Sym}_2(k)\\otimes\\R')}, ${tex(`\\dim V = ${data.space.N}`)}`,
        cm: `Hermitian forms over ${tex('k')} for its complex conjugation: ${tex(`\\dim V = ${data.space.N}`)}`,
        cubic: `coordinates in the real cubic field ${tex('\\tau(k)')}, with ${tex('|\\sigma x|^2 = N(x)/\\tau(x)')}: ${tex(`\\dim V = ${data.space.N}`)}`,
    }[data.space.kind];
    cards.push(`<div class="card"><h3>The cone of forms</h3><div class="note">${model}.</div>
      <div class="row"><span>orbits of perfect forms</span><span>${tex(`${data.cells.length}`)}</span></div>
      <div class="row"><span>Brown's presentation</span><span>${tex(`${data.brown.letters}`)} gens, ${tex(`${data.brown.relators}`)} rels</span></div></div>`);
    $('ring-cards').innerHTML = cards.join('');
}

function renderTabs() {
    const host = $('group-tabs');
    host.replaceChildren();
    for (const G of GROUPS) {
        const g = state.data.groups[G.key];
        const b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(state.tab === G.key));
        b.innerHTML = `${tex(G.tex)}<span class="tab-meta">${g.gens.length} · ${g.relators.length}</span>`;
        b.title = `${g.gens.length} generators, ${g.relators.length} relators`;
        b.addEventListener('click', () => { state.tab = G.key; renderTabs(); renderGroup(); });
        host.appendChild(b);
    }
}

const gname = (k) => `g_{${k}}`;
function renderGroup() {
    const G = GROUPS.find((x) => x.key === state.tab);
    const g = state.data.groups[G.key];
    const m = g.gens.length, R = g.relators;
    // the presentation, relators in rows of six
    const relTeX = R.map((r) => wordTeX(r, gname));
    const shown = relTeX.slice(0, 48);
    const rows = [];
    for (let i = 0; i < shown.length; i += 6) rows.push(shown.slice(i, i + 6).join(',\\ '));
    if (relTeX.length > shown.length) rows.push(`\\dots\\ (${relTeX.length - shown.length}\\text{ more})`);
    const gensTeX = m <= 8 ? Array.from({ length: m }, (_, i) => gname(i + 1)).join(', ') : `${gname(1)}, \\dots, ${gname(m)}`;
    const body = rows.length ? `\\begin{array}{l} ${rows.join(',\\\\ ')} \\end{array}` : '\\varnothing';
    $('pres-box').innerHTML = tex(`${G.tex} \\;\\cong\\; \\left\\langle\\, ${gensTeX} \\;\\middle|\\; ${body} \\,\\right\\rangle`, true);
    // generators
    $('gens-note').innerHTML = G.proj ? `matrices representing elements of ${tex(G.tex)}` : '';
    $('gen-list').innerHTML = g.gens.map((x, i) => `<div class="gen"><div class="gname">${tex(`${gname(i + 1)} =`)}<span class="badge ${x.order ? 'fin' : 'inf'}">${x.order ? `order ${x.order}` : 'infinite order'}</span></div><div class="gmat">${tex(x.tex)}</div></div>`).join('');
    // relators
    $('rels-note').textContent = `${R.length} relator${R.length === 1 ? '' : 's'}`;
    $('rel-list').innerHTML = relTeX.map((t) => `<li>${tex(t)}</li>`).join('');
    // facts
    const facts = [];
    facts.push(`<span class="fact"><span>abelianization</span><span>${tex(`H_1 = ${abelianTeX(g.abelianization)}`)}</span></span>`);
    facts.push(`<span class="fact"><span>check</span><span class="ok">${g.verified} relators multiplied out${G.proj ? ' (scalar matrices)' : ''}</span></span>`);
    $('group-facts').innerHTML = facts.join('');
}

function exportText(kind) {
    const G = GROUPS.find((x) => x.key === state.tab), g = state.data.groups[G.key], F = state.data.field;
    const label = `${G.key.replace('2', '_2')}(O_k), k = Q(a), ${F.poly.replace(/\\/g, '')} = 0`;
    if (kind === 'gap') return gapExport(g.gens.length, g.relators, { comment: label });
    if (kind === 'magma') return magmaExport(g.gens.length, g.relators, { comment: label });
    return JSON.stringify({ group: G.key, field: { poly: F.poly, generator: F.name, integralBasis: F.basis }, generators: g.gens.map((x) => x.plain), generatorsTeX: g.gens.map((x) => x.tex), relators: g.relators }, null, 1);
}

// ------------------------------------------------------------------ cells
function renderCells(data) {
    const cells = data.cells;
    $('cells-intro').innerHTML = `<p>${rich(`The Voronoi cones of the perfect forms tile the cone of positive definite forms on $(k\\otimes\\R)^2$ (dimension $${data.space.N}$). One form per $\\GL_2(\\O_k)$-orbit is listed with the number of its minimal vectors (up to roots of unity), the facets of its cone and their orbits under the stabilizer, the faces of codimension two that meet the interior, and the image of the stabilizer in $\\PGL_2(k)$.`)}</p>`;
    const head = `<thead><tr><th>form</th><th>${tex('|\\Min P|')}</th><th>rays</th><th>facets</th><th>orbits</th><th>codim 2</th><th>stabilizer</th><th>neighbors</th></tr></thead>`;
    const rows = cells.map((c, i) => `<tr data-i="${i}" tabindex="0"><td>${tex(`P_{${i + 1}}`)}</td><td>${c.vectors}</td><td>${c.rays}</td><td>${c.facets}</td><td>${c.facetOrbits}</td><td>${c.ridges}</td><td>${tex(c.pglStab.tex)}</td><td>${nbTeX(c.neighbors)}</td></tr>`).join('');
    $('cell-table').innerHTML = head + `<tbody>${rows}</tbody>`;
    $('cell-table').querySelectorAll('tbody tr').forEach((tr) => {
        const i = +tr.dataset.i;
        tr.addEventListener('click', () => highlight(i));
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); highlight(i); } });
    });
    drawGraph(cells);
    highlight(0);
}
function nbTeX(list) {
    const u = [...new Set(list)].sort((a, b) => a - b);
    const shown = u.slice(0, 4).map((j) => `P_{${j + 1}}`);
    return tex(shown.join(',\\,') + (u.length > 4 ? `,\\,\\dots\\ (${u.length})` : ''));
}
function highlight(i) {
    state.hl = i;
    const c = state.data.cells[i];
    $('cell-table').querySelectorAll('tbody tr').forEach((tr) => tr.classList.toggle('is-hl', +tr.dataset.i === i));
    document.querySelectorAll('#graph .g-node').forEach((n) => n.classList.toggle('is-hl', +n.dataset.i === i));
    document.querySelectorAll('#graph .g-edge').forEach((e) => e.classList.toggle('is-hl', +e.dataset.a === i || +e.dataset.b === i));
    const more = c.vectors > c.minVecs.length ? ` (first ${c.minVecs.length})` : '';
    $('minvecs').innerHTML = `<span class="mv-head">${rich(`Minimal vectors of $P_{${i + 1}}$ up to roots of unity${more}; they all have $P[v] = ${c.minimumTeX}$ (the trace form of the coordinates used).`)}</span>` + c.minVecs.map((v) => `<span>${tex(v)}</span>`).join('');
}

function drawGraph(cells) {
    const svg = $('graph'), host = $('graph-host');
    svg.replaceChildren();
    host.querySelectorAll('.tex-layer').forEach((n) => n.remove());
    svg.style.height = (cells.length <= 2 ? 240 : cells.length <= 4 ? 320 : 420) + 'px';
    const W = svg.clientWidth || 520, H = svg.clientHeight || 420;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const n = cells.length;
    // edges: one per (cell, facet orbit), merged with multiplicity
    const mult = new Map();
    cells.forEach((c, i) => c.neighbors.forEach((j) => {
        const a = Math.min(i, j), b = Math.max(i, j), k = `${a},${b}`;
        const side = i <= j ? 'f' : 'r';
        const e = mult.get(k) || { a, b, f: 0, r: 0 };
        e[side]++;
        mult.set(k, e);
    }));
    const edges = [...mult.values()].map((e) => ({ ...e, m: e.a === e.b ? e.f : Math.max(e.f, e.r) }));
    // layout: a circle, relaxed by springs when there are many cells
    const pad = 52;
    const R0 = Math.min(W, H) / 2 - pad;
    let pos = cells.map((_, i) => { const t = Math.PI + 2 * Math.PI * i / n + (n % 2 ? Math.PI / 2 : 0); return n === 1 ? [W / 2, H / 2 + 20] : [W / 2 + R0 * Math.cos(t), H / 2 + R0 * Math.sin(t)]; });
    if (n > 8) pos = springs(pos, edges, W, H, pad);
    const NS = 'http://www.w3.org/2000/svg';
    const radius = (c) => 9 + 3 * Math.log2(c.pglStab.order + 1);
    for (const e of edges) {
        const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b];
        let el;
        if (e.a === e.b) {
            el = document.createElementNS(NS, 'path');
            const r = radius(cells[e.a]);
            const [ux, uy] = outward(pos[e.a], W, H), [vx, vy] = [-uy, ux];
            const p = (s, t) => `${x1 + s * ux + t * vx} ${y1 + s * uy + t * vy}`;
            el.setAttribute('d', `M ${p(r - 2, -6)} C ${p(r + 38, -30)}, ${p(r + 38, 30)}, ${p(r - 2, 6)}`);
        } else {
            el = document.createElementNS(NS, 'line');
            el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2);
        }
        el.setAttribute('class', 'g-edge');
        el.dataset.a = e.a; el.dataset.b = e.b;
        svg.appendChild(el);
    }
    cells.forEach((c, i) => {
        const el = document.createElementNS(NS, 'circle');
        el.setAttribute('cx', pos[i][0]); el.setAttribute('cy', pos[i][1]); el.setAttribute('r', radius(c));
        el.setAttribute('class', 'g-node' + (i === 0 ? ' is-first' : ''));
        el.dataset.i = i;
        el.addEventListener('click', () => highlight(i));
        const t = document.createElementNS(NS, 'title'); t.textContent = `P${i + 1}: stabilizer of order ${c.pglStab.order} in PGL2`;
        el.appendChild(t);
        svg.appendChild(el);
    });
    const layer = new TexLayer(host);
    const big = n <= 16;
    cells.forEach((c, i) => {
        const [x, y] = pos[i];
        if (big || c.pglStab.order > 1) layer.add(c.pglStab.tex, x, y, { cls: 'g-stab' });
        if (big) layer.add(`P_{${i + 1}}`, x, y + radius(c) + 3, { baseline: 'top', cls: 'g-idx' });
    });
    for (const e of edges) {
        if (e.m < 2) continue;
        const [x1, y1] = pos[e.a], [x2, y2] = pos[e.b];
        let x = (x1 + x2) / 2, y = (y1 + y2) / 2;
        if (e.a === e.b) { const [ux, uy] = outward(pos[e.a], W, H), d = radius(cells[e.a]) + 40; x = x1 + d * ux; y = y1 + d * uy; }
        layer.add(`\\times ${e.m}`, x, y, { cls: 'g-mult' });
    }
}
function outward(p, W, H) {
    const dx = p[0] - W / 2, dy = p[1] - H / 2, d = Math.hypot(dx, dy);
    return d < 1 ? [0, -1] : [dx / d, dy / d];
}
function springs(pos, edges, W, H, pad) {
    const n = pos.length;
    const P = pos.map((p) => p.slice());
    const k = Math.sqrt(((W - 2 * pad) * (H - 2 * pad)) / n) * 0.9;
    let temp = W / 8;
    for (let it = 0; it < 400; it++) {
        const D = P.map(() => [0, 0]);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1];
            const d = Math.max(1, Math.hypot(dx, dy)), f = (k * k) / d;
            dx /= d; dy /= d;
            D[i][0] += dx * f; D[i][1] += dy * f; D[j][0] -= dx * f; D[j][1] -= dy * f;
        }
        for (const e of edges) {
            if (e.a === e.b) continue;
            let dx = P[e.a][0] - P[e.b][0], dy = P[e.a][1] - P[e.b][1];
            const d = Math.max(1, Math.hypot(dx, dy)), f = (d * d) / k;
            dx /= d; dy /= d;
            D[e.a][0] -= dx * f; D[e.a][1] -= dy * f; D[e.b][0] += dx * f; D[e.b][1] += dy * f;
        }
        for (let i = 0; i < n; i++) {
            const d = Math.max(1e-9, Math.hypot(D[i][0], D[i][1])), s = Math.min(d, temp) / d;
            P[i][0] = Math.min(W - pad, Math.max(pad, P[i][0] + D[i][0] * s));
            P[i][1] = Math.min(H - pad, Math.max(pad, P[i][1] + D[i][1] * s));
        }
        temp *= 0.985;
    }
    return P;
}

// ------------------------------------------------------------------ words
function setupWordHint(data) {
    const g = data.field.name;
    $('word-hint').innerHTML = `Entries in ${tex('\\O_k')}, written with ${tex(g)}${g === 'a' ? ` (a root of ${tex('f')})` : ''}; type <code>/</code> for a fraction${/\\sqrt/.test(g) ? `, <code>\\sqrt</code> for ${tex('\\sqrt{\\ }')}` : ''}.`;
}
function fillMatrix(entries) {
    entries.forEach((e, i) => matFields[i].latex(e.replace(/\\tfrac/g, '\\frac')));
}
function askWord() {
    if (!state.data) return;
    $('word-err').textContent = '';
    send({ type: 'word', entries: matFields.map((f) => f.latex()) });
}
function showWord(msg) {
    const len = msg.word.length;
    $('word-out').innerHTML = `${tex(`${msg.matrixTeX} \\;=\\; ${len ? wordTeX(msg.word, gname) : '1'}`, true)}<div class="note">Equal in ${tex('\\PGL_2(\\O_k)')}, i.e. up to a scalar matrix: a word of length ${len} in the generators of section 2 (the walk crossed ${msg.cellsCrossed} facets). Multiplied out and checked.</div>`;
}

// ------------------------------------------------------------------ setup
function buildPresets() {
    const list = $('presets-list');
    for (const g of PRESETS) {
        const h = document.createElement('div'); h.className = 'menu-group'; h.textContent = g.group; list.appendChild(h);
        for (const it of g.items) {
            const b = document.createElement('button'); b.type = 'button';
            b.innerHTML = `<span>${tex(it.label)}${it.note ? ` <span class="pr-poly">${tex(it.note)}</span>` : ''}</span><span class="pr-poly">${tex(it.poly)}</span>`;
            b.addEventListener('click', () => { polyField.latex(it.poly); $('presets').open = false; compute(); });
            list.appendChild(b);
        }
    }
    document.addEventListener('click', (e) => { if (!$('presets').contains(e.target)) $('presets').open = false; });
}

function init() {
    renderStaticMath();
    MQ = window.MathQuill.getInterface(2);
    polyField = MQ.MathField($('in-poly'), { spaceBehavesLikeTab: true, handlers: { enter: compute } });
    matFields = ['m-a', 'm-b', 'm-c', 'm-d'].map((id) => MQ.MathField($(id), { spaceBehavesLikeTab: true, autoCommands: 'sqrt omega theta eta varphi zeta', handlers: { enter: askWord } }));
    buildPresets();
    $('run').addEventListener('click', compute);
    $('stop').addEventListener('click', () => { startWorker(); setBusy(false); setStatus('Stopped.'); });
    $('budget').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        state.seconds = +b.dataset.s;
        $('budget').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    document.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', async () => {
        if (!state.data) return;
        try { await navigator.clipboard.writeText(exportText(b.dataset.export)); $('copied').textContent = 'Copied.'; } catch { $('copied').textContent = 'Copy failed (clipboard not available).'; }
        setTimeout(() => { $('copied').textContent = ''; }, 2000);
    }));
    $('word-run').addEventListener('click', askWord);
    $('word-random').addEventListener('click', () => { if (state.data) send({ type: 'random' }); });
    window.addEventListener('resize', () => { if (state.data) { clearTimeout(window.__nrgT); window.__nrgT = setTimeout(() => { drawGraph(state.data.cells); highlight(Math.max(0, state.hl)); }, 150); } });
    startWorker();
    const fromHash = () => {
        const m = /[#&]f=([^&]+)/.exec(location.hash);
        const plain = m ? decodeURIComponent(m[1]) : null;
        if (plain) {
            const p = findPreset(plain);
            polyField.latex(p ? p.poly : plain.replace(/\^(\d+)/g, '^{$1}').replace(/\*/g, ''));
        } else polyField.latex(DEFAULT.poly);
    };
    fromHash();
    compute();
    window.addEventListener('hashchange', () => {
        const m = /[#&]f=([^&]+)/.exec(location.hash);
        if (m && normPoly(decodeURIComponent(m[1])) === normPoly(state.lastPlain || '')) return;
        if (state.busy) startWorker();
        fromHash(); compute();
    });
    window.__nrg = { state, compute, worker: () => worker };
}

function whenReady() {
    if (window.katex && window.MathQuill && window.jQuery) init();
    else setTimeout(whenReady, 30);
}
whenReady();
