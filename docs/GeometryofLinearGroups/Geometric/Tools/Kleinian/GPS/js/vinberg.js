// vinberg.js — Vinberg's algorithm for the lattice (Z³, f), f = s1·x² + a·y² − s3·z².
//
// Computes a fundamental chamber for the maximal reflection subgroup of
// O(f, Z) acting on H², based at p0 = (0,0,1), chosen adjacent to the mirror
// Σ = {y = 0} (the geodesic where the shared binary subform ⟨s1, −s3⟩ lives).
//
// Roots: primitive e ∈ Z³ with k = f(e) > 0 and k | 2·s1·e1, k | 2·a·e2,
// k | 2·s3·e3 (so the reflection preserves Z³).  Roots are accepted in order
// of distance from p0 subject to B(e, e') ≤ 0 against all previously accepted
// roots; the algorithm stops when the chamber has finite area.
//
// Klein-model bookkeeping: in rescaled coordinates u = (√s1·x, √a·y, √s3·z)
// the form is standard Lorentzian, p0 maps to the disk origin, and the wall
// of a root e is the straight chord n1·k1 + n2·k2 = n3 with
// n(e) = (√s1·e1, √a·e2, √s3·e3).  The chamber lies on the side ≤ n3
// (it contains the origin), and Σ is the line k2 = 0 with the chamber above.

import { wallFromIdeal, kleinToPoincare } from './geometry.js';

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }

export function vinbergChamber(s1, a, s3, opts = {}) {
    const maxRoots = opts.maxRoots || 32;
    const e3max = opts.e3max || 25;
    const coefMax = opts.coefMax || 200;

    const B = (u, v) => s1 * u[0] * v[0] + a * u[1] * v[1] - s3 * u[2] * v[2];
    const q = e => B(e, e);
    const rs1 = Math.sqrt(s1), ra = Math.sqrt(a), rs3 = Math.sqrt(s3);
    const normal = e => [rs1 * e[0], ra * e[1], rs3 * e[2]];

    const crystallographic = e => {
        const k = q(e);
        return k > 0 && (2 * s1 * e[0]) % k === 0 && (2 * a * e[1]) % k === 0 && (2 * s3 * e[2]) % k === 0;
    };
    const primitive = e => gcd(gcd(e[0], e[1]), e[2]) === 1;

    // ── Step 1: chamber of the stabilizer of p0 (roots with e3 = 0) ──
    // Generic direction just above the positive k1-axis selects the sector
    // adjacent to Σ from the side y ≥ 0.
    const g = [Math.cos(0.05), Math.sin(0.05)];
    const stab = [];
    for (let e1 = -4; e1 <= 4; e1++) for (let e2 = -4; e2 <= 4; e2++) {
        const e = [e1, e2, 0];
        if ((e1 === 0 && e2 === 0) || !primitive(e) || !crystallographic(e)) continue;
        const n = normal(e);
        if (n[0] * g[0] + n[1] * g[1] < -1e-12) stab.push(e);
    }
    // Keep only the (two) walls actually bounding the sector.
    const essentialStab = stab.filter(e => {
        const n = normal(e);
        const m = Math.hypot(n[0], n[1]);
        for (const w of [[-n[1] / m, n[0] / m], [n[1] / m, -n[0] / m]]) {
            let ok = true;
            for (const f of stab) {
                if (f === e) continue;
                const nf = normal(f);
                if (nf[0] * w[0] + nf[1] * w[1] > 1e-9) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    });
    const accepted = [...essentialStab];

    // ── Step 2: roots at increasing distance from p0 ──
    // Since e3 ≥ 1, the crystallographic condition k | 2·s3·e3 forces
    // k ≤ 2·s3·e3, hence s1·e1² + a·e2² = k + s3·e3² ≤ s3·(e3² + 2e3).
    const cands = [];
    for (let e3 = 1; e3 <= e3max; e3++) {
        const cap = s3 * (e3 * e3 + 2 * e3);
        const lim1 = Math.min(coefMax, Math.floor(Math.sqrt(cap / s1)));
        const lim2 = Math.min(coefMax, Math.floor(Math.sqrt(cap / a)));
        for (let e1 = -lim1; e1 <= lim1; e1++) {
            for (let e2 = -lim2; e2 <= lim2; e2++) {
                const e = [e1, e2, e3];
                if (!primitive(e) || !crystallographic(e)) continue;
                cands.push({ e, k: q(e), w: e3 * e3 / q(e) });
            }
        }
    }
    cands.sort((x, y) => x.w - y.w || x.k - y.k ||
        x.e[0] - y.e[0] || x.e[1] - y.e[1] || x.e[2] - y.e[2]);

    let status = analyzeChamber(accepted.map(normal));
    for (const c of cands) {
        if (status.finite) break;
        if (accepted.length >= maxRoots) break;
        if (accepted.every(r => B(c.e, r) <= 0)) {
            accepted.push(c.e);
            status = analyzeChamber(accepted.map(normal));
        }
    }

    if (!status.finite) {
        return {
            ok: false,
            reason: `Chamber did not close after ${accepted.length} roots (search bound reached) — ` +
                `the reflection subgroup of this form is probably not cofinite (non-reflective form).`,
            roots: accepted,
        };
    }

    const poly = buildPolygon(accepted, status, B, normal);
    if (poly.polygonError) {
        return { ok: false, reason: 'Internal error: chamber boundary chain did not close.', roots: accepted };
    }
    return { ok: true, ...poly, roots: accepted };
}

// ── Chamber analysis in the Klein disk ─────────────────────────────────────
// Each wall (spacelike normal n) is the chord n1·x + n2·y = n3, chamber side ≤.
// For each wall clip its chord segment by every other half-plane and record
// what bounds each end: another wall (vertex) or the unit circle.  The area is
// finite iff every circle endpoint is matched by another wall's circle
// endpoint at (numerically) the same ideal point — a cusp.
function analyzeChamber(normals) {
    const walls = normals.map(n => {
        const M = Math.hypot(n[0], n[1]);
        const t0 = n[2] / M;
        const F = [n[0] * t0 / M, n[1] * t0 / M];
        const T = [-n[1] / M, n[0] / M];
        return { n, M, F, T, tmax: Math.sqrt(Math.max(0, 1 - t0 * t0)) };
    });
    const segs = [];
    for (let i = 0; i < walls.length; i++) {
        const wi = walls[i];
        let lo = -wi.tmax, hi = wi.tmax, loBy = 'circle', hiBy = 'circle';
        for (let j = 0; j < walls.length && lo < hi; j++) {
            if (j === i) continue;
            const nj = walls[j].n;
            const c0 = nj[0] * wi.F[0] + nj[1] * wi.F[1] - nj[2];
            const c1 = nj[0] * wi.T[0] + nj[1] * wi.T[1];
            if (Math.abs(c1) < 1e-13) {
                if (c0 > 1e-12) { lo = 1; hi = 0; }      // wall entirely cut off
                continue;
            }
            const tb = -c0 / c1;
            if (c1 > 0) { if (tb < hi) { hi = tb; hiBy = j; } }
            else { if (tb > lo) { lo = tb; loBy = j; } }
        }
        if (hi - lo > 1e-9) {
            const P = t => [wi.F[0] + t * wi.T[0], wi.F[1] + t * wi.T[1]];
            segs.push({
                wall: i,
                ends: [
                    { t: lo, p: P(lo), by: loBy },
                    { t: hi, p: P(hi), by: hiBy },
                ],
            });
        }
    }
    // Match circle endpoints into cusps.  A circle endpoint is a cusp when
    // some other wall also ends at (numerically) the same ideal point — that
    // partner endpoint may itself be circle-labelled, or wall-labelled if the
    // clip landed a hair inside the disk.
    const allEnds = [];
    for (const s of segs) for (const end of s.ends) allEnds.push({ seg: s, end });
    let finite = true;
    for (const { seg, end } of allEnds) {
        if (end.by !== 'circle') continue;
        const mate = allEnds.find(o => o.seg !== seg &&
            Math.hypot(o.end.p[0] - end.p[0], o.end.p[1] - end.p[1]) < 1e-6);
        if (mate) { end.by = mate.seg.wall; end.ideal = true; }
        else finite = false;
    }
    if (segs.length < 3) finite = false;
    return { finite, segs };
}

// ── Assemble the chamber polygon (ordered vertices + walls per edge) ──────
function buildPolygon(roots, status, B, normal) {
    const segs = status.segs;
    const byWall = new Map(segs.map(s => [s.wall, s]));
    const verts = [];          // { k:[x,y], ideal, angle, m }
    const edgeWalls = [];      // root index per edge, aligned with verts
    let cur = segs[0], entry = cur.ends[0];
    for (let step = 0; step <= segs.length + 1; step++) {
        const exit = cur.ends[0] === entry ? cur.ends[1] : cur.ends[0];
        edgeWalls.push(cur.wall);
        const nextIdx = exit.by;
        const ideal = !!exit.ideal || Math.hypot(exit.p[0], exit.p[1]) > 1 - 1e-7;
        verts.push({ k: exit.p, ideal, wallA: cur.wall, wallB: nextIdx });
        if (nextIdx === segs[0].wall && step > 0) break;
        const next = byWall.get(nextIdx);
        if (!next) return { polygonError: true };
        // entry endpoint on the next wall = the endpoint nearest to exit.p
        entry = Math.hypot(next.ends[0].p[0] - exit.p[0], next.ends[0].p[1] - exit.p[1]) <
            Math.hypot(next.ends[1].p[0] - exit.p[0], next.ends[1].p[1] - exit.p[1])
            ? next.ends[0] : next.ends[1];
        cur = next;
    }

    // Interior angles from the exact bilinear form.
    let area = (verts.length - 2) * Math.PI;
    for (const v of verts) {
        if (v.ideal) { v.angle = 0; v.m = Infinity; }
        else {
            const e = roots[v.wallA], f = roots[v.wallB];
            const c = -B(e, f) / Math.sqrt(B(e, e) * B(f, f));
            v.angle = Math.acos(Math.min(1, Math.max(-1, c)));
            v.m = Math.round(Math.PI / v.angle);
        }
        area -= v.angle;
    }

    // Poincaré-model data for rendering/tiling.
    const pverts = verts.map(v => kleinToPoincare(v.k));
    const walls = edgeWalls.map(i => {
        const n = normal(roots[i]);
        const M = Math.hypot(n[0], n[1]);
        const t0 = n[2] / M, tmax = Math.sqrt(Math.max(0, 1 - t0 * t0));
        const F = [n[0] * t0 / M, n[1] * t0 / M], T = [-n[1] / M, n[0] / M];
        return wallFromIdeal(
            [F[0] - tmax * T[0], F[1] - tmax * T[1]],
            [F[0] + tmax * T[0], F[1] + tmax * T[1]]);
    });

    return {
        verts: pverts,
        vertData: verts,
        walls,
        edgeRoots: edgeWalls.map(i => roots[i]),
        angles: verts.map(v => v.m),
        area,
        cusps: verts.filter(v => v.ideal).length,
        nWalls: segs.length,
    };
}
