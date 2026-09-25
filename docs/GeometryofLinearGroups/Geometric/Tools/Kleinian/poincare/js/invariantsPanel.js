/**
 * The Invariants tab: volume, homology, torsion, cusps and their shapes,
 * simplified presentations (also in the user's own generators), the complex
 * length spectrum with closed geodesics drawn inside the domain, and the
 * invariant trace field with an arithmeticity test.
 */
import { app, wordToMatrix } from './app.js';
import { presentationTex, presentationText, wordTex as presWordTex } from './presentation.js';
import { showGeodesic } from './inspector.js';
import { wordTex, complexStr, typeset, escapeHtml } from './format.js';

const gName = (i) => `g_{${i}}`;
const sub = (n) => String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join('');

function section(title, body, id) {
    return `<div class="control-group inv-section"${id ? ` id="${id}"` : ''}>` +
        `<label class="control-label">${title}</label>${body}</div>`;
}

function row(key, val, hint = '') {
    return `<div class="inv-row"><span class="inv-key">${key}</span><span class="inv-val">${val}</span></div>` +
        (hint ? `<div class="inv-hint">${hint}</div>` : '');
}

/** GAP input for a presentation with generator names g1, g2, … */
function gapText(pres, names) {
    const gens = Array.from({ length: pres.n }, (_, i) => `"${names(i + 1)}"`).join(', ');
    const rels = presentationText(pres, names).join(', ');
    return `F := FreeGroup(${gens});; AssignGeneratorVariables(F);;\nG := F / [ ${rels} ];`;
}

let geodesicRow = null;

export function renderInvariants(onApplyWord) {
    const el = document.getElementById('invariants-content');
    if (!el) return;
    geodesicRow = null;
    const inv = app.invariants, rep = app.report;
    if (!inv || !rep) {
        el.innerHTML = '<p class="empty-message">Compute a domain first.</p>';
        return;
    }
    if (rep.status === 'full') {
        el.innerHTML = '<p class="empty-message">Invariants are computed from the canonical fundamental domain — turn off “Full Domain”.</p>';
        return;
    }
    const certified = rep.status === 'verified';
    const caveat = certified ? '' : '<div class="inv-caveat">The certificate did not fully pass — treat these values as provisional.</div>';
    let html = caveat;

    // ---- summary ----
    let sum = '';
    const vol = inv.finiteVolume && inv.volume != null
        ? `${inv.volume.toFixed(9)}`
        : '∞';
    sum += row('Volume', vol, inv.finiteVolume ? 'covolume of the group (exact cone decomposition of the domain)'
        : 'the domain reaches the sphere at infinity in open patches: infinite covolume');
    if (inv.h1Tex) sum += row('H₁', `\\(${inv.h1Tex}\\)`, 'abelianization of the certified presentation');
    sum += row('Torsion', inv.torsion && inv.torsion.length
        ? `elements of order ${inv.torsion.join(', ')}` : 'none found — torsion-free');
    const cusps = rep.cusps || [];
    if (cusps.length) {
        const shapes = cusps.map((c, i) => {
            if (!c.shape) return `cusp ${i + 1}: —`;
            if (c.shape.rank === 1) return `cusp ${i + 1}: rank 1`;
            const [re, im] = c.shape.shape;
            return `cusp ${i + 1}: \\(${complexStr(re, im, 6).replace('i', '\\,i')}\\)`;
        }).join('<br>');
        sum += row(`Cusps (${cusps.length})`, shapes, 'cusp shape: ratio of the translation lattice, reduced to |Re τ| ≤ ½, |τ| ≥ 1');
    } else if (rep.hasCusps) {
        sum += row('Cusps', 'rank-1 only', 'parabolic fixed points on the edge of the ordinary set');
    }
    const S = rep.structure;
    if (S) sum += row('Cell', `${S.V} vertices · ${S.E} edges · ${S.F} faces`);
    html += section('Summary', sum);

    // ---- presentations ----
    let pres = '';
    if (inv.simplified) {
        const s = inv.simplified;
        const names = (i) => `a_{${i}}`;
        pres += `<div class="inv-sub">Simplified (Tietze moves on the Poincaré presentation)</div>`;
        pres += `<div class="inv-tex">\\[ ${presentationTex(s, names)} \\]</div>`;
        pres += '<div class="inv-dict">' + s.words.map((w, k) =>
            `<span>\\(a_{${k + 1}} = ${wordTex(w, 20)}\\)</span>`).join('') + '</div>';
        pres += `<button class="btn btn-add-alt inv-copy" data-copy="simp">Copy for GAP</button>`;
    }
    if (inv.inUser) {
        pres += `<div class="inv-sub">In your generators</div>`;
        pres += `<div class="inv-tex">\\[ ${presentationTex(inv.inUser, gName, { maxRelators: 10 })} \\]</div>`;
        pres += `<button class="btn btn-add-alt inv-copy" data-copy="user">Copy for GAP</button>`;
    } else if (inv.simplified) {
        pres += '<div class="inv-hint">A presentation in your generators needs every generator to be a product of face pairings (see the certificate).</div>';
    }
    if (inv.presentationComplete === false) pres += '<div class="inv-caveat">Some edge cycles were unresolved: relations may be missing.</div>';
    if (pres) html += section('Presentation', pres);

    // ---- length spectrum ----
    if (inv.spectrum && inv.spectrum.length) {
        let t = '<div class="inv-hint">Complex lengths ℓ + iθ of the shortest closed geodesics found (translation length and rotation). Click one to draw it inside the domain.</div>';
        t += '<table class="inv-table"><thead><tr><th>ℓ</th><th>θ</th><th>element</th><th></th></tr></thead><tbody>';
        inv.spectrum.forEach((c, k) => {
            t += `<tr class="inv-geo" data-k="${k}"><td>${c.length[0].toFixed(6)}</td><td>${c.length[1].toFixed(4)}</td>` +
                `<td>\\(${wordTex(c.word, 10)}\\)</td><td><button class="inv-apply" data-k="${k}" title="Apply this element">▶</button></td></tr>`;
        });
        t += '</tbody></table>';
        if (app.fordOn) t += '<div class="inv-hint">Geodesics are drawn in the Dirichlet domain — leave cusp view to see them.</div>';
        html += section('Length spectrum', t);
    }

    // ---- trace field ----
    const tf = inv.traceField;
    let f = '';
    if (!app.exactCtx) {
        f = '<div class="inv-hint">Turn on Exact Arithmetic (Group tab) to compute the invariant trace field exactly.</div>';
    } else if (!tf || tf.note) {
        f = `<div class="inv-hint">${escapeHtml(tf && tf.note ? tf.note : 'not available')}</div>`;
    } else {
        f += row('Field', `\\(k\\Gamma = \\mathbb{Q}(x),\\ ${tf.minpoly.replace(/−/g, '-').replace(/\^(\d+)/g, '^{$1}')} = 0\\)`);
        f += row('Degree', `${tf.degree}`, `${tf.signature[0]} real, ${tf.signature[1]} complex place${tf.signature[1] === 1 ? '' : 's'}`);
        if (tf.discriminant) f += row('Disc.', escapeHtml(tf.discriminant), 'of the minimal polynomial (a square multiple of the field discriminant)');
        f += row('Traces', tf.integral ? 'algebraic integers' : 'not all integral');
        if (tf.arithmetic !== undefined) {
            f += row('Arithmetic', tf.arithmetic ? '<strong class="inv-yes">yes</strong>' : '<strong class="inv-no">no</strong>',
                tf.arithmetic ? 'Maclachlan–Reid: one complex place, integral traces, quaternion algebra ramified at every real place'
                    : escapeHtml((tf.reasons || []).join('; ')));
        } else {
            f += '<div class="inv-hint">Arithmeticity is decided for finite-covolume groups only.</div>';
        }
    }
    html += section('Invariant trace field', f);

    el.innerHTML = html;

    // wiring
    el.querySelectorAll('.inv-geo').forEach(tr => {
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.inv-apply')) return;
            const k = +tr.dataset.k;
            if (geodesicRow === tr) { tr.classList.remove('active'); geodesicRow = null; showGeodesic(null); return; }
            if (geodesicRow) geodesicRow.classList.remove('active');
            geodesicRow = tr;
            tr.classList.add('active');
            showGeodesic(inv.spectrum[k].word);
        });
    });
    el.querySelectorAll('.inv-apply').forEach(btn => {
        btn.addEventListener('click', () => {
            const c = inv.spectrum[+btn.dataset.k];
            try { onApplyWord(wordToMatrix(c.word), c.word); } catch (e) { /* ignore */ }
        });
    });
    el.querySelectorAll('.inv-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.dataset.copy === 'user'
                ? gapText(inv.inUser, (i) => `g${i}`)
                : gapText(inv.simplified, (i) => `a${i}`);
            try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied ✓'; }
            catch (e) { window.prompt('Copy the GAP input:', text); }
            setTimeout(() => { btn.textContent = 'Copy for GAP'; }, 1600);
        });
    });
    typeset(el);
}

export function clearGeodesicSelection() {
    if (geodesicRow) geodesicRow.classList.remove('active');
    geodesicRow = null;
    showGeodesic(null);
}
