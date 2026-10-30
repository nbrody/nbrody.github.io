// A relative URL from a file, as a path in its folder tree (null if it leaves it).
export function relativePath(from, url) {
  const parts = from.split('/').slice(0, -1);
  for (const seg of url.split(/[?#]/)[0].split('/')) {
    if (!seg || seg === '.') continue;
    let name = seg;
    try { name = decodeURIComponent(seg); } catch { /* keep it as written */ }
    if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(name);
  }
  return parts.join('/');
}
