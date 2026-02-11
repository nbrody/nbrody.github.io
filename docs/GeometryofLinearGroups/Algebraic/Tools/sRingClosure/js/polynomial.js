/**
 * polynomial.js — Univariate polynomials over Q, Z, and F_p
 */

// ─── QPolynomial: univariate polynomial over Q ───

class QPolynomial {
    // coeffs[i] = coefficient of x^i, each is a BigRational
    constructor(coeffs) {
        this.coeffs = coeffs.map(c =>
            c instanceof BigRational ? c : BigRational.fromInt(c)
        );
        this._trim();
    }

    _trim() {
        while (this.coeffs.length > 1 && this.coeffs[this.coeffs.length - 1].isZero()) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) this.coeffs = [BigRational.ZERO];
    }

    static zero() { return new QPolynomial([BigRational.ZERO]); }
    static one()  { return new QPolynomial([BigRational.ONE]); }
    static x()    { return new QPolynomial([BigRational.ZERO, BigRational.ONE]); }

    static fromIntCoeffs(arr) {
        return new QPolynomial(arr.map(n => BigRational.fromInt(n)));
    }

    degree() {
        if (this.coeffs.length === 1 && this.coeffs[0].isZero()) return -1;
        return this.coeffs.length - 1;
    }

    lc() { return this.coeffs[this.coeffs.length - 1]; }
    isZero() { return this.degree() === -1; }
    isMonic() { return this.lc().isOne(); }

    coeff(i) {
        return i < this.coeffs.length ? this.coeffs[i] : BigRational.ZERO;
    }

    add(other) {
        const n = Math.max(this.coeffs.length, other.coeffs.length);
        const c = [];
        for (let i = 0; i < n; i++) c.push(this.coeff(i).add(other.coeff(i)));
        return new QPolynomial(c);
    }

    sub(other) {
        const n = Math.max(this.coeffs.length, other.coeffs.length);
        const c = [];
        for (let i = 0; i < n; i++) c.push(this.coeff(i).sub(other.coeff(i)));
        return new QPolynomial(c);
    }

    mul(other) {
        if (this.isZero() || other.isZero()) return QPolynomial.zero();
        const c = new Array(this.coeffs.length + other.coeffs.length - 1)
            .fill(null).map(() => BigRational.ZERO);
        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                c[i + j] = c[i + j].add(this.coeffs[i].mul(other.coeffs[j]));
            }
        }
        return new QPolynomial(c);
    }

    scale(r) {
        if (!(r instanceof BigRational)) r = BigRational.fromInt(r);
        return new QPolynomial(this.coeffs.map(c => c.mul(r)));
    }

    neg() { return new QPolynomial(this.coeffs.map(c => c.neg())); }

    // Euclidean division: returns { q, r } with this = q*other + r
    divmod(other) {
        if (other.isZero()) throw new Error('Division by zero polynomial');
        if (this.degree() < other.degree()) {
            return { q: QPolynomial.zero(), r: this.clone() };
        }
        let rem = this.clone();
        const qcoeffs = new Array(rem.degree() - other.degree() + 1).fill(null).map(() => BigRational.ZERO);
        const lcOther = other.lc();
        while (rem.degree() >= other.degree() && !rem.isZero()) {
            const d = rem.degree() - other.degree();
            const c = rem.lc().div(lcOther);
            qcoeffs[d] = c;
            // rem -= c * x^d * other
            for (let i = 0; i < other.coeffs.length; i++) {
                rem.coeffs[i + d] = rem.coeffs[i + d].sub(c.mul(other.coeffs[i]));
            }
            rem._trim();
        }
        return { q: new QPolynomial(qcoeffs), r: rem };
    }

    mod(other) { return this.divmod(other).r; }

    // GCD via Euclidean algorithm, result is monic
    gcd(other) {
        let a = this.clone(), b = other.clone();
        while (!b.isZero()) {
            const r = a.mod(b);
            a = b;
            b = r;
        }
        if (a.isZero()) return QPolynomial.zero();
        return a.makeMonic();
    }

    makeMonic() {
        if (this.isZero()) return this;
        const lc = this.lc();
        return new QPolynomial(this.coeffs.map(c => c.div(lc)));
    }

    derivative() {
        if (this.degree() <= 0) return QPolynomial.zero();
        const c = [];
        for (let i = 1; i < this.coeffs.length; i++) {
            c.push(this.coeffs[i].mul(BigRational.fromInt(i)));
        }
        return new QPolynomial(c);
    }

    evaluate(x) {
        // Horner's method — x is BigRational
        if (!(x instanceof BigRational)) x = BigRational.fromInt(x);
        let result = BigRational.ZERO;
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            result = result.mul(x).add(this.coeffs[i]);
        }
        return result;
    }

    evaluateComplex(z) {
        // z = {re, im}, returns {re, im}
        let rr = 0, ri = 0;
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const c = this.coeffs[i].toNumber();
            const newRr = rr * z.re - ri * z.im + c;
            const newRi = rr * z.im + ri * z.re;
            rr = newRr;
            ri = newRi;
        }
        return { re: rr, im: ri };
    }

    // Resultant via Sylvester matrix determinant
    static resultant(f, g) {
        if (f.isZero() || g.isZero()) return BigRational.ZERO;
        const m = f.degree(), n = g.degree();
        if (m === 0) return f.lc().pow(n);
        if (n === 0) return g.lc().pow(m);
        return QPolynomial._sylvesterResultant(f, g);
    }

    static _sylvesterResultant(f, g) {
        const m = f.degree(), n = g.degree();
        const size = m + n;
        if (size === 0) return BigRational.ONE;

        // Build Sylvester matrix
        const mat = [];
        for (let i = 0; i < size; i++) {
            mat.push(new Array(size).fill(null).map(() => BigRational.ZERO));
        }
        // n rows from f
        for (let i = 0; i < n; i++) {
            for (let j = 0; j <= m; j++) {
                mat[i][i + j] = f.coeff(m - j);
            }
        }
        // m rows from g
        for (let i = 0; i < m; i++) {
            for (let j = 0; j <= n; j++) {
                mat[n + i][i + j] = g.coeff(n - j);
            }
        }

        // Gaussian elimination to compute determinant
        let det = BigRational.ONE;
        for (let col = 0; col < size; col++) {
            // Find pivot
            let pivotRow = -1;
            for (let row = col; row < size; row++) {
                if (!mat[row][col].isZero()) { pivotRow = row; break; }
            }
            if (pivotRow === -1) return BigRational.ZERO;
            if (pivotRow !== col) {
                [mat[col], mat[pivotRow]] = [mat[pivotRow], mat[col]];
                det = det.neg();
            }
            det = det.mul(mat[col][col]);
            const pivotInv = mat[col][col].inv();
            for (let row = col + 1; row < size; row++) {
                if (mat[row][col].isZero()) continue;
                const factor = mat[row][col].mul(pivotInv);
                for (let j = col; j < size; j++) {
                    mat[row][j] = mat[row][j].sub(factor.mul(mat[col][j]));
                }
            }
        }
        return det;
    }

    discriminant() {
        const n = this.degree();
        if (n <= 0) return BigRational.ZERO;
        const sign = ((n * (n - 1) / 2) % 2 === 0) ? BigRational.ONE : BigRational.MINUS_ONE;
        const res = QPolynomial.resultant(this, this.derivative());
        return sign.mul(res).div(this.lc());
    }

    clone() { return new QPolynomial(this.coeffs.map(c => c.clone())); }

    equals(other) {
        if (this.degree() !== other.degree()) return false;
        for (let i = 0; i <= this.degree(); i++) {
            if (!this.coeff(i).equals(other.coeff(i))) return false;
        }
        return true;
    }

    toString(v = 'x') {
        if (this.isZero()) return '0';
        const parts = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const c = this.coeffs[i];
            if (c.isZero()) continue;
            let term = '';
            if (i === 0) {
                term = c.toString();
            } else {
                const mon = i === 1 ? v : `${v}^${i}`;
                if (c.isOne()) term = mon;
                else if (c.equals(BigRational.MINUS_ONE)) term = '-' + mon;
                else term = c.toString() + '*' + mon;
            }
            if (parts.length > 0 && c.sign() > 0) parts.push('+ ' + term);
            else parts.push(term);
        }
        return parts.join(' ') || '0';
    }

    toLatex(v = 'x') {
        if (this.isZero()) return '0';
        const parts = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const c = this.coeffs[i];
            if (c.isZero()) continue;
            let term = '';
            const mon = i === 0 ? '' : i === 1 ? v : `${v}^{${i}}`;
            if (i === 0) {
                term = c.toLatex();
            } else if (c.isOne()) {
                term = mon;
            } else if (c.equals(BigRational.MINUS_ONE)) {
                term = '-' + mon;
            } else if (c.isInteger()) {
                term = c.toString() + mon;
            } else {
                term = c.toLatex() + mon;
            }
            if (parts.length > 0 && c.sign() > 0) parts.push(' + ' + term);
            else if (parts.length > 0) parts.push(' ' + term);
            else parts.push(term);
        }
        return parts.join('') || '0';
    }
}

// ─── ZPolynomial: univariate polynomial over Z ───

class ZPolynomial {
    constructor(coeffs) {
        this.coeffs = coeffs.map(c => typeof c === 'bigint' ? c : BigInt(Math.round(c)));
        this._trim();
    }

    _trim() {
        while (this.coeffs.length > 1 && this.coeffs[this.coeffs.length - 1] === 0n) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) this.coeffs = [0n];
    }

    degree() {
        if (this.coeffs.length === 1 && this.coeffs[0] === 0n) return -1;
        return this.coeffs.length - 1;
    }

    lc() { return this.coeffs[this.coeffs.length - 1]; }
    isZero() { return this.degree() === -1; }
    coeff(i) { return i < this.coeffs.length ? this.coeffs[i] : 0n; }

    content() {
        let g = 0n;
        for (const c of this.coeffs) {
            g = BigRational.gcd(g, c < 0n ? -c : c);
        }
        return g === 0n ? 1n : g;
    }

    primitivePart() {
        const g = this.content();
        if (g === 1n) return this;
        return new ZPolynomial(this.coeffs.map(c => c / g));
    }

    toQPolynomial() {
        return new QPolynomial(this.coeffs.map(c => new BigRational(c, 1n)));
    }

    modP(p) {
        const mod = (a, m) => { const r = a % m; return r < 0n ? r + m : r; };
        return new FpPolynomial(this.coeffs.map(c => mod(c, p)), p);
    }
}

// ─── FpPolynomial: univariate polynomial over F_p ───

class FpPolynomial {
    constructor(coeffs, p) {
        this.p = typeof p === 'bigint' ? p : BigInt(p);
        const mod = (a) => { const r = a % this.p; return r < 0n ? r + this.p : r; };
        this.coeffs = coeffs.map(c => mod(typeof c === 'bigint' ? c : BigInt(Math.round(c))));
        this._trim();
    }

    _trim() {
        while (this.coeffs.length > 1 && this.coeffs[this.coeffs.length - 1] === 0n) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) this.coeffs = [0n];
    }

    degree() {
        if (this.coeffs.length === 1 && this.coeffs[0] === 0n) return -1;
        return this.coeffs.length - 1;
    }

    lc() { return this.coeffs[this.coeffs.length - 1]; }
    isZero() { return this.degree() === -1; }
    coeff(i) { return i < this.coeffs.length ? this.coeffs[i] : 0n; }

    _mod(a) { const r = a % this.p; return r < 0n ? r + this.p : r; }

    _modInverse(a) {
        // Extended Euclidean on bigints
        let [old_r, r] = [this._mod(a), this.p];
        let [old_s, s] = [1n, 0n];
        while (r !== 0n) {
            const q = old_r / r;
            [old_r, r] = [r, old_r - q * r];
            [old_s, s] = [s, old_s - q * s];
        }
        if (old_r !== 1n) throw new Error(`${a} not invertible mod ${this.p}`);
        return this._mod(old_s);
    }

    add(other) {
        const n = Math.max(this.coeffs.length, other.coeffs.length);
        const c = [];
        for (let i = 0; i < n; i++) c.push(this._mod(this.coeff(i) + other.coeff(i)));
        return new FpPolynomial(c, this.p);
    }

    sub(other) {
        const n = Math.max(this.coeffs.length, other.coeffs.length);
        const c = [];
        for (let i = 0; i < n; i++) c.push(this._mod(this.coeff(i) - other.coeff(i)));
        return new FpPolynomial(c, this.p);
    }

    mul(other) {
        if (this.isZero() || other.isZero()) return new FpPolynomial([0n], this.p);
        const c = new Array(this.coeffs.length + other.coeffs.length - 1).fill(0n);
        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                c[i + j] = this._mod(c[i + j] + this.coeffs[i] * other.coeffs[j]);
            }
        }
        return new FpPolynomial(c, this.p);
    }

    scale(s) {
        s = this._mod(typeof s === 'bigint' ? s : BigInt(s));
        return new FpPolynomial(this.coeffs.map(c => this._mod(c * s)), this.p);
    }

    makeMonic() {
        if (this.isZero()) return this;
        const inv = this._modInverse(this.lc());
        return this.scale(inv);
    }

    divmod(other) {
        if (other.isZero()) throw new Error('Division by zero');
        if (this.degree() < other.degree()) {
            return { q: new FpPolynomial([0n], this.p), r: this.clone() };
        }
        const rem = this.coeffs.slice();
        const qcoeffs = new Array(rem.length - other.coeffs.length + 1).fill(0n);
        const lcInv = this._modInverse(other.lc());
        for (let i = rem.length - 1; i >= other.degree(); i--) {
            if (rem[i] === 0n) continue;
            const c = this._mod(rem[i] * lcInv);
            const d = i - other.degree();
            qcoeffs[d] = c;
            for (let j = 0; j < other.coeffs.length; j++) {
                rem[d + j] = this._mod(rem[d + j] - c * other.coeffs[j]);
            }
        }
        return { q: new FpPolynomial(qcoeffs, this.p), r: new FpPolynomial(rem, this.p) };
    }

    mod(other) { return this.divmod(other).r; }

    gcd(other) {
        let a = this, b = other;
        while (!b.isZero()) {
            const r = a.mod(b);
            a = b;
            b = r;
        }
        return a.isZero() ? a : a.makeMonic();
    }

    // Compute x^n mod this polynomial
    powmod(n, modPoly) {
        let result = new FpPolynomial([1n], this.p);
        let base = this.mod(modPoly);
        let exp = typeof n === 'bigint' ? n : BigInt(n);
        while (exp > 0n) {
            if (exp & 1n) result = result.mul(base).mod(modPoly);
            base = base.mul(base).mod(modPoly);
            exp >>= 1n;
        }
        return result;
    }

    clone() { return new FpPolynomial(this.coeffs.slice(), this.p); }

    equals(other) {
        if (this.degree() !== other.degree()) return false;
        for (let i = 0; i <= this.degree(); i++) {
            if (this.coeff(i) !== other.coeff(i)) return false;
        }
        return true;
    }

    // Factor using distinct-degree + equal-degree factorization
    factor() {
        if (this.degree() <= 0) return this.isZero() ? [] : [this.makeMonic()];

        const f = this.makeMonic();
        const factors = [];

        // Step 1: squarefree factorization
        const sfFactors = f._squarefreeFactors();

        for (const { poly, mult } of sfFactors) {
            // Step 2: distinct-degree factorization
            const ddFactors = poly._distinctDegreeFactors();
            for (const { poly: g, deg } of ddFactors) {
                // Step 3: equal-degree splitting
                const splits = g._equalDegreeSplit(deg);
                for (const s of splits) {
                    for (let m = 0; m < mult; m++) factors.push(s);
                }
            }
        }

        return factors;
    }

    _squarefreeFactors() {
        const f = this.makeMonic();
        const fp = f._derivative();
        if (fp.isZero()) {
            // f = g(x^p) — characteristic p
            // For simplicity, return as-is
            return [{ poly: f, mult: 1 }];
        }
        const g = f.gcd(fp);
        if (g.degree() === 0) return [{ poly: f, mult: 1 }];

        const factors = [];
        let w = f.divmod(g).q;
        let v = g;
        let mult = 1;
        while (w.degree() > 0) {
            const h = w.gcd(v);
            if (w.degree() > h.degree()) {
                factors.push({ poly: w.divmod(h).q.makeMonic(), mult });
            }
            w = h;
            v = v.divmod(h).q;
            mult++;
        }
        if (v.degree() > 0) factors.push({ poly: v.makeMonic(), mult });
        return factors.length > 0 ? factors : [{ poly: f, mult: 1 }];
    }

    _derivative() {
        if (this.degree() <= 0) return new FpPolynomial([0n], this.p);
        const c = [];
        for (let i = 1; i < this.coeffs.length; i++) {
            c.push(this._mod(this.coeffs[i] * BigInt(i)));
        }
        return new FpPolynomial(c, this.p);
    }

    _distinctDegreeFactors() {
        const n = this.degree();
        if (n <= 0) return [];

        const factors = [];
        let f = this.makeMonic();
        // x polynomial
        const xPoly = new FpPolynomial([0n, 1n], this.p);
        let h = xPoly.clone(); // h = x initially

        for (let d = 1; d <= n; d++) {
            // h = x^{p^d} mod f
            h = h.powmod(this.p, f);
            // g = gcd(f, h - x)
            const hMinusX = h.sub(xPoly);
            const g = f.gcd(hMinusX.mod(f));

            if (g.degree() > 0) {
                factors.push({ poly: g.makeMonic(), deg: d });
                f = f.divmod(g).q.makeMonic();
                h = h.mod(f);
            }
            if (f.degree() === 0) break;
        }
        if (f.degree() > 0) {
            factors.push({ poly: f, deg: f.degree() });
        }
        return factors;
    }

    _equalDegreeSplit(d) {
        if (this.degree() === d) return [this.makeMonic()];
        if (this.degree() === 0) return [];

        const factors = [];
        const stack = [this.makeMonic()];

        while (stack.length > 0) {
            const f = stack.pop();
            if (f.degree() === d) { factors.push(f); continue; }
            if (f.degree() === 0) continue;

            // Random splitting
            let g;
            for (let attempt = 0; attempt < 50; attempt++) {
                // Random polynomial of degree < deg(f)
                const rc = [];
                for (let i = 0; i < f.degree(); i++) {
                    rc.push(BigInt(Math.floor(Math.random() * Number(this.p))));
                }
                const r = new FpPolynomial(rc, this.p);
                if (r.isZero()) continue;

                // g = gcd(f, r^((p^d - 1)/2) - 1 mod f)
                const exp = (this.p ** BigInt(d) - 1n) / 2n;
                const rpow = r.powmod(exp, f);
                const rpowMinus1 = rpow.sub(new FpPolynomial([1n], this.p));
                g = f.gcd(rpowMinus1.mod(f));

                if (g.degree() > 0 && g.degree() < f.degree()) break;
                g = null;
            }
            if (!g || g.degree() === 0 || g.degree() === f.degree()) {
                // Fallback: push as-is (shouldn't happen for correct algorithm)
                factors.push(f);
                continue;
            }
            stack.push(g.makeMonic());
            stack.push(f.divmod(g).q.makeMonic());
        }
        return factors;
    }

    toString(v = 'x') {
        if (this.isZero()) return '0';
        const parts = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            if (this.coeffs[i] === 0n) continue;
            const c = this.coeffs[i];
            let term = '';
            if (i === 0) {
                term = c.toString();
            } else {
                const mon = i === 1 ? v : `${v}^${i}`;
                if (c === 1n) term = mon;
                else term = c.toString() + '*' + mon;
            }
            if (parts.length > 0) parts.push('+ ' + term);
            else parts.push(term);
        }
        return parts.join(' ') || '0';
    }
}
