/**
 * tex.js — LaTeX → canvas images, via MathJax 3 (tex-svg build).
 *
 * The page loads MathJax with `startup: { typeset: false }` (and the default
 * `svg: { fontCache: 'local' }`, so each SVG carries its own glyph defs).
 * We wait for `MathJax.startup.promise`, render each formula once (in black),
 * rasterize it to an offscreen canvas at the requested size, then make tinted
 * copies per color on demand. Tinting is synchronous, so changing a label's
 * color (hover, theme switch) never flickers.
 *
 * Sizes: `px` is the height of 1em in canvas pixels. All returned metrics are
 * canvas pixels: `w` = advance width, `h` = height (ascent + depth),
 * `depth` = distance from the baseline down to the bottom of the box.
 * `img` is (w + 2·pad) × (h + 2·pad); draw it with `drawTex` (or at
 * x − pad, baseline − (h − depth) − pad) so glyph overhangs are not clipped.
 */

/** Padding around each image, in 1/1000 em (MathJax SVG units). */
const PAD_UNITS = 90;

/** @type {Map<string, Entry>} */
const cache = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();
let chain = Promise.resolve();
/** @type {Promise<any>|null} */
let mjPromise = null;
let notifyQueued = false;

/**
 * @typedef {Object} TexResult
 * @property {CanvasImageSource|null} img  tinted image (null until ready, or on error)
 * @property {number} w      advance width in px
 * @property {number} h      height in px (ascent + depth)
 * @property {number} depth  px below the baseline
 * @property {number} pad    px of transparent padding around `img`
 * @property {boolean} ready true once rendered (or failed)
 * @property {boolean} error true if MathJax rejected the TeX (draw `fallback`)
 * @property {string} fallback plain-text stand-in
 */

/**
 * @typedef {Object} Entry
 * @property {'pending'|'ready'|'error'} status
 * @property {HTMLCanvasElement|null} base
 * @property {number} w @property {number} h @property {number} depth @property {number} pad
 * @property {Map<string, TexResult>} results  per-color results
 * @property {TexResult} pendingResult
 * @property {boolean} colored  TeX sets its own colors: render per color, no tinting
 */

/** Register a callback fired whenever a pending image finishes. Returns an unsubscribe function. */
export function onTexReady(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  // Coalesce bursts (many formulas finishing together) into one callback round.
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    for (const cb of listeners) {
      try { cb(); } catch (e) { console.error('[tex] onTexReady callback failed', e); }
    }
  });
}

/** True once MathJax has finished starting up. */
export function texEngineReady() {
  return mjReadyFlag;
}
let mjReadyFlag = false;

/** Resolve with the MathJax object once its startup promise has settled. */
export function mathJaxReady() {
  if (mjPromise) return mjPromise;
  mjPromise = new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const MJ = window.MathJax;
      const p = MJ && MJ.startup && MJ.startup.promise;
      if (p && typeof p.then === 'function') {
        p.then(() => {
          const M = window.MathJax;
          if (typeof M.tex2svgPromise === 'function') { mjReadyFlag = true; resolve(M); }
          else reject(new Error('MathJax has no tex2svgPromise (load the tex-svg component)'));
        }, reject);
      } else if (performance.now() - t0 > 60000) {
        reject(new Error('MathJax did not load within 60 s'));
      } else {
        setTimeout(tick, 50);
      }
    };
    tick();
  });
  mjPromise.catch((e) => console.warn('[tex]', e.message || e));
  return mjPromise;
}

const SYMBOLS = {
  langle: '⟨', rangle: '⟩', mid: ' | ', backslash: '\\', colon: ':', vert: '|', lvert: '|', rvert: '|', cdot: '·', times: '×',
  to: '→', rightarrow: '→', mapsto: '↦', infty: '∞', le: '≤', leq: '≤', ge: '≥', geq: '≥',
  ne: '≠', neq: '≠', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cong: '≅', simeq: '≃',
  approx: '≈', pm: '±', ldots: '…', cdots: '⋯', dots: '…', setminus: '∖', circ: '∘',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', quad: '  ', qquad: '   ',
};

/**
 * Crude plain-text version of a TeX string, shown until MathJax is ready.
 * Keeps ^ and _, drops braces and unknown commands.
 * @param {string} tex
 */
export function texToPlainFallback(tex) {
  let s = String(tex);
  s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b\s*/g, '');
  s = s.replace(/\\(?:operatorname|mathrm|mathbf|mathbb|mathcal|mathfrak|mathit|text|textrm|textbf|mathsf)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\([a-zA-Z]+)/g, (m, name) => (name in SYMBOLS ? SYMBOLS[name] : ''));
  s = s.replace(/\\([,;:! ])/g, ' ').replace(/\\\\/g, ' ').replace(/\\([{}|])/g, '$1');
  s = s.replace(/[{}]/g, '').replace(/&/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

const COLOR_CMD = /\\(?:color|textcolor|colorbox|fcolorbox|style|class|cssId|href)\b/;

/**
 * Get (or start rendering) a LaTeX image.
 * @param {string} tex
 * @param {{display?: boolean, color?: string, px?: number}} [opts]
 * @returns {TexResult}
 */
export function texImage(tex, { display = false, color = '#16181e', px = 28 } = {}) {
  tex = String(tex);
  px = Math.max(4, Math.round(px * 2) / 2); // half-pixel steps keep the cache small
  const colored = COLOR_CMD.test(tex);
  const key = (display ? 'D' : 'I') + px + (colored ? '|' + color : '') + '|' + tex;
  let e = cache.get(key);
  if (!e) {
    const fallback = texToPlainFallback(tex);
    e = {
      status: 'pending', base: null, w: 0, h: 0, depth: 0, pad: 0, colored,
      results: new Map(),
      pendingResult: Object.freeze({ img: null, w: 0, h: 0, depth: 0, pad: 0, ready: false, error: false, fallback }),
    };
    cache.set(key, e);
    render(e, tex, display, px, colored ? color : '#000000');
  }
  if (e.status === 'pending') return e.pendingResult;
  if (e.status === 'error') {
    let r = e.results.get('error');
    if (!r) {
      r = Object.freeze({ ...e.pendingResult, ready: true, error: true });
      e.results.set('error', r);
    }
    return r;
  }
  const ck = e.colored ? '' : color;
  let r = e.results.get(ck);
  if (!r) {
    r = Object.freeze({
      img: e.colored ? e.base : tint(e.base, color),
      w: e.w, h: e.h, depth: e.depth, pad: e.pad, ready: true, error: false,
      fallback: e.pendingResult.fallback,
    });
    e.results.set(ck, r);
  }
  return r;
}

/**
 * Draw a ready TexResult with its baseline at `baselineY` and left edge at `x`.
 * `scale` shrinks oversized formulas (1 = native size, crisp).
 */
export function drawTex(ctx, t, x, baselineY, scale = 1) {
  if (!t || !t.img) return;
  const top = baselineY - (t.h - t.depth + t.pad) * scale;
  const left = x - t.pad * scale;
  if (scale === 1) ctx.drawImage(t.img, Math.round(left), Math.round(top));
  else ctx.drawImage(t.img, left, top, t.img.width * scale, t.img.height * scale);
}

/** Drop every cached image (e.g. after changing MathJax macros). */
export function clearTexCache() {
  cache.clear();
}

function tint(base, color) {
  const c = document.createElement('canvas');
  c.width = base.width;
  c.height = base.height;
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

let taintChecked = false;

async function render(e, tex, display, px, ink) {
  try {
    const MJ = await mathJaxReady();
    // MathJax conversions share internal state: run them one at a time.
    const job = chain.then(() => MJ.tex2svgPromise(tex, { display }));
    chain = job.catch(() => {});
    const node = await job;
    const svg = node && (node.tagName && node.tagName.toLowerCase() === 'svg' ? node : node.querySelector('svg'));
    if (!svg) throw new Error('MathJax returned no <svg>');
    const err = svg.querySelector('[data-mml-node="merror"]');
    if (err) throw new Error(err.getAttribute('data-mjx-error') || err.getAttribute('title') || err.textContent || 'TeX error');
    // The noundefined extension draws unknown macros in red instead of failing.
    if (svg.querySelector('[data-mml-node="mtext"][fill="red"]')) throw new Error('undefined control sequence');

    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) throw new Error('bad viewBox');
    const [minX, minY, vbW, vbH] = vb;
    const em = px / 1000;
    const w = vbW * em, h = vbH * em, depth = (minY + vbH) * em, pad = PAD_UNITS * em;
    const totW = w + 2 * pad, totH = h + 2 * pad;

    svg.setAttribute('viewBox', `${minX - PAD_UNITS} ${minY - PAD_UNITS} ${vbW + 2 * PAD_UNITS} ${vbH + 2 * PAD_UNITS}`);
    svg.setAttribute('width', totW.toFixed(3));
    svg.setAttribute('height', totH.toFixed(3));
    svg.removeAttribute('style');
    svg.setAttribute('overflow', 'visible');
    if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const str = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, ink);
    const img = new Image();
    img.decoding = 'async';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
    if (img.decode) await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

    const base = document.createElement('canvas');
    base.width = Math.max(1, Math.ceil(totW));
    base.height = Math.max(1, Math.ceil(totH));
    const g = base.getContext('2d');
    g.drawImage(img, 0, 0, totW, totH);
    if (!taintChecked) {
      // Check once that SVG images don't taint canvases (WebGL upload would fail).
      taintChecked = true;
      try { g.getImageData(0, 0, 1, 1); } catch (te) {
        console.warn('[tex] SVG images taint the canvas in this browser; WebGL upload will fail', te);
      }
    }
    Object.assign(e, { status: 'ready', base, w, h, depth, pad });
  } catch (err) {
    e.status = 'error';
    console.warn('[tex] could not render', JSON.stringify(tex), '—', err && err.message ? err.message : err);
  }
  e.results.clear();
  notify();
}
