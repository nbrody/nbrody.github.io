import math
import random
import time
import flint
from flint import fmpz, fmpz_mat
from sympy import factorint

# --- Constants ---
ACTION_NAMES = ('a', 'b', 'ai', 'bi')
INVERSES = (2, 3, 0, 1)

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

class IntegerMatrixSearch:
    def __init__(self, t_param, beam_width=20000, max_iterations=100000, random_sample_rate=0.2):
        self.t_param = fmpz(t_param)
        self.beam_width = beam_width
        self.max_iterations = max_iterations
        self.random_sample_rate = random_sample_rate
        
        self.top_count = int(self.beam_width * (1 - self.random_sample_rate))
        self.random_count = int(self.beam_width * self.random_sample_rate)

        # --- Group Definition ---
        self.primes = {p for p, _ in (self.t_param * (self.t_param - 1)).factor()}

        # Generator a: [[t, 0], [0, 1]]
        self.mat_a = flint.fmpz_mat(2, 2, [self.t_param, 0, 0, 1])

        # Generator b: [[1+t^2, 2], [t, 1]]
        self.mat_b = flint.fmpz_mat(2, 2,
            [1 + self.t_param**2, 2, self.t_param, 1])

        # Inverse a: [[1, 0], [0, t]]
        self.mat_A = flint.fmpz_mat(2, 2,
            [1, 0, 
            0, self.t_param])

        # Inverse b: [[1, -2], [-t, 1+t^2]]
        self.mat_B = flint.fmpz_mat(2, 2,
            [1, -2,
            -self.t_param, 1 + self.t_param**2])

        self.actions = (self.mat_a, self.mat_b, self.mat_A, self.mat_B)

    def canonicalize_mat(self, M):
        g = fmpz(1)
        for p in self.primes:
            # Check if all entries are divisible by p
            while all(entry % p == 0 for entry in M.entries()):
                # Divide all entries by p
                M /= p
                g *= p
        return M, g

    def search(self, callback=None):
        # Root node (Identity) - as integer matrix
        root_mat = fmpz_mat(2, 2, [1, 0, 0, 1])
        root = Node(None, None, root_mat)
        
        current_beam = [root]
        visited = set()
        solutions = []
        
        print(f"Starting search for T={self.t_param} (Beam Width: {self.beam_width})...")
        start_time = time.monotonic()

        for i in range(self.max_iterations):
            next_beam = []
            
            # Expand current beam
            for node in current_beam:
                last_action = node.action
                
                for move, mat_move in enumerate(self.actions):
                    # 1. Don't backtrack immediately (e.g., A then a)
                    if last_action is not None and INVERSES[last_action] == move:
                        continue
                    
                    # 2. Compute new state
                    new_mat, scale = self.canonicalize_mat(node.matrix * mat_move)
                    
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
                            word = child.get_word()
                            # Reduced verbosity
                            # print(f"Found: {word}") 
                            
                            solutions.append(word)
                            if callback:
                                callback(word)
                            # Continue searching
                    
                    next_beam.append(child)

            if not next_beam:
                print("Beam emptied. Stopping search.")
                break

            # Sort by score (lowest is best)
            next_beam.sort(key=lambda x: x.score)
            
            # Pruning / Beam Selection
            # We keep the best N, but inject some randomness from the rest to avoid local minima
            best_candidates = next_beam[:self.top_count]
            random_candidates = []
            if len(next_beam) > len(best_candidates):
                remainder = next_beam[self.top_count:]
                sample_size = min(len(remainder), self.random_count)
                random_candidates = random.sample(remainder, sample_size)
                
            current_beam = best_candidates + random_candidates
            
            if i > 0 and i % 100 == 0:
                best_node = current_beam[0]
                print(f"Iter {i}: Best Score {best_node.get_score_str()} | Depth {i} | Beam Size {len(current_beam)} | Visited {len(visited)} | Found {len(solutions)}")
        
        print("Max iterations reached.")
        return solutions

if __name__ == "__main__":
    solver = IntegerMatrixSearch(9)
    solver.search()