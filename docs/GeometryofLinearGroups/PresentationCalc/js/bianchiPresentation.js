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
 * over O and checked to be scalar.
 */
import { RINGS, presentationPGL2OS, wordInPGL2OS, enumerateGeneral, primitiveO, primesOfDeterminants, primeText, ringOps } from './bianchi.js';
import { reidemeisterSchreier, tietze, abelianInvariants, findWords } from './presentation.js';

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

/** Λ = PGL₂(O[1/S]) on its standard generators, with its presentation. S: prime elements [a, b]. */
export function standardLambdaBianchi(d, S) {
    const R = O(d);
    const P = presentationPGL2OS(d, S);
    const base = pglMats(d);                         // a, t, u, (l), e
    const nb = base.length;
    const baseNames = nb === 5 ? ['w', 'T', 'U', 'L', 'E'] : ['w', 'T', 'U', 'E'];
    const std = base.map((M, i) => ({ name: baseNames[i], M }))
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
export function presentationOverBianchi(d, mats, { seconds = 10, maxCosets = 2000000, maxIndex = 20000, maxLen = 16 } = {}) {
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
    // the generators left besides the given ones, written in the given ones (findWords): each word
    // found is a relator h⁻¹·word that removes h
    const leftover = T1.keep.map((k, i) => ({ k, a: i + 1 })).filter(({ k }) => !given.has(k));
    const { all } = units(d);
    const keyO = (M) => { const P0 = primitiveO(R, M); let best = null; for (const u of all) { const k = P0.map((x) => R.mul(x, u).join(':')).join(','); if (best === null || k < best) best = k; } return best; };
    const found = leftover.length ? findWords(prims, leftover.map(({ k }) => (k <= m ? sMat[k - 1] : prims[k - m - 1])), { mul: (A, B) => primitiveO(R, mm(R, A, B)), inv: (A) => adj(R, A), key: keyO, one: [R.one, R.zero, R.zero, R.one] }) : [];
    const gAt = new Map(T1.keep.map((k, i) => [k, i + 1]));
    const rels2 = T1.relators.slice();
    leftover.forEach(({ a }, j) => { if (found[j]) rels2.push([-a].concat(found[j].map((x) => Math.sign(x) * gAt.get(gNum(Math.abs(x) - 1))))); });
    const T2 = tietze(T1.keep.length, rels2, { maxLen: Math.max(maxLen, 40), growth: 1.5, slack: 100, seconds: 2, prefer: new Set([...given].map((k) => gAt.get(k))) });
    const keep = T2.keep.map((a) => T1.keep[a - 1]);
    const express = (k) => substAll(T1.express(k), (a) => T2.express(a));
    const mat = (k) => (k <= m ? sMat[k - 1] : prims[k - m - 1]);
    const gens = keep.map((k) => ({ M: mat(k), given: k > m ? k - m - 1 : null }));
    let extra = 0;
    for (const g of gens) g.name = g.given !== null ? `g${g.given + 1}` : `h${++extra}`;
    const ev = (w) => w.reduce((A, x) => primitiveO(R, mm(R, A, x > 0 ? gens[x - 1].M : adj(R, gens[-x - 1].M))), ONE);
    for (const rel of T2.relators) if (!isScalar(R, ev(rel))) return { error: 'internal: a relator is not the identity' };
    const gamma = prims.map((G, i) => {
        const v = express(gNum(i));
        if (!projEq(R, ev(v), G)) throw new Error('internal: a generator does not come out of its word');
        return v;
    });
    return {
        ring: d, index: r.index, tableFrom: 'coset enumeration', kernelIndex: 1, S: S.map(primeText), conjugatedAt: [],
        gens: gens.map(({ M, name, given: gv }) => ({ M: matText(M), name, given: gv })),
        relators: T2.relators, gamma, onGiven: gens.every((g) => g.given !== null),
        rs: { generators: m, relators: RS.relators.length },
        abelian: abelianInvariants(gens.length, T2.relators),
        ms: Date.now() - t0,
    };
}

/** The report for the page and the database (as sarithPresentation.js presentationReport). */
export function presentationReportBianchi(d, mats, opts = {}) {
    const t0 = Date.now();
    const out = { ring: d, ringName: RINGS[d].name };
    try { out.pres = presentationOverBianchi(d, mats, opts); } catch (e) { out.pres = { error: e.message || String(e) }; }
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
