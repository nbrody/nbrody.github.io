/* Returns one array of absolute pen points per line; lift is after the point. */
window.generateHandwriting = function generateHandwriting(text, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('inference-worker.js?v=3');
    worker.onmessage = ({data}) => {
      if (data.type === 'done') { worker.terminate(); resolve(data.lines); }
      else if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
      else if (options.onProgress) options.onProgress(data);
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Could not start the handwriting model.')); };
    worker.postMessage({text, bias: options.bias, model: options.model ?? 'original'});
  });
};
