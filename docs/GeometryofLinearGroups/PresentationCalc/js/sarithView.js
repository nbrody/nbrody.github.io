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
function scatter(points, weights, nArch, archNames = ['the first place at ∞', 'the second']) {
    if (!points || points.length < 2) return '';
    const nTree = weights.length;
    const treeL2 = (p) => Math.sqrt(p.tree.reduce((acc, d, i) => acc + (weights[i] * d) ** 2, 0));
    let fx, fy, xl, yl;
    if (nArch && nTree) { fx = (p) => p.arch[0]; fy = treeL2; xl = 'd at ∞'; yl = 'd in the trees'; }
    else if (nArch >= 2) { fx = (p) => p.arch[0]; fy = (p) => p.arch[1]; xl = `d at ${archNames[0]}`; yl = `d at ${archNames[1]}`; }
    else if (nTree >= 2) { fx = (p) => weights[0] * p.tree[0]; fy = (p) => Math.sqrt(p.tree.slice(1).reduce((acc, d, i) => acc + (weights[i + 1] * d) ** 2, 0)); xl = 'd in the first tree'; yl = 'd in the others'; }
    else { fx = (p) => p.h; fy = (p, i) => (i * 0.618) % 1; xl = 'd(o, g·o)'; yl = ''; }
    const pts = points.map((p, i) => ({ x: fx(p, i), y: fy(p, i), a: p.active }));
    const X = Math.max(1e-9, ...pts.map((p) => p.x)), Y = Math.max(1e-9, ...pts.map((p) => p.y));
    const W = 560, H = 220, m = 30;
    const sx = (x) => m + (W - 2 * m) * x / X, sy = (y) => H - m - (H - 2 * m) * y / Y;
    let svg = `<svg class="dir-scatter" viewBox="0 0 ${W} ${H}" aria-label="Orbit points found">`;
    svg += `<line class="axis" x1="${m}" y1="${H - m}" x2="${W - m}" y2="${H - m}"/><line class="axis" x1="${m}" y1="${m}" x2="${m}" y2="${H - m}"/>`;
    svg += `<text class="lbl" x="${W - m}" y="${H - 9}" text-anchor="end">${esc(xl)} →</text>`;
    if (yl) svg += `<text class="lbl" x="${m + 4}" y="${m - 10}">↑ ${esc(yl)}</text>`;
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

export function sarithCard(S, model, nGens) {
    let html = '<div class="vc-inner">';
    // Γ discrete at a place: whether it is a lattice there (main.js, discreteArith), one sentence per line
    if (S.lattice) return html + banner(S.status === 'yes' ? 'yes' : 'open', S.lattice.lines) + '</div>';
    if (S.exact && S.exact.index) {
        const E = S.exact;
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
        html += para([`The coset table has $${E.index}$ cosets, and it was checked again: every relator of $\\Lambda$ and every generator of $\\Gamma$ closes up.`, `This took ${E.ms} ms.`]);
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
    const metric = S.metric === 'unit' ? 'in which a tree edge has length $1$, as in the SO(3) project' : 'in which a tree edge has length $\\log q$';
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
            `They are measured only against the ${D.considered} lowest orbit points found, as in the SO(3) project, so they are the facets of the partial Dirichlet domain those points cut out.`,
        ]);
        html += scatter(D.points, r.weights || [], nArch, (S.archFactors || []).map((a) => a.label));
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
            html += `<p><button class="btn btn-add-alt" id="copy-gap">Copy ⟨g | relations⟩ for GAP</button></p>`;
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
            const label = repTex ? ` = ${repTex[i].map((t) => tex(t)).join(' × ')}` : '';
            html += `<div class="cov-rep"><div class="cov-rep-head">\\(${repName(i)}\\)${label}</div>`;
            html += `<div class="cov-stars">${perPlace.map((st) => `<div>${star(st)}</div>`).join('')}</div></div>`;
        });
        html += '</div>';
    }
    if (r && r.status === 'covered' && r.witnesses) {
        html += r.verify && r.verify.ok
            ? para([`All ${r.verify.checked} neighbours were checked again from scratch.`, 'Each word below, multiplied out exactly, carries its representative onto the neighbour.'])
            : `<p class="note">The re-check failed: ${esc((r.verify && r.verify.failures || []).slice(0, 3).join('; '))}.</p>`;
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
                'So the elements of $\\Gamma$ fixing $o$ that the search found must contain a full lattice of unipotents at a cusp, and then they have finite index in $\\Lambda_o$ by Vaserstein’s theorem.',
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
            if (st.status === 'running') html += para([st.harvesting ? 'FlashBeam is collecting more elements that fix $o$…' : 'Poincaré is computing their Dirichlet domain…']);
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
    const T = rels.map((w) => relatorTexNamed(w, names, orders));
    if (T.length <= 6 && T.join('').length < 120) return `<div class="pres-block">${tex(`${G} = \\left\\langle ${names.join(', ')} \\;\\middle|\\; ${T.join(',\\ ') || '\\ '} \\right\\rangle`)}</div>`;
    const shown = 60;
    let html = `<div class="pres-block">${tex(`${G} = \\left\\langle ${names.join(', ')} \\;\\middle|\\; r_1, \\ldots, r_{${T.length}} \\right\\rangle`)}:</div>`;
    html += `<ol class="pres-rels">${T.slice(0, shown).map((t) => `<li>${tex(t)}</li>`).join('')}</ol>`;
    if (T.length > shown) html += `<details class="pres-more"><summary>${T.length - shown} more relators</summary><ol class="pres-rels" start="${shown + 1}">${T.slice(shown).map((t) => `<li>${tex(t)}</li>`).join('')}</ol></details>`;
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
    const ringTex = R.ring ? { 1: '\\mathbb{Z}[i]', 2: '\\mathbb{Z}[\\sqrt{-2}]', 3: '\\mathbb{Z}[\\omega]' }[R.ring] : '\\mathbb{Z}';
    // over the rings, entries in the ring's generator (i, √−2, ω), not the letter w of the generator w
    const sym = R.ring ? { 1: 'i', 2: '\\sqrt{-2}', 3: '\\omega' }[R.ring] : null;
    const ent = (x) => (sym ? String(x).replace(/−/g, '-').replace(/(\d)w/g, '$1' + sym).replace(/w/g, sym) : String(x));
    const matTex = (M) => `\\left(\\begin{smallmatrix}${M.map(ent).join('&').replace(/&([^&]*)&/, '&$1\\\\')}\\end{smallmatrix}\\right)`;
    const Stex = (R.S || []).map((x) => (R.ring ? `(${ent(x)})` : x)).join('\\cdot ') || '1', Ltex = `\\mathrm{PGL}_2(${ringTex}[1/${Stex}])`;
    // Λ on its standard generators
    if (R.lambda && !R.lambda.error) {
        const lnames = R.lambda.gens.map((g) => g.name.replace(/_(\d+)$/, '_{$1}').replace(/_\{(.*)\}$/, (m0, x) => `_{${ent(x)}}`));
        const gensTex = R.lambda.gens.map((g, i) => `$${lnames[i]} = ${matTex(g.M)}$`).join(', ');
        html += para(R.ring
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
    // Γ
    if (Pr.error) return html + para([`No presentation of $\\Gamma$ was found: ${String(Pr.error).replace(/\$/g, '')}.`]);
    const names = Pr.gens.map((g) => g.name.replace(/^g(\d+)$/, 'g_{$1}').replace(/^h(\d+)$/, 'h_{$1}'));
    const extra = Pr.gens.filter((g) => g.given === null);
    const ab = Pr.abelian, H1 = [ab.rank ? (ab.rank === 1 ? '\\mathbb{Z}' : `\\mathbb{Z}^{${ab.rank}}`) : null, ...ab.torsion.map((d) => `\\mathbb{Z}/${d}`)].filter(Boolean).join(' \\oplus ') || '0';
    const sub = Pr.kernelIndex > 1 ? [
        `$\\Gamma$ is not inside $\\Lambda$: its elements of even valuation at the other primes form a normal subgroup $K$ of index $${Pr.kernelIndex}$, and $[\\Lambda : K] = ${Pr.index}$.`,
        "So the presentation of $\\Gamma$ adds coset representatives of $K$, with their squares, their commutators and their action on the generators of $K$, all written in $K$.",
    ] : [];
    const from = Pr.tableFrom === 'congruence'
        ? [
            `Coset enumeration did not close in time, so the action of $\\Lambda$ on the ${Pr.index.toLocaleString()} cosets of $\\Gamma$ is read off from the congruence description: a coset $\\Gamma g$ is labelled by its class of determinants and by the coset of $H_0$ containing $g$ mod $N$.`,
            'This was checked to be an action in which every relator of $\\Lambda$ closes and $\\Gamma$ fixes its coset.',
            `Reidemeister–Schreier on it gives ${Pr.rs.generators} generators and ${Pr.rs.relators} relators.`,
        ]
        : [`Reidemeister–Schreier on the ${Pr.index.toLocaleString()} cosets of the coset table gives ${Pr.rs.generators} generators and ${Pr.rs.relators} relators.`];
    html += `<p><b>${mix('A presentation of $\\Gamma$.')}</b> ${mix([
        ...from, ...sub,
        `Tietze moves remove the Schreier generators in favour of the given ones${extra.length ? `, except ${extra.length === 1 ? 'one, which is' : `${extra.length}, which are`} written out below` : ''}.`,
        'Every relator is multiplied out and checked to be the identity.',
    ].join(' '))}</p>`;
    const rels = Pr.relators;
    html += presBlock('\\Gamma', names, rels);
    if (extra.length) html += para([`Here ${Pr.gens.map((g, i) => (g.given === null ? `$${names[i]} = ${matTex(g.M)}$` : null)).filter(Boolean).join(', ')}.`]);
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
