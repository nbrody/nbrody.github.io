// node --test docs/designStudio/palettes/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToOklch, oklchToHex, hexToRgb, rgbToHex, rgbToOklab, oklabToRgb, maxChroma, maxChromaExact, gamutMapOklch, oklchToOklab, oklabToLinearRgb, linearInGamut } from '../js/color.js';
import { suggest, vary, CONTEXTS, SOURCES } from '../js/complete.js';
import { makeScorer } from '../js/model.js';
import { MODEL, CORPUS } from '../js/corpus.js';

test('OKLab round trip', () => {
    for (const hex of ['#000000', '#ffffff', '#818cf8', '#e69f00', '#123456', '#ff0000']) {
        assert.equal(rgbToHex(oklabToRgb(rgbToOklab(hexToRgb(hex)))), hex);
        assert.equal(oklchToHex(hexToOklch(hex)), hex);
    }
});

test('known OKLab values', () => {
    const [L, a, b] = rgbToOklab([1, 1, 1]);
    assert.ok(Math.abs(L - 1) < 1e-4 && Math.abs(a) < 1e-4 && Math.abs(b) < 1e-4);
    const red = rgbToOklab([1, 0, 0]);
    assert.ok(Math.abs(red[0] - 0.62796) < 1e-3 && Math.abs(red[1] - 0.22486) < 1e-3);
});

test('chroma table tracks bisection; gamut mapping always lands in gamut', () => {
    // The table is linear between samples, so it rounds off the sharp kink at
    // each hue's cusp (worst near blue, about 0.035); elsewhere it is close.
    let sum = 0, worst = 0;
    const N = 4000;
    for (let k = 0; k < N; k++) {
        const L = 0.05 + 0.9 * Math.random(), h = 360 * Math.random();
        const d = Math.abs(maxChroma(L, h) - maxChromaExact(L, h));
        sum += d; worst = Math.max(worst, d);
        const g = gamutMapOklch([L, 0.4 * Math.random(), h]);
        assert.ok(linearInGamut(oklabToLinearRgb(oklchToOklab(g))));
    }
    assert.ok(sum / N < 0.003, `mean table error ${sum / N}`);
    assert.ok(worst < 0.05, `worst table error ${worst}`);
});

const scorer = makeScorer(MODEL);
const allSources = new Set([...Object.keys(SOURCES), 'harmony']);

test('locked colors come back exactly, in their slots', () => {
    const locked = [{ slot: 0, hex: '#818cf8' }, { slot: 3, hex: '#e8b960' }];
    const t0 = Date.now();
    const out = suggest({ locked, n: 6, ctx: CONTEXTS.free, scorer, sources: allSources, seed: 1 });
    const ms = Date.now() - t0;
    console.log(`  two seeds, n=6: ${out.length} suggestions in ${ms} ms`);
    assert.equal(out.length, 24);
    for (const p of out) {
        assert.equal(p.colors.length, 6);
        assert.equal(p.colors[0], '#818cf8');
        assert.equal(p.colors[3], '#e8b960');
        assert.ok(p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)));
    }
    assert.ok(ms < 4000);
});

test('no seeds, three seeds, poincare context, variations', () => {
    let t0 = Date.now();
    const a = suggest({ n: 8, ctx: CONTEXTS.poincare, scorer, sources: allSources, seed: 2 });
    console.log(`  no seeds, n=8: ${Date.now() - t0} ms`);
    assert.equal(a.length, 24);
    t0 = Date.now();
    const b = suggest({ locked: [{ slot: 0, hex: '#2f6fde' }, { slot: 1, hex: '#c8553d' }, { slot: 2, hex: '#f0e6d2' }], n: 5, ctx: CONTEXTS.free, scorer, sources: allSources, seed: 3 });
    console.log(`  three seeds, n=5: ${Date.now() - t0} ms`);
    assert.ok(b.every((p) => p.colors[2] === '#f0e6d2'));
    t0 = Date.now();
    const c = vary({ colors: a[0].colors, ctx: CONTEXTS.poincare, scorer, seed: 4 });
    console.log(`  variations: ${Date.now() - t0} ms`);
    assert.equal(c.length, 24);
    console.log('  poincare, no seeds:');
    for (const p of a.slice(0, 8)) console.log('   ', p.colors.join(' '), '·', p.from ? `${p.from.name} (${p.from.source})` : p.how, p.note, p.quality.toFixed(2));
});
