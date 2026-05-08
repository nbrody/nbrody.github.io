// Knot library: parametric presets + Gauss-code → 3D embedding.
// All builders return an Array of THREE.Vector3 (closed polygon, last != first).

const TAU = Math.PI * 2;

// ---- Parametric presets ------------------------------------------------

function sample(parametric, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        const [x, y, z] = parametric(t);
        pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
}

function unknot(n) {
    return sample(t => [Math.cos(t), Math.sin(t), 0], n);
}

// Standard trefoil parametrization (3_1).
function trefoil(n) {
    return sample(t => [
        Math.sin(t) + 2 * Math.sin(2 * t),
        Math.cos(t) - 2 * Math.cos(2 * t),
        -Math.sin(3 * t),
    ], n);
}

// Figure-eight knot (4_1) — Bob Krawczyk's parametrization.
function figureEight(n) {
    return sample(t => {
        const ct = Math.cos(t), st = Math.sin(t);
        const c2 = Math.cos(2 * t), s2 = Math.sin(2 * t);
        return [
            (2 + Math.cos(2 * t)) * Math.cos(3 * t),
            (2 + c2) * Math.sin(3 * t),
            Math.sin(4 * t),
        ];
    }, n);
}

// (p,q) torus knot on a torus of major radius R, minor radius r.
function torusKnot(p, q, n, R = 2, r = 1) {
    return sample(t => {
        const a = R + r * Math.cos(q * t);
        return [a * Math.cos(p * t), a * Math.sin(p * t), r * Math.sin(q * t)];
    }, n);
}

// ---- Gauss-code → stadium embedding -----------------------------------
//
// Signed Gauss code: a sequence of tokens like "O1+ U2+ O3+ U1+ O2+ U3+"
// (trefoil). Each token = (over/under)(crossing #)(sign). We walk the code
// in order, place each visit on a circle, and lift over-strands in +z and
// under-strands in -z to give a clean initial embedding that has the right
// crossings and the right knot type.

function parseGaussCode(text) {
    const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
    const visits = [];
    for (const tok of tokens) {
        const m = tok.match(/^([OU])\s*(\d+)\s*([+\-]?)$/i);
        if (!m) throw new Error(`Cannot parse Gauss token "${tok}"`);
        visits.push({
            type: m[1].toUpperCase(),     // 'O' or 'U'
            crossing: parseInt(m[2], 10),
            sign: m[3] === '-' ? -1 : 1,
        });
    }
    if (visits.length % 2 !== 0)
        throw new Error('Gauss code must have an even number of tokens');
    // Sanity check: each crossing # appears exactly twice (once O, once U).
    const counts = new Map();
    for (const v of visits) {
        const c = counts.get(v.crossing) || { O: 0, U: 0 };
        c[v.type]++;
        counts.set(v.crossing, c);
    }
    for (const [k, c] of counts) {
        if (c.O !== 1 || c.U !== 1)
            throw new Error(`Crossing ${k} should appear once over and once under`);
    }
    return visits;
}

// Build an initial 3D polygon from a parsed Gauss code. We place a
// "control point" for each visit on a circle; the two visits of the same
// crossing land at almost the same xy location (one above, one below).
function gaussToPolygon(visits, samplesPerArc = 24, lift = 0.6, radius = 4) {
    const N = visits.length;            // = 2 * (#crossings)
    // Group visits by crossing # to find paired indices.
    const pair = new Map();
    visits.forEach((v, i) => {
        if (!pair.has(v.crossing)) pair.set(v.crossing, [i, -1]);
        else pair.get(v.crossing)[1] = i;
    });

    // First pass: place each visit on the unit circle in order. This gives
    // each *visit* its own slot, so the knot is just a circle with z=0.
    const slots = visits.map((_, i) => {
        const a = (i / N) * TAU;
        return new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), 0);
    });

    // Second pass: for each crossing, pull the two visits together in xy
    // (so they actually cross when projected) and split them in z.
    const ctrl = slots.map(p => p.clone());
    for (const [, [i, j]] of pair) {
        const mid = ctrl[i].clone().add(ctrl[j]).multiplyScalar(0.5);
        // Move both visits 80% toward the midpoint in xy, keep their own z slot.
        const blend = 0.8;
        const pi = ctrl[i].clone().lerp(mid, blend);
        const pj = ctrl[j].clone().lerp(mid, blend);
        const zi = visits[i].type === 'O' ? lift : -lift;
        const zj = visits[j].type === 'O' ? lift : -lift;
        ctrl[i].set(pi.x, pi.y, zi);
        ctrl[j].set(pj.x, pj.y, zj);
    }

    // Third pass: between successive control points, place samplesPerArc
    // intermediate points so the discrete polygon is dense enough for the
    // energy minimizer.  Use a Catmull-Rom curve for smoothness.
    const curve = new THREE.CatmullRomCurve3(ctrl, /*closed*/ true,
        'centripetal', 0.5);
    const total = N * samplesPerArc;
    const out = [];
    for (let i = 0; i < total; i++) {
        out.push(curve.getPoint(i / total));
    }
    return out;
}

// Convenience: build straight from a Gauss-code string.
function fromGaussCode(text, samplesPerArc = 24) {
    return gaussToPolygon(parseGaussCode(text), samplesPerArc);
}

// ---- Preset registry ---------------------------------------------------

const KNOT_PRESETS = {
    unknot:      { name: 'Unknot (0₁)',         build: n => unknot(n),                    n: 80  },
    trefoil:     { name: 'Trefoil (3₁)',        build: n => trefoil(n),                   n: 200 },
    figureEight: { name: 'Figure-eight (4₁)',   build: n => figureEight(n),               n: 240 },
    cinquefoil:  { name: 'Cinquefoil (5₁)',     build: n => torusKnot(2, 5, n, 2, 1),     n: 280 },
    threeTwist:  { name: '5₂ via Gauss code',   build: () => fromGaussCode('O1+ U2+ O3+ U1+ O4+ U5+ O2+ U3+ O5+ U4+'), n: 240 },
    torus_3_2:   { name: '(3,2) torus knot',    build: n => torusKnot(3, 2, n, 2, 1),     n: 240 },
    torus_5_2:   { name: '(5,2) torus knot',    build: n => torusKnot(5, 2, n, 2.4, 1),   n: 280 },
    torus_7_2:   { name: '(7,2) torus knot',    build: n => torusKnot(7, 2, n, 2.8, 1),   n: 320 },
    torus_5_3:   { name: '(5,3) torus knot',    build: n => torusKnot(5, 3, n, 2.4, 1),   n: 320 },
    granny:      { name: 'Granny (3₁ # 3₁)',    build: () => fromGaussCode(
        'O1+ U2+ O3+ U1+ O2+ U3+ O4+ U5+ O6+ U4+ O5+ U6+'), n: 320 },
    square:      { name: 'Square (3₁ # 3₁*)',   build: () => fromGaussCode(
        'O1+ U2+ O3+ U1+ O2+ U3+ O4- U5- O6- U4- O5- U6-'), n: 320 },
};

window.KnotLib = {
    KNOT_PRESETS, parseGaussCode, gaussToPolygon, fromGaussCode,
    unknot, trefoil, figureEight, torusKnot,
};
