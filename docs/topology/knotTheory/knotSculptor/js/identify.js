// Name a knot or link by comparing invariants with the table in knotTable.js.
import { P } from './poly.js';
import { KNOT_TABLE } from './knotTable.js';

const D_LOOP = P.from([[2, -1], [-2, -1]]);
const table = KNOT_TABLE.map(e => ({
  ...e,
  V: P.from(e.jones),
  Delta: e.alexander ? P.from(e.alexander) : null,
  B: e.bracket ? P.from(e.bracket) : null,
}));

// LaTeX for a table name: '3_1' → 3_1, '3_1#5_1*' → 3_1 \# 5_1^*, '6^3_2' → 6^3_2
export function nameTex(name) {
  return name.split('#').map(p => p.endsWith('*') ? `${p.slice(0, -1)}^*` : p).join(' \\# ');
}

const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// inv: { components, jones, alexander, bracket } (Laurent polynomials as Maps). Returns
// { found, tex, nick, detail, note } — tex is the LaTeX name.
export function identify(inv) {
  const mu = inv.components;
  if (!mu) return { found: false, nick: 'Nothing drawn yet' };
  if (!inv.jones) return { found: false, nick: 'Too tangled to name', note: 'This projection still has too many crossings for the Jones polynomial; try Relax.' };
  if (mu === 1) {
    if (P.equal(inv.jones, P.one()) && (!inv.alexander || P.equal(inv.alexander, P.one()))) {
      return { found: true, tex: '0_1', nick: 'Unknot', detail: 'trivial Jones and Alexander polynomials' };
    }
    for (const e of table) {
      if (e.kind === 'link') continue;
      const direct = P.equal(inv.jones, e.V), mirror = P.equal(inv.jones, P.mirror(e.V));
      if (!direct && !mirror) continue;
      let detail = e.amphichiral ? 'amphichiral' : 'chiral';
      if (e.torus && !e.amphichiral) {
        // table curves are braid closures with negative crossings unless positiveWrithe
        const positive = e.positiveWrithe ? direct : mirror;
        detail = `${positive ? 'right' : 'left'}-handed torus knot $T(${e.torus[0]},${e.torus[1]})$`;
      } else if (e.name === '3_1#3_1') {
        const positive = mirror; // the table's trefoil is left-handed
        detail = `${positive ? 'right' : 'left'}-handed, a sum of two ${positive ? 'right' : 'left'}-handed trefoils`;
      } else if (e.kind === 'composite') {
        detail = `composite: connected sum, ${e.amphichiral ? 'amphichiral' : 'chiral'}`;
      }
      return {
        found: true, tex: nameTex(e.name), nick: cap(e.nick) || (e.kind === 'composite' ? 'Composite knot' : 'Knot'),
        detail, entry: e,
      };
    }
    return {
      found: false, nick: 'Not in the table',
      note: 'Prime knots up to 8 crossings (except $8_{15}$) and small connected sums are in the table.',
    };
  }
  // links: compare the Kauffman bracket up to ±A^k and mirror (orientation-free)
  if (inv.bracket) {
    const b = P.normalizeUnit(inv.bracket), bm = P.normalizeUnit(P.mirror(inv.bracket));
    let unlink = P.one();
    for (let k = 1; k < mu; k++) unlink = P.mul(unlink, D_LOOP);
    if (P.equal(b, P.normalizeUnit(unlink))) {
      return { found: true, tex: `0^${mu}_1`, nick: `Unlink of ${mu} components`, detail: 'bracket of an unlink (could still be a hard-to-see split link)' };
    }
    for (const e of table) {
      if (e.kind !== 'link' || e.components !== mu) continue;
      if (P.equal(b, e.B) || P.equal(bm, e.B)) {
        return { found: true, tex: nameTex(e.name), nick: cap(e.nick) || 'Link', detail: `${mu}-component link`, entry: e };
      }
    }
  }
  return { found: false, nick: `${mu}-component link`, note: 'Not one of the small links in the table.' };
}

export { table as IDENTIFY_TABLE };
