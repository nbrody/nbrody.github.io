// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/graphics/tests/studio.mjs
// Serve the repository on port 8124 first (or set GRAPHICS_TEST_URL).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const stage = await context.newPage();
const remote = await context.newPage();
const errors = [];
for (const page of [stage, remote]) page.on('pageerror', e => errors.push(e.message));
const base = process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/';
try {
  await stage.goto(`${base}donutSpiral/index.html`);
  await stage.waitForURL('**/stage.html?**');
  await stage.locator('#simpleControls [data-sel]').first().waitFor();
  assert(await stage.locator('body').evaluate(n => n.classList.contains('sidebar-open')));
  assert.equal(await stage.locator('#panelTabs [aria-selected=true]').textContent(), 'Simple', 'stage panel opens on Simple');
  const room = new URL(stage.url()).searchParams.get('room');
  await remote.goto(`${base}remote.html?room=${room}`);
  await remote.locator('#simpleControls [data-sel]').first().waitFor();
  await stage.waitForFunction(() => document.body.classList.contains('presentation'));
  const frame = stage.frames().find(f => f !== stage.mainFrame());
  assert.equal(await frame.locator('#controls').evaluate(n => getComputedStyle(n).display), 'none');
  // Simple is the default page: curated fill-bar sliders drive the visualization.
  assert.equal(await remote.locator('#tabs [aria-selected=true]').textContent(), 'Simple');
  const spokes = remote.getByRole('slider', { name: 'Spokes', exact: true });
  await spokes.focus();
  await remote.keyboard.press('End');
  await stage.waitForFunction(() => document.querySelector('#viz').contentDocument.querySelector('#spokesSlider').value === '64');
  const box = await spokes.boundingBox();
  await remote.mouse.click(box.x + 2, box.y + box.height / 2);
  await stage.waitForFunction(() => document.querySelector('#viz').contentDocument.querySelector('#spokesSlider').value === '6');
  await remote.keyboard.press('Home');
  // "All N controls" pages over to Advanced, where every control is grouped into cards.
  await remote.getByRole('button', { name: /^All \d+ controls/ }).click();
  await remote.waitForFunction(() => document.querySelector('#tabs [aria-selected=true]').textContent.startsWith('Advanced'));
  await remote.getByRole('searchbox', { name: 'Filter controls' }).fill('ring');
  assert.equal(await remote.locator('#controls [data-sel]:visible').count(), 1);
  await remote.getByRole('searchbox', { name: 'Filter controls' }).fill('');
  // Swiping the page strip moves the tabs along; only the visible page is live.
  await remote.locator('#pager').evaluate(n => {
    n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); // a finger lands on the strip
    n.scrollTo({ left: n.clientWidth * 3, behavior: 'instant' });
  });
  await remote.waitForFunction(() => document.querySelector('#tabs [aria-selected=true]').textContent === 'Connect');
  assert.deepEqual(await remote.locator('#pager > .page').evaluateAll(pages => pages.map(p => p.inert)), [true, true, true, false]);
  await remote.getByRole('tab', { name: 'Playlist' }).click();
  const control = await frame.locator('input[type=range]').first().evaluate(n => ({ id: n.id, value: Number(n.min) + (Number(n.max) - Number(n.min)) / 3 }));
  await remote.getByRole('textbox', { name: 'Current visualization JSON payload', exact: true }).fill(JSON.stringify({ [`#${control.id}`]: control.value }));
  await remote.getByRole('button', { name: 'Apply payload', exact: true }).click();
  await remote.getByRole('status').filter({ hasText: 'Payload applied.' }).waitFor();
  const actualValue = await frame.locator(`#${control.id}`).inputValue();
  assert(Math.abs(Number(actualValue) - control.value) < 1);
  await remote.getByRole('button', { name: 'Capture current view', exact: true }).click();
  await remote.getByRole('status').filter({ hasText: 'Current parameters captured' }).waitFor();
  await remote.getByRole('button', { name: 'Use display queue', exact: true }).click();
  await remote.getByRole('textbox', { name: 'Playlist name', exact: true }).fill('Regression playlist');
  await remote.getByRole('combobox', { name: 'Visualization to add' }).selectOption('penrose');
  await remote.getByRole('button', { name: 'Add visualization', exact: true }).click();
  await remote.getByRole('button', { name: 'Save playlist', exact: true }).click();
  const stored = await remote.evaluate(() => JSON.parse(localStorage.getItem('graphics.playlists.v1'))[0]);
  assert.equal(stored.items.length, 2);
  assert.equal(String(stored.items[0].payload[`#${control.id}`]), actualValue);
  await remote.getByRole('button', { name: 'Play on display', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#count').textContent === '1 / 2');
  await stage.frameLocator('#viz').locator(`#${control.id}`).waitFor({ state: 'attached' });
  await stage.waitForFunction(({ id, value }) => document.querySelector('#viz').contentDocument.querySelector(`#${id}`)?.value === value, { id: control.id, value: actualValue });
  await remote.getByRole('button', { name: 'Random next', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#dockTitle').textContent === 'Penrose Tiling');
  await stage.frameLocator('#viz').locator('#tiling').waitFor();
  await stage.waitForFunction(() => document.querySelector('#viz').contentDocument.querySelector('#stage')?.getBoundingClientRect().width === innerWidth);
  const rect = await stage.frameLocator('#viz').locator('#stage').boundingBox();
  assert.equal(rect.width, 1280);
  assert.equal(rect.height, 900);
  await remote.reload();
  await remote.getByRole('tab', { name: 'Playlist' }).click();
  await remote.getByRole('combobox', { name: 'Saved playlists' }).selectOption(stored.id);
  await remote.getByRole('button', { name: 'Load saved', exact: true }).click();
  assert.equal(await remote.locator('.editor-item').count(), 2);
  await remote.getByRole('button', { name: 'Play on display', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#dockTitle').textContent === 'Donut Spiral');
  await remote.waitForTimeout(5000);
  assert(await remote.locator('#statusDot').evaluate(n => n.classList.contains('live')), 'paused display stays connected');
  // A malformed draft cannot overwrite a saved playlist.
  await remote.locator('.editor-item details').first().locator('summary').click();
  await remote.getByRole('textbox', { name: 'Payload for item 1', exact: true }).fill('{ broken');
  await remote.getByRole('button', { name: 'Save playlist', exact: true }).click();
  assert.equal(await remote.evaluate(() => JSON.parse(localStorage.getItem('graphics.playlists.v1'))[0].items.length), 2);
  await remote.getByRole('textbox', { name: 'Payload for item 1', exact: true }).fill('{}');
  // URL payloads and other rooms do not interfere with this display.
  const other = await context.newPage();
  await other.goto(`${base}stage.html?${new URLSearchParams({ viz: 'donutSpiral', payload: JSON.stringify({ '#speedSlider': 0.5 }) })}`);
  await other.waitForFunction(() => document.querySelector('#viz').contentDocument?.querySelector('#speedSlider')?.value === '0.5');
  const otherRoom = new URL(other.url()).searchParams.get('room');
  assert.notEqual(otherRoom, room);
  await remote.getByRole('button', { name: 'Random next', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#dockTitle').textContent === 'Penrose Tiling');
  assert(await other.locator('body').evaluate(n => n.classList.contains('sidebar-open')));
  assert.equal(await other.locator('#dockTitle').textContent(), 'Donut Spiral');
  await other.close();
  await remote.getByRole('button', { name: 'Shuffle queue', exact: true }).click();
  await remote.waitForTimeout(300);
  assert.equal(await stage.locator('#dockTitle').textContent(), 'Penrose Tiling');
  await remote.screenshot({ path: '/tmp/graphics-remote.png', fullPage: true });
  await stage.screenshot({ path: '/tmp/graphics-stage.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: default sidebar, Simple-first pages, curated slider control, Advanced filter, remote presentation, payload application/restoration, capture/save/load, random navigation, fullscreen layout, paused heartbeat, invalid JSON protection, URL payloads, room isolation, shuffle continuity.');
} finally { await browser.close(); }
