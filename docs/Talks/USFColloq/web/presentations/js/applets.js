// Starter applets. Each runs in a sandboxed iframe whose :root carries the
// deck theme as --pz-bg, --pz-text, --pz-accent, … and the theme fonts.

export const APPLETS = [
  {
    id: 'blank', name: 'Blank applet',
    code: String.raw`<!-- Any HTML, CSS and JavaScript. Theme colors are CSS variables:
     --pz-bg --pz-surface --pz-text --pz-muted --pz-accent --pz-accent2 -->
<style>
  body { display: grid; place-items: center; }
  h1 { font: 700 64px/1 var(--pz-font-heading); color: var(--pz-accent); }
</style>
<h1 id="out">Hello</h1>
<script>
  let n = 0;
  document.body.addEventListener('click', () => out.textContent = 'Clicked ' + (++n) + '×');
</script>`,
  },
  {
    id: 'plot', name: 'Function plotter',
    code: String.raw`<style>
  body { display: flex; flex-direction: column; }
  canvas { flex: 1; width: 100%; min-height: 0; display: block; }
  .bar { display: flex; gap: 18px; align-items: center; padding: 14px 22px; font: 500 20px var(--pz-font-body); color: var(--pz-muted); }
  input[type=text] { flex: 1; font: 20px var(--pz-font-mono); padding: 6px 10px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--pz-text) 25%, transparent); background: transparent; color: var(--pz-text); }
  input[type=range] { width: 220px; accent-color: var(--pz-accent); }
  b { color: var(--pz-text); font-variant-numeric: tabular-nums; min-width: 3.5em; }
</style>
<canvas id="c"></canvas>
<div class="bar">
  y = <input id="f" type="text" value="sin(a*x) / x">
  a <input id="a" type="range" min="0.2" max="6" step="0.01" value="2"> <b id="av"></b>
</div>
<script>
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const c = document.getElementById('c'), g = c.getContext('2d');
let fn = null;
function compile() {
  try { fn = new Function('x', 'a', 'with (Math) { return ' + f.value + ' }'); fn(1, 1); f.style.borderColor = ''; }
  catch { fn = null; f.style.borderColor = css('--pz-accent2'); }
}
function draw() {
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const a = +document.getElementById('a').value; av.textContent = a.toFixed(2);
  const sx = w / 20, sy = h / 5, ox = w / 2, oy = h / 2;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = css('--pz-muted'); g.globalAlpha = .25; g.lineWidth = 1;
  for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(ox + i * sx, 0); g.lineTo(ox + i * sx, h); g.stroke(); }
  g.globalAlpha = .7; g.beginPath(); g.moveTo(0, oy); g.lineTo(w, oy); g.moveTo(ox, 0); g.lineTo(ox, h); g.stroke();
  g.globalAlpha = 1;
  if (!fn) return;
  g.strokeStyle = css('--pz-accent'); g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
  let pen = false;
  for (let px = 0; px <= w; px++) {
    const y = fn((px - ox) / sx, a), py = oy - y * sy;
    if (!isFinite(py) || Math.abs(py) > 4 * h) { pen = false; continue; }
    pen ? g.lineTo(px, py) : g.moveTo(px, py); pen = true;
  }
  g.stroke();
}
f.oninput = () => { compile(); draw(); };
document.getElementById('a').oninput = draw;
new ResizeObserver(draw).observe(c);
compile(); draw();
</script>`,
  },
  {
    id: 'ford', name: 'Ford circles',
    code: String.raw`<style>
  body { display: flex; flex-direction: column; }
  canvas { flex: 1; width: 100%; min-height: 0; display: block; cursor: crosshair; }
  .bar { display: flex; gap: 16px; align-items: center; padding: 12px 22px; font: 500 20px var(--pz-font-body); color: var(--pz-muted); }
  input { accent-color: var(--pz-accent); width: 260px; }
  b { color: var(--pz-text); font-variant-numeric: tabular-nums; }
  #hover { margin-left: auto; color: var(--pz-accent); font: 600 26px var(--pz-font-heading); }
</style>
<canvas id="c"></canvas>
<div class="bar">denominators ≤ <input id="n" type="range" min="1" max="60" value="12"> <b id="nv"></b><span id="hover"></span></div>
<script>
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const c = document.getElementById('c'), g = c.getContext('2d');
const gcd = (a, b) => b ? gcd(b, a % b) : a;
let circles = [];
function draw() {
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const N = +n.value; nv.textContent = N;
  // The 0/1 and 1/1 circles have diameter s, so fit s to the height too.
  const base = h - 24, s = Math.min(w - 60, base - 12), pad = (w - s) / 2;
  g.clearRect(0, 0, w, h);
  circles = [];
  for (let q = 1; q <= N; q++) for (let p = 0; p <= q; p++) {
    if (gcd(p, q) !== 1) continue;
    const r = s / (2 * q * q), x = pad + s * p / q;
    circles.push({ p, q, x, y: base - r, r });
  }
  const hue = [css('--pz-accent'), css('--pz-accent2'), css('--pz-text')];
  for (const k of circles) {
    g.beginPath(); g.arc(k.x, k.y, k.r, 0, 2 * Math.PI);
    g.fillStyle = hue[k.q % 3]; g.globalAlpha = .16; g.fill();
    g.globalAlpha = .9; g.lineWidth = Math.max(.6, 2.4 / Math.sqrt(k.q)); g.strokeStyle = hue[k.q % 3]; g.stroke();
  }
  g.globalAlpha = 1; g.strokeStyle = css('--pz-muted'); g.lineWidth = 2;
  g.beginPath(); g.moveTo(pad - 10, base); g.lineTo(w - pad + 10, base); g.stroke();
}
c.onmousemove = e => {
  const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const k = circles.find(k => (x - k.x) ** 2 + (y - k.y) ** 2 < k.r ** 2);
  hover.textContent = k ? k.p + '/' + k.q : '';
};
n.oninput = draw;
new ResizeObserver(draw).observe(c);
draw();
</script>`,
  },
  {
    id: 'spiro', name: 'Epicycles (animated)',
    code: String.raw`<style>
  canvas { width: 100%; height: 100%; display: block; }
  .hint { position: fixed; right: 18px; bottom: 14px; font: 500 18px var(--pz-font-body); color: var(--pz-muted); }
</style>
<canvas id="c"></canvas>
<div class="hint">click to change the gear ratio</div>
<script>
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const c = document.getElementById('c'), g = c.getContext('2d');
let k = 5 / 3, t = 0, trail = [];
c.onclick = () => { k = [5 / 3, 7 / 4, 3 / 8, 11 / 5, 9 / 7][Math.floor(Math.random() * 5)]; trail = []; };
function frame() {
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const R = Math.min(w, h) * .42, cx = w / 2, cy = h / 2, r = R / (1 + k);
  t += 0.012;
  const a = { x: cx + (R - r) * Math.cos(t), y: cy + (R - r) * Math.sin(t) };
  const pen = { x: a.x + r * .8 * Math.cos(t * (R - r) / r), y: a.y - r * .8 * Math.sin(t * (R - r) / r) };
  trail.push(pen); if (trail.length > 2400) trail.shift();
  g.lineWidth = 1.5; g.strokeStyle = css('--pz-muted'); g.globalAlpha = .45;
  g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(pen.x, pen.y); g.stroke();
  g.globalAlpha = 1; g.strokeStyle = css('--pz-accent'); g.lineWidth = 3; g.lineJoin = 'round';
  g.beginPath(); trail.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
  g.fillStyle = css('--pz-accent2'); g.beginPath(); g.arc(pen.x, pen.y, 7, 0, 7); g.fill();
  requestAnimationFrame(frame);
}
frame();
</script>`,
  },
  {
    id: 'remote', name: 'Phone-controlled epicycles',
    code: String.raw`<!-- Parameters declared with pz.slider / pz.toggle / pz.button / pz.joystick
     appear on the phone remote (slide panel → Phone remote → "Controls"). -->
<style>
  canvas { width: 100%; height: 100%; display: block; }
  .vals { position: fixed; left: 22px; bottom: 16px; font: 500 18px var(--pz-font-body); color: var(--pz-muted); font-variant-numeric: tabular-nums; }
  .vals b { color: var(--pz-text); font-weight: 600; margin-right: 14px; }
</style>
<canvas id="c"></canvas>
<div class="vals" id="vals"></div>
<script>
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const c = document.getElementById('c'), g = c.getContext('2d');
let t = 0, trail = [], off = { x: 0, y: 0 }, joy = { x: 0, y: 0 };
let speed = pz.slider('speed', { min: 0, max: 3, step: 0.05, value: 1, label: 'Speed' }, v => speed = v);
let k = pz.slider('ratio', { min: 0.2, max: 4, step: 0.01, value: 1.67, label: 'Gear ratio' }, v => { k = v; trail = []; });
let showTrail = pz.toggle('trail', { value: true, label: 'Trail' }, v => showTrail = v);
pz.button('clear', { label: 'Clear the drawing' }, () => trail = []);
pz.joystick('move', { label: 'Move the gears' }, p => joy = p);
function frame() {
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  off.x = Math.max(-w / 3, Math.min(w / 3, off.x + joy.x * 6)); off.y = Math.max(-h / 3, Math.min(h / 3, off.y - joy.y * 6));
  const R = Math.min(w, h) * .4, cx = w / 2 + off.x, cy = h / 2 + off.y, r = R / (1 + k);
  t += 0.012 * speed;
  const a = { x: cx + (R - r) * Math.cos(t), y: cy + (R - r) * Math.sin(t) };
  const pen = { x: a.x + r * .8 * Math.cos(t * (R - r) / r), y: a.y - r * .8 * Math.sin(t * (R - r) / r) };
  if (speed) { trail.push(pen); if (trail.length > 2400) trail.shift(); }
  g.lineWidth = 1.5; g.strokeStyle = css('--pz-muted'); g.globalAlpha = .45;
  g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(pen.x, pen.y); g.stroke();
  g.globalAlpha = 1;
  if (showTrail) { g.strokeStyle = css('--pz-accent'); g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath(); trail.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); }
  g.fillStyle = css('--pz-accent2'); g.beginPath(); g.arc(pen.x, pen.y, 7, 0, 7); g.fill();
  vals.innerHTML = 'speed <b>' + speed.toFixed(2) + '</b> ratio <b>' + k.toFixed(2) + '</b> trail <b>' + (showTrail ? 'on' : 'off') + '</b>';
  requestAnimationFrame(frame);
}
frame();
</script>`,
  },
];
