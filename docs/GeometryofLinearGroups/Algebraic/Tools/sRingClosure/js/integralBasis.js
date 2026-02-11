/**
 * integralBasis.js — Compute the ring of integers O_K for a number field K
 *
 * Uses closed-form for quadratic fields, simplified Round 2 for higher degree.
 */

class IntegralBasis {
    constructor(field, basisMatrix, discriminant) {
        this.field = field;
        // basisMatrix[i][j] = j-th coordinate of i-th basis element in terms of {1, α, ..., α^{n-1}}
        this.basisMatrix = basisMatrix;
        this.disc = discriminant; // discriminant of O_K as a BigRational
    }

    size() { return this.field.n; }

    // The i-th basis element as an NFElement
    basisElement(i) {
        return this.field.fromCoeffs(this.basisMatrix[i]);
    }

    // All basis elements
    basis() {
        return this.basisMatrix.map((_, i) => this.basisElement(i));
    }

    // Express an NFElement in terms of integral basis
    // Returns array of BigRationals (coordinates), or null if not in O_K
    coordinates(elem) {
        // Solve basisMatrix^T * x = elem.coeffs
        const n = this.field.n;
        // Build augmented matrix [B^T | elem]
        const aug = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                row.push(this.basisMatrix[j][i].clone());
            }
            row.push(elem.coeffs[i].clone());
            aug.push(row);
        }

        // Gaussian elimination
        for (let col = 0; col < n; col++) {
            let pivotRow = -1;
            for (let row = col; row < n; row++) {
                if (!aug[row][col].isZero()) { pivotRow = row; break; }
            }
            if (pivotRow === -1) return null;
            if (pivotRow !== col) [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
            const pivot = aug[col][col];
            for (let j = col; j <= n; j++) aug[col][j] = aug[col][j].div(pivot);
            for (let row = 0; row < n; row++) {
                if (row === col) continue;
                const factor = aug[row][col];
                if (factor.isZero()) continue;
                for (let j = col; j <= n; j++) {
                    aug[row][j] = aug[row][j].sub(factor.mul(aug[col][j]));
                }
            }
        }

        return aug.map(row => row[n]);
    }

    // Check if an element is in O_K
    contains(elem) {
        const coords = this.coordinates(elem);
        if (!coords) return false;
        return coords.every(c => c.isInteger());
    }

    // Express element over O_K and return denominator
    denominatorOf(elem) {
        const coords = this.coordinates(elem);
        if (!coords) return null;
        let d = 1n;
        for (const c of coords) {
            d = BigRational.lcm(d, c.den);
        }
        return d;
    }

    toLatex() {
        const n = this.field.n;
        const name = this.field.name;
        const basisStrs = [];
        for (let i = 0; i < n; i++) {
            const elem = this.basisElement(i);
            basisStrs.push(elem.toLatex());
        }
        return `\\mathbb{Z}\\text{-span}\\{${basisStrs.join(', ')}\\}`;
    }
}

// Compute integral basis for a number field
function computeIntegralBasis(field) {
    const n = field.n;

    if (n === 1) {
        // K = Q, O_K = Z
        return new IntegralBasis(field, [[BigRational.ONE]], BigRational.ONE);
    }

    if (n === 2) {
        return _quadraticIntegralBasis(field);
    }

    // General case: start with Z[α] and enlarge
    return _generalIntegralBasis(field);
}

// ─── Quadratic fields ───

function _quadraticIntegralBasis(field) {
    // f(x) = x^2 + bx + c (monic), α is a root
    const b = field.minPoly.coeff(1);
    const c = field.minPoly.coeff(0);

    // Δ = disc(f) = b² - 4c.  Note √Δ = 2α + b.
    const Delta = b.mul(b).sub(c.mul(BigRational.fromInt(4)));
    const DeltaInt = Delta.num; // integer since f is monic with rational coeffs

    // d = squarefree part of Δ, so Δ = m² · d
    const DeltaAbs = DeltaInt < 0n ? -DeltaInt : DeltaInt;
    const factors = factorInteger(DeltaAbs);

    let d = DeltaInt < 0n ? -1n : 1n;
    let m = 1n;
    for (const [p, e] of factors) {
        if (e % 2 === 1) d *= p;
        m *= p ** BigInt(Math.floor(e / 2));
    }
    // Now Δ = m² · d (with sign), and √d = (2α + b) / m

    // Field discriminant: Δ_K = d if d ≡ 1 mod 4, else 4d
    const dMod4 = ((d % 4n) + 4n) % 4n;
    const fieldDisc = (dMod4 === 1n) ? new BigRational(d, 1n) : new BigRational(4n * d, 1n);

    // Express integral basis in terms of α:
    // √d = (2α + b)/m, so in coords [const, α-coeff]:
    //   √d → [b/m, 2/m]

    if (dMod4 === 1n) {
        // O_K has basis {1, ω} where ω = (1 + √d)/2
        // ω = 1/2 + √d/2 = 1/2 + (2α + b)/(2m) = (1/2 + b/(2m)) + (1/m)α
        const omega0 = BigRational.ONE.div(BigRational.fromInt(2)).add(b.div(new BigRational(2n * m, 1n)));
        const omega1 = BigRational.ONE.div(new BigRational(m, 1n));
        const basis = [
            [BigRational.ONE, BigRational.ZERO],   // 1
            [omega0, omega1]                        // ω = (1+√d)/2
        ];
        return new IntegralBasis(field, basis, fieldDisc);
    } else {
        // O_K has basis {1, √d}
        // √d = (2α + b)/m → [b/m, 2/m]
        const sqrtd0 = b.div(new BigRational(m, 1n));
        const sqrtd1 = new BigRational(2n, m);
        const basis = [
            [BigRational.ONE, BigRational.ZERO],   // 1
            [sqrtd0, sqrtd1]                        // √d
        ];
        return new IntegralBasis(field, basis, fieldDisc);
    }
}

// ─── General case: simplified Round 2 ───

function _generalIntegralBasis(field) {
    const n = field.n;
    const f = field.minPoly;

    // Start with basis = {1, α, α², ..., α^{n-1}} = identity matrix
    let basis = [];
    for (let i = 0; i < n; i++) {
        const row = new Array(n).fill(BigRational.ZERO);
        row[i] = BigRational.ONE;
        basis.push(row);
    }

    // Compute disc(f)
    const discF = f.discriminant();
    if (discF.isZero()) {
        // Degenerate case
        return new IntegralBasis(field, basis, discF);
    }

    // disc(Z[α]) = disc(f), which equals disc(O_K) * [O_K : Z[α]]²
    // Factor |disc(f)| to find primes p with p² | disc(f)
    const discAbs = discF.num < 0n ? -discF.num : discF.num;
    const factors = factorInteger(discAbs / discF.den);

    for (const [p, e] of factors) {
        if (e < 2) continue;

        // Try to enlarge the basis at prime p
        // For each basis element ω_i, test if (ω_i + c_1*ω_1 + ... + c_{i-1}*ω_{i-1})/p is integral
        // by checking its characteristic polynomial has integer coefficients

        let changed = true;
        let iterations = 0;
        while (changed && iterations < 20) {
            changed = false;
            iterations++;

            for (let i = 0; i < n; i++) {
                // Try dividing basis element i by p
                const elem = field.fromCoeffs(basis[i]);
                const scaledElem = elem.scale(new BigRational(1n, p));

                if (scaledElem.isIntegral()) {
                    // Replace basis[i] with scaledElem
                    basis[i] = scaledElem.coeffs.map(c => c.clone());
                    changed = true;
                    continue;
                }

                // Try combinations: (ω_i + ω_j) / p for j < i
                for (let j = 0; j < n; j++) {
                    if (j === i) continue;
                    const other = field.fromCoeffs(basis[j]);
                    const combo = elem.add(other).scale(new BigRational(1n, p));
                    if (combo.isIntegral()) {
                        basis[i] = combo.coeffs.map(c => c.clone());
                        changed = true;
                        break;
                    }
                }
            }
        }
    }

    // Compute discriminant of the integral basis
    // disc(O_K) = det(Tr(ω_i * ω_j))
    const traceMatrix = [];
    const basisElems = basis.map(b => field.fromCoeffs(b));
    for (let i = 0; i < n; i++) {
        traceMatrix.push([]);
        for (let j = 0; j < n; j++) {
            traceMatrix[i].push(field.trace(basisElems[i].mul(basisElems[j])));
        }
    }
    const disc = _determinant(traceMatrix, n);

    return new IntegralBasis(field, basis, disc);
}

// Determinant of a matrix of BigRationals
function _determinant(mat, n) {
    // Gaussian elimination
    const m = mat.map(row => row.map(c => c.clone()));
    let det = BigRational.ONE;

    for (let col = 0; col < n; col++) {
        let pivotRow = -1;
        for (let row = col; row < n; row++) {
            if (!m[row][col].isZero()) { pivotRow = row; break; }
        }
        if (pivotRow === -1) return BigRational.ZERO;
        if (pivotRow !== col) {
            [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
            det = det.neg();
        }
        det = det.mul(m[col][col]);
        const pivotInv = m[col][col].inv();
        for (let row = col + 1; row < n; row++) {
            if (m[row][col].isZero()) continue;
            const factor = m[row][col].mul(pivotInv);
            for (let j = col; j < n; j++) {
                m[row][j] = m[row][j].sub(factor.mul(m[col][j]));
            }
        }
    }
    return det;
}
