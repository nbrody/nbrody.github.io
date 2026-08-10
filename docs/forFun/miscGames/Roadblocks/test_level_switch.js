/**
 * Regression: level switch during tween / pending win advance.
 * Run: node docs/forFun/miscGames/Roadblocks/test_level_switch.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;

function loadScripts() {
    const timeouts = new Map();
    let nextId = 1;
    const canvasEl = {
        style: {},
        width: 0,
        height: 0,
        addEventListener() {},
        removeEventListener() {},
        getContext() {
            return {
                scale() {},
                clearRect() {},
                fillRect() {},
                beginPath() {},
                arc() {},
                fill() {},
                stroke() {},
                save() {},
                restore() {},
                translate() {},
                rotate() {},
                moveTo() {},
                lineTo() {},
                closePath() {},
                createLinearGradient() {
                    return { addColorStop() {} };
                },
                measureText() { return { width: 0 }; },
                fillText() {},
                drawImage() {},
                setTransform() {},
            };
        },
        parentNode: { removeChild() {} },
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 400, height: 400 };
        },
    };

    const container = {
        innerHTML: '',
        style: {},
        appendChild() {},
        querySelector() { return null; },
        closest() { return null; },
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 400, height: 400 };
        },
    };

    const context = {
        console,
        Math,
        JSON,
        Array,
        Object,
        Map,
        Set,
        Promise,
        performance: { now: () => Date.now() },
        requestAnimationFrame() { return 0; },
        cancelAnimationFrame() {},
        setTimeout(fn, ms) {
            const id = nextId++;
            timeouts.set(id, { fn, ms, cleared: false });
            return id;
        },
        clearTimeout(id) {
            const t = timeouts.get(id);
            if (t) t.cleared = true;
        },
        addEventListener() {},
        removeEventListener() {},
        document: {
            createElement(tag) {
                if (tag === 'canvas') return canvasEl;
                return {
                    style: {},
                    classList: { add() {}, remove() {} },
                    appendChild() {},
                };
            },
            getElementById() { return null; },
            addEventListener() {},
        },
        Image: class { constructor() { this.onload = null; } },
    };
    context.window = context;
    context.global = context;
    context.globalThis = context;

    vm.createContext(context);
    for (const file of ['engine.js', 'renderer.js']) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }

    // Classic-script `class` bindings are global-lexical; pull them out explicitly.
    const RoadblocksGame = vm.runInContext('RoadblocksGame', context);
    const BoardRenderer = context.BoardRenderer;

    return { context, timeouts, container, RoadblocksGame, BoardRenderer };
}

async function main() {
    // --- setPlayerCell resolves interrupted tweenPath ---
    {
        const { BoardRenderer, container } = loadScripts();
        const renderer = new BoardRenderer(container, { cellSize: 20, gap: 2 });
        renderer.setGrid([
            [0, 0, 0],
            [2, 0, 3],
            [0, 0, 0],
        ]);

        let resolved = null;
        const p = renderer.tweenPath([
            { target: { r: 1, c: 1 }, distance: 1, status: 'stop' },
        ]);
        p.then((status) => { resolved = status; });

        assert.ok(renderer.tweenResolve, 'tweenPath should stash resolve');
        renderer.setPlayerCell(1, 0);
        assert.equal(renderer.tweenResolve, null);
        await Promise.resolve();
        assert.equal(resolved, 'stop');
    }

    // --- pending win advance cleared on goToLevel ---
    {
        const { context, timeouts, container, RoadblocksGame } = loadScripts();
        const game = new RoadblocksGame(container, { cellSize: 20, gap: 2 });
        const levels = [
            [[2, 0, 3]],
            [[2, 0, 3]],
            [[2, 0, 3]],
        ];
        game.loadLevels(levels);
        assert.equal(game.currentLevel, 0);

        const next = game.currentLevel + 1;
        game._clearAdvanceTimeout();
        game._advanceTimeout = context.setTimeout(() => {
            game._advanceTimeout = null;
            game._loadLevel(next);
        }, 1000);

        game.goToLevel(2);
        assert.equal(game.currentLevel, 2);
        assert.equal(game._advanceTimeout, null, 'goToLevel clears pending advance');

        const pendingIds = [...timeouts.entries()]
            .filter(([, t]) => !t.cleared)
            .map(([id]) => id);
        assert.equal(pendingIds.length, 0);

        const before = game.currentLevel;
        game._loadLevel(99);
        assert.equal(game.currentLevel, before);
    }

    const engineSrc = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
    assert.match(engineSrc, /const next = this\.currentLevel \+ 1/);
    assert.match(engineSrc, /_clearAdvanceTimeout/);

    const rendererSrc = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
    assert.match(rendererSrc, /if \(pending\) pending\('stop'\)/);

    console.log('ok - roadblocks level switch guards');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
