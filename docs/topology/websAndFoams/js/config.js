// Global settings shared by every module: the rank N and the flow convention.
//   sl : sl(N) webs, flow conserved mod N (a k-edge equals a reversed (N-k)-edge)
//   gl : gl(N) / MOY webs, flow conserved exactly, labels 1..N

export const S = { N: 3, mode: 'sl' };

export const SP = 0.03;      // target polyline spacing (the web lives in the unit disk)
export const LROWS = 8;      // vertical subdivisions per slab of the foam

export function setSettings(o) { Object.assign(S, o); }

export const modN = f => ((f % S.N) + S.N) % S.N;

export function flowZero(f) { return S.mode === 'sl' ? modN(f) === 0 : f === 0; }

export function labelOK(l) {
  return Number.isInteger(l) && l >= 1 && l <= (S.mode === 'sl' ? S.N - 1 : S.N);
}

// Canonical representative of an edge label: in sl(N) a label above N/2 is the
// reversed complementary label.  `half` marks the self-dual label N/2, whose
// orientation carries no information mod N.
export function normLabel(l) {
  if (S.mode !== 'sl') return { lab: l, rev: false, half: false };
  const k = modN(l);
  if (2 * k > S.N) return { lab: S.N - k, rev: true, half: false };
  return { lab: k, rev: false, half: 2 * k === S.N };
}

// A flow f travelling in some direction becomes an edge: returns {label, flip}
// where flip says the edge must point against that direction.  null if the
// flow vanishes or is out of range.
export function flowToLabel(f) {
  if (S.mode === 'sl') {
    const k = modN(f);
    if (k === 0) return null;
    return 2 * k > S.N ? { label: S.N - k, flip: true } : { label: k, flip: false };
  }
  if (f === 0 || Math.abs(f) > S.N) return null;
  return f > 0 ? { label: f, flip: false } : { label: -f, flip: true };
}

export const LABEL_COLORS = ['#888', '#8b9cff', '#3fd6ec', '#4ade80', '#fbbf24', '#f472b6', '#fb923c', '#c4b5fd', '#94a3b8'];
export const labelColor = l => LABEL_COLORS[Math.min(l, LABEL_COLORS.length - 1)] || '#ccc';
