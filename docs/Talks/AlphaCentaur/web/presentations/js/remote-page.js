/* Phone remote — the phone page (remote.html). It knows nothing about any
 * particular deck: the presenting deck publishes its titles, notes, controls
 * and theme to the session, and this page renders them.
 *
 *   remote.html?s=<session>&db=<databaseURL>&k=<apiKey>&p=<projectId>[&r=<root>]   (Firebase)
 *   remote.html?local=<session>        (another window on the same computer)
 * Plain script; needs remote-link.js and remote-ui.js. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  if (q.has('preview')) return;      // the editor mounts its own preview here
  var local = q.has('local'), session = q.get('local') || q.get('s');
  var firebase = local ? null : { apiKey: q.get('k') || '', databaseURL: q.get('db') || '', projectId: q.get('p') || '', root: q.get('r') || '' };
  var ui = PZRemoteUI.mount(document.getElementById('app'), { onEvent: onEvent });
  var link = null, deck = null, state = null, params = {}, online = false, wasOnline = false, phone = 'phone' + Math.random().toString(36).slice(2, 10);

  function render() {
    var status = !online ? { text: wasOnline ? 'Reconnecting…' : 'Connecting…' } : { text: local ? 'This computer' : 'Live', ok: true };
    if (!deck) {
      ui.update({ status: status, controls: null, title: 'Remote',
        wait: online ? 'Waiting for the presentation — is it still open? Press R there for a fresh code.' : 'Connecting to the presentation…' });
      return;
    }
    var i = Math.min(Math.max(0, (state && state.index) || 0), (deck.slides || []).length - 1);
    var slide = (deck.slides || [])[i] || {};
    var values = {};
    for (var k in params) if (params[k] && 'v' in params[k]) values[k] = params[k].v;
    ui.update({ title: deck.title, url: deck.url, theme: deck.theme, controls: Array.isArray(slide.r) ? slide.r : [], state: state || { index: 0, count: deck.slides.length }, slides: deck.slides, params: values, status: status });
    document.title = (deck.title || 'Remote') + ' · remote';
  }
  function onEvent(e) {
    if (!link || !online) return;
    var t = Date.now();
    if (e.k === 'param') link.set('params/' + e.name, { v: e.value, t: t });
    else if (e.k === 'joy') link.set('joy/' + e.name, { x: e.x, y: e.y, t: t });
    else link.push('cmd', Object.assign({}, e, { t: t }));
  }
  if (!PZRemoteLink.validSession(session)) {
    ui.update({ status: { text: '' }, controls: null, title: 'Remote', wait: 'Scan the code on the presenter’s screen (press R there).' });
    return;
  }
  render();
  PZRemoteLink.connect({ firebase: firebase, session: session, local: local, role: 'phone' }).then(function (l) {
    link = l;
    l.onConnected(function (ok) {
      online = ok; if (ok) wasOnline = true;
      if (ok) { l.set('phones/' + phone, Date.now()); l.removeOnDisconnect('phones/' + phone); }
      render();
    });
    l.onValue('deck', function (d) { deck = d && typeof d === 'object' ? d : null; render(); });
    l.onValue('state', function (s) { state = s && typeof s === 'object' ? s : null; render(); });
    l.onValue('params', function (p) { params = p && typeof p === 'object' ? p : {}; render(); });
  }).catch(function (e) { ui.update({ status: { text: 'Not connected' }, controls: null, wait: e.message }); });
})();
