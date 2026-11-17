/**
 * quaternionPresentation.js — a presentation of Γ on its given generators when step 3 found [Λ : Γ] by coset
 * enumeration in Λ = N(𝒪[1/S])/k^× (quaternionIndex.js): A totally definite, or split at exactly one place
 * at ∞ (Fuchsian or Kleinian vertex stabilizers, e.g. PGL₂(𝒪_k[1/𝔭]) for any class-number-one k).
 *
 *  1. Λ's presentation from its action on the trees at S, and the generators of K as words in it, exactly as
 *     step 3 built them (K = Γ, or its elements with even valuations at the split primes outside S).
 *  2. K on its own generators, in one of two ways:
 *     · the modified Todd–Coxeter algorithm (felsch.js subgroupPresentation): every relator of Λ read around
 *       every coset through the labels is a word in K's generators. Exact and direct, but the labels can
 *       expand to very long words, so it is used only when they stay short (a small index, typically);
 *     · otherwise Reidemeister–Schreier on the coset table: K on its Schreier generators, with short relators.
 *  3. When K ≠ Γ, P. Hall's extension adds a basis u_j of the parity classes Γ/K ⊂ (ℤ/2)^r with their squares,
 *     commutators and action on K's generators, all written in K; and each given generator is u_{j₁}⋯u_{j_t}·k.
 *  4. On the given generators: in the first way, K's generators and the u_j are words in the given generators
 *     (quaternionIndex.js tracks them) and are substituted away. In the second, Tietze moves remove the
 *     Schreier generators in favour of the given ones; those left are written in the given ones by a short
 *     search or through the labels, and removed with those words (graphOfGroups.js eliminateByWords).
 *  5. Tietze moves shorten the relators, and Knuth–Bendix completion (rewriting.js) drops those that follow
 *     from the others.
 *
 * Every relator is multiplied out in A and checked to be a scalar, and every given generator is checked to
 * come out of its word. Returns sarithPresentation.js's record ({ index, kernelIndex, gens, relators, gamma,
 * onGiven, abelian, ... }; a generator kept besides the given ones has its matrix over F as TeX), or { error }.
 */
import { definiteIndex } from './quaternionIndex.js';
import { enumerateFelsch, enumerateFelschAugmented, subgroupPresentation } from './felsch.js';
import { reidemeisterSchreier, tietze, abelianInvariants, findWords } from './presentation.js';
import { eliminateByWords } from './graphOfGroups.js';
import { pruneRelators } from './rewriting.js';

const invWord = (w) => w.slice().reverse().map((x) => -x);
const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
const substAll = (w, expr) => freeReduce(w.flatMap((x) => (x > 0 ? expr(x) : invWord(expr(-x)))));

/**
 * rows: the generators as ringEngine text in w; poly: of w (BigInt, low → high); S: step 1's primes;
 * opts: definiteIndex's (field, ram, …), plus { seconds, maxIndex, maxLen, tietzeSeconds, tracedLength, labelLength, pruneWork }.
 */
export function quaternionPresentation(rows, poly, S, opts = {}) {
    // tracedLength: the longest relator read through the labels for the first way (beyond it, the second);
    // labelLength: the longest word through the labels for a generator left in the second
    // maxSize: index × relators of Λ, the relators Reidemeister–Schreier would start from (beyond it, minutes)
    const { seconds = 20, maxIndex = 20000, maxSize = 20000, maxLen = 24, tietzeSeconds = 4, tracedLength = 400, labelLength = 20000, pruneWork = 3e7, precomputed = null } = opts;
    const t0 = Date.now();
    const r = (precomputed && precomputed.debug) ? precomputed : definiteIndex(rows, poly, S, { ...opts, levelPrimes: [], debug: true, seconds: Math.min(seconds, 10) });
    if (!r) return { error: 'the coset enumeration in Λ does not apply' };
    if (!r.index) return { error: `coset enumeration in Λ did not close (${r.error || r.limit || 'no answer'})` };
    if (r.index > maxIndex) return { error: `[Λ : ${r.kernelIndex > 1 ? 'K' : 'Γ'}] = ${r.index} is above the limit ${maxIndex} for a presentation`, index: r.index };
    const { rels, words, nGens, QA, QD, wordOf, elOf, kGivenWords, parityReps, parityOf, given } = r.debug;
    if (r.index * rels.length > maxSize) return { error: `[Λ : ${r.kernelIndex > 1 ? 'K' : 'Γ'}] = ${r.index} and Λ has ${rels.length} relators, so Reidemeister–Schreier would start from ${(r.index * rels.length).toLocaleString('en-US')} relators, above the limit ${maxSize.toLocaleString('en-US')} here`, index: r.index };
    const one = QA.one(), ONEKEY = QA.key(one);
    const mul = (a, b) => QA.prim(QA.mul(a, b)), inv = (a) => QA.prim(QA.conj(a)), key = (a) => QA.key(QA.prim(a));
    const ops = { mul, inv, key, one };
    const n = given.length;
    const evGiven = (w) => w.reduce((A, x) => mul(A, x > 0 ? given[x - 1] : inv(given[-x - 1])), one);

    // Γ/K: a basis u_j of the parity classes, as elements with words in the given generators
    const basis = [];
    if (parityReps) {
        const reduceC = (c) => { let v = c.slice(); for (const b of basis) if (v[b.pivot]) v = v.map((x, t) => x ^ b.c[t]); return v; };
        for (const p of parityReps) {
            const v = reduceC(p.c), pivot = v.indexOf(1);
            if (pivot >= 0) basis.push({ c: v, x: p.x, w: p.w, pivot });
        }
    }
    // x ∈ Γ as u_{j₁} ⋯ u_{j_t} · k, k ∈ K
    const split = (x) => {
        if (!basis.length) return { js: [], k: x };
        let v = parityOf(x).slice();
        const js = [];
        for (const [j, b] of basis.entries()) if (v[b.pivot]) { v = v.map((y, t) => y ^ b.c[t]); js.push(j); }
        if (v.some(Boolean)) throw new Error('internal: a parity class outside the span');
        const U = js.reduce((A, j) => mul(A, basis[j].x), one);
        return { js, k: mul(inv(U), x) };
    };
    // Hall's relators for generators s₁ … s_m of K (elements sEl; kWord: an element of K → a word in them),
    // with u_j numbered uNum(j) and g_i numbered gNum(i)
    const hallRelators = (sEl, kWord, uNum, gNum) => {
        const out = [];
        basis.forEach(({ x: U }, j) => {
            const Ui = inv(U);
            sEl.forEach((y, l) => out.push([uNum(j), l + 1, -uNum(j)].concat(invWord(kWord(mul(mul(U, y), Ui))))));
            out.push([uNum(j), uNum(j)].concat(invWord(kWord(mul(U, U)))));
            for (let l = j + 1; l < basis.length; l++) {
                const V = basis[l].x;
                out.push([uNum(j), uNum(l), -uNum(j), -uNum(l)].concat(invWord(kWord(mul(mul(mul(U, V), Ui), inv(V))))));
            }
        });
        given.forEach((g, i) => {
            const { js, k } = split(g);
            out.push([-gNum(i)].concat(js.map(uNum), kWord(k)));
        });
        return out;
    };

    let pres = null, route = null, hFrom = null;
    try {
        // ── the labels: relators straight in the given generators, when they stay short ──
        const SP = subgroupPresentation(nGens, rels, words, { seconds, maxCosets: Math.max(50000, 8 * r.index), maxLength: tracedLength });
        if (SP.index && SP.index !== r.index) return { error: `the labeled coset enumeration gave index ${SP.index}, not ${r.index}`, index: r.index };
        if (SP.relators) {
            const kWord = (x) => { const w = SP.rewrite(wordOf(x)); if (w === null || w.length > tracedLength) throw new Error('a word is too long'); return w; };
            const m = kGivenWords.length, nu = basis.length;
            const uNum = (j) => m + 1 + j, gNum = (i) => m + nu + 1 + i;
            const kEls = kGivenWords.map(evGiven);
            const sub = (x) => (x <= m ? kGivenWords[x - 1] : x <= m + nu ? basis[x - m - 1].w : [x - m - nu]);
            const all = SP.relators.concat(hallRelators(kEls, kWord, uNum, gNum)).map((w) => substAll(w, sub)).filter((w) => w.length);
            const T = tietze(n, all, { maxLen, prefer: new Set(given.map((_, i) => i + 1)), keepPreferred: true, seconds: tietzeSeconds });
            if (T.keep.length === n && T.keep.every((k, i) => k === i + 1)) {
                pres = { kept: given.map((x, i) => ({ el: x, given: i })), relators: T.relators, gamma: given.map((_, i) => [i + 1]) };
                route = 'labels';
            }
        }
    } catch (e) { if (!/too long/.test(e.message)) return { error: e.message, index: r.index }; }

    let rsInfo = null;
    if (!pres) {
        // ── Reidemeister–Schreier on the coset table ──
        const E = enumerateFelsch(nGens, rels, words, { seconds, maxCosets: Math.max(50000, 8 * r.index) });
        if (E.index !== r.index) return { error: `coset enumeration gave index ${E.index}, not ${r.index}`, index: r.index };
        const RS = reidemeisterSchreier({ nLetters: 2 * nGens, inv: (x) => x ^ 1, relators: rels, table: E.table });
        const wordEl = (w) => w.reduce((A, l) => mul(A, elOf(l)), one);
        const sEl = RS.gens.map(({ i, x }) => mul(mul(wordEl(RS.transversal[i]), elOf(x)), inv(wordEl(RS.transversal[E.table[i][x]]))));
        const m = sEl.length, nu = basis.length, total = m + nu + n;
        const uNum = (j) => m + 1 + j, gNum = (i) => m + nu + 1 + i;
        const kWord = (x) => RS.rewrite(wordOf(x));
        let rels2;
        try { rels2 = RS.relators.concat(hallRelators(sEl, kWord, uNum, gNum)); } catch (e) { return { error: e.message, index: r.index }; }
        const elOfNum = (k) => (k <= m ? sEl[k - 1] : k <= m + nu ? basis[k - m - 1].x : given[k - m - nu - 1]);
        const givenSet = new Set(given.map((_, i) => gNum(i)));
        const T = tietze(total, rels2, { maxLen, prefer: givenSet, keepPreferred: true, seconds: tietzeSeconds });
        const toPres = (T) => ({
            kept: T.keep.map((k) => ({ el: elOfNum(k), given: k > m + nu ? k - m - nu - 1 : null })),
            relators: T.relators, gamma: given.map((_, i) => T.express(gNum(i))),
        });
        pres = toPres(T);
        // the Schreier generators Tietze kept, written in the given ones: a short search, or the labels
        if (pres.kept.some((x) => x.given === null)) {
            let labeled = null;
            const labelWord = (x) => {
                const { js, k } = split(x);
                if (!labeled) {
                    labeled = enumerateFelschAugmented(nGens, rels, words, { seconds, maxCosets: Math.max(50000, 8 * r.index), maxNodes: 40000000 });
                    if (labeled.index !== r.index) throw new Error('the labeled enumeration did not close');
                }
                const { word, end } = labeled.traceWord(0, wordOf(k), labelLength);
                if (word === null) throw new Error('a word is too long');
                if (end !== 0) throw new Error('internal: an element of K moves the coset K');
                return freeReduce(js.flatMap((j) => basis[j].w).concat(substAll(word, (l) => kGivenWords[l - 1])));
            };
            const hs = pres.kept.map((_, a) => a).filter((a) => pres.kept[a].given === null);
            const short = findWords(given, hs.map((a) => pres.kept[a].el), ops, { wordElements: 30000, wordSeconds: 1 });
            const hw = pres.kept.map(() => null);
            let fromLabels = false;
            hs.forEach((a, j) => {
                let lab = null;
                if (!short[j] || short[j].length > 12) { try { lab = labelWord(pres.kept[a].el); } catch (e) { /* none */ } }
                if (lab && (!short[j] || lab.length < short[j].length)) { hw[a] = lab; fromLabels = true; } else hw[a] = short[j];
            });
            if (hw.every((w, a) => w || pres.kept[a].given !== null)) {
                const El = eliminateByWords(pres.kept.length, pres.relators, pres.kept, pres.gamma, hw);
                if (El) {
                    const Kn = pres.kept.length, orig = (a) => (a <= Kn ? T.keep[a - 1] : gNum(El.dropped[a - Kn - 1]));
                    pres = toPres({
                        keep: El.keep.map(orig), relators: El.relators,
                        express: (k) => { const j = El.dropped.indexOf(k - (m + nu + 1)); return j >= 0 ? El.express(Kn + 1 + j) : substAll(T.express(k), El.express); },
                    });
                    hFrom = fromLabels ? 'labels' : 'search';
                }
            }
        }
        route = 'schreier';
        rsInfo = { generators: m, relators: RS.relators.length };
    }

    // checks: every relator is 1, every given generator comes out of its word
    const K = pres.kept.length;
    const ev = (w) => w.reduce((A, x) => mul(A, x > 0 ? pres.kept[x - 1].el : inv(pres.kept[-x - 1].el)), one);
    for (const rel of pres.relators) if (key(ev(rel)) !== ONEKEY) return { error: 'internal: a relator is not the identity', index: r.index };
    for (const [i, w] of pres.gamma.entries()) if (key(ev(w)) !== key(given[i])) return { error: 'internal: a generator does not come out of its word', index: r.index };
    const abelian = abelianInvariants(K, pres.relators);
    // the relators that follow from the others, dropped (the abelianization is a check that nothing else was)
    let relators = pres.relators, pruned = null;
    if (pruneWork > 0 && relators.length > 1) {
        const P = pruneRelators(K, relators, { work: pruneWork });
        if (JSON.stringify(abelianInvariants(K, P.relators)) !== JSON.stringify(abelian)) return { error: 'internal: pruning the relators changed the abelianization', index: r.index };
        if (P.dropped) { relators = P.relators; pruned = { before: pres.relators.length, dropped: P.dropped, ms: P.ms }; }
    }
    let extra = 0;
    const gens = pres.kept.map((x) => (x.given !== null
        ? { M: rows[x.given], name: `g${x.given + 1}`, given: x.given }
        : { M: matTeX(QD.toF ? QD.toF(x.el) : null), name: `h${++extra}`, given: null }));
    return {
        kind: 'quaternion', route, index: r.index, kernelIndex: r.kernelIndex, tableFrom: 'coset enumeration', S: r.S,
        gens, relators, pruned, gamma: pres.gamma, onGiven: gens.every((g) => g.given !== null), abelian,
        ...(hFrom ? { hFrom } : {}),
        lambda: { gens: r.gens, relators: r.relators, reps: r.reps, definite: r.definite, place: r.place },
        rs: rsInfo,
        ms: Date.now() - t0,
    };
}

/** A flat 2 × 2 matrix over F (entries { v, D }, v in powers of w) as four TeX entries, scaled to be integral. */
function matTeX(M) {
    if (!M) return ['?', '?', '?', '?'];
    const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
    const L = M.reduce((l, e) => l / gcd(l, BigInt(e.D)) * BigInt(e.D), 1n);
    const vs = M.map((e) => e.v.map((c) => BigInt(c) * (L / BigInt(e.D))));
    const g = vs.flat().reduce((a, c) => gcd(a, c), 0n) || 1n;
    const tex = (v) => {
        const terms = [];
        v.forEach((c0, j) => {
            const c = c0 / g;
            if (!c) return;
            const mono = j === 0 ? '' : j === 1 ? 'w' : `w^{${j}}`;
            const abs = c < 0n ? -c : c;
            terms.push({ neg: c < 0n, body: mono ? (abs === 1n ? mono : `${abs}${mono}`) : `${abs}` });
        });
        if (!terms.length) return '0';
        return terms.map((t, i) => (i === 0 ? (t.neg ? `-${t.body}` : t.body) : `${t.neg ? ' - ' : ' + '}${t.body}`)).join('');
    };
    return vs.map(tex);
}
