// Tuning and melodies. The whole machine is in D major; almost everything
// random (plinko pegs, bells, tines) uses the D-major pentatonic so any
// coincidence of notes stays consonant.

export const D4 = 62;
export const PENT = [0, 2, 4, 7, 9];          // D E F# A B
export const pent = (degree, base = D4) => {
  const o = Math.floor(degree / 5), d = ((degree % 5) + 5) % 5;
  return base + 12 * o + PENT[d];
};
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (m) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);

// Beethoven, "Ode to Joy" — antecedent and consequent phrases, in D major.
// [midi, beats]
const FS = 78, G5 = 79, A5 = 81, E5 = 76, D5 = 74;
export const ODE_I = [
  [FS, 1], [FS, 1], [G5, 1], [A5, 1], [A5, 1], [G5, 1], [FS, 1], [E5, 1],
  [D5, 1], [D5, 1], [E5, 1], [FS, 1], [FS, 1.5], [E5, 0.5], [E5, 2],
];
export const ODE_II = [
  [FS, 1], [FS, 1], [G5, 1], [A5, 1], [A5, 1], [G5, 1], [FS, 1], [E5, 1],
  [D5, 1], [D5, 1], [E5, 1], [FS, 1], [E5, 1.5], [D5, 0.5], [D5, 2],
];

// Place bars so that a ball following the track's nominal time profile
// strikes them in rhythm. Returns [{s, midi}] or throws if the lane is short.
export function placeMelody(track, melody, beat, sStart) {
  const t0 = track.timeAt(sStart);
  const out = [];
  let tb = 0;
  let s = sStart;
  for (const [midi, beats] of melody) {
    const target = t0 + tb * beat;
    // advance s until timeAt(s) >= target
    while (s < track.L && track.timeAt(s) < target) s += 0.002;
    if (s >= track.L - 0.05) { out.short = melody.length - out.length; return out; }
    out.push({ s, midi, t: target - t0 });
    tb += beats;
  }
  return out;
}
