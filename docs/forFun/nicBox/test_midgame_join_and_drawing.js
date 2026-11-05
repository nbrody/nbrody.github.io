/**
 * Regression: nicBox mid-game join crash, DrawGuess stroke key order,
 * and Trivia late-answer wrong-question scoring.
 *
 * Run: node docs/forFun/nicBox/test_midgame_join_and_drawing.js
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
        .map((name) => `this.${name} = (typeof ${name} !== 'undefined') ? ${name} : this.${name};`)
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
        classList: { add() {}, remove() {}, contains() { return false; } },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        appendChild() {},
        scrollTop: 0,
        scrollHeight: 0,
        getContext() {
            return {
                fillStyle: '',
                strokeStyle: '',
                lineWidth: 1,
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
        createElement() { return makeEl(); },
        querySelectorAll() { return []; },
        getElementById(id) {
            if (!els.has(id)) els.set(id, makeEl());
            return els.get(id);
        },
        addEventListener() {},
    };
}

function makeTriviaHarness() {
    const ctx = {};
    vm.createContext(ctx);

    const actionHandlers = [];
    const scoreUpdates = [];
    const timeouts = new Map();
    let nextTid = 1;

    ctx.console = console;
    ctx.document = makeDomStub();
    ctx.setTimeout = (fn, ms) => {
        const id = nextTid++;
        timeouts.set(id, { fn, ms });
        return id;
    };
    ctx.clearTimeout = (id) => { timeouts.delete(id); };
    ctx.clearInterval = () => {};
    ctx.setInterval = () => 1;
    ctx.escapeHtml = (s) => String(s);
    ctx.renderScoreboard = () => {};
    ctx.updateScoreDisplay = (playerId, score) => {
        scoreUpdates.push({ playerId, score });
    };
    ctx.endGame = () => {};
    ctx.updateGameState = () => {};
    ctx.getRoomRef = () => ({
        child() {
            return {
                on(event, handler) {
                    if (event === 'child_added') actionHandlers.push(handler);
                },
                off() {},
                remove() {},
                set() {},
            };
        },
    });

    loadScript('games/trivia.js', ctx, ['TriviaGame']);

    ctx.__actionHandlers = actionHandlers;
    ctx.__scoreUpdates = scoreUpdates;
    ctx.__flushTimeouts = () => {
        const pending = [...timeouts.values()];
        timeouts.clear();
        pending.forEach((t) => t.fn());
    };
    ctx.__fireAnswer = (playerId, answer, questionIndex, timestamp = Date.now()) => {
        const action = { type: 'trivia_answer', answer, timestamp };
        if (questionIndex !== undefined) action.questionIndex = questionIndex;
        for (const h of actionHandlers.slice()) {
            h({ val: () => ({ playerId, action }) });
        }
    };
    return ctx;
}

function makeDrawGuessHarness() {
    const ctx = {};
    vm.createContext(ctx);

    const actionHandlers = [];
    const drawingHandlers = [];
    const scoreUpdates = [];
    let strokePaths = [];

    ctx.console = console;
    ctx.document = makeDomStub();
    // Capture polyline path order from moveTo/lineTo
    const canvasEl = ctx.document.getElementById('dg-canvas');
    const realCtx = canvasEl.getContext('2d');
    canvasEl.width = 700;
    canvasEl.height = 500;
    canvasEl.getContext = () => ({
        ...realCtx,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect() {},
        beginPath() { strokePaths.push([]); },
        moveTo(x, y) {
            const path = strokePaths[strokePaths.length - 1] || (strokePaths.push([]), strokePaths[strokePaths.length - 1]);
            path.push([Math.round(x), Math.round(y)]);
        },
        lineTo(x, y) {
            const path = strokePaths[strokePaths.length - 1];
            path.push([Math.round(x), Math.round(y)]);
        },
        stroke() {},
    });

    ctx.setTimeout = (fn) => { fn(); return 1; };
    ctx.clearTimeout = () => {};
    ctx.clearInterval = () => {};
    ctx.setInterval = () => 1;
    ctx.escapeHtml = (s) => String(s);
    ctx.renderScoreboard = () => {};
    ctx.updateScoreDisplay = (playerId, score) => {
        scoreUpdates.push({ playerId, score });
    };
    ctx.endGame = () => {};
    ctx.updateGameState = () => {};
    ctx.getRoomRef = () => ({
        child(path) {
            return {
                on(event, handler) {
                    if (path === 'gameState/drawing' && event === 'value') drawingHandlers.push(handler);
                    if (path === 'gameState/actions' && event === 'child_added') actionHandlers.push(handler);
                },
                off() {},
                remove() {},
                set() {},
            };
        },
    });

    loadScript('games/drawguess.js', ctx, ['DrawGuessGame', 'orderedFirebaseValues']);

    ctx.__actionHandlers = actionHandlers;
    ctx.__drawingHandlers = drawingHandlers;
    ctx.__scoreUpdates = scoreUpdates;
    ctx.__getStrokePaths = () => strokePaths;
    ctx.__resetStrokePaths = () => { strokePaths = []; };
    ctx.__fireGuess = (playerId, guess) => {
        for (const h of actionHandlers.slice()) {
            h({ val: () => ({ playerId, action: { type: 'draw_guess', guess } }) });
        }
    };
    ctx.__fireDrawing = (data) => {
        for (const h of drawingHandlers.slice()) {
            h({ val: () => data });
        }
    };
    return ctx;
}

function makeJoinRoomHarness() {
    const ctx = {};
    vm.createContext(ctx);

    let roomData = null;
    const transactions = [];

    const ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };

    function database() {
        return {
            ref(path) {
                if (path === undefined || path === '') {
                    return {
                        child() {
                            return { push: () => ({ key: 'pid_' + Math.random().toString(36).slice(2, 8) }) };
                        },
                    };
                }
                return {
                    transaction: async (fn) => {
                        const before = roomData === null ? null : JSON.parse(JSON.stringify(roomData));
                        const working = before === null
                            ? null
                            : { ...before, players: { ...(before.players || {}) } };
                        const next = fn(working);
                        transactions.push({ before, next, abort: next === undefined });
                        if (next === undefined) {
                            return { committed: false, snapshot: { exists: () => !!roomData, val: () => roomData } };
                        }
                        roomData = next;
                        return {
                            committed: true,
                            snapshot: {
                                exists: () => true,
                                val: () => roomData,
                            },
                        };
                    },
                    once: async () => ({ exists: () => false, val: () => null }),
                    set: async (v) => { roomData = v; },
                    update: async () => {},
                    on() {},
                    child() { return this; },
                };
            },
        };
    }
    database.ServerValue = ServerValue;

    ctx.console = console;
    ctx.firebase = {
        initializeApp() {},
        database,
    };

    loadScript('js/firebase-config.js', ctx, ['joinRoom', 'createRoom', 'generateRoomCode']);

    ctx.__setRoom = (room) => { roomData = room; };
    ctx.__getRoom = () => roomData;
    ctx.__transactions = transactions;
    return ctx;
}

// ─── Tests ─────────────────────────────────────────────────

function testOrderedFirebaseValues() {
    const ctx = makeDrawGuessHarness();
    // Simulate Firebase JSON lexicographic order
    const scrambled = JSON.parse('{"p0":{"x":0},"p1":{"x":1},"p10":{"x":10},"p11":{"x":11},"p2":{"x":2}}');
    const ordered = Array.from(ctx.orderedFirebaseValues(scrambled), (p) => p.x);
    assert.deepStrictEqual(ordered, [0, 1, 2, 10, 11], 'points must sort by numeric suffix');

    const strokes = JSON.parse('{"s0":0,"s1":1,"s10":10,"s2":2}');
    assert.deepStrictEqual(Array.from(ctx.orderedFirebaseValues(strokes)), [0, 1, 2, 10]);
    console.log('ok  orderedFirebaseValues sorts Firebase p*/s* keys');
}

function testDrawGuessStrokeRedrawOrder() {
    const ctx = makeDrawGuessHarness();
    const players = {
        drawer: { name: 'D', avatar: '🎨', color: '#f00', score: 0 },
        guesser: { name: 'G', avatar: '🤔', color: '#0f0', score: 0 },
    };
    // Construct so listenForDrawing attaches; startRound also runs.
    new ctx.DrawGuessGame('ROOM', players, ctx.document.getElementById('game-area'));
    ctx.__resetStrokePaths();

    // Build points in lex order like Firebase JSON would emit.
    const points = {};
    const idxs = [0, 1, 10, 11, 2, 3, 4, 5, 6, 7, 8, 9];
    for (const i of idxs) {
        points[`p${i}`] = { x: i / 100, y: 0.5 };
    }
    ctx.__fireDrawing({ strokes: { s0: { color: '#000', width: 4, points } } });

    const paths = ctx.__getStrokePaths();
    assert.ok(paths.length >= 1, 'expected at least one stroke path');
    const xs = Array.from(paths[paths.length - 1], ([x]) => x);
    // canvas width 700 → x = (i/100)*700 = i*7
    const expected = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => i * 7);
    assert.deepStrictEqual(xs, expected, 'polyline vertices must follow draw order, not lex key order');
    console.log('ok  DrawGuess redraws strokes in numeric point order');
}

function testMidGameJoinRejected() {
    const ctx = makeJoinRoomHarness();
    ctx.__setRoom({
        code: 'ABCD',
        state: 'playing',
        host: 'host1',
        players: { host1: { name: 'Host', isHost: true, score: 0, connected: true } },
        game: 'drawguess',
        gameState: {},
    });

    return ctx.joinRoom('ABCD', 'Late', '😎').then(
        () => { throw new Error('expected joinRoom to reject mid-game'); },
        (err) => {
            assert.match(String(err.message), /in progress/i);
            assert.strictEqual(Object.keys(ctx.__getRoom().players).length, 1, 'must not add joiner');
            console.log('ok  joinRoom rejects state=playing');
        }
    );
}

function testMidGameJoinLobbyAllowed() {
    const ctx = makeJoinRoomHarness();
    ctx.__setRoom({
        code: 'ABCD',
        state: 'lobby',
        host: 'host1',
        players: { host1: { name: 'Host', isHost: true, score: 0, connected: true } },
        game: null,
        gameState: {},
    });

    return ctx.joinRoom('ABCD', 'Guest', '😎').then((result) => {
        assert.ok(result.playerId);
        assert.strictEqual(result.isHost, false);
        assert.strictEqual(Object.keys(ctx.__getRoom().players).length, 2);
        console.log('ok  joinRoom allows state=lobby');
    });
}

function testDrawGuessUnknownPlayerNoCrash() {
    const ctx = makeDrawGuessHarness();
    const players = {
        drawer: { name: 'D', avatar: '🎨', color: '#f00', score: 0 },
        guesser: { name: 'G', avatar: '🤔', color: '#0f0', score: 0 },
    };
    // Game already constructed by harness? Need explicit construct — loadScript
    // only defined the class. Construct now.
    const game = new ctx.DrawGuessGame('ROOM', players, ctx.document.getElementById('game-area'));
    // Force a known word so a correct guess from unknown id would score if unguarded
    game.currentWord = 'cat';
    game.timeLeft = 30;
    game.currentDrawerIndex = 0; // drawer

    assert.doesNotThrow(() => ctx.__fireGuess('midgame_joiner', 'cat'));
    assert.strictEqual(ctx.__scoreUpdates.length, 0, 'unknown player must not score');
    assert.strictEqual(players.drawer.score, 0);
    assert.strictEqual(players.guesser.score, 0);
    console.log('ok  DrawGuess ignores unknown playerId without crashing');
}

function testTriviaLateAnswerWrongQuestion() {
    const ctx = makeTriviaHarness();
    const players = {
        p1: { name: 'A', avatar: '😀', color: '#f00', score: 0 },
        p2: { name: 'B', avatar: '😎', color: '#0f0', score: 0 },
    };
    const game = new ctx.TriviaGame('ROOM', players, ctx.document.getElementById('game-area'));
    // Pin questions so scoring is deterministic
    game.questions = [
        { category: 'T', question: 'Q0', answers: ['a', 'b', 'c', 'd'], correct: 1 },
        { category: 'T', question: 'Q1', answers: ['a', 'b', 'c', 'd'], correct: 2 },
    ];
    game.totalQuestions = 2;
    game.currentQuestionIndex = 0;
    game.answers = {};
    game.revealed = false;

    // p1 answers Q0 correctly
    ctx.__fireAnswer('p1', 1, 0, 1000);
    assert.ok(game.answers.p1);

    // Reveal Q0 (scores p1)
    game.revealAnswer();
    assert.strictEqual(players.p1.score, 100);
    assert.strictEqual(game.revealed, true);

    // Late answer for Q0 during reveal window — must be ignored (revealed latch)
    ctx.__fireAnswer('p2', 1, 0, 2000);
    assert.strictEqual(players.p2.score, 0, 'late Q0 answer must not score after reveal');

    // Advance to Q1 (simulate the 4s timeout body without re-running reveal)
    game.currentQuestionIndex = 1;
    game.answers = {};
    game.revealed = false;

    // Stale action tagged for Q0 must not bind to Q1
    ctx.__fireAnswer('p2', 2, 0, 3000);
    assert.strictEqual(game.answers.p2, undefined, 'Q0-tagged answer must not enter Q1 answers');

    // Proper Q1 answer still works
    ctx.__fireAnswer('p2', 2, 1, 4000);
    assert.ok(game.answers.p2);
    game.revealAnswer();
    assert.strictEqual(players.p2.score, 100);
    console.log('ok  Trivia ignores cross-question / post-reveal answers');
}

function testTriviaUnknownPlayerNoCrash() {
    const ctx = makeTriviaHarness();
    const players = {
        p1: { name: 'A', avatar: '😀', color: '#f00', score: 0 },
    };
    const game = new ctx.TriviaGame('ROOM', players, ctx.document.getElementById('game-area'));
    game.questions = [
        { category: 'T', question: 'Q0', answers: ['a', 'b', 'c', 'd'], correct: 0 },
    ];
    game.totalQuestions = 1;
    game.currentQuestionIndex = 0;
    game.answers = {};
    game.revealed = false;

    assert.doesNotThrow(() => ctx.__fireAnswer('stranger', 0, 0, 1));
    assert.strictEqual(game.answers.stranger, undefined);
    game.revealAnswer();
    assert.strictEqual(ctx.__scoreUpdates.length, 0);
    console.log('ok  Trivia ignores unknown playerId without crashing');
}

async function main() {
    testOrderedFirebaseValues();
    testDrawGuessStrokeRedrawOrder();
    await testMidGameJoinRejected();
    await testMidGameJoinLobbyAllowed();
    testDrawGuessUnknownPlayerNoCrash();
    testTriviaLateAnswerWrongQuestion();
    testTriviaUnknownPlayerNoCrash();
    console.log('\nAll mid-game / drawing / trivia regressions passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
