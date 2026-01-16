from flint import fmpz_mat

def mat_2x2_to_4x4(M_2x2):
    rows = []
    rows.extend([M_2x2[0][0][0], 2*M_2x2[0][0][1], M_2x2[0][1][0], 2*M_2x2[0][1][1]])
    rows.extend([M_2x2[0][0][1], M_2x2[0][0][0], M_2x2[0][1][1], M_2x2[0][1][0]])
    rows.extend([M_2x2[1][0][0], 2*M_2x2[1][0][1], M_2x2[1][1][0], 2*M_2x2[1][1][1]])
    rows.extend([M_2x2[1][0][1], M_2x2[1][0][0], M_2x2[1][1][1], M_2x2[1][1][0]])
    return fmpz_mat(4, 4, rows)

MAT_A = mat_2x2_to_4x4([[(1, 1), (-1, 0)], [(1, 0), (0, 0)]])
MAT_B = mat_2x2_to_4x4([[(1, -1), (-1, 0)], [(1, 0), (0, 0)]])
MAT_Ai = MAT_A.inv()
MAT_Ai = fmpz_mat(4, 4, [int(x) for x in MAT_Ai.entries()])
MAT_Bi = MAT_B.inv()
MAT_Bi = fmpz_mat(4, 4, [int(x) for x in MAT_Bi.entries()])

IDENTITY = fmpz_mat(4, 4, [1 if i==j else 0 for i in range(4) for j in range(4)])

GENS = {"A": MAT_A, "B": MAT_B, "a": MAT_Ai, "b": MAT_Bi}

word = "baabbaabbaab"
M = IDENTITY
for g in word:
    M = M * GENS[g]

print(f"Matrix for {word}:")
print(M)
print("Is Identity?", M.is_one())
print("Is -Identity?", (M == -IDENTITY))
