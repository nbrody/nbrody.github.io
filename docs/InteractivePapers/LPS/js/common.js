// LPS figure helpers: the shared ones (../../core/common.js) plus this paper's colour roles.
export * from '../../core/common.js';
import { palette as basePalette, cssVar } from '../../core/common.js';

/** Theme colours, read at draw time. Roles are fixed across the page (see style.css). */
export function palette() {
  return Object.assign(basePalette(), {
    graph: cssVar('--c-graph'),       // X^{p,q}, its eigenvalues, the primary object
    count: cssVar('--c-count'),       // quaternion counts r_Q, the arithmetic side
    trivial: cssVar('--c-trivial'),   // trivial eigenvalues ±(p+1), main term C(p^k)
    tree: cssVar('--c-tree'),         // the tree, the free group Λ(2)
    window: cssVar('--c-window'),     // the Ramanujan window [−2√p, 2√p] (a fill)
  });
}
