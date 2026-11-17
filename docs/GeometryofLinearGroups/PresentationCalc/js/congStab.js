/**
 * congStab.js — congruence-targeted stabilizer certificate for Γ ⊂ PGL₂(ℚ).
 *
 * Let Γ ⊂ PGL₂(ℚ) be Zariski dense with unbounded prime set S ≠ ∅, and let K ≤ Λ = PGL₂(ℤ[1/S])
 * be its finite-index even-valuation subgroup (conjugated into Λ at any cosmetic primes via
 * reduceToLambda).
 *
 * By the congruence subgroup property for Λ = PGL₂(ℤ[1/S]) (S ≠ ∅) and Appendix A of
 * arXiv:2308.07785, K has finite index in Λ if and only if K_o = K ∩ PGL₂(ℤ) has finite index
 * in PGL₂(ℤ) (since K_o ∩ SL₂(ℤ) of finite index in SL₂(ℤ) has open closure in ∏_{p∈S} SL₂(ℤ_p),
 * and K is Zariski dense and unbounded at every p ∈ S, so its closure contains ∏_{p∈S} PSL₂(ℚ_p)).
 *
 * Algorithm:
 *   1. Fold any already-known stabilizer elements of K_o into a Stallings graph H ≤ PGL₂(ℤ)
 *      (SubPGL2Z). Unlike Todd–Coxeter, Stallings folding in ℤ/2 ∗ ℤ/3 handles millions of
 *      cosets in milliseconds; if H already has finite index, we are done immediately.
 *   2. Otherwise compute the congruence closure image of K at the deficient prime powers outside S,
 *      let PGL₂(ℤ) act on its cosets to obtain Schreier generators of Δ_o = Δ ∩ PGL₂(ℤ), and fold
 *      them to a Stallings basis of Δ_o.
 *   3. Search for the basis elements of Δ_o missing from H using short BFS + FlashBeam (beamWords),
 *      seeding with elements already found, and fold each hit (after exact matrix verification)
 *      into H until [PGL₂(ℤ) : H] < ∞.
 */
import { SubPGL2Z } from './bsfold.js';
import { reduceToLambda } from './sarithIndex.js';
import { beamWords } from './wordSearch.js';
import { babs, det, prim, mul, adj, inv, ONE, isScalar, key as matKey } from './mat2.js';

const md = (x, q) => ((x % q) + q) % q;
const gcdn = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
function invmod(x, q) {
    let [a, b, s, t] = [md(x, q), q, 1, 0];
    while (b) { const k = Math.floor(a / b); [a, b] = [b, a - k * b]; [s, t] = [t, s - k * t]; }
    return md(s, q);
}
const isPrime = (n) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };

/** Projective matrices mod each q ∈ levels, plus determinant sign/S-valuation parity class. */
function stateOps(levels, S) {
    const norm = (m, q) => {
        const e = m.map((x) => md(x, q));
        const f = e.find((x) => gcdn(x, q) === 1);
        const s = invmod(f, q);
        return e.map((x) => md(x * s, q));
    };
    const mulq = (A, B, q) => [
        md(A[0] * B[0] + A[1] * B[2], q), md(A[0] * B[1] + A[1] * B[3], q),
        md(A[2] * B[0] + A[3] * B[2], q), md(A[2] * B[1] + A[3] * B[3], q),
    ];
    const cls = (M) => {
        let d = det(M), c = d < 0n ? 1 : 0;
        d = babs(d);
        S.forEach((p, i) => {
            const pb = BigInt(p);
            let v = 0;
            while (d % pb === 0n) { d /= pb; v++; }
            if (v & 1) c |= 2 << i;
        });
        return c;
    };
    const of = (M) => ({
        ms: levels.map((q) => norm(M.map((x) => Number(((x % BigInt(q)) + BigInt(q)) % BigInt(q))), q)),
        c: cls(M),
    });
    const mulS = (X, Y) => ({ ms: X.ms.map((m, i) => norm(mulq(m, Y.ms[i], levels[i]), levels[i])), c: X.c ^ Y.c });
    const invS = (X) => ({ ms: X.ms.map((m, i) => norm([m[3], -m[1], -m[2], m[0]], levels[i])), c: X.c });
    const key = (X) => `${X.ms.map((m) => m.join('.')).join('|')}#${X.c}`;
    return { of, mul: mulS, inv: invS, key };
}

function imageOf(ops, gens, cap = 4000000, deadline = Infinity) {
    const g = gens.concat(gens.map(adj)).map(ops.of);
    const one = ops.of(ONE);
    const seen = new Set([ops.key(one)]), queue = [one];
    let head = 0;
    while (head < queue.length) {
        if ((head & 1023) === 0 && Date.now() > deadline) return null;
        const x = queue[head++];
        for (const h of g) {
            const y = ops.mul(x, h), k = ops.key(y);
            if (!seen.has(k)) {
                if (seen.size >= cap) return null;
                seen.add(k);
                queue.push(y);
            }
        }
    }
    return { set: seen, list: queue };
}

/** Projective line P¹(𝔽_l) = {0..l} orbit size of 0 under gens (l prime). */
function p1OrbitSize(gens, l) {
    const lb = BigInt(l);
    const all = gens.concat(gens.map(adj)).map((M) => M.map((x) => md(Number(x % lb), l)));
    const act = (m, pt) => {
        const x = pt === l ? 1 : pt, y = pt === l ? 0 : 1;
        const nx = md(m[0] * x + m[1] * y, l), ny = md(m[2] * x + m[3] * y, l);
        if (ny === 0) return nx === 0 ? -1 : l;
        return md(nx * invmod(ny, l), l);
    };
    const seen = new Uint8Array(l + 1);
    const q = [0];
    seen[0] = 1;
    let count = 1;
    while (q.length) {
        const pt = q.pop();
        for (const m of all) {
            const np = act(m, pt);
            if (np >= 0 && !seen[np]) { seen[np] = 1; count++; q.push(np); }
        }
    }
    return count;
}

function scanDeficientLevels(gens, S, { cap = 2000000, maxPrime = 180, deadline = Infinity } = {}) {
    const out = [];
    const sSet = new Set(S.map(Number));
    const pglOrder = (l, k) => l ** (3 * k) * (1 - 1 / (l * l));
    for (let l = 2; l < maxPrime; l++) {
        if (Date.now() > deadline) break;
        if (!isPrime(l) || sSet.has(l)) continue;
        // Dickson's theorem over prime field 𝔽_l (l ≥ 5): any proper subgroup of PSL₂(𝔽_l) either
        // is intransitive on P¹(𝔽_l) (Borel) or has order ≤ max(60, l + 1) in PSL₂ (≤ max(120, 2(l + 1)) in PGL₂).
        // So we never need to enumerate millions of elements of PGL₂(𝔽_l) just to prove surjectivity!
        let expect;
        if (l === 2) expect = 6;
        else {
            const leg = (x) => {
                x = md(x, l);
                let r = 1, b = x, e = (l - 1) / 2;
                while (e) { if (e & 1) r = (r * b) % l; b = (b * b) % l; e >>= 1; }
                return r;
            };
            const classes = new Set(gens.map((g) => leg(Number(md(det(g), BigInt(l))))));
            expect = ((l * (l * l - 1)) / 2) * (classes.size === 2 || classes.has(l - 1) ? 2 : 1);
        }
        let imSize = expect;
        if (l <= 7) {
            const im = imageOf(stateOps([l], []), gens, cap, deadline);
            if (!im) continue;
            imSize = im.set.size;
        } else {
            const orb = p1OrbitSize(gens, l);
            const dicksonCap = Math.max(121, 2 * (l + 1) + 1);
            const probe = imageOf(stateOps([l], []), gens, dicksonCap, deadline);
            if (probe !== null) {
                imSize = probe.set.size; // closed below dicksonCap -> proper subgroup!
            } else if (orb < l + 1) {
                // Intransitive Borel subgroup of order > dicksonCap: compute exact image mod l
                const im = imageOf(stateOps([l], []), gens, Math.min(cap, l * (l + 1) * 2 + 10), deadline);
                if (!im) continue;
                imSize = im.set.size;
            }
        }
        // Even if surjective mod l, primes l ∈ {2, 3, 5} can fail to lift surjectively mod l² (Serre).
        if (imSize >= expect) {
            if (l <= 5 && pglOrder(l, 2) <= cap && Date.now() < deadline) {
                const im2 = imageOf(stateOps([l * l], []), gens, cap, deadline);
                const expect2 = expect * l * l * l;
                if (im2 && im2.set.size < expect2) {
                    let k = 2, index = pglOrder(l, 2) / im2.set.size;
                    for (;;) {
                        if (pglOrder(l, k + 1) / index > cap || Date.now() > deadline) break;
                        const imk = imageOf(stateOps([l ** (k + 1)], []), gens, cap, deadline);
                        if (!imk) break;
                        const ik = pglOrder(l, k + 1) / imk.set.size;
                        if (ik <= index * (1 + 1e-9)) break;
                        k++; index = ik;
                    }
                    out.push(l ** k);
                }
            }
            continue;
        }
        let k = 1, index = pglOrder(l, 1) / imSize;
        for (;;) {
            if (pglOrder(l, k + 1) / index > cap || Date.now() > deadline) break;
            const imk = imageOf(stateOps([l ** (k + 1)], []), gens, cap, deadline);
            if (!imk) break;
            const ik = pglOrder(l, k + 1) / imk.set.size;
            if (ik <= index * (1 + 1e-9)) break;
            k++; index = ik;
        }
        out.push(l ** k);
    }
    return out;
}

/** Compute Stallings basis of Δ_o = Δ ∩ PGL₂(ℤ) for Γ = ⟨gens⟩ ≤ PGL₂(ℤ[1/S]). */
export function deltaStabilizerBasis(gens, S, { levels = null, maxCosets = 250000, cap = 4000000, deadline = Infinity } = {}) {
    const Sn = S.map(Number);
    const lv = levels && levels.length ? levels.slice() : scanDeficientLevels(gens, Sn, { cap, deadline });
    const ops = stateOps(lv, Sn);
    const im = imageOf(ops, gens, cap, deadline);
    if (!im) return { error: 'congruence image too large' };
    const P = [[0n, -1n, 1n, 0n], [1n, 1n, 0n, 1n], [1n, 0n, 0n, -1n]]; // S, T, J
    const Ps = P.map(ops.of);
    const reps = [ops.of(ONE)], trans = [ONE], repInv = [ops.inv(reps[0])];

    // Adaptive coset lookup: linear scan while reps.length ≤ 128, then O(1) hash table y = reps[j]·h → j
    // whenever the ambient state count fits in memory (≤ 3,500,000 states).
    let cosetOf = null;
    const registerCoset = (j) => {
        const r = reps[j];
        for (let m = 0; m < im.list.length; m++) {
            cosetOf.set(ops.key(ops.mul(r, im.list[m])), j);
        }
    };
    const maybeBuildTable = () => {
        if (cosetOf !== null) return;
        if (reps.length > 128 && reps.length * im.list.length <= 3500000 && im.list.length <= 200000) {
            cosetOf = new Map();
            for (let j = 0; j < reps.length; j++) registerCoset(j);
        }
    };
    const find = (y) => {
        if (cosetOf !== null) return cosetOf.get(ops.key(y)) ?? -1;
        for (let j = 0; j < reps.length; j++) {
            if (im.set.has(ops.key(ops.mul(repInv[j], y)))) return j;
        }
        return -1;
    };

    const H = new SubPGL2Z();
    for (let i = 0; i < reps.length; i++) {
        if ((i & 63) === 0 && Date.now() > deadline) return { error: 'time limit in Δ_o coset action' };
        for (let a = 0; a < P.length; a++) {
            const y = ops.mul(Ps[a], reps[i]);
            let j = find(y);
            const gt = mul(P[a], trans[i]);
            if (j < 0) {
                if (reps.length >= maxCosets) return { error: 'Δ_o index too large' };
                j = reps.length;
                reps.push(y);
                repInv.push(ops.inv(y));
                trans.push(gt);
                if (cosetOf !== null) {
                    if (cosetOf.size + im.list.length > 3500000) cosetOf = null; // fallback if exceeded
                    else registerCoset(j);
                } else {
                    maybeBuildTable();
                }
                continue;
            }
            const h = mul(inv(trans[j]), gt);
            if (!isScalar(h)) H.add(h, true);
        }
    }
    while (H.undefer()) { if (Date.now() > deadline) return { error: 'time limit folding Δ_o' }; }
    const st = H.stats();
    if (!st.finite || H.pendingHuge()) return { error: 'Δ_o did not close to finite index' };
    return { levels: lv, deltaIndex: st.index, basis: H.basis(), graph: H };
}

/** BFS ball of reduced words in `gens` (collapsing self-inverse involutions) up to `maxElements`. */
function reducedBall(gens, maxElements = 65000, deadline = Infinity) {
    const letters = [], invIdx = [], names = [];
    gens.forEach((g, i) => {
        const k = letters.length;
        if (g[0] + g[3] === 0n) {
            letters.push(g); invIdx.push(k); names.push(i + 1);
        } else {
            letters.push(g, inv(g)); invIdx.push(k + 1, k); names.push(i + 1, -(i + 1));
        }
    });
    const out = new Map([[matKey(ONE), { M: ONE, word: [], last: -1 }]]);
    const queue = [out.get(matKey(ONE))];
    let head = 0;
    while (head < queue.length && out.size < maxElements) {
        if ((head & 511) === 0 && Date.now() > deadline) break;
        const cur = queue[head++];
        for (let l = 0; l < letters.length; l++) {
            if (cur.last >= 0 && l === invIdx[cur.last]) continue;
            const M = mul(cur.M, letters[l]);
            const k = matKey(M);
            if (!out.has(k)) {
                const entry = { M, word: cur.word.concat([names[l]]), last: l };
                out.set(k, entry);
                queue.push(entry);
                if (out.size >= maxElements) break;
            }
        }
    }
    return out;
}

function meetInBall(target, B) {
    for (const { M: V, word: wv } of B.values()) {
        const hit = B.get(matKey(mul(target, inv(V))));
        if (hit) return hit.word.concat(wv);
    }
    return null;
}

/**
 * Attempt to certify that Γ = ⟨rows⟩ ⊂ PGL₂(ℚ) (unbounded at S ≠ ∅) contains a finite-index
 * subgroup of PGL₂(ℤ) (up to the conjugation of reduceToLambda), hence is S-arithmetic.
 *
 * opts:
 *   stabWords: words (±(i+1)) in the original generators already known to fix o (e.g. from FlashBeam)
 *   levels:    candidate congruence levels (numbers), if already computed by congruenceClosure
 *   seconds:   time budget (default 8)
 *
 * Returns { ok: true, method: 'stallings' | 'congruence-mitm', stabIndex, kernelIndex, used, ms, levels? }
 * or { ok: false, reason, ms }.
 */
export function certifyCongruenceStabilizer(rows, S, opts = {}) {
    const t0 = Date.now();
    const seconds = opts.seconds ?? 8;
    const deadline = t0 + 1000 * seconds;
    if (!S || !S.length) return { ok: false, reason: 'S is empty', ms: 0 };
    const R = reduceToLambda(rows, S);
    if (!R) return { ok: false, reason: 'not over ℚ', ms: Date.now() - t0 };

    const origMats = R.mats;
    const C = R.C, Ci = inv(C);
    const inFrame = (M) => mul(Ci, mul(M, C));
    const frameGens = origMats.map(inFrame);
    const evalOrig = (w) => w.reduce((A, x) => mul(A, x > 0 ? origMats[x - 1] : inv(origMats[-x - 1])), ONE);

    // 1. Fold any stabilizer words already harvested into H ≤ PGL₂(ℤ).
    const H = new SubPGL2Z();
    const seeds = [];
    let used = 0;
    for (const w of opts.stabWords || []) {
        const M = inFrame(evalOrig(w));
        if (babs(det(M)) !== 1n || isScalar(M)) continue;
        if (H.add(M, true)) used++;
        if (seeds.length < 120) seeds.push({ M, word: w });
    }
    while (H.undefer()) {
        if (Date.now() > deadline) return { ok: false, reason: 'time limit folding stabilizer', ms: Date.now() - t0 };
    }
    const st0 = H.stats();
    if (st0.finite && !H.pendingHuge()) {
        return {
            ok: true,
            method: 'stallings',
            stabIndex: st0.index,
            vertices: st0.vertices,
            kernelIndex: R.reps.size,
            conjugated: R.conjugatedAt.length > 0,
            used,
            ms: Date.now() - t0,
        };
    }

    // 2. Compute Stallings basis of Δ_o = Δ ∩ PGL₂(ℤ) directly on frameGens.
    const remSec = () => Math.max(0.2, (deadline - Date.now()) / 1000);
    if (Date.now() > deadline) return { ok: false, reason: 'out of time', ms: Date.now() - t0 };
    const D = deltaStabilizerBasis(frameGens, S, {
        levels: opts.levels,
        deadline: t0 + 1000 * Math.min(seconds * 0.45, 6),
    });
    if (D.error) return { ok: false, reason: D.error, ms: Date.now() - t0 };

    const missing = D.basis
        .filter((g) => !H.has(g))
        .sort((a, b) => {
            const ha = a.reduce((s, x) => s + x * x, 0n), hb = b.reduce((s, x) => s + x * x, 0n);
            return ha < hb ? -1 : ha > hb ? 1 : 0;
        });

    if (!missing.length) {
        const st = H.stats();
        if (st.finite && !H.pendingHuge()) {
            return { ok: true, method: 'stallings', stabIndex: st.index, kernelIndex: R.reps.size, conjugated: R.conjugatedAt.length > 0, used, levels: D.levels, ms: Date.now() - t0 };
        }
    }

    // 3a. Meet-in-the-middle on a reduced word ball in frameGens (reaches word length ~30 for 2-gen groups with an involution).
    const acceptWord = (w, targetM) => {
        if (!w) return false;
        const checkM = inFrame(evalOrig(w));
        if (babs(det(checkM)) !== 1n || isScalar(checkM)) return false;
        if (matKey(checkM) !== matKey(targetM)) return false;
        if (H.add(checkM, true)) used++;
        if (seeds.length < 160) seeds.push({ M: checkM, word: w });
        return true;
    };

    const B = reducedBall(frameGens, opts.ballElements ?? 65000, t0 + 1000 * Math.min(seconds * 0.7, 5));
    // Also harvest any accidental PGL₂(ℤ) hits already inside the ball!
    for (const { M, word } of B.values()) {
        if (babs(det(M)) === 1n && !isScalar(M)) {
            if (H.add(M, true)) used++;
            if (seeds.length < 160) seeds.push({ M, word });
        }
    }
    while (H.undefer()) { if (Date.now() > deadline) break; }
    {
        const st = H.stats();
        if (st.finite && !H.pendingHuge()) {
            return { ok: true, method: 'congruence-mitm', stabIndex: st.index, deltaIndex: D.deltaIndex, levels: D.levels, kernelIndex: R.reps.size, conjugated: R.conjugatedAt.length > 0, used, ms: Date.now() - t0 };
        }
    }

    const stillMissing = [];
    for (const M of missing) {
        if (Date.now() > deadline) { stillMissing.push(M); continue; }
        if (H.has(M)) continue;
        const w = meetInBall(M, B);
        if (acceptWord(w, M)) {
            while (H.undefer()) { if (Date.now() > deadline) break; }
            const st = H.stats();
            if (st.finite && !H.pendingHuge()) {
                return { ok: true, method: 'congruence-mitm', stabIndex: st.index, deltaIndex: D.deltaIndex, levels: D.levels, kernelIndex: R.reps.size, conjugated: R.conjugatedAt.length > 0, used, ms: Date.now() - t0 };
            }
        } else {
            stillMissing.push(M);
        }
    }

    // 3b. FlashBeam search on frameGens for remaining missing basis elements of Δ_o.
    if (stillMissing.length && Date.now() < deadline) {
        const batch = stillMissing.filter((M) => !H.has(M)).slice(0, 64);
        if (batch.length) {
            const found = beamWords(frameGens, batch, {
                seconds: remSec(),
                beamWidth: opts.beamWidth ?? 2500,
                flashSize: 60,
                seeds,
            });
            found.forEach((w, i) => acceptWord(w, batch[i]));
            while (H.undefer()) { if (Date.now() > deadline) break; }
            const st = H.stats();
            if (st.finite && !H.pendingHuge()) {
                return { ok: true, method: 'congruence-mitm', stabIndex: st.index, deltaIndex: D.deltaIndex, levels: D.levels, kernelIndex: R.reps.size, conjugated: R.conjugatedAt.length > 0, used, ms: Date.now() - t0 };
            }
        }
    }

    return { ok: false, reason: `found ${used} generators of Δ_o (index ${D.deltaIndex}), not yet finite index`, levels: D.levels, deltaIndex: D.deltaIndex, ms: Date.now() - t0 };
}
