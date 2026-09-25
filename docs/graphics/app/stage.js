import { mountPairing, activatePairing } from './pairing.js';
import { normalizePayload, normalizeItem } from './payload.js';
import { prepareVisualization } from './presentation.js';
// stage.js — the fullscreen player ("the display").
//
// The stage owns the iframe and is the single source of truth: it loads the
// playlist, advances through it, and is the ONLY thing that touches a
// visualization. Both control surfaces (the on-stage overlay panel and the
// separate-window / future cross-device remote) are just controllers that send
// commands here via `handle()`; the stage executes them and broadcasts state.

import { vizById, vizPath, VISUALIZATIONS } from './manifest.js';
import { PlaylistStore } from './store.js';
import { createTransport } from './transport.js';
import { CMD, EVT, makeState } from './protocol.js';
import { introspectControls, applyControl, invokeControl, sendKey, applyPayload, captureState } from './introspect.js';
import { createControlsView, ECHO_GRACE_MS } from './controlsView.js';
import { mountPager } from './pager.js';
import { qs, el, params, clock, sessionId } from './util.js';

const frame = qs('#viz');

// ── resolve what to play ─────────────────────────────────────────────────────
function resolvePlaylist() {
  const p = params();
  if (p.pl) {
    const pl = PlaylistStore.get(p.pl);
    if (pl) return pl;
  }
  if (p.viz && vizById(p.viz)) {
    const v = vizById(p.viz);
    return { id: null, name: v.title, advance: 'manual', defaultDuration: 30, loop: false, shuffle: false, items: [{ vizId: v.id, payload: readURLPayload(p.payload) }] };
  }
  if (p.all != null) {
    return { id: null, name: 'All visualizations', advance: 'auto', defaultDuration: 25, loop: true, shuffle: false, items: VISUALIZATIONS.map((v) => ({ vizId: v.id })) };
  }
  return null;
}

function readURLPayload(raw) {
  try { return normalizePayload(raw ? JSON.parse(raw) : {}); }
  catch (e) { alert(e.message); return {}; }
}
let playlist = resolvePlaylist();
if (!playlist || !playlist.items.length) {
  playlist = { name: 'All visualizations', advance: 'manual', loop: true, defaultDuration: 30, items: VISUALIZATIONS.map(v => ({ vizId: v.id })) };
}

// ── runtime state ────────────────────────────────────────────────────────────
let order = playlist.items.map(normalizeItem);
if (playlist.shuffle) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
}

const rt = {
  index: 0,
  playing: playlist.advance === 'auto',
  schema: { controls: [], keys: [], ok: false },
  itemStartedAt: 0, // performance.now() when current item began
  loaded: false,
};

function shuffleOrder() {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
}

function currentItem() { return order[rt.index]; }
function currentViz() { return vizById(currentItem()?.vizId); }
function durationFor(i) { return (order[i]?.duration ?? playlist.defaultDuration ?? 30); }

// ── transport (stage role) ───────────────────────────────────────────────────
const sessionURL = new URL(location.href);
if (!sessionURL.searchParams.has('room')) {
  sessionURL.searchParams.set('room', sessionId());
  history.replaceState(null, '', sessionURL);
}
localStorage.setItem('graphics.lastRoom', sessionURL.searchParams.get('room'));
localStorage.setItem('graphics.lastTransport', sessionURL.searchParams.get('transport') || 'bc');
const transport = createTransport({ role: 'stage' });
let presentation = params().mode === 'remote';
let loadGeneration = 0;
let scanTimer;
let lastSchema = '';
function notice(message) { transport.send(EVT.NOTICE, { message }); }
function setPresentation(on) {
  const hadFocus = panel.contains(document.activeElement);
  const fromMenu = document.activeElement === qs('#displayMenu');
  presentation = !!on;
  document.body.classList.toggle('presentation', presentation);
  panel.classList.toggle('open', !presentation);
  panel.inert = presentation;
  document.body.classList.toggle('sidebar-open', !presentation);
  // Keep keyboard/screen-reader focus on something visible as the panel comes and goes.
  if (presentation && hadFocus) qs('#displayMenu').focus();
  else if (!presentation && fromMenu) qs('#panelClose').focus();
}


function broadcastState() {
  const dur = durationFor(rt.index);
  const elapsed = rt.playing ? (performance.now() - rt.itemStartedAt) / 1000 : 0;
  transport.send(EVT.STATE, makeState({
    playlistId: playlist.id,
    playlistName: playlist.name,
    index: rt.index,
    total: order.length,
    vizId: currentViz()?.id || null,
    vizTitle: currentViz()?.title || '',
    playing: rt.playing,
    advance: rt.playing ? 'auto' : 'manual',
    duration: dur,
    remaining: Math.max(0, dur - elapsed),
    items: order.map((it) => ({ ...it, title: vizById(it.vizId)?.title || it.vizId })),
    loop: playlist.loop, defaultDuration: playlist.defaultDuration, presentation,
  }));
}

function broadcastControls() {
  transport.send(EVT.CONTROLS, rt.schema);
}

// ── command sink — used by transport AND the on-stage overlay ────────────────
function handle(type, payload = {}) {
  try {
  switch (type) {
    case CMD.ENABLE_CLOUD: activatePairing(transport); break;
    case CMD.NEXT: next(); break;
    case CMD.PREV: prev(); break;
    case CMD.GOTO: goto(payload.index); break;
    case CMD.PLAY: setPlaying(true); break;
    case CMD.PAUSE: setPlaying(false); break;
    case CMD.TOGGLE_PLAY: setPlaying(!rt.playing); break;
    case CMD.SET_CONTROL: if (rt.loaded) { applyControl(frame, payload); introspectAndPublish(); settleControls(); } break;
    case CMD.INVOKE: if (rt.loaded) { invokeControl(frame, payload); introspectAndPublish(); settleControls(); } break;
    case CMD.KEY: if (rt.loaded) { sendKey(frame, payload); introspectAndPublish(); settleControls(); } break;
    case CMD.TOGGLE_VIZ_PANEL: setPresentation(!presentation); broadcastState(); break;
    case CMD.RELOAD: reload(); break;
    case CMD.FULLSCREEN: toggleFullscreen(); break;
    case CMD.HELLO: setPresentation(true); broadcastState(); broadcastControls(); break;
    case CMD.REQUEST_STATE: broadcastState(); broadcastControls(); break;
    case CMD.PRESENTATION: setPresentation(payload.enabled); broadcastState(); break;
    case CMD.RANDOM:
      if (order.length > 1) load((rt.index + 1 + Math.floor(Math.random() * (order.length - 1))) % order.length);
      break;
    case CMD.SHUFFLE: {
      const current = currentItem();
      shuffleOrder();
      rt.index = order.indexOf(current); broadcastState(); syncUI(); break;
    }
    case CMD.LOAD_PLAYLIST: {
      const incoming = payload.playlist;
      if (!incoming || !Array.isArray(incoming.items) || !incoming.items.length) throw new Error('Add at least one visualization.');
      const items = incoming.items.map(normalizeItem);
      if (items.some(it => !vizById(it.vizId))) throw new Error('Unknown visualization.');
      playlist = { ...incoming, defaultDuration: Number(incoming.defaultDuration) > 0 ? Number(incoming.defaultDuration) : 30 };
      order = items;
      if (incoming.shuffle) shuffleOrder();
      rt.playing = incoming.advance === 'auto'; load(0); break;
    }
    case CMD.APPLY_PAYLOAD: {
      if (!rt.loaded) throw new Error('Wait for the visualization to load.');
      const custom = normalizePayload(payload.payload);
      const missing = applyPayload(frame, custom);
      currentItem().payload = { ...currentItem().payload, ...custom };
      introspectAndPublish(); broadcastState();
      notice(missing.length ? `Unknown controls: ${missing.join(', ')}` : 'Payload applied.'); break;
    }
    case CMD.SAVE_VIEW:
      if (!rt.loaded) throw new Error('Wait for the visualization to load.');
      currentItem().payload = normalizePayload(captureState(frame));
      broadcastState(); notice('Current parameters captured. Save the playlist to keep them.'); break;
    case CMD.SET_ADVANCE:
      if (Number(payload.duration) > 0) playlist.defaultDuration = Number(payload.duration);
      setPlaying(payload.advance === 'auto'); break;
    default: break;
  }
  } catch (error) { notice(error.message); }
}
transport.onAny((msg) => handle(msg.type, msg.payload));

// ── playback ─────────────────────────────────────────────────────────────────
function load(index) {
  loadGeneration++;
  lastSchema = "";
  clearTimeout(scanTimer);
  rt.index = ((index % order.length) + order.length) % order.length;
  rt.loaded = false;
  const v = currentViz();
  rt.schema = { controls: [], keys: [], ok: false, vizId: v?.id || null };
  renderOverlayControls();
  showTransition(v);
  syncUI();
  broadcastState();
  broadcastControls();
  // Setting src triggers the frame's load handler below.
  const url = new URL(vizPath(v.id), location.href);
  url.searchParams.set('embedded', '1');
  frame.src = url.href;
}

function onFrameLoad() {
  if (!frame.contentDocument?.body || frame.contentWindow.location.href !== frame.src) return;
  const generation = loadGeneration;
  prepareVisualization(frame, currentViz().id);
  rt.loaded = true;
  hideTransition();
  rt.itemStartedAt = performance.now();
  let pending = { ...currentItem().payload };
  let attempts = 0;
  const applyPending = () => {
    if (generation !== loadGeneration) return;
    const missing = applyPayload(frame, pending);
    pending = Object.fromEntries(missing.map(key => [key, pending[key]]));
    introspectAndPublish();
    if (Object.keys(pending).length && attempts++ < 20) scanTimer = setTimeout(applyPending, 250);
    else if (missing.length) notice(`Unknown controls: ${missing.join(', ')}`);
  };
  applyPending();
  syncUI(); broadcastState();
}
frame.addEventListener('load', onFrameLoad);

function introspectAndPublish() {
  if (!rt.loaded) return;
  rt.schema = introspectControls(frame);
  rt.schema.vizId = currentViz()?.id || null;
  rt.schema.keys = [...new Set([...rt.schema.keys, ...(currentViz()?.keys || [])])];
  const serialized = JSON.stringify(rt.schema);
  if (serialized === lastSchema) return;
  lastSchema = serialized;
  renderOverlayControls(); broadcastControls();
}
// After a local edit, show the visualization's final word once the panel's echo grace ends —
// even when it rejected or snapped the value and the schema came out unchanged.
let settleTimer;
function settleControls() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { introspectAndPublish(); renderOverlayControls(); }, ECHO_GRACE_MS + 100);
}
// Poll actual controls too: presets, keyboard actions, and animations can change values.
setInterval(() => { introspectAndPublish(); broadcastState(); }, 1000);

function next() {
  if (rt.index + 1 >= order.length && !playlist.loop) { setPlaying(false); return; }
  load(rt.index + 1);
}
function prev() {
  if (rt.index === 0 && !playlist.loop) { load(0); return; }
  load(rt.index - 1);
}
function goto(i) { if (Number.isInteger(i)) load(i); }

function setPlaying(on) {
  rt.playing = on;
  if (on) rt.itemStartedAt = performance.now();
  syncUI();
  broadcastState();
}

function reload() { load(rt.index); }

// auto-advance + progress tick
setInterval(() => {
  if (!rt.playing || !rt.loaded) return;
  const dur = durationFor(rt.index);
  const elapsed = (performance.now() - rt.itemStartedAt) / 1000;
  updateProgress(Math.min(1, elapsed / dur), Math.max(0, dur - elapsed));
  broadcastState();
  if (elapsed >= dur) next();
}, 250);

// ── fullscreen ───────────────────────────────────────────────────────────────
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {
    notice('Browser fullscreen requires a click on the display. Press F on the display; remote presentation already fills its window.');
  });
}

// ── UI: dock + overlay panel ─────────────────────────────────────────────────
const dock = qs('#dock');
const panel = qs('#panel');

function syncUI() {
  const v = currentViz();
  qs('#dockTitle').textContent = v?.title || '—';
  qs('#dockPlaylist').textContent = `${playlist.name}`;
  qs('#count').textContent = `${rt.index + 1} / ${order.length}`;
  qs('#playBtn').textContent = rt.playing ? '⏸' : '▶';
  const panelPlay = qs('#panelPlay');
  if (panelPlay.dataset.playing !== String(rt.playing)) {
    panelPlay.dataset.playing = String(rt.playing);
    panelPlay.innerHTML = rt.playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>';
    panelPlay.setAttribute('aria-label', rt.playing ? 'Pause auto-advance' : 'Play (auto-advance)');
  }
  qs('#prevBtn').disabled = order.length < 2 && !playlist.loop;
  qs('#nextBtn').disabled = order.length < 2 && !playlist.loop;
  qs('#panelGlyph').textContent = v?.glyph || '✦';
  qs('#panelTitle').textContent = v?.title || '—';
  qs('#panelSub').textContent = order.length > 1 ? `${playlist.name} · ${rt.index + 1} / ${order.length}` : 'Live controls';
  if (!rt.playing) updateProgress(0, durationFor(rt.index));
}

function updateProgress(frac, remaining) {
  qs('#progressFill').style.width = `${Math.round(frac * 100)}%`;
  qs('#dockPlaylist').textContent = rt.playing ? `${playlist.name} · ${clock(remaining)}` : playlist.name;
}

function showTransition(v) {
  qs('#trGlyph').textContent = v?.glyph || '✦';
  qs('#trTitle').textContent = v?.title || 'Loading…';
  qs('#transition').classList.add('show');
}
function hideTransition() { qs('#transition').classList.remove('show'); }

// Simple / Advanced / Studio pages in the panel; Simple is the default.
const panelPager = mountPager({ tabs: qs('#panelTabs'), pager: qs('#panelPager'), initial: 0 });
const controlsView = createControlsView({
  simple: qs('#simpleControls'),
  advanced: qs('#controls'),
  dispatch: handle,
  onMore: () => panelPager.select(1),
});

function renderOverlayControls() {
  const counts = controlsView.update(rt.schema);
  const badge = qs('#advCount');
  badge.textContent = String(counts.advanced || counts.keys);
  badge.hidden = !(counts.advanced || counts.keys);
}

// dock auto-hide on idle
let idleTimer;
function poke() {
  dock.classList.remove('hide');
  qs('#hint').classList.remove('hide');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { dock.classList.add('hide'); qs('#hint').classList.add('hide'); }, 3200);
}
['mousemove', 'touchstart', 'keydown'].forEach((e) => window.addEventListener(e, poke, { passive: true }));

// ── wire buttons ─────────────────────────────────────────────────────────────
qs('#exitBtn').onclick = () => { transport.send(EVT.GOODBYE); location.href = 'index.html'; };
qs('#prevBtn').onclick = () => handle(CMD.PREV);
qs('#nextBtn').onclick = () => handle(CMD.NEXT);
qs('#playBtn').onclick = () => handle(CMD.TOGGLE_PLAY);
qs('#fsBtn').onclick = () => handle(CMD.FULLSCREEN);
qs('#panelPrev').onclick = () => handle(CMD.PREV);
qs('#panelNext').onclick = () => handle(CMD.NEXT);
qs('#panelPlay').onclick = () => handle(CMD.TOGGLE_PLAY);
qs('#panelBtn').onclick = () => setPresentation(!presentation);
qs('#panelClose').onclick = () => setPresentation(true);
qs('#displayMenu').onclick = () => setPresentation(false);
qs('#remoteBtn').onclick = qs('#uRemote').onclick = () => openRemoteWindow();
qs('#uPanel').onclick = () => handle(CMD.TOGGLE_VIZ_PANEL);
qs('#uLibrary').onclick = () => { location.href = 'index.html'; };
qs('#uFullscreen').onclick = toggleFullscreen;
qs('#uReload').onclick = () => handle(CMD.RELOAD);

function openRemoteWindow() {
  setPresentation(true);
  const q = new URLSearchParams({ room: transport.room, transport: transport.cloudStatus === 'disabled' ? 'bc' : 'firebase' });
  if (playlist.id) q.set('pl', playlist.id);
  window.open(`remote.html?${q}`, `graphics-remote-${transport.room}`, 'width=460,height=900');
}

// stage keyboard shortcuts (only when the parent — not the viz iframe — is focused)
window.addEventListener('keydown', (e) => {
  const t = e.target;
  // Typing goes to fields; arrows move sliders, tabs and option groups; Space activates
  // the panel's own controls. Everything else (C, F, Space on the dock…) stays a shortcut.
  if (t?.closest?.('input:not([type=checkbox]):not([type=radio]), select, textarea, dialog')) return;
  if (/^(Arrow|Home$|End$|Page)/.test(e.key) && t?.closest?.('[role=slider], [role=tablist], [role=radiogroup]')) return;
  if (e.key === ' ' && t?.closest?.('#panel button, #panel summary, #panel input, a') && !t.closest('.panel-transport')) return;
  if (e.key === 'ArrowRight') handle(CMD.NEXT);
  else if (e.key === 'ArrowLeft') handle(CMD.PREV);
  else if (e.key === ' ') { e.preventDefault(); handle(CMD.TOGGLE_PLAY); }
  else if (e.key.toLowerCase() === 'c') setPresentation(!presentation);
  else if (e.key.toLowerCase() === 'f') handle(CMD.FULLSCREEN);
});

// announce on arrival/departure so a remote opened first picks us up
window.addEventListener('beforeunload', () => transport.send(EVT.GOODBYE));

// ── boot ─────────────────────────────────────────────────────────────────────
mountPairing(qs('#phonePairing'), transport);
setPresentation(presentation);
transport.start();
load(0);
poke();
broadcastState();
