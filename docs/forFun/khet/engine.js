// Khet Game Engine
// Board: 10 columns × 8 rows
// Pieces: Pharaoh, Sphinx, Pyramid, Scarab, Anubis (Khet 2.0)

export const COLS = 10;
export const ROWS = 8;

// Directions: 0=North(up), 1=East(right), 2=South(down), 3=West(left)
export const DIR = { N: 0, E: 1, S: 2, W: 3 };
export const DIR_NAMES = ['N', 'E', 'S', 'W'];
export const DX = [0, 1, 0, -1];  // col delta per direction
export const DY = [1, 0, -1, 0];  // row delta per direction (N increases row index)

export const PLAYER = { SILVER: 0, RED: 1 };
export const PIECE_TYPE = {
    PHARAOH: 'pharaoh',
    SPHINX: 'sphinx',
    PYRAMID: 'pyramid',
    SCARAB: 'scarab',
    ANUBIS: 'anubis'
};

// Column restrictions: col 0 = silver only, col 9 = red only
// Column restrictions: Silver controls Col J (9), B1, B8. Red controls Col A (0), I1, I8.
function getSquareRestriction(col, row) {
    if (col === 9) return PLAYER.SILVER;
    if (col === 1 && (row === 0 || row === 7)) return PLAYER.SILVER;
    if (col === 0) return PLAYER.RED;
    if (col === 8 && (row === 0 || row === 7)) return PLAYER.RED;
    return null;
}

// ========== Mirror reflection tables ==========
// "/" mirror: going E→N, N→E, W→S, S→W
const SLASH = [DIR.E, DIR.N, DIR.W, DIR.S]; // indexed by incoming dir → outgoing dir
// "\" mirror: going E→S, S→E, W→N, N→W
const BACKSLASH = [DIR.W, DIR.S, DIR.E, DIR.N];

// Pyramid: right-isosceles triangle occupying a diagonal half of the square.
// The "facing" (0-3) identifies WHICH diagonal half-square the triangle occupies.
// The hypotenuse is the mirror; the two cathetus edges are solid (destructible).
//
//   facing 0 (N): NE triangle (verts NW,NE,SE) → hypotenuse NW→SE = "\". Solid: N, E
//   facing 1 (E): SE triangle (verts NE,SE,SW) → hypotenuse NE→SW = "/". Solid: S, E
//   facing 2 (S): SW triangle (verts SE,SW,NW) → hypotenuse SE→NW = "\". Solid: S, W
//   facing 3 (W): NW triangle (verts SW,NW,NE) → hypotenuse SW→NE = "/". Solid: N, W
//
// For each facing: [mirrorTable, solidSide1, solidSide2]
const PYRAMID_CONFIG = [
    [BACKSLASH, DIR.N, DIR.E],   // NE triangle, \ mirror
    [SLASH, DIR.S, DIR.E],   // SE triangle, / mirror
    [BACKSLASH, DIR.S, DIR.W],   // SW triangle, \ mirror
    [SLASH, DIR.N, DIR.W],   // NW triangle, / mirror
];

// Scarab: always reflects (never destroyed). Mirror type depends on facing:
//   N(0) or S(2): "\" mirror (NW-SE diagonal)
//   E(1) or W(3): "/" mirror (SW-NE diagonal)
function scarabMirror(facing) {
    return (facing === DIR.N || facing === DIR.S) ? BACKSLASH : SLASH;
}

// ========== Piece ==========
export class Piece {
    constructor(type, player, facing) {
        this.type = type;
        this.player = player;
        this.facing = facing; // 0-3
    }
    clone() { return new Piece(this.type, this.player, this.facing); }
}

// ========== Game State ==========
export class KhetGame {
    constructor() {
        this.board = new Array(COLS * ROWS).fill(null);
        this.currentPlayer = PLAYER.SILVER;
        this.winner = null;
        this.lastLaserPath = [];
        this.lastHitPiece = null;
        this.moveHistory = [];
        this.setupClassic();
    }

    clone() {
        const g = Object.create(KhetGame.prototype);
        g.board = this.board.map(p => p ? p.clone() : null);
        g.currentPlayer = this.currentPlayer;
        g.winner = this.winner;
        g.lastLaserPath = [];
        g.lastHitPiece = null;
        g.moveHistory = [];
        return g;
    }

    idx(c, r) { return r * COLS + c; }

    getAt(c, r) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return undefined;
        return this.board[r * COLS + c];
    }

    setAt(c, r, piece) { this.board[r * COLS + c] = piece; }

    // ---- Classic (Khet 2.0) starting layout ----
    // This is the official "Classic" setup from the manual.
    // Board is 10x8. 180-degree rotational symmetry.
    setupClassic() {
        this.board.fill(null);
        const P = PIECE_TYPE, S = PLAYER.SILVER, R = PLAYER.RED, D = DIR;

        // Define Silver's 13 pieces. 
        // We pick 13 squares such that no square is the 180-degree mirror of another on this list.
        const silverPieces = [
            // [col, row, type, facing]
            [9, 0, P.SPHINX, D.N],
            [4, 0, P.PHARAOH, D.N],
            [3, 0, P.ANUBIS, D.N],
            [5, 0, P.ANUBIS, D.N],
            [4, 3, P.SCARAB, D.W],
            [5, 3, P.SCARAB, D.N],
            [2, 0, P.PYRAMID, D.E],
            [2, 3, P.PYRAMID, D.E],
            [2, 4, P.PYRAMID, D.N],
            [3, 5, P.PYRAMID, D.E],
            [7, 1, P.PYRAMID, D.S],
            [9, 3, P.PYRAMID, D.N],
            [9, 4, P.PYRAMID, D.E]
        ];

        for (const [c, r, type, facing] of silverPieces) {
            this.setAt(c, r, new Piece(type, S, facing));
            // Mirror for Red
            const rc = (COLS - 1) - c;
            const rr = (ROWS - 1) - r;
            const rf = (facing + 2) % 4;
            this.setAt(rc, rr, new Piece(type, R, rf));
        }
    }

    // ---- Legal move generation ----
    getLegalMoves() {
        if (this.winner !== null) return [];
        const moves = [];
        const cp = this.currentPlayer;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const piece = this.board[r * COLS + c];
                if (!piece || piece.player !== cp) continue;

                // Rotations
                if (piece.type === PIECE_TYPE.SPHINX) {
                    // Sphinx can only face into the board
                    if (cp === PLAYER.SILVER) {
                        // Silver sphinx is at (0,0), can face N(0) or E(1)
                        const others = piece.facing === DIR.N ? [DIR.E] : [DIR.N];
                        for (const f of others) {
                            moves.push({ type: 'rotate', col: c, row: r, toFacing: f });
                        }
                    } else {
                        // Red sphinx is at (9,7), can face S(2) or W(3)
                        const others = piece.facing === DIR.S ? [DIR.W] : [DIR.S];
                        for (const f of others) {
                            moves.push({ type: 'rotate', col: c, row: r, toFacing: f });
                        }
                    }
                } else {
                    moves.push({ type: 'rotate', col: c, row: r, dir: 1 });
                    moves.push({ type: 'rotate', col: c, row: r, dir: -1 });
                }

                if (piece.type === PIECE_TYPE.SPHINX) continue; // can rotate, cannot move

                // 8-directional moves
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nc = c + dc, nr = r + dr;
                        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;

                        const restriction = getSquareRestriction(nc, nr);
                        if (restriction !== null && restriction !== cp) continue;

                        const target = this.getAt(nc, nr);
                        if (!target) {
                            moves.push({ type: 'move', col: c, row: r, toCol: nc, toRow: nr });
                        } else if (
                            piece.type === PIECE_TYPE.SCARAB &&
                            (target.type === PIECE_TYPE.PYRAMID || target.type === PIECE_TYPE.ANUBIS)
                        ) {
                            // Scarab swap: ensure the displaced piece can legally sit on (c,r)
                            const srcRestriction = getSquareRestriction(c, r);
                            if (srcRestriction !== null && srcRestriction !== target.player) continue;
                            moves.push({ type: 'swap', col: c, row: r, toCol: nc, toRow: nr });
                        }
                    }
                }
            }
        }
        return moves;
    }

    // ---- Apply a move, fire laser, switch player ----
    applyMove(move) {
        const p = this.getAt(move.col, move.row);
        if (!p) return null;

        console.log(`Move: ${p.player === PLAYER.SILVER ? 'Silver' : 'Red'} ${p.type} at (${move.col},${move.row}) -> ${move.type}`, move);

        if (move.type === 'rotate') {
            if (move.toFacing !== undefined) {
                p.facing = move.toFacing;
            } else {
                p.facing = (p.facing + (move.dir || 0) + 4) % 4;
            }
        } else if (move.type === 'move') {
            this.setAt(move.col, move.row, null);
            this.setAt(move.toCol, move.toRow, p);
        } else if (move.type === 'swap') {
            const b = this.getAt(move.toCol, move.toRow);
            this.setAt(move.col, move.row, b);
            this.setAt(move.toCol, move.toRow, p);
        }

        const hitInfo = this.fireLaser();
        this.currentPlayer = 1 - this.currentPlayer;
        return hitInfo;
    }

    // ---- Laser tracing ----
    fireLaser() {
        // Find this player's sphinx
        let sc = -1, sr = -1, sphinx = null;
        for (let r = 0; r < ROWS && !sphinx; r++)
            for (let c = 0; c < COLS && !sphinx; c++) {
                const p = this.board[r * COLS + c];
                if (p && p.type === PIECE_TYPE.SPHINX && p.player === this.currentPlayer) {
                    sc = c; sr = r; sphinx = p;
                }
            }
        if (!sphinx) return;

        let lc = sc, lr = sr, dir = sphinx.facing;
        const path = [{ col: lc, row: lr, dir }];
        let hitResult = null;

        for (let step = 0; step < 200; step++) {
            lc += DX[dir];
            lr += DY[dir];
            if (lc < 0 || lc >= COLS || lr < 0 || lr >= ROWS) {
                path.push({ col: lc, row: lr, dir, offBoard: true });
                break;
            }
            path.push({ col: lc, row: lr, dir });

            const piece = this.board[lr * COLS + lc];
            if (!piece) continue;

            const result = this.laserHit(piece, dir);
            if (result.action === 'reflect') {
                dir = result.newDir;
                path[path.length - 1].reflectDir = dir;
            } else if (result.action === 'destroy') {
                hitResult = { piece, col: lc, row: lr };
                path[path.length - 1].hit = true;
                break;
            } else { // block
                path[path.length - 1].blocked = true;
                break;
            }
        }

        this.lastLaserPath = path;
        this.lastHitPiece = hitResult ? hitResult.piece : null;
        this.pendingHit = hitResult;
        return hitResult;
    }

    resolveLaserHit() {
        if (!this.pendingHit) return;
        const { piece, col, row } = this.pendingHit;
        this.setAt(col, row, null);
        if (piece.type === PIECE_TYPE.PHARAOH) {
            this.winner = 1 - piece.player;
        }
        this.pendingHit = null;
    }

    laserHit(piece, laserDir) {
        const hitSide = (laserDir + 2) % 4; // side of piece the laser enters from

        switch (piece.type) {
            case PIECE_TYPE.SPHINX:
                return { action: 'block' };

            case PIECE_TYPE.PHARAOH:
                return { action: 'destroy' };

            case PIECE_TYPE.ANUBIS:
                return { action: hitSide === piece.facing ? 'block' : 'destroy' };

            case PIECE_TYPE.PYRAMID: {
                const [mirror, s1, s2] = PYRAMID_CONFIG[piece.facing];
                if (hitSide === s1 || hitSide === s2) return { action: 'destroy' };
                return { action: 'reflect', newDir: mirror[laserDir] };
            }

            case PIECE_TYPE.SCARAB:
                return { action: 'reflect', newDir: scarabMirror(piece.facing)[laserDir] };

            default:
                return { action: 'destroy' };
        }
    }

    // ---- Board hash for transposition table ----
    getHash() {
        let h = '' + this.currentPlayer;
        for (let i = 0; i < this.board.length; i++) {
            const p = this.board[i];
            if (p) h += `|${i}:${p.type[0]}${p.player}${p.facing}`;
        }
        return h;
    }
}
