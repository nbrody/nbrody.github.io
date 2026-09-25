// limitWorker.js — one member of the pool that renders the limit sets of
// Figures 10.10 and 10.13.
//
// Both groups are (nearly) doubly degenerate, with (nearly) sphere-filling
// limit sets, so the DFS is expensive. The main thread splits the word tree by
// prefix into many subtrees; each task here walks one subtree and rasterises
// its leaves into a label buffer (0 = nothing, 1…255 = the colouring class of
// the leaf's word, see palette.js). The lit pixels are sent back to be merged.
// Work is very uneven — subtrees spiralling into cusps can hold most of it —
// so when other workers are idle the main thread asks a busy one to donate
// its pending sibling subtrees as new tasks.
//
// A 'chains' message instead finds the circle chains of some cusp words.

import { grandma, limitSetWalker, fareyWord, cuspChainDisks } from './kleinian.js';

let cancelledBelow = 0; // tasks of jobs with id < this are abandoned
let splitWanted = false; // the main thread would like some of our work


self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'cancel') cancelledBelow = Math.max(cancelledBelow, m.below);
  else if (m.type === 'split') splitWanted = true;
  else if (m.type === 'task') runTask(m);
  else if (m.type === 'chains') runChains(m);
};

function runChains({ job, ta, tb, root, chains }) {
  const { gens } = grandma(ta, tb, root);
  const samples = [];
  const walker = limitSetWalker(gens, { epsilon: 0.02, maxLevel: 50, emit(xs, ys) { samples.push(xs[1], ys[1]); } });
  while (!walker.step(1e6)) {}
  const disks = chains.map(({ p, q, X, Y }) => cuspChainDisks(gens, fareyWord(p, q, X, Y), samples));
  self.postMessage({ type: 'chains', job, disks });
}

// ---- colouring: the class of a word (tags[1..lev], generator indices) ----------------
// turn(i) is 0, 1, 2 for left (k+1), straight (k), right (k−1) at letter i.
function labeller(scheme, maxLevel) {
  const turn = (t, i) => [1, 0, 3].indexOf((t[i] - t[i - 1] + 4) % 4);
  const at = (t, lev, i) => t[Math.min(i, lev)];
  switch (scheme) {
    case 'l1': case 'l2': case 'l3': case 'l4': {
      const n = +scheme[1];
      return (t, lev) => 1 + at(t, lev, n);
    }
    case 'last': return (t, lev) => 1 + t[lev];
    case 'p1': case 'p2': case 'p3': {
      const n = +scheme[1];
      return (t, lev) => (lev <= n ? 1 + t[lev] * 3 : 1 + t[n] * 3 + turn(t, n + 1));
    }
    case 't1': return (t, lev) => (lev < 3 ? 1 + t[1] * 9 : 1 + t[1] * 9 + turn(t, 2) * 3 + turn(t, 3));
    case 'turns': return (t, lev) => (lev < 4 ? 1 : 1 + turn(t, 2) * 9 + turn(t, 3) * 3 + turn(t, 4));
    case 'abel': {
      // Net exponents of a and b over the first 24 letters, as an angle.
      return (t, lev) => {
        let x = 0, y = 0;
        for (let i = 1, e = Math.min(lev, 24); i <= e; i++) {
          const k = t[i];
          if (k === 0) x++; else if (k === 2) x--; else if (k === 1) y++; else y--;
        }
        if (!x && !y) return 255;
        return 1 + Math.min(253, Math.floor(((Math.atan2(y, x) / Math.PI + 1) / 2) * 254));
      };
    }
    default: return (t, lev) => 1 + Math.min(254, Math.round((lev / maxLevel) * 254));
  }
}

// Per-worker scratch reused across tasks: labels, a stamp marking pixels this
// task has touched, and the list of those pixels — so small tasks cost
// nothing proportional to the frame.
let scratch = null, stampId = 0;
function scratchFor(size) {
  if (!scratch || scratch.lab.length !== size) {
    scratch = { lab: new Uint8Array(size), stamp: new Uint32Array(size), idx: new Uint32Array(1 << 16) };
  }
  return scratch;
}

async function runTask(m) {
  const { job, task, W, H, center, half, px, maxLevel, minNorm, scheme, ta, tb, root, spikes, prefix } = m;
  const { gens } = grandma(ta, tb, root);
  const sx = W / (2 * half[0]), sy = H / (2 * half[1]);
  const x0 = center[0] - half[0], y1 = center[1] + half[1];
  const sc = scratchFor(W * H);
  const { lab, stamp } = sc;
  const id = ++stampId;
  let touched = 0;
  const plot = (i, v) => {
    if (stamp[i] !== id) {
      stamp[i] = id;
      if (touched === sc.idx.length) { const g = new Uint32Array(touched * 2); g.set(sc.idx); sc.idx = g; }
      sc.idx[touched++] = i;
    }
    lab[i] = v;
  };
  const label = labeller(scheme, maxLevel);
  // Deeper words are needed to resolve tentacles at finer resolution.
  const norm = Math.min(minNorm * (2 / px) ** 2, minNorm * 2);
  // Leaves cut off at maxLevel spiral into the parabolic cusps and can jump
  // far; drawing the shorter jumps gives the book's radial fringes.
  const maxSeg2 = Math.max(6 * px, spikes) ** 2;
  let leaves = 0;
  const walker = limitSetWalker(gens, {
    epsilon: px / sx, maxLevel, minNorm: norm, prefix,
    emit(xs, ys, tags, lev) {
      leaves++;
      const v = label(tags, lev);
      let ax = (xs[0] - x0) * sx, ay = (y1 - ys[0]) * sy;
      for (let j = 1; j < xs.length; j++) {
        const bx = (xs[j] - x0) * sx, by = (y1 - ys[j]) * sy;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        if (L2 < maxSeg2) {
          const n = Math.max(1, Math.ceil(Math.sqrt(L2)));
          for (let s = 0; s <= n; s++) {
            const X = (ax + (dx * s) / n) | 0, Y = (ay + (dy * s) / n) | 0;
            if (X >= 0 && X < W && Y >= 0 && Y < H) plot(Y * W + X, v);
          }
        }
        ax = bx; ay = by;
      }
    },
  });
  splitWanted = false;
  let last = performance.now();
  while (!walker.step(50000)) {
    if (performance.now() - last > 20) {
      // Yield so cancel and split requests can arrive.
      await new Promise((r) => setTimeout(r, 0));
      if (job < cancelledBelow) return;
      if (splitWanted) {
        splitWanted = false;
        const prefixes = walker.donate();
        self.postMessage({ type: 'donate', job, prefixes });
      }
      last = performance.now();
    }
  }
  if (job < cancelledBelow) return;
  const idx = sc.idx.slice(0, touched), val = new Uint8Array(touched);
  for (let k = 0; k < touched; k++) val[k] = lab[idx[k]];
  self.postMessage({ type: 'task', job, task, idx, val, leaves }, [idx.buffer, val.buffer]);
}
