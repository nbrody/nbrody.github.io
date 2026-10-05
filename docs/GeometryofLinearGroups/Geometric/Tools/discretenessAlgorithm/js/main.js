/**
 * Discreteness algorithm — is there a place of its field at which a finitely
 * generated Γ ⊂ PGL₂(ℚ̄) is discrete?
 *
 *   input     poincare's own editor and exact reader (matrixInput.js, expr.js)
 *   field     field.js: the field of definition F = ℚ(w) and its places
 *   at ∞      archWorker.js: poincare's buildGroup + runCompute per embedding,
 *             after an exact search for non-discreteness (certificates.js)
 *   finite    finiteWorker.js: trees' local fields and decision (finite.js)
 *   views     frames.js: the place chosen is shown in poincare or trees itself
 *
 * When some place is proved discrete, its tool is shown (the user's own
 * embedding first, then the other places at ∞, then the primes); until then,
 * and when there is none, the user's embedding in poincare.
 */
import {
    setupMatrixInput, getMatricesFromUI, getExactContext, getInputState, applyInputState,
} from '../../Kleinian/poincare/js/matrixInput.js';
import { readStateFromURL, writeStateToURL } from '../../Kleinian/poincare/js/permalink.js';
import { fieldModel, poincareStateFor } from './field.js';
import { CURATED, allExamples } from './examples.js';
import { ToolFrames } from './frames.js';

const VERSION = '2026-10-05a';          // busts the workers' module caches
const ARCH_TIMEOUT = 120;               // seconds for one place at ∞
const MAX_PRIMES = 12;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((c) => SUB[+c] ?? c).join('');

function typeset(...els) {
    const list = els.filter(Boolean);
    if (!list.length || !window.MathJax || !MathJax.typesetPromise) return;
    try { MathJax.typesetClear?.(list); } catch (e) { /* not yet typeset */ }
    MathJax.typesetPromise(list).catch((err) => console.warn('MathJax:', err));
}

const fmtC = (z, digits = 4) => {
    const f = (x) => String(Number(x.toFixed(digits))).replace('-', '−');
    const re = Math.abs(z.re) < 5e-5 ? 0 : z.re, im = Math.abs(z.im) < 5e-5 ? 0 : z.im;
    if (!im) return f(re);
    const ip = `${f(Math.abs(im)) === '1' ? '' : f(Math.abs(im))}i`;
    return re ? `${f(re)} ${im < 0 ? '−' : '+'} ${ip}` : `${im < 0 ? '−' : ''}${ip}`;
};

// ───────────────────────── settings ─────────────────────────

function intIn(id, lo, hi, dflt) {
    const v = parseInt($(id)?.value, 10);
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt;
}
function readSettings() {
    return {
        depth: intIn('wordLength', 1, 32, 8),
        faces: intIn('face-count-input', 1, 256, 96),
        seconds: intIn('decide-seconds', 1, 60, 4),
    };
}

// ───────────────────────── the run ─────────────────────────

const frames = new ToolFrames($('stage-body'));
let run = null;
let seq = 0;

function cancelRun() {
    if (!run) return;
    for (const w of run.workers) { try { w.terminate(); } catch (e) { /* gone */ } }
    run.workers.clear();
    run.cancelled = true;
}

function addPlace(pl) {
    run.places.push(pl);
    run.byKey.set(pl.key, pl);
}

/** poincare's state for a place at ∞ (the user's own state for the user's embedding). */
function archPlace(a, model, input) {
    return {
        key: a.key, kind: a.kind, n: a.n, tool: 'poincare', isDefault: a.isDefault,
        root: a.root, rootIndex: a.rootIndex, conjIndex: a.conjIndex,
        state: a.isDefault ? { mats: input.mats, anti: input.anti, consts: input.consts } : poincareStateFor(model, a.root),
        status: 'pending', headline: 'Deciding…', detail: '',
    };
}

/** trees' state for the prime `index` above p. */
function treesState(model, p, index, primeOf) {
    const st = {
        p: String(p), prime: index,
        mats: model.mats.map((m) => m.map((e) => e.tex)),
        consts: model.degree > 1 ? [{ name: 'w', poly: model.polyTex, near: model.roots[model.defaultIndex] }] : [],
        vertex: ['0', '0'], L: '3', r: '2', model: 'halfplane',
    };
    if (primeOf) st.primeOf = primeOf;
    return st;
}

function analyze() {
    cancelRun();
    const errEl = $('matrix-error-message');
    errEl.textContent = '';
    let matrices;
    try {
        matrices = getMatricesFromUI();
    } catch (e) {
        errEl.textContent = e.message;
        if (!run) setStageStatus(`Input error — ${e.message}`);
        return;
    }
    const exact = getExactContext();
    const input = getInputState();
    const anti = (input.anti || []).some(Boolean);
    const settings = readSettings();
    run = {
        seq: ++seq, input, settings, exact, places: [], byKey: new Map(), workers: new Set(),
        model: null, note: null, generic: null, finiteDone: false, primes: null, standard: [],
        selected: null, userPicked: false, finiteError: null,
    };
    let model = null;
    if (exact && !anti) {
        try { model = fieldModel(exact); }
        catch (e) { run.note = `The field of definition could not be found (${e.message}); only your embedding is tested.`; }
    } else if (!exact) {
        run.note = 'Some entry is not an algebraic number this tool can represent, so Γ is read in floating point: only your embedding is tested, and there are no finite places.';
    } else {
        run.note = 'Mirror generators (z̄) depend on the embedding into ℂ, so only your embedding is tested, and there are no finite places.';
    }
    run.model = model;

    if (model) {
        for (const a of model.arch) addPlace(archPlace(a, model, input));
    } else {
        // real when every generator is a real matrix up to scale (det > 0 keeps it real at det 1)
        const real = matrices.every((M) => [M.a, M.b, M.c, M.d].every((z) => Math.abs(z.im) < 1e-12));
        addPlace({
            key: 'inf1', kind: real ? 'real' : 'complex', n: 1, tool: 'poincare', isDefault: true,
            state: { mats: input.mats, anti: input.anti, consts: input.consts },
            status: 'pending', headline: 'Deciding…', detail: '',
        });
    }
    if (model) startFinite();
    else run.finiteDone = true;

    renderAll();
    startArchJobs();
    selectPlace(run.places[0].key, { auto: true });
    updatePermalink();
}

// ───────────────────────── places at ∞ ─────────────────────────

function startArchJobs() {
    const R = run;
    const queue = R.places.filter((pl) => pl.tool === 'poincare');
    const max = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    let active = 0;
    const next = () => {
        if (R.cancelled) return;
        while (active < max && queue.length) {
            const pl = queue.shift();
            active++;
            runArch(R, pl).finally(() => { active--; next(); });
        }
    };
    next();
}

function runArch(R, pl) {
    return new Promise((resolve) => {
        let worker;
        try {
            worker = new Worker(new URL(`./archWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
        } catch (e) {
            setArch(R, pl, { error: 'module workers are unavailable here' });
            resolve(); return;
        }
        R.workers.add(worker);
        const done = () => { clearTimeout(timer); try { worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(worker); resolve(); };
        const timer = setTimeout(() => { setArch(R, pl, { timeout: true }); done(); }, ARCH_TIMEOUT * 1000);
        worker.onmessage = (ev) => {
            const m = ev.data;
            if (m.error) { setArch(R, pl, { error: m.error }); done(); return; }
            if (m.phase === 'cert') {
                pl.cert = m.cert;
                if (m.cert && m.cert.nondiscrete) { setArch(R, pl, { cert: m.cert }); done(); }
                return;
            }
            if (m.phase === 'done') { setArch(R, pl, { cert: m.cert, summary: m.summary }); done(); }
        };
        worker.onerror = (e) => {
            e.preventDefault?.();
            setArch(R, pl, { error: e.message || 'the worker failed to load' });
            done();
        };
        const st = R.settings;
        worker.postMessage({ id: pl.key, state: pl.state, maxFaces: st.faces, maxDepth: st.depth });
    });
}

const vol = (v) => (v == null ? '' : ` ${Number(v).toFixed(4)}`);

function setArch(R, pl, { cert = null, summary = null, error = null, timeout = false }) {
    if (R !== run) return;
    const where = pl.kind === 'real' ? 'PGL₂(ℝ)' : 'PSL₂(ℂ)';
    if (cert && cert.nondiscrete) {
        Object.assign(pl, { status: 'nondiscrete', headline: 'Not discrete', detail: cert.text });
    } else if (summary && summary.status === 'verified') {
        // At a real place Γ preserves a plane of H³: its covolume there is
        // infinite, so poincare's volume says nothing about the area in H².
        const what = pl.kind === 'real' ? 'Fuchsian'
            : summary.finiteVolume ? `finite covolume${vol(summary.volume)}` : 'infinite covolume';
        Object.assign(pl, {
            status: 'discrete',
            headline: `Discrete in ${where} — ${what}`,
            detail: `Poincaré’s conditions hold for a domain with ${summary.faces} faces${summary.bp ? `, centred at (${summary.bp.join(', ')}) in the ball` : ''}${summary.exactUsed ? ', the relations checked exactly' : ''}${summary.h1 ? `; H₁ = ${summary.h1}` : ''}.`,
        });
        // Show the domain that was verified.
        if (summary.bp) pl.state = { ...pl.state, bp: summary.bp };
    } else if (summary && summary.capped) {
        Object.assign(pl, { status: 'unknown', headline: 'Probably not discrete', detail: 'The basepoint stabilizer did not close up into a finite group.' });
    } else if (summary && summary.status === 'incomplete') {
        Object.assign(pl, { status: 'likely', headline: 'Probably discrete', detail: `Every Poincaré condition that could be resolved holds (${summary.faces} faces); some checks are open.` });
    } else if (summary && summary.membershipFail) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: 'The domain found is for a proper subgroup: a generator is not a product of its face pairings. Raise the word length.' });
    } else if (summary) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: `Poincaré’s conditions fail at this word length${summary.tries > 1 ? `, from ${summary.tries} basepoints` : ''}. Raise it — or Γ may not be discrete here.` });
    } else if (timeout) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: `The domain took longer than ${ARCH_TIMEOUT} s.` });
    } else {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: `Error: ${error}` });
    }
    pl.summary = summary;
    placeChanged();
}

// ───────────────────────── finite places ─────────────────────────

function startFinite() {
    const R = run, m = R.model, st = R.settings;
    const job = {
        poly: m.degree > 1 ? m.polySrc : null,
        mats: m.mats.map((r) => r.map((e) => e.src)),
        numbers: m.numbers, seconds: st.seconds, maxPrimes: MAX_PRIMES,
    };
    let worker;
    try {
        worker = new Worker(new URL(`./finiteWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
    } catch (e) {
        R.finiteDone = true; R.finiteError = 'module workers are unavailable here';
        return;
    }
    R.workers.add(worker);
    let watchdog = null;
    const finish = (err) => {
        clearTimeout(watchdog);
        try { worker.terminate(); } catch (e) { /* gone */ }
        R.workers.delete(worker);
        if (R !== run) return;
        R.finiteDone = true;
        if (err) R.finiteError = err;
        placeChanged();
    };
    const arm = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => finish(`no answer for ${3 * st.seconds + 20} s`), (3 * st.seconds + 20) * 1000);
    };
    arm();
    worker.onmessage = (ev) => {
        if (R !== run) return;
        const { msg, error } = ev.data;
        if (error) { finish(error); return; }
        arm();
        if (msg.type === 'primes') { R.primes = msg; placeChanged(); }
        else if (msg.type === 'generic') { R.generic = genericPlace(R, msg); addPlace(R.generic); placeChanged(); }
        else if (msg.type === 'place') {
            if (msg.status === 'standard') R.standard.push(msg);
            else addPlace(finitePlace(R, msg));
            placeChanged();
        } else if (msg.type === 'done') finish(null);
    };
    worker.onerror = (e) => { e.preventDefault?.(); finish(e.message || 'the worker failed to load'); };
    worker.postMessage({ id: R.seq, job });
}

function decisionVerdict(d) {
    if (!d) return { status: 'unknown', headline: 'Undecided', detail: '' };
    if (d.verdict === 'discrete') {
        const headline = d.kind === 'finite' ? `Discrete — finite, of order ${d.order}`
            : d.kind === 'free' ? `Discrete — free of rank ${d.freeRank}`
                : d.kind === 'virtually-free' ? 'Discrete — virtually free' : 'Discrete';
        return { status: 'discrete', headline, detail: d.reason };
    }
    if (d.verdict === 'nondiscrete') return { status: 'nondiscrete', headline: 'Not discrete', detail: d.reason };
    return { status: 'unknown', headline: 'Undecided', detail: d.reason };
}

function finitePlace(R, msg) {
    const v = msg.status === 'decided' ? decisionVerdict(msg.decision)
        : { status: 'unknown', headline: 'Undecided', detail: msg.reason || '' };
    return {
        key: msg.key, kind: 'finite', tool: 'trees', p: msg.p, index: msg.index, count: msg.count,
        e: msg.e, f: msg.f, q: msg.q, primeTex: msg.primeTex, primeOf: msg.primeOf,
        state: treesState(R.model, msg.p, msg.index, msg.primeOf), decision: msg.decision || null, ...v,
    };
}

function genericPlace(R, msg) {
    let v;
    if (msg.error) v = { status: 'unknown', headline: 'Undecided', detail: msg.error };
    else {
        const d = msg.decision;
        if (d.verdict === 'discrete' && d.kind === 'finite') {
            v = { status: 'discrete', headline: `Γ is finite, of order ${d.order}`, detail: 'A finite group is discrete at every place.' };
        } else if (d.verdict === 'nondiscrete') {
            v = { status: 'nondiscrete', headline: 'Not discrete — bounded and infinite', detail: d.reason };
        } else v = decisionVerdict(d);
    }
    return {
        key: 'generic', kind: 'generic', tool: 'trees', p: msg.p, index: 0, count: 1,
        state: treesState(R.model, msg.p, 0, null), decision: msg.decision || null, ...v,
    };
}

// ───────────────────────── choosing the view ─────────────────────────

/** Order of preference: the user's embedding, the other places at ∞, the primes. */
function preference(R) {
    const arch = R.places.filter((p) => p.tool === 'poincare');
    const fin = R.places.filter((p) => p.kind === 'finite');
    return arch.concat(fin);
}

function maybeAutoSelect() {
    const R = run;
    if (!R || R.userPicked) return;
    const order = preference(R);
    for (const pl of order) {
        if (pl.status === 'discrete') { if (R.selected !== pl.key) selectPlace(pl.key, { auto: true }); return; }
        if (pl.status === 'pending') return;            // a preferred place may still turn out discrete
    }
    if (!R.finiteDone) return;
    // Nothing proved discrete: a "probably discrete" place, else stay on the user's embedding.
    const likely = order.find((pl) => pl.status === 'likely');
    if (likely && R.selected !== likely.key) selectPlace(likely.key, { auto: true });
}

function selectPlace(key, { auto = false } = {}) {
    const R = run;
    const pl = R && R.byKey.get(key);
    if (!pl) return;
    if (!auto) R.userPicked = true;
    if (R.selected !== key) {
        R.selected = key;
        const st = R.settings;
        const state = pl.tool === 'poincare' ? { ...pl.state, depth: st.depth, faces: st.faces } : pl.state;
        const url = frames.show(pl.tool, state);
        $('stage-empty').hidden = true;
        const link = $('open-tool');
        link.href = url; link.hidden = false;
    }
    $('stage-caption').textContent = captionFor(pl);
    renderChips();
    renderLists();
    syncPicker();
}

function captionFor(pl) {
    const m = run.model;
    if (pl.tool === 'poincare') {
        const at = m && m.degree > 1 ? `w ↦ ${fmtC(pl.root)}` : 'the only embedding';
        return `σ${sub(pl.n)}: ${at} — ${pl.kind === 'real' ? 'Γ ⊂ PGL₂(ℝ) acting on H² ⊂ H³' : 'Γ ⊂ PSL₂(ℂ) acting on H³'}, in Poincaré${pl.isDefault ? ' (your embedding)' : ''}`;
    }
    if (pl.kind === 'generic') return `${pl.p}, a prime where Γ is bounded — in Trees`;
    const valence = Number(pl.q) + 1;
    if (!run.model || run.model.degree === 1) return `ℚ${sub(pl.p)}: the ${valence}-regular tree of PGL₂(ℚ${sub(pl.p)}) — in Trees`;
    return `${primeName(pl)} above ${pl.p}: the ${valence}-regular tree of PGL₂(F_𝔭) — in Trees`;
}

function primeName(pl) {
    if (!run.model || run.model.degree === 1) return `p = ${pl.p}`;
    return pl.count > 1 ? `𝔭${sub(pl.index + 1)}` : '𝔭';
}

// ───────────────────────── rendering ─────────────────────────

function setStageStatus(text) {
    $('stage-status').textContent = text;
}

function placeChanged() {
    renderChips();
    renderLists();
    renderSummary();
    maybeAutoSelect();
}

function renderAll() {
    renderFieldCard();
    renderChips();
    renderLists();
    renderSummary();
}

function chipLabel(pl) {
    if (pl.tool === 'poincare') return `σ${sub(pl.n)} · ${pl.kind === 'real' ? 'ℝ' : 'ℂ'}`;
    if (pl.kind === 'generic') return 'other primes';
    if (!run.model || run.model.degree === 1) return `ℚ${sub(pl.p)}`;
    return `${pl.count > 1 ? `𝔭${sub(pl.index + 1)}` : '𝔭'} | ${pl.p}`;
}

function chipOrder(R) {
    const arch = R.places.filter((p) => p.tool === 'poincare');
    const fin = R.places.filter((p) => p.kind === 'finite')
        .sort((a, b) => (BigInt(a.p) < BigInt(b.p) ? -1 : BigInt(a.p) > BigInt(b.p) ? 1 : a.index - b.index));
    const gen = R.places.filter((p) => p.kind === 'generic');
    return arch.concat(fin, gen);
}

function renderChips() {
    const bar = $('place-bar');
    if (!run) { bar.innerHTML = ''; return; }
    bar.innerHTML = chipOrder(run).map((pl) => `<button class="place-chip${pl.key === run.selected ? ' selected' : ''}" data-key="${pl.key}" data-status="${pl.status}" title="${esc(pl.headline)}"><span class="dot"></span>${esc(chipLabel(pl))}</button>`).join('')
        + (run.model && !run.finiteDone ? '<span class="place-chip" data-status="pending" style="cursor:default"><span class="dot"></span>finding primes…</span>' : '');
}

function placeRow(pl) {
    let name, subline;
    if (pl.tool === 'poincare') {
        name = `\\(\\sigma_{${pl.n}}\\)`;
        const m = run.model;
        subline = `${m && m.degree > 1 ? `w ↦ ${fmtC(pl.root)} · ` : ''}${pl.kind === 'real' ? 'real' : 'complex'}${pl.isDefault ? ' · yours' : ''}`;
    } else if (pl.kind === 'generic') {
        name = 'Every other prime';
        subline = `tested at ${pl.p}`;
    } else {
        const m = run.model;
        name = m && m.degree > 1 && pl.primeTex ? `\\(${pl.count > 1 ? `\\mathfrak p_{${pl.index + 1}}` : '\\mathfrak p'} = ${pl.primeTex}\\)` : `\\(p = ${pl.p}\\)`;
        subline = m && m.degree > 1 ? `above ${pl.p} · e=${pl.e} f=${pl.f}` : `ℚ${sub(pl.p)}`;
    }
    const detail = pl.kind === 'generic' ? genericDetail(pl) : pl.detail;
    return `<button class="da-row${pl.key === run.selected ? ' selected' : ''}" data-key="${pl.key}" data-status="${pl.status}">
        <div class="da-row-head"><span class="dot"></span><span class="da-row-name">${name}</span><span class="da-row-sub">${esc(subline)}</span></div>
        <div class="da-row-verdict">${esc(pl.headline)}</div>
        ${detail ? `<div class="da-row-detail">${esc(detail)}</div>` : ''}
    </button>`;
}

function genericDetail(pl) {
    const R = run;
    const parts = [];
    const nBad = R.primes ? R.primes.primes.length : 0;
    parts.push(nBad
        ? `Outside ${R.primes.primes.join(', ')}, every generator lies in PGL₂(𝒪_𝔭): Γ fixes the standard vertex of every tree.`
        : 'Every generator lies in PGL₂(𝒪_𝔭) at every prime: Γ fixes the standard vertex of every tree.');
    if (R.standard.length) parts.push(`So do the primes above ${[...new Set(R.standard.map((s) => s.p))].join(', ')}.`);
    if (pl.detail) parts.push(pl.detail);
    return parts.join(' ');
}

function renderLists() {
    const R = run;
    const archEl = $('arch-list'), finEl = $('finite-list');
    if (!R) { archEl.innerHTML = finEl.innerHTML = ''; return; }
    const order = chipOrder(R);
    archEl.innerHTML = order.filter((p) => p.tool === 'poincare').map(placeRow).join('');
    const fin = order.filter((p) => p.tool === 'trees');
    let html = fin.map(placeRow).join('');
    if (!R.model) html = `<p class="empty-message">${esc(R.note || 'No finite places.')}</p>`;
    else if (!R.finiteDone) html += '<p class="empty-message">Deciding at the primes…</p>';
    if (R.finiteError) html += `<p class="error-message">${esc(R.finiteError)}</p>`;
    if (R.primes && R.primes.capped) html += `<p class="label-hint">Only the first ${MAX_PRIMES} of ${R.primes.capped} candidate primes were tested.</p>`;
    if (R.primes && R.primes.complete === false) html += '<p class="label-hint">Some large number could not be factored; a prime dividing it may be missing.</p>';
    finEl.innerHTML = html;
    typeset(archEl, finEl);
}

function placeList(ps) {
    return ps.map((pl) => (pl.tool === 'poincare' ? `σ${sub(pl.n)}` : pl.kind === 'generic' ? 'every other prime' : chipLabel(pl))).join(', ');
}

function renderSummary() {
    const R = run, el = $('verdict-summary');
    if (!R) return;
    const all = chipOrder(R);
    const yes = all.filter((p) => p.status === 'discrete');
    const likely = all.filter((p) => p.status === 'likely');
    const no = all.filter((p) => p.status === 'nondiscrete');
    const open = all.filter((p) => p.status === 'unknown');
    const pending = all.filter((p) => p.status === 'pending').length || (R.model && !R.finiteDone);
    const finite = R.generic && R.generic.decision && R.generic.decision.kind === 'finite';
    let head, cls;
    if (finite) { head = `Γ is finite (order ${R.generic.decision.order}): discrete at every place.`; cls = 'yes'; }
    else if (yes.length) { head = `Γ is discrete at ${placeList(yes)}.`; cls = 'yes'; }
    else if (pending) { head = 'Deciding…'; cls = ''; }
    else if (!open.length && !likely.length) { head = 'Γ is not discrete at any place.'; cls = 'no'; }
    else if (likely.length) { head = `Probably discrete at ${placeList(likely)}; not proved.`; cls = 'open'; }
    else { head = 'No place found where Γ is discrete.'; cls = 'open'; }
    const lines = [`<p class="da-head ${cls}">${esc(head)}</p>`];
    if (!finite) {
        if (no.length) lines.push(`<p>Not discrete at ${esc(placeList(no))}.</p>`);
        if (open.length) lines.push(`<p>Undecided at ${esc(placeList(open))}.</p>`);
    }
    if (R.note) lines.push(`<p class="label-hint">${esc(R.note)}</p>`);
    if (!finite && no.length && !yes.length && !pending && !open.length && R.model && R.model.degree >= 1) {
        lines.push('<p class="label-hint">Γ may still be discrete in a product of places (the S-arithmetic case).</p>');
    }
    el.innerHTML = lines.join('');
    if (!R.selected || $('stage-empty').hidden === false) setStageStatus(head);
}

function renderFieldCard() {
    const R = run, el = $('field-card');
    const m = R.model;
    if (!m) {
        el.innerHTML = `<p>${R.exact ? `Your field \\(K = ${R.exact.field.tex()}\\).` : 'Floating point.'}</p>`;
        $('embedding-picker').innerHTML = '';
        typeset(el);
        return;
    }
    const [r1, r2] = m.signature;
    const K = R.exact.field;
    let html = m.degree === 1
        ? '<p>\\(F = \\mathbb{Q}\\): one place at ∞, real.</p>'
        : `<p>\\(F = \\mathbb{Q}(w)\\), \\(${m.polyTex} = 0\\)</p><p>Degree ${m.degree}, signature (${r1}, ${r2}): ${r1} real place${r1 === 1 ? '' : 's'} and ${r2} complex.</p>`;
    if (K.deg !== m.degree) html += `<p class="label-hint">Your entries generate \\(K = ${K.tex()}\\), of degree ${K.deg}; Γ is already defined over the subfield F.</p>`;
    const mats = m.mats.map((row, i) => `\\(g_{${i + 1}} \\sim \\begin{pmatrix} ${row[0].tex} & ${row[1].tex} \\\\ ${row[2].tex} & ${row[3].tex} \\end{pmatrix}\\)`).join('');
    html += `<details><summary>The generators over F, normalized</summary><div class="da-mats">${mats}</div></details>`;
    el.innerHTML = html;
    typeset(el);
    const pick = $('embedding-picker');
    pick.innerHTML = '';
    run.picker = null;
    if (m.degree > 1 && window.RootPicker) {
        run.picker = window.RootPicker.create(pick, {
            onSelect: (i) => {
                const pl = run.places.find((p) => p.tool === 'poincare' && (p.rootIndex === i || p.conjIndex === i));
                if (pl) selectPlace(pl.key);
            },
        });
        syncPicker();
    }
}

function syncPicker() {
    const R = run;
    if (!R || !R.picker || !R.model) return;
    const pl = R.byKey.get(R.selected);
    const idx = pl && pl.tool === 'poincare' ? pl.rootIndex : R.model.defaultIndex;
    R.picker.set(R.model.roots, idx, 'w');
}

// ───────────────────────── permalinks, examples, wiring ─────────────────────────

function currentState() {
    const st = readSettings();
    return { v: 1, ...getInputState(), depth: st.depth, faces: st.faces, secs: st.seconds };
}

function updatePermalink() {
    try { return writeStateToURL(currentState()); } catch (e) { return null; }
}

function applySettings(st) {
    if (st.depth) $('wordLength').value = String(st.depth);
    if (st.faces) $('face-count-input').value = String(st.faces);
    if (st.secs) $('decide-seconds').value = String(st.secs);
}

function loadExample(ex) {
    applyInputState({ mats: ex.mats, anti: ex.anti || [], consts: ex.consts || [] });
    $('wordLength').value = String(ex.depth || 8);
    showTab('places');
    setTimeout(analyze, 60);
}

const CAT_ORDER = ['Places that disagree'];

async function buildExampleModal() {
    const examples = await allExamples();
    const modal = document.createElement('div');
    modal.id = 'da-example-modal';
    modal.className = 'example-modal';
    modal.hidden = true;
    const cats = new Map();
    examples.forEach((ex, idx) => {
        if (!cats.has(ex.cat)) cats.set(ex.cat, []);
        cats.get(ex.cat).push({ ex, idx });
    });
    const ordered = [...CAT_ORDER.filter((c) => cats.has(c)), ...[...cats.keys()].filter((c) => !CAT_ORDER.includes(c))];
    let html = `<div class="example-modal-backdrop"></div>
        <div class="example-modal-panel" role="dialog" aria-label="Example library">
            <div class="example-modal-head"><h3>Example Library</h3><button class="example-modal-close" aria-label="Close">×</button></div>
            <div class="example-modal-body">`;
    for (const cat of ordered) {
        html += `<section class="example-cat"><h4 class="example-cat-title">${esc(cat)}</h4><div class="example-grid">`;
        for (const { ex, idx } of cats.get(cat)) {
            const badges = ex.anti && ex.anti.some(Boolean) ? '<span class="ex-badge mirrors" title="Orientation-reversing generators: one embedding only">mirrors</span>' : '';
            html += `<button class="example-card" data-idx="${idx}">
                <span class="example-card-head"><span class="example-name">${ex.name}</span><span class="example-badges">${badges}</span></span>
                ${ex.desc ? `<span class="example-desc">${esc(ex.desc)}</span>` : ''}</button>`;
        }
        html += '</div></section>';
    }
    modal.innerHTML = html + '</div></div>';
    $('example-host').appendChild(modal);
    const close = () => { modal.hidden = true; };
    modal.querySelector('.example-modal-backdrop').addEventListener('click', close);
    modal.querySelector('.example-modal-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
    modal.querySelectorAll('.example-card').forEach((card) => card.addEventListener('click', () => {
        close();
        loadExample(examples[+card.dataset.idx]);
    }));
    $('da-example-btn').addEventListener('click', () => { modal.hidden = false; });
}

function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === `tab-${name}`));
}

function wire() {
    document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('collapse-btn').addEventListener('click', () => {
        const on = $('control-panel').classList.toggle('collapsed');
        document.body.classList.toggle('panel-collapsed', on);
    });
    $('decide-btn').addEventListener('click', () => { analyze(); showTab('places'); });
    // Enter in a MathQuill field decides.
    $('tab-group').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest('.mq-editable-field')) { e.preventDefault(); analyze(); showTab('places'); }
    });
    const pick = (e) => {
        const btn = e.target.closest('[data-key]');
        if (btn && run && run.byKey.has(btn.dataset.key)) selectPlace(btn.dataset.key);
    };
    $('place-bar').addEventListener('click', pick);
    $('arch-list').addEventListener('click', pick);
    $('finite-list').addEventListener('click', pick);
    $('copy-link').addEventListener('click', async () => {
        const url = updatePermalink() || location.href;
        const btn = $('copy-link');
        try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; }
        catch (e) { btn.textContent = 'Copy failed — the URL bar has the link'; }
        setTimeout(() => { btn.textContent = 'Copy link to this group'; }, 1800);
    });
}

// ───────────────────────── boot ─────────────────────────

const urlState = readStateFromURL();
const initial = urlState || { ...CURATED.find((e) => e.name.startsWith('Hecke')), anti: [] };
wire();
if (urlState) applySettings(urlState);
// poincare's editor: generators, constants (root rows with their pickers), the
// field status line, and ⟳ (#refresh-btn), all calling `analyze`.
setupMatrixInput(analyze, { mats: initial.mats, anti: initial.anti || [], consts: initial.consts || [] });
buildExampleModal();
setTimeout(analyze, 200);
