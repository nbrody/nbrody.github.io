// Sample a sequence of certified elementary polygonal moves. Each step has
// matching vertex counts; adjacent steps may represent the same curve with
// different counts when a point is inserted on, or removed from, an edge.
const copy = components => components.map(p => Float64Array.from(p));

function validate(components, name, expectedCount) {
  if (!Array.isArray(components) || (expectedCount !== undefined && components.length !== expectedCount)) {
    throw new TypeError(`${name} must contain the same components throughout the move`);
  }
  for (const p of components) {
    if (!p || typeof p.length !== 'number' || p.length % 3 !== 0 || p.length < 9) {
      throw new TypeError(`${name} must contain closed 3D polylines`);
    }
    for (const x of p) if (!Number.isFinite(x)) throw new TypeError(`${name} contains a non-finite coordinate`);
  }
}

export function createMoveAnimation(steps, finalComponents, initialComponents) {
  if (!Array.isArray(steps)) throw new TypeError('Move steps must be an array');
  validate(initialComponents, 'Initial shape');
  const count = initialComponents.length;
  validate(finalComponents, 'Final shape', count);
  const active = [];
  let total = 0;
  for (const step of steps) {
    if (!step) throw new TypeError('A move step is missing');
    validate(step.from, 'Step start', count);
    validate(step.to, 'Step end', count);
    let weight = 0;
    for (let c = 0; c < count; c++) {
      const a = step.from[c], b = step.to[c];
      if (a.length !== b.length) throw new TypeError('A move step must preserve its vertex counts');
      for (let i = 0; i < a.length; i += 3) {
        weight += Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1], b[i + 2] - a[i + 2]);
      }
    }
    // Removing or inserting a point already at its chord midpoint changes only
    // the representation and needs no time in the animation.
    if (weight === 0) continue;
    total += weight;
    active.push({ from: copy(step.from), to: copy(step.to), weight, end: total });
  }
  return { steps: active, total, initialComponents: copy(initialComponents), finalComponents: copy(finalComponents) };
}

export function sampleMoveAnimation(animation, progress) {
  if (!Number.isFinite(progress)) throw new TypeError('Animation progress must be finite');
  if (progress <= 0) return copy(animation.initialComponents);
  if (progress >= 1 || !animation.steps.length) return copy(animation.finalComponents);
  const distance = progress * animation.total;
  const step = animation.steps.find(s => distance < s.end) || animation.steps[animation.steps.length - 1];
  const t = Math.max(0, Math.min(1, (distance - (step.end - step.weight)) / step.weight));
  return step.from.map((a, c) => {
    const b = step.to[c], out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
  });
}
