// This has helper functions for converting between PSL_2(C) and O(3,1) representations.
//
// Basis convention: we use the ordered basis (x, y, z, t), i.e. the
// three spatial coordinates first and the time coordinate last. The Minkowski
// metric has signature (+, -, -, -) with the time coordinate in the last slot.
//
// We convert a PSL_2(C) element to an O(3,1) matrix via its adjoint action on
// 2×2 Hermitian matrices. If H = [[t+z, x+iy], [x-iy, t-z]] with real (x,y,z,t),
// then g · H · g^* corresponds to a new vector (x',y',z',t').
//
// Compatible with modules that use o = (0,0,0,1) and linear O(3,1) action.
export function psl2CO31(g) {
  // Accept inputs where a,b,c,d are either real numbers or {re, im} objects
  const toC = (z) => {
    if (typeof z === 'number') return { re: z, im: 0 };
    if (z && typeof z.re === 'number' && typeof z.im === 'number') return { re: z.re, im: z.im };
    // Fallback for tuples like [re, im]
    if (Array.isArray(z) && z.length === 2) return { re: z[0], im: z[1] };
    throw new Error('psl2CO31: matrix entries must be numbers or {re,im} objects');
  };

  const add = (z,w) => ({ re: z.re + w.re, im: z.im + w.im });
  const sub = (z,w) => ({ re: z.re - w.re, im: z.im - w.im });
  const mul = (z,w) => ({ re: z.re*w.re - z.im*w.im, im: z.re*w.im + z.im*w.re });
  const conj = (z) => ({ re: z.re, im: -z.im });

  // Read entries and ensure complex form
  const a = toC(g[0][0]);
  const b = toC(g[0][1]);
  const c = toC(g[1][0]);
  const d = toC(g[1][1]);

  // Build complex 2x2 multiplication helpers
  const matMul = (M, N) => {
    return [
      [ add( mul(M[0][0], N[0][0]), mul(M[0][1], N[1][0]) ), add( mul(M[0][0], N[0][1]), mul(M[0][1], N[1][1]) ) ],
      [ add( mul(M[1][0], N[0][0]), mul(M[1][1], N[1][0]) ), add( mul(M[1][0], N[0][1]), mul(M[1][1], N[1][1]) ) ]
    ];
  };
  const matAdjoint = (M) => [ [ conj(M[0][0]), conj(M[1][0]) ], [ conj(M[0][1]), conj(M[1][1]) ] ];

  // Given (x,y,z,t) map to Hermitian H, act by g H g^*, then read back (x',y',z',t')
  const applyToVector = (vec) => {
    const [x, y, z_, t] = vec; // z is reserved in some contexts; use z_
    const H = [
      [ { re: t + z_, im: 0 }, { re: x, im: y } ],
      [ { re: x, im: -y }, { re: t - z_, im: 0 } ]
    ];
    const G = [ [a,b],[c,d] ];
    const Hp = matMul( matMul(G, H), matAdjoint(G) );

    // Hp is Hermitian: [[A, B],[conj(B), D]] with A,D real.
    const A = Hp[0][0].re; // imag should be ~0
    const B = Hp[0][1];
    const D = Hp[1][1].re;

    const tp = 0.5 * (A + D);
    const xp = B.re;
    const yp = B.im;
    const zp = 0.5 * (A - D);
    return [xp, yp, zp, tp];
  };

  // Build 4×4 by acting on basis vectors in the order (x,y,z,t)
  const ex = [1,0,0,0];
  const ey = [0,1,0,0];
  const ez = [0,0,1,0];
  const et = [0,0,0,1];

  const cx = applyToVector(ex);
  const cy = applyToVector(ey);
  const cz = applyToVector(ez);
  const ct = applyToVector(et);

  // Assemble columns into a standard row-major 4x4 array
  // M_{ij} = i-th row, j-th column
  const M = [
    [ cx[0], cy[0], cz[0], ct[0] ],
    [ cx[1], cy[1], cz[1], ct[1] ],
    [ cx[2], cy[2], cz[2], ct[2] ],
    [ cx[3], cy[3], cz[3], ct[3] ]
  ];

  return M;
}

export function O31inv(M) {
  // Inverse of O(3,1) matrix is given by negating spatial rows and columns and transposing.
  return [
    [ M[0][0], M[1][0], M[2][0], -M[3][0] ],
    [ M[0][1], M[1][1], M[2][1], -M[3][1] ],
    [ M[0][2], M[1][2], M[2][2], -M[3][2] ],
    [ -M[0][3], -M[1][3], -M[2][3], M[3][3] ]
  ];
}