// Short vectors of a positive definite quadratic form on Z^k, given by a floating-point Gram matrix.
// LLL-reduce the basis (in floating point; only the search region depends on it), then Fincke–Pohst.
// Callers recompute every candidate's value exactly, so floating error can only cost candidates near
// the bound, and the bound is padded for that.

function gramOf(G, U) {
    const k = G.length, H = Array.from({ length: k }, () => new Array(k).fill(0));
    const GU = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { let s = 0; for (let l = 0; l < k; l++) s += G[i][l] * U[l][j]; GU[i][j] = s; }
    for (let i = 0; i < k; i++) for (let j = i; j < k; j++) { let s = 0; for (let l = 0; l < k; l++) s += U[l][i] * GU[l][j]; H[i][j] = H[j][i] = s; }
    return H;
}

// Gram–Schmidt data from a Gram matrix: mu[i][j] (j < i) and squared lengths b[i]
function gso(H) {
    const k = H.length, mu = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
    const r = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) {
        for (let j = 0; j <= i; j++) {
            let s = H[i][j];
            for (let l = 0; l < j; l++) s -= mu[j][l] * r[i][l];
            r[i][j] = s;
            if (j < i) mu[i][j] = s / b[j];
        }
        b[i] = r[i][i];
    }
    return { mu, b };
}

/** LLL on the basis of Z^k with Gram matrix G. Returns { U (columns = reduced basis, integer Numbers), H = UᵀGU }. */
export function lllGram(G, delta = 0.99) {
    const k = G.length;
    const U = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
    let H = G.map((r) => r.slice());
    let { mu, b } = gso(H);
    let i = 1, guard = 0;
    while (i < k && guard++ < 200000) {
        for (let j = i - 1; j >= 0; j--) {
            const q = Math.round(mu[i][j]);
            if (q) {
                for (let r = 0; r < k; r++) U[r][i] -= q * U[r][j];
                H = gramOf(G, U); ({ mu, b } = gso(H));
            }
        }
        if (b[i] >= (delta - mu[i][i - 1] ** 2) * b[i - 1]) i++;
        else {
            for (let r = 0; r < k; r++) [U[r][i], U[r][i - 1]] = [U[r][i - 1], U[r][i]];
            H = gramOf(G, U); ({ mu, b } = gso(H));
            i = Math.max(i - 1, 1);
        }
    }
    for (const row of U) for (const x of row) if (!Number.isSafeInteger(x)) throw new Error('lattice reduction overflowed');
    return { U, H };
}

/**
 * All nonzero x ∈ Z^k (one of ±x) with xᵀGx ≤ bound, as BigInt arrays. G: Number[][] (positive definite).
 * opts.max caps the number of vectors (throws beyond it).
 */
export function shortVectors(G, bound, { max = 400000, reduced = null } = {}) {
    const k = G.length;
    const { U, H } = reduced || lllGram(G);
    // Cholesky in Fincke–Pohst form: xᵀHx = Σ q[i][i] (x_i + Σ_{j>i} q[i][j] x_j)²
    const q = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) {
        let s = H[i][i];
        for (let l = 0; l < i; l++) s -= q[l][l] * q[l][i] * q[l][i];
        if (!(s > 0)) throw new Error('the form is not positive definite (numerically)');
        q[i][i] = s;
        for (let j = i + 1; j < k; j++) {
            let t = H[i][j];
            for (let l = 0; l < i; l++) t -= q[l][l] * q[l][i] * q[l][j];
            q[i][j] = t / s;
        }
    }
    const B = bound * (1 + 1e-9) + 1e-9 * Math.max(1, Math.abs(bound));
    const out = [];
    const y = new Array(k).fill(0);
    // depth-first from the last coordinate; sign normalized: the last nonzero coordinate is positive
    const rec = (i, rest, allZeroAbove) => {
        let c = 0;
        for (let j = i + 1; j < k; j++) c += q[i][j] * y[j];
        const r = Math.sqrt(Math.max(rest, 0) / q[i][i]);
        let lo = Math.ceil(-c - r - 1e-9), hi = Math.floor(-c + r + 1e-9);
        if (allZeroAbove) lo = Math.max(lo, 0);
        for (let x = lo; x <= hi; x++) {
            const t = x + c, used = q[i][i] * t * t;
            if (used > rest + 1e-9 * Math.max(1, B)) continue;
            y[i] = x;
            if (i === 0) {
                if (allZeroAbove && x === 0) continue;
                out.push(y.slice());
                if (out.length > max) throw new Error(`too many short vectors (more than ${max})`);
            } else rec(i - 1, rest - used, allZeroAbove && x === 0);
        }
        y[i] = 0;
    };
    rec(k - 1, B, true);
    // back to the original coordinates: x = U·y
    return out.map((yy) => {
        const x = new Array(k).fill(0n);
        for (let r = 0; r < k; r++) { let s = 0n; for (let c = 0; c < k; c++) if (yy[c]) s += BigInt(U[r][c]) * BigInt(yy[c]); x[r] = s; }
        return x;
    });
}

/** The value xᵀGx for an integer vector x and a Number Gram matrix (an estimate). */
export function floatValue(G, x) {
    const k = G.length;
    let s = 0;
    for (let i = 0; i < k; i++) { if (!x[i]) continue; const xi = Number(x[i]); for (let j = 0; j < k; j++) if (x[j]) s += G[i][j] * xi * Number(x[j]); }
    return s;
}
