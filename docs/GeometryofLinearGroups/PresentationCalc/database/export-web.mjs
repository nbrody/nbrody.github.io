#!/usr/bin/env node
// Slim copies of the database for the published site:  node database/export-web.mjs
//
// The run logs (results*.jsonl, presentations*.jsonl, ~120 MB) stay on this machine. The page
// (db.js) reads them when they are present and otherwise reads database/web/*.json, written here:
//  - one record per pair: the one db.js would pick (the latest decided record, else the latest);
//  - without the fields the page never reads (zariski, primes, pipeline, and the places' key,
//    index, count, q), with long place details and relator
//    lists shortened (the page shows the first 12 relators and the relator count);
//  - over ℚ, a record keeps `set` only if every run of that pair had one, so the page's
//    exhaustive bound (the largest σ₁ among records without a set) comes out the same.
// Rerun after a batch run, then commit database/web/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    return [...byKey.values()].map(({ key, cong, pres }) => {
        if (!pres || pres.error) return { key, cong, pres };
        const { gens, relators = [], nRelators, abelian, index, tableFrom, kernelIndex, ms } = pres;
        return { key, cong, pres: { gens, relators: relators.slice(0, RELATORS_SHOWN), nRelators: nRelators ?? relators.length, abelian, index, tableFrom, kernelIndex, ms } };
    });
}

function write(name, data) {
    const file = path.join(out, name);
    fs.writeFileSync(file, JSON.stringify(data));
    console.log(`${name}: ${data.length ?? Object.keys(data).length} records, ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

write('results.json', chosen(readLines('results.jsonl'), { keepSetOnlyIfAlways: true }));
write('results-nf.json', chosen(readLines('results-nf.jsonl')));
write('results-random.json', chosen(readLines('results-random.jsonl')));
write('presentations.json', slimPresentations(readLines('presentations.jsonl')));
write('presentations-nf.json', slimPresentations(readLines('presentations-nf.jsonl')));
