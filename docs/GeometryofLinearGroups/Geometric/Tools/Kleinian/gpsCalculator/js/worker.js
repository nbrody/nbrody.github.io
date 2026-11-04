// worker.js — runs the whole computation off the main thread and returns a
// plain, structured-clonable view of the result.

import { analyze, parseForm, parseVector } from './gps.js';
import { pieceRecords } from './glue.js';
import { bil } from './linalg.js';
import { rightAngledWalls } from './chamber.js';
import { findPartners, chamberOfForm } from './partners.js';

let stopPartners = false;

self.onmessage = ev => {
    const { id, input, job } = ev.data;
    const post = (type, payload) => self.postMessage({ id, type, ...payload });
    if (job === 'stop-partners') { stopPartners = true; return; }
    if (job === 'chamber') {
        try {
            const A = parseForm(input.formText);
            const v = parseVector(input.vText, A.length);
            const c = chamberOfForm(A, input.vinbergMs || 20000, v, input.lattice || 'auto');
            if (!c.ok) post('fail', { reason: c.why });
            else post('result', { view: c.rec });
        } catch (e) { post('error', { message: e.message || String(e) }); }
        return;
    }
    if (job === 'partners') {
        stopPartners = false;
        try {
            findPartners(input.chamber, {
                amin: input.amin, amax: input.amax, perFormMs: input.perFormMs,
                onResult: r => post('partner', { result: r }),
                shouldStop: () => stopPartners,
            });
            post('result', { view: null });
        } catch (e) { post('error', { message: e.message || String(e) }); }
        return;
    }
    try {
        const A = parseForm(input.formText);
        const v = parseVector(input.vText, A.length);
        const res = analyze({ ...input, A, v }, {
            onProgress: p => post('progress', { progress: p }),
            vinbergMs: input.vinbergMs, cap: input.cap,
        });
        if (!res.ok) { post('fail', { reason: res.reason, stage: res.stage, lattice: plainLattice(res.lattice) }); return; }
        post('result', { view: viewModel(res, input) });
    } catch (e) {
        post('error', { message: e.message || String(e) });
    }
};

function plainLattice(L) {
    if (!L) return null;
    const { A, m, n, v, fv, Lb, gH, rootGiven, mode, M, AL, vL, D, HL, p0 } = L;
    return { A, m, n, v, fv, Lb, gH, rootGiven, mode, M, AL, vL, D, HL, p0 };
}

function viewModel(res, input) {
    const { P, cover, lattice: L } = res;
    const k = P.k, order = cover.order, ngen = cover.ngen;
    // render tables
    const R = new Int32Array(order * k);
    for (let g = 0; g < order; g++) for (let j = 0; j < k; j++) R[g * k + j] = cover.G.R[g * ngen + j];
    const mark = new Uint8Array(order * k);
    const cls = new Set(res.mirrorClass);
    const NONE = 0x7fffffff;
    for (let g = 0; g < order; g++) for (let j = 0; j < k; j++) {
        const c = cover.sigmaComp[cover.canon(g, j)];
        if (c !== NONE) { const comp = c >= 0 ? c : ~c; mark[g * k + j] = comp === 0 ? 1 : 2; }
        else if (cls.has(j)) mark[g * k + j] = 3;
    }
    const fr = P.frame;
    const walls = P.roots.map((e, j) => {
        const s = Math.sqrt(P.norms[j]);
        const w = fr.map(u => bil(P.A, u, e) / s);
        // standard coordinates (spacelike…, time): w_i = B(u_i, e), w_t = −B(u_0, e)
        return [...w.slice(1), -w[0]];
    });
    const surfaces = cover.surfaces;
    const boundary = [...res.boundary.values()].map(b => ({
        wall: b.wall, root: b.root, rootOrig: b.rootOrig, basisOrig: b.basisOrig, gH: b.gH,
        gens: b.gens.map(M => M.map(r => r.map(x => x.toString()))), surface: b.surface,
    }));
    return {
        ms: res.ms, input,
        lattice: plainLattice(L),
        poly: {
            n: P.n, k, roots: P.roots, norms: P.norms, coxM: P.coxM, gram: P.gram,
            ultra: P.label.map(r => r.map(l => (l && l.m === -1 ? l.cosh : null))),
            vertices: P.vertices.map(v => ({ r: v.r, walls: v.walls, ideal: v.ideal })),
            volume: P.volume, chi: P.chi, consistent: P.consistent,
            faceAreas: P.faceData ? P.faceData.map(F => F.area) : null,
        },
        sym: res.sym.length, i0: res.i0, mirrorClass: res.mirrorClass, rightAngled: rightAngledWalls(P.coxM),
        formInfo: res.formInfo, origInfo: res.origInfo, hypInfo: res.hypInfo,
        cover: {
            N: cover.N, order, nSym: cover.nSym, tiles: cover.tiles, nPieces: cover.nPieces,
            pieces: cover.pieces, edges: cover.edges, cusps: cover.cusps, surfaces,
            certificates: cover.certificates, comps: cover.comps.length,
        },
        boundary,
        records: pieceRecords(res, labelFor(input)),
        render: { n: P.n, k, walls, R, pieceOf: cover.pieceOf, mark, order, i0: res.i0 },
    };
}

function labelFor(input) {
    const tidy = t => String(t).replace(/\s+/g, '').replace(/-/g, '−').replace(/,/g, ', ').replace(/;/g, '; ');
    return `⟨${tidy(input.formText)}⟩, v = (${tidy(input.vText)}), N = ${input.N}${input.cut === 'fix' ? ', Fix(r_v)' : ''}`;
}
