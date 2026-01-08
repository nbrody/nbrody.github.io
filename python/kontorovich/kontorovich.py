
import flint
from flint import fmpz_mat
import sys

# --- Configuration ---
BEAM_WIDTH = 100000        # Number of candidates to keep
MAX_DEPTH = 100            # Search depth
PRINT_THRESHOLD = 20      # Print if score is below this (close to identity)

# --- Matrix Definitions ---
# a = ((1,1,2),(0,1,1),(0,-3,-2))
# b = ((-2,0,-1),(-5,1,-1),(3,0,1))

A_LIST = [1, 1, 2, 0, 1, 1, 0, -3, -2]
B_LIST = [-2, 0, -1, -5, 1, -1, 3, 0, 1]

# Create matrices
a = fmpz_mat(3, 3, A_LIST)
b = fmpz_mat(3, 3, B_LIST)
identity = fmpz_mat(3, 3, [1,0,0, 0,1,0, 0,0,1])

# Generators and inverses (which are squares in this case)
# We use A (capital) to denote a^-1, and B to denote b^-1.
# Since a^3 = I, a^-1 = a^2.
A = a * a
B = b * b

# Generator map for easy access
# Keys: 'a', 'A', 'b', 'B'
# We will enforce alternating 'a'-type and 'b'-type moves to avoid trivial reductions
# like a.a -> A or a.A -> I.
gens = {
    'a': a,
    'A': A,
    'b': b,
    'B': B
}

# Mapping types to generators
# Type 0: a-like (a, A)
# Type 1: b-like (b, B)
gen_types = {
    'a': 0, 'A': 0,
    'b': 1, 'B': 1
}

# Valid next moves based on previous type
# If prev was 0 (a/A), next must be 1 (b/B)
# If prev was 1 (b/B), next must be 0 (a/A)
moves_map = {
    0: ['b', 'B'],
    1: ['a', 'A'],
    None: ['a', 'A', 'b', 'B'] # Start
}

def score(M):
    """
    L1 norm of M - I. 
    Lower score means closer to identity.
    Exact identity has score 0.
    """
    diff = M - identity
    # entries() returns flat list of fmpz elements
    return sum(abs(int(x)) for x in diff.entries())

def search(beam_width=BEAM_WIDTH, max_depth=MAX_DEPTH):
    
    print(f"Starting Beam Search (Width={beam_width}, MaxDepth={max_depth})...")
    
    # Beam item: (Matrix, word_string, last_type_id)
    # Start with Identity
    # We store the beam as list of tuples
    current_beam = [(identity, "", None)]
    
    known_relations = set()
    best_scores_history = []
    
    for depth in range(1, max_depth + 1):
        candidates = []
        
        for mat, word, last_type in current_beam:
            possible_moves = moves_map[last_type]
            
            # Pruning rules based on (ab)^4 = 1 and (AB)^4 = 1 relations only.
            # (aB) and (Ab) have infinite order, so no pruning for them.
            
            # "abab" -> only "A"
            if word.endswith("a.b.a"):
                 possible_moves = ['B']
            # "ABAB" -> only "a"
            elif word.endswith("A.B.A"):
                 possible_moves = ['b']
            # "baba" -> only "B"
            elif word.endswith("b.a.b"):
                 possible_moves = ['A']
            # "BABA" -> only "b"
            elif word.endswith("B.A.B"):
                 possible_moves = ['a']
            
            for move in possible_moves:
                move_mat = gens[move]
                new_mat = mat * move_mat
                
                # Check for relation
                s = score(new_mat)
                
                new_word_parts = [word, move] if word else [move]
                new_word = ".".join(new_word_parts)
                
                if s == 0:
                    # Found a relation
                    if new_word not in known_relations:
                        print(f"!!! FOUND RELATION [Depth {depth}]: {new_word}")
                        known_relations.add(new_word)
                        # We used to return here, but for analysis we might want to continue?
                        # User request: "Use various beam widths ... Run for 100 iterations..."
                        # Usually finding a relation is a "win". 
                        # But comparing scores implies we want to see the score trajectory.
                        # If a relation is found (score 0), the minimum score is 0.
                        best_scores_history.append((depth, 0))
                        # If we return, we stop collecting data. 
                        # Let's return, assuming finding a relation satisfies the "run".
                        return best_scores_history
                    continue
                
                candidates.append((new_mat, new_word, gen_types[move], s))
        
        # Select best candidates
        
        if not candidates:
            print("Beam died.")
            break
            
        candidates.sort(key=lambda x: x[3]) # Sort by score
        
        # Logging best
        best_cand = candidates[0]
        # print(f"Depth {depth}: Best Score {best_cand[3]} (Word: {best_cand[1]}) | Candidates: {len(candidates)}")
        best_scores_history.append((depth, best_cand[3]))

        # Keep beam width
        current_beam = [(c[0], c[1], c[2]) for c in candidates[:beam_width]]
    
    return best_scores_history

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--width", type=int, default=BEAM_WIDTH)
    parser.add_argument("--depth", type=int, default=MAX_DEPTH)
    args = parser.parse_args()
    
    history = search(args.width, args.depth)
    for depth, s in history:
        print(f"Depth {depth}: Best Score {s}")