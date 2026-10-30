// Phone remote — the preview beside the canvas. It is the phone page itself
// (remote.html?preview) in a phone-sized frame, so the editor shows exactly
// what the phone will; its controls drive the editor the way a phone drives
// the presentation: Next/Back change slide, sliders and joysticks reach the
// applets on the canvas.

import { app, currentSlide } from './state.js';
import { resolveRemote, normalizeRemoteDeck, slidePreset, presetById } from './remote-model.js';
import { slideTitle } from './model.js';
import { googleFontURL } from './themes.js';
import { h, button } from './ui.js';

const KEY = 'pz-remote-preview';
const PHONE = { w: 375, h: 760 };
let pane, frame, label, ui = null, viewport, queued = false, startedAt = Date.now();
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
  pane = h('aside.phone-pane', { 'aria-label': 'Phone remote preview', hidden: true },
    h('div.phone-head', null, label, button('Hide the phone', 'x', () => setRemotePreview(false), { cls: 'ghost sm' })),
    stage,
    h('p.hint.phone-hint', null, 'Try it: the controls work on this slide too.'));
  return pane;
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
