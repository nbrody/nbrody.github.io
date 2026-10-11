// groups.js
// Group theory operations: element generation, orbit computation, and Cayley graph

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.js';
import { Complex, Matrix2, keyFromMatrix, keyFromVec } from './geometry.js';

// Generate group elements up to a given word length
export function generateGroupElements(gens, wordLength) {
  // Return [{ m: Matrix2, word: string }], excluding identity
  const elements = new Map();

  // Identity
  const I = new Matrix2(
    new Complex(1, 0), new Complex(0, 0),
    new Complex(0, 0), new Complex(1, 0)
  );
  const identityKey = keyFromMatrix(I);
  elements.set(identityKey, { m: I, word: 'e' });

  // Initial set: g_i and g_i^{-1}
  const initialSet = [];
  gens.forEach((g, i) => {
    const name = `g${i + 1}`;
    initialSet.push({ m: g, word: name });
    const inv = g && g.inverse ? g.inverse() : null;
    if (inv) initialSet.push({ m: inv, word: `${name}^{-1}` });
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
          const newObj = { m: newM, word: wobj.word + s.word };
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

// Image of the basepoint o=(0,0,1) under m in PSL(2,C)
// For m = [a b; c d], we have: m·o = ( (a\bar c + b\bar d) / (|c|^2 + |d|^2),  1 / (|c|^2 + |d|^2) )
// We map (u, t) to THREE as (x, y, z) = (Re(u), Im(u), t).
export function imageOfBasepoint(m) {
  const cAbs2 = m.c.normSq();
  const dAbs2 = m.d.normSq();
  const denom = cAbs2 + dAbs2; // real scalar > 0
  if (denom === 0) return { u: new Complex(0, 0), t: Infinity };
  const a_conj_c = m.a.mul(m.c.conjugate());
  const b_conj_d = m.b.mul(m.d.conjugate());
  const u = a_conj_c.add(b_conj_d);
  // divide complex by real scalar
  const invDen = 1.0 / denom;
  const uScaled = new Complex(u.re * invDen, u.im * invDen);
  const t = invDen;
  return { u: uScaled, t: t };
}

// Compute orbit points from group elements
export function computeOrbitPoints(groupElements) {
  const pts = [];
  const arr = Array.isArray(groupElements) ? groupElements : [];
  for (const item of arr) {
    const g = (item && item.m) ? item.m : item; // accept Matrix2 or {m,word}
    if (!g) continue;
    const p = imageOfBasepoint(g);
    if (!isFinite(p.t) || p.t <= 0) continue;
    if (Math.abs(p.u.re) < 1e-12 && Math.abs(p.u.im) < 1e-12 && Math.abs(p.t - 1) < 1e-12) continue;
    pts.push(new THREE.Vector3(p.u.re, p.u.im, p.t));
  }
  return pts;
}

// Hyperbolic distance in upper half-space H^3 with height = z > 0
export function hDist(p, q) {
  const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
  const num = dx * dx + dy * dy + dz * dz;
  const den = 2 * p.z * q.z;
  const c = 1 + num / den;
  return Math.acosh(Math.max(1, c));
}

// Sample points on a bisector (for Delaunay computation)
export function samplePointsOnBisector(u, t, maxSamples = 160) {
  // (x, y, z) = (Re u, Im u, t). Boundary is z=0. Basepoint o=(0,0,1).
  const pts = [];
  const eps = 1e-9;

  // If t ≈ 1, the bisector between o and p is a vertical plane in z, with normal in the xy-plane
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

  // Hemisphere case (center on z=0, orthogonal to boundary)
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

// Compute Delaunay neighbors (standard generators) from group elements
export function computeDelaunayNeighbors(groupElements, basepoint) {
  const orbit = [basepoint];
  const imgs = [];

  // groupElements may be Matrix2 or {m, word}
  for (const item of groupElements) {
    const g = (item && item.m) ? item.m : item;
    const w = (item && item.word) ? item.word : undefined;
    const p = imageOfBasepoint(g);
    if (!isFinite(p.t) || p.t <= 0) continue;
    const v = new THREE.Vector3(p.u.re, p.u.im, p.t);
    orbit.push(v);
    imgs.push({ u: p.u, t: p.t, v, g, word: w });
  }

  const neighborsMap = new Map();
  for (const item of imgs) {
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
        neighborsMap.set(key, { v: item.v, g: item.g, word: item.word });
      }
    }
  }
  return Array.from(neighborsMap.values());
}

// Symmetrize group elements (deduplicate)
export function symmetrizeGroupElements(elements) {
  const symElements = new Map();
  elements.forEach(m => {
    const key = keyFromMatrix(m);
    if (!symElements.has(key)) {
      symElements.set(key, m);
    }
  });
  return Array.from(symElements.values());
}
