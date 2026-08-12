"""
Lyndon-Ullman search: relations between the parabolic pair

    A = [[1, mu], [0, 1]],    B = [[1, 0], [mu, 1]]

for rational mu = p/q (read from FLASHBEAM_T_PARAM, default 1, so the
frontend's t field sets mu). Scaled to integer matrices

    A ~ [[q, p], [0, q]],     B ~ [[q, 0], [p, q]]      (det q^2)

and canonicalized by the primes of q. A nontrivial reduced word equal to
+-I is a relation, proving <A, B> is NOT free at this mu (Lyndon-Ullman
1969). Sanov: |mu| >= 2 is always free, so those values are negative
controls -- the search must find nothing there.
"""
import os
import sys
from flint import fmpz, fmpz_mat
from flashbeam import FlashBeam, SearchProblem, Node
from algmu import Mu

# --- Search Configuration ---
BEAM_WIDTH = 3000
FLASH_SIZE = 10
MAX_SOLUTIONS = 3
MAX_ITERATIONS = 50

try:
    MU = Mu(os.environ.get("FLASHBEAM_T_PARAM", "1"))
except ValueError as e:
    sys.exit(str(e))

# generator dets are powers of m^2, so only primes of m can be divided out
PRIMES = MU.primes


class LyndonUllmanProblem(SearchProblem):
    def __init__(self):
        mats = MU.matrices()
        self.MAT_a = mats["a"]
        self.MAT_b = mats["b"]
        self.MAT_ai = mats["ai"]
        self.MAT_bi = mats["bi"]

        self.actions = [self.MAT_a, self.MAT_b, self.MAT_ai, self.MAT_bi]
        self.names = ['a', 'b', 'ai', 'bi']
        self.inverses_map = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}

        self.MAT_I = mats["I"]
        self.MAT_NI = -self.MAT_I

    def _canonicalize_mat(self, M):
        for p in PRIMES:
            while all(entry % p == 0 for entry in M.entries()):
                M /= p
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

    def _calc_score(self, M):
        """L1 distance to the nearest of +-I. Lower is better."""
        d_pos = sum(abs(int(x)) for x in (M - self.MAT_I).entries())
        d_neg = sum(abs(int(x)) for x in (M - self.MAT_NI).entries())
        return float(min(d_pos, d_neg))

    def _is_pm_identity(self, M):
        return M == self.MAT_I or M == self.MAT_NI

    # --- Interface Implementation ---

    def get_initial_node(self):
        return Node(state=self.MAT_I, identifier="", score=0.0)

    def get_generators(self):
        nodes = []
        for name, m in zip(self.names, self.actions):
            nodes.append(Node(state=m, identifier=name,
                              score=self._calc_score(m)))
        return nodes

    def combine(self, node_a, node_b):
        new_mat = self._canonicalize_mat(node_a.state * node_b.state)
        raw_word = f"{node_a.identifier} . {node_b.identifier}".strip(" . ")
        new_word = self._reduce_word(raw_word)
        return Node(state=new_mat, identifier=new_word,
                    score=self._calc_score(new_mat))

    def get_hash_key(self, node):
        # The identity is in the visited set from the start, so a relation
        # word landing on +-I would normally be deduplicated away before the
        # solution check ever sees it. Give +-I nodes a per-word key so they
        # always reach is_solution.
        if self._is_pm_identity(node.state):
            return ("PM_IDENTITY", node.identifier)
        # Sign-SENSITIVE state key: identifying M with -M would kill every
        # path to -I, because the parents of -I are -(short words) which
        # collide with already-visited states.
        return tuple(int(x) for x in node.state.entries())

    def is_solution(self, node):
        return bool(node.identifier) and self._is_pm_identity(node.state)

    def is_nontrivial(self, node):
        if not node.identifier:
            return False
        return len(node.identifier.split(" . ")) >= 2

    def format_score(self, node):
        return f"{node.score:.0f}"

    def format_state(self, node):
        M = node.state
        n = M.nrows()
        rows = "\n".join(
            "[" + ", ".join(str(M[i, j]) for j in range(n)) + "]"
            for i in range(n))
        sign = "+I" if M == self.MAT_I else ("-I" if M == self.MAT_NI else "")
        return rows + (f"   = {sign}" if sign else "")


if __name__ == "__main__":
    problem = LyndonUllmanProblem()
    print(f"Lyndon-Ullman pair: A = [[1,mu],[0,1]], B = [[1,0],[mu,1]]")
    print(MU.describe())
    print(f"Canonicalizing primes of m: {sorted(PRIMES)}")
    print()

    solver = FlashBeam(
        problem=problem,
        beam_width=BEAM_WIDTH,
        flash_size=FLASH_SIZE,
        max_iterations=MAX_ITERATIONS,
        max_solutions=MAX_SOLUTIONS,
    )
    results = solver.solve()

    if results:
        print(f"\n<A,B> is NOT free at mu = {MU.pretty}. Relations found:")
        for r in results:
            n = len(r.identifier.split(" . "))
            sign = "I" if r.state == problem.MAT_I else "-I"
            print(f"  length {n}: {r.identifier} = {sign}")
    else:
        print(f"\nNo relations found at mu = {MU.pretty} within search depth.")
