#!/usr/bin/env node
/**
 * Snap is advertised in the lobby catalog but has no engine or hand UI.
 * Hosting it used to silently run Blackjack on the table while phones
 * received game:'snap' and rendered no cards or action buttons.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const lobby = readFileSync(join(here, 'index.html'), 'utf8');
const table = readFileSync(join(here, 'table/index.html'), 'utf8');
const hand = readFileSync(join(here, 'hand/index.html'), 'utf8');

const gamesMatch = lobby.match(/const GAMES = \[([\s\S]*?)\];/);
assert.ok(gamesMatch, 'lobby must declare GAMES catalog');

const ctx = createContext({});
runInContext(`GAMES = [${gamesMatch[1]}]`, ctx);

const snap = ctx.GAMES.find((g) => g.id === 'snap');
assert.ok(snap, 'Snap remains in the catalog so the listing stays honest');
assert.equal(snap.comingSoon, true, 'Snap must be marked comingSoon');

assert.match(
  lobby,
  /if \(!game \|\| game\.comingSoon\)/,
  'selectGame must refuse comingSoon ids'
);
assert.match(
  lobby,
  /g\.comingSoon \? ' coming-soon'/,
  'buildGameGrid must mark comingSoon cards as non-clickable'
);

const playable = ctx.GAMES.filter((g) => !g.comingSoon);
assert.ok(playable.length >= 3, 'expected implemented games in the catalog');
for (const g of playable) {
  assert.ok(
    existsSync(join(here, 'js/games', `${g.id}.js`)),
    `playable catalog id ${g.id} must have js/games/${g.id}.js`
  );
}

assert.doesNotMatch(
  table,
  /\|\|\s*Blackjack/,
  'table must not silently fall back to the Blackjack engine'
);
assert.match(
  table,
  /ENGINES\[session\.game\]\s*\|\|\s*null/,
  'unknown session.game must resolve to a null engine'
);
assert.match(
  table,
  /if \(!engine\) \{\s*abortMissingEngine\(\);/,
  'table init must abort instead of calling Blackjack.initState for Snap'
);

const enginesMatch = table.match(/const ENGINES = \{([^}]+)\}/);
assert.ok(enginesMatch, 'table must declare ENGINES');
const engineKeys = [...enginesMatch[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
assert.deepEqual(
  new Set(engineKeys),
  new Set(playable.map((g) => g.id)),
  'table ENGINES keys must match playable catalog ids'
);

assert.doesNotMatch(
  hand,
  /gameId === 'snap'|gameId === "snap"/,
  'hand UI still has no Snap branch (do not pretend it is playable)'
);

console.log('ok: Snap is coming-soon; table no longer falls back to Blackjack');
