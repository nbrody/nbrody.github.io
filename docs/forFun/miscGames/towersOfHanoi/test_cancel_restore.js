#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function el(id) {
    return {
        id,
        textContent: '',
        innerHTML: '',
        className: '',
        classList: { add() {}, remove() {} },
        addEventListener() {},
        style: {}
    };
}

function loadGame() {
    const canvasListeners = {};
    const canvas = {
        id: 'game-canvas',
        width: 900,
        height: 700,
        style: {},
        getContext() {
            return {
                setTransform() {},
                fillRect() {},
                fillText() {},
                beginPath() {},
                moveTo() {},
                lineTo() {},
                stroke() {},
                fill() {},
                arc() {},
                quadraticCurveTo() {},
                closePath() {},
                createRadialGradient() {
                    return { addColorStop() {} };
                },
                createLinearGradient() {
                    return { addColorStop() {} };
                }
            };
        },
        addEventListener(type, fn) {
            canvasListeners[type] = fn;
        }
    };
    const ids = {
        'game-canvas': canvas,
        'menu-overlay': el('menu-overlay'),
        'win-overlay': el('win-overlay'),
        'start-btn': el('start-btn'),
        'play-again-btn': el('play-again-btn'),
        'menu-btn': el('menu-btn'),
        'back-btn': el('back-btn'),
        'disk-count': el('disk-count'),
        'disk-minus': el('disk-minus'),
        'disk-plus': el('disk-plus'),
        'min-moves': el('min-moves'),
        'move-count': el('move-count'),
        'best-possible': el('best-possible'),
        'timer': el('timer'),
        'win-text': el('win-text'),
        'win-stats': el('win-stats'),
        'win-stars': el('win-stars')
    };

    const sandbox = {
        HANOI_TEST: true,
        console,
        performance: { now: () => 0 },
        requestAnimationFrame() {},
        setTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        window: {
            innerWidth: 900,
            innerHeight: 700,
            devicePixelRatio: 1,
            addEventListener() {}
        },
        document: {
            getElementById(id) {
                return ids[id] || null;
            }
        }
    };
    sandbox.globalThis = sandbox;
    sandbox.window.document = sandbox.document;

    const code = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
    vm.runInNewContext(code, sandbox, { filename: 'game.js' });
    assert(sandbox.__hanoiTest, 'expected HANOI_TEST hook');
    return sandbox.__hanoiTest;
}

function clickPeg(api, i) {
    const { x, y } = api.pegPoint(i);
    api.pointerDown(x, y);
    api.pointerUp(x, y);
}

function pegsOf(api) {
    return Array.from(api.pegs(), p => Array.from(p));
}

function dragPeg(api, from, to) {
    const a = api.pegPoint(from);
    const b = api.pegPoint(to);
    api.pointerDown(a.x, a.y);
    const dx = b.x - a.x || 40;
    api.pointerMove(a.x + dx, a.y);
    api.pointerUp(b.x, b.y);
}

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log('ok -', name);
}

const api = loadGame();
api.start();

check('start stacks all disks on peg A', () => {
    assert.deepStrictEqual(pegsOf(api), [[4, 3, 2, 1], [], []]);
    assert.strictEqual(api.totalDisks(), 4);
});

check('click-click same peg restores the disk (cancel)', () => {
    clickPeg(api, 0);
    assert.strictEqual(api.lifted().liftedDisk, 1, 'first click should lift the top disk');
    assert.deepStrictEqual(Array.from(api.pegs()[0]), [4, 3, 2]);
    clickPeg(api, 0);
    assert.strictEqual(api.lifted().liftedDisk, -1);
    assert.deepStrictEqual(pegsOf(api), [[4, 3, 2, 1], [], []]);
    assert.strictEqual(api.totalDisks(), 4);
});

check('click-click onto another peg places the disk', () => {
    clickPeg(api, 0);
    clickPeg(api, 1);
    api.flushDrop();
    assert.deepStrictEqual(pegsOf(api), [[4, 3, 2], [1], []]);
    assert.strictEqual(api.lifted().liftedDisk, -1);
    assert.strictEqual(api.totalDisks(), 4);
});

check('invalid click-click returns the disk to its source', () => {
    clickPeg(api, 0);
    assert.strictEqual(api.lifted().liftedDisk, 2);
    clickPeg(api, 1);
    assert.strictEqual(api.lifted().liftedDisk, -1);
    assert.deepStrictEqual(pegsOf(api), [[4, 3, 2], [1], []]);
    assert.strictEqual(api.totalDisks(), 4);
});

check('drag-release on the same peg restores the disk', () => {
    const a = api.pegPoint(0);
    api.pointerDown(a.x, a.y);
    api.pointerMove(a.x + 40, a.y - 20);
    api.pointerUp(a.x, a.y);
    assert.strictEqual(api.lifted().liftedDisk, -1);
    assert.strictEqual(api.totalDisks(), 4);
    const all = pegsOf(api).flat().sort((x, y) => x - y);
    assert.deepStrictEqual(all, [1, 2, 3, 4]);
});

check('drag onto an empty peg completes the move', () => {
    api.start();
    dragPeg(api, 0, 2);
    api.flushDrop();
    assert.deepStrictEqual(pegsOf(api), [[4, 3, 2], [], [1]]);
    assert.strictEqual(api.totalDisks(), 4);
});

console.log(`\n${passed} tests passed`);
