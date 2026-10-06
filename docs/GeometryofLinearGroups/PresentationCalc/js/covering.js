/**
 * covering.js — a certificate that Γ ⊂ PGL₂(F) is S-arithmetic, searched for
 * with FlashBeam.
 *
 * Setting. Γ is Zariski dense, with invariant trace field k and quaternion
 * algebra A, and S is the set of primes of k where Γ is unbounded. Then Γ⁽²⁾
 * lies in the S-arithmetic group Λ = O¹ of the O_{k,S}-order O spanned by Γ⁽²⁾,
 * and Λ acts on the product of trees X = ∏_{𝔭∈S} T_𝔭 (A splits at every 𝔭 ∈ S,
 * or Γ would be bounded there). Write o for the standard vertex.
 *
 * The certificate. A finite set R of vertices of X ("representatives", o
 * among them) and, for every vertex n adjacent to some r ∈ R (moving one tree
 * coordinate one step), a word w in the generators and r' ∈ R with w·r' = n,
 * checked exactly. Then Γ·R contains every neighbour of Γ·R, and X is
 * connected, so Γ·R = X: Γ has finitely many orbits on the vertices of X.
 *
 *   • If A is ramified at every place at ∞, the stabilizers Λ_v are finite,
 *     and [Λ : Γ⁽²⁾] = Σ_{v ∈ Γ⁽²⁾\Λo} [Λ_v : Γ⁽²⁾_v] is finite.
 *   • If A splits at exactly one place σ at ∞, Λ_o is an arithmetic lattice
 *     in PGL₂(k_σ). The search also collects elements of Γ fixing o; if they
 *     generate a group of finite covolume at σ (shown by Poincaré's theorem
 *     on its Dirichlet domain), then Γ_o has finite index in Λ_o, every Γ_v
 *     has finite index in Λ_v (Λ_o ∩ Λ_v has finite index in both), and again
 *     [Λ : Γ⁽²⁾] < ∞.
 *
 * Either way Γ is commensurable with Λ: Γ is S-arithmetic. The search only
 * ever proves this; when it runs out it claims nothing.
 *
 * The search. FlashBeam runs as in the SO₃ project
 * (SO3DecisionAlgorithm/algorithm/geometry/flashbeam.py): the score is the
 * height d(o, g·o) in the adelic product X of all the symmetric spaces where
 * Γ is unbounded (H² or H³ at ∞, the trees at S; adelic.js), the flash keeps
 * the lowest elements found, and two words reaching one element give a
 * relation, checked exactly. At the end, adelic.js reads off the Dirichlet
 * generators of the partial Dirichlet domain cut out by the elements found.
 *
 * Arithmetic. Matrices are kept projectively, as integral primitive matrices
 * over the maximal order of F (O-coordinates, BigInt). The displacement of o
 * at 𝔭 is v_𝔭(det g) − 2·min v_𝔭(entries); vertices and their images are
 * trees' exact vertices (padicGroups/trees/js/localField.js, Place.act).
 */
import { FlashBeam, concatWords, invertWord } from './flashbeam.js';
import { makeArch, displacements, canonicalRelator } from './adelic.js';

const babs = (x) => (x < 0n ? -x : x);
function bgcd(a, b) { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; }
const bitlen = (x) => (x === 0n ? 0 : babs(x).toString(2).length);

// ───────────────────────── integral matrices over O ─────────────────────────

/** Arithmetic on O-coordinate vectors (BigInt[]) of the field's maximal order. */
export function makeRing(F) {
    const n = F.n, O = F.O;
    const C = n === 1 ? O.C[0][0][0] : null;
    const zero = () => new Array(n).fill(0n);
    const add = (u, v) => { const w = new Array(n); for (let i = 0; i < n; i++) w[i] = u[i] + v[i]; return w; };
    const sub = (u, v) => { const w = new Array(n); for (let i = 0; i < n; i++) w[i] = u[i] - v[i]; return w; };
    const neg = (u) => u.map((x) => -x);
    const mul = n === 1 ? (u, v) => [u[0] * v[0] * C] : (u, v) => O.mul(u, v);
    const isZero = (u) => u.every((x) => x === 0n);
    return { n, zero, add, sub, neg, mul, isZero };
}

/** An element {v, den} of F as an integral coordinate vector times 1/den. */
const elemOf = (coords) => ({ v: coords.slice(), den: 1n });

/**
 * The generators as integral primitive matrices: [a, b, c, d] (BigInt[] each),
 * from GlobalField elements.
 */
export function integralMatrix(F, m) {
    const es = [m.a, m.b, m.c, m.d];
    let L = 1n;
    for (const x of es) L = (L / bgcd(L, x.den)) * x.den;
    return normalizeM(es.map((x) => x.v.map((t) => t * (L / x.den))));
}

/** Divide by the content and make the first nonzero coordinate positive. */
export function normalizeM(M) {
    let g = 0n;
    for (const e of M) for (const t of e) { if (t) { g = bgcd(g, t); if (g === 1n) break; } }
    if (g === 0n) throw new Error('zero matrix');
    let sign = 1n;
    outer: for (const e of M) for (const t of e) if (t) { sign = t < 0n ? -1n : 1n; break outer; }
    const s = g * sign;
    return s === 1n ? M : M.map((e) => e.map((t) => t / s));
}

export function mulM(R, A, B) {
    return [
        R.add(R.mul(A[0], B[0]), R.mul(A[1], B[2])), R.add(R.mul(A[0], B[1]), R.mul(A[1], B[3])),
        R.add(R.mul(A[2], B[0]), R.mul(A[3], B[2])), R.add(R.mul(A[2], B[1]), R.mul(A[3], B[3])),
    ];
}
export const adjM = (R, A) => [A[3], R.neg(A[1]), R.neg(A[2]), A[0]];
export const detM = (R, A) => R.sub(R.mul(A[0], A[3]), R.mul(A[1], A[2]));
export const traceM = (R, A) => R.add(A[0], A[3]);
const keyM = (A) => A.map((e) => e.join(',')).join(';');
const isScalarM = (R, A) => R.isZero(A[1]) && R.isZero(A[2]) && A[0].every((t, i) => t === A[3][i]);
const heightM = (A) => { let h = 0; for (const e of A) for (const t of e) { const b = bitlen(t); if (b > h) h = b; } return h; };

/** The word's matrix (signed letters ±(i+1)), from the generator matrices and the identity `one`. */
export function wordMatrix(R, gens, word, one) {
    let M = one;
    for (const l of word) M = normalizeM(mulM(R, M, l > 0 ? gens[l - 1] : adjM(R, gens[-l - 1])));
    return M;
}

// ───────────────────────── valuations at a place ─────────────────────────

/** v_𝔭 of integral coordinates, fast for ℚ. */
export function valuationAt(F, place) {
    if (F.n === 1) {
        const p = place.p;
        return (u) => {
            let x = u[0];
            if (x === 0n) return Infinity;
            let v = 0;
            while (x % p === 0n) { x /= p; v++; }
            return v;
        };
    }
    return (u) => place.val(elemOf(u));
}

// ───────────────────────── a fast local model at primes with e = f = 1 ─────────────────────────

/**
 * At a prime 𝔭 with e = f = 1, F_𝔭 = ℚ_p by w ↦ α, the Hensel lift of the root
 * of w's minimal polynomial that 𝔭 sees. Integral elements map to ℤ/p^N, and
 * valuations and the action on trees' vertices ⌊x⌋_k (digits 0 … p−1, π = p)
 * are computed there, in exactly trees' format. Whenever p^N is not precise
 * enough for an answer, the exact Place is asked instead.
 *
 * Returns null when this model does not apply (e·f > 1, p | f'(α), or a
 * denominator of the maximal order's basis is divisible by p).
 */
export function fastPlace(F, place) {
    if (place.e !== 1 || place.f !== 1) return null;
    const p = place.p, n = F.n;
    const N = Math.max(24, Math.ceil(256 / Math.log2(Number(p))));
    const PN = p ** BigInt(N);
    const mod = (x) => { const r = x % PN; return r < 0n ? r + PN : r; };
    const powP = [1n];
    for (let i = 1; i <= N; i++) powP.push(powP[i - 1] * p);
    const vp = (x) => { if (x === 0n) return Infinity; let v = 0; while (x % p === 0n) { x /= p; v++; } return v; };
    function inv(x, m) { // x⁻¹ mod m, gcd(x, p) = 1
        if (m === p && p < 64n) { const s = ((x % p) + p) % p; for (let y = 1n; y < p; y++) if (s * y % p === 1n) return y; }
        let [a, b, s, t] = [((x % m) + m) % m, m, 1n, 0n];
        while (b) { const q = a / b; [a, b] = [b, a - q * b]; [s, t] = [t, s - q * t]; }
        if (a !== 1n) throw new Error('internal: not a unit');
        return ((s % m) + m) % m;
    }
    // images of the basis of O in ℤ/p^N
    let beta;
    if (n === 1) beta = [mod(F.toK({ v: [1n], den: 1n })[0].n)];
    else {
        const w = F.generator();
        if (!w) return null;
        const f = F.minpolyQ(w);                     // integral, low → high
        if (f[f.length - 1] !== 1n) return null;
        const ev = (x, m) => { let r = 0n; for (let i = f.length - 1; i >= 0; i--) r = (r * x + f[i]) % m; return (r + m) % m; };
        const evd = (x, m) => { let r = 0n; for (let i = f.length - 1; i >= 1; i--) r = (r * x + BigInt(i) * f[i]) % m; return (r + m) % m; };
        let a0 = -1n;
        for (let r = 0n; r < p && r < 200000n; r++) {
            if (place.val(F.sub(w, F.fromInt(r))) > 0) { a0 = r; break; }
        }
        if (a0 < 0n || evd(a0, p) === 0n) return null;
        let a = a0, m = p;
        while (m < PN) {
            m = m * m > PN ? PN : m * m;
            a = ((a - ev(a, m) * inv(evd(a, m), m)) % m + m) % m;
        }
        const pw = [1n];
        for (let i = 1; i < n; i++) pw.push(pw[i - 1] * a % PN);
        const M = F.M_OK;
        beta = [];
        for (let j = 0; j < n; j++) {
            let num = 0n, L = 1n;
            for (let i = 0; i < n; i++) { const d = M[j][i].d; L = (L / bgcd(L, d)) * d; }
            if (L % p === 0n) return null;
            for (let i = 0; i < n; i++) { const r = M[j][i]; num += r.n * (L / r.d) * pw[i]; }
            beta.push(mod(num * inv(L, PN)));
        }
    }
    const image = n === 1 ? (u) => mod(u[0] * beta[0]) : (u) => { let s = 0n; for (let j = 0; j < n; j++) if (u[j]) s += u[j] * beta[j]; return mod(s); };
    const isZero = (u) => u.every((t) => t === 0n);
    const exactVal = (u) => place.val({ v: u.slice(), den: 1n });
    /** v_𝔭 of integral coordinates. */
    const val = (u) => {
        const x = image(u);
        if (x !== 0n) return vp(x);
        return isZero(u) ? Infinity : exactVal(u);
    };
    // sanity: the model must agree with the exact valuation
    const probe = [];
    for (let j = 0; j < n; j++) { const u = new Array(n).fill(0n); u[j] = 1n; probe.push(u); }
    probe.push(new Array(n).fill(0n).map((_, j) => BigInt(j + 1) * p + 1n));
    if (n > 1) probe.push(new Array(n).fill(0n).map((_, j) => (j ? p : 0n)));
    for (const u of probe) if (!isZero(u) && val(u) !== exactVal(u)) return null;

    const unitOf = (x, v) => x / powP[v];
    /**
     * ⌊y⌋_kk for y = (Un/Ud)·p^t, Un and Ud units known modulo p^prec. Only the
     * digits below kk are needed, so the quotient is formed modulo p^(kk−t).
     */
    const canon = (Un, Ud, t, kk, prec) => {
        if (Un === null || t >= kk) return { k: kk, lo: kk, d: [] };
        const need = kk - t;
        if (need > prec) return null;
        const m = powP[need];
        let r = (Un % m) * inv(Ud % m, m) % m;
        const d = new Array(need);
        for (let i = 0; i < need; i++) { d[i] = Number(r % p); r /= p; }
        return { k: kk, lo: t, d };
    };
    /** g·⌊x⌋_k from the images of g's entries (BigInt mod p^N) and exact data. */
    function act(G, vt) {
        const k = vt.k;
        let X = 0n;
        for (let i = vt.d.length - 1; i >= 0; i--) X = X * p + BigInt(vt.d[i]);
        const s = vt.lo < 0 ? -vt.lo : 0;
        if (vt.d.length && vt.lo + s > N) return null;
        const Xs = vt.d.length ? mod(X * powP[vt.lo + s]) : 0n;
        const ps = powP[s];
        const ND = mod(G.c * Xs + G.d * ps), NB = mod(G.a * Xs + G.b * ps);
        if (ND === 0n) return null;
        const vND = vp(ND), vD = vND - s;
        const vC = G.vc + k;
        if (vC < vD) {
            const kk = G.vdet + k - 2 * G.vc - 2 * k;
            // a/c = p^{va − vc}·(ua / uc)
            if (G.aZero) return canon(null, 1n, 0, kk, 0);
            if (G.a === 0n) return null;
            const va = vp(G.a);
            return canon(unitOf(G.a, va), unitOf(G.c, G.vc), va - G.vc, kk, N - Math.max(va, G.vc));
        }
        const kk = G.vdet + k - 2 * vD;
        if (NB === 0n) return N - vND >= kk ? { k: kk, lo: kk, d: [] } : null;
        const vNB = vp(NB);
        return canon(unitOf(NB, vNB), unitOf(ND, vND), vNB - vND, kk, N - Math.max(vNB, vND));
    }
    /** Prepare a matrix (integral coordinates) for act; null when its determinant is too divisible. */
    function prepare(M, R) {
        const [a, b, c, d] = M.map(image);
        const det = mod(a * d - b * c);
        if (det === 0n) return null;
        let vc;
        if (c !== 0n) vc = vp(c);
        else if (isZero(M[2])) vc = Infinity;
        else return null;
        return { a, b, c, d, vdet: vp(det), vc, aZero: isZero(M[0]) };
    }
    return { p, N, val, act, prepare, image };
}

// ───────────────────────── choosing the places ─────────────────────────

/** All words of length ≤ L in the letters (as matrices), for unboundedness tests. */
function shortWords(R, gens, L = 3) {
    const letters = gens.flatMap((g) => [g, adjM(R, g)]);
    const out = [];
    let layer = letters.map((M) => M);
    out.push(...layer);
    for (let len = 2; len <= L; len++) {
        const next = [];
        for (const A of layer) for (const B of letters) { next.push(normalizeM(mulM(R, A, B))); if (next.length > 6000) break; }
        layer = next;
        out.push(...layer);
    }
    return out;
}

/** min over short words of v(tr²/det) at the place: negative iff Γ is unbounded there. */
export function minTau(R, val, words) {
    let m = Infinity;
    for (const W of words) {
        const t = traceM(R, W);
        const vt = R.isZero(t) ? Infinity : val(t);
        const vd = val(detM(R, W));
        const v = 2 * vt - vd;
        if (v < m) m = v;
    }
    return m;
}

/**
 * The places of F to search over: one prime 𝔓 of F above each prime 𝔭 ∈ S of
 * the trace field k, with F_𝔓 = k_𝔭 (local degree 1).
 *
 * mats: the generators over F ({ a, b, c, d }); S: [{ p, e, f }] (the primes
 * of k, from the Zariski engine); sameField: F = k.
 * Returns { places: [Place], notes } or { error }.
 */
export function choosePlaces(deps, F, mats, S, sameField) {
    const { Place } = deps;
    const R = makeRing(F);
    const words = shortWords(R, mats.map((m) => integralMatrix(F, m)));
    const byP = new Map();
    for (const s of S) {
        const key = String(s.p);
        if (!byP.has(key)) byP.set(key, []);
        byP.get(key).push(s);
    }
    const places = [], notes = [];
    for (const [p, ks] of byP) {
        const prs = F.primesAbove(BigInt(p));
        const cands = [];
        prs.forEach((pr, i) => {
            const P = new Place(F, BigInt(p), i);
            const val = valuationAt(F, P);
            const t = minTau(R, val, words);
            if (t < 0) cands.push({ P, pr, ef: pr.e * pr.f });
        });
        if (!cands.length) return { error: `no prime of the field above ${p} sees Γ unbounded` };
        if (sameField) { places.push(...cands.map((c) => c.P)); continue; }
        if (ks.length > 1) return { error: `k has ${ks.length} primes above ${p} where Γ is unbounded, and F ≠ k: matching them with the primes of F is not implemented` };
        const want = ks[0].e * ks[0].f;
        const ok = cands.filter((c) => c.ef === want);
        if (!ok.length) return { error: `at ${p}, the field of definition is larger than the trace field (local degree ${cands[0].ef / want}); Γ preserves a proper subtree there, which this search does not handle` };
        places.push(ok[0].P);
        if (cands.length > 1) notes.push(`${p}: ${cands.length} primes of F lie above the prime of k; one is enough (they give the same tree).`);
    }
    return { places, notes };
}

// ───────────────────────── the search problem ─────────────────────────

const L_WEIGHT = 0.0005;      // per letter, after the adelic height

export class CoveringProblem {
    /**
     * @param F       GlobalField
     * @param places  [Place] (one per 𝔭 ∈ S)
     * @param mats    generators as { a, b, c, d } over F
     * @param opts    { maxReps, stabCap, archiveCap, repRadius, orbitRadius, collisions,
     *                  arch: [{ re, im, kind }] (the places at ∞ where Γ is unbounded),
     *                  metric: 'log' (tree edges of length log q) | 'unit' }
     */
    constructor(F, places, mats, opts = {}) {
        this.F = F;
        this.places = places;
        this.R = makeRing(F);
        const R = this.R;
        this.gens = mats.map((m) => integralMatrix(F, m));
        this.one = integralMatrix(F, { a: F.one(), b: F.zero(), c: F.zero(), d: F.one() });
        this.fast = places.map((P) => { try { return fastPlace(F, P); } catch (e) { return null; } });
        this.vals = places.map((P, j) => (this.fast[j] ? this.fast[j].val : valuationAt(F, P)));
        this.archs = (opts.arch || []).map((e) => makeArch(F, e));
        this.weights = places.map((P) => (opts.metric === 'unit' ? 1 : Math.log(P.q)));
        this.certify = places.length > 0;
        // relations (two words, one element) and the lowest elements, for the Dirichlet generators
        this.registry = new Map();
        this.registryCap = opts.registryCap ?? 300000;
        this.relations = [];
        this.relKeys = new Set();
        this.relationCap = opts.relationCap ?? 64;
        this.lowPool = [];
        this.lowCap = opts.lowCap ?? 1500;
        this.collisionsSeen = 0;
        this.slowActs = 0;
        this.o = places.map((P) => P.canon(F.zero(), 0));
        this.maxReps = opts.maxReps ?? 24;
        this.stabCap = opts.stabCap ?? 300;
        this.archiveCap = opts.archiveCap ?? 20000;
        this.repRadius = opts.repRadius ?? 3;       // representatives stay this close to o
        this.orbitRadius = opts.orbitRadius ?? 5;   // images are remembered this close to o
        this.collisions = opts.collisions ?? 6;     // collisions followed up per image
        this.orbitCap = opts.orbitCap ?? 400000;

        this.reps = [];            // { tuple, id, dist }
        this.repIndex = new Map(); // id → index
        this.orbit = new Map();    // vertex id → { word, rep, state, tuple }: state·reps[rep] = vertex
        this.repLinks = [];        // [i, j, word]: word·r_i = r_j
        this.targets = new Map();  // id → { tuple, from: rep index, place, dist }
        this.stab = [];            // elements fixing o: { word, M, key, h }
        this.stabKeys = new Set();
        this.archive = [];         // nodes with small displacement, for new representatives
        this.newCover = 0;

        this._addRep(this.o);
        for (const t of this.parityReps()) this._addRep(t);
    }

    // ── vertices ──
    tupleId(t) { return t.map((vt, j) => this.places[j].id(vt)).join('|'); }
    distO(t) { return t.reduce((s, vt, j) => s + this.places[j].dist(this.o[j], vt), 0); }
    /**
     * g·t for a matrix g (integral coordinates), one tree at a time: by the fast
     * local model where it applies, else by trees' exact Place. `prep` caches
     * the prepared matrices across calls for one g.
     */
    act(M, t, prep = null) {
        prep = prep || this.prepare(M);
        return t.map((vt, j) => {
            const fp = this.fast[j], g = prep[j];
            if (fp && g && g.fast) { const r = fp.act(g.fast, vt); if (r) return r; }
            this.slowActs++;
            if (!g.exact) g.exact = this.places[j].prepare({ a: elemOf(M[0]), b: elemOf(M[1]), c: elemOf(M[2]), d: elemOf(M[3]) });
            return this.places[j].act(g.exact, vt);
        });
    }
    prepare(M) {
        return this.places.map((P, j) => ({ fast: this.fast[j] ? this.fast[j].prepare(M) : null, exact: null }));
    }
    /** The same action, always through trees' exact Place (for checking certificates). */
    actExact(M, t) {
        const m = { a: elemOf(M[0]), b: elemOf(M[1]), c: elemOf(M[2]), d: elemOf(M[3]) };
        return t.map((vt, j) => this.places[j].act(this.places[j].prepare(m), vt));
    }

    /**
     * Representatives forced by vertex types: g ∈ Γ moves the type at 𝔭 by
     * v_𝔭(det g) mod 2, so Γ meets only the cosets of the image I ⊂ (ℤ/2)^S of
     * these parities. One vertex per coset of I (o moved one step in the trees
     * where the coset's representative is odd).
     */
    parityReps() {
        const s = this.places.length, R = this.R;
        const vecs = this.gens.map((g) => {
            const d = detM(R, g);
            return this.vals.map((v) => v(d) & 1);
        });
        // span of the parity vectors over F₂, as bit masks
        const span = new Set([0]);
        for (const v of vecs) {
            const m = v.reduce((acc, b, j) => acc | (b << j), 0);
            for (const x of [...span]) span.add(x ^ m);
        }
        const out = [], seen = new Set();
        for (let c = 0; c < (1 << s); c++) {
            // the coset c + I, represented by its member of least weight
            let best = null;
            for (const x of span) { const y = c ^ x; if (best === null || popcount(y) < popcount(best) || (popcount(y) === popcount(best) && y < best)) best = y; }
            if (best === 0 || seen.has(best)) continue;
            seen.add(best);
            out.push(this.o.map((vt, j) => ((best >> j) & 1 ? this.places[j].child(vt, 0) : vt)));
        }
        return out;
    }

    _addRep(tuple) {
        const id = this.tupleId(tuple);
        if (this.repIndex.has(id)) return false;
        const i = this.reps.length;
        this.reps.push({ tuple, id, dist: this.distO(tuple) });
        this.maxRepDist = Math.max(this.maxRepDist || 0, this.reps[i].dist);
        this.repIndex.set(id, i);
        if (!this.orbit.has(id)) this.orbit.set(id, { word: [], rep: i, state: this.one, tuple });
        // its neighbours become targets
        tuple.forEach((vt, j) => {
            for (const u of this.places[j].neighbors(vt)) {
                const t = tuple.slice(); t[j] = u;
                const tid = this.tupleId(t);
                if (!this.targets.has(tid)) this.targets.set(tid, { tuple: t, from: i, place: j, dist: this.distO(t) });
            }
        });
        // images of the new representative under the elements kept so far
        for (const node of this.archive) this._recordImages(node, [i]);
        return true;
    }

    get radius() { return Math.max(this.orbitRadius, this.maxRepDist + 2); }

    /**
     * Record g·r for the representatives r, and follow up collisions: if
     * h·r_j is adjacent to g·r_i (h found earlier), then h⁻¹g carries r_i to a
     * neighbour of r_j — a hit made of two words, neither of which hits
     * alone. If h·r_j = g·r_i, then h⁻¹g fixes r_i (i = j), or shows that
     * r_i and r_j lie in one orbit.
     */
    _recordImages(node, repIdx) {
        let prep = null;
        const Rm = this.radius;
        for (const i of repIdx) {
            const r = this.reps[i];
            if (node.stratum > Rm + r.dist) continue;
            prep = prep || this.prepare(node.state);
            const V = this.act(node.state, r.tuple, prep);
            const dV = this.distO(V);
            if (dV > Rm) continue;
            const ids = V.map((vt, j) => this.places[j].id(vt));
            const vid = ids.join('|');
            const same = this.orbit.get(vid);
            if (same) {
                if (same.word.length && same.word !== node.word) this._sameImage(same, node, i);
                if (same.word.length <= node.word.length) continue;
            }
            // neighbours of V already reached: collisions
            let budget = this.collisions;
            if (budget > 0) {
                for (let j = 0; j < V.length && budget > 0; j++) {
                    const nb = this.places[j].neighbors(V[j]);
                    const start = (node.word.length * 7 + i) % nb.length;
                    for (let t = 0; t < nb.length && budget > 0; t++) {
                        const u = nb[(start + t) % nb.length];
                        const saved = ids[j];
                        ids[j] = this.places[j].id(u);
                        const e = this.orbit.get(ids.join('|'));
                        ids[j] = saved;
                        if (!e) continue;
                        budget--;
                        this._collide(e, node, i, V);
                    }
                }
            }
            if (this.orbit.size < this.orbitCap || dV <= this.maxRepDist + 1) {
                if (!same && this.targets.has(vid)) this.newCover++;
                this.orbit.set(vid, { word: node.word, rep: i, state: node.state, tuple: V });
            }
        }
    }

    /** h·r_j adjacent to g·r_i: h⁻¹g·r_i is a neighbour of r_j. */
    _collide(h, g, i, V) {
        const hinv = normalizeM(adjM(this.R, h.state));
        const T = this.act(hinv, V);
        const tid = this.tupleId(T);
        const old = this.orbit.get(tid);
        const word = concatWords(invertWord(h.word), g.word);
        if (old && old.word.length <= word.length) return;
        if (!old && this.targets.has(tid)) this.newCover++;
        this.orbit.set(tid, { word, rep: i, state: normalizeM(mulM(this.R, hinv, g.state)), tuple: T });
    }

    /** h·r_j = g·r_i. */
    _sameImage(h, g, i) {
        const word = concatWords(invertWord(h.word), g.word);
        if (!word.length) return;
        if (h.rep === i) {
            if (i === 0) {
                const M = normalizeM(mulM(this.R, normalizeM(adjM(this.R, h.state)), g.state));
                if (!isScalarM(this.R, M)) this._keepStab({ word, state: M, key: keyM(M), h: displacements(this, M).h, bits: heightM(M) });
            }
        } else if (this.repLinks.length < 64) this.repLinks.push([i, h.rep, word]);
    }

    // ── progress ──
    uncovered() {
        const out = [];
        for (const [id, t] of this.targets) if (!this.orbit.has(id)) out.push({ id, ...t });
        return out;
    }
    coveredCount() { let c = 0; for (const id of this.targets.keys()) if (this.orbit.has(id)) c++; return c; }
    complete() { for (const id of this.targets.keys()) if (!this.orbit.has(id)) return false; return true; }

    /** Make the nearest uncovered neighbour a representative. Returns it, or null at the cap. */
    promote() {
        if (this.reps.length >= this.maxReps) return null;
        const un = this.uncovered().filter((t) => t.dist <= this.repRadius);
        if (!un.length) return null;
        un.sort((a, b) => a.dist - b.dist || a.place - b.place || (a.id < b.id ? -1 : 1));
        this._addRep(un[0].tuple);
        return un[0];
    }

    // ── FlashBeam's interface ──
    /** A node: its displacements in X, the ℓ² height h = d(o, g·o), and FlashBeam's score. */
    _node(M, word) {
        const { tree, arch, h } = displacements(this, M);
        const stratum = tree.reduce((a, b) => a + b, 0);
        const score = (Number.isFinite(h) ? h : 1e9) + L_WEIGHT * word.length;
        return { state: M, word, key: keyM(M), disp: tree, arch, stratum, h, bits: heightM(M), score };
    }
    isIdentityM(M) { return isScalarM(this.R, M); }
    identity() { return this._node(this.one, []); }
    generators() {
        const out = [];
        this.gens.forEach((g, i) => {
            out.push(this._node(g, [i + 1]));
            out.push(this._node(normalizeM(adjM(this.R, g)), [-(i + 1)]));
        });
        return out;
    }
    multiply(a, b) {
        const w = concatWords(a.word, b.word);
        return this._node(normalizeM(mulM(this.R, a.state, b.state)), w);
    }
    isIdentity(n) { return isScalarM(this.R, n.state); }
    visit(node) {
        if (this.registry.size < this.registryCap) this.registry.set(node.key, node.word);
        if (this.isIdentity(node)) { if (node.word.length) this._relation(node.word); return; }
        this.lowPool.push(node);
        if (this.lowPool.length > 2 * this.lowCap) {
            this.lowPool.sort((x, y) => x.h - y.h || x.word.length - y.word.length);
            this.lowPool.length = this.lowCap;
        }
        if (!this.certify) return;            // no tree: nothing to cover
        if (node.stratum === 0) this._keepStab(node);
        if (node.stratum <= this.radius + this.maxRepDist) {
            this._recordImages(node, this.reps.map((_, i) => i));
            this.archive.push(node);
            if (this.archive.length > 2 * this.archiveCap) {
                this.archive.sort((x, y) => x.score - y.score);
                this.archive.length = this.archiveCap;
            }
        }
    }
    done() { return !this.harvesting && !this.exploring && this.certify && this.complete(); }

    /** FlashBeam met an element it has seen: the two words give a relation. */
    collide(node) {
        this.collisionsSeen++;
        const old = this.registry.get(node.key);
        if (!old) return;
        if (node.word.length < old.length) this.registry.set(node.key, node.word);
        this._relation(concatWords(node.word, invertWord(old)));
    }

    /** Record a relator after checking it exactly. */
    _relation(word) {
        const r = canonicalRelator(word);
        if (!r.length) return;
        const k = r.join(',');
        if (this.relKeys.has(k)) return;
        // at the cap, a shorter relator replaces the longest
        let drop = -1;
        if (this.relations.length >= this.relationCap) {
            drop = 0;
            this.relations.forEach((x, i) => { if (x.length > this.relations[drop].length) drop = i; });
            if (this.relations[drop].length <= r.length) return;
        }
        if (!isScalarM(this.R, wordMatrix(this.R, this.gens, r, this.one))) throw new Error('internal: a relation failed its exact check');
        this.relKeys.add(k);
        if (drop >= 0) this.relations[drop] = r; else this.relations.push(r);
    }

    _keepStab(node) {
        if (this.stabKeys.has(node.key)) return;
        this.stabKeys.add(node.key);
        // ranked by entry size: small matrices (translations, S, …) generate arithmetic groups;
        // the elements nearest a generic base point tend to be elliptic
        this.stab.push({ word: node.word, M: node.state, key: node.key, h: node.h, bits: node.bits ?? heightM(node.state) });
        if (this.stab.length > 2 * this.stabCap) {
            this.stab.sort(byBits);
            this.stab.length = this.stabCap;
        }
    }
    /**
     * The k smallest elements fixing o, without inverses of chosen ones and
     * without powers of chosen words (g² adds nothing to a generating set).
     */
    stabilizerElements(k) {
        const s = this.stab.slice().sort(byBits);
        const out = [], seen = new Set();
        const isPowerOf = (w, u) => {
            if (!u.length || w.length % u.length) return false;
            const v = w[0] === u[0] ? u : w[0] === -u[u.length - 1] ? invertWord(u) : null;
            if (!v) return false;
            for (let i = 0; i < w.length; i++) if (w[i] !== v[i % v.length]) return false;
            return true;
        };
        for (const e of s) {
            const inv = keyM(normalizeM(adjM(this.R, e.M)));
            if (seen.has(e.key) || seen.has(inv)) continue;
            if (out.some((f) => isPowerOf(e.word, f.word))) continue;
            seen.add(e.key);
            out.push(e);
            if (out.length >= k) break;
        }
        return out;
    }

    // ── the certificate ──
    certificate() {
        const witnesses = [];
        for (const [id, t] of this.targets) {
            const hit = this.orbit.get(id);
            if (!hit) continue;
            witnesses.push({ target: id, from: t.from, place: t.place, word: hit.word, rep: hit.rep });
        }
        return {
            reps: this.reps.map((r) => r.tuple.map((vt, j) => ({ vt, id: this.places[j].id(vt) }))),
            witnesses,
        };
    }

    /**
     * Check a certificate from scratch: every target is a neighbour of a
     * representative, and every word, multiplied out again, carries its
     * representative onto its target.
     */
    verify(cert) {
        const R = this.R;
        const reps = cert.reps.map((r) => r.map((x) => x.vt));
        const repIds = new Set(reps.map((t) => this.tupleId(t)));
        const need = new Map();
        reps.forEach((t, i) => t.forEach((vt, j) => {
            for (const u of this.places[j].neighbors(vt)) { const s = t.slice(); s[j] = u; need.set(this.tupleId(s), s); }
        }));
        const byTarget = new Map(cert.witnesses.map((w) => [w.target, w]));
        const failures = [];
        let checked = 0;
        for (const [id] of need) {
            if (repIds.has(id) && !byTarget.has(id)) { checked++; continue; }
            const w = byTarget.get(id);
            if (!w) { failures.push(`${id}: no witness`); continue; }
            const M = wordMatrix(R, this.gens, w.word, this.one);
            const img = this.tupleId(this.actExact(M, reps[w.rep]));
            if (img !== id) failures.push(`${id}: the word gives ${img}`);
            else checked++;
        }
        return { ok: failures.length === 0, checked, failures };
    }
}

const byBits = (x, y) => x.bits - y.bits || x.word.length - y.word.length || x.h - y.h;

function popcount(x) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

// ───────────────────────── running it ─────────────────────────

/**
 * Run the search to completion or exhaustion of the budget.
 *   onProgress({ stats, reps, targets, covered, promoted }) after every iteration.
 * Returns { status: 'covered' | 'budget' | 'exhausted', problem, beam, verify? }.
 */
export function runCovering(problem, opts = {}, onProgress = () => { }) {
    const beam = new FlashBeam(problem, {
        beamWidth: opts.beamWidth ?? 1500,
        flashSize: opts.flashSize ?? 40,
        strata: opts.strata ?? [0.3, 0.3, 0.2, 0.2],
        twoSided: true,
        flashSplit: (n) => (n.stratum === 0 ? 'stab' : 'move'),
    });
    const deadline = Date.now() + 1000 * (opts.seconds ?? 30);
    const maxIter = opts.maxIterations ?? 200;
    const patience = opts.patience ?? 3;
    // after the covering is complete (or with no tree to cover), keep going a
    // little, for the Dirichlet generators and relations
    const extra = opts.extraIterations ?? 4;
    const noTrees = !problem.certify;
    let stall = 0, status = noTrees ? 'none' : 'budget', after = 0;
    beam.start();
    problem.exploring = true;
    if (!noTrees && problem.complete()) status = 'covered';
    for (;;) {
        if (status === 'covered' || noTrees) {
            if (after >= extra) break;
            after++;
            // exploring for Dirichlet generators: a narrow beam, as in the SO₃ project
            beam.beamWidth = Math.min(beam.beamWidth, opts.exploreWidth ?? 400);
        }
        if (Date.now() > deadline || beam.iteration >= maxIter) { if (status !== 'covered' && !noTrees) status = 'budget'; break; }
        problem.newCover = 0;
        const stats = beam.step();
        let promoted = null;
        if (!noTrees && status !== 'covered') {
            if (problem.complete()) status = 'covered';
            else {
                stall = problem.newCover ? 0 : stall + 1;
                if (stall >= patience) { promoted = problem.promote(); stall = 0; }
            }
        }
        onProgress({ stats, reps: problem.reps.length, targets: problem.targets.size, covered: problem.coveredCount(), promoted, relations: problem.relations.length });
        if (stats.exhausted) { if (status !== 'covered' && !noTrees) status = 'exhausted'; break; }
    }
    problem.exploring = false;
    const out = { status, problem, beam };
    if (status === 'covered') out.verify = problem.verify(problem.certificate());
    return out;
}

/**
 * After a covering: keep the beam running, weighted towards elements fixing
 * o, to collect more of the stabilizer Γ_o (for the check at ∞).
 */
export function harvest(problem, beam, { seconds = 10, maxIterations = 40 } = {}) {
    problem.harvesting = true;
    beam.strata = [0.6, 0.2, 0.1, 0.1];
    const before = problem.stab.length;
    const deadline = Date.now() + 1000 * seconds;
    let it = 0;
    while (Date.now() < deadline && it < maxIterations) {
        const st = beam.step();
        it++;
        if (st.exhausted) break;
    }
    problem.harvesting = false;
    return { iterations: it, found: problem.stab.length - before };
}

export { concatWords, invertWord };
