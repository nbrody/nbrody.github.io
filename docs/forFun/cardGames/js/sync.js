// ===== FIREBASE SYNC MODULE =====
// Uses Firebase Realtime Database for table ↔ hand synchronization.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDemo_REPLACE_WITH_REAL_KEY",
  authDomain: "card-table-demo.firebaseapp.com",
  databaseURL: "https://card-table-demo-default-rtdb.firebaseio.com",
  projectId: "card-table-demo",
  storageBucket: "card-table-demo.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

let db = null;
let sessionRef = null;
let _sessionId = null;
let _useLocal = false;

// Local BroadcastChannel fallback (same-machine/tab testing)
const LOCAL_CHANNEL = new BroadcastChannel('card-table-sync');
const _localListeners = {};

/** Initialize Firebase (gracefully falls back to BroadcastChannel) */
export function initSync() {
  try {
    if (!firebase?.apps?.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    console.log('[Sync] Firebase connected');
  } catch (e) {
    console.warn('[Sync] Firebase unavailable — using BroadcastChannel fallback');
    _useLocal = true;
    db = null;
  }

  // Always also listen on BroadcastChannel for local fallback
  LOCAL_CHANNEL.onmessage = (evt) => {
    const { path, data } = evt.data || {};
    if (path && _localListeners[path]) {
      _localListeners[path].forEach(cb => cb(data));
    }
  };
}

/** Set active session */
export function setSession(id) {
  _sessionId = id;
  if (db) {
    sessionRef = db.ref('sessions/' + id);
  }
}

/** Write data to a path under the current session */
export function write(subpath, data) {
  if (db && sessionRef) {
    sessionRef.child(subpath).set(data);
  }
  // Always broadcast locally too
  LOCAL_CHANNEL.postMessage({ path: _sessionId + '/' + subpath, data });
}

/** Update (merge) data at a path */
export function update(subpath, data) {
  if (db && sessionRef) {
    sessionRef.child(subpath).update(data);
  }
  LOCAL_CHANNEL.postMessage({ path: _sessionId + '/' + subpath, data });
}

/** Listen to a path — callback is called with snapshot value each change */
export function listen(subpath, callback) {
  const fullPath = _sessionId + '/' + subpath;
  if (!_localListeners[fullPath]) _localListeners[fullPath] = [];
  _localListeners[fullPath].push(callback);

  if (db && sessionRef) {
    sessionRef.child(subpath).on('value', snap => {
      callback(snap.val());
    });
  }
}

/** Stop listening to a path */
export function unlisten(subpath) {
  if (db && sessionRef) sessionRef.child(subpath).off();
  const fullPath = _sessionId + '/' + subpath;
  delete _localListeners[fullPath];
}

/** Generate a short readable room code */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getSessionId() { return _sessionId; }
export function usingLocal() { return _useLocal; }
