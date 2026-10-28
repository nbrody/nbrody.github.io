/**
 * numberRingPresentation.js — a presentation of Γ = ⟨g₁ … g_n⟩ ⊂ PGL₂(k) on its given generators, when Γ
 * is bounded at every prime and has finite index in (a conjugate of) Λ = PGL₂(O_k): the analogue of
 * sarithPresentation.js, with Λ's presentation from Voronoi's algorithm (numberRingIndex.js
 * ringPresentation, from Arithmetic/Tools/numberRingGroups).
 *
 *  1. Γ is brought into Λ (numberRingIndex.js conjugateIntoGL2O): conjugated by one g into GL₂(O_k), and
 *     where some determinant has odd valuation at a prime, its subgroup K of even valuations is taken
 *     (normal, with Γ/K ⊂ (ℤ/2)^r, the parities of the valuations).
 *  2. The labeled coset enumeration of K in Λ (felsch.js, the modified Todd–Coxeter algorithm), and
 *     Reidemeister–Schreier on its table: K on its Schreier generators.
 *  3. P. Hall's extension adds coset representatives u_j of K, with their squares, commutators and action on
 *     the Schreier generators written in K; the given generators come in with their words; Tietze moves
 *     remove the Schreier generators in favour of the given ones. The ones they cannot remove are written in
 *     the given generators exactly, by reading them through the labeled table, and removed with those words.
 *
 * Every relator is multiplied out over k and checked to be scalar, and every given generator is checked to
 * come out of its word. Returns presentationOverQ's record (matrices as TeX), or { error }.
 */
import { ringPresentation, wordMatricesK, intoGL2O, conjugateIntoGL2O, kMat, scaleDown } from './numberRingIndex.js';
import { wordFor, evalWord } from '../../Arithmetic/Tools/numberRingGroups/js/brown.js';
import { reidemeisterSchreier, tietze, abelianInvariants, powerReduce, findWords } from './presentation.js';
import { eliminateByWords } from './graphOfGroups.js';
import { enumerateFelsch, enumerateFelschAugmented } from './felsch.js';

const invWord = (w) => w.slice().reverse().map((x) => -x);
const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
const substAll = (w, expr) => freeReduce(w.flatMap((x) => (x > 0 ? expr(x) : invWord(expr(-x)))));
const MAX_WORD = 20000;

/**
 * opts: { seconds, maxCosets, maxIndex, maxLen, presentation (ringPresentation's record), presentationSeconds,
 * mats: the generators as matrices over k (instead of genSrc, entries { v, d }) }.
 */
export function presentationInPGL2O(polySrc, genSrc, opts = {}) {
    const { seconds = 20, maxCosets = 1500000, maxIndex = 20000, maxLen = 20, tietzeSeconds = 6, presentationSeconds = 120, maxWalk = 60000 } = opts;
    const t0 = Date.now();
    const L = opts.presentation || ringPresentation(polySrc, { seconds: presentationSeconds });
    if (L.error) return { error: `the presentation of PGL₂(O_k): ${L.error}` };
    const { nf, space, cx, P, GL, PGL, relators, orders, nGens } = L;
    const K = kMat(nf);
    const one = { v: nf.one(), d: 1n }, zero = { v: nf.zero(), d: 1n };
    const ONE = [[one, zero], [zero, one]];
    const kInv = (a) => { const i = nf.inv(a.v); return { v: nf.scale(i.v, a.d), d: i.d }; };
    // matrices up to scalars, divided by their first nonzero entry
    const normal = (M) => {
        const flat = [M[0][0], M[0][1], M[1][0], M[1][1]];
        const f = flat.find((e) => !nf.isZero(e.v));
        const fi = kInv(f);
        const n2 = flat.map((e) => nf.kmul(e, fi));
        return [[n2[0], n2[1]], [n2[2], n2[3]]];
    };
    const mul = (X, Y) => normal(K.mul(X, Y)), adj = (X) => normal(K.adj(X));
    const keyOf = (X) => normal(X).flat().map((e) => `${e.v.join(',')}/${e.d}`).join(';');
    const isOne = (X) => keyOf(X) === keyOf(ONE);
    const projEq = (A, B) => keyOf(A) === keyOf(B);
    const toK = (Mint) => Mint.map((row) => row.map((v) => ({ v, d: 1n })));
    const entTex = (e) => (e.d === 1n ? nf.tex(e.v) : `\\frac{${nf.tex(e.v)}}{${e.d}}`);
    // for display: a representative in GL₂(O_k) when there is one, else entries without a common denominator
    const matTex = (M) => { const I = intoGL2O(nf, M); return I ? I.flat().map((v) => nf.tex(v)) : scaleDown(nf, M).flat().map(entTex); };

    // the given generators, and Γ in Λ: directly, or conjugated by g (with K, the even subgroup)
    let gens;
    try { gens = opts.mats || wordMatricesK(nf, genSrc, genSrc.map((_, i) => [i + 1])); } catch (e) { return { error: `reading the matrices: ${e.message}` }; }
    const n = gens.length;
    const direct = gens.map((M) => intoGL2O(nf, M));
    let conj = null, g = null, gInv = null;
    let kGens = direct, kWords = gens.map((_, i) => [i + 1]), evenIndex = 1, reps = null, parity = null;
    if (!direct.every(Boolean)) {
        try { conj = conjugateIntoGL2O(nf, gens); } catch (e) { conj = null; }
        if (!conj) return { error: 'Γ could not be brought into PGL₂(O_k): no stable lattice was found, or an ideal without a generator was met' };
        ({ mats: kGens, words: kWords, evenIndex, reps, parity } = conj);
        g = conj.g; gInv = K.adj(g);
    }
    const inFrame = (M) => (g ? mul(mul(gInv, M), g) : normal(M));
    const outFrame = (M) => (g ? mul(mul(g, M), gInv) : normal(M));

    // words in Λ (letters ±(i+1) of its presentation), checked; the enumeration's letters are 2i, 2i + 1
    let seed = 2024;
    const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const subst = (w, ex) => freeReduce([].concat(...w.map((x) => (x > 0 ? ex(x) : invWord(ex(-x))))));
    const lambdaWord = (Mint) => {
        const raw = wordFor(cx, P, Mint, { rng, maxSteps: maxWalk });
        const w = powerReduce(subst(subst(raw, GL.express), PGL.express), orders, false);
        const h = space.matMul(evalWord(space, PGL.gens, w), space.matInv(Mint));
        if (!(nf.isZero(h[0][1]) && nf.isZero(h[1][0]) && nf.eq(h[0][0], h[1][1]))) throw new Error('internal: a word in PGL₂(O_k) does not evaluate to its matrix');
        return w.map((x) => (x > 0 ? 2 * (x - 1) : 2 * (-x - 1) + 1));
    };
    const intoO = (Mk) => {
        const M = intoGL2O(nf, Mk);
        if (!M) throw new Error('internal: an element of K is not in PGL₂(O_k)');
        return M;
    };
    let subWords;
    try { subWords = kGens.map(lambdaWord); } catch (e) { return { error: `words in PGL₂(O_k): ${e.message}` }; }

    // the coset enumeration of K in Λ; with labels only when the h's need words (it is slower)
    const E = enumerateFelsch(nGens, relators, subWords, { seconds, maxCosets });
    if (!E.index) return { error: `coset enumeration did not close (${E.limit || 'no answer'})` };
    if (E.index > maxIndex) return { error: `[PGL₂(O_k) : K] = ${E.index} is above the limit ${maxIndex} for a presentation`, index: E.index };
    let labeled = null;
    // an element of K (in the frame) in K's generators, through the labels
    const labelWord = (Mk) => {
        if (!labeled) {
            labeled = enumerateFelschAugmented(nGens, relators, subWords, { seconds, maxCosets, maxNodes: 40000000 });
            if (labeled.index !== E.index) throw new Error(`the labeled enumeration did not close (${labeled.limit || labeled.index})`);
        }
        const { word, end } = labeled.traceWord(0, lambdaWord(intoO(Mk)), MAX_WORD);
        if (word === null) throw new Error('a word is too long');
        if (end !== 0) throw new Error('internal: an element of K moves the coset K');
        return word;
    };

    // Reidemeister–Schreier: generator k (1 …) is s_k = t_i·x·t_{i·x}⁻¹
    const RS = reidemeisterSchreier({ nLetters: 2 * nGens, inv: (x) => x ^ 1, relators, table: E.table });
    const letterM = (x) => (x & 1 ? adj(toK(PGL.gens[x >> 1].mat)) : normal(toK(PGL.gens[x >> 1].mat)));
    const wordM = (w) => w.reduce((A, x) => mul(A, letterM(x)), ONE);
    const sMat = RS.gens.map(({ i, x }) => mul(mul(wordM(RS.transversal[i]), letterM(x)), adj(wordM(RS.transversal[E.table[i][x]]))));
    const m = RS.gens.length;
    const kWord = (Mk) => RS.rewrite(lambdaWord(intoO(Mk)));                 // M ∈ K (in the frame) → word in 1 … m

    // Γ/K: a basis u₁ … u_r of the parity classes, as matrices of Γ in the frame, with their words
    const basis = [];
    if (reps) {
        const reduceC = (c) => { let v = c.slice(); for (const b of basis) if (v[b.pivot]) v = v.map((x, t) => x ^ b.c[t]); return v; };
        for (const r of reps) {
            const v = reduceC(r.v), pivot = v.indexOf(1);
            if (pivot >= 0) basis.push({ c: r.v, M: inFrame(r.t), w: r.w, pivot });
        }
    }
    const solve = (c) => {
        let v = c.slice(); const used = [];
        for (let pass = 0; pass < basis.length && v.some((x) => x); pass++) {
            for (const [j, b] of basis.entries()) if (v[b.pivot] && !used.includes(j)) { v = v.map((x, t) => x ^ b.c[t]); used.push(j); }
        }
        if (v.some((x) => x)) throw new Error('internal: a parity class outside the span');
        return used.sort((a, b) => a - b);
    };
    // M ∈ Γ (in the frame) as u_{j₁} ⋯ u_{j_t} · k with k ∈ K
    const split = (Mf) => {
        if (!basis.length) return { js: [], k: Mf };
        const js = solve(parity(Mf));
        const U = js.reduce((A, j) => mul(A, basis[j].M), ONE);
        return { js, k: mul(adj(U), Mf) };
    };

    // the presentation on s₁ … s_m, u₁ … u_r, g₁ … g_n
    const nu = basis.length;
    const uNum = (j) => m + 1 + j, gNum = (i) => m + nu + 1 + i;
    const rels = RS.relators.slice();
    try {
        basis.forEach(({ M: U }, j) => {
            const Ui = adj(U);
            for (let s = 1; s <= m; s++) rels.push([uNum(j), s, -uNum(j)].concat(invWord(kWord(mul(mul(U, sMat[s - 1]), Ui)))));
            rels.push([uNum(j), uNum(j)].concat(invWord(kWord(mul(U, U)))));
            for (let l = j + 1; l < nu; l++) {
                const V = basis[l].M;
                rels.push([uNum(j), uNum(l), -uNum(j), -uNum(l)].concat(invWord(kWord(mul(mul(mul(U, V), Ui), adj(V))))));
            }
        });
        gens.forEach((G0, i) => {
            const { js, k } = split(inFrame(G0));
            rels.push([-gNum(i)].concat(js.map(uNum), kWord(k)));
        });
    } catch (e) { return { error: e.message }; }
    const total = m + nu + n;
    const mat = (k) => (k <= m ? sMat[k - 1] : k <= m + nu ? basis[k - m - 1].M : inFrame(gens[k - m - nu - 1]));
    const given = new Set(gens.map((_, i) => gNum(i)));
    const T = tietze(total, rels, { maxLen, prefer: given, keepPreferred: true, seconds: tietzeSeconds });

    // the generators kept, named (the given ones keep their names, the others are h₁, h₂, …), every
    // relator checked, and the given generators as words in them
    const finish = (T) => {
        const kept = T.keep.map((k) => ({ Mf: mat(k), given: k > m + nu ? k - m - nu - 1 : null }));
        let extra = 0;
        for (const x of kept) x.name = x.given !== null ? `g${x.given + 1}` : `h${++extra}`;
        const ev = (w) => w.reduce((A, x) => mul(A, x > 0 ? kept[x - 1].Mf : adj(kept[-x - 1].Mf)), ONE);
        for (const rel of T.relators) if (!isOne(ev(rel))) throw new Error('internal: a relator is not the identity');
        const gamma = gens.map((G0, i) => {
            const v = T.express(gNum(i));
            if (!projEq(ev(v), inFrame(G0))) throw new Error('internal: a generator does not come out of its word');
            return v;
        });
        return {
            gens: kept.map((x) => ({ M: x.given !== null ? matTex(gens[x.given]) : matTex(outFrame(x.Mf)), name: x.name, given: x.given })), _kept: kept,
            relators: T.relators, gamma, onGiven: kept.every((x) => x.given !== null), abelian: abelianInvariants(kept.length, T.relators),
        };
    };
    let F;
    try { F = finish(T); } catch (e) { return { error: e.message }; }
    let hFrom = null;
    // the generators Tietze kept besides the given ones, written in the given ones: a short word by a search
    // when there is one, else exactly through the labels of the coset enumeration
    if (!F.onGiven) {
        try {
            const wordInGiven = (Mf) => {
                const { js, k } = split(Mf);
                return freeReduce(js.flatMap((j) => basis[j].w).concat(substAll(labelWord(k), (l) => kWords[l - 1])));
            };
            const kept = F._kept;
            const hs = kept.map((x, a) => a).filter((a) => kept[a].given === null);
            const short = findWords(gens.map(inFrame), hs.map((a) => kept[a].Mf), { mul, inv: adj, key: keyOf, one: ONE }, { wordElements: 30000, wordSeconds: 1 });
            // each h: the shorter of the search's word and the labels' (which always exists, but may be long)
            const words = kept.map(() => null);
            let fromLabels = false;
            hs.forEach((a, j) => {
                let lab = null;
                try { lab = wordInGiven(kept[a].Mf); } catch (e) { if (!short[j]) throw e; }
                if (lab && (!short[j] || lab.length < short[j].length)) { words[a] = lab; fromLabels = true; }
                else words[a] = short[j];
            });
            // (null when the relators would grow past their limit: then the h's stay)
            const El = eliminateByWords(kept.length, T.relators, kept, F.gamma, words);
            if (El) {
                const Kn = kept.length, orig = (a) => (a <= Kn ? T.keep[a - 1] : gNum(El.dropped[a - Kn - 1]));
                F = finish({
                    keep: El.keep.map(orig), relators: El.relators,
                    express: (k) => { const j = El.dropped.indexOf(k - (m + nu + 1)); return j >= 0 ? El.express(Kn + 1 + j) : substAll(T.express(k), El.express); },
                });
                if (fromLabels) hFrom = 'labels';
            }
        } catch (e) { /* a word too long: the h's stay */ }
    }
    delete F._kept;
    return {
        index: E.index, tableFrom: 'coset enumeration', kernelIndex: evenIndex, conjugated: !!(conj && !conj.trivial), conjugatedAt: [],
        ...F, ...(hFrom ? { hFrom } : {}),
        rs: { generators: m, relators: RS.relators.length },
        ms: Date.now() - t0,
    };
}

/**
 * Everything the page shows, serializable: { kind: 'numberRing', lambda: { gens: [{ name, M (TeX) }],
 * relators } (Λ = PGL₂(O_k) on the generators of its presentation from Voronoi's algorithm), pres, ms }.
 */
export function presentationReportNumberRing(polySrc, genSrc, opts = {}) {
    const t0 = Date.now();
    const L = opts.presentation || ringPresentation(polySrc, { seconds: opts.presentationSeconds ?? 120 });
    const out = { kind: 'numberRing' };
    if (L.error) { out.pres = { error: `the presentation of PGL₂(O_k): ${L.error}` }; return out; }
    const { nf, PGL } = L;
    out.lambda = {
        gens: PGL.gens.map((p, i) => ({ name: `p${i + 1}`, M: p.mat.flat().map((v) => nf.tex(v)) })),
        relators: PGL.relators,
        cells: L.cells,
    };
    try { out.pres = presentationInPGL2O(polySrc, genSrc, { ...opts, presentation: L }); } catch (e) { out.pres = { error: e.message || String(e) }; }
    out.ms = Date.now() - t0;
    return out;
}
