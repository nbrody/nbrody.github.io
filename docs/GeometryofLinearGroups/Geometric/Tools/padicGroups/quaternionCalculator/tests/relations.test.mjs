// Run from the quaternionCalculator directory (Node 22+):
//   node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeneratorsForPrimes, createGeneratorObject, computeProjectiveRelations } from '../quaternionPackage/primeQuaternion.js';
import { canonicalPrimeQuaternions, buildVHComplex } from '../quaternionPackage/vhComplex.js';
import { QMath } from '../quaternionPackage/projectiveQuaternion.js';
import { fillSquareGrid } from '../vis/vis_square.js';

const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
const generatorsFor = async (primes) => createGeneratorObject(await generateGeneratorsForPrimes(primes));
const key = (q) => q.join(',');
const equalUpToSign = (x, y) => key(x) === key(y) || key(x) === key(y.map((v) => -v));

/** Collect console.warn calls made by fn. */
async function warnings(fn) {
    const saved = console.warn, seen = [];
    console.warn = (...args) => seen.push(args.join(' '));
    try { return { value: await fn(), seen }; } finally { console.warn = saved; }
}

test('p + 1 generators per prime, one per point of P¹(F_p), closed under inverse', async () => {
    const G = await generatorsFor(PRIMES);
    for (const p of PRIMES) {
        const keys = Object.keys(G).filter((k) => G[k].prime === p);
        assert.equal(keys.length, p + 1, `p = ${p}`);
        const canonical = new Set(canonicalPrimeQuaternions(p).map(key));
        for (const k of keys) assert.ok(canonical.has(key(G[k].q)), `p = ${p}: ${G[k].q}`);
        assert.equal(new Set(keys.map((k) => G[k].p1Label)).size, p + 1, `p = ${p}: labels`);
        for (const k of keys) {
            const inv = G[G[k].inverseKey];
            assert.deepEqual(inv.q, QMath.conjugate(G[k].q));
            assert.equal(inv.inverse, !G[k].inverse);
        }
    }
});

test('relations are the non-trivial squares ab = ±b′a′, one for each mixed-prime pair', async () => {
    for (const [p, q] of [[5, 13], [3, 5], [7, 11], [3, 7], [13, 17]]) {
        const G = await generatorsFor([p, q]);
        const { value: R, seen } = await warnings(() => computeProjectiveRelations(G));
        assert.deepEqual(seen, [], `(${p}, ${q}) refactorisations not unique`);
        assert.equal(R.length, 2 * (p + 1) * (q + 1));
        for (const r of R) {
            assert.ok(!(r.a === r.bp && r.b === r.ap), 'trivial relation');
            assert.equal(G[r.a].prime, G[r.ap].prime);
            assert.equal(G[r.b].prime, G[r.bp].prime);
            assert.notEqual(G[r.a].prime, G[r.b].prime);
            assert.ok(equalUpToSign(QMath.multiply(G[r.a].q, G[r.b].q), QMath.multiply(G[r.bp].q, G[r.ap].q)));
        }
    }
});

test('relations agree with the square complex of vhComplex.js', async () => {
    const [p, q] = [5, 13];
    const G = await generatorsFor([p, q]);
    const R = computeProjectiveRelations(G);
    const X = buildVHComplex(p, q);
    const byQ = new Map(Object.keys(G).map((k) => [key(G[k].q), k]));
    X.A.forEach((a, i) => X.B.forEach((b, j) => {
        const [bp, ap] = X.relation(i, j);
        const r = R.find((x) => x.a === byQ.get(key(a.q)) && x.b === byQ.get(key(b.q)));
        assert.equal(r.bp, byQ.get(key(X.B[bp].q)));
        assert.equal(r.ap, byQ.get(key(X.A[ap].q)));
    }));
});

test('three primes: every pair of distinct primes gets its squares', async () => {
    const G = await generatorsFor([3, 5, 7]);
    const R = computeProjectiveRelations(G);
    assert.equal(R.length, 2 * (4 * 6 + 4 * 8 + 6 * 8));
});

test('2D square complex: the grid fills completely and every square is a relation', async () => {
    const G = await generatorsFor([5, 13]);
    const R = computeProjectiveRelations(G);
    const keys = Object.keys(G);
    const depth = 4;
    for (const [x, y] of [[keys[0], keys.find((k) => G[k].prime === 13)], [keys[3], keys.at(-1)]]) {
        const { horz, vert } = fillSquareGrid(R, depth, x, y);
        for (let i = -depth; i < depth; i++) {
            for (let j = -depth; j < depth; j++) {
                const bottom = horz.get(`${i},${j}`), top = horz.get(`${i},${j + 1}`);
                const left = vert.get(`${i},${j}`), right = vert.get(`${i + 1},${j}`);
                assert.ok(bottom && top && left && right, `square (${i}, ${j}) unfilled`);
                assert.ok(equalUpToSign(QMath.multiply(G[bottom].q, G[right].q), QMath.multiply(G[left].q, G[top].q)),
                    `square (${i}, ${j}) is not a relation`);
            }
        }
        for (let i = -depth; i < depth; i++) assert.equal(horz.get(`${i},0`), x);
        for (let j = -depth; j < depth; j++) assert.equal(vert.get(`0,${j}`), y);
    }
});
