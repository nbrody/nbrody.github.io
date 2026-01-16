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

raw_tokens = "a . a . b . ai . ai . bi . a . b . a . a . bi . ai . bi . a . a . b . ai . b . a . a . bi . ai . bi . a . b . a . bi . a . b . ai . b . a . a . bi . a . a . a . b . ai . ai . bi . a . bi . ai . ai . b . b . a . bi . ai . ai . b . ai . bi . a . bi . ai . ai . b . a . bi . a . a . b . ai . b . a . bi . a . b . ai . b . a . a . bi . a . a . a . b . ai . ai . bi".split(" . ")

# Translate tokens to matrices
mapping = {"a": MAT_A, "ai": MAT_Ai, "b": MAT_B, "bi": MAT_Bi}

M = fmpz_mat(2, 2, [1, 0, 0, 1])
for i, t in enumerate(raw_tokens):
    M = M * mapping[t]
    # We don't reduce until the end to see the full integers
    
print(f"Final Matrix (Full):")
print(M)
det = int(M.det())
print(f"Determinant: {det}")
if det > 0:
    s_det = int(math.isqrt(det))
    if s_det * s_det == det:
        print(f"sqrt(det) = {s_det}")
        # Check if scalar multiple of identity
        if M[0,1] == 0 and M[1,0] == 0 and M[0,0] == M[1,1]:
            print(f"YES! It is {M[0,0]//s_det} * sqrt(det) * I")
        elif M[0,1] == 0 and M[1,0] == 0 and M[0,0] == -M[1,1]:
             print(f"Almost! Diagonal but not scalar: {M[0,0]}, {M[1,1]}")

print("\nMatrix after GCD reduction:")
M_red = reduce_matrix(M)
print(M_red)
if M_red.is_one() or M_red == -fmpz_mat(2,2,[1,0,0,1]):
    print("SUCCESS! This is a relation in PSL(2, Z[1/6])")
else:
    print("FAIL. Not identity.")
