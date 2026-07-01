/* Geometry of Linear Groups — global site navigation
 * Floating ☰ button on every page. The drawer (with ~130 nav links) is built
 * lazily during browser idle time so it doesn't compete with the page's
 * initial paint or shader/canvas work.
 * Skips itself when running inside an iframe (so it doesn't show up in previews).
 */
(function () {
  if (window.self !== window.top) return;
  if (document.getElementById('golg-nav-toggle')) return;

  // ---- Resolve project base path ----------------------------------------
  function resolveBase() {
    var p = location.pathname;
    var marker = '/GeometryofLinearGroups/';
    var i = p.indexOf(marker);
    if (i >= 0) return p.substring(0, i + marker.length);
    return p.replace(/[^/]*$/, '');
  }
  var BASE = resolveBase();

  // ---- Page manifest -----------------------------------------------------
  var MANIFEST = [
    { section: 'Home', icon: '⌂', items: [
      { t: 'Home',                     u: 'index.html' },
      { t: 'About',                    u: 'about/index.html' },
      { t: 'Conjectures',              u: 'about/conjectures/index.html' },
      { t: 'Presentation Calculator',  u: 'PresentationCalc/index.html' },
    ]},
    { section: 'Algebraic', icon: '𝔾', items: [
      { t: 'Algebraic — Overview',          u: 'Algebraic/index.html' },
      { t: 'Number Rings',                  u: 'Algebraic/Tools/numberRings/index.html' },
      { t: 'S-Ring Closure',                u: 'Algebraic/Tools/sRingClosure/index.html' },
      { t: 'Minkowski Embeddings',          u: 'Algebraic/Tools/minkowskiEmbedding/index.html' },
      { t: 'Zariski Closure',               u: 'Algebraic/Tools/zariskiClosure/index.html' },
      { t: 'Quaternion Algebras',           u: 'Algebraic/Tools/quaternionAlgebras/index.html' },
      { t: 'Tautological Representations',  u: 'Algebraic/Tools/tautologicalReps/index.html' },
      { t: 'Discreteness Certificate',      u: 'Algebraic/Tools/discretenessCertificate.html' },
      { t: 'Expression Parser',             u: 'Algebraic/Tools/mathParser.html' },
      { t: 'Expression Parser (Simple)',    u: 'Algebraic/Tools/mathParserSimple.html' },
    ]},
    { section: 'Arithmetic', icon: 'ℤ', items: [
      { t: 'Arithmetic — Overview',                 u: 'Arithmetic/index.html' },
      { t: 'Cocompact Surface Groups',              u: 'Arithmetic/Tools/cocompactSurface/index.html' },
      { t: 'Convex Cocompact Subgroups',            u: 'Arithmetic/Tools/convexCocompact/index.html' },
      { t: 'PSL₂(ℤ) Convex Cocompact Explorer',     u: 'Arithmetic/Tools/convexCocompactPSL2Z/index.html' },
      { t: 'Compact Surface Construction',          u: 'Arithmetic/Tools/convexCocompactPSL2Z/compact_surface.html' },
      { t: 'Pseudomodular Group Explorer',          u: 'Arithmetic/Tools/pseudomodular/index.html' },
      { t: 'Pseudomodular — Cocompactness',         u: 'Arithmetic/Tools/pseudomodular/cocompact.html' },
      { t: 'Pseudomodular — Families',              u: 'Arithmetic/Tools/pseudomodular/families.html' },
      { t: 'Neumann Subgroups',                     u: 'Arithmetic/Tools/neumannSubgroups/index.html' },
      { t: 'Rational Fuchsian Groups',              u: 'Arithmetic/Tools/rationalFuchsianGroups/index.html' },
      { t: 'Transitivity Calculator',               u: 'Arithmetic/Tools/transitivityCalculator/index.html' },
      { t: 'GPS Manifolds',                         u: 'Arithmetic/Tools/GPS.html' },
      { t: 'Quaternion Groups',                     u: 'Arithmetic/Tools/quaternion.html' },
      { t: 'Quaternion Algebras over Number Rings', u: 'Arithmetic/Tools/quaternionAlgebras/index.html' },
      { t: 'Orthogonal — O[1,1,1,−7] Polyhedron',   u: 'Arithmetic/Tools/orthogonal.html' },
      { t: 'O(1,1,x; ℤ[x]) Calculator',             u: 'Arithmetic/Tools/orthogonalGroups/index.html' },
      { t: 'Group Structure: a²+xb²=1',             u: 'Arithmetic/Tools/orthogonalGroups/group-structure.html' },
      { t: 'Integer Matrices',                      u: 'Arithmetic/Tools/integralElements/index.html' },
      { t: 'Finite Groups',                         u: 'Arithmetic/Tools/finite.html' },
    ]},
    { section: 'Geometric · Kleinian', icon: '𝕏', items: [
      { t: 'Geometric — Overview',          u: 'Geometric/index.html' },
      { t: 'Dirichlet Polyhedron Viewer',   u: 'Geometric/Tools/Kleinian/dirichlet/index.html' },
      { t: 'Hyperbolic Polyhedron Viewer',  u: 'Geometric/Tools/Kleinian/poincare/index.html' },
      { t: 'Fuchsian / H² Viewer',          u: 'Geometric/Tools/Kleinian/fuchsian/index.html' },
      { t: 'Riley Slice Explorer',          u: 'Geometric/Tools/Kleinian/riley/index.html' },
      { t: 'Riley Slice (alt)',             u: 'Geometric/Tools/Kleinian/rileySlice/index.html' },
      { t: 'Riley Half-Spaces (ℍ³)',        u: 'Geometric/Tools/Kleinian/rileyHalfspaces/index.html' },
      { t: 'Schottky Group Visualizer',     u: 'Geometric/Tools/Kleinian/schottky/index.html' },
      { t: 'Limit Sets',                    u: 'Geometric/Tools/Kleinian/limitsets.html' },
      { t: 'Cannon–Thurston',               u: 'Geometric/Tools/Kleinian/cannonThurston/index.html' },
      { t: 'Margulis Spacetimes',           u: 'Geometric/Tools/Kleinian/margulisSpacetimes/index.html' },
      { t: 'Mirror Orbifold',               u: 'Geometric/Tools/Kleinian/mirrorOrbifold/index.html' },
      { t: 'Long-Reid Racer',               u: 'Geometric/Tools/Kleinian/longReidGame/index.html' },
      { t: 'Long-Reid Racer 2',             u: 'Geometric/Tools/Kleinian/longReidRacer2/index.html' },
      { t: 'Long-Reid Racer 1',             u: 'Geometric/Tools/Kleinian/longReidRacer/index.html' },
      { t: 'KnotFolio',                     u: 'Geometric/Tools/Kleinian/knotfolio/index.html' },
      { t: 'Knot Drawing Tool',             u: 'Geometric/Tools/Kleinian/knots/index.html' },
      { t: '4D Kleinian Explorer',          u: 'Geometric/Tools/Kleinian/4dExplorer/index.html' },
      { t: '4D Kleinian Limit Sets',        u: 'Geometric/Tools/Kleinian/4dKleinian/index.html' },
      { t: '4D Kleinian Visualizer',        u: 'Geometric/Tools/Kleinian/4dKlein2/index.html' },
      { t: 'GPS Manifolds (Kleinian)',      u: 'Geometric/Tools/Kleinian/GPS/index.html' },
      { t: 'QP¹ Algorithm (S-A-X)',         u: 'Geometric/Tools/Kleinian/QP1Algorithm/index.html' },
      { t: 'QP¹ Height Reduction',          u: 'Geometric/Tools/Kleinian/qp1.html' },
      { t: 'Apollonian Packing',            u: 'Geometric/Tools/Kleinian/apollonian.html' },
      { t: 'Apollonian Packing (Dense)',    u: 'Geometric/Tools/Kleinian/apollodense.html' },
      { t: 'Coxeter Graphs',                u: 'Geometric/Tools/Kleinian/coxeter.html' },
      { t: 'Quadratic Form Reflections',    u: 'Geometric/Tools/Kleinian/quadraticForms.html' },
      { t: 'O[1,1,1,−Φ] Reflection Toolkit',u: 'Geometric/Tools/Kleinian/orthogonalPhi.html' },
      { t: 'Mandelbrot & Julia Explorer',   u: 'Geometric/Tools/Kleinian/mandelbrot.html' },
      { t: 'Julia (escape time)',           u: 'Geometric/Tools/Kleinian/julia.html' },
      { t: 'Maskit',                        u: 'Geometric/Tools/Kleinian/maskit.html' },
      { t: 'Maskit (alt 1)',                u: 'Geometric/Tools/Kleinian/maskit1.html' },
      { t: 'Maskit (alt 2)',                u: 'Geometric/Tools/Kleinian/maskit2.html' },
      { t: 'Pleating Coordinates',          u: 'Geometric/Tools/Kleinian/pleating.html' },
      { t: 'PSL(2,ℂ) → SO(3,1)',            u: 'Geometric/Tools/Kleinian/PSL2CtoSO31.html' },
      { t: 'Poincaré Polyhedron 2',         u: 'Geometric/Tools/Kleinian/poincare2/index.html' },
    ]},
    { section: 'Geometric · Euclidean', icon: '∥', items: [
      { t: 'Discrete Subgroups of Isom(ℝ²)', u: 'Geometric/Tools/Euclidean/2deuc/index.html' },
      { t: 'Discrete Subgroups of Isom(ℝ³)', u: 'Geometric/Tools/Euclidean/3deuc/index.html' },
      { t: 'Isom(ℝⁿ) over ℤ[1/m] — FAb',     u: 'Geometric/Tools/Euclidean/3dIndiscrete/index.html' },
      { t: 'Triangle-Square Tiling',         u: 'Geometric/Tools/Euclidean/triangleSquare/index.html' },
    ]},
    { section: 'Geometric · p-adic', icon: 'ℚₚ', items: [
      { t: 'Bruhat–Tits Tree Viewer',          u: 'Geometric/Tools/padicGroups/trees/index.html' },
      { t: 'Globe Game',                       u: 'Geometric/Tools/padicGroups/globeGame/index.html' },
      { t: 'Globe Game — Beam Search',         u: 'Geometric/Tools/padicGroups/globeGame/beamSearch/index.html' },
      { t: 'Globe Game — 5/13 Coordinates',    u: 'Geometric/Tools/padicGroups/globeGame/513coords.html' },
      { t: 'Quaternion Calculator',            u: 'Geometric/Tools/padicGroups/quaternionCalculator/index.html' },
      { t: 'Quaternion Calculator (Claude)',   u: 'Geometric/Tools/padicGroups/quaternionCalculatorClaude/index.html' },
      { t: 'Quaternion Calculator (Legacy)',   u: 'Geometric/Tools/padicGroups/quaternionCalculatorLegacy/index.html' },
      { t: 'Integer Quaternion Factorizer',    u: 'Geometric/Tools/padicGroups/quaternions.html' },
      { t: 'Continued Fractions',              u: 'Geometric/Tools/padicGroups/continuedFractions.html' },
      { t: 'Factor Complex Visualizer',        u: 'Geometric/Tools/padicGroups/factorComplex/index.html' },
    ]},
    { section: 'Geometric · Other', icon: '☆', items: [
      { t: 'PGL₃(ℚₚ) Building Viewer',     u: 'Geometric/SL3.html' },
      { t: 'SL₃(ℤ[½]) Dynamics',           u: 'Geometric/SL3Rcopy.html' },
      { t: 'Theta-Graph Product',          u: 'Geometric/thetaProduct.html' },
      { t: 'ℤ² ∗ ℤ in SL₃(ℤ[1/2])',        u: 'Geometric/Tools/freeProduct/index.html' },
      { t: 'Mandelbrot (WGSL)',            u: 'Geometric/Tools/mandelbrot.html' },
    ]},
    { section: 'Group Library', icon: 'Γ', items: [
      { t: 'Group Library',         u: 'GroupLibrary/index.html' },
      { t: 'SL₂(ℤ)',                u: 'GroupLibrary/Groups/SL2Z.html' },
      { t: 'SO(3,ℚ)',               u: 'GroupLibrary/Groups/SO3Q.html' },
      { t: 'ℤ² × ℤ',                u: 'GroupLibrary/Groups/Z2*Z.html' },
      { t: 'ℤ² Surface Group',      u: 'GroupLibrary/Groups/Z2SurfaceGroup.html' },
      { t: 'Long-Reid Group',       u: 'GroupLibrary/Groups/LongReid.html' },
      { t: 'Affine Groups',         u: 'GroupLibrary/Groups/AffineGroups/index.html' },
      { t: 'Word Multiplier',       u: 'GroupLibrary/word_multiplier.html' },
    ]},
    { section: 'Misc', icon: '✺', items: [
      { t: 'Misc — Overview',           u: 'misc/index.html' },
      { t: 'Braid Groups',              u: 'misc/braidGroups/index.html' },
      { t: 'Burau Relation Finder',     u: 'misc/braidGroups/burau/index.html' },
      { t: 'Penrose Tiling',            u: 'misc/penrose/index.html' },
      { t: 'Coxeter Group Explorer',    u: 'misc/coxeter/index.html' },
      { t: 'Zonotopal Tilings',         u: 'misc/zonotope/index.html' },
      { t: 'Zonotope (legacy)',         u: 'misc/zonotope.html' },
      { t: 'Zonotope Walkthrough',      u: 'misc/zonotope/walkthrough.html' },
      { t: 'Riley Slice 3D — SL(3,ℝ)',  u: 'misc/rileySlice3D/index.html' },
      { t: 'Vinberg Algorithm',         u: 'misc/vinberg.html' },
      { t: 'Lorenz Attractor',          u: 'misc/lorenz.html' },
      { t: '2-adic Solenoid',           u: 'misc/solenoid.html' },
      { t: 'IFS Explorer',              u: 'misc/contraction.html' },
      { t: 'Projector Feedback',        u: 'misc/projectorFeedback/index.html' },
      { t: 'SageMath Cell',             u: 'misc/sageTest.html' },
    ]},
  ];

  // ---- Phase 1: minimal toggle button only --------------------------------
  // Tiny CSS for the toggle so it appears with zero layout cost.
  var miniCSS = "" +
    "#golg-nav-toggle{position:fixed;top:14px;left:14px;width:42px;height:42px;border-radius:50%;border:none;background:rgba(44,62,80,.92);color:#fff;font-size:20px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:transform .2s,background .2s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}" +
    "#golg-nav-toggle:hover{background:#3498db;transform:scale(1.05)}" +
    "#golg-nav-toggle.open{background:#3498db}" +
    "@media print{#golg-nav-toggle,#golg-nav-drawer,#golg-nav-overlay{display:none!important}}";
  var miniStyle = document.createElement('style');
  miniStyle.id = 'golg-nav-mini-style';
  miniStyle.textContent = miniCSS;
  document.head.appendChild(miniStyle);

  var toggle = document.createElement('button');
  toggle.id = 'golg-nav-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Open site navigation');
  toggle.title = 'Site navigation (⌘K / Ctrl-K)';
  toggle.textContent = '☰';
  document.body.appendChild(toggle);

  // ---- Phase 2: full drawer (deferred) ------------------------------------
  var drawer, overlay, list, search;
  var built = false;
  var building = false;

  function buildDrawer() {
    if (built || building) return;
    building = true;

    var fullCSS = "" +
      "#golg-nav-drawer{position:fixed;top:0;left:0;height:100vh;width:340px;max-width:90vw;background:#fff;color:#222;box-shadow:2px 0 24px rgba(0,0,0,.18);transform:translateX(-100%);transition:transform .25s ease;display:flex;flex-direction:column;z-index:2147483599;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;will-change:transform}" +
      "#golg-nav-drawer.open{transform:translateX(0)}" +
      "#golg-nav-header{padding:16px 18px 12px;border-bottom:1px solid #e3e6ea;flex-shrink:0}" +
      "#golg-nav-header h2{margin:0 0 8px;font-size:1.05em;font-weight:600;color:#2c3e50;font-family:'Georgia',serif}" +
      "#golg-nav-search{width:100%;padding:8px 10px;border:1px solid #d0d4d8;border-radius:6px;font-size:14px;outline:none}" +
      "#golg-nav-search:focus{border-color:#3498db}" +
      "#golg-nav-list{flex:1;overflow-y:auto;padding:8px 0 16px}" +
      "#golg-nav-list .sec{padding:10px 18px 2px;font-size:.78em;letter-spacing:.06em;text-transform:uppercase;color:#7a828b;font-weight:600;display:flex;align-items:center;gap:8px}" +
      "#golg-nav-list .sec .ico{font-size:1.2em;color:#3498db}" +
      "#golg-nav-list a{display:block;padding:6px 18px 6px 34px;color:#2c3e50;text-decoration:none;font-size:13.5px;line-height:1.35;border-left:3px solid transparent}" +
      "#golg-nav-list a:hover{background:#f1f6fa;border-left-color:#3498db;color:#16466b}" +
      "#golg-nav-list a.current{background:#eaf3fb;border-left-color:#3498db;font-weight:600}" +
      "#golg-nav-list a.hidden{display:none}" +
      "#golg-nav-overlay{position:fixed;inset:0;background:rgba(0,0,0,.30);opacity:0;pointer-events:none;transition:opacity .25s;z-index:2147483598}" +
      "#golg-nav-overlay.open{opacity:1;pointer-events:auto}" +
      "@media(prefers-color-scheme:dark){#golg-nav-drawer{background:#1f2329;color:#e6e8ea}#golg-nav-list a{color:#dbe1e8}#golg-nav-list a:hover{background:#2a3038;color:#fff}#golg-nav-list .sec{color:#9aa3ad}#golg-nav-search{background:#2a3038;color:#e6e8ea;border-color:#3a4048}#golg-nav-header{border-bottom-color:#2a3038}#golg-nav-header h2{color:#e6e8ea}}";
    var fullStyle = document.createElement('style');
    fullStyle.id = 'golg-nav-full-style';
    fullStyle.textContent = fullCSS;
    document.head.appendChild(fullStyle);

    overlay = document.createElement('div');
    overlay.id = 'golg-nav-overlay';

    drawer = document.createElement('aside');
    drawer.id = 'golg-nav-drawer';
    drawer.setAttribute('aria-label', 'Site navigation');

    var header = document.createElement('div');
    header.id = 'golg-nav-header';
    header.innerHTML = '<h2>Geometry of Linear Groups</h2><input id="golg-nav-search" type="search" placeholder="Filter pages…" autocomplete="off" />';

    list = document.createElement('nav');
    list.id = 'golg-nav-list';

    var here = location.pathname;
    function isCurrent(absUrl) {
      try { return new URL(absUrl, location.href).pathname === here; }
      catch (e) { return false; }
    }

    // Build with a string + single innerHTML (faster than many createElement
    // calls) then attach event delegation rather than per-anchor listeners.
    var html = '';
    for (var s = 0; s < MANIFEST.length; s++) {
      var sec = MANIFEST[s];
      html += '<div class="sec"><span class="ico">' + sec.icon + '</span> ' + sec.section + '</div>';
      for (var i = 0; i < sec.items.length; i++) {
        var it = sec.items[i];
        var href = BASE + it.u;
        var cur = isCurrent(href) ? ' class="current"' : '';
        var ds = (it.t + ' ' + sec.section).toLowerCase().replace(/"/g, '&quot;');
        html += '<a href="' + href + '"' + cur + ' data-search="' + ds + '">' + it.t + '</a>';
      }
    }
    list.innerHTML = html;

    drawer.appendChild(header);
    drawer.appendChild(list);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    search = document.getElementById('golg-nav-search');
    overlay.addEventListener('click', close);
    search.addEventListener('input', onSearch);

    built = true;
    building = false;
  }

  function onSearch() {
    var q = search.value.trim().toLowerCase();
    var anchors = list.querySelectorAll('a');
    for (var k = 0; k < anchors.length; k++) {
      var a = anchors[k];
      if (!q || a.dataset.search.indexOf(q) >= 0) a.classList.remove('hidden');
      else a.classList.add('hidden');
    }
    var heads = list.querySelectorAll('.sec');
    for (var h = 0; h < heads.length; h++) {
      var hd = heads[h], n = hd.nextElementSibling, anyVis = false;
      while (n && !n.classList.contains('sec')) {
        if (!n.classList.contains('hidden')) { anyVis = true; break; }
        n = n.nextElementSibling;
      }
      hd.style.display = anyVis ? '' : 'none';
    }
  }

  function open() {
    if (!built) buildDrawer();
    drawer.classList.add('open');
    overlay.classList.add('open');
    toggle.classList.add('open');
    toggle.textContent = '✕';
    setTimeout(function () { search && search.focus(); }, 60);
    if (open._first !== false) {
      open._first = false;
      var cur = list.querySelector('a.current');
      if (cur) cur.scrollIntoView({ block: 'center' });
    }
  }
  function close() {
    if (!drawer) return;
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    toggle.classList.remove('open');
    toggle.textContent = '☰';
  }

  toggle.addEventListener('click', function () {
    if (drawer && drawer.classList.contains('open')) close(); else open();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) close();
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (drawer && drawer.classList.contains('open')) close(); else open();
    }
  });

  // Pre-build the drawer in idle time so the first click feels instant —
  // but only after the page has had time to paint and run its initial JS.
  function schedule() {
    if (built) return;
    var idle = window.requestIdleCallback;
    if (idle) idle(function () { buildDrawer(); }, { timeout: 4000 });
    else setTimeout(buildDrawer, 2500);
  }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
