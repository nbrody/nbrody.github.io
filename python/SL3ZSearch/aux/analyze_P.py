
import flint
from flint import fmpz_mat

# Generators
MAT_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
MAT_B = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0])
MAT_T = fmpz_mat(3, 3, [3, 4, 6, 2, 3, 4, 2, 3, 5])

# Effective generators
a_eff = MAT_A  # GEN_A_POWER=1
b_eff = MAT_B ** 2  # GEN_B_POWER=2

def get_word_matrix():
    # word: t . a . b.b . t . ai.ai . bi.bi . ti . ai
    # Mapping based on SL3Zrelations logic:
    # t -> T
    # a -> a_eff
    # b.b -> b_eff (since GEN_B_POWER=2, 1 unit of b_eff gives "b.b")
    # t -> T
    # ai.ai -> a_eff^-2 (since GEN_A_POWER=1, -2 units gives "ai.ai")
    # bi.bi -> b_eff^-1 (since GEN_B_POWER=2, -1 unit gives "bi.bi")
    # ti -> T^-1
    # ai -> a_eff^-1
    
    # Sequence:
    m1 = MAT_T
    m2 = a_eff
    m3 = b_eff
    m4 = MAT_T
    m5 = a_eff.inv() ** 2
    m6 = b_eff.inv()
    m7 = MAT_T.inv()
    m8 = a_eff.inv()
    
    P = m1 * m2 * m3 * m4 * m5 * m6 * m7 * m8
    return P

P = get_word_matrix()
print("Matrix P:")
print(P)

print("\nMatrix P^2:")
P2 = P * P
print(P2)

print("\nChar Poly of P:")
print(P.charpoly())

print("\nChar Poly of P^2:")
print(P2.charpoly())

# Check eigenvectors/nullspace of (P^2 - I)
I = fmpz_mat(3, 3, [1,0,0, 0,1,0, 0,0,1])
diff = P2 - I
print("\nNullspace of (P^2 - I) (Geometric multiplicity):")
try:
    nulls = diff.nullspace() # Returns rank, basis
    print(f"Rank/Nullity: {nulls[0]}")
    for vec in nulls[1]:
        print(vec)
except Exception as e:
    print(e)
    # fall back to rref
    print("RREF of P^2 - I:")
    print(diff.rref())

