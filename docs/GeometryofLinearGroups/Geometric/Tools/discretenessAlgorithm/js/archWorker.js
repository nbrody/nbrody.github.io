/**
 * Worker for one place at ∞: poincare's own pipeline on the group read for
 * that embedding — buildGroup (matrixInput.js) then runCompute (compute.js),
 * exactly what poincare's domain worker runs — after a quick search for an
 * exact certificate of non-discreteness (certificates.js).
 *
 * In:  { id, state, maxFaces, maxDepth }   (state: poincare's input state)
 * Out: { id, phase: 'cert', cert } then { id, phase: 'done', cert, summary }, or { id, error }.
 * summary.bp is the basepoint (ball coordinates, null for j) of the domain reported.
 */
import { buildGroup } from '../../Kleinian/poincare/js/matrixInput.js';
import { runCompute, matToArr } from '../../Kleinian/poincare/js/compute.js';
import { Matrix2x2, translationTowards } from '../../Kleinian/poincare/js/math.js';
import { serializeTowerContext } from '../../Kleinian/poincare/js/tower.js';
import { archCertificate } from './certificates.js';

function summarize(res) {
    const rep = res.report || {};
    const inv = res.invariants || {};
    const mem = rep.membership || [];
    return {
        status: rep.status,
        exactUsed: !!rep.exactUsed,
        faces: res.domain ? res.domain.walls.length : 0,
        capped: !!(res.domain && res.domain.stabilizer && res.domain.stabilizer.capped),
        stabilizerOrder: res.domain && res.domain.stabilizer ? res.domain.stabilizer.order : 1,
        membershipFail: mem.some((m) => m.ok === false),
        finiteVolume: !!inv.finiteVolume,
        volume: inv.volume ?? null,
        h1: inv.h1String || null,
        torsion: inv.torsion || [],
        cusps: (rep.cusps || []).length,
        traceField: inv.traceField && !inv.traceField.note ? inv.traceField : null,
        timing: res.timing,
    };
}

/**
 * Basepoints to try, in ball coordinates (poincare's `bp`). The canonical
 * domain at j depends on how poincare cuts the stabilizer of j when j has
 * one, and the search reaches different walls from different centres: a group
 * that fails at j often verifies at a generic point. The first is j itself.
 */
const BASEPOINTS = [null, [0.11, 0.07, 0.05], [-0.13, 0.05, 0.09], [0.05, -0.12, -0.08]];
const RETRY_BUDGET_MS = 20000;

function basepointMatrix(bp) {
    if (!bp) return Matrix2x2.identity();
    const r = Math.hypot(...bp);
    return translationTowards({ x: bp[0] / r, y: bp[1] / r, z: bp[2] / r }, 2 * Math.atanh(r));
}

self.onmessage = (ev) => {
    const { id, state, maxFaces = 96, maxDepth = 8 } = ev.data;
    try {
        const { matrices, exactCtx } = buildGroup(state);
        // Serialize before the certificate search, which only reads the field.
        const exact = exactCtx ? serializeTowerContext(exactCtx) : null;
        let cert = null;
        if (exactCtx && !(state.anti || []).some(Boolean)) {
            try { cert = archCertificate(exactCtx); } catch (e) { cert = { nondiscrete: false, error: e.message }; }
        }
        self.postMessage({ id, phase: 'cert', cert });
        const orig = matrices.map(matToArr);
        const t0 = Date.now();
        let first = null, found = null, tries = 0;
        for (const bp of BASEPOINTS) {
            if (tries && Date.now() - t0 > RETRY_BUDGET_MS) break;
            tries++;
            const B = basepointMatrix(bp), Bi = B.inv();
            const res = runCompute({
                gens: matrices.map((g) => matToArr(Bi.mul(g).mul(B).normalized())), origGens: orig, B: matToArr(B),
                maxFaces, maxDepth, fullDirichlet: false, exact, ford: null,
            });
            const s = summarize(res);
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
