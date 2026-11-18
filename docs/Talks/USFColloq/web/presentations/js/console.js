// A Python console on a slide: code you can run, change and run again, and a
// >>> line for more, with the output underneath. It runs in a sandboxed frame,
// like an applet, and asks the page it is on to run its code
// (runtime/python.js answers: alphaCentaur's kernel, or Pyodide in the browser).

import { themeVars } from './themes.js';

export const CONSOLE_STARTER = `from flint import fmpz

n = fmpz(2)**64 + 1   # a Fermat number
n.factor()`;

const here = p => new URL(p, import.meta.url).href;
// KaTeX draws LaTeX results (sympy). The editor uses its own copy; an exported
// deck passes the CDN (or, presenting from the editor, these same files).
export const KATEX_LOCAL = { js: here('../vendor/katex/katex.min.js'), css: here('../vendor/katex/katex.min.css') };
export const KATEX_CDN = { js: 'https://cdn.jsdelivr.net/npm/katex@0.18.5/dist/katex.min.js', css: 'https://cdn.jsdelivr.net/npm/katex@0.18.5/dist/katex.min.css' };

const json = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');

export function consoleDoc(el, deck, { fonts = '', katex = KATEX_LOCAL } = {}) {
  const cfg = { code: el.code || '', name: el.name || 'Python', autorun: !!el.autorun, prompt: el.prompt !== false, katex };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${fonts}<style>:root{${themeVars(deck.theme)};--size:${Number(el.size) || 26}px}${CSS}</style></head>
<body class="look-${el.look === 'deck' ? 'deck' : 'terminal'}">${BODY}<script>(${consoleMain.toString()})(${json(cfg)});<\/script></body></html>`;
}

// A still picture of the console for slide thumbnails: no frame, no script.
export function consoleThumb(el) {
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lines = (el.code || '').split('\n').slice(0, 14).map(esc).join('\n');
  return `<div class="pz-console-thumb look-${el.look === 'deck' ? 'deck' : 'terminal'}" style="font-size:${Number(el.size) || 26}px"><div class="bar">${esc(el.name || 'Python')}</div><pre>${lines || '&gt;&gt;&gt;'}</pre></div>`;
}

const BODY = `<header>
<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
<span class="title"></span><span class="state off" role="status"><span class="label">Python</span></span><button class="where ghost" type="button" title="Where Python runs" aria-haspopup="menu" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="detail"></span>
<div class="menu" role="menu" hidden><button type="button" role="menuitemradio" data-use="browser">In this browser<small>Pyodide: works anywhere; the first run downloads Python.</small></button><button type="button" role="menuitemradio" data-use="local">On this computer<small>AlphaCentaur’s sandboxed Python, when it is running and allows this site. This browser remembers the choice.</small></button></div>
<span class="grow"></span>
<button class="run primary" type="button" title="Run the code (Shift+Enter)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>Run</button>
<button class="stop" type="button" title="Stop" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/></svg>Stop</button>
<button class="clear ghost" type="button" title="Clear the output">Clear</button>
<button class="restart ghost" type="button" title="Restart Python (forget every name)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5A8 8 0 1 1 17.7 6M20 4.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
</header>
<div class="code"><pre class="gutter" aria-hidden="true"></pre><div class="edit"><pre class="hl" aria-hidden="true"></pre><textarea class="src" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Python code"></textarea></div></div>
<div class="out" tabindex="-1"><div class="log"></div><div class="prompt"><span class="p">&gt;&gt;&gt;</span><textarea class="line" rows="1" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Python prompt"></textarea></div></div>`;

const CSS = `
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;height:100%}
body{display:flex;flex-direction:column;overflow:hidden;font:var(--size)/1.5 var(--pz-font-mono),ui-monospace,Menlo,monospace;background:var(--bg);color:var(--fg)}
body.look-terminal{--bg:#0e1320;--panel:#151b2b;--fg:#e7eaf1;--dim:#8d95aa;--line:#232b3e;--accent:var(--pz-accent);--err:#ff8b80;--s:#a5d6ff;--k:#ff9ad5;--n:#f4cd8e;--c:#6c7693;--f:#7fe3c6;--b:#b5bdff;--sel:rgba(130,150,255,.3)}
body.look-deck{--bg:var(--pz-surface);--panel:color-mix(in srgb,var(--pz-surface) 88%,var(--pz-text));--fg:var(--pz-text);--dim:var(--pz-muted);--line:color-mix(in srgb,var(--pz-surface) 80%,var(--pz-text));--accent:var(--pz-accent);--err:var(--pz-accent2);--s:color-mix(in srgb,var(--pz-accent2) 75%,var(--pz-text));--k:var(--pz-accent);--n:var(--pz-accent2);--c:var(--pz-muted);--f:color-mix(in srgb,var(--pz-accent) 60%,var(--pz-text));--b:color-mix(in srgb,var(--pz-accent) 40%,var(--pz-text));--sel:color-mix(in srgb,var(--pz-accent) 30%,transparent)}
header{position:relative;flex:none;display:flex;align-items:center;gap:.55em;padding:.42em .7em .42em .9em;background:var(--panel);font:600 .7em/1.2 var(--pz-font-body),system-ui,sans-serif;color:var(--dim);white-space:nowrap}
.look-deck .dots{display:none}
.dots i{display:inline-block;width:.8em;height:.8em;border-radius:50%;margin-right:.4em;background:#ff5f57}.dots i:nth-child(2){background:#febc2e}.dots i:nth-child(3){background:#28c840;margin-right:.2em}
.title{color:var(--fg)}
.state{display:inline-flex;align-items:center;gap:.45em;font-weight:500}
.state::before{content:'';width:.6em;height:.6em;border-radius:50%;background:var(--dim)}
.state.ready::before{background:#3fb950}.state.loading::before,.state.busy::before{background:#e3b341;animation:pulse 1s ease-in-out infinite}.state.dead::before{background:var(--err)}
.detail{font-weight:400;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
.grow{flex:1}
button{font:inherit;color:var(--fg);background:color-mix(in srgb,var(--fg) 10%,transparent);border:0;border-radius:999px;padding:.38em .95em;cursor:pointer;display:inline-flex;align-items:center;gap:.4em;transition:background .15s,transform .15s}
button:hover{background:color-mix(in srgb,var(--fg) 18%,transparent)}
button:active{transform:scale(.96)}
button.primary{background:var(--accent);color:var(--bg)}
button.primary:hover{background:color-mix(in srgb,var(--accent) 85%,var(--fg))}
button.ghost{background:transparent;color:var(--dim)}button.ghost:hover{color:var(--fg);background:color-mix(in srgb,var(--fg) 10%,transparent)}
button svg{width:1em;height:1em}
.restart{padding:.38em .55em}
.where{padding:.25em .3em;margin-left:-.35em}
.menu{position:absolute;top:calc(100% + .3em);left:.6em;z-index:9;display:flex;flex-direction:column;gap:.15em;width:min(26em,90vw);padding:.35em;border-radius:.7em;background:var(--panel);border:1px solid var(--line);box-shadow:0 .8em 2.4em rgba(0,0,0,.35);white-space:normal}
.menu button{display:block;text-align:left;border-radius:.45em;background:transparent;color:var(--fg);padding:.55em .8em;font-weight:600}
.menu button:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.menu button.on{background:color-mix(in srgb,var(--accent) 22%,transparent)}
.menu small{display:block;margin-top:.2em;color:var(--dim);font-weight:400;line-height:1.35}
.code{flex:none;display:flex;max-height:58%;overflow:auto;border-bottom:1px solid var(--line)}
.no-code .code,.no-code .run,.no-code .clear{display:none}
.gutter{flex:none;margin:0;padding:.55em .7em .55em .6em;min-width:2.6em;text-align:right;color:var(--c);font:inherit;user-select:none;opacity:.75}
.edit{display:grid;flex:1;min-width:0}
.edit>*{grid-area:1/1;margin:0;padding:.55em .9em .55em .2em;font:inherit;white-space:pre;tab-size:4;border:0;min-width:100%;width:max-content}
.hl{pointer-events:none;color:var(--fg)}
.src{background:transparent;color:transparent;caret-color:var(--fg);resize:none;outline:none;overflow:hidden;height:100%}
.src::selection{background:var(--sel);color:transparent}
.k{color:var(--k)}.s{color:var(--s)}.n{color:var(--n)}.c{color:var(--c);font-style:italic}.f{color:var(--f)}.b{color:var(--b)}.d{color:var(--n)}
.out{flex:1;min-height:0;overflow:auto;padding:.45em .9em .9em;outline:none}
.log>*{margin:.1em 0}
.echo{margin:0;font:inherit;white-space:pre-wrap;color:var(--fg)}
.p{color:var(--accent);user-select:none}
.stream{margin:0;font:inherit;white-space:pre-wrap;word-break:break-word}
.stderr{color:var(--err)}
.res>pre,.res .plain{margin:0;font:inherit;white-space:pre-wrap;word-break:break-word}
.res img{display:block;max-width:100%;max-height:70vh;border-radius:.3em;background:#fff;margin:.25em 0}
.res .tex{padding:.15em 0;font-size:1.08em}
.res table{border-collapse:collapse;font-size:.8em}.res td,.res th{border:1px solid var(--line);padding:.15em .5em}
.res .md p{margin:.25em 0;font-family:var(--pz-font-body),system-ui,sans-serif}
.stack{display:flex;gap:.5em}.stack.v{flex-direction:column}
.err{margin:0;font:inherit;font-size:.82em;white-space:pre-wrap;color:var(--err)}
.err b{font-weight:700}
.note{color:var(--dim);font-style:italic;font-family:var(--pz-font-body),system-ui,sans-serif;font-size:.8em}
.prompt{display:flex;gap:.6em;align-items:flex-start;margin-top:.15em}
.no-prompt .prompt{display:none}
.line{flex:1;min-width:0;background:transparent;border:0;outline:none;resize:none;color:var(--fg);font:inherit;padding:0;overflow:hidden;white-space:pre}
::selection{background:var(--sel)}
@keyframes pulse{50%{opacity:.3}}
`;

// The console's script. It is sent as text into the frame (consoleMain.toString()),
// so it must not use anything from this module.
function consoleMain(cfg) {
  var $ = function (s) { return document.querySelector(s); };
  var src = $('.src'), hl = $('.hl'), gutter = $('.gutter'), log = $('.log'), out = $('.out'), line = $('.line');
  var state = $('.state'), label = $('.state .label'), detail = $('.detail');
  var runBtn = $('.run'), stopBtn = $('.stop');
  // The default title is the language, which the status already says.
  if (cfg.name && cfg.name !== 'Python') $('.title').textContent = cfg.name; else $('.title').hidden = true;
  if (!cfg.code.trim()) document.body.classList.add('no-code');
  if (!cfg.prompt) document.body.classList.add('no-prompt');
  var ask = function (msg) { msg.type = 'pz-py'; parent.postMessage(msg, '*'); };

  // ── highlighting ──
  var KW = {}, BI = {};
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' ').forEach(function (k) { KW[k] = 1; });
  'print len range list dict set tuple int float str bool sum min max abs map filter zip enumerate sorted reversed isinstance type round pow divmod any all iter next super object repr format input open'.split(' ').forEach(function (k) { BI[k] = 1; });
  var TOK = /(#[^\n]*)|((?:[rRbBuUfF]{1,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))|(\b(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?[jJ]?)\b)|(@[\w.]+)|([A-Za-z_]\w*)/g;
  var esc = function (s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
  function highlight(code) {
    var html = '', last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(code))) {
      var t = m[0], cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] ? 'd' : KW[t] ? 'k' : /\b(?:def|class)\s+$/.test(code.slice(Math.max(0, m.index - 12), m.index)) ? 'f' : BI[t] ? 'b' : '';
      html += esc(code.slice(last, m.index)) + (cls ? '<span class="' + cls + '">' + esc(t) + '</span>' : esc(t));
      last = m.index + t.length;
    }
    return html + esc(code.slice(last));
  }
  function paint() {
    hl.innerHTML = highlight(src.value) + '\n';
    var n = src.value.split('\n').length, g = [];
    for (var i = 1; i <= n; i++) g.push(i);
    gutter.textContent = g.join('\n');
  }
  src.value = cfg.code;
  paint();
  src.addEventListener('input', paint);

  // ── typing ──
  function insert(el, text) {
    el.focus();
    if (!document.execCommand('insertText', false, text)) {
      var a = el.selectionStart, b = el.selectionEnd;
      el.value = el.value.slice(0, a) + text + el.value.slice(b);
      el.selectionStart = el.selectionEnd = a + text.length;
      el.dispatchEvent(new Event('input'));
    }
  }
  function indentAfter(el) {
    var before = el.value.slice(0, el.selectionStart), cur = before.slice(before.lastIndexOf('\n') + 1);
    var ind = /^\s*/.exec(cur)[0];
    return '\n' + ind + (/:\s*(#.*)?$/.test(cur) ? '    ' : '');
  }
  src.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) { e.preventDefault(); runBlock(); }
    else if (e.key === 'Enter') { e.preventDefault(); insert(src, indentAfter(src)); }
    else if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insert(src, '    '); }
    else if (e.key === 'Escape') { e.preventDefault(); src.blur(); }
  });
  var history = [], hpos = 0, draft = '';
  function fitLine() { line.style.height = 'auto'; line.style.height = line.scrollHeight + 'px'; }
  line.addEventListener('input', fitLine);
  // Enter runs a complete line; inside a block or open brackets it continues, as in Python's own prompt.
  function unfinished(text) {
    var lines = text.split('\n'), last = lines[lines.length - 1], depth = 0;
    text.replace(/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[()[\]{}]/g, function (t) { if ('([{'.indexOf(t) >= 0) depth++; else if (')]}'.indexOf(t) >= 0) depth--; return t; });
    return depth > 0 || /:\s*(#.*)?$/.test(last) || /\\$/.test(last) || (lines.length > 1 && last.trim() !== '');
  }
  line.addEventListener('keydown', function (e) {
    var v = line.value;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (unfinished(v)) { insert(line, indentAfter(line)); return; }
      if (!v.trim()) return;
      history.push(v.replace(/\n+$/, '')); hpos = history.length; draft = '';
      line.value = ''; fitLine();
      run(v.replace(/\n+$/, ''), true);
    } else if (e.key === 'Enter') { e.preventDefault(); insert(line, indentAfter(line)); }
    else if (e.key === 'Tab') { e.preventDefault(); insert(line, '    '); }
    else if (e.key === 'ArrowUp' && v.lastIndexOf('\n', line.selectionStart - 1) < 0 && hpos > 0) {
      e.preventDefault(); if (hpos === history.length) draft = v; line.value = history[--hpos]; fitLine();
    } else if (e.key === 'ArrowDown' && v.indexOf('\n', line.selectionStart) < 0 && hpos < history.length) {
      e.preventDefault(); hpos++; line.value = hpos === history.length ? draft : history[hpos]; fitLine();
    } else if (e.key === 'Escape') { e.preventDefault(); line.blur(); }
    else if (e.key === 'c' && e.ctrlKey && running.size) { e.preventDefault(); ask({ op: 'interrupt' }); }
  });
  // A click in the output area (not a text selection) goes to the prompt.
  out.addEventListener('mouseup', function (e) {
    if (cfg.prompt && !String(getSelection()) && !e.target.closest('button,a,textarea')) line.focus({ preventScroll: true });
  });
  // Keys the console doesn't use still move the slides, as in an applet.
  addEventListener('keydown', function (e) {
    if (e.defaultPrevented || (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]'))) return;
    var d = { ArrowRight: 'next', PageDown: 'next', ' ': 'next', ArrowLeft: 'prev', PageUp: 'prev', Escape: 'exit' }[e.key];
    if (d) { e.preventDefault(); parent.postMessage({ type: 'iframeNav', direction: d }, '*'); }
  });

  // ── running ──
  var seq = 0, running = {}, autoran = false;
  running.size = 0;
  var tail = function () { out.scrollTop = out.scrollHeight; };
  function add(el) { log.appendChild(el); tail(); return el; }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function note(text, to) { (to || log).appendChild(node('div', 'note', text)); tail(); }
  function busy() {
    var on = running.size > 0;
    runBtn.hidden = on; stopBtn.hidden = !on;
  }
  function run(code, echo) {
    if (!code.trim()) return;
    var rid = 'r' + Math.random().toString(36).slice(2, 9) + '-' + (++seq);
    var entry = add(node('div', 'entry'));
    if (echo) {
      var pre = node('pre', 'echo');
      pre.innerHTML = code.split('\n').map(function (l, i) { return '<span class="p">' + (i ? '...' : '&gt;&gt;&gt;') + '</span> ' + highlight(l); }).join('\n');
      entry.appendChild(pre);
    }
    running[rid] = { entry: entry, stream: null, kind: '' }; running.size++;
    busy();
    ask({ op: 'run', rid: rid, code: code });
  }
  function runBlock() {
    if (!src.value.trim()) return;
    log.textContent = '';
    run(src.value, false);
  }
  runBtn.addEventListener('click', runBlock);
  // Where Python runs, when the page offers a choice (a deck on the web).
  var whereBtn = $('.where'), menu = $('.menu');
  whereBtn.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-use]');
    if (!b) return;
    menu.hidden = true;
    if (b.classList.contains('on')) return;
    log.textContent = '';
    ask({ op: 'backend', use: b.dataset.use });
  });
  addEventListener('click', function (e) { if (!menu.hidden && !e.target.closest('.menu')) menu.hidden = true; });
  stopBtn.addEventListener('click', function () { ask({ op: 'interrupt' }); });
  $('.clear').addEventListener('click', function () { log.textContent = ''; });
  $('.restart').addEventListener('click', function () { log.textContent = ''; ask({ op: 'restart' }); });

  function onMsg(rid, m) {
    var r = running[rid];
    if (!r) return;
    if (m.type === 'console') {
      var kind = m.stream === 'stderr' ? 'stderr' : 'stdout';
      if (!r.stream || r.kind !== kind || r.stream !== r.entry.lastChild) { r.stream = r.entry.appendChild(node('pre', 'stream ' + kind)); r.kind = kind; }
      r.stream.textContent += m.text;
    } else if (m.type === 'cell' && m.status !== 'running') {
      if (m.output) r.entry.appendChild(output(m.output));
      if (m.error) {
        var e = node('pre', 'err');
        var tb = String(m.error.traceback || '').trim();
        if (tb) e.textContent = tb; else { e.appendChild(node('b', null, m.error.name)); e.appendChild(document.createTextNode(m.error.message ? ': ' + m.error.message : '')); }
        r.entry.appendChild(e);
      } else if (m.status === 'interrupted') note('Interrupted.', r.entry);
      delete running[rid]; running.size--;
      busy();
    }
    tail();
  }

  // ── output ──
  var katexWaiting = null;
  function withKatex(fn) {
    if (window.katex) return fn();
    if (!katexWaiting) {
      katexWaiting = [];
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = cfg.katex.css; document.head.appendChild(css);
      var s = document.createElement('script'); s.src = cfg.katex.js;
      s.onload = function () { katexWaiting.splice(0).forEach(function (f) { f(); }); };
      s.onerror = function () { var w = katexWaiting; katexWaiting = []; w.forEach(function (f) { f(); }); };
      document.head.appendChild(s);
    }
    katexWaiting.push(fn);
  }
  function tex(el, source, display) {
    el.textContent = source;
    withKatex(function () {
      if (!window.katex) return;
      try { window.katex.render(source, el, { displayMode: display, throwOnError: false }); } catch (e) { el.textContent = source; }
    });
  }
  // Markdown (mo.md and _repr_markdown_): paragraphs, emphasis, code and $…$ math.
  function markdown(text) {
    var box = node('div', 'md');
    text.split(/\n{2,}/).forEach(function (para) {
      var p = node('p');
      var parts = para.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/);
      parts.forEach(function (part) {
        if (/^\$\$[\s\S]+\$\$$/.test(part)) { var d = node('div'); tex(d, part.slice(2, -2), true); p.appendChild(d); }
        else if (/^\$[^$]+\$$/.test(part)) { var s = node('span'); tex(s, part.slice(1, -1), false); p.appendChild(s); }
        else {
          var span = node('span');
          span.innerHTML = esc(part).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>').replace(/^#{1,6}\s*/gm, '').replace(/\n/g, '<br>');
          p.appendChild(span);
        }
      });
      box.appendChild(p);
    });
    return box;
  }
  // HTML results (a pandas table) show inline, with anything that could run removed.
  function html(text) {
    var tpl = document.createElement('template');
    tpl.innerHTML = text;
    tpl.content.querySelectorAll('script,iframe,object,embed,link,meta,style,form').forEach(function (n) { n.remove(); });
    tpl.content.querySelectorAll('*').forEach(function (n) {
      for (var i = n.attributes.length - 1; i >= 0; i--) if (/^on/i.test(n.attributes[i].name) || /javascript:/i.test(n.attributes[i].value)) n.removeAttribute(n.attributes[i].name);
    });
    var d = node('div'); d.appendChild(tpl.content); return d;
  }
  function output(o) {
    var box = node('div', 'res'), data = o.data;
    switch (o.mime) {
      case 'text/plain': box.appendChild(node('pre', 'plain', String(data))); break;
      case 'image/png': { var img = node('img'); img.src = 'data:image/png;base64,' + data; img.alt = 'A figure'; box.appendChild(img); break; }
      case 'image/svg+xml': { var svg = node('img'); svg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(data)); svg.alt = 'A figure'; box.appendChild(svg); break; }
      case 'text/latex': {
        var t = String(data).trim().replace(/^\$\$?|\$\$?$/g, '').replace(/^\\\[|\\\]$/g, '').replace(/^\\displaystyle\s*/, '');
        var el = node('div', 'tex'); tex(el, t, true); box.appendChild(el); break;
      }
      case 'text/markdown': box.appendChild(markdown(String(data))); break;
      case 'text/html': box.appendChild(html(String(data))); break;
      case 'application/vnd.alphapy.stack+json': {
        var st = node('div', 'stack' + (data.direction === 'v' ? ' v' : ''));
        (data.items || []).forEach(function (it) { st.appendChild(output(it)); });
        box.appendChild(st); break;
      }
      default: box.appendChild(node('pre', 'plain', typeof data === 'string' ? data : '(' + o.mime + ')'));
    }
    return box;
  }

  // ── the page's answers ──
  addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var d = e.data || {};
    if (d.type === 'pz-visible') {
      if (cfg.autorun && !autoran && src.value.trim()) { autoran = true; runBlock(); }
      return;
    }
    // The phone remote's buttons (js/remote-model.js CONSOLE_BUTTONS).
    if (d.type === 'pz-button') {
      if (d.name === 'console-run' && !running.size) runBlock();
      else if (d.name === 'console-stop' && running.size) ask({ op: 'interrupt' });
      return;
    }
    if (d.type !== 'pz-py') return;
    if (d.ev === 'note') { note(String(d.text || '')); return; }
    if (d.ev === 'status') {
      whereBtn.hidden = !d.choice;
      if (d.choice) menu.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.use === d.choice.using); b.setAttribute('aria-checked', String(b.dataset.use === d.choice.using)); });
      state.className = 'state ' + (d.state || 'off');
      label.textContent = d.label || 'Python';
      detail.textContent = d.state === 'loading' || d.state === 'dead' ? (d.detail || '') : '';
      detail.title = d.detail || '';
      if (d.state === 'dead' && d.detail) note(d.detail);
    } else if (d.ev === 'msg' && d.rid) onMsg(d.rid, d.msg || {});
  });
  ask({ op: 'hello' });
}
