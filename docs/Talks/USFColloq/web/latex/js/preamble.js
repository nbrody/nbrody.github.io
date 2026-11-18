// The document's settings as its preamble states them, for the Document panel
// in the PDF view, and the edits that change them. Each edit returns the new
// source and touches only the lines it is about, so whatever else the
// preamble says stays as written. Pure functions (tested in
// test/preamble.test.mjs).
import {closeBrace, blankComments} from './latex.js';

export const CLASSES = ['article', 'amsart', 'report', 'book'];
export const SIZES = ['10pt', '11pt', '12pt'];
export const PAPERS = [['letterpaper', 'Letter'], ['a4paper', 'A4']];
export const FONTS = [
  {id: 'cm', label: 'Computer Modern', lines: []},
  {id: 'lm', label: 'Latin Modern', lines: ['\\usepackage{lmodern}']},
  {id: 'times', label: 'Times', lines: ['\\usepackage{newtxtext,newtxmath}']},
  {id: 'palatino', label: 'Palatino', lines: ['\\usepackage{newpxtext,newpxmath}']},
  {id: 'libertinus', label: 'Libertinus', lines: ['\\usepackage{libertinus}']},
  {id: 'garamond', label: 'EB Garamond', lines: ['\\usepackage{ebgaramond}']},
];
export const MARGINS = [['', 'Class default'], ['0.75in', 'Narrow (¾ in)'], ['1in', 'Normal (1 in)'], ['1.25in', 'Wide (1¼ in)'], ['1.5in', 'Wider (1½ in)']];
export const SPACINGS = [['', 'Single'], ['onehalf', 'One and a half'], ['double', 'Double']];

// The packages each font choice loads; a line loading only these is a font line.
const FONT_PACKAGES = /^\s*\\usepackage(\[[^\]]*\])?\{(lmodern|newtxtext,newtxmath|newtxmath,newtxtext|newtxtext|newtxmath|newpxtext,newpxmath|newpxtext|newpxmath|libertinus|ebgaramond|mathpazo|times|txfonts|pxfonts)\}\s*(%.*)?$/;
const GEOMETRY = /^\s*\\usepackage(\[([^\]]*)\])?\{geometry\}\s*(%.*)?$/;
const SETSPACE = /^\s*\\usepackage\{setspace\}\s*(%.*)?$/;
const SPACING_CMD = /^\s*\\(onehalfspacing|doublespacing|singlespacing)\s*(%.*)?$/;

const lines = text => text.split('\n');
// Index of the \begin{document} line (or the end of the file).
function bodyStart(ls) {
  const i = ls.findIndex(l => /^\s*\\begin\{document\}/.test(l));
  return i < 0 ? ls.length : i;
}
// Where a new preamble line goes: after the last \usepackage line, else after \documentclass.
function packageSlot(ls) {
  const end = bodyStart(ls);
  let at = -1;
  for (let i = 0; i < end; i++) if (/^\s*\\(usepackage|documentclass|RequirePackage)\b/.test(ls[i])) at = i;
  return at + 1;
}

// \documentclass[options]{class}
function classLine(ls) {
  const i = ls.findIndex(l => /^\s*\\documentclass\b/.test(l));
  if (i < 0) return null;
  const m = /\\documentclass(?:\[([^\]]*)\])?\{([^}]*)\}/.exec(ls[i]);
  return m ? {i, options: (m[1] || '').split(',').map(s => s.trim()).filter(Boolean), cls: m[2].trim()} : null;
}

// The text of \name{…} in the preamble (balanced braces), with where it is.
function commandIn(text, name) {
  const pre = blankComments(text), end = pre.search(/\\begin\{document\}/);
  const re = new RegExp(`\\\\${name}\\s*(\\[[^\\]]*\\])?\\{`, 'g');
  for (const m of pre.matchAll(re)) {
    if (end >= 0 && m.index > end) break;
    const open = m.index + m[0].length - 1, close = closeBrace(text, open);
    if (close > open) return {start: m.index, open, close, value: text.slice(open + 1, close)};
  }
  return null;
}

// What the Document panel shows.
export function readDocument(text) {
  const ls = lines(text), c = classLine(ls), end = bodyStart(ls), pre = ls.slice(0, end);
  const font = FONTS.find(f => f.lines.length && f.lines.every(l => pre.some(p => p.trim() === l))) || FONTS[0];
  const geometry = pre.map(l => GEOMETRY.exec(l)).find(Boolean);
  const margin = /(?:^|,)\s*margin\s*=\s*([^,\]]+)/.exec(geometry?.[2] || '')?.[1]?.trim() || '';
  const spacing = pre.map(l => SPACING_CMD.exec(l)?.[1]).find(Boolean);
  return {
    cls: c?.cls || '', options: c?.options || [],
    size: c?.options.find(o => SIZES.includes(o)) || '10pt',
    paper: c?.options.find(o => PAPERS.some(([p]) => p === o)) || '',
    title: commandIn(text, 'title')?.value ?? null,
    author: commandIn(text, 'author')?.value ?? null,
    date: commandIn(text, 'date')?.value ?? null,
    maketitle: ls.slice(end).some(l => /^\s*\\maketitle\b/.test(l)),
    font: font.id, margin,
    spacing: spacing === 'onehalfspacing' ? 'onehalf' : spacing === 'doublespacing' ? 'double' : '',
  };
}

// \documentclass: its class, or one option from a group (sizes, papers).
export function setClass(text, cls) {
  const ls = lines(text), c = classLine(ls);
  if (!c) return `\\documentclass{${cls}}\n${text}`;
  ls[c.i] = ls[c.i].replace(/\{[^}]*\}/, `{${cls}}`);
  return ls.join('\n');
}
export function setClassOption(text, group, value) {
  const ls = lines(text), c = classLine(ls);
  if (!c) return text;
  const options = c.options.filter(o => !group.includes(o));
  if (value) options.push(value);
  ls[c.i] = ls[c.i].replace(/\\documentclass(\[[^\]]*\])?/, options.length ? `\\documentclass[${options.join(',')}]` : '\\documentclass');
  return ls.join('\n');
}

// \title, \author, \date: replaced in place, or added before \begin{document}.
// A title also needs \maketitle in the body, so one is added if missing.
export function setCommand(text, name, value) {
  const found = commandIn(text, name);
  let out;
  if (found) out = text.slice(0, found.open + 1) + value + text.slice(found.close);
  else {
    const ls = lines(text), at = bodyStart(ls);
    ls.splice(at, 0, `\\${name}{${value}}`);
    out = ls.join('\n');
  }
  if (name === 'title' && value.trim()) {
    const ls = lines(out), at = bodyStart(ls);
    if (at < ls.length && !ls.slice(at).some(l => /^\s*\\maketitle\b/.test(l))) { ls.splice(at + 1, 0, '\\maketitle'); out = ls.join('\n'); }
  }
  return out;
}

// The text font: drops the font lines it knows and adds the chosen one.
export function setFont(text, id) {
  const font = FONTS.find(f => f.id === id) || FONTS[0];
  let ls = lines(text);
  const end = bodyStart(ls);
  ls = ls.filter((l, i) => i >= end || !FONT_PACKAGES.test(l));
  ls.splice(packageSlot(ls), 0, ...font.lines);
  return ls.join('\n');
}

// Margins through geometry (other geometry options stay).
export function setMargin(text, margin) {
  const ls = lines(text), end = bodyStart(ls);
  const i = ls.findIndex((l, j) => j < end && GEOMETRY.test(l));
  if (i >= 0) {
    const opts = (GEOMETRY.exec(ls[i])[2] || '').split(',').map(s => s.trim()).filter(o => o && !/^margin\s*=/.test(o));
    if (margin) opts.push(`margin=${margin}`);
    if (opts.length) ls[i] = `\\usepackage[${opts.join(',')}]{geometry}`;
    else ls.splice(i, 1);
  } else if (margin) ls.splice(packageSlot(ls), 0, `\\usepackage[margin=${margin}]{geometry}`);
  return ls.join('\n');
}

// Line spacing through setspace.
export function setSpacing(text, spacing) {
  let ls = lines(text);
  const end = bodyStart(ls);
  ls = ls.filter((l, i) => i >= end || !SPACING_CMD.test(l));
  const has = ls.some((l, i) => i < bodyStart(ls) && SETSPACE.test(l));
  if (!spacing) {
    ls = ls.filter((l, i) => i >= bodyStart(ls) || !SETSPACE.test(l));
    return ls.join('\n');
  }
  if (!has) ls.splice(packageSlot(ls), 0, '\\usepackage{setspace}');
  ls.splice(bodyStart(ls), 0, spacing === 'double' ? '\\doublespacing' : '\\onehalfspacing');
  return ls.join('\n');
}

// Theorem-like environments for the Insert menu: defined (with amsthm) if the
// preamble lacks them. amsart loads amsthm itself.
export const THEOREMS = {theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition', remark: 'Remark', example: 'Example', conjecture: 'Conjecture'};
export function ensureEnvironment(text, env, known = []) {
  const pre = blankComments(text);
  const ls = lines(text);
  const needsAmsthm = !/\\usepackage(\[[^\]]*\])?\{[^}]*\bamsthm\b[^}]*\}/.test(pre) && classLine(ls)?.cls !== 'amsart';
  if (env === 'proof') {
    if (!needsAmsthm) return text;
    ls.splice(packageSlot(ls), 0, '\\usepackage{amsthm}');
    return ls.join('\n');
  }
  if (!THEOREMS[env] || known.includes(env) || new RegExp(`\\\\newtheorem\\*?\\{${env}\\}`).test(pre)) return text;
  if (needsAmsthm) ls.splice(packageSlot(ls), 0, '\\usepackage{amsthm}');
  const style = ['definition', 'example', 'remark'].includes(env) ? (env === 'remark' ? 'remark' : 'definition') : 'plain';
  // One \theoremstyle line covers the definitions after it, so it is only
  // added when the style in force before \begin{document} differs.
  const at = bodyStart(ls);
  const current = ls.slice(0, at).map(l => /^\s*\\theoremstyle\{(\w+)\}/.exec(l)?.[1]).filter(Boolean).pop() || 'plain';
  const hasStyle = ls.slice(0, at).some(l => /^\s*\\theoremstyle\{/.test(l));
  ls.splice(at, 0, ...(current === style && hasStyle ? [] : [`\\theoremstyle{${style}}`]), `\\newtheorem{${env}}{${THEOREMS[env]}}`);
  return ls.join('\n');
}

// What the Insert menu adds: a block, with the text to select once it is open.
export const BLOCKS = {
  paragraph: {label: 'Paragraph', text: 'New paragraph.', select: 'New paragraph.'},
  section: {label: 'Section', text: '\\section{New section}', select: 'New section'},
  subsection: {label: 'Subsection', text: '\\subsection{New subsection}', select: 'New subsection'},
  ...Object.fromEntries(Object.entries(THEOREMS).map(([env, name]) => [env, {label: name, env, text: `\\begin{${env}}\n${name === 'Definition' ? 'Define the notion here.' : 'State it here.'}\n\\end{${env}}`, select: name === 'Definition' ? 'Define the notion here.' : 'State it here.'}])),
  proof: {label: 'Proof', env: 'proof', text: '\\begin{proof}\nWrite the proof here.\n\\end{proof}', select: 'Write the proof here.'},
  equation: {label: 'Numbered equation', text: '\\begin{equation}\n  a = b\n\\end{equation}', select: 'a = b'},
  display: {label: 'Display math', text: '\\[\n  a = b\n\\]', select: 'a = b'},
  itemize: {label: 'Bulleted list', text: '\\begin{itemize}\n  \\item First point.\n\\end{itemize}', select: 'First point.'},
  enumerate: {label: 'Numbered list', text: '\\begin{enumerate}\n  \\item First step.\n\\end{enumerate}', select: 'First step.'},
  figure: {label: 'Figure', text: '\\begin{figure}[h]\n  \\centering\n  % \\includegraphics[width=0.6\\linewidth]{figures/name}\n  \\caption{Caption.}\n\\end{figure}', select: 'Caption.'},
  table: {label: 'Table', text: '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{ccc}\n    \\hline\n    a & b & c \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Caption.}\n\\end{table}', select: 'Caption.'},
};

// Adds a block as its own paragraph after line `after` (1-based; 0 means
// before \end{document}). Returns the text and the block's first line.
export function insertBlock(text, block, after = 0) {
  const ls = lines(text);
  let at = after;
  if (!at) { const end = ls.findIndex(l => /^\s*\\end\{document\}/.test(l)); at = end < 0 ? ls.length : end; }
  const add = block.split('\n');
  const before = at > 0 && ls[at - 1].trim() ? [''] : [];
  const afterBlank = at < ls.length && ls[at].trim() ? [''] : [];
  ls.splice(at, 0, ...before, ...add, ...afterBlank);
  return {text: ls.join('\n'), line: at + before.length + 1};
}
