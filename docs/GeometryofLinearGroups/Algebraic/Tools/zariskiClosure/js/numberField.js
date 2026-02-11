/**
 * numberField.js — Number field Q(α) = Q[x]/(f(x)) and element arithmetic
 */

class NumberField {
    constructor(minPoly, name = 'α') {
        if (!(minPoly instanceof QPolynomial)) {
            throw new Error('Minimal polynomial must be a QPolynomial');
        }
        this.minPoly = minPoly.makeMonic();
        this.name = name;
        this.n = this.minPoly.degree();
        this._roots = null;     // cached numerical roots
        this._signature = null; // cached signature
    }

    degree() { return this.n; }

    zero() { return new NFElement(this, new Array(this.n).fill(BigRational.ZERO)); }
    one()  { const c = new Array(this.n).fill(BigRational.ZERO); c[0] = BigRational.ONE; return new NFElement(this, c); }

    generator() {
        const c = new Array(this.n).fill(BigRational.ZERO);
        if (this.n > 1) c[1] = BigRational.ONE;
        else c[0] = this.minPoly.coeff(0).neg(); // α = -a_0 for degree 1
        return new NFElement(this, c);
    }

    fromRational(r) {
        if (!(r instanceof BigRational)) r = BigRational.fromInt(r);
        const c = new Array(this.n).fill(BigRational.ZERO);
        c[0] = r;
        return new NFElement(this, c);
    }

    fromCoeffs(coeffs) {
        const c = new Array(this.n).fill(BigRational.ZERO);
        for (let i = 0; i < Math.min(coeffs.length, this.n); i++) {
            c[i] = coeffs[i] instanceof BigRational ? coeffs[i] : BigRational.fromInt(coeffs[i]);
        }
        return new NFElement(this, c);
    }

    // Numerical roots of the minimal polynomial
    roots() {
        if (this._roots) return this._roots;
        this._roots = this._findAllRoots();
        return this._roots;
    }

    // Signature (r, s) where r = real embeddings, s = complex conjugate pairs
    signature() {
        if (this._signature) return this._signature;
        const roots = this.roots();
        let r = 0;
        for (const z of roots) {
            if (Math.abs(z.im) < 1e-8) r++;
        }
        this._signature = { r, s: (this.n - r) / 2 };
        return this._signature;
    }

    // Find all roots numerically using Aberth's method
    _findAllRoots() {
        const n = this.n;
        if (n === 0) return [];
        if (n === 1) {
            const r = this.minPoly.coeff(0).neg().toNumber();
            return [{ re: r, im: 0 }];
        }
        if (n === 2) {
            const b = this.minPoly.coeff(1).toNumber();
            const c = this.minPoly.coeff(0).toNumber();
            const disc = b * b - 4 * c;
            if (disc >= 0) {
                const sq = Math.sqrt(disc);
                return [
                    { re: (-b + sq) / 2, im: 0 },
                    { re: (-b - sq) / 2, im: 0 }
                ];
            } else {
                const sq = Math.sqrt(-disc);
                return [
                    { re: -b / 2, im: sq / 2 },
                    { re: -b / 2, im: -sq / 2 }
                ];
            }
        }

        // Aberth's method for degree >= 3
        // Root bound: |roots| <= 1 + max(|a_i/a_n|)
        let maxCoeff = 0;
        for (let i = 0; i < n; i++) {
            maxCoeff = Math.max(maxCoeff, Math.abs(this.minPoly.coeff(i).toNumber()));
        }
        const R = 1 + maxCoeff;

        // Initial guesses on a circle
        const roots = [];
        for (let k = 0; k < n; k++) {
            const angle = (2 * Math.PI * k) / n + 0.4;
            roots.push({ re: R * 0.7 * Math.cos(angle), im: R * 0.7 * Math.sin(angle) });
        }

        const f = this.minPoly;
        const fp = f.derivative();

        // Iterate
        for (let iter = 0; iter < 200; iter++) {
            let maxShift = 0;
            for (let i = 0; i < n; i++) {
                const fz = f.evaluateComplex(roots[i]);
                const fpz = fp.evaluateComplex(roots[i]);

                // w_i = f(z_i) / f'(z_i)
                const denom = cDiv(fpz, { re: 1, im: 0 });
                if (cAbs(fpz) < 1e-30) continue;
                const w = cDiv(fz, fpz);

                // sum_j 1/(z_i - z_j)
                let sumRe = 0, sumIm = 0;
                for (let j = 0; j < n; j++) {
                    if (j === i) continue;
                    const diff = { re: roots[i].re - roots[j].re, im: roots[i].im - roots[j].im };
                    if (cAbs(diff) < 1e-30) continue;
                    const inv = cDiv({ re: 1, im: 0 }, diff);
                    sumRe += inv.re;
                    sumIm += inv.im;
                }

                // correction = w / (1 - w * sum)
                const ws = cMul(w, { re: sumRe, im: sumIm });
                const denom2 = { re: 1 - ws.re, im: -ws.im };
                if (cAbs(denom2) < 1e-30) continue;
                const correction = cDiv(w, denom2);

                roots[i].re -= correction.re;
                roots[i].im -= correction.im;
                maxShift = Math.max(maxShift, cAbs(correction));
            }
            if (maxShift < 1e-14) break;
        }

        // Clean up: roots with |im| < 1e-8 are real
        for (const z of roots) {
            if (Math.abs(z.im) < 1e-8) z.im = 0;
        }

        // Sort: real roots first, then complex by real part
        roots.sort((a, b) => {
            if (a.im === 0 && b.im !== 0) return -1;
            if (a.im !== 0 && b.im === 0) return 1;
            return a.re - b.re;
        });

        return roots;
    }

    // Compute norm of element via resultant: N(a) = (-1)^n * Res(f, a(x)) / lc(f)^deg(a)
    norm(elem) {
        const aPoly = new QPolynomial(elem.coeffs);
        if (aPoly.isZero()) return BigRational.ZERO;
        if (aPoly.degree() === 0) return elem.coeffs[0].pow(this.n);
        const res = QPolynomial.resultant(this.minPoly, aPoly);
        const sign = (this.n % 2 === 0) ? BigRational.ONE : BigRational.MINUS_ONE;
        return sign.mul(res);
    }

    // Compute trace via sum of conjugates
    trace(elem) {
        // trace = -n * (coefficient of x^{n-2} in charpoly) for monic charpoly of degree n
        // Simpler: trace(a) = sum of a evaluated at all roots
        // For exact computation: trace(alpha^k) can be computed from Newton's identities
        // But for now, use companion matrix approach

        // trace(a) = trace of the matrix of multiplication by a
        const mat = this._multiplicationMatrix(elem);
        let tr = BigRational.ZERO;
        for (let i = 0; i < this.n; i++) tr = tr.add(mat[i][i]);
        return tr;
    }

    // Multiplication matrix of an element
    _multiplicationMatrix(elem) {
        // Matrix M such that M * [1, α, ..., α^{n-1}]^T = [a*1, a*α, ..., a*α^{n-1}]^T
        // Column j of M = coefficients of a * α^j mod f(α)
        const mat = [];
        for (let i = 0; i < this.n; i++) {
            mat.push(new Array(this.n).fill(BigRational.ZERO));
        }

        // a * α^0 = a
        for (let i = 0; i < this.n; i++) mat[i][0] = elem.coeffs[i];

        // For subsequent columns, multiply by α and reduce
        let prev = elem.coeffs.slice();
        for (let j = 1; j < this.n; j++) {
            // Multiply prev by α: shift coefficients up by 1
            const shifted = [BigRational.ZERO, ...prev];
            // If degree >= n, reduce: replace α^n by -a_0 - a_1*α - ... - a_{n-1}*α^{n-1}
            if (shifted.length > this.n) {
                const overflow = shifted[this.n];
                const reduced = shifted.slice(0, this.n);
                for (let i = 0; i < this.n; i++) {
                    reduced[i] = reduced[i].sub(overflow.mul(this.minPoly.coeff(i)));
                }
                prev = reduced;
            } else {
                prev = shifted.slice(0, this.n);
                while (prev.length < this.n) prev.push(BigRational.ZERO);
            }
            for (let i = 0; i < this.n; i++) mat[i][j] = prev[i];
        }

        return mat;
    }

    // Characteristic polynomial of an element
    charPoly(elem) {
        const mat = this._multiplicationMatrix(elem);
        // Compute det(xI - M) using Faddeev-LeVerrier or direct expansion
        return _charPolyFromMatrix(mat, this.n);
    }

    // Check if f(x) has a root in this field
    hasRoot(poly) {
        return !this.minPoly.gcd(poly).equals(QPolynomial.one());
    }

    toString() {
        if (this.n === 1) return 'ℚ';
        return `ℚ(${this.name})`;
    }

    toLatex() {
        if (this.n === 1) return '\\mathbb{Q}';
        return `\\mathbb{Q}(${this.name})`;
    }
}

// ─── NFElement: element of a number field ───

class NFElement {
    constructor(field, coeffs) {
        this.field = field;
        this.coeffs = coeffs.map(c => c instanceof BigRational ? c : BigRational.fromInt(c));
        while (this.coeffs.length < field.n) this.coeffs.push(BigRational.ZERO);
    }

    isZero() { return this.coeffs.every(c => c.isZero()); }
    isOne()  { return this.coeffs[0].isOne() && this.coeffs.slice(1).every(c => c.isZero()); }
    isRational() { return this.coeffs.slice(1).every(c => c.isZero()); }

    add(other) {
        return new NFElement(this.field, this.coeffs.map((c, i) => c.add(other.coeffs[i])));
    }

    sub(other) {
        return new NFElement(this.field, this.coeffs.map((c, i) => c.sub(other.coeffs[i])));
    }

    neg() {
        return new NFElement(this.field, this.coeffs.map(c => c.neg()));
    }

    scale(r) {
        if (!(r instanceof BigRational)) r = BigRational.fromInt(r);
        return new NFElement(this.field, this.coeffs.map(c => c.mul(r)));
    }

    // Multiply two elements mod f(α)
    mul(other) {
        const n = this.field.n;
        const f = this.field.minPoly;

        // Multiply as polynomials
        const prodCoeffs = new Array(2 * n - 1).fill(null).map(() => BigRational.ZERO);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                prodCoeffs[i + j] = prodCoeffs[i + j].add(this.coeffs[i].mul(other.coeffs[j]));
            }
        }

        // Reduce mod f(x): replace x^n with -(a_0 + a_1*x + ... + a_{n-1}*x^{n-1})
        const result = prodCoeffs.slice(0, n);
        for (let i = 2 * n - 2; i >= n; i--) {
            const c = prodCoeffs[i];
            if (c.isZero()) continue;
            for (let j = 0; j < n; j++) {
                result[i - n + j] = result[i - n + j].sub(c.mul(f.coeff(j)));
            }
        }

        return new NFElement(this.field, result);
    }

    // Inverse via extended Euclidean algorithm on polynomials
    inv() {
        if (this.isZero()) throw new Error('Cannot invert zero');
        const aPoly = new QPolynomial(this.coeffs);
        const fPoly = this.field.minPoly;

        // Extended GCD: find s, t such that s*a + t*f = gcd(a, f) = 1 (since f irreducible)
        let [old_r, r] = [aPoly, fPoly];
        let [old_s, s] = [QPolynomial.one(), QPolynomial.zero()];

        while (!r.isZero()) {
            const { q } = old_r.divmod(r);
            [old_r, r] = [r, old_r.sub(q.mul(r))];
            [old_s, s] = [s, old_s.sub(q.mul(s))];
        }

        // old_r should be constant (gcd = 1 since f is irreducible)
        const gcdVal = old_r.lc();
        const invPoly = old_s.scale(gcdVal.inv());

        // Take coefficients mod n
        const c = new Array(this.field.n).fill(BigRational.ZERO);
        for (let i = 0; i < Math.min(invPoly.coeffs.length, this.field.n); i++) {
            c[i] = invPoly.coeffs[i];
        }
        return new NFElement(this.field, c);
    }

    div(other) { return this.mul(other.inv()); }

    pow(n) {
        if (n === 0) return this.field.one();
        if (n < 0) return this.inv().pow(-n);
        let result = this.field.one();
        let base = this;
        while (n > 0) {
            if (n & 1) result = result.mul(base);
            base = base.mul(base);
            n >>= 1;
        }
        return result;
    }

    norm() { return this.field.norm(this); }
    trace() { return this.field.trace(this); }

    // Is this element integral (in O_K)?
    // Check if the characteristic polynomial has integer coefficients
    isIntegral() {
        const cp = this.field.charPoly(this);
        for (const c of cp.coeffs) {
            if (!c.isInteger()) return false;
        }
        return true;
    }

    // Get the common denominator when expressing over Z[α]
    denominator() {
        let d = 1n;
        for (const c of this.coeffs) {
            d = BigRational.lcm(d, c.den);
        }
        return d;
    }

    // Evaluate this element at a numerical root (embedding)
    evaluateAt(root) {
        // root = { re, im }
        let re = 0, im = 0;
        let powRe = 1, powIm = 0;
        for (let i = 0; i < this.coeffs.length; i++) {
            const c = this.coeffs[i].toNumber();
            re += c * powRe;
            im += c * powIm;
            // multiply power by root
            const newPowRe = powRe * root.re - powIm * root.im;
            const newPowIm = powRe * root.im + powIm * root.re;
            powRe = newPowRe;
            powIm = newPowIm;
        }
        return { re, im };
    }

    clone() { return new NFElement(this.field, this.coeffs.map(c => c.clone())); }

    equals(other) {
        for (let i = 0; i < this.field.n; i++) {
            if (!this.coeffs[i].equals(other.coeffs[i])) return false;
        }
        return true;
    }

    toString() {
        const n = this.field.n;
        const name = this.field.name;
        const parts = [];
        for (let i = n - 1; i >= 0; i--) {
            const c = this.coeffs[i];
            if (c.isZero()) continue;
            let term = '';
            if (i === 0) {
                term = c.toString();
            } else {
                const mon = i === 1 ? name : `${name}^${i}`;
                if (c.isOne()) term = mon;
                else if (c.equals(BigRational.MINUS_ONE)) term = '-' + mon;
                else term = c.toString() + '*' + mon;
            }
            if (parts.length > 0 && c.sign() > 0) parts.push('+ ' + term);
            else parts.push(term);
        }
        return parts.join(' ') || '0';
    }

    toLatex() {
        const n = this.field.n;
        const name = this.field.name;
        const parts = [];
        for (let i = n - 1; i >= 0; i--) {
            const c = this.coeffs[i];
            if (c.isZero()) continue;
            let term = '';
            const mon = i === 0 ? '' : i === 1 ? name : `${name}^{${i}}`;
            if (i === 0) {
                term = c.toLatex();
            } else if (c.isOne()) {
                term = mon;
            } else if (c.equals(BigRational.MINUS_ONE)) {
                term = '-' + mon;
            } else if (c.isInteger()) {
                term = c.toString() + mon;
            } else {
                term = c.toLatex() + ' \\cdot ' + mon;
            }
            if (parts.length > 0 && c.sign() > 0) parts.push(' + ' + term);
            else if (parts.length > 0) parts.push(' ' + term);
            else parts.push(term);
        }
        return parts.join('') || '0';
    }
}

// ─── Complex arithmetic helpers ───

function cMul(a, b) {
    return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cDiv(a, b) {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

function cAbs(a) { return Math.sqrt(a.re * a.re + a.im * a.im); }

// ─── Characteristic polynomial from matrix ───

function _charPolyFromMatrix(mat, n) {
    // Faddeev-LeVerrier algorithm: compute coefficients of det(xI - M)
    // c_n = 1, c_{n-1} = -tr(M), ...
    // Uses: c_k = -1/k * tr(M * N_{k-1}) where N_k = M^k + c_{n-1}*M^{k-1} + ... + c_{n-k}*I
    const coeffs = new Array(n + 1).fill(BigRational.ZERO);
    coeffs[n] = BigRational.ONE;

    let N = identityMatrix(n);
    for (let k = 1; k <= n; k++) {
        const MN = matMul(mat, N, n);
        let tr = BigRational.ZERO;
        for (let i = 0; i < n; i++) tr = tr.add(MN[i][i]);
        coeffs[n - k] = tr.neg().div(BigRational.fromInt(k));

        // N = MN + c_{n-k} * I
        N = matAddScaledIdentity(MN, coeffs[n - k], n);
    }

    return new QPolynomial(coeffs);
}

function identityMatrix(n) {
    const m = [];
    for (let i = 0; i < n; i++) {
        m.push(new Array(n).fill(BigRational.ZERO));
        m[i][i] = BigRational.ONE;
    }
    return m;
}

function matMul(A, B, n) {
    const C = [];
    for (let i = 0; i < n; i++) {
        C.push(new Array(n).fill(null).map(() => BigRational.ZERO));
        for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) {
                C[i][j] = C[i][j].add(A[i][k].mul(B[k][j]));
            }
        }
    }
    return C;
}

function matAddScaledIdentity(M, scalar, n) {
    const R = [];
    for (let i = 0; i < n; i++) {
        R.push(M[i].map(c => c.clone()));
        R[i][i] = R[i][i].add(scalar);
    }
    return R;
}
