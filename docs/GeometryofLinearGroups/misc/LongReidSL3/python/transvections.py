"""Transvection flags (center v, axis ker phi) for rho_{s,r}; exact sympy."""
from sympy import Matrix, Rational, eye, diag, gcd, ilcm, nsimplify
from functools import reduce

def family(s, r):
    s, r = Rational(s), Rational(r); t = r*s - r**2
    A = Matrix([[s,0,1],[1-s*t,0,-t],[0,1,0]]); B = diag(-1,1,-1)*(A - r*eye(3))
    return {'A': A, 'B': B, 'a': A.inv(), 'b': B.inv()}

def ev(w, G):
    M = eye(3)
    for c in w: M = M*G[c]
    return M

def prim(vec):
    vec = [Rational(x) for x in vec]
    L = reduce(ilcm, [x.q for x in vec], 1)
    ints = [int(x*L) for x in vec]
    g = reduce(gcd, [abs(x) for x in ints if x], 0)
    ints = [x//g for x in ints]
    for x in ints:
        if x:
            if x < 0: ints = [-y for y in ints]
            break
    return tuple(ints)

def flag(M):
    N = M - eye(3)
    assert N.rank() == 1 and (N*N).is_zero_matrix
    col = next(N[:, j] for j in range(3) if not N[:, j].is_zero_matrix)
    row = next(N[i, :] for i in range(3) if not N[i, :].is_zero_matrix)
    v, phi = prim(list(col)), prim(list(row))
    # N = c * v phi
    c = None
    for i in range(3):
        for j in range(3):
            if v[i] and phi[j]:
                c = N[i, j] / (v[i]*phi[j]); break
        if c is not None: break
    return v, phi, c
