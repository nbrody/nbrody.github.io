/**
 * Presentation Calculator — what is a finitely generated Γ ⊂ PGL₂(ℚ̄)?
 *
 *   1  Zariski closure   the Zariski Closure engine (zariskiWorker.js): the
 *                        closure over ℚ̄, and for a dense Γ its trace field k,
 *                        quaternion algebra A, the set S of primes where Γ is
 *                        unbounded, and the congruence closure.
 *   2  Discreteness      the Discreteness Algorithm's places: poincare at each
 *                        place at ∞ (archWorker.js), trees at each prime
 *                        (discretenessAlgorithm/js/finiteWorker.js). A discrete
 *                        place ends the pipeline and is shown.
 *   3  Congruence        step 1's congruence closure, shown.
 *   4  S-arithmetic      FlashBeam's covering certificate on ∏_{𝔭∈S} T_𝔭
 *                        (sarithWorker.js), then poincare on the stabilizer of
 *                        o when A splits at one place at ∞.
 *
 * Input, permalinks and the views are poincare's and trees' own modules and
 * pages; nothing of them is copied.
 */
import {
    setupMatrixInput, getMatricesFromUI, getExactContext, getInputState, applyInputState,
} from '../../Geometric/Tools/Kleinian/poincare/js/matrixInput.js';
import { readStateFromURL, writeStateToURL } from '../../Geometric/Tools/Kleinian/poincare/js/permalink.js';
import { presentationTex } from '../../Geometric/Tools/Kleinian/poincare/js/presentation.js';
import { fieldModel, poincareStateFor } from '../../Geometric/Tools/discretenessAlgorithm/js/field.js';
import { ToolFrames, toolURL } from '../../Geometric/Tools/discretenessAlgorithm/js/frames.js';
import { CURATED, CAT_ORDER, allExamples } from './examples.js';
import { archClasses } from './archPlaces.js';
import { zariskiCard, congruenceCard, zariskiLine, congruenceLine, texToText, esc, mix } from './zariskiView.js';
import { sarithCard, liveNumbers, wordText } from './sarithView.js';

const VERSION = '2026-10-05a';          // busts the workers' module caches
const ARCH_TIMEOUT = 120;               // seconds for one place at ∞
const ZARISKI_TIMEOUT = 120;
const MAX_PRIMES = 12;
const STEPS = ['zariski', 'places', 'congruence', 'sarith'];
const STEP_NAMES = { zariski: 'Zariski closure', places: 'Discreteness', congruence: 'Congruence closure', sarith: 'S-arithmetic' };

const $ = (id) => document.getElementById(id);
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
        beam: intIn('beam-width', 100, 20000, 1500),
        flash: intIn('flash-size', 0, 400, 40),
        beamSeconds: intIn('beam-seconds', 5, 1800, 60),
        maxReps: intIn('max-reps', 1, 200, 24),
    };
}

// ───────────────────────── the run ─────────────────────────

const frames = new ToolFrames($('stage-body'), { note: 'The generators and constants are set in the Presentation Calculator panel. The settings here belong to this view.' });
let run = null;
let seq = 0;

const newStep = () => ({ status: 'idle', head: '', detail: '' });

function cancelRun() {
    if (!run) return;
    for (const w of run.workers) { try { w.terminate(); } catch (e) { /* gone */ } }
    run.workers.clear();
    run.cancelled = true;
}

function setStep(name, status, head, detail = '') {
    if (!run) return;
    Object.assign(run.steps[name], { status, head, detail });
    renderSteps();
}

function compute() {
    cancelRun();
    const errEl = $('matrix-error-message');
    errEl.textContent = '';
    try {
        getMatricesFromUI();
    } catch (e) {
        errEl.textContent = e.message;
        if (!run) setStageStatus(`Input error — ${e.message}`);
        return;
    }
    const exact = getExactContext();
    const input = getInputState();
    const settings = readSettings();
    run = {
        seq: ++seq, input, settings, exact, model: null, workers: new Set(),
        steps: Object.fromEntries(STEPS.map((s) => [s, newStep()])),
        zariski: null,
        places: [], byKey: new Map(), finiteDone: false, primes: null, generic: null, standard: [], finiteError: null,
        placeSel: null, placesDone: false,
        sarith: null,
        view: null, userPicked: false, error: null,
    };
    updatePermalink();
    if (!exact) {
        run.error = 'Some entry is not an algebraic number that can be read exactly. Every step here needs exact arithmetic.';
    } else if ((input.anti || []).some(Boolean)) {
        run.error = 'Mirror generators (z̄) are not in PGL₂(ℚ̄). Turn them off to run the pipeline.';
    } else {
        try { run.model = fieldModel(exact); } catch (e) { run.error = `The field of definition could not be found: ${e.message}`; }
    }
    if (run.error) {
        setStep('zariski', 'open', 'Not run', run.error);
        renderVerdict();
        showView('zariski', null, { auto: true });
        return;
    }
    setStep('zariski', 'running', 'Computing…');
    renderVerdict();
    showView('zariski', null, { auto: true });
    startZariski();
}

// ───────────────────────── step 1: Zariski closure ─────────────────────────

function zariskiState(model) {
    return {
        gens: model.mats.map((row) => row.map((e) => e.tex)),
        consts: [],
        field: model.degree > 1 ? { gen: 'w', poly: model.polySrc, root: model.roots[model.defaultIndex] } : null,
    };
}

function startZariski() {
    const R = run;
    let worker;
    try {
        worker = new Worker(new URL(`../../Algebraic/Tools/zariskiClosure/zariskiWorker.js?v=${VERSION}`, import.meta.url));
    } catch (e) {
        zariskiDone(R, { ok: false, error: 'workers are unavailable here' });
        return;
    }
    R.workers.add(worker);
    const done = (res) => { clearTimeout(timer); try { worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(worker); zariskiDone(R, res); };
    const timer = setTimeout(() => done({ ok: false, error: `no answer after ${ZARISKI_TIMEOUT} s` }), ZARISKI_TIMEOUT * 1000);
    worker.onmessage = (ev) => done(ev.data.result);
    worker.onerror = (e) => { e.preventDefault?.(); done({ ok: false, error: e.message || 'the worker failed to load' }); };
    worker.postMessage({ id: R.seq, state: zariskiState(R.model) });
}

function zariskiDone(R, res) {
    if (R !== run) return;
    R.zariski = res;
    if (!res || !res.ok) {
        setStep('zariski', 'open', 'Could not compute', res && res.error ? res.error : 'unknown error');
        renderVerdict();
        refreshView('zariski');
        return;
    }
    const line = zariskiLine(res);
    if (res.closure.kind !== 'dense') {
        setStep('zariski', 'info', line.head, line.detail);
        for (const s of ['places', 'congruence', 'sarith']) setStep(s, 'skipped', 'Not needed', 'Γ is not Zariski dense.');
        renderVerdict();
        refreshView('zariski');
        return;
    }
    setStep('zariski', 'yes', line.head, line.detail);
    renderVerdict();
    refreshView('zariski');
    startPlaces();
}

// ───────────────────────── step 2: discreteness at each place ─────────────────────────

function addPlace(pl) {
    run.places.push(pl);
    run.byKey.set(pl.key, pl);
}

function archPlace(a, model, input) {
    return {
        key: a.key, kind: a.kind, n: a.n, tool: 'poincare', isDefault: a.isDefault,
        root: a.root, rootIndex: a.rootIndex, conjIndex: a.conjIndex,
        state: a.isDefault ? { mats: input.mats, anti: input.anti, consts: input.consts } : poincareStateFor(model, a.root),
        status: 'pending', headline: 'Deciding…', detail: '',
    };
}

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

function startPlaces() {
    const R = run;
    setStep('places', 'running', 'Deciding…', 'Every place of the field of definition.');
    for (const a of R.model.arch) addPlace(archPlace(a, R.model, R.input));
    startFinite();
    startArchJobs();
    R.placeSel = R.places[0].key;
    renderVerdict();
    if (!R.userPicked) showView('places', R.placeSel, { auto: true });
}

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
            runArch(R, pl.state, { certify: true }, (out) => setArch(R, pl, out)).finally(() => { active--; next(); });
        }
    };
    next();
}

/** poincare (and the certificates) on one state; calls back with { cert, summary } or { error } / { timeout }. */
function runArch(R, state, { certify = true } = {}, cb) {
    return new Promise((resolve) => {
        let worker;
        try {
            worker = new Worker(new URL(`./archWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
        } catch (e) {
            cb({ error: 'module workers are unavailable here' });
            resolve(); return;
        }
        R.workers.add(worker);
        const done = () => { clearTimeout(timer); try { worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(worker); resolve(); };
        const timer = setTimeout(() => { cb({ timeout: true }); done(); }, ARCH_TIMEOUT * 1000);
        worker.onmessage = (ev) => {
            const m = ev.data;
            if (m.error) { cb({ error: m.error }); done(); return; }
            if (m.phase === 'cert') return;
            if (m.phase === 'done') { cb({ cert: m.cert, summary: m.summary }); done(); }
        };
        worker.onerror = (e) => { e.preventDefault?.(); cb({ error: e.message || 'the worker failed to load' }); done(); };
        const st = R.settings;
        worker.postMessage({ id: 1, state, maxFaces: st.faces, maxDepth: st.depth, certify });
    });
}

const vol = (v) => (v == null ? '' : ` ${Number(v).toFixed(4)}`);

function setArch(R, pl, { cert = null, summary = null, error = null, timeout = false }) {
    if (R !== run) return;
    const where = pl.kind === 'real' ? 'PGL₂(ℝ)' : 'PSL₂(ℂ)';
    if (cert && cert.nondiscrete) {
        Object.assign(pl, { status: 'nondiscrete', headline: 'Not discrete', detail: cert.text });
    } else if (summary && summary.status === 'verified') {
        const what = summary.real ? (summary.finiteArea ? 'Fuchsian, finite area' : 'Fuchsian, infinite area')
            : summary.finiteVolume ? `finite covolume${vol(summary.volume)}` : 'infinite covolume';
        Object.assign(pl, {
            status: 'discrete',
            headline: `Discrete in ${where} — ${what}`,
            detail: `Poincaré’s conditions hold for a domain with ${summary.faces} faces${summary.exactUsed ? ', the relations checked exactly' : ''}${summary.h1 ? `; H₁ = ${summary.h1}` : ''}.`,
        });
        if (summary.bp) pl.state = { ...pl.state, bp: summary.bp };
    } else if (summary && summary.capped) {
        Object.assign(pl, { status: 'unknown', headline: 'Probably not discrete', detail: 'The basepoint stabilizer did not close up into a finite group.' });
    } else if (summary && summary.status === 'incomplete') {
        Object.assign(pl, { status: 'likely', headline: 'Probably discrete', detail: `Every Poincaré condition that could be resolved holds (${summary.faces} faces); some checks are open.` });
    } else if (summary && summary.membershipFail) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: 'The domain found is for a proper subgroup. Raise the word length.' });
    } else if (summary) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: `Poincaré’s conditions fail at this word length${summary.tries > 1 ? `, from ${summary.tries} basepoints` : ''}.` });
    } else if (timeout) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: `The domain took longer than ${ARCH_TIMEOUT} s.` });
    } else {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', detail: `Error: ${error}` });
    }
    pl.summary = summary;
    placeChanged();
}

function startFinite() {
    const R = run, m = R.model, st = R.settings;
    const job = {
        poly: m.degree > 1 ? m.polySrc : null,
        mats: m.mats.map((r) => r.map((e) => e.src)),
        numbers: m.numbers, seconds: st.seconds, maxPrimes: MAX_PRIMES,
    };
    let worker;
    try {
        worker = new Worker(new URL(`../../Geometric/Tools/discretenessAlgorithm/js/finiteWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
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
        if (d.verdict === 'discrete' && d.kind === 'finite') v = { status: 'discrete', headline: `Γ is finite, of order ${d.order}`, detail: 'A finite group is discrete at every place.' };
        else if (d.verdict === 'nondiscrete') v = { status: 'nondiscrete', headline: 'Not discrete — bounded and infinite', detail: d.reason };
        else v = decisionVerdict(d);
    }
    return {
        key: 'generic', kind: 'generic', tool: 'trees', p: msg.p, index: 0, count: 1,
        state: treesState(R.model, msg.p, 0, null), decision: msg.decision || null, ...v,
    };
}

function placeOrder(R) {
    const arch = R.places.filter((p) => p.tool === 'poincare');
    const fin = R.places.filter((p) => p.kind === 'finite')
        .sort((a, b) => (BigInt(a.p) < BigInt(b.p) ? -1 : BigInt(a.p) > BigInt(b.p) ? 1 : a.index - b.index));
    const gen = R.places.filter((p) => p.kind === 'generic');
    return arch.concat(fin, gen);
}

function placeLabel(pl) {
    if (pl.tool === 'poincare') return `σ${sub(pl.n)} · ${pl.kind === 'real' ? 'ℝ' : 'ℂ'}`;
    if (pl.kind === 'generic') return 'other primes';
    if (!run.model || run.model.degree === 1) return `ℚ${sub(pl.p)}`;
    return `${pl.count > 1 ? `𝔭${sub(pl.index + 1)}` : '𝔭'} | ${pl.p}`;
}

function placeList(ps) { return ps.map((pl) => (pl.kind === 'generic' ? 'every other prime' : placeLabel(pl))).join(', '); }

function placeChanged() {
    const R = run;
    if (!R || R.cancelled) return;
    const order = placeOrder(R);
    const yes = order.filter((p) => p.status === 'discrete');
    const pending = order.some((p) => p.status === 'pending') || !R.finiteDone;
    const finite = R.generic && R.generic.decision && R.generic.decision.kind === 'finite';
    if (yes.length) {
        const best = yes[0];
        setStep('places', 'yes', finite ? `Γ is finite (order ${R.generic.decision.order})` : `Discrete at ${placeList(yes)}`, best.headline);
        if (!R.placesDone) {
            R.placesDone = true;
            for (const s of ['congruence', 'sarith']) setStep(s, 'skipped', 'Not needed', `Γ is discrete at ${placeLabel(best)}.`);
            if (!R.userPicked) { R.placeSel = best.key; showView('places', best.key, { auto: true }); }
        }
    } else if (pending) {
        setStep('places', 'running', 'Deciding…', `${order.filter((p) => p.status !== 'pending').length} of ${order.length}${R.finiteDone ? '' : '+'} places settled.`);
    } else if (!R.placesDone) {
        R.placesDone = true;
        const no = order.filter((p) => p.status === 'nondiscrete');
        const open = order.filter((p) => p.status !== 'nondiscrete');
        setStep('places', open.length ? 'open' : 'no', open.length ? 'No place proved discrete' : 'Not discrete at any place',
            open.length ? `Not discrete at ${placeList(no) || 'no place'}; undecided at ${placeList(open)}.` : `Not discrete at ${placeList(no)}.`);
        startCongruence();
    }
    renderVerdict();
    if (R.view && R.view.step === 'places') renderSubBar();
}

// ───────────────────────── step 3: congruence closure ─────────────────────────

function startCongruence() {
    const A = run.zariski.arith;
    const line = congruenceLine(A);
    setStep('congruence', A && A.congruence && !A.congruence.error ? 'info' : 'open', line.head, line.detail);
    startSarith();
}

// ───────────────────────── step 4: S-arithmetic ─────────────────────────

/** Can the covering certificate apply? Returns { ok, note, arch } (arch: the place at ∞ to check, or null). */
function sarithApplicable(R) {
    const A = R.zariski.arith, m = R.model;
    const S = A.ring.S;
    const archF = A.spaces.factors.filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (!S.length) {
        return { ok: false, note: 'Γ is unbounded at no prime, so Λ is an arithmetic group with no tree to act on. As Γ is not discrete at any one place at ∞, Λ would be a lattice in a product of at least two of them (a Hilbert modular group, say). Certifying finite index there needs a domain in that product, which this tool does not compute.' };
    }
    if (archF.length >= 2) {
        return { ok: false, note: `$A$ splits at ${archF.length} places at ∞, so a vertex stabilizer $\\Lambda_o$ is a lattice in a product of ${archF.length} symmetric spaces. This certificate needs at most one.` };
    }
    if (!archF.length) return { ok: true, arch: null };
    const kind = archF[0].kind;
    const cls = archClasses(m).filter((a) => a.noncompact);
    const keys = new Set(cls.map((a) => a.classKey));
    if (keys.size !== 1) {
        return { ok: false, note: `The places at ∞ of the field of definition where Γ is unbounded could not be matched with the one place of $k$ where $A$ splits (${keys.size} classes found).` };
    }
    let cand = cls;
    if (kind === 'real') cand = cls.filter((a) => a.kind === 'real');
    if (!cand.length) {
        return { ok: false, note: 'At the real place of $k$ where $A$ splits, the field of definition has only complex places: Γ is conjugate into $\\mathrm{PGL}_2(\\mathbb{R})$ but not written there, which the area test needs.' };
    }
    const a = cand.find((x) => x.isDefault) || cand[0];
    return { ok: true, arch: { kind, root: a.root, n: a.n, key: a.key } };
}

function startSarith() {
    const R = run, A = R.zariski.arith, m = R.model, st = R.settings;
    const ap = sarithApplicable(R);
    R.sarith = { phase: ap.ok ? 'search' : 'na', note: ap.note, arch: ap.ok ? ap.arch : null, history: [], places: [], status: 'running' };
    if (!ap.ok) {
        R.sarith.status = 'open';
        setStep('sarith', 'open', 'Not applicable', texToText(ap.note.replace(/\$/g, '')));
        renderVerdict();
        if (!R.userPicked) showView('sarith', null, { auto: true });
        return;
    }
    setStep('sarith', 'running', 'Searching…', 'FlashBeam is looking for a covering of the product of trees.');
    R.sarith.head = 'FlashBeam is searching.';
    if (!R.userPicked) showView('sarith', 'covering', { auto: true });
    let worker;
    try {
        worker = new Worker(new URL(`./sarithWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
    } catch (e) {
        sarithError(R, 'module workers are unavailable here');
        return;
    }
    R.workers.add(worker);
    R.sarith.worker = worker;
    const stop = () => { try { worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(worker); R.sarith.worker = null; };
    const timer = setTimeout(() => { sarithError(R, 'the search did not stop in time'); stop(); }, (st.beamSeconds + 60) * 1000);
    worker.onmessage = (ev) => {
        if (R !== run) return;
        const msg = ev.data.msg;
        if (msg.type === 'places') { R.sarith.places = msg.places; R.sarith.notes = msg.notes; refreshView('sarith'); }
        else if (msg.type === 'progress') {
            R.sarith.progress = msg;
            const frac = msg.targets ? msg.covered / msg.targets : 0;
            R.sarith.history.push({ it: msg.stats.iteration, frac, reps: msg.reps });
            setStep('sarith', 'running', 'Searching…', `Iteration ${msg.stats.iteration}: ${msg.covered} of ${msg.targets} neighbours, ${msg.reps} representative${msg.reps === 1 ? '' : 's'}.`);
            patchSarith(msg.promoted);
        } else if (msg.type === 'error') {
            clearTimeout(timer); stop();
            sarithError(R, msg.error);
        } else if (msg.type === 'done') {
            clearTimeout(timer);
            // the worker stays up while the stabilizer may need more elements
            if (!(msg.status === 'covered' && R.sarith.arch)) stop();
            sarithDone(R, msg);
        } else if (msg.type === 'stab') {
            const h = R.sarith.harvestWaiting;
            R.sarith.harvestWaiting = null;
            if (h) h(msg);
        }
    };
    worker.onerror = (e) => { e.preventDefault?.(); clearTimeout(timer); sarithError(R, e.message || 'the worker failed to load'); };
    worker.postMessage({
        id: R.seq,
        job: {
            poly: m.degree > 1 ? m.polySrc : null,
            mats: m.mats.map((r) => r.map((e) => e.src)),
            S: A.ring.S.map((s) => ({ p: s.p, e: s.e, f: s.f })),
            sameField: m.degree === A.k.d,
            opts: { beamWidth: st.beam, flashSize: st.flash, seconds: st.beamSeconds, maxReps: st.maxReps },
            stabCount: 12,
        },
    });
}

function sarithError(R, err) {
    if (R !== run) return;
    Object.assign(R.sarith, { phase: 'done', status: 'open', error: err, head: 'No certificate.' });
    setStep('sarith', 'open', 'Stopped', err);
    renderVerdict();
    refreshView('sarith');
}

function sarithDone(R, msg) {
    const S = R.sarith;
    S.result = msg;
    if (msg.history) S.history = msg.history;
    const L = liveNumbers(S);
    S.history.push({ it: L.it, frac: L.frac, reps: L.reps });
    if (msg.status !== 'covered' || !(msg.verify && msg.verify.ok)) {
        Object.assign(S, { phase: 'done', status: 'open' });
        S.head = msg.status === 'covered'
            ? 'A covering was found but did not survive the exact re-check, so nothing is claimed.'
            : `No covering within the budget (${msg.iterations} iterations, ${msg.seconds.toFixed(0)} s, ${msg.reps.length} representatives, ${msg.covered} of ${msg.targets} neighbours). Nothing is claimed: Γ may still be S-arithmetic, or it may be thin.`;
        setStep('sarith', 'open', 'No certificate', `${msg.covered} of ${msg.targets} neighbours covered with ${msg.reps.length} representatives.`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    const nR = msg.reps.length;
    if (!S.arch) {
        Object.assign(S, { phase: 'done', status: 'yes' });
        S.head = `Γ is S-arithmetic. Γ has at most ${nR} orbit${nR === 1 ? '' : 's'} on the vertices of $X$, and $A$ is ramified at every place at ∞, so vertex stabilizers in Λ are finite: $[\\Lambda : \\Gamma^{(2)}] < \\infty$.`;
        setStep('sarith', 'yes', 'S-arithmetic', `Covering with ${nR} representative${nR === 1 ? '' : 's'}, re-checked exactly; stabilizers are finite.`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    // the stabilizer of o must have finite covolume at the place at ∞
    S.phase = 'stab';
    S.head = `The covering is complete (${nR} representative${nR === 1 ? '' : 's'}, re-checked exactly). It remains to see that the stabilizer of $o$ is a lattice at ∞.`;
    setStep('sarith', 'running', 'Checking the stabilizer…', 'Poincaré on the elements fixing o.');
    renderVerdict();
    refreshView('sarith');
    stabilizerCheck(R, msg.stab, 0);
}

/**
 * poincare on the smallest elements fixing o. If their domain is not a
 * lattice, the search runs on (weighted towards Γ_o) to collect more, and
 * poincare tries again: SIZES[i] elements on attempt i.
 */
const STAB_SIZES = [6, 10, 14];
const HARVEST_SECONDS = 12;

function requestHarvest(R, attempt) {
    const S = R.sarith;
    if (!S.worker) { finishStab(R, false); return; }
    S.stab = { ...(S.stab || {}), status: 'running', harvesting: true };
    setStep('sarith', 'running', 'Collecting more of Γ_o…', `FlashBeam continues, weighted towards elements fixing o (round ${attempt}).`);
    refreshView('sarith');
    S.harvestWaiting = (msg) => {
        if (R !== run) return;
        S.stabFound = msg.stabFound;
        stabilizerCheck(R, msg.stab, attempt);
    };
    S.worker.postMessage({ id: R.seq, cmd: 'harvest', seconds: HARVEST_SECONDS, stabCount: STAB_SIZES[attempt] + 4 });
}

function stabilizerCheck(R, stab, attempt) {
    const S = R.sarith;
    if (!stab.length) {
        if (attempt + 1 < STAB_SIZES.length) { requestHarvest(R, attempt + 1); return; }
        S.stab = { status: 'none', note: 'The search found no element of Γ, other than the identity, fixing o.' };
        finishStab(R, false);
        return;
    }
    const used = stab.slice(0, STAB_SIZES[attempt]);
    const consts = R.model.degree > 1 ? [{ name: 'w', poly: R.model.polyTex, near: { re: S.arch.root.re, im: S.arch.root.im } }] : [];
    const state = { mats: used.map((e) => e.tex), anti: used.map(() => false), consts };
    S.stab = { status: 'running', used, state };
    refreshView('sarith');
    runArch(R, state, { certify: false }, (out) => {
        if (R !== run) return;
        const sm = out.summary;
        const ok = sm && sm.status === 'verified' && (S.arch.kind === 'real' ? sm.finiteArea : sm.finiteVolume);
        if (ok) {
            S.stab = {
                status: 'yes', used, state, summary: sm,
                text: S.arch.kind === 'real'
                    ? `Fuchsian with finite area: their Dirichlet domain (${sm.faces} sides${sm.cusps ? `, ${sm.cusps} cusp${sm.cusps === 1 ? '' : 's'}` : ''}) satisfies Poincaré's conditions${sm.exactUsed ? ' (relations exact)' : ''} and meets the circle at infinity only in cusps. As in Poincaré, the geometry is in floating point.`
                    : `Finite covolume${vol(sm.volume)}: their Dirichlet domain (${sm.faces} faces) satisfies Poincaré's conditions${sm.exactUsed ? ' (relations exact)' : ''}. As in Poincaré, the geometry is in floating point.`,
            };
            finishStab(R, true);
        } else if (attempt + 1 < STAB_SIZES.length) {
            requestHarvest(R, attempt + 1);
        } else {
            let why;
            if (out.timeout) why = `Poincaré took longer than ${ARCH_TIMEOUT} s.`;
            else if (out.error) why = `Poincaré failed: ${out.error}`;
            else if (sm && sm.status === 'verified') why = S.arch.kind === 'real' ? `Their domain is verified but has ${sm.freeArcs} free side${sm.freeArcs === 1 ? '' : 's'} at infinity: infinite area.` : 'Their domain is verified but has infinite volume.';
            else why = 'Poincaré’s conditions did not close up for these elements at this word length.';
            S.stab = { status: 'no', used, state, summary: sm, text: `${why} Their group may have infinite index in Λ_o, or the search may not have found enough of Γ_o.` };
            finishStab(R, false);
        }
    });
}

function finishStab(R, ok) {
    const S = R.sarith;
    if (S.worker) { try { S.worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(S.worker); S.worker = null; }
    const nR = S.result.reps.length;
    S.phase = 'done';
    if (ok) {
        S.status = 'yes';
        S.head = `Γ is S-arithmetic. It has at most ${nR} orbit${nR === 1 ? '' : 's'} on the vertices of $X$, and its stabilizer of $o$ has finite ${S.arch.kind === 'real' ? 'area' : 'covolume'} at ∞, so it has finite index in $\\Lambda_o$: $[\\Lambda : \\Gamma^{(2)}] < \\infty$.`;
        setStep('sarith', 'yes', 'S-arithmetic', `Covering with ${nR} representative${nR === 1 ? '' : 's'}; the stabilizer of o is a lattice at ∞.`);
    } else {
        S.status = 'open';
        S.head = `The covering is complete, with ${nR} representative${nR === 1 ? '' : 's'}, but the stabilizer of $o$ was not shown to be a lattice at ∞. No certificate.`;
        setStep('sarith', 'open', 'No certificate', 'The covering is complete; the stabilizer check failed.');
    }
    renderVerdict();
    refreshView('sarith');
}

// ───────────────────────── the verdict ─────────────────────────

function verdict() {
    const R = run;
    if (!R) return null;
    if (R.error) return { cls: 'open', head: R.error };
    const z = R.steps.zariski, p = R.steps.places, s = R.steps.sarith;
    if (z.status === 'running') return { cls: '', head: 'Computing the Zariski closure…' };
    if (z.status === 'open') return { cls: 'open', head: `Step 1 failed: ${z.detail}` };
    if (z.status === 'info') {
        const C = R.zariski.closure;
        return { cls: 'info', head: `Γ is not Zariski dense: its closure is $${C.tex}$.`, sub: C.summary.replace(/⟨S⟩/g, 'Γ') };
    }
    if (p.status === 'yes') {
        const order = placeOrder(R).filter((x) => x.status === 'discrete');
        const best = order[0];
        return { cls: 'yes', head: `Γ is discrete at ${placeList(order)}.`, sub: best ? best.headline : '', place: best };
    }
    if (p.status === 'running' || p.status === 'idle') return { cls: '', head: 'Deciding discreteness at every place…' };
    if (s.status === 'yes') {
        const A = R.zariski.arith;
        return { cls: 'yes', head: 'Γ is S-arithmetic.', sub: `$\\Gamma^{(2)}$ has finite index in $${A.head.replace(/^.*\\le /, '')}$ (up to conjugation). ${s.detail}` };
    }
    if (s.status === 'running') return { cls: '', head: 'Not discrete at any one place. Searching for an S-arithmetic certificate…' };
    return { cls: 'open', head: 'No certificate.', sub: `${p.head}. ${s.head}: ${s.detail}` };
}

function renderVerdict() {
    const v = verdict();
    const el = $('verdict-head');
    if (!v) { el.innerHTML = '<p class="empty-message">Press Compute.</p>'; return; }
    let html = `<p class="pc-head ${v.cls}">${mix(v.head)}</p>`;
    if (v.sub) html += `<p>${mix(v.sub)}</p>`;
    // the presentation, when poincare has one
    const pl = v.place;
    if (pl && pl.summary && pl.summary.presentation) {
        const P = pl.summary.presentation;
        html += `<p class="label-hint">Presentation in your generators${pl.summary.presentationComplete ? '' : ' (some relations may be missing)'}:</p><div class="pc-pres">\\[${presentationTex(P, (i) => `g_{${i}}`, { maxRelators: 8 })}\\]</div>`;
    } else if (pl && pl.decision && pl.decision.kind === 'free') {
        html += `<p class="label-hint">Γ is free of rank ${pl.decision.freeRank}.</p>`;
    }
    el.innerHTML = html;
    typeset(el);
    if (!$('stage-empty').hidden) setStageStatus(texToText(v.head.replace(/\$/g, '')));
}

function renderSteps() {
    const R = run;
    for (const b of document.querySelectorAll('.step-chip')) {
        const st = R ? R.steps[b.dataset.step] : null;
        b.dataset.status = st ? st.status : 'idle';
        b.title = st && st.head ? `${st.head}${st.detail ? ' — ' + st.detail : ''}` : STEP_NAMES[b.dataset.step];
        b.classList.toggle('selected', !!(R && R.view && R.view.step === b.dataset.step));
    }
    const list = $('step-list');
    if (!R) { list.innerHTML = ''; return; }
    list.innerHTML = STEPS.map((s, i) => {
        const st = R.steps[s];
        return `<button class="pc-step${R.view && R.view.step === s ? ' selected' : ''}" data-step="${s}" data-status="${st.status}">
            <div class="pc-step-head"><span class="dot"></span>${esc(STEP_NAMES[s])}<span class="step-num">${i + 1}</span></div>
            <div class="pc-step-verdict">${esc(st.head || (st.status === 'idle' ? 'Waiting' : ''))}</div>
            ${st.detail ? `<div class="pc-step-detail">${esc(st.detail)}</div>` : ''}
        </button>`;
    }).join('');
}

// ───────────────────────── the stage ─────────────────────────

function setStageStatus(text) { $('stage-status').textContent = text; }

function showCard(html, caption = '') {
    frames.hide();
    $('stage-empty').hidden = true;
    const card = $('view-card');
    card.hidden = false;
    card.innerHTML = html;
    typeset(card);
    $('stage-caption').textContent = caption;
    $('open-tool').hidden = true;
}

function showFrame(tool, state, caption) {
    $('view-card').hidden = true;
    $('stage-empty').hidden = true;
    const url = frames.show(tool, state);
    const link = $('open-tool');
    link.href = url; link.hidden = false;
    $('stage-caption').textContent = caption;
}

/** Show a step (and a sub-view of it). */
function showView(step, sub = null, { auto = false } = {}) {
    const R = run;
    if (!R) return;
    if (!auto) R.userPicked = true;
    const prev = R.view;
    R.view = { step, sub };
    renderSteps();
    renderSubBar();
    renderView(!prev || prev.step !== step || prev.sub !== sub);
}

/** Re-render the current view if it is this step. */
function refreshView(step) {
    if (run && run.view && run.view.step === step) { renderSubBar(); renderView(false); }
}

function renderView(changed) {
    const R = run, v = R.view;
    if (v.step === 'zariski') {
        if (!R.zariski) { showCard(`<div class="vc-inner"><h2>Step 1 · Zariski closure</h2><p class="lead">${esc(R.error || 'Computing…')}</p></div>`, 'Zariski Closure engine'); return; }
        if (!R.zariski.ok) { showCard(`<div class="vc-inner"><h2>Step 1 · Zariski closure</h2><div class="banner" data-status="open"><span class="dot"></span><div>${esc(R.zariski.error)}</div></div></div>`); return; }
        showCard(zariskiCard(R.zariski, R.model), 'From the Zariski Closure engine');
    } else if (v.step === 'places') {
        const pl = R.byKey.get(v.sub || R.placeSel);
        if (!pl) { showCard(`<div class="vc-inner"><h2>Step 2 · Discreteness</h2><p class="lead">${esc(R.steps.places.status === 'skipped' ? 'Not needed: Γ is not Zariski dense.' : 'Waiting for step 1.')}</p></div>`); return; }
        R.placeSel = pl.key;
        if (changed || frames.current !== pl.tool || R._shownPlace !== pl.key) {
            R._shownPlace = pl.key;
            const st = R.settings;
            const state = pl.tool === 'poincare' ? { ...pl.state, depth: st.depth, faces: st.faces } : pl.state;
            showFrame(pl.tool, state, placeCaption(pl));
        } else $('stage-caption').textContent = placeCaption(pl);
    } else if (v.step === 'congruence') {
        const A = R.zariski && R.zariski.arith;
        if (R.steps.congruence.status === 'skipped' || R.steps.congruence.status === 'idle') {
            const why = R.steps.congruence.status === 'skipped' ? R.steps.congruence.detail : 'Runs when no place is discrete.';
            showCard(`<div class="vc-inner"><h2>Step 3 · Congruence closure</h2><p class="lead">${esc(why)}</p>${A ? congruenceCard(A).replace('<div class="vc-inner"><h2>Step 3 · Congruence closure</h2>', '<div><h3>Computed anyway, in step 1</h3>') : ''}</div>`);
        } else showCard(congruenceCard(A), 'From the Zariski Closure engine');
    } else if (v.step === 'sarith') {
        const S = R.sarith;
        if (!S) {
            const st = R.steps.sarith;
            showCard(`<div class="vc-inner"><h2>Step 4 · Is Γ S-arithmetic?</h2><p class="lead">${esc(st.status === 'skipped' ? st.detail : 'Runs when no place is discrete.')}</p></div>`);
            return;
        }
        if (v.sub === 'stabilizer' && S.stab && S.stab.state) {
            if (changed || frames.current !== 'poincare' || R._shownPlace !== 'stab') {
                R._shownPlace = 'stab';
                showFrame('poincare', { ...S.stab.state, depth: R.settings.depth, faces: R.settings.faces }, `The elements of Γ fixing o, at ${S.arch.kind === 'real' ? 'the real place' : 'the complex place'} — in Poincaré`);
            }
            return;
        }
        R._shownPlace = null;
        showCard(sarithCard(S, R.model), 'FlashBeam covering search');
        wireSarithButtons();
    }
}

/** Update the live numbers of step 4 without rebuilding the card (rebuild when the representatives change). */
let patchPending = false;
function patchSarith(promoted) {
    const R = run;
    if (!R || !R.view || R.view.step !== 'sarith' || R.view.sub === 'stabilizer') return;
    if (promoted || !$('cov-it')) { renderView(false); return; }
    if (patchPending) return;
    patchPending = true;
    requestAnimationFrame(() => {
        patchPending = false;
        if (!run || !run.sarith || !$('cov-it')) return;
        const S = run.sarith;
        const L = liveNumbers(S);
        $('cov-it').textContent = L.it;
        $('cov-visited').textContent = L.visited.toLocaleString();
        $('cov-reps').textContent = L.reps;
        $('cov-covered').textContent = `${L.covered} / ${L.targets}`;
        $('cov-bar').style.width = `${(100 * L.frac).toFixed(1)}%`;
        // the stars and the chart are cheap: rebuild them from a fresh card
        const tmp = document.createElement('div');
        tmp.innerHTML = sarithCard(S, run.model);
        const chart = tmp.querySelector('#cov-chart');
        if (chart) $('cov-chart').innerHTML = chart.innerHTML;
        const reps = tmp.querySelector('.cov-reps');
        const cur = document.querySelector('#view-card .cov-reps');
        if (reps && cur) cur.querySelectorAll('.cov-rep').forEach((el, i) => {
            const fresh = reps.children[i];
            if (!fresh) return;
            const a = el.lastElementChild, b = fresh.lastElementChild;
            if (a && b) a.innerHTML = b.innerHTML;
        });
    });
}

function wireSarithButtons() {
    const copy = $('copy-cert');
    if (copy) copy.addEventListener('click', async () => {
        const S = run.sarith, r = S.result;
        const data = {
            group: run.input, field: run.model.degree > 1 ? run.model.polySrc : 'Q',
            places: S.places, representatives: r.reps.map((x) => x.tex),
            witnesses: r.witnesses.map((w) => ({ from: w.from, tree: w.place, neighbour: w.nbr, word: w.word, rep: w.rep, text: wordText(w.word, 1e9) })),
            stabilizer: S.stab && S.stab.used ? S.stab.used.map((e) => ({ word: e.word, matrix: e.tex })) : null,
        };
        try { await navigator.clipboard.writeText(JSON.stringify(data, null, 1)); copy.textContent = 'Copied'; }
        catch (e) { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy the certificate (JSON)'; }, 1600);
    });
    const show = $('show-stab');
    if (show) show.addEventListener('click', () => showView('sarith', 'stabilizer'));
}

function placeCaption(pl) {
    const m = run.model;
    if (pl.tool === 'poincare') {
        const at = m && m.degree > 1 ? `w ↦ ${fmtC(pl.root)}` : 'the only embedding';
        return `σ${sub(pl.n)}: ${at} — ${pl.headline} — in Poincaré${pl.isDefault ? ' (your embedding)' : ''}`;
    }
    if (pl.kind === 'generic') return `${pl.p}, a prime where Γ is bounded — ${pl.headline} — in Trees`;
    const valence = Number(pl.q) + 1;
    return `${placeLabel(pl)}: the ${valence}-regular tree — ${pl.headline} — in Trees`;
}

function renderSubBar() {
    const R = run, bar = $('sub-bar');
    if (!R || !R.view) { bar.innerHTML = ''; return; }
    if (R.view.step === 'places' && R.places.length) {
        bar.innerHTML = placeOrder(R).map((pl) => `<button class="place-chip${pl.key === R.placeSel ? ' selected' : ''}" data-place="${pl.key}" data-status="${pl.status}" title="${esc(pl.headline)}"><span class="dot"></span>${esc(placeLabel(pl))}</button>`).join('')
            + (!R.finiteDone ? '<span class="place-chip" data-status="pending" style="cursor:default"><span class="dot"></span>finding primes…</span>' : '');
    } else if (R.view.step === 'sarith' && R.sarith && R.sarith.stab && R.sarith.stab.state) {
        const cur = R.view.sub === 'stabilizer' ? 'stabilizer' : 'covering';
        const stStatus = { running: 'running', yes: 'yes', no: 'open' }[R.sarith.stab.status] || 'idle';
        bar.innerHTML = `<button class="place-chip${cur === 'covering' ? ' selected' : ''}" data-sub="covering" data-status="${R.sarith.result && R.sarith.result.status === 'covered' ? 'yes' : 'running'}"><span class="dot"></span>Covering of X</button>`
            + `<button class="place-chip${cur === 'stabilizer' ? ' selected' : ''}" data-sub="stabilizer" data-status="${stStatus}"><span class="dot"></span>Stabilizer of o at ∞</button>`;
    } else bar.innerHTML = '';
}

// ───────────────────────── permalinks, examples, wiring ─────────────────────────

function currentState() {
    const st = readSettings();
    return { v: 1, ...getInputState(), depth: st.depth, faces: st.faces, secs: st.seconds, beam: st.beam, flash: st.flash, bsecs: st.beamSeconds, reps: st.maxReps };
}

function updatePermalink() {
    try { return writeStateToURL(currentState()); } catch (e) { return null; }
}

function applySettings(st) {
    const set = (id, v) => { if (v != null) $(id).value = String(v); };
    set('wordLength', st.depth); set('face-count-input', st.faces); set('decide-seconds', st.secs);
    set('beam-width', st.beam); set('flash-size', st.flash); set('beam-seconds', st.bsecs); set('max-reps', st.reps);
}

function loadExample(ex) {
    applyInputState({ mats: ex.mats, anti: ex.anti || [], consts: ex.consts || [] });
    $('wordLength').value = String(ex.depth || 8);
    showTab('verdict');
    setTimeout(compute, 60);
}

async function buildExampleModal() {
    const all = await allExamples();
    const seen = new Set();
    const examples = all.filter((ex) => { const k = JSON.stringify([ex.mats, ex.consts || []]); if (seen.has(k)) return false; seen.add(k); return true; });
    const modal = document.createElement('div');
    modal.id = 'pc-example-modal';
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
            const badges = ex.anti && ex.anti.some(Boolean) ? '<span class="ex-badge mirrors" title="Orientation-reversing generators: not in PGL₂(ℚ̄)">mirrors</span>' : '';
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
    $('pc-example-btn').addEventListener('click', () => { modal.hidden = false; });
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
    $('compute-btn').addEventListener('click', () => { compute(); showTab('verdict'); });
    $('tab-group').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest('.mq-editable-field')) { e.preventDefault(); compute(); showTab('verdict'); }
    });
    $('step-bar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (b && run) showView(b.dataset.step, b.dataset.step === 'places' ? run.placeSel : null);
    });
    $('step-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (b && run) showView(b.dataset.step, b.dataset.step === 'places' ? run.placeSel : null);
    });
    $('sub-bar').addEventListener('click', (e) => {
        const p = e.target.closest('[data-place]');
        if (p && run && run.byKey.has(p.dataset.place)) { run.placeSel = p.dataset.place; showView('places', p.dataset.place); return; }
        const s = e.target.closest('[data-sub]');
        if (s && run) showView('sarith', s.dataset.sub);
    });
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
const initial = urlState || CURATED[0];
wire();
if (urlState) applySettings(urlState);
// poincare's editor: generators, constants (root rows with their pickers), the
// field status line, and ⟳ (#refresh-btn), all calling `compute`.
setupMatrixInput(compute, { mats: initial.mats, anti: initial.anti || [], consts: initial.consts || [] });
buildExampleModal();
setTimeout(compute, 200);
