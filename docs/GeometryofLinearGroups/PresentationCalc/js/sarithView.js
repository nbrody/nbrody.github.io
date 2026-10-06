/**
 * sarithView.js — step 4 as HTML: the FlashBeam covering search live, then
 * its certificate, and the check of the vertex stabilizer at ∞.
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

const COLORS = { self: '#34d399', other: '#5eead4', rep: '#a5b4fc', open: '#f87171' };

/** The link of a representative in one tree: the parent on top, the q children below. */
function star(states) {
    const n = states.length, R = 34, c = 44;
    let s = `<svg viewBox="0 0 88 88" aria-hidden="true">`;
    states.forEach((st, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
        const x = c + R * Math.cos(a), y = c + R * Math.sin(a);
        const col = COLORS[st] || COLORS.open;
        s += `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-opacity="${st === 'open' ? 0.35 : 0.8}" stroke-width="1.6"/>`;
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n > 20 ? 2.4 : 3.4}" fill="${st === 'open' ? 'none' : col}" stroke="${col}" stroke-width="1.2"/>`;
    });
    return s + `<circle cx="${c}" cy="${c}" r="5" fill="#e0e7ff"/></svg>`;
}

function chart(history) {
    if (history.length < 2 || history[history.length - 1].it <= history[0].it) return '';
    const W = 600, H = 110, last = history[history.length - 1].it || 1;
    const pts = history.map((h) => `${(W * h.it / last).toFixed(1)},${(H - 6 - (H - 12) * h.frac).toFixed(1)}`).join(' ');
    const reps = history.filter((h, i) => i && h.reps !== history[i - 1].reps)
        .map((h) => `<line x1="${(W * h.it / last).toFixed(1)}" y1="4" x2="${(W * h.it / last).toFixed(1)}" y2="${H - 4}" stroke="#a5b4fc" stroke-opacity="0.35" stroke-dasharray="3 3"/>`).join('');
    return `<svg class="cov-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Neighbours covered, by iteration">
        <line x1="0" y1="${H - 6}" x2="${W}" y2="${H - 6}" stroke="rgba(255,255,255,0.12)"/>
        <line x1="0" y1="6" x2="${W}" y2="6" stroke="rgba(255,255,255,0.06)"/>
        ${reps}<polyline points="${pts}" fill="none" stroke="#34d399" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
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

export function sarithCard(S, model) {
    let html = '<div class="vc-inner"><h2>Step 4 · Is Γ S-arithmetic?</h2>';
    if (S.phase === 'na') {
        html += `<div class="banner" data-status="open"><span class="dot"></span><div>${mix(S.note)}</div></div>`;
        return html + '</div>';
    }
    const trees = (S.places || []).map((pl) => placeTex(pl, model.degree));
    html += `<p class="lead">${mix(`FlashBeam looks for a finite set $R$ of vertices of $X = ${trees.length ? trees.join(' \\times ') : '\\prod_{\\mathfrak p \\in S} T_{\\mathfrak p}'}$ with $\\Gamma R$ closed under taking neighbours. Then $\\Gamma R = X$. Each neighbour of each $r \\in R$ needs a word $w$ with $w \\cdot r' = $ that neighbour, for some $r' \\in R$.`)}</p>`;
    if (S.notes && S.notes.length) html += `<p class="note">${esc(S.notes.join(' '))}</p>`;
    if (S.error) html += `<div class="banner" data-status="open"><span class="dot"></span><div>${esc(S.error)}</div></div>`;
    if (S.head) html += `<div class="banner" data-status="${S.status === 'yes' ? 'yes' : S.status === 'running' ? 'running' : 'open'}"><span class="dot"></span><div>${mix(S.head)}</div></div>`;

    const L = liveNumbers(S);
    html += '<div class="cov-stats">';
    html += stat('Iteration', L.it, 'cov-it');
    html += stat('Elements tried', L.visited.toLocaleString(), 'cov-visited');
    html += stat('Representatives', L.reps, 'cov-reps');
    html += stat('Neighbours covered', `${L.covered} / ${L.targets}`, 'cov-covered');
    html += '</div>';
    html += `<div class="cov-bar"><span id="cov-bar" style="width:${(100 * L.frac).toFixed(1)}%"></span></div>`;
    html += `<div id="cov-chart">${chart(S.history || [])}</div>`;

    // representatives and their links
    const links = S.result ? S.result.links : S.progress ? S.progress.links : null;
    const repTex = S.result ? S.result.reps.map((r) => r.tex) : null;
    if (links) {
        html += `<h3>Representatives and their neighbours</h3><p class="note">Each star is the link of a representative in one tree (the parent at the top). <span style="color:${COLORS.self}">●</span> reached from the same representative, <span style="color:${COLORS.other}">●</span> from another, <span style="color:${COLORS.rep}">●</span> itself a representative, <span style="color:${COLORS.open}">○</span> open.</p>`;
        html += '<div class="cov-reps">';
        links.forEach((perPlace, i) => {
            const name = i === 0 ? '<b>o</b>' : `<b>r${subN(i)}</b>`;
            const label = repTex ? ` = ${repTex[i].map((t) => tex(t)).join(' × ')}` : '';
            html += `<div class="cov-rep"><div class="cov-rep-head">${name}${label}</div>`;
            html += `<div class="cov-stars">${perPlace.map((st) => `<div>${star(st)}</div>`).join('')}</div></div>`;
        });
        html += '</div>';
    }

    // the certificate
    const r = S.result;
    if (r && r.status === 'covered' && r.witnesses) {
        html += `<h3>The certificate</h3>`;
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
