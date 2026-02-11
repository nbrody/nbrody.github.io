/**
 * sRingClosure.js — Compute the S-ring closure of a finitely generated subring of Qbar
 *
 * Input: polynomials defining the ring as Z[x_1,...,x_k] / (f_1,...,f_m)
 * Output: the number field K, the ring of integers O_K, the set S, and O_{K,S}
 */

class SRingClosureResult {
    constructor() {
        this.field = null;           // NumberField
        this.integralBasis = null;   // IntegralBasis
        this.invertedPrimes = [];    // bigint[]
        this.generators = [];        // NFElement[] — the images of x_1, ..., x_k
        this.generatorLabels = [];   // string[]
        this.isLocalization = false; // true if K = Q (no field extension)
        this.warnings = [];
    }

    // Human-readable description of O_{K,S}
    ringDescription() {
        const K = this.field;
        const S = this.invertedPrimes;

        if (K.n === 1) {
            // K = Q
            if (S.length === 0) return 'ℤ';
            const sStr = S.map(p => p.toString()).join(' · ');
            return `ℤ[1/${sStr}]`;
        }

        const name = K.name;
        if (S.length === 0) {
            return `𝒪_{${K.toString()}}`;
        }
        const sStr = S.map(p => p.toString()).join(', ');
        return `𝒪_{${K.toString()}, {${sStr}}}`;
    }

    ringLatex() {
        const K = this.field;
        const S = this.invertedPrimes;

        if (K.n === 1) {
            if (S.length === 0) return '\\mathbb{Z}';
            if (S.length === 1) return `\\mathbb{Z}[1/${S[0]}]`;
            const prod = S.reduce((a, b) => a * b, 1n);
            return `\\mathbb{Z}[1/${prod}]`;
        }

        if (S.length === 0) {
            return `\\mathcal{O}_{${K.toLatex()}}`;
        }
        const sStr = S.map(p => p.toString()).join(', ');
        return `\\mathcal{O}_{${K.toLatex()},\\,\\{${sStr}\\}}`;
    }

    inputRingLatex() {
        if (this.generatorLabels.length === 0) return '\\mathbb{Z}';
        const gens = this.generatorLabels.join(', ');
        return `\\mathbb{Z}[${gens}]`;
    }
}

/**
 * Main entry point: compute S-ring closure from polynomial input
 *
 * @param {Array} polyData - array of { polynomial: string (readable), variables: string[] }
 *   Each entry defines a relation: the variable x_i is the image of a root of the polynomial
 *   in the quotient ring.
 *
 * The input is a list of polynomials f_1(x_1,...,x_k), ..., f_m(x_1,...,x_k)
 * defining R = Z[x_1,...,x_k] / (f_1,...,f_m)
 *
 * We analyze R by:
 * 1. For single-variable polynomials: each f_i(x_i) = 0 defines x_i as an algebraic number
 * 2. Relations between variables constrain further
 * 3. The fraction field of R is a number field K
 * 4. We find O_K and the set S
 */
function computeSRingClosure(polynomials, variables) {
    const result = new SRingClosureResult();

    // Separate single-variable defining polynomials from multi-variable relations
    const definingPolys = [];  // { varIndex, poly: QPolynomial }
    const relations = [];       // multi-variable relations (for Gröbner basis)

    for (const p of polynomials) {
        const vars = _extractVarIndices(p.readable);
        if (vars.length === 1) {
            definingPolys.push({
                varIndex: vars[0],
                poly: _parseUnivariateQ(p.readable, vars[0])
            });
        } else {
            relations.push(p);
        }
    }

    // Sort defining polynomials by variable index
    definingPolys.sort((a, b) => a.varIndex - b.varIndex);

    if (definingPolys.length === 0) {
        // No defining relations — ring is Z[x_1,...,x_k] which is not a subring of Qbar
        // Unless there are multi-variable relations that collapse the ring
        result.warnings.push('No single-variable defining polynomials found. Need at least one f_i(x_i) = 0 to embed in Q̄.');
        // Return Z as fallback
        const trivField = new NumberField(QPolynomial.fromIntCoeffs([-1, 1]), 'α');
        result.field = trivField;
        result.integralBasis = computeIntegralBasis(trivField);
        return result;
    }

    // ─── Single generator case ───
    if (definingPolys.length === 1 && relations.length === 0) {
        const dp = definingPolys[0];
        let poly = dp.poly.makeMonic();

        // Check for localization: linear polynomial ax - b defines x = b/a
        if (poly.degree() === 1) {
            return _handleLocalization(poly, dp.varIndex, result);
        }

        // Make irreducible (take the minimal polynomial)
        // For now, assume user input is irreducible
        const K = new NumberField(poly, `x_{${dp.varIndex + 1}}`);
        const alpha = K.generator();

        result.field = K;
        result.generators = [alpha];
        result.generatorLabels = [`x_{${dp.varIndex + 1}}`];
        result.integralBasis = computeIntegralBasis(K);

        // Check if generator is integral
        const d = result.integralBasis.denominatorOf(alpha);
        if (d && d > 1n) {
            // Generator has denominator d over O_K
            const primes = factorInteger(d);
            result.invertedPrimes = [...primes.keys()].sort((a, b) => (a < b ? -1 : 1));
        }

        return result;
    }

    // ─── Multiple generators ───
    // Build a single number field containing all generators

    if (definingPolys.length === 2 && relations.length === 0) {
        return _handleTwoGenerators(definingPolys, result);
    }

    // General case: process one at a time, building up the field
    return _handleMultipleGenerators(definingPolys, relations, result);
}

// ─── Handle localization Z[x]/(ax - b) = Z[b/a] ───

function _handleLocalization(poly, varIndex, result) {
    // poly = x + c (monic), so x = -c, i.e., the generator equals -c
    const val = poly.coeff(0).neg(); // x = -constant term

    // The number field is Q (degree 1)
    const K = new NumberField(QPolynomial.fromIntCoeffs([-1, 1]), '1');
    result.field = K;
    result.isLocalization = true;
    result.generators = [K.fromRational(val)];
    result.generatorLabels = [`x_{${varIndex + 1}}`];
    result.integralBasis = computeIntegralBasis(K);

    // Find denominator of val
    if (!val.isInteger()) {
        const d = val.den;
        const primes = factorInteger(d);
        result.invertedPrimes = [...primes.keys()].sort((a, b) => (a < b ? -1 : 1));
    }

    return result;
}

// ─── Handle two generators: Q(α, β) ───

function _handleTwoGenerators(definingPolys, result) {
    const dp1 = definingPolys[0];
    const dp2 = definingPolys[1];
    const f = dp1.poly.makeMonic();
    const g = dp2.poly.makeMonic();

    // If both are degree 1 (localizations), handle specially
    if (f.degree() === 1 && g.degree() === 1) {
        const val1 = f.coeff(0).neg();
        const val2 = g.coeff(0).neg();
        const K = new NumberField(QPolynomial.fromIntCoeffs([-1, 1]), '1');
        result.field = K;
        result.isLocalization = true;
        result.generators = [K.fromRational(val1), K.fromRational(val2)];
        result.generatorLabels = [`x_{${dp1.varIndex + 1}}`, `x_{${dp2.varIndex + 1}}`];
        result.integralBasis = computeIntegralBasis(K);

        const S = new Set();
        for (const val of [val1, val2]) {
            if (!val.isInteger()) {
                for (const [p] of factorInteger(val.den)) S.add(p);
            }
        }
        result.invertedPrimes = [...S].sort((a, b) => (a < b ? -1 : 1));
        return result;
    }

    // If one is degree 1, embed the other in the extension
    if (f.degree() === 1) {
        // First generator is rational, second defines the field
        const val1 = f.coeff(0).neg();
        const K = new NumberField(g, `x_{${dp2.varIndex + 1}}`);
        result.field = K;
        result.generators = [K.fromRational(val1), K.generator()];
        result.generatorLabels = [`x_{${dp1.varIndex + 1}}`, `x_{${dp2.varIndex + 1}}`];
        result.integralBasis = computeIntegralBasis(K);

        const S = new Set();
        if (!val1.isInteger()) {
            for (const [p] of factorInteger(val1.den)) S.add(p);
        }
        const d2 = result.integralBasis.denominatorOf(K.generator());
        if (d2 && d2 > 1n) {
            for (const [p] of factorInteger(d2)) S.add(p);
        }
        result.invertedPrimes = [...S].sort((a, b) => (a < b ? -1 : 1));
        return result;
    }

    if (g.degree() === 1) {
        // Swap and recurse
        return _handleTwoGenerators([dp2, dp1], result);
    }

    // Both are non-trivial extensions
    // Find primitive element γ = α + c*β for small c
    // Minimal polynomial of γ = Res_y(f(y), g(x-c*y)) in x

    for (let c = 1; c <= 10; c++) {
        // h(x) = Res_y(f(y), g(x - c*y))
        // Substitution: g(x - c*y) as a polynomial in y
        const gShifted = _substituteLinear(g, c, f.degree() + g.degree());
        const h = QPolynomial.resultant(f, gShifted);

        // h should be a polynomial in x ... actually resultant gives a scalar
        // We need to compute resultant of f(y) and g(x - cy) as polynomials in y, treating x as parameter
        // This is more complex. Use the direct approach instead.

        // Direct approach: compute the minimal polynomial of α + c*β
        // by computing Res_y(f(y), g(z - c*y)) where z is the result variable
        const minPolyGamma = _resultantForPrimitiveElement(f, g, c);

        if (minPolyGamma && minPolyGamma.degree() === f.degree() * g.degree()) {
            // Found primitive element
            const K = new NumberField(minPolyGamma, 'γ');

            // Express α and β in terms of γ = α + c*β
            // α is a root of f, β = (γ - α)/c
            // We need to find α as an element of Q(γ)

            // The element α satisfies f(α) = 0 and g((γ-α)/c) = 0
            // Use: gcd(f(y), g((γ-y)/c)) in Q(γ)[y] should give (y - α)

            const alpha = _findRootInExtension(K, f, g, c);
            const betaCoeffs = new Array(K.n).fill(BigRational.ZERO);
            // β = (γ - α) / c
            const gamma = K.generator();
            const beta = gamma.sub(alpha).scale(new BigRational(1n, BigInt(c)));

            result.field = K;
            result.generators = [alpha, beta];
            result.generatorLabels = [`x_{${dp1.varIndex + 1}}`, `x_{${dp2.varIndex + 1}}`];
            result.integralBasis = computeIntegralBasis(K);

            const S = new Set();
            for (const gen of [alpha, beta]) {
                const d = result.integralBasis.denominatorOf(gen);
                if (d && d > 1n) {
                    for (const [p] of factorInteger(d)) S.add(p);
                }
            }
            result.invertedPrimes = [...S].sort((a, b) => (a < b ? -1 : 1));
            return result;
        }
    }

    // Fallback: just use the first polynomial's field
    result.warnings.push('Could not find primitive element; using first generator only.');
    const K = new NumberField(f, `x_{${dp1.varIndex + 1}}`);
    result.field = K;
    result.generators = [K.generator()];
    result.generatorLabels = [`x_{${dp1.varIndex + 1}}`];
    result.integralBasis = computeIntegralBasis(K);
    return result;
}

// ─── Multiple generators (general) ───

function _handleMultipleGenerators(definingPolys, relations, result) {
    // Build up field one generator at a time
    // Start with first non-linear polynomial
    let currentField = null;
    const generators = [];
    const labels = [];
    const S = new Set();

    for (const dp of definingPolys) {
        const poly = dp.poly.makeMonic();
        const label = `x_{${dp.varIndex + 1}}`;

        if (poly.degree() === 1) {
            // Rational generator
            const val = poly.coeff(0).neg();
            if (!val.isInteger()) {
                for (const [p] of factorInteger(val.den)) S.add(p);
            }
            if (currentField) {
                generators.push(currentField.fromRational(val));
            } else {
                // First generator is rational; defer field creation
                generators.push(val); // store as BigRational for now
            }
            labels.push(label);
            continue;
        }

        if (!currentField) {
            currentField = new NumberField(poly, label);
            generators.push(currentField.generator());
            labels.push(label);
        } else {
            // Need to extend currentField to include this new algebraic number
            // For simplicity, if the new poly has a root in current field, find it
            // Otherwise, warn
            result.warnings.push(`Extension by ${label} not fully handled; using first field only.`);
            labels.push(label);
        }
    }

    if (!currentField) {
        currentField = new NumberField(QPolynomial.fromIntCoeffs([-1, 1]), '1');
        result.isLocalization = true;
    }

    // Convert any stored BigRational generators
    for (let i = 0; i < generators.length; i++) {
        if (generators[i] instanceof BigRational) {
            generators[i] = currentField.fromRational(generators[i]);
        }
    }

    result.field = currentField;
    result.generators = generators;
    result.generatorLabels = labels;
    result.integralBasis = computeIntegralBasis(currentField);

    // Compute S from all generators
    for (const gen of generators) {
        if (gen instanceof NFElement) {
            const d = result.integralBasis.denominatorOf(gen);
            if (d && d > 1n) {
                for (const [p] of factorInteger(d)) S.add(p);
            }
        }
    }
    result.invertedPrimes = [...S].sort((a, b) => (a < b ? -1 : 1));
    return result;
}

// ─── Helper: parse a univariate polynomial from string ───

function _parseUnivariateQ(str, varIndex) {
    // Convert "x_{i}" references to just "x" and parse
    const varName = `x_${varIndex + 1}`;
    let s = str.replace(/\s+/g, '');
    s = s.replace(/\*\*/g, '^');

    // Find max degree
    let maxDeg = 0;
    const powRegex = new RegExp(varName.replace('_', '_') + '\\^(\\d+)', 'g');
    let match;
    while ((match = powRegex.exec(s)) !== null) {
        maxDeg = Math.max(maxDeg, parseInt(match[1]));
    }
    if (s.includes(varName) && !s.includes(varName + '^')) {
        maxDeg = Math.max(maxDeg, 1);
    }

    const coeffs = new Array(maxDeg + 1).fill(null).map(() => BigRational.ZERO);

    s = s.replace(/-/g, '+-');
    const terms = s.split('+').filter(t => t.length > 0);

    for (const term of terms) {
        if (!term.includes(varName)) {
            coeffs[0] = _parseRationalCoeff(term);
        } else if (term.includes('^')) {
            const parts = term.split(varName + '^');
            let coeffStr = parts[0].replace(/\*/g, '');
            if (coeffStr === '' || coeffStr === '+') coeffStr = '1';
            if (coeffStr === '-') coeffStr = '-1';
            const power = parseInt(parts[1]);
            coeffs[power] = _parseRationalCoeff(coeffStr);
        } else {
            let coeffStr = term.replace(varName, '').replace(/\*/g, '');
            if (coeffStr === '' || coeffStr === '+') coeffStr = '1';
            if (coeffStr === '-') coeffStr = '-1';
            coeffs[1] = _parseRationalCoeff(coeffStr);
        }
    }

    return new QPolynomial(coeffs);
}

function _parseRationalCoeff(str) {
    str = str.trim();
    if (str.includes('/')) {
        const parts = str.split('/');
        return new BigRational(BigInt(parseInt(parts[0])), BigInt(parseInt(parts[1])));
    }
    return BigRational.fromInt(parseInt(str) || 0);
}

function _extractVarIndices(str) {
    const indices = new Set();
    const pattern = /x_(\d+)/g;
    let match;
    while ((match = pattern.exec(str)) !== null) {
        indices.add(parseInt(match[1]) - 1); // 0-indexed
    }
    return [...indices].sort((a, b) => a - b);
}

// ─── Resultant for primitive element ───

function _resultantForPrimitiveElement(f, g, c) {
    // Compute the minimal polynomial of α + c*β where f(α) = 0, g(β) = 0
    // This is Res_y(f(y), g(z - c*y)) where z is the variable of the result
    // We compute this by evaluating at enough points and interpolating

    const m = f.degree();
    const n = g.degree();
    const totalDeg = m * n;

    // Evaluate at z = 0, 1, 2, ..., totalDeg
    const points = [];
    for (let z = 0; z <= totalDeg; z++) {
        // Compute g(z - c*y) as a polynomial in y
        // g(t) = sum g_j * t^j, substitute t = z - c*y
        // (z - cy)^j = sum_{k=0}^{j} C(j,k) * z^{j-k} * (-cy)^k
        const gY = _substituteInY(g, z, c);
        const res = QPolynomial._sylvesterResultant(f, gY);
        points.push({ x: BigRational.fromInt(z), y: res });
    }

    // Lagrange interpolation
    const coeffs = _lagrangeInterpolation(points);
    if (!coeffs) return null;

    const result = new QPolynomial(coeffs);
    return result.isZero() ? null : result.makeMonic();
}

function _substituteInY(g, z, c) {
    // g(z - c*y) as polynomial in y
    // g(t) = sum g_j * t^j
    // t = z - c*y
    // t^j = (z - cy)^j = sum_{k=0}^{j} C(j,k) * z^{j-k} * (-c)^k * y^k
    const n = g.degree();
    const result = new Array(n + 1).fill(null).map(() => BigRational.ZERO);
    const zR = BigRational.fromInt(z);
    const cR = BigRational.fromInt(-c);

    for (let j = 0; j <= n; j++) {
        const gj = g.coeff(j);
        if (gj.isZero()) continue;

        // Compute binomial expansion of (z + (-c)*y)^j
        let zPow = BigRational.ONE; // z^{j-k}
        let cPow = BigRational.ONE; // (-c)^k
        let binom = BigRational.ONE; // C(j, k)

        // Start with k = j, zPow = 1, cPow = (-c)^0 = 1, C(j,0)=1
        // ... easier to go k from 0 to j
        let zPowers = [BigRational.ONE];
        for (let i = 1; i <= j; i++) zPowers.push(zPowers[i - 1].mul(zR));

        let cPowers = [BigRational.ONE];
        for (let i = 1; i <= j; i++) cPowers.push(cPowers[i - 1].mul(cR));

        binom = BigRational.ONE;
        for (let k = 0; k <= j; k++) {
            // C(j,k) * z^{j-k} * (-c)^k
            const contribution = binom.mul(zPowers[j - k]).mul(cPowers[k]).mul(gj);
            result[k] = result[k].add(contribution);

            // Update binomial: C(j, k+1) = C(j,k) * (j-k) / (k+1)
            if (k < j) {
                binom = binom.mul(BigRational.fromInt(j - k)).div(BigRational.fromInt(k + 1));
            }
        }
    }

    return new QPolynomial(result);
}

function _lagrangeInterpolation(points) {
    const n = points.length;
    // Compute polynomial passing through all points
    // Using Newton's form for stability

    // Divided differences
    const dd = points.map(p => p.y.clone());

    for (let j = 1; j < n; j++) {
        for (let i = n - 1; i >= j; i--) {
            dd[i] = dd[i].sub(dd[i - 1]).div(points[i].x.sub(points[i - j].x));
        }
    }

    // Convert from Newton form to standard form
    // p(x) = dd[0] + dd[1]*(x-x0) + dd[2]*(x-x0)*(x-x1) + ...
    let result = new QPolynomial([dd[n - 1]]);
    for (let i = n - 2; i >= 0; i--) {
        // result = result * (x - x_i) + dd[i]
        const shift = new QPolynomial([points[i].x.neg(), BigRational.ONE]);
        result = result.mul(shift).add(new QPolynomial([dd[i]]));
    }

    return result.coeffs;
}

// ─── Find root in extension ───

function _findRootInExtension(K, f, g, c) {
    // γ = α + c*β, so α = γ - c*β
    // α is a root of f, so find root of f in Q(γ)
    // Evaluate f at γ - c*β for each candidate β...

    // Simpler numerical approach: use roots
    const gammaRoots = K.roots();
    const fRoots = _findAllRootsNumerical(f);

    // For the first gamma root, find which f root matches
    // α should be close to a root of f that, combined with some root of g, gives γ
    const gRoots = _findAllRootsNumerical(g);

    // Try all combinations to find α such that α + c*β = γ (first root)
    const gammaVal = gammaRoots[0];

    let bestAlpha = null;
    let bestDist = Infinity;

    for (const alphaRoot of fRoots) {
        for (const betaRoot of gRoots) {
            const gammaCandidate = {
                re: alphaRoot.re + c * betaRoot.re,
                im: alphaRoot.im + c * betaRoot.im
            };
            const dist = Math.sqrt(
                (gammaCandidate.re - gammaVal.re) ** 2 +
                (gammaCandidate.im - gammaVal.im) ** 2
            );
            if (dist < bestDist) {
                bestDist = dist;
                bestAlpha = alphaRoot;
            }
        }
    }

    if (!bestAlpha) return K.zero();

    // Express alpha numerically in terms of gamma and recover exact coefficients
    // alpha = sum a_i * gamma^i, find a_i by solving a linear system numerically
    // then rationalize

    const n = K.n;
    // Build matrix: [gamma^0, gamma^1, ..., gamma^{n-1}] at each embedding
    // and solve for coefficients matching alpha at that embedding

    // Use all embeddings for overdetermined system
    const mat = [];
    const rhs = [];
    for (let e = 0; e < n; e++) {
        const gRoot = gammaRoots[e];
        // Find which alpha root pairs with this gamma root
        let aRoot = fRoots[0];
        let minD = Infinity;
        for (const ar of fRoots) {
            for (const br of gRoots) {
                const gc = { re: ar.re + c * br.re, im: ar.im + c * br.im };
                const d = Math.sqrt((gc.re - gRoot.re) ** 2 + (gc.im - gRoot.im) ** 2);
                if (d < minD) { minD = d; aRoot = ar; }
            }
        }

        const row = [];
        let gpow = { re: 1, im: 0 };
        for (let j = 0; j < n; j++) {
            row.push(gpow.re);
            gpow = cMul(gpow, gRoot);
        }
        mat.push(row);
        rhs.push(aRoot.re);
    }

    // Solve via least squares (for real part)
    const coeffsNum = _solveLinearSystem(mat, rhs, n);
    if (!coeffsNum) return K.zero();

    // Round to nearest rational with small denominator
    const coeffs = coeffsNum.map(x => _rationalApprox(x, 1000));
    return K.fromCoeffs(coeffs);
}

function _findAllRootsNumerical(poly) {
    // Create a temporary NumberField just to get roots
    const tempField = new NumberField(poly.makeMonic());
    return tempField.roots();
}

function _solveLinearSystem(mat, rhs, n) {
    // Gaussian elimination for real-valued n x n system
    const aug = mat.map((row, i) => [...row, rhs[i]]);

    for (let col = 0; col < n; col++) {
        let pivotRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[pivotRow][col])) pivotRow = row;
        }
        [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
        if (Math.abs(aug[col][col]) < 1e-10) return null;
        for (let row = col + 1; row < n; row++) {
            const factor = aug[row][col] / aug[col][col];
            for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
        }
    }

    // Back substitution
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = aug[i][n];
        for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
        x[i] /= aug[i][i];
    }
    return x;
}

function _rationalApprox(x, maxDen) {
    // Continued fraction approximation
    if (Math.abs(x) < 1e-10) return BigRational.ZERO;

    let bestNum = Math.round(x);
    let bestDen = 1;
    let bestErr = Math.abs(x - bestNum);

    for (let d = 2; d <= maxDen; d++) {
        const n = Math.round(x * d);
        const err = Math.abs(x - n / d);
        if (err < bestErr) {
            bestNum = n;
            bestDen = d;
            bestErr = err;
            if (err < 1e-10) break;
        }
    }

    return new BigRational(BigInt(bestNum), BigInt(bestDen));
}
