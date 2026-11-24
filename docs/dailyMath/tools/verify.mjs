#!/usr/bin/env node
// Daily Math Atelier verifier — headless Chrome over CDP, zero dependencies (Node >= 22).
//
// Usage:
//   node docs/dailyMath/tools/verify.mjs docs/dailyMath/plates/2026-11-23-poncelets-porism.html
//   node docs/dailyMath/tools/verify.mjs --all
//   node docs/dailyMath/tools/verify.mjs --gallery
//   node docs/dailyMath/tools/verify.mjs --thumbs

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BUDGET = {
  titleWords: 7,
  hookWordsMin: 5,
  hookWordsMax: 16,
  stepWords: 26,
  stepsMin: 3,
  stepsMax: 5,
  mathWordsMin: 25,
  mathWordsMax: 130,
  controlsMin: 1,
  controlsMax: 4,
  extraWords: 14,
  testsMin: 2,
};

/* ------------------------------------------------------------------ CDP */

class Browser {
  static async launch() {
    const prof = mkdtempSync(join(tmpdir(), 'dailym-cdp-'));
    const proc = spawn(CHROME, [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${prof}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--window-size=1280,800',
      'about:blank',
    ], { stdio: 'ignore' });

    let wsPath;
    for (let i = 0; i < 150 && !wsPath; i++) {
      try {
        const [, path] = readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split('\n');
        const [port] = readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split('\n');
        if (port && path) wsPath = `ws://127.0.0.1:${port.trim()}${path.trim()}`;
      } catch {
        await sleep(100);
      }
    }
    if (!wsPath) {
      try { proc.kill(); } catch {}
      throw new Error('Chrome did not start (' + CHROME + ')');
    }
    const b = new Browser(proc, prof, new WebSocket(wsPath));
    await new Promise((res, rej) => { b.ws.onopen = res; b.ws.onerror = rej; });
    return b;
  }

  constructor(proc, prof, ws) {
    Object.assign(this, { proc, prof, ws, id: 0, pending: new Map(), listeners: new Map() });
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method && m.sessionId && this.listeners.has(m.sessionId)) {
        this.listeners.get(m.sessionId)(m.method, m.params);
      }
    };
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }

  async tab(w = 1280, h = 800) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const t = new Tab(this, sessionId, targetId);
    this.listeners.set(sessionId, (m, p) => t.event(m, p));
    await t.send('Runtime.enable');
    await t.send('Page.enable');
    await t.send('Log.enable');
    await t.send('Network.enable');
    await t.viewport(w, h);
    return t;
  }

  close() {
    try { this.ws.close(); } catch {}
    try { this.proc.kill(); } catch {}
    setTimeout(() => { try { rmSync(this.prof, { recursive: true, force: true }); } catch {} }, 400);
  }
}

class Tab {
  constructor(b, sessionId, targetId) {
    Object.assign(this, { b, sessionId, targetId, errors: [], logs: [], external: [] });
  }
  send(m, p) { return this.b.send(m, p, this.sessionId); }
  event(method, p) {
    if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails;
      this.errors.push('exception: ' + (d.exception?.description ? d.exception.description.split('\n')[0] : d.text) + (d.url ? ` (${basename(d.url)}:${d.lineNumber + 1})` : ''));
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ');
      if (p.type === 'error' || p.type === 'assert') this.errors.push('console.error: ' + text);
      else this.logs.push(p.type + ': ' + text);
    } else if (method === 'Log.entryAdded') {
      if (p.entry.level === 'error') this.errors.push('log: ' + p.entry.text);
    } else if (method === 'Network.requestWillBeSent') {
      const u = p.request.url;
      if (!/^(file|data|blob|about|chrome|devtools):/.test(u)) this.external.push(u);
    }
  }
  reset() { this.errors = []; this.logs = []; this.external = []; }
  async viewport(w, h, mobile = false) {
    this.w = w; this.h = h;
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  }
  async go(url) {
    this.reset();
    await this.send('Page.navigate', { url });
    await this.waitFor('document.readyState === "complete"', 10000);
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }
  async waitFor(expr, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await this.eval(`!!(${expr})`)) return true; } catch {}
      await sleep(80);
    }
    return false;
  }
  async shot({ format = 'png', quality, scale = 1 } = {}) {
    const params = { format, clip: { x: 0, y: 0, width: this.w, height: this.h, scale } };
    if (quality) params.quality = quality;
    const r = await this.send('Page.captureScreenshot', params);
    return Buffer.from(r.data, 'base64');
  }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}

/* ------------------------------------------------ image analysis */

const LAB = `
window.__img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
window.__px = async src => {
  const i = await __img(src);
  const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
  const x = c.getContext('2d'); x.drawImage(i, 0, 0);
  return x.getImageData(0, 0, c.width, c.height).data;
};
window.__stats = async src => {
  const d = await __px(src);
  let n = 0, fg = 0, s = 0, s2 = 0;
  const bg = [d[0], d[1], d[2]];
  for (let k = 0; k < d.length; k += 4) {
    n++;
    const L = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
    s += L; s2 += L * L;
    if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 28) fg++;
  }
  const m = s / n;
  const bgLum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
  return { fg: fg / n, std: Math.sqrt(Math.max(0, s2 / n - m * m)), mean: m, bgLum };
};
window.__diff = async (a, b) => {
  const A = await __px(a), B = await __px(b);
  let changed = 0, sum = 0;
  for (let k = 0; k < A.length; k += 4) {
    const d = Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k + 1] - B[k + 1]), Math.abs(A[k + 2] - B[k + 2]));
    sum += d; if (d > 18) changed++;
  }
  return { changed, frac: changed / (A.length / 4), mean: sum / (A.length / 4) };
};
`;

const dataUrl = buf => `data:image/png;base64,${buf.toString('base64')}`;

function loadManifest() {
  const src = readFileSync(join(ROOT, 'manifest.js'), 'utf8');
  const win = {};
  new Function('window', 'globalThis', src)(win, win);
  return { plates: win.DM_PLATES || [], topics: win.DM_TOPICS || [] };
}

const stemOf = f => basename(f).replace(/\.html$/, '');
const words = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

class Report {
  constructor(name) { this.name = name; this.rows = []; }
  pass(msg) { this.rows.push(['PASS', msg]); }
  fail(msg) { this.rows.push(['FAIL', msg]); }
  warn(msg) { this.rows.push(['WARN', msg]); }
  check(cond, okMsg, failMsg) { cond ? this.pass(okMsg) : this.fail(failMsg || okMsg); return cond; }
  get failed() { return this.rows.some(r => r[0] === 'FAIL'); }
  print() {
    const tag = { PASS: '\x1b[32m✓\x1b[0m', FAIL: '\x1b[31m✗\x1b[0m', WARN: '\x1b[33m!\x1b[0m' };
    console.log(`\n\x1b[1m${this.name}\x1b[0m`);
    for (const [k, m] of this.rows) console.log(`  ${tag[k]} ${m}`);
    console.log(this.failed ? '  \x1b[31mFAILED\x1b[0m' : '  \x1b[32mOK\x1b[0m');
  }
}

async function verifyPlate(browser, lab, fileArg, { thumbsOnly = false } = {}) {
  const abs = existsSync(resolve(fileArg)) ? resolve(fileArg) : resolve(ROOT, fileArg);
  const file = basename(abs);
  const stem = stemOf(file);
  const rep = new Report(file);
  const outDir = join(ROOT, '.verify', stem);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(ROOT, 'thumbs'), { recursive: true });

  const tab = await browser.tab(1280, 800);
  const url = pathToFileURL(abs).href;
  await tab.go(url);
  const booted = await tab.waitFor('window.__DM_APP && window.__DM_TESTS');
  if (!rep.check(booted, 'Atelier shell booted', 'Atelier shell failed to initialize' + (tab.errors.length ? ': ' + tab.errors.join(' | ') : ''))) {
    await tab.send('Target.closeTarget', { targetId: tab.targetId });
    rep.print();
    return rep;
  }
  await sleep(300);

  if (!thumbsOnly) {
    rep.check(tab.errors.length === 0, 'Zero console or runtime errors', 'Errors: ' + tab.errors.join(' | '));
    rep.check(tab.external.length === 0, 'Zero external network requests (100% offline)', 'External requests: ' + tab.external.join(', '));

    const tests = await tab.eval('window.__DM_TESTS');
    rep.check(tests.total >= BUDGET.testsMin, `${tests.total} DM.test self-checks registered (>= ${BUDGET.testsMin})`, `Only ${tests.total} self-tests`);
    const badTests = tests.results.filter(r => !r.ok);
    rep.check(badTests.length === 0, `All ${tests.total} self-tests passed`, 'Failed tests: ' + badTests.map(t => `${t.name}: ${t.message}`).join('; '));

    // Budgets
    const info = await tab.eval(`(() => {
      const h1 = document.querySelector('.dm-head h1')?.innerText || '';
      const hook = document.querySelector('.dm-hook')?.innerText || '';
      const sheet = document.querySelector('.dm-sheet-body')?.innerText || '';
      const pips = document.querySelectorAll('.dm-pip').length;
      const steps = [];
      return { h1, hook, sheet, pips, extraText: (document.querySelector('.dm-pane-labels')?.innerText || '') };
    })()`);

    const titleWc = words(info.h1);
    const hookWc = words(info.hook);
    const mathWc = words(info.sheet);
    const extraWc = words(info.extraText);
    rep.check(titleWc > 0 && titleWc <= BUDGET.titleWords, `Title budget (${titleWc} <= ${BUDGET.titleWords} words)`, `Title too long: ${titleWc} words`);
    rep.check(hookWc >= BUDGET.hookWordsMin && hookWc <= BUDGET.hookWordsMax, `Hook budget (${hookWc} words)`, `Hook outside ${BUDGET.hookWordsMin}-${BUDGET.hookWordsMax}: ${hookWc} words`);
    rep.check(info.pips >= BUDGET.stepsMin && info.pips <= BUDGET.stepsMax, `Tour steps (${info.pips})`, `Tour steps ${info.pips} outside ${BUDGET.stepsMin}-${BUDGET.stepsMax}`);
    rep.check(mathWc >= BUDGET.mathWordsMin && mathWc <= BUDGET.mathWordsMax, `Math sheet (${mathWc} words)`, `Math sheet outside ${BUDGET.mathWordsMin}-${BUDGET.mathWordsMax}: ${mathWc} words`);
    rep.check(extraWc <= BUDGET.extraWords, `Stray stage text (${extraWc} <= ${BUDGET.extraWords} words)`, `Too much stray text: ${extraWc} words`);

    // Dock controls count (excluding play button)
    const ctrlCount = await tab.eval(`(() => {
      const dock = document.querySelector('.dm-dock');
      if (!dock) return 0;
      return [...dock.children].filter(el => !el.matches('[aria-label*="Play"]')).length;
    })()`);
    rep.check(ctrlCount >= BUDGET.controlsMin && ctrlCount <= BUDGET.controlsMax, `Dock controls (${ctrlCount})`, `Dock controls ${ctrlCount} outside ${BUDGET.controlsMin}-${BUDGET.controlsMax}`);

    // Step through tour & capture screenshots
    let stepWordsOk = true;
    let nonBlankOk = true;
    for (let i = 0; i < info.pips; i++) {
      await tab.eval(`window.__DM_APP.goto(${i})`);
      await tab.waitFor('!window.__DM_APP.busy()', 1800);
      await sleep(160);
      const stepText = await tab.eval(`document.querySelector('.dm-tour-body')?.innerText || ''`);
      const swc = words(stepText);
      if (swc > BUDGET.stepWords) {
        stepWordsOk = false;
        rep.fail(`Tour step ${i + 1} text ${swc} > ${BUDGET.stepWords} words`);
      }
      const shot = await tab.shot();
      writeFileSync(join(outDir, `step-${i + 1}.png`), shot);
      const st = await lab.eval(`window.__stats(${JSON.stringify(dataUrl(shot))})`);
      if (st.fg < 0.004 && st.std < 1.2) {
        nonBlankOk = false;
        rep.fail(`Tour step ${i + 1} stage looks blank`);
      }
    }
    if (stepWordsOk) rep.pass(`All ${info.pips} tour steps <= ${BUDGET.stepWords} words`);
    if (nonBlankOk) rep.pass(`All ${info.pips} tour step stages rendered richly`);

    // Exercise dock controls and check pixel delta
    await tab.eval('window.__DM_APP.goto(0)');
    await sleep(300);
    const baseShot = await tab.shot();
    const baseUrl = dataUrl(baseShot);
    const ctrlMeta = await tab.eval(`(() => {
      const dock = document.querySelector('.dm-dock');
      const out = [];
      for (const el of dock.children) {
        if (el.matches('[aria-label*="Play"]')) continue;
        if (el.classList.contains('dm-seg')) {
          const btn = el.querySelector('button[aria-pressed="false"]');
          if (btn) {
            const r = btn.getBoundingClientRect();
            out.push({ kind: 'seg', x: r.left + r.width / 2, y: r.top + r.height / 2 });
          }
        } else if (el.classList.contains('dm-slider')) {
          const inp = el.querySelector('input');
          out.push({ kind: 'slider', min: +inp.min, max: +inp.max, val: +inp.value });
        } else if (el.classList.contains('dm-toggle-btn')) {
          const r = el.getBoundingClientRect();
          out.push({ kind: 'toggle', x: r.left + r.width / 2, y: r.top + r.height / 2 });
        } else if (el.classList.contains('dm-ctrl-btn')) {
          const r = el.getBoundingClientRect();
          out.push({ kind: 'button', x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }
      }
      return out;
    })()`);

    let allChanged = true;
    let sliderIdx = 0;
    for (const c of ctrlMeta) {
      await tab.eval('window.__DM_APP.goto(0)');
      await sleep(220);
      if (c.kind === 'slider') {
        const nextVal = c.val + (c.max - c.min) * (c.val > (c.min + c.max) / 2 ? -0.25 : 0.25);
        await tab.eval(`(() => {
          const inp = document.querySelectorAll('.dm-slider input')[${sliderIdx++}];
          inp.value = ${JSON.stringify(String(nextVal))};
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
      } else {
        await tab.click(c.x, c.y);
      }
      await sleep(200);
      const afterShot = await tab.shot();
      const diff = await lab.eval(`window.__diff(${JSON.stringify(baseUrl)}, ${JSON.stringify(dataUrl(afterShot))})`);
      if (diff.frac < 0.0004 && diff.mean < 0.08) {
        allChanged = false;
        rep.warn(`Control (${c.kind}) produced minimal stage delta`);
      }
    }
    if (allChanged) rep.pass(`Every dock control (${ctrlMeta.length}) visibly updates the stage`);

    // Dual-mode theme toggle test
    await tab.eval('window.__DM_APP.goto(0)');
    await sleep(250);
    const themeBefore = await tab.eval('document.documentElement.dataset.dmTheme');
    const toggleBox = await tab.eval(`(() => { const r = document.querySelector('.dm-theme-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await tab.click(toggleBox.x, toggleBox.y);
    await sleep(220);
    const themeAfter = await tab.eval('document.documentElement.dataset.dmTheme');
    const altShot = await tab.shot();
    writeFileSync(join(outDir, 'alt-theme.png'), altShot);
    const altStats = await lab.eval(`window.__stats(${JSON.stringify(dataUrl(altShot))})`);
    rep.check(themeBefore !== themeAfter, `Theme toggle flipped ${themeBefore} -> ${themeAfter}`, 'Theme toggle did not flip');
    if (themeAfter === 'dark') rep.check(altStats.bgLum < 0.25, `Obsidian dark ground luminance (${altStats.bgLum.toFixed(2)})`, 'Dark ground too bright');
    else rep.check(altStats.bgLum > 0.65, `Parchment light ground luminance (${altStats.bgLum.toFixed(2)})`, 'Light ground too dark');
    await tab.click(toggleBox.x, toggleBox.y);
    await sleep(180);

    // Native <dialog> check
    const infoBox = await tab.eval(`(() => { const r = document.querySelector('.dm-info-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await tab.click(infoBox.x, infoBox.y);
    await sleep(260);
    const isModal = await tab.eval(`document.querySelector('dialog.dm-sheet')?.matches(':modal') === true`);
    rep.check(isModal, 'Info sheet opens as native :modal <dialog>', 'Info sheet is not :modal');
    const closeBox = await tab.eval(`(() => { const r = document.querySelector('.dm-sheet-close').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await tab.click(closeBox.x, closeBox.y);
    await sleep(260);
    const isClosed = await tab.eval(`!document.querySelector('dialog.dm-sheet')?.open`);
    rep.check(isClosed, 'Info sheet closes cleanly', 'Info sheet stayed open');

    // Mobile 390x844 layout & overlap check
    await tab.viewport(390, 844, true);
    await tab.eval('window.__DM_APP.goto(0)');
    await sleep(320);
    const mob = await tab.eval(`(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const sels = ['.dm-head', '.dm-tools', '.dm-readout', '.dm-tour', '.dm-dock'];
      const rects = [];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        rects.push({ s, l: r.left, r: r.right, t: r.top, b: r.bottom });
      }
      const overlaps = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const A = rects[i], B = rects[j];
          if (A.l < B.r - 1 && A.r > B.l + 1 && A.t < B.b - 1 && A.b > B.t + 1) {
            overlaps.push(A.s + ' <-> ' + B.s);
          }
        }
      }
      return { overflow, overlaps };
    })()`);
    const mobShot = await tab.shot();
    writeFileSync(join(outDir, 'mobile.png'), mobShot);
    rep.check(!mob.overflow, 'Mobile 390x844 has zero horizontal overflow', 'Mobile horizontal overflow detected');
    rep.check(mob.overlaps.length === 0, 'Mobile 390x844 chrome has zero bounding-box overlaps', 'Mobile overlaps: ' + mob.overlaps.join(', '));
    rep.check(tab.errors.length === 0, 'Zero errors during interactions & mobile resize', 'Interaction errors: ' + tab.errors.join(' | '));
  }

  // Poster thumbnail (1280x800 in plate's defaultTheme)
  await tab.viewport(1280, 800, false);
  await tab.go(url + '?poster');
  await tab.waitFor('window.__DM_APP');
  const delay = await tab.eval('window.__DM_APP ? 900 : 900');
  await sleep(delay);
  const webp = await tab.shot({ format: 'webp', quality: 86 });
  writeFileSync(join(ROOT, 'thumbs', stem + '.webp'), webp);
  rep.pass(`Wrote thumbs/${stem}.webp`);

  await tab.send('Target.closeTarget', { targetId: tab.targetId });
  rep.print();
  return rep;
}

async function verifyGallery(browser) {
  const rep = new Report('index.html (Editorial Gallery)');
  const { plates } = loadManifest();
  const outDir = join(ROOT, '.verify');
  mkdirSync(outDir, { recursive: true });

  const tab = await browser.tab(1280, 800);
  await tab.go(pathToFileURL(join(ROOT, 'index.html')).href + '?theme=light');
  await sleep(700);

  rep.check(tab.errors.length === 0, 'Zero console/runtime errors in gallery', 'Errors: ' + tab.errors.join(' | '));
  rep.check(tab.external.length === 0, 'Zero external network requests in gallery', 'External: ' + tab.external.join(', '));

  const cardCount = await tab.eval(`document.querySelectorAll('.g-card').length`);
  rep.check(cardCount === plates.length, `Gallery renders all ${plates.length} manifest plates`, `Rendered ${cardCount} != ${plates.length}`);

  const missingThumbs = plates.filter(p => !existsSync(join(ROOT, 'thumbs', stemOf(p.file) + '.webp'))).map(p => p.file);
  rep.check(missingThumbs.length === 0, 'All manifest thumbnails present on disk', 'Missing thumbs: ' + missingThumbs.join(', '));

  const heroOk = await tab.eval(`(() => {
    const f = document.getElementById('g-hero-iframe');
    return !!(f && f.contentDocument && f.contentDocument.querySelector('.dm-stage canvas, .dm-stage svg'));
  })()`);
  rep.check(heroOk, 'Live hero plate iframe loaded cleanly', 'Hero iframe stage missing');

  writeFileSync(join(outDir, 'gallery-light.png'), await tab.shot());

  // Switch to dark mode via gallery theme button and verify hero iframe syncs
  await tab.eval(`document.getElementById('g-theme-btn').click()`);
  await sleep(450);
  const syncedDark = await tab.eval(`(() => {
    const f = document.getElementById('g-hero-iframe');
    return document.documentElement.dataset.dmTheme === 'dark' &&
      f?.contentDocument?.documentElement?.dataset?.dmTheme === 'dark';
  })()`);
  rep.check(syncedDark, 'Gallery theme toggle syncs Obsidian dark mode into live hero iframe', 'Dark theme sync failed');
  writeFileSync(join(outDir, 'gallery-dark.png'), await tab.shot());

  await tab.send('Target.closeTarget', { targetId: tab.targetId });
  rep.print();
  return rep;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: verify.mjs <plate.html> | --all | --gallery | --thumbs');
    process.exit(2);
  }
  const browser = await Browser.launch();
  const lab = await browser.tab(64, 64);
  await lab.eval(LAB);

  let anyFail = false;
  try {
    const { plates } = loadManifest();
    if (args.includes('--all')) {
      for (const p of plates) {
        const r = await verifyPlate(browser, lab, join('plates', p.file));
        if (r.failed) anyFail = true;
      }
      const g = await verifyGallery(browser);
      if (g.failed) anyFail = true;
    } else if (args.includes('--thumbs')) {
      for (const p of plates) {
        const r = await verifyPlate(browser, lab, join('plates', p.file), { thumbsOnly: true });
        if (r.failed) anyFail = true;
      }
    } else if (args.includes('--gallery')) {
      const g = await verifyGallery(browser);
      if (g.failed) anyFail = true;
    } else {
      for (const f of args) {
        const r = await verifyPlate(browser, lab, f);
        if (r.failed) anyFail = true;
      }
    }
  } finally {
    browser.close();
  }
  process.exit(anyFail ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
