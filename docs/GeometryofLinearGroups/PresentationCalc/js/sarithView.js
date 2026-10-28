/**
 * sarithView.js — step 3 (arithmetic) as HTML: FlashBeam in the adelic product live, then
 * its Dirichlet generators and relations, the covering certificate, and the
 * check of the vertex stabilizer at ∞.
 *
 * S (the page's run.sarith) = {
 *   phase: 'search' | 'stab' | 'done' | 'na', note, error,
 *   places: [{ p, index, q, primeTex }], notes,
 *   progress: { stats, reps, targets, covered, links }, history: [{ it, frac }],
 *   result: the worker's 'done' message, arch: { kind, root, n } | null,
 *   stab: { status: 'running' | 'yes' | 'no' | 'none', summary, used },
 *   status: 'running' | 'yes' | 'open', head,
 *   lattice: { kind: 'arith' | 'thin' | 'open', lines } when Γ is discrete at a place (no search)
 * }
 */
import { esc, tex, mix } from './zariskiView.js';

/** TeX rendered now (for SVG labels, which are patched in without a typesetting pass), or the source as text. */
const ktx = (t) => (typeof window !== 'undefined' && window.katex ? window.katex.renderToString(t, { throwOnError: false }) : esc(t));
/**
 * A KaTeX label in an SVG, anchored at (x, y) like an SVG text: anchor 'start' | 'middle' | 'end',
 * y the baseline. A foreignObject box of w × h user units holds it.
 */
function svgTex(x, y, t, { anchor = 'start', cls = '', w = 200, h = 24 } = {}) {
    const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    const justify = anchor === 'end' ? 'flex-end' : anchor === 'middle' ? 'center' : 'flex-start';
    return `<foreignObject x="${x0.toFixed(1)}" y="${(y - h + 6).toFixed(1)}" width="${w}" height="${h}"${cls ? ` class="${cls}"` : ''}><div xmlns="http://www.w3.org/1999/xhtml" class="svg-tex" style="justify-content:${justify}">${ktx(t)}</div></foreignObject>`;
}
import { powerReduce } from './presentation.js';

const SUBS = '₀₁₂₃₄₅₆₇₈₉', SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const subN = (n) => String(n).split('').map((c) => SUBS[+c]).join('');
const supN = (n) => String(n).split('').map((c) => (c === '-' ? '⁻' : SUPS[+c])).join('');

/** g₁g₂⁻¹g₁³ … with runs collapsed into powers. */
export function wordText(w, max = 400) {
    if (!w.length) return 'e';
    const parts = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const e = (j - i) * Math.sign(w[i]);
        parts.push(`g${subN(Math.abs(w[i]))}${e === 1 ? '' : supN(e)}`);
        i = j;
    }
    const s = parts.join('');
    return s.length > max ? `${s.slice(0, max)}… (${w.length} letters)` : s;
}

/** The trees, for headings: T_{q+1} at 𝔭. */
export function placeTex(pl, degree) {
    const name = degree > 1 && pl.primeTex ? pl.primeTex : pl.p;
    return `T_{${pl.q + 1}} \\text{ at } ${name}`;
}

/** The link of a representative in one tree: the parent on top, the q children below. */
function star(states) {
    const n = states.length, R = 34, c = 44;
    let s = `<svg viewBox="0 0 88 88" aria-hidden="true">`;
    states.forEach((st, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
        const x = c + R * Math.cos(a), y = c + R * Math.sin(a);
        const cls = ['self', 'other', 'rep'].includes(st) ? `st-${st}` : 'st-open';
        s += `<line class="${cls}" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke-opacity="${cls === 'st-open' ? 0.35 : 0.8}" stroke-width="1.6"/>`;
        s += `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n > 20 ? 2.4 : 3.4}" stroke-width="1.2"/>`;
    });
    return s + `<circle class="st-center" cx="${c}" cy="${c}" r="5"/></svg>`;
}

function chart(history) {
    if (history.length < 2 || history[history.length - 1].it <= history[0].it) return '';
    const W = 600, H = 90, last = history[history.length - 1].it || 1;
    const pts = history.map((h) => `${(W * h.it / last).toFixed(1)},${(H - 6 - (H - 12) * h.frac).toFixed(1)}`).join(' ');
    const reps = history.filter((h, i) => i && h.reps !== history[i - 1].reps)
        .map((h) => `<line class="promo" x1="${(W * h.it / last).toFixed(1)}" y1="4" x2="${(W * h.it / last).toFixed(1)}" y2="${H - 4}" stroke-dasharray="3 3"/>`).join('');
    return `<svg class="cov-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Neighbours covered, by iteration">
        <line class="axis" x1="0" y1="${H - 6}" x2="${W}" y2="${H - 6}"/>
        ${reps}<polyline class="curve" points="${pts}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function stat(k, v, id) { return `<div class="cov-stat"><span class="k">${k}</span><span class="v"${id ? ` id="${id}"` : ''}>${v}</span></div>`; }

/** The live numbers (also patched in place between full renders). */
export function liveNumbers(S) {
    const p = S.progress, r = S.result;
    const covered = r ? r.covered : p ? p.covered : 0;
    const targets = r ? r.targets : p ? p.targets : 0;
    return {
        it: r ? r.iterations : p ? p.stats.iteration : 0,
        visited: r ? r.visited : p ? p.stats.visited : 0,
        reps: r ? r.reps.length : p ? p.reps : 1,
        covered, targets, frac: targets ? covered / targets : 0,
    };
}

/** The adelic product, as TeX: H² or H³ for each place at ∞, a tree for each prime. */
export function spaceTex(S, model) {
    const parts = (S.archFactors || []).map((a, i, all) => `\\mathbb{H}^{${a.kind === 'real' ? 2 : 3}}${all.length > 1 ? `_{${a.labelTex || `\\sigma_{${a.n}}`}}` : ''}`);
    for (const pl of S.places || []) parts.push(placeTex(pl, model.degree));
    return parts.length ? parts.join(' \\times ') : '\\{\\mathrm{pt}\\}';
}

/** Orbit points found: Dirichlet generators in colour, the rest grey. */
function scatter(points, weights, nArch, archNames = ['\\sigma_1', '\\sigma_2']) {
    if (!points || points.length < 2) return '';
    const nTree = weights.length;
    const treeL2 = (p) => Math.sqrt(p.tree.reduce((acc, d, i) => acc + (weights[i] * d) ** 2, 0));
    // axis labels in TeX
    let fx, fy, xl, yl;
    if (nArch && nTree) { fx = (p) => p.arch[0]; fy = treeL2; xl = 'd \\text{ at } \\infty'; yl = 'd \\text{ in the trees}'; }
    else if (nArch >= 2) { fx = (p) => p.arch[0]; fy = (p) => p.arch[1]; xl = `d \\text{ at } ${archNames[0]}`; yl = `d \\text{ at } ${archNames[1]}`; }
    else if (nTree >= 2) { fx = (p) => weights[0] * p.tree[0]; fy = (p) => Math.sqrt(p.tree.slice(1).reduce((acc, d, i) => acc + (weights[i + 1] * d) ** 2, 0)); xl = 'd \\text{ in the first tree}'; yl = 'd \\text{ in the others}'; }
    else { fx = (p) => p.h; fy = (p, i) => (i * 0.618) % 1; xl = 'd(o, g\\cdot o)'; yl = ''; }
    const pts = points.map((p, i) => ({ x: fx(p, i), y: fy(p, i), a: p.active }));
    const X = Math.max(1e-9, ...pts.map((p) => p.x)), Y = Math.max(1e-9, ...pts.map((p) => p.y));
    const W = 560, H = 220, m = 30;
    const sx = (x) => m + (W - 2 * m) * x / X, sy = (y) => H - m - (H - 2 * m) * y / Y;
    let svg = `<svg class="dir-scatter" viewBox="0 0 ${W} ${H}" aria-label="Orbit points found">`;
    svg += `<line class="axis" x1="${m}" y1="${H - m}" x2="${W - m}" y2="${H - m}"/><line class="axis" x1="${m}" y1="${m}" x2="${m}" y2="${H - m}"/>`;
    svg += svgTex(W - m, H - 7, `${xl} \\;\\rightarrow`, { anchor: 'end', cls: 'lbl' });
    if (yl) svg += svgTex(m + 4, m - 8, `\\uparrow\\; ${yl}`, { cls: 'lbl' });
    for (const p of pts.filter((q) => !q.a)) svg += `<circle class="pt" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.2"/>`;
    for (const p of pts.filter((q) => q.a)) svg += `<circle class="gen" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4"/>`;
    return svg + '</svg>';
}

/** GAP input for ⟨g₁, …, g_n | relators⟩. */
export function gapText(n, rels) {
    const gens = Array.from({ length: n }, (_, i) => `"g${i + 1}"`).join(', ');
    const word = (w) => w.map((x) => `g${Math.abs(x)}${x < 0 ? '^-1' : ''}`).join('*');
    return `F := FreeGroup(${gens});; AssignGeneratorVariables(F);;\nG := F / [ ${rels.map(word).join(', ')} ];`;
}

/** g_{1}^{2}g_{2}^{-1} in TeX, runs as powers; long words cut with ⋯ and their length. */
export function wordTexG(w, maxParts = 40) {
    if (!w || !w.length) return 'e';
    const parts = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const e = (j - i) * Math.sign(w[i]);
        parts.push(`g_{${Math.abs(w[i])}}${e === 1 ? '' : `^{${e}}`}`);
        i = j;
    }
    return parts.length > maxParts ? `${parts.slice(0, maxParts).join('')}\\cdots\\ (\\text{${w.length} letters})` : parts.join('');
}
const wordCell = (w, maxParts) => `\\(${wordTexG(w, maxParts)}\\)`;
/** A list of TeX sentences (text with $…$), or one string, as lines. */
const linesOf = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const banner = (status, lines) => `<div class="banner lines" data-status="${status}"><span class="dot"></span><div>${linesOf(lines).map((l) => `<p>${mix(l)}</p>`).join('')}</div></div>`;
const para = (sentences, cls = 'note') => `<p class="${cls}">${mix(sentences.join(' '))}</p>`;
const RING_TEX = { 1: '\\mathbb{Z}[i]', 2: '\\mathbb{Z}[\\sqrt{-2}]', 3: '\\mathbb{Z}[\\omega]' };
const repName = (i) => (i === 0 ? 'o' : `r_{${i}}`);
/** An element of the ring d, written in its generator w (bianchi.js), in TeX. */
const ringElt = (d, x) => String(x).replace(/−/g, '-').replace(/(\d)w/g, `$1${{ 1: 'i', 2: '\\sqrt{-2}', 3: '\\omega' }[d]}`).replace(/w/g, { 1: 'i', 2: '\\sqrt{-2}', 3: '\\omega' }[d]);

/**
 * When Γ = Λ (index 1): Λ's generators in terms of Γ's, from coset enumeration with labels (the
 * modified Todd–Coxeter of felsch.js). kind 'Q': letters a, b, c, w_q with integer matrices; 'O': the
 * generators p_i of the Voronoi presentation of PGL₂(O_k), matrices in TeX.
 */
const msText = (ms) => (ms == null ? '?' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
function expressHtml(X, kind) {
    if (!X) return '';
    if (X.error) return para([`Writing the generators of $\\Lambda$ in terms of those of $\\Gamma$ did not finish: ${String(X.error).replace(/\$/g, '')}.`]);
    const C = X.conjugator;
    const Ctex = !C ? '' : kind === 'Q' ? `\\begin{pmatrix} ${C[0]} & ${C[1]} \\\\ ${C[2]} & ${C[3]} \\end{pmatrix}` : `\\begin{pmatrix} ${C[0][0]} & ${C[0][1]} \\\\ ${C[1][0]} & ${C[1][1]} \\end{pmatrix}`;
    const name = (L, k) => (kind === 'Q' ? L.name : `p_{${k + 1}}`);
    const mat = (L) => (kind === 'Q' ? `\\begin{pmatrix} ${L.matrix[0]} & ${L.matrix[1]} \\\\ ${L.matrix[2]} & ${L.matrix[3]} \\end{pmatrix}` : L.matrix);
    const items = X.letters.map((L, k) => {
        const lhs = C ? `C\\,${name(L, k)}\\,C^{-1}` : name(L, k);
        return `<li>${mix(`$${lhs} = ${mat(L)} = ${L.word ? wordTexG(L.word, 60) : '\\text{(too long to write out)}'}$`)}</li>`;
    }).join('');
    return `<h3>${mix('The generators of $\\Lambda$ in terms of $\\Gamma$')}</h3>`
        + para([
            'Coset enumeration with labels (the modified Todd–Coxeter algorithm) keeps, next to each entry $c \\cdot x = d$ of the table, a word $L$ in the generators of $\\Gamma$ with $t_c x = L\\, t_d$.',
            `With one coset, every generator $x$ of $\\Lambda$ satisfies $x = L(0, x)$${C ? `; here $\\Gamma$ was first conjugated by $C = ${Ctex}$` : ''}.`,
            'Each word was then shortened inside $\\Gamma$ and checked by multiplying it out.',
        ])
        + `<ul class="express-list">${items}</ul>`;
}

export function sarithCard(S, model, nGens) {
    let html = '<div class="vc-inner">';
    // Γ discrete at a place: whether it is a lattice there (main.js, discreteArith), one sentence per line
    if (S.lattice) return html + banner(S.status === 'yes' ? 'yes' : 'open', S.lattice.lines) + '</div>';
    if (S.exact && S.exact.index) {
        const E = S.exact;
        if (E.quaternion) {
            const sub = E.kernelIndex > 1 ? 'K' : '\\Gamma', overQ = (E.k || 1) === 1;
            const trees = (E.letters || []).map((d) => `T_{${d}}`).join(' \\times ');
            const ram = (E.ramified || []).map((p) => `$${p}$`);
            const where = overQ ? '$\\mathbb{Q}$' : 'the totally real field $k$';
            const ramText = overQ ? `ramified at ${ram.length ? `${ram.join(', ')} and ` : ''}$\\infty$` : `ramified at ${ram.length ? `the primes above ${ram.join(', ')} and at ` : ''}every infinite place`;
            const geo = E.definite === false
                ? (E.place === 'real' ? { H: '\\mathbb{H}^2', what: 'Fuchsian', size: 'area' } : { H: '\\mathbb{H}^3', what: 'Kleinian', size: 'volume' })
                : null;
            // geo: the infinite places other than v (complex places never ramify, so they are all real and ramified)
            const others = (E.k || 1) - (E.place === 'complex' ? 2 : 1);
            const atRam = ram.length ? (overQ ? ram.join(', ') : `the primes above ${ram.join(', ')}`) : '';
            const orbits = E.reps === 1
                ? (geo ? `$\\Lambda$ is transitive on the vertices of $X = ${trees}$.` : `$\\Lambda$ is transitive on the vertices of $X = ${trees}$, with stabilizer $U = N(\\mathcal{O})/k^\\times$ of order $${E.stabilizers[0]}$.`)
                : `$\\Lambda$ has $${E.reps}$ orbits on the vertices of $X = ${trees}$ (found by walking out from $\\mathcal{O}$${geo ? ', and by strong approximation for the norm-one group' : ' and testing each new vertex against the earlier ones'})${geo ? '' : `, with stabilizers of orders ${E.stabilizers.map((u) => `$${u}$`).join(', ')}`}.`;
            const sentences = geo
                ? [
                    `${others > 0
                        ? `$A$ splits at exactly one place $v$ at $\\infty$ (${E.place}), and is ramified at the other infinite places${atRam ? ` and at ${atRam}` : ''}`
                        : `$A$ splits at the only infinite place $v$ of $k$ (${E.place})${atRam ? `, and is ramified at ${atRam}` : ''}`}; $\\Gamma$ is bounded at every prime outside $S$.`,
                    E.kernelIndex > 1
                        ? `The elements of $\\Gamma$ whose reduced norms have even valuations outside $S$ form a subgroup $K$ of index $${E.kernelIndex}$, and $K$ lies in $\\Lambda = N(\\mathcal{O}[1/S])/k^\\times$ for a maximal order $\\mathcal{O}$ of $A$.`
                        : '$\\Gamma$ lies in $\\Lambda = N(\\mathcal{O}[1/S])/k^\\times$ for a maximal order $\\mathcal{O}$ of $A$: the order $\\Gamma$ generates, enlarged one prime at a time.',
                    orbits,
                    `The stabilizer of a vertex is the ${geo.what} group $U = N(\\mathcal{O})/k^\\times$, a lattice in $\\mathrm{PGL}_2(k_v)$. Its presentation comes from a Dirichlet domain in $${geo.H}$ (Poincaré's theorem, in the poincare engine), built from the elements of $U$ moving the centre of $\\mathcal{O}$ least, until its ${geo.size} equals Borel's covolume of $U$, $${(E.covols && E.covols[0] != null ? E.covols[0].toFixed(6) : '?')}$ (${(E.stabGens || [])[0]} side pairings). Its relators were checked again exactly, and an element of $U$ is written in the side pairings by folding it back into the domain.`,
                    `With a letter for each edge at each representative (${E.gens} generators), and ${E.relators} relators: the stabilizers' relators, how they move the letters, the edge inversions, and the squares of $X$. Each relator was checked by multiplying it out.`,
                    `Each generator of $${sub}$ is written in it by walking from $\\mathcal{O}$ towards its image, one closer vertex at a time, and Todd–Coxeter (Felsch's strategy) enumerates the cosets.`,
                ]
                : [
                    `$A$ is a totally definite quaternion algebra over ${where}, ${ramText}, and $\\Gamma$ is bounded at every prime outside $S$.`,
                    E.kernelIndex > 1
                        ? `The elements of $\\Gamma$ whose reduced norms have even valuations outside $S$ form a subgroup $K$ of index $${E.kernelIndex}$, and $K$ lies in $\\Lambda = N(\\mathcal{O}[1/S])/k^\\times$ for a maximal order $\\mathcal{O}$ of $A$.`
                        : '$\\Gamma$ lies in $\\Lambda = N(\\mathcal{O}[1/S])/k^\\times$ for a maximal order $\\mathcal{O}$ of $A$: the order $\\Gamma$ generates, enlarged one prime at a time.',
                    orbits,
                    'The stabilizers, and the elements carrying one vertex to another, come from exhaustive searches for elements of given reduced norm (Fincke–Pohst on $\\mathrm{Tr}_{k/\\mathbb{Q}}\\,\\mathrm{nrd}$, which is positive definite).',
                    `Since $X$ is simply connected, this gives a presentation of $\\Lambda$ on the stabilizers and a letter for each edge at each representative (${E.gens} generators), with ${E.relators} relators: the stabilizers' multiplication, how they move the letters, the edge inversions, and the squares of $X$. Each relator was checked by multiplying it out.`,
                    `Each generator of $${sub}$ is written in it by walking from $\\mathcal{O}$ towards its image, one closer vertex at a time, and Todd–Coxeter (Felsch's strategy) enumerates the cosets.`,
                ];
            html += para(sentences, 'lead');
            html += banner('yes', S.head);
            const lines = [`The coset table has $${E.index}$ cosets, and it was checked again: every relator of $\\Lambda$ and every generator of $${sub}$ closes up.`, `This took ${E.tcMs} ms, and building $\\Lambda$ ${E.buildMs} ms.`];
            if (E.level && E.level.N !== '1') lines.push(`$\\Lambda$ acts on $\\mathcal{O}/N\\mathcal{O}$ by conjugation. Modulo $N = ${E.level.N}$ the $${E.index}$ cosets have $${E.index}$ distinct images, so $${sub}$ contains the kernel $\\Lambda(${E.level.N})$: it is a congruence subgroup of level $${E.level.N}$, the smallest of the levels tried (${E.congMs} ms).`);
            else if (E.index === 1) lines.push(`So $${sub} = \\Lambda$.`);
            else if (E.levelTried && E.levelTried.length) lines.push(`No congruence level was found: modulo ${E.levelTried.filter((t) => typeof t.index === 'number').map((t) => `$${t.N}$ the images give index $${t.index}$`).join(', ') || 'the levels tried, the images were too large'}${E.levelStopped ? ', before the time ran out' : ''}.`);
            html += para(lines);
            return html + '</div>';
        }
        if (E.numberRing) {
            html += para([
                '$\\Gamma$ is bounded at every prime, so it fixes a vertex of every Bruhat–Tits tree (its elements with determinants of even valuation do), and it lies in a conjugate of $\\mathrm{PGL}_2(\\mathcal{O}_k)$: the stabilizer of a lattice $L \\subset k^2$.',
                `The perfect binary forms over $\\mathcal{O}_k$ (Voronoi's algorithm, after Koecher) give a cell decomposition of the symmetric space on which $\\mathrm{GL}_2(\\mathcal{O}_k)$ acts with ${E.cells} orbit${E.cells === 1 ? '' : 's'} of top cells; Brown's theorem turns it into a presentation (as in the Arithmetic tool Presentations of $\\mathrm{PGL}_2(\\mathcal{O}_k)$), with every relator checked by multiplying it out.`,
                'Each generator is written in it by walking from a cell to its image, one facet at a time, and Todd–Coxeter (Felsch’s strategy) enumerates the cosets.',
            ], 'lead');
            html += banner('yes', S.head);
            html += para([`The coset table has $${E.index}$ coset${E.index === 1 ? '' : 's'}, and it was checked again: every relator and every subgroup generator closes up.`, `Building the presentation took ${msText(E.presentationMs)}, writing the generators and enumerating the cosets ${msText(E.ms)}.`]);
            html += expressHtml(E.express, 'O');
            return html + '</div>';
        }
        if (E.ring) {
            html += para([
                `Over $\\mathcal{O} = ${RING_TEX[E.ring]}$, every determinant is a unit times a product of the primes in $S$, so $\\Gamma \\le \\Lambda = \\mathrm{PGL}_2(\\mathcal{O}[1/S])$.`,
                'By Bass–Serre theory, $\\Lambda$ is an iterated amalgam of the Bianchi group $\\mathrm{PGL}_2(\\mathcal{O})$ with $\\Gamma_0(\\pi)$ along the tree at each $\\pi \\in S$.',
                'Built on Poincaré’s presentation of $\\mathrm{PGL}_2(\\mathcal{O})$, this gives a presentation of $\\Lambda$.',
                'Each generator of $\\Gamma$ is written in it by walking back along the trees, and Todd–Coxeter enumerates the cosets of $\\Gamma$.',
            ], 'lead');
        } else {
            const Sx = E.S.join('\\cdot ');
            html += para([
                E.kernelIndex > 1
                    ? `The elements of $\\Gamma$ whose determinants have even valuations outside $S$ lie, after a conjugation, in $\\Lambda = \\mathrm{PGL}_2(\\mathbb{Z}[1/${Sx}])$.`
                    : `Every determinant is a product of primes in $S$, so $\\Gamma \\le \\Lambda = \\mathrm{PGL}_2(\\mathbb{Z}[1/${Sx}])$.`,
                'By Bass–Serre theory, $\\Lambda$ is an iterated amalgam: for each $q \\in S$, $\\Lambda_{S\' \\cup \\{q\\}} = \\Lambda_{S\'} \\ast_{\\Gamma_0(q)} \\langle \\Gamma_0(q), w_q \\rangle$, where $w_q = \\left(\\begin{smallmatrix}0&1\\\\q&0\\end{smallmatrix}\\right)$.',
                'This gives a presentation of $\\Lambda$ on the reflections of $\\mathrm{PGL}_2(\\mathbb{Z})$ and the $w_q$.',
                'Each generator of $\\Gamma$ is written in it by walking back along the trees, and Todd–Coxeter enumerates the cosets of $\\Gamma$.',
            ], 'lead');
        }
        html += banner('yes', S.head);
        html += para([`The coset table has $${E.index}$ coset${E.index === 1 ? '' : 's'}, and it was checked again: every relator of $\\Lambda$ and every generator of $\\Gamma$ closes up.`, `This took ${E.ms} ms.`]);
        if (!E.ring) html += expressHtml(E.express, 'Q');
        return html + '</div>';
    }
    if (S.phase === 'na') return html + banner('open', S.note) + '</div>';
    const r = S.result;
    // the cusp certificate, found before any search
    if (S.cusp && !r) {
        html += para([
            'The quaternion algebra $A$ splits over the field of definition, and $\\mathcal{O}_S$ has infinitely many units.',
            'Then a full lattice of unipotents of $\\Gamma$ at one cusp makes $\\Gamma$ arithmetic, by Vaserstein’s theorem.',
        ], 'lead');
        return html + banner('yes', S.head) + '</div>';
    }
    const trees = (S.places || []).length > 0;
    const metric = S.metric === 'unit' ? 'in which a tree edge has length $1$, as in the $\\mathrm{SO}(3)$ project' : 'in which a tree edge has length $\\log q$';
    html += para([
        `$\\Gamma$ is discrete in the product of $\\mathrm{PGL}_2$ over the places where it is unbounded, and it acts on $X = ${spaceTex(S, model)}$ with the $\\ell^2$ product metric, ${metric}.`,
        'FlashBeam multiplies a beam of words by a persistent flash of the lowest elements found, scored by the height $d(o, g\\cdot o)$.',
        'Two words that reach the same element give a relation.',
        'An element $g$ is a Dirichlet generator when the midpoint of $[o, g\\cdot o]$ has only $o$ and $g\\cdot o$ as its nearest orbit points.',
    ], 'lead');
    if (S.notes && S.notes.length) html += para(S.notes);
    if (S.exactTried && !S.exactTried.index) {
        const E = S.exactTried;
        const why = { cosets: 'it reached its limit on cosets', time: 'it ran out of time' }[E.limit] || String(E.limit || E.error || '').replace(/\$/g, '');
        const Ltex = E.ring ? `\\mathrm{PGL}_2(${RING_TEX[E.ring]}[1/${E.S.map((x) => `(${ringElt(E.ring, x)})`).join('\\cdot ')}])` : `\\mathrm{PGL}_2(\\mathbb{Z}[1/${E.S.join('\\cdot ')}])`;
        html += para([`Coset enumeration in $${Ltex}$ did not close, because ${why}.`, 'So FlashBeam searches instead.']);
    }
    if (S.nrTried && !S.nrTried.index) {
        const E = S.nrTried;
        const why = { cosets: 'it reached its limit on cosets', time: 'it ran out of time' }[E.limit] || String(E.limit || E.error || '').replace(/\$/g, '');
        html += para([`Coset enumeration in $\\mathrm{PGL}_2(\\mathcal{O}_k)$, on its presentation from Voronoi's algorithm, did not close, because ${why}.`]);
    }
    if (S.error) html += banner('open', [`The search stopped: ${String(S.error).replace(/\$/g, '')}.`]);
    if (S.head) html += banner(S.status === 'yes' ? 'yes' : S.status === 'running' ? 'running' : 'open', S.head);

    const L = liveNumbers(S);
    const rels = r ? r.relations.length : S.progress ? S.progress.relations || 0 : 0;
    html += '<div class="cov-stats">';
    html += stat('Iteration', L.it, 'cov-it');
    html += stat('Elements tried', L.visited.toLocaleString(), 'cov-visited');
    html += stat('Relations', rels, 'cov-rels');
    if (trees) {
        html += stat('Representatives', L.reps, 'cov-reps');
        html += stat('Neighbours covered', `${L.covered} / ${L.targets}`, 'cov-covered');
    }
    html += '</div>';
    if (trees) {
        html += `<div class="cov-bar"><span id="cov-bar" style="width:${(100 * L.frac).toFixed(1)}%"></span></div>`;
        html += `<div id="cov-chart">${chart(S.history || [])}</div>`;
    }

    // the Dirichlet generators
    if (r && r.dirichlet) {
        const D = r.dirichlet;
        const nArch = (r.archKinds || []).length;
        html += `<h3>${mix('Dirichlet generators in $X$')}</h3>`;
        html += para([
            `There ${D.pairs.length === 1 ? 'is one Dirichlet generator' : `are ${D.pairs.length} Dirichlet generators`} up to inverses, ${D.active} elements in all, since $g^{-1}$ is one exactly when $g$ is; ${D.tied} of them are tied.`,
            `They are measured only against the ${D.considered} lowest orbit points found, as in the $\\mathrm{SO}(3)$ project, so they are the facets of the partial Dirichlet domain those points cut out.`,
        ]);
        html += scatter(D.points, r.weights || [], nArch, (S.archFactors || []).map((a) => a.labelTex));
        if (D.pairs.length) {
            const head = ['Generator $g$', '$d(o, g\\cdot o)$'];
            for (let i = 0; i < nArch; i++) head.push(nArch > 1 ? `$\\mathbb{H}$ at $${S.archFactors && S.archFactors[i] ? S.archFactors[i].labelTex : `\\sigma_{${i + 1}}`}$` : '$\\mathbb{H}$');
            (S.places || []).forEach((pl) => head.push(model.degree > 1 && pl.primeTex ? `steps at $${pl.primeTex}$` : `steps at $${pl.p}$`));
            head.push('clearance');
            html += `<div class="cov-words"><table><thead><tr>${head.map((h) => `<th>${mix(h)}</th>`).join('')}</tr></thead><tbody>`;
            for (const g of D.pairs) {
                html += `<tr><td>${wordCell(g.word)}${g.involution ? ' <span class="note">(order 2)</span>' : g.withInverse ? ' <span class="note">and its inverse</span>' : ''}</td><td>${g.h.toFixed(3)}</td>`;
                for (const d of g.arch) html += `<td>${d.toFixed(3)}</td>`;
                for (const t of g.tree) html += `<td>${t}</td>`;
                html += `<td>${g.clearance == null ? '—' : g.clearance.toFixed(3)}</td></tr>`;
            }
            html += '</tbody></table></div>';
        }
    }

    // relations, and the presentation they suggest
    if (r && r.relations) {
        html += '<h3>Relations found</h3>';
        if (!r.relations.length) html += para(['No two words reached the same element, so no relation was found.']);
        else {
            html += para([
                `${r.collisions.toLocaleString()} collisions gave ${r.relations.length} relators, cyclically reduced and taken up to rotation and inverse${r.redundant ? `, after dropping ${r.redundant.toLocaleString()} that the others imply, since they cancel to nothing against pieces of the kept relators` : ''}.`,
                'Each relator was checked exactly.',
                'The list need not be complete, so the presentation it suggests is one to test, not one proved.',
            ]);
            html += `<div class="cov-words"><table><tbody>${r.relations.slice(0, 40).map((w) => `<tr><td>${wordCell(w, 60)}</td><td class="note">${w.length} letters</td></tr>`).join('')}</tbody></table></div>`;
            html += `<p><button class="btn btn-add-alt" id="copy-gap">Copy the relations for GAP</button></p>`;
        }
    }

    // the covering certificate
    const links = r ? r.links : S.progress ? S.progress.links : null;
    const repTex = r ? r.reps.map((x) => x.tex) : null;
    if (trees && links) {
        html += `<h3>The covering certificate</h3>`;
        html += `<p class="note">${mix('The certificate is a finite set $R$ of vertices of the trees such that every neighbour of every $r \\in R$ is $w \\cdot r\'$ for a word $w$ and some $r\' \\in R$. Then $\\Gamma R$ is every vertex. Each star below is the link of a representative in one tree, with the parent at the top. Its neighbours are marked')} <span class="key-self">●</span> when reached from the same representative, <span class="key-other">●</span> when reached from another, <span class="key-rep">●</span> when they are representatives themselves, and <span class="key-open">○</span> when still open.</p>`;
        html += '<div class="cov-reps">';
        links.forEach((perPlace, i) => {
            const label = repTex ? ` = ${tex(repTex[i].join(' \\times '))}` : '';
            html += `<div class="cov-rep"><div class="cov-rep-head">\\(${repName(i)}\\)${label}</div>`;
            html += `<div class="cov-stars">${perPlace.map((st) => `<div>${star(st)}</div>`).join('')}</div></div>`;
        });
        html += '</div>';
    }
    if (r && r.status === 'covered' && r.witnesses) {
        html += r.verify && r.verify.ok
            ? para([`All ${r.verify.checked} neighbours were checked again from scratch.`, 'Each word below, multiplied out exactly, carries its representative onto the neighbour.'])
            : `<p class="note">${mix(`The re-check failed: ${(r.verify && r.verify.failures || []).slice(0, 3).join('; ')}.`)}</p>`;
        const rows = r.witnesses.slice().sort((a, b) => a.from - b.from || a.place - b.place || a.nbr - b.nbr);
        html += '<div class="cov-words"><table><thead><tr><th>Neighbour</th><th>Word</th></tr></thead><tbody>';
        for (const w of rows.slice(0, 400)) {
            const where = (S.places || []).length > 1 ? ` in tree ${w.place + 1}` : '';
            html += `<tr><td>${mix(`${w.nbr === 0 ? 'the parent' : `child ${w.nbr - 1}`} of $${repName(w.from)}$${where}`)}</td><td>\\(${wordTexG(w.word, 60)} \\cdot ${repName(w.rep)}\\)</td></tr>`;
        }
        html += '</tbody></table></div>';
        if (rows.length > 400) html += para([`${rows.length - 400} more rows are in the JSON certificate.`]);
        html += '<p><button class="btn btn-add-alt" id="copy-cert">Copy the certificate (JSON)</button></p>';
    }

    // the stabilizer at ∞
    if (S.arch) {
        const st = S.stab || { status: 'waiting' };
        const multi = S.arch.kind === 'multi';
        html += `<h3>${mix(multi ? 'The vertex stabilizer at the places at $\\infty$' : `The vertex stabilizer at $${S.arch.labelTex || (S.arch.kind === 'real' ? '\\mathbb{R}' : '\\mathbb{C}')}$`)}</h3>`;
        html += para(multi
            ? [
                'The quaternion algebra $A$ splits at two or more places at $\\infty$, and $\\mathcal{O}_K$ has infinitely many units.',
                'So $\\Lambda_o$ is a conjugate of $\\mathrm{PGL}_2(\\mathcal{O}_K)$, and the elements of $\\Gamma$ fixing $o$ that the search found must generate a subgroup of finite index in it.',
                'For totally real, CM and cubic fields, coset enumeration on the presentation of $\\mathrm{PGL}_2(\\mathcal{O}_K)$ from Voronoi’s algorithm decides this exactly; otherwise, a full lattice of unipotents at a cusp proves it by Vaserstein’s theorem.',
            ]
            : [
                `The quaternion algebra $A$ splits at exactly one place at $\\infty$, so $\\Lambda_o$ is a lattice in $\\mathrm{PGL}_2(${S.arch.kind === 'real' ? '\\mathbb{R}' : '\\mathbb{C}'})$.`,
                `The elements of $\\Gamma$ fixing $o$ that the search found must generate a group of finite ${S.arch.kind === 'real' ? 'area in $\\mathbb{H}^2$' : 'volume in $\\mathbb{H}^3$'}.`,
                S.arch.kind === 'real'
                    ? 'Over $\\mathbb{Q}$, when they all lie in $\\mathrm{PGL}_2(\\mathbb{Z})$, coset enumeration decides this exactly; otherwise Poincaré’s theorem on their Dirichlet domain decides it.'
                    : 'Over $\\mathbb{Z}[i]$, $\\mathbb{Z}[\\sqrt{-2}]$ and $\\mathbb{Z}[\\omega]$, coset enumeration in the Bianchi group decides this exactly; otherwise Poincaré’s theorem on their Dirichlet domain decides it.',
            ]);
        if (st.status === 'waiting') html += para(['This is checked once the covering is complete.']);
        else if (st.status === 'none') html += para(st.lines || ['No element fixing $o$ was found.']);
        else {
            if (st.used) html += `<p class="note">${mix(`These are the ${st.used.length} elements fixing $o$ that were used:`)} ${st.used.slice(0, 16).map((e) => wordCell(e.word, 20)).join(', ')}${st.used.length > 16 ? `, and ${st.used.length - 16} more` : ''}.</p>`;
            if (st.status === 'running') html += para([st.harvesting ? 'FlashBeam is collecting more elements that fix $o$…' : multi ? 'Checking them…' : 'Poincaré is computing their Dirichlet domain…']);
            if (multi && S.nrStab && !S.nrStab.index && S.nrStab.applies !== false) {
                const E = S.nrStab, why = { cosets: 'it reached its limit on cosets', time: 'it ran out of time' }[E.limit] || String(E.limit || E.error || '').replace(/\$/g, '');
                html += para([`Coset enumeration in $\\mathrm{PGL}_2(\\mathcal{O}_K)$ on ${E.used ?? 0} of them did not close, because ${why}.`]);
            }
            else html += banner(st.status === 'yes' ? 'yes' : 'open', st.lines || (st.text ? [st.text] : []));
            if (st.state) html += '<p><button class="btn btn-add-alt" id="show-stab">View their domain in Poincaré</button></p>';
        }
    }
    return html + '</div>';
}

// ───────────────────────── the presentation of an S-arithmetic Γ ─────────────────────────

/** x ↦ n for the generators with a power relator x^n in the list */
export function ordersFrom(rels) {
    const orders = new Map();
    for (const w of rels) if (w.length && w.every((x) => Math.abs(x) === Math.abs(w[0]))) orders.set(Math.abs(w[0]), w.length);
    return orders;
}

/**
 * The orientation of a relator to show: w or w⁻¹, whichever has fewer inverse letters once the
 * exponents of torsion generators are reduced (a generator of order 2 is never written inverted).
 */
export function orientRelator(w, orders = new Map()) {
    if (w.every((x) => Math.abs(x) === Math.abs(w[0]))) return w.map((x) => Math.abs(x));
    const a = orders.size ? powerReduce(w, orders, true) : w;
    const b = orders.size ? powerReduce(w.slice().reverse().map((x) => -x), orders, true) : w.slice().reverse().map((x) => -x);
    const neg = (u) => u.filter((x) => x < 0).length;
    return neg(b) < neg(a) ? b : a;
}

/** A relator (±(k+1)) in TeX: powers collected, a proper power u^k as (u)^k, the orientation with fewer inverses. */
export function relatorTexNamed(w, names, orders = new Map()) {
    w = orientRelator(w, orders);
    const word = (u) => {
        const out = [];
        for (let i = 0; i < u.length;) {
            let j = i;
            while (j < u.length && u[j] === u[i]) j++;
            const e = (j - i) * Math.sign(u[i]), nm = names[Math.abs(u[i]) - 1];
            out.push(e === 1 ? nm : `${nm}^{${e}}`);
            i = j;
        }
        return out.join('');
    };
    const L = w.length;
    for (let d = 1; d < L; d++) {
        if (L % d || w.some((x, i) => x !== w[(i + d) % L])) continue;
        const u = w.slice(0, d);
        return d === 1 ? `${names[Math.abs(u[0]) - 1]}^{${(L / d) * Math.sign(u[0])}}` : `\\left(${word(u)}\\right)^{${L / d}}`;
    }
    return word(w);
}
const matTex = (M) => `\\left(\\begin{smallmatrix}${M[0]}&${M[1]}\\\\${M[2]}&${M[3]}\\end{smallmatrix}\\right)`;
const SHAPES = { 'Γ(N)': '\\Gamma(N)', 'Γ₁(N)': '\\pm\\Gamma_1(N)', 'Γ¹(N)': '\\pm\\Gamma^1(N)', 'Γ₀(N)': '\\Gamma_0(N)', 'Γ⁰(N)': '\\Gamma^0(N)' };

/** ⟨names | relators⟩ in one line when short, else the generators and a list of the relators. */
function presBlock(G, names, rels) {
    const orders = ordersFrom(rels);
    // a very large presentation: the first relators only (Copy for GAP has them all)
    const total = rels.reduce((s, w) => s + w.length, 0);
    const big = rels.length > 400 || total > 40000;
    const T = (big ? rels.slice(0, 60) : rels).map((w) => relatorTexNamed(w, names, orders));
    const gensTex = names.length > 12 ? `${names.slice(0, 4).join(', ')}, \\ldots, ${names[names.length - 1]}` : names.join(', ');
    if (T.length <= 6 && T.join('').length < 120 && !big) return `<div class="pres-block">${tex(`${G} = \\left\\langle ${gensTex} \\;\\middle|\\; ${T.join(',\\ ') || '\\ '} \\right\\rangle`)}</div>`;
    const shown = 60;
    let html = `<div class="pres-block">${tex(`${G} = \\left\\langle ${gensTex} \\;\\middle|\\; r_1, \\ldots, r_{${rels.length}} \\right\\rangle`)}:</div>`;
    html += `<ol class="pres-rels">${T.slice(0, shown).map((t) => `<li>${tex(t)}</li>`).join('')}</ol>`;
    if (big) html += `<p class="note">${mix(`The other ${(rels.length - shown).toLocaleString()} relators are not shown here (${total.toLocaleString()} letters in all); Copy for GAP gives every one.`)}</p>`;
    else if (T.length > shown) html += `<details class="pres-more"><summary>${T.length - shown} more relators</summary><ol class="pres-rels" start="${shown + 1}">${T.slice(shown).map((t) => `<li>${tex(t)}</li>`).join('')}</ol></details>`;
    return html;
}

/**
 * The section on the presentation: P = { status: 'running' | 'done' | 'error', result, error }
 * with result as sarithPresentation.js presentationReport.
 */
export function presentationSection(P) {
    if (!P) return '';
    let html = '<h3>Presentation</h3>';
    if (P.status === 'running') return html + para(['Standard generators of $\\Lambda$, the congruence description and a presentation of $\\Gamma$ are being computed…']);
    if (P.error || !P.result) return html + banner('open', [P.error ? `No presentation was found: ${String(P.error).replace(/\$/g, '')}.` : 'No presentation was found.']);
    const R = P.result;
    const ringTex = R.ring ? RING_TEX[R.ring] : '\\mathbb{Z}';
    // over the rings, entries in the ring's generator (i, √−2, ω), not the letter w of the generator w
    const ent = entTex(R.ring);
    const matTex = (M) => `\\left(\\begin{smallmatrix}${M.map(ent).join('&').replace(/&([^&]*)&/, '&$1\\\\')}\\end{smallmatrix}\\right)`;
    // nr: Γ of finite index in PGL₂(O_k), whose presentation comes from Voronoi's algorithm (numberRingPresentation.js)
    const nr = R.kind === 'numberRing';
    const Stex = (R.S || []).map((x) => (R.ring ? `(${ent(x)})` : x)).join('\\cdot ') || '1';
    const Ltex = nr ? '\\mathrm{PGL}_2(\\mathcal{O}_k)' : `\\mathrm{PGL}_2(${ringTex}[1/${Stex}])`;
    // Λ on its standard generators
    if (R.lambda && !R.lambda.error) {
        const lnames = nr ? R.lambda.gens.map((_, i) => `p_{${i + 1}}`) : R.lambda.gens.map((g) => g.name.replace(/_(\d+)$/, '_{$1}').replace(/_\{(.*)\}$/, (m0, x) => `_{${ent(x)}}`));
        const gensTex = R.lambda.gens.map((g, i) => `$${lnames[i]} = ${matTex(g.M)}$`).join(', ');
        html += para(nr
            ? [
                `$\\Lambda = ${Ltex}$ is generated by the ${R.lambda.gens.length} generators of its presentation from Voronoi's algorithm (perfect forms over $\\mathcal{O}_k$, the ${R.lambda.cells} cells it finds, and Brown's theorem): ${gensTex}.`,
                'Its relators are below.',
            ]
            : R.ring
            ? [
                `$\\Lambda = ${Ltex}$ is generated by $w$, the unipotents $T$ and $U$, and units on the diagonal: ${gensTex}.`,
                `Its relators below come from the Bass–Serre presentation built on Poincaré's presentation of $\\mathrm{PGL}_2(${ringTex})$, with $W_\\pi = \\left(\\begin{smallmatrix}0&1\\\\\\pi&0\\end{smallmatrix}\\right) = wJD_\\pi$ substituted, where $J = \\mathrm{diag}(-1, 1)$.`,
            ]
            : [
                `$\\Lambda = ${Ltex}$ is generated by the units of $\\mathbb{Z}[1/${Stex}]$ on the diagonal, a unipotent and $w$: ${gensTex}.`,
                `Its relators below come from the Bass–Serre presentation on the reflections of $\\mathrm{PGL}_2(\\mathbb{Z})$ and $w_p = \\left(\\begin{smallmatrix}0&1\\\\p&0\\end{smallmatrix}\\right)$, with $a = J$, $b = Jw$, $c = TJ$ and $w_p = JwD_p$ substituted.`,
            ], 'lead');
        html += presBlock('\\Lambda', lnames, R.lambda.relators);
    }
    // the congruence description
    const C = R.cong, Pr = R.pres;
    if (C && !C.error && C.agrees) {
        const N = C.N, sh = C.shape && SHAPES[C.shape] ? SHAPES[C.shape].replace('N', N) : null;
        const H0 = C.shape === 'full' ? 'all of $\\mathrm{PSL}_2(\\mathbb{Z}[1/' + Stex + '])$' : `the preimage of a subgroup $H_0$ of order ${C.image.toLocaleString()} and index ${(C.ambient / C.image).toLocaleString()} in $\\mathrm{SL}_2(\\mathbb{Z}/${N})/\\pm1$${sh ? `, the image of $${sh}$` : ''}`;
        const det = C.classes.gamma === C.classes.lambda ? '$\\Gamma$ meets every class of determinants, that is, of $\\pm$ products of primes of $S$ modulo squares.'
            : C.classes.basis.length ? `Modulo squares, the determinants of $\\Gamma$ form $\\langle ${C.classes.basis.map((b) => b.replace('−', '-').replace(/·/g, '\\cdot ')).join(', ')} \\rangle$, which is ${C.classes.gamma} of the ${C.classes.lambda} classes.` : `Every determinant of $\\Gamma$ is a square, which is 1 of the ${C.classes.lambda} classes.`;
        html += `<p><b>As a congruence subgroup.</b> ${mix([
            '$\\Gamma$ is S-arithmetic and $S \\ne \\varnothing$, so by the congruence subgroup property it equals its congruence closure.',
            `${C.N === 1 ? 'Its elements of square determinant are' : `At level $N = ${N}$, its elements of square determinant form`} ${H0}${C.N === 1 ? '' : ` under reduction mod $${N}$`}.`,
            det,
            `So $[\\Lambda : \\Gamma] = ${C.classes.lambda / C.classes.gamma} \\cdot ${(C.ambient / C.image).toLocaleString()} = ${C.index.toLocaleString()}$, which is the size of the coset table.`,
        ].join(' '))}</p>`;
    } else if (C && !C.error && !C.agrees) {
        html += para([`The congruence closure found has index $${C.index.toLocaleString()}$, not the coset table's $${Pr.index}$, because its levels were not certified deep enough.`]);
    }
    // Γ as a graph of groups on the tree of the last prime
    if (R.graph) html += graphSection(R.graph, R.S || []);
    // Γ
    if (Pr.error) return html + para([`No presentation of $\\Gamma$ was found: ${String(Pr.error).replace(/\$/g, '')}.`]);
    const names = Pr.gens.map((g) => g.name.replace(/^g(\d+)$/, 'g_{$1}').replace(/^h(\d+)$/, 'h_{$1}'));
    const extra = Pr.gens.filter((g) => g.given === null);
    const ab = Pr.abelian, H1 = [ab.rank ? (ab.rank === 1 ? '\\mathbb{Z}' : `\\mathbb{Z}^{${ab.rank}}`) : null, ...ab.torsion.map((d) => `\\mathbb{Z}/${d}`)].filter(Boolean).join(' \\oplus ') || '0';
    const sub = [
        ...(nr && Pr.conjugated ? [`$${Pr.kernelIndex > 1 ? 'K' : '\\Gamma'}$ preserves a lattice $L \\subset k^2$; with $g$ a basis of $L$, $g^{-1}${Pr.kernelIndex > 1 ? 'K' : '\\Gamma'}g \\le \\Lambda$, and the table is for that conjugate.`] : []),
        ...(Pr.kernelIndex > 1 ? [
            `$\\Gamma$ is not inside $\\Lambda$: its elements ${nr ? 'whose determinants have even valuation at every prime' : 'of even valuation at the other primes'} form a normal subgroup $K$ of index $${Pr.kernelIndex}$, and $[\\Lambda : K] = ${Pr.index}$.`,
            "So the presentation of $\\Gamma$ adds coset representatives of $K$, with their squares, their commutators and their action on the generators of $K$, all written in $K$.",
        ] : []),
    ];
    const from = Pr.tableFrom === 'congruence'
        ? [
            `Coset enumeration did not close in time, so the action of $\\Lambda$ on the ${Pr.index.toLocaleString()} cosets of $\\Gamma$ is read off from the congruence description: a coset $\\Gamma g$ is labelled by its class of determinants and by the coset of $H_0$ containing $g$ mod $N$.`,
            'This was checked to be an action in which every relator of $\\Lambda$ closes and $\\Gamma$ fixes its coset.',
            `Reidemeister–Schreier on it gives ${Pr.rs.generators} generators and ${Pr.rs.relators} relators.`,
        ]
        : [`Reidemeister–Schreier on the ${Pr.index.toLocaleString()} cosets of the coset table gives ${Pr.rs.generators} generators and ${Pr.rs.relators} relators.`];
    const K = Pr.kernelIndex > 1 ? '$K$' : '$\\Gamma$';
    html += `<p><b>${mix(R.graph && !R.graph.error ? 'On the given generators.' : 'A presentation of $\\Gamma$.')}</b> ${mix([
        ...from, ...sub,
        `Tietze moves remove the Schreier generators in favour of the given ones${extra.length ? `, except ${extra.length === 1 ? 'one, which is' : `${extra.length}, which are`} written out below` : ''}.`,
        ...(Pr.hFrom === 'graph' ? ['The ones they could not remove alone are written in the given generators through the graph of groups: each is rewritten in its generators by the Bass–Serre normal form, and those have words in the given ones. Each such word is a relator that removes one.'] : []),
        ...(Pr.hFrom === 'labels' ? [`The ones they could not remove alone are written in the given generators by the coset enumeration itself, run again with labels (the modified Todd–Coxeter algorithm). Each step records, as a word in the generators of ${K}, the element it uses, so every Schreier generator comes out as such a word. Each word is a relator that removes one generator.`] : []),
        'Every relator is multiplied out and checked to be the identity.',
    ].join(' '))}</p>`;
    const rels = Pr.relators;
    html += presBlock('\\Gamma', names, rels);
    if (extra.length) {
        const hs = Pr.gens.map((g, i) => (g.given === null ? `$${names[i]} = ${matTex(g.M)}$` : null)).filter(Boolean);
        html += para([`Here ${hs.slice(0, 12).join(', ')}${hs.length > 12 ? `, and ${hs.length - 12} more (Copy for GAP names them all)` : ''}.`]);
    }
    const dropped = Pr.gamma.map((w, i) => ({ w, i })).filter(({ w, i }) => !(w.length === 1 && w[0] > 0 && Pr.gens[w[0] - 1].given === i));
    if (dropped.length) html += para([`The given ${dropped.length === 1 ? 'generator that was not kept is' : 'generators that were not kept are'} ${dropped.map(({ w, i }) => `$g_{${i + 1}} = ${w.length ? relatorTexNamed(w, names) : '1'}$`).join(', ')}.`]);
    html += `<p class="note">${mix(`The abelianization is $H_1(\\Gamma) = ${H1}$. The presentation has ${rels.length} relators on ${Pr.gens.length} generators, and it took ${Pr.ms} ms to find.`)} <button class="quiet" id="copy-pres-gap">Copy for GAP</button></p>`;
    return html;
}

/** The presentation as GAP input. */
export function presentationGap(Pr) {
    const names = Pr.gens.map((g) => g.name);
    const w = (u) => u.map((x) => (x > 0 ? names[x - 1] : `${names[-x - 1]}^-1`)).join('*') || 'One(F)';
    return `F := FreeGroup(${names.map((n) => `"${n}"`).join(', ')});;\n${names.map((n, i) => `${n} := F.${i + 1};;`).join(' ')}\nG := F / [${Pr.relators.map(w).join(', ')}];;`;
}


// ───────────────────────── the graph of groups ─────────────────────────

const FIELD_TEX = { 1: '\\mathbb{Q}(i)', 2: '\\mathbb{Q}(\\sqrt{-2})', 3: '\\mathbb{Q}(\\omega)' };
/** an entry as bianchiPresentation.js writes it (a+bw, with −) in TeX, in the ring's generator i, √−2 or ω */
const entTex = (ring) => (x) => (ring ? ringElt(ring, x) : String(x));
/**
 * The words that depend on the ring of the graph of groups G (over ℚ, or G.ring = d over ℤ[i], ℤ[√−2],
 * ℤ[ω]): the rings ℤ[1/S′], the local fields, Γ₀ of a prime, its w, matrices.
 */
function graphCtx(G) {
    const d = G.ring || null, ent = entTex(d);
    return {
        ent,
        ring: (ps) => (d
            ? (ps.length ? `${RING_TEX[d]}[1/${ps.map((p) => `(${ent(p)})`).join('\\cdot ')}]` : RING_TEX[d])
            : (ps.length ? `\\mathbb{Z}[1/${ps.join('\\cdot ')}]` : '\\mathbb{Z}')),
        local: (p) => (d ? `${FIELD_TEX[d]}_{(${ent(p)})}` : `\\mathbb{Q}_{${p}}`),
        gamma0: (p) => (d ? `\\Gamma_0(${ent(p)})` : `\\Gamma_0(${p})^{\\pm}`),
        w: (p) => (d ? `W_{${ent(p)}}` : `w_{${p}}`),
        valence: (node) => node.valence ?? Number(node.prime) + 1,
        mat: (M) => `\\left(\\begin{smallmatrix}${ent(M[0])}&${ent(M[1])}\\\\${ent(M[2])}&${ent(M[3])}\\end{smallmatrix}\\right)`,
    };
}
/** TeX names that are safe to juxtapose */
const safeNames = (G) => G.gens.map((g) => `{${g.name}}`);
/** a word in named letters, powers collected; long words cut */
function namedWordTex(w, names, maxParts = 40) {
    if (!w || !w.length) return '1';
    const parts = [];
    for (let i = 0; i < w.length;) {
        let j = i;
        while (j < w.length && w[j] === w[i]) j++;
        const e = (j - i) * Math.sign(w[i]);
        parts.push(`${names[Math.abs(w[i]) - 1]}${e === 1 ? '' : `^{${e}}`}`);
        i = j;
    }
    return parts.length > maxParts ? `${parts.slice(0, maxParts).join('')}\\cdots\\ (\\text{${w.length} letters})` : parts.join('');
}
const gNamesTex = (n) => Array.from({ length: n }, (_, i) => `g_{${i + 1}}`);

/** The quotient graph of the top level as a small SVG: vertices G₁ …, edges, half-edges for inversions. */
function graphSvg(node, G) {
    const V = node.vertices.length;
    const loopsUp = node.edges.some((e) => e.from === e.to);
    const W = 520, H = V <= 2 ? (loopsUp ? 150 : 90) : 190;
    // inversions point up from their vertex (down from the odd ones when the vertices zigzag)
    const cy = V <= 2 ? (loopsUp ? 0.62 * H : H / 2) : H / 2;
    const xs = node.vertices.map((_, v) => (V === 1 ? W / 2 : 90 + (v * (W - 180)) / (V - 1)));
    const ys = node.vertices.map((_, v) => (V <= 2 ? cy : cy + (v % 2 ? 34 : -34)));
    const invCount = node.vertices.map((_, v) => node.edges.filter((e) => e.kind === 'inversion' && e.from === v).length);
    const name = (k) => G.gens[k - 1].name;
    let out = '';
    const loops = new Map();
    node.edges.forEach((e) => {
        const a = e.from, b = e.to;
        if (e.kind === 'inversion') {
            const k = loops.get(a) || 0; loops.set(a, k + 1);
            const up = V <= 2 || a % 2 === 0;
            const ang = (up ? -Math.PI / 2 : Math.PI / 2) + (k - (invCount[a] - 1) / 2) * 0.8;
            const x2 = xs[a] + 50 * Math.cos(ang), y2 = ys[a] + 50 * Math.sin(ang);
            out += `<line x1="${xs[a]}" y1="${ys[a]}" x2="${x2}" y2="${y2}" class="gg-edge"/><rect x="${x2 - 5}" y="${y2 - 5}" width="10" height="10" class="gg-mid"/>`;
            out += svgTex(x2 + (Math.cos(ang) < -0.2 ? -9 : 9), y2 + 5, name(e.gen), { anchor: Math.cos(ang) < -0.2 ? 'end' : 'start', cls: 'gg-lab', w: 90 });
        } else if (a === b) {
            const k = loops.get(a) || 0; loops.set(a, k + 1);
            const r = 26 + 10 * k, up = a % 2 ? 1 : -1;
            out += `<path d="M ${xs[a] - 10} ${ys[a] + up * 8} C ${xs[a] - r * 1.6} ${ys[a] + up * r * 2.2}, ${xs[a] + r * 1.6} ${ys[a] + up * r * 2.2}, ${xs[a] + 10} ${ys[a] + up * 8}" class="gg-edge${e.kind === 'stable' ? ' hnn' : ''}"/>`;
            if (e.gen) out += svgTex(xs[a], ys[a] + up * (r * 1.65 + 8) + 5, name(e.gen), { anchor: 'middle', cls: 'gg-lab', w: 90 });
        } else {
            const mx = (xs[a] + xs[b]) / 2, my = (ys[a] + ys[b]) / 2;
            const key = [Math.min(a, b), Math.max(a, b)].join('-');
            const k = loops.get(key) || 0; loops.set(key, k + 1);
            const off = k ? (k % 2 ? 1 : -1) * 22 * Math.ceil(k / 2) : 0;
            out += `<path d="M ${xs[a]} ${ys[a]} Q ${mx} ${my + 2 * off} ${xs[b]} ${ys[b]}" class="gg-edge${e.kind === 'stable' ? ' hnn' : ''}"/>`;
            if (e.gen) out += svgTex(mx, my + off - 5, name(e.gen), { anchor: 'middle', cls: 'gg-lab', w: 90 });
        }
    });
    node.vertices.forEach((v, i) => {
        out += `<circle cx="${xs[i]}" cy="${ys[i]}" r="15" class="gg-vtx"/>${svgTex(xs[i], ys[i] + 5, `G_{${i + 1}}`, { anchor: 'middle', cls: 'gg-vlab', w: 30, h: 20 })}`;
    });
    return `<svg class="gg-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The quotient graph of groups">${out}</svg>`;
}

/** One level of the graph of groups, as a description (nested for |S| ≥ 2). */
function levelHtml(node, G, primesLeft, depth, X = graphCtx(G)) {
    const p = node.prime, below = primesLeft.slice(0, -1);
    const Lp = `\\mathrm{PGL}_2(${X.ring(below)})`;
    const vtx = node.vertices.map((v, i) => {
        const h = v.h, hId = h[0] === h[3] && h[1] === '0' && h[2] === '0';
        const conj = hId ? Lp : `h_{${i + 1}} ${Lp}\\, h_{${i + 1}}^{-1}`;
        let line = `$G_{${i + 1}} = \\Gamma \\cap ${conj}$, of index ${v.index} in it`;
        if (!hId) line += `, with $h_{${i + 1}} = ${X.mat(h)}$`;
        if (v.sub.leaf) {
            const names = v.sub.gens.map((k) => G.gens[k - 1].name);
            line += names.length ? `, generated by $${names.join(', ')}$` : ', trivial';
            return `<li>${mix(line + '.')}</li>`;
        }
        return `<li>${mix(line + `; it acts on the tree of $\\mathrm{PGL}_2(${X.local(v.sub.prime)})$:`)}${levelHtml(v.sub, G, below, depth + 1, X)}</li>`;
    }).join('');
    const eds = node.edges.map((e) => {
        const a = `G_{${e.from + 1}}`, b = `G_{${e.to + 1}}`;
        const nm = e.gen ? G.gens[e.gen - 1].name : null;
        const grp = `an edge group of index ${e.edgeIndex} in $${X.gamma0(p)}$ (up to conjugation), ${e.edgeGens} Schreier generator${e.edgeGens === 1 ? '' : 's'}`;
        if (e.kind === 'tree') return `<li>${mix(`$${a}$ — $${b}$: amalgamated along ${grp}.`)}</li>`;
        if (e.kind === 'stable') return `<li>${mix(`$${a}$ — $${b}$, off the spanning tree: the stable letter $${nm}$ conjugates ${grp} of $${a}$ into $${b}$.`)}</li>`;
        return `<li>${mix(`an edge at $${a}$ inverted by $${nm}$: amalgamation with $\\langle E, ${nm}\\rangle$, where $E$ is ${grp} and $${nm}^2 \\in E$.`)}</li>`;
    }).join('');
    const V = node.vertices.length, Ecount = node.edges.length, inv = node.edges.filter((e) => e.kind === 'inversion').length;
    const head = `${V} orbit${V === 1 ? '' : 's'} of vertices and ${Ecount} of edges${inv ? ` (${inv} inverted)` : ''}.`;
    return `<div class="gg-level${depth ? ' nested' : ''}">${depth === 0 ? '' : `<p class="note">${mix(head)}</p>`}<ul class="gg-list">${vtx}${eds}</ul></div>`;
}

/**
 * The section on the graph of groups (sarithPresentation.js graphReport, bianchiPresentation.js
 * graphReportBianchi). G.hall: Γ ⊄ Λ, and the graph of groups is that of K = Γ ∩ Λ, extended by u's.
 */
export function graphSection(G, S) {
    let html = '<h3>As a graph of groups</h3>';
    if (G.error) return html + para([`The graph of groups was not computed: ${String(G.error).replace(/\$/g, '')}.`]);
    const X = graphCtx(G);
    S = G.primes || S;
    const top = G.tree, p = top.prime;
    const V = top.vertices.length, Ecount = top.edges.length, inv = top.edges.filter((e) => e.kind === 'inversion').length;
    const H = G.hall, A = H ? 'K' : '\\Gamma';
    html += para([
        ...(H ? [`$\\Gamma$ is not inside $\\Lambda$: its elements of even valuation at the primes outside $S$ form a normal subgroup $K = \\Gamma \\cap \\Lambda$ of index ${H.kernelIndex}, with $\\Gamma / K \\cong ${H.count === 1 ? '\\mathbb{Z}/2' : `(\\mathbb{Z}/2)^{${H.count}}`}$.`] : []),
        `$${A}$ acts on the Bruhat–Tits tree $T_{${X.valence(top)}}$ of $\\mathrm{PGL}_2(${X.local(p)})$ with ${V} orbit${V === 1 ? '' : 's'} of vertices and ${Ecount} of edges${inv ? ` (${inv} inverted by an element of $${A}$)` : ''}, read off the coset table: vertex orbits are the orbits of $\\mathrm{PGL}_2(${X.ring(S.slice(0, -1))})$ on $${A}\\backslash\\Lambda$, edge orbits those of $${X.gamma0(p)}$ paired by $${X.w(p)}$.`,
        `By Bass–Serre, $${A}$ is the fundamental group of the quotient graph of groups: generated by the vertex groups, a stable letter for each edge off a spanning tree and an element inverting each inverted edge, with the vertex groups' relations and, across each edge, $t^{-1} h\\, t = \\varphi(h)$ for generators $h$ of the edge group.`,
    ], 'lead');
    html += graphSvg(top, G);
    html += levelHtml(top, G, S, 0, X);
    if (H) {
        const us = G.gens.filter((g) => g.kind === 'coset').map((g) => g.name);
        html += `<p><b>${mix('The extension.')}</b> ${mix([
            `$\\Gamma$ is generated by $K$ and ${us.length === 1 ? 'a representative' : 'representatives'} $${us.join(', ')}$ of ${us.length === 1 ? 'the other coset' : 'a basis of $\\Gamma / K$'}, products of the given generators.`,
            `P. Hall's presentation of the extension adds ${us.length === 1 ? `the relators $${us[0]}^2 = k_0$ and` : `the relators $u_j^2 = k_j$, $[u_j, u_l] = k_{jl}$ and`} $${us.length === 1 ? us[0] : 'u_j'}\\, x\\, ${us.length === 1 ? us[0] : 'u_j'}^{-1} = \\varphi(x)$ for each generator $x$ of $K$, with every right-hand side in $K$, written in its generators by the Bass–Serre normal form.`,
        ].join(' '))}</p>`;
    }
    const names = safeNames(G);
    const orders = ordersFrom(G.relators);
    const T = G.relators.map((w) => relatorTexNamed(w, names, orders));
    html += `<p><b>${mix('The presentation.')}</b> ${mix(`On the ${G.gens.length} generators of the graph of groups${H ? ' and the extension' : ''}, ${T.length} relator${T.length === 1 ? '' : 's'}, each multiplied out and checked to be the identity.`)}</p>`;
    if (T.length <= 8 && T.join('').length < 160) html += `<div class="pres-block">${tex(`\\Gamma = \\left\\langle ${names.join(', ')} \\;\\middle|\\; ${T.join(',\\ ')} \\right\\rangle`)}</div>`;
    else html += `<div class="pres-block">${tex(`\\Gamma = \\left\\langle ${names.join(', ')} \\;\\middle|\\; r_1, \\ldots, r_{${T.length}} \\right\\rangle`)}:</div><ol class="pres-rels">${T.map((t) => `<li>${tex(t)}</li>`).join('')}</ol>`;
    const gn = gNamesTex(G.given.length);
    html += `<p><b>${mix('The generators, as words in $g_1, g_2, \\ldots$')}</b></p><ul class="nice-gens">`;
    html += G.gens.map((g) => `<li>${tex(`${g.name} = ${g.word ? namedWordTex(g.word, gn) : '?'} = ${X.mat(g.M)}`)}</li>`).join('') + '</ul>';
    html += `<p class="note">${mix('Conversely, by the Bass–Serre normal form (walking each $g_i$ through the cosets): ')}${G.given.map((w, i) => tex(`g_{${i + 1}} = ${namedWordTex(w, names)}`)).join(', ')}. ${esc(`(${G.ms} ms.)`)}</p>`;
    return html;
}

/** The graph-of-groups presentation for the top of the page (main.js presentationData). */
export function graphTop(G) {
    const X = graphCtx(G);
    const names = safeNames(G);
    const orders = ordersFrom(G.relators);
    const V = G.tree.vertices.length;
    const us = G.gens.filter((g) => g.kind === 'coset').map((g) => g.name);
    return {
        source: `Graph of groups on $T_{${X.valence(G.tree)}}$`,
        note: `${V} vertex group${V === 1 ? '' : 's'} in $\\mathrm{PGL}_2(${X.ring(G.primes.slice(0, -1))})$${us.length ? `, for $K = \\Gamma \\cap \\Lambda$, and $${us.join(', ')}$ for $\\Gamma/K$` : ''}`,
        rels: G.relators.map((w) => relatorTexNamed(w, names, orders)),
        complete: true, free: !G.relators.length,
        names: G.gens.map((g) => g.name),
        defs: G.gens.map((g) => `${g.name} = ${g.word ? namedWordTex(g.word, gNamesTex(G.given.length), 12) : '?'}`),
    };
}
