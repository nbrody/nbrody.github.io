/**
 * relators.js — the relators FlashBeam's collisions find, without the redundant ones.
 *
 * Two words reaching one element give a relator; most of them are consequences of
 * shorter ones (g₂⁴ after g₂², g₂⁻² g₁⁻¹ g₂⁻² g₁ after g₂², …). A relator is kept only
 * if a Dehn-style reduction by the relators already kept does not cancel it: replace a
 * cyclic subword p of more than half of a relator R = p q (any rotation of R or R⁻¹) by
 * q⁻¹, and reduce freely and cyclically, until no piece fits. Every step is an equality
 * modulo the kept relators, so a word reduced to nothing is a consequence of them; a word
 * that is not reduced may still be one (the test is sound, not complete).
 *
 * A relator that survives is first normalized modulo the kept ones: shortened by the same
 * pieces, then moved by exact half pieces (|p| = |R|/2, e.g. s ↦ s⁻¹ from s²) to the least
 * canonical form. Equivalent relators so land on one word, and the kept word is the shortest
 * and least one found.
 *
 * A kept power relator x^n gives x order n: every exponent of x is then reduced into
 * (−n/2, n/2] (so x⁻¹ is written x when n = 2) before anything is compared, which the half
 * pieces of x^n alone do only one letter at a time, and greedily.
 *
 * When a relator is kept, the longer ones it makes redundant are dropped. At the cap a new
 * relator replaces the longest kept one only if it is shorter. Rejected relators are
 * remembered, so repeated collisions cost one lookup.
 *
 * The piece table records which relator each piece comes from, so a relator is tested
 * against the others by skipping its own pieces: one table serves the whole pruning pass
 * (rebuilding it once per relator took most of FlashBeam's time).
 */

import { canonicalRelator as canonicalFree } from './adelic.js';
import { powerReduce } from './presentation.js';

/** free and cyclic reduction */
export function reduceCyclic(word) {
    const st = [];
    for (const x of word) { if (st.length && st[st.length - 1] === -x) st.pop(); else st.push(x); }
    let i = 0, j = st.length;
    while (j - i > 1 && st[i] === -st[j - 1]) { i++; j--; }
    return st.slice(i, j);
}
const inverse = (w) => w.map((x) => -x).reverse();
function keyLess(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i];
    return a.length < b.length;
}
const keyOf = (w) => w.join(',');

/** x ↦ n for the pure powers x^n among the relators (the gcd, if several) */
function ordersOf(list) {
    const orders = new Map();
    const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
    for (const w of list) if (w.length && w.every((x) => Math.abs(x) === Math.abs(w[0]))) {
        const g = Math.abs(w[0]);
        orders.set(g, gcd(orders.get(g) || 0, w.length));
    }
    return orders;
}
const isPower = (w) => w.length > 0 && w.every((x) => Math.abs(x) === Math.abs(w[0]));

export class RelatorSet {
    constructor({ cap = 64 } = {}) {
        this.cap = cap;
        this.list = [];             // kept relators (canonical words)
        this.keys = new Set();
        this.rejected = new Set();  // canonical keys found redundant
        this._table = null;         // piece → replacement, for the kept relators
        this.redundant = 0;
    }

    /**
     * The pieces of the kept relators: p ↦ q⁻¹ for R = p q, |p| > |R|/2, each with the index of
     * its relator. table and half map a key to its candidates, shortest replacement first (in list
     * order among equal lengths), so the first one not skipped is what a table built without the
     * skipped relators would hold.
     */
    _pieces() {
        const table = new Map(), lengths = new Set(), half = new Map(), halfLengths = new Set();
        this.list.forEach((R, owner) => {
            const power = isPower(R);
            for (const u of [R, inverse(R)]) {
                const n = u.length;
                for (let r = 0; r < n; r++) {
                    const rot = u.slice(r).concat(u.slice(0, r));
                    let k = '';
                    for (let L = 1; L <= n; L++) {
                        k = L === 1 ? String(rot[0]) : k + ',' + rot[L - 1];
                        if (L === n / 2 && !power) {
                            if (!half.has(k)) half.set(k, []);
                            half.get(k).push({ repl: inverse(rot.slice(L)), owner });
                            halfLengths.add(L);
                        }
                        if (2 * L <= n) continue;
                        const repl = inverse(rot.slice(L));
                        const list = table.get(k);
                        if (!list) table.set(k, [{ repl, owner }]);
                        else {
                            // keep the candidates sorted by length, stable among equal lengths
                            let at = list.length;
                            while (at > 0 && list[at - 1].repl.length > repl.length) at--;
                            list.splice(at, 0, { repl, owner });
                        }
                        lengths.add(L);
                    }
                }
            }
        });
        return { table, lengths: [...lengths].sort((a, b) => b - a), half, halfLengths: [...halfLengths], orders: ordersOf(this.list) };
    }
    _tableAll() { if (!this._table) this._table = this._pieces(); return this._table; }

    /** The least rotation of w or w⁻¹, exponents reduced modulo the orders. */
    canonical(word, orders = this._tableAll().orders) {
        const w = powerReduce(canonicalFree(word), orders, true);
        if (!w.length) return [];
        let best = null;
        for (const u of [w, powerReduce(inverse(w), orders, true)]) for (let i = 0; i < u.length; i++) {
            const r = u.slice(i).concat(u.slice(0, i));
            if (!best || keyLess(r, best)) best = r;
        }
        return best;
    }

    /**
     * The word reduced modulo the kept relators: shortened by pieces, then least by half pieces.
     * skip: indices of kept relators to leave out (the pruning pass).
     */
    reduce(word, pieces = this._tableAll(), skip = null) {
        const { table: all, lengths, half: allHalf, halfLengths } = pieces;
        const orders = skip && skip.size ? ordersOf(this.list.filter((_, i) => !skip.has(i))) : pieces.orders;
        const first = (cands) => { if (!cands) return null; for (const c of cands) if (!skip || !skip.has(c.owner)) return c.repl; return null; };
        const table = { get: (k) => first(all.get(k)) };
        const half = { get: (k) => { const c = allHalf.get(k); return c ? c.filter((x) => !skip || !skip.has(x.owner)).map((x) => x.repl) : null; } };
        let w = powerReduce(reduceCyclic(word), orders, true);
        const maxL = lengths.length ? lengths[0] : 0, isLen = new Set(lengths);
        for (let guard = 0; w.length && guard < 10000; guard++) {
            // the longest piece starting at some position (keys grown letter by letter)
            let hit = null;
            const n = w.length;
            for (let i = 0; i < n; i++) {
                let k = '';
                for (let L = 1; L <= Math.min(maxL, n); L++) {
                    k = L === 1 ? String(w[i]) : k + ',' + w[(i + L - 1) % n];
                    if (!isLen.has(L)) continue;
                    const repl = table.get(k);
                    if (repl && (!hit || L > hit.L)) hit = { i, L, repl };
                }
            }
            if (hit) {
                const rot = w.slice(hit.i).concat(w.slice(0, hit.i));
                w = powerReduce(reduceCyclic(hit.repl.concat(rot.slice(hit.L))), orders, true);
                continue;
            }
            // no piece shortens it: a half piece that lowers the canonical form, if any
            let best = this.canonical(w, orders), moved = false;
            for (const L of halfLengths) {
                if (L > n) continue;
                for (let i = 0; i < n; i++) {
                    const rot = w.slice(i).concat(w.slice(0, i));
                    for (const repl of half.get(keyOf(rot.slice(0, L))) || []) {
                        const cand = powerReduce(reduceCyclic(repl.concat(rot.slice(L))), orders, true);
                        const c = this.canonical(cand, orders);
                        if (c.length < best.length || (c.length === best.length && keyLess(c, best))) { best = c; w = cand; moved = true; }
                    }
                }
            }
            if (!moved) break;
        }
        return w;
    }

    /** Is the word a consequence of the kept relators, but those in skip (by the reduction above)? */
    consequence(word, pieces = this._tableAll(), skip = null) { return this.reduce(word, pieces, skip).length === 0; }

    /**
     * Offer a canonical relator r (cyclically reduced, least rotation of r or r⁻¹).
     * `check(r)` verifies it exactly before it is kept. Returns 'kept', 'known',
     * 'redundant' or 'full'.
     */
    offer(r, check = () => true) {
        if (!r.length) return 'known';
        let k = keyOf(r);
        if (this.keys.has(k)) return 'known';
        if (this.rejected.has(k)) { this.redundant++; return 'redundant'; }
        let drop = -1;
        if (this.list.length >= this.cap) {
            drop = 0;
            this.list.forEach((x, i) => { if (x.length > this.list[drop].length) drop = i; });
            if (this.list[drop].length <= r.length) return 'full';
        }
        const red = this.canonical(this.reduce(r));
        if (!red.length || this.keys.has(keyOf(red))) {
            if (this.rejected.size > 200000) this.rejected.clear();
            this.rejected.add(k); this.redundant++;
            return 'redundant';
        }
        if (red.length < r.length || keyOf(red) !== k) { k = keyOf(red); r = red; }
        check(r);
        if (drop >= 0) { this.keys.delete(keyOf(this.list[drop])); this.list[drop] = r; }
        else this.list.push(r);
        this.keys.add(k);
        this._table = null;
        // a new power relator: the kept relators written again with the new orders (duplicates go)
        if (isPower(r)) this._renormalize();
        this._prune();
        return 'kept';
    }

    _renormalize() {
        const orders = ordersOf(this.list), seen = new Set(), next = [];
        for (const w of this.list) {
            const c = isPower(w) ? w : this.canonical(w, orders);
            const k = keyOf(c);
            if (!c.length || seen.has(k)) { this.rejected.add(keyOf(w)); this.redundant++; continue; }
            seen.add(k);
            next.push(c);
        }
        this.list = next;
        this.keys = seen;
        this._table = null;
    }

    /** drop kept relators that the others now imply (longest first) */
    _prune() {
        const order = this.list.map((w, i) => i).sort((i, j) => this.list[j].length - this.list[i].length);
        const dead = new Set();
        const pieces = this._tableAll();
        for (const i of order) {
            if (this.list.length - dead.size <= 1) break;
            const skip = new Set(dead).add(i);
            if (this.consequence(this.list[i], pieces, skip)) dead.add(i);
        }
        if (!dead.size) return;
        for (const i of dead) { const k = keyOf(this.list[i]); this.keys.delete(k); this.rejected.add(k); this.redundant++; }
        this.list = this.list.filter((_, j) => !dead.has(j));
        this._table = null;
    }
}
