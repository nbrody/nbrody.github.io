import flint
from flint import fmpz, fmpz_mat
import sys
import random

# --- Configuration ---
BEAM_WIDTH = 5000       # Number of best-candidates to keep in each iteration
MAX_DEPTH = 2000          # Maximum depth to search
RANDOM_SAMPLE_RATE = 0.2  # Percentage of beam to fill with random candidates
PRINT_THRESHOLD = 500     # If a beam has a candidate with score less than this, print it

# --- Generator Powers ---
# Use these powers of the base matrices as the generators 'a' and 'b'. Long-Reid group is a=1, b=2
GEN_A_POWER = 1
GEN_B_POWER = 2

# --- Search Ranges ---
# Max power to check for each generator in the moves
# e.g. T_MAX_POWER = 3 means we check t^-3, ..., t^3
A_MAX_POWER = 5
B_MAX_POWER = 5
T_MAX_POWER = 2

# --- Generators ---
# a = [[0, 1, 0], [1, 0, -1], [0, -1, -1]]
# b = [[-1, 0, -1], [0, 0, 1], [-1, 1, 0]]. b = a^2-2I, so a and b commute (these come from the Dirichlet units of a cyclic cubic field)
# t = [[3, 4, 6], [2, 3, 4], [2, 3, 5]]
MAT_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
MAT_B = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0])
MAT_T = fmpz_mat(3, 3, [3, 4, 6, 2, 3, 4, 2, 3, 5])

IDENTITY = fmpz_mat(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])

# --- Ranges ---
A_RANGE = range(-A_MAX_POWER, A_MAX_POWER + 1)
B_RANGE = range(-B_MAX_POWER, B_MAX_POWER + 1)
T_RANGE = range(-T_MAX_POWER, T_MAX_POWER + 1)

class RelationSearch:
    def __init__(self):
        # Initialize generators based on configured powers
        
        def get_pow(M, p):
            if p == 0: return IDENTITY
            if p > 0: return M ** p
            return M.inv() ** (-p)

        self.a = get_pow(MAT_A, GEN_A_POWER)
        self.b = get_pow(MAT_B, GEN_B_POWER)
        self.t = MAT_T 
        
        # Compute inverses of the *effective* generators
        self.a_inv = self.a.inv()
        self.b_inv = self.b.inv()
        self.t_inv = self.t.inv()
        
        # Precompute Moves
        print("Precomputing moves...")
        self.t_moves = []
        for k in T_RANGE:
            if k == 0: continue
            
            if k > 0:
                mat = self.t ** k
            else:
                mat = self.t_inv ** (-k)
                
            # Format name using repeated symbols
            count = abs(k)
            symbol = "t" if k > 0 else "ti"
            name = ".".join([symbol] * count)
            self.t_moves.append((mat, name))
            
        self.ab_moves = []
        for x in A_RANGE:
            for y in B_RANGE:
                if x == 0 and y == 0: continue
                
                ax = self.a ** x if x >= 0 else self.a_inv ** (-x)
                by = self.b ** y if y >= 0 else self.b_inv ** (-y)
                
                # a^x b^y
                mat = ax * by
                
                # Format name
                name_parts = []
                
                # Generator A
                if x != 0:
                    count = abs(x * GEN_A_POWER)
                    symbol = "a" if x > 0 else "ai"
                    name_parts.append(".".join([symbol] * count))
                
                # Generator B
                if y != 0:
                    count = abs(y * GEN_B_POWER)
                    symbol = "b" if y > 0 else "bi"
                    name_parts.append(".".join([symbol] * count))
                
                # Join with "." 
                # Note: if both A and B are present, we want e.g. "a.b"
                name = ".".join(name_parts)
                
                # Join with "." as requested for between letters
                name = ".".join(name_parts)
                self.ab_moves.append((mat, name))
        
        print(f"Initialized with {len(self.t_moves)} T-moves and {len(self.ab_moves)} AB-moves.")

    def score(self, M):
        # L1 norm: sum of absolute values of entries of (M - I)
        diff = M - IDENTITY
        # entries() returns a list of fmpz objects
        return sum(abs(int(x)) for x in diff.entries())

    def is_identity(self, M):
        return M == IDENTITY

    def inverse_word(self, word):
        parts = word.split(".")
        inv_parts = []
        for p in reversed(parts):
            if p.endswith("i"):
                inv_parts.append(p[:-1])
            else:
                inv_parts.append(p + "i")
        return ".".join(inv_parts)

    def search(self):
        print(f"Starting Beam Search with Collision Detection (Width: {BEAM_WIDTH}, Max Depth: {MAX_DEPTH})...")
        print(f"Random Sample Rate: {RANDOM_SAMPLE_RATE}")
        
        # Beam: list of (matrix, word_string, score, last_type)
        current_beam = []
        
        # Visited: map tuple(entries_as_int) -> word
        visited = {}
        
        def to_key(M):
            return tuple(int(x) for x in M.entries())
        
        # Initialize with T moves
        for mat, name in self.t_moves:
            # Check identity just in case
            if self.is_identity(mat):
                print(f"Found identity generator: {name}")
                return name
                
            key = to_key(mat)
            visited[key] = name
            current_beam.append((mat, name, self.score(mat), 'T'))
            
        for depth in range(2, MAX_DEPTH + 1):
            candidates = []
            
            # Local visited for this generation to detect collisions within same depth
            # (Optional, but good for removing duplicates in beam)
            layer_seen = set()
            
            for mat, word, _, last_type in current_beam:
                
                # Determine next moves
                if last_type == 'T':
                    next_moves = self.ab_moves
                    next_type = 'AB'
                else:
                    next_moves = self.t_moves
                    next_type = 'T'
                
                for move_mat, move_name in next_moves:
                    new_mat = mat * move_mat
                    new_word = word + "." + move_name
                    
                    # 1. Check strict identity
                    if self.is_identity(new_mat):
                        print(f"\n!!! FOUND RELATION (IDENTITY) !!!")
                        print(f"Word: {new_word}")
                        print(f"Depth: {depth}")
                        return new_word
                    
                    # 2. Check collision with history
                    key = to_key(new_mat)
                    if key in visited:
                        old_word = visited[key]
                        print(f"\n!!! FOUND RELATION (COLLISION) !!!")
                        # relation = word1 * word2^-1
                        relation = new_word + "." + self.inverse_word(old_word)
                        print(f"Collision at depth {depth} against word from earlier/same search.")
                        print(f"Word 1: {new_word}")
                        print(f"Word 2: {old_word}")
                        print(f"Relation: {relation}")
                        return relation
                    
                    # Avoid duplicates in candidates
                    if key in layer_seen:
                        continue
                    layer_seen.add(key)
                    
                    new_score = self.score(new_mat)
                    candidates.append((new_mat, new_word, new_score, next_type))
            
            # Selection with Randomness
            if not candidates:
                print("No more candidates found (dead end?).")
                break
                
            candidates.sort(key=lambda x: x[2])
            
            # Split into best and random pool
            num_best = int(BEAM_WIDTH * (1 - RANDOM_SAMPLE_RATE))
            num_random = BEAM_WIDTH - num_best
            
            best_candidates = candidates[:num_best]
            remaining_candidates = candidates[num_best:]
            
            if len(remaining_candidates) > num_random:
                random_candidates = random.sample(remaining_candidates, num_random)
            else:
                random_candidates = remaining_candidates
                
            current_beam = best_candidates + random_candidates
            
            # Add survivors to visited history
            for mat, w, s, t in current_beam:
                visited[to_key(mat)] = w
            
            # Logging
            if current_beam:
                # Sort again just for display/consistency of the beam list
                current_beam.sort(key=lambda x: x[2])
                best_score = current_beam[0][2]
                best_mat = current_beam[0][0]
                best_word = current_beam[0][1]
                
                print(f"Depth {depth}: Best Score {best_score} | Beam size {len(current_beam)} | Visited size {len(visited)}")
                
                # Print best matrix if below threshold
                if best_score < PRINT_THRESHOLD:
                    print(f"Best Matrix:\n{best_mat}")
                    print(f"Best Word: {best_word}")
            else:
                break
                
        print("Search finished.")

if __name__ == "__main__":
    searcher = RelationSearch()
    searcher.search()