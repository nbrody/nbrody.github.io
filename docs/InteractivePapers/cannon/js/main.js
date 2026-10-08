// Lazy-mount figures, TOC highlighting, theme toggle.

const modules = {
  sphere: () => import('./fig-sphere.js'),
  modulus: () => import('./fig-modulus.js'),
  structures: () => import('./fig-structures.js'),
  blocker: () => import('./fig-blocker.js'),
  transverse: () => import('./fig-transverse.js'),
  flow: () => import('./fig-flow.js'),
  pairs: () => import('./fig-pairs.js'),
};

function mountFigure(fig) {
  if (fig.dataset.mounted) return;
  fig.dataset.mounted = '1';
  const mount = fig.querySelector('.fig-mount');
  const loader = modules[fig.dataset.fig];
  if (!loader) return;
  loader().then((m) => m.mount(mount)).catch((err) => {
    console.error(err);
    mount.innerHTML = '<div class="fallback">This figure could not be loaded: ' + String(err.message || err) + '</div>';
  });
}

const figs = [...document.querySelectorAll('figure.fig[data-fig]')];
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { mountFigure(e.target); io.unobserve(e.target); }
  }, { rootMargin: '600px 0px' });
  figs.forEach((f) => io.observe(f));
} else {
  figs.forEach(mountFigure);
}

// Theme toggle (persists a per-viewer preference).
const toggle = document.getElementById('theme-toggle');
toggle.addEventListener('click', () => {
  const root = document.documentElement;
  const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const cur = root.dataset.theme || (sysDark ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('ip-theme', next); } catch (e) { /* storage unavailable */ }
  window.dispatchEvent(new Event('ip-theme'));
});

// TOC highlighting.
const links = [...document.querySelectorAll('nav.toc a')];
const targets = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
let tocQueued = false;
function updateToc() {
  tocQueued = false;
  let best = null;
  for (const t of targets) if (t.getBoundingClientRect().top < window.innerHeight * 0.3) best = t;
  links.forEach((a) => a.classList.toggle('active', !!best && a.getAttribute('href') === '#' + best.id));
}
window.addEventListener('scroll', () => { if (!tocQueued) { tocQueued = true; requestAnimationFrame(updateToc); } }, { passive: true });
updateToc();
