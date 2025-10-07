// Given g = [[a,b],[c,d]] in SL2(C), compute the corresponding element of SO^+(3,1)
// via the standard action on 2x2 Hermitian matrices: H -> g H g^†.
// We identify Minkowski vectors (x,y,z,t) with Hermitian matrices
//   H(t,x,y,z) = [[t + z, x + i y], [x - i y, t - z]]
// so that det(H) = - x^2 - y^2 - z^2 + t^2.
// The resulting 4x4 real matrix Λ satisfies  v' = Λ v for v ∈ R^{3,1}.

// ------------------ Complex helpers ------------------
function toC(z) {
    if (typeof z === 'number') return { re: z, im: 0 };
    if (z && typeof z.re === 'number' && typeof z.im === 'number') return { re: z.re, im: z.im };
    throw new Error('Complex inputs must be numbers or {re,im} objects');
}
function C(re, im) { return { re, im }; }
function cAdd(z, w) { return C(z.re + w.re, z.im + w.im); }
function cSub(z, w) { return C(z.re - w.re, z.im - w.im); }
function cMul(z, w) { return C(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re); }
function cConj(z) { return C(z.re, -z.im); }

// 2x2 complex matrix helpers
function cMatMul2(A, B) {
    return [
        [cAdd(cMul(A[0][0], B[0][0]), cMul(A[0][1], B[1][0])),
        cAdd(cMul(A[0][0], B[0][1]), cMul(A[0][1], B[1][1]))],
        [cAdd(cMul(A[1][0], B[0][0]), cMul(A[1][1], B[1][0])),
        cAdd(cMul(A[1][0], B[0][1]), cMul(A[1][1], B[1][1]))]
    ];
}
function cMatAdjoint2(A) {
    return [
        [cConj(A[0][0]), cConj(A[1][0])],
        [cConj(A[0][1]), cConj(A[1][1])]
    ];
}

// ------------------ Minkowski <-> Hermitian ------------------
function hermitianFromVec(v) {
    const [x, y, z, t] = v;
    return [
        [C(t + z, 0), C(x, y)],
        [C(x, -y), C(t - z, 0)]
    ];
}
function vecFromHermitian(H) {
    const x = H[0][1].re;
    const y = H[0][1].im;
    const z = (H[0][0].re - H[1][1].re) / 2;
    const t = (H[0][0].re + H[1][1].re) / 2;
    return [x, y, z, t];
}

// ------------------ Main map ------------------
function PSL2CtoSO31(a, b, c, d) {
    const A = toC(a), B = toC(b), Cc = toC(c), D = toC(d);
    const g = [[A, B], [Cc, D]];
    const gAdj = cMatAdjoint2(g);
    const basis = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

    const columns = basis.map(v => {
        const H = hermitianFromVec(v);
        const gHgAdj = cMatMul2(cMatMul2(g, H), gAdj);
        return vecFromHermitian(gHgAdj);
    });

    const Lambda = Array.from({ length: 4 }, (_, r) =>
        columns.map(col => {
            const val = col[r];
            const eps = 1e-8;
            return Math.abs(val) < eps ? 0 : val;
        })
    );
    return Lambda;
}

// ------------------ sDF utilities ------------------
const __ETA = [-1, -1, -1, +1];
function __etaApply(v) { return [-v[0], -v[1], -v[2], v[3]]; }
function __stdBasis(j) {
    return [0, 0, 0, 0].map((_, k) => (k === j ? 1 : 0));
}
function __ginv_ej(g, j) {
    // Using g^{-1} = η g^T η with η = diag(-1,-1,-1,+1).
    // Column j of g^{-1} equals: w_i = η_{ii} * g_{j i} * η_{jj}.
    const r = g[j];                 // row j of g
    const sj = (j === 3) ? 1 : -1;  // η_{jj}
    return [
        (-1) * r[0] * sj,           // η_{00} = -1
        (-1) * r[1] * sj,           // η_{11} = -1
        (-1) * r[2] * sj,           // η_{22} = -1
        (+1) * r[3] * sj            // η_{33} = +1
    ];
}

function sDF_autoFromSO31(g) {
    if (!Array.isArray(g) || g.length !== 4 || g.some(r => !Array.isArray(r) || r.length !== 4)) {
        throw new Error('sDF_autoFromSO31 expects a 4x4 matrix');
    }
    const eps = 1e-8;
    for (let j = 3; j >= 0; j--) {
        const s = __ETA[j];
        const w = __ginv_ej(g, j);
        const denom = s * (w[j] - 1);
        if (Math.abs(denom) < eps) {
            continue;
        }
        const e = __stdBasis(j);
        const u = [w[0] - e[0], w[1] - e[1], w[2] - e[2], w[3] - e[3]];
        const eta_u = __etaApply(u);
        const row = eta_u;
        // Normalize sign: ensure the last nonzero coordinate is negative
        const epsSign = 1e-12;
        let lastIdx = -1;
        for (let k = 3; k >= 0; k--) {
            if (Math.abs(row[k]) > epsSign) { lastIdx = k; break; }
        }
        if (lastIdx !== -1 && row[lastIdx] > 0) {
            for (let k = 0; k < 4; k++) row[k] = -row[k];
        }
        return { row, pivot: j };
    }
    throw new Error('sDF undefined: g fixes all basis vectors e₀, e₁, e₂, e₃');
}