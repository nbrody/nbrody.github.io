const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class Element {
  constructor(tagName) {
    this.tagName = tagName.toLowerCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get classList() {
    return {
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, before) {
    child.parentNode = this;
    const index = this.children.indexOf(before);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }

  querySelector(selector) {
    if (selector !== '.tool-preview, .nav-preview') {
      throw new Error('Unexpected selector: ' + selector);
    }
    return findDescendant(this, (node) => hasClass(node, 'tool-preview') || hasClass(node, 'nav-preview'));
  }

  querySelectorAll(selector) {
    if (selector !== 'iframe, .tp-placeholder') {
      throw new Error('Unexpected selector: ' + selector);
    }
    const matches = [];
    walk(this, (node) => {
      if (node.tagName === 'iframe' || hasClass(node, 'tp-placeholder')) matches.push(node);
    });
    return matches;
  }
}

function hasClass(node, className) {
  return node.className.split(/\s+/).includes(className);
}

function walk(node, callback) {
  node.children.forEach((child) => {
    callback(child);
    walk(child, callback);
  });
}

function findDescendant(node, predicate) {
  for (const child of node.children) {
    if (predicate(child)) return child;
    const nested = findDescendant(child, predicate);
    if (nested) return nested;
  }
  return null;
}

function countIframes(cards) {
  return cards.reduce((total, card) => total + card.querySelector('.tool-preview, .nav-preview').querySelectorAll('iframe, .tp-placeholder').filter((node) => node.tagName === 'iframe').length, 0);
}

function makeCard(index) {
  const card = new Element('a');
  card.className = 'tool-card';
  card.dataset.preview = 'tool-' + index + '.html';
  return card;
}

const cards = Array.from({ length: 6 }, (_, index) => makeCard(index));
let observer;

class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = [];
    observer = this;
  }

  observe(target) {
    this.targets.push(target);
  }
}

const windowObject = {};
windowObject.self = windowObject;
windowObject.top = windowObject;
windowObject.IntersectionObserver = MockIntersectionObserver;

const context = {
  assert,
  console,
  document: {
    readyState: 'complete',
    createElement: (tagName) => new Element(tagName),
    querySelectorAll: (selector) => {
      assert.strictEqual(selector, '.tool-card[data-preview], .nav-card[data-preview]');
      return cards;
    },
  },
  IntersectionObserver: MockIntersectionObserver,
  window: windowObject,
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'tool-previews.js'), 'utf8'), context);

assert.strictEqual(observer.targets.length, cards.length);

observer.callback(cards.map((card) => ({ target: card, isIntersecting: true })));
assert.strictEqual(cards.filter((card) => card.dataset.previewLoaded === '1').length, 4);
assert.strictEqual(countIframes(cards), 4);
assert.deepStrictEqual(cards.map((card) => card.dataset.previewLoaded), ['0', '0', '1', '1', '1', '1']);

observer.callback([{ target: cards[5], isIntersecting: false }]);
assert.strictEqual(cards[5].dataset.previewLoaded, '0');
assert.strictEqual(countIframes(cards), 3);

observer.callback([{ target: cards[0], isIntersecting: true }]);
assert.strictEqual(cards[0].dataset.previewLoaded, '1');
assert.strictEqual(countIframes(cards), 4);

console.log('tool-previews tests passed');
