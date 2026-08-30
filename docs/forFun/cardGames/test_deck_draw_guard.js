// Guard: the table deck pile must not pop cards out of the shared pond/shoe.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { initState } from './js/games/gofish.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'table/index.html'), 'utf8');

assert.match(
  html,
  /<div id="deck-pile">/,
  'deck pile must not be wired to a click handler'
);
assert.doesNotMatch(
  html,
  /id="deck-pile"[^>]*onclick=/,
  'deck pile click must not call drawFromDeck'
);

const fnMatch = html.match(/window\.drawFromDeck = function\(\) \{[\s\S]*?\n    \};/);
assert.ok(fnMatch, 'drawFromDeck must remain defined as a no-op guard');

const playerIds = ['alice', 'bob'];
const gameState = initState(playerIds);
const pondBefore = gameState.deck.length;
const handsBefore = playerIds.map((pid) => gameState.players[pid].hand.length);

const ctx = createContext({
  window: {},
  gameState,
  toast() {},
  updateTableView() {},
  renderCard() { return { style: {} }; },
  document: {
    getElementById() {
      return { innerHTML: '', appendChild() {} };
    }
  }
});
runInContext(fnMatch[0], ctx);
ctx.window.drawFromDeck();

assert.equal(
  gameState.deck.length,
  pondBefore,
  'drawFromDeck must not pop cards from the Go Fish pond'
);
assert.deepEqual(
  playerIds.map((pid) => gameState.players[pid].hand.length),
  handsBefore,
  'drawFromDeck must not deal stolen pond cards into a hand'
);
assert.equal(
  pondBefore + handsBefore.reduce((a, b) => a + b, 0),
  52,
  'Go Fish must start with a conserved 52-card deck'
);

console.log('ok: table deck pile no longer deletes pond cards');
