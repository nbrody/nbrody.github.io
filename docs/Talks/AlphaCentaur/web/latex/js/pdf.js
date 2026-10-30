// PDF view on pdf.js: text selection, links, zoom, page navigation, a click
// on the page reported as a SyncTeX point, and highlighted SyncTeX targets.
//
// Each document loads into its own layer. A new build renders behind the
// current one at the same zoom and scroll position and replaces it once its
// first page is drawn, so recompiling never flashes or loses your place.
import {h} from './ui.js';

let library;
function pdfjs() {
  library ||= (async () => {
    const core = await import('../vendor/pdfjs/pdf.min.mjs');
    core.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    // pdf_viewer.mjs reads the core library from globalThis.pdfjsLib.
    const viewer = await import('../vendor/pdfjs/pdf_viewer.mjs');
    return {core, viewer};
  })();
  return library;
}

// Converts a click through the page viewport, so zoom, rotation and
// high-density canvases cannot change which point is reported. SyncTeX
// wants big points from the top left of the page.
export function pdfPoint(page, viewport, rect, clientX, clientY) {
  if (!rect.width || !rect.height) return null;
  const dx = clientX - rect.left, dy = clientY - rect.top;
  if (dx < 0 || dy < 0 || dx > rect.width || dy > rect.height) return null;
  const [px, py] = viewport.convertToPdfPoint(dx * viewport.width / rect.width, dy * viewport.height / rect.height);
  const [left, , , top] = viewport.viewBox, unit = viewport.userUnit || 1;
  return {page, x: Math.max(0, (px - left) * unit), y: Math.max(0, (top - py) * unit)};
}
// A plain click: no drag, no text selection, no modifier keys.
export const isPlainClick = (start, e, hasSelection) => !!start && e.button === 0 && !hasSelection &&
  !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && Math.hypot(start.x - e.clientX, start.y - e.clientY) <= 5;

export class PdfView {
  constructor(host, {onPoint, onState} = {}) {
    Object.assign(this, {host, onPoint, onState});
    this.layer = null;
    this.fit = 'page-width';
    this.token = 0;
    this.state = {page: 1, pages: 0, zoom: 100, loading: false, error: '', matches: null};
    this.query = '';
    new ResizeObserver(() => { const l = this.layer; if (l?.doc && this.fit) l.viewer.currentScaleValue = this.fit; }).observe(host);
  }
  emit(patch) { Object.assign(this.state, patch); this.onState?.(this.state); }
  get viewer() { return this.layer?.viewer; }

  async open(url) {
    const token = ++this.token;
    this.emit({loading: true, error: ''});
    try {
      const {core, viewer: V} = await pdfjs();
      const task = core.getDocument({url, disableRange: true, isEvalSupported: false, enableXfa: false,
        wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href});
      const doc = await task.promise;
      if (token !== this.token) { void doc.destroy(); return; }
      const previous = this.layer;
      const layer = this.makeLayer(V, core, !!previous);
      layer.doc = doc;
      const keep = previous?.doc ? {top: previous.scroller.scrollTop, left: previous.scroller.scrollLeft,
        scale: this.fit || previous.viewer.currentScale} : null;
      let shown = false;
      const show = () => {
        if (shown || token !== this.token) return;
        shown = true;
        layer.scroller.classList.remove('behind');
        this.layer = layer;
        if (previous) { previous.scroller.remove(); void previous.doc?.destroy(); }
        this.emit({loading: false, pages: doc.numPages, page: layer.viewer.currentPageNumber, zoom: Math.round(layer.viewer.currentScale * 100)});
        if (this.query) this.find(this.query, {quiet: true});
      };
      layer.bus.on('pagesinit', () => {
        layer.viewer.currentScaleValue = keep ? String(keep.scale) : this.fit || 'page-width';
        if (keep) { layer.scroller.scrollTop = keep.top; layer.scroller.scrollLeft = keep.left; }
        if (!previous) show();
      });
      layer.bus.on('pagerendered', show);
      setTimeout(show, 1500); // never wait forever on a slow page
      layer.links.setDocument(doc);
      layer.viewer.setDocument(doc);
    } catch (e) {
      if (token === this.token) this.emit({loading: false, error: e?.message || 'The PDF could not be loaded.'});
    }
  }
  makeLayer(V, core, behind) {
    const pages = h('div', {class: 'pdfViewer'});
    const scroller = h('div', {class: `pdf-scroller ${behind ? 'behind' : ''}`, tabindex: '0', 'aria-label': 'PDF pages'}, pages);
    this.host.append(scroller);
    const bus = new V.EventBus();
    const links = new V.PDFLinkService({eventBus: bus, externalLinkTarget: 2, externalLinkRel: 'noopener noreferrer', ignoreDestinationZoom: true});
    const findController = new V.PDFFindController({linkService: links, eventBus: bus, updateMatchesCountOnProgress: true});
    const viewer = new V.PDFViewer({container: scroller, viewer: pages, eventBus: bus, linkService: links, findController, textLayerMode: 1,
      annotationMode: core.AnnotationMode.ENABLE, annotationEditorMode: core.AnnotationEditorType.NONE, enableScripting: false});
    links.setViewer(viewer);
    const layer = {scroller, pages, bus, links, viewer, findController, doc: null};
    const mine = () => this.layer === layer;
    const counted = e => { if (mine() && this.query) this.emit({matches: e.matchesCount ? {current: e.matchesCount.current, total: e.matchesCount.total} : this.state.matches}); };
    bus.on('updatefindmatchescount', counted);
    bus.on('updatefindcontrolstate', counted);
    bus.on('pagechanging', e => { if (mine()) this.emit({page: e.pageNumber}); });
    bus.on('scalechanging', e => { if (mine()) this.emit({zoom: Math.round(e.scale * 100)}); });
    let start = null;
    scroller.addEventListener('pointerdown', e => { start = {x: e.clientX, y: e.clientY}; });
    scroller.addEventListener('pointercancel', () => { start = null; });
    scroller.addEventListener('click', e => {
      const s = start; start = null;
      if (!this.onPoint || !mine() || !isPlainClick(s, e, !window.getSelection()?.isCollapsed)) return;
      if (e.target.closest('a, button, input, textarea, select, .annotationLayer section')) return;
      const pageEl = e.target.closest('.page[data-page-number]');
      const number = Number(pageEl?.dataset.pageNumber), view = viewer.getPageView(number - 1);
      const surface = pageEl?.querySelector('.canvasWrapper');
      if (!surface || !view?.viewport) return;
      const point = pdfPoint(number, view.viewport, surface.getBoundingClientRect(), e.clientX, e.clientY);
      if (point) this.onPoint(point);
    });
    return layer;
  }
  close() {
    this.token++;
    if (this.layer) { this.layer.scroller.remove(); void this.layer.doc?.destroy(); this.layer = null; }
    this.emit({pages: 0, page: 1, loading: false, error: ''});
  }
  goto(page) { if (this.viewer && this.state.pages) this.viewer.currentPageNumber = Math.max(1, Math.min(this.state.pages, page)); }
  zoom(factor) {
    if (!this.viewer) return;
    this.fit = null;
    this.viewer.currentScale = Math.max(0.25, Math.min(5, this.viewer.currentScale * factor));
  }
  fitWidth() { this.fit = 'page-width'; if (this.viewer) this.viewer.currentScaleValue = 'page-width'; }
  fitPage() { this.fit = 'page-fit'; if (this.viewer) this.viewer.currentScaleValue = 'page-fit'; }
  setZoom(percent) { this.fit = null; if (this.viewer) this.viewer.currentScale = percent / 100; }
  // Text search across the document, highlighting every match.
  find(query, {again = false, previous = false, quiet = false} = {}) {
    this.query = query;
    if (!this.layer) return;
    if (!query) { this.layer.bus.dispatch('findbarclose', {source: this}); this.emit({matches: null}); return; }
    this.layer.bus.dispatch('find', {source: this, type: again ? 'again' : '', query, caseSensitive: false, entireWord: false,
      highlightAll: true, findPrevious: previous, matchDiacritics: false});
    if (!quiet && !again) this.emit({matches: {current: 0, total: 0}});
  }
  // Full-screen slides: one page at a time, fitted, arrow keys to move.
  async present(element) {
    if (!this.viewer) return;
    const viewer = this.viewer, before = {fit: this.fit, scale: viewer.currentScaleValue, mode: viewer.scrollMode};
    try { await element.requestFullscreen(); } catch { return; }
    viewer.scrollMode = 3; // ScrollMode.PAGE
    setTimeout(() => { viewer.currentScaleValue = 'page-fit'; }, 60);
    const key = e => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); viewer.nextPage(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); viewer.previousPage(); }
    };
    const exit = () => {
      if (document.fullscreenElement) return;
      document.removeEventListener('fullscreenchange', exit);
      removeEventListener('keydown', key, true);
      viewer.scrollMode = before.mode;
      this.fit = before.fit;
      setTimeout(() => { viewer.currentScaleValue = before.fit || String(before.scale); }, 60);
    };
    addEventListener('keydown', key, true);
    document.addEventListener('fullscreenchange', exit);
  }
  // Scrolls to and briefly highlights a box given in big points from the
  // page's top left (SyncTeX's units).
  highlight({page, x, y, width, height}) {
    const view = this.viewer?.getPageView(page - 1);
    if (!view?.viewport) return false;
    const vp = view.viewport, [left, , , top] = vp.viewBox, unit = vp.userUnit || 1;
    const [x1, y1] = vp.convertToViewportPoint(left + x / unit, top - y / unit);
    const [x2, y2] = vp.convertToViewportPoint(left + (x + width) / unit, top - (y + height) / unit);
    const box = {left: Math.min(x1, x2) - 3, top: Math.min(y1, y2) - 2, width: Math.abs(x2 - x1) + 6, height: Math.abs(y2 - y1) + 4};
    const mark = h('div', {class: 'sync-mark', style: {left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`}});
    view.div.append(mark);
    setTimeout(() => mark.remove(), 2200);
    const scroller = this.layer.scroller;
    scroller.scrollTo({top: Math.max(0, view.div.offsetTop + box.top - scroller.clientHeight / 3),
      left: Math.max(0, view.div.offsetLeft + box.left - 40)});
    return true;
  }
}
