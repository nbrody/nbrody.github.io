// chart.js — world lines of the bodies along one axis, drawn on a 2D canvas.
//
// Two layouts:
//   world   x = time (scrolling window), y = coordinate
//   blowup  x = −log₁₀(t* − t), y = (z − z_mid)/(z_A − z_B)   (Xia only)
// In blow-up coordinates the accelerating bounces of Xia's cascade become an
// evenly spaced zigzag between two fixed rails.

const MAX = 4000;

export class Chart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reset({ series: [], colors: [] });
  }

  reset({ series, colors, labels = [], tStar = null, window = 20, mode = 'world' }) {
    this.nS = series;             // number of series
    this.colors = colors;
    this.labels = labels;
    this.tStar = tStar;
    this.windowT = window;
    this.mode = mode;
    this.t = new Float64Array(MAX);
    this.y = Array.from({ length: series }, () => new Float64Array(MAX));
    this.n = 0; this.start = 0;
    this.events = [];
    this.yLo = -1; this.yHi = 1;
  }

  push(t, values) {
    if (this.n && t <= this.t[(this.start + this.n - 1) % MAX]) return;
    let k;
    if (this.n < MAX) { k = (this.start + this.n) % MAX; this.n++; }
    else { k = this.start; this.start = (this.start + 1) % MAX; }
    this.t[k] = t;
    for (let s = 0; s < this.nS; s++) this.y[s][k] = values[s];
  }

  mark(t, label) { this.events.push({ t, label }); if (this.events.length > 64) this.events.shift(); }

  draw() {
    const c = this.canvas, ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
    if (!W || !H) return;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    ctx.clearRect(0, 0, W, H);
    if (!this.n) return;
    const padL = 6 * dpr, padR = 6 * dpr, padT = 14 * dpr, padB = 14 * dpr;
    const blow = this.mode === 'blowup' && this.tStar != null && this.nS >= 3;
    const last = (this.start + this.n - 1) % MAX;
    const tNow = this.t[last];

    // x mapping
    let X, x0, x1;
    if (blow) {
      const lx = (t) => -Math.log10(Math.max(this.tStar - t, 1e-300));
      x0 = lx(this.t[this.start]); x1 = Math.max(lx(tNow) + 0.25, x0 + 1);
      X = (t) => padL + (lx(t) - x0) / (x1 - x0) * (W - padL - padR);
    } else {
      x1 = tNow; x0 = Math.max(this.t[this.start], tNow - this.windowT);
      if (x1 - x0 < 1e-9) x1 = x0 + 1e-9;
      X = (t) => padL + (t - x0) / (x1 - x0) * (W - padL - padR);
    }
    // y values (blow-up normalizes by the binaries' separation)
    const yv = (s, k) => {
      if (!blow) return this.y[s][k];
      const a = this.y[0][k], b = this.y[1][k], mid = 0.5 * (a + b), sep = a - b || 1;
      return (this.y[s][k] - mid) / sep;
    };
    // autoscale over visible samples
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const k = (this.start + i) % MAX;
      if (!blow && this.t[k] < x0) continue;
      for (let s = 0; s < this.nS; s++) { const v = yv(s, k); if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (blow) { lo = -0.62; hi = 0.62; }
    else {
      const pad = 0.08 * (hi - lo || 1); lo -= pad; hi += pad;
      // smooth the range so it breathes instead of jumping
      this.yLo += (lo - this.yLo) * 0.08; this.yHi += (hi - this.yHi) * 0.08;
      if (lo < this.yLo) this.yLo = lo; if (hi > this.yHi) this.yHi = hi;
      lo = this.yLo; hi = this.yHi;
    }
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

    // frame + zero line
    ctx.strokeStyle = 'rgba(160,170,255,0.10)'; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
    if (blow) {
      ctx.setLineDash([3 * dpr, 4 * dpr]);
      for (const v of [0.5, -0.5]) { ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(W - padR, Y(v)); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // events
    ctx.fillStyle = 'rgba(255,227,107,0.55)';
    for (const e of this.events) {
      const x = X(e.t); if (x < padL || x > W - padR) continue;
      ctx.fillRect(x - 0.5 * dpr, H - padB + 3 * dpr, dpr, 5 * dpr);
    }
    // lines
    for (let s = 0; s < this.nS; s++) {
      ctx.strokeStyle = this.colors[s]; ctx.lineWidth = 1.5 * dpr; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      let started = false, px = -1;
      for (let i = 0; i < this.n; i++) {
        const k = (this.start + i) % MAX;
        const x = X(this.t[k]);
        if (x < padL - 1) continue;
        if (started && Math.abs(x - px) < 0.35 * dpr && i < this.n - 1) continue;
        const y = Y(yv(s, k));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        px = x;
      }
      ctx.stroke();
      // head dot
      const x = X(tNow), y = Y(yv(s, last));
      ctx.globalAlpha = 1; ctx.fillStyle = this.colors[s];
      ctx.beginPath(); ctx.arc(x, y, 2.6 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // captions
    ctx.font = `${10 * dpr}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(210,215,255,0.55)';
    ctx.textBaseline = 'top';
    ctx.fillText(blow ? 'z / (z_A − z_B)' : this.axisLabel || 'z', padL, 1 * dpr);
    ctx.textBaseline = 'bottom';
    const cap = blow ? '−log₁₀(t* − t) →' : 'time →';
    ctx.fillText(cap, W - padR - ctx.measureText(cap).width, H - 0.5 * dpr);
  }
}
