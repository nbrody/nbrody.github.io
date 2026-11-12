const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

test('model client forwards the selection and preserves the original default', async () => {
  const workers = [];
  class Worker {
    constructor(url) { this.url = url; workers.push(this); }
    postMessage(data) { this.message = data; }
    terminate() { this.terminated = true; }
  }
  const context = {window: {}, Worker};
  vm.runInNewContext(source('model-client.js'), context);
  let repair;
  const focused = context.window.generateHandwriting('Example', {model: 'natural', bias: 1.2, repairLeadingE: true, onRepair: result => {repair = result;} });
  assert.equal(workers[0].url, 'inference-worker.js?v=5');
  assert.deepEqual(JSON.parse(JSON.stringify(workers[0].message)), {text: 'Example', bias: 1.2, model: 'natural', repairLeadingE: true});
  workers[0].onmessage({data: {type: 'repair', applied: true}});
  assert.equal(repair.applied, true);
  workers[0].onmessage({data: {type: 'done', lines: []}});
  assert.deepEqual(await focused, []);
  assert.equal(workers[0].terminated, true);
  const original = context.window.generateHandwriting('Test');
  assert.equal(workers[1].message.model, 'original');
  workers[1].onmessage({data: {type: 'done', lines: []}});
  await original;
});

test('worker loads only the selected allowlisted model and can switch models', async () => {
  const fetched = [], loaded = [], messages = [];
  const context = {
    importScripts() {},
    ort: {env: {wasm: {}}, InferenceSession: {async create(url) { loaded.push(url); return {}; }}},
    fetch: async url => { fetched.push(url); return {ok: true, async json() { return {}; }}; },
    postMessage: data => messages.push(data),
  };
  vm.runInNewContext(source('inference-worker.js'), context);
  for (const model of ['original', 'general', 'focused', 'natural']) await context.onmessage({data: {text: '', model}});
  assert.deepEqual(fetched, ['model/config.json', 'models/general/config.json', 'models/focused/config.json', 'models/natural/config.json']);
  assert.deepEqual(loaded, ['model/step.onnx', 'models/general/step.onnx', 'models/focused/step.onnx', 'models/natural/step.onnx']);
  assert.equal(messages.filter(m => m.type === 'done').length, 4);
  await context.onmessage({data: {text: '', model: '../private'}});
  assert.equal(messages.at(-1).type, 'error');
  assert.equal(messages.at(-1).message, 'Unknown handwriting model.');
  assert.equal(fetched.length, 4);
  await context.onmessage({data: {text: '', model: 'toString'}});
  assert.equal(messages.at(-1).type, 'error');
  assert.equal(fetched.length, 4);
});

test('the page submits the selected model and locks it during generation', async () => {
  const ids = ['text-input','character-count','generate','bias','bias-value','model-select','repair-leading-e',
    'result','empty-state','status','preview-state','paper','download','thickness',
    'thickness-value','texture','ink-color','background-color'];
  const elements = Object.fromEntries(ids.map(id => [id, {
    value: '', disabled: false, style: {}, classList: {toggle() {}}, listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    querySelector() { return this.buttonLabel ||= {}; }, setAttribute() {},
  }]));
  Object.assign(elements['text-input'], {value: 'Hello'});
  Object.assign(elements['model-select'], {value: 'natural'});
  Object.assign(elements['repair-leading-e'], {checked: true});
  Object.assign(elements.bias, {value: '1.5'});
  Object.assign(elements.thickness, {value: '1.8'});
  Object.assign(elements.texture, {value: 'smooth'});
  Object.assign(elements['ink-color'], {value: '#344b3e'});
  Object.assign(elements['background-color'], {value: '#fffefa'});
  let resolve, call;
  const context = {
    document: {getElementById: id => elements[id]},
    window: {generateHandwriting: (text, options) => { call = {text, options}; return new Promise(r => { resolve = r; }); }},
    Blob, URL: {createObjectURL() { return 'blob:test'; }, revokeObjectURL() {}}, console,
  };
  vm.runInNewContext(source('app.js'), context);
  const run = elements.generate.listeners.click();
  assert.equal(call.text, 'Hello');
  assert.equal(call.options.model, 'natural');
  assert.equal(call.options.repairLeadingE, true);
  assert.equal(elements['model-select'].disabled, true);
  assert.equal(elements['repair-leading-e'].disabled, true);
  call.options.onRepair({type:'repair', applied:true});
  resolve([[{x: 0, y: 0, lift: true}, {x: 1, y: 1, lift: true}]]);
  await run;
  assert.equal(elements['model-select'].disabled, false);
  assert.equal(elements['repair-leading-e'].disabled, false);
  assert.match(elements.status.textContent, /Leading E repaired/);
  assert.equal(elements['preview-state'].textContent, 'DONE');
});
