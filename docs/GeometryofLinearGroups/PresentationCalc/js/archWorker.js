/**
 * Worker for one place at ∞: poincare's own pipeline (buildGroup, then
 * runCompute) on the group read for that embedding, after the Discreteness
 * Algorithm's exact search for non-discreteness (certificates.js). It is the
 * same job as discretenessAlgorithm/js/archWorker.js, and also reports
 *   • the presentation poincare reads off the domain (in the input generators);
 *   • for a group in PGL₂(ℝ), whether the domain has finite AREA in the plane
 *     H² it preserves (its volume in H³ is always infinite).
 *
 * In:  { id, state, maxFaces, maxDepth, certify }   (state: poincare's input state;
 *      certify: false skips the non-discreteness search, for groups known to be discrete)
 * Out: { id, phase: 'cert', cert } then { id, phase: 'done', cert, summary }, or { id, error }.
 */
import { buildGroup } from '../../Geometric/Tools/Kleinian/poincare/js/matrixInput.js';
import { runCompute, matToArr } from '../../Geometric/Tools/Kleinian/poincare/js/compute.js';
import { Matrix2x2, translationTowards } from '../../Geometric/Tools/Kleinian/poincare/js/math.js';
import { serializeTowerContext } from '../../Geometric/Tools/Kleinian/poincare/js/tower.js';
import { archCertificate } from '../../Geometric/Tools/discretenessAlgorithm/js/certificates.js';

/** Real up to a scalar: the group preserves the plane over ℝ (as poincare's planar.js tests). */
function isRealGroup(matrices) {
    return matrices.every((m) => {
        const es = [m.a, m.b, m.c, m.d];
        let big = es[0];
        for (const e of es) if (e.normSq() > big.normSq()) big = e;
        const r = Math.sqrt(big.normSq());
        if (!(r > 0)) return false;
        const ur = big.re / r, ui = big.im / r;
        return es.every((e) => Math.abs(e.im * ur - e.re * ui) <= 1e-9 * r);
    });
}

/**
 * The ideal boundary of the domain's slice by the plane P = {y = 0} of the
 * ball. A point of ∂P is ℓ(θ) = (cos θ, 0, sin θ, 1) in the hyperboloid, and a
 * wall with covector c excludes it when ⟨c, ℓ⟩ = c₁cos θ + c₃sin θ − c₀ > 0
 * (poincare's convention: the domain is ⟨c, X⟩ ≤ 0). The slice has finite
 * area iff the excluded open arcs cover ∂P up to finitely many points (the
 * cusps). Returns the uncovered measure and the number of free arcs.
 */
function idealBoundary(walls) {
    const arcs = [];
    for (const w of walls) {
        const [x, , z, t] = w.cov;
        const rho = Math.hypot(x, z);
        if (!(rho > 1e-12)) continue;
        if (t >= rho) continue;                  // misses ∂P
        if (t <= -rho) return { free: 0, gaps: 0 };   // excludes all of ∂P
        const phi = Math.atan2(z, x), half = Math.acos(t / rho);
        arcs.push([phi - half, phi + half]);
    }
    if (!arcs.length) return { free: 2 * Math.PI, gaps: 1 };
    const TAU = 2 * Math.PI;
    // unroll onto [a0, a0 + 2π) starting at the first arc
    const norm = arcs.map(([a, b]) => { let s = ((a % TAU) + TAU) % TAU; return [s, s + (b - a)]; }).sort((p, q) => p[0] - q[0]);
    const start = norm[0][0];
    let reach = norm[0][1], free = 0, gaps = 0;
    const EPS = 1e-6;
    for (let i = 1; i < norm.length; i++) {
        const [a, b] = norm[i];
        if (a > reach + EPS) { free += a - reach; gaps++; }
        reach = Math.max(reach, b);
    }
    if (start + TAU > reach + EPS) { free += start + TAU - reach; gaps++; }
    return { free, gaps };
}

function summarize(res, real) {
    const rep = res.report || {};
    const inv = res.invariants || {};
    const mem = rep.membership || [];
    const out = {
        status: rep.status,
        exactUsed: !!rep.exactUsed,
        faces: res.domain ? res.domain.walls.length : 0,
        capped: !!(res.domain && res.domain.stabilizer && res.domain.stabilizer.capped),
        membershipFail: mem.some((m) => m.ok === false),
        finiteVolume: !!inv.finiteVolume,
        volume: inv.volume ?? null,
        h1: inv.h1String || null,
        torsion: inv.torsion || [],
        cusps: (rep.cusps || []).length,
        presentation: inv.inUser || null,
        presentationComplete: inv.presentationComplete !== false,
        simplified: inv.simplified ? { n: inv.simplified.n, relators: inv.simplified.relators, words: inv.simplified.words } : null,
        real,
    };
    if (real && res.domain) {
        const b = idealBoundary(res.domain.walls);
        out.finiteArea = b.gaps === 0;
        out.freeArcs = b.gaps;
    }
    return out;
}

/**
 * Basepoints in ball coordinates (null is j, the ball's centre). For a group
 * in PGL₂(ℝ) they stay in the plane y = 0, so the slice of the domain by that
 * plane is a fundamental domain for the action on H².
 */
const BASEPOINTS = [null, [0.11, 0.07, 0.05], [-0.13, 0.05, 0.09], [0.05, -0.12, -0.08]];
const PLANAR_BASEPOINTS = [null, [0.11, 0, 0.05], [-0.13, 0, 0.09], [0.05, 0, -0.12]];
const RETRY_BUDGET_MS = 20000;

function basepointMatrix(bp) {
    if (!bp) return Matrix2x2.identity();
    const r = Math.hypot(...bp);
    return translationTowards({ x: bp[0] / r, y: bp[1] / r, z: bp[2] / r }, 2 * Math.atanh(r));
}

self.onmessage = (ev) => {
    const { id, state, maxFaces = 96, maxDepth = 8, certify = true } = ev.data;
    try {
        const { matrices, exactCtx } = buildGroup(state);
        const exact = exactCtx ? serializeTowerContext(exactCtx) : null;
        const real = isRealGroup(matrices) && !(state.anti || []).some(Boolean);
        let cert = null;
        if (certify && exactCtx && !(state.anti || []).some(Boolean)) {
            try { cert = archCertificate(exactCtx); } catch (e) { cert = { nondiscrete: false, error: e.message }; }
        }
        self.postMessage({ id, phase: 'cert', cert });
        if (cert && cert.nondiscrete) { self.postMessage({ id, phase: 'done', cert, summary: null }); return; }
        const orig = matrices.map(matToArr);
        const t0 = Date.now();
        let first = null, found = null, tries = 0;
        for (const bp of real ? PLANAR_BASEPOINTS : BASEPOINTS) {
            if (tries && Date.now() - t0 > RETRY_BUDGET_MS) break;
            tries++;
            const B = basepointMatrix(bp), Bi = B.inv();
            const res = runCompute({
                gens: matrices.map((g) => matToArr(Bi.mul(g).mul(B).normalized())), origGens: orig, B: matToArr(B),
                maxFaces, maxDepth, fullDirichlet: false, exact, ford: null,
            });
            const s = summarize(res, real);
            s.bp = bp;
            if (!first) first = s;
            if (s.status === 'verified') { found = s; break; }
        }
        const summary = found || first;
        summary.tries = tries;
        self.postMessage({ id, phase: 'done', cert, summary });
    } catch (e) {
        self.postMessage({ id, error: e && e.message ? e.message : String(e) });
    }
};
