// Run from the quaternionCalculator directory (Node 22+):
//   node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVHComplex, canonicalPrimeQuaternions, zarankiewicz } from '../quaternionPackage/vhComplex.js';

const PAIRS = [[3, 5], [5, 3], [3, 7], [5, 13], [7, 11], [5, 17], [13, 17], [3, 13], [7, 19]];

const qmul = (x, y) => [
    x[0] * y[0] - x[1] * y[1] - x[2] * y[2] - x[3] * y[3],
    x[0] * y[1] + x[1] * y[0] + x[2] * y[3] - x[3] * y[2],
    x[0] * y[2] - x[1] * y[3] + x[2] * y[0] + x[3] * y[1],
    x[0] * y[3] + x[1] * y[2] - x[2] * y[1] + x[3] * y[0]
];

test('canonical generators: p + 1 of them, closed under conjugation, right parity', () => {
    for (const p of [3, 5, 7, 11, 13, 17, 19, 23, 29]) {
        const gens = canonicalPrimeQuaternions(p);
        assert.equal(gens.length, p + 1);
        const keys = new Set(gens.map((x) => x.join(',')));
        for (const [a, b, c, d] of gens) {
            assert.equal(a * a + b * b + c * c + d * d, p);
            assert.ok(a > 0 && a % 2 === 1);
            assert.equal(Math.abs(d) % 2, 0);
            if (p % 4 === 1) assert.ok(b % 2 === 0 && c % 2 === 0);
            else assert.ok(Math.abs(b) % 2 === 1 && Math.abs(c) % 2 === 1);
            assert.ok(keys.has([a, -b, -c, -d].join(',')));
        }
    }
});

test('X_{p,q}: one vertex, (p+1)/2 + (q+1)/2 loops, (p+1)(q+1)/4 squares, every square a relation', () => {
    for (const [p, q] of PAIRS) {
        const X = buildVHComplex(p, q);
        assert.equal(X.hEdges.length, (p + 1) / 2);
        assert.equal(X.vEdges.length, (q + 1) / 2);
        assert.equal(X.squares.length, (p + 1) * (q + 1) / 4);
        assert.equal(X.euler, (p - 1) * (q - 1) / 4);
        for (const s of X.squares) {
            const lhs = qmul(X.A[s.bottom].q, X.B[s.right].q);
            const rhs = qmul(X.B[s.left].q, X.A[s.top].q).map((v) => s.sign * v);
            assert.deepEqual(lhs, rhs, `square ${JSON.stringify(s)} for (${p}, ${q})`);
        }
    }
});

test('vertex link is K_{p+1,q+1}: every (horizontal end, vertical end) is exactly one corner', () => {
    for (const [p, q] of PAIRS) {
        const X = buildVHComplex(p, q);
        const seen = new Map();
        const bump = (a, b) => { const k = `${a},${b}`; seen.set(k, (seen.get(k) || 0) + 1); };
        for (const s of X.squares) {
            // corners as (outgoing horizontal generator, outgoing vertical generator)
            bump(s.bottom, s.left);
            bump(X.A[s.bottom].inv, s.right);
            bump(s.top, X.B[s.left].inv);
            bump(X.A[s.top].inv, X.B[s.right].inv);
        }
        assert.equal(seen.size, (p + 1) * (q + 1));
        for (const v of seen.values()) assert.equal(v, 1);
    }
});

test('hyperplanes: vertical ones are (q+1)-regular graphs on the horizontal edges, and vice versa', () => {
    for (const [p, q] of PAIRS) {
        const X = buildVHComplex(p, q);
        const deg = (n, arcs) => {
            const d = new Array(n).fill(0);
            arcs.forEach((a) => { d[a.from]++; d[a.to]++; });
            return d;
        };
        assert.ok(deg(X.hEdges.length, X.vArcs).every((d) => d === q + 1));
        assert.ok(deg(X.vEdges.length, X.hArcs).every((d) => d === p + 1));
        const total = (H) => H.components.reduce((n, c) => n + c.squares.length, 0);
        assert.equal(total(X.vHyperplanes), X.squares.length);
        assert.equal(total(X.hHyperplanes), X.squares.length);
    }
});

test('a square with top = bottom⁻¹ makes its vertical hyperplane one-sided', () => {
    const X = buildVHComplex(3, 5);
    const twisted = X.squares.some((s) => s.top === X.A[s.bottom].inv);
    assert.ok(twisted);
    assert.ok(X.vHyperplanes.components.some((c) => !c.twoSided));
});

test('Zarankiewicz numbers', () => {
    assert.equal(zarankiewicz(3, 3), 1);
    assert.equal(zarankiewicz(6, 14), 252);
    assert.equal(zarankiewicz(4, 6), 12);
});

test('the double cover of a hyperplane is connected exactly when the hyperplane is one-sided', () => {
    for (const [p, q] of PAIRS) {
        const X = buildVHComplex(p, q);
        for (const H of [X.vHyperplanes, X.hHyperplanes]) {
            for (const c of H.components) assert.equal(c.coverComponents, c.twoSided ? 2 : 1);
        }
    }
});
