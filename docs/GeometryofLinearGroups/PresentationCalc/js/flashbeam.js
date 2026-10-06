/**
 * flashbeam.js — FlashBeam, a beam search over the words of a group.
 *
 * Port of python/flashBeam/flashbeam.py. Each iteration multiplies every
 * element of the beam by every element of the expansion pool, which is the
 * generators plus a persistent "flash" of the best elements seen so far. The
 * best children (lowest score) form the next beam. Because the flash holds
 * long words that already score well, the search takes large steps through
 * the group, not one letter at a time.
 *
 * Changes from the Python version:
 *   • step() runs one iteration, so a worker can report between iterations;
 *   • children are formed on both sides (b·x and x·b), so elements of the
 *     flash act on the beam by conjugation-like moves as well as by
 *     extension;
 *   • the next beam is stratified by the problem's `stratum` (for example the
 *     displacement in a tree), so one stratum cannot crowd out the others;
 *   • the visited set is bounded: past maxVisited it restarts from the beam.
 *
 * A problem supplies
 *   generators()     the letters, as nodes
 *   identity()       the empty word
 *   multiply(a, b)   the node for a·b (null to discard it)
 *   isIdentity(n)    true for the identity element (never kept in the flash)
 *   visit(n)         called once for every new node (record hits here)
 *   done()           true when the search has what it needs
 * and nodes { state, word, key, score, stratum }. Words are arrays of signed
 * letters ±(i+1); see `concatWords`.
 */

/** u·v as freely reduced words. */
export function concatWords(u, v) {
    let i = u.length, j = 0;
    while (i > 0 && j < v.length && u[i - 1] === -v[j]) { i--; j++; }
    if (i === u.length) return j === 0 ? u.concat(v) : u.concat(v.slice(j));
    return u.slice(0, i).concat(v.slice(j));
}

export function invertWord(u) {
    const out = new Array(u.length);
    for (let i = 0; i < u.length; i++) out[i] = -u[u.length - 1 - i];
    return out;
}

const byScore = (a, b) => a.score - b.score;

export class FlashBeam {
    /**
     * @param problem   see above
     * @param opts.beamWidth   nodes kept per iteration
     * @param opts.flashSize   size of the persistent flash (0: a plain beam search)
     * @param opts.strata      fractions of the beam reserved for strata 0, 1, …;
     *                         the last fraction is shared by every higher stratum
     * @param opts.twoSided    also form x·b for x in the pool
     * @param opts.maxVisited  bound on the visited set
     */
    constructor(problem, opts = {}) {
        this.problem = problem;
        this.beamWidth = opts.beamWidth ?? 2000;
        this.flashSize = opts.flashSize ?? 40;
        this.strata = opts.strata ?? null;
        this.twoSided = opts.twoSided ?? true;
        this.maxVisited = opts.maxVisited ?? 1500000;
        this.flashSplit = opts.flashSplit ?? null;    // (node) → bucket name, for a balanced flash
        this.iteration = 0;
        this.visited = new Set();
        this.beam = [];
        this.flash = [];
        this.generators = [];
        this.started = false;
        this.exhausted = false;
    }

    _see(node) {
        if (this.visited.has(node.key)) return false;
        this.visited.add(node.key);
        this.problem.visit(node);
        return true;
    }

    start() {
        const P = this.problem;
        const root = P.identity();
        this.generators = P.generators();
        this._see(root);
        for (const g of this.generators) this._see(g);
        this.beam = [root, ...this.generators];
        this.flash = this.flashSize > 0 ? this.generators.filter((g) => !P.isIdentity(g)) : [];
        this.started = true;
    }

    /** The expansion pool: the flash, then the generators, without repeats. */
    pool() {
        const out = [], seen = new Set();
        for (const n of this.flash.concat(this.generators)) {
            if (seen.has(n.key)) continue;
            seen.add(n.key);
            out.push(n);
        }
        return out;
    }

    /** One iteration. Returns its statistics. */
    step() {
        if (!this.started) this.start();
        const P = this.problem, t0 = Date.now();
        const pool = this.pool();
        const children = [];
        const take = (c) => { if (c && this._see(c)) children.push(c); };
        for (const b of this.beam) {
            for (const x of pool) {
                take(P.multiply(b, x));
                if (this.twoSided) take(P.multiply(x, b));
                if (P.done()) break;
            }
            if (P.done()) break;
        }
        this.iteration++;
        if (!children.length) {
            this.exhausted = true;
            return this._stats(t0, pool.length, 0);
        }
        this.beam = this._select(children);
        this._updateFlash();
        if (this.visited.size > this.maxVisited) {
            this.visited = new Set(this.beam.map((n) => n.key).concat(this.flash.map((n) => n.key)));
        }
        return this._stats(t0, pool.length, children.length);
    }

    /** The next beam: the best nodes of each stratum, within its quota. */
    _select(children) {
        const W = this.beamWidth;
        if (children.length <= W) return children.sort(byScore);
        if (!this.strata) return smallest(children, W);
        const S = this.strata, last = S.length - 1;
        const buckets = S.map(() => []);
        for (const c of children) buckets[Math.min(c.stratum ?? last, last)].push(c);
        const out = [];
        let spare = 0;
        buckets.forEach((b, i) => {
            const quota = Math.floor(S[i] * W);
            if (b.length <= quota) { out.push(...b); spare += quota - b.length; buckets[i] = []; }
            else { const best = smallest(b, quota); out.push(...best); buckets[i] = b.length > quota ? b : []; }
        });
        // hand the unused quota to the best of what was left out
        if (spare > 0) {
            const kept = new Set(out.map((n) => n.key));
            const rest = [];
            for (const b of buckets) for (const n of b) if (!kept.has(n.key)) rest.push(n);
            out.push(...smallest(rest, spare));
        }
        return out.sort(byScore);
    }

    /** The flash: the best non-identity nodes seen so far (balanced across buckets when asked). */
    _updateFlash() {
        if (this.flashSize <= 0) return;
        const P = this.problem;
        const all = this.flash.concat(this.beam).filter((n) => !P.isIdentity(n));
        all.sort(byScore);
        const out = [], seen = new Set();
        if (this.flashSplit) {
            const groups = new Map();
            for (const n of all) {
                if (seen.has(n.key)) continue;
                seen.add(n.key);
                const g = this.flashSplit(n);
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g).push(n);
            }
            // round-robin over the buckets, best first in each
            const lists = [...groups.values()];
            for (let i = 0; out.length < this.flashSize; i++) {
                let any = false;
                for (const L of lists) if (i < L.length && out.length < this.flashSize) { out.push(L[i]); any = true; }
                if (!any) break;
            }
        } else {
            for (const n of all) {
                if (seen.has(n.key)) continue;
                seen.add(n.key);
                out.push(n);
                if (out.length >= this.flashSize) break;
            }
        }
        this.flash = out;
    }

    _stats(t0, poolSize, children) {
        const best = this.beam[0];
        return {
            iteration: this.iteration, frontier: this.beam.length, pool: poolSize, children,
            visited: this.visited.size, best: best ? best.score : null, ms: Date.now() - t0,
            exhausted: this.exhausted,
        };
    }
}

/** The k nodes of least score (partial selection; order not guaranteed). */
function smallest(nodes, k) {
    if (k <= 0) return [];
    if (nodes.length <= k) return nodes.slice();
    // quickselect on score
    const a = nodes.slice();
    let lo = 0, hi = a.length - 1;
    while (lo < hi) {
        const pivot = a[(lo + hi) >> 1].score;
        let i = lo, j = hi;
        while (i <= j) {
            while (a[i].score < pivot) i++;
            while (a[j].score > pivot) j--;
            if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
        }
        if (k - 1 <= j) hi = j;
        else if (k - 1 >= i) lo = i;
        else break;
    }
    return a.slice(0, k);
}
