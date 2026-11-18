// Embedding protocol for alphaCentaur (index.html?host=alphacentaur).
//
// alphaPy runs in a same-origin iframe inside a Computations notebook.
// alphaCentaur owns storage: it sends the file with `load` and receives every
// edit as `change`, which goes through its usual autosave (base revision,
// local draft, conflict check). The kernel is a separate connection the page
// opens itself (js/kernel.js), described by `kernel`.
//
//   host → applet  load {content, readOnly, macrosSource, kernel, docKey}
//                    docKey: where collapsed sections are remembered (`<pid>:<aid>`)
//                    macrosSource: the project's macros.tex (parsed here)
//                    kernel: {start, base, headers, body} (see js/kernel.js), or null
//                  A load whose content is what the applet last sent or
//                  received only updates the rest.
//   applet → host  ready   change {content}   save
//
// Messages are {source: 'alphacentaur' | 'alpha-applet', applet: 'python', type, …}
// and only ever travel between this frame and its same-origin parent.
export const HOST = new URLSearchParams(location.search).get('host') === 'alphacentaur' && window.parent !== window;

const listeners = {};
export function onHost(type, fn) { listeners[type] = fn; }
export function toHost(type, data = {}) {
  if (HOST) window.parent.postMessage({ source: 'alpha-applet', applet: 'python', type, ...data }, location.origin);
}
if (HOST) {
  document.documentElement.dataset.host = 'alphacentaur';
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (d && d.source === 'alphacentaur' && listeners[d.type]) listeners[d.type](d);
  });
}
