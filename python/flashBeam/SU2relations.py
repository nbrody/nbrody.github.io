import math
import time
from flint import fmpz, fmpz_mat
from flashbeam import FlashBeam, SearchProblem, Node

# --- Configuration ---
BEAM_WIDTH = 5000
FLASH_SIZE = 100
MAX_SOLUTIONS = 1
MAX_ITERATIONS = 1000

PRIMES = [2, 3, 5, 7, 11, 13, 17] 

def complex_to_real_4x4_int(real_part, imag_part):
    # Map 2x2 complex matrix M = R + iI to 4x4 real matrix
    # [[R, -I], [I, R]]
    R = real_part
    I = imag_part
    mat_list = [
        [R[0][0], R[0][1], -I[0][0], -I[0][1]],
        [R[1][0], R[1][1], -I[1][0], -I[1][1]],
        [I[0][0], I[0][1],  R[0][0],  R[0][1]],
        [I[1][0], I[1][1],  R[1][0],  R[1][1]]
    ]
    return fmpz_mat(4, 4, [int(x) for row in mat_list for x in row])

class SU2IntegerProblem(SearchProblem):
    def __init__(self):
        # A_int = [[36, 77], [-77, 36]] (from 1/85 scale)
        mat_A_real = [[36, 77], [-77, 36]]
        mat_A_imag = [[0, 0], [0, 0]]
        self.MAT_A = complex_to_real_4x4_int(mat_A_real, mat_A_imag)

        # B_int = [[55+71i, 79+97i], [-79+97i, 55-71i]] (from 1/154 scale)
        mat_B_real = [[55, 79], [-79, 55]]
        mat_B_imag = [[71, 97], [97, -71]]
        self.MAT_B = complex_to_real_4x4_int(mat_B_real, mat_B_imag)

        # Inverses are transposes for these scaled unitary/orthogonal matrices
        self.MAT_ai = self.MAT_A.transpose()
        self.MAT_bi = self.MAT_B.transpose()

        self.actions = [self.MAT_A, self.MAT_B, self.MAT_ai, self.MAT_bi]
        self.names = ['a', 'b', 'ai', 'bi']
        self.inverses_map = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}

        # Known relation suffix to avoid (ab a-1 b-1)^2 = -I
        self.FORBIDDEN_SUFFIXES = {
            "a.b.ai.bi.a", "b.ai.bi.a.b", "ai.bi.a.b.ai", "bi.a.b.ai.bi",
            "b.a.bi.ai.b", "a.bi.ai.b.a", "bi.ai.b.a.bi", "ai.b.a.bi.ai"
        }

    def _canonicalize(self, M):
        """Divides out common prime factors defined in PRIMES."""
        for p in PRIMES:
            while all(int(entry) % p == 0 for entry in M.entries()):
                M /= p # Integer division
        return M

    def _calc_score(self, matrix):
        """Score by the determinant. Lower is better."""
        # For 4x4 representation of SU2, Det(M_4x4) = |Det(M_complex)|^2.
        d = abs(matrix.det())
        if d == 0: return float('inf')
        return math.log(float(d))

    def _reduce_word(self, word_str):
        if not word_str:
            return ""
        tokens = word_str.split(".")
        stack = []
        for t in tokens:
            if stack and self.inverses_map.get(stack[-1]) == t:
                stack.pop()
            else:
                stack.append(t)
        return " . ".join(stack).replace(" ", "") # standard flashbeam uses " . " but user likes "a.b"

    # --- SearchProblem Implementation ---

    def get_initial_node(self):
        mat = fmpz_mat(4, 4, [1 if i == j else 0 for i in range(4) for j in range(4)])
        return Node(state=mat, identifier="", score=0.0)

    def get_generators(self):
        nodes = []
        for name, m in zip(self.names, self.actions):
            # Generators are already relatively prime
            nodes.append(Node(state=m, identifier=name, score=self._calc_score(m)))
        return nodes

    def combine(self, node_a, node_b):
        new_mat = node_a.state * node_b.state
        new_mat = self._canonicalize(new_mat)
        
        # Word reduction after concatenation
        raw_word = f"{node_a.identifier}.{node_b.identifier}".strip(".")
        new_word = self._reduce_word(raw_word)
        
        # Forbidden subword filtering
        score = self._calc_score(new_mat)
        for bad in self.FORBIDDEN_SUFFIXES:
            if bad in new_word:
                # If forbidden pattern appears, give it a massive score to effectively prune it
                score = float('inf')
                break
                
        return Node(state=new_mat, identifier=new_word, score=score)

    def get_hash_key(self, node):
        # Treat M and -M as equivalent
        entries = [int(x) for x in node.state.entries()]
        # Find first non-zero entry to determine sign
        for x in entries:
            if x != 0:
                if x < 0:
                    entries = [-y for y in entries]
                break
        return tuple(entries)

    def is_solution(self, node):
        # Target: Determinant 1 (since we are using integer matrices and dividing out GCD)
        # If matrix is SU2, its determinant in 4x4 real representation is 1.
        if abs(node.state.det()) == 1:
            # Must be Identity or -Identity
            return node.state.is_one() or (node.state * -1).is_one()
        return False

    def is_nontrivial(self, node):
        word_len = len(node.identifier.split('.')) if node.identifier else 0
        if word_len <= 8:
            return False
        # Avoid forbidden suffixes
        for bad in self.FORBIDDEN_SUFFIXES:
            if bad in node.identifier:
                return False
        return True

    def format_score(self, node):
        # Factor determinant into exponent vectors over PRIMES
        d = abs(int(node.state.det()))
        if d == 1: return "1"
        
        factors = []
        temp_d = d
        for p in PRIMES:
            count = 0
            while temp_d % p == 0:
                count += 1
                temp_d //= p
            if count > 0:
                if count == 1:
                    factors.append(f"{p}")
                else:
                    factors.append(f"{p}^{count}")
        
        if temp_d > 1:
            factors.append(str(temp_d))
            
        return "det=" + "*".join(factors)

if __name__ == "__main__":
    problem = SU2IntegerProblem()
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
            print(f"Word length: {len(r.identifier.split('.'))} | Word: {r.identifier}")
