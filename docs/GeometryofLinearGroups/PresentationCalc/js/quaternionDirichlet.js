/**
 * quaternionDirichlet.js — vertex stabilizers that are arithmetic Fuchsian or Kleinian groups, for
 * quaternionIndex.js: when A splits at exactly one place v at ∞ (real: H², complex: H³), U = N(𝒪)/k^× is a
 * lattice in PGL₂(k_v), presented by a Dirichlet domain.
 *
 *   embedding   σ_v: A → M₂(ℂ) through the field of definition F (a root of F over v), and the positive
 *               definite majorant Q(x) = Σ_{w ramified real} σ_w(nrd x) + ‖σ_v(x)‖² (Frobenius). For x of
 *               reduced norm ν, ‖σ_v(x)‖² = 2|ν|_v cosh d(j, x·j), so "nrd x = ν and d(j, x·j) ≤ R" is an
 *               exhaustive Fincke–Pohst search.
 *   covolume    Borel: covol P(𝒪¹) = 8π|d_k|^{3/2}ζ_k(2)∏(N𝔭 − 1)/(4π²)^n (real v), |d_k|^{3/2}ζ_k(2)∏(N𝔭 − 1)/(4π²)^{n−1}
 *               (complex v), and [U⁺ : P(𝒪¹)] = the classes of reduced norms (mod squares) that U⁺ meets.
 *   stabilizer  the elements of U⁺ (orientation-preserving at v) with d(j, x·j) ≤ R, R growing, handed to
 *               poincare's runCompute; done when its domain is certified and its area (Gauss–Bonnet from the
 *               vertex cycles) or volume equals covol U⁺: then they generate U⁺. Side pairings and relators
 *               are re-checked here in exact arithmetic. With an element η of U of negative norm at a real v,
 *               U = ⟨U⁺, η⟩ (η² and ηsη⁻¹ written in U⁺).
 *   word        an element of U as a word in the side pairings: fold it towards the basepoint across the walls
 *               (each step a side pairing that brings it strictly closer), then check it reached 1 exactly.
 */
import { runCompute, matToArr } from '../../Geometric/Tools/Kleinian/poincare/js/compute.js';
import { Matrix2x2, Complex, translationTowards } from '../../Geometric/Tools/Kleinian/poincare/js/math.js';
import * as Zmod from './zeta.js';
import { polyRoots, elemsOf, shortVectors, normFlat } from './quatOrders.js';

const zetaApi = () => (Zmod && Zmod.default && Zmod.default.zetaK2 ? Zmod.default : globalThis.Zeta || (globalThis.self && globalThis.self.Zeta));
const C = (re, im = 0) => ({ re, im });
const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cscale = (a, t) => C(a.re * t, a.im * t);
const cabs = (a) => Math.hypot(a.re, a.im);

/**
 * The split place v and the majorant. Finfo (quaternionAlgebra): { poly (of F), basis (1, I, J, K as matrices
 * over F), theta (θ^j in F's coordinates) }. Returns null when A does not split at exactly one place at ∞.
 */
export function makeEmbedding(K, QA, Finfo) {
    const n = K.n, D = QA.D;
    const fp = Finfo.poly.map(Number);
    const roots = fp.length > 2 ? polyRoots(fp) : [C(-fp[0] / fp[1])];
    const evalF = (fe, rho) => { let s = C(0), p = C(1); fe.v.forEach((c) => { s = cadd(s, cscale(p, Number(c))); p = cmul(p, rho); }); return cscale(s, 1 / Number(fe.D)); };
    const evalQ = (row, rho) => { let s = C(0), p = C(1); row.forEach((q) => { s = cadd(s, cscale(p, Number(q[0]) / Number(q[1]))); p = cmul(p, rho); }); return s; };
    const kAt = (x, th) => { let s = C(0), p = C(1); x.v.forEach((c) => { s = cadd(s, cscale(p, Number(c))); p = cmul(p, th); }); return cscale(s, 1 / Number(x.d)); };
    const thetaAt = (rho) => (n === 1 ? C(0) : evalQ(Finfo.theta[1], rho));
    // the places of k where A splits: real with α > 0 or β > 0, or complex
    const realRam = K.roots.map((r, i) => ({ i, r })).filter(({ r }) => kAt(QA.alpha, C(r)).re < 0 && kAt(QA.beta, C(r)).re < 0).map(({ i }) => i);
    const splitReal = K.roots.length - realRam.length, splitPlaces = splitReal + K.r2;
    if (splitPlaces !== 1) return null;
    let rho = null, thV = null, kind = null;
    for (const r of roots) {
        const th = thetaAt(r);
        const isReal = Math.abs(th.im) < 1e-7 * (1 + Math.abs(th.re));
        if (isReal && K.r2 === 0 && !(kAt(QA.alpha, C(th.re)).re < 0 && kAt(QA.beta, C(th.re)).re < 0)) { rho = r; thV = C(th.re); kind = 'real'; break; }
        if (!isReal && K.r2 === 1) { rho = r; thV = th; kind = 'complex'; break; }
    }
    if (!rho) return null;
    const Ev = Finfo.basis.map((Xm) => Xm.map((x) => evalF(x, rho)));     // 1, I, J, K at v: [a, b, c, d]
    const pw = [C(1)];
    for (let a = 1; a < n; a++) pw.push(cmul(pw[a - 1], thV));
    // σ_v of a flat vector, as [a, b, c, d] (complex)
    const sigma = (x) => {
        const out = [C(0), C(0), C(0), C(0)];
        for (let c = 0; c < 4; c++) {
            let s = C(0);
            for (let a = 0; a < n; a++) { const v = x.v[c * n + a]; if (v) s = cadd(s, cscale(pw[a], Number(v))); }
            s = cscale(s, 1 / Number(x.d));
            for (let e = 0; e < 4; e++) out[e] = cadd(out[e], cmul(s, Ev[c][e]));
        }
        return out;
    };
    // the majorant on the flat basis θ^a e_c
    const basisV = [];
    for (let c = 0; c < 4; c++) for (let a = 0; a < n; a++) basisV.push(Ev[c].map((z) => cmul(z, pw[a])));
    const G = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => basisV[i].reduce((s, z, e) => s + z.re * basisV[j][e].re + z.im * basisV[j][e].im, 0)));
    for (const wi of realRam) {
        const t = K.roots[wi];
        const coef = [1, -kAt(QA.alpha, C(t)).re, -kAt(QA.beta, C(t)).re, kAt(QA.alpha, C(t)).re * kAt(QA.beta, C(t)).re];
        for (let c = 0; c < 4; c++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) G[c * n + a][c * n + b] += coef[c] * t ** (a + b);
    }
    const nrdV = (nu) => kAt(nu, thV);
    const nrdRam = (nu) => realRam.map((wi) => kAt(nu, C(K.roots[wi])).re);
    const ramGram = G.map((r) => r.slice());
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) ramGram[i][j] -= basisV[i].reduce((s2, z, e) => s2 + z.re * basisV[j][e].re + z.im * basisV[j][e].im, 0);
    const emb = { kind, rho, thetaV: thV, realRam, sigma, gram: G, nrdV, nrdRam, B: null };
    /** the same with the basepoint B·j: σ ↦ B⁻¹σB (B = [[a, b], [c, d]] complex, det 1) */
    emb.at = (Bm) => {
        const conjB = (m) => mat4(cmulM(cmulM(invM(Bm), m), Bm));
        const sig = (x) => conjB(sigma(x));
        const bv = basisV.map((m) => conjB(m));
        const G2 = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => ramGram[i][j] + bv[i].reduce((s2, z, e) => s2 + z.re * bv[j][e].re + z.im * bv[j][e].im, 0)));
        return { ...emb, sigma: sig, gram: G2, B: Bm };
    };
    emb.basisV = basisV;
    return emb;
}
// 2 × 2 complex matrices as [a, b, c, d]
const cmulM = (X, Y) => [cadd(cmul(X[0], Y[0]), cmul(X[1], Y[2])), cadd(cmul(X[0], Y[1]), cmul(X[1], Y[3])), cadd(cmul(X[2], Y[0]), cmul(X[3], Y[2])), cadd(cmul(X[2], Y[1]), cmul(X[3], Y[3]))];
const invM = (X) => [X[3], cscale(X[1], -1), cscale(X[2], -1), X[0]];        // for det 1
const mat4 = (X) => X;

/**
 * The centre of an order L at v: the point p = B·j minimizing Σ ‖B⁻¹σ(bᵢ)B‖² over a basis bᵢ (a convex proper function
 * on H³, or on H² for a real place), by Nelder–Mead in (Re z, Im z, log t), B = [[√t, z/√t], [0, 1/√t]].
 */
export function centreOf(emb, L, basis = null) {
    const X = (basis || elemsOf(L)).map((b) => emb.sigma(b));
    const Bof = ([x, y, lt]) => { const st = Math.exp(lt / 2); return [C(st), cscale(C(x, emb.kind === 'real' ? 0 : y), 1 / st), C(0), C(1 / st)]; };
    const phi = (q) => { const B = Bof(q), Bi = invM(B); let s2 = 0; for (const m of X) { const Y = cmulM(cmulM(Bi, m), B); for (const z of Y) s2 += z.re * z.re + z.im * z.im; } return s2; };
    const dim = emb.kind === 'real' ? 2 : 3;
    const pack = (u) => (dim === 2 ? [u[0], 0, u[1]] : u);
    let simplex = [new Array(dim).fill(0)];
    for (let i = 0; i < dim; i++) { const v = new Array(dim).fill(0); v[i] = 1; simplex.push(v); }
    let vals = simplex.map((u) => phi(pack(u)));
    for (let it = 0; it < 4000; it++) {
        const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
        simplex = order.map((i) => simplex[i]); vals = order.map((i) => vals[i]);
        if (Math.abs(vals[dim] - vals[0]) < 1e-12 * (1 + Math.abs(vals[0]))) break;
        const cen = new Array(dim).fill(0);
        for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) cen[j] += simplex[i][j] / dim;
        const at = (t) => cen.map((c, j) => c + t * (simplex[dim][j] - c));
        const r = at(-1), fr = phi(pack(r));
        if (fr < vals[0]) { const e = at(-2), fe = phi(pack(e)); if (fe < fr) { simplex[dim] = e; vals[dim] = fe; } else { simplex[dim] = r; vals[dim] = fr; } }
        else if (fr < vals[dim - 1]) { simplex[dim] = r; vals[dim] = fr; }
        else {
            const c2 = at(0.5), fc = phi(pack(c2));
            if (fc < vals[dim]) { simplex[dim] = c2; vals[dim] = fc; }
            else for (let i = 1; i <= dim; i++) { simplex[i] = simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j])); vals[i] = phi(pack(simplex[i])); }
        }
    }
    return Bof(pack(simplex[0]));
}

/** The centre of the order L at v, as a matrix B (the point B·j): Φ over a basis LLL-reduced at the current guess, until it settles. */
export function centreLattice(emb0, L) {
    const toM = (B) => new Matrix2x2(new Complex(B[0].re, B[0].im), new Complex(B[1].re, B[1].im), new Complex(B[2].re, B[2].im), new Complex(B[3].re, B[3].im));
    let Bc = centreOf(emb0, L, lllFloat(elemsOf(L), emb0.gram));
    for (let it = 0; it < 6; it++) {
        const B2 = centreOf(emb0, L, lllFloat(elemsOf(L), emb0.at(Bc).gram));
        const moved = frob(toM(B2).inv().mul(toM(Bc)));
        Bc = B2;
        if (moved < 2 + 1e-6) break;                                   // 2 cosh d, d ≈ 0
    }
    return Bc;
}

/** Borel's covolume of P(𝒪¹) at v (area for real v, volume for complex v). */
export function borelCovolume(K, kind, ramNorms) {
    const n = K.n, d = Math.abs(Number(K.disc));
    const zeta = n === 1 ? Math.PI ** 2 / 6 : zetaApi().zetaK2({ d: n, minpoly: K.g.map(String), disc: String(K.disc) }).value;
    const prod = ramNorms.reduce((s, N) => s * (Number(N) - 1), 1);
    return kind === 'real' ? (8 * Math.PI * d ** 1.5 * zeta * prod) / (4 * Math.PI ** 2) ** n : (d ** 1.5 * zeta * prod) / (4 * Math.PI ** 2) ** (n - 1);
}

/** LLL for a floating-point Gram matrix on the flat coordinates (the majorant). */
export function lllFloat(E, Gflat) {
    const b = E.map((x) => x.v.slice()), den = E[0].d, D = b.length;
    const gf = (u, w) => { let s = 0; for (let i = 0; i < D; i++) { if (!u[i]) continue; const ui = Number(u[i]); for (let j = 0; j < D; j++) if (w[j]) s += ui * Gflat[i][j] * Number(w[j]); } return s / Number(den) ** 2; };
    let k = 1;
    for (let guard = 0; k < D && guard < 20000; guard++) {
        const mu = Array.from({ length: D }, () => new Array(D).fill(0)), Bs = [];
        const G = b.map((x) => b.map((y) => gf(x, y)));
        for (let i = 0; i <= k; i++) {
            let s = G[i][i];
            for (let j = 0; j < i; j++) { let m = G[i][j]; for (let l = 0; l < j; l++) m -= mu[j][l] * mu[i][l] * Bs[l]; mu[i][j] = m / Bs[j]; s -= mu[i][j] * mu[i][j] * Bs[j]; }
            Bs.push(s);
        }
        let changed = false;
        for (let j = k - 1; j >= 0; j--) { const r = Math.round(mu[k][j]); if (r) { const R = BigInt(r); b[k] = b[k].map((c, l) => c - R * b[j][l]); changed = true; break; } }
        if (changed) continue;
        if (Bs[k] < (0.99 - mu[k][k - 1] ** 2) * Bs[k - 1]) { [b[k], b[k - 1]] = [b[k - 1], b[k]]; k = Math.max(k - 1, 1); } else k++;
    }
    return b.map((v) => ({ v, d: den }));
}
export const gramOf = (E, Gflat) => {
    const D = E[0].v.length;
    return E.map((x) => E.map((y) => { let s = 0; for (let i = 0; i < D; i++) { if (!x.v[i]) continue; const xi = Number(x.v[i]); for (let j = 0; j < D; j++) if (y.v[j]) s += xi * Gflat[i][j] * Number(y.v[j]); } return s / (Number(x.d) * Number(y.d)); }));
};

const toMatrix = (s) => new Matrix2x2(new Complex(s[0].re, s[0].im), new Complex(s[1].re, s[1].im), new Complex(s[2].re, s[2].im), new Complex(s[3].re, s[3].im)).normalized();
const frob = (M) => M.a.normSq() + M.b.normSq() + M.c.normSq() + M.d.normSq();

/** Area of the Dirichlet polygon of a Fuchsian domain (walls vertical over the slice y = 0), or null if infinite. */
function planarArea(res) {
    const walls = res.domain.walls, N = walls.length;
    // free arcs on the boundary circle (x, z) = (cos t, sin t): where every wall is strictly satisfied
    const roots = [0, 2 * Math.PI];
    for (const w of walls) {
        const [cx, , cz, cw] = w.cov, r = Math.hypot(cx, cz);
        if (r < 1e-12 || Math.abs(cw) > r) continue;
        const phi = Math.atan2(cz, cx), del = Math.acos(Math.max(-1, Math.min(1, cw / r)));
        for (const t of [phi + del, phi - del]) roots.push(((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    }
    roots.sort((a, b) => a - b);
    for (let i = 0; i + 1 < roots.length; i++) {
        if (roots[i + 1] - roots[i] < 1e-9) continue;
        const t = (roots[i] + roots[i + 1]) / 2;
        if (walls.every((w) => w.cov[0] * Math.cos(t) + w.cov[2] * Math.sin(t) - w.cov[3] < -1e-9)) return null;
    }
    const angles = (res.report.edgeCycles || []).reduce((s, c) => s + c.angleSum, 0);
    return (N - 2) * Math.PI - angles;
}

/**
 * U = N(L)/k^× for a maximal order L (a lattice in PGL₂(k_v)): { gens, rels, word, area, R }. targets: the
 * reduced norms of U modulo squares (k-elements); covolP: covol P(𝒪¹). QA, K: the algebra; conjLat, latEq:
 * lattice helpers; key/one: projective keys. Throws when it cannot finish within maxR or the deadline.
 */
export function dirichletStabilizer({ L, QA, K, emb: emb0, targets, covolP, conjLat, latEq, deadline, maxR = 8, maxGens = 90 }) {
    const ONE = QA.key(QA.one());
    const Bc = centreLattice(emb0, L);
    const emb = emb0.at(Bc);
    const posAtV = (nu) => emb.kind === 'complex' || emb.nrdV(nu).re > 0;
    const pos = targets.filter(posAtV), neg = targets.filter((t) => !posAtV(t));
    const covol = covolP / pos.length;
    const E = lllFloat(elemsOf(L), emb.gram), Gm = gramOf(E, emb.gram);
    const combo = (c) => { const v = new Array(QA.D).fill(0n); c.forEach((ci, i) => { if (ci) { const B = BigInt(ci); for (let j = 0; j < QA.D; j++) v[j] += B * E[i].v[j]; } }); return normFlat(v, E[0].d); };
    const boundFor = (tset, R) => Math.max(...tset.map((nu) => emb.nrdRam(nu).reduce((s, x) => s + x, 0) + 2 * cabs(emb.nrdV(nu)) * Math.cosh(R))) * (1 + 1e-9);
    const search = (tset, R) => {
        const out = [];
        for (const c of shortVectors(Gm, boundFor(tset, R), { max: 4e6 })) {
            const x = combo(c), nr = QA.nrd(x);
            const nu = tset.find((t) => K.eq(t, nr));
            if (!nu) continue;
            // rank by the displacement d at the centre: Q = Σ_w σ_w(ν) + 2|ν|_v cosh d
            const q = c.reduce((s, ci, i) => s + ci * c.reduce((t, cj, j) => t + cj * Gm[i][j], 0), 0);
            const ch = (q - emb.nrdRam(nu).reduce((s, y) => s + y, 0)) / (2 * cabs(emb.nrdV(nu)));
            out.push({ x, q: Math.acosh(Math.max(1, ch)) });
        }
        return out.sort((a, b) => a.q - b.q);
    };
    // a generic basepoint p (in the plane y = 0 for a Fuchsian group), and the frame B moving the origin there
    // (σ is already taken at the centre of L; the frame moves the origin a little further, to a generic point)
    const p = emb.kind === 'real' ? [0.113, 0, 0.071] : [0.113, 0.071, 0.052];
    const rp = Math.hypot(...p), B = translationTowards({ x: p[0] / rp, y: p[1] / rp, z: p[2] / rp }, 2 * Math.atanh(rp)), Binv = B.inv();
    let chosen = null;
    for (let R = 1; R <= maxR && !chosen; R += 0.75) {
        if (Date.now() > deadline) throw new Error('the vertex stabilizer took too long');
        const seen = new Set([ONE]), els = [];
        for (const { x } of search(pos, R)) {
            const k1 = QA.key(x), k2 = QA.key(QA.conj(x));
            if (seen.has(k1) || seen.has(k2)) continue;
            if (!latEq(conjLat(x, L), L)) continue;
            seen.add(k1); els.push(QA.prim(x));
            if (els.length >= maxGens) break;
        }
        if (!els.length) continue;
        const mats = els.map((x) => Binv.mul(toMatrix(emb.sigma(x))).mul(B));
        const arr = mats.map(matToArr);
        let res;
        try { res = runCompute(JSON.parse(JSON.stringify({ gens: arr, origGens: arr, B: matToArr(Matrix2x2.identity()), maxFaces: 400, maxDepth: 6, fullDirichlet: false, exact: null, ford: null, skipNondiscrete: true }))); }
        catch (e) { continue; }
        const P = res.report && res.report.presentation;
        const size = res.report && res.report.status === 'verified' && P && P.complete ? (emb.kind === 'real' ? planarArea(res) : (res.invariants && res.invariants.finiteVolume ? res.invariants.volume : null)) : null;
        if (!res.report || res.report.status !== 'verified' || !P || !P.complete) continue;
        if (size == null || !(size > 0)) continue;
        const ratio = size / covol;
        if (ratio < 1 - 1e-4) throw new Error(`internal: covolume ${size} below Borel's ${covol}`);
        if (ratio < 1 + 1e-4) chosen = { els, res, R, size };
    }
    if (!chosen) throw new Error(`no generating set of the vertex stabilizer within distance ${maxR}`);
    const { els, res } = chosen;
    const ofWord = (w) => w.reduce((acc, l) => QA.prim(QA.mul(acc, l > 0 ? els[l - 1] : QA.conj(els[-l - 1]))), QA.one());
    // generators: the side pairings; relators: the cycle relations
    const gens = res.report.presentation.generators.map((g) => ofWord(g.word));
    const keyOf = gens.map((g) => QA.key(g)), keyInv = gens.map((g) => QA.key(QA.conj(g)));
    const rels = res.report.presentation.relatorsEnc.map(({ enc, m }) => { const w = []; for (let t = 0; t < m; t++) for (const e of enc) w.push(e > 0 ? 2 * (e - 1) : 2 * (-e - 1) + 1); return w; });
    const elOf = (l) => (l & 1 ? QA.conj(gens[l >> 1]) : gens[l >> 1]);
    for (const w of rels) if (QA.key(w.reduce((acc, l) => QA.prim(QA.mul(acc, elOf(l))), QA.one())) !== ONE) throw new Error('internal: a relator of the vertex stabilizer is not 1');
    // the walls: elements h_m (wall m bisects p and h_m·p), as letters in the side pairings
    const centre = res.domain.q0 && Math.hypot(...res.domain.q0) > 1e-12 ? (() => { const q = res.domain.q0, r = Math.hypot(...q); return B.mul(translationTowards({ x: q[0] / r, y: q[1] / r, z: q[2] / r }, 2 * Math.atanh(r))); })() : B;
    const centreInv = centre.inv();
    const walls = res.domain.walls.map((w) => {
        const h = ofWord(w.word), k = QA.key(h);
        let letter = keyOf.indexOf(k);
        if (letter >= 0) letter = 2 * letter;
        else { const j = keyInv.indexOf(k); if (j < 0) throw new Error('internal: a wall is not a side pairing'); letter = 2 * j + 1; }
        return { h, hinv: QA.conj(h), H: toMatrix(emb.sigma(QA.conj(h))), letter };
    });
    const score = (x) => frob(centreInv.mul(toMatrix(emb.sigma(x))).mul(centre));
    const reducePos = (x) => {
        let c = QA.prim(x), s = score(c);
        const w = [];
        for (let step = 0; step < 5000; step++) {
            let best = null;
            for (const wl of walls) { const c2 = QA.prim(QA.mul(wl.hinv, c)), s2 = score(c2); if (!best || s2 < best.s) best = { wl, c2, s: s2 }; }
            if (!best || best.s >= s - 1e-12 * s) break;
            w.push(best.wl.letter); c = best.c2; s = best.s;
        }
        if (QA.key(c) !== ONE) throw new Error('not in the vertex stabilizer');
        return w;
    };
    // a real v with norms of both signs: U = ⟨U⁺, η⟩
    let eta = null;
    if (neg.length) {
        for (let R = 1; R <= maxR && !eta; R += 1) for (const { x } of search(neg, R)) if (latEq(conjLat(x, L), L)) { eta = QA.prim(x); break; }
        if (!eta) throw new Error('no element of negative norm in the vertex stabilizer');
        const e = gens.length, ei = QA.conj(eta);
        gens.push(eta);
        rels.push([2 * e, 2 * e].concat(reducePos(QA.mul(eta, eta)).reverse().map((l) => l ^ 1)));
        for (let k = 0; k < e; k++) rels.push([2 * e, 2 * k, 2 * e + 1].concat(reducePos(QA.mul(QA.mul(eta, gens[k]), ei)).reverse().map((l) => l ^ 1)));
        for (const w of rels.slice(-e - 1)) if (QA.key(w.reduce((acc, l) => QA.prim(QA.mul(acc, l & 1 ? QA.conj(gens[l >> 1]) : gens[l >> 1])), QA.one())) !== ONE) throw new Error('internal: an η relator is not 1');
    }
    const word = (x) => {
        if (eta && !posAtV(QA.nrd(x))) return [2 * (gens.length - 1)].concat(reducePos(QA.mul(QA.conj(eta), x)));
        return reducePos(x);
    };
    return { kind: 'dirichlet', gens, rels, word, size: chosen.size, covol, R: chosen.R, inputs: els.length, eta: !!eta, centre: Bc };
}
