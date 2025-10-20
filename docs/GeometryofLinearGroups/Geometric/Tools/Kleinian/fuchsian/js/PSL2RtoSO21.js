// Given g = [[a,b],[c,d]] in SL(2,R), compute the corresponding element of SO^+(2,1)
// via the standard action on 2x2 symmetric matrices: H -> g H g^T.
// We identify Minkowski vectors (x,y,t) with symmetric matrices
//   H(x,y,t) = [[t + x, y], [y, t - x]]
// so that det(H) = (t+x)(t-x) - y^2 = t^2 - x^2 - y^2.
// The resulting 3x3 real matrix Λ satisfies v' = Λ v for v ∈ R^{2,1}.

// 2x2 real matrix helpers
function matMul2(A, B) {
    return [
        [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
        [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]]
    ];
}

function matTranspose2(A) {
    return [
        [A[0][0], A[1][0]],
        [A[0][1], A[1][1]]
    ];
}

// ------------------ Minkowski <-> Symmetric ------------------
function symmetricFromVec(v) {
    const [x, y, t] = v;
    return [
        [t + x, y],
        [y, t - x]
    ];
}

function vecFromSymmetric(H) {
    const x = (H[0][0] - H[1][1]) / 2;
    const y = H[0][1];  // = H[1][0] by symmetry
    const t = (H[0][0] + H[1][1]) / 2;
    return [x, y, t];
}

// ------------------ Main map: PSL(2,R) -> SO(2,1) ------------------
function PSL2RtoSO21(a, b, c, d) {
    const g = [[a, b], [c, d]];
    const gT = matTranspose2(g);

    // Compute Λ by applying g H g^T to basis vectors
    const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    const columns = basis.map(v => {
        const H = symmetricFromVec(v);
        const gHgT = matMul2(matMul2(g, H), gT);
        return vecFromSymmetric(gHgT);
    });

    // Build 3x3 matrix from columns
    const Lambda = Array.from({ length: 3 }, (_, r) =>
        columns.map(col => {
            const val = col[r];
            const eps = 1e-8;
            return Math.abs(val) < eps ? 0 : val;
        })
    );

    return Lambda;
}

// ------------------ sDF utilities for SO(2,1) ------------------
const __ETA = [+1, +1, -1];  // Metric signature for R^{2,1}

function __etaApply(v) {
    return [v[0], v[1], -v[2]];
}

function __stdBasis(j) {
    return [0, 0, 0].map((_, k) => (k === j ? 1 : 0));
}

function __ginv_ej(g, j) {
    // Using g^{-1} = η g^T η with η = diag(+1,+1,-1).
    // Column j of g^{-1} equals: w_i = η_{ii} * g_{j i} * η_{jj}.
    const r = g[j];                 // row j of g
    const sj = (j === 2) ? -1 : +1;  // η_{jj}
    return [
        (+1) * r[0] * sj,           // η_{00} = +1
        (+1) * r[1] * sj,           // η_{11} = +1
        (-1) * r[2] * sj            // η_{22} = -1
    ];
}

function sDF_autoFromSO21(g) {
    if (!Array.isArray(g) || g.length !== 3 || g.some(r => !Array.isArray(r) || r.length !== 3)) {
        throw new Error('sDF_autoFromSO21 expects a 3x3 matrix');
    }

    const eps = 1e-8;

    // Try each basis vector (prioritize e_2 for timelike direction)
    for (let j = 2; j >= 0; j--) {
        const s = __ETA[j];
        const w = __ginv_ej(g, j);
        const denom = s * (w[j] - 1);

        if (Math.abs(denom) < eps) {
            continue;
        }

        const e = __stdBasis(j);
        const u = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
        const eta_u = __etaApply(u);
        let row = [...eta_u];

        // Flip sign for timelike component
        if (j === 2) {
            for (let i = 0; i < row.length; i++) row[i] = -row[i];
        }

        return { row, pivot: j };
    }

    throw new Error('sDF undefined: g fixes all basis vectors e₀, e₁, e₂');
}

// ------------------ Public API ------------------
(function attachPSL2RtoSDFNamespace(){
    try {
        var API = {
            PSL2RtoSO21: PSL2RtoSO21,
            sDF_autoFromSO21: sDF_autoFromSO21,
            symmetricFromVec: symmetricFromVec,
            vecFromSymmetric: vecFromSymmetric
        };

        var nsName = 'PSL2RtoSDF';
        var root = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
        if (root && !root[nsName]) {
            root[nsName] = API;
        }

        // CommonJS / Node-style export
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = API;
        }
    } catch (e) {
        // no-op: namespace attach is best-effort
    }
})();
