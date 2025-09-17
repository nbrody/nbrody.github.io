
// Hyperbolic Geometry Functions

// Hyperbolic distance in upper half-space H^3
function hDist(p, q) {
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const num = dx * dx + dy * dy + dz * dz;
    const den = 2 * p.z * q.z;
    const c = 1 + num / den;
    return Math.acosh(Math.max(1, c));
}

// Image of the basepoint o=(0,0,1) under m in PSL(2,C)
function imageOfBasepoint(m) {
    const cAbs2 = m.c.normSq();
    const dAbs2 = m.d.normSq();
    const denom = cAbs2 + dAbs2;
    if (denom === 0) return { u: new Complex(0, 0), t: Infinity };
    const a_conj_c = m.a.mul(m.c.conjugate());
    const b_conj_d = m.b.mul(m.d.conjugate());
    const u = a_conj_c.add(b_conj_d);
    const invDen = 1.0 / denom;
    const uScaled = new Complex(u.re * invDen, u.im * invDen);
    const t = invDen;
    return { u: uScaled, t: t };
}

function computeOrbitPoints(groupElements) {
    const pts = [];
    for (const g of groupElements) {
        const p = imageOfBasepoint(g);
        if (!isFinite(p.t) || p.t <= 0) continue;
        if (Math.abs(p.u.re) < 1e-12 && Math.abs(p.u.im) < 1e-12 && Math.abs(p.t - 1) < 1e-12) continue;
        pts.push(new THREE.Vector3(p.u.re, p.u.im, p.t));
    }
    return pts;
}

function bisectorKeyFromPoints(p, q) {
    const eps = 1e-9;
    const xp = p.x, yp = p.y, zp = p.z;
    const xq = q.x, yq = q.y, zq = q.z;

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

function samplePointsOnBisector(u, t, maxSamples = 160) {
    const pts = [];
    const eps = 1e-9;

    if (Math.abs(t - 1.0) < eps) {
        const n = new THREE.Vector3(u.re, u.im, 0);
        if (n.length() < eps) return pts;
        n.normalize();
        const tmp = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const b1 = new THREE.Vector3().crossVectors(n, tmp).normalize();
        const b2 = new THREE.Vector3().crossVectors(n, b1).normalize();
        const center = new THREE.Vector3(u.re / 2, u.im / 2, 1);
        const R = 2.5, steps = Math.max(4, Math.floor(Math.sqrt(maxSamples)));
        for (let i = -steps; i <= steps; i++) {
            for (let j = -steps; j <= steps; j++) {
                const s = i / steps, t2 = j / steps;
                const p = new THREE.Vector3().copy(center)
                    .addScaledVector(b1, R * s)
                    .addScaledVector(b2, R * t2);
                if (p.z > eps) pts.push(p);
            }
        }
        return pts;
    }

    const oneMinusT = 1 - t;
    if (Math.abs(oneMinusT) < eps) return pts;
    const cx = u.re / oneMinusT, cy = u.im / oneMinusT;
    const r2 = t * (1 + (u.re * u.re + u.im * u.im) / (oneMinusT * oneMinusT));
    if (r2 <= eps) return pts;
    const r = Math.sqrt(r2);
    const center = new THREE.Vector3(cx, cy, 0);

    const rings = Math.max(6, Math.floor(Math.sqrt(maxSamples)));
    const segs = rings * 2;
    for (let i = 1; i <= rings; i++) {
        const phi = (i / (rings + 1)) * Math.PI / 2;
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

function computeDelaunayNeighbors(groupElements) {
    const basepoint = new THREE.Vector3(0, 0, 1);
    const orbit = [basepoint];
    const invs = [];

    for (const g of groupElements) {
        const inv = g.inverse();
        if (!inv) continue;
        const p = imageOfBasepoint(inv);
        if (!isFinite(p.t) || p.t <= 0) continue;
        const v = new THREE.Vector3(p.u.re, p.u.im, p.t);
        orbit.push(v);
        invs.push({ u: p.u, t: p.t, v, g });
    }

    const neighborsMap = new Map();
    for (const item of invs) {
        const samples = samplePointsOnBisector(item.u, item.t, 160);
        let contributes = false;
        for (const s of samples) {
            const d0 = hDist(basepoint, s);
            const d1 = hDist(item.v, s);
            if (Math.abs(d0 - d1) > 2e-3) continue;
            let ok = true;
            for (let k = 1; k < orbit.length; k++) {
                const dk = hDist(orbit[k], s);
                if (dk < d0) { ok = false; break; }
            }
            if (ok) { contributes = true; break; }
        }
        if (contributes) {
            const key = keyFromVec(item.v);
            if (!neighborsMap.has(key)) {
                neighborsMap.set(key, { v: item.v, g: item.g });
            }
        }
    }
    return Array.from(neighborsMap.values());
}

function symmetrizeGroupElements(elements) {
    const symElements = new Map();
    elements.forEach(m => {
        const key = keyFromMatrix(m);
        if (!symElements.has(key)) {
            symElements.set(key, m);
        }
    });
    return Array.from(symElements.values());
}

function generateGroupElements(gens, wordLength) {
    const elements = new Map();
    const initialSet = symmetrizeGroupElements([
        ...gens,
        ...gens.map(g => g.inverse()).filter(Boolean)
    ]);

    let queue = [...initialSet];
    const I = new Matrix2(new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(1, 0));
    const identityKey = keyFromMatrix(I);
    elements.set(identityKey, I);

    queue.forEach(g => {
        const key = keyFromMatrix(g);
        elements.set(key, g);
    });

    for (let l = 1; l < wordLength; l++) {
        const nextQueue = [];
        for (const word of queue) {
            for (const g of initialSet) {
                const newWord = word.multiply(g);
                if (newWord.isIdentity()) continue;
                const key = keyFromMatrix(newWord);
                if (!elements.has(key)) {
                    elements.set(key, newWord);
                    nextQueue.push(newWord);
                }
            }
        }
        queue = nextQueue;
    }

    const out = Array.from(elements.entries())
        .filter(([k, _]) => k !== identityKey)
        .map(([_, v]) => v);
    return out;
}

function matrixSetsEqual(A = [], B = []) {
    if (!Array.isArray(A) || !Array.isArray(B)) return false;
    if (A.length !== B.length) return false;
    const setA = new Set(A.map(m => keyFromMatrix(repWithNonnegativeRealTrace(m))));
    const setB = new Set(B.map(m => keyFromMatrix(repWithNonnegativeRealTrace(m))));
    if (setA.size !== setB.size) return false;
    for (const k of setA) if (!setB.has(k)) return false;
    return true;
}

function computeStandardGenerators(gens, L) {
    const gensSym = symmetrizeGroupElements([
        ...gens,
        ...gens.map(g => g && typeof g.inverse === 'function' ? g.inverse() : null).filter(Boolean)
    ]);

    const stdGens = [];
    stdGens[0] = gensSym;
    stdGens[1] = gensSym;

    if (L <= 1) {
        const chosen = (stdGens[L] || gensSym).map(repWithNonnegativeRealTrace);
        return { gens: symmetrizeGroupElements(chosen), level: Math.max(0, L), converged: L <= 1 };
    }

    for (let i = 1; i < L; i++) {
        const products = [];
        const Gi = stdGens[i] || [];
        const Gim1 = stdGens[i - 1] || [];
        const I = new Matrix2(new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(1, 0));

        for (const g of Gi) {
            for (const h of [I, ...Gim1]) {
                if (g && h && typeof g.multiply === 'function') {
                    products.push(g.multiply(h));
                }
            }
        }

        const productsSym = symmetrizeGroupElements(products);
        const neighbors = computeDelaunayNeighbors(productsSym) || [];
        const nextSet = symmetrizeGroupElements(
            neighbors.map(n => (n && n.g) ? n.g : n).filter(Boolean)
        );
        stdGens[i + 1] = nextSet;

        if (matrixSetsEqual(stdGens[i + 1], stdGens[i])) {
            const chosen = stdGens[i].map(repWithNonnegativeRealTrace);
            return { gens: symmetrizeGroupElements(chosen), level: i, converged: true };
        }
    }

    const chosen = (stdGens[L] || gensSym).map(repWithNonnegativeRealTrace);
    return { gens: symmetrizeGroupElements(chosen), level: L, converged: false };
}