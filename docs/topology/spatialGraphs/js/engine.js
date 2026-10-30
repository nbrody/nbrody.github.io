// engine.js — the "niceness" energy of a spatial graph and the flow that lowers it.
//
// E = E_tp + E_bend + E_junction + E_equal (+ two bookkeeping terms), at fixed total length.
//
//   E_tp        tangent-point energy (Buck–Orloff; Yu–Schumacher–Crane's "repulsive
//               curves"), summed over pairs of segments that share no bead:
//                   Σ ℓ_I ℓ_J ( |T_I × e|^α + |T_J × e|^α ) / |e|^β,   e = m_I − m_J.
//               It blows up as two strands approach, but not along a smooth strand
//               (T × e = 0 there), so no cut-off is needed. (α, β) = (2, 4) is
//               scale-invariant; larger β − α makes it shorter-ranged ("tighter").
//   E_bend      discrete ∫ κ² ds along each edge (never across a vertex).
//   E_junction  at each vertex, the Thomson energy Σ 1/|u_k − u_l| of the unit
//               directions in which its edges leave: 120° in a plane for degree 3,
//               tetrahedral for degree 4 — Plateau's rule for soap-film junctions.
//   E_equal     Σ_e (L_e / L̄_o − 1)² over each orbit o of edges under the graph's
//               automorphisms: edges a symmetry could swap get equal length. Without
//               it the θ-curve's minimizer is a flat circle with a diameter; with it,
//               three meridians of a sphere (D₃ₕ).
//   bookkeeping an even-spacing term along each edge, and a contact barrier on the
//               true segment–segment distance (the midpoint quadrature of E_tp cannot
//               see two segments meeting near their ends).
//
// The flow is gradient descent in a Sobolev metric diag(m) + c·L + c₂·L² over the
// bead graph (L its Laplacian; solved exactly by an envelope Cholesky), with
// heavy-ball momentum, backtracking, and the total length held fixed by projection.
// Every step is *isotopy-guarded*: no bead moves by more than 0.45 × the current
// clearance (the least distance between two segments that share no bead). Two such
// segments then stay disjoint for the whole straight-line motion, so the spatial
// graph's isotopy type never changes.

import { KIND_BEAD, segSegDist, segSegClosest } from './model.js';
import { edgeOrbits } from './symmetry.js';

export const DEFAULT_PARAMS = {
    range: 0.25,      // 0: (α,β) = (2,4) conformal … 1: (4,7.2) short-ranged
    bend: 0.2,        // weight of ∫κ² ds (× mean edge length)
    junction: 0.25,   // weight of the vertex Thomson energy
    equal: 8,         // weight of equal lengths within each orbit of edges under Aut(G)
    spacing: 0.15,    // keeps beads evenly spaced along each edge
    sobolev: 25,      // H¹ smoothing width of the preconditioner (in beads²)
    stiff: 1,         // H² term of the preconditioner, matched to bending + junctions
    momentum: 0.8,    // heavy-ball momentum, reset whenever a step fails
    totalBeads: 0,    // set from the graph
};

export function tpExponents(range) {
    return { alpha: 2 + 2 * range, beta: 4 + 3.2 * range };
}

const GUARD = 0.45;   // fraction of the clearance a bead may move in one step

export class Relaxer {
    constructor(graph, params = {}) {
        this.params = { ...DEFAULT_PARAMS, ...params };
        this.setGraph(graph);
    }

    setGraph(graph) {
        this.g = graph;
        // a canonical size, so that energies are comparable from graph to graph
        this.L0 = this.params.L0 || 6 * Math.sqrt(graph.edges.length);
        this.m = graph.edges.length;
        this.params.totalBeads = graph.N;
        this.orbit = edgeOrbits(graph);
        this.nOrbits = Math.max(...this.orbit) + 1;
        this.mode = 'relax';
        this.tau = 0;
        this.grabbed = null;
        this.it = 0;
        this.accepted = 0;
        this.rejectRun = 0;
        this.settled = false;
        this.history = [];
        this.relaxAfterGrab = 0;
        this.invalidate();
        this.normalize(this.g.x, 1);
    }

    setParams(p) {
        Object.assign(this.params, p);
        this.settled = false;
        this.history = [];
        this.invalidate();
    }

    invalidate() {
        this.cache = null;
        this.grabField = null;
        const N = this.g.N;
        this.grad = new Float64Array(3 * N);
        this.trialGrad = new Float64Array(3 * N);
        this.trial = new Float64Array(3 * N);
        this.D = new Float64Array(3 * N);
        this.v = new Float64Array(3 * N);
        this.w = new Float64Array(N);
        this.zG = null;
        this.Dprev = null;
        this.chol = null;
        this.cholKey = null;
        this.cg = { r: new Float64Array(3 * N), p: new Float64Array(3 * N), Ap: new Float64Array(3 * N), z: new Float64Array(3 * N), Lx: new Float64Array(3 * N) };
    }

    /** Reference bead spacing: fixed by the total length and the bead budget, not the current count. */
    get meanSeg() { return this.L0 / Math.max(1, this.params.totalBeads); }

    // ------------------------------------------------------------ energy

    /** E at positions x; adds ∂E/∂x into grad (zeroed first). */
    energy(x, grad) {
        const g = this.g, P = this.params;
        grad.fill(0);
        const { alpha, beta } = tpExponents(P.range);
        const S = g.S, segA = g.segA, segB = g.segB;

        // per-segment midpoint, tangent, length
        const mx = this._seg || (this._seg = {});
        if (!mx.len || mx.len.length !== S) {
            mx.len = new Float64Array(S); mx.m = new Float64Array(3 * S); mx.t = new Float64Array(3 * S);
        }
        const len = mx.len, M = mx.m, T = mx.t;
        for (let s = 0; s < S; s++) {
            const a = 3 * segA[s], b = 3 * segB[s];
            const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
            const l = Math.hypot(dx, dy, dz) || 1e-12;
            len[s] = l;
            M[3 * s] = 0.5 * (x[a] + x[b]); M[3 * s + 1] = 0.5 * (x[a + 1] + x[b + 1]); M[3 * s + 2] = 0.5 * (x[a + 2] + x[b + 2]);
            T[3 * s] = dx / l; T[3 * s + 1] = dy / l; T[3 * s + 2] = dz / l;
        }

        // ---- tangent-point repulsion
        let Etp = 0;
        const half = alpha / 2, hb = -beta / 2;
        const alphaIs2 = alpha === 2;
        for (let I = 0; I < S; I++) {
            const a = segA[I], b = segB[I];
            const lI = len[I];
            const mIx = M[3 * I], mIy = M[3 * I + 1], mIz = M[3 * I + 2];
            const tIx = T[3 * I], tIy = T[3 * I + 1], tIz = T[3 * I + 2];
            let gax = 0, gay = 0, gaz = 0, gbx = 0, gby = 0, gbz = 0;
            for (let J = I + 1; J < S; J++) {
                const c = segA[J], d = segB[J];
                if (c === a || c === b || d === a || d === b) continue;
                const ex = mIx - M[3 * J], ey = mIy - M[3 * J + 1], ez = mIz - M[3 * J + 2];
                const r2 = ex * ex + ey * ey + ez * ez;
                const tJx = T[3 * J], tJy = T[3 * J + 1], tJz = T[3 * J + 2];
                const u = tIx * ex + tIy * ey + tIz * ez;
                const w = tJx * ex + tJy * ey + tJz * ez;
                let qI = r2 - u * u; if (qI < 0) qI = 0;
                let qJ = r2 - w * w; if (qJ < 0) qJ = 0;
                const rb = Math.pow(r2, hb);
                let pI, pJ, dI, dJ;           // q^{α/2}, (α/2) q^{α/2−1}
                if (alphaIs2) { pI = qI; pJ = qJ; dI = 1; dJ = 1; }
                else {
                    pI = Math.pow(qI, half); pJ = Math.pow(qJ, half);
                    dI = qI > 0 ? half * pI / qI : 0; dJ = qJ > 0 ? half * pJ / qJ : 0;
                }
                const kI = pI * rb, kJ = pJ * rb;
                const B = kI + kJ;
                const lJ = len[J];
                const A = lI * lJ;
                Etp += A * B;
                // ∂B/∂e
                const br = beta * B / r2;
                const cI = 2 * dI * rb, cJ = 2 * dJ * rb;
                const gex = A * ((cI + cJ) * ex - cI * u * tIx - cJ * w * tJx - br * ex);
                const gey = A * ((cI + cJ) * ey - cI * u * tIy - cJ * w * tJy - br * ey);
                const gez = A * ((cI + cJ) * ez - cI * u * tIz - cJ * w * tJz - br * ez);
                // ∂/∂T terms, projected: A c (e − (T·e) T) / ℓ, with c = −2 d (T·e) rb
                const sI = A * (-cI * u) / lI, sJ = A * (-cJ * w) / lJ;
                const pIx = sI * (ex - u * tIx), pIy = sI * (ey - u * tIy), pIz = sI * (ez - u * tIz);
                const pJx = sJ * (ex - w * tJx), pJy = sJ * (ey - w * tJy), pJz = sJ * (ez - w * tJz);
                // ∂/∂ℓ terms
                const LI = lJ * B, LJ = lI * B;
                gax += 0.5 * gex - LI * tIx - pIx; gay += 0.5 * gey - LI * tIy - pIy; gaz += 0.5 * gez - LI * tIz - pIz;
                gbx += 0.5 * gex + LI * tIx + pIx; gby += 0.5 * gey + LI * tIy + pIy; gbz += 0.5 * gez + LI * tIz + pIz;
                const c3 = 3 * c, d3 = 3 * d;
                grad[c3] += -0.5 * gex - LJ * tJx - pJx; grad[c3 + 1] += -0.5 * gey - LJ * tJy - pJy; grad[c3 + 2] += -0.5 * gez - LJ * tJz - pJz;
                grad[d3] += -0.5 * gex + LJ * tJx + pJx; grad[d3 + 1] += -0.5 * gey + LJ * tJy + pJy; grad[d3 + 2] += -0.5 * gez + LJ * tJz + pJz;
            }
            grad[3 * a] += gax; grad[3 * a + 1] += gay; grad[3 * a + 2] += gaz;
            grad[3 * b] += gbx; grad[3 * b + 1] += gby; grad[3 * b + 2] += gbz;
        }

        const Lbar = this.L0 / Math.max(1, this.m);

        // ---- bending: 2 (1 − cos φ) / ℓ̄ ≈ κ² ds at every interior bead (and circle bases),
        // ℓ̄ the mean of the two segments — neutral to how beads are spread along the edge
        let Eb = 0;
        if (P.bend > 0) {
            const W = 2 * P.bend * Lbar;
            const tr = g.triples;
            for (let k = 0; k < tr.length; k += 3) {
                const a = 3 * tr[k], i = 3 * tr[k + 1], b = 3 * tr[k + 2];
                const d1x = x[i] - x[a], d1y = x[i + 1] - x[a + 1], d1z = x[i + 2] - x[a + 2];
                const d2x = x[b] - x[i], d2y = x[b + 1] - x[i + 1], d2z = x[b + 2] - x[i + 2];
                const l1 = Math.hypot(d1x, d1y, d1z) || 1e-12, l2 = Math.hypot(d2x, d2y, d2z) || 1e-12;
                const ux = d1x / l1, uy = d1y / l1, uz = d1z / l1, vx = d2x / l2, vy = d2y / l2, vz = d2z / l2;
                const cs = ux * vx + uy * vy + uz * vz;
                const lb = 0.5 * (l1 + l2);
                const E = W * (1 - cs) / lb;
                Eb += E;
                const f = -W / lb, h = -0.5 * E / lb;
                const g1x = f * (vx - cs * ux) / l1 + h * ux, g1y = f * (vy - cs * uy) / l1 + h * uy, g1z = f * (vz - cs * uz) / l1 + h * uz;
                const g2x = f * (ux - cs * vx) / l2 + h * vx, g2y = f * (uy - cs * vy) / l2 + h * vy, g2z = f * (uz - cs * vz) / l2 + h * vz;
                grad[a] -= g1x; grad[a + 1] -= g1y; grad[a + 2] -= g1z;
                grad[i] += g1x - g2x; grad[i + 1] += g1y - g2y; grad[i + 2] += g1z - g2z;
                grad[b] += g2x; grad[b + 1] += g2y; grad[b + 2] += g2z;
            }
        }

        // ---- junctions: Thomson energy of the outgoing directions
        let Ej = 0;
        if (P.junction > 0) {
            const W = P.junction * Lbar / this.meanSeg;
            for (let v = 0; v < g.vertexNodes.length; v++) {
                const star = g.stars[v];
                const dg = star.length;
                if (dg < 2) continue;
                const o = 3 * g.vertexNodes[v];
                const U = [], Ls = [];
                for (const n of star) {
                    const q = 3 * n;
                    const dx = x[q] - x[o], dy = x[q + 1] - x[o + 1], dz = x[q + 2] - x[o + 2];
                    const l = Math.hypot(dx, dy, dz) || 1e-12;
                    U.push([dx / l, dy / l, dz / l]); Ls.push(l);
                }
                let Sm = 0;
                const dS = U.map(() => [0, 0, 0]);
                for (let k = 0; k < dg; k++) for (let l = k + 1; l < dg; l++) {
                    const ex = U[k][0] - U[l][0], ey = U[k][1] - U[l][1], ez = U[k][2] - U[l][2];
                    const r = Math.hypot(ex, ey, ez) || 1e-9;
                    Sm += 1 / r;
                    const c3 = 1 / (r * r * r);
                    dS[k][0] -= ex * c3; dS[k][1] -= ey * c3; dS[k][2] -= ez * c3;
                    dS[l][0] += ex * c3; dS[l][1] += ey * c3; dS[l][2] += ez * c3;
                }
                Ej += W * Sm;
                for (let k = 0; k < dg; k++) {
                    const u = U[k], s = dS[k];
                    const us = u[0] * s[0] + u[1] * s[1] + u[2] * s[2];
                    const f = W / Ls[k];
                    const gx = f * (s[0] - us * u[0]);
                    const gy = f * (s[1] - us * u[1]);
                    const gz = f * (s[2] - us * u[2]);
                    const q = 3 * star[k];
                    grad[q] += gx; grad[q + 1] += gy; grad[q + 2] += gz;
                    grad[o] -= gx; grad[o + 1] -= gy; grad[o + 2] -= gz;
                }
            }
        }

        // ---- equal lengths for edges that a symmetry of the graph interchanges:
        // Σ_e (L_e / L̄_o(e) − 1)², L̄_o the mean over e's orbit
        let Ee = 0;
        if (P.equal > 0 && this.m > 1) {
            const m = this.m, O = this.nOrbits, orb = this.orbit;
            const Le = new Float64Array(m), Lo = new Float64Array(O), no = new Float64Array(O);
            for (let s = 0; s < S; s++) Le[g.segE[s]] += len[s];
            for (let e = 0; e < m; e++) { Lo[orb[e]] += Le[e]; no[orb[e]]++; }
            for (let o = 0; o < O; o++) Lo[o] /= no[o];
            const ce = new Float64Array(m), Co = new Float64Array(O);
            for (let e = 0; e < m; e++) {
                const o = orb[e], r = Le[e] / Lo[o] - 1;
                Ee += P.equal * r * r;
                ce[e] = 2 * P.equal * r / Lo[o];
                Co[o] -= 2 * P.equal * r * Le[e] / (Lo[o] * Lo[o] * no[o]);
            }
            for (let s = 0; s < S; s++) {
                const e = g.segE[s];
                const k = ce[e] + Co[orb[e]];
                const a = 3 * segA[s], b = 3 * segB[s];
                const tx = k * T[3 * s], ty = k * T[3 * s + 1], tz = k * T[3 * s + 2];
                grad[b] += tx; grad[b + 1] += ty; grad[b + 2] += tz;
                grad[a] -= tx; grad[a + 1] -= ty; grad[a + 2] -= tz;
            }
        }

        // ---- contact barrier on the true distance between segments that share no bead:
        // b(d) = −(d − d̂)² log(d / d̂) for d < d̂ (as in incremental potential contact).
        // The quadratures above only see midpoints, so two segments could otherwise
        // be squeezed together near their ends at no cost.
        let Ebar = 0;
        {
            const dh = 0.5 * this.meanSeg, kb = (P.barrier ?? 20) / (dh * dh);
            const pairs = this.nearPairs(x, dh);
            for (let q = 0; q < pairs.length; q += 2) {
                const I = pairs[q], J = pairs[q + 1];
                const a = segA[I], b = segB[I], c = segA[J], d = segB[J];
                const [dist, s1, t1, px, py, pz] = segSegClosest(x, a, b, c, d);
                if (dist >= dh) continue;
                const dd = Math.max(dist, 1e-12), r = dd - dh, lg = Math.log(dd / dh);
                Ebar += -kb * r * r * lg;
                const db = kb * (-2 * r * lg - r * r / dd);          // ∂b/∂d
                const nx = px / dd, ny = py / dd, nz = pz / dd;
                const A3 = 3 * a, B3 = 3 * b, C3 = 3 * c, D3 = 3 * d;
                grad[A3] += db * (1 - s1) * nx; grad[A3 + 1] += db * (1 - s1) * ny; grad[A3 + 2] += db * (1 - s1) * nz;
                grad[B3] += db * s1 * nx; grad[B3 + 1] += db * s1 * ny; grad[B3 + 2] += db * s1 * nz;
                grad[C3] -= db * (1 - t1) * nx; grad[C3 + 1] -= db * (1 - t1) * ny; grad[C3 + 2] -= db * (1 - t1) * nz;
                grad[D3] -= db * t1 * nx; grad[D3 + 1] -= db * t1 * ny; grad[D3 + 2] -= db * t1 * nz;
            }
        }

        // ---- even spacing along each edge: Σ (ℓ/ℓ̄_e − 1)², a bookkeeping term that
        // keeps the discretization honest (it has no say in the shape)
        let Es = 0;
        const ks = P.spacing ?? 0.05;
        if (ks > 0) {
            const m = this.m;
            const Le = this._Le && this._Le.length === m ? this._Le : (this._Le = new Float64Array(m));
            const L2 = this._L2 && this._L2.length === m ? this._L2 : (this._L2 = new Float64Array(m));
            const ne = this._ne && this._ne.length === m ? this._ne : (this._ne = new Float64Array(m));
            Le.fill(0); L2.fill(0); ne.fill(0);
            for (let s = 0; s < S; s++) { const e = g.segE[s]; Le[e] += len[s]; L2[e] += len[s] * len[s]; ne[e]++; }
            for (let e = 0; e < m; e++) Es += ks * (ne[e] * ne[e] * L2[e] / (Le[e] * Le[e]) - ne[e]);
            for (let s = 0; s < S; s++) {
                const e = g.segE[s];
                const k = 2 * ks * ne[e] * ne[e] / (Le[e] * Le[e]) * (len[s] - L2[e] / Le[e]);
                const a = 3 * segA[s], b = 3 * segB[s];
                const tx = k * T[3 * s], ty = k * T[3 * s + 1], tz = k * T[3 * s + 2];
                grad[b] += tx; grad[b + 1] += ty; grad[b + 2] += tz;
                grad[a] -= tx; grad[a + 1] -= ty; grad[a + 2] -= tz;
            }
        }

        const parts = { tp: Etp, bend: Eb, junction: Ej, equal: Ee, spacing: Es, contact: Ebar };
        return { E: Etp + Eb + Ej + Ee + Es + Ebar, parts };
    }

    // ------------------------------------------------------------ geometry helpers

    masses(x) {
        const g = this.g, w = this.w;
        w.fill(0);
        for (let s = 0; s < g.S; s++) {
            const l = 0.5 * g.segLength(s, x);
            w[g.segA[s]] += l; w[g.segB[s]] += l;
        }
    }

    /** y = (diag(w) + c·L + c2·L²) x on interleaved 3-vectors */
    applyA(xv, y, c, c2 = this.c2 || 0) {
        const g = this.g, w = this.w, off = g.adjOff, adj = g.adj;
        const lap = (src, dst) => {
            for (let i = 0; i < g.N; i++) {
                const d = off[i + 1] - off[i];
                let sx = d * src[3 * i], sy = d * src[3 * i + 1], sz = d * src[3 * i + 2];
                for (let k = off[i]; k < off[i + 1]; k++) {
                    const j = 3 * adj[k];
                    sx -= src[j]; sy -= src[j + 1]; sz -= src[j + 2];
                }
                dst[3 * i] = sx; dst[3 * i + 1] = sy; dst[3 * i + 2] = sz;
            }
        };
        const Lx = this.cg.Lx;
        lap(xv, Lx);
        if (c2) lap(Lx, y); else y.fill(0);
        for (let i = 0; i < g.N; i++) {
            for (let k = 0; k < 3; k++) {
                const q = 3 * i + k;
                y[q] = w[i] * xv[q] + c * Lx[q] + c2 * y[q];
            }
        }
    }

    /** Solve (diag(w) + c·L + c2·L²) v = F: by the cached factorization, or by CG. */
    solve(F, v, c, c2 = this.c2 || 0) {
        if (this.params.direct !== false) {
            const key = `${c}|${c2}`;
            if (!this.chol || this.chol.g !== this.g || this.chol.N !== this.g.N) this.chol = new Skyline(this.g);
            if (this.cholKey !== key || this.cholAge > 30) {
                this.chol.factor(this.w, c, c2);
                this.cholKey = key;
                this.cholAge = 0;
            }
            this.chol.solve(F, v);
            return;
        }
        return this.solveCG(F, v, c, c2);
    }

    solveCG(F, v, c, c2) {
        const n = F.length, { r, p, Ap, z } = this.cg, w = this.w, g = this.g;
        v.fill(0);
        r.set(F);
        const diag = i => { const d = g.adjOff[i + 1] - g.adjOff[i]; return w[i] + c * d + c2 * (d * d + d); };
        for (let i = 0; i < n; i++) z[i] = r[i] / diag(i / 3 | 0);
        p.set(z);
        let rz = 0, r0 = 0;
        for (let i = 0; i < n; i++) { rz += r[i] * z[i]; r0 += r[i] * r[i]; }
        if (r0 === 0) return;
        for (let it = 0; it < (this.params.cgIters ?? 200); it++) {
            this.applyA(p, Ap, c, c2);
            let pAp = 0;
            for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
            const al = rz / pAp;
            let rr = 0;
            for (let i = 0; i < n; i++) { v[i] += al * p[i]; r[i] -= al * Ap[i]; rr += r[i] * r[i]; }
            if (rr < 1e-10 * r0) break;
            for (let i = 0; i < n; i++) z[i] = r[i] / diag(i / 3 | 0);
            let rz2 = 0;
            for (let i = 0; i < n; i++) rz2 += r[i] * z[i];
            const be = rz2 / rz;
            rz = rz2;
            for (let i = 0; i < n; i++) p[i] = z[i] + be * p[i];
        }
    }

    /**
     * Least distance between two segments that share no bead, or `limit` if
     * every such pair is at least that far apart (grid hash on midpoints).
     */
    clearance(x = this.g.x, limit = Infinity) {
        const g = this.g, S = g.S, A = g.segA, B = g.segB;
        let maxLen = 0;
        for (let s = 0; s < S; s++) maxLen = Math.max(maxLen, g.segLength(s, x));
        let best = limit;
        if (!Number.isFinite(limit) || S < 40) {
            for (let I = 0; I < S; I++) for (let J = I + 1; J < S; J++) {
                const a = A[I], b = B[I], c = A[J], d = B[J];
                if (c === a || c === b || d === a || d === b) continue;
                const dd = segSegDist(x, a, b, c, d);
                if (dd < best) best = dd;
            }
            return best;
        }
        const pairs = this.nearPairs(x, limit);
        for (let q = 0; q < pairs.length; q += 2) {
            const I = pairs[q], J = pairs[q + 1];
            const dd = segSegDist(x, A[I], B[I], A[J], B[J]);
            if (dd < best) best = dd;
        }
        return best;
    }

    /** Pairs of segments, sharing no bead, that may be closer than `limit` (flat [I, J, …]). */
    nearPairs(x, limit) {
        const g = this.g, S = g.S, A = g.segA, B = g.segB;
        let maxLen = 0;
        for (let s = 0; s < S; s++) maxLen = Math.max(maxLen, g.segLength(s, x));
        const cell = maxLen + limit;
        const key = (i, j, k) => ((i + 4096) * 8192 + (j + 4096)) * 8192 + (k + 4096);
        const grid = new Map();
        const cx = new Int32Array(3 * S);
        for (let s = 0; s < S; s++) {
            const a = 3 * A[s], b = 3 * B[s];
            const i = Math.floor(0.5 * (x[a] + x[b]) / cell), j = Math.floor(0.5 * (x[a + 1] + x[b + 1]) / cell), k = Math.floor(0.5 * (x[a + 2] + x[b + 2]) / cell);
            cx[3 * s] = i; cx[3 * s + 1] = j; cx[3 * s + 2] = k;
            const kk = key(i, j, k);
            let list = grid.get(kk);
            if (!list) grid.set(kk, (list = []));
            list.push(s);
        }
        const out = [];
        for (let I = 0; I < S; I++) {
            const a = A[I], b = B[I];
            for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
                const list = grid.get(key(cx[3 * I] + di, cx[3 * I + 1] + dj, cx[3 * I + 2] + dk));
                if (!list) continue;
                for (const J of list) {
                    if (J <= I) continue;
                    const c = A[J], d = B[J];
                    if (c === a || c === b || d === a || d === b) continue;
                    out.push(I, J);
                }
            }
        }
        return out;
    }

    /** Recentre at the bead centroid and rescale to total length L0 (a similarity: isotopy-safe). */
    normalize(x, strength = 1) {
        const g = this.g, N = g.N;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < N; i++) { cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; }
        cx /= N; cy /= N; cz /= N;
        const L = g.totalLength(x);
        const s = Math.pow(this.L0 / L, strength);
        const t = strength;
        for (let i = 0; i < N; i++) {
            x[3 * i] = (x[3 * i] - t * cx) * s + (1 - s) * (1 - t) * cx;
            x[3 * i + 1] = (x[3 * i + 1] - t * cy) * s + (1 - s) * (1 - t) * cy;
            x[3 * i + 2] = (x[3 * i + 2] - t * cz) * s + (1 - s) * (1 - t) * cz;
        }
    }

    /** Tangential displacement that evens out bead spacing along each edge. */
    spacing(x, D, k = 0.35) {
        const tr = this.g.triples;
        for (let q = 0; q < tr.length; q += 3) {
            const a = 3 * tr[q], i = 3 * tr[q + 1], b = 3 * tr[q + 2];
            const l1 = Math.hypot(x[i] - x[a], x[i + 1] - x[a + 1], x[i + 2] - x[a + 2]);
            const l2 = Math.hypot(x[b] - x[i], x[b + 1] - x[i + 1], x[b + 2] - x[i + 2]);
            const tx = x[b] - x[a], ty = x[b + 1] - x[a + 1], tz = x[b + 2] - x[a + 2];
            const tl = Math.hypot(tx, ty, tz) || 1e-12;
            const s = k * 0.5 * (l2 - l1) / tl;
            D[i] += s * tx; D[i + 1] += s * ty; D[i + 2] += s * tz;
        }
    }

    /** Scale D so that no bead moves more than GUARD × clearance (and a fraction of a segment). */
    guard(x, D, extraCap = Infinity) {
        let m = 0;
        for (let i = 0; i < D.length; i += 3) m = Math.max(m, D[i] * D[i] + D[i + 1] * D[i + 1] + D[i + 2] * D[i + 2]);
        m = Math.sqrt(m);
        const h = this.meanSeg;
        const lim = Math.min(0.3 * h, extraCap);
        const dmin = this.clearance(x, 2 * lim / GUARD + 1e-9);
        this.lastClear = dmin;
        const cap = Math.min(lim, GUARD * dmin);
        if (m > cap) {
            const s = cap / m;
            for (let i = 0; i < D.length; i++) D[i] *= s;
            return { limited: true, moved: cap, dmin };
        }
        return { limited: false, moved: m, dmin };
    }

    // ------------------------------------------------------------ the step

    step() {
        const g = this.g, N = g.N, x = g.x;
        if (!this.cache) {
            this.cache = this.energy(x, this.grad);
        }
        const { E } = this.cache;
        this.masses(x);
        const F = this.D;   // reuse as −grad
        for (let i = 0; i < 3 * N; i++) F[i] = -this.grad[i];
        const c = this.params.sobolev * this.meanSeg;
        // the L² term matches the bending and junction stiffness at the bead scale
        const Lbar = this.L0 / Math.max(1, this.m);
        this.c2 = (this.params.stiff ?? 1) * 2 * (this.params.bend + this.params.junction) * Lbar / (this.meanSeg * this.meanSeg);
        this.solve(F, this.v, c);
        const v = this.v;
        // Total length is held fixed (the energies are not all scale-invariant):
        // remove the part of v that changes it, in the preconditioner's metric.
        const G = this.lengthGrad(x);
        const zG = this.zG || (this.zG = new Float64Array(3 * N));
        this.solve(G, zG, c);
        let gv = 0, gz = 0;
        for (let i = 0; i < 3 * N; i++) { gv += G[i] * v[i]; gz += G[i] * zG[i]; }
        if (gz > 0) {
            const mu = gv / gz;
            for (let i = 0; i < 3 * N; i++) v[i] -= mu * zG[i];
        }

        let vmax = 0;
        for (let i = 0; i < 3 * N; i += 3) vmax = Math.max(vmax, Math.hypot(v[i], v[i + 1], v[i + 2]));
        const h = this.meanSeg;
        if (!this.tau || !Number.isFinite(this.tau)) this.tau = 0.05 * h / (vmax || 1);
        // never ask for more than the guard could grant
        this.tau = Math.min(this.tau, 0.6 * h / (vmax || 1));

        const D = this.D;
        // heavy-ball momentum, dropped whenever a step fails to lower E
        const beta = this.params.momentum ?? 0.9;
        const Dp = this.Dprev && this.Dprev.length === 3 * N && !this.grabbed ? this.Dprev : null;
        for (let i = 0; i < 3 * N; i++) D[i] = this.tau * v[i] + (Dp ? beta * Dp[i] : 0);
        if (this.grabbed) { this.spacing(x, D); this.addGrab(x, D); }
        const gd = this.guard(x, D);

        const y = this.trial;
        for (let i = 0; i < 3 * N; i++) y[i] = x[i] + D[i];
        if (this.grabbed) { /* hold the frame still while the user pulls */ }
        else this.normalize(y, this.relaxAfterGrab > 0 ? 0.15 : 1);
        if (this.relaxAfterGrab > 0) this.relaxAfterGrab--;

        const res = this.energy(y, this.trialGrad);
        this.it++;
        const tol = 1e-9 * Math.abs(E) + 1e-12;
        if (res.E <= E + tol || this.grabbed || this.relaxAfterGrab > 0 || this.rejectRun > 40) {
            if (!this.Dprev || this.Dprev.length !== 3 * N) this.Dprev = new Float64Array(3 * N);
            for (let i = 0; i < 3 * N; i++) this.Dprev[i] = y[i] - x[i];
            g.x.set(y);
            [this.grad, this.trialGrad] = [this.trialGrad, this.grad];
            this.cache = res;
            this.accepted++;
            this.cholAge = (this.cholAge || 0) + 1;
            this.rejectRun = 0;
            if (!gd.limited) this.tau *= 1.25;
            this.lastMove = gd.moved;
            this.history.push(res.E);
            if (this.history.length > 400) this.history.shift();
            // keep each edge's bead count in step with its length
            if (this.params.remesh !== false && this.accepted % 25 === 0 && this.remesh()) this.invalidate();
            this.checkSettled();
            return true;
        }
        if (this.Dprev && Dp) this.Dprev = null;   // restart the momentum first
        else this.tau *= 0.4;
        this.rejectRun++;
        return false;
    }

    /** ∂(total length)/∂x */
    lengthGrad(x) {
        const g = this.g;
        const G = this.lenG && this.lenG.length === 3 * g.N ? this.lenG : (this.lenG = new Float64Array(3 * g.N));
        G.fill(0);
        for (let s = 0; s < g.S; s++) {
            const a = 3 * g.segA[s], b = 3 * g.segB[s];
            const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
            const l = Math.hypot(dx, dy, dz) || 1e-12;
            G[b] += dx / l; G[b + 1] += dy / l; G[b + 2] += dz / l;
            G[a] -= dx / l; G[a + 1] -= dy / l; G[a + 2] -= dz / l;
        }
        return G;
    }

    /** Remove from each interior bead's vector its component along the edge. */
    projectNormal(x, v) {
        const tr = this.g.triples;
        for (let q = 0; q < tr.length; q += 3) {
            const a = 3 * tr[q], i = 3 * tr[q + 1], b = 3 * tr[q + 2];
            const tx = x[b] - x[a], ty = x[b + 1] - x[a + 1], tz = x[b + 2] - x[a + 2];
            const tl2 = tx * tx + ty * ty + tz * tz || 1e-24;
            const s = (v[i] * tx + v[i + 1] * ty + v[i + 2] * tz) / tl2;
            v[i] -= s * tx; v[i + 1] -= s * ty; v[i + 2] -= s * tz;
        }
    }

    checkSettled() {
        if (this.grabbed || this.relaxAfterGrab > 0) { this.settled = false; return; }
        const H = this.history;
        if (H.length < 160) return;
        const old = H[H.length - 160], now = H[H.length - 1];
        const rel = (old - now) / Math.max(1e-9, Math.abs(now));
        this.settled = rel < 4e-5 && (this.lastMove || 0) < 0.02 * this.meanSeg;
    }

    // ------------------------------------------------------------ grabbing

    grab(node, target) {
        if (!this.grabbed || this.grabbed.node !== node) this.grabField = null;
        this.grabbed = { node, target: target.slice() };
        this.settled = false;
    }

    release() {
        if (this.grabbed) this.relaxAfterGrab = 60;
        this.grabbed = null;
        this.grabField = null;
        this.history = [];
    }

    /** Pull the grabbed bead's neighbourhood toward the target with the preconditioner's kernel. */
    addGrab(x, D) {
        const g = this.g, { node, target } = this.grabbed;
        if (!this.grabField || this.grabField.length !== 3 * g.N) {
            const e = new Float64Array(3 * g.N);
            e[3 * node] = 1; e[3 * node + 1] = 1; e[3 * node + 2] = 1;
            const f = new Float64Array(3 * g.N);
            this.solve(e, f, this.params.sobolev * this.meanSeg);
            const r = f[3 * node] || 1;
            this.grabField = f.map(v => v / r);
        }
        const k = 0.5;
        const dx = k * (target[0] - x[3 * node]), dy = k * (target[1] - x[3 * node + 1]), dz = k * (target[2] - x[3 * node + 2]);
        const f = this.grabField;
        for (let i = 0; i < g.N; i++) {
            const s = f[3 * i];
            if (Math.abs(s) < 1e-4) continue;
            D[3 * i] += s * dx; D[3 * i + 1] += s * dy; D[3 * i + 2] += s * dz;
        }
    }

    // ------------------------------------------------------------ other flows

    /** One guarded step along a displacement field (scramble, symmetrize). Returns the move made. */
    pushStep(fieldFn, strength = 1) {
        const g = this.g, x = g.x, N = g.N, D = this.D;
        D.fill(0);
        fieldFn(x, D);
        for (let i = 0; i < 3 * N; i++) D[i] *= strength;
        this.spacing(x, D);
        const gd = this.guard(x, D);
        for (let i = 0; i < 3 * N; i++) x[i] += D[i];
        this.normalize(x, 1);
        this.it++;
        this.accepted++;
        if (this.accepted % 6 === 0 && this.remesh()) this.invalidate();
        this.cache = null;
        this.settled = false;
        this.history = [];
        return gd;
    }

    /** A random field of localized swirls (divergence-free rotations). */
    makeSwirls(rng, count = 5) {
        const x = this.g.x, N = this.g.N;
        let R = 0;
        for (let i = 0; i < N; i++) R = Math.max(R, Math.hypot(x[3 * i], x[3 * i + 1], x[3 * i + 2]));
        const sw = [];
        for (let k = 0; k < count; k++) {
            const n = 3 * Math.floor(rng() * N);
            const axis = randomUnit(rng);
            sw.push({ c: [x[n], x[n + 1], x[n + 2]], axis, rho: R * (0.25 + 0.35 * rng()), s: (rng() < 0.5 ? -1 : 1) * (0.6 + rng()) });
        }
        return (xx, D) => {
            for (let i = 0; i < N; i++) {
                const px = xx[3 * i], py = xx[3 * i + 1], pz = xx[3 * i + 2];
                for (const w of sw) {
                    const rx = px - w.c[0], ry = py - w.c[1], rz = pz - w.c[2];
                    const f = w.s * Math.exp(-(rx * rx + ry * ry + rz * rz) / (w.rho * w.rho));
                    const a = w.axis;
                    D[3 * i] += f * (a[1] * rz - a[2] * ry);
                    D[3 * i + 1] += f * (a[2] * rx - a[0] * rz);
                    D[3 * i + 2] += f * (a[0] * ry - a[1] * rx);
                }
            }
            let m = 0;
            for (let i = 0; i < 3 * N; i += 3) m = Math.max(m, Math.hypot(D[i], D[i + 1], D[i + 2]));
            const s = 0.25 * this.meanSeg / (m || 1);
            for (let i = 0; i < 3 * N; i++) D[i] *= s;
        };
    }

    /** The bead count the edges of orbit o should share: the largest among them. */
    orbitSegs(o) {
        let best = 0;
        this.g.edges.forEach((e, ei) => { if (this.orbit[ei] === o) best = Math.max(best, e.nodes.length - 1); });
        return best;
    }

    // ------------------------------------------------------------ remeshing

    /**
     * Keep each edge's bead count near its length / target spacing: split the
     * longest segment (geometry unchanged) or drop a nearly straight bead when
     * that is a guarded move. Returns true if the topology of the bead graph changed.
     */
    remesh() {
        const g = this.g, x = g.x;
        const total = this.params.totalBeads || g.N;
        const Ltot = g.totalLength(x);
        const h = Ltot / total;
        let changed = false, removed = false;
        const add = [];
        let dmin = null;
        // one bead count per orbit of edges, so that symmetric edges are discretized alike
        const orb = this.orbit, O = this.nOrbits;
        const Lo = new Float64Array(O), no = new Float64Array(O);
        g.edges.forEach((e, ei) => { Lo[orb[ei]] += g.edgeLength(ei, x); no[orb[ei]]++; });
        for (let ei = 0; ei < g.edges.length; ei++) {
            const e = g.edges[ei];
            const nd = e.nodes;
            const segs = nd.length - 1;
            const Le = Lo[orb[ei]] / no[orb[ei]];
            const minSegs = e.circle ? 10 : (e.a === e.b ? 9 : (this.params.minSegs ?? 5));
            const target = Math.max(minSegs, Math.round(Le / h));
            // the orbit's count, unless it is far off: then generous hysteresis, so a bead added
            // now is not removed a moment later
            const lo = no[orb[ei]] > 1 ? this.orbitSegs(orb[ei]) : null;
            const want = lo && Math.abs(lo - target) <= Math.max(1, 0.25 * target) ? lo : target;
            if (segs < want && (segs < Math.min(target - 1, 0.8 * target) || lo)) {
                let best = -1, bl = 0;
                for (let k = 0; k + 1 < nd.length; k++) {
                    const a = 3 * nd[k], b = 3 * nd[k + 1];
                    const l = Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]);
                    if (l > bl) { bl = l; best = k; }
                }
                const a = 3 * nd[best], b = 3 * nd[best + 1];
                const id = g.N + add.length;
                add.push([0.5 * (x[a] + x[b]), 0.5 * (x[a + 1] + x[b + 1]), 0.5 * (x[a + 2] + x[b + 2])]);
                nd.splice(best + 1, 0, id);
                changed = true;
            } else if (segs > want && (segs > Math.max(target + 1, 1.3 * target) || lo) && segs > minSegs) {
                if (dmin === null) dmin = this.clearance(x, 2 * this.meanSeg);
                let best = -1, bestAng = 0.35;
                for (let k = 1; k + 1 < nd.length; k++) {
                    const i = nd[k];
                    if (g.kind[i] !== KIND_BEAD) continue;
                    if (this.grabbed && this.grabbed.node === i) continue;
                    const a = 3 * nd[k - 1], c = 3 * nd[k + 1], j = 3 * i;
                    const ux = x[j] - x[a], uy = x[j + 1] - x[a + 1], uz = x[j + 2] - x[a + 2];
                    const vx = x[c] - x[j], vy = x[c + 1] - x[j + 1], vz = x[c + 2] - x[j + 2];
                    const cs = (ux * vx + uy * vy + uz * vz) / ((Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz)) || 1);
                    const ang = Math.acos(Math.max(-1, Math.min(1, cs)));
                    const off = Math.hypot(x[j] - 0.5 * (x[a] + x[c]), x[j + 1] - 0.5 * (x[a + 1] + x[c + 1]), x[j + 2] - 0.5 * (x[a + 2] + x[c + 2]));
                    if (ang < bestAng && off < GUARD * dmin) { bestAng = ang; best = k; }
                }
                if (best > 0) {
                    g.kind[nd[best]] = 255;      // dead
                    nd.splice(best, 1);
                    changed = removed = true;
                }
            }
        }
        if (!changed) return false;
        // grow arrays for the new beads, then compact away dead ones
        const N2 = g.N + add.length;
        const X = new Float64Array(3 * N2), K = new Uint8Array(N2);
        X.set(g.x); K.set(g.kind);
        add.forEach((p, k) => { X.set(p, 3 * (g.N + k)); K[g.N + k] = KIND_BEAD; });
        g.x = X; g.kind = K; g.N = N2;
        if (removed) compact(g, this);
        g.rebuild();
        return true;
    }
}


/**
 * Envelope (skyline) Cholesky for the preconditioner A = diag(w) + c·L + c2·L².
 * Beads are ordered chain by chain with the real vertices last, so each bead row
 * reaches back only two places and fill-in is confined to the few vertex rows.
 */
class Skyline {
    constructor(g) {
        const N = g.N;
        const order = [];
        const seen = new Uint8Array(N);
        for (const e of g.edges) for (const n of e.nodes) if (g.kind[n] !== 1 && !seen[n]) { seen[n] = 1; order.push(n); }
        for (const n of g.vertexNodes) if (!seen[n]) { seen[n] = 1; order.push(n); }
        for (let i = 0; i < N; i++) if (!seen[i]) order.push(i);
        const pos = new Int32Array(N);
        order.forEach((n, k) => { pos[n] = k; });
        this.N = N; this.order = order; this.pos = pos; this.g = g;
        // pattern: neighbours within two steps
        const off = g.adjOff, adj = g.adj;
        const first = new Int32Array(N);
        for (let k = 0; k < N; k++) first[k] = k;
        for (let i = 0; i < N; i++) {
            const pi = pos[i];
            const touch = j => { const pj = pos[j]; if (pj < pi && pj < first[pi]) first[pi] = pj; if (pi < pj && pi < first[pj]) first[pj] = pi; };
            for (let a = off[i]; a < off[i + 1]; a++) {
                const j = adj[a];
                touch(j);
                for (let b = off[j]; b < off[j + 1]; b++) touch(adj[b]);
            }
        }
        const start = new Int32Array(N + 1);
        for (let k = 0; k < N; k++) start[k + 1] = start[k] + (k - first[k] + 1);
        this.first = first; this.start = start;
        this.L = new Float64Array(start[N]);
        this.y = new Float64Array(N);
    }

    at(r, c) { return this.start[r] + (c - this.first[r]); }     // c ≤ r, c ≥ first[r]

    factor(w, c, c2) {
        const g = this.g, N = this.N, pos = this.pos, L = this.L, off = g.adjOff, adj = g.adj;
        L.fill(0);
        const add = (i, j, v) => {
            let r = pos[i], col = pos[j];
            if (col > r) { const t = r; r = col; col = t; }
            L[this.at(r, col)] += v;
        };
        for (let i = 0; i < N; i++) {
            const di = off[i + 1] - off[i];
            add(i, i, w[i] + c * di + c2 * di * di);
            for (let a = off[i]; a < off[i + 1]; a++) {
                const j = adj[a];
                if (pos[j] < pos[i]) add(i, j, -c);
                // (L²)_ij over paths i–k–j: L_ik L_kj, k ∈ {i, j, common neighbours}
                const dj = off[j + 1] - off[j];
                if (pos[j] < pos[i]) add(i, j, c2 * (-di - dj));
                add(i, i, c2 * 1);
                for (let b = off[j]; b < off[j + 1]; b++) {
                    const k = adj[b];
                    if (k !== i && pos[k] < pos[i]) add(i, k, c2 * 1);
                }
            }
        }
        // in-place envelope Cholesky
        const first = this.first, start = this.start;
        for (let r = 0; r < N; r++) {
            const fr = first[r], sr = start[r];
            for (let col = fr; col <= r; col++) {
                const fc = first[col], sc = start[col];
                let sum = L[sr + col - fr];
                const k0 = Math.max(fr, fc);
                for (let k = k0; k < col; k++) sum -= L[sr + k - fr] * L[sc + k - fc];
                if (col < r) L[sr + col - fr] = sum / L[sc + col - fc];
                else L[sr + r - fr] = Math.sqrt(Math.max(sum, 1e-300));
            }
        }
    }

    /** v = A⁻¹ F on interleaved 3-vectors */
    solve(F, v) {
        const N = this.N, L = this.L, first = this.first, start = this.start, y = this.y, order = this.order;
        for (let comp = 0; comp < 3; comp++) {
            for (let r = 0; r < N; r++) {
                const fr = first[r], sr = start[r];
                let sum = F[3 * order[r] + comp];
                for (let k = fr; k < r; k++) sum -= L[sr + k - fr] * y[k];
                y[r] = sum / L[sr + r - fr];
            }
            for (let r = N - 1; r >= 0; r--) {
                const fr = first[r], sr = start[r];
                const val = y[r] / L[sr + r - fr];
                y[r] = val;
                for (let k = fr; k < r; k++) y[k] -= L[sr + k - fr] * val;
            }
            for (let r = 0; r < N; r++) v[3 * order[r] + comp] = y[r];
        }
    }
}

function compact(g, relaxer) {
    const map = new Int32Array(g.N).fill(-1);
    let n = 0;
    for (let i = 0; i < g.N; i++) if (g.kind[i] !== 255) map[i] = n++;
    const X = new Float64Array(3 * n), K = new Uint8Array(n);
    for (let i = 0; i < g.N; i++) {
        const j = map[i];
        if (j < 0) continue;
        X[3 * j] = g.x[3 * i]; X[3 * j + 1] = g.x[3 * i + 1]; X[3 * j + 2] = g.x[3 * i + 2];
        K[j] = g.kind[i];
    }
    for (const e of g.edges) e.nodes = e.nodes.map(i => map[i]);
    g.vertexNodes = g.vertexNodes.map(i => map[i]);
    if (relaxer.grabbed) relaxer.grabbed.node = map[relaxer.grabbed.node];
    g.x = X; g.kind = K; g.N = n;
}

function randomUnit(rng) {
    for (;;) {
        const v = [2 * rng() - 1, 2 * rng() - 1, 2 * rng() - 1];
        const l = Math.hypot(...v);
        if (l > 0.1 && l <= 1) return v.map(c => c / l);
    }
}
