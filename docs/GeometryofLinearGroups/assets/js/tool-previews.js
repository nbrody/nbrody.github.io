/* Geometry of Linear Groups — scroll-load + snapshot-and-swap previews.
 *
 * Strategy:
 *  1. As cards scroll into view, lazily load a live iframe of the tool.
 *  2. Inside the iframe (same-origin), patch requestAnimationFrame so we can
 *     capture the canvas pixels immediately after a draw call (before the
 *     browser composites and clears the WebGL drawing buffer).
 *  3. Once we have a non-blank snapshot, replace the iframe with a static
 *     <img>. The image stays forever; the iframe is unloaded and the GPU/CPU
 *     work stops.
 *  4. Cap concurrent live iframes (LRU on visibility) so a page-full of
 *     not-yet-captured cards can't melt the GPU.
 *  5. If a card scrolls out of view before capture succeeds, unload the
 *     iframe; it'll re-load (and try to capture) when scrolled back.
 *  6. On touch devices, skip live previews entirely — they only see the
 *     placeholder until they tap to navigate.
 */
(function () {
  if (window.self !== window.top) return;

  var SELECTOR = '.tool-card[data-preview], .nav-card[data-preview]';
  var ROOT_MARGIN = '300px 0px';   // start loading just before card enters view
  var MAX_LIVE = 3;                // simultaneously running iframes
  var SETTLE_DELAYS = [900, 1800, 3500]; // additional time-based capture attempts (ms)
  var HARD_TIMEOUT_MS = 6000;      // unload uncaptured iframe after this long
  var GRACE_OUT_OF_VIEW_MS = 600;  // grace period before unloading on scroll-out
  var hasHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;

  var live = new Set();        // cards with a running iframe
  var captured = new WeakSet();
  var visible = new Set();
  var graceTimers = new WeakMap();

  function ensureSlot(card) {
    var slot = card.querySelector('.tool-preview, .nav-preview');
    if (slot) return slot;
    slot = document.createElement('div');
    slot.className = card.classList.contains('nav-card') ? 'nav-preview' : 'tool-preview';
    if (card.firstChild) card.insertBefore(slot, card.firstChild);
    else card.appendChild(slot);
    return slot;
  }

  function ensurePlaceholder(slot) {
    if (slot.querySelector('.tp-static')) return;
    var ph = document.createElement('div');
    ph.className = 'tp-static';
    ph.innerHTML = '<span class="tp-hint">loading…</span>';
    slot.appendChild(ph);
  }

  function setHint(card, text) {
    var slot = card.querySelector('.tool-preview, .nav-preview');
    if (!slot) return;
    var hint = slot.querySelector('.tp-hint');
    if (hint) hint.textContent = text;
  }

  function loadIframe(card) {
    if (captured.has(card) || live.has(card)) return;
    live.add(card);
    enforceCap();
    var slot = ensureSlot(card);
    var url = card.dataset.preview;
    if (!url) return;
    setHint(card, 'rendering…');
    var iframe = document.createElement('iframe');
    iframe.className = 'tp-iframe';
    iframe.src = url;
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    iframe.addEventListener('load', function () {
      arrangeCapture(card, iframe);
    });
    slot.appendChild(iframe);
  }

  function unloadIframe(card) {
    live.delete(card);
    var slot = card.querySelector('.tool-preview, .nav-preview');
    if (!slot) return;
    var ifr = slot.querySelector('iframe');
    if (ifr) {
      try { ifr.src = 'about:blank'; } catch (e) {}
      ifr.remove();
    }
    if (!captured.has(card)) setHint(card, hasHover ? '▸ hover to preview' : 'tap to open');
  }

  function enforceCap() {
    if (live.size <= MAX_LIVE) return;
    // Evict cards not currently visible first; if still over, evict oldest visible.
    var evictNotVisible = [];
    var evictVisible = [];
    live.forEach(function (c) {
      (visible.has(c) ? evictVisible : evictNotVisible).push(c);
    });
    while (live.size > MAX_LIVE && evictNotVisible.length) {
      unloadIframe(evictNotVisible.shift());
    }
    while (live.size > MAX_LIVE && evictVisible.length) {
      unloadIframe(evictVisible.shift());
    }
  }

  /* ----- capture pipeline ----- */

  function arrangeCapture(card, iframe) {
    if (captured.has(card)) return;
    var done = false;
    var win, doc;
    try { win = iframe.contentWindow; doc = iframe.contentDocument; }
    catch (e) { return; }
    if (!win || !doc) return;

    function attempt() {
      if (done || captured.has(card) || iframe.parentNode === null) return;
      if (tryCapture(card, iframe)) done = true;
    }

    // Patch requestAnimationFrame so we can capture immediately after a draw,
    // while the WebGL drawing buffer is still intact (no preserveDrawingBuffer
    // needed if we read inside the same task as the gl.draw* call).
    try {
      var orig = win.requestAnimationFrame;
      if (typeof orig === 'function') {
        var frames = 0;
        win.requestAnimationFrame = function (cb) {
          return orig.call(win, function (t) {
            try { cb(t); } catch (e) { /* swallow inner errors */ }
            // Wait a few frames for shaders to compile / textures to upload.
            if (++frames >= 8 && !done) attempt();
          });
        };
      }
    } catch (e) { /* cross-origin or sealed window */ }

    // Fallback time-based attempts (works for Canvas2D / SVG-based pages too).
    SETTLE_DELAYS.forEach(function (ms) { setTimeout(attempt, ms); });

    // Hard timeout: free GPU even if capture failed.
    setTimeout(function () {
      if (done || captured.has(card)) return;
      attempt();
      if (!done && live.has(card)) {
        unloadIframe(card);
        setHint(card, hasHover ? '▸ hover to preview' : 'tap to open');
      }
    }, HARD_TIMEOUT_MS);
  }

  function tryCapture(card, iframe) {
    try {
      var doc = iframe.contentDocument;
      if (!doc) return false;
      // Pick the visually-largest canvas in the iframe document.
      var canvases = doc.querySelectorAll('canvas');
      if (!canvases.length) return false;
      var best = null, bestArea = 0;
      for (var i = 0; i < canvases.length; i++) {
        var c = canvases[i];
        var w = c.width || c.clientWidth || 0;
        var h = c.height || c.clientHeight || 0;
        var a = w * h;
        if (a > bestArea) { best = c; bestArea = a; }
      }
      if (!best || bestArea < 1024) return false;
      var dataURL;
      try { dataURL = best.toDataURL('image/jpeg', 0.78); }
      catch (e) { return false; }
      if (!dataURL || dataURL.length < 1500) return false;
      // Crude "looks-blank" filter: empty/black images compress to a tiny URL
      // relative to their pixel count.
      var density = dataURL.length / bestArea;
      if (density < 0.0006) return false;
      finalize(card, dataURL);
      return true;
    } catch (e) {
      return false;
    }
  }

  function finalize(card, dataURL) {
    captured.add(card);
    live.delete(card);
    var slot = card.querySelector('.tool-preview, .nav-preview');
    if (!slot) return;
    var img = document.createElement('img');
    img.className = 'tp-snapshot';
    img.alt = '';
    img.decoding = 'async';
    img.src = dataURL;
    slot.appendChild(img);
    // Once the image has decoded, drop the iframe.
    function swap() {
      var ifr = slot.querySelector('iframe');
      if (ifr) { try { ifr.src = 'about:blank'; } catch (e) {} ifr.remove(); }
      slot.classList.add('tp-captured');
      var ph = slot.querySelector('.tp-static');
      if (ph) ph.remove();
    }
    if (img.complete) swap();
    else img.addEventListener('load', swap, { once: true });
  }

  /* ----- visibility observer ----- */

  function setup() {
    var cards = document.querySelectorAll(SELECTOR);
    if (!cards.length) return;
    cards.forEach(function (card) {
      ensurePlaceholder(ensureSlot(card));
    });

    if (!hasHover) return;     // touch devices: keep placeholders, no live previews

    if (!('IntersectionObserver' in window)) {
      // Old browsers: hover-load instead.
      cards.forEach(function (c) {
        c.addEventListener('mouseenter', function () { loadIframe(c); });
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var card = e.target;
        if (e.isIntersecting) {
          visible.add(card);
          var t = graceTimers.get(card);
          if (t) { clearTimeout(t); graceTimers.delete(card); }
          if (!captured.has(card)) loadIframe(card);
        } else {
          visible.delete(card);
          if (captured.has(card) || !live.has(card)) return;
          // grace period — avoids thrashing on quick scrolls
          var prev = graceTimers.get(card);
          if (prev) clearTimeout(prev);
          var timer = setTimeout(function () {
            graceTimers.delete(card);
            if (!visible.has(card) && !captured.has(card)) unloadIframe(card);
          }, GRACE_OUT_OF_VIEW_MS);
          graceTimers.set(card, timer);
        }
      });
    }, { rootMargin: ROOT_MARGIN, threshold: 0.05 });

    cards.forEach(function (c) { io.observe(c); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
