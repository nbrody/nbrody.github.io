// Titles with TeX in them ("$\mathsf{SO}_3(\mathbb{Q})$ …") rendered with
// KaTeX and the project's macros.tex, as alphaMarkdown renders notes.
import katex from '../../latex/vendor/katex/katex.mjs';
import {projectMacros, katexOptions, mathPattern, formula} from '../../markdown/js/syntax.js';

let macros = {};
export function setMacros(source = '') {
  try { macros = projectMacros(source, katex).macros; } catch { macros = {}; }
}

const escape = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

// HTML for text with inline math; everything else escaped.
export function mathHTML(text) {
  const s = String(text ?? '');
  let out = '', last = 0;
  for (const m of s.matchAll(new RegExp(mathPattern.source, 'g'))) {
    out += escape(s.slice(last, m.index));
    const {tex} = formula(m[0]);
    try { out += katex.renderToString(tex, {...katexOptions(macros), displayMode: false}); }
    catch { out += escape(m[0]); }
    last = m.index + m[0].length;
  }
  return out + escape(s.slice(last));
}

// Plain text for places that can't show math (window titles, tooltips).
export const plainText = text => String(text ?? '').replace(/\$/g, '').replace(/\\(?:mathsf|mathrm|mathbb|mathcal|operatorname|text)\{([^{}]*)\}/g, '$1')
  .replace(/\\([A-Za-z]+)/g, '$1').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
