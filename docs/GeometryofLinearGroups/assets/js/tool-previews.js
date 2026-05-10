/* Geometry of Linear Groups — lazy live preview iframes for tool cards.
 * Looks for elements matching `.tool-card[data-preview]` (or `.nav-card[data-preview]`)
 * and lazy-loads an iframe of the target URL inside `.tool-preview` / `.nav-preview`.
 */
(function () {
  if (window.self !== window.top) return; // never recurse inside an iframe

  var SELECTOR = '.tool-card[data-preview], .nav-card[data-preview]';
  var MAX_ACTIVE_PREVIEWS = 4;
  var activeCards = [];

  function ensurePreviewSlot(card) {
    var slot = card.querySelector('.tool-preview, .nav-preview');
    if (slot) return slot;
    slot = document.createElement('div');
    slot.className = card.classList.contains('nav-card') ? 'nav-preview' : 'tool-preview';
    // Insert at the top of the card
    if (card.firstChild) card.insertBefore(slot, card.firstChild);
    else card.appendChild(slot);
    return slot;
  }

  function loadIframe(card) {
    if (card.dataset.previewLoaded === '1') {
      touchActive(card);
      return;
    }
    card.dataset.previewLoaded = '1';
    var slot = ensurePreviewSlot(card);
    var url = card.dataset.preview;
    if (!url) return;

    var ph = document.createElement('div');
    ph.className = 'tp-placeholder';
    ph.textContent = '…';
    slot.appendChild(ph);

    var iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.loading = 'lazy';
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('scrolling', 'no');
    // Sandbox allow scripts so canvases/shaders run, but block top navigation.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock');
    iframe.addEventListener('load', function () { ph.remove(); });
    slot.appendChild(iframe);
    touchActive(card);
    pruneActive(card);
  }

  function unloadIframe(card) {
    if (card.dataset.previewLoaded !== '1') return;
    card.dataset.previewLoaded = '0';
    forgetActive(card);

    var slot = card.querySelector('.tool-preview, .nav-preview');
    if (!slot) return;
    slot.querySelectorAll('iframe, .tp-placeholder').forEach(function (node) {
      node.remove();
    });
  }

  function touchActive(card) {
    forgetActive(card);
    activeCards.push(card);
  }

  function forgetActive(card) {
    var i = activeCards.indexOf(card);
    if (i >= 0) activeCards.splice(i, 1);
  }

  function pruneActive(keepCard) {
    while (activeCards.length > MAX_ACTIVE_PREVIEWS) {
      var victim = activeCards[0] === keepCard && activeCards.length > 1 ? activeCards[1] : activeCards[0];
      unloadIframe(victim);
    }
  }

  function setup() {
    var cards = document.querySelectorAll(SELECTOR);
    if (!cards.length) return;
    cards.forEach(ensurePreviewSlot);

    if (!('IntersectionObserver' in window)) {
      // Fallback: load only a bounded number immediately.
      Array.prototype.slice.call(cards, 0, MAX_ACTIVE_PREVIEWS).forEach(loadIframe);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          loadIframe(e.target);
        } else {
          unloadIframe(e.target);
        }
      });
    }, { rootMargin: '300px 0px', threshold: 0.01 });

    cards.forEach(function (c) { io.observe(c); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
