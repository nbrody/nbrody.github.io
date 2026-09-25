// Original music for Gyroid Smoke. Run with Node to regenerate the bundled SMF.
import { writeFileSync } from 'node:fs';

const PPQ = 480;
const BPM = 112;
const BAR = PPQ * 4;
const END = BAR * 16;
const tempo = Math.round(60000000 / BPM);
const encoder = new TextEncoder();

function variable(value) {
  const result = [value & 127];
  while ((value = Math.floor(value / 128))) result.unshift((value & 127) | 128);
  return result;
}
function u32(value) { return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]; }
function chunk(name, data) { return [...encoder.encode(name), ...u32(data.length), ...data]; }
function meta(type, text) {
  const data = typeof text === 'string' ? [...encoder.encode(text)] : text;
  return [0xff, type, ...variable(data.length), ...data];
}
function track(name, messages) {
  const data = [0, ...meta(3, name)];
  let tick = 0;
  for (const event of messages.sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    data.push(...variable(event.tick - tick), ...event.data);
    tick = event.tick;
  }
  data.push(...variable(END - tick), 0xff, 0x2f, 0);
  return chunk('MTrk', data);
}
function instrument(channel, program, volume, pan) {
  const messages = [];
  const add = (tick, data, order = 1) => messages.push({ tick: Math.round(tick), data, order });
  const cc = (tick, number, value, order = 0) => add(tick, [0xb0 + channel, number, value], order);
  const bend = (tick, value) => add(tick, [0xe0 + channel, value & 127, (value >> 7) & 127]);
  const note = (tick, pitch, velocity, length) => {
    add(tick, [0x90 + channel, pitch, velocity], 2);
    add(tick + length, [0x80 + channel, pitch, 0], -1);
  };
  add(0, [0xc0 + channel, program], -2);
  cc(0, 7, volume);
  cc(0, 10, pan);
  cc(0, 64, 0);
  cc(0, 1, 0);
  bend(0, 8192);
  // Every voice and expressive controller returns to a neutral state at EOF.
  cc(END, 64, 0);
  cc(END, 1, 0);
  bend(END, 8192);
  cc(END, 123, 0, 3);
  cc(END, 120, 0, 4);
  return { messages, cc, bend, note };
}

const lead = instrument(0, 10, 106, 78); // Music box in General MIDI.
const chords = instrument(1, 89, 78, 46); // Warm pad.
const bass = instrument(2, 38, 92, 64); // Synth bass.

// Am9 → Fmaj9 → Cmaj9 → G6, followed by a final return to A minor.
// Voicings retain common tones while the moving bass changes their color.
const harmony = [
  { bass: 33, pad: [48, 55, 59, 64], arp: [69, 72, 76, 79, 83] },
  { bass: 29, pad: [48, 57, 64, 67], arp: [69, 72, 76, 79, 84] },
  { bass: 36, pad: [52, 55, 59, 62], arp: [67, 71, 74, 76, 79] },
  { bass: 31, pad: [50, 55, 59, 64], arp: [67, 71, 74, 76, 81] },
];
const phrases = [
  [0, 2, 1, 3, 2, 4, 3, 1],
  [0, 1, 2, 4, 3, 2, 1, 3],
  [2, 1, 0, 2, 3, 4, 2, 1],
  [0, 2, 3, 1, 4, 3, 2, 0],
];
const strength = [42, 46, 50, 55, 61, 66, 70, 75, 86, 92, 98, 91, 78, 68, 56, 44];
for (let bar = 0; bar < 16; bar++) {
  const start = bar * BAR;
  const chord = harmony[bar === 15 ? 0 : bar % 4];
  const level = strength[bar];

  // The pedal releases just before each harmony change, after the written
  // note-offs; this makes sustain audible without smearing successive chords.
  chords.cc(start, 64, 100);
  chord.pad.forEach((pitch, index) => chords.note(start + index * 12, pitch,
    Math.round(level * 0.69) + (index % 2) * 3, BAR - 300 - index * 12));
  chords.cc(start + BAR - 90, 64, 0);
  bass.note(start, chord.bass, Math.min(103, level + 6), PPQ * 1.7);
  bass.note(start + PPQ * 2, chord.bass + (bar >= 8 && bar < 12 ? 12 : 7),
    Math.max(34, level - 3), PPQ * 1.7);

  const phrase = phrases[bar % phrases.length];
  for (let step = 0; step < 8; step++) {
    // Leave a breath in each opening phrase, then let the second half blossom.
    if (bar < 4 && step === 5) continue;
    if (bar === 15 && step > 3) continue;
    const accent = [7, -5, 1, -3, 9, -4, 3, -7][step];
    const pitch = chord.arp[phrase[step]] + (bar >= 8 && bar < 12 && step === 4 ? 12 : 0);
    const ornament = bar >= 8 && bar < 12 && (step === 3 || step === 7);
    const duration = bar === 15 && step === 3 ? PPQ * 2.35 : PPQ * (ornament ? 0.2 : 0.42);
    lead.note(start + step * PPQ / 2, pitch, level + accent, duration);
    if (ornament) {
      lead.note(start + step * PPQ / 2 + PPQ / 4,
        chord.arp[phrase[(step + 1) % 8]], level - 15, PPQ * 0.2);
    }
  }
  // Delicate upward bends during the stronger phrases, always resolving.
  if (bar === 6 || bar === 10 || bar === 12) {
    lead.bend(start + PPQ * 2, 8192 + 500);
    lead.bend(start + PPQ * 2 + 60, 8192 + 850);
    lead.bend(start + PPQ * 2 + 150, 8192 + 300);
    lead.bend(start + PPQ * 2 + 220, 8192);
  }
}

// Quarter-note modulation sweeps provide a continuous visual/audio swell.
for (let beat = 0; beat < 64; beat++) {
  const crest = Math.max(0, Math.sin(Math.PI * beat / 64));
  const value = Math.round(108 * crest ** 1.8);
  lead.cc(beat * PPQ, 1, value);
  chords.cc(beat * PPQ, 1, Math.round(value * 0.78));
}

const conductor = [
  { tick: 0, order: 0, data: meta(0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]) },
  { tick: 0, order: 1, data: meta(0x58, [4, 2, 24, 8]) },
  { tick: 0, order: 2, data: meta(0x59, [0, 1]) },
  { tick: 0, order: 3, data: meta(1, 'Original 16-bar study for Gyroid Smoke; A minor; 112 BPM.') },
];
const bytes = new Uint8Array([
  ...chunk('MThd', [0, 1, 0, 4, PPQ >> 8, PPQ & 255]),
  ...track('Gyroid Drift', conductor),
  ...track('Prismatic arpeggio', lead.messages),
  ...track('Warm sustained chords', chords.messages),
  ...track('Moving bass', bass.messages),
]);
const output = new URL('./gyroid-smoke-demo.mid', import.meta.url);
writeFileSync(output, bytes);
console.log(`Wrote Gyroid Drift: ${bytes.length} bytes, 16 bars, ${END * tempo / (PPQ * 1000000)} seconds.`);
