#!/usr/bin/env python3
"""
make_exact.py — exact holonomy for poincare: the complete structure of every census
manifold, and the hyperbolic fillings listed in the census (|p| <= 10, q <= 3), as
matrices over a number field.

The developing map (js/develop.js, ported here) places the root tetrahedron at
(inf, 0, 1, z), so every vertex lies in the shape field K = Q(z_1, ..., z_n), and the
face pairings, hence the holonomy, lie in PGL_2(K). Here:
  1. polish the shapes to ~250 digits by Newton's method on the same equations as
     js/solver.js (edge equations, then H(m) = 0 or p H(m) + q H(l) = 2 pi i);
  2. find K = Q(theta) for a generic integer combination theta of the shapes (PARI's
     algdep), then a smaller defining polynomial with polredbest, generator w;
  3. develop at high precision, evaluate SnapPy's simplified generators, normalize
     (cusped: the meridian is z -> z + 1; closed: z -> 2z + 1/3, so poincare's
     basepoint is off the triangulation's edges) and scale each matrix projectively;
  4. write each entry as a polynomial in w with rational coefficients (lindep),
     checked to 150 digits.

Writes exact/<id>.json:  { "complete": rec, "fillings": { "p/q": rec } }, with
rec = { poly, near: [re, im], degree, mats: [[a, b, c, d], ...] } in poincare's syntax.

Usage:  python3 tools/make_exact.py [ids...]     (after make_census.py)
"""
import json
import os
import sys
import time

import snappy
from cypari import pari

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'exact')
DIGITS = 500
pari.set_real_precision(DIGITS)
pari.allocatemem(400 * 10**6, 2000 * 10**6)

I = pari('I')
PI = pari('Pi')
ONE = pari(1)
ZERO = pari(0)
TOL = pari('1e-300')

EDGE_TYPE = [[-1, 0, 1, 2], [0, -1, 2, 1], [1, 2, -1, 0], [2, 1, 0, -1]]
EVEN_ENDING = [[1, 3, 2, 0], [0, 2, 3, 1], [0, 3, 1, 2], [0, 1, 2, 3]]


def cx(z):
    return complex(float(pari.real(z)), float(pari.imag(z)))


# ---------------- equations (as js/solver.js) ----------------

def row_form(row, n):
    aw, aL, c0 = [0] * n, [0] * n, 0
    for j in range(n):
        A, B, C = row[3 * j], row[3 * j + 1], row[3 * j + 2]
        aw[j], aL[j] = A - C, C - B
        c0 += C
    return aw, aL, c0


def equations(entry, ref, spec):
    n = entry['nTet']
    eqs = [(row_form(r, n), 2 * PI * I) for r in ref['edgeRows']]
    for k in range(entry['nCusp']):
        m = row_form(entry['cuspRows'][2 * k], n)
        l = row_form(entry['cuspRows'][2 * k + 1], n)
        s = spec[k]
        if s is None:
            eqs.append((m, ZERO))
        else:
            p, q = s
            comb = ([p * a + q * b for a, b in zip(m[0], l[0])], [p * a + q * b for a, b in zip(m[1], l[1])], p * m[2] + q * l[2])
            eqs.append((comb, 2 * PI * I))
    return eqs


def newton(eqs, w, L, iters=60):
    n = len(w)
    for it in range(iters):
        F = []
        for (aw, aL, c0), rhs in eqs:
            v = I * PI * c0 - rhs
            for j in range(n):
                v += aw[j] * w[j] + aL[j] * L[j]
            # the start (SnapPy's shapes) is close, but its principal logs may sit on other
            # branches (negatively oriented tetrahedra): solve the equations modulo 2πi
            v -= 2 * PI * I * (pari.imag(v) / (2 * PI)).round()
            F.append(v)
        res = max(abs(f) for f in F)
        if res < pari('1e-%d' % (DIGITS - 15)):
            return w, L, res
        z = [pari.exp(x) for x in w]
        dL = [-zz / (1 - zz) for zz in z]
        J = pari.matrix(len(eqs), n, [eqs[i][0][0][j] + eqs[i][0][1][j] * dL[j] for i in range(len(eqs)) for j in range(n)])
        # least squares via the normal equations (the system is consistent)
        Jh = pari.conj(J).mattranspose()
        delta = pari.matsolve(Jh * J, Jh * pari.matrix(len(F), 1, [-f for f in F]))
        for j in range(n):
            w[j] += delta[j, 0]
            zj = pari.exp(w[j])
            Lp = pari.log(1 - zj)
            pred = L[j] + dL[j] * delta[j, 0]
            k = ((pari.imag(pred) - pari.imag(Lp)) / (2 * PI)).round()
            L[j] = Lp + 2 * PI * I * k
    raise RuntimeError('Newton did not converge (residual %s)' % res)


# ---------------- developing map (as js/develop.js) ----------------

def delta2(p, q):
    return p[0] * q[1] - q[0] * p[1]


def edge_shape(z, a, b):
    t = EDGE_TYPE[a][b]
    if t == 0:
        return z
    if t == 1:
        return 1 / (1 - z)
    return 1 - 1 / z


def fourth(P, k, z):
    a, b, c = EVEN_ENDING[k][:3]
    zab = edge_shape(z, a, b)
    K1, K2 = delta2(P[c], P[a]), delta2(P[c], P[b])
    x = P[b][0] * K1 - zab * K2 * P[a][0]
    y = P[b][1] * K1 - zab * K2 * P[a][1]
    s = abs(x) + abs(y)
    return [x / s, y / s]


def place_across(tets, z, t, f, P):
    T = tets[t]
    u, s = T['nbr'][f], T['glu'][f]
    Q = [None] * 4
    for i in range(4):
        if i != f:
            Q[s[i]] = P[i]
    Q[s[f]] = fourth(Q, s[f], z[u])
    return u, Q


def to01inf(p1, p2, p3):
    k1, k2 = delta2(p3, p2), delta2(p3, p1)
    return [k1 * p1[1], -k1 * p1[0], k2 * p2[1], -k2 * p2[0]]


def mmul(A, B):
    return [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]]


def adj(A):
    return [A[3], -A[1], -A[2], A[0]]


def mob3(P, Q):
    """PGL_2 map sending the triple P to Q (not normalized)."""
    return mmul(adj(to01inf(*Q)), to01inf(*P))


def develop(entry, z):
    tets = entry['tets']
    n = entry['nTet']
    root = entry['root']
    P = [None] * n
    P[root] = [[ONE, ZERO], [ZERO, ONE], [ONE, ONE], None]
    P[root][3] = fourth(P[root], 3, z[root])
    order = [root]
    i = 0
    while i < len(order):
        t = order[i]
        i += 1
        for f in range(4):
            if tets[t]['gen'][f] != 0:
                continue
            u, Q = place_across(tets, z, t, f, P[t])
            if P[u] is None:
                P[u] = Q
                order.append(u)
    gens = [None] * (entry['pres']['nOrig'] + 1)
    for t in range(n):
        for f in range(4):
            g = tets[t]['gen'][f]
            if g <= 0:
                continue
            u, Q = place_across(tets, z, t, f, P[t])
            s = tets[t]['glu'][f]
            face = [i for i in range(4) if i != f]
            gens[g] = mob3([P[u][s[i]] for i in face], [Q[s[i]] for i in face])
    return gens


def eval_word(word, gens):
    M = [ONE, ZERO, ZERO, ONE]
    for ch in word:
        k = ord(ch.lower()) - 96
        G = gens[k]
        M = mmul(M, G if ch.islower() else adj(G))
    return M


# ---------------- number fields ----------------

def height_ok(coeffs, slack=0.45):
    """A relation with n coefficients of size H is meaningful only if n·log10 H is well below the precision."""
    H = max(abs(int(c)) for c in coeffs if c != 0)
    import math
    return len(coeffs) * math.log10(H + 1) < slack * DIGITS


def minpoly(x, maxdeg=56):
    """The minimal polynomial of x: algdep with growing degree bounds, factored, height-checked."""
    for D in [D for D in (2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56) if D <= maxdeg]:
        p = pari.algdep(x, D)
        if p.poldegree() < 1:
            continue
        for fac in pari.factor(p)[0]:
            d = fac.poldegree()
            coeffs = [fac.polcoef(k) for k in range(d + 1)]
            if not height_ok(coeffs):
                continue
            if abs(pari.subst(fac, 'x', x)) < TOL * max(1, abs(x)) ** d:
                return fac, d
    return None, None


def in_field(x, w, d):
    """x as a polynomial in w (degree < d) with rational coefficients, or None."""
    basis = [x] + [w ** k for k in range(d)]
    rel = pari.lindep(basis)
    c0 = rel[0]
    if c0 == 0 or not height_ok([rel[k] for k in range(d + 1)], 0.6):
        return None
    coeffs = [-rel[k + 1] / c0 for k in range(d)]
    val = sum(coeffs[k] * w ** k for k in range(d))
    if abs(val - x) > TOL * max(1, abs(x)):
        return None
    return coeffs


def poly_tex(coeffs, var='w'):
    terms = []
    for k in range(len(coeffs) - 1, -1, -1):
        c = pari(coeffs[k])
        if c == 0:
            continue
        num, den = int(pari.numerator(c)), int(pari.denominator(c))
        sign = '-' if num < 0 else '+'
        a = abs(num)
        if k == 0:
            body = str(a) if den == 1 else '\\frac{%d}{%d}' % (a, den)
        else:
            mono = var if k == 1 else '%s^{%d}' % (var, k)
            if den == 1:
                body = mono if a == 1 else '%d%s' % (a, mono)
            else:
                body = ('\\frac{%s}{%d}' % (mono, den)) if a == 1 else ('\\frac{%d}{%d}%s' % (a, den, mono))
        terms.append((sign, body))
    if not terms:
        return '0'
    s = ('-' if terms[0][0] == '-' else '') + terms[0][1]
    for sign, body in terms[1:]:
        s += sign + body
    return s


def poly_str(P, var='w'):
    coeffs = [P.polcoef(k) for k in range(P.poldegree() + 1)]
    return poly_tex(coeffs, var)


# ---------------- one structure ----------------

def exact_record(entry, ref, spec, start_shapes, maxdeg=56):
    n = entry['nTet']
    z0 = [pari(str(complex(s).real)) + I * pari(str(complex(s).imag)) for s in start_shapes]
    w = [pari.log(z) for z in z0]
    L = [pari.log(1 - z) for z in z0]
    eqs = equations(entry, ref, spec)
    w, L, res = newton(eqs, w, L)
    z = [pari.exp(x) for x in w]
    # a primitive element of the shape field
    for trial in range(6):
        theta = sum((j + 1 + trial * (j * j + 1)) * z[j] for j in range(n))
        f, d = minpoly(theta, maxdeg)
        if f is None:
            continue
        coords = [in_field(zj, theta, d) for zj in z]
        if all(c is not None for c in coords):
            break
    else:
        raise RuntimeError('no primitive element found')
    # a smaller polynomial
    red = pari.polredbest(f, 1)
    g, a = red[0], red[1]          # a: a root of f in terms of a root of g
    # polroots works at low precision here: match the embedding roughly, then refine below
    best, bestd = None, None
    for r in pari.polroots(g):
        r = pari.real(r) * ONE + I * pari.imag(r) * ONE
        dist = abs(pari.subst(pari.lift(a), 'x', r) - theta)
        if bestd is None or dist < bestd:
            best, bestd = r, dist
    if bestd is not None and bestd > pari('1e-8') * max(1, abs(theta)):
        best = None
    if best is None:
        raise RuntimeError('could not locate the embedding after polredbest')
    # refine the root of g to full precision
    wv = pari.precision(best, DIGITS)        # polroots' roots carry ~19 digits: pad, then Newton
    dg = pari.deriv(g)
    for _ in range(40):
        wv = wv - pari.subst(g, 'x', wv) / pari.subst(dg, 'x', wv)
    if abs(pari.subst(pari.lift(a), 'x', wv) - theta) > TOL * max(1, abs(theta)):
        raise RuntimeError('the refined generator does not give theta')
    gens = develop(entry, z)
    pres = entry['pres']
    simple = [None] + [eval_word(word, gens) for word in pres['inOrig']]
    if all(s is None for s in spec):
        M = eval_word(pres['periph'][0][0], simple)
        # parabolic fixed point p = (a - d)/(2c), or infinity
        if abs(M[2]) > pari('1e-100') * (abs(M[0]) + abs(M[3])):
            p = (M[0] - M[3]) / (2 * M[2])
            X = [ZERO, ONE, ONE, -p]
        else:
            X = [ONE, ZERO, ZERO, ONE]
        Mp = mmul(mmul(X, M), adj(X))
        mu = Mp[1] / Mp[3]
        T = mmul([ONE, ZERO, ZERO, mu], X)
    else:
        T = [2 * ONE, pari('1/3'), ZERO, ONE]
    mats = []
    for G in simple[1:]:
        Gp = mmul(mmul(T, G), adj(T))
        # scale projectively by whichever nonzero entry gives the smallest coefficients
        big = max(abs(x) for x in Gp)
        best = None
        for idx in (3, 2, 1, 0):
            if abs(Gp[idx]) < pari('1e-80') * big:
                continue
            coords = [in_field(x / Gp[idx], wv, g.poldegree()) for x in Gp]
            if any(c is None for c in coords):
                continue
            size = sum(len(str(pari(c))) for cs in coords for c in cs)
            if best is None or size < best[0]:
                best = (size, coords)
        if best is None:
            raise RuntimeError('an entry is not in the shape field')
        mats.append([poly_tex(c) for c in best[1]])
    return {
        'poly': poly_str(g),
        'near': [round(float(pari.real(wv)), 12), round(float(pari.imag(wv)), 12)],
        'degree': int(g.poldegree()),
        'mats': mats,
    }


def main():
    census = json.load(open(os.path.join(HERE, 'census.json')))
    refs = json.load(open(os.path.join(HERE, '..', 'tests', 'reference.json')))
    want = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    for e in census:
        if want and e['id'] not in want:
            continue
        t0 = time.time()
        rec = {'id': e['id'], 'fillings': {}}
        name = e['id'] if e['kind'] != 'drilled' else None
        try:
            rec['complete'] = exact_record(e, refs[e['id']], [None] * e['nCusp'], [complex(*s) for s in e['shapes']])
        except Exception as err:
            print(e['id'], 'complete FAILED', err, file=sys.stderr)
        if e['nCusp'] == 1 and name:
            M0 = snappy.Manifold(name)
            fails = 0
            for f in e.get('fillings', []):
                p, q = f['slope']
                if q == 0:
                    continue
                F = M0.copy()
                F.dehn_fill((p, q))
                try:
                    r = exact_record(e, refs[e['id']], [(p, q)], [complex(x) for x in F.tetrahedra_shapes('rect')], maxdeg=16)
                    rec['fillings']['%d/%d' % (p, q)] = r
                except Exception as err:
                    fails += 1
                    print('  ', e['id'], (p, q), 'FAILED', err, file=sys.stderr)
            print(f"{e['id']:10s} complete deg {rec.get('complete', {}).get('degree')}, {len(rec['fillings'])} fillings ({fails} failed), {time.time() - t0:.1f}s", file=sys.stderr)
        else:
            print(f"{e['id']:10s} complete deg {rec.get('complete', {}).get('degree')}, {time.time() - t0:.1f}s", file=sys.stderr)
        with open(os.path.join(OUT, e['id'] + '.json'), 'w') as fh:
            json.dump(rec, fh, separators=(',', ':'))


if __name__ == '__main__':
    main()
