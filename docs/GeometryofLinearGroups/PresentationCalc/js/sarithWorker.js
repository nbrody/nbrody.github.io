/**
 * Worker for step 4: the FlashBeam search for a covering certificate on the
 * product of trees (covering.js), with trees' exact local fields.
 * ringEngine.js must be evaluated before localField.js reads the global
 * NumberRingEngine, so it is imported first, for its side effect.
 *
 * In:  { id, job: { poly, mats, S, sameField, opts, stabCount } }
 *        poly, mats: the field of definition and the normalized generators as
 *        ringEngine text (discretenessAlgorithm's field model)
 *        S: [{ p, e, f }], the primes of k where Γ is unbounded; sameField: F = k
 *        opts: { beamWidth, flashSize, seconds, maxReps }
 *        arch: [{ re, im, kind }], the places at ∞ where Γ is unbounded; metric: 'log' | 'unit'
 * Out: { id, msg } with msg.type
 *        'places'    { places: [{ p, index, e, f, q, primeTex }], notes }
 *        'progress'  { stats, reps, targets, covered, promoted, links }
 *        'done'      { status, iterations, seconds, verify, reps, witnesses, links, stab, notes }
 *        'error'     { error }
 */
import '../../Algebraic/Tools/numberRings/ringEngine.js';
import { GlobalField, Place } from '../../Geometric/Tools/padicGroups/trees/js/localField.js';
import { readJob } from '../../Geometric/Tools/discretenessAlgorithm/js/finite.js';
import { polyInW } from '../../Geometric/Tools/discretenessAlgorithm/js/field.js';
import { Frac } from '../../Geometric/Tools/Kleinian/poincare/js/exact.js';
import { CoveringProblem, runCovering, choosePlaces, harvest } from './covering.js';
import { dirichletGenerators } from './adelic.js';

let problem = null, beam = null, field = null;

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
        let last = 0;
        const res = runCovering(problem, opts, (p) => {
            const now = Date.now();
            if (now - last < 250 && !p.promoted) return;
            last = now;
            send({ type: 'progress', ...p, links: links(problem), fast: problem.fast.map(Boolean) });
        });
        const P = problem;
        beam = res.beam;
        const dir = dirichletGenerators(P);
        const out = {
            type: 'done', status: res.status, iterations: res.beam.iteration, seconds: (Date.now() - t0) / 1000,
            visited: res.beam.visited.size, notes: ch.notes, links: links(P),
            reps: P.reps.map((r) => ({ dist: r.dist, tex: r.tuple.map((vt, j) => vertexTex(P, j, vt)) })),
            targets: P.targets.size, covered: P.coveredCount(), slowActs: P.slowActs,
            certify: P.certify, weights: P.weights, archKinds: P.archs.map((A) => A.kind),
            dirichlet: { pairs: dir.pairs, active: dir.active.length, tied: dir.tied.length, considered: dir.considered, points: dir.points },
            relations: P.relations.slice().sort((a, b) => a.length - b.length || (a.join() < b.join() ? -1 : 1)),
            collisions: P.collisionsSeen,
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
