/**
 * compute.js — full discreteness analysis over ℚ or a number field ℚ(α), plus a
 * serialization boundary for the Web Worker. `computeAnalysis` dispatches on the matrix
 * type (Mat2Q vs Mat2NF) and reuses the shared Dirichlet-domain + Poincaré certifier for
 * both. `toWire` flattens to structured-clone-safe data (matrices → real-embedding floats,
 * which is all the renderer needs); `rehydrate` rebuilds lightweight float matrices.
 */

import { analyzeDiscreteness } from './engine.js';
import { analyzeDiscretenessNF } from './engineNF.js';
import { buildDomain } from './domain.js';
import { poincareCertify } from './poincare.js';

export function computeAnalysis(mats, opts = {}) {
    const isNF = !!(mats[0] && mats[0].field);            // Mat2NF carries a .field
    const res = isNF ? analyzeDiscretenessNF(mats, opts.analyze) : analyzeDiscreteness(mats, opts.analyze);
    let domain = null;
    if (res.verdict !== 'non-discrete') {
        try {
            domain = buildDomain(mats, opts.domain || { maxWord: 9, maxEl: isNF ? 400 : 600 });
            const cert = poincareCertify(domain);
            domain.cert = cert;
            res.presentation = cert.presentation;
            res.cert = cert;
            if (cert.certified && (res.verdict === 'inconclusive' || res.kind === 'budget' || res.kind === 'near-identity')) {
                res.verdict = 'discrete'; res.exact = true; res.kind = 'poincare';
                res.reason = `Poincaré's polygon theorem certifies discreteness: a finite-sided fundamental domain (${domain.faceCount} sides) with consistent side-pairings, and every vertex cycle closes up (cone angles 2π/order, cusps parabolic).`;
            }
        } catch (e) { /* domain is best-effort; verdict stands */ }
    }
    return { res, domain };
}

// ---------- serialization (matrices → real-embedding floats; works for Mat2Q & Mat2NF) ----------
const matWire = m => m.floats();
const clsWire = c => c ? {
    kind: c.kind, orientationReversing: !!c.orientationReversing,
    order: (c.order === Infinity ? null : c.order ?? null), infiniteOrder: !!c.infiniteOrder,
    tStr: c.t ? c.t.toString() : null, tLatex: c.t ? c.t.toLatex() : null,
} : null;

function witnessWire(w) {
    if (!w) return null;
    return {
        wordStr: w.wordStr || '', cls: clsWire(w.cls),
        angleDeg: w.angleDeg ?? null, angleOverPi: w.angleOverPi ?? null,
        translationLength: w.translationLength ?? null, dist: w.dist ?? null,
        matLatex: w.mat ? w.mat.toLatex() : null, mat: w.mat ? matWire(w.mat) : null,
    };
}

function domainWire(d) {
    if (!d) return null;
    const cyc = (d.cert && d.cert.cycles) || [];
    return {
        basepointUhp: d.basepointUhp,
        vertices: d.vertices.map(v => ({ uhp: { x: v.uhp.x, y: v.uhp.y }, ideal: !!v.ideal })),
        sides: d.sides.map(s => ({ vtxA: s.vtxA, vtxB: s.vtxB, color: s.color, paired: !!s.paired })),
        boundaryIdx: d.boundaryIdx,
        tileMats: (d.tileMats || []).map(matWire),
        faceCount: d.faceCount, elementCount: d.elementCount, allPaired: !!d.allPaired,
        cert: d.cert ? {
            certified: !!d.cert.certified,
            reasons: d.cert.reasons || [],
            cones: cyc.filter(c => c.kindLabel === 'cone').map(c => c.order),
            cusps: cyc.filter(c => c.kindLabel === 'cusp').length,
            cycles: cyc.map(c => ({ kindLabel: c.kindLabel, order: c.order === Infinity ? null : c.order, verts: c.verts })),
        } : null,
    };
}

export function toWire({ res, domain }) {
    return {
        verdict: res.verdict, exact: !!res.exact, kind: res.kind, reason: res.reason, field: res.field || null,
        minJorgensen: res.minJorgensen ?? null, elementCount: res.elementCount ?? null, explored: res.explored ?? null,
        presentation: res.presentation || null,
        generators: (res.generators || []).map(g => ({ index: g.index, label: g.label, mat: matWire(g.mat), cls: clsWire(g.cls) })),
        witness: witnessWire(res.witness),
        domain: domainWire(domain),
    };
}

/** Lightweight float matrix for the renderer (the only methods view.js uses). */
export class Mat2Float {
    constructor(f) { this.a = f.a; this.b = f.b; this.c = f.c; this.d = f.d; }
    floats() { return { a: this.a, b: this.b, c: this.c, d: this.d }; }
    isometricCircle() {
        const { a, b, c, d } = this;
        if (Math.abs(c) < 1e-12) return null;
        const det = a * d - b * c;
        return { cx: -d / c, r: Math.sqrt(Math.abs(det)) / Math.abs(c) };
    }
    boundaryFixedPoints() {
        const { a, b, c, d } = this;
        if (Math.abs(c) < 1e-12) return Math.abs(a - d) < 1e-12 ? [Infinity] : [b / (a - d), Infinity];
        const disc = (a - d) * (a - d) + 4 * b * c;
        if (disc < 0) return [];
        const s = Math.sqrt(disc);
        return [((a - d) - s) / (2 * c), ((a - d) + s) / (2 * c)];
    }
    ellipticFixedPoint() {
        const { a, b, c, d } = this;
        if (Math.abs(c) < 1e-12) return null;
        const disc = (a - d) * (a - d) + 4 * b * c;
        if (disc >= 0) return null;
        return { re: (a - d) / (2 * c), im: Math.sqrt(-disc) / (2 * Math.abs(c)) };
    }
}

export function rehydrate(wire) {
    const M = f => new Mat2Float(f);
    const res = { ...wire };
    res.generators = (wire.generators || []).map(g => ({ ...g, mat: M(g.mat) }));
    if (wire.witness) res.witness = { ...wire.witness, mat: wire.witness.mat ? M(wire.witness.mat) : null };
    if (wire.domain) {
        res.domain = { ...wire.domain, tileMats: (wire.domain.tileMats || []).map(M) };
        res.cert = wire.domain.cert || null;
    } else { res.domain = null; res.cert = null; }
    return res;
}
