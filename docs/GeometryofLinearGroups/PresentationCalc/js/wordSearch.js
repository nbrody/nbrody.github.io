/**
 * wordSearch.js — words in given generators of Γ for target elements, by FlashBeam (flashbeam.js)
 * scored by the size of the primitive integral matrix: for Γ ⊆ PGL₂(ℤ[1/S]) that is
 * log‖g‖² = log(‖g‖²/|det g|) + Σ_p v_p(det g)·log p, the distance from o in H² × ∏ T_p, up to a
 * constant; over O = ℤ[i], ℤ[√−2], ℤ[ω] the same with ‖g‖² = Σ N(entries), in H³ × ∏ T_π. Γ is
 * discrete there when it is S-arithmetic, so the elements near o — the generators of vertex groups
 * and the elements inverting edges — are few, and the beam reaches them along words far longer than
 * a breadth-first search can.
 *
 * The pool. Each iteration multiplies the beam by the expansion pool: the given generators, the
 * flash (the lowest elements seen so far, balanced between those fixing o in every tree and those
 * moving it, as in covering.js), and the elements of simple geometry already written as words —
 * seeds passed in, and every target as soon as it is found. Those stay in the pool, so the
 * generating set grows by them and the targets still missing are reached through the ones found.
 * Every word found is exact (the beam multiplies the matrices), and the caller checks it again.
 */
import { FlashBeam, concatWords, invertWord } from './flashbeam.js';

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const adj = (A) => [A[3], -A[1], -A[2], A[0]];
const prim = (A) => {
    const g = A.reduce((s, x) => bgcd(s, x), 0n);
    const B = g > 1n ? A.map((x) => x / g) : A.slice();
    return (B.find((x) => x !== 0n) ?? 1n) < 0n ? B.map((x) => -x) : B;
};
const isScalar = (A) => A[1] === 0n && A[2] === 0n && A[0] === A[3];
/** log₂ of a positive BigInt */
export function log2Big(s) {
    const bits = s.toString(2).length;
    return bits < 1000 ? Math.log2(Number(s)) : bits;
}

/**
 * The ring for flashWords over ℚ: primitive integer matrices up to sign. { norm(M) → M normalized,
 * one, mul, inv, key, isIdentity, height (log₂‖M‖²), fixes (M fixes o in every tree: det ±1) }.
 */
export const rationalWordRing = {
    norm: prim, one: [1n, 0n, 0n, 1n],
    mul: (A, B) => prim(mul(A, B)), inv: (A) => prim(adj(A)), key: (M) => M.join(','), isIdentity: isScalar,
    height: (M) => log2Big(M.reduce((t, x) => t + x * x, 0n)),
    fixes: (M) => babs(M[0] * M[3] - M[1] * M[2]) === 1n,
};

const LETTER = 0.002;              // per letter, after the height (log₂‖g‖²): among equals, the shorter word

/**
 * gens, targets: matrices of the ring (in one frame); seeds: [{ M, word }] elements of Γ already
 * written in gens (±(i+1)), kept in the pool. Returns a word (±(i+1)) or null per target, the
 * shortest found. polish: iterations to go on after the last target is found, for shorter words.
 *
 * The ring: { norm(M) → M normalized, one, mul, inv, key (of a normalized matrix), isIdentity,
 * height, fixes (M fixes o in every tree) } (rationalWordRing; bianchiPresentation.js
 * bianchiWordRing; covering.js wordRing over any number field). When its keys are not the same for
 * every matrix of an element (covering.js wordRing), it also has bucket(M) (an integer, equal for
 * equal elements up to ±1) and same(A, B) (exact), and targets are recognized through those.
 */
export function flashWords(gens, targets, ring, { seeds = [], seconds = 5, beamWidth = 1500, flashSize = 60, maxLetters = 4000, polish = 0 } = {}) {
    const R = ring;
    const exact = !R.bucket;
    const want = new Map();             // key or bucket → [{ j, P, inv }]
    const hold = (b, c) => { if (!want.has(b)) want.set(b, []); want.get(b).push(c); };
    targets.forEach((T, j) => {
        const P = R.norm(T), Q = R.inv(P);
        hold(exact ? R.key(P) : R.bucket(P), { j, P, inv: false });
        hold(exact ? R.key(Q) : R.bucket(Q), { j, P: Q, inv: true });
    });
    // the targets (or their inverses) a node is: every one of them, as two targets may be inverse
    const lookup = (n) => {
        if (exact) return want.get(n.key) || [];
        const b = R.bucket(n.state);
        return [...(want.get(b) || []), ...(want.get(b - 1) || []), ...(want.get(b + 1) || [])].filter((c) => R.same(n.state, c.P));
    };
    const out = targets.map(() => null);
    let left = targets.length, polishing = false;
    const node = (P, word) => ({ state: P, word, key: R.key(P), score: R.height(P) + LETTER * word.length, stratum: R.fixes(P) ? 0 : 1 });
    const pair = (P, word) => [node(P, word), node(R.inv(P), invertWord(word))];
    let FB = null;
    const problem = {
        generators: () => gens.flatMap((G, i) => pair(R.norm(G), [i + 1]))
            .concat(seeds.filter((s) => s.word.length <= maxLetters).flatMap((s) => pair(R.norm(s.M), s.word))),
        identity: () => node(R.one, []),
        multiply: (a, b) => { const w = concatWords(a.word, b.word); return w.length > maxLetters ? null : node(R.mul(a.state, b.state), w); },
        isIdentity: (n) => R.isIdentity(n.state),
        visit: (n) => {
            for (const t of lookup(n)) {
                const w = t.inv ? invertWord(n.word) : n.word;
                if (out[t.j] && out[t.j].length <= w.length) continue;
                const fresh = !out[t.j];
                out[t.j] = w;
                // a target found joins the pool for good: the ones still missing may be reached through it
                if (fresh) { left--; if (FB && FB.started) FB.generators.push(...pair(n.state, n.word)); }
            }
        },
        collide: (n) => problem.visit(n),
        done: () => left === 0 && !polishing,
    };
    FB = new FlashBeam(problem, { beamWidth, flashSize, twoSided: true, maxVisited: 1500000, flashSplit: (n) => (n.stratum === 0 ? 'fix' : 'move') });
    const deadline = Date.now() + 1000 * seconds;
    let extra = 0;
    while (Date.now() < deadline && (left > 0 || extra < polish)) {
        if (left === 0) { polishing = true; extra++; }
        const st = FB.step();
        if (st.exhausted) break;
    }
    return out;
}

/** Over ℚ (gens, targets: BigInt matrices in one frame): flashWords on primitive integer matrices. */
export function beamWords(gens, targets, { seconds = 5, beamWidth = 3000, flashSize = 60, maxLetters = 4000, seeds = [], polish = 0 } = {}) {
    return flashWords(gens, targets, rationalWordRing, { seconds, beamWidth, flashSize, maxLetters, seeds, polish });
}
