#!/usr/bin/env python3
"""
FlashBeam Search for Relations in the Burau Image of F₂  ⊂  B₄
================================================================

Birman, Proposition 3.19:  In B₄, the elements

    X  =  σ₃ σ₁⁻¹
    Y  =  σ₂ σ₃ σ₁⁻¹ σ₂⁻¹

generate a free group F₂ in the braid group.  Their reduced Burau
images are 3×3 matrices over ℤ[t, t⁻¹]:

            ⎡ -t⁻¹   t⁻¹    0  ⎤            ⎡   0    -t⁻²   t⁻²  ⎤
    X   =   ⎢   0      1     0  ⎥    Y   =   ⎢   0    -t⁻¹  -t+t⁻¹⎥
            ⎣   0      t    -t  ⎦            ⎣   t     -1    -t+1  ⎦

Strategy: Specialize to a concrete value of t (e.g. t = −1 or t = i)
to get finite integer (or Gaussian integer) matrices, then use FlashBeam
to find non-trivial words W(X,Y,X⁻¹,Y⁻¹) = I in GL₃(ℤ) or GL₃(ℤ[i]).

Any such word is a relation in the Burau image of F₂ at that specialization.
If a word is a relation for ALL values of t, it is a kernel element of ρ₄.

Uses python-flint for post-hoc polynomial analysis.
"""

from __future__ import annotations

import sys
import time
import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ──────────────────────────────────────────────────────────────
#  Matrix utilities (integer or Gaussian integer 3×3)
# ──────────────────────────────────────────────────────────────

def mat_id(dtype=int):
    return np.eye(3, dtype=dtype)


def mat_eq(A, B) -> bool:
    return np.array_equal(A, B)


def mat_dist(M, dtype=int) -> float:
    """Frobenius distance from identity."""
    return float(np.sum(np.abs(M - np.eye(3, dtype=dtype))))


def mat_hash(M) -> bytes:
    return M.tobytes()


def mat_str(M) -> str:
    return str(M)


# ──────────────────────────────────────────────────────────────
#  Reduced Burau Generators for B₄  at a specific t value
# ──────────────────────────────────────────────────────────────

def burau_sigma(i: int, t_val, n: int = 4):
    """Reduced Burau matrix for σ_i in B_n at t=t_val."""
    dim = n - 1
    dtype = complex if isinstance(t_val, complex) else (
        float if isinstance(t_val, float) else int
    )
    # Use complex if t_val is complex, else int
    if isinstance(t_val, complex) and t_val.imag != 0:
        dtype = complex
    elif isinstance(t_val, float) and t_val != int(t_val):
        dtype = float
    else:
        dtype = int
        t_val = int(t_val.real) if isinstance(t_val, complex) else int(t_val)

    M = np.eye(dim, dtype=dtype)
    row = i - 1
    M[row][row] = -t_val
    if i > 1:
        M[row][row - 1] = t_val
    if row + 1 < dim:
        M[row][row + 1] = 1
    return M


def burau_sigma_inv(i: int, t_val, n: int = 4):
    """Reduced Burau matrix for σ_i⁻¹ in B_n at t=t_val."""
    dim = n - 1
    tinv = 1 / t_val if isinstance(t_val, (float, complex)) else None

    if isinstance(t_val, complex) and t_val.imag != 0:
        dtype = complex
        tinv = 1 / t_val
    elif isinstance(t_val, float):
        dtype = float
        tinv = 1.0 / t_val
    else:
        t_val = int(t_val.real) if isinstance(t_val, complex) else int(t_val)
        if abs(t_val) == 1:
            dtype = int
            tinv = int(1 / t_val)
        else:
            dtype = float
            tinv = 1.0 / t_val

    M = np.eye(dim, dtype=dtype)
    row = i - 1
    M[row][row] = -tinv
    if i > 1:
        M[row][row - 1] = 1
    if row + 1 < dim:
        M[row][row + 1] = tinv
    return M


def build_f2_at(t_val):
    """
    Build Birman's F₂ generators X, Y, X⁻¹, Y⁻¹ at a specific t value.
    Returns (generators_list, inverse_map, dtype).
    """
    s1 = burau_sigma(1, t_val)
    s2 = burau_sigma(2, t_val)
    s3 = burau_sigma(3, t_val)
    S1 = burau_sigma_inv(1, t_val)
    S2 = burau_sigma_inv(2, t_val)
    S3 = burau_sigma_inv(3, t_val)

    X  = s3 @ S1
    Xi = s1 @ S3
    Y  = (s2 @ s3) @ (S1 @ S2)
    Yi = (s2 @ s1) @ (S3 @ S2)

    dtype = X.dtype

    # Verify inverses
    assert np.allclose(X @ Xi, np.eye(3)), "X · X⁻¹ ≠ I"
    assert np.allclose(Y @ Yi, np.eye(3)), "Y · Y⁻¹ ≠ I"

    # Round to integers if applicable
    if dtype in (int, np.int64, np.int32):
        pass
    elif np.allclose(X.imag, 0) and np.allclose(Y.imag, 0):
        # Real — try converting to int
        X, Xi, Y, Yi = [np.round(m.real).astype(int) for m in [X, Xi, Y, Yi]]
        dtype = int
    elif isinstance(t_val, complex) and t_val.imag != 0:
        # Gaussian integer check
        t_all = np.concatenate([X.ravel(), Xi.ravel(), Y.ravel(), Yi.ravel()])
        if np.allclose(t_all.real, np.round(t_all.real)) and np.allclose(t_all.imag, np.round(t_all.imag)):
            # Round to exact Gaussian integers
            X  = np.round(X.real).astype(int) + 1j * np.round(X.imag).astype(int)
            Xi = np.round(Xi.real).astype(int) + 1j * np.round(Xi.imag).astype(int)
            Y  = np.round(Y.real).astype(int) + 1j * np.round(Y.imag).astype(int)
            Yi = np.round(Yi.real).astype(int) + 1j * np.round(Yi.imag).astype(int)
            dtype = complex

    generators = [
        {'name': 'X',    'symbol': 'X', 'matrix': X},
        {'name': 'Y',    'symbol': 'Y', 'matrix': Y},
        {'name': 'X⁻¹',  'symbol': 'x', 'matrix': Xi},
        {'name': 'Y⁻¹',  'symbol': 'y', 'matrix': Yi},
    ]
    inverse_map = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}
    return generators, inverse_map, dtype


# ──────────────────────────────────────────────────────────────
#  FlashBeam Node
# ──────────────────────────────────────────────────────────────

class Node:
    __slots__ = ('matrix', 'word', 'score', '_hash')

    def __init__(self, matrix, word: str, score: float):
        self.matrix = matrix
        self.word = word
        self.score = score
        self._hash: Optional[bytes] = None

    def get_hash(self) -> bytes:
        if self._hash is None:
            self._hash = self.matrix.tobytes()
        return self._hash

    @property
    def word_length(self) -> int:
        return 0 if self.word == '' else len(self.word.split())

    @property
    def last_symbol(self) -> Optional[str]:
        if self.word == '':
            return None
        return self.word.split()[-1]


# ──────────────────────────────────────────────────────────────
#  FlashBeam Solver
# ──────────────────────────────────────────────────────────────

class FlashBeamF2:
    """
    FlashBeam search for relations in the Burau image of F₂ ⊂ B₄
    at a specific specialization of t.
    """

    def __init__(
        self,
        t_val = -1,
        beam_width: int = 5000,
        flash_size: int = 80,
        max_iterations: int = 200,
        verbose: bool = True,
    ):
        self.beam_width = beam_width
        self.flash_size = flash_size
        self.max_iterations = max_iterations
        self.verbose = verbose
        self.t_val = t_val

        generators, self.inverse_map, self.dtype = build_f2_at(t_val)
        self.generators = generators

        self.identity = np.eye(3, dtype=self.dtype)

        self.gen_nodes: List[Node] = []
        for g in generators:
            score = mat_dist(g['matrix'], self.dtype)
            self.gen_nodes.append(Node(g['matrix'], g['symbol'], score))

    def combine_right(self, a: Node, b: Node) -> Node:
        """a * b"""
        mat = a.matrix @ b.matrix
        word = b.word if a.word == '' else (a.word + ' ' + b.word)
        score = mat_dist(mat, self.dtype)
        return Node(mat, word, score)

    def combine_left(self, a: Node, b: Node) -> Node:
        """a * b  (a from pool, b from beam — label accordingly)"""
        mat = a.matrix @ b.matrix
        word = a.word + ' ' + b.word
        score = mat_dist(mat, self.dtype)
        return Node(mat, word, score)

    def free_reduce(self, word: str) -> str:
        parts = word.split()
        stack: List[str] = []
        for sym in parts:
            if stack and self.inverse_map.get(stack[-1]) == sym:
                stack.pop()
            else:
                stack.append(sym)
        return ' '.join(stack)

    def is_nontrivial(self, node: Node) -> bool:
        if node.word_length <= 1:
            return False
        reduced = self.free_reduce(node.word)
        return len(reduced) > 0

    def would_cancel(self, beam_last: Optional[str], gen_word: str) -> bool:
        if beam_last is None:
            return False
        return self.inverse_map.get(beam_last) == gen_word.split()[0]

    def solve(self):
        """Run the FlashBeam search."""
        if self.verbose:
            print("=" * 72)
            print("  FlashBeam Relation Search in Burau(F₂) ⊂ GL₃")
            print("=" * 72)
            print(f"  t value      = {self.t_val}")
            print(f"  Beam width W = {self.beam_width}")
            print(f"  Flash size F = {self.flash_size}")
            print(f"  Max iters    = {self.max_iterations}")
            print(f"  dtype        = {self.dtype}")
            print()
            print("  Generators (Birman Prop. 3.19):")
            print(f"    X  = σ₃σ₁⁻¹          Y  = σ₂σ₃σ₁⁻¹σ₂⁻¹")
            print()
            for g in self.gen_nodes:
                print(f"  Burau({g.word})  [dist={g.score:.1f}]:")
                print(f"  {g.matrix}")
                print()
            print("-" * 72)

        root = Node(self.identity.copy(), '', 0)
        current_beam = [root] + [Node(n.matrix.copy(), n.word, n.score) for n in self.gen_nodes]
        persistent_flash = [Node(n.matrix.copy(), n.word, n.score) for n in self.gen_nodes]

        visited = set()
        visited.add(root.get_hash())
        for n in current_beam:
            visited.add(n.get_hash())

        solutions: List[Node] = []
        solution_words = set()

        t_start = time.time()

        for iteration in range(1, self.max_iterations + 1):
            candidates: List[Node] = []

            # Expansion pool = flash ∪ generators
            pool_map = {}
            for g in self.gen_nodes:
                pool_map[g.get_hash()] = g
            for f in persistent_flash:
                pool_map[f.get_hash()] = f
            pool = list(pool_map.values())

            def _check_and_add(child):
                if child.score < 1e-10:
                    if np.array_equal(child.matrix, self.identity) and self.is_nontrivial(child):
                        reduced = self.free_reduce(child.word)
                        if reduced and reduced not in solution_words:
                            solution_words.add(reduced)
                            sol = Node(child.matrix, reduced, 0)
                            solutions.append(sol)
                            self._report_solution(sol, iteration, time.time() - t_start)
                    return

                h = child.get_hash()
                if h in visited:
                    return
                visited.add(h)
                candidates.append(child)

            # Expand: beam × pool (right multiplication)
            for b_node in current_beam:
                b_last = b_node.last_symbol
                for p_node in pool:
                    if self.would_cancel(b_last, p_node.word):
                        continue
                    child = self.combine_right(b_node, p_node)
                    _check_and_add(child)

            # Expand: pool × beam (left multiplication)
            for p_node in pool:
                for b_node in current_beam:
                    if b_node.word == '':
                        continue
                    child = self.combine_left(p_node, b_node)
                    _check_and_add(child)

            # Sort by score, keep top W
            candidates.sort(key=lambda n: (n.score, n.word_length))
            current_beam = candidates[:self.beam_width]

            # Update flash
            flash_candidates = [n for n in (persistent_flash + current_beam)
                                if n.score > 0 and n.word_length > 0]
            flash_candidates.sort(key=lambda n: n.score)
            flash_map = {}
            for fc in flash_candidates:
                h = fc.get_hash()
                if h not in flash_map:
                    flash_map[h] = fc
                if len(flash_map) >= self.flash_size:
                    break
            persistent_flash = list(flash_map.values())

            best_score = current_beam[0].score if current_beam else 999

            if self.verbose:
                elapsed = time.time() - t_start
                best_word = current_beam[0].word if current_beam else '—'
                if len(best_word) > 55:
                    best_word = best_word[:52] + '...'
                flash_info = ', '.join(
                    f'{f.word[:10]}({f.score:.0f})' for f in persistent_flash[:4]
                )
                print(
                    f"  iter {iteration:3d} | "
                    f"dist={best_score:6.1f} | "
                    f"beam={len(current_beam):5d} | "
                    f"flash={len(persistent_flash):3d} | "
                    f"visited={len(visited):8d} | "
                    f"sols={len(solutions)} | "
                    f"{elapsed:6.1f}s"
                )
                if iteration <= 5 or iteration % 10 == 0:
                    print(f"         best word: {best_word}")
                    print(f"         flash: {flash_info}")

            if not current_beam:
                if self.verbose:
                    print("\n  ⚠ Beam exhausted.")
                break

        elapsed = time.time() - t_start
        if self.verbose:
            print("-" * 72)
            print(f"  Search complete: {len(solutions)} solution(s) in {elapsed:.1f}s")
            print(f"  States visited: {len(visited)}")
            print("=" * 72)

        return solutions

    def _report_solution(self, sol: Node, iteration: int, elapsed: float):
        print()
        print("  " + "★" * 36)
        print(f"  ★  RELATION FOUND at iteration {iteration}  ({elapsed:.1f}s)")
        print(f"  ★  Word:   {sol.word}")
        print(f"  ★  Length: {sol.word_length}")
        print(f"  ★  Free-reduced: {self.free_reduce(sol.word)}")
        print("  " + "★" * 36)
        print()


# ──────────────────────────────────────────────────────────────
#  Post-hoc polynomial analysis
# ──────────────────────────────────────────────────────────────

def verify_over_laurent(word: str):
    """
    Given a word found at a specific t, check if it's also the identity 
    in the full Laurent polynomial ring ℤ[t, t⁻¹].
    """
    # Build symbolic generators
    from flashbeam_f2_symbolic import build_f2_generators, mat_mul, mat_id, mat_eq, mat_str
    generators, _ = build_f2_generators()
    gen_map = {g['symbol']: g['matrix'] for g in generators}

    M = mat_id()
    for sym in word.split():
        M = mat_mul(M, gen_map[sym])

    is_id = mat_eq(M, mat_id())
    print(f"\n  Polynomial verification of W = {word}")
    print(f"  Burau(W) over ℤ[t,t⁻¹]:")
    print(f"  {mat_str(M)}")
    print(f"  Is identity for ALL t: {is_id}")

    if not is_id:
        # Check what polynomial the entries are
        from flint import fmpz_poly
        I = mat_id()
        print(f"\n  Entry analysis (M - I):")
        nz = []
        for i in range(3):
            for j in range(3):
                entry = M[i][j] - I[i][j]
                if not entry.is_zero():
                    fp, shift = entry.to_fmpz_poly()
                    print(f"    [{i}][{j}]: {entry}  =  {fp} · t^{shift}")
                    try:
                        print(f"             factors: {fp.factor()}")
                    except Exception:
                        pass
                    nz.append(fp)

        if nz:
            g = nz[0]
            for p in nz[1:]:
                g = g.gcd(p)
            print(f"\n  GCD: {g}")
            if int(g.degree()) > 0:
                try:
                    roots = g.complex_roots()
                    print(f"  Roots (other t values where W = I):")
                    for r in roots:
                        print(f"    t ≈ {r}")
                except Exception as e:
                    print(f"  Root error: {e}")
    return is_id


# ──────────────────────────────────────────────────────────────
#  Main
# ──────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='FlashBeam search for relations in Burau(F₂) ⊂ B₄'
    )
    parser.add_argument('-t', '--t-val', type=str, default='-1',
                        help='Value of t to specialize to. '
                             'Options: -1, i, 2, -2, etc. (default: -1)')
    parser.add_argument('-W', '--beam-width', type=int, default=5000,
                        help='Beam width (default: 5000)')
    parser.add_argument('-F', '--flash-size', type=int, default=80,
                        help='Flash pool size (default: 80)')
    parser.add_argument('-I', '--max-iters', type=int, default=200,
                        help='Max iterations (default: 200)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Suppress iteration output')
    parser.add_argument('--verify', type=str, default=None,
                        help='Verify a word over full Laurent ring')
    args = parser.parse_args()

    # Parse t value
    t_map = {
        '-1': -1,
        'i': 1j,
        '-i': -1j,
        '2': 2,
        '-2': -2,
    }
    t_val = t_map.get(args.t_val)
    if t_val is None:
        try:
            t_val = complex(args.t_val)
            if t_val.imag == 0:
                t_val = t_val.real
                if t_val == int(t_val):
                    t_val = int(t_val)
        except ValueError:
            print(f"Cannot parse t value: {args.t_val}")
            sys.exit(1)

    if args.verify:
        verify_over_laurent(args.verify)
        return

    solver = FlashBeamF2(
        t_val=t_val,
        beam_width=args.beam_width,
        flash_size=args.flash_size,
        max_iterations=args.max_iters,
        verbose=not args.quiet,
    )

    solutions = solver.solve()

    # For any solutions found, try polynomial verification
    if solutions:
        print("\n" + "=" * 72)
        print("  Polynomial verification (checking if relation holds for ALL t)")
        print("=" * 72)
        for sol in solutions:
            try:
                verify_over_laurent(sol.word)
            except ImportError:
                print(f"  (Symbolic verification requires flashbeam_f2_symbolic module)")
                print(f"  Word: {sol.word}")


if __name__ == '__main__':
    main()
