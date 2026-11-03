// Headless check of an interactive paper.
//   node docs/InteractivePapers/tools/check-page.mjs <url> [outDir]
// Loads the page at desktop (1280) and phone (390, mobile) widths in light and dark,
// scrolls every figure into view so it mounts, and reports:
//   console errors and exceptions, MathJax errors, page width vs viewport,
//   per figure: mounted / fallback / canvas count / ✓ and ✗ counts in its readouts.
// Saves a screenshot of every figure (desktop light + phone dark) to outDir.
// Needs Google Chrome; uses node's built-in WebSocket (node ≥ 22).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const outDir = process.argv[3] || join(tmpdir(), 'ip-check');
if (!url) { console.error('usage: node check-page.mjs <url> [outDir]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'ip-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function devtoolsPort() {
  const f = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100; i++) { if (existsSync(f)) return readFileSync(f, 'utf8').split('\n')[0]; await sleep(100); }
  throw new Error('Chrome did not start');
}

let ws, nextId = 1;
const waiting = new Map(), listeners = [];
function send(method, params = {}, sessionId) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject, method }));
}

async function main() {
  const port = await devtoolsPort();
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id); waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(w.method + ': ' + msg.error.message)); else w.resolve(msg.result);
    } else if (msg.method) for (const l of listeners) l(msg);
  });

  const report = [];
  let failures = 0;
  for (const [label, width, height, mobile, dark, shots] of [
    ['desktop light', 1280, 900, false, false, true],
    ['desktop dark', 1280, 900, false, true, false],
    ['phone light', 390, 844, true, false, false],
    ['phone dark', 390, 844, true, true, true],
  ]) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    const errors = [];
    listeners.length = 0;
    listeners.push((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).split('\n')[0]);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console: ' + msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push('log: ' + msg.params.entry.text.slice(0, 200) + (msg.params.entry.url ? ' ' + msg.params.entry.url : ''));
    });
    await S('Runtime.enable'); await S('Log.enable'); await S('Page.enable');
    await S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
    await S('Page.navigate', { url });
    const evaluate = async (expression, awaitPromise = true) => {
      const r = await S('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    // wait for MathJax
    for (let i = 0; i < 100; i++) {
      const ok = await evaluate(`!!(window.MathJax && MathJax.startup && MathJax.startup.promise)`).catch(() => false);
      if (ok) break;
      await sleep(150);
    }
    await evaluate(`MathJax.startup.promise.then(() => true)`);
    await evaluate(`try { localStorage.removeItem('ip-theme'); } catch (e) {}; delete document.documentElement.dataset.theme; document.documentElement.style.scrollBehavior = 'auto'; true`);
    const ids = await evaluate(`[...document.querySelectorAll('figure.fig')].map(f => f.id)`);
    for (const id of ids) {
      await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: 'start' }); true`);
      await sleep(400);
    }
    // let async figure work finish (spectra, counts), then measure
    await sleep(9000);
    const page = await evaluate(`({
      iw: innerWidth, sw: document.documentElement.scrollWidth,
      merr: [...document.querySelectorAll('mjx-merror')].map(e => e.getAttribute('data-mjx-error') || e.textContent).slice(0, 5),
      bg: getComputedStyle(document.body).backgroundColor,
      figs: [...document.querySelectorAll('figure.fig')].map(f => ({
        id: f.id, mounted: !!f.dataset.mounted, fallback: f.querySelector('.fallback')?.textContent || null,
        canvases: f.querySelectorAll('canvas').length,
        ok: f.querySelectorAll('.fig-mount .ok').length, bad: f.querySelectorAll('.fig-mount .bad').length,
        computing: /(computing|counting)\\s*(…|\\.\\.\\.)/i.test(f.querySelector('.fig-mount')?.innerText || ''),
      })),
      // numbered references whose target is on the page but which are not links (pages using refs.js)
      unlinked: (() => {
        const kinds = { def: 'Definition', lem: 'Lemma', cor: 'Corollary', pro: 'Proposition', the: 'Theorem', thm: 'Theorem', rem: 'Remark', fig: 'Figure' };
        const has = (key) => [...document.querySelectorAll('[id][data-ref], [id][data-alias]')].find(e => e.dataset.ref === key || (e.dataset.alias || '').split('|').includes(key));
        const RE = /\\b(Definitions?|Defs?\\.|Lemmas?|Corollar(?:y|ies)|Cors?\\.|Propositions?|Props?\\.|Theorems?|Thms?\\.|Remarks?|Figures?|Figs?\\.)\\s+(\\d+(?:\\.\\d+)?)|\\((\\d+\\.\\d+)\\)/g;
        const EX = 'a, h1, h2, h3, .label, .fig-head, .rail, mjx-container, button, .cv-labels, .ref-pop, script, style';
        const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode;
          if (!t.parentElement || t.parentElement.closest(EX)) continue;
          for (const m of t.nodeValue.matchAll(RE)) {
            const key = m[3] ? '(' + m[3] + ')' : kinds[m[1].slice(0, 3).toLowerCase()] + ' ' + m[2];
            const tg = has(key);
            if (tg && !t.parentElement.closest('#' + CSS.escape(tg.id))) out.push(key);
          }
        }
        return out;
      })(),
      // in-flow elements reaching past the viewport, outside any scroll container
      wide: [...document.querySelectorAll('body *')].filter(e => {
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.right > ${width} + 1)) return false;
        if (getComputedStyle(e).position === 'fixed') return false;
        for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible') return false; if (getComputedStyle(a).position === 'fixed') return false; }
        return true;
      }).filter((e, _, all) => ![...e.children].some(c => all.includes(c)))
        .slice(0, 6).map(e => e.tagName + '.' + (e.className.baseVal ?? e.className) + ' right=' + Math.round(e.getBoundingClientRect().right) + ' in ' + (e.closest('figure')?.id || e.closest('section')?.querySelector('h2')?.id || '?') + ' :: ' + (e.textContent || '').slice(0, 40)),
    })`);
    if (shots) {
      for (const f of page.figs) {
        const rect = await evaluate(`(() => { const e = document.getElementById(${JSON.stringify(f.id)}); e.scrollIntoView({ block: 'start' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; })()`);
        await sleep(500);
        const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, rect.x - 8), y: Math.max(0, rect.y - 8), width: Math.min(width, rect.w + 16), height: Math.min(4000, rect.h + 16), scale: 1 } });
        writeFileSync(join(outDir, `${label.replace(' ', '-')}-${f.id}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    // companion pages (overlays opened by #view-… links): each must open, typeset cleanly and fit the width
    const views = await evaluate(`[...new Set([...document.querySelectorAll('a[href^="#view-"]')].map(a => a.getAttribute('href')))]`);
    const viewProblems = [];
    for (const v of views) {
      await evaluate(`location.hash = ${JSON.stringify(v)}; true`);
      await sleep(2200);
      const r = await evaluate(`(() => { const c = document.querySelector('.cmp'); return { open: !!(c && c.classList.contains('on')), merr: c ? c.querySelectorAll('mjx-merror').length : -1, refs: c ? c.querySelectorAll('a.ref').length : 0, iw: innerWidth, sw: document.documentElement.scrollWidth, title: c?.querySelector('.cmp-title')?.textContent }; })()`);
      if (!r.open) viewProblems.push(`${v} did not open`);
      if (r.merr) viewProblems.push(`${v}: ${r.merr} MathJax errors`);
      if (r.iw !== width || r.sw !== width) viewProblems.push(`${v}: width ${r.iw}/${r.sw}`);
      if (shots) {
        const shot = await S('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(outDir, `${label.replace(' ', '-')}-view-${v.slice(6)}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    if (views.length) await evaluate(`history.replaceState(null, '', location.pathname); dispatchEvent(new HashChangeEvent('hashchange')); true`);
    page.views = views.length;

    const problems = [...viewProblems];
    if (page.iw !== width || page.sw !== width) problems.push(`width ${page.iw}/${page.sw} ≠ ${width}; widest: ${page.wide.join(' | ') || '?'}`);
    if (page.merr.length) problems.push('MathJax errors: ' + page.merr.join(' | '));
    if (page.unlinked.length) problems.push(`${page.unlinked.length} numbered reference(s) not linked: ${[...new Set(page.unlinked)].slice(0, 8).join(', ')}`);
    for (const f of page.figs) {
      if (!f.mounted) problems.push(`${f.id} not mounted`);
      if (f.fallback) problems.push(`${f.id} fallback: ${f.fallback}`);
      if (f.bad) problems.push(`${f.id} has ${f.bad} ✗`);
      if (f.computing) problems.push(`${f.id} still computing`);
    }
    problems.push(...errors);
    failures += problems.length;
    report.push({ label, bg: page.bg, views: page.views, figs: page.figs.map((f) => `${f.id}: ${f.canvases} canvas, ${f.ok} ✓, ${f.bad} ✗`), problems });
    await send('Target.closeTarget', { targetId });
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(failures ? `${failures} problem(s)` : 'all clean', '· screenshots in', outDir);
  return failures;
}

async function cleanup() {
  try { ws?.close(); } catch (e) { /* closed */ }
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold files; the OS temp dir is cleaned anyway */ }
}
main().then(async (f) => { await cleanup(); process.exit(f ? 1 : 0); })
  .catch(async (e) => { console.error(e); await cleanup(); process.exit(2); });
