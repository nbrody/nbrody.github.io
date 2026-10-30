// alphaNote: inside alphaCentaur (index.html?host=alphacentaur) it edits one
// notebook the Handwriting section hands it; on its own (ink/server.mjs) the
// standalone shell lists the folder's <name>.ink.json notebooks.
import { HOST, onHost, toHost } from './host.js';
import { createNotebook } from './notebook.js';
import { icon } from '../vendor/icons.js';

const SUFFIX = /\.ink\.json$/i;
const blank = () => JSON.stringify({ version: 1, pages: [{ id: crypto.randomUUID(), background: 'grid', strokes: [] }], current: 0 });
const app = document.getElementById('app');

if (HOST) {
  // The notebook is made on the first load, so nothing can be drawn on a
  // placeholder page before alphaCentaur's copy arrives.
  let notebook = null, last = null;
  onHost('load', d => {
    const content = typeof d.content === 'string' ? d.content : '';
    const readOnly = typeof d.readOnly === 'boolean' ? d.readOnly : undefined;
    if (notebook && content === last) { if (readOnly !== undefined) notebook.setReadOnly(readOnly); return; }
    last = content;
    notebook ??= createNotebook(app, {
      icon,
      readOnly: !!readOnly,
      onChange: next => { last = next; toHost('change', { content: next }); },
      onRecognized: text => toHost('recognized', { text }),
    });
    notebook.load(content, { readOnly });
  });
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); toHost('save'); }
  });
  toHost('ready');
} else {
  try {
    const { startShell } = await import('../../standalone/shell.js');
    startShell({
      name: 'alphaNote',
      noun: 'notebook',
      suffix: '.ink.json',
      matches: path => SUFFIX.test(path),
      template: blank,
      icon,
      mount(container, ctx) {
        const notebook = createNotebook(container, {
          icon,
          onChange: ctx.onChange,
          // Recognized text becomes a Markdown note beside the notebook, named
          // as alphaCentaur names it ("Transcription — <notebook>").
          onRecognized: async text => {
            try {
              await ctx.save();
              const dir = ctx.path.includes('/') ? ctx.path.slice(0, ctx.path.lastIndexOf('/') + 1) : '';
              const base = `Transcription — ${ctx.path.split('/').pop().replace(SUFFIX, '')}`;
              const taken = new Set(ctx.files().map(f => f.path));
              let path = `${dir}${base}.md`;
              for (let n = 2; taken.has(path); n++) path = `${dir}${base} ${n}.md`;
              const created = await ctx.create(path, text);
              ctx.notify(`Saved the recognized text as ${created || path}.`);
            } catch (e) {
              ctx.notify(e.message);
            }
          },
        });
        notebook.load(ctx.content);
        return { destroy: () => notebook.destroy() };
      },
    });
  } catch (e) {
    app.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'ink-offline',
      textContent: `alphaNote needs its own server to open a folder: node ink/server.mjs <folder> --open (${e.message})`,
    }));
  }
}
