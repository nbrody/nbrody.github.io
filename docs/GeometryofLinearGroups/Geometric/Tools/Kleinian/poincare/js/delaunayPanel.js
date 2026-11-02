/**
 * The Info tab's Delaunay domain card: what the dual domain is made of, how
 * it compares with the Dirichlet domain, and the presentation it reads off
 * (generators = its face pairings; relators = its edge cycles, or corner
 * cycles in the plane, each to the power that closes it up, and s² = 1 for a
 * side paired with itself). Clicking a generator applies it.
 */
import { presentationTex, tidyRelators } from './presentation.js';
import { wordTex, typeset, escapeHtml } from './format.js';

const sName = (i) => `s_{${i}}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function row(key, val) {
    return `<div class="inv-row"><span class="inv-key">${key}</span><span class="inv-val">${val}</span></div>`;
}

/** "12 tetrahedra", "6 triangles", "2 triangles; a triangle with a symmetry of order 7, of which 1/7 is used", … */
function cellsText(R) {
    const n2 = { 3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };
    const name = (k, c) => {
        if (R.dim === 2) return plural(c, n2[k] || `${k}-gon`);
        if (k === 4) return plural(c, 'tetrahedron', 'tetrahedra');
        return `${plural(c, 'cell')} with ${k} corners`;
    };
    const S = R.stats;
    const plain = new Map(), cut = [];
    S.cellSizes.forEach((k, i) => {
        const m = S.cellSymmetry[i];
        if (m > 1) cut.push({ k, m });
        else plain.set(k, (plain.get(k) || 0) + 1);
    });
    const parts = [...plain.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => name(k, c));
    for (const { k, m } of cut) {
        const frac = { 2: 'a half', 3: 'a third', 4: 'a quarter' }[m] || `1/${m}`;
        parts.push(`${name(k, 1).replace(/^1 /, 'a ')} with a symmetry of order ${m}, of which ${frac} is used`);
    }
    if (S.cusps) parts.push(`${plural(S.cusps, 'cusp')} (coned off over a fundamental domain of its lattice)`);
    return parts.join('; ');
}

/** What kind of isometry a face pairing is: a rotation of order n, a reflection, … (empty for the rest). */
function pairingKind(P) {
    const g = P.el;
    let Q = g;
    for (let n = 1; n <= 12; n++) {
        if (Q.isIdentity()) {
            if (g.m.anti) return n === 2 ? 'reflection' : `order ${n}`;
            return `rotation of order ${n}`;
        }
        Q = Q.mul(g);
    }
    return P.minus === P.plus ? 'paired with itself' : '';
}

/**
 * @param R     computeDelaunayDomain result (or null)
 * @param ctx   { on, dirichletFaces, planar, onToggle(), onApply(el, inverse) }
 */
export function renderDelaunayInfo(R, ctx) {
    const box = document.getElementById('delaunay-info');
    const btn = document.getElementById('delaunay-show');
    if (!box) return;
    if (btn) {
        btn.textContent = ctx.on ? 'Back to the Dirichlet domain' : 'Show the Delaunay domain';
        btn.disabled = !R || !R.ok;
        btn.onclick = () => ctx.onToggle();
    }
    if (!R) { box.innerHTML = '<p class="empty-message">Compute a domain first.</p>'; return; }
    if (!R.ok) {
        box.innerHTML = `<div class="inv-hint dl-why">Not available for this group. ${escapeHtml(R.message)}</div>` +
            '<div class="inv-hint">It needs a group of finite covolume (a hyperbolic manifold or orbifold; in the plane, a surface or 2-orbifold) whose Dirichlet domain is certified.</div>';
        return;
    }
    const S = R.stats, D2 = R.dim === 2;
    let html = '';
    html += row(D2 ? 'Sides' : 'Faces', `${S.faces}, glued by ${plural(S.pairs, 'face pairing')}` +
        ` <span class="dl-vs">Dirichlet: ${S.dirichlet.faces} ${D2 ? 'sides' : 'faces'}</span>`);
    if (!D2) html += row('Edges', `${S.edges}`);
    const extra = [];
    if (S.conePoints) extra.push(`${S.conePoints} on a rotation axis or a mirror`);
    if (S.idealVertices) extra.push(`${plural(S.idealVertices, 'cusp')} at infinity`);
    html += row('Corners', extra.length
        ? [S.vertices === 1 ? '1 copy of the basepoint' : `${S.vertices} copies of the basepoint`, ...extra].join(', ')
        : `${S.vertices}, every one a copy of the basepoint`);
    html += row('Cells', cellsText(R));
    if (!D2) html += row('Shape', R.convex ? 'convex' : 'not convex (it bends inward round some edges)');

    // Poincaré's presentation of this domain.
    const pres = { n: R.pairs.length, relators: tidyRelators(R.relators) };
    html += `<div class="inv-sub">Presentation</div><div class="inv-tex">\\[ ${presentationTex(pres, sName, { maxRelators: 10 })} \\]</div>`;
    html += '<div class="dl-gens">' + R.pairs.map((P, k) => {
        const kind = pairingKind(P);
        return `<div class="std-gen-item dl-gen" data-k="${k}" title="Apply this face pairing (⌘/Ctrl-click for its inverse)">` +
            `<span class="dl-gen-name">\\(s_{${k + 1}}\\)</span><span class="std-gen-word">\\(${wordTex(P.el.w, 24)}\\)</span>` +
            (kind ? `<span class="std-gen-type">${kind}</span>` : '') + '</div>';
    }).join('') + '</div>';
    html += `<div class="inv-hint dl-note">${D2
        ? 'Sides of one colour are glued by one pairing. Corners are drawn only where the boundary turns; a side paired with itself is folded at its midpoint.'
        : 'Faces of one colour are glued by one pairing, which may carry on round a bend (a thin line). Thick lines are where two pairings meet; flat joins are not drawn.'}</div>`;
    box.innerHTML = html;
    box.querySelectorAll('.dl-gen').forEach(el => el.addEventListener('click', (e) => {
        const P = R.pairs[+el.dataset.k];
        if (P) ctx.onApply(P.el, e.metaKey || e.ctrlKey);
    }));
    typeset(box);
}
