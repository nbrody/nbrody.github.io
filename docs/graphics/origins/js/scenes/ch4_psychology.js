// Chapter 4 — Psychology (stub).
// A neural-ish graph with sparse activation propagation.
// Firing rate ramps up with progress (mind "wakes up").

import { Scene, drawLabel } from './scene.js';

export class Ch4Psychology extends Scene {
  constructor() {
    super('Psychology', 120);
    this.nodes = [];
    this.edges = [];
  }

  init(args) {
    super.init(args);
    const N = 60;
    for (let i = 0; i < N; i++) {
      this.nodes.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        activation: 0,
      });
    }
    // connect each node to its 3 nearest neighbors
    for (let i = 0; i < N; i++) {
      const a = this.nodes[i];
      const dists = this.nodes
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .filter((x) => x.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 3);
      for (const { j } of dists) this.edges.push([i, j]);
    }
  }

  update(dt, _t, progress) {
    // base firing rate climbs with progress
    const fireProb = dt * (0.4 + progress * 5);
    for (const n of this.nodes) {
      if (Math.random() < fireProb / this.nodes.length) n.activation = 1;
      n.activation *= Math.exp(-dt * 1.5);
    }
    // propagate along edges
    for (const [i, j] of this.edges) {
      const a = this.nodes[i], b = this.nodes[j];
      if (a.activation > 0.6 && Math.random() < dt * 2) {
        b.activation = Math.max(b.activation, a.activation * 0.7);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a0418';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.lineWidth = 1;
    for (const [i, j] of this.edges) {
      const a = this.nodes[i], b = this.nodes[j];
      const act = Math.max(a.activation, b.activation);
      ctx.strokeStyle = `rgba(180, 140, 255, ${0.06 + act * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const n of this.nodes) {
      const r = 2 + n.activation * 6;
      ctx.fillStyle = `rgba(220, 200, 255, ${0.4 + n.activation * 0.6})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    drawLabel(ctx, this.w, this.h, 4, 'Psychology', '#b899ff');
  }
}
