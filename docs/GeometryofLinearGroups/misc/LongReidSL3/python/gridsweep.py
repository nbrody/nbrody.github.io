"""Sweep the family rho_{s,r} over simple s, r in Z[1/p] (parallel)."""
import argparse, json, os, time
from multiprocessing import Pool
from family import *

ap = argparse.ArgumentParser()
ap.add_argument('-p', type=int, nargs='+', default=[2, 3, 5, 7])
ap.add_argument('-L', type=int, default=13)
ap.add_argument('--num', type=int, default=3)
ap.add_argument('--out', default='../data/gridsweep.json')
args = ap.parse_args() if __name__ == '__main__' else ap.parse_args([])

def simple_vals(p):
    v = set()
    for n in range(-args.num, args.num + 1):
        for e in (0, 1):
            v.add(F(n, p**e))
    v.discard(F(0))
    return sorted(v, key=lambda x: (abs(x.numerator) + x.denominator, x))

def job(args_):
    p, s, r, L = args_
    q = r - s
    if q == 0 or vp(4 * r * s * q, p) >= 0:
        return dict(p=p, s=str(s), r=str(r), status='[A,J] elliptic (4rs(r-s) in Z_p)')
    t0 = time.time()
    try:
        hits, n = sweep(family_gens(s, r), p, L)
    except ValueError as e:
        return dict(p=p, s=str(s), r=str(r), status=f'skip {e}')
    return dict(p=p, s=str(s), r=str(r), L=L, hit=hits[0] if hits else None,
                status=('HIT ' + hits[0]) if hits else f'survives L={L}', secs=round(time.time() - t0, 1))

if __name__ == '__main__':
    jobs = []
    for p in args.p:
        vals = simple_vals(p)
        for s in vals:
            for r in vals:
                jobs.append((p, s, r, args.L))
    with Pool(os.cpu_count()) as pool:
        res = pool.map(job, jobs, chunksize=1)
    json.dump(res, open(args.out, 'w'), indent=1)
    from collections import Counter
    for p in args.p:
        rp = [x for x in res if x['p'] == p]
        c = Counter(x['status'].split()[0] for x in rp)
        print(f'p={p}: {dict(c)}')
        for x in rp:
            if x['status'].startswith('survives'):
                print('   survive  s=%-6s r=%-6s' % (x['s'], x['r']))
        hits = [x for x in rp if x['status'].startswith('HIT')]
        for x in hits[:8]:
            print('   hit      s=%-6s r=%-6s %s' % (x['s'], x['r'], x['hit']))
