/**
 * Fill the database: every pair of bounded height through the pipeline.
 *
 *   node batch/run.mjs --bound 3 [--jobs 12] [--timeout 600] [--limit N]
 *                      [--beam-seconds 60] [--rerun open,timeout,error]
 *                      [--stab-sizes 24,48,80] [--harvest-seconds 30] [--max-reps 96] [--beam 3000]
 *                      [--from-why stab-not-lattice,no-covering]
 *   node batch/run.mjs --bound 7 --sample 500 [--seed 1]
 *   node batch/run.mjs --bound 5 --sample 50 --gens 3   (k-generated: random k-tuples, batch/enumerate.mjs sampleTuples)
 *   node batch/run.mjs --bound 4 --min-bound 3          (only the new shell 3 < σ₁ ≤ 4)
 *   [--skip-decided]  leave out pairs already decided under earlier settings
 *   [--tc-seconds 10 --tc-cosets 5000000]  the exact index budget
 *   [--orbit-seconds 60 --orbit-graph 20000000]  the vertex-orbit budget (orbits.js, over ℚ): time, live Stallings vertices
 *   [--groups]  one pair per canonical group (database/groups.json from batch/groups.mjs), none for decided groups
 *
 * --sample N  N pairs drawn uniformly from the symmetry classes with σ₁ ≤ B
 *             (enumerate.mjs samplePairs), recorded in database/samples.json
 *             as the data set "random-B<B>-N<N>-seed<S>" for the page.
 *
 * --bound B   pairs with max(σ₁(g₁), σ₁(g₂)) ≤ B, i.e. both heights ≤ log B
 * Results are appended to database/results.jsonl, one line per pair, as they
 * finish; a pair already there with the same settings is skipped, so a run can
 * be stopped and resumed. --rerun drops earlier lines with those verdicts and
 * runs those pairs again.
 *
 * Raised budgets: --stab-sizes, --harvest-seconds and --beam-seconds change the
 * settings (and so the tag); with --from-why only the pairs whose latest
 * record is undetermined for one of those reasons are run. The database page
 * shows the latest record of each pair.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairsUpTo, samplePairs, sampleTuples, sigma1 } from './enumerate.mjs';
import { DEFAULTS, STAB_DEFAULTS, PIPELINE_VERSION } from './pipeline.mjs';
import { parseCliArgs, defaultJobs, writeFileAtomic, runWorkerPool } from './workerPool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(here, '..', 'database', 'results.jsonl');

const ALLOWED = new Set([
    'bound', 'min-bound', 'jobs', 'timeout', 'limit', 'sample', 'seed', 'gens',
    'beam-seconds', 'seconds', 'max-reps', 'tc-cosets', 'no-flashbeam', 'tc-seconds',
    'beam', 'stab-sizes', 'harvest-seconds', 'orbit-seconds', 'orbit-graph',
    'rerun', 'from-why', 'groups', 'keys', 'skip-decided',
]);
const USAGE = 'Usage: node batch/run.mjs --bound B [--jobs N] [--timeout S] [--sample N --seed S --gens K] [--rerun open,timeout] [--skip-decided] [--groups]';
const opt = parseCliArgs(process.argv.slice(2), { allowed: ALLOWED, usage: USAGE });
const bound = Number(opt.bound || 3);
const jobs = Number(opt.jobs || defaultJobs());
const timeoutS = Number(opt.timeout || 600);
const settings = { ...DEFAULTS };
if (opt['beam-seconds']) settings.beamSeconds = Number(opt['beam-seconds']);
if (opt.seconds) settings.seconds = Number(opt.seconds);
if (opt['max-reps']) settings.maxReps = Number(opt['max-reps']);
if (opt['tc-cosets']) settings.tcCosets = Number(opt['tc-cosets']);
if (opt['no-flashbeam']) settings.flashbeam = false;
if (opt['tc-seconds']) settings.tcSeconds = Number(opt['tc-seconds']);
if (opt.beam) settings.beam = Number(opt.beam);
if (opt['stab-sizes']) settings.stabSizes = String(opt['stab-sizes']).split(',').map(Number);
if (opt['harvest-seconds']) settings.harvestSeconds = Number(opt['harvest-seconds']);
if (opt['orbit-seconds']) settings.orbitSeconds = Number(opt['orbit-seconds']);
if (opt['orbit-graph']) settings.orbitGraph = Number(opt['orbit-graph']);
const tag = `${PIPELINE_VERSION}|${JSON.stringify(settings)}`;
const raised = Object.keys(settings).some((k) => !(k in DEFAULTS)) || Object.entries(DEFAULTS).some(([k, v]) => settings[k] !== v);
const fromWhy = typeof opt['from-why'] === 'string' ? new Set(opt['from-why'].split(',')) : null;

// what is already there
fs.mkdirSync(path.dirname(DB), { recursive: true });
const rerun = new Set(typeof opt.rerun === 'string' ? opt.rerun.split(',') : []);
const done = new Set();
const latest = new Map();
if (fs.existsSync(DB)) {
    const keep = [];
    for (const line of fs.readFileSync(DB, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (r.tag === tag && rerun.has(r.verdict)) continue;
        keep.push(line);
        if (r.tag === tag) done.add(r.key);
        const old = latest.get(r.key);
        if (!old || r.at > old.at) latest.set(r.key, r);
    }
    if (rerun.size) writeFileAtomic(DB, keep.map((l) => l + '\n').join(''));
}

const SAMPLES = path.join(here, '..', 'database', 'samples.json');
let all;
let setName = null;
if (opt.sample) {
    const n = Number(opt.sample), seed = Number(opt.seed || 1), k = Number(opt.gens || 2);
    setName = k === 2 ? `random-B${bound}-N${n}-seed${seed}` : `random-B${bound}-N${n}-k${k}-seed${seed}`;
    all = k === 2 ? samplePairs(bound, n, seed) : sampleTuples(bound, n, k, seed);
    let sets = [];
    try { sets = JSON.parse(fs.readFileSync(SAMPLES, 'utf8')); } catch (e) { /* first sample */ }
    sets = sets.filter((x) => x.name !== setName);
    sets.push({ name: setName, bound, n, seed, keys: all.map((p) => p.key), at: new Date().toISOString() });
    writeFileAtomic(SAMPLES, JSON.stringify(sets, null, 1));
} else {
    all = pairsUpTo(bound);
}
let queue = all.filter((p) => !done.has(p.key));
// --groups: one pair per canonical group (database/groups.json, from batch/groups.mjs: conjugation by
// PGL₂(ℤ) and Nielsen moves), its reduced representative, and none for a group that a member decides
if (opt.groups) {
    const G = JSON.parse(fs.readFileSync(path.join(here, '..', 'database', 'groups.json'), 'utf8')).groups;
    const classOf = new Map();
    for (const [gk, g] of Object.entries(G)) for (const m of g.members) classOf.set(m, gk);
    const decidedClass = new Set();
    for (const [k, r] of latest) if (!['open', 'timeout', 'error'].includes(r.verdict) && classOf.has(k)) decidedClass.add(classOf.get(k));
    const byKey = new Map(all.map((p) => [p.key, p]));
    const picked = new Map();
    for (const p of queue) {
        const gk = classOf.get(p.key) ?? p.key;
        if (decidedClass.has(gk) || picked.has(gk)) continue;
        picked.set(gk, byKey.get(gk) && !done.has(gk) ? byKey.get(gk) : p);     // the reduced pair when it is listed
    }
    queue = [...picked.values()];
}
// --keys FILE: only these pairs (one key per line)
if (typeof opt.keys === 'string') { const want = new Set(fs.readFileSync(opt.keys, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean)); queue = queue.filter((p) => want.has(p.key)); }
// --skip-decided: leave out pairs whose latest record (under any settings) already has a verdict
if (opt['skip-decided']) queue = queue.filter((p) => { const r = latest.get(p.key); return !r || ['open', 'timeout', 'error'].includes(r.verdict); });
// --min-bound A: only the pairs whose larger generator has σ₁ > A (a new shell of heights)
if (opt['min-bound']) queue = queue.filter((p) => Math.max(...p.g.map(sigma1)) > Number(opt['min-bound']) + 1e-9);
if (fromWhy) queue = queue.filter((p) => { const r = latest.get(p.key); return r && r.verdict === 'open' && fromWhy.has(r.why); });
if (opt.limit) queue = queue.slice(0, Number(opt.limit));
const total = queue.length;
console.log(`${setName ? `${setName}: ` : ''}σ₁ ≤ ${bound}: ${total} pairs to run (${done.size} already in the database), ${jobs} workers, ${timeoutS} s per pair.`);
if (!total) process.exit(0);

const out = fs.openSync(DB, 'a');
const counts = {};
let finished = 0, next = 0;
const t0 = Date.now();

function record(p, r) {
    const line = {
        key: p.key, g: p.g, h: p.h.map((x) => +x.toFixed(6)), hmax: +p.hmax.toFixed(6),
        s1: p.g.map((m) => +sigma1(m).toFixed(6)), tag, budget: raised ? 'raised' : 'default', ...(setName ? { set: setName } : {}), at: new Date().toISOString(), ...r,
    };
    fs.writeSync(out, JSON.stringify(line) + '\n');
    counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    finished++;
    if (finished % 25 === 0 || finished === total || r.verdict === 'open' || r.verdict === 'timeout') {
        const el = (Date.now() - t0) / 1000;
        const c = Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ');
        const extra = r.verdict === 'open' || r.verdict === 'timeout' ? `  ← ${r.verdict}${r.why ? ` (${r.why})` : ''}: ${p.key}` : '';
        console.log(`[${finished}/${total} ${el.toFixed(0)}s] ${c}${extra}`);
    }
}

runWorkerPool({
    workerUrl: new URL('./groupWorker.mjs', import.meta.url),
    items: queue,
    jobs,
    timeoutS,
    maxOldGenerationSizeMb: Math.max(4096, Math.ceil((settings.orbitGraph ?? 0) * 160 / 1e6)),
    toMessage: (p) => ({ state: { mats: p.g.map((m) => m.map(String)), anti: p.g.map(() => false), consts: [] }, settings }),
    onResult: (p, m) => record(p, m.error ? { verdict: 'error', why: 'crash', error: m.error } : m.result),
    onTimeout: (p) => record(p, { verdict: 'timeout', why: 'timeout', error: `no answer after ${timeoutS} s` }),
    onCrash: (p, e) => record(p, { verdict: 'error', why: 'crash', error: e.message }),
    onDone: () => {
        fs.closeSync(out);
        console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
        process.exit(0);
    },
});
