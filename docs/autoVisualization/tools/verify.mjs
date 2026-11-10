#!/usr/bin/env node
// AutoViz verifier — headless Chrome over CDP, no dependencies (node ≥ 22).
//
//   node tools/verify.mjs days/2026-09-28-coxeter-plane.html   full check of one page + its thumbnail
//   node tools/verify.mjs --all                                every manifest page (legacy pages: errors + thumbnail)
//   node tools/verify.mjs --thumbs                             regenerate every thumbnail only
//   node tools/verify.mjs --gallery                            check index.html against manifest.js
//
// Review images land in .verify/<stem>/ (git-ignored): step-N.png for each tour step,
// mobile.png, and poster.webp. Exit code 1 if anything FAILs.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BUDGET = {
  titleWords: 7, hookWords: 16, stepWords: 26, stepsMin: 3, stepsMax: 5,
  mathWordsMin: 25, mathWordsMax: 130, controlsMax: 4, extraWords: 14,
};

/* ------------------------------------------------------------------ CDP */

class Browser {
  static async launch() {
    const prof = mkdtempSync(join(tmpdir(), 'autoviz-cdp-'));
    // Port 0 + DevToolsActivePort: never collide with another session's headless Chrome.
    const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`,
      '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
      '--allow-file-access-from-files', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
    let wsPath;
    for (let i = 0; i < 150 && !wsPath; i++) {
      try {
        const [port, path] = readFileSync(join(prof, 'DevToolsActivePort'), 'utf8').split('\n');
        if (port && path) wsPath = `ws://127.0.0.1:${port}${path}`;
      } catch { await sleep(100); }
    }
    if (!wsPath) throw new Error('Chrome did not start (' + CHROME + ')');
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
    this.proc.kill();
    setTimeout(() => { try { rmSync(this.prof, { recursive: true, force: true }); } catch {} }, 500);
  }
}

class Tab {
  constructor(b, sessionId, targetId) { Object.assign(this, { b, sessionId, targetId, errors: [], logs: [], external: [] }); }
  send(m, p) { return this.b.send(m, p, this.sessionId); }
  event(method, p) {
    if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails;
      this.errors.push('exception: ' + (d.exception && d.exception.description ? d.exception.description.split('\n')[0] : d.text) + (d.url ? ` (${basename(d.url)}:${d.lineNumber + 1})` : ''));
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = p.args.map(a => a.value !== undefined ? a.value : a.description).join(' ');
      if (p.type === 'error' || p.type === 'assert') this.errors.push('console.error: ' + text);
      else this.logs.push(p.type + ': ' + text);
    } else if (method === 'Log.entryAdded') {
      if (p.entry.level === 'error') this.errors.push('log: ' + p.entry.text + (p.entry.url ? ' ' + basename(p.entry.url) : ''));
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
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n  in: ' + expr.slice(0, 160));
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
  async shot({ format = 'png', quality, scale = 1, clip } = {}) {
    const params = { format };
    if (quality) params.quality = quality;
    params.clip = clip ? { ...clip, scale } : { x: 0, y: 0, width: this.w, height: this.h, scale };
    const r = await this.send('Page.captureScreenshot', params);
    return Buffer.from(r.data, 'base64');
  }
}

/* ------------------------------------------------ image analysis (in a lab tab) */

const LAB = `
window.__img = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
window.__px = async src => { const i = await __img(src); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
  const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
window.__stats = async (src) => { const d = await __px(src); let n = 0, fg = 0, s = 0, s2 = 0;
  const bg = [d[0], d[1], d[2]];
  for (let k = 0; k < d.length; k += 4) { n++; const L = 0.2126*d[k] + 0.7152*d[k+1] + 0.0722*d[k+2]; s += L; s2 += L*L;
    if (Math.abs(d[k]-bg[0]) + Math.abs(d[k+1]-bg[1]) + Math.abs(d[k+2]-bg[2]) > 36) fg++; }
  const m = s / n; return { fg: fg / n, std: Math.sqrt(Math.max(0, s2 / n - m*m)), mean: m }; };
window.__diff = async (a, b) => { const A = await __px(a), B = await __px(b); let changed = 0, sum = 0;
  for (let k = 0; k < A.length; k += 4) { const d = Math.max(Math.abs(A[k]-B[k]), Math.abs(A[k+1]-B[k+1]), Math.abs(A[k+2]-B[k+2]));
    sum += d; if (d > 24) changed++; }
  return { changed, frac: changed / (A.length / 4), mean: sum / (A.length / 4) }; };
`;
const dataUrl = (buf, type = 'png') => `data:image/${type};base64,${buf.toString('base64')}`;

/* ------------------------------------------------------------------ helpers */

function loadWindow() {
  const src = readFileSync(join(ROOT, 'manifest.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win;
}
const loadManifest = () => loadWindow().AUTOVIZ || [];
const loadTopics = () => loadWindow().AUTOVIZ_TOPICS || [];
const stemOf = f => basename(f).replace(/\.html$/, '');
const fileUrl = (rel, query = '') => pathToFileURL(join(ROOT, rel)).href + query;
const words = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
const plain = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

class Report {
  constructor(name) { this.name = name; this.rows = []; }
  pass(msg) { this.rows.push(['PASS', msg]); }
  fail(msg) { this.rows.push(['FAIL', msg]); }
  warn(msg) { this.rows.push(['WARN', msg]); }
  info(msg) { this.rows.push(['INFO', msg]); }
  check(cond, msg, failMsg) { cond ? this.pass(msg) : this.fail(failMsg || msg); return cond; }
  get failed() { return this.rows.some(r => r[0] === 'FAIL'); }
  print() {
    const tag = { PASS: '\x1b[32m✓\x1b[0m', FAIL: '\x1b[31m✗\x1b[0m', WARN: '\x1b[33m!\x1b[0m', INFO: '\x1b[90m·\x1b[0m' };
    console.log(`\n\x1b[1m${this.name}\x1b[0m`);
    for (const [k, m] of this.rows) console.log(`  ${tag[k]} ${m}`);
    console.log(this.failed ? '  \x1b[31mFAILED\x1b[0m' : '  \x1b[32mOK\x1b[0m');
  }
}

/* ------------------------------------------------------------------ checks */

async function stageShot(tab) {
  await tab.eval(`document.body.classList.add('av-capture')`);
  await tab.eval(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const buf = await tab.shot({ scale: 0.5 });
  await tab.eval(`document.body.classList.remove('av-capture')`);
  return buf;
}
const settle = (tab, ms = 4500) => tab.waitFor('!window.__AV__.app.busy()', ms);

async function verifyKitPage(br, lab, rel, rep, outDir) {
  const tab = await br.tab(1280, 800);
  await tab.go(fileUrl(rel));
  const isKit = await tab.waitFor('window.__AV__ && window.__AV__.ready', 8000);
  if (!rep.check(isKit, 'kit page boots (window.__AV__.ready)', 'page never reported ready — not built on kit/av.js, or it threw during setup')) {
    for (const e of tab.errors) rep.fail(e);
    return null;
  }
  await sleep(500);
  const meta = await tab.eval('window.__AV__.meta()');

  // text + control budgets
  const w = meta.words;
  rep.check(w.title <= BUDGET.titleWords, `title ${w.title} words`, `title has ${w.title} words (max ${BUDGET.titleWords})`);
  rep.check(w.hook >= 5 && w.hook <= BUDGET.hookWords, `hook ${w.hook} words`, `hook has ${w.hook} words (want 5–${BUDGET.hookWords})`);
  rep.check(meta.steps.length >= BUDGET.stepsMin && meta.steps.length <= BUDGET.stepsMax, `tour has ${meta.steps.length} steps`,
    `tour has ${meta.steps.length} steps (want ${BUDGET.stepsMin}–${BUDGET.stepsMax})`);
  w.steps.forEach((n, i) => { if (n > BUDGET.stepWords) rep.fail(`tour step ${i + 1} has ${n} words (max ${BUDGET.stepWords})`); });
  if (w.steps.every(n => n <= BUDGET.stepWords)) rep.pass(`tour captions ≤ ${BUDGET.stepWords} words (longest ${Math.max(0, ...w.steps)})`);
  rep.check(w.math >= BUDGET.mathWordsMin && w.math <= BUDGET.mathWordsMax, `math panel ${w.math} words`,
    `math panel has ${w.math} words (want ${BUDGET.mathWordsMin}–${BUDGET.mathWordsMax})`);
  rep.check(meta.controls.length >= 1 && meta.controls.length <= BUDGET.controlsMax, `${meta.controls.length} dock controls`,
    `${meta.controls.length} dock controls (want 1–${BUDGET.controlsMax}, play and ⓘ not counted)`);
  const extra = await tab.eval(`(() => {
    const skip = n => n.closest && n.closest('.av-top,.av-bottom,.av-sheet,.av-scrim,script,style,noscript');
    let t = ''; const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (it.nextNode()) { const n = it.currentNode, p = n.parentElement; if (!p || skip(p)) continue;
      const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue; t += ' ' + n.textContent; }
    return t; })()`);
  const ew = words(extra);
  rep.check(ew <= BUDGET.extraWords, `extra on-screen text ${ew} words`, `${ew} words of on-screen text outside the kit chrome (max ${BUDGET.extraWords}): "${plain(extra).slice(0, 90)}…"`);

  // self-tests
  const results = await tab.eval('window.__AV__.results');
  if (rep.check(results.length > 0, `${results.length} self-tests registered`, 'no AV.test self-checks registered')) {
    for (const r of results) r.pass ? rep.pass(`test: ${r.name}${r.detail ? ' — ' + r.detail : ''}`) : rep.fail(`test: ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  }

  // stage renders
  const s0 = await lab.eval(`__stats(${JSON.stringify(dataUrl(await stageShot(tab)))})`);
  rep.check(s0.fg > 0.02 && s0.std > 4, `stage renders (${(100 * s0.fg).toFixed(1)}% ink)`,
    `stage looks blank (${(100 * s0.fg).toFixed(2)}% non-background pixels)`);

  // tour: screenshot every step for review, and check each step changes the picture
  const nSteps = meta.steps.length;
  let prevStage = null;
  for (let i = 0; i < nSteps; i++) {
    await tab.eval(`window.__AV__.app.goto(${i})`);
    await sleep(1700);
    await settle(tab, 2500);
    writeFileSync(join(outDir, `step-${i + 1}.png`), await tab.shot());
    const st = await stageShot(tab);
    if (prevStage) {
      const d = await lab.eval(`__diff(${JSON.stringify(dataUrl(prevStage))}, ${JSON.stringify(dataUrl(st))})`);
      if (d.changed < 40) rep.warn(`tour step ${i + 1} looks the same as step ${i} — each step should change the picture`);
    }
    prevStage = st;
  }
  rep.info(`tour screenshots: ${join(outDir, 'step-*.png')}`);

  // controls must change the mathematics on screen
  await tab.eval('window.__AV__.app.goto(0)');
  await sleep(1500);
  await tab.eval('window.__AV__.app.pause()');
  const specs = await tab.eval(`(window.__AV__.app.opts.controls || []).filter(c => c.id).map(c => ({ id: c.id, type: c.type, verify: c.verify,
    min: c.min, max: c.max, options: (c.options || []).map(o => typeof o === 'object' ? o.value : o) }))`);
  for (const c of specs) {
    if (c.verify === false) { rep.info(`control "${c.id}" skipped (verify: false)`); continue; }
    await settle(tab);
    await sleep(150);
    const a = await stageShot(tab);
    const cur = await tab.eval(`window.__AV__.app.get(${JSON.stringify(c.id)})`);
    let act;
    if (c.type === 'segmented') {
      const i = c.options.findIndex(v => String(v) === String(cur));
      act = `window.__AV__.app.set(${JSON.stringify(c.id)}, ${JSON.stringify(c.options[(i + 1) % c.options.length])})`;
    } else if (c.type === 'slider') {
      const span = c.max - c.min, target = (cur - c.min) / span > 0.5 ? c.min + 0.15 * span : c.min + 0.85 * span;
      act = `window.__AV__.app.set(${JSON.stringify(c.id)}, ${target})`;
    } else if (c.type === 'toggle') {
      act = `window.__AV__.app.set(${JSON.stringify(c.id)}, ${!cur})`;
    } else {
      act = `window.__AV__.app.press(${JSON.stringify(c.id)})`;
    }
    await tab.eval(act);
    await sleep(300);
    await settle(tab, 6000);
    await sleep(200);
    const b = await stageShot(tab);
    const d = await lab.eval(`__diff(${JSON.stringify(dataUrl(a))}, ${JSON.stringify(dataUrl(b))})`);
    rep.check(d.changed >= 40, `control "${c.id}" changes the stage (${d.changed} px)`,
      `control "${c.id}" (${c.type}) did not visibly change the stage — cosmetic or broken?`);
  }

  // playback
  const hasPlay = await tab.eval(`(window.__AV__.app.opts.controls || []).some(c => c.type === 'play')`);
  if (hasPlay) {
    await tab.eval('window.__AV__.app.play(true)');
    const f0 = await tab.eval('window.__AV__.frames');
    await sleep(2000);
    const f1 = await tab.eval('window.__AV__.frames');
    const fps = (f1 - f0) / 2;
    rep.check(fps > 5, `plays (${fps.toFixed(0)} fps headless)`, `play is on but only ${fps.toFixed(1)} frames/s were drawn`);
    if (fps > 5 && fps < 24) rep.warn(`only ${fps.toFixed(0)} fps in headless Chrome — check the per-frame cost`);
  }

  for (const e of tab.errors) rep.fail(e);
  if (!tab.errors.length) rep.pass('no console errors');
  rep.check(!tab.external.length, 'no network requests', 'network request(s): ' + tab.external.slice(0, 3).join(', '));
  await br.send('Target.closeTarget', { targetId: tab.targetId });

  // phone layout
  const m = await br.tab(390, 844);
  await m.viewport(390, 844, true);
  await m.go(fileUrl(rel));
  await m.waitFor('window.__AV__ && window.__AV__.ready', 8000);
  await sleep(1400);
  writeFileSync(join(outDir, 'mobile.png'), await m.shot());
  const lay = await m.eval(`(() => {
    const q = s => document.querySelector(s), box = n => { const r = n.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const parts = ['.av-head', '.av-readout', '.av-tour', '.av-dock'].map(s => [s, q(s) && getComputedStyle(q(s)).display !== 'none' ? box(q(s)) : null]).filter(p => p[1]);
    const out = [];
    for (const [s, r] of parts) if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(s + ' leaves the screen');
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const [a, A] = parts[i], [b, B] = parts[j];
      if (A.left < B.right - 1 && A.right > B.left + 1 && A.top < B.bottom - 1 && A.bottom > B.top + 1) out.push(a + ' overlaps ' + b);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('horizontal scroll');
    const stage = q('.av-stage').getBoundingClientRect();
    const tour = q('.av-tour') && box(q('.av-tour')), head = box(q('.av-head'));
    const free = (tour ? tour.top : innerHeight) - (head ? head.bottom : 0);
    return { issues: out, free: Math.round(free), h: innerHeight };
  })()`);
  rep.check(!lay.issues.length, 'phone layout clean (390×844)', 'phone layout: ' + lay.issues.join('; '));
  if (lay.free < lay.h * 0.35) rep.warn(`on a phone only ${lay.free}px of stage is uncovered — shorten the hook or captions`);
  for (const e of m.errors) rep.fail('phone: ' + e);
  await br.send('Target.closeTarget', { targetId: m.targetId });
  rep.info(`phone screenshot: ${join(outDir, 'mobile.png')}`);
  return meta;
}

async function poster(br, lab, rel, rep) {
  const stem = stemOf(rel);
  mkdirSync(join(ROOT, 'thumbs'), { recursive: true });
  const out = join(ROOT, 'thumbs', stem + '.webp');
  const tab = await br.tab(960, 600);
  await tab.go(fileUrl(rel, '?poster'));
  const kit = await tab.waitFor('window.__AV__ && window.__AV__.ready', 5000);
  let buf;
  if (kit) {
    const ok = await tab.waitFor('window.__AV__.posterReady', 15000);
    if (!ok) rep.warn('poster: posterReady never fired, capturing anyway');
    buf = await tab.shot({ format: 'webp', quality: 82 });
  } else {
    // Legacy page: crop the largest canvas/svg to 16:10.
    await tab.viewport(1280, 800);
    await sleep(3200);
    const r = await tab.eval(`(() => {
      const els = [...document.querySelectorAll('canvas, svg')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 120 && b.height > 120 && getComputedStyle(e).visibility !== 'hidden'; });
      if (!els.length) return null;
      els.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; });
      els[0].scrollIntoView({ block: 'center', inline: 'center' });
      const b = els[0].getBoundingClientRect();
      const x0 = Math.max(0, b.left), y0 = Math.max(0, b.top), x1 = Math.min(innerWidth, b.right), y1 = Math.min(innerHeight, b.bottom);
      return { x: x0 + scrollX, y: y0 + scrollY, w: x1 - x0, h: y1 - y0 };
    })()`);
    await sleep(600);
    if (r) {
      let w = Math.min(r.w, r.h * 1.6), h = w / 1.6;
      const clip = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h };
      buf = await tab.shot({ format: 'webp', quality: 82, clip, scale: 960 / w });
    } else buf = null;
    // A crop that is mostly empty background makes a poor card: fall back to the whole page.
    if (!buf || (await lab.eval(`__stats(${JSON.stringify(dataUrl(buf, 'webp'))})`)).fg < 0.03) {
      await tab.eval('scrollTo(0, 0)');
      await sleep(300);
      buf = await tab.shot({ format: 'webp', quality: 82, clip: { x: 0, y: 0, width: 1280, height: 800 }, scale: 0.75 });
    }
  }
  writeFileSync(out, buf);
  const st = await lab.eval(`__stats(${JSON.stringify(dataUrl(buf, 'webp'))})`);
  rep.check(st.fg > 0.03, `thumbnail thumbs/${stem}.webp (${(buf.length / 1024).toFixed(0)} KB)`,
    `thumbnail thumbs/${stem}.webp looks blank (${(100 * st.fg).toFixed(1)}% ink)`);
  for (const e of tab.errors) rep.fail('poster: ' + e);
  await br.send('Target.closeTarget', { targetId: tab.targetId });
}

function checkManifest(rel, meta, rep) {
  const file = basename(rel);
  let list;
  try { list = loadManifest(); } catch (e) { rep.fail('manifest.js does not evaluate: ' + e.message); return; }
  const e = list.find(x => x.file === file);
  if (!rep.check(!!e, 'manifest entry present', `no manifest.js entry with file "${file}"`)) return;
  for (const k of ['date', 'file', 'title', 'hook', 'topics']) if (!e[k]) rep.fail(`manifest entry is missing "${k}"`);
  const topicIds = (loadTopics() || []).map(t => t.id);
  if (e.topics) rep.check(Array.isArray(e.topics) && e.topics.length >= 1 && e.topics.length <= 3 && e.topics.every(t => topicIds.includes(t)),
    `topics ${JSON.stringify(e.topics)}`, `topics must be 1–3 ids from AUTOVIZ_TOPICS (${topicIds.join(', ')}); got ${JSON.stringify(e.topics)}`);
  if (e.hook) rep.check(words(e.hook) <= BUDGET.hookWords, `manifest hook ${words(e.hook)} words`, `manifest hook has ${words(e.hook)} words (max ${BUDGET.hookWords})`);
  if (!file.startsWith(e.date)) rep.fail(`file name does not start with its date ${e.date}`);
  if (meta) {
    if (plain(meta.title) !== plain(e.title)) rep.warn(`page title "${plain(meta.title)}" ≠ manifest title "${plain(e.title)}"`);
    if (meta.date !== e.date) rep.fail(`page date ${meta.date} ≠ manifest date ${e.date}`);
    if (e.v !== 2) rep.fail('kit pages need v: 2 in their manifest entry (enables the live gallery hero)');
  }
  if (list.filter(x => x.file === file).length > 1) rep.fail('duplicate manifest entries for ' + file);
  const dates = list.map(x => x.date);
  if (dates.some((d, i) => i && d > dates[i - 1])) rep.fail('manifest.js is not newest-first');
}

async function checkGallery(br, lab, rep) {
  const list = loadManifest();
  const tab = await br.tab(1280, 900);
  await tab.go(fileUrl('index.html'));
  await sleep(1800);
  await tab.eval(`Promise.race([new Promise(r => setTimeout(r, 2500)),
    Promise.all([...document.images].filter(i => i.loading !== 'lazy').map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))])`);
  const g = await tab.eval(`(() => ({
    hero: (document.querySelector('.feature h2') || {}).textContent || '',
    cards: document.querySelectorAll('.card').length,
    thumbs: document.querySelectorAll('.card .thumb img').length,
  }))()`);
  rep.check(plain(g.hero) === plain(list[0]?.title), `gallery feature is the newest entry ("${plain(g.hero)}")`, `gallery feature shows "${plain(g.hero)}", newest manifest entry is "${plain(list[0]?.title)}"`);
  rep.check(g.cards === list.length - 1, `gallery shows ${g.cards} earlier cards`, `gallery shows ${g.cards} cards for ${list.length - 1} earlier entries`);
  const missing = list.filter(e => !existsSync(join(ROOT, 'thumbs', stemOf(e.file) + '.webp'))).map(e => e.file);
  rep.check(!missing.length, 'every entry has a thumbnail', 'missing thumbnails (run --thumbs): ' + missing.join(', '));
  // topic filter: each topic chip shows exactly the entries tagged with it
  const bad = [];
  for (const t of loadTopics()) {
    const want = list.filter(e => (e.topics || []).includes(t.id)).length;
    if (!want) continue;
    const got = await tab.eval(`(location.hash = ${JSON.stringify('#' + t.id)}, new Promise(r => setTimeout(() => r(document.querySelectorAll('.card').length), 60)))`);
    if (got !== want) bad.push(`${t.id}: ${got} cards, expected ${want}`);
  }
  rep.check(!bad.length, 'topic filters show the right entries', 'topic filter mismatch — ' + bad.join('; '));
  await tab.eval(`(history.replaceState(null, '', location.pathname), dispatchEvent(new HashChangeEvent('hashchange')))`);
  await sleep(300);
  const outDir = join(ROOT, '.verify');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'gallery.png'), await tab.shot());
  for (const e of tab.errors) rep.fail(e);
  rep.info('gallery screenshot: ' + join(outDir, 'gallery.png'));
  await br.send('Target.closeTarget', { targetId: tab.targetId });
}

async function legacyCheck(br, rel, rep) {
  const tab = await br.tab(1280, 800);
  await tab.go(fileUrl(rel));
  await sleep(2500);
  for (const e of tab.errors) rep.fail(e);
  if (!tab.errors.length) rep.pass('legacy page loads without console errors');
  await br.send('Target.closeTarget', { targetId: tab.targetId });
}

/* ------------------------------------------------------------------ main */

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(2); }
  const br = await Browser.launch();
  const lab = await br.tab(400, 300);
  await lab.eval(LAB);
  const reports = [];
  try {
    if (args[0] === '--gallery') {
      const rep = new Report('gallery'); reports.push(rep);
      await checkGallery(br, lab, rep);
    } else if (args[0] === '--all' || args[0] === '--thumbs') {
      for (const e of loadManifest()) {
        const rel = 'days/' + e.file;
        const rep = new Report(e.file); reports.push(rep);
        if (!existsSync(join(ROOT, rel))) { rep.fail('file missing'); continue; }
        if (args[0] === '--all') {
          if (e.v === 2) {
            const outDir = join(ROOT, '.verify', stemOf(rel));
            mkdirSync(outDir, { recursive: true });
            const meta = await verifyKitPage(br, lab, rel, rep, outDir);
            checkManifest(rel, meta, rep);
          } else await legacyCheck(br, rel, rep);
        }
        await poster(br, lab, rel, rep);
        rep.print();
      }
      const rep = new Report('gallery'); reports.push(rep);
      await checkGallery(br, lab, rep);
    } else {
      // a day page (full check + manifest + thumbnail + gallery), or any other kit page such as kit/examples/*
      const rel = resolve(args[0]).replace(ROOT + '/', '');
      if (!existsSync(join(ROOT, rel))) throw new Error('no such page: ' + rel);
      const rep = new Report(rel); reports.push(rep);
      const outDir = join(ROOT, '.verify', stemOf(rel));
      mkdirSync(outDir, { recursive: true });
      const meta = await verifyKitPage(br, lab, rel, rep, outDir);
      if (rel.startsWith('days/')) {
        checkManifest(rel, meta, rep);
        await poster(br, lab, rel, rep);
        const g = new Report('gallery'); reports.push(g);
        await checkGallery(br, lab, g);
      }
    }
  } finally {
    br.close();
  }
  for (const r of reports) if (!(args[0] === '--all' || args[0] === '--thumbs') || r.name === 'gallery') r.print();
  const failed = reports.filter(r => r.failed);
  console.log(failed.length ? `\n\x1b[31m${failed.length} report(s) failed\x1b[0m` : '\n\x1b[32mall checks passed\x1b[0m');
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
