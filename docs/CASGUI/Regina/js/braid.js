// Closures of braids as PD codes, so Regina can read them.
//
// A word is a list of nonzero integers: i means the generator σ_i (strand i
// crosses over strand i+1, a positive crossing) and -i its inverse. Strings
// like "1 1 -2", "s1 s2^-1 s1^3" or "σ1σ2⁻¹" are accepted too.

export function parseBraid(word) {
  if (Array.isArray(word)) return word.map(Number);
  const s = String(word)
    .replace(/⁻¹/g, '^-1').replace(/[σs]_?/gi, ' ')
    .replace(/[,()[\]]/g, ' ');
  const out = [];
  for (const tok of s.trim().split(/\s+/).filter(Boolean)) {
    const m = /^(-?)(\d+)(?:\^(-?\d+))?$/.exec(tok);
    if (!m) throw new Error(`Could not read “${tok}” in the braid word`);
    const g = +m[2] * (m[1] ? -1 : 1);
    const e = m[3] === undefined ? 1 : +m[3];
    for (let k = 0; k < Math.abs(e); k++) out.push(e < 0 ? -g : g);
  }
  return out;
}

// Returns { pd, strands, crossings, freeStrands } where freeStrands counts
// strands that never cross anything (PD codes cannot record those).
export function braidToPD(word, strands) {
  const w = parseBraid(word);
  if (!w.length) throw new Error('The braid word is empty');
  if (w.some((g) => !Number.isInteger(g) || g === 0)) throw new Error('Braid generators must be nonzero integers');
  const n = Math.max(strands || 0, ...w.map((g) => Math.abs(g) + 1));
  let next = 1;
  const start = [];
  const cur = [];
  for (let p = 0; p < n; p++) { start[p] = cur[p] = next++; }
  const xs = [];
  for (const g of w) {
    const i = Math.abs(g) - 1;
    const a = cur[i], b = cur[i + 1];     // incoming: bottom-left, bottom-right
    const c = next++, d = next++;         // outgoing: top-right (from a), top-left (from b)
    // Going round the crossing counterclockwise: bottom-left, bottom-right,
    // top-right, top-left. PD starts at the incoming under-strand.
    xs.push(g > 0 ? [b, c, d, a] : [a, b, c, d]);
    cur[i] = d; cur[i + 1] = c;
  }
  // Close up: the strand leaving the top at position p is the one entering
  // the bottom at position p.
  const alias = new Map();
  for (let p = 0; p < n; p++) alias.set(cur[p], start[p]);
  const used = new Set(xs.flat().map((x) => alias.get(x) ?? x));
  const free = start.filter((s) => !used.has(s)).length;
  // Renumber to 1..2k.
  const ren = new Map();
  let k = 1;
  const pd = xs.map((x) => x.map((e) => {
    const v = alias.get(e) ?? e;
    if (!ren.has(v)) ren.set(v, k++);
    return ren.get(v);
  }));
  return {
    pd: 'PD[' + pd.map((x) => `X[${x.join(', ')}]`).join(', ') + ']',
    strands: n, crossings: w.length, freeStrands: free,
  };
}
