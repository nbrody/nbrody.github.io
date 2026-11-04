/**
 * engine.js — Discreteness decision for finitely generated subgroups of PGL₂(ℚ).
 *
 * Strategy (Milestone 1):
 *  1. Classify each generator exactly (Mat2Q.classify).
 *  2. Elementary/reducible analysis (exact where possible):
 *       - reducible ⟺ det(AB−BA)=0 for every pair (additive commutator nilpotent);
 *       - common AXIS (two shared boundary fixed points) ⇒ multiplier subgroup test:
 *         rational multipliers with multiplicative rank ≥ 2 ⇒ NON-DISCRETE, with an
 *         explicit near-identity hyperbolic witness word (the classic "no elliptic"
 *         non-discreteness certificate, e.g. ⟨diag(2,½), diag(3,⅓)⟩);
 *       - single common boundary point, all parabolic ⇒ DISCRETE (≅ ℤ).
 *  3. Generic best-first ("beam") search over the Cayley graph: the first
 *     orientation-preserving elliptic of INFINITE order (t=tr²/det ∈ (0,4)∖{1,2,3})
 *     is an EXACT certificate of non-discreteness — return it with its word.
 *     If the frontier closes up, the group is FINITE ⇒ DISCRETE.
 *  4. Jørgensen inequality computed as a numeric diagnostic.
 */

import { Mat2Q, rotationAngleFromT } from './mat2.js';
import { BigRational } from './rational.js';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
export function genLabel(i) { return i < 26 ? ALPHA[i] : `g${i + 1}`; }
function invLabel(i) { return i < 26 ? ALPHA[i].toUpperCase() : `g${i + 1}⁻¹`; }

// ---------- small bigint helpers ----------
function babs(x) { return x < 0n ? -x : x; }
function bmax4(a, b, c, d) { let m = babs(a); for (const x of [b, c, d]) { const v = babs(x); if (v > m) m = v; } return m; }
function perfectSqrt(n) {            // exact integer sqrt or null
    if (n < 0n) return null;
    if (n < 2n) return n;
    let x = BigInt(Math.floor(Math.sqrt(Number(n)))) + 2n;
    while (x * x > n) x--;
    return x * x === n ? x : null;
}
function factorize(n) {              // n: positive BigInt → Map<bigint,int>
    const f = new Map();
    n = babs(n);
    for (let p = 2n; p * p <= n && p < 100000n; p++) {
        while (n % p === 0n) { f.set(p, (f.get(p) || 0) + 1); n /= p; }
    }
    if (n > 1n) f.set(n, (f.get(n) || 0) + 1);
    return f;
}

// ---------- min-heap for best-first search ----------
class MinHeap {
    constructor() { this.a = []; }
    size() { return this.a.length; }
    push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].score <= a[i].score) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a; const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < a.length && a[l].score < a[s].score) s = l; if (r < a.length && a[r].score < a[s].score) s = r; if (s === i) break;[a[s], a[i]] = [a[i], a[s]]; i = s; } } return top; }
}

// ---------- floating 2×2 (det-1 normalized) for Jørgensen / numeric tests ----------
function fmat(m) { // Mat2Q → det-1 float matrix (only meaningful for det>0)
    const { a, b, c, d } = m.floats();
    const det = a * d - b * c;
    const s = Math.sqrt(Math.abs(det));
    return det > 0 ? [a / s, b / s, c / s, d / s] : [a, b, c, d];
}
function fmul(X, Y) { return [X[0] * Y[0] + X[1] * Y[2], X[0] * Y[1] + X[1] * Y[3], X[2] * Y[0] + X[3] * Y[2], X[2] * Y[1] + X[3] * Y[3]]; }
function finv(X) { const det = X[0] * X[3] - X[1] * X[2]; return [X[3] / det, -X[1] / det, -X[2] / det, X[0] / det]; }
function ftr(X) { return X[0] + X[3]; }

/** Jørgensen number for a pair: |tr²A − 4| + |tr[A,B] − 2|. <1 (non-elementary) ⇒ non-discrete. */
function jorgensen(A, B) {
    const a = fmat(A), b = fmat(B);
    const comm = fmul(fmul(a, b), fmul(finv(a), finv(b)));
    const trA = ftr(a);
    return Math.abs(trA * trA - 4) + Math.abs(ftr(comm) - 2);
}

// ---------- word utilities ----------
function buildSym(mats) {
    const sym = [];
    mats.forEach((m, i) => {
        sym.push({ mat: m, label: genLabel(i), idx: sym.length });
        sym.push({ mat: m.inv(), label: invLabel(i), idx: sym.length });
    });
    return sym;
}
const pairIdx = k => (k % 2 === 0 ? k + 1 : k - 1);
function wordToString(word, sym) { return word.map(k => sym[k].label).join(''); }

// ---------- elementary / reducible analysis ----------
function addCommutatorDet(A, B) {           // det(AB − BA), exact BigInt
    const ab = { a: A.a * B.a + A.b * B.c, b: A.a * B.b + A.b * B.d, c: A.c * B.a + A.d * B.c, d: A.c * B.b + A.d * B.d };
    const ba = { a: B.a * A.a + B.b * A.c, b: B.a * A.b + B.b * A.d, c: B.c * A.a + B.d * A.c, d: B.c * A.b + B.d * A.d };
    const C = { a: ab.a - ba.a, b: ab.b - ba.b, c: ab.c - ba.c, d: ab.d - ba.d };
    return C.a * C.d - C.b * C.c;
}

function rankOverQ(vectors, primes) {       // rank of integer exponent vectors over ℚ
    const rows = vectors.map(v => primes.map(p => new BigRational(BigInt(v.get(p) || 0))));
    let rank = 0;
    for (let col = 0; col < primes.length && rank < rows.length; col++) {
        let piv = -1;
        for (let r = rank; r < rows.length; r++) if (!rows[r][col].isZero()) { piv = r; break; }
        if (piv < 0) continue;
        [rows[rank], rows[piv]] = [rows[piv], rows[rank]];
        const pivVal = rows[rank][col];
        for (let r = 0; r < rows.length; r++) {
            if (r === rank || rows[r][col].isZero()) continue;
            const f = rows[r][col].div(pivVal);
            for (let c = col; c < primes.length; c++) rows[r][c] = rows[r][c].sub(f.mul(rows[rank][c]));
        }
        rank++;
    }
    return rank;
}

/** Multiplier (rational) of a diagonalizable element: ν = λ/μ with |ν|≥1, or null if irrational. */
function rationalMultiplier(m) {
    const T = m.tr(), D = m.det();
    const s = perfectSqrt(T * T - 4n * D);
    if (s === null || D === 0n) return null;
    const lam = new BigRational(T + s, 2n), mu = new BigRational(T - s, 2n);
    if (mu.isZero()) return null;
    let nu = lam.div(mu);
    if (nu.compareTo(BigRational.ONE) < 0) nu = nu.inv();      // |ν| ≥ 1 branch
    return nu.sign() < 0 ? nu.neg() : nu;
}

function elementaryAnalysis(mats) {
    const nonScalar = mats.filter(m => !m.isIdentity());
    if (nonScalar.length === 0) return { verdict: 'discrete', reason: 'Trivial group (all generators are the identity in PGL₂).', kind: 'finite', order: 1, exact: true };

    // reducible test: additive commutator nilpotent for every pair
    for (let i = 0; i < nonScalar.length; i++)
        for (let j = i + 1; j < nonScalar.length; j++)
            if (addCommutatorDet(nonScalar[i], nonScalar[j]) !== 0n) return null;  // irreducible ⇒ generic path

    // reducible. Determine common boundary fixed point(s) numerically.
    const fp0 = nonScalar[0].boundaryFixedPoints();
    if (fp0.length === 0) return null;          // common fixed point is interior (rotation group) ⇒ let generic handle
    const fixedByAll = x => nonScalar.every(m => {
        const { a, b, c, d } = m.floats();
        if (!isFinite(x)) return Math.abs(c) < 1e-9;
        const den = c * x + d;
        if (Math.abs(den) < 1e-12) return false;
        return Math.abs((a * x + b) / den - x) < 1e-7 * (1 + Math.abs(x));
    });
    const common = fp0.filter(fixedByAll);
    if (common.length === 0) return null;

    if (common.length >= 2) {
        // common AXIS: dilation/multiplier subgroup test
        const nus = nonScalar.map(rationalMultiplier);
        if (nus.every(n => n !== null)) {
            const prime = new Set();
            const vecs = nus.map(n => {
                const v = new Map();
                for (const [p, e] of factorize(n.num)) { v.set(p, (v.get(p) || 0) + e); prime.add(p); }
                for (const [p, e] of factorize(n.den)) { v.set(p, (v.get(p) || 0) - e); prime.add(p); }
                return v;
            });
            const primes = [...prime];
            const rank = rankOverQ(vecs, primes);
            if (rank >= 2) {
                const w = multiplierWitness(mats, nus);
                return {
                    verdict: 'non-discrete', exact: true, kind: 'elementary-axis',
                    reason: 'Generators share a common axis but their hyperbolic multipliers are multiplicatively independent (rank ≥ 2), so translation lengths are incommensurable ⇒ the group is dense along the axis (non-discrete). No elliptic element exists; the certificate is a near-identity hyperbolic.',
                    witness: w
                };
            }
            return {
                verdict: 'discrete', exact: true, kind: 'elementary-cyclic',
                reason: 'Reducible group with a common axis and multiplicatively dependent multipliers (rank ≤ 1) ⇒ the dilation subgroup is cyclic ⇒ discrete (elementary, virtually ℤ).'
            };
        }
        // irrational multipliers → numeric commensurability
        return numericAxisVerdict(nonScalar);
    }

    // single common boundary fixed point (affine action fixing ∞)
    const allParabolic = nonScalar.every(m => { const c = m.classify(); return c.kind === 'parabolic'; });
    if (allParabolic) return {
        verdict: 'discrete', exact: true, kind: 'elementary-parabolic',
        reason: 'All generators fix a single boundary point and are parabolic ⇒ a group of (rational) translations, which is infinite cyclic ⇒ discrete.'
    };
    // dilation + something fixing one point: generically non-discrete — confirm numerically
    const near = numericNearIdentity(mats, { maxNodes: 20000, eps: 1e-3, maxWord: 30 });
    if (near) return {
        verdict: 'non-discrete', exact: false, kind: 'elementary-affine',
        reason: 'Elementary group fixing one boundary point and containing a hyperbolic element. Such a group is discrete only if cyclic; a near-identity element was found (numerically), so it is non-discrete.',
        witness: near
    };
    return {
        verdict: 'inconclusive', exact: false, kind: 'elementary-affine',
        reason: 'Elementary group fixing one boundary point. No near-identity element found within budget; likely discrete (cyclic), but not certified.'
    };
}

function multiplierWitness(mats, nus) {
    const logs = nus.map(n => Math.log(n.toNumber()));
    const k = mats.length, N = k <= 3 ? 6 : 3;
    let best = null;
    const exps = new Array(k).fill(0);
    const rec = (i) => {
        if (i === k) {
            if (exps.every(e => e === 0)) return;
            let s = 0, mag = 0; for (let j = 0; j < k; j++) { s += exps[j] * logs[j]; mag += Math.abs(exps[j]); }
            if (Math.abs(s) < 1e-9) return;                  // exactly identity multiplier — skip
            if (!best || Math.abs(s) < best.logLen - 1e-15 || (Math.abs(Math.abs(s) - best.logLen) < 1e-12 && mag < best.mag))
                best = { exps: exps.slice(), logLen: Math.abs(s), mag };
            return;
        }
        for (let e = -N; e <= N; e++) { exps[i] = e; rec(i + 1); }
        exps[i] = 0;
    };
    rec(0);
    if (!best) return null;
    // build the word & exact product
    let M = Mat2Q.identity(); const word = [];
    best.exps.forEach((e, i) => {
        const g = e >= 0 ? mats[i] : mats[i].inv();
        for (let r = 0; r < Math.abs(e); r++) { M = M.mul(g); word.push(2 * i + (e >= 0 ? 0 : 1)); }
    });
    return { word, mat: M, translationLength: best.logLen, kind: 'hyperbolic', numeric: true,
             expvec: best.exps };
}

function numericAxisVerdict(nonScalar) {
    const nu = m => {                                  // numeric hyperbolic multiplier |λ/μ|
        const T = Number(m.tr()), D = Number(m.det()), disc = T * T - 4 * D;
        if (disc <= 0) return 1;
        const r = (Math.abs(T) + Math.sqrt(disc)) / 2;
        return Math.abs(r / (D / r));
    };
    const ls = nonScalar.map(m => Math.abs(Math.log(nu(m)))).filter(x => x > 1e-9);
    if (ls.length <= 1)
        return { verdict: 'discrete', exact: false, kind: 'elementary-cyclic', reason: 'Common axis with a single translation length ⇒ cyclic ⇒ discrete (numeric).' };
    const irrational = ls.some(x => !isNearRational(x / ls[0], 1e-6, 1000));
    return irrational
        ? { verdict: 'non-discrete', exact: false, kind: 'elementary-axis', reason: 'Common axis with incommensurable (irrational-ratio) translation lengths ⇒ dense ⇒ non-discrete (numeric).' }
        : { verdict: 'discrete', exact: false, kind: 'elementary-cyclic', reason: 'Common axis with commensurable translation lengths ⇒ cyclic ⇒ discrete (numeric).' };
}
function isNearRational(x, tol, maxDen) {
    for (let den = 1; den <= maxDen; den++) { const num = Math.round(x * den); if (Math.abs(x - num / den) < tol) return true; }
    return false;
}

// ---------- numeric near-identity fallback (general non-discreteness heuristic) ----------
function numericNearIdentity(mats, { maxNodes = 30000, eps = 1e-3, maxWord = 36 } = {}) {
    const sym = buildSym(mats);
    const start = sym.map((s, k) => ({ f: fmat(s.mat), word: [k], last: k }));
    const heap = new MinHeap();
    const dist = f => Math.min(Math.hypot(f[0] - 1, f[1], f[2], f[3] - 1), Math.hypot(f[0] + 1, f[1], f[2], f[3] + 1));
    const seen = new Set();
    const key = f => f.map(x => Math.round(x * 1e6)).join(',');
    for (const s of start) heap.push({ ...s, score: dist(s.f) });
    let nodes = 0;
    while (heap.size() && nodes < maxNodes) {
        const n = heap.pop(); nodes++;
        const d = dist(n.f);
        if (d < eps && n.word.length > 0) {
            let M = Mat2Q.identity(); for (const k of n.word) M = M.mul(sym[k].mat);
            if (!M.isIdentity()) return { word: n.word, mat: M, dist: d, numeric: true };
        }
        if (n.word.length >= maxWord) continue;
        const pk = pairIdx(n.last);
        for (let k = 0; k < sym.length; k++) {
            if (k === pk) continue;
            const f = fmul(n.f, fmat(sym[k].mat));
            const kk = key(f);
            if (seen.has(kk)) continue; seen.add(kk);
            heap.push({ f, word: n.word.concat(k), last: k, score: dist(f) });
        }
    }
    return null;
}

// ---------- main analysis ----------
export function analyzeDiscreteness(mats, opts = {}) {
    const { maxElements = 40000, maxWord = 44, timeMs = 4000 } = opts;
    const sym = buildSym(mats);

    // per-generator classification
    const generators = mats.map((m, i) => ({ index: i, label: genLabel(i), mat: m, cls: m.classify() }));

    // immediate generator-level certificate (an input generator is an infinite-order elliptic)
    for (const g of generators) {
        if (g.cls.kind === 'elliptic' && g.cls.infiniteOrder) {
            return finalize({
                verdict: 'non-discrete', exact: true, kind: 'elliptic',
                reason: `Generator ${g.label} is itself an elliptic element of infinite order (t=${g.cls.t.toString()} ∉ {0,1,2,3}).`,
                witness: { word: [2 * g.index], mat: g.mat, cls: g.cls }
            }, { generators, sym, mats, explored: 0 });
        }
    }

    // elementary / reducible analysis
    const elem = elementaryAnalysis(mats);
    if (elem) return finalize(elem, { generators, sym, mats, explored: 0 });

    // generic best-first search
    const visited = new Set([Mat2Q.identity().key()]);
    const heap = new MinHeap();
    let certificate = null, finiteCounts = { elliptic: 0, parabolic: 0, hyperbolic: 0, reflection: 0, glide: 0 };

    const scoreOf = (m, wlen) => { const mx = bmax4(m.a, m.b, m.c, m.d); return (mx === 0n ? 0 : mx.toString(2).length) + wlen * 0.001; };
    const consider = (m, word, last) => {
        const key = m.key();
        if (visited.has(key)) return false;
        visited.add(key);
        const cls = m.classify();
        if (cls.kind === 'elliptic' && cls.infiniteOrder) { certificate = { mat: m, word, cls }; return true; }
        if (finiteCounts[cls.kind] !== undefined) finiteCounts[cls.kind]++;
        heap.push({ mat: m, word, last, score: scoreOf(m, word.length) });
        return false;
    };

    for (let k = 0; k < sym.length && !certificate; k++) consider(sym[k].mat, [k], k);

    let explored = 0, timedOut = false, hitBudget = false;
    const t0 = performance.now();
    while (!certificate && heap.size()) {
        if (visited.size > maxElements) { hitBudget = true; break; }
        if ((explored & 511) === 0 && performance.now() - t0 > timeMs) { timedOut = true; break; }
        const node = heap.pop(); explored++;
        if (node.word.length >= maxWord) continue;
        const pk = pairIdx(node.last);
        for (let k = 0; k < sym.length; k++) {
            if (k === pk) continue;
            if (consider(node.mat.mul(sym[k].mat), node.word.concat(k), k)) break;
        }
    }

    if (certificate)
        return finalize({
            verdict: 'non-discrete', exact: true, kind: 'elliptic',
            reason: `Found a word of length ${certificate.word.length} that is elliptic of infinite order (t=${certificate.cls.t.toString()} ∈ (0,4)∖{1,2,3}), which is impossible in a discrete group.`,
            witness: certificate
        }, { generators, sym, mats, explored, elementCount: visited.size });

    if (heap.size() === 0 && !timedOut && !hitBudget)
        return finalize({
            verdict: 'discrete', exact: true, kind: 'finite',
            reason: `The Cayley graph closed up after enumerating ${visited.size} distinct elements ⇒ the group is FINITE (order ${visited.size}) ⇒ discrete.`,
            order: visited.size
        }, { generators, sym, mats, explored, elementCount: visited.size });

    // no certificate within budget — try numeric fallback to strengthen the verdict
    const near = numericNearIdentity(mats, { maxNodes: 30000, eps: 1e-3 });
    if (near)
        return finalize({
            verdict: 'non-discrete', exact: false, kind: 'near-identity',
            reason: `No exact elliptic certificate within the budget, but a non-trivial word was found numerically within distance ${near.dist.toExponential(2)} of the identity ⇒ non-discrete (numeric; increase the budget to seek an exact elliptic witness).`,
            witness: near
        }, { generators, sym, mats, explored, elementCount: visited.size });

    return finalize({
        verdict: 'inconclusive', exact: false, kind: 'budget',
        reason: `No non-discreteness certificate found among ${visited.size} elements (depth ≤ ${maxWord}). The group is likely discrete; a fundamental-domain / Poincaré certificate (next milestone) is needed to confirm.`,
        elementCount: visited.size
    }, { generators, sym, mats, explored, elementCount: visited.size });
}

function finalize(result, ctx) {
    const { generators, sym, mats } = ctx;
    result.generators = generators;
    result.explored = ctx.explored;
    if (ctx.elementCount !== undefined) result.elementCount = ctx.elementCount;

    // attach pretty word + classification + (for elliptic) rotation angle to the witness
    if (result.witness && result.witness.word) {
        const w = result.witness;
        w.wordStr = wordToString(w.word, sym);
        if (!w.cls && w.mat) w.cls = w.mat.classify();
        if (w.cls && w.cls.kind === 'elliptic') {
            const ang = rotationAngleFromT(w.cls.t);
            w.angleRad = ang; w.angleDeg = ang * 180 / Math.PI; w.angleOverPi = ang / Math.PI;
        }
    }

    // Jørgensen diagnostic over generator pairs with det>0
    const jorg = [];
    const orient = mats.filter(m => m.det() > 0n);
    for (let i = 0; i < orient.length; i++)
        for (let j = i + 1; j < orient.length; j++) {
            const val = jorgensen(orient[i], orient[j]);
            jorg.push({ i, j, value: val });
        }
    result.jorgensen = jorg;
    result.minJorgensen = jorg.length ? Math.min(...jorg.map(x => x.value)) : null;
    return result;
}
