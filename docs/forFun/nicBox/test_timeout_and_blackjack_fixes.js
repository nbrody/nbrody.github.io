/**
 * Regression checks for nicBox:
 * - pending setTimeouts cancelled on cleanup (no post-lobby Firebase/DOM writes)
 * - Blackjack double Hit/Stand cannot skip players or mutate finished hands
 * - Draw & Guess does not publish the secret word on shared gameState
 *
 * Run: node docs/forFun/nicBox/test_timeout_and_blackjack_fixes.js
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
        offsetHeight: 0,
        appendChild() {},
        classList: { add() {}, remove() {} },
        getContext() {
            return {
                fillStyle: '',
                lineCap: '',
                lineJoin: '',
                fillRect() {},
                beginPath() {},
                moveTo() {},
                lineTo() {},
                stroke() {},
            };
        },
    });
    return {
        head: { appendChild() {} },
        createElement() {
            return makeEl();
        },
        getElementById(id) {
            if (!els.has(id)) els.set(id, makeEl());
            return els.get(id);
        },
    };
}

function makeTimeoutHarness(ctx) {
    let nextId = 1;
    const timers = new Map();
    ctx.setTimeout = (fn) => {
        const id = nextId++;
        timers.set(id, fn);
        return id;
    };
    ctx.clearTimeout = (id) => {
        timers.delete(id);
    };
    ctx.setInterval = () => nextId++;
    ctx.clearInterval = () => {};
    ctx.__flushTimeouts = () => {
        const queued = [...timers.entries()];
        timers.clear();
        for (const [, fn] of queued) fn();
    };
    ctx.__pendingTimeoutCount = () => timers.size;
}

function makeSharedStubs(ctx) {
    const gameStateUpdates = [];
    const removedPaths = [];
    const setPaths = [];
    let actionHandler = null;

    ctx.console = console;
    ctx.document = makeDomStub();
    makeTimeoutHarness(ctx);

    ctx.updateGameState = (room, updates) => {
        gameStateUpdates.push({ room, updates: { ...updates } });
    };
    ctx.updateScoreDisplay = () => {};
    ctx.renderScoreboard = () => {};
    ctx.endGame = () => {
        ctx.__endGameCalls = (ctx.__endGameCalls || 0) + 1;
    };
    ctx.escapeHtml = (s) => String(s);
    ctx.getRoomRef = () => ({
        child(pathName) {
            return {
                on(event, handler) {
                    if (event === 'child_added') actionHandler = handler;
                },
                off() {},
                remove() {
                    removedPaths.push(pathName);
                },
                set(value) {
                    setPaths.push({ path: pathName, value });
                },
            };
        },
    });

    ctx.__gameStateUpdates = gameStateUpdates;
    ctx.__removedPaths = removedPaths;
    ctx.__setPaths = setPaths;
    ctx.__getActionHandler = () => actionHandler;
}

function testWarCleanupCancelsNextRound() {
    const ctx = {};
    makeSharedStubs(ctx);
    vm.createContext(ctx);
    loadScript('games/war.js', ctx, ['WarGame']);

    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
        p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 },
    };
    const game = new ctx.WarGame('ROOM', players, { innerHTML: '' });
    const before = ctx.__gameStateUpdates.length;

    // Simulate inter-round delay then leave mid-delay.
    game.schedule(() => game.startRound(), 3000);
    assert.ok(ctx.__pendingTimeoutCount() >= 1, 'pending next-round timeout');
    game.cleanup();
    assert.strictEqual(ctx.__pendingTimeoutCount(), 0, 'cleanup clears timeouts');
    ctx.__flushTimeouts();
    assert.strictEqual(
        ctx.__gameStateUpdates.length,
        before,
        'cleaned-up War must not publish a new round'
    );
    assert.strictEqual(game.dead, true);
}

function testTriviaCleanupCancelsNextQuestion() {
    const ctx = {};
    makeSharedStubs(ctx);
    vm.createContext(ctx);
    loadScript('games/trivia.js', ctx, ['TriviaGame']);

    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
    };
    const game = new ctx.TriviaGame('ROOM', players, { innerHTML: '' });
    const before = ctx.__gameStateUpdates.length;

    game.schedule(() => {
        game.currentQuestionIndex++;
        game.showQuestion();
    }, 4000);
    game.cleanup();
    ctx.__flushTimeouts();
    assert.strictEqual(
        ctx.__gameStateUpdates.length,
        before,
        'cleaned-up Trivia must not advance questions'
    );
}

function testDrawGuessCleanupCancelsAndClearsSecret() {
    const ctx = {};
    makeSharedStubs(ctx);
    vm.createContext(ctx);
    loadScript('games/drawguess.js', ctx, ['DrawGuessGame']);

    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
        p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 },
    };
    const game = new ctx.DrawGuessGame('ROOM', players, { innerHTML: '' });
    const before = ctx.__gameStateUpdates.length;

    game.schedule(() => game.startRound(), 4000);
    game.cleanup();
    ctx.__flushTimeouts();
    assert.strictEqual(
        ctx.__gameStateUpdates.length,
        before,
        'cleaned-up DrawGuess must not start another round'
    );
    assert.ok(
        ctx.__removedPaths.includes('drawerSecret'),
        'cleanup must remove drawerSecret'
    );
}

function testDrawGuessDoesNotPublishWordInGameState() {
    const ctx = {};
    makeSharedStubs(ctx);
    vm.createContext(ctx);
    loadScript('games/drawguess.js', ctx, ['DrawGuessGame']);

    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
        p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 },
    };
    new ctx.DrawGuessGame('ROOM', players, { innerHTML: '' });

    assert.ok(ctx.__gameStateUpdates.length > 0, 'round publishes gameState');
    for (const { updates } of ctx.__gameStateUpdates) {
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(updates, 'word'),
            false,
            'shared gameState must not include secret word'
        );
    }

    const secretWrites = ctx.__setPaths.filter((e) => e.path === 'drawerSecret');
    assert.ok(secretWrites.length >= 1, 'secret published on drawerSecret path');
    assert.ok(secretWrites[0].value.word, 'drawerSecret carries the word');
    assert.strictEqual(secretWrites[0].value.drawerId, 'p1');
}

function testBlackjackHitStandRaceDoesNotSkipPlayer() {
    const ctx = {};
    makeSharedStubs(ctx);
    vm.createContext(ctx);
    loadScript('games/blackjack.js', ctx, ['BlackjackGame']);

    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
        p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 },
    };
    const game = new ctx.BlackjackGame('ROOM', players, { innerHTML: '' });
    const handler = ctx.__getActionHandler();
    assert.ok(handler, 'action listener attached');

    // Force a non-busting first hit path that still leaves room for a stand race:
    // give p1 10+10, shoe next card is 5 => 25 bust with delayed advance.
    game.playerHands.p1.cards = [
        { rank: '10', suit: '♠' },
        { rank: '10', suit: '♥' },
    ];
    game.playerHands.p2.cards = [
        { rank: '9', suit: '♠' },
        { rank: '8', suit: '♥' },
    ];
    game.shoe = [{ rank: '5', suit: '♦' }, { rank: '2', suit: '♣' }];
    game.currentPlayerTurnIndex = 0;
    game.phase = 'playerTurn';
    game.actionPending = false;

    handler({ val: () => ({ playerId: 'p1', action: { type: 'blackjack_hit' } }) });
    // Simultaneous stand (two-finger race) must be ignored after hit locks the turn.
    handler({ val: () => ({ playerId: 'p1', action: { type: 'blackjack_stand' } }) });

    assert.strictEqual(game.playerHands.p1.busted, true, 'first hit busts');
    assert.strictEqual(game.playerHands.p1.cards.length, 3, 'only one extra card dealt');
    assert.strictEqual(game.currentPlayerTurnIndex, 0, 'turn not advanced yet');

    ctx.__flushTimeouts();
    assert.strictEqual(
        game.currentPlayerTurnIndex,
        1,
        'exactly one advance after bust delay — p2 not skipped'
    );
    assert.strictEqual(game.phase, 'playerTurn');
    assert.strictEqual(
        ctx.__gameStateUpdates.filter((u) => u.updates.activePlayer === 'p2').length > 0,
        true,
        'p2 eventually prompted'
    );
}

function testBlackjackDoubleHitOnBustedHandIgnored() {
    const ctx = {};
    makeSharedStubs(ctx);
    vm.createContext(ctx);
    loadScript('games/blackjack.js', ctx, ['BlackjackGame']);

    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
    };
    const game = new ctx.BlackjackGame('ROOM', players, { innerHTML: '' });
    const handler = ctx.__getActionHandler();

    game.playerHands.p1.cards = [
        { rank: '10', suit: '♠' },
        { rank: '9', suit: '♥' },
    ];
    game.shoe = [{ rank: '5', suit: '♦' }, { rank: '3', suit: '♣' }];
    game.currentPlayerTurnIndex = 0;
    game.phase = 'playerTurn';
    game.actionPending = false;

    handler({ val: () => ({ playerId: 'p1', action: { type: 'blackjack_hit' } }) });
    handler({ val: () => ({ playerId: 'p1', action: { type: 'blackjack_hit' } }) });

    assert.strictEqual(game.playerHands.p1.cards.length, 3, 'second hit rejected');
    assert.strictEqual(game.playerHands.p1.busted, true);
}

function main() {
    testWarCleanupCancelsNextRound();
    testTriviaCleanupCancelsNextQuestion();
    testDrawGuessCleanupCancelsAndClearsSecret();
    testDrawGuessDoesNotPublishWordInGameState();
    testBlackjackHitStandRaceDoesNotSkipPlayer();
    testBlackjackDoubleHitOnBustedHandIgnored();
    console.log('All nicBox timeout/blackjack/drawguess regressions passed.');
}

main();
