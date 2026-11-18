/* alphaPresent — the Python behind slide consoles (runtime/python.js).
 *
 * A console element is a sandboxed frame (js/console.js). It asks the page
 * it sits in to run code, and this script answers. One instance runs in the
 * editor page and one in an exported deck. Each one either runs the code
 * itself or passes the request up:
 *
 *   kernel   inside alphaCentaur: alphaPy's live kernel, a sandboxed Python
 *            process on the computer (/python/js/kernel.js, the 'exec' message)
 *   pyodide  anywhere else: Pyodide, Python compiled to WebAssembly, in a Web
 *            Worker, running the same alphaPy runtime (runtime/console-python.js)
 *   relay    a deck presented from the editor: requests go to the editor's own
 *            instance (parent or opener), so editing and presenting share one Python
 *   local    a deck on the web, on a computer that runs alphaCentaur: its kernel,
 *            through the apps port (server/console-access.mjs), once this browser
 *            chose "On this computer" (a console's Python menu, or ?python=local)
 *            and alphaCentaur allows the site. Otherwise, and whenever it can't be
 *            reached, Pyodide. Visitors are never probed: only a browser that
 *            chose it connects.
 *
 * Messages (console ↔ page), all {type: 'pz-py', …}:
 *   console → page  {op: 'hello'}  {op: 'run', rid, code}  {op: 'interrupt'}  {op: 'restart'}
 *   console → page  {op: 'backend', use: 'local' | 'browser'}   (where Python runs)
 *   page → console  {ev: 'status', state, label, detail, choice}  {ev: 'msg', rid, msg}  {ev: 'note', text}
 *                   (choice: {using} when the page offers both places, else null)
 * state is off | loading | ready | busy | dead; msg is a kernel message about
 * that run ({type: 'console', stream, text} or {type: 'cell', status, output, error}).
 * The deck runtime also tells the consoles on the slide being shown {type: 'pz-visible'}.
 *
 * Only console frames on this page (and windows given to pzPython.allow, the
 * presented deck) are answered, so an applet can't start Python on its own. */
(function () {
  'use strict';
  if (window.pzPython) return;

  var config = null;               // {relay: true} | {kernel: spec} | {pyodide: indexURL, sources | sourcesURL}
  var backend = null;
  var clients = new Set();         // windows that said hello (consoles, or a presented deck)
  var allowed = new Set();         // extra windows allowed to talk to us (a presented deck)
  var owners = new Map();          // rid -> the window that asked
  var status = { state: 'off', label: '', detail: '' };
  var upstream = null;             // relay: the editor's window
  var using = 'browser';           // where the current backend runs: local | browser
  var PREF = 'pz-python';          // this browser's choice for decks on this site

  function preference() {
    try {
      var q = new URLSearchParams(location.search).get('python');
      if (q === 'local' || q === 'browser') localStorage.setItem(PREF, q);
      return localStorage.getItem(PREF) === 'local' ? 'local' : 'browser';
    } catch (e) { return 'browser'; }
  }
  var offersChoice = function () { return !!(config && config.local && config.pyodide && !config.kernel && !config.relay); };

  function send(win, msg) {
    try { win.postMessage(Object.assign({ type: 'pz-py' }, msg), '*'); } catch (e) { clients.delete(win); }
  }
  function statusMsg() {
    return { ev: 'status', state: status.state, label: status.label, detail: status.detail, choice: offersChoice() ? { using: using } : null };
  }
  function setStatus(state, label, detail) {
    status = { state: state, label: label == null ? status.label : label, detail: detail || '' };
    clients.forEach(function (w) { send(w, statusMsg()); });
  }
  function notify(text) { clients.forEach(function (w) { send(w, { ev: 'note', text: text }); }); }
  function deliver(rid, msg) {
    var w = owners.get(rid);
    if (!w) return;
    send(w, { ev: 'msg', rid: rid, msg: msg });
    if (msg.type === 'cell' && msg.status && msg.status !== 'running') owners.delete(rid);
  }
  // Every run still waiting hears that it ended (Python stopped or restarted).
  function endAll(status, message) {
    owners.forEach(function (w, rid) {
      send(w, { ev: 'msg', rid: rid, msg: { type: 'cell', id: rid, status: status, output: null, error: message ? { name: 'Stopped', message: message, traceback: '' } : null } });
    });
    owners.clear();
  }

  // A kernel message from the backend: route it to the run it belongs to.
  function fromPython(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') setStatus('ready', backend.label(msg));
    else if (msg.type === 'loading') setStatus('loading', null, msg.text || '');
    else if (msg.type === 'idle') { if (status.state === 'busy') setStatus('ready'); }
    else if (msg.type === 'dead') { endAll('interrupted', msg.message || 'Python stopped.'); backend = null; setStatus('dead', null, msg.message || 'Python stopped.'); }
    else if ((msg.type === 'cell' || msg.type === 'console') && msg.id != null) {
      if (msg.type === 'cell' && msg.status === 'running') setStatus('busy');
      deliver(String(msg.id), msg);
    }
  }

  // ── alphaCentaur's kernel ─────────────────────────────────────────────
  // Runs asked for while Python is still starting wait in `queue`.
  function KernelBackend(spec) {
    var client = null, connected = false, queue = [];
    this.label = function (ready) { return 'Python ' + (ready.python || '') + ' · AlphaCentaur sandbox'; };
    this.start = function () {
      setStatus('loading', 'Python · AlphaCentaur', 'Starting Python on this computer…');
      return import(spec.client || '/python/js/kernel.js').then(function (mod) {
        client = new mod.KernelClient(spec, fromPython);
        return client.start();
      }).then(function () {
        connected = true;
        queue.splice(0).forEach(function (m) { client.send(m); });
      }).catch(function (e) { fromPython({ type: 'dead', message: 'Python could not start: ' + (e.message || e) }); });
    };
    this.run = function (rid, code) {
      var m = { type: 'exec', id: rid, code: code };
      if (connected && client) client.send(m); else queue.push(m);
    };
    this.interrupt = function () { client && client.interrupt(); };
    this.stop = function () { if (client) client.stop(); client = null; };
  }

  // ── Pyodide in a Web Worker ───────────────────────────────────────────
  // This function is the worker's source (sent as text, so it can't see this scope).
  function workerMain(boot) {
    var post = function (m) { postMessage(JSON.stringify(m)); };
    var chain = Promise.resolve(), ready = null, waiting = [];
    onmessage = function (e) { if (ready) ready(e.data); else waiting.push(e.data); };
    try { importScripts(boot.indexURL + 'pyodide.js'); }
    catch (e) { post({ type: 'dead', message: 'Python could not be downloaded (' + (e.message || e) + '). Consoles need a network connection the first time.' }); return; }
    (async function () {
      try {
        post({ type: 'loading', text: 'Loading Python into the browser…' });
        var py = await loadPyodide({ indexURL: boot.indexURL });
        Object.keys(boot.sources).forEach(function (path) {
          var dir = '/kernel/' + path.split('/').slice(0, -1).join('/');
          py.FS.mkdirTree(dir);
          py.FS.writeFile('/kernel/' + path, boot.sources[path]);
        });
        py.runPython(boot.sources['driver.py']);
        var handle = py.globals.get('handle');
        ready = function (raw) {
          chain = chain.then(async function () {
            var msg = {};
            try { msg = JSON.parse(raw); } catch (e) { return; }
            if (msg.type === 'exec') {
              try { await py.loadPackagesFromImports(String(msg.code || ''), { messageCallback: function (t) { post({ type: 'loading', text: t }); }, errorCallback: function () {} }); }
              catch (e) { /* an unknown import fails when it runs, with Python's own message */ }
            }
            try { handle(raw); } catch (e) { post({ type: 'cell', id: msg.id, status: 'error', output: null, error: { name: 'Error', message: String(e.message || e), traceback: '' } }); post({ type: 'idle' }); }
          });
        };
        waiting.splice(0).forEach(ready);
      } catch (e) {
        post({ type: 'dead', message: 'Python did not start in this browser (' + (e.message || e) + ').' });
      }
    })();
  }

  function PyodideBackend(opts) {
    var worker = null, queue = [];
    this.label = function (ready) { return 'Python ' + (ready.python || '') + ' · in this browser'; };
    function sources() {
      if (opts.sources) return Promise.resolve(opts.sources);
      if (window.PZ_PY_SOURCES) return Promise.resolve(window.PZ_PY_SOURCES);
      return new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = opts.sourcesURL;
        s.onload = function () { window.PZ_PY_SOURCES ? res(window.PZ_PY_SOURCES) : rej(new Error('no Python sources')); };
        s.onerror = function () { rej(new Error('could not load ' + opts.sourcesURL)); };
        document.head.appendChild(s);
      });
    }
    this.start = function () {
      setStatus('loading', 'Python · in this browser', 'Loading Python into the browser…');
      return sources().then(function (src) {
        var code = '(' + workerMain.toString() + ')(' + JSON.stringify({ indexURL: opts.pyodide, sources: src }) + ');';
        var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        var w = new Worker(url);
        worker = w;
        queue.splice(0).forEach(function (m) { w.postMessage(m); });   // the worker holds them until Python is up
        w.onmessage = function (e) {
          if (worker !== w) return;
          var msg; try { msg = JSON.parse(e.data); } catch (x) { return; }
          fromPython(msg);
        };
        w.onerror = function (e) {
          if (worker !== w) return;
          worker = null;
          fromPython({ type: 'dead', message: 'Python could not run here (' + (e.message || 'unknown error') + ').' });
        };
      }).catch(function (e) { fromPython({ type: 'dead', message: 'Python could not start: ' + (e.message || e) }); });
    };
    this.run = function (rid, code) {
      var m = JSON.stringify({ type: 'exec', id: rid, code: code });
      if (worker) worker.postMessage(m); else queue.push(m);
    };
    // A browser can't interrupt running Python, only stop it: the next run starts a fresh one.
    this.interrupt = function () {
      if (!worker) return;
      worker.terminate(); worker = null;
      endAll('interrupted', 'a browser can only stop Python by restarting it, so earlier names are gone.');
      backend = null;
      setStatus('off', null, 'Stopped. The next run starts Python again.');
    };
    this.stop = function () { if (worker) worker.terminate(); worker = null; };
  }

  // ── alphaCentaur on this computer, from a deck on the web ──────────────
  // The same kernel messages over plain requests (text/plain bodies, a
  // per-session token, no cookies), so a site's page can reach it.
  function LocalBackend(base, onFail) {
    var session = null, token = null, events = null, queue = [], chain = Promise.resolve(), closed = false;
    this.label = function (ready) { return 'Python ' + (ready.python || '') + ' · AlphaCentaur on this computer'; };
    function post(path, body, keepalive) {
      return fetch(base + '/console/' + path, { method: 'POST', body: JSON.stringify(body || {}), credentials: 'omit', keepalive: !!keepalive })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok) throw new Error(j.error || 'AlphaCentaur answered ' + r.status + '.');
            return j;
          });
        });
    }
    function sendNow(m) {
      chain = chain.then(function () {
        if (closed) return;
        return post(encodeURIComponent(session) + '/send', { token: token, msg: m }).catch(function (e) {
          fromPython({ type: 'cell', id: m.id, status: 'error', output: null, error: { name: 'Error', message: 'Could not reach AlphaCentaur: ' + e.message, traceback: '' } });
        });
      });
    }
    var leave = function () { if (session && !closed) post(encodeURIComponent(session) + '/stop', { token: token }, true).catch(function () {}); };
    this.start = function () {
      setStatus('loading', 'Python · AlphaCentaur', 'Connecting to AlphaCentaur on this computer…');
      post('start', {}).then(function (j) {
        if (closed) return;
        session = j.session; token = j.token;
        events = new EventSource(base + '/console/' + encodeURIComponent(session) + '/events?token=' + encodeURIComponent(token));
        events.onmessage = function (e) {
          var m; try { m = JSON.parse(e.data); } catch (x) { return; }
          fromPython(m);
        };
        events.onerror = function () {
          if (events && events.readyState === EventSource.CLOSED && !closed) {
            closed = true;
            fromPython({ type: 'dead', message: 'The connection to AlphaCentaur closed.' });
          }
        };
        addEventListener('pagehide', leave);
        queue.splice(0).forEach(sendNow);
      }).catch(function (e) {
        if (closed) return;
        closed = true;
        onFail(e.message === 'Failed to fetch' || e.name === 'TypeError' ? 'AlphaCentaur isn’t running on this computer (or the browser blocked the connection).' : e.message, queue.splice(0));
      });
    };
    this.run = function (rid, code) {
      var m = { type: 'exec', id: rid, code: code };
      if (session) sendNow(m); else queue.push(m);
    };
    this.interrupt = function () { if (session && !closed) post(encodeURIComponent(session) + '/interrupt', { token: token }).catch(function () {}); };
    this.stop = function () {
      leave(); closed = true;
      if (events) events.close();
      removeEventListener('pagehide', leave);
    };
  }

  function ensureBackend() {
    if (backend) return backend;
    if (!config || config.relay) return null;
    if (config.kernel) { backend = new KernelBackend(config.kernel); using = 'local'; }
    else if (config.pyodide && config.local && preference() === 'local') {
      using = 'local';
      backend = new LocalBackend(config.local, function (reason, waiting) {
        // Couldn't use this computer's Python: carry on in the browser.
        notify('Using Python in this browser instead: ' + reason);
        using = 'browser';
        backend = new PyodideBackend(config);
        backend.start();
        waiting.forEach(function (m) { backend.run(m.id, m.code); });
      });
    } else if (config.pyodide) { backend = new PyodideBackend(config); using = 'browser'; }
    if (backend) backend.start();
    else setStatus('dead', 'Python', 'Python is not available here.');
    return backend;
  }

  // ── requests ──────────────────────────────────────────────────────────
  function isConsole(win) {
    if (allowed.has(win)) return true;
    var frames = document.querySelectorAll('.pz-console iframe');
    for (var i = 0; i < frames.length; i++) if (frames[i].contentWindow === win) return true;
    return false;
  }

  function handle(d, from) {
    if (config && config.relay) {
      // Pass the request up; remember who asked so the answer comes back to them.
      if (d.op === 'run' && d.rid) owners.set(String(d.rid), from);
      clients.add(from);
      // A deck being presented starts Python as soon as a console is near.
      if (upstream) upstream.postMessage(Object.assign({}, d, { type: 'pz-py' }, d.op === 'hello' ? { warm: true } : {}), '*');
      else send(from, { ev: 'status', state: 'dead', label: 'Python', detail: 'The editor that was running Python is closed.' });
      return;
    }
    if (d.op === 'hello') {
      clients.add(from);
      send(from, statusMsg());
      if (config && (config.warm || d.warm)) ensureBackend();   // start loading while the slide is near
      return;
    }
    // A console's Python menu: run it in the browser, or on this computer (and remember it here).
    if (d.op === 'backend' && offersChoice() && (d.use === 'local' || d.use === 'browser')) {
      try { localStorage.setItem(PREF, d.use); } catch (e) { /* a private window: this page only */ }
      if (backend) backend.stop();
      backend = null;
      endAll('interrupted', 'Python moved, so earlier names are gone.');
      using = d.use;
      setStatus('off', null, '');
      if (d.use === 'local' && !canRemember()) notify('This browser won’t remember the choice; open the deck with ?python=local to choose it again.');
      ensureBackend();
      return;
    }
    if (d.op === 'run' && typeof d.rid === 'string' && typeof d.code === 'string') {
      clients.add(from);
      owners.set(d.rid, from);
      var b = ensureBackend();
      if (b) b.run(d.rid, d.code);
      return;
    }
    if (d.op === 'interrupt' && backend) backend.interrupt();
    if (d.op === 'restart') {
      if (backend) backend.stop();
      backend = null;
      endAll('interrupted', 'Python was restarted.');
      setStatus('off', null, 'Restarted.');
      ensureBackend();
    }
  }

  addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'pz-py') return;
    // From the editor (relay): an answer for one of our consoles, or a status for all of them.
    if (config && config.relay && e.source === upstream) {
      if (d.ev === 'msg' && d.rid) {
        var w = owners.get(String(d.rid));
        if (w) send(w, d);
        if (d.msg && d.msg.type === 'cell' && d.msg.status && d.msg.status !== 'running') owners.delete(String(d.rid));
      } else if (d.ev === 'status') {
        status = { state: d.state, label: d.label, detail: d.detail };
        clients.forEach(function (c) { send(c, d); });
      }
      return;
    }
    if (d.op && isConsole(e.source)) handle(d, e.source);
  });

  function canRemember() { try { localStorage.setItem(PREF + '-test', '1'); localStorage.removeItem(PREF + '-test'); return true; } catch (e) { return false; } }

  window.pzPython = {
    configure: function (c) {
      var same = JSON.stringify(c) === JSON.stringify(config);
      if (same) return;
      if (backend) backend.stop();
      backend = null;
      config = c || null;
      upstream = config && config.relay ? (window.parent !== window ? window.parent : window.opener) : null;
      using = config && config.kernel ? 'local' : offersChoice() ? preference() : 'browser';
      endAll('interrupted', null);
      setStatus('off', '', '');
    },
    allow: function (win) { if (win) allowed.add(win); },
    forget: function (win) { allowed.delete(win); clients.delete(win); },
    status: function () { return Object.assign({}, status); },
    stop: function () { if (backend) backend.stop(); backend = null; setStatus('off', null, ''); },
  };
  if (window.PZ_CONFIG && window.PZ_CONFIG.python) window.pzPython.configure(window.PZ_CONFIG.python);
})();
