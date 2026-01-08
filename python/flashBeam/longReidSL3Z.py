import math
import time
from flint import fmpz_mat, fmpz
from flashbeam import FlashBeam, SearchProblem, Node

# --- Search Configuration ---
BEAM_WIDTH = 10000         # High-capacity beam
FLASH_SIZE = 50           # Significant global memory
MAX_SOLUTIONS = 5         # Stop after finding this many solutions
MAX_ITERATIONS = 500      # Broad search

class LongReidSL3ZProblem(SearchProblem):
    def __init__(self):
        # Define Generators
        self.MAT_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
        mat_b = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0])
        self.MAT_B2 = mat_b * mat_b
        self.MAT_T = fmpz_mat(3, 3, [3, 4, 6, 2, 3, 4, 2, 3, 5])
        
        # Inverses
        self.MAT_Ai = self._invert_mat(self.MAT_A)
        self.MAT_B2i = self._invert_mat(self.MAT_B2)
        self.MAT_Ti = self._invert_mat(self.MAT_T)
        
        self.actions = [self.MAT_A, self.MAT_B2, self.MAT_T, self.MAT_Ai, self.MAT_B2i, self.MAT_Ti]
        self.names = ['A', 'B2', 'T', 'Ai', 'B2i', 'Ti']
        self.inverses_map = {'A': 'Ai', 'Ai': 'A', 'B2': 'B2i', 'B2i': 'B2', 'T': 'Ti', 'Ti': 'T'}

    def _invert_mat(self, M):
        """Returns integer inverse, assuming determinant is 1."""
        Mi_q = M.inv()
        return fmpz_mat(Mi_q.nrows(), Mi_q.ncols(), [int(x) for x in Mi_q.entries()])

    def _reduce_word(self, word_str):
        if not word_str:
            return ""
        tokens = word_str.split(" . ")
        stack = []
        for t in tokens:
            if stack and self.inverses_map.get(stack[-1]) == t:
                stack.pop()
            else:
                stack.append(t)
        return " . ".join(stack)

    def _calc_score(self, matrix):
        # L1 distance to identity
        diff = matrix - fmpz_mat(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])
        return sum(abs(int(x)) for x in diff.entries())

    # --- Interface Implementation ---

    def get_initial_node(self):
        mat = fmpz_mat(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])
        return Node(state=mat, identifier="", score=self._calc_score(mat))

    def get_generators(self):
        nodes = []
        for name, m in zip(self.names, self.actions):
            nodes.append(Node(state=m, identifier=name, score=self._calc_score(m)))
        return nodes

    def combine(self, node_a, node_b):
        # Matrix multiplication
        new_mat = node_a.state * node_b.state
        
        # Word concatenation and reduction
        raw_word = f"{node_a.identifier} . {node_b.identifier}".strip(" . ")
        new_word = self._reduce_word(raw_word)
        
        score = self._calc_score(new_mat)
        return Node(state=new_mat, identifier=new_word, score=score)

    def get_hash_key(self, node):
        # Tuple of integers for hash map
        return tuple(int(x) for x in node.state.entries())

    def is_solution(self, node):
        # Target: Identity matrix
        return node.state.is_one()

    def is_nontrivial(self, node):
        if not node.identifier:
            return False
            
        word_tokens = node.identifier.split(" . ")
        token_set = set(word_tokens)
        
        if 'T' not in token_set and 'Ti' not in token_set:
            return False
            
        return True

    def format_score(self, node):
        norm = sum(abs(int(x)) for x in node.state.entries())
        return str(norm)

# --- Main Execution ---

if __name__ == "__main__":
    problem = LongReidSL3ZProblem()
    
    solver = FlashBeam(
        problem=problem,
        beam_width=BEAM_WIDTH,
        flash_size=FLASH_SIZE,
        max_iterations=MAX_ITERATIONS,
        max_solutions=MAX_SOLUTIONS
    )
    
    results = solver.solve()
    
    if results:
        print("\nFinal Results Summary:")
        for r in results:
            word_len = len(r.identifier.split(' . '))
            print(f"Word length: {word_len} | Word: {r.identifier}")
