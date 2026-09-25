/**
 * The computation behind the page: canonical domain → Poincaré certificate →
 * invariants (and, on request, the Ford domain of a cusp). Plain data in,
 * plain data out, so the same code runs in the Web Worker (domainWorker.js)
 * or, where workers are unavailable, on the main thread.
 *
 * Frames. The page conjugates the generators so that the Dirichlet centre
 * sits at the ball origin (`gens` = B⁻¹·g·B for the basepoint isometry B);
 * everything returned for the Dirichlet domain is in that HOME frame. The
 * Ford domain is computed in its own frame, with the chosen cusp at ∞ (`Kf`).
 */
import { Matrix2x2, Complex, pslKey, applyMatrixToBall } from './math.js';
import { computeCanonicalDomain, computeFordDomain } from './canonical.js';
import { certifyDomain, transportBoundary } from './certifier.js';
import { deserializeExactContext } from './exact.js';
import { polyhedronVolume } from './polyhedron.js';
import {
    abelianization, abelianizationString, simplifyPresentation,
    presentationInInputGenerators, tidyRelators
} from './presentation.js';
import { lengthSpectrum, invariantTraceField, horoballPacking, domainVolume } from './invariants.js';

// ---------------- plain-data conversions ----------------

export const matToArr = (m) => [m.a.re, m.a.im, m.b.re, m.b.im, m.c.re, m.c.im, m.d.re, m.d.im, m.anti ? 1 : 0];
export const arrToMat = (a) => new Matrix2x2(
    new Complex(a[0], a[1]), new Complex(a[2], a[3]),
    new Complex(a[4], a[5]), new Complex(a[6], a[7]), !!a[8]);
const v3 = (p) => (p ? [p.x, p.y, p.z] : null);
const cx = (z) => (z ? [z.re, z.im] : null);

function serializeDomain(D) {
    return {
        mode: D.mode || 'dirichlet',
        walls: D.walls.map(w => ({
            cov: [w.cov.x, w.cov.y, w.cov.z, w.cov.w],
            elem: matToArr(w.elem), word: w.word, kind: w.kind, isParabolic: !!w.isParabolic,
            pairing: w.pairing ? {
                alg: matToArr(w.pairing.alg), word: w.pairing.word,
                partner: w.pairing.partner, residual: w.pairing.residual
            } : null
        })),
        stabilizer: { order: D.stabilizer.order, capped: D.stabilizer.capped },
        q0: v3(D.q0), conePoint: v3(D.conePoint), basepoint: v3(D.basepoint), ref: v3(D.ref),
        notes: D.notes || [], maxRadius: D.maxRadius ?? null, z0: cx(D.z0)
    };
}

function serializeRef(ref) {
    if (!ref) return undefined;
    const out = { ...ref };
    if (ref.points) out.points = ref.points.map(v3);
    return out;
}

function serializeReport(rep) {
    return {
        ok: rep.ok, status: rep.status, log: rep.log,
        entries: (rep.entries || []).map(e => ({ kind: e.kind, text: e.text, ref: serializeRef(e.ref) })),
        edgeCycles: (rep.edgeCycles || []).map(c => ({
            edges: c.edges, pairs: c.pairs, m: c.m, ok: c.ok, degenerate: !!c.degenerate,
            reason: c.reason, angleSum: c.angleSum, word: c.word
        })),
        pairingChecks: rep.pairingChecks || [],
        hasCusps: !!rep.hasCusps, cuspResolved: rep.cuspResolved !== false, exactUsed: !!rep.exactUsed,
        presentation: rep.presentation || null,
        membership: rep.membership || [],
        cusps: (rep.cusps || []).map(c => ({
            id: c.id, point: v3(c.point), vertices: c.vertices,
            loops: c.loops.map(l => ({ word: l.word, type: l.type })),
            shape: c.shape ? {
                rank: c.shape.rank, shape: cx(c.shape.shape),
                translations: (c.shape.translations || []).map(cx)
            } : null
        })),
        structure: rep.structure || null
    };
}

// ---------------- invariants ----------------

function computeInvariants(D, rep, k, exactCtx) {
    const out = { finiteVolume: !!D.poly.finiteVolume };
    try {
        out.volume = D.poly.finiteVolume ? polyhedronVolume(D.poly) : null;
    } catch (e) { out.volume = null; }
    out.torsion = [...new Set((rep.edgeCycles || []).filter(c => c.ok && c.m > 1).map(c => c.m))].sort((a, b) => a - b);
    const P = rep.presentation;
    if (P) {
        const pres = { n: P.generators.length, relators: P.relatorsEnc };
        const ab = abelianization(pres);
        out.h1 = { free: ab.free, torsion: ab.torsion.map(String) };
        out.h1String = abelianizationString(ab);
        out.h1Tex = abelianizationString(ab, { tex: true });
        const simp = simplifyPresentation(pres);
        out.simplified = {
            n: simp.n, relators: simp.relators, kept: simp.kept,
            // Each surviving generator s_k is a face pairing: its word in g's.
            words: simp.kept.map(g => P.generators[g - 1].word)
        };
        const user = presentationInInputGenerators(P, k);
        out.inUser = user ? { n: user.n, relators: tidyRelators(user.relators) } : null;
        out.presentationComplete = P.complete !== false;
    }
    try {
        out.spectrum = lengthSpectrum(D.orbit, { max: 12 }).map(c => ({
            length: [c.length.re, c.length.im], word: c.word, count: c.count
        }));
    } catch (e) { out.spectrum = []; }
    if (exactCtx) {
        try {
            const tf = invariantTraceField(exactCtx, { finiteVolume: !!D.poly.finiteVolume });
            out.traceField = tf ? JSON.parse(JSON.stringify(tf)) : null;
        } catch (e) {
            out.traceField = { note: `trace field: ${e.message}` };
        }
    }
    return out;
}

// ---------------- the Ford frame ----------------

/** Boundary coordinate (C ∪ ∞) of a ball boundary point. */
function ballToC(p) {
    const D = p.x * p.x + p.y * p.y + (1 - p.z) * (1 - p.z);
    if (D < 1e-14) return null;
    return new Complex(2 * p.x / D, 2 * p.y / D);
}

/**
 * Cusp points of the group in ORIGINAL coordinates: certified cusps first,
 * then fixed points of parabolic face pairings (rank-1 cusps), deduplicated.
 */
function cuspPoints(D, rep, B) {
    const pts = [];
    const push = (p) => {
        const q = transportBoundary(B, p);           // home frame → original
        if (!pts.some(r => r.distanceTo(q) < 1e-6)) pts.push(q);
    };
    for (const c of rep.cusps || []) push(c.point);
    // One point per certified cusp class; fall back to parabolic fixed points
    // (rank-1 cusps, e.g. the modular group's) only when none were certified.
    if (pts.length) return pts;
    for (const w of D.walls) {
        if (!w.isParabolic || !w.pairing) continue;
        const m = w.pairing.alg.normalized();
        if (Math.sqrt(m.c.normSq()) < 1e-9) { push({ x: 0, y: 0, z: 1 }); continue; }
        const z = m.a.sub(m.d).div(m.c.mul(2));
        const n = z.re * z.re + z.im * z.im;
        push({ x: 2 * z.re / (n + 1), y: 2 * z.im / (n + 1), z: (n - 1) / (n + 1) });
    }
    return pts;
}

/**
 * K sends the cusp ξ to ∞ and scales so the shortest translation of its
 * stabilizer is 1 (a unit-sized cusp lattice looks the same for every group).
 */
function fordFrame(origGens, xi) {
    const z = ballToC(xi);
    let C = z === null ? Matrix2x2.identity()
        : new Matrix2x2(new Complex(0), new Complex(1), new Complex(1), z.mul(-1)).normalized();
    const conj = (m) => C.mul(m).mul(C.inv()).normalized();
    const gens = origGens.map(conj);
    // Shortest translation among short words.
    const letters = gens.flatMap(g => [g, g.inv().normalized()]);
    let best = null;
    let layer = letters.map(m => m);
    const seen = new Set();
    for (let len = 1; len <= 5; len++) {
        const next = [];
        for (const m of layer) {
            const key = pslKey(m);
            if (seen.has(key)) continue;
            seen.add(key);
            if (!m.anti && Math.sqrt(m.c.normSq()) < 1e-9) {
                const r = m.a.div(m.d);
                if (Math.abs(r.re - 1) < 1e-8 && Math.abs(r.im) < 1e-8) {
                    const t = m.b.div(m.d);
                    if (Math.sqrt(t.normSq()) > 1e-9 && (!best || t.normSq() < best.normSq())) best = t;
                }
            }
            if (len < 5 && next.length < 3000) for (const g of letters) next.push(m.mul(g).normalized());
        }
        layer = next;
    }
    if (best) {
        // z ↦ z/τ, i.e. diag(τ^{-1/2}, τ^{1/2}).
        const r = Complex.sqrt(best);
        const S = new Matrix2x2(new Complex(1).div(r), new Complex(0), new Complex(0), r);
        C = S.mul(C).normalized();
    }
    return C;
}

// ---------------- entry point ----------------

/**
 * @param input {
 *   gens: [arr],        computational-frame generators (B-conjugated)
 *   origGens: [arr],    the generators as typed (for the Ford frame)
 *   B: arr,             basepoint isometry (home frame → original)
 *   maxFaces, maxDepth, fullDirichlet, exact: serialized exact context | null,
 *   ford: { cusp: index } | null
 * }
 */
export function runCompute(input) {
    const t0 = Date.now();
    const gens = input.gens.map(arrToMat);
    const interleaved = gens.flatMap(g => [g, g.inv().normalized()]);
    const exactCtx = input.exact ? deserializeExactContext(input.exact) : null;
    const D = computeCanonicalDomain(interleaved, Matrix2x2.identity(), input.maxFaces, {
        maxDepth: input.maxDepth, fullDirichlet: !!input.fullDirichlet
    });
    const t1 = Date.now();

    let rep;
    if (input.fullDirichlet && D.stabilizer.order > 1) {
        const k = D.stabilizer.order;
        const lines = [
            'Full Dirichlet domain at the basepoint.',
            `Basepoint stabilizer order |H| = ${k}.`,
            'This polyhedron is H-invariant — it is |H| copies of a fundamental',
            'domain — so the Poincaré fundamental-domain conditions do not apply.',
            'Turn off "Full Domain" to certify the canonical fundamental domain.'
        ];
        rep = { ok: false, status: 'full', log: lines, entries: lines.map(text => ({ kind: 'info', text })) };
    } else {
        rep = certifyDomain(D.walls, D.basepoint, exactCtx, {
            poly: D.poly, center: D.conePoint,
            generators: gens.map((m, i) => ({ matrix: m, word: [i + 1] }))
        });
    }
    const t2 = Date.now();
    const inv = rep.status === 'full' ? { finiteVolume: false } : computeInvariants(D, rep, gens.length, exactCtx);
    const t3 = Date.now();

    let ford = null;
    if (input.ford && rep.status !== 'full') {
        try {
            const B = arrToMat(input.B);
            const cusps = cuspPoints(D, rep, B);
            if (cusps.length === 0) {
                ford = { error: 'The group has no cusp (no parabolic element), so there is no Ford domain.' };
            } else {
                const idx = Math.min(input.ford.cusp || 0, cusps.length - 1);
                const origGens = input.origGens.map(arrToMat);
                const Kf = fordFrame(origGens, cusps[idx]);
                const fgens = origGens.map(g => Kf.mul(g).mul(Kf.inv()).normalized());
                const F = computeFordDomain(fgens.flatMap(g => [g, g.inv().normalized()]), input.maxFaces, { maxDepth: input.maxDepth });
                const vol = F.poly.finiteVolume ? domainVolume(F.walls, F.ref) : null;
                const hb = horoballPacking(F.orbit, { window: 5, minDiameter: 0.015, max: 2500 });
                ford = {
                    domain: serializeDomain(F), Kf: matToArr(Kf), volume: vol,
                    cusps: cusps.map(p => [p.x, p.y, p.z]), cusp: idx,
                    horoballs: hb ? {
                        H: hb.H, lattice: hb.lattice.map(cx),
                        balls: hb.balls.map(b => [b.base.re, b.base.im, b.diameter])
                    } : null
                };
            }
        } catch (e) {
            ford = { error: e.message };
        }
    }
    const t4 = Date.now();

    return {
        domain: serializeDomain(D),
        report: serializeReport(rep),
        invariants: inv,
        ford,
        timing: { domain: t1 - t0, certificate: t2 - t1, invariants: t3 - t2, ford: t4 - t3 }
    };
}
