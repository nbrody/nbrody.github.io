/**
 * nffield.js — build a single-generator number field ℚ(α) from an algebraic "atom"
 * appearing in matrix entries: √d  or  2cos(π/q). Returns the NumberField, the chosen
 * real embedding (a root of the minimal polynomial), and the atom's value as an NFElement.
 */
import { BigRational } from './rational.js';
import { QPolynomial } from './polynomial.js';
import { NumberField } from './numberField.js';

const Q = n => new BigRational(BigInt(n));
function igcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

/** Integer-coefficient minimal polynomial of 2cos(π/q), with the real embedding 2cos(π/q). */
export function minpoly2cos(q) {
    // conjugates: distinct values 2cos(π j / q) for 1≤j<2q, gcd(j,2q)=1
    const seen = new Set(), roots = [];
    for (let j = 1; j < 2 * q; j++) {
        if (igcd(j, 2 * q) !== 1) continue;
        const v = 2 * Math.cos(Math.PI * j / q), key = v.toFixed(7);
        if (!seen.has(key)) { seen.add(key); roots.push(v); }
    }
    // monic ∏(x − root), coefficients low→high, rounded to integers
    let p = [1];
    for (const r of roots) {
        const np = new Array(p.length + 1).fill(0);
        for (let i = 0; i < p.length; i++) { np[i] += -r * p[i]; np[i + 1] += p[i]; }
        p = np;
    }
    const coeffs = p.map(c => Q(Math.round(c)));
    return { poly: new QPolynomial(coeffs), embed: 2 * Math.cos(Math.PI / q), degree: roots.length };
}

/** ℚ(√D) with D the squarefree part of d; returns the multiplier k so √d = k·√D. */
export function sqrtData(d) {
    if (d <= 0) return null;
    let D = d, k = 1;
    for (let f = 2; f * f <= D; f++) { while (D % (f * f) === 0) { D /= f * f; k *= f; } }
    return { D, k };               // √d = k·√D
}

/**
 * Build the field for a detected atom.
 *   atom = { kind:'sqrt', d } | { kind:'cos2', q }
 * Returns { field, embed:{re,im}, alpha: NFElement (the generator), label }.
 */
export function buildField(atom) {
    let poly, embedVal, label;
    if (atom.kind === 'sqrt') {
        const { D } = sqrtData(atom.d);
        poly = new QPolynomial([Q(-D), Q(0), Q(1)]);   // x² − D
        embedVal = Math.sqrt(D);
        label = `ℚ(√${D})`;
    } else if (atom.kind === 'cos2') {
        const mp = minpoly2cos(atom.q);
        poly = mp.poly; embedVal = mp.embed;
        label = `ℚ(2cos(π/${atom.q}))`;
    } else throw new Error('unknown atom');

    const field = new NumberField(poly, 'α');
    // pick the real root closest to the intended embedding value
    let embed = null, best = Infinity;
    for (const r of field.roots()) {
        if (Math.abs(r.im) > 1e-7) continue;
        const dd = Math.abs(r.re - embedVal);
        if (dd < best) { best = dd; embed = r; }
    }
    if (!embed) throw new Error('no real embedding found');
    return { field, embed, alpha: field.generator(), label, degree: field.degree() };
}
