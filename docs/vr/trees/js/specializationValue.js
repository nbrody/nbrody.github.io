/** Parse the specialization value using the desktop 2dimFields readers. */
import { parseRat } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/polyParse.js';
import { parseComplex } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cparse.js';
export function parseSpecialization(field, source) {
  if (field === 'Q') {
    const {num,den}=parseRat(source);
    if (den.length!==1 || num.length>1) throw new Error('Enter a rational number for t.');
    if (!num.length || num[0].isZero()) throw new Error('t = 0 is not allowed.');
    return num[0];
  }
  if (field !== 'i' && field !== 'omega') throw new Error('Unknown coefficient field.');
  const z=parseComplex(source);
  if (Math.hypot(...z)<1e-9) throw new Error('t = 0 or a value too close to zero is not allowed.');
  return z;
}
