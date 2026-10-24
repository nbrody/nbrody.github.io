/**
 * Presentation Database: reads results.jsonl (written by ../batch/run.mjs,
 * one pipeline record per pair over ℚ) or, for a number field, the records of
 * that field in results-nf.jsonl (../batch/runNF.mjs), and shows the summary
 * by height and the groups, the undetermined ones first. Where the run logs are
 * absent (the published site), it reads the slim exports in web/ instead
 * (export-web.mjs).
 */
import { FIELDS } from '../batch/enumerateNF.mjs';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tex = (t) => (window.katex ? window.katex.renderToString(t, { throwOnError: false }) : esc(t));
const minus = (s) => String(s).replace(/-/g, '−');

const VERDICTS = [
    { key: 'notdense', label: 'Not dense', head: 'Not Zariski dense' },
    { key: 'discrete', label: 'Discrete at a place', head: 'Discrete' },
    { key: 'sarith', label: 'S-arithmetic', head: 'S-arithmetic' },
    { key: 'thin', label: 'Thin', head: 'Thin' },
    { key: 'open', label: 'Undetermined', head: 'Undetermined' },
    { key: 'timeout', label: 'Timed out', head: 'Timed out' },
    { key: 'error', label: 'Error', head: 'Error' },
];
const UNDETERMINED = new Set(['open', 'timeout', 'error']);
// presentations of the S-arithmetic groups (batch/presentations.mjs), by key; loaded after the table
let presentations = new Map();

const WHY = {
    'no-covering': 'FlashBeam ran out of budget before covering the trees, and found no element of infinite order fixing the basepoint (one would make the covering unnecessary). Γ may be S-arithmetic or thin.',
    'index-limit': 'Coset enumeration in PGL₂(ℤ[1/S]) did not close within its budget (FlashBeam was not run). Γ may have large index or be thin.',
    'stab-not-lattice': 'The vertex orbits on the trees are known (a covering re-checked exactly, or an element of infinite order fixing the basepoint, which makes the closure of Γ open), but the elements found fixing the basepoint were not shown to be a lattice at ∞.',
    'verify-failed': 'A covering was found but did not survive the exact re-check.',
    'S-empty': 'Γ is bounded at every prime, so the certificate has no tree to cover, and poincare did not prove Γ discrete at ∞.',
    'multi-arch': 'The quaternion algebra splits at two or more places at ∞; the certificate handles at most one.',
    'arch-classes': 'The unbounded places at ∞ could not be matched with the place of k where the algebra splits.',
    'not-real': 'The algebra splits at a real place of k, but the generators are not written over ℝ there.',
    'bounded': 'Γ is bounded at every place, so there is nothing to search.',
    'sarith-error': 'FlashBeam stopped with an error.',
    'timeout': 'The pipeline did not finish within the time limit.',
    'crash': 'The pipeline crashed.',
    'zariski': 'The Zariski closure could not be computed.',
    'read': 'The generators could not be read.',
    'not-exact': 'An entry is not an exact algebraic number.',
};

const PAGE = 100;
let all = [], shown = PAGE;
let classOf = null, pairRows = [], groupRows = [];

const sigma1 = ([a, b, c, d]) => { const f = a * a + b * b + c * c + d * d, D = a * d - b * c; return Math.sqrt((f + Math.sqrt(Math.max(f * f - 4 * D * D, 0))) / 2); };
/** One row per canonical group: the reduced pair, with the verdict of a decided member (else the reduced pair's own record). */
function groupAll(rows, G) {
    const byClass = new Map();
    for (const r of rows) {
        const gk = classOf.get(r.key);
        if (!gk) { byClass.set(r.key, { gk: r.key, rs: [r] }); continue; }
        if (!byClass.has(gk)) byClass.set(gk, { gk, rs: [] });
        byClass.get(gk).rs.push(r);
    }
    const out = [];
    for (const { gk, rs } of byClass.values()) {
        const dec = rs.filter((r) => !UNDETERMINED.has(r.verdict)).sort((x, y) => (x.at < y.at ? 1 : -1));
        const own = rs.find((r) => r.key === gk);
        const r = dec[0] || own || rs[0];
        const g = gk.split('|').map((m) => m.split(',').map(Number));
        const s1 = g.map(sigma1), h = s1.map(Math.log);
        out.push({ ...r, key: gk, g, s1, h, hmax: Math.max(...h), B: Math.max(...s1), hsum: h[0] + h[1],
            members: (G[gk] ? G[gk].members.length : rs.length), present: rs.map((x) => x.key), via: r.key !== gk ? r.key : null });
    }
    return out;
}
const state = { verdicts: new Set(UNDETERMINED), why: '', bound: Infinity, set: 'exhaustive', field: new URLSearchParams(location.search).get('field') || 'Q' };
const isNF = () => state.field !== 'Q';
const hLabel = () => (isNF() ? 'e^h' : 'σ₁');
let nfFields = [];
let hasRandom = false;
let samples = [], exBound = 0;

/** Data sets: every pair up to the exhaustive bound, each random sample (database/samples.json), or all. */
function setOptions() {
    const out = [];
    if (state.field === 'random') {
        for (const x of [...new Set(all.map((r) => r.set).filter(Boolean))].sort()) out.push({ value: x, label: x.replace('random-model-seed', 'seed ') });
        out.push({ value: 'all', label: 'every draw' });
        return out;
    }
    if (isNF()) {
        for (const x of [...new Set(all.map((r) => r.set).filter(Boolean))].sort()) out.push({ value: x, label: `sample ${x}` });
        out.push({ value: 'all', label: `everything over ${FIELDS[state.field] ? FIELDS[state.field].name : state.field}` });
        return out;
    }
    if (exBound) out.push({ value: 'exhaustive', label: `every pair with σ₁ ≤ ${+exBound.toFixed(3)}` });
    for (const x of samples) out.push({ value: x.name, label: `${x.n} random pairs with σ₁ ≤ ${x.bound} (seed ${x.seed})` });
    out.push({ value: 'all', label: 'everything in the database' });
    return out;
}
let sampleKeys = new Map();
function inSet(r) {
    if (state.set === 'all') return true;
    if (isNF()) return r.set === state.set;
    if (state.set === 'exhaustive') return r.B <= exBound + 1e-9;
    const ks = sampleKeys.get(state.set);
    return !!ks && (ks.has(r.key) || (r.present || []).some((k) => ks.has(k)));
}

// ───────────────────────── loading ─────────────────────────

/**
 * The records of a run log: the full log (name.jsonl, one record per line) when it is here, which
 * it is on the machine that runs the batches; otherwise the slim export web/name.json (a JSON
 * array, one record per pair; database/export-web.mjs), which is what the published site has.
 * null when neither exists.
 */
async function fetchRecords(name) {
    for (const url of [name, `web/${name.replace(/\.jsonl$/, '.json')}`]) {
        let text;
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            text = await res.text();
        } catch (e) { continue; }
        if (text.trimStart().startsWith('[')) return JSON.parse(text);
        const recs = [];
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try { recs.push(JSON.parse(line)); } catch (e) { /* a line being written */ }
        }
        return recs;
    }
    return null;
}

async function load() {
    // the number fields in results-nf.jsonl, for the field selector
    const nfRecs = (await fetchRecords('results-nf.jsonl')) || [];
    nfFields = [...new Set(nfRecs.map((r) => r.field).filter(Boolean))];
    // the random model (batch/runRandom.mjs): groups over any field, any number of generators
    const randRecs = (await fetchRecords('results-random.jsonl')) || [];
    hasRandom = randRecs.length > 0;
    buildFieldSelect();
    if (state.field === 'random') { loadRandom(randRecs); return; }
    if (isNF()) { loadNF(nfRecs); return; }
    const recs = await fetchRecords('results.jsonl');
    if (!recs) {
        $('summary').innerHTML = `<p class="err">Could not read results.jsonl. Fill it with <code>node batch/run.mjs --bound 3</code> from the PresentationCalc folder.</p>`;
        return;
    }
    // per group the latest record, except that a decided one (a certificate) is never hidden by a
    // later run that did not decide (budgets are time-dependent)
    const byKey = new Map();
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    for (const r of recs) {
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    all = [...byKey.values()].map((r) => ({ ...r, B: Math.max(...r.s1), hsum: r.h.reduce((a, b) => a + b, 0) }));
    loadPresentations();
    // canonical groups (batch/groups.mjs: Gauss reduction under PGL₂(ℤ) and Gilman–Maskit reduction of the
    // generators): pairs in one class generate conjugate groups, so one row per class, with the verdict
    // of any decided member
    try {
        const res = await fetch('groups.json', { cache: 'no-store' });
        if (res.ok) {
            const G = (await res.json()).groups || {};
            classOf = new Map();
            for (const [gk, g] of Object.entries(G)) for (const m of g.members) classOf.set(m, gk);
            pairRows = all;
            groupRows = groupAll(all, G);
            const want = new URLSearchParams(location.search).get('groups');
            state.byGroup = want !== '0';
            if (state.byGroup) all = groupRows;
        }
    } catch (e) { /* no grouping */ }
    // the exhaustive runs' records carry no data-set name
    exBound = 0;
    for (const r of recs) if (!r.set) exBound = Math.max(exBound, ...r.s1);
    try {
        const res = await fetch('samples.json', { cache: 'no-store' });
        if (res.ok) samples = await res.json();
    } catch (e) { samples = []; }
    sampleKeys = new Map(samples.map((x) => [x.name, new Set(x.keys)]));
    const want = new URLSearchParams(location.search).get('set');
    if (want && (want === 'all' || want === 'exhaustive' || sampleKeys.has(want))) state.set = want;
    else if (!exBound && samples.length) state.set = samples[samples.length - 1].name;
    all.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
    const latest = all.reduce((m, r) => (r.at > m ? r.at : m), '');
    const tags = new Set(all.map((r) => r.tag));
    $('db-meta').textContent = `${all.length} groups${tags.size > 1 ? `, ${tags.size} settings` : ''} · updated ${latest.slice(0, 16).replace('T', ' ')} UTC`;
    buildControls();
    render();
}

function buildFieldSelect() {
    const sel = $('field-select');
    if (!sel) return;
    const opts = [{ v: 'Q', l: 'ℚ' }].concat(Object.entries(FIELDS).filter(([k]) => nfFields.includes(k)).map(([k, F]) => ({ v: k, l: F.name })));
    if (hasRandom) opts.push({ v: 'random', l: 'random model (any field)' });
    sel.innerHTML = opts.map((o) => `<option value="${o.v}" ${o.v === state.field ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
    sel.onchange = (e) => {
        const u = new URL(location.href);
        if (e.target.value === 'Q') u.searchParams.delete('field'); else u.searchParams.set('field', e.target.value);
        u.searchParams.delete('set');
        location.href = u.toString();
    };
}

/** A number field's records: the height bands use e^h, h the absolute Weil height. */
function loadNF(recs) {
    const byKey = new Map();
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    for (const r of recs) {
        if (r.field !== state.field) continue;
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    all = [...byKey.values()].map((r) => ({ ...r, B: Math.exp(r.hmax), hsum: r.h.reduce((a, b) => a + b, 0) }));
    loadPresentations('presentations-nf.jsonl');
    classOf = null;
    $('group-toggle').style.display = 'none';           // no canonical groups over number fields yet
    const want = new URLSearchParams(location.search).get('set');
    const sets = [...new Set(all.map((r) => r.set))];
    state.set = want && (want === 'all' || sets.includes(want)) ? want : 'all';
    all.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
    const F = FIELDS[state.field];
    const latest = all.reduce((m, r) => (r.at > m ? r.at : m), '');
    $('db-meta').textContent = `${F ? F.name : state.field} · ${all.length} pairs · updated ${latest.slice(0, 16).replace('T', ' ')} UTC`;
    const lead = $('lead-field');
    const first = document.querySelector('.lead-in:not(#lead-field)');
    if (first) first.hidden = true;
    if (lead && F) lead.innerHTML = `Two-generator subgroups of ${tex('\\mathrm{PGL}_2(K)')}, ${tex('K = ' + F.tex)}, with both generators of small height, run through the <a href="../">Presentation Calculator</a>’s steps. Entries in ${tex('\\mathcal{O}_K = \\mathbb{Z}[w]')}, generating the unit ideal; the height is the absolute Weil height ${tex('h(g) = \\tfrac{1}{[K:\\mathbb{Q}]}\\sum_\\sigma n_\\sigma \\log \\sigma_1(\\sigma g)')}, and pairs are listed up to inverses, swapping, the Klein four-group and the automorphisms of ${tex('K')}.`;
    buildControls();
    render();
}

/**
 * The random model's records (batch/runRandom.mjs): each carries its field and generators as the
 * page reads them. No height bands: they are listed in draw order, the undetermined ones first.
 */
function loadRandom(recs) {
    const byKey = new Map();
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    for (const r of recs) {
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    all = [...byKey.values()].map((r) => ({ ...r, g: r.mats, h: r.mats.map(() => null), hmax: 0, hsum: 0, B: 1 }));
    presentations = new Map();
    classOf = null;
    $('group-toggle').style.display = 'none';
    const want = new URLSearchParams(location.search).get('set');
    const sets = [...new Set(all.map((r) => r.set))];
    state.set = want && (want === 'all' || sets.includes(want)) ? want : 'all';
    const idx = (k) => { const [a, b] = k.split(':').map(Number); return a * 1e6 + b; };
    all.sort((x, y) => idx(x.key) - idx(y.key));
    const latest = all.reduce((m, r) => (r.at > m ? r.at : m), '');
    const fields = new Set(all.map((r) => r.field));
    $('db-meta').textContent = `random model · ${all.length} groups over ${fields.size} field${fields.size === 1 ? '' : 's'} · updated ${latest.slice(0, 16).replace('T', ' ')} UTC`;
    const lead = $('lead-field');
    const first = document.querySelector('.lead-in:not(#lead-field)');
    if (first) first.hidden = true;
    if (lead) lead.innerHTML = `Groups drawn from the calculator’s random model (the die): ${tex('2 + \\text{a geometric number of}')} generators over ${tex('\\mathbb{Q}')}, the database’s fields, quadratic, cyclotomic, pure and cubic fields, with power-law entries and special shapes (unipotent, diagonal, rotations, involutions, quaternions). Each draw is labelled by its seed and index, and run through the <a href="../">Presentation Calculator</a>’s steps.`;
    buildControls();
    render();
}

// ───────────────────────── summary ─────────────────────────

const BANDS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8];
const bandOf = (B) => BANDS.find((b) => B <= b + 1e-9) ?? Infinity;
const bandLabel = (lo, hi) => (hi === Infinity ? `${hLabel()} > ${lo}` : `${lo} < ${hLabel()} ≤ ${hi}`);

function renderSummary() {
    const groups = new Map();
    const pool = all.filter(inSet);
    for (const r of pool) {
        const b = bandOf(r.B);
        if (!groups.has(b)) groups.set(b, []);
        groups.get(b).push(r);
    }
    const bands = [...groups.keys()].sort((a, b) => a - b);
    const cols = [['notdense', 'not dense'], ['discrete', 'discrete'], ['sarith', 'S-arith.'], ['thin', 'thin'], ['raised', 'non-default settings'], ['undet', 'undetermined']];
    const count = (rs, k) => (k === 'undet' ? rs.filter((r) => UNDETERMINED.has(r.verdict)).length
        : k === 'raised' ? rs.filter((r) => r.budget === 'raised' && !UNDETERMINED.has(r.verdict)).length
            : rs.filter((r) => r.verdict === k).length);
    const cell = (n, k) => `<td class="${n === 0 ? 'zero' : k === 'undet' ? 'hot' : ''}">${n}</td>`;
    let html = `<div class="sum-wrap"><table class="sum"><thead><tr><th>larger generator</th><th>${state.byGroup ? 'groups' : 'pairs'}</th>`;
    html += cols.map(([, l]) => `<th>${l}</th>`).join('') + '</tr></thead><tbody>';
    bands.forEach((b, i) => {
        const rs = groups.get(b);
        const lo = i ? bands[i - 1] : 1;
        html += `<tr><td>${bandLabel(lo, b)}</td><td>${rs.length}</td>${cols.map(([k]) => cell(count(rs, k), k)).join('')}</tr>`;
    });
    html += `<tr class="total"><td>all</td><td>${pool.length}</td>${cols.map(([k]) => cell(count(pool, k), k)).join('')}</tr>`;
    html += '</tbody></table></div>';
    $('summary').innerHTML = html;
}

// ───────────────────────── filters ─────────────────────────

function buildControls() {
    const pills = $('verdict-pills');
    pills.innerHTML = VERDICTS.map((v) => `<button class="pill t-${v.key}" data-v="${v.key}" aria-pressed="${state.verdicts.has(v.key)}">${v.label} <span data-n="${v.key}"></span></button>`).join('');
    pills.onclick = (e) => {
        const b = e.target.closest('.pill');
        if (!b) return;
        const k = b.dataset.v;
        if (state.verdicts.has(k)) state.verdicts.delete(k); else state.verdicts.add(k);
        b.setAttribute('aria-pressed', String(state.verdicts.has(k)));
        shown = PAGE;
        render();
    };
    $('set-select').innerHTML = setOptions().map((o) => `<option value="${esc(o.value)}" ${o.value === state.set ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    $('set-select').onchange = (e) => {
        state.set = e.target.value;
        const u = new URL(location.href);
        u.searchParams.set('set', state.set);
        history.replaceState(null, '', u);
        shown = PAGE;
        setBounds();
        render();
    };
    if (classOf) {
        $('group-toggle').hidden = false;
        $('by-group').checked = !!state.byGroup;
        $('by-group').onchange = (e) => {
            state.byGroup = e.target.checked;
            all = state.byGroup ? groupRows : pairRows;
            all.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
            const u = new URL(location.href);
            if (state.byGroup) u.searchParams.delete('groups'); else u.searchParams.set('groups', '0');
            history.replaceState(null, '', u);
            shown = PAGE;
            render();
        };
    }
    const whys = [...new Set(all.map((r) => r.why).filter(Boolean))].sort();
    $('why-select').innerHTML = '<option value="">any</option>' + whys.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join('');
    $('why-select').onchange = (e) => { state.why = e.target.value; shown = PAGE; render(); };
    setBounds();
    $('bound-select').onchange = (e) => { state.bound = Number(e.target.value); shown = PAGE; render(); };
    $('why-list').innerHTML = Object.entries(WHY).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    $('more-btn').onclick = () => { shown += PAGE; renderRows(); };
}

/** The σ₁ bounds offered for the data set shown. */
function setBounds() {
    const pool = all.filter(inSet);
    const maxB = pool.length ? Math.max(...pool.map((r) => r.B)) : 1;
    const opts = BANDS.filter((b) => b < maxB - 1e-9).concat([maxB]);
    $('bound-select').innerHTML = opts.map((b) => `<option value="${b}" ${b === maxB ? 'selected' : ''}>${+b.toFixed(3)}</option>`).join('');
    state.bound = maxB;
    const x = isNF() ? null : samples.find((y) => y.name === state.set);
    $('set-note').textContent = x ? `Drawn uniformly from the symmetry classes; ${pool.length} of ${x.n} computed so far.` : '';
}

function filtered() {
    return all.filter((r) => inSet(r) && r.B <= state.bound + 1e-9 && state.verdicts.has(r.verdict) && (!state.why || r.why === state.why));
}

// ───────────────────────── rows ─────────────────────────

const fmtH = (h) => h.toFixed(3);
function matrix(m, h) {
    const cells = m.map((x) => `<span>${minus(x)}</span>`).join('');
    return `<span class="g-wrap"><span class="mx">${cells}</span>${h == null ? '' : `<span class="gh">h ${fmtH(h)}</span>`}</span>`;
}

function placeName(p) {
    if (p.kind === 'real') return 'at ∞ (ℝ)';
    if (p.kind === 'complex') return 'at ∞ (ℂ)';
    if (p.kind === 'generic') return `other primes (p = ${p.p})`;
    return `at ℚ${toSub(p.p)}`;
}
const toSub = (n) => String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c] ?? c).join('');

function presText(P) {
    if (!P) return '';
    const rels = (P.relators || []);
    if (!rels.length) return '';
    return `⟨g1, g2 | ${rels.slice(0, 4).join(', ')}${rels.length > 4 ? ', …' : ''}⟩${P.complete === false ? ' (maybe incomplete)' : ''}`;
}

/** One line on what the pipeline found. */
function headline(r) {
    switch (r.verdict) {
        case 'notdense': return { vh: 'Not Zariski dense', vd: `closure ${tex(r.closure.tex)} — ${esc(r.closure.summary)}` };
        case 'discrete': {
            const d = r.places.filter((p) => p.status === 'discrete');
            const p = d[0];
            const pres = presText(p.presentation);
            return { vh: `Discrete ${d.map(placeName).join(', ')}`, vd: `${esc(p.headline)}${pres ? ` · <span class="mono">${esc(pres)}</span>` : ''}${p.detail && p.method === 'bass-serre' ? ` <span class="note">(Bass–Serre)</span>` : ''}` };
        }
        case 'sarith': {
            const S = r.sarith;
            if (S.status === 'index') {
                const L = S.ring ? `PGL₂(𝒪_K[1/${S.S.join(', ')}])` : `PGL₂(ℤ[1/${S.S.join('·')}])`;
                return { vh: 'S-arithmetic', vd: S.kernelIndex > 1
                    ? `Γ ∩ ${L} has index ${S.kernelIndex} in Γ and index ${S.index} in ${L} (coset enumeration, exact)`
                    : `index ${S.index} in ${L} (coset enumeration, exact)` };
            }
            if (S.status === 'orbits') {
                const L = `PGL₂(ℤ[1/${r.arith.S.join('·')}])`;
                const O = r.orbits || {};
                return { vh: 'S-arithmetic', vd: `${S.kernelIndex > 1 ? `Γ ∩ ${L} (index ${S.kernelIndex} in Γ) has` : ''}index ${S.index} in ${L} · ${O.reps} vertex orbit${O.reps === 1 ? '' : 's'} on ∏T_p with exact Stallings stabilizers${O.seeded ? ' (from FlashBeam’s covering)' : ''}` };
            }
            if (S.status === 'cusp') {
                const Ss = (S.S || []).length ? `S = {${S.S.join(', ')}}` : 'S = ∅';
                if (S.byTranslations) return { vh: 'S-arithmetic', vd: `${Ss}: the translations of Γ at a cusp span a lattice of full rank in K (parabolic ${esc(S.parabolic)}${S.source ? `, found among ${esc(S.source)}` : ''}), so Γ ⊇ E(N·𝒪) up to conjugation, of finite index in SL₂(𝒪) (Vaserstein), and Γ is open and unbounded at every prime of S` };
                return { vh: (S.S || []).length ? 'S-arithmetic' : 'Arithmetic', vd: `${Ss}: the unipotents of Γ at a cusp have full rank over 𝒪_S (parabolic ${esc(S.parabolic)}${S.other ? `, multipliers from ${esc(S.other)}` : ''}${S.source ? `, found among ${esc(S.source)}` : ''}), so Γ ⊇ E(𝔮) up to conjugation, of finite index in SL₂(𝒪_S) (Vaserstein; Benoist–Oh)` };
            }
            return { vh: 'S-arithmetic', vd: `${tex(r.arith.head.replace('\\langle S \\rangle', '\\Gamma^{(2)}'))}, finite index · ${S.auto ? `vertex orbits = vertex types, since ${esc(S.auto.word)} fixes o and has infinite order (the closure of Γ is open)` : `covering with ${S.reps} representative${S.reps === 1 ? '' : 's'}`}${stabText(S.stab, r)}` };
        }
        case 'thin': {
            const O = r.orbits || {};
            const inf = (O.groups || []).filter((g) => !g.finite).length;
            if (O.finiteStabilizers) return { vh: 'Thin', vd: `the vertex orbits on ∏T_p close up with ${O.reps} orbit${O.reps === 1 ? '' : 's'} and finite stabilizers: Γ acts properly and cocompactly on ∏T_p, so it is discrete in ∏ PGL₂(ℚ_p)` };
            return { vh: 'Thin', vd: `the vertex orbits on ∏T_p close up with ${O.reps} orbit${O.reps === 1 ? '' : 's'}, and ${inf} stabilizer${inf === 1 ? ' has' : 's have'} infinite index in PGL₂(ℤ) (finitely generated Stallings core)` };
        }
        case 'open': {
            let vd = esc(WHY[r.why] || r.why);
            const S = r.sarith;
            if (r.why === 'no-covering' && S) vd = `FlashBeam covered ${S.covered} of ${S.targets} neighbours with ${S.reps} representatives in ${S.seconds} s.`;
            if (r.why === 'stab-not-lattice' && S && S.stab) vd = `${S.auto ? `Vertex orbits = vertex types (${esc(S.auto.word)} fixes o, of infinite order)` : `Trees covered (${S.reps} rep${S.reps === 1 ? '' : 's'})`}; Γₒ from ${S.stab.used ?? Math.max(0, ...(S.stab.rounds || []).map((x) => x.elements || 0))} elements: ${esc(String(S.stab.text || '').replace(/\.$/, ''))}.`;
            return { vh: `Undetermined · ${esc(r.why)}`, vd };
        }
        default: return { vh: r.verdict === 'timeout' ? 'Timed out' : 'Error', vd: esc(r.error || WHY[r.why] || '') };
    }
}

/** How the stabilizer of o was shown to be a lattice. */
function stabText(st, r) {
    if (!st) return '';
    if (st.method === 'cusp') return `; Γₒ: ${st.used} elements with a lattice of unipotents of rank ${st.rank} at a cusp (Vaserstein)`;
    if (st.method === 'coset enumeration') return `; Γₒ ⊇ a subgroup of index ${st.index} in ${r && r.degree === 2 ? 'the Bianchi group PSL₂(𝒪_K)' : 'PGL₂(ℤ)'} (${st.used} elements, coset enumeration)`;
    return `; Γₒ: Poincaré on ${st.used} elements, ${st.faces} sides`;
}

/** A mathematical fact the pipeline does not use, when it settles the row. */
function gapFlag(r) {
    if (r.verdict === 'open' && r.why === 'S-empty' && r.degree === 1) return 'Discrete at ∞ anyway: Γ ⊂ PGL₂(ℚ) is bounded at every prime, and PGL₂(ℚ) is discrete in the adeles.';
    return '';
}

async function loadPresentations(file = 'presentations.jsonl') {
    const recs = await fetchRecords(file);
    if (!recs) return;                                   // none yet
    const m = new Map();
    for (const p of recs) m.set(p.key, p);
    presentations = m;
}

const SUPS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sup = (n) => String(n).split('').map((c) => SUPS[c]).join('');
const nameText = (nm) => nm.replace(/(\d+)$/, (d) => d.split('').map((c) => SUBS[+c]).join(''));
/** a relator as text: powers collected, a proper power as (u)ⁿ, the orientation with fewer inverses */
function relText(w, names) {
    if (2 * w.filter((x) => x < 0).length > w.length) w = w.slice().reverse().map((x) => -x);
    const word = (u) => {
        const out = [];
        for (let i = 0; i < u.length;) {
            let j = i;
            while (j < u.length && u[j] === u[i]) j++;
            const e = (j - i) * Math.sign(u[i]);
            out.push(nameText(names[Math.abs(u[i]) - 1]) + (e === 1 ? '' : sup(e)));
            i = j;
        }
        return out.join('');
    };
    const L = w.length;
    for (let d = 1; d < L; d++) if (L % d === 0 && w.every((x, i) => x === w[(i + d) % L])) return d === 1 ? word(w) : `(${word(w.slice(0, d))})${sup(L / d)}`;
    return word(w);
}
const H1text = (a) => [a.rank ? (a.rank === 1 ? 'ℤ' : `ℤ${sup(a.rank)}`) : null, ...a.torsion.map((d) => `ℤ/${d}`)].filter(Boolean).join(' ⊕ ') || '0';
const SHAPE_TEXT = { 'Γ(N)': 'Γ(N)', 'Γ₁(N)': '±Γ₁(N)', 'Γ¹(N)': '±Γ¹(N)', 'Γ₀(N)': 'Γ₀(N)', 'Γ⁰(N)': 'Γ⁰(N)' };

/** the rows on Γ as a congruence subgroup and its presentation */
function presentationRows(p) {
    const rows = [];
    const C = p.cong, P = p.pres;
    if (C && C.agrees) {
        const sh = C.shape === 'full' ? 'all of PSL₂(ℤ[1/S])' : `the preimage of H₀ ⊂ SL₂(ℤ/${C.N})/±1 of order ${C.image.toLocaleString()} and index ${(C.ambient / C.image).toLocaleString()}${C.shape && SHAPE_TEXT[C.shape] ? ` — that of ${SHAPE_TEXT[C.shape].replace('N', C.N)}` : ''}`;
        const det = C.classes.gamma === C.classes.lambda ? 'every class of determinants' : C.classes.basis.length ? `determinants ⟨${C.classes.basis.join(', ')}⟩ mod squares (${C.classes.gamma} of ${C.classes.lambda} classes)` : `square determinants only (1 of ${C.classes.lambda} classes)`;
        rows.push(['congruence subgroup', `level N = ${C.N}: Γ ∩ PSL₂(ℤ[1/S]) is ${sh}; Γ meets ${det}. Index ${C.classes.lambda / C.classes.gamma} · ${(C.ambient / C.image).toLocaleString()} = ${C.index.toLocaleString()}, as the coset table says.`]);
    }
    if (P && !P.error) {
        const names = P.gens.map((g) => g.name);
        const extra = P.gens.filter((g) => g.given === null).map((g) => `${nameText(g.name)} = (${g.M[0]} ${g.M[1]}; ${g.M[2]} ${g.M[3]})`);
        const shown = P.relators.slice(0, 12).map((w) => relText(w, names));
        const more = P.nRelators - shown.length;
        rows.push(['presentation', `<span class="mono">⟨${names.map(nameText).join(', ')} | ${shown.join(', ')}${more > 0 ? `, … ${more} more` : ''}⟩</span>`
            + `<div class="note">${P.nRelators} relators on ${names.length} generators${extra.length ? `, with ${esc(extra.join(', '))}` : ''} · H₁ = ${H1text(P.abelian)} · Reidemeister–Schreier on the ${P.index.toLocaleString()} cosets of ${P.tableFrom === 'congruence' ? 'the congruence description' : 'the coset table'}${P.kernelIndex > 1 ? ` of a subgroup of index ${P.kernelIndex}, extended` : ''}, Tietze moves; every relator checked · ${P.ms} ms</div>`]);
    } else if (P && P.error) rows.push(['presentation', `<span class="note">${esc(P.error)}</span>`]);
    return rows;
}

function detail(r) {
    const rows = [];
    if (r.gens) rows.push(['generators', r.gens.map((g, i) => `g${i + 1}: ${esc(g.type)}${g.order ? `, order ${g.order}` : g.type === 'identity' ? '' : ', infinite order'} (tr²/det = ${tex(g.tau)})`).join('<br>')]);
    if (r.closure) rows.push(['closure', `${tex(r.closure.tex)}${r.arith ? ` · ${tex(r.arith.head.replace('\\langle S \\rangle', '\\Gamma'))}` : ''}`]);
    if (r.places) rows.push(['places', r.places.map((p) => `<div><span class="st st-${p.status}">${esc(p.status)}</span> ${placeName(p)} — ${esc(p.headline)}${p.detail ? `<div class="note">${esc(p.detail)}</div>` : ''}${p.presentation ? `<div class="mono">${esc(presText(p.presentation))}</div>` : ''}</div>`).join('')]);
    if (r.congruence) rows.push(['congruence', `${esc(r.congruence.head)}${r.congruence.detail ? ` — ${esc(r.congruence.detail)}` : ''}`]);
    if (r.sarith && r.sarith.status === 'index') {
        const S = r.sarith;
        rows.push(['exact index', `[${S.ring ? `PGL₂(𝒪_K[1/${S.S.join(', ')}])` : `PGL₂(ℤ[1/${S.S.join('·')}])`} : Γ${S.kernelIndex > 1 ? ' ∩ PGL₂(ℤ[1/S])' : ''}] = ${S.index}${S.kernelIndex > 1 ? `, and that subgroup has index ${S.kernelIndex} in Γ (parities at ${(S.bad || []).join(', ')})` : ''} — Todd–Coxeter in the Bass–Serre presentation${S.ring ? ' (built on Poincaré’s presentation of the Bianchi group)' : ''}, ${S.ms} ms`]);
    } else if (r.exactIndex) {
        rows.push(['exact index', `coset enumeration did not close (${esc(r.exactIndex.limit || r.exactIndex.error || '')})`]);
    }
    if (r.orbits) {
        const O = r.orbits;
        rows.push(['vertex orbits', `${esc(O.status)}${O.verdict ? ` → ${esc(O.verdict)}` : ''} · ${O.reps ?? '?'} orbit${O.reps === 1 ? '' : 's'} (${O.defined ?? '?'} defined)${O.seeded ? ', seeded by the covering' : ''}${O.kernelIndex > 1 ? `, on a subgroup of index ${O.kernelIndex}` : ''} · ${O.ms} ms${(O.groups || []).length ? `<div class="note">stabilizers: ${O.groups.map((g) => (g.finite ? `index ${g.index}` : `infinite index (${g.vertices} vertices)`)).join(', ')}</div>` : ''}${O.error ? `<div class="note">${esc(O.error)}</div>` : ''}`]);
    }
    if (r.sarith && r.sarith.status !== 'index' && r.sarith.status !== 'orbits') {
        const S = r.sarith;
        const bits = [];
        if (S.status) bits.push(`status ${esc(S.status)}`);
        if (S.iterations != null) bits.push(`${S.iterations} iterations, ${S.seconds} s`);
        if (S.targets != null) bits.push(`${S.covered}/${S.targets} neighbours, ${S.reps} reps`);
        if (S.dirichlet != null) bits.push(`${S.dirichlet} Dirichlet generators, ${S.relations} relations`);
        if (S.note) bits.push(esc(S.note));
        let html = bits.join(' · ');
        if (S.shortRelations && S.shortRelations.length) html += `<div class="mono">${esc(S.shortRelations.join(',  '))}</div>`;
        if (S.stab) html += `<div class="note">Γₒ: ${S.stab.ok && S.stab.method === 'cusp' ? `${S.stab.used} elements; unipotents of rank ${S.stab.rank} at a cusp (Vaserstein)` : S.stab.ok ? (S.stab.method ? `index ${S.stab.index} in PGL₂(ℤ) from ${S.stab.used} elements (coset enumeration${S.stab.rounds ? `, ${S.stab.rounds.map((x) => `${x.elements} el. → ${x.index ?? x.limit}, ${x.ms} ms`).join('; ')}` : ''})` : `lattice (${S.stab.faces} sides from ${S.stab.used} elements)`) : esc(S.stab.text || '')}</div>`;
        if (S.exactTried) html += `<div class="note">exact check did not close: ${esc((S.exactTried.rounds || []).map((x) => `${x.elements} el. → ${x.limit}`).join('; '))}</div>`;
        rows.push(['FlashBeam', html]);
    }
    if (state.byGroup && r.members) rows.push(['group', `${r.members} generating pair${r.members === 1 ? '' : 's'} up to the 32 symmetries reduce to this one (conjugation by PGL₂(ℤ), Nielsen moves)${r.via ? `; the verdict is the one computed for <span class="mono">${esc(r.via)}</span>, a conjugate generating pair` : ''}`]);
    if (r.verdict === 'sarith') {
        // in the group view the verdict may be a conjugate pair's (r.via), and so is its presentation
        const own = presentations.get(r.key), via = r.via ? presentations.get(r.via) : null;
        const p = own || via;
        if (p) {
            const pr = presentationRows(p);
            if (!own && pr.length) pr[pr.length - 1][1] += `<div class="note">for the generating pair <span class="mono">${esc(r.via)}</span>, which generates a conjugate group</div>`;
            rows.push(...pr);
        }
    }
    rows.push(['budget', esc(budgetText(r))]);
    if (r.ms) rows.push(['time', Object.entries(r.ms).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`).join(' · ')]);
    rows.push(['key', `<span class="mono">${esc(r.key)}</span>`]);
    return `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

// the calculator's permalink (poincare's #s= base64url JSON)
function b64url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function nfConsts(r) {
    const F = r.field && FIELDS[r.field];
    if (!F) return [];
    const poly = F.poly.map((c, k) => ({ c, k })).filter((t) => t.c).reverse().map(({ c, k }, i) => `${c < 0 ? '-' : i ? '+' : ''}${Math.abs(c) === 1 && k ? '' : Math.abs(c)}${k ? (k === 1 ? 'w' : `w^${k}`) : ''}`).join('');
    return [{ name: 'w', poly, near: F.root }];
}
function calcLink(r) {
    const s = settingsOf(r);
    const st = {
        v: 1, mats: r.g.map((m) => m.map(String)), anti: r.g.map(() => false), consts: r.consts || nfConsts(r),
        depth: s.depth, faces: s.faces, secs: s.seconds, beam: s.beam, flash: s.flash, bsecs: s.beamSeconds, reps: s.maxReps, metric: s.metric,
    };
    return `../#s=${b64url(JSON.stringify(st))}`;
}

/** The settings a record was computed with, from its tag. */
function settingsOf(r) {
    try { return JSON.parse(r.tag.slice(r.tag.indexOf('|') + 1)); } catch (e) { return {}; }
}
function budgetText(r) {
    const s = settingsOf(r);
    const bits = [`FlashBeam ${s.beamSeconds} s`, `beam ${s.beam}`, `flash ${s.flash}`];
    if (s.stabSizes) bits.push(`Γₒ from ${s.stabSizes.join('/')} elements`);
    if (s.stabMethod === 'exact') bits.push('Γₒ by coset enumeration in PGL₂(ℤ)');
    if (s.saturate) bits.push('saturation');
    if (s.harvestSeconds != null) bits.push(`harvest ${s.harvestSeconds} s`);
    return `${r.budget === 'raised' ? 'a later pass' : 'the page’s defaults (before the exact Γₒ check)'}: ${bits.join(', ')}`;
}

function rowHtml(r, i) {
    let { vh, vd } = headline(r);
    if (state.field === 'random') vh = `<span class="tag">${esc(r.field)}</span> ${vh}`;
    if (r.budget === 'raised') vh += ` <span class="tag">${settingsOf(r).stabMethod === 'exact' ? 'exact Γₒ check' : 'raised budget'}</span>`;
    const flag = gapFlag(r);
    return `<div class="row t-${r.verdict}" data-i="${i}">
        <div class="row-main">
            <div class="gens">${r.g.map((m, j) => matrix(m, r.h[j])).join('')}</div>
            <div class="what"><div class="vh">${vh}</div><div class="vd">${vd}</div>${flag ? `<div class="gap-flag">${esc(flag)}</div>` : ''}</div>
            <div class="row-side"><a href="${calcLink(r)}" target="_blank" rel="noopener">open in calculator ↗</a><button data-more="${i}" aria-expanded="false">details</button></div>
        </div>
    </div>`;
}

let current = [];
function renderRows() {
    const rs = current.slice(0, shown);
    $('rows').innerHTML = rs.map(rowHtml).join('') || '<p class="note">No groups match.</p>';
    $('more-btn').hidden = shown >= current.length;
}

function render() {
    renderSummary();
    current = filtered();
    for (const v of VERDICTS) {
        const n = all.filter((r) => inSet(r) && r.verdict === v.key && r.B <= state.bound + 1e-9).length;
        const el = document.querySelector(`[data-n="${v.key}"]`);
        if (el) el.textContent = n;
    }
    $('bound-label').textContent = `${hLabel()} ≤`;
    $('count-line').textContent = `${current.length} of ${all.filter((r) => inSet(r) && r.B <= state.bound + 1e-9).length} ${state.byGroup ? "groups" : "pairs"} shown, by height.`;
    renderRows();
}

$('rows').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-more]');
    if (!b) return;
    const row = b.closest('.row');
    const open = row.querySelector('.detail');
    if (open) { open.remove(); b.setAttribute('aria-expanded', 'false'); b.textContent = 'details'; return; }
    const d = document.createElement('div');
    d.className = 'detail';
    d.innerHTML = detail(current[+b.dataset.more]);
    row.appendChild(d);
    b.setAttribute('aria-expanded', 'true');
    b.textContent = 'hide';
});

// the lead-in's math
for (const el of document.querySelectorAll('.m')) el.innerHTML = tex(el.textContent);
load();
