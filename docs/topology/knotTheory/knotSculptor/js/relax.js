// Knot relaxation for the app: wraps the O'Hara-energy flow in relaxFlow.js (α = 4, springs, bending,
// Sobolev-smoothed steps, and per-vertex caps so no edge can reach another — the knot type is kept).
// relaxFlow works in units where the edge length is ~0.2, so links are scaled in and out of those units.

import { buildLink, step, snapshot } from './relaxFlow.js';
import { closedLength } from './knot.js';

const H = 0.2;          // edge length in flow units
const RAMP = 60, WINDOW = 100, PLATEAU = 3e-5, STILL = 2e-5, PATIENCE = 120;

export class Relaxer {
  // spacing: target edge length in meters (vertex count per component follows from its length)
  constructor(components, { spacing = 0.007, tube = 0.0045 } = {}) {
    this.sigma = spacing / H;
    const comps = components.map(p => {
      const N = p.length / 3, pts = [];
      for (let i = 0; i < N; i++) pts.push([p[3 * i] / this.sigma, p[3 * i + 1] / this.sigma, p[3 * i + 2] / this.sigma]);
      return { pts };
    });
    this.link = buildLink(comps, { h: H, tubeR: tube / this.sigma, minN: 24, alpha: 4 });
    this.hist = [];
    this.quiet = 0;
    this.converged = false;
  }
  get steps() { return this.link.steps; }
  get energy() { return this.link.energy; }

  step() {
    const m = step(this.link);
    const s = this.link.steps;
    this.quiet = m < STILL ? this.quiet + 1 : 0;
    if (this.quiet > PATIENCE && s > RAMP) this.converged = true;
    this.hist.push(this.link.energy);
    if (s > RAMP + WINDOW) {
      const e0 = this.hist[this.hist.length - 1 - WINDOW], e1 = this.link.energy;
      if ((e0 - e1) / Math.abs(e1) < PLATEAU) this.converged = true;
    }
    if (this.hist.length > 2 * WINDOW) this.hist.splice(0, this.hist.length - WINDOW - 1);
    return { energy: this.link.energy };
  }

  get comps() {
    const flat = snapshot(this.link);
    return this.link.chains.map((ch, c) => {
      const o = 3 * this.link.offsets[c], out = new Float64Array(3 * ch.N);
      for (let k = 0; k < 3 * ch.N; k++) out[k] = flat[o + k] * this.sigma;
      return out;
    });
  }
}

export const linkLength = comps => comps.reduce((s, p) => s + closedLength(p), 0);
