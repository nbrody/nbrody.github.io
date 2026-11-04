import sys, time
from family import *
s, r, p, L = F(sys.argv[1]), F(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
t0 = time.time()
hits, n = sweep(family_gens(s, r), p, L)
print(f's={s} r={r} p={p} L={L}: tested {n} cyclic words, hits={hits}, {time.time()-t0:.1f}s')
