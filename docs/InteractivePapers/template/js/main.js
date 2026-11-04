// TEMPLATE paper: the shared machinery (../../interactivePaper.js) with this paper's figures and companion pages.
import { initPaper } from '../../interactivePaper.js';
import * as companions from './companions-data.js';

initPaper({
  subtitle: 'Authors, year',
  filterHint: 'Jump to… (e.g. 1.1)',
  companions,
  modules: {
    example: () => import('./fig-example.js'),
  },
});
