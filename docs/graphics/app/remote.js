// remote.js — the companion remote control.
//
// A pure controller: it sends commands over the transport and renders whatever
// STATE / CONTROLS the stage broadcasts. It holds no visualization logic, so it
// works the same whether the stage is in another tab (BroadcastChannel today)
// or on another device (WebRTC later) — only the transport changes.

import { vizById } from './manifest.js';
import { createTransport } from './transport.js';
import { CMD, EVT } from './protocol.js';
import { renderControls } from './controlsView.js';
import { qs, el, clear, params, studioQuery, clock } from './util.js';

const transport = createTransport({ role: 'remote' });
const p = params();

let lastStateAt = 0;
let connected = null; // null = unknown at boot, so the first setConnected(false) renders

// commands flow straight through the transport
const dispatch = (type, payload) => transport.send(type, payload);

// ── connection status ────────────────────────────────────────────────────────
function setConnected(on) {
  if (on === connected) return;
  connected = on;
  const dot = qs('#statusDot');
  dot.classList.toggle('live', on);
  dot.classList.toggle('waiting', !on);
  qs('#statusText').textContent = on ? 'connected to display' : 'waiting for display…';
  qs('#disconnected').classList.toggle('hidden', on);
}

transport.onStatus((s) => {
  qs('#footer').textContent = `transport: ${transport.kind} · room ${transport.room} · ${s}`;
  if (s === 'closed' && transport.kind === 'broadcast') {
    qs('#statusText').textContent = 'sync unavailable in this browser';
  }
});

// ── inbound events ───────────────────────────────────────────────────────────
transport.on(EVT.STATE, (st) => {
  lastStateAt = performance.now();
  setConnected(true);
  renderState(st);
});

transport.on(EVT.CONTROLS, (schema) => {
  renderControls(qs('#controls'), schema, dispatch);
});

transport.on(EVT.GOODBYE, () => {
  setConnected(false);
  qs('#statusText').textContent = 'display closed';
});

// consider ourselves disconnected if no state heard for a while
setInterval(() => {
  if (connected && performance.now() - lastStateAt > 4000) setConnected(false);
}, 1500);

// ── render incoming state ────────────────────────────────────────────────────
function renderState(st) {
  const v = vizById(st.vizId);
  qs('#nowGlyph').textContent = v?.glyph || '✦';
  qs('#nowTitle').textContent = st.vizTitle || v?.title || '—';
  qs('#nowPos').textContent = st.total ? `${st.playlistName} · ${st.index + 1} / ${st.total}` : '—';
  qs('#playBtn').textContent = st.playing ? '⏸' : '▶';

  const frac = st.duration ? 1 - st.remaining / st.duration : 0;
  qs('#nowBar').style.width = st.playing ? `${Math.round(frac * 100)}%` : '0%';
  if (st.playing && st.remaining != null) {
    qs('#statusText').textContent = `playing · ${clock(st.remaining)} left`;
  } else if (connected) {
    qs('#statusText').textContent = 'connected to display';
  }

  renderJumpList(st);
}

function renderJumpList(st) {
  const box = qs('#jump');
  clear(box);
  (st.items || []).forEach((it, i) => {
    const v = vizById(it.vizId);
    box.append(el('button', {
      class: `jump${i === st.index ? ' active' : ''}`,
      onclick: () => dispatch(CMD.GOTO, { index: i }),
    }, [
      el('span', { class: 'n' }, String(i + 1)),
      el('span', { class: 'g' }, v?.glyph || '▦'),
      el('span', { class: 't' }, it.title || v?.title || it.vizId),
    ]));
  });
}

// ── outbound buttons ─────────────────────────────────────────────────────────
qs('#prevBtn').onclick = () => dispatch(CMD.PREV);
qs('#nextBtn').onclick = () => dispatch(CMD.NEXT);
qs('#playBtn').onclick = () => dispatch(CMD.TOGGLE_PLAY);
qs('#uPanel').onclick = () => dispatch(CMD.TOGGLE_VIZ_PANEL);
qs('#uReload').onclick = () => dispatch(CMD.RELOAD);
qs('#uFs').onclick = () => dispatch(CMD.FULLSCREEN);

qs('#openStageBtn').onclick = () => {
  const launch = {};
  if (p.pl) launch.pl = p.pl;
  else if (p.viz) launch.viz = p.viz;
  else if (p.all != null) launch.all = p.all;
  window.open(`stage.html${studioQuery(launch)}`, 'graphics-stage');
};

// ── boot ─────────────────────────────────────────────────────────────────────
setConnected(false);
transport.start();
// Announce; the stage replies with STATE + CONTROLS. Retry a few times in case
// the display opens slightly after the remote.
let hellos = 0;
const helloTimer = setInterval(() => {
  if (connected || hellos++ > 8) { clearInterval(helloTimer); return; }
  transport.send(CMD.HELLO);
}, 600);
transport.send(CMD.HELLO);
