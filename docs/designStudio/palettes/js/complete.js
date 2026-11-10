// Palette completion. Given a few locked colors, propose whole palettes.
//
// The main engine works by analogy: for each palette in the corpus, find the
// colors that play the parts of your locked colors, then rotate its hues,
// scale its chroma and shift its lightness so those colors land on yours
// (any small leftover is spread to nearby colors), and keep the rest of
// that palette as the completion. A hue-template generator and a mutation
// step add palettes the corpus does not contain. Everything is ranked by the
// learned scorer plus how far the source palette had to bend, then picked
// for variety.

import {
    hexToOklch, oklchToOklab, oklabToOklch, oklchToHex, gamutMapOklch, maxChroma,
    cuspLightness, deltaE, hueDiff, wrapHue,
} from './color.js';
import { CORPUS, SOURCES } from './corpus.js';

// ---------------- contexts ----------------

/** Where a palette will live: the size to start from and soft limits. */
export const CONTEXTS = {
    poincare: { label: 'Poincaré faces', n: 8, L: [0.5, 0.9], minC: 0.035, minDE: 0.075, note: 'Shaded faces on a near-black ball: mid-to-light colors, all clearly distinct.' },
    chart: { label: 'Chart series', n: 6, L: [0.42, 0.8], minC: 0.03, minDE: 0.09, note: 'Series on white: no pale colors, every pair tellable apart.' },
    ui: { label: 'Interface', n: 5, L: [0.12, 0.98], minC: 0, minDE: 0.04, note: 'Backgrounds, text and accents: any lightness.' },
    free: { label: 'Free', n: 5, L: [0, 1], minC: 0, minDE: 0.03, note: 'No constraints beyond looking good.' },
};

// ---------------- corpus, prepared once ----------------

const PALETTES = CORPUS.map((p) => {
    const lch = p.colors.map(hexToOklch);
    return { ...p, lch, lab: lch.map(oklchToOklab) };
});

export { SOURCES };
export const corpusById = new Map(PALETTES.map((p) => [p.id, p]));

// ---------------- randomness ----------------

export function rng(seed = (Math.random() * 2 ** 32) >>> 0) {
    let s = seed >>> 0;
    const next = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.gauss = () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
    return next;
}

// ---------------- palette geometry ----------------

const lab = (lch) => oklchToOklab(lch);

export function paletteDistance(A, B) {
    const a = A.map(lab), b = B.map(lab);
    const one = (X, Y) => X.reduce((s, x) => s + Math.min(...Y.map((y) => deltaE(x, y))), 0) / X.length;
    return (one(a, b) + one(b, a)) / 2;
}

function minPairDE(lch) {
    let m = Infinity;
    const L = lch.map(lab);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) m = Math.min(m, deltaE(L[i], L[j]));
    return Number.isFinite(m) ? m : 1;
}

/** Soft penalty for breaking the context's limits (0 when inside). */
export function contextPenalty(lch, ctx, lockedMask = []) {
    let p = 0;
    lch.forEach(([L, C], i) => {
        if (lockedMask[i]) return;
        const [lo, hi] = ctx.L;
        if (L < lo) p += ((lo - L) / 0.1) ** 2;
        if (L > hi) p += ((L - hi) / 0.1) ** 2;
        if (C < ctx.minC) p += 0.6 * (1 - C / Math.max(ctx.minC, 1e-6));
    });
    const md = minPairDE(lch);
    if (md < ctx.minDE) p += 3 * ((ctx.minDE - md) / ctx.minDE) ** 2 * lch.length;
    return p;
}

/**
 * Pull free colors into the context's lightness band, keeping their order
 * and relative saturation (chroma as a fraction of what that L and h allow).
 */
export function fitToContext(lch, ctx, locked = []) {
    const [lo, hi] = ctx.L;
    const free = lch.map((_, i) => i).filter((i) => !locked[i]);
    if (!free.length) return lch;
    const Ls = free.map((i) => lch[i][0]);
    const a = Math.min(...Ls), b = Math.max(...Ls);
    let map = (L) => L;
    if (b - a > hi - lo) map = (L) => lo + ((L - a) / (b - a)) * (hi - lo);
    else if (a < lo) map = (L) => L + (lo - a);
    else if (b > hi) map = (L) => L - (b - hi);
    return lch.map((c, i) => {
        if (locked[i]) return c;
        const [L, C, h] = c, L2 = map(L);
        if (Math.abs(L2 - L) < 1e-4) return c;
        const rel = C / Math.max(1e-4, maxChroma(L, h));
        let C2 = Math.min(rel, 1) * maxChroma(L2, h);
        if (C2 < ctx.minC && C >= ctx.minC) C2 = Math.min(ctx.minC * 1.2, maxChroma(L2, h));
        return gamutMapOklch([L2, C2, h]);
    });
}

/** Lighter/darker and calmer/louder, as the sidebar sliders ask. */
export function steer(lch, { light = 0, vivid = 0 } = {}, locked = []) {
    if (!light && !vivid) return lch;
    return lch.map((c, i) => {
        if (locked[i]) return c;
        const [L, C, h] = c;
        const L2 = Math.min(0.98, Math.max(0.08, L + 0.12 * light));
        const rel = C / Math.max(1e-4, maxChroma(L, h));
        const rel2 = Math.min(0.97, rel * Math.exp(0.55 * vivid));
        return gamutMapOklch([L2, rel2 * maxChroma(L2, h), h]);
    });
}

// ---------------- analogy ----------------

/** Hue rotation, chroma scale and lightness map taking matched colors toward the seeds. */
function fitTransform(seeds, matched) {
    const m = seeds.length;
    let sx = 0, sy = 0, sw = 0;
    for (let i = 0; i < m; i++) {
        const w = Math.min(seeds[i][1], matched[i][1]);
        const d = hueDiff(matched[i][2], seeds[i][2]) * Math.PI / 180;
        sx += w * Math.cos(d); sy += w * Math.sin(d); sw += w;
    }
    const theta = sw > 0.015 ? Math.atan2(sy, sx) * 180 / Math.PI : 0;
    let lg = 0;
    for (let i = 0; i < m; i++) lg += Math.log((seeds[i][1] + 0.02) / (matched[i][1] + 0.02));
    const gamma = Math.min(2.8, Math.max(0.35, Math.exp(lg / m)));
    let alpha = 1, beta;
    if (m >= 2) {
        const mx = matched.reduce((s, c) => s + c[0], 0) / m, my = seeds.reduce((s, c) => s + c[0], 0) / m;
        let num = 0, den = 0;
        for (let i = 0; i < m; i++) { num += (matched[i][0] - mx) * (seeds[i][0] - my); den += (matched[i][0] - mx) ** 2; }
        alpha = den > 1e-4 ? Math.min(1.6, Math.max(0.6, num / den)) : 1;
        beta = my - alpha * mx;
    } else {
        beta = seeds[0][0] - matched[0][0];
    }
    return { theta, gamma, alpha, beta };
}

function applyTransform(T, [L, C, h]) {
    return [Math.min(0.99, Math.max(0.03, T.alpha * L + T.beta)), C * T.gamma, wrapHue(h + T.theta)];
}

function transformCost(T) {
    return 0.35 * Math.abs(T.theta) / 90 + 0.45 * Math.abs(Math.log(T.gamma)) + 2.2 * Math.abs(T.beta) * (T.alpha === 1 ? 1 : 0.5) + 0.8 * Math.abs(Math.log(T.alpha));
}

/** Rotation-free resemblance of two colors, for pruning the assignments to try. */
const roleDistance = (a, b) => 2 * Math.abs(a[0] - b[0]) + Math.abs(Math.log((a[1] + 0.02) / (b[1] + 0.02))) * 0.35;

function* assignments(seeds, P, perSeed = 5) {
    const cand = seeds.map((s) => P.lch.map((c, j) => [roleDistance(s, c), j]).sort((a, b) => a[0] - b[0]).slice(0, perSeed).map((x) => x[1]));
    const m = seeds.length, cur = [];
    function* rec(i, used) {
        if (i === m) { yield cur.slice(); return; }
        for (const j of cand[i]) {
            if (used.has(j)) continue;
            cur.push(j); used.add(j);
            yield* rec(i + 1, used);
            cur.pop(); used.delete(j);
        }
    }
    yield* rec(0, new Set());
}

/** Bend palette P so that its colors sigma[i] land on seeds[i]. */
function bend(P, seeds, sigma) {
    const matched = sigma.map((j) => P.lch[j]);
    const T = fitTransform(seeds, matched);
    const moved = P.lch.map((c) => applyTransform(T, c));
    const resid = sigma.map((j, i) => {
        const a = lab(seeds[i]), b = lab(moved[j]);
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    });
    const fit = resid.reduce((s, r) => s + Math.hypot(...r), 0) / seeds.length;
    // spread the leftover to each color by how close it sat to the matched one
    const out = moved.map((c, j) => {
        if (sigma.includes(j)) return null;
        let dx = 0, dy = 0, dz = 0, ws = 0;
        sigma.forEach((k, i) => {
            const w = Math.exp(-(deltaE(P.lab[j], P.lab[k]) ** 2) / (2 * 0.13 ** 2));
            dx += w * resid[i][0]; dy += w * resid[i][1]; dz += w * resid[i][2]; ws += w;
        });
        const sc = ws > 1 ? 1 / ws : 1;
        const L = lab(c);
        const g = gamutMapOklch(oklabToOklch([L[0] + dx * sc, L[1] + dy * sc, L[2] + dz * sc]));
        return { lch: g, clip: Math.max(0, c[1] - g[1]) };
    });
    const gamutLoss = out.reduce((s, o) => s + (o ? o.clip : 0), 0) / Math.max(1, out.filter(Boolean).length);
    return { T, fit, gamutLoss, others: out.map((o, j) => (o ? { lch: o.lch, j } : null)).filter(Boolean) };
}

// ---------------- sizing ----------------

/** Extra colors for a palette that is too small: in-between hues, tints and shades. */
function extensionPool(lch) {
    const pool = [];
    const chroma = lch.filter((c) => c[1] >= 0.03).sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < chroma.length && chroma.length >= 2; i++) {
        const a = chroma[i], b = chroma[(i + 1) % chroma.length];
        const A = lab(a), B = lab(b);
        const mid = oklabToOklch([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]);
        mid[1] = Math.max(mid[1], (a[1] + b[1]) / 2);
        pool.push(gamutMapOklch(mid));
    }
    for (const [L, C, h] of lch) {
        for (const dL of [0.14, -0.14]) {
            const L2 = L + dL;
            if (L2 < 0.15 || L2 > 0.96) continue;
            const rel = C / Math.max(1e-4, maxChroma(L, h));
            pool.push(gamutMapOklch([L2, rel * maxChroma(L2, h), h]));
        }
    }
    return pool;
}

function desirability(c, ctx) {
    const [lo, hi] = ctx.L, L = c[0];
    const out = L < lo ? lo - L : L > hi ? L - hi : 0;
    return Math.exp(-((out / 0.08) ** 2)) * (c[1] < ctx.minC ? 0.6 : 1);
}

/** Choose `count` of `pool` greedily: far from what is chosen, and suited to the context. */
function greedyPick(chosen, pool, count, ctx) {
    const picked = [], C = chosen.map(lab), left = pool.slice();
    while (picked.length < count && left.length) {
        let best = -1, bestV = -Infinity;
        left.forEach((c, i) => {
            const L = lab(c.lch || c);
            const d = C.length ? Math.min(...C.map((x) => deltaE(x, L))) : 1;
            const v = Math.min(d, 0.25) * desirability(c.lch || c, ctx);
            if (v > bestV) { bestV = v; best = i; }
        });
        const c = left.splice(best, 1)[0];
        picked.push(c);
        C.push(lab(c.lch || c));
    }
    return picked;
}

/**
 * Lay a completion into n slots: locked seeds keep their slots, the other
 * colors fill the rest in the order they were chosen.
 */
function assemble(n, locked, fillers) {
    const out = new Array(n).fill(null);
    for (const s of locked) out[s.slot] = s.lch;
    let k = 0;
    for (let i = 0; i < n; i++) if (!out[i]) out[i] = fillers[k++] || null;
    return out.every(Boolean) ? out : null;
}

function completeFrom(P, others, locked, n, ctx) {
    const need = n - locked.length;
    let fill;
    if (others.length >= need) {
        if (P.order && others.length === P.lch.length - locked.length) {
            const rank = new Map(P.order.map((j, r) => [j, r]));
            const byOrder = others.slice().sort((a, b) => rank.get(a.j) - rank.get(b.j));
            // the published order, but skip colors the context cannot use
            const ok = byOrder.filter((o) => desirability(o.lch, ctx) > 0.35);
            fill = (ok.length >= need ? ok : byOrder).slice(0, need).map((o) => o.lch);
        } else {
            fill = greedyPick(locked.map((s) => s.lch), others, need, ctx).map((o) => o.lch);
        }
    } else {
        fill = others.map((o) => o.lch);
        const extra = greedyPick([...locked.map((s) => s.lch), ...fill], extensionPool([...locked.map((s) => s.lch), ...fill]), need - fill.length, ctx);
        fill = fill.concat(extra);
    }
    return assemble(n, locked, fill);
}

// ---------------- hue templates ----------------

const TEMPLATES = [
    { name: 'analogous', hues: [0, 30, -30, 60] },
    { name: 'complementary', hues: [0, 180, 20, 200] },
    { name: 'split complementary', hues: [0, 150, 210] },
    { name: 'triad', hues: [0, 120, 240] },
    { name: 'square', hues: [0, 90, 180, 270] },
    { name: 'near-monochrome', hues: [0, 12, -12] },
];

function harmony(locked, n, ctx, r, pool) {
    const T = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
    const anchorSeed = locked.find((s) => s.lch[1] > 0.03);
    const base = anchorSeed ? anchorSeed.lch[2] : r() * 360;
    // a rhythm of lightness and relative chroma, borrowed from a real palette
    const donor = pool[Math.floor(r() * pool.length)];
    const rhythm = donor.lch.map(([L, C, h]) => [L, C / Math.max(1e-4, maxChroma(L, h))]);
    const need = n - locked.length;
    const hues = [];
    for (let i = 0; i < need; i++) hues.push(wrapHue(base + T.hues[(i + (anchorSeed ? 1 : 0)) % T.hues.length] + r.gauss() * 7));
    // natural lightness: give the lighter rhythm entries to hues that are naturally light
    const rh = Array.from({ length: need }, () => rhythm[Math.floor(r() * rhythm.length)]).sort((a, b) => a[0] - b[0]);
    const order = hues.map((h, i) => [cuspLightness(h) + r.gauss() * 0.08, i]).sort((a, b) => a[0] - b[0]);
    const fill = new Array(need);
    order.forEach(([, i], k) => {
        const [L, rel] = rh[k], h = hues[i];
        fill[i] = gamutMapOklch([L, Math.min(0.95, rel) * maxChroma(L, h), h]);
    });
    return { lch: assemble(n, locked, fill), note: `${T.name}, rhythm of ${donor.name}`, donor };
}

// ---------------- the round ----------------

/**
 * Suggest palettes.
 *   locked:  [{slot, hex}]   colors to keep, in their slots
 *   n:       palette size
 *   ctx:     a CONTEXTS entry
 *   scorer:  makeScorer(...) from model.js
 *   sources: Set of source keys to draw from ('harmony' for templates)
 *   steerBy: {light, vivid} in [-1, 1]
 *   fit:     pull colors into the context's lightness band
 *   seed:    randomness, so "Shuffle" gives a new round
 */
export function suggest({ locked = [], n = 5, ctx = CONTEXTS.free, scorer, sources, steerBy = {}, fit = true, count = 24, seed, avoid = [] }) {
    const r = rng(seed);
    const L = locked.map((s) => ({ slot: s.slot, lch: hexToOklch(s.hex) }));
    const mask = new Array(n).fill(false);
    L.forEach((s) => { mask[s.slot] = true; });
    const pool = PALETTES.filter((p) => sources.has(p.source) && p.lch.length >= Math.max(2, L.length));
    const candidates = [];

    const finish = (lch, meta) => {
        if (!lch) return;
        let out = steer(lch, steerBy, mask);
        if (fit) out = fitToContext(out, ctx, mask);
        candidates.push({ lch: out, ...meta });
    };

    if (L.length) {
        // bend every palette toward the seeds; keep the cheapest bends
        const bent = [];
        for (const P of pool) {
            let best = null;
            for (const sigma of assignments(L.map((s) => s.lch), P)) {
                const b = bend(P, L.map((s) => s.lch), sigma);
                const cost = 9 * b.fit + transformCost(b.T) + 4 * b.gamutLoss;
                if (!best || cost < best.cost) best = { ...b, cost, sigma };
            }
            if (best) bent.push({ P, ...best });
        }
        bent.sort((a, b) => a.cost - b.cost + (r() - 0.5) * 0.25);
        // the cheapest bends from each source
        const taken = new Map();
        const keep = bent.filter((b) => {
            const k = taken.get(b.P.source) || 0;
            taken.set(b.P.source, k + 1);
            return k < 55;
        });
        for (const b of keep) {
            const sizePenalty = Math.max(0, n - b.P.lch.length) * 0.12;
            finish(completeFrom(b.P, b.others, L, n, ctx), {
                from: b.P, how: 'analogy', bendCost: b.cost + sizePenalty,
                note: describeBend(b.T),
            });
        }
    } else {
        // nothing locked: real palettes, a fresh random draw each round,
        // the same number from each source so the big ones don't drown the rest
        const bySource = new Map();
        for (const P of pool) (bySource.get(P.source) || bySource.set(P.source, []).get(P.source)).push(P);
        const draw = [...bySource.values()].flatMap((ps) => ps.slice().sort(() => r() - 0.5).slice(0, 60));
        for (const P of draw) {
            const others = P.lch.map((lch, j) => ({ lch, j }));
            finish(completeFrom(P, others, [], n, ctx), {
                from: P, how: 'corpus', bendCost: Math.max(0, n - P.lch.length) * 0.12, note: '',
            });
        }
    }

    if (sources.has('harmony')) {
        const donors = PALETTES.filter((p) => p.lch.length >= 4);
        for (let i = 0; i < 60; i++) {
            const h = harmony(L, n, ctx, r, donors);
            finish(h.lch, { from: null, how: 'harmony', bendCost: 1.1, note: h.note });
        }
    }

    return rank(candidates, { ctx, scorer, mask, count, r, avoid });
}

/** Score, penalize, then choose a varied set (maximal marginal relevance). */
export function rank(candidates, { ctx, scorer, mask, count, r, avoid = [] }) {
    for (const c of candidates) {
        c.model = scorer.score(c.lch);
        c.penalty = contextPenalty(c.lch, ctx, mask);
        c.quality = c.model - 1.4 * c.bendCost - 1.2 * c.penalty + (r ? r.gauss() * 0.35 : 0);
    }
    candidates.sort((a, b) => b.quality - a.quality);
    const shortlist = candidates.slice(0, 160);
    const chosen = [];
    const fromCount = new Map(), sourceCount = new Map();
    const sourceOf = (c) => (c.from ? c.from.source : c.how);
    const avoidLch = avoid.map((hexes) => hexes.map(hexToOklch));
    while (chosen.length < count && shortlist.length) {
        let best = -1, bestV = -Infinity;
        shortlist.forEach((c, i) => {
            let sim = 0;
            for (const o of chosen) sim = Math.max(sim, Math.exp(-paletteDistance(c.lch, o.lch) / 0.035));
            for (const o of avoidLch) if (o.length === c.lch.length) sim = Math.max(sim, Math.exp(-paletteDistance(c.lch, o) / 0.02));
            const same = c.from ? fromCount.get(c.from.id) || 0 : 0;
            const v = c.quality - 4 * sim - 3 * same - 0.45 * (sourceCount.get(sourceOf(c)) || 0);
            if (v > bestV) { bestV = v; best = i; }
        });
        const c = shortlist.splice(best, 1)[0];
        if (c.from) fromCount.set(c.from.id, (fromCount.get(c.from.id) || 0) + 1);
        sourceCount.set(sourceOf(c), (sourceCount.get(sourceOf(c)) || 0) + 1);
        chosen.push(c);
    }
    return chosen.map((c) => ({
        colors: c.lch.map(oklchToHex),
        from: c.from ? { id: c.from.id, name: c.from.name, source: c.from.source } : null,
        how: c.how, note: c.note, quality: c.quality, model: c.model, penalty: c.penalty,
    }));
}

function describeBend(T) {
    const bits = [];
    if (Math.abs(T.theta) >= 8) bits.push(`hues turned ${Math.round(T.theta)}°`);
    if (Math.abs(Math.log(T.gamma)) >= 0.15) bits.push(T.gamma > 1 ? 'more vivid' : 'softer');
    if (Math.abs(T.beta) >= 0.05 && T.alpha === 1) bits.push(T.beta > 0 ? 'lighter' : 'darker');
    return bits.join(', ');
}

// ---------------- more like this ----------------

/** Variations on one palette: nudged colors and single-color swaps, ranked and varied. */
export function vary({ colors, locked = [], ctx, scorer, steerBy = {}, fit = true, count = 24, seed }) {
    const r = rng(seed);
    const base = colors.map(hexToOklch), n = base.length;
    const mask = new Array(n).fill(false);
    locked.forEach((s) => { mask[s.slot] = true; });
    const cands = [];
    for (let t = 0; t < 220; t++) {
        const amp = 0.4 + 1.2 * r();
        let lch = base.map((c, i) => {
            if (mask[i]) return c;
            if (r() < 0.35) return c;
            const [L, C, h] = c;
            const L2 = Math.min(0.97, Math.max(0.08, L + r.gauss() * 0.045 * amp));
            const rel = (C / Math.max(1e-4, maxChroma(L, h))) * Math.exp(r.gauss() * 0.18 * amp);
            const h2 = h + r.gauss() * 11 * amp;
            return gamutMapOklch([L2, Math.min(0.96, rel) * maxChroma(L2, h2), h2]);
        });
        // sometimes swap one color for a sibling from the corpus
        if (r() < 0.3) {
            const free = lch.map((_, i) => i).filter((i) => !mask[i]);
            if (free.length) {
                const i = free[Math.floor(r() * free.length)];
                const P = PALETTES[Math.floor(r() * PALETTES.length)];
                const c = P.lch[Math.floor(r() * P.lch.length)];
                lch[i] = gamutMapOklch([lch[i][0], c[1], c[2]]);
            }
        }
        lch = steer(lch, steerBy, mask);
        if (fit) lch = fitToContext(lch, ctx, mask);
        cands.push({ lch, from: null, how: 'variation', bendCost: 0.25 * paletteDistance(lch, base) / 0.05, note: '' });
    }
    return rank(cands, { ctx, scorer, mask, count, r, avoid: [colors] });
}

/** A corpus palette resized for the context (for browsing the library directly). */
export function fromCorpus(id, n, ctx, fit = true) {
    const P = corpusById.get(id);
    if (!P) return null;
    let lch = completeFrom(P, P.lch.map((c, j) => ({ lch: c, j })), [], n, ctx);
    if (fit) lch = fitToContext(lch, ctx, []);
    return lch.map(oklchToHex);
}
