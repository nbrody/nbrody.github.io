// What makes a palette look made rather than random: a feature vector per
// palette and a logistic model over it. The base weights are trained offline
// (tools/build.mjs) to tell real palettes from random, rainbow and scrambled
// ones; the page then nudges them toward the viewer's own ♥ and ✕.

import { maxChroma, cuspLightness, deltaE, oklchToOklab } from './color.js';

const NEUTRAL_C = 0.03;

export const FEATURE_NAMES = [
    'meanL', 'stdL', 'rangeL',
    'meanC', 'stdC', 'maxC',
    'meanRelC', 'maxRelC',
    'hueDisp', 'hueGap',
    'minDE', 'meanDE', 'nnDE',
    'naturalL', 'naturalCorr',
    'neutralFrac', 'vibration',
    'darkFrac', 'lightFrac',
    'corrLC', 'natDev', 'relCspread',
];

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const std = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

/** Features of a palette given as OKLCH triples. */
export function features(lch) {
    const n = lch.length;
    const Ls = lch.map((c) => c[0]), Cs = lch.map((c) => c[1]);
    const rel = lch.map(([L, C, h]) => { const m = maxChroma(L, h); return m > 1e-4 ? Math.min(1.2, C / m) : 0; });
    const labs = lch.map(oklchToOklab);

    // chroma-weighted hue dispersion: 0 when one hue, 1 when hues cancel
    let sx = 0, sy = 0, sw = 0;
    for (const [, C, h] of lch) { sx += C * Math.cos(h * Math.PI / 180); sy += C * Math.sin(h * Math.PI / 180); sw += C; }
    const hueDisp = sw > 1e-6 ? 1 - Math.hypot(sx, sy) / sw : 0;

    // largest empty arc of the hue circle among chromatic colors
    const hues = lch.filter((c) => c[1] >= NEUTRAL_C).map((c) => c[2]).sort((a, b) => a - b);
    let hueGap = 1;
    if (hues.length >= 2) {
        let g = 360 - hues[hues.length - 1] + hues[0];
        for (let i = 1; i < hues.length; i++) g = Math.max(g, hues[i] - hues[i - 1]);
        hueGap = g / 360;
    }

    let minDE = Infinity, sumDE = 0, pairs = 0, vibration = 0;
    const nn = new Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = deltaE(labs[i], labs[j]);
            minDE = Math.min(minDE, d); sumDE += d; pairs++;
            nn[i] = Math.min(nn[i], d); nn[j] = Math.min(nn[j], d);
            // saturated, opposite hues at equal lightness shimmer against each other
            const dh = Math.abs(((lch[j][2] - lch[i][2]) % 360 + 540) % 360 - 180);
            const opp = Math.max(0, 1 - dh / 60);            // 1 when exactly opposite
            const sameL = Math.max(0, 1 - Math.abs(Ls[i] - Ls[j]) / 0.1);
            vibration = Math.max(vibration, opp * sameL * Math.min(rel[i], rel[j]));
        }
    }
    if (!pairs) minDE = 0;

    // lightness that follows each hue's natural lightness (yellow light, blue dark)
    const chromatic = lch.filter((c) => c[1] >= NEUTRAL_C);
    const nat = chromatic.map((c) => c[0] - cuspLightness(c[2]));
    let naturalCorr = 0;
    if (chromatic.length >= 3) {
        const a = chromatic.map((c) => c[0]), b = chromatic.map((c) => cuspLightness(c[2]));
        const ma = mean(a), mb = mean(b);
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
        naturalCorr = da > 1e-9 && db > 1e-9 ? num / Math.sqrt(da * db) : 0;
    }

    // do the extremes of lightness give up chroma, as paints and screens do?
    let corrLC = 0;
    {
        const ext = Ls.map((L) => Math.abs(L - 0.62)), mr = mean(rel), me = mean(ext);
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < n; i++) { num += (ext[i] - me) * (rel[i] - mr); da += (ext[i] - me) ** 2; db += (rel[i] - mr) ** 2; }
        corrLC = da > 1e-9 && db > 1e-9 ? num / Math.sqrt(da * db) : 0;
    }
    const natDev = chromatic.length ? mean(chromatic.map((c, i) => Math.abs(nat[i]) * Math.min(1, c[1] / 0.12))) : 0;

    return [
        mean(Ls), std(Ls), Math.max(...Ls) - Math.min(...Ls),
        mean(Cs), std(Cs), Math.max(...Cs),
        mean(rel), Math.max(...rel),
        hueDisp, hueGap,
        minDE, pairs ? sumDE / pairs : 0, n ? mean(nn.map((x) => (Number.isFinite(x) ? x : 0))) : 0,
        nat.length ? mean(nat) : 0, naturalCorr,
        lch.filter((c) => c[1] < NEUTRAL_C).length / n,
        vibration,
        Ls.filter((L) => L < 0.35).length / n,
        Ls.filter((L) => L > 0.88).length / n,
        corrLC, natDev, std(rel),
    ];
}

/** Standardized features plus their squares (so the model can prefer a middle). */
export function expand(f, norm) {
    const z = f.map((x, i) => (x - norm.mean[i]) / (norm.std[i] || 1));
    return [...z, ...z.map((x) => x * x - 1)];
}

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function logit(w, b, x) {
    let s = b;
    for (let i = 0; i < x.length; i++) s += w[i] * x[i];
    return s;
}

/**
 * Logistic regression by full-batch gradient descent, pulled toward a prior
 * (w0, b0) with strength lambda. rows: [{x, y, weight}].
 */
export function fitLogistic(rows, { w0, b0 = 0, lambda = 1e-3, steps = 400, lr = 0.5 } = {}) {
    const d = rows[0].x.length;
    const prior = w0 || new Array(d).fill(0);
    const w = prior.slice();
    let b = b0;
    const W = rows.reduce((s, r) => s + (r.weight ?? 1), 0);
    for (let it = 0; it < steps; it++) {
        const gw = new Array(d).fill(0);
        let gb = 0;
        for (const r of rows) {
            const p = sigmoid(logit(w, b, r.x));
            const e = ((p - r.y) * (r.weight ?? 1)) / W;
            for (let i = 0; i < d; i++) gw[i] += e * r.x[i];
            gb += e;
        }
        for (let i = 0; i < d; i++) w[i] -= lr * (gw[i] + lambda * (w[i] - prior[i]));
        b -= lr * (gb + lambda * (b - b0));
    }
    return { w, b };
}

// ---------------- a small network ----------------
// x → tanh(W1 x + b1) → w2 · h + b2. Small enough to train in Node in a few
// seconds and to run thousands of times per suggestion round in the page.

export function hidden(net, x) {
    const H = net.b1.length, d = x.length, h = new Array(H);
    for (let j = 0; j < H; j++) {
        let s = net.b1[j];
        const row = net.W1[j];
        for (let i = 0; i < d; i++) s += row[i] * x[i];
        h[j] = Math.tanh(s);
    }
    return h;
}

export const netLogit = (net, x) => logit(net.w2, net.b2, hidden(net, x));

/** Adam on weighted log loss. rows: [{x, y, weight}] with weights summing to ~1. */
export function trainNet(rows, { H = 24, epochs = 80, batch = 128, lr = 0.01, decay = 1e-4, seed = 7, rand } = {}) {
    let s = seed;
    const rnd = rand || (() => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; });
    const d = rows[0].x.length;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const net = {
        W1: Array.from({ length: H }, () => Array.from({ length: d }, () => gauss() / Math.sqrt(d))),
        b1: new Array(H).fill(0), w2: Array.from({ length: H }, () => gauss() / Math.sqrt(H)), b2: 0,
    };
    const params = [...net.W1, net.b1, net.w2];
    const m = params.map((p) => new Array(p.length).fill(0)), v = params.map((p) => new Array(p.length).fill(0));
    let mb2 = 0, vb2 = 0, t = 0;
    const meanW = rows.reduce((a, r) => a + (r.weight ?? 1), 0) / rows.length;
    const order = rows.map((_, i) => i);
    for (let ep = 0; ep < epochs; ep++) {
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        for (let start = 0; start < order.length; start += batch) {
            const idx = order.slice(start, start + batch);
            const gW1 = net.W1.map((r) => new Array(r.length).fill(0)), gb1 = new Array(H).fill(0), gw2 = new Array(H).fill(0);
            let gb2 = 0;
            for (const k of idx) {
                const r = rows[k], h = hidden(net, r.x);
                const e = (sigmoid(logit(net.w2, net.b2, h)) - r.y) * ((r.weight ?? 1) / meanW) / idx.length;
                for (let j = 0; j < H; j++) {
                    gw2[j] += e * h[j];
                    const g = e * net.w2[j] * (1 - h[j] * h[j]);
                    gb1[j] += g;
                    const row = gW1[j];
                    for (let q = 0; q < d; q++) row[q] += g * r.x[q];
                }
                gb2 += e;
            }
            t++;
            const grads = [...gW1, gb1, gw2];
            const b1c = 1 - 0.9 ** t, b2c = 1 - 0.999 ** t;
            params.forEach((p, pi) => {
                const g = grads[pi], mm = m[pi], vv = v[pi];
                for (let q = 0; q < p.length; q++) {
                    const gq = g[q] + decay * p[q];
                    mm[q] = 0.9 * mm[q] + 0.1 * gq; vv[q] = 0.999 * vv[q] + 0.001 * gq * gq;
                    p[q] -= lr * (mm[q] / b1c) / (Math.sqrt(vv[q] / b2c) + 1e-8);
                }
            });
            mb2 = 0.9 * mb2 + 0.1 * gb2; vb2 = 0.999 * vb2 + 0.001 * gb2 * gb2;
            net.b2 -= lr * (mb2 / b1c) / (Math.sqrt(vb2 / b2c) + 1e-8);
        }
    }
    return net;
}

/**
 * A scorer: the logit of "this looks like a made palette". Personalizing
 * refits only the last layer on the viewer's ♥/✕, held near the base.
 */
export function makeScorer(base) {
    const net = base.net;
    let w2 = net.w2.slice(), b2 = net.b2;
    const x = (lch) => expand(features(lch), base.norm);
    return {
        norm: base.norm,
        score(lch) { return logit(w2, b2, hidden(net, x(lch))); },
        /** Refit toward the viewer's ratings, staying near the base model. */
        personalize(ratings, strength = 1) {
            if (!ratings.length) { w2 = net.w2.slice(); b2 = net.b2; return; }
            const rows = ratings.map((r) => ({ x: hidden(net, x(r.lch)), y: r.like ? 1 : 0, weight: 1 }));
            const fit = fitLogistic(rows, { w0: net.w2, b0: net.b2, lambda: 0.05 / strength, steps: 300, lr: 0.5 });
            w2 = fit.w; b2 = fit.b;
        },
        isPersonal: () => w2.some((w, i) => w !== net.w2[i]),
    };
}
