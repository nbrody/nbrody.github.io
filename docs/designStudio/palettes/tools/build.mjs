// Builds js/corpus.js: the palettes the studio learns from, and the base
// weights of its "does this look made?" model.
//
//   node docs/designStudio/palettes/tools/build.mjs
//
// Sources (data/sources, see data/SOURCES.md for licenses): MetBrewer,
// wesanderson, Sanzo Wada's Dictionary of Color Combinations (via
// mattdesl), COLOURlovers' top 1000 (via nice-color-palettes), plus
// hand-entered design systems, editor themes and sequential maps below.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hexToOklch, maxChroma, gamutMapOklch, oklchToHex, hexToRgb, rgbToHex } from '../js/color.js';
import { features, expand, fitLogistic, sigmoid, logit, FEATURE_NAMES, trainNet, netLogit } from '../js/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'data', 'sources');
const OUT = path.join(here, '..', 'js', 'corpus.js');

// ---------------- deterministic randomness ----------------

function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = mulberry32(20261103);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
function shuffle(xs) {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// ---------------- sources ----------------

const SOURCES = {
    met: { label: 'MetBrewer', note: 'palettes from paintings at the Met, by Blake R. Mills', url: 'https://github.com/BlakeRMills/MetBrewer', license: 'CC0' },
    wes: { label: 'Wes Anderson', note: 'film palettes, by Karthik Ram', url: 'https://github.com/karthik/wesanderson', license: 'MIT' },
    wada: { label: 'Sanzo Wada', note: 'A Dictionary of Color Combinations (1933), digitized by Matt DesLauriers', url: 'https://github.com/mattdesl/dictionary-of-color-combinations', license: 'MIT' },
    lovers: { label: 'COLOURlovers', note: 'the 1000 most-loved palettes, via nice-color-palettes', url: 'https://github.com/Jam3/nice-color-palettes', license: 'MIT (palettes CC BY-NC-SA, COLOURlovers)' },
    design: { label: 'Data & design', note: 'categorical sets built for charts and color-blind readers', url: '', license: 'various, public' },
    themes: { label: 'Editor themes', note: 'accent sets of well-loved code themes', url: '', license: 'various, MIT' },
    seq: { label: 'Sequential maps', note: 'perceptual color maps, sampled', url: '', license: 'CC0 / BSD' },
};

const corpus = [];
const seen = new Set();
function add(source, name, colors, extra = {}) {
    const hex = colors.map((c) => rgbToHex(hexToRgb(c)));
    const key = hex.slice().sort().join('');
    if (hex.length < 2 || seen.has(key)) return;
    seen.add(key);
    corpus.push({ id: `${source}:${name}`, name, source, colors: hex, ...extra });
}

// MetBrewer: Name = list(c("#..", ...), c(order...), colorblind=TRUE)
{
    const R = fs.readFileSync(path.join(SRC, 'metbrewer.R'), 'utf8');
    const re = /^\s*([A-Za-z0-9_]+)\s*=\s*list\(c\(([^)]*)\),\s*c\(([^)]*)\),\s*colorblind\s*=\s*(TRUE|FALSE)\)/gm;
    let m;
    while ((m = re.exec(R))) {
        const colors = [...m[2].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((x) => x[1]);
        const order = m[3].split(',').map((s) => parseInt(s, 10) - 1);
        add('met', m[1], colors, { order, colorblind: m[4] === 'TRUE' });
    }
}

// wesanderson: Name = c("#..", ...)
{
    const R = fs.readFileSync(path.join(SRC, 'wes.R'), 'utf8');
    const block = R.slice(R.indexOf('wes_palettes <- list('), R.indexOf(')\n\n'));
    for (const m of block.matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*c\(([^)]*)\)/gm)) {
        if (/Continuous/.test(m[1])) continue;
        add('wes', m[1].replace(/(\D)(\d)$/, '$1 $2'), [...m[2].matchAll(/"(#[0-9a-fA-F]{6})"/g)].map((x) => x[1]));
    }
}

// Sanzo Wada: each color lists the combinations it belongs to
{
    const colors = JSON.parse(fs.readFileSync(path.join(SRC, 'wada.json'), 'utf8'));
    const combos = new Map();
    for (const c of colors) for (const id of c.combinations) {
        if (!combos.has(id)) combos.set(id, []);
        combos.get(id).push(c);
    }
    for (const [id, cs] of [...combos.entries()].sort((a, b) => a[0] - b[0])) {
        add('wada', `No. ${id}`, cs.map((c) => c.hex), { names: cs.map((c) => c.name) });
    }
}

// COLOURlovers top 1000
{
    const pals = JSON.parse(fs.readFileSync(path.join(SRC, 'nice1000.json'), 'utf8'));
    pals.forEach((p, i) => add('lovers', `#${i + 1}`, p));
}

// Hand-entered: values from each project's published definition.
const HAND = {
    design: {
        'Okabe–Ito': ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
        'Tol bright': ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'],
        'Tol vibrant': ['#EE7733', '#0077BB', '#33BBEE', '#EE3377', '#CC3311', '#009988', '#BBBBBB'],
        'Tol muted': ['#CC6677', '#332288', '#DDCC77', '#117733', '#88CCEE', '#882255', '#44AA99', '#999933', '#AA4499'],
        'Tol light': ['#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD'],
        'Tableau 10': ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'],
        'Observable 10': ['#4269d0', '#efb118', '#ff725c', '#6cc5b0', '#3ca951', '#ff8ab7', '#a463f2', '#97bbf5', '#9c6b4e', '#9498a0'],
        'Category 10': ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'],
        'Brewer Set1': ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
        'Brewer Set2': ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
        'Brewer Set3': ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd', '#ccebc5', '#ffed6f'],
        'Brewer Dark2': ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
        'Brewer Pastel1': ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
        'Brewer Pastel2': ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
        'Brewer Accent': ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'],
        'Brewer Paired': ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'],
        'IBM accessible': ['#648FFF', '#785EF0', '#DC267F', '#FE6100', '#FFB000'],
        'Flexoki 400': ['#D14D41', '#DA702C', '#D0A215', '#879A39', '#3AA99F', '#4385BE', '#8B7EC8', '#CE5D97'],
        'Flexoki 600': ['#AF3029', '#BC5215', '#AD8301', '#66800B', '#24837B', '#205EA6', '#5E409D', '#A02F6F'],
    },
    themes: {
        'Nord': ['#BF616A', '#D08770', '#EBCB8B', '#A3BE8C', '#B48EAD', '#8FBCBB', '#88C0D0', '#81A1C1', '#5E81AC'],
        'Solarized': ['#b58900', '#cb4b16', '#dc322f', '#d33682', '#6c71c4', '#268bd2', '#2aa198', '#859900'],
        'Catppuccin Mocha': ['#f5e0dc', '#f2cdcd', '#f5c2e7', '#cba6f7', '#f38ba8', '#eba0ac', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa', '#b4befe'],
        'Catppuccin Latte': ['#dc8a78', '#dd7878', '#ea76cb', '#8839ef', '#d20f39', '#e64553', '#fe640b', '#df8e1d', '#40a02b', '#179299', '#04a5e5', '#209fb5', '#1e66f5', '#7287fd'],
        'Gruvbox': ['#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#d65d0e'],
        'Gruvbox bright': ['#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#fe8019'],
        'Dracula': ['#8be9fd', '#50fa7b', '#ffb86c', '#ff79c6', '#bd93f9', '#ff5555', '#f1fa8c'],
        'Rosé Pine': ['#eb6f92', '#f6c177', '#ebbcba', '#31748f', '#9ccfd8', '#c4a7e7'],
        'Rosé Pine Dawn': ['#b4637a', '#ea9d34', '#d7827e', '#286983', '#56949f', '#907aa9'],
        'Tokyo Night': ['#7aa2f7', '#bb9af7', '#7dcfff', '#9ece6a', '#e0af68', '#f7768e', '#ff9e64', '#2ac3de', '#73daca'],
        'Kanagawa': ['#C34043', '#76946A', '#C0A36E', '#7E9CD8', '#957FB8', '#6A9589', '#E46876', '#98BB6C', '#E6C384', '#7FB4CA', '#938AA9', '#7AA89F', '#FFA066', '#D27E99'],
        'Everforest': ['#e67e80', '#e69875', '#dbbc7f', '#a7c080', '#83c092', '#7fbbb3', '#d699b6'],
        'One Dark': ['#e06c75', '#d19a66', '#e5c07b', '#98c379', '#56b6c2', '#61afef', '#c678dd'],
        'Monokai': ['#f92672', '#fd971f', '#e6db74', '#a6e22e', '#66d9ef', '#ae81ff'],
    },
    seq: {
        'Viridis': ['#440154', '#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'],
        'Magma': ['#000004', '#221150', '#5f187f', '#982d80', '#d3436e', '#f8765c', '#febb81', '#fcfdbf'],
        'Inferno': ['#000004', '#280b54', '#65156e', '#9f2a63', '#d44842', '#f57d15', '#fac127', '#fcffa4'],
        'Plasma': ['#0d0887', '#5302a3', '#8b0aa5', '#b83289', '#db5c68', '#f48849', '#febd2a', '#f0f921'],
        'Cividis': ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#fee838'],
    },
};
for (const [source, pals] of Object.entries(HAND)) for (const [name, colors] of Object.entries(pals)) add(source, name, colors);

// ---------------- training data ----------------

const toLch = (hexes) => hexes.map(hexToOklch);
const SIZE_CHOICES = [3, 4, 5, 5, 6, 6, 7, 8];
const sourceWeight = { met: 1, wes: 0.6, wada: 1, lovers: 1, design: 0.8, themes: 0.6, seq: 0.25 };
const perSource = {};
for (const p of corpus) perSource[p.source] = (perSource[p.source] || 0) + 1;

function subsetLch(p, n) {
    const idx = shuffle(p.colors.map((_, i) => i)).slice(0, n);
    return idx.map((i) => hexToOklch(p.colors[i]));
}

const positives = [];
for (const p of corpus) {
    if (p.colors.length < 3) continue;
    const reps = p.colors.length >= 6 ? 4 : 2;
    for (let r = 0; r < reps; r++) {
        const n = Math.min(p.colors.length, pick(SIZE_CHOICES));
        if (n < 3) continue;
        positives.push({ lch: subsetLch(p, n), weight: sourceWeight[p.source] / perSource[p.source], kind: p.source });
    }
}
const posW = positives.reduce((s, r) => s + r.weight, 0);
positives.forEach((r) => { r.weight /= posW; });

const randomSize = () => pick(SIZE_CHOICES);
const randomOklch = () => { const L = 0.2 + 0.78 * rand(), h = 360 * rand(); return [L, maxChroma(L, h) * rand(), h]; };
const NEG = {
    rgb: () => Array.from({ length: randomSize() }, () => hexToOklch(rgbToHex([rand(), rand(), rand()]))),
    oklch: () => Array.from({ length: randomSize() }, randomOklch),
    cosine: () => {
        // Inigo Quilez cosine palettes, as poincare's presets sample them
        const n = randomSize(), f = 0.3 + 0.8 * rand(), d = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
        const golden = rand() < 0.5;
        return Array.from({ length: n }, (_, k) => {
            const t = golden ? (k * 0.618034 + 0.13) % 1 : k / n;
            const x = t * 2 * Math.PI * Math.max(1, f * 2.2);
            return hexToOklch(rgbToHex(d.map((o) => 0.5 + 0.5 * Math.cos(x + o))));
        });
    },
    shuffledL: () => {
        const p = pick(corpus.filter((q) => q.colors.length >= 4));
        const lch = subsetLch(p, Math.min(p.colors.length, randomSize()));
        const Ls = shuffle(lch.map((c) => c[0]));
        return lch.map(([, C, h], i) => gamutMapOklch([Ls[i], C, h]));
    },
    randomHue: () => {
        const p = pick(corpus.filter((q) => q.colors.length >= 4));
        return subsetLch(p, Math.min(p.colors.length, randomSize())).map(([L, C]) => gamutMapOklch([L, C, 360 * rand()]));
    },
    maxChroma: () => {
        const p = pick(corpus.filter((q) => q.colors.length >= 4));
        return subsetLch(p, Math.min(p.colors.length, randomSize())).map(([L, , h]) => [L, maxChroma(L, h) * 0.98, h]);
    },
};
const negMix = { rgb: 0.2, oklch: 0.2, cosine: 0.15, shuffledL: 0.15, randomHue: 0.15, maxChroma: 0.15 };
const negatives = [];
const NNEG = positives.length;
for (const [kind, frac] of Object.entries(negMix)) {
    const n = Math.round(NNEG * frac);
    for (let i = 0; i < n; i++) negatives.push({ lch: NEG[kind](), weight: frac / n, kind });
}

// ---------------- fit ----------------

const raw = [...positives.map((r) => ({ ...r, y: 1 })), ...negatives.map((r) => ({ ...r, y: 0 }))]
    .map((r) => ({ ...r, f: features(r.lch) }));
const d = FEATURE_NAMES.length;
const norm = { mean: new Array(d).fill(0), std: new Array(d).fill(0) };
for (const r of raw) r.f.forEach((x, i) => { norm.mean[i] += x / raw.length; });
for (const r of raw) r.f.forEach((x, i) => { norm.std[i] += (x - norm.mean[i]) ** 2 / raw.length; });
norm.std = norm.std.map((v) => Math.sqrt(v) || 1);

const rows = shuffle(raw).map((r) => ({ x: expand(r.f, norm), y: r.y, weight: r.weight, kind: r.kind }));
const cut = Math.floor(rows.length * 0.8);
const train = rows.slice(0, cut), test = rows.slice(cut);

function report(f, set, label) {
    const byKind = {};
    for (const r of set) {
        const p = sigmoid(f(r.x));
        const ok = (p > 0.5) === (r.y === 1);
        (byKind[r.kind] ||= [0, 0])[0] += ok ? 1 : 0;
        byKind[r.kind][1]++;
    }
    const all = Object.values(byKind).reduce((s, [a, b]) => [s[0] + a, s[1] + b], [0, 0]);
    console.log(`${label}: ${(100 * all[0] / all[1]).toFixed(1)}% correct`);
    for (const [k, [a, b]] of Object.entries(byKind)) console.log(`   ${k.padEnd(10)} ${(100 * a / b).toFixed(1)}%  (${b})`);
}

let t0 = Date.now();
const lin = fitLogistic(train, { lambda: 2e-3, steps: 1500, lr: 0.8 });
console.log(`linear: trained in ${Date.now() - t0} ms`);
report((x) => logit(lin.w, lin.b, x), test, 'linear, held out');

t0 = Date.now();
const net = trainNet(train, { H: 24, epochs: 90, rand });
console.log(`network: trained in ${Date.now() - t0} ms`);
report((x) => netLogit(net, x), test, 'network, held out');
const finalNet = trainNet(rows, { H: 24, epochs: 90, rand });

// ---------------- write ----------------

const round = (x, k = 4) => Math.round(x * 10 ** k) / 10 ** k;
const out = `// Generated by tools/build.mjs on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.
// ${corpus.length} palettes; sources and licenses in data/SOURCES.md.

export const SOURCES = ${JSON.stringify(SOURCES, null, 1)};

export const MODEL = ${JSON.stringify({
    norm: { mean: norm.mean.map((x) => round(x, 5)), std: norm.std.map((x) => round(x, 5)) },
    net: { W1: finalNet.W1.map((r) => r.map((x) => round(x))), b1: finalNet.b1.map((x) => round(x)), w2: finalNet.w2.map((x) => round(x)), b2: round(finalNet.b2) },
})};

export const CORPUS = [
${corpus.map((p) => '  ' + JSON.stringify(p)).join(',\n')}
];
`;
fs.writeFileSync(OUT, out);
const counts = Object.entries(perSource).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${corpus.length} palettes (${counts}), ${(out.length / 1024).toFixed(0)} KB`);
