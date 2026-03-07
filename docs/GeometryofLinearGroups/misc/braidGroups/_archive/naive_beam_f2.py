"""
Naive Beam Search of the Burau Representation at t = exp(i * pi / 5) (10th root of unity)
Using standard numpy float64 matrices and L2 distance norms.

Standard representation:
t = exp(i * pi / 5)
"""
import numpy as np
import time

t = np.exp(1j * np.pi / 5)

def make_gens(t):
    def sig(i, n=4):
        d=n-1; M=np.eye(d, dtype=complex); r=i-1
        M[r][r]=-t
        if i>1: M[r][r-1]=t
        if r+1<d: M[r][r+1]=1
        return M
    def siginv(i, n=4):
        d=n-1; M=np.eye(d, dtype=complex); r=i-1; ti=1/t
        M[r][r]=-ti
        if i>1: M[r][r-1]=1
        if r+1<d: M[r][r+1]=ti
        return M
    s1,s2,s3 = sig(1),sig(2),sig(3)
    S1,S2,S3 = siginv(1),siginv(2),siginv(3)
    X=s3@S1; x=s1@S3; Y=s2@s3@S1@S2; y=s2@s1@S3@S2
    return X, x, Y, y

X, x, Y, y = make_gens(t)

gens = [('X', X), ('x', x), ('Y', Y), ('y', y)]
inv_map = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}

def combine_words(w1, w2):
    if not w1: return w2
    if not w2: return w1
    t1 = w1.split()
    t2 = w2.split()
    while t1 and t2 and inv_map.get(t1[-1]) == t2[0]:
        t1.pop()
        t2.pop(0)
    return " ".join(t1 + t2)

U = X @ y @ x @ Y
Ui = np.linalg.inv(U)

# Precompute initial identity hashes matching shape
def get_hashable(M):
    return tuple(np.round(M.flatten(), 5))

U_powers = set()
M = np.eye(3, dtype=complex)
U_powers.add(get_hashable(M))
for k in range(500):
    M = M @ U
    U_powers.add(get_hashable(M))

M = np.eye(3, dtype=complex)
for k in range(500):
    M = M @ Ui
    U_powers.add(get_hashable(M))

def ut_score(M):
    """
    Naive L2 Norm scoring of the lower triangle.
    Also normalizes by the frobenius norm of the whole matrix 
    so that massive exploding matrices don't skew the metric.
    score = ( |M_{1,0}|^2 + |M_{2,0}|^2 + |M_{2,1}|^2 ) / ||M||_F^2
    """
    lower_norm = np.abs(M[1,0])**2 + np.abs(M[2,0])**2 + np.abs(M[2,1])**2
    total_norm = np.sum(np.abs(M)**2)
    return float(lower_norm / total_norm) if total_norm > 0 else float('inf')


W = 50000          # Wide Beam
max_depth = 200    # Keep depth reasonable for float precision

beam = [('', np.eye(3, dtype=complex), 0.0)]
visited_hashes = set()

print(f"Starting NAIVE Mass Beam Search in ⟨X, Y⟩ (Width {W})")
print(f"Metric: Lower Triangle L2 Norm ratio")
start_t = time.time()
found_new = False

for depth in range(1, max_depth + 1):
    next_beam = []
    
    for word, M, sc in beam:
        for sym, g_mat in gens:
            cw = combine_words(word, sym)
            if not cw and word and sym: 
                continue
                
            cm = M @ g_mat
            score = ut_score(cm)
            
            if score < 1e-12: # floating point 0
                m_hash = get_hashable(cm)
                if m_hash not in U_powers:
                    print(f"\n★ FOUND INDEPENDENT NAIVE UT ELEMENT! ★")
                    print(f"Word length {len(cw.split())}: {cw}")
                    print("Matrix:")
                    print(np.round(cm, 3))
                    found_new = True
                    break
                else:
                    continue # Exclude U^k
            
            m_hash = get_hashable(cm)
            if m_hash in visited_hashes:
                continue
            visited_hashes.add(m_hash)
            
            next_beam.append((cw, cm, score))
            
        if found_new:
            break
            
    if found_new:
        break
    
    if len(next_beam) == 0:
        print(f"Beam exhausted at depth {depth}.")
        break
        
    next_beam.sort(key=lambda item: item[2])
    beam = next_beam[:W]
    
    if depth % 5 == 0 or depth == 1:
        best_sc = beam[0][2]
        print(f"Iter {depth:3d} | Beam: {len(beam):5d} | Best dist ratio: {best_sc:.2e} | time: {time.time()-start_t:.1f}s")

if not found_new:
    print(f"\nCompleted naive search independently of ⟨U⟩.")
