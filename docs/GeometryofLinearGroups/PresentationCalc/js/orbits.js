/**
 * orbits.js — enumeration of the vertex orbits of Γ ⊂ PGL₂(ℤ[1/S]) on X = ∏_{p∈S} T_p, with the
 * vertex stabilizers as Stallings graphs in PGL₂(ℤ): coset enumeration with the tree part done by
 * representatives and the PGL₂(ℤ) part done by folding.
 *
 * Representatives r_k are vertices of X with frames h_k (h_k·o = r_k in every tree) and groups
 * P_k ⊆ Γ_{r_k}. A witness wit[k][i][t] = { g, j } says g·r_j is the neighbour of r_k in tree i
 * with index t (in the frame of k). Undefined witnesses are defined by new representatives (the
 * neighbour itself, g = 1). Information comes from lifting generators (rule D, at every
 * representative: γ·r_k is reached by a path whose lift ends at y·r_m, so y⁻¹γ carries r_k to
 * r_m) and from the closure rules A (vertex groups through witnesses), B (back edges) and
 * C (squares). An element carrying r_a to r_b is a stabilizer element (a = b) or a coincidence
 * (a ≠ b: b merges into a, its witnesses are compared with a's, which can cascade).
 *
 * When every live representative has all its witnesses and A, B, C and D (at r_0) change
 * nothing, path lifting is well defined (X is simply connected through squares), the
 * representatives are the vertex orbits, and Γ_{r_k} = P_k exactly:
 * [PGL₂(ℤ[1/S]) : Γ] = Σ_k [PGL₂(ℤ) : P_k] — finite, or infinite (thin).
 *
 * Without a covering there are two orders of work. HLT (orbitDecide): lift every generator at
 * every representative, defining as it goes. Fold-first (orbitFoldDecide): lay down only the
 * generators' paths at o, fold to a fixpoint without new representatives (rules B, C, rule A
 * through the P_k-orbits on P¹(F_p), lifts), and only then define one neighbour per orbit with
 * no witness; the tree of p + 1 neighbours costs one representative per P_k-orbit. They succeed
 * on different groups; orbitDecideAuto runs both.
 */
import { Tree, SubPGL2Z, prim, lineAct, kernelGens } from './bsfold.js';
import { normalBlocks, blockLength } from './stallings.js';

const babs = (x) => (x < 0n ? -x : x);
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const adj = (A) => [A[3], -A[1], -A[2], A[0]];
const det = (A) => A[0] * A[3] - A[1] * A[2];
const M = (...As) => As.reduce((X, Y) => prim(mul(X, Y)));
const inv = (A) => prim(adj(A));
const ID = [1n, 0n, 0n, 1n];
const J = [-1n, 0n, 0n, 1n];
const BIG = 1n << 200000n;                          // entries beyond 200k bits: out of budget
const tooBig = (A) => A.some((x) => x > BIG || -x > BIG);
const sizeBudget = () => Object.assign(new Error('matrix entries too large'), { budget: true });
const isId = (A) => A[1] === 0n && A[2] === 0n && A[0] === A[3];
const mod = (x, m) => ((x % m) + m) % m;
function modinv(a, m) {
    let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    return mod(s0, m);
}

export class OrbitComplex {
    constructor(primes, gens, opts = {}) {
        this.primes = primes.map(BigInt);
        this.Ts = this.primes.map((p) => new Tree(p));
        this.nT = this.Ts.length;
        this.o = this.Ts.map((T) => T.canon(0, 0n, 1n));
        this.gens = gens;
        this.deadline = opts.deadline ?? Infinity;
        this.maxReps = opts.maxReps ?? 20000;
        this.maxGraph = opts.maxGraph ?? 8000000;      // live vertices in all the Stallings graphs (≈ 80 B each, and 5(p+1) B in the line searches)
        this.maxHeap = opts.maxHeap ?? 2.5e9;          // bytes of JS heap (Node), checked now and then
        this.maxBasisGraph = opts.maxBasisGraph ?? 6000000;   // a basis means a matrix per vertex: not beyond this
        this.ticks = 0;
        this.reps = []; this.H = []; this.Hi = []; this.P = []; this.wit = []; this.dead = [];
        this.byTuple = new Map();
        this.queue = [];      // pending relations [x, from, to]: x·r_from = r_to
        this.changes = 0;
    }
    tid(tuple) { return tuple.map((v, i) => this.Ts[i].id(v)).join('|'); }
    act(g, tuple) { return tuple.map((v, i) => this.Ts[i].act(g, v)); }
    frameOf(tuple) {
        const Ts = this.Ts;
        let D = 1n; const ms = [];
        tuple.forEach((v, i) => { const m = Math.max(v.m, -v.k, 0); ms.push(m); D *= Ts[i].pow(m); });
        let A = 0n, Mod = 1n;
        tuple.forEach((v, i) => {
            const T = Ts[i], e = ms[i] + v.k;
            if (e <= 0) return;
            const md = T.pow(e);
            const target = mod((D / T.pow(ms[i])) * v.r * T.pow(ms[i] - v.m), md);
            const x = mod((target - A) * modinv(Mod, md), md);
            A += Mod * x; Mod *= md;
        });
        let Nn = 1n, Nd = 1n;
        tuple.forEach((v, i) => { if (v.k >= 0) Nn *= Ts[i].pow(v.k); else Nd *= Ts[i].pow(-v.k); });
        const h = prim([Nn * D, A * Nd, 0n, D * Nd]);
        if (this.tid(this.act(h, this.o)) !== this.tid(tuple)) throw new Error('frame: h·o ≠ r');
        return h;
    }
    addRep(tuple) {
        const id = this.tid(tuple);
        if (this.byTuple.has(id)) return this.byTuple.get(id);
        if (this.reps.length >= this.maxReps) throw Object.assign(new Error('too many representatives'), { budget: true });
        this.checkHeap();
        const k = this.reps.length;
        this.reps.push(tuple);
        const h = this.frameOf(tuple);
        this.H.push(h); this.Hi.push(inv(h));
        this.P.push(new SubPGL2Z());
        this.wit.push(this.Ts.map((T) => new Array(T.q).fill(null)));
        this.dead.push(null);
        this.byTuple.set(id, k);
        this.changes++;
        return k;
    }
    /** the live representative of k: { r, U } with U·r_r = r_k */
    find(k) {
        let U = ID;
        while (this.dead[k]) { const { a, u } = this.dead[k]; U = M(U, u); k = a; }
        return { r: k, U };
    }
    neighbour(k, i, t) { const tuple = this.reps[k].slice(); tuple[i] = this.Ts[i].act(this.H[k], this.Ts[i].neighbour(this.o[i], t)); return tuple; }
    index(k, i, vtx) { return this.Ts[i].index(this.o[i], this.Ts[i].act(this.Hi[k], vtx)); }
    /** the witness, resolved to a live representative; defined on demand */
    getWit(k, i, t, define) {
        let W = this.wit[k][i][t];
        if (!W) {
            if (!define) return null;
            const j = this.addRep(this.neighbour(k, i, t));
            W = this.wit[k][i][t] = { g: ID, j };
            this.changes++;
        }
        if (this.dead[W.j]) { const { r, U } = this.find(W.j); W = this.wit[k][i][t] = { g: M(W.g, U), j: r }; }
        return W;
    }
    toFrame(k, x) { const C = M(this.Hi[k], x, this.H[k]); if (babs(det(C)) !== 1n) throw new Error('toFrame: element does not fix r_k'); return C; }
    relate(x, from, to) { if (tooBig(x)) throw sizeBudget(); this.queue.push([x, from, to]); }
    /** process pending relations: stabilizer elements and coincidences */
    /**
     * Process pending relations. Coincidences first (they can cascade); then the stabilizer
     * elements, shortest normal form first, so that long ones mostly find themselves members.
     */
    flush() {
        const stabs = [];
        for (;;) {
            while (this.queue.length) {
                if (Date.now() > this.deadline) throw Object.assign(new Error('deadline'), { budget: true });
                this.checkHeap();
                const [x0, from, to] = this.queue.pop();
                const A = this.find(from), B = this.find(to);
                if (A.r === B.r) { stabs.push([x0, from, to]); continue; }
                this.coincide(M(inv(B.U), x0, A.U), A.r, B.r);
            }
            if (!stabs.length) return;
            const items = [];
            for (const [x0, from, to] of stabs.splice(0)) {
                const A = this.find(from), B = this.find(to);
                if (A.r !== B.r) { this.queue.push([x0, from, to]); continue; }
                const x = M(inv(B.U), x0, A.U);              // x0·U_A·r_a = U_B·r_b
                if (isId(x)) continue;
                const C = this.toFrame(A.r, x);
                items.push({ C, k: A.r, len: blockLength(normalBlocks(det(C) === 1n ? C : M(C, J))) });
            }
            items.sort((p, q) => (p.len < q.len ? -1 : p.len > q.len ? 1 : 0));
            for (const { C, k } of items) {
                if (Date.now() > this.deadline) throw Object.assign(new Error('deadline'), { budget: true });
                if (this.dead[k]) { this.queue.push([M(this.H[k], C, this.Hi[k]), k, k]); continue; }
                if (this.P[k].add(C, true)) {
                    this.changes++;
                    if (this.P[k].F.size > this.maxGraph / 4 && this.P.reduce((t, P) => t + P.F.size, 0) > this.maxGraph) throw Object.assign(new Error('Stallings graphs too large'), { budget: true });
                }
            }
            if (!this.queue.length) return;
        }
    }
    checkHeap() {
        if (++this.ticks % 2000 || typeof process === 'undefined' || !process.memoryUsage) return;
        const used = process.memoryUsage().heapUsed;
        if (globalThis.ORBIT_DEBUG) globalThis.ORBIT_DEBUG({ heap: used, reps: this.reps.length, live: this.live().length, queue: this.queue.length, graph: this.P.reduce((t, P) => t + P.F.size, 0), alloc: this.P.reduce((t, P) => t + P.F.n, 0) });
        if (used > this.maxHeap) throw Object.assign(new Error('heap budget'), { budget: true });
    }
    /** x·r_a = r_b with a ≠ b live: the later merges into the earlier */
    coincide(x, a0, b0) {
        let a = a0, b = b0, u = x;                   // u·r_a = r_b
        if (b < a) { [a, b] = [b, a]; u = inv(u); }
        this.dead[b] = { a, u };
        this.changes++;
        const ui = inv(u);
        if (this.P[b].F.size > this.maxBasisGraph) throw Object.assign(new Error('stabilizer too large for its basis'), { budget: true });
        for (const C of this.P[b].basis().concat(this.P[b].deferred || [])) { const y = M(ui, this.H[b], C, this.Hi[b], u); this.queue.push([y, a, a]); }
        // b's witnesses, carried to a: neighbour t of r_b ↦ u⁻¹·(that neighbour), a neighbour of r_a
        for (let i = 0; i < this.nT; i++) for (let t = 0; t < this.Ts[i].q; t++) {
            const W = this.wit[b][i][t];
            if (!W) continue;
            const t2 = this.index(a, i, this.Ts[i].act(ui, this.neighbour(b, i, t)[i]));
            const W2 = this.wit[a][i][t2];
            if (!W2) this.wit[a][i][t2] = { g: M(ui, W.g), j: W.j };
            else this.queue.push([M(inv(W2.g), ui, W.g), W.j, W2.j]);   // both reach that neighbour
        }
    }
    live() { const out = []; for (let k = 0; k < this.reps.length; k++) if (!this.dead[k]) out.push(k); return out; }

    /** rule D at r_k for γ: lift the path r_k → γ·r_k */
    liftRelation(k, gamma, define) {
        let y = ID, cur = k;
        const target = this.act(gamma, this.reps[k]);
        for (let i = 0; i < this.nT; i++) {
            const here = this.act(y, this.reps[cur]);
            const path = this.Ts[i].path(here[i], target[i]);
            for (let s = 1; s < path.length; s++) {
                const t = this.index(cur, i, this.Ts[i].act(inv(y), path[s]));
                const W = this.getWit(cur, i, t, define);
                if (!W) return false;
                y = M(y, W.g); cur = W.j;
                if (tooBig(y)) throw sizeBudget();
            }
        }
        this.relate(M(inv(y), gamma), k, cur);          // y⁻¹γ·r_k = r_cur
        return true;
    }
    /** rules A, B, C at a live representative k (witnesses defined only if `define`) */
    rules(k, define, noA = false) {
        const { Ts, nT } = this;
        if (Date.now() > this.deadline) throw Object.assign(new Error('deadline'), { budget: true });
        for (let i = 0; i < nT; i++) {
            const q = Ts[i].q, p = Number(this.primes[i]);
            // (A) needs a basis, a matrix per vertex: skipped while the graph is huge (it usually
            // collapses as other relations fold in); such a pass cannot count as closed
            const skipA = noA || this.P[k].F.size > this.maxBasisGraph;
            if (skipA && !noA) this.incomplete = true;
            for (const C of skipA ? [] : this.P[k].basis()) {   // (A)
                this.checkHeap();
                const s = M(this.H[k], C, this.Hi[k]);
                for (let t = 0; t < q; t++) {
                    const W1 = this.getWit(k, i, t, define), W2 = this.getWit(k, i, lineAct(C, t, p), define);
                    if (W1 && W2) this.relate(M(inv(W2.g), s, W1.g), W1.j, W2.j);
                }
            }
            for (let t = 0; t < q; t++) {                       // (B)
                const W = this.getWit(k, i, t, define);
                if (!W) continue;
                const t2 = this.index(W.j, i, Ts[i].act(inv(W.g), this.reps[k][i]));
                const W2 = this.getWit(W.j, i, t2, define);
                if (W2) this.relate(M(W.g, W2.g), W2.j, k);
            }
            for (let i2 = i + 1; i2 < nT; i2++) {               // (C)
                for (let t = 0; t < q; t++) for (let t2 = 0; t2 < Ts[i2].q; t2++) {
                    this.checkHeap();
                    const c = this.reps[k].slice();
                    c[i] = this.neighbour(k, i, t)[i]; c[i2] = this.neighbour(k, i2, t2)[i2];
                    const route = (ia, ta, ib) => {
                        const W = this.getWit(k, ia, ta, define);
                        if (!W) return null;
                        const tb = this.index(W.j, ib, Ts[ib].act(inv(W.g), c[ib]));
                        const W2 = this.getWit(W.j, ib, tb, define);
                        return W2 ? { y: M(W.g, W2.g), m: W2.j } : null;
                    };
                    const R1 = route(i, t, i2), R2 = route(i2, t2, i);
                    if (R1 && R2) this.relate(M(inv(R1.y), R2.y), R2.m, R1.m);
                }
            }
            if (this.dead[k]) return;
        }
    }
    /**
     * Rule A through orbits: the neighbours of r_k in one P_k-orbit (on P¹(F_p), with transporters
     * t ∈ P_k from the orbit's root) all get witnesses from one witnessed member; two witnessed
     * members give a relation. Defines nothing.
     */
    propagate(k) {
        const { Ts, nT } = this;
        for (let i = 0; i < nT; i++) {
            const p = Number(this.primes[i]), q = Ts[i].q;
            const info = this.P[k].orbits(p);
            const first = new Map();                 // root → a witnessed member j0 (and its transporter)
            for (let j = 0; j < q; j++) {
                const W = this.wit[k][i][j];
                if (!W || first.has(info[j].root)) continue;
                first.set(info[j].root, j);
            }
            for (let j = 0; j < q; j++) {
                const j0 = first.get(info[j].root);
                if (j0 === undefined || j0 === j) continue;
                const W0 = this.getWit(k, i, j0, false);
                if (!W0) continue;
                // s carries the neighbour j0 of r_k to the neighbour j (in the world frame)
                const s = M(this.H[k], info[j].t, inv(info[j0].t), this.Hi[k]);
                const W = this.getWit(k, i, j, false);
                if (!W) { this.wit[k][i][j] = { g: M(s, W0.g), j: W0.j }; this.changes++; }
                else this.relate(M(inv(W.g), s, W0.g), W0.j, W.j);
                if (this.dead[k]) return;
            }
        }
    }
    /** the neighbour orbits of live representatives with no witness: [k, i, root] */
    uncovered() {
        const out = [];
        for (const k of this.live()) for (let i = 0; i < this.nT; i++) {
            const p = Number(this.primes[i]), q = this.Ts[i].q;
            const info = this.P[k].orbits(p), seen = new Set();
            for (let j = 0; j < q; j++) if (this.wit[k][i][j]) seen.add(info[j].root);
            const roots = new Set();
            for (let j = 0; j < q; j++) if (!seen.has(info[j].root) && !roots.has(info[j].root)) { roots.add(info[j].root); out.push([k, i, info[j].root]); }
        }
        return out;
    }
    /** a new representative: the neighbour t of r_k in tree i, with its back edge witnessed */
    defineNeighbour(k, i, t) {
        // the neighbour itself is the representative (it may exist already, possibly merged away)
        const j = this.addRep(this.neighbour(k, i, t));
        if (!this.wit[k][i][t]) { this.wit[k][i][t] = { g: ID, j }; this.changes++; }
        if (!this.dead[j]) {
            const t2 = this.index(j, i, this.reps[k][i]);
            if (!this.wit[j][i][t2]) this.wit[j][i][t2] = { g: ID, j: k };
        }
        return j;
    }
    complete() {
        for (const k of this.live()) for (let i = 0; i < this.nT; i++) for (let t = 0; t < this.Ts[i].q; t++) if (!this.wit[k][i][t]) return false;
        return true;
    }
    stats() {
        const live = this.live();
        const groups = live.map((k) => ({ rep: this.tid(this.reps[k]), ...this.P[k].stats(), finiteGroup: this.P[k].isFinite(), huge: this.P[k].pendingHuge() }));
        return { reps: live.length, defined: this.reps.length, groups };
    }
}

/**
 * Seed the complex with a covering from covering.js (FlashBeam), complete or not: its representatives,
 * its witness words, and the stabilizer elements it found. `gens` are the covering's generators
 * (BigInt quadruples, in its order); the trees of X must be in the order of P.places.
 */
export function seedFromCovering(X, P, gens, conj = ID) {
    const conv = (vt, T) => {           // Place vertex ⌊Σ d_i p^{lo+i}⌋_k → Tree vertex (k, a)
        const lo = Math.min(vt.lo, 0);
        let N = 0n;
        vt.d.forEach((di, i) => { N += BigInt(di) * T.pow(vt.lo + i - lo); });
        return T.canon(vt.k, N, T.pow(-lo));
    };
    const wordMat = (w) => { let A = ID; for (const l of w) A = M(A, l > 0 ? gens[l - 1] : inv(gens[-l - 1])); return A; };
    const cert = P.certificate();
    // the covering is for Γ; gens = conj⁻¹·Γ's generators·conj, so its vertices move by conj⁻¹
    const ci = inv(conj);
    const reps = cert.reps.map((r) => X.act(ci, r.map((x, i) => conv(x.vt, X.Ts[i]))));
    reps.forEach((t) => X.addRep(t));
    for (const w of cert.witnesses) {
        const g = wordMat(w.word);
        const img = X.act(g, X.reps[w.rep]);
        const i = w.place, k = w.from;
        // the image is r_k moved in tree i only
        // the word is exact, so g is a witness for wherever it lands; one that does not land on a
        // neighbour of r_k in tree i (an unverified partial covering) is skipped
        if (img.some((v, i2) => i2 !== i && X.Ts[i2].id(v) !== X.Ts[i2].id(X.reps[k][i2]))) continue;
        if (X.Ts[i].dist(img[i], X.reps[k][i]) !== 1) continue;
        const t = X.index(k, i, img[i]);
        if (!X.wit[k][i][t]) X.wit[k][i][t] = { g, j: w.rep };
    }
    for (let k = 0; k < X.reps.length; k++) for (let i = 0; i < X.nT; i++) for (let t = 0; t < X.Ts[i].q; t++) {
        if (X.wit[k][i][t]) continue;
        const j = X.byTuple.get(X.tid(X.neighbour(k, i, t)));
        if (j !== undefined) X.wit[k][i][t] = { g: ID, j };
    }
    for (const e of P.stab) X.relate(wordMat(e.word), 0, 0);
    P.repStab.forEach((list, k) => { if (k) for (const e of list) X.relate(wordMat(e.word), k, k); });
    X.flush();
}

/**
 * Decide S-arithmeticity of Γ = ⟨rows⟩ ⊂ PGL₂(ℚ) (S: the primes where Γ is unbounded) by the orbit
 * complex: seeded with a complete covering when one is given (and Γ ⊂ PGL₂(ℤ[1/S]) already),
 * otherwise enumerated from o.
 * Returns { status: 'closed' | 'budget' | 'huge-pending' | 'error' | 'kernel-error',
 *           verdict: 'sarith' | 'thin' | null, index, reps, groups, kernelIndex, seeded, ms }.
 * index is [PGL₂(ℤ[1/S]) : K] for the kernel K ⊆ Γ of index kernelIndex.
 */
export function orbitDecide(rows, S, { seconds = 30, covering = null, maxReps = 20000, maxGraph = 8000000, maxHeap = null } = {}) {
    const t0 = Date.now(), deadline = t0 + 1000 * seconds;
    const K = kernelGens(rows, S);
    if (K.error) return { status: 'kernel-error', verdict: null, error: K.error, ms: Date.now() - t0 };
    // a partial covering seeds too: its representatives and witnesses; the rest is defined as needed
    const seeded = !!(covering && K.kernelIndex === 1 && covering.certify);
    const primes = seeded ? covering.places.map((pl) => BigInt(pl.p)) : S.map(BigInt).sort((a, b) => (a < b ? -1 : 1));
    const gens = K.gens;
    const X = new OrbitComplex(primes, gens, { deadline, maxReps, maxGraph, ...(maxHeap ? { maxHeap } : {}) });
    const all = gens.flatMap((g) => [g, inv(g)]);
    let status = 'budget';
    try {
        if (seeded) seedFromCovering(X, covering, gens, K.conj); else X.addRep(X.o);
        // seeded: closure passes first; new representatives (if any) are then processed HLT-style
        let next = seeded ? X.reps.length : 0;
        for (;;) {
            if (Date.now() > deadline) break;
            if (next < X.reps.length) {
                const k = next++;
                if (X.dead[k]) continue;
                for (const g of all) { X.liftRelation(k, g, true); X.flush(); if (X.dead[k]) break; }
                if (!X.dead[k]) { X.rules(k, false); X.flush(); }
                continue;
            }
            const before = X.changes;
            X.incomplete = false;
            for (const k of X.live()) { if (X.dead[k]) continue; X.rules(k, true); X.flush(); }
            for (const g of gens) { X.liftRelation(0, g, true); X.flush(); }
            if (X.changes === before && !X.incomplete && next >= X.reps.length && X.complete()) {
                // the long elements set aside: closed only if they are members now
                let added = 0;
                for (const k of X.live()) {
                    added += X.P[k].undefer();
                    if (X.P[k].F.size > X.maxGraph) throw Object.assign(new Error('Stallings graph too large'), { budget: true });
                }
                if (!added) { status = 'closed'; break; }
                X.changes += added;
            }
        }
    } catch (e) {
        // a RangeError is a structure outgrowing the engine's arrays or maps: out of budget
        if (!e.budget && !(e instanceof RangeError)) return { status: 'error', verdict: null, error: e.message.slice(0, 160), seeded, ms: Date.now() - t0 };
        if (e instanceof RangeError) return { status: 'budget', verdict: null, error: e.message.slice(0, 80), seeded, kernelIndex: K.kernelIndex, ms: Date.now() - t0 };
    }
    const st = X.stats();
    const out = { status, verdict: null, ...st, kernelIndex: K.kernelIndex, seeded, ms: Date.now() - t0 };
    if (status === 'closed') {
        if (st.groups.some((g) => g.huge)) { out.status = 'huge-pending'; return out; }
        const finite = st.groups.every((g) => g.finite);
        out.verdict = finite ? 'sarith' : 'thin';
        if (finite) out.index = st.groups.reduce((s, g) => s + g.index, 0);
        // finite stabilizers and finitely many orbits: Γ acts properly and cocompactly on ∏T_p, so it
        // is discrete in ∏_{p∈S} PGL₂(ℚ_p) — at p itself when S = {p}, and then virtually free
        else if (st.groups.every((g) => g.finiteGroup)) out.finiteStabilizers = true;
    }
    return out;
}

/**
 * Fold first, define sparingly. The generators' paths are laid down at o; then, alternately:
 * fold to a fixpoint without new representatives (rules B and C, rule A through orbits, the
 * generators lifted at o), and define one new representative per neighbour orbit that has no
 * witness (orbits of the vertex groups P_k on P¹(F_p), so a big tree costs p + 1 points, not
 * p + 1 representatives). When every orbit is witnessed, the closure of orbitDecide certifies the
 * result exactly. Same return value as orbitDecide; `strategy: 'fold'`.
 */
/**
 * Seeds from a breadth-first ball of Γ (up to `size` elements): two elements carrying o to the same
 * vertex give an element of Γ_o; an element carrying o to a neighbour of o gives its witness.
 * Exact (vertices are compared as tree coordinates). Returns the number of relations added.
 */
export function seedFromBall(X, gens, { size = 50000, deadline = Infinity, maxStab = 400 } = {}) {
    const letters = gens.flatMap((g) => [g, inv(g)]);
    const seen = new Map([[X.tid(X.o), ID]]);
    const stab = [];
    let frontier = [{ A: ID, last: -1 }], added = 0, count = 0;
    while (frontier.length && count < size && Date.now() < deadline) {
        const next = [];
        for (const { A, last } of frontier) {
            for (let j = 0; j < letters.length; j++) {
                if (last >= 0 && (j ^ 1) === last) continue;
                const B = M(A, letters[j]);
                if (tooBig(B)) continue;
                const v = X.act(B, X.o), id = X.tid(v);
                const C = seen.get(id);
                if (C) { stab.push(M(inv(C), B)); continue; }                    // C⁻¹B fixes o
                seen.set(id, B);
                count++;
                // a neighbour of o (in one tree): its witness is B
                let tree = -1, moved = 0;
                for (let i = 0; i < X.nT; i++) if (X.Ts[i].id(v[i]) !== X.Ts[i].id(X.o[i])) { moved++; tree = i; }
                if (moved === 1 && X.Ts[tree].dist(v[tree], X.o[tree]) === 1) {
                    const t = X.index(0, tree, v[tree]);
                    if (!X.wit[0][tree][t]) { X.wit[0][tree][t] = { g: B, j: 0 }; added++; }
                }
                next.push({ A: B, last: j });
                if (count >= size) break;
            }
            if (count >= size) break;
        }
        frontier = next;
    }
    // the elements of Γ_o, shortest normal form first, folded in directly (not set aside as long)
    const len = (A) => blockLength(normalBlocks(det(A) === 1n ? A : M(A, J)));
    const keyed = stab.filter((A) => !isId(A)).map((A) => ({ A, l: len(A) })).sort((a, b) => (a.l < b.l ? -1 : a.l > b.l ? 1 : 0));
    for (const { A } of keyed.slice(0, maxStab)) { if (Date.now() > deadline) break; if (X.P[0].add(A, false)) added++; }
    X.changes += added;
    X.flush();
    return added;
}

export function orbitFoldDecide(rows, S, { seconds = 30, maxReps = 20000, maxGraph = 8000000, maxHeap = null, batch = 1, liftAll = true, policy = 'orbits', ball = 0 } = {}) {
    const t0 = Date.now(), deadline = t0 + 1000 * seconds;
    const K = kernelGens(rows, S);
    if (K.error) return { status: 'kernel-error', verdict: null, error: K.error, ms: Date.now() - t0 };
    const primes = S.map(BigInt).sort((a, b) => (a < b ? -1 : 1));
    const gens = K.gens, all = gens.flatMap((g) => [g, inv(g)]);
    const X = new OrbitComplex(primes, gens, { deadline, maxReps, maxGraph, ...(maxHeap ? { maxHeap } : {}) });
    let status = 'budget', defs = 0, rounds = 0, seeds = 0;
    try {
        X.addRep(X.o);
        if (ball) seeds = seedFromBall(X, gens, { size: ball, deadline: t0 + 250 * seconds });      // a quarter of the time
        for (const g of all) { X.liftRelation(0, g, true); X.flush(); }
        const fold = () => {
            for (;;) {
                if (Date.now() > deadline) throw Object.assign(new Error('deadline'), { budget: true });
                const before = X.changes;
                for (const k of X.live()) {
                    if (X.dead[k]) continue;
                    X.propagate(k); X.flush();
                    if (X.dead[k]) continue;
                    X.rules(k, false, true); X.flush();
                    if (liftAll && !X.dead[k]) for (const g of all) { X.liftRelation(k, g, false); X.flush(); if (X.dead[k]) break; }
                }
                for (const g of gens) { X.liftRelation(0, g, false); X.flush(); }
                if (X.changes === before) return;
            }
        };
        let next = 1;                                   // 'lift': the next representative whose lifts define
        for (;;) {
            fold();
            rounds++;
            const open = X.uncovered();
            if (!open.length) break;
            if (policy === 'lift') {
                // HLT order, one representative at a time, with a full fold after it: the generators'
                // paths from it are defined (so loops close), not arbitrary neighbours
                while (next < X.reps.length && X.dead[next]) next++;
                if (next < X.reps.length) {
                    const k = next++;
                    const before = X.reps.length;
                    for (const g of all) { X.liftRelation(k, g, true); X.flush(); if (X.dead[k]) break; }
                    defs += X.reps.length - before;
                    continue;
                }
            }
            for (const [k, i, t] of open.slice(0, batch)) { if (!X.dead[k] && !X.wit[k][i][t]) { X.defineNeighbour(k, i, t); defs++; } }
            X.flush();
        }
        // every orbit witnessed: the closure of orbitDecide (now it defines nothing new, or little)
        for (;;) {
            if (Date.now() > deadline) break;
            const before = X.changes;
            X.incomplete = false;
            for (const k of X.live()) { if (X.dead[k]) continue; X.propagate(k); X.flush(); if (X.dead[k]) continue; X.rules(k, true); X.flush(); }
            for (const g of gens) { X.liftRelation(0, g, true); X.flush(); }
            if (X.changes === before && !X.incomplete && X.complete()) {
                let added = 0;
                for (const k of X.live()) {
                    added += X.P[k].undefer();
                    if (X.P[k].F.size > X.maxGraph) throw Object.assign(new Error('Stallings graph too large'), { budget: true });
                }
                if (!added) { status = 'closed'; break; }
                X.changes += added;
            }
        }
    } catch (e) {
        if (!e.budget && !(e instanceof RangeError)) return { status: 'error', verdict: null, error: e.message.slice(0, 160), strategy: 'fold', ms: Date.now() - t0 };
        if (e instanceof RangeError) return { status: 'budget', verdict: null, error: e.message.slice(0, 80), strategy: 'fold', kernelIndex: K.kernelIndex, ms: Date.now() - t0 };
    }
    const st = X.stats();
    const out = { status, verdict: null, ...st, kernelIndex: K.kernelIndex, strategy: 'fold', defs, rounds, seeds, ms: Date.now() - t0 };
    if (status === 'closed') {
        if (st.groups.some((g) => g.huge)) { out.status = 'huge-pending'; return out; }
        const finite = st.groups.every((g) => g.finite);
        out.verdict = finite ? 'sarith' : 'thin';
        if (finite) out.index = st.groups.reduce((s2, g) => s2 + g.index, 0);
        else if (st.groups.every((g) => g.finiteGroup)) out.finiteStabilizers = true;
    }
    return out;
}

/**
 * Two strategies in turn, half the time each (the second also gets what the first leaves): first
 * orbitDecide — seeded with the covering when there is one, else in HLT order — then fold-first
 * (orbitFoldDecide, unseeded, with a ball of 50000 elements: seedFromBall). They close different
 * groups: on 40 S-arithmetic groups with primes ≤ 31 (40 s each), HLT 27 and fold 30 of them, 38
 * together, every index as coset enumeration found it. A covering's stabilizer elements can be
 * long enough to swamp the Stallings graphs (millions of vertices on ⟨(0 1; 1 −3), (2 −3; −2 −2)⟩,
 * S = {2, 5}), where fold-first from scratch closes at index 19008 in seconds.
 */
export function orbitDecideAuto(rows, S, opts = {}) {
    const seconds = opts.seconds ?? 30;
    const seeded = !!(opts.covering && opts.covering.certify);
    const a = orbitDecide(rows, S, { ...opts, covering: seeded ? opts.covering : null, seconds: seconds / 2 });
    const first = seeded ? 'seeded' : 'hlt';
    if (a.status === 'closed' || a.status === 'kernel-error') return { ...a, strategy: first };
    const b = orbitFoldDecide(rows, S, { ball: 50000, ...opts, covering: null, seconds: Math.max(seconds / 2, seconds - (a.ms ?? 0) / 1000) });
    if (b.status === 'closed') return { ...b, strategy: `${first}+fold`, seeded: false };
    return { ...a, strategy: `${first}+fold`, fold: { status: b.status, reps: b.reps, defined: b.defined, error: b.error ?? null } };
}
