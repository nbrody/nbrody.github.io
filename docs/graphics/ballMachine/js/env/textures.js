// Glasshouse environment — every texture is painted procedurally on canvases.
import * as THREE from 'three';
import {
  Rng, fbm2D, makeCanvas, noiseCanvas, drawWrapped, canvasTexture, coverageAlphaTexture,
  clamp, lerp, TAU, DEG,
} from './util.js';

// ------------------------------------------------------------ colour utils ---
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr(r, g, b, a = 1) {
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
function jitterHex(hex, amt, rng, hueAmt = 0) {
  const [r, g, b] = hexToRgb(hex);
  const k = 1 + rng.range(-amt, amt);
  const h = rng.range(-hueAmt, hueAmt);
  return rgbStr(clamp(r * k * (1 + h), 0, 255), clamp(g * k, 0, 255), clamp(b * k * (1 - h), 0, 255));
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
}
function mixStr(a, b, t, alpha = 1) { const m = mixHex(a, b, t); return rgbStr(m[0], m[1], m[2], alpha); }

/** Multiply-overlay a tileable noise onto a canvas for subtle variation. */
function overlayNoise(ctx, size, { seed = 1, cells = 4, octaves = 5, strength = 0.12, mode = 'multiply', res = 256, tint = [255, 255, 255] } = {}) {
  const n = fbm2D(res, { cells, octaves, seed });
  const nc = noiseCanvas(res, n, (v) => {
    const k = mode === 'multiply' ? 1 - strength * (1 - v) * 2 : v;
    return [tint[0] * k, tint[1] * k, tint[2] * k];
  });
  ctx.save();
  ctx.globalCompositeOperation = mode;
  if (mode !== 'multiply') ctx.globalAlpha = strength;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(nc, 0, 0, size, size);
  ctx.restore();
}

function polyPath(pts) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}
function shrink(pts, amt) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
    return [x - (dx / d) * amt, y - (dy / d) * amt];
  });
}

// ================================================================= floors ===
/** Victorian encaustic geometric band: 1024px = 1.5 m along (u) and 1.5 m across (v). */
function tileTextures(aniso) {
  const S = 1024;
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  const rc = makeCanvas(S, S), rctx = rc.getContext('2d');
  const rng = new Rng(11);
  ctx.fillStyle = '#b3a896'; ctx.fillRect(0, 0, S, S);           // grout
  rctx.fillStyle = 'rgb(222,222,222)'; rctx.fillRect(0, 0, S, S);

  const PAL = {
    terra: ['#9d4a31', '#a4523a', '#96442c', '#a9573b'],
    cream: ['#e4d6b9', '#e8dcc2', '#dfd0b0'],
    black: ['#25211f', '#2a2422', '#1f1b1a'],
    ochre: ['#c08d3e', '#c79848', '#b98838'],
    teal: ['#3c6a64', '#39635e', '#447069'],
    buff: ['#cfb088', '#d5b890'],
  };
  const G = 1.7;
  function tile(pts, key, rough = 0.34, inset = G) {
    const p = polyPath(shrink(pts, inset));
    ctx.fillStyle = jitterHex(rng.pick(PAL[key]), 0.045, rng, 0.02);
    ctx.fill(p);
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1.2; ctx.stroke(p);
    const rv = clamp(rough + rng.range(-0.05, 0.05), 0, 1) * 255;
    rctx.fillStyle = rgbStr(rv, rv, rv); rctx.fill(p);
  }
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  // ---- field: octagon & dot, 6 rows x 8 cols of 128px between y=128..896
  const F0 = 128, CELL = 128, CUT = CELL * 0.2929;
  for (let j = 0; j < 6; j++) {
    const centre = j === 2 || j === 3;
    for (let i = 0; i < 8; i++) {
      const x0 = i * CELL, y0 = F0 + j * CELL;
      const oct = [[x0 + CUT, y0], [x0 + CELL - CUT, y0], [x0 + CELL, y0 + CUT], [x0 + CELL, y0 + CELL - CUT],
        [x0 + CELL - CUT, y0 + CELL], [x0 + CUT, y0 + CELL], [x0, y0 + CELL - CUT], [x0, y0 + CUT]];
      tile(oct, centre ? 'cream' : 'terra');
      if (centre) {
        // encaustic inlay: ochre quatrefoil with terracotta eye
        const cx = x0 + CELL / 2, cy = y0 + CELL / 2;
        ctx.save();
        ctx.fillStyle = jitterHex(PAL.ochre[0], 0.04, rng);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17, 15, 9, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = jitterHex(PAL.terra[0], 0.04, rng);
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = jitterHex(PAL.teal[0], 0.04, rng);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 5, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    }
  }
  // dots (diamonds) at cell corners
  for (let j = 0; j <= 6; j++) {
    for (let i = 0; i <= 8; i++) {
      const x = i * CELL, y = F0 + j * CELL;
      const key = (j === 3) ? 'teal' : 'black';
      drawWrapped(S, S, x, y, CUT + 2, (xx, yy) => {
        tile([[xx, yy - CUT], [xx + CUT, yy], [xx, yy + CUT], [xx - CUT, yy]], key, 0.3);
      });
    }
  }
  // ---- borders (mirrored top/bottom)
  for (const mirror of [false, true]) {
    const Y = (y, h) => (mirror ? S - y - h : y);
    for (let i = 0; i < 8; i++) tile(rect(i * 128, Y(0, 40), 128, 40), 'black', 0.32);
    for (let i = 0; i < 16; i++) tile(rect(i * 64, Y(40, 12), 64, 12), 'cream', 0.36);
    for (let i = 0; i < 16; i++) {
      const x = i * 64, y = Y(52, 64);
      const flip = (i % 2 === 0) !== mirror;
      const t1 = flip ? [[x, y], [x + 64, y], [x, y + 64]] : [[x, y], [x + 64, y], [x + 64, y + 64]];
      const t2 = flip ? [[x + 64, y], [x + 64, y + 64], [x, y + 64]] : [[x, y], [x + 64, y + 64], [x, y + 64]];
      tile(t1, mirror ? 'terra' : 'black', 0.33, 1.4);
      tile(t2, mirror ? 'black' : 'terra', 0.33, 1.4);
    }
    for (let i = 0; i < 16; i++) tile(rect(i * 64, Y(116, 12), 64, 12), 'ochre', 0.36);
  }
  // wear: subtle mottling + scuffs along the centre line
  overlayNoise(ctx, S, { seed: 5, cells: 4, octaves: 6, strength: 0.09 });
  ctx.save();
  for (let k = 0; k < 90; k++) {
    const y = S / 2 + rng.range(-300, 300) * rng.next();
    const x = rng.range(0, S);
    ctx.strokeStyle = `rgba(255,248,235,${rng.range(0.03, 0.07)})`;
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rng.range(-40, 40), y + rng.range(-8, 8), x + rng.range(-90, 90), y + rng.range(-12, 12));
    ctx.stroke();
  }
  ctx.restore();
  overlayNoise(rctx, S, { seed: 9, cells: 8, octaves: 4, strength: 0.12, mode: 'multiply' });
  return {
    map: canvasTexture(c, { anisotropy: aniso }),
    roughnessMap: canvasTexture(rc, { srgb: false, anisotropy: aniso }),
  };
}

/** Pale limestone ashlar: 1024px = 2 m x 2 m, courses 0.5 m, blocks 1 m. */
function stoneTexture(aniso) {
  const S = 1024;
  const n = fbm2D(512, { cells: 4, octaves: 6, seed: 31 });
  const n2 = fbm2D(512, { cells: 2, octaves: 3, seed: 32 });
  const base = noiseCanvas(512, n, (v, x, y) => {
    const w = n2[y * 512 + x];
    const t = 0.35 + v * 0.65;
    return [lerp(184, 212, t) + w * 6, lerp(176, 204, t) + w * 3, lerp(158, 184, t) - w * 4];
  });
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, S, S);
  const rng = new Rng(33);
  // speckles & fossil flecks
  for (let i = 0; i < 5000; i++) {
    const x = rng.range(0, S), y = rng.range(0, S);
    const d = rng.chance(0.5);
    ctx.fillStyle = d ? `rgba(120,108,90,${rng.range(0.08, 0.25)})` : `rgba(255,250,238,${rng.range(0.1, 0.3)})`;
    ctx.fillRect(x, y, rng.range(0.8, 2.2), rng.range(0.8, 2.2));
  }
  // faint bedding streaks
  for (let i = 0; i < 40; i++) {
    const y = rng.range(0, S);
    ctx.fillStyle = `rgba(150,138,118,${rng.range(0.03, 0.06)})`;
    drawWrapped(S, S, rng.range(0, S), y, 300, (xx, yy) => {
      ctx.beginPath(); ctx.ellipse(xx, yy, rng.range(80, 260), rng.range(1.5, 4), 0, 0, TAU); ctx.fill();
    });
  }
  // joints
  const joint = (x0, y0, x1, y1) => {
    ctx.strokeStyle = 'rgba(128,116,98,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,252,242,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + (y1 === y0 ? 0 : 2.5), y0 + (y1 === y0 ? 2.5 : 0)); ctx.lineTo(x1 + (y1 === y0 ? 0 : 2.5), y1 + (y1 === y0 ? 2.5 : 0)); ctx.stroke();
  };
  for (let r = 0; r < 4; r++) {
    const y = r * 256;
    joint(0, y + 1, S, y + 1);
    const off = (r % 2) * 256;
    for (let k = 0; k < 2; k++) { const x = (off + k * 512) % S; joint(x + 1, y, x + 1, y + 256); }
  }
  return canvasTexture(c, { anisotropy: aniso });
}

/** Plinth top, polar mapped: x = 1/8 of the circle, y = radius (v=1 at canvas top = rim). */
function plinthTopTexture(aniso) {
  const S = 1024, RMAX = 5.8;
  const n = fbm2D(512, { cells: 4, octaves: 6, seed: 41 });
  const base = noiseCanvas(512, n, (v) => {
    const t = 0.4 + v * 0.6;
    return [lerp(186, 212, t), lerp(178, 204, t), lerp(160, 186, t)];
  });
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0, S, S);
  const rng = new Rng(43);
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = rng.chance(0.5) ? `rgba(125,112,95,${rng.range(0.06, 0.2)})` : `rgba(255,250,240,${rng.range(0.1, 0.25)})`;
    ctx.fillRect(rng.range(0, S), rng.range(0, S), rng.range(0.8, 2), rng.range(0.8, 2));
  }
  const yOf = (r) => (1 - r / RMAX) * S;
  const rings = [1.2, 2.4, 3.5, 4.55, 5.35];
  const counts = [1, 2, 3, 4, 5, 7];
  ctx.lineCap = 'butt';
  const line = (x0, y0, x1, y1) => {
    ctx.strokeStyle = 'rgba(130,118,100,0.55)'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  for (const r of rings) line(0, yOf(r), S, yOf(r));
  const bands = [0, ...rings, RMAX];
  for (let b = 1; b < bands.length - 1 + 1; b++) {
    const r0 = bands[b], r1 = bands[b + 1] ?? RMAX;
    if (r1 === undefined || r0 >= RMAX) continue;
    const cnt = counts[b] || 6;
    const off = (b % 2) * 0.5;
    for (let k = 0; k < cnt; k++) {
      const x = ((k + off) / cnt) * S;
      line(x, yOf(r0), x, yOf(r1));
    }
  }
  // outer kerb band slightly warmer / darker
  ctx.fillStyle = 'rgba(150,130,100,0.10)';
  ctx.fillRect(0, 0, S, yOf(5.35));
  return canvasTexture(c, { anisotropy: aniso });
}

/** Garden-bed mulch: 512px = 1.2 m. */
function soilTexture(aniso) {
  const S = 512;
  const n = fbm2D(256, { cells: 4, octaves: 5, seed: 51 });
  const base = noiseCanvas(256, n, (v) => [lerp(44, 78, v), lerp(32, 55, v), lerp(22, 36, v)]);
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0, S, S);
  const rng = new Rng(52);
  const chips = ['#5d4029', '#6e4d31', '#3a281a', '#7a5a3a', '#4a3320', '#86684a'];
  for (let i = 0; i < 1300; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), l = rng.range(4, 13), w = rng.range(1.5, 4.5), a = rng.range(0, TAU);
    const col = rng.pick(chips);
    drawWrapped(S, S, x, y, l, (xx, yy) => {
      ctx.save(); ctx.translate(xx, yy); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-l / 2 + 1, -w / 2 + 1, l, w);
      ctx.fillStyle = col; ctx.fillRect(-l / 2, -w / 2, l, w);
      ctx.restore();
    });
  }
  // fallen leaves
  for (let i = 0; i < 45; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), l = rng.range(8, 16), a = rng.range(0, TAU);
    const col = rng.pick(['#8b6a3a', '#a07b40', '#6f5530', '#7c7a3a']);
    drawWrapped(S, S, x, y, l, (xx, yy) => {
      ctx.save(); ctx.translate(xx, yy); ctx.rotate(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, l, l * 0.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }
  // moss patches
  const m = fbm2D(128, { cells: 3, octaves: 4, seed: 53 });
  const moss = noiseCanvas(128, m, () => [74, 92, 40]);
  const mctx = moss.getContext('2d');
  const md = mctx.getImageData(0, 0, 128, 128);
  for (let i = 0; i < m.length; i++) md.data[i * 4 + 3] = clamp((m[i] - 0.62) * 900, 0, 150);
  mctx.putImageData(md, 0, 0);
  ctx.drawImage(moss, 0, 0, S, S);
  return canvasTexture(c, { anisotropy: aniso });
}

/** Cast-iron heating grate: 512px = 0.6 m along x 0.6 m across. */
function grateTexture(aniso) {
  const S = 512;
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#070706'; ctx.fillRect(0, 0, S, S);
  // hint of pipes below
  for (let k = 0; k < 2; k++) {
    const y = S * (0.35 + k * 0.3);
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(0.5, 'rgba(70,58,45,0.9)'); g.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 30, S, 60);
  }
  const iron = '#3b3a36';
  ctx.fillStyle = iron;
  ctx.fillRect(0, 0, S, 26); ctx.fillRect(0, S - 26, S, 26);
  for (let i = 0; i < 8; i++) ctx.fillRect(i * 64 - 5, 0, 10, S);
  ctx.strokeStyle = iron; ctx.lineWidth = 7;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 7; j++) {
      const cx = i * 64 + 32, cy = 26 + j * 66 + 33;
      ctx.beginPath(); ctx.arc(cx, cy, 18, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 32, cy); ctx.lineTo(cx - 18, cy); ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + 32, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - 33); ctx.lineTo(cx, cy - 18); ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy + 33); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
    }
  }
  overlayNoise(ctx, S, { seed: 61, cells: 8, octaves: 4, strength: 0.25 });
  return canvasTexture(c, { anisotropy: aniso });
}

/** Pale gravel: 512px = 2 m. */
function gravelTexture(aniso) {
  const S = 512;
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.fillStyle = '#a99d86'; ctx.fillRect(0, 0, S, S);
  const rng = new Rng(71);
  const cols = ['#cdc2aa', '#bfb399', '#d9cfb8', '#a39780', '#b8ad96', '#e2d9c4', '#9c917c'];
  for (let i = 0; i < 5200; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(1.2, 3.6), a = rng.range(0, TAU);
    const col = rng.pick(cols);
    drawWrapped(S, S, x, y, r * 1.5, (xx, yy) => {
      ctx.fillStyle = 'rgba(40,34,26,0.25)';
      ctx.beginPath(); ctx.ellipse(xx + 0.8, yy + 0.9, r, r * 0.75, a, 0, TAU); ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(xx, yy, r, r * 0.75, a, 0, TAU); ctx.fill();
    });
  }
  overlayNoise(ctx, S, { seed: 72, cells: 3, octaves: 4, strength: 0.08 });
  return canvasTexture(c, { anisotropy: aniso });
}

/** Mown lawn with stripes: 512px = 4 m (two 2 m stripes along x). */
function lawnTexture(aniso) {
  const S = 512;
  const n = fbm2D(256, { cells: 4, octaves: 5, seed: 81 });
  const base = noiseCanvas(256, n, (v, x) => {
    const stripe = Math.sin(((x + 0.5) / 256) * TAU) > 0 ? 1.07 : 0.93;
    return [lerp(44, 66, v) * stripe, lerp(64, 88, v) * stripe, lerp(30, 42, v) * stripe];
  });
  const c = makeCanvas(S, S), ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0, S, S);
  const rng = new Rng(82);
  for (let i = 0; i < 9000; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), l = rng.range(2, 6);
    ctx.strokeStyle = rng.chance(0.5) ? `rgba(120,150,70,${rng.range(0.15, 0.4)})` : `rgba(30,55,20,${rng.range(0.15, 0.4)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-1.5, 1.5), y - l); ctx.stroke();
  }
  return canvasTexture(c, { anisotropy: aniso });
}

// ================================================================== bark ===
/** 4-column bark atlas (each column 256px wide, 1024px = 3 m tall, wraps vertically). */
export const BARK_COLS = { palm: 0, fern: 1, banana: 2, stem: 3 };
export const BARK_PAD = 8 / 1024;
function barkAtlas(aniso) {
  const W = 256, H = 1024, IW = 240, PAD = 8;
  const atlas = makeCanvas(1024, H), actx = atlas.getContext('2d');
  const painters = [paintPalmBark, paintFernBark, paintBananaBark, paintStemBark];
  painters.forEach((paint, i) => {
    const col = makeCanvas(IW, H);
    paint(col.getContext('2d'), IW, H, new Rng(90 + i));
    const x0 = i * W;
    actx.drawImage(col, x0 + PAD, 0);
    // wrapped padding
    actx.drawImage(col, IW - PAD, 0, PAD, H, x0, 0, PAD, H);
    actx.drawImage(col, 0, 0, PAD, H, x0 + PAD + IW, 0, PAD, H);
  });
  const t = canvasTexture(atlas, { anisotropy: aniso });
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
function paintPalmBark(ctx, W, H, rng) {
  const n = fbm2D(256, { cells: 4, octaves: 5, seed: 101 });
  const base = noiseCanvas(256, n, (v) => [lerp(104, 150, v), lerp(94, 136, v), lerp(78, 112, v)]);
  ctx.drawImage(base, 0, 0, W, H);
  // leaf-scar rings (every ~0.12 m => 41 px)
  let y = 0;
  while (y < H) {
    const h = rng.range(34, 48);
    const ph = rng.range(0, TAU), amp = rng.range(1, 4);
    ctx.fillStyle = `rgba(62,54,44,${rng.range(0.5, 0.8)})`;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, y + Math.sin((x / W) * TAU * 2 + ph) * amp);
    for (let x = W; x >= 0; x -= 8) ctx.lineTo(x, y + 4 + Math.sin((x / W) * TAU * 2 + ph) * amp);
    ctx.fill();
    ctx.fillStyle = `rgba(190,178,156,${rng.range(0.25, 0.45)})`;
    ctx.fillRect(0, y - 5, W, 4);
    y += h;
  }
  for (let i = 0; i < 1400; i++) {
    const x = rng.range(0, W), yy = rng.range(0, H);
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(70,60,48,0.25)' : 'rgba(180,168,146,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + rng.range(-1, 1), yy + rng.range(4, 14)); ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(150,160,120,${rng.range(0.1, 0.25)})`;
    drawWrapped(W, H, rng.range(0, W), rng.range(0, H), 20, (xx, yy) => {
      ctx.beginPath(); ctx.ellipse(xx, yy, rng.range(4, 14), rng.range(3, 9), 0, 0, TAU); ctx.fill();
    });
  }
}
function paintFernBark(ctx, W, H, rng) {
  ctx.fillStyle = '#35271c'; ctx.fillRect(0, 0, W, H);
  const cols = ['#5a4230', '#2a1d14', '#6b5038', '#47332a', '#7a5a3e'];
  for (let i = 0; i < 5200; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), l = rng.range(5, 18), a = Math.PI / 2 + rng.range(-0.6, 0.6);
    ctx.strokeStyle = rng.pick(cols); ctx.lineWidth = rng.range(0.8, 2.2);
    drawWrapped(W, H, x, y, l, (xx, yy) => {
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke();
    });
  }
  for (let i = 0; i < 30; i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    drawWrapped(W, H, x, y, 16, (xx, yy) => {
      ctx.fillStyle = 'rgba(20,12,8,0.7)'; ctx.beginPath(); ctx.ellipse(xx, yy, 10, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(120,90,60,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    });
  }
}
function paintBananaBark(ctx, W, H, rng) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#7d9444'); g.addColorStop(0.5, '#8aa04c'); g.addColorStop(1, '#7d9444');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, W);
    ctx.strokeStyle = rng.chance(0.6) ? `rgba(70,95,40,${rng.range(0.2, 0.5)})` : `rgba(160,175,100,${rng.range(0.2, 0.4)})`;
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rng.range(-3, 3), H); ctx.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    ctx.fillStyle = rng.chance(0.6) ? `rgba(92,58,48,${rng.range(0.25, 0.55)})` : `rgba(150,125,80,${rng.range(0.3, 0.6)})`;
    drawWrapped(W, H, x, y, 60, (xx, yy) => {
      ctx.beginPath(); ctx.ellipse(xx, yy, rng.range(4, 16), rng.range(15, 60), 0, 0, TAU); ctx.fill();
    });
  }
}
function paintStemBark(ctx, W, H, rng) {
  ctx.fillStyle = '#5b7d34'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 180; i++) {
    const x = rng.range(0, W);
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(70,100,40,0.5)' : 'rgba(120,150,80,0.35)';
    ctx.lineWidth = rng.range(1, 2.5);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
}

// ================================================================ leaves ===
function leafCanvases(w, h, bg) {
  const c = makeCanvas(w, h), a = makeCanvas(w, h);
  const cx = c.getContext('2d'), ax = a.getContext('2d');
  cx.fillStyle = bg; cx.fillRect(0, 0, w, h);
  ax.fillStyle = '#000'; ax.fillRect(0, 0, w, h);
  return { c, a, cx, ax };
}
function finishLeaf(L, aniso) {
  return {
    map: canvasTexture(L.c, { repeat: false, anisotropy: aniso }),
    alphaMap: coverageAlphaTexture(L.a, { anisotropy: aniso }),
  };
}
/** Fill a Path2D in both canvases. */
function both(L, path, fill) {
  L.cx.fillStyle = fill; L.cx.fill(path);
  L.ax.fillStyle = '#fff'; L.ax.fill(path);
}
function cut(L, path) { L.ax.fillStyle = '#000'; L.ax.fill(path); }

/** Thin lanceolate leaf path between p0 and p1 with a sag. */
function lancePath(x0, y0, x1, y1, wid, sag = 0.1, sagDir = 1) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  const mx = (x0 + x1) / 2 + nx * len * sag * sagDir, my = (y0 + y1) / 2 + ny * len * sag * sagDir;
  const p = new Path2D();
  p.moveTo(x0 + nx * wid * 0.3, y0 + ny * wid * 0.3);
  p.quadraticCurveTo(mx + nx * wid, my + ny * wid, x1, y1);
  p.quadraticCurveTo(mx - nx * wid, my - ny * wid, x0 - nx * wid * 0.3, y0 - ny * wid * 0.3);
  p.closePath();
  return { p, mx, my };
}

/** Pinnate palm frond: rachis vertical (base at bottom), leaflets angled to the tip. */
function pinnateFrond(aniso) {
  const W = 256, H = 1024, cx = W / 2;
  const L = leafCanvases(W, H, '#4a7130');
  const rng = new Rng(201);
  const greens = ['#3e6a2a', '#4b7a30', '#58863a', '#467229', '#5f8b3c', '#3a6326'];
  const n = 50;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = 0.035 + 0.95 * (i + rng.range(-0.35, 0.35)) / n;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.93)), 0.5);
      const ang = (30 + 28 * t + rng.range(-6, 6)) * DEG;
      const reach = (cx - 5) * env * rng.range(0.88, 1.0);
      const len = reach / Math.sin(ang);
      const y0 = H * (1 - t), x0 = cx + side * 2;
      const x1 = cx + side * reach, y1 = y0 - Math.cos(ang) * len;
      const wid = Math.max(2.6, 7.5 * (0.45 + 0.55 * env));
      const { p, mx, my } = lancePath(x0, y0, x1, y1, wid, 0.06, side);
      const g = rng.pick(greens);
      const tip = t > 0.8 ? (t - 0.8) * 2 : 0;
      both(L, p, tip > 0 ? mixStr(g, '#7d9a45', tip * 0.6) : g);
      L.cx.strokeStyle = 'rgba(200,215,140,0.35)'; L.cx.lineWidth = 0.9;
      L.cx.beginPath(); L.cx.moveTo(x0, y0); L.cx.quadraticCurveTo(mx, my, x1, y1); L.cx.stroke();
    }
  }
  // rachis
  for (let y = 0; y < H; y += 2) {
    const t = 1 - y / H;
    const w = lerp(7, 2, t);
    L.cx.fillStyle = mixStr('#8c9a56', '#6f8a3f', t);
    L.cx.fillRect(cx - w / 2, y, w, 2.2);
    L.ax.fillStyle = '#fff'; L.ax.fillRect(cx - w / 2, y, w, 2.2);
  }
  return finishLeaf(L, aniso);
}

/** Fan palm leaf: segments radiating from the hastula at bottom centre. */
function fanLeaf(aniso) {
  const S = 512, ox = S / 2, oy = S * 0.62;     // hastula at uv (0.5, 0.38)
  const L = leafCanvases(S, S, '#476f33');
  const rng = new Rng(211);
  const nseg = 40, span = 270 * DEG;
  for (let i = 0; i < nseg; i++) {
    const a0 = -span / 2 + (i / nseg) * span, a1 = -span / 2 + ((i + 1) / nseg) * span;
    const am = (a0 + a1) / 2;
    const R = rng.range(0.86, 1.0) * S * 0.46;
    const split = R * rng.range(0.62, 0.75);
    const dir = (a, r) => [ox + Math.sin(a) * r, oy - Math.cos(a) * r];
    const g = i % 2 ? '#4a7736' : '#3c682e';
    const p = new Path2D();
    const s0 = dir(a0 + 0.004, 18), s1 = dir(a1 - 0.004, 18);
    p.moveTo(...s0);
    p.lineTo(...dir(a0 + 0.012, split));
    p.lineTo(...dir(am - 0.012, R));
    p.lineTo(...dir(am, split * 1.04));
    p.lineTo(...dir(am + 0.012, R * rng.range(0.95, 1.03)));
    p.lineTo(...dir(a1 - 0.012, split));
    p.lineTo(...s1);
    p.closePath();
    both(L, p, jitterHex(g, 0.06, rng));
    L.cx.strokeStyle = 'rgba(180,200,130,0.35)'; L.cx.lineWidth = 1.2;
    L.cx.beginPath(); L.cx.moveTo(...dir(am, 20)); L.cx.lineTo(...dir(am, split)); L.cx.stroke();
  }
  // hastula
  L.cx.fillStyle = '#6a7a3a';
  L.cx.beginPath(); L.cx.ellipse(ox, oy - 10, 22, 12, 0, 0, TAU); L.cx.fill();
  L.ax.fillStyle = '#fff'; L.ax.beginPath(); L.ax.ellipse(ox, oy - 10, 22, 12, 0, 0, TAU); L.ax.fill();
  return finishLeaf(L, aniso);
}

/** Banana leaf: long paddle with pale midrib, parallel veins, tears. */
function bananaLeaf(aniso) {
  const W = 256, H = 1024, cx = W / 2;
  const L = leafCanvases(W, H, '#5d8d35');
  const rng = new Rng(221);
  const half = (t) => {
    if (t < 0.045) return 7;
    const u = (t - 0.045) / 0.955;
    return Math.max(7, 120 * Math.pow(Math.sin(Math.PI * clamp(u * 0.94 + 0.04, 0, 1)), 0.33) * (u > 0.9 ? Math.sqrt((1 - u) / 0.1) : 1));
  };
  const outline = new Path2D();
  outline.moveTo(cx, H);
  for (let y = H; y >= 0; y -= 4) outline.lineTo(cx + half(1 - y / H), y);
  for (let y = 0; y <= H; y += 4) outline.lineTo(cx - half(1 - y / H), y);
  outline.closePath();
  const grad = L.cx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#4f7f2c'); grad.addColorStop(0.45, '#679a3c'); grad.addColorStop(0.55, '#679a3c'); grad.addColorStop(1, '#4f7f2c');
  both(L, outline, grad);
  // veins
  L.cx.save(); L.cx.clip(outline);
  for (let y = H; y > -200; y -= 5) {
    const side = 1;
    for (const s of [-1, 1]) {
      L.cx.strokeStyle = (y / 5) % 2 ? 'rgba(40,70,20,0.22)' : 'rgba(170,200,110,0.18)';
      L.cx.lineWidth = 1.3;
      L.cx.beginPath(); L.cx.moveTo(cx, y); L.cx.lineTo(cx + s * 130, y - 38 * side); L.cx.stroke();
    }
  }
  // dry edges
  L.cx.strokeStyle = 'rgba(140,110,60,0.55)'; L.cx.lineWidth = 5; L.cx.stroke(outline);
  L.cx.restore();
  // midrib
  for (let y = 0; y < H; y += 2) {
    const t = 1 - y / H;
    const w = lerp(11, 2.5, t);
    L.cx.fillStyle = mixStr('#d6dea2', '#b9c98a', t);
    L.cx.fillRect(cx - w / 2, y, w, 2.2);
    L.ax.fillStyle = '#fff'; L.ax.fillRect(cx - w / 2, y, w, 2.2);
  }
  // tears
  for (let i = 0; i < 9; i++) {
    const t = rng.range(0.14, 0.9), s = rng.sign();
    const y0 = H * (1 - t), hw = half(t);
    const depth = hw * rng.range(0.35, 0.92);
    const ex = cx + s * hw, ey = y0;
    const ix = cx + s * (hw - depth), iy = y0 + depth * 0.29;
    const wv = rng.range(1.5, 4);
    const p = new Path2D();
    p.moveTo(ex + s * 3, ey - wv - 2); p.lineTo(ix, iy); p.lineTo(ex + s * 3, ey + wv + 2); p.closePath();
    cut(L, p);
    L.cx.strokeStyle = 'rgba(150,120,70,0.5)'; L.cx.lineWidth = 2;
    L.cx.beginPath(); L.cx.moveTo(ex, ey); L.cx.lineTo(ix, iy); L.cx.stroke();
  }
  return finishLeaf(L, aniso);
}

/** Bipinnate fern frond (tree ferns + ground ferns). */
function fernFrond(aniso) {
  const W = 256, H = 1024, cx = W / 2;
  const L = leafCanvases(W, H, '#4a7a2e');
  const rng = new Rng(231);
  const n = 30;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = 0.03 + 0.95 * (i + rng.range(-0.25, 0.25)) / n;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)), 0.6);
      const ang = (62 + 14 * t) * DEG;
      const reach = (cx - 4) * env;
      const len = reach / Math.sin(ang);
      const y0 = H * (1 - t), x0 = cx + side * 1.5;
      const dx = side * Math.sin(ang), dy = -Math.cos(ang);
      const col = mixStr('#3f6f27', '#76a444', t * 0.7 + rng.range(-0.08, 0.08));
      // pinna axis
      L.cx.strokeStyle = '#5b7a33'; L.cx.lineWidth = 1.4;
      L.cx.beginPath(); L.cx.moveTo(x0, y0); L.cx.lineTo(x0 + dx * len, y0 + dy * len); L.cx.stroke();
      L.ax.strokeStyle = '#fff'; L.ax.lineWidth = 1.4;
      L.ax.beginPath(); L.ax.moveTo(x0, y0); L.ax.lineTo(x0 + dx * len, y0 + dy * len); L.ax.stroke();
      // pinnules
      const m = Math.max(3, Math.round(len / 7));
      for (let k = 0; k < m; k++) {
        const u = (k + 0.5) / m;
        const px = x0 + dx * len * u, py = y0 + dy * len * u;
        const sz = Math.max(2.2, 7.5 * (1 - u * 0.75) * (0.55 + 0.45 * env));
        for (const s2 of [-1, 1]) {
          // pinnule points forward along the pinna, offset to each side
          const nx = -dy * s2, ny = dx * s2;
          const qx = px + nx * sz * 0.8 + dx * sz * 0.35, qy = py + ny * sz * 0.8 + dy * sz * 0.35;
          const p = new Path2D();
          p.ellipse(qx, qy, sz, sz * 0.52, Math.atan2(ny + dy * 0.6, nx + dx * 0.6), 0, TAU);
          both(L, p, col);
        }
      }
    }
  }
  for (let y = 0; y < H; y += 2) {
    const t = 1 - y / H, w = lerp(5, 1.5, t);
    L.cx.fillStyle = '#6a6a38'; L.cx.fillRect(cx - w / 2, y, w, 2.2);
    L.ax.fillStyle = '#fff'; L.ax.fillRect(cx - w / 2, y, w, 2.2);
  }
  return finishLeaf(L, aniso);
}

/** Monstera deliciosa: heart-shaped leaf with splits & fenestrations; tip at top. */
function monsteraLeaf(aniso) {
  const S = 512, cx = S / 2, cy = 250, rx = 222, ry = 206;
  const L = leafCanvases(S, S, '#2e5b25');
  const rng = new Rng(241);
  const outline = new Path2D();
  outline.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  const grad = L.cx.createRadialGradient(cx, cy + 60, 20, cx, cy, 240);
  grad.addColorStop(0, '#3f7131'); grad.addColorStop(1, '#264f1f');
  both(L, outline, grad);
  // lateral veins
  const veins = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const t = 0.1 + i * 0.12 + rng.range(-0.02, 0.02);     // along midrib from base (bottom) to tip (top)
      const my = cy + ry * 0.92 - t * (ry * 1.85);
      const a = (50 + 18 * t) * DEG;                           // angle from the midrib (upward)
      veins.push({ s, t, my, a });
      L.cx.strokeStyle = 'rgba(120,160,90,0.45)'; L.cx.lineWidth = 3;
      L.cx.beginPath(); L.cx.moveTo(cx, my); L.cx.lineTo(cx + s * Math.sin(a) * 260, my - Math.cos(a) * 260); L.cx.stroke();
    }
  }
  // splits from the margin inward
  for (const v of veins) {
    if (v.t < 0.12 || v.t > 0.86) continue;
    const dx = v.s * Math.sin(v.a + 0.1), dy = -Math.cos(v.a + 0.1);
    // start near midrib-ish (inner end) and run out past margin
    const inner = rng.range(0.28, 0.45) * rx;
    const ox = cx + dx * inner + v.s * 18, oy = v.my + dy * inner - 22;
    const p = new Path2D();
    const w0 = 2, w1 = rng.range(9, 16);
    const nx = -dy, ny = dx;
    p.moveTo(ox + nx * w0, oy + ny * w0);
    p.lineTo(ox + dx * 300 + nx * w1, oy + dy * 300 + ny * w1);
    p.lineTo(ox + dx * 300 - nx * w1, oy + dy * 300 - ny * w1);
    p.lineTo(ox - nx * w0, oy - ny * w0);
    p.closePath();
    cut(L, p);
  }
  // fenestrations near midrib
  for (const v of veins) {
    if (v.t < 0.18 || v.t > 0.8 || rng.chance(0.25)) continue;
    const d = rng.range(0.22, 0.34) * rx;
    const hx = cx + v.s * Math.sin(v.a) * d, hy = v.my - Math.cos(v.a) * d - 26;
    const p = new Path2D();
    p.ellipse(hx, hy, rng.range(5, 8), rng.range(13, 20), v.s * (v.a - 0.2), 0, TAU);
    cut(L, p);
  }
  // sinus notch at the base
  const notch = new Path2D();
  notch.moveTo(cx, cy + ry * 0.8); notch.lineTo(cx - 34, cy + ry + 4); notch.lineTo(cx + 34, cy + ry + 4); notch.closePath();
  cut(L, notch);
  // midrib
  L.cx.strokeStyle = '#7d9d57'; L.cx.lineWidth = 6;
  L.cx.beginPath(); L.cx.moveTo(cx, cy + ry * 0.8); L.cx.lineTo(cx, cy - ry + 8); L.cx.stroke();
  return finishLeaf(L, aniso);
}

/** Strelitzia leaf blade (paddle). */
function strelitziaLeaf(aniso) {
  const W = 256, H = 512, cx = W / 2;
  const L = leafCanvases(W, H, '#4c7457');
  const rng = new Rng(251);
  const p = new Path2D();
  p.ellipse(cx, H / 2, 108, 250, 0, 0, TAU);
  const g = L.cx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#3e6649'); g.addColorStop(0.5, '#58806a'); g.addColorStop(1, '#3e6649');
  both(L, p, g);
  L.cx.save(); L.cx.clip(p);
  for (let y = H; y > -100; y -= 6) {
    for (const s of [-1, 1]) {
      L.cx.strokeStyle = 'rgba(30,60,40,0.18)'; L.cx.lineWidth = 1.2;
      L.cx.beginPath(); L.cx.moveTo(cx, y); L.cx.lineTo(cx + s * 120, y - 50); L.cx.stroke();
    }
  }
  L.cx.restore();
  L.cx.strokeStyle = '#c8c28a'; L.cx.lineWidth = 6;
  L.cx.beginPath(); L.cx.moveTo(cx, H); L.cx.lineTo(cx, 8); L.cx.stroke();
  for (let i = 0; i < 4; i++) {
    const y = rng.range(120, 420), s = rng.sign();
    const q = new Path2D();
    q.moveTo(cx + s * 120, y - 3); q.lineTo(cx + s * rng.range(30, 70), y + 20); q.lineTo(cx + s * 120, y + 6); q.closePath();
    cut(L, q);
  }
  return finishLeaf(L, aniso);
}

/** Strelitzia flower card (side view, beak pointing right). */
function birdFlower(aniso) {
  const S = 256;
  const L = leafCanvases(S, S, '#e0802a');
  // spathe (beak)
  const sp = new Path2D();
  sp.moveTo(30, 178); sp.quadraticCurveTo(120, 150, 232, 176); sp.quadraticCurveTo(130, 204, 30, 186); sp.closePath();
  both(L, sp, '#5d6d4c');
  L.cx.strokeStyle = '#8a3a4a'; L.cx.lineWidth = 3;
  L.cx.beginPath(); L.cx.moveTo(40, 186); L.cx.quadraticCurveTo(130, 200, 228, 178); L.cx.stroke();
  // sepals
  const sep = [[150, 164, 70, 26], [160, 164, 128, 20], [168, 166, 196, 40]];
  for (const [x0, y0, x1, y1] of sep) {
    const { p } = lancePath(x0, y0, x1, y1, 13, 0.08, 1);
    both(L, p, '#f28a1e');
  }
  const { p: blue } = lancePath(162, 166, 150, 60, 8, 0.05, -1);
  both(L, blue, '#2d4fb5');
  return finishLeaf(L, aniso);
}

/** Leafy shrub card with flowers (type 'bougainvillea' | 'hibiscus' | 'plain'). */
function shrubCard(aniso, type, seed) {
  const S = 512, c0 = S / 2;
  const L = leafCanvases(S, S, '#335e2a');
  const rng = new Rng(seed);
  const greens = ['#2d5626', '#3a6a30', '#467a36', '#2a4f22', '#50843c'];
  for (let i = 0; i < 190; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * 205;
    const x = c0 + Math.cos(a) * r, y = c0 + Math.sin(a) * r * 0.92;
    const l = rng.range(22, 42), ang = rng.range(0, TAU);
    const p = new Path2D();
    p.ellipse(x, y, l, l * 0.45, ang, 0, TAU);
    both(L, p, jitterHex(rng.pick(greens), 0.08, rng));
    L.cx.strokeStyle = 'rgba(160,190,110,0.3)'; L.cx.lineWidth = 1;
    L.cx.beginPath(); L.cx.moveTo(x - Math.cos(ang) * l * 0.8, y - Math.sin(ang) * l * 0.8); L.cx.lineTo(x + Math.cos(ang) * l * 0.8, y + Math.sin(ang) * l * 0.8); L.cx.stroke();
  }
  if (type === 'bougainvillea') {
    const mags = ['#b82f78', '#c93d86', '#a8266b', '#d65a98'];
    for (let i = 0; i < 60; i++) {
      const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * 190;
      const x = c0 + Math.cos(a) * r, y = c0 + Math.sin(a) * r * 0.9;
      for (let k = 0; k < 3; k++) {
        const aa = k * TAU / 3 + rng.range(0, 1);
        const p = new Path2D();
        p.ellipse(x + Math.cos(aa) * 9, y + Math.sin(aa) * 9, 13, 10, aa, 0, TAU);
        both(L, p, jitterHex(rng.pick(mags), 0.06, rng));
      }
      L.cx.fillStyle = '#f2ead0'; L.cx.beginPath(); L.cx.arc(x, y, 2.5, 0, TAU); L.cx.fill();
    }
  } else if (type === 'hibiscus') {
    for (let i = 0; i < 8; i++) {
      const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * 170;
      const x = c0 + Math.cos(a) * r, y = c0 + Math.sin(a) * r * 0.9;
      const R = rng.range(26, 36), rot = rng.range(0, TAU);
      for (let k = 0; k < 5; k++) {
        const aa = rot + k * TAU / 5;
        const p = new Path2D();
        p.ellipse(x + Math.cos(aa) * R * 0.55, y + Math.sin(aa) * R * 0.55, R * 0.62, R * 0.45, aa, 0, TAU);
        both(L, p, jitterHex('#c42a2f', 0.07, rng));
      }
      L.cx.fillStyle = '#6a1016'; L.cx.beginPath(); L.cx.arc(x, y, R * 0.28, 0, TAU); L.cx.fill();
      L.cx.strokeStyle = '#f0d060'; L.cx.lineWidth = 3;
      L.cx.beginPath(); L.cx.moveTo(x, y); L.cx.lineTo(x + Math.cos(rot) * R * 0.9, y + Math.sin(rot) * R * 0.9); L.cx.stroke();
    }
  }
  return finishLeaf(L, aniso);
}

/** Ground clump (aspidistra / peace lily): strap leaves from bottom centre. */
function clumpCard(aniso) {
  const S = 512, ox = S / 2, oy = S - 6;
  const L = leafCanvases(S, S, '#2f5a29');
  const rng = new Rng(271);
  const leaves = [];
  for (let i = 0; i < 12; i++) leaves.push({ a: rng.range(-62, 62) * DEG, l: rng.range(290, 480), w: rng.range(20, 30) });
  leaves.sort((a, b) => b.l - a.l);
  for (const lf of leaves) {
    const x1 = ox + Math.sin(lf.a) * lf.l, y1 = oy - Math.cos(lf.a) * lf.l;
    const { p, mx, my } = lancePath(ox, oy, x1, y1, lf.w, 0.07, lf.a > 0 ? 1 : -1);
    both(L, p, jitterHex('#335f2b', 0.12, rng));
    L.cx.strokeStyle = 'rgba(150,190,110,0.4)'; L.cx.lineWidth = 2;
    L.cx.beginPath(); L.cx.moveTo(ox, oy); L.cx.quadraticCurveTo(mx, my, x1, y1); L.cx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.range(-30, 30) * DEG, l = rng.range(250, 330);
    const x1 = ox + Math.sin(a) * l, y1 = oy - Math.cos(a) * l;
    L.cx.strokeStyle = '#4d7a38'; L.cx.lineWidth = 3;
    L.cx.beginPath(); L.cx.moveTo(ox, oy); L.cx.lineTo(x1, y1); L.cx.stroke();
    L.ax.strokeStyle = '#fff'; L.ax.lineWidth = 3;
    L.ax.beginPath(); L.ax.moveTo(ox, oy); L.ax.lineTo(x1, y1); L.ax.stroke();
    const { p } = lancePath(x1, y1 + 10, x1 + Math.sin(a) * 70, y1 - 60, 22, 0.05, 1);
    both(L, p, '#eeeadb');
    L.cx.fillStyle = '#e7d27a'; L.cx.beginPath(); L.cx.ellipse(x1 + 3, y1 - 12, 4, 13, a, 0, TAU); L.cx.fill();
  }
  return finishLeaf(L, aniso);
}

// ================================================================= export ===
export function createTextures({ anisotropy = 8 } = {}) {
  const A = anisotropy;
  const t0 = performance.now();
  const T = {
    tiles: tileTextures(A),
    stone: stoneTexture(A),
    plinthTop: plinthTopTexture(A),
    soil: soilTexture(A),
    grate: grateTexture(A),
    gravel: gravelTexture(A),
    lawn: lawnTexture(A),
    bark: barkAtlas(A),
    leaves: {
      pinnate: pinnateFrond(A),
      fan: fanLeaf(A),
      banana: bananaLeaf(A),
      fern: fernFrond(A),
      monstera: monsteraLeaf(A),
      strelitzia: strelitziaLeaf(A),
      bird: birdFlower(A),
      bougainvillea: shrubCard(A, 'bougainvillea', 261),
      hibiscus: shrubCard(A, 'hibiscus', 262),
      shrub: shrubCard(A, 'plain', 263),
      clump: clumpCard(A),
    },
  };
  T.buildMs = performance.now() - t0;
  return T;
}
