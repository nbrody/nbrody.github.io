"""Run collision.search on a list of (s, r, p, L) in parallel; append to data/collisions.json."""
import json, os, sys, time
from multiprocessing import Pool
from fractions import Fraction as F

CASES = [  # (s, r, p, L)
    ('1/3', '1', 3, 12), ('2/3', '1', 3, 12), ('1', '1/3', 3, 12), ('1/3', '-1', 3, 12),
    ('1/5', '1', 5, 11), ('1', '1/5', 5, 11), ('2/5', '1', 5, 11),
    ('1/7', '1', 7, 11), ('1', '1/7', 7, 11),
    # validation: known short-word failures
    ('-1/3', '-2', 3, 9), ('1/3', '-1/3', 3, 9), ('-2/7', '-2', 7, 9),
]

def run(case):
    import io, contextlib
    from family import family_gens
    from collision import search
    s, r, p, L = case
    buf = io.StringIO()
    t0 = time.time()
    with contextlib.redirect_stdout(buf):
        W, n, nc = search(family_gens(F(s), F(r)), p, L, max_witnesses=2)
    tors = len(getattr(search, 'tors', {}) or {})
    return dict(s=s, r=r, p=p, L=L, words=n, collisions=nc, witnesses=[str(w) for w in W],
                torsion_in_stab=tors, secs=round(time.time() - t0, 1), log=buf.getvalue().splitlines()[-3:])

if __name__ == '__main__':
    with Pool(min(len(CASES), os.cpu_count())) as pool:
        res = pool.map(run, CASES, chunksize=1)
    path = '../data/collisions.json'
    old = json.load(open(path)) if os.path.exists(path) else []
    json.dump(old + res, open(path, 'w'), indent=1)
    for x in res:
        verdict = ('WITNESS ' + x['witnesses'][0][:80]) if x['witnesses'] else f"none to length {2*x['L']}"
        print(f"p={x['p']} s={x['s']:>5} r={x['r']:>5} L={x['L']}: {verdict}  | Stab(o) torsion {x['torsion_in_stab']}  ({x['secs']}s)")
