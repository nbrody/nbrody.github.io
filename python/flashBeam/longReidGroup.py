import math
from flint import fmpz, fmpz_mat
from sympy import factorint
from flashbeam import FlashBeam, SearchProblem, Node

# --- Group Configuration ---
T_PARAM = fmpz(9) 

# --- Search Configuration ---
BEAM_WIDTH = 5000         # Beam size
FLASH_SIZE = 50           # Best elements to keep in persistent flash
MAX_SOLUTIONS = 10        # Stop after finding this many solutions
MAX_ITERATIONS = 1000     # Deep search

# Factor t(t-1) for canonicalization
PRIMES = {p for p, _ in (T_PARAM * (T_PARAM - 1)).factor()}

class LongReidProblem(SearchProblem):
    def __init__(self):
        # Define Generators
        self.MAT_a = fmpz_mat(2, 2, [T_PARAM, 0, 0, 1])
        self.MAT_b = fmpz_mat(2, 2, [1 + T_PARAM**2, 2, T_PARAM, 1])
        self.MAT_ai = fmpz_mat(2, 2, [1, 0, 0, T_PARAM]) # Inverse a
        self.MAT_bi = fmpz_mat(2, 2, [1, -2, -T_PARAM, 1 + T_PARAM**2]) # Inverse b
        
        self.actions = [self.MAT_a, self.MAT_b, self.MAT_ai, self.MAT_bi]
        self.names = ['a', 'b', 'ai', 'bi']
        self.inverses_map = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}

    def _canonicalize_mat(self, M):
        """Divides out common prime factors defined in PRIMES."""
        g = fmpz(1)
        for p in PRIMES:
            while all(entry % p == 0 for entry in M.entries()):
                M /= p # In-place division
                g *= p
        return M

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
        """Score based on log(det). Lower is better."""
        det = abs(matrix.det())
        if det == 0:
            return float('inf')
        return math.log(int(det))

    # --- Interface Implementation ---

    def get_initial_node(self):
        mat = fmpz_mat(2, 2, [1, 0, 0, 1])
        return Node(state=mat, identifier="", score=self._calc_score(mat))

    def get_generators(self):
        nodes = []
        for name, m in zip(self.names, self.actions):
            # Canonicalize generator right away
            mat = self._canonicalize_mat(fmpz_mat(m)) 
            nodes.append(Node(state=mat, identifier=name, score=self._calc_score(mat)))
        return nodes

    def combine(self, node_a, node_b):
        # Matrix multiplication
        new_mat = node_a.state * node_b.state
        new_mat = self._canonicalize_mat(new_mat)
        
        # Word concatenation and reduction
        raw_word = f"{node_a.identifier} . {node_b.identifier}".strip(" . ")
        new_word = self._reduce_word(raw_word)
        
        score = self._calc_score(new_mat)
        return Node(state=new_mat, identifier=new_word, score=score)

    def get_hash_key(self, node):
        # Tuple of integers for hash map
        return tuple(int(x) for x in node.state.entries())

    def is_solution(self, node):
        # Target: Determinant 1
        return abs(node.state.det()) == 1

    def is_nontrivial(self, node):
        trace = abs(node.state[0,0] + node.state[1,1])
        word_len = len(node.identifier.split(' . ')) if node.identifier else 0
        
        if trace <= 2:
            # Skip known short identities
            return word_len > 10
        return True

    def format_score(self, node):
        det = int(abs(node.state.det()))
        if det == 0: return "0"
        if det == 1: return "1"
        try:
            factors = factorint(det)
            return " * ".join([f"{p}^{e}" if e > 1 else f"{p}" for p, e in sorted(factors.items())])
        except:
            return str(det)

# --- Main Execution ---

if __name__ == "__main__":
    # You can now easily swap matrices or scoring logic here
    problem = LongReidProblem()
    
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
            trace = r.state[0,0] + r.state[1,1]
            print(f"Word length: {len(r.identifier.split(' . '))} | Trace: {trace} | Word: {r.identifier}")