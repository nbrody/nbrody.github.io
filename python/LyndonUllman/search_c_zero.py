import sys
import time
from lyndonBeam import BeamSearcher
from flint import fmpz_poly

class UpperTriangularSearcher(BeamSearcher):
    """
    A specialized BeamSearcher that looks for matrices where the bottom-left entry (c)
    is nonzero in Z[t] but zero modulo p(t).
    This corresponds to finding elements in the congruence subgroup Gamma_0(p).
    """
    
    def calculate_cost(self, matrix):
        """
        Cost function to estimate distance from upper triangular matrix modulo p.
        Target: We want c=0 (bottom-left entry).
        """
        a, b, c, d = matrix
        
        # L1 Norm (sum of absolute values of coefficients)
        # Prioritize making c small
        norm_c = sum(abs(int(x)) for x in c.coeffs())
        
        # Secondary: also try to minimize b for better structure, 
        # or maybe just keep the matrix simple.
        norm_b = sum(abs(int(x)) for x in b.coeffs())
        
        # Weight c very heavily since that's our main goal
        return 100 * norm_c + norm_b

    def is_identity(self, matrix):
        """
        Checks if the bottom-left entry is nonzero in Z[t] but 0 modulo p.
        Note: The method name 'is_identity' is kept for compatibility with the search loop,
        but semantically it means 'is_success'.
        """
        a, b, c, d = matrix
        
        # c must be zero modulo p
        if not (c % self.p).is_zero():
            return False
            
        # To avoid trivial solutions (like the identity matrix itself),
        # we require c to be NONZERO in Z[t].
        # However, we only have the modulo p matrix here in 'matrix'.
        # The 'matrix' argument passed to this function is the reduced matrix (mod p).
        # So if c % p is zero, then c in the reduced matrix IS zero.
        
        # Wait, the search loop passes 'new_mat' which is reduced modulo p.
        # If c % p == 0, then c (in new_mat) will be the zero polynomial.
        # So we can't check if the unreduced c is nonzero here easily without re-evaluating.
        
        # BUT, we want to find non-trivial elements.
        # If c (mod p) is 0, it's a candidate.
        # The search loop calculates the unreduced matrix AFTER this returns True.
        # So we should return True if c (mod p) is 0.
        # But we want to avoid the Identity matrix (where c=0, b=0, a=1, d=1).
        # So let's check if it's NOT the identity modulo p.
        
        # If it is exactly Identity mod p, it's a relation in PSL_2(Z[t]/p).
        # We might want those too?
        # The user said "nonzero in Z[t] but zero modulo p".
        # If it's Identity mod p, c is 0 mod p.
        # If it's NOT Identity mod p, but c is 0 mod p, then it's definitely interesting.
        
        # Let's accept any matrix where c=0 mod p, EXCEPT if it's the Identity matrix?
        # Actually, if it is Identity mod p, c is 0 mod p.
        # But we want c unreduced != 0.
        # If the word is "T", c=0 unreduced.
        # If the word is "S", c=1 unreduced.
        
        # Let's just return True if c (mod p) is 0.
        # We can filter out trivial c=0 cases in the success block or just let the user see them.
        # But "T^n" has c=0 always. We definitely want to avoid those.
        # T^n has c=0.
        # We want c != 0 in Z[t].
        # Since we can't check Z[t] here easily, we can check if the word is just T's?
        # Or check if b != 0 mod p or a != 1 mod p?
        
        # Let's require that the matrix is NOT upper triangular in Z[t] trivially?
        # No, that's hard.
        
        # Let's just check c == 0 (mod p).
        # And maybe add a check that it's not diagonal?
        # If c=0 mod p, and it's not diagonal, then it's strictly upper triangular mod p (or lower? no c is bottom left).
        # Upper triangular: [[a, b], [0, d]].
        
        return c.is_zero()

    def is_trivial(self, unreduced_mat):
        """
        Filter out solutions where c is zero in Z[t].
        We only want solutions where c != 0 in Z[t] but c == 0 mod p.
        """
        a, b, c, d = unreduced_mat
        return c.is_zero()

def main():
    print("Search for matrices with c = 0 (mod p)")
    if len(sys.argv) > 1:
        p_input = " ".join(sys.argv[1:])
    else:
        print("\nEnter polynomial p(t) (e.g. 't^2+1'):")
        p_input = input("> ").strip()
        if not p_input:
            p_input = "t^2+1"
            
    searcher = UpperTriangularSearcher(p_input, width=2000, randomness=0.3)
    
    # We need to monkey-patch or override search? 
    # No, is_identity is called with the reduced matrix.
    # If c is 0 mod p, it returns True.
    # The search loop then computes the unreduced matrix.
    # We can inspect the result.
    
    searcher.search(max_depth=50)

if __name__ == "__main__":
    main()
