// Serve the repository on port 8124; use PLAYWRIGHT_MODULE and CHROME_PATH as needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const base = process.env.GRAPHICS_TEST_URL || 'http://127.0.0.1:8124/docs/graphics/';
const errors = [];
function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
}

// Read the actual rendered canvas before the browser discards its drawing buffer.
// Inspection runs only on explicitly requested frames, never on every simulation step.
function inspectGL({ forceBytes }) {
  const prototype = WebGL2RenderingContext.prototype;
  const draw = prototype.drawArrays;
  const getExtension = prototype.getExtension;
  window.smokeTest = { sampleNext: true, sample: null, draws: 0, errors: [] };
  prototype.getExtension = function (name) {
    return forceBytes && name === 'EXT_color_buffer_float' ? null : getExtension.call(this, name);
  };
  prototype.drawArrays = function (...args) {
    draw.apply(this, args);
    if (this.getParameter(this.FRAMEBUFFER_BINDING) !== null) return;
    const test = window.smokeTest;
    test.draws++;
    const error = this.getError();
    if (error) test.errors.push(error);
    if (!test.sampleNext) return;
    test.sampleNext = false;
    const pixels = new Uint8Array(this.drawingBufferWidth * this.drawingBufferHeight * 4);
    this.readPixels(0, 0, this.drawingBufferWidth, this.drawingBufferHeight, this.RGBA, this.UNSIGNED_BYTE, pixels);
    let hash = 2166136261, sum = 0, min = 255, max = 0;
    for (let i = 0; i < pixels.length; i++) {
      hash = Math.imul(hash ^ pixels[i], 16777619) >>> 0;
      if (i % 4 !== 3) { sum += pixels[i]; min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]); }
    }
    test.sample = { hash, sum, min, max, width: this.drawingBufferWidth, height: this.drawingBufferHeight };
  };
}
async function setInput(page, id, value) {
  await page.evaluate(({ id, value }) => {
    const input = document.getElementById(id);
    if (input.type === 'checkbox') input.checked = value;
    else input.value = String(value);
    window.smokeTest.sampleNext = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
  await page.waitForFunction(() => !window.smokeTest.sampleNext);
}
async function state(page) {
  return page.evaluate(() => ({ ...document.querySelector('canvas').dataset, ...window.smokeTest.sample, draws: window.smokeTest.draws, errors: window.smokeTest.errors }));
}
async function restart(page) {
  await page.evaluate(() => { window.smokeTest.sampleNext = true; document.getElementById('restart').click(); });
  await page.waitForFunction(() => !window.smokeTest.sampleNext);
  return state(page);
}

try {
  for (const forceBytes of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 640, height: 480 }, reducedMotion: 'reduce' });
    await context.addInitScript(inspectGL, { forceBytes });
    const page = await context.newPage();
    watch(page);
    await page.goto(`${base}gyroidSmoke/index.html?standalone`);
    await page.locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('#animate').isChecked(), false, 'Reduced motion starts paused');
    assert.equal(await page.locator('#midiEnabled').isChecked(), true, 'MIDI mode is the initial mode');
    assert.equal((await state(page)).sum, 0, 'MIDI mode starts with a black rectangle');
    await setInput(page, 'midiEnabled', false);
    await setInput(page, 'quality', 'low');
    const initial = await restart(page);
    assert(initial.sum > 0 && initial.max - initial.min > 100, 'Rendered color has useful contrast');
    assert.equal(initial.frame, '1');
    assert.equal(initial.time, '0.000');
    if (forceBytes) assert.equal(initial.precision, 'byte');
    await setInput(page, 'lightAngle', 180);
    const relit = await state(page);
    assert.notEqual(relit.hash, initial.hash, 'Lighting responds while paused');
    assert.equal(relit.frame, initial.frame, 'Relighting leaves simulation untouched');
    await setInput(page, 'lightAngle', 0);
    assert.equal((await state(page)).hash, initial.hash, 'Lighting is a nondestructive presentation pass');
    await setInput(page, 'animate', true);
    await page.waitForFunction(() => Number(document.querySelector('canvas').dataset.frame) >= 15);
    await setInput(page, 'animate', false);
    const evolved = await state(page);
    assert.notEqual(evolved.hash, initial.hash, 'Feedback evolves the smoke');
    const pausedDraws = evolved.draws;
    await page.waitForTimeout(150);
    assert.equal((await state(page)).draws, pausedDraws, 'Paused simulation does not redraw unnecessarily');
    await setInput(page, 'quality', 'balanced');
    const resized = await state(page);
    assert.equal(resized.frame, evolved.frame, 'Quality change preserves simulation frame');
    assert.equal(resized.time, evolved.time, 'Quality change preserves simulation time');
    assert.notEqual(resized.width, evolved.width);
    assert(resized.sum > 0, 'Quality change preserves rendered state');
    await page.evaluate(() => { window.smokeTest.sampleNext = true; });
    await page.setViewportSize({ width: 700, height: 460 });
    await page.waitForFunction(() => !window.smokeTest.sampleNext);
    assert.equal((await state(page)).frame, evolved.frame, 'Window resize preserves simulation frame');
    assert.equal((await state(page)).time, evolved.time, 'Window resize preserves simulation time');
    await page.setViewportSize({ width: 640, height: 480 });
    await setInput(page, 'quality', 'low');
    assert.equal((await restart(page)).hash, initial.hash, 'Restart is deterministic after resizing and evolving');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#capture').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'gyroid-smoke.png');
    const png = await readFile(await download.path());
    assert(png.length > 1000, 'Capture contains image data');
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Capture is a PNG');
    await setInput(page, 'midiEnabled', true);
    assert.equal((await state(page)).sum, 0, 'Entering MIDI mode clears the original palette while paused');
    assert.deepEqual((await state(page)).errors, [], 'No WebGL errors');
    await context.close();
    console.log(`PASS: ${forceBytes ? 'RGBA8 fallback' : 'default precision'} shader, paused relighting, feedback, resize preservation, deterministic restart, PNG capture.`);
  }

  const context = await browser.newContext({ viewport: { width: 900, height: 640 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  watch(page);
  await page.goto(`${base}gyroidSmoke/index.html`);
  await page.waitForURL('**/stage.html?**');
  assert.equal(new URL(page.url()).searchParams.get('viz'), 'gyroidSmoke');
  await page.frameLocator('#viz').locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
  await page.getByRole('tab', { name: /^Advanced/ }).click();
  await page.locator('#controls .cv-group > summary').filter({ hasText: 'Playback' }).evaluate(s => { s.parentElement.open = true; });
  await page.getByRole('radiogroup', { name: 'Render quality', exact: true }).getByRole('radio', { name: 'Economy', exact: true }).click();
  await page.locator('#controls .cv-group > summary').filter({ hasText: 'Flow' }).evaluate(s => { s.parentElement.open = true; });
  await page.getByRole('slider', { name: 'Curl strength', exact: true }).waitFor();
  const frame = page.frames().find(item => item.url().includes('/gyroidSmoke/'));
  assert.equal(await frame.locator('#animate').isChecked(), false);
  const remote = await context.newPage();
  watch(remote);
  const room = new URL(page.url()).searchParams.get('room');
  assert(room, 'Stage generates a pairing room');
  await remote.goto(`${base}remote.html?room=${room}`);
  await remote.getByRole('tab', { name: /^Advanced/ }).click();
  await remote.locator('#controls .cv-group > summary').filter({ hasText: 'Playback' }).evaluate(s => { s.parentElement.open = true; });
  await remote.getByRole('radiogroup', { name: 'Render quality', exact: true }).waitFor();
  await remote.getByRole('tab', { name: 'Playlist' }).click();
  await remote.getByRole('textbox', { name: 'Current visualization JSON payload', exact: true }).fill('{"#curl":1.7,"#pulse":0.4,"#relief":0.3,"#animate":false,"#midiEnabled":false}');
  await remote.getByRole('button', { name: 'Apply payload', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#viz').contentDocument.querySelector('#curl').value === '1.7');
  assert.equal(await frame.locator('#pulse').inputValue(), '0.4');
  assert.equal(await frame.locator('#relief').inputValue(), '0.3');
  await remote.getByRole('tab', { name: 'Simple' }).click();
  await remote.getByRole('button', { name: 'Restart flow', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#viz').contentDocument.querySelector('canvas').dataset.frame === '1');
  assert.deepEqual(errors, [], 'No browser or asset loading errors');
  console.log('PASS: direct route to stage, discovered controls, reduced motion, remote payload and restart.');
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  watch(mobile);
  await mobile.goto(`${base}gyroidSmoke/index.html?standalone`);
  await mobile.locator('canvas[data-ready="true"]').waitFor({ timeout: 60000 });
  await mobile.locator('#midiEnabled').uncheck();
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page has no horizontal overflow');
  await mobile.locator('#quality').selectOption('low');
  await mobile.locator('#animate').check();
  await mobile.waitForFunction(() => Number(document.querySelector('canvas').dataset.frame) > 1);
  await mobile.locator('#animate').uncheck();
  await mobile.getByRole('button', { name: 'Restart flow', exact: true }).click();
  assert.equal(await mobile.locator('canvas').getAttribute('data-frame'), '1');
  assert.equal(await mobile.locator('#animate').isChecked(), false);
  assert.deepEqual(errors, []);
  await mobileContext.close();
  console.log('PASS: mobile viewport, visible playback controls and restart.');
} finally { await browser.close(); }
