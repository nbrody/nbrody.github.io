import math
import time
import heapq
from flint import fmpz_mat
from flashbeam import FlashBeam, SearchProblem, Node

# --- Search Configuration ---
BEAM_WIDTH = 100000         # Larger beam
FLASH_SIZE = 12            # Larger flash
MAX_SOLUTIONS = 5
MAX_ITERATIONS = 600

class BenoistProblem(SearchProblem):
    def __init__(self):
        # M1 = [[1+sqrt(2), -1], [1, 0]]
        self.MAT_M1 = fmpz_mat(4, 4, [
            1, 2, -1, 0,
            1, 1, 0, -1,
            1, 0, 0, 0,
            0, 1, 0, 0
        ])

        # M2 = [[1-sqrt(2), -1], [1, 0]]
        self.MAT_M2 = fmpz_mat(4, 4, [
            1, -2, -1, 0,
            -1, 1, 0, -1,
            1, 0, 0, 0,
            0, 1, 0, 0
        ])

        self.MAT_I = fmpz_mat(4, 4, [1 if i == j else 0 for i in range(4) for j in range(4)])
        self.MAT_NI = -self.MAT_I

        # Inverses
        self.MAT_M1i = self._invert_mat(self.MAT_M1)
        self.MAT_M2i = self._invert_mat(self.MAT_M2)

        self.actions = [self.MAT_M1, self.MAT_M2, self.MAT_M1i, self.MAT_M2i]
        self.names = ['A', 'B', 'a', 'b'] # A=M1, B=M2, a=M1^-1, b=M2^-1
        self.inverses_map = {'A': 'a', 'a': 'A', 'B': 'b', 'b': 'B'}

    def _invert_mat(self, M):
        Mi_q = M.inv()
        return fmpz_mat(M.nrows(), M.ncols(), [int(x) for x in Mi_q.entries()])

    def _reduce_word(self, word_str):
        if not word_str:
            return ""
        tokens = word_str.split(" ")
        stack = []
        for t in tokens:
            if stack and self.inverses_map.get(stack[-1]) == t:
                stack.pop()
            else:
                stack.append(t)
        return " ".join(stack)

    def _calc_score(self, matrix):
        # L1 distance to identity
        diff = matrix - self.MAT_I
        return sum(abs(int(x)) for x in diff.entries())

    def get_initial_node(self):
        return Node(state=self.MAT_I, identifier="", score=0.0)

    def get_generators(self):
        nodes = []
        for name, m in zip(self.names, self.actions):
            nodes.append(Node(state=m, identifier=name, score=self._calc_score(m)))
        return nodes

    def combine(self, node_a, node_b):
        new_mat = node_a.state * node_b.state
        raw_word = f"{node_a.identifier} {node_b.identifier}".strip()
        new_word = self._reduce_word(raw_word)
        score = self._calc_score(new_mat)
        return Node(state=new_mat, identifier=new_word, score=float(score))

    def get_hash_key(self, node):
        return tuple(int(x) for x in node.state.entries())

    def is_solution(self, node):
        # identity or negative identity (in PSL)
        return node.state.is_one() or node.state == self.MAT_NI

    def is_nontrivial(self, node):
        if not node.identifier:
            return False
        tokens = node.identifier.split(" ")
        if len(tokens) < 2:
            return False
        return True

    def _fmt_zsqrt2(self, a, b):
        a = int(a)
        b = int(b)
        if b == 0:
            return str(a)
        sqrt_part = "√2" if abs(b) == 1 else f"{abs(b)}√2"
        if a == 0:
            return ("-" if b < 0 else "") + sqrt_part
        op = " - " if b < 0 else " + "
        return f"{a}{op}{sqrt_part}"

    def format_state(self, node: Node):
        M = node.state
        # Extract 2x2 elements from 4x4 representation
        # [a, 2b; b, a] block structure
        x00 = self._fmt_zsqrt2(M[0,0], M[1,0])
        x01 = self._fmt_zsqrt2(M[0,2], M[1,2])
        x10 = self._fmt_zsqrt2(M[2,0], M[3,0])
        x11 = self._fmt_zsqrt2(M[2,2], M[3,2])
        
        # Calculate column widths for nice alignment
        w1 = max(len(x00), len(x10))
        w2 = max(len(x01), len(x11))
        
        row1 = f"│ {x00:<{w1}}   {x01:<{w2}} │"
        row2 = f"│ {x10:<{w1}}   {x11:<{w2}} │"
        
        # Add decorative borders
        top = "┌" + "─" * (w1 + w2 + 5) + "┐"
        bot = "└" + "─" * (w1 + w2 + 5) + "┘"
        
        return f"{top}\n{row1}\n{row2}\n{bot}"

    def format_score(self, node: Node):
        return f"{node.score:.2f}"

if __name__ == "__main__":
    problem = BenoistProblem()
    solver = FlashBeam(
        problem=problem,
        beam_width=BEAM_WIDTH,
        flash_size=FLASH_SIZE,
        max_iterations=MAX_ITERATIONS,
        max_solutions=MAX_SOLUTIONS
    )
    
    print("Searching for a relation between M1 and M2...")
    print("M1 = [[1+sqrt(2), -1], [1, 0]]")
    print("M2 = [[1-sqrt(2), -1], [1, 0]]")
    
    results = solver.solve()
    
    if results:
        print("\nFound Relations:")
        for r in results:
            # Check if it's -I
            if r.state == problem.MAT_NI:
                print(f"Word: {r.identifier} = -I")
            else:
                print(f"Word: {r.identifier} = I")
    else:
        print("\nNo relations found in search depth.")
