/**
 * thinCert.js — exact thinness certificates (and presentations) for Zariski-dense Γ ⊂ PGL₂(ℚ).
 *
 * When |S| ≥ 1, Λ = PGL₂(ℤ[1/S]) contains BS(1, p) = ℤ[1/p] ⋊ ℤ (cohomological dimension ≥ 2), so no
 * finite-index subgroup of Λ is virtually free; and when |S| ≥ 2, Λ is an irreducible lattice in
 * PGL₂(ℝ) × ∏_{q∈S} PGL₂(ℚ_q), so by strong approximation every finite-index subgroup of Λ projects
 * densely into PGL₂(ℝ) × PGL₂(ℚ_p) for each p ∈ S.
 *
 * Three exact certificates are tried:
 *   1. towerThin      (|S| ≥ 2) Bass–Serre decomposition of Γ = ⟨a, w⟩ on T_p (a fixing o_p, w² = 1
 *                     inverting [o_p, w·o_p]) whose vertex group H = Γ_{o_p} is an infinite tower of
 *                     conjugates proved discrete in PGL₂(ℝ) by an exact rational invariant ping-pong
 *                     region R ⊂ P¹(ℝ). Gives Γ discrete in PGL₂(ℝ) × PGL₂(ℚ_p) (hence thin) and the
 *                     exact presentation Γ = ⟨a, w | w²⟩ ≅ ℤ ∗ ℤ/2.
 *   2. adelicPingPong (|S| ≥ 1) Exact rational ping-pong on Ω = P¹(ℝ) × ∏_{p∈P} P¹(ℚ_p) for a pair
 *                     (A, s) Nielsen-equivalent to (g₁, g₂) with s² = 1 and A hyperbolic at ∞.
 *                     Gives Γ = ⟨A⟩ ∗ ⟨s⟩ ≅ ℤ ∗ ℤ/2 (virtually free, hence thin in Λ) and its
 *                     presentation on g₁, g₂.
 *   3. singleTreeThin (|S| ≥ 2) Bass–Serre closure of H = Γ_{o_p} on T_p to a finitely generated
 *                     subgroup H ⊂ PGL₂(ℤ[1/(S∖{p})]) with w·Stab_H(w·o_p)·w ⊆ H, followed by
 *                     Poincaré's polyhedron theorem certifying H discrete in PGL₂(ℝ).
 */
import { reduceToLambda } from './sarithIndex.js';
import { babs, bgcd, det, tr, prim, mul, inv, pow, vp, ONE, isScalar, key as matKey } from './mat2.js';

// ───────────────────────── Exact Rational Arithmetic (ℙ¹(ℚ)) ─────────────────────────

/** Canonical rational { n, d } with d > 0, gcd(|n|, d) = 1, or INF = { inf: true }. */
const INF = Object.freeze({ inf: true });
function rat(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) return INF;
    if (n === 0n) return { n: 0n, d: 1n };
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d);
    return { n: n / g, d: d / g };
}
const rEq = (a, b) => (a.inf || b.inf ? !!(a.inf && b.inf) : a.n === b.n && a.d === b.d);
const rLt = (a, b) => a.n * b.d < b.n * a.d;
const rLe = (a, b) => a.n * b.d <= b.n * a.d;
const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const rNeg = (a) => (a.inf ? INF : { n: -a.n, d: a.d });
const rFloat = (a) => (a.inf ? Infinity : Number(a.n) / Number(a.d));

function mobius(M, x) {
    const [a, b, c, d] = M;
    if (x.inf) return c === 0n ? INF : rat(a, c);
    return rat(a * x.n + b * x.d, c * x.n + d * x.d);
}

/** Floor(x * den) / den and Ceil(x * den) / den for finite rationals x and den > 0n. */
function floorGrid(x, den) {
    const num = x.n * den, q = x.d;
    const fl = num >= 0n ? num / q : -((-num + q - 1n) / q);
    return rat(fl, den);
}
function ceilGrid(x, den) {
    const num = x.n * den, q = x.d;
    const cl = num >= 0n ? (num + q - 1n) / q : -((-num) / q);
    return rat(cl, den);
}

/** Rational approximation to a finite JS float x with denominator den. */
function approxRat(x, den = 1024n) {
    return rat(BigInt(Math.round(x * Number(den))), den);
}

// ── Cyclic open arcs (P, Q) on P¹(ℝ) in increasing direction (wrapping through ∞ if Q < P) ──

function orderKey(base, t) {
    if (base.inf) return t; // finite t
    if (t.inf) return rat(0n, 1n);
    const diff = rSub(t, base);
    return rat(-diff.d, diff.n); // -1 / (t - base)
}

function inClosedArc(arc, t) {
    const [P, Q] = arc;
    if (rEq(t, P) || rEq(t, Q)) return true;
    return rLt(orderKey(P, t), orderKey(P, Q));
}

function inOpenArc(arc, t) {
    const [P, Q] = arc;
    if (rEq(t, P) || rEq(t, Q)) return false;
    return rLt(orderKey(P, t), orderKey(P, Q));
}

/** Open arc A ⊆ open arc B (endpoints may agree; non-degenerate P ≠ Q, a1 ≠ a2). */
function arcSubset(A, B) {
    const [a1, a2] = A, [P, Q] = B;
    if (rEq(P, Q) || rEq(a1, a2)) return false;
    if (rEq(a1, P) && rEq(a2, Q)) return true;
    if (rEq(a1, Q) || rEq(a2, P)) return false;
    if (!inClosedArc(B, a1) || !inClosedArc(B, a2)) return false;
    if (rEq(a1, P) || rEq(a2, Q)) return true;
    return rLt(orderKey(P, a1), orderKey(P, a2));
}

/** Closure of A strictly inside open arc B: Ā ⊂ B. */
function arcStrictlyInside(A, B) {
    return inOpenArc(B, A[0]) && inOpenArc(B, A[1]) && arcSubset(A, B);
}

/** Open arcs A and B are disjoint: A ⊆ complement(B) = (B[1], B[0]). */
function arcsDisjoint(A, B) {
    return arcSubset(A, [B[1], B[0]]);
}

/** Closures Ā and B̄ are disjoint: Ā ⊂ (B[1], B[0]). */
function closedArcsDisjoint(A, B) {
    return arcStrictlyInside(A, [B[1], B[0]]);
}

function arcImage(M, arc) {
    const u = mobius(M, arc[0]), v = mobius(M, arc[1]);
    return det(M) > 0n ? [u, v] : [v, u];
}

// ───────────────────────── Nielsen Candidates for 2-Generator Groups ─────────────────────────

const freeReduce = (w) => {
    const o = [];
    for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); }
    return o;
};
const invW = (w) => w.slice().reverse().map((x) => -x);

/**
 * Short generating pairs (A, w) obtained from (g₁, g₂) by elementary Nielsen moves, where w is an
 * involution in PGL₂ (tr(w) = 0). Each carries exact words wA, wW in ±1, ±2 and their inverse words
 * expressing g₁, g₂ back in (A, w), so a presentation ⟨A, w | w²⟩ gives ⟨g₁, g₂ | wW²⟩ directly!
 */
function involutionPairs(mats) {
    if (mats.length !== 2) return [];
    const [G1, G2] = mats;
    const base = [
        { A: G1, w: G2, wA: [1], wW: [2] },
        { A: G2, w: G1, wA: [2], wW: [1] },
        { A: mul(G1, G2), w: G2, wA: [1, 2], wW: [2] },
        { A: mul(inv(G1), G2), w: G2, wA: [-1, 2], wW: [2] },
        { A: mul(G2, G1), w: G1, wA: [2, 1], wW: [1] },
        { A: mul(inv(G2), G1), w: G1, wA: [-2, 1], wW: [1] },
        { A: G1, w: mul(G1, G2), wA: [1], wW: [1, 2] },
        { A: G2, w: mul(G2, G1), wA: [2], wW: [2, 1] },
    ];
    const out = [], seen = new Set();
    for (const c of base) {
        if (isScalar(c.w) || tr(c.w) !== 0n || isScalar(c.A)) continue;
        // Also allow replacing A by A·w (automorphism of ⟨A, w⟩)
        for (const v of [
            c,
            { A: mul(c.A, c.w), w: c.w, wA: freeReduce(c.wA.concat(c.wW)), wW: c.wW },
        ]) {
            const k = `${matKey(v.A)}|${matKey(v.w)}`;
            if (!seen.has(k)) { seen.add(k); out.push(v); }
        }
    }
    return out;
}

/** Real fixed points { att, rep } of a real-hyperbolic matrix M (tr² > 4 det). */
function realFixedPoints(M) {
    const [a, b, c, d] = M.map(Number);
    const D = (a - d) * (a - d) + 4 * b * c;
    if (!(D > 1e-12)) return null;
    const sD = Math.sqrt(D);
    let r1, r2;
    if (Math.abs(c) > 1e-12) {
        r1 = (a - d + sD) / (2 * c);
        r2 = (a - d - sD) / (2 * c);
    } else {
        r1 = Infinity;
        r2 = b / (d - a);
    }
    // Test attraction near r1 vs r2 by applying M once
    const step = (x) => (x === Infinity ? (c === 0 ? Infinity : a / c) : (a * x + b) / (c * x + d));
    const eps = Number.isFinite(r1) && Number.isFinite(r2) ? Math.min(0.01, 0.1 * Math.abs(r1 - r2)) : 0.01;
    const probe = Number.isFinite(r1) ? r1 + eps : 1e5;
    const img = step(probe);
    const d1 = Number.isFinite(r1) ? Math.abs(img - r1) : 1 / Math.max(1, Math.abs(img));
    const d0 = Number.isFinite(r1) ? eps : 1e-5;
    return d1 < d0 ? { att: r1, rep: r2 } : { att: r2, rep: r1 };
}

// ───────────────────────── 1. Tower Ping-Pong Certificate (towerThin) ─────────────────────────

const modP = (x, p) => ((x % p) + p) % p;
function modInvP(a, p) {
    let [r0, r1, s0, s1] = [modP(a, p), p, 1n, 0n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    return modP(s0, p);
}
function lineOfVec(x, y, p) {
    x = modP(x, p); y = modP(y, p);
    if (y === 0n) return x === 0n ? -1 : Number(p);
    return Number(modP(x * modInvP(y, p), p));
}
function actLineP(M, l, p) {
    const [x, y] = l === Number(p) ? [1n, 0n] : [BigInt(l), 1n];
    return lineOfVec(M[0] * x + M[1] * y, M[2] * x + M[3] * y, p);
}
const neighbourLine = (W, p) => {
    const l = lineOfVec(W[0], W[2], p);
    return l >= 0 ? l : lineOfVec(W[1], W[3], p);
};

/**
 * Try to certify Γ = ⟨A0, W0⟩ thin via a Bass–Serre tower on T_p with exact rational intervals on ℝ.
 * Conjugates by a rational Möbius map μ ∈ PGL₂(ℚ) moving A0's repelling fixed point near ∞, so all
 * intervals of R, base, and N⁺ are bounded rational intervals [lo, hi] ⊂ ℝ!
 */
function tryTowerAtPrime(A0, W0, pNum, deadline) {
    const p = BigInt(pNum);
    if (vp(det(A0), p) !== 0 || vp(det(W0), p) !== 1 || tr(W0) !== 0n) return null;
    if (tr(A0) * tr(A0) - 4n * det(A0) <= 0n) return null; // A0 must be hyperbolic at ℝ

    const l0 = neighbourLine(W0, p);
    if (l0 < 0) return null;

    // Build transitive H₀ action on P¹(F_p) = {0..p} and extract { c_k } and tower base elements:
    //   Mode 'cycle': A0 is a (p+1)-cycle on P¹(F_p)
    //   Mode 'trans2': p = 2, A0 swaps (l0, u) fixing v, and X = W0·A0²·W0 swaps (u, v) fixing l0
    let cList = null, baseMats = null, extraH0 = [];
    const cyc = [l0];
    for (let k = 0; k <= pNum; k++) cyc.push(actLineP(A0, cyc[cyc.length - 1], p));
    if (new Set(cyc.slice(0, pNum + 1)).size === pNum + 1 && cyc[pNum + 1] === l0) {
        // Symmetric exponents e_k ∈ [−(p+1)/2, p/2] (e.g. [1, -2, -1] for p = 3) so t_k = A0^{e_k} has small height
        const T = [ONE];
        for (let k = 1; k <= pNum; k++) {
            const e = k <= Math.floor(pNum / 2) ? k : k - (pNum + 1);
            T.push(pow(A0, e));
        }
        cList = T.slice(1).map((tk) => mul(W0, inv(tk)));
        const x0 = mul(W0, mul(pow(A0, pNum + 1), W0));
        if (vp(det(x0), p) !== 0 || actLineP(x0, l0, p) !== l0) return null;
        baseMats = [{ M: x0, conj: ONE }];
    } else if (pNum === 2) {
        const u = actLineP(A0, l0, p);
        if (u === l0 || actLineP(A0, u, p) !== l0) return null;
        const v = [0, 1, 2].find((l) => l !== l0 && l !== u);
        const X = mul(W0, mul(pow(A0, 2), W0));
        if (vp(det(X), p) !== 0 || actLineP(X, l0, p) !== l0 || actLineP(X, u, p) !== v || actLineP(X, v, p) !== u) return null;
        const c1 = mul(W0, inv(A0)), c2 = mul(W0, inv(mul(X, A0)));
        cList = [c1, c2];
        extraH0 = [X];
        baseMats = [
            { M: A0, conj: c2 },
            { M: pow(X, 2), conj: c1 },
        ];
    } else {
        return null;
    }

    // Try the natural frame first (μ = I), then a det +1 frame shifting fpA0.rep near ∞ while keeping ∞ far away
    const fpA0 = realFixedPoints(A0);
    if (!fpA0) return null;
    const frames = [ONE];
    if (Number.isFinite(fpA0.rep)) {
        const q = approxRat(fpA0.rep, 256n);
        frames.push(prim([20n * q.d, -20n * q.n - q.d, q.d, -q.n])); // z ↦ 20 − 1/(z − q), det = +q.d² > 0
    }

    for (const mu of frames) {
        const mui = inv(mu);
        const inMu = (M) => mul(mu, mul(M, mui));
        const a = inMu(A0);
        const cs = cList.map(inMu);
        const h0Extras = extraH0.map(inMu);
        const bases = baseMats.map(({ M, conj }) => ({ g: inMu(M), c: inMu(conj) }));
        const hit = searchTowerIntervals(a, cs, h0Extras, bases, pNum, deadline);
        if (hit) return hit;
    }
    return null;
}

function searchTowerIntervals(a, cs, h0Extras, bases, pNum, deadline) {
    /** Exact Schottky ping-pong pair check: g(P¹ ∖ int(Dm)) ⊂ int(Dp) and Dp ∩ Dm = ∅. */
    const checkSchottky = (g, Dp, Dm) =>
        arcsDisjoint(Dp, Dm) && arcStrictlyInside(arcImage(g, [Dm[1], Dm[0]]), Dp);

    const iSubset = (I, J) => rLe(J[0], I[0]) && rLe(I[1], J[1]);
    const iApart = (I, J) => rLt(I[1], J[0]) || rLt(J[1], I[0]);
    const isBounded = (A) => !A[0].inf && !A[1].inf && rLt(A[0], A[1]);
    const mergeIntervals = (list) => {
        const sorted = list.slice().sort((x, y) => (rLt(x[0], y[0]) ? -1 : rEq(x[0], y[0]) ? (rLt(x[1], y[1]) ? -1 : 0) : 1));
        const out = [];
        for (const I of sorted) {
            if (out.length && rLe(I[0], out[out.length - 1][1])) {
                if (rLt(out[out.length - 1][1], I[1])) out[out.length - 1] = [out[out.length - 1][0], I[1]];
            } else out.push(I);
        }
        return out;
    };

    /** Build candidate Schottky pairs (Dp, Dm) for g, trying bounded Dm around fp.rep and cyclic Dm through ∞. */
    const candidatePairs = (g, radScales) => {
        const fp = realFixedPoints(g);
        if (!fp) return [];
        const out = [];
        for (const radScale of radScales) {
            const sep = Number.isFinite(fp.att) && Number.isFinite(fp.rep) ? Math.abs(fp.att - fp.rep) : 4;
            const rad = Math.min(radScale, 0.25 * sep);
            const dmCands = [];
            if (Number.isFinite(fp.rep)) {
                dmCands.push([approxRat(fp.rep - rad, 4096n), approxRat(fp.rep + rad, 4096n)]);
                // Also cyclic arcs through ∞ containing fp.rep (useful when g's pole is near another interval)
                if (Number.isFinite(fp.att)) {
                    if (fp.rep > fp.att) {
                        const lo = Math.max(fp.att + 0.35 * (fp.rep - fp.att), fp.rep - 8 * rad);
                        dmCands.push([approxRat(lo, 2048n), approxRat(fp.att - 12 / radScale, 64n)]);
                    } else {
                        const hi = Math.min(fp.att - 0.35 * (fp.att - fp.rep), fp.rep + 8 * rad);
                        dmCands.push([approxRat(fp.att + 12 / radScale, 64n), approxRat(hi, 2048n)]);
                    }
                }
            } else {
                const M = Math.max(4, Math.round(4 / radScale));
                dmCands.push([rat(BigInt(M), 1n), rat(BigInt(-M), 1n)]);
            }
            for (const Dm of dmCands) {
                const imgComp = arcImage(g, [Dm[1], Dm[0]]);
                if (!isBounded(imgComp)) continue;
                const span = Math.max(1e-4, rFloat(imgComp[1]) - rFloat(imgComp[0]));
                const pad = Math.min(rad, Math.max(0.05 * span, 1e-4));
                const Dp = [approxRat(rFloat(imgComp[0]) - pad, 4096n), approxRat(rFloat(imgComp[1]) + pad, 4096n)];
                if (checkSchottky(g, Dp, Dm)) out.push([Dp, Dm]);
            }
        }
        return out;
    };

    /** Build a Schottky pair (Dp, Dm) for g disjoint from every interval/arc in avoidArcs. */
    const findDisjointPair = (g, avoidArcs) => {
        const fp = realFixedPoints(g);
        if (!fp) return null;
        const cands = candidatePairs(g, [0.008, 0.025, 0.08, 0.2, 0.5]);
        // Also construct cyclic Dm as wide as possible outside the bounding box of bounded avoidArcs
        // (wider Dm => smaller complement => tighter g(complement) around fp.att!)
        const boundedAvoid = avoidArcs.filter(isBounded);
        if (boundedAvoid.length && Number.isFinite(fp.att)) {
            const loAll = Math.min(...boundedAvoid.map((I) => rFloat(I[0])));
            const hiAll = Math.max(...boundedAvoid.map((I) => rFloat(I[1])));
            for (const frac of [0.03, 0.1, 0.25, 0.5]) {
                for (const farMargin of [6, 25]) {
                    let mHi = null, mLo = null;
                    if (!Number.isFinite(fp.rep)) {
                        mHi = Math.max(hiAll, fp.att) + farMargin;
                        mLo = Math.min(loAll, fp.att) - farMargin;
                    } else if (fp.rep > hiAll && fp.att < fp.rep) {
                        mHi = Math.max(hiAll, fp.att) + frac * (fp.rep - Math.max(hiAll, fp.att));
                        mLo = Math.min(loAll, fp.att) - farMargin;
                    } else if (fp.rep < loAll && fp.att > fp.rep) {
                        mLo = Math.min(loAll, fp.att) - frac * (Math.min(loAll, fp.att) - fp.rep);
                        mHi = Math.max(hiAll, fp.att) + farMargin;
                    }
                    if (mHi !== null && mLo !== null) {
                        const Dm = [approxRat(mHi, 2048n), approxRat(mLo, 2048n)];
                        const imgComp = arcImage(g, [Dm[1], Dm[0]]);
                        if (isBounded(imgComp)) {
                            const span = Math.max(1e-4, rFloat(imgComp[1]) - rFloat(imgComp[0]));
                            for (const padMul of [0.02, 0.12]) {
                                const pad = Math.max(padMul * span, 2e-4);
                                const Dp = [approxRat(rFloat(imgComp[0]) - pad, 4096n), approxRat(rFloat(imgComp[1]) + pad, 4096n)];
                                if (checkSchottky(g, Dp, Dm)) cands.push([Dp, Dm]);
                            }
                        }
                    }
                }
            }
        }
        for (const [Dp, Dm] of cands) {
            if (avoidArcs.every((A) => arcsDisjoint(Dp, A) && arcsDisjoint(Dm, A))) return [Dp, Dm];
        }
        return null;
    };

    for (const radScale of [0.05, 0.012, 0.003, 0.16]) {
        if (Date.now() > deadline) return null;
        // Choose bounded conjugated base arcs B = c(E±) for each tower base generator { g, c }
        const conjLists = bases.map(({ g, c }) => {
            const list = [];
            for (const [Ep, Em] of candidatePairs(g, [radScale, radScale * 0.3, radScale * 2.5])) {
                const Bp = isScalar(c) ? Ep : arcImage(c, Ep);
                const Bm = isScalar(c) ? Em : arcImage(c, Em);
                if (isBounded(Bp) && isBounded(Bm) && iApart(Bp, Bm)) list.push([Bp, Bm]);
            }
            return list;
        });
        if (conjLists.some((l) => !l.length)) continue;
        let baseArcs = null;
        if (conjLists.length === 1) {
            baseArcs = conjLists[0][0];
        } else {
            outerBase: for (const p0 of conjLists[0]) {
                for (const p1 of conjLists[1]) {
                    if (p0.every((A) => p1.every((B) => iApart(A, B)))) {
                        baseArcs = [...p0, ...p1];
                        break outerBase;
                    }
                }
            }
        }
        if (!baseArcs) continue;

        for (const den of [200n, 500n, 2000n, 8000n]) {
            if (Date.now() > deadline) return null;
            let R = mergeIntervals(baseArcs.map((I) => [floorGrid(I[0], den), ceilGrid(I[1], den)]));
            let settled = false;
            for (let round = 0; round < 200; round++) {
                const next = R.slice();
                let poleHit = false;
                for (const c of cs) for (const I of R) {
                    const J = arcImage(c, I);
                    if (!isBounded(J)) { poleHit = true; break; }
                    next.push([floorGrid(J[0], den), ceilGrid(J[1], den)]);
                }
                if (poleHit) break;
                const merged = mergeIntervals(next);
                if (merged.length > 500) break;
                if (merged.length === R.length && merged.every((I, idx) => rEq(I[0], R[idx][0]) && rEq(I[1], R[idx][1]))) {
                    settled = true;
                    break;
                }
                R = merged;
            }
            if (!settled) continue;

            // Exact verification:
            //   1. c_k(R) ⊂ R for each k, and c_i(R) ∩ c_j(R) = ∅ for i ≠ j
            //   2. each base arc B lies in R and is disjoint from every c_k(R) (and baseArcs are pairwise disjoint)
            const imgs = cs.map((c) => {
                const im = [];
                for (const I of R) { const J = arcImage(c, I); if (!isBounded(J)) return null; im.push(J); }
                return mergeIntervals(im);
            });
            if (imgs.some((x) => !x)) continue;
            let disjointOk = true;
            for (const im of imgs) for (const J of im) if (!R.some((K) => iSubset(J, K))) disjointOk = false;
            for (let i = 0; i < imgs.length && disjointOk; i++) {
                for (let j = i + 1; j < imgs.length && disjointOk; j++) {
                    for (const I of imgs[i]) for (const J of imgs[j]) if (!arcsDisjoint(I, J)) disjointOk = false;
                }
            }
            for (let i = 0; i < baseArcs.length && disjointOk; i++) {
                const B = baseArcs[i];
                if (!R.some((K) => iSubset(B, K))) disjointOk = false;
                for (const im of imgs) for (const J of im) if (!arcsDisjoint(B, J)) disjointOk = false;
                for (let j = 0; j < i; j++) if (!arcsDisjoint(B, baseArcs[j])) disjointOk = false;
            }
            if (!disjointOk) continue;

            //   3. Find Schottky pairs for extra H₀ generators (e.g. X when p = 2) and for a, pairwise disjoint and disjoint from R
            const avoid = R.slice();
            let h0Ok = true;
            for (const g of h0Extras) {
                const pr = findDisjointPair(g, avoid);
                if (!pr) { h0Ok = false; break; }
                avoid.push(pr[0], pr[1]);
            }
            if (!h0Ok) continue;
            const pairA = findDisjointPair(a, avoid);
            if (!pairA) continue;

            return {
                method: 'tower-pingpong',
                prime: pNum,
                intervals: R.length,
                gridDen: Number(den),
            };
        }
    }
    return null;
}

// ───────────────────────── 2. Exact Adelic Ping-Pong (adelicPingPong) ─────────────────────────

function vpRat(x, p) {
    if (x.inf) return -1e9;
    if (x.n === 0n) return 1e9;
    return vp(x.n, p) - vp(x.d, p);
}
function canonPadic(x, k, p) {
    const v = vpRat(x, p);
    if (v >= k) return rat(0n, 1n);
    const pb = BigInt(p);
    const scale = v >= 0 ? pb ** BigInt(v) : 1n;
    const invScale = v < 0 ? pb ** BigInt(-v) : 1n;
    // x = (scale / invScale) * u, where u is a p-adic unit
    const un = (x.n * invScale) / (v >= 0 ? scale : 1n);
    const ud = (x.d * (v >= 0 ? scale : 1n)) / (v < 0 ? invScale : 1n);
    // simpler: exact rational x / p^v
    const u = v >= 0 ? rat(x.n, x.d * pb ** BigInt(v)) : rat(x.n * pb ** BigInt(-v), x.d);
    const m = pb ** BigInt(k - v);
    const r = modP(u.n * modInvP(u.d, m), m);
    return v >= 0 ? rat(r * pb ** BigInt(v), 1n) : rat(r, pb ** BigInt(-v));
}
const ballInBall = (b1, b2, p) => b1.k >= b2.k && vpRat(rSub(b1.x, b2.x), p) >= b2.k;
const ballsMeet = (b1, b2, p) => vpRat(rSub(b1.x, b2.x), p) >= Math.min(b1.k, b2.k);

function diskSubset(D1, D2, p) {
    if (D2.t === 'all') return true;
    if (D1.t === 'all') return false;
    if (D1.t === 'ball' && D2.t === 'ball') return ballInBall(D1, D2, p);
    if (D1.t === 'ball' && D2.t === 'co') return !ballsMeet(D1, { t: 'ball', x: D2.x, k: D2.k }, p);
    if (D1.t === 'co' && D2.t === 'co') return ballInBall({ t: 'ball', x: D2.x, k: D2.k }, { t: 'ball', x: D1.x, k: D1.k }, p);
    return false;
}
function disksMeet(D1, D2, p) {
    if (D1.t === 'all' || D2.t === 'all') return true;
    if (D1.t === 'co' && D2.t === 'co') return true;
    if (D1.t === 'ball' && D2.t === 'ball') return ballsMeet(D1, D2, p);
    const [b, c] = D1.t === 'ball' ? [D1, D2] : [D2, D1];
    return !ballInBall(b, { t: 'ball', x: c.x, k: c.k }, p);
}
function diskImage(g, D, p) {
    if (D.t === 'all') return D;
    if (D.t === 'co') {
        const im = diskImage(g, { t: 'ball', x: D.x, k: D.k }, p);
        return im.t === 'ball' ? { t: 'co', x: im.x, k: im.k } : im.t === 'co' ? { t: 'ball', x: im.x, k: im.k } : { t: 'all' };
    }
    const [, , c, d] = g;
    const pole = c === 0n ? INF : rat(-d, c);
    const poleIn = !pole.inf && vpRat(rSub(pole, D.x), p) >= D.k;
    if (!poleIn) {
        const gx = mobius(g, D.x);
        const denVal = vpRat(rat(c * D.x.n + d * D.x.d, D.x.d), p);
        const r = D.k + vp(det(g), p) - 2 * denVal;
        return { t: 'ball', x: canonPadic(gx, r, p), k: r };
    }
    // B = x + p^k ℤ_p mapped via τ⁻¹(w) = x + 1/w = (x_n w + x_d) / (x_d w)
    const tinv = prim([D.x.n, D.x.d, D.x.d, 0n]);
    const h = mul(g, tinv);
    const inner = diskImage(h, { t: 'ball', x: rat(0n, 1n), k: 1 - D.k }, p);
    return inner.t === 'ball' ? { t: 'co', x: inner.x, k: inner.k } : inner.t === 'co' ? { t: 'ball', x: inner.x, k: inner.k } : { t: 'all' };
}
function roundDisk(D, p, depth) {
    if (D.t === 'all') return D;
    const vx = D.x.n === 0n ? 1e9 : vpRat(D.x, p);
    if (D.t === 'ball') {
        if (D.k < -depth) return { t: 'all' };
        if (vx < -depth && vx < D.k) return { t: 'co', x: rat(0n, 1n), k: -depth };
        if (D.k > depth) return { t: 'ball', x: canonPadic(D.x, depth, p), k: depth };
        return D;
    }
    if (D.k > depth || D.k < -depth || (vx < -depth && vx < D.k)) return { t: 'all' };
    return D;
}
const diskKey = (D) => (D.t === 'all' ? '*' : `${D.t}:${D.x.n}/${D.x.d}@${D.k}`);

function snapArc(arc, gridDen, gridMax) {
    const snapDown = (x) => {
        if (x.inf) return INF;
        const fl = floorGrid(x, gridDen);
        if (fl.n < -gridMax * gridDen) return INF;
        if (fl.n > gridMax * gridDen) return rat(gridMax, 1n);
        return fl;
    };
    const snapUp = (x) => {
        if (x.inf) return INF;
        const cl = ceilGrid(x, gridDen);
        if (cl.n > gridMax * gridDen) return INF;
        if (cl.n < -gridMax * gridDen) return rat(-gridMax, 1n);
        return cl;
    };
    const s0 = snapDown(arc[0]), s1 = snapUp(arc[1]);
    if (rEq(s0, s1)) return null;
    const snapped = [s0, s1];
    return arcSubset(arc, snapped) ? snapped : null;
}

/** Try exact adelic ping-pong on P¹(ℝ) × ∏_{p∈treePrimes} P¹(ℚ_p) where A fixes o at treePrimes. */
function tryAdelicPingPong(A, s, S, deadline) {
    const fp = realFixedPoints(A);
    if (!fp || !Number.isFinite(fp.att) || !Number.isFinite(fp.rep)) return null;
    // Primes in S where A fixes o (v_p(det A) == 0) and s moves o
    const treePrimes = S.map(Number).filter((p) => vp(det(A), p) === 0 && vp(det(s), p) > 0);
    if (!treePrimes.length) return null;

    const farBranch = (p) => {
        const pb = BigInt(p);
        const col = modP(s[0], pb) || modP(s[2], pb) ? [s[0], s[2]] : [s[1], s[3]];
        if (modP(col[1], pb) === 0n) return { t: 'co', x: rat(0n, 1n), k: 0 };
        const t = modP(col[0] * modInvP(col[1], pb), pb);
        return { t: 'ball', x: rat(t, 1n), k: 1 };
    };

    const Ainv = inv(A);
    for (const K of [6, 10]) {
        for (const nRad of [0.125, 0.03125]) {
            if (Date.now() > deadline) return null;
            const sep = Math.abs(fp.att - fp.rep);
            const rad = Math.min(nRad, 0.2 * sep);
            const Np = [approxRat(fp.att - rad, 1024n), approxRat(fp.att + rad, 1024n)];
            const Nm = [approxRat(fp.rep - rad, 1024n), approxRat(fp.rep + rad, 1024n)];
            if (!arcsDisjoint(Np, Nm)) continue;
            if (!arcSubset(arcImage(A, Np), Np) || !arcSubset(arcImage(Ainv, Nm), Nm)) continue;
            const compM = [Nm[1], Nm[0]], compP = [Np[1], Np[0]];
            if (!arcSubset(arcImage(pow(A, K), compM), Np)) continue;
            if (!arcSubset(arcImage(pow(A, -K), compP), Nm)) continue;

            const avoid = (arc) => arcsDisjoint(arc, Np) && arcsDisjoint(arc, Nm) && !rEq(arc[0], Np[1]) && !rEq(arc[1], Np[0]) && !rEq(arc[0], Nm[1]) && !rEq(arc[1], Nm[0]);
            const seedDisks = treePrimes.map(farBranch);
            const tail = [
                { arc: arcImage(s, Np), disks: seedDisks },
                { arc: arcImage(s, Nm), disks: seedDisks },
            ];
            if (!tail.every((t) => avoid(t.arc))) continue;

            const ks = [];
            for (let k = -K + 1; k < K; k++) if (k !== 0) ks.push(k);
            const Apow = new Map(ks.map((k) => [k, pow(A, k)]));
            const depth = 3, gridDen = 32n, gridMax = 16n;

            const W = tail.slice();
            const queue = tail.slice();
            const contained = (C) => W.some((D) => arcSubset(C.arc, D.arc) && treePrimes.every((p, i) => diskSubset(C.disks[i], D.disks[i], p)));
            const orbCache = new Map();
            const orbitTree = (disks) => {
                const startKey = disks.map(diskKey).join('|');
                if (orbCache.has(startKey)) return orbCache.get(startKey);
                const out = [];
                let cur = disks;
                for (let step = 0; step < 512; step++) {
                    out.push(cur);
                    cur = cur.map((d, i) => diskImage(A, d, treePrimes[i]));
                    if (cur.map(diskKey).join('|') === startKey) {
                        const sOut = out.map((trDisks) => trDisks.map((d, i) => roundDisk(diskImage(s, d, treePrimes[i]), treePrimes[i], depth)));
                        orbCache.set(startKey, sOut);
                        return sOut;
                    }
                }
                orbCache.set(startKey, null);
                return null;
            };

            let failed = false;
            while (queue.length && !failed) {
                if (Date.now() > deadline) return null;
                const C = queue.pop();
                const cand = [];
                for (const k of ks) {
                    const g = mul(s, Apow.get(k));
                    cand.push({
                        arc: snapArc(arcImage(g, C.arc), gridDen, gridMax),
                        disks: C.disks.map((d, i) => roundDisk(diskImage(g, d, treePrimes[i]), treePrimes[i], depth)),
                    });
                }
                const orb = orbitTree(C.disks);
                if (!orb) { failed = true; break; }
                const sNp = arcImage(s, Np), sNm = arcImage(s, Nm);
                for (const sDisks of orb) {
                    cand.push({ arc: sNp, disks: sDisks });
                    cand.push({ arc: sNm, disks: sDisks });
                }
                for (const N of cand) {
                    if (!N.arc || !avoid(N.arc)) { failed = true; break; }
                    if (contained(N)) continue;
                    W.push(N);
                    queue.push(N);
                    if (W.length > 400) { failed = true; break; }
                }
            }
            if (failed) continue;

            // Disjointness: A^k(C) ∩ D = ∅ for 0 < |k| < K (for |k| ≥ K, A^k(C)'s arc lies in N±, which W avoids!)
            let disj = true;
            outer: for (const C of W) {
                for (const k of ks) {
                    const g = Apow.get(k);
                    const arc = arcImage(g, C.arc);
                    const disks = C.disks.map((d, i) => diskImage(g, d, treePrimes[i]));
                    for (const D of W) {
                        if (!arcsDisjoint(arc, D.arc) && treePrimes.every((p, i) => disksMeet(disks[i], D.disks[i], p))) {
                            disj = false;
                            break outer;
                        }
                    }
                }
            }
            if (disj) return { method: 'adelic-pingpong', primes: treePrimes, useReal: true, cells: W.length };
        }
    }
    return null;
}

/** Integer square root of n ≥ 0n (exact if square, else null). */
function exactSqrt(n) {
    if (n < 0n) return null;
    if (n < 2n) return n;
    let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
    for (;;) {
        const y = (x + n / x) >> 1n;
        if (y >= x) return x * x === n ? x : null;
        x = y;
    }
}

function rationalFixedPoints(A) {
    const [a, b, c, d] = A;
    if (c === 0n) return d !== a ? [INF, rat(b, d - a)] : null;
    const disc = (d - a) * (d - a) + 4n * b * c;
    const r = exactSqrt(disc);
    if (r === null) return null;
    return [rat(-(d - a) + r, 2n * c), rat(-(d - a) - r, 2n * c)];
}

/** Multiplier A'(z) = det(A)/(c z + d)² (or det(A)/a² in chart w = 1/z at z = ∞). */
function multiplierAt(A, z) {
    const [a, , c, d] = A;
    const DA = det(A);
    if (z.inf) return a !== 0n ? rat(DA, a * a) : null;
    const den = c * z.n + d * z.d;
    return den !== 0n ? rat(DA * z.d * z.d, den * den) : null;
}

/**
 * Exact ping-pong on Ω = (P¹(ℝ) ×) ∏_{p∈P} P¹(ℚ_p) when A is split over ℚ (rational fixed points)
 * and hyperbolic at each active place, ported from pingpong3.py.
 */
function trySplitAdelicPingPong(A, s, S, deadline) {
    const fps = rationalFixedPoints(A);
    if (!fps) return null;
    const m0 = multiplierAt(A, fps[0]), m1 = multiplierAt(A, fps[1]);
    if (!m0 || !m1) return null;

    // Select primes p ∈ S where A is p-adically hyperbolic (vpRat(m0, p) ≠ 0)
    const hypPrimes = S.map(Number).filter((p) => vpRat(m0, p) !== 0 && vpRat(m1, p) !== 0);
    const realHyp = Math.abs(rFloat(m0)) !== 1 && Math.abs(rFloat(m0) - 1) > 1e-12 && Math.abs(rFloat(m0) + 1) > 1e-12;
    if (!hypPrimes.length && !realHyp) return null;

    const Ai = inv(A);
    const makePlace = (v, gridDen, gridMax, depth) => ({
        v,
        all: v === 0 ? { all: true } : { t: 'all' },
        isAll: (x) => (v === 0 ? !!x.all : x.t === 'all'),
        image: (g, x) => (v === 0 ? (x.all ? x : arcImage(g, x)) : diskImage(g, x, v)),
        round: (x) => (v === 0 ? (x.all ? x : snapArc(x, gridDen, gridMax) || { all: true }) : roundDisk(x, v, depth)),
        subset: (x, y) => {
            if (v === 0) return y.all ? true : x.all ? false : arcSubset(x, y);
            return diskSubset(x, y, v);
        },
        meets: (x, y) => {
            if (v === 0) return x.all || y.all ? true : !arcsDisjoint(x, y);
            return disksMeet(x, y, v);
        },
        nbhd: (z, size) => {
            if (v === 0) {
                if (z.inf) return [rat(BigInt(size), 1n), rat(BigInt(-size), 1n)];
                const eps = rat(1n, BigInt(size));
                return [rSub(z, eps), rat(z.n * eps.d + eps.n * z.d, z.d * eps.d)];
            }
            if (z.inf) return { t: 'co', x: rat(0n, 1n), k: -size };
            return { t: 'ball', x: canonPadic(z, size, v), k: size };
        },
    });

    for (const useReal of (realHyp ? (hypPrimes.length ? [true, false] : [true]) : [false])) {
        if (!useReal && !hypPrimes.length) continue;
        for (const padicSize of [1, 2]) {
            for (const [realSize, depth, gridDen] of [[4, 4, 32n], [16, 6, 128n]]) {
                if (!useReal && realSize !== 4) continue;
                if (Date.now() > deadline) return null;
                const places = (useReal ? [makePlace(0, gridDen, 16n, depth)] : [])
                    .concat(hypPrimes.map((p) => makePlace(p, gridDen, 16n, depth)));

                const Npos = [], Nneg = [], nuPos = [], nuNeg = [];
                let trapOk = true;
                for (const P of places) {
                    const attract0 = P.v === 0 ? Math.abs(rFloat(m0)) < 1 : vpRat(m0, P.v) > 0;
                    const [aPt, rPt] = attract0 ? [fps[0], fps[1]] : [fps[1], fps[0]];
                    const sz = P.v === 0 ? realSize : padicSize;
                    const np = P.nbhd(aPt, sz), nm = P.nbhd(rPt, sz);
                    if (!P.subset(P.image(A, np), np) || !P.subset(P.image(Ai, nm), nm)) { trapOk = false; break; }
                    Npos.push(np); Nneg.push(nm);
                    nuPos.push(P.nbhd(rPt, P.v === 0 ? 64 : 4));
                    nuNeg.push(P.nbhd(aPt, P.v === 0 ? 64 : 4));
                }
                if (!trapOk) continue;

                const imgCell = (g, C) => places.map((P, i) => P.image(g, C[i]));
                const rndCell = (C) => places.map((P, i) => P.round(C[i]));
                const insideCell = (C, D) => places.every((P, i) => P.subset(C[i], D[i]));
                const meetsCell = (C, D) => places.every((P, i) => P.meets(C[i], D[i]));

                const tailOf = (C, sg) => {
                    const g = sg === 1 ? A : Ai;
                    const Nsg = sg === 1 ? Npos : Nneg;
                    const nusg = sg === 1 ? nuPos : nuNeg;
                    let K = 0, ok = false;
                    const T = [];
                    for (let i = 0; i < places.length; i++) {
                        const P = places[i];
                        let x = C[i];
                        if (P.isAll(x) || P.meets(x, nusg[i])) { T.push(P.all); continue; }
                        let trappedAt = -1;
                        for (let k = 0; k <= 40; k++) {
                            if (P.subset(x, Nsg[i])) { trappedAt = k; break; }
                            x = P.image(g, x);
                            if (k > 4) x = P.round(x);
                        }
                        if (trappedAt < 0) { T.push(P.all); continue; }
                        if (trappedAt > K) K = trappedAt;
                        T.push(Nsg[i]);
                        ok = true;
                    }
                    return ok ? { K, T } : null;
                };

                const W = [], tails = [], queue = [];
                const addCell = (C) => {
                    if (W.some((D) => insideCell(C, D))) return true;
                    const tp = tailOf(C, 1), tm = tailOf(C, -1);
                    if (!tp || !tm) return false;
                    queue.push(W.length);
                    W.push(C);
                    tails.push([tp, tm]);
                    return true;
                };

                if (!addCell(rndCell(imgCell(s, Npos))) || !addCell(rndCell(imgCell(s, Nneg)))) continue;
                let failed = false;
                while (queue.length && !failed) {
                    if (Date.now() > deadline) return null;
                    const idx = queue.pop();
                    const C = W[idx];
                    for (const [sg, tl] of [[1, tails[idx][0]], [-1, tails[idx][1]]]) {
                        for (let k = 1; k < tl.K; k++) {
                            if (!addCell(rndCell(imgCell(mul(s, pow(A, sg * k)), C)))) { failed = true; break; }
                        }
                        if (failed || !addCell(rndCell(imgCell(s, tl.T))) || W.length > 600) { failed = true; break; }
                    }
                }
                if (failed) continue;

                let disj = true;
                outer: for (let i = 0; i < W.length; i++) {
                    const C = W[i];
                    for (const [sg, tl] of [[1, tails[i][0]], [-1, tails[i][1]]]) {
                        for (let k = 1; k < tl.K; k++) {
                            const I = imgCell(pow(A, sg * k), C);
                            for (const D of W) if (meetsCell(I, D)) { disj = false; break outer; }
                        }
                        for (const D of W) if (meetsCell(tl.T, D)) { disj = false; break outer; }
                    }
                }
                if (disj) {
                    return { method: 'adelic-pingpong', primes: hypPrimes, useReal, cells: W.length };
                }
            }
        }
    }
    return null;
}

// ───────────────────────── 3. Single-Tree Bass–Serre + Fuchsian Check ─────────────────────────

function lineStabSchreier(gens, l0, p) {
    const all = gens.concat(gens.map(inv));
    const trans = new Map([[l0, ONE]]);
    const queue = [l0];
    while (queue.length) {
        const l = queue.shift();
        for (const a of all) {
            const l2 = actLineP(a, l, p);
            if (!trans.has(l2)) { trans.set(l2, mul(a, trans.get(l))); queue.push(l2); }
        }
    }
    const sch = new Map();
    for (const [l, t] of trans) for (const a of all) {
        const l2 = actLineP(a, l, p);
        const h = mul(inv(trans.get(l2)), mul(a, t));
        if (!isScalar(h)) sch.set(matKey(h), h);
    }
    return { orbitSize: trans.size, gens: [...sch.values()] };
}

function ballMap(gens, cap = 15000, deadline = Infinity) {
    const all = gens.concat(gens.map(inv));
    const out = new Map([[matKey(ONE), ONE]]);
    let frontier = [ONE];
    while (frontier.length && out.size < cap && Date.now() < deadline) {
        const next = [];
        for (const M of frontier) for (const a of all) {
            const N = mul(M, a), k = matKey(N);
            if (!out.has(k)) { out.set(k, N); next.push(N); if (out.size >= cap) break; }
        }
        frontier = next;
    }
    return out;
}

function inSubgroup(y, gens, B) {
    const all = gens.concat(gens.map(inv));
    const h2 = (M) => M[0] * M[0] + M[1] * M[1] + M[2] * M[2] + M[3] * M[3];
    let x = y;
    for (let guard = 0; guard < 200 && !isScalar(x); guard++) {
        let best = null, bh = h2(x);
        for (const a of all) for (const z of [mul(a, x), mul(x, a)]) {
            const hz = h2(z);
            if (hz < bh) { best = z; bh = hz; }
        }
        if (!best) break;
        x = best;
    }
    if (isScalar(x)) return true;
    for (const v of B.values()) if (B.has(matKey(mul(x, inv(v))))) return true;
    return false;
}

function trySingleTreeFold(A0, W0, pNum, archCheck, deadline) {
    if (!archCheck) return null;
    const p = BigInt(pNum);
    if (vp(det(A0), p) !== 0 || vp(det(W0), p) !== 1 || tr(W0) !== 0n) return null;
    const lw = neighbourLine(W0, p);
    if (lw < 0) return null;
    let k = 1, l = actLineP(A0, lw, p);
    while (l !== lw && k <= pNum + 2) { l = actLineP(A0, l, p); k++; }
    if (l !== lw) return null;
    let H = [A0, mul(W0, mul(pow(A0, k), W0))].filter((M) => !isScalar(M));
    for (let round = 1; round <= 12; round++) {
        if (Date.now() > deadline) return null;
        const st = lineStabSchreier(H, lw, p);
        if (st.orbitSize !== pNum + 1) return null;
        const H0 = H.slice();
        const B = ballMap(H0, 12000, deadline);
        let added = 0;
        for (const h of st.gens) {
            const y = mul(W0, mul(h, W0));
            if (H.some((x) => matKey(x) === matKey(y) || matKey(inv(x)) === matKey(y))) continue;
            if (!inSubgroup(y, H0, B)) { H.push(y); added++; if (H.length > 24) return null; }
        }
        if (!added) {
            const res = archCheck(H.map((M) => M.map(String)));
            if (res && res.verified) {
                return { method: 'single-tree', prime: pNum, hGens: H.length, faces: res.faces };
            }
            return null;
        }
    }
    return null;
}

// ───────────────────────── Entry Point ─────────────────────────

/**
 * Attempt to certify Γ = ⟨rows⟩ ⊂ PGL₂(ℚ) (unbounded at S ≠ ∅) thin, using exact rational
 * tower ping-pong, adelic ping-pong, and (when archCheck is provided) single-tree Bass–Serre + Poincaré.
 *
 * Returns { thin: true, method, detail, lines, presentation?: { relators } } or { thin: false }.
 */
export function certifyThinQ(rows, S, { seconds = 6, archCheck = null } = {}) {
    const t0 = Date.now();
    const deadline = t0 + 1000 * seconds;
    if (!S || !S.length) return { ok: false, thin: false, ms: 0 };
    const R = reduceToLambda(rows, S);
    if (!R) return { ok: false, thin: false, ms: Date.now() - t0 };
    const mats = R.mats;
    const Snum = S.map(Number);
    const Ltex = `\\mathrm{PGL}_2(\\mathbb{Z}[1/${Snum.join('\\cdot ')}])`;

    const cands = involutionPairs(mats);
    const evalOrig = (w) => w.reduce((A, x) => mul(A, x > 0 ? mats[x - 1] : inv(mats[-x - 1])), ONE);
    const d1 = t0 + 1000 * seconds * (archCheck ? 0.35 : 0.55);
    const d2 = t0 + 1000 * seconds * (archCheck ? 0.70 : 1.0);

    // 1. Adelic ping-pong on (P¹(ℝ) ×) ∏ P¹(ℚ_p) (|S| ≥ 1) — fastest when it applies (typically < 30 ms)
    for (const { A, w, wW } of cands) {
        if (Date.now() > d1) break;
        const ap = tryAdelicPingPong(A, w, Snum, d1) || trySplitAdelicPingPong(A, w, Snum, d1);
        if (ap) {
            const rel = freeReduce(wW.concat(wW));
            if (!isScalar(evalOrig(rel))) throw new Error('internal: involution relator check failed');
            const factors = (ap.useReal ? ['\\mathbb{P}^1(\\mathbb{R})'] : [])
                .concat(ap.primes.map((p) => `\\mathbb{P}^1(\\mathbb{Q}_{${p}})`));
            const omegaTex = factors.join(' \\times ');
            return {
                ok: true,
                thin: true,
                method: ap.method,
                primes: ap.primes,
                cells: ap.cells,
                ms: Date.now() - t0,
                presentation: { relators: [rel], structure: '\\mathbb{Z} \\ast \\mathbb{Z}/2' },
                detail: `$\\Gamma \\cong \\mathbb{Z} \\ast \\mathbb{Z}/2$ by exact adelic ping-pong (${ap.cells} cells on $${omegaTex}$), so $[${Ltex} : \\Gamma] = \\infty$.`,
                lines: [
                    `Exact rational ping-pong with ${ap.cells} open cells on $${omegaTex}$ proves $\\Gamma \\cong \\mathbb{Z} \\ast \\mathbb{Z}/2$.`,
                    `Every subgroup of finite index in $${Ltex}$ contains a Baumslag–Solitar subgroup $\\mathrm{BS}(1, p^k)$ and so is not virtually free.`,
                    `Hence $[${Ltex} : \\Gamma] = \\infty$: $\\Gamma$ is thin.`,
                ],
            };
        }
    }

    // 2. Tower ping-pong (|S| ≥ 2)
    if (Snum.length >= 2) {
        for (const { A, w, wW } of cands) {
            for (const p of Snum) {
                if (p > 7 || Date.now() > d2) continue;
                const tw = tryTowerAtPrime(A, w, p, d2);
                if (tw) {
                    const rel = freeReduce(wW.concat(wW));
                    if (!isScalar(evalOrig(rel))) throw new Error('internal: involution relator check failed');
                    return {
                        ok: true,
                        thin: true,
                        method: tw.method,
                        prime: tw.prime,
                        intervals: tw.intervals,
                        ms: Date.now() - t0,
                        presentation: { relators: [rel], structure: '\\mathbb{Z} \\ast \\mathbb{Z}/2' },
                        detail: `$\\Gamma \\cong \\mathbb{Z} \\ast \\mathbb{Z}/2$ is discrete in $\\mathrm{PGL}_2(\\mathbb{R}) \\times \\mathrm{PGL}_2(\\mathbb{Q}_{${p}})$, by Bass–Serre tower ping-pong on $T_{${p + 1}}$ (${tw.intervals} intervals).`,
                        lines: [
                            `On the $${p + 1}$-regular tree at $${p}$, Bass–Serre decomposes $\\Gamma$ as $H \\ast_{H_e} (H_e \\rtimes \\langle w \\rangle)$, where $w^2 = 1$ inverts $[o, w\\cdot o]$.`,
                            `An exact rational ping-pong region on $\\mathbb{P}^1(\\mathbb{R})$ (${tw.intervals} intervals at denominator $${tw.gridDen}$) proves that the vertex stabilizer $H = \\Gamma_o$ is a discrete free product in $\\mathrm{PGL}_2(\\mathbb{R})$, and $\\Gamma \\cong \\mathbb{Z} \\ast \\mathbb{Z}/2$.`,
                            `So $\\Gamma$ is discrete in $\\mathrm{PGL}_2(\\mathbb{R}) \\times \\mathrm{PGL}_2(\\mathbb{Q}_{${p}})$. By strong approximation, $${Ltex}$ projects densely there, so $[${Ltex} : \\Gamma] = \\infty$: $\\Gamma$ is thin.`,
                        ],
                    };
                }
            }
        }
    }

    // 3. Single-tree Bass–Serre closure + Poincaré (|S| ≥ 2)
    if (Snum.length >= 2 && archCheck) {
        for (const { A, w } of cands) {
            for (const p of Snum) {
                if (p > 13 || Date.now() > deadline) continue;
                const st = trySingleTreeFold(A, w, p, archCheck, deadline);
                if (st) {
                    return {
                        ok: true,
                        thin: true,
                        method: st.method,
                        prime: st.prime,
                        ms: Date.now() - t0,
                        detail: `$\\Gamma$ is discrete in $\\mathrm{PGL}_2(\\mathbb{R}) \\times \\mathrm{PGL}_2(\\mathbb{Q}_{${p}})$: its vertex stabilizer on $T_{${p + 1}}$ closes on ${st.hGens} generators and is Fuchsian (${st.faces} sides).`,
                        lines: [
                            `On the tree at $${p}$, the vertex stabilizer $H = \\Gamma_o$ closes under $w \\cdot \\mathrm{Stab}_H(w\\cdot o) \\cdot w \\subseteq H$ with ${st.hGens} generators, giving $\\Gamma \\cong H \\ast_{H_e} (H_e \\rtimes \\langle w \\rangle)$.`,
                            `Poincaré’s theorem verifies a Dirichlet domain with ${st.faces} sides for $H$ in $\\mathrm{PGL}_2(\\mathbb{R})$, so $\\Gamma$ is discrete in $\\mathrm{PGL}_2(\\mathbb{R}) \\times \\mathrm{PGL}_2(\\mathbb{Q}_{${p}})$.`,
                            `Since $|S| \\ge 2$, $${Ltex}$ projects densely there by strong approximation, so $[${Ltex} : \\Gamma] = \\infty$: $\\Gamma$ is thin.`,
                        ],
                    };
                }
            }
        }
    }

    return { ok: false, thin: false, ms: Date.now() - t0 };
}
