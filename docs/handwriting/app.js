(() => {
  const input = document.getElementById('text-input');
  const count = document.getElementById('character-count');
  const button = document.getElementById('generate');
  const bias = document.getElementById('bias');
  const modelSelect = document.getElementById('model-select');
  const repairLeadingE = document.getElementById('repair-leading-e');
  const biasValue = document.getElementById('bias-value');
  bias.addEventListener('input', () => { biasValue.value = Number(bias.value).toFixed(1); });
  const result = document.getElementById('result');
  const empty = document.getElementById('empty-state');
  const status = document.getElementById('status');
  const state = document.getElementById('preview-state');
  const paper = document.getElementById('paper');
  const download = document.getElementById('download');
  const thickness = document.getElementById('thickness');
  const thicknessValue = document.getElementById('thickness-value');
  const texture = document.getElementById('texture');
  const inkColor = document.getElementById('ink-color');
  const backgroundColor = document.getElementById('background-color');
  let resultUrl = null;
  let lastLines = null;

  function updateAppearance() {
    thicknessValue.value = Number(thickness.value).toFixed(1);
    paper.style.backgroundColor = backgroundColor.value;
    if (lastLines) render(lastLines);
  }
  for (const control of [thickness, texture, inkColor, backgroundColor]) {
    control.addEventListener('input', updateAppearance);
    if (control.tagName === 'SELECT') control.addEventListener('change', updateAppearance);
  }

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
    const ink = /^#[0-9a-f]{6}$/i.test(inkColor.value) ? inkColor.value : '#344b3e';
    const background = /^#[0-9a-f]{6}$/i.test(backgroundColor.value) ? backgroundColor.value : '#fffefa';
    const strokeWidth = Math.max(0.5, Math.min(5, Number(thickness.value) || 1.8));
    const grain = texture.value === 'pencil' ? {frequency: '0.72', values: '0.08 0.35 0.72 1'}
      : texture.value === 'dry' ? {frequency: '0.30', values: '0 0.10 0.65 1'} : null;
    // The filter clips the colored strokes with a deterministic noise alpha, so the
    // texture travels with the SVG and doesn't change when the image is redrawn.
    const defs = grain ? `<defs><filter id="grain" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${grain.frequency}" numOctaves="3" seed="4" result="noise"/><feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0" result="alphaNoise"/><feComponentTransfer in="alphaNoise" result="grain"><feFuncA type="discrete" tableValues="${grain.values}"/></feComponentTransfer><feComposite in="SourceGraphic" in2="grain" operator="in"/></filter></defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defs}<rect width="100%" height="100%" fill="${background}"/><g fill="none" stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${grain ? ' filter="url(#grain)"' : ''}>${paths.join('')}</g></svg>`;
  }

  function render(lines) {
    const svg = strokesToSvg(lines);
    const nextUrl = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = nextUrl;
    result.src = resultUrl;
    result.hidden = false;
    empty.hidden = true;
    download.href = resultUrl;
    download.hidden = false;
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
    modelSelect.disabled = true;
    repairLeadingE.disabled = true;
    button.querySelector('span').textContent = 'Generating…';
    paper.setAttribute('aria-busy', 'true');
    state.textContent = 'GENERATING';
    setStatus('Loading model…');
    try {
      let repairResult = null;
      const lines = await window.generateHandwriting(text, {
        bias: Number(bias.value),
        model: modelSelect.value,
        repairLeadingE: repairLeadingE.checked,
        onRepair: result => { repairResult = result; },
        onProgress: ({completed, total}) => {
          if (Number.isFinite(completed) && Number.isFinite(total)) {
            setStatus(`Generated ${completed} of ${total} parts…`);
          }
        }
      });
      render(lines);
      lastLines = lines;
      state.textContent = 'DONE';
      setStatus(repairResult ? (repairResult.applied
        ? 'Leading E repaired. Check the remaining characters.'
        : 'Leading E repair was not applied. Check the output for errors.')
        : 'Check for missing or changed characters.');
    } catch (error) {
      console.error(error);
      state.textContent = 'PLEASE TRY AGAIN';
      setStatus(error && error.message ? error.message : 'Something went wrong. Please try again.', true);
    } finally {
      paper.setAttribute('aria-busy', 'false');
      button.disabled = false;
      modelSelect.disabled = false;
      repairLeadingE.disabled = false;
      button.querySelector('span').textContent = 'Generate';
    }
  });
})();
