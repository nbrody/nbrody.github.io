// Cannon's conjecture (modulus proof): the shared machinery (../../interactivePaper.js) with this
// paper's figures and companion pages.
import { initPaper } from '../../interactivePaper.js';
import * as companions from './companions-data.js';

initPaper({
  subtitle: 'OpenAI · preprint, September 23, 2026',
  filterHint: 'Jump to… (e.g. 3.4, blocker)',
  companions,
  modules: {
    sphere: () => import('./fig-sphere.js'),
    structure: () => import('./fig-structure.js'),
    blocker: () => import('./fig-blocker.js'),
    modulus: () => import('./fig-modulus.js'),
    levels: () => import('./fig-levels.js'),
    transverse: () => import('./fig-transverse.js'),
    flow: () => import('./fig-flow.js'),
    pairs: () => import('./fig-pairs.js'),
  },
});
