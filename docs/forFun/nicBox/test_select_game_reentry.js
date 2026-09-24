/**
 * Regression: overlapping selectGame() must not orphan Firebase listeners.
 *
 * Trigger: double-click a game card (or click two games) while selectGame is
 * awaiting Firebase writes. Without a latch + cleanup, each construction leaves
 * a live child_added handler that keeps scoring after currentGame is replaced.
 *
 * Run: node docs/forFun/nicBox/test_select_game_reentry.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function loadScript(relPath, sandbox, exportNames = []) {
    const full = path.join(__dirname, relPath);
    const code = fs.readFileSync(full, 'utf8');
    const exportSuffix = exportNames
        .map((name) => `this.${name} = ${name};`)
        .join('\n');
    vm.runInContext(`${code}\n${exportSuffix}`, sandbox, { filename: full });
}

function makeDomStub() {
    const els = new Map();
    const makeEl = () => ({
        textContent: '',
        innerHTML: '',
        style: {},
        className: '',
        dataset: {},
        classList: { add() {}, remove() {} },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        appendChild() {},
    });
    return {
        head: { appendChild() {} },
        createElement() { return makeEl(); },
        querySelectorAll() { return []; },
        getElementById(id) {
            if (!els.has(id)) els.set(id, makeEl());
            return els.get(id);
        },
        addEventListener() {},
    };
}

function makeSelectGameHarness() {
    const ctx = {};
    vm.createContext(ctx);

    const actionHandlers = [];
    const scoreUpdates = [];
    let gateResolvers = [];
    let gateOpen = false;

    const waitGate = () => new Promise((resolve) => {
        if (gateOpen) {
            resolve();
            return;
        }
        gateResolvers.push(resolve);
    });

    ctx.console = console;
    ctx.document = makeDomStub();
    ctx.setTimeout = (fn) => { fn(); return 1; };
    ctx.clearTimeout = () => {};
    ctx.escapeHtml = (s) => String(s);
    ctx.showScreen = () => {};
    ctx.showToast = () => {};
    ctx.renderScoreboard = () => {};
    ctx.updateScoreDisplay = (playerId, score) => {
        scoreUpdates.push({ playerId, score });
    };
    ctx.endGame = () => {};
    ctx.updateGameState = () => {};

    ctx.resetGameState = async () => { await waitGate(); };
    ctx.setRoomGame = async () => { await waitGate(); };
    ctx.setRoomState = async () => { await waitGate(); };

    ctx.getRoomRef = () => ({
        child() {
            return {
                on(event, handler) {
                    if (event === 'child_added') actionHandlers.push(handler);
                },
                off(event, handler) {
                    if (event === 'child_added') {
                        const idx = actionHandlers.indexOf(handler);
                        if (idx >= 0) actionHandlers.splice(idx, 1);
                        else {
                            // WarGame.cleanup calls ref.off(event) without the handler.
                            // Remove one matching attachment for this ref's lifetime.
                            // Since all games share this stub, clear one handler per off().
                            actionHandlers.shift();
                        }
                    }
                },
                remove() {},
                set() {},
            };
        },
    });

    // Minimal game class that attaches a listener like War/Trivia do.
    ctx.WarGame = class WarGame {
        constructor(roomCode, players) {
            this.roomCode = roomCode;
            this.players = players;
            this.listeners = [];
            this.handleCount = 0;
            const actionsRef = ctx.getRoomRef(roomCode).child('gameState/actions');
            this._handler = () => { this.handleCount++; };
            actionsRef.on('child_added', this._handler);
            this.listeners.push({ ref: actionsRef, event: 'child_added', handler: this._handler });
            ctx.__constructed.push(this);
        }
        cleanup() {
            this.listeners.forEach((l) => l.ref.off(l.event, l.handler));
            this.listeners = [];
            this.cleaned = true;
        }
    };
    ctx.TriviaGame = ctx.WarGame;
    ctx.BlackjackGame = ctx.WarGame;
    ctx.CheckersGame = ctx.WarGame;
    ctx.DrawGuessGame = ctx.WarGame;

    ctx.__constructed = [];
    ctx.__actionHandlers = actionHandlers;
    ctx.__scoreUpdates = scoreUpdates;
    ctx.__openGate = () => {
        gateOpen = true;
        const pending = gateResolvers.splice(0);
        pending.forEach((r) => r());
    };
    ctx.__closeGate = () => { gateOpen = false; };

    loadScript('js/lobby.js', ctx, [
        'selectGame',
        'currentGame',
        'currentRoom',
        'players',
        'selectingGame',
        'backToLobby',
        'endGame',
    ]);

    // Lobby script binds lets; re-export mutables via helpers after load.
    // selectGame closes over the sandbox's lets when run in-context, so set
    // room/players on the context globals the script created.
    vm.runInContext(`
        currentRoom = 'ROOM1';
        players = {
            p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
            p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 }
        };
        this.getCurrentGame = () => currentGame;
        this.getSelectingGame = () => selectingGame;
        this.selectGame = selectGame;
    `, ctx);

    return ctx;
}

async function testDoubleClickDoesNotOrphanListeners() {
    const ctx = makeSelectGameHarness();
    ctx.__closeGate();

    const first = ctx.selectGame('war');
    const second = ctx.selectGame('war');

    // Second call must bail while the first awaits Firebase.
    assert.strictEqual(ctx.getSelectingGame(), true, 'selecting latch held during await');

    ctx.__openGate();
    await Promise.all([first, second]);

    assert.strictEqual(ctx.__constructed.length, 1, 'only one game constructed');
    assert.strictEqual(ctx.__actionHandlers.length, 1, 'only one live action listener');
    assert.ok(ctx.getCurrentGame(), 'currentGame set');
    assert.strictEqual(ctx.getCurrentGame().cleaned, undefined, 'live game not cleaned');

    // A play must be handled once.
    ctx.__actionHandlers.forEach((h) => h({ val: () => ({}) }));
    assert.strictEqual(ctx.getCurrentGame().handleCount, 1, 'single handler fires once');
}

async function testCleanupBeforeReplace() {
    const ctx = makeSelectGameHarness();
    ctx.__openGate();

    await ctx.selectGame('war');
    const firstGame = ctx.getCurrentGame();
    assert.strictEqual(ctx.__actionHandlers.length, 1);

    await ctx.selectGame('trivia');
    assert.strictEqual(firstGame.cleaned, true, 'previous game cleaned up');
    assert.strictEqual(ctx.__constructed.length, 2, 'second game constructed');
    assert.strictEqual(ctx.__actionHandlers.length, 1, 'orphan listener removed');
    assert.notStrictEqual(ctx.getCurrentGame(), firstGame);
}

async function main() {
    await testDoubleClickDoesNotOrphanListeners();
    await testCleanupBeforeReplace();
    console.log('ok - selectGame re-entry guards');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
