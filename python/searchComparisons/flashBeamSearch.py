"""
FlashBeam Search for nontrivial unit-determinant matrices in PGL_2(Z[1/6]).

Generators:  A = ((9,0),(0,1))  and  B = ((82,2),(9,1))
and their inverses.

After multiplying, we immediately primitize by dividing through by powers
of 2 and 3.  Score = log(|det|).  Goal: det = ±1 with nontrivial trace.

Strategy: extend using the 50 group elements we've seen so far with the
lowest scores (the "flash pool"), not just the generators.
"""

import math
import json
import time
from flint import fmpz, fmpz_mat

# ─── Matrix helpers using flint ────────────────────────────────────────

IDENTITY = fmpz_mat(2, 2, [1, 0, 0, 1])
NEG_IDENTITY = fmpz_mat(2, 2, [-1, 0, 0, -1])

def get_content(M):
    entries = [abs(int(x)) for x in M.entries()]
    g = entries[0]
    for e in entries[1:]:
        g = math.gcd(g, e)
    return g

def primitize(M):
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
    d = abs(int(M.det()))
    if d == 0:
        return float('inf')
    return math.log(d)

def mat_hash(M):
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
    """Orbit of basepoint i: g(i) = (ai+b)/(ci+d)."""
    a, b, c, d = [int(x) for x in M.entries()]
    denom = c * c + d * d
    if denom == 0:
        return complex(0, 100)
    re = (a * c + b * d) / denom
    im = (a * d - b * c) / denom
    return complex(re, max(abs(im), 1e-6))

def half_plane_to_disk(z):
    i = complex(0, 1)
    w = (z - i) / (z + i)
    return (w.real, w.imag)

# ─── Search ────────────────────────────────────────────────────────────

POOL_SIZE = 10000
FLASH_SIZE = 50
MAX_STAGES = 200

def flash_beam_search(callback=None):
    """
    FlashBeam search: extend using the 50 best group elements seen so far
    (the flash pool) instead of just generators.

    Bootstrap: first 2 stages use generators to build up the pool,
    then switch to flash-based expansion.
    """
    visited = {}
    # Pool entries: (matrix, word, score)
    pool = []

    s0 = mat_score(IDENTITY)
    pool.append((IDENTITY, '', s0))
    visited[mat_hash(IDENTITY)] = (IDENTITY, '', s0)

    solutions = []

    # ── Bootstrap: 2 stages of generator-based expansion ──
    for bootstrap_stage in range(2):
        candidates = []
        for (m, word, sc) in pool:
            for (gen_mat, gen_name) in GENERATORS:
                new_mat = pgl_mul(m, gen_mat)
                new_word = f"{word}.{gen_name}" if word else gen_name
                uid = mat_hash(new_mat)
                if uid in visited:
                    continue
                s = mat_score(new_mat)
                visited[uid] = (new_mat, new_word, s)

                det = abs(int(new_mat.det()))
                if det == 1:
                    tr = abs(mat_trace(new_mat))
                    if tr > 2:
                        solutions.append({
                            'word': new_word, 'trace': tr,
                            'matrix': [int(x) for x in new_mat.entries()],
                            'stage': 0
                        })

                candidates.append((new_mat, new_word, s))
        pool = candidates

    # ── Seed flash pool from the bootstrap results ──
    all_seen = [(s, m, w) for uid, (m, w, s) in visited.items()
                if mat_hash(m) != mat_hash(IDENTITY)
                and mat_hash(m) != mat_hash(NEG_IDENTITY) and s > 0]
    all_seen.sort(key=lambda x: x[0])
    flash_pool = all_seen[:FLASH_SIZE]

    print(f"[FlashBeam] Bootstrap: pool={len(pool)}, flash={len(flash_pool)}, "
          f"visited={len(visited)}")

    for stage in range(1, MAX_STAGES + 1):
        candidates = []

        # The expansion set is the flash pool
        expansion = [(m, w) for (s, m, w) in flash_pool]

        for (beam_mat, beam_word, beam_score) in pool:
            for (exp_mat, exp_name) in expansion:
                # Right multiply: beam * flash
                new_mat = pgl_mul(beam_mat, exp_mat)
                new_word = f"{beam_word}*({exp_name})" if beam_word else exp_name
                uid = mat_hash(new_mat)

                if uid not in visited:
                    s = mat_score(new_mat)
                    visited[uid] = (new_mat, new_word, s)

                    det = abs(int(new_mat.det()))
                    if det == 1:
                        tr = abs(mat_trace(new_mat))
                        if tr > 2:
                            solutions.append({
                                'word': new_word, 'trace': tr,
                                'matrix': [int(x) for x in new_mat.entries()],
                                'stage': stage
                            })
                            if callback:
                                callback('solution', {
                                    'word': new_word, 'trace': tr, 'stage': stage
                                })

                    candidates.append((new_mat, new_word, s))

                # Left multiply: flash * beam
                new_mat2 = pgl_mul(exp_mat, beam_mat)
                new_word2 = f"({exp_name})*{beam_word}" if beam_word else exp_name
                uid2 = mat_hash(new_mat2)

                if uid2 not in visited:
                    s2 = mat_score(new_mat2)
                    visited[uid2] = (new_mat2, new_word2, s2)

                    det2 = abs(int(new_mat2.det()))
                    if det2 == 1:
                        tr2 = abs(mat_trace(new_mat2))
                        if tr2 > 2:
                            solutions.append({
                                'word': new_word2, 'trace': tr2,
                                'matrix': [int(x) for x in new_mat2.entries()],
                                'stage': stage
                            })
                            if callback:
                                callback('solution', {
                                    'word': new_word2, 'trace': tr2, 'stage': stage
                                })

                    candidates.append((new_mat2, new_word2, s2))

        if not candidates:
            break

        # Beam selection: keep lowest scores
        candidates.sort(key=lambda x: x[2])
        pool = candidates[:POOL_SIZE]

        # Update flash pool: merge current beam into global best
        all_for_flash = flash_pool + [(s, m, w) for (m, w, s) in pool]
        # Remove identity/trivial
        id_hash = mat_hash(IDENTITY)
        neg_id_hash = mat_hash(NEG_IDENTITY)
        all_for_flash = [(s, m, w) for (s, m, w) in all_for_flash
                         if mat_hash(m) not in (id_hash, neg_id_hash) and s > 0]
        all_for_flash.sort(key=lambda x: x[0])

        # Deduplicate
        seen = set()
        new_flash = []
        for (s, m, w) in all_for_flash:
            uid = mat_hash(m)
            if uid not in seen:
                seen.add(uid)
                new_flash.append((s, m, w))
            if len(new_flash) >= FLASH_SIZE:
                break
        flash_pool = new_flash

        best_score = pool[0][2] if pool else float('inf')

        if callback:
            viz = []
            for (m, w, s) in pool[:500]:
                fp = mobius_fixed_point(m)
                dx, dy = half_plane_to_disk(fp)
                viz.append({'word': w, 'score': s, 'x': dx, 'y': dy})
            flash_info = [{'word': w, 'score': s} for (s, m, w) in flash_pool[:10]]
            callback('update', {
                'stage': stage, 'pool_size': len(pool),
                'best_score': best_score,
                'total_visited': len(visited),
                'solutions_found': len(solutions),
                'flash_size': len(flash_pool),
                'flash_top': flash_info, 'nodes': viz
            })

        if stage % 5 == 0 or stage <= 3:
            flash_best = flash_pool[0][0] if flash_pool else float('inf')
            print(f"[FlashBeam] Stage {stage:3d}: pool={len(pool):6d} | "
                  f"best_score={best_score:.4f} | flash_best={flash_best:.4f} | "
                  f"visited={len(visited):8d} | solutions={len(solutions)}")

    return solutions, visited


if __name__ == '__main__':
    output_file = 'flashbeam_results.json'
    print("=" * 60)
    print("FlashBeam Search for Unit Det Matrices in PGL_2(Z[1/6])")
    print("=" * 60)
    print(f"Pool size: {POOL_SIZE}, Flash size: {FLASH_SIZE}, Max stages: {MAX_STAGES}\n")

    start = time.time()
    solutions, visited = flash_beam_search()
    elapsed = time.time() - start

    print(f"\nDone in {elapsed:.1f}s  |  visited={len(visited)}  |  solutions={len(solutions)}")
    for sol in solutions[:10]:
        print(f"  Stage {sol['stage']}: trace={sol['trace']}  word={sol['word'][:80]}")

    results = {
        'method': 'flashbeam', 'pool_size': POOL_SIZE,
        'flash_size': FLASH_SIZE, 'max_stages': MAX_STAGES,
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
