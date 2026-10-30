// Reference records and their PDFs, shared by alphaLibrary (this applet),
// the workspace (app/lib/references.mjs) and the servers (server/papers.mjs).
// A reference links its paper with `pdf`, a path such as
// papers/kahn-markovic-2012.pdf.

const NEW_ID = String.raw`\d{4}\.\d{4,5}(?:v\d+)?`;
const OLD_ID = String.raw`[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?`;
const ID = `(${NEW_ID}|${OLD_ID})`;
const exactId = new RegExp(`^(?:arxiv:)?${ID}$`, 'i');

// The arXiv identifier of a reference, if it records one: the eprint field,
// an arxiv.org link, an arXiv DOI, or "arXiv:…" in the citation text.
export function arxivId(r) {
  if (!r || typeof r !== 'object') return null;
  const eprint = String(r.eprint ?? '').trim();
  if (eprint && (!r.archiveprefix || /arxiv/i.test(r.archiveprefix))) {
    const m = eprint.match(exactId);
    if (m) return m[1];
  }
  const url = String(r.url ?? '').match(new RegExp(`arxiv\\.org/(?:abs|pdf)/${ID}`, 'i'));
  if (url) return url[1];
  const doi = String(r.doi ?? '').match(new RegExp(`10\\.48550/arxiv\\.${ID}`, 'i'));
  if (doi) return doi[1];
  for (const field of [r.title, r.journal, r.notes, r.legacy?.citation]) {
    const m = String(field ?? '').match(new RegExp(`arxiv[:\\s]\\s*${ID}`, 'i'));
    if (m) return m[1];
  }
  return null;
}

// An arXiv identifier typed on its own ("2312.11258", "arXiv:math/0411662",
// or an arxiv.org link), or null.
export function parseArxiv(text) {
  const s = String(text ?? '').trim();
  const m = s.match(exactId) || s.match(new RegExp(`arxiv\\.org/(?:abs|pdf)/${ID}`, 'i'));
  return m ? m[1] : null;
}

export const arxivBase = (id) => String(id).replace(/v\d+$/, '');

// Where a PDF of this reference can be downloaded from, if we know.
export function pdfDownload(r) {
  const id = arxivId(r);
  if (id) return { url: `https://arxiv.org/pdf/${id}`, label: `arXiv:${id}` };
  const url = String(r?.url ?? '');
  if (/^https?:\/\/[^\s]+\.pdf(?:[?#][^\s]*)?$/i.test(url)) {
    try {
      return { url, label: new URL(url).host };
    } catch {
      return null;
    }
  }
  return null;
}

const basename = (p) => String(p).split('/').pop() || '';
const stem = (p) => basename(p).replace(/\.pdf$/i, '');

// Project PDFs that look like this reference's paper: the arXiv number in
// the filename first, then the citation key. `paths` are project file paths.
export function suggestedPdfs(r, paths) {
  const pdfs = paths.filter((p) => /\.pdf$/i.test(p) && p !== r?.pdf);
  const id = arxivId(r), key = String(r?.key ?? '').toLowerCase();
  const scored = [];
  for (const p of pdfs) {
    const name = stem(p).toLowerCase();
    let score = 0;
    if (id) {
      const base = arxivBase(id).toLowerCase();
      const plain = base.includes('/') ? base.replace('/', '[/_.-]?') : base.replace('.', '\\.');
      if (new RegExp(`(^|[^0-9])${plain}(v\\d+)?($|[^0-9])`).test(name)) score = 3;
    }
    if (!score && key.length >= 4) {
      if (name === key) score = 2;
      else if (key.length >= 6 && name.includes(key)) score = 1;
    }
    if (score) scored.push({ path: p, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length).map((s) => s.path).slice(0, 5);
}

// The path a downloaded or uploaded PDF gets: papers/<key>.pdf.
export function paperPath(r, fallback = 'paper') {
  const raw = r?.key || (arxivId(r) ?? '').replace('/', '-') || fallback;
  const slug = String(raw).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
  return `papers/${slug || fallback}.pdf`;
}

// Text selected in a PDF, tidied for quoting: line-break hyphens joined,
// whitespace collapsed.
export function cleanQuote(text) {
  return String(text ?? '')
    .replace(/­/g, '')
    .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

// A quotation appended to reading notes.
export function quoteForNotes(notes, quote, page) {
  const block = `> ${quote}${page ? ` (p. ${page})` : ''}`;
  const before = String(notes ?? '').replace(/\s+$/, '');
  return before ? `${before}\n\n${block}\n` : `${block}\n`;
}

// A title shortened at a word boundary.
export function shortTitle(title, max = 90) {
  const full = String(title ?? '').replace(/\s+/g, ' ').trim();
  return full.length <= max ? full : full.slice(0, max).replace(/[\s,;:.]+\S*$/, '') + '…';
}

// A reference's role: for one manuscript, or the project's reading list.
export const roleOf = (r, manuscript = 'project') =>
  (manuscript !== 'project' && r?.roles?.[manuscript]) || r?.role || 'secondary';

// A citation key from the first author's surname and the year, such as
// nyberg-brodda-2024, made unique among `taken` keys (…2024b, …2024c).
export function citationKey(r, taken = []) {
  const first = String(r?.authors ?? '').split(/\s+and\s+/i)[0].trim();
  const surname = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).pop() || '';
  const slug = surname.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '');
  const base = [slug || 'ref', r?.year].filter(Boolean).join('-');
  const used = new Set(taken.map((k) => String(k).toLowerCase()));
  if (!used.has(base)) return base;
  for (let c = 98; c < 123; c++) if (!used.has(base + String.fromCharCode(c))) return base + String.fromCharCode(c);
  return `${base}-${Date.now()}`;
}

// A fresh record for a reference typed in by hand.
export const blankRecord = () => ({
  title: '', authors: '', year: '', doi: '', url: '', role: 'secondary',
  annotation: '', coverage: 'Not reviewed', key: `ref${Date.now()}`,
});
