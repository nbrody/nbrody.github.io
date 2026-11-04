from sl3core import *
# Dehn / Newman sanity
assert is_trivial('ABabABab') and is_trivial('abABabAB'[::-1].swapcase()[::-1].swapcase())
assert is_torsion('ABab') and is_torsion('BAba') and not is_torsion('A') and not is_torsion('ABAb')
assert is_torsion('A' + 'ABab' + 'a') and not is_trivial('ABab')
assert not is_torsion('AbaB' + 'ABab')   # [a,b^-1][a,b]
# representation sanity at s=-1, t=-2/3, p=3
s, t = F(-1), F(-2, 3)
A = A_mat(s, t); I = eye()
h = mscal(-1, mmul(madd(A, I, -1), minv(madd(A, I))))   # -(A-I)(A+I)^-1
print('det h =', det(h))
B = mmul(KP, h)
g = make_gens(A, B)
C = word_matrix('ABab', g)
print('[A,B] =', C)
for w in ['A', 'B', 'AB', 'Ab', 'ABab']:
    X = word_matrix(w, g); print(w, tr(X), sigma2(X))
