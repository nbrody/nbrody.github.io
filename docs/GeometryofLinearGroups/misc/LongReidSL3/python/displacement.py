"""Compare the p-adic building displacement of rho(w) with the hyperbolic
displacement of w under a Fuchsian model of G = <a,b|[a,b]^2>.

D_p(g) = -min v_p(g_ij) - min v_p((g^-1)_ij)  (Cartan vector length of g at the
standard vertex; D_p = 0 iff g in SL3(Z)).  Properness <=> D_p -> infinity as
the hyperbolic displacement does; the lower envelope min D_p per hyperbolic
shell is printed."""
import argparse, math
from family import *

def fuchsian():
    # tr A = tr B = tr AB = 1 + sqrt 3 :  x^2+y^2+z^2-xyz = 2  <=>  tr[A,B] = 0
    x = 1 + math.sqrt(3)
    lam = (x + math.sqrt(x * x - 4)) / 2
    A = (lam, 0.0, 0.0, 1 / lam)
    # B = [[a,1],[c,d]], a + d = x, lam a + d/lam = x, ad - c = 1
    a = (x - x / lam) / (lam - 1 / lam); d = x - a; c = a * d - 1
    B = (a, 1.0, c, d)
    def inv(M): return (M[3], -M[1], -M[2], M[0])
    return {'A': A, 'B': B, 'a': inv(A), 'b': inv(B)}

def m2(X, Y):
    return (X[0]*Y[0] + X[1]*Y[2], X[0]*Y[1] + X[1]*Y[3], X[2]*Y[0] + X[3]*Y[2], X[2]*Y[1] + X[3]*Y[3])

def vmin(N, p, cap):
    v = cap
    for x in N:
        if x:
            k = 0
            while x % p == 0 and k < cap:
                x //= p; k += 1
            v = min(v, k)
    return v

def run(gens, p, L, width=0.5):
    from sl3core import _mul
    FU = fuchsian()
    c = m2(m2(FU['A'], FU['B']), m2(FU['a'], FU['b']))
    cc = m2(c, c)
    assert abs(cc[0] + 1) < 1e-9 and abs(cc[3] + 1) < 1e-9, cc
    ints = {k: to_int(X, p) for k, X in gens.items()}
    emax = max(e for _, e in ints.values())
    K = 2 * emax * L + 4
    M = p ** K
    best = {}       # shell -> (D, word)
    seen = {}
    zero = []
    stack = [(k, ints[k][0], ints[INV[k]][0], ints[k][1], FU[k]) for k in 'ABab']
    while stack:
        w, N, Ni, e, Fm = stack.pop()
        key = tuple(round(z, 6) for z in Fm)
        if key[0] < 0 or (key[0] == 0 and key[1] < 0):
            key = tuple(-z for z in key)
        if key not in seen:
            seen[key] = w
            D = (e - vmin(N, p, K)) + (e - vmin(Ni, p, K))
            dh = math.acosh(max(1.0, sum(z * z for z in Fm) / 2))
            sh = int(dh / width)
            if sh not in best or D < best[sh][0]:
                best[sh] = (D, w)
            if D == 0:
                zero.append(w)
        if len(w) < L:
            for k in 'ABab':
                if k != INV[w[-1]]:
                    Nk, ek = ints[k]
                    stack.append((w + k, _mul(N, Nk, M), _mul(ints[INV[k]][0], Ni, M), e + ek, m2(Fm, FU[k])))
    return best, zero, len(seen)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('s'); ap.add_argument('r'); ap.add_argument('-p', type=int, default=3)
    ap.add_argument('-L', type=int, default=11)
    a = ap.parse_args()
    best, zero, n = run(family_gens(F(a.s), F(a.r)), a.p, a.L)
    print(f'rho_(s={a.s}, r={a.r}) at p={a.p}, words <= {a.L}, {n} distinct elements')
    print('elements in SL3(Z):', len(zero), [z for z in zero[:12]],
          '  (torsion:', sum(is_torsion(z) or is_trivial(z) for z in zero), ')')
    # only shells fully covered: hyperbolic displacement <= ~ L * min generator displacement
    for sh in sorted(best)[:40]:
        D, w = best[sh]
        print(f'  d_H in [{sh*0.5:4.1f},{sh*0.5+0.5:4.1f})  min D_p = {D:3d}   e.g. {w}')
