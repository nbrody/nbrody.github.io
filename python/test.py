import numpy as np
import random

# 1. Group Setup
# --------------
I = np.eye(3, dtype=int)
a = np.array([[1, 1, 2], [0, 1, 1], [0, -3, -2]], dtype=int)
b = np.array([[-2, 0, -1], [-5, 1, -1], [3, 0, 1]], dtype=int)

# Precompute inverses and powers
A = np.linalg.matrix_power(a, 2) # a^-1
B = np.linalg.matrix_power(b, 2) # b^-1

gens = {'a': a, 'A': A, 'b': b, 'B': B}
inverse_map = {'a': 'A', 'A': 'a', 'b': 'B', 'B': 'b'}

# 2. Strong Abstract Reduction
# ----------------------------
def strong_reduce(word):
    """
    Reduces a word in Delta(3,3,4) to handle conjugates.
    1. Standard cancellations (aA, bB).
    2. Order 3 reductions (aaa, bbb).
    3. Relation removal (ab)^4.
    4. Cyclic reduction (stripping x...X).
    """
    # All cyclic forms of the main relation (ab)^4 and its inverse
    base_rel = "abababab"
    base_inv = "ABABABAB"
    
    # Generate all 8 cyclic permutations of the relations
    # e.g., babababa, abababab, etc.
    relations = set()
    for i in range(8):
        relations.add(base_rel[i:] + base_rel[:i])
        relations.add(base_inv[i:] + base_inv[:i])
    
    # Add order 3 relations
    relations.add("aaa")
    relations.add("bbb")
    relations.add("AAA")
    relations.add("BBB")

    current = word
    prev = None

    while current != prev:
        prev = current
        
        # Phase 1: Internal Cancellations
        changed = True
        while changed:
            temp = current
            # Trivial inverses
            for x, X in inverse_map.items():
                temp = temp.replace(x + X, "")
            
            # Defining relations
            for r in relations:
                temp = temp.replace(r, "")
            
            changed = (temp != current)
            current = temp

        # Phase 2: Cyclic Stripping (Conjugation check)
        # If word is "a...A", strip both ends.
        if len(current) >= 2:
            first = current[0]
            last = current[-1]
            if inverse_map.get(first) == last:
                current = current[1:-1]
                # Loop back to Phase 1 to clean up any new adjacencies

    return current

# 3. Beam Search
# --------------
def score_matrix(M):
    """Heuristic: Manhattan distance from Identity."""
    return np.sum(np.abs(M - I))

def search_nontrivial_relations(beam_width=50000, max_depth=100, randomness=50):
    # Beam: List of (word, matrix, score)
    beam = [("", I, 0)]
    
    # History to prevent cycles/repeats
    seen_matrices = set()
    
    print(f"Searching for NON-CONJUGATE relations (Depth {max_depth})...")
    
    for depth in range(max_depth):
        candidates = []
        
        for word, mat, _ in beam:
            last_char = word[-1] if word else ""
            
            for char, move in gens.items():
                # Simple optimization: don't backtrack immediately
                if last_char and inverse_map[char] == last_char:
                    continue
                # Don't repeat generator (aa is valid, but usually handled by A)
                if last_char == char:
                    continue

                new_word = word + char
                new_mat = mat @ move
                
                # Hashing matrix for "seen" check (tuples are hashable)
                mat_tuple = tuple(map(tuple, new_mat))
                if mat_tuple in seen_matrices:
                    continue
                
                dist = score_matrix(new_mat)
                
                # --- SUCCESS CHECK ---
                if dist == 0:
                    # We found a matrix identity. Is it abstractly trivial?
                    reduced = strong_reduce(new_word)
                    if len(reduced) > 0:
                        return new_word, new_mat, reduced
                    # If reduced is empty, it was just a hidden identity/conjugate. Ignore.
                
                candidates.append((new_word, new_mat, dist))
                seen_matrices.add(mat_tuple)

        # Sort and Prune
        candidates.sort(key=lambda x: x[2])
        
        # Deterministic best + Random injection
        best = candidates[:max(0, beam_width - randomness)]
        
        # Add random sampling to escape local minima
        remainder = candidates[beam_width - randomness:]
        if len(remainder) > randomness:
            random_picks = random.sample(remainder, randomness)
        else:
            random_picks = remainder
            
        beam = best + random_picks
        
        if not beam:
            break
            
        print(f"Depth {depth+1}: Best Dist {beam[0][2]} | Size {len(beam)}")

    return None, None, None

# Run
final_word, final_mat, reduced_form = search_nontrivial_relations()

print("="*40)
if final_word:
    print("SUCCESS: Found Nontrivial Relation!")
    print(f"Raw Word:     {final_word}")
    print(f"Reduced Form: {reduced_form}")
    print("(This maps to Matrix I, but does not reduce to I in Delta(3,3,4))")
else:
    print("Search finished. No new relations found.")