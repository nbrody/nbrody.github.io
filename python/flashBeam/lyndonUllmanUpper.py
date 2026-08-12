"""
Lyndon-Ullman search via upper-triangular targets.

Instead of hunting full relations w = +-I directly, hunt words whose
bottom-left (2,1) entry vanishes. If w in <A,B> is upper triangular and w
is not (as a word) a power of a, then w a w^-1 is unipotent upper
triangular, hence commutes with a, and

    R  =  (w a w^-1) a (w a^-1 w^-1) a^-1  =  I

is a freely nontrivial relation: <A,B> is NOT free at mu. The witness w is
roughly a quarter the length of the relation it certifies, so this search
reaches much deeper than the direct one (lyndonUllman.py).

Scoring: bit-length of the q-free part of the scaled bottom-left entry
(the part that must die), plus a small total-size tie-breaker.

mu = p/q is read from FLASHBEAM_T_PARAM (default 1), like the other
searches. Sanov: |mu| >= 2 is free, so no upper-triangular words exist
there beyond powers of a -- negative controls.
"""
import math
import os
import sys
from flint import fmpz, fmpz_mat
from flashbeam import FlashBeam, SearchProblem, Node
from algmu import Mu

# --- Search Configuration ---
BEAM_WIDTH = 3000
FLASH_SIZE = 10
MAX_SOLUTIONS = 3
MAX_ITERATIONS = 60

try:
    MU = Mu(os.environ.get("FLASHBEAM_T_PARAM", "1"))
except ValueError as e:
    sys.exit(str(e))
D = MU.d
PRIMES = MU.primes
_PRIMES_INT = sorted(PRIMES)


class LUUpperProblem(SearchProblem):
    def __init__(self):
        mats = MU.matrices()
        self.MAT_a = mats["a"]
        self.MAT_b = mats["b"]
        self.MAT_ai = mats["ai"]
        self.MAT_bi = mats["bi"]
        self.MAT_I = mats["I"]
        self.actions = [self.MAT_a, self.MAT_b, self.MAT_ai, self.MAT_bi]
        self.names = ['a', 'b', 'ai', 'bi']
        self.inverses_map = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}

    def _canonicalize_mat(self, M):
        for p in PRIMES:
            while all(entry % p == 0 for entry in M.entries()):
                M /= p
        return M

    def _reduce_word(self, word_str):
        if not word_str:
            return ""
        stack = []
        for t in word_str.split(" . "):
            if stack and self.inverses_map.get(stack[-1]) == t:
                stack.pop()
            else:
                stack.append(t)
        return " . ".join(stack)

    def _z_block_zero(self, M):
        """True iff the bottom-left d x d block (the entry z in K) is 0."""
        return all(int(M[i, j]) == 0
                   for i in range(D, 2 * D) for j in range(D))

    def _z_qfree(self, M):
        """L1 of the bottom-left block with the m-prime part of its
        content stripped (the part canonicalization could still kill)."""
        vals = [abs(int(M[i, j]))
                for i in range(D, 2 * D) for j in range(D)]
        total = sum(vals)
        if total == 0:
            return 0
        g = 0
        for v in vals:
            g = math.gcd(g, v)
        gm = 1
        for p in _PRIMES_INT:
            while g % p == 0:
                g //= p
                gm *= p
        return max(1, total // gm)

    def _calc_score(self, M):
        u = self._z_qfree(M)
        if u == 0:
            return 0.0
        l1 = sum(abs(int(x)) for x in M.entries())
        return math.log2(1 + u) + 0.01 * math.log2(1 + l1)

    # --- Interface Implementation ---

    def get_initial_node(self):
        return Node(state=self.MAT_I, identifier="", score=0.0)

    def get_generators(self):
        return [Node(state=m, identifier=name, score=self._calc_score(m))
                for name, m in zip(self.names, self.actions)]

    def combine(self, node_a, node_b):
        new_mat = self._canonicalize_mat(node_a.state * node_b.state)
        raw_word = f"{node_a.identifier} . {node_b.identifier}".strip(" . ")
        new_word = self._reduce_word(raw_word)
        return Node(state=new_mat, identifier=new_word,
                    score=self._calc_score(new_mat))

    def get_hash_key(self, node):
        if self._z_block_zero(node.state):
            # Upper-triangular states get per-word keys: a solution word's
            # matrix may coincide with an a-power's (already visited), and
            # the visited-set must not hide it. Same lesson as +-I in
            # lyndonUllman.py.
            return ("UPPER", node.identifier)
        return tuple(int(x) for x in node.state.entries())

    def is_solution(self, node):
        return bool(node.identifier) and self._z_block_zero(node.state)

    def is_nontrivial(self, node):
        if not node.identifier:
            return False
        toks = set(node.identifier.split(" . "))
        return toks != {"a"} and toks != {"ai"}   # not a pure power of a

    def format_score(self, node):
        return f"{node.score:.2f}"

    def format_state(self, node):
        M = node.state
        n = M.nrows()
        rows = "\n".join(
            "[" + ", ".join(str(M[i, j]) for j in range(n)) + "]"
            for i in range(n))
        tag = "  UPPER-TRIANGULAR" if self._z_block_zero(M) else ""
        return rows + tag


def derived_relation(word, problem):
    """Return (relation_tokens, holds) for R = (w a w^-1) a (w a^-1 w^-1) a^-1."""
    wt = word.split(" . ")
    wi = [problem.inverses_map[t] for t in reversed(wt)]
    raw = wt + ["a"] + wi + ["a"] + wt + ["ai"] + wi + ["ai"]
    reduced = problem._reduce_word(" . ".join(raw)).split(" . ")

    mats = dict(zip(problem.names, problem.actions))
    M = problem.MAT_I
    for t in reduced:
        M = M * mats[t]
    M = problem._canonicalize_mat(M)
    return reduced, (M == problem.MAT_I or M == -problem.MAT_I)


if __name__ == "__main__":
    problem = LUUpperProblem()
    print("Lyndon-Ullman upper-triangular search: "
          "A = [[1,mu],[0,1]], B = [[1,0],[mu,1]]")
    print(MU.describe())
    print("Target: words with bottom-left entry 0 that are not powers of a.")
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
        print(f"\n<A,B> is NOT free at mu = {MU.pretty}. "
              f"Upper-triangular witnesses and derived relations:")
        for r in results:
            n = len(r.identifier.split(" . "))
            rel, ok = derived_relation(r.identifier, problem)
            print(f"\n  witness (length {n}): {r.identifier}")
            for line in problem.format_state(r).splitlines():
                print(f"    {line}")
            print(f"  derived relation R = (waw⁻¹)a(wa⁻¹w⁻¹)a⁻¹, "
                  f"length {len(rel)}: verified = {'I ✓' if ok else 'FAILED'}")
    else:
        print(f"\nNo upper-triangular words found at mu = {MU.pretty} "
              f"within search depth.")
