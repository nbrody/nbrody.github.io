// Turning Regina's output into LaTeX (rendered with KaTeX).

export function render(el, tex, display = false) {
  try {
    window.katex.render(tex, el, { throwOnError: false, displayMode: display });
  } catch {
    el.textContent = tex;
  }
  return el;
}

export function mathEl(tex, display = false, tag = 'span') {
  return render(document.createElement(tag), tex, display);
}

const Z = '\\mathbb{Z}';

// {rank, torsion: ["2","2","5"]} -> Z_2^2 ⊕ Z_5 ⊕ Z^3
export function abelianTeX(g) {
  if (!g) return '?';
  const parts = [];
  const counts = new Map();
  for (const t of g.torsion) counts.set(t, (counts.get(t) || 0) + 1);
  for (const [t, k] of counts) parts.push(k === 1 ? `${Z}_{${t}}` : `(${Z}_{${t}})^{${k}}`);
  if (g.rank === 1) parts.push(Z);
  else if (g.rank > 1) parts.push(`${Z}^{${g.rank}}`);
  return parts.length ? parts.join(' \\oplus ') : '0';
}

function expTeX(e) { return e === 1 ? '' : `^{${e}}`; }

// One term c·x^e, given a coefficient string and a rendered power (or '').
function term(c, pow, first) {
  let n = BigInt(c);
  const neg = n < 0n;
  if (neg) n = -n;
  const mag = n.toString();
  const body = pow ? (mag === '1' ? pow : mag + pow) : mag;
  if (first) return (neg ? '-' : '') + body;
  return (neg ? ' - ' : ' + ') + body;
}

// Laurent polynomial from {min, coeffs}; highest power first.
// half=true means the variable is √t (Regina's Jones convention).
export function laurentTeX(p, v = 't', half = false) {
  const items = [];
  p.coeffs.forEach((c, i) => { if (c !== '0') items.push([p.min + i, c]); });
  if (!items.length) return '0';
  const allEven = items.every(([e]) => e % 2 === 0);
  const out = [];
  items.reverse().forEach(([e, c], k) => {
    let pow;
    if (!half) pow = e === 0 ? '' : `${v}${expTeX(e)}`;
    else if (allEven) pow = e === 0 ? '' : `${v}${expTeX(e / 2)}`;
    else pow = e === 0 ? '' : (e === 2 ? v : `${v}^{${e % 2 ? `${e}/2` : e / 2}}`);
    out.push(term(c, pow, k === 0));
  });
  return out.join('');
}

// Ordinary polynomial from ascending coefficients.
export function polyTeX(coeffs, v = 't') {
  return laurentTeX({ min: 0, coeffs }, v);
}

// Regina's two-variable text ("-a^4 + a^2 z^2 + 2 a^2") to TeX.
export function textPolyTeX(s, rename = {}) {
  return s
    .replace(/\b([a-z])\b/g, (m, x) => rename[x] ?? x)
    .replace(/\^(-?\d+)/g, '^{$1}')
    .replace(/(\d)\s+(?=[a-z\\])/g, '$1\\,');
}

// Cyclotomic field element printed by Regina in variable z.
export function cyclotomicTeX(s, field) {
  const zeta = `\\zeta_{${field}}`;
  return s
    .replace(/(\d+)\/(\d+)/g, '\\tfrac{$1}{$2}')
    .replace(/\bz\b/g, zeta)
    .replace(/\^(\d+)/g, '^{$1}');
}

// Rational (Regina's tex()) times π.
export function piTeX(r) {
  if (r === '0') return '0';
  if (r === '1') return '\\pi';
  return r + '\\pi';
}

function gen(name) {
  const m = /^([a-zA-Z])(\d+)$/.exec(name);
  return m ? `${m[1]}_{${m[2]}}` : name;
}

function wordTeX(word) {
  const toks = word.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return '1';
  return toks.map((t) => {
    const [g, e] = t.split('^');
    return gen(g) + (e && e !== '1' ? `^{${e}}` : '');
  }).join('');
}

// Regina's text presentation "< a b | a b a^-1, b^3 >" to TeX.
export function presentationTeX(text) {
  const m = /^<\s*(.*?)\s*\|\s*(.*?)\s*>$/.exec(text.trim());
  if (!m) {
    const g = /^<\s*(.*?)\s*>$/.exec(text.trim());
    if (g) return `\\langle ${g[1].split(/\s+/).filter(Boolean).map(gen).join(', ')} \\rangle`;
    return `\\text{${text}}`;
  }
  const gens = m[1].split(/\s+/).filter(Boolean).map(gen).join(', ');
  const rels = m[2] ? m[2].split(',').map(wordTeX).join(',\\; ') : '';
  return `\\langle ${gens || '\\,'} \\mid ${rels} \\rangle`;
}

// Regina's recogniseGroup() text to TeX, e.g. "Z~Free(2) w/monodromy a ↦ b".
export function recognizedTeX(s) {
  if (!s) return null;
  let [main, mono] = s.split(/\s*w\/\s*monodromy\s*/);
  const t = (x) => x
    .replace(/Free\((\d+)\)/g, 'F_{$1}')
    .replace(/Z_(\d+)/g, `${Z}_{$1}`)
    .replace(/\bZ\b/g, Z)
    .replace(/\s*\+\s*/g, ' \\oplus ')
    .replace(/\s+x\s+/g, ' \\times ')
    .replace(/(\d+)\s*\\mathbb/g, '$1\\mathbb');
  let tex;
  const semi = /^(.*?)~(.*)$/.exec(main);
  if (semi) tex = `${t(semi[2])} \\rtimes ${t(semi[1])}`;
  else tex = t(main);
  if (/[^\x00-\x7f]/.test(tex.replace(/\\mathbb\{Z\}/g, ''))) tex = `\\text{${main}}`;
  let monoTeX = null;
  if (mono) {
    monoTeX = mono.split(',').map((piece) => {
      const [a, b] = piece.split('↦');
      if (b === undefined) return `\\text{${piece.trim()}}`;
      return `${wordTeX(a)} \\mapsto ${wordTeX(b)}`;
    }).join(',\\quad ');
  }
  return { tex, monoTeX };
}

// Name a compact connected surface from χ, orientability and boundary count.
export function surfaceTeX(s) {
  if (!s.compact) return '\\text{spun-normal}';
  if (s.euler === undefined) return '?';
  const chi = Number(s.euler);
  const b = s.boundaries ?? 0;
  const conn = s.connected !== false;
  if (!conn) return `\\text{disconnected}, \\chi = ${chi}`;
  if (s.orientable) {
    const g = (2 - chi - b) / 2;
    if (g === 0 && b === 0) return 'S^2';
    if (g === 0 && b === 1) return 'D^2';
    if (g === 0 && b === 2) return '\\text{annulus}';
    if (g === 1 && b === 0) return 'T^2';
    return b ? `\\Sigma_{${g},${b}}` : `\\Sigma_{${g}}`;
  }
  const k = 2 - chi - b;
  if (k === 1 && b === 0) return '\\mathbb{R}P^2';
  if (k === 2 && b === 0) return 'K';
  if (k === 1 && b === 1) return '\\text{Möbius band}';
  return b ? `N_{${k},${b}}` : `N_{${k}}`;
}

export function complexTeX(re, im, digits = 6) {
  const r = Number(re).toFixed(digits), i = Math.abs(Number(im)).toFixed(digits);
  return `${r} ${Number(im) < 0 ? '-' : '+'} ${i}\\,i`;
}
