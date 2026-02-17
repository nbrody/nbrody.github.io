"""
Random Search for nontrivial unit-determinant matrices in PGL_2(Z[1/6]).

Generators:  A = ((9,0),(0,1))  and  B = ((82,2),(9,1))
and their inverses.

After multiplying, we immediately primitize by dividing through by powers
of 2 and 3.  Score = log(|det|).  Goal: det = ±1 with nontrivial trace.

Strategy: save 10000 elements; extend by generators; randomly select 10000.
"""

import math
import random
import json
import time
from flint import fmpz, fmpz_mat

# ─── Matrix helpers using flint ────────────────────────────────────────

IDENTITY = fmpz_mat(2, 2, [1, 0, 0, 1])
NEG_IDENTITY = fmpz_mat(2, 2, [-1, 0, 0, -1])

def get_content(M):
    """GCD of absolute values of all entries."""
    entries = [abs(int(x)) for x in M.entries()]
    g = entries[0]
    for e in entries[1:]:
        g = math.gcd(g, e)
    return g

def primitize(M):
    """Divide out the largest power of 2 and 3 from the GCD of all entries."""
    c = get_content(M)
    if c <= 1:
        return M
    factor = 1
    temp = c
    while temp % 2 == 0:
        temp //= 2
        factor *= 2
    while temp % 3 == 0:
        temp //= 3
        factor *= 3
    if factor <= 1:
        return M
    return fmpz_mat(2, 2, [int(x) // factor for x in M.entries()])

def pgl_mul(A, B):
    """Multiply two matrices in PGL_2 and immediately primitize."""
    return primitize(A * B)

def mat_score(M):
    """log(|det|). Lower is better. 0 means det = ±1."""
    d = abs(int(M.det()))
    if d == 0:
        return float('inf')
    return math.log(d)

def mat_hash(M):
    """Hashable key for a matrix."""
    return tuple(int(x) for x in M.entries())

def mat_trace(M):
    return int(M[0,0]) + int(M[1,1])

# ─── Generators ────────────────────────────────────────────────────────

MAT_A  = fmpz_mat(2, 2, [9, 0, 0, 1])
MAT_B  = fmpz_mat(2, 2, [82, 2, 9, 1])
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])

GENERATORS = [
    (MAT_A,  'A'),
    (MAT_B,  'B'),
    (MAT_Ai, 'a'),
    (MAT_Bi, 'b'),
]

INVERSE_MAP = {'A': 'a', 'a': 'A', 'B': 'b', 'b': 'B'}

# ─── Hyperbolic geometry ──────────────────────────────────────────────

def mobius_fixed_point(M):
    """Orbit of basepoint i under Möbius action: g(i) = (ai+b)/(ci+d).

    This maps each group element to a unique point in the upper half-plane.
    The identity maps to i, which in turn maps to the center of the disk.
    """
    a, b, c, d = [int(x) for x in M.entries()]
    denom = c * c + d * d
    if denom == 0:
        return complex(0, 100)  # near ∞
    re = (a * c + b * d) / denom
    im = (a * d - b * c) / denom  # = det(M) / (c² + d²)
    return complex(re, max(abs(im), 1e-6))

def half_plane_to_disk(z):
    """Map from upper half-plane to Poincaré disk: w = (z - i)/(z + i)."""
    i = complex(0, 1)
    w = (z - i) / (z + i)
    return (w.real, w.imag)

# ─── Search ────────────────────────────────────────────────────────────

POOL_SIZE = 10000
MAX_STAGES = 200

def random_search(callback=None):
    """
    Random search: extend all elements by generators,
    then randomly sample POOL_SIZE for next stage.
    """
    visited = {}  # mat_hash -> (matrix, word, score)
    # Pool entries: (matrix, word, last_gen_name)
    pool = []

    s0 = mat_score(IDENTITY)
    pool.append((IDENTITY, '', None))
    visited[mat_hash(IDENTITY)] = (IDENTITY, '', s0)

    solutions = []

    for stage in range(1, MAX_STAGES + 1):
        candidates = []
        for (m, word, last_gen) in pool:
            for (gen_mat, gen_name) in GENERATORS:
                # Skip immediate inverse
                if last_gen and gen_name == INVERSE_MAP.get(last_gen):
                    continue

                new_mat = pgl_mul(m, gen_mat)
                new_word = f"{word}.{gen_name}" if word else gen_name
                uid = mat_hash(new_mat)

                if uid in visited:
                    continue

                s = mat_score(new_mat)
                visited[uid] = (new_mat, new_word, s)

                # Check for solution: det = ±1
                det = abs(int(new_mat.det()))
                if det == 1:
                    tr = abs(mat_trace(new_mat))
                    if tr > 2:
                        solutions.append({
                            'word': new_word,
                            'trace': tr,
                            'matrix': [int(x) for x in new_mat.entries()],
                            'stage': stage
                        })
                        if callback:
                            callback('solution', {
                                'word': new_word, 'trace': tr, 'stage': stage
                            })

                candidates.append((new_mat, new_word, gen_name))

        if not candidates:
            break

        # Random selection
        if len(candidates) > POOL_SIZE:
            pool = random.sample(candidates, POOL_SIZE)
        else:
            pool = candidates

        scores = [mat_score(m) for m, _, _ in pool]
        best_score = min(scores)

        if callback:
            viz = []
            for (m, w, lg) in pool[:500]:
                fp = mobius_fixed_point(m)
                dx, dy = half_plane_to_disk(fp)
                viz.append({'word': w, 'score': mat_score(m), 'x': dx, 'y': dy})
            callback('update', {
                'stage': stage, 'pool_size': len(pool),
                'best_score': best_score,
                'total_visited': len(visited),
                'solutions_found': len(solutions), 'nodes': viz
            })

        if stage % 5 == 0 or stage <= 3:
            print(f"[Random] Stage {stage:3d}: pool={len(pool):6d} | "
                  f"best_score={best_score:.4f} | visited={len(visited):8d} | "
                  f"solutions={len(solutions)}")

    return solutions, visited


if __name__ == '__main__':
    output_file = 'random_results.json'
    print("=" * 60)
    print("Random Search for Unit Det Matrices in PGL_2(Z[1/6])")
    print("=" * 60)
    print(f"Pool size: {POOL_SIZE}, Max stages: {MAX_STAGES}\n")

    start = time.time()
    solutions, visited = random_search()
    elapsed = time.time() - start

    print(f"\nDone in {elapsed:.1f}s  |  visited={len(visited)}  |  solutions={len(solutions)}")
    for sol in solutions[:10]:
        print(f"  Stage {sol['stage']}: trace={sol['trace']}  word={sol['word'][:80]}")

    results = {
        'method': 'random', 'pool_size': POOL_SIZE, 'max_stages': MAX_STAGES,
        'elapsed': elapsed, 'total_visited': len(visited),
        'solutions': solutions, 'all_elements': []
    }
    for uid, (m, w, s) in visited.items():
        fp = mobius_fixed_point(m)
        dx, dy = half_plane_to_disk(fp)
        results['all_elements'].append({
            'word': w, 'score': s, 'x': dx, 'y': dy,
            'matrix': [int(x) for x in m.entries()]
        })

    with open(output_file, 'w') as f:
        json.dump(results, f)
    print(f"Saved to {output_file}")
