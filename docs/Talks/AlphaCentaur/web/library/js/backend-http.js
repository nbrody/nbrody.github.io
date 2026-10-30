// Backend for alphaLibrary on its own: the folder server (library/server.mjs,
// routes in server/library-folder.mjs). Same interface as backend-host.js.
async function request(method, url, body) {
  const res = await fetch(url, {
    method, cache: 'no-store',
    headers: method === 'GET' ? {} : {'Content-Type': 'application/json', 'x-alpha-applet': '1'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || data === null) {
    const error = new Error(data?.error || `The folder server did not answer (${res.status}).`);
    error.status = res.status;
    if (res.status === 409 && data?.current) { error.code = 'conflict'; error.current = data.current; }
    throw error;
  }
  return data;
}
const q = encodeURIComponent;

export function httpBackend() {
  return {
    kind: 'local',
    async hello() {
      const info = await request('GET', 'api/info');
      return {name: info.name, root: info.root, key: `local:${info.root}`, macrosSource: '', manuscripts: [], capabilities: {}};
    },
    list: () => request('GET', 'api/library'),
    save: (id, record, baseRevision) => request('PUT', 'api/library/reference', {id, record, baseRevision}),
    create: record => request('POST', 'api/library/reference', {record}),
    remove: id => request('POST', 'api/library/delete', {id}),
    resolve: doi => request('POST', 'api/library/resolve', {doi}),
    attach: (id, source) => request('POST', 'api/library/pdf', {id, ...source}),
    bibtex: (_manuscript, primary) => request('GET', `api/library/bibtex?primary=${primary ? 'true' : 'false'}`),
    action: async () => {},
    pdfUrl: (path, download = false) => `api/raw?path=${q(path)}${download ? '&download=1' : ''}`,
    notify: () => {},
    // The folder can change on disk (another app, Dropbox, git): poll.
    subscribe(fn) {
      let last = '', stopped = false;
      const tick = async () => {
        if (stopped) return;
        if (!document.hidden) {
          try {
            const {references, pdfs} = await request('GET', 'api/library');
            const sig = references.map(r => `${r.id}:${r.revision}`).join('|') + '#' + pdfs.map(p => p.path).join('|');
            if (last && sig !== last) fn('changed', {});
            last = sig;
          } catch {}
        }
        setTimeout(tick, 3000);
      };
      tick();
      return () => { stopped = true; };
    },
  };
}
