// worker.js
// Web Worker for offloading heavy group theory computations

import { Complex, Matrix2, repWithNonnegativeRealTrace, keyFromNumber } from './geometry.js';
import { generateGroupElements, computeDelaunayNeighbors, imageOfBasepoint, computeOrbitPoints } from './groups.js';

// Re-hydrate plain objects into class instances
function hydrateComplex(z) {
    return new Complex(z.re, z.im);
}

function hydrateMatrix(m) {
    return new Matrix2(
        hydrateComplex(m.a),
        hydrateComplex(m.b),
        hydrateComplex(m.c),
        hydrateComplex(m.d)
    );
}

// Canonical key for the bisector between two points (duplicated from rendering.js logic for now)
// We need this to deduplicate walls in the worker
function bisectorKeyFromPoints(p, q) {
    const eps = 1e-9;
    const xp = p.x, yp = p.y, zp = p.z;
    const xq = q.x, yq = q.y, zq = q.z;

    // Heights equal -> vertical plane
    if (Math.abs(zp - zq) < eps) {
        const nx = xq - xp;
        const ny = yq - yp;
        const nlen = Math.hypot(nx, ny);
        if (nlen < eps) return null;
        let n0x = nx / nlen, n0y = ny / nlen;

        const Sp = xp * xp + yp * yp + zp * zp;
        const Sq = xq * xq + yq * yq + zq * zq;
        const nlen2 = (xq - xp) * (xq - xp) + (yq - yp) * (yq - yp);
        const d = nlen2 < eps ? 0 : ((Sq - Sp) / 2) / nlen2;

        if (n0x < -eps || (Math.abs(n0x) <= eps && n0y < 0)) {
            n0x = -n0x; n0y = -n0y;
        }
        const kx = keyFromNumber(n0x);
        const ky = keyFromNumber(n0y);
        const kd = keyFromNumber(d);
        return `V:${kx}:${ky}:${kd}`;
    }

    // Hemisphere
    const denom = (zq - zp);
    const cx = (zq * xp - zp * xq) / denom;
    const cy = (zq * yp - zp * yq) / denom;
    const Sp = xp * xp + yp * yp + zp * zp;
    const Sq = xq * xq + yq * yq + zq * zq;
    const c2 = cx * cx + cy * cy;
    const r2 = c2 - (zq * Sp - zp * Sq) / denom;
    if (!(r2 > eps)) return null;
    const r = Math.sqrt(r2);
    const kcx = keyFromNumber(cx);
    const kcy = keyFromNumber(cy);
    const kr = keyFromNumber(r);
    return `H:${kcx}:${kcy}:${kr}`;
}

console.log('Worker started');

self.onmessage = function (e) {
    console.log('Worker received message', e.data);
    const {
        generators: rawGenerators,
        wordLength,
        wallsMode
    } = e.data;

    try {
        const generators = rawGenerators.map(hydrateMatrix);
        const groupElements = generateGroupElements(generators, wordLength);

        // We need a basepoint object that looks like THREE.Vector3 for groups.js functions
        // groups.js uses THREE.Vector3, but since we are in a worker, we might not have THREE loaded globally if import map fails.
        // However, groups.js imports THREE. If that import works, we are good.
        // If not, we might need to mock it. But assuming module worker works:
        // We can't easily pass THREE.Vector3 back and forth.
        // groups.js returns THREE.Vector3 objects. We'll map them to plain objects.

        const basepoint = { x: 0, y: 0, z: 1 }; // Mock vector

        // Note: computeDelaunayNeighbors uses hDist which uses .x, .y, .z.
        // It also returns objects with .v (Vector3).
        const neighbors = computeDelaunayNeighbors(groupElements, basepoint);

        // Prepare data for rendering

        // 1. Orbit Points
        const orbitPts = computeOrbitPoints(groupElements).map(v => ({ x: v.x, y: v.y, z: v.z }));

        // 2. Limit Set Points
        const limitSetPts = [];
        for (const item of groupElements) {
            const g = (item && item.m) ? item.m : item;
            if (!g) continue;
            const p = imageOfBasepoint(g);
            if (isFinite(p.t)) {
                limitSetPts.push({ x: p.u.re, y: p.u.im, z: 0.002 });
            }
        }

        // 3. Walls
        const walls = [];
        const I = new Matrix2(new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(1, 0));

        if (wallsMode === 'dirichlet') {
            const o = imageOfBasepoint(I);
            const vO = { x: o.u.re, y: o.u.im, z: o.t };

            const sList = neighbors
                .map(n => ({ g: (n && n.g) ? n.g : n, word: n && n.word ? n.word : undefined }))
                .filter(x => x.g);

            sList.forEach((sObj, si) => {
                const s = sObj.g;
                const p2 = imageOfBasepoint(s);
                if (!isFinite(p2.t) || p2.t <= 0) return;
                const vS = { x: p2.u.re, y: p2.u.im, z: p2.t };

                const labelM = repWithNonnegativeRealTrace(s);
                walls.push({
                    p1: vO,
                    p2: vS,
                    index: si,
                    total: sList.length,
                    word: sObj.word || '',
                    labelMatrix: labelM // will be serialized
                });
            });
        } else if (wallsMode === 'all') {
            const allG = [I, ...groupElements.map(o => (o && o.m) ? o.m : o)];
            const neighborsWithWords = neighbors.map(n => ({ g: (n && n.g) ? n.g : n, word: n && n.word ? n.word : '' })).filter(x => x.g);
            const wallKeys = new Set();

            neighborsWithWords.forEach((sObj, si) => {
                const s = sObj.g;
                allG.forEach(g => {
                    const p1 = imageOfBasepoint(g);
                    const p2 = imageOfBasepoint(g.multiply(s));
                    if (!isFinite(p1.t) || p1.t <= 0 || !isFinite(p2.t) || p2.t <= 0) return;
                    if (Math.abs(p1.u.re - p2.u.re) < 1e-12 && Math.abs(p1.u.im - p2.u.im) < 1e-12 && Math.abs(p1.t - p2.t) < 1e-12) return;

                    const v1 = { x: p1.u.re, y: p1.u.im, z: p1.t };
                    const v2 = { x: p2.u.re, y: p2.u.im, z: p2.t };

                    const key = bisectorKeyFromPoints(v1, v2);
                    if (!key || wallKeys.has(key)) return;
                    wallKeys.add(key);

                    const labelM = repWithNonnegativeRealTrace(s);
                    walls.push({
                        p1: v1,
                        p2: v2,
                        index: si,
                        total: neighborsWithWords.length,
                        word: sObj.word,
                        labelMatrix: labelM,
                        randomSeed: Math.random() // for random coloring
                    });
                });
            });
        }

        // 4. Delaunay Edges
        const delaunayEdges = [];
        // We compute edges for ALL group elements if we want the full graph, 
        // but usually we just show edges from basepoint or the full tiling graph?
        // The original code for 'toggleDelaunay' did:
        // Iterate s in neighbors, then iterate g in allG, draw arc g(o) -> g(s(o))
        // This matches the 'all' walls logic.

        const allG = [I, ...groupElements.map(o => (o && o.m) ? o.m : o)];
        const sList = neighbors.map(n => (n && n.g) ? n.g : n).filter(Boolean);

        sList.forEach((s, si) => {
            allG.forEach(g => {
                const p1 = imageOfBasepoint(g);
                const p2 = imageOfBasepoint(g.multiply(s));
                if (!isFinite(p1.t) || p1.t <= 0 || !isFinite(p2.t) || p2.t <= 0) return;
                if (Math.abs(p1.u.re - p2.u.re) < 1e-12 && Math.abs(p1.u.im - p2.u.im) < 1e-12 && Math.abs(p1.t - p2.t) < 1e-12) return;

                const v1 = { x: p1.u.re, y: p1.u.im, z: p1.t };
                const v2 = { x: p2.u.re, y: p2.u.im, z: p2.t };

                delaunayEdges.push({
                    p1: v1,
                    p2: v2,
                    index: si,
                    total: sList.length
                });
            });
        });

        // Send back results
        // We also send back groupElements (serialized) for other uses (stabilizer, export)
        // But we strip the 'm' to avoid circular refs if any (there shouldn't be) and reduce size?
        // Actually passing Matrix2 is fine, it serializes to {a,b,c,d}.

        self.postMessage({
            type: 'result',
            orbitPts,
            limitSetPts,
            walls,
            delaunayEdges,
            groupElements: groupElements.map(e => ({ m: e.m, word: e.word })), // ensure clean objects
            neighbors: neighbors.map(n => ({ g: n.g, word: n.word, v: { x: n.v.x, y: n.v.y, z: n.v.z } }))
        });

    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};
