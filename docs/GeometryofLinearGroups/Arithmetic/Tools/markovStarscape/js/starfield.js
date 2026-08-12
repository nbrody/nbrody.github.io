'use strict';
// Canvas 3D starscape renderer: orthographic orbit camera, additive splatting
// into an ImageData buffer for faint stars/dust, cached glow sprites for bright ones.

const STAR_COLORS = [
  [158, 192, 255],  // 0: sheet (icy blue)
  [255, 196, 172],  // 1: compact / SU(2) (warm)
  [255, 214, 120],  // 2: integral (gold)
];

class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.yaw = 0.65;
    this.pitch = 0.38;
    this.zoom = 1;       // px per world unit; set on setData
    this.panX = 0;
    this.panY = 0;
    this.alpha = 0.6;    // height exponent
    this.scale = 10;     // radius of an H=1 star, px
    this.showDust = true;
    this.M = 12;
    this.count = 0;
    this.hitList = [];
    this.selected = null;      // {orbit, coords: [frac,frac,frac], floats:[x,y,z]}
    this.partnerFloats = [];   // world coords of Vieta partners of selection
    this.spriteCache = new Map();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.twinkle = null;       // {depths: Int32Array per orbit, maxD} while animating
    this.twinkleTime = 0;      // seconds since the wave left the basepoint
  }

  setData(orbits, dust, dustCompact, M, symOps) {
    this.M = M;
    this.symOps = symOps || SYM24;
    // Expand each orbit through its symmetry group, deduplicating repeated images.
    const bh = [];  // temp: [x,y,z,H,flag,orbIdx,opIdx] tuples flattened later
    orbits.sort((a, b) => a.H - b.H); // brightest (smallest height) first
    let n = 0;
    for (let oi = 0; oi < orbits.length; oi++) {
      const o = orbits[oi];
      const f = o.fr.map(fnum);
      const seen = new Set();
      for (let k = 0; k < this.symOps.length; k++) {
        const op = this.symOps[k];
        const x = op.s[0] * f[op.p[0]], y = op.s[1] * f[op.p[1]], z = op.s[2] * f[op.p[2]];
        const key = x + ',' + y + ',' + z;
        if (seen.has(key)) continue;
        seen.add(key);
        bh.push(x, y, z, o.H, o.integral ? 2 : (o.compact ? 1 : 0), oi, k);
        n++;
      }
    }
    this.count = n;
    this.orbits = orbits;
    this.px = new Float32Array(n * 3);
    this.H = new Float32Array(n);
    this.flag = new Uint8Array(n);
    this.orbIdx = new Uint32Array(n);
    this.opIdx = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      this.px[3 * i] = bh[7 * i];
      this.px[3 * i + 1] = bh[7 * i + 1];
      this.px[3 * i + 2] = bh[7 * i + 2];
      this.H[i] = bh[7 * i + 3];
      this.flag[i] = bh[7 * i + 4];
      this.orbIdx[i] = bh[7 * i + 5];
      this.opIdx[i] = bh[7 * i + 6];
    }
    this.dust = dust;               // Float32Array xyz
    this.dustCompact = dustCompact; // Uint8Array
    this.recomputeRadii();
    this.fitView();
  }

  fitView() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.needsFit = !(w > 10 && h > 10);   // layout not ready yet; refit on resize
    this.zoom = 0.42 * Math.min(w || 800, h || 600) / this.M;
    this.panX = 0; this.panY = 0;
  }

  recomputeRadii() {
    const n = this.count;
    this.rad = new Float32Array(n);
    for (let i = 0; i < n; i++) this.rad[i] = this.scale * Math.pow(this.H[i], -this.alpha);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    const W = Math.round(w * this.dpr), Hh = Math.round(h * this.dpr);
    if (this.canvas.width !== W || this.canvas.height !== Hh) {
      this.canvas.width = W;
      this.canvas.height = Hh;
      this.buf = this.ctx.createImageData(W, Hh);
    } else if (!this.buf) {
      this.buf = this.ctx.createImageData(W, Hh);
    }
  }

  sprite(colorIdx, r) {
    const rq = Math.min(10, Math.max(1.25, Math.round(r * 4) / 4));
    const key = colorIdx + '|' + rq;
    let sp = this.spriteCache.get(key);
    if (sp) return sp;
    const halo = rq * 2.2;
    const size = Math.ceil(2 * halo) + 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const [R, G, B] = STAR_COLORS[colorIdx];
    const cx = size / 2;
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, halo);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(Math.min(0.9, rq / halo), `rgba(${R},${G},${B},0.85)`);
    grad.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    sp = { c, size };
    this.spriteCache.set(key, sp);
    return sp;
  }

  render(quality = 'high') {
    this.resize();
    const ctx = this.ctx;
    const W = this.canvas.width, Hh = this.canvas.height;
    const cx = W / 2, cyC = Hh / 2;
    const zm = this.zoom * this.dpr;
    const panX = this.panX * this.dpr, panY = this.panY * this.dpr;

    const data = this.buf.data;
    // background: deep blue-black
    const buf32 = new Uint32Array(data.buffer);
    buf32.fill(0xff0e0704); // ABGR: a=ff b=0e g=07 r=04
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);

    const splat = (sx, sy2, r, g, b) => {
      const ix = sx | 0, iy = sy2 | 0;
      if (ix < 0 || iy < 0 || ix >= W - 1 || iy >= Hh - 1) return;
      const fx = sx - ix, fy = sy2 - iy;
      let i = (iy * W + ix) * 4;
      let w0 = (1 - fx) * (1 - fy);
      data[i] += r * w0; data[i + 1] += g * w0; data[i + 2] += b * w0;
      w0 = fx * (1 - fy); i += 4;
      data[i] += r * w0; data[i + 1] += g * w0; data[i + 2] += b * w0;
      w0 = (1 - fx) * fy; i += 4 * W - 4;
      data[i] += r * w0; data[i + 1] += g * w0; data[i + 2] += b * w0;
      w0 = fx * fy; i += 4;
      data[i] += r * w0; data[i + 1] += g * w0; data[i + 2] += b * w0;
    };

    const tx = (x, y, z, out) => {
      const rx = cy * x + sy * z;
      const rz = -sy * x + cy * z;
      const ry = cp * y - sp * rz;
      out[0] = cx + panX + zm * rx;
      out[1] = cyC + panY - zm * ry;
    };
    const pt = [0, 0];

    // dust
    if (this.showDust && this.dust) {
      const stride = quality === 'high' ? 1 : 4;
      const nd = this.dust.length / 3;
      for (let i = 0; i < nd; i += stride) {
        tx(this.dust[3 * i], this.dust[3 * i + 1], this.dust[3 * i + 2], pt);
        const warm = this.dustCompact[i];
        splat(pt[0], pt[1], warm ? 16 : 9, warm ? 11 : 12, warm ? 9 : 22);
      }
    }

    // stars: array is sorted brightest-first, so LOD = draw a prefix
    const n = quality === 'high' ? this.count : Math.min(this.count, 220000);
    const big = [];
    // twinkle wave: a pulse sweeping outward through the Vieta/Markov tree
    const tw = this.twinkle;
    const twD = tw && tw.depths;
    const t = this.twinkleTime;
    const wavePos = tw ? ((t * 2.0) % (tw.maxD + 4)) - 1.5 : 0;
    for (let i = 0; i < n; i++) {
      let r = this.rad[i] * this.dpr;
      // sorted: everything after is fainter (twinkle can boost up to ~3x)
      if (r < (tw ? 0.115 : 0.32)) break;
      if (tw) {
        const d = twD[this.orbIdx[i]];
        if (d >= 0) {
          const dx = d - wavePos;
          const g = Math.exp(-dx * dx * 1.6);
          if (g > 0.02) r *= 1 + 1.9 * g * (0.72 + 0.28 * Math.sin(t * 11 + i * 0.618));
        }
        if (r < 0.32) continue;
      }
      tx(this.px[3 * i], this.px[3 * i + 1], this.px[3 * i + 2], pt);
      if (r >= 1.15) {
        if (pt[0] > -60 && pt[1] > -60 && pt[0] < W + 60 && pt[1] < Hh + 60)
          big.push(i, pt[0], pt[1], r);
        continue;
      }
      const a = Math.min(1, r * r * 0.85);
      const c = STAR_COLORS[this.flag[i]];
      splat(pt[0], pt[1], c[0] * a, c[1] * a, c[2] * a);
    }
    ctx.putImageData(this.buf, 0, 0);

    // bright stars as glow sprites
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.hitList.length = 0;
    for (let j = 0; j < big.length; j += 4) {
      const i = big[j], sx = big[j + 1], sy2 = big[j + 2], r = big[j + 3];
      const sp2 = this.sprite(this.flag[i], r);
      ctx.drawImage(sp2.c, sx - sp2.size / 2, sy2 - sp2.size / 2);
      if (quality === 'high' && r >= 1.4 * this.dpr * 0.7)
        this.hitList.push({ x: sx / this.dpr, y: sy2 / this.dpr, i });
    }
    ctx.restore();

    // selection overlay
    if (this.selected) {
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      const zmc = this.zoom;
      const txc = (x, y, z) => {
        const rx = cy * x + sy * z;
        const rz = -sy * x + cy * z;
        const ry = cp * y - sp * rz;
        return [W / (2 * this.dpr) + this.panX + zmc * rx,
                Hh / (2 * this.dpr) + this.panY - zmc * ry];
      };
      const s = this.selected.floats;
      const [ax, ay] = txc(s[0], s[1], s[2]);
      ctx.strokeStyle = 'rgba(255,214,120,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ax, ay, 9, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      for (const p of this.partnerFloats) {
        const [bx, by] = txc(p[0], p[1], p[2]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(140,200,255,0.8)';
        ctx.beginPath(); ctx.arc(bx, by, 6, 0, 2 * Math.PI); ctx.stroke();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      }
      ctx.restore();
    }
  }

  pick(mx, my) {
    let best = null, bd = 12 * 12;
    for (const h of this.hitList) {
      const d = (h.x - mx) * (h.x - mx) + (h.y - my) * (h.y - my);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }
}
