// Boot: on its own (talks to library/server.mjs) or inside alphaCentaur
// (index.html?host=alphacentaur in a same-origin frame; see backend-host.js).
import {httpBackend} from './backend-http.js';
import {hostBackend} from './backend-host.js';
import {start} from './app.js';
import {h, icon, replace} from './ui.js';

const host = new URLSearchParams(location.search).get('host');
const embedded = !!host && window.parent !== window;
if (embedded) {
  document.documentElement.dataset.host = host;
  document.documentElement.dataset.theme = 'light'; // alphaCentaur is light-only
}
const root = document.getElementById('app');
const backend = embedded ? hostBackend(host) : httpBackend();

// The host may still be attaching its listener when the frame loads.
const hello = backend.hello;
backend.hello = async () => {
  if (!embedded) return hello();
  for (let attempt = 0; ; attempt++) {
    const reply = await Promise.race([hello(), new Promise(r => setTimeout(() => r(null), 1500))]);
    if (reply) return reply;
    if (attempt > 8) throw new Error('alphaCentaur did not answer.');
  }
};

start(root, backend).catch(e => {
  console.error(e);
  replace(root, h('div', {class: 'boot failed'}, icon('alert', 28), h('h2', {}, 'The library could not open'),
    h('p', {}, e.message || String(e)),
    embedded ? null : h('p', {class: 'hint'}, 'Start it with ', h('code', {}, 'node library/server.mjs <folder>'), ' and open the address it prints.'),
    h('button', {class: 'btn', onclick: () => location.reload()}, 'Try again')));
});
