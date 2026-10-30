/* Phone remote — the interface. Used by the phone page and by the editor's
 * preview, so what you design is what the phone shows. Plain script; sets
 * self.PZRemoteUI = { mount(root, { onEvent, preview }) → { update(model) } }.
 *
 * model = { title, theme: { colors, fonts, fontURLs }, controls: [...],
 *           state: { index, count, step, steps, startedAt },
 *           slides: [{ t: title, n: notes }], params: { name: value },
 *           url: the deck on the web, for the "Current slide" thumbnail (optional),
 *           status: { text, ok } }
 * events: { k: 'next' | 'prev' | 'goto' (i) | 'button' (name)
 *              | 'param' (name, value) | 'joy' (name, x, y) }   x, y ∈ [−1, 1], y up */
(function (root) {
  'use strict';
  var CSS = [
    '.pzr{--bg:#0b1020;--surface:#18203a;--text:#e9edf8;--muted:#97a3c4;--accent:#7c9cff;--accent2:#f6a85b;--fh:system-ui,sans-serif;--fb:system-ui,sans-serif;',
    'min-height:100%;box-sizing:border-box;background:var(--bg);color:var(--text);font-family:var(--fb);display:flex;flex-direction:column;gap:12px;',
    'padding:max(14px,env(safe-area-inset-top)) 14px max(16px,env(safe-area-inset-bottom));-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;overflow-x:hidden}',
    '.pzr *{box-sizing:border-box;margin:0}',
    '.pzr-head{display:flex;align-items:center;gap:10px;min-height:22px}',
    '.pzr-title{flex:1;font:700 16px/1.2 var(--fh);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pzr-dot{width:9px;height:9px;border-radius:50%;background:#e5534b;flex:none}.pzr-dot.ok{background:#3fb950}',
    '.pzr-status{font-size:12px;color:var(--muted)}',
    '.pzr-card{background:var(--surface);border-radius:18px;padding:14px 16px}',
    '.pzr-thumb{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:var(--bg)}',
    '.pzr-thumb iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}',
    '.pzr-thumb-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;font-size:13px;line-height:1.4;color:var(--muted)}',
    '.pzr-label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:8px}',
    '.pzr-btn{appearance:none;border:0;border-radius:16px;background:var(--surface);color:var(--text);font:600 18px/1.1 var(--fb);padding:14px;min-height:58px;touch-action:manipulation;cursor:pointer;width:100%}',
    '.pzr-btn.accent{background:var(--accent);color:var(--bg)}',
    '.pzr-btn:active{transform:scale(.97);filter:brightness(1.12)}',
    '.pzr-nav{display:grid;grid-template-columns:1fr 1.6fr;gap:10px}.pzr-nav .pzr-btn{min-height:76px;font-size:21px}',
    '.pzr>.pzr-nav:last-child,.pzr>.pzr-btn:last-child{margin-top:auto}',
    '.pzr-next{min-height:36vh;flex:1 1 auto;font-size:30px;border-radius:24px}',
    '.pzr-progress{display:flex;align-items:baseline;gap:6px;font-family:var(--fh)}.pzr-progress b{font-size:30px;line-height:1}.pzr-progress span{color:var(--muted);font-size:15px}',
    '.pzr-progress em{margin-left:auto;font-style:normal;color:var(--muted);font-size:13px}',
    '.pzr-bar{height:5px;border-radius:3px;background:color-mix(in srgb,var(--text) 14%,transparent);overflow:hidden;margin-top:10px}.pzr-bar i{display:block;height:100%;background:var(--accent);transition:width .3s}',
    '.pzr-timer{display:flex;align-items:center;justify-content:space-between}.pzr-time{font:700 38px/1 var(--fh);font-variant-numeric:tabular-nums}',
    '.pzr-small{appearance:none;border:0;border-radius:10px;background:color-mix(in srgb,var(--text) 12%,transparent);color:var(--text);font:600 13px var(--fb);padding:8px 12px;cursor:pointer}',
    '.pzr-notes{font-size:17px;line-height:1.45;white-space:pre-wrap;max-height:32vh;overflow:auto;-webkit-user-select:text;user-select:text}',
    '.pzr-notes.empty,.pzr-upnext.empty{color:var(--muted);font-style:italic}',
    '.pzr-upnext{font:600 17px/1.3 var(--fh)}',
    '.pzr-text{font-size:15px;line-height:1.45;color:var(--muted)}',
    '.pzr-row{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.pzr-val{font-variant-numeric:tabular-nums;color:var(--muted);font-size:15px}',
    '.pzr-range{width:100%;height:36px;accent-color:var(--accent);margin-top:4px}',
    '.pzr-switch{appearance:none;border:0;width:58px;height:34px;border-radius:17px;background:color-mix(in srgb,var(--text) 22%,transparent);position:relative;cursor:pointer;flex:none}',
    '.pzr-switch i{position:absolute;top:3px;left:3px;width:28px;height:28px;border-radius:50%;background:#fff;transition:left .15s}.pzr-switch.on{background:var(--accent)}.pzr-switch.on i{left:27px}',
    '.pzr-joy{width:min(70vw,270px);aspect-ratio:1;border-radius:50%;margin:6px auto 2px;position:relative;touch-action:none;cursor:grab;',
    'background:radial-gradient(circle,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%),var(--bg);border:2px solid color-mix(in srgb,var(--accent) 50%,transparent)}',
    '.pzr-joy:before,.pzr-joy:after{content:"";position:absolute;background:color-mix(in srgb,var(--text) 14%,transparent)}.pzr-joy:before{left:50%;top:12%;bottom:12%;width:1px}.pzr-joy:after{top:50%;left:12%;right:12%;height:1px}',
    '.pzr-knob{position:absolute;left:50%;top:50%;width:34%;height:34%;margin:-17% 0 0 -17%;border-radius:50%;background:var(--accent);box-shadow:0 8px 20px rgba(0,0,0,.35);z-index:1}',
    '.pzr-slides{display:flex;flex-direction:column;gap:2px;max-height:36vh;overflow:auto}',
    '.pzr-slides button{appearance:none;text-align:left;font:15px/1.3 var(--fb);padding:9px 10px;border-radius:10px;border:0;background:transparent;color:var(--text);cursor:pointer;display:flex;gap:10px}',
    '.pzr-slides button span{color:var(--muted);min-width:1.6em;font-variant-numeric:tabular-nums}.pzr-slides button.on{background:color-mix(in srgb,var(--accent) 26%,transparent)}',
    '.pzr-wait{margin:auto;text-align:center;color:var(--muted);font-size:15px;line-height:1.5;padding:30px 10px}',
  ].join('');

  var COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]*\))$/i;
  var FONT_NAME = /^[\w ]{1,40}$/;
  var KEYS = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2'];

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function styleOnce(doc) {
    if (doc.getElementById('pzr-css')) return;
    var s = doc.createElement('style'); s.id = 'pzr-css'; s.textContent = CSS; doc.head.appendChild(s);
  }
  function applyTheme(el, theme) {
    if (!theme) return;
    var c = theme.colors || {}, f = theme.fonts || {};
    KEYS.forEach(function (k) { if (COLOR.test(String(c[k] || '').trim())) el.style.setProperty('--' + k, c[k]); });
    var stack = function (name, fb) { return FONT_NAME.test(name || '') ? '"' + name + '", ' + fb : fb; };
    el.style.setProperty('--fh', stack(f.heading, 'system-ui, sans-serif'));
    el.style.setProperty('--fb', stack(f.body, 'system-ui, sans-serif'));
    (theme.fontURLs || []).forEach(function (u) {
      if (!/^https:\/\/fonts\.googleapis\.com\/css2\?[\w=:;@,.+&%-]+$/.test(u)) return;
      if (document.querySelector('link[data-pzr-font="' + u + '"]')) return;
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; l.setAttribute('data-pzr-font', u); document.head.appendChild(l);
    });
  }
  var fmt = function (ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  var roundTo = function (v, step) { if (!step) return v; var d = String(step).split('.')[1]; return +(Math.round(v / step) * step).toFixed(d ? d.length : 0); };

  function mount(rootEl, opts) {
    opts = opts || {};
    styleOnce(rootEl.ownerDocument);
    var el = h('div', 'pzr'), emit = opts.onEvent || function () {};
    rootEl.replaceChildren(el);
    var model = {}, key = null, dyn = [], values = {}, timerBase = null, timerOff = 0, tick = null;
    var send = function (e) { if (navigator.vibrate && !opts.preview) try { navigator.vibrate(8); } catch (x) {} emit(e); };

    function head() {
      var row = h('div', 'pzr-head'), dot = h('i', 'pzr-dot'), title = h('div', 'pzr-title'), status = h('div', 'pzr-status');
      row.append(dot, title, status);
      dyn.push(function (m) {
        title.textContent = m.title || 'Remote';
        dot.className = 'pzr-dot' + (m.status && m.status.ok ? ' ok' : '');
        status.textContent = (m.status && m.status.text) || '';
      });
      return row;
    }
    var st = function (m) { return m.state || { index: 0, count: (m.slides || []).length || 1 }; };

    var build = {
      nav: function () {
        var g = h('div', 'pzr-nav'), b = h('button', 'pzr-btn', '‹ Back'), n = h('button', 'pzr-btn accent', 'Next ›');
        b.onclick = function () { send({ k: 'prev' }); }; n.onclick = function () { send({ k: 'next' }); };
        g.append(b, n); return g;
      },
      next: function (c) { var b = h('button', 'pzr-btn accent pzr-next', c.label || 'Next'); b.onclick = function () { send({ k: 'next' }); }; return b; },
      prev: function (c) { var b = h('button', 'pzr-btn', c.label || '‹ Back'); b.onclick = function () { send({ k: 'prev' }); }; return b; },
      // A small live copy of the deck, following the presenter (runtime/deck.js ?pz-thumb).
      slide: function () {
        var card = h('div', 'pzr-card'), lab = h('div', 'pzr-label', 'Current slide'), box = h('div', 'pzr-thumb');
        var empty = h('div', 'pzr-thumb-empty', 'The current slide shows here when the presentation is on the web.');
        var frame = null, ready = false;
        card.append(lab, box);
        var post = function (m) {
          if (!frame || !ready) return;
          var s = st(m);
          try { frame.contentWindow.postMessage({ type: 'pz-control', index: s.index || 0, step: s.step || 0 }, '*'); } catch (e) {}
        };
        dyn.push(function (m) {
          var url = typeof m.url === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(m.url) ? m.url.split(/[?#]/)[0] : '';
          if (!url) { frame = null; box.replaceChildren(empty); return; }
          if (!frame || frame.getAttribute('data-url') !== url) {
            frame = document.createElement('iframe'); ready = false;
            frame.setAttribute('data-url', url); frame.title = 'Current slide'; frame.tabIndex = -1;
            frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
            frame.onload = function () { ready = true; post(model); };
            frame.src = url + '?pz-thumb=1#pz-' + (st(m).index || 0);
            box.replaceChildren(frame);
          }
          post(m);
        });
        return card;
      },
      progress: function () {
        var card = h('div', 'pzr-card'), row = h('div', 'pzr-progress'), n = h('b'), of = h('span'), steps = h('em'), bar = h('div', 'pzr-bar'), fill = h('i');
        row.append(n, of, steps); bar.append(fill); card.append(row, bar);
        dyn.push(function (m) {
          var s = st(m);
          n.textContent = (s.index || 0) + 1; of.textContent = '/ ' + (s.count || 1);
          steps.textContent = s.steps ? 'build ' + (s.step || 0) + ' of ' + s.steps : '';
          fill.style.width = ((s.count > 1 ? (s.index || 0) / (s.count - 1) : 1) * 100) + '%';
        });
        return card;
      },
      timer: function () {
        var card = h('div', 'pzr-card'), lab = h('div', 'pzr-label', 'Elapsed'), row = h('div', 'pzr-timer'), t = h('div', 'pzr-time', '0:00'), r = h('button', 'pzr-small', 'Reset');
        r.onclick = function () { timerOff = Date.now() - (timerBase || Date.now()); };
        row.append(t, r); card.append(lab, row);
        var draw = function () { t.textContent = fmt(timerBase ? Date.now() - timerBase - timerOff : 0); };
        dyn.push(draw);
        if (!tick) tick = setInterval(function () { draw(); }, 1000);
        return card;
      },
      notes: function () {
        var card = h('div', 'pzr-card'), lab = h('div', 'pzr-label', 'Notes'), body = h('div', 'pzr-notes');
        card.append(lab, body);
        dyn.push(function (m) { var s = (m.slides || [])[st(m).index || 0]; var n = s && s.n; body.textContent = n || 'No notes for this slide.'; body.className = 'pzr-notes' + (n ? '' : ' empty'); });
        return card;
      },
      upnext: function () {
        var card = h('div', 'pzr-card'), lab = h('div', 'pzr-label', 'Up next'), body = h('div', 'pzr-upnext');
        card.append(lab, body);
        dyn.push(function (m) { var s = st(m), nx = (m.slides || [])[(s.index || 0) + 1]; body.textContent = nx ? (nx.t || 'Slide ' + ((s.index || 0) + 2)) : 'End of the talk'; body.className = 'pzr-upnext' + (nx ? '' : ' empty'); });
        return card;
      },
      slides: function () {
        var card = h('div', 'pzr-card'), lab = h('div', 'pzr-label', 'Slides'), list = h('div', 'pzr-slides');
        card.append(lab, list);
        var drawn = -1;
        dyn.push(function (m) {
          var ss = m.slides || [];
          if (drawn !== ss.length) {
            drawn = ss.length; list.replaceChildren();
            ss.forEach(function (s, i) {
              var b = h('button'); b.append(h('span', null, String(i + 1)), h('b', null, s.t || 'Slide ' + (i + 1)));
              b.onclick = function () { send({ k: 'goto', i: i }); }; list.append(b);
            });
          }
          Array.prototype.forEach.call(list.children, function (b, i) { b.classList.toggle('on', i === (st(m).index || 0)); });
        });
        return card;
      },
      text: function (c) { var card = h('div', 'pzr-card'); card.append(h('div', 'pzr-text', c.text || '')); return card; },
      slider: function (c) {
        var card = h('div', 'pzr-card'), row = h('div', 'pzr-row'), lab = h('div', 'pzr-label', c.label || c.name), val = h('span', 'pzr-val');
        var input = h('input', 'pzr-range'); input.type = 'range'; input.min = c.min; input.max = c.max; input.step = c.step || 'any';
        var v = c.name in values ? values[c.name] : c.value; input.value = v; val.textContent = roundTo(+v, c.step);
        row.append(lab, val); lab.style.margin = '0'; card.append(row, input);
        var last = 0, pending = null;
        var fire = function () { last = Date.now(); pending = null; values[c.name] = +input.value; send({ k: 'param', name: c.name, value: +input.value }); };
        input.oninput = function () {
          val.textContent = roundTo(+input.value, c.step);
          if (Date.now() - last > 70) fire(); else if (!pending) pending = setTimeout(fire, 70);
        };
        input.onchange = fire;
        dyn.push(function (m) { var p = m.params && m.params[c.name]; if (p != null && document.activeElement !== input && +p !== +input.value) { input.value = p; val.textContent = roundTo(+p, c.step); values[c.name] = +p; } });
        return card;
      },
      toggle: function (c) {
        var card = h('div', 'pzr-card pzr-row'), lab = h('div', 'pzr-label', c.label || c.name), sw = h('button', 'pzr-switch');
        sw.append(h('i')); lab.style.margin = '0';
        var on = c.name in values ? !!values[c.name] : !!c.value;
        var draw = function () { sw.classList.toggle('on', on); sw.setAttribute('aria-pressed', String(on)); };
        sw.onclick = function () { on = !on; values[c.name] = on; draw(); send({ k: 'param', name: c.name, value: on }); };
        draw(); card.append(lab, sw);
        dyn.push(function (m) { var p = m.params && m.params[c.name]; if (p != null && !!p !== on) { on = !!p; values[c.name] = on; draw(); } });
        return card;
      },
      button: function (c) { var b = h('button', 'pzr-btn', c.label || c.name); b.onclick = function () { send({ k: 'button', name: c.name }); }; return b; },
      joystick: function (c) {
        var card = h('div', 'pzr-card'), lab = h('div', 'pzr-label', c.label || c.name), pad = h('div', 'pzr-joy'), knob = h('div', 'pzr-knob');
        pad.append(knob); card.append(lab, pad);
        var x = 0, y = 0, held = false, timer = null;
        var place = function () { knob.style.left = (50 + x * 33) + '%'; knob.style.top = (50 - y * 33) + '%'; };
        var move = function (e) {
          var r = pad.getBoundingClientRect(), R = r.width / 2;
          var dx = (e.clientX - r.left - R) / (R * 0.66), dy = (e.clientY - r.top - R) / (R * 0.66), len = Math.hypot(dx, dy);
          if (len > 1) { dx /= len; dy /= len; }
          x = +dx.toFixed(3); y = +(-dy).toFixed(3); place();
        };
        var fire = function () { send({ k: 'joy', name: c.name, x: x, y: y }); };
        pad.onpointerdown = function (e) { held = true; pad.setPointerCapture(e.pointerId); move(e); fire(); if (!timer) timer = setInterval(function () { if (held) fire(); }, 70); };
        pad.onpointermove = function (e) { if (held) move(e); };
        pad.onpointerup = pad.onpointercancel = function () { held = false; x = 0; y = 0; place(); fire(); clearInterval(timer); timer = null; };
        return card;
      },
    };

    function render() {
      var k = JSON.stringify([model.controls || null, (model.slides || []).length]);
      if (k !== key) {
        key = k; dyn = []; el.replaceChildren(head());
        if (!model.controls) {
          var wait = h('div', 'pzr-wait'); el.append(wait);
          dyn.push(function (m) { wait.textContent = m.wait || 'Waiting for the presentation…'; });
        } else {
          (model.controls || []).forEach(function (c) { var f = build[c.type]; if (f) el.append(f(c)); });
        }
      }
      dyn.forEach(function (f) { f(model); });
    }
    return {
      el: el,
      update: function (m) {
        for (var k in m) model[k] = m[k];
        if (m.theme) applyTheme(el, m.theme);
        if (m.state && m.state.startedAt) timerBase = m.state.startedAt;
        render();
      },
      destroy: function () { clearInterval(tick); el.remove(); },
    };
  }
  root.PZRemoteUI = { mount: mount, css: CSS };
})(self);
