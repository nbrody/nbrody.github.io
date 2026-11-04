// LPS page: the shared machinery (../../interactivePaper.js) with this paper's figures and companion pages.
import { initPaper } from '../../interactivePaper.js';
import * as companions from './companions-data.js';

initPaper({
  subtitle: 'Lubotzky · Phillips · Sarnak, 1988',
  filterHint: 'Jump to… (e.g. 4.15, girth)',
  companions,
  modules: {
    generators: () => import('./fig-generators.js'),
    tree: () => import('./fig-tree.js'),
    girth: () => import('./fig-girth.js'),
    kesten: () => import('./fig-kesten.js'),
    trace: () => import('./fig-trace.js'),
    mainterm: () => import('./fig-mainterm.js'),
    projective: () => import('./fig-projective.js'),
    balls: () => import('./fig-balls.js'),
    // the harmonic-analysis supplement
    waves: () => import('./fig-waves.js'),
    lift: () => import('./fig-lift.js'),
    singular: () => import('./fig-singular.js'),
    duals: () => import('./fig-duals.js'),
    squares: () => import('./fig-squares.js'),
  },
});
