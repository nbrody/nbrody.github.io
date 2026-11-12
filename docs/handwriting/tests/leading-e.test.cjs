const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const leadingE = require('../leading-e.js');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const fixture = JSON.parse(source('tests/leading-e-layout-reference.json'));

test('scope is explicit; punctuation, later E, whitespace and multiline use normal sampling', () => {
  for (const text of ['E', 'Every day.', 'Each item?', 'Euler is here.'])
    assert.equal(leadingE.supportsLeadingE(text), true, text);
  for (const text of ['', 'E.', 'E!', 'E is here.', 'The Euler quotient.', 'Every E is here.',
                      'Each\nitem', 'Each\n', 'Each\r', ' Each', 'E1', 'Eé'])
    assert.equal(leadingE.supportsLeadingE(text), false, text);
});

test('JS stroke layout matches independently generated Python prototype reference', () => {
  const result = leadingE.prependE({points: fixture.remainder});
  assert.ok(result);
  assert.equal(result.points.length, fixture.expected.length);
  for (let i = 0; i < result.points.length; i++) {
    assert.ok(Math.abs(result.points[i].x - fixture.expected[i].x) <= .0011, `x at ${i}`);
    assert.ok(Math.abs(result.points[i].y - fixture.expected[i].y) <= .0011, `y at ${i}`);
    assert.equal(result.points[i].lift, fixture.expected[i].lift, `pen lift at ${i}`);
  }
  const glyph = leadingE.standaloneE();
  assert.equal(glyph.points.length, 74);
  assert.equal(glyph.points.filter(p => p.lift).length, 4);
  assert.ok(result.points[74].x > Math.max(...result.points.slice(0, 74).map(p => p.x)));
});

test('unsafe geometry and nonfinite points cannot enter a splice', () => {
  assert.equal(leadingE.prependE({points: []}), null);
  assert.equal(leadingE.prependE({points: [{x: NaN, y: 0}]}), null);
  assert.equal(leadingE.prependE({points: [{x: 0, y: 0}, {x: 0, y: 5}]}), null);
  assert.equal(leadingE.prependE({points: [{x: 0, y: 0}, {x: 81, y: 0}]}), null);
});

function makeWorker(remainder) {
  const calls = [], messages = [];
  const context = {
    importScripts() {}, HandwritingLeadingE: leadingE,
    ort: {env: {wasm: {}}, InferenceSession: {async create() { return {}; }}},
    fetch: async () => ({ok: true, json: async () => ({})}),
    postMessage: data => messages.push(JSON.parse(JSON.stringify(data))),
  };
  vm.runInNewContext(source('inference-worker.js'), context);
  context.generatePiece = async text => {
    calls.push(text);
    if (text.startsWith('E')) return {points: [{x: 1, y: 0, lift: true}], loX: 1, hiX: 1};
    return remainder;
  };
  return {context, calls, messages};
}

test('worker leaves unsupported and unchecked inputs on the original path', async () => {
  for (const [text, enabled] of [['Every day', false], ['The Euler result', true], ['E.', true],
                                 ['Every E is different', true], ['Every\nday', true]]) {
    const w = makeWorker({points: fixture.remainder, loX: .1, hiX: 1.1});
    await w.context.onmessage({data: {text, repairLeadingE: enabled}});
    assert.equal(w.messages.at(-1).type, 'done');
    if (text === 'Every day') assert.deepEqual(w.calls, ['Every day']);
    if (text === 'E.') assert.deepEqual(w.calls, ['E.']);
    if (enabled) assert.equal(w.messages.at(-2).applied, false);
    else assert.equal(w.messages.some(m => m.type === 'repair'), false);
  }
});

test('worker repairs supported input and preserves separate pen lifts', async () => {
  const w = makeWorker({points: fixture.remainder, loX: .1, hiX: 1.1});
  await w.context.onmessage({data: {text: 'Every day', repairLeadingE: true}});
  assert.deepEqual(w.calls, ['very day']);
  assert.equal(w.messages.at(-2).type, 'repair');
  assert.equal(w.messages.at(-2).applied, true);
  const line = w.messages.at(-1).lines[0];
  assert.equal(line.length, 80);
  assert.equal(line[73].lift, true);
  assert.ok(line[74].x > Math.max(...line.slice(0, 74).map(p => p.x)));
});

test('only the first chunk of a supported long line is spliced', async () => {
  const w = makeWorker({points: fixture.remainder, loX: .1, hiX: 1.1});
  await w.context.onmessage({data: {text: 'Every kind of function is equal', repairLeadingE: true}});
  assert.equal(w.messages.at(-2).applied, true);
  assert.equal(w.calls[0], 'very kind of');
  assert.ok(w.calls.length > 1);
  assert.ok(w.calls.slice(1).every(text => !text.startsWith('very kind of')));
  const line = w.messages.at(-1).lines[0];
  assert.ok(line.length > 80);
  assert.ok(line.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.equal(line[73].lift, true);
});

test('standalone E uses glyph and unsafe suffix falls back to full text', async () => {
  const one = makeWorker({points: fixture.remainder, loX: .1, hiX: 1.1});
  await one.context.onmessage({data: {text: 'E', repairLeadingE: true}});
  assert.deepEqual(one.calls, []);
  assert.equal(one.messages.at(-2).applied, true);
  assert.equal(one.messages.at(-1).lines[0].length, 74);
  const bad = makeWorker({points: [{x: 0, y: 0}, {x: 0, y: 5}], loX: 0, hiX: 0});
  await bad.context.onmessage({data: {text: 'Every', repairLeadingE: true}});
  assert.deepEqual(bad.calls, ['very', 'Every']);
  assert.equal(bad.messages.at(-2).applied, false);
  assert.equal(bad.messages.at(-1).lines[0].length, 1);
});
