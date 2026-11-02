"""Reference values for tests/zeta.test.mjs, computed with mpmath at 30 digits.
Run:  python3 tests/make-reference.py  (writes tests/reference.json)."""
import json, mpmath as mp
mp.mp.dps = 30

def c(z): return [float(mp.re(z)), float(mp.im(z))]

pts = []
sigmas = [-30, -8, -3, -1, -0.5, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 1.5, 2, 4, 9, 25]
for t in [0, 0.5, 3, 14.134725141734693, 20, 37, 60, 90, 130, 200, 300, 700]:
    for s in sigmas:
        if s == 1 and t == 0: continue
        pts.append((s, t))
for t in [1500, 7005.08, 1e4, 1e5, 1e6, 1e7, 1e8]:
    for s in [-6, -2, -0.4, 0, 0.3, 0.5, 0.62, 1, 1.4, 3, 7]:
        pts.append((s, t))
pts += [(0.5, -14.134725141734693), (2, -50), (-3, -7), (0.3, -300), (0.5, -1e5)]
zeta = []
for s, t in pts:
    v = mp.zeta(mp.mpc(s, t))
    zeta.append([s, t] + c(v))

hz = []
for t in [3, 10, 14.13, 17.8456, 50, 99, 150, 282.4547, 1000.5, 7005.08, 12345.678, 1e6 + 0.3, 3e7 + 0.1]:
    hz.append([t, float(mp.siegelz(t)), float(mp.siegeltheta(t))])

zeros = []
for n in [1, 2, 3, 10, 100, 125, 126, 127, 128, 1000, 6709, 6710, 10000, 100000, 10**6, 10**7]:
    zeros.append([n, float(mp.im(mp.zetazero(n)))])

grams = [[n, float(mp.grampoint(n))] for n in [0, 1, 10, 125, 126, 127, 1000, 100000]]

json.dump({'zeta': zeta, 'hardyZ': hz, 'zeros': zeros, 'gram': grams},
          open(__file__.replace('make-reference.py', 'reference.json'), 'w'))
print(len(zeta), 'zeta values;', len(hz), 'Z values;', len(zeros), 'zeros')
print('Lehmer pair', zeros[10:12], ' g126', grams[4], ' Z(g126)', float(mp.siegelz(grams[4][1])))
