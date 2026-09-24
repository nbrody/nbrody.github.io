// Debug overlay. Hidden by default; toggle with H.
// Shows chapter, beat, chapter time, fps, tempo. Cursor visible while shown.

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.elChapter = document.getElementById('hud-chapter');
    this.elStats = document.getElementById('hud-stats');
    this.elProgress = document.getElementById('bar-progress');
    this.fpsAvg = 60;
    this.visible = false;
    this.el.hidden = true;
  }

  toggle(on = !this.visible) {
    this.visible = on;
    this.el.hidden = !on;
    document.body.classList.toggle('show-cursor', on);
  }

  update({ director, tempo, fps }) {
    if (fps > 0 && fps < 1000) this.fpsAvg = this.fpsAvg * 0.95 + fps * 0.05;
    if (!this.visible) return;
    const s = director.currentScene;
    const T = director.T;
    this.elChapter.textContent = `${director.current + 1}. ${s.title} — ${s.beatAt(T)}`;
    this.elStats.textContent =
      `${this.fpsAvg.toFixed(0)} fps · ${T.toFixed(1)}s / ${s.duration}s · ` +
      `${tempo.bpm} bpm${director.speed !== 1 ? ` · ×${director.speed}` : ''}${director.paused ? ' · paused' : ''}`;
    this.elProgress.style.width = `${Math.min(100, (T / s.duration) * 100).toFixed(1)}%`;
  }
}
