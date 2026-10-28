/**
 * felsch.js — Todd–Coxeter coset enumeration with Felsch's strategy, for presentations with many generators
 * (quaternionIndex.js). Letters 2k / 2k + 1 are generator k and its inverse, as in bianchi.js
 * enumerateGeneral; the table it returns is verified the same way (every relator and subgroup generator
 * closes up at every coset, and the coset graph is connected).
 */

const freeReduce = (w) => { const out = []; for (const x of w) { if (out.length && out[out.length - 1] === (x ^ 1)) out.pop(); else out.push(x); } return out; };
const cyclicReduce = (w) => { w = freeReduce(w); while (w.length > 1 && w[0] === (w[w.length - 1] ^ 1)) w = w.slice(1, -1); return w; };

/**
 * Todd–Coxeter with Felsch's strategy: a coset is defined only at the first empty entry of the
 * table, and every definition or deduction is followed by scanning the cyclic conjugates of the
 * relators (and their inverses) that start with that letter. Far fewer cosets than HLT when the
 * presentation has many generators. Letters 2k / 2k + 1 are generator k and its inverse, as in
 * bianchi.js enumerateGeneral; the returned table is verified the same way.
 */
export function enumerateFelsch(nGens, relators, subgroupWords, { maxCosets = 1500000, seconds = 5 } = {}) {
    const W = 2 * nGens;
    const deadline = Date.now() + 1000 * seconds;
    const table = [new Int32Array(W).fill(-1)];
    const parent = [0];
    const find = (c) => { while (parent[c] !== c) { parent[c] = parent[parent[c]]; c = parent[c]; } return c; };
    const ded = [];
    class Limit extends Error { }
    // the cyclic conjugates of the relators and their inverses, by first letter
    const rels = relators.map(cyclicReduce).filter((w) => w.length);
    const byFirst = Array.from({ length: W }, () => []);
    const seenRot = new Set();
    for (const r of rels) for (const w of [r, r.slice().reverse().map((x) => x ^ 1)]) for (let i = 0; i < w.length; i++) {
        const rot = w.slice(i).concat(w.slice(0, i)), k = rot.join(',');
        if (!seenRot.has(k)) { seenRot.add(k); byFirst[rot[0]].push(rot); }
    }
    const words = subgroupWords.map(freeReduce).filter((w) => w.length);
    const define = (c, x) => {
        if (table.length >= maxCosets) throw new Limit('cosets');
        const d = table.length;
        table.push(new Int32Array(W).fill(-1));
        parent.push(d);
        table[c][x] = d; table[d][x ^ 1] = c;
        ded.push(c, x);
        return d;
    };
    const coincidence = (a, b) => {
        const queue = [];
        const merge = (u, v) => { u = find(u); v = find(v); if (u === v) return; if (v < u) [u, v] = [v, u]; parent[v] = u; queue.push(v); };
        merge(a, b);
        for (let h = 0; h < queue.length; h++) {
            const g = queue[h], row = table[g];
            for (let x = 0; x < W; x++) {
                const dd = row[x];
                if (dd < 0) continue;
                if (table[dd][x ^ 1] === g) table[dd][x ^ 1] = -1;
                const u = find(g), v = find(dd);
                if (table[u][x] >= 0) merge(v, table[u][x]);
                else if (table[v][x ^ 1] >= 0) merge(u, table[v][x ^ 1]);
                else { table[u][x] = v; table[v][x ^ 1] = u; ded.push(u, x); }
            }
        }
    };
    // scan w at c, filling a single gap (a deduction), or finding a coincidence; with fill, define
    const scan = (a, w, fill) => {
        const n = w.length;
        let f = a, i = 0, b = a, j = n - 1;
        for (;;) {
            while (i <= j && table[f][w[i]] >= 0) { f = find(table[f][w[i]]); i++; }
            if (i > j) { if (f !== a) coincidence(f, a); return; }
            while (j >= i && table[b][w[j] ^ 1] >= 0) { b = find(table[b][w[j] ^ 1]); j--; }
            if (j < i) { coincidence(f, b); return; }
            if (i === j) { table[f][w[i]] = b; table[b][w[i] ^ 1] = f; ded.push(f, w[i]); return; }
            if (!fill) return;
            define(f, w[i]);
        }
    };
    const process = () => {
        do {
            while (ded.length) {
                const x = ded.pop(), c = find(ded.pop());
                for (const w of byFirst[x]) { if (parent[c] !== c) break; scan(c, w, false); }
                const d = table[find(c)][x];
                if (d >= 0) { const dd = find(d); for (const w of byFirst[x ^ 1]) { if (parent[dd] !== dd) break; scan(dd, w, false); } }
            }
            for (const w of words) scan(find(0), w, false);
        } while (ded.length);
    };
    try {
        for (const w of words) scan(0, w, true);
        process();
        let c = 0, steps = 0;
        while (c < table.length) {
            if (parent[c] === c) {
                let x = 0;
                while (x < W && parent[c] === c) {
                    if (table[c][x] < 0) { define(c, x); process(); }
                    x++;
                    if (++steps % 512 === 0 && Date.now() > deadline) throw new Limit('time');
                }
            }
            c++;
        }
    } catch (e) {
        if (e instanceof Limit) return { limit: e.message, defined: table.length };
        throw e;
    }
    const live = [];
    for (let c = 0; c < table.length; c++) if (parent[c] === c) live.push(c);
    const num = new Map(live.map((c, i) => [c, i]));
    const T = live.map((c) => Array.from(table[c], (dd) => (dd < 0 ? -1 : num.get(find(dd)))));
    const fail = (() => {
        for (const row of T) if (row.some((dd) => dd === undefined || dd < 0)) return 'undefined entry';
        for (let c = 0; c < T.length; c++) for (let x = 0; x < W; x++) if (T[T[c][x]][x ^ 1] !== c) return 'inverse letters disagree';
        for (const r of relators) for (let c = 0; c < T.length; c++) { let dd = c; for (const x of r) dd = T[dd][x]; if (dd !== c) return 'a relator does not close'; }
        for (const w of words) { let dd = 0; for (const x of w) dd = T[dd][x]; if (dd !== 0) return 'a subgroup generator does not fix coset 1'; }
        const seen = new Set([0]), st = [0];
        while (st.length) { const c = st.pop(); for (const dd of T[c]) if (!seen.has(dd)) { seen.add(dd); st.push(dd); } }
        return seen.size === T.length ? null : 'the coset graph is not connected';
    })();
    if (fail) return { limit: `verification: ${fail}`, defined: table.length };
    return { index: T.length, defined: table.length, table: T };
}


// ───────────────────────── augmented coset enumeration ─────────────────────────

/**
 * Modified Todd–Coxeter (Neubüser 1982; Arrell–Robertson 1984; Holt–Eick–O'Brien, Handbook of
 * Computational Group Theory §5.3.3): Felsch's strategy as above, with a label on every entry of the
 * table. The subgroup H is generated by the given words h_0, h_1, …; coset c has a representative t_c
 * (t_0 = 1, and t_d = t_c·x when d is defined as c·x), and an entry c·x = d carries a word L in the
 * h_s (letters ±(s+1)) with
 *
 *     t_c · x = L · t_d   in G.
 *
 * Definitions get the empty label. A scan of a relator (at any coset), or of h_s (at coset 0, where the
 * cycle stands for h_s itself), forces the label of the entry it deduces, and the word u of a
 * coincidence t_c = u·t_d. The union-find keeps such a multiplier for every eliminated coset, and an
 * entry moved to the surviving coset is relabelled by it.
 *
 * At the end, coset 0 gives every generator in terms of H when the index is 1 (x = L(0, x)), and in
 * general every Schreier generator t_c x t_{c·x}⁻¹ = L(c, x). Labels are straight-line programs (a
 * DAG of concatenations and inverses), so they stay small during the enumeration; expand() writes one
 * out, freely reduced, refusing past maxLength letters.
 *
 * Returns { index, table, labels (node ids), defs (c → [parent, letter] of its definition), expand(node,
 * maxLength), length(node), nodes } or { limit }. The table is verified as in enumerateFelsch; the
 * labels are not (the caller checks the words it uses, e.g. by multiplying matrices).
 */
export function enumerateFelschAugmented(nGens, relators, subgroupWords, { maxCosets = 500000, seconds = 10, maxNodes = 8000000 } = {}) {
    const W = 2 * nGens;
    const deadline = Date.now() + 1000 * seconds;
    class Limit extends Error { }
    // straight-line programs: node 0 = the empty word; 1 = a letter ±(s+1) in A; 2 = A·B; 3 = A⁻¹
    const kind = [0], A = [0], B = [0];
    const node = (k, a, b) => { if (kind.length >= maxNodes) throw new Limit('labels'); kind.push(k); A.push(a); B.push(b); return kind.length - 1; };
    const cat = (a, b) => (a === 0 ? b : b === 0 ? a : node(2, a, b));
    const inv = (a) => (a === 0 ? 0 : kind[a] === 3 ? A[a] : node(3, a, 0));
    const table = [new Int32Array(W).fill(-1)], lab = [new Int32Array(W)];
    const parent = [0], mult = [0], defs = [null];
    let fm = 0;                                       // after find(c): t_c = fm · t_root
    const find = (c) => {
        if (parent[c] === c) { fm = 0; return c; }
        const path = [];
        let r = c;
        while (parent[r] !== r) { path.push(r); r = parent[r]; }
        let acc = 0;
        for (let i = path.length - 1; i >= 0; i--) { const v = path[i]; acc = cat(mult[v], acc); parent[v] = r; mult[v] = acc; }
        fm = mult[c];
        return r;
    };
    const ded = [];
    const queue = [];
    const define = (c, x) => {
        if (table.length >= maxCosets) throw new Limit('cosets');
        const d = table.length;
        table.push(new Int32Array(W).fill(-1)); lab.push(new Int32Array(W));
        parent.push(d); mult.push(0); defs.push([c, x]);
        table[c][x] = d; table[d][x ^ 1] = c;
        ded.push(c, x);
        return d;
    };
    // t_u = w·t_v: identify the two cosets, keeping the smaller number
    const merge = (u, v, w) => {
        const ru = find(u), mu = fm;
        const rv = find(v), mv = fm;
        if (ru === rv) return;
        const X = cat(cat(inv(mu), w), mv);          // t_ru = X·t_rv
        if (ru < rv) { parent[rv] = ru; mult[rv] = inv(X); queue.push(rv); }
        else { parent[ru] = rv; mult[ru] = X; queue.push(ru); }
    };
    const coincidence = (u, v, w) => {
        merge(u, v, w);
        for (let h = 0; h < queue.length; h++) {
            const g = queue[h], row = table[g], lrow = lab[g];
            for (let x = 0; x < W; x++) {
                const dd = row[x];
                if (dd < 0) continue;
                const L = lrow[x];
                if (table[dd][x ^ 1] === g) table[dd][x ^ 1] = -1;
                const ug = find(g), mg = fm;
                const vd = find(dd), md = fm;
                const E = cat(cat(inv(mg), L), md);    // t_ug·x = E·t_vd
                if (table[ug][x] >= 0) {
                    const e = table[ug][x], M = lab[ug][x];
                    merge(vd, e, cat(inv(E), M));       // t_vd = E⁻¹M·t_e
                } else if (table[vd][x ^ 1] >= 0) {
                    const f2 = table[vd][x ^ 1], N = lab[vd][x ^ 1];
                    merge(f2, ug, cat(inv(N), inv(E))); // t_f2 = N⁻¹E⁻¹·t_ug
                } else {
                    table[ug][x] = vd; lab[ug][x] = E; table[vd][x ^ 1] = ug; lab[vd][x ^ 1] = inv(E); ded.push(ug, x);
                }
            }
        }
        queue.length = 0;
    };
    // scan w at a, where the cycle a --w--> a stands for target (0 for a relator, h_s for a subgroup generator)
    const scan = (a, w, fill, target) => {
        const n = w.length;
        let f = a, i = 0, F = 0, b = a, j = n - 1, Bk = 0;
        for (;;) {
            while (i <= j && table[f][w[i]] >= 0) {
                const d = table[f][w[i]], L = lab[f][w[i]];
                const r = find(d);
                F = cat(cat(F, L), fm); f = r; i++;
            }
            if (i > j) { coincidence(f, b, cat(cat(inv(F), target), inv(Bk))); return; }
            while (j >= i && table[b][w[j] ^ 1] >= 0) {
                const d = table[b][w[j] ^ 1], N = lab[b][w[j] ^ 1];
                const r = find(d);
                Bk = cat(inv(fm), cat(inv(N), Bk)); b = r; j--;
            }
            if (j < i) { coincidence(f, b, cat(cat(inv(F), target), inv(Bk))); return; }
            if (i === j) {
                const D = cat(cat(inv(F), target), inv(Bk));      // t_f·w_i = D·t_b
                table[f][w[i]] = b; lab[f][w[i]] = D; table[b][w[i] ^ 1] = f; lab[b][w[i] ^ 1] = inv(D);
                ded.push(f, w[i]);
                return;
            }
            if (!fill) return;
            define(f, w[i]);
        }
    };
    const rels = relators.map(cyclicReduce).filter((w) => w.length);
    const byFirst = Array.from({ length: W }, () => []);
    const seenRot = new Set();
    for (const r of rels) for (const w of [r, r.slice().reverse().map((x) => x ^ 1)]) for (let i = 0; i < w.length; i++) {
        const rot = w.slice(i).concat(w.slice(0, i)), k = rot.join(',');
        if (!seenRot.has(k)) { seenRot.add(k); byFirst[rot[0]].push(rot); }
    }
    const words = [];
    subgroupWords.forEach((w, s) => { const u = freeReduce(w); if (u.length) words.push({ w: u, target: node(1, s + 1, 0) }); });
    const process = () => {
        do {
            while (ded.length) {
                const x = ded.pop(), c = find(ded.pop());
                for (const w of byFirst[x]) { if (parent[c] !== c) break; scan(c, w, false, 0); }
                const d = table[find(c)][x];
                if (d >= 0) { const dd = find(d); for (const w of byFirst[x ^ 1]) { if (parent[dd] !== dd) break; scan(dd, w, false, 0); } }
            }
            for (const { w, target } of words) scan(0, w, false, target);
        } while (ded.length);
    };
    try {
        for (const { w, target } of words) scan(0, w, true, target);
        process();
        let c = 0, steps = 0;
        while (c < table.length) {
            if (parent[c] === c) {
                let x = 0;
                while (x < W && parent[c] === c) {
                    if (table[c][x] < 0) { define(c, x); process(); }
                    x++;
                    if (++steps % 512 === 0 && Date.now() > deadline) throw new Limit('time');
                }
            }
            c++;
        }
    } catch (e) {
        if (e instanceof Limit) return { limit: e.message, defined: table.length };
        throw e;
    }
    const live = [];
    for (let c = 0; c < table.length; c++) if (parent[c] === c) live.push(c);
    const num = new Map(live.map((c, i) => [c, i]));
    const T = [], TL = [];
    for (const c of live) {
        const row = new Array(W), lrow = new Array(W);
        for (let x = 0; x < W; x++) {
            const dd = table[c][x];
            if (dd < 0) { row[x] = -1; lrow[x] = 0; continue; }
            const r = find(dd);
            row[x] = num.get(r); lrow[x] = cat(lab[c][x], fm);
        }
        T.push(row); TL.push(lrow);
    }
    const fail = (() => {
        for (const row of T) if (row.some((dd) => dd === undefined || dd < 0)) return 'undefined entry';
        for (let c = 0; c < T.length; c++) for (let x = 0; x < W; x++) if (T[T[c][x]][x ^ 1] !== c) return 'inverse letters disagree';
        for (const r of relators) for (let c = 0; c < T.length; c++) { let dd = c; for (const x of r) dd = T[dd][x]; if (dd !== c) return 'a relator does not close'; }
        for (const { w } of words) { let dd = 0; for (const x of w) dd = T[dd][x]; if (dd !== 0) return 'a subgroup generator does not fix coset 1'; }
        return null;
    })();
    if (fail) return { limit: `verification: ${fail}`, defined: table.length };
    // lengths of the expanded labels (before free reduction), memoized
    const lenMemo = new Map();
    const length = (n0) => {
        const stack = [n0];
        while (stack.length) {
            const n = stack[stack.length - 1];
            if (n === 0 || lenMemo.has(n)) { stack.pop(); continue; }
            if (kind[n] === 1) { lenMemo.set(n, 1); stack.pop(); continue; }
            const kids = kind[n] === 2 ? [A[n], B[n]] : [A[n]];
            const todo = kids.filter((k) => k !== 0 && !lenMemo.has(k));
            if (todo.length) { stack.push(...todo); continue; }
            lenMemo.set(n, kids.reduce((s, k) => s + (k === 0 ? 0 : lenMemo.get(k)), 0));
            stack.pop();
        }
        return n0 === 0 ? 0 : lenMemo.get(n0);
    };
    // the word of a label, freely reduced (letters ±(s+1)): bottom up over the program, each node's
    // reduced word made once from its children's, so the (often enormous) unreduced word is never
    // written out; null when some reduced word along the way is longer than maxLength
    const reduced = new Map([[0, []]]);
    const joinReduced = (a, b) => {
        let i = a.length, j = 0;
        while (i > 0 && j < b.length && a[i - 1] === -b[j]) { i--; j++; }
        return a.slice(0, i).concat(b.slice(j));
    };
    const expand = (n0, maxLength = 1e6) => {
        const stack = [n0];
        while (stack.length) {
            const n = stack[stack.length - 1];
            if (reduced.has(n)) { stack.pop(); continue; }
            const k = kind[n];
            if (k === 1) { reduced.set(n, [A[n]]); stack.pop(); continue; }
            const kids = k === 2 ? [A[n], B[n]] : [A[n]];
            const todo = kids.filter((c) => !reduced.has(c));
            if (todo.length) { stack.push(...todo); continue; }
            const a = reduced.get(A[n]);
            if (a === null) { reduced.set(n, null); stack.pop(); continue; }
            let w;
            if (k === 3) w = a.slice().reverse().map((x) => -x);
            else { const b = reduced.get(B[n]); w = b === null ? null : joinReduced(a, b); }
            reduced.set(n, w && w.length > maxLength ? null : w);
            stack.pop();
        }
        const w = reduced.get(n0);
        return w ? w.slice() : null;
    };
    // the labels read along w from coset c, multiplied (freely reduced): t_c·w = word·t_end
    const traceWord = (c, w, maxLength = 1e6) => {
        let acc = [], d = c;
        for (const x of w) {
            const L = expand(TL[d][x], maxLength);
            if (L === null) return { word: null, end: -1 };
            acc = joinReduced(acc, L);
            if (acc.length > maxLength) return { word: null, end: -1 };
            d = T[d][x];
        }
        return { word: acc, end: d };
    };
    return { index: T.length, table: T, labels: TL, defs, live, expand, traceWord, length, nodes: kind.length, defined: table.length };
}

/**
 * The modified Todd–Coxeter algorithm: a presentation of H = ⟨subgroupWords⟩ ≤ G = ⟨X | relators⟩ on H's
 * own generators h₁ … h_m, when [G : H] is finite.
 *
 * The labeled enumeration gives coset representatives t_c (t₁ = 1) and, for every coset c and letter x,
 * a word L(c, x) in the h's with t_c·x = L(c, x)·t_{c·x} in G. Reading a relator r of G around coset c
 * multiplies the labels into a word in the h's equal to t_c·r·t_c⁻¹ = 1, and reading h_s's word w_s
 * from coset 1 gives a word equal to h_s. Then
 *     H = ⟨ h₁ … h_m | r read around c (every coset c, every relator r),  h_s⁻¹·(w_s read from 1) ⟩.
 * Reidemeister–Schreier presents H on the Schreier generators t′_c·x·t′_{c·x}⁻¹ of any transversal
 * t′_c = λ_c·t_c (λ_c ∈ H); the labels write each of them as λ_c·L(c, x)·λ_{c·x}⁻¹ in the h's, its
 * relators become conjugates of the words above, and Tietze moves that replace the Schreier generators
 * by those words leave exactly this presentation. So, unlike Reidemeister–Schreier followed by a search,
 * it is always on the given generators.
 *
 * Returns { index, relators (words in ±(s+1), freely and cyclically reduced, without repeats), rewrite
 * (a word in X for an element of H → a word in the h's, or null when too long), table, nodes, defined },
 * or { limit } (with index when only a label was too long).
 */
export function subgroupPresentation(nGens, relators, subgroupWords, opts = {}) {
    const maxLength = opts.maxLength ?? 100000;
    const r = enumerateFelschAugmented(nGens, relators, subgroupWords, opts);
    if (!r.index) return r;
    const out = [], seen = new Set();
    const add = (w) => {
        const u = cyclicReduceSigned(w);
        if (!u.length) return;
        const k = rotationKey(u);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(u);
    };
    for (const rel of relators.map(cyclicReduce).filter((w) => w.length)) {
        for (let c = 0; c < r.index; c++) {
            const { word, end } = r.traceWord(c, rel, maxLength);
            if (word === null) return { limit: 'a relator is too long', index: r.index };
            if (end !== c) throw new Error('internal: a relator does not close in the table');
            add(word);
        }
    }
    for (let s = 0; s < subgroupWords.length; s++) {
        const { word, end } = r.traceWord(0, subgroupWords[s], maxLength);
        if (word === null) return { limit: 'a generator’s word is too long', index: r.index };
        if (end !== 0) throw new Error('internal: a subgroup generator does not fix coset 1');
        add([-(s + 1)].concat(word));
    }
    const rewrite = (w) => {
        const { word, end } = r.traceWord(0, w, maxLength);
        if (word !== null && end !== 0) throw new Error('the element is not in the subgroup');
        return word;
    };
    return { index: r.index, relators: out, rewrite, table: r.table, nodes: r.nodes, defined: r.defined };
}

/** Free and cyclic reduction of a word in ±(s+1). */
function cyclicReduceSigned(w) {
    const o = [];
    for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); }
    let i = 0, j = o.length - 1;
    while (i < j && o[i] === -o[j]) { i++; j--; }
    return o.slice(i, j + 1);
}
/** The same key for a cyclic word, its rotations and its inverse (exact rotations up to length 400). */
function rotationKey(u) {
    if (u.length > 400) return u.join(',');
    const inv = u.slice().reverse().map((x) => -x);
    let best = null;
    for (const v of [u, inv]) for (let i = 0; i < v.length; i++) {
        const k = v.slice(i).concat(v.slice(0, i)).join(',');
        if (best === null || k < best) best = k;
    }
    return best;
}

/**
 * When ⟨subgroupWords⟩ is the whole group: every generator k as a word in the subgroup generators
 * (letters ±(s+1), freely reduced). Returns { index, words } (words only when the index is 1, null for a
 * generator whose word is longer than maxLength), or { limit }.
 */
export function expressGenerators(nGens, relators, subgroupWords, opts = {}) {
    const r = enumerateFelschAugmented(nGens, relators, subgroupWords, opts);
    if (!r.index) return r;
    if (r.index !== 1) return { index: r.index, words: null, nodes: r.nodes };
    const maxLength = opts.maxLength ?? 200000;
    const words = Array.from({ length: nGens }, (_, k) => r.expand(r.labels[0][2 * k], maxLength));
    return { index: 1, words, nodes: r.nodes, defined: r.defined };
}
