import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PALETTE, PALETTES, PALETTE_IDS, ROPE_PERIOD,
  samplePaletteLinear, samplePaletteSrgb,
  cumulativeArcLengths, createStrandColorState, stepStrandColorState, strandPhaseAt, ringColorsForStrand,
} from '../js/palettes.js';

test('default palette is vaporwave and all gradient palettes wrap smoothly with period 1', () => {
  assert.equal(DEFAULT_PALETTE, 'vaporwave');
  assert.ok(PALETTE_IDS.includes('vaporwave'));
  assert.ok(PALETTE_IDS.length >= 5);

  for (const id of PALETTE_IDS) {
    if (PALETTES[id].solid) continue;
    for (const base of [0, 0.17, 0.5, 0.83, 1]) {
      const a = samplePaletteLinear(id, base);
      const b = samplePaletteLinear(id, base + 1);
      const c = samplePaletteLinear(id, base - 3);
      for (let ch = 0; ch < 3; ch++) {
        assert.ok(Math.abs(a[ch] - b[ch]) < 1e-9, `${id} periodic +1 at ${base}`);
        assert.ok(Math.abs(a[ch] - c[ch]) < 1e-9, `${id} periodic -3 at ${base}`);
      }
    }
    // Check C^1 continuity across the full cycle (including wrap seam u = 0 ≡ 1):
    // doubling sample density must halve the maximum step size.
    const maxStepAt = N => {
      let m = 0;
      for (let i = 0; i < N; i++) {
        const p0 = samplePaletteSrgb(id, i / N);
        const p1 = samplePaletteSrgb(id, (i + 1) / N);
        const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        if (d > m) m = d;
      }
      return m;
    };
    const s500 = maxStepAt(500), s2000 = maxStepAt(2000);
    assert.ok(s500 < 0.05, `${id} bounded gradient speed (${s500.toFixed(4)})`);
    assert.ok(s2000 < 0.015 && s2000 < s500 * 0.4, `${id} C^1 continuous (${s2000.toFixed(4)} vs ${s500.toFixed(4)})`);
  }
});

test('closure smoothing preserves drawn colors at t=0, stays seam-free at all t, and relaxes to integer period', () => {
  for (const [closedLen, expectedK] of [
    [ROPE_PERIOD * 3.41, 3],
    [ROPE_PERIOD * 2.64, 3],
    [ROPE_PERIOD * 0.35, 1],
  ]) {
    const openLen = closedLen * 0.95;
    const st = createStrandColorState({
      openLength: openLen,
      closedLength: closedLen,
      period: ROPE_PERIOD,
      animate: true,
      phaseOffset: 0.12,
    });
    assert.equal(st.targetK, expectedK);
    assert.equal(st.progress, 0);

    // At t = 0, the bulk of the drawn rope keeps its exact pre-closure phase s / ROPE_PERIOD + offset
    for (const u of [0, 0.15, 0.4, 0.7, 0.85]) {
      const expected = 0.12 + (closedLen * u) / ROPE_PERIOD;
      assert.ok(Math.abs(strandPhaseAt(u, st) - expected) < 1e-9, `pre-closure phase preserved at u=${u}`);
    }

    // Step through the animation and verify seam-free closure & smooth temporal evolution at every frame
    let prevMid = strandPhaseAt(0.5, st);
    let steps = 0;
    while (st.progress < 1 && steps++ < 200) {
      const pStart = strandPhaseAt(0, st);
      const pEnd = strandPhaseAt(1, st);
      assert.ok(Math.abs((pEnd - pStart) - expectedK) < 1e-9, 'exact integer winding across seam');
      const cStart = samplePaletteLinear('vaporwave', pStart);
      const cEnd = samplePaletteLinear('vaporwave', pEnd);
      for (let ch = 0; ch < 3; ch++) {
        assert.ok(Math.abs(cStart[ch] - cEnd[ch]) < 1e-9, 'zero color seam on closed loop');
      }
      stepStrandColorState(st, 1 / 60);
      const curMid = strandPhaseAt(0.5, st);
      assert.ok(Math.abs(curMid - prevMid) < 0.06, 'smooth frame-to-frame phase transition');
      prevMid = curMid;
    }
    assert.equal(st.progress, 1);

    // At completion (t = 1), phase is strictly linear with integer period expectedK
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      assert.ok(Math.abs(strandPhaseAt(u, st) - (0.12 + expectedK * u)) < 1e-9);
    }
  }
});

test('ringColorsForStrand colors open strokes by rope length and closed strands seamlessly', () => {
  const N = 64;
  const circle = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    circle[3 * i] = 0.15 * Math.cos(a);
    circle[3 * i + 1] = 0.15 * Math.sin(a);
    circle[3 * i + 2] = 0;
  }
  const { total } = cumulativeArcLengths(circle, true);
  const st = createStrandColorState({ closedLength: total, period: ROPE_PERIOD, animate: false });
  const colors = ringColorsForStrand(circle, { closed: true, paletteId: 'vaporwave', state: st });
  assert.equal(colors.length, 3 * N);
  // Ring N-1 is adjacent to ring 0 across the closure edge: colors must be neighbors, not a seam jump
  const dSeam = Math.hypot(
    colors[0] - colors[3 * (N - 1)],
    colors[1] - colors[3 * (N - 1) + 1],
    colors[2] - colors[3 * (N - 1) + 2],
  );
  assert.ok(dSeam < 0.25, `closed ring colors are continuous across seam (${dSeam.toFixed(4)})`);
});

test('liftPlanarCurve on a figure-8 lemniscate produces finite coordinates and valid gradient colors', async () => {
  const { resampleClosed, liftPlanarCurve, closedLength } = await import('../js/knot.js');
  const N = 80, flat3 = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    flat3[3 * i] = 0.12 * Math.sin(t);
    flat3[3 * i + 1] = 0.08 * Math.sin(2 * t);
  }
  const even = resampleClosed(flat3, 360);
  const p2 = new Float64Array(720);
  for (let i = 0; i < 360; i++) { p2[2 * i] = even[3 * i]; p2[2 * i + 1] = even[3 * i + 1]; }
  const { pts, crossings } = liftPlanarCurve(p2, 'alternate', 0.012);
  assert.equal(crossings, 1);
  assert.ok(pts.every(Number.isFinite), 'all lifted 3D coordinates are finite');
  const st = createStrandColorState({ closedLength: closedLength(pts), animate: true });
  const colors = ringColorsForStrand(pts, { closed: true, paletteId: 'vaporwave', state: st });
  assert.ok(colors.every(Number.isFinite), 'all ring colors are finite');
});
