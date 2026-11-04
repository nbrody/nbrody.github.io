// The theme button's menu: Light / Dark / Auto, and the page style (fonts, paper, sizes).
// State lives on <html>: data-theme ("light" | "dark"; absent = follow the system) and
// data-style (absent = LaTeX). The <head> script applies the saved choice before first paint,
// and style.css holds each style's tokens. Figures redraw on the 'ip-theme' event.
import { el, isDark } from './common.js';

// paper/ink are only for the menu's "Aa" swatches: [light, dark] pairs copied from style.css
export const STYLES = [
  { id: 'latex', name: 'LaTeX', note: 'Computer Modern, the font of the printed paper',
    font: "'Latin Modern', Georgia, serif", paper: ['#fcfcfa', '#2b3138'], ink: ['#1d2228', '#e8ebef'] },
  { id: 'modern', name: 'Modern', note: 'Atkinson Hyperlegible, Playfair headings',
    font: "'Playfair Display', Georgia, serif", weight: 600, paper: ['#fcfcfa', '#2b3138'], ink: ['#1d2228', '#e8ebef'] },
  { id: 'book', name: 'Book', note: 'EB Garamond on warm paper',
    font: "'EB Garamond', Georgia, serif", paper: ['#f7f3ea', '#292a2c'], ink: ['#2a241f', '#ede7dc'] },
  { id: 'large', name: 'Large print', note: 'Bigger text, stronger contrast',
    font: "'Atkinson Hyperlegible', system-ui, sans-serif", weight: 700, paper: ['#ffffff', '#1c1f23'], ink: ['#0c0f13', '#f7f8fa'] },
];

const ICON = {
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};
const MODES = [
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
  { id: 'auto', name: 'Auto' },
];

const root = document.documentElement;
const currentMode = () => root.dataset.theme || 'auto';
const currentStyle = () => root.dataset.style || 'latex';

function store(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
}

function announce() {
  window.dispatchEvent(new Event('ip-theme'));
  // canvases measure text, so draw once more when the new style's fonts have arrived
  requestAnimationFrame(() => document.fonts?.ready.then(() => window.dispatchEvent(new Event('ip-theme'))));
}

/** A radio group of buttons with arrow-key movement (arrows select, as radios do). */
function radioGroup(label, items, onPick) {
  const group = el('div', { role: 'radiogroup', 'aria-label': label });
  group.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const btns = [...group.querySelectorAll('[role="radio"]')];
    const i = btns.indexOf(document.activeElement);
    const next = btns[(i + step + btns.length) % btns.length];
    next.focus();
    onPick(next.dataset.value);
  });
  for (const it of items) {
    const b = it.node;
    b.setAttribute('role', 'radio');
    b.dataset.value = it.id;
    b.type = 'button';
    b.addEventListener('click', () => onPick(it.id));
    group.append(b);
  }
  return group;
}

export function initLook(toggle) {
  const modeGroup = radioGroup('Mode', MODES.map((m) => ({
    id: m.id, node: el('button', { class: 'look-mode', html: `${ICON[m.id]}<span>${m.name}</span>` }),
  })), (id) => set(id, currentStyle()));

  const styleGroup = radioGroup('Page style', STYLES.map((s) => ({
    id: s.id,
    node: el('button', { class: 'look-style' },
      el('span', { class: 'look-aa', 'aria-hidden': 'true', style: `font-family:${s.font};font-weight:${s.weight || 400}` }, 'Aa'),
      el('span', { class: 'look-text' }, el('span', { class: 'look-name' }, s.name), el('span', { class: 'look-note' }, s.note)),
      el('span', { class: 'look-check', 'aria-hidden': 'true', html: ICON.check })),
  })), (id) => set(currentMode(), id));
  styleGroup.classList.add('look-styles');
  modeGroup.classList.add('look-modes');

  const menu = el('div', { class: 'look-menu', id: 'look-menu', role: 'dialog', 'aria-label': 'Theme and page style', hidden: '' },
    el('div', { class: 'look-label', 'aria-hidden': 'true' }, 'Mode'), modeGroup,
    el('div', { class: 'look-label', 'aria-hidden': 'true' }, 'Style'), styleGroup,
    el('div', { class: 'look-foot' }, 'Math is always set in TeX’s own fonts. Your choice is saved in this browser.'));
  document.body.append(menu);

  function sync() {
    const mode = currentMode();
    const style = currentStyle();
    const dark = isDark();
    toggle.innerHTML = ICON[mode];
    for (const b of modeGroup.children) {
      const on = b.dataset.value === mode;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    STYLES.forEach((s, i) => {
      const b = styleGroup.children[i];
      const on = s.id === style;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      const aa = b.querySelector('.look-aa');
      aa.style.background = s.paper[dark ? 1 : 0];
      aa.style.color = s.ink[dark ? 1 : 0];
    });
  }

  function set(mode, style) {
    if (mode === 'auto') delete root.dataset.theme; else root.dataset.theme = mode;
    if (style === 'latex') delete root.dataset.style; else root.dataset.style = style;
    store('ip-theme', mode === 'auto' ? null : mode);
    store('ip-style', style);
    sync();
    announce();
  }

  function open() {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    menu.querySelector('.look-styles [aria-checked="true"]').focus({ preventScroll: true });
  }
  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (refocus) toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => (menu.hidden ? open() : close(false)));
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) close(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) close(true); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  sync();
  return { set, open, close };
}
