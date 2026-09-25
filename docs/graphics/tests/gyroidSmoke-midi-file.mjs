import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseMidiFile } from '../gyroidSmoke/midi-file.js';

function chunk(kind, bytes) {
  const header = Buffer.alloc(8);
  header.write(kind, 0, 'ascii');
  header.writeUInt32BE(bytes.length, 4);
  return Buffer.concat([header, Buffer.from(bytes)]);
}
function midi(tracks, { format = tracks.length === 1 ? 0 : 1, division = 480 } = {}) {
  const header = Buffer.alloc(6);
  header.writeUInt16BE(format, 0);
  header.writeUInt16BE(tracks.length, 2);
  header.writeUInt16BE(division, 4);
  return Buffer.concat([chunk('MThd', header), ...tracks.map(bytes => chunk('MTrk', bytes))]);
}
function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
}

// Hand-written format-0 fixture: two tempos, running note status, one-byte
// channel messages, both sysex forms, and silence after the final note.
const fixture = midi([[
  0x00, 0xff, 0x03, 0x04, 0x54, 0x65, 0x73, 0x74,
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 500,000 µs/quarter.
  0x00, 0xc0, 0x0a,
  0x00, 0xd0, 0x40,
  0x00, 0x90, 0x3c, 0x40,
  0x81, 0x70, 0x40, 0x30, // +240 ticks, running note-on.
  0x81, 0x70, 0x80, 0x3c, 0x00,
  0x00, 0x40, 0x00, // Running note-off at tick 480.
  0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40, // 1,000,000 µs/quarter.
  0x00, 0xf0, 0x04, 0x7d, 0x01, 0x02, 0xf7,
  0x00, 0xf7, 0x02, 0x01, 0x02,
  0x83, 0x60, 0x90, 0x45, 0x50, // +480 ticks at the second tempo.
  0x83, 0x60, 0x45, 0x00, // Zero-velocity note-on is preserved.
  0x00, 0xb0, 0x01, 0x78,
  0x00, 0xe0, 0x00, 0x40,
  0x81, 0x70, 0xff, 0x2f, 0x00,
]]);
const decoded = parseMidiFile(fixture);
assert.equal(decoded.name, 'Test');
assert.deepEqual(decoded.events, [
  { time: 0, data: [0xc0, 10] },
  { time: 0, data: [0xd0, 64] },
  { time: 0, data: [0x90, 60, 64] },
  { time: 0.25, data: [0x90, 64, 48] },
  { time: 0.5, data: [0x80, 60, 0] },
  { time: 0.5, data: [0x80, 64, 0] },
  { time: 1.5, data: [0x90, 69, 80] },
  { time: 2.5, data: [0x90, 69, 0] },
  { time: 2.5, data: [0xb0, 1, 120] },
  { time: 2.5, data: [0xe0, 0, 64] },
]);
near(decoded.duration, 3, 'Tempo changes and trailing silence');
const buffer = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);
assert.deepEqual(parseMidiFile(buffer), decoded, 'ArrayBuffer input');
const padded = new Uint8Array(fixture.length + 12);
padded.set(fixture, 5);
assert.deepEqual(parseMidiFile(padded.subarray(5, 5 + fixture.length)), decoded, 'Sliced Uint8Array input');

// A separate conductor track must control notes in every other track.
const multitrack = parseMidiFile(midi([
  [
    0x00, 0xff, 0x51, 0x03, 0x09, 0x27, 0xc0, // 600,000 µs.
    0x83, 0x60, 0xff, 0x51, 0x03, 0x04, 0x93, 0xe0, // 300,000 µs at tick 480.
    0x83, 0x60, 0xff, 0x2f, 0x00,
  ],
  [
    0x81, 0x70, 0x91, 0x3c, 0x40,
    0x81, 0x70, 0x40, 0x40,
    0x81, 0x70, 0x81, 0x3c, 0x00,
    0x81, 0x70, 0x40, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ],
]));
assert.deepEqual(multitrack.events.map(event => event.data), [
  [0x91, 60, 64], [0x91, 64, 64], [0x81, 60, 0], [0x81, 64, 0],
]);
[0.3, 0.6, 0.75, 0.9].forEach((time, index) => near(multitrack.events[index].time, time, 'Conductor tempo map'));
near(multitrack.duration, 0.9, 'Format-1 duration');
const defaultTempo = parseMidiFile(midi([[0x83, 0x60, 0xff, 0x2f, 0x00]]));
near(defaultTempo.duration, 0.5, 'Default 120-BPM tempo');
assert.deepEqual(defaultTempo.events, []);
const withUnknownChunk = Buffer.concat([fixture.subarray(0, 14), chunk('JUNK', [1, 2, 3]), fixture.subarray(14)]);
assert.deepEqual(parseMidiFile(withUnknownChunk), decoded, 'Additional application chunk');

const end = [0, 0xff, 0x2f, 0];
const invalid = [
  [new Uint8Array(), /truncated/],
  [midi([end], { format: 2 }), /format 2/],
  [midi([end], { division: 0xe728 }), /SMPTE/],
  [midi([end], { division: 0 }), /ticks per quarter/],
  [midi([end, end], { format: 0 }), /track count/],
  [midi([[0, 60, 64, ...end]]), /running status/],
  [midi([[0, 0x90, 60]]), /truncated/],
  [midi([[0, 0x90, 60, 0xff, ...end]]), /invalid data byte/],
  [midi([[0, 0x90, 60, 64]]), /missing its end-of-track/],
  [midi([[0, 0xff, 0x2f, 1, 0]]), /end-of-track event must be empty/],
  [midi([[...end, 0]]), /after end-of-track/],
  [midi([[0x81, 0x80, 0x80, 0x80, 0x00, ...end]]), /four bytes/],
  [midi([[0, 0xff, 0x51, 2, 1, 2, ...end]]), /tempo event/],
  [midi([[0, 0xff, 0x51, 3, 0, 0, 0, ...end]]), /tempo must be positive/],
  [midi([[0, 0xff, 1, 10, 0]]), /truncated/],
  [midi([[0, 0xf0, 4, 1]]), /truncated/],
  [midi([[0, 0xf1, 0, ...end]]), /unsupported status/],
  [midi([[0, 0x90, 60, 64, 0, 0xff, 1, 0, 0, 61, 64, ...end]]), /running status/],
  [midi([[0, 0x90, 60, 64, 0, 0xf0, 1, 0xf7, 0, 61, 64, ...end]]), /running status/],
];
for (const [input, pattern] of invalid) assert.throws(() => parseMidiFile(input), pattern);
for (const bytes of [fixture.subarray(0, 13), fixture.subarray(0, fixture.length - 1)]) {
  assert.throws(() => parseMidiFile(bytes), /truncated/);
}
const badHeader = Buffer.from(fixture);
badHeader[0] = 0;
assert.throws(() => parseMidiFile(badHeader), /missing MThd/);
const shortHeader = Buffer.from(fixture);
shortHeader.writeUInt32BE(5, 4);
assert.throws(() => parseMidiFile(shortHeader), /header is too short/);
assert.throws(() => parseMidiFile('not a MIDI file'), TypeError);

const demoPath = new URL('../gyroidSmoke/demo/gyroid-smoke-demo.mid', import.meta.url);
const before = readFileSync(demoPath);
execFileSync(process.execPath, [new URL('../gyroidSmoke/demo/generate-demo.mjs', import.meta.url).pathname]);
assert.deepEqual(readFileSync(demoPath), before, 'Demo generation is deterministic');
const demo = parseMidiFile(before);
assert.equal(demo.name, 'Gyroid Drift');
near(demo.duration, 64 * 535714 / 1000000, '16 bars at 112 BPM');
assert.ok(demo.events.length > 500);
const active = new Map();
const counts = new Map();
const controllers = new Map();
const bends = new Map();
const noteOns = [];
const usedChannels = new Set();
let previous = 0;
for (const { time, data } of demo.events) {
  assert.ok(Number.isFinite(time) && time >= previous && time <= demo.duration);
  previous = time;
  assert.ok(data[0] >= 0x80 && data[0] < 0xf0);
  assert.ok(data.slice(1).every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 127));
  const channel = data[0] & 15;
  const kind = data[0] & 0xf0;
  const key = `${channel}:${data[1]}`;
  if (kind === 0x90 && data[2] > 0) {
    assert.ok(!active.has(key), `Overlapping same-pitch voice: ${key}`);
    active.set(key, time);
    usedChannels.add(channel);
    counts.set(channel, (counts.get(channel) || 0) + 1);
    noteOns.push({ time, channel, pitch: data[1], velocity: data[2] });
  } else if (kind === 0x80 || (kind === 0x90 && data[2] === 0)) {
    assert.ok(active.has(key), `Unmatched note-off: ${key}`);
    assert.ok(time > active.get(key), 'Positive note length');
    active.delete(key);
  } else if (kind === 0xb0) {
    controllers.set(key, data[2]);
  } else if (kind === 0xe0) {
    bends.set(channel, data[1] + data[2] * 128);
  }
}
assert.equal(active.size, 0, 'Every note has an explicit matching note-off');
assert.equal(noteOns[0].time, 0, 'Music begins immediately');
assert.deepEqual([...usedChannels].sort(), [0, 1, 2]);
assert.ok(counts.get(0) > 100 && counts.get(1) >= 64 && counts.get(2) >= 32);
for (const channel of usedChannels) {
  assert.equal(controllers.get(`${channel}:64`), 0, 'Final sustain release');
  assert.equal(controllers.get(`${channel}:1`), 0, 'Final modulation reset');
  assert.equal(controllers.get(`${channel}:123`), 0, 'Final all-notes-off');
  assert.equal(controllers.get(`${channel}:120`), 0, 'Final all-sound-off');
  assert.equal(bends.get(channel), 8192, 'Final centered pitch bend');
}
assert.ok(demo.events.some(event => (event.data[0] & 0xf0) === 0xb0 && event.data[1] === 64 && event.data[2] >= 64));
const modulation = demo.events.filter(event => (event.data[0] & 0xf0) === 0xb0 && event.data[1] === 1).map(event => event.data[2]);
assert.ok(Math.max(...modulation) >= 100 && new Set(modulation).size > 20, 'Broad modulation sweep');
assert.ok(demo.events.some(event => (event.data[0] & 0xf0) === 0xe0 && event.data[1] + event.data[2] * 128 !== 8192));
const average = notes => notes.reduce((sum, note) => sum + note.velocity, 0) / notes.length;
const opening = noteOns.filter(note => note.channel === 0 && note.time < demo.duration / 4);
const peak = noteOns.filter(note => note.channel === 0 && note.time >= demo.duration / 2 && note.time < demo.duration * 3 / 4);
const closing = noteOns.filter(note => note.channel === 0 && note.time >= demo.duration * 7 / 8);
assert.ok(average(peak) > average(opening) + 30, 'Clearly stronger central passage');
assert.ok(average(peak) > average(closing) + 30, 'Gentle ending');
assert.ok(noteOns.some(note => note.channel === 2 && note.pitch < 40), 'Low bass register');
assert.ok(noteOns.some(note => note.channel === 0 && note.pitch >= 84), 'High melodic register');
console.log(`MIDI checks passed: fixtures, malformed input, ${demo.events.length} events, ${demo.duration.toFixed(3)} s original demo.`);
