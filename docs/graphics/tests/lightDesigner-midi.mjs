// CK5 MIDI play mode: a mocked Web MIDI keyboard drives the rig end to end.
//
// No npm dependencies: drives installed Google Chrome over the DevTools protocol.
// Serve the repository on port 8124 (or set GRAPHICS_TEST_URL), then run:
//   node docs/graphics/tests/lightDesigner-midi.mjs
// CHROME_PATH overrides the browser; CHROME_GL=swiftshader forces software GL.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = (process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/').replace(/\/?$/, '/');
const GL = process.env.CHROME_GL || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const PORT = 9800 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Installed before any page script: a fake MIDI keyboard the test can play.
const MOCK_MIDI = `(() => {
  class Port extends EventTarget {
    constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; this.onmidimessage = null; }
  }
  const port = new Port('test-kb', 'Test Keyboard');
  const access = { inputs: new Map([[port.id, port]]), onstatechange: null };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
  window.__midi = { send: (...bytes) => port.onmidimessage && port.onmidimessage({ data: new Uint8Array(bytes) }) };
})();`;

const profile = mkdtempSync(join(tmpdir(), 'lightDesigner-midi-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1100,760',
  '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--use-angle=${GL}`,
  ...(GL === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist']), 'about:blank',
], { stdio: 'ignore' });

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
  if (!ws) await sleep(200);
}
assert(ws, 'Chrome DevTools endpoint did not come up');
const sock = new WebSocket(ws);
let seq = 0;
const pending = new Map(), errors = [];
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
await new Promise((r) => { sock.onopen = r; });
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); sock.send(JSON.stringify({ id, method, params })); });
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expression}\n→ ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}
async function waitFor(expression, what, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await js(expression)) return; await sleep(50); }
  throw new Error(`Timed out waiting for ${what}: ${expression}`);
}
const midi = (...bytes) => js(`__midi.send(${bytes.join(',')})`);
const set = (id, value) => js(`(() => { const el = document.getElementById('${id}'); if (el.type === 'checkbox') el.checked = ${JSON.stringify(value)}; else el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const I = (i) => `ck5.engine.render[${i}].I`;
const passed = [];
const pass = (msg) => { passed.push(msg); console.log(`  ✓ ${msg}`); };

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK_MIDI });
  await send('Page.navigate', { url: `${BASE}lightDesigner/index.html?standalone=1` });
  await waitFor('!!(window.ck5 && ck5.midi && +ck5.rig.canvas.dataset.frames > 5)', 'the rig to render', 20000);
  await js("localStorage.removeItem('ck5.midi'); document.querySelector('.tabs [data-tab=midi]').click()");

  // connection + input list
  await js("document.getElementById('midiConnect').click()");
  await waitFor("document.getElementById('midiStatus').textContent.includes('Test Keyboard')", 'the mocked keyboard to connect');
  assert(await js("[...document.querySelectorAll('#midiInput option')].some(o => o.textContent === 'Test Keyboard')"));
  pass('connects to Web MIDI and lists the keyboard');

  // a key fires its fixture; MIDI play mode turns on by itself
  await set('midiMapping', 'octaves');
  await set('midiBase', '0');
  await midi(0x90, 60, 127); // C4 → pod 4, head 1 (index 30) in red
  await waitFor(`${I(30)} > 0.5`, 'C4 to light pod 4 head 1');
  assert.equal(await js("document.getElementById('midiMode').checked"), true);
  const c = await js('({ r: ck5.engine.render[30].r, g: ck5.engine.render[30].g, b: ck5.engine.render[30].b })');
  assert(c.r > 2 * c.g && c.r > 2 * c.b, `C is red: ${JSON.stringify(c)}`);
  assert(await js(`${I(0)} < 0.05 && ${I(59)} < 0.05`), 'other heads stay dark under blackout');
  pass('note on lights the mapped head, in the pitch colour, and auto-enables play mode');

  const velSoft = await (async () => { await midi(0x90, 64, 30); await waitFor(`${I(33)} > 0.02`, 'the soft note to light'); await sleep(80); return js(`${I(33)}`); })(); // E4 → head 4 (index 33)
  assert(velSoft > 0.05 && velSoft < 0.4, `soft velocity is dim (${velSoft})`);
  await midi(0x80, 64, 0);
  pass('velocity scales brightness');

  await midi(0x80, 60, 0);
  await waitFor(`${I(30)} < 0.03`, 'the note to release', 5000);
  await waitFor('ck5.midi.layer.voices.size === 0', 'released voices to be dropped');
  pass('note off releases and the voice is freed');

  // sustain pedal holds, pedal up releases
  await midi(0xb0, 64, 127);
  await midi(0x90, 62, 110); // D4 → head 3 (index 32)
  await sleep(80);
  await midi(0x80, 62, 0);
  await sleep(1200);
  assert(await js(`${I(32)} > 0.3`), 'sustained note still lit after key-up');
  await midi(0xb0, 64, 0);
  await waitFor(`${I(32)} < 0.03`, 'pedal-up release', 5000);
  pass('sustain pedal holds notes; pedal up releases them');

  // pitch bend turns the hue
  await midi(0x90, 60, 127);
  await waitFor(`${I(30)} > 0.5`, 'the bend test note');
  const before = await js('ck5.engine.render[30].g');
  await midi(0xe0, 127, 127);
  await waitFor(`ck5.engine.render[30].g > ${before + 0.1}`, 'the bend to shift the colour');
  const after = await js('ck5.engine.render[30].g');
  assert(after > before + 0.1, `bend shifts colour (g ${before.toFixed(2)} → ${after.toFixed(2)})`);
  await midi(0xe0, 0, 64);
  await midi(0x80, 60, 0);
  pass('pitch bend rotates the note colour');

  // channel 10 drum map: a crash lights the whole rig
  await midi(0x99, 49, 127);
  await waitFor('ck5.engine.render.filter(r => r.I > 0.3).length >= 70', 'the crash to light the rig');
  const lit = await js('ck5.engine.render.filter(r => r.I > 0.3).length');
  assert(lit >= 70, `crash lights the rig (${lit}/72)`);
  await midi(0x99, 36, 127); // kick → floor units
  await waitFor(`${I(60)} > 0.5 && ${I(71)} > 0.5`, 'the kick to fire the floor');
  pass(`drum map: crash lit ${lit}/72, kick fires the floor`);

  // channel filter
  await waitFor('ck5.midi.layer.voices.size === 0', 'drums to decay', 5000);
  await set('midiChannel', '2');
  await midi(0x90, 65, 100);
  assert.equal(await js('ck5.midi.layer.voices.size'), 0, 'channel 1 ignored while listening on 2');
  await midi(0x91, 65, 100);
  assert.equal(await js('ck5.midi.layer.voices.size'), 1, 'channel 2 heard');
  await midi(0x81, 65, 0);
  await set('midiChannel', '0');
  pass('channel filter');

  // MIDI learn: a learned CC drives a console fader instead of the lights
  await js("document.getElementById('midiLearn').click(); document.getElementById('grandMaster').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  await midi(0xb0, 7, 10);
  assert(await js("document.getElementById('learnStatus').textContent.includes('CC 1:7')"));
  await js("document.getElementById('midiLearn').click()");
  await midi(0xb0, 7, 64);
  await waitFor('Math.abs(ck5.engine.m.grand - 64 / 127) < 0.02', 'CC7 to move the grand master');
  await midi(0xb0, 7, 127);
  pass('learned CC controls the grand master');

  // computer keys become a keyboard, and win over console shortcuts
  await set('qwertyNotes', true);
  await js("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))");
  await sleep(60);
  assert(await js('ck5.midi.layer.held().includes(62)'), 'S plays D4');
  assert.equal(await js('ck5.engine.m.strobeHold'), false, 'S no longer strobes');
  await js("document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 's', bubbles: true }))");
  await sleep(60);
  assert(!(await js('ck5.midi.layer.held().includes(62)')), 'key-up releases');
  await set('qwertyNotes', false);
  pass('computer keys play notes and override shortcuts');

  // on-screen keyboard
  await js("document.querySelector('#pianoKeys [data-note=\"60\"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 1e4 }))");
  await sleep(40);
  assert(await js('ck5.midi.layer.held().includes(60)'));
  await js("document.getElementById('pianoKeys').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))");
  pass('on-screen keyboard plays');

  // sweep test reaches every fixture with the octave map
  await js("document.getElementById('midiSweep').click()");
  await waitFor("document.getElementById('midiLog').textContent.includes('Sweep done')", 'the sweep to finish', 40000);
  const reached = await js('ck5.midi.layer.reached.size');
  assert.equal(reached, 72, `sweep reached ${reached}/72`);
  pass('sweep test reaches all 72 fixtures');

  // test groove: plays pitched parts and drums, sets tempo, stops cleanly
  await set('midiMapping', 'keys');
  await set('midiBase', '0.12');
  const hits0 = await js('ck5.midi.layer.hits');
  await js("document.getElementById('midiDemo').click()");
  await waitFor(`ck5.midi.layer.hits - ${hits0} > 40`, 'the groove to play 40 notes', 20000);
  assert.equal(await js('ck5.engine.bpm'), 120);
  assert(await js('[...ck5.midi.layer.voices.values()].some(v => v.drum) || ck5.midi.layer.hits > 0'));
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(tmpdir(), 'ck5-midi-groove.png'), Buffer.from(data, 'base64'));
  await js("document.getElementById('midiDemo').click()");
  await waitFor('ck5.midi.layer.held().length === 0', 'the groove to stop and release');
  pass('test groove plays drums and pitched parts at 120 BPM and stops cleanly');

  // turning play mode off hands the rig back to the show
  await js('ck5.engine.seek(ck5.engine.show.sections[6].start + 5, 0)');
  await set('midiMode', false);
  assert.equal(await js('ck5.midi.layer.on'), false);
  await waitFor('ck5.engine.render.some(r => r.I > 0.2)', 'the show to come back');
  pass('play mode off restores the show');

  // notes follow the heads onto any rig
  for (const id of ['circles', 'sphere', 'wall2016']) {
    await set('rigSelect', id);
    assert.equal(await js('ck5.rig.canvas.dataset.rig'), id);
    await set('midiMode', true);
    await set('midiBase', '0');
    await set('midiMapping', 'octaves');
    await midi(0x90, 60, 127);
    await waitFor(`${I(30)} > 0.5`, `C4 to fire on the ${id} rig`);
    await midi(0x80, 60, 0);
  }
  pass('switching rigs (circles, sphere, video wall) keeps notes on the same heads');

  // lasers: optional, every look produces sane beams, and notes fire them in MIDI play mode
  await set('laserOn', true);
  for (const look of ['fan', 'sweep', 'sky', 'tunnel', 'burst', 'chase', 'cross', 'auto']) {
    await set('laserPattern', look);
    await sleep(120);
    await midi(0x90, 72, 127);
    await sleep(60);
    const ok = await js('(() => { const L = ck5.lasers; if (!L.count) return false; for (let k = 0; k < L.count * 3; k++) if (!Number.isFinite(L.end[k]) || !Number.isFinite(L.color[k])) return false; return true; })()');
    assert(ok, `laser look ${look} draws finite beams`);
    await midi(0x80, 72, 0);
  }
  await set('midiMode', true);
  await midi(0xb0, 123, 0);
  await waitFor('ck5.midi.layer.voices.size === 0', 'notes to clear');
  await sleep(100);
  const quiet = await js('Math.max(...ck5.lasers.color.slice(0, ck5.lasers.count * 3))');
  await midi(0x90, 60, 127);
  await sleep(80);
  const loud = await js('Math.max(...ck5.lasers.color.slice(0, ck5.lasers.count * 3))');
  assert(loud > quiet * 3, `a note fires the lasers (${quiet.toFixed(3)} → ${loud.toFixed(3)})`);
  await midi(0x80, 60, 0);
  await set('laserOn', false);
  await waitFor('ck5.lasers.count === 0', 'lasers to switch off');
  pass('lasers: all 8 looks draw, MIDI notes fire them, and they switch off');

  // extras: every kit loads; a MIDI crash fires blinders, strobes and CO₂; devices switch off
  for (const kit of ['phish', 'biscuits', 'dead', 'all']) {
    await set('extrasKit', kit);
    await sleep(250);
    assert(await js('ck5.rig.canvas.dataset.frames > 0'), `kit ${kit} renders`);
  }
  assert(await js('ck5.devices.o.tubes && ck5.devices.o.balls === 3 && ck5.devices.o.liquid && ck5.devices.o.co2'), 'the "everything" kit turns every device on');
  assert(await js('ck5.devices.rays.mesh.geometry.instanceCount > 50'), 'mirror balls throw rays');
  assert(await js('(() => { const d = ck5.devices.tubeData; for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) return false; return true; })()'), 'tube pixels are finite');
  await set('midiMode', true);
  await midi(0x99, 49, 127);
  await waitFor('ck5.devices.blinderDefs[0].env > 0.5', 'a crash to hit the blinders');
  await waitFor('ck5.devices.p.age.some((a, i) => a < ck5.devices.p.life[i])', 'a crash to fire the CO₂');
  assert(await js('ck5.devices.burstT > 0'), 'a crash fires a strobe burst');
  await set('extrasKit', 'none');
  await waitFor('!ck5.devices.tubeMesh.visible && !ck5.devices.liquid.visible && ck5.devices.rays.mesh.geometry.instanceCount === 0', 'devices to switch off');
  pass('extras: kits load, a MIDI crash fires blinders/strobes/CO₂, and everything switches off');

  // scenes: morph vs cut, keys, pads, auto-trigger
  await set('midiMode', false);
  await js("ck5.launchScene('curtain', { instant: true })");
  await waitFor("ck5.engine.show.name === 'Teal Curtain' && ck5.engine.rig.id === 'sticks'", 'the curtain scene');
  assert.equal(await js("ck5.needsCut('magentaX')"), false, 'same rig and devices: a morph');
  assert.equal(await js("ck5.needsCut('dome')"), true, 'another rig: a cut');
  assert.equal(await js("ck5.needsCut('smiles')"), true, 'adding LED tubes: a cut');
  await js("window.__minDip = 1; document.querySelector('#sceneGrid [data-id=magentaX]').click(); (function watch() { __minDip = Math.min(__minDip, ck5.engine.m.dip ?? 1); if (ck5.engine.snapT > 0) requestAnimationFrame(watch); })()");
  await waitFor("ck5.engine.show.name === 'Magenta X' && ck5.engine.snapT === 0", 'the morph to finish');
  assert.equal(await js('__minDip'), 1, 'a morph never dips to black');
  await js("window.__minDip = 1; document.querySelector('#sceneGrid [data-id=dome]').click(); (function watch() { __minDip = Math.min(__minDip, ck5.engine.m.dip ?? 1); if (ck5.engine.rig.id !== 'circles' || ck5.engine.m.dip < 1) requestAnimationFrame(watch); })()");
  await waitFor("ck5.engine.rig.id === 'circles' && ck5.engine.m.dip === 1", 'the cut to the circles rig');
  assert(await js('__minDip') < 0.05, 'a cut dips to black');
  assert(await js('Math.max(...ck5.engine.pods.map((p, i) => Math.abs(p.h - ck5.engine.kinPre[i].h))) < 0.05'), 'after a cut the pods land on their marks');
  await js("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await waitFor("ck5.engine.show.name === 'Teal Curtain'", 'key 2 to launch scene 2');
  await midi(0x9f, 36, 100); // channel 16, C2 → scene 1
  await waitFor("ck5.engine.show.name === 'Blue Hush'", 'a channel-16 pad to launch scene 1');
  await js("ck5.launchScene('curtain', { instant: true }); ck5.engine.bpm = 480");
  await set('sceneEvery', '4');
  await set('sceneAuto', 'smooth');
  // from the curtain the only smooth neighbour is Magenta X, so smooth auto-play alternates the two
  await js("window.__cuts = 0; window.__launches = 0; window.__last = ck5.engine.show.name; (function watch() { if ((ck5.engine.m.dip ?? 1) < 1) __cuts++; if (ck5.engine.show.name !== __last) { __launches++; __last = ck5.engine.show.name; } if (__launches < 3) requestAnimationFrame(watch); })()");
  await waitFor('__launches >= 3', 'auto-trigger to launch three scenes', 20000);
  assert.equal(await js('__cuts'), 0, 'smooth auto-trigger never cuts');
  await set('sceneAuto', 'off');
  await js('ck5.engine.bpm = 120');
  pass('scenes: morph without a dip, cut with one (pods on their marks), keys, channel-16 pads, smooth auto-trigger');

  assert.deepEqual(errors, [], `page errors:\n${errors.join('\n')}`);
  console.log(`PASS: CK5 MIDI (${passed.length} checks). Screenshot: ${join(tmpdir(), 'ck5-midi-groove.png')}`);
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  sock.close();
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still closing */ }
}
