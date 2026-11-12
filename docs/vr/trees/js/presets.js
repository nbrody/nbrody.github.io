/** Desktop 2dimFields examples, parsed by the same exact field engines. */
import { EXAMPLES } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/examples.js';
import { parseRat } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/polyParse.js';
import { polyMatrix } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/poly.js';
import { fromPoly, det, adj } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { ballEngine } from './ballTree.js';

export function fieldExamples(field) {
  return EXAMPLES.filter(example => field === 'Q' ? !example.field : example.field === field);
}
export function presetMatrix(field, entries, inverse = false) {
  const M = field === 'Q'
    ? polyMatrix(entries.map(entry => parseRat(entry))).map(fromPoly)
    : ballEngine(field).matrixOf(entries.map(entry => ballEngine(field).parse(entry)));
  if (det(M).isZero()) throw new Error('This generator is singular.');
  return inverse ? adj(M) : M;
}
export const matrixTex = entries => `\\begin{pmatrix}${entries[0]}&${entries[1]}\\\\${entries[2]}&${entries[3]}\\end{pmatrix}`;
