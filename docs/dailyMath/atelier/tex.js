/* Daily Math Atelier — vendored KaTeX typesetting & pinned stage labels */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});
  const CACHE = new Map();

  DM.tex = function (src, opts = {}) {
    const key = (opts.displayMode ? 'D:' : 'I:') + src;
    if (CACHE.has(key)) return CACHE.get(key);
    let out;
    if (root.katex && root.katex.renderToString) {
      out = root.katex.renderToString(String(src), {
        displayMode: !!opts.displayMode,
        throwOnError: false,
        strict: false,
      });
    } else {
      out = `<code>${String(src).replace(/</g, '&lt;')}</code>`;
    }
    CACHE.set(key, out);
    return out;
  };

  // Replace $$...$$ and $...$ outside HTML tags
  DM.texify = function (html) {
    return String(html).split(/(<[^>]+>)/g).map(part => {
      if (part.startsWith('<')) return part;
      return part
        .replace(/\$\$([^$]+)\$\$/g, (_, m) => DM.tex(m.trim(), { displayMode: true }))
        .replace(/\$([^$]+)\$/g, (_, m) => DM.tex(m.trim(), { displayMode: false }));
    }).join('');
  };

  DM.texLabels = function (app) {
    const nodes = new Map();
    const layer = app.texLayer;

    function set(items) {
      const keep = new Set();
      for (const it of items) {
        keep.add(it.key);
        let el = nodes.get(it.key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'dm-tex-label';
          layer.appendChild(el);
          nodes.set(it.key, el);
        }
        if (el.dataset.tex !== it.tex) {
          el.innerHTML = DM.tex(it.tex);
          el.dataset.tex = it.tex;
        }
        el.style.color = it.color || '';
        el.style.fontSize = (it.size || 13.5) + 'px';
        const tx = it.align === 'left' ? '0%' : it.align === 'right' ? '-100%' : '-50%';
        const ty = it.valign === 'top' ? '0%' : it.valign === 'bottom' ? '-100%' : '-50%';
        el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0) translate(${tx}, ${ty})`;
      }
      for (const [k, el] of nodes.entries()) {
        if (!keep.has(k)) {
          el.remove();
          nodes.delete(k);
        }
      }
    }

    function clear() {
      for (const el of nodes.values()) el.remove();
      nodes.clear();
    }

    return { set, clear };
  };
})(typeof window !== 'undefined' ? window : globalThis);
