// Palette Studio: the page. State lives here; the engine is complete.js,
// the taste model model.js, and the Poincaré preview is the real tool in an
// iframe (same origin), driven through window.PoincareAPI.

import { hexToOklch, oklchToHex, simulateCvd, inkOn, isHex, maxChroma, gamutMapOklch } from './color.js';
import { suggest, vary, CONTEXTS, SOURCES } from './complete.js';
import { makeScorer } from './model.js';
import { MODEL, CORPUS } from './corpus.js';
import { buildTiling, paintTiling } from './tiling.js';

const POINCARE_URL = '../../GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare/';
const POINCARE_KEY = 'designStudio.poincarePalette';
const PREFIX = 'designStudio.palettes.';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const validList = (xs) => Array.isArray(xs) && xs.length >= 2 && xs.length <= 12 && xs.every(isHex);
const norm = (h) => ('#' + String(h).replace('#', '')).toLowerCase();
const sameColors = (a, b) => a && b && a.length === b.length && a.every((c, i) => c === b[i]);
const stripTags = (s) => String(s).replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '');

const SOURCE_KEYS = [...Object.keys(SOURCES), 'harmony'];
const SOURCE_LABEL = { ...Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v.label])), harmony: 'Hue rules' };
const SOURCE_COUNT = CORPUS.reduce((m, p) => ((m[p.source] = (m[p.source] || 0) + 1), m), {});

// ---------------- state ----------------

const saved0 = store.get('state', {});
const S = {
    ctx: CONTEXTS[saved0.ctx] ? saved0.ctx : 'poincare',
    n: clamp(saved0.n ?? CONTEXTS[saved0.ctx]?.n ?? 8, 2, 12),
    fit: saved0.fit ?? true,
    steer: { light: saved0.steer?.light ?? 0, vivid: saved0.steer?.vivid ?? 0 },
    sources: new Set((saved0.sources || SOURCE_KEYS).filter((k) => SOURCE_KEYS.includes(k))),
    colors: validList(saved0.colors) ? saved0.colors.map(norm) : null,
    locked: Array.isArray(saved0.locked) ? saved0.locked.map(Boolean) : [],
    name: saved0.name || '',
    thumbs: saved0.thumbs === 'tiling' ? 'tiling' : 'poincare',
    tab: ['poincare', 'tiling', 'chart'].includes(saved0.tab) ? saved0.tab : 'poincare',
    bg: saved0.bg === 'light' ? 'light' : 'dark',
    group: saved0.group || null,
    useTaste: saved0.useTaste ?? true,
    cvd: '',
    fmt: 'hex',
    suggestions: [],
    selected: -1,
    mode: 'suggest',
    varyOf: null,
    round: (Math.random() * 2 ** 32) >>> 0,
    hover: null,
};

// a shared link wins: ?c=hex-hex-hex&lock=0,2&ctx=chart
{
    const q = new URLSearchParams(location.search);
    const c = (q.get('c') || '').split(/[-,\s]+/).filter(Boolean).map(norm);
    if (validList(c)) {
        S.colors = c;
        S.n = c.length;
        const lock = (q.get('lock') || '').split(',').map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < c.length);
        S.locked = c.map((_, i) => lock.includes(i));
        S.name = 'shared';
    }
    if (CONTEXTS[q.get('ctx')] && q.get('ctx') !== S.ctx) {
        S.ctx = q.get('ctx');
        if (!validList(c)) {
            // a fresh start in that context
            S.n = CONTEXTS[S.ctx].n;
            S.colors = null;
            S.locked = [];
        }
        [S.tab, S.thumbs] = { poincare: ['poincare', 'poincare'], chart: ['chart', 'tiling'] }[S.ctx] || ['tiling', 'tiling'];
    }
}
if (S.colors && S.colors.length !== S.n) S.n = S.colors.length;
S.locked = Array.from({ length: S.n }, (_, i) => !!S.locked[i]);
if (!S.sources.size) SOURCE_KEYS.forEach((k) => S.sources.add(k));

let ratings = store.get('ratings', []).filter((r) => validList(r.colors));
let saved = store.get('saved', []).filter((p) => validList(p.colors));

function persist() {
    store.set('state', {
        ctx: S.ctx, n: S.n, fit: S.fit, steer: S.steer, sources: [...S.sources], colors: S.colors, locked: S.locked,
        name: S.name, thumbs: S.thumbs, tab: S.tab, bg: S.bg, group: S.group, useTaste: S.useTaste,
    });
}

// ---------------- the taste model ----------------

const scorer = makeScorer(MODEL);
function retrain() {
    scorer.personalize(S.useTaste ? ratings.map((r) => ({ lch: r.colors.map(hexToOklch), like: r.like })) : []);
    renderTaste();
}

// ---------------- helpers ----------------

const shown = (colors) => (S.cvd ? colors.map((c) => simulateCvd(c, S.cvd)) : colors);
const current = () => S.hover || S.colors || [];

let toastTimer = 0;
function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function describe(p) {
    if (!p) return '';
    if (p.from) {
        const src = SOURCE_LABEL[p.from.source] || p.from.source;
        const name = p.from.source === 'lovers' ? `COLOURlovers ${p.from.name}` : p.from.source === 'wada' ? `Wada ${p.from.name}` : p.from.name;
        const lead = p.how === 'analogy' ? 'after ' : '';
        return `<b>${lead}${escapeHtml(name)}</b>${p.from.source === 'lovers' || p.from.source === 'wada' ? '' : ` · ${escapeHtml(src)}`}${p.note ? ` · ${escapeHtml(p.note)}` : ''}`;
    }
    if (p.how === 'harmony') return `<b>Hue rule</b> · ${escapeHtml(p.note)}`;
    if (p.how === 'variation') return '<b>Variation</b>';
    return escapeHtml(p.how || '');
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plainName = (p) => (p && p.from ? (p.from.source === 'lovers' ? `COLOURlovers ${p.from.name}` : p.from.source === 'wada' ? `Wada ${p.from.name}` : p.from.name) : p && p.how === 'harmony' ? 'hue rule' : 'custom');

// ---------------- working palette ----------------

function renderStrip() {
    const strip = $('strip');
    const colors = S.colors || [];
    const disp = shown(colors);
    if (strip.children.length !== colors.length) {
        strip.textContent = '';
        colors.forEach((_, i) => {
            const sw = document.createElement('div');
            sw.className = 'sw';
            sw.innerHTML = `<span class="sw-index">${i + 1}</span>
                <button class="sw-fill" type="button" aria-label="Edit color ${i + 1}"></button>
                <div class="sw-meta"><span class="sw-hex"></span>
                <button class="sw-lock" type="button"><svg class="i"><use href="#i-unlock"/></svg></button></div>`;
            sw.querySelector('.sw-fill').addEventListener('click', () => openEditor(i));
            sw.querySelector('.sw-lock').addEventListener('click', (e) => { e.stopPropagation(); toggleLock(i); });
            strip.appendChild(sw);
        });
    }
    colors.forEach((c, i) => {
        const sw = strip.children[i];
        sw.style.setProperty('--c', disp[i]);
        sw.style.setProperty('--ink', inkOn(disp[i]));
        sw.classList.toggle('locked', !!S.locked[i]);
        sw.querySelector('.sw-hex').textContent = c;
        const lock = sw.querySelector('.sw-lock');
        lock.setAttribute('aria-pressed', S.locked[i] ? 'true' : 'false');
        lock.setAttribute('aria-label', `${S.locked[i] ? 'Unlock' : 'Lock'} color ${i + 1}`);
        lock.title = S.locked[i] ? 'Locked: suggestions keep this color (click to free it)' : 'Lock: keep this color in every suggestion';
        lock.querySelector('use').setAttribute('href', S.locked[i] ? '#i-lock' : '#i-unlock');
    });
    const liked = saved.some((p) => sameColors(p.colors, S.colors));
    const lb = $('like-working');
    lb.classList.toggle('on', liked);
    lb.querySelector('use').setAttribute('href', liked ? '#i-heart-fill' : '#i-heart');
    lb.querySelector('span').textContent = liked ? 'Saved' : 'Save';
    renderExport();
}

let regenTimer = 0;
function regenSoon(ms = 260) { clearTimeout(regenTimer); regenTimer = setTimeout(() => regenerate(), ms); }

function toggleLock(i) {
    S.locked[i] = !S.locked[i];
    renderStrip();
    persist();
    regenSoon();
}

function setColors(colors, { name, selected = -1 } = {}) {
    S.colors = colors.slice();
    if (name !== undefined) S.name = name;
    S.selected = selected;
    renderStrip();
    markSelected();
    pushPalette();
    persist();
}

// ---------------- color editor ----------------

let editing = -1;
function openEditor(i) {
    editing = i;
    const ed = $('editor');
    ed.hidden = false;
    const r = $('strip').children[i].getBoundingClientRect();
    const w = 260;
    ed.style.left = `${clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)}px`;
    ed.style.top = `${Math.min(r.bottom + 8, innerHeight - 330)}px`;
    syncEditor(S.colors[i], true);
    $('ed-hex').focus();
    $('ed-hex').select();
}

function syncEditor(hex, all = false) {
    const [L, C, H] = hexToOklch(hex);
    $('ed-swatch').style.background = hex;
    if (all || document.activeElement !== $('ed-hex')) $('ed-hex').value = hex;
    if (all || document.activeElement !== $('ed-L')) $('ed-L').value = L;
    if (all || document.activeElement !== $('ed-C')) $('ed-C').value = C;
    if (all || document.activeElement !== $('ed-H')) $('ed-H').value = H;
    $('ed-native').value = hex;
    // tracks show where each slider goes
    const stops = (f) => Array.from({ length: 9 }, (_, k) => oklchToHex(f(k / 8))).join(', ');
    $('ed-L').style.setProperty('--track', `linear-gradient(90deg, ${stops((t) => [t, C, H])})`);
    $('ed-C').style.setProperty('--track', `linear-gradient(90deg, ${stops((t) => [L, t * 0.37, H])})`);
    $('ed-H').style.setProperty('--track', `linear-gradient(90deg, ${stops((t) => [L, Math.min(C, maxChroma(L, t * 360)), t * 360])})`);
}

function editTo(hex) {
    if (editing < 0) return;
    S.colors[editing] = hex;
    S.name = 'custom';
    S.selected = -1;
    syncEditor(hex);
    renderStrip();
    markSelected();
    pushPalette(true);
}

function closeEditor(commit = true) {
    if (editing < 0) return;
    const i = editing;
    editing = -1;
    $('editor').hidden = true;
    if (commit) {
        S.locked[i] = true;
        renderStrip();
        pushPalette();
        persist();
        regenSoon(60);
    }
}

$('ed-hex').addEventListener('input', (e) => { if (isHex(e.target.value) && e.target.value.replace('#', '').length === 6) editTo(norm(e.target.value)); });
$('ed-native').addEventListener('input', (e) => editTo(norm(e.target.value)));
for (const id of ['ed-L', 'ed-C', 'ed-H']) {
    $(id).addEventListener('input', () => {
        const lch = gamutMapOklch([+$('ed-L').value, +$('ed-C').value, +$('ed-H').value]);
        editTo(oklchToHex(lch));
    });
}
$('ed-done').addEventListener('click', () => closeEditor(true));
document.addEventListener('pointerdown', (e) => {
    if (editing >= 0 && !$('editor').contains(e.target) && !e.target.closest('.sw')) closeEditor(true);
});

// ---------------- suggestions ----------------

let genToken = 0;
function regenerate({ keepRound = false } = {}) {
    if (!keepRound) S.round = (Math.random() * 2 ** 32) >>> 0;
    S.mode = 'suggest';
    S.varyOf = null;
    runRound(() => {
        const locked = (S.colors || []).map((hex, i) => (S.locked[i] ? { slot: i, hex } : null)).filter(Boolean);
        return suggest({
            locked, n: S.n, ctx: CONTEXTS[S.ctx], scorer, sources: S.sources, steerBy: S.steer, fit: S.fit,
            seed: S.round, avoid: ratings.filter((r) => !r.like && r.colors.length === S.n).map((r) => r.colors),
        });
    });
}

function runRound(make) {
    const token = ++genToken;
    $('grid').classList.add('busy');
    setTimeout(() => {
        if (token !== genToken) return;
        if (!S.sources.size) {
            S.suggestions = [];
            renderGrid();
            $('sugg-meta').textContent = 'Turn on a source to get suggestions.';
            $('grid').classList.remove('busy');
            return;
        }
        const t0 = performance.now();
        S.suggestions = make();
        const ms = performance.now() - t0;
        if (!S.colors && S.suggestions.length) {
            S.colors = S.suggestions[0].colors.slice();
            S.name = plainName(S.suggestions[0]);
            S.locked = S.colors.map(() => false);
            renderStrip();
            pushPalette();
        }
        S.selected = S.suggestions.findIndex((p) => sameColors(p.colors, S.colors));
        const nl = S.locked.filter(Boolean).length;
        $('sugg-title').textContent = S.mode === 'vary' ? `Like ${plainName(S.varyOf)}` : 'Suggestions';
        $('back-btn').hidden = S.mode !== 'vary';
        $('sugg-meta').textContent = S.mode === 'vary'
            ? `${S.suggestions.length} variations`
            : `${S.suggestions.length} palettes · ${nl ? `around ${nl} locked color${nl > 1 ? 's' : ''}` : 'nothing locked'} · ${Math.round(ms)} ms`;
        renderGrid();
        $('grid').classList.remove('busy');
        $('grid').scrollTop = 0;
        persist();
    }, 20);
}

function varyOn(p) {
    S.mode = 'vary';
    S.varyOf = p;
    S.round = (Math.random() * 2 ** 32) >>> 0;
    if (!sameColors(S.colors, p.colors)) setColors(p.colors, { name: plainName(p) });
    runRound(() => {
        const locked = S.colors.map((hex, i) => (S.locked[i] ? { slot: i, hex } : null)).filter(Boolean);
        return vary({ colors: p.colors, locked, ctx: CONTEXTS[S.ctx], scorer, steerBy: S.steer, fit: S.fit, seed: S.round });
    });
}

const tilingThumb = buildTiling(7, 3, { maxTiles: 520, minSize: 0.02 });
const tilingBig = buildTiling(7, 3);

function renderGrid() {
    const grid = $('grid');
    grid.textContent = '';
    S.suggestions.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('role', 'option');
        card.tabIndex = -1;
        card.style.setProperty('--k', String(Math.min(i, 24)));
        const disp = shown(p.colors);
        const liked = saved.some((q) => sameColors(q.colors, p.colors));
        card.innerHTML = `
            <div class="card-thumb${S.bg === 'light' ? ' light' : ''}"><canvas width="320" height="240"></canvas></div>
            <div class="card-strip">${disp.map((c) => `<span style="background:${c}"></span>`).join('')}</div>
            <p class="card-cap">${describe(p)}</p>
            <div class="card-acts">
                <button data-act="like" class="${liked ? 'liked' : ''}" title="Save, and teach the model you like it (H)" aria-label="Save"><svg class="i"><use href="#${liked ? 'i-heart-fill' : 'i-heart'}"/></svg></button>
                <button data-act="dislike" title="Not for me: the model learns from it (X)" aria-label="Not for me"><svg class="i"><use href="#i-x"/></svg></button>
                <button data-act="vary" title="More like this" aria-label="More like this"><svg class="i"><use href="#i-vary"/></svg></button>
            </div>`;
        card.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (act) { e.stopPropagation(); cardAction(act.dataset.act, i); return; }
            select(i);
        });
        card.addEventListener('mouseenter', () => { S.hover = p.colors; refreshPreview(true); });
        card.addEventListener('mouseleave', () => { S.hover = null; refreshPreview(true); });
        grid.appendChild(card);
    });
    markSelected();
    scheduleThumbs();
}

function markSelected() {
    [...$('grid').children].forEach((c, i) => {
        c.classList.toggle('selected', i === S.selected);
        c.setAttribute('aria-selected', i === S.selected ? 'true' : 'false');
    });
}

function select(i, scroll = false) {
    const p = S.suggestions[i];
    if (!p) return;
    setColors(p.colors, { name: plainName(p), selected: i });
    if (scroll) $('grid').children[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function rate(colors, like, from = null) {
    ratings = ratings.filter((r) => !sameColors(r.colors, colors));
    ratings.push({ colors: colors.slice(), like, t: Date.now() });
    store.set('ratings', ratings.slice(-400));
    if (like) {
        if (!saved.some((p) => sameColors(p.colors, colors))) saved.unshift({ colors: colors.slice(), name: from, t: Date.now() });
    } else {
        saved = saved.filter((p) => !sameColors(p.colors, colors));
    }
    store.set('saved', saved);
    retrain();
    renderSaved();
    renderStrip();
}

function cardAction(act, i) {
    const p = S.suggestions[i], card = $('grid').children[i];
    if (act === 'like') {
        const was = saved.some((q) => sameColors(q.colors, p.colors));
        if (was) {
            saved = saved.filter((q) => !sameColors(q.colors, p.colors));
            ratings = ratings.filter((r) => !sameColors(r.colors, p.colors));
            store.set('saved', saved); store.set('ratings', ratings);
            retrain(); renderSaved(); renderStrip();
            toast('Unsaved.');
        } else {
            rate(p.colors, true, plainName(p));
            card.classList.remove('disliked');
            toast('Saved. The ranking leans toward palettes like it.');
        }
        const btn = card.querySelector('[data-act="like"]'), now = !was;
        btn.classList.toggle('liked', now);
        btn.querySelector('use').setAttribute('href', now ? '#i-heart-fill' : '#i-heart');
    } else if (act === 'dislike') {
        rate(p.colors, false);
        card.classList.add('disliked');
        const btn = card.querySelector('[data-act="like"]');
        btn.classList.remove('liked');
        btn.querySelector('use').setAttribute('href', '#i-heart');
        toast('Noted. Fewer like this from now on.');
    } else if (act === 'vary') {
        varyOn(p);
    }
}

// ---------------- Poincaré (live, in an iframe) ----------------

const P = { frame: null, api: null, win: null, glc: null, ready: false, crop: null, domain: null, classes: 0 };

function ensurePoincare() {
    if (P.frame) return;
    const f = document.createElement('iframe');
    f.src = `${POINCARE_URL}?embed&studio`;
    f.title = 'Poincaré, showing this palette';
    P.frame = f;
    $('poincare-host').appendChild(f);
    f.addEventListener('load', waitForPoincare);
}

function waitForPoincare() {
    const started = performance.now();
    const tick = () => {
        try {
            const w = P.frame.contentWindow, api = w && w.PoincareAPI;
            if (api && api.state().domain && api.setPalette) {
                P.win = w; P.api = api; P.glc = w.document.querySelector('#viz-container canvas');
                if (P.glc) { poincareReady(); return; }
            }
        } catch (e) { /* not ready, or a different origin */ }
        if (performance.now() - started > 30000) { $('poincare-msg').textContent = 'Poincaré did not load.'; return; }
        setTimeout(tick, 150);
    };
    tick();
}

function poincareReady() {
    P.ready = true;
    $('poincare-msg').hidden = true;
    P.api.setTheme(S.bg);
    P.api.setAutoRotate(true, 0.6);
    // thumbnails use Poincaré's opening view, as a visitor first sees it;
    // the live preview starts closer, since here the domain is the subject
    const { camera, controls } = P.api;
    P.pose = { pos: camera.position.clone(), target: controls.target.clone() };
    camera.position.sub(controls.target).multiplyScalar(0.62).add(controls.target);
    controls.update();
    const names = P.api.examples();
    const sel = $('group-select');
    sel.textContent = '';
    names.forEach((n, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = stripTags(n);
        sel.appendChild(o);
    });
    const fig8 = names.findIndex((n) => n === 'Figure eight knot group');
    const want = S.group ? names.indexOf(S.group) : -1;
    sel.value = String(want >= 0 ? want : Math.max(0, fig8));
    if (want >= 0 && want !== fig8) P.api.loadExample(want);
    P.domain = P.api.state().domain;
    pushPalette();
    // a new group means a new domain: recolor, re-frame, re-capture
    setInterval(() => {
        const d = P.api.state().domain;
        if (d && d !== P.domain) {
            P.domain = d;
            P.crop = null;
            pushPalette();
            scheduleThumbs();
        }
    }, 400);
    scheduleThumbs();
}

/** Show the working palette (or the hovered one) in Poincaré. */
function pushPalette(cheap = false) {
    refreshPreview(cheap);
}

function refreshPoincare(cheap) {
    if (!P.ready) return;
    const colors = shown(current());
    if (colors.length < 2) return;
    if (cheap) P.api.previewPalette(colors); else P.api.setPalette(colors, 'Studio');
    P.classes = P.api.faceClassCount();
}

/** The face area of the Poincaré canvas, found once per domain and theme. */
function findCrop() {
    const src = P.glc, W = src.width, H = src.height;
    const s = 200 / Math.max(W, H);
    const c = document.createElement('canvas');
    c.width = Math.round(W * s); c.height = Math.round(H * s);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    P.api.renderNow();
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const bg = [d[0], d[1], d[2]];
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
            const k = (y * c.width + x) * 4;
            if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 30) {
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
    let cx = (x0 + x1) / 2 / s, cy = (y0 + y1) / 2 / s;
    let w = (x1 - x0 + 1) / s * 1.16, h = (y1 - y0 + 1) / s * 1.16;
    // the card's 4:3
    if (w / h > 4 / 3) h = w * 3 / 4; else w = h * 4 / 3;
    w = Math.min(w, W); h = Math.min(h, H);
    return { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h), w, h };
}

let thumbJob = 0;
function scheduleThumbs() {
    const job = ++thumbJob;
    const cards = [...$('grid').children];
    if (S.thumbs === 'tiling' || !P.ready) {
        const bg = S.bg === 'light' ? '#eef1f8' : '#05070f';
        cards.forEach((card, i) => {
            const cv = card.querySelector('canvas'), ctx = cv.getContext('2d');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, cv.width, cv.height);
            paintTiling(ctx, tilingThumb, shown(S.suggestions[i].colors), { x: (cv.width - cv.height * 1.04) / 2, y: -cv.height * 0.02, size: cv.height * 1.04, bg, gap: 1 });
        });
        return;
    }
    requestAnimationFrame(() => captureFrom(job, 0));
}

function captureFrom(job, start) {
    if (job !== thumbJob || !P.ready) return;
    const cards = [...$('grid').children];
    const api = P.api, controls = api.controls, camera = api.camera;
    if (start === 0) {
        P.spin = controls.autoRotate;
        controls.autoRotate = false;
    }
    const was = { pos: camera.position.clone(), target: controls.target.clone() };
    const pose = (p) => { camera.position.copy(p.pos); controls.target.copy(p.target); camera.lookAt(p.target); camera.updateMatrixWorld(); };
    if (P.pose) pose(P.pose);
    try {
        if (!P.crop || P.crop.W !== P.glc.width || P.crop.H !== P.glc.height) P.crop = { ...findCrop(), W: P.glc.width, H: P.glc.height };
        const { x, y, w, h } = P.crop;
        // Poincaré's canvas is transparent where there is no domain
        const bg = S.bg === 'light' ? '#eef1f8' : '#05070f';
        const end = Math.min(start + 6, cards.length);
        for (let i = start; i < end; i++) {
            api.previewPalette(shown(S.suggestions[i].colors));
            api.renderNow();
            const cv = cards[i].querySelector('canvas'), ctx = cv.getContext('2d');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.drawImage(P.glc, x, y, w, h, 0, 0, cv.width, cv.height);
        }
        // put the view and the working palette back before this frame is shown
        pose(was);
        api.previewPalette(shown(current()));
        api.renderNow();
        if (end < cards.length) { setTimeout(() => captureFrom(job, end), 0); return; }
    } catch (e) {
        pose(was);
        console.warn('[studio] thumbnail capture failed', e);
    }
    controls.autoRotate = P.spin;
}

// ---------------- previews ----------------

function refreshPreview(cheap = false) {
    refreshPoincare(cheap);
    if (S.tab === 'tiling') drawTiling();
    if (S.tab === 'chart') drawChart();
    previewNote();
}

function previewNote() {
    const n = current().length;
    let t = '';
    if (S.tab === 'poincare') {
        if (!P.ready) t = '';
        else if (P.classes <= n) t = `${P.classes} pairs of faces, so colors 1–${P.classes} show. Drag to turn it.`;
        else t = `${P.classes} pairs of faces but ${n} colors: after color ${n} they repeat lighter, then darker.`;
    } else if (S.tab === 'tiling') {
        t = 'The {7,3} tiling: color 1 in the middle, then rings of the palette.';
    } else {
        t = 'Bars and lines in palette order, as a chart library would use them.';
    }
    $('preview-note').textContent = t;
}

function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return [w, h];
}

function drawTiling() {
    const cv = $('tiling-canvas'), [w, h] = sizeCanvas(cv), ctx = cv.getContext('2d');
    const bg = S.bg === 'light' ? '#ffffff' : '#0b0e15';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const size = Math.min(w, h) * 0.94;
    paintTiling(ctx, tilingBig, shown(current()), { x: (w - size) / 2, y: (h - size) / 2, size, bg, gap: Math.max(1, size / 420) });
}

function drawChart() {
    const colors = shown(current()), n = colors.length;
    const dark = S.bg === 'dark';
    const bg = dark ? '#0b0e15' : '#ffffff', ink = dark ? '#c9cfdb' : '#3d4049', grid = dark ? '#232838' : '#e8eaee';
    const W = 640, H = 460, padL = 40, padR = 18;
    // deterministic, plausible data
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const groups = ['Q1', 'Q2', 'Q3', 'Q4'];
    const bars = groups.map(() => colors.map(() => 0.25 + 0.75 * rnd()));
    const lines = colors.map((_, k) => { let v = 0.3 + 0.4 * rnd(); return Array.from({ length: 12 }, () => (v = clamp(v + (rnd() - 0.48) * 0.22, 0.05, 0.95))); });
    const legendRows = Math.ceil(n / 6);
    const top = 16 + legendRows * 20, mid = top + (H - top) * 0.47, base1 = mid - 14, top2 = mid + 18, base2 = H - 22;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" font-family="Atkinson Hyperlegible, sans-serif" font-size="12">`;
    svg += `<rect width="${W}" height="${H}" fill="${bg}"/>`;
    colors.forEach((c, k) => {
        const x = padL + (k % 6) * 96, y = 14 + Math.floor(k / 6) * 20;
        svg += `<rect x="${x}" y="${y}" width="12" height="12" rx="3" fill="${c}"/><text x="${x + 18}" y="${y + 10.5}" fill="${ink}">Series ${k + 1}</text>`;
    });
    for (let g = 0; g <= 4; g++) {
        const y = base1 - (base1 - top) * g / 4;
        svg += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="${grid}"/>`;
    }
    const gw = (W - padL - padR) / groups.length, bw = Math.min(22, (gw - 20) / n);
    groups.forEach((gname, g) => {
        const x0 = padL + g * gw + (gw - bw * n) / 2;
        bars[g].forEach((v, k) => {
            const hgt = (base1 - top) * v;
            svg += `<rect x="${x0 + k * bw + 1}" y="${base1 - hgt}" width="${bw - 2}" height="${hgt}" rx="2.5" fill="${colors[k]}"/>`;
        });
        svg += `<text x="${padL + g * gw + gw / 2}" y="${base1 + 15}" fill="${ink}" text-anchor="middle">${gname}</text>`;
    });
    for (let g = 0; g <= 3; g++) {
        const y = base2 - (base2 - top2) * g / 3;
        svg += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="${grid}"/>`;
    }
    lines.forEach((vals, k) => {
        const pts = vals.map((v, i) => `${padL + (W - padL - padR) * i / 11},${base2 - (base2 - top2) * v}`).join(' ');
        svg += `<polyline points="${pts}" fill="none" stroke="${colors[k]}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    svg += '</svg>';
    $('chart').innerHTML = svg;
}

function setTab(tab) {
    S.tab = tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    $('group-field').hidden = tab !== 'poincare';
    if (tab === 'poincare') ensurePoincare();
    refreshPreview();
    persist();
}

function setBg(bg) {
    S.bg = bg;
    document.querySelectorAll('[data-bg]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.bg === bg ? 'true' : 'false'));
    $('poincare-host').classList.toggle('light', bg === 'light');
    document.querySelectorAll('.card-thumb').forEach((t) => t.classList.toggle('light', bg === 'light'));
    if (P.ready) { P.api.setTheme(bg); P.crop = null; }
    refreshPreview();
    // the theme change lands on the next frame
    requestAnimationFrame(() => requestAnimationFrame(scheduleThumbs));
    persist();
}

// ---------------- sidebar ----------------

function renderContext() {
    document.querySelectorAll('[data-ctx]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ctx === S.ctx ? 'true' : 'false'));
    $('ctx-note').textContent = CONTEXTS[S.ctx].note;
    $('n-out').textContent = String(S.n);
    $('fit-toggle').checked = S.fit;
    $('steer-light').value = S.steer.light;
    $('steer-vivid').value = S.steer.vivid;
}

/** The preview and thumbnails that suit a context. */
const VIEW_FOR = { poincare: ['poincare', 'poincare'], chart: ['chart', 'tiling'], ui: ['tiling', 'tiling'], free: ['tiling', 'tiling'] };
function setThumbs(t) {
    S.thumbs = t;
    document.querySelectorAll('[data-thumbs]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.thumbs === S.thumbs ? 'true' : 'false'));
    if (S.thumbs === 'poincare') ensurePoincare();
}

function setContext(ctx) {
    const prev = CONTEXTS[S.ctx];
    S.ctx = ctx;
    renderContext();
    setThumbs(VIEW_FOR[ctx][1]);
    setTab(VIEW_FOR[ctx][0]);
    if (S.n === prev.n && CONTEXTS[ctx].n !== S.n) setN(CONTEXTS[ctx].n);
    else regenerate();
    persist();
}

function setN(n) {
    n = clamp(n, 2, 12);
    if (n === S.n) return;
    if (n < S.n) {
        S.colors = S.colors.slice(0, n);
        S.locked = S.locked.slice(0, n);
    } else {
        // keep every color and let the engine fill the new slots
        const locked = S.colors.map((hex, slot) => ({ slot, hex }));
        const best = suggest({ locked, n, ctx: CONTEXTS[S.ctx], scorer, sources: S.sources.size ? S.sources : new Set(SOURCE_KEYS), steerBy: S.steer, fit: S.fit, count: 1, seed: S.round })[0];
        S.colors = best ? best.colors : [...S.colors, ...Array(n - S.colors.length).fill('#888888')];
        S.locked = Array.from({ length: n }, (_, i) => !!S.locked[i]);
    }
    S.n = n;
    $('n-out').textContent = String(n);
    renderStrip();
    pushPalette();
    regenerate();
    persist();
}

function renderSources() {
    const box = $('source-chips');
    box.textContent = '';
    for (const k of SOURCE_KEYS) {
        const b = document.createElement('button');
        b.className = 'chip';
        b.type = 'button';
        b.setAttribute('aria-pressed', S.sources.has(k) ? 'true' : 'false');
        b.title = k === 'harmony' ? 'Classic hue harmonies with a real palette\'s lightness rhythm' : `${SOURCES[k].label}: ${SOURCES[k].note}`;
        b.innerHTML = `${escapeHtml(SOURCE_LABEL[k])}${SOURCE_COUNT[k] ? `<span class="count">${SOURCE_COUNT[k]}</span>` : ''}`;
        b.addEventListener('click', () => {
            if (S.sources.has(k)) S.sources.delete(k); else S.sources.add(k);
            renderSources();
            regenSoon(150);
            persist();
        });
        box.appendChild(b);
    }
    $('source-credits').innerHTML = 'Sources: ' + Object.values(SOURCES).filter((s) => s.url)
        .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.label)}</a> (${escapeHtml(s.license)})`).join(', ') +
        '; plus Okabe–Ito, Paul Tol, Tableau, Observable, ColorBrewer, Flexoki, IBM, and the accent sets of Nord, Solarized, Catppuccin, Gruvbox, Dracula, Rosé Pine, Tokyo Night, Kanagawa, Everforest, One Dark and Monokai.';
}

function renderTaste() {
    const likes = ratings.filter((r) => r.like).length, dislikes = ratings.length - likes;
    $('taste-note').textContent = ratings.length
        ? `${likes} saved, ${dislikes} turned down. ${S.useTaste ? 'New rounds rank with them.' : 'Rankings ignore them for now.'}`
        : 'Save palettes you like and turn down the ones you don\'t: the ranking learns from both.';
    $('taste-toggle').checked = S.useTaste;
    $('taste-reset').hidden = !ratings.length;
}

function renderSaved() {
    const box = $('saved');
    box.textContent = '';
    if (!saved.length) {
        box.innerHTML = '<p class="saved-empty">Nothing saved yet.</p>';
        return;
    }
    saved.slice(0, 30).forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'saved-item';
        row.innerHTML = `<button class="strip-btn" type="button" title="${escapeHtml(p.name || 'saved palette')}: use it">${shown(p.colors).map((c) => `<span style="background:${c}"></span>`).join('')}</button>
            <button class="icon-btn small" type="button" aria-label="Remove" title="Remove"><svg class="i"><use href="#i-x"/></svg></button>`;
        row.querySelector('.strip-btn').addEventListener('click', () => {
            if (p.colors.length !== S.n) {
                S.n = p.colors.length;
                $('n-out').textContent = String(S.n);
            }
            S.locked = p.colors.map(() => false);
            setColors(p.colors, { name: p.name || 'saved' });
            regenerate();
        });
        row.querySelector('.icon-btn').addEventListener('click', () => {
            saved.splice(i, 1);
            store.set('saved', saved);
            renderSaved();
            renderStrip();
        });
        box.appendChild(row);
    });
}

function studioLink() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('c', S.colors.map((c) => c.slice(1)).join('-'));
    const lock = S.locked.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
    if (lock.length) u.searchParams.set('lock', lock.join(','));
    if (S.ctx !== 'poincare') u.searchParams.set('ctx', S.ctx);
    return u.toString();
}

function renderExport() {
    if (!S.colors) return;
    const c = S.colors;
    const text = {
        hex: c.join('\n'),
        css: `:root {\n${c.map((x, i) => `  --color-${i + 1}: ${x};`).join('\n')}\n}`,
        js: `const palette = [${c.map((x) => `'${x}'`).join(', ')}];`,
        link: studioLink(),
    }[S.fmt];
    $('export-code').textContent = text;
    document.querySelectorAll('[data-fmt]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fmt === S.fmt ? 'true' : 'false'));
}

// ---------------- wiring ----------------

document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => setBg(b.dataset.bg)));
document.querySelectorAll('[data-ctx]').forEach((b) => b.addEventListener('click', () => setContext(b.dataset.ctx)));
document.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => { S.fmt = b.dataset.fmt; renderExport(); }));
document.querySelectorAll('[data-thumbs]').forEach((b) => b.addEventListener('click', () => {
    setThumbs(b.dataset.thumbs);
    scheduleThumbs();
    persist();
}));

$('n-minus').addEventListener('click', () => setN(S.n - 1));
$('n-plus').addEventListener('click', () => setN(S.n + 1));
$('fit-toggle').addEventListener('change', (e) => { S.fit = e.target.checked; regenSoon(80); persist(); });
for (const [id, key] of [['steer-light', 'light'], ['steer-vivid', 'vivid']]) {
    const el = $(id);
    el.addEventListener('input', () => { S.steer[key] = +el.value; regenSoon(350); persist(); });
    el.addEventListener('dblclick', () => { el.value = 0; S.steer[key] = 0; regenSoon(60); persist(); });
}
$('taste-toggle').addEventListener('change', (e) => { S.useTaste = e.target.checked; retrain(); regenSoon(60); persist(); });
$('taste-reset').addEventListener('click', () => {
    ratings = [];
    store.set('ratings', ratings);
    retrain();
    toast('Ratings forgotten. Saved palettes stay.');
    regenSoon(60);
});
$('regen').addEventListener('click', () => regenerate());
$('back-btn').addEventListener('click', () => regenerate());
$('like-working').addEventListener('click', () => {
    const liked = saved.some((p) => sameColors(p.colors, S.colors));
    if (liked) {
        saved = saved.filter((p) => !sameColors(p.colors, S.colors));
        store.set('saved', saved);
        renderSaved(); renderStrip();
        toast('Unsaved.');
    } else {
        rate(S.colors, true, S.name || 'custom');
        toast('Saved. The ranking leans toward palettes like it.');
    }
    renderGrid();
});
$('group-select').addEventListener('change', (e) => {
    if (!P.ready) return;
    const i = +e.target.value;
    S.group = P.api.examples()[i];
    P.api.loadExample(i);
    persist();
});
$('cvd-select').addEventListener('change', (e) => {
    S.cvd = e.target.value;
    renderStrip();
    renderGrid();
    renderSaved();
    refreshPreview();
});
$('copy-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('export-code').textContent); toast('Copied.'); }
    catch (e) { toast('Copy failed: select the text instead.'); }
});
$('use-poincare').addEventListener('click', () => {
    try { localStorage.setItem(POINCARE_KEY, JSON.stringify({ colors: S.colors, name: S.name || 'custom', t: Date.now() })); } catch (e) { /* blocked */ }
    window.open(POINCARE_URL, '_blank', 'noopener');
    toast('Poincaré will open with this palette.');
});

// theme
function renderThemeBtn() {
    const dark = document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const b = $('theme-btn');
    b.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    b.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.setAttribute('aria-label', b.title);
    return dark;
}
$('theme-btn').addEventListener('click', () => {
    const dark = renderThemeBtn();
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('designStudio.theme', document.documentElement.dataset.theme); } catch (e) { /* blocked */ }
    renderThemeBtn();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeBtn);

// keys
document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (e.key === 'Escape') {
        if (editing >= 0) { closeEditor(true); return; }
        if (S.mode === 'vary') { regenerate(); return; }
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) {
        if (editing >= 0 && e.key === 'Enter') closeEditor(true);
        return;
    }
    if (e.key === ' ') { e.preventDefault(); regenerate(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = S.suggestions.length;
        if (!n) return;
        const step = e.key === 'ArrowRight' ? 1 : -1;
        select(S.selected < 0 ? (step > 0 ? 0 : n - 1) : (S.selected + step + n) % n, true);
    } else if (e.key === 'h' || e.key === 'H') { $('like-working').click(); }
    else if ((e.key === 'x' || e.key === 'X') && S.selected >= 0) {
        cardAction('dislike', S.selected);
        if (S.selected < S.suggestions.length - 1) select(S.selected + 1, true);
    } else if (/^[1-9]$/.test(e.key) && +e.key <= S.n) { toggleLock(+e.key - 1); }
});

let resizeTimer = 0;
addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { P.crop = null; refreshPreview(); scheduleThumbs(); }, 200);
});

// ---------------- start ----------------

$('corpus-count').textContent = CORPUS.length.toLocaleString('en-US');
renderThemeBtn();
renderContext();
renderSources();
retrain();
renderSaved();
setThumbs(S.thumbs);
if (S.colors) renderStrip();
setBg(S.bg);
setTab(S.tab);
regenerate();

// for debugging and for the tests
window.studio = { S, scorer, regenerate, select, P };
