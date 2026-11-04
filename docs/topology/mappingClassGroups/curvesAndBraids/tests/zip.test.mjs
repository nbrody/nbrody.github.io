// node tests/zip.test.mjs — zipping a curve to its train track.
// Checks: the families and weights of the mural's track; the switch
// conditions; the zipped picture (at every stage) misses the punctures.
import * as E from '../js/engine.js';
import * as Z from '../js/zip.js';
import { HyperbolicMetric, chooseDisk } from '../js/hyperbolic.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok  ', msg); };
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const name = e => `${'UDB'[e % 3]}${((e / 3) | 0) + 1}`;

function minPunctureDistZipped(sim, track, t) {
    let m = Infinity;
    for (const pts of Z.zipLoops(track, sim, t)) {
        const n = pts.length / 2;
        for (let a = 0; a < n; a++) {
            const b = (a + 1) % n;
            for (const p of sim.P) m = Math.min(m, E.segPoint(pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1], p.x, p.y).d);
        }
    }
    return m;
}

// Crossings in the zipping curve that should never happen: between strands of
// different bands (unless both have arrived on the finished track), or, while
// the bands close (t < 0.6), between strands of one band before either has
// half closed onto its center line. Strands of one band merging, and the fans
// sliding into the switches at the end, is the zip.
function crossingsMidZip(sim, track, t) {
    const zs = [], fs = [], now = Z.zipLoops(track, sim, t, zs, fs), end = Z.zipLoops(track, sim, 1);
    const tol = 0.25 * sim.h, segs = [];
    now.forEach((pts, l) => {
        const n = pts.length / 2, q = end[l], z = zs[l], f = fs[l];
        const res = k => Math.hypot(pts[2 * k] - q[2 * k], pts[2 * k + 1] - q[2 * k + 1]);
        for (let a = 0; a < n; a++) {
            const b = (a + 1) % n;
            segs.push({ x0: pts[2 * a], y0: pts[2 * a + 1], x1: pts[2 * b], y1: pts[2 * b + 1], l, a, b,
                f: f[a] === f[b] ? f[a] : -2, arrived: Math.max(res(a), res(b)) <= tol, open: Math.max(z[a], z[b]) < 0.5 });
        }
    });
    let k = 0;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i], B = segs[j];
        if (A.l === B.l && (A.a === B.b || A.b === B.a || A.a === B.a)) continue;
        const sameBand = A.f === B.f && A.f >= 0;
        if (sameBand ? (t >= 0.6 || !(A.open && B.open)) : (A.arrived && B.arrived)) continue;
        if (E.segsIntersect(A.x0, A.y0, A.x1, A.y1, B.x0, B.y0, B.x1, B.y1)) k++;
    }
    return k;
}

// branches of the finished track crossing one another, away from their switches
function branchCrossings(track) {
    const lines = track.families.map(f => f.path);
    const M = lines[0].length - 1, trim = 3;
    let k = 0;
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
        const P = lines[a], Q = lines[b];
        for (let i = trim; i < M - trim; i++) for (let j = trim; j < M - trim; j++) {
            if (E.segsIntersect(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], Q[j][0], Q[j][1], Q[j + 1][0], Q[j + 1][1])) k++;
        }
    }
    return k;
}

// settle as the app does before it zips
function settle(sim) { const S = new E.Settler(sim); while (!S.settled && S.iters < 6000) S.step(); return S.settled; }

// ---------------------------------------------------------------- the mural
{
    const sim = E.createSim();
    for (const [x, y] of [[-320, 8], [-16, 0], [320, -10]]) E.addPuncture(sim, x, y);
    sim.h = 14;
    E.setLoops(sim, E.layoutFromCounts(sim, E.countsFromDynnikov(3, [-5], [3])));
    settle(sim);
    const tr = Z.buildTrack(sim);
    const fams = tr.families.map(f => `${f.strip}:${name(f.ga)}-${name(f.gb)}×${f.weight}`).sort();
    console.log('mural families:', fams.join('  '));
    ok(JSON.stringify(fams) === JSON.stringify(['0:U1-D1×8', '1:D1-D2×3', '1:D1-U2×5', '1:U1-U2×8', '2:U2-D2×3', '2:U2-D3×5', '2:U2-U3×5', '3:U3-D3×5']),
        'mural: eight families with the Dynnikov weights');
    ok(Z.switchConditions(tr).length === 0, 'mural: switch conditions hold');
    ok(tr.branches.length === 4 && tr.trueSwitches === 2, `mural: ${tr.branches.length} branches, ${tr.trueSwitches} switches (want 4, 2)`);
    console.log('mural branch weights:', tr.branches.map(b => b.weight).sort((a, b) => a - b).join(', '));
    const d = [0, 0.3, 0.6, 1].map(t => minPunctureDistZipped(sim, tr, t));
    ok(d.every(x => x > 0.5 * sim.h), `mural: zipped track misses the punctures (min distance ${d.map(x => x.toFixed(1)).join(', ')}, h = ${sim.h})`);
    const cr = [0.2, 0.4, 0.6, 0.8].map(t => crossingsMidZip(sim, tr, t));
    ok(cr.every(k => k === 0), `mural: nothing crosses while zipping (t = 0.2, 0.4, 0.6, 0.8: ${cr.join(', ')})`);
    const bc = branchCrossings(tr);
    ok(bc === 0, `mural: the branches of the track do not cross (${bc})`);
}

// ---------------------------------------------------------------- random curves, both looks
for (let run = 0; run < 6; run++) {
    const n = 3 + (run % 3);
    const sim = E.createSim();
    for (let i = 0; i < n; i++) E.addPuncture(sim, -300 + 600 * i / (n - 1) + 40 * (rand() - 0.5), 120 * (rand() - 0.5));
    const a = [], b = [];
    for (let i = 0; i < n - 2; i++) { a.push(Math.round(6 * (rand() - 0.5))); b.push(Math.round(6 * (rand() - 0.5))); }
    if (a.every(v => !v) && b.every(v => !v)) b[0] = 1;
    sim.h = 8;
    E.setLoops(sim, E.layoutFromCounts(sim, E.countsFromDynnikov(n, a, b)));
    settle(sim);
    const tr = Z.buildTrack(sim);
    const an = E.analyze(sim);
    const total = tr.switches.reduce((s, w) => s + w.count, 0);
    const rays = an.up.reduce((s, v) => s + v, 0) + an.down.reduce((s, v) => s + v, 0);
    ok(Z.switchConditions(tr).length === 0 && total === rays,
        `n=${n} (${a};${b}): ${tr.families.length} families, ${tr.branches.length} branches, switch conditions hold, ${total} strands through the switches`);
    const d = Math.min(...[0.25, 0.5, 0.75, 1].map(t => minPunctureDistZipped(sim, tr, t)));
    ok(d > 0.3 * sim.h, `n=${n}: zipped track misses the punctures (min ${d.toFixed(2)})`);
    const cr = [0.2, 0.4, 0.6, 0.8, 0.95].map(t => crossingsMidZip(sim, tr, t)), bc = [branchCrossings(tr)];
    ok(cr.every(k => k === 0) && bc.every(k => k === 0), `n=${n}: nothing crosses while zipping (strands ${cr.join(',')}; branches ${bc.join(',')})`);
}

// ---------------------------------------------------------------- the geodesic look
{
    const sim = E.createSim();
    for (const [x, y] of [[-320, 8], [-16, 0], [320, -10]]) E.addPuncture(sim, x, y);
    sim.h = 14;
    E.setLoops(sim, E.layoutFromCounts(sim, E.countsFromDynnikov(3, [-5], [3])));
    const pts = E.getLoops(sim).flatMap(l => l.x.map((x, i) => ({ x, y: l.y[i] })));
    sim.metric = new HyperbolicMetric(sim.P, chooseDisk(sim.P, pts));
    sim.h = 3.6; sim.ellHyp = 0.03; sim.ellMax = sim.metric.disk.R / 200;
    settle(sim);
    const tr = Z.buildTrack(sim);
    const ws = tr.branches.map(b => b.weight).sort((a, b) => a - b).join(',');
    ok(ws === '3,5,5,8' && Z.switchConditions(tr).length === 0, `geodesic mural: the same track (weights ${ws}), switch conditions hold`);
    const d = Math.min(...[0.3, 0.6, 1].map(t => minPunctureDistZipped(sim, tr, t)));
    const cr = [0.2, 0.4, 0.6, 0.8, 0.95].map(t => crossingsMidZip(sim, tr, t)), bc = [branchCrossings(tr)];
    ok(d > 0 && cr.every(k => k === 0) && bc.every(k => k === 0),
        `geodesic mural: zip misses the punctures (min ${d.toFixed(2)}), nothing crosses (strands ${cr.join(',')}; branches ${bc.join(',')})`);
}

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
