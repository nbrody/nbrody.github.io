// tiling.js — Core math for triangle-square tiling calculator
//
// Lattice: Z[omega] x Z[omega] in R^4 = C^2, omega = e^{2pi i/3}
// Eisenstein basis: {1, omega} per factor, omega = (-1/2, sqrt(3)/2)
// Input: 2x4 matrix in Eisenstein lattice coordinates
// Algorithm: overlay of two pullback Eisenstein triangulations

const SQRT3 = Math.sqrt(3);
const SQRT3_2 = SQRT3 / 2;
const EPS = 1e-10;

// ── Rational Parsing ──

export function parseRational(str) {
    str = str.trim();
    if (str === '') return null;
    const neg = str.startsWith('-');
    if (neg) str = str.slice(1).trim();
    let n, d;
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length !== 2) return null;
        n = parseInt(parts[0].trim(), 10);
        d = parseInt(parts[1].trim(), 10);
        if (isNaN(n) || isNaN(d) || d === 0) return null;
    } else {
        n = parseInt(str, 10);
        d = 1;
        if (isNaN(n)) return null;
    }
    if (neg) n = -n;
    return n / d;
}

// ── 2x2 Matrix Operations ──

function det2(M) {
    return M[0][0] * M[1][1] - M[0][1] * M[1][0];
}

function invert2x2(M) {
    const d = det2(M);
    if (Math.abs(d) < EPS) return null;
    return [
        [M[1][1] / d, -M[0][1] / d],
        [-M[1][0] / d, M[0][0] / d]
    ];
}

function apply2x2(M, v) {
    return [
        M[0][0] * v[0] + M[0][1] * v[1],
        M[1][0] * v[0] + M[1][1] * v[1]
    ];
}

// ── 4D Vector Operations ──

function dot4(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function norm4(v) {
    return Math.sqrt(dot4(v, v));
}

function scale4(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s, v[3] * s];
}

function sub4(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
}

// ── Eisenstein Lattice ──

// Convert lattice coords (a, b) to R^2: (a - b/2, b*sqrt(3)/2)
function latticeToR2(a, b) {
    return [a - b * 0.5, b * SQRT3_2];
}

// Convert lattice coords in Z[omega]^2 to R^4
function latticeToR4(v) {
    const [a, b, c, d] = v;
    const [x1, y1] = latticeToR2(a, b);
    const [x2, y2] = latticeToR2(c, d);
    return [x1, y1, x2, y2];
}

// ── Display Transform ──
// Gram-Schmidt orthonormalize the R^4 direction vectors,
// then compute the 2x2 matrix mapping (s,t) -> metrically correct display coords

export function computeDisplayMatrix(v1, v2) {
    const u1 = latticeToR4(v1);
    const u2 = latticeToR4(v2);

    // Gram-Schmidt
    const n1 = norm4(u1);
    if (n1 < EPS) return [[1, 0], [0, 1]]; // degenerate
    const e1 = scale4(u1, 1 / n1);

    const proj = dot4(u2, e1);
    const u2perp = sub4(u2, scale4(e1, proj));
    const n2 = norm4(u2perp);
    if (n2 < EPS) return [[1, 0], [0, 1]]; // degenerate
    const e2 = scale4(u2perp, 1 / n2);

    // D maps (s,t) -> (dot(s*u1+t*u2, e1), dot(s*u1+t*u2, e2))
    // = (s*dot(u1,e1) + t*dot(u2,e1), s*dot(u1,e2) + t*dot(u2,e2))
    return [
        [dot4(u1, e1), dot4(u2, e1)],
        [dot4(u1, e2), dot4(u2, e2)]
    ];
}

// ── Polygon Operations ──

// Signed area (positive = counter-clockwise)
function signedArea(poly) {
    let area = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    return area / 2;
}

function polygonArea(poly) {
    return Math.abs(signedArea(poly));
}

// Ensure counter-clockwise winding order
function ensureCCW(poly) {
    if (signedArea(poly) < 0) return poly.slice().reverse();
    return poly;
}

// Sutherland-Hodgman: clip subject polygon against a convex clip polygon
// Both polygons must be counter-clockwise
function clipConvex(subject, clip) {
    if (subject.length < 3 || clip.length < 3) return null;

    // Ensure both are counter-clockwise
    subject = ensureCCW(subject);
    clip = ensureCCW(clip);

    let output = subject.slice();
    const cn = clip.length;

    for (let i = 0; i < cn; i++) {
        if (output.length === 0) return null;
        const input = output;
        output = [];

        const edgeA = clip[i];
        const edgeB = clip[(i + 1) % cn];
        // Normal pointing inward (left side of edge A->B for CCW polygon)
        const nx = -(edgeB[1] - edgeA[1]);
        const ny = edgeB[0] - edgeA[0];

        for (let j = 0; j < input.length; j++) {
            const curr = input[j];
            const prev = input[(j + input.length - 1) % input.length];

            const currInside = (curr[0] - edgeA[0]) * nx + (curr[1] - edgeA[1]) * ny >= -EPS;
            const prevInside = (prev[0] - edgeA[0]) * nx + (prev[1] - edgeA[1]) * ny >= -EPS;

            if (currInside) {
                if (!prevInside) {
                    const inter = lineIntersect(prev, curr, edgeA, edgeB);
                    if (inter) output.push(inter);
                }
                output.push(curr);
            } else if (prevInside) {
                const inter = lineIntersect(prev, curr, edgeA, edgeB);
                if (inter) output.push(inter);
            }
        }
    }

    if (output.length < 3) return null;
    return output;
}

function lineIntersect(p1, p2, p3, p4) {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
    const denom = d1x * d2y - d1y * d2x;
    if (Math.abs(denom) < EPS) return null;
    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom;
    return [p1[0] + t * d1x, p1[1] + t * d1y];
}

// ── Eisenstein Triangle Enumeration ──
// In lattice coords (a,b), each fundamental parallelogram has 2 triangles:
//   Up:   (a,b), (a+1,b), (a,b+1)
//   Down: (a+1,b+1), (a+1,b), (a,b+1)

function eisensteinTriangles(rangeMin, rangeMax) {
    const tris = [];
    for (let a = rangeMin[0]; a <= rangeMax[0]; a++) {
        for (let b = rangeMin[1]; b <= rangeMax[1]; b++) {
            // Up triangle
            tris.push([[a, b], [a + 1, b], [a, b + 1]]);
            // Down triangle
            tris.push([[a + 1, b + 1], [a + 1, b], [a, b + 1]]);
        }
    }
    return tris;
}

// ── Bounding Box ──

function polyBBox(poly) {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const [x, y] of poly) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
    }
    return { xMin, xMax, yMin, yMax };
}

function bboxOverlap(a, b) {
    const ba = polyBBox(a);
    const bb = polyBBox(b);
    return ba.xMin <= bb.xMax + EPS && ba.xMax >= bb.xMin - EPS &&
           ba.yMin <= bb.yMax + EPS && ba.yMax >= bb.yMin - EPS;
}

// ── Period Lattice ──
// Find (s,t) such that s*v1 + t*v2 in Z^4 (all integer lattice coords).
// Since v1, v2 have rational entries, we clear denominators and solve.

export function computePeriods(v1, v2) {
    // v1 = [a1,b1,c1,d1], v2 = [a2,b2,c2,d2]
    // Need: s*v1[i] + t*v2[i] = integer for all i=0..3
    // Each equation: s*(p_i/q_i) + t*(r_i/s_i) = n_i
    // Clear all denominators: let D = lcm of all denominators

    // Convert to exact fractions
    const fracs1 = v1.map(toFrac);
    const fracs2 = v2.map(toFrac);

    // Find LCD
    let lcd = 1;
    for (let i = 0; i < 4; i++) {
        lcd = lcm(lcd, fracs1[i][1]);
        lcd = lcm(lcd, fracs2[i][1]);
    }

    // Integer matrix: N[i] = [lcd*v1[i], lcd*v2[i]], need N*(s,t)^T = 0 mod lcd
    const N = [];
    for (let i = 0; i < 4; i++) {
        N.push([
            (fracs1[i][0] * lcd) / fracs1[i][1],
            (fracs2[i][0] * lcd) / fracs2[i][1]
        ]);
    }

    // We need s, t such that for all i: N[i][0]*s + N[i][1]*t = 0 (mod lcd)
    // The period lattice in (s,t) is: { (s,t) : N*(s,t)^T in lcd*Z^4 }
    // = (1/lcd) * { (s,t) in Z^2 : N*(s,t)^T in lcd*Z^4 ... }
    // Actually: s*v1[i] + t*v2[i] in Z means (N[i][0]*s + N[i][1]*t) / lcd in Z
    // means N[i][0]*s + N[i][1]*t = 0 mod lcd (treating s,t as multiples of 1)
    // Wait, let's think again. We want real s,t. s*v1[i] + t*v2[i] in Z.
    // Let's just find the lattice directly.

    // Method: find two linearly independent pairs (s,t) satisfying all 4 congruences.
    // Use the first two independent equations to parameterize, then filter by the rest.

    // Equation i: a_i * s + b_i * t in Z, where a_i = v1[i], b_i = v2[i].
    // Rewrite: pick equations in pairs, solve for (s,t) giving integer RHS.

    // The solution set is a lattice L in R^2. To find it:
    // Stack all constraints: M * (s,t)^T has all entries in Z, where M is the 4x2 matrix.
    // This means (s,t) in M^{-1}(Z^4) (the preimage of the integer lattice).
    // If M has rank 2, this is a rank-2 sublattice of R^2.

    // Practical: find 2 independent rows of M (call them rows i,j giving a 2x2 submatrix).
    // The general solution for those 2 equations: (s,t) = Minv * (n_i, n_j), n in Z^2.
    // Then filter: check which (n_i, n_j) also satisfy the remaining equations.
    // The valid (n_i, n_j) form a sublattice of Z^2.

    // Find best 2x2 submatrix (largest determinant)
    let bestDet = 0, bestI = 0, bestJ = 1;
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            const d = Math.abs(v1[i] * v2[j] - v1[j] * v2[i]);
            if (d > bestDet) { bestDet = d; bestI = i; bestJ = j; }
        }
    }

    if (bestDet < EPS) return null; // degenerate

    const M2 = [[v1[bestI], v2[bestI]], [v1[bestJ], v2[bestJ]]];
    const M2inv = invert2x2(M2);
    if (!M2inv) return null;

    // Base period vectors: (s,t) = M2inv * (1,0) and M2inv * (0,1)
    const p1base = apply2x2(M2inv, [1, 0]);
    const p2base = apply2x2(M2inv, [0, 1]);

    // Check remaining equations: for the other indices k (not bestI, bestJ),
    // we need v1[k]*s + v2[k]*t in Z.
    // With s = m*p1base[0] + n*p2base[0], t = m*p1base[1] + n*p2base[1]:
    // v1[k]*(m*p1base[0]+n*p2base[0]) + v2[k]*(m*p1base[1]+n*p2base[1])
    // = m*(v1[k]*p1base[0]+v2[k]*p1base[1]) + n*(v1[k]*p2base[0]+v2[k]*p2base[1])
    // must be in Z.

    // Compute these coefficients for remaining rows
    const otherRows = [];
    for (let k = 0; k < 4; k++) {
        if (k === bestI || k === bestJ) continue;
        const c1 = v1[k] * p1base[0] + v2[k] * p1base[1]; // coeff of m
        const c2 = v1[k] * p2base[0] + v2[k] * p2base[1]; // coeff of n
        otherRows.push([c1, c2]);
    }

    // For each remaining row [c1, c2]: m*c1 + n*c2 in Z for all (m,n) in Z^2.
    // If c1 and c2 are already integers, no constraint.
    // Otherwise, need to find sublattice of Z^2 satisfying all congruences.

    // Find the sublattice of Z^2 such that for each [c1,c2]:
    //   m*c1 + n*c2 in Z
    // This means we need fractional parts to cancel.

    let periodLattice = [[1, 0], [0, 1]]; // start with full Z^2

    for (const [c1, c2] of otherRows) {
        // m*c1 + n*c2 in Z
        // Write c1 = p1/q1, c2 = p2/q2 in lowest terms
        const f1 = toFrac(c1);
        const f2 = toFrac(c2);
        const q = lcm(f1[1], f2[1]);
        // Need: m*(f1[0]*q/f1[1]) + n*(f2[0]*q/f2[1]) = 0 mod q
        const a = Math.round(f1[0] * (q / f1[1])) % q;
        const b = Math.round(f2[0] * (q / f2[1])) % q;
        // Constraint: a*m + b*n = 0 mod q
        // Restrict the current lattice
        periodLattice = restrictLattice(periodLattice, a, b, q);
    }

    // Convert back: period vectors in (s,t)-space
    const per1 = [
        periodLattice[0][0] * p1base[0] + periodLattice[0][1] * p2base[0],
        periodLattice[0][0] * p1base[1] + periodLattice[0][1] * p2base[1]
    ];
    const per2 = [
        periodLattice[1][0] * p1base[0] + periodLattice[1][1] * p2base[0],
        periodLattice[1][0] * p1base[1] + periodLattice[1][1] * p2base[1]
    ];

    return [per1, per2];
}

// Restrict a 2D lattice (given by two basis vectors in Z^2)
// by the congruence a*m + b*n = 0 mod q,
// where (m,n) range over the lattice.
function restrictLattice(basis, a, b, q) {
    // basis = [[m1,n1],[m2,n2]]: the lattice is {k1*(m1,n1) + k2*(m2,n2) : k1,k2 in Z}
    // Constraint: a*(k1*m1+k2*m2) + b*(k1*n1+k2*n2) = 0 mod q
    // = k1*(a*m1+b*n1) + k2*(a*m2+b*n2) = 0 mod q
    const c1 = mod(a * basis[0][0] + b * basis[0][1], q);
    const c2 = mod(a * basis[1][0] + b * basis[1][1], q);

    if (c1 === 0 && c2 === 0) return basis; // already satisfied

    // Need c1*k1 + c2*k2 = 0 mod q
    // Find generators of this sublattice of Z^2
    const g = gcd(gcd(c1, c2), q);
    const cc1 = c1 / g, cc2 = c2 / g, qq = q / g;

    // Solutions: if cc1 = 0, then k2 must be 0 mod qq/gcd(cc2,qq)...
    // General: use extended gcd to find the sublattice

    // The constraint cc1*k1 + cc2*k2 = 0 mod qq defines an index-qq/gcd(...) sublattice
    // Find one particular solution and the homogeneous generators
    const g12 = gcd(cc1, qq);
    // cc1*k1 = -cc2*k2 mod qq
    // Homogeneous solutions: (k1,k2) = (qq/g12, 0) and also need to account for k2

    // Simpler approach: enumerate a basis for the kernel of (cc1, cc2) mod qq in Z^2
    const newBasis = [];
    // Generator 1: (qq, 0) always works (since cc1*qq = 0 mod qq)
    // Wait, cc1*qq = cc1*qq, need = 0 mod qq, which is true.
    // But we also need non-trivial solutions.

    // Extended GCD approach: find (k1, k2) with cc1*k1 + cc2*k2 = 0 mod qq
    // The solution space is generated by:
    //   (cc2/g12, -cc1/g12) and (qq/g12, 0) ... let me think more carefully.

    // The set {(k1,k2) in Z^2 : cc1*k1 + cc2*k2 = 0 mod qq} is a sublattice.
    // Its generators can be found by: one generator is along the kernel of (cc1,cc2) over Z,
    // and the other comes from the modular constraint.

    const g2 = gcd(cc1, cc2);
    // Kernel of (cc1,cc2) over Z: spanned by (-cc2/g2, cc1/g2)
    const hom = [-cc2 / g2, cc1 / g2];
    // Particular solution: need cc1*k1 + cc2*k2 = qq (then scale by 0 gives 0 mod qq)
    // Actually we need = 0 mod qq. So (0,0) is trivial.
    // The sublattice is generated by hom and (qq/gcd(cc1,qq), ...).
    // Let me just use: generator1 = hom, generator2 = find smallest k1 > 0 with k2 s.t. constraint.

    // Better: the lattice is Z * hom + Z * particular, where particular has
    // cc1*p1 + cc2*p2 = qq.
    // Use extended GCD: g2 = gcd(cc1,cc2), cc1*(cc1/g2)... no.
    // gcd(cc1,cc2) = g2. If qq % g2 != 0, then only hom solutions exist (period qq).
    // If g2 | qq, find (p1,p2) with cc1*p1+cc2*p2 = g2, then scale by qq/g2.

    let gen1 = hom; // satisfies constraint (gives 0)
    let gen2;

    if (g2 === 0) {
        // cc1 = cc2 = 0, already satisfied
        gen2 = [0, 1];
    } else {
        // gcd(cc1, cc2) = g2. We need cc1*k1 + cc2*k2 = 0 mod qq.
        // Solutions: k in Z*hom + { (k1,k2) : cc1*k1+cc2*k2 = qq*j for some j in Z }
        // Find (p1,p2) with cc1*p1 + cc2*p2 = g2 via extended GCD
        const [_, x0, y0] = extgcd(cc1, cc2);
        // cc1*x0 + cc2*y0 = g2
        // We want cc1*k1 + cc2*k2 = qq. If g2 | qq:
        if (qq % g2 === 0) {
            const mult = qq / g2;
            gen2 = [x0 * mult, y0 * mult];
        } else {
            // No solutions beyond the homogeneous kernel
            gen2 = [hom[0] * qq, hom[1] * qq]; // effectively kill this direction
        }
    }

    // Now the sublattice of Z^2 satisfying the constraint is generated by gen1 and gen2.
    // Map back to the original basis:
    // Original (m,n) = k1*basis[0] + k2*basis[1]
    // New: (m,n) = (j1*gen1[0]+j2*gen2[0])*basis[0] + (j1*gen1[1]+j2*gen2[1])*basis[1]
    const newB1 = [
        gen1[0] * basis[0][0] + gen1[1] * basis[1][0],
        gen1[0] * basis[0][1] + gen1[1] * basis[1][1]
    ];
    const newB2 = [
        gen2[0] * basis[0][0] + gen2[1] * basis[1][0],
        gen2[0] * basis[0][1] + gen2[1] * basis[1][1]
    ];

    return [newB1, newB2];
}

// ── Number Theory Helpers ──

function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) { [a, b] = [b, a % b]; }
    return a;
}

function lcm(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    return a === 0 || b === 0 ? 0 : (a / gcd(a, b)) * b;
}

function mod(a, m) {
    return ((Math.round(a) % m) + m) % m;
}

function extgcd(a, b) {
    a = Math.round(a); b = Math.round(b);
    if (b === 0) return [Math.abs(a), a >= 0 ? 1 : -1, 0];
    let [old_r, r] = [a, b];
    let [old_s, s] = [1, 0];
    let [old_t, t] = [0, 1];
    while (r !== 0) {
        const q = Math.floor(old_r / r);
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
        [old_t, t] = [t, old_t - q * t];
    }
    if (old_r < 0) { old_r = -old_r; old_s = -old_s; old_t = -old_t; }
    return [old_r, old_s, old_t];
}

// Convert a float (expected rational) to [numerator, denominator] in lowest terms
function toFrac(x) {
    // Handle exact integers
    if (Number.isInteger(x)) return [x, 1];
    // Use continued fraction expansion to find rational approximation
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const maxDenom = 100000;
    let [p0, q0] = [0, 1];
    let [p1, q1] = [1, 0];
    let rem = x;
    for (let i = 0; i < 30; i++) {
        const a = Math.floor(rem);
        const p2 = a * p1 + p0;
        const q2 = a * q1 + q0;
        if (q2 > maxDenom) break;
        [p0, q0] = [p1, q1];
        [p1, q1] = [p2, q2];
        const frac = rem - a;
        if (frac < EPS) break;
        rem = 1 / frac;
        if (rem > 1e12) break;
    }
    const g = gcd(p1, q1);
    return [sign * p1 / g, q1 / g];
}

// ── Main Tiling Computation ──

export function computeTiling(v1, v2, viewRange) {
    // v1, v2: 4-component vectors in Eisenstein lattice coords
    // viewRange: how far to extend in (s,t)-space

    // Projection matrices (lattice coords)
    // pi_1: (s,t) -> (s*v1[0]+t*v2[0], s*v1[1]+t*v2[1])
    const A1 = [[v1[0], v2[0]], [v1[1], v2[1]]];
    // pi_2: (s,t) -> (s*v1[2]+t*v2[2], s*v1[3]+t*v2[3])
    const A2 = [[v1[2], v2[2]], [v1[3], v2[3]]];

    const det1 = Math.abs(det2(A1));
    const det2val = Math.abs(det2(A2));

    const A1inv = invert2x2(A1);
    const A2inv = invert2x2(A2);

    // Display transform
    const D = computeDisplayMatrix(v1, v2);
    const Dinv = invert2x2(D);

    // Determine the range of Eisenstein triangles needed in each factor.
    // The view in display coords is [-viewRange, viewRange]^2.
    // Map corners back to (s,t) via D^{-1}, then forward to each factor via A1, A2.
    const corners_st = Dinv ? [
        apply2x2(Dinv, [-viewRange, -viewRange]),
        apply2x2(Dinv, [viewRange, -viewRange]),
        apply2x2(Dinv, [viewRange, viewRange]),
        apply2x2(Dinv, [-viewRange, viewRange])
    ] : [
        [-viewRange, -viewRange],
        [viewRange, -viewRange],
        [viewRange, viewRange],
        [-viewRange, viewRange]
    ];

    const tiles = [];

    if (det1 < EPS && det2val < EPS) {
        // Both projections degenerate — no tiling
        return { tiles: [], periods: null, displayMatrix: D };
    }

    if (det1 < EPS) {
        // A1 singular: pure blue tiling (or degenerate)
        return computePureTiling(A2, A2inv, corners_st, 'blue', D);
    }

    if (det2val < EPS) {
        // A2 singular: pure red tiling
        return computePureTiling(A1, A1inv, corners_st, 'red', D);
    }

    // Both non-degenerate: compute overlay
    const range1 = computeTriangleRange(A1, corners_st);
    const range2 = computeTriangleRange(A2, corners_st);

    const tris1 = eisensteinTriangles(range1.min, range1.max);
    const tris2 = eisensteinTriangles(range2.min, range2.max);

    // Pull back each triangulation to (s,t)-space, precompute bboxes
    const pulled1 = tris1.map(tri => {
        const p = tri.map(v => apply2x2(A1inv, v));
        return { verts: p, bb: polyBBox(p) };
    });
    const pulled2 = tris2.map(tri => {
        const p = tri.map(v => apply2x2(A2inv, v));
        return { verts: p, bb: polyBBox(p) };
    });

    // Overlay: clip each pair
    for (let i = 0; i < pulled1.length; i++) {
        const t1 = pulled1[i].verts;
        const bb1 = pulled1[i].bb;

        for (let j = 0; j < pulled2.length; j++) {
            const t2 = pulled2[j].verts;
            const bb2 = pulled2[j].bb;

            // Quick bbox rejection
            if (bb1.xMin > bb2.xMax + EPS || bb1.xMax < bb2.xMin - EPS ||
                bb1.yMin > bb2.yMax + EPS || bb1.yMax < bb2.yMin - EPS) continue;

            const poly = clipConvex(t1, t2);
            if (!poly || poly.length < 3) continue;

            const area = polygonArea(poly);
            if (area < EPS) continue;

            // Classify by checking the image dimensions in each factor
            const type = classifyTile(A1, A2, poly, det1, det2val);
            tiles.push({ vertices: poly, type });
        }
    }

    return { tiles, displayMatrix: D };
}

function computePureTiling(A, Ainv, corners_st, color, D) {
    const range = computeTriangleRange(A, corners_st);
    const tris = eisensteinTriangles(range.min, range.max);
    const tiles = tris.map(tri => ({
        vertices: tri.map(v => apply2x2(Ainv, v)),
        type: color
    }));
    return { tiles, periods: null, displayMatrix: D };
}

function computeTriangleRange(A, corners_st) {
    // Map corners from (s,t) to lattice coords via A
    const mapped = corners_st.map(c => apply2x2(A, c));
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const [a, b] of mapped) {
        if (a < aMin) aMin = a;
        if (a > aMax) aMax = a;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
    }
    // Add margin
    const margin = 2;
    return {
        min: [Math.floor(aMin) - margin, Math.floor(bMin) - margin],
        max: [Math.ceil(aMax) + margin, Math.ceil(bMax) + margin]
    };
}

function classifyTile(A1, A2, poly, det1, det2) {
    // Project tile to each factor, compute area
    const img1 = poly.map(v => apply2x2(A1, v));
    const img2 = poly.map(v => apply2x2(A2, v));
    const area1 = polygonArea(img1);
    const area2 = polygonArea(img2);

    // Red: img1 is a full triangle (area > 0), img2 collapses to a point (area ~ 0)
    // Blue: reverse
    // Yellow: both project to segments (both areas ~ 0)
    // Use relative comparison: compare each to the expected triangle area (sqrt(3)/4)
    const triArea = SQRT3 / 4;
    const thresh = triArea * 0.01; // 1% of a unit triangle area

    const has1 = area1 > thresh;
    const has2 = area2 > thresh;

    if (has1 && !has2) return 'red';
    if (has2 && !has1) return 'blue';
    if (!has1 && !has2) return 'yellow';
    // Both have area — shouldn't happen for generic planes, but classify by dominance
    return area1 > area2 ? 'red' : 'blue';
}

// ── Validation ──

export function validateMatrix(v1, v2) {
    // Check rank 2: at least one 2x2 minor of the 2x4 matrix is nonzero
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            const d = Math.abs(v1[i] * v2[j] - v1[j] * v2[i]);
            if (d > EPS) return true;
        }
    }
    return false;
}
