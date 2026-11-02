// node --test tests/placeVolumes.test.mjs — the volume at every place at ∞ (placeVolumes.js), through archWorker.js
// as step 2 runs it. FLMS (m003(−4,1)) against the Sage values of its Bloch invariant, arithmetic examples (0 at
// every other place), and Jørgensen's n = 4 orbifold (torsion, two complex places of k).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.self = globalThis;
await import('../js/archWorker.js');
const handler = globalThis.onmessage;
globalThis.onmessage = null;

const { buildGroup } = await import('../../Geometric/Tools/Kleinian/poincare/js/matrixInput.js');
const { exampleLibrary } = await import('../../Geometric/Tools/Kleinian/poincare/js/groupLibrary.js');
const { fieldModel } = await import('../../Geometric/Tools/discretenessAlgorithm/js/field.js');
const { archClasses, sameTaus } = await import('../js/archPlaces.js');
const { blochWigner, placeVolumes } = await import('../js/placeVolumes.js');

/** One message to the worker's handler; the messages it posts, in order. */
function call(data) {
    const out = [];
    globalThis.postMessage = (m) => out.push(m);
    try { handler({ data }); } finally { globalThis.postMessage = undefined; }
    return out;
}

/**
 * Step 2 on a library example, at its own embedding: the worker's verdict and cycle, then the volume at every
 * embedding of F (one per conjugate pair), grouped into places as main.js groups them (same tr²/det values).
 */
function volumesOf(name) {
    const ex = exampleLibrary.find((e) => e.name === name);
    const state = { mats: ex.mats, anti: ex.mats.map(() => false), consts: ex.consts };
    const msgs = call({ id: 1, state, maxFaces: 96, maxDepth: ex.depth || 8, certify: false, cycle: true });
    const done = msgs.find((m) => m.phase === 'done');
    assert.ok(done && done.summary.status === 'verified', `${name}: Poincaré verified`);
    const late = msgs.find((m) => m.phase === 'cycle');
    const cycle = done.summary.cycle || (late && late.cycle);
    assert.ok(cycle && cycle.ok, `${name}: a cycle (${cycle && cycle.reason})`);
    const { exactCtx } = buildGroup(state);
    const model = fieldModel(exactCtx);
    const arch = archClasses(model);
    const res = placeVolumes(cycle, model, arch.map((a) => ({ key: a.rootIndex, root: a.root })), model.roots[model.defaultIndex], done.summary.volume);
    assert.ok(res.ok, `${name}: checks pass (${res.reason})`);
    const places = [];
    for (const a of arch) {
        const g = places.find((p) => sameTaus(p[0].taus, a.taus));
        if (g) g.push(a); else places.push([a]);
    }
    return { res, summary: done.summary, late: !!late, cycle, values: places.map((p) => p.map((a) => Math.abs(res.at.get(a.rootIndex).value))) };
}

const close = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${what}: ${x} vs ${y}`);
/** Each place's values agree, and the places' values, sorted, are `want`. */
function expectPlaces(values, want, tol, name) {
    for (const p of values) for (const v of p) close(v, p[0], tol, `${name}: embeddings over one place`);
    const got = values.map((p) => p[0]).sort((a, b) => a - b);
    assert.equal(got.length, want.length, `${name}: ${got.length} places`);
    got.forEach((v, i) => close(v, want[i], tol, `${name}: place ${i}`));
}

test('the Bloch–Wigner dilogarithm', () => {
    close(blochWigner({ re: 0.5, im: Math.sqrt(3) / 2 }), 1.0149416064096536, 1e-15, 'regular ideal tetrahedron');
    close(blochWigner({ re: 0, im: 1 }), 0.915965594177219, 1e-15, 'D(i) = Catalan');
    for (const z of [{ re: 0, im: 0 }, { re: 1, im: 0 }, { re: 7.5, im: 0 }, { re: -2, im: 0 }]) close(blochWigner(z), 0, 1e-15, 'real');
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 * 6 - 3; };
    const c = (re, im) => ({ re, im });
    const div = (a, b) => { const q = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
    const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    const one = c(1, 0), sub = (a, b) => c(a.re - b.re, a.im - b.im);
    for (let t = 0; t < 200; t++) {
        const x = c(rnd(), rnd()), y = c(rnd(), rnd());
        const D = blochWigner;
        // D(1 − z) = D(1/z) = D(z̄) = −D(z), and the five-term relation
        close(D(sub(one, x)), -D(x), 1e-12, 'D(1 − z)');
        close(D(div(one, x)), -D(x), 1e-12, 'D(1/z)');
        close(D(c(x.re, -x.im)), -D(x), 1e-12, 'D(z̄)');
        const xy = mul(x, y), oxy = sub(one, xy);
        close(D(x) + D(y) + D(div(sub(one, x), oxy)) + D(oxy) + D(div(sub(one, y), oxy)), 0, 1e-11, 'five-term');
    }
});

test('FLMS = m003(−4,1): D(β) at its two complex places of k, and 0 at the real one', () => {
    const { res, values, cycle } = volumesOf('FLMS');
    assert.equal(cycle.simple, cycle.vertices, 'torsion-free: every vertex simple');
    close(res.value, 1.4236119003, 1e-9, 'the volume');
    // the Sage computation of β = [θ²] − [θ]: D at the geometric root and at the other complex root of θ
    expectPlaces(values, [0, 0.2143207841, 1.4236119003], 1e-9, 'FLMS');
    assert.ok(res.check.z < 1e-10 && res.check.ref < 1e-10);
});

test('Weeks manifold (arithmetic): 0 at every other place', () => {
    const { res, values } = volumesOf('Weeks manifold (closed)');
    close(res.value, 0.9427073627769277, 1e-10, 'the volume');
    expectPlaces(values, [0, 0.9427073627769277], 1e-9, 'Weeks');
});

test('Jørgensen’s n = 2 orbifold (arithmetic, torsion): 0 at every other place', () => {
    const { res, values, late, cycle } = volumesOf('Jorgensen fibered (n=2)');
    assert.ok(late, 'the basepoint j lies on an axis of rotation, so the cycle comes from another basepoint');
    assert.ok(cycle.simple < cycle.vertices, 'cells with more than four corners (on the axes)');
    close(res.value, 1.3934022782, 1e-9, 'the volume');
    // k is quartic with one complex place; Γ is bounded at its two real places
    expectPlaces(values, [0, 0, 1.3934022782], 1e-8, 'Jørgensen n = 2');
});

test('Jørgensen’s n = 4 orbifold (non-arithmetic): a second complex place of k with nonzero volume', () => {
    const { res, values } = volumesOf('Jorgensen fibered (n=4)');
    close(res.value, 1.8574619899, 1e-9, 'the volume');
    // the same value from the domains at two other basepoints (placeVolumes probe); the largest root loses digits
    // k has degree 8: two complex places, where Γ is unbounded, and four real ones, where it is bounded
    expectPlaces(values, [0, 0, 0, 0, 0.7413525739, 1.8574619899], 1e-7, 'Jørgensen n = 4');
});

test('a cusped domain gets no cycle', () => {
    const ex = exampleLibrary.find((e) => e.name === 'Figure eight knot group');
    const state = { mats: ex.mats, anti: ex.mats.map(() => false), consts: ex.consts || [] };
    const msgs = call({ id: 1, state, maxFaces: 96, maxDepth: 8, certify: false, cycle: true });
    const done = msgs.find((m) => m.phase === 'done');
    assert.ok(done.summary.status === 'verified' && done.summary.cusps > 0);
    assert.ok(!done.summary.cycle && !done.summary.cyclePending && !msgs.some((m) => m.phase === 'cycle'));
});
