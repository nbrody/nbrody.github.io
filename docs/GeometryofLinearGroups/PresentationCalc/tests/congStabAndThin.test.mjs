// node --test tests/congStabAndThin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { certifyCongruenceStabilizer } from '../js/congStab.js';
import { certifyThinQ } from '../js/thinCert.js';
import { parseRationalMatrix, evalWord, isScalar } from '../js/mat2.js';

const rows = (k) => k.split('|').map((m) => m.split(','));

function parseGenWord(tok) {
    // Parse simple words like "g2^2", "(g1*g2)^2", "g1*g2^-1" into signed generator indices ±1, ±2, ...
    const expand = (s) => {
        s = s.trim();
        const paren = s.match(/^\(([^()]+)\)\^(-?\d+)$/);
        if (paren) {
            const inner = expand(paren[1]);
            const exp = Number(paren[2]);
            const unit = exp >= 0 ? inner : inner.slice().reverse().map((x) => -x);
            const out = [];
            for (let i = 0; i < Math.abs(exp); i++) out.push(...unit);
            return out;
        }
        const out = [];
        for (const part of s.split(/[·*\s]+/).filter(Boolean)) {
            const m = part.match(/^g(\d+)(?:\^(-?\d+)|([²³⁴]))?$/);
            assert.ok(m, `unrecognized relator token: ${part}`);
            const g = Number(m[1]);
            const exp = m[2] != null ? Number(m[2]) : m[3] ? ({ '²': 2, '³': 3, '⁴': 4 }[m[3]]) : 1;
            const step = exp >= 0 ? g : -g;
            for (let i = 0; i < Math.abs(exp); i++) out.push(step);
        }
        return out;
    };
    return expand(tok);
}

test('certifyCongruenceStabilizer certifies S-arithmeticity of 2,1,0,1|1,0,5,3', () => {
    const r = rows('2,1,0,1|1,0,5,3');
    const res = certifyCongruenceStabilizer(r, [2, 3], { seconds: 4 });
    assert.equal(res.ok, true);
    assert.equal(res.stabIndex, 12);
    assert.ok(res.used >= 2);
});

test('certifyCongruenceStabilizer is sound: rejects genuinely thin pairs', () => {
    const r = rows('7,2,3,1|0,2,3,0');
    const res = certifyCongruenceStabilizer(r, [2, 3], { seconds: 1.5 });
    assert.equal(res.ok, false);
});

test('certifyThinQ certifies adelic ping-pong thin pairs and verifies relators exactly', () => {
    for (const [key, S] of [
        ['7,2,3,1|0,2,3,0', [2, 3]],
        ['5,1,0,1|2,3,1,-2', [5, 7]],
    ]) {
        const r = rows(key);
        const mats = r.map(parseRationalMatrix);
        const res = certifyThinQ(r, S, { seconds: 15 });
        assert.equal(res.ok, true, `expected thin certificate on ${key}`);
        assert.ok(['adelic-pingpong', 'tower-pingpong'].includes(res.method));
        assert.ok(res.presentation && Array.isArray(res.presentation.relators));
        for (const rel of res.presentation.relators) {
            const w = Array.isArray(rel) ? rel : parseGenWord(rel);
            assert.ok(isScalar(evalWord(mats, w)), `relator ${rel} must evaluate to scalar identity for ${key}`);
        }
    }
});

test('certifyThinQ certifies tower and split adelic ping-pong thin pairs (ℤ ∗ ℤ/2)', () => {
    for (const [key, S] of [
        ['5,2,2,1|0,1,-6,0', [2, 3]],
        ['4,1,1,0|0,2,3,0', [2, 3]],
    ]) {
        const r = rows(key);
        const mats = r.map(parseRationalMatrix);
        const res = certifyThinQ(r, S, { seconds: 15 });
        assert.equal(res.ok, true, `expected thin certificate on ${key} (S=${S})`);
        assert.ok(['adelic-pingpong', 'tower-pingpong'].includes(res.method));
        assert.ok(res.presentation && res.presentation.relators.length >= 1);
        for (const rel of res.presentation.relators) {
            const w = Array.isArray(rel) ? rel : parseGenWord(rel);
            assert.ok(isScalar(evalWord(mats, w)), `relator ${rel} must hold in PGL₂(ℚ) for ${key}`);
        }
    }
});

test('certifyThinQ soundness: refuses to certify S-arithmetic and non-discrete pairs', () => {
    // S-arithmetic pair (index 12 stabilizer)
    const sarith = certifyThinQ(rows('2,1,0,1|1,0,5,3'), [2, 3], { seconds: 1.5 });
    assert.equal(sarith.ok, false);

    // Non-discrete pair (g₁⁻¹ g₂ is an irrational elliptic rotation at ∞)
    const nonDiscrete = certifyThinQ(rows('0,1,1,-2|0,2,3,0'), [2, 3], { seconds: 1.5 });
    assert.equal(nonDiscrete.ok, false);
});
