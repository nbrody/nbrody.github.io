/* alphaPresent (alphaCentaur) — phone remote, presenter side. Inlined into an
 * exported deck after deck.js when the deck's remote is on, together with
 * qrcode.js and remote-link.js; window.PZ_REMOTE carries the configuration.
 *
 * Press R for the QR code. Phones send navigation commands, which drive the
 * deck, and parameter / joystick / button events, which are posted to the
 * applets and embeds on the current slide:
 *   { type: 'pz-param', name, value }   { type: 'pz-joystick', name, x, y }
 *   { type: 'pz-button', name } */
(function () {
  'use strict';
  var R = window.PZ_REMOTE, D = window.pzDeck;
  // The phone's thumbnail is a copy of this deck (?pz-thumb): it isn't a presenter.
  if (/[?&]pz-thumb(?:[=&]|$)/.test(location.search)) return;
  // Where phones can load this deck for their "Current slide" thumbnail: only a
  // deck on the web has an address they can reach (not blob: or file:).
  var deckURL = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
  if (!R || !window.PZRemoteLink || !D) return;
  var css = '.pz-remote-overlay{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;background:color-mix(in srgb,var(--pz-bg) 82%,transparent);backdrop-filter:blur(6px);font-family:var(--pz-font-body);color:var(--pz-text)}' +
    '.pz-remote-overlay.open{display:flex}' +
    '.pz-remote-card{background:var(--pz-surface);border-radius:28px;padding:34px 38px;display:flex;gap:34px;align-items:center;max-width:min(860px,92vw);box-shadow:0 30px 80px rgba(0,0,0,.35)}' +
    '.pz-remote-qr{background:#fff;border-radius:16px;padding:14px;line-height:0;flex:none}.pz-remote-qr svg{width:min(260px,32vw);height:auto;display:block}' +
    '.pz-remote-card h2{font:700 30px/1.15 var(--pz-font-heading);margin:0 0 10px}.pz-remote-card p{margin:0 0 10px;font-size:16px;line-height:1.5;color:var(--pz-muted)}' +
    '.pz-remote-status{display:flex;align-items:center;gap:8px;font-size:15px;margin:16px 0 6px;color:var(--pz-text)}.pz-remote-status i{width:9px;height:9px;border-radius:50%;background:#e5534b}.pz-remote-status.ok i{background:#3fb950}' +
    '.pz-remote-code{font:600 13px/1.4 var(--pz-font-mono);color:var(--pz-muted);word-break:break-all}' +
    '.pz-remote-card a{color:var(--pz-accent)}' +
    '.pz-remote-hint{position:fixed;left:18px;bottom:16px;z-index:61;font:500 13px var(--pz-font-body);color:var(--pz-muted);background:color-mix(in srgb,var(--pz-surface) 85%,transparent);padding:7px 12px;border-radius:999px;opacity:0;transition:opacity .4s;pointer-events:none}' +
    '.pz-remote-hint.show{opacity:1}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // Keep the session across reloads of the same deck in this tab.
  var key = 'pz-remote-session:' + (R.deckId || 'deck'), session = null;
  try { session = sessionStorage.getItem(key); } catch (e) {}
  if (!PZRemoteLink.validSession(session)) { session = PZRemoteLink.newSession(); try { sessionStorage.setItem(key, session); } catch (e) {} }

  var fb = R.firebase;
  var phoneURL = fb && R.page
    ? R.page + (R.page.indexOf('?') < 0 ? '?' : '&') + 's=' + session + '&db=' + encodeURIComponent(fb.databaseURL) + '&k=' + encodeURIComponent(fb.apiKey) + '&p=' + encodeURIComponent(fb.projectId) + (fb.root ? '&r=' + encodeURIComponent(fb.root) : '')
    : '';
  var localURL = R.localPage ? R.localPage + '?local=' + session : '';

  // ---------------------------------------------------------------- overlay --
  var ov = document.createElement('div'); ov.className = 'pz-remote-overlay';
  var card = document.createElement('div'); card.className = 'pz-remote-card';
  var qrBox = document.createElement('div'); qrBox.className = 'pz-remote-qr';
  var text = document.createElement('div');
  var statusEl = document.createElement('div'); statusEl.className = 'pz-remote-status';
  card.append(qrBox, text); ov.append(card); document.body.appendChild(ov);
  function qrSVG(url) {
    if (!window.qrcode) return '';
    var q = window.qrcode(0, 'M'); q.addData(url); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  }
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function drawOverlay() {
    text.replaceChildren();
    text.append(el('h2', null, 'Phone remote'));
    if (phoneURL) {
      qrBox.style.display = ''; qrBox.innerHTML = qrSVG(phoneURL);
      text.append(el('p', null, 'Scan with your phone’s camera to control this presentation.'));
    } else {
      qrBox.style.display = 'none';
      text.append(el('p', null, fb ? 'Set the phone page address in the editor (Design → Phone remote) to get a QR code.' : 'Firebase isn’t set up for this deck, so the remote works on this computer only.'));
    }
    text.append(statusEl);
    if (localURL) {
      var p = el('p'), a = el('a', null, 'Open the remote in a window on this computer');
      a.href = localURL; a.target = '_blank'; a.rel = 'opener';
      a.onclick = function (e) {
        e.preventDefault();
        // Opening a window takes the browser out of fullscreen; tell the editor
        // (if it is presenting this deck) not to end the presentation for that.
        try { if (parent !== window) parent.postMessage({ type: 'pz-keep-open' }, '*'); } catch (x) {}
        window.open(localURL, 'pz-remote-' + session, 'popup=yes,width=420,height=860');
      };
      p.append(a); text.append(p);
    }
    text.append(el('div', 'pz-remote-code', 'Session ' + session + ' · press R or Esc to close'));
  }
  var phones = 0, connected = false;
  function drawStatus() {
    statusEl.className = 'pz-remote-status' + (phones ? ' ok' : '');
    statusEl.replaceChildren(el('i'), document.createTextNode(
      !connected ? 'Connecting…' : phones ? (phones === 1 ? '1 remote connected' : phones + ' remotes connected') : 'Waiting for a phone…'));
  }
  var toggle = function (on) { ov.classList.toggle('open', on == null ? !ov.classList.contains('open') : on); };
  ov.addEventListener('click', function (e) { if (e.target === ov) toggle(false); });
  window.pzKeyHook = function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === 'r' || e.key === 'R') { toggle(); return true; }
    if (e.key === 'Escape' && ov.classList.contains('open')) { toggle(false); return true; }
    return false;
  };
  var hint = el('div', 'pz-remote-hint', 'R · phone remote'); document.body.appendChild(hint);
  setTimeout(function () { hint.classList.add('show'); }, 600);
  setTimeout(function () { hint.classList.remove('show'); }, 4600);
  drawOverlay(); drawStatus();

  // ------------------------------------------------------------------- link --
  var post = function (msg) { D.frames().forEach(function (f) { try { f.contentWindow && f.contentWindow.postMessage(msg, '*'); } catch (e) {} }); };
  var NAME = /^[A-Za-z_][\w-]{0,39}$/;
  var paramValues = {}, seen = {}, startedAt = Date.now();
  PZRemoteLink.connectPresenter(fb, session).then(function (link) {
    link.removeOnDisconnect('');
    link.set('deck', deckURL ? Object.assign({}, R.deck, { url: deckURL }) : R.deck);
    var publish = function () { var s = D.state(); s.startedAt = startedAt; link.set('state', s); };
    document.addEventListener('pz-state', publish);
    publish();
    link.onConnected(function (ok) { connected = ok; drawStatus(); });
    link.onValue('phones', function (p) {
      var n = p && typeof p === 'object' ? Object.keys(p).length : 0;
      // A phone has just scanned the code: get the overlay out of the way.
      if (n > phones && ov.classList.contains('open')) setTimeout(function () { toggle(false); }, 1600);
      phones = n; drawStatus();
    });
    link.onChild('cmd', function (c, done) {
      if (done) done();
      if (!c || typeof c !== 'object' || Date.now() - (+c.t || 0) > 15000) return;
      if (c.k === 'next') D.next();
      else if (c.k === 'prev') D.prev();
      else if (c.k === 'goto' && Number.isInteger(c.i) && c.i >= 0 && c.i < D.count) D.go(c.i, 1);
      else if (c.k === 'button' && NAME.test(c.name || '')) post({ type: 'pz-button', name: c.name });
    });
    // Sliders and switches: latest value wins; a slide's applets get the
    // current values when the slide is reached, too.
    link.onValue('params', function (p) {
      if (!p || typeof p !== 'object') return;
      Object.keys(p).forEach(function (name) {
        var v = p[name];
        if (!NAME.test(name) || !v || typeof v !== 'object' || seen['p:' + name] === v.t) return;
        if (!(typeof v.v === 'number' || typeof v.v === 'boolean')) return;
        seen['p:' + name] = v.t; paramValues[name] = v.v;
        post({ type: 'pz-param', name: name, value: v.v });
      });
    });
    link.onValue('joy', function (j) {
      if (!j || typeof j !== 'object') return;
      Object.keys(j).forEach(function (name) {
        var v = j[name];
        if (!NAME.test(name) || !v || seen['j:' + name] === v.t) return;
        seen['j:' + name] = v.t;
        var x = Math.max(-1, Math.min(1, +v.x || 0)), y = Math.max(-1, Math.min(1, +v.y || 0));
        post({ type: 'pz-joystick', name: name, x: x, y: y });
      });
    });
    // An applet that has just loaded asks for the current values (pz API, render.js).
    addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'pz-applet-ready' || !e.source) return;
      Object.keys(paramValues).forEach(function (n) { try { e.source.postMessage({ type: 'pz-param', name: n, value: paramValues[n] }, '*'); } catch (x) {} });
    });
    addEventListener('pagehide', function () { link.remove(''); });
  }).catch(function (e) { connected = false; statusEl.textContent = 'Remote unavailable: ' + e.message; });
})();
