/**
 * One worker thread of batch/presentations.mjs: presentationReport on one record (over ℚ, Bianchi,
 * Voronoi number-ring arithmetic, or quaternion S-arithmetic), made compact for the database.
 */
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { presentationReport } from '../js/sarithPresentation.js';
import { presentationReportBianchi } from '../js/bianchiPresentation.js';
import { wordMatrices } from '../js/bianchi.js';
import { ringPresentation } from '../js/numberRingIndex.js';
import { presentationReportNumberRing } from '../js/numberRingPresentation.js';
import { quaternionPresentation } from '../js/quaternionPresentation.js';

const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.NumberRingEngine = require('../../Algebraic/Tools/numberRings/ringEngine.js');
globalThis.PGL2Engine = require('../../Algebraic/Tools/zariskiClosure/pgl2Engine.js');
globalThis.ExprEngine = require('../../Algebraic/Tools/expressionParser/exprEngine.js');
const ZariskiInput = require('../../Algebraic/Tools/zariskiClosure/zariskiInput.js');

const MAX_LETTERS = 4000;
const ringCache = new Map();

export function compact(R) {
    const out = { S: R.S, ms: R.ms };
    if (R.kind) out.kind = R.kind;
    if (R.ring) { out.ring = R.ring; out.ringName = R.ringName; }
    const P = R.pres;
    if (P.error) out.pres = { error: P.error, index: P.index ?? null };
    else {
        let rels = P.relators, total = 0, cut = rels.length;
        for (let i = 0; i < rels.length; i++) { total += rels[i].length; if (total > MAX_LETTERS) { cut = i; break; } }
        out.pres = {
            index: P.index,
            tableFrom: P.tableFrom,
            kernelIndex: P.kernelIndex,
            conjugatedAt: P.conjugatedAt,
            ...(P.route ? { route: P.route } : {}),
            ...(P.hFrom ? { hFrom: P.hFrom } : {}),
            ...(P.pruned ? { pruned: P.pruned } : {}),
            gens: P.gens.map((g) => (g.given === null ? { name: g.name, given: null, M: g.M } : { name: g.name, given: g.given })),
            relators: rels.slice(0, cut),
            nRelators: rels.length,
            gamma: (P.gamma || []).map((w) => (w && w.length <= 60 ? w : null)),
            onGiven: P.onGiven,
            rs: P.rs,
            abelian: P.abelian,
            ms: P.ms,
        };
    }
    if (R.cong) out.cong = R.cong;
    return out;
}

parentPort.on('message', ({ kind = 'Q', d, poly, polySrc, root, rows, S, levels, maxIndex }) => {
    try {
        if (kind === 'bianchi') {
            const gens = wordMatrices(d, rows, rows.map((_, i) => [i + 1]), polySrc);
            if (!gens) throw new Error('the entries are not in the ring');
            parentPort.postMessage({ result: compact(presentationReportBianchi(d, gens, { maxIndex, seconds: 20 })) });
            return;
        }
        if (kind === 'numberRing') {
            let L = ringCache.get(polySrc);
            if (!L) {
                L = ringPresentation(polySrc, { seconds: 120 });
                if (!L.error) ringCache.set(polySrc, L);
            }
            parentPort.postMessage({ result: compact(presentationReportNumberRing(polySrc, rows, { maxIndex, seconds: 20, presentation: L })) });
            return;
        }
        if (kind === 'quaternion') {
            const z = ZariskiInput.analyze({
                gens: rows,
                consts: [],
                field: { gen: 'w', poly: polySrc, root },
            });
            if (!z || !z.ok || !z.arith) throw new Error(z && z.error ? z.error : 'Zariski analysis failed');
            const A = z.arith;
            const opts = {
                field: A.k.d > 1 ? { minpoly: A.k.minpoly, P: A.k.P } : null,
                ram: A.A.ram.filter((r) => r.kind === 'finite').map((r) => ({ p: r.p, e: r.e, f: r.f, H: r.H })),
                maxIndex,
                seconds: 20,
            };
            const Sfull = A.ring.S.map((s) => ({ p: s.p, e: s.e, f: s.f, H: s.H }));
            const P = quaternionPresentation(rows, poly.map(BigInt), Sfull, opts);
            const R = { kind: 'quaternion', S: P.S || A.ring.S.map((s) => s.p), ms: P.ms ?? null, pres: P };
            parentPort.postMessage({ result: compact(JSON.parse(JSON.stringify(R, (k, v) => (typeof v === 'bigint' ? String(v) : v)))) });
            return;
        }
        parentPort.postMessage({ result: compact(presentationReport(rows, S, { levels, maxIndex, seconds: 20, graph: true })) });
    }
    catch (e) { parentPort.postMessage({ error: e && e.message ? e.message : String(e) }); }
});
parentPort.postMessage({ ready: true });
