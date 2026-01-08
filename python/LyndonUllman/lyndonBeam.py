import sys
import random
import time
import re

try:
    from flint import fmpz_poly, ctx
except ImportError:
    print("Error: The 'python-flint' library is required.")
    print("Please install it (e.g., via 'pip install python-flint') to run this script.")
    sys.exit(1)

# Set pretty printing for FLINT
ctx.pretty = True

class BeamSearcher:
    def __init__(self, poly_str, width=1000, randomness=0.2):
        """
        Initialize the searcher.
        :param poly_str: String representation of the polynomial p (e.g., "t^2 + 1")
        :param width: Number of candidates to keep at each step
        :param randomness: Fraction of the beam (0.0 to 1.0) filled with random non-optimal candidates
                           to preserve diversity.
        """
        self.p = self.parse_poly(poly_str)
        self.width = width
        self.randomness = randomness
        
        # Generators for G = <S, T> in PSL_2(Z[t])
        # T = [[1, t], [0, 1]]
        # S = [[0, -1], [1, 0]]
        
        t_poly = fmpz_poly([0, 1]) # 0 + 1*t
        one = fmpz_poly([1])
        zero = fmpz_poly([])
        neg_one = fmpz_poly([-1])

        # Store matrices as tuples of 4 polys: (a, b, c, d)
        self.T = (one, t_poly, zero, one)
        self.T_inv = (one, -t_poly, zero, one)
        self.S = (zero, neg_one, one, zero) 

        # Mapping for reconstructing words
        # T -> 'T', T^-1 -> 'Ti', S -> 'S'
        self.moves = [
            ('T', self.T),
            ('Ti', self.T_inv),
            ('S', self.S)
        ]

    def parse_poly(self, poly_str):
        """
        Safely parses a polynomial string like "t^2 + 2t - 1" into an fmpz_poly object.
        """
        # Define 't' as the polynomial variable
        t = fmpz_poly([0, 1])
        
        # Pre-process string to be Python-eval friendly
        # Replace caret with double star for exponentiation
        s = poly_str.replace('^', '**')
        # Insert * between number and t (e.g., "2t" -> "2*t")
        s = re.sub(r'(\d)t', r'\1*t', s)
        
        try:
            # Evaluate the expression using flint objects
            # We pass 't' and 'fmpz_poly' into the context
            val = eval(s, {"t": t, "fmpz_poly": fmpz_poly})
            
            # If the result is a plain integer (e.g. input was "1"), cast it
            if isinstance(val, int):
                return fmpz_poly([val])
            return val
        except Exception as e:
            print(f"Error parsing polynomial '{poly_str}': {e}")
            print("Try using python syntax, e.g., 't**2 + 1' or 't^2 + 1'")
            sys.exit(1)

    def mat_mul(self, m1, m2):
        """Multiplies two 2x2 matrices of polynomials modulo p."""
        a1, b1, c1, d1 = m1
        a2, b2, c2, d2 = m2
        
        # Calculate raw product
        a = a1*a2 + b1*c2
        b = a1*b2 + b1*d2
        c = c1*a2 + d1*c2
        d = c1*b2 + d1*d2
        
        # Reduce modulo p
        return (a % self.p, b % self.p, c % self.p, d % self.p)

    def calculate_cost(self, matrix):
        """
        Cost function to estimate distance from Identity in PSL_2(Z[t]/(p)).
        Target: Matrix M should be k*I where k is a unit (1 or -1).
        We want b=0, c=0, and a = +/- d.
        """
        a, b, c, d = matrix
        
        # L1 Norm (sum of absolute values of coefficients)
        norm_b = sum(abs(int(x)) for x in b.coeffs())
        norm_c = sum(abs(int(x)) for x in c.coeffs())
        
        # We check distance to scalar matrix (a = d or a = -d)
        diff_diag = a - d
        sum_diag = a + d
        
        norm_diff = sum(abs(int(x)) for x in diff_diag.coeffs())
        norm_sum = sum(abs(int(x)) for x in sum_diag.coeffs())
        
        # We favor the smaller of the two diagonal conditions
        return norm_b + norm_c + min(norm_diff, norm_sum)

    def is_identity(self, matrix):
        """Checks if matrix is I or -I modulo p."""
        a, b, c, d = matrix
        
        # Check off-diagonals
        if not b.is_zero() or not c.is_zero():
            return False
            
        # Check diagonals
        # Case 1: I  (a=1, d=1)
        term_a = a - 1
        term_d = d - 1
        if (term_a % self.p).is_zero() and (term_d % self.p).is_zero():
            return True
            
        # Case 2: -I (a=-1, d=-1)
        term_a = a + 1
        term_d = d + 1
        if (term_a % self.p).is_zero() and (term_d % self.p).is_zero():
            return True
            
        return False

    def is_trivial(self, unreduced_mat):
        """
        Hook to filter out trivial solutions.
        Default: No filtering.
        """
        return False

    def mat_mul_exact(self, m1, m2):
        """Multiplies two 2x2 matrices of polynomials WITHOUT reduction."""
        a1, b1, c1, d1 = m1
        a2, b2, c2, d2 = m2
        
        # Calculate raw product
        a = a1*a2 + b1*c2
        b = a1*b2 + b1*d2
        c = c1*a2 + d1*c2
        d = c1*b2 + d1*d2
        
        return (a, b, c, d)

    def evaluate_word(self, word_str):
        """Evaluates a word string to a matrix in SL_2(Z[t])."""
        # Clean up word string (remove dots, extra spaces)
        clean_word = word_str.replace('.', ' ').split()
        
        # Start with Identity
        current_mat = (self.T[0], self.T[2], self.T[2], self.T[0]) # (1, 0, 0, 1)
        
        # Map string to generator matrix
        gen_map = {
            'T': self.T,
            'Ti': self.T_inv,
            'S': self.S
        }
        
        for move in clean_word:
            if move in gen_map:
                current_mat = self.mat_mul_exact(current_mat, gen_map[move])
            else:
                pass # Should not happen with valid words
                
        return current_mat

    def poly_to_latex(self, p):
        """Converts an fmpz_poly to a LaTeX string with standard notation."""
        if p.is_zero():
            return "0"
        
        coeffs = p.coeffs()
        if not coeffs:
            return "0"
        
        terms = []
        for i, coeff in enumerate(coeffs):
            c = int(coeff)
            if c == 0:
                continue
            
            # Build the term
            if i == 0:
                # Constant term
                terms.append(str(c))
            elif i == 1:
                # Linear term
                if c == 1:
                    terms.append("t")
                elif c == -1:
                    terms.append("-t")
                else:
                    terms.append(f"{c}t")
            else:
                # Higher degree terms
                if c == 1:
                    terms.append(f"t^{{{i}}}")
                elif c == -1:
                    terms.append(f"-t^{{{i}}}")
                else:
                    terms.append(f"{c}t^{{{i}}}")
        
        if not terms:
            return "0"
        
        # Join terms with proper signs
        result = terms[-1]  # Start with highest degree term
        for term in reversed(terms[:-1]):
            if term.startswith('-'):
                result += " - " + term[1:]
            else:
                result += " + " + term
        
        return result

    def matrix_to_latex(self, matrix):
        """Converts a 2x2 matrix tuple to a LaTeX pmatrix string."""
        a, b, c, d = matrix
        
        la = self.poly_to_latex(a)
        lb = self.poly_to_latex(b)
        lc = self.poly_to_latex(c)
        ld = self.poly_to_latex(d)
        
        return r"\begin{pmatrix} " + la + r" & " + lb + r" \\ " + lc + r" & " + ld + r" \end{pmatrix}"

    def search(self, max_depth=50, stop_event=None, verbose=True):
        if verbose:
            print(f"Starting beam search for relations modulo p = {self.p}")
            print(f"Beam width: {self.width}, Randomness: {self.randomness}")
            print("-" * 60)

        # Beam stores tuples: (Cost, Matrix, Word_String, Last_Move_Index)
        initial_mat = (fmpz_poly([1]), fmpz_poly([]), fmpz_poly([]), fmpz_poly([1]))
        beam = [(0, initial_mat, "", -1)] 
        
        start_time = time.time()

        for depth in range(1, max_depth + 1):
            if stop_event and stop_event.is_set():
                if verbose: print("Search stopped by user.")
                return None

            candidates = []
            seen_matrices = set() 
            
            for cost, current_mat, word, last_move_idx in beam:
                for move_idx, (char, gen_mat) in enumerate(self.moves):
                    # Robust backtracking check to handle macros
                    # Get last token of current word
                    if word:
                        # Optimization: we could store last_token in the tuple, 
                        # but splitting the string is safe and robust.
                        # For speed, maybe we should store it, but let's trust python's split is fast enough for now.
                        last_token = word.rsplit(' ', 1)[-1]
                    else:
                        last_token = None
                        
                    # Get first token of new move
                    # char is the word string of the move (e.g. "T S")
                    first_token = char.split(' ', 1)[0]
                    
                    # Check for cancellation
                    if (last_token == 'T' and first_token == 'Ti') or \
                       (last_token == 'Ti' and first_token == 'T') or \
                       (last_token == 'S' and first_token == 'S'):
                        continue
                    
                    new_mat = self.mat_mul(current_mat, gen_mat)
                    
                    # Check if identity found
                    if self.is_identity(new_mat):
                        raw_word = (word + " " + char).strip()
                        formatted_word = raw_word.replace(" ", " . ")
                        
                        # Calculate the unreduced matrix
                        unreduced_mat = self.evaluate_word(formatted_word)
                        
                        # Check if this is a trivial solution (e.g. c=0 in Z[t] when we want c!=0)
                        if self.is_trivial(unreduced_mat):
                            continue
                        
                        # Generate LaTeX for the matrix
                        matrix_latex = self.matrix_to_latex(unreduced_mat)

                        if verbose:
                            print(f"\nSUCCESS! Found relation at depth {depth}:")
                            print(f"Word: {formatted_word}")
                            print(f"Matrix (mod p): {new_mat}")
                            print(f"Matrix (Z[t]): {unreduced_mat}")
                            print(f"Time: {time.time() - start_time:.2f}s")
                        return {
                            'word': formatted_word, 
                            'matrix': str(unreduced_mat),
                            'matrix_latex': matrix_latex
                        }

                    new_cost = self.calculate_cost(new_mat)
                    

                    
                    # Deduplication using string representation of the tuple
                    # (flint objects don't hash by value by default in all versions)
                    mat_sig = str(new_mat)
                    if mat_sig not in seen_matrices:
                        seen_matrices.add(mat_sig)
                        candidates.append((new_cost, new_mat, word + " " + char, move_idx))
            
            # Sort candidates by cost
            candidates.sort(key=lambda x: x[0])
            
            # --- Macro Strategy ---
            # Every few depths, add the best current candidate as a new "macro" move
            if depth % 5 == 0 and candidates:
                best_cost, best_mat, best_word, _ = candidates[0]
                
                # Check if this matrix is already a move to avoid duplicates
                is_new = True
                for _, move_mat in self.moves:
                    # Simple check: compare string representations of the tuple
                    if str(move_mat) == str(best_mat):
                        is_new = False
                        break
                
                if is_new:
                    # Add as new macro
                    # We use the full word string as the "name" effectively, 
                    # but we don't need a special name, we just append the moves.
                    # We store it in self.moves. 
                    # Note: self.moves is a list of (char, matrix). 
                    # For macros, 'char' will be the sequence of moves.
                    
                    # Limit number of macros to avoid slowdown
                    if len(self.moves) < 20: # Start with 3, allow up to 17 macros
                        # Clean up the word for the label
                        macro_label = best_word.strip()
                        self.moves.append((macro_label, best_mat))
                        if verbose:
                            disp_label = macro_label.replace(" ", " . ")
                            print(f">> Added macro move: [{disp_label}] (Cost: {best_cost})")

            # Select next beam
            best_count = int(self.width * (1 - self.randomness))
            random_count = self.width - best_count
            
            next_beam = candidates[:best_count]
            remaining = candidates[best_count:]
            
            if remaining and random_count > 0:
                next_beam.extend(random.sample(remaining, min(len(remaining), random_count)))
            
            beam = next_beam
            
            if not beam:
                if verbose: print("Beam died. Search space exhausted.")
                break
                
            best_of_gen = beam[0]
            # Just printing the cost of the best candidate to show progress
            if depth % 1 == 0 and verbose:
                # Format word with dots
                disp_word = best_of_gen[2].strip().replace(" ", " . ")
                print(f"Depth {depth}: Best Cost = {best_of_gen[0]} ({disp_word})")

        if verbose: print("\nMax depth reached without finding a relation.")
        return None

if __name__ == "__main__":
    print("PSL_2(Z[t]) Relation Finder")
    print("Generators: A = [[1, t], [0, 1]], B = [[0, -1], [1, 0]]")
    
    if len(sys.argv) > 1:
        # Join arguments to handle spaces like "t^2 + 1"
        p_input = " ".join(sys.argv[1:])
    else:
        print("\nEnter polynomial p(t) (e.g. 't^2+1', 't^3-t+1'):")
        p_input = input("> ").strip()
        if not p_input:
            p_input = "t^2+1"
            
    searcher = BeamSearcher(p_input, width=2000, randomness=0.3)
    searcher.search(max_depth=2000)