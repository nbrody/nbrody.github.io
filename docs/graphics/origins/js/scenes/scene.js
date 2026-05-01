// Base scene. All chapters subclass this and override update() and render().
//
// Lifecycle:
//   init({ canvas, ctx })       — once, at startup
//   update(dt, t, progress)     — every frame; dt seconds, t seconds since load,
//                                 progress 0..1 within this chapter
//   render()                    — every frame, AFTER update; draws to ctx
//   dispose()                   — on teardown (currently unused)
//
// Each scene declares a `duration` (seconds). The Director uses it to
// auto-advance.

export class Scene {
  constructor(name, duration = 120) {
    this.name = name;
    this.duration = duration;
  }

  init({ canvas, ctx }) {
    this.canvas = canvas;
    this.ctx = ctx;
  }

  update(_dt, _t, _progress) {}
  render() {}
  dispose() {}

  get w() { return this.canvas.clientWidth; }
  get h() { return this.canvas.clientHeight; }
}

// Small label drawn at bottom-left so we know which scene is on screen.
// Remove once scenes are real.
export function drawLabel(ctx, w, h, n, name, color) {
  ctx.save();
  ctx.font = '500 13px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.fillText(`${n} — ${name}`, 24, h - 24);
  ctx.restore();
}
