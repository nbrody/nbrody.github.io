/**
 * Presentations for the S-arithmetic groups of the database:
 *  - over ℚ (results.jsonl): sarithPresentation.js presentationReport — Γ as a congruence subgroup
 *    (level, H₀, determinant classes) and a presentation by Reidemeister–Schreier on its coset table
 *    (coset enumeration, or else the action read off from the congruence description), every relator
 *    checked. Written to database/presentations.jsonl.
 *  - over number fields (--nf, results-nf.jsonl): Bianchi (bianchiPresentation.js), Voronoi arithmetic
 *    (numberRingPresentation.js), definite/1-split quaternion (quaternionPresentation.js), or descended-to-ℚ
 *    records, written to database/presentations-nf.jsonl.
 *
 *   node batch/presentations.mjs [--jobs N] [--timeout 120] [--max-index 2000] [--limit N] [--redo]
 *                                [--keys FILE] [--nf]
 *
 * A pair already there with this PRESENTATION_VERSION is skipped (--redo recomputes all).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, polyText } from '../js/fields.js';
import { bianchiRing } from '../js/bianchi.js';
import { numberRingApplies } from '../js/numberRingIndex.js';
import { parseCliArgs, defaultJobs, runWorkerPool } from './workerPool.mjs';

export const PRESENTATION_VERSION = '2026-11-16a';

const here = path.dirname(fileURLToPath(import.meta.url));
const USAGE = `
Usage: node batch/presentations.mjs [--nf] [--jobs N] [--timeout SEC] [--max-index N]
                                    [--limit N] [--redo] [--keys FILE]
`;

const ringOf = (r) => (r.field && FIELDS[r.field] ? bianchiRing(polyText(FIELDS[r.field].poly)) : null);

function nfJobFor(r, maxIndex) {
    if (r.descended && r.descended.mats && r.degree === 1) {
        const J = r.congruenceClosure;
        return {
            kind: 'Q',
            rows: r.descended.mats.map((m) => m.map(String)),
            S: (r.sarith && r.sarith.S) || (r.arith && r.arith.S) || [],
            levels: J && J.levels && (J.status === 'exact' || J.status === 'lower') ? J.levels : null,
            maxIndex,
        };
    }
    const F = r.field && FIELDS[r.field];
    if (!F) return null;
    const polySrc = polyText(F.poly);
    const rows = r.g.map((m) => m.map(String));
    const hasS = !!((r.sarith && r.sarith.S && r.sarith.S.length) || (r.arith && r.arith.S && r.arith.S.length));
    const d = ringOf(r);
    if (d && hasS) return { kind: 'bianchi', d, polySrc, rows, maxIndex };
    if (!hasS && numberRingApplies(polySrc)) return { kind: 'numberRing', polySrc, rows, maxIndex };
    if (hasS || (r.sarith && r.sarith.quaternion)) {
        return { kind: 'quaternion', poly: F.poly, polySrc, root: F.root, rows, maxIndex };
    }
    return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const opt = parseCliArgs(process.argv.slice(2), {
        allowed: new Set(['nf', 'jobs', 'timeout', 'max-index', 'limit', 'redo', 'keys']),
        usage: USAGE,
    });
    const NF = !!opt.nf;
    const DB = path.join(here, '..', 'database', NF ? 'results-nf.jsonl' : 'results.jsonl');
    const OUT = path.join(here, '..', 'database', NF ? 'presentations-nf.jsonl' : 'presentations.jsonl');
    const jobs = Number(opt.jobs || defaultJobs());
    const timeoutS = Number(opt.timeout || 120);
    const maxIndex = Number(opt['max-index'] || 2000);

    // the record of each pair the database page shows: the latest, except that a decided one is
    // never hidden by a later undecided one
    const UNDETERMINED = new Set(['open', 'timeout', 'error']);
    const decided = (r) => !UNDETERMINED.has(r.verdict);
    const latest = new Map();
    for (const line of fs.readFileSync(DB, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
            const r = JSON.parse(line), old = latest.get(r.key);
            if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) latest.set(r.key, r);
        } catch (e) { /* a line being written */ }
    }
    const done = new Set();
    if (!opt.redo && fs.existsSync(OUT)) {
        for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
            if (!line.trim()) continue;
            try { const p = JSON.parse(line); if (p.v === PRESENTATION_VERSION) done.add(p.key); } catch (e) { /* skip */ }
        }
    }
    const only = typeof opt.keys === 'string' ? new Set(fs.readFileSync(opt.keys, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)) : null;
    let queue = [...latest.values()].filter((r) => (
        r.verdict === 'sarith'
        && (NF ? nfJobFor(r, maxIndex) !== null : r.degree === 1)
        && (only ? only.has(r.key) : !done.has(r.key))
    ));
    // smallest index first: those are quick, and the page has them soonest
    const size = (r) => r.sarith?.index ?? r.congruenceClosure?.index ?? Infinity;
    queue.sort((a, b) => size(a) - size(b));
    if (opt.limit) queue = queue.slice(0, Number(opt.limit));
    const total = queue.length;
    console.log(`${total} S-arithmetic pairs to present (${done.size} already done), ${jobs} workers, ${timeoutS} s each, index ≤ ${maxIndex}.`);
    if (!total) process.exit(0);

    const out = fs.openSync(OUT, 'a');
    const t0 = Date.now();
    let finished = 0;
    const counts = {};
    const record = (r, p) => {
        fs.writeSync(out, JSON.stringify({ key: r.key, v: PRESENTATION_VERSION, at: new Date().toISOString(), ...p }) + '\n');
        finished++;
        const c = p.error ? 'error' : p.pres && p.pres.error ? (/above the limit/.test(p.pres.error) ? 'too large' : 'no table') : p.pres && p.pres.tableFrom === 'congruence' ? 'presented (congruence table)' : 'presented';
        counts[c] = (counts[c] || 0) + 1;
        if (finished % 50 === 0 || finished === total) console.log(`[${finished}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    };

    runWorkerPool({
        workerUrl: new URL('./presentationWorker.mjs', import.meta.url),
        items: queue,
        jobs,
        timeoutS,
        skip: (r) => {
            if (size(r) !== Infinity && size(r) > maxIndex) {
                record(r, { S: (r.sarith && r.sarith.S) || (r.arith && r.arith.S) || [], pres: { error: `[Λ : Γ] = ${size(r)} is above the limit ${maxIndex} for a presentation`, index: size(r) } });
                return true;
            }
            return false;
        },
        toMessage: (r) => {
            if (NF) return nfJobFor(r, maxIndex);
            const J = r.congruenceClosure;
            return {
                kind: 'Q',
                rows: r.g.map((m) => m.map(String)),
                S: (r.sarith && r.sarith.S) || r.arith.S,
                levels: J && J.levels && (J.status === 'exact' || J.status === 'lower') ? J.levels : null,
                maxIndex,
            };
        },
        onResult: (r, m) => record(r, m.error ? { error: m.error } : m.result),
        onCrash: (r, e) => record(r, { error: e.message }),
        onTimeout: (r) => record(r, { error: `no answer after ${timeoutS} s` }),
        onDone: () => {
            fs.closeSync(out);
            console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
            process.exit(0);
        },
    });
}
