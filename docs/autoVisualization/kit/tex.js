/* AutoViz kit · tex — typeset mathematics with the vendored KaTeX (kit/vendor/katex, no network).
   Load katex.min.css + katex.min.js before this file:

     <link rel="stylesheet" href="../kit/vendor/katex/katex.min.css">
     <script src="../kit/vendor/katex/katex.min.js"></script>
     <script src="../kit/tex.js"></script>

   AV.tex(src)        → HTML string for one formula (cached); use it in readouts, slider formats, captions.
   AV.texify(html)    → the same string with every $…$ replaced by typeset math (tour text, the ⓘ sheet).
   AV.texLabels(app)  → an HTML layer above the stage for typeset labels pinned to stage positions. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});
  const cache = new Map();

  function tex(src, opt = {}) {
    const key = (opt.display ? 'D' : 'I') + src;
    let html = cache.get(key);
    if (html === undefined) {
      if (root.katex) html = root.katex.renderToString(src, { throwOnError: false, output: 'html', displayMode: !!opt.display, strict: false });
      else html = '<span class="av-tex-raw">' + String(src).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</span>';
      if (cache.size > 4000) cache.clear();
      cache.set(key, html);
    }
    return html;
  }
  const texify = html => String(html).replace(/\$([^$]+)\$/g, (_, s) => tex(s));

  let styled = false;
  function style() {
    if (styled || typeof document === 'undefined') return;
    styled = true;
    const s = document.createElement('style');
    s.textContent =
      '.av-labels{position:fixed;inset:0;pointer-events:none;overflow:hidden}' +
      '.av-labels>span{position:absolute;left:0;top:0;white-space:nowrap;color:var(--av-ink);font-size:14px;line-height:1;' +
      'text-shadow:0 0 5px #07090d,0 0 2px #07090d,0 0 9px #07090d;transition:opacity .25s;will-change:transform}' +
      '.av-page .katex{font-size:1.1em}.av-title .katex,.av-readout .big .katex{font-size:1em}';
    document.head.append(s);
  }

  // labels.set([{ key, x, y, tex, color, size, align: 'center'|'left'|'right', valign: 'middle'|'top'|'bottom', opacity }])
  // replaces the whole set (labels whose key is missing are removed); x, y in CSS px of the stage.
  function texLabels(app) {
    style();
    const layer = document.createElement('div');
    layer.className = 'av-labels';
    (app.overlayCanvas || app.stage).after(layer);
    const pool = new Map();
    const AX = { left: '0%', center: '-50%', right: '-100%' }, AY = { top: '0%', middle: '-50%', bottom: '-100%' };
    return {
      el: layer,
      set(items) {
        const seen = new Set();
        for (const it of items || []) {
          if (!it || !isFinite(it.x) || !isFinite(it.y)) continue;
          seen.add(it.key);
          let n = pool.get(it.key);
          if (!n) { n = { el: document.createElement('span'), src: null }; pool.set(it.key, n); layer.append(n.el); }
          if (n.src !== it.tex) { n.src = it.tex; n.el.innerHTML = tex(it.tex); }
          const st = n.el.style;
          st.transform = 'translate(' + it.x.toFixed(1) + 'px,' + it.y.toFixed(1) + 'px) translate(' + AX[it.align || 'center'] + ',' + AY[it.valign || 'middle'] + ')';
          st.color = it.color || '';
          st.fontSize = it.size ? it.size + 'px' : '';
          st.opacity = it.opacity == null ? '' : String(it.opacity);
        }
        for (const [k, n] of pool) if (!seen.has(k)) { n.el.remove(); pool.delete(k); }
      },
      clear() { this.set([]); },
    };
  }

  style();
  Object.assign(AV, { tex, texify, texLabels });
})(typeof window !== 'undefined' ? window : globalThis);
