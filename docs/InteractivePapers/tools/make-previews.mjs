// Preview stills for the interactive-papers index (../index.html), light and dark.
//   node docs/InteractivePapers/tools/make-previews.mjs [baseUrl] [slug …]
// baseUrl defaults to http://localhost:8847/docs/InteractivePapers/ (serve the repo root).
// Writes docs/InteractivePapers/previews/<slug>-light.webp and -dark.webp (720 px wide, 16:10).
// Each entry photographs one signature figure (selector), or the top of the page.
// Needs Google Chrome; uses node's built-in WebSocket (node ≥ 22).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREVIEWS = [
  { slug: 'CannonModulus', path: 'CannonModulus/', sel: '#fig-sphere' },
  { slug: 'LPS', path: 'LPS/', sel: '#fig-projective' },
  { slug: 'cannon', path: 'cannon/', sel: '#fig-sphere' },
  { slug: 'residual', path: 'residual/', sel: '#fig-residual' },
  { slug: 'catalan', path: 'catalan/', sel: '#fig-contact' },
  { slug: 'nonsofic', path: 'nonsofic/', sel: null },
  { slug: 'brooksMatelski', path: 'brooksMatelski/', sel: 'canvas' },
  { slug: 'martelli', path: 'martelli/', sel: null },
  { slug: 'superrigidity', path: 'superrigidity/', sel: null },
  { slug: 'jorgensen', path: 'jorgensen.html', sel: null },
  { slug: 'groupBuilder', path: 'groupBuilder/', sel: null },
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'previews');
const base = process.argv[2] || 'http://localhost:8847/docs/InteractivePapers/';
const only = process.argv.slice(3);
const W = 720, VW = 1280, VH = 800;
mkdirSync(outDir, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withChrome(fn) {
  const profile = mkdtempSync(join(tmpdir(), 'ip-prev-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) { const t = readFileSync(f, 'utf8').split('\n')[0]; if (t) port = t; }
    if (!port) await sleep(100);
  }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  try { return await fn(send); } finally { ws.close(); chrome.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ } }, 300); }
}

await withChrome(async (send) => {
  for (const p of PREVIEWS) {
    if (only.length && !only.includes(p.slug)) continue;
    for (const dark of [false, true]) {
      const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
      const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
      const S = (m, q) => send(m, q, sessionId);
      const ev = async (expression) => (await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
      await S('Runtime.enable');
      await S('Page.enable');
      await S('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
      await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
      await S('Page.navigate', { url: base + p.path + (p.sel && p.sel.startsWith('#') ? p.sel : '') });
      await sleep(1500);
      for (let i = 0; i < 60; i++) { if (await ev('document.readyState === "complete"')) break; await sleep(200); }
      await ev('(window.MathJax && MathJax.startup && MathJax.startup.promise) ? MathJax.startup.promise.then(() => true) : true');
      await ev(`document.documentElement.style.scrollBehavior = 'auto'; true`);
      let clip = { x: 0, y: 0, width: VW, height: VW * 0.625 };
      if (p.sel) {
        await ev(`(() => { const e = document.querySelector(${JSON.stringify(p.sel)}); if (e) e.scrollIntoView({ block: 'start' }); return true; })()`);
        await sleep(6000); // figures mount, compute and draw (software WebGL is slow)
        const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(p.sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width }; })()`);
        if (r) {
          const w = Math.min(VW - 8, r.w + 24);
          clip = { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: w, height: w * 0.625 };
        }
      } else {
        await sleep(2500);
        await ev('window.scrollTo(0, 0); true');
      }
      const shot = await S('Page.captureScreenshot', { format: 'webp', quality: 82, captureBeyondViewport: true, clip: { ...clip, scale: W / clip.width } });
      const out = join(outDir, `${p.slug}-${dark ? 'dark' : 'light'}.webp`);
      writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
      console.log('saved', out.split('/').slice(-2).join('/'), Math.round(shot.result.data.length * 0.75 / 1024) + ' KB');
      await send('Target.closeTarget', { targetId });
    }
  }
});
process.exit(0);
