#!/usr/bin/env node
// Slim copies of the database for the published site:  node database/export-web.mjs
//
// The run logs (results*.jsonl, presentations*.jsonl, ~60–120 MB) stay on this machine. The page
// (db.js) reads database/web/manifest.json + the active field's slim JSON files first (unless
// ?raw=1 is passed), falling back to raw *.jsonl when web/ is absent:
//  - one record per pair: the one db.js would pick (the latest decided record, else the latest);
//  - without the fields the page never reads (zariski, primes, pipeline, and the places' key,
//    index, count, q), with long place details and relator lists shortened;
//  - over ℚ, a record keeps `set` only if every run of that pair had one, so the page's
//    exhaustive bound (the largest σ₁ among records without a set) comes out the same;
//  - per-field number-field shards (`results-nf-<field>.json` and `presentations-nf-<field>.json`)
//    plus `manifest.json`, so the browser fetches only the selected field instead of everything.
// Rerun after a batch run, then commit database/web/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exhaustiveBound } from './exhaustive.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'web');
fs.mkdirSync(out, { recursive: true });

const UNDETERMINED = new Set(['open', 'timeout', 'error']);
const decided = (r) => !UNDETERMINED.has(r.verdict);
const DETAIL_MAX = 600;
const RELATORS_SHOWN = 12;
const SHORT_RELATIONS = 8;

function readLines(file) {
    const p = path.join(here, file);
    if (!fs.existsSync(p)) return [];
    const recs = [];
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { recs.push(JSON.parse(line)); } catch (e) { /* a line being written */ }
    }
    return recs;
}

const clip = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 1) + '…' : s);

function slimRecord(r) {
    const { zariski, primes, pipeline, ...s } = r;          // never read by db.js
    if (Array.isArray(s.places)) s.places = s.places.map(({ key, index, count, q, ...p }) => ({ ...p, detail: clip(p.detail, DETAIL_MAX) }));
    if (s.sarith && Array.isArray(s.sarith.shortRelations)) s.sarith = { ...s.sarith, shortRelations: s.sarith.shortRelations.slice(0, SHORT_RELATIONS) };
    return s;
}

/** db.js's choice per key: a decided record is never hidden by a later undecided one. */
function chosen(recs, { keepSetOnlyIfAlways = false } = {}) {
    const byKey = new Map(), noSet = new Set();
    for (const r of recs) {
        if (!r.set) noSet.add(r.key);
        const old = byKey.get(r.key);
        if (!old || (decided(r) === decided(old) ? r.at > old.at : decided(r))) byKey.set(r.key, r);
    }
    return [...byKey.values()].map((r) => {
        const s = slimRecord(r);
        if (keepSetOnlyIfAlways && noSet.has(r.key)) delete s.set;
        return s;
    });
}

function slimPresentations(recs) {
    const byKey = new Map();
    for (const p of recs) byKey.set(p.key, p);             // db.js: the last line wins
    return [...byKey.values()].map(({ key, kind, cong, pres }) => {
        if (!pres || pres.error) return { key, ...(kind ? { kind } : {}), cong, pres };
        const {
            gens, relators = [], nRelators, abelian, index, tableFrom, kernelIndex,
            onGiven, route, hFrom, pruned, ms,
        } = pres;
        return {
            key,
            ...(kind ? { kind } : {}),
            cong,
            pres: {
                gens,
                relators: relators.slice(0, RELATORS_SHOWN),
                nRelators: nRelators ?? relators.length,
                abelian,
                index,
                tableFrom,
                kernelIndex,
                ...(onGiven != null ? { onGiven } : {}),
                ...(route ? { route } : {}),
                ...(hFrom ? { hFrom } : {}),
                ...(pruned ? { pruned } : {}),
                ms,
            },
        };
    });
}

const hash = crypto.createHash('sha256');

function writeAtomic(name, data, { includeInHash = true } = {}) {
    const file = path.join(out, name);
    const tmp = `${file}.${process.pid}.tmp`;
    const json = JSON.stringify(data);
    if (includeInHash) hash.update(name).update('\0').update(json).update('\n');
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, file);
    const count = Array.isArray(data) ? data.length : Object.keys(data).length;
    console.log(`${name}: ${count} records, ${(Buffer.byteLength(json) / 1e6).toFixed(2)} MB`);
}

const rawQ = readLines('results.jsonl');
const qRecs = chosen(rawQ, { keepSetOnlyIfAlways: true });
const nfRecs = chosen(readLines('results-nf.jsonl'));
const randRecs = chosen(readLines('results-random.jsonl'));
const presQ = slimPresentations(readLines('presentations.jsonl'));
const presNF = slimPresentations(readLines('presentations-nf.jsonl'));

const samplesPath = path.join(here, 'samples.json');
const sampleKeySet = fs.existsSync(samplesPath)
    ? new Set(JSON.parse(fs.readFileSync(samplesPath, 'utf8')).flatMap((s) => s.keys || []))
    : new Set();
const exBound = exhaustiveBound(qRecs, sampleKeySet);

writeAtomic('results.json', qRecs);
writeAtomic('results-nf.json', nfRecs);
writeAtomic('results-random.json', randRecs);
writeAtomic('presentations.json', presQ);
writeAtomic('presentations-nf.json', presNF);

// Per-field shards for fast single-field loading in db.js
const nfFields = [...new Set(nfRecs.map((r) => r.field).filter(Boolean))];
const fieldByKey = new Map(nfRecs.map((r) => [r.key, r.field]));
const nfCounts = {};
const nfPresCounts = {};

for (const f of nfFields) {
    const fRecs = nfRecs.filter((r) => r.field === f);
    const fPres = presNF.filter((p) => (fieldByKey.get(p.key) || p.key.split(':')[0]) === f);
    nfCounts[f] = fRecs.length;
    nfPresCounts[f] = fPres.length;
    writeAtomic(`results-nf-${f}.json`, fRecs);
    writeAtomic(`presentations-nf-${f}.json`, fPres);
}

const version = hash.digest('hex').slice(0, 12);
const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    exBound: +exBound.toFixed(6),
    nfFields,
    hasRandom: randRecs.length > 0,
    counts: {
        Q: qRecs.length,
        presentationsQ: presQ.length,
        random: randRecs.length,
        nf: nfCounts,
        presentationsNF: nfPresCounts,
    },
};
writeAtomic('manifest.json', manifest, { includeInHash: false });
