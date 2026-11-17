/**
 * Shared worker-thread pool, CLI argument parser, and atomic file writer for batch/*.mjs scripts.
 */
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Parse `--flag` and `--key value` CLI arguments, validating against `allowed` (when provided)
 * and printing `usage` on `--help` / `-h` or unknown flags.
 */
export function parseCliArgs(argv = process.argv.slice(2), { allowed = null, usage = '' } = {}) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            if (usage) console.log(usage.trim());
            process.exit(0);
        }
        if (!arg.startsWith('--')) {
            throw new Error(`unexpected positional argument "${arg}"${usage ? `\n${usage.trim()}` : ''}`);
        }
        const eq = arg.indexOf('=');
        let k, v;
        if (eq >= 0) {
            k = arg.slice(2, eq);
            v = arg.slice(eq + 1);
        } else {
            k = arg.slice(2);
            v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
        }
        if (allowed && !allowed.has(k)) {
            throw new Error(`unknown flag "--${k}" (allowed: ${[...allowed].map((x) => `--${x}`).join(', ')})`);
        }
        out[k] = v;
    }
    return out;
}

export function defaultJobs() {
    return Math.max(1, availableParallelism() - 2);
}

/** Write `content` to `filePath` atomically via a sibling `.tmp` file + `renameSync`. */
export function writeFileAtomic(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, filePath);
}

/**
 * Run `items` across a pool of `jobs` Node worker threads executing `workerUrl`.
 *
 * Each worker posts `{ ready: true }` once loaded, receives `toMessage(item)` (unless `skip(item)`
 * handles the item synchronously), and posts `{ result }` or `{ error }`. Timed-out or crashed
 * workers are terminated and replaced automatically.
 */
export function runWorkerPool({
    workerUrl,
    items,
    jobs = defaultJobs(),
    timeoutS = 600,
    maxOldGenerationSizeMb = 4096,
    skip = null,
    toMessage,
    onResult,
    onTimeout,
    onCrash,
    onDone,
}) {
    const total = items.length;
    if (!total) {
        if (onDone) onDone();
        return;
    }
    let next = 0;
    let finishing = false;
    const pool = new Set();

    const finish = () => {
        if (finishing) return;
        finishing = true;
        if (onDone) onDone();
    };

    const replace = (w) => {
        pool.delete(w);
        w.removeAllListeners();
        w.terminate();
        if (next < total) pool.add(spawn());
        else if (![...pool].some((x) => x.job !== null)) finish();
    };

    const feed = (w) => {
        while (next < total) {
            const item = items[next++];
            if (skip && skip(item)) continue;
            w.job = item;
            w.started = Date.now();
            w.timer = setTimeout(() => {
                const elapsed = Date.now() - w.started;
                w.job = null;
                if (onTimeout) onTimeout(item, elapsed);
                replace(w);
            }, timeoutS * 1000);
            w.postMessage(toMessage(item));
            return;
        }
        pool.delete(w);
        w.terminate();
        if (!pool.size) finish();
    };

    function spawn() {
        const w = new Worker(workerUrl, { resourceLimits: { maxOldGenerationSizeMb } });
        w.job = null;
        w.started = 0;
        w.timer = null;
        w.on('message', (m) => {
            if (m && m.ready) { feed(w); return; }
            clearTimeout(w.timer);
            const item = w.job;
            const elapsed = Date.now() - w.started;
            w.job = null;
            if (item !== null) onResult(item, m, elapsed);
            feed(w);
        });
        w.on('error', (e) => {
            clearTimeout(w.timer);
            const item = w.job;
            const elapsed = Date.now() - w.started;
            w.job = null;
            if (item !== null) {
                if (onCrash) onCrash(item, e, elapsed);
                else onResult(item, { error: e.message || String(e) }, elapsed);
            }
            replace(w);
        });
        return w;
    }

    const nSpawn = Math.min(Math.max(1, jobs), total);
    for (let i = 0; i < nSpawn; i++) pool.add(spawn());
}
