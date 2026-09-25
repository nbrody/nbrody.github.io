// ═══════════════════════════════════════════════════════════════════
//  Ice Wall — palettes, scenes, colour math
//
//  The relief is gradient-mapped: the shader computes how much light
//  reaches each point and looks the answer up in a 256-entry ramp. The
//  ramps are interpolated in OKLab (so they stay smooth and saturated)
//  and hue-rotated in OKLCh.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Stops are sRGB, dark (deep shadow) → light (sunlit frost).
  // `water` tints what the meltwater covers.
  const PALETTES = {
    linq: {
      name: 'LINQ blue', water: '#4fb8ff',
      stops: [[0, '#060b2e'], [0.1, '#10267f'], [0.26, '#2150c2'], [0.44, '#4786dc'],
              [0.62, '#82b6ef'], [0.8, '#c4e1fa'], [0.92, '#e7f4ff'], [1, '#fbfdff']],
    },
    glacier: {
      name: 'Glacier', water: '#55e3d6',
      stops: [[0, '#021118'], [0.12, '#053747'], [0.3, '#0c6b84'], [0.48, '#249eb4'],
              [0.66, '#6ecdd8'], [0.82, '#bbecef'], [1, '#f6fffe']],
    },
    aurora: {
      name: 'Aurora', water: '#6ff0c8',
      stops: [[0, '#07031a'], [0.14, '#1e0c4d'], [0.3, '#2c2f88'], [0.47, '#1f6b9c'],
              [0.63, '#34ad9f'], [0.8, '#98efcd'], [1, '#f3fff9']],
    },
    alpenglow: {
      name: 'Alpenglow', water: '#8fb6ff',
      stops: [[0, '#120a2e'], [0.15, '#2b2470'], [0.33, '#5953ae'], [0.52, '#a38ccb'],
              [0.68, '#e9b1bc'], [0.84, '#ffd6ae'], [1, '#fff7ea']],
    },
    midnight: {
      name: 'Midnight', water: '#2f7dff',
      stops: [[0, '#010208'], [0.2, '#040c25'], [0.4, '#0b2358'], [0.6, '#1d4b9b'],
              [0.77, '#4f87d0'], [0.9, '#a7c9f1'], [1, '#eef5ff']],
    },
    emerald: {
      name: 'Emerald', water: '#5cf0b0',
      stops: [[0, '#010d08'], [0.16, '#053b27'], [0.36, '#0e7550'], [0.56, '#35ab7c'],
              [0.74, '#8cdcb3'], [0.9, '#d4f7e4'], [1, '#f7fffa']],
    },
    silver: {
      name: 'Silver', water: '#a4ccff',
      stops: [[0, '#06080b'], [0.18, '#1d232c'], [0.4, '#4a5563'], [0.62, '#8894a4'],
              [0.8, '#c4cdd8'], [1, '#fbfcfd']],
    },
  };

  // Every look parameter, with the LINQ scene's values as defaults.
  // Display settings (LED panel, quality, grain) are not part of a scene.
  const BASE = {
    palette: 'linq', hue: 0, exposure: 1.0,
    frost: 0.86, clump: 1.0, relief: 1.0, macro: 1.0, scale: 1.0,
    fracture: 0.14, blockDensity: 5.5, crack: 0.05, jitter: 0.9, joint: 0, pattern: 'floes', cellTint: 0.25,
    speed: 0.45, warp: 1.1, drift: 0.35,
    lightAngle: 135, lightHeight: 34, lightSweep: true, shadow: 0.85,
    sparkle: 0.55, stars: true, bloom: 0.45,
    water: true, waterX: 0.5, waterWidth: 0.07, waterSpeed: 3.0, meander: 0.8,
  };

  const SCENES = [
    { id: 'linq', name: 'LINQ entrance', params: {} },
    { id: 'glacier', name: 'Glacier cascade', params: {
      palette: 'glacier', frost: 0.62, clump: 1.1, fracture: 0.55, blockDensity: 3.4, crack: 0.07,
      jitter: 1.0, cellTint: 0.3, macro: 1.25, warp: 1.3, speed: 0.4, lightAngle: 120, lightHeight: 30,
      water: true, waterX: 0.36, waterWidth: 0.12, waterSpeed: 4.2, meander: 0.9, sparkle: 0.5,
    } },
    { id: 'icehotel', name: 'Ice hotel', params: {
      palette: 'linq', hue: -8, frost: 0.55, clump: 0.7, fracture: 1.0, blockDensity: 5.0,
      crack: 0.06, jitter: 0.5, joint: 1.0, pattern: 'bricks', cellTint: 0.55, macro: 0.6, relief: 1.1, warp: 0.5,
      speed: 0.3, drift: 0.2, lightAngle: 145, lightHeight: 38, water: false, sparkle: 0.8,
      exposure: 1.02, bloom: 0.5,
    } },
    { id: 'hoarfrost', name: 'Hoarfrost dawn', params: {
      palette: 'alpenglow', frost: 1.0, clump: 1.3, relief: 1.2, fracture: 0.08, macro: 0.9,
      lightAngle: 205, lightHeight: 20, lightSweep: true, sparkle: 1.1, bloom: 0.55,
      water: false, speed: 0.35, exposure: 1.05,
    } },
    { id: 'aurora', name: 'Aurora', params: {
      palette: 'aurora', frost: 0.8, clump: 1.15, fracture: 0.15, warp: 1.5, speed: 0.6, bloom: 0.7,
      lightAngle: 100, lightHeight: 32, water: true, waterX: 0.64, waterWidth: 0.055,
      waterSpeed: 2.4, meander: 1.0, sparkle: 0.8,
    } },
    { id: 'midnight', name: 'Midnight thaw', params: {
      palette: 'midnight', frost: 0.7, fracture: 0.4, blockDensity: 4.4, macro: 1.2,
      lightAngle: 160, lightHeight: 26, shadow: 1.0, sparkle: 1.3, bloom: 0.9, exposure: 1.0,
      water: true, waterX: 0.5, waterWidth: 0.1, waterSpeed: 3.6, meander: 0.7,
    } },
    { id: 'grotto', name: 'Emerald grotto', params: {
      palette: 'emerald', frost: 0.72, clump: 1.15, fracture: 0.35, blockDensity: 4.0, jitter: 1.0,
      macro: 1.35, warp: 1.25, speed: 0.4, lightAngle: 70, lightHeight: 30, bloom: 0.6,
      water: true, waterX: 0.72, waterWidth: 0.08, waterSpeed: 2.8, sparkle: 0.6,
    } },
  ];

  // ─── colour math ───
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  };
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function linearToOklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function oklabToLinear([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }
  function hexToOklab(hex, hueDeg) {
    const lab = linearToOklab(hexToRgb(hex).map(toLinear));
    if (!hueDeg) return lab;
    const a = (hueDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [lab[0], lab[1] * c - lab[2] * s, lab[1] * s + lab[2] * c];
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  const RAMP_N = 256;

  /** Linear-RGB ramp (Float32Array, RAMP_N×3) for a palette at a hue rotation. */
  function buildRamp(id, hueDeg = 0) {
    const pal = PALETTES[id] || PALETTES.linq;
    const stops = pal.stops.map(([t, hex]) => [t, hexToOklab(hex, hueDeg)]);
    const out = new Float32Array(RAMP_N * 3);
    let k = 0;
    for (let i = 0; i < RAMP_N; i++) {
      const t = i / (RAMP_N - 1);
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, a] = stops[k], [t1, b] = stops[k + 1];
      const u = clamp01((t - t0) / (t1 - t0));
      const lin = oklabToLinear([0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * u));
      for (let j = 0; j < 3; j++) out[i * 3 + j] = clamp01(lin[j]);
    }
    return out;
  }

  /** Linear-RGB tint for the meltwater, normalised so it only shifts hue. */
  function waterTint(id, hueDeg = 0) {
    const pal = PALETTES[id] || PALETTES.linq;
    const lin = oklabToLinear(hexToOklab(pal.water, hueDeg)).map(clamp01);
    const mx = Math.max(...lin, 1e-3);
    return lin.map((v) => v / mx);
  }

  function sampleRamp(ramp, x) {
    const f = clamp01(x) * (RAMP_N - 1), i = Math.min(RAMP_N - 2, Math.floor(f)), u = f - i;
    return [0, 1, 2].map((j) => ramp[i * 3 + j] + (ramp[(i + 1) * 3 + j] - ramp[i * 3 + j]) * u);
  }

  /** sRGB bytes (RGBA) for an SRGB8_ALPHA8 texture upload. */
  function rampBytes(ramp, out) {
    for (let i = 0; i < RAMP_N; i++) {
      for (let j = 0; j < 3; j++) out[i * 4 + j] = Math.round(toSrgb(ramp[i * 3 + j]) * 255);
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  const linearToHex = (lin) =>
    '#' + lin.map((v) => Math.round(toSrgb(clamp01(v)) * 255).toString(16).padStart(2, '0')).join('');

  /** CSS gradient that previews a palette (for swatches). */
  function cssGradient(id, hueDeg = 0) {
    const ramp = buildRamp(id, hueDeg);
    const stops = [0.08, 0.3, 0.52, 0.72, 0.92].map((x) => linearToHex(sampleRamp(ramp, x)));
    return `linear-gradient(135deg, ${stops.join(', ')})`;
  }

  window.IceWallLook = {
    PALETTES, BASE, SCENES, RAMP_N,
    buildRamp, waterTint, sampleRamp, rampBytes, linearToHex, cssGradient,
  };
})();
