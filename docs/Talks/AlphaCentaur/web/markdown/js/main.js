// alphaMarkdown's entry point. Inside alphaCentaur (?host=alphacentaur) it
// edits the one note the host sends (js/host.js); on its own it runs in the
// standalone folder shell that markdown/server.mjs serves.
import { HOST, onHost, toHost } from './host.js';
import { createNoteEditor } from './editor.js';
import { projectMacros } from './syntax.js';
import { katex } from './libs.js';
import { icon } from '../vendor/icons.js';
import { relativePath } from './paths.js';

const NOTE = /\.(md|markdown)$/i;
const app = document.getElementById('app');


if (HOST) {
  const editor = createNoteEditor(app, {
    icon,
    macrosHint: 'Edit shared macros under Manuscript → Project macros.',
    onChange: content => toHost('change', { content }),
    onLink: name => toHost('link', { name }),
    // With the note's height, so the host grows the frame before scrolling to the cursor.
    onCaret: rect => { if (bare) { reported = Math.ceil(app.getBoundingClientRect().height); toHost('caret', { ...rect, height: reported }); } },
  });
  // Bare (the Overview's description.md): the host sizes the frame to the note
  // and scrolls the page, so report the note's height and the cursor.
  let bare = false, reported = 0;
  new ResizeObserver(() => {
    if (!bare) return;
    const height = Math.ceil(app.getBoundingClientRect().height);
    if (height !== reported) { reported = height; toHost('size', { height }); }
  }).observe(app);
  // The project's macros.tex, parsed once per change.
  let macrosSource = null, macros = {};
  onHost('load', d => {
    const path = String(d.path || ''), files = String(d.files || '');
    const source = typeof d.macrosSource === 'string' ? d.macrosSource : '';
    if (source !== macrosSource) { macrosSource = source; macros = projectMacros(source, katex).macros; }
    if (!!d.bare !== bare) { bare = !!d.bare; reported = 0; document.documentElement.toggleAttribute('data-bare', bare); }
    editor.load(String(d.content ?? ''), {
      bare,
      docKey: String(d.docKey || ''),
      macros,
      readOnly: !!d.readOnly,
      resolveURL: url => { const p = relativePath(path, url); return p === null ? url : files + p.split('/').map(encodeURIComponent).join('/'); },
    });
  });
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); toHost('save'); }
  });
  toHost('ready');
} else {
  standalone();
}

async function standalone() {
  let startShell;
  try { ({ startShell } = await import('../../standalone/shell.js')); }
  catch {
    app.innerHTML = '<div class="applet-offline"><h1>alphaMarkdown</h1><p>Open a folder of notes with alphaMarkdown\'s own server:</p><pre>node markdown/server.mjs &lt;folder&gt; --open</pre></div>';
    return;
  }
  // Shared macros: macros.tex at the top of the folder, read again when it changes.
  let macros = {}, macrosRevision = null;
  const readMacros = async files => {
    const rev = files.find(f => f.path === 'macros.tex')?.revision || null;
    if (rev === macrosRevision) return false;
    macrosRevision = rev;
    try { macros = rev ? projectMacros((await (await fetch('api/file?path=macros.tex')).json()).content || '', katex).macros : {}; }
    catch { macros = {}; }
    return true;
  };
  startShell({
    name: 'alphaMarkdown',
    noun: 'note',
    suffix: '.md',
    matches: p => NOTE.test(p),
    template: () => '',
    icon,
    mount(container, ctx) {
      const notes = () => ctx.files().filter(f => NOTE.test(f.path));
      const editor = createNoteEditor(container, {
        icon,
        macrosHint: 'Shared macros go in macros.tex at the top of this folder, one \\newcommand per line; alphaTeX can use the same file.',
        onChange: ctx.onChange,
        // [[Name]] is a note's path without .md, or (as in Obsidian) its file name.
        onLink: name => {
          const bare = p => p.replace(NOTE, '');
          const target = notes().find(f => bare(f.path) === name) || notes().find(f => bare(f.path).split('/').pop() === name);
          if (target) ctx.open(target.path);
          else ctx.notify(`No note named ${name} in this folder.`);
        },
      });
      const context = () => ({
        docKey: `alphaMarkdown:${ctx.folder.root}:${ctx.path}`,
        macros,
        resolveURL: url => { const p = relativePath(ctx.path, url); return p === null ? url : `api/raw?path=${encodeURIComponent(p)}`; },
      });
      editor.load(ctx.content, context());
      readMacros(ctx.files()).then(changed => { if (changed) editor.setContext(context()); });
      return {
        filesChanged: files => { readMacros(files).then(changed => { if (changed) editor.setContext(context()); }); },
        destroy: () => editor.destroy(),
      };
    },
  });
}
