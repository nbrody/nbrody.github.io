/**
 * Presentation Calculator — what is a finitely generated Γ ⊂ PGL₂(ℚ̄)?
 *
 *   1  Zariski closure   the Zariski Closure engine (zariskiWorker.js): the
 *                        closure over ℚ̄, and for a dense Γ its trace field k,
 *                        quaternion algebra A, the set S of primes where Γ is
 *                        unbounded, and the congruence closure prime by prime;
 *                        over ℚ, the joint congruence closure and its index
 *                        (congruence.js in congruenceWorker.js, alongside step 2).
 *   2  Discreteness      the Discreteness Algorithm's places: poincare at each
 *                        place at ∞ (archWorker.js; embeddings giving conjugate
 *                        groups are one place), trees at each prime
 *                        (discretenessAlgorithm/js/finiteWorker.js). A discrete
 *                        place is shown, and step 3 asks whether Γ is a lattice
 *                        there (discreteArith).
 *   3  Arithmetic        over ℚ, coset enumeration in PGL₂(ℤ[1/S]) first
 *                        (sarithIndex.js); then FlashBeam in the adelic product
 *                        (sarithWorker.js): Dirichlet generators, relations, the
 *                        covering certificate, the vertex orbits (orbits.js, over
 *                        ℚ), and poincare on the stabilizer of o when A splits at
 *                        one place at ∞.
 *
 * The page opens to the matrix grids and the field they live over, defined
 * as in the Discreteness Algorithm (input.js: roots of polynomials and named
 * numbers, read by poincare's exact reader into a tower of fields). The views
 * of the places are poincare and trees themselves.
 */
import { buildGroup } from '../../Geometric/Tools/Kleinian/poincare/js/matrixInput.js';
import { readStateFromURL, writeStateToURL } from '../../Geometric/Tools/Kleinian/poincare/js/permalink.js';
import { wordTex } from '../../Geometric/Tools/Kleinian/poincare/js/presentation.js';
import { fieldModel, poincareStateFor } from '../../Geometric/Tools/discretenessAlgorithm/js/field.js';
import { ToolFrames } from '../../Geometric/Tools/discretenessAlgorithm/js/frames.js';
import { CURATED, CAT_ORDER, allExamples } from './examples.js';
import { archClasses, sameTaus, tauValuesOf } from './archPlaces.js';
import { mathLines, innerTex } from './texText.js';
import { zariskiCard, congruenceSection, zariskiLineTex, jointCongruenceLine, summaryTex, esc, mix } from './zariskiView.js';
import { sarithCard, liveNumbers, wordText, gapText, presentationSection, presentationGap, relatorTexNamed, ordersFrom, orientRelator, graphTop } from './sarithView.js';
import { createInput, fromZariskiStyle } from './input.js';
import { indexInPGL2Z } from './modularIndex.js';
import { exactIndexCheck } from './sarithIndex.js';
import { fuchsianPairTest } from './fuchsian2.js';
import { bianchiRing, wordMatrices, indexInBianchi, indexInPGL2OS, unitDeterminants, RINGS } from './bianchi.js';
import { descendToQ } from './descent.js';
import { infiniteOrderWord } from './cusps.js';
import { foldPGL2Z } from './stallings.js';
import { referenceMs } from './calibrate.js';
import { randomGroup } from './randomGroup.js';
import { elementarySection, elementaryTop } from './elementaryView.js';

const VERSION = '2026-10-20a';          // busts the workers' module caches
const ARCH_TIMEOUT = 120;               // seconds for one place at ∞
const ZARISKI_TIMEOUT = 120;
const MAX_PRIMES = 12;
const STEPS = ['zariski', 'places', 'congruence', 'sarith'];
const CARDS = ['zariski', 'places', 'sarith'];             // the congruence closure is part of card 1
const CONG_SECONDS = 20;
const MAX_STRETCH = 6;                  // a slowed-down FlashBeam worker gets at most this many times its time budget

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
/** The same complex number in TeX. */
const fmtCTex = (z, digits = 4) => fmtC(z, digits).replace(/−/g, '-');

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
    // an S-arithmetic Γ over ℚ: standard generators, the congruence description, a presentation
    // (a lattice at one place has Poincaré's presentation already)
    if (name === 'sarith' && status === 'yes' && /arithmetic/i.test(head) && !(run.sarith && run.sarith.lattice)) startPresentation(run);
}

/**
 * The presentation of an S-arithmetic Γ over ℚ (presentationWorker.js): Λ on its standard
 * generators, Γ as a congruence subgroup, and Γ by Reidemeister–Schreier on its coset table.
 */
function startPresentation(R) {
    if (!R || R.presentation || !R.model || !R.zariski || !R.zariski.arith) return;
    const ring = R.model.degree === 2 ? bianchiRing(R.model.polySrc) : null;
    if (R.model.degree !== 1 && !ring) return;
    const A = R.zariski.arith;
    const S = A.ring.S.map((x) => x.p);
    const cong = R.congruence && R.congruence.result;
    R.presentation = { status: 'running' };
    let worker;
    try { worker = new Worker(new URL(`./presentationWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' }); }
    catch (e) { R.presentation = { status: 'error', error: 'module workers are unavailable here' }; return; }
    R.workers.add(worker);
    const done = (m) => {
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* gone */ }
        R.workers.delete(worker);
        if (R !== run) return;
        R.presentation = m.error ? { status: 'error', error: m.error } : { status: 'done', result: m.result };
        refreshView('sarith');
        renderPresentation();
    };
    const timer = setTimeout(() => done({ error: 'no answer after 90 s' }), 90000);
    worker.onmessage = (ev) => done(ev.data);
    worker.onerror = (e) => { e.preventDefault?.(); done({ error: e.message || 'the worker failed to load' }); };
    if (ring) {
        worker.postMessage({ id: R.seq, kind: 'bianchi', d: ring, polySrc: R.model.polySrc, rows: R.model.mats.map((r) => r.map((e) => e.src)), maxIndex: 20000, seconds: 20 });
        return;
    }
    worker.postMessage({
        id: R.seq, rows: R.model.mats.map((r) => r.map((e) => e.src)), S,
        levels: cong && cong.levels ? cong.levels : null, C: cong && cong.levels ? null : A.congruence, maxIndex: 20000, seconds: 20,
    });
}

/**
 * Read the inputs exactly: { pstate, exactCtx, read } or { pstate, error }.
 * Before any entry is typed ({ blank }), only the field's definitions are read,
 * so the field line and the root pickers work from the start.
 */
function readInputs() {
    const pstate = input.getState();
    const blank = input.isBlank();
    try {
        const { exactCtx, read } = buildGroup(blank ? { ...pstate, mats: [], anti: [] } : pstate);
        input.markErrors(null);
        input.showRoots(read.roots);
        return blank ? { pstate, exactCtx, read, blank, error: 'Enter the generators.' } : { pstate, exactCtx, read };
    } catch (e) {
        input.markErrors(e.where || null);
        return { pstate, error: e.message };
    }
}

function compute() {
    cancelRun();
    input.showTones(null);
    const r = readInputs();
    showFieldStatus(r);
    if (r.error) { setStageStatus(r.blank ? r.error : `Fix the input: ${r.error}`); return; }
    const settings = readSettings();
    run = {
        seq: ++seq, input: r.pstate, state: r.pstate, settings, exact: r.exactCtx, model: null, workers: new Set(),
        // step 2's workers (stopped when Γ is not Zariski dense) and step 3's (stopped, with arithEpoch
        // bumped so that no late callback lands, when a place found discrete settles step 3 instead)
        placeWorkers: new Set(), placesStopped: false, arithWorkers: new Set(), arithEpoch: 0, arithStarted: false,
        steps: Object.fromEntries(STEPS.map((s) => [s, newStep()])),
        zariski: null,
        places: [], byKey: new Map(), finiteDone: false, primes: null, generic: null, standard: [], finiteError: null,
        placeSel: null, placesDone: false,
        sarith: null, congruence: null,
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
    // steps 1 and 2 run side by side: discreteness at each place needs only the field of definition,
    // and the Zariski closure can be slow (minutes over a big field) where Poincaré is quick
    startZariski();
    startPlaces();
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
        // step 2 goes on; step 3 needs the closure
        setStep('zariski', 'open', 'Could not compute', res && res.error ? res.error : 'unknown error');
        renderVerdict();
        refreshView('zariski');
        return;
    }
    const line = zariskiLineTex(res);
    if (res.closure.kind !== 'dense') {
        stopPlaces(R);
        setStep('zariski', 'info', line.head, line.detail);
        for (const s of ['places', 'congruence', 'sarith']) setStep(s, 'skipped', 'Not needed', '$\\Gamma$ is not Zariski dense.');
        startElementary(R, res.closure.kind);
        renderVerdict();
        refreshView('zariski');
        return;
    }
    // 'dense', not 'yes': being Zariski dense is a fact about Γ, not a verdict to show in green
    setStep('zariski', 'dense', line.head, line.detail);
    // trace field ℚ and a split algebra over a bigger field: Γ is conjugate into PGL₂(ℚ) (descent.js)
    const A = res.arith;
    if (R.model.degree > 1 && A && A.k.d === 1 && A.A && A.A.split) {
        try { R.descent = descendToQ(R.model.mats.map((row) => row.map((e) => e.src)), R.model.poly); } catch (e) { R.descent = { error: e.message }; }
    }
    applyIntegral(R);
    renderVerdict();
    refreshView('zariski');
    startCongruence();
    placeChanged();          // the places settled so far, read with the closure: step 3 can start
}

/** Γ is not Zariski dense: step 2 is not needed, so its workers stop and its places are dropped. */
function stopPlaces(R) {
    R.placesStopped = true;
    for (const w of R.placeWorkers) { try { w.terminate(); } catch (e) { /* gone */ } R.workers.delete(w); }
    R.placeWorkers.clear();
    R.places = [];
    R.byKey.clear();
    placeFrames.hide();
    $('places-frame-wrap').hidden = true;
    input.showTones(null);
}

/**
 * Step 1 done, with step 2 under way: the places where Γ is discrete by integrality (integralPlaces,
 * integralPrime). A place Poincaré or the trees already found discrete keeps that verdict; Poincaré's
 * domain is kept as for an integral place (setArch), now or when it answers.
 */
function applyIntegral(R) {
    const A = R.zariski.arith;
    if (!A) return;
    const keys = integralPlaces(R.model, A);
    if (keys) {
        for (const pl of R.places) {
            if (pl.tool !== 'poincare' || pl.status === 'discrete' || !(pl.members || []).some((x) => keys.has(x.key))) continue;
            const answered = pl.summary !== undefined, sm = pl.summary;
            Object.assign(pl, { ...integralVerdict(R.model, pl), integral: true });
            if (answered) {
                pl.rawSummary = sm;
                pl.summary = sm && sm.status === 'verified' ? sm : null;
                if (pl.summary) pl.lines = [...pl.lines, ...poincareLines(sm, { also: true })];
            }
        }
    }
    R.integralPrime = integralPrime(A);
    if (R.integralPrime) {
        for (const pl of R.places) {
            if (pl.kind === 'finite' && String(pl.p) === R.integralPrime && pl.status !== 'discrete') {
                Object.assign(pl, integralPrimeVerdict(R.integralPrime, A.ring.d ?? 1), { integral: true });
            }
        }
    }
    // the places where Γ is bounded: not discrete (setArch and finitePlace keep this when they answer later)
    for (const pl of R.places) {
        if (pl.status === 'discrete' || pl.status === 'nondiscrete') continue;
        const v = boundedVerdict(R, pl);
        if (v) Object.assign(pl, v, { bounded: true });
    }
}

/**
 * A place where step 1 shows Γ bounded. Γ is Zariski dense, hence infinite, so it is not discrete there.
 *   · At ∞: over a real place of k where A is ramified, Γ⁽²⁾ lies in PGL₁(ℍ) ≅ SO(3). Places of F are
 *     matched with places of k by their values of tr²/det (archPlaces.js, numerical), which is trusted only
 *     when the matching is forced (boundedArchKeys).
 *   · At a prime over p: when no prime of S lies over p (S, the primes where tr²/det is not integral, is exact).
 * Returns { status, headline, lines } or null.
 */
function boundedVerdict(R, pl) {
    const z = R.zariski;
    if (!z || !z.ok || z.closure.kind !== 'dense' || !z.arith) return null;
    const A = z.arith;
    const infinite = '$\\Gamma$ is Zariski dense, so it is infinite, and an infinite subgroup of a compact group is not discrete.';
    if (pl.tool === 'poincare') {
        if (!boundedArchKeys(R).has(pl.key)) return null;
        const ram = A.A.ram.filter((r) => r.kind === 'real');
        const below = A.k.d === 1 ? 'the real place of $\\mathbb{Q}$' : ram.length === 1 ? `the real place $${ram[0].tex}$ of $k$` : 'a real place of $k$';
        return {
            status: 'nondiscrete', headline: 'Not discrete — bounded and infinite',
            lines: [
                `This place lies over ${below}, where the quaternion algebra $A$ is ramified (step 1).`,
                'There $\\Gamma^{(2)}$, of finite index in $\\Gamma$, lies in the compact group $\\mathrm{PGL}_1(\\mathbb{H}) \\cong \\mathrm{SO}(3)$, so $\\Gamma$ is bounded.',
                infinite,
            ],
        };
    }
    if (pl.kind === 'finite') {
        if (A.ring.S.some((x) => String(x.p) === String(pl.p))) return null;
        return {
            status: 'nondiscrete', headline: 'Not discrete — bounded and infinite',
            lines: [
                `Step 1 finds $\\Gamma$ bounded at every prime over $${pl.p}$: the values of $\\operatorname{tr}^2/\\det$ are integral there.`,
                'So $\\Gamma$ fixes a vertex of the tree, and lies in its stabilizer, which is compact.',
                infinite,
            ],
        };
    }
    return null;
}

/**
 * The keys of the places at ∞ (classes of embeddings of F, archGroups) lying over a ramified real place
 * of k. Bounded there means compact: every t = tr²/det real in [0, 4] (archClasses' noncompact = false).
 * This is used only when it is forced: as many classes as places of k at ∞ (so one class per place of k),
 * and as many compact classes as ramified real places of k (each of which gives a compact class).
 */
function boundedArchKeys(R) {
    if (R.boundedArch) return R.boundedArch;
    const A = R.zariski.arith, k = A.k;
    const arch = R.places.filter((p) => p.tool === 'poincare');
    const compact = arch.filter((p) => (p.members || [p]).every((x) => x.noncompact === false));
    const nRam = A.A.ram.filter((r) => r.kind === 'real').length;
    const forced = nRam > 0 && arch.length === k.r1 + k.r2 && compact.length === nRam && A.spaces.bounded.length === nRam;
    R.boundedArch = new Set(forced ? compact.map((p) => p.key) : []);
    return R.boundedArch;
}

/**
 * A Γ that is not Zariski dense: its presentation on nice generators (elementary.js, in
 * elementaryWorker.js), each written in the given ones.
 */
function startElementary(R, kind) {
    R.elementary = { status: 'running' };
    let worker;
    try { worker = new Worker(new URL(`./elementaryWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' }); }
    catch (e) { R.elementary = { status: 'error', error: 'module workers are unavailable here' }; return; }
    R.workers.add(worker);
    const done = (m) => {
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* gone */ }
        R.workers.delete(worker);
        if (R !== run) return;
        R.elementary = m.error ? { status: 'error', error: m.error } : { status: 'done', result: m.result };
        renderVerdict();
        refreshView('zariski');
    };
    const timer = setTimeout(() => done({ error: 'no answer after 60 s' }), 60000);
    worker.onmessage = (ev) => done(ev.data);
    worker.onerror = (e) => { e.preventDefault?.(); done({ error: e.message || 'the worker failed to load' }); };
    const m = R.model;
    worker.postMessage({ id: R.seq, rows: m.mats.map((r) => r.map((e) => e.src)), poly: m.poly.map(String), root: m.degree > 1 ? m.roots[m.defaultIndex] : null, kind });
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
        status: 'pending', headline: 'Deciding…', lines: [],
    };
}

/**
 * The places at ∞ to test: the embeddings of F up to conjugating Γ. Embeddings with the same
 * values of tr²/det, up to complex conjugation, lie over one place of the trace field k and give
 * conjugate (or complex-conjugate) groups, so they are one place here. Poincaré runs at one of
 * them: a real one if there is one (it shows the area in H²), preferring yours.
 */
function archGroups(model) {
    const groups = [];
    for (const a of archClasses(model)) {
        const g = groups.find((x) => sameTaus(x[0].taus, a.taus));
        if (g) g.push(a); else groups.push([a]);
    }
    return groups.map((g) => ({
        rep: g.find((x) => x.kind === 'real' && x.isDefault) || g.find((x) => x.kind === 'real') || g.find((x) => x.isDefault) || g[0],
        members: g,
    }));
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
    // (once step 1 is done, applyIntegral marks the places discrete by integrality; Poincaré still runs, for a presentation)
    const groups = archGroups(R.model);
    const count = { real: 0, complex: 0 };
    for (const g of groups) count[g.rep.kind]++;
    const seen = { real: 0, complex: 0 };
    groups.forEach((g, i) => {
        const pl = archPlace(g.rep, R.model, R.input);
        // ℝ₁, ℝ₂, … and ℂ₁, ℂ₂, …, numbered within each kind (ℝ or ℂ alone when it is the only one)
        const kn = ++seen[g.rep.kind];
        Object.assign(pl, { key: `inf${i + 1}`, n: i + 1, kn, only: count[g.rep.kind] === 1, members: g.members, yours: g.members.some((x) => x.isDefault) });
        addPlace(pl);
    });
    startFinite();
    startArchJobs();
    R.placeSel = R.places[0].key;
    renderVerdict();
    if (!R.userPicked) showView('places', R.placeSel, { auto: true });
}

/**
 * The places at ∞ where Γ is discrete by integrality (also batch/pipeline.mjs): when Γ is bounded at
 * every prime, Γ⁽²⁾ lies in the unit group O¹ of an order, a lattice in the product of the places at
 * ∞ where A splits; when there is just one such place, Γ is discrete there. Returns the keys of the
 * embeddings of F over that place, or null.
 */
function integralPlaces(model, A) {
    if (A.ring.S.length) return null;
    const split = (A.spaces ? A.spaces.factors : []).filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (split.length !== 1) return null;
    if (model.degree === 1) return new Set(model.arch.map((a) => a.key));
    const nc = archClasses(model).filter((x) => x.noncompact);
    if (!nc.length || new Set(nc.map((x) => x.classKey)).size !== 1) return null;
    return new Set(nc.map((x) => x.key));
}
/**
 * The prime where Γ is discrete by integrality (also batch/pipeline.mjs): Γ unbounded at exactly one place
 * of the trace field k, a prime 𝔭 (A ramified at every place at ∞, Γ bounded at every other prime),
 * and 𝔭 the only prime of k over p. Then Γ⁽²⁾ lies in the norm-one group of an O_k[1/𝔭]-order of A,
 * discrete in PGL₁(A)(k_𝔭), so Γ is discrete at every place of F over p. Returns p as a string, or null.
 */
function integralPrime(A) {
    const f = A.spaces ? A.spaces.factors : [];
    if (f.length !== 1 || f[0].kind !== 'tree' || A.ring.S.length !== 1) return null;
    const P = A.ring.S[0], d = A.ring.d ?? (A.k ? A.k.d : 1);
    if (d !== 1 && Number(P.e) * Number(P.f) !== d) return null;
    return String(P.p);
}
function integralPrimeVerdict(p, d = 1) {
    const ring = d === 1 ? `\\mathbb{Z}[1/${p}]` : '\\mathcal{O}_k[1/\\mathfrak{p}]', local = d === 1 ? `\\mathbb{Q}_{${p}}` : 'k_{\\mathfrak{p}}';
    return {
        status: 'discrete', headline: 'Discrete — bounded at every other place',
        lines: [
            d === 1 ? `$\\Gamma$ is unbounded only at $${p}$.` : `$\\Gamma$ is unbounded only at the prime $\\mathfrak{p}$ of $k$ over $${p}$.`,
            `The quaternion algebra $A$ is ramified at ${d === 1 ? '$\\infty$' : 'every place at $\\infty$'}, where $\\Gamma$ lies in a compact group, and $\\Gamma$ is bounded at every other prime.`,
            `So $\\Gamma^{(2)}$ lies in the norm-one group of an $${ring}$-order of $A$, which is a discrete subgroup of $\\mathrm{PGL}_1(A)(${local})$.`,
            `Hence $\\Gamma$ is discrete at every place over $${p}$.`,
        ],
    };
}
function integralVerdict(model, a) {
    const where = a.kind === 'real' ? 'PGL₂(ℝ)' : 'PSL₂(ℂ)', whereTex = a.kind === 'real' ? '\\mathrm{PGL}_2(\\mathbb{R})' : '\\mathrm{PSL}_2(\\mathbb{C})';
    return {
        status: 'discrete', headline: `Discrete in ${where} — bounded at every prime`,
        lines: model.degree === 1
            ? [
                '$\\Gamma \\subset \\mathrm{PGL}_2(\\mathbb{Q})$ is bounded at every prime.',
                'So $\\Gamma$ lies in $\\mathrm{PGL}_2(\\mathbb{Q}) \\cap (\\mathrm{PGL}_2(\\mathbb{R}) \\times U)$ for a compact open subgroup $U$ of the finite adeles.',
                '$\\mathrm{PGL}_2(\\mathbb{Q})$ is discrete in the adeles, so $\\Gamma$ is discrete in $\\mathrm{PGL}_2(\\mathbb{R})$.',
            ]
            : [
                '$\\Gamma$ is bounded at every prime, so $\\Gamma^{(2)}$ lies in the norm-one group of an order of the quaternion algebra $A$.',
                'That group is a lattice in the product of $\\mathrm{PGL}_2$ over the places at $\\infty$ where $A$ splits.',
                `There is only one such place, so $\\Gamma$ is discrete in $${whereTex}$.`,
            ],
    };
}

/** Poincaré's verified domain, in sentences. */
function poincareLines(sm, { also = false } = {}) {
    const out = [`Poincaré’s conditions${also ? ' also' : ''} hold for a Dirichlet domain with ${sm.faces} faces${sm.exactUsed ? ', with the relations checked exactly' : ''}.`];
    if (sm.real) out.push(sm.finiteArea ? 'Its slice by the plane meets the circle at infinity only in cusps, so it has finite area.' : `Its slice by the plane has ${plural(sm.freeArcs, 'free side')} at infinity, so it has infinite area.`);
    else out.push(sm.finiteVolume ? `It has finite volume${sm.volume != null ? ` $\\approx ${Number(sm.volume).toFixed(4)}$` : ''}.` : 'It has infinite volume.');
    if (sm.h1) out.push(`Its first homology is $H_1 = ${innerTex(sm.h1)}$.`);
    return out;
}

function startArchJobs() {
    const R = run;
    const queue = R.places.filter((pl) => pl.tool === 'poincare');
    const max = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    let active = 0;
    const next = () => {
        if (R.cancelled || R.placesStopped) return;
        while (active < max && queue.length) {
            const pl = queue.shift();
            active++;
            runArch(R, pl.state, { certify: true, pool: R.placeWorkers }, (out) => setArch(R, pl, out)).finally(() => { active--; next(); });
        }
    };
    next();
}

/**
 * poincare (and the certificates) on one state; calls back with { cert, summary } or { error } / { timeout }.
 * pool: the step's set of workers (R.placeWorkers or R.arithWorkers), so that the step can be stopped.
 */
function runArch(R, state, { certify = true, pool = null } = {}, cb) {
    return new Promise((resolve) => {
        let worker;
        try {
            worker = new Worker(new URL(`./archWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
        } catch (e) {
            cb({ error: 'module workers are unavailable here' });
            resolve(); return;
        }
        R.workers.add(worker);
        if (pool) pool.add(worker);
        const done = () => { clearTimeout(timer); try { worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(worker); if (pool) pool.delete(worker); resolve(); };
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
    if (R !== run || R.placesStopped) return;
    if (pl.bounded) { pl.summary = summary; placeChanged(); return; }   // settled by step 1 (boundedVerdict)
    if (pl.integral) {
        // already decided; keep Poincaré's domain and presentation when it verifies
        if (summary && summary.status === 'verified') {
            pl.lines = [...pl.lines, ...poincareLines(summary, { also: true })];
            if (summary.bp) pl.state = { ...pl.state, bp: summary.bp };
        }
        pl.summary = summary && summary.status === 'verified' ? summary : null;
        pl.rawSummary = summary;             // unverified walls still bound a region containing a fundamental domain
        placeChanged();
        return;
    }
    const where = pl.kind === 'real' ? 'PGL₂(ℝ)' : 'PSL₂(ℂ)';
    const one = (t) => [t];
    if (cert && cert.nondiscrete) {
        Object.assign(pl, { status: 'nondiscrete', headline: 'Not discrete', lines: cert.tex && cert.tex.length ? cert.tex : mathLines(cert.text) });
    } else if (summary && summary.status === 'verified') {
        const what = summary.real ? (summary.finiteArea ? 'Fuchsian, finite area' : 'Fuchsian, infinite area')
            : summary.finiteVolume ? `finite covolume${vol(summary.volume)}` : 'infinite covolume';
        Object.assign(pl, { status: 'discrete', headline: `Discrete in ${where} — ${what}`, lines: poincareLines(summary) });
        if (summary.bp) pl.state = { ...pl.state, bp: summary.bp };
    } else if (summary && summary.capped) {
        Object.assign(pl, { status: 'unknown', headline: 'Probably not discrete', lines: one('The stabilizer of the basepoint did not close up into a finite group.') });
    } else if (summary && summary.status === 'incomplete') {
        Object.assign(pl, { status: 'likely', headline: 'Probably discrete', lines: [`Every Poincaré condition that could be resolved holds, for a domain with ${summary.faces} faces.`, 'Some checks are still open.'] });
    } else if (summary && summary.membershipFail) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', lines: ['The domain found is for a proper subgroup.', 'Raise the word length.'] });
    } else if (summary) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', lines: one(`Poincaré’s conditions fail at this word length${summary.tries > 1 ? `, from ${summary.tries} basepoints` : ''}.`) });
    } else if (timeout) {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', lines: one(`The domain took longer than ${ARCH_TIMEOUT} s.`) });
    } else {
        Object.assign(pl, { status: 'unknown', headline: 'Undecided', lines: one(`Error: ${String(error).replace(/\$/g, '')}`) });
    }
    // over ℚ, exact two-generator criteria where Poincaré did not decide (fuchsian2.js)
    if (pl.kind === 'real' && pl.status !== 'discrete' && pl.status !== 'nondiscrete' && R.model.degree === 1) {
        const f = fuchsianPairTest(R.model.mats.map((row) => row.map((e) => e.src)));
        if (f && f.status === 'discrete') Object.assign(pl, { status: 'discrete', headline: `Discrete in ${where} — Fuchsian, free`, lines: [...mathLines(`${f.reason}.`), '$\\Gamma^+$ has index at most $2$ in $\\Gamma$.'] });
        if (f && f.status === 'nondiscrete') Object.assign(pl, { status: 'nondiscrete', headline: 'Not discrete', lines: mathLines(`${f.reason}.`) });
    }
    pl.summary = summary;
    if (pl.status === 'unknown') startDeep(R, pl);
    placeChanged();
}

/**
 * Poincaré left a place at ∞ undecided: the exact search for a proof of non-discreteness (an elliptic
 * of infinite order, a cusp group, Jørgensen's inequality, …; certificates.js) again, on longer words
 * than the first pass (4 letters for two generators). The place counts as pending meanwhile.
 */
const DEEP_SECONDS = 8;
function startDeep(R, pl) {
    if (pl.deep) return;
    const n = R.model.mats.length;
    const maxLen = n <= 2 ? 7 : n <= 3 ? 5 : 4;
    pl.deep = 'running';
    pl.before = { headline: pl.headline, lines: pl.lines };
    Object.assign(pl, { status: 'pending', headline: 'Undecided by Poincaré — searching longer words…' });
    let worker;
    try { worker = new Worker(new URL(`./archWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' }); }
    catch (e) { deepDone(R, pl, null, maxLen); return; }
    R.workers.add(worker);
    R.placeWorkers.add(worker);
    let answered = false;
    const done = (cert) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* gone */ }
        R.workers.delete(worker);
        R.placeWorkers.delete(worker);
        if (R === run && !R.placesStopped) deepDone(R, pl, cert, maxLen);
    };
    const timer = setTimeout(() => done(null), (DEEP_SECONDS + 30) * 1000);
    worker.onmessage = (ev) => done(ev.data.error ? null : ev.data.cert);
    worker.onerror = (e) => { e.preventDefault?.(); done(null); };
    worker.postMessage({ id: 1, state: pl.state, deep: { maxLen, cap: 4000, budgetMs: DEEP_SECONDS * 1000, maxEvals: 20000 } });
}

function deepDone(R, pl, cert, maxLen) {
    pl.deep = 'done';
    if (pl.status !== 'pending') { placeChanged(); return; }       // settled meanwhile (step 1: bounded)
    if (cert && cert.nondiscrete) {
        const lines = cert.tex && cert.tex.length ? cert.tex : mathLines(cert.text);
        Object.assign(pl, { status: 'nondiscrete', headline: 'Not discrete', lines: [`Poincaré did not settle this place; the search over words of up to $${maxLen}$ letters finds a proof.`, ...lines] });
    } else {
        Object.assign(pl, { status: 'unknown', ...pl.before });
        pl.lines = [...pl.lines, `No proof of non-discreteness among words of up to $${maxLen}$ letters either${cert && cert.checked ? ` (${cert.checked} elements)` : ''}.`];
    }
    placeChanged();
}

/**
 * Mostow rigidity, where the deeper search found nothing: Γ is a cocompact lattice at a place v at ∞
 * (Poincaré verified: finite volume, no cusps). At another place w at ∞ (other values of tr²/det, even
 * up to complex conjugation), Galois conjugation is a faithful representation ρ. If ρ(Γ) were discrete,
 * a torsion-free subgroup Γ′ of finite index (Selberg) has cohomological dimension 3, so ℍ³/ρ(Γ′) is a
 * closed manifold and ρ(Γ) a lattice; Mostow makes ρ conjugation by an isometry of ℍ³, which keeps
 * tr²/det up to complex conjugation. So Γ is not discrete at w. (Cusped lattices are not covered here.)
 */
function rigidityVerdict(R, pl) {
    if (pl.tool !== 'poincare') return null;
    const v = R.places.find((q) => q !== pl && q.tool === 'poincare' && q.kind === 'complex' && q.status === 'discrete'
        && q.summary && q.summary.status === 'verified' && !q.summary.real && q.summary.finiteVolume && !q.summary.cusps);
    if (!v) return null;
    const V = `$${placeTexLabel(v)}$`, W = `$${placeTexLabel(pl)}$`;
    return {
        status: 'nondiscrete', headline: 'Not discrete — by Mostow rigidity',
        lines: [
            `$\\Gamma$ is a cocompact lattice at ${V}: Poincaré’s domain there has finite volume and no cusps.`,
            `Galois conjugation carries $\\Gamma$ at ${V} isomorphically onto $\\Gamma$ at ${W}, where the values of $\\operatorname{tr}^2/\\det$ are different, even up to complex conjugation.`,
            `If $\\Gamma$ were discrete at ${W}, a torsion-free subgroup of finite index (Selberg) would have cohomological dimension $3$, so its quotient of $\\mathbb{H}^3$ would be a closed manifold, and $\\Gamma$ would be a lattice at ${W} too.`,
            'By Mostow rigidity, the isomorphism would then be conjugation by an isometry of $\\mathbb{H}^3$, which keeps $\\operatorname{tr}^2/\\det$ up to complex conjugation. So $\\Gamma$ is not discrete here.',
        ],
    };
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
    R.placeWorkers.add(worker);
    let watchdog = null;
    const finish = (err) => {
        clearTimeout(watchdog);
        try { worker.terminate(); } catch (e) { /* gone */ }
        R.workers.delete(worker);
        R.placeWorkers.delete(worker);
        if (R !== run || R.placesStopped) return;
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
        if (R !== run || R.placesStopped) return;
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
    if (!d) return { status: 'unknown', headline: 'Undecided', lines: [] };
    if (d.verdict === 'discrete') {
        const headline = d.kind === 'finite' ? `Discrete — finite, of order ${d.order}`
            : d.kind === 'free' ? `Discrete — free of rank ${d.freeRank}`
                : d.kind === 'virtually-free' ? (d.freeProduct ? `Discrete — ${d.freeProduct}` : 'Discrete — virtually free') : 'Discrete';
        return { status: 'discrete', headline, lines: mathLines(d.reason) };
    }
    if (d.verdict === 'nondiscrete') return { status: 'nondiscrete', headline: 'Not discrete', lines: mathLines(d.reason) };
    return { status: 'unknown', headline: 'Undecided', lines: mathLines(d.reason) };
}

function finitePlace(R, msg) {
    let v = msg.status === 'decided' ? decisionVerdict(msg.decision)
        : { status: 'unknown', headline: 'Undecided', lines: mathLines(msg.reason || '') };
    if (R.integralPrime && String(msg.p) === R.integralPrime && v.status !== 'discrete') v = { ...integralPrimeVerdict(R.integralPrime, R.zariski.arith.ring.d ?? 1), integral: true };
    // bounded here by step 1 (when it is done): not discrete
    const b = v.status !== 'discrete' && v.status !== 'nondiscrete' ? boundedVerdict(R, { kind: 'finite', p: msg.p }) : null;
    if (b) v = { ...b, bounded: true };
    return {
        key: msg.key, kind: 'finite', tool: 'trees', p: msg.p, index: msg.index, count: msg.count,
        e: msg.e, f: msg.f, q: msg.q, primeTex: msg.primeTex, primeOf: msg.primeOf,
        state: treesState(R.model, msg.p, msg.index, msg.primeOf), decision: msg.decision || null, ...v,
    };
}

function genericPlace(R, msg) {
    let v;
    if (msg.error) v = { status: 'unknown', headline: 'Undecided', lines: mathLines(msg.error) };
    else {
        const d = msg.decision;
        if (d.verdict === 'discrete' && d.kind === 'finite') v = { status: 'discrete', headline: `Γ is finite, of order ${d.order}`, lines: ['A finite group is discrete at every place.'] };
        else if (d.verdict === 'nondiscrete') v = { status: 'nondiscrete', headline: 'Not discrete — bounded and infinite', lines: mathLines(d.reason) };
        else v = decisionVerdict(d);
    }
    return {
        key: 'generic', kind: 'generic', tool: 'trees', p: msg.p, index: 0, count: 1,
        state: treesState(R.model, msg.p, 0, null), decision: msg.decision || null, ...v,
    };
}

/**
 * The places shown: those at ∞, then the primes where Γ is unbounded. The rest ("every other
 * prime", where Γ fixes the standard vertex) is still tested, for finiteness, but not listed.
 */
function placeOrder(R) {
    const arch = R.places.filter((p) => p.tool === 'poincare');
    const fin = R.places.filter((p) => p.kind === 'finite')
        .sort((a, b) => (BigInt(a.p) < BigInt(b.p) ? -1 : BigInt(a.p) > BigInt(b.p) ? 1 : a.index - b.index));
    return arch.concat(fin);
}

/** ℝ, ℂ (or ℝ₁, ℂ₂, … when there are several of a kind), ℚ₅, 𝔭₁ | 5. */
function placeLabel(pl) {
    if (pl.tool === 'poincare') return `${pl.kind === 'real' ? 'ℝ' : 'ℂ'}${pl.only ? '' : sub(pl.kn)}`;
    if (pl.kind === 'generic') return 'every other prime';
    if (!run.model || run.model.degree === 1) return `ℚ${sub(pl.p)}`;
    return `${pl.count > 1 ? `𝔭${sub(pl.index + 1)}` : '𝔭'} ∣ ${pl.p}`;
}
/** The same in TeX. */
function placeTexLabel(pl) {
    if (pl.tool === 'poincare') return `\\mathbb{${pl.kind === 'real' ? 'R' : 'C'}}${pl.only ? '' : `_{${pl.kn}}`}`;
    if (!run.model || run.model.degree === 1) return `\\mathbb{Q}_{${pl.p}}`;
    return `${pl.count > 1 ? `\\mathfrak{p}_{${pl.index + 1}}` : '\\mathfrak{p}'} \\mid ${pl.p}`;
}

/** Places as text with $…$ math: $\mathbb{C}_1$, $\mathbb{Q}_5$ and $\mathfrak{p} \mid 7$. */
function placeList(ps) {
    const t = ps.map((pl) => (pl.kind === 'generic' ? placeLabel(pl) : `$${placeTexLabel(pl)}$`));
    return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

function placeChanged() {
    const R = run;
    if (!R || R.cancelled || R.placesStopped) return;
    // Mostow rigidity, at the places the deeper search left undecided
    for (const pl of R.places) {
        if (pl.status !== 'unknown' || pl.deep !== 'done' || pl.rigid) continue;
        const v = rigidityVerdict(R, pl);
        if (v) Object.assign(pl, v, { rigid: true });
    }
    const order = placeOrder(R);
    const yes = order.filter((p) => p.status === 'discrete');
    const pending = order.some((p) => p.status === 'pending') || !R.finiteDone;
    const finite = R.generic && R.generic.decision && R.generic.decision.kind === 'finite';
    if (yes.length) {
        const best = yes[0];
        setStep('places', 'yes', finite ? `$\\Gamma$ is finite (order $${R.generic.decision.order}$)` : `Discrete at ${placeList(yes)}`, best.headline);
        if (!R.placesDone) {
            R.placesDone = true;
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
    }
    maybeStartArith(R);
    renderSteps();
    renderVerdict();
    renderSubBar();
    showRootTones(R);
}

// ───────────────────────── the roots, coloured by discreteness ─────────────────────────

/**
 * For each root row, the place at ∞ each of its roots gives: the group read with that root picked,
 * matched to a place by its values of tr²/det (archPlaces.js). Cached on the run.
 */
function rootPlaces(R) {
    if (R.rootPlaces) return R.rootPlaces;
    const arch = R.places.filter((p) => p.tool === 'poincare');
    const out = new Map();
    for (const { row, roots } of input.rootRows()) {
        out.set(row, roots.map((z) => {
            try {
                const consts = R.input.consts.map((c, i) => (i === row ? { ...c, near: z } : c));
                const { read } = buildGroup({ ...R.input, consts });
                const taus = tauValuesOf(read.entries.map((e) => e.map((x) => ({ re: x.re, im: x.im }))));
                const pl = arch.find((p) => (p.members || []).some((a) => sameTaus(a.taus, taus)));
                return pl ? pl.key : null;
            } catch (e) { return null; }
        }));
    }
    R.rootPlaces = out;
    return out;
}

/** Green where Γ is discrete, red where it is not, plain while undecided. */
function showRootTones(R) {
    if (!R || R !== run || !R.model || !R.places.some((p) => p.tool === 'poincare')) return;
    let map;
    try { map = rootPlaces(R); } catch (e) { return; }
    input.showTones((row, i) => {
        const key = map.get(row) ? map.get(row)[i] : null, pl = key ? R.byKey.get(key) : null;
        if (!pl) return null;
        const tone = pl.status === 'discrete' ? 'yes' : pl.status === 'nondiscrete' ? 'no' : null;
        return { tone, note: `${placeLabel(pl)}: ${pl.headline}` };
    });
}

// ───────────────────────── step 1, continued: the congruence closure ─────────────────────────

/** Over ℚ the joint congruence closure runs in a worker, alongside step 2; otherwise the engine's line. */
function startCongruence() {
    const R = run, A = R.zariski.arith;
    const S = A.ring.S.map((x) => Number(x.p));
    R.congruence = { status: 'running', result: null, error: null };
    if (R.model.degree !== 1 || !S.length || !A.congruence || A.congruence.error) {
        R.congruence.status = 'done';
        const line = jointCongruenceLine(R.congruence, A);
        setStep('congruence', line.status, line.head, line.detail);
        refreshView('zariski');
        return;
    }
    setStep('congruence', 'running', 'Computing…', 'The image of Γ modulo the levels where it is deficient.');
    let worker;
    try {
        worker = new Worker(new URL(`./congruenceWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
    } catch (e) {
        congruenceDone(R, { error: 'module workers are unavailable here' });
        return;
    }
    R.workers.add(worker);
    // two messages: the closure, then its description (congruenceShape.js), which may take longer
    let answered = false;
    const stop = () => { clearTimeout(timer); try { worker.terminate(); } catch (e) { /* gone */ } R.workers.delete(worker); };
    const done = (m) => { if (answered) return; answered = true; congruenceDone(R, m); };
    const timer = setTimeout(() => { stop(); if (!answered) done({ error: `no answer after ${CONG_SECONDS + 20} s` }); }, (CONG_SECONDS + 40) * 1000);
    worker.onmessage = (ev) => {
        const m = ev.data;
        if ('shape' in m) { stop(); if (R === run && R.congruence) { R.congruence.shape = m.shape; refreshView('zariski'); } return; }
        done(m);
        if (m.error) stop();
    };
    worker.onerror = (e) => { e.preventDefault?.(); stop(); done({ error: e.message || 'the worker failed to load' }); };
    worker.postMessage({ id: R.seq, rows: R.model.mats.map((r) => r.map((e) => e.src)), S, C: A.congruence, cap: 4000000, seconds: CONG_SECONDS });
}

function congruenceDone(R, m) {
    if (R !== run) return;
    Object.assign(R.congruence, { status: 'done', result: m.result || null, error: m.error || null });
    const line = jointCongruenceLine(R.congruence, R.zariski.arith);
    setStep('congruence', line.status, line.head, line.detail);
    refreshView('zariski');
    renderVerdict();
}

// ───────────────────────── TeX for step 3 ─────────────────────────

const RING_TEX = { 1: '\\mathbb{Z}[i]', 2: '\\mathbb{Z}[\\sqrt{-2}]', 3: '\\mathbb{Z}[\\omega]' };
/** An element of the ring d written in its generator w (bianchi.js) in TeX: i, √−2 or ω. */
function ringEltTex(d, x) {
    const sym = { 1: 'i', 2: '\\sqrt{-2}', 3: '\\omega' }[d];
    return String(x).replace(/−/g, '-').replace(/(\d)w/g, `$1${sym}`).replace(/w/g, sym);
}
/** 2, 3 and 5 as TeX. */
const listTex = (xs) => { const t = xs.map((x) => `$${x}$`); return t.length <= 1 ? t.join('') : `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`; };
/** Text that may start with a lowercase word, as the start of a sentence. */
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ───────────────────────── step 3: when it starts ─────────────────────────

/**
 * Step 3 needs step 1 (Λ, and the factors of X where Γ is unbounded), but not all of step 2:
 *   · a place found discrete: discreteArith;
 *   · otherwise the search for a certificate starts as soon as step 1 is done when its answer cannot
 *     hang on step 2: with two or more factors (a place found discrete later makes Γ thin, and stops
 *     the search, unless it has already proved Γ S-arithmetic), or one factor, a prime (the search is
 *     the same whether or not Γ is discrete there);
 *   · with one factor at ∞, it waits until every place is settled.
 * Called whenever a place changes, and when step 1 is done.
 */
function maybeStartArith(R) {
    if (R !== run || R.cancelled) return;
    const A = R.zariski && R.zariski.ok && R.zariski.closure.kind === 'dense' ? R.zariski.arith : null;
    if (!A || !A.spaces) return;
    if (R.places.some((p) => p.status === 'discrete')) { discreteArith(R); return; }
    if (R.arithStarted) return;
    const f = A.spaces.factors;
    const settled = R.finiteDone && !R.places.some((p) => p.status === 'pending');
    if (f.length >= 2 || (f.length === 1 && f[0].kind === 'tree') || settled) launchArith(R);
}

/**
 * Start the search, once. A frame later: it opens with coset enumeration on this thread, which can
 * take seconds, and the results of steps 1 and 2 should be on screen first.
 */
function launchArith(R) {
    if (R.arithStarted) return;
    R.arithStarted = true;
    const ep = R.arithEpoch;
    setStep('sarith', 'running', 'Starting…', 'Coset enumeration first, then the search.');
    setTimeout(() => { if (R === run && !R.cancelled && R.arithEpoch === ep) startSarith(); }, 20);
}

/** Stop step 3's search: its workers, and (by the epoch) every callback of it still to come. */
function stopArith(R) {
    R.arithEpoch++;
    for (const w of R.arithWorkers) { try { w.terminate(); } catch (e) { /* gone */ } R.workers.delete(w); }
    R.arithWorkers.clear();
    if (R.sarith) R.sarith.worker = null;
    stabFrames.hide();
    $('stab-frame-wrap').hidden = true;
}

/** A worker of step 3: stopped with it (stopArith) as well as with the run. */
function arithWorker(R, worker) {
    R.workers.add(worker);
    R.arithWorkers.add(worker);
    return worker;
}
function dropWorker(R, worker) {
    try { worker.terminate(); } catch (e) { /* gone */ }
    R.workers.delete(worker);
    R.arithWorkers.delete(worker);
}

// ───────────────────────── step 3 for a discrete Γ: is it a lattice? ─────────────────────────

/**
 * Γ is discrete at a place v. The arithmetic group Λ ⊇ Γ⁽²⁾ of step 1 is a lattice in the product
 * of the factors where Γ is unbounded, one for each such place of k (the Zariski engine's
 * spaces.factors).
 *   · Two or more factors: Λ is irreducible there, so its image at v is dense, and so is the
 *     image of any subgroup of finite index. Γ, discrete at v, has infinite index: thin.
 *   · One factor, at ∞: Λ is a lattice at v, and Γ is arithmetic exactly when it is a lattice
 *     there too. When every generator lies in PGL₂(ℤ), Stallings folding decides the index
 *     exactly; in a Bianchi group, coset enumeration proves a finite one. Otherwise Poincaré's
 *     domain at v decides, by its area or volume: since Γ is discrete, the walls found bound a
 *     region containing a fundamental domain, so finite area there suffices even unverified.
 *   · One factor, a prime: the covering certificate (startSarith), as for a non-discrete Γ.
 * Called on every change at the places; it acts once.
 */
function discreteArith(R) {
    if (R.discArith || R.cancelled || R !== run) return;
    const A = R.zariski && R.zariski.arith;
    if (!A || !A.spaces) return;
    const disc = placeOrder(R).filter((p) => p.status === 'discrete');
    if (!disc.length) return;
    const factors = A.spaces.factors;
    const pl = disc.find((p) => p.tool === 'poincare') || disc[0];
    const at = `$${placeTexLabel(pl)}$`;
    const Ltex = A.head.replace(/^.*\\le /, '');
    if (pl.tool === 'trees' && factors.length < 2) {
        // one factor, this prime: the search (perhaps already running) decides
        R.discArith = 'search';
        launchArith(R);
        return;
    }
    // the search may have started before this place was found discrete: this settles step 3 instead,
    // unless the search has already proved Γ S-arithmetic (then it is kept)
    if (R.arithStarted) {
        if (R.steps.sarith.status === 'yes') { R.discArith = 'kept'; return; }
        stopArith(R);
    }
    if (factors.length >= 2) {
        R.discArith = 'thin';
        // a lattice at v all the same (Poincaré verified, finite area or volume): a non-arithmetic lattice,
        // "thin" only as a subgroup of Λ (and of its congruence closure), so it is not called thin
        const sm = pl.summary && pl.summary.status === 'verified' ? pl.summary : null;
        const lattice = !!sm && (sm.real ? sm.finiteArea : sm.finiteVolume);
        const where = pl.kind === 'real' ? '\\mathrm{PGL}_2(\\mathbb{R})' : '\\mathrm{PSL}_2(\\mathbb{C})';
        const X = `$${A.spaces.productTex}$`;
        latticeDone(R, lattice ? 'nonarith' : 'thin', lattice
            ? `$\\Gamma$ is a lattice at ${at}, but it has infinite index in $\\Lambda$, which is a lattice in ${X}, not at ${at} alone. So it is not arithmetic; it is thin only as a subgroup of $\\Lambda$, or of its congruence closure.`
            : `$\\Gamma$ is discrete at ${at}, where no subgroup of finite index in $\\Lambda$ is.`, [
            lattice ? `$\\Gamma$ is a lattice at ${at}: Poincaré’s domain there has finite ${sm.real ? 'area' : 'volume'}.` : `$\\Gamma$ is discrete at ${at}.`,
            `$\\Gamma^{(2)}$ lies in $\\Lambda = ${Ltex}$, which is a lattice in the product of the ${factors.length} factors where $\\Gamma$ is unbounded, $X = ${A.spaces.productTex}$.`,
            'This lattice is irreducible, so by strong approximation its image in each factor is dense, and so is the image of each of its subgroups of finite index.',
            lattice ? `So no subgroup of finite index in $\\Lambda$ is discrete at ${at}, and $[\\Lambda : \\Gamma^{(2)}] = \\infty$.`
                : `So no subgroup of finite index in $\\Lambda$ is discrete at ${at}, and $[\\Lambda : \\Gamma^{(2)}] = \\infty$: $\\Gamma$ is thin.`,
            ...(lattice ? [
                `Hence $\\Gamma$ is a non-arithmetic lattice in $${where}$: an arithmetic one is unbounded only at the one place where it is a lattice (Takeuchi), and $\\Gamma$ is unbounded at ${factors.length}.`,
                `It is thin only in this sense: Zariski dense, with infinite index in $\\Lambda$, and so in its congruence closure. At ${at} it has finite covolume.`,
            ] : []),
        ]);
        return;
    }
    const f = factors[0], what = f.kind === 'real' ? 'area' : 'volume';
    const intro = [
        `$\\Gamma$ is discrete at ${at}.`,
        `$\\Gamma^{(2)}$ lies in $\\Lambda = ${Ltex}$, which is a lattice at ${at}, the only place where $\\Gamma$ is unbounded.`,
        `So $\\Gamma$ is arithmetic exactly when it is a lattice there too, that is, when it has finite ${what} in $\\mathbb{H}^{${f.kind === 'real' ? 2 : 3}}$.`,
    ];
    if (!R.latticeExact) R.latticeExact = latticeIndexExact(R, f) || { none: true };
    const ex = R.latticeExact;
    if (ex.index) {
        R.discArith = 'done';
        latticeDone(R, 'arith', `$\\Gamma$ has index $${ex.index}$ in $${ex.groupTex}$, by ${ex.method} (${ex.ms} ms).`, [
            ...intro,
            ex.method === 'Stallings folding'
                ? `Every generator lies in $${ex.groupTex}$. Stallings folding of $\\Gamma \\cap \\mathrm{PSL}_2(\\mathbb{Z})$ in $\\mathrm{PSL}_2(\\mathbb{Z}) = \\mathbb{Z}/2 \\ast \\mathbb{Z}/3$ closes up into a complete coset graph with ${ex.vertices} vertices, so $[${ex.groupTex} : \\Gamma] = ${ex.index}$.`
                : `Every generator lies in $${ex.groupTex}$, and coset enumeration there closes: ${ex.sub === 'Γ' ? '$\\Gamma$ has' : `$\\Gamma \\cap ${ex.groupTex}$ has`} index $${ex.index}$ in $${ex.groupTex}$ (the table is re-checked).`,
            `So $\\Gamma$ is a lattice, and arithmetic.`,
        ], ex);
        return;
    }
    if (ex.infinite) {
        R.discArith = 'done';
        latticeDone(R, 'thin', `$\\Gamma$ has infinite index in $${ex.groupTex}$, by ${ex.method} (${ex.ms} ms).`, [
            ...intro,
            `Every generator lies in $${ex.groupTex}$. Stallings folding of $\\Gamma \\cap \\mathrm{PSL}_2(\\mathbb{Z})$ in $\\mathrm{PSL}_2(\\mathbb{Z}) = \\mathbb{Z}/2 \\ast \\mathbb{Z}/3$ gives a folded coset graph with ${ex.vertices} vertices in which some vertex lacks an edge, so the index is infinite.`,
            '$\\Gamma$ is not a lattice, so $[\\Lambda : \\Gamma^{(2)}] = \\infty$: $\\Gamma$ is thin.',
        ], ex);
        return;
    }
    if (pl.summary === undefined) {
        if (R.steps.sarith.status !== 'running') setStep('sarith', 'running', 'Waiting for Poincaré…', `$\\Gamma$ is discrete at ${at}, and it is arithmetic exactly when it has finite ${what} there.`);
        return;
    }
    R.discArith = 'done';
    const sm = pl.summary || pl.rawSummary || null;
    const ok = !!(sm && sm.status === 'verified');
    // Γ is discrete, so even unverified walls bound a region containing a fundamental domain
    const finite = !!sm && (f.kind === 'real' ? sm.real && sm.finiteArea : ok && sm.finiteVolume);
    const infinite = ok && (f.kind === 'real' ? sm.real && !sm.finiteArea : !sm.finiteVolume);
    const why = { cosets: 'it reached its limit on cosets', time: 'it ran out of time' }[ex.limit] || String(ex.limit).replace(/\$/g, '');
    const tried = ex.limit ? [`Coset enumeration in $${ex.groupTex}$ did not close: ${why}.`] : [];
    if (finite) {
        latticeDone(R, 'arith', `$\\Gamma$ has finite ${what} at ${at}, by Poincaré.`, [
            ...intro, ...tried,
            ok ? `Poincaré’s Dirichlet domain at ${at} has finite ${what}${f.kind === 'real' ? '' : sm.volume != null ? ` $\\approx ${Number(sm.volume).toFixed(4)}$` : ''}.`
                : `The ${sm.faces} walls Poincaré found at ${at} bound a region of finite area, meeting the circle at infinity only in cusps. It contains a Dirichlet domain of $\\Gamma$, which is discrete, so that domain has finite area too.`,
            'So $\\Gamma$ is a lattice, and arithmetic. As in Poincaré, the geometry is in floating point.',
        ]);
    } else if (infinite) {
        latticeDone(R, 'thin', `$\\Gamma$ has infinite ${what} at ${at}, by Poincaré.`, [
            ...intro, ...tried,
            `Poincaré’s Dirichlet domain at ${at} has infinite ${what}${f.kind === 'real' && sm.freeArcs ? `: ${plural(sm.freeArcs, 'free side')} at infinity` : ''}.`,
            '$\\Gamma$ is not a lattice, so $[\\Lambda : \\Gamma^{(2)}] = \\infty$: $\\Gamma$ is thin. As in Poincaré, the geometry is in floating point.',
        ]);
    } else {
        latticeDone(R, 'open', `Poincaré did not settle the ${what} of $\\Gamma$ at ${at}.`, [
            ...intro, ...tried,
            ok ? `Poincaré’s domain at ${at} is not in $\\mathrm{PGL}_2(\\mathbb{R})$ as written, so its area in $\\mathbb{H}^2$ is not measured.`
                : `Poincaré’s conditions were not verified at ${at}, so its ${what} is unknown. Raising the word length may help.`,
        ]);
    }
}

/**
 * [Λ : Γ] exactly, where it applies to a Γ discrete at its one place at ∞: over ℚ, in PGL₂(ℤ) by
 * Stallings folding (integral primitive generators with determinant ±1), finite or infinite; over
 * ℚ(√−1), ℚ(√−2), ℚ(√−3), in the Bianchi group by coset enumeration (generators in PGL₂(O) with
 * unit determinants), finite only. Returns null when it does not apply, else
 * { index | infinite | limit, group, groupTex, sub, method, ms }.
 */
function latticeIndexExact(R, factor) {
    const m = R.model, rows = m.mats.map((row) => row.map((e) => e.src));
    const t0 = Date.now();
    if (m.degree === 1 && factor.kind === 'real') {
        const mats = [];
        for (const row of rows) {
            const q = row.map((e) => /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(String(e)));
            if (q.some((x) => !x)) return null;
            const num = q.map((x) => BigInt(x[1])), den = q.map((x) => BigInt(x[2] || '1'));
            const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
            const L = den.reduce((l, d) => (l / gcd(l, d)) * d, 1n);
            let M = num.map((n, i) => n * (L / den[i]));
            const g = M.reduce((a, x) => gcd(a, x), 0n);
            M = M.map((x) => x / g);
            const dt = M[0] * M[3] - M[1] * M[2];
            if (dt !== 1n && dt !== -1n) return null;
            mats.push(M);
        }
        // Stallings folding in PSL₂(ℤ) = ℤ/2 ∗ ℤ/3 decides the index either way (stallings.js)
        let F;
        try { F = foldPGL2Z(mats); } catch (e) { return null; }
        const st = F.stats();
        const base = { group: 'PGL₂(ℤ)', groupTex: '\\mathrm{PGL}_2(\\mathbb{Z})', sub: 'Γ', method: 'Stallings folding', vertices: st.vertices, ms: Date.now() - t0 };
        return st.finiteIndex ? { ...base, index: st.vertices * (F.h0 ? 1 : 2) } : { ...base, infinite: true };
    }
    const d = m.degree === 2 && factor.kind === 'complex' ? bianchiRing(m.polySrc) : null;
    if (!d) return null;
    const gens = wordMatrices(d, rows, rows.map((_, i) => [i + 1]), m.polySrc);
    if (!gens || !unitDeterminants(d, gens)) return null;
    const r = indexInBianchi(d, gens, { seconds: 4, maxCosets: 400000 });
    const ringTex = { 1: '\\mathbb{Z}[i]', 2: '\\mathbb{Z}[\\sqrt{-2}]', 3: '\\mathbb{Z}[\\omega]' }[d];
    const base = { group: `PSL₂(${RINGS[d].name})`, groupTex: `\\mathrm{PSL}_2(${ringTex})`, sub: 'Γ ∩ PSL₂', method: 'coset enumeration', ms: Date.now() - t0 };
    return r.index ? { ...base, index: r.index } : { ...base, limit: r.limit || 'out of time' };
}

/**
 * Step 3's answer for a discrete Γ: kind 'arith' | 'thin' | 'nonarith' (a lattice at its place, of
 * infinite index in Λ) | 'open', the summary line and the proof.
 */
function latticeDone(R, kind, detail, lines, exact = null) {
    if (R !== run) return;
    const A = R.zariski.arith;
    const status = kind === 'open' ? 'open' : 'yes';
    R.sarith = { phase: 'done', status, lattice: { kind, lines, exact }, thin: kind === 'thin' || kind === 'nonarith', places: [], history: [], metric: R.settings.metric, head: '' };
    const head = { thin: 'Thin', nonarith: 'Not arithmetic', arith: A.ring.S.length ? 'S-arithmetic' : 'Arithmetic' }[kind] || 'Undecided';
    setStep('sarith', status, head, detail);
    renderVerdict();
    refreshView('sarith');
}

// ───────────────────────── step 3: arithmetic — coset enumeration, then FlashBeam ─────────────────────────

/** The places at ∞ where Γ is unbounded: one embedding of F over each place of k (real ones preferred). */
function archFactors(R) {
    // the Zariski engine decides exactly whether A splits at some place at ∞
    const archF = R.zariski.arith.spaces.factors.filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (!archF.length) return [];
    // over ℚ there is one place at ∞, and A splits there: Γ is unbounded there (short words may all be elliptic)
    if (R.model.degree === 1 && archF.length === 1) {
        const a = R.model.arch[0];
        return [{ re: a.root.re, im: a.root.im, kind: a.kind, n: a.n, key: a.key, labelTex: '\\mathbb{R}' }];
    }
    const byClass = new Map();
    for (const a of archClasses(R.model).filter((x) => x.noncompact)) {
        if (!byClass.has(a.classKey)) byClass.set(a.classKey, []);
        byClass.get(a.classKey).push(a);
    }
    // named as the places of step 2 (ℝ₁, ℂ₁, …: embeddings giving conjugate groups are one place)
    const named = (a) => {
        const pl = R.places.find((p) => p.tool === 'poincare' && (p.members || []).some((x) => x.key === a.key));
        return pl ? { labelTex: placeTexLabel(pl) } : { labelTex: a.kind === 'real' ? '\\mathbb{R}' : '\\mathbb{C}' };
    };
    return [...byClass.values()].map((g) => {
        const a = g.find((x) => x.kind === 'real' && x.isDefault) || g.find((x) => x.kind === 'real') || g.find((x) => x.isDefault) || g[0];
        return { re: a.root.re, im: a.root.im, kind: a.kind, n: a.n, key: a.key, ...named(a) };
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
        return { certifiable: false, note: '$\\Gamma$ is unbounded at no prime, so $X$ has no trees. Since $\\Gamma$ is not discrete at any one place at $\\infty$, it could only be a lattice in a product of at least two of them, as a Hilbert modular group is. Certifying finite covolume there is beyond this tool.' };
    }
    if (archF.length >= 2) {
        // O_k has infinitely many units: the stabilizer of o is checked by a lattice of unipotents at a cusp (cusps.js)
        return { certifiable: true, arch: { kind: 'multi', n: archF.length } };
    }
    if (!archF.length) return { certifiable: true, arch: null };
    if (factors.length !== 1) {
        return { certifiable: false, note: `The places at $\\infty$ of the field of definition where $\\Gamma$ is unbounded could not be matched with the one place of $k$ where $A$ splits: ${factors.length} classes were found.` };
    }
    const f = factors[0];
    if (archF[0].kind === 'real' && f.kind !== 'real') {
        return { certifiable: false, note: 'At the real place of $k$ where $A$ splits, the field of definition has only complex places. So $\\Gamma$ is conjugate into $\\mathrm{PGL}_2(\\mathbb{R})$ but not written there, and the area test needs it written there.' };
    }
    return { certifiable: true, arch: { kind: archF[0].kind, root: { re: f.re, im: f.im }, n: f.n, key: f.key, labelTex: f.labelTex } };
}



function startSarith(afterCusps = false) {
    const R = run, A = R.zariski.arith, m = R.model, st = R.settings;
    // exact first: coset enumeration in PGL₂(ℤ[1/S])
    const ex = m.degree === 1 ? exactIndexCheck(m.mats.map((row) => row.map((e) => e.src)), A.ring.S.map((x) => x.p)) : bianchiExact(m, A);
    if (ex && ex.index && ex.ring) {
        // over ℚ(√−1), ℚ(√−2), ℚ(√−3): coset enumeration in PGL₂(O[1/S])
        const Otex = RING_TEX[ex.ring], Stex = ex.S.map((x) => `(${ringEltTex(ex.ring, x)})`).join(', ');
        R.sarith = {
            phase: 'done', status: 'yes', exact: ex, places: [], history: [], metric: st.metric,
            head: [
                `Coset enumeration in $\\Lambda = \\mathrm{PGL}_2(\\mathcal{O}[1/S])$, with $\\mathcal{O} = ${Otex}$ and $S = \\{${Stex}\\}$, closes.`,
                `So $[\\Lambda : \\Gamma] = ${ex.index}$ exactly, and $\\Gamma$ is S-arithmetic.`,
            ],
        };
        const inv = ex.S.map((x) => `(${ringEltTex(ex.ring, x)})`).join('\\cdot ');
        setStep('sarith', 'yes', 'S-arithmetic', `$\\Gamma$ has index $${ex.index}$ in $\\mathrm{PGL}_2(${Otex}[1/${inv}])$, by coset enumeration (${ex.ms} ms).`);
        renderVerdict();
        if (!R.userPicked) showView('sarith', null, { auto: true });
        return;
    }
    if (ex && ex.index) {
        const Ltex = `\\mathrm{PGL}_2(\\mathbb{Z}[1/${ex.S.join('\\cdot ')}])`;
        R.sarith = {
            phase: 'done', status: 'yes', exact: ex, places: [], history: [], metric: st.metric,
            head: ex.kernelIndex > 1
                ? [
                    `The elements of $\\Gamma$ with even valuations at ${listTex(ex.bad)} form a subgroup $\\Gamma \\cap \\Lambda$ of index $${ex.kernelIndex}$ in $\\Gamma$, where $\\Lambda = ${Ltex}$.`,
                    `Coset enumeration in $\\Lambda$ closes, so $[\\Lambda : \\Gamma \\cap \\Lambda] = ${ex.index}$ exactly, and $\\Gamma$ is S-arithmetic.`,
                ]
                : [
                    `Coset enumeration in $\\Lambda = ${Ltex}$ closes.`,
                    `So $[\\Lambda : \\Gamma] = ${ex.index}$ exactly, and $\\Gamma$ is S-arithmetic.`,
                ],
        };
        setStep('sarith', 'yes', 'S-arithmetic', ex.kernelIndex > 1
            ? `The subgroup $\\Gamma \\cap ${Ltex}$, of index $${ex.kernelIndex}$ in $\\Gamma$, has index $${ex.index}$ in $${Ltex}$, by coset enumeration (${ex.ms} ms).`
            : `$\\Gamma$ has index $${ex.index}$ in $${Ltex}$, by coset enumeration (${ex.ms} ms).`);
        renderVerdict();
        if (!R.userPicked) showView('sarith', null, { auto: true });
        return;
    }
    // bounded at every prime, over a field with infinitely many units: a full lattice of unipotents
    // at one cusp makes Γ arithmetic (cusps.js, by Vaserstein's theorem)
    if (!afterCusps && vasersteinApplies(R)) { startCusps(R); return; }
    const factors = archFactors(R);
    const ap = sarithApplicable(R, factors);
    R.sarith = {
        exactTried: ex,
        phase: 'search', note: ap.note, certifiable: ap.certifiable, arch: ap.certifiable ? ap.arch : null,
        archFactors: factors, metric: st.metric, history: [], places: [], status: 'running',
    };
    if (!A.ring.S.length && !factors.length) {
        Object.assign(R.sarith, { phase: 'na', status: 'open', note: '$\\Gamma$ is bounded at every place, so there is nothing to search.' });
        setStep('sarith', 'open', 'Not applicable', R.sarith.note);
        renderVerdict();
        if (!R.userPicked) showView('sarith', null, { auto: true });
        return;
    }
    setStep('sarith', 'running', 'Searching…', 'FlashBeam is searching the adelic product of symmetric spaces.');
    R.sarith.head = ['FlashBeam is searching the adelic product.'];
    if (!R.userPicked) showView('sarith', 'covering', { auto: true });
    let worker;
    try {
        worker = new Worker(new URL(`./sarithWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' });
    } catch (e) {
        sarithError(R, 'module workers are unavailable here');
        return;
    }
    arithWorker(R, worker);
    R.sarith.worker = worker;
    const ep = R.arithEpoch, live = () => R === run && R.arithEpoch === ep;
    const stop = () => { dropWorker(R, worker); if (live()) R.sarith.worker = null; };
    const timer = setTimeout(() => { if (!live()) return; sarithError(R, 'the search did not stop in time'); stop(); }, (st.beamSeconds * MAX_STRETCH + 60) * 1000);
    worker.onmessage = (ev) => {
        if (!live()) return;
        const msg = ev.data.msg;
        if (msg.type === 'places') { R.sarith.places = msg.places; R.sarith.notes = msg.notes; refreshView('sarith'); }
        else if (msg.type === 'progress') {
            R.sarith.progress = msg;
            const frac = msg.targets ? msg.covered / msg.targets : 0;
            R.sarith.history.push({ it: msg.stats.iteration, frac, reps: msg.reps });
            const rel = `${msg.relations || 0} relation${msg.relations === 1 ? '' : 's'}`;
            const slow = msg.slow > 1.5
                ? ` The browser is running this search about ${Math.round(msg.slow)} times slower than at full speed, probably because the page is in the background, so its time budget is stretched to match.`
                : '';
            setStep('sarith', 'running', 'Searching…', (R.sarith.places.length
                ? `Iteration ${msg.stats.iteration}: ${msg.covered} of ${msg.targets} neighbours, ${msg.reps} representative${msg.reps === 1 ? '' : 's'}, ${rel}.`
                : `Iteration ${msg.stats.iteration}: ${rel}.`) + slow);
            patchSarith(msg.promoted);
        } else if (msg.type === 'error') {
            clearTimeout(timer); stop();
            sarithError(R, msg.error);
        } else if (msg.type === 'done') {
            clearTimeout(timer);
            // the worker stays up for the vertex orbits (over ℚ) and while the stabilizer may need more elements
            if (msg.status !== 'covered') msg.auto = autoCovering(R, msg);
            if (!orbitsApply(R) && !vasersteinApplies(R) && !((msg.status === 'covered' || msg.auto) && R.sarith.certifiable && R.sarith.arch)) stop();
            sarithDone(R, msg);
        } else if (msg.type === 'orbits') {
            const h = R.sarith.orbitsWaiting;
            R.sarith.orbitsWaiting = null;
            if (h) h(msg);
        } else if (msg.type === 'elements') {
            const h = R.sarith.elementsWaiting;
            R.sarith.elementsWaiting = null;
            if (h) h(msg);
        } else if (msg.type === 'stab') {
            const h = R.sarith.harvestWaiting;
            R.sarith.harvestWaiting = null;
            if (h) h(msg);
        }
    };
    worker.onerror = (e) => { e.preventDefault?.(); clearTimeout(timer); if (live()) sarithError(R, e.message || 'the worker failed to load'); };
    worker.postMessage({
        id: R.seq,
        job: {
            poly: m.degree > 1 ? m.polySrc : null,
            mats: m.mats.map((r) => r.map((e) => e.src)),
            S: A.ring.S.map((s) => ({ p: s.p, e: s.e, f: s.f })),
            sameField: m.degree === A.k.d,
            arch: factors.map((f) => ({ re: f.re, im: f.im, kind: f.kind })),
            metric: st.metric,
            opts: { beamWidth: st.beam, flashSize: st.flash, seconds: st.beamSeconds, maxReps: st.maxReps, maxStretch: MAX_STRETCH },
            calibMs: referenceMs(),
            stabCount: m.degree === 1 || factors.length >= 2 || (m.degree === 2 && bianchiRing(m.polySrc) && factors.some((f) => f.kind === 'complex')) ? EXACT_STAB_COUNT : 12,
        },
    });
}

/** Over ℚ(√−1), ℚ(√−2), ℚ(√−3) with S ≠ ∅: [PGL₂(O[1/S]) : Γ] by coset enumeration (bianchi.js; also batch/pipeline.mjs). */
function bianchiExact(m, A) {
    const d = m.degree === 2 && A.ring.S.length ? bianchiRing(m.polySrc) : null;
    if (!d) return null;
    const gens = wordMatrices(d, m.mats.map((row) => row.map((e) => e.src)), m.mats.map((_, i) => [i + 1]), m.polySrc);
    if (!gens) return null;
    const r = indexInPGL2OS(d, gens, { seconds: 4, maxCosets: 1500000 });
    return { index: r.index ?? null, limit: r.limit ?? null, error: r.error ?? null, S: r.S || [], kernelIndex: 1, ms: r.ms ?? null, ring: d };
}

const CUSP_SECONDS = 15;
/**
 * Where the cusp certificate applies (cusps.js; also batch/pipeline.mjs): A splits over the field of
 * definition, so an S-arithmetic Γ has unipotents, and O_S^× is infinite (S ≠ ∅, or a unit of infinite order).
 */
function vasersteinApplies(R) {
    const A = R.zariski && R.zariski.arith, m = R.model;
    if (!A || !m || A.k.d !== m.degree || !(A.A && A.A.split)) return false;
    return A.ring.S.length > 0 || (m.degree > 1 && m.signature[0] + m.signature[1] > 1);
}

/** The certificate found: Γ is S-arithmetic (Vaserstein; Benoist–Oh). source: 'generators' or 'FlashBeam's lowest elements'. */
function cuspFound(R, c, source) {
    const A = R.zariski.arith, S = A.ring.S;
    const where = c.cusp === 'inf' ? '$\\infty$' : 'a cusp';
    const Stex = S.map((x) => x.tex).join(', ');
    const what = S.length ? 'S-arithmetic' : 'arithmetic';
    const lattice = S.length && c.byTranslations
        ? [
            `There, the parabolics of $\\Gamma$ (starting from $${wordTex(c.parabolic, gName)}$) translate by a lattice of full rank $${c.d}$ in $K$.`,
            "Conjugating to put another cusp at $0$ gives every elementary matrix of some level $N\\mathcal{O}$, a subgroup of finite index in $\\mathrm{SL}_2(\\mathcal{O})$ by Vaserstein's theorem, since $\\mathcal{O}$ has infinitely many units.",
            `So the closure of $\\Gamma$ at each prime of $S = \\{${Stex}\\}$ is open; it is unbounded there, so it contains $\\mathrm{PSL}_2$ (an open unbounded subgroup of $\\mathrm{SL}_2$ of a local field is everything). Hence $\\Gamma$ has finitely many orbits on the trees, with stabilizers of finite index.`,
        ]
        : S.length
        ? [
            `There, the parabolic $${wordTex(c.parabolic, gName)}$ and the loxodromic $${wordTex(c.other, gName)}$, which fixes the same point, have multipliers whose primes cover $S = \\{${Stex}\\}$.`,
            'So the unipotents of $\\Gamma$ at that cusp form a subgroup of finite index in a fractional ideal of $\\mathcal{O}_S$.',
        ]
        : [`There, the parabolic $${wordTex(c.parabolic, gName)}$${c.other ? ` and the loxodromic $${wordTex(c.other, gName)}$, which fixes the same point,` : ''} give unipotents of $\\Gamma$ forming a lattice of rank $${c.d} = [K : \\mathbb{Q}]$.`];
    const prev = R.sarith || {};
    R.sarith = {
        ...prev, phase: 'done', status: 'yes', cusp: c, places: prev.places || [], history: prev.history || [], metric: R.settings.metric,
        head: c.byTranslations && S.length
            ? [`A search among ${source} found a cusp of $\\Gamma$ at ${where} whose unipotents have full rank${c.collisions ? `, partly from collisions of the cusp's orbit modulo its translations` : ''}.`, ...lattice, `So $\\Gamma$ has finite index in an S-arithmetic group: it is ${what}.`]
            : [
                `A search among ${source} found a cusp of $\\Gamma$ at ${where} whose unipotents have full rank${c.collisions ? `, partly from collisions of the cusp's orbit modulo its translations` : ''}.`,
                ...lattice,
                'Conjugating that cusp to $\\infty$ and another cusp to $0$, $\\Gamma$ contains every elementary matrix of some level $\\mathfrak{q}$.',
                "By Vaserstein's theorem, these generate a subgroup of finite index in $\\mathrm{SL}_2(\\mathcal{O}_S)$, since $\\mathcal{O}_S$ has infinitely many units.",
                `$\\Gamma$ is discrete in the product of the places where it is unbounded, so it is a lattice there, and $\\Gamma$ is ${what}. Benoist–Oh's criterion for products of $\\mathrm{SL}_2$ gives the same conclusion.`,
            ],
    };
    setStep('sarith', 'yes', S.length ? 'S-arithmetic' : 'Arithmetic', `The unipotents of $\\Gamma$ at ${where} have full rank${c.byTranslations && S.length ? `, $${c.d}$, with $S = \\{${Stex}\\}$` : S.length ? ` over $\\mathcal{O}_S$, with $S = \\{${Stex}\\}$` : `, namely $${c.d}$`}, from ${source} (${(c.ms / 1000).toFixed(1)} s), so $\\Gamma$ is ${what} by Vaserstein's theorem.`);
    renderVerdict();
    refreshView('sarith');
}

/** The cusp certificate in a worker: on Γ (generators), or on a pool of words. Calls back with the result or null. */
function cuspJob(R, extra, cb) {
    const m = R.model;
    let worker;
    try { worker = new Worker(new URL(`./cuspWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' }); }
    catch (e) { cb(null); return; }
    arithWorker(R, worker);
    const ep = R.arithEpoch;
    const done = (msg) => { clearTimeout(timer); dropWorker(R, worker); if (R === run && R.arithEpoch === ep) cb(msg && msg.result ? msg.result : null); };
    const timer = setTimeout(() => done(null), (CUSP_SECONDS + 20) * 1000);
    worker.onmessage = (ev) => done(ev.data);
    worker.onerror = (e) => { e.preventDefault?.(); done(null); };
    worker.postMessage({ id: R.seq, gens: m.mats.map((r) => r.map((e) => e.src)), poly: m.poly.map(String), root: m.roots[m.defaultIndex], maxElements: 40000, seconds: CUSP_SECONDS, ...extra });
}

function startCusps(R) {
    R.sarith = { phase: 'search', status: 'running', places: [], history: [], metric: R.settings.metric, head: ['Looking for a cusp of $\\Gamma$ whose unipotents form a lattice.'] };
    setStep('sarith', 'running', 'Cusps…', 'Looking for a cusp whose unipotents in $\\Gamma$ have full rank, as Vaserstein’s theorem needs.');
    if (!R.userPicked) showView('sarith', null, { auto: true });
    cuspJob(R, {}, (c) => {
        if (c && c.found) { cuspFound(R, c, 'short words in the generators'); return; }
        R.cuspTried = c || { found: false };
        startSarith(true);
    });
}

/** Before giving up after FlashBeam: the cusp certificate on its lowest elements (then onFail). */
function archiveCusps(R, onFail) {
    const S = R.sarith;
    if (S.archiveTried || !vasersteinApplies(R) || !S.worker) { onFail(); return; }
    S.archiveTried = true;
    setStep('sarith', 'running', 'Cusps…', 'Looking for a lattice of unipotents at a cusp among FlashBeam’s lowest elements.');
    S.elementsWaiting = (msg) => {
        if (S.worker) { dropWorker(R, S.worker); S.worker = null; }
        cuspJob(R, { pool: msg.words || [] }, (c) => { if (c && c.found) cuspFound(R, c, 'FlashBeam’s lowest elements'); else onFail(); });
    };
    S.worker.postMessage({ id: R.seq, cmd: 'elements', count: 20000 });
}

function sarithError(R, err) {
    if (R !== run) return;
    Object.assign(R.sarith, { phase: 'done', status: 'open', error: err, head: ['The search stopped without a certificate.'] });
    setStep('sarith', 'open', 'Stopped', `The search stopped: ${String(err).replace(/\$/g, '')}.`);
    renderVerdict();
    refreshView('sarith');
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Over ℚ: the vertex orbits on ∏T_p with exact Stallings stabilizers (orbits.js, in the worker). */
const ORBIT_SECONDS = 30;
function orbitsApply(R) { return !!(R.model && R.model.degree === 1 && R.zariski.arith.ring.S.length); }

function runOrbits(R, msg) {
    const S = R.sarith;
    setStep('sarith', 'running', 'Vertex orbits…', msg.status === 'covered'
        ? 'Closing up the covering, with exact stabilizers by Stallings folding in $\\mathrm{PGL}_2(\\mathbb{Z})$.'
        : 'Enumerating the vertex orbits on the trees, with exact stabilizers by Stallings folding in $\\mathrm{PGL}_2(\\mathbb{Z})$.');
    refreshView('sarith');
    S.orbitsWaiting = (o) => {
        if (R !== run) return;
        S.orbits = o;
        S.orbitsDone = true;
        const stopWorker = () => { if (S.worker) { dropWorker(R, S.worker); S.worker = null; } };
        const Ltex = `\\mathrm{PGL}_2(\\mathbb{Z}[1/${R.zariski.arith.ring.S.map((x) => x.p).join('\\cdot ')}])`;
        const sub = o.kernelIndex > 1 ? `the subgroup of index $${o.kernelIndex}$ in $\\Gamma$ of elements with even valuations at the other primes` : '$\\Gamma$';
        const secs = `${(o.ms / 1000).toFixed(1)} s`;
        if (o.verdict === 'sarith') {
            stopWorker();
            Object.assign(S, { phase: 'done', status: 'yes' });
            S.head = [
                `${cap(sub)} has ${plural(o.reps, 'orbit')} on the vertices of the trees.`,
                'Its vertex stabilizers were computed exactly, by Stallings folding in $\\mathrm{PGL}_2(\\mathbb{Z})$ closed under the edge and square relations of $\\prod T_p$, and they have finite index.',
                `So $[${Ltex} : ${o.kernelIndex > 1 ? '\\Gamma\\cap' + Ltex : '\\Gamma'}] = ${o.index}$ exactly, and $\\Gamma$ is S-arithmetic.`,
            ];
            setStep('sarith', 'yes', 'S-arithmetic', `${o.kernelIndex > 1 ? `A subgroup of index $${o.kernelIndex}$ in $\\Gamma$` : '$\\Gamma$'} has index $${o.index}$ in $${Ltex}$: it has ${plural(o.reps, 'vertex orbit')}, with exact stabilizers (${secs}).`);
            renderVerdict(); refreshView('sarith');
            return;
        }
        if (o.verdict === 'thin' && o.finiteStabilizers) {
            stopWorker();
            Object.assign(S, { phase: 'done', status: 'yes', thin: true });
            const one = R.zariski.arith.ring.S.length === 1;
            const p0 = R.zariski.arith.ring.S[0].p;
            S.head = [
                `${cap(sub)} has ${plural(o.reps, 'orbit')} on the vertices of the trees, and its vertex stabilizers are finite, by Stallings folding in $\\mathrm{PGL}_2(\\mathbb{Z})$.`,
                'So it acts properly and cocompactly on $\\prod T_p$.',
                one ? `Hence $\\Gamma$ is discrete at $${p0}$ and virtually free.` : 'Hence $\\Gamma$ is discrete in the product of the trees.',
                `It has infinite index in $${Ltex}$, so $\\Gamma$ is thin.`,
            ];
            setStep('sarith', 'yes', 'Thin', `$\\Gamma$ has ${plural(o.reps, 'vertex orbit')} with finite stabilizers, so it is ${one ? `discrete at $${p0}$ and virtually free` : 'discrete in $\\prod_p \\mathrm{PGL}_2(\\mathbb{Q}_p)$'} (${secs}).`);
            renderVerdict(); refreshView('sarith');
            return;
        }
        if (o.verdict === 'thin') {
            stopWorker();
            Object.assign(S, { phase: 'done', status: 'yes', thin: true });
            const inf = (o.groups || []).filter((g) => !g.finite).length;
            S.head = [
                `${cap(sub)} has ${plural(o.reps, 'orbit')} on the vertices of the trees.`,
                'Its vertex stabilizers were computed exactly, as finitely generated subgroups of $\\mathrm{PGL}_2(\\mathbb{Z})$, by Stallings folding.',
                `${inf === 1 ? 'One of them has' : `${inf} of them have`} infinite index in $\\mathrm{PGL}_2(\\mathbb{Z})$.`,
                `So $\\Gamma$ has infinite index in $${Ltex}$, and $\\Gamma$ is thin.`,
            ];
            setStep('sarith', 'yes', 'Thin', `$\\Gamma$ has ${plural(o.reps, 'vertex orbit')}, and ${inf === 1 ? 'one stabilizer has' : `${inf} stabilizers have`} infinite index in $\\mathrm{PGL}_2(\\mathbb{Z})$ (${secs}).`);
            renderVerdict(); refreshView('sarith');
            return;
        }
        if (!((msg.status === 'covered' || msg.auto) && S.certifiable && S.arch)) stopWorker();
        sarithDone(R, msg);
    };
    S.worker.postMessage({ id: R.seq, cmd: 'orbits', rows: R.model.mats.map((r) => r.map((e) => e.src)), S: R.zariski.arith.ring.S.map((x) => x.p), seconds: ORBIT_SECONDS });
}

/**
 * The vertex orbits without a covering. Theorem: let Γ ⊂ PGL₂(k), k the invariant trace field, be
 * Zariski dense (so dense in Res_{k/ℚ} PGL₂), S the primes where it is unbounded, and suppose an
 * element of infinite order fixes o. Then Γ is not discrete in G_S = ∏_{𝔭∈S} PGL₂(k_𝔭), and its
 * closure H there is open: near 1, H is a product over the residue characteristics p of p-adic Lie
 * groups, whose Lie algebras are Ad(Γ)-invariant, hence ideals of ⊕_{𝔭|p} 𝔰𝔩₂(k_𝔭); a missing
 * factor 𝔭 would make the elements of Γ near 1 trivial at 𝔭, hence trivial, and Γ discrete. An open
 * subgroup of G_S unbounded in every factor contains ∏ PSL₂(k_𝔭), and Γ has the orbits of H
 * (H = Γ·H_v), so its vertex orbits on X are the classes of vertex types its determinants allow:
 * the representatives FlashBeam starts from. Returns infiniteOrderWord's { word, why } or null.
 */
function autoCovering(R, msg) {
    const A = R.zariski && R.zariski.arith, m = R.model, S = R.sarith;
    if (!A || !m || m.degree !== A.k.d || !S || !S.certifiable || !S.arch || !msg.stab || !msg.stab.length) return null;
    try { return infiniteOrderWord(m.mats.map((r) => r.map((e) => e.src)), m.poly, msg.stab.map((e) => e.word)); } catch (e) { return null; }
}

function autoCoveringLines(R, msg) {
    const a = msg.auto;
    return [
        `It did not finish covering the trees (${msg.covered} of the ${msg.targets} neighbours), but the element $${wordTex(a.word, gName)}$ fixes $o$ and has infinite order (${a.why === 'parabolic' ? 'it is parabolic' : '$\\mathrm{tr}^2/\\det$ lies outside $[0, 4]$ at some place at $\\infty$'}).`,
        'So $\\Gamma$ is not discrete in $G_S = \\prod_{\\mathfrak{p} \\in S} \\mathrm{PGL}_2(k_\\mathfrak{p})$. It is Zariski dense in $\\mathrm{Res}_{k/\\mathbb{Q}} \\mathrm{PGL}_2$, so the Lie algebra of its closure $H$ is an ideal of $\\bigoplus_\\mathfrak{p} \\mathfrak{sl}_2(k_\\mathfrak{p})$, and a missing factor would make $\\Gamma$ discrete: $H$ is open.',
        'An open subgroup of $G_S$ that is unbounded at every $\\mathfrak{p}$ contains $\\prod_\\mathfrak{p} \\mathrm{PSL}_2(k_\\mathfrak{p})$, and $\\Gamma$ has the vertex orbits of $H$. So the orbits are the classes of vertex types that the determinants of $\\Gamma$ allow, the representatives the search starts from: no covering is needed.',
    ];
}

function sarithDone(R, msg) {
    const S = R.sarith;
    S.result = msg;
    const L = liveNumbers(S);
    if (!S.orbitsDone) S.history.push({ it: L.it, frac: L.frac, reps: L.reps });
    const D = msg.dirichlet;
    S.found = `${plural(D.pairs.length, 'Dirichlet generator')} and ${plural(msg.relations.length, 'relation')}`;
    if (orbitsApply(R) && !S.orbitsDone && S.worker) { runOrbits(R, msg); return; }
    if (!S.certifiable) {
        if (!S.archiveTried && vasersteinApplies(R) && S.worker) { archiveCusps(R, () => sarithDone(R, msg)); return; }
        Object.assign(S, { phase: 'done', status: 'open' });
        S.head = [`FlashBeam found ${S.found} in $X$.`, ...mathLines(S.note)];
        setStep('sarith', 'open', 'No certificate', `FlashBeam found ${S.found}, but no certificate applies here. ${S.note}`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    if (msg.auto && S.arch) {
        // the vertex orbits by the theorem (autoCovering): it remains to check the stabilizer of o
        S.auto = msg.auto;
        S.phase = 'stab';
        S.head = [`FlashBeam found ${S.found}.`, ...autoCoveringLines(R, msg), 'It remains to show that the stabilizer of $o$ is a lattice at $\\infty$.'];
        setStep('sarith', 'running', 'Checking the stabilizer…', 'The vertex orbits are known (an element of infinite order fixes $o$); checking the elements that fix $o$.');
        renderVerdict();
        refreshView('sarith');
        stabilizerCheck(R, msg.stab, 0);
        return;
    }
    if (msg.status !== 'covered' || !(msg.verify && msg.verify.ok)) {
        if (!S.archiveTried && vasersteinApplies(R) && S.worker) { archiveCusps(R, () => sarithDone(R, msg)); return; }
        Object.assign(S, { phase: 'done', status: 'open' });
        S.head = msg.status === 'covered'
            ? [`FlashBeam found ${S.found}.`, 'It also found a covering of the trees, but the covering did not survive the exact re-check, so nothing is claimed.']
            : [
                `FlashBeam found ${S.found}.`,
                `It found no covering of the trees within its budget: after ${msg.iterations} iterations and ${msg.seconds.toFixed(0)} s, ${plural(msg.reps.length, 'representative')} cover ${msg.covered} of the ${msg.targets} neighbours.`,
                ...(msg.slow > 1.5 ? [`The browser ran the search about ${Math.round(msg.slow)} times slower than at full speed, so the time budget was stretched, by at most ${MAX_STRETCH} times. Keeping the page in front, or raising the seconds in the settings, gives it more room.`] : []),
                'Nothing is claimed: $\\Gamma$ may still be S-arithmetic, or it may be thin.',
            ];
        setStep('sarith', 'open', 'No certificate', `FlashBeam found ${S.found}, and ${plural(msg.reps.length, 'representative')} cover ${msg.covered} of the ${msg.targets} neighbours in the trees, which is not a certificate.`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    const nR = msg.reps.length;
    if (!S.arch) {
        Object.assign(S, { phase: 'done', status: 'yes' });
        S.head = [
            `FlashBeam found ${S.found}, and a covering of the trees by ${plural(nR, 'representative')}, checked again exactly.`,
            `So $\\Gamma$ has at most ${plural(nR, 'orbit')} on the vertices of the trees.`,
            'The quaternion algebra $A$ is ramified at every place at $\\infty$, so the vertex stabilizers in $\\Lambda$ are finite.',
            'Hence $[\\Lambda : \\Gamma^{(2)}] < \\infty$, and $\\Gamma$ is S-arithmetic.',
        ];
        setStep('sarith', 'yes', 'S-arithmetic', `FlashBeam covered the trees with ${plural(nR, 'representative')}, checked again exactly, and the vertex stabilizers are finite.`);
        renderVerdict();
        refreshView('sarith');
        return;
    }
    // the stabilizer of o must have finite covolume at the place at ∞
    S.phase = 'stab';
    S.head = [
        `FlashBeam found ${S.found}, and a covering of the trees by ${plural(nR, 'representative')}, checked again exactly.`,
        'It remains to show that the stabilizer of $o$ is a lattice at $\\infty$.',
    ];
    setStep('sarith', 'running', 'Checking the stabilizer…', 'Poincaré is checking the elements that fix $o$.');
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
const EXACT_STAB_COUNT = 400;

/** The Euclidean Bianchi ring (bianchi.js) when Γ lives over ℚ(√−1), ℚ(√−2) or ℚ(√−3) and A splits at its complex place. */
function bianchiOf(R) {
    const S = R.sarith;
    return R.model && R.model.degree === 2 && S && S.arch && S.arch.kind === 'complex' ? bianchiRing(R.model.polySrc) : null;
}

/**
 * Exact checks that the elements found fixing o generate a subgroup of finite index in Λ_o, by
 * coset enumeration:
 *   · over ℚ with A split at the real place, Λ_o is PGL₂(ℤ): if every element found is in GL₂(ℤ)
 *     (det ±1 in its integral form), modularIndex.js;
 *   · over ℚ(√−1), ℚ(√−2), ℚ(√−3) with A split at the complex place, in the Bianchi group PSL₂(O)
 *     (bianchi.js), for the elements whose determinant is a unit.
 * Returns null when no check applies, else { ok, index, used, limit, group }.
 */
function exactStabCheck(R, stab) {
    const S = R.sarith;
    if (!R.model || !S.arch || !stab.length) return null;
    const d = bianchiOf(R);
    if (d) {
        const mats = wordMatrices(d, R.model.mats.map((row) => row.map((e) => e.src)), stab.map((e) => e.word), R.model.polySrc);
        if (!mats) return null;
        const r = indexInBianchi(d, mats, { seconds: 4, maxCosets: 400000 });
        const group = `PSL₂(${RINGS[d].name})`, groupTex = `\\mathrm{PSL}_2(${RING_TEX[d]})`;
        return r.index ? { ok: true, index: r.index, used: stab, group, groupTex } : { ok: false, used: stab, limit: r.limit, group, groupTex };
    }
    if (R.model.degree !== 1 || S.arch.kind !== 'real') return null;
    const mats = [];
    for (const e of stab) {
        const m = e.tex.map((t) => String(t).trim());
        if (!m.every((x) => /^-?\d+$/.test(x))) return null;
        const M = m.map(BigInt), dt = M[0] * M[3] - M[1] * M[2];
        if (dt !== 1n && dt !== -1n) return null;
        mats.push(M);
    }
    const r = indexInPGL2Z(mats, { seconds: 2, maxCosets: 300000 });
    const group = 'PGL₂(ℤ)', groupTex = '\\mathrm{PGL}_2(\\mathbb{Z})';
    return r.index ? { ok: true, index: r.index, used: stab, group, groupTex } : { ok: false, used: stab, limit: r.limit || r.error, group, groupTex };
}

function requestHarvest(R, attempt) {
    const S = R.sarith;
    if (!S.worker) { finishStab(R, false); return; }
    S.stab = { ...(S.stab || {}), status: 'running', harvesting: true };
    setStep('sarith', 'running', 'Collecting more of $\\Gamma_o$…', `FlashBeam continues, weighted towards elements that fix $o$ (round ${attempt}).`);
    refreshView('sarith');
    S.harvestWaiting = (msg) => {
        if (R !== run) return;
        S.stabFound = msg.stabFound;
        stabilizerCheck(R, msg.stab, attempt);
    };
    S.worker.postMessage({ id: R.seq, cmd: 'harvest', seconds: HARVEST_SECONDS, stabCount: R.model.degree === 1 || bianchiOf(R) || (R.sarith.arch && R.sarith.arch.kind === 'multi') ? EXACT_STAB_COUNT : STAB_SIZES[attempt] + 4 });
}

function stabilizerCheck(R, stab, attempt) {
    const S = R.sarith;
    if (S.arch.kind === 'multi') { cuspStabCheck(R, stab, attempt); return; }
    if (!stab.length) {
        if (attempt + 1 < STAB_SIZES.length) { requestHarvest(R, attempt + 1); return; }
        S.stab = { status: 'none', lines: ['The search found no element of $\\Gamma$, other than the identity, that fixes $o$.'] };
        finishStab(R, false);
        return;
    }
    const ex = exactStabCheck(R, stab);
    if (ex && ex.ok) {
        S.stab = {
            status: 'yes', exact: true, used: ex.used, index: ex.index, group: ex.group, groupTex: ex.groupTex,
            lines: ex.group === 'PGL₂(ℤ)'
                ? [
                    'Coset enumeration in $\\mathrm{PGL}_2(\\mathbb{Z})$ closes, and the table was checked again.',
                    `So the ${ex.used.length} elements found fixing $o$ generate a subgroup of index $${ex.index}$ in $\\mathrm{PGL}_2(\\mathbb{Z})$, exactly.`,
                    'Hence $\\Gamma_o$ has finite index in $\\Lambda_o = \\mathrm{PGL}_2(\\mathbb{Z})$.',
                ]
                : [
                    `Coset enumeration in the Bianchi group $${ex.groupTex}$ closes, and the table was checked again; the presentation used is Poincaré’s, from its Dirichlet domain.`,
                    `So the elements found fixing $o$ meet $${ex.groupTex}$ in a subgroup of index $${ex.index}$, exactly.`,
                    'Hence $\\Gamma_o$ has finite index in $\\Lambda_o$, a lattice in $\\mathrm{PSL}_2(\\mathbb{C})$.',
                ],
        };
        finishStab(R, true);
        return;
    }
    if (ex) S.stabExactTried = ex;          // (S.exactTried is the coset enumeration in PGL₂(ℤ[1/S]))
    const used = stab.slice(0, STAB_SIZES[attempt]);
    const consts = R.model.degree > 1 ? [{ name: 'w', poly: R.model.polyTex, near: { re: S.arch.root.re, im: S.arch.root.im } }] : [];
    const state = { mats: used.map((e) => e.tex), anti: used.map(() => false), consts };
    S.stab = { status: 'running', used, state };
    refreshView('sarith');
    const ep = R.arithEpoch;
    runArch(R, state, { certify: false, pool: R.arithWorkers }, (out) => {
        if (R !== run || R.arithEpoch !== ep) return;
        const sm = out.summary;
        const ok = sm && sm.status === 'verified' && (S.arch.kind === 'real' ? sm.finiteArea : sm.finiteVolume);
        if (ok) {
            S.stab = {
                status: 'yes', used, state, summary: sm,
                lines: S.arch.kind === 'real'
                    ? [
                        `Their Dirichlet domain has ${plural(sm.faces, 'side')}${sm.cusps ? ` and ${plural(sm.cusps, 'cusp')}` : ''}, and it satisfies Poincaré's conditions${sm.exactUsed ? ', with the relations checked exactly' : ''}.`,
                        'It meets the circle at infinity only in cusps, so their group is Fuchsian of finite area.',
                        'As in Poincaré, the geometry is in floating point.',
                    ]
                    : [
                        `Their Dirichlet domain has ${plural(sm.faces, 'face')}, and it satisfies Poincaré's conditions${sm.exactUsed ? ', with the relations checked exactly' : ''}.`,
                        `It has finite volume${sm.volume != null ? ` $\\approx ${Number(sm.volume).toFixed(4)}$` : ''}.`,
                        'As in Poincaré, the geometry is in floating point.',
                    ],
            };
            finishStab(R, true);
        } else if (attempt + 1 < STAB_SIZES.length) {
            requestHarvest(R, attempt + 1);
        } else {
            let why;
            if (out.timeout) why = `Poincaré took longer than ${ARCH_TIMEOUT} s.`;
            else if (out.error) why = `Poincaré failed: ${String(out.error).replace(/\$/g, '')}.`;
            else if (sm && sm.status === 'verified') why = S.arch.kind === 'real' ? `Their Dirichlet domain is verified, but it has ${plural(sm.freeArcs, 'free side')} at infinity, so it has infinite area.` : 'Their Dirichlet domain is verified, but it has infinite volume.';
            else why = 'Poincaré’s conditions did not close up for these elements at this word length.';
            S.stab = { status: 'no', used, state, summary: sm, lines: [why, 'Their group may have infinite index in $\\Lambda_o$, or the search may not have found enough of $\\Gamma_o$.'] };
            finishStab(R, false);
        }
    });
}

/** A split at ≥ 2 places at ∞: a full lattice of unipotents at a cusp of ⟨elements fixing o⟩ (cusps.js, in a worker). */
function cuspStabCheck(R, stab, attempt) {
    const S = R.sarith, m = R.model;
    const next = () => { if (attempt + 1 < STAB_SIZES.length) requestHarvest(R, attempt + 1); else { S.stab = { status: 'no', used: stab, lines: ['The elements found fixing $o$ show no full lattice of unipotents at a cusp.'] }; finishStab(R, false); } };
    if (!stab.length) { next(); return; }
    S.stab = { status: 'running', used: stab };
    setStep('sarith', 'running', 'Checking the stabilizer…', 'Looking for a lattice of unipotents at a cusp among the elements that fix $o$.');
    refreshView('sarith');
    let worker;
    try { worker = new Worker(new URL(`./cuspWorker.js?v=${VERSION}`, import.meta.url), { type: 'module' }); }
    catch (e) { next(); return; }
    arithWorker(R, worker);
    const ep = R.arithEpoch;
    const done = (msg) => {
        clearTimeout(timer); dropWorker(R, worker);
        if (R !== run || R.arithEpoch !== ep) return;
        const c = msg && msg.result;
        if (c && c.found) {
            S.stab = { status: 'yes', cusp: true, used: stab, rank: c.rank, lines: [
                `The ${stab.length} elements found fixing $o$ generate a group whose unipotents at a cusp form a lattice of rank $${c.rank} = [K : \\mathbb{Q}]$.`,
                "So that group contains every elementary matrix of some level, and by Vaserstein's theorem it has finite index in $\\mathrm{PGL}_2(\\mathcal{O}_K)$.",
                'Hence $\\Gamma_o$ has finite index in $\\Lambda_o$.',
            ] };
            finishStab(R, true);
        } else next();
    };
    const timer = setTimeout(() => done({ error: 'no answer in time' }), 40000);
    worker.onmessage = (ev) => done(ev.data);
    worker.onerror = (e) => { e.preventDefault?.(); done({ error: e.message }); };
    worker.postMessage({ id: R.seq, gens: m.mats.map((r) => r.map((e) => e.src)), poly: m.poly.map(String), words: stab.map((e) => e.word), root: m.roots[m.defaultIndex], maxElements: 40000, seconds: 10 });
}

function finishStab(R, ok) {
    const S = R.sarith;
    if (!ok && !S.archiveTried && vasersteinApplies(R) && S.worker) { archiveCusps(R, () => finishStab(R, false)); return; }
    if (S.worker) { dropWorker(R, S.worker); S.worker = null; }
    const nR = S.result.reps.length;
    S.phase = 'done';
    if (ok) {
        S.status = 'yes';
        const found = S.auto ? `FlashBeam found ${S.found}.` : `FlashBeam found ${S.found}, and a covering of the trees by ${plural(nR, 'representative')}, checked again exactly.`;
        const orbits = S.auto ? autoCoveringLines(R, S.result) : `So $\\Gamma$ has at most ${plural(nR, 'orbit')} on the vertices of the trees.`;
        const stab = S.stab.cusp
            ? "The elements found fixing $o$ contain a full lattice of unipotents at a cusp, so by Vaserstein's theorem they generate a subgroup of finite index in $\\Lambda_o$, since $\\mathcal{O}_K$ has infinitely many units."
            : S.stab.exact
            ? (S.stab.group === 'PGL₂(ℤ)'
                ? `The elements found fixing $o$ generate a subgroup of index $${S.stab.index}$ in $\\Lambda_o = \\mathrm{PGL}_2(\\mathbb{Z})$, by coset enumeration.`
                : `The elements found fixing $o$ meet the Bianchi group $${S.stab.groupTex}$ in a subgroup of index $${S.stab.index}$, by coset enumeration.`)
            : `The stabilizer of $o$ has finite ${S.arch.kind === 'real' ? 'area' : 'covolume'} at $\\infty$, so it has finite index in $\\Lambda_o$.`;
        S.head = [found, ...[].concat(orbits), stab, 'Hence $[\\Lambda : \\Gamma^{(2)}] < \\infty$, and $\\Gamma$ is S-arithmetic.'];
        setStep('sarith', 'yes', 'S-arithmetic', `${S.auto ? 'An element of infinite order fixes $o$, so the vertex orbits are the vertex types (no covering needed)' : `FlashBeam covered the trees with ${plural(nR, 'representative')}`}, and ${S.stab.cusp
            ? `the elements fixing $o$ contain unipotents of rank $${S.stab.rank}$ at a cusp`
            : S.stab.exact
            ? `the elements fixing $o$ have index $${S.stab.index}$ in $${S.stab.groupTex}$`
            : 'the stabilizer of $o$ is a lattice at $\\infty$'}.`);
    } else {
        S.status = 'open';
        S.head = S.auto
            ? [`FlashBeam found ${S.found}.`, ...autoCoveringLines(R, S.result), 'But the stabilizer of $o$ was not shown to be a lattice at $\\infty$, so there is no certificate.']
            : [
                `FlashBeam found ${S.found}, and a covering of the trees by ${plural(nR, 'representative')}.`,
                'But the stabilizer of $o$ was not shown to be a lattice at $\\infty$, so there is no certificate.',
            ];
        setStep('sarith', 'open', 'No certificate', S.auto
            ? 'The vertex orbits are known (an element of infinite order fixes $o$), but the stabilizer of $o$ was not shown to be a lattice at $\\infty$.'
            : 'FlashBeam covered the trees, but the stabilizer of $o$ was not shown to be a lattice at $\\infty$.');
    }
    renderVerdict();
    refreshView('sarith');
}

// ───────────────────────── the verdict ─────────────────────────

/**
 * The summary's first line names what Γ is shown to be: algebraic (not Zariski dense), geometric
 * (discrete at some place), arithmetic; "undecided" when none is shown, and "thin" when step 3 proves
 * infinite index with no place discrete. While steps run and nothing is shown yet, it says what is
 * running. The line under it says how, and what is still open.
 */
function verdict() {
    const R = run;
    if (!R) return null;
    if (R.error) return { cls: 'open', head: R.error };
    const z = R.steps.zariski, p = R.steps.places, s = R.steps.sarith;
    if (z.status === 'info') {
        const C = R.zariski.closure;
        const E = R.elementary && R.elementary.status === 'done' ? R.elementary.result : null;
        const iso = E && !E.finite && E.structure && E.structure !== '1' ? ` $\\Gamma \\cong ${E.structure}$${E.finitelyPresented === false ? ', not finitely presented' : ''}.` : '';
        return { cls: 'info', head: '$\\Gamma$ is algebraic.', sub: `Its Zariski closure is $${C.tex}$.${iso} ${summaryTex(C.summary)}` };
    }
    const A = R.zariski && R.zariski.ok ? R.zariski.arith : null;
    const Ltex = A ? A.head.replace(/^.*\\le /, '') : '';
    const placesBusy = p.status === 'running' || p.status === 'idle';
    const zNote = z.status === 'running' ? ' Computing the Zariski closure, which step 3 needs…'
        : z.status === 'open' ? ` Step 1 failed (${z.detail}), so whether $\\Gamma$ is arithmetic is not decided.` : '';
    const still = placesBusy ? ' Discreteness at each place is still being decided.' : '';
    const order = placeOrder(R).filter((x) => x.status === 'discrete');
    const arithmetic = s.status === 'yes' && !(R.sarith && R.sarith.thin);
    if (order.length) {
        const [best, ...rest] = order;
        const where = `At $${placeTexLabel(best)}$: ${best.headline}.${rest.length ? ` Also discrete at ${placeList(rest)}.` : ''}`;
        const head = arithmetic ? '$\\Gamma$ is geometric and arithmetic.' : '$\\Gamma$ is geometric.';
        const sub = s.status === 'yes' ? `${where} ${s.detail}`
            : s.status === 'running' ? `${where} Deciding whether it is arithmetic…`
                : s.status === 'open' ? `${where} Whether $\\Gamma$ is arithmetic is undecided. ${s.detail}`
                    : `${where}${zNote}`;
        return { cls: 'yes', head, sub, place: best };
    }
    if (arithmetic) return { cls: 'yes', head: '$\\Gamma$ is arithmetic.', sub: `$\\Gamma^{(2)}$ has finite index in $${Ltex}$ (up to conjugation). ${s.detail}${still}` };
    if (s.status === 'yes') return { cls: 'yes', head: '$\\Gamma$ is thin.', sub: `It is Zariski dense, with infinite index in $${Ltex}$, and no place is known where it is discrete. ${s.detail}${still}` };
    // nothing shown yet: what is running
    if (z.status === 'running') return { cls: '', head: placesBusy ? 'Computing the Zariski closure, and deciding discreteness at every place…' : 'Computing the Zariski closure…', sub: placesBusy ? '' : `${p.head}. ${p.detail}` };
    if (s.status === 'running') return { cls: '', head: placesBusy ? 'Deciding discreteness at every place, and whether $\\Gamma$ is arithmetic…' : 'Not discrete at any one place. Deciding whether it is arithmetic…' };
    if (placesBusy) return { cls: '', head: 'Deciding discreteness at every place…', sub: s.status === 'open' ? `The search for an arithmetic certificate stopped: ${s.detail}` : '' };
    if (s.status === 'idle' && z.status !== 'open') return { cls: '', head: 'Deciding whether $\\Gamma$ is arithmetic…' };
    // nothing shown, and nothing left running
    return { cls: 'open', head: '$\\Gamma$ is undecided.', sub: z.status === 'open' ? `Step 1 failed: ${z.detail}. ${p.head}. ${p.detail}` : `${p.head}. ${p.detail} ${s.detail}` };
}


// ───────────────────────── the result cards ─────────────────────────

function setStageStatus(text) { const el = $('compute-status'); el.innerHTML = mix(text); typeset(el); }

// ───────────────────────── the presentation at the top ─────────────────────────

const gName = (i) => `g_{${i}}`;
/** A relator of poincare's presentation { enc, m } in TeX (as presentation.js's presentationTex). */
function relatorTex(R, orders = new Map()) {
    // a relator and its inverse say the same: write the one with fewer inverse letters (torsion
    // generators with their exponents reduced, so an involution is never written inverted)
    let enc = orientRelator(R.enc, orders), m = R.m;
    // a proper power u^k is written (u)^k
    for (let d = 1; d < enc.length; d++) {
        if (enc.length % d || enc.some((x, i) => x !== enc[(i + d) % enc.length])) continue;
        m *= enc.length / d;
        enc = enc.slice(0, d);
        break;
    }
    const w = wordTex(enc, gName);
    if (m === 1) return w;
    if (enc.length === 1) return `${gName(Math.abs(enc[0]))}^{${enc[0] > 0 ? m : -m}}`;
    return `\\left(${w}\\right)^{${m}}`;
}

/**
 * The relations to show beside the generators: { source, rels, complete, free }
 * or null. A presentation comes from Poincaré at a discrete place at ∞, or from the tree at a discrete
 * prime (the header reads "Geometric at ℂ₁", "Geometric at ℚ₃"); a tree
 * decision "free of rank n" (n generators) has none; otherwise FlashBeam's
 * relations, which need not present Γ.
 */
function presentationData() {
    const R = run;
    if (!R || R.error || !R.places) return null;
    if (R.elementary && R.elementary.status === 'done') return elementaryTop(R.elementary.result);
    const nGens = R.model ? R.model.mats.length : 0;
    const disc = placeOrder(R).filter((p) => p.status === 'discrete');
    for (const pl of disc) {
        const sm = pl.summary;
        if (sm && sm.presentation) {
            const orders = new Map(sm.presentation.relators.filter((r) => r.enc.length === 1).map((r) => [Math.abs(r.enc[0]), r.m]));
            const complete = sm.presentationComplete !== false;
            return { source: `Geometric at $${placeTexLabel(pl)}$`, rels: sm.presentation.relators.map((r) => relatorTex(r, orders)), complete, free: complete && !sm.presentation.relators.length };
        }
    }
    const Pr = R.presentation && R.presentation.result && R.presentation.result.pres;
    // an S-arithmetic Γ (over ℚ, or over ℤ[i], ℤ[√−2], ℤ[ω]): its graph of groups on the tree of a
    // prime (for K = Γ ∩ Λ and coset representatives when Γ ⊄ Λ), or Reidemeister–Schreier on the given generators
    const Gg = R.presentation && R.presentation.result && R.presentation.result.graph;
    const hasGraph = !!(Gg && !Gg.error && Gg.gens);
    if (hasGraph && R.presView !== 'given') return { ...graphTop(Gg), toggle: { to: 'given', label: 'on $g_1, g_2, \\ldots$' } };
    if (Pr && !Pr.error && Pr.gens) {
        const names = Pr.gens.map((g) => g.name.replace(/^g(\d+)$/, 'g_{$1}').replace(/^h(\d+)$/, 'h_{$1}'));
        const d = R.presentation.result.ring, ent = (x) => (d ? ringEltTex(d, x) : x);
        const extra = Pr.gens.map((g, i) => (g.given === null ? `${names[i]} = \\left(\\begin{smallmatrix}${ent(g.M[0])}&${ent(g.M[1])}\\\\${ent(g.M[2])}&${ent(g.M[3])}\\end{smallmatrix}\\right)` : null)).filter(Boolean);
        const orders = ordersFrom(Pr.relators);
        return { source: 'Reidemeister–Schreier', rels: Pr.relators.map((w) => relatorTexNamed(w, names, orders)), complete: true, free: !Pr.relators.length, extra, toggle: hasGraph ? { to: 'nice', label: 'as a graph of groups' } : null };
    }
    for (const pl of disc) {
        const d = pl.decision;
        if (d && d.kind === 'free' && d.freeRank === nGens) return { source: `Geometric at $${placeTexLabel(pl)}$`, rels: [], complete: true, free: true };
        if (d && d.presentation && d.presentation.n === nGens) {
            return { source: `Geometric at $${placeTexLabel(pl)}$`, rels: d.presentation.relators.map((r) => relatorTex(r)), complete: true };
        }
    }
    const res = R.sarith && R.sarith.result;
    if (res && res.relations && res.relations.length) {
        const orders = ordersFrom(res.relations);
        return { source: 'FlashBeam', rels: res.relations.map((w) => relatorTex({ enc: w, m: 1 }, orders)), complete: false };
    }
    return null;
}

function renderPresentation() {
    const el = $('pres-rels');
    if (!el) return;
    const d = presentationData();
    if (!d) {
        const busy = run && STEPS.some((s) => run.steps[s].status === 'running');
        el.innerHTML = `<p class="rels-empty">${!run ? 'Relations appear here after Compute.' : busy ? 'Computing…' : 'No presentation found.'}</p>`;
        syncRelsHeight();
        return;
    }
    const n = d.rels.length;
    const head = `${mix(d.source)} · ${n} relation${n === 1 ? '' : 's'}${d.toggle ? ` <button class="quiet rels-toggle" id="rels-toggle" data-to="${d.toggle.to}">${mix(d.toggle.label)}</button>` : ''}${d.note ? ` <span class="rels-note">— ${mix(d.note)}</span>` : ''}${d.complete ? '' : ` <span class="partial">— ${d.source === 'FlashBeam' ? 'found, not known to be a presentation' : 'some may be missing'}</span>`}`;
    el.innerHTML = `<div class="rels-head">${head}</div>`
        + (d.names ? `<p class="rels-on">on \\(${d.names.join(', ')}\\)</p>` : '')
        + (d.free
            ? `<p class="rels-free">${mix(`No relations: $\\Gamma$ is free on ${d.names ? 'this generator' : 'these generators'}.`)}</p>`
            : `<ol class="rels-list">${d.rels.map((t) => `<li>\\(${t}\\)</li>`).join('')}</ol>`)
        + (d.extra && d.extra.length ? `<p class="rels-extra">with ${d.extra.map((t) => `\\(${t}\\)`).join(', ')}</p>` : '')
        + (d.defs && d.defs.length ? `<p class="rels-extra">where ${d.defs.map((t) => `\\(${t}\\)`).join(', ')}</p>` : '');
    typeset(el);
    const tg = $('rels-toggle');
    if (tg) tg.addEventListener('click', () => { if (run) { run.presView = tg.dataset.to; renderPresentation(); } });
    syncRelsHeight();
}

/** The relations scroll within the height of the generators. */
function syncRelsHeight() {
    const g = $('pres-gens'), el = $('pres-rels');
    if (g && el) el.style.maxHeight = `${Math.max(g.offsetHeight, 160)}px`;
}
if (window.ResizeObserver && $('pres-gens')) new ResizeObserver(syncRelsHeight).observe($('pres-gens'));

/**
 * The summary box says "arithmetic" for S-arithmetic too (the step cards keep "S-arithmetic"),
 * capitalized at the start of a sentence.
 */
function plainArith(t) {
    return String(t ?? '').replace(/(^|[.!?]\s+)(?:\$S\$|S)-arithmetic/g, '$1Arithmetic').replace(/(?:\$S\$|S)-arithmetic/g, 'arithmetic');
}

function renderVerdict() {
    renderPresentation();
    const v = verdict();
    const card = $('verdict');
    if (!v) { card.hidden = true; return; }
    card.hidden = false;
    $('v-head').className = `v-head ${v.cls}`;
    $('v-head').innerHTML = mix(plainArith(v.head));
    $('v-sub').innerHTML = v.sub ? mix(plainArith(v.sub)) : '';
    typeset(card);
    const busy = run && STEPS.some((s) => run.steps[s].status === 'running');
    const note = run && run.note ? run.note : '';
    setStageStatus(busy ? (note ? `${note} Computing…` : 'Computing…') : note);
}

/** The tone of a place in the summary: green when discrete, red when not, grey while undecided. */
function placeTone(pl) {
    if (pl.status === 'discrete' || pl.status === 'nondiscrete' || pl.status === 'pending') return pl.status;
    return 'undecided';
}

/**
 * The summary's last line: whether Γ is S-arithmetic, and what FlashBeam did towards deciding it
 * (coset enumeration may settle it first; the vertex orbits may close what FlashBeam's covering began).
 */
function arithLine(R) {
    const st = R.steps.sarith, S = R.sarith;
    if (st.status === 'idle' || st.status === 'skipped' || !S || S.lattice) return { status: st.status, head: st.status === 'idle' ? 'Waiting' : st.head, detail: st.detail };
    const head = st.status === 'open' ? 'Undecided' : st.head;
    const parts = [];
    const res = S.result, o = S.orbits;
    if ((S.exact && S.exact.index) || S.cusp) {
        parts.push(st.detail, 'FlashBeam was not needed.');
    } else if (st.status === 'running') {
        parts.push(st.detail);
    } else {
        if (S.exactTried && !S.exactTried.index) parts.push('Coset enumeration did not close.');
        // what FlashBeam found (a covering that decided it is already in the step's own line)
        const decidedByCovering = st.status === 'yes' && !(o && o.verdict);
        if (decidedByCovering) parts.push(st.detail);
        else if (res) {
            const nR = res.reps.length;
            if (!S.certifiable) parts.push(`FlashBeam found ${S.found}, but no covering certificate applies here.`);
            else if (res.status === 'covered' && res.verify && res.verify.ok) parts.push(`FlashBeam found ${S.found}, and it covered the trees with ${plural(nR, 'representative')}.`);
            else parts.push(`FlashBeam found ${S.found}, but no covering of the trees: ${plural(nR, 'representative')} cover ${res.covered} of the ${res.targets} neighbours.`);
        } else if (S.error) parts.push(`FlashBeam stopped: ${String(S.error).replace(/\$/g, '')}.`);
        // what decided it
        if (o && o.verdict) parts.push(`The vertex orbits${o.seeded ? ', seeded with that covering,' : ''} decided it. ${st.detail}`);
        else if (!decidedByCovering) {
            if (o) parts.push(`The vertex orbits did not close, ${o.status === 'budget' ? 'for lack of time or space' : `because of ${o.status}`}.`);
            if (S.stab && S.stab.status === 'no') parts.push('The stabilizer of $o$ was not shown to be a lattice.');
        }
    }
    // the congruence closure: equal to [Λ : Γ] exactly when Γ is S-arithmetic
    const J = R.congruence && R.congruence.result;
    const idx = S.exact && S.exact.index && S.exact.kernelIndex === 1 ? S.exact.index : o && o.verdict === 'sarith' && o.kernelIndex === 1 ? o.index : null;
    if (idx && J && (J.status === 'exact' || J.status === 'lower')) {
        if (J.index === idx) parts.push('This index equals that of the congruence closure, as it must.');
        else if (J.status === 'exact' || J.index > idx) parts.push(`The congruence closure gives index $${J.index}$ instead, so one of the two is wrong.`);
    }
    return { status: st.status, head, detail: parts.filter(Boolean).join(' ') };
}

function renderSteps() {
    const R = run;
    const list = $('step-list');
    if (!R) { list.innerHTML = ''; return; }
    // a section's name turns green or red once its question is decided: algebraic (not Zariski dense: a Zariski-dense
    // Γ is not algebraic), discrete at some place, arithmetic
    const name = (n, v) => `<span class="sum-name"${v ? ` data-verdict="${v}"` : ''}>${esc(n)}</span>`;
    const row = (step, n, st, cls = '', v = null) => `<div class="sum-row${cls}" data-step="${step}" data-status="${st.status}">
            ${name(n, v)}
            <span class="sum-text"><b>${mix(plainArith(st.head || (st.status === 'idle' ? 'Waiting' : '')))}</b>${st.detail ? ` <span>— ${mix(plainArith(st.detail))}</span>` : ''}</span>
        </div>`;
    const z = R.steps.zariski, p = R.steps.places, a = R.steps.sarith;
    const algebraic = z.status === 'dense' ? 'no' : z.status === 'info' ? 'yes' : null;
    const geometric = p.status === 'yes' ? 'yes' : p.status === 'no' ? 'no' : null;
    const arithmetic = a.status === 'yes' ? (R.sarith && R.sarith.thin ? 'no' : 'yes') : null;
    let html = row('zariski', 'Algebraic', z, '', algebraic);
    const dense = !!(R.zariski && R.zariski.ok && R.zariski.closure.kind === 'dense');
    // the places as they are decided, from the start: step 2 runs alongside step 1
    if (R.places.length && z.status !== 'info') {
        html += `<div class="sum-group" data-step="places" data-status="${p.status}">${name('Geometric', geometric)}<div class="sum-places">`;
        for (const pl of placeOrder(R)) {
            html += `<div class="sum-place" data-place="${esc(pl.key)}" data-status="${placeTone(pl)}"><span class="dot"></span><span class="sp-name">${tex(placeTexLabel(pl))}</span><span class="sp-text">${mix(pl.headline)}</span></div>`;
        }
        if (!R.finiteDone) html += '<div class="sum-place" data-status="pending"><span class="dot"></span><span class="sp-name">primes</span><span class="sp-text">Deciding…</span></div>';
        html += '</div></div>';
    } else html += row('places', 'Geometric', p);
    html += row('sarith', 'Arithmetic', arithLine(R), '', arithmetic);
    // the congruence closure bounds [Λ : Γ] from below: part of the arithmetic question
    if (dense) html += row('congruence', 'Congruence closure', R.steps.congruence, ' sum-sub');
    list.innerHTML = html;
    typeset(list);
    for (const s of CARDS) {
        const card = $(`card-${s}`), st = R.steps[s];
        card.dataset.status = st.status;
        card.hidden = st.status === 'idle' || st.status === 'skipped';
        const tag = card.querySelector('[data-tag]');
        tag.innerHTML = st.status === 'idle' ? '' : mix(st.head);
        typeset(tag);
    }
    const c = R.steps.congruence;
    $('cong-tag').innerHTML = c.status === 'idle' ? '' : mix(c.head);
    typeset($('cong-tag'));
    $('cong-h').dataset.status = c.status;
    $('cong-h').hidden = $('cong-body').hidden = !dense;
}

function resetCards() {
    for (const s of CARDS) { const c = $(`card-${s}`); c.hidden = true; c.querySelector('.step-body').innerHTML = ''; }
    $('cong-body').innerHTML = '';
    placeFrames.hide(); stabFrames.hide();
    $('places-frame-wrap').hidden = true; $('stab-frame-wrap').hidden = true;
    renderSteps();
}

/** Re-render one step's card. */
function refreshView(step) {
    const R = run;
    if (!R) return;
    if (step === 'congruence') step = 'zariski';
    const body = $(`card-${step}`).querySelector('.step-body');
    let html = '';
    if (step === 'zariski') {
        if (!R.zariski) html = `<p class="lead">${mix(R.error || 'Computing…')}</p>`;
        else if (!R.zariski.ok) html = `<div class="banner" data-status="open"><span class="dot"></span><div>${mix(R.zariski.error)}</div></div>`;
        else html = zariskiCard(R.zariski, R.model);
        if (R.elementary) html = html.replace(/<\/div>$/, `${elementarySection(R.elementary)}</div>`);
        if (R.descent && R.descent.mats) {
            const st = { v: 1, mats: R.descent.mats, anti: R.descent.mats.map(() => false), consts: [] };
            const link = `#s=${btoa(unescape(encodeURIComponent(JSON.stringify(st)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
            html = `<div class="banner" data-status="info"><span class="dot"></span><div>${mix(`The trace field is $\\mathbb{Q}$ and the quaternion algebra splits, so Γ is conjugate into $\\mathrm{PGL}_2(\\mathbb{Q})$ (Skolem–Noether, by a zero divisor of the reduced norm): `)}${R.descent.mats.map((m) => tex(`\\begin{pmatrix} ${m[0]} & ${m[1]} \\\\ ${m[2]} & ${m[3]} \\end{pmatrix}`)).join(', ')}. <a href="${link}" target="_blank" rel="noopener">Open the conjugate over ℚ ↗</a>, where the exact steps over ℚ apply.</div></div>` + html;
        }
        const cb = $('cong-body');
        cb.innerHTML = R.zariski && R.zariski.ok && R.zariski.arith ? congruenceSection(R.congruence, R.zariski.arith) : '';
        typeset(cb);
    } else if (step === 'places') html = placesCard(R);
    else if (step === 'sarith') {
        html = R.sarith ? sarithCard(R.sarith, R.model, R.model.mats.length).replace(/<\/div>$/, `${presentationSection(R.presentation)}</div>`) : '';
        const hs = $('card-sarith').querySelector('.h-sub');
        if (hs) hs.hidden = !!(R.sarith && R.sarith.lattice);
    }
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
    if (pl.tool === 'poincare') {
        const ms = pl.members || [pl];
        const parts = [];
        if (m && m.degree > 1) parts.push(ms.map((a) => `$w \\mapsto ${fmtCTex(a.root)}$`).join(' or '));
        if (new Set(ms.map((a) => a.kind)).size > 1) parts.push('real and complex embeddings');
        if (ms.length > 1) parts.push('conjugate groups');
        if (pl.yours) parts.push('yours');
        return { name: `\\(${placeTexLabel(pl)}\\)`, sub: parts.join(' · ') };
    }
    if (m && m.degree > 1 && pl.primeTex) return { name: `\\(${pl.count > 1 ? `\\mathfrak p_{${pl.index + 1}}` : '\\mathfrak p'} = ${pl.primeTex}\\)`, sub: `above $${pl.p}$ · $e = ${pl.e}$, $f = ${pl.f}$` };
    return { name: `\\(p = ${pl.p}\\)`, sub: `$\\mathbb{Q}_{${pl.p}}$` };
}

function placesCard(R) {
    const m = R.model;
    if (!m) return '';
    const [r1, r2] = m.signature;
    const nArch = R.places.filter((p) => p.tool === 'poincare').length;
    const merged = nArch < r1 + r2
        ? ` Embeddings with the same values of $\\operatorname{tr}^2/\\det$ give conjugate (or complex-conjugate) groups, so up to conjugation there ${nArch === 1 ? 'is one place' : `are ${nArch} places`} at ∞.`
        : '';
    let html = `<p class="lead">${m.degree === 1
        ? mix('The field of definition is $F = \\mathbb{Q}$, with one place at ∞.')
        : mix(`The field of definition is $F = \\mathbb{Q}(w)$ with $${m.polyTex} = 0$, of degree ${m.degree}, with ${r1} real and ${r2} complex place${r2 === 1 ? '' : 's'} at ∞.${merged}`)} ${mix('The primes listed are those where the generators do not all fix the standard vertex of the tree; at every other prime, $\\Gamma$ fixes it.')} A discrete place is shown below, live.</p>`;
    html += '<div class="place-list">';
    for (const pl of placeOrder(R)) {
        const nm = placeName(pl);
        const lines = pl.lines || [];
        html += `<div class="place-row${pl.key === R.placeSel && !$('places-frame-wrap').hidden ? ' selected' : ''}" data-status="${pl.status}">
            <span class="dot"></span>
            <span class="p-name">${nm.name}<span class="p-sub">${mix(nm.sub)}</span></span>
            <span class="p-verdict">${mix(pl.headline)}</span>
            <button class="view-btn" data-place="${pl.key}">View in ${pl.tool === 'poincare' ? 'Poincaré' : 'Trees'}</button>
            ${lines.length ? `<div class="p-detail">${lines.map((l) => `<p>${mix(l)}</p>`).join('')}</div>` : ''}
        </div>`;
    }
    html += '</div>';
    if (!R.finiteDone) html += '<p class="note" style="margin-top:8px">Deciding at the primes…</p>';
    if (R.finiteError) html += `<p class="err">${mix(R.finiteError)}</p>`;
    if (R.primes && R.primes.capped) html += `<p class="note">Only the first ${MAX_PRIMES} of ${R.primes.capped} candidate primes were tested.</p>`;
    return html;
}

/** The caption under a place's live view, as text with $…$ math. */
function placeCaption(pl) {
    const m = run.model;
    if (pl.tool === 'poincare') {
        const at = m && m.degree > 1 ? `$w \\mapsto ${fmtCTex(pl.root)}$` : 'the only embedding';
        return `$${placeTexLabel(pl)}$: ${at} — ${pl.headline} — in Poincaré${pl.isDefault ? ' (your embedding)' : ''}`;
    }
    return `$${placeTexLabel(pl)}$: the $${Number(pl.q) + 1}$-regular tree — ${pl.headline} — in Trees`;
}

function showPlaceFrame(pl) {
    const st = run.settings;
    const state = pl.tool === 'poincare' ? { ...pl.state, depth: st.depth, faces: st.faces } : pl.state;
    const url = placeFrames.show(pl.tool, state);
    $('places-frame-wrap').hidden = false;
    $('places-caption').innerHTML = mix(placeCaption(pl));
    typeset($('places-caption'));
    $('places-open').href = url;
}

// ── step 3 ──

function showStabFrame() {
    const S = run.sarith;
    if (!S || !S.stab || !S.stab.state) return;
    const url = stabFrames.show('poincare', { ...S.stab.state, depth: run.settings.depth, faces: run.settings.faces });
    $('stab-frame-wrap').hidden = false;
    $('stab-caption').innerHTML = mix(`The elements of $\\Gamma$ fixing $o$, at ${S.arch.kind === 'real' ? 'the real place' : 'the complex place'} — in Poincaré`);
    typeset($('stab-caption'));
    $('stab-open').href = url;
}

/** Update the live numbers of step 3 without rebuilding the card (rebuild when the representatives change). */
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
    const pg = $('copy-pres-gap');
    if (pg) pg.addEventListener('click', async () => {
        const Pr = run.presentation && run.presentation.result && run.presentation.result.pres;
        if (!Pr || Pr.error) return;
        try { await navigator.clipboard.writeText(presentationGap(Pr)); pg.textContent = 'Copied'; }
        catch (e) { pg.textContent = 'Copy failed'; }
        setTimeout(() => { pg.textContent = 'Copy for GAP'; }, 1600);
    });
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
        setTimeout(() => { gap.textContent = 'Copy the relations for GAP'; }, 1600);
    });
    const show = $('show-stab');
    if (show) show.addEventListener('click', () => showView('sarith', 'stabilizer'));
}

// ───────────────────────── live field information ─────────────────────────

/** The line under the matrices: the field the entries generate ("over ℚ(w)"), or what is wrong. */
function showFieldStatus(r) {
    const el = $('field-status');
    if (r.error && !r.blank) { el.innerHTML = `<span class="err">${mix(r.error)}</span>`; typeset(el); return; }
    if (!r.exactCtx) {
        el.innerHTML = `<span class="err">${esc(`not exact${r.read && r.read.reason ? `: ${r.read.reason}` : ''}`)}</span>`;
        return;
    }
    const K = r.exactCtx.field;
    el.innerHTML = `over ${tex(K.deg === 1 ? '\\mathbb{Q}' : K.tex())}`;
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

/** ⌘-click on the die: a random group (randomGroup.js), not an example. */
function loadRandomGroup() {
    const g = randomGroup();
    input.setState({ mats: g.mats, anti: g.mats.map(() => false), consts: g.consts });
    $('wordLength').value = '8';
    closeExamples();
    const before = run;
    compute();
    if (run && run !== before) {
        run.note = `A random group over ${g.field} on ${g.gens.length} generators, ${g.scope ? 'within' : 'outside'} the database’s range.`;
        renderVerdict();
    }
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
    pop.innerHTML = order.map((c) => `<div class="ex-cat">${mix(c)}</div>${cats.get(c).map((i) => `<button data-ex="${i}" title="${esc(list[i].desc || '')}">${mix(list[i].name)}</button>`).join('')}`).join('');
    typeset(pop);
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
        if (e.metaKey || e.ctrlKey) { loadRandomGroup(); return; }
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
        const pl = e.target.closest('[data-place]');
        if (pl && run && run.byKey.has(pl.dataset.place)) {
            showView('places', pl.dataset.place);
            $('card-places').scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        const row = e.target.closest('[data-step]');
        const target = row && (row.dataset.step === 'congruence' ? $('cong-h') : $(`card-${row.dataset.step}`));
        if (target && !target.hidden && !target.closest('[hidden]')) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // the congruence closure, one prime power at a time
    $('cong-body').addEventListener('click', (e) => {
        const b = e.target.closest('.cq-tab');
        if (!b || !run || !run.congruence) return;
        const q = Number(b.dataset.cq);
        run.congruence.sel = q;
        $('cong-body').querySelectorAll('.cq-tab').forEach((t) => t.setAttribute('aria-selected', String(Number(t.dataset.cq) === q)));
        $('cong-body').querySelectorAll('.cq-panel').forEach((p) => { p.hidden = Number(p.dataset.cq) !== q; });
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
renderPresentation();
buildExamples();
// a shared link shows its results; a fresh visit shows only the inputs
if (fromURL) setTimeout(compute, 100);
