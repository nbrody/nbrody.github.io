/**
 * Parameter tuning: run pairs through the pipeline under several named settings, each raising one
 * budget (or switching one strategy), and record which settings decide which pairs, and how fast.
 * The data is for finding which features of an input predict the settings that decide it.
 *
 *   node batch/tune.mjs --set random-B15-N100-seed1 [--undecided] [--configs tc,orbits,fb-long]
 *                       [--keys FILE] [--jobs 10] [--timeout 900]
 *
 * Writes database/tuning.jsonl, one line per (pair, config): { key, config, verdict, why, by, ms,
 * steps, … }; a (pair, config) already there under this PIPELINE_VERSION is skipped. A decided
 * record is also appended to results.jsonl (budget 'raised'), so the database page sees it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, PIPELINE_VERSION } from './pipeline.mjs';
import { sigma1 } from './enumerate.mjs';
import { parseCliArgs, runWorkerPool } from './workerPool.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(here, '..', 'database', 'results.jsonl');
const OUT = path.join(here, '..', 'database', 'tuning.jsonl');
const SAMPLES = path.join(here, '..', 'database', 'samples.json');

const USAGE = `
Usage: node batch/tune.mjs [--set NAME] [--keys FILE] [--undecided] [--configs c1,c2,...]
                           [--jobs N] [--timeout SEC]
`;

/** Each config raises one thing over DEFAULTS (see pipeline.mjs for where each setting is used). */
export const CONFIGS = {
    base: {},
    // coset enumeration in PGL₂(ℤ[1/S]) with a big budget; FlashBeam skipped (the vertex orbits still run)
    tc: { tcSeconds: 60, tcCosets: 20000000, flashbeam: false },
    // the vertex orbits on ∏T_p with a long budget; FlashBeam skipped
    orbits: { orbitSeconds: 240, flashbeam: false },
    // FlashBeam: longer, more representatives, a wider beam, the unit metric
    'fb-long': { beamSeconds: 300 },
    'fb-reps': { beamSeconds: 180, maxReps: 96 },
    'fb-wide': { beamSeconds: 180, maxReps: 96, beam: 5000, flash: 100 },
    'fb-unit': { beamSeconds: 180, maxReps: 96, metric: 'unit' },
    // the stabilizer check at ∞ after a covering: bigger samples of Γ_o
    stab: { stabSizes: [24, 48, 80], harvestSeconds: 30 },
};

/** How a record was decided: the step and method, as a short code. */
export function decidedBy(r) {
    if (r.verdict === 'sarith') {
        const s = r.sarith || {};
        if (s.status === 'index') return 'tc';
        if (s.status === 'orbits') return 'orbits';
        if (s.status === 'cusp') return 'cusp';
        if (s.status === 'congStab') return 'congStab';
        return s.stab ? 'covering+stab' : 'covering';
    }
    if (r.verdict === 'discrete') {
        const pl = (r.places || []).find((p) => p.status === 'discrete');
        return pl ? `discrete@${pl.kind === 'finite' ? 'p' : 'inf'}${pl.method ? `:${pl.method}` : ''}` : 'discrete';
    }
    if (r.verdict === 'thin') {
        if (r.thinCert && r.thinCert.method) return `thin:${r.thinCert.method}`;
        return `thin:${r.why || ''}`;
    }
    return r.verdict;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const opt = parseCliArgs(process.argv.slice(2), {
        allowed: new Set(['set', 'keys', 'undecided', 'configs', 'jobs', 'timeout']),
        usage: USAGE,
    });
    const jobs = Number(opt.jobs || 10), timeoutS = Number(opt.timeout || 900);
    const configs = (typeof opt.configs === 'string' ? opt.configs.split(',') : Object.keys(CONFIGS).filter((c) => c !== 'base'));
    for (const c of configs) if (!CONFIGS[c]) throw new Error(`unknown config ${c}: ${Object.keys(CONFIGS)}`);

    // the pairs: a sample set, or a key list; their latest records (decided over undecided)
    const UND = new Set(['open', 'timeout', 'error']);
    const latest = new Map();
    for (const line of fs.readFileSync(DB, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        let r; try { r = JSON.parse(line); } catch (e) { continue; }
        const o = latest.get(r.key);
        if (!o || (UND.has(r.verdict) === UND.has(o.verdict) ? r.at > o.at : !UND.has(r.verdict))) latest.set(r.key, r);
    }
    // Map keys to sample sets so `--keys` runs never drop `set` and corrupt the exhaustive σ₁ bound
    const sampleOfKey = new Map();
    if (fs.existsSync(SAMPLES)) {
        for (const s of JSON.parse(fs.readFileSync(SAMPLES, 'utf8'))) {
            for (const k of s.keys || []) if (!sampleOfKey.has(k)) sampleOfKey.set(k, s.name);
        }
    }

    let keys = [], setName = null;
    if (typeof opt.set === 'string') {
        setName = opt.set;
        const s = JSON.parse(fs.readFileSync(SAMPLES, 'utf8')).find((x) => x.name === setName);
        if (!s) throw new Error(`no sample set ${setName}`);
        keys = s.keys;
    }
    if (typeof opt.keys === 'string') keys = fs.readFileSync(opt.keys, 'utf8').split('\n').map((x) => x.trim()).filter(Boolean);
    keys = keys.filter((k) => latest.has(k));
    if (opt.undecided) keys = keys.filter((k) => UND.has(latest.get(k).verdict));
    const done = new Set();
    if (fs.existsSync(OUT)) for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const t = JSON.parse(line); if (t.pipeline === PIPELINE_VERSION) done.add(`${t.key}|${t.config}`); } catch (e) { /* skip */ }
    }
    // key-major, so every pair gets all its configs early
    const queue = [];
    for (const k of keys) for (const c of configs) if (!done.has(`${k}|${c}`)) queue.push({ key: k, config: c, g: latest.get(k).g });
    const total = queue.length;
    console.log(`${keys.length} pairs × ${configs.length} configs: ${total} runs (${done.size} done before), ${jobs} workers, ${timeoutS} s each.`);
    if (!total) process.exit(0);

    const out = fs.openSync(OUT, 'a'), db = fs.openSync(DB, 'a');
    const t0 = Date.now();
    let finished = 0;
    const wins = {};
    const record = (job, r, ms) => {
        const settings = { ...DEFAULTS, ...CONFIGS[job.config] };
        const by = decidedBy(r);
        const line = { key: job.key, config: job.config, pipeline: PIPELINE_VERSION, at: new Date().toISOString(), verdict: r.verdict, why: r.why || null, by, ms, steps: r.ms || {},
            S: r.arith ? r.arith.S : null, index: r.sarith && r.sarith.index != null ? r.sarith.index : null, error: r.error || null,
            fb: r.sarith && r.sarith.targets != null ? { covered: r.sarith.covered, targets: r.sarith.targets, reps: r.sarith.reps, status: r.sarith.status } : null };
        fs.writeSync(out, JSON.stringify(line) + '\n');
        if (!UND.has(r.verdict)) {
            const h = job.g.map((m) => Math.log(sigma1(m)));
            const rowSet = setName || latest.get(job.key)?.set || sampleOfKey.get(job.key) || null;
            fs.writeSync(db, JSON.stringify({ key: job.key, g: job.g, h: h.map((x) => +x.toFixed(6)), hmax: +Math.max(...h).toFixed(6), s1: job.g.map((m) => +sigma1(m).toFixed(6)),
                tag: `${PIPELINE_VERSION}|${JSON.stringify(settings)}`, budget: 'raised', ...(rowSet ? { set: rowSet } : {}), at: line.at, tuning: job.config, ...r }) + '\n');
            wins[job.config] = (wins[job.config] || 0) + 1;
        }
        finished++;
        console.log(`[${finished}/${total} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${job.config.padEnd(8)} ${r.verdict}${r.why ? `:${r.why}` : ''}${UND.has(r.verdict) ? '' : ` (${by}, ${(ms / 1000).toFixed(0)} s)`}  ${job.key}`);
    };

    runWorkerPool({
        workerUrl: new URL('./groupWorker.mjs', import.meta.url),
        items: queue,
        jobs,
        timeoutS,
        toMessage: (job) => ({
            state: { mats: job.g.map((m) => m.map(String)), anti: job.g.map(() => false), consts: [] },
            settings: { ...DEFAULTS, ...CONFIGS[job.config] },
        }),
        onResult: (job, m, elapsed) => record(job, m.error ? { verdict: 'error', why: 'crash', error: m.error } : m.result, elapsed),
        onCrash: (job, e, elapsed) => record(job, { verdict: 'error', why: 'crash', error: e.message }, elapsed),
        onTimeout: (job, elapsed) => record(job, { verdict: 'timeout', why: 'timeout' }, elapsed),
        onDone: () => {
            fs.closeSync(out);
            fs.closeSync(db);
            console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)} s. Decided, by config: ${Object.entries(wins).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
            process.exit(0);
        },
    });
}
