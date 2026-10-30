// Embedding protocol for alphaCentaur (index.html?host=alphacentaur).
//
// The editor runs in a same-origin iframe inside the Presentation section.
// alphaCentaur owns storage: it sends the artifact (the exported HTML) with
// pz-load, and receives each re-export as pz-change, which goes through its
// normal autosave (base revision, local draft, conflict check).
//
//   host → editor  pz-load {content, macros, pid, aid, revision, fullWindow, canRename}
//                  pz-revision {revision}   pz-status {status}   pz-fullwindow {on}
//                  pz-remote-setup {setup: {firebase, page}, error?}   (workspace phone remote)
//   editor → host  pz-ready   pz-change {content}   pz-save   pz-fullwindow {on}
//                  pz-presenting {on}   (cover the whole window while presenting)
//                  pz-remote-setup-save {body}   (PUT /api/phone-remote)   pz-open-settings
//                  File-menu tools (alphaCentaur draws no toolbar above the editor):
//                  pz-mode {mode: 'source'} (show the HTML source)   pz-history   pz-rename
//                  pz-export-web (download the deck as a folder for any web host)
//
// Folder decks. The deck's file and the files beside it are project files:
//   host → editor  pz-context {path, folder, folderDeck, files, apps}
//                  (path: the deck's project path; folder: its folder; files: URL prefix of
//                  the project's raw files; apps: URL prefix on the apps origin, or null)
//   editor → host  requests answered with pz-reply {rid, result | error}:
//                  pz-file {name, base64, mime}     save an image into <folder>/assets/ → {path}
//                  pz-project-files                 → [{path, kind, binary, mime}]
//                  pz-convert {files, content}      single file → <name>/index.html + assets/ → {path}

export const HOST = new URLSearchParams(location.search).get('host') === 'alphacentaur' && window.parent !== window;

const listeners = {};
export function onHost(type, fn) { listeners[type] = fn; }
export function toHost(type, data = {}) {
  if (HOST) window.parent.postMessage({ source: 'pz-editor', type, ...data }, location.origin);
}
let seq = 0;
const waiting = new Map();
export function hostRequest(type, data = {}, ms = 120000) {
  if (!HOST) return Promise.reject(new Error('This needs alphaCentaur.'));
  const rid = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(rid); reject(new Error('alphaCentaur did not answer.')); }, ms);
    waiting.set(rid, { resolve, reject, timer });
    toHost(type, { ...data, rid });
  });
}
listeners['pz-reply'] = d => {
  const w = waiting.get(d.rid);
  if (!w) return;
  waiting.delete(d.rid); clearTimeout(w.timer);
  if (d.error) w.reject(new Error(d.error)); else w.resolve(d.result);
};

if (HOST) {
  document.documentElement.dataset.host = 'alphacentaur';
  document.documentElement.dataset.theme = 'light';
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (d && d.source === 'alphacentaur' && listeners[d.type]) listeners[d.type](d);
  });
}

// The slot alphaCentaur's Document uses for unsaved work. Writing a draft
// there lets an edit that was still being exported survive the frame closing.
export function writeHostDraft({ pid, aid, revision }, content) {
  try { localStorage.setItem(`alpha-draft:${pid}:${aid}`, JSON.stringify({ baseRevision: revision, content })); return true; }
  catch { return false; }
}
