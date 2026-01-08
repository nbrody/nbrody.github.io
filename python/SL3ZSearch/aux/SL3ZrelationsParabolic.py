import flint
from flint import fmpz, fmpz_mat
import sys
import random

# --- Configuration ---
BEAM_WIDTH = 100000       # Number of best-candidates to keep in each iteration
MAX_DEPTH = 2000          # Maximum depth to search
RANDOM_SAMPLE_RATE = 0.2  # Percentage of beam to fill with random candidates
PRINT_THRESHOLD = 500     # If a beam has a candidate with score less than this, print it

# --- Generator Powers ---
# Use these powers of the base matrices as the generators 'a' and 'b'. Long-Reid group is a=1, b=2
GEN_A_POWER = 1
GEN_B_POWER = 1

# --- Search Ranges ---
# Max power to check for each generator in the moves
# e.g. T_MAX_POWER = 3 means we check t^-3, ..., t^3
T_MAX_POWER = 3
A_MAX_POWER = 6
B_MAX_POWER = 6

# --- Generators Definitions ---
# a = [[0, 1, 0], [1, 0, -1], [0, -1, -1]]
# b = [[-1, 0, -1], [0, 0, 1], [-1, 1, 0]]. b = a^2-2I, so a and b commute (these come from the Dirichlet units of a cyclic cubic field)
# t = [[3, 4, 6], [2, 3, 4], [2, 3, 5]]
MAT_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
MAT_B = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0])
MAT_T = fmpz_mat(3, 3, [-98, 180, -27, -99, 181, -27, -297, 540, -80])

IDENTITY = fmpz_mat(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])

# --- Derived Ranges ---
T_RANGE = range(-T_MAX_POWER, T_MAX_POWER + 1)
A_RANGE = range(-A_MAX_POWER, A_MAX_POWER + 1)
B_RANGE = range(-B_MAX_POWER, B_MAX_POWER + 1)

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
                
            name = f"t^{k}" if k != 1 else "t"
            if k == -1: name = "T"
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
                if x != 0:
                    if x == 1: name_parts.append("a")
                    elif x == -1: name_parts.append("A")
                    else: name_parts.append(f"a^{x}")
                if y != 0:
                    if y == 1: name_parts.append("b")
                    elif y == -1: name_parts.append("B")
                    else: name_parts.append(f"b^{y}")
                
                name = "".join(name_parts)
                self.ab_moves.append((mat, name))
        
        print(f"Initialized with {len(self.t_moves)} T-moves and {len(self.ab_moves)} AB-moves.")

    def score(self, M):
        # L1 norm: sum of absolute values of entries of (M - I)
        diff = M - IDENTITY
        # entries() returns a list of fmpz objects
        return sum(abs(int(x)) for x in diff.entries())

    def is_identity(self, M):
        return M == IDENTITY

    def search(self):
        print(f"Starting Beam Search (Width: {BEAM_WIDTH}, Max Depth: {MAX_DEPTH})...")
        print(f"Random Sample Rate: {RANDOM_SAMPLE_RATE}")
        
        # Beam: list of (matrix, word_string, score, last_type)
        # last_type is 'T' or 'AB'
        
        current_beam = []
        for mat, name in self.t_moves:
            current_beam.append((mat, name, self.score(mat), 'T'))
            
        for depth in range(2, MAX_DEPTH + 1):
            candidates = []
            
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
                    new_score = self.score(new_mat)
                    new_word = word + "." + move_name
                    
                    if new_score == 0:
                        print(f"\n!!! FOUND RELATION !!!")
                        print(f"Word: {new_word}")
                        print(f"Depth: {depth}")
                        return new_word

                    candidates.append((new_mat, new_word, new_score, next_type))
            
            # Selection with Randomness
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
            
            # Logging
            if current_beam:
                # Sort again just for display/consistency of the beam list
                current_beam.sort(key=lambda x: x[2])
                best_score = current_beam[0][2]
                best_mat = current_beam[0][0]
                best_word = current_beam[0][1]
                
                print(f"Depth {depth}: Best Score {best_score} | Beam size {len(current_beam)}")
                
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