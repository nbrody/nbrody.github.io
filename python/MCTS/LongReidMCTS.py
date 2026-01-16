import random
import math
import time
from flint import fmpz_mat

# =============================
# Group definition
# =============================
MAT_A = fmpz_mat(2, 2, [9, 0, 0, 1])
MAT_B = fmpz_mat(2, 2, [82, 2, 9, 1])
MAT_Ai = fmpz_mat(2, 2, [1, 0, 0, 9])
MAT_Bi = fmpz_mat(2, 2, [1, -2, -9, 82])

IDENTITY = fmpz_mat(2, 2, [1, 0, 0, 1])
GENERATORS = {"A": MAT_A, "B": MAT_B, "a": MAT_Ai, "b": MAT_Bi}
INVERSE_NAMES = {"A": "a", "a": "A", "B": "b", "b": "B"}

FORBIDDEN_SUBWORDS = [
    "abABa", "aBAba", "AbaBA", "ABabA",
    "baBAb", "bABab", "BabAB", "BAbaB"
]

def is_valid_word(word_str):
    for forbidden in FORBIDDEN_SUBWORDS:
        if forbidden in word_str:
            return False
    return True

def get_content(M):
    entries = [abs(int(x)) for x in M.entries()]
    if not entries: return 1
    return math.gcd(*entries)

def reduce_matrix(M):
    """Primitive integer representatives."""
    c = get_content(M)
    if c <= 1: return M
    factor = 1
    while c > 0 and c % 2 == 0:
        c //= 2
        factor *= 2
    while c > 0 and c % 3 == 0:
        c //= 3
        factor *= 3
    if factor > 1:
        return fmpz_mat(2, 2, [int(x) // factor for x in M.entries()])
    return M

# =============================
# Parameters
# =============================
MIN_LEN = 2
MAX_DEPTH = 300
ITERATIONS = 1000000
EXPLORATION = 2.0

def allowed_generators(word):
    if not word: return list(GENERATORS.keys())
    last_g = word[-1]
    candidates = [g for g in GENERATORS if g != INVERSE_NAMES[last_g]]
    return [g for g in candidates if is_valid_word(word + g)]

def matrix_score(M):
    """
    Score is based purely on the size of the entries in the reduced matrix.
    Smaller is better. We return -log10(norm) as a reward.
    """
    norm = sum(abs(int(x)) for x in M.entries())
    if norm <= 2: return 100.0 # Identity or -Identity
    return -math.log10(float(norm))

# =============================
# MCTS Node
# =============================
class Node:
    __slots__ = ['word', 'parent', 'children', 'visits', 'total_reward', 'score']
    def __init__(self, word, parent=None, matrix=None):
        self.word = word
        self.parent = parent
        self.children = {}
        self.visits = 0
        self.total_reward = 0.0
        if matrix is None:
            matrix = word_to_matrix(word)
        self.score = matrix_score(matrix)

    def ucb(self):
        if self.visits == 0: return float('inf')
        return (self.total_reward / self.visits +
                EXPLORATION * math.sqrt(math.log(self.parent.visits) / self.visits))

    def best_child(self):
        return max(self.children.values(), key=lambda n: n.ucb())

def word_to_matrix(word):
    M = IDENTITY
    for g in word:
        M = reduce_matrix(M * GENERATORS[g])
    return M

# =============================
# MCTS Core
# =============================
def rollout(word, start_mat):
    current_word = word
    curr_mat = start_mat
    depth = len(word)
    target_depth = random.randint(depth + 1, min(depth + 50, MAX_DEPTH))
    best_s = matrix_score(curr_mat)
    
    while depth < target_depth:
        choices = allowed_generators(current_word)
        if not choices: break
        g = random.choice(choices)
        current_word += g
        curr_mat = reduce_matrix(curr_mat * GENERATORS[g])
        depth += 1
        s = matrix_score(curr_mat)
        if s > best_s: best_s = s
        if s >= 100.0: break

    return best_s, current_word, best_s

def mcts():
    root = Node("")
    best_word = ""
    best_score = -float('inf')

    print(f"Starting Norm-Focused LongReidMCTS...")
    start_time = time.time()
    for i in range(1, ITERATIONS + 1):
        node = root
        while node.children:
            allowed = allowed_generators(node.word)
            if len(node.children) < len(allowed) or len(node.word) >= MAX_DEPTH:
                break
            node = node.best_child()
            
        if len(node.word) < MAX_DEPTH:
            allowed = allowed_generators(node.word)
            unexpanded = [g for g in allowed if g not in node.children]
            if unexpanded:
                g = random.choice(unexpanded)
                parent_mat = word_to_matrix(node.word)
                child_mat = reduce_matrix(parent_mat * GENERATORS[g])
                new_node = Node(node.word + g, parent=node, matrix=child_mat)
                node.children[g] = new_node
                node = new_node
                if node.score >= 100.0:
                    print(f"\n!!! RELATION FOUND DURING EXPANSION (Iter {i}) !!!")
                    print(f"Word: {node.word}")
                    return node.word, 0
        
        node_mat = word_to_matrix(node.word)
        reward, r_word, r_score = rollout(node.word, node_mat)
        
        temp_node = node
        while temp_node:
            temp_node.visits += 1
            temp_node.total_reward += reward
            temp_node = temp_node.parent
            
        if r_score > best_score and len(r_word) >= MIN_LEN:
            best_score = r_score
            best_word = r_word
            m_tmp = word_to_matrix(best_word)
            norm_val = sum(abs(int(x)) for x in m_tmp.entries())
            print(f"[Iter {i}] New Best: {best_word} (norm={norm_val})")
            if norm_val <= 2:
                print(f"!!! RELATION FOUND IN ROLLOUT (Iter {i}) !!!")
                return r_word, 0

        if i % 10000 == 0:
            elapsed = time.time() - start_time
            m_stat = word_to_matrix(best_word)
            norm_stat = sum(abs(int(x)) for x in m_stat.entries())
            print(f"Iteration {i}... Avg {i/elapsed:.1f} it/s | Best Norm: {norm_stat}")

    return best_word, best_score

if __name__ == "__main__":
    word, score = mcts()
    print("\n=== SEARCH RESULT ===")
    if score == 0:
        print(f"SUCCESS! Relation Word: {word}")
    else:
        print(f"Closest word found: {word}")
