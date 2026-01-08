#!/usr/bin/env python3
from __future__ import annotations

import sys
from dataclasses import dataclass
from math import log1p
from typing import Dict, List, Optional, Tuple

from flint import fmpz, fmpq, fmpq_mat

def make_mat(a11, a12, a21, a22) -> fmpq_mat:
    return fmpq_mat(2, 2, [a11, a12, a21, a22])

I = make_mat(1, 0, 0, 1)

def mat_mul(X: fmpq_mat, Y: fmpq_mat) -> fmpq_mat:
    return X * Y

def entry_bits(x: fmpq) -> int:
    # Bit-size proxy for height: max(bitlen(|num|), bitlen(den))
    n = x.numerator
    d = x.denominator
    nn = int(abs(n))
    dd = int(abs(d))
    return max(nn.bit_length(), dd.bit_length())

def score_matrix(M: fmpq_mat) -> float:
    # Heuristic: how close to identity, using bit-sizes of entries of (M - I)
    D = M - I
    bits = 0
    for i in range(2):
        for j in range(2):
            bits += entry_bits(D[i, j])
    return float(bits)

def mat_key(M: fmpq_mat) -> Tuple[str, ...]:
    # Exact, stable key for dedup (stringified num/den pairs).
    out: List[str] = []
    for i in range(2):
        for j in range(2):
            x = M[i, j]
            out.append(f"{x.numerator}/{x.denominator}")
    return tuple(out)

@dataclass(frozen=True)
class Move:
    name: str
    mat: fmpq_mat
    inv_name: str

@dataclass
class State:
    M: fmpq_mat
    word: Tuple[str, ...]
    last: Optional[str]
    score: float

def format_matrix_2x2(M: fmpq_mat) -> str:
    s00 = f"{M[0,0].numerator}/{M[0,0].denominator}"
    s01 = f"{M[0,1].numerator}/{M[0,1].denominator}"
    s10 = f"{M[1,0].numerator}/{M[1,0].denominator}"
    s11 = f"{M[1,1].numerator}/{M[1,1].denominator}"
    
    w0 = max(len(s00), len(s10))
    w1 = max(len(s01), len(s11))
    
    line1 = f"[ {s00.rjust(w0)}  {s01.rjust(w1)} ]"
    line2 = f"[ {s10.rjust(w0)}  {s11.rjust(w1)} ]"
    return "\n" + line1 + "\n" + line2

def setup_generators(frac_str: str) -> List[Move]:
    try:
        if '/' in frac_str:
            n_str, d_str = frac_str.split('/')
            n, d = int(n_str), int(d_str)
        else:
            n, d = int(frac_str), 1
        u = fmpq(n, d)
    except ValueError:
        print(f"Invalid fraction: {frac_str}. Using default 28/17.")
        u = fmpq(28, 17)
    
    print(f"Using parameter u = {u.numerator}/{u.denominator}")

    # Generators
    A = make_mat(1, u, 0, 1)
    B = make_mat(1, 0, 1, 1)

    # Inverses
    Ai = make_mat(1, -u, 0, 1)
    Bi = make_mat(1, 0, -1, 1)
    
    return [
        Move("a", A, "A"),
        Move("A", Ai, "a"),
        Move("b", B, "B"),
        Move("B", Bi, "b"),
    ]

def beam_search_relation(
    moves: List[Move],
    max_depth: int = 40,
    beam_width: int = 2000,
    expansions_cap: Optional[int] = None,
    verbose_every: int = 1,
) -> Optional[State]:
    """
    Beam search for a nontrivial word w with product = I.
    """
    init = State(M=I, word=tuple(), last=None, score=0.0)
    beam: List[State] = [init]

    visited: Dict[Tuple[str, ...], float] = {mat_key(I): 0.0}

    for depth in range(1, max_depth + 1):
        candidates: List[State] = []

        for st in beam:
            for mv in moves:
                if st.last is not None:
                    # no immediate cancellation
                    last_inv = next(m.inv_name for m in moves if m.name == st.last)
                    if mv.name == last_inv:
                        continue

                M2 = mat_mul(st.M, mv.mat)
                w2 = st.word + (mv.name,)
                if M2 == I and len(w2) > 0:
                    return State(M=M2, word=w2, last=mv.name, score=0.0)

                s2 = score_matrix(M2) + 0.01 * len(w2)
                k2 = mat_key(M2)
                best = visited.get(k2)
                if best is None or s2 < best:
                    visited[k2] = s2
                    candidates.append(State(M=M2, word=w2, last=mv.name, score=s2))

        candidates.sort(key=lambda x: x.score)
        if expansions_cap is not None:
            candidates = candidates[:expansions_cap]
        beam = candidates[:beam_width]

        if verbose_every and depth % verbose_every == 0:
            if beam:
                print(
                    f"[depth={depth}] kept={len(beam)}  best_score={beam[0].score:.2f}  "
                    f"best_word={'.'.join(beam[0].word)}"
                    f"{format_matrix_2x2(beam[0].M)}"
                )
            else:
                print(f"[depth={depth}] beam empty; stopping.")
                return None

    return None

def verify_word(word: Tuple[str, ...], moves: List[Move]) -> fmpq_mat:
    name_to_mat = {m.name: m.mat for m in moves}
    M = I
    for s in word:
        M = M * name_to_mat[s]
    return M

if __name__ == "__main__":
    MAX_DEPTH = 1000
    BEAM_WIDTH = 10000

    frac_input = "28/17"
    if len(sys.argv) > 1:
        frac_input = sys.argv[1]

    moves = setup_generators(frac_input)

    ans = beam_search_relation(moves, max_depth=MAX_DEPTH, beam_width=BEAM_WIDTH)
    if ans is None:
        print("No relation found within the given search limits.")
    else:
        w = ".".join(ans.word)
        print("\nFOUND RELATION:")
        print("  word =", w)
        M = verify_word(ans.word, moves)
        print("  product =", M)
        print("  is_identity =", (M == I))