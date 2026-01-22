import sys
import os
import math
import heapq
import time
import itertools
from flint import fmpz, fmpz_mat

# Ensure we can import flashbeam
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), 'python/flashBeam')))

from flashbeam import FlashBeam, SearchProblem, Node

def get_quat_mat(a, b, c, d):
    """
    Returns 4x4 integer matrix representing 2*q = a + bi + cj + dk.
    """
    # 1 -> I
    # i -> [[0,-1,0,0],[1,0,0,0],[0,0,0,1],[0,0,-1,0]]
    # j -> [[0,0,-1,0],[0,0,0,-1],[1,0,0,0],[0,1,0,0]]
    # k -> [[0,0,0,1],[0,0,-1,0],[0,1,0,0],[-1,0,0,0]]
    
    # We can construct it directly:
    # q = w + xi + yj + zk
    # M = [[w, -x, -y, -z],
    #      [x,  w, -z,  y],
    #      [y,  z,  w, -x],
    #      [z, -y,  x,  w]]
    # (Matches Wikipedia/standard real rep of quaternions)
    
    m = fmpz_mat(4, 4, [
        a, -b, -c, -d,
        b,  a, -d,  c,
        c,  d,  a, -b,
        d, -c,  b,  a
    ])
    return m

def mat_to_quat_coeffs(mat):
    # a is mat[0,0], b is mat[1,0], c is mat[2,0], d is mat[3,0]
    return (mat[0,0], mat[1,0], mat[2,0], mat[3,0])

def get_mat_content(mat):
    import math
    a, b, c, d = int(mat[0,0]), int(mat[1,0]), int(mat[2,0]), int(mat[3,0])
    g = math.gcd(a, b, c, d)
    if g == 0: return 1
    
    # Check if dividing by g preserves Hurwitz property (same parity)
    if (a//g)%2 == (b//g)%2 == (c//g)%2 == (d//g)%2:
        return g
    else:
        # If it fails, g/2 must work because 2*(q/g) has all even components
        return g // 2

def mat_div(mat, g):
    if g <= 1: return mat
    return fmpz_mat(4, 4, [mat[r,c] // g for r in range(4) for c in range(4)])

class MatrixTargetProblem(SearchProblem):
    def __init__(self, targets):
        # targets: list of (a,b,c,d) tuples (scaled by 2)
        self.found_targets = {}
        
        # Precompute target metrics
        self.target_mats = []
        for t in targets:
            tm = get_quat_mat(*t)
            g = get_mat_content(tm)
            tm = mat_div(tm, g)
            self.target_mats.append(tm)
            
        # Target vectors for dot product
        self.target_vecs = [mat_to_quat_coeffs(tm) for tm in self.target_mats]
        self.target_norms = [int(v[0]**2 + v[1]**2 + v[2]**2 + v[3]**2) for v in self.target_vecs]
        
        # Precompute generator matrices (a=1+2i, b=3+2j)
        ma = get_quat_mat(2, 4, 0, 0)
        mb = get_quat_mat(6, 0, 4, 0)
        mai = get_quat_mat(2, -4, 0, 0)
        mbi = get_quat_mat(6, 0, -4, 0)
        
        self.gens = [(ma, "a"), (mb, "b"), (mai, "ai"), (mbi, "bi")]
        self.generators = []
        for m, name in self.gens:
            self.generators.append(Node(state=m, identifier=name, score=self._calc_score(m)))

    def _canonicalize(self, mat):
        g = get_mat_content(mat)
        return mat_div(mat, g)

    def _calc_score(self, mat):
        m00, m10, m20, m30 = mat[0,0], mat[1,0], mat[2,0], mat[3,0]
        nq_scaled = int(m00*m00 + m10*m10 + m20*m20 + m30*m30)
        if nq_scaled == 0: return float('inf')
        
        best_angular_score = 0
        for i in range(len(self.target_vecs)):
            t0, t1, t2, t3 = self.target_vecs[i]
            dot_scaled = abs(int(m00)*t0 + int(m10)*t1 + int(m20)*t2 + int(m30)*t3)
            nt_scaled = self.target_norms[i]
            
            # angular_score = (dot^2 << 60) // (nq * nt)
            angular_score = (dot_scaled*dot_scaled << 60) // (nq_scaled * nt_scaled)
            if angular_score > best_angular_score:
                best_angular_score = angular_score
                
        dist_scaled = (1 << 60) - best_angular_score
        log_n = nq_scaled.bit_length() * 0.693147
        return float(dist_scaled) / (1 << 50) + 0.1 * log_n

    def get_initial_node(self):
        m = get_quat_mat(2, 0, 0, 0)
        return Node(state=m, identifier="", score=self._calc_score(m))

    def get_generators(self):
        return self.generators

    def combine(self, node_a, node_b):
        # (2*q1) * (2*q2) = 2 * (2*q1q2)
        # So we divide by 2.
        m = mat_div(node_a.state * node_b.state, 2)
        m = self._canonicalize(m)
        
        # Word reduction
        def reduce_word(w):
            tokens = w.split(".")
            stack = []
            inv = {"a":"ai", "ai":"a", "b":"bi", "bi":"b"}
            for t in tokens:
                if not t: continue
                if stack and inv.get(stack[-1]) == t:
                    stack.pop()
                else:
                    stack.append(t)
            return ".".join(stack)

        raw_word = f"{node_a.identifier}.{node_b.identifier}".strip(".")
        new_word = reduce_word(raw_word)
        
        return Node(state=m, identifier=new_word, score=self._calc_score(m))

    def get_hash_key(self, node):
        mat = node.state
        coeffs = (int(mat[0,0]), int(mat[1,0]), int(mat[2,0]), int(mat[3,0]))
        for c in coeffs:
            if c != 0:
                if c < 0: coeffs = tuple(-x for x in coeffs)
                break
        return coeffs

    def is_solution(self, node):
        if not node.identifier: return False
        mat = node.state
        for tm in self.target_mats:
            # Check equality up to sign
            match = True
            for r in range(4):
                if mat[r,0] != tm[r,0]:
                    match = False
                    break
            if not match:
                match = True
                for r in range(4):
                    if mat[r,0] != -tm[r,0]:
                        match = False
                        break
            
            if match:
                t_str = str(mat_to_quat_coeffs(tm))
                if t_str not in self.found_targets:
                    self.found_targets[t_str] = node.identifier
                    print(f"\n[!!!] TARGET REACHED: {t_str} | Word: {node.identifier}")
                    return True

        # Local BFS trigger
        m00, m10, m20, m30 = mat[0,0], mat[1,0], mat[2,0], mat[3,0]
        nq_scaled = m00*m00 + m10*m10 + m20*m20 + m30*m30
        for tm in self.target_mats:
            t00, t10, t20, t30 = tm[0,0], tm[1,0], tm[2,0], tm[3,0]
            dot_scaled = abs(m00*t00 + m10*t10 + m20*t20 + m30*t30)
            nt_scaled = t00*t00 + t10*t10 + t20*t20 + t30*t30
            
            # dot^2 / (nq * nt) > 0.998
            if int(dot_scaled*dot_scaled) * 1000 > int(nq_scaled) * int(nt_scaled) * 998:
                layer = [(mat, node.identifier)]
                for _ in range(2):
                    next_layer = []
                    for curr_m, curr_w in layer:
                        for gen_node in self.generators:
                            nm = mat_div(curr_m * gen_node.state, 2)
                            nm = self._canonicalize(nm)
                            nw = f"{curr_w}.{gen_node.identifier}"
                            
                            # Check nm vs tm
                            match = True
                            for r in range(4):
                                if nm[r,0] != tm[r,0]:
                                    match = False; break
                            if not match:
                                match = True
                                for r in range(4):
                                    if nm[r,0] != -tm[r,0]:
                                        match = False; break
                            
                            if match:
                                t_str = str(mat_to_quat_coeffs(tm))
                                if t_str not in self.found_targets:
                                    self.found_targets[t_str] = nw
                                    print(f"\n[!!!] TARGET REACHED via Local BFS: {t_str} | Word: {nw}")
                                    return True
                            next_layer.append((nm, nw))
                    layer = next_layer
        return False

    def is_nontrivial(self, node): return True
    def format_score(self, node): return f"score={node.score:.4f}"
    def format_state(self, node):
        a,b,c,d = mat_to_quat_coeffs(node.state)
        # Pretty print as (a+bi+cj+dk)/2
        return f"({a} + {b}i + {c}j + {d}k)/2"

def main():
    target_specs = [
        (2, 0, 4, 0), # 1+2j
        (2, 0, 0, 4), # 1+2k
        (6, 0, 4, 0), # 3+2j (b)
        (6, 0, 0, 4), # 3+2k
    ]
    for signs in itertools.product([-1, 1], repeat=3):
        target_specs.append((2, 4*signs[0], 4*signs[1], 4*signs[2]))
        
    problem = MatrixTargetProblem(target_specs)
    
    # Check generators for solutions
    for g in problem.generators:
        problem.is_solution(g)
    
    solver = FlashBeam(
        problem=problem,
        beam_width=20000,
        flash_size=10,
        max_iterations=1000, 
        max_solutions=20
    )
    
    solver.solve()
    
    print("\n" + "="*40)
    print("FINAL SUMMARY")
    print(f"Targets found: {len(problem.found_targets)} / {len(target_specs)}")
    for t_str, word in problem.found_targets.items():
        print(f"Target {t_str}: {word}")
    print("="*40)

if __name__ == "__main__":
    main()
