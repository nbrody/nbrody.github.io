// One renderer for the editor canvas, the slide thumbnails and the exported
// fullPage.js document, so the deck you edit is the deck you present.
//
// ctx = { mode: 'edit' | 'thumb' | 'export', deck, macros, macroKey }

import { cssColor, cssFont, themeVars, googleFontURL, FONT_ROLES } from './themes.js';
import { renderMathInHTML, renderTeX, escapeHTML } from './math.js';
import { htmlIsEmpty, inert, sanitizeHTML, safeURL } from './model.js';

const esc = escapeHTML;
const SHADOWS = {
  none: '',
  soft: '0 10px 30px rgba(0,0,0,.18)',
  lifted: '0 22px 60px rgba(0,0,0,.38)',
  glow: '0 0 44px color-mix(in srgb, var(--pz-accent) 60%, transparent)',
};
export const SHADOW_NAMES = { none: 'None', soft: 'Soft', lifted: 'Lifted', glow: 'Glow' };
export const ANIMS = { fade: 'Fade in', rise: 'Rise', zoom: 'Zoom', wipe: 'Wipe', drop: 'Drop' };

// Relative URLs in a folder deck (assets/plot.png, ../Calc/index.html) are
// files beside it. The exported file keeps them relative; the editor shows
// them through whoever holds the folder (alphaCentaur: see main.js).
let resolver = null;
export function setURLResolver(fn) { resolver = fn; }
export const isRelativeURL = u => !!u && !/^(?:[a-z][\w+.-]*:|\/\/|\/|#)/i.test(u);
// ctx.resolve: an export that will be shown from somewhere else (presenting
// inside alphaCentaur), so relative URLs become the host's absolute ones.
export function viewURL(ctx, url, kind = 'image') {
  return (ctx.mode !== 'export' || ctx.resolve) && resolver && isRelativeURL(url) ? resolver(url, kind) : url;
}
export function assetURL(ctx, id) {
  const a = id && ctx.deck.assets[id];
  return a ? a.data || viewURL(ctx, a.path || '', 'image') : '';
}

function geometry(el) {
  let s = `left:${r(el.x)}px;top:${r(el.y)}px;width:${r(el.w)}px;height:${r(el.h)}px;`;
  if (el.rot) s += `transform:rotate(${r(el.rot)}deg);`;
  if (el.opacity != null && el.opacity < 1) s += `opacity:${el.opacity};`;
  return s;
}
const r = v => Math.round(v * 100) / 100;

function boxDecor(el) {
  let s = '';
  if (el.fill && el.fill !== 'none') s += `background:${cssColor(el.fill)};`;
  if (el.strokeW > 0 && el.stroke && el.stroke !== 'none') s += `border:${el.strokeW}px solid ${cssColor(el.stroke)};`;
  if (el.radius) s += `border-radius:${el.radius}px;`;
  return s;
}

// Everything that goes on the element's own style attribute.
export function elementStyle(el) {
  let s = geometry(el);
  const shadow = SHADOWS[el.shadow] || '';
  switch (el.type) {
    case 'text': {
      s += `font-family:${cssFont(el.font)};font-size:${el.size}px;color:${cssColor(el.color)};font-weight:${el.weight};`
        + `line-height:${el.lh};letter-spacing:${el.ls || 0}em;text-align:${el.align};padding:${el.pad || 0}px;`
        + `justify-content:${{ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign] || 'flex-start'};`;
      if (el.italic) s += 'font-style:italic;';
      if (el.upper) s += 'text-transform:uppercase;';
      s += boxDecor(el);
      if (shadow) s += (el.fill && el.fill !== 'none') ? `box-shadow:${shadow};` : `text-shadow:${shadow};`;
      break;
    }
    case 'math':
      s += `font-size:${el.size}px;color:${cssColor(el.color)};justify-content:${{ left: 'flex-start', center: 'center', right: 'flex-end' }[el.align] || 'center'};`
        + `padding:${el.pad || 0}px;` + boxDecor(el);
      if (shadow) s += (el.fill && el.fill !== 'none') ? `box-shadow:${shadow};` : `filter:drop-shadow(${shadowForFilter(el.shadow)});`;
      break;
    case 'shape':
      if (shadow) s += `filter:drop-shadow(${shadowForFilter(el.shadow)});`;
      break;
    default:
      s += boxDecor(el);
      if (shadow) s += `box-shadow:${shadow};`;
  }
  return s;
}
function shadowForFilter(name) {
  return { soft: '0 8px 18px rgba(0,0,0,.22)', lifted: '0 16px 32px rgba(0,0,0,.4)', glow: '0 0 26px color-mix(in srgb, var(--pz-accent) 70%, transparent)' }[name] || 'none';
}

// A key that changes exactly when the element's inner markup must be rebuilt.
export function innerKey(el, ctx) {
  switch (el.type) {
    case 'text': return 't' + ctx.macroKey + (ctx.mode === 'edit' && htmlIsEmpty(el.html) ? '\u0001' + el.placeholder : el.html);
    case 'math': return 'm' + ctx.macroKey + el.tex;
    case 'image': return 'i' + (el.asset || el.src) + el.fit + (el.alt || '');
    case 'shape': return ['s', el.shape, el.w, el.h, el.fill, el.stroke, el.strokeW, el.radius, el.dash, el.head].join('|');
    case 'embed': return 'e' + el.src;
    case 'applet': return 'a' + el.code + themeKey(ctx.deck);
    default: return '';
  }
}
const themeKey = deck => JSON.stringify(deck.theme);

export function elementInner(el, ctx) {
  switch (el.type) {
    case 'text': {
      if (htmlIsEmpty(el.html)) {
        return ctx.mode === 'edit' && el.placeholder ? `<div class="pz-text-body pz-ph">${esc(el.placeholder)}</div>` : '<div class="pz-text-body"></div>';
      }
      let html = renderMathInHTML(sanitizeHTML(el.html), ctx.macros, ctx.macroKey);
      if (ctx.mode === 'export' && el.buildBy === 'paragraph' && el.build > 0) html = paragraphBuilds(html, el);
      return `<div class="pz-text-body">${html}</div>`;
    }
    case 'math':
      return `<div class="pz-math-box">${renderTeX(el.tex || '', true, ctx.macros, ctx.macroKey)}</div>`;
    case 'image': {
      const url = el.asset ? assetURL(ctx, el.asset) : viewURL(ctx, safeURL(el.src, { images: true }), 'image');
      if (!url) return ctx.mode === 'edit' ? placeholderCard('image', 'Double-click to choose an image') : '';
      return `<img src="${esc(url)}"${el.asset ? ` data-asset="${esc(el.asset)}"` : ''} alt="${esc(el.alt || '')}" draggable="false" style="object-fit:${el.fit === 'fill' ? 'fill' : el.fit}">`;
    }
    case 'shape': return shapeSVG(el);
    case 'embed': {
      const src = embedURL(el.src);
      if (!src) return ctx.mode === 'edit' ? placeholderCard('embed', 'Set a web address in the Format panel') : '';
      // A relative address is a page in the project (a linked app).
      const label = isRelativeURL(src) ? src.replace(/^(?:\.\.?\/)+/, '').replace(/\/index\.html?$/i, '') : hostOf(src);
      if (ctx.mode === 'thumb') return placeholderCard('embed', label);
      const url = viewURL(ctx, src, 'frame');
      if (!url) return ctx.mode === 'edit' ? placeholderCard('embed', `${label} · shows on the computer running alphaCentaur`) : '';
      const attr = ctx.mode === 'export' ? 'data-pz-src' : 'src';
      return `<iframe ${attr}="${esc(url)}" allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="eager" title="${esc(label)}"></iframe>` + (ctx.mode === 'edit' ? '<div class="pz-shield"></div>' : '');
    }
    case 'applet': {
      if (ctx.mode === 'thumb') return placeholderCard('applet', el.name || 'Applet');
      const doc = appletDoc(el.code || '', ctx.deck, { fonts: !ctx.offline });
      const attr = ctx.mode === 'export' ? 'data-pz-srcdoc' : 'srcdoc';
      return `<iframe ${attr}="${esc(doc)}" sandbox="allow-scripts allow-popups allow-modals allow-pointer-lock allow-downloads" title="${esc(el.name || 'Applet')}"></iframe>` + (ctx.mode === 'edit' ? '<div class="pz-shield"></div>' : '');
    }
  }
  return '';
}

const ICONS = {
  image: '<path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 4 4 2-2 5 5"/>',
  embed: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.8 2.6 14.2 0 17M12 3.5c-2.6 2.8-2.6 14.2 0 17"/>',
  applet: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
};
function placeholderCard(kind, label) {
  return `<div class="pz-card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg><span>${esc(label)}</span></div>`;
}
const hostOf = u => { try { return new URL(u).host || u; } catch { return u; } };

export function embedURL(src) {
  src = safeURL(src);
  if (!src) return '';
  const yt = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/.exec(src);
  if (yt) {
    const t = /[?&]t=(\d+)/.exec(src);
    return `https://www.youtube.com/embed/${yt[1]}${t ? '?start=' + t[1] : ''}`;
  }
  const vimeo = /vimeo\.com\/(\d+)/.exec(src);
  if (vimeo && !/player\.vimeo/.test(src)) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (!/^[a-z]+:/i.test(src) && !src.startsWith('/') && !src.startsWith('.')) return 'https://' + src;
  return src;
}

function shapeSVG(el) {
  const { w, h } = el, sw = el.strokeW > 0 && el.stroke !== 'none' ? el.strokeW : 0;
  const fill = `fill:${cssColor(el.fill)}`, stroke = sw ? `;stroke:${cssColor(el.stroke)};stroke-width:${sw}` : '';
  const dash = sw && el.dash === 'dashed' ? `;stroke-dasharray:${sw * 3} ${sw * 2}` : sw && el.dash === 'dotted' ? `;stroke-dasharray:0 ${sw * 2};stroke-linecap:round` : '';
  const style = `${fill}${stroke}${dash};stroke-linejoin:round`;
  let body = '';
  const hs = sw / 2;
  switch (el.shape) {
    case 'ellipse': body = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - hs)}" ry="${Math.max(0, h / 2 - hs)}" style="${style}"/>`; break;
    case 'triangle': body = `<polygon points="${w / 2},${hs} ${w - hs},${h - hs} ${hs},${h - hs}" style="${style}"/>`; break;
    case 'diamond': body = `<polygon points="${w / 2},${hs} ${w - hs},${h / 2} ${w / 2},${h - hs} ${hs},${h / 2}" style="${style}"/>`; break;
    case 'line': case 'arrow': {
      const lw = Math.max(1, el.strokeW || 1), color = cssColor(el.stroke === 'none' ? 'text' : el.stroke);
      const hl = Math.max(16, lw * 3.4), hw = Math.max(12, lw * 2.6), y = h / 2;
      const head = el.shape === 'arrow' ? (el.head || 'end') : 'none';
      const x0 = head === 'both' || head === 'start' ? hl * 0.9 : 0, x1 = head === 'both' || head === 'end' ? w - hl * 0.9 : w;
      const ld = el.dash === 'dashed' ? `;stroke-dasharray:${lw * 3} ${lw * 2}` : el.dash === 'dotted' ? `;stroke-dasharray:0 ${lw * 2}` : '';
      body = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" style="stroke:${color};stroke-width:${lw};stroke-linecap:${el.dash === 'dotted' ? 'round' : 'butt'}${ld}"/>`;
      if (head === 'end' || head === 'both') body += `<polygon points="${w},${y} ${w - hl},${y - hw / 2} ${w - hl},${y + hw / 2}" style="fill:${color}"/>`;
      if (head === 'start' || head === 'both') body += `<polygon points="0,${y} ${hl},${y - hw / 2} ${hl},${y + hw / 2}" style="fill:${color}"/>`;
      break;
    }
    default: {
      const rx = Math.min(el.radius || 0, (w - sw) / 2, (h - sw) / 2);
      body = `<rect x="${hs}" y="${hs}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" rx="${Math.max(0, rx)}" style="${style}"/>`;
    }
  }
  return `<svg class="pz-shape-svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`;
}

// For "build by paragraph": number each top-level block (or list item).
function paragraphBuilds(html, el) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  let step = el.build;
  for (const child of [...tpl.content.children]) {
    const items = /^(UL|OL)$/.test(child.tagName) ? [...child.children] : [child];
    for (const it of items) { it.setAttribute('data-build', step++); it.setAttribute('data-anim', el.anim || 'fade'); }
    if (!items.length) child.setAttribute('data-build', step++);
  }
  return tpl.innerHTML;
}
export function buildSteps(el) {
  if (!el.build) return 0;
  if (el.type === 'text' && el.buildBy === 'paragraph') {
    let n = 0;
    for (const c of inert(el.html).children) n += /^(UL|OL)$/.test(c.tagName) ? c.children.length : 1;
    return Math.max(1, n);
  }
  return 1;
}

export function renderElement(el, ctx) {
  if (ctx.mode !== 'edit') {
    if (el.type === 'text' && htmlIsEmpty(el.html)) return '';
    if (el.type === 'image' && !el.asset && !el.src) return '';
    if (el.type === 'embed' && !el.src) return '';
  }
  const inner = elementInner(el, ctx);
  let attrs = `class="pz-el pz-${esc(el.type)}${el.type === 'shape' ? ' pz-shape-' + esc(el.shape) : ''}" data-id="${esc(el.id)}"`;
  if (ctx.mode === 'export' && el.build > 0 && !(el.type === 'text' && el.buildBy === 'paragraph')) attrs += ` data-build="${Number(el.build) || 0}" data-anim="${esc(el.anim || 'fade')}"`;
  return `<div ${attrs} style="${esc(elementStyle(el))}">${inner}</div>`;
}

export function backgroundCSS(slide) {
  const bg = slide.bg || { kind: 'theme' };
  if (bg.kind === 'color') return cssColor(bg.color || 'bg');
  if (bg.kind === 'gradient') return `linear-gradient(${bg.angle ?? 135}deg, ${cssColor(bg.color || 'bg')}, ${cssColor(bg.color2 || 'surface')})`;
  return 'var(--pz-bg)';
}

export function renderBackground(slide, ctx) {
  const bg = slide.bg || { kind: 'theme' };
  let inner = '';
  if (bg.kind === 'image' && bg.asset && assetURL(ctx, bg.asset)) {
    inner = `<img class="pz-bg-img" src="${esc(assetURL(ctx, bg.asset))}" data-asset="${esc(bg.asset)}" alt="" draggable="false" style="object-fit:${bg.fit || 'cover'}">`;
    if (bg.dim) inner += `<div class="pz-bg-dim" style="background:${bg.dimColor === 'light' ? 'rgba(255,255,255,' : 'rgba(0,0,0,'}${bg.dim})"></div>`;
  }
  return `<div class="pz-bg" style="background:${esc(backgroundCSS(slide))}">${inner}</div>`;
}

export function renderSlide(slide, ctx) {
  return renderBackground(slide, ctx) + slide.elements.map(e => renderElement(e, ctx)).join('');
}

// Fonts the deck actually needs.
export function usedFonts(deck) {
  const set = new Set(FONT_ROLES.map(r => deck.theme.fonts[r]));
  for (const s of deck.slides) for (const e of s.elements) if (e.type === 'text' && e.font && !FONT_ROLES.includes(e.font)) set.add(e.font);
  return [...set].filter(Boolean);
}
export function fontLinks(families) {
  return families.map(googleFontURL).filter(Boolean).map(u => `<link rel="stylesheet" href="${esc(u)}">`).join('\n');
}

// The document an applet runs in: theme variables, base styles, and the
// iframeNav contract so arrow keys pressed inside an applet still advance the
// deck (unless the applet handled them itself).
// The applet side of the phone remote. An applet declares parameters, which
// the editor reads from its code (remote-model.js) and the phone controls:
//   const speed = pz.slider('speed', { min: 0, max: 5, value: 1, label: 'Speed' }, v => …);
//   pz.toggle('trails', { value: true }, on => …);  pz.button('reset', () => …);
//   pz.joystick('tilt', ({ x, y }) => …);           // x, y in [-1, 1], y up
// Values arrive as postMessage from the deck (or the editor's remote preview).
const APPLET_API = `<script>(function(){var subs={},vals={},decl={};
function fire(n,v){(subs[n]||[]).forEach(function(f){try{f(v)}catch(e){console.error(e)}})}
addEventListener('message',function(e){var d=e.data||{};if(e.source!==parent||typeof d.name!=='string')return;
if(d.type==='pz-param'){vals[d.name]=d.value;fire(d.name,d.value)}
else if(d.type==='pz-joystick'){var p={x:+d.x||0,y:+d.y||0};vals[d.name]=p;fire(d.name,p)}
else if(d.type==='pz-button')fire(d.name,true)});
function reg(t){return function(n,o,f){if(typeof o==='function'){f=o;o={}}o=o||{};decl[n]=Object.assign({type:t},o);if(f)(subs[n]||(subs[n]=[])).push(f);
if(!(n in vals))vals[n]=t==='joystick'?{x:0,y:0}:o.value!==undefined?o.value:t==='slider'?(o.min||0):t==='toggle'?false:undefined;return vals[n]}}
window.pz={slider:reg('slider'),toggle:reg('toggle'),button:reg('button'),joystick:reg('joystick'),
on:function(n,f){(subs[n]||(subs[n]=[])).push(f)},value:function(n){return vals[n]},params:decl};
addEventListener('load',function(){try{parent.postMessage({type:'pz-applet-ready'},'*')}catch(e){}})})();<\/script>`;

export function appletDoc(code, deck, { fonts = true } = {}) {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${fonts ? fontLinks([...new Set(Object.values(deck.theme.fonts))]) : ''}
<style>:root{${themeVars(deck.theme)}}html,body{margin:0;height:100%}body{background:transparent;color:var(--pz-text);font-family:var(--pz-font-body);overflow:hidden}</style>
<script>addEventListener('keydown',function(e){if(e.defaultPrevented||(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')))return;var d={ArrowRight:'next',PageDown:'next',' ':'next',ArrowLeft:'prev',PageUp:'prev'}[e.key];if(e.key==='Escape')d='exit';if(d){e.preventDefault();parent.postMessage({type:'iframeNav',direction:d},'*');}});<\/script>
${APPLET_API}`;
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, m => m + head);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, m => m + '<head>' + head + '</head>');
  return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`;
}
