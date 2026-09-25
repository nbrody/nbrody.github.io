// Serve the repository on port 8124. Override PLAYWRIGHT_MODULE, CHROME_PATH or GRAPHICS_TEST_URL as needed.
// The machine's physics has its own headless check: node docs/graphics/ballMachine/tests/headless.mjs 240 30
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
// Small viewport: headless Chrome renders the glasshouse in software, and every frame counts.
const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if (e.type() === 'error' && !e.text().includes('404')) errors.push(e.text()); }); // 404s are caught below, minus the favicon
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
const base = process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/';
const LOAD = { timeout: 90000 };
// Read machine state inside the visualization's frame (same origin).
const inMachine = (fn, arg) => page.evaluate(([src, a]) => (0, eval)(`(${src})`)(document.querySelector('#viz').contentWindow.__machine, a), [fn.toString(), arg]);
const waitMachine = (fn, arg) => page.waitForFunction(([src, a]) => {
  const M = document.querySelector('#viz')?.contentWindow?.__machine;
  return M && (0, eval)(`(${src})`)(M, a);
}, [fn.toString(), arg], LOAD);
try {
  // The folder link enters the stage, which starts feature to feature without the welcome card.
  await page.goto(`${base}ballMachine/`);
  await page.waitForURL('**/stage.html?viz=ballMachine**');
  await waitMachine((M) => M.state.view === 'features');
  const viz = page.frameLocator('#viz');
  for (const sel of ['#start', '#machinePanel', '#dock', '#placard', '#panelToggle']) {
    assert.equal(await viz.locator(sel).isVisible(), false, `${sel} is hidden in the stage`);
  }

  // Simple page: two ways to watch (only those two), and the route picker.
  const watch = page.locator('#simpleControls').getByRole('radiogroup', { name: 'Watch', exact: true });
  assert.deepEqual(await watch.getByRole('radio').allTextContents(), ['Follow a ball', 'Feature to feature']);
  await watch.getByRole('radio', { name: 'Feature to feature', exact: true }).click();
  await waitMachine((M) => M.state.view === 'features' && M.tour.style === 'features' && M.rig.mode === 'orbit');
  await watch.getByRole('radio', { name: 'Follow a ball', exact: true }).click();
  await waitMachine((M) => M.state.view === 'follow' && M.tour.style === 'follow' && (M.rig.mode === 'chase' || !!M.tour.waitTop));
  const route = page.locator('#simpleControls').getByRole('combobox', { name: 'Route', exact: true });
  await route.selectOption('bells');
  await waitMachine((M) => M.state.route === 'bells');
  assert(await inMachine((M) => M.machine.routes.bells.every(([ff, out]) => ff.lock === out)), 'Bell Tower locks its flip-flops');
  await route.selectOption('water');
  await waitMachine((M) => M.state.route === 'water');
  assert(await inMachine((M) => M.machine.routes.water.every(([ff, out]) => ff.lock === out) && M.machine.flipflops.F6.lock === 1), 'the water slide locks F1, F3 and F6');
  await route.selectOption('random');
  assert(await inMachine((M) => Object.values(M.machine.flipflops).every((ff) => ff.lock === null && ff.random === (ff.name !== 'F5'))),
    'coin-toss switches everywhere but the marimba lane switch');
  await route.selectOption('auto');
  assert(await inMachine((M) => Object.values(M.machine.flipflops).every((ff) => ff.lock === null && !ff.random)));

  // Pause and run.
  const running = page.locator('#simpleControls').getByRole('switch', { name: 'Running', exact: true });
  await running.click();
  await waitMachine((M) => M.state.paused);
  const t0 = await inMachine((M) => M.world.t);
  await page.waitForTimeout(600);
  assert.equal(await inMachine((M) => M.world.t), t0, 'the simulation holds while paused');
  await running.click();
  await waitMachine((M, t) => !M.state.paused && M.world.t > t, t0);

  // Advanced: the radio pickers sit in their own cards beside the rest of the panel.
  await page.getByRole('tab', { name: /^Advanced/ }).click();
  const cards = page.locator('#controls details.cv-group');
  await cards.first().waitFor();
  await cards.evaluateAll((all) => all.forEach((card) => { card.open = true; }));
  const card = (name) => cards.filter({ has: page.locator('summary', { hasText: name }) });
  assert.equal(await card('Routes').getByRole('combobox', { name: 'Route', exact: true }).count(), 1);
  assert.equal(await card('Camera').getByRole('combobox', { name: 'Camera', exact: true }).count(), 1);
  for (const name of ['Glasshouse', 'Mechanism', 'Sound']) assert.equal(await card(name).count(), 1, `${name} card`);
  await card('Camera').getByRole('combobox', { name: 'Camera', exact: true }).selectOption('orbit');
  await waitMachine((M) => M.state.view === 'orbit' && M.rig.mode === 'orbit');

  // Keys forwarded from the stage reach the machine.
  await page.locator('#viz').focus();
  await page.keyboard.press('3');
  await waitMachine((M) => M.state.view === 'ride');

  // ?standalone=1 is the full-page app: welcome card, own panel and camera dock.
  const solo = await context.newPage();
  solo.on('pageerror', e => errors.push(e.message));
  solo.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
  await solo.goto(`${base}ballMachine/?standalone=1`);
  await solo.waitForFunction(() => !!window.__machine, null, LOAD);
  assert.equal(new URL(solo.url()).pathname.endsWith('/ballMachine/'), true);
  await solo.getByRole('button', { name: 'Watch without sound' }).click();
  await solo.waitForFunction(() => window.__machine.state.view === 'tour');
  await solo.locator('#dock label.v').filter({ hasText: 'Chase' }).click();
  await solo.waitForFunction(() => window.__machine.state.view === 'chase');
  await solo.locator('#panelToggle').click();
  await solo.locator('#routes label').filter({ hasText: 'Gong Bucket' }).click();
  await solo.waitForFunction(() => window.__machine.state.route === 'gong');
  assert.equal(await solo.locator('input[name="route"][value="gong"]').isChecked(), true);

  assert.deepEqual(errors, []);
  console.log('PASS: stage entry without the welcome card, hidden machine UI, Simple "Watch" picker (follow a ball / feature to feature only), route picker (locks incl. the water slide, coin toss, auto), pause/run, grouped radio cards, forwarded keys, standalone panel and dock.');
} catch (err) {
  console.error('errors so far:', errors);
  throw err;
} finally { await browser.close(); }
