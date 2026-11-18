// The frame alphaMarkdown and alphaNote share when they run on their own,
// served at /standalone/ by server/applet-server.mjs: the folder's files on
// the left, the open file on the right. It saves edits back to disk about a
// second after typing stops, checks every save against the revision it
// started from, and polls the folder so changes made elsewhere (another
// editor, git, Dropbox) show up. Inside alphaCentaur the applets don't load
// this; the workspace provides the files.
//
//   startShell({name, noun, suffix, matches(path), template(), icon(name, size), mount(container, ctx)})
//   templates: [{label, name?, content() → text or Promise}] in place of template() offers a choice
//              of how a new file starts (the first is the default; name is the file name it suggests).
//   ctx:     {path, content, folder: {name, root}, onChange(content), save(), create(path, content) → path,
//             notify(message), files() → [{path, kind, revision, binary}], open(path)}
//   mount returns {destroy(), filesChanged?(files)}; it is called again when the file reloads from disk.
const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./shell.css', import.meta.url).href });
document.head.append(css);

class Conflict extends Error { constructor(message, current) { super(message); this.current = current; } }
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'x-alpha-applet': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* not this server */ }
  if (res.status === 409 && data?.current) throw new Conflict(data.error, data.current);
  if (!res.ok || data === null) throw new Error(data?.error || `The folder server did not answer (${res.status}).`);
  return data;
}
const q = encodeURIComponent;
const folder = {
  info: () => call('GET', 'api/info'),
  files: () => call('GET', 'api/files'),
  read: path => call('GET', `api/file?path=${q(path)}`),
  write: (path, content, baseRevision) => call('PUT', 'api/file', { path, content, baseRevision }),
  create: (path, content = '') => call('POST', 'api/file', { path, content }),
  rename: (path, to) => call('POST', 'api/rename', { path, to }),
  remove: path => call('POST', 'api/delete', { path }),
};

function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children.filter(c => c != null));
  return e;
}
const store = {
  get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ } },
};

export async function startShell({ name, noun, suffix, matches, template, templates, icon, mount }) {
  const starts = templates?.length ? templates : [{ label: 'Blank', content: template || (() => '') }];
  const app = document.getElementById('app');
  let info;
  try { info = await folder.info(); }
  catch (e) {
    app.replaceChildren(h('div', { class: 'shell-offline' }, h('h1', {}, name), h('p', {}, `This page needs ${name}'s own server, which opens a folder on your computer.`), h('p', { class: 'muted' }, e.message)));
    return;
  }
  document.title = `${info.name} · ${name}`;
  const key = what => `${name}:${what}:${info.root}`;
  const strip = p => (p.toLowerCase().endsWith(suffix) ? p.slice(0, -suffix.length) : p);
  const withSuffix = n => { const s = n.trim().replace(/^\/+|\/+$/g, ''); return s.toLowerCase().endsWith(suffix) ? s : s + suffix; };

  let files = [], listed = '', doc = null, current = '', saving = null, timer = null, writes = 0, conflict = null, editor = null;
  let collapsed = new Set(store.get(key('folds'), []));

  // --------------------------------------------------------------- layout
  const tree = h('ul', { class: 'shell-tree', 'aria-label': 'Files and folders' });
  const side = h('aside', { class: 'shell-side' },
    h('div', { class: 'shell-brand', title: info.root }, h('img', { src: 'icon.png', alt: '' }), h('div', {}, h('strong', {}, name), h('small', {}, info.name))),
    h('button', { type: 'button', class: 'shell-new', onclick: () => newFile('') }, icon('file-plus', 15), `New ${noun}`),
    h('div', { class: 'shell-files' }, tree));
  const main = h('main', { class: 'shell-main' });
  const toast = h('div', { class: 'shell-toast', role: 'alert', hidden: true, onclick: () => { toast.hidden = true; } });
  app.replaceChildren(h('div', { class: 'shell' }, side, main), toast);
  let toastTimer;
  const notify = message => { toast.textContent = message; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 6000); };

  const status = h('span', { class: 'shell-status', role: 'status' });
  const setStatus = s => { status.textContent = s; };

  // ---------------------------------------------------------------- files
  function drawTree() {
    const shown = files.filter(f => !f.binary && matches(f.path)).sort((a, b) => a.path.localeCompare(b.path));
    const root = { folders: new Map(), files: [] };
    for (const f of shown) {
      const parts = f.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts.slice(0, i + 1).join('/');
        if (!node.folders.has(parts[i])) node.folders.set(parts[i], { path: p, name: parts[i], folders: new Map(), files: [] });
        node = node.folders.get(parts[i]);
      }
      node.files.push(f);
    }
    const branch = (node, depth) => [
      ...[...node.folders.values()].map(fd => {
        const open = !collapsed.has(fd.path);
        return h('li', { class: 'shell-folder' },
          h('div', { class: 'shell-row', style: `padding-left:${depth * 12}px` },
            h('button', { type: 'button', class: 'shell-item', 'aria-expanded': String(open), title: fd.path, onclick: () => { open ? collapsed.add(fd.path) : collapsed.delete(fd.path); store.set(key('folds'), [...collapsed]); drawTree(); } },
              h('span', { class: `shell-chevron${open ? ' open' : ''}` }, icon('chevron-right', 12)), icon(open ? 'folder-open' : 'folder', 15), h('span', {}, fd.name)),
            h('button', { type: 'button', class: 'shell-row-btn', title: `New ${noun} in ${fd.path}`, 'aria-label': `New ${noun} in ${fd.path}`, onclick: () => newFile(fd.path) }, icon('file-plus', 13))),
          open ? h('ul', {}, ...branch(fd, depth + 1)) : null);
      }),
      ...node.files.map(f => h('li', { class: `shell-row${doc?.path === f.path ? ' selected' : ''}`, style: `padding-left:${depth * 12}px` },
        h('button', { type: 'button', class: 'shell-item', title: f.path, 'aria-current': doc?.path === f.path ? 'page' : null, onclick: () => open(f.path) },
          icon('file-text', 14), h('span', {}, strip(f.path.split('/').pop()))),
        h('button', { type: 'button', class: 'shell-row-btn', title: `More for ${f.path}`, 'aria-label': `More for ${f.path}`, onclick: e => fileMenu(e.currentTarget, f.path) }, icon('ellipsis', 14)))),
    ];
    tree.replaceChildren(...branch(root, 0), ...(shown.length ? [] : [h('li', { class: 'shell-empty-tree' }, `No ${noun}s yet.`)]));
  }

  async function refresh() {
    const seq = writes;
    files = (await folder.files()).files;
    const sig = JSON.stringify(files.map(f => [f.path, f.revision]));
    if (sig !== listed) { listed = sig; drawTree(); editor?.filesChanged?.(files); }
    // A change on disk to the open file (skipped while our own save is in flight).
    const d = doc;
    if (!d || saving || seq !== writes || conflict) return;
    const disk = files.find(f => f.path === d.path);
    if (!disk) { setStatus('Removed from the folder'); return; }
    if (disk.revision === d.revision) return;
    const fresh = await folder.read(d.path);
    if (doc !== d || saving || seq !== writes) return;
    if (current === d.saved) {
      doc = { path: d.path, revision: fresh.revision, saved: fresh.content };
      current = fresh.content;
      remount();
      setStatus('Updated from disk');
    } else showConflict({ content: fresh.content, revision: fresh.revision });
  }

  // --------------------------------------------------------------- saving
  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (saving) await saving;
    const d = doc;
    if (!d || conflict || current === d.saved) return;
    const content = current;
    setStatus('Saving…');
    saving = (async () => {
      try {
        const f = await folder.write(d.path, content, d.revision);
        writes++;
        if (doc === d) { d.revision = f.revision; d.saved = content; }
        setStatus(current === content ? 'Saved' : 'Unsaved changes');
      } catch (e) {
        if (e instanceof Conflict) { showConflict(e.current); setStatus('Changed on disk'); }
        else { setStatus('Save failed'); notify(e.message); }
      } finally { saving = null; }
    })();
    await saving;
    if (doc === d && current !== d.saved && !conflict) timer = setTimeout(flush, 800);
  }
  function onChange(next) {
    current = next;
    setStatus('Unsaved changes');
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }

  // --------------------------------------------------------- open a file
  const body = h('div', { class: 'shell-body' });
  const notice = h('div', { class: 'shell-conflict', hidden: true });
  function remount() {
    editor?.destroy?.();
    body.replaceChildren();
    const path = doc.path;
    editor = mount(body, {
      path, content: current, folder: { name: info.name, root: info.root },
      onChange, save: flush, notify, files: () => files, open: p => open(p),
      create: async (p, content) => { const f = await folder.create(p, content); await refresh(); return f.path; },
    });
  }
  function showConflict(c) {
    conflict = c;
    notice.replaceChildren(
      h('span', {}, `This ${noun} changed on disk while you were editing it.`),
      h('button', { type: 'button', class: 'shell-btn outline', onclick: () => {
        doc = { path: doc.path, revision: c.revision, saved: c.content };
        current = c.content; conflict = null; notice.hidden = true; remount(); setStatus('Saved');
      } }, 'Use the version on disk'),
      h('button', { type: 'button', class: 'shell-btn primary', onclick: () => {
        doc.revision = c.revision; conflict = null; notice.hidden = true; flush();
      } }, 'Keep mine'));
    notice.hidden = false;
  }
  function drawMain() {
    if (!doc) {
      const any = files.some(f => !f.binary && matches(f.path));
      main.replaceChildren(h('div', { class: 'shell-empty' },
        h('p', {}, any ? `Choose a ${noun} on the left, or start a new one.` : `This folder has no ${noun}s yet.`),
        h('button', { type: 'button', class: 'shell-btn primary', onclick: () => newFile('') }, icon('file-plus', 15), `New ${noun}`)));
      return;
    }
    const label = strip(doc.path), parts = label.split('/');
    main.replaceChildren(
      h('header', { class: 'shell-head' },
        h('div', {}, h('div', { class: 'shell-eyebrow' }, parts.slice(0, -1).join(' / ') || info.name), h('h1', { title: doc.path }, parts.at(-1))),
        status),
      notice, body);
  }
  async function open(path) {
    try {
      await flush();
      const f = await folder.read(path);
      doc = { path: f.path, revision: f.revision, saved: f.content };
      current = f.content;
      conflict = null; notice.hidden = true;
      drawMain(); remount(); drawTree();
      setStatus('Saved');
      history.replaceState(null, '', `#${encodeURIComponent(f.path)}`);
      store.set(key('last'), f.path);
    } catch (e) { notify(e.message); }
  }
  function close() {
    editor?.destroy?.(); editor = null; doc = null;
    history.replaceState(null, '', location.pathname);
    drawMain(); drawTree();
  }

  // ------------------------------------------------------------- dialogs
  function ask({ title, initial = '', action, submit, extra = null }) {
    const input = h('input', { value: initial, placeholder: 'Name', 'aria-label': 'Name', autocomplete: 'off', spellcheck: 'false' });
    const err = h('p', { class: 'shell-error', hidden: true });
    const go = h('button', { type: 'submit', class: 'shell-btn primary' }, submit);
    const dialog = h('dialog', { class: 'shell-dialog' },
      h('form', { method: 'dialog', onsubmit: async e => {
        e.preventDefault();
        if (!input.value.trim()) return;
        go.disabled = true;
        try { await action(input.value); dialog.close(); }
        catch (x) { err.textContent = x.message; err.hidden = false; go.disabled = false; }
      } },
        h('h2', {}, title), h('p', { class: 'muted' }, 'Use folder/name to put it in a folder.'), input, extra?.(input), err,
        h('div', { class: 'shell-actions' }, h('button', { type: 'button', class: 'shell-btn outline', onclick: () => dialog.close() }, 'Cancel'), go)));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  function newFile(dir) {
    const base = dir ? `${dir}/` : '';
    let pick = 0;
    // With several ways to start, a choice under the name; switching it swaps a suggested name.
    const extra = starts.length < 2 ? null : input => h('label', { class: 'shell-field' }, 'Start with',
      h('select', { onchange: e => {
        const next = Number(e.target.value);
        if (!input.value.trim() || input.value === base + (starts[pick].name || '')) input.value = base + (starts[next].name || '');
        pick = next;
      } }, ...starts.map((t, i) => h('option', { value: String(i) }, t.label))));
    ask({ title: `New ${noun}`, initial: base + (starts[0].name || ''), submit: 'Create', extra, action: async n => {
      const f = await folder.create(withSuffix(n), await starts[pick].content());
      await refresh(); await open(f.path);
    } });
  }
  const renameFile = path => ask({ title: `Rename ${noun}`, initial: strip(path), submit: 'Rename', action: async n => {
    if (doc?.path === path) await flush();
    const f = await folder.rename(path, withSuffix(n));
    await refresh();
    if (doc?.path === path) await open(f.path);
  } });
  function trashFile(path) {
    const dialog = h('dialog', { class: 'shell-dialog' },
      h('h2', {}, 'Move to Trash?'), h('p', { class: 'muted' }, `${path} goes to the Trash, where you can restore it.`),
      h('div', { class: 'shell-actions' },
        h('button', { type: 'button', class: 'shell-btn outline', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'shell-btn danger', onclick: async () => {
          dialog.close();
          try {
            if (doc?.path === path) { await flush(); close(); }
            await folder.remove(path);
            await refresh();
          } catch (e) { notify(e.message); }
        } }, 'Move to Trash')));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
  function fileMenu(anchor, path) {
    document.querySelector('.shell-menu')?.remove();
    const item = (label, iconName, onclick, danger) => h('button', { type: 'button', role: 'menuitem', class: danger ? 'danger' : null, onclick: () => { menu.remove(); onclick(); } }, icon(iconName, 14), label);
    const menu = h('div', { class: 'shell-menu', role: 'menu' }, item('Rename or move', 'pencil', () => renameFile(path)), h('hr'), item('Move to Trash', 'trash-2', () => trashFile(path), true));
    const r = anchor.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${Math.max(8, r.right - 180)}px`;
    document.body.append(menu);
    menu.querySelector('button').focus();
    const away = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', away, true); } };
    document.addEventListener('pointerdown', away, true);
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.remove(); anchor.focus(); } });
  }

  // ----------------------------------------------------------------- start
  addEventListener('beforeunload', e => { if (doc && current !== doc.saved) { flush(); e.preventDefault(); } });
  addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); } });
  try { await refresh(); } catch (e) { notify(e.message); }
  drawMain();
  let wanted = '';
  try { wanted = decodeURIComponent(location.hash.slice(1)); } catch { /* ignore */ }
  wanted ||= store.get(key('last'), '');
  if (wanted && files.some(f => f.path === wanted)) await open(wanted);
  setInterval(() => refresh().catch(() => {}), 2000);
}
