import { Board, Gecko } from './game.js';

export function getLevel1389() {
    /*
    LEVEL 1389 GRID:
       0123456789
     0 YYYYYYY#HL
     1 ##H###H##L
     2 H#OOOOOOOL
     3 H###E####L
     4 SBMMMMMMML
     5 SB#E###LLL
     6 SBEE#H#L##
     7 SBE##H#L##
     8 SB###H#EEE
     9 SBEBBBBBBB
    10 SB#R#E###E
    11 H##R#EH##H
    12 EHRR##H##H
    13 H#GGGGGGGG

    COLOR LEGEND:
    1) Red           6) Blue          11) Beige
    2) Orange        7) Light blue    12) Dark beige
    3) Yellow        8) Purple        13) Black
    4) Green         9) Magenta       14) Light pink
    5) Dark blue    10) Salmon        15) Dark pink

    GECKOS:
    1) Y = Yellow with pink inside
    2) L = Pink (light pink) with light blue inside
    3) O = Orange with black inside
    4) M = Magenta with blue inside
    5) S = Dark beige with salmon inside (salmon has light blue inside - nested!)
    6) B (vertical col 1) = Beige with purple inside (purple has light blue inside - nested!)
    7) B (horizontal row 9) = Dark blue with orange inside
    8) R = Red (no inner)
    9) G = Green with orange inside

    HOLES (left to right, top to bottom):
    1) r0c8 = Purple
    2) r1c2 = Dark blue (ROPE to Orange gecko below)
    3) r1c6 = Red
    4) r2c0 = Light blue (permanent!)
    5) r3c0 = Green
    6) r6c5 = Magenta
    7) r7c5 = Dark pink
    8) r8c5 = Light beige
    9) r11c0 = Blue (ROPE to Dark beige gecko above)
    10) r11c6 = Salmon
    11) r11c9 = Dark beige
    12) r12c1 = Black
    13) r12c6 = Light pink
    14) r12c9 = Yellow
    15) r13c0 = Orange (permanent!)
    */

    const board = new Board(14, 10);

    // === GECKOS ===

    // 1. Yellow (Y): Row 0, c0-c6, inner: Pink
    const yellowInner = new Gecko(1001, 'pink', [], {});
    board.geckos.push(new Gecko(1, 'yellow', [
        { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }, { r: 0, c: 4 }, { r: 0, c: 5 }, { r: 0, c: 6 }
    ], { innerGecko: yellowInner }));

    // 2. Light Pink (L): Right serpent, head r0c9 -> tail r7c7, inner: Light blue
    const lightPinkInner = new Gecko(1002, 'lightblue', [], {});
    board.geckos.push(new Gecko(2, 'lightpink', [
        { r: 0, c: 9 }, { r: 1, c: 9 }, { r: 2, c: 9 }, { r: 3, c: 9 }, { r: 4, c: 9 }, { r: 5, c: 9 }, { r: 5, c: 8 }, { r: 5, c: 7 }, { r: 6, c: 7 }, { r: 7, c: 7 }
    ], { innerGecko: lightPinkInner }));

    // 3. Orange (O): Row 2, c2-c8, inner: Black, TETHERED to hole at r1c2
    const orangeInner = new Gecko(1003, 'black', [], {});
    board.geckos.push(new Gecko(3, 'orange', [
        { r: 2, c: 8 }, { r: 2, c: 7 }, { r: 2, c: 6 }, { r: 2, c: 5 }, { r: 2, c: 4 }, { r: 2, c: 3 }, { r: 2, c: 2 }
    ], { innerGecko: orangeInner, attachedHole: { color: 'darkblue' } }));

    // 4. Magenta (M): Row 4, c2-c8, inner: Blue
    const magentaInner = new Gecko(1004, 'blue', [], {});
    board.geckos.push(new Gecko(4, 'magenta', [
        { r: 4, c: 8 }, { r: 4, c: 7 }, { r: 4, c: 6 }, { r: 4, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 3 }, { r: 4, c: 2 }
    ], { innerGecko: magentaInner }));

    // 5. Dark Beige (S): Left column c0, r4-r10, inner: Salmon (which has Light blue inside - nested!)
    //    TETHERED to Blue hole at r11c0
    const salmonNestedInner = new Gecko(10051, 'lightblue', [], {});
    const salmonInner = new Gecko(1005, 'salmon', [], { innerGecko: salmonNestedInner });
    board.geckos.push(new Gecko(5, 'darkbeige', [
        { r: 4, c: 0 }, { r: 5, c: 0 }, { r: 6, c: 0 }, { r: 7, c: 0 }, { r: 8, c: 0 }, { r: 9, c: 0 }, { r: 10, c: 0 }
    ], { innerGecko: salmonInner, attachedHole: { color: 'blue' } }));

    // 6. Beige (B vertical): Column c1, r4-r10, inner: Purple (which has Light blue inside - nested!)
    const purpleNestedInner = new Gecko(10061, 'lightblue', [], {});
    const purpleInner = new Gecko(1006, 'purple', [], { innerGecko: purpleNestedInner });
    board.geckos.push(new Gecko(6, 'beige', [
        { r: 4, c: 1 }, { r: 5, c: 1 }, { r: 6, c: 1 }, { r: 7, c: 1 }, { r: 8, c: 1 }, { r: 9, c: 1 }, { r: 10, c: 1 }
    ], { innerGecko: purpleInner }));

    // 7. Dark Blue (B horizontal): Row 9, c3-c9, inner: Orange
    const darkBlueInner = new Gecko(1007, 'orange', [], {});
    board.geckos.push(new Gecko(7, 'darkblue', [
        { r: 9, c: 9 }, { r: 9, c: 8 }, { r: 9, c: 7 }, { r: 9, c: 6 }, { r: 9, c: 5 }, { r: 9, c: 4 }, { r: 9, c: 3 }
    ], { innerGecko: darkBlueInner }));

    // 8. Red (R): L-shape r10c3 -> r12c2, no inner
    board.geckos.push(new Gecko(8, 'red', [
        { r: 10, c: 3 }, { r: 11, c: 3 }, { r: 12, c: 3 }, { r: 12, c: 2 }
    ]));

    // 9. Green (G): Row 13, c2-c9, inner: Orange
    const greenInner = new Gecko(1009, 'orange', [], {});
    board.geckos.push(new Gecko(9, 'green', [
        { r: 13, c: 9 }, { r: 13, c: 8 }, { r: 13, c: 7 }, { r: 13, c: 6 }, { r: 13, c: 5 }, { r: 13, c: 4 }, { r: 13, c: 3 }, { r: 13, c: 2 }
    ], { innerGecko: greenInner }));


    // === HOLES (reading left to right, top to bottom) ===
    // Only holes #4 and #15 are permanent. Tethered holes (#2 and #9) are also non-permanent.
    board.addHole(0, 8, 'purple', false);      // 1) Purple
    board.addHole(1, 2, 'darkblue', false);    // 2) Dark blue (ROPE to Orange gecko)
    board.addHole(1, 6, 'red', false);         // 3) Red
    board.addHole(2, 0, 'lightblue', true);    // 4) Light blue (PERMANENT!)
    board.addHole(3, 0, 'green', false);       // 5) Green
    board.addHole(6, 5, 'magenta', false);     // 6) Magenta
    board.addHole(7, 5, 'darkpink', false);    // 7) Dark pink
    board.addHole(8, 5, 'beige', false);       // 8) Light beige
    board.addHole(11, 0, 'blue', false);       // 9) Blue (ROPE to Dark Beige gecko)
    board.addHole(11, 6, 'salmon', false);     // 10) Salmon
    board.addHole(11, 9, 'darkbeige', false);  // 11) Dark beige
    board.addHole(12, 1, 'black', false);      // 12) Black
    board.addHole(12, 6, 'lightpink', false);  // 13) Light pink
    board.addHole(12, 9, 'yellow', false);     // 14) Yellow
    board.addHole(13, 0, 'orange', true);      // 15) Orange (PERMANENT!)


    // === WALLS (#) ===
    const walls = [
        // Row 0
        { r: 0, c: 7 },
        // Row 1
        { r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 7 }, { r: 1, c: 8 },
        // Row 2
        { r: 2, c: 1 },
        // Row 3
        { r: 3, c: 1 }, { r: 3, c: 2 }, { r: 3, c: 3 }, { r: 3, c: 5 }, { r: 3, c: 6 }, { r: 3, c: 7 }, { r: 3, c: 8 },
        // Row 5
        { r: 5, c: 2 }, { r: 5, c: 4 }, { r: 5, c: 5 }, { r: 5, c: 6 },
        // Row 6
        { r: 6, c: 4 }, { r: 6, c: 6 }, { r: 6, c: 8 }, { r: 6, c: 9 },
        // Row 7
        { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 6 }, { r: 7, c: 8 }, { r: 7, c: 9 },
        // Row 8
        { r: 8, c: 2 }, { r: 8, c: 3 }, { r: 8, c: 4 }, { r: 8, c: 6 },
        // Row 10: SB#R#E###E
        { r: 10, c: 2 }, { r: 10, c: 4 }, { r: 10, c: 6 }, { r: 10, c: 7 }, { r: 10, c: 8 },
        // Row 11
        { r: 11, c: 1 }, { r: 11, c: 2 }, { r: 11, c: 4 }, { r: 11, c: 7 }, { r: 11, c: 8 },
        // Row 12 (c0 is empty)
        { r: 12, c: 4 }, { r: 12, c: 5 }, { r: 12, c: 7 }, { r: 12, c: 8 },
        // Row 13
        { r: 13, c: 1 }
    ];

    walls.forEach(w => board.setCell(w.r, w.c, 'wall'));

    return board;
}
