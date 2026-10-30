/* alphaPresent (alphaCentaur) — runtime for exported decks.
 * Scales the 1920×1080 stage to the window, drives fullPage.js, steps
 * through builds, lazy-loads embeds/applets near the current slide, and
 * accepts {type:'iframeNav', direction:'next'|'prev'} from embedded tools. */
(function () {
  'use strict';
  var cfg = window.PZ_CONFIG || {};
  // ?pz-thumb: the small copy of the deck that a phone remote shows. It loads no
  // embeds or applets, has no navigation of its own, and follows the slide and
  // build step its parent page sends ({type:'pz-control', index, step}).
  var thumb = /[?&]pz-thumb(?:[=&]|$)/.test(location.search);
  var W = cfg.width || 1920, H = cfg.height || 1080;
  var root = document.documentElement;

  function fit() { root.style.setProperty('--pz-scale', Math.min(innerWidth / W, innerHeight / H)); }
  addEventListener('resize', fit);
  fit();

  // Linear order of slides across sections (vertical) and slides (horizontal).
  var order = [];
  var sections = Array.prototype.slice.call(document.querySelectorAll('#fullpage > .section'));
  sections.forEach(function (sec, si) {
    var slides = sec.querySelectorAll(':scope > .slide');
    if (slides.length) Array.prototype.forEach.call(slides, function (sl, j) { order.push({ si: si, j: j, el: sl }); });
    else order.push({ si: si, j: -1, el: sec });
  });
  order.forEach(function (o, i) { o.el.setAttribute('data-pz-index', i); });

  function stepsOf(el) {
    var vals = {};
    Array.prototype.forEach.call(el.querySelectorAll('[data-build]'), function (b) { vals[+b.getAttribute('data-build')] = 1; });
    return Object.keys(vals).map(Number).sort(function (a, b) { return a - b; });
  }
  order.forEach(function (o) { o.steps = stepsOf(o.el); o.step = 0; });

  function setStep(o, k, instant) {
    o.step = Math.max(0, Math.min(o.steps.length, k));
    var limit = o.step ? o.steps[o.step - 1] : 0;
    if (instant) o.el.classList.add('pz-instant');
    Array.prototype.forEach.call(o.el.querySelectorAll('[data-build]'), function (b) {
      b.classList.toggle('pz-in', +b.getAttribute('data-build') <= limit);
    });
    if (instant) { void o.el.offsetWidth; o.el.classList.remove('pz-instant'); }
    if (order[current] === o) emitState();
  }
  // Other modules (the phone remote) follow the deck through this event.
  function emitState() {
    var o = order[current];
    try { document.dispatchEvent(new CustomEvent('pz-state', { detail: { index: current, count: order.length, step: o ? o.step : 0, steps: o ? o.steps.length : 0 } })); } catch (e) {}
  }

  var current = 0;
  function indexOfActive() {
    if (!window.fullpage_api) return current;
    var s = fullpage_api.getActiveSection(), sl = fullpage_api.getActiveSlide();
    var el = sl ? sl.item : s && s.item;
    var idx = el ? +el.getAttribute('data-pz-index') : NaN;
    return isNaN(idx) ? current : idx;
  }

  var programmatic = false;
  function go(i, dir) {
    if (i < 0 || i >= order.length) return;
    var t = order[i];
    setStep(t, dir < 0 ? t.steps.length : 0, true);
    programmatic = true;
    if (t.j < 0) fullpage_api.moveTo(t.si + 1);
    else fullpage_api.moveTo(t.si + 1, t.j);
    programmatic = false;
  }
  function next() {
    var i = indexOfActive(), o = order[i];
    if (o && o.step < o.steps.length) setStep(o, o.step + 1);
    else go(i + 1, 1);
  }
  function prev() {
    var i = indexOfActive(), o = order[i];
    if (o && o.step > 0) setStep(o, o.step - 1);
    else go(i - 1, -1);
  }
  function sectionJump(d) {
    var i = indexOfActive(), si = order[i].si + d;
    for (var k = 0; k < order.length; k++) if (order[k].si === si) return go(k, 1);
  }

  // Embeds and applets load only near the current slide.
  function wake(i) {
    if (thumb) return;
    for (var k = i - 1; k <= i + 1; k++) {
      var o = order[k];
      if (!o) continue;
      Array.prototype.forEach.call(o.el.querySelectorAll('iframe[data-pz-src],iframe[data-pz-srcdoc]'), function (f) {
        if (f.hasAttribute('data-pz-srcdoc')) { f.srcdoc = f.getAttribute('data-pz-srcdoc'); f.removeAttribute('data-pz-srcdoc'); }
        if (f.hasAttribute('data-pz-src')) { f.src = f.getAttribute('data-pz-src'); f.removeAttribute('data-pz-src'); }
      });
    }
  }

  var numberEl = document.querySelector('.pz-number'), progressEl = document.querySelector('.pz-progress');
  var notesEl = document.querySelector('.pz-notes-panel');
  function arrived() {
    current = indexOfActive();
    wake(current);
    if (numberEl) numberEl.textContent = (current + 1) + ' / ' + order.length;
    if (progressEl) progressEl.style.width = (order.length > 1 ? current / (order.length - 1) * 100 : 100) + '%';
    if (notesEl) {
      var n = order[current] && order[current].el.querySelector('aside.pz-notes');
      notesEl.innerHTML = '<b>Notes · slide ' + (current + 1) + '</b>';
      notesEl.appendChild(document.createTextNode(n ? n.textContent : '—'));
    }
    try { if (parent !== window) parent.postMessage({ type: 'pz-state', index: current, count: order.length }, '*'); } catch (e) {}
    emitState();
  }

  // Scrolling or swiping forward first reveals pending builds.
  function guard(originEl, direction) {
    if (programmatic) return true;
    var o = order[+originEl.getAttribute('data-pz-index')];
    if (!o) return true;
    var fwd = direction === 'down' || direction === 'right';
    if (fwd && o.step < o.steps.length) { setStep(o, o.step + 1); return false; }
    return true;
  }
  function prepare(destEl, direction) {
    var o = order[+destEl.getAttribute('data-pz-index')];
    if (o && !programmatic) setStep(o, direction === 'up' || direction === 'left' ? o.steps.length : 0, true);
  }

  var opts = {
    licenseKey: 'gplv3-license',
    credits: { enabled: false },
    verticalCentered: false,
    scrollingSpeed: cfg.speed || 700,
    navigation: !!cfg.dots && sections.length > 1,
    navigationPosition: 'right',
    navigationTooltips: cfg.tooltips || [],
    slidesNavigation: !!cfg.dots,
    controlArrows: !!cfg.arrows,
    keyboardScrolling: false,
    animateAnchor: false,
    recordHistory: false,
    lockAnchors: false,
    fitToSection: true,
    scrollOverflow: false,
    touchSensitivity: 12,
    loopHorizontal: false,
    onLeave: function (origin, destination, direction) {
      var oEl = origin.item.querySelector(':scope > .fp-slides .slide.active') || origin.item;
      if (guard(oEl, direction) === false) return false;
      var dEl = destination.item.querySelector(':scope > .fp-slides .slide.active') || destination.item;
      prepare(dEl, direction);
    },
    onSlideLeave: function (section, origin, destination, direction) {
      if (guard(origin.item, direction) === false) return false;
      prepare(destination.item, direction);
    },
    afterLoad: function () { arrived(); },
    afterSlideLoad: function () { arrived(); },
    afterRender: function () { arrived(); },
  };
  if (cfg.anchors) opts.anchors = cfg.anchors;

  function start() {
    if (thumb) {
      document.documentElement.classList.add('pz-thumb');
      var css = document.createElement('style');
      css.textContent = '.pz-thumb .pz-number,.pz-thumb .pz-progress,.pz-thumb .pz-notes-panel,.pz-thumb .pz-goto,.pz-thumb #fp-nav,.pz-thumb .fp-slidesNav,.pz-thumb .fp-controlArrow{display:none!important}';
      document.head.appendChild(css);
    }
    if (!window.fullpage) { document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 0 0 0;text-align:center;color:#fff;background:#b33;padding:8px;font:14px system-ui">fullPage.js did not load — check your connection, or export the self-contained version.</p>'); return; }
    new fullpage('#fullpage', opts);
    // #pz-N opens at slide N (used by the editor's "present from here").
    var m = /^#pz-(\d+)$/.exec(location.hash);
    if (m && order[+m[1]]) {
      var t = order[+m[1]];
      programmatic = true;
      if (t.j < 0) fullpage_api.silentMoveTo(t.si + 1); else fullpage_api.silentMoveTo(t.si + 1, t.j);
      programmatic = false;
    }
    var o = order[indexOfActive()];
    if (o) setStep(o, 0, true);
    if (thumb) { fullpage_api.setAllowScrolling(false); fullpage_api.setKeyboardScrolling(false); }
    arrived();
  }

  // The thumbnail jumps straight to a slide and build step.
  function jump(i, step) {
    var t = order[i];
    if (!t || !window.fullpage_api) return;
    programmatic = true;
    if (t.j < 0) fullpage_api.silentMoveTo(t.si + 1); else fullpage_api.silentMoveTo(t.si + 1, t.j);
    programmatic = false;
    current = i;
    setStep(t, step || 0, true);
    arrived();
  }

  // Keyboard: one linear "next" for clickers, plus section jumps in chapters.
  var typed = '';
  var gotoEl = document.querySelector('.pz-goto');
  addEventListener('keydown', function (e) {
    if (thumb) return;
    if (window.pzKeyHook && window.pzKeyHook(e)) { e.preventDefault(); return; }
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key, handled = true;
    if (/^\d$/.test(k)) { typed += k; if (gotoEl) { gotoEl.textContent = 'Go to slide ' + typed; gotoEl.classList.add('open'); } return; }
    if (k === 'Enter' && typed) { go(Math.min(order.length, Math.max(1, +typed)) - 1, 1); typed = ''; if (gotoEl) gotoEl.classList.remove('open'); e.preventDefault(); return; }
    typed = ''; if (gotoEl) gotoEl.classList.remove('open');
    var chapters = cfg.nav === 'chapters';
    if (k === 'ArrowRight' || k === 'PageDown' || k === 'Enter' || (k === ' ' && !e.shiftKey)) next();
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace' || (k === ' ' && e.shiftKey)) prev();
    else if (k === 'ArrowDown') { if (chapters) sectionJump(1); else next(); }
    else if (k === 'ArrowUp') { if (chapters) sectionJump(-1); else prev(); }
    else if (k === 'Home') go(0, 1);
    else if (k === 'End') go(order.length - 1, 1);
    else if (k === 'n' || k === 'N') { if (notesEl) notesEl.classList.toggle('open'); }
    else if (k === 'f' || k === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen && root.requestFullscreen().catch(function () {}); }
    else if (k === 'Escape') { if (parent !== window) parent.postMessage({ type: 'pz-exit' }, '*'); handled = false; }
    else handled = false;
    if (handled) e.preventDefault();
  }, true);

  addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'iframeNav') { if (d.direction === 'next') next(); else if (d.direction === 'prev') prev(); else if (d.direction === 'exit' && parent !== window) parent.postMessage({ type: 'pz-exit' }, '*'); }
    if (d.type === 'pz-control' && e.source === parent) {
      if (thumb) { if (typeof d.index === 'number') jump(d.index, +d.step || 0); return; }
      if (d.action === 'next') next(); if (d.action === 'prev') prev(); if (typeof d.index === 'number') go(d.index, 1);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.pzDeck = {
    next: next, prev: prev, go: go, count: order.length, index: function () { return current; },
    // The embeds and applets on the current slide (the remote talks to them).
    frames: function () { var o = order[current]; return o ? Array.prototype.slice.call(o.el.querySelectorAll('iframe')) : []; },
    state: function () { var o = order[current]; return { index: current, count: order.length, step: o ? o.step : 0, steps: o ? o.steps.length : 0 }; },
  };
})();
