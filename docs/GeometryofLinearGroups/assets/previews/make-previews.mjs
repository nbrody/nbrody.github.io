// Render the preview stills on the tool cards (tool-previews.js shows them; nothing runs live).
//
//     node docs/GeometryofLinearGroups/assets/previews/make-previews.mjs [filter…]
//
// Every card with data-preview on the pages below gets <slug>.webp here: the tool opened in
// headless Chrome (hardware GL), left to draw for a few seconds, and photographed. When the tool
// has a main picture (its biggest canvas or SVG) the floating UI over it is hidden and the still
// is cropped to it; otherwise it is the top of the page. The slug is the tool's path from
// GeometryofLinearGroups/ with '/' → '__', a final "index.html" dropped, and '..' → 'up'
// (tool-previews.js computes the same). Filters render only the tools whose path contains one of
// them; OVERRIDES tunes the tools that need it. For tuning: DEBUG=1 prints each crop and the page's
// errors, PROBE=1 lists its buttons, MODE=page|visual and WAIT=ms apply to every tool.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, posix, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GLG = join(HERE, '..', '..');                  // docs/GeometryofLinearGroups
const DOCS = join(GLG, '..');                        // the site root on GitHub Pages
const PAGES = ['index.html', 'Algebraic/index.html', 'Geometric/index.html', 'Arithmetic/index.html', 'misc/index.html', 'GroupLibrary/index.html'];
const W = 1280, H = 800, OUT_W = 640, QUALITY = 74, WAIT = 3500;

// Per tool (its path from GeometryofLinearGroups/): wait (ms), query, mode ('page' or 'visual'),
// js (run before the photo, then after ms), hide (selectors to hide), or skip (no still; the card
// keeps its plain frame) with the reason.
const click = (sel) => `document.querySelector(${JSON.stringify(sel)})?.click()`;
const clickText = (t) => `[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(t)}))?.click()`;
const OVERRIDES = {
    'Arithmetic/Tools/pseudomodular/index.html': { js: click('#compute-btn'), after: 4000 },
    'Geometric/Tools/Kleinian/fuchsianDiscreteness/index.html': { js: `${click('#check-btn')}; setTimeout(() => ${clickText('Poincaré disk')}, 2500)`, after: 5000 },
    'Geometric/Tools/discretenessAlgorithm/index.html': { js: click('#decide-btn'), after: 9000 },
    'Algebraic/Tools/2dimFields/index.html': { js: "document.documentElement.classList.contains('light') && document.getElementById('theme-btn').click()", after: 1200 },
    // nothing to show: broken, empty, blank until drawn on, or never finishing a picture headless
    'Arithmetic/Tools/convexCocompactPSL2Z/compact_surface.html': { skip: 'fails to load: bare "react" import' },
    'Arithmetic/Tools/orthogonal.html': { skip: 'fails to load: mathjs@14.0.1 ESM build 404s on jsDelivr' },
    'misc/projectorFeedback/index.html': { skip: 'fails to load: feedback.js is missing' },
    'Geometric/Tools/Kleinian/apollodense.html': { skip: 'WebGPU shader module fails to compile' },
    'GroupLibrary/Groups/SL2Z.html': { skip: 'empty file' },
    'Geometric/Tools/Kleinian/julia.html': { skip: 'its default polynomial (… + 0.3i) does not parse, so it opens black' },
    'Geometric/Tools/Kleinian/knots/index.html': { skip: 'a blank canvas to draw on' },
    'Geometric/Tools/Kleinian/knotfolio/index.html': { skip: 'a blank canvas to draw on' },
    'Geometric/Tools/Kleinian/coxeter.html': { skip: 'a blank graph to draw on' },
    'Geometric/Tools/Kleinian/maskit1.html': { skip: 'its worker does not finish headless' },
    'Geometric/Tools/Kleinian/maskit2.html': { skip: 'its worker does not finish headless' },
    'Geometric/Tools/Kleinian/4dExplorer/index.html': { skip: 'renders black headless' },
    'misc/rileySlice3D/index.html': { skip: 'renders only its axes headless' },
    // the controls are as telling as the picture
    'Arithmetic/Tools/convexCocompactPSL2Z/index.html': { mode: 'page' },
    'Arithmetic/Tools/cocompactSurface/index.html': { mode: 'page', wait: 6000 },
    'Arithmetic/Tools/convexCocompact/index.html': { mode: 'page' },
    'misc/vinberg.html': { mode: 'page' },
    'misc/coxeter/index.html': { mode: 'page' },
};

export const slugOf = (rel) => rel.split('/').map((s) => (s === '..' ? 'up' : s)).join('__')
    .replace(/(__)?index\.html$/, '').replace(/__$/, '');

// ---------- the cards ----------
function targets() {
    const out = new Map();
    for (const page of PAGES) {
        const src = readFileSync(join(GLG, page), 'utf8');
        for (const m of src.matchAll(/data-preview="([^"]+)"/g)) {
            const rel = posix.normalize(posix.join(posix.dirname(page), m[1].split(/[?#]/)[0]));
            if (!out.has(rel)) out.set(rel, existsSync(join(GLG, rel)));
        }
    }
    return out;
}

// ---------- a static server for docs/ ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.wasm': 'application/wasm',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.glsl': 'text/plain', '.txt': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
function serve() {
    const server = createServer((req, res) => {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let f = join(DOCS, p);
        if (!f.startsWith(DOCS)) { res.writeHead(403).end(); return; }
        if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
        if (!existsSync(f)) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(readFileSync(f));
    });
    return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---------- Chrome over the DevTools protocol ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function chrome() {
    const dir = mkdtempSync(join(tmpdir(), 'previews-'));
    const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless=new', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--hide-scrollbars',
        '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${dir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    const ws = await new Promise((res, rej) => {
        let buf = '';
        proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/[^\s]+/); if (m) res(m[0]); });
        setTimeout(() => rej(new Error('Chrome did not start')), 15000);
    });
    const port = new URL(ws).port;
    const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    const sock = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => sock.addEventListener('open', r));
    let id = 0;
    const pending = new Map(), listeners = new Set();
    sock.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        if (m.method) for (const l of listeners) l(m);
    });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
    const on = (f) => { listeners.add(f); return () => listeners.delete(f); };
    return { send, on, close: () => { sock.close(); proc.kill(); } };
}

// Find the main picture (the biggest canvas or SVG on screen), fade out the floating UI over it,
// and return the clip to photograph; a page without one is cropped to its column of content.
export const PREP = (mode, hide) => `(() => {
    const W = innerWidth, H = innerHeight, gone = (e) => e.style.setProperty('opacity', '0', 'important');
    for (const s of ${JSON.stringify(hide || [])}) document.querySelectorAll(s).forEach(gone);
    const onScreen = (r) => Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0));
    const shown = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0; };
    const floating = (el) => /^(fixed|absolute|sticky)$/.test(getComputedStyle(el).position);
    let best = null, area = 0;
    for (const el of document.querySelectorAll('canvas, svg, iframe')) {
        if (!shown(el)) continue;
        const a = onScreen(el.getBoundingClientRect());
        if (a > area) { best = el; area = a; }
    }
    if (${JSON.stringify(mode)} !== 'page' && best && area >= 0.15 * W * H) {
        const R = best.getBoundingClientRect();
        for (const el of document.querySelectorAll('body *')) {
            if (el === best || el.contains(best) || best.contains(el) || !floating(el)) continue;
            if (/^(CANVAS|svg|IFRAME)$/.test(el.tagName) && onScreen(el.getBoundingClientRect()) > 0.5 * area) continue;   // a layer of the picture
            gone(el);
        }
        const x = Math.max(0, R.left), y = Math.max(0, R.top);
        return { mode: 'visual', clip: { x, y, width: Math.min(R.right, W) - x, height: Math.min(R.bottom, H) - y } };
    }
    // a page: hide the small things that float (the site menu button and the like), crop to the content's column
    let x0 = W, x1 = 0;
    const fixed = [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).position === 'fixed' && onScreen(el.getBoundingClientRect()) < 0.06 * W * H);
    fixed.forEach(gone);
    for (const el of document.querySelectorAll('body *')) {
        if (fixed.some((f) => f.contains(el))) continue;
        // what holds content: its own text (measured as set, not by its box), a control, an image or a
        // formula (not full-width bars)
        if (!shown(el)) continue;
        const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
        let r;
        if (texts.length) {
            const rg = document.createRange();
            rg.setStartBefore(texts[0]); rg.setEndAfter(texts[texts.length - 1]);
            r = rg.getBoundingClientRect();
        } else if (/^(svg|canvas|img|input|button|select|textarea|mjx-container)$/i.test(el.tagName)) {
            r = el.getBoundingClientRect();
            if (r.width > 0.9 * W) continue;
        } else continue;
        if (r.width < 2 || r.height < 2 || r.top >= H * 0.9 || r.bottom <= 0) continue;
        x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right);
    }
    if (x1 <= x0) return { mode: 'page' };
    const w = Math.min(W, Math.max(720, x1 - x0 + 64)), cx = (x0 + x1) / 2, x = Math.min(W - w, Math.max(0, cx - w / 2));
    return { mode: 'page', clip: { x, y: 0, width: w, height: Math.min(H, w * 10 / 16) } };
})()`;

async function shoot(C, url, o) {
    const errors = [], offErr = C.on((m) => {
        if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
        if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text.slice(0, 120)} ${m.params.entry.url || ''}`);
    });
    const loaded = new Promise((r) => { const off = C.on((m) => { if (m.method === 'Page.loadEventFired') { off(); r(); } }); });
    await C.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(o.wait ?? WAIT);
    if (process.env.PROBE) {
        const b = await C.send('Runtime.evaluate', { returnByValue: true, expression: `[...document.querySelectorAll('button, select, input[type=button], input[type=submit], a.btn')]
            .filter((e) => e.offsetParent).map((e) => (e.id ? '#' + e.id + ' ' : '') + (e.textContent || e.value || '').trim().replace(/\\s+/g, ' ').slice(0, 28)).slice(0, 40).join(' | ')` });
        console.log('   buttons:', b.result?.result?.value);
    }
    if (o.js) { await C.send('Runtime.evaluate', { expression: o.js, awaitPromise: true }); await sleep(o.after ?? 800); }
    const r = await C.send('Runtime.evaluate', { expression: PREP(o.mode, o.hide), returnByValue: true });
    if (r.result && r.result.exceptionDetails) console.log('  prep failed:', r.result.exceptionDetails.exception?.description?.split('\n')[0]);
    const info = (r.result && r.result.result && r.result.result.value) || { mode: 'page' };
    offErr();
    if (process.env.DEBUG) { console.log('  ', JSON.stringify(info)); for (const e of errors.slice(0, 4)) console.log('   !', e); }
    await sleep(150);
    const clip = info.clip && info.clip.width > 50 && info.clip.height > 50 ? info.clip : { x: 0, y: 0, width: W, height: H };
    const shot = await C.send('Page.captureScreenshot', { format: 'webp', quality: QUALITY, captureBeyondViewport: false, clip: { ...clip, scale: OUT_W / clip.width } });
    if (!shot.result) throw new Error(JSON.stringify(shot.error));
    return { data: Buffer.from(shot.result.data, 'base64'), mode: info.mode + (clip.width < W || clip.height < H ? '/crop' : '') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const filters = process.argv.slice(2);
    const all = targets();
    const todo = [...all].filter(([rel, ok]) => ok && (!filters.length || filters.some((f) => rel.includes(f)))).map(([rel]) => rel);
    for (const [rel, ok] of all) if (!ok) console.log(`missing  ${rel}`);
    const server = await serve(), base = `http://127.0.0.1:${server.address().port}/GeometryofLinearGroups/`;
    let C = await chrome();
    const setup = async () => {
        await C.send('Page.enable');
        await C.send('Runtime.enable');
        await C.send('Log.enable');
        await C.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
        C.on((m) => { if (m.method === 'Page.javascriptDialogOpening') C.send('Page.handleJavaScriptDialog', { accept: false }); });
    };
    await setup();
    const report = [];
    for (const rel of todo) {
        const o = { ...(OVERRIDES[rel] || {}), ...(process.env.MODE ? { mode: process.env.MODE } : {}), ...(process.env.WAIT ? { wait: +process.env.WAIT } : {}) };
        const slug = slugOf(rel), t0 = Date.now();
        if (o.skip) {
            rmSync(join(HERE, `${slug}.webp`), { force: true });
            console.log(`skipped              ${rel}: ${o.skip}`);
            continue;
        }
        try {
            const { data, mode } = await shoot(C, base + rel + (o.query || ''), o);
            writeFileSync(join(HERE, `${slug}.webp`), data);
            report.push({ rel, slug, mode, kb: Math.round(data.length / 1024) });
            console.log(`${mode.padEnd(11)} ${String(Math.round(data.length / 1024)).padStart(4)} KB  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${rel}`);
        } catch (e) {
            console.log(`FAILED  ${rel}: ${e.message}`);
            report.push({ rel, slug, error: e.message });
            C.close();
            C = await chrome();
            await setup();
        }
    }
    writeFileSync(join(tmpdir(), 'previews-report.json'), JSON.stringify(report, null, 1));
    C.close();
    server.close();
}
