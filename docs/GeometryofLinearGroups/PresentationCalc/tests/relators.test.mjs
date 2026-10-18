// node --test tests/relators.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
const { RelatorSet, reduceCyclic } = await import('../js/relators.js');
const { canonicalRelator } = await import('../js/adelic.js');

const offer = (S, w) => S.offer(canonicalRelator(w));

test('free and cyclic reduction', () => {
    assert.deepEqual(reduceCyclic([1, 2, -2, 3, -1]), [3]);
    assert.deepEqual(reduceCyclic([2, -1, 1, -2]), []);
});

test('powers and conjugates of a kept relator are redundant', () => {
    const S = new RelatorSet();
    assert.equal(offer(S, [2, 2]), 'kept');                 // g₂²
    assert.equal(offer(S, [2, 2, 2, 2]), 'redundant');      // g₂⁴
    assert.equal(offer(S, [-2, -2, -1, -2, -2, 1]), 'redundant');   // g₂⁻² g₁⁻¹ g₂⁻² g₁
    assert.equal(offer(S, [-2, -2, -1, 2, 2, 1]), 'redundant');     // g₂⁻² g₁⁻¹ g₂² g₁
    assert.equal(offer(S, [1, 2, 1, 2, 1, 2]), 'kept');     // (g₁g₂)³ is new
    assert.equal(S.list.length, 2);
});

test('a shorter relator prunes the longer ones it implies', () => {
    const S = new RelatorSet();
    assert.equal(offer(S, [2, 2, 2, 2]), 'kept');           // g₂⁴ first
    assert.equal(offer(S, [1, 1, 1]), 'kept');
    assert.equal(offer(S, [2, 2]), 'kept');                 // then g₂²: g₂⁴ goes
    assert.deepEqual(S.list.map((w) => w.join(',')).sort(), [canonicalRelator([1, 1, 1]), canonicalRelator([2, 2])].map((w) => w.join(',')).sort());
    assert.equal(offer(S, [2, 2, 2, 2]), 'redundant');      // and stays out
});

test('PSL₂(ℤ) = ⟨s, t | s², t³⟩: products of the relators are dropped, (st)⁶ is not implied', () => {
    const S = new RelatorSet();
    offer(S, [1, 1]); offer(S, [2, 2, 2]);
    assert.equal(offer(S, [1, 1, 2, 2, 2]), 'redundant');
    assert.equal(offer(S, [1, 2, 2, 2, -1]), 'known');       // a conjugate of t³ reduces cyclically to t³
    assert.equal(offer(S, [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2]), 'kept');
});

test('the cap keeps the shortest', () => {
    const S = new RelatorSet({ cap: 2 });
    offer(S, [1, 2, 1, 2, 1, 2, 1, 2]); offer(S, [1, 1, 1, 2, 2]);
    assert.equal(offer(S, [1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2]), 'full');
    assert.equal(offer(S, [2, 2]), 'kept');
    assert.ok(S.list.some((w) => w.join(',') === canonicalRelator([2, 2]).join(',')));
});
