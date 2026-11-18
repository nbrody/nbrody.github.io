// Slide sorter: live thumbnails, drag to reorder, section breaks, context
// menu, and the layout picker for new slides.

import { app, editCtx } from './state.js';
import { renderSlide } from './render.js';
import { themeVars } from './themes.js';
import { LAYOUTS, W, clone, uid, slideTitle } from './model.js';
import { h, icon, menu, popover, popoverAt, closePopover, kbd } from './ui.js';

let host, list;

export function initSlides(el) {
  host = el;
  list = h('div.slide-list', { role: 'listbox', 'aria-label': 'Slides', tabindex: '0' });
  const addBtn = h('button.btn.add-slide', { type: 'button', title: 'New slide' }, icon('plus', 16), h('span', null, 'New slide'));
  addBtn.addEventListener('click', () => layoutPicker(addBtn, app.slideIndex + 1));
  host.append(list, h('div.slide-foot', null, addBtn));
  list.addEventListener('keydown', onKey);
}

export function renderSlides() {
  const deck = app.deck;
  list.textContent = '';
  const vars = themeVars(deck.theme);
  deck.slides.forEach((s, i) => {
    const row = h('div.thumb-row' + (i === app.slideIndex ? '.current' : ''), { 'data-i': i });
    if (i === 0 || s.section) {
      row.append(h('div.section-label' + (deck.settings.nav === 'chapters' ? '.chapters' : ''), { title: 'Section — rename it in the Slide panel' },
        icon('section', 12), h('span', null, s.sectionTitle || slideTitle(s) || (i === 0 ? 'Start' : 'Section'))));
    }
    const stage = h('div.pz-stage', { style: vars });
    stage.innerHTML = renderSlide(s, editCtx('thumb'));
    const thumb = h('div.thumb', { role: 'option', 'aria-selected': String(i === app.slideIndex), 'aria-label': `Slide ${i + 1}${slideTitle(s) ? ': ' + slideTitle(s) : ''}` },
      h('div.thumb-scale', null, stage));
    if (s.notes) thumb.append(h('span.thumb-notes', { title: 'Has speaker notes' }, '✎'));
    const builds = s.elements.some(e => e.build > 0);
    if (builds) thumb.append(h('span.thumb-builds', { title: 'Has click-by-click builds' }, '▸'));
    row.append(h('div.thumb-num', null, String(i + 1)), thumb);
    row.addEventListener('pointerdown', e => onPointerDown(e, i));
    row.addEventListener('contextmenu', e => { e.preventDefault(); app.goSlide(i); slideMenu(e.clientX, e.clientY, i); });
    list.append(row);
  });
  scrollCurrentIntoView();
}

export function updateThumb(i = app.slideIndex) {
  const row = list?.querySelector(`.thumb-row[data-i="${i}"]`);
  if (!row) return renderSlides();
  const stage = row.querySelector('.pz-stage');
  stage.setAttribute('style', themeVars(app.deck.theme));
  stage.innerHTML = renderSlide(app.deck.slides[i], editCtx('thumb'));
}

export function markCurrent() {
  list.querySelectorAll('.thumb-row').forEach(r => {
    const on = +r.dataset.i === app.slideIndex;
    r.classList.toggle('current', on);
    r.querySelector('.thumb').setAttribute('aria-selected', String(on));
  });
  scrollCurrentIntoView();
}
function scrollCurrentIntoView() {
  list.querySelector('.thumb-row.current')?.scrollIntoView({ block: 'nearest' });
}

// ------------------------------------------------------------- reorder ---
function onPointerDown(e, i) {
  if (e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY;
  let dragging = false, ghost = null, line = null, target = i;
  const rows = () => [...list.querySelectorAll('.thumb-row')];
  const move = ev => {
    if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    if (!dragging) {
      dragging = true;
      ghost = list.querySelector(`.thumb-row[data-i="${i}"] .thumb`).cloneNode(true);
      ghost.className = 'thumb drag-ghost';
      document.body.append(ghost);
      line = h('div.drop-line');
      list.append(line);
      document.body.classList.add('gesturing');
    }
    ghost.style.left = ev.clientX + 8 + 'px';
    ghost.style.top = ev.clientY + 8 + 'px';
    const rs = rows();
    target = rs.length;
    for (const r of rs) {
      const b = r.querySelector('.thumb').getBoundingClientRect();
      if (ev.clientY < b.top + b.height / 2) { target = +r.dataset.i; break; }
    }
    const ref = rs[target] ? rs[target].querySelector('.thumb').getBoundingClientRect() : rs[rs.length - 1].querySelector('.thumb').getBoundingClientRect();
    const lb = list.getBoundingClientRect();
    line.style.top = (rs[target] ? ref.top - 6 : ref.bottom + 4) - lb.top + list.scrollTop + 'px';
    const edge = 40;
    if (ev.clientY < lb.top + edge) list.scrollTop -= 12; else if (ev.clientY > lb.bottom - edge) list.scrollTop += 12;
  };
  const up = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    document.body.classList.remove('gesturing');
    ghost?.remove(); line?.remove();
    if (!dragging) { app.goSlide(i); list.focus({ preventScroll: true }); return; }
    if (target === i || target === i + 1) return;
    app.mutate(d => {
      const [s] = d.slides.splice(i, 1);
      const to = target > i ? target - 1 : target;
      d.slides.splice(to, 0, s);
      app.slideIndex = to;
    }, { parts: ['all'] });
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
}

function onKey(e) {
  const n = app.deck.slides.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); app.goSlide(Math.min(n - 1, app.slideIndex + 1)); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); app.goSlide(Math.max(0, app.slideIndex - 1)); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSlide(app.slideIndex); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSlide(app.slideIndex); }
  else if (e.key === 'Enter') { e.preventDefault(); layoutPicker(list.querySelector('.thumb-row.current .thumb') || list, app.slideIndex + 1); }
  else return;
  e.stopPropagation();
}

// -------------------------------------------------------------- actions --
export function addSlide(layoutId, at = app.slideIndex + 1) {
  const s = LAYOUTS[layoutId].make();
  app.mutate(d => { d.slides.splice(at, 0, s); app.slideIndex = at; app.sel = new Set(); }, { parts: ['all'] });
}
export function duplicateSlide(i) {
  app.mutate(d => {
    const c = clone(d.slides[i]);
    c.id = uid('s');
    c.elements.forEach(e => { e.id = uid('e'); });
    c.section = false;
    d.slides.splice(i + 1, 0, c);
    app.slideIndex = i + 1; app.sel = new Set();
  }, { parts: ['all'] });
}
export function deleteSlide(i) {
  if (app.deck.slides.length <= 1) {
    app.mutate(d => { d.slides[0].elements = []; app.sel = new Set(); }, { parts: ['all'] });
    return;
  }
  app.mutate(d => {
    d.slides.splice(i, 1);
    app.slideIndex = Math.min(i, d.slides.length - 1); app.sel = new Set();
  }, { parts: ['all'] });
}
function moveSlide(i, d) {
  const j = i + d;
  if (j < 0 || j >= app.deck.slides.length) return;
  app.mutate(dk => { const [s] = dk.slides.splice(i, 1); dk.slides.splice(j, 0, s); app.slideIndex = j; }, { parts: ['all'] });
}

function slideMenu(x, y, i) {
  const s = app.deck.slides[i];
  popoverAt(x, y, menu([
    { label: 'New slide after', icon: 'plus', action: () => layoutPicker(list.querySelector(`.thumb-row[data-i="${i}"] .thumb`), i + 1) },
    { label: 'Duplicate', icon: 'copy', kbd: kbd('Mod+D'), action: () => duplicateSlide(i) },
    { label: i === 0 ? 'Rename section…' : s.section ? 'Remove section break' : 'Start a section here', icon: 'section', action: () => {
      if (i === 0 || s.section) {
        if (i === 0) { app.tab = 'format'; app.sel = new Set(); app.refresh(['inspector', 'overlay']); app.focusInspector?.('sectionTitle'); }
        else app.mutate(() => { s.section = false; }, { parts: ['slides', 'inspector'] });
      } else app.mutate(() => { s.section = true; }, { parts: ['slides', 'inspector'] });
    } },
    '-',
    { label: 'Move up', icon: 'left', disabled: i === 0, action: () => moveSlide(i, -1) },
    { label: 'Move down', icon: 'right', disabled: i === app.deck.slides.length - 1, action: () => moveSlide(i, 1) },
    { label: 'Present from here', icon: 'play', action: () => app.present?.(i) },
    '-',
    { label: 'Delete slide', icon: 'trash', danger: true, action: () => deleteSlide(i) },
  ]));
}

export function layoutPicker(anchor, at) {
  const vars = themeVars(app.deck.theme);
  const grid = h('div.layout-grid');
  for (const [id, L] of Object.entries(LAYOUTS)) {
    const stage = h('div.pz-stage', { style: vars });
    stage.innerHTML = renderSlide(L.make(), editCtx('edit'));
    grid.append(h('button.layout-card', { type: 'button', onclick: () => { closePopover(); addSlide(id, at); } },
      h('div.layout-thumb', null, h('div.thumb-scale', { style: { transform: `scale(${150 / W})` } }, stage)),
      h('span', null, L.name)));
  }
  popover(anchor, h('div.pop-pad', null, h('div.pop-label', null, 'New slide'), grid), { cls: 'layouts' });
}
