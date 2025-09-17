// ========================= Utility: Monomial Orders =========================
class MonomialOrder {
        // compare(a, b) should return: 1 if a>b, -1 if a<b, 0 if equal
        static lex(a, b) {
                const k = a.length;
                for (let i = 0; i < k; i++) {
                        if (a[i] > b[i]) return 1; if (a[i] < b[i]) return -1;
                }
                return 0;
        }
        static grlex(a, b) {
                const da = Monomial.deg(a), db = Monomial.deg(b);
                if (da > db) return 1; if (da < db) return -1;
                return MonomialOrder.lex(a, b);
        }
        static grevlex(a, b) {
                const da = Monomial.deg(a), db = Monomial.deg(b);
                if (da > db) return 1; if (da < db) return -1;
                const k = a.length;
                for (let i = k - 1; i >= 0; i--) {
                        if (a[i] > b[i]) return -1; if (a[i] < b[i]) return 1; // reverse
                }
                return 0;
        }
}

// ========================= Monomial helpers =========================
class Monomial {
        // Monomials are arrays of nonnegative integers (Number). Length is fixed = k.
        static key(expv) { return expv.join(","); }
        static fromKey(key) { return key.split(",").map(x => Number(x)); }
        static deg(expv) { return expv.reduce((s, e) => s + e, 0); }
        static mul(a, b) { return a.map((ai, i) => ai + b[i]); }
        static divides(a, b) { // does x^a | x^b ?
                for (let i = 0; i < a.length; i++) if (a[i] > b[i]) return false; return true;
        }
        static lcm(a, b) { return a.map((ai, i) => Math.max(ai, b[i])); }
        static cmp(a, b, order) { return order(a, b); }
}

// ================ Polynomial over Z (coeffs are BigInt) =====================
class ZZPolynomial {
        // terms: Map<string, BigInt>, where key is monomial key "n1,n2,...,nk"
        constructor(k, terms = new Map()) {
                this.k = k; // number of variables
                this.terms = new Map();
                // normalize on construction
                for (const [key, c] of terms) {
                        const coeff = ZZPolynomial._toBigInt(c);
                        if (coeff !== 0n) this.terms.set(key, coeff);
                }
        }

        static zero(k) { return new ZZPolynomial(k); }
        static monomial(k, expv, coeff = 1n) {
                const m = new Map();
                const c = ZZPolynomial._toBigInt(coeff);
                if (c !== 0n) m.set(Monomial.key(expv), c);
                return new ZZPolynomial(k, m);
        }

        clone() { return new ZZPolynomial(this.k, new Map(this.terms)); }
        isZero() { return this.terms.size === 0; }

        static _toBigInt(x) { return (typeof x === 'bigint') ? x : BigInt(x); }

        // Basic ops
        add(other) {
                this._assertSameRing(other);
                const out = new Map(this.terms);
                for (const [key, c] of other.terms) {
                        const s = (out.get(key) ?? 0n) + c;
                        if (s === 0n) out.delete(key); else out.set(key, s);
                }
                return new ZZPolynomial(this.k, out);
        }

        neg() {
                const out = new Map();
                for (const [key, c] of this.terms) out.set(key, -c);
                return new ZZPolynomial(this.k, out);
        }

        sub(other) { return this.add(other.neg()); }

        mulScalar(s) {
                const S = ZZPolynomial._toBigInt(s);
                if (S === 0n) return ZZPolynomial.zero(this.k);
                const out = new Map();
                for (const [key, c] of this.terms) out.set(key, c * S);
                return new ZZPolynomial(this.k, out);
        }

        mulMonomial(expv, coeff = 1n) {
                const C = ZZPolynomial._toBigInt(coeff);
                if (C === 0n || this.isZero()) return ZZPolynomial.zero(this.k);
                const out = new Map();
                for (const [key, c] of this.terms) {
                        const e = Monomial.fromKey(key);
                        const eNew = Monomial.mul(e, expv);
                        out.set(Monomial.key(eNew), c * C);
                }
                return new ZZPolynomial(this.k, out);
        }

        mul(other) {
                this._assertSameRing(other);
                if (this.isZero() || other.isZero()) return ZZPolynomial.zero(this.k);
                const out = new Map();
                for (const [ka, ca] of this.terms) {
                        const ea = Monomial.fromKey(ka);
                        for (const [kb, cb] of other.terms) {
                                const eb = Monomial.fromKey(kb);
                                const e = Monomial.mul(ea, eb);
                                const k = Monomial.key(e);
                                const s = (out.get(k) ?? 0n) + ca * cb;
                                if (s === 0n) out.delete(k); else out.set(k, s);
                        }
                }
                return new ZZPolynomial(this.k, out);
        }

        // Leading data w.r.t. a given order
        leadingMonomial(order = MonomialOrder.grevlex) {
                if (this.isZero()) return null;
                let bestKey = null; let bestExp = null;
                for (const key of this.terms.keys()) {
                        const e = Monomial.fromKey(key);
                        if (!bestExp || Monomial.cmp(e, bestExp, order) > 0) {
                                bestExp = e; bestKey = key;
                        }
                }
                return bestKey ? { exp: bestExp, coeff: this.terms.get(bestKey) } : null;
        }

        degree() {
                let d = -Infinity; if (this.isZero()) return -Infinity;
                for (const key of this.terms.keys()) d = Math.max(d, Monomial.deg(Monomial.fromKey(key)));
                return d;
        }

        // Evaluation at integers (sub is array of BigInt or Number length k)
        evaluate(sub) {
                if (sub.length !== this.k) throw new Error("Substitution length mismatch");
                const vals = sub.map(v => (typeof v === 'bigint') ? v : BigInt(v));
                let acc = 0n;
                for (const [key, c] of this.terms) {
                        const e = Monomial.fromKey(key);
                        let mon = 1n;
                        for (let i = 0; i < this.k; i++) {
                                if (e[i] !== 0) mon *= ZZPolynomial._pow(vals[i], e[i]);
                        }
                        acc += c * mon;
                }
                return acc; // BigInt
        }

        static _pow(base, exp) {
                // base: BigInt, exp: Number >= 0
                let b = base; let e = exp; let r = 1n;
                while (e > 0) { if (e & 1) r *= b; b *= b; e >>= 1; }
                return r;
        }

        // Iteration helpers
        *termsIter() { for (const [k, c] of this.terms) yield { exp: Monomial.fromKey(k), coeff: c }; }

        // Human-readable
        toString(vars = null, order = MonomialOrder.grevlex) {
                if (this.isZero()) return "0";
                const names = vars ?? Array.from({ length: this.k }, (_, i) => `x${i + 1}`);
                const items = Array.from(this.termsIter());
                items.sort((A, B) => -Monomial.cmp(A.exp, B.exp, order)); // descending
                const fmtMon = (exp) => {
                        const parts = [];
                        for (let i = 0; i < this.k; i++) {
                                const e = exp[i]; if (e === 0) continue;
                                parts.push(e === 1 ? names[i] : `${names[i]}^${e}`);
                        }
                        return parts.length ? parts.join("*") : "1";
                };
                const pieces = [];
                for (const { exp, coeff } of items) {
                        const sign = coeff < 0n ? "-" : "+";
                        const abs = coeff < 0n ? -coeff : coeff;
                        const mon = fmtMon(exp);
                        const piece = (mon === "1") ? `${abs}` : (abs === 1n ? `${mon}` : `${abs}*${mon}`);
                        pieces.push({ sign, piece });
                }
                // First term keeps its sign only if negative
                let s = pieces[0].sign === '-' ? '-' : '';
                s += pieces[0].piece;
                for (let i = 1; i < pieces.length; i++) s += ` ${pieces[i].sign} ${pieces[i].piece}`;
                return s;
        }

        _assertSameRing(other) {
                if (this.k !== other.k) throw new Error("Ring mismatch: different number of variables");
        }
}

// ========================= Polynomial Ring Factory =========================
class PolynomialRingZ {
        constructor(k, order = 'grevlex', varNames = null) {
                if (!(k > 0 && Number.isInteger(k))) throw new Error("k must be a positive integer");
                this.k = k;
                this.orderName = order;
                this.order = (order === 'lex') ? MonomialOrder.lex : (order === 'grlex') ? MonomialOrder.grlex : MonomialOrder.grevlex;
                this.vars = varNames ?? Array.from({ length: k }, (_, i) => `x${i + 1}`);
        }

        zero() { return ZZPolynomial.zero(this.k); }
        one() { return ZZPolynomial.monomial(this.k, new Array(this.k).fill(0), 1n); }
        mon(expv, c = 1n) { if (expv.length !== this.k) throw new Error("expv length mismatch"); return ZZPolynomial.monomial(this.k, expv, c); }

        // Build from a list of terms: [{exp:[...], coeff:...}, ...]
        fromTerms(termsArr) {
                const m = new Map();
                for (const t of termsArr) {
                        if (!t || !Array.isArray(t.exp) || t.exp.length !== this.k) throw new Error("Bad term");
                        const key = Monomial.key(t.exp);
                        const c = (typeof t.coeff === 'bigint') ? t.coeff : BigInt(t.coeff);
                        const s = (m.get(key) ?? 0n) + c;
                        if (s === 0n) m.delete(key); else m.set(key, s);
                }
                return new ZZPolynomial(this.k, m);
        }

        // Parse from a simple object: {"n1,n2,...": coeff, ...}
        fromObject(obj) {
                const m = new Map();
                for (const [k, v] of Object.entries(obj)) {
                        const exp = Monomial.fromKey(k);
                        if (exp.length !== this.k) throw new Error("Key has wrong length");
                        const c = (typeof v === 'bigint') ? v : BigInt(v);
                        if (c !== 0n) m.set(k, c);
                }
                return new ZZPolynomial(this.k, m);
        }
}

// // ================================ Demo =====================================
// (function demo() {
//         const R = new PolynomialRingZ(3, 'grevlex', ['x', 'y', 'z']);
//         const f = R.fromTerms([
//                 { exp: [2, 0, 1], coeff: 3n },   // 3 x^2 z
//                 { exp: [0, 1, 0], coeff: -5n },  // -5 y
//                 { exp: [0, 0, 0], coeff: 7n },   // + 7
//         ]);
//         const g = R.fromTerms([
//                 { exp: [1, 0, 0], coeff: 2n },   // 2 x
//                 { exp: [0, 1, 0], coeff: 1n },   // + y
//         ]);

//         const sum = f.add(g);
//         const prod = f.mul(g);
//         const val = f.evaluate([1n, 2n, 3n]);

//         console.log("Ring R = ZZ[x,y,z] (grevlex)");
//         console.log("f(x,y,z) =", f.toString(R.vars, R.order));
//         console.log("g(x,y,z) =", g.toString(R.vars, R.order));
//         console.log("f + g    =", sum.toString(R.vars, R.order));
//         console.log("f * g    =", prod.toString(R.vars, R.order));
//         console.log("f(1,2,3) =", val, "(BigInt)");

//         window.Rings = { MonomialOrder, Monomial, ZZPolynomial, PolynomialRingZ };
// })();