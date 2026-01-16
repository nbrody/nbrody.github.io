from flint import fmpz_mat
import math

# =============================
# Helper & Matrix Definitions
# =============================
def get_content(M):
    entries = [int(x) for x in M.entries()]
    return math.gcd(*entries)

def reduce_matrix(M):
    c = abs(get_content(M))
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

MAT_A = fmpz_mat(2, 2, [9, 0, 0, 1])
MAT_B = fmpz_mat(2, 2, [82, 2, 9, 1])
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])
GENS = {"A": MAT_A, "B": MAT_B, "a": MAT_Ai, "b": MAT_Bi}

# =============================
# Translate User Word
# a -> A, ai -> a, b -> B, bi -> b
# =============================
user_tokens = [
    "a", "a", "b", "ai", "ai", "bi", "a", "b", "a", "a", "bi", "ai", "bi", "a", "a", "b", 
    "ai", "b", "a", "a", "bi", "ai", "bi", "a", "b", "a", "bi", "a", "b", "ai", "b", "a", 
    "a", "bi", "a", "a", "a", "b", "ai", "ai", "bi", "a", "bi", "ai", "ai", "b", "b", "a", 
    "bi", "ai", "ai", "b", "ai", "bi", "a", "bi", "ai", "ai", "b", "a", "bi", "a", "a", "b", 
    "ai", "b", "a", "bi", "a", "b", "ai", "b", "a", "a", "bi", "a", "a", "a", "b", "ai", 
    "ai", "bi"
]

translation = {"a": "A", "ai": "a", "b": "B", "bi": "b"}
word = "".join([translation[t] for t in user_tokens])

# Verification
M = fmpz_mat(2, 2, [1, 0, 0, 1])
for g in word:
    M = reduce_matrix(M * GENS[g])

print(f"Word Length: {len(word)}")
print("Final Reduction:")
print(M)
print("Is Scalar?", (M[0,1] == 0 and M[1,0] == 0 and M[0,0] == M[1,1]))
print("Determinant:", M.det())

# Check for Forbidden Subwords
FORBIDDEN = ["abABa", "aBAba", "AbaBA", "ABabA", "baBAb", "bABab", "BabAB", "BAbaB"]
# Translate forbidden list to my A/B notation
# a->A, b->B, A->a, B->b
# Forbidden abABa -> ABabA? Need to be careful.
# My forbidden list was:
MY_FORBIDDEN = ["abABa", "aBAba", "AbaBA", "ABabA", "baBAb", "bABab", "BabAB", "BAbaB"]

print("\nChecking word for forbidden patterns:")
found_forbidden = []
for f in MY_FORBIDDEN:
    if f in word:
        found_forbidden.append(f)

if found_forbidden:
    print(f"Word CONTAINS forbidden patterns: {found_forbidden}")
else:
    print("Word is VALID under current constraints.")
