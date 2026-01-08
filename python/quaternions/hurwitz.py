from flint import fmpz
import itertools
import re

class HurwitzQuaternion:
    def __init__(self, a, b, c, d, check_parity=True):

        """
        Represents a Hurwitz quaternion q = (a + bi + cj + dk) / 2
        where a, b, c, d are integers of the same parity.
        """
        self.a = fmpz(a)
        self.b = fmpz(b)
        self.c = fmpz(c)
        self.d = fmpz(d)
        
        if check_parity:
            parity = self.a % 2
            if not (self.b % 2 == parity and self.c % 2 == parity and self.d % 2 == parity):
                raise ValueError(f"Coefficients must have the same parity: {a}, {b}, {c}, {d}")

    def __repr__(self):
        return f"HurwitzQuaternion({self.a}, {self.b}, {self.c}, {self.d})"

    def to_latex(self):
        # Format for MathJax
        if self.a % 2 == 0:
            # Integer coefficients
            a, b, c, d = int(self.a)//2, int(self.b)//2, int(self.c)//2, int(self.d)//2
            parts = []
            
            # Real part
            if a != 0:
                parts.append(str(a))
            elif b == 0 and c == 0 and d == 0:
                return "0"
            
            for val, lab in [(b, "i"), (c, "j"), (d, "k")]:
                if val == 0: continue
                
                sign = ""
                if val > 0:
                    sign = "+" if parts else ""
                else:
                    sign = "-"
                
                v_abs = abs(val)
                v_str = f"{v_abs}{lab}" if v_abs != 1 else lab
                parts.append(f"{sign}{v_str}")
                
            return "".join(parts)
        else:
            # Half-integers: \frac{a+bi+cj+dk}{2}
            # Actually strictly typically written as (a+bi...)/2 but \frac is nicer
            
            # Numerator construction
            a, b, c, d = int(self.a), int(self.b), int(self.c), int(self.d)
            parts = []
            if a != 0: parts.append(str(a))
            
            for val, lab in [(b, "i"), (c, "j"), (d, "k")]:
                if val == 0: continue
                sign = "+" if (val > 0 and parts) else "-" if val < 0 else ""
                if not parts and val > 0: sign = "" # First term positive
                
                v_abs = abs(val)
                v_str = f"{v_abs}{lab}" if v_abs != 1 else lab
                parts.append(f"{sign}{v_str}")
                
            numerator = "".join(parts)
            return f"\\frac{{{numerator}}}{{2}}"

    def __str__(self):
        # Helper to format term
        def fmt(coeff, label, is_first=False):
            val = int(coeff)
            if val == 0: return ""
            prefix = ""
            if val < 0:
                prefix = "-" if is_first else " - "
                val = -val
            else:
                prefix = "" if is_first else " + "
            
            if label:
                if val == 1: return f"{prefix}{label}"
                return f"{prefix}{val}{label}"
            return f"{prefix}{val}"

        if self.a % 2 == 0:
            a, b, c, d = int(self.a)//2, int(self.b)//2, int(self.c)//2, int(self.d)//2
            parts = []
            if a != 0 or (b==0 and c==0 and d==0):
                parts.append(str(a))
            
            for val, lab in [(b, "i"), (c, "j"), (d, "k")]:
                if val == 0: continue
                prefix = " + " if val > 0 else " - "
                if not parts: # First term
                    prefix = "" if val > 0 else "-"
                
                v_abs = abs(val)
                v_str = f"{v_abs}{lab}" if v_abs != 1 else lab
                parts.append(prefix + v_str)
            
            return "".join(parts)
        else:
            return f"({self.a} + {self.b}i + {self.c}j + {self.d}k)/2"

    def __eq__(self, other):
        return (self.a == other.a and self.b == other.b and 
                self.c == other.c and self.d == other.d)

    def __hash__(self):
        return hash((self.a, self.b, self.c, self.d))

    def __add__(self, other):
        return HurwitzQuaternion(self.a + other.a, self.b + other.b, 
                                 self.c + other.c, self.d + other.d, check_parity=False)

    def __sub__(self, other):
        return HurwitzQuaternion(self.a - other.a, self.b - other.b, 
                                 self.c - other.c, self.d - other.d, check_parity=False)

    def __mul__(self, other):
        # (a + bi + cj + dk)/2 * (A + Bi + Cj + Dk)/2
        # = ( (aA - bB - cC - dD) + i(...) ... ) / 4
        #Result must be Hurwitz.
        # Let's compute the product of numerators.
        # q1 = Q1/2, q2 = Q2/2. q1q2 = (Q1Q2)/4.
        # We need to return (Q3)/2. So Q3 = (Q1Q2)/2.
        # This implies Q1Q2 must be divisible by 2.
        # Since Q1, Q2 have coeffs of same parity, Q1Q2 coeffs are divisible by 2.
        
        a1, b1, c1, d1 = self.a, self.b, self.c, self.d
        a2, b2, c2, d2 = other.a, other.b, other.c, other.d
        
        new_a = a1*a2 - b1*b2 - c1*c2 - d1*d2
        new_b = a1*b2 + b1*a2 + c1*d2 - d1*c2
        new_c = a1*c2 - b1*d2 + c1*a2 + d1*b2
        new_d = a1*d2 + b1*c2 - c1*b2 + d1*a2
        
        return HurwitzQuaternion(new_a // 2, new_b // 2, new_c // 2, new_d // 2)

    def conjugate(self):
        return HurwitzQuaternion(self.a, -self.b, -self.c, -self.d, check_parity=False)

    def norm(self):
        # Norm is (a^2 + b^2 + c^2 + d^2) / 4
        return (self.a**2 + self.b**2 + self.c**2 + self.d**2) // 4

    @classmethod
    def from_integer(cls, a, b, c, d):
        """Create from integer coefficients (Lipschitz)"""
        return cls(2*a, 2*b, 2*c, 2*d)

    @classmethod
    def units(cls):
        # 24 units in Hurwitz integers
        # +/- 1, +/- i, +/- j, +/- k (8 units, doubled: +/-2, ...)
        # (+/- 1 +/- i +/- j +/- k) / 2 (16 units, doubled: +/-1 ...)
        if hasattr(cls, '_units_cache'):
            return cls._units_cache
            
        u = []
        # Lipschitz units
        for i in range(4):
            coeffs = [0]*4
            coeffs[i] = 2
            u.append(cls(*coeffs))
            coeffs[i] = -2
            u.append(cls(*coeffs))
            
        # Half-integer units
        for combination in itertools.product([-1, 1], repeat=4):
            u.append(cls(*combination))
            
        cls._units_cache = u
        return u

    def is_unit(self):
        return self.norm() == 1

    def content(self):
        """
        Returns the content of the quaternion (scalar factor).
        The content k is the largest integer such that q = k * q' for some Hurwitz quaternion q'.
        """
        import math
        # Coeffs are a,b,c,d for (a+bi+cj+dk)/2.
        # k must divide gcd(a,b,c,d).
        g = math.gcd(int(self.a), int(self.b), int(self.c), int(self.d))
        
        # If g is odd, it preserves parity when dividing. k = g.
        if g % 2 != 0:
            return g
            
        # If g is even, dividing by g might switch parity.
        # Example 1: (2,2,2,2) -> (1,1,1,1). gcd=2. 
        # (2/2) = 1 (odd). Parity changes even->odd. Components (1,1,1,1) same parity (odd). OK.
        # Example 2: (4,0,0,0) -> (2,0,0,0). gcd=4.
        # (4/4) = 1 (odd). (0/4) = 0 (even). Mixed parity. Not Hurwitz.
        # So we must check if dividing by g yields valid parities.
        
        div_a = int(self.a) // g
        div_b = int(self.b) // g
        div_c = int(self.c) // g
        div_d = int(self.d) // g
        
        parity = div_a % 2
        if (div_b % 2 == parity and div_c % 2 == parity and div_d % 2 == parity):
            return g
        else:
            # If dividing by g fails parity check, dividing by g/2 MUST succeed.
            # Because dividing by g/2 is 2 * (divide by g).
            # 2 * (anything) is even. So all even parity. OK.
            return g // 2

    def primitize(self):
        """
        Returns a primitive Hurwitz quaternion q' such that q = k * q' where k is the content.
        """
        k = self.content()
        if k == 0: return self # Avoid div by zero for 0 quaternion
        return HurwitzQuaternion(self.a // k, self.b // k, self.c // k, self.d // k)

    @classmethod
    def primes_above(cls, p):
        # Find p+1 quaternion primes of norm p (up to left-associates).
        # We find all solutions to N(x) = p, then group by left-association.
        # N(x) = (a^2+b^2+c^2+d^2)/4 = p => a^2+b^2+c^2+d^2 = 4p.
        
        p = int(p) # Ensure int
        target_sum = 4 * p
        limit = int(target_sum**0.5)
        
        solutions = []
        
        # We can optimize this search.
        # We need a^2 + b^2 + c^2 + d^2 = 4p.
        # Parity must be same.
        # Since 4p is even, parity can be all even or all odd.
        
        # 1. Search for even solutions (Lipschitz)
        # a,b,c,d even => A,B,C,D integers s.t. A^2+B^2+C^2+D^2 = p
        # q = A + Bi + Cj + Dk. Internal rep (2A, 2B, 2C, 2D).
        
        # 2. Search for odd solutions
        # a,b,c,d odd.
        
        # Let's perform a generic search for sum of 4 squares = 4p.
        # Better: use specialized recursion.
        
        raw_solutions = []
        
        def find_squares(current_sum, count, coeffs):
            if count == 4:
                if current_sum == target_sum:
                    raw_solutions.append(coeffs)
                return

            max_val = int((target_sum - current_sum)**0.5)
            # Optimization: assumes remaining squares can fill the gap
            # min_needed = 0.
            # max_possible = (4-count) * max_val^2...? No.
            
            # To avoid duplicates and permutations, we could enforce an order?
            # But we need ALL permutations to get all primes.
            # So generic loop.
            # But for speed, maybe find unique combinations then permute?
            # Iterating -max to max is slow if 4 loops.
            # O(p^2)? No.
            # p+1 is smallish usually?
            pass
            
        # Refined search strategy:
        # decomposing 4p into sum of 4 squares.
        # Use python's generator or simple loops for small p.
        # For p around 100-1000, 4p ~ 4000. sqrt(4000) ~ 60.
        # 60^3 is 200,000. feasible.
        
        # Wait, parity constraint links all 4 coefficients.
        # Loop over 'a' from -limit to limit.
        #   determine parity of 'a'.
        #   Loop 'b' with same parity, such that a^2+b^2 <= 4p
        #     Loop 'c' same parity...
        
        # Optimization: use `range(start, stop, 2)` to enforce parity.
        
        candidates = []
        
        # Odd parity search
        # a,b,c,d in range(-limit, limit+1) and odd
        # Start of range needs to be odd.
        
        def generate_solutions(parity_mod_2):
            # parity_mod_2 is 0 or 1
            # Range logic:
            # We want x in [-limit, limit] s.t. x % 2 == parity_mod_2
            
            def valid_range(remaining_sum):
                # max val is sqrt(remaining_sum)
                l = int(remaining_sum**0.5)
                # Align with parity
                start = -l
                if start % 2 != parity_mod_2: start += 1 # or -1? -l might be outside?
                # Actually simpler to just iterate and check or step carefully
                
                # Let's just iterate carefully.
                # Just yield values?
                pass
            
            # It's 4 nested loops. 
            # a loop
            for a in range(-limit, limit + 1):
                if a % 2 != parity_mod_2: continue
                ra = target_sum - a*a
                if ra < 0: continue
                
                limit_b = int(ra**0.5)
                for b in range(-limit_b, limit_b + 1):
                    if b % 2 != parity_mod_2: continue
                    rb = ra - b*b
                    if rb < 0: continue
                    
                    limit_c = int(rb**0.5)
                    for c in range(-limit_c, limit_c + 1):
                        if c % 2 != parity_mod_2: continue
                        rc = rb - c*c
                        if rc < 0: continue
                        
                        # d is determined by rc
                        # d^2 = rc
                        d = int(rc**0.5)
                        if d*d == rc:
                            # d must have correct parity
                            if d % 2 == parity_mod_2:
                                candidates.append(cls(a,b,c,d))
                                if d != 0:
                                    candidates.append(cls(a,b,c,-d))

        generate_solutions(0) # Even coefficients
        generate_solutions(1) # Odd coefficients
        
        # Group by associates and pick representatives
        reps = []
        seen = set()
        units = cls.units()
        
        # Sort candidates for deterministic behavior
        # Sorting by a, b, c, d descending
        candidates.sort(key=lambda x: (x.a, x.b, x.c, x.d), reverse=True)
        
        for cand in candidates:
            if cand in seen:
                continue
            
            # Generate full orbit
            orbit = []
            for u in units:
                assoc = u * cand
                orbit.append(assoc)
                seen.add(assoc)
            
            # Select best representative
            chosen = cand # Default fallback
            
            if p % 4 == 1:
                # User Requirement: Lipschitz, Re(q) odd > 0, others even.
                # In internal representation (scaled by 2):
                # Lipschitz => q.a is even.
                # Re(q) odd => (q.a // 2) is odd => q.a % 4 == 2.
                # Re(q) > 0 => q.a > 0.
                
                # Note: Parity property ensures if a is even, b,c,d are even.
                matches = [q for q in orbit if q.a > 0 and q.a % 4 == 2]
                if matches:
                    # Sort to ensure determinism if multiple match (unlikely for unique?)
                    # If p=5, 1+2i and 1-2k are distinct. 
                    # But within ONE orbit (associates), is it unique?
                    # -1+2i -> a=-2 (ng)
                    # 1-2i -> a=2 (ok)
                    # 2+i -> a=4 (ng)
                    # So yes, looks unique up to variations in imaginary parts?
                    # Actually, if unique choice, there should be only one.
                    matches.sort(key=lambda x: (x.a, x.b, x.c, x.d), reverse=True)
                    chosen = matches[0]
                else:
                    # Fallback if logic fails (e.g. maybe p is not prime?)
                    matches_pos = [q for q in orbit if q.a > 0]
                    if matches_pos:
                         matches_pos.sort(key=lambda x: (x.a, x.b, x.c, x.d), reverse=True)
                         chosen = matches_pos[0]
            else:
                # For non-p=1mod4, just ensure a > 0 for cleanliness
                matches = [q for q in orbit if q.a > 0]
                if matches:
                    matches.sort(key=lambda x: (x.a, x.b, x.c, x.d), reverse=True)
                    chosen = matches[0]
            
            reps.append(chosen)
                
        return reps

    @classmethod
    def from_string(cls, s):
        # Remove spaces
        s = s.replace(" ", "")
        
        div_2 = False
        if s.endswith("/2"):
            div_2 = True
            s = s[:-2]
            if s.startswith("(") and s.endswith(")"):
                s = s[1:-1]
        
        # Regex for terms: [+-]? [digits]? [ijk]?
        matches = re.finditer(r'([+\-]?)(\d*)([ijk]?)', s)
        
        coeffs = {'': 0, 'i': 0, 'j': 0, 'k': 0}
        
        for m in matches:
            sign, num, basis = m.groups()
            if not sign and not num and not basis: continue
            
            val = 1
            if num: val = int(num)
            if sign == '-': val = -val
            
            if basis not in coeffs: # e.g. if junk
                continue
                
            coeffs[basis] += val
            
        a, b, c, d = coeffs[''], coeffs['i'], coeffs['j'], coeffs['k']
        
        if div_2:
             return cls(a, b, c, d, check_parity=True) 
        else:
             return cls.from_integer(a, b, c, d)

    def right_divide(self, divisor):
        """
        Returns quotient self * divisor^-1 if self is right-divisible by divisor,
        else returns None.
        q = self * divisor^-1 = (self * conj(divisor)) / norm(divisor)
        """
        n = divisor.norm()
        prod = self * divisor.conjugate()
        if prod.a % n == 0 and prod.b % n == 0 and prod.c % n == 0 and prod.d % n == 0:
            return HurwitzQuaternion(prod.a // n, prod.b // n, prod.c // n, prod.d // n)
        return None

    def factorizations(self):
        """
        Returns all prime factorizations (one per permutation of norm factors).
        Return format: List[List[str]] (list of chains) where chain is [unit, p1, p2, ..., pn]
        such that q = unit * p1 * p2 * ... * pn
        """
        norm = int(self.norm())
        if norm == 1:
            return [[str(self)]] 
            
        factors = fmpz(norm).factor() # [(p, e), ...]
        flat_primes = []
        for p, e in factors:
            flat_primes.extend([int(p)] * e)
            
        # Get unique permutations
        unique_perms = set(itertools.permutations(flat_primes))
        results = []
        
        for p_seq in unique_perms:
            current = self
            chain_rev = [] # We build from right: pn, pn-1...
            valid_chain = True
            
            # For q = u * p1 * ... * pn
            # We divide by pn (last in seq), then pn-1...
            # So we traverse p_seq in REVERSE for the division steps.
            
            for p in reversed(p_seq):
                candidates = HurwitzQuaternion.primes_above(p)
                found = False
                for cand in candidates:
                    # Check if current is right-divisible by cand
                    quot = current.right_divide(cand)
                    if quot is not None:
                        current = quot
                        chain_rev.append(str(cand))
                        found = True
                        break
                
                if not found:
                    valid_chain = False
                    break
            
            if valid_chain:
                # current is the unit u
                if not current.is_unit():
                    # Should be unit
                    pass
                
                # Chain was built [pn, pn-1, ..., p1]
                # We want [u, p1, ..., pn]
                full_chain = [str(current)] + list(reversed(chain_rev))
                results.append(full_chain)
        
        return results

# Define epsilon
epsilon = HurwitzQuaternion(-1, 1, 1, 1)

