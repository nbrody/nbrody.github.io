"""Translation-length spectrum: building vs hyperbolic plane.

For every cyclically reduced word up to length L (one per conjugacy class up to
rotation/inversion), compute
  * eigenvalue valuations nu1 >= nu2 >= nu3 of rho(w) from the Newton polygon of
    x^3 - tr x^2 + tr(w^-1) x - 1, and l_p = nu1 - nu3 (graph-metric translation
    length in the SL3(Q_p) building; 0 <=> elliptic),
  * l_H = 2 arccosh(|tr|/2) in the Fuchsian model (G-length up to QI).
Prints, per word length, the classes minimising l_p / l_H."""
import argparse, math
from fractions import Fraction as F
from sl3core import to_int, INV, _mul, cyc_canon
from family import family_gens
from displacement import fuchsian, m2

def newton(a, b):
    """root valuations of x^3 + c2 x^2 + c1 x + c0 with v(c2)=a, v(c1)=b, v(c0)=0, v(c3)=0"""
    pts = [(0, 0), (1, b), (2, a), (3, 0)]
    hull = [pts[0]]
    i = 0
    while hull[-1][0] < 3:
        x0, y0 = hull[-1]
        best = None
        for (x, y) in pts:
            if x <= x0:
                continue
            sl = F(y - y0, x - x0)
            if best is None or sl < best[0] or (sl == best[0] and x > best[1][0]):
                best = (sl, (x, y))
        hull.append(best[1])
    nus = []
    for (x0, y0), (x1, y1) in zip(hull, hull[1:]):
        sl = F(y1 - y0, x1 - x0)
        nus += [-sl] * (x1 - x0)
    return sorted(nus, reverse=True)

def vint(x, p, cap):
    if x == 0:
        return cap
    v = 0
    while x % p == 0:
        x //= p; v += 1
    return v

def run(s, r, p, L, top=3):
    gens = family_gens(F(s), F(r))
    ints = {c: to_int(X, p) for c, X in gens.items()}
    FU = fuchsian()
    emax = max(e for _, e in ints.values())
    K = 2 * emax * L + 4
    M = p ** K
    best = {}
    stack = [(c, ints[c][0], ints[c][1], FU[c]) for c in 'ABab']
    while stack:
        w, N, e, Fm = stack.pop()
        if w[0] != INV[w[-1]]:
            key = cyc_canon(w)
            n = len(w)
            if key == w or True:
                trN = N[0] + N[4] + N[8]
                s2 = N[0]*N[4] - N[1]*N[3] + N[0]*N[8] - N[2]*N[6] + N[4]*N[8] - N[5]*N[7]
                a = vint(trN % M, p, K) - e          # v(tr)
                b = vint(s2 % M, p, K) - 2 * e       # v(tr w^-1)
                a, b = min(a, 10**6), min(b, 10**6)
                nus = newton(a, b)
                lp = nus[0] - nus[2]
                t = abs(Fm[0] + Fm[3])
                lH = 2 * math.acosh(t / 2) if t > 2 + 1e-9 else 0.0
                if lH > 1e-6:
                    ratio = float(lp) / lH
                    lst = best.setdefault(n, [])
                    if len(lst) < top or ratio < lst[-1][0]:
                        if all(k != key for _, k, *_ in lst):
                            lst.append((ratio, key, float(lp), lH, [str(x) for x in nus]))
                            lst.sort()
                            del lst[top:]
        if len(w) < L:
            for c in 'ABab':
                if c != INV[w[-1]]:
                    Nc, ec = ints[c]
                    stack.append((w + c, _mul(N, Nc, M), e + ec, m2(Fm, FU[c])))
    return best

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('s'); ap.add_argument('r'); ap.add_argument('-p', type=int, default=3)
    ap.add_argument('-L', type=int, default=11)
    a = ap.parse_args()
    best = run(a.s, a.r, a.p, a.L)
    print(f'rho_(s={a.s}, r={a.r}) p={a.p}: classes minimising l_p / l_H')
    for n in sorted(best):
        for ratio, key, lp, lH, nus in best[n][:2]:
            print(f'  len {n:2d}: l_p/l_H = {ratio:.4f}  l_p={lp:.3f} l_H={lH:6.2f}  nu={nus}  {key}')
