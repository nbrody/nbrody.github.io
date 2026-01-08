import math
import random
import time
import flint
from flint import fmpz, fmpz_mat
from sympy import factorint

# --- Configuration ---
BEAM_WIDTH = 5000          # Beam size
FLASH_SIZE = 50           # Best elements to keep in persistent flash
MAX_SOLUTIONS = 1        # Looking for relations in the 45-51 range
MAX_ITERATIONS = 1000     # Deep search
T_PARAM = fmpz(9)         # Parameter t 

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
INVERSES_MAP = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}

def reduce_word(word_str):
    if not word_str:
        return ""
    tokens = word_str.split(" . ")
    stack = []
    for t in tokens:
        if stack and INVERSES_MAP.get(stack[-1]) == t:
            stack.pop()
        else:
            stack.append(t)
    return " . ".join(stack)

def canonicalize_mat(M):
    g = fmpz(1)
    for p in PRIMES:
        while all(entry % p == 0 for entry in M.entries()):
            M /= p
            g *= p
    return M, g

class Node:
    __slots__ = ('word', 'matrix', 'score')

    def __init__(self, word, matrix):
        self.word = word
        self.matrix = matrix
        
        # Score: Lower is better.
        self.score = self._calc_score()

    def _calc_score(self):
        det = abs(self.matrix.det())
        if det == 0:
            return float('inf')
        return math.log(int(det))

    def get_score_str(self):
        det = int(abs(self.matrix.det()))
        if det == 0: return "0"
        if det == 1: return "1"
        factors = factorint(det)
        return " * ".join([f"{p}^{e}" if e > 1 else f"{p}" for p, e in sorted(factors.items())])

    def is_nontrivial(self):
        # |Trace| > 2 for loxodromics, or a long relation
        trace = abs(self.matrix[0,0] + self.matrix[1,1])
        word_len = len(self.word.split(' . ')) if self.word else 0
        
        if trace <= 2:
            # Skip the known length 8 identity/minus-identity
            return word_len > 10
        return True

    def get_word(self):
        return self.word

def solve():
    # Root node (Identity)
    root_mat = fmpz_mat(2, 2, [1, 0, 0, 1])
    root = Node("", root_mat)
    
    # Initialize generators
    GEN_NODES = []
    for i, m in enumerate(ACTIONS):
        mat, _ = canonicalize_mat(fmpz_mat(m))
        GEN_NODES.append(Node(ACTION_NAMES[i], mat))
        
    current_beam = [root] + GEN_NODES
    visited = {tuple(int(x) for x in root_mat.entries())}
    for n in GEN_NODES:
        visited.add(tuple(int(x) for x in n.matrix.entries()))
    
    # Persistent Flash: Best FLASH_SIZE nodes encountered so far globally
    # Initialize with generators to ensure basic moves are always possible
    persistent_flash = list(GEN_NODES)
    
    found_matrices = []
    print(f"Starting Persistent FlashBeam (Beam: {BEAM_WIDTH}, Global Flash: {FLASH_SIZE})")
    start_time = time.monotonic()

    for i in range(MAX_ITERATIONS):
        # 1. Expand current beam by the persistent flash (plus generators)
        # We also always include generators in the pool to ensure local steps
        expansion_pool = []
        seen_uids = set()
        for n in persistent_flash + GEN_NODES:
            uid = tuple(int(x) for x in n.matrix.entries())
            if uid not in seen_uids:
                expansion_pool.append(n)
                seen_uids.add(uid)
        
        # Keep expansion_pool bounded to FLASH_SIZE + generators
        # (persistent_flash is already size FLASH_SIZE)
        
        print(f"Flash Words (top 5): {[n.word for n in expansion_pool[:5]]} ...")
        print(f"Flash Scores: {[n.get_score_str() for n in expansion_pool[:5]]}")
        
        total_ops = len(current_beam) * len(expansion_pool)
        avg_len = sum(len(n.word.split(' . ')) for n in current_beam) / len(current_beam)
        print(f"\nIteration {i}: Frontier {len(current_beam)} (Avg Len {avg_len:.1f}), Expansion Pool {len(expansion_pool)}")
        print(f"Expanding {total_ops} combinations...")

        next_candidates = []

        for b_idx, b_node in enumerate(current_beam):
                
            for f_node in expansion_pool:
                # new = beam(i) x flash(beam(i))
                new_mat = b_node.matrix * f_node.matrix
                new_mat, _ = canonicalize_mat(new_mat)
                
                uid = tuple(int(x) for x in new_mat.entries())
                if uid in visited:
                    continue
                visited.add(uid)
                
                new_word = reduce_word(f"{b_node.word} . {f_node.word}".strip(" . "))
                child = Node(new_word, new_mat)
                
                # Check solution (Determinant 1)
                det = abs(child.matrix.det())
                if det == 1:
                    # Report any det 1 if word is nontrivial
                    if child.word != "" and child.is_nontrivial():
                        word_len = len(child.word.split(' . '))
                        
                        # General report
                        if word_len > 1:
                            print(f"\nDET 1 found (Length {word_len})")
                        
                        found_matrices.append(child)
                        
                        if len(found_matrices) >= MAX_SOLUTIONS:
                            print(f"\nReached MAX_SOLUTIONS ({MAX_SOLUTIONS}). Stopping.")
                            return found_matrices
                
                next_candidates.append(child)

        if not next_candidates:
            print(f"Iteration {i}: No new points found.")
            break
            
        # 2. Update Beam: Beam(i+1) = top(BEAM_WIDTH, next_candidates)
        # Since Identity is in flash, current_beam is implicitly in next_candidates
        next_candidates.sort(key=lambda x: x.score)
        current_beam = next_candidates[:BEAM_WIDTH]
        
        # 3. Update Persistent Flash: Best FLASH_SIZE nodes seen so far globally
        full_history = persistent_flash + current_beam
        full_history.sort(key=lambda x: x.score)
        
        # Deduplicate history
        persistent_flash = []
        seen_persistent = set()
        for n in full_history:
            uid = tuple(int(x) for x in n.matrix.entries())
            if uid not in seen_persistent:
                persistent_flash.append(n)
                seen_persistent.add(uid)
                if len(persistent_flash) >= FLASH_SIZE:
                    break
        
        best_node = current_beam[0]
        elapsed = time.monotonic() - start_time
        print(f"Iter {i} Complete: Best Score {best_node.get_score_str()} | Total Visited {len(visited)} | Time {elapsed:.1f}s")

    print("\nSearch complete.")
    return found_matrices

if __name__ == "__main__":
    res = solve()
    if res:
        print("\nFinal Results Summary:")
        for r in res:
            print(f"Word length: {len(r.word.split(' . '))} | Trace: {r.matrix[0,0]+r.matrix[1,1]} | Word: {r.word}")