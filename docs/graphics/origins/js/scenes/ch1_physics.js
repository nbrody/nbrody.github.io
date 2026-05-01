// Chapter 1 — Physics (stub).
// Particles drift; pull toward center grows with progress, simulating
// the gas → cosmic web → galactic clustering arc.

import { Scene, drawLabel } from './scene.js';

export class Ch1Physics extends Scene {
  constructor() {
    super('Physics', 120);
    this.particles = [];
  }

  init(args) {
    super.init(args);
    const N = 600;
    for (let i = 0; i < N; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
      });
    }
  }

  update(dt, _t, progress) {
    const cx = this.w / 2, cy = this.h / 2;
    const pull = 6 + progress * 90;            // ramps up across the chapter
    const damp = 0.99 - progress * 0.005;
    for (const p of this.particles) {
      const dx = cx - p.x, dy = cy - p.y;
      const r = Math.sqrt(dx * dx + dy * dy) + 50;
      p.vx += (dx / r) * pull * dt;
      p.vy += (dy / r) * pull * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#02040d';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.fillStyle = 'rgba(180, 200, 255, 0.7)';
    for (const p of this.particles) {
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }

    drawLabel(ctx, this.w, this.h, 1, 'Physics', '#88aaff');
  }
}
