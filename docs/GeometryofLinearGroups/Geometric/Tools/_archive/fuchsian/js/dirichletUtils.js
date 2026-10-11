/**
 * Dirichlet domain computation utilities for hyperbolic 3-space
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

// Constants
const KEY_SCALE = 1e6; // tolerance ~1e-6
const basepoint = new THREE.Vector3(0, 0, 1);

// Discretize float for deduplication
export function keyFromNumber(x, scale = KEY_SCALE) {
    return Math.round(x * scale);
}

// Create key from Vector3
export function keyFromVec(vec, scale = KEY_SCALE) {
    return `${keyFromNumber(vec.x, scale)}:${keyFromNumber(vec.y, scale)}:${keyFromNumber(vec.z, scale)}`;
}

// PSL(2,C) canonicalization: identify ±m
export function canonicalizePSL(m) {
    const arr = [m.a.re, m.a.im, m.b.re, m.b.im, m.c.re, m.c.im, m.d.re, m.d.im];
    let flip = false;
    for (const v of arr) {
        if (Math.abs(v) > 1e-12) {
            if (v < 0) flip = true;
            break;
        }
    }
    return flip ? m.neg() : m;
}

// Create canonical key from matrix
export function keyFromMatrix(m, scale = KEY_SCALE) {
    const mc = canonicalizePSL(m);
    const parts = [mc.a.re, mc.a.im, mc.b.re, mc.b.im, mc.c.re, mc.c.im, mc.d.re, mc.d.im]
        .map(v => keyFromNumber(v, scale));
    return parts.join(';');
}

// Image of basepoint o=(0,0,1) under m in PSL(2,C)
// m·o = ( (a\bar c + b\bar d) / (|c|^2 + |d|^2),  1 / (|c|^2 + |d|^2) )
// Returns {u: Complex, t: real} where point is (Re(u), Im(u), t)
export function imageOfBasepoint(m) {
    const cAbs2 = m.c.normSq();
    const dAbs2 = m.d.normSq();
    const denom = cAbs2 + dAbs2;
    if (denom === 0) return { u: { re: 0, im: 0 }, t: Infinity };

    const a_conj_c = m.a.mul(m.c.conjugate());
    const b_conj_d = m.b.mul(m.d.conjugate());
    const u = a_conj_c.add(b_conj_d);

    const invDen = 1.0 / denom;
    const uScaled = { re: u.re * invDen, im: u.im * invDen };
    const t = invDen;

    return { u: uScaled, t: t };
}

// Hyperbolic distance in upper half-space model
export function hDist(p, q) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const dz = p.z - q.z;
    const num = dx * dx + dy * dy + dz * dz;
    const den = 2 * p.z * q.z;
    const c = 1 + num / den;
    return Math.acosh(Math.max(1, c));
}

// Sample points on the bisector between basepoint o and point (u, t)
export function samplePointsOnBisector(u, t, maxSamples = 160) {
    const pts = [];
    const eps = 1e-9;

    // If t ≈ 1, bisector is a vertical plane
    if (Math.abs(t - 1.0) < eps) {
        const n = new THREE.Vector3(u.re, u.im, 0);
        if (n.length() < eps) return pts;
        n.normalize();

        const tmp = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const b1 = new THREE.Vector3().crossVectors(n, tmp).normalize();
        const b2 = new THREE.Vector3().crossVectors(n, b1).normalize();
        const center = new THREE.Vector3(u.re / 2, u.im / 2, 1);

        const R = 2.5;
        const steps = Math.max(4, Math.floor(Math.sqrt(maxSamples)));
        for (let i = -steps; i <= steps; i++) {
            for (let j = -steps; j <= steps; j++) {
                const s = i / steps;
                const t2 = j / steps;
                const p = new THREE.Vector3().copy(center)
                    .addScaledVector(b1, R * s)
                    .addScaledVector(b2, R * t2);
                if (p.z > eps) pts.push(p);
            }
        }
        return pts;
    }

    // Hemisphere case (center on z=0, orthogonal to boundary)
    const oneMinusT = 1 - t;
    if (Math.abs(oneMinusT) < eps) return pts;

    const cx = u.re / oneMinusT;
    const cy = u.im / oneMinusT;
    const r2 = t * (1 + (u.re * u.re + u.im * u.im) / (oneMinusT * oneMinusT));
    if (r2 <= eps) return pts;

    const r = Math.sqrt(r2);
    const center = new THREE.Vector3(cx, cy, 0);

    const rings = Math.max(6, Math.floor(Math.sqrt(maxSamples)));
    const segs = rings * 2;
    for (let i = 1; i <= rings; i++) {
        const phi = (i / (rings + 1)) * Math.PI / 2; // cap at z>=0
        const z = r * Math.cos(phi);
        const rho = r * Math.sin(phi);
        for (let j = 0; j < segs; j++) {
            const theta = (2 * Math.PI * j) / segs;
            const x = center.x + rho * Math.cos(theta);
            const y = center.y + rho * Math.sin(theta);
            const p = new THREE.Vector3(x, y, z);
            if (p.z > eps) pts.push(p);
        }
    }
    return pts;
}

// Generate all group elements up to a given word length
export function generateGroupElements(gens, wordLength) {
    const elements = new Map();

    // Identity
    const I = gens[0].constructor === Function ?
        new gens[0].constructor(
            {re: 1, im: 0}, {re: 0, im: 0},
            {re: 0, im: 0}, {re: 1, im: 0}
        ) :
        {
            a: {re: 1, im: 0}, b: {re: 0, im: 0},
            c: {re: 0, im: 0}, d: {re: 1, im: 0},
            mul: (x) => x,
            isIdentity: () => true
        };

    const identityKey = keyFromMatrix(I);
    elements.set(identityKey, { m: I, word: 'e' });

    // Initial set: g_i and g_i^{-1} (LaTeX-friendly strings)
    const initialSet = [];
    gens.forEach((g, i) => {
        const nameLatex = `g_{${i + 1}}`;
        initialSet.push({ m: g, word: nameLatex });
        const inv = g.inverse ? g.inverse() : null;
        if (inv) initialSet.push({ m: inv, word: `${nameLatex}^{-1}` });
    });

    // Seed queue + map
    let queue = [];
    initialSet.forEach(obj => {
        if (!obj || !obj.m) return;
        const key = keyFromMatrix(obj.m);
        if (!elements.has(key)) {
            elements.set(key, obj);
            queue.push(obj);
        }
    });

    // BFS up to the requested word length
    for (let l = 1; l < (parseInt(wordLength) || 1); l++) {
        const nextQueue = [];
        for (const wobj of queue) {
            for (const s of initialSet) {
                const newM = wobj.m.multiply(s.m);
                if (newM.isIdentity && newM.isIdentity()) continue;
                const key = keyFromMatrix(newM);
                if (!elements.has(key)) {
                    const newObj = { m: newM, word: `${wobj.word}\\, ${s.word}` };
                    elements.set(key, newObj);
                    nextQueue.push(newObj);
                }
            }
        }
        queue = nextQueue;
    }

    // Exclude identity
    const out = [];
    for (const [k, v] of elements.entries()) {
        if (k !== identityKey) out.push(v);
    }
    return out;
}

// Compute which group elements contribute faces to the Dirichlet domain
export function computeDelaunayNeighbors(groupElements) {
    const orbit = [basepoint];
    const imgs = [];

    // Compute images of basepoint under all group elements
    for (const item of groupElements) {
        const g = (item && item.m) ? item.m : item;
        const w = (item && item.word) ? item.word : undefined;
        const p = imageOfBasepoint(g);
        if (!isFinite(p.t) || p.t <= 0) continue;
        const v = new THREE.Vector3(p.u.re, p.u.im, p.t);
        orbit.push(v);
        imgs.push({ u: p.u, t: p.t, v, g, word: w });
    }

    // Test each bisector to see if it contributes a full edge (not just a vertex)
    const neighborsMap = new Map();
    for (const item of imgs) {
        const samples = samplePointsOnBisector(item.u, item.t, 160);
        const validPoints = [];

        // Find all sample points that lie on the bisector and in the Dirichlet domain
        for (const s of samples) {
            const d0 = hDist(basepoint, s);
            const d1 = hDist(item.v, s);
            if (Math.abs(d0 - d1) > 2e-3) continue;

            let ok = true;
            for (let k = 1; k < orbit.length; k++) {
                const dk = hDist(orbit[k], s);
                if (dk < d0 - 1e-6) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                validPoints.push(s);
            }
        }

        // Check if we have a full edge (multiple distinct points) rather than just a vertex
        // Require multiple valid points that span a significant distance
        let hasEdge = false;
        if (validPoints.length >= 3) {
            // Find the maximum distance between any two valid points
            let maxDist = 0;
            for (let i = 0; i < validPoints.length - 1; i++) {
                for (let j = i + 1; j < validPoints.length; j++) {
                    const dist = hDist(validPoints[i], validPoints[j]);
                    maxDist = Math.max(maxDist, dist);
                }
            }
            // Require a minimum edge length to distinguish from a single vertex
            const minEdgeLength = 0.05; // Increased threshold for stricter filtering
            hasEdge = maxDist > minEdgeLength;
        }

        if (hasEdge) {
            const key = keyFromVec(item.v);
            if (!neighborsMap.has(key)) {
                neighborsMap.set(key, { v: item.v, g: item.g, word: item.word });
            }
        }
    }

    return Array.from(neighborsMap.values());
}
