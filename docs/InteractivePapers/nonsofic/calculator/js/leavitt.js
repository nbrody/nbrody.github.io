'use strict';
/* Exact arithmetic in the binary Leavitt algebra R = L_{F2}(1,2).
 *
 * Every element is an F2-linear combination of monomials s_a t_b, where a, b
 * are finite binary words ('' = empty word). We store an element as a
 * Map key -> {a, b} with key = a + '|' + b; since coefficients live in F2,
 * inserting an existing key deletes it (XOR).
 *
 * Monomials with a fixed |b| are linearly independent (R acts faithfully on
 * the vector space with basis e_omega, omega an infinite binary string), and
 * s_a t_b = s_{a0} t_{b0} + s_{a1} t_{b1}. Canonical form: no monomial lies
 * strictly below another (below = append the same word to both coordinates)
 * and no sibling pair (a0,b0),(a1,b1) remains unmerged. This normal form is
 * unique, so equality testing is set equality of canonical forms.
 *
 * Trace entries (for animation): {type:'subdivide', p, into:[c0,c1]},
 * {type:'cancel', p}, {type:'merge', from:[p,sib], into:par}.
 */
const Leavitt = (() => {

    const key = m => m.a + '|' + m.b;
    const mono = (a, b) => ({ a, b });
    const children = p => [mono(p.a + '0', p.b + '0'), mono(p.a + '1', p.b + '1')];

    function xor(el, p, trace) {
        const k = key(p);
        if (el.has(k)) { el.delete(k); if (trace) trace.push({ type: 'cancel', p }); }
        else el.set(k, { a: p.a, b: p.b });
    }
    const make = (pairs, trace) => { const el = new Map(); for (const p of pairs) xor(el, p, trace); return el; };

    // q strictly below p iff q = (p.a w, p.b w) with w nonempty
    function isBelow(q, p) {
        if (!q.a.startsWith(p.a) || !q.b.startsWith(p.b)) return false;
        const wa = q.a.slice(p.a.length), wb = q.b.slice(p.b.length);
        return wa === wb && wa.length > 0;
    }
    function findConflict(el) {
        const v = [...el.values()];
        for (const p of v) for (const q of v) if (p !== q && isBelow(q, p)) return p;
        return null;
    }
    function mergePass(el, trace) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const p of el.values()) {
                if (p.a.endsWith('0') && p.b.endsWith('0')) {
                    const sib = mono(p.a.slice(0, -1) + '1', p.b.slice(0, -1) + '1');
                    if (el.has(key(sib))) {
                        const par = mono(p.a.slice(0, -1), p.b.slice(0, -1));
                        el.delete(key(p)); el.delete(key(sib));
                        if (trace) trace.push({ type: 'merge', from: [p, sib], into: par });
                        xor(el, par, trace);
                        changed = true; break;
                    }
                }
            }
        }
        return el;
    }

    function canonicalize(elIn, trace) {
        // Lazy conflict-directed subdivision (produces compact animation traces).
        let el = new Map();
        for (const p of elIn.values()) xor(el, p);
        let guard = 0, p;
        while ((p = findConflict(el))) {
            if (++guard > 4000) { el = null; break; }
            el.delete(key(p));
            if (trace) trace.push({ type: 'subdivide', p, into: children(p) });
            for (const c of children(p)) xor(el, c, trace);
        }
        if (el) return mergePass(el, trace);
        // Fallback (pathological inputs): uniform expansion in the b-coordinate,
        // which is provably canonical, without a trace.
        let N = 0;
        for (const q of elIn.values()) N = Math.max(N, q.b.length);
        const flat = new Map();
        const expand = (q, d) => {
            if (d <= 0) { xor(flat, q); return; }
            for (const c of children(q)) expand(c, d - 1);
        };
        for (const q of elIn.values()) expand(q, N - q.b.length);
        return mergePass(flat, null);
    }

    // (s_{p.a} t_{p.b})(s_{q.a} t_{q.b}) : match p.b against q.a
    function mulMono(p, q) {
        if (q.a.startsWith(p.b)) return mono(p.a + q.a.slice(p.b.length), q.b);
        if (p.b.startsWith(q.a)) return mono(p.a, q.b + p.b.slice(q.a.length));
        return null;
    }
    // traces (optional): {pairs: [], canon: []}
    function mul(X, Y, traces) {
        const raw = [];
        for (const p of X.values()) for (const q of Y.values()) {
            const r = mulMono(p, q);
            if (traces) traces.pairs.push({ p, q, r });
            if (r) raw.push(r);
        }
        const el = make(raw, traces && traces.canon);
        return canonicalize(el, traces && traces.canon);
    }
    function add(X, Y, traces) {
        const el = make([...X.values(), ...Y.values()], traces && traces.canon);
        return canonicalize(el, traces && traces.canon);
    }
    const transpose = X => make([...X.values()].map(p => mono(p.b, p.a)));
    function pow(X, n) {
        let r = make([mono('', '')]);
        for (let i = 0; i < n; i++) r = mul(r, X);
        return r;
    }
    const isZero = X => canonicalize(X).size === 0;
    function equalsOne(X) { const c = canonicalize(X); return c.size === 1 && c.has('|'); }
    function equals(X, Y) {
        const a = canonicalize(X), b = canonicalize(Y);
        if (a.size !== b.size) return false;
        for (const k of a.keys()) if (!b.has(k)) return false;
        return true;
    }

    // ---- parsing --------------------------------------------------------
    // Syntax: s<word>, t<word>, e<word> (= s_w t_w), 1, 0, +, juxtaposition
    // or * for products, ^n for powers, parentheses. Whitespace/underscores
    // ignored. Sums are NOT auto-canonicalized (so reductions can be animated);
    // products are.
    function parse(str) {
        const s = String(str).replace(/\s+|_/g, '').replace(/[·×]/g, '*');
        let i = 0;
        const err = msg => { throw new Error(msg + ' (position ' + (i + 1) + ')'); };
        const word = () => { let w = ''; while (s[i] === '0' || s[i] === '1') w += s[i++]; return w; };

        function atom() {
            const c = s[i];
            if (c === '(') {
                i++; const e = expr();
                if (s[i] !== ')') err('expected )');
                i++; return e;
            }
            if (c === '1') { i++; return make([mono('', '')]); }
            if (c === '0') { i++; return make([]); }
            if (c === 's') { i++; return make([mono(word(), '')]); }
            if (c === 't') { i++; return make([mono('', word())]); }
            if (c === 'e') { i++; const w = word(); return make([mono(w, w)]); }
            err(c === undefined ? 'unexpected end of input' : "unexpected '" + c + "'");
        }
        function factor() {
            let e = atom();
            while (s[i] === '^') {
                i++; let n = '';
                while (/[0-9]/.test(s[i])) n += s[i++];
                if (!n) err('expected exponent');
                e = pow(e, parseInt(n, 10));
            }
            return e;
        }
        function term() {
            let e = factor();
            for (;;) {
                if (s[i] === '*') { i++; e = mul(e, factor()); }
                else if (s[i] === '(' || 'ste10'.includes(s[i] || '#')) e = mul(e, factor());
                else break;
            }
            return e;
        }
        function expr() {
            let e = term();
            while (s[i] === '+') { i++; e = make([...e.values(), ...term().values()]); }
            return e;
        }
        if (!s.length) return make([]);
        const e = expr();
        if (i < s.length) err('unexpected trailing input');
        return e;
    }

    // ---- display --------------------------------------------------------
    const sortPairs = el => [...el.values()].sort((x, y) =>
        (x.a.length + x.b.length) - (y.a.length + y.b.length) ||
        (x.a + '|' + x.b).localeCompare(y.a + '|' + y.b));
    function monoHTML(p) {
        if (p.a === '' && p.b === '') return '1';
        if (p.a === p.b) return 'e<sub>' + p.a + '</sub>';
        return (p.a ? 's<sub>' + p.a + '</sub>' : '') + (p.b ? 't<sub>' + p.b + '</sub>' : '');
    }
    const toHTML = el => el.size ? sortPairs(el).map(monoHTML).join(' + ') : '0';
    const toSyntax = el => el.size ? sortPairs(el).map(p =>
        (p.a === '' && p.b === '') ? '1' :
        (p.a === p.b ? 'e' + p.a : (p.a ? 's' + p.a : '') + (p.b ? 't' + p.b : ''))).join(' + ') : '0';

    return { mono, key, make, xor, children, canonicalize, mulMono, mul, add,
             transpose, pow, isZero, equalsOne, equals, parse,
             sortPairs, monoHTML, toHTML, toSyntax };
})();
