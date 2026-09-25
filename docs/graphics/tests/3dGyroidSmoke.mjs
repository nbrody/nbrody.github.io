// Serve the repository on port 8124. Override PLAYWRIGHT_MODULE, CHROME_PATH or GRAPHICS_TEST_URL as needed.
import assert from 'node:assert/strict';
import { noteSource, cameraPosition, DEFAULT_CAMERA } from '../3dGyroidSmoke/scene.js';

const sources = Array.from({ length: 49 }, (_, i) => noteSource({ note: i + 36, channel: 0, level: 0.8, velocity: 0.9 }));
for (let i = 0; i < sources.length; i++) {
  const source = sources[i];
  assert.deepEqual(source, noteSource({ note: i + 36, channel: 0, level: 0.8, velocity: 0.9 }));
  assert(source.position.every(value => value > 0 && value < 1), 'Emission stays inside the 3D room');
  assert(source.color.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  assert(source.strength > 0);
  const softer = noteSource({ note: i + 36, channel: 0, level: 0.4, velocity: 0.3 });
  assert.deepEqual(softer.position, source.position, 'Repeated pitch keeps its spatial origin across playing dynamics');
  assert.deepEqual(softer.color, source.color, 'Pitch color is independent of velocity');
  assert(softer.strength < source.strength, 'Softer notes emit less smoke');
}
for (let axis = 0; axis < 3; axis++) assert(new Set(sources.map(source => source.position[axis].toFixed(5))).size > 40, 'Pitches occupy distinct positions on every spatial axis');
for (const note of [0, 127]) for (const channel of [0, 15]) {
  const source = noteSource({ note, channel, level: 1, velocity: 1 });
  assert(source.position.every(value => Number.isFinite(value) && value > 0 && value < 1), 'Extreme valid MIDI notes stay inside the room');
  assert(source.color.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
}
assert.equal(noteSource({ note: 60, level: 0.8, velocity: 0.9 }, 0).strength, 0);
assert.notDeepEqual(cameraPosition(DEFAULT_CAMERA), cameraPosition({ ...DEFAULT_CAMERA, yaw: DEFAULT_CAMERA.yaw + 0.5 }));

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.GRAPHICS_TEST_URL || 'http://127.0.0.1:8124/docs/graphics/';
const errors = [];
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
}
function fixtures({ noFloat = false }) {
  const test = window.roomTest = { requests: [], errors: [], sampleNext: true, hash: 0 };
  const port = new EventTarget();
  Object.assign(port, { id: 'test-keyboard', name: 'Volume Test Keyboard', state: 'connected', close: () => Promise.resolve() });
  test.send = data => { const event = new Event('midimessage'); event.data = new Uint8Array(data); port.dispatchEvent(event); };
  const access = new EventTarget(); access.inputs = new Map([[port.id, port]]);
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async options => { test.requests.push(options); return access; } });
  const proto = WebGL2RenderingContext.prototype, extension = proto.getExtension, draw = proto.drawArrays;
  proto.getExtension = function (name) { return noFloat && name === 'EXT_color_buffer_float' ? null : extension.call(this, name); };
  proto.drawArrays = function (...args) {
    draw.apply(this, args);
    if (this.getParameter(this.FRAMEBUFFER_BINDING)) return;
    const error = this.getError(); if (error) test.errors.push(error);
    if (!test.sampleNext) return;
    test.sampleNext = false;
    const pixels = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
    this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, pixels);
    let hash = 2166136261;
    for (const value of pixels) hash = Math.imul(hash ^ value, 16777619) >>> 0;
    test.hash = hash;
  };
}
async function volumeStats(page) {
  return page.evaluate(async () => {
    const { volume } = await import('./main.js');
    return volume.sampleStats();
  });
}
async function setInput(page, id, value) {
  await page.evaluate(({ id, value }) => {
    const input = document.getElementById(id);
    if (input.type === 'checkbox') input.checked = value;
    else input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
}
async function advance(page, steps) {
  const initial = Number(await page.locator('#roomCanvas').getAttribute('data-frame'));
  await setInput(page, 'animate', true);
  await page.waitForFunction(target => Number(document.querySelector('#roomCanvas').dataset.frame) >= target, initial + steps, { timeout: 60000 });
  await setInput(page, 'animate', false);
}
function isEmpty(stats) {
  assert.equal(stats.sumDensity, 0, 'Every voxel starts clear');
  assert.equal(stats.maxDensity, 0);
  assert.equal(stats.minDensity, 0);
  assert.equal(stats.occupiedVoxels, 0);
  assert.deepEqual(stats.pigment, [0, 0, 0], 'Empty voxels contain no residual color');
  assert.equal(stats.sampledVoxelCount, stats.voxelCount, 'Diagnostics read every voxel');
  assert(stats.voxelCount > 100000, 'Tests inspect the full 3D volume');
}

try {
  const context = await browser.newContext({ viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' });
  await context.addInitScript(fixtures, {});
  const page = await context.newPage(); watch(page);
  await page.goto(`${base}3dGyroidSmoke/index.html?standalone`);
  await page.locator('#roomCanvas[data-ready="true"]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('#animate').isChecked(), false);
  await setInput(page, 'quality', 'low');
  isEmpty(await volumeStats(page));
  await setInput(page, 'animate', true);
  await page.waitForTimeout(200);
  await setInput(page, 'animate', false);
  isEmpty(await volumeStats(page));
  assert.equal(await page.evaluate(() => window.roomTest.requests.length), 0);
  await page.locator('#midiSound').uncheck();
  await page.locator('#midiConnect').click();
  assert.deepEqual(await page.evaluate(() => window.roomTest.requests), [{ sysex: false }]);
  await page.evaluate(() => { window.roomTest.sampleNext = true; document.querySelector('#resetCamera').click(); });
  await page.waitForFunction(() => !window.roomTest.sampleNext);
  const clearHash = await page.evaluate(() => window.roomTest.hash);
  await page.evaluate(() => { window.roomTest.sampleNext = true; window.roomTest.send([0x90, 60, 120]); });
  await advance(page, 12);
  const first = await volumeStats(page);
  assert(first.sumDensity > 0 && first.maxDensity > 0 && first.occupiedVoxels > 0, 'Notes inject real 3D smoke');
  assert(first.pigment.every(value => Number.isFinite(value) && value > 0), 'Smoke stores colored pigment in the volume');
  assert(first.minDensity >= 0 && Number.isFinite(first.sumDensity));
  await page.evaluate(() => { window.roomTest.sampleNext = true; document.querySelector('#resetCamera').click(); });
  await page.waitForFunction(() => !window.roomTest.sampleNext);
  assert.notEqual(await page.evaluate(() => window.roomTest.hash), clearHash, 'Accumulated smoke changes the rendered room');
  await page.evaluate(() => { window.roomTest.send([0x90, 48, 105]); window.roomTest.send([0x90, 76, 110]); });
  await advance(page, 24);
  const accumulated = await volumeStats(page);
  assert(accumulated.sumDensity > first.sumDensity, 'Continued playing accumulates smoke mass');
  assert(accumulated.occupiedVoxels > first.occupiedVoxels, 'New notes and advection occupy more of the room');
  await page.locator('#midiPanic').click();
  await advance(page, 100);
  const lingering = await volumeStats(page);
  const retention = lingering.sumDensity / accumulated.sumDensity;
  assert(retention > 0.9 && retention < 1.1, `Unforced smoke retains its mass after at least 100 simulation steps (${(retention * 100).toFixed(2)}%)`);
  for (let channel = 0; channel < 3; channel++) {
    const colorRetention = lingering.pigment[channel] / accumulated.pigment[channel];
    assert(colorRetention > 0.9 && colorRetention < 1.1, `Pigment channel ${channel} persists without runaway accumulation`);
  }
  assert(lingering.occupiedVoxels > 0);
  assert.equal(await page.locator('#roomCanvas').getAttribute('data-midi-notes'), '0');
  const frameBefore = await page.locator('#roomCanvas').getAttribute('data-frame');
  await setInput(page, 'quality', 'high');
  assert.deepEqual(await volumeStats(page), lingering, 'Render quality preserves every stored voxel');
  await page.setViewportSize({ width: 720, height: 430 });
  await page.waitForTimeout(100);
  assert.deepEqual(await volumeStats(page), lingering, 'Window resize preserves every stored voxel');
  assert.equal(await page.locator('#roomCanvas').getAttribute('data-frame'), frameBefore);
  await setInput(page, 'quality', 'low');
  await page.evaluate(() => { window.roomTest.sampleNext = true; document.querySelector('#resetCamera').click(); });
  await page.waitForFunction(() => !window.roomTest.sampleNext);
  const viewBefore = await page.evaluate(() => window.roomTest.hash);
  await page.evaluate(() => { document.getElementById('controls').hidden = true; window.roomTest.sampleNext = true; });
  await page.mouse.move(390, 210); await page.mouse.down(); await page.mouse.move(525, 245, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(before => window.roomTest.hash !== before, viewBefore);
  assert.deepEqual(await volumeStats(page), lingering, 'Orbiting changes the view without modifying the volume');
  await page.evaluate(() => { document.getElementById('controls').hidden = false; document.querySelector('#clearRoom').click(); });
  isEmpty(await volumeStats(page));
  await setInput(page, 'animate', true);
  await page.waitForTimeout(200);
  await setInput(page, 'animate', false);
  isEmpty(await volumeStats(page));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#capture').click();
  assert.match((await downloadPromise).suggestedFilename(), /\.png$/);
  assert.deepEqual(await page.evaluate(() => window.roomTest.errors), []);
  await context.close();
  console.log(`PASS: empty 3D volume, accumulating MIDI emission, ${(retention * 100).toFixed(2)}% density retained after 100 unforced steps, persistent pigment, clear, quality/resize preservation, camera orbit and PNG capture.`);

  const stageContext = await browser.newContext({ viewport: { width: 800, height: 560 }, reducedMotion: 'reduce' });
  await stageContext.addInitScript(fixtures, {});
  const stage = await stageContext.newPage(); watch(stage);
  await stage.goto(`${base}3dGyroidSmoke/index.html`);
  await stage.waitForURL('**/stage.html?**');
  assert.equal(new URL(stage.url()).searchParams.get('viz'), '3dGyroidSmoke');
  await stage.frameLocator('#viz').locator('#roomCanvas[data-ready="true"]').waitFor({ timeout: 60000 });
  const frame = stage.frames().find(frame => frame.url().includes('/3dGyroidSmoke/'));
  await setInput(frame, 'quality', 'low'); await setInput(frame, 'midiSound', false);
  isEmpty(await volumeStats(frame));
  await stage.getByRole('tab', { name: /^Advanced/ }).click();
  await stage.locator('#controls .cv-group > summary').filter({ hasText: /^MIDI$/ }).evaluate(s => { s.parentElement.open = true; });
  await stage.getByRole('button', { name: 'Play MIDI demo', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#viz').contentDocument.querySelector('#roomCanvas').dataset.midiDemo === 'true');
  await stage.waitForFunction(() => Number(document.querySelector('#viz').contentDocument.querySelector('#roomCanvas').dataset.frame) >= 16, null, { timeout: 60000 });
  await stage.getByRole('button', { name: 'Stop MIDI demo', exact: true }).click();
  await advance(frame, 8);
  assert((await volumeStats(frame)).sumDensity > 0, 'Stopping the actual MIDI demo keeps accumulated smoke');
  await stage.locator('#controls .cv-group > summary').filter({ hasText: /^Room$/ }).evaluate(s => { s.parentElement.open = true; });
  assert.equal(await stage.getByRole('textbox', { name: 'Accumulated smoke', exact: true }).getAttribute('readonly'), '');
  await stage.getByRole('button', { name: 'Clear room', exact: true }).click();
  isEmpty(await volumeStats(frame));
  assert.deepEqual(await frame.evaluate(() => window.roomTest.errors), []);
  await stageContext.close();
  console.log('PASS: stage route, actual shared MIDI demo, persistent smoke after Stop, read-only room status and Clear room.');

  const fallback = await browser.newContext({ viewport: { width: 600, height: 400 }, reducedMotion: 'reduce' });
  await fallback.addInitScript(fixtures, { noFloat: true });
  const unsupported = await fallback.newPage();
  const uncaught = []; unsupported.on('pageerror', error => uncaught.push(error.message));
  await unsupported.goto(`${base}3dGyroidSmoke/index.html?standalone`);
  await unsupported.waitForFunction(() => /float|support|WebGL/i.test(document.querySelector('#renderStatus').textContent));
  assert.equal(await unsupported.locator('#renderStatus').isVisible(), true);
  assert.notEqual(await unsupported.locator('#roomCanvas').getAttribute('data-ready'), 'true');
  assert.deepEqual(uncaught, []);
  await fallback.close();
  assert.deepEqual(errors, []);
  console.log('PASS: unsupported floating-point rendering gives a visible, graceful error.');
} finally { await browser.close(); }
