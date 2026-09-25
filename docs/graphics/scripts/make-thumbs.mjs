// make-thumbs.mjs — capture small WebP preview thumbnails for the gallery.
//
// Serve the repository (default http://localhost:8124), then run:
//   node docs/graphics/scripts/make-thumbs.mjs            # every visualization
//   node docs/graphics/scripts/make-thumbs.mjs mandelbrot # just some ids
//
// Each visualization is opened in the stage in presentation mode (its own
// UI hidden), left to animate for a few seconds, then captured at 960×600 and
// downscaled to 320×200 WebP in docs/graphics/thumbs/<id>.webp.
// Uses installed Google Chrome over the DevTools protocol — no npm deps.
// Override CHROME_PATH, GRAPHICS_TEST_URL, or THUMB_WAIT_MS if needed.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUALIZATIONS } from '../app/manifest.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'thumbs');
const BASE = (process.env.GRAPHICS_TEST_URL || 'http://localhost:8124/docs/graphics/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WAIT = Number(process.env.THUMB_WAIT_MS || 4500);
const W = 960, H = 600, SCALE = 1 / 3, QUALITY = 72;

// Per-visualization tweaks: extra settle time, a script run inside the
// visualization's frame after load, and/or mouse drags across the canvas.
const PREP = {
  fire: { drag: true },
  turingPatterns: { drag: true },
  gyroidSmoke: { wait: 9000, run: "document.querySelector('#midiPlay')?.click()" },
  '3dGyroidSmoke': { wait: 9000, run: "document.querySelector('#midiPlay')?.click()" },
  infiniteZ3lattice: { wait: 9000 },
  indrasPearls: { wait: 12000 },
  '4dKleinian': { wait: 15000, run: "kleinian.applyPreset('icosahedral-packing')" },
  newtonFractals: { run: 'applyScene(7)' },
  hatTiling: { wait: 6000, run: "(function go() { const H = window.hatTour; if (!H || !H.ready) return setTimeout(go, 200); H.captions(false); H.play(false); H.seek('grow', 9.5); })()" },
  gameOfLife: { run: "document.getElementById('captions').checked = false; gameOfLife.loadStory('kingdoms'); gameOfLife.life.setBite(0.05); gameOfLife.advance(1300); document.getElementById('playBtn').click()" },
  lightDesigner: { wait: 7000, run: "ck5.loadShow('typeII', 0); ck5.engine.seek(ck5.engine.show.sections[5].start + 30, 0)" },
  ballMachine: { wait: 12000, run: "(function go() { const M = window.__machine; if (!M) return setTimeout(go, 250); const box = document.getElementById('labels'); if (box.checked) box.click(); M.setView('orbit'); M.rig.fly = null; M.camera.position.set(6.4, 3.1, 2.2); M.rig.controls.target.set(1.9, 3.3, -1.1); M.camera.fov = M.rig.baseFov; M.camera.updateProjectionMatrix(); M.rig.controls.update(); })()" },
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : VISUALIZATIONS.map((v) => v.id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'graphics-thumbs-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

async function devtoolsTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      // Chrome chose a free port and wrote it to its own profile: only ever talk to our Chrome
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return new Promise((resolve) => { ws.onopen = () => resolve({ send, close: () => ws.close() }); });
}

// A few curved strokes across the middle of the display, for tools that are
// blank until painted into.
async function scribble(cdp) {
  const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  for (let k = 0; k < 4; k++) {
    const cy = H * (0.3 + 0.13 * k);
    await mouse('mousePressed', W * 0.2, cy);
    for (let t = 0; t <= 1; t += 0.04) {
      await mouse('mouseMoved', W * (0.2 + 0.6 * t), cy + Math.sin(t * Math.PI * 2 + k) * H * 0.08);
      await sleep(16);
    }
    await mouse('mouseReleased', W * 0.8, cy);
  }
}

try {
  const cdp = await connect(await devtoolsTarget());
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (const id of ids) {
    const url = `${BASE}stage.html?viz=${encodeURIComponent(id)}&mode=remote&room=thumbs`;
    process.stdout.write(`${id.padEnd(26)} `);
    try {
      await cdp.send('Page.navigate', { url });
      const prep = PREP[id] || {};
      await sleep(prep.run || prep.drag ? 2500 : 0);
      if (prep.run) {
        await cdp.send('Runtime.evaluate', {
          expression: `document.querySelector('#viz').contentWindow.eval(${JSON.stringify(prep.run)})`,
        });
      }
      if (prep.drag) await scribble(cdp);
      await sleep(prep.wait || WAIT);
      // Hide anything the stage itself overlays (dock, notices, recover button).
      await cdp.send('Runtime.evaluate', { expression: `(() => {
        const s = document.createElement('style');
        s.textContent = 'body > *:not(#viz) { display:none !important; } #viz { position:fixed !important; inset:0 !important; width:100vw !important; height:100vh !important; }';
        document.head.append(s);
      })()` });
      await sleep(150);
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'webp', quality: QUALITY,
        clip: { x: 0, y: 0, width: W, height: H, scale: SCALE },
      });
      const buf = Buffer.from(data, 'base64');
      writeFileSync(join(OUT, `${id}.webp`), buf);
      console.log(`${(buf.length / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.log(`failed: ${err.message}`);
    }
  }
  cdp.close();
} finally {
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still closing */ }
}
