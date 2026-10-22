/**
 * Regression checks for nicBox Checkers move-lock and no-move terminal.
 * Run: node docs/forFun/nicBox/test_checkers_fixes.js
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
        appendChild() {},
        classList: { add() {}, remove() {} },
    });
    return {
        getElementById(id) {
            if (!els.has(id)) els.set(id, makeEl());
            return els.get(id);
        },
        createElement() {
            return makeEl();
        },
    };
}

function makeCheckersContext() {
    let actionHandler = null;
    const gameStateUpdates = [];
    const winners = [];

    const ctx = {
        console,
        document: makeDomStub(),
        setTimeout(fn) {
            // Run turn advances synchronously in tests when requested via flush.
            ctx.__timeouts.push(fn);
            return ctx.__timeouts.length;
        },
        clearTimeout() {},
        __timeouts: [],
        flushTimeouts() {
            const q = ctx.__timeouts.splice(0);
            q.forEach((fn) => fn());
        },
        updateGameState(room, updates) {
            gameStateUpdates.push({ room, updates });
        },
        getRoomRef() {
            return {
                child() {
                    return {
                        on(event, handler) {
                            if (event === 'child_added') actionHandler = handler;
                        },
                        off() {},
                    };
                },
            };
        },
        updateScoreDisplay() {},
        renderScoreboard() {},
        endGame() {},
        __getActionHandler() {
            return actionHandler;
        },
        __gameStateUpdates: gameStateUpdates,
        __winners: winners,
    };

    vm.createContext(ctx);
    loadScript('games/checkers.js', ctx, ['CheckersGame']);

    // Wrap declareWinner to observe terminal outcomes without waiting on timers.
    const Proto = ctx.CheckersGame.prototype;
    const originalDeclare = Proto.declareWinner;
    Proto.declareWinner = function declareWinner(playerIndex) {
        winners.push(playerIndex);
        return originalDeclare.call(this, playerIndex);
    };

    return ctx;
}

function testDoubleSubmitDoesNotDeletePieceOrDoubleScore() {
    const ctx = makeCheckersContext();
    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
        p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 },
    };

    const game = new ctx.CheckersGame('ROOM', players, { innerHTML: '' });
    const handler = ctx.__getActionHandler();
    assert.ok(handler, 'move listener must be attached');

    // Craft a capture for red (player 0): black piece at (4,3), red at (5,2), empty (3,4).
    // Keep a second black piece so this capture alone does not trigger win scoring.
    game.board = Array(8).fill(null).map(() => Array(8).fill(0));
    game.board[5][2] = 1; // red
    game.board[4][3] = 2; // black (to capture)
    game.board[0][1] = 2; // surviving black piece
    game.currentTurnIndex = 0;
    game.movePending = false;
    game.availableMoves = [{
        fromRow: 5, fromCol: 2,
        toRow: 3, toCol: 4,
        captureRow: 4, captureCol: 3,
        capture: true,
    }];

    const action = {
        val() {
            return {
                playerId: 'p1',
                action: { type: 'checkers_move', moveIndex: 0 },
            };
        },
    };

    // Double-tap: two child_added events before turn advances
    handler(action);
    handler(action);

    assert.strictEqual(game.board[5][2], 0, 'source square emptied once');
    assert.strictEqual(game.board[3][4], 1, 'piece remains on destination');
    assert.strictEqual(game.board[4][3], 0, 'captured piece removed');
    assert.strictEqual(players.p1.score, 10, 'capture scored only once');
    assert.strictEqual(game.movePending, true, 'turn remains locked until setTurn');
    console.log('ok double-submit does not delete piece or double-score');
}

function testNoLegalMovesDeclaresOpponentWinner() {
    const ctx = makeCheckersContext();
    const players = {
        p1: { name: 'Ada', avatar: 'A', color: '#f00', score: 0 },
        p2: { name: 'Bob', avatar: 'B', color: '#0f0', score: 0 },
    };

    const game = new ctx.CheckersGame('ROOM', players, { innerHTML: '' });

    // Empty board for red's turn → no legal moves → black (index 1) wins
    game.board = Array(8).fill(null).map(() => Array(8).fill(0));
    game.board[0][1] = 2; // keep a black piece so checkWin alone wouldn't fire first
    ctx.__winners.length = 0;
    game.setTurn(0);

    assert.deepStrictEqual(ctx.__winners, [1], 'opponent wins when current player has no moves');
    console.log('ok no legal moves declares opponent winner');
}

function main() {
    testDoubleSubmitDoesNotDeletePieceOrDoubleScore();
    testNoLegalMovesDeclaresOpponentWinner();
    console.log('All checkers critical fix tests passed.');
}

main();
