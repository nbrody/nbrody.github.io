/**
 * Presentation Database: reads database/web/manifest.json + per-field slim JSON exports
 * (written by database/export-web.mjs) by default for fast single-field HTTP-cached loading,
 * falling back to raw *.jsonl run logs when ?raw=1 is passed or web/ is absent.
 */
import { FIELDS, polyText } from '../js/fields.js';
import { exhaustiveBound } from './exhaustive.js';

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
const ALL_VERDICT_KEYS = VERDICTS.map((v) => v.key);
const UNDETERMINED = new Set(['open', 'timeout', 'error']);
const DECIDED = new Set(ALL_VERDICT_KEYS.filter((k) => !UNDETERMINED.has(k)));

// presentations of the S-arithmetic groups (batch/presentations.mjs), by key; loaded asynchronously
let presentations = new Map();
let loadEpoch = 0;

const WHY = {
    'no-covering': 'FlashBeam ran out of budget before covering the trees, and found no element of infinite order fixing the basepoint (one would make the covering unnecessary). Γ may be S-arithmetic or thin.',
    'index-limit': 'Coset enumeration in PGL₂(ℤ[1/S]) did not close within its budget (FlashBeam was not run). Γ may have large index or be thin.',
    'stab-not-lattice': 'The vertex orbits on the trees are known (a covering re-checked exactly, or an element of infinite order fixing the basepoint, which makes the closure of Γ open), but the elements found fixing the basepoint were not shown to be a lattice at ∞.',
    'verify-failed': 'A covering was found but did not survive the exact re-check.',
    'S-empty': 'Γ is bounded at every prime, so the certificate has no tree to cover, and Poincaré did not prove Γ discrete at ∞.',
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
let groupsCache = undefined;
let samplesCache = undefined;
let manifest = null;
const recordCache = new Map();
const presCache = new Map();

const sigma1 = ([a, b, c, d]) => {
    const f = a * a + b * b + c * c + d * d, D = a * d - b * c;
    return Math.sqrt((f + Math.sqrt(Math.max(f * f - 4 * D * D, 0))) / 2);
};

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
        out.push({
            ...r,
            key: gk,
            g,
            s1,
            h,
            hmax: Math.max(...h),
            B: Math.max(...s1),
            hsum: h.reduce((a, b) => a + b, 0),
            members: (G[gk] ? G[gk].members.length : rs.length),
            present: rs.map((x) => x.key),
            via: r.key !== gk ? r.key : null,
        });
    }
    return out;
}

const initParams = new URLSearchParams(location.search);
const preferRaw = initParams.get('raw') === '1';

function parseVerdictsParam(raw) {
    if (!raw) return new Set(UNDETERMINED);
    if (raw === 'all') return new Set(ALL_VERDICT_KEYS);
    if (raw === 'decided') return new Set(DECIDED);
    if (raw === 'undetermined') return new Set(UNDETERMINED);
    const parts = raw.split(',').filter((k) => ALL_VERDICT_KEYS.includes(k));
    return parts.length ? new Set(parts) : new Set(UNDETERMINED);
}

const state = {
    verdicts: parseVerdictsParam(initParams.get('v')),
    why: initParams.get('why') || '',
    q: initParams.get('q') || '',
    primes: initParams.get('primes') || '',
    index: initParams.get('index') || '',
    cong: initParams.get('cong') || '',
    h1: initParams.get('h1') || '',
    closure: initParams.get('closure') || '',
    bound: Infinity,
    set: initParams.get('set') || 'exhaustive',
    byGroup: initParams.get('groups') !== '0',
    field: initParams.get('field') || 'Q',
};

const isNF = () => state.field !== 'Q' && state.field !== 'random';
const hLabel = () => (state.field === 'Q' ? 'σ₁' : 'e^h');
let nfFields = [];
let hasRandom = false;
let samples = [], exBound = 0;
let sampleKeys = new Map();

function syncUrlState() {
    const u = new URL(location.href);
    const setOrDel = (k, val, def = '') => {
        if (val && val !== def) u.searchParams.set(k, val);
        else u.searchParams.delete(k);
    };
    setOrDel('field', state.field, 'Q');
    const defSet = state.field === 'Q' ? (exBound ? 'exhaustive' : 'all') : 'all';
    setOrDel('set', state.set, defSet);
    if (state.field === 'Q' && classOf) setOrDel('groups', state.byGroup ? '' : '0', '');
    else u.searchParams.delete('groups');

    // Serialize verdict selection concisely
    const vs = [...state.verdicts];
    const eqSet = (A, B) => A.size === B.size && [...A].every((x) => B.has(x));
    if (eqSet(state.verdicts, UNDETERMINED)) u.searchParams.delete('v');
    else if (eqSet(state.verdicts, DECIDED)) u.searchParams.set('v', 'decided');
    else if (state.verdicts.size === ALL_VERDICT_KEYS.length) u.searchParams.set('v', 'all');
    else u.searchParams.set('v', vs.join(','));

    setOrDel('why', state.why);
    setOrDel('q', state.q);
    setOrDel('primes', state.primes);
    setOrDel('index', state.index);
    setOrDel('cong', state.cong);
    setOrDel('h1', state.h1);
    setOrDel('closure', state.closure);
    history.replaceState(null, '', u);
    syncResetBtn();
}

function hasExtraFilters() {
    const eqUndet = state.verdicts.size === UNDETERMINED.size && [...state.verdicts].every((x) => UNDETERMINED.has(x));
    const pool = all.filter(inSet);
    const maxB = pool.length ? Math.max(...pool.map((r) => r.B)) : state.bound;
    return !!(
        !eqUndet || state.why || state.q || state.primes || state.index
        || state.cong || state.h1 || state.closure || state.bound < maxB - 1e-6
    );
}

function syncResetBtn() {
    const btn = $('reset-filters');
    if (btn) btn.hidden = !hasExtraFilters();
}

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

function inSet(r) {
    if (state.set === 'all') return true;
    if (state.field !== 'Q') return r.set === state.set;
    if (state.set === 'exhaustive') return r.B <= exBound + 1e-9;
    const ks = sampleKeys.get(state.set);
    return !!ks && (ks.has(r.key) || (r.present || []).some((k) => ks.has(k)));
}

// ───────────────────────── loading ─────────────────────────

function parseJsonOrJsonl(text) {
    if (text.trimStart().startsWith('[')) return JSON.parse(text);
    const recs = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { recs.push(JSON.parse(line)); } catch (e) { /* skip incomplete line */ }
    }
    return recs;
}

async function fetchManifest() {
    if (preferRaw) return null;
    try {
        const res = await fetch('web/manifest.json', { cache: 'no-cache' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

/**
 * Fetch web/<webName>?v=<version> first (HTTP-cached, compact), falling back to raw <rawName> (.jsonl).
 * When ?raw=1 is set in the URL, raw .jsonl is preferred for live batch inspection.
 */
async function fetchDataset(webName, rawName) {
    const cacheKey = `${preferRaw ? 'raw' : 'web'}:${webName}:${rawName}`;
    if (recordCache.has(cacheKey)) return recordCache.get(cacheKey);

    const ver = manifest && manifest.version ? `?v=${encodeURIComponent(manifest.version)}` : '';
    const candidates = preferRaw
        ? [rawName, `web/${webName}${ver}`].filter(Boolean)
        : [`web/${webName}${ver}`, rawName].filter(Boolean);

    for (const url of candidates) {
        try {
            const isVersionedWeb = url.startsWith('web/') && ver;
            const res = await fetch(url, { cache: isVersionedWeb ? 'default' : 'no-cache' });
            if (!res.ok) continue;
            const recs = parseJsonOrJsonl(await res.text());
            recordCache.set(cacheKey, recs);
            return recs;
        } catch (e) { /* try next candidate */ }
    }
    return null;
}

async function ensureGroupsAndSamples() {
    if (groupsCache === undefined) {
        try {
            const res = await fetch('groups.json', { cache: 'no-cache' });
            groupsCache = res.ok ? ((await res.json()).groups || {}) : null;
        } catch (e) { groupsCache = null; }
    }
    if (samplesCache === undefined) {
        try {
            const res = await fetch('samples.json', { cache: 'no-cache' });
            samplesCache = res.ok ? await res.json() : [];
        } catch (e) { samplesCache = []; }
        samples = samplesCache;
        sampleKeys = new Map(samples.map((x) => [x.name, new Set(x.keys)]));
    }
}

async function boot() {
    manifest = await fetchManifest();
    if (manifest) {
        nfFields = manifest.nfFields || [];
        hasRandom = !!manifest.hasRandom;
    } else {
        const nfRecs = (await fetchDataset('results-nf.json', 'results-nf.jsonl')) || [];
        nfFields = [...new Set(nfRecs.map((r) => r.field).filter(Boolean))];
        const randRecs = (await fetchDataset('results-random.json', 'results-random.jsonl')) || [];
        hasRandom = randRecs.length > 0;
    }
    buildFieldSelect();
    wireStaticControls();
    await loadCurrentField({ initial: true });
}

async function loadCurrentField({ initial = false } = {}) {
    const epoch = ++loadEpoch;
    presentations = new Map();
    const leadQ = $('lead-q');
    const leadField = $('lead-field');

    if (state.field === 'random') {
        const randRecs = (await fetchDataset('results-random.json', 'results-random.jsonl')) || [];
        if (epoch !== loadEpoch) return;
        loadRandom(randRecs, { initial, leadQ, leadField });
        return;
    }
    if (isNF()) {
        const shardWeb = manifest && manifest.nfFields && manifest.nfFields.includes(state.field)
            ? `results-nf-${state.field}.json`
            : 'results-nf.json';
        const nfRecs = (await fetchDataset(shardWeb, 'results-nf.jsonl')) || [];
        if (epoch !== loadEpoch) return;
        loadNF(nfRecs, { initial, epoch, leadQ, leadField });
        return;
    }

    // Field = ℚ
    if (leadQ) leadQ.hidden = false;
    if (leadField) leadField.innerHTML = '';

    const recs = await fetchDataset('results.json', 'results.jsonl');
    if (epoch !== loadEpoch) return;
    if (!recs) {
        $('summary').innerHTML = `<p class="err">Could not read results.jsonl. Fill it with <code>node batch/run.mjs --bound 3</code> from the PresentationCalc folder.</p>`;
        return;
    }
    const byKey = new Map();
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    for (const r of recs) {
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    all = [...byKey.values()].map((r) => ({ ...r, B: Math.max(...r.s1), hsum: r.h.reduce((a, b) => a + b, 0) }));
    loadPresentations('presentations.json', 'presentations.jsonl', epoch);

    await ensureGroupsAndSamples();
    if (epoch !== loadEpoch) return;

    if (groupsCache) {
        classOf = new Map();
        for (const [gk, g] of Object.entries(groupsCache)) for (const m of g.members) classOf.set(m, gk);
        pairRows = all;
        groupRows = groupAll(all, groupsCache);
        $('group-toggle').hidden = false;
        $('group-toggle').style.display = '';
        if (state.byGroup) all = groupRows;
    } else {
        classOf = null;
        $('group-toggle').hidden = true;
    }

    exBound = exhaustiveBound(recs, new Set(samples.flatMap((x) => x.keys || [])));
    if (!exBound && manifest && manifest.exBound) exBound = manifest.exBound;

    const validSets = new Set(['all', ...(exBound ? ['exhaustive'] : []), ...sampleKeys.keys()]);
    if (!validSets.has(state.set)) {
        state.set = exBound ? 'exhaustive' : (samples.length ? samples[samples.length - 1].name : 'all');
    }

    all.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
    const latest = all.reduce((m, r) => (r.at > m ? r.at : m), '');
    const tags = new Set(all.map((r) => r.tag));
    $('db-meta').textContent = `${all.length} ${state.byGroup && classOf ? 'groups' : 'pairs'}${tags.size > 1 ? `, ${tags.size} settings` : ''} · updated ${latest.slice(0, 16).replace('T', ' ')} UTC`;
    refreshDynamicControls();
    render();
    if (!initial) syncUrlState();
}

function buildFieldSelect() {
    const sel = $('field-select');
    if (!sel) return;
    const opts = [{ v: 'Q', l: 'ℚ' }].concat(Object.entries(FIELDS).filter(([k]) => nfFields.includes(k)).map(([k, F]) => ({ v: k, l: F.name })));
    if (hasRandom) opts.push({ v: 'random', l: 'random model (any field)' });
    sel.innerHTML = opts.map((o) => `<option value="${esc(o.v)}" ${o.v === state.field ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
    sel.onchange = async (e) => {
        state.field = e.target.value;
        state.set = state.field === 'Q' ? 'exhaustive' : 'all';
        state.why = '';
        shown = PAGE;
        await loadCurrentField({ initial: false });
    };
}

/** A number field's records: the height bands use e^h, h the absolute Weil height. */
function loadNF(recs, { epoch, leadQ, leadField }) {
    const byKey = new Map();
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    for (const r of recs) {
        if (r.field !== state.field) continue;
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    all = [...byKey.values()].map((r) => ({ ...r, B: Math.exp(r.hmax), hsum: r.h.reduce((a, b) => a + b, 0) }));
    const presWeb = manifest && manifest.nfFields && manifest.nfFields.includes(state.field)
        ? `presentations-nf-${state.field}.json`
        : 'presentations-nf.json';
    loadPresentations(presWeb, 'presentations-nf.jsonl', epoch);
    classOf = null;
    $('group-toggle').hidden = true;
    const sets = [...new Set(all.map((r) => r.set).filter(Boolean))];
    if (state.set !== 'all' && !sets.includes(state.set)) state.set = 'all';
    all.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
    const F = FIELDS[state.field];
    const latest = all.reduce((m, r) => (r.at > m ? r.at : m), '');
    $('db-meta').textContent = `${F ? F.name : state.field} · ${all.length} pairs · updated ${latest.slice(0, 16).replace('T', ' ')} UTC`;
    if (leadQ) leadQ.hidden = true;
    if (leadField && F) leadField.innerHTML = `Two-generator subgroups of ${tex('\\mathrm{PGL}_2(K)')}, ${tex('K = ' + F.tex)}, with both generators of small height, run through the <a href="../">Presentation Calculator</a>’s steps. Entries in ${tex('\\mathcal{O}_K = \\mathbb{Z}[w]')}, generating the unit ideal; the height is the absolute Weil height ${tex('h(g) = \\tfrac{1}{[K:\\mathbb{Q}]}\\sum_\\sigma n_\\sigma \\log \\sigma_1(\\sigma g)')}, and pairs are listed up to inverses, swapping, the Klein four-group and the automorphisms of ${tex('K')}.`;
    refreshDynamicControls();
    render();
}

/** The random model's records (batch/runRandom.mjs). */
function loadRandom(recs, { leadQ, leadField }) {
    const byKey = new Map();
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    for (const r of recs) {
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    all = [...byKey.values()].map((r) => ({ ...r, g: r.mats, h: r.mats.map(() => null), hmax: 0, hsum: 0, B: 1 }));
    presentations = new Map();
    classOf = null;
    $('group-toggle').hidden = true;
    const sets = [...new Set(all.map((r) => r.set).filter(Boolean))];
    if (state.set !== 'all' && !sets.includes(state.set)) state.set = 'all';
    const idx = (k) => { const [a, b] = k.split(':').map(Number); return a * 1e6 + b; };
    all.sort((x, y) => idx(x.key) - idx(y.key));
    const latest = all.reduce((m, r) => (r.at > m ? r.at : m), '');
    const fields = new Set(all.map((r) => r.field));
    $('db-meta').textContent = `random model · ${all.length} groups over ${fields.size} field${fields.size === 1 ? '' : 's'} · updated ${latest.slice(0, 16).replace('T', ' ')} UTC`;
    if (leadQ) leadQ.hidden = true;
    if (leadField) leadField.innerHTML = `Groups drawn from the calculator’s random model (the die): ${tex('2 + \\text{a geometric number of}')} generators over ${tex('\\mathbb{Q}')}, the database’s fields, quadratic, cyclotomic, pure and cubic fields, with power-law entries and special shapes (unipotent, diagonal, rotations, involutions, quaternions). Each draw is labelled by its seed and index, and run through the <a href="../">Presentation Calculator</a>’s steps.`;
    refreshDynamicControls();
    render();
}

async function loadPresentations(webName, rawName, epoch) {
    const cacheKey = `${webName}:${rawName}`;
    let m = presCache.get(cacheKey);
    if (!m) {
        const recs = await fetchDataset(webName, rawName);
        if (!recs) return;
        m = new Map();
        for (const p of recs) m.set(p.key, p);
        presCache.set(cacheKey, m);
    }
    if (epoch !== loadEpoch) return;
    presentations = m;

    // Re-render any open detail panels so presentations & congruence descriptions appear immediately
    for (const rowEl of document.querySelectorAll('#rows .row')) {
        const openDetail = rowEl.querySelector('.detail');
        if (!openDetail) continue;
        const idx = Number(rowEl.dataset.i);
        if (current[idx]) openDetail.innerHTML = detail(current[idx]);
    }
    // If a presentation-dependent filter or search is active, refresh the filtered list
    if (state.cong || state.h1 || state.index || state.q) render();
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
    const unitLabel = state.byGroup && classOf ? 'groups' : 'pairs';
    let html = `<div class="sum-wrap"><table class="sum"><caption class="sr-only">Verdict counts by height band</caption><thead><tr><th scope="col">larger generator</th><th scope="col">${unitLabel}</th>`;
    html += cols.map(([, l]) => `<th scope="col">${l}</th>`).join('') + '</tr></thead><tbody>';
    bands.forEach((b, i) => {
        const rs = groups.get(b);
        const lo = i ? bands[i - 1] : 1;
        html += `<tr><th scope="row">${esc(bandLabel(lo, b))}</th><td>${rs.length}</td>${cols.map(([k]) => cell(count(rs, k), k)).join('')}</tr>`;
    });
    html += `<tr class="total"><th scope="row">all</th><td>${pool.length}</td>${cols.map(([k]) => cell(count(pool, k), k)).join('')}</tr>`;
    html += '</tbody></table></div>';
    $('summary').innerHTML = html;
}

// ───────────────────────── filters ─────────────────────────

function presentationOf(r) {
    return presentations.get(r.key) || (r.via ? presentations.get(r.via) : null) || null;
}

function indexOf(r) {
    if (r.sarith && r.sarith.index != null) return r.sarith.index;
    const p = presentationOf(r);
    if (p && p.pres && p.pres.index != null) return p.pres.index;
    if (r.congruenceClosure && r.congruenceClosure.index != null) return r.congruenceClosure.index;
    return null;
}

function parseNumComparison(spec) {
    const s = spec.trim();
    if (!s) return null;
    const range = s.match(/^(\d+)\s*[-..]+\s*(\d+)$/);
    if (range) {
        const lo = Number(range[1]), hi = Number(range[2]);
        return (n) => n != null && n >= lo && n <= hi;
    }
    const cmp = s.match(/^(<=|>=|<|>|=|≤|≥)?\s*(\d+)$/);
    if (!cmp) return () => false;
    const op = cmp[1] || '=', val = Number(cmp[2]);
    return (n) => {
        if (n == null) return false;
        if (op === '<=' || op === '≤') return n <= val;
        if (op === '>=' || op === '≥') return n >= val;
        if (op === '<') return n < val;
        if (op === '>') return n > val;
        return n === val;
    };
}

function matchesPrimes(r, spec) {
    const s = spec.trim().toLowerCase();
    if (!s) return true;
    const rawS = (r.sarith && r.sarith.S) || (r.arith && r.arith.S) || [];
    const pSet = new Set(rawS.map((x) => String(x).replace(/\(.*$/, '')));
    if (s === '∅' || s === 'empty' || s === 'none' || s === '0') {
        return !!(r.arith || r.sarith) && pSet.size === 0;
    }
    const tokens = s.split(/[\s,·]+/).filter(Boolean);
    const exact = s.startsWith('=');
    const cleanTokens = tokens.map((t) => t.replace(/^=/, '')).filter(Boolean);
    if (!cleanTokens.length) return true;
    if (exact) return pSet.size === cleanTokens.length && cleanTokens.every((t) => pSet.has(t));
    return cleanTokens.every((t) => pSet.has(t));
}

function matchesCongruence(r, want) {
    if (!want) return true;
    const p = presentationOf(r);
    const sh = p && p.cong && p.cong.agrees ? (p.cong.shape || 'other') : null;
    if (!sh) return false;
    if (want === 'full') return sh === 'full';
    if (want === 'Γ₀(N)') return sh === 'Γ₀(N)' || sh === 'Γ⁰(N)';
    if (want === 'Γ₁(N)') return sh === 'Γ₁(N)' || sh === 'Γ¹(N)';
    if (want === 'Γ(N)') return sh === 'Γ(N)';
    if (want === 'other') return !['full', 'Γ₀(N)', 'Γ⁰(N)', 'Γ₁(N)', 'Γ¹(N)', 'Γ(N)'].includes(sh);
    return true;
}

function matchesH1(r, want) {
    if (!want) return true;
    const p = presentationOf(r);
    let ab = p && p.pres && p.pres.abelian ? p.pres.abelian : null;
    if (!ab && r.thinCert && r.thinCert.presentation && r.thinCert.presentation.abelian) {
        ab = r.thinCert.presentation.abelian;
    }
    if (!ab) return false;
    const rank = ab.rank || 0;
    const tor = ab.torsion || [];
    if (want === 'inf') return rank >= 1;
    if (want === 'rank2') return rank >= 2;
    if (want === 'finite') return rank === 0;
    if (want === 'torsion') return tor.length > 0;
    if (want === 'trivial') return rank === 0 && tor.length === 0;
    return true;
}

function matchesQuery(r, qRaw) {
    const q = qRaw.trim().toLowerCase();
    if (!q) return true;
    const hay = [
        r.key,
        r.via || '',
        r.field || '',
        r.verdict,
        r.why || '',
        (r.g || []).map((m) => m.join(',')).join(' | '),
        r.closure ? `${r.closure.kind} ${r.closure.tex} ${r.closure.summary}` : '',
        r.arith && r.arith.S ? `S=${r.arith.S.join(',')}` : '',
        r.congruence ? `${r.congruence.head} ${r.congruence.detail || ''}` : '',
        r.thinCert ? `${r.thinCert.method} ${r.thinCert.detail || ''}` : '',
        ...(r.places || []).map((p) => `${p.headline || ''} ${p.method || ''}`),
    ];
    const p = presentationOf(r);
    if (p && p.cong) hay.push(`N=${p.cong.N} ${p.cong.shape || ''}`);
    if (p && p.pres && !p.pres.error) {
        const names = p.pres.gens.map((g) => g.name);
        hay.push(H1text(p.pres.abelian));
        hay.push((p.pres.relators || []).slice(0, 8).map((w) => relText(w, names)).join(' '));
    }
    const text = hay.join(' ').toLowerCase();
    return q.split(/\s+/).every((tok) => text.includes(tok));
}

function wireStaticControls() {
    const pills = $('verdict-pills');
    pills.innerHTML = VERDICTS.map((v) => `<button type="button" class="pill t-${v.key}" data-v="${v.key}" aria-pressed="${state.verdicts.has(v.key)}">${v.label} <span data-n="${v.key}"></span></button>`).join('');
    pills.onclick = (e) => {
        const b = e.target.closest('.pill');
        if (!b) return;
        const k = b.dataset.v;
        if (state.verdicts.has(k)) state.verdicts.delete(k); else state.verdicts.add(k);
        b.setAttribute('aria-pressed', String(state.verdicts.has(k)));
        shown = PAGE;
        syncUrlState();
        render();
    };

    document.querySelector('.presets')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-preset]');
        if (!b) return;
        const preset = b.dataset.preset;
        state.verdicts = preset === 'all'
            ? new Set(ALL_VERDICT_KEYS)
            : preset === 'decided' ? new Set(DECIDED) : new Set(UNDETERMINED);
        syncVerdictPills();
        shown = PAGE;
        syncUrlState();
        render();
    });

    $('set-select').onchange = (e) => {
        state.set = e.target.value;
        shown = PAGE;
        setBounds();
        syncUrlState();
        render();
    };

    $('by-group').onchange = (e) => {
        state.byGroup = e.target.checked;
        if (classOf) {
            all = state.byGroup ? groupRows : pairRows;
            all.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
        }
        shown = PAGE;
        syncUrlState();
        render();
    };

    $('why-select').onchange = (e) => { state.why = e.target.value; shown = PAGE; syncUrlState(); render(); };
    $('bound-select').onchange = (e) => { state.bound = Number(e.target.value); shown = PAGE; syncResetBtn(); render(); };

    let qTimer = null;
    const bindInput = (id, key) => {
        const el = $(id);
        if (!el) return;
        el.value = state[key];
        el.addEventListener('input', () => {
            clearTimeout(qTimer);
            qTimer = setTimeout(() => {
                state[key] = el.value;
                shown = PAGE;
                syncUrlState();
                render();
            }, 90);
        });
    };
    bindInput('q-input', 'q');
    bindInput('prime-input', 'primes');
    bindInput('index-input', 'index');

    for (const [id, key] of [['cong-select', 'cong'], ['h1-select', 'h1'], ['closure-select', 'closure']]) {
        const el = $(id);
        if (!el) continue;
        el.value = state[key];
        el.onchange = () => {
            state[key] = el.value;
            // Selecting congruence or H₁ naturally applies to S-arithmetic / decided groups: ensure sarith is visible if only undetermined was on
            if ((key === 'cong' || key === 'h1') && state[key] && !state.verdicts.has('sarith')) {
                state.verdicts.add('sarith');
                if (key === 'h1') state.verdicts.add('thin');
                syncVerdictPills();
            }
            if (key === 'closure' && state.closure && state.closure !== 'dense' && !state.verdicts.has('notdense')) {
                state.verdicts.add('notdense');
                syncVerdictPills();
            }
            shown = PAGE;
            syncUrlState();
            render();
        };
    }

    $('reset-filters').onclick = () => {
        state.verdicts = new Set(UNDETERMINED);
        state.why = '';
        state.q = '';
        state.primes = '';
        state.index = '';
        state.cong = '';
        state.h1 = '';
        state.closure = '';
        $('q-input').value = '';
        $('prime-input').value = '';
        $('index-input').value = '';
        $('why-select').value = '';
        $('cong-select').value = '';
        $('h1-select').value = '';
        $('closure-select').value = '';
        syncVerdictPills();
        setBounds();
        shown = PAGE;
        syncUrlState();
        render();
    };

    $('why-list').innerHTML = Object.entries(WHY).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    $('more-btn').onclick = () => { shown += PAGE; renderRows(); };
}

function syncVerdictPills() {
    for (const b of document.querySelectorAll('#verdict-pills .pill')) {
        b.setAttribute('aria-pressed', String(state.verdicts.has(b.dataset.v)));
    }
}

function refreshDynamicControls() {
    syncVerdictPills();
    $('set-select').innerHTML = setOptions().map((o) => `<option value="${esc(o.value)}" ${o.value === state.set ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    if (classOf) $('by-group').checked = !!state.byGroup;

    const whys = [...new Set(all.map((r) => r.why).filter(Boolean))].sort();
    if (state.why && !whys.includes(state.why)) state.why = '';
    $('why-select').innerHTML = '<option value="">any</option>' + whys.map((w) => `<option value="${esc(w)}" ${w === state.why ? 'selected' : ''}>${esc(w)}</option>`).join('');

    const closures = [...new Set(all.map((r) => r.closure && r.closure.kind).filter(Boolean))].sort();
    if (state.closure && !closures.includes(state.closure)) state.closure = '';
    $('closure-select').innerHTML = '<option value="">any</option>' + closures.map((c) => `<option value="${esc(c)}" ${c === state.closure ? 'selected' : ''}>${esc(c)}</option>`).join('');

    setBounds();
    syncResetBtn();
}

/** The σ₁ / e^h bounds offered for the data set shown. */
function setBounds() {
    const pool = all.filter(inSet);
    const maxB = pool.length ? Math.max(...pool.map((r) => r.B)) : 1;
    const opts = BANDS.filter((b) => b < maxB - 1e-9).concat([maxB]);
    $('bound-select').innerHTML = opts.map((b) => `<option value="${b}" ${b === maxB ? 'selected' : ''}>${+b.toFixed(3)}</option>`).join('');
    state.bound = maxB;
    const x = state.field === 'Q' ? samples.find((y) => y.name === state.set) : null;
    $('set-note').textContent = x ? `Drawn uniformly from the symmetry classes; ${pool.length} of ${x.n} computed so far.` : '';
}

function filtered() {
    const idxPred = parseNumComparison(state.index);
    return all.filter((r) => {
        if (!inSet(r)) return false;
        if (r.B > state.bound + 1e-9) return false;
        if (!state.verdicts.has(r.verdict)) return false;
        if (state.why && r.why !== state.why) return false;
        if (state.closure && (!r.closure || r.closure.kind !== state.closure)) return false;
        if (state.primes && !matchesPrimes(r, state.primes)) return false;
        if (idxPred && !idxPred(indexOf(r))) return false;
        if (state.cong && !matchesCongruence(r, state.cong)) return false;
        if (state.h1 && !matchesH1(r, state.h1)) return false;
        if (state.q && !matchesQuery(r, state.q)) return false;
        return true;
    });
}

// ───────────────────────── rows ─────────────────────────

const fmtH = (h) => h.toFixed(3);
function matrix(m, h) {
    const cells = m.map((x) => `<span>${esc(minus(x))}</span>`).join('');
    return `<span class="g-wrap"><span class="mx">${cells}</span>${h == null ? '' : `<span class="gh">h ${fmtH(h)}</span>`}</span>`;
}

function placeName(p) {
    if (p.kind === 'real') return 'at ∞ (ℝ)';
    if (p.kind === 'complex') return 'at ∞ (ℂ)';
    if (p.kind === 'generic') return `other primes (p = ${p.p})`;
    return `at ℚ${toSub(p.p)}`;
}
const toSub = (n) => String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c] ?? c).join('');

function presText(P, nGens = 2) {
    if (!P) return '';
    const rels = Array.isArray(P) ? P : (P.relators || []);
    const genList = (!Array.isArray(P) && P.gens && Array.isArray(P.gens) && P.gens.length)
        ? P.gens.map((g) => (typeof g === 'string' ? g : g.name))
        : Array.from({ length: Math.max(1, nGens) }, (_, i) => `g${i + 1}`);
    const genNames = genList.join(', ');
    if (!rels.length) return `⟨${genNames} | ⟩`;
    const fmtRel = (w) => (Array.isArray(w) ? relText(w, genList) : String(w));
    return `⟨${genNames} | ${rels.slice(0, 4).map(fmtRel).join(', ')}${rels.length > 4 ? ', …' : ''}⟩${!Array.isArray(P) && P.complete === false ? ' (maybe incomplete)' : ''}`;
}

/** One line on what the pipeline found. */
function headline(r) {
    const nGens = (r.g || []).length || 2;
    switch (r.verdict) {
        case 'notdense': return { vh: 'Not Zariski dense', vd: `closure ${tex(r.closure.tex)} — ${esc(r.closure.summary)}` };
        case 'discrete': {
            const d = r.places.filter((p) => p.status === 'discrete');
            const p = d[0];
            const pres = presText(p.presentation, nGens);
            return { vh: `Discrete ${d.map(placeName).join(', ')}`, vd: `${esc(p.headline)}${pres ? ` · <span class="mono">${esc(pres)}</span>` : ''}${p.detail && p.method === 'bass-serre' ? ` <span class="note">(Bass–Serre)</span>` : ''}` };
        }
        case 'sarith': {
            const S = r.sarith;
            if (S.status === 'index' && S.method && S.method.startsWith('coset enumeration in') && S.method.includes('O_k')) {
                const L = `${S.conjugated ? 'a conjugate of ' : ''}PGL₂(𝒪_K)`;
                return { vh: 'Arithmetic', vd: S.kernelIndex > 1
                    ? `its subgroup of index ${S.kernelIndex} fixing a vertex of every tree has index ${S.index} in ${L} (coset enumeration on the Voronoi presentation, exact)`
                    : `index ${S.index} in ${L} (coset enumeration on the Voronoi presentation, exact)` };
            }
            if (S.status === 'index') {
                const L = S.ring ? `PGL₂(𝒪_K[1/${S.S.join(', ')}])` : `PGL₂(ℤ[1/${S.S.join('·')}])`;
                return { vh: 'S-arithmetic', vd: S.kernelIndex > 1
                    ? `Γ ∩ ${L} has index ${S.kernelIndex} in Γ and index ${S.index} in ${L} (coset enumeration, exact)`
                    : `index ${S.index} in ${L} (coset enumeration, exact)` };
            }
            if (S.status === 'congStab') {
                const Ss = (S.S || (r.arith && r.arith.S) || []).join('·');
                return { vh: 'S-arithmetic', vd: `congruence-targeted stabilizer search: [PGL₂(ℤ) : Γₒ] ≤ ${S.stabIndex} (${esc(S.method || 'exact')}), so Γ has finite index in PGL₂(ℤ[1/${Ss}])` };
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
            if (r.thinCert) {
                const tc = r.thinCert;
                const pres = tc.presentation ? presText(tc.presentation, nGens) : '';
                return { vh: 'Thin', vd: `${esc(tc.headline || tc.detail || tc.method)}${pres ? ` · <span class="mono">${esc(pres)}</span>` : ''}` };
            }
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
    if (st.method === 'coset enumeration in PGL₂(O_k)') return `; Γₒ ⊇ a subgroup of index ${st.index} in (a conjugate of) PGL₂(𝒪_K) (${st.used} elements, coset enumeration on the Voronoi presentation)`;
    return `; Γₒ: Poincaré on ${st.used} elements, ${st.faces} sides`;
}

/** A mathematical fact the pipeline does not use, when it settles the row. */
function gapFlag(r) {
    if (r.verdict === 'open' && r.why === 'S-empty' && r.degree === 1) return 'Discrete at ∞ anyway: Γ ⊂ PGL₂(ℚ) is bounded at every prime, and PGL₂(ℚ) is discrete in the adeles.';
    return '';
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
const H1text = (a) => (!a ? '?' : [a.rank ? (a.rank === 1 ? 'ℤ' : `ℤ${sup(a.rank)}`) : null, ...(a.torsion || []).map((d) => `ℤ/${d}`)].filter(Boolean).join(' ⊕ ') || '0');
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
        const shownRels = P.relators.slice(0, 12).map((w) => relText(w, names));
        const more = P.nRelators - shownRels.length;
        const how = P.route === 'labels'
            ? `modified Todd–Coxeter on ${P.index.toLocaleString()} cosets`
            : `Reidemeister–Schreier on the ${P.index.toLocaleString()} cosets of ${P.tableFrom === 'congruence' ? 'the congruence description' : 'the coset table'}`;
        const kb = P.pruned && P.pruned.dropped ? `, pruned from ${P.pruned.before} by Knuth–Bendix` : '';
        rows.push(['presentation', `<span class="mono">⟨${names.map(nameText).join(', ')} | ${shownRels.join(', ')}${more > 0 ? `, … ${more} more` : ''}⟩</span>`
            + `<div class="note">${P.nRelators} relators on ${names.length} generators${extra.length ? `, with ${esc(extra.join(', '))}` : ''}${kb} · H₁ = ${H1text(P.abelian)} · ${how}${P.kernelIndex > 1 ? ` of a subgroup of index ${P.kernelIndex}, extended` : ''}, Tietze moves; every relator checked · ${P.ms} ms</div>`]);
    } else if (P && P.error) rows.push(['presentation', `<span class="note">${esc(P.error)}</span>`]);
    return rows;
}

function detail(r) {
    const nGens = (r.g || []).length || 2;
    const rows = [];
    if (r.gens) rows.push(['generators', r.gens.map((g, i) => `g${i + 1}: ${esc(g.type)}${g.order ? `, order ${g.order}` : g.type === 'identity' ? '' : ', infinite order'} (tr²/det = ${tex(g.tau)})`).join('<br>')]);
    if (r.closure) rows.push(['closure', `${tex(r.closure.tex)}${r.arith ? ` · ${tex(r.arith.head.replace('\\langle S \\rangle', '\\Gamma'))}` : ''}`]);
    if (r.places) rows.push(['places', r.places.map((p) => `<div><span class="st st-${p.status}">${esc(p.status)}</span> ${placeName(p)} — ${esc(p.headline)}${p.detail ? `<div class="note">${esc(p.detail)}</div>` : ''}${p.presentation ? `<div class="mono">${esc(presText(p.presentation, nGens))}</div>` : ''}</div>`).join('')]);
    if (r.congruence) rows.push(['congruence', `${esc(r.congruence.head)}${r.congruence.detail ? ` — ${esc(r.congruence.detail)}` : ''}`]);
    if (r.sarith && r.sarith.status === 'index' && r.sarith.method && r.sarith.method.includes('O_k')) {
        const S = r.sarith;
        rows.push(['exact index', `[${S.conjugated ? 'g PGL₂(𝒪_K) g⁻¹' : 'PGL₂(𝒪_K)'} : ${S.kernelIndex > 1 ? 'Γ⁺' : 'Γ'}] = ${S.index}${S.kernelIndex > 1 ? `, Γ⁺ the subgroup of index ${S.kernelIndex} fixing a vertex of every tree` : ''} — Todd–Coxeter on the presentation of PGL₂(𝒪_K) from Voronoi's algorithm (${S.cells} cell orbits), ${S.ms} ms`]);
    } else if (r.sarith && r.sarith.status === 'index') {
        const S = r.sarith;
        rows.push(['exact index', `[${S.ring ? `PGL₂(𝒪_K[1/${S.S.join(', ')}])` : `PGL₂(ℤ[1/${S.S.join('·')}])`} : Γ${S.kernelIndex > 1 ? ' ∩ PGL₂(ℤ[1/S])' : ''}] = ${S.index}${S.kernelIndex > 1 ? `, and that subgroup has index ${S.kernelIndex} in Γ (parities at ${(S.bad || []).join(', ')})` : ''} — Todd–Coxeter in the Bass–Serre presentation${S.ring ? ' (built on Poincaré’s presentation of the Bianchi group)' : ''}, ${S.ms} ms`]);
    } else if (r.sarith && r.sarith.status === 'congStab') {
        const S = r.sarith;
        rows.push(['congruence stab.', `[PGL₂(ℤ) : Γₒ] ≤ ${S.stabIndex}${S.deltaIndex ? `, [PSL₂(ℤ) : Δ] = ${S.deltaIndex}` : ''} (${esc(S.method || 'exact')}${S.level ? `, level N = ${S.level}` : ''}), ${S.ms ?? '?'} ms`]);
    } else if (r.exactIndex) {
        rows.push(['exact index', `coset enumeration did not close (${esc(r.exactIndex.limit || r.exactIndex.error || '')})`]);
    }
    if (r.thinCert) {
        const tc = r.thinCert;
        const pres = tc.presentation ? `<div class="mono">${esc(presText(tc.presentation, nGens))}</div>` : '';
        rows.push(['thin certificate', `${esc(tc.detail || tc.headline || tc.method)}${tc.ms != null ? ` · ${tc.ms} ms` : ''}${pres}`]);
    }
    if (r.orbits) {
        const O = r.orbits;
        rows.push(['vertex orbits', `${esc(O.status)}${O.verdict ? ` → ${esc(O.verdict)}` : ''} · ${O.reps ?? '?'} orbit${O.reps === 1 ? '' : 's'} (${O.defined ?? '?'} defined)${O.seeded ? ', seeded by the covering' : ''}${O.kernelIndex > 1 ? `, on a subgroup of index ${O.kernelIndex}` : ''} · ${O.ms} ms${(O.groups || []).length ? `<div class="note">stabilizers: ${O.groups.map((g) => (g.finite ? `index ${g.index}` : `infinite index (${g.vertices} vertices)`)).join(', ')}</div>` : ''}${O.error ? `<div class="note">${esc(O.error)}</div>` : ''}`]);
    }
    if (r.sarith && !['index', 'orbits', 'congStab'].includes(r.sarith.status)) {
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
    if (state.byGroup && r.members) {
        const viaHtml = r.via
            ? `; the verdict is the one computed for <a class="mono" href="${calcLinkForKey(r.via, r)}" target="_blank" rel="noopener">${esc(r.via)} ↗</a>, a conjugate generating pair`
            : '';
        rows.push(['group', `${r.members} generating pair${r.members === 1 ? '' : 's'} up to the 32 symmetries reduce to this one (conjugation by PGL₂(ℤ), Nielsen moves)${viaHtml}`]);
    }
    if (r.verdict === 'sarith') {
        const own = presentations.get(r.key), via = r.via ? presentations.get(r.via) : null;
        const p = own || via;
        if (p) {
            const pr = presentationRows(p);
            if (!own && pr.length && r.via) {
                pr[pr.length - 1][1] += `<div class="note">for the generating pair <a class="mono" href="${calcLinkForKey(r.via, r)}" target="_blank" rel="noopener">${esc(r.via)} ↗</a>, which generates a conjugate group</div>`;
            }
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
    return [{ name: 'w', poly: polyText(F.poly), near: F.root }];
}
function calcLinkFromMats(mats, r) {
    const s = settingsOf(r);
    const st = {
        v: 1,
        mats: mats.map((m) => m.map(String)),
        anti: mats.map(() => false),
        consts: r.consts || nfConsts(r),
        depth: s.depth,
        faces: s.faces,
        secs: s.seconds,
        beam: s.beam,
        flash: s.flash,
        bsecs: s.beamSeconds,
        reps: s.maxReps,
        metric: s.metric,
    };
    return `../#s=${b64url(JSON.stringify(st))}`;
}
function calcLink(r) {
    return calcLinkFromMats(r.g, r);
}
function calcLinkForKey(keyStr, r) {
    if (!keyStr || keyStr.includes(':')) return calcLink(r);
    const mats = keyStr.split('|').map((m) => m.split(','));
    return calcLinkFromMats(mats, r);
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
            <div class="row-side"><a href="${calcLink(r)}" target="_blank" rel="noopener">open in calculator ↗</a><button type="button" data-more="${i}" aria-expanded="false">details</button></div>
        </div>
    </div>`;
}

let current = [];
function renderRows() {
    const rs = current.slice(0, shown);
    $('rows').innerHTML = rs.map(rowHtml).join('') || '<p class="note">No groups match the current filters.</p>';
    $('more-btn').hidden = shown >= current.length;
}

function render() {
    renderSummary();
    current = filtered();
    const basePool = all.filter((r) => inSet(r) && r.B <= state.bound + 1e-9);
    for (const v of VERDICTS) {
        const n = basePool.filter((r) => r.verdict === v.key).length;
        const el = document.querySelector(`[data-n="${v.key}"]`);
        if (el) el.textContent = n;
    }
    $('bound-label').textContent = `${hLabel()} ≤`;
    const unit = state.byGroup && classOf ? 'groups' : 'pairs';
    $('count-line').textContent = `${current.length} of ${basePool.length} ${unit} shown${state.field === 'random' ? ', in draw order' : ', by height'}.`;
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
boot();
