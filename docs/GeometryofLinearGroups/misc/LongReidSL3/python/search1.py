"""Scan simple parameters (s, t, twist) for SL3(Z[1/p]) reps of <a,b|[a,b]^2>
that survive the integral-charpoly sweep.  Twists come from p-units A - r
with chi(r) = +-p^k (chi(r) is linear in s, t)."""
import argparse, itertools, json, sys, time
from sl3core import *

ap = argparse.ArgumentParser()
ap.add_argument('-p', type=int, default=3)
ap.add_argument('--num', type=int, default=12, help='|numerator| bound for s, t')
ap.add_argument('--den', type=int, default=1, help='max p-exponent in denominators of s, t')
ap.add_argument('-L', type=int, default=8)
ap.add_argument('--deep', type=int, default=11)
ap.add_argument('--nmax', type=int, default=1, help='|exponent| bound on each (A-r) factor')
ap.add_argument('--out', default=None)
args = ap.parse_args()
p = args.p

def valset():
    out = set()
    for e in range(args.den + 1):
        for n in range(-args.num, args.num + 1):
            out.add(F(n, p**e))
    return sorted(out, key=lambda x: (abs(x.numerator) + x.denominator, x))

def ppow_sign(x):
    """x = d * p^k with d = +-1 ?  -> (d, k) or None"""
    if x == 0:
        return None
    k = vp(x, p)
    y = F(x) / F(p)**k
    return (1 if y > 0 else -1, k) if abs(y) == 1 else None

RS = sorted({F(r) for r in [1, -1, 2, -2, 3, -3, 4, -4]} |
            {F(sg * p**k) for sg in (1, -1) for k in (-2, -1, 1, 2)} |
            {F(sg * p**k + d) for sg in (1, -1) for k in (-1, 1) for d in (1, -1)},
            key=lambda x: (abs(x.numerator) + x.denominator, x))
RS = [r for r in RS if r != 0 and is_p_unit_ring(r, p)]

def disc_nonzero(s, t):
    # discriminant of x^3 - s x^2 + t x - 1
    a, b, c, d = 1, -s, t, -1
    D = 18*a*b*c*d - 4*b**3*d + b**2*c**2 - 4*a*c**3 - 27*a**2*d**2
    return D != 0

def twists(s, t):
    A = A_mat(s, t); I = eye()
    units = []
    for r in RS:
        ch = r**3 - s*r**2 + t*r - 1
        ds = ppow_sign(-ch)
        if ds:
            units.append((r, ds[0], ds[1]))
    out = []
    for combo in itertools.product(range(-args.nmax, args.nmax + 1), repeat=len(units)):
        if all(n == 0 for n in combo):
            continue
        tot = sum(n * k for n, (r, d, k) in zip(combo, units))
        if tot % 3:
            continue
        m = -tot // 3
        sign = 1
        for n, (r, d, k) in zip(combo, units):
            if n % 2:
                sign *= d
        # norm of eps * p^m * prod (A-r)^n  = eps * p^{3m} * prod(d p^k)^n = eps*sign
        eps = sign
        h = mscal(F(eps) * F(p)**m, I)
        desc = []
        for n, (r, d, k) in zip(combo, units):
            if n:
                h = mmul(h, mpow(madd(A, I, -r), n))
                desc.append(f'(A-{r})^{n}')
        assert det(h) == 1
        out.append((('-' if eps < 0 else '') + (f'{p}^{m}·' if m else '') + '·'.join(desc), h))
        if len(out) >= 40:
            break
    return units, out

def run():
    vals = valset()
    results = []
    t0 = time.time()
    n_pairs = n_with_units = 0
    for s in vals:
        for t in vals:
            if s.denominator == 1 and t.denominator == 1:
                continue
            if s * t == 1 or not disc_nonzero(s, t):
                continue
            if vp(4 * s * t, p) >= 0:          # [A,J] elliptic: tr = 4st - 1
                continue
            n_pairs += 1
            units, tw = twists(s, t)
            if not tw:
                continue
            n_with_units += 1
            A = A_mat(s, t)
            for desc, h in tw:
                B = mmul(KP, h)
                try:
                    g = make_gens(A, B)
                    hits, _ = sweep(g, p, args.L)
                except ValueError:
                    continue
                if hits:
                    continue
                results.append(dict(p=p, s=str(s), t=str(t), twist=desc,
                                    units=[(str(r), d, k) for r, d, k in units]))
    print(f'pairs scanned {n_pairs}, with p-unit twists {n_with_units}, survivors at L={args.L}: {len(results)}  ({time.time()-t0:.1f}s)', file=sys.stderr)
    return results

res = run()
# deepen
deep = []
for R in res:
    s, t = F(R['s']), F(R['t'])
    A = A_mat(s, t)
    # rebuild twist
    _, tw = twists(s, t)
    h = dict(tw)[R['twist']]
    g = make_gens(A, mmul(KP, h))
    hits, n = sweep(g, p, args.deep)
    R['deep'] = args.deep
    R['deep_hit'] = hits[0] if hits else None
    deep.append(R)
    print(R['s'], R['t'], R['twist'], '->', 'HIT ' + hits[0] if hits else f'survives L={args.deep}', flush=True)
if args.out:
    json.dump(deep, open(args.out, 'w'), indent=1)
