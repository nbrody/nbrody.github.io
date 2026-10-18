/**
 * Worker for step 3 when Γ is bounded at every prime over a field with infinitely many units:
 * the search for a full lattice of unipotents at a cusp (cusps.js).
 *
 * In:  { id, gens, poly, root, maxElements, seconds, words?, pool? }   Out: { id, result } or { id, error }.
 * With words, the certificate is for the subgroup they generate (the stabilizer check of step 3);
 * with pool, for Γ with these words (FlashBeam's lowest elements) added to the search.
 */
import '../../Algebraic/Tools/numberRings/ringEngine.js';      // for valuations at the primes of S (cusps.js)
import { cuspCertificate, cuspCertificateWords, cuspCertificatePool } from './cusps.js';

self.onmessage = (ev) => {
    const { id, gens, poly, root, maxElements, seconds, words, pool } = ev.data;
    try {
        // words: the subgroup they generate (the elements of Γ fixing o), else Γ itself
        const result = pool ? cuspCertificatePool(gens, poly.map(BigInt), pool, root, { maxElements: Math.min(maxElements, 20000), seconds })
            : words ? cuspCertificateWords(gens, poly.map(BigInt), words, root, { maxElements, seconds })
                : cuspCertificate(gens, poly.map(BigInt), root, { maxElements, seconds });
        self.postMessage({ id, result });
    }
    catch (e) { self.postMessage({ id, error: e.message || String(e) }); }
};
