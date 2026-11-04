"""Independent verification of beam witnesses for rho_{1/3,1}, p = 3 (sympy, exact)."""
import json, sys
from sympy import Matrix, Rational, eye, symbols, factor, Poly
import mpmath as mp

s, r = Rational(1, 3), Rational(1)
t = r*s - r**2
A = Matrix([[s, 0, 1], [1 - s*t, 0, -t], [0, 1, 0]])
B = Matrix([[-1, 0, 0], [0, 1, 0], [0, 0, -1]]) * (A - r*eye(3))
assert A.det() == 1 and B.det() == 1
J = Matrix([[1, 0, 0], [0, -1, 0], [0, 0, -1]])
assert A*B*A.inv()*B.inv() == J
G = {'A': A, 'B': B, 'a': A.inv(), 'b': B.inv()}

# Fuchsian model (tr A = tr B = tr AB = 1+sqrt3), 60-digit precision
mp.mp.dps = 60
x = 1 + mp.sqrt(3); lam = (x + mp.sqrt(x*x - 4)) / 2
a_ = (x - x/lam) / (lam - 1/lam); d_ = x - a_
FA = mp.matrix([[lam, 0], [0, 1/lam]]); FB = mp.matrix([[a_, 1], [a_*d_ - 1, d_]])
FG = {'A': FA, 'B': FB, 'a': FA**-1, 'b': FB**-1}
C = FA*FB*FA**-1*FB**-1
assert mp.norm(C*C + mp.eye(2)) < mp.mpf(10)**-50

X = symbols('x')
def check(w):
    M = eye(3)
    for c in w:
        M = M * G[c]
    integral = all(e.q == 1 for e in M)
    trM, trI = M.trace(), M.inv().trace()
    cp = factor(M.charpoly(X).as_expr())
    Fm = mp.eye(2)
    for c in w:
        Fm = Fm * FG[c]
    ftr = Fm[0, 0] + Fm[1, 1]
    print(f'len {len(w)}: rho(w) in M3(Z): {integral};  tr = {trM}, tr(w^-1) = {trI}')
    print(f'   charpoly = {cp}')
    print(f'   Fuchsian |tr| = {mp.nstr(abs(ftr), 12)}  (> 2 => w hyperbolic, infinite order in G)')
    if integral:
        print('   rho(w) =', M.tolist())
    return M

if __name__ == '__main__':
    d = json.load(open(sys.argv[1]))
    seen = set()
    for wrec in d['witnesses']:
        w = wrec['element']
        if w in seen:
            continue
        seen.add(w)
        if len(seen) > 4:
            break
        check(w)
