// LaTeX source analysis without a DOM: the project index (labels, citation
// keys, macros, environments), the document outline, Overleaf-style code
// checks, and finding the math around a cursor.

// Comments become spaces, so offsets still match the source.
export const blankComments = text => text.replace(/(?<!\\)%[^\n]*/g, m => ' '.repeat(m.length));

export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
export function lineAt(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
// The balanced {…} group starting at text[open] === '{'; returns its end.
export function closeBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

export const emptyIndex = () => ({labels: new Map(), cites: new Map(), commands: new Map(), macros: {}, environments: new Set(), packages: new Set(), files: []});

// Adds one .tex file's definitions to `into`.
export function scanSource(text, file, into) {
  const src = blankComments(text), starts = lineStarts(src);
  const lines = text.split('\n');
  for (const m of src.matchAll(/\\label\s*\{([^{}]+)\}/g)) {
    const line = lineAt(starts, m.index);
    into.labels.set(m[1].trim(), {file, line, text: lines[line - 1].trim().slice(0, 140)});
  }
  for (const m of src.matchAll(/\\(?:re|provide)?newcommand\*?\s*\{?\s*\\([a-zA-Z@]+)\s*\}?\s*(?:\[(\d)\])?\s*(\[[^\]]*\])?\s*\{/g)) {
    const open = m.index + m[0].length - 1, end = closeBrace(src, open);
    const args = Number(m[2] || 0);
    into.commands.set(m[1], {args, file, line: lineAt(starts, m.index)});
    if (end > open) into.macros[`\\${m[1]}`] = src.slice(open + 1, end);
  }
  for (const m of src.matchAll(/\\DeclareMathOperator(\*?)\s*\{?\s*\\([a-zA-Z@]+)\s*\}?\s*\{/g)) {
    const open = m.index + m[0].length - 1, end = closeBrace(src, open);
    into.commands.set(m[2], {args: 0, file, line: lineAt(starts, m.index)});
    if (end > open) into.macros[`\\${m[2]}`] = `\\operatorname${m[1]}{${src.slice(open + 1, end)}}`;
  }
  for (const m of src.matchAll(/\\def\s*\\([a-zA-Z@]+)\s*\{/g)) {
    const open = m.index + m[0].length - 1, end = closeBrace(src, open);
    into.commands.set(m[1], {args: 0, file, line: lineAt(starts, m.index)});
    if (end > open) into.macros[`\\${m[1]}`] = src.slice(open + 1, end);
  }
  for (const m of src.matchAll(/\\(?:newtheorem\*?|newenvironment|renewenvironment|declaretheorem|newmdtheoremenv)\s*(?:\[[^\]]*\])?\s*\{([a-zA-Z*]+)\}/g)) into.environments.add(m[1]);
  for (const m of src.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g)) for (const p of m[1].split(',')) into.packages.add(p.trim());
  for (const m of src.matchAll(/\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g)) into.cites.set(m[1], {file, line: lineAt(starts, m.index), title: '', author: ''});
}
const field = (entry, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*`, 'i').exec(entry);
  if (!m) return '';
  let i = m.index + m[0].length, out = '';
  if (entry[i] === '{') { const end = closeBrace(entry, i); out = entry.slice(i + 1, end < 0 ? undefined : end); }
  else if (entry[i] === '"') { const end = entry.indexOf('"', i + 1); out = entry.slice(i + 1, end < 0 ? undefined : end); }
  else out = /^[^,}\s]+/.exec(entry.slice(i))?.[0] || '';
  return out.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
};
export function scanBib(text, file, into) {
  const starts = lineStarts(text);
  for (const m of text.matchAll(/@\s*([a-zA-Z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/g)) {
    if (/^(string|preamble|comment)$/i.test(m[1])) continue;
    const entry = text.slice(m.index, m.index + 4000);
    const author = field(entry, 'author') || field(entry, 'editor');
    into.cites.set(m[2], {file, line: lineAt(starts, m.index), type: m[1].toLowerCase(), title: field(entry, 'title'),
      author: author.split(/\s+and\s+/)[0].split(',')[0].trim(), year: field(entry, 'year') || field(entry, 'date').slice(0, 4)});
  }
}

// ------------------------------------------------------------- outline --
export const OUTLINE_LEVELS = {part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6};
export function outlineOf(text) {
  const src = blankComments(text), starts = lineStarts(src), out = [];
  for (const m of src.matchAll(/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*\])?\s*\{/g)) {
    const open = m.index + m[0].length - 1, end = closeBrace(src, open);
    const title = (end > open ? text.slice(open + 1, end) : text.slice(open + 1, open + 60)).replace(/\s+/g, ' ').trim();
    out.push({level: OUTLINE_LEVELS[m[1]], command: m[1], star: !!m[2], title, line: lineAt(starts, m.index), from: m.index});
  }
  if (/\\begin\s*\{abstract\}/.test(src)) {
    const at = src.search(/\\begin\s*\{abstract\}/);
    out.push({level: 2, command: 'abstract', star: true, title: 'Abstract', line: lineAt(starts, at), from: at});
  }
  return out.sort((a, b) => a.from - b.from);
}

// ---------------------------------------------------------- code check --
const VERBATIM = /^(verbatim\*?|lstlisting|minted|comment|Verbatim\*?|alltt|filecontents\*?)$/;
const MATH_ENVS = /^(equation|align|gather|multline|eqnarray|flalign|alignat|displaymath|math|split|aligned|gathered|alignedat|cases|dcases|[pbBvV]?matrix|smallmatrix|array|subequations)\*?$/;
// Mismatched environments, braces and math delimiters, with source ranges.
export function codeCheck(text) {
  // Verbatim-like bodies are not LaTeX: blank them for every check.
  const src = blankComments(text).replace(/(\\begin\s*\{(verbatim\*?|lstlisting|minted|comment|Verbatim\*?|alltt|filecontents\*?)\}(?:\{[^{}]*\})?)([\s\S]*?)(\\end\s*\{\2\})/g,
    (_m, open, _name, body, close) => open + body.replace(/[^\n]/g, ' ') + close);
  const out = [], envs = [];
  const add = (from, to, message, severity = 'error') => out.push({from, to, message, severity});
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const m = /^\\(begin|end)\s*\{([^{}]*)\}/.exec(src.slice(i, i + 120));
      if (m) {
        const name = m[2].trim(), to = i + m[0].length;
        if (m[1] === 'begin') {
          envs.push({name, from: i, to});
          if (VERBATIM.test(name)) {
            const end = src.indexOf(`\\end{${name}}`, to);
            if (end < 0) { add(i, to, `\\begin{${name}} is never closed.`); return out; }
            envs.pop();
            i = end + `\\end{${name}}`.length;
            continue;
          }
        } else {
          const open = envs.pop();
          if (!open) add(i, to, `\\end{${name}} has no matching \\begin{${name}}.`);
          else if (open.name !== name) {
            add(i, to, `\\end{${name}} closes \\begin{${open.name}} (line ${lineAt(lineStarts(src), open.from)}).`);
            // Recover: if the right \begin is further out, unwind to it;
            // otherwise treat this \end as closing the open environment.
            const k = envs.map(e => e.name).lastIndexOf(name);
            if (k >= 0) envs.length = k;
          }
        }
        i = to;
        continue;
      }
      i += 2;
      continue;
    }
    i++;
  }
  return out.concat(braceCheck(src), mathCheck(src), envs.map(e => ({from: e.from, to: e.to, message: `\\begin{${e.name}} is never closed.`, severity: 'error'})));
}
function braceCheck(src) {
  const open = [], out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') open.push(i);
    else if (c === '}') {
      if (!open.length) out.push({from: i, to: i + 1, message: 'Extra closing brace }.', severity: 'error'});
      else open.pop();
    }
  }
  for (const at of open.slice(-3)) out.push({from: at, to: at + 1, message: 'This brace { is never closed.', severity: 'error'});
  return out;
}
// Unclosed inline $…$ within a paragraph, and unpaired \[ \] / \( \).
function mathCheck(src) {
  const out = [];
  for (const para of src.matchAll(/(?:[^\n]|\n(?!\s*\n))+/g)) {
    const text = para[0], base = para.index;
    let open = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '\\') {
        const two = text.slice(i, i + 2);
        if ((two === '\\(' || two === '\\[') && !open) open = {d: two, at: i};
        else if (two === '\\)' || two === '\\]') {
          const want = two === '\\)' ? '\\(' : '\\[';
          if (open?.d === want) open = null;
          else if (!open) out.push({from: base + i, to: base + i + 2, message: `${two} has no matching ${want}.`, severity: 'error'});
        }
        i++;
        continue;
      }
      if (c === '$') {
        const d = text[i + 1] === '$' ? '$$' : '$';
        if (open && open.d === d) open = null;
        else if (!open) open = {d, at: i};
        if (d === '$$') i++;
      }
    }
    if (open && (open.d === '$' || open.d === '\\(')) out.push({from: base + open.at, to: base + open.at + open.d.length,
      message: `Inline math opened with ${open.d} is not closed in this paragraph.`, severity: 'warning'});
  }
  return out;
}

// --------------------------------------------------------- math finder --
// The math expression containing `pos`, if any: {from, to, tex, display}.
export function mathAt(text, pos) {
  const lo = Math.max(0, pos - 4000), hi = Math.min(text.length, pos + 4000);
  const src = blankComments(text.slice(lo, hi)), p = pos - lo;
  // Display environments: the innermost \begin{env} before pos whose \end follows.
  const begins = [...src.slice(0, p).matchAll(/\\begin\s*\{([a-zA-Z]+\*?)\}/g)].reverse();
  for (const b of begins) {
    if (!MATH_ENVS.test(b[1]) || /^(split|aligned|gathered|alignedat|cases|dcases|[pbBvV]?matrix|smallmatrix|array)\*?$/.test(b[1])) continue;
    const endTag = `\\end{${b[1]}}`, end = src.indexOf(endTag, b.index);
    if (end >= p - 1 && end > b.index) return {from: lo + b.index, to: lo + end + endTag.length, tex: src.slice(b.index, end + endTag.length), display: true, env: b[1]};
    if (end >= 0 && end < p) break;
  }
  // \[ … \]
  const ob = src.lastIndexOf('\\[', p), cb = src.lastIndexOf('\\]', p - 1);
  if (ob >= 0 && ob > cb && src[ob - 1] !== '\\') {
    const close = src.indexOf('\\]', ob + 2);
    if (close >= p - 1) return {from: lo + ob, to: lo + close + 2, tex: src.slice(ob + 2, close), display: true};
  }
  // $…$, $$…$$ and \(…\) within the paragraph.
  const paraStart = Math.max(src.lastIndexOf('\n\n', p - 1), src.lastIndexOf('\n \n', p - 1), -1) + 1;
  const after = src.slice(p).search(/\n\s*\n/), paraEnd = after < 0 ? src.length : p + after;
  const para = src.slice(paraStart, paraEnd);
  let open = null;
  for (let i = 0; i < para.length; i++) {
    const c = para[i];
    if (c === '\\') {
      const two = para.slice(i, i + 2);
      if (two === '\\(' && !open) open = {d: two, at: i};
      else if (two === '\\)' && open?.d === '\\(') {
        if (paraStart + open.at <= p && paraStart + i + 2 >= p) return {from: lo + paraStart + open.at, to: lo + paraStart + i + 2, tex: para.slice(open.at + 2, i), display: false};
        open = null;
      }
      i++;
      continue;
    }
    if (c === '$') {
      const d = para[i + 1] === '$' ? '$$' : '$';
      if (!open) open = {d, at: i};
      else if (open.d === d) {
        const start = paraStart + open.at, end = paraStart + i + d.length;
        if (start <= p && end >= p) return {from: lo + start, to: lo + end, tex: para.slice(open.at + d.length, i), display: d === '$$'};
        open = null;
      }
      if (d === '$$') i++;
    }
  }
  return null;
}

// What a ⌘-click or hover at `pos` refers to: a label reference, a citation
// key, or a file.
export function referenceAt(lineText, column) {
  const re = /\\([a-zA-Z]*ref|[a-zA-Z]*cite[a-zA-Z]*|nocite|input|include|subfile|includegraphics|bibliography|addbibresource|usepackage|documentclass|label)\*?(?:\[[^\]]*\]){0,2}\{([^{}]*)\}/g;
  for (const m of lineText.matchAll(re)) {
    const open = m.index + m[0].length - m[2].length - 2; // the '{' before the argument
    if (column < m.index || column > m.index + m[0].length) continue;
    // Pick the comma-separated item under the cursor (\cite{a,b}).
    let start = open + 1, name = m[2];
    for (const part of m[2].split(',')) {
      if (column <= start + part.length || part === m[2].split(',').at(-1)) { name = part; break; }
      start += part.length + 1;
    }
    const cmd = m[1];
    const type = /ref$/.test(cmd) && cmd !== 'href' ? 'ref' : /cite|nocite/.test(cmd) ? 'cite' : cmd === 'label' ? 'label' :
      cmd === 'usepackage' || cmd === 'documentclass' ? 'package' : 'file';
    return {type, command: cmd, name: name.trim(), from: start + (name.length - name.trimStart().length), to: start + name.length};
  }
  return null;
}
