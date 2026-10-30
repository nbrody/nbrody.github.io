/* Phone remote — the link between a presenting deck and phones.
 *
 * A session is a small tree at <root>/<session> in the Firebase Realtime
 * Database (root is the config's `root`, default pz-remote):
 *   deck            what the phone renders (titles, notes, controls, theme)
 *   state           { index, count, step, steps, startedAt }
 *   cmd/<push id>   { k: next|prev|goto|button, … } queued by phones
 *   params/<name>   { v, t }      sliders and switches (latest wins)
 *   joy/<name>      { x, y, t }   joysticks (latest wins)
 *   phones/<id>     connected phones
 *
 * The same API also runs over a BroadcastChannel ("local"), for trying a
 * remote in another window on the same computer without Firebase.
 * Plain script (no modules): it is inlined into exported decks and into the
 * phone page. Sets self.PZRemoteLink. */
(function (root) {
  'use strict';
  var SDK = 'https://www.gstatic.com/firebasejs/9.22.1/';
  var sdk = null;
  function script(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load Firebase (offline?)')); };
      document.head.appendChild(s);
    });
  }
  function loadFirebase() {
    if (root.firebase && root.firebase.database) return Promise.resolve(root.firebase);
    if (!sdk) sdk = script(SDK + 'firebase-app-compat.js').then(function () { return script(SDK + 'firebase-database-compat.js'); }).then(function () { return root.firebase; });
    return sdk;
  }

  // Session names: 12 characters, no look-alikes (the rules require ≥ 12).
  function newSession() {
    var a = 'abcdefghjkmnpqrstuvwxyz23456789', b = new Uint8Array(12), s = '';
    crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += a[b[i] % a.length];
    return s;
  }
  var validSession = function (s) { return /^[a-z0-9]{12,40}$/.test(s || ''); };

  function firebaseLink(cfg, session) {
    return loadFirebase().then(function (fb) {
      var name = 'pz-' + cfg.projectId;
      var inst = fb.apps.filter(function (a) { return a.name === name; })[0] ||
        fb.initializeApp({ apiKey: cfg.apiKey, databaseURL: cfg.databaseURL, projectId: cfg.projectId }, name);
      var dir = (cfg.root || 'pz-remote') + '/';
      var db = inst.database(), base = db.ref(dir + session), info = db.ref('.info/connected');
      var at = function (p) { return p ? base.child(p) : base; };
      return {
        kind: 'firebase', session: session,
        set: function (p, v) { return at(p).set(v); },
        push: function (p, v) { return at(p).push(v); },
        remove: function (p) { return at(p).remove(); },
        removeOnDisconnect: function (p) { return at(p).onDisconnect().remove(); },
        onValue: function (p, cb, fail) {
          var r = at(p), f = function (s) { cb(s.val()); };
          r.on('value', f, fail);
          return function () { r.off('value', f); };
        },
        onChild: function (p, cb) {
          var r = at(p), f = function (s) { cb(s.val(), function () { return s.ref.remove(); }); };
          r.on('child_added', f);
          return function () { r.off('child_added', f); };
        },
        onConnected: function (cb) {
          var f = function (s) { cb(!!s.val()); };
          info.on('value', f);
          return function () { info.off('value', f); };
        },
        // A round trip through the database: write, read back, delete.
        ping: function () {
          var r = db.ref(dir + newSession() + '/ping'), v = Date.now();
          return r.set(v).then(function () { return r.once('value'); }).then(function (s) {
            if (s.val() !== v) throw new Error('The database returned something else.');
            return r.parent.remove();
          });
        },
        close: function () { base.off(); info.off(); },
      };
    });
  }

  // The same calls over a BroadcastChannel: each window keeps a copy of the
  // tree; the presenter answers a newcomer's "hello" with the whole tree.
  function localLink(session, role) {
    var ch = new BroadcastChannel('pz-remote/' + session), tree = {}, subs = [], disc = [];
    var parts = function (p) { return p ? String(p).split('/').filter(Boolean) : []; };
    var get = function (p) { var n = tree; for (var k of parts(p)) { if (!n || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n; };
    var put = function (p, v) {
      var ks = parts(p);
      if (!ks.length) { tree = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : {}; return; }
      var n = tree;
      for (var i = 0; i < ks.length - 1; i++) { if (!n[ks[i]] || typeof n[ks[i]] !== 'object') n[ks[i]] = {}; n = n[ks[i]]; }
      if (v === null || v === undefined) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    var related = function (a, b) { var x = parts(a).join('/'), y = parts(b).join('/'); return !x || !y || x === y || x.indexOf(y + '/') === 0 || y.indexOf(x + '/') === 0; };
    function apply(m) {
      if (m.op === 'set') put(m.path, m.value);
      else if (m.op === 'sync') tree = m.tree || {};
      else if (m.op === 'push') put(m.path + '/' + m.key, m.value);
      else if (m.op === 'hello') { if (role === 'presenter') ch.postMessage({ op: 'sync', tree: tree }); return; }
      for (var s of subs.slice()) {
        if (s.kind === 'value' && (m.op === 'sync' || related(s.path, m.path))) s.cb(get(s.path));
        if (s.kind === 'child' && m.op === 'push' && parts(s.path).join('/') === parts(m.path).join('/')) s.cb(m.value, function () { put(m.path + '/' + m.key, null); });
      }
    }
    ch.onmessage = function (e) { if (e.data && e.data.op) apply(e.data); };
    var send = function (m) { apply(m); ch.postMessage(m); return Promise.resolve(); };
    addEventListener('pagehide', function () { for (var p of disc) ch.postMessage({ op: 'set', path: p, value: null }); });
    ch.postMessage({ op: 'hello' });
    return Promise.resolve({
      kind: 'local', session: session,
      set: function (p, v) { return send({ op: 'set', path: p, value: v }); },
      push: function (p, v) { return send({ op: 'push', path: p, key: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), value: v }); },
      remove: function (p) { return send({ op: 'set', path: p || '', value: null }); },
      removeOnDisconnect: function (p) { disc.push(p || ''); return Promise.resolve(); },
      onValue: function (p, cb) { var s = { kind: 'value', path: p, cb: cb }; subs.push(s); cb(get(p)); return function () { subs.splice(subs.indexOf(s), 1); }; },
      onChild: function (p, cb) { var s = { kind: 'child', path: p, cb: cb }; subs.push(s); return function () { subs.splice(subs.indexOf(s), 1); }; },
      onConnected: function (cb) { cb(true); return function () {}; },
      ping: function () { return Promise.resolve(); },
      close: function () { ch.close(); },
    });
  }

  // Several links as one (the presenter talks to Firebase and to this computer).
  function both(links) {
    var all = function (f) { return Promise.all(links.map(f)); };
    var join = function (offs) { return function () { offs.forEach(function (o) { o(); }); }; };
    return {
      kind: links.map(function (l) { return l.kind; }).join('+'), session: links[0].session, links: links,
      set: function (p, v) { return all(function (l) { return l.set(p, v); }); },
      push: function (p, v) { return all(function (l) { return l.push(p, v); }); },
      remove: function (p) { return all(function (l) { return l.remove(p); }); },
      removeOnDisconnect: function (p) { return all(function (l) { return l.removeOnDisconnect(p); }); },
      onValue: function (p, cb) { return join(links.map(function (l) { return l.onValue(p, cb); })); },
      onChild: function (p, cb) { return join(links.map(function (l) { return l.onChild(p, cb); })); },
      onConnected: function (cb) { return links[0].onConnected(cb); },
      close: function () { links.forEach(function (l) { l.close(); }); },
    };
  }

  root.PZRemoteLink = {
    newSession: newSession,
    validSession: validSession,
    loadFirebase: loadFirebase,
    // { firebase?: config, session, local?: bool, role: 'presenter' | 'phone' }
    connect: function (o) {
      if (!validSession(o.session)) return Promise.reject(new Error('This remote link is incomplete.'));
      if (o.local || !o.firebase) return localLink(o.session, o.role);
      return firebaseLink(o.firebase, o.session);
    },
    connectPresenter: function (firebase, session) {
      var local = localLink(session, 'presenter');
      if (!firebase) return local;
      return Promise.all([local, firebaseLink(firebase, session).catch(function (e) { console.warn('Phone remote:', e.message); return null; })])
        .then(function (ls) { return ls[1] ? both([ls[1], ls[0]]) : ls[0]; });
    },
    test: function (firebase) { return firebaseLink(firebase, newSession()).then(function (l) { return l.ping().then(function () { l.close(); }); }); },
  };
})(self);
