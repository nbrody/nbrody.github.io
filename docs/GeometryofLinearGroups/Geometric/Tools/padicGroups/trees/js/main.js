import { GlobalField, Place, latexToPlain, unramifiedPolynomial, sub } from './localField.js';
import { drawTree, resetZoom } from './treeVis.js';
import { setupMatrixInput, readMatrices, getInputState, applyInputState } from './matrixInput.js';
import { makeLetters, computeOrbit, stabilizerWords, linkPermutation, cycles, wordString, translationLength } from './groupWords.js';
import { generateTree } from './treeGeneration.js';
import { EXAMPLES } from './examples.js';

const TREE_BUDGET = 3200;

// ───────────────────────── state ─────────────────────────

const ui = {
    fieldOn: false,
    primeIndex: 0,
    selectedId: null,
    rational: false,
};
let current = null;          // the last successful computation
const fieldCache = new Map();
const placeCache = new Map();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const typeset = (...els) => { if (window.MathJax && typeof MathJax.typeset === 'function') { try { MathJax.typeset(els.filter(Boolean)); } catch (e) { /* loading */ } } };
const vertexHTML = (place, vt) => `⌊<span class="lbl">${esc(place.label(vt))}</span>⌋<sub>${vt.k}</sub>`;
const vertexTex = (place, vt) => `\\lfloor ${place.labelTex(vt)} \\rfloor_{${vt.k}}`;

function fieldSpec() {
    if (!ui.fieldOn) return null;
    return { gen: ($('field-gen').value || 'w').trim(), poly: ($('field-poly').value || '').trim() };
}
function getField(spec) {
    const key = spec ? `${spec.gen}|${spec.poly.replace(/\s+/g, '')}` : 'Q';
    if (!fieldCache.has(key)) fieldCache.set(key, new GlobalField(spec));
    return fieldCache.get(key);
}
function getPlace(F, p, idx) {
    const key = `${F.isQ ? 'Q' : `${F.gen}|${F.polyPlain()}`}|${p}|${idx}`;
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
    const g = F.genTex();
    if (e === 1 && f === 1) {
        lines.push(`$K_{\\mathfrak p} = \\mathbb{Q}_{${p}}$: this prime is the embedding $K\\hookrightarrow\\mathbb{Q}_{${p}}$ with`);
        lines.push(`<span class="expansion">$${g} \\mapsto ${expansionTex(place, F.generator(), 6)}$</span>`);
        lines.push(henselNote(F, place));
    } else {
        const Kp = e === 1 ? `the unramified extension of $\\mathbb{Q}_{${p}}$ of degree ${f}` : f === 1 ? `a ramified extension of $\\mathbb{Q}_{${p}}$ of degree ${e}` : `an extension of $\\mathbb{Q}_{${p}}$ of degree ${e * f}`;
        lines.push(`$K_{\\mathfrak p}$ is ${Kp}.`);
        if (f > 1) {
            let rf = `Residue field $${Fq}$`;
            if (place.residueGeneratedByGen && place.residuePoly) {
                rf += ` $= \\mathbb{F}_{${p}}[\\bar ${g}]/(${polyTexBar(place.residuePoly, g)})$`;
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

function polyTexBar(c, g) {
    const parts = [];
    for (let i = c.length - 1; i >= 0; i--) {
        if (!c[i]) continue;
        const mono = i === 0 ? '' : i === 1 ? `\\bar ${g}` : `\\bar ${g}^{${i}}`;
        const coef = mono && c[i] === 1n ? '' : String(c[i]);
        parts.push(coef + mono);
    }
    return parts.join(' + ');
}

/** The Hensel's-lemma story for a degree-one unramified prime. */
function henselNote(F, place) {
    const p = place.p, g = F.genTex();
    const w = F.generator();
    if (place.val(w) < 0) return `<span class="hint">(${F.gen} has a pole at $\\mathfrak p$, so the expansion starts at a negative power.)</span>`;
    const r = BigInt(place.digitAt(place.canon(w, 1), 0));     // w mod 𝔭, as an integer
    const Fz = F.Fint;
    const ev = (poly, x) => { let s = 0n; for (let i = poly.length - 1; i >= 0; i--) s = (s * x + poly[i]) % p; return ((s % p) + p) % p; };
    const der = Fz.slice(1).map((c, i) => c * BigInt(i + 1));
    const lead = ((Fz[Fz.length - 1] % p) + p) % p;
    if (lead === 0n) return `<span class="hint">The leading coefficient of the minimal polynomial vanishes mod ${p}.</span>`;
    const simple = ev(der, r) !== 0n;
    const roots = [];
    for (let x = 0n; x < p && x < 200n; x++) if (ev(Fz, x) === 0n) roots.push(x);
    const others = roots.filter((x) => x !== r);
    let s = `Here $${g}\\equiv ${r} \\pmod{\\mathfrak p}$. `;
    if (simple) s += `Since $${r}$ is a simple root of the minimal polynomial mod $${p}$, Hensel's lemma lifts it to a unique root in $\\mathbb{Z}_{${p}}$.`;
    else s += `The root $${r}$ is repeated mod $${p}$, so Hensel's lemma alone does not pin down the lift; the prime $\\mathfrak p$ does.`;
    if (others.length) s += ` The other root${others.length > 1 ? 's' : ''} ${others.map((x) => `$${x}$`).join(', ')} mod $${p}$ give${others.length > 1 ? '' : 's'} the other choice${others.length > 1 ? 's' : ''}.`;
    return `<span class="hint">${s}</span>`;
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
    $('field-error').textContent = '';
    let F, p, place;
    try {
        p = readPrime();
    } catch (e) { showError(e.message); return; }
    try {
        F = getField(fieldSpec());
    } catch (e) {
        $('field-error').textContent = e.message;
        showError('Fix the number field to continue.');
        return;
    }
    try {
        const nPrimes = F.primesAbove(p).length;
        if (ui.primeIndex >= nPrimes) ui.primeIndex = 0;
        place = getPlace(F, p, ui.primeIndex);
    } catch (e) { showError(e.message); return; }
    renderPlacePanel(F, p, place);

    let mats, base;
    try {
        mats = readMatrices(F);
        if (!mats.length) throw new Error('Add at least one matrix.');
        const x = F.parse(latexToPlain($('vertex_q').value));
        const k = parseInt($('vertex_k').value, 10);
        if (!Number.isFinite(k) || Math.abs(k) > 200) throw new Error('the level k must be an integer');
        base = place.canon(x, k);
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

    current = { F, p, place, mats, letters, orbit, base, baseId, image, imageId, orbitIds, wordLength };

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
        : 'Available at an unramified prime of residue degree f > 1 (try the Quick unramified extension in the number-field panel).';
    $('toggle-rational').disabled = !rationalOK;
    current.drawn = drawTree({
        tree, place, baseId, imageId, orbitIds, selectedId: ui.selectedId, refit,
        rationalSubtree: ui.rational && rationalOK,
        onVertexClick: (vt) => { ui.selectedId = place.id(vt); showSelected(vt); showTab('orbit'); },
    });
    // double-click to re-base
    d3.selectAll('#tree-vis .node').on('dblclick', (event, d) => { event.stopPropagation(); makeBase(d.data.vt); });
}

function makeBase(vt) {
    if (!current) return;
    $('vertex_q').value = current.place.label(vt).replace(/−/g, '-');
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

// ───────────────────────── state, URL, examples ─────────────────────────

function getState() {
    const { mats, consts } = getInputState();
    return {
        v: 1,
        p: ($('prime').value || '').trim(),
        field: ui.fieldOn ? { gen: $('field-gen').value.trim(), poly: $('field-poly').value.trim() } : null,
        prime: ui.primeIndex,
        mats, consts,
        vertex: [$('vertex_q').value, $('vertex_k').value],
        L: $('wordLength').value,
        r: $('maxDistance').value,
    };
}

function setFieldUI(on) {
    ui.fieldOn = on;
    $('field-panel').hidden = !on;
    const btn = $('toggle-field');
    btn.classList.toggle('active', on);
    btn.textContent = on ? 'Number field: on' : 'Number field';
}

function applyState(st) {
    $('prime').value = String(st.p ?? 3);
    if (st.field) {
        $('field-gen').value = st.field.gen || 'w';
        $('field-poly').value = st.field.poly || '';
    }
    setFieldUI(!!st.field);
    ui.primeIndex = Number(st.prime) || 0;
    if (st.primeOf && st.field) {
        // choose the prime at which the given element has positive valuation
        try {
            const F = getField(st.field);
            const x = F.parse(st.primeOf);
            const n = F.primesAbove(BigInt(st.p)).length;
            for (let i = 0; i < n; i++) if (getPlace(F, BigInt(st.p), i).val(x) > 0) { ui.primeIndex = i; break; }
        } catch (e) { /* keep the index */ }
    }
    applyInputState({ mats: st.mats, consts: st.consts || [] });
    $('vertex_q').value = String(st.vertex?.[0] ?? '0');
    $('vertex_k').value = String(st.vertex?.[1] ?? '0');
    $('wordLength').value = String(st.L ?? 3);
    $('maxDistance').value = String(st.r ?? 2);
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
    sel.innerHTML = '<option value="">Choose an example…</option>' +
        EXAMPLES.map((ex, i) => `<option value="${i}">${esc(ex.name)}</option>`).join('');
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

function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${name}`));
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupMatrixInput();
    setupExamples();
    $('budget-label').textContent = String(TREE_BUDGET);

    $('collapse-btn').addEventListener('click', () => $('control-panel').classList.toggle('collapsed'));
    $('calculateBtn').addEventListener('click', () => calculate());
    $('refresh-btn').addEventListener('click', () => calculate());
    $('reset-zoom').addEventListener('click', () => resetZoom());
    $('maxDistance').addEventListener('change', () => { updateVisualization(); writeURL(); });
    $('wordLength').addEventListener('change', () => calculate());
    $('prime').addEventListener('change', () => { ui.primeIndex = 0; ui.selectedId = null; calculate({ refit: true }); });
    $('prime').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    for (const id of ['vertex_q', 'vertex_k']) {
        $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') calculate(); });
    }
    $('toggle-field').addEventListener('click', () => {
        setFieldUI(!ui.fieldOn);
        ui.primeIndex = 0;
        calculate({ refit: true });
    });
    for (const id of ['field-gen', 'field-poly']) {
        $(id).addEventListener('change', () => { ui.primeIndex = 0; calculate({ refit: true }); });
    }
    $('unram-btn').addEventListener('click', () => {
        try {
            const p = readPrime();
            const k = Math.max(2, Math.min(6, parseInt($('unram-k').value, 10) || 2));
            const gen = ($('field-gen').value || 'w').trim() || 'w';
            $('field-poly').value = unramifiedPolynomial(p, k, gen);
            ui.primeIndex = 0;
            calculate({ refit: true });
        } catch (e) { $('field-error').textContent = e.message; }
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
