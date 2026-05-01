// Chapter 3 — Biology (stub).
// A pulsing cell. Membrane wobbles on its own; nucleus pulses on a heartbeat;
// cell grows over the course of the chapter.

import { Scene, drawLabel } from './scene.js';

export class Ch3Biology extends Scene {
  constructor() {
    super('Biology', 120);
    this.t = 0;
  }

  update(dt, t, progress) {
    this.t = t;
    this.progress = progress;
  }

  render() {
    const ctx = this.ctx;
    const w = this.w, h = this.h;
    const cx = w / 2, cy = h / 2;
    const baseR = Math.min(w, h) * (0.18 + (this.progress || 0) * 0.12);
    const heart = 0.5 + 0.5 * Math.sin(this.t * 2.4);

    // background gradient
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 1.5);
    g.addColorStop(0, '#062010');
    g.addColorStop(1, '#020806');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // membrane
    ctx.strokeStyle = 'rgba(120, 240, 160, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const wobble =
        Math.sin(a * 5 + this.t * 1.2) * 6 +
        Math.sin(a * 9 + this.t * 0.7) * 4;
      const r = baseR + wobble + heart * 8;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(60, 180, 100, 0.10)';
    ctx.fill();

    // nucleus
    const nr = baseR * 0.35 * (1 + heart * 0.4);
    const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr);
    ng.addColorStop(0, 'rgba(180, 255, 200, 0.9)');
    ng.addColorStop(1, 'rgba(40, 120, 80, 0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(cx, cy, nr, 0, Math.PI * 2);
    ctx.fill();

    drawLabel(ctx, w, h, 3, 'Biology', '#7fe8a0');
  }
}
