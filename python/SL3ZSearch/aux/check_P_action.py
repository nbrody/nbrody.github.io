
import flint
from flint import fmpz_mat

MAT_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
MAT_B = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0])
MAT_T = fmpz_mat(3, 3, [3, 4, 6, 2, 3, 4, 2, 3, 5])

# P: t . a . b^2 . t . a^-2 . b^-2 . t^-1 . a^-1
P = MAT_T * MAT_A * (MAT_B**2) * MAT_T * (MAT_A.inv()**2) * (MAT_B.inv()**2) * MAT_T.inv() * MAT_A.inv()

print("P eigenvalues:", P.charpoly().roots())

# Plane N: 11x - 20y + 3z = 0
# Basis vectors
v1 = fmpz_mat(3, 1, [20, 11, 0])
v2 = fmpz_mat(3, 1, [0, 3, 20])

print("Check if v1 in plane:", 11*20 - 20*11 + 3*0)
print("Check if v2 in plane:", 11*0 - 20*3 + 3*20)

Pv1 = P * v1
Pv2 = P * v2

print("\nv1:", v1.transpose())
print("P*v1:", Pv1.transpose())

print("\nv2:", v2.transpose())
print("P*v2:", Pv2.transpose())

# Check if P acts as -I on the plane
if Pv1 == -v1 and Pv2 == -v2:
    print("\nCONCLUSION: P acts as -I on the plane.")
else:
    print("\nCONCLUSION: P does NOT act as -I on the plane.")
