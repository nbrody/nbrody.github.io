// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/graphics/tests/stage-catalog.mjs
// Serves docs/ itself, caching every file for ten minutes the way GitHub Pages does,
// so a browser can hold a stale manifest.js across a "deploy".
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
let stale = false;   // true: manifest.js is the one from before deadSphere/darkStar was published
let manifestFetches = 0;
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    let body = await readFile(file);
    if (path.endsWith('/graphics/app/manifest.js')) {
      manifestFetches++;
      if (stale) body = Buffer.from(String(body).replaceAll("'deadSphere/darkStar'", "'notPublishedYet'"));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/graphics/`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dockTitle = () => page.locator('#dockTitle').textContent();
try {
  // The browser caches the catalog from before the deploy…
  stale = true;
  await page.goto(`${base}index.html`);
  await page.waitForFunction(() => document.querySelector('#catalog .card'));
  stale = false;
  const before = manifestFetches;
  // …then follows a link to the newly published visualization.
  await page.goto(`${base}deadSphere/darkStar/index.html`);
  await page.waitForFunction(() => document.querySelector('#viz')?.getAttribute('src')?.includes('deadSphere/darkStar/index.html'));
  assert.equal(await dockTitle(), 'Dark Star', 'the stale catalog was refreshed and the new visualization plays');
  assert.equal(manifestFetches - before, 1, 'one network refetch of the catalog');
  assert(!new URL(page.url()).searchParams.has('fresh'), 'the retry marker is dropped from the address');
  assert.equal(await page.locator('#missing').count(), 0);

  // An id that really isn't in the catalog: say so, play nothing, offer ways on.
  await page.goto(`${base}stage.html?viz=noSuchViz`);
  await page.locator('#missing').waitFor();
  assert.match(await page.locator('#missing h1').textContent(), /noSuchViz/);
  assert.equal(await page.locator('#viz').getAttribute('src'), null, 'nothing else starts playing');
  assert.equal(await dockTitle(), '—');
  assert.equal(await page.getByRole('link', { name: 'Try opening it on its own' }).getAttribute('href'), 'noSuchViz/index.html?standalone=1');
  assert(!new URL(page.url()).searchParams.has('fresh'));
  await page.getByRole('button', { name: 'Play all visualizations' }).click();
  await page.waitForFunction(() => document.querySelector('#viz')?.getAttribute('src'));
  assert.equal(await page.locator('#missing').count(), 0);
  assert.notEqual(await dockTitle(), '—');

  assert.deepEqual(errors, []);
  console.log('stage-catalog: ok');
} finally {
  await browser.close();
  server.close();
}
