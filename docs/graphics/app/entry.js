(() => {
  if (window.self !== window.top) return;
  const url = new URL(location.href);
  if (url.searchParams.has('standalone')) return;
  // The graphics root is the folder above this script. A visualization's id is its page's
  // folder below that root: "mandelbrot", or "deadSphere/liftoff" for a nested one.
  const root = new URL('..', document.currentScript.src);
  const id = url.pathname.slice(root.pathname.length).replace(/(^|\/)index\.html$/, '').replace(/\/+$/, '');
  const target = new URL('stage.html', root);
  target.search = url.search;
  target.searchParams.set('viz', id);
  location.replace(target.href);
})();
