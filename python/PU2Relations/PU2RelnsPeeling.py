import math
import random
import time
from flint import fmpz, fmpq, fmpq_mat

# --- Configuration ---
BEAM_WIDTH = 10000        
MAX_ITERATIONS_PER_STAGE = 2000 
PEELING_K = 10
PRIMES = [2, 5, 7, 11, 17]

# --- Helper Functions ---

def complex_to_real_4x4(real_part, imag_part):
    if isinstance(real_part, fmpq_mat):
        R = [[real_part[i,j] for j in range(2)] for i in range(2)]
    else:
        R = real_part
        
    if isinstance(imag_part, fmpq_mat):
        I = [[imag_part[i,j] for j in range(2)] for i in range(2)]
    else:
        I = imag_part
        
    mat_list = [
        [R[0][0], R[0][1], -I[0][0], -I[0][1]],
        [R[1][0], R[1][1], -I[1][0], -I[1][1]],
        [I[0][0], I[0][1],  R[0][0],  R[0][1]],
        [I[1][0], I[1][1],  R[1][0],  R[1][1]]
    ]
    return fmpq_mat(4, 4, [x for row in mat_list for x in row])

def lcm_fmpz(a, b):
    a = abs(a)
    b = abs(b)
    if a == 0 or b == 0: return fmpz(0)
    return (a * b) // a.gcd(b)

# --- Initial Generators ---
mat_A_real = [[fmpq(36, 85), fmpq(77, 85)], 
              [fmpq(-77, 85), fmpq(36, 85)]]
mat_A_imag = [[fmpq(0), fmpq(0)], [fmpq(0), fmpq(0)]]
MAT_A = complex_to_real_4x4(mat_A_real, mat_A_imag)

mat_B_real = [[fmpq(55, 154), fmpq(79, 154)],
              [fmpq(-79, 154), fmpq(55, 154)]]
mat_B_imag = [[fmpq(71, 154), fmpq(97, 154)],
              [fmpq(97, 154), fmpq(-71, 154)]]
MAT_B = complex_to_real_4x4(mat_B_real, mat_B_imag)

MAT_a = MAT_A.transpose()
MAT_b = MAT_B.transpose()

INITIAL_GENERATORS = [
    ('A', MAT_A),
    ('B', MAT_B),
    ('a', MAT_a),
    ('b', MAT_b)
]

def mat_to_tuple(mat):
    return tuple(
        (int(mat[i, j].numer()), int(mat[i, j].denom()))
        for i in range(4) for j in range(4)
    )

class Node:
    __slots__ = ('word', 'matrix', 'score')
    
    def __init__(self, word, matrix):
        self.word = word
        self.matrix = matrix
        self.score = self._calc_score()

    def _calc_score(self):
        score = 0
        for i in range(4):
            for j in range(4):
                denom = self.matrix[i, j].denom()
                if denom != 1:
                    score += math.log(int(denom))
        len_penalty = len(self.word) * 0.1
        return score + len_penalty

    def is_identity(self):
        for i in range(4):
            if self.matrix[i, i] != 1: return False
            for j in range(4):
                if i != j and self.matrix[i, j] != 0: return False
        return True

def check_denom_primes(mat, allowed_primes):
    # Return True if all denoms only contain allowed_primes
    # Check LCM of denoms
    lcm_val = fmpz(1)
    for i in range(4):
        for j in range(4):
            lcm_val = lcm_fmpz(lcm_val, mat[i,j].denom())
            
    val = int(lcm_val)
    if val == 1: return True
    
    for p in allowed_primes:
        while val % p == 0:
            val //= p
            
    return val == 1

def find_next_generators(current_gens, allowed_primes, target_k):
    print(f"  > Searching for {target_k} words using only primes {allowed_primes}...")
    
    # Root
    root_mat = fmpq_mat(4, 4, [1 if i == j else 0 for i in range(4) for j in range(4)])
    # Root is not a generator candidate unless we want identity?
    # We want non-trivial elements.
    
    # Beam search initialization
    # We start with the current generators themselves? 
    # Or identity? Standard beam search starts at Identity.
    current_beam = [Node("", root_mat)]
    visited = set()
    visited.add(mat_to_tuple(root_mat))
    
    neg_I = fmpq_mat(4, 4, [-1 if i == j else 0 for i in range(4) for j in range(4)])
    visited.add(mat_to_tuple(neg_I))
    
    found_candidates = []
    
    for iteration in range(MAX_ITERATIONS_PER_STAGE):
        next_beam = []
        
        for node in current_beam:
            # Try all generators
            for gen_word, gen_mat in current_gens:
                 # Minimal backtrack check?
                 # Since generators are complex words now, checking "inverse" by char is harder.
                 # We skip that for now or check string suffix?
                 # Let's just do pure forward search.
                 
                 new_mat = node.matrix * gen_mat
                 mat_tuple = mat_to_tuple(new_mat)
                 neg_mat_tuple = mat_to_tuple(new_mat * -1)
                 
                 if mat_tuple in visited or neg_mat_tuple in visited:
                     continue
                     
                 visited.add(mat_tuple)
                 visited.add(neg_mat_tuple)
                 
                 # Combine words
                 # If node is root, word is just gen_word
                 if node.word == "":
                     new_word = gen_word
                 else:
                     new_word = node.word + gen_word
                     
                 child = Node(new_word, new_mat)
                 
                 # Check Identity
                 if child.is_identity():
                     print(f"\nRELATION FOUND during peeling!")
                     print(f"Word: {child.word}")
                     return "RELATION_FOUND", child
                 
                 # Check if candidate for next stage
                 if check_denom_primes(new_mat, allowed_primes):
                     # Add to found list
                     # Check if we already have enough?
                     # We want best score ones, but if we find them early, good?
                     # Let's just collect all valid ones this step, sort, and picking.
                     # Actually, wait, simpler: accumulate valid ones.
                     found_candidates.append(child)
                     # print(f"    Found candidate: {child.word} (Score: {child.score:.2f})")
                     
                 next_beam.append(child)
        
        if not next_beam:
            break
            
        # Beam Pruning
        next_beam.sort(key=lambda x: x.score)
        current_beam = next_beam[:BEAM_WIDTH]
        
        # Check if we have enough candidates
        # We want to pick the BEST k candidates. 
        # If we have found some, should we stop immediately? 
        # Maybe iterating a bit more finds shorter/better ones.
        # Let's stop if we have found significantly more than k, or just check at end of iteration.
        
        # Sort found candidates and keep best unique?
        # They are unique by matrix visited check.
        
        if len(found_candidates) >= target_k * 2: # heuristic buffer
            break
            
        if iteration % 10 == 0:
            best_score = current_beam[0].score if current_beam else 0
            print(f"    Iter {iteration}: Beam {len(current_beam)}, Candidates {len(found_candidates)}, Best Score {best_score:.2f}")

    # Select best k candidates
    found_candidates.sort(key=lambda x: x.score)
    top_k = found_candidates[:target_k]
    
    print(f"  > Done stage. Found {len(found_candidates)} total. Keeping best {len(top_k)}.")
    return "CONTINUE", [(n.word, n.matrix) for n in top_k]

def solve():
    print(f"Starting Peeling Search.")
    print(f"Initial Primes: {PRIMES}")
    
    current_gens = INITIAL_GENERATORS
    
    # We peel one by one.
    # Stage 1: Target primes = PRIMES without last
    # Stage 2: Target primes = ...
    
    current_allowed = list(PRIMES)
    
    while current_allowed:
        # Peel off the last prime
        removed_prime = current_allowed.pop()
        print(f"\n=== STAGE: Peeling off {removed_prime} ===")
        print(f"Target Primes: {current_allowed}")
        print(f"Current Generators: {len(current_gens)} items")
        # for w, _ in current_gens: print(f"  {w}")

        status, result = find_next_generators(current_gens, current_allowed, PEELING_K)
        
        if status == "RELATION_FOUND":
            node = result
            print("!!! RELATION FOUND !!!")
            print(node.word)
            return
            
        if not result:
            print(f"Failed to find {PEELING_K} candidates for primes {current_allowed}.")
            return
            
        current_gens = result
        
        # Print info about new generators
        print(f"New Generators ({len(current_gens)}):")
        print(", ".join([w for w, m in current_gens]))

    print("Done peeling. Checking for relation in final set (Integer matrices?)...")
    # If we peeled everything, current_gens contains matrices with ONLY denom factors [] (so Integers)
    # We can run one last search for identity using these.
    
    status, result = find_next_generators(current_gens, [], 1)
    if status == "RELATION_FOUND":
         print(f"Found relation: {result.word}")
    else:
         print("No relation found in final integer search.")

if __name__ == "__main__":
    solve()