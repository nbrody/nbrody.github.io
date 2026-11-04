"""Meet-in-the-middle search for infinite-order elements of Gamma ∩ SL3(Z).

Gamma = rho(G) <= SL3(Z[1/p]) acts properly on the building of SL3(Q_p) iff
Stab_Gamma(o) = Gamma ∩ SL3(Z) is finite (o = [Z_p^3]).  Enumerate Dehn-reduced
words w of length <= L, hash the vertex rho(w).o by the Hermite normal form of
the lattice rho(w) Z_p^3 (up to homothety); a collision rho(u).o = rho(v).o
gives rho(u^-1 v) in SL3(Z), a witness when u^-1 v has infinite order in G.
Finds witnesses of length <= 2L with ~3^L work."""
import argparse, sys, time
from sl3core import *
from sl3core import _mul, _PIECES

def val(x, p, K):
    if x == 0:
        return K
    v = 0
    while x % p == 0:
        x //= p; v += 1
    return v

def vertex_key(N, p, K):
    P = p ** K
    cols = [[N[0] % P, N[3] % P, N[6] % P], [N[1] % P, N[4] % P, N[7] % P], [N[2] % P, N[5] % P, N[8] % P]]
    vs = []
    for i in range(3):
        j = min(range(i, 3), key=lambda j: val(cols[j][i], p, K))
        cols[i], cols[j] = cols[j], cols[i]
        x = cols[i][i]
        v = val(x, p, K)
        if v >= K:
            raise ArithmeticError('precision')
        pv = p ** v
        ui = pow(x // pv, -1, P)
        cols[i] = [(c * ui) % P for c in cols[i]]
        for j in range(i + 1, 3):
            m = cols[j][i] // pv
            if m:
                cols[j] = [(a - m * b) % P for a, b in zip(cols[j], cols[i])]
        vs.append(v)
    for i in range(3):
        for k in range(i + 1, 3):
            m = cols[i][k] // (p ** vs[k])
            if m:
                cols[i] = [(a - m * b) % P for a, b in zip(cols[i], cols[k])]
    m = min(val(c, p, K) for col in cols for c in col)
    pm = p ** m
    return tuple(c // pm for col in cols for c in col)

# forbidden suffixes: any piece of length >= 5 of a rotation of r^{+-1}
_FORB = {u for u, _ in _PIECES if len(u) == 5}

def inverse(w):
    return ''.join(INV[c] for c in reversed(w))

def search(gens, p, L, max_witnesses=3, verbose=True, cap=6):
    ints = {c: to_int(X, p) for c, X in gens.items()}
    emax = max(e for _, e in ints.values())
    K = 3 * emax * L + 3
    M = p ** K
    table = {}
    witnesses = []
    tors_words, tors_mats = set(), {}
    n = ncoll = 0
    t0 = time.time()
    # BFS by length so that table keeps the shortest word per vertex
    layer = [('', (1, 0, 0, 0, 1, 0, 0, 0, 1), 0)]
    table[vertex_key(layer[0][1], p, K)] = ['']
    for length in range(1, L + 1):
        nxt = []
        for w, N, e in layer:
            for c in 'ABab':
                if w and c == INV[w[-1]]:
                    continue
                w2 = w + c
                if len(w2) >= 5 and w2[-5:] in _FORB:
                    continue
                Nc, ec = ints[c]
                N2 = _mul(N, Nc, M)
                e2 = e + ec
                key = vertex_key(N2, p, K)
                n += 1
                if key in table:
                    ncoll += 1
                    bucket = table[key]
                    for u in bucket:
                        g = free_reduce(inverse(u) + w2)
                        if g and is_torsion(g):
                            dg = dehn(g)
                            if dg and dg not in tors_words:
                                tors_words.add(dg)
                                X = word_matrix(dg, gens)
                                mk = tuple(int(x) for row in X for x in row)
                                if mk not in tors_mats:
                                    tors_mats[mk] = dg
                            continue
                        if g and not is_torsion(g):
                            witnesses.append(g)
                            if verbose:
                                print(f'  WITNESS len {len(g)}: {g}', flush=True)
                            if len(witnesses) >= max_witnesses:
                                return witnesses, n, ncoll
                            break
                    if len(bucket) < cap:
                        bucket.append(w2)
                else:
                    table[key] = [w2]
                nxt.append((w2, N2, e2))
        layer = nxt
        if verbose:
            print(f'  L={length}: {n} words, {len(table)} vertices, {ncoll} collisions, '
                  f'{len(tors_mats)} distinct torsion elts of Stab(o), {time.time()-t0:.1f}s', flush=True)
        if len(tors_mats) > 48:
            print('  >48 distinct torsion elements in Stab(o) <= SL3(Z): NOT PROPER', flush=True)
            witnesses.append(('torsion-flood', list(tors_mats.values())[:60]))
            return witnesses, n, ncoll
    closure = finite_closure(list(tors_mats))
    if verbose:
        print(f'  closure of torsion stabiliser elements: {"infinite (>200)" if closure is None else len(closure)}', flush=True)
    if closure is None:
        witnesses.append(('torsion-closure', list(tors_mats.values())))
    search.tors = tors_mats
    return witnesses, n, ncoll

def finite_closure(mats, cap=200):
    I = (1, 0, 0, 0, 1, 0, 0, 0, 1)
    def mul(X, Y):
        return tuple(sum(X[3*i+k] * Y[3*k+j] for k in range(3)) for i in range(3) for j in range(3))
    G = {I}
    frontier = [I]
    while frontier:
        nf = []
        for X in frontier:
            for Y in mats:
                Z = mul(X, Y)
                if Z not in G:
                    G.add(Z); nf.append(Z)
                    if len(G) > cap:
                        return None
        frontier = nf
    return G

if __name__ == '__main__':
    from family import family_gens
    ap = argparse.ArgumentParser()
    ap.add_argument('s'); ap.add_argument('r'); ap.add_argument('-p', type=int, default=3)
    ap.add_argument('-L', type=int, default=10)
    a = ap.parse_args()
    g = family_gens(F(a.s), F(a.r))
    print(f'rho_(s={a.s}, r={a.r}), p={a.p}')
    W, n, nc = search(g, a.p, a.L)
    for w in W:
        X = word_matrix(w, g)
        print('verify', w, 'integral:', all(x.denominator == 1 for row in X for x in row), 'tr', tr(X), 'sigma2', sigma2(X))
