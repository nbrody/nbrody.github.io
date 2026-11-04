// Cannon page figure helpers: the shared ones (../../core/common.js), this paper's colour roles,
// and two helpers the figures share (a colour ramp and a binary heap for Dijkstra).
export * from '../../core/common.js';
import { palette as basePalette, cssVar, mix } from '../../core/common.js';

/** Theme colours, read at draw time. Roles are fixed across the page (see style.css). */
export function palette() {
  return Object.assign(basePalette(), {
    u: cssVar('--c-u'),         // the scalar function, its levels, crossings
    w: cssVar('--c-w'),         // a second function or transform, the partner
    mu: cssVar('--c-mu'),       // measure, energy, cost, punctures
    mesh: cssVar('--c-mesh'),   // cells, nets, tiles
  });
}

export function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  return mix(stops[i], stops[i + 1], t * n - i);
}

// Binary min-heap keyed by Float64 priorities over integer ids.
export class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(key, val) {
    let i = this.n++;
    if (i >= this.k.length) {
      const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    const k = this.k, v = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() { // returns val; key in this.lastKey
    const k = this.k, v = this.v;
    const topV = v[0]; this.lastKey = k[0];
    const n = --this.n;
    if (n > 0) {
      const key = k[n], val = v[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = key; v[i] = val;
    }
    return topV;
  }
}
