// Census lookups against Regina's census data (gzipped "isosig name" lists).
// Regina's own Census::lookup() matches the exact isomorphism signature, and
// so does this.

export const CENSUSES = [
  { file: 'closed-or-census-11', title: 'Closed orientable census', note: 'minimal, ≤ 11 tetrahedra' },
  { file: 'closed-nor-census-11', title: 'Closed non-orientable census', note: 'minimal, ≤ 11 tetrahedra' },
  { file: 'closed-hyp-census-full', title: 'Hodgson–Weeks closed hyperbolic census', note: 'name gives volume and filling' },
  { file: 'cusped-hyp-or-census-9', title: 'Cusped orientable hyperbolic census', note: '≤ 9 tetrahedra' },
  { file: 'cusped-hyp-nor-census-9', title: 'Cusped non-orientable hyperbolic census', note: '≤ 9 tetrahedra' },
  { file: 'christy-knots-links', title: 'Christy knot and link complements', note: '≤ 10 crossings' },
];

const base = new URL('../data/census/', import.meta.url);
const loaded = new Map(); // file -> Promise<Array<[sig, name]>>
let index = null;         // Promise<Map<sig, Array<{census, name}>>>

async function gunzipText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load ' + url);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

function load(c) {
  if (!loaded.has(c.file)) {
    loaded.set(c.file, gunzipText(new URL(c.file + '.zsig', base)).then((text) => {
      const rows = [];
      for (const line of text.split('\n')) {
        const i = line.indexOf(' ');
        if (i > 0) rows.push([line.slice(0, i), line.slice(i + 1).trim()]);
      }
      return rows;
    }));
  }
  return loaded.get(c.file);
}

export function lookup(sig) {
  if (!index) {
    index = Promise.all(CENSUSES.map(async (c) => {
      const rows = await load(c);
      return rows.map(([s, name]) => [s, { census: c, name }]);
    })).then((all) => {
      const m = new Map();
      for (const rows of all) for (const [s, hit] of rows) {
        if (!m.has(s)) m.set(s, []);
        m.get(s).push(hit);
      }
      return m;
    });
  }
  return index.then((m) => m.get(sig) || []);
}

// Name search: "m004", "L104001", "s912", a Hodgson–Weeks filling like "m003(-3, 1)".
export async function searchName(query, limit = 40) {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return [];
  const exact = [], near = [];
  const all = await Promise.all(CENSUSES.map(load));
  CENSUSES.forEach((c, k) => {
    for (const [sig, name] of all[k]) {
      // Names look like "m004 : #1", "L104001", or "0.9427... : m003(-3, 1)".
      const parts = name.toLowerCase().replace(/\s+/g, '').split(':');
      if (parts.includes(q)) exact.push({ sig, name, census: c });
      else if (near.length < limit && parts.some((p) => p.startsWith(q + '(')))
        near.push({ sig, name, census: c });
    }
  });
  return exact.concat(near).slice(0, limit);
}

// Short names for whole censuses, for notebooks: censusList('cusped', 20).
export const CENSUS_KEYS = {
  'closed': 'closed-or-census-11',
  'closed-nonorientable': 'closed-nor-census-11',
  'closed-hyperbolic': 'closed-hyp-census-full',
  'cusped': 'cusped-hyp-or-census-9',
  'cusped-nonorientable': 'cusped-hyp-nor-census-9',
  'knots': 'christy-knots-links',
};

// Distinct manifolds of one census, in file order, as {sig, name}. Some
// censuses list several triangulations of one manifold ("m016 : #1",
// "m016 : #2"); only the first is kept.
export async function entries(key, from = 0, count = Infinity) {
  const file = CENSUS_KEYS[key] || key;
  const c = CENSUSES.find((x) => x.file === file);
  if (!c) throw new Error(`Unknown census “${key}”. Try one of: ${Object.keys(CENSUS_KEYS).join(', ')}`);
  const rows = await load(c);
  const seen = new Set();
  const out = [];
  let skipped = 0;
  for (const [sig, raw] of rows) {
    const name = raw.replace(/\s*:\s*#\d+$/, '');
    if (seen.has(name)) continue;
    seen.add(name);
    if (skipped++ < from) continue;
    out.push({ sig, name, census: c });
    if (out.length >= count) break;
  }
  return out;
}
