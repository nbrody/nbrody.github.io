/**
 * Group the enumerated pairs by their canonical group (reduce.mjs: Gauss reduction under PGL₂(ℤ)
 * and Gilman–Maskit / Nielsen reduction of the generators) and write database/groups.json:
 *   { bound, version, groups: { groupKey: { H, members: [pairKey…] } } }
 * Pairs in one group generate PGL₂(ℤ)-conjugate subgroups, so they share every verdict.
 *
 *   node batch/groups.mjs --bound 4
 */
import fs from 'node:fs';
import { pairsUpTo, samplePairs } from './enumerate.mjs';
import { canonicalGroup } from './reduce.mjs';

export const GROUPS_VERSION = '2026-10-10a';

if (import.meta.url === `file://${process.argv[1]}`) {
    const a = process.argv.slice(2);
    const opt = {};
    for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) opt[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    const B = Number(opt.bound || 3);
    const out = new URL('../database/groups.json', import.meta.url);
    const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { groups: {} };
    const pairs = pairsUpTo(B);
    // the samples' pairs too (database/samples.json), so their rows can be grouped
    const samplesFile = new URL('../database/samples.json', import.meta.url);
    if (fs.existsSync(samplesFile)) {
        const samples = JSON.parse(fs.readFileSync(samplesFile, 'utf8'));
        for (const s of Object.values(samples.sets || samples)) for (const key of s.keys || s) if (typeof key === 'string') pairs.push({ key, g: key.split('|').map((m) => m.split(',').map(Number)) });
    }
    const groups = {}, t0 = Date.now();
    const done = new Set();
    for (const p of pairs) {
        if (done.has(p.key)) continue;
        done.add(p.key);
        const r = canonicalGroup(p.g);
        (groups[r.key] ??= { H: r.H, members: [] }).members.push(p.key);
    }
    fs.writeFileSync(out, JSON.stringify({ bound: B, version: GROUPS_VERSION, groups }));
    console.log(`σ₁ ≤ ${B}: ${done.size} pairs → ${Object.keys(groups).length} groups (${((Date.now() - t0) / 1000).toFixed(0)} s) → database/groups.json`);
}
