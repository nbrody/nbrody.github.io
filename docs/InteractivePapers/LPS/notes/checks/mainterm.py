# (1.5), (4.19), (4.20): r_Q(p^k) = C(p^k) + O(p^{k(1/2+eps)}),
# C(p^k) = c * sigma(p^k), except C = 0 for k odd when (p/q) = -1; c = 4/(q(q^2-1)) in both cases.
src = open('lps415.py').read().split('for p, q in [')[0]
exec(src)
for p, q in [(5, 13), (13, 17), (17, 13), (5, 29), (29, 5)]:
    leg = legendre(p, q); c = 4 / (q * (q * q - 1))
    print(f'p={p} q={q} (p/q)={leg:+d}')
    for k in range(0, 13):
        if p**k > 2e8: break
        sig = (p**(k + 1) - 1) // (p - 1)
        C = 0 if (leg == -1 and k % 2) else c * sig
        r = rQ(p**k, q)
        print(f'   k={k}: r_Q={r:>9}  C={C:>12.1f}  (r-C)/p^(k/2)={(r - C) / p**(k / 2):+.3f}', flush=True)
