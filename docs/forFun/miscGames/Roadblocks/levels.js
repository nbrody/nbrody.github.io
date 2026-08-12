/**
 * Roadblocks — Level Schema & Pack
 * ════════════════════════════════════════════════════════════════
 *
 * Levels are authored as ASCII art instead of nested number arrays.
 * Each level is an array of equal-or-ragged strings; ragged rows are
 * padded on the right with VOID. One glyph per cell:
 *
 *     '.'   Floor      — slide across it
 *     ' '   Void       — the abyss; sliding in is fatal (so is the off-grid edge)
 *     '#'   Wall       — a brake; you stop against it, never enter it
 *     'S'   Start
 *     'G'   Goal
 *     '\'   Mirror \   — reflects: right↔down, left↔up
 *     '/'   Mirror /   — reflects: right↔up,  left↔down
 *     'J'   Jump pad   — leap over the very next cell
 *     'O'   Portal     — teleport to the matching portal (place exactly two)
 *     '+'   Sand       — friction; the slide halts the instant you enter
 *
 * Design grammar:
 *   • Walls and sand are BRAKES — the only way to stop short of an edge.
 *   • Open edges and interior Void are HAZARDS — overshooting is death.
 *   • A good level makes the naive slide fall into the void and rewards
 *     a route that brakes at the right cells.
 *
 *   parseLevel(rows)   → numeric grid (what the engine consumes)
 *   gridToAscii(grid)  → array of glyph strings (for export/sharing)
 *   generateLevel(opts)→ a fresh, guaranteed-solvable random level
 */

const GLYPH_TO_CELL = {
    '.': 0, ' ': 8, '#': 1, 'S': 2, 'G': 3,
    '\\': 4, '/': 5, 'J': 6, 'O': 7, '+': 9,
    '~': 8 // alias for void
};

const CELL_TO_GLYPH = {
    0: '.', 1: '#', 2: 'S', 3: 'G', 4: '\\', 5: '/', 6: 'J', 7: 'O', 8: ' ', 9: '+'
};

/** Parse an ASCII level (array of strings) into a numeric grid. */
function parseLevel(rows) {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return rows.map(row => {
        const cells = [];
        for (let c = 0; c < width; c++) {
            const ch = c < row.length ? row[c] : ' ';
            cells.push(ch in GLYPH_TO_CELL ? GLYPH_TO_CELL[ch] : 8);
        }
        return cells;
    });
}

/** Serialize a numeric grid back to ASCII glyph rows. */
function gridToAscii(grid) {
    return grid.map(row => row.map(v => CELL_TO_GLYPH[v] ?? ' ').join(''));
}

// ════════════════════════════════════════════════════════════════
//  The Level Pack — curated, hand-tuned, each verified solvable.
// ════════════════════════════════════════════════════════════════

const LEVEL_DEFS = [
    // ── Tier 1 · Brakes & the Void ────────────────────────────────────────
    { tier: 0, name: "Ledge", art: [
        ' ###',
        '#S..#',
        '#.#.#',
        '#.#G#',
        '#...#',
        ' ###'] },
    { tier: 0, name: "Brink", art: [
        ' #',
        ' .G#',
        '#S..',
        ' . .',
        ' +..#'] },
    { tier: 0, name: "Chasm", art: [
        '  #',
        '#..',
        ' ..',
        ' .S#',
        ' #+G'] },
    { tier: 0, name: "Precipice", art: [
        ' #####',
        '#S....#',
        '#.###.#',
        '#.#G..#',
        '#.#.##',
        '#...#',
        ' ###'] },
    { tier: 0, name: "Margin", art: [
        '  ##',
        ' #.G',
        ' .+#',
        '#.S#',
        ' ##'] },
    { tier: 0, name: "Plunge", art: [
        ' ##G#',
        '#...#',
        '#S.#',
        '# .',
        ' ###'] },
    { tier: 0, name: "Crevasse", art: [
        ' #G',
        '# .',
        '#.+.#',
        '#S+.',
        ' ####'] },
    { tier: 0, name: "Shelf", art: [
        '  ###',
        ' #.. #',
        '# .S #',
        '# ..G#',
        '  #..#',
        '   ##'] },
    { tier: 0, name: "Cliffhanger", art: [
        '   +.+',
        'S...#.',
        '   +..',
        '   G #',
        '   #'] },
    { tier: 0, name: "Freefall", art: [
        '#',
        '#+S. #',
        '#..+.G',
        ' #####'] },
    { tier: 0, name: "Tightrope", art: [
        'G+###',
        '#.S.',
        '#+.',
        '# #'] },
    { tier: 0, name: "Stepping Stones", art: [
        ' ###',
        '  S.#',
        '  . .#',
        '#....#',
        '#G###'] },
    { tier: 0, name: "The Drop", art: [
        ' #++#',
        '# +.G#',
        '   S #',
        '# .. #',
        ' ####'] },
    { tier: 0, name: "Narrow Pass", art: [
        '#',
        '...G#',
        '++S',
        '#..',
        ' ###'] },
    { tier: 0, name: "Sheer", art: [
        '    #',
        '   # #',
        '# ..+G',
        '#  ..#',
        '#.S.#',
        '# ...#',
        ' ####'] },
    { tier: 0, name: "Overhang", art: [
        ' #+.#',
        '#.+.',
        '# S.',
        '   G',
        '   #'] },
    { tier: 0, name: "Crosswalk", art: [
        '# S',
        '# +..',
        ' #+++.G#'] },
    { tier: 0, name: "Pitfall", art: [
        ' ####',
        '#  S #',
        '#+.. #',
        '#.+#',
        ' #G#'] },
    { tier: 0, name: "Balancing Act", art: [
        '    #',
        '     #',
        '    .#',
        '  #.S#',
        '# .. #',
        ' #.+ #',
        ' #+.G#'] },
    { tier: 0, name: "Last Stand", art: [
        ' #####',
        '#S....#',
        ' ##.#.#',
        '#...#.#',
        '#.#G#.#',
        '#.....#',
        ' #####'] },
    // ── Tier 2 · Mirrors ────────────────────────────────────────
    { tier: 1, name: "First Reflection", art: [
        '#.\\#',
        ' \\.#',
        ' #..\\#',
        '#./.S#',
        '#G###'] },
    { tier: 1, name: "Prism", art: [
        ' ### #',
        '#S..#G#',
        '#.#.#.#',
        '#.#.#.#',
        '#..\\..#',
        ' #####'] },
    { tier: 1, name: "Bank Shot", art: [
        ' ######',
        '#S...\\.#',
        '#.####.#',
        '#.#....#',
        '#.#.##.#',
        '#/.\\# G#',
        ' ###  #'] },
    { tier: 1, name: "Glint", art: [
        '  ##/+',
        '  /S./',
        '# .\\##',
        '  #. #',
        ' #G..#',
        '  ###'] },
    { tier: 1, name: "Refraction", art: [
        ' # ###',
        '#S#...#',
        '#.#.#.#',
        '#.#.#.#',
        '#..\\.G#',
        ' #####'] },
    { tier: 1, name: "Facet", art: [
        ' #G##',
        '# .S #',
        ' #...\\',
        '# .\\.+',
        ' #####'] },
    { tier: 1, name: "Lens Flare", art: [
        '   #',
        '# ..\\ #',
        '  /S..#',
        ' #+/+.G'] },
    { tier: 1, name: "Ricochet", art: [
        ' #####',
        '#S..\\.#',
        '#.....#',
        ' ####.#',
        '#G...\\#',
        ' #####'] },
    { tier: 1, name: "Caustic", art: [
        ' #+.\\#',
        '  . .#',
        ' #\\.S#',
        ' G +.#',
        '#../#',
        ' ###'] },
    { tier: 1, name: "Shimmer", art: [
        ' #G##',
        '#/+/S#',
        '#...+#',
        '   ./#',
        '   #'] },
    { tier: 1, name: "Silver Lining", art: [
        ' #G#',
        '# + #',
        ' #...#',
        '#..S/#',
        ' ####'] },
    { tier: 1, name: "Kaleidoscope", art: [
        '  ####',
        '  /...#',
        '# S#./#',
        '    \\.#',
        '  # #G#'] },
    { tier: 1, name: "Hall of Mirrors", art: [
        '     #',
        '    /. #',
        '   /.\\S#',
        '#G.+###'] },
    { tier: 1, name: "Deflection", art: [
        ' #G#',
        '##.\\',
        '/...#',
        '.S',
        '+/##'] },
    { tier: 1, name: "Angle of Attack", art: [
        '  ###',
        '   +S#',
        '   .\\#',
        '  ##.#',
        '#G. .#',
        '  \\..#',
        '  ###'] },
    { tier: 1, name: "Crosslight", art: [
        ' ####',
        '#.S.\\#',
        '##  .#',
        'G./..#',
        '#\\+##'] },
    { tier: 1, name: "Looking Glass", art: [
        ' #####',
        '#..\\.S#',
        'G.#../#',
        '##'] },
    { tier: 1, name: "Double Take", art: [
        ' #G+#',
        ' .+/#',
        '#..\\#',
        'S...#',
        '####'] },
    { tier: 1, name: "Splitbeam", art: [
        ' ###G#',
        '# ...#',
        '#.#+.#',
        '#...#',
        '#S.\\.#',
        ' #\\+#'] },
    { tier: 1, name: "Zigzag", art: [
        '  #G#',
        '   .',
        '#/..#',
        '#. . #',
        '#.\\/S#',
        ' #...\\',
        '# ...+',
        ' #####'] },
    // ── Tier 3 · Jump Pads ────────────────────────────────────────
    { tier: 2, name: "First Leap", art: [
        ' #',
        ' G   S',
        ' .   .',
        '#..#J.',
        '     #'] },
    { tier: 2, name: "Vault", art: [
        ' #####',
        '#S.J..#',
        ' ####J#',
        '#G....#',
        ' #####'] },
    { tier: 2, name: "Hopscotch", art: [
        '#+G###',
        ' .  .S#',
        '#...J+#',
        '    . #',
        '    . #',
        '   ###'] },
    { tier: 2, name: "Hurdle", art: [
        '#+G###',
        ' .  .S#',
        '#...J+#',
        '    ..#',
        '    . #',
        '   ###'] },
    { tier: 2, name: "Launchpad", art: [
        '  #',
        '',
        '  .   #',
        ' #..JS#',
        '#.+   #',
        'G.+###'] },
    { tier: 2, name: "Springboard", art: [
        '  # #',
        '',
        '  . . #',
        ' #..JS#',
        '#.+.  #',
        'G.+###'] },
    { tier: 2, name: "Long Jump", art: [
        '  +.#',
        '   J',
        '  J#',
        '  ..',
        '  S.',
        '#G..',
        '   #'] },
    { tier: 2, name: "Apex Arc", art: [
        '+.J ...#',
        '.     J',
        'S     #',
        '      .',
        '  #G..+'] },
    { tier: 2, name: "Pole Position", art: [
        '#. J.S',
        ' .',
        ' ..J ..#',
        ' #    G',
        '      #'] },
    { tier: 2, name: "Catapult", art: [
        ' ##### #',
        '#S.J#.#G#',
        ' ####.#.#',
        '#.....J.#',
        ' #######'] },
    { tier: 2, name: "Soar", art: [
        '   #',
        '',
        '# #S #',
        'G+.J #',
        '#  #',
        '# J. #',
        ' #.+#'] },
    { tier: 2, name: "Lunge", art: [
        '+.+',
        '+',
        '. J',
        '.#. JS',
        'G'] },
    { tier: 2, name: "Triple Hop", art: [
        '+.#J.+',
        '. S  #',
        'G .  J',
        '# .  .',
        '  .J#.#',
        '  #'] },
    { tier: 2, name: "Skip Trace", art: [
        '+.#',
        ' .',
        'J+J#..#',
        '.    .',
        'S    .',
        '     G',
        '     #'] },
    { tier: 2, name: "Daredevil", art: [
        'G.+',
        ' S..+',
        '  # .',
        '  J J',
        '  .',
        '  +..',
        '    #'] },
    { tier: 2, name: "Flight Path", art: [
        '#.#J.+',
        ' .   #',
        ' +   J',
        ' G   .',
        'SJ#...#'] },
    { tier: 2, name: "Bunny Hop", art: [
        ' S.J#...#',
        '       .',
        '#...#J..',
        ' JG    #',
        '  .',
        ' ..',
        ' +.#'] },
    { tier: 2, name: "Over the Top", art: [
        '+.#   G',
        '.J    .',
        '#     .',
        'J+.J#.+',
        '+.. JS'] },
    { tier: 2, name: "Pounce", art: [
        ' G #',
        '+...',
        '.. .',
        '.+#.#JS',
        '#'] },
    { tier: 2, name: "Leap of Faith", art: [
        '  #',
        '  ..+',
        '  # .',
        '  J .',
        '  . +',
        '  +SJ',
        '',
        '#G..+'] },
    // ── Tier 4 · Portals ────────────────────────────────────────
    { tier: 3, name: "Warp", art: [
        ' ## ###',
        '#S.#.O.#',
        '#..#.#.#',
        '#O.#.#G#',
        '#..#...#',
        ' ## ###'] },
    { tier: 3, name: "Gateway", art: [
        '  #',
        '   #',
        '  +.',
        'O.++',
        ' S.O',
        '  .G',
        ' ###'] },
    { tier: 3, name: "Wormhole", art: [
        '  #',
        '#',
        'O..#',
        '##G',
        '#.O',
        '#+S',
        ' ###'] },
    { tier: 3, name: "Shortcut", art: [
        ' # ##',
        '#O#',
        '#..++.G#',
        '#S.',
        '# .',
        '  O',
        '  #'] },
    { tier: 3, name: "The Loop", art: [
        ' +G#',
        ' . S',
        'O. .',
        '++ O'] },
    { tier: 3, name: "Tunnel Vision", art: [
        ' #####',
        '  .+.O#',
        'O.+.',
        ' ...G#',
        '  #S',
        '',
        '   #'] },
    { tier: 3, name: "Nexus", art: [
        '     ##',
        '     S.#',
        '  O  .',
        '  .# O',
        '# ..G#',
        '#...#',
        ' ###'] },
    { tier: 3, name: "Threshold", art: [
        '   ##',
        '     #',
        '  #..O',
        '  O.S#',
        '   + +',
        '#G.+.+'] },
    { tier: 3, name: "Vortex", art: [
        ' ###    ##O',
        '#..G#    S.',
        '# O      .+',
        '         ##'] },
    { tier: 3, name: "Conduit", art: [
        '  ##',
        '   S#',
        '  O+#',
        '   .#',
        '   #',
        '#G..#',
        ' ##.O'] },
    { tier: 3, name: "The Fold", art: [
        ' #...+',
        '  G  .',
        '  O..+',
        '',
        '',
        'SO'] },
    { tier: 3, name: "Relay", art: [
        '+O##',
        '.+.G#',
        '#     #',
        '    OS#',
        '     .#',
        '    ##'] },
    { tier: 3, name: "Blink", art: [
        '##.+#',
        '++.O',
        'GO#',
        '#.',
        '#S',
        ' ##'] },
    { tier: 3, name: "Teleport", art: [
        'O...#',
        '##...#',
        'G..# #',
        '# #',
        '#.SO',
        '#',
        ' ##'] },
    { tier: 3, name: "Through the Gate", art: [
        '+.O#',
        '..G#',
        '#',
        '      .#',
        '    O.+. #',
        '       S.#',
        '         #',
        '       ##'] },
    { tier: 3, name: "Far Side", art: [
        ' ###',
        '#.S',
        '#+O',
        '#      #',
        '     O.#',
        '  #G..+#'] },
    { tier: 3, name: "Crossover", art: [
        '#.O##',
        '#.++G#',
        '#+.#  #',
        '#  O.S#',
        '      #',
        '   # #'] },
    { tier: 3, name: "Slipstream", art: [
        '#...O',
        ' .',
        ' +',
        ' .',
        ' +   S+',
        ' G  O.+'] },
    { tier: 3, name: "Wraparound", art: [
        '+.S',
        '.',
        'OG..+   O',
        '    .   .',
        '    .   .',
        '    +..+.',
        '        #'] },
    { tier: 3, name: "Event Horizon", art: [
        ' ####   ##',
        '# SO    O+',
        '        +.',
        '     #G+.#',
        '        #'] },
    // ── Tier 5 · Sand & Synthesis ────────────────────────────────────────
    { tier: 4, name: "Gauntlet", art: [
        'S',
        './.#',
        '\\+..#',
        ' .G.',
        '#../'] },
    { tier: 4, name: "Crucible", art: [
        '  #',
        ' ++',
        '+S.',
        '. #',
        '\\.+',
        '##G'] },
    { tier: 4, name: "Labyrinth", art: [
        '#..++G#',
        ' \\...#',
        '  S/'] },
    { tier: 4, name: "Confluence", art: [
        '  O   #',
        ' #.#J..',
        '  S.J#.#',
        '#..#J+',
        ' G   O'] },
    { tier: 4, name: "Tempest", art: [
        '######',
        'O+/S.',
        '# .',
        '#+.O',
        'G.#',
        '##'] },
    { tier: 4, name: "Mosaic", art: [
        ' #######',
        '#S..\\..+#',
        '#.  # #.#',
        '#+..O..\\#',
        ' # ### #',
        '#G..+.O.#',
        ' #######'] },
    { tier: 4, name: "Convergence", art: [
        '  ###',
        '  O.S#',
        '',
        ' +.# #',
        ' +++.G',
        '#.O###'] },
    { tier: 4, name: "Odyssey", art: [
        '        #',
        '        O',
        '        .',
        '   .  +..',
        '# .S  ++#',
        '   O  ..#',
        '   # ##G#'] },
    { tier: 4, name: "Maelstrom", art: [
        '   OS',
        '+O',
        '. #',
        '. G',
        '++.#'] },
    { tier: 4, name: "Tapestry", art: [
        ' ##   ####',
        '#.     .SO',
        'O.#      #',
        '++.',
        '+..G#',
        '#'] },
    { tier: 4, name: "Cascade", art: [
        '######',
        ' S.\\  #',
        ' . .+.#',
        '   #..#',
        '    #+G',
        '     ##'] },
    { tier: 4, name: "Reckoning", art: [
        ' ##++. #.+',
        '#.S/    .O',
        '# .#     #',
        '  O..G#',
        '# ./',
        '  #'] },
    { tier: 4, name: "Culmination", art: [
        '###',
        '.+O',
        '\\..',
        '#G#',
        ' #',
        '#S+.',
        ' #O##'] },
    { tier: 4, name: "Grand Tour", art: [
        ' #..O',
        '#...   #',
        '#./   S+',
        '#G# #O.+'] },
    { tier: 4, name: "Pandemonium", art: [
        '###',
        '.+O',
        '\\...',
        '#G#',
        ' #',
        '#S+.',
        ' #O##'] },
    { tier: 4, name: "Magnum Opus", art: [
        '   ##',
        '    S',
        '#O  .  #',
        '#.  \\..#',
        '#..#  O#',
        ' #+.G#',
        '',
        '  #'] },
    { tier: 4, name: "The Crossroads", art: [
        '  #.O#',
        '   +.G',
        '     #',
        'O.++ #',
        '  .S #',
        '',
        '  ##'] },
    { tier: 4, name: "Trial by Fire", art: [
        ' #G+',
        '   .',
        '   O',
        ' O/+',
        ' .S.',
        '#..+'] },
    { tier: 4, name: "Masterpiece", art: [
        '      G',
        '    O..#',
        '#. J.S',
        ' .',
        '++',
        '+.O'] },
    { tier: 4, name: "Finale", art: [
        '/.#',
        '.+..G#',
        '+\\',
        ' . S',
        '/.#.',
        '+..+'] },
];
const TIER_NAMES = ['Brakes & the Void', 'Mirrors', 'Jump Pads', 'Portals', 'Sand & Synthesis'];

const LEVEL_PACK = LEVEL_DEFS.map(d => parseLevel(d.art));

function getTierForLevel(idx) {
    return (LEVEL_DEFS[idx] && LEVEL_DEFS[idx].tier) || 0;
}
function getTierName(idx) {
    return TIER_NAMES[getTierForLevel(idx)] || TIER_NAMES[0];
}
function getLevelName(idx) {
    return (LEVEL_DEFS[idx] && LEVEL_DEFS[idx].name) || `Level ${idx + 1}`;
}

// ════════════════════════════════════════════════════════════════
//  Procedural Generator
//  ───────────────────────────────────────────────────────────────
//  Carves a forced path: it makes a sequence of slides and drops a
//  wall just past each intended stopping cell, so the route is always
//  reproducible (hence guaranteed solvable). Overshooting the carved
//  brakes drops the player into the surrounding void.
// ════════════════════════════════════════════════════════════════

function generateLevel(opts = {}) {
    const rows = opts.rows || (6 + Math.floor(Math.random() * 3));
    const cols = opts.cols || (8 + Math.floor(Math.random() * 3));
    const targetMoves = opts.moves || (4 + Math.floor(Math.random() * 4));
    const border = opts.border !== false; // walled border by default keeps it fair

    const FLOOR = 0, WALL = 1, VOID = 8;

    for (let attempt = 0; attempt < 200; attempt++) {
        const grid = Array.from({ length: rows }, () => new Array(cols).fill(VOID));
        const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;

        // Inner playable area
        const r0 = border ? 1 : 0, c0 = border ? 1 : 0;
        const r1 = border ? rows - 2 : rows - 1, c1 = border ? cols - 2 : cols - 1;
        if (r1 - r0 < 2 || c1 - c0 < 2) continue;

        let r = r0 + Math.floor(Math.random() * (r1 - r0 + 1));
        let c = c0 + Math.floor(Math.random() * (c1 - c0 + 1));
        const start = { r, c };
        grid[r][c] = FLOOR;

        const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
        let lastDir = null;
        let placed = 0;

        for (let step = 0; step < targetMoves; step++) {
            // pick a direction (avoid immediate reversal) with room to slide ≥1
            const options = dirs.filter(d => !(lastDir && d.dr === -lastDir.dr && d.dc === -lastDir.dc));
            let moved = false;
            for (const d of shuffle(options)) {
                const dist = 1 + Math.floor(Math.random() * 3);
                let nr = r, nc = c, ok = true, traveled = 0;
                for (let i = 0; i < dist; i++) {
                    const tr = nr + d.dr, tc = nc + d.dc;
                    if (!inBounds(tr, tc) || tr < r0 || tr > r1 || tc < c0 || tc > c1) { ok = false; break; }
                    if (grid[tr][tc] === WALL) { ok = false; break; }
                    nr = tr; nc = tc; traveled++;
                }
                if (!ok || traveled === 0) continue;
                // carve the lane to floor
                let cr = r, cc = c;
                for (let i = 0; i < traveled; i++) { cr += d.dr; cc += d.dc; grid[cr][cc] = FLOOR; }
                // drop a brake just past the stop (if inside, otherwise the void edge brakes us)
                const br = nr + d.dr, bc = nc + d.dc;
                if (inBounds(br, bc) && br >= r0 && br <= r1 && bc >= c0 && bc <= c1 && grid[br][bc] === VOID) {
                    grid[br][bc] = WALL; placed++;
                }
                r = nr; c = nc; lastDir = d; moved = true; break;
            }
            if (!moved) break;
        }

        // place goal at final resting cell, start marker at origin
        if (r === start.r && c === start.c) continue;
        grid[r][c] = 3;            // GOAL
        grid[start.r][start.c] = 2; // START

        if (border) {
            for (let i = 0; i < rows; i++) { grid[i][0] = WALL; grid[i][cols - 1] = WALL; }
            for (let j = 0; j < cols; j++) { grid[0][j] = WALL; grid[rows - 1][j] = WALL; }
            grid[start.r][start.c] = 2; grid[r][c] = 3;
        }

        const sol = solveBFS(grid);
        if (sol && sol.length >= Math.max(3, targetMoves - 2)) return grid;
    }
    // Fallback: a trivial but valid level
    return parseLevel(['#####', '#S.G#', '#####']);
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Node export (for the verification harness); harmless in the browser.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseLevel, gridToAscii, generateLevel, LEVEL_PACK, LEVEL_DEFS };
}
