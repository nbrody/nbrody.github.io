/* AutoViz kit · core.
   AV.page(options) builds the full-bleed stage (optionally split into panes), the floating
   chrome (title, readout, legend, tour, dock, info sheet), the render loop, pointer handling
   and self-tests. Colour and number formatting live here too. Optional modules
   (draw, plot, linalg, exact, complex, hyperbolic, space3d, gl) extend window.AV.
   No dependencies, no network. Reference: kit/README.md. */
(function () {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const MODE = qs.has('poster') ? 'poster' : qs.has('embed') ? 'embed' : 'full';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- colour ---------------- */

  const C = {
    bg: '#07090d', ink: '#ecebe6', ink2: '#c6c4cc', muted: '#8a8893',
    faint: 'rgba(236,235,230,0.10)', line: 'rgba(255,255,255,0.075)',
    accent: '#6ee7d8', amber: '#ffb86b', rose: '#ff7a93',
    blue: '#86aaff', violet: '#b49cff', green: '#8fe3a0', cream: '#f3dd9a', sky: '#6cc7f0',
  };
  // Categorical order: use PALETTE[0..3] for up to four series; more than four hues on screen is noise.
  const PALETTE = [C.accent, C.amber, C.rose, C.blue, C.violet, C.green];

  function hexRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(color, a = 1) {
    const [r, g, b] = Array.isArray(color) ? color : hexRgb(color);
    return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + a + ')';
  }
  const toLin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const toSrgb = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function oklab([r, g, b]) {
    r = toLin(r); g = toLin(g); b = toLin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromOklab([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)].map(v => Math.max(0, Math.min(255, v)));
  }
  // Perceptual (OKLab) mix of two colours; returns [r,g,b].
  function mix(c1, c2, t) {
    const a = oklab(Array.isArray(c1) ? c1 : hexRgb(c1)), b = oklab(Array.isArray(c2) ? c2 : hexRgb(c2));
    return fromOklab([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  const RAMPS = {
    aurora: ['#5a63e8', '#4fb8e6', '#6ee7d8', '#f3dd9a', '#ffb86b', '#ff7a93'],  // default sequential
    ember: ['#2a1f3d', '#7a3b69', '#d0587e', '#ff9a6b', '#ffe3a3'],               // heat / density
    ice: ['#132033', '#1f4f7a', '#3f8fc0', '#86d0e8', '#e8fbff'],                 // cool density
    diverge: ['#86aaff', '#3a4466', '#1a1d26', '#6b3a4a', '#ff7a93'],             // signed values, centre = 0.5
  };
  // Sequential ramp, t in [0,1] → [r,g,b]. Use AV.rgba(AV.ramp(t), alpha).
  function ramp(t, name = 'aurora') {
    const R = RAMPS[name] || RAMPS.aurora;
    t = Math.max(0, Math.min(1, t)) * (R.length - 1);
    const i = Math.min(R.length - 2, Math.floor(t));
    return mix(R[i], R[i + 1], t - i);
  }

  /* ---------------- numbers + text ---------------- */

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    linear: t => t,
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  };
  // Typographic numbers: true minus sign, trimmed zeros.
  function fmt(x, digits = 3) {
    if (typeof x === 'bigint') return int(x);
    if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
    let s = Number(x).toFixed(digits);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  // Integers (Number or BigInt) with thin-space digit groups past four digits.
  function int(n) {
    const neg = String(n).startsWith('-'), s = String(n).replace('-', '');
    return (neg ? '−' : '') + (s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : s);
  }
  const SUBS = '₀₁₂₃₄₅₆₇₈₉', SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sub = k => String(k).replace(/-/g, '₋').replace(/\d/g, d => SUBS[d]);
  const sup = k => String(k).replace(/-/g, '⁻').replace(/\d/g, d => SUPS[d]);
  const ok = cond => cond ? '<span class="av-ok">✓</span>' : '<span class="av-bad">✗</span>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const words = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

  /* ---------------- icons ---------------- */

  const I = {
    back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8v10.4c0 .5.5.8.9.5l8-5.2a.6.6 0 0 0 0-1L5.4 2.3c-.4-.3-.9 0-.9.5z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>',
    next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6.3"/><path d="M8 7.2v4" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".6" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>',
    reset: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 2.5v2.8h2.8"/></svg>',
    step: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.8v10.4c0 .5.5.8.9.5l6.6-5.2a.6.6 0 0 0 0-1L3.9 2.3c-.4-.3-.9 0-.9.5z"/><rect x="11" y="2.5" width="2.4" height="11" rx="1"/></svg>',
    shuffle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5h2.5c3.5 0 3.5 7 7 7H14M2 11.5h2.5c1.4 0 2.2-1.1 2.8-2.4M9.2 6.9c.6-1.3 1.4-2.4 2.8-2.4H14M12 2.5l2 2-2 2M12 9.5l2 2-2 2"/></svg>',
    minus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h8"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h8M8 4v8"/></svg>',
  };

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  /* ---------------- self-tests ---------------- */

  const tests = [];
  const results = [];
  function test(name, fn) { tests.push({ name, fn }); }
  function runTests() {
    for (const t of tests.splice(0)) {
      let pass = false, detail = '';
      try {
        const r = t.fn();
        pass = r === true || r === undefined;
        if (typeof r === 'string') detail = r;
      } catch (e) { detail = e && e.message ? e.message : String(e); }
      results.push({ name: t.name, pass, detail });
      (pass ? console.info : console.error)('AV ' + (pass ? '✓' : '✗') + ' ' + t.name + (detail ? ' — ' + detail : ''));
    }
  }

  /* ---------------- the page ---------------- */

  function page(o) {
    const app = {
      mode: MODE, reduced: REDUCED, opts: o,
      W: 0, H: 0, dpr: 1, time: 0, frame: 0,
      playing: false, values: {}, stepIndex: -1, panes: [],
      canvas: null, ctx: null, gl: null, svg: null, octx: null,
    };
    window.__AV__ = { app, results, ready: false, posterReady: false, frames: 0, version: 2 };
    document.body.classList.add('av-page', 'av-mode-' + MODE);
    if (o.edgeScrim) document.body.classList.add('av-edge-scrim');
    if (!document.title) document.title = o.title + ' · AutoViz';

    /* stage */
    const kind = o.stage || '2d';
    let stageEl;
    if (kind === 'svg') {
      stageEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      stageEl.setAttribute('class', 'av-stage');
      app.svg = stageEl;
    } else {
      stageEl = el('canvas', 'av-stage');
      app.canvas = stageEl;
      if (kind === 'webgl2') {
        app.gl = stageEl.getContext('webgl2', Object.assign({ antialias: true, alpha: false }, o.glOptions || {}));
        if (!app.gl) console.error('AV: WebGL2 unavailable');
      } else app.ctx = stageEl.getContext('2d');
    }
    document.body.prepend(stageEl);
    app.stage = stageEl;
    // A 2D overlay above a WebGL or SVG stage, for labels and pane frames.
    if (o.overlay || kind !== '2d') {
      const oc = el('canvas', 'av-stage av-overlay');
      stageEl.after(oc);
      app.overlayCanvas = oc;
      app.octx = oc.getContext('2d');
    }
    const ink = () => app.ctx || app.octx;   // where the kit itself draws pane frames

    /* chrome */
    const top = el('div', 'av-top');
    const head = el('header', 'av-head');
    head.innerHTML =
      '<a class="av-back" href="' + (o.back || '../index.html') + '">' + I.back + 'AutoViz</a>' +
      '<h1 class="av-title">' + o.title + '</h1>' +
      (o.hook ? '<p class="av-hook">' + o.hook + '</p>' : '');
    const side = el('div', 'av-side');
    const readout = el('div', 'av-readout av-glass');
    const legend = el('div', 'av-legend');
    side.append(readout, legend);
    top.append(head, side);

    const bottom = el('div', 'av-bottom');
    const tour = el('section', 'av-tour av-glass');
    const right = el('div', 'av-right');
    const hint = el('div', 'av-hint', o.hint ? esc(o.hint) : '');
    const dock = el('div', 'av-dock av-glass');
    right.append(hint, dock);
    bottom.append(tour, right);

    const scrim = el('div', 'av-scrim');
    const sheet = el('aside', 'av-sheet');
    sheet.setAttribute('aria-label', 'The mathematics');
    sheet.innerHTML =
      '<button class="av-btn icon av-close" aria-label="Close">' + I.close + '</button>' +
      '<h2>The mathematics</h2><div class="av-math">' + (o.math || '') + '</div>' +
      '<footer>AutoViz · ' + esc(o.date || '') + ' · ' + esc(o.credit || 'generated by Claude') +
      '<br><kbd>space</kbd> play &nbsp;<kbd>←</kbd><kbd>→</kbd> tour &nbsp;<kbd>i</kbd> this panel</footer>';
    document.body.append(top, bottom, scrim, sheet);
    app.el = { top, head, side, readout, legend, bottom, tour, right, dock, hint, sheet };

    /* readout + legend */
    let lastReadout = null;
    app.readout = html => { if (html !== lastReadout) { lastReadout = html; readout.innerHTML = html; } };
    let lastLegend = null;
    app.legend = items => {
      const html = (items || []).map(it => '<span><i style="background:' + (Array.isArray(it.color) ? rgba(it.color) : it.color) +
        (it.line ? ';height:2px;border-radius:1px' : '') + '"></i>' + it.label + '</span>').join('');
      if (html !== lastLegend) { lastLegend = html; legend.innerHTML = html; layoutChanged(); }
    };

    /* hint */
    if (!o.hint) hint.style.display = 'none';
    app.hideHint = () => hint.classList.add('gone');

    /* info sheet */
    const setSheet = open => { sheet.classList.toggle('open', open); scrim.classList.toggle('open', open); };
    app.info = open => setSheet(open == null ? !sheet.classList.contains('open') : open);
    sheet.querySelector('.av-close').onclick = () => setSheet(false);
    scrim.onclick = () => setSheet(false);

    /* ---- controls ---- */
    const controls = {};
    app.controls = controls;
    let playBtn = null;
    const syncPlay = () => {
      if (!playBtn) return;
      playBtn.innerHTML = app.playing ? I.pause : I.play;
      playBtn.setAttribute('aria-label', app.playing ? 'Pause' : 'Play');
      playBtn.classList.toggle('on', app.playing);
    };
    app.play = (on = true) => { const was = app.playing; app.playing = !!on; syncPlay(); app.redraw(); if (o.onPlay && was !== app.playing) o.onPlay(app.playing, app); };
    app.pause = () => app.play(false);
    app.toggle = () => app.play(!app.playing);

    for (const spec of o.controls || []) {
      if (spec.type === 'play') {
        playBtn = el('button', 'av-btn icon');
        playBtn.onclick = () => app.toggle();
        dock.append(playBtn);
        continue;
      }
      if (spec.type === 'sep') { dock.append(el('span', 'av-sep')); continue; }
      const id = spec.id;
      let node, sync;
      app.values[id] = spec.value;
      if (spec.type === 'segmented') {
        node = el('div', 'av-seg');
        node.setAttribute('role', 'radiogroup');
        if (spec.label) node.setAttribute('aria-label', spec.label);
        const opts = spec.options.map(x => (typeof x === 'object' ? x : { value: x, label: String(x) }));
        opts.forEach(op => {
          const b = el('button', '', op.label);
          b.dataset.value = String(op.value);
          if (op.title) b.title = op.title;
          b.onclick = () => app.set(id, op.value);
          node.append(b);
        });
        sync = v => node.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.value === String(v)));
      } else if (spec.type === 'slider') {
        node = el('label', 'av-slider');
        const input = el('input');
        input.type = 'range';
        input.min = spec.min; input.max = spec.max; input.step = spec.step || 'any';
        const out = el('output');
        const lab = el('span', 'av-slider-label', spec.label || '');
        node.append(lab, input, out);
        input.oninput = () => app.set(id, parseFloat(input.value));
        sync = v => {
          input.value = v;
          input.style.setProperty('--fill', (100 * (v - spec.min) / (spec.max - spec.min)) + '%');
          out.innerHTML = spec.format ? spec.format(v) : fmt(v, 2);
        };
      } else if (spec.type === 'toggle') {
        node = el('button', 'av-btn av-toggle', '<span class="track"></span>' + (spec.label || ''));
        node.onclick = () => app.set(id, !app.values[id]);
        sync = v => node.classList.toggle('on', !!v);
      } else if (spec.type === 'button') {
        node = el('button', 'av-btn' + (spec.primary ? ' primary' : '') + (spec.icon && !spec.label ? ' icon' : ''),
          (spec.icon ? (I[spec.icon] || spec.icon) : '') + (spec.label || ''));
        if (spec.title) { node.title = spec.title; node.setAttribute('aria-label', spec.title); }
        node.onclick = () => app.press(id);
        sync = () => {};
      } else {
        console.error('AV: unknown control type ' + spec.type);
        continue;
      }
      node.dataset.avControl = id;
      controls[id] = { spec, node, sync };
      dock.append(node);
      sync(spec.value);
    }
    const infoBtn = el('button', 'av-btn icon', I.info);
    infoBtn.setAttribute('aria-label', 'The mathematics');
    infoBtn.onclick = () => app.info();
    if (o.math) dock.append(infoBtn);

    app.get = id => app.values[id];
    app.set = (id, v, opt = {}) => {
      const c = controls[id];
      if (c && c.spec.type === 'slider') {
        const st = +c.spec.step;
        if (st > 0) v = c.spec.min + Math.round((v - c.spec.min) / st) * st;
        v = clamp(+v.toFixed(10), c.spec.min, c.spec.max);
      }
      app.values[id] = v;
      if (c) c.sync(v);
      if (!opt.silent && c && c.spec.onChange) c.spec.onChange(v, app);
      app.redraw();
    };
    app.press = id => { const c = controls[id]; if (c && c.spec.onClick) c.spec.onClick(app); app.redraw(); };
    app.pulse = id => {
      const c = controls[id];
      if (!c) return;
      c.node.classList.remove('av-pulse');
      void c.node.offsetWidth;
      c.node.classList.add('av-pulse');
    };

    /* ---- scoped timers (cleared on every tour step change) ---- */
    let scoped = [];
    app.after = (ms, fn) => { const h = setTimeout(fn, REDUCED ? Math.min(ms, 300) : ms); scoped.push(() => clearTimeout(h)); return h; };
    app.every = (ms, fn) => { const h = setInterval(fn, ms); scoped.push(() => clearInterval(h)); return h; };
    const clearScoped = () => { scoped.forEach(f => f()); scoped = []; };

    /* ---- tour ---- */
    const steps = o.tour || [];
    const dots = el('div', 'av-dots');
    const count = el('span', 'av-count');
    const bar = el('div', 'av-tour-bar');
    const prev = el('button', 'av-btn icon small', I.prev);
    const next = el('button', 'av-btn icon small', I.next);
    const fold = el('button', 'av-btn icon small', I.minus);
    prev.setAttribute('aria-label', 'Previous step');
    next.setAttribute('aria-label', 'Next step');
    fold.setAttribute('aria-label', 'Hide tour');
    const caption = el('p', 'av-caption');
    bar.append(dots, count, el('span', 'av-spacer'), prev, next, fold);
    tour.append(bar, caption);
    steps.forEach((s, i) => {
      const d = el('button');
      d.setAttribute('aria-label', 'Step ' + (i + 1));
      d.onclick = () => app.goto(i);
      dots.append(d);
    });
    prev.onclick = () => app.goto(app.stepIndex - 1);
    next.onclick = () => app.goto(app.stepIndex + 1);
    fold.onclick = () => {
      const c = tour.classList.toggle('collapsed');
      fold.innerHTML = c ? I.plus : I.minus;
      fold.setAttribute('aria-label', c ? 'Show tour' : 'Hide tour');
      layoutChanged();
    };
    if (!steps.length) tour.style.visibility = 'hidden';

    app.goto = function (i) {
      if (!steps.length) return;
      i = clamp(i, 0, steps.length - 1);
      clearScoped();
      const first = app.stepIndex < 0;
      app.stepIndex = i;
      dots.querySelectorAll('button').forEach((d, k) => d.classList.toggle('on', k === i));
      count.textContent = (i + 1) + ' / ' + steps.length;
      prev.disabled = i === 0;
      next.disabled = i === steps.length - 1;
      const setText = () => { caption.innerHTML = steps[i].text; caption.classList.remove('swap'); };
      if (first || REDUCED) setText();
      else { caption.classList.add('swap'); setTimeout(setText, 180); }
      if (steps[i].enter) steps[i].enter(app);
      app.redraw();
    };

    /* ---- keyboard ---- */
    addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === ' ' && playBtn) { e.preventDefault(); app.toggle(); }
      else if (k === 'ArrowRight') app.goto(app.stepIndex + 1);
      else if (k === 'ArrowLeft') app.goto(app.stepIndex - 1);
      else if (k === 'i' || k === '?') app.info();
      else if (k === 'Escape') setSheet(false);
      else for (const id in controls) if (controls[id].spec.key === k) { e.preventDefault(); app.press(id); }
    });

    /* ---- panes ---- */
    // o.panes = [{ id, weight, label }], o.split = 'auto' | 'row' | 'column'.
    // Without o.panes the whole viewport is one stage and app.fitCircle / fitRect steer around the chrome.
    const paneSpecs = o.panes || [];
    const R = 12;
    app.panes = paneSpecs.map(s => ({
      id: s.id, label: s.label || '', weight: s.weight || 1, x: 0, y: 0, w: 0, h: 0,
      contains(p) { return p.x >= this.x && p.x <= this.x + this.w && p.y >= this.y && p.y <= this.y + this.h; },
      fitCircle(m = 12) { return { x: this.x + this.w / 2, y: this.y + this.h / 2 + (this.label ? 8 : 0), r: Math.max(8, Math.min(this.w, this.h - (this.label ? 16 : 0)) / 2 - m) }; },
      fitRect(aspect = 1.6, m = 12) {
        const W = this.w - 2 * m, H = this.h - 2 * m - (this.label ? 16 : 0);
        const w = Math.min(W, H * aspect), h = w / aspect;
        const x = this.x + (this.w - w) / 2, y = this.y + (this.h - h) / 2 + (this.label ? 8 : 0);
        return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
      },
    }));
    app.pane = id => app.panes.find(p => p.id === id);
    function layoutPanes() {
      if (!app.panes.length) return;
      const pad = MODE === 'full' ? PAD() : 10, gap = 14;
      let y0 = pad, y1 = app.H - pad;
      if (MODE === 'full') {
        const t = top.getBoundingClientRect(), b = bottom.getBoundingClientRect();
        y0 = t.bottom + 12;
        y1 = b.top - 12;
      }
      const rect = { x: pad, y: y0, w: app.W - 2 * pad, h: Math.max(60, y1 - y0) };
      const dir = o.split === 'row' || o.split === 'column' ? o.split : (app.W >= 760 ? 'row' : 'column');
      const total = app.panes.reduce((s, p) => s + p.weight, 0);
      const avail = (dir === 'row' ? rect.w : rect.h) - gap * (app.panes.length - 1);
      let off = 0;
      for (const p of app.panes) {
        const len = avail * p.weight / total;
        if (dir === 'row') Object.assign(p, { x: rect.x + off, y: rect.y, w: len, h: rect.h });
        else Object.assign(p, { x: rect.x, y: rect.y + off, w: rect.w, h: len });
        off += len + gap;
      }
    }
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    // Draw fn clipped to a pane (2D stage).
    app.roundRect = roundRect;
    app.clip = (pane, fn) => {
      const ctx = app.ctx || app.octx;
      ctx.save(); roundRect(ctx, pane.x, pane.y, pane.w, pane.h, R); ctx.clip(); fn(ctx, pane); ctx.restore();
    };
    function drawPaneFrames() {
      const ctx = ink();
      if (!ctx || !app.panes.length) return;
      for (const p of app.panes) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        roundRect(ctx, p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1, R);
        ctx.stroke();
        if (p.label) {
          ctx.font = '600 10.5px ' + getComputedStyle(document.body).fontFamily;
          ctx.fillStyle = C.muted;
          ctx.textBaseline = 'top';
          if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
          ctx.fillText(p.label.toUpperCase(), p.x + 14, p.y + 12);
        }
        ctx.restore();
      }
    }

    /* ---- pointer ---- */
    let handlers = {};
    app.pointer = h => { handlers = h || {}; };
    const pt = e => {
      const r = stageEl.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      p.pane = app.panes.find(q => q.contains(p)) || null;
      return p;
    };
    let press = null;
    const target = stageEl;
    target.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      app.hideHint();
      const p = pt(e);
      press = { x0: p.x, y0: p.y, x: p.x, y: p.y, drag: false, id: e.pointerId, pane: p.pane };
      try { target.setPointerCapture(e.pointerId); } catch (_) {}
      if (handlers.down) handlers.down(p, e);
      app.redraw();
    });
    target.addEventListener('pointermove', e => {
      const p = pt(e);
      if (press && press.id === e.pointerId) {
        p.pane = press.pane;
        if (!press.drag && Math.hypot(p.x - press.x0, p.y - press.y0) > 4) press.drag = true;
        if (press.drag && handlers.drag) handlers.drag(p, { dx: p.x - press.x, dy: p.y - press.y }, e);
        press.x = p.x; press.y = p.y;
      } else if (handlers.hover) handlers.hover(p, e);
      else return;
      app.redraw();
    });
    const end = e => {
      if (!press || press.id !== e.pointerId) return;
      const p = pt(e);
      p.pane = press.pane;
      if (!press.drag && handlers.tap) handlers.tap(p, e);
      if (handlers.up) handlers.up(p, e, press.drag);
      press = null;
      app.redraw();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('pointerleave', e => { if (!press && handlers.leave) { handlers.leave(pt(e), e); app.redraw(); } });
    target.addEventListener('dblclick', e => { if (handlers.dbl) { handlers.dbl(pt(e), e); app.redraw(); } });
    target.addEventListener('wheel', e => {
      if (!handlers.wheel) return;
      e.preventDefault();
      handlers.wheel(pt(e), e.deltaY, e);
      app.redraw();
    }, { passive: false });
    app.cursor = c => { target.style.cursor = c || ''; };

    /* ---- whole-stage fitting (single-stage pages) ---- */
    function obstacles() {
      if (MODE !== 'full') return [];
      const out = [];
      for (const n of [head, readout, legend, tour, dock, hint]) {
        if (getComputedStyle(n).display === 'none' || getComputedStyle(n).visibility === 'hidden') continue;
        const r = n.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(r);
      }
      return out;
    }
    const PAD = () => (MODE === 'full' ? (innerWidth <= 760 ? 12 : 18) : 8);
    // Largest circle clear of the chrome, as central as possible.
    app.fitCircle = function (margin = 10) {
      const obs = obstacles(), W = app.W, H = app.H, pad = PAD();
      let best = null;
      const N = 24;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = W * (0.2 + 0.6 * i / N), y = H * (0.12 + 0.76 * j / N);
        let r = Math.min(x - pad, W - pad - x, y - pad, H - pad - y) - margin;
        for (const b of obs) {
          const dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
          r = Math.min(r, Math.hypot(dx, dy) - margin);
        }
        const score = r - 0.06 * Math.hypot(x - W / 2, y - H / 2);
        if (!best || score > best.score) best = { x, y, r, score };
      }
      return { x: best.x, y: best.y, r: Math.max(10, best.r) };
    };
    // Largest rectangle of the given aspect (w/h) clear of the chrome.
    app.fitRect = function (aspect = 1.6, margin = 10) {
      const obs = obstacles(), W = app.W, H = app.H, pad = PAD();
      const clear = (x, y, w, h) => {
        const e = pad + margin;
        if (x - w / 2 < e || x + w / 2 > W - e || y - h / 2 < e || y + h / 2 > H - e) return false;
        for (const b of obs) if (x - w / 2 < b.right + margin && x + w / 2 > b.left - margin && y - h / 2 < b.bottom + margin && y + h / 2 > b.top - margin) return false;
        return true;
      };
      let best = { x: W / 2, y: H / 2, w: 40 * aspect, h: 40, score: -1e9 };
      const N = 16;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = W * (0.25 + 0.5 * i / N), y = H * (0.15 + 0.7 * j / N);
        let lo = 0, hi = Math.min(W / aspect, H);
        for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (clear(x, y, m * aspect, m)) lo = m; else hi = m; }
        const score = lo - 0.05 * Math.hypot(x - W / 2, y - H / 2);
        if (score > best.score) best = { x, y, w: lo * aspect, h: lo, score };
      }
      return { x: best.x - best.w / 2, y: best.y - best.h / 2, w: best.w, h: best.h, cx: best.x, cy: best.y };
    };

    /* ---- sizing ---- */
    const resizeHooks = [];
    app.onResize = fn => resizeHooks.push(fn);
    function reserveTour() {
      // Hold the tour card at its tallest caption so the layout never jumps between steps.
      if (MODE !== 'full' || !steps.length || tour.classList.contains('collapsed')) { caption.style.minHeight = ''; return; }
      const probe = el('p', 'av-caption');
      probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:' + caption.clientWidth + 'px';
      tour.append(probe);
      let h = 0;
      for (const s of steps) { probe.innerHTML = s.text; h = Math.max(h, probe.offsetHeight); }
      probe.remove();
      caption.style.minHeight = h + 'px';
    }
    function resize() {
      const W = innerWidth, H = innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      app.W = W; app.H = H; app.dpr = dpr;
      for (const c of [app.canvas, app.overlayCanvas]) if (c) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      if (app.svg) app.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      layoutChanged();
    }
    function layoutChanged() {
      reserveTour();
      layoutPanes();
      for (const f of resizeHooks) f(app);
      app.redraw();
    }
    app.relayout = layoutChanged;
    let rt = 0;
    addEventListener('resize', () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(resize); });

    /* ---- tweens + loop ---- */
    const tweens = new Set();
    app.tween = function (ms, fn, opt = {}) {
      const e = typeof opt.ease === 'function' ? opt.ease : ease[opt.ease || 'inOut'];
      if (REDUCED) ms = Math.min(ms, 120);
      return new Promise(resolve => {
        if (opt.key) for (const other of tweens) if (other.key === opt.key) { tweens.delete(other); other.resolve(false); }
        const tw = { t0: performance.now(), ms, fn, e, resolve, key: opt.key };
        tweens.add(tw);
        fn(0);
        app.redraw();
      });
    };
    app.busy = () => tweens.size > 0;
    let dirty = true;
    app.redraw = () => { dirty = true; };
    let last = performance.now(), faults = 0;
    // An exception in page code is reported (verify.mjs fails on it) but never stops the loop.
    const guard = (fn, what) => {
      try { fn(); } catch (e) { if (faults++ < 3) console.error('AV: ' + what + ' threw — ' + (e && e.stack || e)); }
    };
    function tick(now) {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      app.time += dt;
      if (app.playing && o.step) { guard(() => o.step(dt, app), 'step'); dirty = true; }
      if (tweens.size) {
        for (const tw of [...tweens]) {
          const u = clamp((now - tw.t0) / Math.max(1, tw.ms), 0, 1);
          guard(() => tw.fn(tw.e(u)), 'tween');
          if (u >= 1) { tweens.delete(tw); tw.resolve(true); }
        }
        dirty = true;
      }
      if (o.live) dirty = true;
      if (dirty) {
        dirty = false;
        if (app.ctx) app.ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
        if (app.octx) { app.octx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0); app.octx.clearRect(0, 0, app.W, app.H); }
        if (o.draw) guard(() => o.draw(app), 'draw');
        drawPaneFrames();
        app.frame++;
        window.__AV__.frames++;
      }
    }

    /* ---- boot ---- */
    function boot() {
      resize();
      if (o.setup) o.setup(app);
      const startStep = MODE === 'full'
        ? clamp((parseInt(qs.get('step') || '1', 10) || 1) - 1, 0, Math.max(0, steps.length - 1))
        : (o.posterStep || 0);
      if (steps.length) app.goto(startStep);
      if (o.autoplay !== false && !REDUCED && playBtn) app.play(true);
      else syncPlay();
      layoutChanged();
      requestAnimationFrame(t => { last = t; tick(t); });
      setTimeout(runTests, 0);
      const settle = () => {
        window.__AV__.ready = true;
        if (MODE !== 'poster') return;
        setTimeout(function check() {
          if (tweens.size) return setTimeout(check, 100);
          if (o.posterFreeze !== false) app.pause();
          app.redraw();
          requestAnimationFrame(() => requestAnimationFrame(() => { window.__AV__.posterReady = true; }));
        }, o.posterDelay != null ? o.posterDelay : 1600);
      };
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(settle));
      if (o.hint) setTimeout(() => app.hideHint(), 14000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else setTimeout(boot, 0);

    window.__AV__.meta = () => ({
      title: o.title, hook: o.hook, date: o.date, math: o.math || '',
      steps: steps.map(s => s.text),
      controls: (o.controls || []).filter(c => c.type !== 'play' && c.type !== 'sep').map(c => ({ id: c.id, type: c.type })),
      panes: app.panes.map(p => ({ id: p.id, w: Math.round(p.w), h: Math.round(p.h) })),
      words: { title: words(o.title), hook: words(o.hook), math: words(o.math), steps: steps.map(s => words(s.text)) },
    });
    return app;
  }

  window.AV = Object.assign(window.AV || {}, {
    page, test, C, PALETTE, RAMPS, rgba, mix, ramp, hexRgb,
    clamp, lerp, ease, fmt, int, sub, sup, ok, esc, words, icons: I,
    mode: MODE, reduced: REDUCED,
  });
})();
