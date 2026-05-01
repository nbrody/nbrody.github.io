import { WAYPOINTS } from './data.js';

const track = document.getElementById('track');
const trackWrapper = document.getElementById('track-wrapper');
const thumb = document.getElementById('thumb');
const objectEl = document.getElementById('object');
const nameEl = document.getElementById('name');
const sizeSciEl = document.getElementById('size-sci');
const sizeFriendlyEl = document.getElementById('size-friendly');
const descriptionEl = document.getElementById('description');
const domainEl = document.getElementById('domain');
const comparisonEl = document.getElementById('comparison');
const stage = document.getElementById('stage');

const logSizes = WAYPOINTS.map(w => Math.log10(w.size));
const minLog = Math.min(...logSizes);
const maxLog = Math.max(...logSizes);
const padTop = 0.6;     // space above the largest waypoint (top of slider)
const padBottom = 0.6;  // space below the smallest waypoint
const totalSpan = (maxLog - minLog) + padTop + padBottom;

// Slider increases downward visually toward smaller scales (so big things up top)
function logToTopPercent(log) {
  // 0% = top (largest), 100% = bottom (smallest)
  return ((maxLog + padTop) - log) / totalSpan * 100;
}

let currentIndex = WAYPOINTS.findIndex(w => w.name === 'Human');
if (currentIndex === -1) currentIndex = Math.floor(WAYPOINTS.length / 2);

// ---------- Build waypoint markers ----------
WAYPOINTS.forEach((w, i) => {
  const el = document.createElement('div');
  el.className = 'waypoint';
  el.dataset.idx = String(i);
  el.style.top = `${logToTopPercent(Math.log10(w.size))}%`;

  const dot = document.createElement('div');
  dot.className = 'dot';
  dot.style.background = w.color;
  dot.style.color = w.color;
  el.appendChild(dot);

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = w.name;
  el.appendChild(label);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    setIndex(i);
  });
  track.appendChild(el);
});

// ---------- Formatting ----------
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function toSuperscript(n) {
  return String(n)
    .split('')
    .map(c => (c === '-' ? '⁻' : SUP[parseInt(c, 10)]))
    .join('');
}

function formatSci(size) {
  if (size === 0) return '0 m';
  const exp = Math.floor(Math.log10(size));
  const mantissa = size / Math.pow(10, exp);
  return `${mantissa.toFixed(2)} × 10${toSuperscript(exp)} m`;
}

function formatFriendly(size) {
  if (size >= 9.46e15) {
    const ly = size / 9.46e15;
    return `≈ ${formatNumber(ly)} light-years`;
  }
  if (size >= 1.5e11) {
    const au = size / 1.496e11;
    return `≈ ${formatNumber(au)} AU`;
  }
  if (size >= 1000) {
    return `≈ ${formatNumber(size / 1000)} km`;
  }
  if (size >= 1) {
    return `≈ ${formatNumber(size)} m`;
  }
  if (size >= 1e-3) {
    return `≈ ${formatNumber(size * 1000)} mm`;
  }
  if (size >= 1e-6) {
    return `≈ ${formatNumber(size * 1e6)} μm`;
  }
  if (size >= 1e-9) {
    return `≈ ${formatNumber(size * 1e9)} nm`;
  }
  if (size >= 1e-12) {
    return `≈ ${formatNumber(size * 1e12)} pm`;
  }
  return `≈ ${formatNumber(size * 1e15)} fm`;
}

function formatNumber(v) {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function formatRatio(r) {
  if (r >= 1e6) {
    const exp = Math.floor(Math.log10(r));
    const mant = r / Math.pow(10, exp);
    return `${mant.toFixed(1)}×10${toSuperscript(exp)}`;
  }
  if (r >= 1000) return `${Math.round(r).toLocaleString()}`;
  if (r >= 10) return `${r.toFixed(0)}`;
  return `${r.toFixed(1)}`;
}

// ---------- Render ----------
function setIndex(i, opts = {}) {
  i = Math.max(0, Math.min(WAYPOINTS.length - 1, i));
  if (i === currentIndex && !opts.force) return;
  currentIndex = i;
  render();
  scrollWaypointIntoView(i);
}

function scrollWaypointIntoView(i) {
  const wp = track.querySelector(`.waypoint[data-idx="${i}"]`);
  if (!wp) return;
  const wrapperRect = trackWrapper.getBoundingClientRect();
  const wpRect = wp.getBoundingClientRect();
  const margin = 80;
  if (wpRect.top < wrapperRect.top + margin || wpRect.bottom > wrapperRect.bottom - margin) {
    wp.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function render() {
  const w = WAYPOINTS[currentIndex];

  // Thumb
  thumb.style.top = `${logToTopPercent(Math.log10(w.size))}%`;
  thumb.style.borderColor = w.color;
  thumb.style.background = w.color + '22';

  // Active marker
  document.querySelectorAll('.waypoint').forEach((el, i) => {
    el.classList.toggle('active', i === currentIndex);
    if (i === currentIndex) {
      const dot = el.querySelector('.dot');
      if (dot) dot.style.color = w.color;
    }
  });

  // Object swap with fade
  objectEl.classList.add('fading');
  setTimeout(() => {
    objectEl.textContent = w.emoji;
    objectEl.classList.remove('fading');
  }, 180);

  stage.style.color = w.color;

  nameEl.textContent = w.name;
  sizeSciEl.textContent = formatSci(w.size);
  sizeFriendlyEl.textContent = formatFriendly(w.size);
  descriptionEl.textContent = w.description;

  domainEl.textContent = w.category;
  domainEl.style.color = w.color;
  domainEl.style.borderColor = w.color + '55';
  domainEl.style.background = w.color + '15';

  // Comparison line
  comparisonEl.textContent = comparisonText(currentIndex);
}

function comparisonText(i) {
  const w = WAYPOINTS[i];
  if (i === 0) return 'smaller than anything we can directly probe';
  if (i === WAYPOINTS.length - 1) return 'as far as we can possibly see';
  const prev = WAYPOINTS[i - 1];
  const next = WAYPOINTS[i + 1];
  const upRatio = w.size / prev.size;
  const downRatio = next.size / w.size;
  return `${formatRatio(upRatio)}× ${prev.name}   ·   1∕${formatRatio(downRatio)} of ${next.name}`;
}

// ---------- Wheel navigation ----------
// Big things up top, small things at bottom. Wheel down = move toward smaller.
let wheelAccum = 0;
let wheelClearTimer = null;
window.addEventListener('wheel', (e) => {
  const inWrapper = e.target.closest('.track-wrapper');
  if (inWrapper) {
    const canScroll = inWrapper.scrollHeight > inWrapper.clientHeight + 1;
    if (canScroll) return;
  }
  e.preventDefault();
  wheelAccum += e.deltaY;
  const threshold = 60;
  while (wheelAccum >= threshold) {
    setIndex(currentIndex - 1);
    wheelAccum -= threshold;
  }
  while (wheelAccum <= -threshold) {
    setIndex(currentIndex + 1);
    wheelAccum += threshold;
  }
  clearTimeout(wheelClearTimer);
  wheelClearTimer = setTimeout(() => { wheelAccum = 0; }, 200);
}, { passive: false });

// ---------- Keyboard ----------
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'PageDown') {
    e.preventDefault();
    setIndex(currentIndex - 1);
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'PageUp') {
    e.preventDefault();
    setIndex(currentIndex + 1);
  } else if (e.key === 'Home') {
    e.preventDefault();
    setIndex(WAYPOINTS.length - 1); // largest
  } else if (e.key === 'End') {
    e.preventDefault();
    setIndex(0); // smallest
  }
});

// ---------- Drag the slider track ----------
let dragStartY = null;
let dragging = false;

function indexFromClientY(clientY) {
  const rect = track.getBoundingClientRect();
  const pct = (clientY - rect.top) / rect.height;
  // pct 0 = top = largest. Convert to log:
  const log = (maxLog + padTop) - pct * totalSpan;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const d = Math.abs(logSizes[i] - log);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}

trackWrapper.addEventListener('mousedown', (e) => {
  // Don't intercept clicks on waypoints — let their click handler run.
  if (e.target.closest('.waypoint')) return;
  // Don't initiate drag from the native scrollbar (right edge of wrapper).
  const rect = trackWrapper.getBoundingClientRect();
  if (e.clientX > rect.right - 16) return;
  e.preventDefault();
  dragStartY = e.clientY;
  dragging = true;
  setIndex(indexFromClientY(e.clientY));
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  setIndex(indexFromClientY(e.clientY));
});
window.addEventListener('mouseup', () => {
  dragStartY = null;
  dragging = false;
});

// Touch
trackWrapper.addEventListener('touchstart', (e) => {
  if (e.target.closest('.waypoint')) return;
  if (e.touches.length === 1) {
    dragStartY = e.touches[0].clientY;
    dragging = true;
    setIndex(indexFromClientY(e.touches[0].clientY));
  }
}, { passive: true });
trackWrapper.addEventListener('touchmove', (e) => {
  if (!dragging || e.touches.length !== 1) return;
  e.preventDefault();
  setIndex(indexFromClientY(e.touches[0].clientY));
}, { passive: false });
window.addEventListener('touchend', () => {
  dragStartY = null;
  dragging = false;
});

// ---------- Boot ----------
render();
