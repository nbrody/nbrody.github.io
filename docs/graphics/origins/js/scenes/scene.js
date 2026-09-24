// Base scene. Every chapter subclasses this.
//
// Lifecycle:
//   init(E)              — once at startup. E = { R (renderer), tempo }
//   seek(T)              — the director jumped to chapter time T; rebuild any
//                          simulated state so the frame at T looks right
//   update(dt, T, show)  — every frame. T is chapter time in seconds (it keeps
//                          running past `duration` while the next chapter fades
//                          in); show is seconds since the start of the piece
//   render(R)            — draw into the renderer's current HDR target
//
// Chapters are authored as functions of T: `beats` names the story beats for
// the HUD, `cues` are the on-screen captions, and `post` carries this frame's
// bloom / exposure / flash settings to the compositor.

import { DEFAULT_POST } from '../gfx/renderer.js';

export class Scene {
  constructor({ id, num, title, subtitle, duration = 120 }) {
    this.id = id;
    this.num = num;
    this.title = title;
    this.subtitle = subtitle;
    this.duration = duration;
    this.post = { ...DEFAULT_POST };
    this.beats = [];   // [{ t, name }]
    this.cues = [];    // [{ t, d, title, sub }]
  }

  init(E) {
    this.E = E;
    this.R = E.R;
    this.tempo = E.tempo;
  }

  seek(_T) {}
  update(_dt, _T, _show) {}
  render(_R) {}

  get W() { return this.R.W; }
  get H() { return this.R.H; }

  beatAt(T) {
    let name = this.beats[0]?.name ?? '';
    for (const b of this.beats) if (T >= b.t) name = b.name;
    return name;
  }
}
