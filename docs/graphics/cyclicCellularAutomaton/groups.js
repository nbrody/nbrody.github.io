/** Finite groups, with elements represented by consecutive integer indices. */

function integer(value, fallback, min, max, label) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new RangeError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return result;
}

function group(name, labels, generatorIds, operation) {
  const order = labels.length;
  const table = new Uint16Array(order * order);
  for (let a = 0; a < order; a++) {
    for (let b = 0; b < order; b++) table[a * order + b] = operation(a, b);
  }
  return {
    name,
    order,
    labels,
    identity: 0,
    generators: generatorIds.map(id => ({ id, label: labels[id] })),
    multiply(a, b) {
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= order || b >= order) {
        throw new RangeError('Multiplication requires valid element indices.');
      }
      return table[a * order + b];
    },
  };
}

function cyclic(n) {
  return group(`ℤ/${n}ℤ`, Array.from({ length: n }, (_, i) => String(i)), [1], (a, b) => (a + b) % n);
}

function product(m, n) {
  const labels = Array.from({ length: m * n }, (_, i) => `(${Math.floor(i / n)}, ${i % n})`);
  return group(`ℤ/${m}ℤ × ℤ/${n}ℤ`, labels, [n, 1], (a, b) => {
    const x = (Math.floor(a / n) + Math.floor(b / n)) % m;
    const y = (a % n + b % n) % n;
    return x * n + y;
  });
}

function dihedral(n) {
  // Index k + n*f denotes r^k s^f, where s r s = r^-1.
  const labels = Array.from({ length: 2 * n }, (_, i) => {
    const power = i % n;
    const rotation = power === 0 ? '' : power === 1 ? 'r' : `r^${power}`;
    return `${rotation}${i >= n ? 's' : ''}` || 'e';
  });
  return group(`D${n} (order ${2 * n})`, labels, [1, n], (a, b) => {
    const flipA = a >= n ? 1 : 0;
    const flipB = b >= n ? 1 : 0;
    const rotation = (a % n + (flipA ? -(b % n) : b % n) + n) % n;
    return rotation + n * (flipA ^ flipB);
  });
}

function permutations(values) {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, j) => j !== index)).map(rest => [value, ...rest]));
}

function cycleLabel(permutation) {
  const visited = new Set();
  const cycles = [];
  for (let i = 0; i < permutation.length; i++) {
    if (visited.has(i)) continue;
    const cycle = [];
    let j = i;
    do {
      visited.add(j);
      cycle.push(j + 1);
      j = permutation[j];
    } while (j !== i);
    if (cycle.length > 1) cycles.push(`(${cycle.join(' ')})`);
  }
  return cycles.join('') || 'e';
}

function symmetric(n) {
  const elements = permutations(Array.from({ length: n }, (_, i) => i));
  const index = new Map(elements.map((element, i) => [element.join(','), i]));
  const generatorIds = Array.from({ length: n - 1 }, (_, i) => {
    const transposition = Array.from({ length: n }, (_, j) => j);
    [transposition[i], transposition[i + 1]] = [transposition[i + 1], transposition[i]];
    return index.get(transposition.join(','));
  });
  // Function composition: (a*b)(x) = a(b(x)).
  return group(`S${n}`, elements.map(cycleLabel), generatorIds,
    (a, b) => index.get(elements[b].map(x => elements[a][x]).join(',')));
}

function quaternion() {
  const labels = ['1', '−1', 'i', '−i', 'j', '−j', 'k', '−k'];
  // Positive units 1, i, j, k. An odd element index carries a minus sign.
  const units = [
    [0, 2, 4, 6],
    [2, 1, 6, 5],
    [4, 7, 1, 2],
    [6, 4, 3, 1],
  ];
  return group('Q8', labels, [2, 4], (a, b) => units[a >> 1][b >> 1] ^ (a & 1) ^ (b & 1));
}

export function buildGroup({ family = 'cyclic', n, m } = {}) {
  switch (family) {
    case 'cyclic': return cyclic(integer(n, 12, 2, 32, 'Number of cyclic states'));
    case 'product': return product(integer(m, 3, 2, 8, 'First factor'), integer(n, 3, 2, 8, 'Second factor'));
    case 'dihedral': return dihedral(integer(n, 6, 3, 16, 'Polygon sides'));
    case 'symmetric': return symmetric(integer(n, 3, 3, 4, 'Permutation degree'));
    case 'quaternion': return quaternion();
    default: throw new RangeError(`Unknown group family: ${family}`);
  }
}

/** Allowed successors in priority order; identity and duplicate moves are removed. */
export function createTransitions(group, generatorIds = group.generators.map(generator => generator.id), side = 'right') {
  if (side !== 'right' && side !== 'left') throw new RangeError('Multiplication side must be right or left.');
  const generators = [...new Set(generatorIds)];
  for (const generator of generators) {
    if (!Number.isInteger(generator) || generator < 0 || generator >= group.order) {
      throw new RangeError('Every generator must be an element index of the group.');
    }
  }
  return Array.from({ length: group.order }, (_, state) => {
    const successors = generators.map(generator => side === 'right'
      ? group.multiply(state, generator)
      : group.multiply(generator, state));
    return [...new Set(successors)].filter(successor => successor !== state);
  });
}
