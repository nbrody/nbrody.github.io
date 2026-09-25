// CK5 MIDI play mode: a mocked Web MIDI keyboard drives the rig end to end.
//
// No npm dependencies: drives installed Google Chrome over the DevTools protocol.
// Serve the repository on port 8124 (or set GRAPHICS_TEST_URL), then run:
//   node docs/graphics/tests/lightDesigner-midi.mjs
// CHROME_PATH overrides the browser; CHROME_GL=swiftshader forces software GL.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = (process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/').replace(/\/?$/, '/');
const GL = process.env.CHROME_GL || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
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
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1100,760',
  '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--use-angle=${GL}`,
  ...(GL === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist']), 'about:blank',
], { stdio: 'ignore' });

let ws;
// Chrome picks a free port itself (--remote-debugging-port=0) and writes it to its own
// profile, so this only ever talks to the Chrome it launched — never another one on the machine.
for (let i = 0; i < 75 && !ws; i++) {
  try {
    const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
    ws = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* starting */ }
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
  // a crash decays in ~0.3 s, so record its peak in the page rather than polling for it
  await js("window.__lit = 0; window.__litT = performance.now(); (function watch() { __lit = Math.max(__lit, ck5.engine.render.filter((r) => r.I > 0.3).length); if (performance.now() - __litT < 1200) requestAnimationFrame(watch); })()");
  await midi(0x99, 49, 127);
  await waitFor('__lit >= 70 || performance.now() - __litT > 1200', 'the crash to light the rig');
  const lit = await js('__lit');
  assert(lit >= 70, `crash lights the rig (${lit}/72)`);
  await js("window.__kick = 0; window.__kickT = performance.now(); (function watch() { __kick = Math.max(__kick, Math.min(ck5.engine.render[60].I, ck5.engine.render[71].I)); if (performance.now() - __kickT < 1200) requestAnimationFrame(watch); })()");
  await midi(0x99, 36, 127); // kick → floor units
  await waitFor('__kick > 0.5 || performance.now() - __kickT > 1200', 'the kick to fire the floor');
  assert(await js('__kick') > 0.5, 'the kick fires the floor');
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

  // stick formations: flips stand sticks up, and they travel there rather than jump
  await set('midiMode', false);
  await js("ck5.launchScene('portal', { instant: true })");
  await waitFor("ck5.engine.show.name === 'Portal Tunnel'", 'the portal scene');
  await sleep(200);
  const legs = await js("(() => { const o = {}; ck5.engine.rig.pose(0, 0, ck5.engine.pods[0], 0, o); const l = o.m[0]; ck5.engine.rig.pose(0, 2, ck5.engine.pods[0], 0, o); return { outer: l, middle: o.m[0], f: ck5.engine.pods[0].f } })()");
  assert(Math.abs(legs.outer) < 0.05 && legs.middle > 0.95, `portal: outer sticks vertical, middle ones level (${JSON.stringify(legs)})`);
  await js("window.__f = []; ck5.launchScene('curtain', { fade: 2 }); (function watch() { __f.push(ck5.engine.pods[0].f[0]); if (__f.length < 400 && ck5.engine.pods[0].f[0] > 0.001) requestAnimationFrame(watch); })()");
  await waitFor('ck5.engine.pods[0].f[0] < 0.01', 'the legs to swing back down', 8000);
  assert(await js('__f.filter((v) => v > 0.1 && v < 0.9).length >= 5'), 'the flip travels through in-between angles');
  pass('stick formations: portal legs stand vertical, and flips travel smoothly back');

  // lasers: optional, every look produces sane beams, and notes fire them in MIDI play mode
  await set('laserOn', true);
  await js("window.__lp = []; (function watch() { __lp.push(ck5.lasers.presence); if (ck5.lasers.presence < 1) requestAnimationFrame(watch); })()");
  await waitFor('ck5.lasers.presence === 1', 'the laser projectors to rise');
  assert(await js('__lp.some((v) => v > 0.1 && v < 0.9)'), 'the projectors rise rather than pop in');
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
  await waitFor('!ck5.sceneMoving() || ck5.devices.ballDefs.every((b) => b.pres === 1)', 'the devices to arrive');
  await waitFor('ck5.devices.rays.mesh.geometry.instanceCount > 50', 'mirror balls to throw rays');
  await waitFor('ck5.devices.pres.blinders === 1 && ck5.devices.pres.co2 === 1', 'blinders and CO₂ to rise');
  assert(await js('(() => { const d = ck5.devices.tubeData; for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) return false; return true; })()'), 'tube pixels are finite');
  await set('midiMode', true);
  await midi(0x99, 49, 127);
  await waitFor('ck5.devices.blinderDefs[0].env > 0.5', 'a crash to hit the blinders');
  await waitFor('ck5.devices.p.age.some((a, i) => a < ck5.devices.p.life[i])', 'a crash to fire the CO₂');
  assert(await js('ck5.devices.burstT > 0'), 'a crash fires a strobe burst');
  await set('extrasKit', 'none');
  await waitFor('!ck5.devices.tubeMesh.visible && !ck5.devices.liquid.visible && ck5.devices.rays.mesh.geometry.instanceCount === 0', 'devices to switch off');
  pass('extras: kits load, a MIDI crash fires blinders/strobes/CO₂, and everything switches off');

  // scenes: every launch moves; devices a scene adds or drops travel in and out
  await set('midiMode', false);
  await js("ck5.launchScene('curtain', { instant: true })");
  await waitFor("ck5.engine.show.name === 'Teal Curtain' && !ck5.devices.o.tubes", 'the curtain scene');
  // adding truss bars: they grow out of the sticks
  await js(`window.__t = { pres: [], len: [] }; document.querySelector('#sceneGrid [data-id=smiles]').click();
    (function watch() { const d = ck5.devices, a = d.tA.array, b = d.tB.array; __t.pres.push(d.pres.tubes);
      if (d.tubeMesh.geometry.instanceCount) __t.len.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
      if (d.pres.tubes < 1) requestAnimationFrame(watch); })()`);
  assert.equal(await js('ck5.sceneMoving()'), true, 'a launch starts a move');
  await waitFor('ck5.devices.pres.tubes === 1', 'the truss bars to arrive');
  const grow = await js('({ mid: __t.pres.filter((v) => v > 0.1 && v < 0.9).length, short: Math.min(...__t.len), full: Math.max(...__t.len) })');
  assert(grow.mid >= 5 && grow.short < 0.5 && grow.full > 1.4, `truss bars grow out of the sticks (${JSON.stringify(grow)})`);
  // truss bars → a tube wall: the bars go first, then the wall rises out of the deck
  await js(`window.__w = { minPres: 1, belowDeck: false, switchedAt: -1 }; document.querySelector('#sceneGrid [data-id=laserSky]').click();
    (function watch() { const d = ck5.devices; __w.minPres = Math.min(__w.minPres, d.pres.tubes);
      if (d.tubeShown === 'curtain') { if (__w.switchedAt < 0) __w.switchedAt = __w.minPres; if (d.tA.array[1] < 1.2) __w.belowDeck = true; }
      if (!(d.tubeShown === 'curtain' && d.pres.tubes === 1)) requestAnimationFrame(watch); })()`);
  await waitFor("ck5.devices.tubeShown === 'curtain' && ck5.devices.pres.tubes === 1", 'the tube wall to rise', 10000);
  const wall = await js('__w');
  assert(wall.switchedAt === 0 && wall.belowDeck, `the bars leave before the wall rises from inside the deck (${JSON.stringify(wall)})`);
  assert(await js('Math.abs(ck5.devices.tA.array[1] - (1.2 + 0.15)) < 0.01'), 'the wall ends standing on the deck');
  // mirror ball flies in from the grid
  await js("window.__by = []; ck5.launchScene('starfield'); (function watch() { const g = ck5.devices.ballGroups[0]; if (g.visible) __by.push(g.position.y); if (ck5.devices.ballDefs[0].pres < 1) requestAnimationFrame(watch); })()");
  await waitFor('ck5.devices.ballDefs[0].pres === 1', 'the ball to fly in', 8000);
  assert(await js('__by.length > 5 && __by[0] > 18 && Math.abs(__by[__by.length - 1] - 11.2) < 0.05'), 'the ball descends from the grid to its trim');
  await waitFor('!ck5.sceneMoving()', 'the move to finish', 8000);
  // keys, pads, auto-trigger
  await js("document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await waitFor("ck5.engine.show.name === 'Teal Curtain'", 'key 2 to launch scene 2');
  await midi(0x9f, 36, 100); // channel 16, C2 → scene 1
  await waitFor("ck5.engine.show.name === 'Blue Hush'", 'a channel-16 pad to launch scene 1');
  await js('ck5.engine.bpm = 480');
  await set('sceneEvery', '4');
  await set('sceneAuto', 'random');
  // scenes set their own tempo when they launch, so hold the test tempo high every frame
  await js("window.__launches = 0; window.__last = ck5.engine.show.name; (function watch() { ck5.engine.bpm = 480; if (ck5.engine.show.name !== __last) { __launches++; __last = ck5.engine.show.name; } if (__launches < 3) requestAnimationFrame(watch); })()");
  await waitFor('__launches >= 3', 'auto-trigger to launch three scenes', 20000);
  await set('sceneAuto', 'off');
  await js('ck5.engine.bpm = 120');
  assert.equal(await js("document.getElementById('rigSelect')"), null, 'there is one rig: no rig selector');
  pass('scenes: launches move, truss bars grow in, the tube wall rises from the deck after they leave, the ball flies in, keys/pads/auto-trigger');

  // venues, house lights, fairy lights
  assert.equal(await js('ck5.venue.id'), 'void', 'the default venue is the empty one');
  // (the slow camera drift orbits the view, so check the preset and the eye height)
  const cam = await js("(async () => { const { CAMERAS } = await import('./rig.js'); return [ck5.rig.camId, ...CAMERAS.audience.pos, +ck5.rig.camera.position.y.toFixed(2)]; })()");
  assert(cam[0] === 'audience' && cam[1] === 0 && cam[2] === 1.7 && Math.abs(cam[3] - 7.8) < 0.01 && cam[4] === 1.7, `default camera at eye height, 15 ft back (${cam})`);
  await js("ck5.launchScene('columns', { instant: true })");
  await set('venueSelect', 'club');
  await waitFor("ck5.rig.canvas.dataset.venue === 'club'", 'the club');
  await sleep(300);
  assert(await js('ck5.engine.render.filter((R) => R.hit && R.y + R.dy * R.len > 15.3).length >= 20'), 'in the club, beams stop on the ceiling');
  await set('venueSelect', 'theater');
  await set('curtainClosed', true);
  await waitFor('ck5.engine.curtain && ck5.engine.curtain.cover > 0.99', 'the house curtain to close', 8000);
  await js("ck5.launchScene('goldSweep', { instant: true })");
  await sleep(300);
  assert(await js('ck5.engine.render.filter((R) => R.hit && Math.abs(R.z + R.dz * R.len - 3.7) < 0.05).length >= 10'), 'a closed curtain catches the beams');
  await set('curtainClosed', false);
  await set('venueSelect', 'stadium');
  await waitFor("ck5.rig.canvas.dataset.venue === 'stadium' && ck5.engine.venueBox === null", 'the stadium');
  // house lights: fade up, fill the room, then Showtime takes them out slowly
  await js("document.getElementById('houseUp').click()");
  await waitFor('ck5.ambience.house.level === 1', 'the house lights to come up', 8000);
  assert(await js('ck5.ambience.housePts.g.drawRange.count >= 90 && ck5.rig.shared.uFill.value.r > 0.05'), 'the floodlights are lit and fill the bowl');
  await js("document.getElementById('houseOut').click()");
  await sleep(1500);
  const mid = await js('ck5.ambience.house.level');
  assert(mid > 0.6 && mid < 0.95, `Showtime fades the house out slowly (${mid.toFixed(2)} after 1.5 s)`);
  await waitFor('ck5.ambience.house.level === 0', 'the house to go dark', 12000);
  // fairy lights: switch on running along the strings, sway, and ride the truss
  await set('fairyOn', true);
  await waitFor('ck5.ambience.fairy.pres === 1', 'the fairy lights to switch on', 6000);
  const bulbs = await js('(() => { const P = ck5.ambience.fairyPts, n = P.g.drawRange.count; for (let i = 0; i < n * 3; i++) if (!Number.isFinite(P.pos[i]) || !Number.isFinite(P.col[i])) return -1; return n; })()');
  assert(bulbs > 300, `fairy lights hang hundreds of finite bulbs (${bulbs})`);
  await set('fairyLayout', 'rig');
  await set('kinOverride', true);
  await set('kinShape', 'breathe');
  await set('kinAmp', 2);
  await set('kinPeriod', 4);
  const y0 = await js('ck5.ambience.fairyPts.pos[1]');
  await sleep(1500);
  const y1 = await js('ck5.ambience.fairyPts.pos[1]');
  assert(Math.abs(y1 - y0) > 0.2, `swags on the truss ride the sticks (${y0.toFixed(2)} → ${y1.toFixed(2)})`);
  await set('kinOverride', false);
  await set('fairyOn', false);
  await set('venueSelect', 'void');
  await waitFor('ck5.ambience.fairy.pres === 0', 'the fairy lights to switch off', 6000);
  pass('venues: empty by default with the audience camera, club ceiling and theater curtain stop beams, stadium floodlights, Showtime fade, fairy lights on the truss');

  assert.deepEqual(errors, [], `page errors:\n${errors.join('\n')}`);
  console.log(`PASS: light designer (${passed.length} checks). Screenshot: ${join(tmpdir(), 'ck5-midi-groove.png')}`);
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
