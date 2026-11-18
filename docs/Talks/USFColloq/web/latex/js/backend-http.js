// Backend for the standalone app: the local server in server.mjs.
// Implements the same interface as backend-host.js.

async function request(method, url, body) {
  const res = await fetch(url, {
    method, cache: 'no-store',
    headers: {'Content-Type': 'application/json', 'X-Latex-Editor': '1'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status}).`);
    error.status = res.status;
    if (res.status === 409 && data.current) { error.code = 'conflict'; error.current = data.current; }
    throw error;
  }
  return data;
}
const q = encodeURIComponent;

export function httpBackend() {
  let info;
  return {
    kind: 'local',
    async hello() {
      info = await request('GET', 'api/info');
      return {...info, key: `local:${info.root}`};
    },
    list: () => request('GET', 'api/files'),
    read: id => request('GET', `api/file?path=${q(id)}`),
    write: (id, content, baseRevision) => request('PUT', 'api/file', {path: id, content, baseRevision}),
    create: (path, {content, base64, overwrite} = {}) => request('POST', 'api/file', {path, content, base64, overwrite}),
    rename: (id, to) => request('POST', 'api/rename', {path: id, to}),
    compile: (main, options = {}) => request('POST', 'api/compile', {main, ...options}),
    remove: id => request('POST', 'api/delete', {path: id}),
    history: id => request('GET', `api/history?path=${q(id)}`),
    version: (id, version) => request('GET', `api/version?path=${q(id)}&id=${q(version)}`),
    wordCount: main => request('GET', `api/wordcount?main=${q(main)}`),
    zipUrl: () => 'api/zip',
    builds: main => request('GET', `api/builds?main=${q(main)}`),
    cancel: id => request('POST', 'api/cancel', {id}),
    toSource: (build, point) => request('POST', 'api/sync/source', {build, ...point}),
    toPdf: (build, id, line, column) => request('POST', 'api/sync/pdf', {build, path: id, line, column}),
    rawUrl: (id, download) => `api/raw?path=${q(id)}${download ? '&download=1' : ''}`,
    action: async () => {},
    notify: () => {},
    // Files can change on disk (another editor, git, Dropbox): poll.
    subscribe(fn) {
      let last = '', stopped = false;
      const tick = async () => {
        if (stopped) return;
        if (!document.hidden) {
          try {
            const {files} = await request('GET', 'api/files');
            const sig = files.map(f => `${f.id}:${f.revision}`).join('|');
            if (last && sig !== last) fn('files', {files});
            last = sig;
          } catch {}
        }
        setTimeout(tick, 2000);
      };
      setTimeout(tick, 2000);
      return () => { stopped = true; };
    },
  };
}
