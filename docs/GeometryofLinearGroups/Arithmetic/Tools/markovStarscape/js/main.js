'use strict';

const canvas = document.getElementById('sky');
const tooltip = document.getElementById('tooltip');
const statusEl = document.getElementById('status');
const selCard = document.getElementById('selCard');
const field = new Starfield(canvas);

const state = {
  vid: 'k2',
  M: VARIETIES.k2.M,
  depth: 0,
  ps: null,
  cache: new Map(),   // vid -> {ps, depth, M}
  busy: false,
};

function variety() { return VARIETIES[state.vid]; }

// ---------- real-locus dust ----------
function makeDust(v, M) {
  const xs = [], flags = [];
  const push = (a, b, c) => {
    xs.push(a, b, c);
    flags.push(Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) <= 2 ? 1 : 0);
  };
  if (v.kind === 'markov') {
    const n = 190, k = v.k;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = -M + 2 * M * (i + 0.5) / n;
        const b = -M + 2 * M * (j + 0.5) / n;
        const D = a * a * b * b - 4 * (a * a + b * b) + 4 * k;
        if (D < 0) continue;
        const s = Math.sqrt(D);
        for (const c of [(a * b + s) / 2, (a * b - s) / 2]) {
          if (Math.abs(c) > M) continue;
          push(a, b, c); push(a, c, b); push(c, a, b);
        }
      }
    }
  } else if (v.kind === 'trefoil' || v.kind === 'fig8') {
    const n = 2600;
    for (let i = 0; i < n; i++) {
      const t = -M + 2 * M * (i + 0.5) / n;
      const zp = t * t - 2;
      if (Math.abs(zp) <= M) push(t, t, zp);              // abelian parabola
      if (v.kind === 'trefoil') push(t, t, 1);            // nonabelian line
      else {
        const D = (t * t - 1) * (t * t - 5);
        if (D >= 0) {
          const s = Math.sqrt(D);
          for (const z of [(t * t + 1 + s) / 2, (t * t + 1 - s) / 2])
            if (Math.abs(z) <= M) push(t, t, z);
        }
      }
    }
  } else if (v.kind === 'whitehead') {
    // quadratic in y for fixed (x, z); the x<->y mirror grid for coverage
    const n = 240;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = -M + 2 * M * (i + 0.5) / n;
        const z = -M + 2 * M * (j + 0.5) / n;
        if (Math.abs(z) < 1e-6) continue;
        const D = x * x * (z * z + 1) * (z * z + 1) - 4 * z * z * (x * x + z * z - 2);
        if (D < 0) continue;
        const s = Math.sqrt(D);
        for (const y of [(x * (z * z + 1) + s) / (2 * z), (x * (z * z + 1) - s) / (2 * z)]) {
          if (Math.abs(y) > M) continue;
          push(x, y, z); push(y, x, z);
        }
      }
    }
    const nl = 900;   // the coordinate-axis lines (t,0,0), (0,t,0)
    for (let i = 0; i < nl; i++) {
      const t = -M + 2 * M * (i + 0.5) / nl;
      push(t, 0, 0); push(0, t, 0);
    }
  }
  return { dust: new Float32Array(xs), flags: new Uint8Array(flags) };
}

// ---------- generation ----------
function regenerate(fresh) {
  if (state.busy) return;
  state.busy = true;
  document.getElementById('deepen').disabled = true;
  let ps = state.ps;
  if (fresh || !ps) {
    ps = state.ps = new PointSet(variety(), state.M, H_CAP, MAX_ORBITS);
    state.depth = 0;
  }
  const steps = generationSteps(ps, state.depth);
  let idx = 0;
  const runNext = () => {
    if (idx < steps.length) {
      statusEl.textContent = steps[idx].label;
      setTimeout(() => {
        try { steps[idx].run(); } catch (e) { console.error(e); }
        idx++;
        runNext();
      }, 25);
    } else {
      statusEl.textContent = 'building the sky…';
      setTimeout(() => {
        const d = makeDust(variety(), state.M);
        field.setData(ps.list, d.dust, d.flags, state.M, variety().syms);
        field.render('high');
        const capped = ps.capped ? ' (capped)' : '';
        statusEl.textContent =
          `${ps.list.length.toLocaleString()} orbits · ${field.count.toLocaleString()} stars${capped}`;
        state.busy = false;
        document.getElementById('deepen').disabled = state.depth >= 3;
        state.cache.set(state.vid, { ps, depth: state.depth, M: state.M });
        if (twinkleOn) startTwinkle();   // re-root the wave in the new point set
      }, 25);
    }
  };
  runNext();
}

// ---------- selection ----------
function coordsOfImage(orbit, opIdx) {
  return applyOp(orbit.fr, field.symOps[opIdx]);
}

function texTriple(fr) {
  return `\\left(${ftex(fr[0])},\\ ${ftex(fr[1])},\\ ${ftex(fr[2])}\\right)`;
}
function strTriple(fr) {
  return `(${fstr(fr[0])}, ${fstr(fr[1])}, ${fstr(fr[2])})`;
}

function pointKind(coords, floats) {
  const v = variety();
  const onCompact = floats.every(u => Math.abs(u) <= 2 + 1e-12);
  const integral = coords.every(f => f.d === 1n);
  if (v.kind === 'trefoil' || v.kind === 'fig8') {
    const abelian = Feq(coords[2], Fsub(Fmul(coords[0], coords[0]), F2));
    const parts = [];
    if (integral) parts.push('integral');
    parts.push(abelian ? 'abelian (reducible) character' : 'irreducible character');
    if (onCompact && !abelian) parts.push('SU(2)-type');
    return parts.join(' · ');
  }
  if (integral)
    return state.vid === 'k0' ? '3 × Markov triple — integral point' : 'integral point';
  return onCompact ? 'SU(2)-type character (compact part)' : 'character on an unbounded sheet';
}

function selectPoint(coords) {
  const floats = coords.map(fnum);
  const v = variety();
  field.selected = { coords, floats };
  let partners = [], labels = [];
  if (v.kind === 'markov') {
    partners = vietaPartners(coords);
    labels = ['x \\mapsto yz-x', 'y \\mapsto xz-y', 'z \\mapsto xy-z'];
  } else if (v.kind === 'whitehead') {
    partners = whiteheadFlipPartners(coords);
    labels = ['x\\text{-flip}', 'y\\text{-flip}'];
  }
  field.partnerFloats = partners.map(p => p.map(fnum));
  for (const p of partners) state.ps.tryAdd(p[0], p[1], p[2], true);

  const H = Math.max(...coords.map(f => Number(fheight(f))));
  let html = `<div class="sel-title">Selected character</div>
    <div class="sel-math">$${texTriple(coords)}$</div>
    <div class="sel-row">$\\operatorname{tr}\\rho(a)=${ftex(coords[0])},\\ \\operatorname{tr}\\rho(b)=${ftex(coords[1])},\\ \\operatorname{tr}\\rho(ab)=${ftex(coords[2])}$</div>
    <div class="sel-row muted">height ${H.toLocaleString()} · ${pointKind(coords, floats)}</div>`;
  if (partners.length) {
    html += `<div class="sel-sub">${v.kind === 'markov'
      ? 'Vieta partners (mapping class group moves)' : 'quadratic flip partners'}</div>`;
    partners.forEach((p, i) => {
      html += `<button class="partner" data-i="${i}">$${labels[i]}$&nbsp;→&nbsp;${strTriple(p)}</button>`;
    });
  }
  selCard.innerHTML = html;
  selCard.classList.remove('hidden');
  selCard.querySelectorAll('.partner').forEach(btn => {
    btn.addEventListener('click', () => selectPoint(partners[+btn.dataset.i]));
  });
  if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([selCard]).catch(() => {});
  field.render('high');
  if (twinkleOn) startTwinkle();   // re-root the wave at the new basepoint
}

function clearSelection() {
  field.selected = null;
  field.partnerFloats = [];
  selCard.classList.add('hidden');
  field.render('high');
}

// ---------- twinkle: a wave traveling out the Markov tree ----------
let twinkleOn = false, twinkleAnim = null, twinkleT0 = 0;

function waveName() {
  const kind = variety().kind;
  if (kind === 'markov') return 'Vieta wave';
  if (kind === 'whitehead') return 'flip wave';
  return 'height wave (log₂ H shells)';
}

function startTwinkle() {
  if (!state.ps || !state.ps.list.length) { stopTwinkle(); return; }
  const maxGen = computeGens(state.ps);
  let g0 = 0, label = 'the tree roots';
  if (field.selected) {
    const o = state.ps.map.get(canonicalKeyOf(state.ps, field.selected.coords));
    if (o) {
      if (o.gen === undefined) computeGens(state.ps);
      g0 = o.gen;
      label = `${strTriple(field.selected.coords)} (generation ${g0})`;
    }
  }
  const list = state.ps.list;
  const depths = new Int32Array(list.length);
  let maxD = 1;
  for (let i = 0; i < list.length; i++) {
    const d = Math.abs(list[i].gen - g0);
    depths[i] = d;
    if (d > maxD) maxD = d;
  }
  field.twinkle = { depths, maxD };
  statusEl.textContent = `${waveName()} out from ${label} · generations 0…${maxGen}`;
  twinkleT0 = performance.now();
  cancelAnimationFrame(twinkleAnim);
  const loop = now => {
    if (!twinkleOn) return;
    field.twinkleTime = (now - twinkleT0) / 1000;
    field.render('anim');
    twinkleAnim = requestAnimationFrame(loop);
  };
  twinkleAnim = requestAnimationFrame(loop);
}

function stopTwinkle() {
  cancelAnimationFrame(twinkleAnim);
  field.twinkle = null;
  field.twinkleTime = 0;
  if (state.ps) statusEl.textContent =
    `${state.ps.list.length.toLocaleString()} orbits · ${field.count.toLocaleString()} stars`;
  field.render('high');
}

// ---------- interaction ----------
let dragging = false, panning = false, lastX = 0, lastY = 0, moved = false;
let renderTimer = null;
function scheduleHigh() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => field.render('high'), 140);
}

canvas.addEventListener('mousedown', e => {
  dragging = true;
  panning = e.shiftKey || e.button === 2;
  moved = false;
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('mousemove', e => {
  if (dragging) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    lastX = e.clientX; lastY = e.clientY;
    if (panning) { field.panX += dx; field.panY += dy; }
    else { field.yaw += dx * 0.008; field.pitch = Math.max(-1.55, Math.min(1.55, field.pitch + dy * 0.008)); }
    if (!twinkleOn) { field.render('low'); scheduleHigh(); }  // anim loop repaints anyway
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const hit = field.pick(mx, my);
  if (hit) {
    const o = field.orbits[field.orbIdx[hit.i]];
    const c = coordsOfImage(o, field.opIdx[hit.i]);
    tooltip.textContent = `${strTriple(c)}   H = ${o.H.toLocaleString()}`;
    tooltip.style.left = (mx + 14) + 'px';
    tooltip.style.top = (my - 8) + 'px';
    tooltip.classList.add('show');
    canvas.style.cursor = 'pointer';
  } else {
    tooltip.classList.remove('show');
    canvas.style.cursor = 'grab';
  }
});
window.addEventListener('mouseup', e => {
  if (!dragging) return;
  dragging = false;
  if (!moved && e.target === canvas) {
    const rect = canvas.getBoundingClientRect();
    const hit = field.pick(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) {
      const o = field.orbits[field.orbIdx[hit.i]];
      selectPoint(coordsOfImage(o, field.opIdx[hit.i]));
    } else clearSelection();
  }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left - rect.width / 2;
  const my = e.clientY - rect.top - rect.height / 2;
  const f = Math.exp(-e.deltaY * 0.0015);
  field.panX = mx - (mx - field.panX) * f;
  field.panY = my - (my - field.panY) * f;
  field.zoom *= f;
  if (!twinkleOn) { field.render('low'); scheduleHigh(); }
}, { passive: false });

// ---------- controls ----------
document.querySelectorAll('input[name="component"]').forEach(r => {
  r.addEventListener('change', () => {
    if (state.busy) return;
    state.vid = r.value;
    clearSelection();
    const cached = state.cache.get(state.vid);
    document.getElementById('boxM').value = state.M = cached ? cached.M : variety().M;
    document.getElementById('boxMVal').textContent = state.M;
    if (cached) {
      state.ps = cached.ps;
      state.depth = cached.depth;
      const d = makeDust(variety(), state.M);
      field.setData(state.ps.list, d.dust, d.flags, state.M, variety().syms);
      field.fitView();
      field.render('high');
      statusEl.textContent =
        `${state.ps.list.length.toLocaleString()} orbits · ${field.count.toLocaleString()} stars`;
      document.getElementById('deepen').disabled = state.depth >= 3;
      if (twinkleOn) startTwinkle();
    } else {
      state.ps = null;
      regenerate(true);
    }
  });
});

function bindSlider(id, valId, fn, fmt = v => v) {
  const el = document.getElementById(id);
  const val = document.getElementById(valId);
  el.addEventListener('input', () => {
    val.textContent = fmt(+el.value);
    fn(+el.value);
  });
}
bindSlider('alpha', 'alphaVal', v => { field.alpha = v; field.recomputeRadii(); field.render('high'); }, v => v.toFixed(2));
bindSlider('scale', 'scaleVal', v => { field.scale = v; field.recomputeRadii(); field.render('high'); });
let boxTimer = null;
bindSlider('boxM', 'boxMVal', v => {
  state.M = v;
  clearTimeout(boxTimer);
  boxTimer = setTimeout(() => { state.cache.delete(state.vid); state.ps = null; regenerate(true); }, 450);
});
document.getElementById('dust').addEventListener('change', e => {
  field.showDust = e.target.checked;
  field.render('high');
});
document.getElementById('twinkleBox').addEventListener('change', e => {
  twinkleOn = e.target.checked;
  if (twinkleOn && state.ps && !state.busy) startTwinkle();
  else if (!twinkleOn) stopTwinkle();
});
document.getElementById('deepen').addEventListener('click', () => {
  if (state.busy || state.depth >= 3) return;
  state.depth++;
  regenerate(false);
});
document.getElementById('resetView').addEventListener('click', () => {
  field.yaw = 0.65; field.pitch = 0.38; field.fitView(); field.render('high');
});

new ResizeObserver(() => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    if (field.needsFit && canvas.clientWidth > 10) field.fitView();
    field.render('high');
  }, 80);
}).observe(canvas);

// ---------- go ----------
field.alpha = +document.getElementById('alpha').value;
field.scale = +document.getElementById('scale').value;
regenerate(true);
