import random
import math
import time
from flint import fmpz_mat

# =============================
# Q(sqrt(2)) helper for 4x4
# =============================

def mat_2x2_to_4x4(M_2x2):
    rows = []
    rows.extend([M_2x2[0][0][0], 2*M_2x2[0][0][1], M_2x2[0][1][0], 2*M_2x2[0][1][1]])
    rows.extend([M_2x2[0][0][1], M_2x2[0][0][0], M_2x2[0][1][1], M_2x2[0][1][0]])
    rows.extend([M_2x2[1][0][0], 2*M_2x2[1][0][1], M_2x2[1][1][0], 2*M_2x2[1][1][1]])
    rows.extend([M_2x2[1][0][1], M_2x2[1][0][0], M_2x2[1][1][1], M_2x2[1][1][0]])
    return fmpz_mat(4, 4, rows)

# =============================
# Group definition
# =============================

MAT_A = mat_2x2_to_4x4([[(3, 2), (-1, 0)], [(1, 0), (0, 0)]])
MAT_B = mat_2x2_to_4x4([[(3, -2), (-1, 0)], [(1, 0), (0, 0)]])
MAT_Ai = MAT_A.inv()
MAT_Ai = fmpz_mat(4, 4, [int(x) for x in MAT_Ai.entries()])
MAT_Bi = MAT_B.inv()
MAT_Bi = fmpz_mat(4, 4, [int(x) for x in MAT_Bi.entries()])

IDENTITY = fmpz_mat(4, 4, [1 if i==j else 0 for i in range(4) for j in range(4)])
NEGATIVE_IDENTITY = -IDENTITY

GENERATORS = {"A": MAT_A, "B": MAT_B, "a": MAT_Ai, "b": MAT_Bi}
INVERSE_NAMES = {"A": "a", "a": "A", "B": "b", "b": "B"}

# =============================
# Parameters
# =============================

MIN_LEN = 2
MAX_DEPTH = 10000 # Shorter depth for more focused search
ITERATIONS = 1000000 # More iterations
EXPLORATION = 2.0

# =============================
# Utilities
# =============================

def is_triangular(M):
    upper = (M[2,0] == 0 and M[2,1] == 0 and M[3,0] == 0 and M[3,1] == 0)
    lower = (M[0,2] == 0 and M[0,3] == 0 and M[1,2] == 0 and M[1,3] == 0)
    return upper or lower

def distance_proxy(M):
    diff_p = M - IDENTITY
    dist_p = sum(int(x)**2 for x in diff_p.entries())
    if dist_p == 0: return 0
    diff_n = M + IDENTITY
    dist_n = sum(int(x)**2 for x in diff_n.entries())
    if dist_n == 0: return 0
    return min(dist_p, dist_n)

def allowed_generators(word):
    if not word: return list(GENERATORS.keys())
    return [g for g in GENERATORS if g != INVERSE_NAMES[word[-1]]]

# =============================
# MCTS Node
# =============================

class Node:
    __slots__ = ['word', 'parent', 'children', 'visits', 'total_reward', 'dist']
    def __init__(self, word, parent=None):
        self.word = word
        self.parent = parent
        self.children = {}
        self.visits = 0
        self.total_reward = 0.0
        # Cache distance
        M = word_to_matrix(word)
        self.dist = distance_proxy(M)

    def ucb(self):
        if self.visits == 0: return float('inf')
        return (self.total_reward / self.visits +
                EXPLORATION * math.sqrt(math.log(self.parent.visits) / self.visits))

    def best_child(self):
        return max(self.children.values(), key=lambda n: n.ucb())

def word_to_matrix(word):
    M = IDENTITY
    for g in word:
        M = M * GENERATORS[g]
    return M

# =============================
# MCTS Core
# =============================

def rollout(word, start_mat):
    current_word = word
    curr_mat = start_mat
    
    depth = len(current_word)
    # Random length rollout, but shorter
    target_depth = random.randint(depth + 1, min(depth + 20, MAX_DEPTH))
    
    best_dist = distance_proxy(curr_mat)
    any_triangular = is_triangular(curr_mat)
    
    while depth < target_depth:
        choices = allowed_generators(current_word)
        g = random.choice(choices)
        current_word += g
        curr_mat = curr_mat * GENERATORS[g]
        depth += 1
        
        d = distance_proxy(curr_mat)
        if d < best_dist: best_dist = d
        if d == 0: return 200.0, current_word, 0
        if is_triangular(curr_mat): any_triangular = True

    # Reward based on best distance seen
    reward = -math.log10(float(best_dist)) if best_dist > 0 else 200.0
    if any_triangular:
        reward += 10.0 # Parabolic bonus
        
    return reward, current_word, best_dist

def mcts():
    root = Node("")
    best_word = None
    best_score = float('inf')

    print(f"Searching harder with MCTS + Parabolic Bonuses...")
    print(f"Iterations: {ITERATIONS}, Max Tree Depth: {MAX_DEPTH}")
    
    start_time = time.time()
    for i in range(1, ITERATIONS + 1):
        # 1. Selection
        node = root
        while node.children and len(node.children) == len(allowed_generators(node.word)):
            if len(node.word) >= MAX_DEPTH: break
            node = node.best_child()
            
        # 2. Expansion
        if len(node.word) < MAX_DEPTH:
            allowed = allowed_generators(node.word)
            unexpanded = [g for g in allowed if g not in node.children]
            if unexpanded:
                g = random.choice(unexpanded)
                new_node = Node(node.word + g, parent=node)
                node.children[g] = new_node
                
                # Check for solution during expansion
                if new_node.dist == 0:
                    print(f"\n!!! RELATION FOUND DURING EXPANSION (Iter {i}) !!!")
                    print(f"Word: {new_node.word}")
                    return new_node.word, 0
                
                node = new_node
        
        # 3. Rollout - Pass the node's matrix to avoid recomputing
        node_mat = word_to_matrix(node.word)
        reward, word, result_dist = rollout(node.word, node_mat)
        
        # 4. Backpropagation
        temp_node = node
        while temp_node:
            temp_node.visits += 1
            temp_node.total_reward += reward
            temp_node = temp_node.parent
            
        # Monitoring
        if node.dist < best_score and len(node.word) >= MIN_LEN:
            best_score = node.dist
            best_word = node.word
            print(f"[Iter {i}] New Best: {best_word} (dist={best_score})")
        
        if i % 100000 == 0:
            elapsed = time.time() - start_time
            print(f"Iteration {i}... Avg {i/elapsed:.1f} it/s")

    return best_word, best_score

if __name__ == "__main__":
    word, score = mcts()
    print("\n=== SEARCH RESULT ===")
    if score == 0:
        print(f"SUCCESS! Relation: {word}")
    else:
        print(f"Closest Word: {best_word if 'best_word' in locals() else word}")
        print(f"L2 Distance: {score}")