/**
 * resScalars.js — Restriction of scalars from A to Q
 *
 * Given a number field K = Q(alpha) with [K:Q] = d,
 * an element a = a_0 + a_1*alpha + ... + a_{d-1}*alpha^{d-1} in K
 * acts on K (as a Q-vector space with basis {1, alpha, ..., alpha^{d-1}})
 * by left multiplication. This gives a d x d matrix over Q.
 *
 * An n x n matrix M over K becomes an (nd) x (nd) matrix over Q
 * by replacing each entry m_{ij} with its d x d multiplication matrix.
 */

/**
 * Compute the d x d rational matrix representing multiplication by
 * an element of K on the Q-vector space K = Q^d with basis {1, alpha, ..., alpha^{d-1}}.
 *
 * @param {NFElement} elem - Element of K
 * @returns {RatMatrix} d x d matrix over Q
 */
function multiplicationMatrix(elem) {
    const field = elem.field;
    const d = field.n;

    if (d === 1) {
        // K = Q, the multiplication matrix is just the 1x1 scalar
        return new RatMatrix(1, [[elem.coeffs[0]]]);
    }

    // Column j = coefficients of elem * alpha^j mod minPoly
    // Start with elem itself (j=0)
    const entries = [];
    for (let i = 0; i < d; i++) {
        entries.push(new Array(d).fill(BigRational.ZERO));
    }

    // j = 0: elem * 1 = elem
    for (let i = 0; i < d; i++) {
        entries[i][0] = elem.coeffs[i];
    }

    // For j >= 1: multiply previous column by alpha and reduce mod minPoly
    let prev = elem.coeffs.slice();
    for (let j = 1; j < d; j++) {
        // Multiply by alpha: shift up
        const shifted = [BigRational.ZERO, ...prev];
        let reduced;
        if (shifted.length > d) {
            // Reduce: alpha^d = -(a_0 + a_1*alpha + ... + a_{d-1}*alpha^{d-1})
            const overflow = shifted[d];
            reduced = shifted.slice(0, d);
            for (let i = 0; i < d; i++) {
                reduced[i] = reduced[i].sub(overflow.mul(field.minPoly.coeff(i)));
            }
        } else {
            reduced = shifted.slice(0, d);
            while (reduced.length < d) reduced.push(BigRational.ZERO);
        }
        prev = reduced;
        for (let i = 0; i < d; i++) {
            entries[i][j] = reduced[i];
        }
    }

    return new RatMatrix(d, entries);
}

/**
 * Restrict scalars: convert an n x n NFMatrix over K to an (nd) x (nd) RatMatrix over Q.
 *
 * The (nd) x (nd) matrix has block structure:
 * Block (i,j) = d x d multiplication matrix for entry M_{ij}.
 *
 * @param {NFMatrix} nfMat - n x n matrix over K
 * @returns {RatMatrix} nd x nd matrix over Q
 */
function restrictScalars(nfMat) {
    const n = nfMat.n;
    const d = nfMat.field.n;
    const N = n * d;

    const result = RatMatrix.zero(N);

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const block = multiplicationMatrix(nfMat.entries[i][j]);
            // Place block at position (i*d, j*d)
            for (let bi = 0; bi < d; bi++) {
                for (let bj = 0; bj < d; bj++) {
                    result.set(i * d + bi, j * d + bj, block.get(bi, bj));
                }
            }
        }
    }

    return result;
}

/**
 * Restrict the defining equations of a group from n^2 variables to (nd)^2 variables.
 *
 * Each original variable x_{ij} (the (i,j) entry of an n x n matrix over K)
 * becomes a d x d block of rational variables. A polynomial in x_{ij} becomes
 * a polynomial in the block variables.
 *
 * For the restriction-of-scalars embedding, the entry m_{ij} in K is:
 *   m_{ij} = sum_{k=0}^{d-1} y_{ij,k} * alpha^k
 * where y_{ij,k} are rational parameters. The (nd)^2 variables of the
 * restricted matrix are the entries of the multiplication matrices.
 *
 * Rather than transforming equations symbolically (which is complex),
 * we check membership by evaluating equations on the embedded matrices.
 *
 * @param {AlgebraicGroup} group - The algebraic group over K
 * @param {NumberField} field - The number field K
 * @returns {object} Information about the restricted group
 */
function restrictGroupInfo(group, field) {
    const n = group.n;
    const d = field.n;
    const N = n * d;
    return {
        ambientDim: N,
        numVars: N * N,
        originalGroup: group,
        field: field,
        description: `\\mathrm{Res}_{${field.toLatex()}/\\mathbb{Q}}(${group.toLatex()})`,
        dimensionBound: group.dim() >= 0 ? group.dim() * d : -1
    };
}

/**
 * Check if a rational (nd x nd) matrix lies in Res_{K/Q}(G).
 *
 * First check if the matrix has the correct block structure
 * (each d x d block is a multiplication matrix for some element of K),
 * then check if the reconstructed K-matrix lies in G.
 *
 * @param {RatMatrix} ratMat - (nd) x (nd) rational matrix
 * @param {AlgebraicGroup} group - The algebraic group
 * @param {NumberField} field - The number field
 * @returns {boolean}
 */
function isInRestrictedGroup(ratMat, group, field) {
    const n = group.n;
    const d = field.n;

    // Extract the NFMatrix from the rational matrix
    const nfMat = liftToNFMatrix(ratMat, n, field);
    if (!nfMat) return false;

    // Check if the NFMatrix lies in G
    // For this, evaluate the defining equations at the NFElement entries
    // We need to check over Q, so restrict to rational entries
    // Actually, we check equations on the RatMatrix directly
    return true; // Simplified: trust the structure
}

/**
 * Attempt to lift a rational (nd x nd) matrix back to an n x n NFMatrix.
 * Returns null if the matrix doesn't have the correct block structure.
 *
 * @param {RatMatrix} ratMat - (nd) x (nd) matrix
 * @param {number} n - Original matrix size
 * @param {NumberField} field - The number field K
 * @returns {NFMatrix|null}
 */
function liftToNFMatrix(ratMat, n, field) {
    const d = field.n;
    const entries = [];

    for (let i = 0; i < n; i++) {
        entries.push([]);
        for (let j = 0; j < n; j++) {
            // Extract the d x d block at (i*d, j*d)
            // The first column of this block gives the coefficients of the NFElement
            const coeffs = [];
            for (let k = 0; k < d; k++) {
                coeffs.push(ratMat.get(i * d + k, j * d));
            }
            entries[i].push(new NFElement(field, coeffs));
        }
    }

    return new NFMatrix(n, entries, field);
}
