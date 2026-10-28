/**
 * zariskiView.js — steps 1 and 3 as HTML: the Zariski closure of Γ and its
 * arithmetic data, and the congruence closure, from the Zariski Closure
 * engine's result (Algebraic/Tools/zariskiClosure/pgl2Engine.js). The wording
 * follows that page, which renders the same result.
 */

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
import { patternTex, pointTex, powerName, modLConditionsTex, matrixTex } from './congruenceShape.js';
import { mathLine } from './texText.js';

export const tex = (s, display = false) => (display ? `\\[${s}\\]` : `\\(${s}\\)`);
/**
 * Text with $…$ math, as HTML for KaTeX: escaped outside the math. Unicode math left in the text
 * (Γ, ℂ₁, PGL₂(ℤ), g₁g₂⁻¹, S-arithmetic, …) is put in $…$ first (texText.js), so none is shown raw.
 */
export const mix = (s) => mathLine(String(s ?? '')).split(/(\$[^$]*\$)/).map((part) => (part.startsWith('$') && part.endsWith('$') && part.length > 1 ? `\\(${part.slice(1, -1)}\\)` : esc(part))).join('');
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

/** The Zariski engine's sentence (Unicode, with ⟨S⟩ for the group) as text with $…$ math. */
export const summaryTex = (s) => mathLine(String(s ?? '').replace(/⟨S⟩/g, 'Γ'));

/**
 * Primes of a number field for one-line summaries: the ideal as the engine writes it when it is
 * short, else 𝔭 ∣ p (numbered when several lie over one p). xs: [{ p, tex }]; returns TeX per entry.
 */
export function shortPrimes(xs) {
    const long = (x) => String(x.tex).length > 28;
    const over = new Map();
    for (const x of xs) if (long(x)) over.set(String(x.p), (over.get(String(x.p)) || 0) + 1);
    const seen = new Map();
    return xs.map((x) => {
        if (!long(x)) return x.tex;
        const p = String(x.p), k = (seen.get(p) || 0) + 1;
        seen.set(p, k);
        return `${over.get(p) > 1 ? `\\mathfrak{p}_{${k}}` : '\\mathfrak{p}'} \\mid ${p}`;
    });
}

/** The summary's line for step 1: { head, detail } as text with $…$ math. */
export function zariskiLineTex(res) {
    const C = res.closure;
    if (C.kind !== 'dense') return { head: 'Not Zariski dense', detail: summaryTex(C.summary) };
    const A = res.arith;
    const S = A.ring.S;
    return {
        head: 'Zariski dense',
        detail: `Closure over $\\mathbb{Q}$: ${qForm(A)}. ${S.length ? `Unbounded at ${list(shortPrimes(S).map((t) => `$${t}$`))}.` : 'Integral traces: bounded at every prime.'}`,
    };
}

/** One line for the batch records (plain text; the page uses zariskiLineTex). */
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

/**
 * The generators at each place (charSets.js): a row per generator, a column per space Γ acts on,
 * each cell a button; the selected cell's characteristic set below. chars: { table, sel } with
 * table = { status: 'running' | 'error' | 'done', columns, rows, notes, error }, sel = 'i:j'.
 */
export function generatorTableHtml(chars, nGens) {
    const T = chars && chars.table;
    if (!T || T.status === 'running') return `<p class="note">${mix('Classifying each generator at each place…')}</p>`;
    if (T.status === 'error') return `<p class="note">${mix(`Could not classify the generators: ${T.error}`)}</p>`;
    let html = '<div class="wrap"><table class="gt"><thead><tr><th></th>';
    for (const c of T.columns) {
        html += `<th class="gt-col">${tex(c.space)}<span class="gt-place">at ${tex(c.label)}${c.bounded ? ' · bounded' : ''}</span></th>`;
    }
    html += '</tr></thead><tbody>';
    T.rows.forEach((row, i) => {
        html += `<tr><th scope="row" class="gt-row">${tex(`g_{${i + 1}}`)}</th>`;
        row.forEach((cell, j) => {
            const key = `${i}:${j}`;
            html += `<td><button type="button" class="gt-cell${chars.sel === key ? ' sel' : ''}" data-gcell="${key}" data-cls="${cell.cls}" aria-pressed="${chars.sel === key}">${esc(cell.text)}</button></td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += `<div class="gt-detail">${generatorDetailHtml(chars, nGens)}</div>`;
    if (T.notes && T.notes.length) html += `<p class="note">${T.notes.map(mix).join(' ')}</p>`;
    return html;
}

/** The selected cell's characteristic set, or a hint. */
export function generatorDetailHtml(chars) {
    const T = chars && chars.table;
    if (!T || T.status !== 'done') return '';
    const [i, j] = String(chars.sel || '').split(':').map(Number);
    const cell = Number.isInteger(i) && T.rows[i] ? T.rows[i][j] : null;
    if (!cell) return `<p class="note">${mix('Click a cell for the axis, the fixed point in the space, or the fixed point on the boundary.')}</p>`;
    const c = T.columns[j];
    const head = `<p class="gt-head">${mix(`$g_{${i + 1}}$ in $${c.space}$, at $${c.label}$:`)} <span class="gt-kind" data-cls="${cell.cls}">${esc(cell.text)}</span></p>`;
    return head + cell.lines.map((l) => `<p>${mix(l)}</p>`).join('');
}

/** Step 1 as a card. chars: the generators at each place (generatorTableHtml). */
export function zariskiCard(res, model, chars = null) {
    const F = res.field, C = res.closure, A = res.arith;
    const nGens = res.gens.length;
    let html = '<div class="vc-inner">';
    html += `<p class="lead">${mix(`Each generator is normalized by its first nonzero entry. The entries then lie in $F = ${model.degree === 1 ? '\\mathbb{Q}' : `\\mathbb{Q}(w)`}$${model.degree > 1 ? `, $${model.polyTex} = 0$` : ''}, and the closure is computed by the Zariski Closure engine.`)}</p>`;
    html += `<div class="head-math">${tex(`\\Gamma = \\langle ${res.gens.map((_, i) => `g_{${i + 1}}`).join(', ')} \\rangle \\le \\mathrm{PGL}_2(${F.n === 1 ? '\\mathbb{Q}' : 'K'})`, true)}</div>`;
    html += `<div class="head-math">${tex(`\\overline{\\Gamma}^{\\,\\mathrm{Zar}} = ${C.tex}`, true)}</div>`;
    if (A) html += `<div class="head-math">${tex(A.head.replace('\\langle S \\rangle', '\\Gamma'), true)}</div>`;

    const facts = [];
    facts.push(['Generators', generatorTableHtml(chars, nGens)]);
    facts.push([mix('Closure over $\\overline{\\mathbb{Q}}$'), mix(`$${C.tex}$, of dimension $${C.dim}$${C.order ? `; $|\\Gamma| = ${C.order}$` : ''}`) + `<div class="note">${mix(summaryTex(C.summary))}</div>`]);
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
            let dd = mix(`$X = ${sp.productTex}$`) + `<div class="note">${mix(`$\\Gamma$ has an unbounded orbit in each factor: ${list(parts)}.`)}`;
            if (sp.bounded.length) dd += ' ' + mix(`It is bounded at $${sp.bounded.join(',\\ ')}$, where $A$ is ramified.`);
            dd += '</div>';
            facts.push(['Symmetric space', dd]);
        }
        facts.push(['Arithmetic group', mix(`$${A.head.replace('\\langle S \\rangle', '\\Gamma')}$`)
            + `<div class="note">${A.literal ? 'Every generator lies in this group as written.' : A.literal === false ? 'After conjugation, and for a finite-index subgroup (e.g. the group generated by squares).' : 'Up to conjugation and finite index.'}${A.lattice.length ? ' ' + mix(`The group on the right is a lattice in $${A.lattice.join(' \\times ')}$.`) : ''}</div>`]);
    }
    html += `<dl class="facts">${facts.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('')}</dl>`;
    if (C.kind !== 'dense') {
        html += `<div class="banner" data-status="info"><span class="dot"></span><div>${mix('$\\Gamma$ is not Zariski dense, so it is virtually solvable or finite. Steps 2 and 3 are for dense groups; its presentation is below.')}</div></div>`;
    }
    return html + '</div>';
}

/** Step 3 as a card. */
export function congruenceCard(A) {
    let html = '<div class="vc-inner">';
    if (!A || !A.congruence) return html + '<p class="lead">Not computed.</p></div>';
    const C = A.congruence, d = A.k.d;
    if (C.error) return html + `<p class="lead">${mix('Could not compute: ' + C.error)}</p></div>`;
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
        if (c.cosmetic) n.push(c.vertexTex ? mix(`cosmetic: the matrices are not integral here, but $\\Gamma$ fixes the vertex $${c.vertexTex}$`) : mix('cosmetic: the matrices are not integral here, but $\\Gamma$ is bounded'));
        if (c.ramifiedA) n.push(mix('$A$ is ramified: the local group is compact'));
        if (c.inverts) n.push(mix('$\\Gamma$ inverts an edge; shown for its index-$2$ subgroup'));
        if (c.note && c.status !== 'full-partial') n.push(mix(c.note));
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
    html += `<div class="banner" data-status="info"><span class="dot"></span><div>${mix(`This bounds $\\Gamma$ from above: $\\Gamma^{(2)}$ lies in the congruence group $\\Lambda \\cap \\overline{\\Gamma}$, so $[\\Lambda : \\Gamma^{(2)}] \\ge ${C.totalIndex && !undecided.length ? C.totalIndex : '[\\Lambda : \\Lambda \\cap \\overline{\\Gamma}]'}$. It cannot show that $\\Gamma$ has finite index: that is step 3.`)}</div></div>`;
    if (special.length) {
        html += '<div class="wrap"><table><thead><tr><th>Prime</th><th>q</th><th>Closure</th><th>Notes</th></tr></thead><tbody>';
        for (const c of special) html += `<tr><td>${tex(c.tex)}</td><td>${tex(c.q)}</td><td class="st-${c.status === 'full' ? 'full' : 'deficient'}">${closureCell(c)}</td><td class="note">${notes(c)}</td></tr>`;
        html += '</tbody></table></div>';
    }
    const others = full.map((c) => `$${c.tex}$`);
    const checkedPs = C.candidates.filter((p) => C.checked.some((c) => c.p === p));
    html += `<p class="note">${mix(`Primes that needed checking: $${checkedPs.join(',\\ ') || '\\varnothing'}$${others.length ? `; full at ${list(others)}` : ''}. Every other prime ${A.ring.S.length ? 'outside $S$ ' : ''}is full by Dickson's classification of subgroups of $\\mathrm{PGL}_2(\\mathbb{F}_q)$ and Serre's lifting lemma.`)}${C.complete ? '' : ' (Some norms could not be fully factored, so the list of primes may be incomplete.)'}</p>`;
    html += `<p class="note">${mix('Indices are for the part of $\\Gamma$ with square determinant, inside the image of $\\mathrm{SL}_1$; levels $\\Gamma(\\mathfrak{p}^m)$ are principal congruence subgroups at a vertex fixed by $\\Gamma$.')}</p>`;
    if (C.dets && C.dets.length) html += `<p class="note">${mix(`Determinants: those of $\\Gamma$ generate $\\langle ${C.dets.join(',\\ ')} \\rangle$ in $\\mathbb{Q}^\\times/(\\mathbb{Q}^\\times)^2$, so the indices are taken on the square-determinant part.`)}</p>`;
    return html + '</div>';
}

/** The summary's line for the congruence closure (from the engine): { head, detail } as text with $…$ math. */
export function congruenceLineTex(A) {
    if (!A || !A.congruence) return { head: 'Not computed', detail: '' };
    const C = A.congruence;
    if (C.error) return { head: 'Not computed', detail: C.error };
    const bad = C.checked.filter((c) => c.status === 'deficient');
    const undecided = C.checked.filter((c) => c.status === 'full-partial' || c.status === 'unknown');
    if (!bad.length && !undecided.length) {
        return { head: `Full at every prime${A.ring.S.length ? ' outside $S$' : ''}`, detail: '$\\Gamma^{(2)}$ is dense in the congruence completion of $\\Lambda$.' };
    }
    const names = shortPrimes(bad.concat(undecided)).map((t) => `$${t}$`);
    const head = !bad.length ? 'Full where decided' : C.totalIndex ? `Index $\\ge ${C.totalIndex}$` : 'Deficient';
    const parts = [];
    if (bad.length) parts.push(`${head === 'Deficient' ? '' : 'deficient '}at ${list(names.slice(0, bad.length))}${C.totalIndex && !undecided.length ? ` (index $${C.totalIndex}$)` : ''}`);
    if (undecided.length) parts.push(`not decided at ${list(names.slice(bad.length))}`);
    return { head, detail: `${parts.join('; ')}.` };
}

/** One line for the batch records (plain text; the page uses congruenceLineTex). */
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

/** Λ = PGL₂(ℤ[1/S]) as text and TeX. */
function lambdaName(A) {
    const ps = A.ring.S.map((s) => s.p);
    return { text: `PGL₂(ℤ[1/${ps.join('·')}])`, tex: `\\mathrm{PGL}_2(\\mathbb{Z}[1/${ps.join('\\cdot ')}])` };
}

/**
 * The congruence closure written out (congruenceShape.js): one formula for Δ ∩ Λ₀ when it is cut
 * out prime by prime by congruences, then each prime power of the level on its own (a switcher):
 * its congruences as a matrix pattern, the index, a fixed point of ℙ¹, and what is left when the
 * image is smaller than its pattern.
 */
export function closureShapeHtml(cong, A) {
    const D = cong && cong.shape;
    if (!cong || cong.status !== 'done') return '';
    if (D === undefined) return `<p class="note">${mix('Writing out the closure prime by prime…')}</p>`;
    if (!D || D.error) return D && D.error ? `<p class="note">${mix(`The closure could not be written out: ${D.error}.`)}</p>` : '';
    const ps = A.ring.S.map((x) => x.p), L0 = `\\mathrm{PSL}_2(\\mathbb{Z}[1/${ps.join('\\cdot ')}])`;
    let html = '<h3>The closure, written out</h3>';
    // cut out prime by prime: Δ ∩ Λ₀ is the intersection of the local conditions when the primes
    // are not linked, and lies in it otherwise (with the index, when that was counted)
    const clean = D.local.every((x) => (x.exact && x.conds) || x.byModL);
    if (clean) {
        const rel = D.linked === 1 || D.local.length === 1 ? '=' : '\\subseteq';
        // each prime as a matrix pattern, or, when that is a mess or there is none, by what g does
        // mod ℓ: fix a point of ℙ¹ (with its eigenvalue there), or lie in a cyclic group
        const how = (x) => (x.exact && x.conds && !(messy(x) && (x.byModL || isStabilizer(x))) ? 'pattern'
            : x.byModL ? 'modL' : 'point');
        const eigen = D.local.filter((x) => how(x) === 'modL' && x.modL.power > 1);
        const lam = (x) => (eigen.length > 1 ? `\\lambda_{${x.l}}` : '\\lambda');
        const P = patternTex(D.local.filter((x) => how(x) === 'pattern').flatMap((x) => x.conds));
        const condsAt = (x) => (how(x) === 'pattern' ? patternTex(x.conds).side
            : how(x) === 'point' ? [`g \\cdot ${pointTex(x.fixed[0])} \\equiv ${pointTex(x.fixed[0])} \\pmod{${x.q}}`]
                : modLConditionsTex(x.modL, x.l, lam(x)));
        const geo = D.local.filter((x) => how(x) !== 'pattern').flatMap(condsAt);
        // what the matrix does not show, one line per prime
        const rows = D.local.map((x) => condsAt(x).join(',\\ \\ ')).filter(Boolean);
        const head = `\\Delta \\cap \\Lambda_0 ${rel} \\left\\{ ${P.plain ? 'g' : `g = \\pm ${P.matrix}`} \\in ${L0}`;
        // one short condition fits on the line; more go under it, a line per prime
        const set = !rows.length ? `${head} \\right\\}`
            : rows.length === 1 && rows[0].length <= 70 ? `${head} \\;:\\; ${rows[0]} \\right\\}`
                : `\\begin{array}{l} ${head} \\;:\\; \\right. \\\\[4pt] ${rows.map((r, i) => (i < rows.length - 1 ? `\\qquad ${r}, \\\\[2pt]` : `\\qquad \\left. ${r} \\;\\right\\}`)).join(' ')} \\end{array}`;
        // full at every prime says nothing until the joint image is counted
        const full = P.plain && !geo.length;
        if (full && rel === '=') html += `<div class="head-math">${tex(`\\Delta \\cap \\Lambda_0 = \\Lambda_0 = ${L0}`, true)}</div>`;
        else if (!full) html += `<div class="head-math">${tex(set, true)}</div>`;
        const moved = D.local.filter((x) => how(x) === 'point' || (how(x) === 'modL' && ['borel', 'split'].includes(x.modL.kind)));
        if (moved.length) {
            html += `<p class="note">${mix(`Here $g$ acts on $\\mathbb{P}^1$${eigen.length ? ' and on column vectors' : ''} by reduction modulo ${moved.map((x) => `$${how(x) === 'point' ? x.q : x.l}$`).join(' and ')}${eigen.length ? `, and $${eigen.map(lam).join(', ')}$ ${eigen.length > 1 ? 'are its eigenvalues' : 'is its eigenvalue'} on the line through that point` : ''}.`)}</p>`;
        }
        if (!P.plain) html += `<p class="note">${mix(`Here $a, b, c, d$ run over $\\mathbb{Z}[1/S]$ with $ad - bc = 1$, and each condition is a congruence modulo a prime outside $S$${D.local.length > 1 && D.linked === 1 ? '; the conditions at different primes are independent' : ''}.`)}</p>`;
    }
    const B = D.classes;
    html += `<p class="note">${mix(B.basis.length
        ? `$\\Delta$ meets ${B.gamma} of the ${B.lambda} classes of $\\Lambda / \\Lambda_0$: its determinants, modulo squares of $S$-units, are $\\langle ${B.basis.join(',\\ ')} \\rangle$.`
        : 'Every determinant in $\\Gamma$ is the square of an $S$-unit, so $\\Delta \\subset \\Lambda_0$.')}</p>`;
    // one prime power at a time: the first with a condition, unless one was picked
    const interesting = (x) => !(x.exact && x.conds && x.conds.length === 0);
    const pick = cong.sel != null && D.local.some((x) => x.q === cong.sel) ? cong.sel : (D.local.find(interesting) || D.local[0]).q;
    if (D.local.length > 1) {
        html += `<div class="cq-tabs" role="tablist" aria-label="One prime at a time">${D.local.map((x) => `<button class="cq-tab" role="tab" data-cq="${x.q}" aria-selected="${x.q === pick}">mod ${x.q}</button>`).join('')}</div>`;
    }
    for (const x of D.local) html += `<div class="cq-panel" data-cq="${x.q}"${x.q === pick ? '' : ' hidden'}>${localHtml(x)}</div>`;
    if (D.linked === null && D.local.length > 1) {
        html += `<p class="note">${mix('The joint image modulo $N$ was too large to count, so whether the primes are linked was not decided: $\\Delta$ may be smaller than the intersection of their conditions.')}</p>`;
    } else if (D.linked > 1) {
        html += `<p class="note">${mix(`The primes are linked${clean ? `: $\\Delta \\cap \\Lambda_0$ has index $${D.linked}$ in the set above` : ''}. Modulo $N = ${D.local.map((x) => x.q).join(' \\cdot ')}$, the image of $\\Gamma \\cap \\Lambda_0$ has index $${D.linked}$ in the product of its images at each prime, so a condition at one prime constrains $g$ at another (Goursat).`)}</p>`;
    }
    return html;
}

/** Does the pattern need conditions mixing entries, other than a ≡ d? */
const messy = (x) => !!(x.conds && x.conds.some((c) => c.f.filter((v) => v).length > 1 && !(c.f[0] === 1 && c.f[3] === -1 && !c.f[1] && !c.f[2])));

/** Is the local closure exactly the stabilizer of its one fixed point of ℙ¹(ℤ/q)? (index q/ℓ · (ℓ + 1)) */
const isStabilizer = (x) => !!(x.exact && x.fixed && x.fixed.length === 1 && x.order && Math.round(x.ambient / x.order) === (x.q / x.l) * (x.l + 1));

/** The residues ±u of a subgroup of 𝔽_ℓ^× containing −1, as TeX. */
const unitsTex = (units, l) => `\\{ ${units.filter((u) => 2 * u < l).map((u) => `\\pm ${u}`).join(', ')} \\}`;

/**
 * The image mod ℓ in words (congruenceShape.js's shapeModL). these: the sentence explains a set
 * already written as conditions on g ("These are the g that …"); otherwise it reports the image.
 */
function modLWords(s, l, these) {
    const F = `\\mathbb{F}_{${l}}`, P1 = `$\\mathbb{P}^1(${F})$`, PSL = `$\\mathrm{PSL}_2(${F})$`;
    const who = these ? 'These are the $g$ that' : `Modulo $${l}$, its elements`;
    const ord = s.order ? `, of order $${s.order}$ in ${PSL}` : '';
    if (s.kind === 'full') return `Modulo $${l}$ it is all of ${PSL}.`;
    if (s.kind === 'trivial') return `Modulo $${l}$ it is trivial: every element is $\\equiv ${l > 2 ? '\\pm ' : ''}1 \\pmod{${l}}$.`;
    if (s.kind === 'borel') {
        const [P] = s.points, at0 = P[1] === 0;
        const conj = (name) => (at0 ? `that is, $${name}$` : `a conjugate of $${name}$`);
        if (s.power === 1) return `${who} fix the point $${pointTex(P)}$ of ${P1}: the stabilizer of that point, ${conj(`\\Gamma_0(${l})`)} modulo $${l}$${these ? '' : ord}.`;
        if (s.units && s.units.length === 2) return `${who} fix the point $${pointTex(P)}$ of ${P1} and act on the line through it by $\\pm 1$: ${conj(`\\Gamma_1(${l})`)} modulo $${l}$${these ? '' : ord}.`;
        const H = `H = (${F}^{\\times})^{${s.power}}${s.units ? ` = ${unitsTex(s.units, l)}` : ''}`;
        const head = `${who} fix the point $${pointTex(P)}$ of ${P1} and act on the line through it by ${powerName(s.power)}${these ? '' : ord}`;
        return at0 ? `${head}: that is, $\\Gamma_H(${l})$ modulo $${l}$, with $${H}$.`
            : `${head}. Moving $${pointTex(P)}$ to $[1 : 0]$ turns this into $\\Gamma_H(${l})$ modulo $${l}$, with $${H}$.`;
    }
    if (s.kind === 'split') {
        const [P, Q] = s.points, two = `the points $${pointTex(P)}$ and $${pointTex(Q)}$ of ${P1}`;
        return s.power === 1 ? `${who} fix ${two}: a split Cartan subgroup${these ? '' : ord}.`
            : `${who} fix ${two}, and act on the line through $${pointTex(P)}$ by ${powerName(s.power)}: a subgroup of index $${s.power}$ in a split Cartan subgroup${these ? '' : ord}.`;
    }
    if (s.kind === 'split-normalizer') {
        const [P, Q] = s.points;
        return `Modulo $${l}$, its elements fix or swap the points $${pointTex(P)}$ and $${pointTex(Q)}$ of ${P1}: it lies in the normalizer of a split Cartan subgroup${ord}.`;
    }
    if (s.kind === 'cyclic') {
        const gen = s.gen ? ` generated by $${l > 2 ? '\\pm ' : ''}${matrixTex(s.gen)}$` : '';
        const cartan = `a non-split Cartan subgroup, the elements of norm $1$ in $\\mathbb{F}_{${l * l}}^{\\times}$${l > 2 ? ' modulo $\\pm 1$' : ''}`;
        const m = (l + 1) / (l > 2 ? 2 : 1) / s.order;
        const where = s.cartan ? `it is ${cartan}` : `it has index $${m}$ in ${cartan}`;
        return these ? `These are the $g$ whose reduction lies in the cyclic group${gen}, of order $${s.order}$ in ${PSL}. It fixes no point of ${P1}: ${where}.`
            : `Modulo $${l}$ it is the cyclic group${gen}${ord}. It fixes no point of ${P1}: ${where}.`;
    }
    if (s.kind === 'dihedral') return `Modulo $${l}$ it is dihedral${ord}, and preserves no point or pair of points of ${P1}: it lies in the normalizer of a non-split Cartan subgroup.`;
    if (['A4', 'S4', 'A5'].includes(s.kind)) return `Modulo $${l}$ it is exceptional: isomorphic to $${s.kind[0]}_${s.kind[1]}$${ord}.`;
    return `Modulo $${l}$ it fixes no point of ${P1}${ord}.`;
}

/** One prime power q = ℓ^k of the level, in sentences. */
function localHtml(x) {
    const lines = [];
    const field = x.k === 1 ? `\\mathbb{F}_{${x.q}}` : `\\mathbb{Z}/${x.q}`;
    const SL = `\\mathrm{SL}_2(${field})/{\\pm 1}`;
    const index = x.order ? Math.round(x.ambient / x.order) : null;
    const of = index ? `, of index $${index}$ in $${SL}$` : '';
    const s = x.modL;
    let saidModL = false;
    if (x.exact && x.conds && !x.conds.length) {
        lines.push(`Modulo $${x.q}$, the image of $\\Gamma \\cap \\Lambda_0$ is all of $${SL}$: there is no condition at $${x.l}$.`);
        saidModL = true;
    } else if (x.byModL && (messy(x) || !(x.exact && x.conds))) {
        // what g does mod ℓ first; congruences that mix the entries only after it
        lines.push(`Modulo $${x.q}$, the image of $\\Gamma \\cap \\Lambda_0$ is $\\left\\{ \\pm g \\;:\\; ${modLConditionsTex(s, x.l).join(',\\ \\ ')} \\right\\}$${of}.`);
        lines.push(modLWords(s, x.l, true));
        if (x.k > 1) lines.push(`It contains every $g \\equiv ${x.l > 2 ? '\\pm ' : ''}1 \\pmod{${x.l}}$, so only $g$ modulo $${x.l}$ matters.`);
        if (x.exact && x.conds) {
            const P = patternTex(x.conds);
            lines.push(`In coordinates, it is $\\left\\{ \\pm ${P.matrix} \\;:\\; ${P.side.join(',\\ \\ ')} \\right\\}$.`);
        }
        saidModL = true;
    } else if (x.exact && x.conds) {
        const P = patternTex(x.conds);
        lines.push(`Modulo $${x.q}$, the image of $\\Gamma \\cap \\Lambda_0$ is $\\left\\{ \\pm ${P.matrix} ${P.side.length ? `\\;:\\; ${P.side.join(',\\ \\ ')}` : ''} \\right\\}$${of}.`);
        if (isStabilizer(x)) {
            const [Pt] = x.fixed;
            lines.push(`This is the stabilizer of the point $${pointTex(Pt)}$ of $\\mathbb{P}^1(${field})$, ${Pt[1] === 0 ? `that is, $\\Gamma_0(${x.q})$` : `a conjugate of $\\Gamma_0(${x.q})$`}.`);
            saidModL = true;
        } else if (x.fixed && x.fixed.length) {
            lines.push(`It fixes the point${x.fixed.length > 1 ? 's' : ''} ${x.fixed.map((Pt) => `$${pointTex(Pt)}$`).join(' and ')} of $\\mathbb{P}^1(${field})$.`);
        }
        // the image mod ℓ only when the pattern hides it (a non-split Cartan, or a mixing congruence)
        if (!s || (!messy(x) && ['full', 'trivial', 'borel', 'split'].includes(s.kind))) saidModL = true;
    } else if (x.conds && x.conds.length) {
        const P = patternTex(x.conds);
        lines.push(`Modulo $${x.q}$, the image of $\\Gamma \\cap \\Lambda_0$ lies in $\\left\\{ \\pm ${P.matrix} ${P.side.length ? `\\;:\\; ${P.side.join(',\\ \\ ')}` : ''} \\right\\}$${x.inside ? `, with index $${x.inside}$ there` : ''}${of}.`);
    } else if (x.conds) {
        lines.push(`Modulo $${x.q}$, no linear congruence holds on the image of $\\Gamma \\cap \\Lambda_0$${index ? `, which has index $${index}$ in $${SL}$` : ''}.`);
    } else {
        lines.push(`Modulo $${x.q}$, the linear span of the image has index $${x.hullIndex}$ in $M_2(\\mathbb{Z}/${x.q})$, but no short congruences cut it out${index ? `; the image has index $${index}$ in $${SL}$` : ''}.`);
    }
    if (x.order === null) {
        lines.push(`The image modulo $${x.q}$ is too large to list here, so whether it is all of ${x.conds && x.conds.length ? 'this set' : `$${SL}$`} is not decided.`);
    }
    if (!saidModL && s) {
        lines.push(modLWords(s, x.l, false));
        if (x.k > 1 && x.kernel) {
            const K = `$g \\equiv ${x.l > 2 ? '\\pm ' : ''}1 \\pmod{${x.l}}$`;
            lines.push(x.kernel === x.fullKernel ? `It contains every ${K}, so only $g$ modulo $${x.l}$ matters.`
                : x.kernel === 1 ? `Reduction modulo $${x.l}$ maps it isomorphically onto that image: its only elements with ${K} are $\\pm 1$.`
                    : `Of the $${x.fullKernel}$ classes modulo $${x.q}$ with ${K}, it contains $${x.kernel}$.`);
        }
    }
    return lines.map((l) => `<p>${mix(l)}</p>`).join('');
}

/**
 * One line for the summary: the joint congruence closure over ℚ (congruence.js) when it was
 * computed, else the engine's prime-by-prime line. cong = { status, result, error } or null.
 */
export function jointCongruenceLine(cong, A) {
    const J = cong && cong.result;
    if (cong && cong.status === 'running') return { status: 'running', head: 'Computing…', detail: '' };
    if (!J || J.status === 'na' || J.status === 'too-large') {
        const e = congruenceLineTex(A);
        const why = J && J.reason ? J.reason : cong && cong.error ? cong.error : '';
        return { status: A && A.congruence && !A.congruence.error ? 'info' : 'open', head: e.head, detail: `${e.detail}${why && A.k.d === 1 && A.ring.S.length ? ` (The joint closure was not computed: ${why}.)` : ''}` };
    }
    const L = lambdaName(A);
    const classes = `$\\Gamma$ meets ${J.classes.gamma} of the ${J.classes.lambda} determinant classes`;
    if (J.index === 1 && J.status === 'exact') {
        return { status: 'info', head: '$\\Delta = \\Lambda$', detail: `$\\Gamma$ is dense in the congruence completion of $\\Lambda = ${L.tex}$, so it is $S$-arithmetic only if it is all of $\\Lambda$.` };
    }
    const rel = J.status === 'exact' ? '=' : '\\ge';
    return {
        status: 'info', head: `$[\\Lambda : \\Delta] ${rel} ${J.index.toLocaleString().replace(/,/g, '{,}')}$`,
        detail: `$\\Lambda = ${L.tex}$; levels $${J.levels.length ? J.levels.join(' \\cdot ') : '\\text{none}'}$; ${classes}. $\\Gamma$ is $S$-arithmetic exactly when $[\\Lambda : \\Gamma] = [\\Lambda : \\Delta]$${J.status === 'exact' ? '' : '; this is a lower bound'}.`,
    };
}

/** The congruence part of card 1: the joint closure (over ℚ), then the engine's local analysis. */
export function congruenceSection(cong, A) {
    if (!A || !A.congruence) return '<div class="vc-inner"><p class="lead">Not computed.</p></div>';
    let html = '';
    const J = cong && cong.result;
    if (cong && cong.status === 'running') html += `<div class="vc-inner"><p class="lead">${mix('Computing the joint image of $\\Gamma$…')}</p></div>`;
    else if (J && (J.status === 'exact' || J.status === 'lower')) {
        const L = lambdaName(A);
        const rel = J.status === 'exact' ? '=' : '\\ge';
        html += '<div class="vc-inner">';
        html += `<div class="head-math">${tex(`[\\Lambda : \\Delta] ${rel} ${J.index}, \\qquad \\Lambda = ${L.tex}`, true)}</div>`;
        html += `<p class="lead">${mix(`$\\Delta$ is the closure of $\\Gamma$ in the congruence topology. $\\Lambda$ has the congruence subgroup property, so $[\\Lambda : \\Gamma] \\ge [\\Lambda : \\Delta]$, with equality exactly when $\\Gamma$ is $S$-arithmetic.`)}</p>`;
        const facts = [
            ['Levels', mix(`$N = ${J.levels.length ? J.levels.join(' \\cdot ') : '1'}$`) + `<div class="note">${mix('The primes where the closure is smaller than $\\mathrm{SL}_2(\\mathbb{Z}_\\ell)$, from the engine below, and $2$ and $3$, each followed up its powers until the index stops growing.')}</div>`],
            ['Determinant', mix(`$\\Gamma$ meets ${J.classes.gamma} of the ${J.classes.lambda} classes of $\\Lambda/\\Lambda_0$ (the sign of $\\det$ and the parities of its valuations at $S$), where $\\Lambda_0 = \\mathrm{PSL}_2(\\mathbb{Z}[1/S])$.`)],
            ['Image', mix(`$\\Gamma \\cap \\Lambda_0$ has ${J.image.toLocaleString()} elements modulo $N$, of ${J.ambient.toLocaleString()} in $\\mathrm{SL}_2(\\mathbb{Z}/N)/\\pm1$.`) + `<div class="note">${(J.ms / 1000).toFixed(1)} s</div>`],
        ];
        if (J.notes && J.notes.length) facts.push(['Lower bound', J.notes.map((n) => `<div>${mix(n)}</div>`).join('')]);
        html += `<dl class="facts">${facts.map(([dt, dd]) => `<dt>${dt}</dt><dd>${dd}</dd>`).join('')}</dl>`;
        html += closureShapeHtml(cong, A) + '</div>';
        html += '<p class="sub-note">Prime by prime, from the Zariski Closure engine:</p>';
    } else if (J && J.reason) html += `<div class="vc-inner"><p class="note">${mix(`The joint closure was not computed: ${J.reason}.`)}</p>${closureShapeHtml(cong, A)}</div>`;
    else if (cong && cong.error) html += `<div class="vc-inner"><p class="err">${mix(cong.error)}</p></div>`;
    return html + congruenceCard(A);
}
