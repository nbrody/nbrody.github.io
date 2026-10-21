/**
 * bianchiPresentation.js — standard generators and presentations for S-arithmetic groups over
 * ℚ(√−1), ℚ(√−2), ℚ(√−3), the analogue of sarithPresentation.js over ℚ.
 *
 * Λ = PGL₂(O[1/S]), O = ℤ[w] Euclidean. Standard generators: w = (0 −1; 1 0), the unipotents
 * T = E₁₂(1), U = E₁₂(w), the units on the diagonal (L = diag(ε, ε⁻¹) when O has units other than
 * ±1, E = diag(η, 1) for a unit η that is not a square) and D_π = diag(π, 1) for π ∈ S. Λ's
 * presentation is the Bass–Serre one of bianchi.js on Poincaré's presentation of PGL₂(O) and the
 * involutions W_π = (0 1; π 0) = w·J·D_π (J = diag(−1, 1), a power of E), substituted.
 *
 * Γ ⊆ Λ of finite index: Reidemeister–Schreier on the closed coset table of the general coset
 * enumeration (letters with inverses), the given generators added with their words as defining
 * relators, Tietze moves that remove the Schreier generators first; every relator is multiplied out
 * over O and checked to be scalar. And Γ as the fundamental group of its graph of groups on the tree
 * T_{N(π)+1} of the last prime π (graphOfGroups.js), with vertex groups in PGL₂(O[1/S∖π]) down to
 * finite-index subgroups of PGL₂(O).
 */
import { RINGS, presentationPGL2OS, wordInPGL2OS, enumerateGeneral, primitiveO, primesOfDeterminants, primeText, ringOps } from './bianchi.js';
import { reidemeisterSchreier, tietze, abelianInvariants, findWords } from './presentation.js';
import { graphOfGroups, wordsInGiven, eliminateByWords, restateFromGraph, stripTree, GRAPH_MAX_COSETS } from './graphOfGroups.js';
import { flashWords, log2Big } from './wordSearch.js';

const { O, mm, adj, det, projEq, units, pglMats } = ringOps;
const invWord = (w) => w.slice().reverse().map((x) => -x);
const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
const substAll = (w, expr) => freeReduce(w.flatMap((x) => (x > 0 ? expr(x) : invWord(expr(-x)))));
const isScalar = (R, A) => R.isZero(A[1]) && R.isZero(A[2]) && R.eq(A[0], A[3]);
const elText = (x) => {
    const [a, b] = x.map(Number);
    if (!b) return String(a);
    const bw = b === 1 ? 'w' : b === -1 ? '−w' : `${b}w`;
    return a ? `${a}${b > 0 ? '+' : ''}${bw}`.replace('+−', '−') : bw;
};
const matText = (M) => M.map(elText);
/** the names of the letters of PGL₂(O) (bianchi.js pglMats): a, t, u, (l), e */
const baseNames = (nb) => (nb === 5 ? ['w', 'T', 'U', 'L', 'E'] : ['w', 'T', 'U', 'E']);
/** a key for M ∈ PGL₂(O): equal exactly for scalar multiples */
function keyOf(d) {
    const R = O(d), { all } = units(d);
    return (M) => { const P0 = primitiveO(R, M); let best = null; for (const u of all) { const k = P0.map((x) => R.mul(x, u).join(':')).join(','); if (best === null || k < best) best = k; } return best; };
}

/**
 * The ring for wordSearch.js flashWords over O: primitive matrices up to units, the height log₂ of
 * Σ N(entries) (the distance from o in H³ × ∏ T_π, up to a constant), fixing o in every tree when the
 * determinant is a unit.
 */
export function bianchiWordRing(d) {
    const R = O(d), { all } = units(d);
    // the key of a primitive matrix: its multiple by the unit that makes the first nonzero entry largest
    const key = (M) => {
        const x = M.find((e) => !R.isZero(e));
        let best = null;
        for (const u of all) { const y = R.mul(x, u); if (!best || y[0] > best.y[0] || (y[0] === best.y[0] && y[1] > best.y[1])) best = { y, u }; }
        return M.map((e) => R.mul(e, best.u).join(':')).join(',');
    };
    return {
        norm: (M) => primitiveO(R, M), one: [R.one, R.zero, R.zero, R.one],
        mul: (A, B) => primitiveO(R, mm(R, A, B)), inv: (A) => adj(R, A), key,
        isIdentity: (A) => isScalar(R, A),
        height: (M) => log2Big(M.reduce((t, x) => t + R.norm(x), 0n)),
        fixes: (M) => R.norm(det(R, M)) === 1n,
    };
}

/**
 * The letters of P = presentationPGL2OS for graphOfGroups.js: column 2k is generator k, 2k + 1 its
 * inverse; the matrices are over O, normalized by primitiveO.
 */
export function bianchiAlgebra(d, P) {
    const R = O(d);
    const nb = pglMats(d).length, names = baseNames(nb);
    return {
        inv: (x) => x ^ 1,
        letterM: (x) => (x & 1 ? adj(R, P.gens[x >> 1]) : P.gens[x >> 1]),
        mul: (A, B) => primitiveO(R, mm(R, A, B)), adj: (A) => adj(R, A),
        isScalar: (A) => isScalar(R, A), projEq: (A, B) => projEq(R, A, B),
        one: [R.one, R.zero, R.zero, R.one],
        letterName: (x) => (x & 1 || (x >> 1) >= nb ? null : names[x >> 1]),
    };
}

/** Λ = PGL₂(O[1/S]) on its standard generators, with its presentation. S: prime elements [a, b]. */
export function standardLambdaBianchi(d, S) {
    const R = O(d);
    const P = presentationPGL2OS(d, S);
    const base = pglMats(d);                         // a, t, u, (l), e
    const nb = base.length;
    const std = base.map((M, i) => ({ name: baseNames(nb)[i], M }))
        .concat(S.map((pi) => ({ name: `D_{${elText(pi)}}`, M: [pi, R.zero, R.zero, R.one] })));
    // J = diag(−1, 1): E itself, or E² over ℤ[i] (E = diag(i, 1))
    const E = nb, J = d === 1 ? [E, E] : [E];
    // P's letters 2k / 2k+1 (generator k and inverse) in the standard generators (numbered 1 …)
    const gen = (k) => (k < nb ? [k + 1] : [1].concat(J, [nb + 1 + (k - nb)]));      // W_π = w·J·D_π
    const relators = P.relators.map((r) => freeReduce(r.flatMap((x) => (x & 1 ? invWord(gen(x >> 1)) : gen(x >> 1)))));
    const T = tietze(std.length, relators, { maxLen: 0 });
    const ev = (w) => w.reduce((A, x) => primitiveO(R, mm(R, A, x > 0 ? std[x - 1].M : adj(R, std[-x - 1].M))), [R.one, R.zero, R.zero, R.one]);
    for (const r of T.relators) if (!isScalar(R, ev(r))) throw new Error('internal: a relator of Λ is not the identity');
    return { P, std, relators: T.relators };
}

/**
 * A presentation of Γ = ⟨mats⟩ ⊆ PGL₂(O[1/S]) (mats: entries [a, b] = a + b·w, BigInt; S the prime
 * elements dividing the determinants). Returns as sarithPresentation.js presentationOverQ, with
 * matrices as text, or { error }.
 */
export function presentationOverBianchi(d, mats, { seconds = 10, maxCosets = 2000000, maxIndex = 20000, maxLen = 16, longWords = true, graphUpTo = 0 } = {}) {
    const t0 = Date.now();
    const R = O(d);
    const prims = mats.map((A) => primitiveO(R, A));
    const S = primesOfDeterminants(d, prims);
    if (!S.length) return { error: 'every determinant is a unit: Γ lies in the Bianchi group PGL₂(O) (no S)' };
    let P, words;
    try {
        P = presentationPGL2OS(d, S);
        words = prims.map((A) => wordInPGL2OS(A, P));
    } catch (e) { return { error: e.message }; }
    const r = enumerateGeneral(P.gens.length, P.relators, words, { maxCosets, seconds });
    if (!r.index) return { error: `coset enumeration did not close (${r.limit || r.error})` };
    if (r.index > maxIndex) return { error: `[Λ : Γ] = ${r.index} is above the limit ${maxIndex} for a presentation`, index: r.index };
    const L = 2 * P.gens.length;
    const letterM = (x) => (x & 1 ? adj(R, P.gens[x >> 1]) : P.gens[x >> 1]);
    const RS = reidemeisterSchreier({ nLetters: L, inv: (x) => x ^ 1, relators: P.relators, table: r.table });
    const ONE = [R.one, R.zero, R.zero, R.one];
    const wordM = (w) => w.reduce((A, x) => primitiveO(R, mm(R, A, letterM(x))), ONE);
    const sMat = RS.gens.map(({ i, x }) => primitiveO(R, mm(R, mm(R, wordM(RS.transversal[i]), letterM(x)), adj(R, wordM(RS.transversal[r.table[i][x]])))));
    const m = RS.gens.length, n = prims.length;
    const gNum = (i) => m + 1 + i;
    const rels = RS.relators.slice();
    words.forEach((w, i) => rels.push([-gNum(i)].concat(RS.rewrite(w))));
    const given = new Set(prims.map((_, i) => gNum(i)));
    const T1 = tietze(m + n, rels, { maxLen, prefer: given, keepPreferred: true, seconds: 3 });
    // the generators left besides the given ones, written in the given ones (findWords, then FlashBeam
    // unless the graph of groups will give their words, up to the index graphUpTo): each word found
    // is a relator h⁻¹·word that removes h
    const leftover = T1.keep.map((k, i) => ({ k, a: i + 1 })).filter(({ k }) => !given.has(k));
    const lmat = (k) => (k <= m ? sMat[k - 1] : prims[k - m - 1]);
    const found = leftover.length ? findWords(prims, leftover.map(({ k }) => lmat(k)), { mul: (A, B) => primitiveO(R, mm(R, A, B)), inv: (A) => adj(R, A), key: keyOf(d), one: [R.one, R.zero, R.zero, R.one] }) : [];
    const notFound = leftover.map((_, j) => j).filter((j) => !found[j]);
    if (notFound.length && longWords && r.index > graphUpTo) {
        const more = flashWords(prims, notFound.map((j) => lmat(leftover[j].k)), bianchiWordRing(d), { seconds: 3, beamWidth: 600 });
        notFound.forEach((j, t) => { found[j] = more[t]; });
    }
    const gAt = new Map(T1.keep.map((k, i) => [k, i + 1]));
    const rels2 = T1.relators.slice();
    leftover.forEach(({ a }, j) => { if (found[j]) rels2.push([-a].concat(found[j].map((x) => Math.sign(x) * gAt.get(gNum(Math.abs(x) - 1))))); });
    const T2 = tietze(T1.keep.length, rels2, { maxLen: Math.max(maxLen, 40), growth: 1.5, slack: 100, seconds: 2, prefer: new Set([...given].map((k) => gAt.get(k))) });
    const T = { keep: T2.keep.map((a) => T1.keep[a - 1]), relators: T2.relators, express: (k) => substAll(T1.express(k), (a) => T2.express(a)) };
    // the generators kept, named, every relator checked, and the given generators as words in them
    const finish = (T) => {
        const gens = T.keep.map((k) => ({ M: lmat(k), given: k > m ? k - m - 1 : null }));
        let extra = 0;
        for (const g of gens) g.name = g.given !== null ? `g${g.given + 1}` : `h${++extra}`;
        const ev = (w) => w.reduce((A, x) => primitiveO(R, mm(R, A, x > 0 ? gens[x - 1].M : adj(R, gens[-x - 1].M))), ONE);
        for (const rel of T.relators) if (!isScalar(R, ev(rel))) throw new Error('internal: a relator is not the identity');
        const gamma = prims.map((G, i) => {
            const v = T.express(gNum(i));
            if (!projEq(R, ev(v), G)) throw new Error('internal: a generator does not come out of its word');
            return v;
        });
        return {
            gens: gens.map(({ M, name, given: gv }) => ({ M: matText(M), name, given: gv })), _gens: gens,
            relators: T.relators, gamma, onGiven: gens.every((g) => g.given !== null), abelian: abelianInvariants(gens.length, T.relators),
        };
    };
    let F;
    try { F = finish(T); } catch (e) { return { error: e.message }; }
    const kgens = F._gens;
    // an element of Γ as a word in the generators kept
    const wordInKept = (M) => substAll(RS.rewrite(wordInPGL2OS(M, P)), T.express);
    const core = {
        P, table: r.table, mats: prims, kept: kgens.map((g) => ({ given: g.given, M: g.M })), wordInKept, gamma: F.gamma, keptRelators: T.relators,
        // the presentation again, with words in the given generators for the h's (graph of groups)
        restate: (words) => {
            const E = eliminateByWords(kgens.length, T.relators, kgens, F.gamma, words);
            if (!E) return null;
            // generators K+1 … are the given ones T dropped (E.dropped)
            const K = kgens.length, orig = (a) => (a <= K ? T.keep[a - 1] : gNum(E.dropped[a - K - 1]));
            const F3 = finish({
                keep: E.keep.map(orig), relators: E.relators,
                express: (k) => { const j = E.dropped.indexOf(k - (m + 1)); return j >= 0 ? E.express(K + 1 + j) : substAll(T.express(k), E.express); },
            });
            delete F3._gens;
            return F3;
        },
    };
    delete F._gens;
    return {
        _core: core,
        ring: d, index: r.index, tableFrom: 'coset enumeration', kernelIndex: 1, S: S.map(primeText), conjugatedAt: [],
        ...F,
        rs: { generators: m, relators: RS.relators.length },
        ms: Date.now() - t0,
    };
}

/** The report for the page and the database (as sarithPresentation.js presentationReport). */
export function presentationReportBianchi(d, mats, opts = {}) {
    const t0 = Date.now();
    const { graph = true, graphSeconds = 20, longWords = true } = opts;
    const out = { ring: d, ringName: RINGS[d].name };
    try { out.pres = presentationOverBianchi(d, mats, { ...opts, graphUpTo: graph ? GRAPH_MAX_COSETS : 0 }); } catch (e) { out.pres = { error: e.message || String(e) }; }
    if (out.pres._core) {
        if (graph && out.pres.index) {
            try { out.graph = graphReportBianchi(d, out.pres._core, { seconds: graphSeconds, longWords }); } catch (e) { out.graph = { error: e.message || String(e) }; }
            restateFromGraph(out.pres, out.graph);
        }
        delete out.pres._core;
    }
    try {
        const R = O(d);
        const S = primesOfDeterminants(d, mats.map((A) => primitiveO(R, A)));
        out.S = S.map(primeText);
        const L = standardLambdaBianchi(d, S);
        out.lambda = { gens: L.std.map((g) => ({ name: g.name, M: matText(g.M) })), relators: L.relators };
    } catch (e) { out.lambda = { error: e.message || String(e) }; }
    out.ms = Date.now() - t0;
    return out;
}

/**
 * Γ ⊆ PGL₂(O[1/S]) as the fundamental group of its graph of groups on the tree of the last prime
 * (graphOfGroups.js on the letters of bianchiAlgebra), serializable as sarithPresentation.js
 * graphReport: { ring, prime, primes, tree, gens: [{ name, kind, M, word }], relators, given }. Each
 * generator gets a word in the given ones (graphOfGroups.js wordsInGiven), multiplied out and checked.
 */
function graphReportBianchi(d, core, { seconds = 20, longWords = true } = {}) {
    const t0 = Date.now();
    const { P, table, mats } = core;
    const alg = bianchiAlgebra(d, P);
    const G = graphOfGroups(P, table, { seconds, alg });
    const ops = { mul: alg.mul, inv: alg.adj, key: keyOf(d), one: alg.one, projEq: alg.projEq };
    // the given generators in the new ones (the Bass–Serre rewriting, checked inside)
    const rewriteM = (M) => G.rewrite(wordInPGL2OS(M, P));
    const back = mats.map(rewriteM);
    // words in the given generators: FlashBeam for those a short search misses, seeded with those it finds
    const ring = bianchiWordRing(d);
    const beam = longWords ? (gs, targets, seeds) => flashWords(gs, targets, ring, { seconds: 4, seeds, beamWidth: 600 }) : null;
    const W = wordsInGiven(G, mats, back, ops, { ...core, rewriteM, beam });
    const out = {
        ring: d, prime: primeText(P.primes[P.primes.length - 1]), primes: P.primes.map(primeText),
        tree: stripTree(G.tree, (w) => matText(G.evalWord(w))),
        gens: G.gens.map((g, k) => ({ name: g.name, kind: g.kind, M: matText(g.M), word: W.gens[k] })),
        relators: G.relators, given: back, hall: null, ms: Date.now() - t0,
    };
    Object.defineProperty(out, 'keptWords', { value: W.kept, enumerable: false });
    return out;
}
