// polytope.js — the Coxeter polytope P of a Vinberg chamber: Coxeter
// diagram, vertices, faces, symmetries, volume, and a Klein-model frame for
// pictures.
//
// Combinatorics come from the Gram matrix alone (Vinberg's theorem for
// acute-angled polytopes: a set S of walls meets in a face of codimension |S|
// iff its Gram matrix is positive definite), cross-checked against the
// extreme rays found by the algorithm.

import { bil, adjugateB, matMulB, big } from './linalg.js';

/** Coxeter label of a pair of roots from the integer ratio 4B²/(k_i k_j). */
export function coxeterLabel(A, e, f) {
    const b = bil(A, e, f), ke = bil(A, e, e), kf = bil(A, f, f);
    const r = (4 * b * b) / (ke * kf);
    if (b > 0) return { m: 0, r };                     // obtuse — never happens for walls
    if (r === 0) return { m: 2, r };
    if (r === 1) return { m: 3, r };
    if (r === 2) return { m: 4, r };
    if (r === 3) return { m: 6, r };
    if (r === 4) return { m: Infinity, r };            // parallel: meet at an ideal point
    return { m: -1, r, cosh: Math.sqrt(r) / 2 };       // ultraparallel
}

/** Order of the finite reflection group ⟨s_e : e ∈ S⟩ = size of the orbit of an interior integer point. */
export function parabolicOrder(A, roots, S, pInt, cap = 200000) {
    const refl = S.map(j => {
        const e = roots[j];
        const Ae = A.map(r => r.reduce((s, x, t) => s + x * e[t], 0));
        const k = e.reduce((s, x, i) => s + x * Ae[i], 0);
        return { e, Ae, k };
    });
    const seen = new Set([pInt.join(',')]);
    const queue = [pInt];
    while (queue.length) {
        const x = queue.pop();
        for (const { e, Ae, k } of refl) {
            const c = (2 * Ae.reduce((s, a, i) => s + a * x[i], 0)) / k;
            if (c === 0) continue;
            const y = x.map((t, i) => t - c * e[i]);
            const key = y.join(',');
            if (!seen.has(key)) {
                seen.add(key); queue.push(y);
                if (seen.size > cap) return Infinity;
            }
        }
    }
    return seen.size;
}

/** Diagram automorphisms of P realised by lattice automorphisms (integral, preserving A). */
export function symmetries(A, roots) {
    const k = roots.length, m = A.length;
    const G = roots.map(a => roots.map(b => bil(A, a, b)));
    // a basis among the walls
    const basis = [];
    {
        const rows = [];
        for (let j = 0; j < k && basis.length < m; j++) {
            const cand = [...rows, roots[j].map(big)];
            if (rankOf(cand) === cand.length) { rows.push(roots[j].map(big)); basis.push(j); }
        }
    }
    const E = transposeB(basis.map(j => roots[j].map(big)));   // columns = basis roots
    const { adj, det } = adjugateB(E);
    const out = [];
    const perm = new Array(k).fill(-1), used = new Array(k).fill(false);
    const rec = i => {
        if (i === k) {
            const Ep = transposeB(basis.map(j => roots[perm[j]].map(big)));
            const num = matMulB(Ep, adj);
            if (num.some(r => r.some(x => x % det !== 0n))) return;
            const mat = num.map(r => r.map(x => Number(x / det)));
            // verify on every wall
            for (let j = 0; j < k; j++) {
                const img = mat.map(r => r.reduce((s, x, t) => s + x * roots[j][t], 0));
                if (img.join(',') !== roots[perm[j]].join(',')) return;
            }
            out.push({ perm: perm.slice(), mat });
            return;
        }
        for (let c = 0; c < k; c++) {
            if (used[c] || G[c][c] !== G[i][i]) continue;
            let ok = true;
            for (let j = 0; j < i; j++) if (G[c][perm[j]] !== G[i][j]) { ok = false; break; }
            if (!ok) continue;
            perm[i] = c; used[c] = true;
            rec(i + 1);
            used[c] = false; perm[i] = -1;
        }
    };
    rec(0);
    return out;
}

function transposeB(M) { return M[0].map((_, j) => M.map(r => r[j])); }
function rankOf(rows) {
    const M = rows.map(r => r.slice());
    let rank = 0;
    for (let c = 0; c < (M[0] || []).length && rank < M.length; c++) {
        let p = rank;
        while (p < M.length && M[p][c] === 0n) p++;
        if (p === M.length) continue;
        [M[rank], M[p]] = [M[p], M[rank]];
        for (let i = rank + 1; i < M.length; i++) {
            if (M[i][c] === 0n) continue;
            const a = M[i][c], b = M[rank][c];
            M[i] = M[i].map((x, j) => x * b - a * M[rank][j]);
        }
        rank++;
    }
    return rank;
}

/** Cholesky test for positive definiteness of a small real symmetric matrix. */
function posDef(M) {
    const n = M.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let s = M[i][j];
            for (let t = 0; t < j; t++) s -= L[i][t] * L[j][t];
            if (i === j) { if (s <= 1e-10) return false; L[i][i] = Math.sqrt(s); }
            else L[i][j] = s / L[j][j];
        }
    }
    return true;
}

/**
 * Assemble everything about P.
 * @param A     integer Gram
 * @param roots walls (Number vectors)
 * @param rays  extreme rays from vinberg() (BigInt)
 */
export function buildPolytope(A, roots, rays) {
    const m = A.length, n = m - 1, k = roots.length;
    const norms = roots.map(e => bil(A, e, e));
    const gram = roots.map(a => roots.map(b => bil(A, a, b)));
    const cos = gram.map((r, i) => r.map((x, j) => x / Math.sqrt(norms[i] * norms[j])));
    const label = roots.map((a, i) => roots.map((b, j) => (i === j ? null : coxeterLabel(A, a, b))));
    const coxM = label.map((r, i) => r.map(l => (l ? l.m : 1)));

    // vertices
    const vertices = rays.map(({ r, walls }) => {
        const g = r.reduce((a, t) => { let x = t < 0n ? -t : t; while (x) [a, x] = [x, a % x]; return a; }, 0n) || 1n;
        const rr = r.map(t => t / g);
        const safe = rr.every(t => t <= BigInt(Number.MAX_SAFE_INTEGER) && t >= -BigInt(Number.MAX_SAFE_INTEGER));
        const v = rr.map(Number);
        const fr = bil(A, v, v);
        return { r: v, rBig: rr, walls, ideal: fr === 0, f: fr, safe };
    });
    // interior integer point: the sum of the primitive vertex vectors
    let pIntB = new Array(m).fill(0n);
    for (const v of vertices) pIntB = pIntB.map((x, i) => x + v.rBig[i]);
    const gP = pIntB.reduce((a, t) => { let x = t < 0n ? -t : t; while (x) [a, x] = [x, a % x]; return a; }, 0n) || 1n;
    const pInt = pIntB.map(t => Number(t / gP));

    // elliptic subsets (faces) up to size n, with their finite Coxeter group orders
    const faces = [];          // { S, order }
    const pushFaces = (start, S) => {
        if (S.length) {
            const sub = S.map(i => S.map(j => cos[i][j]));
            if (!posDef(sub)) return;
            faces.push({ S: S.slice(), order: parabolicOrder(A, roots, S, pInt) });
        }
        if (S.length === n) return;
        for (let i = start; i < k; i++) { S.push(i); pushFaces(i + 1, S); S.pop(); }
    };
    pushFaces(0, []);

    // orbifold Euler characteristic Σ_S (−1)^{n−|S|}/|W_S| (S = ∅ included)
    let chi = (n % 2 ? -1 : 1);
    for (const F of faces) chi += ((n - F.S.length) % 2 ? -1 : 1) / F.order;

    // finite vertices ↔ elliptic subsets of size n; cross-check with the rays
    const finiteV = vertices.filter(v => !v.ideal);
    const ellN = faces.filter(F => F.S.length === n);
    const consistent = finiteV.length === ellN.length &&
        finiteV.every(v => v.walls.length === n);

    const frame = kleinFrame(A, pInt);
    for (const v of vertices) v.klein = toKlein(frame, A, v.r);

    const P = { A, m, n, k, roots, norms, gram, cos, label, coxM, vertices, pInt, faces, chi, frame, consistent };

    // codim-2 faces: pairs with |cos| < 1 (finite Coxeter label)
    P.ridges = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
        const mm = coxM[i][j];
        if (mm >= 2 && mm !== Infinity) P.ridges.push([i, j, mm]);
    }
    P.volume = volumeOf(P);
    return P;
}

// ---------------- Klein model frame ----------------

/**
 * An A-orthonormal frame (u₀ timelike at the interior point, u₁…u_n
 * spacelike), as real vectors. Klein coordinates of a point x are
 * k_i = B(x, u_i) / (−B(x, u₀)).
 */
export function kleinFrame(A, pInt) {
    const m = A.length;
    const B = (u, v) => bil(A, u, v);
    const f0 = B(pInt, pInt);
    const u0 = pInt.map(x => x / Math.sqrt(-f0));
    const us = [u0];
    for (let i = 0; i < m && us.length < m; i++) {
        let w = Array.from({ length: m }, (_, j) => (i === j ? 1 : 0));
        for (const u of us) {
            const fu = B(u, u);
            const c = B(w, u) / fu;
            w = w.map((x, t) => x - c * u[t]);
        }
        const fw = B(w, w);
        if (fw > 1e-9) us.push(w.map(x => x / Math.sqrt(fw)));
    }
    if (us.length < m) throw new Error('frame construction failed');
    return us;
}

export function toKlein(frame, A, x) {
    const d = -bil(A, x, frame[0]);
    return frame.slice(1).map(u => bil(A, x, u) / d);
}

// ---------------- volume ----------------

function volumeOf(P) {
    const n = P.n;
    if (n % 2 === 0) {
        // Gauss–Bonnet: vol = (−1)^{n/2} · vol(Sⁿ)/2 · χ
        const halfSphere = { 2: 2 * Math.PI, 4: 4 * Math.PI ** 2 / 3, 6: 8 * Math.PI ** 3 / 15 }[n];
        return halfSphere ? ((n / 2) % 2 ? -1 : 1) * halfSphere * P.chi : NaN;
    }
    if (n === 3) return volume3(P);
    return NaN;
}

/** Faces of a 3-polytope as cyclically ordered vertex lists, with areas (Gauss–Bonnet). */
export function faceData3(P) {
    const out = [];
    for (let j = 0; j < P.k; j++) {
        const vs = P.vertices.map((v, i) => ({ v, i })).filter(({ v }) => v.walls.includes(j));
        // order around the centroid in the face plane
        const pts = vs.map(({ v }) => v.klein);
        const c = pts.reduce((a, p) => a.map((x, t) => x + p[t] / pts.length), [0, 0, 0]);
        const e = P.roots[j];
        const nrm = P.frame.slice(1).map(u => bil(P.A, u, e));
        const ax = orthoBasis(nrm);
        vs.forEach((o, t) => {
            const d = pts[t].map((x, s) => x - c[s]);
            o.ang = Math.atan2(dot3(d, ax[1]), dot3(d, ax[0]));
        });
        vs.sort((a, b) => a.ang - b.ang);
        // interior angles at finite vertices from the link triangle (spherical law of cosines)
        let area = (vs.length - 2) * Math.PI;
        for (const { v } of vs) {
            if (v.ideal) continue;
            const [l, mm] = v.walls.filter(w => w !== j);
            const a = Math.PI / P.coxM[l][mm], b = Math.PI / P.coxM[j][l], cc = Math.PI / P.coxM[j][mm];
            const th = Math.acos(Math.max(-1, Math.min(1, (Math.cos(a) + Math.cos(b) * Math.cos(cc)) / (Math.sin(b) * Math.sin(cc)))));
            area -= th;
        }
        out.push({ wall: j, verts: vs.map(o => o.i), area });
    }
    return out;
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function orthoBasis(nrm) {
    const L = Math.hypot(...nrm), z = nrm.map(x => x / L);
    const t = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let x = [t[1] * z[2] - t[2] * z[1], t[2] * z[0] - t[0] * z[2], t[0] * z[1] - t[1] * z[0]];
    const lx = Math.hypot(...x); x = x.map(s => s / lx);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x, y];
}

function gaussLegendre(n) {
    const x = [], w = [];
    for (let i = 1; i <= n; i++) {
        let z = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), pp = 0;
        for (let it = 0; it < 100; it++) {
            let p1 = 1, p2 = 0;
            for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
            pp = n * (z * p1 - p2) / (z * z - 1);
            const z1 = z; z = z1 - p1 / pp;
            if (Math.abs(z - z1) < 1e-15) break;
        }
        x.push(0.5 * (1 - z)); w.push(1 / ((1 - z * z) * pp * pp));
    }
    return { x, w };
}
const GL = gaussLegendre(64);
const radial = rho => rho / (2 * (1 - rho * rho)) - 0.5 * Math.atanh(rho);

/** Volume of the cone from the Klein origin over the flat triangle (S, A, B); S may be ideal. */
function coneOverTriangle(S, A, B, h) {
    const SA = A.map((x, i) => x - S[i]), SB = B.map((x, i) => x - S[i]);
    const cr = [SA[1] * SB[2] - SA[2] * SB[1], SA[2] * SB[0] - SA[0] * SB[2], SA[0] * SB[1] - SA[1] * SB[0]];
    const jac = Math.hypot(...cr);
    if (jac < 1e-300) return 0;
    // Duffy map toward S, then s = u³ to flatten the logarithmic singularity at an ideal corner
    let sum = 0;
    for (let a = 0; a < GL.x.length; a++) {
        const u = GL.x[a], s = u * u * u, ds = 3 * u * u;
        for (let b = 0; b < GL.x.length; b++) {
            const t = GL.x[b];
            const x = S.map((v, i) => v + SA[i] * s * (1 - t) + SB[i] * s * t);
            const r = Math.min(Math.hypot(...x), 1 - 1e-16);
            sum += GL.w[a] * GL.w[b] * ds * s * radial(r) * h / (r * r * r);
        }
    }
    return sum * jac;
}

/** Hyperbolic volume of a finite-volume 3-polytope containing the Klein origin. */
function volume3(P) {
    const fd = faceData3(P);
    P.faceData = fd;
    let vol = 0;
    for (const F of fd) {
        const e = P.roots[F.wall];
        const nrm = P.frame.slice(1).map(u => bil(P.A, u, e));
        const c = -bil(P.A, P.frame[0], e);                 // plane n·k = c, origin side c > 0
        const h = c / Math.hypot(...nrm);
        if (h <= 1e-12) continue;
        const V = F.verts.map(i => P.vertices[i]);
        const pts = V.map(v => v.klein);
        const g = pts.reduce((a, p) => a.map((x, t) => x + p[t] / pts.length), [0, 0, 0]);
        for (let t = 0; t < V.length; t++) {
            const a = V[t], b = V[(t + 1) % V.length];
            if (a.ideal && b.ideal) {
                const M = a.klein.map((x, s) => (x + b.klein[s]) / 2);
                vol += coneOverTriangle(a.klein, M, g, h) + coneOverTriangle(b.klein, g, M, h);
            } else if (a.ideal) vol += coneOverTriangle(a.klein, b.klein, g, h);
            else if (b.ideal) vol += coneOverTriangle(b.klein, g, a.klein, h);
            else vol += coneOverTriangle(g, a.klein, b.klein, h);
        }
    }
    return vol;
}
