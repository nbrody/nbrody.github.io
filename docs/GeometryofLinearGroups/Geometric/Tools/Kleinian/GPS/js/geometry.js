// geometry.js — Poincaré / Klein disk primitives.
//
// A geodesic ("wall") is stored by its two ideal endpoints A, B on the unit
// circle, together with cached Euclidean data: either a diameter (unit normal
// nx,ny) or a circle orthogonal to the unit circle (center cx,cy, radius R).
// Both the Klein chord and the Poincaré arc share the same ideal endpoints,
// so this representation transports cleanly between models.

export function kleinToPoincare(k) {
    const s = k[0] * k[0] + k[1] * k[1];
    if (s >= 1 - 1e-12) {              // ideal point: same in both models
        const r = Math.sqrt(s);
        return [k[0] / r, k[1] / r];
    }
    const d = 1 + Math.sqrt(1 - s);
    return [k[0] / d, k[1] / d];
}

export function wallFromIdeal(A, B) {
    const dot = A[0] * B[0] + A[1] * B[1];
    if (dot < -1 + 1e-10) {            // antipodal endpoints → diameter
        let nx = -(B[1] - A[1]), ny = B[0] - A[0];
        const m = Math.hypot(nx, ny);
        return { kind: 'diam', A, B, nx: nx / m, ny: ny / m };
    }
    const f = 1 / (1 + dot);
    const cx = (A[0] + B[0]) * f, cy = (A[1] + B[1]) * f;
    const R2 = cx * cx + cy * cy - 1;
    return { kind: 'circ', A, B, cx, cy, R2, R: Math.sqrt(Math.max(R2, 0)) };
}

// Geodesic through ideal point I and a second point P (interior or ideal).
export function wallThroughIdealAndPoint(I, P) {
    const det = I[0] * P[1] - I[1] * P[0];
    if (Math.abs(det) < 1e-12) {       // collinear with origin → diameter
        return wallFromIdeal(I, [-I[0], -I[1]]);
    }
    // Center O solves  I·O = 1,  P·O = (1+|P|²)/2.
    const rhs = (1 + P[0] * P[0] + P[1] * P[1]) / 2;
    const ox = (P[1] * 1 - I[1] * rhs) / det;
    const oy = (I[0] * rhs - P[0] * 1) / det;
    const R2 = ox * ox + oy * oy - 1;
    const R = Math.sqrt(Math.max(R2, 0));
    // Recover the second ideal endpoint (intersection of the circle with ∂D other than I).
    // Points X on both circles satisfy X·O = 1; parametrize the chord.
    const m = Math.hypot(ox, oy);
    const fx = ox / (m * m), fy = oy / (m * m);            // foot of {X·O=1} from origin
    const t = Math.sqrt(Math.max(0, 1 - 1 / (m * m)));
    const tx = -oy / m, ty = ox / m;
    const E1 = [fx + t * tx, fy + t * ty], E2 = [fx - t * tx, fy - t * ty];
    const d1 = Math.hypot(E1[0] - I[0], E1[1] - I[1]);
    const B = d1 > 1e-9 ? E1 : E2;
    return { kind: 'circ', A: I, B, cx: ox, cy: oy, R2, R };
}

// Reflect a point across a wall (Poincaré model isometry; also maps ∂D → ∂D).
export function reflect(w, p) {
    if (w.kind === 'diam') {
        const d = 2 * (p[0] * w.nx + p[1] * w.ny);
        return [p[0] - d * w.nx, p[1] - d * w.ny];
    }
    const dx = p[0] - w.cx, dy = p[1] - w.cy;
    const s = dx * dx + dy * dy;
    if (s < 1e-18) return [p[0], p[1]];
    const f = w.R2 / s;
    return [w.cx + dx * f, w.cy + dy * f];
}

export function reflectWall(w, mirror) {
    return wallFromIdeal(reflect(mirror, w.A), reflect(mirror, w.B));
}

// Sample the geodesic segment of wall `w` between points P, Q (both lying on w).
// Returns an array of [x,y] including endpoints.
export function sampleEdge(w, P, Q, quality = 500) {
    if (w.kind === 'diam') return [P, Q];
    const a0 = Math.atan2(P[1] - w.cy, P[0] - w.cx);
    const a1 = Math.atan2(Q[1] - w.cy, Q[0] - w.cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const n = Math.max(2, Math.min(48, Math.ceil(Math.abs(da) * w.R * quality)));
    const pts = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * da;
        pts[i] = [w.cx + w.R * Math.cos(a), w.cy + w.R * Math.sin(a)];
    }
    return pts;
}

export function centroid(verts) {
    let x = 0, y = 0;
    for (const v of verts) { x += v[0]; y += v[1]; }
    return [x / verts.length, y / verts.length];
}
