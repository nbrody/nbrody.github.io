"""The polynomial two-parameter family  rho_{s,r} : <a,b|[a,b]^2> -> SL3(Z[s,r]).
    t = r s - r^2,  A = A(s,t),  B = K'(A - r I)   (det(A - rI) = -chi(r) = 1)."""
from sl3core import *

def family_gens(s, r):
    s, r = F(s), F(r)
    t = r * s - r * r
    A = A_mat(s, t)
    B = mmul(KP, madd(A, eye(), -r))
    assert det(B) == 1
    return make_gens(A, B)
