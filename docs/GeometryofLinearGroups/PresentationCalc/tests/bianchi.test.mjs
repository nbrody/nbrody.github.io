// node --test tests/bianchi.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RINGS, bianchiWord, indexInBianchi, wordMatrices } from '../js/bianchi.js';

// random words in a, t, u (, l), kept when the lower-left entry is divisible by π
function gamma0(d, pi, n, seed) {
    const { p, q } = RINGS[d];
    const mul = (x, y) => [x[0] * y[0] + q * x[1] * y[1], x[0] * y[1] + x[1] * y[0] + p * x[1] * y[1]];
    const add = (x, y) => [x[0] + y[0], x[1] + y[1]];
    const mm = (A, C) => [add(mul(A[0], C[0]), mul(A[1], C[2])), add(mul(A[0], C[1]), mul(A[1], C[3])), add(mul(A[2], C[0]), mul(A[3], C[2])), add(mul(A[2], C[1]), mul(A[3], C[3]))];
    const neg = (x) => [-x[0], -x[1]];
    const G = [[[0n, 0n], [-1n, 0n], [1n, 0n], [0n, 0n]], [[1n, 0n], [1n, 0n], [0n, 0n], [1n, 0n]], [[1n, 0n], [0n, 1n], [0n, 0n], [1n, 0n]]];
    if (d === 1) G.push([[0n, -1n], [0n, 0n], [0n, 0n], [0n, 1n]]);
    if (d === 3) G.push([[0n, 1n], [0n, 0n], [0n, 0n], [1n, -1n]]);
    const all = G.flatMap((g) => [g, [g[3], neg(g[1]), neg(g[2]), g[0]]]);
    const conj = [pi[0] + p * pi[1], -pi[1]], N = mul(pi, conj)[0];
    const divides = (x) => { const v = mul(x, conj); return v[0] % N === 0n && v[1] % N === 0n; };
    let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    const out = [];
    for (let t = 0; t < 400000 && out.length < n; t++) {
        let M = [[1n, 0n], [0n, 0n], [0n, 0n], [1n, 0n]];
        for (let i = 1 + Math.floor(rnd() * 10); i > 0; i--) M = mm(M, all[Math.floor(rnd() * all.length)]);
        if (divides(M[2])) out.push(M);
    }
    return out;
}

test('words multiply back to their matrices', () => {
    for (const d of [1, 2, 3]) for (const M of gamma0(d, [1n, 0n], 50, 3)) assert.ok(bianchiWord(d, M));
});

test('Γ₀(𝔭) in PSL₂(O) has index N(𝔭) + 1, by coset enumeration in poincare’s presentations', () => {
    const cases = [[1, [1n, 1n], 3], [1, [2n, 1n], 6], [1, [3n, 0n], 10], [2, [0n, 1n], 3], [2, [1n, 1n], 4], [3, [1n, 1n], 4], [3, [2n, 0n], 5], [3, [2n, 1n], 8]];
    for (const [d, pi, want] of cases) {
        const r = indexInBianchi(d, gamma0(d, pi, 400, 7 + d), { seconds: 10 });
        assert.equal(r.index, want, `d = ${d}, π = ${pi}`);
    }
});

test('generators read from ringEngine text', () => {
    const [M] = wordMatrices(1, [['1', 'w+1', '0', '1']], [[1, 1]]);
    assert.deepEqual(M, [[1n, 0n], [2n, 2n], [0n, 0n], [1n, 0n]]);
});

test('[PGL₂(O[1/S]) : Λ] = 1 for Λ given by generators, also for a pair of conjugate primes', async () => {
    const { indexInPGL2OS, parseLinear } = await import('../js/bianchi.js');
    const m = (s) => s.split(',').map((e) => { const t = parseLinear(e); return [t[0][0], t[1][0]]; });
    const base = ['0,-1,1,0', '1,1,0,1', '1,w,0,1', 'w,0,0,1'];
    for (const extra of [['1+w,0,0,1'], ['3,0,0,1'], ['1+2w,0,0,1', '1-2w,0,0,1']]) {
        const r = indexInPGL2OS(1, base.concat(extra).map(m), { seconds: 20 });
        assert.equal(r.index, 1, extra.join(' '));
    }
});

test('ℤ[ω] written with w = ω − 1 (the field model may centre the root): w² + w + 1', async () => {
    const { bianchiRing, wordMatrices } = await import('../js/bianchi.js');
    assert.equal(bianchiRing('w^2+w+1'), 3);
    // u′ = (1 w′; 0 1) with w′ = ω − 1 is t⁻¹u in the ring's ω
    const [M] = wordMatrices(3, [['1', 'w', '0', '1']], [[1]], 'w^2+w+1');
    assert.deepEqual(M, [[1n, 0n], [-1n, 1n], [0n, 0n], [1n, 0n]]);
});
