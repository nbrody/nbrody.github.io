// Random groups for ⌘-click on the die (js/randomGroup.js): valid generating sets, and about 40% of
// them in the database's range.
import test from 'node:test';
import assert from 'node:assert/strict';

const { randomGroup, inDatabaseScope } = await import('../js/randomGroup.js');
const { rng, detNF, FIELDS } = await import('../batch/enumerateNF.mjs');

test('every generator is invertible and not a scalar, with at least two generators', () => {
    const rand = rng(11);
    for (let i = 0; i < 2000; i++) {
        const g = randomGroup(rand);
        assert.ok(g.gens.length >= 2, `draw ${i}: ${g.gens.length} generators`);
        assert.equal(g.mats.length, g.gens.length);
        for (const m of g.gens) {
            const scalar = m[1].every((x) => !x) && m[2].every((x) => !x) && m[0].join() === m[3].join();
            assert.ok(!scalar, `draw ${i}: a scalar generator`);
            if (g.degree === 1) assert.notEqual(m[0][0] * m[3][0] - m[1][0] * m[2][0], 0, `draw ${i}: det 0`);
        }
        if (g.consts.length) assert.match(g.consts[0].poly, /^w/);
    }
});

test('about 40% of the draws lie in the database’s range', () => {
    const rand = rng(2026), N = 6000;
    let inScope = 0;
    for (let i = 0; i < N; i++) if (randomGroup(rand).scope) inScope++;
    const rate = inScope / N;
    assert.ok(rate > 0.37 && rate < 0.43, `in scope ${(100 * rate).toFixed(1)}%`);
});

test('the scope check matches the database’s bounds', () => {
    const Q = { key: null, degree: 1 };
    const int = (m) => m.map((x) => [x]);
    // σ₁((1 1; 0 1)) = golden ratio; σ₁((16 0; 0 1)) = 16 > 15
    assert.ok(inDatabaseScope(Q, [int([1, 1, 0, 1]), int([1, 0, 1, 1])]));
    assert.ok(!inDatabaseScope(Q, [int([1, 1, 0, 1]), int([16, 0, 0, 1])]));
    assert.ok(!inDatabaseScope(Q, Array(5).fill(int([1, 1, 0, 1]))), 'at most 4 generators over ℚ');
    // over ℚ(i): (1 w; 0 1) has e^h = golden ratio ≤ 2, (1 2w; 0 1) does not
    const K = { key: 'i', degree: 2, database: true };
    const u = (x) => [[1, 0], x, [0, 0], [1, 0]];
    assert.ok(inDatabaseScope(K, [u([0, 1]), u([1, 1])]));
    assert.ok(!inDatabaseScope(K, [u([0, 1]), u([0, 2])]));
    assert.ok(!inDatabaseScope(K, [u([0, 1]), u([1, 1]), u([1, 0])]), 'pairs only over the fields');
    assert.equal(detNF(FIELDS.i, u([0, 1])).join(), '1,0');
});
