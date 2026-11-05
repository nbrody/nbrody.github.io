// hexagrid.js — the combinatorics behind the Hexa-Grid notes, with no DOM.
//
// Conventions (0-based internally, 1-based in anything a reader sees):
//   · directions k = 0..n-1, with v_k = (cos πk/n, sin πk/n), so the boundary
//     of P_{2n} read counter-clockwise from 0 is v_0, …, v_{n-1}, −v_0, …, −v_{n-1};
//   · a vertex of the cube C_n is a bitmask σ, and π(σ) = Σ_{k∈σ} v_k;
//   · a word is an array of letters i = 0..n-2, letter i standing for s_{i+1};
//   · a permutation is its one-line notation, an array of 0..n-1. The path p_w
//     reads w(1) w(2) … w(n), and applying s_i on the right swaps positions i, i+1;
//   · a tiling is the base mask of each of its C(n,2) parallelograms: the tile of
//     the pair i<j has corners base, base+e_i, base+e_i+e_j, base+e_j.
(function (root) {
    'use strict';

    // ---------- geometry of P_{2n} ----------
    function vectors(n) {
        const V = [];
        for (let k = 0; k < n; k++) V.push([Math.cos(Math.PI * k / n), Math.sin(Math.PI * k / n)]);
        return V;
    }
    function pos(mask, V) {
        let x = 0, y = 0;
        for (let k = 0; k < V.length; k++) if (mask >> k & 1) { x += V[k][0]; y += V[k][1]; }
        return [x, y];
    }
    const full = n => (1 << n) - 1;
    const popcount = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
    // Boundary vertices: the lower path p_0 (0 → 1 along v_0..v_{n-1}) then the upper path back.
    function boundaryMasks(n) {
        const out = [];
        for (let k = 0; k <= n; k++) out.push(full(k));
        for (let k = 1; k < n; k++) out.push(full(n) & ~full(k));
        return out;
    }

    // ---------- permutations and words ----------
    const identity = n => Array.from({ length: n }, (_, i) => i);
    function permOf(n, word) {
        const a = identity(n);
        for (const s of word) { const t = a[s]; a[s] = a[s + 1]; a[s + 1] = t; }
        return a;
    }
    function inversions(a) {
        let c = 0;
        for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++;
        return c;
    }
    function isReduced(n, word) {
        const a = identity(n);
        for (const s of word) {
            if (s < 0 || s > n - 2 || a[s] > a[s + 1]) return false;
            const t = a[s]; a[s] = a[s + 1]; a[s + 1] = t;
        }
        return true;
    }
    const isLongest = (n, word) => word.length === n * (n - 1) / 2 && isReduced(n, word);
    // s_1 · s_2 s_1 · s_3 s_2 s_1 ⋯   and   s_{n-1} · s_{n-2} s_{n-1} ⋯
    function wordA(n) { const w = []; for (let k = 0; k < n - 1; k++) for (let j = k; j >= 0; j--) w.push(j); return w; }
    function wordB(n) { const w = []; for (let k = n - 2; k >= 0; k--) for (let j = k; j <= n - 2; j++) w.push(j); return w; }
    // A reduced word for a permutation: strip right descents, then read backwards.
    function reducedWordOf(perm) {
        const a = perm.slice(), rec = [];
        for (;;) {
            let i = 0;
            while (i < a.length - 1 && a[i] < a[i + 1]) i++;
            if (i >= a.length - 1) break;
            const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t;
            rec.push(i);
        }
        return rec.reverse();
    }
    // Left multiplication by s_j swaps the values j and j+1.
    function leftMul(j, perm) { return perm.map(x => x === j ? j + 1 : x === j + 1 ? j : x); }

    function parseWord(str) {
        const s = String(str).trim();
        if (!s) return [];
        const parts = /[\s,·.]/.test(s) || /s/i.test(s)
            ? s.replace(/s_?/gi, ' ').split(/[\s,·.]+/).filter(Boolean)
            : s.split('');
        const out = [];
        for (const p of parts) {
            const k = parseInt(p, 10);
            if (!Number.isFinite(k) || k < 1) return null;
            out.push(k - 1);
        }
        return out;
    }
    function formatWord(word, sep) {
        const big = word.some(s => s >= 9);
        return word.map(s => s + 1).join(sep != null ? sep : (big ? ' ' : ''));
    }

    // ---------- moves on words ----------
    // kind 2: s_i s_j → s_j s_i with |i−j| ≥ 2.  kind 3: s_i s_{i±1} s_i → s_{i±1} s_i s_{i±1}.
    function moves(word) {
        const out = [];
        for (let p = 0; p + 1 < word.length; p++) {
            const d = Math.abs(word[p] - word[p + 1]);
            if (d >= 2) out.push({ p, kind: 2 });
            else if (d === 1 && p + 2 < word.length && word[p + 2] === word[p]) out.push({ p, kind: 3 });
        }
        return out;
    }
    function applyMove(word, m) {
        const w = word.slice();
        if (m.kind === 2) { const t = w[m.p]; w[m.p] = w[m.p + 1]; w[m.p + 1] = t; }
        else { const a = w[m.p], b = w[m.p + 1]; w[m.p] = b; w[m.p + 1] = a; w[m.p + 2] = b; }
        return w;
    }
    // The single move taking u to v (they must differ by one), or null.
    function moveBetween(u, v) {
        let p = 0;
        while (p < u.length && u[p] === v[p]) p++;
        if (p >= u.length) return null;
        if (p + 1 < u.length && u[p] === v[p + 1] && u[p + 1] === v[p] && Math.abs(u[p] - u[p + 1]) >= 2) return { p, kind: 2 };
        if (p + 2 < u.length && u[p] === u[p + 2] && v[p] === u[p + 1] && v[p + 1] === u[p] && v[p + 2] === u[p + 1]) return { p, kind: 3 };
        return null;
    }
    // Lexicographically first word in the commutation class of `word`: greedily take the
    // smallest letter whose earlier non-commuting letters are all used (a linear extension
    // of the heap).
    function lexFirst(word) {
        const r = word.length, used = new Uint8Array(r), out = [];
        for (let step = 0; step < r; step++) {
            let best = -1;
            for (let q = 0; q < r; q++) {
                if (used[q]) continue;
                let free = true;
                for (let p = 0; p < q; p++) if (!used[p] && Math.abs(word[p] - word[q]) <= 1) { free = false; break; }
                if (free && (best < 0 || word[q] < word[best])) best = q;
            }
            used[best] = 1; out.push(word[best]);
        }
        return out;
    }
    // Number of words in the commutation class = linear extensions of the heap (n small).
    function classSize(word, cap) {
        const r = word.length;
        if (r > 30) return null;
        const pred = new Array(r).fill(0);
        for (let q = 0; q < r; q++) for (let p = 0; p < q; p++) if (Math.abs(word[p] - word[q]) <= 1) pred[q] |= 1 << p;
        const memo = new Map();
        const count = used => {
            if (used === (1 << r) - 1) return 1;
            if (memo.has(used)) return memo.get(used);
            let c = 0;
            for (let q = 0; q < r; q++) if (!(used >> q & 1) && (pred[q] & used) === pred[q]) c += count(used | 1 << q);
            memo.set(used, c);
            if (cap && memo.size > cap) throw new Error('cap');
            return c;
        };
        try { return count(0); } catch (e) { return null; }
    }

    // ---------- tilings ----------
    const pairIndex = (n, i, j) => i * (2 * n - i - 1) / 2 + (j - i - 1);
    function pairs(n) { const P = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) P.push([i, j]); return P; }

    // Sweep p_0 → p_w one letter at a time. Each step pushes the path across one
    // parallelogram; returns the steps (or null if the word is not reduced).
    function sweep(n, word) {
        const a = identity(n), steps = [];
        for (let t = 0; t < word.length; t++) {
            const s = word[t];
            if (s < 0 || s > n - 2 || a[s] > a[s + 1]) return null;
            let pre = 0; for (let k = 0; k < s; k++) pre |= 1 << a[k];
            steps.push({ t, s, i: a[s], j: a[s + 1], base: pre, before: a.slice() });
            const x = a[s]; a[s] = a[s + 1]; a[s + 1] = x;
        }
        return { steps, perm: a };
    }
    function tilingFromWord(n, word) {
        const sw = sweep(n, word);
        if (!sw || word.length !== n * (n - 1) / 2) return null;
        const base = new Array(n * (n - 1) / 2);
        for (const st of sw.steps) base[pairIndex(n, st.i, st.j)] = st.base;
        return { n, base };
    }
    const cloneTiling = T => ({ n: T.n, base: T.base.slice() });
    const tilingKey = T => String.fromCharCode(...T.base);
    const sameTiling = (S, T) => S.n === T.n && S.base.every((b, k) => b === T.base[k]);
    function tilesOf(T) {
        const out = [], n = T.n;
        for (const [i, j] of pairs(n)) {
            const b = T.base[pairIndex(n, i, j)];
            out.push({ i, j, base: b, corners: [b, b | 1 << i, b | 1 << i | 1 << j, b | 1 << j] });
        }
        return out;
    }
    // Read a word off a tiling: push p_0 across a tile it follows two consecutive edges
    // of, always the leftmost one available. This is the lexicographically first word
    // of the commutation class (the representative the notes count). Null if T is not
    // a tiling of P_{2n}.
    function wordFromTiling(T, choose) {
        const n = T.n, a = identity(n), word = [], total = n * (n - 1) / 2;
        for (let step = 0; step < total; step++) {
            const avail = availableSteps(T, a);
            if (!avail.length) return null;
            const s = choose ? choose(avail) : avail[0];
            word.push(s);
            const x = a[s]; a[s] = a[s + 1]; a[s + 1] = x;
        }
        return word;
    }
    // Positions s where the path `a` runs along two consecutive edges of a tile of T.
    function availableSteps(T, a) {
        const n = T.n, out = [];
        let pre = 0;
        for (let s = 0; s + 1 < n; s++) {
            if (a[s] < a[s + 1] && T.base[pairIndex(n, a[s], a[s + 1])] === pre) out.push(s);
            pre |= 1 << a[s];
        }
        return out;
    }
    const isTiling = T => !!wordFromTiling(T);

    // Degree-3 interior vertices. For a<b<c the hexagon on base β is tiled either with
    // its interior vertex at β+e_b ('low', the s_i s_{i+1} s_i side) or at β+e_a+e_c ('high').
    function flips(T) {
        const n = T.n, B = T.base, out = [];
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
            const ab = B[pairIndex(n, a, b)], ac = B[pairIndex(n, a, c)], bc = B[pairIndex(n, b, c)];
            if (ab === bc && ac === (ab | 1 << b)) out.push({ a, b, c, beta: ab, kind: 'low', vertex: ab | 1 << b });
            else if (ab === (ac | 1 << c) && bc === (ac | 1 << a)) out.push({ a, b, c, beta: ac, kind: 'high', vertex: ac | 1 << a | 1 << c });
        }
        return out;
    }
    function flip(T, f) {
        const n = T.n, S = cloneTiling(T), { a, b, c, beta } = f;
        if (f.kind === 'low') {
            S.base[pairIndex(n, a, c)] = beta;
            S.base[pairIndex(n, a, b)] = beta | 1 << c;
            S.base[pairIndex(n, b, c)] = beta | 1 << a;
        } else {
            S.base[pairIndex(n, a, b)] = beta;
            S.base[pairIndex(n, b, c)] = beta;
            S.base[pairIndex(n, a, c)] = beta | 1 << b;
        }
        return S;
    }
    const hexagonCorners = f => {
        const { a, b, c, beta: m } = f;
        return [m, m | 1 << a, m | 1 << a | 1 << b, m | 1 << a | 1 << b | 1 << c, m | 1 << b | 1 << c, m | 1 << c];
    };
    // Tiles meeting strand k, in order from the edge v_k on p_0 to the edge −v_k on p_1.
    function strand(T, k) {
        const n = T.n, w = wordFromTiling(T);
        const sw = sweep(n, w), out = [];
        for (const st of sw.steps) if (st.i === k || st.j === k) out.push({ i: st.i, j: st.j, base: st.base, other: st.i === k ? st.j : st.i });
        return out;
    }
    // A word in the commutation class of `word` in which the three letters of the flip f
    // are consecutive, so that f is literally a 3-move at position p. The three tiles of
    // a hexagon form an interval of the heap, so: everything not above them, then them,
    // then everything above them.
    function alignFlip(n, word, f) {
        const sw = sweep(n, word), r = word.length;
        const want = new Set([pairIndex(n, f.a, f.b), pairIndex(n, f.a, f.c), pairIndex(n, f.b, f.c)]);
        const H = sw.steps.map(st => want.has(pairIndex(n, st.i, st.j)));
        const up = new Uint8Array(r);
        for (let q = 0; q < r; q++) {
            if (H[q]) continue;
            for (let p = 0; p < q; p++) if ((H[p] || up[p]) && Math.abs(word[p] - word[q]) <= 1) { up[q] = 1; break; }
        }
        const idx = [];
        for (let q = 0; q < r; q++) if (!H[q] && !up[q]) idx.push(q);
        const p = idx.length;
        for (let q = 0; q < r; q++) if (H[q]) idx.push(q);
        for (let q = 0; q < r; q++) if (up[q]) idx.push(q);
        return { word: idx.map(q => word[q]), p, order: idx };
    }
    function randomTiling(n, steps, rng) {
        rng = rng || Math.random;
        let T = tilingFromWord(n, wordA(n));
        const N = steps != null ? steps : 40 * n * n;
        for (let t = 0; t < N; t++) {
            const F = flips(T);
            if (F.length) T = flip(T, F[Math.floor(rng() * F.length)]);
        }
        return T;
    }

    // ---------- the graph Γ_w of reduced words ----------
    // Breadth-first from one reduced word of w_0; red edges are 2-moves, blue edges
    // 3-moves. Classes are the red-components, each named by its lexicographically
    // first word. A generator so that n = 6 (292 864 words) can run in slices.
    function* wordGraphIter(n, opts) {
        opts = opts || {};
        const keepEdges = !!opts.edges;
        const start = wordA(n), enc = w => w.map(s => String.fromCharCode(48 + s)).join('');
        const dec = s => Array.from(s, ch => ch.charCodeAt(0) - 48);
        const index = new Map([[enc(start), 0]]), words = [enc(start)];
        const red = [], blue = [];
        let nRed = 0, nBlue = 0;
        for (let q = 0; q < words.length; q++) {
            const w = dec(words[q]);
            for (const m of moves(w)) {
                const key = enc(applyMove(w, m));
                let id = index.get(key);
                if (id === undefined) { id = words.length; index.set(key, id); words.push(key); }
                if (id > q) {
                    if (m.kind === 2) { nRed++; if (keepEdges) red.push(q, id); }
                    else { nBlue++; if (keepEdges) blue.push(q, id); }
                }
            }
            if ((q & 16383) === 16383) yield { phase: 'words', done: q + 1, seen: words.length };
        }
        // Red components; the representative of each is its lexicographically first word.
        const comp = new Int32Array(words.length).fill(-1), reps = [];
        for (let s = 0; s < words.length; s++) {
            if (comp[s] >= 0) continue;
            const c = reps.length, stack = [s];
            comp[s] = c;
            let best = words[s];
            while (stack.length) {
                const q = stack.pop(), w = dec(words[q]);
                if (words[q] < best) best = words[q];
                for (const m of moves(w)) {
                    if (m.kind !== 2) continue;
                    const id = index.get(enc(applyMove(w, m)));
                    if (comp[id] < 0) { comp[id] = c; stack.push(id); }
                }
            }
            reps.push(best);
            if ((s & 16383) === 16383) yield { phase: 'classes', done: s + 1, seen: words.length };
        }
        return {
            n, words: opts.keepWords === false ? null : words.map(dec), count: words.length,
            red: keepEdges ? red : null, blue: keepEdges ? blue : null, nRed, nBlue,
            classOf: comp, classes: reps.map(dec).sort((x, y) => enc(x) < enc(y) ? -1 : 1).map(x => x), nClasses: reps.length,
            reps: reps.map(dec),
        };
    }
    function wordGraph(n, opts) {
        const it = wordGraphIter(n, opts);
        for (;;) { const r = it.next(); if (r.done) return r.value; }
    }
    // Tilings of P_{2n} by flips (much smaller than the word graph: 24 698 for n = 7).
    function* tilingGraphIter(n, opts) {
        opts = opts || {};
        const T0 = tilingFromWord(n, wordA(n));
        const keys = [tilingKey(T0)], index = new Map([[keys[0], 0]]), edges = [];
        const queue = [T0];
        for (let q = 0; q < queue.length; q++) {
            for (const f of flips(queue[q])) {
                const S = flip(queue[q], f), key = tilingKey(S);
                let id = index.get(key);
                if (id === undefined) { id = keys.length; index.set(key, id); keys.push(key); queue.push(S); }
                if (id > q && opts.edges) edges.push(q, id);
            }
            if (!opts.keepTilings) queue[q] = null;
            if ((q & 4095) === 4095) yield { done: q + 1, seen: keys.length };
        }
        return { n, count: keys.length, edges: opts.edges ? edges : null, tilings: opts.keepTilings ? queue : null };
    }
    function tilingGraph(n, opts) {
        const it = tilingGraphIter(n, opts);
        for (;;) { const r = it.next(); if (r.done) return r.value; }
    }
    // Known values: reduced words of w_0 (OEIS A005118) and tilings (A006245).
    const KNOWN = {
        words: [1, 1, 1, 2, 16, 768, 292864, 1100742656, 48608795688960],
        tilings: [1, 1, 1, 2, 8, 62, 908, 24698, 1232944, 112018190, 18410581880],
    };

    // ---------- Proposition 2, made constructive ----------
    // Connect two reduced words of the same permutation by 2- and 3-moves, exactly as in
    // the proof: if the first letters a ≠ b differ, s_a ∨ s_b = α is a prefix of w,
    // w = αβ, and
    //     u ~ (α)β   [induction: same first letter a]
    //       → (α')β  [one braid or commutation move]
    //       ~ v      [induction: same first letter b].
    // Returns the chain of words plus a trace of the recursion.
    function connect(n, u, v, trace) {
        const chain = connectRaw(n, u, v, trace, 0);
        // erase loops so that no word repeats
        const out = [], seen = new Map();
        for (const w of chain) {
            const k = w.join(',');
            if (seen.has(k)) { const at = seen.get(k); for (const x of out.splice(at + 1)) seen.delete(x.join(',')); continue; }
            seen.set(k, out.length); out.push(w);
        }
        return out;
    }
    function connectRaw(n, u, v, trace, depth) {
        if (u.length === 0) return [u];
        if (u[0] === v[0]) {
            const sub = connectRaw(n, u.slice(1), v.slice(1), trace, depth);
            return sub.map(x => [u[0]].concat(x));
        }
        const a = u[0], b = v[0], far = Math.abs(a - b) >= 2;
        const alpha = far ? [a, b] : [a, b, a], alphaP = far ? [b, a] : [b, a, b];
        let r = permOf(n, u);
        for (const j of alpha) r = leftMul(j, r);
        const beta = reducedWordOf(r);
        const m1 = alpha.concat(beta), m2 = alphaP.concat(beta);
        if (trace) trace.push({ depth, a, b, alpha, alphaP, beta, len: u.length });
        const p1 = connectRaw(n, u, m1, trace, depth + 1);
        const p2 = connectRaw(n, m2, v, trace, depth + 1);
        return p1.concat(p2);
    }

    // ---------- Proposition 3: lines ↔ tilings ----------
    // Lines are chords of the unit circle (the large circle of the proof), given by the
    // angles of their two endpoints. theta0 marks the arc chosen as the 0-component.
    // Faces are sign vectors σ — which lines separate them from the 0-component — and
    // the dual tile of the crossing of lines i and j has corners σ, σ+e_i, σ+e_i+e_j, σ+e_j.
    const TAU = 2 * Math.PI;
    const modTau = x => ((x % TAU) + TAU) % TAU;
    function arrangement(chords, theta0) {
        const n = chords.length;
        const P = chords.map(c => [[Math.cos(c[0]), Math.sin(c[0])], [Math.cos(c[1]), Math.sin(c[1])]]);
        // endpoints in counter-clockwise order from the 0-arc
        const ev = [];
        chords.forEach((c, L) => { ev.push({ L, end: 0, t: modTau(c[0] - theta0) }); ev.push({ L, end: 1, t: modTau(c[1] - theta0) }); });
        ev.sort((x, y) => x.t - y.t);
        const label = new Array(n).fill(-1), lineOf = [], startEnd = new Array(n);
        for (const e of ev) if (label[e.L] < 0) { label[e.L] = lineOf.length; lineOf.push(e.L); startEnd[e.L] = e.end; }
        // validity: every pair of chords crosses inside the circle
        const bad = [];
        const cross2 = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
        const segX = (A, B, C, D) => {
            const d = (B[0] - A[0]) * (D[1] - C[1]) - (B[1] - A[1]) * (D[0] - C[0]);
            if (Math.abs(d) < 1e-12) return null;
            const t = ((C[0] - A[0]) * (D[1] - C[1]) - (C[1] - A[1]) * (D[0] - C[0])) / d;
            const s = ((C[0] - A[0]) * (B[1] - A[1]) - (C[1] - A[1]) * (B[0] - A[0])) / d;
            if (t <= 0 || t >= 1 || s <= 0 || s >= 1) return null;
            return { t, s, x: [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])] };
        };
        // oriented chords: S = first endpoint met from the 0-arc, E = the other
        const S = [], E = [];
        for (let L = 0; L < n; L++) { S[L] = P[L][startEnd[L]]; E[L] = P[L][1 - startEnd[L]]; }
        const Z = [Math.cos(theta0), Math.sin(theta0)];
        const zSide = S.map((s, L) => Math.sign(cross2(s, E[L], Z)));
        const sideMask = (x, skip1, skip2) => {
            let m = 0;
            for (let L = 0; L < n; L++) {
                if (L === skip1 || L === skip2) continue;
                if (Math.sign(cross2(S[L], E[L], x)) !== zSide[L]) m |= 1 << label[L];
            }
            return m;
        };
        const X = {}; // by label pair key
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            const Li = lineOf[i], Lj = lineOf[j];
            const hit = segX(S[Li], E[Li], S[Lj], E[Lj]);
            if (!hit) { bad.push([i, j]); continue; }
            X[i + ',' + j] = hit.x;
        }
        const res = { n, chords, theta0, label, lineOf, S, E, valid: bad.length === 0, bad, X, sideMask };
        if (!res.valid) return res;
        // the tiling
        const base = new Array(n * (n - 1) / 2);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) base[pairIndex(n, i, j)] = sideMask(X[i + ',' + j], lineOf[i], lineOf[j]);
        res.tiling = { n, base };
        // the order in which each line crosses the others, walking from S to E
        res.sequences = [];
        for (let k = 0; k < n; k++) {
            const L = lineOf[k], d = [E[L][0] - S[L][0], E[L][1] - S[L][1]];
            const others = [];
            for (let j = 0; j < n; j++) if (j !== k) {
                const x = X[Math.min(j, k) + ',' + Math.max(j, k)];
                others.push({ j, t: (x[0] - S[L][0]) * d[0] + (x[1] - S[L][1]) * d[1] });
            }
            others.sort((p, q) => p.t - q.t);
            res.sequences.push(others.map(o => o.j));
        }
        // triangular faces ↔ degree-3 vertices of the tiling
        res.triangles = [];
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
            const p = [X[a + ',' + b], X[a + ',' + c], X[b + ',' + c]];
            let ok = true, m0 = null;
            for (let k = 0; k < n && ok; k++) {
                if (k === a || k === b || k === c) continue;
                const L = lineOf[k], s0 = Math.sign(cross2(S[L], E[L], p[0]));
                if (Math.sign(cross2(S[L], E[L], p[1])) !== s0 || Math.sign(cross2(S[L], E[L], p[2])) !== s0) ok = false;
            }
            if (!ok) continue;
            const g = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3];
            m0 = sideMask(g);
            res.triangles.push({ a, b, c, pts: p, vertex: m0 });
        }
        return res;
    }
    // The convex face of sign vector σ, clipped to the disk (for highlighting).
    function facePolygon(arr, mask, segs) {
        segs = segs || 96;
        let poly = [];
        for (let k = 0; k < segs; k++) poly.push([Math.cos(TAU * k / segs), Math.sin(TAU * k / segs)]);
        const { S, E, label } = arr;
        const Z = [Math.cos(arr.theta0), Math.sin(arr.theta0)];
        for (let L = 0; L < S.length; L++) {
            const s = S[L], e = E[L];
            const f = x => (e[0] - s[0]) * (x[1] - s[1]) - (e[1] - s[1]) * (x[0] - s[0]);
            const zs = Math.sign(f(Z)), want = (mask >> label[L] & 1) ? -zs : zs;
            const out = [];
            for (let k = 0; k < poly.length; k++) {
                const A = poly[k], B = poly[(k + 1) % poly.length], fa = f(A) * want, fb = f(B) * want;
                if (fa >= 0) out.push(A);
                if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]); }
            }
            poly = out;
            if (!poly.length) break;
        }
        return poly;
    }
    // Chord through two points (extended to the unit circle), as endpoint angles.
    function chordThrough(p, q) {
        const d = [q[0] - p[0], q[1] - p[1]], A = d[0] * d[0] + d[1] * d[1];
        const B = 2 * (p[0] * d[0] + p[1] * d[1]), C = p[0] * p[0] + p[1] * p[1] - 1;
        const disc = B * B - 4 * A * C;
        if (disc <= 0) return null;
        const r = Math.sqrt(disc), t1 = (-B - r) / (2 * A), t2 = (-B + r) / (2 * A);
        const x1 = [p[0] + t1 * d[0], p[1] + t1 * d[1]], x2 = [p[0] + t2 * d[0], p[1] + t2 * d[1]];
        return [Math.atan2(x1[1], x1[0]), Math.atan2(x2[1], x2[0])];
    }
    // Lines in the plane (pairs of points) → chords of a circle holding every crossing.
    function chordsFromLines(lines, margin) {
        const pts = [];
        for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
            const [A, B] = lines[i], [C, D] = lines[j];
            const d = (B[0] - A[0]) * (D[1] - C[1]) - (B[1] - A[1]) * (D[0] - C[0]);
            if (Math.abs(d) < 1e-12) continue;
            const t = ((C[0] - A[0]) * (D[1] - C[1]) - (C[1] - A[1]) * (D[0] - C[0])) / d;
            pts.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
        }
        let cx = 0, cy = 0;
        for (const p of pts) { cx += p[0]; cy += p[1]; }
        cx /= pts.length; cy /= pts.length;
        let R = 0;
        for (const p of pts) R = Math.max(R, Math.hypot(p[0] - cx, p[1] - cy));
        R *= margin || 1.18;
        const norm = p => [(p[0] - cx) / R, (p[1] - cy) / R];
        return { chords: lines.map(([A, B]) => chordThrough(norm(A), norm(B))), center: [cx, cy], R };
    }
    // How spread out the crossings of a valid arrangement are. Null when a pair misses
    // the disk or a crossing sits on the boundary (the picture would clip).
    function crossingSpread(chords) {
        if (!chords || chords.some(c => c == null)) return null;
        const arr = arrangement(chords, -Math.PI / 2 - 0.3);
        if (!arr.valid) return null;
        const xs = Object.values(arr.X);
        let minD = Infinity, maxR = 0;
        for (const p of xs) maxR = Math.max(maxR, Math.hypot(p[0], p[1]));
        if (maxR > 0.86) return null;
        for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
            minD = Math.min(minD, Math.hypot(xs[i][0] - xs[j][0], xs[i][1] - xs[j][1]));
        }
        return { minD: xs.length < 2 ? 1 : minD };
    }
    function randomChords(n, rng) {
        rng = rng || Math.random;
        const MIN_SEP = 0.05;
        let best = null, bestD = -1;
        const offer = (chords) => {
            const st = crossingSpread(chords);
            if (!st) return false;
            if (st.minD > bestD) { bestD = st.minD; best = chords; }
            return st.minD >= MIN_SEP;
        };
        // Lines through a small disk: crossings stay near the middle when every pair meets.
        for (let tries = 0; tries < 400; tries++) {
            const lines = [];
            for (let k = 0; k < n; k++) {
                const r = 0.45 * Math.sqrt(rng()), t = TAU * rng(), phi = Math.PI * rng();
                const p = [r * Math.cos(t), r * Math.sin(t)];
                lines.push([p, [p[0] + Math.cos(phi), p[1] + Math.sin(phi)]]);
            }
            if (offer(lines.map(([p, q]) => chordThrough(p, q)))) return best;
        }
        // Fallback that cannot miss combinatorially: 2n endpoints around the circle, each
        // joined to the one opposite it, so every pair of chords crosses inside the disk.
        // The slider goes up to n = 8, where the first model almost never clears the
        // separation bar; without a fallback it returns null and the figure throws.
        for (let tries = 0; tries < 80; tries++) {
            const gaps = Array.from({ length: 2 * n }, () => 0.25 + rng());
            const sum = gaps.reduce((a, b) => a + b, 0);
            let a = TAU * rng(), ang = [];
            for (const g of gaps) { ang.push(a); a += g / sum * TAU; }
            const chords = [];
            for (let i = 0; i < n; i++) chords.push([ang[i], ang[i + n]]);
            if (offer(chords)) return best;
        }
        return best;
    }

    const HG = {
        vectors, pos, full, popcount, boundaryMasks,
        identity, permOf, inversions, isReduced, isLongest, wordA, wordB, reducedWordOf, leftMul,
        parseWord, formatWord, moves, applyMove, moveBetween, lexFirst, classSize,
        pairIndex, pairs, sweep, tilingFromWord, cloneTiling, tilingKey, sameTiling, tilesOf,
        wordFromTiling, availableSteps, isTiling, flips, flip, hexagonCorners, strand, alignFlip, randomTiling,
        wordGraphIter, wordGraph, tilingGraphIter, tilingGraph, KNOWN,
        connect, arrangement, facePolygon, chordThrough, chordsFromLines, randomChords,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = HG;
    root.HG = HG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
