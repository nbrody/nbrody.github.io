// KaTeX helpers. Math is pre-rendered to HTML both in the editor and in the
// exported deck, so what you see while editing is exactly what is presented.

const cache = new Map();

export function parseMacros(src) {
  const macros = {};
  const re = /\\(?:re)?newcommand\s*\{?\s*(\\[A-Za-z]+)\s*\}?\s*(?:\[(\d)\])?\s*\{/g;
  let m;
  while ((m = re.exec(src || ''))) {
    let depth = 1, i = re.lastIndex;
    for (; i < src.length && depth; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    macros[m[1]] = src.slice(re.lastIndex, i - 1);
    re.lastIndex = i;
  }
  const def = /\\def\s*(\\[A-Za-z]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  while ((m = def.exec(src || ''))) macros[m[1]] = m[2];
  return macros;
}

export function renderTeX(tex, display, macros, macroKey = '') {
  const key = (display ? 'D' : 'I') + macroKey + '\u0000' + tex;
  if (cache.has(key)) return cache.get(key);
  let out;
  if (!window.katex) out = `<code>${escapeHTML(tex)}</code>`;
  else {
    try {
      out = window.katex.renderToString(tex.replace(/ /g, ' '), {
        displayMode: display, throwOnError: false, macros: { ...macros }, strict: 'ignore', trust: false, output: 'html',
      });
    } catch (e) {
      out = `<span class="pz-tex-error" title="${escapeHTML(e.message)}">${escapeHTML(tex)}</span>`;
    }
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}

// Split a string into text and math pieces. Understands $…$, $$…$$, \(…\),
// \[…\] and the escape \$ for a literal dollar sign.
export function splitMath(s) {
  const parts = [];
  let buf = '', i = 0;
  const flush = () => { if (buf) parts.push({ text: buf }); buf = ''; };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '$') { buf += '$'; i += 2; continue; }
    if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const close = s[i + 1] === '(' ? '\\)' : '\\]';
      const j = s.indexOf(close, i + 2);
      if (j > i + 2) { flush(); parts.push({ tex: s.slice(i + 2, j), display: close === '\\]' }); i = j + 2; continue; }
    }
    if (c === '$') {
      if (s[i + 1] === '$') {
        const j = s.indexOf('$$', i + 2);
        if (j > i + 2) { flush(); parts.push({ tex: s.slice(i + 2, j), display: true }); i = j + 2; continue; }
      } else {
        let j = i + 1;
        while (j < s.length && (s[j] !== '$' || s[j - 1] === '\\')) j++;
        if (j < s.length && j > i + 1) { flush(); parts.push({ tex: s.slice(i + 1, j), display: false }); i = j + 1; continue; }
      }
    }
    buf += c; i++;
  }
  flush();
  return parts;
}

export function hasMath(s) {
  return splitMath(s || '').some(p => p.tex != null);
}

// Render the math inside an HTML fragment (text nodes only; code is skipped).
export function renderMathInHTML(html, macros, macroKey) {
  if (!html || !/[$\\]/.test(html)) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.parentElement || !n.parentElement.closest('code,pre')) nodes.push(n);
  }
  for (const node of nodes) {
    const parts = splitMath(node.data);
    if (!parts.some(p => p.tex != null)) {
      if (node.data.includes('\\$')) node.data = node.data.replace(/\\\$/g, '$');
      continue;
    }
    const frag = document.createDocumentFragment();
    for (const p of parts) {
      if (p.tex == null) frag.append(p.text);
      else {
        const span = document.createElement('span');
        span.className = p.display ? 'pz-tex pz-tex-display' : 'pz-tex';
        span.innerHTML = renderTeX(p.tex, p.display, macros, macroKey);
        frag.append(span);
      }
    }
    node.replaceWith(frag);
  }
  return tpl.innerHTML;
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
