// The exact engine over K = ℚ(i) or ℚ(ω): elements a + bθ with a, b ∈ ℚ, Laurent polynomials in
// π = 1/t over K, and the tree of K((π)) with its action — the same code as over ℚ
// (laurent.js, treeAction.js), run over K. Labels are elements of K, or INF.
import { Q } from './rational.js';
import { makeLaurent, toPoly } from './laurent.js';
import { makeTree } from './treeAction.js';
import { parseRat } from './polyParse.js';
import { polyMatrixField } from './poly.js';
import { FIELDS, gcd as kgcd, divmod, normalize, cuspOf, cuspName } from './fieldK.js';

const SQ3 = Math.sqrt(3);
const blcm = (a, b) => { let x = a, y = b; while (y) [x, y] = [y, x % y]; return a / x * b; };

export function makeKEngine(id) {
    const K = FIELDS[id], isI = id === 'i';

    class KE {
        constructor(a, b) { this.a = a; this.b = b; }
        add(o) { return new KE(this.a.add(o.a), this.b.add(o.b)); }
        sub(o) { return new KE(this.a.sub(o.a), this.b.sub(o.b)); }
        neg() { return new KE(this.a.neg(), this.b.neg()); }
        mul(o) {
            const bd = this.b.mul(o.b), cross = this.a.mul(o.b).add(this.b.mul(o.a));
            return new KE(this.a.mul(o.a).sub(bd), isI ? cross : cross.sub(bd));   // θ² = −1 or −1 − θ
        }
        conj() { return isI ? new KE(this.a, this.b.neg()) : new KE(this.a.sub(this.b), this.b.neg()); }
        norm() { return this.mul(this.conj()).a; }
        inv() { const n = this.norm().inv(), c = this.conj(); return new KE(c.a.mul(n), c.b.mul(n)); }
        div(o) { return this.mul(o.inv()); }
        isZero() { return this.a.isZero() && this.b.isZero(); }
        isOne() { return this.a.isOne() && this.b.isZero(); }
        eq(o) { return this.a.eq(o.a) && this.b.eq(o.b); }
        toC() { const x = this.a.toNumber(), y = this.b.toNumber(); return isI ? [x, y] : [x - y / 2, y * SQ3 / 2]; }
        key() { return `${this.a}|${this.b}`; }
    }
    KE.ZERO = new KE(Q.ZERO, Q.ZERO);
    KE.ONE = new KE(Q.ONE, Q.ZERO);
    KE.THETA = new KE(Q.ZERO, Q.ONE);
    KE.of = ([a, b]) => new KE(Q.int(a), Q.int(b));       // an integer a + bθ

    const { L, IDENTITY } = makeLaurent(KE.ZERO, KE.ONE);
    const INF = { inf: true };
    const tree = makeTree({
        L, IDENTITY, one: KE.ONE, INF, isInf: (w) => !!w.inf, value: (w) => w, toLabel: (x) => x,
        labelKey: (w) => (w.inf ? '∞' : w.key()),
    });
    const field = { zero: KE.ZERO, one: KE.ONE, fromQ: (q) => new KE(q, Q.ZERO), theta: KE.THETA, thetaTok: id,
        intOf: (x) => (x.b.isZero() && x.a.d === 1n ? x.a.n : null) };

    // The cusp of fieldK.js (reduced p/q in O_K up to units: Ford size, position) of a label, and back.
    const cusps = new Map();
    function cuspOfLabel(w) {
        if (w.inf) return cuspOf(K, [1, 0], [0, 0]);
        const k = w.key();
        if (cusps.has(k)) return cusps.get(k);
        const d = blcm(w.a.d, w.b.d);
        const p0 = [Number(w.a.n * (d / w.a.d)), Number(w.b.n * (d / w.b.d))], q0 = [Number(d), 0];
        const gg = kgcd(K, p0, q0);
        const [p, q] = normalize(K, divmod(K, p0, gg)[0], divmod(K, q0, gg)[0]);
        const c = cuspOf(K, p, q);
        if (cusps.size > 100000) cusps.clear();
        cusps.set(k, c);
        return c;
    }
    const labelOfCusp = (c) => (!c.q[0] && !c.q[1] ? INF : KE.of(c.p).div(KE.of(c.q)));
    const name = (w) => cuspName(K, cuspOfLabel(w));

    // A matrix entry of K(t); a generator, cleared of denominators within PGL₂(K(t)).
    const parse = (src) => parseRat(src, field);
    const matrixOf = (rats) => polyMatrixField(rats, KE.ONE).map(L.fromPoly);
    const normalizePGL = (A) => matrixOf(A.map((x) => ({ num: toPoly(x), den: [KE.ONE] })));
    // floating point, scaled into SL₂(ℂ): [[re, im] × 4]
    const toComplex = (h) => h.map((x) => x.toC());

    function coefTex(c) {
        const ra = c.a.isZero() ? '' : c.a.toString(), rb = c.b.isZero() ? '' : c.b.toString();
        const sym = isI ? 'i' : '\\omega';
        const bt = rb === '1' ? sym : rb === '-1' ? `-${sym}` : rb ? `${rb.replace(/^(-?)(\d+)\/(\d+)$/, '$1\\tfrac{$2}{$3}')}${sym}` : '';
        const at = ra.replace(/^(-?)(\d+)\/(\d+)$/, '$1\\tfrac{$2}{$3}');
        if (!bt) return at || '0';
        if (!at) return bt;
        return `(${at}${bt.startsWith('-') ? '' : '+'}${bt})`;
    }
    function polyTex(a) {
        const terms = [];
        for (let k = a.length - 1; k >= 0; k--) {
            const c = a[k];
            if (!c || c.isZero()) continue;
            const mono = k === 0 ? '' : k === 1 ? 't' : `t^{${k}}`;
            let body = coefTex(c);
            if (mono && body === '1') body = '';
            else if (mono && body === '-1') body = '-';
            terms.push(body + mono);
        }
        if (!terms.length) return '0';
        return terms.map((t, i) => (i === 0 ? t : t.startsWith('-') ? ` - ${t.slice(1)}` : ` + ${t}`)).join('');
    }
    const lTex = (x) => { const a = toPoly(x); return a ? polyTex(a) : '?'; };

    return { K, KE, L, IDENTITY, INF, field, tree, cuspOfLabel, labelOfCusp, name, parse, matrixOf, normalizePGL, toComplex, lTex };
}
