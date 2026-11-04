// LaTeX → image via MathJax's SVG output, for drawing math onto canvas textures in VR.
// Requires MathJax 3 (tex-svg) with svg.fontCache = 'local' so each SVG carries its own glyphs.

const cache = new Map();

export function mathReady() {
  return window.MathJax?.startup?.promise || Promise.reject(new Error('MathJax not loaded'));
}

// Returns a Promise of { img, w, h, depth } (CSS pixels at font size px; depth = below-baseline part).
export function texImage(tex, { color = '#16181e', px = 32, display = false } = {}) {
  const key = `${tex}|${color}|${px}|${display}`;
  if (cache.has(key)) return cache.get(key);
  const p = mathReady().then(() => {
    const node = window.MathJax.tex2svg(tex, { display });
    const svg = node.querySelector('svg');
    const ex = px * 0.442;
    const w = parseFloat(svg.getAttribute('width')) * ex;
    const h = parseFloat(svg.getAttribute('height')) * ex;
    const va = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg.getAttribute('style') || '');
    const depth = va ? -parseFloat(va[1]) * ex : 0;
    svg.setAttribute('width', `${w}px`);
    svg.setAttribute('height', `${h}px`);
    svg.setAttribute('style', `color:${color}`);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    return img.decode().then(() => ({ img, w, h, depth }));
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

// Split "text with $math$ inside" into runs: [{ text } | { tex }]
export function splitMath(s) {
  const out = [];
  const re = /\$([^$]+)\$/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ tex: m[1] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
