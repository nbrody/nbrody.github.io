import assert from 'node:assert/strict';
import { MidiState } from '../gyroidSmoke/midi-state.js';

const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} vs ${expected}`);
const noteOn = (state, note = 60, velocity = 100, source = 'live', channel = 0) => state.handle([0x90 + channel, note, velocity], source);
const noteOff = (state, note = 60, source = 'live', channel = 0) => state.handle([0x80 + channel, note, 0], source);
const cc = (state, controller, value, source = 'live', channel = 0) => state.handle([0xb0 + channel, controller, value], source);

{
  const state = new MidiState();
  assert.deepEqual(state.update(0), { energy: 0, pitch: 60, bend: 0, modulation: 0, pressure: 0, notes: [] });
  assert.equal(state.lastNote, null);
  const event = noteOn(state, 72, 127);
  assert.equal(event.type, 'noteon');
  assert.equal(event.velocity, 1);
  assert.equal(state.activeCount, 1);
  assert.equal(state.lastNote, 72);
  assert(state.update(0).energy > 0, 'A strike reacts before the first elapsed frame');
  const attack = state.update(0.012);
  near(attack.notes[0].level, 1, 'Attack reaches full velocity at 12 ms');
  const held = state.update(10);
  assert(held.energy > 0.1 && held.energy < attack.energy, 'Held notes settle to a persistent low energy');
  near(held.pitch, 72, 'Pitch remains a MIDI note number');
  state.handle([0x90, 72, 0]);
  assert.equal(state.activeCount, 0, 'Zero-velocity note-on is a note-off');
  assert(state.update(0.1).notes[0].level > 0, 'Released notes have a visual tail');
  assert.equal(state.update(10).notes.length, 0, 'Release tails eventually disappear');
}

{
  const state = new MidiState();
  noteOn(state, 60, 100, 'live:a', 0);
  noteOn(state, 60, 100, 'live:a', 1);
  noteOn(state, 60, 100, 'demo', 0);
  state.update(0.02);
  cc(state, 64, 127, 'live:a');
  noteOff(state, 60, 'live:a');
  noteOff(state, 60, 'live:a', 1);
  assert.equal(state.activeCount, 2, 'Sustain is isolated by source and channel');
  cc(state, 123, 0, 'demo');
  assert.equal(state.activeCount, 1);
  cc(state, 123, 0, 'live:a');
  assert.equal(state.activeCount, 1, 'All notes off respects an already sustained voice');
  cc(state, 64, 0, 'live:a');
  assert.equal(state.activeCount, 0, 'Pedal release ends sustained voices');
  assert(state.update(0.01).notes.length > 0, 'Pedal release uses the normal release envelope');
  cc(state, 120, 0, 'live:a');
  assert(state.update(0).notes.every(voice => voice.source !== 'live:a' || voice.channel !== 0), 'All sound off removes its channel immediately');
  state.clear('live:a');
  assert(state.update(0).notes.every(voice => voice.source === 'demo'), 'Disconnecting one source preserves another');
}

{
  const state = new MidiState();
  noteOn(state, 67, 127);
  state.update(0.02);
  cc(state, 64, 127);
  cc(state, 123, 0);
  assert.equal(state.activeCount, 1, 'All notes off under sustain keeps the sounding note');
  cc(state, 1, 127);
  state.handle([0xe0, 127, 127]);
  state.handle([0xd0, 100]);
  assert.equal(state.update(0).bend, 1);
  assert.equal(state.update(0).modulation, 1);
  near(state.update(0).pressure, 100 / 127, 'Channel pressure is normalized');
  cc(state, 121, 0);
  assert.equal(state.activeCount, 0, 'Reset controllers releases pedal-held notes');
  const reset = state.update(0);
  assert.equal(reset.bend, 0);
  assert.equal(reset.modulation, 0);
  assert.equal(reset.pressure, 0);
  noteOn(state, 67, 127);
  cc(state, 64, 127);
  cc(state, 121, 0);
  assert.equal(state.activeCount, 1, 'Reset controllers does not release a physically held key');
  state.handle([0xa0, 67, 127]);
  assert.equal(state.update(0).pressure, 1, 'Polyphonic pressure reaches the matching voice');
  state.handle([0xe0, 0, 0]);
  assert.equal(state.update(0).bend, -1);
  state.handle([0xe0, 0, 64]);
  assert.equal(state.update(0).bend, 0, 'Pitch bend center is exact');
  state.handle([0xff]);
  assert.equal(state.activeCount, 0);
  assert.equal(state.lastNote, null);
  assert.deepEqual(state.update(0), new MidiState().update(0), 'System reset clears all voices and controllers');
}

{
  const state = new MidiState();
  state.handle([0xe0, 127, 127], 'live:a');
  cc(state, 1, 127, 'live:a');
  assert.equal(state.update(0).bend, 1, 'Controls can move before a note is played');
  noteOn(state, 60, 127, 'live:a');
  noteOn(state, 84, 127, 'demo');
  state.update(0.012);
  near(state.update(0).pitch, 72, 'Equal voices have weighted mean pitch');
  near(state.update(0).bend, 0.5, 'Channel controls follow weighted sounding voices');
  const voices = state.update(0).notes;
  assert.equal(voices.find(voice => voice.source === 'live:a').bend, 1, 'Each voice retains the bend of its source/channel');
  assert.equal(voices.find(voice => voice.source === 'demo').bend, 0, 'Another source keeps its own unbent pitch');
  noteOn(state, 48, 127, 'live:a', 1);
  state.handle([0xe1, 0, 0], 'live:a');
  assert.equal(state.update(0).notes.find(voice => voice.source === 'live:a' && voice.channel === 1).bend, -1, 'Another channel on the same source keeps its own bend');
  state.clear('live:a');
  assert.equal(state.update(0).bend, 0, 'Source clear also discards controller state');
  assert.equal(state.lastNote, 84);
  state.clear('demo');
  assert.equal(state.lastNote, null);
}

{
  const state = new MidiState();
  for (let i = 0; i < 12; i++) noteOn(state, 48 + i, 30 + i * 8);
  const output = state.update(0.012);
  assert.equal(state.activeCount, 12);
  assert.equal(output.notes.length, 8, 'GPU note payload has a bounded size');
  assert.equal(output.notes[0].note, 59, 'Strongest voices are retained first');
  assert(output.energy >= 0 && output.energy <= 1);
  const before = state.update(0);
  for (const malformed of [null, [], [60, 100, 1], [0x90, 60], [0x90, -1, 127], [0x90, 128, 127], [0x90, 60, NaN], [0x90, 60.5, 100], [0x90, 60, '100'], [0xff, 0], [0xd0, 12, 10], [0x190, 60, 127], 'abc']) {
    assert.equal(state.handle(malformed), null);
  }
  assert.deepEqual(state.update(NaN), before, 'Malformed MIDI and elapsed time leave state valid');
  assert.deepEqual(state.update(-1), before);
  assert.deepEqual(state.update(Infinity), before);
  const large = state.update(Number.MAX_VALUE);
  for (const key of ['energy', 'pitch', 'bend', 'modulation', 'pressure']) assert(Number.isFinite(large[key]));
}

{
  const oneFrame = new MidiState();
  const manyFrames = new MidiState();
  for (const state of [oneFrame, manyFrames]) noteOn(state, 60, 127);
  oneFrame.update(0.3);
  for (let i = 0; i < 30; i++) manyFrames.update(0.01);
  near(oneFrame.update(0).energy, manyFrames.update(0).energy, 'Held envelope is independent of update partition');
  for (const state of [oneFrame, manyFrames]) noteOff(state);
  oneFrame.update(0.9);
  for (let i = 0; i < 90; i++) manyFrames.update(0.01);
  near(oneFrame.update(0).energy, manyFrames.update(0).energy, 'Release envelope is independent of update partition');
  const brief = new MidiState();
  noteOn(brief);
  noteOff(brief);
  const shortStrike = brief.update(1 / 60);
  assert(shortStrike.energy > 0, 'A short note between frames still creates a strike');
  assert(shortStrike.notes[0].level > 0, 'A short note also reaches emitters and the frame-driven synth');
  assert.equal(brief.update(10).notes.length, 0);
  const retrigger = new MidiState();
  noteOn(retrigger, 60, 127);
  retrigger.update(0.5);
  noteOn(retrigger, 60, 127);
  assert.equal(retrigger.activeCount, 1, 'Repeated note-on retriggers one pitch/channel voice');
  near(retrigger.update(0.012).notes[0].level, 1, 'Retrigger restarts attack');
}

console.log('PASS: MIDI parsing, sustain and channel/source isolation, controllers, pressure, envelopes, reset, malformed input and bounded voice output.');
