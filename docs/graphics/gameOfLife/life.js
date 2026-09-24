// life.js — Conway's Game of Life with a (ℤ/2ℤ)² "charge" on every live cell.
//
// A cell is 0 (dead) or one of the three nonzero elements of V = (ℤ/2ℤ)²,
// encoded so that the group operation is bitwise XOR:
//   a = (1,0) = 1,   b = (0,1) = 2,   c = (1,1) = 3,   a + b = c.
// Whether a cell is alive next generation is decided by the ordinary
// outer-totalistic rule (B3/S23 by default) applied to the *count* of live
// neighbours, so the black-and-white shadow of the field is plain Life. The
// only exception is triad cancellation: a birth whose three parents are a, b
// and c sums to 0 in V and, if enabled, is stillborn. Colours are decided by
// the birth and survival laws below.

export const A = 1, B = 2, C = 3;
export const NAMES = ['0', 'a', 'b', 'c'];
// σ: a → b → c → a, an order-3 element of Aut(V) = GL₂(𝔽₂) ≅ S₃.
export const SIGMA = [0, B, C, A];

export const RULES = {
  'B3/S23': 'Conway’s Life',
  'B36/S23': 'HighLife',
  'B3/S012345678': 'Life without death',
  'B3/S12345': 'Maze',
  'B3/S45678': 'Coral',
  'B3678/S34678': 'Day & Night',
  'B2/S': 'Seeds',
};

export const LAWS = {
  heredity: { birth: 'sum', survive: 'keep', cancel: true,
    label: 'Heredity', help: 'A newborn is the sum of its three parents in (ℤ/2)²: two a’s and a b make b. a + b + c = 0, so a triad of all three colours is stillborn. Survivors keep their colour.' },
  alchemy: { birth: 'sum', survive: 'mix', cancel: true,
    label: 'Alchemy', help: 'Births as in Heredity. A survivor x also absorbs the sum s of its neighbours, becoming x + s (unless that is 0). One-colour patterns are untouched, but mixed still lifes shimmer.' },
  predation: { birth: 'predation', survive: 'predation', cancel: false,
    label: 'Predation', help: 'The automorphism σ : a → b → c → a names a predator σ(x) for each colour x. When a birth’s parents are x’s and σ(x)’s, the predator wins, and each σ(x) neighbour of a survivor x may convert it (see Bite). Triads are born with a random colour.' },
  tribes: { birth: 'majority', survive: 'conform', cancel: false,
    label: 'Tribes', help: 'Newborns take the majority colour; survivors defect to any colour that outnumbers their own among their neighbours (with at least two). Borders harden into territories.' },
};

export function parseRule(text) {
  const m = /^\s*B([0-8]*)\s*\/\s*S([0-8]*)\s*$/i.exec(text || '');
  if (!m) return null;
  const birth = new Uint8Array(9), survive = new Uint8Array(9);
  for (const d of m[1]) birth[+d] = 1;
  for (const d of m[2]) survive[+d] = 1;
  return { birth, survive, text: `B${[...new Set(m[1])].sort().join('')}/S${[...new Set(m[2])].sort().join('')}` };
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const BITE = new Float64Array(9);

// Width of the hidden border around an open field. Its outer ring is kept
// dead, so gliders that leave the view simply fade out.
export const MARGIN = 12;

export class Life {
  constructor({ width, height, boundary = 'open', rule = 'B3/S23', law = 'heredity', seed = 1 } = {}) {
    this.viewW = width; this.viewH = height;
    this.boundary = boundary;
    this.margin = boundary === 'open' ? MARGIN : 0;
    this.W = width + 2 * this.margin; this.H = height + 2 * this.margin;
    this.cells = new Uint8Array(this.W * this.H);
    this.next = new Uint8Array(this.W * this.H);
    this.age = new Uint16Array(this.W * this.H); // generations since the cell last changed state
    this.generation = 0;
    this.births = 0; this.deaths = 0; this.conversions = 0; this.cancelled = 0;
    this.mutation = 0;
    this.setBite(0.2);
    this.rng = mulberry32(seed);
    this.setRule(rule);
    this.setLaw(law);
    const xm = new Int32Array(this.W), xp = new Int32Array(this.W);
    for (let x = 0; x < this.W; x++) { xm[x] = (x - 1 + this.W) % this.W; xp[x] = (x + 1) % this.W; }
    this.xm = xm; this.xp = xp;
  }

  setRule(text) {
    const r = parseRule(text);
    if (!r) return false;
    this.birth = r.birth; this.survive = r.survive; this.ruleText = r.text;
    return true;
  }

  /** Probability that one predator neighbour converts a survivor under Predation. */
  setBite(p) {
    this.bite = p;
    for (let k = 0; k <= 8; k++) BITE[k] = 1 - (1 - p) ** k;
  }

  setLaw(law) {
    const preset = typeof law === 'string' ? LAWS[law] : law;
    if (!preset) return;
    this.birthLaw = preset.birth; this.surviveLaw = preset.survive; this.cancel = !!preset.cancel;
  }

  /** Index of visible cell (x, y), or -1 outside the simulated area. */
  index(x, y) {
    if (this.boundary === 'wrap') {
      x = ((x % this.W) + this.W) % this.W; y = ((y % this.H) + this.H) % this.H;
    } else {
      x += this.margin; y += this.margin;
      if (x < 1 || y < 1 || x >= this.W - 1 || y >= this.H - 1) return -1;
    }
    return y * this.W + x;
  }

  get(x, y) { const i = this.index(x, y); return i < 0 ? 0 : this.cells[i]; }
  set(x, y, v) { const i = this.index(x, y); if (i >= 0 && this.cells[i] !== v) { this.cells[i] = v; this.age[i] = 0; } }

  clear() { this.cells.fill(0); this.age.fill(0); }

  step() {
    const { W, H, cells, next, age, birth, survive, xm, xp, rng } = this;
    const birthLaw = this.birthLaw, surviveLaw = this.surviveLaw, cancel = this.cancel, mutation = this.mutation;
    let births = 0, deaths = 0, conversions = 0, cancelled = 0;
    const count = [0, 0, 0, 0];
    for (let y = 0; y < H; y++) {
      const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
      for (let x = 0; x < W; x++) {
        const l = xm[x], rr = xp[x];
        const n0 = cells[r0 + l], n1 = cells[r0 + x], n2 = cells[r0 + rr], n3 = cells[r1 + l],
          n4 = cells[r1 + rr], n5 = cells[r2 + l], n6 = cells[r2 + x], n7 = cells[r2 + rr];
        const i = r1 + x, self = cells[i];
        count[1] = count[2] = count[3] = 0;
        count[n0]++; count[n1]++; count[n2]++; count[n3]++; count[n4]++; count[n5]++; count[n6]++; count[n7]++;
        const n = count[1] + count[2] + count[3];
        let out = 0;
        if (self === 0) {
          if (birth[n]) {
            const s = n0 ^ n1 ^ n2 ^ n3 ^ n4 ^ n5 ^ n6 ^ n7;
            const triad = count[1] && count[2] && count[3];
            if (triad && cancel) { cancelled++; }
            else {
              if (birthLaw === 'sum') out = s;
              else if (birthLaw === 'predation' && !triad) out = predator(count);
              if (!out) out = majority(count, rng);
              if (mutation && rng() < mutation) out = ((out + (rng() < 0.5 ? 0 : 1)) % 3) + 1;
              births++;
            }
          }
        } else if (survive[n]) {
          out = self;
          if (surviveLaw === 'mix') {
            const t = self ^ n0 ^ n1 ^ n2 ^ n3 ^ n4 ^ n5 ^ n6 ^ n7;
            if (t) out = t;
          } else if (surviveLaw === 'predation') {
            // Each predator neighbour independently converts with probability `bite`.
            const k = count[SIGMA[self]];
            if (k && rng() < BITE[k]) out = SIGMA[self];
          } else if (surviveLaw === 'conform') {
            let best = self, bestCount = count[self];
            for (let k = 1; k <= 3; k++) if (count[k] >= 2 && count[k] > bestCount) { best = k; bestCount = count[k]; }
            out = best;
          }
          if (out !== self) conversions++;
        } else {
          deaths++;
        }
        next[i] = out;
        if (out !== self) age[i] = 0; else if (age[i] < 65535) age[i]++;
      }
    }
    if (this.margin) {
      // Keep the outermost ring dead: an absorbing edge for escaping ships.
      for (let x = 0; x < W; x++) { next[x] = 0; next[(H - 1) * W + x] = 0; }
      for (let y = 0; y < H; y++) { next[y * W] = 0; next[y * W + W - 1] = 0; }
    }
    this.cells = next; this.next = cells;
    this.generation++;
    this.births = births; this.deaths = deaths; this.conversions = conversions; this.cancelled = cancelled;
  }

  /** Population of a, b, c in the visible region. */
  census() {
    const out = [0, 0, 0, 0];
    const m = this.margin;
    for (let y = 0; y < this.viewH; y++) {
      const row = (y + m) * this.W + m;
      for (let x = 0; x < this.viewW; x++) out[this.cells[row + x]]++;
    }
    return out;
  }
}

// With only two colours present, the one that preys on the other; else the only one.
function predator(count) {
  for (let k = 1; k <= 3; k++) if (count[k] && !count[SIGMA[SIGMA[k]]]) return count[SIGMA[k]] ? SIGMA[k] : k;
  return 0;
}

function majority(count, rng) {
  const best = Math.max(count[1], count[2], count[3]);
  const ties = [];
  for (let k = 1; k <= 3; k++) if (count[k] === best) ties.push(k);
  return ties.length === 1 ? ties[0] : ties[Math.floor(rng() * ties.length)];
}
