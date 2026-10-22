#!/usr/bin/env node
/**
 * Regression: Trivia timer expiry + all-answered schedule must not
 * double-score or double-advance the question index.
 *
 * Run: node docs/forFun/nicBox/test_trivia_double_reveal.js
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
    });
    return {
        createElement() { return makeEl(); },
        getElementById() { return makeEl(); },
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
        getRoomRef() {
            return {
                child() {
                    return { on() {}, off() {}, remove() {} };
                },
            };
        },
    };
    makeTimeoutHarness(sandbox);
    vm.createContext(sandbox);
    loadScript('games/trivia.js', sandbox, ['TriviaGame']);
    return sandbox;
}

// ── Race: timer reveal then stale all-answered reveal ──
{
    const ctx = makeSandbox();
    const { TriviaGame } = ctx;
    const players = {
        p1: { name: 'Alice', color: '#f00', avatar: 'A', score: 0 },
        p2: { name: 'Bob', color: '#0f0', avatar: 'B', score: 0 },
    };
    const game = new TriviaGame('ROOM', players, { innerHTML: '' });
    ctx.__clearAllTimers();

    const mkQ = (correct) => ({
        category: 'Test',
        question: 'Q?',
        answers: ['A', 'B', 'C', 'D'],
        correct,
    });
    game.questions = [mkQ(1), mkQ(0), mkQ(2)];
    game.totalQuestions = 3;
    game.currentQuestionIndex = 0;
    game.answers = {
        p1: { answer: 1, timestamp: 1000 },
        p2: { answer: 1, timestamp: 2000 },
    };
    game.revealed = false;
    game.revealTimeout = null;
    game.advanceTimeout = null;

    game.revealAnswer();
    game.revealAnswer(); // second call must be ignored

    assert.strictEqual(players.p1.score, 100, 'p1 must score once (100)');
    assert.strictEqual(players.p2.score, 80, 'p2 must score once (80)');
    assert.strictEqual(game.revealed, true);
    assert.strictEqual(ctx.__pendingNonIntervalCount(), 1, 'exactly one advance timeout');

    const idxBefore = game.currentQuestionIndex;
    ctx.__flushUntil(5000);
    assert.strictEqual(
        game.currentQuestionIndex,
        idxBefore + 1,
        'question index must advance exactly once'
    );
    console.log('ok: double revealAnswer does not double-score or double-advance');
}

// ── All-answered timeout cancelled when timer already revealed ──
{
    const ctx = makeSandbox();
    const { TriviaGame } = ctx;
    const players = {
        p1: { name: 'Alice', color: '#f00', avatar: 'A', score: 0 },
        p2: { name: 'Bob', color: '#0f0', avatar: 'B', score: 0 },
    };
    const game = new TriviaGame('ROOM2', players, { innerHTML: '' });
    ctx.__clearAllTimers();

    game.questions = [{
        category: 'Test',
        question: 'Q?',
        answers: ['A', 'B', 'C', 'D'],
        correct: 0,
    }];
    game.totalQuestions = 2;
    game.currentQuestionIndex = 0;
    game.answers = {
        p1: { answer: 0, timestamp: 1 },
        p2: { answer: 0, timestamp: 2 },
    };
    game.revealed = false;
    game.advanceTimeout = null;
    game.revealTimeout = ctx.setTimeout(() => {
        game.revealTimeout = null;
        game.revealAnswer();
    }, 500);

    game.revealAnswer(); // timer wins
    assert.strictEqual(players.p1.score, 100);
    assert.strictEqual(players.p2.score, 80);

    ctx.__flushUntil(600); // stale all-answered timeout must no-op
    assert.strictEqual(players.p1.score, 100, 'stale timeout must not re-score p1');
    assert.strictEqual(players.p2.score, 80, 'stale timeout must not re-score p2');
    console.log('ok: pending all-answered timeout ignored after timer reveal');
}

console.log('All Trivia double-reveal regression tests passed.');
