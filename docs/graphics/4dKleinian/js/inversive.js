/**
 * Inversive coordinates for spheres and planes in R^3 = boundary of H^4.
 *
 * A sphere S(c, r) in R^3 corresponds to a spacelike vector in R^{4,1}
 *
 *     v(c, r) = ( c/r , (|c|^2 - r^2 - 1) / 2r , (|c|^2 - r^2 + 1) / 2r )
 *
 * with <v, v> = 1 for the form <x, y> = x1y1 + x2y2 + x3y3 + x4y4 - x5y5.
 * A plane { x : x.n = h } with |n| = 1 corresponds to v = (n, h, h).
 *
 * The key identity is that for two spheres
 *
 *     <v1, v2> = ( r1^2 + r2^2 - d^2 ) / ( 2 r1 r2 )
 *
 * so the Lorentzian inner product *is* the inversive product: it equals
 * cos(theta) for spheres meeting at angle theta, -1 for tangent spheres and
 * -cosh(l) for disjoint spheres a hyperbolic distance l apart.  A Coxeter
 * reflection group with dihedral angles pi/m therefore has Gram matrix
 * G_ij = -cos(pi/m_ij), and realizing that Gram matrix in R^{4,1} realizes
 * the group as inversions in spheres of R^3.
 *
 * Boundary points lift to null vectors X(x) = ( x , (|x|^2-1)/2 , (|x|^2+1)/2 )
 * and <X(x), v(c,r)> = ( r^2 - |x-c|^2 ) / 2r, so the half space <., v> <= 0
 * is the exterior of the sphere when r > 0 and its interior when r < 0.
 */

export const TOL = 1e-9;

export function dot41(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] - a[4] * b[4];
}

export function identity(n) {
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );
}

/** Jacobi eigenvalue iteration for a real symmetric matrix. */
export function symmetricEigen(input, sweeps = 60) {
    const n = input.length;
    const a = input.map((row) => row.slice());
    const v = identity(n);

    for (let sweep = 0; sweep < sweeps; sweep++) {
        let off = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                off += a[i][j] * a[i][j];
            }
        }
        if (off < 1e-26) {
            break;
        }

        for (let p = 0; p < n; p++) {
            for (let q = p + 1; q < n; q++) {
                if (Math.abs(a[p][q]) < 1e-18) {
                    continue;
                }
                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const sign = theta >= 0 ? 1 : -1;
                const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;

                for (let k = 0; k < n; k++) {
                    const akp = a[k][p];
                    const akq = a[k][q];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for (let k = 0; k < n; k++) {
                    const apk = a[p][k];
                    const aqk = a[q][k];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for (let k = 0; k < n; k++) {
                    const vkp = v[k][p];
                    const vkq = v[k][q];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }

    return { values: a.map((row, i) => row[i]), vectors: v };
}

/** Number of (positive, zero, negative) eigenvalues. */
export function signature(gram, tol = 1e-8) {
    const { values } = symmetricEigen(gram);
    let positive = 0;
    let zero = 0;
    let negative = 0;
    values.forEach((value) => {
        if (value > tol) positive++;
        else if (value < -tol) negative++;
        else zero++;
    });
    return { positive, zero, negative, values: values.slice().sort((a, b) => b - a) };
}

export function isPositiveSemidefinite(gram, tol = 1e-8) {
    return signature(gram, tol).negative === 0;
}

export function isPositiveDefinite(gram, tol = 1e-8) {
    const sig = signature(gram, tol);
    return sig.negative === 0 && sig.zero === 0;
}

/**
 * Realize a Gram matrix as vectors in R^{4,1}.
 * Returns null when the matrix needs more than four spacelike or more than
 * one timelike direction, i.e. when the configuration does not live in the
 * boundary of hyperbolic 4-space.
 */
export function realizeGram(gram, tol = 1e-8) {
    const n = gram.length;
    const { values, vectors } = symmetricEigen(gram);

    const order = values.map((value, index) => ({ value, index }));
    const positives = order.filter((e) => e.value > tol).sort((a, b) => b.value - a.value);
    const negatives = order.filter((e) => e.value < -tol).sort((a, b) => a.value - b.value);

    if (positives.length > 4 || negatives.length > 1) {
        return null;
    }

    const slots = [];
    for (let k = 0; k < 4; k++) {
        slots.push(positives[k] || null);
    }
    slots.push(negatives[0] || null);

    const out = [];
    for (let i = 0; i < n; i++) {
        const v = [0, 0, 0, 0, 0];
        for (let s = 0; s < 5; s++) {
            const slot = slots[s];
            if (!slot) continue;
            v[s] = vectors[i][slot.index] * Math.sqrt(Math.abs(slot.value));
        }
        out.push(v);
    }
    return out;
}

/** Solve a small dense linear system by Gaussian elimination with pivoting. */
export function solve(matrix, rhs) {
    const n = matrix.length;
    const a = matrix.map((row, i) => row.concat([rhs[i]]));

    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
        }
        if (Math.abs(a[pivot][col]) < 1e-12) return null;
        [a[col], a[pivot]] = [a[pivot], a[col]];

        for (let row = 0; row < n; row++) {
            if (row === col) continue;
            const factor = a[row][col] / a[col][col];
            for (let k = col; k <= n; k++) {
                a[row][k] -= factor * a[col][k];
            }
        }
    }

    return a.map((row, i) => row[n] / a[i][i]);
}

/**
 * The Lorentz boost taking a unit timelike vector x (with x[4] > 0) to the
 * basepoint (0,0,0,0,1), which is the point of H^4 sitting at height one
 * above the origin of the upper half space model.
 */
export function boostToBasepoint(x) {
    const u = [x[0], x[1], x[2], x[3]];
    const gamma = x[4];
    const u2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2] + u[3] * u[3];

    if (u2 < 1e-18) {
        return (w) => w.slice();
    }

    const k = (gamma - 1) / u2;
    return (w) => {
        const uw = u[0] * w[0] + u[1] * w[1] + u[2] * w[2] + u[3] * w[3];
        const scale = k * uw - w[4];
        return [
            w[0] + scale * u[0],
            w[1] + scale * u[1],
            w[2] + scale * u[2],
            w[3] + scale * u[3],
            gamma * w[4] - uw
        ];
    };
}

function dot4(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function normalize4(v) {
    const norm = Math.hypot(v[0], v[1], v[2], v[3]) || 1;
    return v.map((value) => value / norm);
}

/**
 * Choose which point of the boundary 3-sphere becomes the point at infinity.
 *
 * Boundary points are the null directions X(u) = (u, 1) with u a unit vector
 * of R^4, and X(u) lies in the fundamental chamber exactly when
 * <X(u), v_i> = u.s_i - t_i <= 0 for every mirror.  Picking the u that
 * maximises min_i (t_i - u.s_i) sends the deepest boundary point of the
 * chamber to infinity, which is what makes every mirror come out as a
 * sphere of positive radius with the limit set bounded and centred.
 * For a cocompact group no such point exists; the maximiser is then the
 * least bad choice and exactly one mirror keeps a negative radius.
 */
export function chamberPole(vectors, exclude = -1) {
    const spatial = vectors.map((v) => [v[0], v[1], v[2], v[3]]);
    const time = vectors.map((v) => v[4]);
    const n = vectors.length;

    const score = (u) => {
        let best = Infinity;
        let index = 0;
        for (let i = 0; i < n; i++) {
            if (i === exclude) continue;
            const value = time[i] - dot4(u, spatial[i]);
            if (value < best) {
                best = value;
                index = i;
            }
        }
        return { value: best, index };
    };

    let bestU = normalize4([1, 0, 0, 0]);
    let bestValue = score(bestU).value;

    const starts = 24;
    for (let start = 0; start < starts; start++) {
        let u = start === 0
            ? bestU.slice()
            : normalize4([
                Math.cos(start * 1.7) + Math.sin(start * 0.9),
                Math.sin(start * 2.3),
                Math.cos(start * 3.1),
                Math.sin(start * 1.1) - Math.cos(start * 0.4)
            ]);
        let step = 0.6;
        for (let iteration = 0; iteration < 240; iteration++) {
            const { index } = score(u);
            // ascend along -s_index, projected onto the tangent space of S^3
            const g = spatial[index].map((value) => -value);
            const radial = dot4(g, u);
            const tangent = g.map((value, k) => value - radial * u[k]);
            const norm = Math.hypot(...tangent);
            if (norm < 1e-12) break;
            const next = normalize4(u.map((value, k) => value + (step * tangent[k]) / norm));
            if (score(next).value > score(u).value) {
                u = next;
            } else {
                step *= 0.75;
                if (step < 1e-6) break;
            }
        }
        const value = score(u).value;
        if (value > bestValue) {
            bestValue = value;
            bestU = u;
        }
    }

    return { pole: bestU, clearance: bestValue };
}

/** Rotate R^4 so that `pole` becomes the direction that stereographs to infinity. */
export function rotationSendingPoleToInfinity(pole) {
    const basis = [];
    for (let axis = 0; axis < 4 && basis.length < 3; axis++) {
        let w = [0, 0, 0, 0];
        w[axis] = 1;
        let p = dot4(w, pole);
        w = w.map((value, k) => value - p * pole[k]);
        for (const b of basis) {
            p = dot4(w, b);
            w = w.map((value, k) => value - p * b[k]);
        }
        const norm = Math.hypot(...w);
        if (norm > 1e-7) basis.push(w.map((value) => value / norm));
    }
    while (basis.length < 3) basis.push([0, 0, 0, 0]);
    basis.push(pole.slice());

    return (w) => [
        dot4(basis[0], w),
        dot4(basis[1], w),
        dot4(basis[2], w),
        dot4(basis[3], w),
        w[4]
    ];
}

/** Inversive vector -> mirror in R^3.  Signed radius encodes which side is the chamber. */
export function vectorToMirror(v) {
    const denom = v[4] - v[3];
    if (Math.abs(denom) < 1e-7) {
        const norm = Math.hypot(v[0], v[1], v[2]) || 1;
        return {
            kind: 'plane',
            n: [v[0] / norm, v[1] / norm, v[2] / norm],
            h: v[3] / norm
        };
    }
    const r = 1 / denom;
    return {
        kind: 'sphere',
        c: [v[0] * r, v[1] * r, v[2] * r],
        r
    };
}

export function mirrorToVector(mirror) {
    if (mirror.kind === 'plane') {
        const norm = Math.hypot(mirror.n[0], mirror.n[1], mirror.n[2]) || 1;
        const n = mirror.n.map((value) => value / norm);
        const h = mirror.h / norm;
        return [n[0], n[1], n[2], h, h];
    }
    const [x, y, z] = mirror.c;
    const r = mirror.r;
    const a = (x * x + y * y + z * z - r * r);
    return [x / r, y / r, z / r, (a - 1) / (2 * r), (a + 1) / (2 * r)];
}

export function gramFromMirrors(mirrors) {
    const vectors = mirrors.map(mirrorToVector);
    return vectors.map((a) => vectors.map((b) => dot41(a, b)));
}

/**
 * Interpret an inversive product between two distinct mirrors.
 * g in (-1, 1)  : the mirrors meet at angle acos(|g|); discrete iff pi/m
 * g = -1        : tangent (a cusp / parabolic fixed point)
 * g < -1        : disjoint, hyperbolic distance acosh(-g) apart
 * g > 1         : nested, no common perpendicular in the usual sense
 */
export function describePair(g) {
    if (g <= -1 - 1e-7) {
        return { relation: 'disjoint', distance: Math.acosh(-g), value: g };
    }
    if (g < -1 + 1e-7) {
        return { relation: 'tangent', distance: 0, value: g };
    }
    if (g >= 1 - 1e-7) {
        return { relation: 'nested', value: g };
    }
    const angle = Math.acos(Math.max(-1, Math.min(1, -g)));
    const order = Math.PI / angle;
    const rounded = Math.round(order);
    const isCoxeter = rounded >= 2 && Math.abs(order - rounded) < 1e-6;
    return {
        relation: 'intersecting',
        angle,
        angleDegrees: (angle * 180) / Math.PI,
        order: isCoxeter ? rounded : order,
        isCoxeter,
        value: g
    };
}

/** Gram entry for a Coxeter label: integer m, 0 or Infinity for tangency. */
export function coxeterEntry(m) {
    if (!isFinite(m) || m === 0) return -1;
    return -Math.cos(Math.PI / m);
}
