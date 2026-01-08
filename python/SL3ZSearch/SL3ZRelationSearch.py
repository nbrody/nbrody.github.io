
import flint
from flint import fmpz_mat
import math
import sys

# --- Configuration ---
BEAM_WIDTH_PHASE_1 = 2000    # Initial search for P
BEAM_WIDTH_PHASE_2 = 10000   # Search for Q (stabilizer)
MAX_DEPTH_PHASE_1 = 50
MAX_DEPTH_PHASE_2 = 50

# Generators 
MAT_A = fmpz_mat(3, 3, [0,  1,  0, 
                        1,  0, -1, 
                        0, -1, -1])

MAT_B = fmpz_mat(3, 3, [-1, 0, -1,
                         0, 0,  1, 
                        -1, 1,  0])

MAT_T = fmpz_mat(3, 3, [3, 4, 6, 
                        2, 3, 4, 
                        2, 3, 5])

IDENTITY = fmpz_mat(3, 3, [1, 0, 0, 
                           0, 1, 0, 
                           0, 0, 1])

GEN_A = MAT_A 
GEN_B2 = MAT_B ** 2
GEN_T = MAT_T

# Inverse generators
GEN_A_INV = GEN_A.inv()
GEN_B2_INV = GEN_B2.inv()
GEN_T_INV = GEN_T.inv()

MOVES = [
    (GEN_A, "a"),
    (GEN_A_INV, "ai"),
    (GEN_B2, "b.b"),      # "b.b" denotes b^2 (consistent with w=t.a.b.b...)
    (GEN_B2_INV, "bi.bi"), 
    (GEN_T, "t"),
    (GEN_T_INV, "ti")
]

class FullWorkflowSearch:
    def __init__(self):
        print("Initialized Full Workflow Search")
        print("Generators: <a, b^2, t>")

    def get_charpoly_coefs(self, M):
        # Returns [c0, c1, c2, c3] for c3*x^3 + ... + c0
        cp = M.charpoly()
        return [int(cp[i]) for i in range(4)]

    def is_unipotent(self, M):
        # Characteristic polynomial is (x-1)^3 = x^3 - 3x^2 + 3x - 1
        # Coeffs: [-1, 3, -3, 1]
        coeffs = self.get_charpoly_coefs(M)
        return coeffs == [-1, 3, -3, 1]

    def is_quasi_unipotent(self, M):
        # We look for M such that M^2 is unipotent (but M is not necessarily)
        M2 = M * M
        if M2 == IDENTITY:
            return False 
        return self.is_unipotent(M2)

    def solve_kernel_P2_minus_I(self, P2):
        # Find the plane stabilized by P2.
        # Solve (P2 - I) v = 0.
        diff = P2 - IDENTITY
        
        for i in range(3):
            # Casting to int handles potential fmpq types from inverses
            row = [int(diff[i, 0]), int(diff[i, 1]), int(diff[i, 2])]
            if any(x != 0 for x in row):
                # Found a non-zero row. This defines the constraint n.v = 0
                # Normalize via GCD for simpler arithmetic
                g = math.gcd(row[0], math.gcd(row[1], row[2]))
                if g > 1:
                    row = [x // g for x in row]
                return fmpz_mat(3, 1, row)
        return None

    def search_phase_1(self):
        print("\n--- PHASE 1: Searching for Quasi-Unipotent element P ---")
        
        beam = [(0, IDENTITY, "")]
        seen = set()
        
        for depth in range(1, MAX_DEPTH_PHASE_1 + 1):
            candidates = []
            for _, mat, word in beam:
                for move_mat, move_name in MOVES:
                    new_mat = mat * move_mat
                    
                    # Dedup
                    fp = tuple(int(x) for x in new_mat.entries())
                    if fp in seen: continue
                    seen.add(fp)
                    
                    new_word = (word + "." + move_name).strip(".")
                    
                    if self.is_quasi_unipotent(new_mat):
                        print(f"!!! FOUND QUASI-UNIPOTENT P at depth {depth} !!!")
                        print(f"Word: {new_word}")
                        # Check "quality" of P (e.g. rank of P^2 - I)
                        P2 = new_mat * new_mat
                        n = self.solve_kernel_P2_minus_I(P2)
                        if n is not None:
                            print(f"P^2 fixes a plane with normal: {n.transpose()}")
                            return (new_mat, new_word, n)
                    
                    # Score for beam: absolute trace closer to 0?
                    # trace can be neg, so abs(trace).
                    tr_val = new_mat[0,0] + new_mat[1,1] + new_mat[2,2]
                    tr = abs(int(tr_val))
                    candidates.append((tr, new_mat, new_word))
            
            candidates.sort(key=lambda x: x[0])
            beam = candidates[:BEAM_WIDTH_PHASE_1]
            print(f"Phase 1 Depth {depth}: Beam size {len(beam)}, Best trace {beam[0][0]}")

        return None

    def score_phase_2(self, M, n):
        # Stabilizer score: |(M^T n) x n|
        MT = M.transpose()
        v = MT * n
        # Cast to int to handle potential fmpq types safely
        v0, v1, v2 = int(v[0,0]), int(v[1,0]), int(v[2,0])
        n0, n1, n2 = int(n[0,0]), int(n[1,0]), int(n[2,0])

        c0 = v1*n2 - v2*n1
        c1 = v2*n0 - v0*n2
        c2 = v0*n1 - v1*n0
        return abs(c0) + abs(c1) + abs(c2)

    def search_phase_2(self, P, P_word, n):
        print(f"\n--- PHASE 2: Searching for Stabilizer Q for plane fixed by P^2 ---")
        print(f"P word: {P_word}")
        print(f"Normal vector n: {n.transpose()}")
        
        P_inv = P.inv()
        P2 = P * P
        P2_inv = P2.inv()
        
        beam = [(0, IDENTITY, "")]
        seen = set()
        
        for depth in range(1, MAX_DEPTH_PHASE_2 + 1):
            candidates = []
            for _, mat, word in beam:
                for move_mat, move_name in MOVES:
                    new_mat = mat * move_mat
                    
                    fp = tuple(int(x) for x in new_mat.entries())
                    if fp in seen: continue
                    seen.add(fp)
                    
                    new_word = (word + "." + move_name).strip(".")
                    
                    # Calculate stabilizer score
                    s = self.score_phase_2(new_mat, n)
                    
                    if s == 0:
                        # Q found. Check relations.
                        if new_mat == IDENTITY or new_mat == P or new_mat == P_inv:
                            continue
                        
                        Q = new_mat
                        Q_inv = Q.inv()
                        
                        # Relation 1: [P^2, Q P^2 Q^-1]
                        # Let P2' = Q * P^2 * Q^-1
                        P2_prime = Q * P2 * Q_inv
                        Comm1 = P2 * P2_prime * P2_inv * P2_prime.inv()
                        
                        if Comm1 == IDENTITY:
                            print(f"\n!!!!!! RELATION FOUND !!!!!!")
                            print(f"Type: [P^2, Q P^2 Q^-1] = I")
                            print(f"P = {P_word}")
                            print(f"Q = {new_word}")
                            return True

                        # Relation 2: [P, Q P Q^-1]
                        # P_prime = Q * P * Q^-1
                        P_prime = Q * P * Q_inv
                        Comm2 = P * P_prime * P_inv * P_prime.inv()
                        
                        if Comm2 == IDENTITY:
                            print(f"\n!!!!!! RELATION FOUND !!!!!!")
                            print(f"Type: [P, Q P Q^-1] = I")
                            print(f"P = {P_word}")
                            print(f"Q = {new_word}")
                            return True
                            
                        # Relation 3: [P, Q]
                        Comm3 = P * Q * P_inv * Q_inv
                        if Comm3 == IDENTITY:
                            print(f"\n!!!!!! RELATION FOUND !!!!!!")
                            print(f"Type: [P, Q] = I")
                            print(f"P = {P_word}")
                            print(f"Q = {new_word}")
                            return True
                            
                    candidates.append((s, new_mat, new_word))
            
            candidates.sort(key=lambda x: x[0])
            beam = candidates[:BEAM_WIDTH_PHASE_2]
            
            best_s = beam[0][0] if beam else -1
            print(f"Phase 2 Depth {depth}: Beam size {len(beam)}, Best drift {best_s}")
            
            if not beam:
                print("Beam empty.")
                break
                
        return False

    def run(self):
        result = self.search_phase_1()
        if not result:
            print("Phase 1 failed to find a quasi-unipotent element.")
            return
        
        P, P_word, n = result
        found_rel = self.search_phase_2(P, P_word, n)
        if not found_rel:
            print("Phase 2 failed to find a relation.")

if __name__ == "__main__":
    FullWorkflowSearch().run()
