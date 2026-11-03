# Check LPS identity (4.15):  r_Q(p^t) = (2/n) * sum_j H_t(lambda_j),
# H_0 = 1, H_1 = x, H_t = x H_{t-1} - p H_{t-2}   (Remark 2; equals p^{t/2} sin((t+1)θ)/sin θ),
# Q = x1^2 + 4q^2 (x2^2 + x3^2 + x4^2).  Also girth vs Theorem 3.4 and the Ramanujan bound.
import sys, math, itertools
import numpy as np

def legendre(a, q):
    r = pow(a % q, (q - 1) // 2, q)
    return -1 if r == q - 1 else r

def generators(p):
    S = []
    b = int(math.isqrt(p))
    for a0 in range(1, b + 1, 2):
        for a1, a2, a3 in itertools.product(range(-b, b + 1), repeat=3):
            if a1 % 2 or a2 % 2 or a3 % 2: continue
            if a0*a0 + a1*a1 + a2*a2 + a3*a3 == p: S.append((a0, a1, a2, a3))
    return S

def sqrt_m1(q):
    return next(i for i in range(2, q) if (i*i + 1) % q == 0)

def norm_proj(m, q):
    a, b, c, d = m
    s = next(x for x in (a, b, c, d) if x % q)
    inv = pow(s, q - 2, q)
    return tuple((x * inv) % q for x in (a, b, c, d))

def mul(m, n, q):
    a, b, c, d = m; e, f, g, h = n
    return ((a*e + b*g) % q, (a*f + b*h) % q, (c*e + d*g) % q, (c*f + d*h) % q)

def build(p, q):
    i = sqrt_m1(q)
    gens = [norm_proj(((a0 + i*a1) % q, (a2 + i*a3) % q, (-a2 + i*a3) % q, (a0 - i*a1) % q), q)
            for a0, a1, a2, a3 in generators(p)]
    e = (1, 0, 0, 1)
    idx = {e: 0}; order = [e]; k = 0
    while k < len(order):
        g = order[k]; k += 1
        for s in gens:
            h = norm_proj(mul(g, s, q), q)
            if h not in idx: idx[h] = len(order); order.append(h)
    n = len(order)
    A = np.zeros((n, n))
    for g, u in idx.items():
        for s in gens:
            A[u, idx[norm_proj(mul(g, s, q), q)]] += 1
    return gens, A

def rQ(N, q):
    # integer solutions of x1^2 + 4q^2 (x2^2+x3^2+x4^2) = N: loop x1, then count r3(s)
    c = 4*q*q; cnt = 0; R = math.isqrt(N)
    for x1 in range(-R, R + 1):
        rest = N - x1*x1
        if rest % c: continue
        cnt += r3(rest // c)
    return cnt

def r3(s):
    B = math.isqrt(s); cnt = 0
    for x2 in range(-B, B + 1):
        r2 = s - x2*x2
        B3 = math.isqrt(r2)
        for x3 in range(-B3, B3 + 1):
            r = r2 - x3*x3; x4 = math.isqrt(r)
            if x4*x4 == r: cnt += 1 if x4 == 0 else 2
    return cnt

def girth_from_identity(A):
    # Cayley graph is vertex-transitive: shortest cycle through vertex 0 (BFS, simple graph assumed)
    n = len(A); nbr = [np.nonzero(A[u])[0] for u in range(n)]
    dist = {0: 0}; par = {0: -1}; frontier = [0]; best = math.inf
    while frontier:
        nxt = []
        for u in frontier:
            for v in nbr[u]:
                if v == par[u]: continue
                if v in dist: best = min(best, dist[u] + dist[v] + 1)
                else: dist[v] = dist[u] + 1; par[v] = u; nxt.append(v)
        frontier = nxt
        if best < math.inf: break
    return best

for p, q in [(13, 5), (5, 13), (13, 17), (17, 13)]:
    gens, A = build(p, q)
    n = len(A); leg = legendre(p, q)
    lam = np.sort(np.linalg.eigvalsh(A))[::-1]
    nontriv = [x for x in lam if abs(abs(x) - (p + 1)) > 1e-6]
    print(f'p={p} q={q}  (p/q)={leg:+d} (q/p)={legendre(q, p):+d}  |S|={len(gens)}  n={n}'
          f'  expected={q*(q*q-1) if leg == -1 else q*(q*q-1)//2}  bipartite={abs(lam[-1] + p + 1) < 1e-6}')
    print(f'   max nontrivial |λ| = {max(abs(x) for x in nontriv):.6f}  vs 2√p = {2*math.sqrt(p):.6f}')
    g = girth_from_identity(A)
    bound = 4*math.log(q, p) - math.log(4, p) if leg == -1 else 2*math.log(q, p)
    print(f'   girth = {g}  Theorem 3.4 bound = {bound:.3f}')
    H = [np.ones_like(lam), lam.copy()]
    for t in range(2, 7): H.append(lam * H[-1] - p * H[-2])
    for t in range(0, 7):
        spec = 2 * H[t].sum() / n
        lhs = rQ(p**t, q)
        print(f'   t={t}: r_Q(p^t) = {lhs:>8}   (2/n) Σ H_t(λ_j) = {spec:12.4f}   {"ok" if abs(lhs - spec) < 1e-6 * max(1, lhs) else "MISMATCH"}')
