"""Meet-in-the-middle search for Stab_Gamma(v) (point of P^2(Q)) or Stab_Gamma(L)
(line = covector phi), Gamma = rho_{s,r}(G).  BFS over Dehn-reduced words; the
state is the projective point gamma.v (prepend letters) or covector phi.gamma
(append letters), canonical as a primitive integer vector.  A collision gives
a stabiliser element; we keep those that move the complementary datum (axis
resp. center) of the transvection u = I + c v phi."""
import argparse, json, sys, time
from math import gcd
from fractions import Fraction as F
from sl3core import INV, word_matrix, mmul, minv, eye
from family import family_gens
from beam import FORB5, dehn_fast, inverse

def canon(x):
    g = 0
    for c in x: g = gcd(g, c)
    x = [c // g for c in x]
    for c in x:
        if c:
            if c < 0: x = [-y for y in x]
            break
    return tuple(x)

def int_matrix(X):
    L = 1
    for row in X:
        for e in row: L = L * e.denominator // gcd(L, e.denominator)
    return [[int(e * L) for e in row] for row in X]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--s', default='1'); ap.add_argument('--r', default='1/3')
    ap.add_argument('--mode', choices=['point', 'line'], required=True)
    ap.add_argument('--v', default='18,-28,-21'); ap.add_argument('--phi', default='7,0,6')
    ap.add_argument('-L', type=int, default=13)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    gens = family_gens(F(a.s), F(a.r))
    N = {c: int_matrix(X) for c, X in gens.items()}   # projective action: scalars irrelevant
    v = tuple(int(x) for x in a.v.split(',')); phi = tuple(int(x) for x in a.phi.split(','))
    start = canon(v) if a.mode == 'point' else canon(phi)
    def act(c, x):
        M = N[c]
        if a.mode == 'point':      # gamma -> c gamma, x -> M x
            return canon([sum(M[i][j] * x[j] for j in range(3)) for i in range(3)])
        else:                      # gamma -> gamma c, phi -> phi M
            return canon([sum(x[i] * M[i][j] for i in range(3)) for j in range(3)])
    table = {start: ''}
    layer = [('', start)]
    found, seen_g = [], set()
    t0 = time.time()
    for length in range(1, a.L + 1):
        nxt = []
        for w, x in layer:
            for c in 'ABab':
                if a.mode == 'point':
                    if w and c == INV[w[0]]: continue
                    w2 = c + w
                    if len(w2) >= 5 and w2[:5] in FORB5: continue
                else:
                    if w and c == INV[w[-1]]: continue
                    w2 = w + c
                    if len(w2) >= 5 and w2[-5:] in FORB5: continue
                x2 = act(c, x)
                u = table.get(x2)
                if u is None:
                    table[x2] = w2
                    nxt.append((w2, x2))
                    continue
                # collision: point mode  u.v = w2.v  => g = u^-1 w2 fixes v
                #            line mode   phi u = phi w2 => h = u w2^-1 fixes L
                g = dehn_fast(inverse(u) + w2) if a.mode == 'point' else dehn_fast(u + inverse(w2))
                if not g or g in seen_g: continue
                seen_g.add(g)
                X = word_matrix(g, gens)
                if X == eye() or X == [[-y for y in row] for row in eye()]: continue
                if a.mode == 'point':
                    moved = canon(int_row(phi_times(phi, minv(X))))      # phi g^-1
                    useful = moved != canon(phi)
                else:
                    moved = canon(int_row(mat_vec(X, v)))                 # g v
                    useful = moved != canon(v)
                found.append(dict(word=g, length=len(g), useful=useful, moved=list(moved)))
                if useful:
                    print(f'  USEFUL stabiliser (len {len(g)}): {g}  -> moves complementary datum to {moved}', flush=True)
        layer = nxt
        nu = sum(f['useful'] for f in found)
        print(f'  L={length}: orbit points {len(table)}, stabiliser elements {len(found)} (useful {nu}), {time.time()-t0:.0f}s', flush=True)
        json.dump(found, open(a.out, 'w'), indent=1)
        if nu >= 3: break

def phi_times(phi, X):
    return [sum(F(phi[i]) * X[i][j] for i in range(3)) for j in range(3)]
def mat_vec(X, v):
    return [sum(X[i][j] * F(v[j]) for j in range(3)) for i in range(3)]
def int_row(x):
    L = 1
    for e in x: L = L * e.denominator // gcd(L, e.denominator)
    return [int(e * L) for e in x]

if __name__ == '__main__':
    main()
