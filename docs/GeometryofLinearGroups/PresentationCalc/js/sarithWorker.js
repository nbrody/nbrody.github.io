/**
 * Worker for step 3: the FlashBeam search for a covering certificate on the
 * product of trees (covering.js), with trees' exact local fields.
 * ringEngine.js must be evaluated before localField.js reads the global
 * NumberRingEngine, so it is imported first, for its side effect.
 *
 * In:  { id, job: { poly, mats, S, sameField, opts, stabCount } }
 *        poly, mats: the field of definition and the normalized generators as
 *        ringEngine text (discretenessAlgorithm's field model)
 *        S: [{ p, e, f }], the primes of k where Γ is unbounded; sameField: F = k
 *        opts: { beamWidth, flashSize, seconds, maxReps, maxStretch }
 *        calibMs: the page's main-thread time for calibrationMs(), to measure how much slower the
 *        browser runs this worker (in a background tab, say); the budget is in full-speed seconds
 *        arch: [{ re, im, kind }], the places at ∞ where Γ is unbounded; metric: 'log' | 'unit'
 * Or:  { id, cmd: 'elements', count } — FlashBeam's lowest elements and the elements fixing o, as words
 * Or:  { id, cmd: 'orbits', rows, S, seconds } — over ℚ, the vertex orbits and exact stabilizers
 *        (orbits.js), seeded with the last covering (complete or not)
 * Out: { id, msg } with msg.type
 *        'places'    { places: [{ p, index, e, f, q, primeTex }], notes }
 *        'progress'  { stats, reps, targets, covered, promoted, links }
 *        'done'      { status, iterations, seconds, verify, reps, witnesses, links, stab, notes }
 *        'elements'  { words }
 *        'orbits'    orbitDecide's result: { status, verdict: 'sarith' | 'thin' | null, index, … }
 *        'error'     { error }
 */
import '../../Algebraic/Tools/numberRings/ringEngine.js';
import { GlobalField, Place } from '../../Geometric/Tools/padicGroups/trees/js/localField.js';
import { readJob } from '../../Geometric/Tools/discretenessAlgorithm/js/finite.js';
import { polyInW } from '../../Geometric/Tools/discretenessAlgorithm/js/field.js';
import { Frac } from '../../Geometric/Tools/Kleinian/poincare/js/exact.js';
import { CoveringProblem, runCovering, choosePlaces, harvest } from './covering.js';
import { dirichletGenerators } from './adelic.js';
import { orbitDecideAuto } from './orbits.js';
import { calibrationMs } from './calibrate.js';

let problem = null, beam = null, field = null;

/**
 * Time spent, in full-speed ms: each interval is divided by how much slower this worker runs than
 * the page's main thread did on the same loop (at most maxStretch). The browser may run workers
 * several times slower while the page is in the background; the search then gets the same work.
 */
function fullSpeedClock(refMs, maxStretch) {
    for (let i = 0; i < 10; i++) calibrationMs();             // warm up, as the page did (referenceMs)
    const ratioNow = () => (refMs > 0 ? Math.min(maxStretch, Math.max(1, calibrationMs() / refMs)) : 1);
    let last = performance.now(), ratio = ratioNow(), spent = 0;
    const clock = () => {
        const now = performance.now(), r = ratioNow();
        spent += (now - last) / ((ratio + r) / 2);
        ratio = r;
        last = performance.now();
        return spent;
    };
    clock.ratio = () => ratio;
    return clock;
}

/** Per representative and tree: the state of each neighbour (parent first, then the children). */
function links(P) {
    return P.reps.map((r, i) => r.tuple.map((vt, j) => P.places[j].neighbors(vt).map((u) => {
        const t = r.tuple.slice(); t[j] = u;
        const id = P.tupleId(t);
        if (P.repIndex.has(id)) return 'rep';
        const hit = P.orbit.get(id);
        if (!hit) return 'open';
        return hit.rep === i ? 'self' : 'other';
    })));
}

function vertexTex(P, j, vt) {
    const x = P.places[j].labelTex(vt);
    return `\\lfloor ${x} \\rfloor_{${vt.k}}`;
}

function entryTex(F, coords) {
    const c = F.toK({ v: coords.slice(), den: 1n });
    return polyInW(c.map((r) => new Frac(r.n, r.d)), 'tex');
}

function stabList(F, k) {
    return problem.stabilizerElements(k).map((e) => ({ word: e.word, h: e.h, tex: e.M.map((c) => entryTex(F, c)) }));
}

self.onmessage = (ev) => {
    const { id, job, cmd } = ev.data;
    const send = (msg) => self.postMessage({ id, msg });
    if (cmd === 'orbits') {
        try {
            const covering = problem && problem.certify ? problem : null;
            const r = orbitDecideAuto(ev.data.rows, ev.data.S, { seconds: ev.data.seconds ?? 30, covering, ...(ev.data.maxGraph ? { maxGraph: ev.data.maxGraph } : {}) });
            send({ type: 'orbits', ...r, groups: (r.groups || []).slice(0, 32) });
        } catch (e) {
            send({ type: 'error', error: e && e.message ? e.message : String(e) });
        }
        return;
    }
    if (cmd === 'elements') {
        // the lowest elements FlashBeam has seen (its archive) and the elements fixing o, as words:
        // where parabolics of an S-arithmetic group are found (cusps.js)
        if (!problem) { send({ type: 'elements', words: [] }); return; }
        const n = ev.data.count ?? 20000;
        const arch = problem.archive.slice().sort((x, y) => x.score - y.score).slice(0, n).map((x) => x.word);
        const st = problem.stabilizerElements(Math.min(n, 2000)).map((e) => e.word);
        send({ type: 'elements', words: arch.concat(st) });
        return;
    }
    if (cmd === 'harvest') {
        try {
            const r = harvest(problem, beam, { seconds: ev.data.seconds ?? 10 });
            send({ type: 'stab', stab: stabList(field, ev.data.stabCount ?? 16), stabFound: problem.stab.length, ...r });
        } catch (e) {
            send({ type: 'error', error: e && e.message ? e.message : String(e) });
        }
        return;
    }
    try {
        const { F, mats } = readJob({ GlobalField }, job);
        field = F;
        const ch = job.S.length ? choosePlaces({ Place }, F, mats, job.S, job.sameField) : { places: [], notes: [] };
        if (ch.error) { send({ type: 'error', error: ch.error }); return; }
        const places = ch.places.map((P) => {
            let primeTex = null;
            try { primeTex = F.n > 1 ? F.primeTex(P.pr) : null; } catch (e) { /* plain p */ }
            return { p: String(P.p), index: P.index, e: P.e, f: P.f, q: P.q, primeTex };
        });
        send({ type: 'places', places, notes: ch.notes });
        const opts = job.opts || {};
        problem = new CoveringProblem(F, ch.places, mats, { maxReps: opts.maxReps ?? 24, arch: job.arch || [], metric: job.metric || 'log' });
        const t0 = Date.now();
        const clock = job.calibMs ? fullSpeedClock(job.calibMs, opts.maxStretch ?? 6) : null;
        let last = 0;
        const res = runCovering(problem, clock ? { ...opts, clock, maxStretch: opts.maxStretch ?? 6 } : opts, (p) => {
            const now = Date.now();
            if (now - last < 250 && !p.promoted) return;
            last = now;
            send({ type: 'progress', ...p, links: links(problem), fast: problem.fast.map(Boolean), slow: clock ? clock.ratio() : 1 });
        });
        const P = problem;
        beam = res.beam;
        const dir = dirichletGenerators(P);
        const out = {
            type: 'done', status: res.status, iterations: res.beam.iteration, seconds: (Date.now() - t0) / 1000, slow: clock ? clock.ratio() : 1,
            visited: res.beam.visited.size, notes: ch.notes, links: links(P),
            reps: P.reps.map((r) => ({ dist: r.dist, tex: r.tuple.map((vt, j) => vertexTex(P, j, vt)) })),
            targets: P.targets.size, covered: P.coveredCount(), slowActs: P.slowActs,
            certify: P.certify, weights: P.weights, archKinds: P.archs.map((A) => A.kind),
            dirichlet: { pairs: dir.pairs, active: dir.active.length, tied: dir.tied.length, considered: dir.considered, points: dir.points },
            relations: P.relations.slice().sort((a, b) => a.length - b.length || (a.join() < b.join() ? -1 : 1)),
            collisions: P.collisionsSeen, redundant: P.relSet.redundant,
        };
        if (res.status === 'covered') {
            out.verify = res.verify;
            const cert = P.certificate();
            out.witnesses = cert.witnesses.map((w) => {
                const t = P.targets.get(w.target);
                const nb = P.places[t.place].neighbors(P.reps[t.from].tuple[t.place]);
                const k = nb.findIndex((u) => P.places[t.place].id(u) === P.places[t.place].id(t.tuple[t.place]));
                return { from: t.from, place: t.place, nbr: k, word: w.word, rep: w.rep, tex: vertexTex(P, t.place, t.tuple[t.place]) };
            });
        }
        out.stab = stabList(F, job.stabCount ?? 12);
        out.stabFound = P.stab.length;
        send(out);
    } catch (e) {
        send({ type: 'error', error: e && e.message ? e.message : String(e) });
    }
};
