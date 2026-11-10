// node tests/engine.test.mjs [seed] [runs]
// Checks: canonical layouts realize the requested intersection numbers; the
// solver never changes them; braid twists act on π1 by the Artin action;
// dragging a puncture around a neighbour is a full twist; every state stays
// simple and off the punctures.
import * as E from '../js/engine.js';
import * as A from '../js/algebra.js';
import { HyperbolicMetric, chooseDisk } from '../js/hyperbolic.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } };
const t0 = Date.now();

let seed = Number(process.argv[2] || 1);
const runs = Number(process.argv[3] || 12);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

function isSimple(sim) {
    const { X, Y, N, next, P } = sim;
    for (let a = 0; a < N; a++) {
        const a1 = next[a];
        for (let b = a + 1; b < N; b++) {
            const b1 = next[b];
            if (b === a1 || b1 === a) continue;
            if (E.segsIntersect(X[a], Y[a], X[a1], Y[a1], X[b], Y[b], X[b1], Y[b1])) return `segments ${a},${b} meet`;
        }
        for (const p of P) if (E.segPoint(X[a], Y[a], X[a1], Y[a1], p.x, p.y).d < 1e-12) return 'touches a puncture';
    }
    return true;
}
function minPunctureDist(sim) {
    let m = Infinity;
    for (let a = 0; a < sim.N; a++) { const a1 = sim.next[a];
        for (const p of sim.P) m = Math.min(m, E.segPoint(sim.X[a], sim.Y[a], sim.X[a1], sim.Y[a1], p.x, p.y).d); }
    return m;
}
const countsKey = an => JSON.stringify([an.up, an.down, an.beta]);

// ---------------------------------------------------------------- mural
{
    const sim = E.createSim();
    for (const [x, y] of [[-320, 8], [-16, 0], [320, -10]]) E.addPuncture(sim, x, y);
    sim.h = 14;
    const counts = E.countsFromDynnikov(3, [-5], [3]);
    ok(JSON.stringify(counts) === JSON.stringify({ up: [8, 13, 5], down: [8, 3, 5], beta: [16, 10] }), 'mural counts ' + JSON.stringify(counts));
    E.setLoops(sim, E.layoutFromCounts(sim, counts));
    ok(sim.starts.length === 1, 'mural is one curve, got ' + sim.starts.length);
    ok(isSimple(sim) === true, 'mural layout simple');
    let an = E.analyze(sim);
    ok(countsKey(an) === JSON.stringify([counts.up, counts.down, counts.beta]), 'mural layout counts ' + countsKey(an));
    const dy = E.dynnikov(an);
    ok(dy.a[0] === -5 && dy.b[0] === 3, 'mural Dynnikov ' + JSON.stringify(dy));
    const w = A.canonicalCyclic(an.loops[0].word);
    console.log('mural word:', w.map(c => (c > 0 ? 'abc'[c - 1] : 'abc'[-c - 1] + "'")).join(' '), '(length', w.length + ')');
    const t1 = Date.now();
    let net = 0;
    for (let it = 0; it < 400; it++) net = E.relaxIteration(sim);
    console.log(`mural: 400 iterations in ${Date.now() - t1} ms, N=${sim.N}, last net move ${net.toFixed(4)}`);
    ok(isSimple(sim) === true, 'mural relaxed simple');
    const mpd = minPunctureDist(sim);
    console.log(`mural: tension ${sim.tension.toFixed(4)}, overlap ${sim.lastOverlap.toFixed(3)}, closest approach to a puncture ${(mpd / sim.h).toFixed(2)} h`);
    ok(mpd > 0.6 * sim.h, 'mural keeps its distance from the punctures');
    an = E.analyze(sim);
    ok(countsKey(an) === JSON.stringify([counts.up, counts.down, counts.beta]), 'relaxed mural counts ' + countsKey(an));
}

// ---------------------------------------------------------------- twists vs Artin
function randomPunctures(n) {
    const sim = E.createSim();
    const pts = [];
    while (pts.length < n) {
        const x = (rand() - 0.5) * 900, y = (rand() - 0.5) * 500;
        if (pts.every(([a, b]) => Math.hypot(a - x, b - y) > 120)) pts.push([x, y]);
    }
    for (const [x, y] of pts) E.addPuncture(sim, x, y);
    sim.h = 9;
    return sim;
}
const respace = sim => { sim.h = E.autoSpacing(sim, E.analyze(sim), { hMax: 12 }); };

for (let run = 0; run < runs; run++) {
    const n = 3 + Math.floor(rand() * 3);
    const sim = randomPunctures(n);
    // a random curve: Dynnikov coordinates, small
    const a = [], b = [];
    for (let i = 0; i < n - 2; i++) { a.push(Math.floor(rand() * 5) - 2); b.push(Math.floor(rand() * 5) - 2); }
    if (a.every(v => v === 0) && b.every(v => v === 0)) b[0] = 1;
    const counts = E.countsFromDynnikov(n, a, b);
    E.setLoops(sim, E.layoutFromCounts(sim, counts));
    respace(sim);
    for (let it = 0; it < 60; it++) E.relaxIteration(sim);
    let an = E.analyze(sim);
    ok(countsKey(an) === JSON.stringify([counts.up, counts.down, counts.beta]), `run ${run}: layout counts`);
    let words = an.loops.map(L => L.word);
    const braid = [];
    const stepsUsed = [];
    for (let k = 0; k < 3; k++) {
        const i = 1 + Math.floor(rand() * (n - 1));
        const s = rand() < 0.5 ? 1 : -1;
        braid.push(s * i);
        const F = E.cutFrame(sim.P);
        const steps = E.twistNow(sim, F.order[i - 1], F.order[i], s, 1);
        respace(sim);
        for (let it = 0; it < 30; it++) E.relaxIteration(sim);
        stepsUsed.push(steps);
        const simple = isSimple(sim);
        ok(simple === true, `run ${run}: simple after σ${i}^${s}: ${simple}`);
        an = E.analyze(sim);
        const got = an.loops.map(L => A.canonicalCyclic(L.word)).map(String).sort();
        const want = words.map(w => A.canonicalCyclic(A.artin(w, i, s))).map(String).sort();
        const match = JSON.stringify(got) === JSON.stringify(want);
        ok(match, `run ${run}: σ${i}^${s} acts by Artin\n  got  ${got}\n  want ${want}`);
        words = an.loops.map(L => L.word);
    }
    process.stdout.write(`run ${run} n=${n} (a;b)=(${a};${b}) braid ${braid.join(' ')} N=${sim.N} h=${sim.h.toFixed(2)} twist steps ${stepsUsed}\n`);
}

// ---------------------------------------------------------------- drag a puncture around its neighbour
{
    const sim = E.createSim();
    for (const [x, y] of [[-300, 0], [0, 0], [150, 0]]) E.addPuncture(sim, x, y);
    sim.h = 9;
    E.setLoops(sim, E.layoutFromCounts(sim, E.countsFromDynnikov(3, [1], [1])));
    for (let it = 0; it < 60; it++) E.relaxIteration(sim);
    const before = E.analyze(sim).loops.map(L => L.word);
    // carry puncture 2 once around puncture 1 counterclockwise, radius 150
    const q = 2, cx = 0, cy = 0;
    let lag = 0;
    for (let k = 1; k <= 240; k++) {
        const th = 2 * Math.PI * k / 240;
        const tx = cx + 150 * Math.cos(th), ty = cy + 150 * Math.sin(th);
        let guard = 0, left = Infinity;
        while ((left = E.dragStep(sim, q, tx, ty)) > 1e-9 && guard++ < 400) { /* step */ }
        lag = Math.max(lag, left);
        E.relaxIteration(sim);
    }
    ok(lag < 1e-6, 'drag kept up with the cursor, worst lag ' + lag);
    for (let it = 0; it < 60; it++) E.relaxIteration(sim);
    ok(isSimple(sim) === true, 'drag: simple');
    const after = E.analyze(sim).loops.map(L => A.canonicalCyclic(L.word)).map(String).sort();
    const cand = s => before.map(w => A.canonicalCyclic(A.artin(A.artin(w, 2, s), 2, s))).map(String).sort();
    const m = JSON.stringify(after) === JSON.stringify(cand(1)) ? 'σ2²' : JSON.stringify(after) === JSON.stringify(cand(-1)) ? 'σ2⁻²' : null;
    ok(m === 'σ2²', 'drag around neighbour counterclockwise = σ2², got ' + m);
}

// ---------------------------------------------------------------- the geodesic look
{
    const sim = E.createSim();
    for (const [x, y] of [[-320, 8], [-16, 0], [320, -10]]) E.addPuncture(sim, x, y);
    const counts = E.countsFromDynnikov(3, [-5], [3]);
    sim.h = 14;
    E.setLoops(sim, E.layoutFromCounts(sim, counts));
    const pts = E.getLoops(sim).flatMap(l => l.x.map((x, i) => ({ x, y: l.y[i] })));
    sim.metric = new HyperbolicMetric(sim.P, chooseDisk(sim.P, pts));
    sim.h = 3.6; sim.ellHyp = 0.03; sim.ellMax = sim.metric.disk.R / 200;
    const L0 = E.curveLength(sim);
    const S = new E.Settler(sim);
    const t1 = Date.now();
    while (!S.settled && S.iters < 4000) S.step();
    const L1 = E.curveLength(sim);
    console.log(`geodesic mural: settled after ${S.iters} iterations, ${Date.now() - t1} ms, hyperbolic length ${L0.toFixed(2)} → ${L1.toFixed(2)}, N=${sim.N}`);
    ok(S.settled && L1 < L0, 'geodesic mural settles and gets shorter');
    ok(isSimple(sim) === true, 'geodesic mural simple');
    const an = E.analyze(sim);
    ok(countsKey(an) === JSON.stringify([counts.up, counts.down, counts.beta]), 'geodesic mural keeps its class');
    // twists with the metric switched off while the punctures move (the app's
    // fallback when the metric cannot follow them)
    let words = an.loops.map(L => L.word);
    for (const g of [1, -2, 1]) {
        const F = E.cutFrame(sim.P);
        sim.useMetric = false;
        E.twistNow(sim, F.order[Math.abs(g) - 1], F.order[Math.abs(g)], Math.sign(g), 1, { tension: false });
        sim.useMetric = true;
        const S2 = new E.Settler(sim);
        while (!S2.settled && S2.iters < 3000) S2.step();
        ok(isSimple(sim) === true, `geodesic: simple after σ${g}`);
        const got = E.analyze(sim).loops.map(L => A.canonicalCyclic(L.word)).map(String).sort();
        const want = words.map(w => A.canonicalCyclic(A.artin(w, Math.abs(g), Math.sign(g)))).map(String).sort();
        ok(JSON.stringify(got) === JSON.stringify(want), `geodesic: σ${g} acts by Artin`);
        words = E.analyze(sim).loops.map(L => L.word);
    }
    // the same with the metric following the punctures, as in the app's
    // geodesic look: the curve should arrive at the new geodesic, not near it
    const settle = () => { const S3 = new E.Settler(sim); while (!S3.settled && S3.iters < 3000) S3.step(); };
    const farthest = (xs, ys) => {           // of these points from the curve
        let worst = 0;
        for (let i = 0; i < xs.length; i += 3) {
            let best = Infinity;
            for (let g = 0; g < sim.N; g++) {
                const g1 = sim.next[g];
                best = Math.min(best, E.segPoint(sim.X[g], sim.Y[g], sim.X[g1], sim.Y[g1], xs[i], ys[i]).d);
            }
            worst = Math.max(worst, best);
        }
        return worst;
    };
    for (const g of [-1, 2]) {
        const F = E.cutFrame(sim.P);
        const main = sim.metric, live = main.follower();
        const tw = E.twistFrame(sim, F.order[Math.abs(g) - 1], F.order[Math.abs(g)], Math.sign(g));
        sim.metric = live; sim.annealing = false;
        let guard = 0, solves = 0;
        while (!tw.done && guard++ < 20000) {
            E.twistStep(sim, tw);
            if (live.follow(sim.P)) solves++;
            E.relaxIteration(sim, { tensionMax: 0.3 });
        }
        sim.metric = main;
        ok(tw.done, `following: σ${g} finishes`);
        const arrived = E.getLoops(sim).reduce((a, l) => ({ x: a.x.concat(l.x), y: a.y.concat(l.y) }), { x: [], y: [] });
        settle();
        const off = farthest(arrived.x, arrived.y) / main.disk.R;
        console.log(`following: σ${g} in ${guard} steps, ${solves} metric solves, arrives within ${(100 * off).toFixed(1)}% of the disk's radius of the geodesic`);
        // (pulled taut with no metric, as it used to be, it arrives some 20% away)
        ok(off < 0.06, `following: σ${g} arrives at the geodesic (${(100 * off).toFixed(1)}% of R away)`);
        ok(isSimple(sim) === true, `following: simple after σ${g}`);
        const got = E.analyze(sim).loops.map(L => A.canonicalCyclic(L.word)).map(String).sort();
        const want = words.map(w => A.canonicalCyclic(A.artin(w, Math.abs(g), Math.sign(g)))).map(String).sort();
        ok(JSON.stringify(got) === JSON.stringify(want), `following: σ${g} acts by Artin`);
        words = E.analyze(sim).loops.map(L => L.word);
    }
}

console.log(`${checks - fails}/${checks} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
