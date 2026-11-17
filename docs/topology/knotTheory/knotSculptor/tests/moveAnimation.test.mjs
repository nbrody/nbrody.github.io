import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoveAnimation, sampleMoveAnimation } from '../js/moveAnimation.js';
import { removalStep, insertionStep } from '../js/moveAnimationSteps.js';

const shape = p => [Float64Array.from(p.flat())];
const triangle = shape([[0,0,0], [2,0,0], [0,2,0]]);
const raised = shape([[0,0,0], [1,1,1], [2,0,0], [0,2,0]]);
const raisedAgain = shape([[0,0,0], [1,1,2], [2,0,0], [0,2,0]]);
const near = (actual, expected) => expected.forEach((v, i) => assert.ok(Math.abs(actual[i] - v) < 1e-12));

test('animates insertion and removal through their certified triangles', () => {
  const a = createMoveAnimation([insertionStep(raised, 0, 1), removalStep(raised, 0, 1)], triangle, triangle);
  assert.deepEqual(sampleMoveAnimation(a, 0), triangle);
  assert.deepEqual(sampleMoveAnimation(a, 1), triangle);
  const quarter = sampleMoveAnimation(a, .25)[0];
  near(quarter.slice(3, 6), [1, .5, .5]);
  const half = sampleMoveAnimation(a, .5)[0];
  near(half.slice(3, 6), [1, 1, 1]);
  const threeQuarters = sampleMoveAnimation(a, .75)[0];
  near(threeQuarters.slice(3, 6), [1, .5, .5]);
});

test('weights consecutive steps by displacement and never interpolates across vertex counts', () => {
  const step1 = insertionStep(raised, 0, 1);
  const step2 = { from: raised, to: raisedAgain };
  const a = createMoveAnimation([step1, step2], raisedAgain, triangle);
  const transition = Math.SQRT2 / (Math.SQRT2 + 1);
  const duringFirst = sampleMoveAnimation(a, transition / 2)[0];
  near(duringFirst.slice(3, 6), [1, .5, .5]);
  const duringSecond = sampleMoveAnimation(a, (1 + transition) / 2)[0];
  near(duringSecond.slice(3, 6), [1, 1, 1.5]);
  assert.deepEqual(sampleMoveAnimation(a, 1), raisedAgain);
});

test('skips zero-motion steps and keeps snapshots isolated', () => {
  const zero = { from: triangle, to: triangle };
  const a = createMoveAnimation([zero, insertionStep(raised, 0, 1)], raised, triangle);
  assert.equal(a.steps.length, 1);
  const sampled = sampleMoveAnimation(a, 1);
  sampled[0][0] = 123;
  assert.equal(sampleMoveAnimation(a, 1)[0][0], 0);
});

test('rejects malformed steps and progress', () => {
  assert.throws(() => createMoveAnimation([{ from: triangle, to: raised }], raised, triangle), /vertex counts/);
  assert.throws(() => createMoveAnimation([{ from: triangle, to: [new Float64Array([NaN,0,0, 1,0,0, 0,1,0])] }], triangle, triangle), /non-finite/);
  assert.throws(() => sampleMoveAnimation(createMoveAnimation([], triangle, triangle), NaN), /finite/);
});
