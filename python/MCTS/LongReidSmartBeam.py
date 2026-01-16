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

def get_balance(word):
    ca = word.count("A") - word.count("a")
    cb = word.count("B") - word.count("b")
    return abs(ca) + abs(cb)

def matrix_score(M, word):
    """
    Heuristic score for beam search.
    Favors:
    1. Small norm entries.
    2. Balanced words (in commutator subgroup).
    """
    norm = sum(abs(int(x)) for x in M.entries())
    balance = get_balance(word)
    # We prioritize balance heavily as relations must be in the kernel of abelianization
    return math.log10(float(norm)) + balance * 5.0

# =============================
# Beam Search
# =============================

BEAM_WIDTH = 50000
MAX_DEPTH = 100

def beam_search():
    print(f"Starting Smart LongReid Beam Search (Width={BEAM_WIDTH}, MaxDepth={MAX_DEPTH})...")
    print(f"Constraints: forbidden={FORBIDDEN_SUBWORDS}")
    
    # Frontier element: (score, word, matrix)
    frontier = [(matrix_score(IDENTITY, ""), "", IDENTITY)]
    
    start_time = time.time()
    
    for depth in range(1, MAX_DEPTH + 1):
        candidates = []
        for _, word, mat in frontier:
            last_g = word[-1] if word else None
            for g_name, g_mat in GENERATORS.items():
                if last_g and g_name == INVERSE_NAMES[last_g]:
                    continue
                
                new_word = word + g_name
                if not is_valid_word(new_word):
                    continue
                
                new_mat = reduce_matrix(mat * g_mat)
                
                if new_mat.is_one() or new_mat == -IDENTITY:
                    print(f"\n!!! RELATION FOUND AT DEPTH {depth} !!!")
                    print(f"Word: {new_word}")
                    return new_word
                
                candidates.append((matrix_score(new_mat, new_word), new_word, new_mat))
        
        # Sort and prune
        candidates.sort(key=lambda x: x[0])
        frontier = candidates[:BEAM_WIDTH]
        
        if not frontier:
            break
            
        elapsed = time.time() - start_time
        best_s, best_word, best_mat = frontier[0]
        norm = sum(abs(int(x)) for x in best_mat.entries())
        balance = get_balance(best_word)
        print(f"Depth {depth:3}: Best Norm={norm:8} | Balance={balance:2} | Word: {best_word[:40]}...")

    return None

if __name__ == "__main__":
    beam_search()
