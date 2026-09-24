// tempo.js — the shared pulse.
//
// Chapter 1's fusion heartbeat, Chapter 3's heartbeat, Chapter 4's synchrony
// and Chapter 5's dance all lock to one tempo so the visuals can sit under
// live music. The phase is a function of "show time" (seconds since the start
// of the piece), so pausing and seeking stay deterministic. Tap T in time with
// the band to set the BPM and snap the downbeat to the last tap.

const fract = (x) => x - Math.floor(x);

export class Tempo {
  constructor(bpm = 72) {
    this.bpm = bpm;
    this.offset = 0;   // show-time (s) of a downbeat
    this.taps = [];
  }

  /** Continuous beat count at show time t. */
  beats(t) { return ((t - this.offset) * this.bpm) / 60; }
  /** 0..1 phase within the current beat. */
  phase(t) { return fract(this.beats(t)); }
  /** Seconds since the last beat. */
  since(t) { return (this.phase(t) * 60) / this.bpm; }

  /** Sharp attack, exponential decay on every beat. */
  pulse(t, decay = 7) { return Math.exp(-this.since(t) * decay); }

  /** Lub-dub: a strong beat and a softer echo ~0.28 s later. */
  heart(t) {
    const s = this.since(t);
    const lub = Math.exp(-s * 9);
    const d = s - 0.28;
    const dub = d > 0 ? 0.6 * Math.exp(-d * 11) * Math.min(1, d * 60) : 0;
    return lub + dub;
  }

  /** Register a tap at show time t (seconds). */
  tap(t) {
    const taps = this.taps.filter((x) => t - x < 3 && t > x);
    taps.push(t);
    this.taps = taps.slice(-8);
    if (this.taps.length >= 2) {
      const n = this.taps.length;
      const avg = (this.taps[n - 1] - this.taps[0]) / (n - 1);
      if (avg > 0.25 && avg < 2) this.bpm = Math.round((60 / avg) * 10) / 10;
    }
    this.offset = t;
  }
}
