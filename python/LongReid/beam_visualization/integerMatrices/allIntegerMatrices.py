import math
import random
import time
import flint
from flint import fmpz, fmpz_mat
from sympy import factorint

# --- Configuration ---
BEAM_WIDTH = 10000         # Number of best nodes to keep per iteration
MAX_ITERATIONS = 2000   # Cutoff
RANDOM_SAMPLE_RATE = 0.3 # Diversity injection to prevent getting stuck in local minima
T_PARAM = fmpz(9)        # Parameter t 

TOP_COUNT = int(BEAM_WIDTH * (1 - RANDOM_SAMPLE_RATE))
RANDOM_COUNT = int(BEAM_WIDTH * RANDOM_SAMPLE_RATE)

# --- Group Definition ---

PRIMES = {p for p, _ in (T_PARAM * (T_PARAM - 1)).factor()}

# Generator a: [[t, 0], [0, 1]]
MAT_a = flint.fmpz_mat(2, 2, [T_PARAM, 0, 0, 1])

# Generator b: [[1+t^2, 2], [t, 1]]
MAT_b = flint.fmpz_mat(2, 2,
    [1 + T_PARAM**2, 2, T_PARAM, 1])

# Inverse a: [[1, 0], [0, t]]
MAT_A = flint.fmpz_mat(2, 2,
    [1, 0, 
    0, T_PARAM])

# Inverse b: [[1, -2], [-t, 1+t^2]]
MAT_B = flint.fmpz_mat(2, 2,
    [1, -2,
    -T_PARAM, 1 + T_PARAM**2])

ACTIONS = (MAT_a, MAT_b, MAT_A, MAT_B)
ACTION_NAMES = ('a', 'b', 'ai', 'bi')

# Prevent trivial cancellations
INVERSES = (2, 3, 0, 1)

def canonicalize_mat(M):
    g = fmpz(1)
    for p in PRIMES:
        # Check if all entries are divisible by p
        while all(entry % p == 0 for entry in M.entries()):
            # Divide all entries by p
            M /= p
            g *= p
    return M, g

class Node:
    __slots__ = ('parent', 'action', 'matrix', 'score')

    def __init__(self, parent, action, matrix):
        self.parent = parent
        self.action = action
        self.matrix = matrix
        
        # Score: Lower is better.
        # We want the matrix to be integral.
        # A good proxy is the sum of log(denominator) for all entries.
        # If all denominators are 1, score is 0.
        self.score = self._calc_score()

    def _calc_score(self):
        # Score by log of absolute value of determinant
        det = abs(self.matrix.det())
        if det == 0:
            return float('inf')  # Degenerate matrix
        return math.log(int(det))

    def get_score_str(self):
        det = int(abs(self.matrix.det()))
        if det == 0: return "0"
        if det == 1: return "1"
        factors = factorint(det)
        return " * ".join([f"{p}^{e}" if e > 1 else f"{p}" for p, e in sorted(factors.items())])

    def is_nontrivial(self):
        # Check Trace to ensure infinite order (Trace > 2)
        trace = abs(self.matrix[0,0] + self.matrix[1,1])
        
        if trace <= 2:
            return False
        return True

    def get_word(self):
        path = []
        curr = self
        while curr.parent is not None:
            path.append(ACTION_NAMES[curr.action])
            curr = curr.parent
        return " . ".join(reversed(path))

def solve():
    # Root node (Identity) - as integer matrix
    root_mat = fmpz_mat(2, 2, [1, 0, 0, 1])
    root = Node(None, None, root_mat)
    
    current_beam = [root]
    visited = set()
    found_matrices = []
    
    print(f"Starting search (Beam Width: {BEAM_WIDTH})...")
    start_time = time.monotonic()

    for i in range(MAX_ITERATIONS):
        next_beam = []
        
        # Expand current beam
        for node in current_beam:
            last_action = node.action
            
            for move, mat_move in enumerate(ACTIONS):
                # 1. Don't backtrack immediately (e.g., A then a)
                if last_action is not None and INVERSES[last_action] == move:
                    continue
                
                # 2. Compute new state
                new_mat, scale = canonicalize_mat(node.matrix * mat_move)
                
                # 3. Pruning: Check if visited
                uid = tuple(int(x) for x in new_mat.entries())
                
                if uid in visited:
                    continue
                
                visited.add(uid)
                
                child = Node(node, move, new_mat)
                
                # 4. Check solution - looking for determinant = 1 (in SL_2)
                det = abs(child.matrix.det())
                if det == 1:
                    if child.is_nontrivial():
                        print(f"\nSUCCESS found at iteration {i}!")
                        print(f"Word: {child.get_word()}")
                        print(f"Matrix:\n{child.matrix}")
                        print(f"Trace: {child.matrix[0,0] + child.matrix[1,1]}")
                        print(f"Determinant: {det}")
                        print(f"Time elapsed: {time.monotonic() - start_time:.2f}s")
                        found_matrices.append(child)
                        # return child.get_word()
                
                next_beam.append(child)

        if not next_beam:
            print("Beam emptied. No solution found.")
            break

        # Sort by score (lowest is best)
        next_beam.sort(key=lambda x: x.score)
        
        # Pruning / Beam Selection
        # We keep the best N, but inject some randomness from the rest to avoid local minima
        best_candidates = next_beam[:TOP_COUNT]
        random_candidates = []
        if len(next_beam) > len(best_candidates):
            remainder = next_beam[TOP_COUNT:]
            sample_size = min(len(remainder), RANDOM_COUNT)
            random_candidates = random.sample(remainder, sample_size)
            
        current_beam = best_candidates + random_candidates
        
        if i > 0 and i % 100 == 0:
            best_node = current_beam[0]
            print(f"Iter {i}: Best Score {best_node.get_score_str()} | Depth {i} | Beam Size {len(current_beam)} | Visited {len(visited)}")
            print("Top 3 Matrices:")
            for idx, node in enumerate(current_beam[:3]):
                print(f"Rank {idx+1} (Score {node.get_score_str()}, Word {node.get_word()}):")
                print(node.matrix)

    print("Max iterations reached.")
    print(f"\nFound {len(found_matrices)} integer matrices:")
    for m in found_matrices:
        print(f"Word: {m.get_word()} | Trace: {m.matrix[0,0] + m.matrix[1,1]}")
    
    return found_matrices

if __name__ == "__main__":
    solve()