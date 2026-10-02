/**
 * Deciding discreteness of ⟨g₁, …, g_r⟩ ⊂ PGL₂(K) in PGL₂(K_𝔭), through its
 * action on the Bruhat–Tits tree. A port of SO3DecisionAlgorithm's local stage
 * (algorithm/geometry/{local,discreteness}.py) from quaternions to matrices
 * over a number field; all arithmetic is exact.
 *
 *  1. Boundedness. If every generator and every product of two generators is
 *     elliptic, the group fixes a point (Serre's lemma and the Helly property
 *     of trees). A bounded group is discrete iff it is finite; finiteness is
 *     decided exactly, since an element of finite order m in PGL₂(K) has
 *     φ(m) ≤ 2[K:ℚ] and a finite subgroup has order at most max(60, 2m).
 *  2. Conder's purely hyperbolic Nielsen test for two generators
 *     (arXiv:1908.11114, Algorithm 4.1), on translation lengths.
 *  3. Markowitz's reduction in any rank (arXiv:2308.16359, Algorithm 1):
 *     Nielsen moves that shorten the displacement |g| = d(o, g·o) from the base
 *     vertex o, ties broken by the order of initial half-paths, until the basis
 *     is N-reduced (checked independently against N1, N2, N3: then the group
 *     is free on it and discrete) or contains an elliptic element.
 *  4. An elliptic of infinite order lies in a compact stabilizer: not
 *     discrete. One of finite order is torsion, which does not decide. Then
 *     pass to the congruence kernel mod a prime 𝔮 with e(𝔮|ℓ) < ℓ − 1,
 *     which is torsion-free and of finite index (Schreier generators from the
 *     whole finite image), and run step 3 on it.
 *     The complete two-generator classification of Conder–Schillewaert
 *     (arXiv:2208.12404) is not implemented wholesale, as in SO3.
 *
 * Resource limits give `unknown`, never a verdict.
 */
import { Place } from './localField.js';
import { translationLength } from './groupWords.js';

class LimitReached extends Error {}

export class Budget {
    constructor({ seconds = 6, products = 250000, now = () => Date.now() } = {}) {
        this.now = now;
        this.deadline = now() + seconds * 1000;
        this.limit = products;
        this.products = 0;
    }
    check() {
        if (this.now() > this.deadline) throw new LimitReached('time limit');
        if (this.products >= this.limit) throw new LimitReached('product limit');
    }
}

// ───────────────────────── matrices over K ─────────────────────────

const ENTRIES = ['a', 'b', 'c', 'd'];
const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const blcm = (a, b) => (a / bgcd(a, b)) * b;

/** Scale by a rational so all coordinates are coprime integers, first nonzero positive. */
export function primitive(F, x) {
    const es = ENTRIES.map((k) => x[k]);
    let L = 1n;
    for (const e of es) L = blcm(L, e.den);
    const ints = es.map((e) => e.v.map((t) => t * (L / e.den)));
    let G = 0n;
    for (const arr of ints) for (const t of arr) G = bgcd(G, t);
    if (G === 0n) throw new Error('zero matrix');
    let sign = 1n;
    outer: for (const arr of ints) for (const t of arr) if (t !== 0n) { sign = t < 0n ? -1n : 1n; break outer; }
    const out = {};
    for (let i = 0; i < 4; i++) out[ENTRIES[i]] = { v: ints[i].map((t) => (t / G) * sign), den: 1n };
    return out;
}

export function mmul(F, x, y) {
    return primitive(F, {
        a: F.add(F.mul(x.a, y.a), F.mul(x.b, y.c)), b: F.add(F.mul(x.a, y.b), F.mul(x.b, y.d)),
        c: F.add(F.mul(x.c, y.a), F.mul(x.d, y.c)), d: F.add(F.mul(x.c, y.b), F.mul(x.d, y.d)),
    });
}
export const adj = (F, x) => ({ a: x.d, b: F.neg(x.b), c: F.neg(x.c), d: x.a });
export const isScalar = (F, x) => F.isZero(x.b) && F.isZero(x.c) && F.equals(x.a, x.d);
const det = (F, x) => F.sub(F.mul(x.a, x.d), F.mul(x.b, x.c));

/** A key equal for equal elements of PGL₂(K): divide by the first nonzero entry. */
export function projKey(F, x) {
    const e = ENTRIES.map((k) => x[k]).find((t) => !F.isZero(t));
    const inv = F.inv(e);
    return ENTRIES.map((k) => F.key(F.mul(x[k], inv))).join(';');
}

// ───────────────────────── words ─────────────────────────

/** Words are arrays of signed 1-based generator indices; the leftmost acts last. */
export function reduceWord(w) {
    const out = [];
    for (const x of w) {
        if (out.length && out[out.length - 1] === -x) out.pop();
        else out.push(x);
    }
    return out;
}
export const inverseWord = (w) => w.slice().reverse().map((x) => -x);
const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const wordText = (w) => (w.length ? w.map((x) => `g${String(Math.abs(x)).split('').map((c) => SUB[+c]).join('')}${x < 0 ? '⁻¹' : ''}`).join('·') : 'e');

/** The matrix of a word. */
export function evaluateWord(F, mats, w) {
    let m = { a: F.one(), b: F.zero(), c: F.zero(), d: F.one() };
    for (const x of w) m = mmul(F, m, x > 0 ? mats[x - 1] : adj(F, mats[-x - 1]));
    return m;
}

// ───────────────────────── orders of elements ─────────────────────────

function phi(m) { let r = m; for (let p = 2; p * p <= m; p++) if (m % p === 0) { while (m % p === 0) m /= p; r -= r / p; } if (m > 1) r -= r / m; return r; }

/** The largest m with φ(m) ≤ 2[K:ℚ]: every finite order in PGL₂(K) is at most this. */
export function maxElementOrder(n) {
    let best = 1;
    for (let m = 1; m <= 8 * n * n + 12; m++) if (phi(m) <= 2 * n) best = m;
    return best;
}

/** The order of x in PGL₂(K), or null when it has infinite order (exact). */
export function elementOrder(F, x, budget = null) {
    const M = maxElementOrder(F.n);
    const x0 = primitive(F, x);
    let p = x0;
    for (let k = 1; k <= M; k++) {
        if (isScalar(F, p)) return k;
        if (budget) { budget.check(); budget.products++; }
        p = mmul(F, p, x0);
    }
    return null;
}

// ───────────────────────── the tree geometry ─────────────────────────

class TreeGeometry {
    constructor(place, base, budget) {
        this.place = place;
        this.o = base;
        this.budget = budget;
        this.cache = new Map();
    }
    key(x) { return ENTRIES.map((k) => this.place.F.key(x[k])).join(';'); }
    image(x) {
        const k = this.key(x);
        let r = this.cache.get(k);
        if (!r) {
            this.budget.check();
            const w = this.place.act(this.place.prepare(x), this.o);
            r = { w, len: this.place.dist(this.o, w), ell: translationLength(this.place, x) };
            if (this.cache.size > 50000) this.cache.clear();
            this.cache.set(k, r);
        }
        return r;
    }
    /** Root displacement |x| = d(o, x·o). */
    length(x) { return this.image(x).len; }
    /** Steps (0 = up towards ∞, 1 + r = down along digit r) of the first t edges of [o, w]. */
    steps(w, t) {
        const P = this.place, o = this.o;
        const m = Math.min(o.k, w.k);
        let M = m;
        for (let j = Math.min(o.lo, w.lo); j < m; j++) if (P.digitAt(o, j) !== P.digitAt(w, j)) { M = j; break; }
        const up = o.k - M, out = [];
        for (let s = 0; s < t; s++) out.push(s < up ? 0 : 1 + P.digitAt(w, M + (s - up)));
        return out;
    }
    halfPath(x) { const r = this.image(x); return this.steps(r.w, Math.floor(r.len / 2)); }
    /** (|x|, sorted half-paths of x and x⁻¹): a prefix-compatible order for ties. */
    orderKey(x) {
        const F = this.place.F;
        const hp = [this.halfPath(x), this.halfPath(adj(F, x))].sort(cmpSeq);
        return { len: this.length(x), hp };
    }
}
function cmpSeq(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
}
function cmpKey(a, b) {
    if (a.len !== b.len) return a.len - b.len;
    return cmpSeq(a.hp[0], b.hp[0]) || cmpSeq(a.hp[1], b.hp[1]);
}

// ───────────────────────── N1, N2, N3 ─────────────────────────

/** The independent certificate: null, or the data showing N1, N2 and N3. */
export function nielsenCertificate(F, basis, geo) {
    const dir = [];
    basis.forEach((b, i) => { dir.push({ x: b.x, inv: 2 * i + 1 }); dir.push({ x: adj(F, b.x), inv: 2 * i }); });
    const keys = dir.map((d) => projKey(F, d.x));
    if (new Set(keys).size !== keys.length) return null;                  // N1 (no duplicates)
    if (dir.some((d) => isScalar(F, d.x))) return null;                   // N1 (no identity)
    const len = dir.map((d) => geo.length(d.x));
    const incoming = dir.map(() => 0), outgoing = dir.map(() => 0);
    let checked = 0;
    for (let i = 0; i < dir.length; i++) {
        for (let j = 0; j < dir.length; j++) {
            if (dir[i].inv === j) continue;
            geo.budget.check();
            geo.budget.products++;
            const L = geo.length(mmul(F, dir[i].x, dir[j].x));
            checked++;
            if (L < Math.max(len[i], len[j])) return null;                   // N2
            const c2 = len[i] + len[j] - L;                                  // twice the cancellation
            if (c2 > outgoing[i]) outgoing[i] = c2;
            if (c2 > incoming[j]) incoming[j] = c2;
        }
    }
    const slack = len.map((l, i) => 2 * l - incoming[i] - outgoing[i]);
    if (slack.some((s) => s <= 0)) return null;                              // N3
    return { lengths: len.filter((_, i) => i % 2 === 0), slack: slack.filter((_, i) => i % 2 === 0), checked };
}

// ───────────────────────── Markowitz ─────────────────────────

/**
 * Nielsen-reduce `gens` (matrices, with words in the original generators).
 * Returns { outcome: 'free' | 'elliptic' | 'unresolved' | 'limit', … }.
 */
export function markowitz(place, base, gens, words, budget, { maxMoves = 2000, maxGenerators = 600 } = {}) {
    const F = place.F;
    const geo = new TreeGeometry(place, base, budget);
    let basis = gens.map((x, i) => ({ x: primitive(F, x), w: words[i] }));
    const moves = [];
    const out = (outcome, extra = {}) => ({ outcome, moves, movesCount: moves.length, ...extra });
    try {
        if (basis.length > maxGenerators) throw new LimitReached('too many generators');
        for (;;) {
            budget.check();
            if (moves.length >= maxMoves) throw new LimitReached('Nielsen move limit');
            // drop identities and repeats; stop at an elliptic element
            let changed = false;
            const seen = new Map();
            for (let i = 0; i < basis.length; i++) {
                const b = basis[i];
                if (isScalar(F, b.x)) { basis.splice(i, 1); moves.push({ kind: 'drop identity' }); changed = true; break; }
                const r = geo.image(b.x);
                if (r.ell === 0) return out('elliptic', { x: b.x, w: b.w, basis });
                const k = projKey(F, b.x), ki = projKey(F, adj(F, b.x));
                if (seen.has(k) || seen.has(ki)) { basis.splice(i, 1); moves.push({ kind: 'drop repeat' }); changed = true; break; }
                seen.set(k, i);
            }
            if (changed) continue;

            let replaced = false;
            for (const tie of [false, true]) {
                if (tie) {
                    const cert = nielsenCertificate(F, basis, geo);
                    if (cert) return out('free', { basis, certificate: cert });
                }
                for (let i = 0; i < basis.length && !replaced; i++) {
                    const g = basis[i];
                    const lenG = geo.length(g.x);
                    const keyG = tie ? geo.orderKey(g.x) : null;
                    for (let j = 0; j < basis.length && !replaced; j++) {
                        if (i === j) continue;
                        const h = basis[j], hi = adj(F, h.x);
                        // each move replaces g only, so the subgroup is unchanged
                        const cands = [
                            ['h·g', h.x, g.x, h.w, g.w],
                            ['g·h⁻¹', g.x, hi, g.w, inverseWord(h.w)],
                            ['g·h', g.x, h.x, g.w, h.w],
                            ['h⁻¹·g', hi, g.x, inverseWord(h.w), g.w],
                        ];
                        for (const [name, a, b, wa, wb] of cands) {
                            budget.check();
                            budget.products++;
                            const q = mmul(F, a, b);
                            const lenQ = geo.length(q);
                            const better = tie
                                ? lenQ === lenG && cmpKey(geo.orderKey(q), keyG) < 0
                                : lenQ < lenG;
                            if (better) {
                                basis[i] = { x: q, w: reduceWord(wa.concat(wb)) };
                                moves.push({ kind: name, index: i, partner: j, before: lenG, after: lenQ, tie });
                                replaced = true;
                                break;
                            }
                        }
                    }
                }
                if (replaced) break;
            }
            if (!replaced) return out('unresolved', { basis, reason: 'no shortening move, yet the N-certificate failed' });
        }
    } catch (e) {
        if (e instanceof LimitReached) return out('limit', { basis, reason: e.message });
        throw e;
    }
}

// ───────────────────────── Conder (two generators) ─────────────────────────

export function conder(place, mats, budget) {
    const F = place.F;
    let x = primitive(F, mats[0]), y = primitive(F, mats[1]);
    let wx = [1], wy = [2];
    const steps = [];
    for (let guard = 0; guard < 4000; guard++) {
        budget.check();
        let lx = translationLength(place, x), ly = translationLength(place, y);
        if (lx === 0 || ly === 0) {
            const [w, e] = lx === 0 ? [wx, x] : [wy, y];
            return { outcome: 'elliptic', w, x: e, steps };
        }
        if (lx > ly) { [x, y, wx, wy, lx, ly] = [y, x, wy, wx, ly, lx]; }
        budget.products += 2;
        const xy = mmul(F, x, y), xiy = mmul(F, adj(F, x), y);
        const lxy = translationLength(place, xy), lixy = translationLength(place, xiy);
        steps.push({ lengths: [lx, ly], products: [lxy, lixy] });
        if (Math.min(lxy, lixy) > ly - lx) {
            return { outcome: 'free', words: [wx, wy], mats: [x, y], lengths: [lx, ly], steps };
        }
        if (lxy <= lixy) { y = xy; wy = reduceWord(wx.concat(wy)); }
        else { y = xiy; wy = reduceWord(inverseWord(wx).concat(wy)); }
    }
    return { outcome: 'limit', steps };
}

// ───────────────────────── a torsion-free congruence kernel ─────────────────────────

const SMALL_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

/** Reduction mod 𝔮 as a projective key, or null if x is not a unit at 𝔮. */
function reducer(Q) {
    const F = Q.F;
    return (x) => {
        const vs = ENTRIES.map((k) => Q.val(x[k]));
        const m = Math.min(...vs);
        if (Q.val(det(F, x)) !== 2 * m) return null;            // det not a unit once scaled
        const i = vs.indexOf(m);
        const inv = F.inv(x[ENTRIES[i]]);
        return ENTRIES.map((k) => Q.residueIndex(F.mul(x[k], inv))).join(',');
    };
}

/**
 * The kernel of G → PGL₂(O/𝔮) for the first small prime 𝔮 where every
 * generator reduces and e(𝔮|ℓ) < ℓ − 1 (so the kernel is torsion-free).
 */
export function congruenceKernel(F, mats, budget, { maxImage = 3000, avoid = null } = {}) {
    for (const ell of SMALL_PRIMES) {
        if (avoid && BigInt(ell) === avoid) continue;
        const prs = F.primesAbove(BigInt(ell));
        for (let idx = 0; idx < prs.length; idx++) {
            const pr = prs[idx];
            if (!(pr.e < ell - 1)) continue;
            const q = ell ** pr.f;
            if (q * (q * q - 1) > maxImage * 4) continue;
            const Q = new Place(F, ell, idx);
            const red = reducer(Q);
            if (mats.some((x) => red(x) === null)) continue;
            // the whole finite image, with a transversal
            const letters = [];
            mats.forEach((x, i) => { letters.push({ x, s: i + 1 }); letters.push({ x: adj(F, x), s: -(i + 1) }); });
            const id = { a: F.one(), b: F.zero(), c: F.zero(), d: F.one() };
            const reps = new Map([[red(id), { x: id, w: [] }]]);
            const queue = [red(id)];
            let tooBig = false;
            while (queue.length) {
                budget.check();
                const key = queue.shift();
                const t = reps.get(key);
                for (const L of letters) {
                    budget.products++;
                    const y = mmul(F, t.x, L.x);
                    const k2 = red(y);
                    if (!reps.has(k2)) {
                        if (reps.size >= maxImage) { tooBig = true; break; }
                        reps.set(k2, { x: y, w: reduceWord(t.w.concat([L.s])) });
                        queue.push(k2);
                    }
                }
                if (tooBig) break;
            }
            if (tooBig) continue;
            // Schreier generators t·s·(rep of ts)⁻¹
            const gens = [], words = [], seen = new Set();
            for (const t of reps.values()) {
                mats.forEach((s, i) => {
                    budget.check();
                    budget.products += 2;
                    const ts = mmul(F, t.x, s);
                    const u = reps.get(red(ts));
                    const h = mmul(F, ts, adj(F, u.x));
                    if (isScalar(F, h)) return;
                    const k = projKey(F, h), ki = projKey(F, adj(F, h));
                    if (seen.has(k) || seen.has(ki)) return;
                    seen.add(k);
                    gens.push(h);
                    words.push(reduceWord(t.w.concat([i + 1], inverseWord(u.w))));
                });
            }
            return { prime: Q, ell, index: reps.size, q, gens, words, primeTex: F.primeTex(pr), e: pr.e, f: pr.f };
        }
    }
    return null;
}

// ───────────────────────── the decision ─────────────────────────

/**
 * Decide whether ⟨mats⟩ is discrete in PGL₂(K_𝔭).
 * `base` is the base vertex o used for root displacements.
 */
export function decide(place, mats, base, { seconds = 6 } = {}) {
    const F = place.F;
    const budget = new Budget({ seconds });
    const r = mats.length;
    const report = { prime: String(place.p), q: place.q, rank: r, log: [] };
    const log = (s) => report.log.push(s);
    try {
        // ── 1. boundedness ──
        const samples = mats.map((x, i) => ({ w: [i + 1], x }));
        for (let i = 0; i < r; i++) for (let j = i + 1; j < r; j++) {
            budget.products++;
            samples.push({ w: [i + 1, j + 1], x: mmul(F, mats[i], mats[j]) });
        }
        const lengths = samples.map((s) => ({ w: s.w, ell: translationLength(place, s.x), x: s.x }));
        report.lengths = lengths.map(({ w, ell }) => ({ w, ell }));
        const bounded = lengths.every((s) => s.ell === 0);
        report.bounded = bounded;
        log(bounded
            ? 'Every generator and every product of two generators is elliptic, so the group fixes a point of the tree (Serre, Helly).'
            : `Not bounded: ${wordText(lengths.find((s) => s.ell > 0).w)} is hyperbolic.`);

        if (bounded) {
            const fin = finiteClosure(F, mats, budget);
            if (fin.finite) {
                return { ...report, verdict: 'discrete', kind: 'finite', order: fin.order, method: 'bounded',
                    reason: `A finite group of order ${fin.order}: it fixes a point of the tree, and every finite group is discrete.` };
            }
            const wit = fin.witness;
            return { ...report, verdict: 'nondiscrete', kind: 'bounded-infinite', method: 'bounded', witness: wit ? { w: wit.w, x: wit.x } : null,
                reason: wit
                    ? `The group fixes a point but is infinite: ${wordText(wit.w)} is elliptic of infinite order, so the group lies in a compact stabilizer without being finite.`
                    : `The group fixes a point but has more than ${fin.cap} elements, more than any finite subgroup of PGL₂(K); an infinite subgroup of a compact group is not discrete.` };
        }

        // an infinite-order elliptic among the samples decides at once
        for (const s of lengths) {
            if (s.ell === 0 && elementOrder(F, s.x, budget) === null) {
                return { ...report, verdict: 'nondiscrete', kind: 'elliptic', method: 'elliptic', witness: { w: s.w, x: s.x },
                    reason: `${wordText(s.w)} is elliptic of infinite order: it generates an infinite subgroup of a compact stabilizer.` };
            }
        }

        // ── 2. Conder, rank two ──
        if (r === 2) {
            const c = conder(place, mats, budget);
            report.conder = { outcome: c.outcome, steps: c.steps };
            if (c.outcome === 'free') {
                const basis = c.words.map((w, i) => ({ w, x: c.mats[i], len: null, ell: c.lengths[i] }));
                return { ...report, verdict: 'discrete', kind: 'free', freeRank: 2, method: 'conder', basis,
                    reason: `Conder's Nielsen test: the purely hyperbolic pair ${c.words.map(wordText).join(', ')} satisfies min(ℓ(xy), ℓ(x⁻¹y)) > ℓ(y) − ℓ(x), so the group is free of rank 2 and discrete.` };
            }
            if (c.outcome === 'elliptic') {
                const ord = elementOrder(F, c.x, budget);
                if (ord === null) {
                    return { ...report, verdict: 'nondiscrete', kind: 'elliptic', method: 'conder', witness: { w: c.w, x: c.x },
                        reason: `Conder's Nielsen reduction reaches ${wordText(c.w)}, elliptic of infinite order.` };
                }
                log(`Conder's reduction reaches ${wordText(c.w)}, elliptic of order ${ord}: torsion, which does not decide.`);
            }
        }

        // ── 3. Markowitz ──
        const words = mats.map((_, i) => [i + 1]);
        const mk = markowitz(place, base, mats, words, budget);
        report.markowitz = summarizeMarkowitz(mk);
        if (mk.outcome === 'free') {
            return { ...report, verdict: 'discrete', kind: 'free', freeRank: mk.basis.length, method: 'markowitz',
                basis: basisRows(place, base, mk.basis), certificate: mk.certificate,
                reason: `Markowitz's reduction gives an N-reduced basis of ${mk.basis.length} element${mk.basis.length === 1 ? '' : 's'} (N1–N3 checked): the group is free on it and discrete.` };
        }
        if (mk.outcome !== 'elliptic') {
            return { ...report, verdict: 'unknown', method: 'markowitz',
                reason: `Markowitz's reduction stopped (${mk.reason}). A resource limit is never read as a verdict.` };
        }
        const ord = elementOrder(F, mk.x, budget);
        if (ord === null) {
            return { ...report, verdict: 'nondiscrete', kind: 'elliptic', method: 'markowitz', witness: { w: mk.w, x: mk.x },
                reason: `Markowitz's reduction reaches ${wordText(mk.w)}, elliptic of infinite order.` };
        }
        log(`Markowitz's reduction reaches ${wordText(mk.w)}, elliptic of order ${ord}: the group has torsion.`);

        // ── 4. torsion: a torsion-free congruence kernel ──
        const ker = congruenceKernel(F, mats, budget, { avoid: null });
        if (!ker) {
            return { ...report, verdict: 'unknown', method: 'kernel',
                reason: 'The group has torsion, and no small prime gave a torsion-free congruence kernel (every candidate prime divides a determinant or a denominator, or the image is too large).' };
        }
        report.kernel = { primeTex: ker.primeTex, ell: ker.ell, q: ker.q, index: ker.index, generators: ker.gens.length };
        log(`Congruence kernel mod 𝔮 = ${ker.primeTex.replace(/\\[a-z]+\s?/g, '')}: index ${ker.index}, torsion-free (e(𝔮|${ker.ell}) = ${ker.e} < ${ker.ell - 1}), ${ker.gens.length} Schreier generator${ker.gens.length === 1 ? '' : 's'}.`);
        if (!ker.gens.length) {
            return { ...report, verdict: 'discrete', kind: 'finite', order: ker.index, method: 'kernel',
                reason: `The congruence kernel is trivial, so the group is finite (of order ${ker.index}) and discrete.` };
        }
        const mk2 = markowitz(place, base, ker.gens, ker.words, budget);
        report.kernelMarkowitz = summarizeMarkowitz(mk2);
        if (mk2.outcome === 'free') {
            return { ...report, verdict: 'discrete', kind: 'virtually-free', freeRank: mk2.basis.length, method: 'kernel',
                basis: basisRows(place, base, mk2.basis), certificate: mk2.certificate,
                reason: `The torsion-free congruence kernel (index ${ker.index}) has an N-reduced basis of ${mk2.basis.length} element${mk2.basis.length === 1 ? '' : 's'}, so it is free and discrete; hence so is the group, a finite extension of it.` };
        }
        if (mk2.outcome === 'elliptic') {
            if (elementOrder(F, mk2.x, budget) !== null) throw new Error('internal: torsion in a torsion-free kernel');
            return { ...report, verdict: 'nondiscrete', kind: 'elliptic', method: 'kernel', witness: { w: mk2.w, x: mk2.x },
                reason: `The torsion-free congruence kernel contains ${wordText(mk2.w)}, which is elliptic, hence of infinite order.` };
        }
        return { ...report, verdict: 'unknown', method: 'kernel',
            reason: `The congruence kernel is certified, but its reduction stopped (${mk2.reason}).` };
    } catch (e) {
        if (e instanceof LimitReached) return { ...report, verdict: 'unknown', reason: `Resource limit (${e.message}); not a verdict.` };
        throw e;
    }
}

function summarizeMarkowitz(mk) {
    return { outcome: mk.outcome, moves: mk.movesCount, reason: mk.reason || null, log: mk.moves.slice(0, 200) };
}

function basisRows(place, base, basis) {
    return basis.map((b) => {
        const w = place.act(place.prepare(b.x), base);
        return { w: b.w, x: b.x, len: place.dist(base, w), ell: translationLength(place, b.x) };
    });
}

/** Enumerate a bounded group; finite iff it closes up within the bound on finite subgroups. */
function finiteClosure(F, mats, budget) {
    const M = maxElementOrder(F.n);
    const cap = Math.max(60, 2 * M);
    const id = { a: F.one(), b: F.zero(), c: F.zero(), d: F.one() };
    const letters = [];
    mats.forEach((x, i) => { letters.push({ x: primitive(F, x), s: i + 1 }); letters.push({ x: primitive(F, adj(F, x)), s: -(i + 1) }); });
    const seen = new Map([[projKey(F, id), { x: id, w: [] }]]);
    const queue = [seen.get(projKey(F, id))];
    while (queue.length) {
        budget.check();
        const t = queue.shift();
        for (const L of letters) {
            budget.products++;
            const y = mmul(F, t.x, L.x);
            const k = projKey(F, y);
            if (seen.has(k)) continue;
            const node = { x: y, w: reduceWord(t.w.concat([L.s])) };
            seen.set(k, node);
            queue.push(node);
            if (seen.size > cap) {
                // infinite: by Schur's theorem it has an element of infinite order; find a short one
                for (const cand of seen.values()) {
                    if (cand.w.length && elementOrder(F, cand.x, budget) === null) return { finite: false, cap, witness: cand };
                }
                return { finite: false, cap, witness: null };
            }
        }
    }
    return { finite: true, order: seen.size };
}

/** Plain data for the page (and the worker boundary): matrices become text and TeX. */
export function serializeDecision(F, r) {
    const mat = (x) => x && {
        text: ENTRIES.map((k) => F.format(x[k])),
        tex: ENTRIES.map((k) => F.tex(x[k])),
    };
    const out = { ...r };
    if (r.basis) out.basis = r.basis.map((b) => ({ w: b.w, len: b.len, ell: b.ell, mat: mat(b.x) }));
    if (r.witness) out.witness = { w: r.witness.w, mat: mat(r.witness.x) };
    return out;
}
