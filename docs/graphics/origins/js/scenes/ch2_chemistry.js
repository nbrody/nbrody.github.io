// Chapter 2 — Chemistry (stub).
// Hexagonal lattice of "atoms" with bonds. Lattice breathes on a fixed
// oscillator; bond opacity ramps up with progress (chemistry "wakes up").

import { Scene, drawLabel } from './scene.js';

export class Ch2Chemistry extends Scene {
  constructor() {
    super('Chemistry', 120);
    this.nodes = [];
    this.spacing = 60;
  }

  init(args) {
    super.init(args);
    this.layout();
  }

  layout() {
    this.nodes.length = 0;
    const s = this.spacing;
    this.cols = Math.ceil(this.w / s) + 2;
    const rows = Math.ceil(this.h / s) + 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * s + (r % 2) * (s / 2);
        const y = r * s * 0.866;
        this.nodes.push({ x0: x, y0: y, x, y });
      }
    }
  }

  update(_dt, t, progress) {
    if (this.nodes.length === 0 || this.nodes[0].x0 > this.w + 100) this.layout();
    this.progress = progress;
    const breathe = 1 + Math.sin(t * 0.6) * 0.4;
    for (const n of this.nodes) {
      n.x = n.x0 + Math.sin(t * 0.6 + n.y0 * 0.01) * 6 * breathe;
      n.y = n.y0 + Math.cos(t * 0.5 + n.x0 * 0.01) * 6 * breathe;
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a0612';
    ctx.fillRect(0, 0, this.w, this.h);

    const bondAlpha = 0.10 + (this.progress || 0) * 0.35;
    ctx.strokeStyle = `rgba(200, 160, 255, ${bondAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      const right = this.nodes[i + 1];
      const down = this.nodes[i + this.cols];
      if (right && Math.abs(right.y0 - a.y0) < 1) {
        ctx.moveTo(a.x, a.y); ctx.lineTo(right.x, right.y);
      }
      if (down) {
        ctx.moveTo(a.x, a.y); ctx.lineTo(down.x, down.y);
      }
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(220, 200, 255, 0.85)';
    for (const n of this.nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    drawLabel(ctx, this.w, this.h, 2, 'Chemistry', '#cc99ff');
  }
}
