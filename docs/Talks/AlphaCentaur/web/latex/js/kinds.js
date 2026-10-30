// File kinds, shared by the browser and server.mjs.
const TEX = /\.(tex|ltx|sty|cls|dtx|ins|def|clo|fd|cfg|tikz|pgf|lco)$/i;
const BIB = /\.(bib|bst|bbx|cbx|lbx|dbx)$/i;
const TEXT = /\.(txt|md|markdown|csv|tsv|dat|json|ya?ml|toml|py|sh|m|asy|mp|gp|plt|lua|bat|cmd)$|(^|\/)(latexmkrc|Makefile|README|LICENSE)$/i;
export const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

export function kindOf(name) {
  if (TEX.test(name)) return 'tex';
  if (BIB.test(name)) return 'bib';
  if (TEXT.test(name)) return 'text';
  if (IMAGE.test(name)) return 'image';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return 'binary';
}
export const editable = kind => kind === 'tex' || kind === 'bib' || kind === 'text';

// A project-relative path: forward slashes, no empty, '.', '..' or hidden
// segments, no control characters.
export function cleanPath(p) {
  if (typeof p !== 'string' || !p || p.length > 500) return null;
  const parts = p.split('/');
  if (parts.some(s => !s || s === '.' || s === '..' || s.startsWith('.') || /[\x00-\x1f\\:]/.test(s))) return null;
  return parts.join('/');
}
