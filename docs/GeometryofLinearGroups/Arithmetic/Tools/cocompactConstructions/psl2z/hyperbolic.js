function mobiusComplex(m, z) {
    const det = m[0] * m[3] - m[1] * m[2];
    const isReversing = det < -EPS;

    // For orientation-reversing (det < 0), we use f(z) = (a*conj(z) + b) / (c*conj(z) + d)
    const zRe = z.re;
    const zIm = isReversing ? -z.im : z.im;

    const numRe = m[0] * zRe + m[1];
    const numIm = m[0] * zIm;
    const denRe = m[2] * zRe + m[3];
    const denIm = m[2] * zIm;
    const denAbs2 = denRe * denRe + denIm * denIm;

    if (denAbs2 < EPS) {
        return { re: Infinity, im: Infinity };
    }
    return {
        re: (numRe * denRe + numIm * denIm) / denAbs2,
        im: (numIm * denRe - numRe * denIm) / denAbs2
    };
}

function mobiusReal(m, x) {
    if (!Number.isFinite(x)) {
        return Math.abs(m[2]) < EPS ? Infinity : m[0] / m[2];
    }
    const den = m[2] * x + m[3];
    if (Math.abs(den) < EPS) return Infinity;
    return (m[0] * x + m[1]) / den;
}

function classifyElement(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (det < -EPS) return 'reflection';
    const tr = m[0] + m[3];
    const disc = tr * tr - 4;
    if (disc > 1e-9) return 'hyperbolic';
    if (disc < -1e-9) return 'elliptic';
    return 'parabolic';
}

function translationLength(m) {
    const t = Math.abs(m[0] + m[3]);
    if (t <= 2) return 0;
    return 2 * Math.acosh(t / 2);
}

function axisFromEndpoints(x1, x2) {
    if (!Number.isFinite(x1) && !Number.isFinite(x2)) return null;
    if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
        const finiteX = Number.isFinite(x1) ? x1 : x2;
        if (!Number.isFinite(finiteX)) return null;
        return {
            type: 'vertical',
            x: finiteX,
            x1,
            x2
        };
    }
    if (Math.abs(x1 - x2) < 1e-11) return null;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    return {
        type: 'arc',
        x1: left,
        x2: right,
        center: (left + right) / 2,
        radius: (right - left) / 2
    };
}

function axisFromMatrix(m) {
    const tr = m[0] + m[3];
    if (Math.abs(tr) <= 2 + 1e-12) return null;

    if (Math.abs(m[2]) < EPS) {
        if (Math.abs(m[0] - m[3]) < EPS) return null;
        const x = m[1] / (m[3] - m[0]);
        return axisFromEndpoints(x, Infinity);
    }

    const disc = tr * tr - 4;
    if (disc <= 0) return null;
    const s = Math.sqrt(disc);
    const x1 = (m[0] - m[3] + s) / (2 * m[2]);
    const x2 = (m[0] - m[3] - s) / (2 * m[2]);
    return axisFromEndpoints(x1, x2);
}

function mapAxisByMatrix(m, axis) {
    const y1 = mobiusReal(m, axis.x1);
    const y2 = mobiusReal(m, axis.x2);
    return axisFromEndpoints(y1, y2);
}

function axesIntersect(a1, a2) {
    if (!a1 || !a2) return false;

    if (a1.type === 'vertical' && a2.type === 'vertical') {
        return Math.abs(a1.x - a2.x) < 1e-9;
    }

    if (a1.type === 'vertical' && a2.type === 'arc') {
        return a2.x1 < a1.x && a1.x < a2.x2;
    }

    if (a2.type === 'vertical' && a1.type === 'arc') {
        return a1.x1 < a2.x && a2.x < a1.x2;
    }

    if (a1.type === 'arc' && a2.type === 'arc') {
        const c1 = a1.x1 < a2.x1 && a2.x1 < a1.x2 && a1.x2 < a2.x2;
        const c2 = a2.x1 < a1.x1 && a1.x1 < a2.x2 && a2.x2 < a1.x2;
        return c1 || c2;
    }

    return false;
}

function toCanvas(z) {
    return {
        x: state.offsetX + z.re * state.scale,
        y: state.offsetY - z.im * state.scale
    };
}

function fromCanvas(px, py) {
    return {
        re: (px - state.offsetX) / state.scale,
        im: (state.offsetY - py) / state.scale
    };
}

function complexDiv(numRe, numIm, denRe, denIm) {
    const denAbs2 = denRe * denRe + denIm * denIm;
    if (denAbs2 < EPS) return null;
    return {
        re: (numRe * denRe + numIm * denIm) / denAbs2,
        im: (numIm * denRe - numRe * denIm) / denAbs2
    };
}

function uhpToDisk(z) {
    const q = complexDiv(z.re, z.im - 1, z.re, z.im + 1);
    if (!q) return null;
    if (!Number.isFinite(q.re) || !Number.isFinite(q.im)) return null;
    return q;
}

function diskToUhp(w) {
    const q = complexDiv(1 + w.re, w.im, 1 - w.re, -w.im);
    if (!q) return null;
    const out = { re: -q.im, im: q.re };
    if (!Number.isFinite(out.re) || !Number.isFinite(out.im)) return null;
    return out;
}

function poincareToKlein(w) {
    const r2 = w.re * w.re + w.im * w.im;
    const den = 1 + r2;
    if (den < EPS) return null;
    return {
        x: (2 * w.re) / den,
        y: (2 * w.im) / den
    };
}

function kleinToPoincare(k) {
    const r2 = k.x * k.x + k.y * k.y;
    if (r2 >= 1 - 1e-12) return null;
    const s = Math.sqrt(Math.max(0, 1 - r2));
    const den = 1 + s;
    if (den < EPS) return null;
    return {
        re: k.x / den,
        im: k.y / den
    };
}

function computeEuclideanHull(points) {
    if (points.length <= 1) return points.slice();

    const sorted = points.slice().sort((p, q) => {
        if (p.x !== q.x) return p.x - q.x;
        return p.y - q.y;
    });

    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function computeOrbitIHyperbolicHull(orbitI) {
    const kleinPoints = [];
    const seen = new Set();

    for (const item of orbitI) {
        const w = uhpToDisk(item.z);
        if (!w) continue;
        const k = poincareToKlein(w);
        if (!k) continue;
        const r2 = k.x * k.x + k.y * k.y;
        if (r2 >= 1 - 1e-10) continue;

        const key = `${round6(k.x)}|${round6(k.y)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        kleinPoints.push(k);
    }

    if (kleinPoints.length < 3) return [];
    const hullKlein = computeEuclideanHull(kleinPoints);
    if (hullKlein.length < 3) return [];

    const hullUhp = [];
    for (const k of hullKlein) {
        const w = kleinToPoincare(k);
        if (!w) continue;
        const z = diskToUhp(w);
        if (!z || z.im <= EPS) continue;
        hullUhp.push(z);
    }

    return hullUhp;
}

function yVisibleMax() {
    return Math.max(3, (state.offsetY + 4) / state.scale);
}

function appendHyperbolicSegment(ctxRef, p1, p2, samples = 10) {
    if (!Number.isFinite(p1.re) || !Number.isFinite(p1.im) || !Number.isFinite(p2.re) || !Number.isFinite(p2.im)) {
        return;
    }

    if (Math.abs(p1.re - p2.re) < 1e-10) {
        for (let i = 1; i <= samples; i += 1) {
            const t = i / samples;
            const z = {
                re: p1.re,
                im: p1.im + (p2.im - p1.im) * t
            };
            const c = toCanvas(z);
            ctxRef.lineTo(c.x, c.y);
        }
        return;
    }

    const x1 = p1.re;
    const y1 = p1.im;
    const x2 = p2.re;
    const y2 = p2.im;

    const center = (x1 * x1 + y1 * y1 - x2 * x2 - y2 * y2) / (2 * (x1 - x2));
    const r2 = (x1 - center) * (x1 - center) + y1 * y1;
    if (!Number.isFinite(center) || r2 <= EPS) {
        const c2 = toCanvas(p2);
        ctxRef.lineTo(c2.x, c2.y);
        return;
    }

    const radius = Math.sqrt(r2);
    let t1 = Math.atan2(y1, x1 - center);
    let t2 = Math.atan2(y2, x2 - center);

    if (t1 < 0) t1 += Math.PI;
    if (t2 < 0) t2 += Math.PI;

    for (let i = 1; i <= samples; i += 1) {
        const t = i / samples;
        const theta = t1 + (t2 - t1) * t;
        const z = {
            re: center + radius * Math.cos(theta),
            im: Math.max(0, radius * Math.sin(theta))
        };
        const c = toCanvas(z);
        ctxRef.lineTo(c.x, c.y);
    }
}

// ---- Convex core computation ----
// Everything below works in the Klein model where geodesics are straight lines.
// The convex core = Dirichlet domain at i ∩ convex hull of orbit(i).

// Perpendicular bisector of two points in the Klein disk.
// In the Klein model the hyperbolic midpoint lies on the chord,
// and the perpendicular bisector is a chord of the boundary circle
// whose supporting line passes through the "pole" of the chord with
// respect to the unit circle.
//
// For two points p, q in the Klein disk the perpendicular bisector
// is the locus { x : d_H(x,p) = d_H(x,q) }.  In the Klein model
// this is a straight line, and its equation can be written as
//     n · x = d
// where n and d come directly from the Beltrami–Klein metric.

function kleinPerpBisector(p, q) {
    // The signed half-plane defined by n·x <= d contains the side closer to p.
    // In the Klein model the hyperbolic distance uses the formula
    //   cosh d(x,y) = (1 - x·y) / sqrt((1 - |x|^2)(1 - |y|^2))
    // so d(x,p) <= d(x,q) iff (1 - x·p)^2 (1-|q|^2) <= (1 - x·q)^2 (1-|p|^2).
    //
    // Expanding and using the fact that the bisector is a linear equation in x:
    //   n = (1 - |q|^2) p  -  (1 - |p|^2) q
    //   d = 0.5 * (|p|^2 (1 - |q|^2) - |q|^2 (1 - |p|^2))  ... but this isn't
    //   quite right because the expansion mixes quadratic and linear terms.
    //
    // Simpler approach:  map to the Poincaré model, compute the geodesic midpoint
    // and perpendicular direction there, then map the resulting geodesic back.
    // But even simpler: the set { x : d_K(x,p) = d_K(x,q) } in the Klein model
    // with the Beltrami–Klein metric is in general NOT a straight line in Euclidean
    // coordinates, EXCEPT for the case of the bisector in the *hyperbolic* metric,
    // which IS a chord.
    //
    // The cleanest approach: find the midpoint M of p,q on the hyperbolic geodesic
    // through them, then find the tangent direction of that geodesic at M and
    // rotate 90° to get the normal of the bisector chord.
    //
    // Actually, for Sutherland-Hodgman we just need the half-plane { x : d(x,p) ≤ d(x,q) }.
    // The boundary is a chord. We can find two points on this chord by going through
    // the Poincaré model, or we can use the polar/pole trick:
    //
    // Fact: In the Klein model, the perpendicular from a point P to a chord AB is the
    // line through P and the pole of AB with respect to the unit circle.
    //
    // For us: A, B are p and q. The chord we want is *perpendicular* to pq through
    // the hyperbolic midpoint of p and q.  The pole of the chord pq (the line through
    // p and q) w.r.t. the unit circle is the point from which the tangent lines to
    // the circle touch at the endpoints of the chord pq (extended to the circle).
    //
    // The simplest correct approach for a half-plane test:
    // We convert p and q to the Poincaré model, compute the midpoint in the Poincaré
    // model, convert back, and get the normal from the *Klein* direction of pq.

    const pp2 = p.x * p.x + p.y * p.y;
    const qq2 = q.x * q.x + q.y * q.y;

    // Poincaré model coordinates (Klein -> Poincaré by P_i = K_i / (1 + sqrt(1 - |K|^2)))
    const sp = Math.sqrt(Math.max(0, 1 - pp2));
    const sq = Math.sqrt(Math.max(0, 1 - qq2));
    if (sp < 1e-14 || sq < 1e-14) return null;

    const ppx = p.x / (1 + sp);
    const ppy = p.y / (1 + sp);
    const qpx = q.x / (1 + sq);
    const qpy = q.y / (1 + sq);

    // Hyperbolic midpoint in the Poincaré model via Möbius operations:
    // M = midpoint of p' and q' on the geodesic = the point on the geodesic
    // equidistant from p' and q'.
    //
    // For a pair of points in the Poincaré disk the midpoint on the geodesic
    // can be found by: apply the Möbius map that sends p' to origin, find
    // the image of q', halve the hyperbolic distance, map back.
    //
    // Or we can just check the sign of d(x,p) - d(x,q) directly.
    // For Sutherland-Hodgman clipping, we only need the signed distance to
    // the bisector line.  In the Klein model:
    //
    //   d_H(x,p)^2 sign = arccosh^2((1-x·p)/sqrt((1-|x|^2)(1-|p|^2)))
    //
    // This is messy.  Let's use a cleaner characterization.
    //
    // In the Klein model, d_H(x, p) ≤ d_H(x, q) can be tested via:
    //   (1 - x·p)^2 (1 - |q|^2) ≤ (1 - x·q)^2 (1 - |p|^2)
    //
    // since cosh is monotone increasing on [0, ∞).
    //
    // Let α = 1 - |p|^2, β = 1 - |q|^2.  Then the condition is:
    //   β(1 - x·p)^2 ≤ α(1 - x·q)^2
    //
    // Taking square roots (both sides positive):
    //   sqrt(β)(1 - x·p) ≤ sqrt(α)(1 - x·q)   (if 1 - x·p ≥ 0 and 1 - x·q ≥ 0,
    //   which holds for x inside the disk when p,q are inside the disk)
    //
    //   sqrt(β) - sqrt(β)(x·p) ≤ sqrt(α) - sqrt(α)(x·q)
    //   sqrt(α)(x·q) - sqrt(β)(x·p) ≤ sqrt(α) - sqrt(β)
    //   x · (sqrt(α) q - sqrt(β) p) ≤ sqrt(α) - sqrt(β)
    //
    // So the half-plane is n·x ≤ d with:
    //   n = sqrt(α) q - sqrt(β) p
    //   d = sqrt(α) - sqrt(β)

    const alpha = 1 - pp2;
    const beta = 1 - qq2;
    if (alpha < 1e-14 || beta < 1e-14) return null;

    const sa = Math.sqrt(alpha);
    const sb = Math.sqrt(beta);

    const nx = sa * q.x - sb * p.x;
    const ny = sa * q.y - sb * p.y;
    const d = sa - sb;

    const nlen = Math.sqrt(nx * nx + ny * ny);
    if (nlen < 1e-14) return null;

    return { nx: nx / nlen, ny: ny / nlen, d: d / nlen };
}

// Sutherland-Hodgman clipping of a convex polygon (array of {x,y}) against
// the half-plane  n·x ≤ d.
function clipPolygonByHalfPlane(poly, nx, ny, d) {
    if (poly.length === 0) return poly;
    const out = [];
    const n = poly.length;

    for (let i = 0; i < n; i++) {
        const cur = poly[i];
        const nxt = poly[(i + 1) % n];
        const dCur = nx * cur.x + ny * cur.y - d;
        const dNxt = nx * nxt.x + ny * nxt.y - d;

        if (dCur <= 1e-12) {
            // cur is inside
            out.push(cur);
            if (dNxt > 1e-12) {
                // nxt is outside → add intersection
                const t = dCur / (dCur - dNxt);
                out.push({
                    x: cur.x + t * (nxt.x - cur.x),
                    y: cur.y + t * (nxt.y - cur.y)
                });
            }
        } else {
            // cur is outside
            if (dNxt <= 1e-12) {
                // nxt is inside → add intersection
                const t = dCur / (dCur - dNxt);
                out.push({
                    x: cur.x + t * (nxt.x - cur.x),
                    y: cur.y + t * (nxt.y - cur.y)
                });
            }
        }
    }
    return out;
}

// Compute the convex core:
// 1. Start with the convex hull of orbit(i) in the Klein model.
// 2. For each orbit point g·i (g ≠ e), clip by the Dirichlet half-plane
//    { x : d(x, i) ≤ d(x, g·i) }.
// 3. Convert result back to upper half-plane.
function computeConvexCore(orbitI, orbitIHull) {
    if (!orbitIHull || orbitIHull.length < 3) return [];
    if (!orbitI || orbitI.length < 2) return [];

    // Convert the convex hull to Klein model
    let kleinPoly = [];
    for (const z of orbitIHull) {
        const w = uhpToDisk(z);
        if (!w) continue;
        const k = poincareToKlein(w);
        if (!k) continue;
        const r2 = k.x * k.x + k.y * k.y;
        if (r2 >= 1 - 1e-10) continue;
        kleinPoly.push(k);
    }
    if (kleinPoly.length < 3) return [];

    // Base point i in Klein model
    const wI = uhpToDisk(I_BASE);
    const kI = poincareToKlein(wI);

    // For each orbit point g·i (skip identity → skip the base point i itself),
    // clip by Dirichlet half-plane
    for (const item of orbitI) {
        if (Math.abs(item.z.re - I_BASE.re) < 1e-9 && Math.abs(item.z.im - I_BASE.im) < 1e-9) {
            continue; // skip i itself
        }

        const wg = uhpToDisk(item.z);
        if (!wg) continue;
        const kg = poincareToKlein(wg);
        if (!kg) continue;
        const r2 = kg.x * kg.x + kg.y * kg.y;
        if (r2 >= 1 - 1e-10) continue;

        const bisector = kleinPerpBisector(kI, kg);
        if (!bisector) continue;

        kleinPoly = clipPolygonByHalfPlane(kleinPoly, bisector.nx, bisector.ny, bisector.d);
        if (kleinPoly.length < 3) return [];
    }

    // Convert back to UHP
    const result = [];
    for (const k of kleinPoly) {
        const r2 = k.x * k.x + k.y * k.y;
        if (r2 >= 1 - 1e-12) continue;
        const w = kleinToPoincare(k);
        if (!w) continue;
        const z = diskToUhp(w);
        if (!z || z.im <= EPS) continue;
        result.push(z);
    }

    return result;
}

function isPointInKleinPolygon(p, poly) {
    if (!poly || poly.length < 3) return false;
    let alpha = 0;
    for (let i = 0; i < poly.length; i++) {
        const v1 = poly[i];
        const v2 = poly[(i + 1) % poly.length];
        const cp = (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
        const s = Math.sign(cp);
        if (Math.abs(cp) < 1e-12) continue;
        if (alpha === 0) alpha = s;
        else if (s !== alpha) return false;
    }
    return true;
}

function computeTopologicalType(convexCore, orbitI, elements) {
    if (!convexCore || convexCore.length < 3 || !orbitI || orbitI.length < 2) {
        return null;
    }

    const n = convexCore.length;

    // Convert core vertices to Klein model
    const kleinVerts = [];
    for (const z of convexCore) {
        const w = uhpToDisk(z);
        if (!w) return null;
        const k = poincareToKlein(w);
        if (!k) return null;
        kleinVerts.push(k);
    }

    // Base point i in Klein model
    const wI = uhpToDisk(I_BASE);
    const kI = poincareToKlein(wI);

    // Precompute Klein coords for orbit points (skip identity)
    const orbitKlein = [];
    for (const item of orbitI) {
        if (Math.abs(item.z.re - I_BASE.re) < 1e-9 && Math.abs(item.z.im - I_BASE.im) < 1e-9) {
            continue;
        }
        const wg = uhpToDisk(item.z);
        if (!wg) continue;
        const kg = poincareToKlein(wg);
        if (!kg) continue;
        const r2 = kg.x * kg.x + kg.y * kg.y;
        if (r2 >= 1 - 1e-10) continue;
        const bisector = kleinPerpBisector(kI, kg);
        if (!bisector) continue;
        orbitKlein.push({ kg, bisector, m: item.m });
    }

    // Step 1: Classify each edge as 'hull' or 'dirichlet'
    // For each edge, test if its midpoint lies on a Dirichlet bisector.
    const edgeLabels = [];
    for (let i = 0; i < n; i++) {
        const v0 = kleinVerts[i];
        const v1 = kleinVerts[(i + 1) % n];
        const mx = (v0.x + v1.x) / 2;
        const my = (v0.y + v1.y) / 2;

        let bestOrbit = null;
        let bestDist = 1e-5; // tolerance for lying on bisector

        for (const orb of orbitKlein) {
            const dist = Math.abs(orb.bisector.nx * mx + orb.bisector.ny * my - orb.bisector.d);
            if (dist < bestDist) {
                bestDist = dist;
                bestOrbit = orb;
            }
        }

        if (bestOrbit) {
            edgeLabels.push({ type: 'dirichlet', m: bestOrbit.m, mKey: matrixKey(bestOrbit.m) });
        } else {
            edgeLabels.push({ type: 'hull' });
        }
    }

    // Step 2: Pair Dirichlet edges (g paired with g⁻¹)
    const edgePairing = new Array(n).fill(-1);
    const selfPaired = new Set();
    for (let i = 0; i < n; i++) {
        if (edgeLabels[i].type !== 'dirichlet') continue;
        if (edgePairing[i] >= 0) continue;
        const invKey = matrixKey(matInv(edgeLabels[i].m));
        for (let j = i; j < n; j++) {
            if (edgeLabels[j].type !== 'dirichlet') continue;
            if (edgePairing[j] >= 0) continue;
            if (edgeLabels[j].mKey === invKey) {
                edgePairing[i] = j;
                edgePairing[j] = i;
                if (i === j) selfPaired.add(i);
                break;
            }
        }
    }

    // Step 3: Union-Find for vertex identification
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(x) {
        while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    }
    function unite(a, b) {
        a = find(a); b = find(b);
        if (a !== b) parent[a] = b;
    }

    // Edge i goes from vertex i to vertex (i+1)%n.
    // When edge i is paired with edge j, the identification reverses orientation:
    //   vertex i ↔ vertex (j+1)%n
    //   vertex (i+1)%n ↔ vertex j
    for (let i = 0; i < n; i++) {
        const j = edgePairing[i];
        if (j < 0) continue;
        if (i === j) {
            unite(i, (i + 1) % n);
        } else if (j > i) {
            unite(i, (j + 1) % n);
            unite((i + 1) % n, j);
        }
    }

    // Step 4: Count vertex equivalence classes
    const vertexClasses = new Map(); // root -> [list of vertex indices]
    for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!vertexClasses.has(r)) vertexClasses.set(r, []);
        vertexClasses.get(r).push(i);
    }
    const V = vertexClasses.size;

    // Step 5: Count edge equivalence classes
    const dirichletPairCount = edgePairing.filter((p, i) => p > i).length;
    const hullEdgeCount = edgeLabels.filter(e => e.type === 'hull').length;
    const unpairedDirichlet = edgeLabels.filter((e, i) => e.type === 'dirichlet' && edgePairing[i] < 0).length;
    const E = dirichletPairCount + hullEdgeCount + unpairedDirichlet;

    // Step 6: Euler characteristic
    const chi = V - E + 1;

    // Step 7: Count boundary components
    // Hull edges form the boundary. Two hull edges are consecutive in the same
    // boundary component if the end vertex of one is identified (via vertex
    // pairings) with the start vertex of another. This defines a permutation
    // on hull edges; its orbits are the boundary components.
    const hullEdgeIndices = [];
    for (let i = 0; i < n; i++) {
        if (edgeLabels[i].type === 'hull') hullEdgeIndices.push(i);
    }

    // Build a map: for each vertex class root, find the hull edge that STARTS there
    const hullStartByVertexClass = new Map();
    for (const hi of hullEdgeIndices) {
        const root = find(hi); // start vertex of this hull edge
        hullStartByVertexClass.set(root, hi);
    }

    // For each hull edge, its "next" hull edge in the boundary: the hull edge
    // whose start vertex is identified with this edge's end vertex.
    const hullVisited = new Set();
    let boundaryComponents = 0;

    for (const startHull of hullEdgeIndices) {
        if (hullVisited.has(startHull)) continue;
        let current = startHull;
        let safety = 0;
        while (safety++ < 4 * n) {
            hullVisited.add(current);
            // End vertex of current hull edge
            const endVert = (current + 1) % n;
            const endRoot = find(endVert);
            // Find the hull edge starting at a vertex identified with endVert
            const next = hullStartByVertexClass.get(endRoot);
            if (next === undefined || hullVisited.has(next)) break;
            current = next;
        }
        boundaryComponents++;
    }

    // If there are no hull edges, b = 0 (closed surface)
    const b = boundaryComponents;

    // Step 8: Detect cone points via interior angle sums
    // In the conformal UHP model, the interior angle at a vertex equals the
    // Euclidean angle between tangent vectors to the geodesic edges at that vertex.
    function geodesicTangentAtVertex(v, neighbor) {
        // Tangent to the hyperbolic geodesic from v toward neighbor, in UHP.
        // The geodesic in UHP is either a vertical line or a semicircle.
        const dx = neighbor.re - v.re;
        const dy = neighbor.im - v.im;

        if (Math.abs(dx) < 1e-11) {
            // Vertical geodesic
            return { tx: 0, ty: dy > 0 ? 1 : -1 };
        }

        // Semicircle: center on real axis, passing through v and neighbor
        const cx = (v.re * v.re + v.im * v.im - neighbor.re * neighbor.re - neighbor.im * neighbor.im) / (2 * (v.re - neighbor.re));
        const r = Math.sqrt((v.re - cx) * (v.re - cx) + v.im * v.im);

        // Tangent to circle at v: perpendicular to radius (v.re - cx, v.im)
        // Two choices of direction; pick the one pointing toward neighbor
        let tx = -v.im;
        let ty = v.re - cx;
        // Check direction: dot with (neighbor - v) should be positive
        if (tx * dx + ty * dy < 0) { tx = -tx; ty = -ty; }
        const tlen = Math.sqrt(tx * tx + ty * ty);
        return { tx: tx / tlen, ty: ty / tlen };
    }

    function interiorAngleAt(idx) {
        const prev = (idx - 1 + n) % n;
        const next = (idx + 1) % n;
        const v = convexCore[idx];
        const vPrev = convexCore[prev];
        const vNext = convexCore[next];

        // Tangent from v toward prev (incoming edge, reversed)
        const tIn = geodesicTangentAtVertex(v, vPrev);
        // Tangent from v toward next (outgoing edge)
        const tOut = geodesicTangentAtVertex(v, vNext);

        // Interior angle: angle from tOut to tIn going counterclockwise
        // (the polygon is traversed counterclockwise, so interior is to the left)
        let angle = Math.atan2(tIn.tx * tOut.ty - tIn.ty * tOut.tx,
            tIn.tx * tOut.tx + tIn.ty * tOut.ty);
        if (angle < 0) angle += 2 * Math.PI;
        return angle;
    }

    // Step 8: Detect cone points via interior angle sums
    let n_2 = selfPaired.size;
    let n_3 = 0;

    for (const [root, indices] of vertexClasses) {
        let totalAngle = 0;
        for (const idx of indices) {
            totalAngle += interiorAngleAt(idx);
        }
        // Check for cone points
        if (Math.abs(totalAngle - Math.PI) < 0.15) {
            n_2++; // order-2 cone point (angle sum = π)
        } else if (Math.abs(totalAngle - 2 * Math.PI / 3) < 0.15) {
            n_3++; // order-3 cone point (angle sum = 2π/3)
        }
        // totalAngle ≈ 2π → regular point (no cone)
    }

    // Step 9: Detect interior cone points (including stabilizer of base point)
    const interiorFixedPoints = new Set();
    const epsAngle = 0.05;

    for (const el of elements) {
        const t = Math.abs(el.m[0] + el.m[3]);
        const d = matDet(el.m);
        if (d < 0) continue; // Skip reflections for now

        const disc = t * t - 4 * d;
        if (disc < -1e-7) { // Elliptic
            // Fixed point z = (a-d + i*sqrt(-disc)) / 2c
            let z;
            if (Math.abs(el.m[2]) < 1e-9) {
                // If c=0, not elliptic in SL2(R)
                continue;
            } else {
                const s = Math.sqrt(-disc);
                z = { re: (el.m[0] - el.m[3]) / (2 * el.m[2]), im: s / Math.abs(2 * el.m[2]) };
            }

            const key = `${round6(z.re)}|${round6(z.im)}`;
            if (interiorFixedPoints.has(key)) continue;

            const w = uhpToDisk(z);
            const k = poincareToKlein(w);
            if (isPointInKleinPolygon(k, kleinVerts)) {
                // Check if it's near a vertex
                let nearVertex = false;
                for (const kv of kleinVerts) {
                    if (Math.hypot(kv.x - k.x, kv.y - k.y) < 0.01) {
                        nearVertex = true;
                        break;
                    }
                }
                // Check if it's on a self-paired edge
                let onEdge = false;
                for (const idx of selfPaired) {
                    const v0 = kleinVerts[idx];
                    const v1 = kleinVerts[(idx + 1) % n];
                    const mx = (v0.x + v1.x) / 2;
                    const my = (v0.y + v1.y) / 2;
                    if (Math.hypot(mx - k.x, my - k.y) < 0.01) {
                        onEdge = true;
                        break;
                    }
                }

                if (!nearVertex && !onEdge) {
                    interiorFixedPoints.add(key);
                    const angle = Math.acos(t / (2 * Math.sqrt(d)));
                    const order = Math.round(Math.PI / angle);
                    if (order === 2) n_2++;
                    else if (order === 3) n_3++;
                }
            }
        }
    }

    // Step 10: Compute genus from Euler characteristic
    // χ = 2 - 2g - b for underlying surface
    const genus = (2 - chi - b) / 2;

    return { genus: Math.max(0, Math.round(genus)), n_2, n_3, b };
}
