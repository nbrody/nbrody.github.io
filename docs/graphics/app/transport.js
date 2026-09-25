// transport.js — the pluggable sync channel between remote(s) and the stage.
//
// A Transport carries protocol envelopes between controllers and the display.
// Controllers never know which transport is in use, so new ones (e.g. Firebase
// for cross-device control) drop in without touching stage.js / remote.js.
//
//   const t = createTransport({ role: 'remote', room: 'default' });
//   t.on(EVT.STATE, (payload) => …);
//   t.send(CMD.NEXT);
//   t.start();
//
// Pick the implementation with ?transport=bc | firebase and ?room=<id> in the URL.

import { loadFirebase } from './firebase.js';
import { sessionId } from './util.js';
import { PROTOCOL_VERSION } from './protocol.js';

/** Common base: event registry + envelope wrapping. Subclasses implement
 *  _open/_close/_post and call _receive() for inbound envelopes. */
class Transport {
  constructor({ role, room = 'default' }) {
    this.role = role; // 'stage' | 'remote'
    this.room = room;
    this.kind = 'base';
    this._seen = new Set();
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
    this._post({ v: PROTOCOL_VERSION, id: sessionId(), role: this.role, type, payload, t: Date.now() });
  }

  _receive(msg) {
    if (!msg || msg.v !== PROTOCOL_VERSION) return;
    // Ignore our own echoes (some transports loop back).
    if (msg.role === this.role || !['stage', 'remote'].includes(msg.role)) return;
    if (msg.id) {
      if (this._seen.has(msg.id)) return;
      this._seen.add(msg.id);
      if (this._seen.size > 4096) this._seen.delete(this._seen.values().next().value);
    }
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
 * Does NOT cross devices (enable Firebase pairing for that).
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

/** Local BroadcastChannel plus opt-in Firebase, using the Talks backend. */
class PairedTransport extends BroadcastTransport {
  constructor(opts) {
    super(opts);
    this.kind = 'local';
    this.cloudStatus = 'disabled';
    this.cloudError = '';
    this._cloudCbs = new Set();
    this._latest = new Map();
    this._cloudReady = false;
    this._stopped = false;
    this._subscriptions = [];
    this._autoCloud = opts.cloud;
  }

  onCloudStatus(fn) {
    this._cloudCbs.add(fn);
    fn(this.cloudStatus, this.cloudError);
    return () => this._cloudCbs.delete(fn);
  }
  _cloudStatus(status, error = '') {
    this.cloudStatus = status;
    this.cloudError = error;
    this._cloudCbs.forEach(fn => fn(status, error));
  }
  _open() {
    this._stopped = false;
    super._open();
    if (this._autoCloud) this.enableCloud();
  }
  async enableCloud() {
    if (this._opening) return this._opening;
    if (this._ref && this.cloudStatus !== 'error') return;
    if (this._ref) {
      this._subscriptions.splice(0).forEach(off => off());
      this._ref = null;
    }
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(this.room)) {
      this._cloudStatus('error', 'Invalid pairing room. Open a new display to generate a pairing link.');
      return;
    }
    this.kind = 'firebase + local';
    this._cloudStatus('connecting');
    this._opening = this._connectCloud().catch(error => {
      this._cloudReady = false;
      this._cloudStatus('error', error.message);
    }).finally(() => { this._opening = null; });
    return this._opening;
  }
  async _connectCloud() {
    this._db = await loadFirebase();
    if (this._stopped) return;
    this._ref = this._db.ref(`sessions/graphics-${this.room}`);
    const fail = error => { this._cloudReady = false; this._cloudStatus('error', error.message); };
    const listen = (ref, event, fn) => {
      ref.on(event, fn, fail);
      this._subscriptions.push(() => ref.off(event, fn));
    };
    this._offset = 0;
    listen(this._db.ref('.info/serverTimeOffset'), 'value', snap => { this._offset = snap.val() || 0; });
    const receive = snap => {
      const record = snap.val();
      if (!record || typeof record.data !== 'string' || typeof record.sentAt !== 'number') return;
      // Never replay commands or stale state after reconnecting to an old room.
      const age = Date.now() + this._offset - record.sentAt;
      if (age > 15000 || age < -15000) return;
      try { this._receive(JSON.parse(record.data)); } catch (error) { console.warn('Invalid graphics message', error); }
    };
    if (this.role === 'stage') {
      listen(this._ref.child('commands'), 'child_added', snap => {
        receive(snap);
        snap.ref.remove().catch(fail);
      });
    } else {
      for (const type of ['state', 'controls', 'notice', 'goodbye']) {
        listen(this._ref.child(`events/${type}`), 'value', receive);
      }
    }
    listen(this._db.ref('.info/connected'), 'value', async snap => {
      this._cloudReady = false;
      if (!snap.val()) { this._cloudStatus('offline'); return; }
      try {
        // Cleanup is registered on the server before advertising a display.
        if (this.role === 'stage') await this._ref.onDisconnect().remove();
        await this._ref.child(`presence/${this.role}`).set({ at: window.firebase.database.ServerValue.TIMESTAMP });
        if (this._stopped) return;
        this._cloudReady = true;
        this._cloudStatus('online');
        this._setStatus('open');
        if (this.role === 'stage') {
          for (const msg of this._latest.values()) this._postCloud(msg);
        } else this.send('hello');
      } catch (error) { fail(error); }
    });
  }
  _post(msg) {
    super._post(msg);
    if (this.role === 'stage' && ['state', 'controls'].includes(msg.type)) this._latest.set(msg.type, msg);
    // Do not queue offline commands for unexpected playback on reconnect.
    if (this._cloudReady) this._postCloud(msg);
  }
  _postCloud(msg) {
    const record = { data: JSON.stringify(msg), sentAt: window.firebase.database.ServerValue.TIMESTAMP };
    // JSON preserves selector keys (Firebase forbids dots, #, brackets in keys)
    // and empty arrays, so local and cloud messages have exactly the same shape.
    const ref = this.role === 'stage' ? this._ref.child(`events/${msg.type}`) : this._ref.child('commands').push();
    ref.set(record).catch(error => this._cloudStatus('error', error.message));
  }
  _close() {
    this._stopped = true;
    this._cloudReady = false;
    this._subscriptions.splice(0).forEach(off => off());
    if (this.role === 'stage' && this._ref) this._ref.remove().catch(() => {});
    this._ref = null;
    this._cloudStatus('disabled');
    super._close();
  }
}

export function createTransport({ role, transport, room } = {}) {
  const sp = new URLSearchParams(location.search);
  const kind = transport || sp.get('transport') || 'bc';
  return new PairedTransport({ role, room: room || sp.get('room') || 'default', cloud: ['firebase', 'rtc', 'webrtc'].includes(kind) });
}

export { Transport, BroadcastTransport, PairedTransport };
