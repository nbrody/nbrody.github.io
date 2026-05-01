// Director — owns the timeline.
// Each scene declares a duration; director auto-advances between them and
// crossfades at boundaries. Operator controls (pause, jump) are for rehearsal.

export class Director {
  constructor({ canvas, ctx, scenes, crossfadeDuration = 2.0 }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.scenes = scenes;
    this.crossfade = crossfadeDuration;
    this.current = 0;
    this.elapsed = 0;        // seconds within the current chapter
    this.next = null;        // { index, t } during a crossfade
    this.paused = false;
  }

  init() {
    for (const scene of this.scenes) {
      scene.init({ canvas: this.canvas, ctx: this.ctx });
    }
  }

  // ---- operator controls -------------------------------------------------

  togglePause() { this.paused = !this.paused; }

  advance() { this.jumpTo(this.current + 1); }
  retreat() { this.jumpTo(this.current - 1); }

  jumpTo(i) {
    i = Math.max(0, Math.min(this.scenes.length - 1, i));
    if (i === this.current) return;
    if (this.next && this.next.index === i) return;
    this.next = { index: i, t: 0 };
  }

  // ---- introspection (for HUD) ------------------------------------------

  get currentScene()    { return this.scenes[this.current]; }
  get currentName()     { return this.currentScene?.name ?? '—'; }
  get currentDuration() { return this.currentScene?.duration ?? 120; }
  get progress() {
    return Math.min(1, this.elapsed / this.currentDuration);
  }

  // ---- per-frame --------------------------------------------------------

  update(dt, t) {
    if (this.paused) return;

    this.elapsed += dt;

    // start auto-advance crossfade when chapter is up
    if (!this.next && this.elapsed >= this.currentDuration && this.current < this.scenes.length - 1) {
      this.next = { index: this.current + 1, t: 0 };
    }

    if (this.next) {
      this.next.t += dt;
      if (this.next.t >= this.crossfade) {
        this.current = this.next.index;
        this.next = null;
        this.elapsed = 0;
      }
    }

    const curProgress = this.progress;
    this.scenes[this.current].update(dt, t, curProgress);

    if (this.next) {
      // incoming scene starts at progress 0
      const inProgress = this.next.t / this.crossfade;
      this.scenes[this.next.index].update(dt, t, inProgress * 0.05);
    }
  }

  render() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ctx = this.ctx;

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (!this.next) {
      this.scenes[this.current].render();
    } else {
      const p = Math.min(1, this.next.t / this.crossfade);
      const ease = p * p * (3 - 2 * p); // smoothstep
      ctx.globalAlpha = 1 - ease;
      this.scenes[this.current].render();
      ctx.globalAlpha = ease;
      this.scenes[this.next.index].render();
      ctx.globalAlpha = 1;
    }
  }
}
