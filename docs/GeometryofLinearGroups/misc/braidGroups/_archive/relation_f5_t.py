import time

class LP5:
    def __init__(self, c=None): 
        # c is dict: {degree: coeff}
        self.c = {}
        if c:
            for k, v in c.items():
                v = v % 5
                if v != 0:
                    self.c[k] = v
    @staticmethod
    def zero(): return LP5()
    @staticmethod
    def one(): return LP5({0:1})
    def __eq__(self, o): 
        if not isinstance(o, LP5): return False
        return self.c == o.c
    def __hash__(self):
        return hash(frozenset(self.c.items()))
    def __add__(self, o):
        r = dict(self.c)
        for k, v in o.c.items():
            r[k] = (r.get(k, 0) + v) % 5
            if r[k] == 0: del r[k]
        return LP5(r)
    def __neg__(self): 
        return LP5({k: (-v)%5 for k, v in self.c.items()})
    def __sub__(self, o): 
        return self + (-o)
    def __mul__(self, o):
        if not self.c or not o.c: return LP5()
        r = {}
        for k1, v1 in self.c.items():
            for k2, v2 in o.c.items():
                e = k1 + k2
                r[e] = (r.get(e, 0) + v1 * v2) % 5
        r = {k: v for k, v in r.items() if v != 0}
        return LP5(r)
    def show(self):
        if not self.c: return '0'
        parts = []
        for e in sorted(self.c, reverse=True):
            v = self.c[e]
            t = f"t^{e}" if e not in (0, 1) else ("t" if e == 1 else "")
            if v == 1 and e != 0: parts.append(t)
            elif e == 0: parts.append(str(v))
            else: parts.append(f"{v}{t}")
        return " + ".join(parts)

def mi():
    return [[LP5.one(), LP5.zero(), LP5.zero()],
            [LP5.zero(), LP5.one(), LP5.zero()],
            [LP5.zero(), LP5.zero(), LP5.one()]]

def mm(A, B):
    R = [[LP5.zero()]*3 for _ in range(3)]
    for i in range(3):
        for j in range(3):
            s = LP5.zero()
            for k in range(3):
                s = s + (A[i][k] * B[k][j])
            R[i][j] = s
    return R

def sig(i):
    M = mi()
    r = i - 1
    M[r][r] = LP5({1: 4})  # -t mod 5 is 4t
    if i > 1: M[r][r-1] = LP5({1: 1})
    if r + 1 < 3: M[r][r+1] = LP5.one()
    return M

def siginv(i):
    M = mi()
    r = i - 1
    M[r][r] = LP5({-1: 4}) # -t^-1 mod 5 is 4t^-1
    if i > 1: M[r][r-1] = LP5.one()
    if r + 1 < 3: M[r][r+1] = LP5({-1: 1})
    return M

s1 = sig(1); s2 = sig(2); s3 = sig(3)
S1 = siginv(1); S2 = siginv(2); S3 = siginv(3)
X = mm(s3, S1); x = mm(s1, S3)
Y = mm(mm(s2, s3), mm(S1, S2)); y = mm(mm(s2, s1), mm(S3, S2))

gens = [('X', X), ('x', x), ('Y', Y), ('y', y)]
inv_map = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}

def combine_words(w1, w2):
    if w1 == "": return w2
    if w2 == "": return w1
    t1 = w1.split()
    t2 = w2.split()
    while t1 and t2 and inv_map.get(t1[-1]) == t2[0]:
        t1.pop(); t2.pop(0)
    return " ".join(t1 + t2)

def hash_mat(M):
    return tuple(M[i][j] for i in range(3) for j in range(3))

I = mi()
target_hash = hash_mat(I)

visited = set()
visited.add(target_hash)

queue = [("", I)]
depth = 0
max_depth = 25

print("Starting Exact BFS for relations in F5[t, t^-1]...")
start_time = time.time()

found = []

while queue and depth < max_depth:
    next_q = []
    print(f"Depth {depth:2d} | Queue size: {len(queue):8d} | Visited: {len(visited):8d} | Time: {time.time() - start_time:.1f}s")
    for w, M in queue:
        for sym, g in gens:
            cw = combine_words(w, sym)
            # Prevent backtracking
            if len(cw.split()) <= len(w.split()) and w != "": 
                continue
            
            cM = mm(M, g)
            h = hash_mat(cM)
            
            if h == target_hash and cw != "":
                print(f"\n★ FOUND RELATION: {cw} (len {len(cw.split())})")
                found.append(cw)
            
            if h not in visited:
                visited.add(h)
                next_q.append((cw, cM))
    
    queue = next_q
    depth += 1
    
    if found and depth > 10:
        print("\nStopping search early since we found relations!")
        break

print("\nDone.")
