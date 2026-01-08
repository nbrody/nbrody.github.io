import math
import random
import time
from flint import fmpz, fmpq, fmpq_mat

# --- Configuration ---
BEAM_WIDTH = 20000        # Number of best nodes to keep per iteration
MAX_ITERATIONS = 100000  # Safety cutoff
RANDOM_SAMPLE_RATE = 0.1 # Diversity injection to prevent getting stuck in local minima
T_PARAM = 25              # Parameter t, must be a perfect square

# --- Group Definition ---

sqrt_t = int(math.isqrt(T_PARAM))
# Generator A: [[sqrt(t), 0], [0, 1/sqrt(t)]]
MAT_A = fmpq_mat(2, 2, [fmpq(sqrt_t), fmpq(0), fmpq(0), fmpq(1, sqrt_t)])

# Generator B: 1/(t-1) * [[1+t^2, 2], [t, 1]]
denom_b = T_PARAM - 1
MAT_B = fmpq_mat(2, 2, [
    fmpq(1 + T_PARAM**2, denom_b), fmpq(2, denom_b),
    fmpq(T_PARAM, denom_b),        fmpq(1, denom_b)
])

# Inverse A
MAT_a = fmpq_mat(2, 2, [fmpq(1, sqrt_t), fmpq(0), fmpq(0), fmpq(sqrt_t)])

# Inverse B
# For SL2, inv([[a,b],[c,d]]) = [[d,-b],[-c,a]]
# But these are determinant 1 matrices?
# det(A) = 1.
# det(B) = (1/(t-1)^2) * ((1+t^2) - 2t) = (1/(t-1)^2) * (t-1)^2 = 1.
# So standard inverse formula works.
MAT_b = fmpq_mat(2, 2, [
    MAT_B[1,1], -MAT_B[0,1],
    -MAT_B[1,0], MAT_B[0,0]
])

ACTIONS = {
    'ai': MAT_A,
    'bi': MAT_B,
    'a': MAT_a,
    'b': MAT_b
}

# Prevent trivial cancellations
INVERSES = {'ai': 'a', 'a': 'ai', 'bi': 'b', 'b': 'bi'}

class Node:
    __slots__ = ('parent', 'action_char', 'matrix', 'depth', 'score')

    def __init__(self, parent, action_char, matrix, depth):
        self.parent = parent
        self.action_char = action_char
        self.matrix = matrix
        self.depth = depth
        
        self.score = self._calc_score()

    def _calc_score(self):
        # Score based on the denominator of the trace
        trace = self.matrix[0, 0] + self.matrix[1, 1]
        denom = trace.denom()
        
        # If integer trace, score is 0 (log(1))
        # We add depth penalty to prefer shorter words
        score = math.log(int(denom))
        return score + (self.depth * 0.0001)

    def is_candidate(self):
        # Check if all entries are integers (denominator is 1)
        # Manually check the 4 entries
        for i in range(2):
            for j in range(2):
                if self.matrix[i, j].denom() != 1:
                    return False
        return True

    def is_nontrivial(self):
        # Check Trace to ensure infinite order (abs(Trace) > 2)
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

def mat_to_tuple(mat):
    # Convert fmpq_mat to tuple of (numerator, denominator) ints for hashing
    # Flint matrices are 0-indexed [row, col]
    return tuple(
        (int(mat[i, j].numer()), int(mat[i, j].denom()))
        for i in range(2) for j in range(2)
    )

class Solver:
    def __init__(self):
        # Root node (Identity)
        root_mat = fmpq_mat(2, 2, [1, 0, 0, 1])
        self.root = Node(None, None, root_mat, 0)
        
        self.current_beam = [self.root]
        self.visited = set()
        self.visited.add(mat_to_tuple(root_mat))
        self.iteration = 0
        self.found_solution = None

    def step(self):
        if self.found_solution:
            return {'status': 'done', 'solution': self.found_solution}
            
        if self.iteration >= MAX_ITERATIONS:
            return {'status': 'done', 'reason': 'max_iterations'}

        next_beam = []
        new_nodes_count = 0
        
        # Expand current beam
        for node in self.current_beam:
            last_action = node.action_char
            
            for move, mat_move in ACTIONS.items():
                if last_action and INVERSES[last_action] == move:
                    continue
                
                new_mat = node.matrix * mat_move
                mat_tuple = mat_to_tuple(new_mat)
                
                if mat_tuple in self.visited:
                    continue
                
                self.visited.add(mat_tuple)
                
                child = Node(node, move, new_mat, node.depth + 1)
                new_nodes_count += 1
                
                # Check for integer trace
                trace_val = child.matrix[0,0] + child.matrix[1,1]
                if trace_val.denom() == 1:
                    t_int = int(trace_val)
                    if abs(t_int) > 2: # Optional: ignore trivial traces like 2
                         # Print immediately
                         # We use a simple cache to avoid spamming the exact same trace value too much if desired,
                         # or just print everything. User asked for "every matrix".
                         print(f"[Integer Trace] Trace: {t_int}, Word: {child.get_word()}")

                # Check solution (integer matrix)
                if child.is_candidate():
                    if child.is_nontrivial():
                        self.found_solution = child
                        return {
                            'status': 'found',
                            'solution': child.get_word(),
                            'matrix': [[str(child.matrix[i,j]) for j in range(2)] for i in range(2)],
                            'trace': str(trace_val)
                        }
                
                next_beam.append(child)

        if not next_beam:
            return {'status': 'done', 'reason': 'empty_beam'}

        next_beam.sort(key=lambda x: x.score)
        
        cutoff = int(BEAM_WIDTH * (1 - RANDOM_SAMPLE_RATE))
        best_candidates = next_beam[:cutoff]
        
        random_candidates = []
        if len(next_beam) > len(best_candidates):
            remainder = next_beam[len(best_candidates):]
            sample_size = min(len(remainder), int(BEAM_WIDTH * RANDOM_SAMPLE_RATE))
            random_candidates = random.sample(remainder, sample_size)
            
        self.current_beam = best_candidates + random_candidates
        self.iteration += 1
        
        return {
            'status': 'running',
            'iteration': self.iteration,
            'beam_size': len(self.current_beam),
            'best_score': self.current_beam[0].score,
            'visited_count': len(self.visited)
        }

def solve():
    solver = Solver()
    print(f"Starting search (Beam Width: {BEAM_WIDTH})...")
    
    start_time = time.monotonic()
    
    while True:
        try:
            result = solver.step()
        except KeyboardInterrupt:
            print("\nstopped")
            break
            
        if result['status'] == 'found':
            print(f"\nSUCCESS found at iteration {solver.iteration}!")
            print(f"Word: {result['solution']}")
            print(f"Trace: {result['trace']}")
            print(f"Matrix: {result['matrix']}")
            break
        elif result['status'] == 'done':
            print(f"Search ended: {result.get('reason', 'unknown')}")
            break
            
        if solver.iteration > 0 and solver.iteration % 10 == 0:
            elapsed = time.monotonic() - start_time
            print(f"Iter {solver.iteration}: Best Score {result['best_score']:.5f} | Beam Size {result['beam_size']} | Visited {result['visited_count']} | Time {elapsed:.2f}s")

if __name__ == "__main__":
    solve()