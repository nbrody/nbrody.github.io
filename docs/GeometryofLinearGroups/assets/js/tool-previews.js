/* Geometry of Linear Groups — lazy live preview iframes for tool cards.
 * Looks for elements matching `.tool-card[data-preview]` (or `.nav-card[data-preview]`)
 * and lazy-loads an iframe of the target URL inside `.tool-preview` / `.nav-preview`.
 */
(function () {
  if (window.self !== window.top) return; // never recurse inside an iframe

  var SELECTOR = '.tool-card[data-preview], .nav-card[data-preview]';

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
    if (card.dataset.previewLoaded === '1') return;
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
  }

  function setup() {
    var cards = document.querySelectorAll(SELECTOR);
    if (!cards.length) return;
    cards.forEach(ensurePreviewSlot);

    if (!('IntersectionObserver' in window)) {
      // Fallback: load all immediately
      cards.forEach(loadIframe);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          loadIframe(e.target);
          io.unobserve(e.target);
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
