/**
 * finite.js — Γ at the finite places of F = ℚ(w), with trees' engine.
 *
 * At a prime 𝔭 of F, PGL₂(F_𝔭) acts on its Bruhat–Tits tree, and the
 * stabilizer of the standard vertex O_𝔭² is PGL₂(O_𝔭) (compact). A normalized
 * generator (one entry equal to 1) fixes that vertex when its entries are
 * 𝔭-integral and its determinant is a 𝔭-unit; so outside the primes dividing
 * a denominator of a coordinate or the norm of a determinant (field.js,
 * `numbers`), Γ lies in PGL₂(O_𝔭): it is bounded, and then discrete iff finite.
 *
 *   • one "generic" prime p₀ outside that set decides finiteness, for all of
 *     them at once (trees' decide: bounded ⇒ discrete iff finite);
 *   • every 𝔭 above the remaining primes is decided on its own, by trees'
 *     decide (Serre/Helly boundedness, Conder, Markowitz, congruence kernels).
 *
 * The engine is passed in (`deps`), so this runs in a worker or under Node:
 *   deps = { NR, GlobalField, Place, decide, serializeDecision }
 * Progress goes to emit(message); see runFinite for the messages.
 */

const SMALL = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n];

/** The field and the generators, from the job (polynomials in w, ringEngine syntax). */
export function readJob(deps, job) {
    const { GlobalField } = deps;
    const F = new GlobalField(job.poly ? { gen: 'w', poly: job.poly } : null);
    const mats = job.mats.map((m) => {
        const [a, b, c, d] = m.map((s) => F.parse(s));
        return { a, b, c, d };
    });
    return { F, mats };
}

/** max(0, v(det) − 2·min v(entries)) = 0 for every generator: Γ fixes the standard vertex. */
function fixesStandardVertex(F, place, mats) {
    for (const m of mats) {
        const det = F.sub(F.mul(m.a, m.d), F.mul(m.b, m.c));
        const vmin = Math.min(...['a', 'b', 'c', 'd'].map((k) => place.val(m[k])));
        if (place.val(det) - 2 * vmin !== 0) return false;
    }
    return true;
}

/**
 * An element with positive valuation at the index-th prime above p and none
 * at the others, as text both trees (expr.js) and ringEngine read: trees uses
 * it (`primeOf`) to pick the same prime whatever its ordering.
 */
function separatingElement(deps, F, places, index) {
    const p = places[0].p;
    if (places.length === 1) return String(p);
    const tries = [];
    const P = Number(p);
    for (let c = 0; c < Math.min(P, 60); c++) tries.push(c === 0 ? 'w' : `w-${c}`, c === 0 ? null : `w+${c}`);
    for (let c = 0; c < Math.min(P, 20); c++) tries.push(`w^2-${c}`, `w^2+w-${c}`);
    for (const src of tries) {
        if (!src) continue;
        let x;
        try { x = F.parse(src); } catch (e) { continue; }
        const v = places.map((pl) => pl.val(x));
        if (v[index] > 0 && v.every((t, j) => j === index || t === 0)) return src;
    }
    return null;
}

/** Factor the job's numbers into the candidate primes (ascending). */
export function candidatePrimes(deps, numbers) {
    const { factorInt } = deps.NR._internal;
    const ps = new Set();
    let complete = true;
    for (const s of numbers) {
        const r = factorInt(BigInt(s));
        if (!r.complete) complete = false;
        for (const [p] of r.factors) ps.add(p);
    }
    return { primes: [...ps].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), complete };
}

/** Is the integer prime (for the unfactored remainders)? */
const isPrime = (deps, p) => deps.NR._internal.isProbablePrime(p);

/**
 * Decide Γ at every finite place. Messages:
 *   { type: 'field', n, describe }
 *   { type: 'primes', primes: [p], complete, capped }
 *   { type: 'generic', p, decision }           — every prime outside `primes`
 *   { type: 'place', key, p, index, count, e, f, q, primeTex, primeOf, status, decision?, reason? }
 *        status: 'standard' (Γ fixes the standard vertex: as generic), 'decided', 'error'
 *   { type: 'done' }
 */
export function runFinite(deps, job, emit) {
    const { Place, decide, serializeDecision } = deps;
    const { F, mats } = readJob(deps, job);
    const seconds = job.seconds || 4;
    emit({ type: 'field', n: F.n, describe: F.describe() });

    const { primes: all, complete } = candidatePrimes(deps, job.numbers || []);
    const primes = all.filter((p) => isPrime(deps, p));
    const cap = job.maxPrimes || 12;
    emit({ type: 'primes', primes: primes.slice(0, cap).map(String), complete: complete && primes.length === all.length, capped: primes.length > cap ? primes.length : 0 });

    // the generic prime: the least prime outside the list, inert or not
    const bad = new Set(primes.map(String));
    let p0 = SMALL.find((p) => !bad.has(String(p)));
    if (!p0) { p0 = 101n; while (bad.has(String(p0)) || !isPrime(deps, p0)) p0 += 2n; }
    try {
        const place = new Place(F, p0, 0);
        const r = decide(place, mats, place.canon(F.zero(), 0), { seconds });
        emit({ type: 'generic', p: String(p0), decision: serializeDecision(F, r) });
    } catch (e) {
        emit({ type: 'generic', p: String(p0), error: e.message || String(e) });
    }

    for (const p of primes.slice(0, cap)) {
        let prs;
        try { prs = F.primesAbove(p); } catch (e) {
            emit({ type: 'place', key: `p${p}`, p: String(p), index: 0, count: 1, status: 'error', reason: e.message });
            continue;
        }
        const places = prs.map((pr, i) => { try { return new Place(F, p, i); } catch (e) { return { error: e.message, pr }; } });
        prs.forEach((pr, i) => {
            const base = {
                type: 'place', key: `p${p}_${i}`, p: String(p), index: i, count: prs.length,
                e: pr.e, f: pr.f, q: `${p}${pr.f > 1 ? '^' + pr.f : ''}`,
            };
            try { base.primeTex = F.primeTex(pr); } catch (e) { base.primeTex = null; }
            const place = places[i];
            if (place.error) { emit({ ...base, status: 'error', reason: place.error }); return; }
            base.q = String(place.q);
            if (places.every((pl) => !pl.error)) base.primeOf = separatingElement(deps, F, places, i);
            try {
                if (fixesStandardVertex(F, place, mats)) { emit({ ...base, status: 'standard' }); return; }
                const r = decide(place, mats, place.canon(F.zero(), 0), { seconds });
                emit({ ...base, status: 'decided', decision: serializeDecision(F, r) });
            } catch (e) {
                emit({ ...base, status: 'error', reason: e.message || String(e) });
            }
        });
    }
    emit({ type: 'done' });
}
