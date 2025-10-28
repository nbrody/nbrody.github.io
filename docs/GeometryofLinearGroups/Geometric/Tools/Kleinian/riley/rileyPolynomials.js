// GCD function
function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
}

// Reduce fraction to lowest terms
function reduceFraction(p, q) {
    const g = gcd(p, q);
    return { p: p / g, q: q / g };
}

// Check if two fractions are Farey neighbors
function areFareyNeighbors(p1, q1, p2, q2) {
    return Math.abs(p2 * q1 - p1 * q2) === 1;
}

// Riley polynomial computation using Farey tree recursion
const polynomialCache = new Map();
const matrixWordCache = new Map();

function getRileyPolynomial(p, q) {
    const key = `${p}/${q}`;
    if (polynomialCache.has(key)) {
        return polynomialCache.get(key);
    }

    // Base cases
    if (p === 0 && q === 1) {
        const poly = new Polynomial([2, 0, -1]); // 2 - z^2
        polynomialCache.set(key, poly);
        matrixWordCache.set(key, 'L');
        return poly;
    }
    if (p === 1 && q === 1) {
        const poly = new Polynomial([2, 0, 1]); // 2 + z^2
        polynomialCache.set(key, poly);
        matrixWordCache.set(key, 'R');
        return poly;
    }
    if (p === 1 && q === 2) {
        const poly = new Polynomial([2, 0, 0, 0, 1]); // 2 + z^4
        polynomialCache.set(key, poly);
        matrixWordCache.set(key, 'LR');
        return poly;
    }

    // Try to find Farey neighbors and compute using recursion
    // Generate fractions with smaller denominators
    const fractions = [];
    for (let denom = 1; denom < q; denom++) {
        for (let num = 0; num <= denom; num++) {
            if (gcd(num, denom) === 1) {
                fractions.push({ p: num, q: denom });
            }
        }
    }

    // Look for Farey neighbors whose mediant is p/q
    for (let i = 0; i < fractions.length; i++) {
        for (let j = i + 1; j < fractions.length; j++) {
            const f1 = fractions[i];
            const f2 = fractions[j];

            // Check if they are Farey neighbors
            if (!areFareyNeighbors(f1.p, f1.q, f2.p, f2.q)) continue;

            // Check if mediant equals our target
            const mp = f1.p + f2.p;
            const mq = f1.q + f2.q;
            const reduced = reduceFraction(mp, mq);

            if (reduced.p === p && reduced.q === q) {
                // Found the right pair! Use recursion formula:
                // Q(p/q) = 8 - Q(a/c) * Q(b/d) - Q((b-a)/(d-c))
                const Q1 = getRileyPolynomial(f1.p, f1.q);
                const Q2 = getRileyPolynomial(f2.p, f2.q);

                const diffP = Math.abs(f2.p - f1.p);
                const diffQ = Math.abs(f2.q - f1.q);
                const diffReduced = reduceFraction(diffP, diffQ);
                const Q3 = getRileyPolynomial(diffReduced.p, diffReduced.q);

                const product = Q1.multiply(Q2);
                const sum = product.add(Q3);
                const result = Polynomial.fromConstant(8).subtract(sum);

                // Build matrix word: for mediant, concatenate parent words
                const word1 = matrixWordCache.get(`${f1.p}/${f1.q}`);
                const word2 = matrixWordCache.get(`${f2.p}/${f2.q}`);
                const word = word1 + word2;

                polynomialCache.set(key, result);
                matrixWordCache.set(key, word);
                return result;
            }
        }
    }

    // If we couldn't compute it, return null
    return null;
}

// Get the matrix word for a given rational number
function getMatrixWord(p, q) {
    const key = `${p}/${q}`;
    // Ensure polynomial is computed first (which builds the word)
    getRileyPolynomial(p, q);
    return matrixWordCache.get(key) || null;
}

// Matrix multiplication for 2x2 symbolic matrices
// Each entry is a Polynomial in z
function multiplySymbolicMatrices(M1, M2) {
    // M1 * M2 = [[a, b], [c, d]] where:
    const a = M1[0][0].multiply(M2[0][0]).add(M1[0][1].multiply(M2[1][0]));
    const b = M1[0][0].multiply(M2[0][1]).add(M1[0][1].multiply(M2[1][1]));
    const c = M1[1][0].multiply(M2[0][0]).add(M1[1][1].multiply(M2[1][0]));
    const d = M1[1][0].multiply(M2[0][1]).add(M1[1][1].multiply(M2[1][1]));
    return [[a, b], [c, d]];
}

// Compute the 2x2 matrix from a word
function computeMatrixFromWord(word) {
    // Base generators:
    // L = [[1, 0], [z, 1]] (corresponds to 0/1)
    // R = [[1, z], [0, 1]] (corresponds to 1/1)

    const L = [
        [Polynomial.fromConstant(1), Polynomial.fromConstant(0)],
        [new Polynomial([0, 1]), Polynomial.fromConstant(1)]  // z
    ];

    const R = [
        [Polynomial.fromConstant(1), new Polynomial([0, 1])],  // z
        [Polynomial.fromConstant(0), Polynomial.fromConstant(1)]
    ];

    // Start with identity
    let result = [
        [Polynomial.fromConstant(1), Polynomial.fromConstant(0)],
        [Polynomial.fromConstant(0), Polynomial.fromConstant(1)]
    ];

    // Multiply by each letter in the word
    for (let i = 0; i < word.length; i++) {
        if (word[i] === 'L') {
            result = multiplySymbolicMatrices(result, L);
        } else if (word[i] === 'R') {
            result = multiplySymbolicMatrices(result, R);
        }
    }

    return result;
}

// Format matrix for LaTeX display
function formatMatrixLatex(matrix) {
    const a = matrix[0][0].toLatex();
    const b = matrix[0][1].toLatex();
    const c = matrix[1][0].toLatex();
    const d = matrix[1][1].toLatex();
    return `\\begin{pmatrix}${a} & ${b} \\\\ ${c} & ${d}\\end{pmatrix}`;
}
