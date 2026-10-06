/**
 * zariskiView.js — steps 1 and 3 as HTML: the Zariski closure of Γ and its
 * arithmetic data, and the congruence closure, from the Zariski Closure
 * engine's result (Algebraic/Tools/zariskiClosure/pgl2Engine.js). The wording
 * follows that page, which renders the same result.
 */

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const tex = (s, display = false) => (display ? `\\[${s}\\]` : `\\(${s}\\)`);
/** Text with $…$ math, escaped outside the math. */
export const mix = (s) => String(s).split(/(\$[^$]*\$)/).map((part) => (part.startsWith('$') && part.endsWith('$') && part.length > 1 ? `\\(${part.slice(1, -1)}\\)` : esc(part))).join('');
export const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The Q-form of the closure of a dense Γ, as text with $…$. */
export function qForm(A) {
    const k = A.k;
    if (A.A.split) return k.d === 1 ? 'the split form $\\mathrm{PGL}_2$' : '$\\mathrm{Res}_{k/\\mathbb{Q}}\\,\\mathrm{PGL}_2$';
    if (A.A.hamilton) return 'the anisotropic form $\\mathrm{PU}_2 \\cong \\mathrm{SO}_3$';
    return k.d === 1 ? '$\\mathrm{PGL}_1(A)$' : '$\\mathrm{Res}_{k/\\mathbb{Q}}\\,\\mathrm{PGL}_1(A)$';
}

export function kName(A) {
    return A.k.d === 1 ? '$k = \\mathbb{Q}$' : `$k = ${A.k.tex}$`;
}

/** One line for the Verdict tab. */
export function zariskiLine(res) {
    const C = res.closure;
    if (C.kind !== 'dense') return { head: 'Not Zariski dense', detail: C.summary.replace(/⟨S⟩/g, 'Γ') };
    const A = res.arith;
    const S = A.ring.S;
    return {
        head: 'Zariski dense',
        detail: `Closure over ℚ: ${qForm(A).replace(/\$[^$]*\$/g, (m) => texToText(m.slice(1, -1)))}. ${S.length ? `Unbounded at ${S.map((s) => texToText(s.tex)).join(', ')}.` : 'Integral traces: bounded at every prime.'}`,
    };
}

/** A rough plain-text form of small TeX, for one-line summaries. */
const SUBD = '₀₁₂₃₄₅₆₇₈₉';
export function texToText(t) {
    return String(t)
        .replace(/_\{?(\d+)\}?/g, (_, d) => d.split('').map((c) => SUBD[+c]).join(''))
        .replace(/\\mathbb\{G\}/g, '𝔾').replace(/\\rtimes/g, '⋊').replace(/\\mathbb\{R\}/g, 'ℝ').replace(/\\mathbb\{C\}/g, 'ℂ')
        .replace(/\\mathrm\{([^}]*)\}/g, '$1').replace(/\\mathbb\{Q\}/g, 'ℚ').replace(/\\mathbb\{Z\}/g, 'ℤ')
        .replace(/\\mathcal\{O\}/g, '𝒪').replace(/\\mathfrak\{p\}/g, '𝔭').replace(/\\infty/g, '∞')
        .replace(/_\{([^}]*)\}/g, '_$1').replace(/\\Res/g, 'Res').replace(/\\,|\\ |\\left|\\right/g, ' ')
        .replace(/\\cong/g, '≅').replace(/\\tfrac\{1\}\{([^}]*)\}/g, '1/$1').replace(/[{}]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ').trim();
}

/** Step 1 as a card. */
export function zariskiCard(res, model) {
    const F = res.field, C = res.closure, A = res.arith;
    const nGens = res.gens.length;
    let html = '<div class="vc-inner">';
    html += `<h2>Step 1 · Zariski closure</h2>`;
    html += `<p class="lead">${mix(`Each generator is normalized by its first nonzero entry. The entries then lie in $F = ${model.degree === 1 ? '\\mathbb{Q}' : `\\mathbb{Q}(w)`}$${model.degree > 1 ? `, $${model.polyTex} = 0$` : ''}, and the closure is computed by the Zariski Closure engine.`)}</p>`;
    html += `<div class="head-math">${tex(`\\Gamma = \\langle ${res.gens.map((_, i) => `g_{${i + 1}}`).join(', ')} \\rangle \\le \\mathrm{PGL}_2(${F.n === 1 ? '\\mathbb{Q}' : 'K'})`, true)}</div>`;
    html += `<div class="head-math">${tex(`\\overline{\\Gamma}^{\\,\\mathrm{Zar}} = ${C.tex}`, true)}</div>`;
    if (A) html += `<div class="head-math">${tex(A.head.replace('\\langle S \\rangle', '\\Gamma'), true)}</div>`;

    const facts = [];
    const gl = res.gens.map((g, i) => {
        const kind = g.type === 'identity' ? 'scalar (trivial in PGL₂)' : g.order ? `${g.type}, order ${g.order}` : `${g.type}, infinite order`;
        return `<div>${tex(`g_{${i + 1}}`)}: ${tex(`\\operatorname{tr}^2/\\det = ${g.tauTex}`)} <span class="note">— ${esc(kind)}</span></div>`;
    }).join('');
    facts.push(['Generators', gl]);
    facts.push([mix('Closure over $\\overline{\\mathbb{Q}}$'), mix(`$${C.tex}$, of dimension $${C.dim}$${C.order ? `; $|\\Gamma| = ${C.order}$` : ''}`) + `<div class="note">${esc(C.summary.replace(/⟨S⟩/g, 'Γ'))}</div>`]);
    if (A) {
        const k = A.k;
        let kFact = mix(kName(A));
        if (k.d > 1) kFact += mix(`, degree $${k.d}$, signature $(${k.r1}, ${k.r2})$, $\\operatorname{disc} = ${k.discTex}$`);
        if (k.d > 2) kFact += `<div class="note">${mix(`$\\theta = ${k.thetaTex}$, minimal polynomial $${k.minpolyTex}$`)}</div>`;
        facts.push(['Invariant trace field', kFact]);
        let algFact = A.A.split ? mix('$A \\cong M_2(k)$, split everywhere')
            : mix(`$A = (${A.A.aTex},\\ ${A.A.bTex})_k$, ramified at $${A.A.ram.map((r) => r.tex).join(',\\ ')}$`) + (A.A.hamilton ? '<div class="note">Hamilton’s quaternions</div>' : '');
        if (!A.A.determined) algFact += `<div class="note">${mix(`Could not decide the dyadic place${A.A.undetermined.length > 1 ? 's' : ''} $${A.A.undetermined.join(',\\ ')}$.`)}</div>`;
        facts.push(['Quaternion algebra', algFact]);
        facts.push([mix('Closure over $\\mathbb{Q}$'), mix(`${qForm(A)}, of dimension $${A.G.dim}$`)]);
        facts.push(['Unbounded at', A.ring.S.length ? mix(`$S = \\{${A.ring.S.map((s) => s.tex).join(',\\ ')}\\}$`) : mix('no finite place: $\\Gamma$ has integral traces')]);
        if (A.spaces) {
            const sp = A.spaces;
            const parts = sp.factors.map((fct) => (fct.kind === 'tree' ? `$${fct.space}$ for $${fct.place}$`
                : fct.kind === 'real' ? `$${fct.space}$ for ${k.d === 1 ? 'the real place' : `the real place $${fct.place}$`}` : `$${fct.space}$ for a complex place`));
            let dd = mix(`$X = ${sp.productTex}$`) + `<div class="note">${mix(`Γ has an unbounded orbit in each factor: ${list(parts)}.`)}`;
            if (sp.bounded.length) dd += ' ' + mix(`It is bounded at $${sp.bounded.join(',\\ ')}$, where $A$ is ramified.`);
            dd += '</div>';
            facts.push(['Symmetric space', dd]);
        }
        facts.push(['Arithmetic group', mix(`$${A.head.replace('\\langle S \\rangle', '\\Gamma')}$`)
            + `<div class="note">${A.literal ? 'Every generator lies in this group as written.' : A.literal === false ? 'After conjugation, and for a finite-index subgroup (e.g. the group generated by squares).' : 'Up to conjugation and finite index.'}${A.lattice.length ? ' ' + mix(`The group on the right is a lattice in $${A.lattice.join(' \\times ')}$.`) : ''}</div>`]);
    }
    html += `<dl class="facts">${facts.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('')}</dl>`;
    if (C.kind !== 'dense') {
        html += `<div class="banner" data-status="info"><span class="dot"></span><div>${mix('Γ is not Zariski dense, so it is virtually solvable or finite: the pipeline stops here. Steps 2–4 are for dense groups.')}</div></div>`;
    }
    return html + '</div>';
}

/** Step 3 as a card. */
export function congruenceCard(A) {
    let html = '<div class="vc-inner"><h2>Step 3 · Congruence closure</h2>';
    if (!A || !A.congruence) return html + '<p class="lead">Not computed.</p></div>';
    const C = A.congruence, d = A.k.d;
    if (C.error) return html + `<p class="lead">${esc('Could not compute: ' + C.error)}</p></div>`;
    const levelTex = (c) => (d === 1 || /^\(\d+\)$/.test(c.tex) ? `${BigInt(c.p) ** BigInt(c.level)}` : `\\mathfrak{p}^{${c.level}}`);
    const closureCell = (c) => {
        if (c.status === 'full') return 'full';
        if (c.status === 'full-partial') return mix(`full modulo $${d === 1 ? `${c.p}^{${c.fullThrough}}` : `\\mathfrak{p}^{${c.fullThrough}}`}$; deeper levels not certified`);
        if (c.status === 'deficient' && c.index) return mix(`index $${c.index}$${c.level ? `, contains $\\Gamma(${levelTex(c)})$` : ''}`);
        if (c.status === 'deficient') return mix(c.indexAtLeast ? `index $\\ge ${c.indexAtLeast}$` : 'deficient');
        return 'not determined';
    };
    const notes = (c) => {
        const n = [];
        if (c.cosmetic) n.push(c.vertexTex ? mix(`cosmetic: the matrices are not integral here, but $\\Gamma$ fixes the vertex $${c.vertexTex}$`) : 'cosmetic: the matrices are not integral here, but Γ is bounded');
        if (c.ramifiedA) n.push(mix('$A$ is ramified: the local group is compact'));
        if (c.inverts) n.push('Γ inverts an edge; shown for its index-2 subgroup');
        if (c.note && c.status !== 'full-partial') n.push(esc(c.note));
        return n.join('<br>');
    };
    const special = C.checked.filter((c) => c.status !== 'full' || c.cosmetic || c.ramifiedA);
    const full = C.checked.filter((c) => c.status === 'full' && !c.cosmetic && !c.ramifiedA);
    const bad = C.checked.filter((c) => c.status === 'deficient');
    const undecided = C.checked.filter((c) => c.status === 'full-partial' || c.status === 'unknown');
    const outside = A.ring.S.length ? 'Outside $S$, the' : 'The';
    let lead;
    if (!bad.length && !undecided.length) lead = `${outside} closure of $\\Gamma$ is as large as possible at every prime: at each $\\mathfrak{p}$ it contains the image of $\\mathrm{SL}_1$ of a maximal order.`;
    else lead = `${outside} closure of $\\Gamma$ is as large as possible at every prime except ${list(bad.concat(undecided).map((c) => `$${c.tex}$`))}${C.totalIndex && !undecided.length && bad.length ? `; the product of the local indices is $${C.totalIndex}$` : ''}.`;
    html += `<p class="lead">${mix(lead)}</p>`;
    html += `<div class="banner" data-status="info"><span class="dot"></span><div>${mix(`This bounds $\\Gamma$ from above: $\\Gamma^{(2)}$ lies in the congruence group $\\Lambda \\cap \\overline{\\Gamma}$, so $[\\Lambda : \\Gamma^{(2)}] \\ge ${C.totalIndex && !undecided.length ? C.totalIndex : '[\\Lambda : \\Lambda \\cap \\overline{\\Gamma}]'}$. It cannot show that $\\Gamma$ has finite index: that is step 4.`)}</div></div>`;
    if (special.length) {
        html += '<div class="wrap"><table><thead><tr><th>Prime</th><th>q</th><th>Closure</th><th>Notes</th></tr></thead><tbody>';
        for (const c of special) html += `<tr><td>${tex(c.tex)}</td><td>${tex(c.q)}</td><td class="st-${c.status === 'full' ? 'full' : 'deficient'}">${closureCell(c)}</td><td class="note">${notes(c)}</td></tr>`;
        html += '</tbody></table></div>';
    }
    const others = full.map((c) => `$${c.tex}$`);
    const checkedPs = C.candidates.filter((p) => C.checked.some((c) => c.p === p));
    html += `<p class="note">${mix(`Primes that needed checking: $${checkedPs.join(',\\ ') || '\\varnothing'}$${others.length ? `; full at ${list(others)}` : ''}. Every other prime ${A.ring.S.length ? 'outside $S$ ' : ''}is full by Dickson's classification of subgroups of $\\mathrm{PGL}_2(\\mathbb{F}_q)$ and Serre's lifting lemma.`)}${C.complete ? '' : ' ' + esc('(Some norms could not be fully factored, so the list of primes may be incomplete.)')}</p>`;
    html += `<p class="note">${mix('Indices are for the part of $\\Gamma$ with square determinant, inside the image of $\\mathrm{SL}_1$; levels $\\Gamma(\\mathfrak{p}^m)$ are principal congruence subgroups at a vertex fixed by $\\Gamma$.')}</p>`;
    if (C.dets && C.dets.length) html += `<p class="note">${mix(`Determinants: those of $\\Gamma$ generate $\\langle ${C.dets.join(',\\ ')} \\rangle$ in $\\mathbb{Q}^\\times/(\\mathbb{Q}^\\times)^2$, so the indices are taken on the square-determinant part.`)}</p>`;
    return html + '</div>';
}

/** One line for the Verdict tab. */
export function congruenceLine(A) {
    if (!A || !A.congruence) return { head: 'Not computed', detail: '' };
    const C = A.congruence;
    if (C.error) return { head: 'Not computed', detail: C.error };
    const bad = C.checked.filter((c) => c.status === 'deficient');
    const undecided = C.checked.filter((c) => c.status === 'full-partial' || c.status === 'unknown');
    if (!bad.length && !undecided.length) return { head: 'Full at every prime outside S', detail: 'Γ⁽²⁾ is dense in the congruence completion of Λ.' };
    const parts = [];
    if (bad.length) parts.push(`deficient at ${bad.map((c) => texToText(c.tex)).join(', ')}${C.totalIndex && !undecided.length ? ` (index ${C.totalIndex})` : ''}`);
    if (undecided.length) parts.push(`not decided at ${undecided.map((c) => texToText(c.tex)).join(', ')}`);
    return { head: bad.length ? `Index ≥ ${C.totalIndex || '?'}` : 'Full where decided', detail: parts.join('; ') + '.' };
}
