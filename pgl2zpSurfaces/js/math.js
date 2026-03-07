/* ============================================================
   math.js – Matrix and permutation algebra
   ============================================================ */

// ---------- 2×2 matrix operations ----------

export const ID2 = [[1, 0], [0, 1]];
export const A = [[2, 1], [1, 1]];
export const B = [[2, -1], [-1, 1]];

export function mulMat(X, Y) {
    return [
        [X[0][0] * Y[0][0] + X[0][1] * Y[1][0], X[0][0] * Y[0][1] + X[0][1] * Y[1][1]],
        [X[1][0] * Y[0][0] + X[1][1] * Y[1][0], X[1][0] * Y[0][1] + X[1][1] * Y[1][1]],
    ];
}

export function invMat(M) {
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    return [[M[1][1] / det, -M[0][1] / det], [-M[1][0] / det, M[0][0] / det]];
}

export const Ainv = invMat(A);
export const Binv = invMat(B);

export function fmtMat(M) {
    return `[[${M[0][0]}, ${M[0][1]}], [${M[1][0]}, ${M[1][1]}]]`;
}

/** Apply a word in {a,A,b,B} to get a 2×2 integer matrix */
export function wordToMatrix(word) {
    let M = [[1, 0], [0, 1]];
    for (const ch of word) {
        if (ch === 'a') M = mulMat(M, A);
        else if (ch === 'A') M = mulMat(M, Ainv);
        else if (ch === 'b') M = mulMat(M, B);
        else if (ch === 'B') M = mulMat(M, Binv);
    }
    return M.map(r => r.map(x => Math.round(x)));
}

/** Cancel inverse pairs */
export function reduceWord(w) {
    const inv = { a: 'A', A: 'a', b: 'B', B: 'b' };
    const out = [];
    for (const ch of w) {
        if (out.length && inv[ch] === out[out.length - 1]) out.pop();
        else out.push(ch);
    }
    return out.join('');
}

export function invertWord(w) {
    const inv = { a: 'A', A: 'a', b: 'B', B: 'b' };
    return w.split('').reverse().map(ch => inv[ch]).join('');
}

/** Möbius action: M · z  where z = {x, y} in upper half-plane */
export function mobiusAction(M, z) {
    const a = M[0][0], b = M[0][1], c = M[1][0], d = M[1][1];
    const denom = (c * z.x + d) * (c * z.x + d) + (c * z.y) * (c * z.y);
    return {
        x: ((a * z.x + b) * (c * z.x + d) + a * c * z.y * z.y) / denom,
        y: (z.y * (a * d - b * c)) / denom
    };
}

// ---------- Permutation operations ----------

export function identityPerm(n) { return Array.from({ length: n }, (_, i) => i); }

export function compose(p, q) { return q.map(i => p[i]); }

export function inversePerm(p) {
    const inv = Array(p.length);
    for (let i = 0; i < p.length; i++) inv[p[i]] = i;
    return inv;
}

export function cycleDecomposition(p) {
    const n = p.length;
    const seen = Array(n).fill(false);
    const cycles = [];
    for (let i = 0; i < n; i++) {
        if (seen[i]) continue;
        const cyc = [];
        let x = i;
        while (!seen[x]) { seen[x] = true; cyc.push(x); x = p[x]; }
        cycles.push(cyc);
    }
    return cycles;
}

export function commutatorPerm(a, b) {
    const ainv = inversePerm(a), binv = inversePerm(b);
    return compose(compose(compose(a, b), ainv), binv);
}

export function orbitTransitive(gens) {
    const n = gens[0].length;
    const seen = Array(n).fill(false);
    const q = [0];
    seen[0] = true;
    while (q.length) {
        const v = q.shift();
        for (const g of gens) {
            const w = g[v];
            if (!seen[w]) { seen[w] = true; q.push(w); }
        }
    }
    return seen.every(Boolean);
}

export function isPrime(n) {
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
    return true;
}

// ---------- Seeded PRNG ----------

export class RNG {
    constructor(seed) { this.state = (seed >>> 0) || 1; }
    next() {
        let x = this.state;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.state = x >>> 0;
        return this.state / 4294967296;
    }
    int(n) { return Math.floor(this.next() * n); }
}

export function randomPerm(n, rng) {
    const arr = identityPerm(n);
    for (let i = n - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
