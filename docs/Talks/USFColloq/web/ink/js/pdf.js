// PDF pages as notebook pages to write on. Loaded only when a PDF is chosen.
// Each page is drawn on a white 1000×1400 canvas and kept as a JPEG
// background; the original PDF goes into the notebook's `sources`.
let pdfjs = null;
async function library() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

export async function importPdf(file) {
  if (file.size > 2_000_000) throw new Error('For this version, import a PDF smaller than 2 MB.');
  const { getDocument } = await library();
  const bytes = new Uint8Array(await file.arrayBuffer()), original = bytes.slice();
  const task = getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href });
  try {
    const doc = await task.promise;
    if (doc.numPages > 20) throw new Error('Import at most 20 PDF pages at a time.');
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 1400;
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 1000, 1400);
      await page.render({ canvas, canvasContext: context, viewport: page.getViewport({ scale: Math.min(1000 / base.width, 1400 / base.height) }) }).promise;
      pages.push({ id: crypto.randomUUID(), background: 'pdf', backgroundImage: canvas.toDataURL('image/jpeg', 0.8), sourcePage: n, strokes: [] });
    }
    let binary = '';
    for (let i = 0; i < original.length; i += 16384) binary += String.fromCharCode(...original.subarray(i, i + 16384));
    return { source: { name: file.name, mimeType: 'application/pdf', base64: btoa(binary) }, pages };
  } finally {
    await task.destroy();
  }
}
