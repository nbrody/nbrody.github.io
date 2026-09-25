// Real backend integration: two isolated browser profiles cannot use BroadcastChannel.
// Creates only a unique sessions/graphics-* room and removes it when finished.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const stage = await desktop.newPage();
const phone = await phoneContext.newPage();
const errors = [];
for (const page of [stage, phone]) page.on('pageerror', e => errors.push(e.message));
const base = process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/';
try {
  await stage.goto(`${base}stage.html?viz=donutSpiral&transport=firebase`);
  await stage.waitForFunction(() => document.querySelector('#phonePairing .pair-status').textContent === 'Phone pairing ready', { timeout: 30000 });
  const room = new URL(stage.url()).searchParams.get('room');
  await phone.goto(`${base}remote.html?room=${room}&transport=firebase`);
  await phone.locator('#simpleControls [data-sel]').first().waitFor();
  await stage.waitForFunction(() => document.body.classList.contains('presentation'));
  assert.equal(await phone.locator('#nowTitle').textContent(), 'Donut Spiral');
  // Build and transmit a queue entirely from a phone with independent localStorage.
  await phone.getByRole('tab', { name: 'Playlist' }).click();
  await phone.getByRole('button', { name: 'Use display queue', exact: true }).click();
  await phone.getByRole('combobox', { name: 'Visualization to add' }).selectOption('donutSpiral');
  await phone.getByRole('button', { name: 'Add visualization', exact: true }).click();
  await phone.getByRole('button', { name: 'Add visualization', exact: true }).click();
  await phone.locator('#playlistEditor input[type=checkbox]').nth(1).check();
  await phone.getByRole('button', { name: 'Play on display', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#count').textContent === '1 / 3');
  await phone.locator('#nextBtn').click();
  await stage.waitForFunction(() => document.querySelector('#count').textContent === '2 / 3');
  await phone.getByRole('textbox', { name: 'Current visualization JSON payload', exact: true }).fill('{"#speedSlider":0.5}');
  await phone.getByRole('button', { name: 'Apply payload', exact: true }).click();
  await stage.waitForFunction(() => document.querySelector('#viz').contentDocument?.querySelector('#speedSlider')?.value === '0.5');
  // Simultaneous local + cloud delivery must execute a navigation command once.
  const local = await desktop.newPage();
  await local.goto(`${base}remote.html?room=${room}&transport=firebase`);
  await local.locator('#simpleControls [data-sel]').first().waitFor();
  await local.waitForFunction(() => document.querySelector('#phonePairing .pair-status').textContent === 'Phone pairing ready');
  await local.locator('#nextBtn').click();
  await stage.waitForFunction(() => document.querySelector('#count').textContent === '3 / 3');
  await local.waitForTimeout(1000);
  assert.equal(await stage.locator('#count').textContent(), '3 / 3');
  // Reconnect phone without reloading the display, and get fresh controls/state.
  await phone.evaluate(() => window.firebase.app('graphics-studio').database().goOffline());
  await phone.waitForFunction(() => document.querySelector('#phonePairing .pair-status').textContent.includes('offline'));
  await phone.evaluate(() => window.firebase.app('graphics-studio').database().goOnline());
  await phone.waitForFunction(() => document.querySelector('#statusDot').classList.contains('live'));
  await phone.locator('#prevBtn').click();
  await stage.waitForFunction(() => document.querySelector('#count').textContent === '2 / 3');
  // Localhost links must never be advertised as phone-reachable QR codes.
  assert(await stage.locator('.pair-qr').evaluate(n => n.hidden));
  // A reachable site URL produces an actual session QR and share link.
  await phone.getByRole('tab', { name: 'Connect' }).click();
  await phone.getByRole('textbox', { name: 'Phone-accessible graphics URL', exact: true }).fill('https://nbrody.github.io/graphics/');
  await phone.locator('.pair-qr').waitFor({ state: 'visible' });
  assert.equal(new URL(await phone.locator('.pair-link').getAttribute('href')).searchParams.get('room'), room);
  assert.equal(await phone.locator('.pair-link').getAttribute('href'), `https://nbrody.github.io/graphics/remote.html?room=${room}&transport=firebase`);
  // SDK failures remain explicit and do not break the local display.
  const blockedContext = await browser.newContext();
  const blocked = await blockedContext.newPage();
  await blocked.route('**/firebasejs/**', route => route.abort());
  await blocked.goto(`${base}stage.html?viz=donutSpiral&transport=firebase`);
  await blocked.waitForFunction(() => document.querySelector('#phonePairing .pair-status').textContent.includes('Pairing failed'));
  await blocked.locator('#simpleControls [data-sel]').first().waitFor();
  await blockedContext.close();
  await phone.screenshot({ path: '/tmp/graphics-phone-pairing.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: real Firebase pairing across isolated browser profiles; phone playlist and payload commands; local/cloud deduplication; reconnect; localhost guidance.');
} finally {
  await stage.evaluate(async () => {
    const room = new URL(location.href).searchParams.get('room');
    const db = window.firebase?.app('graphics-studio').database();
    if (db) { await db.ref(`sessions/graphics-${room}`).remove(); db.goOffline(); }
  }).catch(() => {});
  await browser.close();
}
