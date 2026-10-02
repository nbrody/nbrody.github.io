/**
 * quatEngine.js — a quaternion algebra B = (a, b)_K over a number field and the unit group O¹ of a maximal order.
 *
 *  1. Ramification of B at every place (tame symbols, a dyadic search, signs at real places), its discriminant
 *     and its type: the factors ℍ², ℍ³ of the symmetric space on which O¹ acts.
 *  2. A maximal order O, as a ℤ-basis: the standard order O_K⟨i, j⟩ is enlarged locally at each prime above
 *     2ab — explicitly at odd primes (a square root of a unit gives a missing idempotent), by search at dyadic
 *     ones — and the local orders are glued. Maximality is certified by disc_ℤ(O) = d_K⁴ N(𝔇)².
 *  3. O¹: if B is totally definite it is finite and is enumerated as the vectors with Tr_{K/ℚ} nrd(x) = [K:ℚ];
 *     otherwise O¹ is an irreducible lattice, with Borel's covolume, the signature of the Shimura curve when
 *     K = ℚ, and a few short units found under a positive definite majorant.
 *
 * Depends on ../numberRings/ringEngine.js and ../zariskiClosure/pgl2Engine.js.
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const NR = isNode ? require('../numberRings/ringEngine.js') : root.NumberRingEngine;
const PG = isNode ? require('../zariskiClosure/pgl2Engine.js') : root.PGL2Engine;
const X = NR._internal, PX = PG._internal;
const { Rat, R0, R1 } = X;
const Rint = (n) => new Rat(BigInt(n));
const babs = (x) => (x < 0n ? -x : x);

// ─────────────────────── input ───────────────────────

function astLetters(a, out = new Set()) {
    if (a.t === 'var') out.add(a.name);
    for (const k of ['a', 'b', 'e']) if (a[k]) astLetters(a[k], out);
    return out;
}
function parseElement(field, src, what) {
    if (!String(src || '').trim()) throw new Error(`enter ${what}`);
    const ast = NR.parseExpr(src);
    const letters = astLetters(ast);
    if (letters.size > 1) throw new Error(`use a single letter for the root of f (found ${[...letters].join(', ')})`);
    if (letters.size && field.n === 1) throw new Error('K = ℚ has no generator; enter a rational number');
    const v = X.evalAst(ast, X.fieldDomain(field.K));
    if (v.every((x) => x.isZero())) throw new Error(`${what} must be nonzero`);
    return { v, letter: [...letters][0] || null };
}

// ─────────────────────── the algebra (a, b) over K, basis 1, i, j, k ───────────────────────

function structure(kAlg, a, b) {
    const z = kAlg.fromRat(R0), o = kAlg.fromRat(R1), neg = (x) => kAlg.neg(x), ab = kAlg.mul(a, b);
    const e = (t, c = o) => { const v = [z, z, z, z]; v[t] = c; return v; };
    return [
        [e(0), e(1), e(2), e(3)],
        [e(1), e(0, a), e(3), e(2, a)],
        [e(2), e(3, neg(o)), e(0, b), e(1, neg(b))],
        [e(3), e(2, neg(a)), e(1, b), e(0, neg(ab))],
    ];
}

// ─────────────────────── square roots in O/𝔭 ───────────────────────

function sqrtMod(O, pr, u) {
    const L = PX.localRing(O, pr, 1);
    const r = L.residue(X.toSV(O.toCoords(u)));
    const eq = (x, y) => x.every((v, i) => v === y[i]);
    const one = L.reduce(O.one), q = L.Np;
    if (r.every((v) => v === 0n)) return null;
    if (!eq(L.pow(r, (q - 1n) / 2n), one)) return null; // not a square
    // Tonelli–Shanks in the residue field
    let s = 0n, t = q - 1n; while (t % 2n === 0n) { t /= 2n; s++; }
    const rng = X.makeRng(97);
    let z = null;
    for (let tries = 0; tries < 200 && !z; tries++) {
        const c = L.reduce(O.one.map(() => BigInt(rng.int(1 << 30))));
        if (!c.every((v) => v === 0n) && !eq(L.pow(c, (q - 1n) / 2n), one)) z = c;
    }
    if (!z) return null;
    let m = s, c = L.pow(z, t), tt = L.pow(r, t), R = L.pow(r, (t + 1n) / 2n);
    while (!eq(tt, one)) {
        let i = 0n, x = tt;
        while (!eq(x, one)) { x = L.mul(x, x); i++; if (i === m) return null; }
        let bb = c; for (let k = 0n; k < m - i - 1n; k++) bb = L.mul(bb, bb);
        m = i; c = L.mul(bb, bb); tt = L.mul(tt, c); R = L.mul(R, bb);
    }
    return O.fromCoords(R.map((v) => new Rat(v)));
}

// ─────────────────────── a maximal order ───────────────────────

/** O_𝔭-basis (4 vectors over K) of a maximal order containing the standard order, at the prime pr. */
function localMaximal(ctx, pr, ramified) {
    const { O, kAlg, A, a, b } = ctx;
    const isZ = (x) => x.every((c) => c.isZero());
    const val = (x) => (isZ(x) ? Infinity : X.valuationSV(O, pr, X.toSV(O.toCoords(x))));
    const pi = PX.uniformizer(O, pr);
    const ord = PX.orderTools(A, kAlg, val, pi);
    const z = kAlg.fromRat(R0), o = kAlg.fromRat(R1);
    const sc = (x, c) => x.map((v) => kAlg.mul(v, c));
    const ppow = (k) => kAlg.pow(pi, k);
    const ONE = [o, z, z, z];
    const ha = Math.floor(val(a) / 2), hb = Math.floor(val(b) / 2);
    const I1 = sc([z, o, z, z], ppow(-ha)), J1 = sc([z, z, o, z], ppow(-hb));
    const aI = kAlg.mul(a, ppow(-2 * ha)), bJ = kAlg.mul(b, ppow(-2 * hb));
    const start = [ONE, I1, J1, A.mul(I1, J1)];
    if (pr.p !== 2n) {
        // x = (c + U)·W/π with U² = u a unit square mod 𝔭 and W² of valuation 1 adds the idempotent (1 + U/c)/2
        let U = null, u2 = null, W = null;
        const va = val(aI), vb = val(bJ);
        if (va === 1 && vb === 1) { const Kp = sc(A.mul(I1, J1), ppow(-1)); start.push(Kp); U = Kp; u2 = A.mul(Kp, Kp)[0]; W = I1; }
        else if (va === 0 && vb === 1) { U = I1; u2 = aI; W = J1; }
        else if (va === 1 && vb === 0) { U = J1; u2 = bJ; W = I1; }
        if (U && !ramified) {
            const c = sqrtMod(O, pr, u2);
            if (c) start.push(sc(A.mul(U.map((v, t) => (t === 0 ? kAlg.add(v, c) : v)), W), ppow(-1)));
        }
    }
    let L = ord.closure(start, start);
    if (!L || L.rank !== 4) throw new Error('internal: the local order is not a lattice');
    const target = ramified ? 2 : 0;
    let v = ord.discVal(L), reps = null;
    for (let guard = 0; v > target && guard < 40; guard++) {
        const q = pr.p ** BigInt(pr.f);
        if (q ** 4n > 70000n) throw new Error(`the search for a maximal order at a prime of norm ${q} is too large`);
        reps = reps || PX.residueReps(O, pr);
        const bigger = ord.enlarge(L, reps, v);
        if (!bigger) throw new Error('internal: no enlargement found');
        L = bigger; v = ord.discVal(L);
    }
    if (v !== target) throw new Error('internal: the local order has the wrong discriminant');
    return L.basis;
}

/** A ℤ-basis of a maximal order: the standard order plus the local maximal orders, glued. */
function maximalOrder(ctx, finitePlaces) {
    const { O, kAlg, n } = ctx;
    const z = kAlg.fromRat(R0);
    const omegas = Array.from({ length: n }, (_, m) => O.fromCoords(X.unitVec(n, m).map((x) => new Rat(x))));
    const rows = [];
    for (let s = 0; s < 4; s++) for (const w of omegas) { const x = [z, z, z, z]; x[s] = w; rows.push(x); }
    const primeCache = new Map();
    const primesOver = (l) => { const k = `${l}`; if (!primeCache.has(k)) primeCache.set(k, X.primesAbove(O, l)); return primeCache.get(k); };
    const samePrime = (P, Q) => P.p === Q.p && X.hnfEq(P.H, Q.H);
    for (const pl of finitePlaces) {
        const basis = localMaximal(ctx, pl.pr, pl.ramified === true);
        for (const bvec of basis) {
            // clear the poles of bvec away from 𝔭 with an element s ∈ O that is a unit at 𝔭
            const need = [];
            for (const c of bvec) {
                if (c.every((x) => x.isZero())) continue;
                const sv = X.toSV(O.toCoords(c));
                if (sv.den === 1n) continue;
                for (const [l] of X.factorInt(sv.den).factors) for (const Q of primesOver(l)) {
                    if (samePrime(Q, pl.pr)) continue;
                    const v = X.valuationSV(O, Q, sv);
                    if (v < 0) { const old = need.find((x) => samePrime(x.Q, Q)); if (old) old.k = Math.max(old.k, -v); else need.push({ Q, k: -v }); }
                }
            }
            let s = kAlg.fromRat(R1);
            for (const { Q, k } of need) {
                let t = null;
                for (const h of Q.H) if (X.valuationInt(O, pl.pr, h) === 0) { t = h; break; }
                if (!t) for (const h of Q.H) for (const h2 of Q.H) { const w = h.map((x, i) => x + h2[i]); if (!t && X.valuationInt(O, pl.pr, w) === 0) t = w; }
                if (!t) throw new Error('internal: no element coprime to 𝔭');
                s = kAlg.mul(s, kAlg.pow(O.fromCoords(t.map((x) => new Rat(x))), k));
            }
            for (const w of omegas) rows.push(bvec.map((c) => kAlg.mul(kAlg.mul(c, s), w)));
        }
    }
    // HNF of the ℤ-span
    const flat = rows.map((x) => x.flat());
    let D = 1n; for (const r of flat) for (const c of r) D = X.blcm(D, c.d);
    const H = X.hnf(flat.map((r) => r.map((c) => c.n * (D / c.d))), 4 * n);
    if (H.length !== 4 * n) throw new Error('internal: the order has the wrong rank');
    return H.map((r) => { const v = r.map((c) => new Rat(c, D)); return [0, 1, 2, 3].map((s) => v.slice(s * n, (s + 1) * n)); });
}

// ─────────────────────── linear algebra and traces ───────────────────────

function ratDet(M) {
    const m = M.map((r) => r.slice()), N = m.length;
    let det = R1;
    for (let c = 0; c < N; c++) {
        let r = c; while (r < N && m[r][c].isZero()) r++;
        if (r === N) return R0;
        if (r !== c) { [m[r], m[c]] = [m[c], m[r]]; det = det.neg(); }
        det = det.mul(m[c][c]);
        const inv = R1.div(m[c][c]);
        for (let i = c + 1; i < N; i++) {
            if (m[i][c].isZero()) continue;
            const f = m[i][c].mul(inv);
            for (let j = c; j < N; j++) m[i][j] = m[i][j].sub(f.mul(m[c][j]));
        }
    }
    return det;
}
function traceTable(kAlg, n) { // Tr_{K/ℚ}(θ^j), j < n
    const out = [];
    let p = kAlg.one();
    for (let j = 0; j < n; j++) {
        let t = R0;
        for (let i = 0; i < n; i++) { const e = kAlg.fromRat(R0); e[i] = R1; t = t.add(kAlg.mul(p, e)[i]); }
        out.push(t);
        p = kAlg.mul(p, kAlg.gen());
    }
    return out;
}
const kTrace = (tr, v) => v.reduce((s, c, j) => s.add(c.mul(tr[j])), R0);

// ─────────────────────── numerics: embeddings, ζ_K(2), lattice enumeration ───────────────────────

function polyRoots(g) { // Durand–Kerner on a monic integer polynomial (BigInt, low → high)
    const n = g.length - 1, c = g.map(Number);
    const C = (re, im = 0) => ({ re, im });
    const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    const sub = (a, b) => C(a.re - b.re, a.im - b.im);
    const div = (a, b) => { const q = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
    const ev = (z) => { let acc = C(1); for (let k = n - 1; k >= 0; k--) acc = C(acc.re * z.re - acc.im * z.im + c[k], acc.re * z.im + acc.im * z.re); return acc; };
    const R = 1 + Math.max(...c.slice(0, n).map(Math.abs));
    let z = Array.from({ length: n }, (_, k) => C(R * 0.9 * Math.cos(2 * Math.PI * k / n + 0.4), R * 0.9 * Math.sin(2 * Math.PI * k / n + 0.4)));
    for (let it = 0; it < 2000; it++) {
        let moved = 0;
        z = z.map((zk, k) => {
            let den = C(1);
            z.forEach((zj, j) => { if (j !== k) den = mul(den, sub(zk, zj)); });
            const step = div(ev(zk), den);
            moved = Math.max(moved, Math.hypot(step.re, step.im));
            return sub(zk, step);
        });
        if (moved < 1e-15 * R) break;
    }
    return z;
}
function places(g) {
    if (g.length === 2) return [{ real: true, z: { re: Number(-g[0]), im: 0 } }];
    const roots = polyRoots(g);
    const real = roots.filter((r) => Math.abs(r.im) < 1e-9).map((r) => ({ real: true, z: { re: r.re, im: 0 } })).sort((u, v) => u.z.re - v.z.re);
    const cpx = roots.filter((r) => r.im >= 1e-9).map((r) => ({ real: false, z: r })).sort((u, v) => u.z.re - v.z.re);
    return real.concat(cpx);
}
function embed(v, z) { // θ-coordinates at θ = z
    let re = 0, im = 0;
    for (let j = v.length - 1; j >= 0; j--) { const x = ratNum(v[j]); [re, im] = [re * z.re - im * z.im + x, re * z.im + im * z.re]; }
    return { re, im };
}
function ratNum(r) {
    let n = r.n, d = r.d;
    const shift = Math.max(0, Math.max(n.toString().length, d.toString().length) - 300);
    if (shift) { const s = 10n ** BigInt(shift); n /= s; d /= s; if (d === 0n) d = 1n; }
    return Number(n) / Number(d);
}

/** ζ_K(2) by its Euler product over p < P (exact splitting via factorization mod p), with a tail estimate. */
function zeta2(sub, P = 30000) {
    const g = sub.g.map(Number), n = g.length - 1;
    if (n === 1) return { value: Math.PI * Math.PI / 6, exact: true };
    const bad = new Set();
    for (const [p] of X.factorInt(babs(sub.disc)).factors) bad.add(Number(p));
    for (const [p] of X.factorInt(sub.index || 1n).factors) bad.add(Number(p));
    let logz = 0;
    const sieve = new Uint8Array(P + 1);
    for (let p = 2; p <= P; p++) {
        if (sieve[p]) continue;
        for (let m = p * p; m <= P; m += p) sieve[m] = 1;
        let degs;
        if (bad.has(p) || g.some((c) => !Number.isSafeInteger(c))) degs = X.primesAbove(sub.O, BigInt(p)).map((pr) => pr.f);
        else degs = splittingDegrees(g, p);
        for (const f of degs) logz -= Math.log1p(-Math.pow(p, -2 * f));
    }
    logz += 1 / (P * Math.log(P)); // Σ_{p > P} 1/p² for the (on average one) degree-1 prime above p
    return { value: Math.exp(logz), exact: false, P };
}
/** Degrees of the irreducible factors of g mod p (g squarefree mod p): distinct-degree factorization. */
function splittingDegrees(g, p) {
    const mod = (x) => ((x % p) + p) % p;
    const trim = (a) => { let k = a.length; while (k > 0 && a[k - 1] === 0) k--; return a.slice(0, k); };
    const mulm = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); for (let i = 0; i < a.length; i++) if (a[i]) for (let j = 0; j < b.length; j++) r[i + j] = (r[i + j] + a[i] * b[j]) % p; return trim(r); };
    const inv = (x) => { let [a, b, u, v] = [mod(x), p, 1, 0]; while (b) { const q = Math.floor(a / b); [a, b] = [b, a - q * b]; [u, v] = [v, u - q * v]; } return mod(u); };
    const rem = (a, b) => { a = a.slice(); const db = b.length - 1, il = inv(b[db]); for (let d = a.length - 1; d >= db; d--) { const c = a[d] * il % p; if (!c) continue; for (let t = 0; t <= db; t++) a[d - db + t] = mod(a[d - db + t] - c * b[t]); } return trim(a.slice(0, db)); };
    const quo = (a, b) => { a = a.slice(); const db = b.length - 1, il = inv(b[db]), q = new Array(Math.max(0, a.length - db)).fill(0); for (let d = a.length - 1; d >= db; d--) { const c = a[d] * il % p; q[d - db] = c; if (!c) continue; for (let t = 0; t <= db; t++) a[d - db + t] = mod(a[d - db + t] - c * b[t]); } return trim(q); };
    const gcd = (a, b) => { a = trim(a); b = trim(b); while (b.length) [a, b] = [b, rem(a, b)]; return a; };
    const powmod = (base, e, f) => { let r = [1], b = rem(base, f); while (e > 0) { if (e & 1) r = rem(mulm(r, b), f); b = rem(mulm(b, b), f); e = Math.floor(e / 2); } return r; };
    let f = trim(g.map(mod));
    const degs = [];
    let h = [0, 1];
    for (let d = 1; f.length - 1 >= 2 * d; d++) {
        h = powmod(h, p, f);
        const hx = h.slice(); while (hx.length < 2) hx.push(0); hx[1] = mod(hx[1] - 1);
        const G = gcd(f, trim(hx));
        const k = G.length - 1;
        for (let t = 0; t < k / d; t++) degs.push(d);
        if (k > 0) { f = quo(f, G); h = rem(h, f); }
    }
    if (f.length - 1 > 0) degs.push(f.length - 1);
    return degs;
}

/** Integer vectors c with cᵀGc ≤ C (Fincke–Pohst); G symmetric positive definite (numbers). */
function shortVectors(G, C, limit = 300000) {
    const N = G.length;
    // Cholesky-type decomposition q_ii, q_ij (Fincke–Pohst form)
    const q = G.map((r) => r.slice());
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) { q[j][i] = q[i][j]; q[i][j] = q[i][j] / q[i][i]; }
        for (let k = i + 1; k < N; k++) for (let l = k; l < N; l++) q[k][l] -= q[k][i] * q[i][l];
        if (!(q[i][i] > 0)) throw new Error('internal: the form is not positive definite');
    }
    const out = [];
    const x = new Array(N).fill(0), T = new Array(N).fill(0), U = new Array(N).fill(0), UB = new Array(N).fill(0);
    let visited = 0, i = N - 1;
    T[i] = C; U[i] = 0;
    const bounds = (k) => { const zz = Math.sqrt(Math.max(0, T[k] / q[k][k])); UB[k] = Math.floor(zz - U[k] + 1e-9); x[k] = Math.ceil(-zz - U[k] - 1e-9) - 1; };
    bounds(i);
    for (;;) {
        x[i]++;
        if (x[i] > UB[i]) { i++; if (i >= N) break; continue; }
        if (++visited > limit) return { vectors: out, complete: false };
        if (i > 0) {
            const k = i - 1;
            T[k] = T[i] - q[i][i] * (x[i] + U[i]) ** 2;
            let s = 0; for (let j = k + 1; j < N; j++) s += q[k][j] * x[j];
            U[k] = s; i = k; bounds(i);
        } else if (x.some((v) => v !== 0)) out.push(x.slice());
    }
    return { vectors: out, complete: true };
}

// ─────────────────────── formatting ───────────────────────

function kTex(ctx, v) { return X.elemTex(X.ratVecMat(v, ctx.sub.P), ctx.letter); }
function quatTex(ctx, x) {
    const names = ['', 'i', 'j', 'k'];
    const parts = [];
    x.forEach((c, s) => {
        if (c.every((r) => r.isZero())) return;
        let t = kTex(ctx, c), neg = false;
        if (t.startsWith('-') && !/\s[+-]\s/.test(t.slice(1)) && !t.startsWith('-\\frac{') ) { neg = true; t = t.slice(1); }
        else if (/^-\\frac\{[^{}]*\}\{\d+\}$/.test(t)) { neg = true; t = t.slice(1); }
        const multi = /\s[+-]\s/.test(t);
        let s1;
        if (!s) s1 = t;
        else if (t === '1') s1 = names[s];
        else if (/^\\frac\{1\}\{(\d+)\}$/.test(t)) s1 = `\\frac{${names[s]}}{${t.match(/^\\frac\{1\}\{(\d+)\}$/)[1]}}`;
        else s1 = multi ? `\\left(${t}\\right)${names[s]}` : `${t}${names[s]}`;
        parts.push({ neg, s: s1 });
    });
    if (!parts.length) return '0';
    return parts.map((p, k) => (k === 0 ? (p.neg ? '-' : '') + p.s : (p.neg ? ' - ' : ' + ') + p.s)).join('');
}
/** A ℤ-basis element over a common denominator: (x0 + x1 i + …)/d when all coordinates are rational. */
function basisTex(ctx, x) {
    if (ctx.n !== 1) return quatTex(ctx, x);
    let d = 1n; for (const c of x) d = X.blcm(d, c[0].d);
    if (d === 1n) return quatTex(ctx, x);
    const num = quatTex(ctx, x.map((c) => [c[0].mul(new Rat(d))]));
    return `\\frac{${num}}{${d}}`;
}

// ─────────────────────── the analysis ───────────────────────

function analyze(fSrc, aSrc, bSrc) {
    let field;
    try { field = NR.defineField(String(fSrc || '').trim() || 'x'); } catch (e) { return { ok: false, where: 'f', error: e.message }; }
    const sub = field.sub, n = field.n, O = sub.O, kAlg = sub.nf.alg;
    let pa, pb;
    try { pa = parseElement(field, aSrc, 'a'); } catch (e) { return { ok: false, where: 'a', error: e.message }; }
    try { pb = parseElement(field, bSrc, 'b'); } catch (e) { return { ok: false, where: 'b', error: e.message }; }
    const letter = pa.letter || pb.letter || 't';
    const toTheta = (v) => X.ratSolveRows(sub.P, v);
    const ctx = { field, sub, n, O, kAlg, letter };

    // (a, b) ≅ (a', b') with a', b' ∈ ℤ[θ] and rational content reduced modulo squares
    const normalize = (v) => {
        const t = toTheta(v);
        let num = 0n, den = 1n;
        for (const x of t) { num = X.bgcd(num, babs(x.n)); den = X.blcm(den, x.d); }
        const c = new Rat(num, den), qf = PX.squarefreePart(c.n * c.d);
        return t.map((x) => x.div(c).mul(new Rat(qf)));
    };
    const a = normalize(pa.v), b = normalize(pb.v);
    ctx.a = a; ctx.b = b;
    const out = { ok: true };
    out.field = {
        n, r1: field.r1, r2: field.r2, discTex: X.numTex(sub.disc),
        polyTex: X.polyTex(field.F), letter, certified: sub.certified,
        tex: n === 1 ? '\\mathbb{Q}' : `\\mathbb{Q}(${letter})`,
    };
    out.algebra = {
        aTex: kTex(ctx, toTheta(pa.v)), bTex: kTex(ctx, toTheta(pb.v)),
        a0Tex: kTex(ctx, a), b0Tex: kTex(ctx, b),
    };
    out.algebra.changed = out.algebra.aTex !== out.algebra.a0Tex || out.algebra.bTex !== out.algebra.b0Tex;
    out.algebra.normFormTex = [kAlg.one(), kAlg.neg(a), kAlg.neg(b), kAlg.mul(a, b)].map((c, t) => {
        let ct = kTex(ctx, c), neg = false;
        if (!/\s[+-]\s/.test(ct) && ct.startsWith('-')) { neg = true; ct = ct.slice(1); }
        const body = (ct === '1' ? '' : /\s[+-]\s/.test(ct) ? `\\left(${ct}\\right)` : ct) + `x_${t}^2`;
        return { neg, body };
    }).map((p, t) => (t === 0 ? (p.neg ? '-' : '') + p.body : (p.neg ? ' - ' : ' + ') + p.body)).join('');

    // ── ramification ──
    const ram = PX.ramification(sub, a, b);
    const embeds = places(sub.g);
    const realEmb = embeds.filter((e) => e.real), cpxEmb = embeds.filter((e) => !e.real);
    const pls = [];
    ram.places.forEach((pl) => {
        if (pl.kind === 'real') {
            let idx = 0;
            if (n > 1) { let best = Infinity; realEmb.forEach((e, j) => { const d = Math.abs(e.z.re - pl.approx); if (d < best) { best = d; idx = j; } }); }
            pls.push({ kind: 'real', tex: n === 1 ? '\\infty' : `\\infty_{${idx + 1}}`, ramified: pl.ramified, emb: realEmb[idx], idx, approx: n === 1 ? null : realEmb[idx].z.re / Number(sub.thetaScale || 1n) });
        } else {
            const tex = X.twoElement(sub, pl.pr, (c) => X.elemTex(X.toA(sub, c), letter));
            pls.push({ kind: 'finite', tex, p: pl.p, e: pl.e, f: pl.f, Np: `${BigInt(pl.p) ** BigInt(pl.f)}`, ramified: pl.ramified, byParity: !!pl.byParity, pr: pl.pr });
        }
    });
    cpxEmb.forEach((e, j) => pls.push({ kind: 'complex', tex: cpxEmb.length > 1 ? `\\mathbb{C}_{${j + 1}}` : '\\mathbb{C}', ramified: false, emb: e }));
    if (!ram.determined) return Object.assign(out, { ok: false, where: 'b', error: 'could not decide the ramification at a dyadic prime of large norm' });
    const finRam = pls.filter((p) => p.kind === 'finite' && p.ramified);
    const realRam = pls.filter((p) => p.kind === 'real' && p.ramified);
    const r = field.r1 - realRam.length, s = field.r2;
    out.places = pls.map(({ kind, tex, ramified, byParity, p, e, f, Np, approx }) => ({ kind, tex, ramified, byParity, p, e, f, Np, approx }));
    out.ramified = { finite: finRam.map((p) => p.tex), real: realRam.map((p) => p.tex), count: finRam.length + realRam.length };
    const DN = finRam.reduce((acc, p) => acc * BigInt(p.Np), 1n);
    out.disc = { tex: finRam.length ? finRam.map((p) => p.tex).join(n === 1 ? ' \\cdot ' : '\\,') : '1', norm: `${DN}`, isQ: n === 1 };
    out.split = out.ramified.count === 0;
    out.kind = r === 0 && s === 0 ? 'definite' : r === 1 && s === 0 ? 'fuchsian' : r === 0 && s === 1 ? 'kleinian' : 'product';
    out.r = r; out.s = s;
    const factors = [];
    if (r) factors.push(r === 1 ? '\\mathbb{H}^2' : `(\\mathbb{H}^2)^{${r}}`);
    if (s) factors.push(s === 1 ? '\\mathbb{H}^3' : `(\\mathbb{H}^3)^{${s}}`);
    out.spaceTex = factors.join(' \\times ') || null;

    // ── a maximal order ──
    ctx.A = PX.algebraOps(PX.kRing(kAlg), structure(kAlg, a, b), [kAlg.fromRat(Rint(2)), kAlg.fromRat(R0), kAlg.fromRat(R0), kAlg.fromRat(R0)]);
    const A = ctx.A;
    let basis;
    try {
        basis = maximalOrder(ctx, pls.filter((p) => p.kind === 'finite'));
    } catch (e) {
        out.orderError = e.message;
        return out;
    }
    const tr = traceTable(kAlg, n);
    const G = basis.map((x) => basis.map((y) => kTrace(tr, A.tr(A.mul(x, y)))));
    const det = ratDet(G).abs();
    const expect = new Rat((babs(sub.disc) ** 4n) * DN * DN);
    out.order = {
        basisTex: basis.map((x) => basisTex(ctx, x)),
        verified: det.eq(expect), discZ: `${det.n}`, expected: `${expect.n}`,
        standard: false,
    };

    // ── units ──
    const isOne = (x) => A.isScalar(x) && kAlg.isZero(kAlg.sub(x[0], kAlg.one()));
    const combo = (c) => {
        const x = [0, 1, 2, 3].map(() => kAlg.fromRat(R0));
        c.forEach((k, idx) => { if (!k) return; const kk = Rint(k); for (let t = 0; t < 4; t++) x[t] = kAlg.add(x[t], kAlg.scale(basis[idx][t], kk)); });
        return x;
    };
    const nrdIsOne = (x) => { const v = A.nrd(x); return kAlg.isZero(kAlg.sub(v, kAlg.one())); };
    if (out.kind === 'definite') {
        // Tr_{K/ℚ} nrd is positive definite; by AM–GM its value n is attained exactly on O¹
        const Gq = basis.map((x) => basis.map((y) => kTrace(tr, A.tr(A.mul(x, A.conj(y)))).div(Rint(2))));
        const res = shortVectors(Gq.map((row) => row.map(ratNum)), n + 1e-6);
        const units = [];
        for (const c of res.vectors) { const x = combo(c); if (nrdIsOne(x)) units.push(x); }
        const ord = (x) => { let y = x; for (let k = 1; k <= 240; k++) { if (isOne(y)) return k; y = A.mul(y, x); } return Infinity; };
        const orders = units.map(ord);
        const N = units.length, maxO = Math.max(...orders);
        let group;
        if (N === maxO) group = { tex: `C_{${N}}`, name: `cyclic of order ${N}`, image: N > 2 ? `C_{${N / 2}}` : '1' };
        else if (N === 24 && maxO === 6) group = { tex: '2T \\cong \\mathrm{SL}_2(\\mathbb{F}_3)', name: 'the binary tetrahedral group', image: 'A_4' };
        else if (N === 48 && maxO === 8) group = { tex: '2O', name: 'the binary octahedral group', image: 'S_4' };
        else if (N === 120 && maxO === 10) group = { tex: '2I \\cong \\mathrm{SL}_2(\\mathbb{F}_5)', name: 'the binary icosahedral group', image: 'A_5' };
        else if (maxO === N / 2) group = { tex: N === 8 ? 'Q_8' : `\\mathrm{Dic}_{${N / 4}}`, name: N === 8 ? 'the quaternion group' : `binary dihedral of order ${N}`, image: N === 8 ? 'C_2 \\times C_2' : `D_{${N / 4}}` };
        else group = { tex: `G_{${N}}`, name: `a group of order ${N}`, image: '?' };
        const counts = {};
        orders.forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
        out.units = {
            finite: true, order: N, complete: res.complete, group,
            orderCounts: Object.entries(counts).map(([k, c]) => ({ order: +k, count: c })).sort((u, v) => u.order - v.order),
            list: N <= 48 ? units.map((x) => quatTex(ctx, x)) : null,
        };
        return out;
    }

    // indefinite: covolume, signature (K = ℚ), sample units
    const z2 = zeta2(sub);
    const Phi = finRam.reduce((acc, p) => acc * (Number(p.Np) - 1), 1);
    const dK = Math.abs(Number(sub.disc));
    const vol = 2 * Math.pow(4 * Math.PI, r) * Math.pow(2 * Math.PI * Math.PI, s) * Math.pow(dK, 1.5) * z2.value * Phi / Math.pow(4 * Math.PI * Math.PI, n);
    out.volume = { value: vol, zeta2: z2.value, zetaExact: z2.exact, Phi, dK, P: z2.P };
    if (n === 1) {
        out.volume.exactTex = Phi === 1 ? '\\frac{\\pi}{3}' : `\\frac{${Phi}\\pi}{3}`;
        const ps = finRam.map((p) => BigInt(p.tex));
        const leg4 = (p) => (p === 2n ? 0 : p % 4n === 1n ? 1 : -1);
        const leg3 = (p) => (p === 3n ? 0 : p === 2n ? -1 : p % 3n === 1n ? 1 : -1);
        const e2 = ps.reduce((acc, p) => acc * (1 - leg4(p)), 1), e3 = ps.reduce((acc, p) => acc * (1 - leg3(p)), 1);
        const cusps = ps.length ? 0 : 1;
        const g = 1 + Phi / 12 - e2 / 4 - e3 / 3 - cusps / 2;
        out.signature = { g: Math.round(g), e2, e3, cusps, D: `${DN}` };
    }
    // a positive definite majorant: Σ_σ w_σ (|σx₀|² + |σa||σx₁|² + |σb||σx₂|² + |σab||σx₃|²)
    const embs = embeds.map((e) => ({ z: e.z, w: e.real ? 1 : 2 }));
    const weights = embs.map((e) => [kAlg.one(), a, b, kAlg.mul(a, b)].map((c) => { const v = embed(c, e.z); return Math.hypot(v.re, v.im); }));
    const lin = basis.map((x) => embs.map((e) => x.map((c) => embed(c, e.z))));
    const Gm = basis.map((_, i) => basis.map((__, j) => {
        let sum = 0;
        embs.forEach((e, k) => { for (let t = 0; t < 4; t++) { const u = lin[i][k][t], v = lin[j][k][t]; sum += e.w * weights[k][t] * (u.re * v.re + u.im * v.im); } });
        return sum;
    }));
    const unramified = pls.filter((p) => (p.kind === 'real' && !p.ramified) || p.kind === 'complex');
    const kindsOf = (x) => {
        const t = A.tr(x);
        return unramified.map((p) => {
            const v = embed(t, p.emb.z);
            if (p.kind === 'real') { const m = Math.abs(v.re); return m < 2 - 1e-9 ? 'elliptic' : m <= 2 + 1e-9 ? 'parabolic' : 'hyperbolic'; }
            if (Math.abs(v.im) < 1e-9 && Math.abs(v.re) < 2 - 1e-9) return 'elliptic';
            if (Math.abs(v.im) < 1e-9 && Math.abs(Math.abs(v.re) - 2) < 1e-9) return 'parabolic';
            return 'loxodromic';
        });
    };
    const isPm1 = (x) => A.isScalar(x) && (kAlg.isZero(kAlg.sub(x[0], kAlg.one())) || kAlg.isZero(kAlg.add(x[0], kAlg.one())));
    const projOrder = (x) => { let y = x; for (let k = 1; k <= 60; k++) { if (isPm1(y)) return k; y = A.mul(y, x); } return null; };
    const samples = [];
    const seen = new Set();
    const infinite = (u) => u.kinds.some((k) => k === 'hyperbolic' || k === 'loxodromic');
    let bound = 4 * n, complete = true;
    for (let round = 0; round < 9 && (samples.length < 8 || samples.filter(infinite).length < 2); round++, bound *= 2) {
        let res;
        try { res = shortVectors(Gm, bound, 200000); } catch (e) { break; }
        for (const c of res.vectors) {
            const fi = c.findIndex((v) => v !== 0);
            if (c[fi] < 0) continue;
            const key = c.join(',');
            if (seen.has(key)) continue;
            const x = combo(c);
            if (!nrdIsOne(x) || A.isScalar(x)) continue;
            seen.add(key);
            let P = 0; for (let i = 0; i < c.length; i++) for (let j = 0; j < c.length; j++) P += c[i] * Gm[i][j] * c[j];
            samples.push({ x, P, kinds: kindsOf(x) });
        }
        if (!res.complete) { complete = false; break; }
    }
    samples.sort((u, v) => u.P - v.P);
    // the shortest units, but keep a couple of infinite-order ones
    const inf = samples.filter(infinite).slice(0, 3), fin = samples.filter((u) => !infinite(u));
    const chosen = fin.slice(0, 8 - inf.length).concat(inf).sort((u, v) => u.P - v.P);
    out.units = {
        finite: false, complete,
        samples: chosen.map(({ x, kinds }) => ({
            tex: quatTex(ctx, x), trTex: kTex(ctx, A.tr(x)), kinds,
            order: kinds.every((k) => k === 'elliptic') ? projOrder(x) : null,
        })),
    };
    if (n === 1) out.units.matrices = chosen.map(({ x }) => splitMatrix(a, b, x));
    return out;
}

/** For K = ℚ: x as a matrix over ℚ(√a), in plain text for the Zariski Closure tool. */
function splitMatrix(a, b, x) {
    // i ↦ [[√a, 0], [0, −√a]], j ↦ [[0, b], [1, 0]], k = ij ↦ [[0, b√a], [−√a, 0]]  (a > 0; otherwise swap i and j)
    let A0 = a[0], B0 = b[0], c = x.map((v) => v[0]);
    if (A0.sign() < 0) { [A0, B0] = [B0, A0]; c = [c[0], c[2], c[1], c[3].neg()]; } // (a, b) ≅ (b, a) via i ↔ j, k ↦ −k
    const r = (q) => (q.d === 1n ? `${q.n}` : `${q.n}/${q.d}`);
    const lin = (p, q) => { // p + q·√a
        const sa = `sqrt(${r(A0)})`;
        if (q.isZero()) return r(p);
        const qs = q.eq(R1) ? sa : q.eq(R1.neg()) ? `-${sa}` : `${r(q)}*${sa}`;
        if (p.isZero()) return qs;
        return `${r(p)}${qs.startsWith('-') ? ' - ' + qs.slice(1) : ' + ' + qs}`;
    };
    const m11 = lin(c[0], c[1]), m22 = lin(c[0], c[1].neg());
    const m12 = lin(c[2].mul(B0), c[3].mul(B0)), m21 = lin(c[2], c[3].neg());
    return `((${m11}, ${m12}), (${m21}, ${m22}))`;
}

const api = { analyze, _internal: { maximalOrder, localMaximal, zeta2, splittingDegrees, shortVectors, places } };
if (isNode) module.exports = api;
else root.QuatEngine = api;
})(typeof self !== 'undefined' ? self : this);
