// Backend inside alphaCentaur: index.html?host=alphacentaur in a same-origin
// frame, in the Bibliography section or its pop-out window. The workspace
// owns the references and PDFs (app/components/Library.tsx answers); the
// library asks for them over postMessage.
//
// library → host  {channel: 'library-applet', type: 'call', id, method, args}
//                 {channel: 'library-applet', type: 'notify', name, data}
// host → library  {channel: 'library-host', type: 'reply', id, result} | {…, error: {message, code?, current?}}
//                 {channel: 'library-host', type: 'event', name, data}
//
// Methods (all plain JSON):
//   hello()  → {name, key, macrosSource, manuscripts: [{id, title}], capabilities: {ask, manuscript},
//               filesBase (URL prefix of the project's raw files), open? (a reference id to show)}
//   list()   → {references: [Ref], pdfs: [{path, size}]}
//   save({id, record, baseRevision, rename?}) → Ref; a stale base revision rejects with
//               {code: 'conflict', current: Ref}. rename: the record's title is also the file name.
//   create({record}) → Ref
//   remove({id})                 (to the project's Trash)
//   resolve({doi})   → Ref       (a DOI or an arXiv number)
//   attach({id, path | url | base64}) → Ref   (path: null unlinks)
//   bibtex({manuscript, primary}) → {content, warnings}
//   action({action: 'ask', id, text?} | {action: 'manuscript'})
//
//   Ref = {id, title, owner, revision, updated, content}   (content: the record as JSON)
//
// Events: 'changed' (references or PDFs changed elsewhere), 'open' {id} (show that paper).
// Notifications: 'reading' {id | null} (the paper on screen, so a pop-out opens on it).
export function hostBackend(name) {
  const pending = new Map(), listeners = new Set();
  let seq = 0, filesBase = '';
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.channel !== 'library-host') return;
    if (d.type === 'reply' && pending.has(d.id)) {
      const {resolve, reject} = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) reject(Object.assign(new Error(d.error.message || 'alphaCentaur could not complete this request.'), d.error));
      else resolve(d.result);
    } else if (d.type === 'event') for (const fn of listeners) fn(d.name, d.data || {});
  });
  const post = message => window.parent.postMessage({channel: 'library-applet', ...message}, location.origin);
  const call = (method, args = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {resolve, reject});
    post({type: 'call', id, method, args});
  });
  return {
    kind: 'host', host: name,
    hello: () => call('hello').then(info => { filesBase = info.filesBase || ''; return info; }),
    list: () => call('list'),
    save: (id, record, baseRevision, rename = false) => call('save', {id, record, baseRevision, rename}),
    create: record => call('create', {record}),
    remove: id => call('remove', {id}),
    resolve: doi => call('resolve', {doi}),
    attach: (id, source) => call('attach', {id, ...source}),
    bibtex: (manuscript, primary) => call('bibtex', {manuscript, primary}),
    action: (action, data = {}) => call('action', {action, ...data}),
    pdfUrl: (path, download = false) => `${filesBase}${String(path).split('/').map(encodeURIComponent).join('/')}${download ? '?download=1' : ''}`,
    notify: (n, data) => post({type: 'notify', name: n, data}),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
