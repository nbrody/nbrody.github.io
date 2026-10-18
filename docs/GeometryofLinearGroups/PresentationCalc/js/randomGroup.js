/**
 * randomGroup.js — a random finitely generated subgroup of PGL₂ over a number field (⌘-click on
 * the die). Simple generating sets are the likely ones, but every ingredient has an unbounded
 * tail, so in principle any example can come up:
 *
 *   · the number of generators: 2 + a geometric variable;
 *   · the field: ℚ; one of the database's nine fields; ℚ(√d), d squarefree; a cyclotomic field
 *     ℚ(ζ_n); a pure field ℚ(p^{1/m}) (Eisenstein, so irreducible); or a cubic ℚ(θ) with
 *     θ³ + aθ + b = 0 and no rational root;
 *   · the entries: 0 often, otherwise ± a magnitude with a power-law tail, P(|x| ≥ m) = m^{−α};
 *     over a number field, coefficients of 1, w, w², … drawn so, the higher ones mostly 0;
 *   · the shape of each generator: generic, unipotent, diagonal, a rotation (a −b; b a), an
 *     involution (a b; c −a), (0 −1; 1 t), or over ℚ(i) a quaternion (a+bi c+di; −c+di a−bi).
 *
 * The weights are set (by simulation: batch-free, see inDatabaseScope) so that about 40% of the
 * draws lie in the range of the database (batch/run.mjs, batch/runNF.mjs): over ℚ, 2 to 4 integer
 * generators with σ₁ ≤ 15; over its nine fields, 2 generators with coefficients in [−2, 2] and
 * e^h ≤ 2 (≤ 1.8 for the cubic fields).
 */
import { FIELDS, embeddings, height, detNF, entryTex } from '../batch/enumerateNF.mjs';

// ── the distribution's weights ──
export const WEIGHTS = {
    moreGens: 0.33,             // P(another generator), so 2 + Geometric
    rationals: 0.38,            // P(the field is ℚ)
    fields: { database: 0.6, quadratic: 0.18, cyclotomic: 0.09, pure: 0.07, cubic: 0.06 },
    zero: 0.4,                  // P(an entry is 0)
    alpha: 2,                   // the magnitude tail over ℚ: P(|x| ≥ m) = m^{−α}
    alphaField: 3,              // … and over a number field, per coefficient
    higher: 0.6,                // P(a coefficient of w, w², … is 0)
    shapes: { generic: 0.5, unipotent: 0.12, diagonal: 0.1, rotation: 0.08, involution: 0.08, order: 0.06, quaternion: 0.06 },
};
const DB_FIELD_WEIGHT = { i: 1, m2: 1, m3: 1, r2: 1, r3: 1, r5: 1, c2: 0.6, c23: 0.6, c7: 0.6 };
const SCOPE_Q_SIGMA = 15, SCOPE_Q_GENS = 4;
const SCOPE_NF = (F) => (F.poly.length - 1 === 2 ? 2 : 1.8);

const pick = (rand, weights) => {
    const entries = Object.entries(weights);
    let u = rand() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [k, w] of entries) { if ((u -= w) < 0) return k; }
    return entries[entries.length - 1][0];
};
const geometric = (rand, more) => { let n = 0; while (rand() < more) n++; return n; };
/** m ≥ 1 with P(m ≥ x) = x^{−α} (a discretized Pareto variable). */
const magnitude = (rand, alpha) => Math.floor(Math.pow(1 - rand(), -1 / alpha));
const signed = (rand, m) => (rand() < 0.5 ? -m : m);

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
function squarefree(n) {
    n = Math.abs(n);
    for (let p = 2; p * p <= n; p++) if (n % (p * p) === 0) return false;
    return n > 1;
}
const SMALL_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

/** The n-th cyclotomic polynomial, low → high, by dividing x^n − 1 by Φ_d for d | n, d < n. */
const CYCLOTOMIC = new Map();
function cyclotomic(n) {
    if (!CYCLOTOMIC.has(n)) CYCLOTOMIC.set(n, cyclotomicRaw(n));
    return CYCLOTOMIC.get(n);
}
function cyclotomicRaw(n) {
    let num = Array(n + 1).fill(0); num[0] = -1; num[n] = 1;
    for (let d = 1; d < n; d++) {
        if (n % d) continue;
        const den = cyclotomic(d), out = Array(num.length - den.length + 1).fill(0), r = num.slice();
        for (let k = r.length - 1; k >= den.length - 1; k--) {
            const c = r[k];
            out[k - den.length + 1] = c;
            for (let j = 0; j < den.length; j++) r[k - den.length + 1 + j] -= c * den[j];
        }
        num = out;
    }
    return num;
}
const phi = (n) => cyclotomic(n).length - 1;

/** A polynomial (low → high) in w as text the page reads: w^3-w-1. */
function polyText(P) {
    const terms = [];
    for (let k = P.length - 1; k >= 0; k--) {
        const c = P[k];
        if (!c) continue;
        const mon = k === 0 ? '' : k === 1 ? 'w' : `w^${k}`;
        const coef = k > 0 && Math.abs(c) === 1 ? '' : String(Math.abs(c));
        terms.push((c < 0 ? '-' : terms.length ? '+' : '') + coef + mon);
    }
    return terms.join('') || '0';
}

/** The field: { key, name, poly (low → high), database } — key null for ℚ. */
function drawField(rand) {
    if (rand() < WEIGHTS.rationals) return { key: null, name: 'ℚ', poly: [0, 1], degree: 1 };
    const kind = pick(rand, WEIGHTS.fields);
    if (kind === 'database') {
        const key = pick(rand, DB_FIELD_WEIGHT), F = FIELDS[key];
        return { key, name: F.name, poly: F.poly, degree: F.poly.length - 1, database: true, root: F.root };
    }
    if (kind === 'quadratic') {
        for (;;) {
            const d = signed(rand, magnitude(rand, 0.9) + 1);
            if (!squarefree(d)) continue;
            // w² − d may be one of the database's own polynomials (w² + 1, w² ± 2, w² − 3)
            const same = Object.entries(FIELDS).find(([, F]) => F.poly.join() === [-d, 0, 1].join());
            if (same) return { key: same[0], name: same[1].name, poly: same[1].poly, degree: 2, database: true, root: same[1].root };
            return { key: `q${d}`, name: `ℚ(√${d < 0 ? '−' : ''}${Math.abs(d)})`, poly: [-d, 0, 1], degree: 2 };
        }
    }
    if (kind === 'cyclotomic') {
        for (;;) {
            const n = 4 + magnitude(rand, 2);
            if (n % 4 === 2 || phi(n) < 2) continue;      // ℚ(ζ_n) = ℚ(ζ_{n/2}) for n ≡ 2 (mod 4)
            return { key: `z${n}`, name: `ℚ(ζ${String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('')})`, poly: cyclotomic(n), degree: phi(n) };
        }
    }
    if (kind === 'pure') {
        const m = 3 + geometric(rand, 0.35);
        const p = SMALL_PRIMES[Math.min(SMALL_PRIMES.length - 1, magnitude(rand, 1.2) - 1)];
        return { key: `p${p}^${m}`, name: `ℚ(${p}^{1/${m}})`, poly: [-p, ...Array(m - 1).fill(0), 1], degree: m };
    }
    for (;;) {                                           // θ³ + aθ + b, irreducible: no rational root (a divisor of b)
        const a = signed(rand, magnitude(rand, 1.2) - 1), b = signed(rand, magnitude(rand, 1.2));
        let root = false;
        for (let r = 1; r <= Math.abs(b) && !root; r++) if (b % r === 0) for (const s of [r, -r]) if (s * s * s + a * s + b === 0) root = true;
        if (!root) return { key: `c${a},${b}`, name: `ℚ(θ), θ³${a ? `${a < 0 ? '−' : '+'}${Math.abs(a) === 1 ? '' : Math.abs(a)}θ` : ''}${b < 0 ? '−' : '+'}${Math.abs(b)} = 0`, poly: [b, a, 0, 1], degree: 3 };
    }
}

/** An element of ℤ[w] as a coefficient vector of length degree. */
function drawEntry(rand, degree, { nonzero = false } = {}) {
    const alpha = degree === 1 ? WEIGHTS.alpha : WEIGHTS.alphaField;
    for (;;) {
        const v = Array(degree).fill(0);
        if (rand() >= WEIGHTS.zero) v[0] = signed(rand, magnitude(rand, alpha));
        for (let k = 1; k < degree; k++) if (rand() >= WEIGHTS.higher) v[k] = signed(rand, magnitude(rand, alpha));
        if (!nonzero || v.some((x) => x)) return v;
    }
}
const constant = (degree, c) => { const v = Array(degree).fill(0); v[0] = c; return v; };
const negate = (v) => v.map((x) => -x);

/** One generator, as four coefficient vectors [a, b, c, d]. */
function drawGenerator(rand, field) {
    const n = field.degree, E = (o) => drawEntry(rand, n, o);
    let shape = pick(rand, WEIGHTS.shapes);
    if (shape === 'quaternion' && !(field.key === 'i' || field.key === 'q-1')) shape = 'generic';
    switch (shape) {
        case 'unipotent': { const x = E({ nonzero: true }); return rand() < 0.5 ? [constant(n, 1), x, constant(n, 0), constant(n, 1)] : [constant(n, 1), constant(n, 0), x, constant(n, 1)]; }
        case 'diagonal': return [E({ nonzero: true }), constant(n, 0), constant(n, 0), E({ nonzero: true })];
        case 'rotation': { const a = E(), b = E({ nonzero: true }); return [a, negate(b), b, a]; }
        case 'involution': { const a = E(); return [a, E({ nonzero: true }), E({ nonzero: true }), negate(a)]; }
        case 'order': return [constant(n, 0), constant(n, -1), constant(n, 1), E()];
        case 'quaternion': {
            // (a + bi, c + di; −c + di, a − bi) with w = i
            const [a, b, c, d] = [0, 1, 2, 3].map(() => (rand() < WEIGHTS.zero ? 0 : signed(rand, magnitude(rand, WEIGHTS.alphaField))));
            return [[a, b], [c, d], [-c, d], [a, -b]];
        }
        default: return [E(), E(), E(), E()];
    }
}

const isZero = (v) => v.every((x) => x === 0);
const key = (g) => g.map((v) => v.join(',')).join('|');

/** σ₁ of a primitive integer matrix (enumerate.mjs's height, e^h). */
function sigma1Q([a, b, c, d]) {
    const f = a * a + b * b + c * c + d * d, D = a * d - b * c;
    return Math.sqrt((f + Math.sqrt(Math.max(f * f - 4 * D * D, 0))) / 2);
}

/**
 * Is the generating set in the database's range? Over ℚ: 2 to 4 generators, each with σ₁ ≤ 15 in
 * primitive form. Over its nine fields: 2 generators, coefficients in [−2, 2], e^h ≤ 2 (cubic:
 * 1.8), h computed at the places at ∞ (an upper bound when the entries share a factor).
 */
export function inDatabaseScope(field, gens) {
    if (field.key === null) {
        if (gens.length > SCOPE_Q_GENS) return false;
        return gens.every((g) => {
            const m = g.map((v) => v[0]), c = m.reduce((s, x) => gcd(s, x), 0);
            return sigma1Q(m.map((x) => x / c)) <= SCOPE_Q_SIGMA + 1e-9;
        });
    }
    if (!field.database || gens.length !== 2) return false;
    if (gens.some((g) => g.some((v) => v.some((x) => Math.abs(x) > 2)))) return false;
    const F = FIELDS[field.key];
    return gens.every((g) => height(F, g) <= Math.log(SCOPE_NF(F)) + 1e-9);
}

/**
 * A root of the field's polynomial to embed by: the database's own for its fields, else a random
 * one (null, for the page's first root, if the numerical root finder does not settle).
 */
function chooseRoot(rand, field) {
    if (field.root) return field.root;
    let roots = [];
    try { roots = embeddings({ poly: field.poly }).filter((r) => Number.isFinite(r.re) && Number.isFinite(r.im)); } catch (e) { roots = []; }
    if (!roots.length) return null;
    const r = roots[Math.floor(rand() * roots.length)];
    return { re: r.re, im: r.im };
}

/**
 * A random group, as poincare's input state plus a description:
 * { mats, consts, field, gens, scope, label }.
 */
export function randomGroup(rand = Math.random) {
    const field = drawField(rand);
    const F = { poly: field.poly };
    const k = 2 + geometric(rand, WEIGHTS.moreGens);
    const gens = [], seen = new Set();
    let guard = 0;
    while (gens.length < k && guard++ < 1000) {
        const g = drawGenerator(rand, field);
        // invertible, not a scalar, and new up to sign (the projective class of g or its inverse
        // is rarely repeated by a fresh draw; equal entries are the common case)
        const det = field.key === null ? [g[0][0] * g[3][0] - g[1][0] * g[2][0]] : detNF(F, g);
        if (isZero(det)) continue;
        if (isZero(g[1]) && isZero(g[2]) && key([g[0]]) === key([g[3]])) continue;
        const kk = key(g), kn = key(g.map(negate));
        if (seen.has(kk) || seen.has(kn)) continue;
        seen.add(kk);
        gens.push(g);
    }
    const scope = inDatabaseScope(field, gens);
    const entry = (v) => (field.key === null ? String(v[0]) : entryTex(v));
    const mats = gens.map((g) => g.map(entry));
    const consts = field.key === null ? [] : [{ name: 'w', poly: polyText(field.poly), near: chooseRoot(rand, field) }];
    const label = `${field.name}, ${gens.length} generators`;
    return { mats, consts, field: field.name, degree: field.degree, gens, scope, label };
}
