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
            // the reduced pair (it generates the same group), for the Bass–Serre test
            return { outcome: 'elliptic', w, x: e, steps, pair: [{ x, w: wx }, { x: y, w: wy }] };
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

        // ── 2a. torsion in rank two: a free product, by Bass–Serre ──
        if (r === 2) {
            const bs = bassSerrePair(place, mats, budget);
            if (bs) return { ...report, ...bs };
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
            if (c.outcome === 'elliptic' && c.pair) {
                // Bass–Serre on Conder's reduced pair (it generates the same group)
                const ord0 = elementOrder(F, c.x, budget);
                if (ord0 !== null) {
                    const bs = bassSerrePair(place, mats, budget, c.pair);
                    if (bs) return { ...report, ...bs };
                }
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

        // ── 3b. torsion: the normal closure of the rest of a reduced basis ──
        const tc = torsionClosure(place, base, mats.length, mk, ord, budget, log);
        if (tc) return { ...report, ...tc };

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

/**
 * A free product of two cyclic groups, certified by Bass–Serre, for a pair
 * with torsion. Each generator g contributes its factor ⟨g⟩ and its core in
 * the tree: Fix(g) for an elliptic of finite order, the midpoint of the edge
 * it inverts for an involution swapping the two ends of an edge, the axis for
 * a hyperbolic. The free product ⟨g₁⟩ ∗ ⟨g₂⟩ is π₁ of a graph of groups with
 * trivial edge groups (a hyperbolic factor is an HNN loop along its axis),
 * and the equivariant map from its Bass–Serre tree to T sends the edges to
 * geodesics joining the cores. If that map is locally injective (the
 * translates of the edges leave each vertex in distinct directions) it is
 * injective; then ⟨g₁, g₂⟩ ≅ ⟨g₁⟩ ∗ ⟨g₂⟩ acts on the image with finite vertex
 * stabilizers, so it is discrete. Returns null whenever the test does not
 * apply or a condition fails (never a negative verdict).
 */
function bassSerrePair(place, mats, budget, base = null) {
    const F = place.F;
    // a generating pair (the input, or a Nielsen-reduced one), then the moves (a, aᵏb) and (a, baᵏ)
    // for a member a of finite order n, 0 < k < n
    const P0 = base || [{ x: mats[0], w: [1] }, { x: mats[1], w: [2] }];
    const pairs = [P0];
    for (const [i, j] of [[0, 1], [1, 0]]) {
        const A = P0[i], B = P0[j];
        if (translationLength(place, A.x) !== 0) continue;
        const n = elementOrder(F, A.x, budget);
        if (n === null || n > 12) continue;
        let ak = { x: primitive(F, A.x), w: A.w };
        for (let k = 1; k < n; k++) {
            budget.products += 2;
            for (const [x, w] of [[mmul(F, ak.x, B.x), ak.w.concat(B.w)], [mmul(F, B.x, ak.x), B.w.concat(ak.w)]]) {
                const pair = [A, { x, w: reduceWord(w) }];
                pairs.push(i === 0 ? pair : [pair[1], pair[0]]);
            }
            ak = { x: primitive(F, mmul(F, ak.x, A.x)), w: reduceWord(ak.w.concat(A.w)) };
        }
    }
    for (const pair of pairs) {
        const r = bassSerreCore(place, pair, budget);
        if (r) return r;
    }
    return null;
}

function bassSerreCore(place, pairIn, budget) {
    const F = place.F;
    const o = place.canon(F.zero(), 0);
    const mats = pairIn.map((p) => p.x);
    const id = (v) => place.id(v);
    const step = (a, b) => { const d = place.dist(a, b); return place.neighbors(a).find((u) => place.dist(u, b) === d - 1); };
    const toward = (a, b, t) => { let v = a; for (let i = 0; i < t; i++) v = step(v, b); return v; };
    const gens = mats.map((m, i) => {
        const x = primitive(F, m);
        const prep = place.prepare(x);
        const inv = place.prepare(adj(F, x));
        const ell = translationLength(place, x);
        const act = (v) => place.act(prep, v), actInv = (v) => place.act(inv, v);
        const vdet = place.val(det(F, x));
        return { i: i + 1, w: pairIn[i].w, x, ell, act, actInv, swap: ell === 0 && (vdet & 1) === 1 };
    });
    if (gens.every((g) => g.ell > 0)) return null;                       // Conder's case
    for (const g of gens) {
        if (g.ell > 0) continue;
        g.order = elementOrder(F, g.x, budget);
        if (g.order === null) return null;                               // decided elsewhere (not discrete)
        if (g.swap && g.order % 2) return null;                           // an inversion has even order
        // an inversion of order 2k > 2 fixes only the midpoint of its edge, where there are two directions:
        // ⟨g⟩ cannot act freely on them, so no free-product certificate of this local kind exists
        if (g.swap && g.order > 2) return null;
        const w = g.act(o), d = place.dist(o, w);
        if (g.swap) {
            if ((d & 1) !== 1) return null;
            const u = toward(o, w, (d - 1) / 2), u2 = g.act(u);
            if (place.dist(u, u2) !== 1) return null;
            g.edge = [u, u2];
        } else {
            if ((d & 1) !== 0) return null;
            const x0 = toward(o, w, d / 2);
            if (id(g.act(x0)) !== id(x0)) return null;
            g.x0 = x0;               // a point of Fix(g); Fix(g) is convex, possibly unbounded
        }
    }
    const fixed = (g, v) => { budget.products++; return id(g.act(v)) === id(v); };
    /** Walk inside Fix(g) from x while some fixed neighbour lowers f (convex f: this reaches the minimum on Fix(g)). */
    const descend = (g, x, f) => {
        let fx = f(x);
        for (let guard = 0; guard < 400; guard++) {
            budget.check();
            let moved = false;
            for (const u of place.neighbors(x)) {
                const fu = f(u);
                if (fu < fx && fixed(g, u)) { x = u; fx = fu; moved = true; break; }
            }
            if (!moved) return { x, f: fx };
        }
        return null;
    };
    // the images of a direction d at x under the nontrivial powers of a finite g fixing x
    const freeOn = (g, x, d) => {
        const seen = new Set([id(d)]);
        let cur = d;
        for (let k = 1; k < g.order; k++) {
            cur = g.act(cur);
            if (seen.has(id(cur))) return false;
            seen.add(id(cur));
        }
        return seen;
    };
    // an inversion g of order 2k > 2: anchored at an end u of its edge with the group ⟨g²⟩ (order k), which
    // fixes the edge; the anchor's local condition: ⟨g²⟩ moves the bridge direction freely, and not onto the edge
    const sq = (g) => ({ act: (v) => g.act(g.act(v)), order: g.order / 2 });
    const otherEnd = (g, u) => g.edge.find((v) => id(v) !== id(u));
    const swapAnchorOk = (g, u, d) => {
        if (g.order === 2) return true;                                 // anchored at the midpoint
        const e = otherEnd(g, u);
        if (id(d) === id(e)) return false;
        const seen = freeOn(sq(g), u, d);
        return !!seen && !seen.has(id(e));
    };
    const [A, B] = gens;
    const factor = (g) => (g.ell > 0 ? 'ℤ' : `ℤ/${g.order}`);
    const ok = (why) => {
        // the factors are ⟨x⟩, ⟨y⟩ for words x, y in g₁, g₂ related to them by a Nielsen move, so ⟨g₁, g₂ | xⁿ, yᵐ⟩
        const relators = gens.filter((g) => g.ell === 0).map((g) => ({ enc: g.w, m: g.order }));
        const fp = `${factor(A)} ∗ ${factor(B)}`;
        const sup = (n) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
        const rel = relators.map((r) => (r.enc.length === 1 ? `${wordText(r.enc)}${sup(r.m)}` : `(${wordText(r.enc)})${sup(r.m)}`)).join(', ');
        const moved = gens.some((g) => g.w.length !== 1);
        return {
            verdict: 'discrete', kind: 'virtually-free', method: 'bass-serre', freeProduct: fp,
            presentation: { n: 2, relators },
            reason: `Bass–Serre${moved ? ` on the pair ${wordText(A.w)}, ${wordText(B.w)}` : ''}: ${why} The map from the Bass–Serre tree of ${fp} to the tree is locally injective, hence injective, so the group is ${fp} = ⟨g₁, g₂ | ${rel}⟩ with finite vertex stabilizers: discrete.`,
        };
    };
    const fin = gens.filter((g) => g.ell === 0), hyp = gens.filter((g) => g.ell > 0);
    if (hyp.length === 1) {
        // ℤ/n ∗ ℤ: Fix(a) and the axis of b
        const a = fin[0], b = hyp[0];
        if (a.swap) {
            // the inverted edge [u, u′] and the axis: through the nearer endpoint
            const [u, u2] = a.edge;
            const du = (place.dist(u, b.act(u)) - b.ell) / 2, du2 = (place.dist(u2, b.act(u2)) - b.ell) / 2;
            if (du === 0 && du2 === 0) return null;                        // the inverted edge lies on the axis
            const x = du <= du2 ? u : u2, dz = Math.min(du, du2);
            if (a.order > 2) {
                // anchored at x with ⟨a²⟩: an HNN loop for b at x (on the axis) or a bridge to the axis
                const e = otherEnd(a, x);
                if (dz === 0) {
                    const dp = step(x, b.act(x)), dm = step(x, b.actInv(x));
                    const sp = freeOn(sq(a), x, dp), sm = freeOn(sq(a), x, dm);
                    if (!sp || !sm || sp.has(id(e)) || sm.has(id(e))) return null;
                    for (const k of sp) if (sm.has(k)) return null;
                } else if (!swapAnchorOk(a, x, step(x, toward(x, b.act(x), dz)))) return null;
                return ok(`${wordText(a.w)} inverts an edge, its square fixes it, and the anchor moves the way to the axis of ${wordText(b.w)} freely.`);
            }
            if (dz === 0) {
                // x on the axis; the half-edge to the midpoint leaves along the edge, not the axis
                const ax = [id(step(x, b.act(x))), id(step(x, b.actInv(x)))];
                const other = du <= du2 ? u2 : u;
                if (ax.includes(id(other))) return null;
                return ok(`${wordText(a.w)} inverts an edge with one end on the axis of ${wordText(b.w)}, leaving it.`);
            }
            return ok(`${wordText(a.w)} inverts an edge at distance ${dz} from the axis of ${wordText(b.w)}.`);
        }
        const toAxis = (z) => (place.dist(z, b.act(z)) - b.ell) / 2;
        const m = descend(a, a.x0, toAxis);
        if (!m) return null;
        const best = { z: m.x, dz: m.f };
        const x = best.z;
        if (best.dz === 0) {
            // (if Fix(a) contains an edge of the axis, a fixes an axis direction and freeOn fails)
            const dp = step(x, b.act(x)), dm = step(x, b.actInv(x));
            const sp = freeOn(a, x, dp), sm = freeOn(a, x, dm);
            if (!sp || !sm) return null;
            for (const k of sp) if (sm.has(k)) return null;
            return ok(`${wordText(a.w)} fixes one point of the axis of ${wordText(b.w)} and moves both axis directions there freely and off each other.`);
        }
        const y = toward(x, b.act(x), best.dz);
        if (!freeOn(a, x, step(x, y))) return null;
        return ok(`Fix(${wordText(a.w)}) is at distance ${best.dz} from the axis of ${wordText(b.w)}, and ${wordText(a.w)} moves the bridge freely.`);
    }
    // ℤ/n ∗ ℤ/m: both finite
    // the closest points of the two cores (an inverted edge: its nearer end), by alternating descent
    const near = (g, target) => {
        if (g.swap) { const [u, v] = g.edge; return place.dist(u, target) <= place.dist(v, target) ? u : v; }
        const m = descend(g, g.x0, (v) => place.dist(v, target));
        return m ? m.x : null;
    };
    let x = A.swap ? A.edge[0] : A.x0, z = B.swap ? B.edge[0] : B.x0;
    for (let guard = 0; guard < 50; guard++) {
        const x2 = near(A, z); if (!x2) return null;
        const z2 = near(B, x2); if (!z2) return null;
        if (id(x2) === id(x) && id(z2) === id(z)) break;
        x = x2; z = z2;
    }
    const best = { x, z, d: place.dist(x, z) };
    if (A.swap && B.swap) {
        const same = new Set(A.edge.map(id));
        if (B.edge.every((v) => same.has(id(v)))) return null;            // one edge: a common fixed midpoint
        if (A.order === 2 && B.order === 2) return ok('the two inverted edges are distinct.');
    }
    if (best.d === 0 && !A.swap && !B.swap) return null;                 // a common fixed point (bounded)
    const dirFrom = (g, x, z) => {
        if (place.dist(x, z) > 0) return step(x, z);
        // x is an end of the edge the other generator inverts: leave along that edge
        const h = g === A ? B : A;
        return h.edge.find((v) => id(v) !== id(x));
    };
    for (const [g, x, z] of [[A, best.x, best.z], [B, best.z, best.x]]) {
        const h = g === A ? B : A;
        if (g.swap && g.order === 2) continue;                            // anchored at the midpoint: its two half-edges are swapped
        if (place.dist(x, z) === 0 && !h.swap) return null;               // anchors at one vertex: not a free product of these factors
        const d = dirFrom(g, x, z);
        if (g.swap) { if (!swapAnchorOk(g, x, d)) return null; continue; }
        if (!freeOn(g, x, d)) return null;
    }
    return ok(`the bridge between the cores of ${wordText(A.w)} and ${wordText(B.w)} has length ${best.d}, and each finite factor moves its end of the bridge freely.`);
}

/**
 * Torsion without a congruence kernel. Markowitz's basis B generates the group
 * and contains an elliptic a of finite order n. The normal closure N of
 * B ∖ {a} is generated by the conjugates aⁱ z a⁻ⁱ (z ∈ B ∖ {a}, 0 ≤ i < n), and
 * [Γ : N] ≤ n, since Γ/N is generated by the image of a. If Markowitz shows N
 * free and discrete, so is Γ (a finite extension); if N contains an elliptic
 * of infinite order, Γ is not discrete; if it meets torsion again, repeat
 * (three times at most). Anything else returns null, for the congruence kernel.
 *
 * When B = {a, b} is the input pair up to inverses and N is free on the n
 * conjugates of b, Γ ≅ ℤ/n ∗ ⟨b⟩: the surjection ℤ/n ∗ ℤ → Γ is injective on
 * the kernel of ℤ/n ∗ ℤ → ℤ/n, so its kernel is a finite normal subgroup of
 * ℤ/n ∗ ℤ, hence trivial. That gives the presentation ⟨g₁, g₂ | gᵢⁿ⟩.
 */
function torsionClosure(place, base, rank, mk, ord, budget, log) {
    const F = place.F;
    const id = { a: F.one(), b: F.zero(), c: F.zero(), d: F.one() };
    let a = { x: primitive(F, mk.x), w: mk.w, n: ord }, basis = mk.basis, index = 1;
    for (let level = 0; level < 3; level++) {
        const ka = projKey(F, a.x), kai = projKey(F, adj(F, a.x));
        const rest = basis.filter((b) => { const k = projKey(F, b.x); return k !== ka && k !== kai; });
        if (!rest.length) return null;
        const gens = [], words = [];
        let ai = { x: id, w: [] };
        for (let i = 0; i < a.n; i++) {
            const aiInv = adj(F, ai.x);
            for (const z of rest) {
                budget.products += 2;
                gens.push(primitive(F, mmul(F, mmul(F, ai.x, z.x), aiInv)));
                words.push(reduceWord(ai.w.concat(z.w, inverseWord(ai.w))));
            }
            ai = { x: primitive(F, mmul(F, ai.x, a.x)), w: reduceWord(ai.w.concat(a.w)) };
        }
        index *= a.n;
        log(`${wordText(a.w)} has order ${a.n}: the normal closure of the other ${rest.length} basis element${rest.length === 1 ? '' : 's'} has index ≤ ${a.n}, with ${gens.length} generators.`);
        const m = markowitz(place, base, gens, words, budget);
        if (m.outcome === 'free') {
            const out = {
                verdict: 'discrete', kind: 'virtually-free', freeRank: m.basis.length, method: 'torsion-closure',
                basis: basisRows(place, base, m.basis), certificate: m.certificate, closureIndex: index,
                reason: `${wordText(a.w)} has order ${a.n}, and the normal closure of the rest of the reduced basis (index ≤ ${index} in the group) has an N-reduced basis of ${m.basis.length} element${m.basis.length === 1 ? '' : 's'}: it is free and discrete, hence so is the group.`,
            };
            // ℤ/n ∗ ℤ on the input pair itself
            const single = (w) => w.length === 1;
            if (level === 0 && rank === 2 && basis.length === 2 && rest.length === 1 && single(a.w) && single(rest[0].w)
                && Math.abs(a.w[0]) !== Math.abs(rest[0].w[0]) && m.basis.length === gens.length) {
                const i = Math.abs(a.w[0]);
                out.presentation = { n: 2, relators: [{ enc: [i], m: a.n }] };
                out.freeProduct = `ℤ/${a.n} ∗ ℤ`;
                out.reason += ` It is free on the ${a.n} conjugates of g${'₀₁₂₃₄₅₆₇₈₉'[3 - i]}, so the group is ℤ/${a.n} ∗ ℤ = ⟨g₁, g₂ | g${'₀₁₂₃₄₅₆₇₈₉'[i]}${a.n === 2 ? '²' : a.n === 3 ? '³' : `^${a.n}`}⟩.`;
            }
            return out;
        }
        if (m.outcome !== 'elliptic') return null;
        const o = elementOrder(F, m.x, budget);
        if (o === null) {
            return { verdict: 'nondiscrete', kind: 'elliptic', method: 'torsion-closure', witness: { w: m.w, x: m.x },
                reason: `The normal closure (index ≤ ${index}) contains ${wordText(m.w)}, elliptic of infinite order.` };
        }
        a = { x: primitive(F, m.x), w: m.w, n: o };
        basis = m.basis;
    }
    return null;
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
