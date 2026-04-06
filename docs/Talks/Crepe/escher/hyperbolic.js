/* ================================================================
   Hyperbolic Geometry Engine — Poincaré Disk Model
   
   Complex number arithmetic and Möbius transformations for
   isometries of the hyperbolic plane.
   ================================================================ */

// ── Complex number operations ────────────────────────────────────

/** Complex number as [re, im] */
function cAdd(a, b) { return [a[0]+b[0], a[1]+b[1]]; }
function cSub(a, b) { return [a[0]-b[0], a[1]-b[1]]; }
function cMul(a, b) { return [a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]]; }
function cConj(a)   { return [a[0], -a[1]]; }
function cAbs2(a)   { return a[0]*a[0] + a[1]*a[1]; }
function cAbs(a)    { return Math.sqrt(cAbs2(a)); }
function cScale(a, s) { return [a[0]*s, a[1]*s]; }
function cDiv(a, b) {
    const d = cAbs2(b);
    if (d < 1e-30) return [0, 0]; // safety
    return [(a[0]*b[0]+a[1]*b[1])/d, (a[1]*b[0]-a[0]*b[1])/d];
}
function cExp(theta) { return [Math.cos(theta), Math.sin(theta)]; }
function cNeg(a) { return [-a[0], -a[1]]; }

// ── Möbius Transformation ────────────────────────────────────────
// f(z) = (az + b) / (cz + d)
// Stored as {a, b, c, d} where each is a complex number [re, im]

function mobius(m, z) {
    const num = cAdd(cMul(m.a, z), m.b);
    const den = cAdd(cMul(m.c, z), m.d);
    return cDiv(num, den);
}

function mobiusCompose(m1, m2) {
    // m1 ∘ m2: first apply m2, then m1
    return {
        a: cAdd(cMul(m1.a, m2.a), cMul(m1.b, m2.c)),
        b: cAdd(cMul(m1.a, m2.b), cMul(m1.b, m2.d)),
        c: cAdd(cMul(m1.c, m2.a), cMul(m1.d, m2.c)),
        d: cAdd(cMul(m1.c, m2.b), cMul(m1.d, m2.d))
    };
}

function mobiusInverse(m) {
    const det = cSub(cMul(m.a, m.d), cMul(m.b, m.c));
    return {
        a: cDiv(m.d, det),
        b: cDiv(cNeg(m.b), det),
        c: cDiv(cNeg(m.c), det),
        d: cDiv(m.a, det)
    };
}

const MOBIUS_IDENTITY = {
    a: [1, 0], b: [0, 0],
    c: [0, 0], d: [1, 0]
};

// ── Hyperbolic isometries (Poincaré disk) ────────────────────────

/**
 * Hyperbolic translation: maps z0 to the origin.
 * f(z) = (z - z0) / (1 - conj(z0)*z)
 */
function hypTranslation(z0) {
    return {
        a: [1, 0],
        b: cNeg(z0),
        c: cNeg(cConj(z0)),
        d: [1, 0]
    };
}

/**
 * Hyperbolic translation that moves the origin to the point at
 * hyperbolic distance `dist` in direction `theta`.
 * f(z) = (z + z0) / (1 + conj(z0)*z)
 * where z0 = tanh(dist/2) * e^(i*theta)
 */
function hypTranslationDir(theta, dist) {
    const t = Math.tanh(dist / 2);
    const z0 = [t * Math.cos(theta), t * Math.sin(theta)];
    return {
        a: [1, 0],
        b: z0,
        c: cConj(z0),
        d: [1, 0]
    };
}

/**
 * Rotation about the origin by angle theta.
 * f(z) = e^(i*theta) * z
 */
function hypRotation(theta) {
    return {
        a: cExp(theta),
        b: [0, 0],
        c: [0, 0],
        d: [1, 0]
    };
}

/**
 * Rotation by π about an arbitrary point m in the Poincaré disk.
 * 
 * Derived: R_π(m)(z) = (2m - z(1+|m|²)) / (1+|m|² - 2m̄z)
 * 
 * This is the key generator for the tessellation: rotating π about
 * an edge midpoint maps one tile to its neighbor across that edge.
 */
function halfTurnAbout(m) {
    const s = 1 + cAbs2(m); // 1 + |m|²
    return {
        a: [-s, 0],           // -(1+|m|²)
        b: cScale(m, 2),      // 2m
        c: cScale(cConj(m), -2), // -2m̄
        d: [s, 0]             // 1+|m|²
    };
}

// ── Hyperbolic geometry utilities ────────────────────────────────

/**
 * Hyperbolic distance between two points in the Poincaré disk.
 * d(z1,z2) = 2 atanh(|(z1-z2)/(1-z̄1 z2)|)
 */
function hypDist(z1, z2) {
    const diff = cSub(z1, z2);
    const denom = cSub([1,0], cMul(cConj(z1), z2));
    const ratio = cAbs(cDiv(diff, denom));
    return 2 * Math.atanh(Math.min(ratio, 0.99999));
}

/**
 * Hyperbolic midpoint of z1 and z2.
 * Computed by translating z1 to origin, finding the midpoint of the
 * resulting geodesic (a diameter), then translating back.
 * 
 * CRITICAL: uses proper hyperbolic distance, NOT Euclidean linear interp.
 */
function hypMidpoint(z1, z2) {
    // Translate z1 to origin
    const T = hypTranslation(z1);
    const Tinv = mobiusInverse(T);
    const w = mobius(T, z2); // z2 in translated frame (geodesic is now a diameter)
    
    const wAbs = cAbs(w);
    if (wAbs < 1e-12) return [...z1]; // points coincide
    
    // Hyperbolic distance from origin to w
    const d = 2 * Math.atanh(Math.min(wAbs, 0.99999));
    // Midpoint is at half the hyperbolic distance
    const midR = Math.tanh(d / 4); // tanh((d/2)/2) = tanh(d/4)
    
    // Direction of w
    const wDir = [w[0] / wAbs, w[1] / wAbs];
    const wMid = cScale(wDir, midR);
    
    // Map back to original frame
    return mobius(Tinv, wMid);
}

/**
 * Interpolate along a hyperbolic geodesic from z1 to z2.
 * Parameter t ∈ [0,1]. Uses proper hyperbolic arc-length parameterization.
 */
function geodesicInterp(z1, z2, t) {
    if (t <= 0) return [z1[0], z1[1]];
    if (t >= 1) return [z2[0], z2[1]];
    
    // Translate z1 to origin
    const T = hypTranslation(z1);
    const Tinv = mobiusInverse(T);
    const w = mobius(T, z2);
    
    const wAbs = cAbs(w);
    if (wAbs < 1e-12) return [z1[0], z1[1]];
    
    // Hyperbolic distance origin->w
    const d = 2 * Math.atanh(Math.min(wAbs, 0.99999));
    // Point at fraction t of the hyperbolic distance
    const targetR = Math.tanh(t * d / 2);
    
    const wDir = [w[0] / wAbs, w[1] / wAbs];
    const wt = cScale(wDir, targetR);
    
    return mobius(Tinv, wt);
}

// ── Regular polygon vertices ─────────────────────────────────────

/**
 * Poincaré disk radius for vertices of a regular {p,q} polygon.
 * cosh(r) = cos(π/q) / sin(π/p)
 */
function regularPolygonRadius(p, q) {
    const cosQ = Math.cos(Math.PI / q);
    const sinP = Math.sin(Math.PI / p);
    const coshR = cosQ / sinP;
    if (coshR < 1) return 0; // degenerate
    const r = Math.acosh(coshR);
    return Math.tanh(r / 2);
}

/**
 * Poincaré disk radius for edge midpoints (apothem) of a regular {p,q} polygon.
 * cosh(d) = cos(π/p) / sin(π/q)
 */
function regularPolygonApothem(p, q) {
    const cosP = Math.cos(Math.PI / p);
    const sinQ = Math.sin(Math.PI / q);
    const coshD = cosP / sinQ;
    if (coshD < 1) return 0;
    const d = Math.acosh(coshD);
    return Math.tanh(d / 2);
}

/**
 * Generate vertices of a regular p-gon centered at origin,
 * for a {p,q} tessellation.
 */
function regularHypPolygon(p, q, rotOffset) {
    const radius = regularPolygonRadius(p, q);
    rotOffset = rotOffset || 0;
    const verts = [];
    for (let i = 0; i < p; i++) {
        const angle = rotOffset + (2 * Math.PI * i) / p;
        verts.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    }
    return verts;
}
