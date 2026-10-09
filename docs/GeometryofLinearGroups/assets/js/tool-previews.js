/* Geometry of Linear Groups — preview stills on the tool and nav cards.
 *
 * Every card with data-preview gets a still of its tool, rendered ahead of time by
 * assets/previews/make-previews.mjs (rerun it after changing a tool or adding a card). The still
 * is assets/previews/<slug>.webp, the slug being the tool's path from GeometryofLinearGroups/ with
 * '/' → '__', a final "index.html" dropped, and '..' → 'up' (so a.html and a/index.html differ).
 * Images load lazily as cards near the screen; a card without one keeps its plain frame. Nothing
 * from the tools runs here.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var stills = new URL('../previews/', script.src);
  var root = new URL('../../', script.src).pathname.split('/').slice(0, -1);

  function slugOf(href) {
    var path = decodeURIComponent(new URL(href, location.href).pathname).split('/');
    var base = root.map(decodeURIComponent);
    var i = 0;
    while (i < base.length && i < path.length - 1 && base[i] === path[i]) i++;
    var rel = [];
    for (var k = i; k < base.length; k++) rel.push('up');
    return rel.concat(path.slice(i)).join('__')
      .replace(/(__)?index\.html$/, '').replace(/__$/, '');
  }

  function setup() {
    document.querySelectorAll('.tool-card[data-preview], .nav-card[data-preview]').forEach(function (card) {
      var slot = card.querySelector('.tool-preview, .nav-preview');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = card.classList.contains('nav-card') ? 'nav-preview' : 'tool-preview';
        card.insertBefore(slot, card.firstChild);
      }
      var img = document.createElement('img');
      img.className = 'tp-snapshot';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 640;
      img.height = 400;
      img.addEventListener('load', function () { slot.classList.add('tp-captured'); }, { once: true });
      img.addEventListener('error', function () { img.remove(); }, { once: true });
      img.src = new URL(slugOf(card.dataset.preview) + '.webp', stills).href;
      slot.appendChild(img);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
