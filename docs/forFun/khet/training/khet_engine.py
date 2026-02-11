"""
Khet Game Engine — Python port of engine.js
Board: 10 columns × 8 rows
Pieces: Pharaoh, Sphinx, Pyramid, Scarab, Anubis
"""
import copy
from enum import IntEnum
from typing import Optional, List, Dict, Tuple

COLS = 10
ROWS = 8

class Dir(IntEnum):
    N = 0
    E = 1
    S = 2
    W = 3

DX = [0, 1, 0, -1]
DY = [1, 0, -1, 0]  # N increases row index

class Player(IntEnum):
    SILVER = 0
    RED = 1

class PieceType:
    PHARAOH = "pharaoh"
    SPHINX = "sphinx"
    PYRAMID = "pyramid"
    SCARAB = "scarab"
    ANUBIS = "anubis"
    ALL = [PHARAOH, SPHINX, PYRAMID, SCARAB, ANUBIS]

# Piece type → integer index for tensor encoding
PIECE_INDEX = {
    PieceType.PHARAOH: 0,
    PieceType.SPHINX: 1,
    PieceType.PYRAMID: 2,
    PieceType.SCARAB: 3,
    PieceType.ANUBIS: 4,
}

# Mirror tables
# "/" mirror: E→N, N→E, W→S, S→W
SLASH = [Dir.E, Dir.N, Dir.W, Dir.S]
# "\" mirror: E→S, S→E, W→N, N→W
BACKSLASH = [Dir.W, Dir.S, Dir.E, Dir.N]

# Pyramid config: [mirror_table, solid_side_1, solid_side_2]
PYRAMID_CONFIG = [
    (BACKSLASH, Dir.N, Dir.E),  # facing 0 (N): NE triangle, \ mirror
    (SLASH, Dir.S, Dir.E),      # facing 1 (E): SE triangle, / mirror
    (BACKSLASH, Dir.S, Dir.W),  # facing 2 (S): SW triangle, \ mirror
    (SLASH, Dir.N, Dir.W),      # facing 3 (W): NW triangle, / mirror
]


def scarab_mirror(facing: int) -> list:
    return BACKSLASH if (facing == Dir.N or facing == Dir.S) else SLASH


def get_square_restriction(col: int, row: int) -> Optional[int]:
    """Silver controls Col J (9), B1 (1,0), B8 (1,7). Red controls Col A (0), I1 (8,0), I8 (8,7)."""
    if col == 9:
        return Player.SILVER
    if col == 1 and (row == 0 or row == 7):
        return Player.SILVER
    if col == 0:
        return Player.RED
    if col == 8 and (row == 0 or row == 7):
        return Player.RED
    return None


class Piece:
    __slots__ = ("type", "player", "facing")

    def __init__(self, piece_type: str, player: int, facing: int):
        self.type = piece_type
        self.player = player
        self.facing = facing  # 0-3

    def clone(self):
        return Piece(self.type, self.player, self.facing)

    def __repr__(self):
        p = "S" if self.player == Player.SILVER else "R"
        return f"{self.type[0].upper()}{p}{self.facing}"


class Move:
    __slots__ = ("type", "col", "row", "to_col", "to_row", "dir", "to_facing")

    def __init__(self, move_type: str, col: int, row: int, *,
                 to_col: int = -1, to_row: int = -1,
                 direction: int = 0, to_facing: int = -1):
        self.type = move_type
        self.col = col
        self.row = row
        self.to_col = to_col
        self.to_row = to_row
        self.dir = direction
        self.to_facing = to_facing

    def __repr__(self):
        if self.type == "rotate":
            if self.to_facing >= 0:
                return f"rotate({self.col},{self.row})->f{self.to_facing}"
            return f"rotate({self.col},{self.row}){'CW' if self.dir == 1 else 'CCW'}"
        return f"{self.type}({self.col},{self.row})->({self.to_col},{self.to_row})"

    def to_index(self) -> int:
        """Encode move as a unique integer for policy output."""
        base = self.row * COLS + self.col  # 0..79
        if self.type == "rotate":
            if self.to_facing >= 0:
                return base * 12 + 8 + self.to_facing  # 8,9,10,11
            return base * 12 + (9 if self.dir == 1 else 8)  # CW=9, CCW=8
        elif self.type == "move" or self.type == "swap":
            dc = self.to_col - self.col
            dr = self.to_row - self.row
            # 8 directions: map (dc, dr) -> 0..7
            dir_map = {
                (-1, -1): 0, (0, -1): 1, (1, -1): 2,
                (-1,  0): 3,               (1,  0): 4,
                (-1,  1): 5, (0,  1): 6, (1,  1): 7,
            }
            d = dir_map.get((dc, dr), 0)
            if self.type == "swap":
                # We don't have a separate index for swaps;
                # they share the same direction slot as moves.
                # The engine disambiguates since swaps are only legal for scarabs.
                pass
            return base * 12 + d
        return 0

    @staticmethod
    def max_index() -> int:
        return COLS * ROWS * 12  # 960


class KhetGame:
    def __init__(self, setup: bool = True):
        self.board: List[Optional[Piece]] = [None] * (COLS * ROWS)
        self.current_player: int = Player.SILVER
        self.winner: Optional[int] = None
        self.last_hit_piece: Optional[Piece] = None
        self.move_count: int = 0
        if setup:
            self.setup_classic()

    def clone(self) -> "KhetGame":
        g = KhetGame(setup=False)
        g.board = [p.clone() if p else None for p in self.board]
        g.current_player = self.current_player
        g.winner = self.winner
        g.move_count = self.move_count
        return g

    def get_at(self, c: int, r: int) -> Optional[Piece]:
        if c < 0 or c >= COLS or r < 0 or r >= ROWS:
            return None
        return self.board[r * COLS + c]

    def set_at(self, c: int, r: int, piece: Optional[Piece]):
        self.board[r * COLS + c] = piece

    # ---- Classic (Khet 2.0) starting layout ----
    def setup_classic(self):
        self.board = [None] * (COLS * ROWS)
        silver_pieces = [
            (9, 0, PieceType.SPHINX, Dir.N),
            (4, 0, PieceType.PHARAOH, Dir.N),
            (3, 0, PieceType.ANUBIS, Dir.N),
            (5, 0, PieceType.ANUBIS, Dir.N),
            (4, 3, PieceType.SCARAB, Dir.W),
            (5, 3, PieceType.SCARAB, Dir.N),
            (2, 0, PieceType.PYRAMID, Dir.E),
            (2, 3, PieceType.PYRAMID, Dir.E),
            (2, 4, PieceType.PYRAMID, Dir.N),
            (3, 5, PieceType.PYRAMID, Dir.E),
            (7, 1, PieceType.PYRAMID, Dir.S),
            (9, 3, PieceType.PYRAMID, Dir.N),
            (9, 4, PieceType.PYRAMID, Dir.E),
        ]
        for c, r, ptype, facing in silver_pieces:
            self.set_at(c, r, Piece(ptype, Player.SILVER, facing))
            rc = (COLS - 1) - c
            rr = (ROWS - 1) - r
            rf = (facing + 2) % 4
            self.set_at(rc, rr, Piece(ptype, Player.RED, rf))

    # ---- Legal move generation ----
    def get_legal_moves(self) -> List[Move]:
        if self.winner is not None:
            return []
        moves = []
        cp = self.current_player
        for r in range(ROWS):
            for c in range(COLS):
                piece = self.board[r * COLS + c]
                if piece is None or piece.player != cp:
                    continue

                # Rotations
                if piece.type == PieceType.SPHINX:
                    if cp == Player.SILVER:
                        others = [Dir.E] if piece.facing == Dir.N else [Dir.N]
                    else:
                        others = [Dir.W] if piece.facing == Dir.S else [Dir.S]
                    for f in others:
                        moves.append(Move("rotate", c, r, to_facing=f))
                else:
                    moves.append(Move("rotate", c, r, direction=1))
                    moves.append(Move("rotate", c, r, direction=-1))

                if piece.type == PieceType.SPHINX:
                    continue

                # 8-directional moves
                for dr in range(-1, 2):
                    for dc in range(-1, 2):
                        if dr == 0 and dc == 0:
                            continue
                        nc, nr = c + dc, r + dr
                        if nc < 0 or nc >= COLS or nr < 0 or nr >= ROWS:
                            continue
                        restriction = get_square_restriction(nc, nr)
                        if restriction is not None and restriction != cp:
                            continue
                        target = self.get_at(nc, nr)
                        if target is None:
                            moves.append(Move("move", c, r, to_col=nc, to_row=nr))
                        elif (piece.type == PieceType.SCARAB and
                              target.type in (PieceType.PYRAMID, PieceType.ANUBIS)):
                            src_restriction = get_square_restriction(c, r)
                            if src_restriction is not None and src_restriction != target.player:
                                continue
                            moves.append(Move("swap", c, r, to_col=nc, to_row=nr))
        return moves

    # ---- Apply move, fire laser, switch player ----
    def apply_move(self, move: Move):
        p = self.get_at(move.col, move.row)
        if p is None:
            return

        if move.type == "rotate":
            if move.to_facing >= 0:
                p.facing = move.to_facing
            else:
                p.facing = (p.facing + move.dir + 4) % 4
        elif move.type == "move":
            self.set_at(move.col, move.row, None)
            self.set_at(move.to_col, move.to_row, p)
        elif move.type == "swap":
            b = self.get_at(move.to_col, move.to_row)
            self.set_at(move.col, move.row, b)
            self.set_at(move.to_col, move.to_row, p)

        self._fire_laser()
        self.current_player = 1 - self.current_player
        self.move_count += 1

    def _fire_laser(self):
        # Find current player's sphinx
        sphinx = None
        sc, sr = -1, -1
        for r in range(ROWS):
            for c in range(COLS):
                p = self.board[r * COLS + c]
                if p and p.type == PieceType.SPHINX and p.player == self.current_player:
                    sc, sr, sphinx = c, r, p
                    break
            if sphinx:
                break
        if sphinx is None:
            return

        lc, lr, d = sc, sr, sphinx.facing
        self.last_hit_piece = None

        for _ in range(200):
            lc += DX[d]
            lr += DY[d]
            if lc < 0 or lc >= COLS or lr < 0 or lr >= ROWS:
                break

            piece = self.board[lr * COLS + lc]
            if piece is None:
                continue

            result = self._laser_hit(piece, d)
            if result[0] == "reflect":
                d = result[1]
            elif result[0] == "destroy":
                self.last_hit_piece = piece
                self.set_at(lc, lr, None)
                if piece.type == PieceType.PHARAOH:
                    self.winner = 1 - piece.player
                break
            else:  # block
                break

    @staticmethod
    def _laser_hit(piece: Piece, laser_dir: int) -> Tuple[str, int]:
        hit_side = (laser_dir + 2) % 4

        if piece.type == PieceType.SPHINX:
            return ("block", 0)
        elif piece.type == PieceType.PHARAOH:
            return ("destroy", 0)
        elif piece.type == PieceType.ANUBIS:
            return ("block", 0) if hit_side == piece.facing else ("destroy", 0)
        elif piece.type == PieceType.PYRAMID:
            mirror, s1, s2 = PYRAMID_CONFIG[piece.facing]
            if hit_side == s1 or hit_side == s2:
                return ("destroy", 0)
            return ("reflect", mirror[laser_dir])
        elif piece.type == PieceType.SCARAB:
            return ("reflect", scarab_mirror(piece.facing)[laser_dir])
        else:
            return ("destroy", 0)

    # ---- Board tensor for neural network ----
    def to_tensor_planes(self) -> "numpy.ndarray":
        """
        Encode board as a (C, ROWS, COLS) float32 tensor.
        Channels:
          0-4:  current player's pieces (pharaoh, sphinx, pyramid, scarab, anubis)
          5-9:  opponent's pieces
          10-13: facing direction (one-hot per piece, 4 channels)
          14:   current player indicator (all 1s if silver, all 0s if red)
          15:   move count / 300 (temporal feature)
        Total: 16 channels
        """
        import numpy as np
        planes = np.zeros((16, ROWS, COLS), dtype=np.float32)

        for r in range(ROWS):
            for c in range(COLS):
                piece = self.board[r * COLS + c]
                if piece is None:
                    continue
                idx = PIECE_INDEX[piece.type]
                is_current = (piece.player == self.current_player)
                offset = 0 if is_current else 5
                planes[offset + idx, r, c] = 1.0
                planes[10 + piece.facing, r, c] = 1.0

        if self.current_player == Player.SILVER:
            planes[14, :, :] = 1.0
        planes[15, :, :] = min(self.move_count / 300.0, 1.0)

        return planes

    def __repr__(self):
        rows = []
        for r in range(ROWS - 1, -1, -1):
            row_str = f"{r + 1} "
            for c in range(COLS):
                p = self.get_at(c, r)
                if p is None:
                    row_str += " .  "
                else:
                    row_str += f" {p} "
            rows.append(row_str)
        rows.append("  " + "".join(f"  {chr(65+c)} " for c in range(COLS)))
        return "\n".join(rows)
