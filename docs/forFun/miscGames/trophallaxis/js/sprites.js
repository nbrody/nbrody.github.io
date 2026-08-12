/* ============================================================
   TROPHALLAXIS — pixel art, palettes, bitmap font
   All sprites are authored facing NORTH and rotated in exact
   90-degree steps so the pixel grid is never resampled.
   ============================================================ */

const PAL = {
    '.': null,
    K: '#150d08', // outline
    H: '#c8892f', // worker head
    h: '#8a5a1c',
    B: '#f0dcb0', // body pale
    b: '#c2a878',
    G: '#7fd94e', // hindgut fluid
    g: '#3f8f2a',
    A: '#eaa93c', // crop food (amber)
    a: '#a86f1c',
    P: '#f4a3bb', // larva pink
    p: '#c9748c',
    O: '#ec6a2c', // soldier orange
    o: '#a63c14',
    M: '#8f2320', // ant carapace
    m: '#571110',
    C: '#6fd7ea', // callow cyan sheen
    c: '#3a97ab',
    W: '#ffffff',
    w: '#cfd8dc',
    R: '#e0403a',
    Y: '#f7e06e',
    E: '#6b4423', // earth
    D: '#2b1a0f',
    S: '#a8874f',
};

/* ---------- sprite art (16x16 unless noted) ---------- */

const ART = {
    // Worker termite, viewed from above, facing north.
    worker: [
        '..K..........K..',
        '...K........K...',
        '....K......K....',
        '.....KHHHHK.....',
        '....KHHHHHHK....',
        '....KHhHHhHK....',
        '....KKHHHHKK....',
        'K....KBBBBK....K',
        '.KKKKBBBBBBKKKK.',
        '....KBBBBBBK....',
        '.KKKKBBBBBBKKKK.',
        'K...KKBBBBKK...K',
        '...KBBBBBBBBK...',
        '...KBGGGGGGBK...',
        '...KBBGGGGBBK...',
        '....KBBBBBBK....',
    ],
    // Soldier: enormous sclerotised head and crossing mandibles.
    soldier: [
        '...O........O...',
        '...KO......OK...',
        '....KO....OK....',
        '....KOOOOOOK....',
        '...KOOOOOOOOK...',
        '...KOoOOOOoOK...',
        '...KOOOOOOOOK...',
        'K...KKOOOOKK...K',
        '.KKKKBBBBBBKKKK.',
        '....KBBBBBBK....',
        '.KKKKBBBBBBKKKK.',
        'K...KKBBBBKK...K',
        '...KBBBBBBBBK...',
        '...KBBBBBBBBK...',
        '...KBBBBBBBBK...',
        '....KBBBBBBK....',
    ],
    // Larva: legless, soft, permanently confused.
    larva: [
        '................',
        '................',
        '................',
        '.....KKKKKK.....',
        '....KPPPPPPK....',
        '...KPPPPPPPPK...',
        '...KPpPPPPpPK...',
        '...KPPPPPPPPK...',
        '...KPPPPPPPPK...',
        '...KPpPPPPpPK...',
        '...KPPPPPPPPK...',
        '....KPPPPPPK....',
        '.....KKKKKK.....',
        '................',
        '................',
        '................',
    ],
    // Ant raider: narrow waist, oversized head.
    ant: [
        '...K.......K....',
        '....K.....K.....',
        '.....KMMMK......',
        '....KMMMMMK.....',
        '....KMmMMmK.....',
        '....KMMMMMK.....',
        '.....KMMMK......',
        'K....KKMKK....K.',
        '.KKKKKMMMKKKKK..',
        'K....KKMKK....K.',
        '.....KMMMK......',
        '....KMMMMMK.....',
        '...KMmMMMmMK....',
        '...KMMMMMMMK....',
        '....KMMMMMK.....',
        '.....KMMMK......',
    ],
    // Queen: physogastric, absurd, immobile, hungry.
    queen: [
        '..K................K....',
        '...K..............K.....',
        '....KK..KHHHHK..KK......',
        '......KKHHHHHHKK........',
        '.......KHhHHhHK.........',
        '......KKKHHHHKKK........',
        '...KKKKKBBBBBBKKKKK.....',
        '..K...KBBBBBBBBBBK..K...',
        '...KKKBBBBBBBBBBBBKKK...',
        '..K..KWWWWWWWWWWWWK..K..',
        '.....KWWbbbbbbbbWWK.....',
        '....KWWWWWWWWWWWWWWK....',
        '....KWWbbbbbbbbbbWWK....',
        '...KWWWWWWWWWWWWWWWWK...',
        '...KWWbbbbbbbbbbbbWWK...',
        '...KWWWWWWWWWWWWWWWWK...',
        '...KWWbbbbbbbbbbbbWWK...',
        '...KWWWWWWWWWWWWWWWWK...',
        '....KWWbbbbbbbbbbWWK....',
        '....KWWWWWWWWWWWWWWK....',
        '.....KWWWWWWWWWWWWK.....',
        '......KKWWWWWWWWKK......',
        '........KKKKKKKK........',
        '........................',
    ],
    // Chunk of chewed wood.
    wood: [
        '................',
        '................',
        '..KKKKKKKKKKKK..',
        '..KEEEEEEEEEEK..',
        '..KESEEEESEEEK..',
        '..KEEEEEEEEEEK..',
        '..KEESEEEEESEK..',
        '..KEEEEEEEEEEK..',
        '..KESEEESEEEEK..',
        '..KEEEEEEEEEEK..',
        '..KEESEEEEESEK..',
        '..KEEEEEEEEEEK..',
        '..KKKKKKKKKKKK..',
        '................',
        '................',
        '................',
    ],
    // Protozoa bloom pickup.
    bloom: [
        '................',
        '................',
        '.....KKKKKK.....',
        '....KGGGGGGK....',
        '...KGGgggGGGK...',
        '...KGgGWWgGGK...',
        '..KGGgGWWgGGGK..',
        '..KGGgggggGGGK..',
        '..KGGGgggGGGGK..',
        '..KGGGGGGGGGGK..',
        '...KGGGGGGGGK...',
        '...KGGGGGGGGK...',
        '....KGGGGGGK....',
        '.....KKKKKK.....',
        '................',
        '................',
    ],
    // Royal pheromone pickup.
    pheromone: [
        '................',
        '................',
        '.......KK.......',
        '......KYYK......',
        '......KYYK......',
        '.....KYYYYK.....',
        '.....KYYYYK.....',
        '....KYYYYYYK....',
        '....KYWYYWYK....',
        '...KYYYYYYYYK...',
        '...KYYYYYYYYK...',
        '...KYYWYYWYYK...',
        '....KYYYYYYK....',
        '.....KKKKKK.....',
        '................',
        '................',
    ],
    // Droplet used for the transfer stream + HUD pips.
    drop: [
        '..K..',
        '.KGK.',
        'KGGGK',
        'KGGGK',
        '.KKK.',
    ],
};

/* Palette recolourings of shared art. */
const VARIANTS = {
    worker: {},
    // Freshly moulted: pale, glassy, cyan sheen. Needs proctodeal fluid.
    callow: { B: PAL.W, b: PAL.C, H: PAL.C, h: PAL.c },
    // Older nymph: darker, also proctodeal.
    nymph: { B: '#e6c98d', b: '#a8834c' },
    soldier: {},
    larva: {},
    ant: {},
    queen: {},
};

const _cache = new Map();

function buildSprite(art, overrides) {
    const h = art.length, w = art[0].length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
        const row = art[y];
        for (let x = 0; x < w; x++) {
            const ch = row[x];
            if (ch === '.' || ch === undefined) continue;
            const col = (overrides && overrides[ch]) || PAL[ch];
            if (!col) continue;
            g.fillStyle = col;
            g.fillRect(x, y, 1, 1);
        }
    }
    return cv;
}

function rotate90(src, turns) {
    turns = ((turns % 4) + 4) % 4;
    if (turns === 0) return src;
    const w = src.width, h = src.height;
    const cv = document.createElement('canvas');
    cv.width = (turns % 2) ? h : w;
    cv.height = (turns % 2) ? w : h;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(cv.width / 2, cv.height / 2);
    g.rotate(turns * Math.PI / 2);
    g.drawImage(src, -w / 2, -h / 2);
    return cv;
}

/**
 * getSprite('worker', 'callow', dir) — dir 0=N 1=E 2=S 3=W.
 * Extra palette overrides (e.g. a flashing white hit frame) via `extra`.
 */
function getSprite(artName, variant, dir, extra) {
    const key = artName + '|' + (variant || '') + '|' + (dir | 0) + '|' + (extra ? extra.key : '');
    let s = _cache.get(key);
    if (s) return s;
    const over = Object.assign({}, VARIANTS[variant] || {}, extra ? extra.pal : null);
    s = rotate90(buildSprite(ART[artName], over), dir | 0);
    _cache.set(key, s);
    return s;
}

/* Whole-sprite tints used for flashing / fading. */
const TINT_WHITE = { key: 'white', pal: fillAll('#ffffff') };
const TINT_RED = { key: 'red', pal: fillAll('#e0403a') };
const TINT_PALE = { key: 'pale', pal: { B: '#8b8f86', b: '#5f635c', H: '#7b7a6a', h: '#4c4b41', G: '#4a4f45', O: '#8a7a6a', o: '#59503f', P: '#a89aa0', p: '#786a70' } };

function fillAll(col) {
    const o = {};
    for (const k in PAL) if (k !== '.') o[k] = col;
    return o;
}

/* ---------- 5x7 bitmap font ---------- */

const GLYPHS = {
    A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
    B: '####./#...#/#...#/####./#...#/#...#/####.',
    C: '.####/#..../#..../#..../#..../#..../.####',
    D: '####./#...#/#...#/#...#/#...#/#...#/####.',
    E: '#####/#..../#..../####./#..../#..../#####',
    F: '#####/#..../#..../####./#..../#..../#....',
    G: '.####/#..../#..../#..##/#...#/#...#/.###.',
    H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    I: '#####/..#../..#../..#../..#../..#../#####',
    J: '....#/....#/....#/....#/#...#/#...#/.###.',
    K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    L: '#..../#..../#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
    O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    P: '####./#...#/#...#/####./#..../#..../#....',
    Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    R: '####./#...#/#...#/####./#.#../#..#./#...#',
    S: '.####/#..../#..../.###./....#/....#/####.',
    T: '#####/..#../..#../..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
    X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
    Z: '#####/....#/...#./..#../.#.../#..../#####',
    '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    '1': '..#../.##../..#../..#../..#../..#../.###.',
    '2': '.###./#...#/....#/...#./..#../.#.../#####',
    '3': '####./....#/....#/.###./....#/....#/####.',
    '4': '#..#./#..#./#..#./#####/...#./...#./...#.',
    '5': '#####/#..../####./....#/....#/#...#/.###.',
    '6': '.###./#..../#..../####./#...#/#...#/.###.',
    '7': '#####/....#/...#./..#../.#.../.#.../.#...',
    '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
    '9': '.###./#...#/#...#/.####/....#/....#/.###.',
    ' ': '...../...../...../...../...../...../.....',
    '.': '...../...../...../...../...../...../..#..',
    ',': '...../...../...../...../..#../..#../.#...',
    ':': '...../..#../..#../...../..#../..#../.....',
    '!': '..#../..#../..#../..#../..#../...../..#..',
    '?': '.###./#...#/....#/..##./..#../...../..#..',
    '-': '...../...../...../#####/...../...../.....',
    '+': '...../..#../..#../#####/..#../..#../.....',
    '=': '...../...../#####/...../#####/...../.....',
    '/': '....#/....#/...#./..#../.#.../#..../#....',
    "'": '..#../..#../...../...../...../...../.....',
    '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
    ')': '.#.../..#../...#./...#./...#./..#../.#...',
    '<': '...#./..#../.#.../#..../.#.../..#../...#.',
    '>': '.#.../..#../...#./....#/...#./..#../.#...',
    '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
    '^': '..#../.###./#####/..#../..#../..#../.....',
    '%': '#...#/...#./..#../.#.../#..../...../#...#',
};

const GLYPH_W = 5, GLYPH_H = 7, GLYPH_GAP = 1;

const _glyphCache = new Map();
function glyphCanvas(ch, color) {
    const key = ch + color;
    let c = _glyphCache.get(key);
    if (c) return c;
    const rows = (GLYPHS[ch] || GLYPHS['?']).split('/');
    const cv = document.createElement('canvas');
    cv.width = GLYPH_W; cv.height = GLYPH_H;
    const g = cv.getContext('2d');
    g.fillStyle = color;
    for (let y = 0; y < GLYPH_H; y++)
        for (let x = 0; x < GLYPH_W; x++)
            if (rows[y] && rows[y][x] === '#') g.fillRect(x, y, 1, 1);
    _glyphCache.set(key, cv);
    return cv;
}

function textWidth(str, scale) {
    scale = scale || 1;
    return str.length ? (str.length * (GLYPH_W + GLYPH_GAP) - GLYPH_GAP) * scale : 0;
}

function drawText(ctx, str, x, y, color, scale) {
    scale = scale || 1;
    str = String(str).toUpperCase();
    let cx = Math.round(x);
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (ch !== ' ') ctx.drawImage(glyphCanvas(ch, color), cx, Math.round(y), GLYPH_W * scale, GLYPH_H * scale);
        cx += (GLYPH_W + GLYPH_GAP) * scale;
    }
}

function drawTextCentered(ctx, str, cx, y, color, scale) {
    drawText(ctx, str, cx - textWidth(String(str).toUpperCase(), scale || 1) / 2, y, color, scale);
}
