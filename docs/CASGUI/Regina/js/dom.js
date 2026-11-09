// Small DOM helpers shared by the workspace views and the notebooks.
import { mathEl } from './tex.js';

export const $ = (s, r = document) => r.querySelector(s);

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('aria-') && v !== undefined && v !== null) { el.setAttribute(k, String(v)); continue; }
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Text with $...$ math segments.
export function mixed(s, tag = 'span', cls) {
  const el = h(tag, { class: cls });
  String(s).split(/\$([^$]+)\$/).forEach((part, i) => {
    if (!part) return;
    el.append(i % 2 ? mathEl(part) : document.createTextNode(part));
  });
  return el;
}
export const M = (tex, display = false) => mathEl(tex, display);

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

export function copy(text, what = 'Copied') {
  navigator.clipboard?.writeText(text).then(() => toast(what), () => toast('Could not copy'));
}

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function busyEl(msg = 'Computing') {
  return h('div', { class: 'busy' }, h('span', { class: 'spinner' }), msg + '…');
}
export function errEl(e, retry) {
  const msg = e?.message || String(e);
  return h('div', { class: 'err' }, msg === 'Stopped' ? 'Stopped. ' : msg + ' ',
    retry ? h('button', { class: 'btn small', onclick: retry }, 'Try again') : null);
}
export function flag(label, on, texLabel) {
  const el = h('span', { class: 'flag ' + (on ? 'yes' : 'no') });
  el.append(texLabel ? M(texLabel) : label);
  return el;
}
export function card(k, v, cls = '') {
  const vEl = h('div', { class: 'v' + (typeof v === 'string' ? ' text' : '') });
  vEl.append(v instanceof Node ? v : String(v));
  return h('div', { class: 'card ' + cls }, h('div', { class: 'k' }, k), vEl);
}
export function section(title, note, ...kids) {
  return h('div', { class: 'section' }, h('h3', {}, title, note ? h('small', {}, note) : null), ...kids);
}

export function plural(n, one, many = one + 's') { return `${n} ${n === 1 ? one : many}`; }
