// Shared editor state. main.js installs mutate/refresh; the canvas, slide
// list and inspector all go through them so undo, autosave and repainting stay
// in one place.

import { mathContext, macroSource } from './exporter.js';

export const app = {
  deck: null,          // the open deck
  record: null,        // its IndexedDB record ({id, deck, handle, …})
  slideIndex: 0,
  sel: new Set(),      // selected element ids on the current slide
  editingId: null,     // text element being edited in place
  interactId: null,    // embed/applet receiving pointer events
  tab: 'format',       // inspector tab: 'format' | 'design'
  zoom: 'fit',
  clipboard: null,
  history: null,
  // Installed by main.js:
  mutate: (fn, opts) => {},
  refresh: parts => {},
  commit: key => {},
  host: false,          // embedded in alphaCentaur (see host.js)
  liveChange: null,     // host mode: called on uncommitted edits
};

export const currentSlide = () => app.deck.slides[app.slideIndex];
export const findEl = id => currentSlide().elements.find(e => e.id === id);
export const selectedEls = () => currentSlide().elements.filter(e => app.sel.has(e.id));

let mcKey = null, mcVal = null;
export function editCtx(mode = 'edit') {
  const src = macroSource(app.deck);
  if (src !== mcKey) { mcKey = src; mcVal = mathContext(app.deck); }
  return { mode, deck: app.deck, ...mcVal };
}

export function setSelection(ids) {
  app.sel = new Set(ids);
  // Picking something on the slide means you want to format it.
  if (app.sel.size && app.tab === 'design') app.tab = 'format';
  app.refresh(['overlay', 'inspector']);
}
