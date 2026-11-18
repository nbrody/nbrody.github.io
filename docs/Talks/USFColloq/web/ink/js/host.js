// Embedding protocol for alphaCentaur (index.html?host=alphacentaur).
//
// alphaNote runs in a same-origin iframe inside the Handwriting section.
// alphaCentaur owns storage: it sends the notebook (its JSON) with load, and
// receives every committed change, which goes through its normal autosave
// (base revision, local draft, conflict check).
//
//   host → applet  {source: 'alphacentaur', type: 'load', content, readOnly}
//   applet → host  {source: 'alpha-applet', applet: 'ink', type: 'ready'}
//                  {… type: 'change', content}   {… type: 'save'}   (⌘S / Ctrl+S)
//                  {… type: 'recognized', text}  (Save separate transcription)

export const HOST = new URLSearchParams(location.search).get('host') === 'alphacentaur' && window.parent !== window;

const listeners = {};
export function onHost(type, fn) { listeners[type] = fn; }
export function toHost(type, data = {}) {
  if (HOST) window.parent.postMessage({ source: 'alpha-applet', applet: 'ink', type, ...data }, location.origin);
}

if (HOST) {
  document.documentElement.dataset.host = 'alphacentaur';
  addEventListener('message', e => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data;
    if (d && d.source === 'alphacentaur' && typeof d.type === 'string' && listeners[d.type]) listeners[d.type](d);
  });
}
