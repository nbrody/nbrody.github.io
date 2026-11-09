// A small Markdown renderer for notebook text cells: headings, paragraphs,
// lists, block quotes, code, links, **bold**, *italic*, and $...$ / $$...$$
// math rendered with KaTeX.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function katex(tex, display) {
  try { return window.katex.renderToString(tex, { throwOnError: false, displayMode: display }); }
  catch { return esc(tex); }
}

function inline(src) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = src
    .replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`))
    .replace(/\$\$([^$]+)\$\$/g, (_, t) => keep(katex(t, true)))
    .replace(/\$([^$\n]+)\$/g, (_, t) => keep(katex(t, false)));
  s = esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
      const safe = /^(https?:|#|\.\/|\.\.\/)/.test(u) ? u : '#';
      return `<a href="${safe}" target="${safe.startsWith('#') ? '_self' : '_blank'}" rel="noopener">${t}</a>`;
    });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
}

export function markdownHTML(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      const n = m[1].length + 1;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue;
    }
    if (/^\$\$/.test(line.trim())) {
      const buf = [line.trim().replace(/^\$\$/, '')];
      if (!/\$\$\s*$/.test(buf[0]) || buf[0].trim() === '') {
        i++;
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
        if (i < lines.length) buf.push(lines[i]);
      }
      i++;
      out.push(`<div class="math-block">${katex(buf.join('\n').replace(/\$\$\s*$/, ''), true)}</div>`);
      continue;
    }
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`); continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${markdownHTML(buf.join('\n'))}</blockquote>`); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+|\$\$)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

export function renderMarkdown(src) {
  const el = document.createElement('div');
  el.className = 'md';
  el.innerHTML = markdownHTML(src);
  return el;
}
