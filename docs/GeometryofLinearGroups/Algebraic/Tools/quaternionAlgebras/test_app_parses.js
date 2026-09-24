// Guard: Algebraic quaternionAlgebras/app.js must parse and boot.
// A stray brace in the cancel-button listener used to throw
// SyntaxError and left Compute unit group completely inert.
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const appPath = path.join(__dirname, 'app.js');
const check = spawnSync(process.execPath, ['--check', appPath], {
  encoding: 'utf8',
});
assert.equal(check.status, 0, check.stderr || 'node --check failed');

function stubEl(id) {
  return {
    id,
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    setAttribute() {},
    style: {},
  };
}

const els = {
  '#algebra-form': stubEl('algebra-form'),
  '#status-message': stubEl('status-message'),
  '#output': stubEl('output'),
  '#sage-code': stubEl('sage-code'),
  '#submit-button': stubEl('submit-button'),
  '#cancel-button': stubEl('cancel-button'),
  '#copy-code': stubEl('copy-code'),
  '#clear-output': stubEl('clear-output'),
  '#field-polynomial-hidden': stubEl('field-polynomial-hidden'),
  '#param-a-hidden': stubEl('param-a-hidden'),
  '#param-b-hidden': stubEl('param-b-hidden'),
};

globalThis.document = {
  querySelector: (sel) => els[sel] ?? null,
  querySelectorAll: () => [],
  createElement: () => stubEl('anon'),
};
globalThis.window = globalThis;
globalThis.MathQuill = undefined;

(async () => {
  await import(pathToFileURL(appPath).href);
  assert.equal(typeof els['#cancel-button'].listeners.click, 'function');
  assert.equal(typeof els['#algebra-form'].listeners.submit, 'function');
  assert.match(
    els['#status-message'].textContent,
    /Compute unit group/,
    'status should initialize after boot'
  );
  console.log('ok: quaternionAlgebras/app.js parses and wires Compute/Cancel');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
