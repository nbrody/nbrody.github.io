// Represent an elementary polygonal vertex move as equal-length polylines.
// The moving vertex travels within the triangle already checked by the move
// finder. At the chord endpoint it can be inserted or removed without changing
// the curve, even though adjacent steps may use different vertex counts.
function atChord(comps, component, index) {
  const out = comps.slice();
  const p = Float64Array.from(comps[component]);
  const n = p.length / 3, prev = (index + n - 1) % n, next = (index + 1) % n;
  for (let k = 0; k < 3; k++) p[3 * index + k] = (p[3 * prev + k] + p[3 * next + k]) / 2;
  out[component] = p;
  return out;
}

export const removalStep = (before, component, index) => ({
  from: before, to: atChord(before, component, index),
});

export const insertionStep = (after, component, index) => ({
  from: atChord(after, component, index), to: after,
});
