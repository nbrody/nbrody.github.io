#!/usr/bin/env node
/* Recreate Riley's picture of the Riley slice.

   Each pixel rho is coloured by the number of faces of the Ford domain of
   < A, E >  (A = z+1, E = 1/(rho z)), i.e. the Ford domain of Riley's group
   < A, B >, B = (1 0; rho 1), taken with respect to both of its cusps.  The
   white lens is the complement of the Riley slice.  See fordCore.js.

     node rileyRegions.js                    Riley's window [0,4.2]^2 -> rileyRegions.png
     node rileyRegions.js --full             the whole slice (mirror symmetric)
     node rileyRegions.js --size 1600 --aa 3 --out big.png
     node rileyRegions.js --palette rainbow --cycle 9 --hue 0
     node rileyRegions.js --plane sqrt       the sqrt(rho) plane, as index.html draws it
     node rileyRegions.js --plane sqrt --effort high --size 6000 --counts sq6000.bin
     node rileyRegions.js --plane sqrt --window 1.9,2.02,-0.06,0.06   a zoom
   palettes: riley (default in rho, Riley's own), rainbow (default in sqrt),
   spectrum, pastel, calm

   Effort.
     normal  the lens is the polygon through the cusps p/q, q <= 64, and rows
             are scanned with fordCore's certificates.
     high    the polygon's chords are up to 0.025 long and its lens is too
             big by up to 0.005, so at high resolution it bites into the
             regions.  It now only decides points more than BAND inside it;
             within BAND of it every sample gets its own verdict from
             closures with long caps (see settle): a face count, the lens
             (a Shimizu witness), or undecided (painted as lens, counted).
             Elsewhere rows are still scanned, and a sample the scan cannot
             settle is redone the same way.  On test windows at the cusps
             rho = 4, 2i and along the boundary it agrees with max exactly.
     max     every sample gets its own verdict (slow; for checking high).
   Colours: --bg (the outermost region), --lens, --alpha with --under (regions
   blended over a backdrop, as index.html draws them at 70%), --undecided
   (show undecided samples).  --counts FILE caches the face counts, so a
   recolour does not recompute.                                             */

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");
const os = require("os");
const F = require("./fordCore.js");

const EFFORTS = {
  normal: { band: 0 },
  high:   { band: 0.05, perSample: false, maxLength: 480, maxFaces: 500 },
  max:    { band: 0.05, perSample: true,  maxLength: 480, maxFaces: 500 },
};

function args() {
  const a = process.argv.slice(2),
        o = { size: null, aa: null, full: false, out: null, palette: null, cycle: 9, hue: 0,
              plane: "rho", effort: "normal", radius: 2.08, window: null,
              bg: null, lens: null, alpha: null, under: null, undecided: null, counts: null };
  const num = new Set(["size", "aa", "cycle", "hue", "radius", "alpha"]);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--full") { o.full = true; continue; }
    const k = a[i].replace(/^--/, "");
    if (!a[i].startsWith("--") || !(k in o) || i + 1 >= a.length) throw new Error(`bad option ${a[i]}`);
    o[k] = num.has(k) ? +a[++i] : a[++i];
  }
  const sq = o.plane === "sqrt";
  if (!sq && o.plane !== "rho") throw new Error(`unknown plane ${o.plane}: rho, sqrt`);
  if (!EFFORTS[o.effort]) throw new Error(`unknown effort ${o.effort}: ${Object.keys(EFFORTS)}`);
  o.palette = o.palette || (sq ? "rainbow" : "riley");
  if (!F.PALETTES[o.palette]) throw new Error(`unknown palette ${o.palette}: ${Object.keys(F.PALETTES)}`);
  o.size = o.size || (sq ? 2000 : 1200);
  o.aa = o.aa || (o.effort === "normal" ? 2 : 3);
  if (sq) {                            // index.html's look: rainbow at 70% over its
    o.bg = o.bg || "#45474f";          // backdrop, the outermost region left clear
    o.under = o.under || "#e3e3e3";
    if (o.alpha == null) o.alpha = 0.7;
  }
  if (o.alpha == null) o.alpha = 1;
  o.lens = o.lens || "#ffffff";
  if (o.window) {
    o.window = o.window.split(",").map(Number);
    if (o.window.length !== 4 || o.window.some(v => !isFinite(v))) throw new Error("--window x0,x1,y0,y1");
  }
  const cap = s => s[0].toUpperCase() + s.slice(1);
  const stem = "rileyRegions" + (sq ? "Sqrt" : "") + (o.full ? "Full" : "") + (o.window ? "Zoom" : "") +
    (o.palette === "riley" ? "" : cap(o.palette)) + (o.effort === "normal" ? "" : cap(o.effort));
  o.out = o.out || path.join(__dirname, stem + ".png");
  return o;
}

/* ---- the lens ----------------------------------------------------------------
   The polygon through the cusps, and for high effort a bucket grid of its
   edges: near(x, y) is the distance to the polygon if it is under `band`,
   else Infinity.                                                            */
function makeLens(boundary, band) {
  const inside = F.makeLensTest(boundary);
  if (!band) return { inside, near: () => Infinity };
  const P = boundary.concat(boundary.slice(1, -1).reverse().map(([x, y]) => [x, -y]));
  const X0 = -4.3, Y0 = -2.3, NX = Math.ceil(8.6 / band), NY = Math.ceil(4.6 / band);
  const cells = Array.from({ length: NX * NY }, () => []);
  const cell = (v, v0, N) => Math.min(N - 1, Math.max(0, Math.floor((v - v0) / band)));
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i];
    const cx0 = cell(Math.min(ax, bx) - band, X0, NX), cx1 = cell(Math.max(ax, bx) + band, X0, NX);
    const cy0 = cell(Math.min(ay, by) - band, Y0, NY), cy1 = cell(Math.max(ay, by) + band, Y0, NY);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) cells[cy * NX + cx].push(ax, ay, bx, by);
  }
  return {
    inside,
    near(x, y) {
      if (x < X0 || x >= X0 + NX * band || y < Y0 || y >= Y0 + NY * band) return Infinity;
      const E = cells[Math.floor((y - Y0) / band) * NX + Math.floor((x - X0) / band)];
      let d2 = band * band;
      for (let e = 0; e < E.length; e += 4) {
        const ax = E[e], ay = E[e + 1], ex = E[e + 2] - ax, ey = E[e + 3] - ay;
        const L2 = ex * ex + ey * ey;
        let t = L2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = ax + t * ex - x, dy = ay + t * ey - y;
        d2 = Math.min(d2, dx * dx + dy * dy);
      }
      return d2 < band * band ? Math.sqrt(d2) : Infinity;
    },
  };
}

/* ---- a sample's own verdict ----------------------------------------------------
   A closure seeded with a neighbour's faces is fast, but near the cusp rho = 4
   it can stop at a self-consistent face set that is not the Ford domain
   (about 1 sample in 130 there), and so can one grown from E alone, more
   rarely.  Inside the lens near rho = 2i closures also stop at face sets
   that are not closed under inverses (even counts) -- a Ford domain's faces
   pair off, g with g^-1 and E with itself -- so a closure only counts as
   complete if its faces pair.  Both closures are run.  A Shimizu witness
   from either is a proof and final; if they disagree otherwise, a closure
   seeded with both face sets and their inverses decides.
     Last, the products f A^(+-2) g, which the closure never forms (on the
   exterior every exponent is +-1).  Below the cusp rho = 2i, where the 1/2
   word is nearly an irrational elliptic, closures stop at paired face sets
   whose A^(+-2) products have isometric circles of radius 2 to 7: Shimizu
   again, so the lens.  Inside the polygon a complete answer must also keep
   its faces when those products are added, or it is undecided.
   Returns [count or 0 (lens) or -1 (undecided), faces].                   */
const inverse = w => w.slice().reverse().map(n => -n);
function paired(faces) {
  const ks = new Set(faces.map(f => f.word.join(",")));
  return faces.every(f => ks.has(inverse(f.word).join(",")));
}
function shimizu2(a, b, faces) {        // some f A^(+-2) g with 0 < |c| < 1?
  const M = faces.map(f => F.wordMatrix(f.word, a, b));
  for (const f of M) for (const k of [2, -2]) {
    const ur = k * f[4] + f[6], ui = k * f[5] + f[7];           // f A^k = (. .; c1, k c1 + d1)
    for (const g of M) {
      const cr = f[4] * g[0] - f[5] * g[1] + ur * g[4] - ui * g[5];
      const ci = f[4] * g[1] + f[5] * g[0] + ur * g[5] + ui * g[4];
      const c2 = cr * cr + ci * ci;
      if (c2 > 1e-18 && c2 < 1 - 1e-9) return true;
    }
  }
  return false;
}
function keeps2(a, b, faces) {          // adding the f A^(+-2) g leaves the faces alone?
  const W = faces.map(f => f.word), cand = W.slice();
  for (const f of W) for (const g of W) for (const k of [2, -2]) cand.push(f.concat([k], g));
  return F.signature(F.facesOf(cand, a, b)) === F.signature(faces);
}
function settle(a, b, seed, eff, st, inside) {
  const O = { maxLength: eff.maxLength, maxFaces: eff.maxFaces };
  const good = fd => fd.complete && paired(fd.faces);
  st.closures++;
  const s = seed ? F.fordDomain(a, b, { ...O, seed }) : null;
  if (s && s.nondiscrete) return [0, null];
  const u = F.fordDomain(a, b, O);
  if (u.nondiscrete) return [0, null];
  let fd = u;
  if (!good(u) || (s && !(good(s) && F.signature(s.faces) === F.signature(u.faces)))) {
    st.disputes++;
    const words = (s ? s.faces : []).concat(u.faces).map(f => f.word);
    fd = F.fordDomain(a, b, { ...O, seed: words.concat(words.map(inverse)) });
    if (fd.nondiscrete) return [0, null];
    if (!good(fd)) return [-1, null];
  }
  if (shimizu2(a, b, fd.faces)) { st.shimizu2++; return [0, null]; }
  if (inside && !keeps2(a, b, fd.faces)) return [-1, null];
  return [fd.faces.length, fd.faces];
}

/* ---- one row of samples, rho = rhoAt(t) ----------------------------------------
   Face counts; 0 = lens, -1 = undecided (high/max effort only).          */
function solveRow(len, rhoAt, eff, lens, st) {
  if (!eff.band)
    return F.scanRow(len, rhoAt, { skip: (a, b) => lens.inside(a, b) }).counts;
  const out = new Int16Array(len);
  const cls = new Uint8Array(len);     // 0 scan, 1 own closure, 2 deep in the lens
  const dist = new Float64Array(len), ins = new Uint8Array(len);
  for (let t = 0; t < len; t++) {
    const [a, b] = rhoAt(t), d = lens.near(a, b);
    ins[t] = lens.inside(a, b) ? 1 : 0;
    dist[t] = d;
    cls[t] = ins[t] && d === Infinity ? 2 : d < Infinity || eff.perSample ? 1 : 0;
  }
  for (let s = 0; s < len;) {          // scan the runs away from the boundary
    if (cls[s]) { s++; continue; }
    let e = s;
    while (e < len && !cls[e]) e++;
    const { counts } = F.scanRow(e - s, t => rhoAt(s + t));
    for (let t = s; t < e; t++) {               // the scan's closure gave up, or
      if (counts[t - s] > 0 && counts[t - s] % 2) out[t] = counts[t - s];
      else { cls[t] = 1; st.rescued++; }        // its faces cannot pair off
    }
    s = e;
  }
  let seed = null;
  for (let t = 0; t < len; t++) {
    if (cls[t] !== 1) continue;
    const [a, b] = rhoAt(t);
    const [v, faces] = settle(a, b, seed, eff, st, ins[t]);
    out[t] = v;
    if (v > 0) {
      seed = faces.map(f => f.word);
      if (ins[t]) st.deepest = Math.max(st.deepest, dist[t]);   // in the slice, inside the polygon
    } else if (v === 0) {
      st.nondiscrete++;
      if (!ins[t] && dist[t] < Infinity) st.bulge = Math.max(st.bulge, dist[t]);
    } else st.undecided++;
  }
  return out;
}

/* Sample grids.  rect: nx x ny samples over [x0,x1] x [y0,y1], row 0 at the
   top.  wedge (the whole sqrt plane, 8-fold symmetric under z -> iz, z ->
   conj z): the first-quadrant samples (u, v), u >= v, of an n x n grid on
   [-R,R]^2 -- row v holds u = v .. m-1, m = n/2.
   Samples on the axes of the rho plane are nudged off them by 1% of the
   sample spacing: on Re rho = 0 (the diagonals of the sqrt plane) circles
   coincide exactly, and inside the lens closures there stop at small,
   false face sets (even face counts) as deep as 0.05 inside the polygon. */
function rowPath(G, r) {
  const h = G.kind === "wedge" ? 2 * G.R / G.n : (G.x1 - G.x0) / G.nx;
  const sq = G.plane === "sqrt";
  const onAxis = (x, y) => sq ? Math.abs(Math.abs(x) - Math.abs(y)) < 1e-9 * h || Math.abs(x) < 1e-9 * h || Math.abs(y) < 1e-9 * h
                              : Math.abs(x) < 1e-9 * h || Math.abs(y) < 1e-9 * h;
  const map = (x, y) => {
    if (onAxis(x, y)) x += 0.01 * h;
    return sq ? [x * x - y * y, 2 * x * y] : [x, y];
  };
  if (G.kind === "wedge") {
    const y = (r + 0.5) * h;
    return [G.n / 2 - r, t => map((r + t + 0.5) * h, y)];
  }
  const y = G.y1 - (r + 0.5) * (G.y1 - G.y0) / G.ny;
  return [G.nx, c => map(G.x0 + (c + 0.5) * h, y)];
}

function png(w, h, rgb) {
  const crcTable = (b) => zlib.crc32(b);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crcTable(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const raw = Buffer.alloc((3 * w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (3 * w + 1)] = 0;
    rgb.copy ? rgb.copy(raw, y * (3 * w + 1) + 1, 3 * w * y, 3 * w * (y + 1))
             : raw.set(rgb.subarray(3 * w * y, 3 * w * (y + 1)), y * (3 * w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: w * h > 4e6 ? 6 : 9 })),
    chunk("IEND", Buffer.alloc(0))]);
}

if (!isMainThread) {
  const { G, rows, boundary, effort } = workerData;
  const eff = EFFORTS[effort], lens = makeLens(boundary, eff.band);
  const st = { closures: 0, rescued: 0, disputes: 0, shimizu2: 0, nondiscrete: 0, undecided: 0, deepest: 0, bulge: 0 };
  const parts = rows.map(r => { const [len, rhoAt] = rowPath(G, r); return solveRow(len, rhoAt, eff, lens, st); });
  parentPort.postMessage({ rows, parts, st });
} else {
  const o = args();
  const t0 = Date.now();
  const sq = o.plane === "sqrt";
  const L = 4.2;                                   // Riley's window, in rho
  // the grid, and the output image size W x H
  let G, W, H;
  if (o.window) {
    const [x0, x1, y0, y1] = o.window;
    W = o.size; H = Math.max(1, Math.round(o.size * (y1 - y0) / (x1 - x0)));
    G = { kind: "rect", plane: o.plane, x0, x1, y0, y1, nx: W * o.aa, ny: H * o.aa };
  } else if (sq) {
    W = H = 2 * Math.ceil(o.size / 2);
    G = { kind: "wedge", plane: "sqrt", R: o.radius, n: W * o.aa };
  } else {
    const S = o.full ? Math.round(o.size / 2) : o.size;
    W = H = o.full ? 2 * S : S;
    G = { kind: "rect", plane: "rho", x0: 0, x1: L, y0: 0, y1: L, nx: S * o.aa, ny: S * o.aa };
  }
  const nRows = G.kind === "wedge" ? G.n / 2 : G.ny;
  const rowLen = G.kind === "wedge" ? G.n / 2 : G.nx;
  const counts = new Int16Array(nRows * rowLen);   // wedge: the quadrant, v * m + u

  const cacheKey = JSON.stringify({ G, effort: o.effort });
  const finish = (st) => {
    if (G.kind === "wedge")                        // the quadrant from its half
      for (let v = 0; v < rowLen; v++) for (let u = v + 1; u < rowLen; u++) counts[u * rowLen + v] = counts[v * rowLen + u];
    // colours, averaged over the aa x aa block in linear light
    const hex = s => { const v = parseInt(s.replace("#", ""), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
    const lin = Float64Array.from({ length: 256 }, (_, c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    const enc = x => { x = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; return Math.round(255 * Math.min(1, Math.max(0, x))); };
    const lensC = hex(o.lens), bgC = o.bg && hex(o.bg), underC = o.under && hex(o.under);
    const undC = o.undecided ? hex(o.undecided) : lensC;
    const LUT = new Map();
    const colourOf = v => {
      let c = LUT.get(v);
      if (c) return c;
      if (v < 0) c = undC;
      else if (v === 0) c = lensC;
      else if (bgC && v <= 2) c = bgC;
      else {
        c = F.paletteColor(o.palette, v, o);
        if (underC) c = c.map((x, k) => Math.round(o.alpha * x + (1 - o.alpha) * underC[k]));
      }
      c = c.map(x => lin[x]);
      LUT.set(v, c);
      return c;
    };
    // count at sample (i, j) of the image's own sample grid, row j = 0 at the top
    const m = rowLen;
    const at = G.kind === "wedge"
      ? (i, j) => counts[(j < m ? m - 1 - j : j - m) * m + (i < m ? m - 1 - i : i - m)]
      : o.full
        ? (i, j) => counts[(j < G.ny ? j : 2 * G.ny - 1 - j) * G.nx + (i < G.nx ? G.nx - 1 - i : i - G.nx)]
        : (i, j) => counts[j * G.nx + i];
    const rgb = Buffer.alloc(3 * W * H), a2 = o.aa * o.aa;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      let R = 0, Gn = 0, B = 0;
      for (let j = 0; j < o.aa; j++) for (let i = 0; i < o.aa; i++) {
        const c = colourOf(at(px * o.aa + i, py * o.aa + j));
        R += c[0]; Gn += c[1]; B += c[2];
      }
      const k = 3 * (py * W + px);
      rgb[k] = enc(R / a2); rgb[k + 1] = enc(Gn / a2); rgb[k + 2] = enc(B / a2);
    }
    fs.writeFileSync(o.out, png(W, H, rgb));
    const hist = new Map();
    for (let r = 0; r < nRows; r++)
      for (let u = G.kind === "wedge" ? r : 0; u < rowLen; u++) { const v = counts[r * rowLen + u]; hist.set(v, (hist.get(v) || 0) + 1); }
    const ks = [...hist.keys()].filter(k => k > 0).sort((a, b) => a - b);
    console.log(`wrote ${o.out} (${W}x${H}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`face counts (count:samples): ${ks.slice(0, 30).map(k => `${k}:${hist.get(k)}`).join(" ")}` +
                (ks.length > 30 ? ` ... up to ${ks[ks.length - 1]} (${ks.length} counts)` : ""));
    if (st) {
      console.log(`own verdicts ${st.closures} (${st.rescued} handed over by the scan, ${st.disputes} disputed): ` +
                  `${st.nondiscrete} nondiscrete (${st.shimizu2} only by an A^(+-2) product), ${st.undecided} undecided`);
      if (EFFORTS[o.effort].band) {
        const band = EFFORTS[o.effort].band;
        console.log(`slice reaches ${st.deepest.toFixed(4)} inside the polygon, lens ${st.bulge.toFixed(4)} outside it (band ${band})`);
        if (st.deepest > 0.7 * band) console.log("WARNING: the slice comes close to the band's inner edge; widen it");
      }
    }
  };

  if (o.counts && fs.existsSync(o.counts)) {       // cached counts
    const buf = fs.readFileSync(o.counts), hl = buf.readUInt32LE(0);
    const head = buf.subarray(4, 4 + hl).toString();
    if (head === cacheKey) {
      const raw = zlib.gunzipSync(buf.subarray(4 + hl));
      counts.set(new Int16Array(raw.buffer, raw.byteOffset, counts.length));
      console.log(`counts from ${o.counts}`);
      finish(null);
      return;
    }
    console.log(`${o.counts} is for another grid; recomputing`);
  }
  const boundary = F.sliceBoundary(64);
  const NW = Math.max(1, os.cpus().length - 1);
  // interleave rows so every worker gets a share of the expensive ones
  const NJ = Math.min(nRows, NW * 16);
  const jobs = [];
  for (let j = 0; j < NJ; j++) { const rows = []; for (let r = j; r < nRows; r += NJ) rows.push(r); jobs.push(rows); }
  const st = { closures: 0, rescued: 0, disputes: 0, shimizu2: 0, nondiscrete: 0, undecided: 0, deepest: 0, bulge: 0 };
  let next = 0, active = 0, done = 0, lastLog = Date.now();
  const save = () => {
    if (!o.counts) return;
    const head = Buffer.from(cacheKey), hl = Buffer.alloc(4);
    hl.writeUInt32LE(head.length);
    const raw = Buffer.from(counts.buffer, counts.byteOffset, counts.byteLength);
    fs.writeFileSync(o.counts, Buffer.concat([hl, head, zlib.gzipSync(raw, { level: 1 })]));
  };
  const launch = () => {
    while (active < NW && next < jobs.length) {
      const rows = jobs[next++];
      active++;
      const w = new Worker(__filename, { workerData: { G, rows, boundary, effort: o.effort } });
      w.on("message", ({ rows, parts, st: s }) => {
        rows.forEach((r, k) => counts.set(parts[k], r * rowLen + (G.kind === "wedge" ? r : 0)));
        for (const key of ["closures", "rescued", "disputes", "shimizu2", "nondiscrete", "undecided"]) st[key] += s[key];
        st.deepest = Math.max(st.deepest, s.deepest); st.bulge = Math.max(st.bulge, s.bulge);
        done++;
        if (Date.now() - lastLog > 15000) {
          lastLog = Date.now();
          const el = (Date.now() - t0) / 1000;     // NW jobs run at once: no rate until NW are done
          console.log(`  ${done}/${jobs.length} jobs, ${el.toFixed(0)}s` +
                      (done >= NW ? `, ~${(el * (jobs.length - done) / done).toFixed(0)}s left` : ""));
        }
      });
      w.on("exit", () => { active--; if (next < jobs.length) launch(); else if (!active) { save(); finish(st); } });
      w.on("error", (e) => { console.error(e); process.exit(1); });
    }
  };
  launch();
}
