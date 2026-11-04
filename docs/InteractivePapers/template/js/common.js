// TEMPLATE paper figure helpers: the shared ones (../../core/common.js) plus this paper's colour roles.
export * from '../../core/common.js';
import { palette as basePalette, cssVar } from '../../core/common.js';

export function palette() {
  return Object.assign(basePalette(), {
    main: cssVar('--c-main'),       // the primary object
    second: cssVar('--c-second'),   // the second object
  });
}
