/**
 * presentation.js — presentations of finite-index subgroups Γ ⊆ Λ, from a presentation of Λ and the
 * action of Λ's generators on the cosets of Γ: Reidemeister–Schreier, then Tietze moves.
 *
 * Input. Letters 0 … L−1 of Λ with an inverse map inv (inv(x) = x for involutions), relators as
 * arrays of letters, and a right action table[i][x] = i·x on the cosets 0 … n−1 (coset 0 = Γ).
 *
 * Reidemeister–Schreier. A Schreier transversal tᵢ comes from a breadth-first spanning tree of the
 * coset graph from 0. The Schreier generators are s(i, x) = tᵢ·x·t_{i·x}⁻¹; tree edges give 1, and
 * s(i·x, inv x) = s(i, x)⁻¹, so one generator per remaining pair {(i, x), (i·x, inv x)} (an
 * involution x with i·x = i gives s = s⁻¹). The relators are tᵢ r tᵢ⁻¹ for every coset i and
 * relator r, rewritten letter by letter along the coset walk; a letter with inv(x) = x carries the
 * relator x² (added here: coset tables of involutions take it as given). This presents Γ exactly (Reidemeister,
 * Schreier) on the generators s; nothing here is heuristic.
 *
 * Tietze moves keep the group: a relator s = 1 deletes s; a short relator in which some generator
 * occurs once expresses it by the rest, which is substituted everywhere. Each generator's word in the
 * remaining ones is kept, so the original generators of Γ (words in Λ's letters) can be written in the
 * final ones.
 */

const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };
function cyclicReduce(w) {
    w = freeReduce(w);
    let i = 0, j = w.length;
    while (j - i > 1 && w[i] === -w[j - 1]) { i++; j--; }
    return w.slice(i, j);
}
const invWord = (w) => w.slice().reverse().map((x) => -x);
/**
 * Exponents reduced modulo the orders of generators with a power relator x^n: every run x^e becomes
 * x^{e'} with e' ≡ e (mod n) in (−n/2, n/2]. cyclic: w is a relator (runs wrap around).
 */
export function powerReduce(w, orders, cyclic) {
    for (let changed = true; changed;) {
        changed = false;
        w = cyclic ? cyclicReduce(w) : freeReduce(w);
        if (!w.length) return w;
        // a cyclic word starts at the beginning of a run (unless it is one run)
        if (cyclic) {
            let r = 0;
            while (r < w.length && Math.abs(w[r]) === Math.abs(w[(r + w.length - 1) % w.length])) r++;
            if (r === w.length) return w;
            w = w.slice(r).concat(w.slice(0, r));
        }
        const out = [];
        for (let i = 0; i < w.length;) {
            const g = Math.abs(w[i]);
            let j = i, e = 0;
            while (j < w.length && Math.abs(w[j]) === g) { e += Math.sign(w[j]); j++; }
            const n = orders.get(g);
            let f = e;
            if (n) { f = ((e % n) + n) % n; if (f > n / 2) f -= n; }
            if (f !== e || j - i !== Math.abs(e)) changed = true;
            for (let k = 0; k < Math.abs(f); k++) out.push(Math.sign(f) * g);
            i = j;
        }
        w = out;
    }
    return w;
}
const gcdInt = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
/** The start of the least rotation of the array a (Booth's algorithm). */
function leastRotation(a) {
    const n = a.length;
    if (n < 2) return 0;
    const f = new Int32Array(2 * n).fill(-1);
    let k = 0;
    for (let j = 1; j < 2 * n; j++) {
        const sj = a[j % n];
        let i = f[j - k - 1];
        while (i !== -1 && sj !== a[(k + i + 1) % n]) {
            if (sj < a[(k + i + 1) % n]) k = j - i - 1;
            i = f[i];
        }
        if (i === -1 && sj !== a[k % n]) {
            if (sj < a[k % n]) k = j;
            f[j - k] = -1;
        } else f[j - k] = i + 1;
    }
    return k;
}
const rotate = (a, k) => a.slice(k).concat(a.slice(0, k));
/** least rotation of w or w⁻¹ (normalized by norm), as a key */
function canonKey(w, norm = (u) => u) {
    if (!w.length) return '';
    const a = rotate(w, leastRotation(w)), v = norm(invWord(w)), b = rotate(v, leastRotation(v));
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] < b[i] ? a : b).join(',');
    return (a.length <= b.length ? a : b).join(',');
}

/**
 * Reidemeister–Schreier. Returns { gens: [{ i, x }] (s_k = t_i·x·t_{i·x}⁻¹), transversal (letter
 * words t_i), relators (words in ±(k+1)), rewrite(word in letters from coset 0) → word in ±(k+1) }.
 */
export function reidemeisterSchreier({ nLetters, inv, relators, table }) {
    const n = table.length;
    // breadth-first Schreier transversal
    const parent = new Array(n).fill(null), trans = new Array(n).fill(null);
    trans[0] = [];
    const queue = [0], tree = new Set();
    while (queue.length) {
        const i = queue.shift();
        for (let x = 0; x < nLetters; x++) {
            const j = table[i][x];
            if (trans[j] !== null) continue;
            trans[j] = trans[i].concat([x]); parent[j] = [i, x];
            tree.add(`${i},${x}`); tree.add(`${j},${inv(x)}`);
            queue.push(j);
        }
    }
    if (trans.some((t) => t === null)) throw new Error('the coset graph is not connected');
    // generators: one per pair {(i, x), (i·x, inv x)} off the tree
    const sym = new Map(), gens = [];
    for (let i = 0; i < n; i++) for (let x = 0; x < nLetters; x++) {
        const key = `${i},${x}`;
        if (tree.has(key) || sym.has(key)) continue;
        const j = table[i][x], back = `${j},${inv(x)}`;
        gens.push({ i, x });
        const k = gens.length;
        sym.set(key, k);
        if (!sym.has(back)) sym.set(back, back === key ? k : -k);
    }
    const s = (i, x) => (tree.has(`${i},${x}`) ? 0 : sym.get(`${i},${x}`));
    const rewriteFrom = (i0, word) => {
        const out = [];
        let i = i0;
        for (const x of word) { const v = s(i, x); if (v) out.push(v); i = table[i][x]; }
        return { word: freeReduce(out), end: i };
    };
    const rels = [], seen = new Set();
    const all = relators.concat(Array.from({ length: nLetters }, (_, x) => x).filter((x) => inv(x) === x).map((x) => [x, x]));
    for (let i = 0; i < n; i++) for (const r of all) {
        const { word, end } = rewriteFrom(i, r);
        if (end !== i) throw new Error('internal: a relator does not close on the cosets');
        const w = cyclicReduce(word);
        if (!w.length) continue;
        const k = canonKey(w);
        if (!seen.has(k)) { seen.add(k); rels.push(w); }
    }
    return { gens, transversal: trans, relators: rels, rewrite: (word) => { const r = rewriteFrom(0, word); if (r.end !== 0) throw new Error('not in the subgroup'); return r.word; } };
}

/**
 * Tietze moves on a presentation on generators 1 … m (relators: words in ±k). Returns
 * { keep: the surviving generator numbers, relators (renumbered 1 … keep.length), express(k) → word
 * of old generator k in the new ones }. maxLen bounds the relators used for substitution; a move may
 * take the total length to growth·total + slack. Generators in prefer are eliminated only once no
 * other can be, and not at all if keepPreferred.
 *
 * Relators are kept up to rotation and inversion; a power relator x^n gives x the order gcd(n, …),
 * and every exponent of x is reduced modulo it. Between rounds of eliminations, a cyclic piece u of a
 * relator r = u·v longer than half of r is replaced by v⁻¹ wherever it occurs in another relator.
 */
export function tietze(m, relators, { maxLen = 12, growth = 1.15, slack = 4, maxRounds = 100000, prefer = null, keepPreferred = false, shortenLimit = 400, seconds = 5 } = {}) {
    const deadline = Date.now() + 1000 * seconds;
    const expr = new Map();                          // eliminated generator → word in others (old numbering)
    const alive = new Set(Array.from({ length: m }, (_, i) => i + 1));
    const orders = new Map();                        // generator → n (the power relator x^n)
    const rels = new Map();                          // key → relator (power relators are in orders)
    const norm = (u) => powerReduce(u, orders, true);
    const subst = (w, g, e) => { const out = []; for (const x of w) { if (x === g) out.push(...e); else if (x === -g) out.push(...invWord(e)); else out.push(x); } return out; };
    const pending = [];
    const add = (w0) => {
        const w = powerReduce(w0, orders, true);
        if (!w.length) return;
        if (w.every((x) => Math.abs(x) === Math.abs(w[0]))) {
            const g = Math.abs(w[0]), n = gcdInt(orders.get(g) || 0, w.length);
            if (n !== orders.get(g)) { orders.set(g, n); pending.push(g); }
            return;
        }
        const k = canonKey(w, norm);
        if (!rels.has(k)) rels.set(k, w);
    };
    // a generator whose order changed: its relators and words are reduced again
    const settle = () => {
        while (pending.length) {
            const gs = new Set(pending.splice(0));
            for (const [k, w] of [...rels]) if (w.some((x) => gs.has(Math.abs(x)))) { rels.delete(k); add(w); }
            for (const [k, v] of expr) if (v.some((x) => gs.has(Math.abs(x)))) expr.set(k, powerReduce(v, orders, false));
        }
    };
    relators.forEach(add);
    settle();
    const totalLength = () => { let t = 0; for (const w of rels.values()) t += w.length; for (const n of orders.values()) t += n; return t; };
    const eliminate = (g, e, fromKey) => {
        if (fromKey !== null) rels.delete(fromKey);
        const n = orders.get(g);
        orders.delete(g);
        alive.delete(g);
        for (const [k, w] of [...rels]) if (w.some((x) => Math.abs(x) === g)) { rels.delete(k); add(subst(w, g, e)); }
        if (n > 1) add([].concat(...new Array(n).fill(e)));
        for (const [k, v] of expr) if (v.some((x) => Math.abs(x) === g)) expr.set(k, powerReduce(subst(v, g, e), orders, false));
        expr.set(g, powerReduce(e, orders, false));
        settle();
    };
    const allowed = (g, phase) => !(phase === 0 && prefer.has(g));
    // a match longer than half of r = u·v contains u's first q = ⌊|r|/2⌋ + 1 letters: relators are
    // indexed by hashes of their cyclic pieces of each length q in use
    const shorten = () => {
        if (rels.size > shortenLimit) return false;
        let any = false;
        for (let pass = 0; pass < 1000 && Date.now() < deadline; pass++) {
            const words = [...rels.entries()];
            const index = new Map();                 // q → hash → [relator, position]
            const hashAt = (t, p, q) => { let h = 0; for (let j = 0; j < q; j++) h = (Math.imul(h, 1000003) + t[(p + j) % t.length] + 65536) | 0; return h; };
            const indexFor = (q) => {
                let I = index.get(q);
                if (I) return I;
                index.set(q, I = new Map());
                words.forEach(([, t], b) => { if (t.length < q) return; for (let p = 0; p < t.length; p++) { const h = hashAt(t, p, q); let a = I.get(h); if (!a) I.set(h, a = []); a.push([b, p]); } });
                return I;
            };
            const dirty = new Set(), out = [];
            for (let a = 0; a < words.length; a++) {
                if (dirty.has(a)) continue;
                const r = words[a][1], L = r.length;
                if (L < 3 || L > 120) continue;
                const q = Math.floor(L / 2) + 1, I = indexFor(q);
                let best = null;
                for (const rr of [r, invWord(r)]) for (let i = 0; i < L; i++) {
                    for (const [b, p] of I.get(hashAt(rr, i, q)) || []) {
                        if (b === a || dirty.has(b)) continue;
                        const t = words[b][1];
                        let k = 0;
                        while (k < L && k < t.length && t[(p + k) % t.length] === rr[(i + k) % L]) k++;
                        if (k >= q && (!best || k > best.k)) best = { rr, i, b, p, k };
                    }
                }
                if (!best) continue;
                const { rr, i, b, p, k } = best;
                const v = Array.from({ length: L - k }, (_, j) => rr[(i + k + j) % L]);
                const t = words[b][1];
                out.push([words[b][0], invWord(v).concat(rotate(t, p).slice(k))]);
                dirty.add(a); dirty.add(b);
            }
            if (!out.length) break;
            for (const [k, w] of out) { rels.delete(k); add(w); }
            settle();
            any = true;
        }
        return any;
    };
    for (let outer = 0; outer < 50; outer++) {
        for (let phase = prefer ? 0 : 1; phase < (prefer && keepPreferred ? 1 : 2); phase++) {
            const blocked = new Set();
            for (let round = 0; round < maxRounds; round++) {
                // a trivial generator goes first
                const one = [...orders].find(([g, n]) => n === 1 && allowed(g, phase));
                if (one) { eliminate(one[0], [], null); blocked.clear(); continue; }
                // the shortest usable relator with a generator occurring exactly once (the largest
                // such generator: the later Schreier generators go first)
                let pick = null;
                for (const [key, w] of rels) {
                    if (w.length > maxLen || (pick && w.length >= pick.w.length) || blocked.has(key)) continue;
                    const count = new Map();
                    for (const x of w) count.set(Math.abs(x), (count.get(Math.abs(x)) || 0) + 1);
                    let g = 0;
                    for (const [h, c] of count) if (c === 1 && h > g && allowed(h, phase)) g = h;
                    if (g) pick = { w, g, key };
                }
                if (!pick) break;
                // w = u·g^ε·v ⇒ g^ε = u⁻¹ v⁻¹
                const { w, g, key } = pick;
                const i = w.findIndex((x) => Math.abs(x) === g);
                let e = freeReduce(invWord(w.slice(0, i)).concat(invWord(w.slice(i + 1))));
                if (w[i] < 0) e = invWord(e);
                const total = totalLength();
                let occ = (orders.get(g) || 0);
                for (const r of rels.values()) if (r !== w) for (const x of r) if (Math.abs(x) === g) occ++;
                if (e.length > 1 && total - w.length + occ * (e.length - 1) > total * growth + slack) { blocked.add(key); continue; }
                eliminate(g, e, key);
                blocked.clear();
            }
        }
        if (!shorten()) break;
    }
    const keep = [...alive].sort((a, b) => a - b);
    const num = new Map(keep.map((g, i) => [g, i + 1]));
    const ren = (w) => w.map((x) => Math.sign(x) * num.get(Math.abs(x)));
    const powers = [...orders].filter(([g, n]) => n > 1 && alive.has(g)).sort((a, b) => a[0] - b[0]).map(([g, n]) => new Array(n).fill(g));
    return {
        keep,
        relators: powers.concat([...rels.values()].sort((a, b) => a.length - b.length || canonKey(a).localeCompare(canonKey(b)))).map(ren),
        express: (k) => ren(expr.has(k) ? expr.get(k) : [k]),
    };
}

/**
 * Words in the generators (±(i+1)) for target elements, by a breadth-first search of the group they
 * generate and then meet in the middle (target = a·b in the ball); null where none is found within
 * the budget. ops: { mul(A, B), inv(A), key(A) (equal exactly for equal elements), one }.
 */
export function findWords(gens, targets, { mul, inv, key, one }, { wordElements = 30000, wordSeconds = 1 } = {}) {
    const deadline = Date.now() + 1000 * wordSeconds;
    const want = new Map();
    targets.forEach((M, j) => { want.set(key(M), { j, inv: false }); if (!want.has(key(inv(M)))) want.set(key(inv(M)), { j, inv: true }); });
    const out = targets.map(() => null);
    let left = targets.length;
    const letters = gens.flatMap((G, i) => [{ x: i + 1, M: G }, { x: -(i + 1), M: inv(G) }]);
    const seen = new Map([[key(one), { w: [], M: one }]]);
    let frontier = [{ M: one, w: [] }];
    while (frontier.length && left && seen.size < wordElements && Date.now() < deadline) {
        const next = [];
        for (const { M, w } of frontier) for (const { x, M: G } of letters) {
            if (w.length && w[w.length - 1] === -x) continue;
            const N = mul(M, G), k = key(N);
            if (seen.has(k)) continue;
            const v = w.concat([x]);
            seen.set(k, { w: v, M: N });
            next.push({ M: N, w: v });
            const t = want.get(k);
            if (t && !out[t.j]) { out[t.j] = t.inv ? invWord(v) : v; left--; }
        }
        frontier = next;
    }
    if (left) {
        const end = Date.now() + 1000 * wordSeconds;
        targets.forEach((M, j) => {
            if (out[j]) return;
            for (const { w, M: B } of seen.values()) {
                if (Date.now() > end) return;
                const a = seen.get(key(mul(M, inv(B))));
                if (a && (!out[j] || a.w.length + w.length < out[j].length)) out[j] = freeReduce(a.w.concat(w));
            }
        });
    }
    return out;
}

/** Abelian invariants of ⟨1 … m | relators⟩: the Smith normal form of the relation matrix. Returns { rank, torsion: [d₁ | d₂ | …] }. */
export function abelianInvariants(m, relators) {
    const M = relators.map((w) => { const row = new Array(m).fill(0n); for (const x of w) row[Math.abs(x) - 1] += x > 0 ? 1n : -1n; return row; }).filter((r) => r.some((v) => v !== 0n));
    const babs = (x) => (x < 0n ? -x : x);
    const rows = M.length, cols = m;
    const A = M.map((r) => r.slice());
    let t = 0;
    const diag = [];
    for (; t < Math.min(rows, cols); t++) {
        // pivot: the least nonzero |entry| in the remaining block
        let pi = -1, pj = -1, best = null;
        for (let i = t; i < rows; i++) for (let j = t; j < cols; j++) if (A[i][j] !== 0n && (best === null || babs(A[i][j]) < best)) { best = babs(A[i][j]); pi = i; pj = j; }
        if (pi < 0) break;
        [A[t], A[pi]] = [A[pi], A[t]];
        for (const r of A) [r[t], r[pj]] = [r[pj], r[t]];
        for (;;) {
            let changed = false;
            for (let i = t + 1; i < rows; i++) {
                if (A[i][t] === 0n) continue;
                const q = A[i][t] / A[t][t];
                for (let j = t; j < cols; j++) A[i][j] -= q * A[t][j];
                if (A[i][t] !== 0n) { [A[t], A[i]] = [A[i], A[t]]; changed = true; }
            }
            for (let j = t + 1; j < cols; j++) {
                if (A[t][j] === 0n) continue;
                const q = A[t][j] / A[t][t];
                for (let i = t; i < rows; i++) A[i][j] -= q * A[i][t];
                if (A[t][j] !== 0n) { for (const r of A) [r[t], r[j]] = [r[j], r[t]]; changed = true; }
            }
            if (!changed) {
                // divisibility: the pivot must divide the rest of the block
                let bad = null;
                for (let i = t + 1; i < rows && !bad; i++) for (let j = t + 1; j < cols; j++) if (A[i][j] % A[t][t] !== 0n) { bad = i; break; }
                if (bad === null) break;
                for (let j = t; j < cols; j++) A[t][j] += A[bad][j];
            }
        }
        diag.push(babs(A[t][t]));
    }
    const nz = diag.filter((d) => d !== 0n);
    return { rank: m - nz.length, torsion: nz.filter((d) => d !== 1n).map(String) };
}

/** (testing) the relator key */
export const _canonKey = canonKey;
