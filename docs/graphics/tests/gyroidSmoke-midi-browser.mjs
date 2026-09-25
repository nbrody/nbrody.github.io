// Serve the repository on port 8124. PLAYWRIGHT_MODULE / CHROME_PATH override local tools.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMidiFile } from '../gyroidSmoke/midi-file.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.GRAPHICS_TEST_URL || 'http://127.0.0.1:8124/docs/graphics/';
const errors = [];
function instrument({ mode }) {
  const test = window.midiTest = { requests: [], contexts: [], oscillators: 0, uniforms: {}, glErrors: [], capture: true, hash: 0, pixels: null };
  class Port extends EventTarget {
    constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; }
    close() { return Promise.resolve(); }
    send(data) { const event = new Event('midimessage'); event.data = new Uint8Array(data); this.dispatchEvent(event); }
  }
  const a = new Port('keyboard-a', 'Test Keyboard A'), b = new Port('keyboard-b', 'Test Keyboard B');
  const access = new EventTarget();
  access.inputs = new Map([[a.id, a], [b.id, b]]);
  test.ports = { a, b };
  test.hotplug = (id, state) => { test.ports[id].state = state; access.dispatchEvent(new Event('statechange')); };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: mode === 'unsupported' ? undefined : async options => {
    test.requests.push(options);
    if (mode === 'denied') throw new DOMException('Test permission denied', 'NotAllowedError');
    return access;
  } });
  const Audio = window.AudioContext;
  if (Audio) {
    window.AudioContext = class extends Audio {
      constructor(options) { super(options); test.contexts.push(this); }
      createOscillator() { test.oscillators++; return super.createOscillator(); }
    };
  }
  const p = WebGL2RenderingContext.prototype, locations = new WeakMap();
  const framebuffers = new Set();
  const createFramebuffer = p.createFramebuffer, deleteFramebuffer = p.deleteFramebuffer;
  p.createFramebuffer = function () { const result = createFramebuffer.call(this); framebuffers.add(result); return result; };
  p.deleteFramebuffer = function (buffer) { framebuffers.delete(buffer); return deleteFramebuffer.call(this, buffer); };
  test.feedback = () => {
    const gl = test.gl, before = gl.getParameter(gl.FRAMEBUFFER_BINDING), result = [];
    const half = value => {
      const exponent = (value >>> 10) & 31, mantissa = value & 1023;
      return (value & 0x8000 ? -1 : 1) * (exponent ? (1 + mantissa / 1024) * 2 ** (exponent - 15) : mantissa * 2 ** -24);
    };
    try {
      for (const framebuffer of framebuffers) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
        const data = type === gl.FLOAT ? new Float32Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
          : type === gl.HALF_FLOAT ? new Uint16Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4)
          : new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, type, data);
        let rgbSum = 0, alphaSum = 0;
        for (let i = 0; i < data.length; i++) {
          const value = type === gl.HALF_FLOAT ? half(data[i]) : type === gl.UNSIGNED_BYTE ? data[i] / 255 : data[i];
          if (i % 4 === 3) alphaSum += value; else rgbSum += value;
        }
        result.push({ rgbSum, alphaSum });
      }
    } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, before); }
    const error = gl.getError(); if (error) test.glErrors.push(error);
    return result;
  };
  const getLocation = p.getUniformLocation, uniform = p.uniform1f, draw = p.drawArrays;
  p.getUniformLocation = function (program, name) { const result = getLocation.call(this, program, name); if (result) locations.set(result, name); return result; };
  p.uniform1f = function (location, value) { if (location) test.uniforms[locations.get(location)] = value; return uniform.call(this, location, value); };
  p.drawArrays = function (...args) {
    draw.apply(this, args);
    test.gl = this;
    if (this.getParameter(this.FRAMEBUFFER_BINDING)) return;
    const error = this.getError(); if (error) test.glErrors.push(error);
    if (!test.capture) return;
    test.capture = false;
    const pixels = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
    this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, pixels);
    let hash = 2166136261, sum = 0, lit = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ pixels[i + channel], 16777619) >>> 0;
      sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 3) lit++;
    }
    test.hash = hash;
    test.pixels = { hash, sum, coverage: lit / (pixels.length / 4) };
  };
}
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
}
async function create(mode = 'connected') {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' });
  await context.addInitScript(instrument, { mode });
  const page = await context.newPage(); watch(page);
  await page.goto(`${base}gyroidSmoke/index.html?standalone`);
  await page.locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
  await page.locator('#quality').selectOption('low');
  return { context, page };
}
async function send(page, data, port = 'a') {
  await page.evaluate(({ data, port }) => window.midiTest.ports[port].send(data), { data, port });
}
async function notes(page, count) {
  await page.waitForFunction(count => Number(document.querySelector('canvas').dataset.midiNotes) === count, count);
}
async function value(page, key) { return page.evaluate(key => window.midiTest.uniforms[key], key); }
async function sample(page) {
  await page.evaluate(() => {
    window.midiTest.capture = true;
    document.getElementById('relief').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => !window.midiTest.capture);
  return page.evaluate(() => window.midiTest.pixels);
}
async function setControl(page, id, value) {
  await page.evaluate(({ id, value }) => {
    const node = document.getElementById(id);
    if (node.type === 'checkbox') node.checked = value; else node.value = String(value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
}
async function advance(page, steps) {
  const frame = Number(await page.locator('canvas').getAttribute('data-frame'));
  await setControl(page, 'animate', true);
  await page.waitForFunction(target => Number(document.querySelector('canvas').dataset.frame) >= target, frame + steps);
  await setControl(page, 'animate', false);
}
async function expectEmpty(page) {
  assert.equal((await sample(page)).sum, 0, 'MIDI field is exactly black');
  const feedback = await page.evaluate(() => window.midiTest.feedback());
  assert.equal(feedback.length, 2, 'Both feedback buffers are inspected');
  for (const buffer of feedback) {
    assert.equal(buffer.rgbSum, 0, 'Feedback buffer contains no residual pigment');
    assert.equal(buffer.alphaSum, 0, 'Feedback buffer contains no residual smoke coverage');
  }
}

try {
  const { context, page } = await create();
  assert.equal(await page.evaluate(() => window.midiTest.requests.length), 0, 'MIDI permission is never requested before a user action');
  assert.equal(await page.locator('#midiEnabled').isChecked(), true);
  await expectEmpty(page);
  await advance(page, 30);
  await expectEmpty(page);
  await setControl(page, 'midiEnabled', false);
  assert((await sample(page)).coverage > 0.95, 'Disabling MIDI restores the full original palette');
  await setControl(page, 'midiEnabled', true);
  assert.equal(await page.locator('#animate').isChecked(), false);
  await expectEmpty(page);
  await setControl(page, 'midiEnabled', false);
  assert((await sample(page)).coverage > 0.95);
  let demoFetches = 0;
  page.on('request', request => { if (request.url().endsWith('/demo/gyroid-smoke-demo.mid')) demoFetches++; });
  await page.evaluate(() => { window.midiTest.capture = true; });
  await page.locator('#midiPlay').click();
  await page.waitForFunction(() => document.querySelector('canvas').dataset.midiDemo === 'true' && Number(document.querySelector('canvas').dataset.midiEnergy) > 0);
  assert.equal(await page.locator('#midiEnabled').isChecked(), true, 'Demo enters MIDI mode programmatically');
  assert((await page.evaluate(() => window.midiTest.pixels.coverage)) < 0.8, 'Demo entry clears the previous full-palette field');
  await page.waitForTimeout(1000);
  assert.equal(demoFetches, 1, 'Demo is fetched from the real MIDI file');
  assert(await page.locator('#animate').isChecked(), 'Demo enables animation');
  assert(await page.evaluate(() => window.midiTest.contexts[0]?.state === 'running' && window.midiTest.oscillators > 0), 'A real AudioContext plays synthesizer voices');
  assert.match(await page.locator('#midiStatus').inputValue(), /Demo /);
  await page.locator('#midiStop').click();
  await page.waitForFunction(() => document.querySelector('canvas').dataset.midiDemo === 'false' && document.querySelector('canvas').dataset.midiEnergy === '0.0000');
  await notes(page, 0);
  await advance(page, 20);
  assert((await sample(page)).coverage > 0.005, 'Stopping the demo leaves its smoke in the field');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#midiDownload').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'gyroid-smoke-demo.mid');
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'MThd');
  const demo = parseMidiFile(bytes);
  assert(demo.events.length > 20 && demo.duration > 5, 'Downloaded demo is a meaningful MIDI score');
  await page.locator('#midiSound').uncheck();
  await page.locator('#animate').uncheck();
  await page.locator('#midiConnect').click();
  await page.locator('#midiConnect').click();
  assert.deepEqual(await page.evaluate(() => window.midiTest.requests), [{ sysex: false }], 'Repeated Connect does not request another permission');
  assert.equal(await page.locator('#midiInput option').count(), 3);
  assert.match(await page.locator('#midiStatus').inputValue(), /Listening to 2 MIDI inputs/);
  await page.evaluate(() => { window.midiTest.capture = true; document.querySelector('#restart').click(); });
  const initialHash = await page.evaluate(() => window.midiTest.hash);
  await page.evaluate(() => { window.midiTest.capture = true; });
  await send(page, [0x90, 60, 115]);
  await notes(page, 1);
  await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.midiEnergy) > 0.1);
  assert.equal((await sample(page)).hash, initialHash, 'A paused empty field waits for simulation before injecting notes');
  await advance(page, 12);
  const firstPlume = await sample(page);
  assert(firstPlume.sum > 0 && firstPlume.coverage < 0.8, 'A note paints a localized plume into the empty rectangle');
  await send(page, [0x90, 48, 110]);
  await send(page, [0x90, 76, 120]);
  await advance(page, 24);
  const manyPlumes = await sample(page);
  assert(manyPlumes.coverage > firstPlume.coverage, 'More notes gradually fill a larger area');
  await send(page, [0x80, 48, 0]);
  await send(page, [0x80, 76, 0]);
  await page.waitForFunction(() => document.querySelector('#midiActivity').value.includes('C4'));
  await send(page, [0xb0, 64, 127]);
  await send(page, [0x80, 60, 0]);
  await page.waitForTimeout(100);
  await notes(page, 1);
  await send(page, [0xb0, 64, 0]);
  await notes(page, 0);
  await send(page, [0x90, 64, 100]); await notes(page, 1);
  await send(page, [0x90, 64, 0]); await notes(page, 0);
  await page.locator('#midiPanic').click();
  await page.waitForFunction(() => document.querySelector('canvas').dataset.midiEnergy === '0.0000');
  await advance(page, 40);
  assert((await sample(page)).coverage > 0.005, 'All notes off stops emission while accumulated smoke persists');
  await page.locator('#restart').click();
  await expectEmpty(page);
  await advance(page, 4);
  await expectEmpty(page);
  await send(page, [0xe0, 127, 127]);
  await page.waitForFunction(() => Math.abs(window.midiTest.uniforms.uLightAngle - Math.PI * 0.75) < 0.001);
  await send(page, [0xe0, 0, 64]);
  await page.waitForFunction(() => window.midiTest.uniforms.uLightAngle === 0);
  await page.locator('#animate').check();
  await send(page, [0xb0, 1, 127]);
  await page.waitForFunction(() => window.midiTest.uniforms.uCurl > 2.7);
  assert(Math.abs(await value(page, 'uCurl') - 2.8) < 0.01, 'Mod wheel reaches the curl field');
  await page.locator('#animate').uncheck();
  await page.locator('#midiPanic').click();
  await page.locator('#midiInput').selectOption('keyboard-a');
  await send(page, [0x90, 65, 100], 'b');
  await page.waitForTimeout(100); await notes(page, 0);
  await send(page, [0x90, 67, 100]); await notes(page, 1);
  await page.evaluate(() => window.midiTest.hotplug('a', 'disconnected'));
  await notes(page, 0);
  await page.waitForFunction(() => document.querySelector('canvas').dataset.midiEnergy === '0.0000');
  assert.equal(await page.locator('#midiInput').inputValue(), 'all');
  await page.evaluate(() => window.midiTest.hotplug('a', 'connected'));
  await send(page, [0x90, 69, 100]); await notes(page, 1);
  await page.locator('#midiDisconnect').click(); await notes(page, 0);
  await send(page, [0x90, 72, 100]);
  await page.waitForTimeout(100); await notes(page, 0);
  assert.deepEqual(await page.evaluate(() => window.midiTest.glErrors), []);
  await page.clock.install();
  await page.locator('#midiLoop').uncheck();
  await page.locator('#midiPlay').click();
  await page.clock.fastForward(100);
  await page.clock.fastForward(Math.ceil((demo.duration + 1) * 1000));
  await page.waitForFunction(() => document.querySelector('canvas').dataset.midiDemo === 'false');
  await notes(page, 0);
  await page.locator('#midiLoop').check();
  await page.locator('#midiPlay').click();
  await page.clock.fastForward(100);
  await page.clock.fastForward(Math.ceil((demo.duration + 1) * 1000));
  await page.waitForFunction(() => document.querySelector('canvas').dataset.midiDemo === 'true');
  assert.match(await page.locator('#midiStatus').inputValue(), /Demo 0\.0/);
  await context.close();
  console.log('PASS: real MIDI demo/audio/download/end/loop, live notes/pedal/velocity-zero, bend/modulation, selection and hotplug cleanup.');

  for (const mode of ['denied', 'unsupported']) {
    const { context, page } = await create(mode);
    await page.locator('#midiSound').uncheck();
    await page.locator('#midiConnect').click();
    assert.match(await page.locator('#midiStatus').inputValue(), mode === 'denied' ? /access denied/ : /unavailable/);
    await page.locator('#midiPlay').click();
    await page.waitForFunction(() => document.querySelector('canvas').dataset.midiDemo === 'true' && Number(document.querySelector('canvas').dataset.midiNotes) > 0);
    await context.close();
  }
  console.log('PASS: denied/unsupported live MIDI leaves demo usable.');

  const stageContext = await browser.newContext({ viewport: { width: 900, height: 640 }, reducedMotion: 'reduce' });
  await stageContext.addInitScript(instrument, { mode: 'connected' });
  const stage = await stageContext.newPage(); watch(stage);
  await stage.goto(`${base}stage.html?viz=gyroidSmoke`);
  await stage.frameLocator('#viz').locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
  await stage.getByRole('tab', { name: /^Advanced/ }).click();
  await stage.locator('#controls .cv-group > summary').filter({ hasText: /^MIDI$/ }).evaluate(s => { s.parentElement.open = true; });
  const mirror = stage.getByRole('textbox', { name: 'MIDI status', exact: true });
  assert.equal(await mirror.getAttribute('readonly'), '');
  await stage.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await stage.waitForFunction(() => [...document.querySelectorAll('#controls input[readonly]')].some(node => node.value.includes('Listening to 2 MIDI inputs')));
  const frame = stage.frames().find(frame => frame.url().includes('/gyroidSmoke/'));
  await send(frame, [0x90, 60, 100]);
  await stage.waitForFunction(() => [...document.querySelectorAll('#controls input[readonly]')].some(node => node.value.includes('C4')));
  const readonly = await stage.evaluate(async () => {
    const { captureState, applyPayload } = await import('./app/introspect.js');
    const frame = document.querySelector('#viz');
    const before = frame.contentDocument.querySelector('#midiStatus').value;
    const snapshot = captureState(frame);
    const missing = applyPayload(frame, { '#midiStatus': 'Overwrite status', '#midiActivity': 'Overwrite activity' });
    return { snapshot, missing, before, after: frame.contentDocument.querySelector('#midiStatus').value };
  });
  assert(!('#midiStatus' in readonly.snapshot) && !('#midiActivity' in readonly.snapshot), 'Readouts are omitted from preset snapshots');
  assert('#midiStrength' in readonly.snapshot, 'Editable MIDI settings remain in snapshots');
  assert.deepEqual(readonly.missing, ['#midiStatus', '#midiActivity']);
  assert.equal(readonly.before, readonly.after, 'Payloads cannot overwrite read-only status');
  assert.deepEqual(errors, []);
  await stageContext.close();
  console.log('PASS: stage mirrors read-only MIDI connection and activity status.');
} finally { await browser.close(); }
