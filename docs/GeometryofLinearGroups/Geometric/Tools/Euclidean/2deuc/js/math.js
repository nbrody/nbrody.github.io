// math.js — Isometries of R^2
// An isometry is x -> Ax + b where A in O(2), b in R^2.
// We represent it as { A: [[a,b],[c,d]], b: [tx,ty], type: string }

export function translation(tx, ty) {
    return { A: [[1, 0], [0, 1]], b: [tx, ty], type: 'translation' };
}

export function rotation(angle, cx = 0, cy = 0) {
    const c = Math.cos(angle), s = Math.sin(angle);
    // Rotation about (cx, cy): R(x - p) + p = Rx + (p - Rp)
    const bx = cx - c * cx + s * cy;
    const by = cy - s * cx - c * cy;
    return { A: [[c, -s], [s, c]], b: [bx, by], type: 'rotation' };
}

export function reflection(angle) {
    // Reflection across line through origin at angle theta
    const c2 = Math.cos(2 * angle), s2 = Math.sin(2 * angle);
    return { A: [[c2, s2], [s2, -c2]], b: [0, 0], type: 'reflection' };
}

export function reflectionLine(angle, px, py) {
    // Reflection across line through (px,py) at angle theta
    const c2 = Math.cos(2 * angle), s2 = Math.sin(2 * angle);
    const bx = px - c2 * px - s2 * py;
    const by = py - s2 * px + c2 * py;
    return { A: [[c2, s2], [s2, -c2]], b: [bx, by], type: 'reflection' };
}

export function glideReflection(angle, dist, px = 0, py = 0) {
    // Reflection across line through (px,py) at angle theta, then translate by dist along line
    const ref = reflectionLine(angle, px, py);
    const tx = dist * Math.cos(angle);
    const ty = dist * Math.sin(angle);
    ref.b[0] += tx;
    ref.b[1] += ty;
    ref.type = 'glide';
    return ref;
}

export function compose(f, g) {
    // f after g: x -> f(g(x)) = Af(Ag x + bg) + bf = (Af Ag)x + (Af bg + bf)
    const [Af, Ag] = [f.A, g.A];
    const A = [
        [Af[0][0] * Ag[0][0] + Af[0][1] * Ag[1][0], Af[0][0] * Ag[0][1] + Af[0][1] * Ag[1][1]],
        [Af[1][0] * Ag[0][0] + Af[1][1] * Ag[1][0], Af[1][0] * Ag[0][1] + Af[1][1] * Ag[1][1]]
    ];
    const b = [
        Af[0][0] * g.b[0] + Af[0][1] * g.b[1] + f.b[0],
        Af[1][0] * g.b[0] + Af[1][1] * g.b[1] + f.b[1]
    ];
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    let type;
    if (Math.abs(det - 1) < 1e-9) {
        const tr = A[0][0] + A[1][1];
        if (Math.abs(tr - 2) < 1e-9) type = 'translation';
        else type = 'rotation';
    } else {
        if (Math.abs(b[0]) < 1e-9 && Math.abs(b[1]) < 1e-9) type = 'reflection';
        else type = 'glide';
    }
    return { A, b, type };
}

export function inverse(f) {
    // f^{-1}(y) = A^{-1}(y - b) = A^T y - A^T b  (since A is orthogonal, A^{-1} = A^T)
    const At = [[f.A[0][0], f.A[1][0]], [f.A[0][1], f.A[1][1]]];
    const b = [
        -(At[0][0] * f.b[0] + At[0][1] * f.b[1]),
        -(At[1][0] * f.b[0] + At[1][1] * f.b[1])
    ];
    return { A: At, b, type: f.type };
}

export function apply(f, x, y) {
    return [
        f.A[0][0] * x + f.A[0][1] * y + f.b[0],
        f.A[1][0] * x + f.A[1][1] * y + f.b[1]
    ];
}

export function applyPt(f, pt) {
    return apply(f, pt[0], pt[1]);
}

// Linear interpolation of isometries for animation
// We decompose into rotation angle + translation, interpolate, recompose
export function lerp(f, t) {
    // Interpolate from identity to f at parameter t in [0,1]
    const det = f.A[0][0] * f.A[1][1] - f.A[0][1] * f.A[1][0];
    const isReflection = det < 0;

    if (isReflection) {
        // Smoothly interpolate A and b from identity to the reflection.
        // At t = 0.5 the domain collapses onto the mirror line (det = 0),
        // then pops out reflected. Passes through non-isometries but looks great.
        const A = [
            [1 - t + t * f.A[0][0], t * f.A[0][1]],
            [t * f.A[1][0], 1 - t + t * f.A[1][1]]
        ];
        const bx = f.b[0] * t;
        const by = f.b[1] * t;
        return {
            iso: { A, b: [bx, by], type: 'reflection' },
            opacity: 1,
            snap: false
        };
    }

    // Orientation-preserving: decompose A = R(theta), interpolate theta and b
    const theta = Math.atan2(f.A[1][0], f.A[0][0]);
    const thetaT = theta * t;
    const c = Math.cos(thetaT), s = Math.sin(thetaT);
    const bx = f.b[0] * t, by = f.b[1] * t;

    // But for rotation about a point, we need to interpolate the fixed point correctly.
    // f(x) = Rx + b, fixed point p = (I-R)^{-1} b when det(I-R) != 0
    if (Math.abs(theta) > 1e-9) {
        // Has a fixed point — rotate about it
        const det2 = (1 - f.A[0][0]) * (1 - f.A[1][1]) - f.A[0][1] * f.A[1][0];
        if (Math.abs(det2) > 1e-9) {
            const px = ((1 - f.A[1][1]) * f.b[0] + f.A[0][1] * f.b[1]) / det2;
            const py = (f.A[1][0] * f.b[0] + (1 - f.A[0][0]) * f.b[1]) / det2;
            const rt = rotation(thetaT, px, py);
            return { iso: rt, opacity: 1, snap: false };
        }
    }

    return {
        iso: { A: [[c, -s], [s, c]], b: [bx, by], type: t === 0 ? 'translation' : f.type },
        opacity: 1,
        snap: false
    };
}

export function identity() {
    return { A: [[1, 0], [0, 1]], b: [0, 0], type: 'translation' };
}

// Generate orbit of a point under a group (list of isometries applied to a point set)
export function generateOrbit(generators, range, origin = [0, 0]) {
    // BFS: apply generators and their inverses up to `range` steps
    const pts = [origin];
    const seen = new Set();
    seen.add(key(origin));
    let frontier = [identity()];
    const allIsos = [];
    generators.forEach(g => { allIsos.push(g); allIsos.push(inverse(g)); });

    for (let depth = 0; depth < range; depth++) {
        const next = [];
        for (const iso of frontier) {
            for (const g of allIsos) {
                const composed = compose(g, iso);
                const p = applyPt(composed, origin);
                const k = key(p);
                if (!seen.has(k)) {
                    seen.add(k);
                    pts.push(p);
                    next.push(composed);
                }
            }
        }
        frontier = next;
        if (frontier.length === 0) break;
    }
    return pts;
}

function key(p) {
    return `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
}

// Generate all images of a polygon under a group
export function generateTiling(generators, range, polygon) {
    const seen = new Set();
    seen.add('0,0');
    let frontier = [identity()];
    const tiles = [{ iso: identity(), poly: polygon }];
    const allIsos = [];
    generators.forEach(g => { allIsos.push(g); allIsos.push(inverse(g)); });

    for (let depth = 0; depth < range; depth++) {
        const next = [];
        for (const iso of frontier) {
            for (const g of allIsos) {
                const composed = compose(g, iso);
                const center = applyPt(composed, [0, 0]);
                const k = key(center);
                if (!seen.has(k)) {
                    seen.add(k);
                    const poly = polygon.map(p => applyPt(composed, p));
                    tiles.push({ iso: composed, poly });
                    next.push(composed);
                }
            }
        }
        frontier = next;
        if (frontier.length === 0) break;
    }
    return tiles;
}
