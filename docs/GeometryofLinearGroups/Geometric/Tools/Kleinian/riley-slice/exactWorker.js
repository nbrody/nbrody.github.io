/* exactWorker.js -- factors an integer polynomial over Q, off the main thread.

   The page sends the polynomial of a clicked dot or bead (Phi_{p/q} + 2, or
   psi_n(-Phi_{p/q})) and gets back its irreducible factors, made primitive
   integer polynomials.  This is the Zassenhaus factoriser of the Dirichlet
   tool's number fields; its recombination step is exponential in the number
   of factors modulo the chosen prime, so the page terminates this worker if
   an answer takes too long.  Coefficients travel as decimal strings,
   ascending.                                                               */

import { factorQ } from '../../../../assets/js/hyperbolic/zfactor.js';
import { Frac } from '../../../../assets/js/hyperbolic/exact.js';

onmessage = (e) => {
  const { id, coeffs } = e.data;
  try {
    const facs = factorQ(coeffs.map(s => new Frac(BigInt(s)))).map(f => {
      let L = 1n;                                // monic over Q: clear denominators
      for (const c of f) { let a = L, b = c.q; while (b) [a, b] = [b, a % b]; L = L / a * c.q; }
      return f.map(c => (c.p * (L / c.q)).toString());
    });
    postMessage({ id, facs });
  } catch (err) {
    postMessage({ id, error: String((err && err.message) || err) });
  }
};
