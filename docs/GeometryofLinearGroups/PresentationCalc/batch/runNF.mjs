/**
 * The database over number fields: pairs of small height in PGL₂(K) (enumerateNF.mjs) through
 * the pipeline, appended to database/results-nf.jsonl, one line per pair. Resumable: a pair
 * already there with the same settings is skipped.
 *
 *   node batch/runNF.mjs --field i --bound 2.0 --sample 300 [--seed 1] [--coeff 2]
 *                        [--jobs 12] [--timeout 600] [--beam-seconds 30] [--keys FILE]
 *                        [--from-why stab-not-lattice,…]   only pairs whose latest record is open for these reasons
 *
 * Keys are "<field>:<pair key>", the pair key as in enumerateNF.mjs (projective, exact).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, polyText } from '../js/fields.js';
import { samplePairsNF, matTex } from './enumerateNF.mjs';
import { DEFAULTS, PIPELINE_VERSION } from './pipeline.mjs';
import { parseCliArgs, defaultJobs, runWorkerPool } from './workerPool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(here, '..', 'database', 'results-nf.jsonl');

const ALLOWED = new Set(['field', 'bound', 'sample', 'seed', 'coeff', 'jobs', 'timeout', 'beam-seconds', 'seconds', 'keys', 'from-why', 'limit']);
const opt = parseCliArgs(process.argv.slice(2), { allowed: ALLOWED, usage: 'Usage: node batch/runNF.mjs --field i --bound 2.0 --sample 300 [--seed 1] [--jobs N]' });
const field = String(opt.field || 'i'), F = FIELDS[field];
if (!F) { console.error(`unknown field ${field}: ${Object.keys(FIELDS).join(', ')}`); process.exit(1); }
const bound = Number(opt.bound || 2), n = Number(opt.sample || 300), seed = Number(opt.seed || 1), coeff = Number(opt.coeff || 2);
const jobs = Number(opt.jobs || defaultJobs());
const timeoutS = Number(opt.timeout || 600);
const settings = { ...DEFAULTS };
if (opt['beam-seconds']) settings.beamSeconds = Number(opt['beam-seconds']);
if (opt.seconds) settings.seconds = Number(opt.seconds);
const tag = `${PIPELINE_VERSION}|${JSON.stringify(settings)}`;
const setName = `${field}-B${bound}-N${n}-seed${seed}`;

const done = new Set(), latest = new Map();
if (fs.existsSync(DB)) for (const line of fs.readFileSync(DB, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.tag === tag) done.add(r.key);
    const o = latest.get(r.key); if (!o || r.at > o.at) latest.set(r.key, r);
}
const fromWhy = typeof opt['from-why'] === 'string' ? new Set(opt['from-why'].split(',')) : null;

const { elements, pairs } = samplePairsNF(F, bound, n, seed, coeff);
let queue = pairs.map((p) => ({ ...p, key: `${field}:${p.key}` })).filter((p) => !done.has(p.key));
if (fromWhy) queue = queue.filter((p) => { const r = latest.get(p.key); return r && ['open', 'timeout', 'error'].includes(r.verdict) && fromWhy.has(r.why); });
if (typeof opt.keys === 'string') { const want = new Set(fs.readFileSync(opt.keys, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)); queue = queue.filter((p) => want.has(p.key)); }
if (opt.limit) queue = queue.slice(0, Number(opt.limit));
const total = queue.length;
console.log(`${setName}: ${elements} elements, ${pairs.length} pairs; ${total} to run (${pairs.length - total} already in the database), ${jobs} workers, ${timeoutS} s per pair.`);
if (!total) process.exit(0);

const consts = [{ name: 'w', poly: polyText(F.poly), near: F.root }];
const out = fs.openSync(DB, 'a');
const counts = {};
let finished = 0;
const t0 = Date.now();

function record(p, r) {
    const line = { field, key: p.key, g: p.g.map(matTex), h: p.h.map((x) => +x.toFixed(6)), hmax: +p.hmax.toFixed(6), tag, set: setName, at: new Date().toISOString(), ...r };
    fs.writeSync(out, JSON.stringify(line) + '\n');
    counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    finished++;
    if (finished % 25 === 0 || finished === total || r.verdict === 'open' || r.verdict === 'timeout' || r.verdict === 'error') {
        const c = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
        const extra = ['open', 'timeout', 'error'].includes(r.verdict) ? `  ← ${r.verdict}${r.why ? ` (${r.why})` : ''}: ${p.g.map((m) => `(${matTex(m).join(', ')})`).join(' ')}` : '';
        console.log(`[${finished}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${c}${extra}`);
    }
}

runWorkerPool({
    workerUrl: new URL('./groupWorker.mjs', import.meta.url),
    items: queue,
    jobs,
    timeoutS,
    maxOldGenerationSizeMb: 4096,
    toMessage: (p) => ({ state: { mats: p.g.map(matTex), anti: [false, false], consts }, settings }),
    onResult: (p, m) => record(p, m.error ? { verdict: 'error', why: 'crash', error: m.error } : m.result),
    onTimeout: (p) => record(p, { verdict: 'timeout', why: 'timeout', error: `no answer after ${timeoutS} s` }),
    onCrash: (p, e) => record(p, { verdict: 'error', why: 'crash', error: e.message }),
    onDone: () => {
        fs.closeSync(out);
        console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
        process.exit(0);
    },
});
