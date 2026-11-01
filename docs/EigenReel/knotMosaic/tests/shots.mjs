// node tests/shots.mjs <outDir> [base] — headless-Chrome screenshots of the reel at set feed times and sizes.
// Uses --remote-debugging-port=0 and reads DevToolsActivePort, so it never drives another session's Chrome.
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const out = process.argv[2] || '.', base = process.argv[3] || 'http://localhost:8822/docs/EigenReel/knotMosaic/';
mkdirSync(out, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = mkdtempSync(join(tmpdir(), 'km-shots-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--use-angle=metal', '--enable-gpu', '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port = null;
for (let i = 0; i < 100 && !port; i++) { await sleep(100); const f = join(prof, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; }
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(), logs = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await send('Runtime.enable'); await send('Page.enable');

const sizes = { phone: [390, 844, true], desktop: [1280, 800, false] };
const jobs = JSON.parse(process.env.JOBS || 'null') || [
  ...[0.5, 1.4, 2.6, 3.4, 5.0, 8.0, 10.2, 11.5, 12.3].map(t => ({ name: `phone-t${t}`, size: 'phone', query: '?embed=true', t })),
  { name: 'phone-t21', size: 'phone', query: '?embed=true', t: 21.3 },
  { name: 'phone-t34', size: 'phone', query: '?embed=true', t: 34.6 },
  { name: 'desktop-t8', size: 'desktop', query: '?embed=true', t: 8 },
  { name: 'phone-dark-t8', size: 'phone', query: '?embed=true&theme=dark', t: 8 },
];
let lastKey = '';
for (const j of jobs) {
  const [w, h, mobile] = sizes[j.size];
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const key = j.size + j.query;
  if (key !== lastKey || j.reload) {
    await send('Page.navigate', { url: base + j.query });
    await sleep(600);
    await evalJS(`new Promise(r => { const f = () => window.__km ? r() : setTimeout(f, 50); f(); })`);
    await evalJS(`window.__km.ready()`);
    lastKey = key;
  }
  await evalJS(`window.__km.pause(true)`);
  if (j.js) console.log(j.name, await evalJS(j.js));
  else await evalJS(`window.__km.seek(${j.t})`);
  await sleep(120);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, j.name + '.png'), Buffer.from(shot.result.data, 'base64'));
}
if (logs.length) console.log(logs.join('\n'));
ws.close(); chrome.kill();
console.log('wrote', jobs.length, 'shots to', out);
