// lightDesigner-scene-thumbs.mjs — render the light designer's scene launcher thumbnails.
//
// Serve the repository (default http://localhost:8124), then run:
//   node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs            # every scene
//   node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs portal dome # just these
//
// Each scene is cut to instantly (hardware settled on its marks), left to run for
// a moment, then captured at 480×300 and saved as docs/graphics/lightDesigner/scenes/<id>.webp.
// Drives installed Google Chrome over the DevTools protocol (no npm deps).
// Override CHROME_PATH, GRAPHICS_TEST_URL, CHROME_GL or THUMB_WAIT_MS if needed.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'lightDesigner', 'scenes');
const BASE = (process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const GL = process.env.CHROME_GL || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const WAIT = Number(process.env.THUMB_WAIT_MS || 2600);
const W = 960, H = 600, SCALE = 0.5;
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'lightDesigner-scene-thumbs-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  '--hide-scrollbars', '--mute-audio', '--no-first-run', `--use-angle=${GL}`,
  ...(GL === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist']), 'about:blank',
], { stdio: 'ignore' });

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
  if (!ws) await sleep(200);
}
if (!ws) throw new Error('Chrome DevTools endpoint did not come up');
const sock = new WebSocket(ws);
let seq = 0;
const pending = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
await new Promise((r) => { sock.onopen = r; });
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); sock.send(JSON.stringify({ id, method, params })); });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}lightDesigner/index.html?standalone=1` });
  for (let i = 0; i < 100 && !(await js('!!(window.ck5 && ck5.launchScene)')); i++) await sleep(200);
  await js("localStorage.clear(); document.body.classList.add('hide-panel'); document.getElementById('driftToggle').click()");
  const all = await js('(async () => (await import("./scenes.js")).SCENES.map((s) => ({ id: s.id, cam: s.thumbCam || "foh" })))()');
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : all.map((s) => s.id);
  for (const id of ids) {
    const cam = all.find((s) => s.id === id)?.cam || 'foh';
    await js(`ck5.launchScene(${JSON.stringify(id)}, { instant: true }); ck5.rig.setCamera(${JSON.stringify(cam)}, 0)`);
    await sleep(WAIT);
    const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 72, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
    const buf = Buffer.from(data, 'base64');
    writeFileSync(join(OUT, `${id}.webp`), buf);
    console.log(`${id.padEnd(14)} ${(buf.length / 1024).toFixed(1)} KB`);
  }
} finally {
  sock.close();
  chrome.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still closing */ }
}
