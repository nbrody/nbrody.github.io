/**
 * adelic.js — Γ acting on the adelic product of symmetric spaces
 *
 *     X = ∏_{σ at ∞, Γ unbounded} H^{2 or 3}  ×  ∏_{𝔭 ∈ S} T_𝔭,
 *
 * with the ℓ² product metric (tree edges of length log q_𝔭, or 1), and its
 * Dirichlet generators, as in SO3DecisionAlgorithm/algorithm/geometry/flashbeam.py.
 *
 * Γ is discrete in the product of these groups (Γ⁽²⁾ lies in the S-arithmetic
 * group Λ), so a point o of X has a finite stabilizer and the Dirichlet domain
 *     D = { x ∈ X : d(x, o) ≤ d(x, γo) for all γ ∈ Γ }
 * is a fundamental domain up to that stabilizer. An element g is a Dirichlet
 * generator when the midpoint m of [o, g·o] has exactly two nearest orbit
 * points, o and g·o: the bisector of o and g·o then carries a facet of D
 * through m. Its clearance is d(m, next orbit point)² − d(m, o)².
 *
 * Only competitors η with d(o, ηo) < d(o, go) can come closer to m (if
 * d(m, ηo) < d(m, o) then d(o, ηo) < d(o, go)), so candidates are processed in
 * order of height. Everything is measured against the orbit points found by
 * the search: the generators reported are those of the partial domain cut
 * out by them, as in the SO₃ project.
 *
 * Distances. In a tree, with a = d(o, go), b = d(o, ηo), c = d(go, ηo),
 * 2·d(m, ηo) = 2·max(b, c) − a. In H^n, with the same letters,
 * cosh d(m, ηo) = (cosh b + cosh c) / (2 cosh(a/2)). Every distance is the
 * displacement of o by an exact product (d(go, ηo) = d(o, g⁻¹η·o)), so
 * nothing cancels in floating point. The point o_∞ is generic (a small
 * translate of j, kept in the real plane at a real embedding).
 */
import { normalizeM, mulM, adjM, detM } from './covering.js';

const LN2 = Math.LN2;
const babs = (x) => (x < 0n ? -x : x);
const bitlen = (x) => (x === 0n ? 0 : babs(x).toString(2).length);

const cx = (re, im = 0) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cabs2 = (a) => a.re * a.re + a.im * a.im;
const mm = (A, B) => [
    cadd(cmul(A[0], B[0]), cmul(A[1], B[2])), cadd(cmul(A[0], B[1]), cmul(A[1], B[3])),
    cadd(cmul(A[2], B[0]), cmul(A[3], B[2])), cadd(cmul(A[2], B[1]), cmul(A[3], B[3])),
];

/** log cosh x, stable for large |x|. */
const logcosh = (x) => { const a = Math.abs(x); return a + Math.log1p(Math.exp(-2 * a)) - LN2; };
/** arccosh(e^L) for L ≥ 0. */
const acoshExp = (L) => (L > 30 ? L + LN2 : Math.acosh(Math.max(1, Math.exp(L))));

/**
 * One place at ∞: the embedding σ: F → ℂ given by a root of F's defining
 * polynomial, and the base point o_∞ = B·j.
 *   emb: { re, im, kind: 'real' | 'complex' }
 */
export function makeArch(F, emb) {
    const n = F.n;
    const z = cx(emb.re, emb.im || 0);
    // σ of the basis of the maximal order: K-coordinates are powers of w
    const beta = [];
    for (let j = 0; j < n; j++) {
        const row = n === 1 ? F.toK({ v: [1n], den: 1n }) : F.M_OK[j];
        let acc = cx(0), pw = cx(1);
        for (let i = 0; i < row.length; i++) {
            const r = row[i];
            const c = Number(r.n) / Number(r.d);
            if (c) acc = cadd(acc, cx(c * pw.re, c * pw.im));
            pw = cmul(pw, z);
        }
        beta.push(acc);
    }
    // o_∞ = t0·j + z0: generic, and on the real plane when σ is real
    const real = emb.kind === 'real';
    const z0 = real ? cx(0.1234) : cx(0.1234, 0.0567), t0 = 1.0987, s = Math.sqrt(t0);
    const B = [cx(s), cx(z0.re / s, z0.im / s), cx(0), cx(1 / s)];
    const Bi = [cx(1 / s), cx(-z0.re / s, -z0.im / s), cx(0), cx(s)];

    /** σ(x)·2^(−shift) for integral coordinates x. */
    const sigma = (u, shift) => {
        let acc = cx(0);
        const sh = BigInt(shift);
        for (let j = 0; j < n; j++) {
            if (!u[j]) continue;
            const c = Number(shift ? u[j] >> sh : u[j]);
            acc = cadd(acc, cx(c * beta[j].re, c * beta[j].im));
        }
        return acc;
    };

    /** d(o_∞, g·o_∞) for a matrix of integral coordinates, using its exact determinant. */
    function disp(M, det) {
        let top = 0;
        for (const e of M) for (const t of e) { const b = bitlen(t); if (b > top) top = b; }
        const s = Math.max(0, top - 60);
        const g = mm(mm(Bi, M.map((e) => sigma(e, s))), B);
        const n2 = g.reduce((acc, x) => acc + cabs2(x), 0);
        let dtop = 0;
        for (const t of det) { const b = bitlen(t); if (b > dtop) dtop = b; }
        const sd = Math.max(0, dtop - 60);
        const dv = Math.sqrt(cabs2(sigma(det, sd)));
        // cosh d = ‖g‖² / (2|det g|)
        const logCosh = Math.log(n2) + 2 * s * LN2 - Math.log(dv) - sd * LN2 - LN2;
        if (!Number.isFinite(logCosh)) return NaN;
        return acoshExp(Math.max(0, logCosh));
    }
    return { kind: emb.kind, root: z, disp, beta };
}

/** All distances of g·o from o: { tree: [steps], arch: [d], h (ℓ² with weights) }. */
export function displacements(P, M) {
    const R = P.R;
    const det = detM(R, M);
    const tree = P.vals.map((v) => {
        let m = Infinity;
        for (const e of M) { if (!R.isZero(e)) { const t = v(e); if (t < m) m = t; } }
        return v(det) - 2 * m;
    });
    const arch = P.archs.map((A) => A.disp(M, det));
    let h2 = 0;
    tree.forEach((d, i) => { const x = P.weights[i] * d; h2 += x * x; });
    for (const d of arch) h2 += d * d;
    return { tree, arch, h: Math.sqrt(h2) };
}

/**
 * The Dirichlet generators among the elements the search found (P.lowPool,
 * closed under inverses), as in the SO₃ project's extract_dirichlet_generators.
 * Returns { active, tied, considered, duplicates }.
 */
export function dirichletGenerators(P, { limit = 220, tol = 1e-9 } = {}) {
    const R = P.R;
    // candidates: the pool and the inverses of its elements, by height
    const byKey = new Map();
    const add = (word, M) => {
        if (P.isIdentityM(M)) return;
        const key = M.map((e) => e.join(',')).join(';');
        const old = byKey.get(key);
        if (old && old.word.length <= word.length) return;
        byKey.set(key, { word, M, key });
    };
    for (const nd of P.lowPool) {
        add(nd.word, nd.state);
        add(nd.word.map((x) => -x).reverse(), normalizeM(adjM(R, nd.state)));
    }
    let cands = [...byKey.values()].map((c) => ({ ...c, ...displacements(P, c.M) }))
        .filter((c) => Number.isFinite(c.h) && c.h > tol);
    cands.sort((a, b) => a.h - b.h || a.word.length - b.word.length);
    cands = cands.slice(0, limit);

    const rel = (a, b) => displacements(P, normalizeM(mulM(R, normalizeM(adjM(R, a.M)), b.M)));
    // one candidate per orbit point (g, g' with g⁻¹g' fixing o have equal heights)
    const kept = [];
    let duplicates = 0;
    for (const c of cands) {
        let dup = false;
        for (let i = kept.length - 1; i >= 0 && kept[i].h > c.h - 1e-9; i--) {
            if (rel(kept[i], c).h < 1e-9) { dup = true; break; }
        }
        if (dup) duplicates++; else kept.push(c);
    }
    // clearances against the orbit points found
    const clearOf = new Map();
    for (const c of kept) {
        const quarter = (c.h * c.h) / 4;
        let best = Infinity, blocker = null;
        // competitors: every other orbit point no farther from o
        for (const e of kept) {
            if (e === c) continue;
            if (e.h > c.h + 1e-9) break;
            const r = rel(c, e);
            let s = 0;
            r.tree.forEach((cc, i) => {
                const twice = 2 * Math.max(e.tree[i], cc) - c.tree[i];
                const x = P.weights[i] * twice / 2;
                s += x * x;
            });
            r.arch.forEach((cc, i) => {
                const a = c.arch[i], b = e.arch[i];
                const L = Math.max(logcosh(b), logcosh(cc));
                const logNum = L + Math.log1p(Math.exp(Math.min(logcosh(b), logcosh(cc)) - L));
                const d = acoshExp(Math.max(0, logNum - LN2 - logcosh(a / 2)));
                s += d * d;
            });
            const clear = s - quarter;
            if (clear < best) { best = clear; blocker = e; }
        }
        clearOf.set(c.key, { best, blocker });
    }
    // g⁻¹ is a Dirichlet generator exactly when g is (g⁻¹ maps the configuration
    // of [o, g·o] to that of [g⁻¹·o, o]), so a blocker found for either rules out both
    const invKey = (c) => normalizeM(adjM(R, c.M)).map((e) => e.join(',')).join(';');
    const active = [], tied = [];
    for (const c of kept) {
        const own = clearOf.get(c.key), inv = clearOf.get(invKey(c));
        const best = inv ? Math.min(own.best, inv.best) : own.best;
        const blocker = inv && inv.best < own.best ? inv.blocker : own.blocker;
        const scale = Math.max(1, (c.h * c.h) / 4);
        const out = {
            word: c.word, h: c.h, tree: c.tree, arch: c.arch, key: c.key, inverseKey: invKey(c),
            clearance: best === Infinity ? null : best, blocker: blocker && best <= tol * scale ? blocker.word : null,
        };
        if (best > tol * scale) active.push(out);
        else if (best >= -tol * scale) tied.push(out);
    }
    // one row per pair {g, g⁻¹}
    const seen = new Set();
    const pairs = [];
    for (const g of active) {
        if (seen.has(g.key)) continue;
        seen.add(g.key); seen.add(g.inverseKey);
        pairs.push({ ...g, involution: g.key === g.inverseKey, withInverse: g.key !== g.inverseKey && active.some((x) => x.key === g.inverseKey) });
    }
    const points = kept.map((c) => ({ tree: c.tree, arch: c.arch, h: c.h }));
    const activeSet = new Set(active.map((g) => g.word.join(',')));
    points.forEach((pt, i) => { pt.active = activeSet.has(kept[i].word.join(',')); });
    return { active, pairs, tied, considered: kept.length, duplicates, points };
}

/** Free and cyclic reduction, then the least rotation of the word or its inverse. */
export function canonicalRelator(word) {
    let w = word.slice();
    // free reduction
    const st = [];
    for (const x of w) { if (st.length && st[st.length - 1] === -x) st.pop(); else st.push(x); }
    w = st;
    while (w.length > 1 && w[0] === -w[w.length - 1]) w = w.slice(1, -1);
    if (!w.length) return [];
    const inv = w.map((x) => -x).reverse();
    let best = null;
    for (const u of [w, inv]) {
        for (let i = 0; i < u.length; i++) {
            const r = u.slice(i).concat(u.slice(0, i));
            if (!best || lexLess(r, best)) best = r;
        }
    }
    return best;
}
function lexLess(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i];
    return a.length < b.length;
}
