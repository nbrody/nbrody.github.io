// Debug overlay. Hidden by default; toggle with H.
// Shows current chapter, progress through it, fps. Cursor visible while shown.

export class HUD {
  constructor() {
    this.el         = document.getElementById('hud');
    this.elChapter  = document.getElementById('hud-chapter');
    this.elStats    = document.getElementById('hud-stats');
    this.elProgress = document.getElementById('bar-progress');
    this.fpsAvg     = 60;
    this.visible    = false;
    this.el.hidden  = true;
  }

  toggle() {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    document.body.classList.toggle('show-cursor', this.visible);
  }

  update({ director, fps }) {
    if (!this.visible) return;
    this.fpsAvg = this.fpsAvg * 0.95 + fps * 0.05;
    const elapsed = director.elapsed.toFixed(1);
    const total = director.currentDuration.toFixed(0);
    this.elChapter.textContent = `${director.current + 1}. ${director.currentName}`;
    this.elStats.textContent =
      `${this.fpsAvg.toFixed(0)} fps · ${elapsed}s / ${total}s${director.paused ? ' · paused' : ''}`;
    this.elProgress.style.width = `${(director.progress * 100).toFixed(1)}%`;
  }
}
