'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, 'discretenessCertificate.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
assert.ok(scriptMatch, 'inline tool script should exist');
const source = scriptMatch[1];

assert.match(source, /class Mobius/, 'Mobius class must be defined on the page');
assert.match(source, /function parseComplex/, 'parseComplex must be defined on the page');
assert.match(source, /const palette/, 'palette must be defined on the page');

function C(re, im = 0) {
  if (typeof re === 'object' && re && typeof re.re === 'number') {
    return { re: re.re, im: re.im || 0 };
  }
  return { re: Number(re) || 0, im: Number(im) || 0 };
}

function isC(z) {
  return z && typeof z === 'object' && typeof z.re === 'number';
}

function add(a, b) {
  a = isC(a) ? a : C(a);
  b = isC(b) ? b : C(b);
  return C(a.re + b.re, a.im + b.im);
}

function sub(a, b) {
  a = isC(a) ? a : C(a);
  b = isC(b) ? b : C(b);
  return C(a.re - b.re, a.im - b.im);
}

function mul(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return [
      [add(mul(a[0][0], b[0][0]), mul(a[0][1], b[1][0])), add(mul(a[0][0], b[0][1]), mul(a[0][1], b[1][1]))],
      [add(mul(a[1][0], b[0][0]), mul(a[1][1], b[1][0])), add(mul(a[1][0], b[0][1]), mul(a[1][1], b[1][1]))]
    ];
  }
  a = isC(a) ? a : C(a);
  b = isC(b) ? b : C(b);
  return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function div(a, b) {
  a = isC(a) ? a : C(a);
  b = isC(b) ? b : C(b);
  const n = b.re * b.re + b.im * b.im;
  return C((a.re * b.re + a.im * b.im) / n, (a.im * b.re - a.re * b.im) / n);
}

function abs(z) {
  if (typeof z === 'number') return Math.abs(z);
  z = isC(z) ? z : C(z);
  return Math.hypot(z.re, z.im);
}

const math = {
  complex: C,
  evaluate(str) {
    const s = String(str).trim();
    if (/^-?\d+$/.test(s)) return Number(s);
    if (/^-?\d+\/\d+$/.test(s)) {
      const [n, d] = s.split('/').map(Number);
      return n / d;
    }
    throw new Error('unsupported evaluate: ' + s);
  },
  multiply: mul,
  subtract: sub,
  divide: div,
  abs,
  unaryMinus(z) {
    z = isC(z) ? z : C(z);
    return C(-z.re, -z.im);
  },
  import() {}
};

class El {
  constructor(tag, attrs = {}) {
    this.tagName = String(tag).toUpperCase();
    this.attrs = attrs;
    this.children = [];
    this.listeners = {};
    this.value = attrs.value != null ? String(attrs.value) : '';
    this._html = '';
    this.style = {};
  }
  get className() {
    return this.attrs.class || '';
  }
  set className(v) {
    this.attrs.class = String(v);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  querySelectorAll(sel) {
    if (sel === 'input') {
      return this._collect(el => el.tagName === 'INPUT');
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this._collect(el => (el.attrs.class || '').split(/\s+/).includes(cls));
    }
    return [];
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] || (this.listeners[type] = [])).push(fn);
  }
  _collect(pred) {
    const out = [];
    const walk = (el) => {
      if (pred(el)) out.push(el);
      for (const c of el.children) walk(c);
    };
    walk(this);
    return out;
  }
}

function parseFragment(htmlStr, owner) {
  const root = owner || new El('fragment');
  const re = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\/>|<(\w+)([^>]*)>/g;
  let m;
  const inputRe = /<input\b([^>]*)>/gi;
  while ((m = inputRe.exec(htmlStr))) {
    const attrs = {};
    const raw = m[1];
    const val = /value="([^"]*)"/.exec(raw);
    if (val) attrs.value = val[1];
    const inp = new El('input', attrs);
    inp.value = attrs.value || '';
    root.appendChild(inp);
  }
  const labelRe = /class="matrix-label"/g;
  if (labelRe.test(htmlStr)) {
    const lab = new El('span', { class: 'matrix-label' });
    root.appendChild(lab);
  }
  const btnRe = /class="delete-matrix-btn"/g;
  if (btnRe.test(htmlStr)) {
    const btn = new El('button', { class: 'delete-matrix-btn' });
    root.appendChild(btn);
  }
  return root;
}

const matrixInputs = new El('div', { id: 'matrixInputs' });
const canvas = new El('canvas', { id: 'canvas' });
canvas.clientWidth = 800;
canvas.clientHeight = 600;
canvas.width = 800;
canvas.height = 600;
canvas.getContext = () => ({
  clearRect() {},
  save() {},
  restore() {},
  translate() {},
  scale() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  arc() {},
  fill() {},
  strokeStyle: '',
  lineWidth: 1,
  fillStyle: ''
});

const lparam = new El('input', { id: 'Lparam', value: '6' });
lparam.value = '6';
const nodes = {
  canvas,
  controlPanel: new El('div', { id: 'controlPanel' }),
  matrixInputs,
  Lparam: lparam,
  resetViewBtn: new El('button', { id: 'resetViewBtn' }),
  newExampleBtn: new El('button', { id: 'newExampleBtn' }),
  addMatrixBtn: new El('button', { id: 'addMatrixBtn' }),
  groupSelector: new El('select', { id: 'groupSelector' }),
  updateGroupBtn: new El('button', { id: 'updateGroupBtn' }),
  backButton: new El('button', { id: 'backButton' }),
  polynomialsInput: new El('textarea', { id: 'polynomialsInput' })
};

const listeners = { DOMContentLoaded: [] };

const document = {
  getElementById(id) {
    return nodes[id] || null;
  },
  querySelectorAll(sel) {
    if (sel === '#matrixInputs .matrix-block') {
      return matrixInputs.children.filter(c => (c.attrs.class || '') === 'matrix-block');
    }
    if (sel === '.matrix-label') {
      return matrixInputs._collect(el => (el.attrs.class || '').includes('matrix-label'));
    }
    return [];
  },
  createElement(tag) {
    return new El(tag);
  },
  addEventListener(type, fn) {
    if (type === 'DOMContentLoaded') listeners.DOMContentLoaded.push(fn);
  }
};

// addMatrixInput assigns innerHTML then querySelector. Patch El.innerHTML setter.
Object.defineProperty(El.prototype, 'innerHTML', {
  get() { return this._html || ''; },
  set(v) {
    this._html = String(v);
    this.children = [];
    parseFragment(this._html, this);
  }
});

const windowObj = {
  addEventListener(type, fn) {
    if (type === 'resize') return;
    if (type === 'DOMContentLoaded') listeners.DOMContentLoaded.push(fn);
  },
  MathJax: null,
  location: { href: '' }
};

const sandbox = {
  console,
  math,
  document,
  window: windowObj,
  Math,
  Number,
  String,
  Array,
  Set,
  Object,
  parseInt,
  MathJax: null
};
sandbox.global = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(
  source + '\nthis.__export = { Mobius, parseComplex, palette, rebuildIsometricCircles, getCircles: () => circles };',
  sandbox,
  { filename: 'discretenessCertificate.html' }
);

const exported = sandbox.__export;
assert.strictEqual(typeof exported.Mobius, 'function', 'Mobius should be a constructor');
assert.strictEqual(typeof exported.parseComplex, 'function', 'parseComplex should be a function');
assert.ok(Array.isArray(exported.palette) && exported.palette.length > 1, 'palette should have colors');

assert.ok(listeners.DOMContentLoaded.length > 0, 'page should register a load handler');
for (const fn of listeners.DOMContentLoaded) fn();

const blocks = document.querySelectorAll('#matrixInputs .matrix-block');
assert.strictEqual(blocks.length, 2, 'default load should add two generators');

const drawn = exported.getCircles();
assert.ok(Array.isArray(drawn), 'circles should be populated after rebuild');
assert.ok(drawn.length > 0, 'default modular-like generators should produce isometric circles');
for (const c of drawn) {
  assert.ok(c.center && typeof c.center.re === 'number', 'circle center should be complex');
  assert.ok(typeof c.radius === 'number' && c.radius > 0, 'circle radius should be positive');
  assert.ok(typeof c.color === 'string' && c.color.includes('rgba'), 'palette color should be assigned');
}

exported.rebuildIsometricCircles();
assert.ok(exported.getCircles().length > 0, 'Update path should still produce circles');

const inversion = new exported.Mobius(exported.parseComplex('0'), exported.parseComplex('-1'), exported.parseComplex('1'), exported.parseComplex('0'));
const iso = inversion.isoCircle();
assert.ok(iso, 'S inversion should have an isometric circle');
assert.ok(Math.abs(iso.radius - 1) < 1e-9, 'S inversion isometric circle should have radius 1');

console.log(`ok: default load drew ${drawn.length} isometric circles`);
