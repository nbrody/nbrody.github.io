/** A synchronous, deterministic cellular automaton with arbitrary state successors. */

const OUTSIDE = 65535;
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${label} must be a positive integer${max < Number.MAX_SAFE_INTEGER ? ` no greater than ${max}` : ''}.`);
  }
  return value;
}

function seedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let hash = 2166136261;
  for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export class Simulation {
  constructor({ width, height, order, transitions, neighborhood = 'vonNeumann', radius = 1,
    threshold = 1, boundary = 'wrap', seed = 1, initial = 'random' }) {
    this.width = positiveInteger(width, 'Width');
    this.height = positiveInteger(height, 'Height');
    this.order = positiveInteger(order, 'Group order', OUTSIDE);
    this.cells = new Uint16Array(width * height);
    this._next = new Uint16Array(width * height);
    this._neighborCounts = new Uint32Array(order);
    this._stamps = new Uint32Array(order);
    this.configure({ transitions, neighborhood, radius, threshold, boundary });
    this.reset({ seed, initial });
  }

  configure({ transitions = this.transitions, neighborhood = this.neighborhood,
    radius = this.radius, threshold = this.threshold, boundary = this.boundary } = {}) {
    if (!Array.isArray(transitions) || transitions.length !== this.order) {
      throw new RangeError('Transitions must contain one successor list per state.');
    }
    const cleaned = transitions.map((list, state) => {
      if (!Array.isArray(list) && !ArrayBuffer.isView(list)) throw new TypeError('Each transition must be a list.');
      const unique = [...new Set(list)];
      if (unique.some(value => !Number.isInteger(value) || value < 0 || value >= this.order)) {
        throw new RangeError('A successor is outside the state space.');
      }
      return unique.filter(value => value !== state);
    });
    if (!['vonNeumann', 'moore', 'eisenstein'].includes(neighborhood)) throw new RangeError('Unknown neighborhood.');
    if (boundary !== 'wrap' && boundary !== 'fixed') throw new RangeError('Unknown boundary condition.');
    positiveInteger(radius, 'Neighborhood radius', 32);
    positiveInteger(threshold, 'Threshold');
    this.transitions = cleaned;
    this.neighborhood = neighborhood;
    this.radius = radius;
    this.threshold = threshold;
    this.boundary = boundary;
    this._singleSuccessors = cleaned.every(list => list.length <= 1)
      ? Int32Array.from(cleaned, list => list.length ? list[0] : -1) : null;
    this._stride = this.width + 2 * radius;
    this._padded = new Uint16Array(this._stride * (this.height + 2 * radius));
    this._padded.fill(OUTSIDE);
    const offsets = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (neighborhood === 'vonNeumann' && Math.abs(dx) + Math.abs(dy) > radius) continue;
        // Axial coordinates z = x + yω, where ω = exp(2πi/3).
        if (neighborhood === 'eisenstein' && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx - dy)) > radius) continue;
        offsets.push(dy * this._stride + dx);
      }
    }
    this._offsets = Int32Array.from(offsets);
    this.neighborCount = offsets.length;
  }

  _random() {
    this._rng = (this._rng + 0x6d2b79f5) >>> 0;
    let value = this._rng;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  reset({ seed = this.seed ?? 1, initial = this.initial ?? 'random' } = {}) {
    if (!['random', 'spirals', 'bands', 'droplets'].includes(initial)) throw new RangeError('Unknown initial pattern.');
    this.seed = seed;
    this.initial = initial;
    this._rng = seedNumber(seed);
    this.generation = 0;
    this.activity = 0;
    const { width, height, order, cells } = this;
    const eisenstein = this.neighborhood === 'eisenstein';
    const shear = eisenstein ? 0.5 : 0;
    const verticalScale = eisenstein ? Math.sqrt(3) / 2 : 1;
    if (initial === 'random') {
      for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(this._random() * order);
    } else if (initial === 'bands') {
      // Diagonal bands contain a full traversal of the label order.
      const bandWidth = Math.max(2, Math.min(width, height * verticalScale) / (order * 1.5));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const worldX = x - y * shear;
          const worldY = y * verticalScale;
          cells[y * width + x] = mod(Math.floor((worldX + worldY * 0.35) / bandWidth), order);
        }
      }
    } else if (initial === 'spirals') {
      const centers = [[width * 0.32, height * 0.48, 1], [width * 0.72, height * 0.52, -1]]
        .map(([x, y, winding]) => [x - y * shear, y * verticalScale, winding]);
      const wavelength = Math.max(12, Math.min(width, height * verticalScale) * 0.32);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const worldX = x - y * shear;
          const worldY = y * verticalScale;
          const center = centers.reduce((best, candidate) =>
            Math.hypot(worldX - candidate[0], worldY - candidate[1]) < Math.hypot(worldX - best[0], worldY - best[1]) ? candidate : best);
          const dx = worldX - center[0];
          const dy = worldY - center[1];
          const phase = center[2] * Math.atan2(dy, dx) / (2 * Math.PI) - Math.hypot(dx, dy) / wavelength;
          cells[y * width + x] = mod(Math.floor(phase * order), order);
        }
      }
    } else {
      // Separated concentric droplets against a quiet background.
      cells.fill(0);
      const dropletCount = Math.max(3, Math.round(width * height / 5000));
      const maxRadius = Math.max(4, Math.min(width, height * verticalScale) * 0.16);
      for (let drop = 0; drop < dropletCount; drop++) {
        const cx = this._random() * width;
        const cy = this._random() * height;
        const size = maxRadius * (0.45 + this._random() * 0.55);
        const phase = Math.floor(this._random() * order);
        const extent = size / verticalScale;
        for (let y = Math.max(0, Math.floor(cy - extent)); y <= Math.min(height - 1, Math.ceil(cy + extent)); y++) {
          for (let x = Math.max(0, Math.floor(cx - extent)); x <= Math.min(width - 1, Math.ceil(cx + extent)); x++) {
            const dy = y - cy;
            const distance = Math.hypot(x - cx - dy * shear, dy * verticalScale);
            if (distance <= size) cells[y * width + x] = (phase + Math.floor((size - distance) / 2)) % order;
          }
        }
      }
    }
    return this;
  }

  _prepareBoundary() {
    const { width, height, radius, cells, _stride: stride, _padded: padded } = this;
    for (let y = 0; y < height; y++) {
      const row = (y + radius) * stride;
      padded.set(cells.subarray(y * width, (y + 1) * width), row + radius);
      if (this.boundary === 'wrap') {
        for (let x = 0; x < radius; x++) {
          padded[row + x] = cells[y * width + mod(x - radius, width)];
          padded[row + radius + width + x] = cells[y * width + x % width];
        }
      }
    }
    if (this.boundary === 'wrap') {
      for (let y = 0; y < radius; y++) {
        const topSource = (mod(y - radius, height) + radius) * stride;
        const bottomSource = (y % height + radius) * stride;
        padded.copyWithin(y * stride, topSource, topSource + stride);
        padded.copyWithin((radius + height + y) * stride, bottomSource, bottomSource + stride);
      }
    }
  }

  step() {
    this._prepareBoundary();
    const { width, height, radius, threshold, cells, transitions, _next: next,
      _stride: stride, _padded: padded, _offsets: offsets, _singleSuccessors: single,
      _neighborCounts: counts, _stamps: stamps } = this;
    let changed = 0;
    if (!single) stamps.fill(0);
    for (let y = 0, index = 0; y < height; y++) {
      let position = (y + radius) * stride + radius;
      for (let x = 0; x < width; x++, index++, position++) {
        const current = cells[index];
        let successor = current;
        if (single) {
          const target = single[current];
          if (target >= 0) {
            let matches = 0;
            for (let k = 0; k < offsets.length; k++) {
              if (padded[position + offsets[k]] === target && ++matches >= threshold) {
                successor = target;
                break;
              }
            }
          }
        } else {
          const stamp = index + 1;
          for (let k = 0; k < offsets.length; k++) {
            const neighbor = padded[position + offsets[k]];
            if (neighbor === OUTSIDE) continue;
            if (stamps[neighbor] !== stamp) {
              stamps[neighbor] = stamp;
              counts[neighbor] = 1;
            } else counts[neighbor]++;
          }
          let bestCount = threshold - 1;
          for (const target of transitions[current]) {
            const count = stamps[target] === stamp ? counts[target] : 0;
            if (count > bestCount) {
              successor = target;
              bestCount = count;
            }
          }
        }
        next[index] = successor;
        if (successor !== current) changed++;
      }
    }
    this.cells = next;
    this._next = cells;
    this.generation++;
    this.activity = changed / cells.length;
    return this.activity;
  }

  paint(x, y, radius = 0, state = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) {
      throw new RangeError('Brush coordinates and radius must be finite, with a nonnegative radius.');
    }
    if (!Number.isInteger(state) || state < -1 || state >= this.order) throw new RangeError('Invalid brush state.');
    const cx = Math.round(x);
    const cy = Math.round(y);
    const eisenstein = this.neighborhood === 'eisenstein';
    const extent = Math.ceil(eisenstein ? 2 * radius / Math.sqrt(3) : radius);
    for (let dy = -extent; dy <= extent; dy++) {
      for (let dx = -extent; dx <= extent; dx++) {
        const distanceSquared = dx * dx + dy * dy - (eisenstein ? dx * dy : 0);
        if (distanceSquared > radius * radius) continue;
        let px = cx + dx;
        let py = cy + dy;
        if (this.boundary === 'wrap') {
          px = mod(px, this.width);
          py = mod(py, this.height);
        } else if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        this.cells[py * this.width + px] = state === -1 ? Math.floor(this._random() * this.order) : state;
      }
    }
  }

  counts() {
    const counts = new Uint32Array(this.order);
    for (const state of this.cells) counts[state]++;
    return counts;
  }
}
