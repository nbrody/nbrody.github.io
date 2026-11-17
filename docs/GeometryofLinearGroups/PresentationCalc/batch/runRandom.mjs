/**
 * The random model (js/randomGroup.js, the die on the page) through the pipeline: N seeded draws
 * of a random finitely generated subgroup of PGL₂ over a number field, appended to
 * database/results-random.jsonl, one line per group. Resumable: a draw already there with the same
 * settings is skipped.
 *
 *   node batch/runRandom.mjs --n 200 [--seed 1] [--jobs 12] [--timeout 600] [--beam-seconds 60]
 *                            [--keys FILE] [--rerun open,timeout,error]
 *
 * Keys are "<seed>:<index>" (the draw), and each record carries the field and the generators as
 * the page reads them, so that the group can be opened in the calculator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomGroup } from '../js/randomGroup.js';
import { DEFAULTS, PIPELINE_VERSION } from './pipeline.mjs';
import { parseCliArgs, defaultJobs, writeFileAtomic, runWorkerPool } from './workerPool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(here, '..', 'database', 'results-random.jsonl');

const ALLOWED = new Set(['n', 'seed', 'jobs', 'timeout', 'beam-seconds', 'seconds', 'keys', 'rerun']);
const opt = parseCliArgs(process.argv.slice(2), { allowed: ALLOWED, usage: 'Usage: node batch/runRandom.mjs --n 200 [--seed 1] [--jobs N] [--timeout S] [--rerun open,timeout,error]' });
const n = Number(opt.n || 100), seed = Number(opt.seed || 1);
const jobs = Number(opt.jobs || defaultJobs());
const timeoutS = Number(opt.timeout || 600);
const settings = { ...DEFAULTS };
if (opt['beam-seconds']) settings.beamSeconds = Number(opt['beam-seconds']);
if (opt.seconds) settings.seconds = Number(opt.seconds);
const tag = `${PIPELINE_VERSION}|${JSON.stringify(settings)}`;
const setName = `random-model-seed${seed}`;

/** mulberry32: the draws depend only on the seed */
function rng(s) {
    let a = s >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(seed);
const draws = [];
for (let i = 0; i < n; i++) {
    const G = randomGroup(rand);
    draws.push({ key: `${seed}:${i}`, index: i, ...G });
}

const rerun = new Set(typeof opt.rerun === 'string' ? opt.rerun.split(',') : []);
const done = new Set();
if (fs.existsSync(DB)) {
    const keep = [];
    for (const line of fs.readFileSync(DB, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (r.tag === tag && rerun.has(r.verdict)) continue;
        keep.push(line);
        if (r.tag === tag) done.add(r.key);
    }
    if (rerun.size) writeFileAtomic(DB, keep.map((l) => l + '\n').join(''));
}
let queue = draws.filter((d) => !done.has(d.key));
if (typeof opt.keys === 'string') { const want = new Set(fs.readFileSync(opt.keys, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)); queue = queue.filter((d) => want.has(d.key)); }
const total = queue.length;
console.log(`${setName}: ${n} draws, ${total} to run (${n - total} already in the database), ${jobs} workers, ${timeoutS} s each.`);
if (!total) process.exit(0);

const out = fs.openSync(DB, 'a');
const counts = {};
let finished = 0;
const t0 = Date.now();

function record(d, r) {
    const line = {
        key: d.key, set: setName, field: d.field, degree: d.degree, consts: d.consts, mats: d.mats, k: d.mats.length,
        scope: d.scope, label: d.label, tag, at: new Date().toISOString(), ...r,
    };
    fs.writeSync(out, JSON.stringify(line) + '\n');
    counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    finished++;
    const el = (Date.now() - t0) / 1000;
    const c = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
    const extra = ['open', 'timeout', 'error'].includes(r.verdict) ? `  ← ${r.verdict}${r.why ? ` (${r.why})` : ''}: ${d.key} ${d.label}` : '';
    if (finished % 10 === 0 || finished === total || extra) console.log(`[${finished}/${total} ${el.toFixed(0)}s] ${c}${extra}`);
}

runWorkerPool({
    workerUrl: new URL('./groupWorker.mjs', import.meta.url),
    items: queue,
    jobs,
    timeoutS,
    maxOldGenerationSizeMb: 4096,
    toMessage: (d) => ({ state: { mats: d.mats, anti: d.mats.map(() => false), consts: d.consts }, settings }),
    onResult: (d, m) => record(d, m.error ? { verdict: 'error', why: 'crash', error: m.error } : m.result),
    onTimeout: (d) => record(d, { verdict: 'timeout', why: 'timeout', error: `no answer after ${timeoutS} s` }),
    onCrash: (d, e) => record(d, { verdict: 'error', why: 'crash', error: e.message }),
    onDone: () => {
        fs.closeSync(out);
        console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        process.exit(0);
    },
});
