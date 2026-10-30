// Experimental OCR: printed text from a page, with tesseract.js. The library
// and its worker are vendored; the recognition core (WebAssembly) and the
// English data come from tesseract's default CDN the first time it runs.
let loading = null;
function library() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/tesseract/tesseract.min.js', import.meta.url).href;
    script.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('tesseract.js did not load.')));
    script.onerror = () => { loading = null; reject(new Error('tesseract.js did not load.')); };
    document.head.append(script);
  });
  return loading;
}

// The text tesseract reads from a canvas ('' when it finds none).
export async function recognize(canvas) {
  const { createWorker } = await library();
  // A same-origin worker file, not a blob: simpler under strict CSPs.
  const worker = await createWorker('eng', 1, {
    workerPath: new URL('../vendor/tesseract/worker.min.js', import.meta.url).href,
    workerBlobURL: false,
  });
  try {
    const result = await worker.recognize(canvas);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}
