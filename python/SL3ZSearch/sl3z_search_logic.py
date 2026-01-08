
import flint
from flint import fmpz_mat
import math

class SL3ZSearchLogic:
    def __init__(self, config=None):
        # Configuration with defaults
        self.BEAM_WIDTH_PHASE_1 = config.get('BEAM_WIDTH_PHASE_1', 2000) if config else 2000
        self.BEAM_WIDTH_PHASE_2 = config.get('BEAM_WIDTH_PHASE_2', 10000) if config else 10000
        self.MAX_DEPTH_PHASE_1 = config.get('MAX_DEPTH_PHASE_1', 50) if config else 50
        self.MAX_DEPTH_PHASE_2 = config.get('MAX_DEPTH_PHASE_2', 50) if config else 50
        
        self.GEN_A_POWER = config.get('GEN_A_POWER', 1) if config else 1
        self.GEN_B_POWER = config.get('GEN_B_POWER', 2) if config else 2
        self.T_MODIFIERS = config.get('T_MODIFIERS', "") if config else ""
        self.POLY_CHOICE = config.get('POLY_CHOICE', 'default') if config else 'default'

        # Initialize Generators
        self._init_generators()

    def _init_generators(self):
        # 1. Define Standard Symmetric Matrices (for a=-1 case)
        SYM_A = fmpz_mat(3, 3, [0, 1, 0, 1, 0, -1, 0, -1, -1])
        SYM_B = fmpz_mat(3, 3, [-1, 0, -1, 0, 0, 1, -1, 1, 0]) # Note: B = A^2 - 2I
        
        # 2. Define Helper for Shanks Component Matrices
        # S_a(x) = x^3 - a x^2 - (a+3)x - 1
        # Companion C = [[0,1,0],[0,0,1],[1, a+3, a]]
        def get_shanks_generators(a):
            C = fmpz_mat(3, 3, [0, 1, 0, 0, 0, 1, 1, a+3, a])
            return C, (C*C) - (fmpz_mat(3,3,[1,0,0,0,1,0,0,0,1]) * 2)

        # 3. Select based on choice
        if self.POLY_CHOICE == 'default':
            MAT_A = SYM_A
            MAT_B = SYM_B
        elif self.POLY_CHOICE == 'shanks_m1':
            # a = -1 -> x^3 + x^2 - 2x - 1
            MAT_A, MAT_B = get_shanks_generators(-1)
        elif self.POLY_CHOICE == 'shanks_0':
            # a = 0 -> x^3 - 3x - 1
            MAT_A, MAT_B = get_shanks_generators(0)
        elif self.POLY_CHOICE == 'shanks_1':
            # a = 1 -> x^3 - x^2 - 4x - 1
            MAT_A, MAT_B = get_shanks_generators(1)
        elif self.POLY_CHOICE == 'shanks_2':
             # a = 2 -> x^3 - 2x^2 - 5x - 1
            MAT_A, MAT_B = get_shanks_generators(2)
        else:
            # Fallback
            MAT_A = SYM_A
            MAT_B = SYM_B

        MAT_T_BASE = fmpz_mat(3, 3, [3, 4, 6, 
                                     2, 3, 4, 
                                     2, 3, 5])

        self.IDENTITY = fmpz_mat(3, 3, [1, 0, 0, 
                                        0, 1, 0, 
                                        0, 0, 1])
                                        
        # Apply T modifiers if any
        # Format: "12:1, 23:-1" -> E_12(1), E_23(-1) applied to T
        current_t = MAT_T_BASE
        if self.T_MODIFIERS:
            import re
            # Split by comma
            mods = self.T_MODIFIERS.split(',')
            for mod in mods:
                mod = mod.strip()
                if not mod: continue
                # Parse "12:1" or "1 2 1"
                # Regex for i, j, k
                # i, j are 1-3. k is int.
                match = re.search(r'(\d)(\d)\s*[:\s]\s*(-?\d+)', mod)
                if match:
                    i, j, k = int(match.group(1)), int(match.group(2)), int(match.group(3))
                    if 1 <= i <= 3 and 1 <= j <= 3 and i != j:
                         # Construct E_ij(k)
                         E = fmpz_mat(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])
                         E[i-1, j-1] = k
                         # Apply on Left
                         current_t = E * current_t
        
        MAT_T = current_t

        # We use effective generators based on powers
        GEN_A = MAT_A ** self.GEN_A_POWER
        GEN_B = MAT_B ** self.GEN_B_POWER
        GEN_T = MAT_T

        # Inverse generators
        GEN_A_INV = GEN_A.inv()
        GEN_B_INV = GEN_B.inv()
        GEN_T_INV = GEN_T.inv()
        
        # Dynamic naming
        name_a = ".".join(["a"] * self.GEN_A_POWER) if self.GEN_A_POWER > 0 else "a"
        name_ai = ".".join(["ai"] * self.GEN_A_POWER) if self.GEN_A_POWER > 0 else "ai"
        
        name_b = ".".join(["b"] * self.GEN_B_POWER) if self.GEN_B_POWER > 0 else "b"
        name_bi = ".".join(["bi"] * self.GEN_B_POWER) if self.GEN_B_POWER > 0 else "bi"

        self.MOVES = [
            (GEN_A, name_a),
            (GEN_A_INV, name_ai),
            (GEN_B, name_b),
            (GEN_B_INV, name_bi), 
            (GEN_T, "t"),
            (GEN_T_INV, "ti")
        ]

    def get_charpoly_coefs(self, M):
        cp = M.charpoly()
        return [int(cp[i]) for i in range(4)]

    def is_unipotent(self, M):
        # Characteristic polynomial is (x-1)^3 = x^3 - 3x^2 + 3x - 1
        coeffs = self.get_charpoly_coefs(M)
        return coeffs == [-1, 3, -3, 1]

    def is_quasi_unipotent(self, M):
        M2 = M * M
        if M2 == self.IDENTITY:
            return False 
        return self.is_unipotent(M2)

    def solve_kernel_P2_minus_I(self, P2):
        diff = P2 - self.IDENTITY
        for i in range(3):
            row = [int(diff[i, 0]), int(diff[i, 1]), int(diff[i, 2])]
            if any(x != 0 for x in row):
                g = math.gcd(row[0], math.gcd(row[1], row[2]))
                if g > 1:
                    row = [x // g for x in row]
                return fmpz_mat(3, 1, row)
        return None

    def search_phase_1(self):
        yield {"type": "info", "message": "--- PHASE 1: Searching for Quasi-Unipotent element P ---"}
        
        beam = [(0, self.IDENTITY, "")]
        seen = set()
        
        for depth in range(1, self.MAX_DEPTH_PHASE_1 + 1):
            candidates = []
            for _, mat, word in beam:
                for move_mat, move_name in self.MOVES:
                    new_mat = mat * move_mat
                    
                    fp = tuple(int(x) for x in new_mat.entries())
                    if fp in seen: continue
                    seen.add(fp)
                    
                    new_word = (word + "." + move_name).strip(".")
                    
                    if self.is_quasi_unipotent(new_mat):
                        yield {"type": "success", "message": f"!!! FOUND QUASI-UNIPOTENT P at depth {depth} !!!"}
                        yield {"type": "P_found", "word": new_word}
                        
                        P2 = new_mat * new_mat
                        n = self.solve_kernel_P2_minus_I(P2)
                        if n is not None:
                            n_list = [int(n[0,0]), int(n[1,0]), int(n[2,0])]
                            yield {"type": "info", "message": f"P^2 fixes a plane with normal: {n_list}"}
                            yield {"type": "result_phase_1", "data": (new_mat, new_word, n)}
                            return
                    
                    tr_val = new_mat[0,0] + new_mat[1,1] + new_mat[2,2]
                    tr = abs(int(tr_val))
                    candidates.append((tr, new_mat, new_word))
            
            candidates.sort(key=lambda x: x[0])
            beam = candidates[:self.BEAM_WIDTH_PHASE_1]
            yield {"type": "progress", "phase": 1, "depth": depth, "beam_size": len(beam), "best_metric": beam[0][0]}
        
        yield {"type": "error", "message": "Phase 1 failed to find a quasi-unipotent element."}

    def score_phase_2(self, M, n):
        MT = M.transpose()
        v = MT * n
        v0, v1, v2 = int(v[0,0]), int(v[1,0]), int(v[2,0])
        n0, n1, n2 = int(n[0,0]), int(n[1,0]), int(n[2,0])

        c0 = v1*n2 - v2*n1
        c1 = v2*n0 - v0*n2
        c2 = v0*n1 - v1*n0
        return abs(c0) + abs(c1) + abs(c2)

    def search_phase_2(self, P, P_word, n):
        n_list = [int(n[0,0]), int(n[1,0]), int(n[2,0])]
        yield {"type": "info", "message": "--- PHASE 2: Searching for Stabilizer Q ---"}
        yield {"type": "info", "message": f"P word: {P_word}"}
        yield {"type": "info", "message": f"Normal vector n: {n_list}"}
        
        P_inv = P.inv()
        P2 = P * P
        P2_inv = P2.inv()
        
        beam = [(0, self.IDENTITY, "")]
        seen = set()
        
        for depth in range(1, self.MAX_DEPTH_PHASE_2 + 1):
            candidates = []
            for _, mat, word in beam:
                for move_mat, move_name in self.MOVES:
                    new_mat = mat * move_mat
                    
                    fp = tuple(int(x) for x in new_mat.entries())
                    if fp in seen: continue
                    seen.add(fp)
                    
                    new_word = (word + "." + move_name).strip(".")
                    
                    s = self.score_phase_2(new_mat, n)
                    
                    if s == 0:
                        if new_mat == self.IDENTITY or new_mat == P or new_mat == P_inv:
                            continue
                        
                        Q = new_mat
                        Q_inv = Q.inv()
                        
                        # Relation 1
                        P2_prime = Q * P2 * Q_inv
                        Comm1 = P2 * P2_prime * P2_inv * P2_prime.inv()
                        if Comm1 == self.IDENTITY:
                            yield {"type": "relation_found", "kind": "[P^2, Q P^2 Q^-1] = I", "P": P_word, "Q": new_word}
                            return True

                        # Relation 2
                        P_prime = Q * P * Q_inv
                        Comm2 = P * P_prime * P_inv * P_prime.inv()
                        if Comm2 == self.IDENTITY:
                            yield {"type": "relation_found", "kind": "[P, Q P Q^-1] = I", "P": P_word, "Q": new_word}
                            return True
                            
                        # Relation 3
                        Comm3 = P * Q * P_inv * Q_inv
                        if Comm3 == self.IDENTITY:
                            yield {"type": "relation_found", "kind": "[P, Q] = I", "P": P_word, "Q": new_word}
                            return True
                            
                    candidates.append((s, new_mat, new_word))
            
            candidates.sort(key=lambda x: x[0])
            beam = candidates[:self.BEAM_WIDTH_PHASE_2]
            
            best_s = beam[0][0] if beam else -1
            yield {"type": "progress", "phase": 2, "depth": depth, "beam_size": len(beam), "best_metric": best_s}
            
            if not beam:
                yield {"type": "error", "message": "Beam empty in Phase 2."}
                break
                
        yield {"type": "error", "message": "Phase 2 failed to find a relation."}

    def run(self):
        # Generator that yields events
        # Run Phase 1
        p_result = None
        for event in self.search_phase_1():
            if event["type"] == "result_phase_1":
                p_result = event["data"]
            else:
                yield event
        
        if not p_result:
            return
        
        P, P_word, n = p_result
        
        # Run Phase 2
        for event in self.search_phase_2(P, P_word, n):
            yield event
