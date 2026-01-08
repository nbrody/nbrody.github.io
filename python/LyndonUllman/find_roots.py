import sys
import time
import numpy as np
import matplotlib.pyplot as plt
from lyndonBeam import BeamSearcher
from flint import fmpz_poly
import itertools

def generate_polynomials(max_degree, coeff_range=None):
    # Yields coefficient lists for monic polynomials
    # [c_0, c_1, ..., c_{n-1}, 1]
    # corresponding to c_0 + c_1 t + ... + t^n
    #
    # Range logic: for degree d, c_i goes up to 2^(d-i).
    # i.e., c_0 (const) up to 2^d
    #       c_{d-1} up to 2^1 = 2
    #       c_d is 1
    
    for degree in range(2, max_degree + 1):
        # Build ranges for each coefficient c_0 ... c_{degree-1}
        # range_i for c_i is 2**(degree - i)
        ranges = []
        for i in range(degree):
            limit = 2**(degree - i)
            # inclusive range [-limit, limit]
            ranges.append(range(-limit, limit + 1))
            
        # Cartesian product of these ranges
        for coeffs in itertools.product(*ranges):
            # Construct monic polynomial: [c_0, ..., c_{n-1}, 1]
            poly_coeffs = list(coeffs) + [1]
            yield poly_coeffs

def get_poly_str(coeffs):
    # Convert list of coeffs to string for BeamSearcher
    # coeffs is [c_0, c_1, ..., c_n]
    # c_0 + c_1*t + ...
    terms = []
    for i, c in enumerate(coeffs):
        if c == 0: continue
        
        term = ""
        if i == 0:
            term = str(c)
        elif i == 1:
            if c == 1: term = "t"
            elif c == -1: term = "-t"
            else: term = f"{c}t"
        else:
            if c == 1: term = f"t^{i}"
            elif c == -1: term = f"-t^{i}"
            else: term = f"{c}t^{i}"
            
        if term.startswith("-"):
            terms.append(term)
        else:
            if terms:
                terms.append("+" + term)
            else:
                terms.append(term)
                
    return "".join(terms).replace("+-", "-")

def main():
    max_degree = 4
    coeff_range = 2 # -2, -1, 0, 1, 2
    
    successful_roots = []
    successful_polys = []
    
    print(f"Searching for polynomials (deg 2-{max_degree}, coeffs +/-{coeff_range})...")
    
    count = 0
    found = 0
    
    with open("successful_polys.txt", "w") as f:
        f.write(f"Polynomials with relations in SL_2(Z[t]/p)\n")
        f.write(f"Search parameters: max_degree={max_degree}, coeff_range={coeff_range}\n")
        f.write("-" * 40 + "\n")
        
        for coeffs in generate_polynomials(max_degree, coeff_range):
            count += 1
            poly_str = get_poly_str(coeffs)
            
            # Skip trivial or invalid polys if any
            if not poly_str: continue
            
            # Progress indicator every 100 polys
            if count % 100 == 0:
                print(f"Checked {count} polynomials... (Found {found})")
            
            # Run fast search
            # We use a small depth/width for speed. If it exists, it's often found quickly.
            try:
                # Use a slightly wider beam for harder cases
                searcher = BeamSearcher(poly_str, width=200, randomness=0.1)
                result = searcher.search(max_depth=30, verbose=False) 
                
                if result:
                    print(f"FOUND: {poly_str}")
                    found += 1
                    successful_polys.append(poly_str)
                    f.write(f"{poly_str}\n")
                    f.flush() # Ensure it's written immediately
                    
                    # Calculate roots
                    # numpy expects coeffs from highest degree to lowest: [c_n, ..., c_0]
                    # Our coeffs are [c_0, ..., c_n]
                    roots = np.roots(coeffs[::-1])
                    successful_roots.extend(roots)
            except Exception as e:
                # print(f" Error: {e}")
                pass
            
    print(f"\nSearch complete.")
    print(f"Checked {count} polynomials.")
    print(f"Found relations for {found} polynomials.")
    
    # Plotting
    if successful_roots:
        plt.figure(figsize=(12, 12))
        
        # Extract real and imag parts
        reals = [r.real for r in successful_roots]
        imags = [r.imag for r in successful_roots]
        
        plt.scatter(reals, imags, alpha=0.5, s=20, c='blue', edgecolors='none')
        plt.axhline(0, color='black', linewidth=0.5)
        plt.axvline(0, color='black', linewidth=0.5)
        
        # Draw unit circle for reference
        circle = plt.Circle((0, 0), 1, color='red', fill=False, linestyle='--', alpha=0.5)
        plt.gca().add_patch(circle)
        
        plt.grid(True, linestyle='--', alpha=0.3)
        plt.title(f"Roots of Polynomials with Relations (Found {found}/{count})")
        plt.xlabel("Re")
        plt.ylabel("Im")
        
        # Set reasonable limits to see the distribution
        plt.xlim(-2.5, 2.5)
        plt.ylim(-2.5, 2.5)
        
        output_file = "successful_roots.png"
        plt.savefig(output_file, dpi=300)
        print(f"Plot saved to {output_file}")
    else:
        print("No roots to plot.")

if __name__ == "__main__":
    main()
