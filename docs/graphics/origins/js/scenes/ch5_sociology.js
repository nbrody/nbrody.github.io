// Chapter 5 — Sociology (stub).
// A grid of "dancers" on phase-offset oscillators with a swinging spotlight.
// Energy ramps up with progress (crowd warms up).

import { Scene, drawLabel } from './scene.js';

export class Ch5Sociology extends Scene {
  constructor() {
    super('Sociology', 120);
    this.dancers = [];
  }

  init(args) {
    super.init(args);
    this.layout();
  }

  layout() {
    this.dancers.length = 0;
    const cols = 14, rows = 8;
    const margin = 80;
    const dx = (this.w - margin * 2) / (cols - 1);
    const dy = (this.h - margin * 2) / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.dancers.push({
          x: margin + c * dx,
          y: margin + r * dy,
          phase: Math.random() * Math.PI * 2,
          hue: 20 + Math.random() * 40,
        });
      }
    }
  }

  update(_dt, t, progress) {
    if (this.dancers.length && this.dancers[0].x > this.w) this.layout();
    this.t = t;
    this.progress = progress;
  }

  render() {
    const ctx = this.ctx;
    const t = this.t || 0;
    const progress = this.progress || 0;

    // stage
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#1a0a05');
    g.addColorStop(1, '#050202');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    // swinging spotlight, brighter as crowd warms
    const spotX = this.w / 2 + Math.sin(t * 0.5) * this.w * 0.3;
    const spotY = this.h * 0.3;
    const spot = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, this.h);
    spot.addColorStop(0, `rgba(255, 200, 100, ${0.10 + progress * 0.30})`);
    spot.addColorStop(1, 'rgba(255, 200, 100, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, this.w, this.h);

    // dancers — bob amplitude grows over the chapter
    const bob = 8 + progress * 40;
    for (const d of this.dancers) {
      const yoff = Math.sin(t * 4 + d.phase) * bob;
      const sw = Math.sin(t * 2 + d.phase) * 4;
      ctx.fillStyle = `hsl(${d.hue}, 80%, ${50 + progress * 20}%)`;
      ctx.fillRect(d.x - 4 + sw, d.y + yoff - 24, 8, 28);
      ctx.beginPath();
      ctx.arc(d.x + sw, d.y + yoff - 32, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    drawLabel(ctx, this.w, this.h, 5, 'Sociology', '#ffcc88');
  }
}
