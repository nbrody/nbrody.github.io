// alphaPy's file format: marimo's. A notebook is an ordinary Python file:
//
//   import marimo
//   __generated_with = "…"
//   app = marimo.App()
//
//   @app.cell
//   def _(mo):            ← the names this cell uses from other cells
//       mo.md("…")        ← the cell's code
//       return            ← the names it defines for other cells
//
//   if __name__ == "__main__":
//       app.run()
//
// parse() splits the file into cells; serialize() writes it back. The kernel
// works out which names each cell defines and uses (the `graph` message), and
// the notebook keeps args/returns in step with it so the file also runs as a
// script under real marimo. Pure functions: no DOM, importable in Node.
export const DEFAULT_FOOTER = 'if __name__ == "__main__":\n    app.run()\n';
const NEW_HEADER = 'import marimo\n\n__generated_with = "alphaPy"\napp = marimo.App()';
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Parentheses (and brackets) still open after `text`, ignoring strings and comments.
function depth(text, start = 0) {
  let d = start, quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (text.startsWith(quote, i)) { i += quote.length - 1; quote = null; }
      continue;
    }
    if (c === '#') break;
    if (c === '"' || c === "'") { quote = text.startsWith(c.repeat(3), i) ? c.repeat(3) : c; if (quote.length === 3) i += 2; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
  }
  return d;
}
const names = text => text.split(',').map(s => s.trim().replace(/[:=].*$/, '').trim()).filter(s => IDENT.test(s));
const atColumnZero = line => line.trim() && !/^[ \t]/.test(line);

export function parse(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex(l => /^@app\.cell\b/.test(l));
  if (first < 0) return null;
  if (!lines.slice(0, first).some(l => /^app\s*=\s*marimo\.App\(/.test(l))) return null;
  // Newer marimo features alphaPy doesn't run yet (a setup block, top-level functions).
  if (lines.slice(0, first).some(l => /^(?:with\s+app\.setup|@app\.)/.test(l))) return null;
  let main = lines.findIndex((l, i) => i > first && /^if __name__ == ["']__main__["']\s*:/.test(l));
  const end = main < 0 ? lines.length : main;
  const header = lines.slice(0, first).join('\n').replace(/\s+$/, '');
  const footer = main < 0 ? DEFAULT_FOOTER : lines.slice(main).join('\n').replace(/\s*$/, '\n');
  const cells = [];
  let i = first;
  while (i < end) {
    if (!lines[i].trim()) { i++; continue; }
    // @app.cell or @app.cell(…), possibly over several lines.
    if (!/^@app\.cell\b/.test(lines[i])) return null;
    let decorator = lines[i++];
    while (depth(decorator) > 0 && i < end) decorator += '\n' + lines[i++];
    const dm = /^@app\.cell(?:\(([\s\S]*)\))?\s*$/.exec(decorator);
    if (!dm) return null;
    const config = (dm[1] || '').replace(/\s+/g, ' ').trim().replace(/,$/, '');
    // def NAME(ARGS):, possibly over several lines.
    if (i >= end || !/^(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/.test(lines[i])) return null;
    let signature = lines[i++];
    while ((depth(signature) > 0 || !/:\s*(#.*)?$/.test(signature)) && i < end) signature += '\n' + lines[i++];
    const sm = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*(?:->[^:]*)?:\s*(?:#.*)?$/.exec(signature);
    if (!sm) return null;
    // The body: indented (or blank) lines up to the next line at column 0.
    const body = [];
    while (i < end && !atColumnZero(lines[i])) body.push(lines[i++]);
    while (body.length && !body.at(-1).trim()) body.pop();
    const dedented = body.map(l => (!l.trim() ? '' : l.startsWith('    ') ? l.slice(4) : l.replace(/^[ \t]+/, '')));
    // The final return statement (its continuation lines are indented or close a bracket).
    let ret = -1;
    for (let k = dedented.length - 1; k >= 0; k--) {
      const l = dedented[k];
      if (!atColumnZero(l) || /^[)\]}]/.test(l)) continue;
      if (/^return\b/.test(l)) ret = k;
      break;
    }
    let returns = [];
    if (ret >= 0) {
      returns = names(dedented.slice(ret).join(' ').replace(/^return\b/, '').replace(/[()[\]]/g, ' '));
      dedented.length = ret;
    }
    while (dedented.length && !dedented.at(-1).trim()) dedented.pop();
    while (dedented.length && !dedented[0].trim()) dedented.shift();
    // marimo writes `async def` for cells that use top-level await.
    cells.push({ name: sm[1], code: dedented.join('\n'), config, args: names(sm[2]), returns, isAsync: /^async\s/.test(signature) });
  }
  return { header, cells, footer };
}

const returnLine = names => (!names.length ? 'return' : names.length === 1 ? `return (${names[0]},)` : `return (${names.join(', ')})`);
export function serialize({ header, cells, footer = DEFAULT_FOOTER }) {
  const parts = [header.replace(/\s+$/, '')];
  for (const c of cells) {
    const lines = [c.config ? `@app.cell(${c.config})` : '@app.cell', `${c.isAsync ? 'async ' : ''}def ${c.name || '_'}(${[...(c.args || [])].sort().join(', ')}):`];
    const code = (c.code || '').replace(/\s+$/, '');
    if (code) for (const l of code.split('\n')) lines.push(l.trim() ? `    ${l}` : '');
    lines.push(`    ${returnLine([...(c.returns || [])].sort())}`);
    parts.push(lines.join('\n'));
  }
  parts.push((footer || DEFAULT_FOOTER).replace(/\s*$/, '\n'));
  return parts.join('\n\n\n');
}

export function newNotebook() {
  return serialize({
    header: NEW_HEADER,
    cells: [{ name: '_', code: 'import marimo as mo\nimport flint', config: '', args: [], returns: ['flint', 'mo'] }],
    footer: DEFAULT_FOOTER,
  });
}

// ---------------------------------------------------------- Markdown cells --
// mo.md(r"""…""") (or """…""", f"""…""", '''…''') as the whole cell: shown and
// edited as Markdown. The prefix (r, f, rf, or none) and quote are kept so the
// string means the same thing when it's written back.
const MD = /^mo\.md\(\s*((?:[rR][fF]?|[fF][rR]?)?)("""|''')([\s\S]*)\2\s*,?\s*\)$/;
export function markdownParts(code) {
  const m = MD.exec(String(code).trim());
  if (!m || m[3].includes(m[2])) return null;
  let lines = m[3].split('\n');
  if (lines.length > 1 && !lines[0].trim()) lines = lines.slice(1);
  if (lines.length > 1 && !lines.at(-1).trim()) lines = lines.slice(0, -1);
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => /^ */.exec(l)[0].length), Infinity);
  const text = lines.map(l => (Number.isFinite(indent) ? l.slice(Math.min(indent, /^ */.exec(l)[0].length)) : l)).join('\n');
  return { text: text.replace(/\s+$/, ''), prefix: m[1], quote: m[2] };
}
export const markdownOf = code => markdownParts(code)?.text ?? null;

// The cell code for Markdown text, or null if no triple-quoted string can hold it.
// The closing quotes go on their own line, so only the quotes themselves can't appear.
export function markdownCell(text, prefix = 'r') {
  const body = String(text).replace(/\s+$/, '');
  const quote = ['"""', "'''"].find(q => !body.includes(q));
  if (!quote) return null;
  const lines = body ? body.split('\n').map(l => (l.trim() ? `    ${l}` : '')) : [];
  return `mo.md(${prefix}${quote}\n${lines.join('\n')}\n    ${quote})`;
}

// ------------------------------------------------------------- cell config --
// @app.cell(hide_code=True, …): read and set one flag, keeping the rest.
const splitConfig = config => (config ? config.split(/,(?![^()[\]{}]*[)\]}])/).map(s => s.trim()).filter(Boolean) : []);
export const configFlag = (config, key) => splitConfig(config).some(p => new RegExp(`^${key}\\s*=\\s*True$`).test(p));
export function setConfigFlag(config, key, on) {
  const rest = splitConfig(config).filter(p => !new RegExp(`^${key}\\s*=`).test(p));
  return (on ? [...rest, `${key}=True`] : rest).join(', ');
}
