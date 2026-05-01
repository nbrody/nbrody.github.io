(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('map');
  const world = document.getElementById('world');
  const ocean = document.getElementById('ocean');
  const oceanPattern = document.getElementById('oceanPattern');
  const info = document.getElementById('info');
  const infoTitle = document.getElementById('info-title');
  const infoDesc = document.getElementById('info-desc');
  const infoTopics = document.getElementById('info-topics');

  // ---------- view box state ----------
  let viewX = 0, viewY = 0, viewW = VIEW_W, viewH = VIEW_H;
  // The "home" view: fits the whole world to the screen with some padding.
  let homeX = 0, homeY = 0, homeW = VIEW_W, homeH = VIEW_H;
  let animId = null;
  const ZOOM_MIN = 0.4;   // overall world zoom-out limit
  const ZOOM_MAX = 8;     // zoom-in limit

  function fitHome() {
    const aspect = svg.clientWidth / svg.clientHeight;
    const worldAspect = VIEW_W / VIEW_H;
    let w, h;
    if (aspect > worldAspect) {
      h = VIEW_H * 1.04;
      w = h * aspect;
    } else {
      w = VIEW_W * 1.04;
      h = w / aspect;
    }
    homeX = VIEW_W / 2 - w / 2;
    homeY = VIEW_H / 2 - h / 2;
    homeW = w;
    homeH = h;
  }

  function setViewBox(x, y, w, h) {
    viewX = x; viewY = y; viewW = w; viewH = h;
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    updateLabelVisibility();
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function animateTo(tx, ty, tw, th, duration = 650) {
    if (animId) cancelAnimationFrame(animId);
    const sx = viewX, sy = viewY, sw = viewW, sh = viewH;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOutCubic(t);
      setViewBox(
        sx + (tx - sx) * e,
        sy + (ty - sy) * e,
        sw + (tw - sw) * e,
        sh + (th - sh) * e
      );
      if (t < 1) animId = requestAnimationFrame(step);
      else animId = null;
    }
    animId = requestAnimationFrame(step);
  }

  function fitToBox(bx, by, bw, bh, padding = 0.18) {
    // Choose target view that contains [bx,by,bw,bh] with padding, matching
    // the SVG element's display aspect ratio.
    const aspect = svg.clientWidth / svg.clientHeight;
    const padW = bw * (1 + padding * 2);
    const padH = bh * (1 + padding * 2);
    let tw, th;
    if (padW / padH > aspect) {
      tw = padW;
      th = tw / aspect;
    } else {
      th = padH;
      tw = th * aspect;
    }
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    return [cx - tw / 2, cy - th / 2, tw, th];
  }

  // ---------- random + blob shape generation ----------
  function mulberry32(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function blobPath(cx, cy, r, seed) {
    const rng = mulberry32(seed);
    const n = 16;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.18;
      const radius = r * (0.78 + rng() * 0.38);
      pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    // Catmull-Rom -> cubic Bezier, closed
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    const tension = 1 / 6;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const c1x = p1[0] + (p2[0] - p0[0]) * tension;
      const c1y = p1[1] + (p2[1] - p0[1]) * tension;
      const c2x = p2[0] - (p3[0] - p1[0]) * tension;
      const c2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + ' Z';
  }

  // ---------- rendering ----------
  function el(tag, attrs = {}) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Connection arcs (drawn first, beneath continents).
  const connectionsLayer = el('g', { class: 'connections-layer' });
  world.appendChild(connectionsLayer);

  function curveBetween(a, b) {
    // gentle arc connecting two centers
    const mx = (a.cx + b.cx) / 2;
    const my = (a.cy + b.cy) / 2;
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy);
    // perpendicular offset for the control point
    const off = Math.min(120, len * 0.18);
    const px = mx - (dy / len) * off;
    const py = my + (dx / len) * off;
    return `M ${a.cx} ${a.cy} Q ${px} ${py} ${b.cx} ${b.cy}`;
  }

  const continentById = Object.fromEntries(continents.map(c => [c.id, c]));

  for (const [aId, bId] of connections) {
    const a = continentById[aId];
    const b = continentById[bId];
    if (!a || !b) continue;
    connectionsLayer.appendChild(
      el('path', { class: 'connection', d: curveBetween(a, b) })
    );
  }

  // Continent groups
  const continentRefs = []; // for label-visibility updates and external lookup

  for (const c of continents) {
    const group = el('g', { class: 'continent-group', 'data-id': c.id });
    world.appendChild(group);

    const path = el('path', {
      class: 'continent-path',
      d: blobPath(c.cx, c.cy, c.r, c.seed),
      fill: c.color,
    });
    group.appendChild(path);

    // continent label, centered slightly above the geometric center
    const label = el('text', {
      class: 'continent-label',
      x: c.cx,
      y: c.cy - c.r * 0.05,
      'font-size': Math.max(28, c.r * 0.18),
    });
    label.textContent = c.name;
    group.appendChild(label);

    // topic dots and labels
    const topicEls = [];
    for (const t of c.topics) {
      const dot = el('circle', {
        class: 'topic-dot',
        cx: t.x, cy: t.y, r: 5,
      });
      group.appendChild(dot);
      const tlab = el('text', {
        class: 'topic-label',
        x: t.x, y: t.y + 18,
        'font-size': 14,
      });
      tlab.textContent = t.name;
      group.appendChild(tlab);
      topicEls.push({ dot, label: tlab });
    }

    // Click to focus
    group.addEventListener('click', e => {
      e.stopPropagation();
      focusContinent(c, group);
    });

    continentRefs.push({ data: c, group, label, topicEls });
  }

  // Compass rose (decorative, in lower-left of world)
  const compass = el('g', { class: 'compass' });
  const cmx = 130, cmy = VIEW_H - 130, cmr = 78;
  compass.appendChild(el('circle', { cx: cmx, cy: cmy, r: cmr, fill: 'none', stroke: 'rgba(255,255,255,0.25)', 'stroke-width': 2 }));
  compass.appendChild(el('circle', { cx: cmx, cy: cmy, r: cmr * 0.62, fill: 'none', stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 1 }));
  // points
  const compassPts = el('path', {
    d: `M ${cmx} ${cmy - cmr} L ${cmx + 12} ${cmy} L ${cmx} ${cmy + cmr} L ${cmx - 12} ${cmy} Z
        M ${cmx + cmr} ${cmy} L ${cmx} ${cmy - 12} L ${cmx - cmr} ${cmy} L ${cmx} ${cmy + 12} Z`,
    fill: 'rgba(255,255,255,0.22)',
    stroke: 'rgba(255,255,255,0.4)',
    'stroke-width': 1,
  });
  compass.appendChild(compassPts);
  // N/S/E/W letters
  for (const [t, x, y] of [['N', cmx, cmy - cmr - 14], ['S', cmx, cmy + cmr + 22], ['E', cmx + cmr + 14, cmy + 6], ['W', cmx - cmr - 14, cmy + 6]]) {
    const txt = el('text', { x, y, 'text-anchor': 'middle', fill: 'rgba(255,255,255,0.55)', 'font-size': 16, 'font-weight': 600 });
    txt.textContent = t;
    compass.appendChild(txt);
  }
  world.appendChild(compass);

  // ---------- label visibility based on zoom ----------
  function updateLabelVisibility() {
    // zoom > 1 means zoomed in (world looks bigger)
    const zoom = VIEW_W / viewW;
    for (const { data, label, topicEls } of continentRefs) {
      const isActive = data.id === activeContinent;

      // Continent label: visible at low zoom, fade in middle, mostly hidden far in.
      let labelOpacity;
      if (zoom < 2.0) labelOpacity = 1;
      else if (zoom < 3.5) labelOpacity = 1 - (zoom - 2.0) / 1.5 * 0.8;
      else labelOpacity = 0.2;
      label.style.opacity = labelOpacity.toFixed(2);

      // Topic labels: visible when zoomed in OR when this continent is the
      // active focus.
      let topicOpacity;
      if (isActive) {
        topicOpacity = 1;
      } else if (zoom < 1.25) {
        topicOpacity = 0;
      } else if (zoom < 1.9) {
        topicOpacity = (zoom - 1.25) / 0.65;
      } else {
        topicOpacity = 1;
      }
      for (const t of topicEls) {
        t.label.style.opacity = topicOpacity.toFixed(2);
        // dot radius shrinks slightly as we zoom in
        t.dot.setAttribute('r', Math.max(2.4, 6 / Math.max(1, zoom * 0.7)).toFixed(2));
      }
    }
  }

  // ---------- focus / info panel ----------
  let activeContinent = null;

  function focusContinent(c, group) {
    // visual state
    for (const ref of continentRefs) {
      ref.group.classList.toggle('dimmed', ref.data.id !== c.id);
      ref.group.classList.toggle('active', ref.data.id === c.id);
    }
    activeContinent = c.id;

    // info panel
    infoTitle.textContent = c.name;
    infoDesc.textContent = c.description;
    infoTopics.innerHTML = '';
    for (const t of c.topics) {
      const li = document.createElement('li');
      li.textContent = t.name;
      infoTopics.appendChild(li);
    }
    info.classList.add('visible');
    info.setAttribute('aria-hidden', 'false');

    // animate to fit the continent's bounding box
    const path = group.querySelector('.continent-path');
    const bb = path.getBBox();
    const [tx, ty, tw, th] = fitToBox(bb.x, bb.y, bb.width, bb.height, 0.22);
    animateTo(tx, ty, tw, th);
  }

  function resetView() {
    activeContinent = null;
    for (const ref of continentRefs) {
      ref.group.classList.remove('dimmed');
      ref.group.classList.remove('active');
    }
    info.classList.remove('visible');
    info.setAttribute('aria-hidden', 'true');
    animateTo(homeX, homeY, homeW, homeH);
  }

  // background click resets
  ocean.addEventListener('click', resetView);
  oceanPattern.addEventListener('click', resetView);

  // ---------- pan with drag ----------
  let panState = null;

  svg.addEventListener('pointerdown', e => {
    // ignore if click target is a continent group (so click-to-focus still works)
    if (e.target.closest('.continent-group')) {
      // still allow drag-pan if user moves significantly
      panState = { x: e.clientX, y: e.clientY, vx: viewX, vy: viewY, moved: false, fromContinent: true };
    } else {
      panState = { x: e.clientX, y: e.clientY, vx: viewX, vy: viewY, moved: false, fromContinent: false };
    }
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', e => {
    if (!panState) return;
    const dx = e.clientX - panState.x;
    const dy = e.clientY - panState.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) panState.moved = true;
    if (!panState.moved) return;
    // cancel any running animation when user drags
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    svg.classList.add('panning');
    const rect = svg.getBoundingClientRect();
    const wx = (dx / rect.width) * viewW;
    const wy = (dy / rect.height) * viewH;
    setViewBox(panState.vx - wx, panState.vy - wy, viewW, viewH);
  });

  function endPan(e) {
    if (!panState) return;
    const wasMoved = panState.moved;
    const fromContinent = panState.fromContinent;
    panState = null;
    svg.classList.remove('panning');
    try { svg.releasePointerCapture(e.pointerId); } catch {}
    // if pointerup happened on the ocean and there was no drag, the click handler resets.
    // if pointerup on a continent and no drag, the continent's click handler fires (browser-native).
    // We don't need to do anything here, as click events will follow the pointerup.
  }
  svg.addEventListener('pointerup', endPan);
  svg.addEventListener('pointercancel', endPan);

  // ---------- wheel zoom ----------
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sx = viewX + (mx / rect.width) * viewW;
    const sy = viewY + (my / rect.height) * viewH;
    const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    let newW = viewW * factor;
    let newH = viewH * factor;
    // clamp
    const minW = VIEW_W / ZOOM_MAX;
    const maxW = VIEW_W / ZOOM_MIN;
    if (newW < minW) { const k = minW / newW; newW *= k; newH *= k; }
    if (newW > maxW) { const k = maxW / newW; newW *= k; newH *= k; }
    const newX = sx - (mx / rect.width) * newW;
    const newY = sy - (my / rect.height) * newH;
    setViewBox(newX, newY, newW, newH);
  }, { passive: false });

  // ---------- pinch zoom (basic) ----------
  const pinchPointers = new Map();
  let pinchStartDist = null;
  let pinchStartView = null;

  svg.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointers.size === 2) {
      const pts = [...pinchPointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartView = { x: viewX, y: viewY, w: viewW, h: viewH };
    }
  });
  svg.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch') return;
    if (!pinchPointers.has(e.pointerId)) return;
    pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointers.size === 2 && pinchStartDist) {
      const pts = [...pinchPointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = pinchStartDist / d; // larger d => smaller view (zoom in)
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const rect = svg.getBoundingClientRect();
      const sx = pinchStartView.x + (cx - rect.left) / rect.width * pinchStartView.w;
      const sy = pinchStartView.y + (cy - rect.top) / rect.height * pinchStartView.h;
      let newW = pinchStartView.w * scale;
      let newH = pinchStartView.h * scale;
      const minW = VIEW_W / ZOOM_MAX;
      const maxW = VIEW_W / ZOOM_MIN;
      if (newW < minW) { const k = minW / newW; newW *= k; newH *= k; }
      if (newW > maxW) { const k = maxW / newW; newW *= k; newH *= k; }
      const newX = sx - (cx - rect.left) / rect.width * newW;
      const newY = sy - (cy - rect.top) / rect.height * newH;
      setViewBox(newX, newY, newW, newH);
    }
  });
  function pinchEnd(e) {
    pinchPointers.delete(e.pointerId);
    if (pinchPointers.size < 2) {
      pinchStartDist = null;
      pinchStartView = null;
    }
  }
  svg.addEventListener('pointerup', pinchEnd);
  svg.addEventListener('pointercancel', pinchEnd);

  // ---------- buttons ----------
  function zoomBy(factor) {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    const cx = viewX + viewW / 2;
    const cy = viewY + viewH / 2;
    let newW = viewW * factor;
    let newH = viewH * factor;
    const minW = VIEW_W / ZOOM_MAX;
    const maxW = VIEW_W / ZOOM_MIN;
    if (newW < minW) { const k = minW / newW; newW *= k; newH *= k; }
    if (newW > maxW) { const k = maxW / newW; newW *= k; newH *= k; }
    animateTo(cx - newW / 2, cy - newH / 2, newW, newH, 300);
  }
  document.getElementById('zoomIn').addEventListener('click', () => zoomBy(1 / 1.5));
  document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1.5));
  document.getElementById('reset').addEventListener('click', resetView);

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') resetView();
    else if (e.key === '+' || e.key === '=') zoomBy(1 / 1.5);
    else if (e.key === '-' || e.key === '_') zoomBy(1.5);
  });

  // ---------- resize ----------
  function onResize() {
    fitHome();
    if (!activeContinent) {
      setViewBox(homeX, homeY, homeW, homeH);
    } else {
      // re-fit current continent
      const ref = continentRefs.find(r => r.data.id === activeContinent);
      if (ref) {
        const path = ref.group.querySelector('.continent-path');
        const bb = path.getBBox();
        const [tx, ty, tw, th] = fitToBox(bb.x, bb.y, bb.width, bb.height, 0.22);
        setViewBox(tx, ty, tw, th);
      }
    }
  }
  window.addEventListener('resize', onResize);

  // initial
  fitHome();
  setViewBox(homeX, homeY, homeW, homeH);
  updateLabelVisibility();
})();
