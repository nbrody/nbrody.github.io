#!/usr/bin/env node
'use strict';

/**
 * Mini Golf Hole 3 ("Island Green") placed a filled water circle on the
 * cup. Water is tested before the sink check, so any putt that could go
 * in was a splash + tee reset. The 9-hole course could not be finished.
 *
 * Water hazards may now include an inner island radius. This test loads
 * game.js in a stubbed DOM and asserts every hole's sink radius is dry.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

function el() {
  return {
    classList: { add() {}, remove() {}, contains() { return false; } },
    style: {},
    textContent: '',
    innerHTML: '',
    addEventListener() {},
  };
}

const canvas = {
  width: 400,
  height: 700,
  style: {},
  getContext() {
    const grad = { addColorStop() {} };
    return {
      fillRect() {},
      clearRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      save() {},
      restore() {},
      clip() {},
      setTransform() {},
      createLinearGradient: () => grad,
      createRadialGradient: () => grad,
      fillText() {},
      quadraticCurveTo() {},
      setLineDash() {},
    };
  },
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 700 };
  },
  addEventListener() {},
};

const sandbox = {
  MINIGOLF_TEST: {},
  document: {
    getElementById(id) {
      return id === 'game-canvas' ? canvas : el();
    },
    body: {},
  },
  window: {
    innerWidth: 800,
    innerHeight: 900,
    devicePixelRatio: 1,
    addEventListener() {},
  },
  requestAnimationFrame() { return 0; },
  getComputedStyle() {
    return { getPropertyValue() { return ''; } };
  },
};
sandbox.globalThis = sandbox;
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const api = sandbox.MINIGOLF_TEST;
assert.ok(api.HOLES && api.HOLES.length === 9, 'expected 9 holes');
assert.equal(typeof api.isInWater, 'function');
assert.ok(api.sinkRadius > 0);

const hole3 = api.HOLES[2];
assert.deepStrictEqual(Array.from(hole3.hole), [200, 180]);
assert.ok(hole3.water[0][3] > api.sinkRadius,
  'Island Green inner radius must leave the cup dry');

for (let i = 0; i < api.HOLES.length; i++) {
  const h = api.HOLES[i];
  const [hx, hy] = h.hole;
  const samples = [[hx, hy]];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    samples.push([
      hx + Math.cos(a) * api.sinkRadius * 0.9,
      hy + Math.sin(a) * api.sinkRadius * 0.9,
    ]);
  }
  for (const [x, y] of samples) {
    assert.ok(
      !api.isInWater(x, y, h.water),
      `hole ${i + 1}: cup/sink sample (${x.toFixed(1)},${y.toFixed(1)}) is in water`
    );
  }
}

// Island Green ring still penalizes a miss off the island.
assert.ok(
  api.isInWater(200, 180 + 45, hole3.water),
  'Island Green water ring should still catch shots past the island'
);
assert.ok(
  !api.isInWater(200, 180, hole3.water),
  'Island Green cup must be dry'
);

for (let i = 0; i < api.HOLES.length; i++) {
  const result = api.trySinkAtCup(i);
  assert.ok(result.ballInHole, `hole ${i + 1}: slow ball on the cup must sink`);
  assert.ok(!result.atTee, `hole ${i + 1}: sink must not splash-reset to the tee`);
}

console.log('ok: all 9 holes have a dry sink radius; Island Green ring still hazards');
