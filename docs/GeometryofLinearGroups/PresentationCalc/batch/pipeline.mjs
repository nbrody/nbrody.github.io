/**
 * The Presentation Calculator's pipeline without a page, for the database.
 *
 * The math is the page's own: the Zariski engine (as zariskiWorker.js loads
 * it), finite.js's places, and the two module workers archWorker.js and
 * sarithWorker.js, whose message handlers are called in-process. Only the
 * orchestration of js/main.js is repeated here, step for step:
 *
 *   1  Zariski closure   not dense ends the run; the congruence closure is
 *                        recorded (over ℚ, the joint one: congruence.js)
 *   2  discreteness      every place: the primes (trees), then ∞ (poincare);
 *                        a discrete place ends the run
 *   3  arithmetic        coset enumeration over ℚ, then FlashBeam: the covering
 *                        certificate, the vertex orbits, and poincare on the
 *                        stabilizer of o when A splits at one place at ∞
 *
 * One difference: when the covering certificate cannot apply (S = ∅, or A
 * split at two places at ∞), the page still runs FlashBeam for its Dirichlet
 * generators; the verdict is "no certificate" either way, so this skips it.
 *
 * runGroup(state, settings) → a JSON record; see the bottom of the file.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.NumberRingEngine = require('../../Algebraic/Tools/numberRings/ringEngine.js');
globalThis.PGL2Engine = require('../../Algebraic/Tools/zariskiClosure/pgl2Engine.js');
globalThis.ExprEngine = require('../../Algebraic/Tools/expressionParser/exprEngine.js');
const ZariskiInput = require('../../Algebraic/Tools/zariskiClosure/zariskiInput.js');

const { buildGroup } = await import('../../Geometric/Tools/Kleinian/poincare/js/matrixInput.js');
const { fieldModel, poincareStateFor } = await import('../../Geometric/Tools/discretenessAlgorithm/js/field.js');
const { runFinite } = await import('../../Geometric/Tools/discretenessAlgorithm/js/finite.js');
const { GlobalField, Place } = await import('../../Geometric/Tools/padicGroups/trees/js/localField.js');
const { decide, serializeDecision } = await import('../../Geometric/Tools/padicGroups/trees/js/discreteness.js');
const { archClasses } = await import('../js/archPlaces.js');
const { zariskiLine, congruenceLine, texToText } = await import('../js/zariskiView.js');
const { indexInPGL2Z } = await import('../js/modularIndex.js');
const { exactIndexCheck } = await import('../js/sarithIndex.js');
const { fuchsianPairTest } = await import('../js/fuchsian2.js');
const { congruenceClosure } = await import('../js/congruence.js');
const { bianchiRing, wordMatrices, indexInBianchi, indexInPGL2OS } = await import('../js/bianchi.js');
const { cuspCertificate, cuspCertificateWords, cuspCertificatePool, infiniteOrderWord } = await import('../js/cusps.js');
const { descendToQ, descendToReal } = await import('../js/descent.js');
const { definiteIndex } = await import('../js/quaternionIndex.js');
const { numberRingApplies, indexInPGL2O } = await import('../js/numberRingIndex.js');
const { certifyThinQ } = await import('../js/thinCert.js');

// the two module workers, each read for its onmessage handler
await import('../js/archWorker.js');
const archHandler = globalThis.onmessage;
await import('../js/sarithWorker.js');
const sarithHandler = globalThis.onmessage;
globalThis.onmessage = null;

/** One message to a worker handler; the messages it posts, in order. */
function call(handler, data) {
    const out = [];
    globalThis.postMessage = (m) => out.push(m);
    try { handler({ data }); } finally { globalThis.postMessage = undefined; }
    return out;
}

/** The page's defaults (index.html), and the version of this pipeline. */
export const DEFAULTS = { depth: 8, faces: 96, seconds: 4, beam: 1500, flash: 40, beamSeconds: 60, maxReps: 24, metric: 'log' };
/** Beyond the page's settings: the stabilizer check's sizes and harvest time (main.js STAB_SIZES, HARVEST_SECONDS). */
export const STAB_DEFAULTS = { stabSizes: [6, 10, 14], harvestSeconds: 12 };
/** Over ℚ FlashBeam reports this many elements fixing o, for coset enumeration (main.js EXACT_STAB_COUNT). */
const EXACT_STAB_COUNT = 400;
export const PIPELINE_VERSION = '2026-10-26a';   // + coset enumeration in PGL₂(O_k) from the Voronoi presentation (numberRingIndex.js): S = ∅ over real/CM/cubic fields, and the stabilizer of o when A splits at ≥ 2 places at ∞   // '2026-10-25a':   // + coset enumeration in N(𝒪[1/S])/ℚ^× for a definite algebra over ℚ (quaternionIndex.js), with the congruence level   // '2026-10-19d':   // the stabilizer check skips poincare's non-discreteness search (Γ_o is discrete)   // '2026-10-19c':   // covering: π-reduced matrices, deep valuations, in-iteration deadlines, memory caps   // '2026-10-19b':   // vertex orbits from an element of infinite order fixing o (the closure is open), no covering needed; covering spread along the stabilizers found   // '2026-10-19a':   // cusp certificate: stabilizers from collisions of the cusp's orbit modulo its translations; full-rank translations certify with O^× infinite   // '2026-10-13a':   // seeded vertex orbits fall back to fold-first from scratch (orbits.js orbitDecideAuto)   // '2026-10-12c':   // unseeded vertex orbits: HLT, then fold-first (orbits.js orbitDecideAuto)   // '2026-10-12b':   // short relators for PGL₂(ℤ[1/S]) (Rademacher's generators of Γ₀(q)); no step cap in coxeterWord   // '2026-10-12a':   // the cusp certificate (Vaserstein / Benoist–Oh) for any field and any S, on Γ and on FlashBeam's archive   // '2026-10-11j':   // cusp check on Γ_o searches 100k elements   // '2026-10-11i':   // + embedding into PGL₂(ℚ(√a)) when A/ℚ is an indefinite division algebra and F has no real place   // '2026-10-11h':   // fixed: ℤ[ω] written with w = ω − 1 (w² + w + 1); cusp keys out of floating range; congruence Schreier generators   // '2026-10-11g':   // cusp certificate searches 120k elements   // '2026-10-11f':   // + A split at ≥ 2 places at ∞: covering, then the cusp certificate on Γ_o   // '2026-10-11e':   // + descent into PGL₂(ℚ) when the trace field is ℚ (descent.js)   // '2026-10-11d':   // fixed: inverses mod a split prime; Bianchi budget 20 s / 3M cosets   // '2026-10-11c': + exact index in PGL₂(O[1/S]) over ℚ(√−1), ℚ(√−2), ℚ(√−3) (bianchi.js)   // '2026-10-11b': arithmeticity from a unipotent lattice at a cusp when S = ∅ and O^× is infinite (cusps.js); integrality at one split place at ∞   // '2026-10-11a': exact stabilizer check in the Bianchi groups over ℚ(√−1), ℚ(√−2), ℚ(√−3) (bianchi.js); joint congruence closure recorded
// earlier: '2026-10-10j';   // trees: no Bass–Serre certificate for inversions of order > 2 (unsound)   // + memory guards in orbits.js (undefer one at a time, heap/size budgets)   // + exact two-generator tests at ∞ (fuchsian2.js)   // + partial-covering seeds + vertex orbits with Stallings stabilizers (orbits.js): exact S-arithmetic / thin   // + Conder pairs in Bass–Serre, one place at ∞ over ℚ   // + conjugating fixed vertices at even-valuation primes   // + exact index in PGL₂(ℤ[1/S])   // + the trees' torsion closure and Bass–Serre free products
const MAX_PRIMES = 12;

// ───────────────────────── step 2 helpers (main.js) ─────────────────────────

const vol = (v) => (v == null ? '' : ` ${Number(v).toFixed(4)}`);

/** main.js setArch, as data. */
function archVerdict(kind, { cert = null, summary = null, error = null }) {
    const where = kind === 'real' ? 'PGL₂(ℝ)' : 'PSL₂(ℂ)';
    if (error) return { status: 'unknown', headline: 'Undecided', detail: `Error: ${error}` };
    if (cert && cert.nondiscrete) return { status: 'nondiscrete', headline: 'Not discrete', detail: cert.text };
    if (summary && summary.status === 'verified') {
        const what = summary.real ? (summary.finiteArea ? 'Fuchsian, finite area' : 'Fuchsian, infinite area')
            : summary.finiteVolume ? `finite covolume${vol(summary.volume)}` : 'infinite covolume';
        return {
            status: 'discrete', headline: `Discrete in ${where} — ${what}`,
            detail: `Poincaré’s conditions hold for a domain with ${summary.faces} faces${summary.exactUsed ? ', the relations checked exactly' : ''}${summary.h1 ? `; H₁ = ${summary.h1}` : ''}.`,
        };
    }
    if (summary && summary.capped) return { status: 'unknown', headline: 'Probably not discrete', detail: 'The basepoint stabilizer did not close up into a finite group.' };
    if (summary && summary.status === 'incomplete') return { status: 'likely', headline: 'Probably discrete', detail: `Every Poincaré condition that could be resolved holds (${summary.faces} faces); some checks are open.` };
    if (summary && summary.membershipFail) return { status: 'unknown', headline: 'Undecided', detail: 'The domain found is for a proper subgroup. Raise the word length.' };
    if (summary) return { status: 'unknown', headline: 'Undecided', detail: `Poincaré’s conditions fail at this word length${summary.tries > 1 ? `, from ${summary.tries} basepoints` : ''}.` };
    return { status: 'unknown', headline: 'Undecided', detail: 'No answer.' };
}

/** poincare on one state, as archWorker.js runs it. */
function runArch(state, settings, certify = true) {
    const msgs = call(archHandler, { id: 1, state, maxFaces: settings.faces, maxDepth: settings.depth, certify });
    const err = msgs.find((m) => m.error);
    if (err) return { error: err.error };
    const done = msgs.find((m) => m.phase === 'done');
    return done ? { cert: done.cert, summary: done.summary } : { error: 'no answer' };
}

/** main.js decisionVerdict. */
function decisionVerdict(d) {
    if (!d) return { status: 'unknown', headline: 'Undecided', detail: '' };
    if (d.verdict === 'discrete') {
        const headline = d.kind === 'finite' ? `Discrete — finite, of order ${d.order}`
            : d.kind === 'free' ? `Discrete — free of rank ${d.freeRank}`
                : d.kind === 'virtually-free' ? (d.freeProduct ? `Discrete — ${d.freeProduct}` : 'Discrete — virtually free') : 'Discrete';
        return { status: 'discrete', headline, detail: d.reason };
    }
    if (d.verdict === 'nondiscrete') return { status: 'nondiscrete', headline: 'Not discrete', detail: d.reason };
    return { status: 'unknown', headline: 'Undecided', detail: d.reason };
}

/** Words as poincare and FlashBeam store them: arrays of ±(i + 1) letters. */
function wordText(w) {
    if (!w.length) return '1';
    const out = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const g = Math.abs(w[i]), e = (w[i] > 0 ? 1 : -1) * (j - i);
        out.push(`g${g}${e === 1 ? '' : `^${e}`}`);
        i = j;
    }
    return out.join(' ');
}

/**
 * The places at ∞ where Γ is discrete by integrality (main.js integralPlaces): when Γ is bounded at
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
 * The prime where Γ is discrete by integrality (also main.js integralPrime): Γ unbounded at exactly one place
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
    const ring = d === 1 ? `ℤ[1/${p}]` : 'O_k[1/𝔭]', local = d === 1 ? `ℚ_${p}` : 'k_𝔭';
    return {
        status: 'discrete', headline: 'Discrete — bounded at every other place',
        detail: `Γ is unbounded only at ${d === 1 ? p : `the prime 𝔭 of k over ${p}`}: the quaternion algebra is ramified at ${d === 1 ? '∞' : 'every place at ∞'} (a compact group there) and Γ is bounded at every other prime. So Γ⁽²⁾ lies in the norm-one group of an ${ring}-order, a discrete subgroup of PGL₁(A)(${local}), and Γ is discrete at every place over ${p}.`,
    };
}
function integralVerdict(model, a) {
    const where = a.kind === 'real' ? 'PGL₂(ℝ)' : 'PSL₂(ℂ)';
    return {
        status: 'discrete', headline: `Discrete in ${where} — bounded at every prime`,
        detail: model.degree === 1
            ? 'Γ ⊂ PGL₂(ℚ) is bounded at every prime, so it lies in PGL₂(ℚ) ∩ (PGL₂(ℝ) × U) for a compact open subgroup U of the finite adeles; PGL₂(ℚ) is discrete in the adeles, so Γ is discrete in PGL₂(ℝ).'
            : `Γ is bounded at every prime, so Γ⁽²⁾ lies in the norm-one group of an order, a lattice in the product of the places at ∞ where the quaternion algebra splits. This is the only one, so Γ is discrete in ${where}.`,
    };
}

/**
 * A definite quaternion algebra over ℚ (main.js definiteExact): [N(𝒪[1/S])/ℚ^× : Γ] by coset enumeration, and the
 * congruence level, from the primes where the engine found the closure deficient.
 */
function definiteExact(model, A, settings) {
    const C = A.congruence && !A.congruence.error ? A.congruence.checked || [] : [];
    const opts = {
        field: A.k.d > 1 ? { minpoly: A.k.minpoly, P: A.k.P } : null,
        ram: A.A.ram.filter((r) => r.kind === 'finite').map((r) => ({ p: r.p, e: r.e, f: r.f, H: r.H })),
        levelPrimes: C.filter((c) => c.status === 'deficient').map((c) => ({ p: c.p, level: c.level })),
        seconds: settings.tcSeconds ?? 4, maxCosets: settings.tcCosets ?? 1500000,
    };
    let r;
    try { r = definiteIndex(model.mats.map((row) => row.map((e) => e.src)), model.poly, A.ring.S.map((s) => ({ p: s.p, e: s.e, f: s.f, H: s.H })), opts); }
    catch (e) { r = { index: null, error: e.message }; }
    return r ? { ...r, quaternion: true } : null;
}

/**
 * Over ℚ(√−1), ℚ(√−2), ℚ(√−3) with S ≠ ∅: [PGL₂(O[1/S]) : Γ] by coset enumeration (bianchi.js), the
 * analogue of exactIndexCheck (main.js bianchiExact). null when it does not apply.
 */
function bianchiExact(model, A, settings) {
    const d = model.degree === 2 && A.ring.S.length ? bianchiRing(model.polySrc) : null;
    if (!d) return null;
    const gens = wordMatrices(d, model.mats.map((row) => row.map((e) => e.src)), model.mats.map((_, i) => [i + 1]), model.polySrc);
    if (!gens) return null;
    const r = indexInPGL2OS(d, gens, { seconds: settings.bianchiSeconds ?? 20, maxCosets: settings.bianchiCosets ?? 3000000 });
    return { index: r.index ?? null, limit: r.limit ?? null, error: r.error ?? null, S: r.S || [], kernelIndex: 1, ms: r.ms ?? null, ring: d };
}

/**
 * S = ∅, Γ ⊂ PGL₂(k) with k its trace field, A split, at least two places at ∞ where Γ is unbounded:
 * [PGL₂(O_k) : Γ] by coset enumeration on the Voronoi presentation of PGL₂(O_k) (numberRingIndex.js;
 * totally real, CM and cubic fields). The presentation is kept per field for the batch worker's life. Generators that do not scale into GL₂(O_k) are left out, and
 * then the index is that of a subgroup (still arithmetic: Γ is bounded at every prime). null when it
 * does not apply.
 */
function numberRingExact(model, A, settings) {
    if (A.ring.S.length || model.degree < 2 || A.k.d !== model.degree || !(A.A && A.A.split)) return null;
    const split = A.k.r1 - A.A.ram.filter((r) => r.kind === 'real').length + A.k.r2;
    if (split < 2 || settings.numberRing === false || !numberRingApplies(model.polySrc)) return null;
    let r;
    try {
        r = indexInPGL2O(model.polySrc, model.mats.map((row) => row.map((e) => e.src)), model.mats.map((_, i) => [i + 1]),
            { seconds: settings.nrSeconds ?? 60, maxCosets: settings.nrCosets ?? 3000000, cache: true });
    } catch (e) { r = { index: null, error: e.message }; }
    return { index: r.index ?? null, limit: r.limit ?? null, error: r.error ?? null, S: [], kernelIndex: r.evenIndex ?? 1, ms: r.ms ?? null, numberRing: true, used: r.used, skipped: r.skipped, cells: r.cells, conjugated: !!r.conjugated };
}

/**
 * Where the cusp certificate applies (cusps.js): A splits over the field of definition (Γ has
 * unipotents if it is S-arithmetic) and O_S^× is infinite (S ≠ ∅, or a unit of infinite order).
 */
function vasersteinApplies(model, A) {
    if (A.k.d !== model.degree || !(A.A && A.A.split)) return false;
    return A.ring.S.length > 0 || (model.degree > 1 && model.signature[0] + model.signature[1] > 1);
}
function cuspRecord(c, model, source) {
    return { found: c.found, source, rank: c.found ? c.rank : c.best ? c.best.rank : null, d: model.degree, S: c.S ?? null, elements: c.elements ?? null, cusps: c.cusps ?? null, reason: c.reason ?? null, ms: c.ms ?? null };
}
function cuspSarith(c, source) {
    return { status: 'cusp', method: 'a lattice of unipotents at a cusp (Vaserstein; Benoist–Oh)', source, S: c.S ?? [], cusp: c.cusp, parabolic: wordText(c.parabolic), other: c.other ? wordText(c.other) : null, byTranslations: !!c.byTranslations, collisions: c.collisions || 0 };
}

// ───────────────────────── step 4 helpers (main.js) ─────────────────────────

function archFactors(model, A) {
    const archF = A.spaces.factors.filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (!archF.length) return [];
    // main.js: over ℚ the one place at ∞ is where A splits
    if (model.degree === 1 && archF.length === 1) {
        const a = model.arch[0];
        return [{ re: a.root.re, im: a.root.im, kind: a.kind, n: a.n, key: a.key }];
    }
    const byClass = new Map();
    for (const a of archClasses(model).filter((x) => x.noncompact)) {
        if (!byClass.has(a.classKey)) byClass.set(a.classKey, []);
        byClass.get(a.classKey).push(a);
    }
    return [...byClass.values()].map((g) => {
        const a = g.find((x) => x.kind === 'real' && x.isDefault) || g.find((x) => x.kind === 'real') || g.find((x) => x.isDefault) || g[0];
        return { re: a.root.re, im: a.root.im, kind: a.kind, n: a.n, key: a.key };
    });
}

/** main.js sarithApplicable, with a reason code for the database. */
function sarithApplicable(A, factors) {
    const archF = A.spaces.factors.filter((f) => f.kind === 'real' || f.kind === 'complex');
    if (!A.ring.S.length) return { certifiable: false, code: 'S-empty', note: 'Γ is unbounded at no prime, so X has no trees; the covering certificate needs at least one.' };
    // A splits at ≥ 2 places at ∞: then O_k has infinitely many units, and the stabilizer of o is
    // checked by a full lattice of unipotents at a cusp (cusps.js, Vaserstein) instead of Poincaré
    if (archF.length >= 2) return { certifiable: true, arch: { kind: 'multi', n: archF.length } };
    if (!archF.length) return { certifiable: true, arch: null };
    if (factors.length !== 1) return { certifiable: false, code: 'arch-classes', note: `The unbounded places at ∞ could not be matched with the one place of k where A splits (${factors.length} classes found).` };
    const f = factors[0];
    if (archF[0].kind === 'real' && f.kind !== 'real') return { certifiable: false, code: 'not-real', note: 'A splits at a real place of k but the field of definition is complex there.' };
    return { certifiable: true, arch: { kind: archF[0].kind, root: { re: f.re, im: f.im }, n: f.n, key: f.key } };
}

function sarithJob(model, A, factors, settings) {
    return {
        poly: model.degree > 1 ? model.polySrc : null,
        mats: model.mats.map((r) => r.map((e) => e.src)),
        S: A.ring.S.map((s) => ({ p: s.p, e: s.e, f: s.f })),
        sameField: model.degree === A.k.d,
        arch: factors.map((f) => ({ re: f.re, im: f.im, kind: f.kind })),
        metric: settings.metric,
        opts: { beamWidth: settings.beam, flashSize: settings.flash, seconds: settings.beamSeconds, maxReps: settings.maxReps },
        stabCount: model.degree === 1 || factors.length >= 2 || (model.degree === 2 && bianchiRing(model.polySrc) && factors.some((f) => f.kind === 'complex')) ? EXACT_STAB_COUNT : Math.max(12, (settings.stabSizes || STAB_DEFAULTS.stabSizes)[0] + 4),
    };
}

/**
 * The stabilizer of o at the one split place at ∞, as main.js stabilizerCheck:
 * each attempt tries coset enumeration in PGL₂(ℤ) on every element found
 * (over ℚ), then Poincaré on the smallest STAB_SIZES[attempt]; between
 * attempts FlashBeam harvests more elements fixing o.
 */
function stabilizerCheck(model, arch, first, settings, A = null) {
    const STAB_SIZES = settings.stabSizes || STAB_DEFAULTS.stabSizes;
    const HARVEST_SECONDS = settings.harvestSeconds ?? STAB_DEFAULTS.harvestSeconds;
    const rounds = [];
    if (arch.kind === 'multi') {
        // Γ_o ⊂ PGL₂(O_F): arithmetic once ⟨elements found⟩ has a full lattice of unipotents at a cusp
        let stab = first;
        for (let attempt = 0; attempt < STAB_SIZES.length; attempt++) {
            if (attempt) {
                const m = call(sarithHandler, { id: 1, cmd: 'harvest', seconds: HARVEST_SECONDS, stabCount: EXACT_STAB_COUNT }).find((x) => x.msg.type === 'stab');
                if (!m) return { ok: false, text: 'The harvest failed.', rounds };
                stab = m.msg.stab;
            }
            if (!stab.length) continue;
            // Γ_o ⊂ PGL₂(O_k): coset enumeration on the Voronoi presentation (numberRingIndex.js)
            if (attempt === 0 && A && settings.numberRing !== false && model.degree === A.k.d && A.A && A.A.split && numberRingApplies(model.polySrc)) {
                let r;
                try {
                    r = indexInPGL2O(model.polySrc, model.mats.map((row) => row.map((e) => e.src)), stab.map((e) => e.word),
                        { seconds: settings.nrSeconds ?? 60, maxCosets: settings.nrCosets ?? 3000000, wordSeconds: settings.nrWordSeconds ?? 30, cache: true });
                } catch (e) { r = { index: null, error: e.message }; }
                rounds.push({ elements: stab.length, method: 'PGL₂(O_k)', index: r.index ?? null, used: r.used ?? 0, limit: r.limit ?? r.error ?? null, ms: r.ms ?? null });
                if (r.index) return { ok: true, method: 'coset enumeration in PGL₂(O_k)', used: r.used, index: r.index, rounds };
            }
            const c = cuspCertificateWords(model.mats.map((row) => row.map((e) => e.src)), model.poly, stab.map((e) => e.word), model.roots[model.defaultIndex], { maxElements: settings.cuspStabElements ?? 100000, seconds: settings.cuspStabSeconds ?? 25 });
            rounds.push({ elements: stab.length, rank: c.found ? c.rank : c.best ? c.best.rank : 0, ms: c.ms });
            if (c.found) return { ok: true, method: 'cusp', rank: c.rank, used: stab.length, rounds };
        }
        return { ok: false, text: 'The elements found fixing o show no full lattice of unipotents at a cusp.', rounds };
    }
    let stab = first, last = null;
    for (let attempt = 0; attempt < STAB_SIZES.length; attempt++) {
        if (attempt) {
            const msgs = call(sarithHandler, { id: 1, cmd: 'harvest', seconds: HARVEST_SECONDS, stabCount: exactStabWanted(model, arch) ? EXACT_STAB_COUNT : STAB_SIZES[attempt] + 4 });
            const m = msgs.find((x) => x.msg.type === 'stab');
            if (!m) return { ok: false, text: 'The harvest failed.', rounds };
            stab = m.msg.stab;
        }
        if (!stab.length) continue;
        const ex = exactStabCheck(model, arch, stab, settings);
        if (ex) rounds.push({ elements: ex.used, ms: ex.ms, index: ex.index, limit: ex.limit });
        if (ex && ex.ok) return { ok: true, method: 'coset enumeration', used: ex.used, index: ex.index, rounds };
        const used = stab.slice(0, STAB_SIZES[attempt]);
        const consts = model.degree > 1 ? [{ name: 'w', poly: model.polyTex, near: { re: arch.root.re, im: arch.root.im } }] : [];
        const state = { mats: used.map((e) => e.tex), anti: used.map(() => false), consts };
        const out = runArch(state, settings, false);
        const sm = out.summary;
        if (sm && sm.status === 'verified' && (arch.kind === 'real' ? sm.finiteArea : sm.finiteVolume)) {
            return { ok: true, used: used.length, faces: sm.faces, cusps: sm.cusps, volume: sm.volume, rounds };
        }
        last = { out, sm, used: used.length };
    }
    if (!last) return { ok: false, text: 'The search found no element of Γ, other than the identity, fixing o.', rounds };
    const { out, sm } = last;
    let why;
    if (out.error) why = `Poincaré failed: ${out.error}`;
    else if (sm && sm.status === 'verified') why = arch.kind === 'real' ? `verified, but ${sm.freeArcs} free side${sm.freeArcs === 1 ? '' : 's'} at infinity` : 'verified, but infinite volume';
    else why = 'Poincaré’s conditions did not close up';
    return { ok: false, used: last.used, text: why, rounds };
}

/** Integer matrices from FlashBeam's stabilizer list (tex entries over ℚ), or null if some entry is not an integer. */
function intMats(stab) {
    const out = [];
    for (const e of stab) {
        const m = e.tex.map((t) => String(t).trim());
        if (!m.every((x) => /^-?\d+$/.test(x))) return null;
        out.push(m.map(BigInt));
    }
    return out;
}

/** The Euclidean Bianchi ring (bianchi.js) when Γ lives over ℚ(√−1), ℚ(√−2) or ℚ(√−3) and A splits at its complex place. */
const bianchiOf = (model, arch) => (model.degree === 2 && arch.kind === 'complex' ? bianchiRing(model.polySrc) : null);
/** As many elements of Γ_o as the exact checks want (main.js stabCount). */
const exactStabWanted = (model, arch) => model.degree === 1 || (arch && bianchiOf(model, arch));

/** main.js exactStabCheck: null when it does not apply, else { ok, index, used, ms, limit }. */
function exactStabCheck(model, arch, stab, settings) {
    if (!stab.length) return null;
    const d = bianchiOf(model, arch);
    if (d) {
        // over ℚ(√−1), ℚ(√−2), ℚ(√−3): coset enumeration in the Bianchi group PSL₂(O)
        const mats = wordMatrices(d, model.mats.map((row) => row.map((e) => e.src)), stab.map((e) => e.word), model.polySrc);
        if (!mats) return null;
        const t0 = Date.now();
        const r = indexInBianchi(d, mats, { seconds: settings.tcSeconds ?? 4, maxCosets: settings.tcCosets ?? 400000 });
        return { ok: !!r.index, index: r.index ?? null, used: r.used ?? mats.length, ms: Date.now() - t0, limit: r.limit ?? null, ring: d };
    }
    if (model.degree !== 1 || arch.kind !== 'real') return null;
    const mats = intMats(stab);
    if (!mats) return null;
    if (mats.some((m) => { const d = m[0] * m[3] - m[1] * m[2]; return d !== 1n && d !== -1n; })) return null;
    const t0 = Date.now();
    const r = indexInPGL2Z(mats, { seconds: settings.tcSeconds ?? 2, maxCosets: settings.tcCosets ?? 300000 });
    return { ok: !!r.index, index: r.index ?? null, used: mats.length, ms: Date.now() - t0, limit: r.limit ?? r.error ?? null };
}

// ───────────────────────── the run ─────────────────────────

/**
 * Run the pipeline on poincare's input state { mats, anti, consts }.
 * The record:
 *   verdict    'notdense' | 'discrete' | 'sarith' | 'thin' | 'open' | 'error'
 *   why        for 'open' and 'error': a short code (see the database page)
 *   closure    { kind, tex, dim, order, summary }
 *   zariski    { head, detail }   arith { S, head, k }   congruence { head, detail }
 *   places     [{ key, kind, p, status, headline, detail, presentation?, … }]
 *   sarith     { status, … }      ms: wall time per step
 */
export function runGroup(state, settingsIn = {}) {
    const rec = runSteps(state, settingsIn);
    // an S-arithmetic Γ equals its congruence closure (CSP): the two indices must agree
    const J = rec.congruenceClosure, sa = rec.sarith;
    if (J && J.index && rec.verdict === 'sarith' && sa && sa.index && (sa.kernelIndex ?? 1) === 1) {
        J.agrees = J.index === sa.index;
        if (!J.agrees && (J.status === 'exact' || J.index > sa.index)) J.conflict = true;
    }
    return rec;
}

function runSteps(state, settingsIn) {
    const settings = { ...DEFAULTS, ...settingsIn };
    const rec = { pipeline: PIPELINE_VERSION, ms: {} };
    const clock = (name, t0) => { rec.ms[name] = Date.now() - t0; };

    // read
    let exactCtx, model;
    try {
        ({ exactCtx } = buildGroup(state));
        if (!exactCtx) return { ...rec, verdict: 'error', why: 'not-exact', error: 'Some entry is not an exact algebraic number.' };
        model = fieldModel(exactCtx);
    } catch (e) {
        return { ...rec, verdict: 'error', why: 'read', error: e.message };
    }
    rec.degree = model.degree;

    // 1 · Zariski closure
    let t0 = Date.now();
    let z;
    try {
        z = ZariskiInput.analyze({
            gens: model.mats.map((row) => row.map((e) => e.tex)), consts: [],
            field: model.degree > 1 ? { gen: 'w', poly: model.polySrc, root: model.roots[model.defaultIndex] } : null,
        });
    } catch (e) { z = { ok: false, error: e.message }; }
    clock('zariski', t0);
    if (!z || !z.ok) return { ...rec, verdict: 'error', why: 'zariski', error: z && z.error ? z.error : 'unknown error' };
    const C = z.closure;
    rec.closure = { kind: C.kind, tex: C.tex, dim: C.dim, order: C.order ?? null, summary: C.summary.replace(/⟨S⟩/g, 'Γ') };
    rec.zariski = zariskiLine(z);
    rec.gens = (z.gens || []).map((g) => ({ type: g.type, order: g.order ?? null, tau: g.tauTex }));
    if (C.kind !== 'dense') return { ...rec, verdict: 'notdense' };
    const A = z.arith;
    rec.arith = { S: A.ring.S.map((s) => s.p + (s.e > 1 || s.f > 1 ? `(e${s.e}f${s.f})` : '')), head: A.head, k: A.k.d };

    // trace field ℚ and a split algebra, over a bigger field of definition: conjugate Γ into PGL₂(ℚ)
    // (descent.js) and run the steps over ℚ, which are stronger
    if (model.degree > 1 && A.k.d === 1 && A.A && A.A.split && settings.descent !== false) {
        const D = descendToQ(model.mats.map((row) => row.map((e) => e.src)), model.poly);
        if (D.mats) {
            const q = runSteps({ mats: D.mats, anti: D.mats.map(() => false), consts: [] }, { ...settings, descent: false });
            return { ...q, descended: { mats: D.mats, degree: model.degree, conj: D.conj } };
        }
        rec.descent = { error: D.error };
    }
    // trace field ℚ, A a division algebra split at ∞, over a field with no real place: embed Γ in
    // PGL₂(ℚ(√a)) for a real quadratic subfield of A (descent.js), where the place at ∞ is real
    if (model.degree > 1 && model.signature[0] === 0 && A.k.d === 1 && A.A && !A.A.split && A.spaces && A.spaces.factors.some((f) => f.kind === 'real') && settings.descent !== false) {
        const D = descendToReal(model.mats.map((row) => row.map((e) => e.src)), model.poly);
        if (D.mats) {
            const q = runSteps({ mats: D.mats, anti: D.mats.map(() => false), consts: [{ name: 'w', poly: `w^2-${D.d}`, near: { re: Math.sqrt(Number(D.d)), im: 0 } }] }, { ...settings, descent: false });
            return { ...q, descended: { mats: D.mats, field: `ℚ(√${D.d})`, degree: model.degree } };
        }
        rec.descent = { error: D.error };
    }

    // 2 · discreteness at every place: the primes first (bounded by seconds per prime), then ∞
    t0 = Date.now();
    const places = [];
    const job = {
        poly: model.degree > 1 ? model.polySrc : null,
        mats: model.mats.map((r) => r.map((e) => e.src)),
        numbers: model.numbers, seconds: settings.seconds, maxPrimes: MAX_PRIMES,
    };
    try {
        runFinite({ NR: globalThis.NumberRingEngine, GlobalField, Place, decide, serializeDecision }, job, (msg) => {
            if (msg.type === 'generic') {
                let v;
                if (msg.error) v = { status: 'unknown', headline: 'Undecided', detail: msg.error };
                else if (msg.decision.verdict === 'discrete' && msg.decision.kind === 'finite') v = { status: 'discrete', headline: `Γ is finite, of order ${msg.decision.order}`, detail: '' };
                else if (msg.decision.verdict === 'nondiscrete') v = { status: 'nondiscrete', headline: 'Not discrete — bounded and infinite', detail: msg.decision.reason };
                else v = decisionVerdict(msg.decision);
                places.push({ key: 'generic', kind: 'generic', p: msg.p, ...v });
            } else if (msg.type === 'place' && msg.status !== 'standard') {
                const v = msg.status === 'decided' ? decisionVerdict(msg.decision) : { status: 'unknown', headline: 'Undecided', detail: msg.reason || '' };
                const d = msg.decision;
                places.push({ key: msg.key, kind: 'finite', p: msg.p, index: msg.index, count: msg.count, q: msg.q, ...v,
                    ...(d && d.freeRank != null ? { freeRank: d.freeRank } : {}),
                    ...(d && d.presentation ? { presentation: { complete: true, n: d.presentation.n, relators: d.presentation.relators.map((r) => (r.m > 1 ? (r.enc.length === 1 ? `g${Math.abs(r.enc[0])}^${r.m}` : `(${wordText(r.enc)})^${r.m}`) : wordText(r.enc))) } } : {}),
                    ...(d && d.method ? { method: d.method } : {}) });
            } else if (msg.type === 'primes') {
                rec.primes = { list: msg.primes, complete: msg.complete, capped: msg.capped };
            }
        });
    } catch (e) {
        places.push({ key: 'finite-error', kind: 'finite', status: 'unknown', headline: 'Undecided', detail: e.message });
    }
    const intP = integralPrime(A);                                  // main.js finitePlace
    if (intP) for (const pl of places) if (pl.kind === 'finite' && String(pl.p) === intP && pl.status !== 'discrete') Object.assign(pl, integralPrimeVerdict(intP, A.ring.d ?? 1), { integral: true });
    clock('finite', t0);
    t0 = Date.now();
    const integralKeys = integralPlaces(model, A);                 // main.js startPlaces
    for (const a of model.arch) {
        const st = a.isDefault ? { mats: state.mats, anti: state.anti || state.mats.map(() => false), consts: state.consts || [] } : poincareStateFor(model, a.root);
        const out = runArch(st, settings, true);
        let v = archVerdict(a.kind, out);
        // over ℚ, two exact criteria for Γ⁺ = ⟨A, B⟩ where Poincaré did not decide (fuchsian2.js)
        if (model.degree === 1 && a.kind === 'real' && v.status !== 'discrete' && v.status !== 'nondiscrete') {
            const f = fuchsianPairTest(model.mats.map((row) => row.map((e) => e.src)));
            if (f && f.status === 'discrete') v = { status: 'discrete', headline: 'Discrete', detail: `${f.reason}; Γ⁺ has index ≤ 2 in Γ.`, method: 'fuchsian-pair' };
            if (f && f.status === 'nondiscrete') v = { status: 'nondiscrete', headline: 'Not discrete', detail: `${f.reason}.`, method: 'fuchsian-pair' };
        }
        if (integralKeys && integralKeys.has(a.key)) v = { ...integralVerdict(model, a), integral: true };
        const pl = { key: a.key, kind: a.kind, n: a.n, ...v };
        const sm = out.summary;
        if (sm) {
            Object.assign(pl, { faces: sm.faces, h1: sm.h1 || null, cusps: sm.cusps, finiteArea: sm.finiteArea ?? null, finiteVolume: sm.finiteVolume, volume: sm.volume });
            if (v.status === 'discrete' && sm.presentation && sm.status === 'verified') pl.presentation = presentationOf(sm);
        }
        places.push(pl);
    }
    clock('arch', t0);
    rec.places = places;
    const yes = places.filter((p) => p.status === 'discrete');
    if (yes.length) return { ...rec, verdict: 'discrete' };

    // the congruence closure: the engine's line, and over ℚ the joint closure [Λ : Δ]
    rec.congruence = congruenceLine(A);
    if (model.degree === 1 && A.ring.S.length && settings.congruence !== false) {
        t0 = Date.now();
        try {
            const J = congruenceClosure(model.mats.map((row) => row.map((e) => e.src)), A.ring.S.map((x) => Number(x.p)), A.congruence, { cap: settings.congCap ?? 4000000, seconds: settings.congSeconds ?? 20 });
            rec.congruenceClosure = { status: J.status, index: J.index ?? null, levels: J.levels ?? null, classes: J.classes ?? null, reason: J.reason ?? null, notes: (J.notes || []).slice(0, 3) };
        } catch (e) { rec.congruenceClosure = { status: 'error', reason: e.message }; }
        clock('congruence', t0);
    }



    // 4 · exact first (main.js startSarith): coset enumeration in PGL₂(ℤ[1/S]), then FlashBeam
    t0 = Date.now();
    // (settings.exact === false skips coset enumeration: to test the other certificates against it)
    const splitArch = A.A ? A.k.r1 - A.A.ram.filter((r) => r.kind === 'real').length + A.k.r2 : -1;
    const definite = model.degree > 1 && A.A && A.A.determined && A.ring.S.length > 0
        && (splitArch === 0 || (splitArch === 1 && !(A.A.split && model.degree === 2 && bianchiRing(model.polySrc))));
    const ex = settings.exact === false ? null
        : model.degree === 1 ? exactIndexCheck(model.mats.map((row) => row.map((e) => e.src)), A.ring.S.map((x) => x.p), { seconds: settings.tcSeconds ?? 2, maxCosets: settings.tcCosets ?? 1000000 })
            : definite ? definiteExact(model, A, settings) : (bianchiExact(model, A, settings) ?? numberRingExact(model, A, settings));
    if (ex && ex.index && ex.quaternion) {
        clock('sarith', t0);
        return { ...rec, verdict: 'sarith', sarith: { status: 'index', method: 'coset enumeration in N(𝒪[1/S])/k^×', index: ex.index, S: ex.S, kernelIndex: ex.kernelIndex, bad: ex.bad, ms: ex.ms, tcMs: ex.tcMs, disc: ex.disc, k: ex.k, reps: ex.reps, stabilizers: ex.stabilizers, level: ex.level ? ex.level.N : null } };
    }
    if (ex && ex.index && ex.numberRing) {
        clock('sarith', t0);
        const sub = ex.skipped || ex.kernelIndex > 1;
        const method = `coset enumeration in ${ex.conjugated ? 'a conjugate of ' : ''}PGL₂(O_k)${ex.kernelIndex > 1 ? `, for the subgroup of index ${ex.kernelIndex} fixing a vertex at every prime` : ex.skipped ? ', for the subgroup generated by the generators that lie in it' : ''}`;
        return { ...rec, verdict: 'sarith', sarith: { status: 'index', method, index: ex.index, S: [], kernelIndex: ex.kernelIndex, subgroup: !!sub, used: ex.used, cells: ex.cells, conjugated: ex.conjugated, ms: ex.ms } };
    }
    if (ex && ex.index) {
        clock('sarith', t0);
        return { ...rec, verdict: 'sarith', sarith: { status: 'index', method: ex.ring ? 'coset enumeration in PGL₂(O[1/S])' : 'coset enumeration in PGL₂(ℤ[1/S])', index: ex.index, S: ex.S, kernelIndex: ex.kernelIndex ?? 1, bad: ex.bad, ms: ex.ms, ring: ex.ring ?? null } };
    }
    rec.exactIndex = ex;
    // over ℚ: the vertex orbits on ∏ T_p with Stallings stabilizers (orbits.js) decide both ways
    // when they close; seeded with FlashBeam's covering below when there is one
    const orbits = (seconds) => {
        if (model.degree !== 1 || settings.orbits === false || !A.ring.S.length) return null;
        const m = call(sarithHandler, { id: 2, cmd: 'orbits', rows: model.mats.map((row) => row.map((e) => e.src)), S: A.ring.S.map((x) => x.p), seconds, maxGraph: settings.orbitGraph }).map((x) => x.msg);
        const o = m.find((x) => x.type === 'orbits');
        if (!o) return { status: 'error', error: (m.find((x) => x.type === 'error') || {}).error ?? 'no answer' };
        return o;
    };
    const orbitVerdict = (o) => {
        if (!o) return null;
        rec.orbits = { status: o.status, verdict: o.verdict, index: o.index ?? null, reps: o.reps, defined: o.defined, kernelIndex: o.kernelIndex, seeded: o.seeded, ms: o.ms, error: o.error, finiteStabilizers: !!o.finiteStabilizers,
            groups: (o.groups || []).slice(0, 8).map((g) => ({ vertices: g.vertices, finite: g.finite, index: g.index })) };
        if (o.verdict === 'sarith') return { ...rec, verdict: 'sarith', sarith: { ...(rec.sarith || {}), status: 'orbits', method: 'vertex orbits on ∏T_p with Stallings stabilizers', index: o.index, kernelIndex: o.kernelIndex } };
        if (o.verdict === 'thin' && o.finiteStabilizers && A.ring.S.length === 1) {
            // finite vertex stabilizers, finitely many orbits on the tree: a cocompact lattice there
            const p = String(A.ring.S[0].p);
            const pl = (rec.places || []).find((x) => x.kind === 'finite' && String(x.p) === p);
            const headline = 'Discrete — a cocompact lattice on the tree';
            const detail = `${o.kernelIndex > 1 ? `A subgroup of index ${o.kernelIndex}` : 'Γ'} has ${o.reps} vertex orbit${o.reps === 1 ? '' : 's'} on T_${p} with finite stabilizers (Stallings folding in PGL₂(ℤ)), so Γ is discrete at ${p} and virtually free.`;
            if (pl) Object.assign(pl, { status: 'discrete', headline, detail, method: 'orbits' });
            return { ...rec, verdict: 'discrete' };
        }
        if (o.verdict === 'thin') return { ...rec, verdict: 'thin', why: 'orbits' };
        return null;
    };
    // batch-only: over ℚ, FlashBeam almost never certifies what coset enumeration cannot; skip it when asked
    if (settings.flashbeam === false && ex) {
        const v = orbitVerdict(orbits(settings.orbitSeconds ?? 30));
        clock('sarith', t0);
        return v ?? { ...rec, verdict: 'open', why: 'index-limit' };
    }

    const factors = archFactors(model, A);
    const ap = sarithApplicable(A, factors);
    if (!A.ring.S.length && !factors.length) {
        clock('sarith', t0);
        return { ...rec, verdict: 'open', why: 'bounded', sarith: { status: 'na', note: 'Γ is bounded at every place.' } };
    }
    // a lattice of unipotents at one cusp makes Γ S-arithmetic (cusps.js: Vaserstein; Benoist–Oh), over
    // any field where A splits and O_S^× is infinite; first on a short breadth-first search of Γ
    const vas = vasersteinApplies(model, A) && settings.cusps !== false;
    if (vas) {
        const c = cuspCertificate(model.mats.map((row) => row.map((e) => e.src)), model.poly, model.roots[model.defaultIndex], { maxElements: settings.cuspElements ?? 120000, seconds: settings.cuspSeconds ?? 40 });
        rec.cusps = cuspRecord(c, model, 'generators');
        if (c.found) { clock('sarith', t0); return { ...rec, verdict: 'sarith', sarith: cuspSarith(c, 'generators') }; }
    }
    // as main.js: without a certificate to search for (S = ∅, say), FlashBeam still runs when the cusp
    // certificate applies, for its lowest elements (the parabolics of an arithmetic Γ are long words)
    if (!ap.certifiable && !(vas && factors.length)) {
        clock('sarith', t0);
        return { ...rec, verdict: 'open', why: ap.code, sarith: { status: 'na', note: ap.note } };
    }
    const msgs = call(sarithHandler, { id: 1, job: sarithJob(model, A, factors, settings) }).map((m) => m.msg);
    const err = msgs.find((m) => m.type === 'error');
    const done = msgs.find((m) => m.type === 'done');
    if (err || !done) {
        clock('sarith', t0);
        return { ...rec, verdict: 'open', why: 'sarith-error', sarith: { status: 'error', error: err ? err.error : 'no answer' } };
    }
    const S = {
        status: done.status, iterations: done.iterations, seconds: Math.round(done.seconds * 10) / 10,
        reps: done.reps.length, covered: done.covered, targets: done.targets,
        dirichlet: done.dirichlet.pairs.length, relations: done.relations.length,
        shortRelations: done.relations.slice(0, 4).map(wordText),
    };
    rec.sarith = S;
    if (!ap.certifiable) {
        const m = call(sarithHandler, { id: 1, cmd: 'elements', count: settings.cuspPool ?? 20000 }).map((x) => x.msg).find((x) => x.type === 'elements');
        let v = null;
        if (m && m.words.length) {
            const c = cuspCertificatePool(model.mats.map((row) => row.map((e) => e.src)), model.poly, m.words, model.roots[model.defaultIndex], { maxElements: 20000, seconds: settings.cuspSeconds ?? 40 });
            rec.cuspsArchive = cuspRecord(c, model, 'FlashBeam archive');
            if (c.found) v = { ...rec, verdict: 'sarith', sarith: { ...cuspSarith(c, 'FlashBeam archive'), flashbeam: S } };
        }
        clock('sarith', t0);
        return v ?? { ...rec, verdict: 'open', why: ap.code, sarith: { ...S, status: 'na', note: ap.note } };
    }
    {
        const v = orbitVerdict(orbits(settings.orbitSeconds ?? 30));
        if (v) { clock('sarith', t0); return v; }
    }
    // before calling Γ open: the cusp certificate on FlashBeam's lowest elements
    const archiveCusp = () => {
        if (!vas) return null;
        const m = call(sarithHandler, { id: 1, cmd: 'elements', count: settings.cuspPool ?? 20000 }).map((x) => x.msg).find((x) => x.type === 'elements');
        if (!m || !m.words.length) return null;
        const c = cuspCertificatePool(model.mats.map((row) => row.map((e) => e.src)), model.poly, m.words, model.roots[model.defaultIndex], { maxElements: 20000, seconds: settings.cuspSeconds ?? 40 });
        rec.cuspsArchive = cuspRecord(c, model, 'FlashBeam archive');
        return c.found ? { ...rec, verdict: 'sarith', sarith: { ...cuspSarith(c, 'FlashBeam archive'), flashbeam: S } } : null;
    };
    // the vertex orbits without a covering (main.js autoCovering): Γ ⊂ PGL₂(k) Zariski dense and an
    // element of infinite order fixing o make the closure of Γ in ∏_{𝔭∈S} PGL₂(k_𝔭) open, so it
    // contains ∏ PSL₂(k_𝔭) and the vertex orbits are the classes of vertex types
    const auto = settings.autoCovering !== false && done.status !== 'covered' && ap.arch && model.degree === A.k.d && done.stab && done.stab.length
        ? infiniteOrderWord(model.mats.map((row) => row.map((e) => e.src)), model.poly, done.stab.map((e) => e.word)) : null;
    if (auto) S.auto = { word: wordText(auto.word), why: auto.why };
    const qCertsFallback = () => {
        if (model.degree !== 1 || !A.ring.S.length || settings.qCerts === false) return null;
        const rows = model.mats.map((row) => row.map((e) => e.src));
        const Sprimes = A.ring.S.map((x) => x.p);
        const levels = rec.congruence && rec.congruence.levels
            ? Object.entries(rec.congruence.levels).map(([p, k]) => Number(p) ** Number(k))
            : null;
        const cs = call(sarithHandler, { id: 1, cmd: 'congStab', rows, S: Sprimes, levels, seconds: settings.congStabSeconds ?? 8 })
            .map((x) => x.msg).find((x) => x.type === 'congStab');
        if (cs && cs.ok) {
            return { ...rec, verdict: 'sarith', sarith: { ...S, status: 'congStab', method: cs.method, stabIndex: cs.stabIndex, deltaIndex: cs.deltaIndex, levels: cs.levels, ms: cs.ms } };
        }
        const archCheck = (mats) => {
            const m = call(archHandler, { id: 1, state: { mats, anti: mats.map(() => false), consts: [] }, maxFaces: 160, maxDepth: 10, certify: true });
            const d = m.find((x) => x.phase === 'done');
            return d && d.summary && d.summary.status === 'verified' ? { verified: true, faces: d.summary.faces } : null;
        };
        const th = certifyThinQ(rows, Sprimes, { seconds: settings.thinSeconds ?? 6, archCheck });
        if (th && th.thin) {
            return { ...rec, verdict: 'thin', why: th.method, thinCert: { method: th.method, detail: texToText(th.detail), ms: th.ms, presentation: th.presentation ? th.presentation.relators.map(wordText) : null } };
        }
        return null;
    };
    if (!auto && (done.status !== 'covered' || !(done.verify && done.verify.ok))) {
        const v = archiveCusp() || qCertsFallback();
        clock('sarith', t0);
        return v ?? { ...rec, verdict: 'open', why: done.status === 'covered' ? 'verify-failed' : 'no-covering' };
    }
    if (!ap.arch) {
        clock('sarith', t0);
        return { ...rec, verdict: 'sarith' };
    }
    const stab = stabilizerCheck(model, ap.arch, done.stab, settings, A);
    S.stab = stab;
    if (!stab.ok) {
        const v = archiveCusp() || qCertsFallback();
        if (v) { clock('sarith', t0); return v; }
    }
    clock('sarith', t0);
    return stab.ok ? { ...rec, verdict: 'sarith' } : { ...rec, verdict: 'open', why: 'stab-not-lattice' };
}

/** poincare's presentation in the input generators, as text. */
function presentationOf(sm) {
    const P = sm.presentation;
    // poincare's relators are { enc, m }: the word enc to the power m
    const rel = (r) => (Array.isArray(r) ? wordText(r) : r && r.enc ? (r.m > 1 ? `(${wordText(r.enc)})^${r.m}` : wordText(r.enc)) : String(r));
    const out = { complete: sm.presentationComplete !== false };
    if (P && Array.isArray(P.relators)) out.relators = P.relators.slice(0, 12).map(rel);
    if (P && P.n != null) out.n = P.n;
    if (sm.simplified) out.simplified = { n: sm.simplified.n, relators: (sm.simplified.relators || []).slice(0, 12).map(rel) };
    return out;
}

export { texToText, wordText };
