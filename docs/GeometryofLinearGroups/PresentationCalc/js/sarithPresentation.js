/**
 * sarithPresentation.js — standard generators and presentations for S-arithmetic groups over ℚ.
 *
 * Λ = PGL₂(ℤ[1/S]). Standard generators: T = (1 1; 0 1), w = (0 −1; 1 0), J = diag(−1, 1) and
 * D_p = diag(p, 1) for p ∈ S (the units ±1, p of ℤ[1/S], a unipotent, and w). Λ's presentation is
 * the Bass–Serre one of sarithIndex.js on the reflections a = J, b = (0 1; 1 0), c = (−1 1; 0 1)
 * and the involutions w_p = (0 1; p 0); the two sets determine each other:
 *     T = c·a,  w = a·b,  J = a,  D_p = b·w_p     and     a = J,  b = J·w,  c = T·J,  w_p = J·w·D_p,
 * so substituting the second set into Λ's relators (and the squares of a, b, c, w_p) presents Λ on
 * T, w, J, D_p.
 *
 * Γ = ⟨g₁, …⟩ S-arithmetic. First Γ is brought into Λ (sarithIndex.js reduceToLambda): at a prime
 * ℓ ∉ S with even valuations it is conjugated to fix the standard vertex, and at primes with odd
 * valuations its subgroup K of even valuations (normal, with Γ/K = (ℤ/2)^r) is taken. The closed
 * coset table of K in Λ (coset enumeration, re-verified there) gives a presentation of K by
 * Reidemeister–Schreier. If K ≠ Γ, P. Hall's presentation of the extension adds the coset
 * representatives u₁ … u_r with the relators u_i k u_i⁻¹ = φ_i(k), u_i² ∈ K and [u_i, u_j] ∈ K, each
 * right-hand side written in K's generators by rewriting along the table. The given generators are
 * then added with their words as defining relators, and Tietze moves remove the Schreier generators
 * first, so the result is on the given generators whenever the moves allow.
 *
 * Every relator of the result is multiplied out and checked to be the identity, and every given
 * generator is checked to come out of its word; a failure is reported, never returned.
 */
import { presentationPGL2ZS, wordInPGL2ZS, reduceToLambda } from './sarithIndex.js';
import { enumerateInvolutions } from './modularIndex.js';
import { reidemeisterSchreier, tietze, abelianInvariants, findWords } from './presentation.js';
import { congruenceClosure, congruenceDescription, congruenceCosetAction, findLevels } from './congruence.js';
import { graphOfGroups, hallExtension, rationalAlgebra, wordsInGiven, eliminateByWords, restateFromGraph, stripTree, GRAPH_MAX_COSETS } from './graphOfGroups.js';
import { beamWords } from './wordSearch.js';
import { subgroupPresentation } from './felsch.js';

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const adj = (A) => [A[3], -A[1], -A[2], A[0]];
const prim = (A) => {
    const g = A.reduce((s, x) => bgcd(s, x), 0n);
    const B = g > 1n ? A.map((x) => x / g) : A.slice();
    // sign: the first nonzero entry positive (projective matrices)
    return (B.find((x) => x !== 0n) ?? 1n) < 0n ? B.map((x) => -x) : B;
};
const isScalar = (A) => A[1] === 0n && A[2] === 0n && A[0] === A[3];
const projEq = (A, B) => { for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (A[a] * B[b] !== A[b] * B[a]) return false; return true; };
const ONE = [1n, 0n, 0n, 1n];
const invWord = (w) => w.slice().reverse().map((x) => -x);
const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
const substAll = (w, expr) => freeReduce(w.flatMap((x) => (x > 0 ? expr(x) : invWord(expr(-x)))));

/** Λ = PGL₂(ℤ[1/S]): the standard generators T, w, J, D_p, and Λ's presentation on them. */
export function standardLambdaQ(S) {
    const primes = S.map(BigInt);
    const P = presentationPGL2ZS(primes);
    const std = [
        { name: 'T', M: [1n, 1n, 0n, 1n] },
        { name: 'w', M: [0n, -1n, 1n, 0n] },
        { name: 'J', M: [-1n, 0n, 0n, 1n] },
        ...primes.map((p) => ({ name: `D_${p}`, M: [p, 0n, 0n, 1n] })),
    ];
    // Coxeter letters in the standard generators (numbered 1 …): a = J, b = J·w, c = T·J, w_p = J·w·D_p
    const letter = [[3], [3, 2], [1, 3], ...primes.map((_, i) => [3, 2, 4 + i])];
    const relators = P.relators.concat(P.gens.map((_, x) => [x, x]))
        .map((r) => substAll(r.map((x) => x + 1), (x) => letter[x - 1]));
    const T = tietze(std.length, relators, { maxLen: 0 });             // only reduce and deduplicate
    const ev = (w) => w.reduce((A, x) => prim(mul(A, x > 0 ? std[x - 1].M : adj(std[-x - 1].M))), ONE);
    for (const r of T.relators) if (!isScalar(ev(r))) throw new Error('internal: a relator of Λ is not the identity');
    return { P, std, relators: T.relators, letter };
}

/**
 * A presentation of an S-arithmetic Γ = ⟨rows⟩ ⊂ PGL₂(ℚ) (rows: rational entry strings; S: the
 * primes where Γ is unbounded). Returns { gens: [{ M, name, given }] (matrices in Γ; given: the index
 * of the input generator it is, or null), relators (words in ±(k+1)), gamma: the input generators
 * as words in gens, index: [Λ : K], kernelIndex: [Γ : K], abelian: { rank, torsion }, S,
 * conjugatedAt, ms } or { error }.
 */
export function presentationOverQ(rows, S, opts = {}) {
    const { seconds = 10, maxCosets = 2000000, maxIndex = 20000, maxLen = 16, graphUpTo = 0 } = opts;
    const t0 = Date.now();
    const R = reduceToLambda(rows, S);
    if (!R) return { error: 'Γ could not be brought into PGL₂(ℤ[1/S]) (it is not bounded at the primes outside S)' };
    const Ci = adj(R.C);
    const inFrame = (M) => prim(mul(mul(Ci, M), R.C)), outFrame = (M) => prim(mul(mul(R.C, M), Ci));
    const P = presentationPGL2ZS(R.S);
    let words;
    try { words = R.kernelGens.map((M) => wordInPGL2ZS(M, P)); } catch (e) { return { error: e.message }; }
    // the coset table: by coset enumeration, or else from Γ's congruence description (levels)
    const inLambda = R.reps.size === 1 && !R.conjugatedAt.length && R.S.length;
    let r = enumerateInvolutions(P.gens.length, P.relators, words, { seconds: opts.levels && inLambda ? Math.min(seconds, 3) : seconds, maxCosets });
    let tableFrom = 'coset enumeration';
    if (!r.index && opts.levels && inLambda) {
        const A = congruenceCosetAction(rows, R.S.map(Number), opts.levels, P.gens, { maxCosets: maxIndex });
        if (A.error) return { error: `coset enumeration did not close (${r.limit || r.error}), and the congruence description gave no table (${A.error})` };
        const bad = checkTable(A.table, P.relators, words);
        if (bad) return { error: `the table from the congruence description fails: ${bad}` };
        r = A;
        tableFrom = 'congruence';
    }
    if (!r.index) return { error: `coset enumeration did not close (${r.limit || r.error})` };
    if (r.index > maxIndex) return { error: `[Λ : Γ] = ${r.index} is above the limit ${maxIndex} for a presentation`, index: r.index };

    // Γ/K: a basis u₁ … u_r of the parity classes, as matrices of Γ in the frame, in echelon form.
    // Reducing a class against earlier rows replaces its representative by M·u⁻¹ (and the word with it).
    // The parity stored on the row is then the parity of that matrix. Keeping the unreduced class
    // instead leaves a dependent row or a class the solve cannot express, for some orders of the
    // same generators (a product of the two Atkin–Lehner elements of Γ₀(15)⁺ over ℤ[1/2]).
    const basis = [];                                                    // { c, M, w } in echelon form
    const reduceRep = (c, M, w) => {
        let v = c.slice(), Mat = M, word = w.slice();
        for (const b of basis) if (v[b.pivot]) {
            v = v.map((x, t) => x ^ b.c[t]);
            Mat = prim(mul(Mat, adj(b.M)));
            word = freeReduce(word.concat(invWord(b.w)));
        }
        return { v, M: Mat, w: word };
    };
    for (const { c, M, w } of R.reps.values()) {
        const red = reduceRep(c, inFrame(M), w);
        const pivot = red.v.indexOf(1);
        if (pivot >= 0) basis.push({ c: red.v, M: red.M, w: red.w, pivot });
    }
    // c = Σ c_j·basis_j over 𝔽₂. The rows are echelon, so one downward pass expresses c.
    const solve = (c) => {
        let v = c.slice(); const used = [];
        for (let pass = 0; pass < basis.length && v.some((x) => x); pass++) {
            for (const [j, b] of basis.entries()) if (v[b.pivot] && !used.includes(j)) { v = v.map((x, t) => x ^ b.c[t]); used.push(j); }
        }
        if (v.some((x) => x)) throw new Error('internal: a parity class outside the span');
        return used.sort((a, b) => a - b);
    };
    const nu = basis.length;
    // M ∈ Γ (in the frame) as u_{j₁} ⋯ u_{j_t}·k with k ∈ K
    const split = (Mf) => {
        const js = solve(R.parity(Mf));
        const Uprod = js.reduce((A, j) => prim(mul(A, basis[j].M)), ONE);
        return { js, k: prim(mul(adj(Uprod), Mf)) };
    };

    // K by Reidemeister–Schreier: generator k (1 …) is s_k = t_i·x·t_{i·x}⁻¹
    const RS = reidemeisterSchreier({ nLetters: P.gens.length, inv: (x) => x, relators: P.relators, table: r.table });
    const wordM = (w) => w.reduce((A, x) => prim(mul(A, P.gens[x])), ONE);
    const sMat = RS.gens.map(({ i, x }) => prim(mul(mul(wordM(RS.transversal[i]), P.gens[x]), adj(wordM(RS.transversal[r.table[i][x]])))));
    const m = RS.gens.length;
    const kWord = (M) => RS.rewrite(wordInPGL2ZS(M, P));                // M ∈ K (in the frame) → word in 1 … m

    // the presentation on s₁ … s_m, u₁ … u_r, g₁ … g_n
    const n = R.mats.length;
    const uNum = (j) => m + 1 + j, gNum = (i) => m + nu + 1 + i;
    const rels = RS.relators.slice();
    const kInv = (M) => invWord(kWord(M));
    for (let j = 0; j < nu; j++) {
        const U = basis[j].M, Ui = adj(U);
        for (let k = 1; k <= m; k++) rels.push([uNum(j), k, -uNum(j)].concat(kInv(prim(mul(mul(U, sMat[k - 1]), Ui)))));
        rels.push([uNum(j), uNum(j)].concat(kInv(prim(mul(U, U)))));
        for (let l = j + 1; l < nu; l++) {
            const V = basis[l].M;
            rels.push([uNum(j), uNum(l), -uNum(j), -uNum(l)].concat(kInv(prim(mul(mul(mul(U, V), Ui), adj(V))))));
        }
    }
    // g_i = u_{j₁} ⋯ u_{j_t} · k
    const gWords = R.mats.map((G0) => {
        const { js, k } = split(inFrame(G0));
        return js.map(uNum).concat(kWord(k));
    });
    gWords.forEach((w, i) => rels.push([-gNum(i)].concat(w)));
    const total = m + nu + n;
    const mat = (k) => (k <= m ? sMat[k - 1] : k <= m + nu ? basis[k - m - 1].M : inFrame(R.mats[k - m - nu - 1]));
    const given = new Set(R.mats.map((_, i) => gNum(i)));
    const T1 = tietze(total, rels, { maxLen, prefer: given, keepPreferred: true, seconds: 3 });
    // the generators left besides the given ones, written in the given ones by a search over short
    // words; each word found is a relator h⁻¹·word that removes h
    const leftover = T1.keep.map((k, i) => ({ k, a: i + 1 })).filter(({ k }) => !given.has(k));
    const wordOps = { mul: (A, B) => prim(mul(A, B)), inv: adj, key: (M) => prim(M).join(','), one: ONE };
    const found = leftover.length ? findWords(R.mats.map(inFrame), leftover.map(({ k }) => mat(k)), wordOps, opts) : [];
    // the ones not found: FlashBeam (wordSearch.js), unless the graph of groups will give their words
    // (up to the index graphUpTo): they are Schreier generators, rarely near o, where the beam goes
    const notFound = leftover.map((_, j) => j).filter((j) => !found[j]);
    if (notFound.length && opts.longWords !== false && r.index > graphUpTo) {
        const more = beamWords(R.mats.map(inFrame), notFound.map((j) => mat(leftover[j].k)), { seconds: 3 });
        notFound.forEach((j, t) => { found[j] = more[t]; });
    }
    const gAt = new Map(T1.keep.map((k, i) => [k, i + 1]));
    const rels2 = T1.relators.slice();
    leftover.forEach(({ a }, j) => { if (found[j]) rels2.push([-a].concat(found[j].map((x) => Math.sign(x) * gAt.get(gNum(Math.abs(x) - 1))))); });
    // removing the others in favour of the given generators is worth some growth
    const T2 = tietze(T1.keep.length, rels2, { maxLen: Math.max(maxLen, 40), growth: 1.5, slack: 100, seconds: 2, prefer: new Set([...given].map((k) => gAt.get(k))) });
    const T = {
        keep: T2.keep.map((a) => T1.keep[a - 1]),
        relators: T2.relators,
        express: (k) => substAll(T1.express(k), (a) => T2.express(a)),
    };

    // the generators kept, named (the given ones keep their names, the others are h₁, h₂, …), every
    // relator checked, and the given generators as words in them
    const finish = (T) => {
        const gens = T.keep.map((k) => {
            const given = k > m + nu ? k - m - nu - 1 : null;
            return { M: given !== null ? R.mats[given] : outFrame(mat(k)), Mf: mat(k), given };
        });
        let extra = 0;
        for (const g of gens) g.name = g.given !== null ? `g${g.given + 1}` : `h${++extra}`;
        const ev = (w) => w.reduce((A, x) => prim(mul(A, x > 0 ? gens[x - 1].Mf : adj(gens[-x - 1].Mf))), ONE);
        for (const rel of T.relators) if (!isScalar(ev(rel))) throw new Error('internal: a relator is not the identity');
        const gamma = R.mats.map((G0, i) => {
            const v = T.express(gNum(i));
            if (!projEq(ev(v), inFrame(G0))) throw new Error('internal: a generator does not come out of its word');
            return v;
        });
        return {
            gens: gens.map(({ M, name, given }) => ({ M: M.map(String), name, given })), _gens: gens,
            relators: T.relators, gamma, onGiven: gens.every((g) => g.given !== null), abelian: abelianInvariants(gens.length, T.relators),
        };
    };
    let F;
    try { F = finish(T); } catch (e) { return { error: e.message }; }
    let kgens = F._gens;
    let Tcur = T;
    // an element of Γ (in the frame) as a word in the generators kept
    const wordInKept = (Mf) => {
        const { js, k } = split(Mf);
        return substAll(js.map(uNum).concat(kWord(k)), (x) => T.express(x));
    };
    const core = {
        P, table: r.table, C: R.C, inFrame, outFrame, mats: R.mats, kernelIndex: R.reps.size, us: basis.map((b) => ({ M: b.M, word: b.w })), split,
        kept: kgens.map((g) => ({ given: g.given, M: g.Mf })), wordInKept, gamma: F.gamma, keptRelators: T.relators,
        // the presentation again, with words in the given generators for the h's (graph of groups)
        restate: (words) => {
            const E = eliminateByWords(kgens.length, T.relators, kgens, F.gamma, words);
            if (!E) return null;
            // generators K+1 … are the given ones T dropped (E.dropped)
            const K = kgens.length, orig = (a) => (a <= K ? T.keep[a - 1] : gNum(E.dropped[a - K - 1]));
            const F3 = finish({
                keep: E.keep.map(orig), relators: E.relators,
                express: (k) => { const j = E.dropped.indexOf(k - (m + nu + 1)); return j >= 0 ? E.express(K + 1 + j) : substAll(T.express(k), E.express); },
            });
            delete F3._gens;
            return F3;
        },
    };
    // generators Tietze kept besides the given ones: their words from the labeled coset enumeration
    // (the modified Todd–Coxeter algorithm), exact, so that each can be removed
    if (!F.onGiven && tableFrom === 'coset enumeration' && opts.labeled !== false) {
        try {
            const wordInGiven = labeledRewriter(R, P, words, r.index, { basis, split }, { seconds });
            if (wordInGiven) {
                const Q = core.restate(kgens.map((g) => (g.given === null ? wordInGiven(g.Mf) : null)));
                if (Q) Object.assign(F, Q, { hFrom: 'labels' });
            }
        } catch (e) { /* keep the h's */ }
    }
    delete F._gens;
    return {
        _core: core,
        index: r.index, tableFrom, kernelIndex: R.reps.size, S: R.S.map(String), conjugatedAt: R.conjugatedAt,
        ...F,
        rs: { generators: m, relators: RS.relators.length },
        ms: Date.now() - t0,
    };
}

/**
 * Every element of Γ as a word in the given generators, from the labeled coset enumeration of
 * K = ⟨kernelGens⟩ in Λ (the modified Todd–Coxeter algorithm, felsch.js subgroupPresentation): an
 * element of K, read through the table in Λ's letters, comes out as a word in K's generators k_l, and
 * those have words κ_l in the given generators (reduceToLambda); an element of Γ is u_{j₁}⋯u_{j_t}·k
 * with the coset representatives u_j of Γ/K, which have words too. Exact, so no search is needed.
 * Returns wordInGiven(M in the frame), or null when the labeled enumeration does not close in time or
 * gives another index; wordInGiven throws when a word passes 20000 letters.
 */
function labeledRewriter(R, P, words, index, { basis, split }, { seconds = 10 } = {}) {
    const n = P.gens.length;
    // the involutions as letters with inverses: x ↦ 2x, and the relators x²
    const relF = P.relators.map((w) => w.map((x) => 2 * x)).concat(Array.from({ length: n }, (_, k) => [2 * k, 2 * k]));
    const SP = subgroupPresentation(n, relF, words.map((w) => w.map((x) => 2 * x)), { seconds, maxCosets: Math.max(50000, 8 * index), maxLength: 20000 });
    if (!SP.index || SP.index !== index) return null;
    const kappa = R.kernelWords;
    const ups = basis.map((b) => b.w);
    return (Mf) => {
        const { js, k } = split(Mf);
        const w = SP.rewrite(wordInPGL2ZS(k, P).map((x) => 2 * x));
        if (w === null) throw new Error('a word is too long');
        return freeReduce(js.flatMap((j) => ups[j]).concat(substAll(w, (l) => kappa[l - 1])));
    };
}

/**
 * A coset table of involutions (table[i][x]) as an action: every letter an involution, every relator
 * closed at every coset, every subgroup word closed at coset 0. Returns null, or what fails.
 */
function checkTable(table, relators, subgroupWords) {
    const n = table.length;
    for (let i = 0; i < n; i++) for (let x = 0; x < table[i].length; x++) if (table[table[i][x]][x] !== i) return `letter ${x} is not an involution on coset ${i}`;
    const walk = (i, w) => w.reduce((c, x) => table[c][x], i);
    for (let i = 0; i < n; i++) for (const rel of relators) if (walk(i, rel) !== i) return `a relator does not close at coset ${i}`;
    for (const w of subgroupWords) if (walk(0, w) !== 0) return 'a generator of Γ moves the coset Γ';
    return null;
}

/**
 * Everything the page and the database show for an S-arithmetic Γ over ℚ, serializable:
 * { S, lambda: { gens: [{ name, M }], relators } (Λ on its standard generators), pres (as
 * presentationOverQ, or { error }), cong (congruenceDescription, when Γ ⊂ Λ as written and its
 * index is the coset table's, so that Γ is exactly the congruence subgroup it describes) }.
 * levels: the closure's levels (congruenceClosure), or C: the engine's data to compute them.
 */
export function presentationReport(rows, S, { levels = null, C = null, maxIndex = 20000, seconds = 10, congSeconds = 20, graph = true, graphSeconds = 20, longWords = true } = {}) {
    const t0 = Date.now();
    const out = { S: S.map(String) };
    const L = standardLambdaQ(S);
    out.lambda = { gens: L.std.map((g) => ({ name: g.name, M: g.M.map(String) })), relators: L.relators };
    const graphUpTo = graph && S.length ? GRAPH_MAX_COSETS : 0;
    try { out.pres = presentationOverQ(rows, S, { maxIndex, seconds, levels, longWords, graphUpTo }); } catch (e) { out.pres = { error: e.message || String(e) }; }
    const P = out.pres;
    if (S.length && P.index && P.kernelIndex === 1 && !(P.conjugatedAt || []).length) {
        try {
            let lv = levels;
            if (!lv && C) { const J = congruenceClosure(rows, S.map(Number), C, { seconds: congSeconds }); lv = J.levels || null; }
            // no levels from the engine: search for them, up to the coset table's index
            if (!lv) lv = findLevels(rows, S, P.index, { seconds: congSeconds });
            const d = lv ? congruenceDescription(rows, S, lv) : null;
            if (d) out.cong = { ...d, agrees: d.index === P.index };
        } catch (e) { out.cong = { error: e.message || String(e) }; }
    }
    if (P && P._core) {
        if (graph && P.index && S.length) {
            try { out.graph = graphReport(P._core, { seconds: graphSeconds, longWords }); } catch (e) { out.graph = { error: e.message || String(e) }; }
            restateFromGraph(P, out.graph);
        }
        delete P._core;
    }
    out.ms = Date.now() - t0;
    return out;
}

/**
 * Γ as the fundamental group of its graph of groups on the tree of the last prime (graphOfGroups.js),
 * serializable: { prime, primes, tree, gens: [{ name, kind, M, word }], relators, given: the given
 * generators as words in gens, hall }. When Γ ⊄ Λ (kernelIndex > 1), the graph of groups is that of
 * K = Γ ∩ Λ (in the frame), and P. Hall's extension adds the coset representatives u_j (hall: { count,
 * kernelIndex }). Each generator gets a word in the given ones (graphOfGroups.js wordsInGiven): a short
 * one by search when there is one, else one through the presentation on the given generators; each
 * is multiplied out and checked.
 */
function graphReport(core, { seconds = 20, longWords = true } = {}) {
    const t0 = Date.now();
    const { P, table, C, inFrame, outFrame, mats, us } = core;
    const K = graphOfGroups(P, table, { seconds });
    const kNice = (M) => K.rewrite(wordInPGL2ZS(M, P));
    const G = us.length ? hallExtension(K, us, { alg: rationalAlgebra(P), kNice, split: core.split }) : { ...K, rewriteM: kNice };
    us.forEach((u, j) => { G.gens[K.gens.length + j].word = u.word; });
    const given = mats.map(inFrame);
    const ops = { mul: (A, B) => prim(mul(A, B)), inv: adj, key: (M) => prim(M).join(','), one: ONE, projEq };
    // the given generators in the new ones (the Bass–Serre rewriting, checked inside)
    const back = given.map((M) => G.rewriteM(M));
    // a word in the given generators for each new one, and for each h of the presentation on the given
    // generators; FlashBeam (wordSearch.js) for those a short search misses, seeded with those it finds
    const beam = longWords ? (gs, targets, seeds) => beamWords(gs, targets, { seconds: 4, seeds }) : null;
    const W = wordsInGiven(G, given, back, ops, { ...core, rewriteM: G.rewriteM, beam });
    const gens = G.gens.map((g, k) => ({ name: g.name, kind: g.kind, M: outFrame(g.M).map(String), word: W.gens[k] }));
    const hMat = (w) => prim(mul(C, G.evalWord(w))).map(String);           // G_v = Γ ∩ (C h)·Λ′·(C h)⁻¹
    const out = {
        prime: String(P.primes[P.primes.length - 1]), primes: P.primes.map(String), tree: stripTree(G.tree, hMat), gens, relators: G.relators, given: back,
        hall: us.length ? { count: us.length, kernelIndex: core.kernelIndex } : null, ms: Date.now() - t0,
    };
    Object.defineProperty(out, 'keptWords', { value: W.kept, enumerable: false });
    return out;
}

/** A word in ±(k+1) as text, with powers collected: g1 g2^-1 g1^3 … */
export function wordText(w, names, { tex = false } = {}) {
    if (!w.length) return '1';
    const out = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const e = (j - i) * Math.sign(w[i]), nm = names[Math.abs(w[i]) - 1];
        out.push(e === 1 ? nm : tex ? `${nm}^{${e}}` : `${nm}^${e}`);
        i = j;
    }
    return out.join(tex ? '\\,' : ' ');
}
