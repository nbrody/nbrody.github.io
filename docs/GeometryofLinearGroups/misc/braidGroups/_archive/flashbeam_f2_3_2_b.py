"""
Search for UNIPOTENT elements at t=3/2
"""
import time
from flint import fmpq, fmpq_mat

# ============================================================================
# 1. GENERATOR DEFINITIONS (Specialized exactly at t = 3/2)
# ============================================================================

mat_X = fmpq_mat([
    [fmpq(-2, 3), fmpq(2, 3), 0],
    [0, 1, 0],
    [0, fmpq(3, 2), fmpq(-3, 2)],
])
mat_x = fmpq_mat([
    [fmpq(-3, 2), 1, 0],
    [0, 1, 0],
    [0, 1, fmpq(-2, 3)],
])
mat_Y = fmpq_mat([
    [0, fmpq(-4, 9), fmpq(4, 9)],
    [0, fmpq(-2, 3), fmpq(-5, 6)],
    [fmpq(3, 2), -1, fmpq(-1, 2)],
])
mat_y = fmpq_mat([
    [fmpq(-1, 2), fmpq(-2, 3), fmpq(2, 3)],
    [fmpq(-5, 4), fmpq(-2, 3), 0],
    [1, fmpq(-2, 3), 0],
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
    return tuple(M[i, j] for i in range(3) for j in range(3))

print("Precomputing primitive powers of U to aggressively exclude them...")
U_powers = set()
I = fmpq_mat([[1,0,0], [0,1,0], [0,0,1]])
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
    return max(max(val.p.bit_length(), val.q.bit_length()) for val in get_hashable(M))

def unipotent_score(M):
    """
    Subgoal Progressive Tuple Score to find Unipotents:
    For a unipotent, the lower triangle MUST be 0 AND the diagonal MUST be precisely 1.
    If we evaluate M[i,i] - 1, those must also be 0.
    """
    def bits(val):
        return 0 if val == 0 else val.p.bit_length() + val.q.bit_length()
        
    diag1 = M[0,0] - 1
    diag2 = M[1,1] - 1
    diag3 = M[2,2] - 1
        
    # We heavily penalize the lower triangle first, then the diagonal difference
    sc_low = bits(M[2, 0]) + bits(M[2, 1]) + bits(M[1, 0])
    sc_diag = bits(diag1) + bits(diag2) + bits(diag3)
    
    return sc_low, sc_diag

# ============================================================================
# 3. HIGH-PERFORMANCE FLASHBEAM SEARCH
# ============================================================================

W = 10000        # Base Beam Width
max_depth = 500  # Max Search Depth 
F_MAX = 50       # Flash Pool Max Size

beam = [('', I, (0, 0))]
visited_hashes = set()

flash_pool = []
elite_flash = []  

print(f"Starting Unipotent FlashBeam Search in ⟨X, Y⟩ (t=3/2)")
start_t = time.time()
found_new = False
highest_stage = 0

for depth in range(1, max_depth + 1):
    next_beam = []
    
    expansions = gens + [(fw, fm) for fw, fm, _, _ in elite_flash + flash_pool]
    
    for word, M, sc in beam:
        for sym, g_mat in expansions:
            cw = combine_words(word, sym)
            if not cw: 
                continue
                
            cm = M * g_mat
            score = unipotent_score(cm)
            
            if score == (0, 0):
                m_hash = get_hashable(cm)
                if m_hash not in U_powers:
                    print(f"\n★ FOUND EXACT UNIPOTENT ELEMENT! ★")
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
            
            # Check for elite milestone elements
            cx = matrix_complexity(cm)
            if cx < 500:
                is_elite = False
                if score[0] == 0:
                    is_elite = True
                    if highest_stage < 1:
                        print(f"\n>>> SUBGOAL 1: EXACT UPPER-TRIANGULAR REACHED at depth {depth}! Word len {len(cw.split())}")
                        highest_stage = 1
                
                # Store permanent generators
                if is_elite and len(elite_flash) < 20 and m_hash not in [get_hashable(f[1]) for f in elite_flash]:
                    if m_hash not in U_powers:
                        elite_flash.append((cw, cm, score, cx))
            
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
    
    # ---- FLASH POOL UPDATE MECHANIC ----
    for cw, cm, score in beam[:30]:
        word_len = len(cw.split())
        if word_len > 1:
            cx = matrix_complexity(cm)
            if cx < 250: 
                flash_pool.append((cw, cm, score, cx))
                
    unique_flash = {}
    for fw, fm, fsc, fcx in flash_pool:
        h = get_hashable(fm)
        if h not in unique_flash:
            unique_flash[h] = (fw, fm, fsc, fcx)
        else:
            if len(fw.split()) < len(unique_flash[h][0].split()):
                unique_flash[h] = (fw, fm, fsc, fcx)
                
    flash_pool = sorted(unique_flash.values(), key=lambda x: x[2])[:F_MAX]

    if depth % 5 == 0 or depth == 1:
        best_sc = beam[0][2]
        max_wlen = max(len(w.split()) for w, M, sc in beam)
        print(f"Iter {depth:3d} | WLen: {max_wlen:4d} | Elite: {len(elite_flash):2d} | Flash: {len(flash_pool):2d} | Best scores: {best_sc[0]:4d},{best_sc[1]:4d} | time: {time.time()-start_t:.1f}s")
        import sys
        sys.stdout.flush()

if not found_new:
    print(f"\nCompleted search completely independently of ⟨U⟩.")
