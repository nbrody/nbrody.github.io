// What a cell shows: an Output {mime, data, elements?} from the kernel, drawn
// in the page. Markdown goes through alphaMarkdown's renderer (so math, macros
// and theorem blocks look as they do in notes); HTML runs in a sandboxed frame
// without access to this origin, since notebook code may come from the AI
// collaborator; widgets (mo.ui) are native controls that report back to the
// kernel and stay in step wherever the same element is shown.
import { renderTree } from '../../markdown/js/render.js';
import { toDom } from '../../markdown/js/hast.js';
import { libs, info, katex } from '../../markdown/js/libs.js';
import { katexOptions } from '../../markdown/js/syntax.js';

const h = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children.filter(c => c != null));
  return e;
};
const throttle = (fn, ms) => {
  let last = 0, timer = null, pending = null;
  return value => {
    pending = value;
    const now = Date.now(), wait = ms - (now - last);
    if (wait <= 0) { last = now; fn(value); return; }
    clearTimeout(timer);
    timer = setTimeout(() => { last = Date.now(); fn(pending); }, wait);
  };
};
const PLACEHOLDER = /ui:([^]*)/;
const CALLOUTS = new Set(['neutral', 'info', 'success', 'warn', 'danger']);

// sendUI(id, value): a widget changed. macros(): the KaTeX macros to use.
export function createOutputs({ sendUI, macros }) {
  const controls = new Map(); // element id → Set of {node, set(value)}
  const frames = new Map(); // token → iframe
  const onFrame = e => {
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.alphapyFrame !== 'string') return;
    const frame = frames.get(d.alphapyFrame);
    if (!frame || !frame.isConnected) { frames.delete(d.alphapyFrame); return; }
    if (e.source !== frame.contentWindow) return;
    frame.style.height = `${Math.max(24, Math.min(Number(d.height) || 0, 4000))}px`;
  };
  addEventListener('message', onFrame);

  // Every shown control for an element follows its latest value.
  function share(id, ctl, value) {
    let set = controls.get(id);
    if (!set) controls.set(id, (set = new Set()));
    for (const other of [...set]) {
      if (!other.node.isConnected) { set.delete(other); continue; }
      if (value !== undefined) other.set(value);
    }
    set.add(ctl);
  }
  function changed(id, ctl, value) {
    for (const other of controls.get(id) || []) if (other !== ctl && other.node.isConnected) other.set(value);
    sendUI(id, value);
  }

  // A label may hold Markdown and math; render it inline.
  function inline(text) {
    const span = h('span', { class: 'py-ui-label' });
    try {
      const frag = toDom(renderTree(libs, String(text), { macros: macros() }), info);
      const only = frag.children.length === 1 && frag.firstElementChild.tagName === 'P' ? frag.firstElementChild : null;
      span.append(...(only ? only.childNodes : frag.childNodes));
    } catch { span.textContent = String(text); }
    return span;
  }

  function widget(spec) {
    const id = String(spec.id), kind = spec.kind;
    const label = spec.label ? inline(spec.label) : null;
    let node, ctl;
    if (kind === 'slider') {
      const input = h('input', { type: 'range', min: spec.start ?? 0, max: spec.stop ?? 100, step: spec.step ?? 1 });
      const shown = h('span', { class: 'py-ui-value' });
      const set = v => { input.value = v; shown.textContent = String(v); };
      set(spec.value ?? spec.start ?? 0);
      const send = throttle(v => changed(id, ctl, v), 100);
      input.addEventListener('input', () => { shown.textContent = input.value; send(Number(input.value)); });
      node = h('label', { class: 'py-ui py-ui-slider' }, label, input, shown);
      ctl = { node, set };
    } else if (kind === 'number') {
      const input = h('input', { type: 'number', min: spec.start, max: spec.stop, step: spec.step ?? 'any' });
      input.value = spec.value ?? '';
      input.addEventListener('change', () => { const v = Number(input.value); if (input.value !== '' && Number.isFinite(v)) changed(id, ctl, v); });
      node = h('label', { class: 'py-ui py-ui-number' }, label, input);
      ctl = { node, set: v => { input.value = v; } };
    } else if (kind === 'checkbox' || kind === 'switch') {
      const input = h('input', { type: 'checkbox', role: kind === 'switch' ? 'switch' : null });
      input.checked = !!spec.value;
      input.addEventListener('change', () => changed(id, ctl, input.checked));
      node = h('label', { class: `py-ui py-ui-${kind}` }, input, label);
      ctl = { node, set: v => { input.checked = !!v; } };
    } else if (kind === 'dropdown') {
      const select = h('select', {}, ...(spec.options || []).map(o => h('option', { value: String(o) }, String(o))));
      if (spec.value == null) select.prepend(h('option', { value: '', disabled: true }, 'Choose…'));
      select.value = spec.value == null ? '' : String(spec.value);
      select.addEventListener('change', () => changed(id, ctl, select.value));
      node = h('label', { class: 'py-ui py-ui-dropdown' }, label, select);
      ctl = { node, set: v => { select.value = v == null ? '' : String(v); } };
    } else if (kind === 'text' || kind === 'text_area') {
      const input = kind === 'text' ? h('input', { type: 'text', placeholder: spec.placeholder || '' }) : h('textarea', { rows: 4, placeholder: spec.placeholder || '' });
      input.value = spec.value ?? '';
      input.addEventListener('change', () => changed(id, ctl, input.value));
      // ⌘/Ctrl+Enter sends a text area right away.
      if (kind === 'text_area') input.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); changed(id, ctl, input.value); } });
      node = h('label', { class: `py-ui py-ui-${kind}` }, label, input);
      ctl = { node, set: v => { if (document.activeElement !== input) input.value = v ?? ''; } };
    } else if (kind === 'button') {
      let count = Number(spec.value) || 0;
      const button = h('button', { type: 'button', class: 'py-ui py-ui-button' }, ...(label ? [label] : ['Click']));
      button.addEventListener('click', () => { count += 1; changed(id, ctl, count); });
      node = button;
      ctl = { node, set: v => { count = Number(v) || 0; } };
    } else {
      return h('span', { class: 'py-ui-unknown' }, `[${kind || 'widget'}]`);
    }
    share(id, ctl, spec.value);
    return node;
  }

  function markdown(text, elements) {
    const div = h('div', { class: 'prose py-md' });
    try {
      const frag = toDom(renderTree(libs, String(text), { macros: macros() }), info);
      for (const a of frag.querySelectorAll('a[href]')) {
        a.rel = 'noopener noreferrer';
        if (a.getAttribute('href').startsWith('http')) a.target = '_blank';
      }
      div.append(frag);
    } catch { div.textContent = String(text); }
    // Widgets placed in the text ({slider} in an f-string) arrive as placeholders.
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT), hits = [];
    while (walker.nextNode()) if (PLACEHOLDER.test(walker.currentNode.nodeValue)) hits.push(walker.currentNode);
    for (const node of hits) {
      const frag = document.createDocumentFragment();
      node.nodeValue.split(new RegExp(PLACEHOLDER.source)).forEach((part, i) => {
        if (i % 2) { const spec = elements?.[part]; if (spec) frag.append(widget(spec)); }
        else if (part) frag.append(part);
      });
      node.replaceWith(frag);
    }
    return div;
  }

  function html(markup) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const frame = h('iframe', { class: 'py-html', sandbox: 'allow-scripts', title: 'Cell output', referrerpolicy: 'no-referrer' });
    frames.set(token, frame);
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}body{font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2c4250;overflow:auto}table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #dfe6e9;padding:4px 8px;text-align:left}img{max-width:100%}</style>${markup}<script>(()=>{const post=()=>parent.postMessage({alphapyFrame:${JSON.stringify(token)},height:Math.ceil(document.documentElement.scrollHeight)},'*');new ResizeObserver(post).observe(document.documentElement);addEventListener('load',post);post();})()<\/script>`;
    return frame;
  }

  function latex(text) {
    const el = h('div', { class: 'py-latex' });
    const tex = String(text).trim()
      .replace(/^\$\$([\s\S]*)\$\$$/, '$1').replace(/^\\\[([\s\S]*)\\\]$/, '$1')
      .replace(/^\$([\s\S]*)\$$/, '$1').replace(/^\\\(([\s\S]*)\\\)$/, '$1');
    try { katex.render(tex, el, { ...katexOptions(macros()), displayMode: true }); } catch { el.textContent = text; }
    return el;
  }

  function render(output, elements = output?.elements) {
    if (!output) return document.createTextNode('');
    const { mime, data } = output;
    const els = { ...(elements || {}), ...(output.elements || {}) };
    switch (mime) {
      case 'text/plain': return h('pre', { class: 'py-text' }, String(data ?? ''));
      case 'text/markdown': {
        const el = markdown(data, els);
        // mo.callout(…, kind): the same Markdown in a tinted box.
        if (output.callout) el.classList.add('py-callout', `py-callout-${CALLOUTS.has(output.callout) ? output.callout : 'neutral'}`);
        return el;
      }
      case 'text/html': return html(String(data ?? ''));
      case 'image/png': return h('img', { class: 'py-image', alt: '', src: `data:image/png;base64,${data}` });
      case 'image/jpeg': return h('img', { class: 'py-image', alt: '', src: `data:image/jpeg;base64,${data}` });
      case 'image/svg+xml': {
        const text = String(data ?? '');
        const src = text.trimStart().startsWith('<') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` : `data:image/svg+xml;base64,${text}`;
        return h('img', { class: 'py-image', alt: '', src });
      }
      case 'text/latex': return latex(data);
      case 'application/vnd.alphapy.ui+json': return widget(data || {});
      case 'application/vnd.alphapy.stack+json': {
        const d = data || {};
        const box = h('div', { class: `py-stack py-stack-${d.direction === 'h' ? 'h' : 'v'}` });
        box.style.gap = `${typeof d.gap === 'number' ? d.gap : 0.5}rem`;
        if (d.align) box.style.alignItems = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch' }[d.align] || '';
        for (const item of d.items || []) box.append(render(item, els));
        return box;
      }
      default: return h('pre', { class: 'py-text' }, mime ? `[${mime} output]` : String(data ?? ''));
    }
  }

  return {
    render,
    destroy() { removeEventListener('message', onFrame); controls.clear(); frames.clear(); },
  };
}
