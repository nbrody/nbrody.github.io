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
