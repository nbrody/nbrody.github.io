// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/graphics/tests/deadSphere.mjs
// Serve the repository on port 8124 first (or set GRAPHICS_TEST_URL). Without a GPU,
// set CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader".
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: (process.env.CHROME_ARGS || '').split(' ').filter(Boolean),
});
const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
const stage = await context.newPage();
const remote = await context.newPage();
const errors = [];
for (const page of [stage, remote]) {
  page.on('pageerror', (e) => errors.push(e.message));
  // network-level failures (fonts behind a proxy, say) are not the visualization's
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('net::')) errors.push(m.text()); });
}
const base = process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/';
const viz = () => stage.frames().find((f) => f !== stage.mainFrame());
const sphere = (fn, arg) => viz().evaluate(fn, arg);
try {
  await stage.goto(`${base}deadSphere/index.html`);
  await stage.waitForURL('**/stage.html?**');
  await stage.frameLocator('#viz').locator('#dome[data-ready=true]').waitFor({ timeout: 120000 });
  // Every scene and the venue pass compile and link.
  await viz().waitForFunction(() => window.__sphere.compileAll().every(Boolean), null, { timeout: 180000 });
  assert.equal(await viz().locator('#controls').evaluate((n) => getComputedStyle(n).display), 'none', 'the stage hides the tool panel');

  // A phone remote in the same room drives the show through the curated Simple page.
  const room = new URL(stage.url()).searchParams.get('room');
  await remote.goto(`${base}remote.html?room=${room}`);
  await remote.locator('#simpleControls [data-sel]').first().waitFor();
  await remote.getByRole('combobox', { name: 'Scene' }).selectOption('darkStar');
  await viz().waitForFunction(() => document.querySelector('#dome').dataset.scene === 'darkStar', null, { timeout: 30000 });

  await remote.getByRole('radio', { name: 'Floor (GA)' }).click();
  await viz().waitForFunction(() => document.querySelector('#seat').value === 'floor');
  await viz().waitForFunction(() => window.__sphere.state.camPos[2] < 0, null, { timeout: 15000 });   // walked down to the floor

  const yaw = remote.getByRole('slider', { name: 'Look left / right' });
  await yaw.focus();
  await remote.keyboard.press('End');
  await viz().waitForFunction(() => document.querySelector('#yaw').value === '180');

  await remote.getByRole('button', { name: '⚡ Lightning', exact: true }).click();
  await viz().waitForFunction(() => window.__sphere.state.flash > 0.05);

  await remote.getByRole('button', { name: 'Pause / play (Space)' }).click();
  await viz().waitForFunction(() => window.__sphere.state.paused);
  const beats = await sphere(() => window.__sphere.state.beats);
  await stage.waitForTimeout(400);
  assert.equal(await sphere(() => window.__sphere.state.beats), beats, 'paused: the beat clock holds');

  await remote.getByRole('button', { name: 'Next scene', exact: true }).click();
  await viz().waitForFunction(() => window.__sphere.state.wanted === 'tieDye');
  // Keys forwarded to the display step through the setlist too.
  await stage.evaluate(() => document.querySelector('#viz').contentDocument.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true })));
  await viz().waitForFunction(() => window.__sphere.state.wanted === 'liquid');
  // The display's tilt switch is kept off the remote.
  assert.equal(await remote.locator('[data-sel="#tilt"]').count(), 0);
  assert(await remote.locator('[data-sel="#listen"]').count() > 0);

  assert.deepEqual(errors, []);
  console.log('deadSphere: ok');
} finally {
  await browser.close();
}
