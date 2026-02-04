import sys
import os
import time
import heapq
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple, Any, Set
try:
    from flint import fmpz_poly, ctx
    ctx.pretty = True
except ImportError:
    # Fallback or error handled elsewhere
    pass

@dataclass
class Node:
    state: Any  # Matrix of fmpz_poly
    identifier: str # Word string
    score: float
    
    def __hash__(self):
        return hash(self.identifier)

class SanovProblem:
    def __init__(self):
        # Generators for <A, B> in PSL_2(Z[t])
        t_poly = fmpz_poly([0, 1]) # 0 + 1*t
        one = fmpz_poly([1])
        zero = fmpz_poly([])
        
        self.A = (one, t_poly, zero, one)
        self.Ai = (one, -t_poly, zero, one)
        self.B = (one, zero, t_poly, one)
        self.Bi = (one, zero, -t_poly, one)
        
        self.generators = [
            ('A', self.A),
            ('Ai', self.Ai),
            ('B', self.B),
            ('Bi', self.Bi)
        ]
        
        # Sample points to evaluate the score
        # We sample points inside the disk |z| < 2
        # A good set of points are some roots of unity or random points
        self.sample_points = []
        for r in [0.5, 1.0, 1.5, 1.9]:
            for theta in np.linspace(0, 2*np.pi, 8, endpoint=False):
                self.sample_points.append(complex(r * np.cos(theta), r * np.sin(theta)))
        # Add 0
        self.sample_points.append(0j)

    def get_initial_node(self) -> Node:
        one = fmpz_poly([1])
        zero = fmpz_poly([])
        ident = (one, zero, zero, one)
        return Node(ident, "", 1e10) # Identity has high score because it's trivial

    def get_generator_nodes(self) -> List[Node]:
        nodes = []
        for name, mat in self.generators:
            nodes.append(Node(mat, name, self.calculate_score(mat)))
        return nodes

    def combine(self, node_a: Node, node_b: Node) -> Node:
        # Matrix multiplication
        a1, b1, c1, d1 = node_a.state
        a2, b2, c2, d2 = node_b.state
        
        a = a1*a2 + b1*c2
        b = a1*b2 + b1*d2
        c = c1*a2 + d1*c2
        d = c1*b2 + d1*d2
        
        new_state = (a, b, c, d)
        new_id = (node_a.identifier + " " + node_b.identifier).strip().replace("  ", " ")
        return Node(new_state, new_id, self.calculate_score(new_state))

    def calculate_score(self, matrix: Tuple) -> float:
        # Score is min of sum of squares of entries (shifted) over sample points
        # Target is I: a=1, b=0, c=0, d=1
        # In words, we want at least ONE z such that W(z) is close to I.
        # So we take the MIN over sample points.
        a, b, c, d = matrix
        
        min_dist = 1e20
        for z in self.sample_points:
            # Evaluate polynomials at z
            try:
                # flint's __call__ or evaluate?
                # Polynomials are fmpz_poly. We can't evaluate directly at complex.
                # Use numpy or manual evaluation.
                va = self.eval_poly(a, z)
                vb = self.eval_poly(b, z)
                vc = self.eval_poly(c, z)
                vd = self.eval_poly(d, z)
                
                # Check distance to I and -I
                d_pos = abs(va - 1)**2 + abs(vb)**2 + abs(vc)**2 + abs(vd - 1)**2
                d_neg = abs(va + 1)**2 + abs(vb)**2 + abs(vc)**2 + abs(vd + 1)**2
                dist = min(d_pos, d_neg)
                if dist < min_dist:
                    min_dist = dist
            except:
                continue
        return float(np.sqrt(min_dist))

    def eval_poly(self, p: fmpz_poly, z: complex) -> complex:
        coeffs = p.coeffs()
        res = 0j
        for i, c in enumerate(coeffs):
            res += int(c) * (z ** i)
        return res

    def get_hash_key(self, node: Node) -> str:
        # String representation of the matrix polynomials
        return str(node.state)

    def is_solution(self, node: Node) -> bool:
        # A word is a solution if its relation polynomial is non-trivial (degree > 0)
        # OR if it's very close to identity at some sample point (maybe?)
        # Let's check the GCD of entries exactly.
        a, b, c, d = node.state
        p1 = a - 1
        p2 = b
        p3 = c
        p4 = d - 1
        
        # Case 2: -I
        p1n = a + 1
        p4n = d + 1
        
        g1 = p1.gcd(p2).gcd(p3).gcd(p4)
        g2 = p1n.gcd(p2).gcd(p3).gcd(p4n)
        
        return g1.degree() > 0 or g2.degree() > 0

    def get_relation_polynomial(self, node: Node) -> fmpz_poly:
        a, b, c, d = node.state
        g1 = (a-1).gcd(b).gcd(c).gcd(d-1)
        g2 = (a+1).gcd(b).gcd(c).gcd(d+1)
        
        if g1.degree() > 0: return g1
        if g2.degree() > 0: return g2
        return fmpz_poly([])

    def is_nontrivial(self, node: Node) -> bool:
        # Avoid empty word
        return len(node.identifier) > 0

    def format_score(self, node: Node) -> str:
        return f"{node.score:.4f}"

class ModularSanovProblem:
    def __init__(self, p: fmpz_poly):
        self.p = p
        t_poly = fmpz_poly([0, 1])
        one = fmpz_poly([1])
        zero = fmpz_poly([])
        
        # Matrices mod p
        self.A = (one, t_poly % p, zero, one)
        self.Ai = (one, (-t_poly) % p, zero, one)
        self.B = (one, zero, t_poly % p, one)
        self.Bi = (one, zero, (-t_poly) % p, one)
        
        self.generators = [
            ('A', self.A),
            ('Ai', self.Ai),
            ('B', self.B),
            ('Bi', self.Bi)
        ]

    def get_initial_node(self) -> Node:
        one = fmpz_poly([1])
        zero = fmpz_poly([])
        return Node((one, zero, zero, one), "", 10.0)

    def get_generator_nodes(self) -> List[Node]:
        nodes = []
        for name, mat in self.generators:
            nodes.append(Node(mat, name, self.calculate_score(mat)))
        return nodes

    def combine(self, node_a: Node, node_b: Node) -> Node:
        a1, b1, c1, d1 = node_a.state
        a2, b2, c2, d2 = node_b.state
        
        # Multiply and reduce
        a = (a1*a2 + b1*c2) % self.p
        b = (a1*b2 + b1*d2) % self.p
        c = (c1*a2 + d1*c2) % self.p
        d = (c1*b2 + d1*d2) % self.p
        
        new_state = (a, b, c, d)
        new_id = (node_a.identifier + " " + node_b.identifier).strip().replace("  ", " ")
        return Node(new_state, new_id, self.calculate_score(new_state))

    def calculate_score(self, matrix: Tuple) -> float:
        a, b, c, d = matrix
        # Distance to I mod Z
        # We want the coefficients of b, c, a-1, d-1 to be small
        # Actually in SL2(Z[t]/p), we just want them to be 0!
        # But for scoring, L1 norm of coefficients is good.
        score = 0
        for poly in [b, c]:
            score += sum(abs(int(x)) for x in poly.coeffs())
        # Diagonals: either a=1, d=1 OR a=-1, d=-1
        s1 = sum(abs(int(x)) for x in (a-1).coeffs()) + sum(abs(int(x)) for x in (d-1).coeffs())
        s2 = sum(abs(int(x)) for x in (a+1).coeffs()) + sum(abs(int(x)) for x in (d+1).coeffs())
        return float(score + min(s1, s2))

    def get_hash_key(self, node: Node) -> str:
        return str(node.state)

    def is_solution(self, node: Node) -> bool:
        a, b, c, d = node.state
        # Matrix is I or -I mod p
        if b.is_zero() and c.is_zero():
            if (a-1).is_zero() and (d-1).is_zero(): return True
            if (a+1).is_zero() and (d+1).is_zero(): return True
        return False

    def is_nontrivial(self, node: Node) -> bool:
        # Heuristic: word length > 2
        return len(node.identifier.split()) > 2
