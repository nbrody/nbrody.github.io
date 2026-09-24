// Director — owns the timeline.
//
// Each scene declares a duration; the director auto-advances and crossfades
// at boundaries (the outgoing chapter keeps running past its end while the
// next one starts at T = 0, so each chapter's last frames and the next one's
// first frames are designed to match). Operator controls — pause, jump,
// scrub — are for rehearsal; a performance just lets it play.

import { mixPost } from './gfx/renderer.js';

const smooth = (x) => x * x * (3 - 2 * x);

export class Director {
  constructor({ R, scenes, tempo, crossfade = 2.5 }) {
    this.R = R;
    this.scenes = scenes;
    this.tempo = tempo;
    this.crossfade = crossfade;
    this.current = 0;
    this.T = 0;            // chapter time of the current scene
    this.next = null;      // { index, T, fade } while crossfading
    this.paused = false;
    this.speed = 1;
    this.ended = false;
  }

  init() {
    const E = { R: this.R, tempo: this.tempo };
    for (const s of this.scenes) s.init(E);
    this.scenes[0].seek(0);
  }

  // ── operator controls ──────────────────────────────────────────────────

  togglePause() { this.paused = !this.paused; }
  advance() { this.jumpTo(this.activeIndex + 1); }
  retreat() {
    // first press rewinds to the chapter start; a second press goes back one
    if (this.T > 3 && !this.next) this.seek(this.current, 0);
    else this.jumpTo(this.activeIndex - 1);
  }

  /** Fade from whatever is on screen into the start of chapter i. */
  jumpTo(i) {
    i = Math.max(0, Math.min(this.scenes.length - 1, i));
    if (this.next) this.seek(this.next.index, this.next.T);
    if (i === this.current) { this.seek(i, 0); return; }
    this.scenes[i].seek(0);
    this.next = { index: i, T: 0, fade: 1.2 };
    this.ended = false;
  }

  /** Hard cut to chapter i at chapter time T. */
  seek(i, T = 0) {
    i = Math.max(0, Math.min(this.scenes.length - 1, i));
    this.current = i;
    this.T = Math.max(0, T);
    this.next = null;
    this.ended = false;
    this.scenes[i].seek(this.T);
  }

  scrub(dT) {
    const s = this.scenes[this.current];
    this.seek(this.current, Math.min(s.duration - 0.05, Math.max(0, this.T + dT)));
  }

  // ── introspection (HUD, captions) ──────────────────────────────────────

  get activeIndex() { return this.next ? this.next.index : this.current; }
  get currentScene() { return this.scenes[this.current]; }
  startOf(i) {
    let t = 0;
    for (let k = 0; k < i; k++) t += this.scenes[k].duration;
    return t;
  }
  get showTime() { return this.startOf(this.current) + this.T; }
  get totalDuration() { return this.startOf(this.scenes.length); }

  /** Scenes to draw this frame, with their chapter times and weights. */
  layers() {
    const out = [{ scene: this.scenes[this.current], index: this.current, T: this.T, w: 1 }];
    if (this.next) {
      const f = smooth(Math.min(1, this.next.T / this.next.fade));
      out[0].w = 1 - f;
      out.push({ scene: this.scenes[this.next.index], index: this.next.index, T: this.next.T, w: f });
    }
    return out;
  }

  // ── per-frame ───────────────────────────────────────────────────────────

  update(dt) {
    if (!this.paused) {
      dt *= this.speed;
      this.T += dt;
      const cur = this.scenes[this.current];
      const last = this.current === this.scenes.length - 1;
      if (!this.next && this.T >= cur.duration && !last) {
        this.next = { index: this.current + 1, T: 0, fade: this.crossfade };
        this.scenes[this.current + 1].seek(0);
      }
      if (last && this.T >= cur.duration) this.ended = true;
      if (this.next) {
        this.next.T += dt;
        if (this.next.T >= this.next.fade) {
          this.current = this.next.index;
          this.T = this.next.T;
          this.next = null;
        }
      }
    } else {
      dt = 0;
    }
    const show = this.showTime;
    this.R.time = show;
    this.scenes[this.current].update(dt, this.T, show);
    if (this.next) this.scenes[this.next.index].update(dt, this.next.T, show);
  }

  render() {
    const R = this.R;
    const cur = this.scenes[this.current];
    R.bindScene(R.A);
    cur.render(R);
    R.flush2D();
    if (!this.next) {
      R.present(R.A, cur.post);
      return;
    }
    const nxt = this.scenes[this.next.index];
    R.bindScene(R.B);
    nxt.render(R);
    R.flush2D();
    const f = smooth(Math.min(1, this.next.T / this.next.fade));
    R.mixInto(R.A, R.B, f);
    R.present(R.A, mixPost(cur.post, nxt.post, f));
  }
}
