/*
 * texcast — animated LaTeX stored as text.
 *
 * A .texcast file is JSON lines: a header object, then [delay, type, ...]
 * events (see README.md). This player typesets each LaTeX snapshot with KaTeX
 * and morphs matching glyphs from one snapshot to the next.
 *
 *   <script src="texcast/player.js"></script>
 *   <texcast-player src="demo.texcast" autoplay loop></texcast-player>
 *
 * KaTeX is loaded from jsDelivr unless the page has already loaded it.
 */
(() => {
  'use strict';
  if (window.Texcast) return;

  const KATEX_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  const DEFAULT_MORPH = 0.6; // seconds
  const DEFAULT_HOLD = 2; // seconds held on the last frame
  const SPEEDS = [1, 1.5, 2, 0.5];
  const EASE = 'cubic-bezier(.5, 0, .2, 1)';
  const MAX_MEASURED = 150;

  // Colour macros that follow light/dark mode: \blue{...} becomes a class.
  const COLORS = ['blue', 'red', 'green', 'gold', 'purple', 'faint'];
  const MACROS = Object.freeze(
    Object.fromEntries(COLORS.map((c) => ['\\' + c, `\\htmlClass{tc-c-${c}}{#1}`]))
  );
  const trust = (ctx) => ctx.command === '\\htmlClass' && /^tc-c-[a-z]+$/.test(ctx.class || '');

  const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const fmt = (t) => {
    const s = Math.max(0, Math.floor(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const escapeHtml = (s) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---- file format ----------------------------------------------------------

  function parse(text) {
    let header = null;
    const events = [];
    String(text)
      .split(/\r?\n/)
      .forEach((raw, n) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        let value;
        try {
          value = JSON.parse(line);
        } catch (err) {
          const at = /in JSON at position (\d+)/.exec(err.message);
          const why = err.message.replace(/\s*in JSON at position.*$/, '');
          throw new Error(`Line ${n + 1}${at ? `, column ${+at[1] + 1}` : ''}: ${why}`);
        }
        if (!header) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`Line ${n + 1}: the first line must be a header like {"version": 1}`);
          }
          header = value;
        } else {
          if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'string') {
            throw new Error(`Line ${n + 1}: events look like [delay, "show", "x^2"]`);
          }
          events.push(value);
        }
      });
    if (!header) throw new Error('This file is empty.');

    const morph = num(header.morph, DEFAULT_MORPH);
    const frames = [];
    const captions = [];
    let t = 0;
    let src = '';
    for (const [delay, type, a, b, c, d] of events) {
      t += Math.max(0, delay);
      if (type === 'show') {
        src = String(a ?? '');
        frames.push({ t, src, caret: src.length, morph: num(b && b.morph, morph) });
      } else if (type === 'edit') {
        const pos = clamp(a | 0, 0, src.length);
        const ins = String(c ?? '');
        src = src.slice(0, pos) + ins + src.slice(pos + Math.max(0, b | 0));
        frames.push({ t, src, caret: pos + ins.length, morph: num(d && d.morph, morph) });
      } else if (type === 'caption') {
        captions.push({ t, text: String(a ?? '') });
      }
      // Unknown event types are skipped, so newer files still play.
    }
    const duration = num(header.duration, t + num(header.hold, DEFAULT_HOLD));
    return { header, frames, captions, end: t, duration };
  }

  // ---- KaTeX ----------------------------------------------------------------

  let katexLoading = null;
  function ensureKatex() {
    if (window.katex) return Promise.resolve(window.katex);
    if (!katexLoading) {
      katexLoading = new Promise((resolve, reject) => {
        if (!document.querySelector('link[href*="katex"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = KATEX_CDN + 'katex.min.css';
          document.head.append(link);
        }
        const script = document.createElement('script');
        script.src = KATEX_CDN + 'katex.min.js';
        script.onload = () => resolve(window.katex);
        script.onerror = () => reject(new Error('KaTeX could not be loaded.'));
        document.head.append(script);
      });
    }
    return katexLoading;
  }

  // ---- glyph units ----------------------------------------------------------
  // Each rendered formula is broken into "units": single characters, rules
  // (fraction bars, overlines) and SVG pieces (radicals, tall delimiters).
  // Units with the same key are matched between frames and morphed.

  const SKIP = ['katex-mathml', 'strut', 'pstrut', 'vlist-s'];
  const LINES = ['frac-line', 'overline-line', 'underline-line', 'hline', 'hdashline', 'rule', 'fbox', 'fcolorbox'];
  const BLANK = /^[\s​ ]*$/;

  function collectUnits(root) {
    const units = [];
    const visit = (node) => {
      if (node.nodeType === 3) {
        const text = node.nodeValue;
        if (BLANK.test(text)) return;
        const frag = document.createDocumentFragment();
        for (const ch of text) {
          if (BLANK.test(ch)) {
            frag.append(ch);
            continue;
          }
          const span = document.createElement('span');
          span.className = 'tc-g';
          span.textContent = ch;
          frag.append(span);
          units.push({ el: span, key: ch, kind: 'text' });
        }
        node.replaceWith(frag);
        return;
      }
      if (node.nodeType !== 1) return;
      if (node instanceof SVGElement) {
        const host = node.parentElement;
        if (host && !host.tcUnit) {
          host.tcUnit = true;
          units.push({ el: host, key: 'svg:' + svgKind(host), kind: 'svg' });
        }
        return;
      }
      const cl = node.classList;
      if (SKIP.some((c) => cl.contains(c))) return;
      if (node.style.color === 'transparent') return; // \phantom
      if (LINES.some((c) => cl.contains(c))) {
        units.push({ el: node, key: 'line', kind: 'line' });
        return;
      }
      for (const child of [...node.childNodes]) visit(child);
    };
    visit(root.querySelector('.katex-html') || root);
    return units;
  }

  function svgKind(el) {
    for (let n = el; n && !n.classList.contains('katex'); n = n.parentElement) {
      const c = n.classList;
      if (c.contains('sqrt')) return 'sqrt';
      if (['delimsizing', 'delimsizinginner', 'delimcenter', 'mopen', 'mclose'].some((k) => c.contains(k))) return 'delim';
      if (c.contains('accent') || c.contains('accent-body')) return 'accent';
    }
    return 'other';
  }

  // Pair up units: longest common subsequence keeps reading order, then any
  // leftovers with the same key pair with their nearest partner so terms can
  // fly across the formula (moving a term to the other side, say).
  function matchUnits(A, B, ra, rb) {
    const n = A.length;
    const m = B.length;
    const ka = A.map((u) => u.key);
    const kb = B.map((u) => u.key);
    const usedA = new Uint8Array(n);
    const usedB = new Uint8Array(m);
    const pairs = [];
    const pair = (i, j) => {
      pairs.push([i, j]);
      usedA[i] = usedB[j] = 1;
    };

    let pre = 0;
    while (pre < n && pre < m && ka[pre] === kb[pre]) pair(pre, pre++);
    let suf = 0;
    while (suf < n - pre && suf < m - pre && ka[n - 1 - suf] === kb[m - 1 - suf]) {
      pair(n - 1 - suf, m - 1 - suf);
      suf++;
    }
    const a0 = pre;
    const b0 = pre;
    const N = n - suf - pre;
    const M = m - suf - pre;
    if (N > 0 && M > 0 && N * M <= 400000) {
      const W = M + 1;
      const dp = new Uint16Array((N + 1) * W);
      for (let i = N - 1; i >= 0; i--) {
        for (let j = M - 1; j >= 0; j--) {
          dp[i * W + j] =
            ka[a0 + i] === kb[b0 + j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < N && j < M) {
        if (ka[a0 + i] === kb[b0 + j]) pair(a0 + i++, b0 + j++);
        else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
        else j++;
      }
    }

    const spare = new Map();
    for (let i = 0; i < n; i++) {
      if (usedA[i]) continue;
      if (!spare.has(ka[i])) spare.set(ka[i], []);
      spare.get(ka[i]).push(i);
    }
    const cx = (r) => r.left + r.width / 2;
    const cy = (r) => r.top + r.height / 2;
    for (let j = 0; j < m; j++) {
      const list = !usedB[j] && spare.get(kb[j]);
      if (!list || !list.length) continue;
      let best = 0;
      let bestD = Infinity;
      list.forEach((i, k) => {
        const d = Math.hypot(cx(ra[i]) - cx(rb[j]), cy(ra[i]) - cy(rb[j]));
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      pair(list.splice(best, 1)[0], j);
    }

    const onlyA = [];
    const onlyB = [];
    for (let i = 0; i < n; i++) if (!usedA[i]) onlyA.push(i);
    for (let j = 0; j < m; j++) if (!usedB[j]) onlyB.push(j);
    return { pairs, onlyA, onlyB };
  }

  // A ghost is a free-floating copy of a unit, drawn in the overlay while
  // the real layers are hidden during a morph.
  function ghostOf(unit, r, o) {
    const cs = getComputedStyle(unit.el);
    let g;
    if (unit.kind === 'text') {
      g = document.createElement('span');
      g.textContent = unit.el.textContent;
      const s = g.style;
      s.fontFamily = cs.fontFamily;
      s.fontSize = cs.fontSize;
      s.fontStyle = cs.fontStyle;
      s.fontWeight = cs.fontWeight;
      s.lineHeight = r.height + 'px';
    } else if (unit.kind === 'svg') {
      g = document.createElement('div');
      g.style.overflow = 'hidden';
      g.style.fontSize = cs.fontSize;
      for (const svg of unit.el.children) if (svg instanceof SVGElement) g.append(svg.cloneNode(true));
    } else {
      g = document.createElement('div');
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        g.style[`border${side}Width`] = cs[`border${side}Width`];
        g.style[`border${side}Style`] = cs[`border${side}Style`];
        g.style[`border${side}Color`] = 'currentColor';
      }
    }
    g.className = 'tc-ghost';
    Object.assign(g.style, box(r, o));
    g.style.color = cs.color;
    return { g, color: cs.color };
  }

  const box = (r, o, color) => {
    const b = { left: r.left - o.left + 'px', top: r.top - o.top + 'px', width: r.width + 'px', height: r.height + 'px' };
    if (color) b.color = color;
    return b;
  };

  // ---- player ---------------------------------------------------------------

  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13 8z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>',
    replay:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.3 6.2A5 5 0 1 1 3 9.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M2.6 2.8l.7 3.6 3.6-.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  class Player {
    constructor(host, text, opts = {}) {
      this.host = host;
      this.text = String(text);
      this.cast = parse(this.text);
      this.bytes = new Blob([this.text]).size;
      this.loop = !!opts.loop;
      this.speed = 1;
      this.time = 0;
      this.playing = false;
      this.cur = -2;
      this.shownGood = -2;
      this.capIdx = -2;
      this.layer = null;
      this.anim = null;
      this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
      this.onFrame = (now) => this.tick(now);
      this.build();
      this.ready = this.init(opts);
    }

    build() {
      const { header, captions, frames } = this.cast;
      const h = this.host;
      h.classList.add('tc-player', 'tc-fresh');
      if (!h.hasAttribute('tabindex')) h.tabIndex = 0;
      h.setAttribute('role', 'region');
      h.setAttribute('aria-label', header.title ? `Animation: ${header.title}` : 'Animated formula');
      h.innerHTML = `
        <div class="tc-screen">
          <div class="tc-stage"><div class="tc-overlay"></div></div>
          ${header.source ? '<div class="tc-source" aria-label="LaTeX source"></div>' : ''}
          ${captions.length ? '<div class="tc-caption" aria-live="polite"></div>' : ''}
          <button class="tc-big" type="button" aria-label="Play" tabindex="-1"></button>
        </div>
        <div class="tc-controls">
          <button class="tc-btn tc-play" type="button" aria-label="Play">${ICON.play}</button>
          <span class="tc-time">0:00 / 0:00</span>
          <div class="tc-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0">
            <div class="tc-rail"><div class="tc-fill"></div></div>
            <div class="tc-knob"></div>
          </div>
          <button class="tc-btn tc-speed" type="button" aria-label="Playback speed">1×</button>
        </div>`;
      const q = (s) => h.querySelector(s);
      this.stage = q('.tc-stage');
      this.overlay = q('.tc-overlay');
      this.srcEl = q('.tc-source');
      this.capEl = q('.tc-caption');
      this.playBtn = q('.tc-play');
      this.timeEl = q('.tc-time');
      this.track = q('.tc-track');
      this.rail = q('.tc-rail');
      this.fill = q('.tc-fill');
      this.knob = q('.tc-knob');
      this.speedBtn = q('.tc-speed');
      this.caret = document.createElement('span');
      this.caret.className = 'tc-caret';
      this.track.setAttribute('aria-valuemax', this.cast.duration.toFixed(1));

      // Step markers: one per frame for derivations, per caption for long typing casts.
      const times = frames.length <= 40 ? frames.map((f) => f.t) : captions.map((c) => c.t);
      this.marks = [...new Set(times)].sort((a, b) => a - b);
      for (const t of this.marks) {
        if (t <= 0.01) continue;
        const mark = document.createElement('span');
        mark.className = 'tc-mark';
        mark.style.left = (t / this.cast.duration) * 100 + '%';
        this.rail.append(mark);
      }

      q('.tc-big').addEventListener('click', () => this.play());
      this.playBtn.addEventListener('click', () => this.toggle());
      this.speedBtn.addEventListener('click', () => {
        this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length];
        this.speedBtn.textContent = this.speed + '×';
      });
      this.track.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.track.setPointerCapture(e.pointerId);
        this.dragging = true;
        this.wasPlaying = this.playing;
        this.pause();
        this.scrub(e);
      });
      this.track.addEventListener('pointermove', (e) => this.dragging && this.scrub(e));
      const endDrag = () => {
        if (!this.dragging) return;
        this.dragging = false;
        if (this.wasPlaying) this.play();
      };
      this.track.addEventListener('pointerup', endDrag);
      this.track.addEventListener('pointercancel', endDrag);
      h.addEventListener('keydown', (e) => this.onKey(e));
    }

    async init(opts) {
      await ensureKatex();
      this.computeGood();
      this.measure();
      if (document.fonts) {
        await document.fonts.ready; // the first measure kicked off the font loads
        this.measure();
        this.onFonts = () => {
          this.measure();
          this.fit(true);
        };
        document.fonts.addEventListener('loadingdone', this.onFonts);
      }
      this.fit(true);
      const poster = opts.poster ?? this.cast.header.poster;
      this.jump(poster === 'end' ? this.cast.end : num(+poster, 0), 0);
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(this.host);
      if (opts.autoplay) {
        this.io = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            this.io.disconnect();
            this.io = null;
            this.play();
          },
          { threshold: 0.35 }
        );
        this.io.observe(this.host);
      }
      return this;
    }

    katexOptions() {
      return {
        displayMode: true,
        throwOnError: true,
        strict: 'ignore',
        trust,
        macros: { ...MACROS, ...(this.cast.header.macros || {}) },
      };
    }

    renderInto(el, src) {
      try {
        window.katex.render(src, el, this.katexOptions());
        return true;
      } catch (err) {
        el.textContent = '';
        return false;
      }
    }

    // good[i] = the latest frame at or before i whose LaTeX parses. While
    // someone is halfway through typing \frac{, the last good frame stays up.
    computeGood() {
      const ok = new Map();
      const scratch = document.createElement('div');
      let last = -1;
      this.good = this.cast.frames.map((f, i) => {
        if (!ok.has(f.src)) ok.set(f.src, this.renderInto(scratch, f.src));
        if (ok.get(f.src)) last = i;
        return last;
      });
    }

    measure() {
      const seen = new Set();
      let list = [];
      this.cast.frames.forEach((f, i) => {
        if (this.good[i] === i && !seen.has(f.src)) {
          seen.add(f.src);
          list.push(f.src);
        }
      });
      if (list.length > MAX_MEASURED) list = list.sort((a, b) => b.length - a.length).slice(0, MAX_MEASURED);
      this.stage.style.fontSize = '';
      const base = parseFloat(getComputedStyle(this.stage).fontSize);
      const probe = document.createElement('div');
      probe.className = 'tc-measure';
      for (const src of list) {
        const d = document.createElement('div');
        this.renderInto(d, src);
        probe.append(d);
      }
      this.stage.append(probe);
      let w = 0;
      let hgt = 0;
      for (const d of probe.children) {
        const r = d.getBoundingClientRect();
        w = Math.max(w, r.width);
        hgt = Math.max(hgt, r.height);
      }
      probe.remove();
      // Sizes per pixel of font size, so fit() can rescale without re-measuring.
      this.wPerPx = w / base;
      this.hPerPx = hgt / base;
      this.lastWidth = 0;
    }

    // Scale the type down when the widest frame would not fit, and reserve
    // the tallest frame's height so the controls never jump.
    fit(force) {
      const width = this.stage.clientWidth;
      if (!width || (!force && width === this.lastWidth)) return;
      this.lastWidth = width;
      this.finishAnim();
      this.stage.style.fontSize = '';
      const base = parseFloat(getComputedStyle(this.stage).fontSize) * num(this.cast.header.size, 1);
      const size = this.wPerPx ? Math.min(base, (width - 2) / this.wPerPx) : base;
      this.stage.style.fontSize = size + 'px';
      this.stage.style.minHeight = Math.ceil(this.hPerPx * size) + 'px';
      if (this.capEl) {
        const keep = this.capEl.innerHTML;
        this.capEl.style.minHeight = '';
        let tallest = 0;
        for (const c of this.cast.captions) {
          this.capEl.innerHTML = this.inlineMath(c.text);
          tallest = Math.max(tallest, this.capEl.offsetHeight);
        }
        this.capEl.innerHTML = keep;
        this.capEl.style.minHeight = tallest + 'px';
      }
    }

    // ---- timeline ----

    frameAt(t) {
      const f = this.cast.frames;
      let lo = 0;
      let hi = f.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (f[mid].t <= t + 1e-9) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans;
    }

    captionAt(t) {
      let ans = -1;
      this.cast.captions.forEach((c, i) => {
        if (c.t <= t + 1e-9) ans = i;
      });
      return ans;
    }

    // How long a morph into frame f should take: its own morph time, cut
    // short if the next frame arrives sooner.
    morphMs(f) {
      if (f < 0) return 0;
      const frames = this.cast.frames;
      let s = frames[f].morph;
      if (frames[f + 1]) s = Math.min(s, (frames[f + 1].t - frames[f].t) * 0.9);
      return (s * 1000) / this.speed;
    }

    play() {
      if (this.playing) return;
      if (this.host.classList.contains('tc-fresh') || this.time >= this.cast.duration - 1e-3) this.jump(0, 0);
      this.host.classList.remove('tc-fresh');
      this.playing = true;
      this.last = performance.now();
      this.paintUI();
      this.raf = requestAnimationFrame(this.onFrame);
    }

    pause() {
      this.playing = false;
      cancelAnimationFrame(this.raf);
      this.paintUI();
    }

    toggle() {
      if (this.playing) this.pause();
      else this.play();
    }

    tick(now) {
      if (!this.playing) return;
      const dt = clamp((now - this.last) / 1000, 0, 0.25); // rAF time can precede play()
      this.last = now;
      this.time += dt * this.speed;
      const d = this.cast.duration;
      if (this.time >= d) {
        if (this.loop) {
          this.jump(0, (num(this.cast.header.morph, DEFAULT_MORPH) * 1000) / this.speed);
        } else {
          this.time = d;
          this.advance();
          this.pause();
          return;
        }
      } else {
        this.advance();
      }
      this.paintUI();
      this.raf = requestAnimationFrame(this.onFrame);
    }

    advance() {
      const f = this.frameAt(this.time);
      if (f !== this.cur) this.showFrame(f, this.morphMs(f));
      const c = this.captionAt(this.time);
      if (c !== this.capIdx) this.showCaption(c, true);
    }

    // Move to time t; morph into the new frame over `ms` (0 = cut).
    jump(t, ms) {
      this.time = clamp(t, 0, this.cast.duration);
      this.showFrame(this.frameAt(this.time), ms);
      this.showCaption(this.captionAt(this.time), ms > 0);
      this.paintUI();
    }

    scrub(e) {
      const r = this.rail.getBoundingClientRect();
      this.host.classList.remove('tc-fresh');
      this.jump(clamp((e.clientX - r.left) / r.width, 0, 1) * this.cast.duration, 0);
    }

    step(dir) {
      const t = this.time;
      let target;
      if (this.marks.length) {
        if (dir > 0) target = this.marks.find((m) => m > t + 0.05) ?? this.cast.duration;
        else target = [...this.marks].reverse().find((m) => m < t - 0.05) ?? 0;
      } else {
        target = t + dir * 5;
      }
      this.host.classList.remove('tc-fresh');
      const f = this.frameAt(target);
      const ms = dir > 0 && f >= 0 ? (this.cast.frames[f].morph * 1000) / this.speed : 0;
      this.jump(target, ms);
    }

    onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button')) return;
      switch (e.key) {
        case ' ':
        case 'k':
          this.toggle();
          break;
        case 'ArrowRight':
          this.step(1);
          break;
        case 'ArrowLeft':
          this.step(-1);
          break;
        case 'Home':
          this.jump(0, 0);
          break;
        case 'End':
          this.jump(this.cast.duration, 0);
          break;
        default:
          return;
      }
      e.preventDefault();
    }

    // ---- drawing ----

    showFrame(f, ms) {
      this.cur = f;
      this.paintSource();
      const g = f < 0 ? -1 : this.good[f];
      if (g === this.shownGood) return;
      this.shownGood = g;
      this.finishAnim();
      const next = document.createElement('div');
      next.className = 'tc-layer';
      if (g >= 0) this.renderInto(next, this.cast.frames[g].src);
      this.stage.insertBefore(next, this.overlay);
      next.units = collectUnits(next);
      const prev = this.layer;
      this.layer = next;
      if (!prev) return;
      if (ms > 40 && !this.reduceMotion.matches) this.morph(prev, next, ms);
      else prev.remove();
    }

    morph(prev, next, ms) {
      const o = this.overlay.getBoundingClientRect();
      const A = prev.units;
      const B = next.units;
      const ra = A.map((u) => u.el.getBoundingClientRect());
      const rb = B.map((u) => u.el.getBoundingClientRect());
      const { pairs, onlyA, onlyB } = matchUnits(A, B, ra, rb);
      const opts = { duration: ms, easing: EASE, fill: 'both' };
      const frag = document.createDocumentFragment();
      const anims = [];

      for (const [i, j] of pairs) {
        const { g, color } = ghostOf(A[i], ra[i], o);
        const to = getComputedStyle(B[j].el).color;
        frag.append(g);
        if (A[i].kind === 'text') {
          const s = ra[i].height ? rb[j].height / ra[i].height : 1;
          const dx = rb[j].left - ra[i].left;
          const dy = rb[j].top - ra[i].top;
          anims.push(
            g.animate(
              [
                { transform: 'none', color },
                { transform: `translate(${dx}px, ${dy}px) scale(${s})`, color: to },
              ],
              opts
            )
          );
        } else {
          anims.push(g.animate([box(ra[i], o, color), box(rb[j], o, to)], opts));
        }
      }
      for (const i of onlyA) {
        const { g } = ghostOf(A[i], ra[i], o);
        frag.append(g);
        anims.push(g.animate([{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }], opts));
      }
      for (const j of onlyB) {
        const { g } = ghostOf(B[j], rb[j], o);
        frag.append(g);
        anims.push(g.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], opts));
      }

      this.overlay.append(frag);
      prev.classList.add('tc-hidden');
      next.classList.add('tc-hidden');
      const anim = { prev, next, anims };
      this.anim = anim;
      Promise.all(anims.map((a) => a.finished)).then(
        () => this.anim === anim && this.finishAnim(),
        () => {}
      );
    }

    finishAnim() {
      const a = this.anim;
      if (!a) return;
      this.anim = null;
      a.anims.forEach((x) => x.cancel());
      this.overlay.replaceChildren();
      a.prev.remove();
      a.next.classList.remove('tc-hidden');
    }

    paintSource() {
      if (!this.srcEl) return;
      const fr = this.cast.frames[this.cur];
      const s = fr ? fr.src : '';
      const c = fr ? fr.caret : 0;
      this.srcEl.replaceChildren(s.slice(0, c), this.caret, s.slice(c));
      this.srcEl.classList.toggle('tc-err', !!fr && this.good[this.cur] !== this.cur);
      const el = this.srcEl;
      const top = this.caret.offsetTop;
      if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - 24) el.scrollTop = top - el.clientHeight / 2;
    }

    inlineMath(text) {
      return text
        .split('$')
        .map((part, k) => {
          if (k % 2 === 0) return escapeHtml(part);
          try {
            return window.katex.renderToString(part, { ...this.katexOptions(), displayMode: false });
          } catch (err) {
            return escapeHtml(part);
          }
        })
        .join('');
    }

    showCaption(i, fade) {
      this.capIdx = i;
      if (!this.capEl) return;
      const text = i < 0 ? '' : this.cast.captions[i].text;
      if (text === this.capText) return;
      this.capText = text;
      this.capEl.innerHTML = this.inlineMath(text);
      this.capEl.classList.remove('tc-in');
      if (fade && text) {
        void this.capEl.offsetWidth;
        this.capEl.classList.add('tc-in');
      }
    }

    paintUI() {
      const d = this.cast.duration;
      const p = d ? clamp(this.time / d, 0, 1) : 0;
      this.fill.style.transform = `scaleX(${p})`;
      this.knob.style.left = p * 100 + '%';
      const label = `${fmt(this.time)} / ${fmt(d)}`;
      if (label !== this.timeLabel) {
        this.timeLabel = label;
        this.timeEl.textContent = label;
        this.track.setAttribute('aria-valuenow', this.time.toFixed(1));
        this.track.setAttribute('aria-valuetext', label);
      }
      const icon = this.playing ? 'pause' : this.time >= d - 1e-3 ? 'replay' : 'play';
      if (icon !== this.icon) {
        this.icon = icon;
        this.playBtn.innerHTML = ICON[icon];
        this.playBtn.setAttribute('aria-label', icon[0].toUpperCase() + icon.slice(1));
      }
      this.host.classList.toggle('tc-playing', this.playing);
    }

    destroy() {
      this.pause();
      this.finishAnim();
      this.ro?.disconnect();
      this.io?.disconnect();
      if (this.onFonts) document.fonts.removeEventListener('loadingdone', this.onFonts);
      this.host.replaceChildren();
      this.host.classList.remove('tc-fresh', 'tc-playing');
    }
  }

  // ---- styles ---------------------------------------------------------------

  const CSS = `
texcast-player{display:block}
:root{--tc-blue:#1170a8;--tc-red:#c2185b;--tc-green:#0f8a5f;--tc-gold:#a86400;--tc-purple:#7b3fd4;--tc-faint:rgba(30,36,46,.26)}
@media (prefers-color-scheme:dark){:root{--tc-blue:#5bb3e8;--tc-red:#f0679d;--tc-green:#46cf98;--tc-gold:#f2b13c;--tc-purple:#b28cf5;--tc-faint:rgba(236,235,230,.26)}}
.tc-player{--tc-size:30px;
  position:relative;display:block;color:var(--tc-ink,inherit);background:var(--tc-bg,transparent);border:1px solid var(--tc-line,rgba(128,128,128,.28));
  border-radius:var(--tc-radius,14px);overflow:hidden;font:14px/1.4 var(--tc-ui-font,system-ui,-apple-system,sans-serif);-webkit-tap-highlight-color:transparent}
.tc-player:focus{outline:none}
.tc-player:focus-visible{outline:2px solid var(--tc-accent,#0b6a80);outline-offset:2px}
.tc-screen{position:relative;padding:clamp(22px,5vw,40px) clamp(14px,3vw,28px) clamp(16px,3.5vw,26px)}
.tc-stage{position:relative;display:grid;place-items:center;font-size:var(--tc-size);min-height:1.6em}
.tc-layer{grid-area:1/1;max-width:100%}
.tc-layer .katex-display,.tc-measure .katex-display{margin:0}
.tc-hidden{visibility:hidden}
.tc-overlay{position:absolute;inset:0;pointer-events:none}
.tc-ghost{position:absolute;box-sizing:border-box;margin:0;padding:0;white-space:pre;letter-spacing:0;transform-origin:0 0;will-change:transform,opacity}
.tc-ghost svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block;fill:currentColor;stroke:currentColor;fill-rule:nonzero;fill-opacity:1;stroke-width:1;stroke-linecap:butt;stroke-linejoin:miter;stroke-miterlimit:4;stroke-opacity:1}
.tc-ghost svg path{stroke:none}
.tc-measure{position:absolute;left:0;top:0;width:max-content;visibility:hidden;pointer-events:none}
.tc-c-blue{color:var(--tc-blue)}.tc-c-red{color:var(--tc-red)}.tc-c-green{color:var(--tc-green)}
.tc-c-gold{color:var(--tc-gold)}.tc-c-purple{color:var(--tc-purple)}.tc-c-faint{color:var(--tc-faint)}
.tc-source{position:relative;margin-top:clamp(18px,4vw,28px);padding:10px 14px;border-radius:9px;background:var(--tc-source-bg,rgba(128,128,128,.08));
  font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:8.4em;overflow:auto;
  color:var(--tc-dim,inherit);min-height:calc(1.6em + 20px)}
.tc-caret{display:inline-block;width:0;height:1.25em;margin-right:-2px;border-left:2px solid var(--tc-accent,#0b6a80);vertical-align:-.25em;animation:tc-blink 1.1s steps(1) infinite}
.tc-playing .tc-caret{animation:none}
.tc-source.tc-err .tc-caret{border-color:var(--tc-red)}
@keyframes tc-blink{50%{opacity:0}}
.tc-caption{margin-top:clamp(14px,3vw,22px);text-align:center;font-size:15px;line-height:1.5;color:var(--tc-dim,inherit);text-wrap:balance}
.tc-caption .katex{font-size:1.08em}
.tc-caption.tc-in{animation:tc-fade .45s ease both}
@keyframes tc-fade{from{opacity:0;transform:translateY(4px)}}
.tc-big{position:absolute;inset:0;display:none;width:100%;border:0;padding:0;background:transparent;cursor:pointer}
.tc-fresh .tc-big{display:block}
.tc-fresh .tc-play,.tc-fresh .tc-play:hover{border-radius:50%;background:var(--tc-accent,#0b6a80);color:var(--tc-bg,#fff)}
.tc-fresh:has(.tc-big:hover) .tc-play{filter:brightness(1.12)}
.tc-controls{display:flex;align-items:center;gap:4px;padding:5px 8px;border-top:1px solid var(--tc-line,rgba(128,128,128,.2))}
.tc-btn{appearance:none;display:grid;place-items:center;min-width:34px;height:34px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.tc-btn:hover{background:var(--tc-hover,rgba(128,128,128,.13))}
.tc-btn svg{width:16px;height:16px}
.tc-time{padding:0 6px;font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--tc-dim,inherit);font-variant-numeric:tabular-nums;white-space:nowrap}
.tc-track{position:relative;flex:1;height:32px;margin:0 8px;cursor:pointer;touch-action:none;outline:none}
.tc-track:focus-visible .tc-rail{outline:2px solid var(--tc-accent,#0b6a80);outline-offset:4px}
.tc-rail{position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;border-radius:2px;background:var(--tc-rail,rgba(128,128,128,.25))}
.tc-fill{position:absolute;inset:0;border-radius:inherit;background:var(--tc-accent,#0b6a80);transform-origin:0 50%;transform:scaleX(0)}
.tc-mark{position:absolute;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:var(--tc-bg,#fff);opacity:.9}
.tc-knob{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--tc-accent,#0b6a80);box-shadow:0 0 0 3px var(--tc-bg,#fff)}
.tc-speed{min-width:44px;font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--tc-dim,inherit)}
.tc-failed{padding:16px;color:var(--tc-red,#c2185b);font:14px/1.5 system-ui,sans-serif}
`;
  const style = document.createElement('style');
  style.dataset.texcast = '';
  style.textContent = CSS;
  document.head.prepend(style);

  // ---- <texcast-player> -----------------------------------------------------

  class TexcastElement extends HTMLElement {
    connectedCallback() {
      if (this.started) return;
      this.started = true;
      const inline = this.querySelector('script[type="text/texcast"]');
      const src = this.getAttribute('src');
      if (inline) this.load(inline.textContent);
      else if (src) {
        fetch(src)
          .then((r) => {
            if (!r.ok) throw new Error(`${src}: ${r.status} ${r.statusText}`);
            return r.text();
          })
          .then((text) => this.load(text))
          .catch((err) => this.fail(err));
      }
    }

    // Replace the recording this element plays.
    load(text) {
      if (this.player) this.player.destroy();
      this.player = null;
      this.classList.remove('tc-failed');
      try {
        this.player = new Player(this, text, {
          autoplay: this.hasAttribute('autoplay'),
          loop: this.hasAttribute('loop'),
          poster: this.getAttribute('poster') ?? undefined,
        });
      } catch (err) {
        this.fail(err);
        return null;
      }
      const player = this.player;
      player.ready.then(
        () => this.dispatchEvent(new CustomEvent('texcast-ready', { detail: player, bubbles: true })),
        (err) => this.fail(err)
      );
      return player;
    }

    fail(err) {
      this.classList.add('tc-failed');
      this.textContent = `Could not play this texcast. ${err.message}`;
    }
  }

  async function gzipSize(text) {
    if (!('CompressionStream' in window)) return null;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return (await new Response(stream).arrayBuffer()).byteLength;
  }

  const formatBytes = (n) => (n < 1000 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

  window.Texcast = { parse, Player, ensureKatex, macros: MACROS, trust, gzipSize, formatBytes };
  customElements.define('texcast-player', TexcastElement);
})();
