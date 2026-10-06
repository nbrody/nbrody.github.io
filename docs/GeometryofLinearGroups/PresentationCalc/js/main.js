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
 *   4  FlashBeam         in the adelic product of symmetric spaces
 *                        (sarithWorker.js): Dirichlet generators, relations, and
 *                        the covering certificate, then poincare on the
 *                        stabilizer of o when A splits at one place at ∞.
 *
 * The page opens to the matrix grids and the field they live over, defined
 * as in the Discreteness Algorithm (input.js: roots of polynomials and named
 * numbers, read by poincare's exact reader into a tower of fields). The views
 * of the places are poincare and trees themselves.
 */
import { buildGroup } from '../../Geometric/Tools/Kleinian/poincare/js/matrixInput.js';
import { readStateFromURL, writeStateToURL } from '../../Geometric/Tools/Kleinian/poincare/js/permalink.js';
import { presentationTex } from '../../Geometric/Tools/Kleinian/poincare/js/presentation.js';
import { fieldModel, poincareStateFor } from '../../Geometric/Tools/discretenessAlgorithm/js/field.js';
import { ToolFrames } from '../../Geometric/Tools/discretenessAlgorithm/js/frames.js';
import { CURATED, CAT_ORDER, allExamples } from './examples.js';
import { archClasses } from './archPlaces.js';
import { zariskiCard, congruenceCard, zariskiLine, congruenceLine, texToText, esc, mix } from './zariskiView.js';
import { sarithCard, liveNumbers, wordText, gapText } from './sarithView.js';
import { createInput, fromZariskiStyle } from './input.js';

const VERSION = '2026-10-06a';          // busts the workers' module caches
const ARCH_TIMEOUT = 120;               // seconds for one place at ∞
const ZARISKI_TIMEOUT = 120;
const MAX_PRIMES = 12;
const STEPS = ['zariski', 'places', 'congruence', 'sarith'];
const STEP_NAMES = { zariski: 'Zariski closure', places: 'Discreteness', congruence: 'Congruence closure', sarith: 'FlashBeam' };

const $ = (id) => document.getElementById(id);
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((c) => SUB[+c] ?? c).join('');

/** KaTeX, for labels. */
const tex = (t, display = false) => (window.katex ? window.katex.renderToString(t, { throwOnError: false, displayMode: display }) : esc(t));
/** Render the \( … \) and \[ … \] in an element with KaTeX. */
function typeset(...els) {
    if (!window.renderMathInElement) return;
    for (const el of els) {
        if (!el) continue;
        window.renderMathInElement(el, {
            delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
            throwOnError: false,
        });
    }
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
        metric: $('tree-metric') && $('tree-metric').value === 'unit' ? 'unit' : 'log',
    };
}

// ───────────────────────── the run ─────────────────────────

const FRAME_NOTE = 'The generators and constants are set on the Presentation Calculator page. The settings here belong to this view.';
const placeFrames = new ToolFrames($('places-frame'), { note: FRAME_NOTE });
const stabFrames = new ToolFrames($('stab-frame'), { note: FRAME_NOTE });
let run = null;
let seq = 0;
let input = null;

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

/** Read the inputs exactly: { pstate, exactCtx, read } or { pstate, error } (or { blank } before anything is typed). */
function readInputs() {
    const pstate = input.getState();
    if (input.isBlank()) { input.markErrors(null); return { pstate, blank: true, error: 'Enter the generators.' }; }
    const bad = input.entryErrors();
    if (bad.length) { input.markErrors(null, true); return { pstate, error: `${bad[0].src}: ${bad[0].error}` }; }
    try {
        const { exactCtx, read } = buildGroup(pstate);
        input.markErrors(null);
        input.showRoots(read.roots);
        return { pstate, exactCtx, read };
    } catch (e) {
        input.markErrors(e.where || null);
        return { pstate, error: e.message };
    }
}

function compute() {
    cancelRun();
    const r = readInputs();
    showFieldStatus(r);
    if (r.error) { setStageStatus(r.blank ? r.error : `Fix the input: ${r.error}`); return; }
    const settings = readSettings();
    run = {
        seq: ++seq, input: r.pstate, state: r.pstate, settings, exact: r.exactCtx, model: null, workers: new Set(),
        steps: Object.fromEntries(STEPS.map((s) => [s, newStep()])),
        zariski: null,
        places: [], byKey: new Map(), finiteDone: false, primes: null, generic: null, standard: [], finiteError: null,
        placeSel: null, placesDone: false,
        sarith: null,
        view: { step: null }, userPicked: false, error: null,
    };
    updatePermalink();
    resetCards();
    $('after').hidden = false;
    if (!r.exactCtx) {
        run.error = `Some entry is not an algebraic number that can be read exactly${r.read && r.read.reason ? ` (${r.read.reason})` : ''}. Every step here needs exact arithmetic.`;
    } else {
        try { run.model = fieldModel(r.exactCtx); } catch (e) { run.error = `The field of definition could not be found: ${e.message}`; }
    }
    if (run.error) {
        setStep('zariski', 'open', 'Not run', run.error);
        renderVerdict();
        refreshView('zariski');
        return;
    }
    setStep('zariski', 'running', 'Computing…');
    setStageStatus('Computing…');
    renderVerdict();
    refreshView('zariski');
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
    renderSubBar();
}

// ───────────────────────── step 3: congruence closure ─────────────────────────

function startCongruence() {
    const A = run.zariski.arith;
    const line = congruenceLine(A);
    setStep('congruence', A && A.congruence && !A.congruence.error ? 'info' : 'open', line.head, line.detail);
    startSarith();
}

// ───────────────────────── step 4: FlashBeam in the adelic product ─────────────────────────

/** The places at ∞ where Γ is unbounded: one embedding of F over each place of k (real ones preferred). */
function archFactors(R) {
    // the Zariski engine decides exactly whether A splits at some place at ∞
    const archF = R.zariski.arith.spaces.factors.filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (!archF.length) return [];
    const byClass = new Map();
    for (const a of archClasses(R.model).filter((x) => x.noncompact)) {
        if (!byClass.has(a.classKey)) byClass.set(a.classKey, []);
        byClass.get(a.classKey).push(a);
    }
    return [...byClass.values()].map((g) => {
        const a = g.find((x) => x.kind === 'real' && x.isDefault) || g.find((x) => x.kind === 'real') || g.find((x) => x.isDefault) || g[0];
        return { re: a.root.re, im: a.root.im, kind: a.kind, n: a.n, key: a.key };
    });
}

/**
 * Can the covering certificate apply? { certifiable, note, arch }: arch is the
 * one place at ∞ whose vertex stabilizer must be checked (null when A is
 * ramified at every place at ∞). FlashBeam runs either way.
 */
function sarithApplicable(R, factors) {
    const A = R.zariski.arith;
    const archF = A.spaces.factors.filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (!A.ring.S.length) {
        return { certifiable: false, note: 'Γ is unbounded at no prime, so $X$ has no trees: as Γ is not discrete at any one place at ∞, it would be a lattice in a product of at least two of them (a Hilbert modular group, say). Certifying finite covolume there is beyond this tool.' };
    }
    if (archF.length >= 2) {
        return { certifiable: false, note: `$A$ splits at ${archF.length} places at ∞, so a vertex stabilizer $\\Lambda_o$ is a lattice in a product of ${archF.length} symmetric spaces. The covering certificate needs at most one.` };
    }
    if (!archF.length) return { certifiable: true, arch: null };
    if (factors.length !== 1) {
        return { certifiable: false, note: `The places at ∞ of the field of definition where Γ is unbounded could not be matched with the one place of $k$ where $A$ splits (${factors.length} classes found).` };
    }
    const f = factors[0];
    if (archF[0].kind === 'real' && f.kind !== 'real') {
        return { certifiable: false, note: 'At the real place of $k$ where $A$ splits, the field of definition has only complex places: Γ is conjugate into $\\mathrm{PGL}_2(\\mathbb{R})$ but not written there, which the area test needs.' };
    }
    return { certifiable: true, arch: { kind: archF[0].kind, root: { re: f.re, im: f.im }, n: f.n, key: f.key } };
}

function startSarith() {
    const R = run, A = R.zariski.arith, m = R.model, st = R.settings;
    const factors = archFactors(R);
    const ap = sarithApplicable(R, factors);
    R.sarith = {
        phase: 'search', note: ap.note, certifiable: ap.certifiable, arch: ap.certifiable ? ap.arch : null,
        archFactors: factors, metric: st.metric, history: [], places: [], status: 'running',
    };
    if (!A.ring.S.length && !factors.length) {
        Object.assign(R.sarith, { phase: 'na', status: 'open', note: 'Γ is bounded at every place, so there is nothing to search.' });
        setStep('sarith', 'open', 'Not applicable', R.sarith.note);
        renderVerdict();
        if (!R.userPicked) showView('sarith', null, { auto: true });
        return;
    }
    setStep('sarith', 'running', 'Searching…', 'FlashBeam in the adelic product of symmetric spaces.');
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
            const rel = `${msg.relations || 0} relation${msg.relations === 1 ? '' : 's'}`;
            setStep('sarith', 'running', 'Searching…', R.sarith.places.length
                ? `Iteration ${msg.stats.iteration}: ${msg.covered} of ${msg.targets} neighbours, ${msg.reps} representative${msg.reps === 1 ? '' : 's'}, ${rel}.`
                : `Iteration ${msg.stats.iteration}: ${rel}.`);
            patchSarith(msg.promoted);
        } else if (msg.type === 'error') {
            clearTimeout(timer); stop();
            sarithError(R, msg.error);
        } else if (msg.type === 'done') {
            clearTimeout(timer);
            // the worker stays up while the stabilizer may need more elements
            if (!(msg.status === 'covered' && R.sarith.certifiable && R.sarith.arch)) stop();
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
            arch: factors.map((f) => ({ re: f.re, im: f.im, kind: f.kind })),
            metric: st.metric,
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

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function sarithDone(R, msg) {
    const S = R.sarith;
    S.result = msg;
    const L = liveNumbers(S);
    S.history.push({ it: L.it, frac: L.frac, reps: L.reps });
    const D = msg.dirichlet;
    S.found = `${plural(D.pairs.length, 'Dirichlet generator')} and ${plural(msg.relations.length, 'relation')}`;
    if (!S.certifiable) {
        Object.assign(S, { phase: 'done', status: 'open' });
        S.head = `FlashBeam found ${S.found} in $X$. ${S.note}`;
        setStep('sarith', 'open', 'No certificate', `${S.found}. ${texToText(S.note.replace(/\$/g, ''))}`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    if (msg.status !== 'covered' || !(msg.verify && msg.verify.ok)) {
        Object.assign(S, { phase: 'done', status: 'open' });
        S.head = msg.status === 'covered'
            ? `FlashBeam found ${S.found}. A covering was found but did not survive the exact re-check, so nothing is claimed.`
            : `FlashBeam found ${S.found}, but no covering of the trees within the budget (${msg.iterations} iterations, ${msg.seconds.toFixed(0)} s, ${msg.reps.length} representatives, ${msg.covered} of ${msg.targets} neighbours). Nothing is claimed: Γ may still be S-arithmetic, or it may be thin.`;
        setStep('sarith', 'open', 'No certificate', `${S.found}; ${msg.covered} of ${msg.targets} neighbours covered with ${msg.reps.length} representatives.`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    const nR = msg.reps.length;
    if (!S.arch) {
        Object.assign(S, { phase: 'done', status: 'yes' });
        S.head = `Γ is S-arithmetic. It has at most ${plural(nR, 'orbit')} on the vertices of the trees, and $A$ is ramified at every place at ∞, so vertex stabilizers in Λ are finite: $[\\Lambda : \\Gamma^{(2)}] < \\infty$. FlashBeam found ${S.found}.`;
        setStep('sarith', 'yes', 'S-arithmetic', `${S.found}; covering with ${plural(nR, 'representative')}, re-checked exactly; stabilizers are finite.`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    // the stabilizer of o must have finite covolume at the place at ∞
    S.phase = 'stab';
    S.head = `FlashBeam found ${S.found}, and the covering of the trees is complete (${plural(nR, 'representative')}, re-checked exactly). It remains to see that the stabilizer of $o$ is a lattice at ∞.`;
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
        S.head = `Γ is S-arithmetic. It has at most ${plural(nR, 'orbit')} on the vertices of the trees, and its stabilizer of $o$ has finite ${S.arch.kind === 'real' ? 'area' : 'covolume'} at ∞, so it has finite index in $\\Lambda_o$: $[\\Lambda : \\Gamma^{(2)}] < \\infty$. FlashBeam found ${S.found}.`;
        setStep('sarith', 'yes', 'S-arithmetic', `${S.found}; covering with ${plural(nR, 'representative')}; the stabilizer of o is a lattice at ∞.`);
    } else {
        S.status = 'open';
        S.head = `FlashBeam found ${S.found}. The covering is complete, with ${plural(nR, 'representative')}, but the stabilizer of $o$ was not shown to be a lattice at ∞. No certificate.`;
        setStep('sarith', 'open', 'No certificate', `${S.found}; the covering is complete; the stabilizer check failed.`);
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


// ───────────────────────── the result cards ─────────────────────────

function setStageStatus(text) { $('compute-status').textContent = text; }

function renderVerdict() {
    const v = verdict();
    const card = $('verdict');
    if (!v) { card.hidden = true; return; }
    card.hidden = false;
    $('v-head').className = `v-head ${v.cls}`;
    $('v-head').innerHTML = mix(v.head);
    $('v-sub').innerHTML = v.sub ? mix(v.sub) : '';
    let pres = '';
    const pl = v.place;
    if (pl && pl.summary && pl.summary.presentation) {
        const P = pl.summary.presentation;
        pres = `<p class="note">Presentation in your generators${pl.summary.presentationComplete ? '' : ' (some relations may be missing)'}:</p>\\[${presentationTex(P, (i) => `g_{${i}}`, { maxRelators: 8 })}\\]`;
    } else if (pl && pl.decision && pl.decision.kind === 'free') {
        pres = `<p class="note">Γ is free of rank ${pl.decision.freeRank}.</p>`;
    }
    $('v-pres').innerHTML = pres;
    typeset(card);
    const busy = run && STEPS.some((s) => run.steps[s].status === 'running');
    setStageStatus(busy ? 'Computing…' : '');
}

function renderSteps() {
    const R = run;
    const list = $('step-list');
    if (!R) { list.innerHTML = ''; return; }
    list.innerHTML = STEPS.map((s, i) => {
        const st = R.steps[s];
        return `<div class="step-row" data-step="${s}" data-status="${st.status}">
            <span class="num">${i + 1}</span><span class="step-name">${esc(STEP_NAMES[s])}</span>
            <span class="step-text"><b>${esc(st.head || (st.status === 'idle' ? 'Waiting' : ''))}</b>${st.detail ? ` <span>— ${esc(st.detail)}</span>` : ''}</span>
        </div>`;
    }).join('');
    for (const s of STEPS) {
        const card = $(`card-${s}`), st = R.steps[s];
        card.dataset.status = st.status;
        card.hidden = st.status === 'idle' || st.status === 'skipped';
        card.querySelector('[data-tag]').textContent = st.status === 'idle' ? '' : st.head;
    }
}

function resetCards() {
    for (const s of STEPS) { const c = $(`card-${s}`); c.hidden = true; c.querySelector('.step-body').innerHTML = ''; }
    placeFrames.hide(); stabFrames.hide();
    $('places-frame-wrap').hidden = true; $('stab-frame-wrap').hidden = true;
    renderSteps();
}

/** Re-render one step's card. */
function refreshView(step) {
    const R = run;
    if (!R) return;
    const body = $(`card-${step}`).querySelector('.step-body');
    let html = '';
    if (step === 'zariski') {
        if (!R.zariski) html = `<p class="lead">${esc(R.error || 'Computing…')}</p>`;
        else if (!R.zariski.ok) html = `<div class="banner" data-status="open"><span class="dot"></span><div>${esc(R.zariski.error)}</div></div>`;
        else html = zariskiCard(R.zariski, R.model);
    } else if (step === 'places') html = placesCard(R);
    else if (step === 'congruence') html = congruenceCard(R.zariski && R.zariski.arith);
    else if (step === 'sarith') html = R.sarith ? sarithCard(R.sarith, R.model, R.model.mats.length) : '';
    body.innerHTML = html;
    typeset(body);
    if (step === 'sarith') wireSarithButtons();
}

function showView(step, sub = null, { auto = false } = {}) {
    const R = run;
    if (!R) return;
    if (!auto) R.userPicked = true;
    if (step === 'places' && sub) {
        R.placeSel = sub;
        const pl = R.byKey.get(sub);
        if (pl && (!auto || pl.status === 'discrete')) showPlaceFrame(pl);
    }
    if (step === 'sarith' && sub === 'stabilizer') showStabFrame();
    refreshView(step);
}
function renderSubBar() { refreshView('places'); }

// ── step 2 ──

function placeName(pl) {
    const m = run.model;
    if (pl.tool === 'poincare') return { name: `\\(\\sigma_{${pl.n}}\\)`, sub: `${m && m.degree > 1 ? `w ↦ ${fmtC(pl.root)} · ` : ''}${pl.kind === 'real' ? 'real' : 'complex'}${pl.isDefault ? ' · yours' : ''}` };
    if (pl.kind === 'generic') return { name: 'Every other prime', sub: `tested at ${pl.p}` };
    if (m && m.degree > 1 && pl.primeTex) return { name: `\\(${pl.count > 1 ? `\\mathfrak p_{${pl.index + 1}}` : '\\mathfrak p'} = ${pl.primeTex}\\)`, sub: `above ${pl.p} · e=${pl.e} f=${pl.f}` };
    return { name: `\\(p = ${pl.p}\\)`, sub: `ℚ${sub(pl.p)}` };
}

function placesCard(R) {
    const m = R.model;
    if (!m) return '';
    const [r1, r2] = m.signature;
    let html = `<p class="lead">${m.degree === 1
        ? mix('The field of definition is $F = \\mathbb{Q}$: one place at ∞, and the primes.')
        : mix(`The field of definition is $F = \\mathbb{Q}(w)$ with $${m.polyTex} = 0$, of degree ${m.degree}: ${r1} real and ${r2} complex place${r2 === 1 ? '' : 's'} at ∞, and the primes.`)} Each is tested; a discrete one is shown below, live.</p>`;
    html += '<div class="place-list">';
    for (const pl of placeOrder(R)) {
        const nm = placeName(pl);
        const detail = pl.kind === 'generic' ? genericDetail(pl) : pl.detail;
        html += `<div class="place-row${pl.key === R.placeSel && !$('places-frame-wrap').hidden ? ' selected' : ''}" data-status="${pl.status}">
            <span class="dot"></span>
            <span class="p-name">${nm.name}<span class="p-sub">${esc(nm.sub)}</span></span>
            <span class="p-verdict">${esc(pl.headline)}</span>
            <button class="view-btn" data-place="${pl.key}">View in ${pl.tool === 'poincare' ? 'Poincaré' : 'Trees'}</button>
            ${detail ? `<span class="p-detail">${esc(detail)}</span>` : ''}
        </div>`;
    }
    html += '</div>';
    if (!R.finiteDone) html += '<p class="note" style="margin-top:8px">Deciding at the primes…</p>';
    if (R.finiteError) html += `<p class="err">${esc(R.finiteError)}</p>`;
    if (R.primes && R.primes.capped) html += `<p class="note">Only the first ${MAX_PRIMES} of ${R.primes.capped} candidate primes were tested.</p>`;
    return html;
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

function placeCaption(pl) {
    const m = run.model;
    if (pl.tool === 'poincare') {
        const at = m && m.degree > 1 ? `w ↦ ${fmtC(pl.root)}` : 'the only embedding';
        return `σ${sub(pl.n)}: ${at} — ${pl.headline} — in Poincaré${pl.isDefault ? ' (your embedding)' : ''}`;
    }
    if (pl.kind === 'generic') return `${pl.p}, a prime where Γ is bounded — ${pl.headline} — in Trees`;
    return `${placeLabel(pl)}: the ${Number(pl.q) + 1}-regular tree — ${pl.headline} — in Trees`;
}

function showPlaceFrame(pl) {
    const st = run.settings;
    const state = pl.tool === 'poincare' ? { ...pl.state, depth: st.depth, faces: st.faces } : pl.state;
    const url = placeFrames.show(pl.tool, state);
    $('places-frame-wrap').hidden = false;
    $('places-caption').textContent = placeCaption(pl);
    $('places-open').href = url;
}

// ── step 4 ──

function showStabFrame() {
    const S = run.sarith;
    if (!S || !S.stab || !S.stab.state) return;
    const url = stabFrames.show('poincare', { ...S.stab.state, depth: run.settings.depth, faces: run.settings.faces });
    $('stab-frame-wrap').hidden = false;
    $('stab-caption').textContent = `The elements of Γ fixing o, at ${S.arch.kind === 'real' ? 'the real place' : 'the complex place'} — in Poincaré`;
    $('stab-open').href = url;
}

/** Update the live numbers of step 4 without rebuilding the card (rebuild when the representatives change). */
let patchPending = false;
function patchSarith(promoted) {
    const R = run;
    if (!R || !R.sarith) return;
    const needStars = R.sarith.progress && R.sarith.progress.links && R.sarith.places.length && !document.querySelector('#card-sarith .cov-reps');
    if (promoted || !$('cov-it') || needStars) { refreshView('sarith'); return; }
    if (patchPending) return;
    patchPending = true;
    requestAnimationFrame(() => {
        patchPending = false;
        if (!run || !run.sarith || !$('cov-it')) return;
        const S = run.sarith;
        const L = liveNumbers(S);
        const put = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        put('cov-it', L.it);
        put('cov-visited', L.visited.toLocaleString());
        put('cov-rels', S.progress ? S.progress.relations || 0 : 0);
        put('cov-reps', L.reps);
        put('cov-covered', `${L.covered} / ${L.targets}`);
        if ($('cov-bar')) $('cov-bar').style.width = `${(100 * L.frac).toFixed(1)}%`;
        const tmp = document.createElement('div');
        tmp.innerHTML = sarithCard(S, run.model, run.model.mats.length);
        const chart = tmp.querySelector('#cov-chart');
        if (chart && $('cov-chart')) $('cov-chart').innerHTML = chart.innerHTML;
        const reps = tmp.querySelector('.cov-reps');
        const cur = document.querySelector('#card-sarith .cov-reps');
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
            group: run.state, places: S.places, representatives: r.reps.map((x) => x.tex),
            witnesses: r.witnesses.map((w) => ({ from: w.from, tree: w.place, neighbour: w.nbr, word: w.word, rep: w.rep, text: wordText(w.word, 1e9) })),
            stabilizer: S.stab && S.stab.used ? S.stab.used.map((e) => ({ word: e.word, matrix: e.tex })) : null,
            dirichlet: r.dirichlet ? r.dirichlet.pairs.map((g) => ({ word: g.word, text: wordText(g.word, 1e9), height: g.h, clearance: g.clearance })) : null,
            relations: r.relations,
        };
        try { await navigator.clipboard.writeText(JSON.stringify(data, null, 1)); copy.textContent = 'Copied'; }
        catch (e) { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy the certificate (JSON)'; }, 1600);
    });
    const gap = $('copy-gap');
    if (gap) gap.addEventListener('click', async () => {
        const r = run.sarith.result;
        try { await navigator.clipboard.writeText(gapText(run.model.mats.length, r.relations)); gap.textContent = 'Copied'; }
        catch (e) { gap.textContent = 'Copy failed'; }
        setTimeout(() => { gap.textContent = 'Copy ⟨g | relations⟩ for GAP'; }, 1600);
    });
    const show = $('show-stab');
    if (show) show.addEventListener('click', () => showView('sarith', 'stabilizer'));
}

// ───────────────────────── live field information ─────────────────────────

/** Beside ℚ( … ): what is wrong, or quietly the degree of the field the entries generate. */
function showFieldStatus(r) {
    const el = $('field-status');
    if (r.blank) { el.innerHTML = ''; return; }
    if (r.error) { el.innerHTML = `<span class="err">${esc(r.error)}</span>`; return; }
    if (!r.exactCtx) {
        el.innerHTML = `<span class="err">${esc(`not exact${r.read && r.read.reason ? `: ${r.read.reason}` : ''}`)}</span>`;
        return;
    }
    const K = r.exactCtx.field;
    el.innerHTML = K.deg > 1 ? esc(`degree ${K.deg}`) : '';
}

let editTimer = null;
function edited() {
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
        const r = readInputs();
        showFieldStatus(r);
        if (run) setStageStatus('The inputs changed: press Compute.');
    }, 250);
}

// ───────────────────────── permalinks and examples ─────────────────────────

function currentState() {
    const st = readSettings();
    return { v: 1, ...input.getState(), depth: st.depth, faces: st.faces, secs: st.seconds, beam: st.beam, flash: st.flash, bsecs: st.beamSeconds, reps: st.maxReps, metric: st.metric };
}

function updatePermalink() {
    try { return writeStateToURL(currentState()); } catch (e) { return null; }
}

function applySettings(st) {
    const set = (id, v) => { if (v != null) $(id).value = String(v); };
    set('wordLength', st.depth); set('face-count-input', st.faces); set('decide-seconds', st.secs);
    set('beam-width', st.beam); set('flash-size', st.flash); set('beam-seconds', st.bsecs); set('max-reps', st.reps); set('tree-metric', st.metric);
}

/** The input state of a permalink: poincare's own, or this page's Zariski-style one of 2026-10-06. */
function stateFromURL(u) {
    if (!u) return null;
    if (u.mats) return { mats: u.mats, anti: u.mats.map(() => false), consts: u.consts || [] };
    if (u.gens) return fromZariskiStyle(u);
    return null;
}

function loadExample(ex) {
    input.setState({ mats: ex.mats, anti: ex.mats.map(() => false), consts: ex.consts || [] });
    $('wordLength').value = String(ex.depth || 8);
    closeExamples();
    compute();
}

let exampleList = [];
/** A quiet popover: the curated groups, then the Discreteness Algorithm's library. */
async function buildExamples() {
    const pop = $('ex-pop');
    const all = await allExamples();
    const seen = new Set();
    const list = all.filter((ex) => {
        if ((ex.anti || []).some(Boolean)) return false;
        const k = JSON.stringify([ex.mats, ex.consts || []]);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    exampleList = list;
    const cats = new Map();
    list.forEach((ex, i) => { if (!cats.has(ex.cat)) cats.set(ex.cat, []); cats.get(ex.cat).push(i); });
    const order = [...CAT_ORDER.filter((c) => cats.has(c)), ...[...cats.keys()].filter((c) => !CAT_ORDER.includes(c))];
    pop.innerHTML = order.map((c) => `<div class="ex-cat">${esc(c)}</div>${cats.get(c).map((i) => `<button data-ex="${i}" title="${esc(list[i].desc || '')}">${esc(list[i].name)}</button>`).join('')}`).join('');
    pop.addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (b) loadExample(list[+b.dataset.ex]); });
}
function closeExamples() { $('ex-pop').hidden = true; $('examples-btn').setAttribute('aria-expanded', 'false'); }

// ───────────────────────── wiring and boot ─────────────────────────

function wire() {
    $('compute-btn').addEventListener('click', compute);
    $('settings-btn').addEventListener('click', () => {
        const on = $('settings').hidden;
        $('settings').hidden = !on;
        $('settings-btn').setAttribute('aria-expanded', String(on));
    });
    $('examples-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const on = $('ex-pop').hidden;
        $('ex-pop').hidden = !on;
        $('examples-btn').setAttribute('aria-expanded', String(on));
    });
    $('dice-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const list = exampleList.length ? exampleList : CURATED;
        loadExample(list[Math.floor(Math.random() * list.length)]);
    });
    document.addEventListener('click', (e) => { if (!$('ex-pop').hidden && !e.target.closest('.ex-wrap')) closeExamples(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExamples(); });
    $('copy-link').addEventListener('click', async () => {
        const url = updatePermalink() || location.href;
        const btn = $('copy-link');
        try { await navigator.clipboard.writeText(url); btn.textContent = 'link copied'; }
        catch (e) { btn.textContent = 'copy failed — the URL bar has the link'; }
        setTimeout(() => { btn.textContent = 'copy link'; }, 1800);
    });
    $('step-list').addEventListener('click', (e) => {
        const row = e.target.closest('[data-step]');
        const card = row && $(`card-${row.dataset.step}`);
        if (card && !card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('card-places').addEventListener('click', (e) => {
        const b = e.target.closest('[data-place]');
        if (b && run && run.byKey.has(b.dataset.place)) showView('places', b.dataset.place);
    });
    document.querySelectorAll('.m').forEach((el) => { el.innerHTML = tex(el.textContent); });
}

input = createInput({ onEdit: edited, onEnter: compute, tex });
wire();
const urlState = readStateFromURL();
const fromURL = stateFromURL(urlState);
if (urlState) applySettings(urlState);
input.setState(fromURL || { mats: [], consts: [] });   // blank grids
showFieldStatus(readInputs());
buildExamples();
// a shared link shows its results; a fresh visit shows only the inputs
if (fromURL) setTimeout(compute, 100);
