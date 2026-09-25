(() => {
  if (window.self !== window.top) return;
  const url = new URL(location.href);
  if (url.searchParams.has('standalone')) return;
  const id = url.pathname.split('/').filter(Boolean).filter(p => p !== 'index.html').pop();
  const target = new URL('../stage.html', url);
  target.search = url.search;
  target.searchParams.set('viz', id);
  location.replace(target.href);
})();
