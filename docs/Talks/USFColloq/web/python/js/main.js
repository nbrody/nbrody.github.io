// alphaPy's entry point. Inside alphaCentaur (?host=alphacentaur) it edits the
// one notebook the host sends (js/host.js); on its own it runs in the
// standalone folder shell that python/server.mjs serves.
import { HOST, onHost, toHost } from './host.js';
import { createNotebook } from './notebook.js';
import { newNotebook } from './format.js';
import { icon } from '../vendor/icons.js';

const app = document.getElementById('app');

if (HOST) {
  const notebook = createNotebook(app, { icon, onChange: content => toHost('change', { content }) });
  onHost('load', d => notebook.load(String(d.content ?? ''), {
    kernel: d.kernel && typeof d.kernel === 'object' ? d.kernel : null,
    macrosSource: typeof d.macrosSource === 'string' ? d.macrosSource : '',
    readOnly: !!d.readOnly,
    docKey: String(d.docKey || ''),
  }));
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); toHost('save'); }
  });
  toHost('ready');
} else {
  standalone();
}

async function example() {
  const res = await fetch(new URL('../examples/prime_quaternions.py', import.meta.url));
  if (!res.ok) throw new Error("The example notebook didn't load.");
  return res.text();
}

async function standalone() {
  let startShell;
  try { ({ startShell } = await import('../../standalone/shell.js')); }
  catch {
    app.innerHTML = '<div class="applet-offline"><h1>alphaPy</h1><p>Open a folder of notebooks with alphaPy\'s own server:</p><pre>node python/server.mjs &lt;folder&gt; --open</pre></div>';
    return;
  }
  // Shared macros: macros.tex at the top of the folder, read again when it changes.
  let macrosSource = '', macrosRevision = null;
  const readMacros = async files => {
    const rev = files.find(f => f.path === 'macros.tex')?.revision || null;
    if (rev === macrosRevision) return false;
    macrosRevision = rev;
    try { macrosSource = rev ? (await (await fetch('api/file?path=macros.tex')).json()).content || '' : ''; }
    catch { macrosSource = ''; }
    return true;
  };
  startShell({
    name: 'alphaPy',
    noun: 'notebook',
    suffix: '.py',
    matches: p => /\.py$/i.test(p),
    // A new notebook starts as the example (examples/prime_quaternions.py) or blank.
    templates: [
      { label: 'Example notebook: prime quaternions', name: 'prime_quaternions', content: example },
      { label: 'Blank notebook', content: newNotebook },
    ],
    icon,
    mount(container, ctx) {
      const notebook = createNotebook(container, { icon, onChange: ctx.onChange });
      const kernel = { start: 'api/kernel/start', base: 'api/kernel/', headers: { 'x-alpha-applet': '1' }, body: { path: ctx.path } };
      // The web demo has no Python to run: globalThis.alphaPyStatic shows the notebook read-only,
      // Markdown rendered and code displayed (scripts/build-web-demo.mjs sets it).
      const mode = globalThis.alphaPyStatic ? { kernel: null, readOnly: true } : { kernel };
      notebook.load(ctx.content, { ...mode, macrosSource, docKey: `alphaPy:${ctx.folder.root}:${ctx.path}` });
      readMacros(ctx.files()).then(changed => { if (changed) notebook.setContext({ macrosSource }); });
      return {
        filesChanged: files => { readMacros(files).then(changed => { if (changed) notebook.setContext({ macrosSource }); }); },
        destroy: () => notebook.destroy(),
      };
    },
  });
}
