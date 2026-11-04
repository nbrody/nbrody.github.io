// arith.js — the arithmetic of hybrids in dimension 3: zeta values, the
// invariant trace field and quaternion algebra of a glued group, and its
// volume at every complex place.
//
// For a hybrid of pieces from incommensurable arithmetic lattices O′(f_i, ℤ)
// with invariant trace fields k_i = ℚ(√d_i), glued along totally geodesic
// surfaces with ternary form g:
//   • kΓ = ℚ(√d₁, …, √d_r), totally complex of degree 2^s, with 2^{s−1} complex
//     places (a Zariski-dense subgroup of an arithmetic group has its invariant
//     trace field, and Γ lies in SO(f, F) with F real, F(√disc f) = kΓ).
//   • AΓ = A_g ⊗ kΓ, A_g = C₀(g) the quaternion algebra over ℚ of the surface
//     group (a quaternion subalgebra over ℚ spans AΓ over kΓ). It ramifies at
//     the primes of kΓ over p ∈ Ram(A_g) of odd local degree: those p at which
//     every d_i is a square, and then at all 2^s primes above p.
//   • at the embedding σ with σ(√d_i) = ε_i√d_i, ρ^σ is ρ on the pieces of the
//     classes with ε_i = ε₁ and ρ conjugated by the reflection in the gluing
//     plane on the others (the gluing radical √(n₁n₂) changes sign). The fold
//     is equivariant and reverses orientation on the folded pieces, so
//     vol(ρ^σ) = Σ ε₁ε_i V_i, V_i the volume of the pieces of class i.
//   • each V_i is a rational multiple of |D_i|^{3/2} ζ_{k_i}(2) / 4π² (Borel),
//     the covolume of PSL₂(O_{k_i}).

import { squarefree, isSquareQp } from './forms.js';

/** The discriminant of ℚ(√d), d squarefree. */
export function quadDisc(d) {
    d = squarefree(d);
    return ((d % 4) + 4) % 4 === 1 ? d : 4 * d;
}

/** ζ(2, x) = Σ_{n ≥ 0} (n + x)⁻², by Euler–Maclaurin after 20 terms. */
function hurwitz2(x) {
    let s = 0;
    const N = 20;
    for (let n = 0; n < N; n++) s += 1 / ((n + x) * (n + x));
    const y = N + x;
    s += 1 / y + 1 / (2 * y * y);
    const B = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66];
    for (let k = 1; k <= B.length; k++) s += B[k - 1] / y ** (2 * k + 1);
    return s;
}

/** The Kronecker symbol (D/n), D a fundamental discriminant, n ≥ 1. */
function kronecker(D, n) {
    let r = 1;
    while (n % 2 === 0) {
        n /= 2;
        const m = ((D % 8) + 8) % 8;
        if (m % 2 === 0) return 0;
        if (m === 3 || m === 5) r = -r;
    }
    // Jacobi symbol (D/n), n odd
    let a = ((D % n) + n) % n, b = n;
    while (a !== 0) {
        while (a % 2 === 0) { a /= 2; if (b % 8 === 3 || b % 8 === 5) r = -r; }
        [a, b] = [b, a];
        if (a % 4 === 3 && b % 4 === 3) r = -r;
        a %= b;
    }
    return b === 1 ? r : 0;
}

/** ζ_k(2) for k = ℚ(√d): ζ(2) · L(2, χ_D) with L(2, χ_D) = |D|⁻² Σ_a χ_D(a) ζ(2, a/|D|). */
export function zeta2Quadratic(d) {
    const D = quadDisc(d), N = Math.abs(D);
    let L = 0;
    for (let a = 1; a < N; a++) { const c = kronecker(D, a); if (c) L += c * hurwitz2(a / N); }
    return (Math.PI * Math.PI / 6) * L / (N * N);
}

/** |D|^{3/2} ζ_k(2) / 4π²: the covolume of PSL₂(O_k), k = ℚ(√d) imaginary. */
export function bianchiUnit(d) {
    const N = Math.abs(quadDisc(d));
    return N ** 1.5 * zeta2Quadratic(d) / (4 * Math.PI * Math.PI);
}

/** x ≈ p/q with q ≤ maxDen (continued fractions), or null. */
export function recognizeRational(x, { maxDen = 20000, tol = 1e-8 } = {}) {
    if (!Number.isFinite(x)) return null;
    const sign = x < 0 ? -1 : 1;
    let y = Math.abs(x);
    let [p0, q0, p1, q1] = [0, 1, 1, 0];
    for (let i = 0; i < 40; i++) {
        const a = Math.floor(y);
        [p0, q0, p1, q1] = [p1, q1, a * p1 + p0, a * q1 + q0];
        if (q1 > maxDen) return null;
        if (Math.abs(sign * p1 / q1 - x) <= tol * Math.max(1, Math.abs(x))) return { p: sign * p1, q: q1 };
        const r = y - a;
        if (r < 1e-15) break;
        y = 1 / r;
    }
    return null;
}

/** V as a rational multiple of the Bianchi covolume of ℚ(√d): { p, q, unit } or null. */
export function zetaMultiple(V, d) {
    const unit = bianchiUnit(d);
    // chamber volumes are accurate to ~1e-15 (compact) and ~1e-11 (cusped); the denominators seen are ≤ 16
    const r = recognizeRational(V / unit, { maxDen: 2000, tol: 1e-10 });
    return r ? { ...r, unit } : { p: null, q: null, unit };
}

// ---------------- multiquadratic fields ----------------

const sqfreeProduct = (xs) => xs.reduce((s, x) => squarefree(s * x), 1);

/**
 * ℚ(√d₁, …, √d_r): an independent basis (chosen among the d_i), each d_i as
 * a subset of the basis, the degree, the number of complex places and the
 * discriminant (conductor–discriminant formula: the product of the
 * discriminants of the 2^s − 1 quadratic subfields).
 */
export function multiquadData(ds) {
    const basis = [];            // squarefree integers
    const echelon = [];          // { set: Set(primes, −1), mask, pivot }
    const support = (r) => { const s = new Set(); if (r < 0) s.add(-1); let n = Math.abs(r); for (let p = 2; p * p <= n; p++) while (n % p === 0) { s.add(p); n /= p; } if (n > 1) s.add(n); return s; };
    const reduce = (r) => {
        let cur = support(r), mask = 0;
        for (const row of echelon) if (cur.has(row.pivot)) { const c = new Set(cur); for (const x of row.set) { if (c.has(x)) c.delete(x); else c.add(x); } cur = c; mask ^= row.mask; }
        return { cur, mask };
    };
    const expr = [];
    for (const d0 of ds) {
        const d = squarefree(d0);
        const { cur, mask } = reduce(d);
        if (cur.size === 0) { expr.push(mask); continue; }
        const k = basis.length;
        basis.push(d);
        echelon.push({ set: cur, mask: mask ^ (1 << k), pivot: Math.max(...cur) });
        echelon.sort((a, b) => b.pivot - a.pivot);
        expr.push(1 << k);
    }
    const s = basis.length;
    let disc = 1n;
    for (let T = 1; T < (1 << s); T++) {
        const r = sqfreeProduct(basis.filter((_, j) => T & (1 << j)));
        disc *= BigInt(Math.abs(quadDisc(r)));
    }
    const totallyComplex = basis.some((b) => b < 0);
    const r2 = totallyComplex ? (1 << s) / 2 : 0;
    if (r2 % 2) disc = -disc;
    return { basis, expr, degree: 1 << s, s, r2, disc };
}

/** LaTeX for ℚ(√d₁, √d₂, …). */
export function multiquadTex(ds) {
    if (!ds.length) return '\\mathbb Q';
    return `\\mathbb Q(${ds.map((d) => (d === -1 ? 'i' : `\\sqrt{${d}}`)).join(',\\,')})`;
}

/**
 * The invariants of a hybrid in dimension 3.
 * classes: [{ d (squarefree discriminant of f_i), V (volume of the pieces of class i), label }]
 * surface: describeForm of the gluing surface's ternary form (kind 'fuchsian', algebra, ram).
 */
export function hybridInvariants(classes, surface) {
    const ds = classes.map((c) => c.d);
    const K = multiquadData(ds);
    // AΓ = A_g ⊗ kΓ
    let algebra = null;
    if (surface && surface.kind === 'fuchsian') {
        const ramP = (surface.ram || []).filter((p) => p !== Infinity);
        const survive = ramP.filter((p) => K.basis.every((b) => isSquareQp(b, p)));
        algebra = { a: surface.algebra, ramQ: ramP, ram: survive, split: survive.length === 0, primesAbove: K.degree };
    }
    // the volume at each complex place: sign patterns ε on the basis with ε₁ = +1
    const places = [];
    if (K.r2) {
        for (let e = 0; e < (1 << K.s); e++) {
            if (e & 1) continue;                               // ε on basis[0] is +1
            const eps = (mask) => { let x = 1; for (let j = 0; j < K.s; j++) if ((mask & (1 << j)) && (e & (1 << j))) x = -x; return x; };
            const signs = K.expr.map((mask) => eps(mask));
            const value = classes.reduce((s, c, i) => s + signs[i] * c.V, 0);
            places.push({ signs, value });
        }
    }
    const zeta = classes.map((c) => zetaMultiple(c.V, c.d));
    return { field: K, ds, algebra, places, zeta };
}

// ---------------- volumes as zeta values ----------------
//
// In dimension 3 a volume V commensurable with O′(f, ℤ), k = ℚ(√d), is q · |D|^{3/2} ζ_k(2)/4π² with
// q rational. Writing |D| = s² r with r squarefree, that is c · √r · ζ_k(2)/π² with c = q·|D|·s/4.
// For k = ℚ(i), ζ_k(2) = ζ(2)·G = π²G/6 (G Catalan's constant), so V = (c/6)·G as well.

const gcdN = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const reduce = (p, q) => { if (q < 0) { p = -p; q = -q; } const g = gcdN(p, q) || 1; return { p: p / g, q: q / g }; };

/** V as c·√r·ζ_k(2)/π² for k = ℚ(√d): { p, q, r, d }, or null when V is not recognized. */
export function zetaTerm(V, d) {
    if (!(d < 0) || !Number.isFinite(V) || V === 0) return null;
    const z = zetaMultiple(Math.abs(V), d);
    if (z.p === null) return null;
    const N = Math.abs(quadDisc(d));
    let s = 1, r = N;
    for (let t = 2; t * t <= r; t++) while (r % (t * t) === 0) { r /= t * t; s *= t; }
    const c = reduce((V < 0 ? -1 : 1) * z.p * N * s, z.q * 4);
    return { p: c.p, q: c.q, r, d };
}

/** The sum of terms (combining equal fields) as TeX, or null if some term is unknown; zero terms drop out. */
export function zetaTex(terms) {
    if (!terms.length || terms.some((t) => !t)) return null;
    const by = new Map();
    for (const t of terms) {
        const o = by.get(t.d);
        if (o) { const s = reduce(o.p * t.q + t.p * o.q, o.q * t.q); o.p = s.p; o.q = s.q; } else by.set(t.d, { ...t });
    }
    const parts = [];
    for (const t of by.values()) {
        if (t.p === 0) continue;
        const K = t.d === -1 ? '\\mathbb Q(i)' : `\\mathbb Q(\\sqrt{${t.d}})`;
        const a = Math.abs(t.p);
        const num = `${a === 1 && t.r > 1 ? '' : a === 1 ? '' : a}${t.r > 1 ? `\\sqrt{${t.r}}` : ''}`;
        const body = `\\frac{${num ? num + '\\,' : ''}\\zeta_{${K}}(2)}{${t.q === 1 ? '' : t.q}\\pi^2}`;
        parts.push((t.p < 0 ? (parts.length ? ' - ' : '-') : (parts.length ? ' + ' : '')) + body);
    }
    return parts.length ? parts.join('') : '0';
}

/** For a single ℚ(i) term: the same volume as a multiple of Catalan's constant G. */
export function catalanTex(t) {
    if (!t || t.d !== -1 || t.r !== 1) return null;
    const c = reduce(t.p, t.q * 6);
    const a = Math.abs(c.p);
    return `${c.p < 0 ? '-' : ''}${c.q === 1 ? (a === 1 ? '' : a) : `\\tfrac{${a}}{${c.q}}`}\\,G`;
}
