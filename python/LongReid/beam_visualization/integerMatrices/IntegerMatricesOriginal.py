import math
import random
import numpy as np
import time
from fractions import Fraction

# --- Configuration ---
BEAM_WIDTH = 20000        # Number of best nodes to keep per iteration
MAX_ITERATIONS = 100000  # Safety cutoff
RANDOM_SAMPLE_RATE = 0.1 # Diversity injection to prevent getting stuck in local minima
T_PARAM = 9              # Parameter t, must be a perfect square

# --- Group Definition ---

sqrt_t = math.isqrt(T_PARAM)

# Generator A: 1/sqrt(t) * [[t, 0], [0, 1]]
# = [[sqrt(t), 0], [0, 1/sqrt(t)]]
MAT_A = np.array([[Fraction(sqrt_t, 1), Fraction(0, 1)], 
                  [Fraction(0, 1), Fraction(1, sqrt_t)]], dtype=object)

# Generator B: 1/(t-1) * [[1+t^2, 2], [t, 1]]
denom_b = T_PARAM - 1
MAT_B = np.array([[Fraction(1 + T_PARAM**2, denom_b), Fraction(2, denom_b)], 
                  [Fraction(T_PARAM, denom_b), Fraction(1, denom_b)]], dtype=object)

# Inverse A
MAT_a = np.array([[Fraction(1, sqrt_t), Fraction(0, 1)], 
                  [Fraction(0, 1), Fraction(sqrt_t, 1)]], dtype=object)

# Inverse B
MAT_b = np.array([[MAT_B[1,1], -MAT_B[0,1]], 
                  [-MAT_B[1,0], MAT_B[0,0]]], dtype=object)

ACTIONS = {
    'ai': MAT_A,
    'bi': MAT_B,
    'a': MAT_a,
    'b': MAT_b
}

# Prevent trivial cancellations
INVERSES = {'ai': 'a', 'a': 'ai', 'bi': 'b', 'b': 'bi'}

class Node:
    def __init__(self, parent, action_char, matrix, depth):
        self.parent = parent
        self.action_char = action_char
        self.matrix = matrix
        self.depth = depth
        
        # Score: Lower is better.
        # We want the matrix to be integral.
        # A good proxy is the sum of log(denominator) for all entries.
        # If all denominators are 1, score is 0.
        self.score = self._calc_score()

    def _calc_score(self):
        # Find LCM of all denominators
        from math import gcd
        
        def lcm(a, b):
            return abs(a * b) // gcd(a, b)
        
        lcm_denom = 1
        for x in self.matrix.flatten():
            lcm_denom = lcm(lcm_denom, x.denominator)
        
        # Express LCM as 2^n * 3^m * (other factors)
        # Score is n + m (lower is better)
        n = 0
        m = 0
        temp = lcm_denom
        
        while temp % 2 == 0:
            n += 1
            temp //= 2
        
        while temp % 3 == 0:
            m += 1
            temp //= 3
        
        # If there are other prime factors, add a large penalty
        if temp > 1:
            score = n + m + 1000  # Large penalty for non-2,3 factors
        else:
            score = n + m
        
        # Add a small penalty for depth to encourage finding shorter words first
        # but allow deep searches if the score is very good.
        return score + (self.depth * 0.01)

    def is_candidate(self):
        # Returns True if matrix is an integer matrix (all denominators are 1)
        for x in self.matrix.flatten():
            if x.denominator != 1:
                return False
        return True

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
            path.append(curr.action_char)
            curr = curr.parent
        return ".".join(reversed(path))

def to_tuple(mat):
    # Convert matrix to hashable tuple of tuples
    return tuple(tuple((x.numerator, x.denominator) for x in row) for row in mat)

class Solver:
    def __init__(self):
        # Root node (Identity)
        root_mat = np.array([[Fraction(1, 1), Fraction(0, 1)], [Fraction(0, 1), Fraction(1, 1)]], dtype=object)
        self.root = Node(None, None, root_mat, 0)
        
        self.current_beam = [self.root]
        self.visited = set()
        self.visited.add(to_tuple(root_mat))
        self.iteration = 0
        self.start_time = time.time()
        self.found_solution = None

    def step(self):
        if self.found_solution:
            return {'status': 'done', 'solution': self.found_solution}
            
        if self.iteration >= MAX_ITERATIONS:
            return {'status': 'done', 'reason': 'max_iterations'}

        next_beam = []
        new_nodes = [] # Track new nodes for visualization
        
        # Expand current beam
        for node in self.current_beam:
            last_action = node.action_char
            
            for move, mat_move in ACTIONS.items():
                # 1. Don't backtrack immediately
                if last_action and INVERSES[last_action] == move:
                    continue
                
                # 2. Compute new state
                new_mat = np.dot(node.matrix, mat_move)
                
                # 3. Pruning
                mat_tuple = to_tuple(new_mat)
                neg_mat_tuple = to_tuple(-new_mat)
                
                if mat_tuple in self.visited or neg_mat_tuple in self.visited:
                    continue
                
                self.visited.add(mat_tuple)
                self.visited.add(neg_mat_tuple)
                
                child = Node(node, move, new_mat, node.depth + 1)
                new_nodes.append(child)
                
                # 4. Check solution
                if child.is_candidate():
                    if child.is_nontrivial():
                        self.found_solution = child
                        return {
                            'status': 'found',
                            'solution': child.get_word(),
                            'matrix': child.matrix.tolist(), # JSON serializable-ish
                            'trace': float(child.matrix[0,0] + child.matrix[1,1])
                        }
                
                next_beam.append(child)

        if not next_beam:
            return {'status': 'done', 'reason': 'empty_beam'}

        # Sort by score
        next_beam.sort(key=lambda x: x.score)
        
        # Pruning / Beam Selection
        best_candidates = next_beam[:int(BEAM_WIDTH * (1 - RANDOM_SAMPLE_RATE))]
        random_candidates = []
        if len(next_beam) > len(best_candidates):
            remainder = next_beam[len(best_candidates):]
            sample_size = min(len(remainder), int(BEAM_WIDTH * RANDOM_SAMPLE_RATE))
            random_candidates = random.sample(remainder, sample_size)
            
        self.current_beam = best_candidates + random_candidates
        self.iteration += 1
        
        # Return state for visualization
        return {
            'status': 'running',
            'iteration': self.iteration,
            'beam_size': len(self.current_beam),
            'best_score': self.current_beam[0].score,
            'new_nodes': new_nodes, # All nodes generated this step
            'kept_nodes': self.current_beam # Nodes that survived pruning
        }

def solve():
    solver = Solver()
    print(f"Starting search (Beam Width: {BEAM_WIDTH})...")
    
    while True:
        result = solver.step()
        
        if result['status'] == 'found':
            print(f"\nSUCCESS found at iteration {solver.iteration}!")
            print(f"Word: {result['solution']}")
            break
        elif result['status'] == 'done':
            print(f"Search ended: {result.get('reason', 'unknown')}")
            break
            
        if solver.iteration % 100 == 0:
            print(f"Iter {solver.iteration}: Best Score {result['best_score']:.5f} | Beam Size {result['beam_size']}")

if __name__ == "__main__":
    solve()