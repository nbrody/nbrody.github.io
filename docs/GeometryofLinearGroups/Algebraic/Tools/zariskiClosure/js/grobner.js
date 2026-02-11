/**
 * grobner.js — Multivariate Gröbner bases over Q using BigRational
 * Map-based sparse representation adapted from polynomialRings.js
 */

// ─── Monomial utilities (exponent vectors as arrays of Number) ───

const Mono = {
    key:     (e) => e.join(','),
    fromKey: (k) => k.split(',').map(Number),
    deg:     (e) => e.reduce((s, x) => s + x, 0),
    mul:     (a, b) => a.map((ai, i) => ai + (b[i] || 0)),
    divides: (a, b) => a.every((ai, i) => ai <= (b[i] || 0)),
    div:     (a, b) => a.map((ai, i) => ai - (b[i] || 0)),
    lcm:     (a, b) => a.map((ai, i) => Math.max(ai, b[i] || 0)),
    isZero:  (e) => e.every(x => x === 0),
    pad:     (e, n) => { while (e.length < n) e.push(0); return e; }
};

// ─── Monomial orderings ───

const MOrder = {
    lex(a, b) {
        for (let i = 0; i < a.length; i++) {
            if ((a[i] || 0) > (b[i] || 0)) return 1;
            if ((a[i] || 0) < (b[i] || 0)) return -1;
        }
        return 0;
    },
    grlex(a, b) {
        const da = Mono.deg(a), db = Mono.deg(b);
        if (da > db) return 1; if (da < db) return -1;
        return MOrder.lex(a, b);
    },
    grevlex(a, b) {
        const da = Mono.deg(a), db = Mono.deg(b);
        if (da > db) return 1; if (da < db) return -1;
        for (let i = a.length - 1; i >= 0; i--) {
            if ((a[i] || 0) < (b[i] || 0)) return 1;
            if ((a[i] || 0) > (b[i] || 0)) return -1;
        }
        return 0;
    },
    get(name) {
        return MOrder[name] || MOrder.grevlex;
    }
};

// ─── QMvPoly: multivariate polynomial over Q ───

class QMvPoly {
    constructor(k, terms = new Map()) {
        this.k = k; // number of variables
        this.terms = new Map();
        for (const [key, c] of terms) {
            const coeff = c instanceof BigRational ? c : BigRational.fromInt(c);
            if (!coeff.isZero()) this.terms.set(key, coeff);
        }
    }

    static zero(k) { return new QMvPoly(k); }

    static monomial(k, expv, coeff) {
        if (!(coeff instanceof BigRational)) coeff = BigRational.fromInt(coeff);
        if (coeff.isZero()) return QMvPoly.zero(k);
        const m = new Map();
        m.set(Mono.key(Mono.pad(expv, k)), coeff);
        return new QMvPoly(k, m);
    }

    static fromConstant(k, c) {
        return QMvPoly.monomial(k, new Array(k).fill(0), c);
    }

    clone() { return new QMvPoly(this.k, new Map(this.terms)); }
    isZero() { return this.terms.size === 0; }

    add(other) {
        const k = Math.max(this.k, other.k);
        const out = new Map(this.terms);
        for (const [key, c] of other.terms) {
            const s = (out.get(key) || BigRational.ZERO).add(c);
            if (s.isZero()) out.delete(key); else out.set(key, s);
        }
        return new QMvPoly(k, out);
    }

    sub(other) {
        const k = Math.max(this.k, other.k);
        const out = new Map(this.terms);
        for (const [key, c] of other.terms) {
            const s = (out.get(key) || BigRational.ZERO).sub(c);
            if (s.isZero()) out.delete(key); else out.set(key, s);
        }
        return new QMvPoly(k, out);
    }

    neg() {
        const out = new Map();
        for (const [key, c] of this.terms) out.set(key, c.neg());
        return new QMvPoly(this.k, out);
    }

    scale(r) {
        if (!(r instanceof BigRational)) r = BigRational.fromInt(r);
        if (r.isZero()) return QMvPoly.zero(this.k);
        const out = new Map();
        for (const [key, c] of this.terms) out.set(key, c.mul(r));
        return new QMvPoly(this.k, out);
    }

    mulMonomial(expv, coeff) {
        if (!(coeff instanceof BigRational)) coeff = BigRational.fromInt(coeff);
        if (coeff.isZero() || this.isZero()) return QMvPoly.zero(this.k);
        const out = new Map();
        for (const [key, c] of this.terms) {
            const e = Mono.fromKey(key);
            const newE = Mono.mul(Mono.pad(e, this.k), Mono.pad(expv, this.k));
            out.set(Mono.key(newE), c.mul(coeff));
        }
        return new QMvPoly(this.k, out);
    }

    mul(other) {
        if (this.isZero() || other.isZero()) return QMvPoly.zero(Math.max(this.k, other.k));
        const k = Math.max(this.k, other.k);
        const out = new Map();
        for (const [k1, c1] of this.terms) {
            const e1 = Mono.pad(Mono.fromKey(k1), k);
            for (const [k2, c2] of other.terms) {
                const e2 = Mono.pad(Mono.fromKey(k2), k);
                const key = Mono.key(Mono.mul(e1, e2));
                const s = (out.get(key) || BigRational.ZERO).add(c1.mul(c2));
                if (s.isZero()) out.delete(key); else out.set(key, s);
            }
        }
        return new QMvPoly(k, out);
    }

    // Leading term under given ordering
    leadingTerm(order) {
        if (this.isZero()) return null;
        const cmp = MOrder.get(order);
        let bestKey = null, bestExp = null;
        for (const key of this.terms.keys()) {
            const e = Mono.fromKey(key);
            if (!bestExp || cmp(e, bestExp) > 0) {
                bestKey = key;
                bestExp = e;
            }
        }
        return { key: bestKey, exp: bestExp, coeff: this.terms.get(bestKey) };
    }

    leadingMonomial(order) {
        const lt = this.leadingTerm(order);
        return lt ? lt.exp : null;
    }

    leadingCoeff(order) {
        const lt = this.leadingTerm(order);
        return lt ? lt.coeff : BigRational.ZERO;
    }

    // Make monic (divide by leading coefficient)
    makeMonic(order) {
        const lc = this.leadingCoeff(order);
        if (lc.isZero() || lc.isOne()) return this.clone();
        return this.scale(lc.inv());
    }

    // Division algorithm: f / {g1, ..., gm}
    // Returns { quotients, remainder }
    static divide(f, G, order) {
        const cmp = MOrder.get(order);
        let r = QMvPoly.zero(f.k);
        let p = f.clone();
        const quotients = G.map(() => QMvPoly.zero(f.k));

        while (!p.isZero()) {
            let divided = false;
            const lt_p = p.leadingTerm(order);

            for (let i = 0; i < G.length; i++) {
                const lt_g = G[i].leadingTerm(order);
                if (!lt_g) continue;

                if (Mono.divides(lt_g.exp, lt_p.exp)) {
                    const expDiff = Mono.div(lt_p.exp, lt_g.exp);
                    const coeffRatio = lt_p.coeff.div(lt_g.coeff);
                    quotients[i] = quotients[i].add(
                        QMvPoly.monomial(f.k, expDiff, coeffRatio)
                    );
                    p = p.sub(G[i].mulMonomial(expDiff, coeffRatio));
                    divided = true;
                    break;
                }
            }

            if (!divided) {
                // Move leading term of p to remainder
                r = r.add(QMvPoly.monomial(f.k, lt_p.exp, lt_p.coeff));
                p.terms.delete(lt_p.key);
            }
        }

        return { quotients, remainder: r };
    }

    // Convert to LaTeX
    toLatex(varNames) {
        if (this.isZero()) return '0';
        // Sort terms by lex order (descending)
        const entries = [...this.terms.entries()].map(([key, coeff]) => ({
            exp: Mono.fromKey(key), coeff, key
        }));
        entries.sort((a, b) => MOrder.lex(b.exp, a.exp));

        const parts = [];
        for (let i = 0; i < entries.length; i++) {
            const { exp, coeff } = entries[i];
            const isConst = Mono.isZero(exp);

            let mon = '';
            for (let j = 0; j < exp.length; j++) {
                if (exp[j] === 0) continue;
                const v = varNames ? varNames[j] : `x_{${j + 1}}`;
                mon += exp[j] === 1 ? v : `${v}^{${exp[j]}}`;
            }

            let term = '';
            if (isConst) {
                term = coeff.toLatex();
            } else if (coeff.isOne()) {
                term = mon;
            } else if (coeff.equals(BigRational.MINUS_ONE)) {
                term = '-' + mon;
            } else if (coeff.isInteger()) {
                term = coeff.toString() + mon;
            } else {
                term = coeff.toLatex() + mon;
            }

            if (i > 0 && coeff.sign() > 0) parts.push(' + ' + term);
            else if (i > 0) parts.push(' ' + term);
            else parts.push(term);
        }

        return parts.join('') || '0';
    }

    toString(varNames) {
        if (this.isZero()) return '0';
        const entries = [...this.terms.entries()].map(([key, coeff]) => ({
            exp: Mono.fromKey(key), coeff
        }));
        entries.sort((a, b) => MOrder.lex(b.exp, a.exp));

        const parts = [];
        for (const { exp, coeff } of entries) {
            const isConst = Mono.isZero(exp);
            let mon = '';
            for (let j = 0; j < exp.length; j++) {
                if (exp[j] === 0) continue;
                const v = varNames ? varNames[j] : `x_${j + 1}`;
                if (mon) mon += '*';
                mon += exp[j] === 1 ? v : `${v}^${exp[j]}`;
            }
            let term = isConst ? coeff.toString()
                : coeff.isOne() ? mon
                : coeff.equals(BigRational.MINUS_ONE) ? '-' + mon
                : coeff.toString() + '*' + mon;
            if (parts.length > 0 && coeff.sign() > 0) parts.push('+ ' + term);
            else parts.push(term);
        }
        return parts.join(' ') || '0';
    }

    // Parse from string like "3*x_1^2 + 2*x_2 - 1"
    static parse(str, numVars = 0) {
        str = str.replace(/\s+/g, '').replace(/\*\*/g, '^');

        // Determine number of variables
        const varSet = new Set();
        const varPat = /x_(\d+)/g;
        let m;
        while ((m = varPat.exec(str)) !== null) varSet.add(parseInt(m[1]));
        const k = Math.max(numVars, varSet.size > 0 ? Math.max(...varSet) : 0);

        const terms = new Map();
        str = str.replace(/-/g, '+-');
        const parts = str.split('+').filter(s => s.length > 0);

        for (const part of parts) {
            const exp = new Array(k).fill(0);
            let coeff = BigRational.ONE;

            // Extract coefficient
            const coeffMatch = part.match(/^([+-]?\d+(?:\/\d+)?)/);
            if (coeffMatch) {
                const cs = coeffMatch[1];
                if (cs.includes('/')) {
                    const [n, d] = cs.split('/');
                    coeff = new BigRational(BigInt(parseInt(n)), BigInt(parseInt(d)));
                } else {
                    coeff = BigRational.fromInt(parseInt(cs));
                }
            } else if (part.startsWith('-')) {
                coeff = BigRational.MINUS_ONE;
            }

            // Extract variables
            const varMatches = part.matchAll(/x_(\d+)(\^(\d+))?/g);
            let hasVar = false;
            for (const vm of varMatches) {
                const idx = parseInt(vm[1]) - 1;
                const pow = vm[3] ? parseInt(vm[3]) : 1;
                if (idx < k) exp[idx] = pow;
                hasVar = true;
            }

            // If the term has no variables and no explicit coefficient, it might just be a number
            if (!hasVar && !coeffMatch && !part.startsWith('-')) {
                const val = parseInt(part);
                if (!isNaN(val)) coeff = BigRational.fromInt(val);
            }

            const key = Mono.key(exp);
            const existing = terms.get(key) || BigRational.ZERO;
            const sum = existing.add(coeff);
            if (sum.isZero()) terms.delete(key); else terms.set(key, sum);
        }

        return new QMvPoly(k, terms);
    }
}

// ─── S-polynomial ───

function sPolynomialQ(f, g, order) {
    const lt_f = f.leadingTerm(order);
    const lt_g = g.leadingTerm(order);
    if (!lt_f || !lt_g) return QMvPoly.zero(f.k);

    const lcmExp = Mono.lcm(lt_f.exp, lt_g.exp);
    const m1 = Mono.div(lcmExp, lt_f.exp);
    const m2 = Mono.div(lcmExp, lt_g.exp);

    const c1 = lt_g.coeff; // multiply f by lc(g)
    const c2 = lt_f.coeff; // multiply g by lc(f)

    return f.mulMonomial(m1, c1).sub(g.mulMonomial(m2, c2));
}

// ─── Buchberger's algorithm over Q ───

function buchbergerQ(F, order = 'grevlex', opts = {}) {
    const maxIter = opts.maxIterations || 500;
    let G = F.filter(f => !f.isZero()).map(f => f.makeMonic(order));

    const stats = { iterations: 0, sPolys: 0, reductions: 0, basisAdded: 0 };
    const pairs = [];

    for (let i = 0; i < G.length; i++) {
        for (let j = i + 1; j < G.length; j++) {
            pairs.push([i, j]);
        }
    }

    while (pairs.length > 0 && stats.iterations < maxIter) {
        stats.iterations++;
        const [i, j] = pairs.shift();
        if (i >= G.length || j >= G.length) continue;

        const spoly = sPolynomialQ(G[i], G[j], order);
        stats.sPolys++;

        const { remainder } = QMvPoly.divide(spoly, G, order);
        stats.reductions++;

        if (!remainder.isZero()) {
            const reduced = remainder.makeMonic(order);
            const newIdx = G.length;
            G.push(reduced);
            stats.basisAdded++;

            for (let k = 0; k < newIdx; k++) {
                pairs.push([k, newIdx]);
            }
        }
    }

    // Minimize: remove polynomials whose LT is divisible by another's LT
    G = _minimizeBasis(G, order);

    // Reduce: each poly fully reduced w.r.t. others
    G = _reduceBasis(G, order);

    return { basis: G, stats, order };
}

function _minimizeBasis(G, order) {
    const result = [];
    for (let i = 0; i < G.length; i++) {
        const lt_i = G[i].leadingMonomial(order);
        if (!lt_i) continue;
        let redundant = false;
        for (let j = 0; j < G.length; j++) {
            if (i === j) continue;
            const lt_j = G[j].leadingMonomial(order);
            if (!lt_j) continue;
            if (Mono.divides(lt_j, lt_i) && !Mono.divides(lt_i, lt_j)) {
                redundant = true;
                break;
            }
            if (Mono.divides(lt_j, lt_i) && Mono.divides(lt_i, lt_j) && j < i) {
                redundant = true;
                break;
            }
        }
        if (!redundant) result.push(G[i]);
    }
    return result;
}

function _reduceBasis(G, order) {
    const result = [];
    for (let i = 0; i < G.length; i++) {
        const others = G.filter((_, j) => j !== i);
        const { remainder } = QMvPoly.divide(G[i], others, order);
        if (!remainder.isZero()) {
            result.push(remainder.makeMonic(order));
        }
    }
    return result;
}
