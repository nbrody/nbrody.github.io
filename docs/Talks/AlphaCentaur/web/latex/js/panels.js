// Sidebar panels: the file outline and project-wide search.
import {h, icon, debounce} from './ui.js';
import {outlineOf} from './latex.js';

// Overleaf's "File outline": headings of the open file, current one marked.
export function outlinePanel({onJump, open, onToggle}) {
  const list = h('div', {class: 'outline-list', role: 'tree', 'aria-label': 'File outline'});
  const head = h('button', {type: 'button', class: 'panel-head', 'aria-expanded': String(open), onclick: () => { open = !open; onToggle(open); render(); }},
    icon(open ? 'down' : 'right', 13), h('span', {}, 'File outline'));
  const el = h('div', {class: 'outline-panel'}, head, list);
  let items = [], current = -1, line = 1;
  const currentIndex = () => items.reduce((at, item, i) => item.line <= line ? i : at, -1);
  function render() {
    head.setAttribute('aria-expanded', String(open));
    head.replaceChildren(icon(open ? 'down' : 'right', 13), h('span', {}, 'File outline'));
    list.hidden = !open;
    if (!open) return;
    if (!items.length) { list.replaceChildren(h('p', {class: 'outline-empty'}, 'No sections in this file.')); return; }
    const top = Math.min(...items.map(i => i.level));
    list.replaceChildren(...items.map((item, i) => h('button', {type: 'button', class: `outline-item ${i === current ? 'current' : ''}`, role: 'treeitem',
      style: {paddingLeft: `${12 + (item.level - top) * 13}px`}, title: `Line ${item.line}`, onclick: () => onJump(item.line)},
      h('span', {class: 'outline-title'}, item.title || `\\${item.command}`))));
    list.querySelector('.current')?.scrollIntoView({block: 'nearest'});
  }
  const recompute = debounce(text => { items = text === null ? [] : outlineOf(text); current = currentIndex(); render(); }, 250);
  return {
    el,
    // text: the open file's source (null when none); line: the cursor line.
    update(text, cursorLine) {
      line = cursorLine;
      if (text !== undefined) recompute(text);
      const next = currentIndex();
      if (next !== current) { current = next; render(); }
    },
  };
}

// Search every text file in the project (Overleaf's project search).
export function searchPanel({files, onOpen}) {
  const input = h('input', {type: 'search', class: 'search-input', placeholder: 'Search in project', 'aria-label': 'Search in project', spellcheck: 'false'});
  const opts = {caseSensitive: false, regexp: false, word: false};
  const toggle = (key, label, title) => h('button', {type: 'button', class: 'search-opt', title, 'aria-pressed': 'false',
    onclick: e => { opts[key] = !opts[key]; e.currentTarget.setAttribute('aria-pressed', String(opts[key])); run(); }}, label);
  const status = h('div', {class: 'search-status', role: 'status'});
  const results = h('div', {class: 'search-results'});
  const el = h('div', {class: 'search-panel'},
    h('div', {class: 'search-box'}, icon('search', 14), input),
    h('div', {class: 'search-opts'}, toggle('caseSensitive', 'Aa', 'Match case'), toggle('word', 'W', 'Whole word'), toggle('regexp', '.*', 'Regular expression')),
    status, results);
  async function run() {
    const q = input.value;
    if (!q) { status.textContent = ''; results.replaceChildren(); return; }
    let re;
    try {
      const body = opts.regexp ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(opts.word ? `\\b(?:${body})\\b` : body, opts.caseSensitive ? 'g' : 'gi');
    } catch { status.textContent = 'That regular expression is not valid.'; results.replaceChildren(); return; }
    const all = await files();
    let total = 0;
    const groups = [];
    for (const f of all) {
      const hits = [];
      const lines = f.text.split('\n');
      lines.forEach((line, i) => {
        if (total + hits.length >= 1000) return;
        for (const m of line.matchAll(re)) {
          if (!m[0].length) break;
          hits.push({line: i + 1, from: m.index, to: m.index + m[0].length, text: line});
          if (hits.length > 200) break;
        }
      });
      if (hits.length) { groups.push({f, hits}); total += hits.length; }
    }
    status.textContent = total ? `${total >= 1000 ? '1000+' : total} result${total === 1 ? '' : 's'} in ${groups.length} file${groups.length === 1 ? '' : 's'}` : 'No results.';
    results.replaceChildren(...groups.map(({f, hits}) => h('div', {class: 'search-group'},
      h('div', {class: 'search-file', title: f.path}, icon('fileText', 13), h('span', {}, f.label), h('span', {class: 'count'}, String(hits.length))),
      hits.map(hit => {
        const start = Math.max(0, hit.from - 30), lead = hit.text.slice(start, hit.from).trimStart();
        return h('button', {type: 'button', class: 'search-hit', onclick: () => onOpen(f.id, hit.line, {from: hit.from, to: hit.to})},
          h('span', {class: 'ln'}, String(hit.line)),
          h('span', {class: 'snip'}, start > 0 ? '…' : '', lead, h('mark', {}, hit.text.slice(hit.from, hit.to)), hit.text.slice(hit.to, hit.to + 60)));
      }))));
  }
  input.addEventListener('input', debounce(run, 220));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void run(); } });
  return {el, focus: () => { input.focus(); input.select(); }, run};
}
