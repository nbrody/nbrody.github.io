from flint import fmpz_mat

def reduce_matrix(M):
    while True:
        d2 = True
        for x in M.entries():
            if int(x) % 2 != 0:
                d2 = False
                break
        if d2:
            M = fmpz_mat(2, 2, [int(x) // 2 for x in M.entries()])
            continue
        d3 = True
        for x in M.entries():
            if int(x) % 3 != 0:
                d3 = False
                break
        if d3:
            M = fmpz_mat(2, 2, [int(x) // 3 for x in M.entries()])
            continue
        break
    return M

MAT_A = fmpz_mat(2, 2, [9, 0, 0, 1])
MAT_B = fmpz_mat(2, 2, [82, 2, 9, 1])
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])

GENS = {"A": MAT_A, "B": MAT_B, "a": MAT_Ai, "b": MAT_Bi}

word = "bABabABa"
M = fmpz_mat(2, 2, [1, 0, 0, 1])
for g in word:
    M = reduce_matrix(M * GENS[g])

print(f"Word: {word}")
print("Final Matrix:")
print(M)
print("Is Identity?", M.is_one())
print("Is -Identity?", (M == -fmpz_mat(2, 2, [1, 0, 0, 1])))
print("Determinant:", M.det())

# Check subword bABa
sub = fmpz_mat(2, 2, [1, 0, 0, 1])
for g in "bABa":
    sub = reduce_matrix(sub * GENS[g])
print("\nSubword bABa:")
print(sub)
print("Det(bABa):", sub.det())
