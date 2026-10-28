/**
 * charSets.js — each generator at each place where Γ acts on a symmetric space, for step 1's table:
 * hyperbolic, parabolic, elliptic (of infinite order) or torsion (of finite order), and its
 * characteristic set: the axis, the fixed point in the space, or the fixed point on the boundary.
 *
 * The columns: every place at ∞ of the field F of the entries, one per class of embeddings as in
 * step 2 (the caller passes them, each with an embedding): ℍ² at a real embedding, ℍ³ at a complex
 * one. Then the Bruhat–Tits tree of PGL₂(F_𝔓) at each prime 𝔓 where Γ is unbounded. By Serre's
 * lemma (Trees, I.6.5), Γ is unbounded on a tree exactly when a generator or a product of two
 * generators is hyperbolic there, so testing those words is exact.
 *
 * Exact where it matters. Being trivial, parabolic (tr² = 4 det) or of finite order does not depend
 * on the place, and comes from the Zariski engine. At a prime everything is exact: valuations, and
 * the vertices ⌊x⌋_k of the tree with the action of trees/js/localField.js. At ∞ the class comes
 * from the value of tr²/det at the embedding; points are exact surds over ℚ at a real place, and
 * numerical otherwise.
 *
 * deps: { GlobalField, Place, NR } (loaded by charWorker.js, and by the tests).
 * job:  { poly: the minimal polynomial of w (null over ℚ), mats: the entries as source text,
 *         numbers: integers whose prime factors include every prime where Γ may be unbounded,
 *         arch: [{ key, kind: 'real' | 'complex', root: { re, im }, label (TeX), bounded }],
 *         gens: [{ type, order }] from the Zariski engine, maxPrimes }
 * Returns { columns: [{ key, kind, label, space, bounded }], rows: [[cell]], notes: [text] },
 * with cell = { cls: 'hyperbolic' | 'parabolic' | 'elliptic' | 'torsion' | 'identity' | 'error',
 * text (a word or two), lines (sentences with $…$ math) }.
 */

const MAX_PRIMES = 12;
const DIGITS = 6;                 // p-adic digits shown for an end that is not in F
const MAX_STEPS = 400;            // steps along an axis toward an end

export function generatorTable(deps, job) {
    const { GlobalField } = deps;
    const F = new GlobalField(job.poly ? { gen: 'w', poly: job.poly } : null);
    const mats = job.mats.map((m) => {
        const [a, b, c, d] = m.map((s) => F.parse(s));
        return { a, b, c, d };
    });
    const gens = mats.map((_, i) => (job.gens && job.gens[i]) || {});
    const columns = [], rows = mats.map(() => []), notes = [];
    for (const col of job.arch || []) {
        columns.push({ key: col.key, kind: col.kind, label: col.label, space: col.kind === 'real' ? '\\mathbb{H}^2' : '\\mathbb{H}^3', bounded: !!col.bounded });
        mats.forEach((m, i) => rows[i].push(safely(() => archCell(F, m, gens[i], col, i))));
    }
    const fin = unboundedPrimes(deps, F, mats, job.numbers || [], job.maxPrimes || MAX_PRIMES);
    notes.push(...fin.notes);
    for (const { P, count } of fin.places) {
        const p = String(P.p);
        const label = F.n === 1 ? `\\mathbb{Q}_{${p}}` : `${count > 1 ? `\\mathfrak{p}_{${P.index + 1}}` : '\\mathfrak{p}'} \\mid ${p}`;
        columns.push({ key: `p${p}_${P.index}`, kind: 'tree', label, space: `T_{${P.q + 1}}`, bounded: false });
        mats.forEach((m, i) => rows[i].push(safely(() => treeCell(F, P, m, gens[i], i))));
    }
    return { columns, rows, notes };
}

function safely(f) {
    try { return f(); } catch (e) { return { cls: 'error', text: 'not computed', lines: [String(e && e.message ? e.message : e)] }; }
}

const identityCell = (i) => ({ cls: 'identity', text: 'trivial', lines: [`$g_{${i + 1}}$ is scalar, so it is trivial in $\\mathrm{PGL}_2$.`] });

// ───────────────────────── matrices over F ─────────────────────────

const mmul = (F, X, Y) => ({
    a: F.add(F.mul(X.a, Y.a), F.mul(X.b, Y.c)), b: F.add(F.mul(X.a, Y.b), F.mul(X.b, Y.d)),
    c: F.add(F.mul(X.c, Y.a), F.mul(X.d, Y.c)), d: F.add(F.mul(X.c, Y.b), F.mul(X.d, Y.d)),
});
const adjugate = (F, X) => ({ a: X.d, b: F.neg(X.b), c: F.neg(X.c), d: X.a });
const traceOf = (F, X) => F.add(X.a, X.d);
const detOf = (F, X) => F.sub(F.mul(X.a, X.d), F.mul(X.b, X.c));

/** v(tr²/det) at the place (Infinity when the trace is 0). */
function tauVal(F, P, X) {
    const t = traceOf(F, X);
    if (F.isZero(t)) return Infinity;
    return 2 * P.val(t) - P.val(detOf(F, X));
}

// ───────────────────────── the primes where Γ is unbounded ─────────────────────────

function unboundedPrimes(deps, F, mats, numbers, cap) {
    const { Place, NR } = deps;
    const X = NR._internal;
    const notes = [];
    const set = new Set();
    let complete = true;
    for (const s of numbers) {
        const r = X.factorInt(BigInt(s));
        if (!r.complete) complete = false;
        for (const [p] of r.factors) set.add(BigInt(p));
    }
    const primes = [...set].filter((p) => X.isProbablePrime(p)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (!complete || primes.length < set.size) notes.push('Some numbers could not be fully factored, so a prime where $\\Gamma$ is unbounded may be missing.');
    // the generators and the products of two of them (Serre's lemma)
    const words = mats.slice();
    for (let i = 0; i < mats.length; i++) {
        for (let j = 0; j < mats.length; j++) {
            if (i === j) continue;
            words.push(mmul(F, mats[i], mats[j]));
            if (i < j) words.push(mmul(F, mats[i], adjugate(F, mats[j])));
        }
    }
    const places = [], skipped = [];
    for (const p of primes) {
        if (places.length >= cap) { notes.push(`Only the first ${cap} primes where $\\Gamma$ is unbounded are shown.`); break; }
        let prs;
        try { prs = F.primesAbove(p); } catch (e) { skipped.push(String(p)); continue; }
        prs.forEach((pr, i) => {
            let P;
            try { P = new Place(F, p, i); } catch (e) { skipped.push(String(p)); return; }
            if (Math.min(...words.map((W) => tauVal(F, P, W))) < 0) places.push({ P, count: prs.length });
        });
    }
    if (skipped.length) notes.push(`The trees over $${[...new Set(skipped)].join(',\\ ')}$ are not shown: their residue fields are too large.`);
    return { places, notes };
}

// ───────────────────────── numbers ─────────────────────────

const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const csub = (a, b) => C(a.re - b.re, a.im - b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cscale = (a, s) => C(a.re * s, a.im * s);
const cdiv = (a, b) => { const q = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
const cabs = (a) => Math.hypot(a.re, a.im);
const csqrt = (a) => {
    const r = cabs(a);
    if (r === 0) return C(0);
    const re = Math.sqrt((r + a.re) / 2), im = Math.sqrt(Math.max(0, (r - a.re) / 2));
    return C(re, a.im < 0 ? -im : im);
};
const bitlen = (n) => (n < 0n ? -n : n).toString(2).length;

/** A Rat as a double, also when its numerator or denominator is huge. */
function ratNum(r) {
    const a = Number(r.n), b = Number(r.d);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) < 1e300 && b < 1e300) return a / b;
    const sn = Math.max(0, bitlen(r.n) - 900), sd = Math.max(0, bitlen(r.d) - 900);
    return (Number(r.n >> BigInt(sn)) / Number(r.d >> BigInt(sd))) * 2 ** (sn - sd);
}

/** An element of F at the embedding w ↦ root. */
function numAt(F, x, root) {
    const c = F.toK(x);
    let re = 0, im = 0;
    for (let i = c.length - 1; i >= 0; i--) {
        const nr = re * root.re - im * root.im + ratNum(c[i]);
        im = re * root.im + im * root.re;
        re = nr;
    }
    return C(re, im);
}

/** A double for TeX: six significant digits. */
function fmt(x) {
    if (Math.abs(x) < 1e-12) return '0';
    const s = String(Number(x.toPrecision(6)));
    const m = s.match(/^(-?[\d.]+)e([+-]\d+)$/);
    return m ? `${m[1]} \\times 10^{${Number(m[2])}}` : s;
}
/** A complex number for TeX, dropping a negligible real or imaginary part. */
function fmtC(z) {
    const s = Math.max(1e-300, cabs(z));
    const re = Math.abs(z.re) < 1e-10 * s ? 0 : z.re, im = Math.abs(z.im) < 1e-10 * s ? 0 : z.im;
    if (!im) return fmt(re);
    const imT = Math.abs(im) === 1 ? 'i' : `${fmt(Math.abs(im))}i`;
    if (!re) return im < 0 ? `-${imT}` : imT;
    return `${fmt(re)} ${im < 0 ? '-' : '+'} ${imT}`;
}

/** An angle as a multiple of π, when it is 2πk/n. */
function angleTex(k, n) {
    const g = gcdInt(2 * k, n), num = (2 * k) / g, den = n / g;
    const top = num === 1 ? '\\pi' : `${num}\\pi`;
    return den === 1 ? top : `\\frac{${top}}{${den}}`;
}
const gcdInt = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

// ───────────────────────── exact rationals (over ℚ) ─────────────────────────

const ratOf = (F, x) => F.toK(x)[0];

function texRat(r) {
    if (r.d === 1n) return String(r.n);
    const n = r.n < 0n ? -r.n : r.n;
    return `${r.n < 0n ? '-' : ''}\\tfrac{${n}}{${r.d}}`;
}

/** √|D| = s·√m with s rational and m a squarefree positive integer (D rational, ≠ 0). */
function sqrtParts(NR, D) {
    const X = NR._internal;
    const N = (D.n < 0n ? -D.n : D.n) * D.d;            // √|D| = √N / d
    const r = X.factorInt(N);
    let s = 1n, m = 1n;
    if (r.complete) {
        for (const [p, e] of r.factors) {
            const P = BigInt(p);
            s *= P ** BigInt(Math.floor(e / 2));
            if (e % 2) m *= P;
        }
    } else m = N;
    return { s: new X.Rat(s, D.d), m };
}

/** x + y√m (times i when imag), as TeX. */
function texSurd(x, y, m, imag = false) {
    if (m === 1n && !imag) return texRat(x.add(y));
    const root = m === 1n ? '' : `\\sqrt{${m}}`;
    const yAbs = y.abs();
    const coef = yAbs.d === 1n && yAbs.n === 1n ? root : yAbs.d === 1n ? `${yAbs.n}${root}` : `\\tfrac{${yAbs.n}}{${yAbs.d}}${root}`;
    const term = imag ? (coef ? `${coef}\\,i` : 'i') : (coef || '1');
    if (x.isZero()) return `${y.sign() < 0 ? '-' : ''}${term}`;
    return `${texRat(x)} ${y.sign() < 0 ? '-' : '+'} ${term}`;
}

// ───────────────────────── a generator at a place at ∞ ─────────────────────────

/**
 * The fixed points on the boundary, as TeX: { att, rep } (attracting and repelling, for a hyperbolic
 * element), { pair } (two, for an elliptic or a reflection), { upper } (the fixed point in ℍ² of an
 * elliptic at a real place), { one } (a parabolic). Exact surds over ℚ at a real place.
 */
function archPoints(F, NR, m, col, exact) {
    if (exact) return exactArchPoints(F, NR, m);
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((k) => numAt(F, m[k], col.root));
    if (F.isZero(m.c)) {
        if (F.equals(m.a, m.d)) return { one: '\\infty' };
        const z = fmtC(cdiv(b, csub(d, a)));
        const infAtt = cabs(a) > cabs(d);
        return { att: infAtt ? '\\infty' : z, rep: infAtt ? z : '\\infty', pair: ['\\infty', z] };
    }
    const tr = cadd(a, d), det = csub(cmul(a, d), cmul(b, c));
    const sD = csqrt(csub(cmul(tr, tr), cscale(det, 4)));
    const two_c = cscale(c, 2);
    const z1 = cdiv(cadd(csub(a, d), sD), two_c), z2 = cdiv(csub(csub(a, d), sD), two_c);
    if (cabs(sD) < 1e-12 * Math.max(1, cabs(tr))) return { one: fmtC(z1) };
    const first = cabs(cadd(tr, sD)) >= cabs(csub(tr, sD));
    const upper = z1.im > 0 ? z1 : z2;
    return { att: fmtC(first ? z1 : z2), rep: fmtC(first ? z2 : z1), pair: [fmtC(z1), fmtC(z2)], upper: fmtC(upper) };
}

function exactArchPoints(F, NR, m) {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((k) => ratOf(F, m[k]));
    if (c.isZero()) {
        if (a.eq(d)) return { one: '\\infty' };
        const z = texRat(b.div(d.sub(a)));
        const infAtt = a.abs().sub(d.abs()).sign() > 0;
        return { att: infAtt ? '\\infty' : z, rep: infAtt ? z : '\\infty', pair: ['\\infty', z] };
    }
    const amd = a.sub(d), tr = a.add(d), two = new a.constructor(2n);
    const D = amd.mul(amd).add(new a.constructor(4n).mul(b).mul(c));
    const x = amd.div(two.mul(c));
    if (D.isZero()) return { one: texRat(x) };
    const { s, m: sq } = sqrtParts(NR, D);
    const y = s.div(two.mul(c));                                 // z = x ± y√D' (√D' = √m, or i√m)
    if (D.sign() < 0) return { upper: texSurd(x, y.abs(), sq, true), pair: [texSurd(x, y, sq, true), texSurd(x, y.neg(), sq, true)] };
    const plus = texSurd(x, y, sq), minus = texSurd(x, y.neg(), sq);
    // the attracting point has the eigenvalue (tr ± √D)/2 of larger size: + when tr > 0 (s > 0)
    const att = tr.sign() >= 0 ? plus : minus, rep = tr.sign() >= 0 ? minus : plus;
    return { att, rep, pair: [plus, minus] };
}

function archCell(F, m, gen, col, i) {
    if (gen.type === 'identity') return identityCell(i);
    const g = `g_{${i + 1}}`;
    const real = col.kind === 'real';
    const NR = globalThis.NumberRingEngine;
    const pts = archPoints(F, NR, m, col, real && F.n === 1);
    const approx = real && F.n === 1 ? '=' : '\\approx';
    const space = real ? '\\mathbb{H}^2' : '\\mathbb{H}^3';
    const bdry = real ? '\\partial\\mathbb{H}^2 = \\mathbb{R} \\cup \\{\\infty\\}' : '\\partial\\mathbb{H}^3 = \\hat{\\mathbb{C}}';
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((k) => numAt(F, m[k], col.root));
    if (gen.type === 'parabolic') {
        // the double root of c z² + (d − a) z − b
        const z = F.isZero(m.c) ? '\\infty'
            : real && F.n === 1 ? texRat(ratOf(F, m.a).sub(ratOf(F, m.d)).div(ratOf(F, m.c).mul(new (ratOf(F, m.c).constructor)(2n))))
                : fmtC(cdiv(csub(a, d), cscale(c, 2)));
        return { cls: 'parabolic', text: 'parabolic', lines: [`$${g}$ is parabolic: it fixes the point $${z}$ of $${bdry}$, and no point of $${space}$.`] };
    }
    const tr = cadd(a, d), det = csub(cmul(a, d), cmul(b, c));
    const t = cdiv(cmul(tr, tr), det);
    const tReal = Math.abs(t.im) <= 1e-9 * Math.max(1, cabs(t));
    const geodesic = (p) => `the geodesic from $${p[0]}$ to $${p[1]}$`;
    const n = gen.order;
    // a reflection of ℍ² (det < 0 and tr = 0): of order 2
    if (real && det.re < 0 && n === 2) {
        return { cls: 'torsion', text: 'torsion, order 2', lines: [`A reflection, of order $2$: it reverses orientation and fixes ${geodesic(pts.pair)} pointwise.`] };
    }
    if (n || (tReal && t.re >= 0 && t.re < 4)) {
        // a rotation by θ, with t = 4 cos²(θ/2)
        const theta = 2 * Math.acos(Math.min(1, Math.sqrt(Math.max(0, t.re)) / 2));
        let by;
        if (n) {
            const k = Math.max(1, Math.round((theta * n) / (2 * Math.PI)));
            by = `$${angleTex(k, n)}$`;
        } else by = `$\\theta \\approx ${fmt(theta)}$`;
        const about = real ? `about the point $z_0 ${approx} ${pts.upper}$ of $\\mathbb{H}^2$`
            : `about its axis, ${geodesic(pts.pair.map((z) => z))}, which it fixes pointwise`;
        if (n) return { cls: 'torsion', text: `torsion, order ${n}`, lines: [`Of order $${n}$: a rotation by ${by} ${about}.`] };
        return { cls: 'elliptic', text: 'elliptic', lines: [`Elliptic, of infinite order: a rotation by ${by} ${about}.`, 'The angle is not a rational multiple of $\\pi$, since the order is infinite.'] };
    }
    // hyperbolic: the eigenvalue ratio λ, with λ + 1/λ = t − 2 and |λ| > 1, is e^{ℓ + iθ}
    const u = csub(t, C(2));
    let lam = cscale(cadd(u, csqrt(csub(cmul(u, u), C(4)))), 0.5);
    if (cabs(lam) < 1) lam = cdiv(C(1), lam);
    const ell = Math.log(cabs(lam)), theta = Math.atan2(lam.im, lam.re);
    const axis = `along its axis, ${geodesic([pts.rep, pts.att])} (its attracting fixed point)`;
    if (real && det.re < 0) {
        return { cls: 'hyperbolic', text: 'hyperbolic', lines: [`A glide reflection: it reverses orientation, and translates by $\\ell \\approx ${fmt(ell)}$ ${axis}.`] };
    }
    if (real || Math.abs(theta) < 1e-9) {
        return { cls: 'hyperbolic', text: 'hyperbolic', lines: [`Hyperbolic: it translates by $\\ell \\approx ${fmt(ell)}$ ${axis}.`] };
    }
    return {
        cls: 'hyperbolic', text: 'hyperbolic', lines: [
            `Hyperbolic (loxodromic): it translates by $\\ell \\approx ${fmt(ell)}$ ${axis}, and rotates about the axis by $\\theta \\approx ${fmt(Math.abs(theta))}$.`,
        ],
    };
}

// ───────────────────────── a generator in a tree ─────────────────────────

const vtx = (P, x) => `\\lfloor ${P.labelTex(x)} \\rfloor_{${x.k}}`;

/** The level where the geodesic from a to b turns (the level of the smallest ball holding both). */
function meetLevel(P, a, b) {
    const m = Math.min(a.k, b.k);
    for (let j = Math.min(a.lo, b.lo); j < m; j++) if (P.digitAt(a, j) !== P.digitAt(b, j)) return j;
    return m;
}
/** The vertex at distance s from a on the geodesic from a to b. */
function pointOnPath(P, a, b, s) {
    const j = meetLevel(P, a, b), up = a.k - j;
    return s <= up ? P.ancestor(a, a.k - s) : P.ancestor(b, j + (s - up));
}

/** A point of ℙ¹(F) as TeX ('\infty' for null). */
const pointTex = (F, x) => (x === null ? '\\infty' : F.tex(x));

/**
 * The fixed points of m in ℙ¹(F), when they are visibly there: c = 0, b = 0, or over ℚ a rational
 * square discriminant. Returns [{ z, mu }] (z null for ∞, mu the eigenvalue), or null.
 */
function exactEnds(F, m) {
    if (F.isZero(m.c)) return F.equals(m.a, m.d) ? null : [{ z: null, mu: m.a }, { z: F.div(m.b, F.sub(m.d, m.a)), mu: m.d }];
    if (F.isZero(m.b)) return F.equals(m.a, m.d) ? null : [{ z: F.zero(), mu: m.d }, { z: F.div(F.sub(m.a, m.d), m.c), mu: m.a }];
    if (F.n !== 1) return null;
    const NR = globalThis.NumberRingEngine;
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((k) => ratOf(F, m[k]));
    const amd = a.sub(d), D = amd.mul(amd).add(new a.constructor(4n).mul(b).mul(c));
    if (D.sign() <= 0) return null;
    const { s, m: sq } = sqrtParts(NR, D);
    if (sq !== 1n) return null;
    const two = new a.constructor(2n), tr = a.add(d);
    return [1, -1].map((sg) => {
        const r = sg > 0 ? s : s.neg();
        return { z: F.fromRat(amd.add(r).div(two.mul(c))), mu: F.fromRat(tr.add(r).div(two)) };
    });
}

/** Walk from x0 along the axis of g toward its attracting end; the vertex once enough digits are known. */
function towardEnd(P, g, x0) {
    let x = x0, past = false;
    for (let step = 0; step < MAX_STEPS; step++) {
        const y = P.act(g, x);
        if (y.k >= x.k) past = true;
        x = y;
        if (past && x.d.length >= DIGITS) break;
    }
    return x;
}

/** The end in the ball ⌊x⌋_k, as a p-adic expansion (DIGITS digits). */
function expansionTex(F, P, x) {
    // unramified: the uniformizer is p itself
    const isQ = P.e === 1;
    const base = isQ ? String(P.p) : '\\pi';
    const top = Math.min(x.k, x.lo + DIGITS);
    const power = (j) => (j === 0 ? '' : j === 1 ? base : `${base}^{${j}}`);
    const terms = [];
    for (let j = x.lo; j < top; j++) {
        const di = P.digitAt(x, j);
        if (!di) continue;
        const cTex = P.digitTex(di);
        const pw = power(j);
        if (!pw) terms.push(cTex);
        else if (cTex === '1') terms.push(pw);
        else terms.push(/[+-]/.test(cTex.slice(1)) ? `(${cTex})${pw}` : `${cTex}${isQ ? ' \\cdot ' : ''}${pw}`);
    }
    terms.push(`O(${power(top) || '1'})`);
    return terms.join(' + ');
}

function treeCell(F, P, m, gen, i) {
    if (gen.type === 'identity') return identityCell(i);
    const g = `g_{${i + 1}}`;
    const G = P.prepare(m);
    const o = P.canon(F.zero(), 0);
    const go = P.act(G, o), d0 = P.dist(o, go);
    const oTex = 'o = \\lfloor 0 \\rfloor_{0}';
    const local = F.n === 1 ? `\\mathbb{Q}_{${P.p}}` : 'F_{\\mathfrak{p}}';
    const piNote = P.e === 1 ? '' : ` Here $\\pi = ${F.tex(P.pi)}$ is a uniformizer.`;
    const vt = tauVal(F, P, m);
    const n = gen.order;
    if (vt < 0) {
        const ell = -vt, s = (d0 - ell) / 2;
        const x0 = pointOnPath(P, o, go, s);
        if (P.dist(x0, P.act(G, x0)) !== ell) throw new Error('internal: the axis was not found');
        let att, rep, approx = false;
        const ex = exactEnds(F, m);
        if (ex) {
            const [u, w] = P.val(ex[0].mu) < P.val(ex[1].mu) ? ex : [ex[1], ex[0]];
            att = pointTex(F, u.z); rep = pointTex(F, w.z);
        } else {
            att = expansionTex(F, P, towardEnd(P, G, x0));
            rep = expansionTex(F, P, towardEnd(P, P.prepare(P.adjugate(m)), x0));
            approx = true;
        }
        const lines = [
            `Hyperbolic: it translates by $\\ell = -v(\\operatorname{tr}^2/\\det) = ${ell}$ ${ell === 1 ? 'edge' : 'edges'} along its axis.`,
            `Its axis runs from the end $\\xi_- = ${rep}$ to the attracting end $\\xi_+ = ${att}$, points of $\\partial T = \\mathbb{P}^1(${local})$.${approx ? piNote : ''}`,
            s === 0 ? `It passes through $${oTex}$.` : `Its vertex nearest $${oTex}$ is $${vtx(P, x0)}$, at distance $${s}$.`,
        ];
        return { cls: 'hyperbolic', text: 'hyperbolic', lines };
    }
    const lines = [];
    if (n) lines.push(`Of order $${n}$.`);
    if (d0 % 2 === 0) {
        const x = pointOnPath(P, o, go, d0 / 2);
        if (P.dist(x, P.act(G, x)) !== 0) throw new Error('internal: the fixed vertex was not found');
        lines.push(d0 === 0 ? `${n ? 'It' : 'Elliptic: it'} fixes $${oTex}$.`
            : `${n ? 'It' : 'Elliptic: it'} fixes the vertex $${vtx(P, x)}$, the midpoint of $o$ and $${g}\\,o$: the fixed vertex nearest $o$, at distance $${d0 / 2}$.`);
    } else {
        const x1 = pointOnPath(P, o, go, (d0 - 1) / 2), x2 = pointOnPath(P, o, go, (d0 + 1) / 2);
        lines.push(`${n ? 'It' : 'Elliptic: it'} fixes no vertex. It swaps $${vtx(P, x1)}$ and $${vtx(P, x2)}$, so it fixes the midpoint of the edge between them.`);
    }
    if (gen.type === 'parabolic') {
        const z = F.isZero(m.c) ? null : F.div(F.sub(m.a, m.d), F.scaleInt(m.c, 2n));
        lines.push(`It is unipotent, so it also fixes the end $${pointTex(F, z)}$.`);
    } else {
        const ex = exactEnds(F, m);
        if (ex) lines.push(`It also fixes the ends $${pointTex(F, ex[0].z)}$ and $${pointTex(F, ex[1].z)}$, so it fixes the geodesic between them pointwise.`);
    }
    return { cls: n ? 'torsion' : 'elliptic', text: n ? `torsion, order ${n}` : 'elliptic', lines };
}
