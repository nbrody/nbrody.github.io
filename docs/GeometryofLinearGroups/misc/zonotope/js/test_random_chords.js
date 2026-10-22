// node js/test_random_chords.js
// randomChords must hand Figure 6 a real arrangement for every n on the slider.
const assert = require('assert');
const HG = require('./hexagrid.js');

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

for (let n = 3; n <= 8; n++) {
    for (let seed = 1; seed <= 12; seed++) {
        const rng = mulberry32(n * 1000 + seed);
        const t0 = Date.now();
        const chords = HG.randomChords(n, rng);
        const ms = Date.now() - t0;
        assert.ok(chords, `n=${n} seed=${seed} returned null`);
        assert.strictEqual(chords.length, n);
        assert.ok(chords.every(c => c && Number.isFinite(c[0]) && Number.isFinite(c[1])), `n=${n} seed=${seed} bad chord`);
        const arr = HG.arrangement(chords, -Math.PI / 2 - 0.3);
        assert.ok(arr.valid, `n=${n} seed=${seed} not every pair crosses inside the circle`);
        assert.ok(HG.isTiling(arr.tiling), `n=${n} seed=${seed} dual is not a tiling`);
        for (const k in arr.X) {
            assert.ok(Math.hypot(...arr.X[k]) <= 0.86 + 1e-9, `n=${n} seed=${seed} crossing outside the drawing disk`);
        }
        assert.ok(ms < 1000, `n=${n} seed=${seed} took ${ms}ms`);
    }
}

// The failure mode that used to throw: a null return must not be what n=8 produces,
// and arrangement(null) is still the crash the page has to avoid.
assert.throws(() => HG.arrangement(null, 0), TypeError);
console.log('random chords ok for n = 3..8');
