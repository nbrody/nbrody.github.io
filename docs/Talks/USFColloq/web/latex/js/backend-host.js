// Backend for an embedding host page (alphaCentaur's Manuscript section):
// index.html?host=<name> inside a same-origin iframe. The host owns the
// files, builds and PDFs; the editor asks for them over postMessage.
//
// editor → host  {channel: 'latex-editor', type: 'call', id, method, args}
//                {channel: 'latex-editor', type: 'notify', name, data}
// host → editor  {channel: 'latex-host', type: 'reply', id, result} | {…, error: {message, code?, current?}}
//                {channel: 'latex-host', type: 'event', name, data}
//
// Methods (all resolve to plain JSON):
//   hello()                         → {name, key, capabilities, templates, fileActions, preferredMain,
//                                      zipUrl?, initialFile?, documents?}
//                                    documents: {current, options: [{value, label}], canMove} — the
//                                    host's documents, shown as a Document picker in the top bar
//   list()                          → {files: [File]}
//   read({id})                      → File & {content, readOnly?, draftKey?}
//   write({id, content, baseRevision}) → {revision}; a stale base revision rejects
//                                       with {code: 'conflict', current: {content, revision}}
//   create({path, content} | {path, base64, overwrite}) → File   (base64: uploads, pasted figures)
//   rename({id, path})              → File
//   remove({id})                    (when capabilities.remove: to the host's Trash)
//   history({id})                   → [{id, created, author, content}]
//   compile({main, options})        → {id}   options: {engine?, draft?, haltOnError?, clean?}
//                                    (honor what hello().capabilities advertises)
//   builds({main, fresh?})          → {latest: Build|null, pdf: Build|null}
//   cancel({id})
//   toSource({build, page, x, y})   → {id, line, stale?}     (PDF point in bp from the top left)
//   toPdf({build, id, line, column}) → {page, x, y, width, height}
//   action({action, id})            → host-defined (e.g. 'ask', 'bibliography'; from the Document
//                                    picker: 'document' with id = the chosen value, 'new-document',
//                                    'move-document')
//
//   File  = {id, path, label?, kind, revision, main?, binary?, url?, readOnly?, group?, badge?, tag?, icon?, note?, warnings?, actions?}
//           (url: where a binary file — a figure, a PDF — can be shown)
//   Build = {id, status, created, log, pdfUrl, sync: {toSource, toPdf}, inputs: {[fileId]: revision}}
//
// Events: 'files' (list changed), 'builds' (a build started or finished),
//         'open' {id, line?} (the host wants a file shown),
//         'documents' {current, options, canMove} (the Document picker changed).
// Notifications: 'ready', 'opened' {id}, 'main' {id}.

export function hostBackend(name) {
  const pending = new Map(), listeners = new Set(), urls = new Map();
  let seq = 0;
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.channel !== 'latex-host') return;
    if (d.type === 'reply' && pending.has(d.id)) {
      const {resolve, reject} = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) reject(Object.assign(new Error(d.error.message || 'The host could not complete this request.'), d.error));
      else resolve(d.result);
    } else if (d.type === 'event') for (const fn of listeners) fn(d.name, d.data || {});
  });
  const post = message => window.parent.postMessage({channel: 'latex-editor', ...message}, location.origin);
  const call = (method, args = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {resolve, reject});
    post({type: 'call', id, method, args});
  });
  return {
    kind: 'host', host: name,
    hello: () => call('hello'),
    list: () => call('list').then(r => { urls.clear(); for (const f of r.files || []) if (f.url) urls.set(f.id, f.url); return r; }),
    read: id => call('read', {id}),
    write: (id, content, baseRevision) => call('write', {id, content, baseRevision}),
    create: (path, {content = '', base64, overwrite} = {}) => call('create', base64 == null ? {path, content} : {path, base64, overwrite: !!overwrite}),
    remove: id => call('remove', {id}),
    rename: (id, to) => call('rename', {id, path: to}),
    history: id => call('history', {id}),
    compile: (main, options = {}) => call('compile', {main, options}),
    zipUrl: () => null, // the host may give one in hello() as info.zipUrl
    builds: (main, options = {}) => call('builds', {main, ...options}),
    cancel: id => call('cancel', {id}),
    toSource: (build, point) => call('toSource', {build, ...point}),
    toPdf: (build, id, line, column) => call('toPdf', {build, id, line, column}),
    action: (action, id) => call('action', {action, id}),
    rawUrl: id => urls.get(id) || null,
    notify: (n, data) => post({type: 'notify', name: n, data}),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
