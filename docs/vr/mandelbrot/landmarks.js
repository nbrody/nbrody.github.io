/** Landmark coordinates and palettes from the GOLG Mandelbrot explorer.
 * Keep coordinates and pins as decimal strings to preserve deep-zoom precision.
 */
export const LANDMARKS = [
  { name: 'The whole set', re: '-0.765', im: '0', box: [2.62, 2.32], desc: 'The main cardioid, the period-$2$ disk, and their decorations.' },
  { name: 'Seahorse valley', re: '-0.7453', im: '0.1127', box: [0.012], desc: 'The cleft between the cardioid and the period-$2$ disk.' },
  { name: 'Elephant valley', re: '0.2925', im: '0.0150', box: [0.03], desc: 'Near the cusp of the cardioid at $c = \\tfrac14$.' },
  { name: 'Period-3 island', re: '-1.7548776662466927', im: '0', box: [0.045], desc: 'A small copy of $\\mathcal M$ on the real axis.' },
  { name: 'Feigenbaum point', re: '-1.4011551890920506', im: '0', box: [0.004], desc: 'Period doubling accumulates here; zooming by $\\delta \\approx 4.669$ repeats the picture.' },
  { name: 'Misiurewicz point $c = i$', re: '0', im: '1', box: [0.06], pin: ['0', '1'], desc: 'The orbit $0 \\mapsto i \\mapsto i - 1 \\mapsto -i \\mapsto \\cdots$ is preperiodic. Near $i$, $\\mathcal M$ looks like $J_i$ (Tan Lei).' },
  { name: 'Douady rabbit', re: '-0.1226', im: '0.7449', box: [0.42], pin: ['-0.1225611668766536', '0.7448617666197442'], desc: 'The period-$3$ bulb, pinned at its center, where $K_c$ is the rabbit.' },
  { name: 'Period-39 minibrot', re: '-0.7436423016578859461185973194337778358742', im: '0.1318265198125947234991930123055191513102', box: [9e-6], desc: 'A copy of $\\mathcal M$ in seahorse valley, found by Newton’s method on $f_c^{\\circ 39}(0) = 0$.' },
  { name: 'Period-998 minibrot', re: '-0.7436438870371588707780645434936425750476', im: '0.131825904205312292821097354874767265263', box: [2.6e-15], desc: 'A copy of $\\mathcal M$ about $10^{-15}$ across, far beyond double precision.' },
  { name: 'Deep spiral', re: '-0.743643887037158704752191506114774', im: '0.131825904205311970493132056385139', box: [4e-24], desc: 'Seahorse valley at width $10^{-24}$, with fixed-point reference orbits.' },
];

export const PALETTES = [
  { id: 'classic', name: 'Classic', interior: '#000000', edge: '#000000',
    stops: [[0, '#000764'], [0.16, '#206bcb'], [0.42, '#edffff'], [0.6425, '#ffaa00'], [0.8575, '#000200'], [1, '#000764']] },
  { id: 'ember', name: 'Ember', interior: '#0a0306', edge: '#0a0306',
    stops: [[0, '#12040a'], [0.22, '#6b1020'], [0.45, '#e0521c'], [0.62, '#ffc857'], [0.76, '#fff5dc'], [0.9, '#5c1a2e'], [1, '#12040a']] },
  { id: 'lagoon', name: 'Lagoon', interior: '#020a10', edge: '#020a10',
    stops: [[0, '#04121c'], [0.25, '#0f5866'], [0.48, '#5fd3b8'], [0.66, '#f1f4dc'], [0.82, '#4b7fb0'], [1, '#04121c']] },
  { id: 'ink', name: 'Ink', interior: '#141927', edge: '#141927',
    stops: [[0, '#f6f7fb'], [0.5, '#d5dcea'], [1, '#f6f7fb']] },
];
const hex3 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function paletteLUT(p) {
  const n = 512, out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let k = 0;
    while (k < p.stops.length - 2 && p.stops[k + 1][0] <= t) k++;
    const [t0, h0] = p.stops[k], [t1, h1] = p.stops[k + 1];
    const u = (t - t0) / (t1 - t0), a = hex3(h0), b = hex3(h1);
    for (let c = 0; c < 3; c++) out[4 * i + c] = Math.round(a[c] + (b[c] - a[c]) * u);
    out[4 * i + 3] = 255;
  }
  return out;
}
