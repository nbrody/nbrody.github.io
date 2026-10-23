/**
 * exampleLibrary.js — Preset knot mosaic examples
 */

// Box-drawing art → an n×n tile grid, the art centred. ┿ is a crossing with
// the horizontal strand over (tile 7), ╂ the vertical strand over (tile 8).
function mosaicFromArt(lines, n) {
    const TILE = { ' ': 0, '─': 1, '│': 2, '╰': 3, '╯': 4, '╭': 5, '╮': 6, '┿': 7, '╂': 8, '⊗': 11 };
    const w = Math.max(...lines.map(l => [...l].length));
    const r0 = Math.floor((n - lines.length) / 2), c0 = Math.floor((n - w) / 2);
    const grid = Array.from({ length: n }, () => new Array(n).fill(0));
    lines.forEach((l, r) => [...l].forEach((ch, c) => { grid[r0 + r][c0 + c] = TILE[ch] ?? 0; }));
    return grid;
}
const EXAMPLES = {
    disk: [
        {
            name: 'Unknot',
            gridSize: 5,
            grid: [
                [0, 0, 0, 0, 0],
                [0, 5, 1, 6, 0],
                [0, 2, 0, 2, 0],
                [0, 3, 1, 4, 0],
                [0, 0, 0, 0, 0]
            ]
        },
        {
            name: 'Trefoil (3_1)',
            gridSize: 5,
            grid: [
                [0, 5, 1, 6, 0],
                [5, 8, 1, 7, 6],
                [2, 3, 6, 2, 2],
                [3, 1, 7, 4, 2],
                [0, 0, 3, 1, 4]
            ]
        },
        {
            name: 'Figure Eight (4_1)',
            gridSize: 5,
            grid: [
                [0, 5, 1, 6, 0],
                [5, 7, 6, 2, 0],
                [2, 3, 7, 8, 6],
                [3, 1, 8, 4, 2],
                [0, 0, 3, 1, 4]
            ]
        },
        {
            name: 'Unlink',
            gridSize: 5,
            grid: [
                [5, 6, 0, 0, 0],
                [3, 4, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 5, 6],
                [0, 0, 0, 3, 4]
            ]
        },
        {
            // Three disjoint strands, so a 3-component unlink, but each word is
            // knotted on its own: the ribbon under it ties a knot. "Happy" is
            // a trefoil, "30th" a figure-eight, "Bunner" a cinquefoil (3, 4
            // and 5 crossings in the knots themselves).
            name: 'Happy 30th, Bunner',
            gridSize: 70,
            strandColor: '#fbbf24',
            grid: mosaicFromArt([
                '                                        ╭──────────╮',
                '                                        │          │',
                '╭╮     ╭╮                               │╭───╮ ╭───╂─╮      ╭╮',
                '││     ││                               ││   │ │   │ │ ╭─╮  ││',
                '││     ││                               ╰╯   │ │   │ ╰─┿─╯  ││',
                '╰╂─────┿╯                                 ╭──╯ │   │   │    ││',
                ' │     │  ╭──╮  ╭──╮  ╭──╮  ╭╮  ╭╮        ╰──╮ │   │   │    ╰╂──╮',
                ' │     │  │  │  │  │  │  │  ││  ││           │ │   │   │     │  │',
                ' │     │  │  │  │  │  │  │  ││  ││           │ │   │   │     │  │',
                ' │     │  ╰──╂╮ │  │  │  │  ││  ││           │ │   │   │     │  │',
                ' │     ╰─────╯╰─┿──╯╭─┿──╯╭─╯╰──╯│     ╭─────╯ ╰───╯   ╰─────╯  ╰╮',
                ' │              │   │ │   │      │     │                         │',
                ' ╰───────╮  ╭───╂───┿─╂───┿───╮  │     ╰───────────╮ ╭───────────╯',
                '        ╭┿╮ │   │   │ │   │   │  │                ╭┿╮│',
                '        │╰┿╮│   ╰───╯ ╰───╯   ╰──╯                │╰┿╂╮',
                '        │ ╰┿╯                                     ╰─╂╯│',
                '        ╰──╯                                        ╰─╯',
                '',
                '',
                '             ╭───╮',
                '             │   │',
                '             │   │',
                '             │ ╭─╯',
                '             │ ╰─╮  ╭╮  ╭╮ ╭──╮ ╭──╮  ╭──╮  ╭─────╮',
                '             │   │  ││  ││ │  │ │  │  │  │  │     │',
                '             │   │  ││  ││ │  │ │  │ ╭┿──╯  │     │',
                '             │   │  ││  ││ │  │ │  │ ││     │     │',
                '           ╭─┿───╯╭─╯╰──╯╰─╯  ╰─╯  ╰─╯╰─────╯     │',
                '           │ │    │                               │',
                '           │ ╰────╯                               │',
                '           │                                      │',
                '           ╰──────────────╮    ╭──────────────────╯',
                '                         ╭┿╮   │',
                '                         │╰┿╮  │',
                '                         │ ╰┿╮ │',
                '                         │  ╰┿╮│',
                '                         │   ╰┿╯',
                '                         ╰────╯'
            ], 70)
        },
        // ── Virtual knots (tile 11 = virtual crossing ⊗) ──
        {
            // Virtualizing one crossing of the standard trefoil diagram
            // yields the virtual trefoil (2 classical + 1 virtual crossing).
            name: 'Virtual Trefoil (2.1)',
            gridSize: 5,
            grid: [
                [0, 5, 1, 6, 0],
                [5, 8, 1, 7, 6],
                [2, 3, 6, 2, 2],
                [3, 1, 11, 4, 2],
                [0, 0, 3, 1, 4]
            ]
        },
        {
            name: 'Figure Eight, virtualized',
            gridSize: 5,
            grid: [
                [0, 5, 1, 6, 0],
                [5, 7, 6, 2, 0],
                [2, 3, 11, 8, 6],
                [3, 1, 8, 4, 2],
                [0, 0, 3, 1, 4]
            ]
        },
        {
            // One classical + one virtual crossing — the simplest
            // nontrivial virtual link.
            name: 'Virtual Hopf Link',
            gridSize: 4,
            grid: [
                [5, 1, 6, 0],
                [2, 5, 7, 6],
                [3, 11, 4, 2],
                [0, 3, 1, 4]
            ]
        }
    ],
    torus: [
        {
            name: 'Longitude',
            gridSize: 5,
            grid: [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ]
        },
        {
            name: 'Meridian',
            gridSize: 5,
            grid: [
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0]
            ]
        },
        {
            name: '(1,1) Torus Knot',
            gridSize: 3,
            grid: [
                [3, 1, 6],
                [2, 0, 2],
                [6, 1, 3]
            ]
        },
        {
            name: '(2,3) Torus Knot (Trefoil)',
            gridSize: 5,
            grid: [
                [3, 6, 3, 1, 6],
                [6, 3, 1, 6, 3],
                [3, 1, 6, 3, 6],
                [1, 6, 3, 6, 3],
                [6, 3, 6, 3, 1]
            ]
        }
    ],
    sphere: [
        {
            name: 'Equator',
            faceSize: 3,
            grid: {
                top: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                front: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                right: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                back: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                left: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                bottom: [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
            }
        },
        {
            name: 'Unlink',
            faceSize: 4,
            grid: {
                top: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
                front: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                right: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                back: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                left: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                bottom: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
            }
        }
    ]
};
