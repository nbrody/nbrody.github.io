"""SL3(Z[1/p]) representations of the torus orbifold group
G = <a, b | [a,b]^2> and a p-adic properness sweep.

Normal form (verified symbolically): for s, t in Z[1/p],
    A(s,t) = [[s, 0, 1], [1 - s t, 0, -t], [0, 1, 0]]     charpoly x^3 - s x^2 + t x - 1
    J      = diag(1, -1, -1),   K' = diag(-1, 1, -1),   K' A K' = J A
    B      = K' h(A),  h in Q[A] with det h(A) = 1  (the twist / bulge torus)
Then [A, B] = J, so a -> A, b -> B is a representation of G.

Properness at p.  For Gamma <= SL3(Z[1/p]) acting on the Bruhat-Tits building of
SL3(Q_p): gamma is elliptic iff its characteristic polynomial lies in Z_p[x],
i.e. iff tr(gamma), tr(gamma^-1) are in Z (entries are in Z[1/p]).  Vertex
stabilisers are Gamma ∩ g SL3(Z) g^-1 (virtually torsion free), so the action
is proper iff no infinite-order element of G maps to a matrix with integral
characteristic polynomial.

Word alphabet: 'A','B' generators, 'a','b' inverses (as in misc/LongReid).
"""
from fractions import Fraction as F

INV = {'A': 'a', 'a': 'A', 'B': 'b', 'b': 'B'}

# ---------------------------------------------------------------- matrices (Fraction)
def mmul(X, Y):
    return [[sum(X[i][k] * Y[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

def madd(X, Y, c=1):
    return [[X[i][j] + c * Y[i][j] for j in range(3)] for i in range(3)]

def mscal(c, X):
    return [[c * X[i][j] for j in range(3)] for i in range(3)]

def eye():
    return [[F(int(i == j)) for j in range(3)] for i in range(3)]

def det(X):
    return (X[0][0] * (X[1][1] * X[2][2] - X[1][2] * X[2][1])
            - X[0][1] * (X[1][0] * X[2][2] - X[1][2] * X[2][0])
            + X[0][2] * (X[1][0] * X[2][1] - X[1][1] * X[2][0]))

def adj(X):
    c = lambda i, j: (X[(i+1) % 3][(j+1) % 3] * X[(i+2) % 3][(j+2) % 3]
                      - X[(i+1) % 3][(j+2) % 3] * X[(i+2) % 3][(j+1) % 3])
    return [[c(j, i) for j in range(3)] for i in range(3)]

def minv(X):
    d = det(X)
    return mscal(F(1) / d, adj(X))

def mpow(X, n):
    if n < 0:
        X, n = minv(X), -n
    R = eye()
    for _ in range(n):
        R = mmul(R, X)
    return R

def A_mat(s, t):
    s, t = F(s), F(t)
    return [[s, F(0), F(1)], [1 - s * t, F(0), -t], [F(0), F(1), F(0)]]

J = [[F(1), F(0), F(0)], [F(0), F(-1), F(0)], [F(0), F(0), F(-1)]]
KP = [[F(-1), F(0), F(0)], [F(0), F(1), F(0)], [F(0), F(0), F(-1)]]

def charpoly(s, t):
    return lambda r: r**3 - s * r**2 + t * r - 1

def tr(X):
    return X[0][0] + X[1][1] + X[2][2]

def sigma2(X):
    return (X[0][0] * X[1][1] - X[0][1] * X[1][0] + X[0][0] * X[2][2] - X[0][2] * X[2][0]
            + X[1][1] * X[2][2] - X[1][2] * X[2][1])

# ---------------------------------------------------------------- p-adic helpers
def vp(x, p):
    x = F(x)
    if x == 0:
        return 10**9
    n, d, v = x.numerator, x.denominator, 0
    while n % p == 0:
        n //= p; v += 1
    while d % p == 0:
        d //= p; v -= 1
    return v

def is_p_unit_ring(x, p):
    """x in Z[1/p]?"""
    d = F(x).denominator
    while d % p == 0:
        d //= p
    return d == 1

def to_int(X, p):
    """X in M3(Z[1/p]) -> (N, e) with X = N / p^e, N integral."""
    e = 0
    for row in X:
        for x in row:
            if not is_p_unit_ring(x, p):
                raise ValueError(f'entry {x} not in Z[1/{p}]')
            e = max(e, -vp(x, p)) if x != 0 else e
    sc = p**e
    N = tuple(int(x * sc) for row in X for x in row)
    return N, e

# ---------------------------------------------------------------- G word problem
# Newman's spelling theorem for one-relator groups with torsion <X | S^n>:
# a nontrivial freely reduced word equal to 1 contains a subword of a cyclic
# permutation of R^{+-1} (R = S^n) of length > (n-1)|S|.  Here S = ABab, n = 2.
_S = 'ABab'
_R = _S * 2
_RI = ''.join(INV[c] for c in reversed(_R))
_PIECES = []
for R in (_R, _RI):
    for i in range(len(R)):
        rot = R[i:] + R[:i]
        for k in range(len(_S) + 1, len(R) + 1):        # k >= 5
            u = rot[:k]
            rest = rot[k:]
            repl = ''.join(INV[c] for c in reversed(rest))
            _PIECES.append((u, repl))
_PIECES = sorted(set(_PIECES), key=lambda pr: -len(pr[0]))

def free_reduce(w):
    out = []
    for c in w:
        if out and out[-1] == INV[c]:
            out.pop()
        else:
            out.append(c)
    return ''.join(out)

def dehn(w):
    w = free_reduce(w)
    changed = True
    while changed and w:
        changed = False
        for u, repl in _PIECES:
            i = w.find(u)
            if i >= 0:
                w = free_reduce(w[:i] + repl + w[i + len(u):])
                changed = True
                break
    return w

def is_trivial(w):
    return dehn(w) == ''

def is_torsion(w):
    """All torsion of G is conjugate into <[a,b]>, of order 2."""
    return is_trivial(w + w)

def cyc_canon(w):
    """Canonical representative of the cyclic word up to rotation and inversion."""
    wi = ''.join(INV[c] for c in reversed(w))
    return min(min(x[i:] + x[:i] for i in range(len(x))) for x in (w, wi))

# ---------------------------------------------------------------- the sweep
def _mul(X, Y, M):
    a0, a1, a2, a3, a4, a5, a6, a7, a8 = X
    b0, b1, b2, b3, b4, b5, b6, b7, b8 = Y
    return ((a0*b0 + a1*b3 + a2*b6) % M, (a0*b1 + a1*b4 + a2*b7) % M, (a0*b2 + a1*b5 + a2*b8) % M,
            (a3*b0 + a4*b3 + a5*b6) % M, (a3*b1 + a4*b4 + a5*b7) % M, (a3*b2 + a4*b5 + a5*b8) % M,
            (a6*b0 + a7*b3 + a8*b6) % M, (a6*b1 + a7*b4 + a8*b7) % M, (a6*b2 + a7*b5 + a8*b8) % M)

def sweep(gens, p, L, max_hits=5, stop_on_hit=True):
    """gens: dict letter -> Fraction 3x3 matrix in SL3(Z[1/p]).
    DFS over freely reduced words of length <= L; for cyclically reduced words
    test integrality of the characteristic polynomial; report infinite-order hits.
    Returns (hits, n_tested) where hits = list of (word, tr, tr_inv)."""
    ints = {c: to_int(X, p) for c, X in gens.items()}
    emax = max(e for _, e in ints.values())
    M = p ** (2 * emax * L + 2)
    hits, seen = [], set()
    n_tested = 0
    stack = [(c, ints[c][0], ints[c][1]) for c in 'ABab']
    while stack:
        w, N, e = stack.pop()
        if w[0] != INV[w[-1]]:
            n_tested += 1
            q = p ** e
            trN = N[0] + N[4] + N[8]
            if trN % q == 0:
                s2 = (N[0]*N[4] - N[1]*N[3] + N[0]*N[8] - N[2]*N[6] + N[4]*N[8] - N[5]*N[7])
                if s2 % (q * q) == 0:
                    key = cyc_canon(w)
                    if key not in seen:
                        seen.add(key)
                        if not is_torsion(key):
                            hits.append(key)
                            if stop_on_hit or len(hits) >= max_hits:
                                return hits, n_tested
        if len(w) < L:
            last = w[-1]
            for c in 'ABab':
                if c != INV[last]:
                    Nc, ec = ints[c]
                    stack.append((w + c, _mul(N, Nc, M), e + ec))
    return hits, n_tested

def word_matrix(w, gens):
    X = eye()
    for c in w:
        X = mmul(X, gens[c])
    return X

def make_gens(A, B):
    return {'A': A, 'B': B, 'a': minv(A), 'b': minv(B)}
