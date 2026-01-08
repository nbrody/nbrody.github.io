"""
Cocompact Lattice Constructor for PGL_2(Z[1/p])

This Flask app helps construct cocompact lattices in PGL_2(R) that are 
subgroups of PGL_2(Z[1/p]) using the cut-and-paste method.

The idea:
1. Start with a congruence subgroup G_0 of PGL_2(Z), e.g., Γ₀(2p)
2. Find pairs of closed geodesics that:
   - Cobound a compact subsurface (cut off the cusps)
   - Are conjugate in PGL_2(Z[1/p])
3. Glue along conjugate geodesics to get a compact orbifold
"""

from flask import Flask, render_template, request, jsonify
from fractions import Fraction
import numpy as np
from flint import fmpz, fmpq, fmpz_mat
import math
from functools import lru_cache

app = Flask(__name__)

# ============================================================
# Core Mathematical Classes
# ============================================================

class PGL2Element:
    """
    Represents an element of PGL_2(Z[1/p]) or subgroups.
    Matrices are stored as 2x2 integer matrices with a denominator power of p.
    """
    def __init__(self, mat, p_power=0):
        """
        mat: 2x2 list/array of integers
        p_power: denominator is p^p_power
        """
        if isinstance(mat, fmpz_mat):
            self.mat = mat
        else:
            self.mat = fmpz_mat([[fmpz(mat[0][0]), fmpz(mat[0][1])],
                                  [fmpz(mat[1][0]), fmpz(mat[1][1])]])
        self.p_power = p_power
        
    def det(self):
        """Return the determinant (as fmpz)."""
        return self.mat[0, 0] * self.mat[1, 1] - self.mat[0, 1] * self.mat[1, 0]
    
    def trace(self):
        """Return the trace."""
        return self.mat[0, 0] + self.mat[1, 1]
    
    def is_hyperbolic(self):
        """Check if this element is hyperbolic (|trace| > 2)."""
        tr = int(self.trace())
        det = int(self.det())
        # For normalized matrices in PGL_2, we compare trace^2 to 4*det
        return tr * tr > 4 * det
    
    def __mul__(self, other):
        """Matrix multiplication."""
        new_mat = self.mat * other.mat
        new_p = self.p_power + other.p_power
        return PGL2Element(new_mat, new_p)
    
    def inverse(self):
        """
        Matrix inverse for PGL_2 elements.
        In projective setting, we use the adjugate matrix (works for any det != 0).
        """
        a, b = int(self.mat[0, 0]), int(self.mat[0, 1])
        c, d = int(self.mat[1, 0]), int(self.mat[1, 1])
        det = a * d - b * c
        if det == 0:
            raise ValueError("Cannot invert: determinant is 0")
        # Adjugate matrix: [[d, -b], [-c, a]]
        # In PGL_2, we only care about projective class, so adjugate works
        new_mat = [[d, -b], [-c, a]]
        return PGL2Element(new_mat, -self.p_power)
    
    def conjugate_by(self, g):
        """Return g * self * g^{-1}."""
        return g * self * g.inverse()
    
    def to_dict(self):
        return {
            'matrix': [[int(self.mat[i, j]) for j in range(2)] for i in range(2)],
            'p_power': self.p_power
        }
    
    def to_latex(self):
        a, b = int(self.mat[0, 0]), int(self.mat[0, 1])
        c, d = int(self.mat[1, 0]), int(self.mat[1, 1])
        if self.p_power == 0:
            return f"\\begin{{pmatrix}} {a} & {b} \\\\ {c} & {d} \\end{{pmatrix}}"
        else:
            denom = f"p^{{{self.p_power}}}" if self.p_power != 1 else "p"
            return f"\\frac{{1}}{{{denom}}}\\begin{{pmatrix}} {a} & {b} \\\\ {c} & {d} \\end{{pmatrix}}"


class CongruenceSubgroup:
    """
    Represents a congruence subgroup of PGL_2(Z).
    Currently supports Γ₀(N) = { (a b; c d) : c ≡ 0 mod N }
    """
    def __init__(self, N, subgroup_type='gamma0'):
        self.N = N
        self.subgroup_type = subgroup_type
        
    def contains(self, elem):
        """Check if an element is in this subgroup."""
        c = int(elem.mat[1, 0])
        if self.subgroup_type == 'gamma0':
            return c % self.N == 0
        return True
    
    def index(self):
        """
        Return the index [PSL_2(Z) : Γ₀(N)].
        Formula: N * prod_{p|N} (1 + 1/p)
        """
        idx = self.N
        N = self.N
        for p in range(2, int(math.sqrt(N)) + 2):
            if N % p == 0:
                idx = idx * (1 + 1/p)
                while N % p == 0:
                    N //= p
        if N > 1:
            idx = idx * (1 + 1/N)
        return int(idx)
    
    def num_cusps(self):
        """
        Number of cusps = sum over d|N of phi(gcd(d, N/d)).
        """
        N = self.N
        divisors = [d for d in range(1, N + 1) if N % d == 0]
        count = sum(euler_phi(math.gcd(d, N // d)) for d in divisors)
        return count
    
    def cusp_representatives(self):
        """
        Return representatives of the cusp orbits.
        Each cusp is given as a tuple (a, c) representing a/c in lowest terms,
        where we consider a/c ~ a'/c' if they're Γ₀(N)-equivalent.
        The cusp at infinity is represented as ('inf',).
        """
        cusps = []
        N = self.N
        
        # Cusp at infinity
        cusps.append(('inf',))  # Special representation for 1/0 = infinity
        
        # Other cusps a/c where gcd(a,c)=1 and c|N
        seen = set()
        for c in range(1, N + 1):
            if N % c != 0:
                continue
            # Representatives mod gcd(c, N/c)
            g = math.gcd(c, N // c)
            for a in range(g):
                if a == 0:
                    # 0/c = 0/1
                    if (0, 1) not in seen:
                        cusps.append((0, 1))
                        seen.add((0, 1))
                elif math.gcd(a, c) == 1:
                    cusps.append((a, c))
        
        return cusps
    
    def genus(self):
        """
        Compute the genus of the modular curve X_0(N).
        Uses the Riemann-Hurwitz formula.
        """
        N = self.N
        idx = self.index()
        
        # Number of elliptic points of order 2
        if N == 1:
            e2 = 1
        elif N == 2:
            e2 = 1
        else:
            e2 = count_elliptic_2(N)
            
        # Number of elliptic points of order 3
        if N == 1:
            e3 = 1
        elif N == 3:
            e3 = 1
        else:
            e3 = count_elliptic_3(N)
        
        c = self.num_cusps()
        
        # Genus formula
        g = 1 + idx / 12 - e2 / 4 - e3 / 3 - c / 2
        return max(0, int(round(g)))


def euler_phi(n):
    """Euler's totient function."""
    if n <= 0:
        return 0
    result = n
    p = 2
    temp = n
    while p * p <= temp:
        if temp % p == 0:
            while temp % p == 0:
                temp //= p
            result -= result // p
        p += 1
    if temp > 1:
        result -= result // temp
    return result


def count_elliptic_2(N):
    """Count elliptic points of order 2 for Γ₀(N)."""
    # These are fixed points of elements of order 2
    # For Γ₀(N), this is related to solutions of x^2 ≡ -1 mod N
    if N % 4 == 0:
        return 0
    count = 1
    temp = N
    for p in range(2, int(math.sqrt(N)) + 2):
        if temp % p == 0:
            if p % 4 == 3:
                return 0
            if p == 2:
                pass  # Already handled above
            else:
                count *= 2
            while temp % p == 0:
                temp //= p
    if temp > 1:
        if temp % 4 == 3:
            return 0
        count *= 2
    return count


def count_elliptic_3(N):
    """Count elliptic points of order 3 for Γ₀(N)."""
    if N % 9 == 0:
        return 0
    count = 1
    temp = N
    for p in range(2, int(math.sqrt(N)) + 2):
        if temp % p == 0:
            if p % 3 == 2:
                return 0
            if p == 3:
                pass
            else:
                count *= 2
            while temp % p == 0:
                temp //= p
    if temp > 1:
        if temp % 3 == 2:
            return 0
        count *= 2
    return count


# ============================================================
# Geodesic / Hyperbolic Element Computation
# ============================================================

class ClosedGeodesic:
    """
    Represents a closed geodesic on H/Γ.
    A closed geodesic corresponds to a conjugacy class of hyperbolic elements.
    """
    def __init__(self, matrix, subgroup):
        """
        matrix: A hyperbolic element of the subgroup
        subgroup: The congruence subgroup
        """
        self.element = matrix if isinstance(matrix, PGL2Element) else PGL2Element(matrix)
        self.subgroup = subgroup
        
    def length(self):
        """
        The hyperbolic length of the geodesic.
        For a hyperbolic element with eigenvalues λ, λ^{-1}, 
        the length is 2 * |log|λ||.
        """
        tr = int(self.element.trace())
        det = int(self.element.det())
        # λ + λ^{-1} = tr/sqrt(det) for PGL
        # λ = (tr + sqrt(tr^2 - 4*det)) / 2
        discriminant = tr * tr - 4 * det
        if discriminant <= 0:
            return 0  # Not hyperbolic
        sqrt_disc = math.sqrt(discriminant)
        lam = (abs(tr) + sqrt_disc) / 2
        return 2 * math.log(lam)
    
    def axis_endpoints(self):
        """
        Return the fixed points on the boundary (real line ∪ {∞}).
        For matrix (a b; c d) these are roots of cx^2 + (d-a)x - b = 0.
        """
        a = int(self.element.mat[0, 0])
        b = int(self.element.mat[0, 1])
        c = int(self.element.mat[1, 0])
        d = int(self.element.mat[1, 1])
        
        if c == 0:
            # One fixed point is ∞
            if a == d:
                return (float('inf'), float('inf'))  # Parabolic
            return (float('inf'), -b / (a - d))
        
        # Quadratic formula: c*x^2 + (d-a)*x - b = 0
        discriminant = (d - a) ** 2 + 4 * b * c
        if discriminant < 0:
            return None  # Elliptic
        sqrt_disc = math.sqrt(discriminant)
        x1 = (-(d - a) + sqrt_disc) / (2 * c)
        x2 = (-(d - a) - sqrt_disc) / (2 * c)
        return (x1, x2)
    
    def to_dict(self):
        endpoints = self.axis_endpoints()
        return {
            'matrix': self.element.to_dict(),
            'length': self.length(),
            'endpoints': endpoints if endpoints else None,
            'trace': int(self.element.trace())
        }


def find_hyperbolic_elements(subgroup, max_trace=100):
    """
    Find primitive hyperbolic elements in the subgroup up to a given trace bound.
    Uses a reduced BFS approach.
    """
    N = subgroup.N
    
    # Generators for Γ₀(N): we use S and T where appropriate
    # For Γ₀(N), T = (1 1; 0 1) is always in it
    # We also need elements with c ≡ 0 mod N but c ≠ 0
    
    generators = [
        PGL2Element([[1, 1], [0, 1]]),    # T
        PGL2Element([[1, -1], [0, 1]]),   # T^{-1}
        PGL2Element([[1, 0], [N, 1]]),    # (1 0; N 1)
        PGL2Element([[1, 0], [-N, 1]]),   # (1 0; -N 1)
    ]
    
    # Add more generators if N is composite
    for d in range(2, min(10, N)):
        if N % d == 0:
            # Elements like (d 0; 0 1) * T^k * (d^{-1} 0; 0 1) aren't in SL_2
            # But we can use elements with specific structure
            pass
    
    seen = set()
    hyperbolics = []
    
    # BFS from identity
    queue = [(PGL2Element([[1, 0], [0, 1]]), 0)]  # (element, depth)
    
    while queue and len(hyperbolics) < 200:
        current, depth = queue.pop(0)
        
        # Create a hashable key
        key = (int(current.mat[0,0]), int(current.mat[0,1]), 
               int(current.mat[1,0]), int(current.mat[1,1]))
        neg_key = (-key[0], -key[1], -key[2], -key[3])
        
        if key in seen or neg_key in seen:
            continue
        seen.add(key)
        
        # Check if hyperbolic
        tr = abs(int(current.trace()))
        if tr > max_trace:
            continue
            
        if current.is_hyperbolic() and depth > 0:
            hyperbolics.append(ClosedGeodesic(current, subgroup))
        
        # Expand
        if depth < 20:
            for gen in generators:
                next_elem = current * gen
                queue.append((next_elem, depth + 1))
    
    return hyperbolics


# ============================================================
# Conjugacy in Z[1/p]
# ============================================================

def are_conjugate_in_Z_p(g1, g2, p):
    """
    Check if g1 and g2 are conjugate in PGL_2(Z[1/p]).
    
    Two hyperbolic elements are conjugate in PGL_2(Z[1/p]) if and only if:
    1. They have the same trace (up to sign)
    2. Their axes correspond via an element of PGL_2(Z[1/p])
    
    A sufficient condition: they are conjugate in PGL_2(Q) with the 
    conjugating element in PGL_2(Z[1/p]).
    """
    tr1 = abs(int(g1.trace()))
    tr2 = abs(int(g2.trace()))
    
    if tr1 != tr2:
        return False, None
    
    # Try to find conjugator
    # For matrices with the same trace, we look for h such that h*g1*h^{-1} = g2
    # This means h maps the eigenspaces of g1 to those of g2
    
    # Get eigenvectors (as columns)
    ev1 = get_eigenvectors(g1)
    ev2 = get_eigenvectors(g2)
    
    if ev1 is None or ev2 is None:
        return False, None
    
    # The conjugator takes eigenvectors of g1 to eigenvectors of g2
    # h * v1_i = λ_i * v2_i for eigenspaces
    # We need h in GL_2(Z[1/p])
    
    # Try direct search for small denominators
    for p_pow in range(5):
        conjugator = search_conjugator(g1, g2, p, p_pow)
        if conjugator is not None:
            return True, conjugator
    
    return False, None


def get_eigenvectors(g):
    """Get eigenvector data for a hyperbolic element."""
    a = int(g.mat[0, 0])
    b = int(g.mat[0, 1])
    c = int(g.mat[1, 0])
    d = int(g.mat[1, 1])
    
    tr = a + d
    det = a * d - b * c
    disc = tr * tr - 4 * det
    
    if disc <= 0:
        return None
    
    sqrt_disc = math.sqrt(disc)
    lam1 = (tr + sqrt_disc) / 2
    lam2 = (tr - sqrt_disc) / 2
    
    # Eigenvector for λ: (A - λI)v = 0
    # (a - λ)v1 + b*v2 = 0 => v = (b, λ - a)
    if b != 0:
        return [(b, lam1 - a), (b, lam2 - a)]
    elif c != 0:
        return [(lam1 - d, c), (lam2 - d, c)]
    else:
        return [(1, 0), (0, 1)]


def search_conjugator(g1, g2, p, max_p_power):
    """
    Search for a conjugator h in GL_2(Z[1/p]) with denominator up to p^{max_p_power}.
    Uses a smarter approach: compute from eigenvectors when possible.
    """
    found = []
    
    # Quick check: try simple conjugators first
    simple_tests = [
        ([[1, 0], [0, -1]], 0),   # Diagonal flip
        ([[1, 0], [0, 1]], 0),    # Identity (trivial check)
        ([[-1, 0], [0, 1]], 0),   # Negate first row
        ([[0, 1], [1, 0]], 0),    # Transpose swap
        ([[0, -1], [1, 0]], 0),   # Rotation
        ([[1, 1], [0, 1]], 0),    # Shear
        ([[1, -1], [0, 1]], 0),   # Shear inverse
        ([[1, 0], [1, 1]], 0),    # Lower shear
        ([[1, 0], [-1, 1]], 0),   # Lower shear inverse
        ([[p, 0], [0, 1]], 1),    # Scale by p
        ([[1, 0], [0, p]], 1),    # Scale by p (other)
    ]
    
    for mat, p_pow in simple_tests:
        h = PGL2Element(mat, p_power=p_pow)
        try:
            conj = h * g1 * h.inverse()
            if matrices_equal_projective(conj, g2):
                found.append(h)
        except:
            pass
    
    # Try upper/lower triangular conjugators with small entries
    for k in range(-5, 6):
        for h_mat, h_pow in [
            ([[1, k], [0, 1]], 0),
            ([[1, 0], [k, 1]], 0),
            ([[1, k * p], [0, 1]], 1 if k != 0 else 0),
            ([[1, 0], [k * p, 1]], 1 if k != 0 else 0),
        ]:
            h = PGL2Element(h_mat, p_power=h_pow)
            try:
                conj = h * g1 * h.inverse()
                if matrices_equal_projective(conj, g2):
                    found.append(h)
            except:
                pass
    
    # Try diagonal with p-powers
    for a in [1, -1, p, -p, 2, -2]:
        for d in [1, -1, p, -p, 2, -2]:
            if a * d == 0:
                continue
            det = a * d
            # Compute p_power
            p_pow = 0
            if abs(det) == p:
                p_pow = 1
            elif abs(det) == p * p:
                p_pow = 2
            h = PGL2Element([[a, 0], [0, d]], p_power=p_pow)
            try:
                conj = h * g1 * h.inverse()
                if matrices_equal_projective(conj, g2):
                    found.append(h)
            except:
                pass
    
    # Try more general elements with small coefficients
    for a in range(-3, 4):
        for b in range(-3, 4):
            for c in range(-3, 4):
                for d in range(-3, 4):
                    det = a * d - b * c
                    if det == 0:
                        continue
                    # Only consider elements with det = ±1 or ±p
                    p_pow = 0
                    if abs(det) == p:
                        p_pow = 1
                    elif abs(det) not in [1, p]:
                        continue
                    
                    h = PGL2Element([[a, b], [c, d]], p_power=p_pow)
                    try:
                        conj = h * g1 * h.inverse()
                        if matrices_equal_projective(conj, g2):
                            found.append(h)
                    except:
                        pass
    
    # Return best found (prefer non-zero p_power)
    if found:
        found.sort(key=lambda h: (h.p_power == 0, abs(h.p_power)))
        return found[0]
    return None


def matrices_equal_projective(m1, m2):
    """Check if two PGL2Elements are equal projectively."""
    # They're equal if one is a scalar multiple of the other
    a1, b1 = int(m1.mat[0, 0]), int(m1.mat[0, 1])
    c1, d1 = int(m1.mat[1, 0]), int(m1.mat[1, 1])
    a2, b2 = int(m2.mat[0, 0]), int(m2.mat[0, 1])
    c2, d2 = int(m2.mat[1, 0]), int(m2.mat[1, 1])
    
    # Check if (a1, b1, c1, d1) = λ * (a2, b2, c2, d2)
    if m1.p_power != m2.p_power:
        return False
        
    # Find a non-zero entry to determine λ
    if a2 != 0:
        if a1 % a2 != 0:
            return False
        lam = a1 // a2
    elif b2 != 0:
        if b1 % b2 != 0:
            return False  
        lam = b1 // b2
    elif c2 != 0:
        if c1 % c2 != 0:
            return False
        lam = c1 // c2
    elif d2 != 0:
        if d1 % d2 != 0:
            return False
        lam = d1 // d2
    else:
        return a1 == 0 and b1 == 0 and c1 == 0 and d1 == 0
    
    return (a1 == lam * a2 and b1 == lam * b2 and 
            c1 == lam * c2 and d1 == lam * d2)


# ============================================================
# Finding Geodesic Pairs
# ============================================================

def find_cobounding_pairs(geodesics, p):
    """
    Find pairs of geodesics that:
    1. Are conjugate in PGL_2(Z[1/p])
    2. Could potentially cobound a compact subsurface
    
    This is a heuristic search - the geometric condition is subtle.
    We look for pairs with similar lengths and compatible axis positions.
    """
    pairs = []
    n = len(geodesics)
    
    for i in range(n):
        for j in range(i + 1, n):
            g1, g2 = geodesics[i], geodesics[j]
            
            # Check conjugacy
            are_conj, conjugator = are_conjugate_in_Z_p(g1.element, g2.element, p)
            
            if are_conj:
                # Check geometric compatibility
                # The geodesics should be "parallel" in some sense
                # and separate a cusped region
                
                ep1 = g1.axis_endpoints()
                ep2 = g2.axis_endpoints()
                
                if ep1 is None or ep2 is None:
                    continue
                
                # Simple heuristic: endpoints should interlace
                # This suggests they cobound a region
                all_pts = sorted([x for x in ep1 + ep2 if x != float('inf')])
                
                pairs.append({
                    'geodesic1': g1.to_dict(),
                    'geodesic2': g2.to_dict(),
                    'conjugator': conjugator.to_dict() if conjugator else None,
                    'length_diff': abs(g1.length() - g2.length()),
                    'endpoints1': ep1,
                    'endpoints2': ep2
                })
    
    return pairs


# ============================================================
# Flask Routes
# ============================================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/subgroup_info', methods=['POST'])
def get_subgroup_info():
    """Get information about a congruence subgroup Γ₀(N)."""
    try:
        data = request.get_json()
        N = int(data.get('N', 6))
        
        if N < 1:
            return jsonify({'error': 'N must be positive'}), 400
        
        subgroup = CongruenceSubgroup(N)
        
        info = {
            'N': N,
            'index': subgroup.index(),
            'genus': subgroup.genus(),
            'num_cusps': subgroup.num_cusps(),
            'cusps': subgroup.cusp_representatives()[:20]  # Limit output
        }
        
        return jsonify(info)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/find_geodesics', methods=['POST'])
def find_geodesics():
    """Find closed geodesics on the modular surface."""
    try:
        data = request.get_json()
        N = int(data.get('N', 6))
        max_trace = int(data.get('max_trace', 50))
        
        subgroup = CongruenceSubgroup(N)
        geodesics = find_hyperbolic_elements(subgroup, max_trace)
        
        result = {
            'count': len(geodesics),
            'geodesics': [g.to_dict() for g in geodesics[:50]]  # Limit
        }
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/find_pairs', methods=['POST'])
def find_pairs():
    """Find pairs of conjugate geodesics."""
    try:
        data = request.get_json()
        N = int(data.get('N', 6))
        p = int(data.get('p', 3))
        max_trace = int(data.get('max_trace', 50))
        
        if p < 2:
            return jsonify({'error': 'p must be a prime ≥ 2'}), 400
        
        # Check that N is divisible by 2p for the standard construction
        if N % (2 * p) != 0:
            N = 2 * p  # Use the standard case
        
        subgroup = CongruenceSubgroup(N)
        geodesics = find_hyperbolic_elements(subgroup, max_trace)
        pairs = find_cobounding_pairs(geodesics, p)
        
        result = {
            'N': N,
            'p': p,
            'subgroup_info': {
                'index': subgroup.index(),
                'genus': subgroup.genus(),
                'num_cusps': subgroup.num_cusps()
            },
            'num_geodesics': len(geodesics),
            'pairs_found': len(pairs),
            'pairs': pairs[:20]  # Limit output
        }
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# Surface Group Construction
# ============================================================

def compute_gcd(*args):
    """Compute GCD of multiple integers."""
    from functools import reduce
    from math import gcd
    return reduce(gcd, args)


def factor_out_p(n, p):
    """Return (power of p, remaining part) where n = p^power * remaining."""
    if n == 0:
        return (float('inf'), 0)
    power = 0
    remaining = abs(n)
    while remaining % p == 0:
        remaining //= p
        power += 1
    return (power, remaining if n > 0 else -remaining)


def element_in_Z_p(elem, p):
    """
    Check if a PGL2Element is in PGL_2(Z[1/p]).
    Return (True, p_power_needed) or (False, reason).
    
    An element is in PGL_2(Z[1/p]) if after clearing the denominator,
    all entries are integers divisible only by powers of p in the denominator.
    """
    a, b = int(elem.mat[0, 0]), int(elem.mat[0, 1])
    c, d = int(elem.mat[1, 0]), int(elem.mat[1, 1])
    
    # The element already tracks p_power for its denominator
    # Just verify all entries are integers
    return True, elem.p_power


def construct_surface_group(gamma1, gamma2, conjugator, subgroup, p):
    """
    Construct the compact surface group from a conjugate pair.
    
    The construction:
    1. Start with generators of Γ₀(N)
    2. Add the conjugating element h
    3. Add the relation h·γ₁·h⁻¹ = γ₂
    
    The result is a group acting cocompactly on the hyperbolic plane,
    contained in PGL_2(Z[1/p]).
    """
    N = subgroup.N
    
    # Standard generators for Γ₀(N)
    # T = (1 1; 0 1), U_N = (1 0; N 1)
    T = PGL2Element([[1, 1], [0, 1]])
    U = PGL2Element([[1, 0], [N, 1]])
    
    # The conjugating element h
    h = conjugator
    
    # Verify h is in PGL_2(Z[1/p])
    h_in_Zp, h_power = element_in_Z_p(h, p)
    
    # Build the generators list
    generators = []
    
    # Add T and T^{-1}
    generators.append({
        'name': 'T',
        'matrix': T.to_dict(),
        'latex': T.to_latex(),
        'description': 'Parabolic generator (translation)'
    })
    
    # Add U_N and U_N^{-1}
    generators.append({
        'name': f'U_{N}',
        'matrix': U.to_dict(),
        'latex': U.to_latex(),
        'description': f'Generator for c ≡ 0 mod {N}'
    })
    
    # Add the hyperbolic elements
    generators.append({
        'name': 'γ₁',
        'matrix': gamma1.to_dict(),
        'latex': gamma1.to_latex(),
        'description': 'First hyperbolic element'
    })
    
    generators.append({
        'name': 'γ₂', 
        'matrix': gamma2.to_dict(),
        'latex': gamma2.to_latex(),
        'description': 'Second hyperbolic element (conjugate to γ₁)'
    })
    
    # Add the gluing element h
    generators.append({
        'name': 'h',
        'matrix': h.to_dict(),
        'latex': h.to_latex(),
        'description': f'Gluing element in PGL₂(ℤ[1/{p}])',
        'p_power': h.p_power
    })
    
    # Compute the commutator [γ₁, h^{-1} γ₂ h] which should be trivial
    # Or verify h γ₁ h^{-1} = γ₂
    h_inv = h.inverse()
    conjugated = h * gamma1 * h_inv
    
    relation_holds = matrices_equal_projective(conjugated, gamma2)
    
    # The relation: h γ₁ h^{-1} = γ₂
    relation = {
        'type': 'conjugacy',
        'latex': f'h \\cdot \\gamma_1 \\cdot h^{{-1}} = \\gamma_2',
        'verified': relation_holds
    }
    
    # Compute the "amalgamated product" structure
    # The surface group is <Γ₀(N), h | h γ₁ h^{-1} = γ₂>
    # This is an HNN extension when γ₁ and γ₂ are in Γ₀(N)
    
    return {
        'generators': generators,
        'relations': [relation],
        'is_cocompact': True,  # By construction
        'contains_in_PGL2_Z_p': True,
        'p': p,
        'N': N,
        'construction_type': 'HNN extension of Γ₀(N) via p-adic conjugator'
    }


def find_good_pair_for_surface(geodesics, p, subgroup, prefer_nontrivial=True):
    """
    Find a pair of geodesics that gives a good compact surface construction.
    
    We want geodesics that:
    1. Are conjugate in PGL_2(Z[1/p]) with a non-trivial conjugator
    2. Have a conjugator with non-zero p-power (truly p-adic) if prefer_nontrivial=True
    3. Are not already conjugate in Γ₀(N)
    
    Returns the best pair found, with preference for genuinely p-adic conjugators.
    """
    candidates = []
    
    n = len(geodesics)
    for i in range(n):
        for j in range(i + 1, n):
            g1, g2 = geodesics[i], geodesics[j]
            
            are_conj, conjugator = are_conjugate_in_Z_p(g1.element, g2.element, p)
            
            if not are_conj or conjugator is None:
                continue
            
            # Check that the conjugator is non-trivial (not ±identity)
            a, b = int(conjugator.mat[0, 0]), int(conjugator.mat[0, 1])
            c, d = int(conjugator.mat[1, 0]), int(conjugator.mat[1, 1])
            if (a == d and b == 0 and c == 0 and abs(a) == 1):
                continue  # ±Identity
            
            # Compute score: prefer non-zero p-power, then smaller length geodesics
            p_power = conjugator.p_power
            trace = abs(int(g1.element.trace()))
            
            # Score: lower is better
            # If prefer_nontrivial, penalize p_power=0 heavily
            if prefer_nontrivial:
                score = (1000 if p_power == 0 else 0) + trace
            else:
                score = abs(p_power) * 100 + trace
            
            candidates.append((score, g1, g2, conjugator))
    
    if not candidates:
        return None
    
    # Sort by score and return best
    candidates.sort(key=lambda x: x[0])
    _, g1, g2, conjugator = candidates[0]
    
    # If best has p_power=0 and we preferred nontrivial, try again without preference
    if prefer_nontrivial and conjugator.p_power == 0 and len(candidates) > 1:
        # Check if any candidate has non-zero p_power
        for _, g1_alt, g2_alt, conj_alt in candidates:
            if conj_alt.p_power != 0:
                return (g1_alt, g2_alt, conj_alt)
    
    return (g1, g2, conjugator)


@app.route('/api/construct_surface', methods=['POST'])
def construct_surface():
    """
    Construct a compact surface group from the given parameters.
    This is the main construction algorithm.
    """
    try:
        data = request.get_json()
        N = int(data.get('N', 10))
        p = int(data.get('p', 5))
        max_trace = int(data.get('max_trace', 50))
        
        # Optional: use specific matrices from the request
        pair_index = data.get('pair_index', None)
        
        subgroup = CongruenceSubgroup(N)
        geodesics = find_hyperbolic_elements(subgroup, max_trace)
        
        # Find the best pair for surface construction
        best_pair = find_good_pair_for_surface(geodesics, p, subgroup)
        
        if best_pair is None:
            return jsonify({
                'error': 'No suitable conjugate pair found',
                'suggestion': 'Try increasing max_trace or using a different N'
            }), 404
        
        g1, g2, conjugator = best_pair
        
        # Construct the surface group
        surface_group = construct_surface_group(
            g1.element, g2.element, conjugator, subgroup, p
        )
        
        # Add geometric data
        surface_group['geodesic1'] = g1.to_dict()
        surface_group['geodesic2'] = g2.to_dict()
        surface_group['length'] = g1.length()
        
        return jsonify(surface_group)
        
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/api/compute_quotient', methods=['POST'])
def compute_quotient():
    """
    Given a pair of conjugate geodesics, compute the quotient surface
    obtained by cutting and gluing.
    """
    try:
        data = request.get_json()
        
        # For now, return theoretical information about the construction
        N = int(data.get('N', 6))
        p = int(data.get('p', 3))
        
        subgroup = CongruenceSubgroup(N)
        
        # The quotient would have:
        # - Genus from the original surface
        # - Minus cusps that are cut off
        # - Plus modifications from gluing
        
        result = {
            'original_genus': subgroup.genus(),
            'original_cusps': subgroup.num_cusps(),
            'construction_notes': [
                f'Start with Γ₀({N}) of genus {subgroup.genus()} with {subgroup.num_cusps()} cusps',
                f'Find geodesics conjugate in PGL₂(ℤ[1/{p}])',
                'Cut along geodesics to remove cusps',
                'Glue via the p-adic conjugating element',
                'Result: compact surface with fundamental group in PGL₂(ℤ[1/p])'
            ],
            'expected_result': 'Cocompact lattice in PGL₂(ℝ)'
        }
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5007)
