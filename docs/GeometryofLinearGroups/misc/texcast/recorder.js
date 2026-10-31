// texcast recorder: type LaTeX, capture steps or keystrokes, get a .texcast file.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const root = $('recorder');
  if (!root) return;

  const input = $('rec-input');
  const preview = $('rec-preview');
  const errorEl = $('rec-error');
  const toggleBtn = $('rec-toggle');
  const stepBtn = $('rec-step');
  const captionInput = $('rec-caption');
  const status = $('rec-status');
  const hint = $('rec-hint');
  const capPauses = $('rec-cap');
  const modeBtns = [...root.querySelectorAll('[data-mode]')];
  const result = $('rec-result');
  const player = $('rec-player');
  const fileText = $('rec-text');
  const fileError = $('rec-text-error');
  const sizeEl = $('rec-size');
  const downloadBtn = $('rec-download');

  const MAX_PAUSE = 2;
  const MIN_STEP = 1.2; // seconds between steps, so each morph has room to play
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const stepKey = isMac ? '⌘ Enter' : 'Ctrl Enter';
  let mode = 'steps';
  let rec = null;
  let clock = 0;

  function renderPreview() {
    try {
      katex.render(input.value, preview, {
        displayMode: true,
        throwOnError: true,
        strict: 'ignore',
        trust: Texcast.trust,
        macros: { ...Texcast.macros },
      });
      errorEl.textContent = '';
      preview.classList.remove('is-stale');
    } catch (err) {
      errorEl.textContent = String(err.message || err).replace(/^KaTeX parse error: /, '');
      preview.classList.add('is-stale');
    }
  }

  // Seconds since the last event, rounded to 10 ms, with long pauses shortened.
  function delay() {
    const now = performance.now();
    let d = (now - rec.last) / 1000;
    rec.last = now;
    if (capPauses.checked) d = Math.min(d, MAX_PAUSE);
    return Math.round(d * 100) / 100;
  }

  function onInput() {
    renderPreview();
    if (!rec || rec.mode !== 'keys') return;
    const a = rec.prev;
    const b = input.value;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    rec.events.push([delay(), 'edit', p, a.length - p - s, b.slice(p, b.length - s)]);
    rec.prev = b;
    paintStatus();
  }

  function start() {
    rec = { mode, last: performance.now(), began: performance.now(), events: [], prev: input.value, steps: 0 };
    if (input.value.trim()) {
      rec.events.push([0, 'show', input.value]);
      rec.steps = 1;
    }
    const caption = captionInput.value.trim();
    if (caption) {
      rec.events.push([0, 'caption', caption]);
      captionInput.value = '';
    }
    root.classList.add('recording');
    toggleBtn.lastElementChild.textContent = 'Stop';
    stepBtn.disabled = mode !== 'steps';
    captionInput.disabled = false;
    modeBtns.forEach((b) => (b.disabled = true));
    hint.innerHTML =
      mode === 'steps'
        ? `Edit the formula, then press <kbd>${stepKey}</kbd> for the next step.`
        : 'Every keystroke is being recorded.';
    clock = setInterval(paintStatus, 250);
    paintStatus();
    input.focus();
  }

  function addStep(flash = true) {
    if (!rec || rec.mode !== 'steps') return;
    const caption = captionInput.value.trim();
    const d = rec.steps ? Math.max(MIN_STEP, delay()) : delay();
    if (caption) {
      rec.events.push([d, 'caption', caption]);
      captionInput.value = '';
    }
    if (input.value !== rec.prev || !rec.steps) {
      rec.events.push([caption ? 0 : d, 'show', input.value]);
      rec.prev = input.value;
      rec.steps++;
    }
    if (flash) {
      stepBtn.classList.remove('flash');
      void stepBtn.offsetWidth;
      stepBtn.classList.add('flash');
    }
    paintStatus();
  }

  function addCaption() {
    if (!rec) return;
    rec.events.push([delay(), 'caption', captionInput.value.trim()]);
    captionInput.value = '';
    paintStatus();
  }

  function stop() {
    if (rec.mode === 'steps' && input.value !== rec.prev) addStep(false);
    const header = { version: 1, title: 'My recording', morph: rec.mode === 'keys' ? 0.14 : 0.8 };
    if (rec.mode === 'keys') header.source = true;
    const text = [JSON.stringify(header), ...rec.events.map((e) => JSON.stringify(e))].join('\n') + '\n';
    rec = null;
    clearInterval(clock);
    root.classList.remove('recording');
    toggleBtn.lastElementChild.textContent = 'Record';
    stepBtn.disabled = true;
    captionInput.disabled = true;
    modeBtns.forEach((b) => (b.disabled = false));
    paintHint();
    status.textContent = '';
    result.hidden = false;
    fileText.value = text;
    loadFile(text, true);
  }

  function paintStatus() {
    if (!rec) return;
    const secs = Math.floor((performance.now() - rec.began) / 1000);
    const count = rec.mode === 'steps' ? `${rec.steps} step${rec.steps === 1 ? '' : 's'}` : `${rec.events.length} events`;
    status.textContent = `● ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · ${count}`;
  }

  function paintHint() {
    hint.innerHTML =
      mode === 'steps'
        ? `Press <kbd>${stepKey}</kbd> to record the first step.`
        : 'Press Record, then type. Every keystroke is saved.';
  }

  async function loadFile(text, scroll) {
    try {
      Texcast.parse(text);
    } catch (err) {
      fileError.textContent = err.message;
      return;
    }
    fileError.textContent = '';
    const p = player.load(text);
    if (scroll) result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const gz = await Texcast.gzipSize(text);
    sizeEl.textContent = `${Texcast.formatBytes(new Blob([text]).size)}${gz ? ` · ${Texcast.formatBytes(gz)} gzipped` : ''}`;
    return p;
  }

  // ---- wiring ----

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    if (!rec && mode === 'steps') start();
    else addStep();
  });
  captionInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) addStep();
    else addCaption();
  });
  toggleBtn.addEventListener('click', () => (rec ? stop() : start()));
  stepBtn.addEventListener('click', () => {
    addStep();
    input.focus();
  });
  modeBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      paintHint();
    })
  );

  let editTimer = 0;
  fileText.addEventListener('input', () => {
    clearTimeout(editTimer);
    editTimer = setTimeout(() => loadFile(fileText.value), 450);
  });
  downloadBtn.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([fileText.value], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording.texcast';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  paintHint();
  renderPreview();
})();
