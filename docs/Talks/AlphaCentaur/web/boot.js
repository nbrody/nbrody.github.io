// alphaCentaur's web demo: starts an editor (its js/main.js) once the service
// worker that stands in for its folder server (sw.js, beside this file) is in
// control of the page. scripts/build-web-demo.mjs points each editor's
// index.html here instead of at js/main.js.
const here = new URL('./', import.meta.url);

function problem(text) {
  const p = document.createElement('p');
  p.style.cssText = 'margin:40px auto;max-width:520px;padding:16px 20px;border-radius:12px;background:#fff4e5;color:#5b3a06;font:15px/1.5 system-ui,sans-serif';
  p.textContent = text;
  document.body.append(p);
}

async function start() {
  if (!('serviceWorker' in navigator) || !('indexedDB' in self)) {
    problem('This web demo needs a browser with service workers and IndexedDB (and not a private window). Try Chrome, Safari or Firefox.');
    return false;
  }
  await navigator.serviceWorker.register(new URL('sw.js', here), { type: 'module', scope: here.pathname });
  if (!navigator.serviceWorker.controller) {
    // The first visit: wait for the worker to take control (it claims open pages).
    const took = await Promise.race([
      new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(true), { once: true })),
      new Promise((r) => setTimeout(() => r(false), 6000)),
    ]);
    if (!took) { problem('The web demo could not start (a hard reload skips its service worker). Reload the page normally.'); return false; }
  }
  return true;
}

try {
  if (await start()) await import(new URL('js/main.js', location.href).href);
} catch (e) {
  problem(`The web demo could not start: ${e.message || e}`);
}
