// ui.js — small page helpers: KaTeX, the status banner, modals, folds, theme colors.

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function tex(s, display = false) {
    try { return window.katex.renderToString(String(s), { throwOnError: false, displayMode: display }); } catch { return esc(s); }
}
/** Prose with $…$ math. */
export const mix = (s) => String(s).split(/(\$[^$]*\$)/g)
    .map((part) => (part.startsWith('$') && part.endsWith('$') && part.length > 1 ? tex(part.slice(1, -1)) : esc(part))).join('');
/** Render every [data-tex] element inside root. */
export function renderTexIn(root = document) {
    root.querySelectorAll('[data-tex]').forEach((el) => { el.innerHTML = tex(el.dataset.tex); });
}

export const fmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '\\infty');
/** A complex number as TeX, a ± bi. */
export function cTex(z, d = 4) {
    if (!z) return '';
    const re = Math.abs(z.re) < 0.5 * 10 ** -d ? 0 : z.re;
    const im = Math.abs(z.im) < 0.5 * 10 ** -d ? 0 : z.im;
    if (im === 0) return fmt(re, d);
    const imS = `${fmt(Math.abs(im), d)}\\,i`;
    if (re === 0) return (im < 0 ? '-' : '') + imS;
    return `${fmt(re, d)} ${im < 0 ? '-' : '+'} ${imS}`;
}
/** Census and knot names as TeX: 5_2 → 5_2, L5a1 stays, m003 roman. */
export function nameTex(name) {
    const d = /^(.*)-drill$/.exec(name);
    if (d) return `${nameTex(d[1])} \\setminus \\gamma`;
    const m = /^(\d+)_(\d+)$/.exec(name);
    if (m) return `${m[1]}_{${m[2]}}`;
    const k = /^(\d+)([an])(\d+)$/.exec(name);
    if (k) return `${k[1]}^{${k[2]}}_{${k[3]}}`;
    return `\\mathrm{${name.replace(/_/g, '\\_')}}`;
}
/** A slope p/q as TeX. */
export function slopeTex(p, q) {
    if (q === 0) return p === 0 ? '?' : '\\infty';
    if (q === 1) return String(p);
    return `${p < 0 ? '-' : ''}${Math.abs(p)}/${q}`;
}
/** A word in a, b, … (A = a⁻¹) as TeX with exponents: abbbaBAAB → a b^{3} a b^{-1} a^{-2} b^{-1}. */
export function wordTex(word, names = null) {
    if (!word) return '1';
    const out = [];
    let i = 0;
    while (i < word.length) {
        const ch = word[i];
        let j = i;
        while (j < word.length && word[j] === ch) j++;
        const k = j - i;
        const lower = ch.toLowerCase();
        const base = names ? names(lower) : lower;
        const e = (ch === lower ? 1 : -1) * k;
        out.push(e === 1 ? base : `${base}^{${e}}`);
        i = j;
    }
    return out.join('\\,');
}

// ---------------- status banner ----------------

let bannerTimer = null;
export function banner(msg, tone = 'info', { sticky = false } = {}) {
    const el = $('status-banner');
    clearTimeout(bannerTimer);
    if (!msg) { el.hidden = true; return; }
    el.className = `status-banner ${tone}`;
    $('status-text').innerHTML = msg;
    el.hidden = false;
    if (!sticky) bannerTimer = setTimeout(() => el.classList.add('collapsed'), 9000);
}
export function wireBanner() {
    $('status-close').addEventListener('click', (e) => { e.stopPropagation(); $('status-banner').classList.add('collapsed'); });
    $('status-banner').addEventListener('click', () => $('status-banner').classList.remove('collapsed'));
}

// ---------------- modals ----------------

export function openModal(id) {
    const m = $(id);
    m.hidden = false;
    m.querySelector('.modal-close')?.focus();
}
export function wireModals() {
    document.querySelectorAll('.modal').forEach((m) => {
        m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.hidden = true; });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; });
    });
}

// ---------------- theme ----------------

export const isLight = () => document.documentElement.classList.contains('light');
export function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
/** The categorical slots c1 … c8 of the current theme, as hex strings. */
export function palette() {
    return [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--c${i}`) || '#888888');
}
/** Linear interpolation between two hex colors. */
export function mixHex(a, b, t) {
    const pa = hexRGB(a), pb = hexRGB(b);
    const c = pa.map((x, i) => Math.round(255 * (x + (pb[i] - x) * t)));
    return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function hexRGB(h) {
    const x = String(h).trim().replace('#', '');
    const f = x.length === 3 ? x.split('').map((c) => c + c).join('') : x;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
}

// ---------------- tooltip ----------------

export function showTooltip(html, x, y) {
    const t = $('tooltip');
    t.innerHTML = html;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
}
export const hideTooltip = () => { $('tooltip').hidden = true; };
