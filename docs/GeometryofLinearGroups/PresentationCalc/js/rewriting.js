/**
 * rewriting.js — fewer relators, by Knuth–Bendix completion.
 *
 * A presentation found by coset enumeration (Reidemeister–Schreier, or relators of Λ read through the labels)
 * has many relators that follow from the others. A Dehn-style test (relators.js) only shortens, so it misses
 * consequences that need a letter inserted first: (c a²)² from c² and (c a⁻¹)², say. Here the kept relators
 * become a string rewriting system on the letters and their inverses (x x⁻¹ → 1), ordered shortlex, and
 * critical pairs are resolved for a while (Knuth–Bendix). Every rule is an equation that holds in
 * ⟨X | kept⟩, so a relator that rewrites to the empty word (some cyclic rotation of it) is a consequence of the
 * kept ones, and is dropped. The completion is cut off by time, rule count and rule length, so the test is
 * sound but not complete: a relator kept may still be redundant.
 *
 * Words are in ±(k+1), as presentation.js.
 */

const keyOf = (w) => w.join(',');
const sameWord = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const invWord = (w) => w.slice().reverse().map((x) => -x);
const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
function cyclicReduce(w) {
    const o = freeReduce(w);
    let i = 0, j = o.length - 1;
    while (i < j && o[i] === -o[j]) { i++; j--; }
    return o.slice(i, j + 1);
}
// shortlex, with a < a⁻¹ < b < b⁻¹ < …
const rank = (x) => (x > 0 ? 2 * x : -2 * x + 1);
function shortlexLess(u, v) {
    if (u.length !== v.length) return u.length < v.length;
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return rank(u[i]) < rank(v[i]);
    return false;
}

/** A rewriting system for a group on m generators, completed as far as the limits allow. */
export class RewritingSystem {
    constructor(m, { maxRules = 3000, maxLen = 40, maxWork = Infinity, deadline = Infinity } = {}) {
        // maxWork: letters pushed through reduce (the cost), so that the result does not depend on the machine
        this.maxRules = maxRules; this.maxLen = maxLen; this.maxWork = maxWork; this.deadline = deadline;
        this.work = 0;
        this.m = m;
        this.rules = [];                 // { lhs, rhs, alive }
        this.trie = this._node();        // the left sides read backwards: reduce matches suffixes of its output
        this.live = 0;
        this.done = 0;                   // rules 0 … done − 1 have had their overlaps with each other resolved
        this.truncated = false;
        for (let x = 1; x <= m; x++) { this._add([x, -x], []); this._add([-x, x], []); }
    }

    _node() { return { next: new Array(2 * this.m).fill(null), rule: null }; }
    _slot(x) { return x > 0 ? 2 * x - 2 : -2 * x - 1; }
    _add(lhs, rhs) {
        const r = { lhs, rhs, alive: true };
        this.rules.push(r);
        this.live++;
        let node = this.trie;
        for (let i = lhs.length - 1; i >= 0; i--) {
            const s = this._slot(lhs[i]);
            if (!node.next[s]) node.next[s] = this._node();
            node = node.next[s];
        }
        node.rule = r;
        return r;
    }
    _kill(r) {
        r.alive = false;
        this.live--;
        let node = this.trie;
        for (let i = r.lhs.length - 1; i >= 0 && node; i--) node = node.next[this._slot(r.lhs[i])];
        if (node && node.rule === r) node.rule = null;
    }

    /** The irreducible form of w (each step an equation of the system). */
    reduce(w) {
        const out = [], pending = w.slice().reverse();
        let guard = 0;
        while (pending.length) {
            if (++guard > 2e6) throw new Error('internal: rewriting does not terminate');
            this.work++;
            out.push(pending.pop());
            // the left side that is a suffix of out (at most one: no left side contains another)
            let node = this.trie, hit = null, L = 0;
            for (let t = out.length - 1; t >= 0; t--) {
                node = node.next[this._slot(out[t])];
                if (!node) break;
                if (node.rule) { hit = node.rule; L = out.length - t; break; }
            }
            if (hit) {
                out.length -= L;
                for (let j = hit.rhs.length - 1; j >= 0; j--) pending.push(hit.rhs[j]);
            }
        }
        return out;
    }

    /**
     * Add u = v (both reduced first), oriented shortlex. Interreduction is lazy: an older rule whose left side
     * the new one makes reducible is retired when complete() reaches it (until then it is a harmless extra rule).
     */
    equate(u, v) {
        let a = this.reduce(u), b = this.reduce(v);
        if (sameWord(a, b)) return;
        if (shortlexLess(a, b)) [a, b] = [b, a];
        if (a.length > this.maxLen || this.live >= this.maxRules) { this.truncated = true; return; }
        this._add(a, b);
    }
    /** Does some other live rule's left side occur in r's? */
    _reducibleLhs(r) {
        const w = r.lhs;
        for (let e = w.length - 1; e >= 0; e--) {
            let node = this.trie;
            for (let t = e; t >= 0; t--) {
                node = node.next[this._slot(w[t])];
                if (!node) break;
                if (node.rule && node.rule !== r) return true;
            }
        }
        return false;
    }

    /** The equations of a relator: every rotation of r and r⁻¹, split near the middle. */
    addRelator(r) {
        r = cyclicReduce(r);
        if (!r.length) return;
        for (const u of [r, invWord(r)]) for (let i = 0; i < u.length; i++) {
            const rot = u.slice(i).concat(u.slice(0, i)), h = Math.ceil((rot.length + 1) / 2);
            this.equate(rot.slice(0, h), invWord(rot.slice(h)));
        }
    }

    /** Resolve critical pairs until every overlap is resolved (complete) or a limit is met. Returns complete. */
    complete() {
        // each new rule i (≥ done) against every rule j ≤ i; rules added meanwhile get their turn in the same loop
        for (let i = this.done; i < this.rules.length; i++) {
            if (this.work > this.maxWork || this.live >= this.maxRules || Date.now() > this.deadline) { this.truncated = true; this.done = i; return false; }
            const r = this.rules[i];
            if (!r.alive) continue;
            // a rule made redundant by a newer one goes back in as an equation
            if (this._reducibleLhs(r)) { this._kill(r); this.equate(r.lhs, r.rhs); continue; }
            r.rhs = this.reduce(r.rhs);
            for (let j = 0; j <= i; j++) this._pair(r, this.rules[j]);
        }
        this.done = this.rules.length;
        return !this.truncated;
    }
    _pair(r1, r2) {
        if (!r1.alive || !r2.alive) return;
        this._overlaps(r1, r2);
        if (r1 !== r2) this._overlaps(r2, r1);
    }
    /** lhs1 = x y, lhs2 = y z with y nonempty and proper: x·rhs2 = rhs1·z. */
    _overlaps(r1, r2) {
        const p = r1.lhs, q = r2.lhs;
        for (let k = 1; k < Math.min(p.length, q.length); k++) {
            let ok = true;
            for (let t = 0; t < k; t++) if (p[p.length - k + t] !== q[t]) { ok = false; break; }
            if (!ok) continue;
            if (!r1.alive || !r2.alive) return;
            this.equate(r1.rhs.concat(q.slice(k)), p.slice(0, p.length - k).concat(r2.rhs));
        }
    }

    /** Is r = 1 by the rules: some rotation of r reduces to the empty word. */
    kills(r) {
        r = cyclicReduce(r);
        if (!r.length) return true;
        for (let i = 0; i < r.length; i++) if (!cyclicReduce(this.reduce(r.slice(i).concat(r.slice(0, i)))).length) return true;
        return false;
    }
}

/**
 * The relators with the redundant ones dropped: shortest first, a relator is kept unless the system of the kept
 * ones kills it; then each kept one (longest first) is tested against the others again, since a later relator
 * may imply an earlier one. opts: { work (letters rewritten in all: half for the first pass, the rest shared by
 * the relators of the second), seconds (a safety cap only: within it the result is the same on any machine),
 * maxRules, maxLen }. Returns { relators, dropped, ms }.
 */
export function pruneRelators(m, relators, { work = 3e7, seconds = 30, maxRules = 10000, maxLen = 0 } = {}) {
    const t0 = Date.now(), deadline = t0 + 1000 * seconds;
    const list = [];
    const seen = new Set();
    for (const w of relators) { const c = cyclicReduce(w); if (c.length && !seen.has(keyOf(c))) { seen.add(keyOf(c)); list.push(c); } }
    list.sort((a, b) => a.length - b.length || (shortlexLess(a, b) ? -1 : 1));
    const longest = list.length ? list[list.length - 1].length : 0;
    const ML = maxLen || Math.max(24, 2 * longest);
    // forward: one growing system, with half the work
    const S = new RewritingSystem(m, { maxRules, maxLen: ML, maxWork: work / 2, deadline });
    const kept = [];
    for (const r of list) {
        if (S.kills(r)) continue;
        kept.push(r);
        S.addRelator(r);
        S.complete();
    }
    // backward: each kept relator against the others, sharing what is left of the work
    let left = work - Math.min(S.work, work / 2);
    for (let i = kept.length - 1; i >= 0 && kept.length > 1; i--) {
        if (left <= 0 || Date.now() > deadline) break;
        const T = new RewritingSystem(m, { maxRules, maxLen: ML, maxWork: left / (i + 1), deadline });
        kept.forEach((r, j) => { if (j !== i) T.addRelator(r); });
        T.complete();
        left -= T.work;
        if (T.kills(kept[i])) kept.splice(i, 1);
    }
    return { relators: kept, dropped: list.length - kept.length, ms: Date.now() - t0 };
}
