"""
Pure Beam Search of the Burau Representation at t^5 = 1 (zeta_5)
Powered by python-flint (GMP/FLINT exact rational arithmetic)
"""
import time
from flint import fmpz, fmpz_mat

# ============================================================================
# 1. GENERATOR DEFINITIONS (Specialized exactly at t^5 = 1)
# Elements of Z[t]/(t^4+t^3+t^2+t+1) are represented as 4x4 integer matrices.
# This makes the 3x3 general matrices exact 12x12 integer matrices!
# ============================================================================

mat_X = fmpz_mat([
    [1, -1, 0, 0, -1, 1, 0, 0, 0, 0, 0, 0],
    [1, 0, -1, 0, -1, 0, 1, 0, 0, 0, 0, 0],
    [1, 0, 0, -1, -1, 0, 0, 1, 0, 0, 0, 0],
    [1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 1],
    [0, 0, 0, 0, 1, 0, 0, -1, -1, 0, 0, 1],
    [0, 0, 0, 0, 0, 1, 0, -1, 0, -1, 0, 1],
    [0, 0, 0, 0, 0, 0, 1, -1, 0, 0, -1, 1],
])

mat_x = fmpz_mat([
    [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    [-1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, -1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, -1, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 1, 0, -1, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, -1],
    [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
])

mat_Y = fmpz_mat([
    [0, 0, 0, 0, 0, 1, -1, 0, 0, -1, 1, 0],
    [0, 0, 0, 0, 0, 1, 0, -1, 0, -1, 0, 1],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0],
    [0, 0, 0, 0, -1, 1, 0, 0, 1, -1, 0, 0],
    [0, 0, 0, 0, 1, -1, 0, 0, -1, 1, 0, 1],
    [0, 0, 0, 0, 1, 0, -1, 0, -2, 0, 1, 1],
    [0, 0, 0, 0, 1, 0, 0, -1, -1, -1, 0, 2],
    [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, -1, 1],
    [0, 0, 0, -1, -1, 0, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, -1, 0, -1, 0, 0, -1, 1, 0, 1],
    [0, 1, 0, -1, 0, 0, -1, 0, 0, -1, 1, 1],
    [0, 0, 1, -1, 0, 0, 0, -1, 0, 0, -1, 2],
])

mat_y = fmpz_mat([
    [1, 0, 0, 1, 1, -1, 0, 0, -1, 1, 0, 0],
    [-1, 1, 0, 1, 1, 0, -1, 0, -1, 0, 1, 0],
    [0, -1, 1, 1, 1, 0, 0, -1, -1, 0, 0, 1],
    [0, 0, -1, 2, 1, 0, 0, 0, -1, 0, 0, 0],
    [1, 0, 1, -1, 1, -1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 1, 0, -1, 0, 0, 0, 0, 0],
    [-1, 0, 2, 0, 1, 0, 0, -1, 0, 0, 0, 0],
    [0, -1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1, -1, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 1, 0, 0, -1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0],
])

gens = [('X', mat_X), ('x', mat_x), ('Y', mat_Y), ('y', mat_y)]
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

mat_U = mat_X * mat_y * mat_x * mat_Y
mat_Ui = mat_U.inv()

# ============================================================================
# 2. CACHING & HEURISTICS
# ============================================================================

def get_hashable(M):
    return tuple(M[i, j] for i in range(12) for j in range(12))

print("Precomputing primitive powers of U to aggressively exclude them...")
U_powers = set()
I = fmpz_mat([[1 if i==j else 0 for j in range(12)] for i in range(12)])
M = I
U_powers.add(get_hashable(M))
for k in range(500):
    M = M * mat_U
    U_powers.add(get_hashable(M))

M = I
for k in range(500):
    M = M * mat_Ui
    U_powers.add(get_hashable(M))

def matrix_complexity(M):
    """Returns the maximum bit length of any entry in the integer matrix M."""
    return max(val.bit_length() for val in get_hashable(M))

def ut_score(M):
    """
    Standard Beam Score: Total bit sum of all lower-triangular complex blocks.
    Target blocks in 12x12 Z[t]/(t^4+1):
       M[8..11, 0..3] -> M[2,0]
       M[8..11, 4..7] -> M[2,1]
       M[4..7, 0..3] -> M[1,0]
    A perfect score is 0.
    """
    score = 0
    def bits(val):
        return val.bit_length()
    
    score += sum(bits(M[r,c]) for r in range(8, 12) for c in range(0, 4))
    score += sum(bits(M[r,c]) for r in range(8, 12) for c in range(4, 8))
    score += sum(bits(M[r,c]) for r in range(4, 8) for c in range(0, 4))
    return score

# ============================================================================
# 3. HIGH-PERFORMANCE BEAM SEARCH
# ============================================================================

W = 10000          # Wide Beam
max_depth = 1000   # Depth

beam = [('', I, 0)]
visited_hashes = set()

print(f"Starting Pure Mass Beam Search in ⟨X, Y⟩ (Width {W})")
start_t = time.time()
found_new = False

for depth in range(1, max_depth + 1):
    next_beam = []
    
    for word, M, sc in beam:
        for sym, g_mat in gens:
            cw = combine_words(word, sym)
            if not cw and word and sym: 
                continue
                
            cm = M * g_mat
            score = ut_score(cm)
            
            if score == 0:
                m_hash = get_hashable(cm)
                if m_hash not in U_powers:
                    print(f"\n★ FOUND INDEPENDENT EXACT UT ELEMENT! ★")
                    print(f"Word length {len(cw.split())}: {cw}")
                    print("Matrix:")
                    print(cm.table())
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
        max_numer = matrix_complexity(beam[0][1])
        print(f"Iter {depth:3d} | Beam: {len(beam):5d} | Best penalty: {best_sc:5d} bits | Max numer bits: {max_numer:4d} | time: {time.time()-start_t:.1f}s")
        import sys
        sys.stdout.flush()

if not found_new:
    print(f"\nCompleted search completely independently of ⟨U⟩.")
