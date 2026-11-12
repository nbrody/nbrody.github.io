import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS, PALETTES, paletteLUT } from '../landmarks.js';

test('deep landmarks retain exact decimal coordinates and desktop widths', () => {
  const deep = LANDMARKS.find(point => point.name === 'Deep spiral');
  assert.equal(deep.re, '-0.743643887037158704752191506114774');
  assert.equal(deep.im, '0.131825904205311970493132056385139');
  assert.equal(deep.box[0], 4e-24);
  const period998 = LANDMARKS.find(point => point.name === 'Period-998 minibrot');
  assert.equal(period998.re, '-0.7436438870371588707780645434936425750476');
  assert.equal(period998.im, '0.131825904205312292821097354874767265263');
  assert.equal(period998.box[0], 2.6e-15);
});

test('desktop palette lookup produces opaque 512-pixel color ramps', () => {
  assert.deepEqual(PALETTES.map(p => p.id), ['classic', 'ember', 'lagoon', 'ink']);
  for (const palette of PALETTES) {
    const lut = paletteLUT(palette);
    assert.equal(lut.length, 512 * 4);
    assert.ok(lut.every((value, index) => index % 4 !== 3 || value === 255));
    assert.deepEqual([...lut.slice(0, 3)], [1, 3, 5].map(i => parseInt(palette.stops[0][1].slice(i, i + 2), 16)));
  }
});

test('a deep landmark can be offset below double precision', async () => {
  const { parseFx, pointAtUV, formatFx } = await import('../fixed.js');
  const landmark = LANDMARKS.find(point => point.name === 'Deep spiral');
  const center = [parseFx(landmark.re), parseFx(landmark.im)];
  const point = pointAtUV(.75, .5, center, landmark.box[0]);
  assert.equal(Number(point[0]), Number(center[0]));
  assert.notEqual(point[0], center[0]);
  assert.equal(formatFx(point[0], 30), '−0.743643887037158704752190506115');
  assert.equal(point[1], center[1]);
});
