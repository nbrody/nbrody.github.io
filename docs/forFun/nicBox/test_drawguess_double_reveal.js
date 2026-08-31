#!/usr/bin/env node
/**
 * Regression: DrawGuess timer expiry + late correct guess must not
 * double-score or double-advance the round index.
 *
 * Run: node docs/forFun/nicBox/test_drawguess_double_reveal.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function loadScript(relPath, sandbox, exportNames = []) {
    const full = path.join(__dirname, relPath);
    const code = fs.readFileSync(full, 'utf8');
    const exportSuffix = exportNames.map((name) => `this.${name} = ${name};`).join('\n');
    vm.runInContext(`${code}\n${exportSuffix}`, sandbox, { filename: full });
}

function makeDomStub() {
    const makeEl = () => ({
        textContent: '',
        innerHTML: '',
        style: { cssText: '' },
        className: '',
        appendChild() {},
        classList: { add() {}, remove() {} },
        getContext() {
            return {
                fillStyle: '',
                lineCap: '',
                lineJoin: '',
                strokeStyle: '',
                lineWidth: 0,
                fillRect() {},
                beginPath() {},
                moveTo() {},
                lineTo() {},
                stroke() {},
            };
        },
        width: 700,
        height: 500,
    });
    return {
        createElement() { return makeEl(); },
        getElementById() { return makeEl(); },
        head: { appendChild() {} },
    };
}

function makeTimeoutHarness(ctx) {
    let nextId = 1;
    let now = 0;
    const timers = new Map();

    ctx.setTimeout = (fn, ms = 0) => {
        const id = nextId++;
        timers.set(id, { fn, due: now + ms, interval: false });
        return id;
    };
    ctx.clearTimeout = (id) => { timers.delete(id); };
    ctx.setInterval = (fn, ms = 0) => {
        const id = nextId++;
        const tick = () => {
            if (!timers.has(id)) return;
            fn();
            if (timers.has(id)) {
                timers.set(id, { fn: tick, due: now + ms, interval: true });
            }
        };
        timers.set(id, { fn: tick, due: now + ms, interval: true });
        return id;
    };
    ctx.clearInterval = (id) => { timers.delete(id); };
    ctx.__flushUntil = (target) => {
        while (true) {
            let next = null;
            for (const [id, t] of timers) {
                if (t.due <= target && (!next || t.due < next.due)) next = { id, ...t };
            }
            if (!next) {
                now = target;
                return;
            }
            now = next.due;
            timers.delete(next.id);
            next.fn();
        }
    };
    ctx.__pendingNonIntervalCount = () =>
        [...timers.values()].filter((t) => !t.interval).length;
    ctx.__clearAllTimers = () => { timers.clear(); };
}

function makeSandbox() {
    const sandbox = {
        console,
        Date,
        Math,
        document: makeDomStub(),
        updateGameState() {},
        updateScoreDisplay() {},
        renderScoreboard() {},
        endGame() {},
        escapeHtml(str) { return String(str); },
        getRoomRef() {
            return {
                child() {
                    return { on() {}, off() {}, remove() {}, set() {} };
                },
            };
        },
    };
    makeTimeoutHarness(sandbox);
    vm.createContext(sandbox);
    loadScript('games/drawguess.js', sandbox, ['DrawGuessGame']);
    return sandbox;
}

// ── Timer reveal then late correct guess must not re-score / double-advance ──
{
    const ctx = makeSandbox();
    const { DrawGuessGame } = ctx;
    const players = {
        drawer: { name: 'Drawer', color: '#f00', avatar: 'D', score: 0 },
        guesser: { name: 'Guesser', color: '#0f0', avatar: 'G', score: 0 },
    };
    const game = new DrawGuessGame('ROOM', players, { innerHTML: '' });
    ctx.__clearAllTimers();

    game.playerIds = ['drawer', 'guesser'];
    game.currentDrawerIndex = 0;
    game.currentWord = 'cat';
    game.round = 1;
    game.totalRounds = 4;
    game.timeLeft = 0;
    game.guessedPlayers = {};
    game.revealed = false;
    game.advanceTimeout = null;
    game.timer = null;

    // Timer expiry path
    game.revealWord();
    assert.strictEqual(game.revealed, true);
    assert.strictEqual(ctx.__pendingNonIntervalCount(), 1, 'exactly one advance timeout');

    // Guesser types the publicly revealed word during the 4s window
    game.handleGuess('guesser', 'cat');

    assert.strictEqual(players.guesser.score, 0, 'late guess must not award guesser points');
    assert.strictEqual(players.drawer.score, 0, 'late guess must not award drawer points');
    assert.strictEqual(ctx.__pendingNonIntervalCount(), 1, 'must not schedule a second advance');

    const roundBefore = game.round;
    ctx.__flushUntil(5000);
    assert.strictEqual(
        game.round,
        roundBefore + 1,
        'round must advance exactly once after reveal window'
    );
    console.log('ok: late guess after timer reveal does not double-score or double-advance');
}

// ── Direct double revealWord() is a no-op on the second call ──
{
    const ctx = makeSandbox();
    const { DrawGuessGame } = ctx;
    const players = {
        drawer: { name: 'Drawer', color: '#f00', avatar: 'D', score: 0 },
        guesser: { name: 'Guesser', color: '#0f0', avatar: 'G', score: 0 },
    };
    const game = new DrawGuessGame('ROOM2', players, { innerHTML: '' });
    ctx.__clearAllTimers();

    game.playerIds = ['drawer', 'guesser'];
    game.currentDrawerIndex = 0;
    game.currentWord = 'dog';
    game.round = 2;
    game.totalRounds = 4;
    game.guessedPlayers = { guesser: true };
    game.revealed = false;
    game.advanceTimeout = null;

    game.revealWord();
    game.revealWord();

    assert.strictEqual(ctx.__pendingNonIntervalCount(), 1, 'double revealWord schedules one advance');
    console.log('ok: double revealWord() is idempotent');
}

// ── All-guessed path still reveals and scores once ──
{
    const ctx = makeSandbox();
    const { DrawGuessGame } = ctx;
    const players = {
        drawer: { name: 'Drawer', color: '#f00', avatar: 'D', score: 0 },
        guesser: { name: 'Guesser', color: '#0f0', avatar: 'G', score: 0 },
    };
    const game = new DrawGuessGame('ROOM3', players, { innerHTML: '' });
    ctx.__clearAllTimers();

    game.playerIds = ['drawer', 'guesser'];
    game.currentDrawerIndex = 0;
    game.currentWord = 'sun';
    game.round = 1;
    game.totalRounds = 4;
    game.timeLeft = 40;
    game.guessedPlayers = {};
    game.revealed = false;
    game.advanceTimeout = null;
    game.timer = ctx.setInterval(() => {}, 1000);

    game.handleGuess('guesser', 'sun');

    assert.strictEqual(game.revealed, true);
    assert.strictEqual(players.guesser.score, 80, 'guesser scores timeLeft*2');
    assert.strictEqual(players.drawer.score, 5, 'drawer gets +5');
    assert.strictEqual(game.timer, null, 'drawing timer cleared on all-guessed reveal');

    // Timer expiry after all-guessed must be a no-op
    game.revealWord();
    assert.strictEqual(players.guesser.score, 80);
    assert.strictEqual(ctx.__pendingNonIntervalCount(), 1);
    console.log('ok: all-guessed reveal scores once; subsequent revealWord ignored');
}

console.log('All DrawGuess double-reveal regression tests passed.');
