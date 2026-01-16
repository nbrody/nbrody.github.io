import math
import time
from flint import fmpz_mat

# =============================
# Group definition
# =============================
MAT_A = fmpz_mat(2, 2, [9, 0, 0, 1])
MAT_B = fmpz_mat(2, 2, [82, 2, 9, 1])
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])

IDENTITY = fmpz_mat(2, 2, [1, 0, 0, 1])
GENERATORS = {"A": MAT_A, "B": MAT_B, "a": MAT_Ai, "b": MAT_Bi}
INVERSE_NAMES = {"A": "a", "a": "A", "B": "b", "b": "B"}

FORBIDDEN_SUBWORDS = [
    "abABa", "aBAba", "AbaBA", "ABabA",
    "baBAb", "bABab", "BabAB", "BAbaB"
]

def is_valid_word(word_str):
    for forbidden in FORBIDDEN_SUBWORDS:
        if forbidden in word_str:
            return False
    return True

def get_content(M):
    entries = [abs(int(x)) for x in M.entries()]
    return math.gcd(*entries)

def reduce_matrix(M):
    c = get_content(M)
    if c <= 1: return M
    factor = 1
    while c > 0 and c % 2 == 0:
        c //= 2
        factor *= 2
    while c > 0 and c % 3 == 0:
        c //= 3
        factor *= 3
    if factor > 1:
        return fmpz_mat(2, 2, [int(x) // factor for x in M.entries()])
    return M

def matrix_score(M):
    """Lower is better. Use log of the norm (sum of absolute values of entries)."""
    norm = sum(abs(int(x)) for x in M.entries())
    return math.log10(float(norm))

# =============================
# Beam Search
# =============================

BEAM_WIDTH = 50000
MAX_DEPTH = 150

def beam_search():
    print(f"Starting LongReid Beam Search (Width={BEAM_WIDTH}, MaxDepth={MAX_DEPTH})...")
    # Frontier element: (score, word, matrix)
    frontier = [(matrix_score(IDENTITY), "", IDENTITY)]
    
    start_time = time.time()
    
    for depth in range(1, MAX_DEPTH + 1):
        candidates = []
        for _, word, mat in frontier:
            last_g = word[-1] if word else None
            for g_name, g_mat in GENERATORS.items():
                # Avoid trivial inverses
                if last_g and g_name == INVERSE_NAMES[last_g]:
                    continue
                
                new_word = word + g_name
                
                # Check forbidden subwords
                if not is_valid_word(new_word):
                    continue
                
                new_mat = reduce_matrix(mat * g_mat)
                
                # Check if it's identity or negative identity
                if new_mat.is_one() or new_mat == -IDENTITY:
                    print(f"\n!!! RELATION FOUND AT DEPTH {depth} !!!")
                    print(f"Word: {new_word}")
                    print(f"Matrix:\n{new_mat}")
                    return new_word
                
                candidates.append((matrix_score(new_mat), new_word, new_mat))
        
        # Sort by score and keep top BEAM_WIDTH
        candidates.sort(key=lambda x: x[0])
        frontier = candidates[:BEAM_WIDTH]
        
        if not frontier:
            print("Beam exhausted. No candidates left.")
            break
            
        elapsed = time.time() - start_time
        best_score, best_word, _ = frontier[0]
        print(f"Depth {depth:3}: Best Norm Index={10**best_score:12.4f} | Best Word: {best_word[:40]}... (Total {len(candidates):8} candidates)")

    print("\nNo relation found within max depth.")
    return None

if __name__ == "__main__":
    found = beam_search()
    if found:
        print("\n=== SUCCESS ===")
        print(f"Relation: {found}")
    else:
        print("\n=== FAILED ===")
