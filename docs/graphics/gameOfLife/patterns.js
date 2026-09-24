// patterns.js — a small library of classic Life patterns, drawn as text.
// 'O' is a live cell; anything else is dead. Rows are top to bottom.

const art = {
  glider: `
.O.
..O
OOO`,
  lwss: `
.O..O
O....
O...O
OOOO.`,
  mwss: `
...O..
.O...O
O.....
O....O
OOOOO.`,
  hwss: `
...OO..
.O....O
O......
O.....O
OOOOOO.`,
  rpentomino: `
.OO
OO.
.O.`,
  acorn: `
.O.....
...O...
OO..OOO`,
  diehard: `
......O.
OO......
.O...OOO`,
  rabbits: `
O...OOO
OOO..O.
.O.....`,
  block: `
OO
OO`,
  beehive: `
.OO.
O..O
.OO.`,
  loaf: `
.OO.
O..O
.O.O
..O.`,
  boat: `
OO.
O.O
.O.`,
  blinker: `OOO`,
  toad: `
.OOO
OOO.`,
  beacon: `
OO..
OO..
..OO
..OO`,
  pulsar: `
..OOO...OOO..
.............
O....O.O....O
O....O.O....O
O....O.O....O
..OOO...OOO..
.............
..OOO...OOO..
O....O.O....O
O....O.O....O
O....O.O....O
.............
..OOO...OOO..`,
  pentadecathlon: `
..O....O..
OO.OOOO.OO
..O....O..`,
  eater: `
OO..
O.O.
..O.
..OO`,
  gosperGun: `
........................O...........
......................O.O...........
............OO......OO............OO
...........O...O....OO............OO
OO........O.....O...OO..............
OO........O...O.OO....O.O...........
..........O.....O.......O...........
...........O...O....................
............OO......................`,
};

export const PATTERN_LABELS = {
  glider: 'Glider', lwss: 'Lightweight spaceship', mwss: 'Middleweight spaceship', hwss: 'Heavyweight spaceship',
  rpentomino: 'R-pentomino', acorn: 'Acorn', diehard: 'Diehard', rabbits: 'Rabbits',
  block: 'Block', beehive: 'Beehive', loaf: 'Loaf', boat: 'Boat', blinker: 'Blinker', toad: 'Toad', beacon: 'Beacon',
  pulsar: 'Pulsar', pentadecathlon: 'Pentadecathlon', eater: 'Eater 1', gosperGun: 'Gosper glider gun',
};

/** Parse a pattern into a list of [x, y] live-cell offsets. */
function parse(text) {
  const rows = text.replace(/^\n/, '').split('\n');
  const cells = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'O') cells.push([x, y]); }));
  return cells;
}

export const PATTERNS = Object.fromEntries(Object.entries(art).map(([k, v]) => [k, parse(v)]));

/**
 * Transform a pattern: rotate by `rot` quarter-turns clockwise, then mirror
 * horizontally if `flip`. The result is normalized to start at (0, 0).
 */
export function transform(cells, rot = 0, flip = false) {
  let out = cells.map(([x, y]) => [x, y]);
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) out = out.map(([x, y]) => [-y, x]);
  if (flip) out = out.map(([x, y]) => [-x, y]);
  const minX = Math.min(...out.map(p => p[0])), minY = Math.min(...out.map(p => p[1]));
  return out.map(([x, y]) => [x - minX, y - minY]);
}

export function bounds(cells) {
  return { w: Math.max(...cells.map(p => p[0])) + 1, h: Math.max(...cells.map(p => p[1])) + 1 };
}
