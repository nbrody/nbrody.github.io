// Embedding protocol for alphaCentaur (index.html?host=alphacentaur).
//
// alphaMarkdown runs in a same-origin iframe inside a Notes document (and the
// Overview's description.md). alphaCentaur owns storage: it sends the note
// with `load` and receives every edit as `change`, which goes through its
// usual autosave (base revision, local draft, conflict check).
//
//   host → applet  load {content, readOnly, docKey, path, files, macrosSource, bare}
//                    docKey: where folds are remembered (`<pid>:<aid>`)
//                    path:   the note's project path; files: URL prefix of the
//                            project's raw files (relative pictures)
//                    macrosSource: the project's macros.tex (parsed here)
//                    bare:   no toolbar, always Live editing, no scroller of
//                            its own: the host sizes the frame to the note
//                  A load whose content is what the applet last sent or
//                  received only updates the rest (macros, path).
//   applet → host  ready   change {content}   save   link {name}  ([[wiki link]] clicked)
//                  bare only: size {height} (the note's height in px, whenever
//                  it changes)   caret {top, bottom, height} (the cursor after
//                  typing or keyboard movement, in frame px, to scroll into
//                  view; height as in size, which it may arrive before)
//
// Messages are {source: 'alphacentaur' | 'alpha-applet', applet: 'markdown', type, …}
// and only ever travel between this frame and its same-origin parent.
export const HOST = new URLSearchParams(location.search).get('host') === 'alphacentaur' && window.parent !== window;

const listeners = {};
export function onHost(type, fn) { listeners[type] = fn; }
export function toHost(type, data = {}) {
  if (HOST) window.parent.postMessage({ source: 'alpha-applet', applet: 'markdown', type, ...data }, location.origin);
}
if (HOST) {
  document.documentElement.dataset.host = 'alphacentaur';
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (d && d.source === 'alphacentaur' && listeners[d.type]) listeners[d.type](d);
  });
}
