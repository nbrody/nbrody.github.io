class LP:
    def __init__(s, c=None): s.c = {k:v for k,v in (c or {}).items() if v}
    @staticmethod
    def zero(): return LP()
    @staticmethod
    def one(): return LP({0:1})
    def __eq__(s,o): return s.c == o.c if isinstance(o,LP) else NotImplemented
    def __add__(s,o):
        r=dict(s.c)
        for k,v in o.c.items():
            r[k]=r.get(k,0)+v
            if r[k]==0: del r[k]
        return LP(r)
    def __neg__(s): return LP({k:-v for k,v in s.c.items()})
    def __sub__(s,o): return s+(-o)
    def __mul__(s,o):
        if not s.c or not o.c: return LP()
        r={}
        for k1,v1 in s.c.items():
            for k2,v2 in o.c.items():
                e=k1+k2; r[e]=r.get(e,0)+v1*v2
                if r[e]==0: r.pop(e,None)
        return LP(r)
    def evaluate(s, t): return sum(v * (t ** k) for k, v in s.c.items())
    def show(s):
        if not s.c: return '0'
        parts=[]
        for e in sorted(s.c, reverse=True):
            v=s.c[e]; av=abs(v)
            if e==0: t=str(av)
            elif e==1: t='t' if av==1 else str(av)+'t'
            elif e==-1: t='t^-1' if av==1 else str(av)+'t^-1'
            else: t='t^'+str(e) if av==1 else str(av)+'t^'+str(e)
            if not parts: parts.append('-'+t if v<0 else t)
            else: parts.append((' + ' if v>0 else ' - ')+t)
        return ''.join(parts)

def mi():
    return [[LP.one(),LP.zero(),LP.zero()],[LP.zero(),LP.one(),LP.zero()],[LP.zero(),LP.zero(),LP.one()]]
def mm(A,B):
    R=[]
    for i in range(3):
        row=[]
        for j in range(3):
            s=LP.zero()
            for k in range(3): s=s+A[i][k]*B[k][j]
            row.append(s)
        R.append(row)
    return R
def sig(i):
    M=mi(); r=i-1; M[r][r]=LP({1:-1})
    if i>1: M[r][r-1]=LP({1:1})
    if r+1<3: M[r][r+1]=LP.one()
    return M
def siginv(i):
    M=mi(); r=i-1; M[r][r]=LP({-1:-1})
    if i>1: M[r][r-1]=LP.one()
    if r+1<3: M[r][r+1]=LP({-1:1})
    return M

s1=sig(1); s2=sig(2); s3=sig(3)
S1=siginv(1); S2=siginv(2); S3=siginv(3)
gen = {
    'X': mm(s3, S1), 'x': mm(s1, S3),
    'Y': mm(mm(s2,s3), mm(S1,S2)), 'y': mm(mm(s2,s1), mm(S3,S2))
}

def word_mat(w):
    M = mi()
    for s in w.split(): M = mm(M, gen[s])
    return M

w = "Y x x Y X X"
W = word_mat(w)

print("Symbolic Evaluation over Z[t, t^-1] for the unipotent candidate:")
print(f"M[2][0] = {W[2][0].show()}")
print(f"M[2][1] = {W[2][1].show()}")
print(f"M[1][0] = {W[1][0].show()}")
print()
print(f"M[0][0] = {W[0][0].show()}")
print(f"M[1][1] = {W[1][1].show()}")
print(f"M[2][2] = {W[2][2].show()}")

t_val = 1.5
print(f"\nEvaluating M[2][0] at t=1.5: {W[2][0].evaluate(t_val)}")
print(f"Evaluating M[2][1] at t=1.5: {W[2][1].evaluate(t_val)}")
print(f"Evaluating M[1][0] at t=1.5: {W[1][0].evaluate(t_val)}")
print()
print(f"Evaluating M[0][0] at t=1.5: {W[0][0].evaluate(t_val)}")
print(f"Evaluating M[1][1] at t=1.5: {W[1][1].evaluate(t_val)}")
print(f"Evaluating M[2][2] at t=1.5: {W[2][2].evaluate(t_val)}")

