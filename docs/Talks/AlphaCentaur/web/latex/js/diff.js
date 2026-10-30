// Line diff (Myers' O(ND) algorithm) for comparing versions in History.
// Returns [{type: 'same' | 'add' | 'del', line}] turning `a` into `b`.
export function diffLines(aText, bText) {
  const a = aText.split('\n'), b = bText.split('\n');
  // Trim the common head and tail so the search works on the changed middle.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const A = a.slice(head, a.length - tail), B = b.slice(head, b.length - tail);
  const n = A.length, m = B.length, max = n + m, offset = max + 1;
  const v = new Int32Array(2 * max + 3), trace = [];
  let found = n === 0 && m === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
    if (d > 4000) break; // pathological inputs: fall back below
  }
  let middle = [];
  if (!found) middle = [...A.map(line => ({type: 'del', line})), ...B.map(line => ({type: 'add', line}))];
  else {
    let x = n, y = m;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vd = trace[d], k = x - y;
      const prevK = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
      const px = vd[offset + prevK], py = px - prevK;
      while (x > px && y > py) { middle.push({type: 'same', line: A[x - 1]}); x--; y--; }
      if (d > 0) { if (x === px) middle.push({type: 'add', line: B[y - 1]}); else middle.push({type: 'del', line: A[x - 1]}); }
      x = px; y = py;
    }
    middle.reverse();
  }
  return [...a.slice(0, head).map(line => ({type: 'same', line})), ...middle, ...a.slice(a.length - tail).map(line => ({type: 'same', line}))];
}

// Collapses long unchanged stretches, keeping `context` lines around changes.
export function hunks(ops, context = 3) {
  const keep = ops.map(() => false);
  ops.forEach((op, i) => { if (op.type !== 'same') for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) keep[j] = true; });
  const out = [];
  let skipped = 0;
  ops.forEach((op, i) => {
    if (keep[i]) { if (skipped) out.push({type: 'skip', count: skipped}); skipped = 0; out.push(op); }
    else skipped++;
  });
  if (skipped) out.push({type: 'skip', count: skipped});
  return out;
}
