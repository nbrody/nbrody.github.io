from flint import fmpz_mat
import math

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

MAT_A = fmpz_mat(2, 2, [9, 0, 0, 1])
MAT_B = fmpz_mat(2, 2, [82, 2, 9, 1])
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])

tokens = "a . a . b . ai . ai . bi . a . b . a . a . bi . ai . bi . a . a . b . ai . b . a . a . bi . ai . bi . a . b . a . bi . a . b . ai . b . a . a . bi . a . a . a . b . ai . ai . bi . a . bi . ai . ai . b . b . a . bi . ai . ai . b . ai . bi . a . bi . ai . ai . b . a . bi . a . a . b . ai . b . a . bi . a . b . ai . b . a . a . bi . a . a . a . b . ai . ai . bi".split(" . ")

pairs = [
    (MAT_A, MAT_Ai),
    (MAT_Ai, MAT_A),
    (MAT_B, MAT_Bi),
    (MAT_Bi, MAT_B)
]

print("Checking 8 potential mappings...")
for i in range(4):
    for j in range(4):
        if i // 2 == j // 2: continue # Same pair
        
        m_a, m_ai = pairs[i]
        m_b, m_bi = pairs[j]
        m_map = {"a": m_a, "ai": m_ai, "b": m_b, "bi": m_bi}
        
        M = fmpz_mat(2, 2, [1, 0, 0, 1])
        for t in tokens:
            M = reduce_matrix(M * m_map[t])
        
        if M.is_one() or M == -fmpz_mat(2, 2, [1, 0, 0, 1]):
            print(f"SUCCESS! Mapping {i},{j} works.")
            print(M)
        else:
            norm = sum(abs(int(x)) for x in M.entries())
            print(f"Mapping {i},{j}: norm={norm}")
