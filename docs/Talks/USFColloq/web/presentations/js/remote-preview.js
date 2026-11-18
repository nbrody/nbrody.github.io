// Phone remote — the floating preview over the canvas. It is the phone page itself
// (remote.html?preview) in a phone-sized frame, so the editor shows exactly
// what the phone will; its controls drive the editor the way a phone drives
// the presentation: Next/Back change slide, sliders and joysticks reach the
// applets on the canvas.

import { app, currentSlide } from './state.js';
import { resolveRemote, normalizeRemoteDeck, slidePreset, presetById } from './remote-model.js';
import { slideTitle } from './model.js';
import { googleFontURL } from './themes.js';
import { h, button } from './ui.js';
import { fitPanel, defaultPanel } from './floating-panel.js';

const KEY = 'pz-remote-preview';
const PHONE = { w: 375, h: 760 };
let pane, frame, label, ui = null, viewport, queued = false, startedAt = Date.now();
let panelRect = null, minimized = false, minimizeButton;
const values = {};          // parameter values set from the preview, as a phone would

try { app.remotePreview = localStorage.getItem(KEY) === '1'; } catch { app.remotePreview = false; }

export function initRemotePreview(vp) {
  viewport = vp;
  label = h('span.phone-label');
  frame = h('iframe.phone-frame', { title: 'Phone remote preview', src: new URL('../remote.html?preview=1', import.meta.url).href });
  frame.addEventListener('load', () => {
    const w = frame.contentWindow;
    if (!w?.PZRemoteUI) return;
    ui = w.PZRemoteUI.mount(w.document.getElementById('app'), { preview: true, onEvent });
    updateRemotePreview();
  });
  // The page runs at a real phone's size and is scaled to fit the pane.
  const screen = h('div.phone-screen', null, frame), phone = h('div.phone', null, screen), stage = h('div.phone-stage', null, phone);
  new ResizeObserver(() => {
    const bezel = 8, w = stage.clientWidth - 2 * bezel, hh = stage.clientHeight - 2 * bezel;
    if (w <= 0 || hh <= 0) return;
    const s = Math.min(1, w / PHONE.w, hh / PHONE.h);
    phone.style.setProperty('--s', s.toFixed(4));
    screen.style.width = PHONE.w * s + 'px'; screen.style.height = PHONE.h * s + 'px';
  }).observe(stage);
  minimizeButton = h('button.phone-minimize', { type: 'button', title: 'Minimize phone preview', 'aria-label': 'Minimize phone preview', onclick: () => setMinimized(!minimized) }, '−');
  const head = h('div.phone-head', { tabindex: '0', title: 'Drag to move; use arrow keys to move with the keyboard', 'aria-label': 'Move phone preview with arrow keys' },
    label, h('div.phone-actions', null, minimizeButton, button('Hide the phone', 'x', () => setRemotePreview(false), { cls: 'ghost sm' })));
  const grip = h('button.phone-resize', { type: 'button', title: 'Drag or use arrow keys to resize', 'aria-label': 'Resize phone preview with arrow keys' });
  pane = h('aside.phone-pane', { 'aria-label': 'Phone remote preview', hidden: true }, head, stage,
    h('p.hint.phone-hint', null, 'Try it: the controls work on this slide too.'), grip);
  setupFloatingPanel(head, grip);
  return pane;
}

// Coordinates are relative to the canvas area, so the panel never steals
// layout space and remains reachable when the window is resized.
function bounds() { const box = pane.parentElement; return { w: box.clientWidth, h: box.clientHeight }; }
function layoutPanel() {
  if (!pane?.parentElement || pane.hidden) return;
  const b = bounds();
  if (!b.w || !b.h) return;
  panelRect = fitPanel(panelRect || defaultPanel(b), b, minimized);
  Object.assign(pane.style, { left: panelRect.x + 'px', top: panelRect.y + 'px', width: panelRect.width + 'px', height: (minimized ? Math.min(42, b.h - 20) : panelRect.height) + 'px' });
}
function setMinimized(value) {
  minimized = value;
  pane.classList.toggle('minimized', value);
  minimizeButton.textContent = value ? '+' : '−';
  minimizeButton.title = value ? 'Restore phone preview' : 'Minimize phone preview';
  minimizeButton.setAttribute('aria-label', minimizeButton.title);
  minimizeButton.setAttribute('aria-expanded', String(!value));
  layoutPanel();
}
function setupFloatingPanel(head, grip) {
  const start = (event, resize) => {
    if (event.button !== 0 || (!resize && event.target.closest('button'))) return;
    event.preventDefault();
    const target = event.currentTarget, startX = event.clientX, startY = event.clientY, initial = { ...panelRect };
    target.setPointerCapture(event.pointerId); pane.classList.add('adjusting');
    const move = e => {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      panelRect = resize ? { ...initial, width: initial.width + dx, height: initial.height + dy } : { ...initial, x: initial.x + dx, y: initial.y + dy };
      layoutPanel();
    };
    const end = () => { pane.classList.remove('adjusting'); target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  };
  head.addEventListener('pointerdown', e => start(e, false));
  grip.addEventListener('pointerdown', e => start(e, true));
  const keys = (event, resize) => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
    if (!delta || (!resize && event.target !== head)) return;
    event.preventDefault();
    if (resize) { panelRect.width += delta[0]; panelRect.height += delta[1]; }
    else { panelRect.x += delta[0]; panelRect.y += delta[1]; }
    layoutPanel();
  };
  head.addEventListener('keydown', e => keys(e, false)); grip.addEventListener('keydown', e => keys(e, true));
  // Wait until the caller has inserted the pane into the workspace.
  requestAnimationFrame(() => { if (pane.parentElement) new ResizeObserver(layoutPanel).observe(pane.parentElement); });
}

export function setRemotePreview(on) {
  app.remotePreview = !!on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (on) startedAt = Date.now();
  app.refresh(['inspector']);
}

// Coalesced: refresh() calls this on every repaint.
export function updateRemotePreview() {
  if (queued || !pane) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; draw(); });
}

function draw() {
  const deck = app.deck;
  const on = !!(deck && app.remotePreview && normalizeRemoteDeck(deck.remote).enabled);
  pane.hidden = !on;
  if (on) layoutPanel();
  if (!on || !ui) return;
  const slide = currentSlide(), i = app.slideIndex, controls = resolveRemote(deck, slide);
  const own = slide.remote?.preset && slide.remote.preset !== 'deck';
  label.textContent = `Slide ${i + 1} · ${presetById(slidePreset(deck, slide))?.name || ''}${own ? '' : ' (deck)'}`;
  const titles = controls.some(c => c.type === 'slides' || c.type === 'upnext');
  ui.update({
    title: deck.title,
    theme: { colors: { ...deck.theme.colors }, fonts: { heading: deck.theme.fonts.heading, body: deck.theme.fonts.body },
      fontURLs: [...new Set([deck.theme.fonts.heading, deck.theme.fonts.body])].map(googleFontURL).filter(Boolean) },
    controls,
    state: { index: i, count: deck.slides.length, step: 0, steps: 0, startedAt },
    slides: deck.slides.map((s, k) => ({ t: titles ? slideTitle(s) : '', n: k === i ? s.notes || '' : '' })),
    params: { ...values },
    status: { text: 'Preview', ok: true },
  });
}

const post = msg => viewport?.querySelectorAll('iframe').forEach(f => { try { f.contentWindow?.postMessage(msg, '*'); } catch {} });
function onEvent(e) {
  if (e.k === 'next') app.goSlide(app.slideIndex + 1);
  else if (e.k === 'prev') app.goSlide(app.slideIndex - 1);
  else if (e.k === 'goto') app.goSlide(e.i);
  else if (e.k === 'param') { values[e.name] = e.value; post({ type: 'pz-param', name: e.name, value: e.value }); }
  else if (e.k === 'joy') post({ type: 'pz-joystick', name: e.name, x: e.x, y: e.y });
  else if (e.k === 'button') post({ type: 'pz-button', name: e.name });
}
// An applet on the canvas that (re)loads gets the values set so far.
addEventListener('message', e => {
  if (e.data?.type !== 'pz-applet-ready' || !e.source || !viewport) return;
  if (![...viewport.querySelectorAll('iframe')].some(f => f.contentWindow === e.source)) return;
  for (const [name, value] of Object.entries(values)) e.source.postMessage({ type: 'pz-param', name, value }, '*');
});
