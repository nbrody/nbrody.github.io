/**
 * zariskiEngine.js — Compute the Zariski closure of a finitely generated
 * subgroup of an algebraic group, following the approach of
 * Derksen-Jeandel-Koiran (2005).
 *
 * Algorithm:
 * 1. Restrict scalars to get rational matrices in GL_{nd}(Q)
 * 2. Enumerate group elements (words in generators and inverses)
 * 3. Compute the vanishing ideal by finding the kernel of the evaluation map
 *    on the space of polynomials of bounded degree
 * 4. Increase degree bound until the ideal stabilizes
 * 5. Intersect with ambient group equations
 */

class ZariskiClosureResult {
    constructor() {
        this.ideal = [];                // QMvPoly[] — generators of vanishing ideal
        this.dimension = -1;            // dimension of the closure
        this.numVars = 0;               // number of variables (N^2 where N = nd)
        this.matrixSize = 0;            // N = nd
        this.originalMatrixSize = 0;    // n
        this.fieldDegree = 0;           // d
        this.numPoints = 0;             // number of group elements enumerated
        this.maxWordLength = 0;         // max word length enumerated
        this.degBound = 0;             // polynomial degree bound used
        this.description = '';
        this.generators = [];           // RatMatrix[] — the restricted generators
        this.samplePoints = [];         // RatMatrix[] — enumerated group elements
        this.stats = {};
    }
}

/**
 * Main entry point: compute the Zariski closure.
 *
 * @param {NFMatrix[]} generators - Generators as matrices over the number field
 * @param {AlgebraicGroup} group - The ambient algebraic group
 * @param {NumberField} field - The number field K
 * @param {object} options - { maxDeg, maxWordLength, maxPoints, progressCallback }
 * @returns {ZariskiClosureResult}
 */
function computeZariskiClosure(generators, group, field, options = {}) {
    const maxDeg = options.maxDeg || 2;
    const maxWordLength = options.maxWordLength || 6;
    const maxPoints = options.maxPoints || 200;
    const progress = options.progressCallback || (() => {});

    const result = new ZariskiClosureResult();
    const n = group.n;
    const d = field.n;
    const N = n * d;
    result.matrixSize = N;
    result.originalMatrixSize = n;
    result.fieldDegree = d;
    result.numVars = N * N;

    progress('Restricting scalars...');

    // Step 1: Restrict scalars for each generator
    const ratGens = generators.map(g => restrictScalars(g));
    result.generators = ratGens;

    // Also compute inverses
    const ratGenInvs = [];
    for (const g of generators) {
        try {
            ratGenInvs.push(restrictScalars(g.inv()));
        } catch (e) {
            // Generator not invertible; skip its inverse
        }
    }

    // Step 2: Enumerate group elements by word length
    progress('Enumerating group elements...');
    const points = []; // Array of flat BigRational[] vectors (N^2 entries each)
    const pointSet = new Set(); // For deduplication

    // Add identity
    const identity = RatMatrix.identity(N);
    _addPoint(identity, points, pointSet, N);

    // Add generators and their inverses
    for (const g of ratGens) _addPoint(g, points, pointSet, N);
    for (const g of ratGenInvs) _addPoint(g, points, pointSet, N);

    // BFS: enumerate words of increasing length
    const allGens = [...ratGens, ...ratGenInvs];
    let frontier = [...ratGens, ...ratGenInvs]; // words of length 1

    for (let wordLen = 2; wordLen <= maxWordLength && points.length < maxPoints; wordLen++) {
        progress(`Enumerating words of length ${wordLen}... (${points.length} points)`);
        const newFrontier = [];
        for (const word of frontier) {
            for (const gen of allGens) {
                if (points.length >= maxPoints) break;
                const product = word.mul(gen);
                if (_addPoint(product, points, pointSet, N)) {
                    newFrontier.push(product);
                }
            }
            if (points.length >= maxPoints) break;
        }
        if (newFrontier.length === 0) break; // No new elements found
        frontier = newFrontier;
        result.maxWordLength = wordLen;
    }

    result.numPoints = points.length;
    result.samplePoints = points.map(pt => _pointToMatrix(pt, N));

    // Step 3: Compute vanishing ideal
    progress('Computing vanishing ideal...');

    // For each degree D from 1 to maxDeg, compute the kernel
    let prevKernelDim = -1;
    let idealPolys = [];

    for (let deg = 1; deg <= maxDeg; deg++) {
        progress(`Computing vanishing ideal (degree ${deg})...`);

        const monomials = _allMonomials(N * N, deg);
        if (monomials.length === 0) continue;

        // Build evaluation matrix: each row is a point, each column is a monomial
        // We want the KERNEL: polynomials that vanish on all points
        // Transpose: rows = points, cols = monomials
        const evalMatrix = [];
        for (const pt of points) {
            const row = [];
            for (const mono of monomials) {
                row.push(_evaluateMonomial(mono, pt));
            }
            evalMatrix.push(row);
        }

        // Compute kernel (null space) of the evaluation matrix
        const kernel = _computeKernel(evalMatrix, monomials.length);
        const kernelDim = kernel.length;

        // Convert kernel vectors to polynomials
        const newPolys = [];
        for (const vec of kernel) {
            const poly = _vectorToPoly(vec, monomials, N * N);
            if (!poly.isZero()) {
                newPolys.push(poly);
            }
        }

        idealPolys = newPolys;
        result.degBound = deg;

        // Check stabilization
        if (kernelDim === prevKernelDim && deg > 1) {
            // Ideal has stabilized at this degree
            break;
        }
        prevKernelDim = kernelDim;
    }

    // Step 4: Intersect with ambient group equations
    // Add the group's defining equations (after restricting scalars)
    // For simplicity, we include them as additional constraints
    // The ambient group equations are in the original n^2 variables;
    // for d = 1 we can use them directly, otherwise we need to translate
    if (d === 1 && group.equations.length > 0) {
        for (const eq of group.equations) {
            // Check that this equation is not already implied by idealPolys
            let alreadyImplied = false;
            for (const ip of idealPolys) {
                if (ip.equals && ip.equals(eq)) { alreadyImplied = true; break; }
            }
            if (!alreadyImplied) {
                idealPolys.push(eq);
            }
        }
    }

    // Step 5: Simplify — compute reduced Gröbner basis if feasible
    progress('Computing Gröbner basis...');
    if (idealPolys.length > 0 && idealPolys.length <= 50 && N * N <= 16) {
        try {
            const gbResult = buchbergerQ(idealPolys, 'grevlex', { maxIterations: 300 });
            idealPolys = gbResult.basis;
            result.stats = gbResult.stats;
        } catch (e) {
            // Gröbner basis computation failed; keep raw ideal
            result.stats = { error: e.message };
        }
    }

    result.ideal = idealPolys;
    result.dimension = _estimateDimension(N * N, idealPolys, points);
    result.description = _describeIdeal(idealPolys, N, n, d, group);

    return result;
}

// ─── Point management ───

function _addPoint(mat, points, pointSet, N) {
    const flat = mat.flatEntries();
    const key = flat.map(e => e.toString()).join(',');
    if (pointSet.has(key)) return false;
    pointSet.add(key);
    points.push(flat);
    return true;
}

function _pointToMatrix(flat, N) {
    const entries = [];
    for (let i = 0; i < N; i++) {
        entries.push(flat.slice(i * N, (i + 1) * N));
    }
    return new RatMatrix(N, entries);
}

// ─── Monomial enumeration ───

/**
 * Generate all monomials in `numVars` variables of total degree exactly `deg`.
 * Returns array of exponent vectors.
 *
 * For efficiency, we limit to monomials that actually appear in the data.
 * For small N^2 and small degree, enumerate all.
 */
function _allMonomials(numVars, maxDeg) {
    const result = [];

    // Include constant (degree 0)
    result.push(new Array(numVars).fill(0));

    // For large numVars, only use "active" variables
    // (variables that are not constant across all points)
    // This is handled externally; here we enumerate all

    const generate = (varIdx, remainingDeg, current) => {
        if (varIdx === numVars) {
            if (Mono.deg(current) > 0) {
                result.push(current.slice());
            }
            return;
        }
        for (let d = 0; d <= remainingDeg; d++) {
            current[varIdx] = d;
            generate(varIdx + 1, remainingDeg - d, current);
        }
        current[varIdx] = 0;
    };

    // For large variable counts, limit to degree-1 monomials and selected degree-2
    if (numVars > 8) {
        // Degree 1 monomials
        for (let i = 0; i < numVars; i++) {
            const exp = new Array(numVars).fill(0);
            exp[i] = 1;
            result.push(exp);
        }
        // Degree 2 monomials (only if maxDeg >= 2)
        if (maxDeg >= 2) {
            for (let i = 0; i < numVars; i++) {
                // x_i^2
                const exp1 = new Array(numVars).fill(0);
                exp1[i] = 2;
                result.push(exp1);
                // x_i * x_j for j > i
                for (let j = i + 1; j < numVars; j++) {
                    const exp2 = new Array(numVars).fill(0);
                    exp2[i] = 1;
                    exp2[j] = 1;
                    result.push(exp2);
                }
            }
        }
    } else {
        generate(0, maxDeg, new Array(numVars).fill(0));
    }

    return result;
}

// ─── Monomial evaluation ───

function _evaluateMonomial(exp, point) {
    let result = BigRational.ONE;
    for (let i = 0; i < exp.length; i++) {
        if (exp[i] > 0) {
            result = result.mul(point[i].pow(exp[i]));
        }
    }
    return result;
}

// ─── Kernel computation (null space over Q) ───

/**
 * Compute the kernel (null space) of a matrix over Q.
 * Input: matrix[rows][cols] of BigRational
 * Output: array of kernel vectors (each is BigRational[cols])
 */
function _computeKernel(matrix, numCols) {
    if (matrix.length === 0) return [];

    const numRows = matrix.length;
    // Transpose: we want the null space of the matrix
    // i.e., vectors v such that M * v = 0 (where M has rows = points, cols = monomials)
    // This is the right null space.

    // Row-reduce the matrix to find pivot columns and free variables
    const m = matrix.map(r => r.map(e => e.clone()));
    const pivotCols = [];
    let pivotRow = 0;

    for (let col = 0; col < numCols && pivotRow < numRows; col++) {
        // Find pivot
        let p = -1;
        for (let row = pivotRow; row < numRows; row++) {
            if (!m[row][col].isZero()) { p = row; break; }
        }
        if (p === -1) continue; // Free variable

        // Swap rows
        if (p !== pivotRow) [m[pivotRow], m[p]] = [m[p], m[pivotRow]];

        // Scale pivot row
        const pivotVal = m[pivotRow][col];
        const pivotInv = pivotVal.inv();
        for (let j = col; j < numCols; j++) {
            m[pivotRow][j] = m[pivotRow][j].mul(pivotInv);
        }

        // Eliminate column
        for (let row = 0; row < numRows; row++) {
            if (row === pivotRow || m[row][col].isZero()) continue;
            const factor = m[row][col];
            for (let j = col; j < numCols; j++) {
                m[row][j] = m[row][j].sub(factor.mul(m[pivotRow][j]));
            }
        }

        pivotCols.push({ col, row: pivotRow });
        pivotRow++;
    }

    // Identify free variables
    const pivotColSet = new Set(pivotCols.map(p => p.col));
    const freeCols = [];
    for (let col = 0; col < numCols; col++) {
        if (!pivotColSet.has(col)) freeCols.push(col);
    }

    // For each free variable, construct a kernel vector
    const kernel = [];
    for (const freeCol of freeCols) {
        const vec = new Array(numCols).fill(null).map(() => BigRational.ZERO);
        vec[freeCol] = BigRational.ONE;

        // For each pivot column, the corresponding entry is negative of the
        // reduced row echelon entry in the free variable's column
        for (const { col: pivCol, row: pivRow } of pivotCols) {
            vec[pivCol] = m[pivRow][freeCol].neg();
        }

        kernel.push(vec);
    }

    return kernel;
}

// ─── Convert kernel vector to polynomial ───

function _vectorToPoly(vec, monomials, numVars) {
    const terms = new Map();
    for (let i = 0; i < vec.length; i++) {
        if (vec[i].isZero()) continue;
        const exp = Mono.pad(monomials[i].slice(), numVars);
        terms.set(Mono.key(exp), vec[i]);
    }
    return new QMvPoly(numVars, terms);
}

// ─── Dimension estimation ───

function _estimateDimension(numVars, ideal, points) {
    // Simple estimate: dimension = numVars - number of independent equations
    // More precisely, count the rank of the Jacobian at a generic point
    if (ideal.length === 0) return numVars;
    if (points.length === 0) return numVars - ideal.length;

    // Evaluate Jacobian at the first (non-identity) point
    const point = points.length > 1 ? points[1] : points[0];

    // Build Jacobian matrix: rows = equations, cols = variables
    const jacobian = [];
    for (const poly of ideal) {
        const row = [];
        for (let v = 0; v < numVars; v++) {
            // Partial derivative of poly w.r.t. variable v, evaluated at point
            row.push(_partialDerivativeEval(poly, v, point));
        }
        jacobian.push(row);
    }

    // Compute rank of Jacobian
    const rank = _matrixRank(jacobian);
    return numVars - rank;
}

function _partialDerivativeEval(poly, varIdx, point) {
    // d/dx_v of sum c * prod x_i^{e_i} = sum c * e_v * x_v^{e_v-1} * prod_{i!=v} x_i^{e_i}
    let result = BigRational.ZERO;
    for (const [key, coeff] of poly.terms) {
        const exp = Mono.fromKey(key);
        if (varIdx >= exp.length || exp[varIdx] === 0) continue;
        const newCoeff = coeff.mul(BigRational.fromInt(exp[varIdx]));
        let term = newCoeff;
        for (let i = 0; i < exp.length; i++) {
            const power = (i === varIdx) ? exp[i] - 1 : exp[i];
            if (power > 0 && i < point.length) {
                term = term.mul(point[i].pow(power));
            }
        }
        result = result.add(term);
    }
    return result;
}

function _matrixRank(matrix) {
    if (matrix.length === 0) return 0;
    const numRows = matrix.length;
    const numCols = matrix[0].length;
    const m = matrix.map(r => r.map(e => e.clone()));

    let rank = 0;
    for (let col = 0; col < numCols && rank < numRows; col++) {
        let p = -1;
        for (let row = rank; row < numRows; row++) {
            if (!m[row][col].isZero()) { p = row; break; }
        }
        if (p === -1) continue;
        if (p !== rank) [m[rank], m[p]] = [m[p], m[rank]];
        const pivotInv = m[rank][col].inv();
        for (let row = rank + 1; row < numRows; row++) {
            if (m[row][col].isZero()) continue;
            const factor = m[row][col].mul(pivotInv);
            for (let j = col; j < numCols; j++) {
                m[row][j] = m[row][j].sub(factor.mul(m[rank][j]));
            }
        }
        rank++;
    }
    return rank;
}

// ─── Ideal description ───

function _describeIdeal(ideal, N, n, d, group) {
    if (ideal.length === 0) {
        return `The Zariski closure is all of \\(\\mathrm{Res}_{K/\\mathbb{Q}}(${group.toLatex()})\\).`;
    }

    // Check for known patterns
    const numVars = N * N;

    // Count linear vs. higher-degree equations
    let numLinear = 0;
    let numQuadratic = 0;
    for (const p of ideal) {
        const lt = p.leadingTerm('grevlex');
        if (!lt) continue;
        const deg = Mono.deg(lt.exp);
        if (deg === 1) numLinear++;
        else if (deg === 2) numQuadratic++;
    }

    let desc = `The Zariski closure is defined by ${ideal.length} equation${ideal.length > 1 ? 's' : ''}`;
    if (numLinear > 0) desc += ` (${numLinear} linear`;
    if (numQuadratic > 0) desc += numLinear > 0 ? `, ${numQuadratic} quadratic` : ` (${numQuadratic} quadratic`;
    if (numLinear > 0 || numQuadratic > 0) desc += ')';
    desc += ` in \\(${numVars}\\) variables`;
    desc += ` (${N} \\times ${N} matrices over \\(\\mathbb{Q}\\)).`;

    return desc;
}

// ─── Variable names for display ───

function zariskiVarNames(N) {
    const names = [];
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            names.push(`y_{${i + 1},${j + 1}}`);
        }
    }
    return names;
}
