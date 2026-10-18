/**
 * bsfold.js — the pieces of Bass–Serre folding that the vertex-orbit enumeration (orbits.js) uses:
 *   · Tree: the Bruhat–Tits tree of PGL₂(ℚ_p), vertices as (k, a mod p^k), with neighbours, paths,
 *     the action of PGL₂(ℚ) and a frame h with h·o = v for each vertex v;
 *   · SubPGL2Z: a subgroup of PGL₂(ℤ) given by generators, as a Stallings graph (stallings.js), with
 *     exact membership, finiteness of index, and its orbits and stabilizers on P¹(F_p) (the
 *     neighbours of o in T_p); long elements are deferred until they are needed;
 *   · kernelGens: the subgroup of Γ inside PGL₂(ℤ[1/S]) (even determinant valuations outside S),
 *     conjugated to fix o at the other primes where Γ is bounded.
 */
import { Folded, normalForm, normalBlocks, blockLength, MAX_WORD, S as Sm, U as Um, U2 as U2m } from './stallings.js';
import { commonFixedVertex } from './sarithIndex.js';

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const adj = (A) => [A[3], -A[1], -A[2], A[0]];
const det = (A) => A[0] * A[3] - A[1] * A[2];
export function prim(A) {
    const g = A.reduce((s, x) => bgcd(s, x), 0n);
    let B = A.map((x) => x / g);
    const f = B.find((x) => x !== 0n);
    if (f < 0n) B = B.map((x) => -x);
    return B;
}
const M = (...As) => As.reduce((X, Y) => prim(mul(X, Y)));
const inv = (A) => prim(adj(A));
const ID = [1n, 0n, 0n, 1n];
const isId = (A) => A[1] === 0n && A[2] === 0n && A[0] === A[3];
const mod = (x, m) => ((x % m) + m) % m;
function modinv(a, m) {
    let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    if (r0 !== 1n) throw new Error('modinv: not invertible');
    return mod(s0, m);
}

/** p-adic valuation of a nonzero BigInt */
function vp(x, p) { if (x === 0n) return Infinity; let v = 0; x = babs(x); while (x % p === 0n) { x /= p; v++; } return v; }

export class Tree {
    constructor(p) { this.p = BigInt(p); this.q = Number(p) + 1; }
    pow(k) { return this.p ** BigInt(k); }
    /** canonical vertex (k, a mod p^k) for a rational a = N/D */
    canon(k, N, D) {
        const p = this.p;
        if (D < 0n) { N = -N; D = -D; }
        let m = 0; while (D % p === 0n) { D /= p; m++; }
        const E = m + k;
        if (E <= 0) return { k, r: 0n, m: 0 };
        const md = this.pow(E);
        let r = mod(N * modinv(D, md), md);
        while (m > 0 && r % p === 0n) { r /= p; m--; }
        return { k, r, m };
    }
    id(v) { return `${v.k}:${v.r}/${v.m}`; }
    /** an integer matrix H with H·o = v (columns span the lattice of v, up to scaling) */
    frame(v) {
        const s = this.pow(v.m), c = v.k >= 0 ? 1n : this.pow(-v.k);
        return [v.k >= 0 ? this.pow(v.k) * s : s, v.r * c, 0n, s * c];
    }
    /** g·v for an integer matrix g */
    act(g, v) {
        const G = mul(g, this.frame(v));
        const [x1, x2, z, w] = G;
        const d = det(G);
        const p = this.p;
        let Y, T;
        if (w !== 0n && (z === 0n || vp(w, p) <= vp(z, p))) { Y = x2; T = w; } else { Y = x1; T = z; }
        const k = vp(d, p) - 2 * vp(T, p);
        return this.canon(k, Y, T);
    }
    parent(v) { return this.canon(v.k - 1, v.r, this.pow(v.m)); }
    /** the neighbour of v with index i ∈ {0..p} (p = towards ∞) */
    neighbour(v, i) {
        if (i === Number(this.p)) return this.parent(v);
        // a + i p^k
        const s = this.pow(v.m);
        const N = v.k >= 0 ? v.r + BigInt(i) * this.pow(v.k) * s : v.r * this.pow(-v.k) + BigInt(i) * s;
        const D = v.k >= 0 ? s : s * this.pow(-v.k);
        return this.canon(v.k + 1, N, D);
    }
    /** index of the neighbour x of v */
    index(v, x) {
        if (x.k === v.k - 1) return Number(this.p);
        if (x.k !== v.k + 1) throw new Error('index: not a neighbour');
        // d = (x.a − v.a)/p^k mod p
        const p = this.p;
        // x.a − v.a = x.r/p^x.m − v.r/p^v.m
        const m = Math.max(x.m, v.m);
        let num = x.r * this.pow(m - x.m) - v.r * this.pow(m - v.m);   // over p^m
        // divide by p^k: num / p^{m+k}
        const e = m + v.k;
        if (e >= 0) { const P = this.pow(e); if (num % P !== 0n) throw new Error('index: not a child'); num /= P; }
        else num *= this.pow(-e);
        const d = Number(mod(num, p));
        if (this.id(this.neighbour(v, d)) !== this.id(x)) throw new Error('index: mismatch');
        return d;
    }
    dist(u, v) { return this.path(u, v).length - 1; }
    path(u, v) {
        const up = [u], down = [v];
        let a = u, b = v;
        while (this.id(a) !== this.id(b)) {
            if (a.k >= b.k) { a = this.parent(a); up.push(a); } else { b = this.parent(b); down.push(b); }
        }
        down.pop();
        return up.concat(down.reverse());
    }
}

// ── words in s, u, U (U = u²) for PSL₂(ℤ) = ⟨s⟩ ∗ ⟨u⟩ ──
const LET = { s: Sm, u: Um, U: U2m };
const invLetter = { s: 's', u: 'U', U: 'u' };
export const invWord = (w) => w.slice().reverse().map((x) => invLetter[x]);
export function reduceWord(raw) {
    const out = [], val = { u: 1, U: 2 };
    for (const x of raw) {
        const last = out[out.length - 1];
        if (x === 's') { if (last === 's') out.pop(); else out.push('s'); continue; }
        if (last === 'u' || last === 'U') { const v = (val[last] + val[x]) % 3; out.pop(); if (v) out.push(v === 1 ? 'u' : 'U'); }
        else out.push(x);
    }
    return out;
}
export function wordMatrix(w) { let X = ID; for (const x of w) X = mul(X, LET[x]); return prim(X); }

/**
 * H ⊂ PGL₂(ℤ) (det ±1), with exact membership through the Stallings graph of H⁺ = H ∩ PSL₂(ℤ),
 * and its action on P¹(F_p) read off the product of that graph with P¹(F_p).
 */
const DEFER_WORD = 4000n;

export class SubPGL2Z {
    constructor() { this.h0 = null; this.F = new Folded(); this._snap = null; this._orb = new Map(); this.version = 0; }
    fold() { return true; }
    _plus(g) {
        const h0 = this.h0, h0i = h0 ? inv(h0) : null;
        if (det(g) === 1n) return h0 ? [g, M(h0, g, h0i)] : [g];
        return [M(g, h0i), M(h0, g)];
    }
    /**
     * An element whose normal form is astronomically long (a huge parabolic power) cannot be folded
     * in: it is kept aside, and the closure is incomplete unless it later becomes a member.
     */
    _addPlus(g) {
        for (const y of this._plus(g)) {
            let w;
            try { w = normalForm(y); } catch (e) { if (!e.huge) throw e; (this.huge ??= []).push(y); continue; }
            if (w.length) this.F.addWord(w);
        }
    }
    _member(x) {                       // x of det 1
        return this.F.isMemberBlocks(normalBlocks(x));
    }
    has(g) {
        if (det(g) === 1n) return this._member(g);
        if (det(g) !== -1n) throw new Error('SubPGL2Z: det ' + det(g));
        return this.h0 ? this._member(M(g, inv(this.h0))) : false;
    }
    /**
     * Add g; with `defer`, an element whose normal form is long is set aside (and added by
     * undefer() only if it is still not a member when nothing else changes): folding the short
     * elements first keeps the graph near its final size.
     */
    add(g, defer = false) {
        if (defer && this._longPlus(g)) { (this.deferred ??= []).push(g); return false; }
        if (this.has(g)) return false;

        this._snap = null;
        if (det(g) === -1n && !this.h0) {
            const old = this.stabilizer(0);
            this.h0 = g;
            this.F = new Folded();
            this._snap = null;
            for (const x of old.concat([g])) this._addPlus(x);
        } else this._addPlus(g);
        this._snap = null; this._orb.clear(); this.version++;
        return true;
    }
    /** { finite, index } — index in PGL₂(ℤ) when finite */
    _longPlus(g) {
        if (det(g) === -1n && !this.h0) return blockLength(normalBlocks(M(g, g))) > DEFER_WORD;
        return this._plus(g).some((y) => blockLength(normalBlocks(y)) > DEFER_WORD);
    }
    /**
     * Add the shortest deferred element that is still not a member (one at a time: after it, the
     * closure runs again and the others often become members). Returns 1 if one was added.
     */
    undefer() {
        if (!this.deferred || !this.deferred.length) return 0;
        const len = (a) => blockLength(normalBlocks(det(a) === 1n ? a : M(a, a)));
        this.deferred = this.deferred.filter((g) => !this.has(g));
        if (!this.deferred.length) return 0;
        let best = 0;
        for (let i = 1; i < this.deferred.length; i++) if (len(this.deferred[i]) < len(this.deferred[best])) best = i;
        const [g] = this.deferred.splice(best, 1);
        return this.add(g) ? 1 : 0;
    }
    /** huge elements set aside that are still not members */
    pendingHuge() { if (!this.huge) return 0; this.huge = this.huge.filter((g) => !this.has(g)); return this.huge.length; }
    /**
     * Whether H is finite. H⁺ ⊂ PSL₂(ℤ) = ℤ/2 ∗ ℤ/3 is finite only if cyclic of order 1, 2 or 3,
     * and the Stallings basis of a nontrivial free product has ≥ 2 elements.
     */
    isFinite() {
        const plus = this.basis().filter((g) => det(g) === 1n);
        if (plus.length > 1) return false;
        if (!plus.length) return true;
        const t = plus[0][0] + plus[0][3];
        return t === 0n || t === 1n || t === -1n;
    }
    /** { finite, index } — index in PGL₂(ℤ) when finite */
    stats() {
        const st = this.F.stats();
        return { finite: st.finiteIndex, vertices: st.vertices, index: st.finiteIndex ? st.vertices * (this.h0 ? 1 : 2) : null };
    }
    /** the folded graph with compact vertex numbers */
    snap() {
        if (this._snap) return this._snap;
        const F = this.F, live = F.live(), idx = new Int32Array(F.n).fill(-1);
        live.forEach((v, i) => { idx[v] = i; });
        const S = new Int32Array(live.length).fill(-1), U = new Int32Array(live.length).fill(-1);
        live.forEach((v, i) => {
            if (F.s[v] >= 0) S[i] = idx[F.find(F.s[v])];
            if (F.u[v] >= 0) U[i] = idx[F.find(F.u[v])];
        });
        return (this._snap = { n: live.length, S, U, base: idx[F.find(0)] });
    }
    /**
     * Spanning tree of the component of (base, ℓ₀) in graph × P¹(F_p) (right action ℓ·x = x⁻¹ℓ;
     * with p = 0, the graph alone). Returns { seen, par, let, word(node) }.
     */
    _bfs(p, l0) {
        const G = this.snap(), L = p ? p + 1 : 1;
        const tab = p ? lineTables(p) : null;
        const N = G.n * L;
        const par = new Int32Array(N).fill(-2), lt = new Int8Array(N);
        const start = G.base * L + l0;
        par[start] = -1;
        const order = [start];
        for (let h = 0; h < order.length; h++) {
            const a = order[h], c = (a / L) | 0, l = a % L;
            const go = (c2, l2, x) => { const b = c2 * L + l2; if (par[b] === -2) { par[b] = a; lt[b] = x; order.push(b); } };
            if (G.S[c] >= 0) go(G.S[c], p ? tab.s[l] : 0, 1);
            if (G.U[c] >= 0) { go(G.U[c], p ? tab.u[l] : 0, 2); go(G.U[G.U[c]], p ? tab.U[l] : 0, 3); }
        }
        const word = (b) => { const w = []; while (par[b] >= 0) { w.push(['', 's', 'u', 'U'][lt[b]]); b = par[b]; } return w.reverse(); };
        return { G, L, tab, par, lt, order, start, word };
    }
    /** generators of Stab_H(line i) (p > 0), or of H itself (p = 0), as matrices */
    stabilizer(p, i = 0) {
        const B = this._bfs(p, i), { G, L, tab, par, lt, order } = B;
        // the matrix of the tree path to each node, in BFS order (parents first)
        const LM = [null, Sm, Um, U2m];
        const pm = new Array(par.length);
        pm[order[0]] = ID;
        for (let h = 1; h < order.length; h++) { const b = order[h]; pm[b] = mul(pm[par[b]], LM[lt[b]]); }
        const gen = (a, X, b) => { const g = prim(mul(mul(pm[a], X), adj(pm[b]))); return isId(g) ? null : g; };
        const out = [];
        const tree = (a, b, x) => (par[b] === a && lt[b] === x) || (par[a] === b && lt[a] === (x === 1 ? 1 : 3));
        for (const a of order) {
            const c = (a / L) | 0, l = a % L;
            if (G.S[c] >= 0) {
                const b = G.S[c] * L + (p ? tab.s[l] : 0);
                if (a <= b && !tree(a, b, 1)) { const g = gen(a, Sm, b); if (g) out.push(g); }
            }
            if (G.U[c] >= 0) {
                const b = G.U[c] * L + (p ? tab.u[l] : 0);
                if (!tree(a, b, 2)) { const g = gen(a, Um, b); if (g) out.push(g); }
            }
        }
        if (this.h0) {
            const j = p ? lineAct(this.h0, i, p) : 0;
            const b = G.base * L + j;
            if (par[b] !== -2) out.push(M(prim(pm[b]), this.h0));     // y⁻¹·i = h0·i, so y·h0 fixes i
        }
        return out;
    }
    basis() { if (this._basis?.v !== this.version) this._basis = { v: this.version, b: this.stabilizer(0) }; return this._basis.b; }
    /** H-orbits on P¹(F_p): info[j] = { root, t } with t·root = j, t ∈ H */
    orbits(p) {
        if (this._orb.has(p)) return this._orb.get(p);
        const info = new Array(p + 1).fill(null);
        this._orb.set(p, info);
        const G = this.snap(), L = p + 1;
        for (let r = 0; r <= p; r++) {
            if (info[r]) continue;
            const B = this._bfs(p, r);
            const orb = [];
            for (let j = 0; j <= p; j++) {
                const b = G.base * L + j;
                if (B.par[b] !== -2) { info[j] = { root: r, t: wordMatrix(invWord(B.word(b))) }; orb.push(j); }
            }
            if (this.h0) for (const j of orb) { const k = lineAct(this.h0, j, p); if (!info[k]) info[k] = { root: r, t: M(this.h0, info[j].t) }; }
        }
        return info;
    }
}
const _tables = new Map();
export function lineAct(C, i, p) {          // C ∈ GL₂(ℤ_p) on P¹(F_p): index i ↔ (i : 1), p ↔ (1 : 0)
    const P = BigInt(p);
    const [x, y] = i === p ? [1n, 0n] : [BigInt(i), 1n];
    const X = mod(C[0] * x + C[1] * y, P), Y = mod(C[2] * x + C[3] * y, P);
    return Y === 0n ? p : Number(mod(X * modinv(Y, P), P));
}
function lineTables(p) {
    if (_tables.has(p)) return _tables.get(p);
    const t = { s: [], u: [], U: [] };
    for (let l = 0; l <= p; l++) { t.s.push(lineAct(inv(Sm), l, p)); t.u.push(lineAct(inv(Um), l, p)); t.U.push(lineAct(inv(U2m), l, p)); }
    _tables.set(p, t);
    return t;
}

/**
 * The kernel K ⊂ Γ = ⟨rows⟩ lying in PGL₂(ℤ[1/S]): even valuation of det at the bad primes
 * (odd valuation somewhere, outside S; index 2^r), conjugated at the primes with even valuations
 * so that K fixes o there (as in sarithIndex.exactIndexCheck). Returns { gens, kernelIndex } or { error }.
 */
export function kernelGens(rows, S) {
    const Sb = S.map(BigInt);
    const mats = rows.map((r) => {
        const q = r.map((e) => /^\s*(-?\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(String(e)));
        const num = q.map((x) => BigInt(x[1])), den = q.map((x) => BigInt(x[2] || '1'));
        const L = den.reduce((l, d) => (l / bgcd(l, d)) * d, 1n);
        return prim(num.map((n, i) => n * (L / den[i])));
    });
    const bad = [];
    for (const A of mats) {
        let d = babs(det(A));
        for (const p of Sb) while (d % p === 0n) d /= p;
        for (let f = 2n; f * f <= d; f++) while (d % f === 0n) { if (!bad.includes(f)) bad.push(f); d /= f; }
        if (d > 1n && !bad.includes(d)) bad.push(d);
    }
    if (!bad.length) return { gens: mats, kernelIndex: 1, bad: [], conj: ID };
    const evenBad = bad.filter((l) => mats.every((A) => vp(det(A), l) % 2 === 0));
    const oddBad = bad.filter((l) => !evenBad.includes(l));
    const parity = (A) => oddBad.map((l) => vp(det(A), l) & 1);
    const key = (c) => c.join('');
    const reps = new Map([[key(oddBad.map(() => 0)), { c: oddBad.map(() => 0), M: ID }]]);
    const queue = [...reps.values()];
    while (queue.length) {
        const r = queue.shift();
        for (const G of mats) { const c = r.c.map((x, i) => x ^ parity(G)[i]); if (!reps.has(key(c))) { const n = { c, M: M(r.M, G) }; reps.set(key(c), n); queue.push(n); } }
    }
    let gens = [];
    for (const r of reps.values()) for (const G of mats) {
        const c = r.c.map((x, i) => x ^ parity(G)[i]);
        const sch = M(r.M, G, inv(reps.get(key(c)).M));
        if (oddBad.some((l) => vp(det(sch), l) % 2)) return { error: 'kernel element of odd valuation at a bad prime' };
        if (!isId(sch) && !gens.some((x) => x.join() === sch.join())) gens.push(sch);
    }
    // conjugated at the primes with even valuations, and at those with odd ones whose inverted edge
    // is not at o (K fixes both its ends)
    let conj = ID;                     // K's generators are conj⁻¹·(elements of Γ)·conj
    for (const l of [...evenBad, ...oddBad.filter((l) => gens.some((A) => vp(det(A), l) !== 0))]) {
        const c = commonFixedVertex(gens, l);
        if (!c) return { error: 'no common fixed vertex at ' + l };
        const ci = adj(c);
        gens = gens.map((A) => prim(mul(mul(ci, A), c)));
        conj = M(conj, c);
        if (gens.some((A) => vp(det(A), l) !== 0)) return { error: 'conjugation failed at ' + l };
    }
    return { gens, kernelIndex: reps.size, bad: bad.map(String), conj };
}
