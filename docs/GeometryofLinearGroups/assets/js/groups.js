/**
 * Multiply two 2x2 matrices.
 * @param {number[][]} A - 2x2 matrix
 * @param {number[][]} B - 2x2 matrix
 * @returns {number[][]}
 */
function matMul2(A, B) {
  return [
    [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
    [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]
  ];
}

/**
 * Inverse of a 2x2 matrix.
 * @param {number[][]} M - 2x2 matrix
 * @returns {number[][]}
 */
function matInv2(M) {
  const [a, b] = M[0];
  const [c, d] = M[1];
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-15) throw new Error("Matrix not invertible (det≈0)");
  const invDet = 1 / det;
  return [
    [ d * invDet, -b * invDet],
    [-c * invDet,  a * invDet]
  ];
}

/**
 * Round a number to a fixed tolerance for hashing.
 */
function roundTol(x, tol = 1e-12) {
  return Math.abs(x) < tol ? 0 : +x.toFixed(12);
}

/**
 * Create a stable string key for a matrix (used to deduplicate results).
 * @param {number[][]} M
 * @param {number} tol
 */
function matKey(M, tol = 1e-12) {
  return JSON.stringify([
    [roundTol(M[0][0], tol), roundTol(M[0][1], tol)],
    [roundTol(M[1][0], tol), roundTol(M[1][1], tol)]
  ]);
}

/**
 * Pretty-print a word given as an array of {i, s} where i is 1-based generator index and s in {+1,-1}.
 * @param {{i:number, s:1|-1}[]} word
 */
function wordToString(word) {
  if (word.length === 0) return "Id";
  return word.map(w => (w.s === 1 ? `g${w.i}` : `g${w.i}^-1`)).join(" ");
}

/**
 * Generate group elements up to a given word length from generators and their inverses.
 * Avoids immediate cancellations so words are freely reduced.
 * Deduplicates matrices (keeps the first word that yields each matrix).
 *
 * @param {number[][][]} gens - array of 2x2 matrices [ [a,b],[c,d] ]
 * @param {number} length - positive integer maximum reduced word length
 * @returns {{matrix:number[][], wordIndices:{i:number,s:1|-1}[], word:string, length:number}[]} results
 */
function generateGroup(gens, length) {
  if (!Array.isArray(gens) || gens.length === 0) throw new Error("gens must be a nonempty array of 2x2 matrices");
  if (!(Number.isInteger(length) && length >= 0)) throw new Error("length must be a nonnegative integer");

  // Precompute inverses
  const invs = gens.map(matInv2);

  // Each step we append one of 2*gens.length symbols
  const symMul = (sym, M) => {
    const idx = Math.abs(sym) - 1; // 0-based index
    const use = sym > 0 ? gens[idx] : invs[idx];
    return matMul2(use, M);
  };

  const results = [];
  const seen = new Map(); // matKey -> {matrix, wordIndices, word, length}

  // Start with identity
  const I = [[1,0],[0,1]];
  const idObj = { matrix: I, wordIndices: [], word: "Id", length: 0 };
  results.push(idObj);
  seen.set(matKey(I), idObj);

  if (length === 0) return results;

  // Frontier holds tuples: current matrix, reduced word indices
  let frontier = [idObj];

  for (let L = 1; L <= length; L++) {
    const next = [];

    for (const node of frontier) {
      // Determine last symbol to avoid immediate cancellation
      const last = node.wordIndices.length ? node.wordIndices[node.wordIndices.length - 1] : null;

      for (let i = 1; i <= gens.length; i++) {
        for (const s of [1, -1]) {
          // Avoid appending g * g^{-1} (immediate cancellation)
          if (last && last.i === i && last.s === -s) continue;

          const newWord = node.wordIndices.concat({ i, s });
          // Compute matrix = (symbol)... * node.matrix (left-multiply for natural action on basepoint)
          const sym = s > 0 ? +i : -i;
          const newMat = symMul(sym, node.matrix);
          const key = matKey(newMat);

          if (!seen.has(key)) {
            const obj = {
              matrix: newMat,
              wordIndices: newWord,
              word: wordToString(newWord),
              length: L
            };
            seen.set(key, obj);
            results.push(obj);
            next.push(obj);
          }
        }
      }
    }

    frontier = next; // BFS layer advance
    if (frontier.length === 0) break; // nothing new discovered
  }

  return results;
}

// Expose in browser environments
if (typeof window !== 'undefined') {
  window.generateGroup = generateGroup;
}

// Export for module environments
export { generateGroup };
