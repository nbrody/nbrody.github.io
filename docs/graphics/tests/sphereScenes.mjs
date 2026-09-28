// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/graphics/tests/sphereScenes.mjs
// Serve the repository on port 8124 first (or set GRAPHICS_TEST_URL). Without a GPU,
// set CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader".
import assert from 'node:assert/strict';
import { VISUALIZATIONS } from '../app/manifest.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const SCENES = VISUALIZATIONS.filter((v) => v.cat === 'sphere');
assert.equal(SCENES.length, 10);
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
try {
  // Every scene opens on its own, compiles, draws, and keeps its panel for the stage to hide.
  for (const { id, title } of SCENES) {
    await stage.goto(`${base}${id}/index.html`);
    await stage.waitForURL('**/stage.html?**');
    await stage.frameLocator('#viz').locator('#dome[data-ready=true]').waitFor({ timeout: 120000 });
    assert.equal(await stage.locator('#dockTitle').textContent(), title);
    assert.equal(await stage.locator('#count').textContent(), '1 / 1', `${id} plays alone`);
    assert.equal(await viz().locator('#controls').evaluate((n) => getComputedStyle(n).display), 'none');
    assert(await viz().locator('#yaw').count() && await viz().locator('#lightningBtn').count(), `${id} has the shared controls`);
    assert.deepEqual(errors, [], id);
  }

  // A phone remote drives a scene from its curated Simple page.
  await stage.goto(`${base}stage.html?viz=deadLiftoff`);
  await stage.frameLocator('#viz').locator('#dome[data-ready=true]').waitFor({ timeout: 120000 });
  const room = new URL(stage.url()).searchParams.get('room');
  await remote.goto(`${base}remote.html?room=${room}`);
  await remote.locator('#simpleControls [data-sel]').first().waitFor();
  await remote.getByRole('switch', { name: 'Keep rising' }).click();
  await viz().waitForFunction(() => !document.querySelector('#ascend').checked);
  const journey = remote.getByRole('slider', { name: 'Street → orbit' });
  await journey.focus();
  await remote.keyboard.press('End');
  await viz().waitForFunction(() => document.querySelector('#journey').value === '100');
  const look = remote.getByRole('slider', { name: 'Look up / down' });
  await look.focus();
  await remote.keyboard.press('Home');
  await viz().waitForFunction(() => document.querySelector('#pitch').value === '-89');
  await viz().waitForFunction(() => window.__sphere.state.view.pitch < -80);   // the view follows
  await remote.getByRole('button', { name: '⚡ Lightning', exact: true }).click();
  await viz().waitForFunction(() => window.__sphere.state.flash > 0.05);
  await remote.getByRole('button', { name: 'Pause / play (Space)' }).click();
  await viz().waitForFunction(() => window.__sphere.state.paused);
  assert.equal(await remote.locator('[data-sel="#tilt"]').count(), 0, 'tilt is the display’s own sensor');

  assert.deepEqual(errors, []);
  console.log(`sphereScenes: ok (${SCENES.length} scenes)`);
} finally {
  await browser.close();
}
