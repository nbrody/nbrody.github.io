// alphaNote's notebook: pages of pen strokes on a 1000×1400 canvas, with a
// highlighter, eraser, select-and-move, pan, PDF pages as backgrounds and
// experimental OCR. The same code runs inside alphaCentaur's Handwriting
// section and on its own (see main.js).
//
// A notebook is JSON:
//   {version: 1, current, pages: [{id, background: 'grid'|'ruled'|'blank'|'pdf',
//     backgroundImage?, sourcePage?, strokes: [{id, points: [{x, y, p}], color, width, tool}]}],
//    sources?: [{name, mimeType, base64}]}
// Every committed change calls onChange(JSON.stringify(notebook)).

const W = 1000, H = 1400;

export function parse(value) {
  try {
    const v = JSON.parse(value);
    if (v.pages?.length) return v;
  } catch { /* not a notebook yet */ }
  return { version: 1, pages: [{ id: crypto.randomUUID(), background: 'grid', strokes: [] }], current: 0 };
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.flat().filter(c => c != null && c !== false));
  return node;
}

// Tool, color, width and zoom carry over when another notebook (or a newer
// copy of this one) is loaded into the page.
const prefs = { tool: 'pen', color: '#172d44', width: 3, zoom: 0.65 };

export function createNotebook(container, { onChange, onRecognized, readOnly = false, icon }) {
  let book = parse(''), redo = [], selection = [], ocr = '', notice = '', busy = false, destroyed = false;
  let drawing = null, dragStart = null;
  const images = new Map();
  const ico = (name, size) => icon(name, size);
  const page = () => book.pages[book.current] || book.pages[0];

  // ------------------------------------------------------------ toolbar --
  const TOOLS = [['pen', 'Pen', 'pen'], ['highlight', 'Highlighter', 'highlighter'], ['eraser', 'Eraser', 'eraser'],
    ['lasso', 'Select and move', 'mouse-pointer-2'], ['pan', 'Pan', 'hand']];
  const toolButtons = TOOLS.map(([t, label, name]) => el('button', {
    type: 'button', class: 'btn icon', title: label, 'aria-label': label,
    onclick: () => { prefs.tool = t; selection = []; sync(); paint(); },
  }, ico(name, 18)));
  const colorInput = el('input', { type: 'color', 'aria-label': 'Ink color', value: prefs.color, oninput: e => { prefs.color = e.target.value; } });
  const widthLabel = el('span', { class: 'ink-value' });
  const zoomLabel = el('span', { class: 'ink-value' });
  const undoBtn = el('button', { type: 'button', class: 'btn icon', 'aria-label': 'Undo stroke', title: 'Undo stroke', onclick: () => undo() }, ico('undo-2', 17));
  const redoBtn = el('button', { type: 'button', class: 'btn icon', 'aria-label': 'Redo stroke', title: 'Redo stroke', onclick: () => redoStroke() }, ico('redo-2', 17));
  const top = el('div', { class: 'ink-toolbar' },
    el('span', { class: 'applet-name', title: "alphaNote, alphaCentaur's handwriting notebooks. It also runs on its own: node ink/server.mjs <folder> --open" }, 'alphaNote'),
    el('div', { class: 'button-group', role: 'group', 'aria-label': 'Tools' }, toolButtons),
    colorInput,
    el('button', { type: 'button', class: 'btn', title: 'Thinner stroke', 'aria-label': 'Thinner stroke', onclick: () => { prefs.width = Math.max(1, prefs.width - 1); sync(); } }, ico('minus', 14)),
    widthLabel,
    el('button', { type: 'button', class: 'btn', title: 'Thicker stroke', 'aria-label': 'Thicker stroke', onclick: () => { prefs.width = Math.min(12, prefs.width + 1); sync(); } }, ico('plus', 14)),
    el('span', { class: 'divider' }),
    undoBtn, redoBtn,
    el('div', { class: 'spacer' }),
    el('button', { type: 'button', class: 'btn', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => { prefs.zoom = Math.max(0.3, +(prefs.zoom - 0.1).toFixed(2)); sync(); } }, ico('minus', 14)),
    zoomLabel,
    el('button', { type: 'button', class: 'btn', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => { prefs.zoom = Math.min(1.5, +(prefs.zoom + 0.1).toFixed(2)); sync(); } }, ico('plus', 14)),
    el('button', { type: 'button', class: 'btn outline', title: 'Download this page as a PNG', onclick: () => {
      const a = document.createElement('a');
      a.download = 'notebook-page.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    } }, ico('download', 15), 'PNG'));

  // -------------------------------------------------------------- stage --
  const canvas = el('canvas', { width: W, height: H, 'aria-label': 'Notebook page' });
  const stage = el('div', { class: 'ink-stage' }, canvas);

  // ------------------------------------------------------ bottom toolbar --
  const prevBtn = el('button', { type: 'button', class: 'btn', 'aria-label': 'Previous page', title: 'Previous page', onclick: () => goTo(book.current - 1) }, ico('chevron-left', 16));
  const nextBtn = el('button', { type: 'button', class: 'btn', 'aria-label': 'Next page', title: 'Next page', onclick: () => goTo(book.current + 1) }, ico('chevron-right', 16));
  const pageLabel = el('span', { class: 'ink-page' });
  const addPageBtn = el('button', { type: 'button', class: 'btn outline', onclick: () => commit({
    ...book, current: book.pages.length, pages: [...book.pages, { id: crypto.randomUUID(), background: 'grid', strokes: [] }],
  }) }, ico('plus', 15), 'Page');
  const bgButtons = ['grid', 'ruled', 'blank'].map(b => el('button', { type: 'button', onclick: () => commit({
    ...book, pages: book.pages.map((p, i) => (i === book.current ? { ...p, background: b } : p)),
  }) }, b));
  const pdfInput = el('input', { type: 'file', accept: 'application/pdf', onchange: e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void addPdf(file);
  } });
  const pdfLabel = el('label', { class: 'import-action', title: 'Import a PDF as pages to write on' }, ico('upload', 14), 'PDF', pdfInput);
  const ocrBtn = el('button', { type: 'button', class: 'btn', onclick: () => void runOcr() });
  const bottom = el('div', { class: 'ink-toolbar bottom' },
    prevBtn, pageLabel, nextBtn, addPageBtn,
    el('div', { class: 'segmented', role: 'group', 'aria-label': 'Page background' }, bgButtons),
    el('div', { class: 'spacer' }),
    pdfLabel, ocrBtn);

  // ------------------------------------------------- notice, OCR result --
  const noticeBar = el('div', { class: 'ink-notice', role: 'alert', hidden: true });
  const ocrText = el('textarea', { 'aria-label': 'Recognized text', oninput: e => { ocr = e.target.value; } });
  const ocrPanel = el('div', { class: 'ocr-result', hidden: true },
    el('strong', {}, 'Recognition draft'),
    el('p', {}, 'Printed-text recognition; handwritten equations may be inaccurate. Your original ink stays unchanged.'),
    ocrText,
    el('button', { type: 'button', class: 'btn primary', onclick: () => onRecognized?.(ocr) }, 'Save separate transcription'));

  const root = el('div', { class: 'ink-workspace' }, top, stage, bottom, noticeBar, ocrPanel);
  container.append(root);

  // -------------------------------------------------------------- state --
  function sync() {
    for (const [i, b] of toolButtons.entries()) {
      const on = prefs.tool === TOOLS[i][0];
      b.classList.toggle('secondary', on);
      b.setAttribute('aria-pressed', String(on));
    }
    colorInput.value = prefs.color;
    widthLabel.textContent = String(prefs.width);
    zoomLabel.textContent = `${Math.round(prefs.zoom * 100)}%`;
    undoBtn.disabled = readOnly;
    redoBtn.disabled = !redo.length || readOnly;
    canvas.style.width = `${W * prefs.zoom}px`;
    canvas.style.height = `${H * prefs.zoom}px`;
    canvas.style.touchAction = prefs.tool === 'pan' ? 'pan-x pan-y' : 'none';
    canvas.style.cursor = readOnly ? 'default' : prefs.tool === 'pan' ? 'grab' : prefs.tool === 'lasso' ? 'default' : 'crosshair';
    prevBtn.disabled = !book.current;
    nextBtn.disabled = book.current >= book.pages.length - 1;
    pageLabel.textContent = `Page ${book.current + 1} of ${book.pages.length}`;
    addPageBtn.disabled = readOnly;
    for (const b of bgButtons) {
      b.setAttribute('aria-pressed', String(page().background === b.textContent));
      b.disabled = readOnly;
    }
    pdfLabel.hidden = readOnly;
    pdfInput.disabled = busy;
    pdfLabel.setAttribute('aria-disabled', String(busy));
    ocrBtn.disabled = busy;
    ocrBtn.replaceChildren(ico('scan-text', 16), busy ? 'Recognizing…' : 'Experimental OCR');
    noticeBar.hidden = !notice;
    noticeBar.textContent = notice;
    ocrPanel.hidden = !ocr;
    if (ocrText.value !== ocr) ocrText.value = ocr;
  }

  function commit(next) {
    book = next;
    onChange?.(JSON.stringify(next));
    sync();
    paint();
  }
  const withPage = fn => ({ ...book, pages: book.pages.map((pg, i) => (i === book.current ? fn(pg) : pg)) });
  function goTo(n) {
    if (n < 0 || n >= book.pages.length) return;
    selection = [];
    redo = [];
    commit({ ...book, current: n });
  }

  // ------------------------------------------------------------ drawing --
  function paint(draft = null) {
    const ctx = canvas.getContext('2d'), pg = page();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e5edf1';
    ctx.lineWidth = 1;
    if (pg.backgroundImage) {
      let image = images.get(pg.id);
      if (!image) {
        image = new Image();
        image.onload = () => { if (!destroyed) paint(drawing); };
        image.src = pg.backgroundImage;
        images.set(pg.id, image);
      }
      if (image.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, W, H);
    }
    if (!pg.backgroundImage && pg.background !== 'blank') {
      for (let y = 40; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      if (pg.background === 'grid')
        for (let x = 40; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    }
    for (const s of [...pg.strokes, ...(draft ? [draft] : [])]) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.tool === 'highlight' ? 0.28 : 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.points.length === 1) {
        ctx.beginPath();
        ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1], b = s.points[i];
        ctx.lineWidth = s.width * (0.4 + (b.p || 0.5));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (selection.includes(s.id)) {
        const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
        ctx.strokeStyle = '#059981';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) - Math.min(...xs) + 12, Math.max(...ys) - Math.min(...ys) + 12);
        ctx.setLineDash([]);
      }
    }
  }

  const point = e => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * W) / rect.width, y: ((e.clientY - rect.top) * H) / rect.height, p: e.pressure || 0.5 };
  };
  canvas.addEventListener('pointerdown', e => {
    // Only pens and mice draw: a resting palm or finger never leaves a mark.
    if (readOnly || prefs.tool === 'pan' || e.pointerType === 'touch') return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    if (prefs.tool === 'lasso') { dragStart = p; return; }
    if (prefs.tool === 'eraser') {
      commit(withPage(pg => ({ ...pg, strokes: pg.strokes.filter(s => !s.points.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 18)) })));
      return;
    }
    drawing = { id: crypto.randomUUID(), points: [p], color: prefs.color, width: prefs.tool === 'highlight' ? prefs.width * 5 : prefs.width, tool: prefs.tool };
    paint(drawing);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const samples = e.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [e]) drawing.points.push(point(sample));
    paint(drawing);
  });
  const up = e => {
    if (dragStart) {
      const a = dragStart, b = point(e);
      dragStart = null;
      if (selection.length) {
        const dx = b.x - a.x, dy = b.y - a.y, moving = new Set(selection);
        selection = [];
        commit(withPage(pg => ({ ...pg, strokes: pg.strokes.map(s => (moving.has(s.id) ? { ...s, points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) } : s)) })));
      } else {
        const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
        selection = page().strokes.filter(s => s.points.some(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)).map(s => s.id);
        paint();
      }
    }
    if (drawing) {
      const stroke = drawing;
      drawing = null;
      redo = [];
      commit(withPage(pg => ({ ...pg, strokes: [...pg.strokes, stroke] })));
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function undo() {
    const strokes = page().strokes;
    if (readOnly || !strokes.length) return;
    redo = [...redo, strokes.at(-1)];
    commit(withPage(pg => ({ ...pg, strokes: pg.strokes.slice(0, -1) })));
  }
  function redoStroke() {
    if (readOnly || !redo.length) return;
    const stroke = redo.at(-1);
    redo = redo.slice(0, -1);
    commit(withPage(pg => ({ ...pg, strokes: [...pg.strokes, stroke] })));
  }

  // --------------------------------------------------------- PDF and OCR --
  async function addPdf(file) {
    busy = true;
    notice = '';
    sync();
    try {
      const { importPdf } = await import('./pdf.js');
      const result = await importPdf(file);
      if (destroyed) return;
      commit({ ...book, current: book.pages.length, pages: [...book.pages, ...result.pages], sources: [...(book.sources || []), result.source] });
    } catch (e) {
      notice = e.message || 'The PDF could not be imported.';
    } finally {
      busy = false;
      if (!destroyed) sync();
    }
  }
  async function runOcr() {
    busy = true;
    ocr = '';
    sync();
    try {
      const { recognize } = await import('./ocr.js');
      const text = await recognize(canvas);
      ocr = text || 'No text recognized. Handwritten mathematics may need manual transcription.';
    } catch {
      ocr = 'Recognition could not load. Your ink is unchanged.';
    } finally {
      busy = false;
      if (!destroyed) sync();
    }
  }

  sync();
  paint();
  return {
    // A notebook's JSON; a new readOnly too, if given.
    load(content, options = {}) {
      if (typeof options.readOnly === 'boolean') readOnly = options.readOnly;
      book = parse(content);
      redo = [];
      selection = [];
      drawing = null;
      dragStart = null;
      notice = '';
      images.clear();
      sync();
      paint();
    },
    setReadOnly(value) { readOnly = !!value; sync(); },
    destroy() {
      destroyed = true;
      root.remove();
    },
  };
}
