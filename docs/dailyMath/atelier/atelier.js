/* Daily Math Atelier — core page shell, dual-mode theme controller, tour, dock, dialog, loop & tests */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  const STORAGE_KEY = 'dailyMath.theme';
  const TESTS = [];

  DM.clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  DM.lerp = (a, b, t) => a + (b - a) * t;
  DM.ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  DM.fmt = function (x, digits = 2) {
    if (!Number.isFinite(x)) return String(x);
    const eps = Math.pow(10, -(digits + 2));
    const v = Math.abs(x) < eps ? 0 : x;
    let s = v.toFixed(digits);
    if (digits > 0) s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s.startsWith('-') ? '\u2212' + s.slice(1) : s;
  };

  DM.int = function (n) {
    const neg = n < 0;
    const s = String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
    return neg ? '\u2212' + s : s;
  };

  DM.check = function (ok, text) {
    const label = text != null ? text : (ok ? 'verified' : 'broken');
    return `<span class="dm-check ${ok ? 'dm-check--ok' : 'dm-check--bad'}"><span aria-hidden="true">${ok ? '\u2713' : '\u2717'}</span><span>${label}</span></span>`;
  };

  DM.test = function (name, fn) {
    TESTS.push({ name, fn });
  };

  function runAllTests() {
    const results = TESTS.map(t => {
      try {
        const out = t.fn();
        const ok = out === true;
        return { name: t.name, ok, message: ok ? '' : (typeof out === 'string' ? out : 'returned ' + out) };
      } catch (err) {
        return { name: t.name, ok: false, message: err && err.message ? err.message : String(err) };
      }
    });
    const failed = results.filter(r => !r.ok).length;
    const summary = { passed: results.length - failed, failed, total: results.length, results };
    root.__DM_TESTS = summary;
    if (failed) console.error('[DailyMath] Self-tests failed:', results.filter(r => !r.ok));
    else console.info(`[DailyMath] ${results.length} self-tests passed.`);
    return summary;
  }

  const ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.2 3.1a.6.6 0 0 1 .9-.52l7.8 4.9a.6.6 0 0 1 0 1.04l-7.8 4.9a.6.6 0 0 1-.9-.52V3.1z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="2.8" width="3.2" height="10.4" rx="1"/><rect x="9.3" y="2.8" width="3.2" height="10.4" rx="1"/></svg>',
    reset: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 7.5a5.3 5.3 0 1 1 1.4 3.9"/><path d="M2.6 4.2v3.4H6"/></svg>',
    step: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5l6.2 4.5-6.2 4.5V3.5z" fill="currentColor"/><path d="M12.2 3.5v9"/></svg>',
    shuffle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 4.5h2.4c1.3 0 2.1.8 3.2 2.4l.4.6c1.1 1.6 1.9 2.4 3.2 2.4h2.4"/><path d="M2.2 11.5h2.4c1.1 0 1.9-.6 2.7-1.6M9.6 5.8c.7-.8 1.4-1.3 2.5-1.3h1.7"/><path d="M12 2.8l1.9 1.7L12 6.2M12 9.8l1.9 1.7-1.9 1.7"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>',
    minus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.2 8h9.6"/></svg>',
    sun: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"/></svg>',
    moon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"><path d="M13.2 9.9A5.4 5.4 0 0 1 6.1 2.8a5.6 5.6 0 1 0 7.1 7.1z"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7.3v3.5"/><circle cx="8" cy="5" r=".6" fill="currentColor" stroke="none"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  };

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // Probe CSS display transitions for top-layer exit animation fallback (Firefox/Safari)
  let _canTransitionDisplay;
  function canTransitionDisplay() {
    if (_canTransitionDisplay !== undefined) return _canTransitionDisplay;
    if (!root.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) return false;
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    _canTransitionDisplay = getComputedStyle(probe).display === 'block';
    probe.remove();
    return _canTransitionDisplay;
  }

  function supportsTopLayerExit() {
    return !!(root.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
  }

  async function closeTopLayer(dialog) {
    if (!dialog.open) return;
    if (!supportsTopLayerExit()) {
      dialog.setAttribute('data-closing', '');
      const anims = dialog.getAnimations({ subtree: true });
      if (anims.length) {
        await Promise.race([
          Promise.allSettled(anims.map(a => a.finished)),
          new Promise(r => setTimeout(r, 400)),
        ]);
      }
      if (!dialog.hasAttribute('data-closing')) return;
      dialog.removeAttribute('data-closing');
    }
    dialog.close();
  }

  DM.page = function (cfg) {
    const params = new URLSearchParams(location.search);
    const mode = params.has('poster') ? 'poster' : params.has('embed') ? 'embed' : 'full';
    document.body.classList.add('dm-is-plate');
    document.body.dataset.mode = mode;

    const plateStr = String(cfg.plate ?? '001').padStart(3, '0');
    const mqDark = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
    const systemTheme = () => (mqDark && mqDark.matches ? 'dark' : 'light');
    const baseTheme = () => (cfg.defaultTheme === 'light' || cfg.defaultTheme === 'dark' ? cfg.defaultTheme : systemTheme());

    let queryTheme = params.get('theme');
    if (queryTheme !== 'light' && queryTheme !== 'dark') queryTheme = null;

    function readStoredTheme() {
      try {
        const s = localStorage.getItem(STORAGE_KEY);
        return s === 'light' || s === 'dark' ? s : null;
      } catch { return null; }
    }

    function writeStoredTheme(val) {
      try {
        if (val == null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, val);
      } catch {}
    }

    function resolvedTheme() {
      return queryTheme || readStoredTheme() || baseTheme();
    }

    DM.currentTheme = resolvedTheme;

    const app = {
      mode,
      W: root.innerWidth,
      H: root.innerHeight,
      dpr: Math.min(root.devicePixelRatio || 1, 2),
      theme: resolvedTheme(),
      palette: DM.palette ? DM.palette(resolvedTheme()) : DM.THEMES[resolvedTheme()],
      panes: [],
      stepIndex: 0,
      playing: false,
    };
    root.__DM_APP = app;

    function syncTheme(redrawNow = true) {
      const th = resolvedTheme();
      app.theme = th;
      app.palette = DM.palette ? DM.palette(th) : DM.THEMES[th];
      document.documentElement.dataset.dmTheme = th;
      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        const hasExplicit = !!(queryTheme || readStoredTheme() || cfg.defaultTheme === 'light' || cfg.defaultTheme === 'dark');
        meta.content = hasExplicit ? th : 'light dark';
      }
      cfg.onThemeChange?.(th, app);
      if (redrawNow) app.redraw();
    }

    app.setTheme = function (next) {
      if (next === 'auto' || next === 'system') {
        queryTheme = null;
        writeStoredTheme(null);
      } else if (next === 'light' || next === 'dark') {
        queryTheme = null;
        if (next === baseTheme()) writeStoredTheme(null);
        else writeStoredTheme(next);
      }
      syncTheme(true);
    };

    function toggleTheme() {
      const target = resolvedTheme() === 'dark' ? 'light' : 'dark';
      if (queryTheme) {
        queryTheme = target;
      } else if (target === baseTheme()) {
        writeStoredTheme(null);
      } else {
        writeStoredTheme(target);
      }
      syncTheme(true);
    }

    if (mqDark && mqDark.addEventListener) {
      mqDark.addEventListener('change', () => syncTheme(true));
    }
    root.addEventListener('storage', ev => {
      if (ev.key === STORAGE_KEY) syncTheme(true);
    });
    root.addEventListener('message', ev => {
      if (ev.data && ev.data.type === 'dm-theme' && (ev.data.theme === 'light' || ev.data.theme === 'dark')) {
        queryTheme = ev.data.theme;
        syncTheme(true);
      }
    });

    /* ---------------- Stage ---------------- */
    const stageEl = el('div', 'dm-stage');
    document.body.appendChild(stageEl);

    let mainCanvas = null;
    if (cfg.stage === 'svg') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('aria-hidden', 'true');
      stageEl.appendChild(svg);
      app.svg = svg;
    } else {
      mainCanvas = document.createElement('canvas');
      stageEl.appendChild(mainCanvas);
      app.canvas = mainCanvas;
      if (cfg.stage === 'webgl2') {
        const gl = mainCanvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
        app.gl = gl;
      } else {
        app.ctx = mainCanvas.getContext('2d');
      }
    }

    let overlayCanvas = null;
    if (cfg.overlay || cfg.stage === 'webgl2' || cfg.stage === 'svg') {
      overlayCanvas = document.createElement('canvas');
      overlayCanvas.className = 'dm-overlay';
      document.body.appendChild(overlayCanvas);
      app.octx = overlayCanvas.getContext('2d');
    }

    app.texLayer = el('div', 'dm-tex-layer');
    document.body.appendChild(app.texLayer);

    if (cfg.frame !== false) {
      document.body.appendChild(el('div', 'dm-frame'));
    }

    let paneLabelLayer = null;
    if (cfg.panes && cfg.panes.length) {
      paneLabelLayer = el('div', 'dm-pane-labels');
      document.body.appendChild(paneLabelLayer);
    }

    /* ---------------- Chrome ---------------- */
    const topBar = el('div', 'dm-top');
    const head = el('header', 'dm-head');
    head.innerHTML =
      `<div class="dm-eyebrow"><a class="dm-back" href="../index.html">\u2190 Daily Math</a><span class="dm-sep">\u00b7</span><span>Plate ${plateStr}</span></div>` +
      `<h1>${cfg.title || 'Untitled Plate'}</h1>` +
      (cfg.hook ? `<p class="dm-hook">${cfg.hook}</p>` : '');
    topBar.appendChild(head);

    const meta = el('div', 'dm-meta');
    const metaRow = el('div', 'dm-meta-row');
    const readoutEl = el('div', 'dm-readout');
    readoutEl.setAttribute('aria-live', 'polite');

    const tools = el('div', 'dm-tools');
    const themeBtn = el('button', 'dm-icon-btn dm-theme-btn');
    themeBtn.type = 'button';
    themeBtn.title = 'Toggle Parchment / Obsidian theme (T)';
    themeBtn.innerHTML =
      `<span class="dm-when-light" aria-hidden="true">${ICONS.moon}</span>` +
      `<span class="dm-when-light dm-sr-only">Switch to dark mode</span>` +
      `<span class="dm-when-dark" aria-hidden="true">${ICONS.sun}</span>` +
      `<span class="dm-when-dark dm-sr-only">Switch to light mode</span>`;
    themeBtn.addEventListener('click', toggleTheme);

    const infoBtn = el('button', 'dm-icon-btn dm-info-btn');
    infoBtn.type = 'button';
    infoBtn.title = 'Mathematical notes (I)';
    infoBtn.setAttribute('aria-label', 'Mathematical notes');
    infoBtn.innerHTML = ICONS.info;

    tools.appendChild(themeBtn);
    tools.appendChild(infoBtn);
    metaRow.appendChild(readoutEl);
    metaRow.appendChild(tools);
    meta.appendChild(metaRow);

    const legendEl = el('div', 'dm-legend');
    meta.appendChild(legendEl);
    topBar.appendChild(meta);
    document.body.appendChild(topBar);

    /* ---------------- Bottom Band (Tour + Dock) ---------------- */
    const bottomBar = el('div', 'dm-bottom');

    const tourSteps = Array.isArray(cfg.tour) ? cfg.tour : [];
    let tourEl = null, tourBody = null, stepCountEl = null, pips = [], prevBtn = null, nextBtn = null;
    if (tourSteps.length) {
      tourEl = el('section', 'dm-tour');
      tourEl.setAttribute('aria-label', 'Guided tour');
      const tourHead = el('div', 'dm-tour-head');
      const pipsWrap = el('div', 'dm-pips');
      pips = tourSteps.map((_, i) => {
        const b = el('button', 'dm-pip');
        b.type = 'button';
        b.setAttribute('aria-label', `Step ${i + 1}`);
        b.addEventListener('click', () => app.goto(i));
        pipsWrap.appendChild(b);
        return b;
      });
      stepCountEl = el('span', 'dm-step-count');
      pipsWrap.appendChild(stepCountEl);

      const nav = el('div', 'dm-tour-nav');
      prevBtn = el('button', 'dm-tour-btn', '\u2039');
      prevBtn.type = 'button';
      prevBtn.setAttribute('aria-label', 'Previous step');
      prevBtn.addEventListener('click', () => app.goto(app.stepIndex - 1));

      nextBtn = el('button', 'dm-tour-btn', '\u203a');
      nextBtn.type = 'button';
      nextBtn.setAttribute('aria-label', 'Next step');
      nextBtn.addEventListener('click', () => app.goto(app.stepIndex + 1));

      const collapseBtn = el('button', 'dm-tour-btn', '\u2212');
      collapseBtn.type = 'button';
      collapseBtn.setAttribute('aria-label', 'Collapse tour');
      collapseBtn.addEventListener('click', () => {
        const collapsed = tourEl.classList.toggle('is-collapsed');
        collapseBtn.textContent = collapsed ? '+' : '\u2212';
        collapseBtn.setAttribute('aria-expanded', String(!collapsed));
        layout();
      });

      nav.append(prevBtn, nextBtn, collapseBtn);
      tourHead.append(pipsWrap, nav);
      tourBody = el('p', 'dm-tour-body');
      tourEl.append(tourHead, tourBody);
      bottomBar.appendChild(tourEl);
    }

    /* ---------------- Dock & Controls ---------------- */
    const dockWrap = el('div', 'dm-dock-wrap');
    const hintEl = cfg.hint ? el('div', 'dm-hint', cfg.hint) : null;
    if (hintEl) dockWrap.appendChild(hintEl);
    const dockEl = el('div', 'dm-dock');
    dockWrap.appendChild(dockEl);
    bottomBar.appendChild(dockWrap);
    document.body.appendChild(bottomBar);

    function dismissHint() {
      if (hintEl && !hintEl.classList.contains('is-gone')) hintEl.classList.add('is-gone');
    }

    const ctrlMap = new Map();
    const ctrlDefs = Array.isArray(cfg.controls) ? cfg.controls : [];
    let hasPlay = false;

    for (const c of ctrlDefs) {
      if (c.type === 'play') {
        hasPlay = true;
        const b = el('button', 'dm-ctrl-btn is-icon');
        b.type = 'button';
        b.setAttribute('aria-label', 'Play or pause (Space)');
        b.title = 'Play / Pause (Space)';
        b.innerHTML = ICONS.play;
        b.addEventListener('click', () => app.toggle());
        dockEl.appendChild(b);
        ctrlMap.set('__play', { def: c, el: b, kind: 'play' });
      } else if (c.type === 'segmented') {
        const wrap = el('div', 'dm-seg');
        wrap.setAttribute('role', 'group');
        if (c.label) wrap.setAttribute('aria-label', c.label);
        let cur = c.value ?? c.options[0].value;
        const btns = c.options.map(opt => {
          const b = el('button', '', opt.label);
          b.type = 'button';
          b.dataset.value = String(opt.value);
          b.setAttribute('aria-pressed', String(opt.value === cur));
          b.addEventListener('click', () => app.set(c.id, opt.value));
          wrap.appendChild(b);
          return { opt, b };
        });
        dockEl.appendChild(wrap);
        ctrlMap.set(c.id, {
          def: c, el: wrap, kind: 'segmented',
          get: () => cur,
          set: (v, silent) => {
            cur = v;
            btns.forEach(({ opt, b }) => b.setAttribute('aria-pressed', String(opt.value === v)));
            if (!silent) c.onChange?.(v, app);
            app.redraw();
          },
        });
      } else if (c.type === 'slider') {
        const wrap = el('label', 'dm-slider');
        const lbl = el('span', 'dm-slider-label', c.label || c.id);
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = c.min ?? 0;
        inp.max = c.max ?? 1;
        inp.step = c.step ?? 'any';
        let cur = Number(c.value ?? inp.min);
        inp.value = String(cur);
        const valEl = el('span', 'dm-slider-val');
        const fmtVal = v => (c.format ? c.format(v, app) : DM.fmt(v, 2));
        valEl.innerHTML = fmtVal(cur);
        inp.addEventListener('input', () => {
          cur = Number(inp.value);
          valEl.innerHTML = fmtVal(cur);
          c.onChange?.(cur, app);
          app.redraw();
        });
        wrap.append(lbl, inp, valEl);
        dockEl.appendChild(wrap);
        ctrlMap.set(c.id, {
          def: c, el: wrap, inp, kind: 'slider',
          get: () => cur,
          set: (v, silent) => {
            cur = Number(v);
            inp.value = String(cur);
            valEl.innerHTML = fmtVal(cur);
            if (!silent) c.onChange?.(cur, app);
            app.redraw();
          },
        });
      } else if (c.type === 'toggle') {
        let cur = !!c.value;
        const b = el('button', 'dm-toggle-btn', c.label || c.id);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(cur));
        b.addEventListener('click', () => app.set(c.id, !cur));
        dockEl.appendChild(b);
        ctrlMap.set(c.id, {
          def: c, el: b, kind: 'toggle',
          get: () => cur,
          set: (v, silent) => {
            cur = !!v;
            b.setAttribute('aria-pressed', String(cur));
            if (!silent) c.onChange?.(cur, app);
            app.redraw();
          },
        });
      } else if (c.type === 'button') {
        const content = c.icon && ICONS[c.icon] ? ICONS[c.icon] : (c.label || c.id);
        const b = el('button', 'dm-ctrl-btn' + (c.icon ? ' is-icon' : '') + (c.primary ? ' is-primary' : ''), content);
        b.type = 'button';
        if (c.title) b.title = c.title;
        if (c.icon) b.setAttribute('aria-label', c.title || c.label || c.id);
        b.addEventListener('click', () => {
          c.onClick?.(app);
          app.redraw();
        });
        dockEl.appendChild(b);
        ctrlMap.set(c.id, { def: c, el: b, kind: 'button', press: () => { c.onClick?.(app); app.redraw(); } });
      }
    }

    app.get = id => ctrlMap.get(id)?.get?.();
    app.set = (id, v, opts) => ctrlMap.get(id)?.set?.(v, opts && opts.silent);
    app.press = id => {
      const rec = ctrlMap.get(id);
      if (rec?.press) rec.press();
      else if (rec?.kind === 'toggle') rec.set(!rec.get());
    };
    app.pulse = id => {
      const rec = ctrlMap.get(id);
      if (!rec) return;
      rec.el.classList.remove('dm-pulse');
      void rec.el.offsetWidth;
      rec.el.classList.add('dm-pulse');
    };

    /* ---------------- Native <dialog> Info Sheet ---------------- */
    const dialog = el('dialog', 'dm-sheet');
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'dm-sheet-title');

    const sheetInner = el('div', 'dm-sheet-inner');
    const sheetHead = el('div', 'dm-sheet-head');
    const sheetTitles = el('div', '', `<div class="dm-sheet-eyebrow">Plate ${plateStr} \u00b7 Mathematical Notes</div><h1 id="dm-sheet-title">${cfg.title || 'Notes'}</h1>`);
    const sheetClose = el('button', 'dm-sheet-close', ICONS.close);
    sheetClose.type = 'button';
    sheetClose.setAttribute('aria-label', 'Close mathematical notes');
    sheetClose.addEventListener('click', () => closeTopLayer(dialog));
    sheetHead.append(sheetTitles, sheetClose);

    const sheetBody = el('div', 'dm-sheet-body', cfg.math || '');
    const sheetFoot = el('div', 'dm-sheet-foot', `<span>${cfg.date || ''}</span><span>${cfg.credit || 'Daily Math Atelier'}</span>`);
    sheetInner.append(sheetHead, sheetBody, sheetFoot);
    dialog.appendChild(sheetInner);
    document.body.appendChild(dialog);

    // Safari fallback for closedby="any"
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (ev, d) => {
        const r = d.getBoundingClientRect();
        return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom;
      };
      let pressedOut = false;
      dialog.addEventListener('pointerdown', ev => { pressedOut = isOutside(ev, dialog); });
      dialog.addEventListener('pointerup', ev => { if (pressedOut && isOutside(ev, dialog)) closeTopLayer(dialog); });
    }

    dialog.addEventListener('cancel', ev => {
      ev.preventDefault();
      closeTopLayer(dialog);
    });
    dialog.addEventListener('close', () => { dialog.returnValue = ''; });

    app.info = open => {
      if (open === undefined) open = !dialog.open;
      if (open && !dialog.open) dialog.showModal();
      else if (!open && dialog.open) closeTopLayer(dialog);
    };
    infoBtn.addEventListener('click', () => app.info(true));

    /* ---------------- Readout & Legend ---------------- */
    let lastReadout = '';
    app.readout = html => {
      if (html === lastReadout) return;
      lastReadout = html;
      readoutEl.innerHTML = html || '';
    };

    app.legend = items => {
      if (!items || !items.length) { legendEl.innerHTML = ''; return; }
      legendEl.innerHTML = items.slice(0, 4).map(it =>
        `<span class="dm-legend-item"><span class="dm-legend-swatch ${it.line ? 'is-line' : ''}" style="background:${it.color}"></span><span>${it.label}</span></span>`
      ).join('');
    };

    /* ---------------- Layout, Safe Rect & Panes ---------------- */
    const resizeFns = [];
    app.onResize = fn => { resizeFns.push(fn); };

    function rectHelpers(r) {
      return {
        ...r,
        cx: r.x + r.w / 2,
        cy: r.y + r.h / 2,
        contains: p => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h,
        fitCircle: (margin = 16) => ({
          x: r.x + r.w / 2,
          y: r.y + r.h / 2,
          r: Math.max(20, Math.min(r.w, r.h) / 2 - margin),
        }),
        fitRect: (aspect = 1.4, margin = 16) => {
          const aw = Math.max(40, r.w - 2 * margin);
          const ah = Math.max(40, r.h - 2 * margin);
          let w = aw, h = aw / aspect;
          if (h > ah) { h = ah; w = ah * aspect; }
          return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
        },
      };
    }

    app.safeRect = function () {
      if (mode !== 'full') return rectHelpers({ x: 14, y: 14, w: Math.max(40, app.W - 28), h: Math.max(40, app.H - 28) });
      const topRect = topBar.getBoundingClientRect();
      const tourRect = tourEl ? tourEl.getBoundingClientRect() : { top: app.H - 20 };
      const dockRect = dockWrap.getBoundingClientRect();
      const topClear = Math.max(24, topRect.bottom + 14);
      const bottomClear = Math.min(app.H - 24, Math.min(tourRect.top, dockRect.top) - 14);
      const padX = app.W <= 680 ? 16 : 30;
      const h = Math.max(120, bottomClear - topClear);
      return rectHelpers({ x: padX, y: topClear, w: Math.max(120, app.W - 2 * padX), h });
    };

    app.fitCircle = (margin = 16) => app.safeRect().fitCircle(margin);
    app.fitRect = (aspect = 1.4, margin = 16) => app.safeRect().fitRect(aspect, margin);
    app.pane = id => app.panes.find(p => p.id === id);

    app.clip = (pane, fn, targetCtx = app.ctx) => {
      if (!targetCtx || !pane) return;
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.rect(pane.x, pane.y, pane.w, pane.h);
      targetCtx.clip();
      fn(targetCtx);
      targetCtx.restore();
    };

    function computePanes() {
      if (!cfg.panes || !cfg.panes.length) { app.panes = []; return; }
      const box = app.safeRect();
      const dir = cfg.split === 'row' || cfg.split === 'column'
        ? cfg.split
        : (box.w >= box.h * 1.05 && app.W > 680 ? 'row' : 'column');
      const gap = 18;
      const sumW = cfg.panes.reduce((a, p) => a + (p.weight || 1), 0);
      let cursor = dir === 'row' ? box.x : box.y;
      const avail = (dir === 'row' ? box.w : box.h) - gap * (cfg.panes.length - 1);
      app.panes = cfg.panes.map((p, idx) => {
        const share = avail * ((p.weight || 1) / sumW);
        const r = dir === 'row'
          ? { id: p.id || String(idx), label: p.label, x: cursor, y: box.y, w: share, h: box.h }
          : { id: p.id || String(idx), label: p.label, x: box.x, y: cursor, w: box.w, h: share };
        cursor += share + gap;
        return { id: r.id, label: r.label, ...rectHelpers(r) };
      });
      if (paneLabelLayer) {
        paneLabelLayer.innerHTML = '';
        for (const p of app.panes) {
          if (!p.label) continue;
          const lbl = el('div', 'dm-pane-label', p.label);
          lbl.style.left = `${Math.round(p.x + 8)}px`;
          lbl.style.top = `${Math.round(p.y + 6)}px`;
          paneLabelLayer.appendChild(lbl);
        }
      }
    }

    function layout() {
      app.W = root.innerWidth;
      app.H = root.innerHeight;
      app.dpr = Math.min(root.devicePixelRatio || 1, 2);
      if (mainCanvas) {
        mainCanvas.width = Math.max(1, Math.round(app.W * app.dpr));
        mainCanvas.height = Math.max(1, Math.round(app.H * app.dpr));
        if (app.ctx) app.ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
      }
      if (overlayCanvas) {
        overlayCanvas.width = Math.max(1, Math.round(app.W * app.dpr));
        overlayCanvas.height = Math.max(1, Math.round(app.H * app.dpr));
        if (app.octx) app.octx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
      }
      if (app.svg) {
        app.svg.setAttribute('viewBox', `0 0 ${app.W} ${app.H}`);
      }
      computePanes();
      resizeFns.forEach(fn => fn(app));
      app.redraw();
    }
    app.relayout = layout;

    /* ---------------- Loop, Tweens & Timers ---------------- */
    let dirty = true;
    const tweens = new Map();
    let stepTimers = [];
    let lastTs = 0;

    app.redraw = () => { dirty = true; };
    app.busy = () => tweens.size > 0;

    app.tween = (ms, fn, opts = {}) => {
      const key = opts.key || Symbol();
      const ease = opts.ease || DM.ease;
      if (tweens.has(key)) tweens.get(key).cancel();
      return new Promise(resolve => {
        const tw = {
          t0: performance.now(),
          ms: Math.max(1, ms),
          fn,
          ease,
          cancel: () => { tweens.delete(key); resolve(false); },
          resolve,
        };
        tweens.set(key, tw);
      });
    };

    app.after = (ms, fn) => {
      const id = setTimeout(() => { fn(app); app.redraw(); }, ms);
      stepTimers.push({ type: 'timeout', id });
      return id;
    };

    app.every = (ms, fn) => {
      const id = setInterval(() => { fn(app); app.redraw(); }, ms);
      stepTimers.push({ type: 'interval', id });
      return id;
    };

    function clearStepTimers() {
      for (const t of stepTimers) {
        if (t.type === 'timeout') clearTimeout(t.id);
        else clearInterval(t.id);
      }
      stepTimers = [];
    }

    function updatePlayBtn() {
      const p = ctrlMap.get('__play');
      if (p) p.el.innerHTML = app.playing ? ICONS.pause : ICONS.play;
    }

    app.play = () => { app.playing = true; updatePlayBtn(); app.redraw(); };
    app.pause = () => { app.playing = false; updatePlayBtn(); app.redraw(); };
    app.toggle = () => { app.playing ? app.pause() : app.play(); };

    /* ---------------- Tour ---------------- */
    app.goto = function (idx) {
      if (!tourSteps.length) return;
      const i = DM.clamp(idx, 0, tourSteps.length - 1);
      app.stepIndex = i;
      for (const tw of [...tweens.values()]) tw.cancel();
      clearStepTimers();
      pips.forEach((p, k) => p.setAttribute('aria-current', k === i ? 'step' : 'false'));
      if (stepCountEl) stepCountEl.textContent = `${i + 1} / ${tourSteps.length}`;
      if (prevBtn) prevBtn.disabled = i === 0;
      if (nextBtn) nextBtn.disabled = i === tourSteps.length - 1;
      if (tourBody) tourBody.innerHTML = tourSteps[i].text || '';
      tourSteps[i].enter?.(app);
      app.redraw();
    };

    /* ---------------- Pointer & Keyboard ---------------- */
    app.pointer = function (handlers = {}) {
      const target = stageEl;
      let downPos = null, lastPos = null, moved = false, activeId = null;

      function pos(ev) {
        const r = target.getBoundingClientRect();
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top;
        const pane = app.panes.find(pn => pn.contains({ x, y })) || null;
        return { x, y, pane, shift: ev.shiftKey, alt: ev.altKey };
      }

      target.addEventListener('pointerdown', ev => {
        if (ev.button !== 0 && ev.pointerType === 'mouse') return;
        dismissHint();
        activeId = ev.pointerId;
        target.setPointerCapture(activeId);
        const p = pos(ev);
        downPos = p;
        lastPos = p;
        moved = false;
        handlers.down?.(p, ev);
        app.redraw();
      });

      target.addEventListener('pointermove', ev => {
        const p = pos(ev);
        if (downPos && ev.pointerId === activeId) {
          if (Math.hypot(p.x - downPos.x, p.y - downPos.y) >= 4) moved = true;
          handlers.drag?.(p, { dx: p.x - lastPos.x, dy: p.y - lastPos.y }, ev);
          lastPos = p;
          app.redraw();
        } else {
          handlers.hover?.(p, ev);
        }
      });

      function end(ev) {
        if (!downPos || ev.pointerId !== activeId) return;
        const p = pos(ev);
        if (!moved) handlers.tap?.(p, ev);
        handlers.up?.(p, ev);
        downPos = null;
        lastPos = null;
        activeId = null;
        app.redraw();
      }
      target.addEventListener('pointerup', end);
      target.addEventListener('pointercancel', end);
      target.addEventListener('dblclick', ev => handlers.dbl?.(pos(ev), ev));
      target.addEventListener('pointerleave', ev => handlers.leave?.(pos(ev), ev));
      if (handlers.wheel) {
        target.addEventListener('wheel', ev => {
          ev.preventDefault();
          handlers.wheel(pos(ev), ev.deltaY, ev);
          app.redraw();
        }, { passive: false });
      }
    };

    app.cursor = c => { stageEl.style.cursor = c || ''; };

    root.addEventListener('keydown', ev => {
      if (dialog.open) return;
      if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if (ev.code === 'ArrowRight' && tourSteps.length) { ev.preventDefault(); app.goto(app.stepIndex + 1); }
      else if (ev.code === 'ArrowLeft' && tourSteps.length) { ev.preventDefault(); app.goto(app.stepIndex - 1); }
      else if (ev.code === 'Space' && hasPlay) { ev.preventDefault(); app.toggle(); }
      else if (ev.key === 'i' || ev.key === 'I') { app.info(); }
      else if (ev.key === 't' || ev.key === 'T') { toggleTheme(); }
    });

    /* ---------------- Frame Loop ---------------- */
    function tick(ts) {
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
      lastTs = ts;

      for (const [key, tw] of [...tweens.entries()]) {
        const u = DM.clamp((ts - tw.t0) / tw.ms, 0, 1);
        tw.fn(tw.ease(u));
        dirty = true;
        if (u >= 1) {
          tweens.delete(key);
          tw.resolve(true);
        }
      }

      if (app.playing && cfg.step) {
        cfg.step(dt, app);
        dirty = true;
      }

      if (dirty || cfg.live) {
        dirty = false;
        cfg.draw?.(app);
      }
      requestAnimationFrame(tick);
    }

    /* ---------------- Boot ---------------- */
    syncTheme(false);
    root.addEventListener('resize', layout);
    queueMicrotask(() => {
      cfg.setup?.(app);
      layout();
      if (tourSteps.length) {
        const startStep = mode === 'full' ? 0 : (cfg.posterStep || 0);
        app.goto(startStep);
      }
      if (cfg.autoplay && hasPlay && mode === 'full') app.play();
      cfg.draw?.(app);
      runAllTests();
      requestAnimationFrame(tick);
    });

    return app;
  };
})(typeof window !== 'undefined' ? window : globalThis);
