import { GlobalField, Place, unramifiedPolynomial, sub } from './localField.js';
import { drawTree, resetZoom, analyzeTree } from './treeVis.js';
import { setupMatrixInput, readInputs, getInputState, applyInputState, addRootInput, freshName, setConstantsExpanded } from './matrixInput.js';
import { serializeTowerContext } from '../../../../../assets/js/hyperbolic/tower.js';
import { makeLetters, computeOrbit, stabilizerWords, linkPermutation, cycles, wordString, translationLength } from './groupWords.js';
import { generateTree } from './treeGeneration.js';
import { EXAMPLES } from './examples.js';
import { decide, serializeDecision, wordText } from './discreteness.js';

const TREE_BUDGET = 3200;

// ───────────────────────── state ─────────────────────────

const ui = {
    primeIndex: 0,
    primeOf: null,               // a preset's element: choose the prime above p where it has positive valuation
    selectedId: null,
    rational: false,
    model: 'halfplane',          // 'halfplane' | 'disk' | 'tower'
    spread: null,                // tower growth exponent; null = automatic
};
let tower = null;            // the mounted 3D tower, if any
let current = null;          // the last successful computation
const fieldCache = new Map();
const placeCache = new Map();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const typeset = (...els) => { if (window.MathJax && typeof MathJax.typeset === 'function') { try { MathJax.typeset(els.filter(Boolean)); } catch (e) { /* loading */ } } };
const vertexHTML = (place, vt) => `⌊<span class="lbl">${esc(place.label(vt))}</span>⌋<sub>${vt.k}</sub>`;
const vertexTex = (place, vt) => `\\lfloor ${place.labelTex(vt)} \\rfloor_{${vt.k}}`;

/** A key for a tower: equal towers (same levels, same names) give equal keys. */
function towerKey(K) {
    return JSON.stringify(serializeTowerContext({ field: K, gens: [] }).levels.map((L) => [L.P, L.text]));
}
/** The field for a tower, made maximal at p too (cached). */
function getField(K, p) {
    const key = `${towerKey(K)}|${p}`;
    if (!fieldCache.has(key)) {
        if (fieldCache.size > 12) fieldCache.clear();
        const F = GlobalField.fromTower(K, { primes: [p] });
        F.cacheKey = key;
        fieldCache.set(key, F);
    }
    return fieldCache.get(key);
}
function getPlace(F, p, idx) {
    const key = `${F.cacheKey}|${idx}`;
    if (!placeCache.has(key)) {
        if (placeCache.size > 24) placeCache.clear();
        placeCache.set(key, new Place(F, p, idx));
    }
    return placeCache.get(key);
}

// ───────────────────────── the place panel ─────────────────────────

const pName = (i, n) => (n > 1 ? `\\mathfrak p_{${i + 1}}` : '\\mathfrak p');

function renderPlacePanel(F, p, place) {
    const primes = F.primesAbove(p);
    const n = primes.length;
    const pStr = String(p);
    // (p) = 𝔭₁^e₁ 𝔭₂^e₂ …
    let fac = '';
    if (!F.isQ) {
        const parts = primes.map((pr, i) => `${pName(i, n)}${pr.e > 1 ? `^{${pr.e}}` : ''}`).join('');
        const kind = n > 1 ? (primes.every((pr) => pr.e === 1 && pr.f === 1) ? 'splits completely' : 'splits')
            : primes[0].e > 1 ? (primes[0].f === 1 && primes[0].e === F.n ? 'is totally ramified' : 'ramifies')
                : primes[0].f === F.n ? 'is inert' : 'is prime';
        fac = `<p>$${pStr}$ ${kind} in $${F.describeTex()}$: &nbsp;$(${pStr}) = ${parts}$</p>`;
    }
    $('factorization').innerHTML = fac;

    const picker = $('prime-picker');
    picker.innerHTML = '';
    if (!F.isQ) {
        primes.forEach((pr, i) => {
            const b = document.createElement('button');
            b.className = `prime-chip${i === place.index ? ' active' : ''}`;
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', i === place.index ? 'true' : 'false');
            b.title = `e = ${pr.e}, f = ${pr.f}: residue field F_${pStr}${pr.f > 1 ? '^' + pr.f : ''}`;
            b.innerHTML = `$${pName(i, n)} = ${F.primeTex(pr)}$<span class="chip-ef">e=${pr.e} · f=${pr.f}</span>`;
            b.addEventListener('click', () => { if (ui.primeIndex !== i) { ui.primeIndex = i; calculate(); } });
            picker.appendChild(b);
        });
    }
    $('place-info').innerHTML = describePlace(F, place);
    const q = place.q;
    $('tree-subtitle').innerHTML = F.isQ
        ? `Tree of $\\mathsf{PGL}_2(\\mathbb{Q}_{${pStr}})$: ${q + 1}-regular, links $\\mathbb{P}^1(\\mathbb{F}_{${pStr}})$`
        : `Tree of $\\mathsf{PGL}_2(K_{\\mathfrak p})$, $K = ${F.describeTex()}$: ${q + 1}-regular, links $\\mathbb{P}^1(\\mathbb{F}_{${q}})$`;
    typeset($('factorization'), picker, $('place-info'), $('tree-subtitle'));
}

/** π-adic expansion as a sum: 2 + 1·5 + 2·5² + … */
function expansionTex(place, x, terms = 6) {
    const v = place.val(x);
    if (v === Infinity) return '0';
    const vt = place.canon(x, v + terms);
    const piTex = place.e === 1 ? String(place.p) : `(${place.F.tex(place.pi)})`;
    const parts = [];
    vt.d.forEach((di, i) => {
        if (!di) return;
        const j = vt.lo + i;
        const digit = place.digitTex(di);
        const dTex = place.f > 1 && /[+-]/.test(digit.slice(1)) ? `(${digit})` : digit;
        const pow = j === 0 ? '' : j === 1 ? piTex : `${piTex}^{${j}}`;
        parts.push(pow ? (digit === '1' ? pow : `${dTex}\\cdot ${pow}`) : dTex);
    });
    const O = place.e === 1 ? `O(${place.p}^{${vt.k}})` : `O(\\pi^{${vt.k}})`;
    return `${parts.join(' + ') || '0'} + ${O}`;
}

function describePlace(F, place) {
    const p = String(place.p), q = place.q, e = place.e, f = place.f;
    const Fq = `\\mathbb{F}_{${q}}`;
    const lines = [];
    if (F.isQ) {
        lines.push(`Residue field $\\mathbb{F}_{${p}}$, uniformizer $\\pi = ${p}$. Labels $\\lfloor x\\rfloor_k$ have $x\\in\\mathbb{Z}[1/${p}]$, $0\\le x<${p}^k$.`);
        return lines.map((l) => `<p>${l}</p>`).join('');
    }
    if (e === 1 && f === 1) {
        lines.push(`$K_{\\mathfrak p} = \\mathbb{Q}_{${p}}$: this prime is the embedding $K\\hookrightarrow\\mathbb{Q}_{${p}}$ with`);
        for (const g of F.gens.slice(0, 4)) {
            lines.push(`<span class="expansion">$${g.tex} \\mapsto ${expansionTex(place, g.elem, 6)}$</span>`);
        }
        lines.push(henselNote(F, place));
    } else {
        const Kp = e === 1 ? `the unramified extension of $\\mathbb{Q}_{${p}}$ of degree ${f}` : f === 1 ? `a ramified extension of $\\mathbb{Q}_{${p}}$ of degree ${e}` : `an extension of $\\mathbb{Q}_{${p}}$ of degree ${e * f}`;
        lines.push(`$K_{\\mathfrak p}$ is ${Kp}.`);
        if (f > 1) {
            let rf = `Residue field $${Fq}$`;
            if (place.residueGeneratedByGen && place.residuePoly) {
                const g = barTex(F.gens[place.residueGen].tex);
                rf += ` $= \\mathbb{F}_{${p}}[${g}]/(${polyTexBar(place.residuePoly, g)})$`;
            } else {
                rf += `, spanned over $\\mathbb{F}_{${p}}$ by ${place._beta.map((b) => `$${F.tex(b)}$`).join(', ')}`;
            }
            lines.push(`${rf}: every vertex has ${q + 1} neighbours, a copy of $\\mathbb{P}^1(${Fq})$.`);
        }
        if (e > 1) {
            lines.push(`Uniformizer $\\pi = ${F.tex(place.pi)}$, with $v_{\\mathfrak p}(${p}) = ${e}$: each edge of the $\\mathbb{Q}_{${p}}$-tree is cut into ${e}.`);
        }
        if (e === 1 && f > 1) lines.push(`Uniformizer $\\pi = ${p}$.`);
    }
    if (f === 1 && e === 1) lines.push(`Residue field $\\mathbb{F}_{${p}}$; the tree is the $\\mathbb{Q}_{${p}}$-tree, ${q + 1}-regular.`);
    return lines.map((l) => `<p>${l}</p>`).join('');
}

/** The residue ḡ of a generator, in TeX. */
const barTex = (tex) => (/^[A-Za-z]$|^\\[a-z]+$/.test(tex) ? `\\bar ${tex}` : `\\overline{${tex}}`);

function polyTexBar(c, g) {
    const parts = [];
    for (let i = c.length - 1; i >= 0; i--) {
        if (!c[i]) continue;
        const mono = i === 0 ? '' : i === 1 ? g : `${g}^{${i}}`;
        const coef = mono && c[i] === 1n ? '' : String(c[i]);
        parts.push(coef + mono);
    }
    return parts.join(' + ');
}

/**
 * The Hensel's-lemma story for a degree-one unramified prime: each generator
 * of K goes to a p-adic root of its minimal polynomial over ℚ.
 */
function henselNote(F, place) {
    const p = place.p;
    const ev = (poly, x) => { let s = 0n; for (let i = poly.length - 1; i >= 0; i--) s = (s * x + poly[i]) % p; return ((s % p) + p) % p; };
    const notes = [];
    for (const g of F.gens.slice(0, 4)) {
        if (place.val(g.elem) < 0) { notes.push(`$${g.tex}$ has a pole at $\\mathfrak p$, so its expansion starts at a negative power.`); continue; }
        const Fz = F.minpolyQ(g.elem);
        if (Fz[Fz.length - 1] % p === 0n) { notes.push(`The minimal polynomial of $${g.tex}$ has leading coefficient divisible by $${p}$.`); continue; }
        const r = BigInt(place.digitAt(place.canon(g.elem, 1), 0));       // g mod 𝔭, as an integer
        const der = Fz.slice(1).map((c, i) => c * BigInt(i + 1));
        const simple = ev(der, r) !== 0n;
        const roots = [];
        for (let x = 0n; x < p && x < 200n; x++) if (ev(Fz, x) === 0n) roots.push(x);
        const others = roots.filter((x) => x !== r);
        let s = `$${g.tex}\\equiv ${r} \\pmod{\\mathfrak p}$: `;
        if (simple) s += `a simple root of its minimal polynomial mod $${p}$, which Hensel's lemma lifts uniquely to $\\mathbb{Z}_{${p}}$.`;
        else s += `a repeated root of its minimal polynomial mod $${p}$, so Hensel's lemma alone does not pin down the lift; the prime $\\mathfrak p$ does.`;
        if (others.length) s += ` The other root${others.length > 1 ? 's' : ''} ${others.map((x) => `$${x}$`).join(', ')} mod $${p}$ give${others.length > 1 ? '' : 's'} the other choice${others.length > 1 ? 's' : ''}.`;
        notes.push(s);
    }
    return notes.map((t) => `<span class="hint">${t}</span>`).join('<br>');
}

// ───────────────────────── calculation ─────────────────────────

function showError(msg) {
    $('error-message').textContent = msg || '';
}

function readPrime() {
    const raw = ($('prime').value || '').trim();
    if (!/^\d+$/.test(raw)) throw new Error('p must be a prime number');
    const p = BigInt(raw);
    if (!NumberRingEngine._internal.isProbablePrime(p)) throw new Error(`${p} is not prime`);
    if (p > 100000n) throw new Error('please choose p below 100000');
    return p;
}

function calculate({ refit = false } = {}) {
    showError('');
    let F, p, place, input;
    try {
        p = readPrime();
    } catch (e) { showError(e.message); return; }

    // the generators, the constants, the base vertex (and a preset's prime) in one tower
    const extra = [{ id: 'vertex_q', label: 'Base vertex', src: $('vertex_q').value }];
    if (ui.primeOf) extra.push({ id: null, label: 'Example prime', src: ui.primeOf });
    try {
        input = readInputs(extra);
        if (!input.read.exact) {
            const r = input.read;
            throw new Error(`The tree needs exact numbers: ${r.reasonWhere ? `${r.reasonWhere}: ` : ''}${r.reason}.`);
        }
        if (!input.nMats) throw new Error('Add at least one matrix.');
    } catch (e) { showError(e.message); return; }
    const K = input.read.field;
    try {
        F = getField(K, p);
        const nPrimes = F.primesAbove(p).length;
        if (ui.primeOf) {
            const x = F.fromT(input.extra[1]);
            for (let i = 0; i < nPrimes; i++) if (getPlace(F, p, i).val(x) > 0) { ui.primeIndex = i; break; }
            ui.primeOf = null;
        }
        if (ui.primeIndex >= nPrimes) ui.primeIndex = 0;
        place = getPlace(F, p, ui.primeIndex);
    } catch (e) { console.error(e); showError(e.message); return; }
    renderPlacePanel(F, p, place);

    const mats = input.gens.map((M) => ({ a: F.fromT(M.a), b: F.fromT(M.b), c: F.fromT(M.c), d: F.fromT(M.d) }));
    let base;
    try {
        const k = parseInt($('vertex_k').value, 10);
        if (!Number.isFinite(k) || Math.abs(k) > 200) throw new Error('the level k must be an integer');
        base = place.canon(F.fromT(input.extra[0]), k);
    } catch (e) { showError(e.message); return; }

    const t0 = performance.now();
    const wordLength = Math.max(0, Math.min(12, parseInt($('wordLength').value, 10) || 0));
    let letters, orbit;
    try {
        letters = makeLetters(place, mats);
        orbit = computeOrbit(place, base, letters, wordLength);
    } catch (e) { console.error(e); showError(e.message); return; }
    const baseId = place.id(base);
    const image = orbit.actor.act(0, base);
    const imageId = place.id(image);
    const orbitIds = new Set(orbit.orbitMap.keys());
    const t1 = performance.now();

    current = { F, K, gensT: input.gens, p, place, mats, letters, orbit, base, baseId, image, imageId, orbitIds, wordLength };

    // results
    const lens = mats.map((m) => translationLength(place, m));
    const genRows = mats.map((m, i) => {
        const l = lens[i];
        return `<tr><td>$g_{${i + 1}}$</td><td>${l > 0 ? `<span class="hyp">hyperbolic</span>, $\\ell = ${l}$` : 'elliptic: fixes a vertex or an edge midpoint'}</td></tr>`;
    }).join('');
    $('output').innerHTML = `
        <p><strong>Base vertex</strong> &nbsp;$v = ${vertexTex(place, base)}$</p>
        <p><strong>$g_1 \\cdot v$</strong> &nbsp;$${vertexTex(place, image)}$, at distance ${place.dist(base, image)}</p>
        <table class="gen-table">${genRows}</table>
        <p class="meta">${orbit.wordCount.toLocaleString()} words, ${orbit.orbitMap.size.toLocaleString()} orbit vertices, ${(t1 - t0).toFixed(0)} ms${orbit.truncated ? ' — <span class="warn-text">word budget reached; shorten the word length</span>' : ''}</p>`;
    const nStab = orbit.orbitMap.get(baseId).count - 1;
    $('summary').textContent = `${orbit.orbitMap.size.toLocaleString()} orbit vertices · d(v, g₁v) = ${place.dist(base, image)} · ${nStab} word${nStab === 1 ? '' : 's'} fixing v — details in the Orbit tab`;

    renderOrbitInfo();
    renderStabilizer();
    updateVisualization({ refit });
    startDecision();
    typeset($('output'));
    writeURL();
    if (ui.selectedId && current.tree) {
        const node = current.drawn.root.descendants().find((d) => d.data.id === ui.selectedId);
        if (node) showSelected(node.data.vt); else ui.selectedId = null;
    }
}

function updateVisualization({ refit = false } = {}) {
    if (!current) return;
    const { place, orbit, base, baseId, imageId, orbitIds } = current;
    const radius = Math.max(0, Math.min(10, parseInt($('maxDistance').value, 10) || 0));
    const verts = [base].concat([...orbit.orbitMap.values()].map((e) => e.vertex).filter((v) => place.id(v) !== baseId));
    const tree = generateTree(place, verts, { radius, budget: TREE_BUDGET });
    current.tree = tree;
    const notes = [];
    if (tree.orbitTruncated) notes.push(`The orbit has ${orbit.orbitMap.size.toLocaleString()} vertices; the ${tree.orbitShown.toLocaleString()} nearest v are drawn.`);
    if (tree.radius < tree.requestedRadius) notes.push(`Neighbourhood distance reduced from ${tree.requestedRadius} to ${tree.radius} to keep the drawing near ${TREE_BUDGET.toLocaleString()} vertices.`);
    $('tree-note').textContent = notes.join(' ');
    const rationalOK = place.e === 1 && place.f > 1;
    $('rational-note').textContent = rationalOK
        ? `Vertices ⌊x⌋ₖ with x ∈ ℚ${sub(place.p)}: the ${place.pNum + 1}-regular tree of PGL₂(ℚ${sub(place.p)}) inside this ${place.q + 1}-regular one.`
        : 'Available at an unramified prime of residue degree f > 1 (try Unramified ℚ_{p^k} under Constants).';
    $('toggle-rational').disabled = !rationalOK;
    const onVertexClick = (vt) => { ui.selectedId = place.id(vt); showSelected(vt); showTab('orbit'); };
    const notesModel = {
        halfplane: 'Rooted at the end ∞: level k grows downward, and each vertex hangs from its parent ⌊x⌋ₖ₋₁.',
        disk: 'Centred on v. Radius depends only on the distance to v; edges are hyperbolic geodesics, and the boundary circle is the space of ends ℙ¹(K_𝔭).',
        tower: `Level k is a circle at height −k; a vertex sits at the angle given by its digits (over ℚ_p, x/pᵏ mod 1). Drag to orbit, scroll to zoom.`,
    };
    $('model-note').textContent = notesModel[ui.model];
    $('spread-row').hidden = ui.model !== 'tower';
    if (ui.model === 'tower') {
        $('tree-vis').style.display = 'none';
        $('tower-host').hidden = false;
        const ctx = { ...analyzeTree(tree, orbitIds, baseId), place, baseId, imageId, orbitIds, selectedId: ui.selectedId,
            rationalSubtree: ui.rational && rationalOK, spread: ui.spread ?? undefined, onVertexClick };
        current.drawn = { root: ctx.root };
        import('./tower.js').then(({ mountTower }) => {
            if (tower) tower.destroy();
            tower = mountTower($('tower-host'), ctx);
            if (ui.spread == null) $('tower-spread').value = tower.spread.toFixed(2);
        }).catch((e) => { console.error(e); showError(`The 3D tower could not load: ${e.message}`); });
    } else {
        if (tower) { tower.destroy(); tower = null; }
        $('tower-host').hidden = true;
        $('tree-vis').style.display = '';
        current.drawn = drawTree({
            tree, place, baseId, imageId, orbitIds, selectedId: ui.selectedId, refit, model: ui.model,
            endsLabel: place.F.isQ ? `∂T = ℙ¹(ℚ${sub(place.p)})` : '∂T = ℙ¹(K𝔭)',
            rationalSubtree: ui.rational && rationalOK,
            onVertexClick,
            onVertexDblClick: (vt) => makeBase(vt),
        });
    }
}

function makeBase(vt) {
    if (!current) return;
    $('vertex_q').value = current.F.source(current.place.elem(vt));
    $('vertex_k').value = String(vt.k);
    ui.selectedId = current.place.id(vt);
    calculate();
}

function renderOrbitInfo() {
    const { place, letters, orbit, base } = current;
    const entries = [...orbit.orbitMap.values()].sort((a, b) => a.minLength - b.minLength || place.dist(base, a.vertex) - place.dist(base, b.vertex));
    const SHOW = 200;
    let html = `<p class="label-hint">${entries.length.toLocaleString()} vertices, nearest first.</p><div class="scroll-list">`;
    for (const { vertex, words, minLength } of entries.slice(0, SHOW)) {
        const shortest = words.filter((w) => w.length === minLength).slice(0, 3).map((w) => wordString(letters, w));
        html += `<div class="list-item"><div class="head">${vertexHTML(place, vertex)} <span class="label-hint">d = ${place.dist(base, vertex)}</span></div>`;
        html += `<div class="sub">via ${esc(shortest.join(', '))}${words.length > 3 ? ', …' : ''}</div></div>`;
    }
    if (entries.length > SHOW) html += `<p class="empty-message">… and ${(entries.length - SHOW).toLocaleString()} more</p>`;
    $('orbit-info').innerHTML = html + '</div>';
}

function pointLabel(place, i) { return i === 0 ? '∞' : place.digitLabel(i - 1); }

function renderStabilizer() {
    const { place, letters, orbit, base, baseId } = current;
    const words = stabilizerWords(orbit.orbitMap, baseId);
    const el = $('stabilizer-elements');
    if (!words.length) { el.innerHTML = '<p class="empty-message">No nontrivial word up to this length fixes the base vertex.</p>'; return; }
    const total = orbit.orbitMap.get(baseId).count - 1;
    let html = `<p class="label-hint">${total} word${total === 1 ? '' : 's'} fix the base vertex${total > words.length ? ` (showing ${words.length})` : ''}.</p>`;
    for (const w of words) {
        let action = '';
        try {
            const perm = linkPermutation(place, orbit.actor, w, base);
            const cyc = cycles(perm);
            if (!cyc.length) action = '<span class="label-hint">acts trivially on the link</span>';
            else if (place.q <= 16) action = cyc.map((c) => `(${c.map((i) => esc(pointLabel(place, i))).join(' ')})`).join('');
            else action = `cycle type ${cyc.map((c) => c.length).sort((a, b) => b - a).join('·')}`;
        } catch (e) { action = ''; }
        html += `<div class="list-item word-row" style="--chip: var(--accent)"><span class="word-len">${w.length}</span><code>${esc(wordString(letters, w))}</code><span class="perm">${action}</span></div>`;
    }
    el.innerHTML = html;
}

function showSelected(vt) {
    if (!current) return;
    const { place, letters, orbit, base } = current;
    const id = place.id(vt);
    let html = `<p><strong>Vertex</strong> &nbsp;$${vertexTex(place, vt)}$</p>`;
    html += `<p>Distance to $v$: ${place.dist(base, vt)}</p>`;
    const e = orbit.orbitMap.get(id);
    if (e) {
        const ws = [...e.words].sort((a, b) => a.length - b.length);
        html += `<p class="in-orbit">In the orbit, reached by ${e.count} word${e.count === 1 ? '' : 's'}:</p><div class="scroll-list">`;
        for (const w of ws.slice(0, 10)) html += `<div class="word-row"><span class="word-len">${w.length}</span><code>${esc(wordString(letters, w))}</code></div>`;
        if (e.count > 10) html += `<p class="label-hint">… and ${e.count - 10} more</p>`;
        html += '</div>';
    } else {
        html += '<p class="label-hint">Not in the computed orbit.</p>';
    }
    if (place.q <= 12) {
        const parent = place.parent(vt);
        html += `<p class="label-hint" style="margin-top:8px">Link $\\mathbb{P}^1(\\mathbb{F}_{${place.q}})$:</p><div class="link-list">`;
        html += `<div><span class="pt">∞</span> ${vertexHTML(place, parent)}</div>`;
        place.children(vt).forEach((c, r) => { html += `<div><span class="pt">${esc(place.digitLabel(r))}</span> ${vertexHTML(place, c)}</div>`; });
        html += '</div>';
    }
    html += `<button class="btn btn-add-alt" style="width:100%;margin-top:10px" id="make-base-btn">Make this the base vertex</button>`;
    const div = $('selected-vertex');
    div.innerHTML = html;
    $('make-base-btn').addEventListener('click', () => makeBase(vt));
    typeset(div);
}

// ───────────────────────── the discreteness decision ─────────────────────────

let worker = null, jobId = 0, workerBroken = false;

function startDecision() {
    if (!current) return;
    const { F, K, gensT, place, mats, base } = current;
    const id = ++jobId;
    const seconds = Math.max(1, Math.min(120, parseFloat($('decide-seconds').value) || 6));
    // the tower and the generators as plain data; the worker rebuilds the same field and place
    const job = {
        id, tower: serializeTowerContext({ field: K, gens: gensT }), p: String(place.p), primeIndex: place.index, base, seconds,
    };
    current.decision = null;
    renderVerdict({ pending: true });
    if (worker) { worker.terminate(); worker = null; }       // cancel the previous run
    if (!workerBroken) {
        try {
            worker = new Worker(new URL('./decideWorker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (ev) => {
                if (ev.data.id !== jobId) return;
                worker.terminate(); worker = null;
                finishDecision(ev.data.ok ? ev.data.result : { verdict: 'unknown', reason: ev.data.error, log: [] });
            };
            worker.onerror = (e) => {
                e.preventDefault?.();
                worker?.terminate(); worker = null; workerBroken = true;
                startDecision();                                   // retry on the page
            };
            worker.postMessage(job);
            return;
        } catch (e) { workerBroken = true; }
    }
    // no module workers here: decide on the page, after the current frame
    setTimeout(() => {
        if (id !== jobId) return;
        try { finishDecision(serializeDecision(F, decide(place, mats, base, { seconds: Math.min(seconds, 4) }))); }
        catch (e) { finishDecision({ verdict: 'unknown', reason: e.message, log: [] }); }
    }, 30);
}

function finishDecision(r) {
    if (!current) return;
    current.decision = r;
    renderVerdict(r);
}

const VERDICT_TEXT = { discrete: 'Discrete', nondiscrete: 'Not discrete', unknown: 'Undecided' };

function verdictTitle(r) {
    if (r.verdict === 'discrete') {
        if (r.kind === 'finite') return `Discrete — a finite group of order ${r.order}`;
        if (r.kind === 'free') return `Discrete — free of rank ${r.freeRank}`;
        if (r.kind === 'virtually-free') return 'Discrete — virtually free';
        return 'Discrete';
    }
    return VERDICT_TEXT[r.verdict] || r.verdict;
}

function renderVerdict(r) {
    const banner = $('status-banner');
    const box = $('verdict-box');
    const place = current?.place;
    const where = place ? (place.F.isQ ? `in PGL₂(ℚ${sub(place.p)})` : `at 𝔭 ${place.primes.length > 1 ? `= 𝔭${sub(place.index + 1)} ` : ''}above ${place.p}`) : '';
    banner.hidden = false;
    banner.classList.remove('verified', 'failed', 'warning', 'pending');
    if (r.pending) {
        banner.classList.add('pending');
        banner.querySelector('.status-banner-text').innerHTML = `Deciding discreteness ${where}…`;
        box.innerHTML = '<p class="verdict-head pending">Deciding…</p><p class="label-hint">Bounded test, then Conder or Markowitz, on a worker.</p>';
        $('basis-group').hidden = true;
        $('witness-group').hidden = true;
        $('cert-log').textContent = '(running)';
        return;
    }
    const tone = r.verdict === 'discrete' ? 'verified' : r.verdict === 'nondiscrete' ? 'failed' : 'warning';
    banner.classList.add(tone);
    banner.querySelector('.status-banner-text').innerHTML = `<b>${esc(verdictTitle(r))}</b> ${esc(where)}. ${esc(shortReason(r))}`;
    const methods = { bounded: 'boundedness (Serre, Helly)', elliptic: 'an elliptic word', conder: "Conder's Nielsen test", markowitz: "Markowitz's reduction", kernel: 'a torsion-free congruence kernel + Markowitz' };
    box.innerHTML = `<p class="verdict-head ${r.verdict}">${esc(verdictTitle(r))}</p>
        <p>${esc(r.reason || '')}</p>
        <p class="verdict-meta">${r.method ? `Method: ${esc(methods[r.method] || r.method)}. ` : ''}${r.kernel ? `Kernel mod 𝔮 above ${r.kernel.ell}: index ${r.kernel.index}, ${r.kernel.generators} Schreier generator${r.kernel.generators === 1 ? '' : 's'}.` : ''}</p>`;

    // basis
    const bg = $('basis-group');
    bg.hidden = !r.basis;
    if (r.basis) {
        $('basis-label').textContent = r.kind === 'virtually-free' ? 'Basis of the congruence kernel' : 'Free basis';
        $('use-basis').hidden = r.kind === 'virtually-free';
        $('basis-list').innerHTML = r.basis.map((b) => `<div class="list-item basis-item word-row" style="--chip: var(--success)">
            <code>${esc(wordText(b.w))}</code>
            <span class="nums">${b.len != null ? `|g| = ${b.len} · ` : ''}ℓ = ${b.ell}</span></div>`).join('');
    }
    // witness
    const wg = $('witness-group');
    wg.hidden = !r.witness;
    if (r.witness) {
        const t = r.witness.mat.tex;
        $('witness-box').innerHTML = `<p><code>${esc(wordText(r.witness.w))}</code> is elliptic of infinite order.</p>
            <div class="matrix-tex">$$\\begin{pmatrix} ${t[0]} & ${t[1]} \\\\ ${t[2]} & ${t[3]} \\end{pmatrix}$$</div>`;
    }
    // certificate log
    $('cert-log').innerHTML = certificateLog(r);
    typeset(box, $('witness-box'));
}

function shortReason(r) {
    if (r.verdict === 'unknown') return 'See the Verdict tab.';
    if (r.method === 'bounded') return r.kind === 'finite' ? 'It fixes a point of the tree.' : 'Infinite, but it fixes a point of the tree.';
    if (r.witness) return `${wordText(r.witness.w)} is elliptic of infinite order.`;
    if (r.method === 'conder') return "Conder's Nielsen test.";
    if (r.method === 'markowitz') return 'An N-reduced basis (Markowitz).';
    if (r.method === 'kernel') return 'Its torsion-free congruence kernel is free and discrete.';
    return '';
}

function certificateLog(r) {
    const L = [];
    const e = (s) => esc(s);
    L.push(`<b>Place</b>: p = ${e(r.prime || '')}, residue field of size q = ${r.q ?? '?'}; rank ${r.rank ?? '?'}.`);
    if (r.lengths) {
        L.push('<b>Translation lengths</b> ℓ = max(0, v(det) − 2v(tr)):');
        for (const s of r.lengths) L.push(`  ℓ(${e(wordText(s.w))}) = ${s.ell}${s.ell === 0 ? '  (elliptic)' : ''}`);
    }
    for (const s of r.log || []) L.push(e(s));
    if (r.conder) {
        L.push(`<b>Conder</b>: ${e(r.conder.outcome)}`);
        for (const st of r.conder.steps || []) L.push(`  ℓ(x), ℓ(y) = ${st.lengths.join(', ')};  ℓ(xy), ℓ(x⁻¹y) = ${st.products.join(', ')}`);
    }
    const mk = (title, m) => {
        if (!m) return;
        L.push(`<b>${title}</b>: ${e(m.outcome)} after ${m.moves} move${m.moves === 1 ? '' : 's'}${m.reason ? ` (${e(m.reason)})` : ''}`);
        for (const mv of (m.log || []).slice(0, 60)) {
            L.push(mv.kind === 'drop identity' || mv.kind === 'drop repeat'
                ? `  ${e(mv.kind)}`
                : `  b${mv.index + 1} ← ${e(mv.kind.replace('g', `b${mv.index + 1}`).replace('h', `b${mv.partner + 1}`))}: |·| ${mv.before} → ${mv.after}${mv.tie ? ' (tie, half-path order)' : ''}`);
        }
        if ((m.log || []).length > 60) L.push(`  … ${m.log.length - 60} more`);
    };
    mk('Markowitz', r.markowitz);
    if (r.kernel) L.push(`<b>Congruence kernel</b> mod 𝔮 above ${r.kernel.ell} (|O/𝔮| = ${r.kernel.q}): image of order ${r.kernel.index}, ${r.kernel.generators} Schreier generator${r.kernel.generators === 1 ? '' : 's'}.`);
    mk('Markowitz on the kernel', r.kernelMarkowitz);
    if (r.certificate) {
        L.push('<b>N-reduced</b> (checked independently): N1 no trivial or repeated elements; N2 |xy| ≥ |x|, |y|; N3 the cancellations from the left and right leave each |x| positive.');
        L.push(`  |b_i| = ${r.certificate.lengths.join(', ')};  N3 slack (twice) = ${r.certificate.slack.join(', ')};  ${r.certificate.checked} products checked`);
    }
    L.push(`<b>Verdict</b>: ${e(VERDICT_TEXT[r.verdict] || r.verdict)}. ${e(r.reason || '')}`);
    return L.join('\n');
}

// ───────────────────────── state, URL, examples ─────────────────────────

function getState() {
    const { mats, consts } = getInputState();
    return {
        v: 1,
        p: ($('prime').value || '').trim(),
        prime: ui.primeIndex,
        mats, consts,
        vertex: [$('vertex_q').value, $('vertex_k').value],
        L: $('wordLength').value,
        r: $('maxDistance').value,
        model: ui.model,
    };
}

function applyState(st) {
    $('prime').value = String(st.p ?? 3);
    ui.primeIndex = Number(st.prime) || 0;
    ui.primeOf = st.primeOf || null;          // resolved by the next calculate()
    const consts = (st.consts || []).slice();
    // links from before constants and fields were merged carry { field: { gen, poly } }
    // (i is built in, so ℚ(i) needs no row)
    if (st.field && st.field.poly && st.field.gen !== 'i') consts.unshift({ name: st.field.gen || 'w', poly: st.field.poly, near: null });
    applyInputState({ mats: st.mats, consts });
    $('vertex_q').value = String(st.vertex?.[0] ?? '0');
    $('vertex_k').value = String(st.vertex?.[1] ?? '0');
    $('wordLength').value = String(st.L ?? 3);
    $('maxDistance').value = String(st.r ?? 2);
    setModel(st.model || 'halfplane', false);
    ui.selectedId = null;
}

const PREFIX = '#s=';
function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(b64) {
    const s = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function readURL() {
    const h = location.hash || '';
    if (!h.startsWith(PREFIX)) return null;
    try { const st = JSON.parse(fromB64(h.slice(PREFIX.length))); return st && st.v === 1 ? st : null; }
    catch (e) { return null; }
}
function writeURL() {
    if (window.self !== window.top) return;           // embedded: leave the host's URL alone
    try { history.replaceState(null, '', location.pathname + location.search + PREFIX + toB64(JSON.stringify(getState()))); }
    catch (e) { /* sandboxed */ }
}

function setupExamples() {
    const sel = $('example-select');
    const groups = [...new Set(EXAMPLES.map((ex) => ex.group || 'Trees over number fields'))];
    sel.innerHTML = '<option value="">Choose an example…</option>' + groups.map((gname) =>
        `<optgroup label="${esc(gname)}">` +
        EXAMPLES.map((ex, i) => ((ex.group || 'Trees over number fields') === gname ? `<option value="${i}">${esc(ex.name)}</option>` : '')).join('') +
        '</optgroup>').join('');
    sel.addEventListener('change', () => {
        const ex = EXAMPLES[parseInt(sel.value, 10)];
        if (!ex) return;
        applyState(ex);
        calculate({ refit: true });
        const note = $('example-note');
        note.hidden = !ex.note;
        note.innerHTML = ex.note || '';
        if (ex.note) typeset(note);
    });
}

// ───────────────────────── wiring ─────────────────────────

function setModel(model, redraw = true) {
    if (!['halfplane', 'disk', 'tower'].includes(model)) model = 'halfplane';
    ui.model = model;
    document.querySelectorAll('.model-opt').forEach((b) => b.classList.toggle('active', b.dataset.model === model));
    if (redraw && current) { updateVisualization({ refit: true }); writeURL(); }
}

function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${name}`));
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupMatrixInput(() => calculate());
    setupExamples();
    $('budget-label').textContent = String(TREE_BUDGET);

    $('collapse-btn').addEventListener('click', () => $('control-panel').classList.toggle('collapsed'));
    document.querySelectorAll('.model-opt').forEach((b) => b.addEventListener('click', () => setModel(b.dataset.model)));
    $('tower-spread').addEventListener('input', () => { ui.spread = parseFloat($('tower-spread').value); if (ui.model === 'tower') updateVisualization(); });
    $('decide-again').addEventListener('click', () => startDecision());
    const banner = $('status-banner');
    banner.querySelector('.status-banner-close').addEventListener('click', (e) => { e.stopPropagation(); banner.classList.add('collapsed'); });
    banner.addEventListener('click', () => {
        if (banner.classList.contains('collapsed')) { banner.classList.remove('collapsed'); return; }
        showTab('verdict');
        if ($('control-panel').classList.contains('collapsed')) $('control-panel').classList.remove('collapsed');
    });
    $('use-basis').addEventListener('click', () => {
        const r = current?.decision;
        if (!r || !r.basis) return;
        applyInputState({ mats: r.basis.map((b) => b.mat.text.map((t) => t.replace(/−/g, '-'))), consts: [] });
        showTab('group');
        calculate({ refit: true });
    });
    $('calculateBtn').addEventListener('click', () => calculate());
    $('refresh-btn').addEventListener('click', () => calculate());
    $('reset-zoom').addEventListener('click', () => (ui.model === 'tower' ? tower?.resetView() : resetZoom()));
    $('maxDistance').addEventListener('change', () => { updateVisualization(); writeURL(); });
    $('wordLength').addEventListener('change', () => calculate());
    $('prime').addEventListener('change', () => { ui.primeIndex = 0; ui.selectedId = null; calculate({ refit: true }); });
    $('prime').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    for (const id of ['vertex_q', 'vertex_k']) {
        $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') calculate(); });
    }
    $('unram-btn').addEventListener('click', () => {
        try {
            const p = readPrime();
            const k = Math.max(2, Math.min(6, parseInt($('unram-k').value, 10) || 2));
            const name = freshName(['u', 'w', 'v', 'x', 'y', 'z']) || 'u';
            addRootInput(name, unramifiedPolynomial(p, k, name));
            setConstantsExpanded(true);
            ui.primeIndex = 0;
            calculate({ refit: true });
        } catch (e) { showError(e.message); }
    });
    $('toggle-rational').addEventListener('click', () => {
        ui.rational = !ui.rational;
        $('toggle-rational').classList.toggle('active', ui.rational);
        updateVisualization();
    });
    $('stabilizer-details').addEventListener('toggle', () => { if ($('stabilizer-details').open) typeset($('stabilizer-details')); });
    $('copy-link').addEventListener('click', async () => {
        writeURL();
        const url = location.origin + location.pathname + location.search + PREFIX + toB64(JSON.stringify(getState()));
        try { await navigator.clipboard.writeText(url); $('copy-link').textContent = 'Link copied'; }
        catch (e) { $('copy-link').textContent = 'Copy failed — the URL bar has the link'; }
        setTimeout(() => { $('copy-link').textContent = 'Copy link to this tree'; }, 1800);
    });
    window.addEventListener('resize', () => { if (current) updateVisualization(); });

    applyState(readURL() || EXAMPLES[0]);
    calculate({ refit: true });
});
