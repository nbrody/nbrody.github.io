import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointFromUV, encodeUV, decodeUV } from '../math.js';
test('UV maps the centre and corners to complex coordinates', () => {
  assert.deepEqual(pointFromUV(.5,.5,[-.5,0],4),[-.5,0]);
  assert.deepEqual(pointFromUV(0,1,[-.5,0],4),[-2.5,2]);
});
test('selected ray point survives quantization', () => {
  const [u,v]=decodeUV(encodeUV(.23,.78));
  assert.ok(Math.abs(u-.23)<1/4095); assert.ok(Math.abs(v-.78)<1/4095);
});
