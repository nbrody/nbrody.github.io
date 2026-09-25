// MIDI interpretation and visual envelopes, independent of browser APIs.
const ATTACK = 0.012;
const DECAY = 0.45;
const RELEASE = 0.45;
const STRIKE_DECAY = 0.09;
const SUSTAIN_LEVEL = 0.24;
const SILENCE = 0.0001;

function sourceName(source) {
  return typeof source === 'string' && source.length ? source : 'live';
}

function envelope(voice) {
  if (voice.released) return voice.releaseLevel * Math.exp(-voice.releaseAge / RELEASE);
  if (voice.age < ATTACK) return voice.velocity * voice.age / ATTACK;
  return voice.velocity * (SUSTAIN_LEVEL + (1 - SUSTAIN_LEVEL) * Math.exp(-(voice.age - ATTACK) / DECAY));
}

function strike(voice) {
  return voice.velocity * Math.exp(-voice.age / STRIKE_DECAY);
}

/**
 * Channels are zero based; velocities, levels and pressure are in [0, 1].
 * update().pitch is a weighted MIDI note number, or 60 when silent.
 * activeCount excludes release tails, while update().notes includes them.
 */
export class MidiState {
  constructor() {
    this._sources = new Map();
    this._sequence = 0;
    this._lastNote = null;
  }

  get activeCount() {
    let count = 0;
    for (const channels of this._sources.values()) {
      for (const channel of channels.values()) {
        for (const voice of channel.notes.values()) {
          if (voice.held || voice.sustained) count++;
        }
      }
    }
    return count;
  }

  get lastNote() { return this._lastNote?.note ?? null; }

  _channel(source, number) {
    let channels = this._sources.get(source);
    if (!channels) this._sources.set(source, channels = new Map());
    let channel = channels.get(number);
    if (!channel) {
      channel = { notes: new Map(), sustain: false, bend: 0, modulation: 0, pressure: 0, sequence: 0 };
      channels.set(number, channel);
    }
    return channel;
  }

  _release(voice) {
    if (voice.released) return;
    // MIDI can deliver a complete short note between animation frames. Preserve
    // its strike for visual emitters and the optional frame-driven synth.
    voice.releaseLevel = voice.age === 0 ? voice.velocity : envelope(voice);
    voice.releaseAge = 0;
    voice.sustained = false;
    voice.released = true;
  }

  _pedal(channel, down) {
    channel.sustain = down;
    if (!down) {
      for (const voice of channel.notes.values()) {
        if (!voice.held && voice.sustained) this._release(voice);
      }
    }
  }

  /** Return a semantic event, or null for malformed/unsupported messages. */
  handle(data, source = 'live') {
    if (!data || typeof data.length !== 'number' || !Number.isInteger(data.length)) return null;
    const status = data[0];
    if (!Number.isInteger(status) || status < 0x80 || status > 0xff) return null;
    source = sourceName(source);
    if (status === 0xff && data.length === 1) {
      this.clear();
      return { type: 'reset', source };
    }
    if (status >= 0xf0) return null;
    const kind = status & 0xf0;
    const length = kind === 0xc0 || kind === 0xd0 ? 2 : 3;
    if (data.length !== length) return null;
    for (let i = 1; i < length; i++) {
      if (!Number.isInteger(data[i]) || data[i] < 0 || data[i] > 127) return null;
    }
    if (kind === 0xc0) return null; // Programs do not affect the visual instrument.

    const number = status & 0x0f;
    const channel = this._channel(source, number);
    channel.sequence = ++this._sequence;
    const base = { source, channel: number };
    const key = data[1];
    const value = data[2];

    if (kind === 0x90 && value > 0) {
      const voice = {
        note: key, velocity: value / 127, age: 0, held: true, sustained: false,
        released: false, releaseAge: 0, releaseLevel: 0, pressure: 0,
        sequence: this._sequence,
      };
      channel.notes.set(key, voice);
      this._lastNote = { source, note: key, sequence: voice.sequence };
      return { type: 'noteon', ...base, note: key, velocity: value / 127, rawVelocity: value };
    }
    if (kind === 0x80 || kind === 0x90) {
      const voice = channel.notes.get(key);
      if (voice?.held) {
        voice.held = false;
        voice.sustained = channel.sustain;
        if (!channel.sustain) this._release(voice);
      }
      return { type: 'noteoff', ...base, note: key, velocity: value / 127, rawVelocity: value };
    }
    if (kind === 0xa0) {
      const voice = channel.notes.get(key);
      if (voice) voice.pressure = value / 127;
      return { type: 'polypressure', ...base, note: key, value: value / 127 };
    }
    if (kind === 0xb0) {
      if (key === 1) channel.modulation = value / 127;
      if (key === 64) this._pedal(channel, value >= 64);
      if (key === 120) channel.notes.clear();
      if (key === 121) {
        this._pedal(channel, false);
        channel.bend = channel.modulation = channel.pressure = 0;
        for (const voice of channel.notes.values()) voice.pressure = 0;
      }
      if (key === 123) {
        for (const voice of channel.notes.values()) {
          if (!voice.held) continue;
          voice.held = false;
          voice.sustained = channel.sustain;
          if (!channel.sustain) this._release(voice);
        }
      }
      return { type: 'controlchange', ...base, controller: key, value, normalizedValue: value / 127 };
    }
    if (kind === 0xd0) {
      channel.pressure = key / 127;
      return { type: 'channelpressure', ...base, value: channel.pressure };
    }
    if (kind === 0xe0) {
      const bend = key + value * 128 - 8192;
      channel.bend = bend / (bend < 0 ? 8192 : 8191);
      return { type: 'pitchbend', ...base, value: channel.bend };
    }
    return null;
  }

  /** Remove one input source, or reset the complete instrument. */
  clear(source) {
    if (source === undefined) {
      this._sources.clear();
      this._lastNote = null;
      this._sequence = 0;
      return;
    }
    source = sourceName(source);
    this._sources.delete(source);
    if (this._lastNote?.source === source) {
      this._lastNote = null;
      for (const [otherSource, channels] of this._sources) {
        for (const channel of channels.values()) {
          for (const voice of channel.notes.values()) {
            if (!this._lastNote || voice.sequence > this._lastNote.sequence) {
              this._lastNote = { source: otherSource, note: voice.note, sequence: voice.sequence };
            }
          }
        }
      }
    }
  }

  /** Advance by elapsed seconds. Invalid or negative elapsed times mean zero. */
  update(dtSeconds = 0) {
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    const voices = [];
    let weight = 0, pitch = 0, bend = 0, modulation = 0, pressure = 0, energy = 0;
    let latestChannel = null;
    for (const [source, channels] of this._sources) {
      for (const [number, channel] of channels) {
        if (!latestChannel || channel.sequence > latestChannel.sequence) latestChannel = channel;
        for (const [note, voice] of channel.notes) {
          // Limit ages to keep repeated very large dt inputs finite.
          voice.age = Math.min(1e6, voice.age + dt);
          if (voice.released) voice.releaseAge = Math.min(1e6, voice.releaseAge + dt);
          const level = envelope(voice);
          const onset = strike(voice);
          if (voice.released && level < SILENCE && onset < SILENCE) {
            channel.notes.delete(note);
            continue;
          }
          const importance = level + onset * 0.4;
          weight += importance;
          pitch += voice.note * importance;
          bend += channel.bend * importance;
          modulation += channel.modulation * importance;
          pressure += Math.max(channel.pressure, voice.pressure) * importance;
          energy += level * 0.7 + onset * 0.45;
          voices.push({ note, velocity: voice.velocity, level, bend: channel.bend, channel: number, source,
            importance, sequence: voice.sequence });
        }
      }
    }
    voices.sort((a, b) => b.importance - a.importance || b.sequence - a.sequence);
    return {
      energy: 1 - Math.exp(-energy),
      pitch: weight > 0 ? pitch / weight : 60,
      bend: weight > 0 ? bend / weight : latestChannel?.bend ?? 0,
      modulation: weight > 0 ? modulation / weight : latestChannel?.modulation ?? 0,
      pressure: weight > 0 ? pressure / weight : latestChannel?.pressure ?? 0,
      notes: voices.slice(0, 8).map(({ importance, sequence, ...voice }) => voice),
    };
  }
}

export default MidiState;
