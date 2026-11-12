(() => {
  const input = document.getElementById('text-input');
  const count = document.getElementById('character-count');
  const button = document.getElementById('generate');
  const bias = document.getElementById('bias');
  const biasValue = document.getElementById('bias-value');
  bias.addEventListener('input', () => { biasValue.value = Number(bias.value).toFixed(1); });
  const result = document.getElementById('result');
  const empty = document.getElementById('empty-state');
  const status = document.getElementById('status');
  const state = document.getElementById('preview-state');
  const paper = document.getElementById('paper');
  const download = document.getElementById('download');
  let resultUrl = null;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function updateCount() { count.textContent = `${input.value.length} / 200`; }
  input.addEventListener('input', updateCount);
  updateCount();

  // The model supplies absolute points in character-height units, grouped by line.
  // A lift ends the current stroke. The SVG is generated locally from numbers only.
  function strokesToSvg(lines) {
    if (lines.length && !Array.isArray(lines[0])) lines = [lines];
    const clean = lines.map(line => line.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    if (!clean.some(line => line.length)) throw new Error('The model returned an empty sample. Please try again.');
    const scale = 36, margin = 18, lineGap = 28;
    let yOffset = margin, maxWidth = 1;
    const paths = [];
    for (const line of clean) {
      if (!line.length) { yOffset += scale * 1.5; continue; }
      const minX = Math.min(...line.map(p => p.x)), maxX = Math.max(...line.map(p => p.x));
      const minY = Math.min(...line.map(p => p.y)), maxY = Math.max(...line.map(p => p.y));
      maxWidth = Math.max(maxWidth, (maxX - minX) * scale);
      let path = '', penUp = true;
      for (const point of line) {
        const x = ((point.x - minX) * scale + margin).toFixed(2);
        const y = ((point.y - minY) * scale + yOffset).toFixed(2);
        path += `${penUp ? 'M' : 'L'}${x} ${y} `;
        penUp = Boolean(point.lift);
      }
      paths.push(`<path d="${path}"/>`);
      yOffset += Math.max((maxY - minY) * scale, scale) + lineGap;
    }
    const width = Math.ceil(maxWidth + 2 * margin), height = Math.ceil(yOffset - lineGap + margin);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#344b3e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</g></svg>`;
  }

  button.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) { setStatus('Please enter some text first.', true); input.focus(); return; }
    if (/[^\x20-\x7e\n\r]/.test(text)) { setStatus('Please use basic English letters, numbers, and punctuation for now.', true); input.focus(); return; }
    if (typeof window.generateHandwriting !== 'function') {
      setStatus('The model is not available right now. Please try again later.', true);
      state.textContent = 'MODEL UNAVAILABLE';
      return;
    }
    button.disabled = true;
    button.querySelector('span').textContent = 'Writing…';
    paper.setAttribute('aria-busy', 'true');
    state.textContent = 'WORKING ON IT';
    setStatus('Preparing the model. The first download may take a little while.');
    try {
      const lines = await window.generateHandwriting(text, {
        bias: Number(bias.value),
        onProgress: ({completed, total}) => {
          if (Number.isFinite(completed) && Number.isFinite(total)) {
            setStatus(`Writing: ${completed} of ${total} parts complete…`);
          }
        }
      });
      const svg = strokesToSvg(lines);
      const nextUrl = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = nextUrl;
      result.src = resultUrl;
      result.hidden = false;
      empty.hidden = true;
      download.href = resultUrl;
      download.hidden = false;
      state.textContent = 'FRESHLY WRITTEN';
      setStatus('Every sample is different. Check the result for missing or changed characters.');
    } catch (error) {
      console.error(error);
      state.textContent = 'PLEASE TRY AGAIN';
      setStatus(error && error.message ? error.message : 'Something went wrong. Please try again.', true);
    } finally {
      paper.setAttribute('aria-busy', 'false');
      button.disabled = false;
      button.querySelector('span').textContent = 'Write it out';
    }
  });
})();
