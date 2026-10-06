/**
 * sarithView.js — step 4 as HTML: FlashBeam in the adelic product live, then
 * its Dirichlet generators and relations, the covering certificate, and the
 * check of the vertex stabilizer at ∞.
 *
 * S (the page's run.sarith) = {
 *   phase: 'search' | 'stab' | 'done' | 'na', note, error,
 *   places: [{ p, index, q, primeTex }], notes,
 *   progress: { stats, reps, targets, covered, links }, history: [{ it, frac }],
 *   result: the worker's 'done' message, arch: { kind, root, n } | null,
 *   stab: { status: 'running' | 'yes' | 'no' | 'none', summary, used },
 *   status: 'running' | 'yes' | 'open', head
 * }
 */
import { esc, tex, mix } from './zariskiView.js';

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
    const parts = (S.archFactors || []).map((a, i, all) => `\\mathbb{H}^{${a.kind === 'real' ? 2 : 3}}${all.length > 1 ? `_{\\sigma_{${a.n}}}` : ''}`);
    for (const pl of S.places || []) parts.push(placeTex(pl, model.degree));
    return parts.length ? parts.join(' \\times ') : '\\{\\mathrm{pt}\\}';
}

/** Orbit points found: Dirichlet generators in colour, the rest grey. */
function scatter(points, weights, nArch) {
    if (!points || points.length < 2) return '';
    const nTree = weights.length;
    const treeL2 = (p) => Math.sqrt(p.tree.reduce((acc, d, i) => acc + (weights[i] * d) ** 2, 0));
    let fx, fy, xl, yl;
    if (nArch && nTree) { fx = (p) => p.arch[0]; fy = treeL2; xl = 'd at ∞'; yl = 'd in the trees'; }
    else if (nArch >= 2) { fx = (p) => p.arch[0]; fy = (p) => p.arch[1]; xl = 'd at σ₁'; yl = 'd at σ₂'; }
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

export function sarithCard(S, model, nGens) {
    let html = '<div class="vc-inner">';
    if (S.phase === 'na') {
        html += `<div class="banner" data-status="open"><span class="dot"></span><div>${mix(S.note)}</div></div>`;
        return html + '</div>';
    }
    const r = S.result;
    const trees = (S.places || []).length > 0;
    const metric = S.metric === 'unit' ? 'tree edges of length 1, as in the SO₃ project' : 'tree edges of length $\\log q$';
    html += `<p class="lead">${mix(`$\\Gamma$ is discrete in the product of $\\mathrm{PGL}_2$ over the places where it is unbounded, and acts on $X = ${spaceTex(S, model)}$ with the $\\ell^2$ product metric (${metric}). FlashBeam multiplies a beam of words by a persistent flash of the lowest elements found, scored by the height $d(o, g\\cdot o)$. Two words reaching one element give a relation. The Dirichlet generators are the $g$ for which the midpoint of $[o, g\\cdot o]$ has only $o$ and $g\\cdot o$ as nearest orbit points.`)}</p>`;
    if (S.notes && S.notes.length) html += `<p class="note">${esc(S.notes.join(' '))}</p>`;
    if (S.error) html += `<div class="banner" data-status="open"><span class="dot"></span><div>${esc(S.error)}</div></div>`;
    if (S.head) html += `<div class="banner" data-status="${S.status === 'yes' ? 'yes' : S.status === 'running' ? 'running' : 'open'}"><span class="dot"></span><div>${mix(S.head)}</div></div>`;

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
        html += `<h3>Dirichlet generators in X</h3>`;
        html += `<p class="note">${mix(`${D.pairs.length} generator${D.pairs.length === 1 ? '' : 's'} up to inverses (${D.active} elements; $g^{-1}$ is one exactly when $g$ is), ${D.tied} tied, among the ${D.considered} lowest orbit points found. They are measured against those points only, as in the SO₃ project: these are the facets of the partial Dirichlet domain those points cut out.`)}</p>`;
        html += scatter(D.points, r.weights || [], nArch);
        if (D.pairs.length) {
            const head = ['Generator', '$d(o, g\\cdot o)$'];
            for (let i = 0; i < nArch; i++) head.push(nArch > 1 ? `$\\mathbb{H}$ at $\\sigma_{${i + 1}}$` : '$\\mathbb{H}$');
            (S.places || []).forEach((pl) => head.push(model.degree > 1 && pl.primeTex ? `steps at $${pl.primeTex}$` : `steps at ${pl.p}`));
            head.push('clearance');
            html += `<div class="cov-words"><table><thead><tr>${head.map((h) => `<th>${mix(h)}</th>`).join('')}</tr></thead><tbody>`;
            for (const g of D.pairs) {
                html += `<tr><td><span class="word">${esc(wordText(g.word, 160))}</span>${g.involution ? ' <span class="note">(order 2)</span>' : g.withInverse ? ' <span class="note">and inverse</span>' : ''}</td><td>${g.h.toFixed(3)}</td>`;
                for (const d of g.arch) html += `<td>${d.toFixed(3)}</td>`;
                for (const t of g.tree) html += `<td>${t}</td>`;
                html += `<td>${g.clearance == null ? '—' : g.clearance.toFixed(3)}</td></tr>`;
            }
            html += '</tbody></table></div>';
        }
    }

    // relations, and the presentation they suggest
    if (r && r.relations) {
        html += `<h3>Relations found</h3>`;
        if (!r.relations.length) html += '<p class="note">No two words reached the same element.</p>';
        else {
            html += `<p class="note">${r.collisions.toLocaleString()} collisions gave ${r.relations.length} distinct relators (cyclically reduced, up to rotation and inverse). Each was checked exactly. The list need not be complete, so the presentation below is one to test, not one proved.</p>`;
            html += `<div class="cov-words"><table><tbody>${r.relations.slice(0, 40).map((w) => `<tr><td><span class="word">${esc(wordText(w, 200))}</span></td><td class="note">${w.length} letters</td></tr>`).join('')}</tbody></table></div>`;
            html += `<p><button class="btn btn-add-alt" id="copy-gap">Copy ⟨g | relations⟩ for GAP</button></p>`;
        }
    }

    // the covering certificate
    const links = r ? r.links : S.progress ? S.progress.links : null;
    const repTex = r ? r.reps.map((x) => x.tex) : null;
    if (trees && links) {
        html += `<h3>The covering certificate</h3><p class="note">${mix('A finite set $R$ of vertices of the trees, with every neighbour of every $r \\in R$ equal to $w \\cdot r\'$ for a word $w$ and some $r\' \\in R$. Then $\\Gamma R$ is every vertex. Each star is the link of a representative in one tree, with the parent at the top:')} <span class="key-self">●</span> reached from the same representative, <span class="key-other">●</span> from another, <span class="key-rep">●</span> itself a representative, <span class="key-open">○</span> open.</p>`;
        html += '<div class="cov-reps">';
        links.forEach((perPlace, i) => {
            const name = i === 0 ? '<b>o</b>' : `<b>r${subN(i)}</b>`;
            const label = repTex ? ` = ${repTex[i].map((t) => tex(t)).join(' × ')}` : '';
            html += `<div class="cov-rep"><div class="cov-rep-head">${name}${label}</div>`;
            html += `<div class="cov-stars">${perPlace.map((st) => `<div>${star(st)}</div>`).join('')}</div></div>`;
        });
        html += '</div>';
    }
    if (r && r.status === 'covered' && r.witnesses) {
        html += `<p class="note">${r.verify && r.verify.ok ? `All ${r.verify.checked} neighbours were checked again from scratch: each word below, multiplied out exactly, carries its representative onto the neighbour.` : `Re-check failed: ${esc((r.verify && r.verify.failures || []).slice(0, 3).join('; '))}`}</p>`;
        const rows = r.witnesses.slice().sort((a, b) => a.from - b.from || a.place - b.place || a.nbr - b.nbr);
        html += '<div class="cov-words"><table><thead><tr><th>Neighbour</th><th>Word</th></tr></thead><tbody>';
        for (const w of rows.slice(0, 400)) {
            const fromName = w.from === 0 ? 'o' : `r${subN(w.from)}`;
            const repName = w.rep === 0 ? 'o' : `r${subN(w.rep)}`;
            const where = (S.places || []).length > 1 ? ` in tree ${w.place + 1}` : '';
            html += `<tr><td>${w.nbr === 0 ? 'parent' : `child ${w.nbr - 1}`} of ${fromName}${where}</td><td><span class="word">${esc(wordText(w.word, 240))}</span> · ${repName}</td></tr>`;
        }
        html += '</tbody></table></div>';
        if (rows.length > 400) html += `<p class="note">${rows.length - 400} more rows are in the JSON.</p>`;
        html += '<p><button class="btn btn-add-alt" id="copy-cert">Copy the certificate (JSON)</button></p>';
    }

    // the stabilizer at ∞
    if (S.arch) {
        const st = S.stab || { status: 'waiting' };
        html += `<h3>The vertex stabilizer at ${S.arch.kind === 'real' ? 'the real place' : 'the complex place'}</h3>`;
        html += `<p class="note">${mix(`$A$ splits at one place $\\sigma$ at ∞, so $\\Lambda_o$ is a lattice in $\\mathrm{PGL}_2(${S.arch.kind === 'real' ? '\\mathbb{R}' : '\\mathbb{C}'})$. The elements of $\\Gamma$ fixing $o$ that the search found must generate a group of finite ${S.arch.kind === 'real' ? 'area in $\\mathbb{H}^2$' : 'volume in $\\mathbb{H}^3$'}: Poincaré's theorem on its Dirichlet domain decides.`)}</p>`;
        if (st.status === 'waiting') html += '<p class="note">After the covering.</p>';
        else if (st.status === 'none') html += `<p class="note">${esc(st.note || 'No element fixing o was found.')}</p>`;
        else {
            if (st.used) html += `<p class="note">Generators used (${st.used.length}): ${st.used.map((e) => `<span class="word">${esc(wordText(e.word, 80))}</span>`).join(', ')}</p>`;
            if (st.status === 'running') html += `<p class="note">${st.harvesting ? 'FlashBeam is collecting more elements fixing o…' : 'Poincaré is computing their Dirichlet domain…'}</p>`;
            else html += `<div class="banner" data-status="${st.status === 'yes' ? 'yes' : 'open'}"><span class="dot"></span><div>${esc(st.text || '')}</div></div>`;
            if (st.state) html += '<p><button class="btn btn-add-alt" id="show-stab">View their domain in Poincaré</button></p>';
        }
    }
    return html + '</div>';
}
