
import flint
from flint import fmpz_mat
import heapq

# --- Configuration ---
BEAM_WIDTH = 10000
MAX_DEPTH = 30
GEN_A_POWER = 1
GEN_B_POWER = 2
T_MAX_POWER = 3
A_MAX_POWER = 3
B_MAX_POWER = 3

# Generators
MAT_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
MAT_B = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0])
MAT_T = fmpz_mat(3, 3, [3, 4, 6, 2, 3, 4, 2, 3, 5])
IDENTITY = fmpz_mat(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])

# Matrix P (Quasi-unipotent)
P = fmpz_mat(3, 3, [172, -311, 46, 116, -210, 31, 139, -253, 37])
P_inv = P.inv()

# Normal vector of the plane stabilized by P^2 (eigenvalue 1 of P^2, -1 of P)
# n = (11, -20, 3)
NORMAL = fmpz_mat(3, 1, [11, -20, 3])

class PlaneStabilizerSearch:
    def __init__(self):
        def get_pow(M, p):
            if p == 0: return IDENTITY
            if p > 0: return M ** p
            return M.inv() ** (-p)

        self.a = get_pow(MAT_A, GEN_A_POWER)
        self.b = get_pow(MAT_B, 1) # Use base generator for consistent naming
        self.t = MAT_T
        
        self.a_inv = self.a.inv()
        self.b_inv = self.b.inv()
        self.t_inv = self.t.inv()

        # Moves
        self.moves = []
        # T moves
        for k in range(-T_MAX_POWER, T_MAX_POWER + 1):
            if k == 0: continue
            mat = self.t ** k if k > 0 else self.t_inv ** (-k)
            name = "t" if k > 0 else "ti"
            self.moves.append((mat, ".".join([name]*abs(k))))

        # A moves
        for k in range(-A_MAX_POWER, A_MAX_POWER + 1):
            if k == 0: continue
            mat = self.a ** k if k > 0 else self.a_inv ** (-k)
            name = "a" if k > 0 else "ai"
            self.moves.append((mat, ".".join([name]*abs(k))))
            
        # B moves (Only even powers of b)
        step = GEN_B_POWER
        # We want to iterate multiples of 'step' within a reasonable range
        # Let's say we want to reach equivalent magnitude of B_MAX_POWER in terms of steps
        limit = B_MAX_POWER * step 
        for k in range(-limit, limit + 1):
            if k == 0: continue
            if k % step != 0: continue # Only allow multiples of GEN_B_POWER (=2)
            
            mat = self.b ** k if k > 0 else self.b_inv ** (-k)
            name = "b" if k > 0 else "bi"
            self.moves.append((mat, ".".join([name]*abs(k))))
            
        print(f"Initialized with {len(self.moves)} moves.")

    def score(self, M):
        # We want M^T * n to be parallel to n.
        # Let v = M^T * n.
        # We minimize || v x n || (L1 norm of cross product)
        # v = [v0, v1, v2]. n = [n0, n1, n2].
        # Cross product:
        # c0 = v1*n2 - v2*n1
        # c1 = v2*n0 - v0*n2
        # c2 = v0*n1 - v1*n0
        
        MT = M.transpose()
        v = MT * NORMAL
        v0, v1, v2 = int(v[0,0]), int(v[1,0]), int(v[2,0])
        n0, n1, n2 = 11, -20, 3
        
        c0 = v1*n2 - v2*n1
        c1 = v2*n0 - v0*n2
        c2 = v0*n1 - v1*n0
        
        return abs(c0) + abs(c1) + abs(c2)

    def search(self):
        print("Searching for elements in the stabilizer of the plane 11x - 20y + 3z = 0...")
        
        # Beam: (score, mat, word)
        beam = [(0, IDENTITY, "")]
        seen = set()
        
        best_commutator_score = float('inf')

        for depth in range(1, MAX_DEPTH + 1):
            candidates = []
            
            for score_prev, mat, word in beam:
                for move_mat, move_name in self.moves:
                    new_mat = mat * move_mat
                    # Simple dedup
                    fp = tuple(int(x) for x in new_mat.entries())
                    if fp in seen:
                        continue
                    seen.add(fp)
                    
                    new_word = (word + "." + move_name).strip(".")
                    
                    # Calculate stabilizer drift
                    s = self.score(new_mat)
                    
                    # If score is 0, we found a stabilizer element!
                    if s == 0:
                        if new_mat == IDENTITY:
                            continue
                        if new_mat == P_inv:
                            # print(f"Skipping inverse of P: {new_word}")
                            continue
                        if new_mat == P:
                             continue

                        print(f"\n!!! FOUND STABILIZER ELEMENT !!!")
                        print(f"Word Q: {new_word}")
                        
                        # Check commutator [P, Q]
                        C = P * new_mat * P_inv * new_mat.inv()
                        if C == IDENTITY:
                             print(f"RELATION FOUND: [P, Q] = I")
                             return

                        # Check commutator [P, QPQ^-1]
                        # Let P' = Q * P * Q^-1
                        P_prime = new_mat * P * new_mat.inv()
                        Rel = P * P_prime * P_inv * P_prime.inv()
                        if Rel == IDENTITY:
                             print(f"RELATION FOUND: [P, QPQ^-1] = I")
                             print(f"This implies P and P' commute.")
                             print(f"Q word: {new_word}")
                             return

                        # Check commutator [P^2, Q P^2 Q^-1]
                        # Let P2' = Q * P^2 * Q^-1
                        # Note: P2 acts as Identity on the plane. Q preserves the plane.
                        # So P2' also acts as Identity on the plane.
                        # Two generalized transvections sharing the same plane might commute.
                        P2 = P * P
                        P2_inv = P_inv * P_inv
                        P2_prime = new_mat * P2 * new_mat.inv()
                        Rel2 = P2 * P2_prime * P2_inv * P2_prime.inv()
                        
                        if Rel2 == IDENTITY:
                             print(f"RELATION FOUND: [P^2, Q P^2 Q^-1] = I")
                             print(f"Q word: {new_word}")
                             return

                        # Check if C is simple (small trace?)
                        # C might be fmpq_mat, so manual trace
                        tr_val = C[0,0] + C[1,1] + C[2,2]
                        try:
                            tr = int(tr_val)
                        except:
                            tr = float(tr_val) # Fallback if not integer (shouldn't happen for SL3Z)
                        
                        print(f"Trace([P, Q]): {tr}")
                        if tr == 3: # Unipotent!
                            print("--> [P, Q] is UNIPOTENT (likely a transvection)")

                    candidates.append((s, new_mat, new_word))
            
            # Sort and prune
            candidates.sort(key=lambda x: x[0])
            beam = candidates[:BEAM_WIDTH]
            
            if not beam:
                break
                
            print(f"Depth {depth}: Best Drift {beam[0][0]} | Beam {len(beam)}")
            if beam[0][0] == 0:
                 print(f"Best: {beam[0][2]}")

if __name__ == "__main__":
    PlaneStabilizerSearch().search()
