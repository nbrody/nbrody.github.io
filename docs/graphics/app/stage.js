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
import { introspectControls, applyControl, invokeControl, sendKey, applyState } from './introspect.js';
import { renderControls } from './controlsView.js';
import { qs, params, studioQuery, clock } from './util.js';

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
    return { id: null, name: v.title, advance: 'manual', defaultDuration: 30, loop: false, shuffle: false, items: [{ vizId: v.id }] };
  }
  if (p.all != null) {
    return { id: null, name: 'All visualizations', advance: 'auto', defaultDuration: 25, loop: true, shuffle: false, items: VISUALIZATIONS.map((v) => ({ vizId: v.id })) };
  }
  return null;
}

function playablePlaylist(pl) {
  if (!pl || !Array.isArray(pl.items)) return null;
  const items = pl.items.filter((it) => it && vizById(it.vizId));
  return items.length ? { ...pl, items } : null;
}

const playlist = playablePlaylist(resolvePlaylist());
if (!playlist) {
  location.replace('index.html');
} else {
// `location.replace()` starts navigation but does not halt this module, so keep
// the whole player boot inside the validated branch.

// ── runtime state ────────────────────────────────────────────────────────────
const order = playlist.items.slice();
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

function currentItem() { return order[rt.index]; }
function currentViz() { return vizById(currentItem()?.vizId); }
function durationFor(i) { return (order[i]?.duration ?? playlist.defaultDuration ?? 30); }

// ── transport (stage role) ───────────────────────────────────────────────────
const transport = createTransport({ role: 'stage' });

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
    items: order.map((it) => { const v = vizById(it.vizId); return { vizId: it.vizId, title: v?.title || it.vizId }; }),
  }));
}

function broadcastControls() {
  transport.send(EVT.CONTROLS, rt.schema);
}

// ── command sink — used by transport AND the on-stage overlay ────────────────
function handle(type, payload = {}) {
  switch (type) {
    case CMD.NEXT: next(); break;
    case CMD.PREV: prev(); break;
    case CMD.GOTO: goto(payload.index); break;
    case CMD.PLAY: setPlaying(true); break;
    case CMD.PAUSE: setPlaying(false); break;
    case CMD.TOGGLE_PLAY: setPlaying(!rt.playing); break;
    case CMD.SET_CONTROL: applyControl(frame, payload); break;
    case CMD.INVOKE: invokeControl(frame, payload); break;
    case CMD.KEY: sendKey(frame, payload); break;
    case CMD.TOGGLE_VIZ_PANEL: sendKey(frame, { key: 'h' }); break;
    case CMD.RELOAD: reload(); break;
    case CMD.FULLSCREEN: toggleFullscreen(); break;
    case CMD.HELLO:
    case CMD.REQUEST_STATE: broadcastState(); broadcastControls(); break;
    default: break;
  }
}
transport.onAny((msg) => handle(msg.type, msg.payload));

// ── playback ─────────────────────────────────────────────────────────────────
function load(index) {
  rt.index = ((index % order.length) + order.length) % order.length;
  rt.loaded = false;
  rt.schema = { controls: [], keys: [], ok: false };
  const v = currentViz();
  showTransition(v);
  syncUI();
  broadcastState();
  broadcastControls();
  // Setting src triggers the frame's load handler below.
  frame.src = vizPath(v.id);
}

function onFrameLoad() {
  rt.loaded = true;
  hideTransition();
  rt.itemStartedAt = performance.now();
  introspectAndPublish();
  // Some tools build their controls asynchronously after load; re-scan shortly.
  setTimeout(introspectAndPublish, 700);
  // Apply any saved preset for this item.
  if (currentItem()?.state) applyState(frame, currentItem().state);
  syncUI();
  broadcastState();
}
frame.addEventListener('load', onFrameLoad);

function introspectAndPublish() {
  rt.schema = introspectControls(frame);
  renderOverlayControls();
  broadcastControls();
}

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

function reload() {
  rt.itemStartedAt = performance.now();
  // eslint-disable-next-line no-self-assign
  frame.src = frame.src;
}

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
  else document.documentElement.requestFullscreen?.().catch(() => {});
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
  qs('#prevBtn').disabled = order.length < 2 && !playlist.loop;
  qs('#nextBtn').disabled = order.length < 2 && !playlist.loop;
  qs('#panelGlyph').textContent = v?.glyph || '✦';
  qs('#panelTitle').textContent = v?.title || '—';
  qs('#panelSub').textContent = rt.schema.ok ? `${rt.schema.controls.length} controls` : 'on-stage remote';
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

function renderOverlayControls() {
  renderControls(qs('#controls'), rt.schema, handle);
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
qs('#panelBtn').onclick = () => panel.classList.toggle('open');
qs('#panelClose').onclick = () => panel.classList.remove('open');
qs('#remoteBtn').onclick = qs('#uRemote').onclick = () => openRemoteWindow();
qs('#uPanel').onclick = () => handle(CMD.TOGGLE_VIZ_PANEL);
qs('#uReload').onclick = () => handle(CMD.RELOAD);

function openRemoteWindow() {
  const p = params();
  const launch = {};
  if (playlist.id) launch.pl = playlist.id;
  else if (p.viz) launch.viz = p.viz;
  else if (p.all != null) launch.all = p.all;
  window.open(`remote.html${studioQuery(launch)}`, 'graphics-remote', 'width=420,height=820');
}

// stage keyboard shortcuts (only when the parent — not the viz iframe — is focused)
window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') handle(CMD.NEXT);
  else if (e.key === 'ArrowLeft') handle(CMD.PREV);
  else if (e.key === ' ') { e.preventDefault(); handle(CMD.TOGGLE_PLAY); }
  else if (e.key.toLowerCase() === 'c') panel.classList.toggle('open');
  else if (e.key.toLowerCase() === 'f') handle(CMD.FULLSCREEN);
});

// announce on arrival/departure so a remote opened first picks us up
window.addEventListener('beforeunload', () => transport.send(EVT.GOODBYE));

// ── boot ─────────────────────────────────────────────────────────────────────
transport.start();
load(0);
poke();
broadcastState();
}
