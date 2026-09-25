import { MidiState } from './midi-state.js';
import { parseMidiFile } from './midi-file.js';

const DEMO_URL = new URL('./demo/gyroid-smoke-demo.mid', import.meta.url);
const noteName = note => `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][note % 12]}${Math.floor(note / 12) - 1}`;

// A small optional monitor, driven by the same sustained/releasing voices as
// the picture. MIDI itself contains note instructions, not recorded audio.
class Synth {
  constructor() { this.context = null; this.voices = new Map(); }
  async enable() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { this.failed = true; return false; }
      if (!this.context) {
        this.context = new Audio({ latencyHint: 'interactive' });
        this.master = this.context.createGain();
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 2800;
        this.master.connect(filter).connect(this.context.destination);
      }
      this.failed = false;
      // Browsers can leave resume pending without a user gesture.
      this.context.resume().catch(() => {});
      return this.context.state === 'running';
    } catch { this.failed = true; return false; }
  }
  update(sample, volume, enabled) {
    if (!this.context) return;
    if (!enabled || this.context.state !== 'running') { this.clear(); return; }
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(volume * 0.5, now, 0.02);
    const wanted = new Set();
    for (const note of sample.notes) {
      if (note.level < 0.002) continue;
      const key = `${note.source}:${note.channel}:${note.note}`;
      wanted.add(key);
      let voice = this.voices.get(key);
      if (!voice) {
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = note.note < 48 ? 'sine' : 'triangle';
        gain.gain.value = 0;
        oscillator.connect(gain).connect(this.master);
        oscillator.start();
        voice = { oscillator, gain };
        this.voices.set(key, voice);
      }
      const frequency = 440 * 2 ** ((note.note - 69 + (note.bend ?? sample.bend) * 2) / 12);
      voice.oscillator.frequency.setTargetAtTime(frequency, now, 0.01);
      voice.gain.gain.setTargetAtTime(note.level * Math.sqrt(note.velocity) * 0.16, now, 0.012);
    }
    for (const [key, voice] of this.voices) if (!wanted.has(key)) this.release(key, voice);
  }
  release(key, voice) {
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.015);
    voice.oscillator.stop(now + 0.1);
    voice.oscillator.onended = () => { voice.oscillator.disconnect(); voice.gain.disconnect(); };
    this.voices.delete(key);
  }
  clear() { for (const [key, voice] of this.voices) this.release(key, voice); }
}

export function createMidiController() {
  const $ = id => document.getElementById(id);
  const state = new MidiState(), synth = new Synth();
  const bound = new Map();
  let access = null, connecting = false, connectionVersion = 0;
  let keyboardStatus = 'Connect a keyboard or play the demo.';
  let demo = null, demoPromise = null, playing = false, cursor = 0, started = 0, playVersion = 0;
  let lastReadout = 0, signature = '', demoPosition = 0;
  const uniformNotes = new Float32Array(32);

  function status() {
    const audioNotice = $('midiSound').checked && (synth.failed || (synth.context && synth.context.state !== 'running'))
      ? ' Click Synth sound off/on on the display to enable audio.' : '';
    $('midiStatus').value = `${playing ? `Demo ${demoPosition.toFixed(1)} / ${demo.duration.toFixed(1)} s · ` : ''}${keyboardStatus}${audioNotice}`;
    $('midiStatus').title = $('midiStatus').value;
  }
  function receive(data, source) {
    if (document.hidden) return;
    state.handle(data, source);
  }
  function unbind(id, entry) {
    entry.port.removeEventListener('midimessage', entry.listener);
    Promise.resolve(entry.port.close?.()).catch(() => {});
    state.clear(`live:${id}`);
    bound.delete(id);
  }
  function refreshInputs() {
    if (!access) return;
    const ports = [...access.inputs.values()].filter(port => port.state === 'connected');
    const select = $('midiInput'), selected = select.value;
    const options = [['all', 'All connected inputs'], ...ports.map(port => [port.id, port.name || port.manufacturer || 'MIDI keyboard'])];
    // A port's open/close event must not replace an actively used select.
    if (JSON.stringify([...select.options].map(option => [option.value, option.textContent])) !== JSON.stringify(options)) {
      select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
      select.value = options.some(([id]) => id === selected) ? selected : 'all';
    }
    const desired = ports.filter(port => select.value === 'all' || port.id === select.value);
    for (const [id, entry] of bound) if (!desired.some(port => port.id === id && port === entry.port)) unbind(id, entry);
    for (const port of desired) if (!bound.has(port.id)) {
      const listener = event => receive(event.data, `live:${port.id}`);
      bound.set(port.id, { port, listener });
      port.addEventListener('midimessage', listener);
    }
    keyboardStatus = ports.length ? `Listening to ${select.value === 'all' ? `${ports.length} MIDI input${ports.length === 1 ? '' : 's'}` : desired[0]?.name || 'keyboard'}.` : 'MIDI enabled. Plug in a keyboard; it will appear here.';
    status();
  }
  async function connect() {
    if (connecting) return;
    if (!navigator.requestMIDIAccess) {
      keyboardStatus = 'Live MIDI unavailable here. Open in Chrome or Edge, or use the demo.';
      status(); return;
    }
    if ($('midiSound').checked) synth.enable();
    if (access) { refreshInputs(); return; }
    connecting = true;
    const version = ++connectionVersion;
    keyboardStatus = 'Waiting for MIDI permission…'; status();
    try {
      const result = await navigator.requestMIDIAccess({ sysex: false });
      if (version !== connectionVersion) return;
      access = result;
      access.addEventListener('statechange', refreshInputs);
      refreshInputs();
    } catch (error) {
      if (version !== connectionVersion) return;
      keyboardStatus = error.name === 'NotAllowedError'
        ? 'MIDI access denied. Allow MIDI in browser site settings, then reconnect. Demo still works.'
        : 'Could not open MIDI. Try Chrome or Edge over HTTPS or localhost; demo still works.';
      status();
    } finally { if (version === connectionVersion) connecting = false; }
  }
  function disconnect() {
    connectionVersion++; connecting = false;
    access?.removeEventListener('statechange', refreshInputs);
    access = null;
    for (const [id, entry] of bound) unbind(id, entry);
    $('midiInput').replaceChildren(new Option('All connected inputs', 'all'));
    keyboardStatus = 'Keyboard disconnected. Demo is available.';
    status();
  }
  function stopDemo() {
    playVersion++; playing = false; cursor = 0; demoPosition = 0;
    state.clear('demo');
    status();
  }
  async function playDemo() {
    stopDemo();
    const version = playVersion;
    if ($('midiSound').checked) synth.enable();
    try {
      if (!demoPromise) demoPromise = fetch(DEMO_URL).then(response => {
        if (!response.ok) throw new Error('The demo MIDI file could not be loaded.');
        return response.arrayBuffer();
      }).then(parseMidiFile).catch(error => { demoPromise = null; throw error; });
      const loaded = await demoPromise;
      if (version !== playVersion || document.hidden) return;
      demo = loaded; cursor = 0; started = performance.now(); playing = true;
      $('midiEnabled').checked = true;
      $('animate').checked = true;
      $('animate').dispatchEvent(new Event('input', { bubbles: true }));
      status();
    } catch (error) {
      if (version !== playVersion) return;
      keyboardStatus = error.message; status();
    }
  }
  function panic() { stopDemo(); state.clear(); synth.clear(); }
  $('midiConnect').addEventListener('click', connect);
  $('midiDisconnect').addEventListener('click', disconnect);
  $('midiInput').addEventListener('input', refreshInputs);
  $('midiPlay').addEventListener('click', playDemo);
  $('midiStop').addEventListener('click', stopDemo);
  $('midiPanic').addEventListener('click', panic);
  $('midiDownload').addEventListener('click', () => {
    const anchor = document.createElement('a');
    anchor.href = DEMO_URL.href; anchor.download = 'gyroid-smoke-demo.mid'; anchor.click();
  });
  $('midiSound').addEventListener('input', () => {
    if ($('midiSound').checked) synth.enable(); else synth.clear();
    status();
  });
  $('animate').addEventListener('input', () => { if (!$('animate').checked) stopDemo(); });
  for (const id of ['midiStrength', 'midiVolume']) $(id).addEventListener('input', () => {
    document.querySelector(`label[for="${id}"] output`).textContent = Number($(id).value).toFixed(2);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) panic(); });
  window.addEventListener('pagehide', () => { panic(); disconnect(); synth.context?.close().catch(() => {}); });

  return {
    reset: panic,
    update(now, dt) {
      if (playing) {
        demoPosition = Math.max(0, (now - started) / 1000);
        while (cursor < demo.events.length && demo.events[cursor].time <= demoPosition) receive(demo.events[cursor++].data, 'demo');
        if (demoPosition >= demo.duration) {
          state.clear('demo');
          if ($('midiLoop').checked) { cursor = 0; started = now; demoPosition = 0; }
          else stopDemo();
        }
      }
      const sample = state.update(Math.min(Math.max(0, dt), 0.1));
      synth.update(sample, Number($('midiVolume').value), $('midiSound').checked);
      const strength = $('midiEnabled').checked ? Number($('midiStrength').value) : 0;
      uniformNotes.fill(0);
      sample.notes.slice(0, 8).forEach((note, i) => {
        uniformNotes[i * 4] = 0.12 + 0.76 * Math.max(0, Math.min(1, (note.note - 36) / 48));
        uniformNotes[i * 4 + 1] = 0.5 + 0.25 * Math.sin(note.note * 2.39996);
        uniformNotes[i * 4 + 2] = (note.note % 12) / 12;
        uniformNotes[i * 4 + 3] = note.level * note.velocity * strength;
      });
      // Raw voices also support spatial instruments, while the existing vec4
      // note payload remains the 2D shader's interface.
      const values = { energy: sample.energy * strength, modulation: sample.modulation * strength, bend: sample.bend * strength, pressure: sample.pressure * strength, pitch: sample.pitch, notes: uniformNotes, voices: sample.notes, strength, activeCount: state.activeCount, playing };
      const nextSignature = [values.energy, values.modulation, values.bend, values.pressure, values.pitch, values.activeCount, Number(playing), ...uniformNotes].map(value => Math.round(value * 10000)).join(',');
      values.changed = signature !== nextSignature;
      signature = nextSignature;
      if (now - lastReadout > 100) {
        lastReadout = now;
        const names = [...new Set(sample.notes.filter(note => note.level > 0.03).map(note => noteName(note.note)))];
        $('midiActivity').value = names.length ? `${names.join(' · ')} — ${state.activeCount} held` : 'No notes';
        status();
      }
      return values;
    },
  };
}
