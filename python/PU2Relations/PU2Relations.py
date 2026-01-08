import math
import random
import time
from flint import fmpz, fmpz_mat

# --- Configuration ---
BEAM_WIDTH = 5000        # Number of best nodes to keep per iteration
MAX_ITERATIONS = 100000   # Safety cutoff
RANDOM_SAMPLE_RATE = 0.1  # Diversity injection

# Globals set by user input
PRIMES = []
MAT_A = None
MAT_B = None
MAT_a = None
MAT_b = None
ACTIONS = {}

# --- Helper Functions ---

def complex_to_real_4x4(real_part, imag_part):
    """
    Map 2x2 complex matrix M = R + iI to 4x4 real matrix:
    [[R, -I], [I, R]]
    Expects integer (fmpz) entries.
    """
    R = real_part
    I = imag_part
        
    mat_list = [
        [R[0][0], R[0][1], -I[0][0], -I[0][1]],
        [R[1][0], R[1][1], -I[1][0], -I[1][1]],
        [I[0][0], I[0][1],  R[0][0],  R[0][1]],
        [I[1][0], I[1][1],  R[1][0],  R[1][1]]
    ]
    return fmpz_mat(4, 4, [x for row in mat_list for x in row])

def factorize(n):
    """Return list of prime factors of n (with repetition)."""
    n = abs(int(n))
    if n <= 1: return []
    factors = []
    d = 2
    while d * d <= n:
        while n % d == 0:
            factors.append(d)
            n //= d
        d += 1
    if n > 1:
        factors.append(n)
    return factors

def unique_primes(n):
    """Return sorted list of unique prime factors of n."""
    return sorted(set(factorize(n)))

def _canonicalize(mat):
    """
    Divide matrix by any prime p in PRIMES that divides all entries.
    Repeats until no such division is possible.
    """
    changed = True
    while changed:
        changed = False
        for p in PRIMES:
            # Check divisibility
            # To avoid creating many Python ints, we can use the library's modulation if efficient,
            # but checking one by one is straightforward for 4x4.
            divisible = True
            for r in range(4):
                for c in range(4):
                    if mat[r, c] % p != 0:
                        divisible = False
                        break
                if not divisible: break
            
            if divisible:
                # Divide all entries by p
                for r in range(4):
                    for c in range(4):
                        mat[r, c] //= p
                changed = True
    return mat

def build_generators_from_input(x, y, a, b, c, d):
    """
    Build 4x4 integer matrices for generators.
    matA corresponds to [[x, y], [-y, x]]
    matB corresponds to [[a+bi, c+di], [-c+di, a-bi]]
    """
    # A (Real only): R=[[x,y],[-y,x]], I=0
    mat_A_real = [[fmpz(x), fmpz(y)], 
                  [fmpz(-y), fmpz(x)]]
    mat_A_imag = [[fmpz(0), fmpz(0)], 
                  [fmpz(0), fmpz(0)]]
    
    # B (Complex): R=[[a,c],[-c,a]], I=[[b,d],[d,-b]]
    mat_B_real = [[fmpz(a), fmpz(c)],
                  [fmpz(-c), fmpz(a)]]
    mat_B_imag = [[fmpz(b), fmpz(d)],
                  [fmpz(d), fmpz(-b)]]
    
    mat_A = complex_to_real_4x4(mat_A_real, mat_A_imag)
    mat_B = complex_to_real_4x4(mat_B_real, mat_B_imag)
    
    return mat_A, mat_B

def is_scalar_matrix(mat):
    """Check if 4x4 matrix is a scalar multiple of identity (k*I). Return k or None."""
    k = mat[0, 0]
    for i in range(4):
        for j in range(4):
            if i == j:
                if mat[i, j] != k: return None
            else:
                if mat[i, j] != 0: return None
    return k

def verify_commutator_squared(mat_A, mat_B):
    """
    Verify [A, B]^2 = -I (projectively).
    Returns (valid, scalar) where scalar is the diagonal value.
    Note: For unitary matrices in this representation, Inverse = Transpose.
    """
    mat_a = mat_A.transpose()
    mat_b = mat_B.transpose()
    
    comm = mat_A * mat_B * mat_a * mat_b
    comm = _canonicalize(comm)
    
    comm_sq = comm * comm
    comm_sq = _canonicalize(comm_sq)
    
    k = is_scalar_matrix(comm_sq)
    if k is None:
        return False, None
        
    return (k < 0), k

INVERSES = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}
FORBIDDEN_SUFFIXES = {
    "a.b.ai.bi.a", "b.ai.bi.a.b", "ai.bi.a.b.ai", "bi.a.b.ai.bi",
    "b.a.bi.ai.b", "a.bi.ai.b.a", "bi.ai.b.a.bi", "ai.b.a.bi.ai"
}

def mat_to_tuple(mat):
    """Hashable tuple of matrix entries."""
    return tuple(int(mat[i, j]) for i in range(4) for j in range(4))

class Node:
    __slots__ = ('parent', 'action_char', 'matrix', 'depth', 'score')
    
    def __init__(self, parent, action_char, matrix, depth):
        self.parent = parent
        self.action_char = action_char
        self.matrix = matrix
        self.depth = depth
        self.score = self._calc_score()

    def _calc_score(self):
        # Score = log(|determinant|) + small depth penalty
        det = self.matrix.det()
        if det == 0: return float('inf')
        
        # In PU(n), "smaller" representatives are preferred.
        # Log det scales linearly with word length, so we normalize or just use it directly.
        val = math.log(abs(int(det)))
        return val + (self.depth * 0.05)

    def is_identity(self):
        """Check if projective identity (scalar matrix)."""
        return is_scalar_matrix(self.matrix) is not None

    def get_word(self):
        path = []
        curr = self
        while curr.parent is not None:
            path.append(curr.action_char)
            curr = curr.parent
        return ".".join(reversed(path))

    def get_suffix(self, length):
        path = []
        curr = self
        count = 0
        while curr.parent is not None and count < length:
            path.append(curr.action_char)
            curr = curr.parent
            count += 1
        return ".".join(reversed(path))

def inverse_word(word_str):
    if not word_str: return ""
    return ".".join(INVERSES[c] for c in reversed(word_str.split('.')))

def mat_to_latex(mat):
    """Convert 4x4 integer matrix to 2x2 complex LaTeX string."""
    # Elements M[r,c] = R[r,c] + i I[r,c]
    # R is at indices [0,0], [0,1], [1,0], [1,1]
    # I is at indices [2,0], [2,1], [3,0], [3,1]
    rows = []
    for r in range(2):
        row_cells = []
        for c in range(2):
            real = int(mat[r, c])
            imag = int(mat[r+2, c])
            if imag == 0:
                s = f"{real}"
            elif imag > 0:
                s = f"{real} + {imag}i"
            else:
                s = f"{real} - {abs(imag)}i"
            row_cells.append(s)
        rows.append(" & ".join(row_cells))
    return r"\begin{pmatrix} " + r" \\ ".join(rows) + r" \end{pmatrix}"

def solve_gen(x, y, a, b, c, d, beam_width=5000, max_iter=100000, random_rate=0.1, stop_after=3):
    global PRIMES, ACTIONS
    
    # Compute norms and primes
    norm_A = x*x + y*y
    norm_B = a*a + b*b + c*c + d*d
    PRIMES = unique_primes(norm_A * norm_B)
    
    # Build matrices
    MAT_A, MAT_B = build_generators_from_input(x, y, a, b, c, d)
    MAT_A = _canonicalize(MAT_A)
    MAT_B = _canonicalize(MAT_B)
    
    # Verify commutator
    valid, val = verify_commutator_squared(MAT_A, MAT_B)
    if not valid:
        yield {"type": "error", "message": f"Verification FAILED. [A,B]^2 is not -I. (Val={val})"}
        return
    
    # Setup actions
    MAT_a = MAT_A.transpose()
    MAT_b = MAT_B.transpose()
    
    ACTIONS = {
        'a': MAT_A, 'b': MAT_B,
        'ai': MAT_a, 'bi': MAT_b
    }
    
    # Root
    root_mat = fmpz_mat(4, 4, [1 if i==j else 0 for i in range(4) for j in range(4)])
    root = Node(None, None, root_mat, 0)
    
    current_beam = [root]
    visited = {mat_to_tuple(root_mat): ""}
    
    start_time = time.time()
    found_count = 0
    
    for i in range(max_iter):
        next_beam = []
        
        for node in current_beam:
            last_action = node.action_char
            suffix = node.get_suffix(4)
            
            for move, mat_move in ACTIONS.items():
                if last_action and INVERSES[last_action] == move:
                    continue
                
                check = (suffix + "." + move) if suffix else move
                if check in FORBIDDEN_SUFFIXES:
                    continue
                    
                new_mat = node.matrix * mat_move
                new_mat = _canonicalize(new_mat)
                
                child = Node(node, move, new_mat, node.depth + 1)
                new_word = child.get_word()
                
                # Check Identity
                if child.is_identity():
                     scalar = is_scalar_matrix(child.matrix)
                     yield {
                         "type": "found",
                         "word": new_word,
                         "scalar": str(scalar),
                         "matrix": mat_to_latex(child.matrix),
                         "depth": child.depth
                     }
                     found_count += 1
                     if found_count >= stop_after:
                         return

                tup = mat_to_tuple(new_mat)
                neg_tup = mat_to_tuple(new_mat * -1)
                
                if tup in visited or neg_tup in visited:
                    continue
                
                visited[tup] = new_word
                visited[neg_tup] = new_word
                next_beam.append(child)
        
        if not next_beam:
            yield {"type": "log", "message": "Beam exhausted."}
            break
            
        next_beam.sort(key=lambda n: n.score)
        
        cut = int(beam_width * (1 - random_rate))
        best = next_beam[:cut]
        rest = next_beam[cut:]
        if rest:
            best += random.sample(rest, min(len(rest), int(beam_width * random_rate)))
            
        current_beam = best
        
        if True: # Update every iteration
            best_node = current_beam[0]
            yield {
                "type": "progress",
                "iter": i,
                "score": best_node.score,
                "depth": best_node.depth,
                "beam": len(current_beam),
                "word": best_node.get_word(),
                "matrix": mat_to_latex(best_node.matrix)
            }

def get_user_input():
    print("=" * 50)
    print("PU(2) Relation Search")
    print("=" * 50)
    print("\nSuggested examples:")
    print("  (x,y) = (36,77),  (a,b,c,d) = (55,71,79,97)")
    print("  (x,y) = (4,5),    (a,b,c,d) = (3,1,3,9)")
    print()
    
    try:
        xy = input("Enter (x,y): ").replace('(','').replace(')','').replace(',',' ')
        parts = [int(p) for p in xy.split() if p.strip()]
        if len(parts)!=2: return None
        x, y = parts
        
        abcd = input("Enter (a,b,c,d): ").replace('(','').replace(')','').replace(',',' ')
        parts = [int(p) for p in abcd.split() if p.strip()]
        if len(parts)!=4: return None
        a, b, c, d = parts
        
    except ValueError:
        print("Invalid integer input.")
        return None
    
    return x, y, a, b, c, d

def solve():
    result = get_user_input()
    if not result: return
    x, y, a, b, c, d = result
    
    for update in solve_gen(x, y, a, b, c, d, beam_width=BEAM_WIDTH):
        if update["type"] == "progress":
            print(f"Iter {update['iter']}: Best {update['score']:.2f} | Depth {update['depth']} | Beam {update['beam']}")
            print(f"Best: {update['word']}")
        elif update["type"] == "found":
            print(f"\nRELATION FOUND: {update['word']}")
            print(f"Scalar: {update['scalar']} * I")
        elif update["type"] == "error":
            print(f"ERROR: {update['message']}")
        elif update["type"] == "log":
            print(update["message"])

if __name__ == "__main__":
    solve()