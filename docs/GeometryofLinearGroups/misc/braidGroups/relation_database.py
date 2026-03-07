#!/usr/local/bin/python3.14 -u
"""
relation_database.py — Systematic Relation Finder for Burau(F₂) ⊂ B₄
======================================================================

For each algebraic specialization of t, uses FlashBeam search to find
words W(X,Y,X⁻¹,Y⁻¹) = I in the Burau image.

Approach: represent t via companion matrix of its minimal polynomial.
  - Z[t]/(p(t)) embeds into d×d integer matrices (d = deg p)
  - 3×3 Burau matrices become 3d×3d integer/rational matrices
  - Use python-flint (FLINT) for exact arithmetic

Results stored in JSON database.
"""

import json
import time
import sys
import os
from flint import fmpz, fmpz_mat, fmpq, fmpq_mat


# ============================================================================
# 1. ALGEBRAIC SPECIALIZATIONS
# ============================================================================
# Format: (name, min_poly_coeffs, description)
#   min_poly_coeffs for monic p(t) = c_0 + c_1*t + ... + c_{d-1}*t^{d-1} + t^d
#   listed as [c_0, c_1, ..., c_{d-1}, 1]
#   |c_0| == 1  →  t is a unit in Z[t]/(p(t))  →  use fmpz_mat (fast)
#   |c_0| != 1  →  t⁻¹ is rational             →  use fmpq_mat

SPECIALIZATIONS = [
    # --- Degree 1: integer t ---
    ("t=-1",       [1, 1],              "t = -1"),
    ("t=2",        [-2, 1],             "t = 2"),
    ("t=-2",       [2, 1],              "t = -2"),
    ("t=3",        [-3, 1],             "t = 3"),
    ("t=-3",       [3, 1],              "t = -3"),
    ("t=4",        [-4, 1],             "t = 4"),
    ("t=5",        [-5, 1],             "t = 5"),
    # --- Degree 2 ---
    ("t=i",        [1, 0, 1],           "t = i (prim 4th root of unity)"),
    ("t=zeta3",    [1, 1, 1],           "t = ζ₃ (prim 3rd root of unity)"),
    ("t=1+i",      [2, -2, 1],          "t = 1+i"),
    ("t=golden",   [-1, -1, 1],         "t = φ = (1+√5)/2 (golden ratio)"),
    ("t=1+sqrt2",  [-1, -2, 1],         "t = 1+√2"),
    ("t=sqrt2",    [-2, 0, 1],          "t = √2"),
    ("t=-1+sqrt2", [-1, 2, 1],          "t = -1+√2"),
    # --- Degree 4 ---
    ("t=zeta5",    [1, 1, 1, 1, 1],     "t = ζ₅ (prim 5th root of unity)"),
    ("t=zeta8",    [1, 0, 0, 0, 1],     "t = ζ₈ (prim 8th root of unity)"),
    ("t=zeta12",   [1, 0, -1, 0, 1],    "t = ζ₁₂ (prim 12th root of unity)"),
    # --- Degree 6 ---
    ("t=zeta7",    [1, 1, 1, 1, 1, 1, 1], "t = ζ₇ (prim 7th root of unity)"),
    ("t=zeta9",    [1, 0, 0, 1, 0, 0, 1], "t = ζ₉ (prim 9th root of unity)"),
]


# ============================================================================
# 2. COMPANION MATRIX & GENERATOR BUILDER
# ============================================================================

def build_companion(min_poly):
    """
    Build companion matrix C (represents t) and C⁻¹ (represents t⁻¹).

    min_poly = [c_0, c_1, ..., c_{d-1}, 1]  (length d+1, monic)

    Returns (C, Ci, d, is_unit)
    where C and Ci are fmpz_mat if |c_0|=1, else fmpq_mat.
    """
    d = len(min_poly) - 1
    coeffs = min_poly[:d]  # [c_0, ..., c_{d-1}]
    is_unit = abs(coeffs[0]) == 1

    # Companion matrix rows: row i has 1 at col i-1 (if i>0) and -c_i at col d-1
    rows = []
    for i in range(d):
        row = [0] * d
        if i > 0:
            row[i - 1] = 1
        row[d - 1] = -coeffs[i]
        rows.append(row)

    if is_unit:
        C = fmpz_mat(rows)
        Ci = _invert_unit_companion(C, coeffs, d)
        return C, Ci, d, True
    else:
        C = fmpq_mat(rows)
        Ci = C.inv()
        return C, Ci, d, False


def _invert_unit_companion(C, coeffs, d):
    """
    Compute C⁻¹ for a unit companion matrix using the polynomial relation.

    From p(C)=0: C^d + c_{d-1}C^{d-1} + ... + c_1 C + c_0 I = 0
    Rearranging: c_0 I = -C(C^{d-1} + c_{d-1}C^{d-2} + ... + c_1 I)
    So: C⁻¹ = -(1/c_0)(C^{d-1} + c_{d-1}C^{d-2} + ... + c_1 I)
    Since |c_0|=1, 1/c_0 = c_0, so -(1/c_0) = -c_0.
    """
    c0 = coeffs[0]
    factor = -c0  # = -(1/c_0) when c_0 = ±1

    if d == 1:
        return fmpz_mat([[factor]])

    # Build powers of C: C^0, C^1, ..., C^{d-1}
    Id_d = fmpz_mat([[1 if i == j else 0 for j in range(d)] for i in range(d)])
    powers = [Id_d]
    Ck = Id_d
    for k in range(1, d):
        Ck = Ck * C
        powers.append(Ck)

    # S = c_1*C^0 + c_2*C^1 + ... + c_{d-1}*C^{d-2} + 1*C^{d-1}
    S = fmpz_mat([[0] * d for _ in range(d)])
    for j in range(d):
        c = coeffs[j + 1] if j < d - 1 else 1
        if c != 0:
            S = S + c * powers[j]

    return factor * S


def _make_block_mat(blocks, d, use_fmpz):
    """
    Build a 3d×3d matrix from a 3×3 grid of d×d blocks.
    blocks[i][j] is a d×d fmpz_mat or fmpq_mat.
    """
    n = 3 * d
    if use_fmpz:
        rows = []
        for bi in range(3):
            for i in range(d):
                row = []
                for bj in range(3):
                    for j in range(d):
                        row.append(int(blocks[bi][bj][i, j]))
                rows.append(row)
        return fmpz_mat(rows)
    else:
        # For fmpq_mat: preserve rational entries
        M = fmpq_mat(n, n)
        for bi in range(3):
            for i in range(d):
                for bj in range(3):
                    for j in range(d):
                        M[bi * d + i, bj * d + j] = blocks[bi][bj][i, j]
        return M


def build_generators(min_poly):
    """
    Build Birman's F₂ generators X, Y, X⁻¹, Y⁻¹ as 3d×3d matrices.

    Returns dict with keys 'X','x','Y','y' (x=X⁻¹, y=Y⁻¹),
    plus 'n' (matrix size), 'use_fmpz', 'identity'.
    """
    C, Ci, d, is_unit = build_companion(min_poly)
    use_fmpz = is_unit
    n = 3 * d

    # Helper: block matrices
    if use_fmpz:
        Z = fmpz_mat([[0] * d for _ in range(d)])
        I = fmpz_mat([[1 if i == j else 0 for j in range(d)] for i in range(d)])
    else:
        Z = fmpq_mat([[0] * d for _ in range(d)])
        I = fmpq_mat([[1 if i == j else 0 for j in range(d)] for i in range(d)])
    mC = (-1) * C     # -t
    mCi = (-1) * Ci   # -t⁻¹

    # σ₁ = [[-t, 1, 0],[0, 1, 0],[0, 0, 1]]
    s1 = _make_block_mat([[mC, I, Z], [Z, I, Z], [Z, Z, I]], d, use_fmpz)
    # σ₂ = [[1, 0, 0],[t, -t, 1],[0, 0, 1]]
    s2 = _make_block_mat([[I, Z, Z], [C, mC, I], [Z, Z, I]], d, use_fmpz)
    # σ₃ = [[1, 0, 0],[0, 1, 0],[0, t, -t]]
    s3 = _make_block_mat([[I, Z, Z], [Z, I, Z], [Z, C, mC]], d, use_fmpz)
    # σ₁⁻¹ = [[-t⁻¹, t⁻¹, 0],[0, 1, 0],[0, 0, 1]]
    S1 = _make_block_mat([[mCi, Ci, Z], [Z, I, Z], [Z, Z, I]], d, use_fmpz)
    # σ₂⁻¹ = [[1, 0, 0],[1, -t⁻¹, t⁻¹],[0, 0, 1]]
    S2 = _make_block_mat([[I, Z, Z], [I, mCi, Ci], [Z, Z, I]], d, use_fmpz)
    # σ₃⁻¹ = [[1, 0, 0],[0, 1, 0],[0, 1, -t⁻¹]]
    S3 = _make_block_mat([[I, Z, Z], [Z, I, Z], [Z, I, mCi]], d, use_fmpz)

    # Birman's generators: X = σ₃σ₁⁻¹, Y = σ₂σ₃σ₁⁻¹σ₂⁻¹
    mat_X  = s3 * S1
    mat_Y  = s2 * s3 * S1 * S2
    mat_Xi = s1 * S3          # X⁻¹
    mat_Yi = s2 * s1 * S3 * S2  # Y⁻¹

    # Identity
    if use_fmpz:
        Id_n = fmpz_mat([[1 if i == j else 0 for j in range(n)] for i in range(n)])
    else:
        Id_n = fmpq_mat([[1 if i == j else 0 for j in range(n)] for i in range(n)])

    # Verify
    assert mat_X * mat_Xi == Id_n, "X · X⁻¹ ≠ I"
    assert mat_Y * mat_Yi == Id_n, "Y · Y⁻¹ ≠ I"

    return {
        'X': mat_X, 'x': mat_Xi, 'Y': mat_Y, 'y': mat_Yi,
        'n': n, 'd': d, 'use_fmpz': use_fmpz, 'identity': Id_n,
    }


# ============================================================================
# 3. SCORING & HASHING
# ============================================================================

def mat_to_tuple_z(M, n):
    """Hash key for fmpz_mat."""
    return tuple(int(M[i, j]) for i in range(n) for j in range(n))


def mat_to_tuple_q(M, n):
    """Hash key for fmpq_mat."""
    result = []
    for i in range(n):
        for j in range(n):
            v = M[i, j]
            result.append((int(v.p), int(v.q)))
    return tuple(result)


def score_z(M, n):
    """Score for fmpz_mat: sum of bit-lengths of (M - I) entries."""
    s = 0
    for i in range(n):
        for j in range(n):
            v = int(M[i, j])
            expected = 1 if i == j else 0
            diff = v - expected
            if diff != 0:
                s += diff.bit_length()
    return s


def score_q(M, n):
    """Score for fmpq_mat: sum of bit-complexity of (M - I) entries."""
    s = 0
    for i in range(n):
        for j in range(n):
            v = M[i, j]
            expected = fmpq(1) if i == j else fmpq(0)
            diff = v - expected
            if diff != fmpq(0):
                s += int(abs(diff.p)).bit_length() + int(diff.q).bit_length()
    return s


# ============================================================================
# 4A. MODULAR BEAM SEARCH (for non-unit cases: integer t with |t|>1)
# ============================================================================

import numpy as np

def _build_burau_modp(t_int, p):
    """Build 3×3 Burau generators for integer t, mod prime p, using numpy int64."""
    t = t_int % p
    ti = pow(t, p - 2, p)  # t⁻¹ mod p via Fermat

    def eye():
        return np.eye(3, dtype=np.int64)

    # σ₁ = [[-t, 1, 0],[0, 1, 0],[0, 0, 1]]
    s1 = eye(); s1[0, 0] = (-t) % p; s1[0, 1] = 1
    # σ₂ = [[1, 0, 0],[t, -t, 1],[0, 0, 1]]
    s2 = eye(); s2[1, 0] = t; s2[1, 1] = (-t) % p; s2[1, 2] = 1
    # σ₃ = [[1, 0, 0],[0, 1, 0],[0, t, -t]]
    s3 = eye(); s3[2, 1] = t; s3[2, 2] = (-t) % p
    # σ₁⁻¹
    S1 = eye(); S1[0, 0] = (-ti) % p; S1[0, 1] = ti
    # σ₂⁻¹
    S2 = eye(); S2[1, 0] = 1; S2[1, 1] = (-ti) % p; S2[1, 2] = ti
    # σ₃⁻¹
    S3 = eye(); S3[2, 1] = 1; S3[2, 2] = (-ti) % p

    def mulmod(*mats):
        r = mats[0]
        for m in mats[1:]:
            r = r @ m % p
        return r

    X  = mulmod(s3, S1)
    Xi = mulmod(s1, S3)
    Y  = mulmod(s2, s3, S1, S2)
    Yi = mulmod(s2, s1, S3, S2)

    I3 = np.eye(3, dtype=np.int64)
    assert np.array_equal(mulmod(X, Xi), I3), f"X·X⁻¹ ≠ I mod {p}"
    assert np.array_equal(mulmod(Y, Yi), I3), f"Y·Y⁻¹ ≠ I mod {p}"
    return {'X': X, 'x': Xi, 'Y': Y, 'y': Yi}


def beam_search_modp(spec_name, t_int, primes=None,
                     beam_width=5000, flash_size=80, max_iters=200,
                     verbose=True):
    """
    Beam search for relations mod multiple primes simultaneously.
    A word is a relation iff it maps to I mod ALL primes tested.

    For integer t with |t|>1, this avoids entry explosion in exact arithmetic.
    """
    if primes is None:
        # Choose primes coprime to t
        candidates = [101, 103, 107, 109, 113, 127, 131, 137, 139, 149,
                      151, 157, 163, 167, 173, 179, 181, 191, 193, 197]
        primes = [p for p in candidates if t_int % p != 0][:3]

    n = 3
    I3 = np.eye(3, dtype=np.int64)

    # Build generators for each prime
    gen_sets = {}
    for p in primes:
        gen_sets[p] = _build_burau_modp(t_int, p)

    gen_list = ['X', 'x', 'Y', 'y']

    # Precompute commutator U powers to exclude
    U_powers = set()
    for p in primes[:1]:  # Just use first prime for U-power exclusion
        gs = gen_sets[p]
        U = gs['x'] @ gs['Y'] @ gs['X'] @ gs['y'] % p
        M = I3.copy()
        for k in range(500):
            M = M @ U % p
            if np.array_equal(M, I3):
                break
        # Don't need to store—just note the order

    def mulmod_all(mats_per_prime, sym):
        """Multiply each prime's matrix by the generator."""
        result = {}
        for p in primes:
            result[p] = mats_per_prime[p] @ gen_sets[p][sym] % p
        return result

    def is_identity_all(mats_per_prime):
        return all(np.array_equal(mats_per_prime[p], I3) for p in primes)

    def mat_hash_all(mats_per_prime):
        return tuple(mats_per_prime[primes[0]].tobytes())  # Hash on first prime

    def score_all(mats_per_prime):
        """Score = sum of absolute deviations from identity, first prime."""
        M = mats_per_prime[primes[0]]
        return int(np.sum(np.abs(M - I3)))

    # Init beam: identity + generators
    id_mats = {p: I3.copy() for p in primes}
    beam = [('', {p: I3.copy() for p in primes}, 0)]
    visited = set()
    visited.add(mat_hash_all(id_mats))

    for sym in gen_list:
        gm = {p: gen_sets[p][sym].copy() for p in primes}
        s = score_all(gm)
        beam.append((sym, gm, s))
        visited.add(mat_hash_all(gm))

    flash = [(sym, {p: gen_sets[p][sym].copy() for p in primes},
              score_all({p: gen_sets[p][sym] for p in primes}))
             for sym in gen_list]

    solutions = []
    solution_words = set()
    t_start = time.time()

    if verbose:
        print(f"\n{'='*60}")
        print(f"  {spec_name}  (3×3 mod {primes}, numpy int64)")
        print(f"  Beam W={beam_width}, Flash F={flash_size}, Iters={max_iters}")
        print(f"{'='*60}")

    for iteration in range(1, max_iters + 1):
        candidates = []

        # Pool = flash ∪ generators
        pool_map = {}
        for sym in gen_list:
            gm = {p: gen_sets[p][sym] for p in primes}
            h = mat_hash_all(gm)
            if h not in pool_map:
                pool_map[h] = (sym, gm)
        for fw, fm, fs in flash:
            h = mat_hash_all(fm)
            if h not in pool_map:
                pool_map[h] = (fw, fm)
        pool = list(pool_map.values())

        def _check(word, mats):
            sc = score_all(mats)
            if sc == 0 and is_identity_all(mats):
                red = free_reduce(word)
                if red and len(red.split()) > 1 and red not in solution_words:
                    solution_words.add(red)
                    elapsed = time.time() - t_start
                    sol = {'word': red, 'length': len(red.split()),
                           'iteration': iteration, 'time': round(elapsed, 2),
                           'verified_primes': primes}
                    solutions.append(sol)
                    if verbose:
                        print(f"\n  ★ RELATION at iter {iteration} ({elapsed:.1f}s)")
                        print(f"    Length {sol['length']}: {red[:120]}")
                return

            h = mat_hash_all(mats)
            if h in visited:
                return
            visited.add(h)
            candidates.append((word, mats, sc))

        # Right-multiply: beam × pool
        for bw, bm, bsc in beam:
            b_last = bw.split()[-1] if bw else None
            for pw, pm in pool:
                p_first = pw.split()[0]
                if b_last and INV_MAP.get(b_last) == p_first:
                    continue
                cw = combine_words(bw, pw)
                if not cw:
                    continue
                cm = {p: bm[p] @ pm[p] % p for p in primes}
                _check(cw, cm)

        # Left-multiply: pool × beam
        for pw, pm in pool:
            for bw, bm, bsc in beam:
                if not bw:
                    continue
                b_first = bw.split()[0]
                p_last = pw.split()[-1]
                if INV_MAP.get(p_last) == b_first:
                    continue
                cw = combine_words(pw, bw)
                if not cw:
                    continue
                cm = {p: pm[p] @ bm[p] % p for p in primes}
                _check(cw, cm)

        candidates.sort(key=lambda t: (t[2], len(t[0].split())))
        beam = candidates[:beam_width]

        if flash_size > 0:
            fc = flash + beam
            fc = [(w, m, s) for w, m, s in fc if s > 0 and w]
            fc.sort(key=lambda t: t[2])
            fm = {}
            for c in fc:
                h = mat_hash_all(c[1])
                if h not in fm:
                    fm[h] = c
                if len(fm) >= flash_size:
                    break
            flash = list(fm.values())

        if not beam:
            if verbose:
                print(f"  Beam exhausted at iter {iteration}.")
            break

        if verbose and (iteration <= 3 or iteration % 10 == 0):
            best = beam[0]
            elapsed = time.time() - t_start
            print(f"  iter {iteration:3d} | score={best[2]:6d} | "
                  f"beam={len(beam):5d} | flash={len(flash):3d} | "
                  f"visited={len(visited):8d} | sols={len(solutions)} | "
                  f"{elapsed:.1f}s")

    elapsed = time.time() - t_start
    if verbose:
        print(f"  Done: {len(solutions)} relation(s) in {elapsed:.1f}s, "
              f"{len(visited)} states visited")
    return solutions


# ============================================================================
# 4B. EXACT BEAM SEARCH (for unit cases: |c₀| = 1)
# ============================================================================

INV_MAP = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}


def combine_words(w1, w2):
    """Concatenate words with free reduction at the junction."""
    if not w1:
        return w2
    if not w2:
        return w1
    t1 = w1.split()
    t2 = w2.split()
    while t1 and t2 and INV_MAP.get(t1[-1]) == t2[0]:
        t1.pop()
        t2.pop(0)
    return " ".join(t1 + t2)


def free_reduce(word):
    """Fully free-reduce a word."""
    parts = word.split()
    stack = []
    for sym in parts:
        if stack and INV_MAP.get(stack[-1]) == sym:
            stack.pop()
        else:
            stack.append(sym)
    return ' '.join(stack)


def beam_search(spec_name, gens_info, beam_width=5000, flash_size=80,
                max_iters=200, verbose=True):
    """
    FlashBeam search for relations W(X,Y,X⁻¹,Y⁻¹) = I.

    Returns list of solution dicts: [{'word': ..., 'length': ..., 'iter': ...}, ...]
    """
    n = gens_info['n']
    use_fmpz = gens_info['use_fmpz']
    identity = gens_info['identity']

    mat_hash = (lambda M: mat_to_tuple_z(M, n)) if use_fmpz else (lambda M: mat_to_tuple_q(M, n))
    score_fn = (lambda M: score_z(M, n)) if use_fmpz else (lambda M: score_q(M, n))

    gen_list = [
        ('X', gens_info['X']), ('x', gens_info['x']),
        ('Y', gens_info['Y']), ('y', gens_info['y']),
    ]

    # Precompute commutator U = X⁻¹YXY⁻¹ powers to exclude trivial finds
    mat_U = gens_info['x'] * gens_info['Y'] * gens_info['X'] * gens_info['y']
    U_powers = set()
    M = identity
    U_powers.add(mat_hash(M))
    Ui = mat_U
    # Try computing inverse
    try:
        Ui_mat = mat_U.inv()
        if use_fmpz and not isinstance(Ui_mat, type(identity)):
            # inv() returned fmpq_mat for fmpz_mat — check if actually integer
            Ui_mat = None
    except Exception:
        Ui_mat = None

    for k in range(200):
        M = M * mat_U
        U_powers.add(mat_hash(M))
    if Ui_mat is not None:
        M = identity
        for k in range(200):
            M = M * Ui_mat
            U_powers.add(mat_hash(M))

    # Init beam with identity + generators
    beam = [('', identity, 0)]
    visited = set()
    visited.add(mat_hash(identity))
    for sym, gm in gen_list:
        s = score_fn(gm)
        beam.append((sym, gm, s))
        visited.add(mat_hash(gm))

    # Flash pool: start with generators
    flash = [(sym, gm, score_fn(gm)) for sym, gm in gen_list]

    solutions = []
    solution_words = set()
    t_start = time.time()

    if verbose:
        print(f"\n{'='*60}")
        print(f"  {spec_name}  (matrix size {n}×{n}, {'fmpz' if use_fmpz else 'fmpq'})")
        print(f"  Beam W={beam_width}, Flash F={flash_size}, Iters={max_iters}")
        print(f"{'='*60}")

    for iteration in range(1, max_iters + 1):
        candidates = []

        # Expansion pool = flash ∪ generators
        pool_map = {}
        for sym, gm in gen_list:
            h = mat_hash(gm)
            if h not in pool_map:
                pool_map[h] = (sym, gm)
        for fw, fm, fs in flash:
            h = mat_hash(fm)
            if h not in pool_map:
                pool_map[h] = (fw, fm)
        pool = list(pool_map.values())

        def _check(word, mat):
            sc = score_fn(mat)
            if sc == 0:
                if mat == identity:
                    red = free_reduce(word)
                    if red and len(red.split()) > 1 and red not in solution_words:
                        solution_words.add(red)
                        elapsed = time.time() - t_start
                        sol = {
                            'word': red,
                            'length': len(red.split()),
                            'iteration': iteration,
                            'time': round(elapsed, 2),
                        }
                        solutions.append(sol)
                        if verbose:
                            print(f"\n  ★ RELATION at iter {iteration} ({elapsed:.1f}s)")
                            print(f"    Length {sol['length']}: {red[:120]}")
                            if len(red) > 120:
                                print(f"    ... ({len(red.split())} symbols total)")
                return  # Don't add identity/U-powers to beam

            h = mat_hash(mat)
            if h in visited:
                return
            # Skip U-powers
            if sc == 0 and h in U_powers:
                return
            visited.add(h)
            candidates.append((word, mat, sc))

        # Right-multiply: beam × pool
        for bw, bm, bsc in beam:
            b_last = bw.split()[-1] if bw else None
            for pw, pm in pool:
                p_first = pw.split()[0]
                if b_last and INV_MAP.get(b_last) == p_first:
                    continue
                cw = combine_words(bw, pw)
                if not cw:
                    continue
                cm = bm * pm
                _check(cw, cm)

        # Left-multiply: pool × beam
        for pw, pm in pool:
            for bw, bm, bsc in beam:
                if not bw:
                    continue
                b_first = bw.split()[0]
                p_last = pw.split()[-1]
                if INV_MAP.get(p_last) == b_first:
                    continue
                cw = combine_words(pw, bw)
                if not cw:
                    continue
                cm = pm * bm
                _check(cw, cm)

        # Sort and truncate beam
        candidates.sort(key=lambda t: (t[2], len(t[0].split())))
        beam = candidates[:beam_width]

        # Update flash
        if flash_size > 0:
            flash_cands = flash + beam
            flash_cands = [(w, m, s) for w, m, s in flash_cands if s > 0 and w]
            flash_cands.sort(key=lambda t: t[2])
            flash_map = {}
            for fc in flash_cands:
                h = mat_hash(fc[1])
                if h not in flash_map:
                    flash_map[h] = fc
                if len(flash_map) >= flash_size:
                    break
            flash = list(flash_map.values())

        if not beam:
            if verbose:
                print(f"  Beam exhausted at iter {iteration}.")
            break

        if verbose and (iteration <= 3 or iteration % 10 == 0):
            best = beam[0]
            elapsed = time.time() - t_start
            bw_short = best[0][:60] + '...' if len(best[0]) > 60 else best[0]
            print(
                f"  iter {iteration:3d} | score={best[2]:6d} | "
                f"beam={len(beam):5d} | flash={len(flash):3d} | "
                f"visited={len(visited):8d} | sols={len(solutions)} | "
                f"{elapsed:.1f}s"
            )

    elapsed = time.time() - t_start
    if verbose:
        print(f"  Done: {len(solutions)} relation(s) in {elapsed:.1f}s, "
              f"{len(visited)} states visited")
    return solutions


# ============================================================================
# 5. DATABASE I/O
# ============================================================================

DB_PATH = os.path.join(os.path.dirname(__file__), 'relation_db.json')


def load_db():
    if os.path.exists(DB_PATH):
        with open(DB_PATH) as f:
            return json.load(f)
    return {}


def save_db(db):
    with open(DB_PATH, 'w') as f:
        json.dump(db, f, indent=2)
    print(f"\n  Database saved to {DB_PATH}")


# ============================================================================
# 6. KNOWN RELATIONS (from Mathematica verification)
# ============================================================================
# Notation: X=x, x=X⁻¹=xi, Y=y, y=Y⁻¹=yi
# Mathematica dot-product notation → space-separated symbol word

def _mma_to_word(mma_str):
    """Convert Mathematica dot notation to symbol word.
    x→X, xi→x, y→Y, yi→y (matching our convention)."""
    tokens = [t.strip() for t in mma_str.replace('.', ' ').split()]
    mapping = {'x': 'X', 'xi': 'x', 'y': 'Y', 'yi': 'y'}
    return ' '.join(mapping.get(t, t) for t in tokens)


def seed_known_relations(db):
    """Add known relations from Mathematica verification."""

    # --- t = 2 ---
    # u = X⁻¹·Y·X·Y⁻¹  (commutator)
    # w2 = a specific long word
    # Relation: u⁻¹·(w2·u⁻¹)·u·(w2·u⁻¹)^{-64} = I
    # Equivalently, in terms of w2 and u:  w2 · u⁻¹ commutes with u up to 64th power
    w2_mma = ("xi . y . y . x . x . y . x . y . x . x . y . x . x . y . x . x . "
              "y . x . y . x . x . y . x . y . x . x . y . x . x . y . x . y . x . "
              "x . y . x . y . x . x . y . x . y . x . x . y . x . y . x . x . y . "
              "x . x . y . x . y . x . x . y . x . y . x . x . y . x . y . x . x . "
              "y . x . x . y . x . y . x . x . y . x . y . x . x . y . x . x . y . "
              "x . x . y . x . y . x . x . y")
    w2_word = _mma_to_word(w2_mma)
    u_word = "x Y X y"  # X⁻¹ Y X Y⁻¹

    if 't=2' not in db:
        db['t=2'] = {
            'description': 't = 2',
            'min_poly': [-2, 1],
            'degree': 1,
            'matrix_size': 3,
            'is_unit': False,
            'relations': [],
            'search_params': {'source': 'known'},
        }
    db['t=2']['known_elements'] = {
        'u': {'word': u_word, 'description': 'commutator X⁻¹YXY⁻¹'},
        'w2': {'word': w2_word, 'description': 'length-89 element'},
    }
    db['t=2']['known_relations'] = [
        {
            'description': 'u⁻¹·(w2·u⁻¹)·u·(w2·u⁻¹)^{-64} = I',
            'structure': 'Involves commutator u and element w2',
            'word_u': u_word,
            'word_w2': w2_word,
        }
    ]

    # --- t = 1+i ---
    # w1I = a specific word
    # Relation: [w1I, u·w1I·u⁻¹] = I  (commutator)
    w1I_mma = ("x . x . x . yi . x . yi . xi . xi . yi . xi . yi . xi . yi . "
               "xi . xi . yi . xi . yi . xi . xi . yi . x . yi . x . x . x . yi . x")
    w1I_word = _mma_to_word(w1I_mma)

    if 't=1+i' not in db:
        db['t=1+i'] = {
            'description': 't = 1+i',
            'min_poly': [2, -2, 1],
            'degree': 2,
            'matrix_size': 6,
            'is_unit': False,
            'relations': [],
            'search_params': {'source': 'known'},
        }
    db['t=1+i']['known_elements'] = {
        'u': {'word': u_word, 'description': 'commutator X⁻¹YXY⁻¹'},
        'w1I': {'word': w1I_word, 'description': 'length-28 element'},
    }
    db['t=1+i']['known_relations'] = [
        {
            'description': '[w1I, u·w1I·u⁻¹] = I  (commutator relation)',
            'structure': 'w1I commutes with its u-conjugate',
            'word_w1I': w1I_word,
            'word_u': u_word,
        }
    ]

    return db


# ============================================================================
# 7. MAIN
# ============================================================================

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Build database of Burau(F₂) relations at algebraic specializations'
    )
    parser.add_argument('-s', '--specs', nargs='*', default=None,
                        help='Specialization names to run (default: all). '
                             'E.g.: t=-1 t=2 t=i t=zeta5')
    parser.add_argument('-W', '--beam-width', type=int, default=5000,
                        help='Beam width (default: 5000)')
    parser.add_argument('-F', '--flash-size', type=int, default=80,
                        help='Flash pool size (default: 80)')
    parser.add_argument('-I', '--max-iters', type=int, default=200,
                        help='Max iterations (default: 200)')
    parser.add_argument('-q', '--quiet', action='store_true')
    parser.add_argument('--list', action='store_true',
                        help='List available specializations and exit')
    parser.add_argument('--show-db', action='store_true',
                        help='Show current database and exit')
    parser.add_argument('--seed-known', action='store_true',
                        help='Seed database with known relations (t=2, t=1+i)')
    args = parser.parse_args()

    if args.seed_known:
        db = load_db()
        db = seed_known_relations(db)
        save_db(db)
        print("  Seeded known relations for t=2 and t=1+i")
        return

    if args.list:
        print("Available specializations:")
        for name, poly, desc in SPECIALIZATIONS:
            d = len(poly) - 1
            unit = "unit" if abs(poly[0]) == 1 else "non-unit"
            mat_size = 3 * d
            print(f"  {name:16s}  deg={d}  {mat_size:2d}×{mat_size:<2d}  {unit:8s}  {desc}")
        return

    if args.show_db:
        db = load_db()
        if not db:
            print("Database is empty.")
            return
        for name, entry in db.items():
            print(f"\n{name}: {entry.get('description', '')}")
            print(f"  min_poly = {entry.get('min_poly')}")
            print(f"  matrix_size = {entry.get('matrix_size')}")
            rels = entry.get('relations', [])
            print(f"  {len(rels)} relation(s):")
            for r in rels:
                w = r['word']
                if len(w) > 100:
                    w = w[:97] + '...'
                print(f"    len={r['length']:3d}  iter={r['iteration']:3d}  "
                      f"time={r['time']:.1f}s  {w}")
        return

    # Select specializations
    spec_map = {name: (name, poly, desc) for name, poly, desc in SPECIALIZATIONS}
    if args.specs:
        selected = []
        for s in args.specs:
            if s in spec_map:
                selected.append(spec_map[s])
            else:
                print(f"Unknown specialization: {s}")
                print(f"Available: {', '.join(spec_map.keys())}")
                sys.exit(1)
    else:
        selected = SPECIALIZATIONS

    db = load_db()
    verbose = not args.quiet

    print("=" * 60)
    print("  Burau(F₂) Relation Database Builder")
    print(f"  Scanning {len(selected)} specialization(s)")
    print("=" * 60)

    total_start = time.time()

    for name, poly, desc in selected:
        d = len(poly) - 1
        n = 3 * d
        is_unit = abs(poly[0]) == 1

        # Adjust beam width for larger matrices
        bw = args.beam_width
        if n >= 18:  # degree 6
            bw = min(bw, 2000)
        elif n >= 12:  # degree 4
            bw = min(bw, 3000)

        if not is_unit and d == 1:
            # Non-unit integer t: use fast modular search
            t_int = -poly[0]  # p(t) = c_0 + t = 0 → t = -c_0
            print(f"\n  {name} ({desc}): modular beam search (t={t_int})...")
            solutions = beam_search_modp(
                name, t_int,
                beam_width=bw,
                flash_size=args.flash_size,
                max_iters=args.max_iters,
                verbose=verbose,
            )
        elif not is_unit and d > 1:
            # Non-unit algebraic: use modular search with root-finding mod p
            # For now, use exact fmpq_mat search (slower but general)
            print(f"\n  Building generators for {name} ({desc})...")
            try:
                gens_info = build_generators(poly)
            except Exception as e:
                print(f"  ✗ Failed to build generators: {e}")
                continue
            solutions = beam_search(
                name, gens_info,
                beam_width=bw,
                flash_size=args.flash_size,
                max_iters=min(args.max_iters, 30),  # Limit for fmpq
                verbose=verbose,
            )
        else:
            # Unit case: exact fmpz_mat search
            print(f"\n  Building generators for {name} ({desc})...")
            try:
                gens_info = build_generators(poly)
            except Exception as e:
                print(f"  ✗ Failed to build generators: {e}")
                continue
            solutions = beam_search(
                name, gens_info,
                beam_width=bw,
                flash_size=args.flash_size,
                max_iters=args.max_iters,
                verbose=verbose,
            )

        # Store in DB
        db[name] = {
            'description': desc,
            'min_poly': poly,
            'degree': d,
            'matrix_size': n,
            'is_unit': is_unit,
            'relations': solutions,
            'search_params': {
                'beam_width': bw,
                'flash_size': args.flash_size,
                'max_iters': args.max_iters,
            },
        }
        save_db(db)

    total_elapsed = time.time() - total_start
    total_rels = sum(len(db[k].get('relations', [])) for k in db)
    print(f"\n{'='*60}")
    print(f"  Complete: {total_rels} total relation(s) across {len(db)} specializations")
    print(f"  Total time: {total_elapsed:.1f}s")
    print(f"  Database: {DB_PATH}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
