import { mountPairing } from './pairing.js';
import { mountPlaylistEditor } from './playlistEditor.js';
// remote.js — the companion remote control, built phone-first.
//
// A pure controller: it sends commands over the transport and renders whatever
// STATE / CONTROLS the stage broadcasts. It holds no visualization logic, so it
// works the same whether the stage is in another tab (BroadcastChannel today)
// or on another device (Firebase pairing) — only the transport changes.
//
// Layout: a now-playing header, tabs over swipeable pages (Simple — the
// default — Advanced, Playlist, Connect), and a transport dock in thumb reach.

import { vizById } from './manifest.js';
import { createTransport } from './transport.js';
import { CMD, EVT } from './protocol.js';
import { createControlsView } from './controlsView.js';
import { mountPager } from './pager.js';
import { qs, el, clear, params, clock, sessionId } from './util.js';

const PAGE = { simple: 0, advanced: 1, playlist: 2, connect: 3 };

const remoteURL = new URL(location.href);
if (!remoteURL.searchParams.has('room')) {
  remoteURL.searchParams.set('room', localStorage.getItem('graphics.lastRoom') || sessionId());
  remoteURL.searchParams.set('transport', localStorage.getItem('graphics.lastTransport') || 'bc');
  history.replaceState(null, '', remoteURL);
}
const transport = createTransport({ role: 'remote' });
mountPlaylistEditor(qs('#playlistEditor'), transport);
mountPairing(qs('#phonePairing'), transport, { remote: true });
const p = params();

let lastStateAt = 0;
let connected = null; // null = unknown at boot, so the first setConnected(false) renders

// commands flow straight through the transport
const dispatch = (type, payload) => transport.send(type, payload);

const pager = mountPager({ tabs: qs('#tabs'), pager: qs('#pager'), initial: PAGE.simple });
const controls = createControlsView({
  simple: qs('#simpleControls'),
  advanced: qs('#controls'),
  dispatch,
  onMore: () => pager.select(PAGE.advanced),
});
renderSchema(null);

// ── connection status ────────────────────────────────────────────────────────
function setConnected(on) {
  if (on === connected) return;
  connected = on;
  const dot = qs('#statusDot');
  dot.classList.toggle('live', on);
  dot.classList.toggle('waiting', !on);
  qs('#statusText').textContent = on ? 'connected to display' : 'waiting for display…';
  qs('#disconnected').classList.toggle('hidden', on);
  if (!on) {
    qs('#nowBar').style.width = '0%';
    setPlayIcon(false);
  }
}

transport.onStatus((s) => {
  qs('#footer').textContent = `transport: ${transport.kind} · room ${transport.room} · ${s}`;
  if (s === 'closed' && transport.cloudStatus === 'disabled') {
    qs('#statusText').textContent = 'sync unavailable in this browser';
  }
});

transport.onCloudStatus((state, error) => {
  qs('#footer').textContent = `room ${transport.room} · phone pairing ${state}${error ? ': ' + error : ''}`;
  if (state === 'offline' || state === 'error') setConnected(false);
});

// ── inbound events ───────────────────────────────────────────────────────────
transport.on(EVT.STATE, (st) => {
  lastStateAt = performance.now();
  setConnected(true);
  renderState(st);
});

transport.on(EVT.CONTROLS, renderSchema);

transport.on(EVT.NOTICE, ({ message }) => toast(message));

transport.on(EVT.GOODBYE, () => {
  setConnected(false);
  qs('#statusText').textContent = 'display closed';
  renderSchema(null);
});

// consider ourselves disconnected if no state heard for a while
setInterval(() => {
  if (connected && performance.now() - lastStateAt > 10000) setConnected(false);
}, 1500);

// ── render incoming state ────────────────────────────────────────────────────
function renderSchema(schema) {
  const counts = controls.update(schema);
  const badge = qs('#advCount');
  badge.textContent = String(counts.advanced || counts.keys);
  badge.hidden = !(counts.advanced || counts.keys);
}

function renderState(st) {
  const v = vizById(st.vizId);
  qs('#nowGlyph').textContent = v?.glyph || '✦';
  qs('#nowTitle').textContent = st.vizTitle || v?.title || '—';
  document.title = `${st.vizTitle || v?.title || 'Remote'} — Remote`;
  setPlayIcon(st.playing);

  const frac = st.duration ? 1 - st.remaining / st.duration : 0;
  qs('#nowBar').style.width = st.playing ? `${Math.round(frac * 100)}%` : '0%';
  // "Playlist · 3 / 12 · 0:14 left"; a lone visualization just reads "live".
  const title = st.vizTitle || v?.title;
  const name = st.playlistName && st.playlistName !== title ? st.playlistName : '';
  const where = st.total > 1 ? `${st.index + 1} / ${st.total}` : '';
  const timing = st.playing && st.remaining != null ? `${clock(st.remaining)} left` : '';
  qs('#statusText').textContent = [name, where, timing].filter(Boolean).join(' · ') || 'live on the display';
  qs('#uPanelLabel').textContent = st.presentation === false ? 'Hide controls on the display' : 'Show controls on the display';

  renderJumpList(st);
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>';
function setPlayIcon(playing) {
  const btn = qs('#playBtn');
  if (btn.dataset.playing === String(!!playing)) return;
  btn.dataset.playing = String(!!playing);
  btn.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  btn.setAttribute('aria-label', playing ? 'Pause auto-advance' : 'Play (auto-advance)');
}

function renderJumpList(st) {
  const box = qs('#jump');
  const signature = JSON.stringify([st.index, st.items.map(it => it.vizId)]);
  if (box.dataset.signature === signature) return;
  box.dataset.signature = signature;
  clear(box);
  (st.items || []).forEach((it, i) => {
    box.append(el('button', {
      type: 'button',
      class: `jump${i === st.index ? ' active' : ''}`,
      'aria-current': i === st.index ? 'true' : null,
      onclick: () => dispatch(CMD.GOTO, { index: i }),
    }, [
      el('span', { class: 'n' }, String(i + 1)),
      el('span', { class: 'g', 'aria-hidden': 'true' }, vizById(it.vizId)?.glyph || '▦'),
      el('span', { class: 't' }, it.title || vizById(it.vizId)?.title || it.vizId),
    ]));
  });
  const active = box.querySelector('.jump.active');
  if (active) box.scrollTop = active.offsetTop - box.clientHeight / 2 + active.offsetHeight / 2;
}

// ── toast for stage notices ──────────────────────────────────────────────────
let toastTimer;
function toast(message) {
  const t = qs('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── outbound buttons ─────────────────────────────────────────────────────────
qs('#prevBtn').onclick = () => dispatch(CMD.PREV);
qs('#nextBtn').onclick = () => dispatch(CMD.NEXT);
qs('#playBtn').onclick = () => dispatch(CMD.TOGGLE_PLAY);
qs('#randomBtn').onclick = () => dispatch(CMD.RANDOM);
qs('#toConnect').onclick = () => pager.select(PAGE.connect);

const sheet = qs('#moreSheet');
qs('#moreBtn').onclick = () => sheet.showModal();
qs('#moreClose').onclick = () => sheet.close();
sheet.addEventListener('click', (e) => { // a tap outside the sheet's box lands on its backdrop
  const r = sheet.getBoundingClientRect();
  if (e.target === sheet && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) sheet.close();
});
const fromSheet = (fn) => () => { sheet.close(); fn(); };
qs('#uPanel').onclick = fromSheet(() => dispatch(CMD.TOGGLE_VIZ_PANEL));
qs('#uReload').onclick = fromSheet(() => dispatch(CMD.RELOAD));
qs('#uFs').onclick = fromSheet(() => dispatch(CMD.FULLSCREEN));
qs('#uShuffle').onclick = fromSheet(() => { dispatch(CMD.SHUFFLE); toast('Queue shuffled.'); });

qs('#openStageBtn').onclick = () => {
  const q = new URLSearchParams({ room: transport.room, mode: 'remote', transport: p.transport || 'bc' });
  if (p.pl) q.set('pl', p.pl); else q.set('all', '1');
  window.open(`stage.html?${q}`, `graphics-stage-${transport.room}`);
};

// ── boot ─────────────────────────────────────────────────────────────────────
setConnected(false);
transport.start();
// Announce; the stage replies with STATE + CONTROLS. Retry a few times in case
// the display opens slightly after the remote.
setInterval(() => { if (!connected) transport.send(CMD.HELLO); else transport.send(CMD.REQUEST_STATE); }, 1500);
transport.send(CMD.HELLO);
