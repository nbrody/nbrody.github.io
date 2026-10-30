// Turns a TeX/latexmk transcript into a list of problems:
//   {level: 'error' | 'warning' | 'badbox', message, file, line, detail}
// `file` is the path as TeX printed it (./main.tex, /abs/path, …) or null.
//
// TeX reports the file it is reading only by parentheses: "(./main.tex"
// opens a file and a later ")" closes it. Logs read best when unwrapped
// (max_print_line=10000), but wrapped logs still work line by line.

const FILE_OPEN = /^\((?:"([^"]+)"|((?:\.{1,2}\/|\/|~\/)[^\s()]*|[^\s()]+\.(?:tex|ltx|sty|cls|cfg|def|clo|fd|bbl|aux|toc|out|lof|lot|nav|snm|ind|tikz|dtx|lco|bib)))/i;
// A line that starts a new message ends the context of the previous one.
const NEXT_MESSAGE = /^(?:! |(?:Package \S+|Class \S+|LaTeX|LaTeX Font|pdfTeX) Warning: |(?:Over|Under)full \\[hv]box|Warning--|(?:\.{1,2}\/|\/)?[^:\s]*\.[A-Za-z]{1,5}:\d+: )/;
const FILE_LINE_ERROR = /^((?:\.{1,2}\/|\/)?[^:\n]*?\.[A-Za-z]{1,5}):(\d+): (.*)$/;

// Only the last engine run matters: latexmk reruns until references settle,
// and earlier runs repeat warnings that the last run fixed.
// Keeps latexmk's BibTeX output from earlier in the transcript.
function lastRun(text) {
  const banners = [...text.matchAll(/^This is (?:pdf|e-|Xe|LuaHB|Lua)?TeX, Version/gm)];
  if (banners.length < 2) return text;
  const start = banners[banners.length - 1].index;
  const bibtex = text.slice(0, start).split('\n').filter(l => /^(?:Warning--|I couldn't open|I found no|Repeated entry)/.test(l));
  return [...bibtex, text.slice(start)].join('\n');
}

export function parseLog(text = '') {
  const lines = lastRun(String(text)).replace(/\r\n?/g, '\n').split('\n');
  const stack = [], problems = [], seen = new Set();
  const current = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i]; return null; };
  const add = p => {
    const key = `${p.level}|${p.file}|${p.line}|${p.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push(p);
  };
  // Following context lines, up to a blank line.
  const context = (i, limit = 8) => {
    const out = [];
    for (let j = i + 1; j < lines.length && out.length < limit && lines[j].trim() && !NEXT_MESSAGE.test(lines[j]); j++) out.push(lines[j]);
    return out;
  };
  const trackParens = line => {
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === '(') {
        const m = FILE_OPEN.exec(line.slice(k));
        if (m) { stack.push(m[1] || m[2]); k += m[0].length - 1; }
        else stack.push(null);
      } else if (c === ')') stack.pop();
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = FILE_LINE_ERROR.exec(line)) && !/^(?:Package|LaTeX|Class)\b/.test(line)) {
      const more = context(i);
      add({level: 'error', message: m[3].trim(), file: m[1], line: Number(m[2]), detail: more.join('\n')});
      i += more.length;
      continue;
    }
    if (line.startsWith('! ')) {
      const more = context(i);
      const at = more.map(l => /^l\.(\d+)/.exec(l)).find(Boolean);
      add({level: 'error', message: line.slice(2).trim(), file: current(), line: at ? Number(at[1]) : null, detail: more.join('\n')});
      i += more.length;
      continue;
    }
    if ((m = /^(LaTeX|Package (\S+)|Class (\S+)|pdfTeX|LaTeX Font)(?: Font)? Warning: (.*)$/.exec(line))) {
      const origin = m[2] || m[3];
      let message = m[4];
      // Continuation lines are indented under "(package)".
      for (let j = i + 1; j < lines.length; j++) {
        const cont = origin ? new RegExp(`^\\(${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s+(.*)$`).exec(lines[j]) : /^\s{4,}(\S.*)$/.exec(lines[j]);
        if (!cont) break;
        message += ' ' + cont[1];
        i = j;
      }
      if (/^LaTeX Font/.test(m[1])) continue; // font substitutions are noise
      const at = /on input line (\d+)/.exec(message);
      add({level: 'warning', message: message.replace(/\s+/g, ' ').trim(), file: current(), line: at ? Number(at[1]) : null, detail: origin ? `Package ${origin}` : ''});
      trackParens(line.slice(line.indexOf('Warning:')));
      continue;
    }
    if ((m = /^(Over|Under)full \\[hv]box \((.*?)\)(.*)$/.exec(line))) {
      const at = /lines? (\d+)/.exec(m[3]);
      add({level: 'badbox', message: `${m[1]}full box (${m[2]})${m[3].replace(/ has occurred while \\output is active/, ' in output')}`.trim(),
        file: current(), line: at ? Number(at[1]) : null, detail: ''});
      continue;
    }
    // BibTeX, as relayed by latexmk.
    if ((m = /^Warning--(.*)$/.exec(line))) {
      add({level: 'warning', message: `BibTeX: ${m[1]}`, file: null, line: null, detail: ''});
      continue;
    }
    if ((m = /^(I couldn't open (?:database|style) file .*|I found no .*|Repeated entry.*)$/.exec(line))) {
      add({level: 'error', message: `BibTeX: ${m[1]}`, file: null, line: null, detail: context(i, 3).join('\n')});
      continue;
    }
    trackParens(line);
  }
  const rank = {error: 0, warning: 1, badbox: 2};
  return problems.map((p, n) => ({...p, n})).sort((a, b) => rank[a.level] - rank[b.level] || a.n - b.n).map(({n, ...p}) => p);
}

// Matches a path as printed by TeX to one of the project's files.
export function matchFile(printed, files, base = '') {
  if (!printed) return null;
  const clean = printed.replace(/^"|"$/g, '').replace(/\/\.\//g, '/').replace(/^\.\//, '');
  const candidates = [clean, base ? `${base}/${clean}` : null].filter(Boolean);
  for (const c of candidates) { const f = files.find(f => f.path === c); if (f) return f; }
  // Absolute or build-folder paths: the longest project path that ends it.
  const ends = files.filter(f => clean === f.path || clean.endsWith('/' + f.path)).sort((a, b) => b.path.length - a.path.length);
  return ends[0] || null;
}
