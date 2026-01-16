from flint import fmpz_mat
import math

def get_content(M):
    import math
    entries = [int(x) for x in M.entries()]
    if not entries: return 1
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

# Inverses as integer matrices (PGL representatives)
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])

raw_tokens = "a . a . b . ai . ai . bi . a . b . a . a . bi . ai . bi . a . a . b . ai . b . a . a . bi . ai . bi . a . b . a . bi . a . b . ai . b . a . a . bi . a . a . a . b . ai . ai . bi . a . bi . ai . ai . b . b . a . bi . ai . ai . b . ai . bi . a . bi . ai . ai . b . a . bi . a . a . b . ai . b . a . bi . a . b . ai . b . a . a . bi . a . a . a . b . ai . ai . bi".split(" . ")

mappings = [
    {"a": MAT_A, "ai": MAT_Ai, "b": MAT_B, "bi": MAT_Bi}, # ai=inv, bi=inv
    {"a": MAT_Ai, "ai": MAT_A, "b": MAT_Bi, "bi": MAT_B}, # ai=gen, bi=gen
    {"a": MAT_A, "ai": MAT_Ai, "b": MAT_Bi, "bi": MAT_B}, # ai=inv, bi=gen
    {"a": MAT_Ai, "ai": MAT_A, "b": MAT_B, "bi": MAT_Bi}  # ai=gen, bi=inv
]

for i, m in enumerate(mappings):
    M = fmpz_mat(2, 2, [1, 0, 0, 1])
    for t in raw_tokens:
        M = reduce_matrix(M * m[t])
    print(f"Mapping {i}: det={M.det()}, scalar={ (M[0,1]==0 and M[1,0]==0 and M[0,0]==M[1,1]) or (M[0,1]==0 and M[1,0]==0 and M[0,0]==-M[1,1]) }")
    if M.is_one() or M == -fmpz_mat(2, 2, [1, 0, 0, 1]):
        print(f"  FOUND! Mapping {i} works.")
        print(M)
