// transport.js — the pluggable sync channel between remote(s) and the stage.
//
// A Transport carries protocol envelopes between controllers and the display.
// Controllers never know which transport is in use, so new ones (e.g. WebRTC
// for true cross-device control) drop in without touching stage.js / remote.js.
//
//   const t = createTransport({ role: 'remote', room: 'default' });
//   t.on(EVT.STATE, (payload) => …);
//   t.send(CMD.NEXT);
//   t.start();
//
// Pick the implementation with ?transport=bc | rtc and ?room=<id> in the URL.

import { PROTOCOL_VERSION } from './protocol.js';

/** Common base: event registry + envelope wrapping. Subclasses implement
 *  _open/_close/_post and call _receive() for inbound envelopes. */
class Transport {
  constructor({ role, room = 'default' }) {
    this.role = role; // 'stage' | 'remote'
    this.room = room;
    this.kind = 'base';
    this._handlers = new Map(); // type → Set<fn>
    this._any = new Set(); // fns called for every message
    this._status = 'idle'; // 'idle' | 'connecting' | 'open' | 'closed'
    this._statusCbs = new Set();
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type)?.delete(fn);
  }

  onAny(fn) {
    this._any.add(fn);
    return () => this._any.delete(fn);
  }

  onStatus(fn) {
    this._statusCbs.add(fn);
    fn(this._status);
    return () => this._statusCbs.delete(fn);
  }

  get status() {
    return this._status;
  }

  _setStatus(s) {
    if (s === this._status) return;
    this._status = s;
    this._statusCbs.forEach((fn) => fn(s));
  }

  send(type, payload = {}) {
    this._post({ v: PROTOCOL_VERSION, role: this.role, type, payload, t: Math.floor(performance.now()) });
  }

  _receive(msg) {
    if (!msg || msg.v !== PROTOCOL_VERSION) return;
    // Ignore our own echoes (some transports loop back).
    if (msg.role === this.role) return;
    this._any.forEach((fn) => fn(msg));
    this._handlers.get(msg.type)?.forEach((fn) => fn(msg.payload, msg));
  }

  start() {
    this._setStatus('connecting');
    this._open();
  }

  stop() {
    this._close();
    this._setStatus('closed');
  }

  // — to be implemented by subclasses —
  _open() {}
  _close() {}
  _post(_msg) {}
}

/**
 * Same-browser transport: works across tabs/windows of one browser profile.
 * Perfect for a control window on a second monitor or a projector mirror.
 * Does NOT cross devices (use the WebRTC transport for that).
 */
class BroadcastTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.kind = 'broadcast';
    this._chan = null;
  }

  _open() {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[transport] BroadcastChannel unsupported; remote will not sync.');
      this._setStatus('closed');
      return;
    }
    this._chan = new BroadcastChannel(`graphics-remote:${this.room}`);
    this._chan.onmessage = (e) => this._receive(e.data);
    // BroadcastChannel has no readiness handshake; treat as open immediately.
    this._setStatus('open');
  }

  _close() {
    if (this._chan) {
      this._chan.close();
      this._chan = null;
    }
  }

  _post(msg) {
    this._chan?.postMessage(msg);
  }
}

/**
 * SCAFFOLD — true cross-device transport (phone → projector).
 *
 * Plan (Phase 2): pair via WebRTC using a free signaling broker (e.g. PeerJS's
 * public cloud) and a short room code shown as a QR on the stage. The stage
 * becomes the peer host; remotes connect with the code. Because GitHub Pages is
 * static (no backend), signaling must be external or manual.
 *
 * This stub implements the Transport interface so the UI can already render the
 * pairing affordance; it reports 'closed' until wired up. To implement:
 *   1. Load PeerJS (or roll WebRTC + a tiny signaling shim).
 *   2. Stage: peer = new Peer(roomCode); on 'connection' → conn; route _post via conn.send; conn.on('data') → _receive.
 *   3. Remote: peer = new Peer(); conn = peer.connect(roomCode); same routing.
 *   4. Surface connection state through _setStatus().
 */
class WebRTCTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.kind = 'webrtc';
    this.implemented = false;
  }

  _open() {
    console.info('[transport] WebRTC transport is scaffolded but not yet implemented; falling back to no-sync.');
    this._setStatus('closed');
  }

  _post() {
    /* no-op until implemented */
  }
}

const IMPLS = { bc: BroadcastTransport, broadcast: BroadcastTransport, rtc: WebRTCTransport, webrtc: WebRTCTransport };

/**
 * Build a transport. Reads ?transport / ?room from the URL unless overridden.
 * Defaults to BroadcastChannel.
 */
export function createTransport({ role, transport, room } = {}) {
  const sp = new URLSearchParams(location.search);
  const kind = transport || sp.get('transport') || 'bc';
  const Impl = IMPLS[kind] || BroadcastTransport;
  return new Impl({ role, room: room || sp.get('room') || 'default' });
}

export { Transport, BroadcastTransport, WebRTCTransport };
