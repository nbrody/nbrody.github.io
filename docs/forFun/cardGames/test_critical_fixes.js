/**
 * Regression tests for cardGames critical bugs:
 * 1. Blackjack table TDZ — `hand` used before initialization in updateTableView
 * 2. War stall — eliminated players block allPlayed forever
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initState, playCard, getActions } from './js/games/war.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function testBlackjackHandScope() {
  const html = readFileSync(join(__dirname, 'table/index.html'), 'utf8');
  const fnStart = html.indexOf('function updateTableView()');
  assert.ok(fnStart >= 0, 'updateTableView should exist');
  const fnBody = html.slice(fnStart, html.indexOf('window.dealCards', fnStart));

  // The buggy pattern: const hand after blackjack info uses hand.length
  const handDeclIdx = fnBody.indexOf('const hand = player?.hand');
  const handLenInBlackjack = fnBody.indexOf('infoEl.innerHTML = hand.length');
  assert.ok(handDeclIdx >= 0, 'hand should be declared once in updateTableView');
  assert.ok(handLenInBlackjack >= 0, 'blackjack info should use hand.length');
  assert.ok(
    handDeclIdx < handLenInBlackjack,
    'hand must be declared before blackjack info uses it (TDZ crash)'
  );

  // Simulate the fixed scoping: declare hand first, then use it
  const player = { hand: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 'h' }], chips: 100 };
  const hand = player?.hand || [];
  const total = hand.reduce((s, c) => s + (c.rank === 'A' ? 11 : 10), 0);
  const info = hand.length
    ? `<div>${total > 21 ? 'BUST' : total}</div>`
    : `<div>chips</div>`;
  assert.match(info, /21/, 'blackjack seat info should render with hand in scope');
  console.log('ok - blackjack hand scope (no TDZ)');
}

function testWarEliminatedPlayerDoesNotStall() {
  let state = initState(['p0', 'p1', 'p2']);
  state.players.p0.deck = [
    { rank: 'A', suit: 's' },
    { rank: 'K', suit: 's' },
    { rank: 'Q', suit: 's' },
  ];
  state.players.p1.deck = [
    { rank: '2', suit: 'h' },
    { rank: '3', suit: 'h' },
    { rank: '4', suit: 'h' },
  ];
  state.players.p2.deck = []; // already eliminated

  state = playCard(state, 'p0');
  state = playCard(state, 'p1');

  assert.equal(state.round, 1, 'round should resolve without waiting on empty-deck p2');
  assert.equal(state.players.p0.played, null);
  assert.equal(state.players.p1.played, null);
  assert.ok(state.players.p0.deck.length > state.players.p1.deck.length, 'Ace should win the pot');
  assert.deepEqual(getActions(state, 'p2'), [], 'eliminated player has no actions');

  // Second round still progresses
  const roundBefore = state.round;
  state = playCard(state, 'p0');
  state = playCard(state, 'p1');
  assert.equal(state.round, roundBefore + 1, 'subsequent rounds must also resolve');
  console.log('ok - war eliminated player does not stall');
}

function testWarGameOverWhenOneRemains() {
  let state = initState(['p0', 'p1', 'p2']);
  state.players.p0.deck = [{ rank: 'A', suit: 's' }];
  state.players.p1.deck = [{ rank: '2', suit: 'h' }];
  state.players.p2.deck = [];

  state = playCard(state, 'p0');
  state = playCard(state, 'p1');

  // p1 loses last card → only p0 remains → done
  assert.equal(state.phase, 'done', 'game should end when only one player has cards');
  console.log('ok - war game over when one remains');
}

testBlackjackHandScope();
testWarEliminatedPlayerDoesNotStall();
testWarGameOverWhenOneRemains();
console.log('All cardGames critical fixes passed.');
