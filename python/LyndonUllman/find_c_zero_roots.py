import sys
import os
import time
import numpy as np
import matplotlib.pyplot as plt
import itertools

# Fix path to import UpperTriangularSearcher
sys.path.append(os.path.join(os.getcwd(), "templates", "upperTriangular"))

try:
    from search_c_zero import UpperTriangularSearcher
except ImportError:
    # Fallback if running from a different directory structure
    print("Could not import UpperTriangularSearcher. Ensure you are in the LyndonUllman directory.")
    sys.exit(1)

def generate_polynomials(max_degree):
    # Yields coefficient lists for monic polynomials
    # [c_0, c_1, ..., c_{n-1}, 1]
    # corresponding to c_0 + c_1 t + ... + t^n
    # Range: coefficient of t^i is in [-2**(d-i), 2**(d-i)]
    
    for degree in range(1, max_degree + 1):
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
                
    result = "".join(terms).replace("+-", "-")
    return result if result else "0"

def main():
    max_degree = 4
    output_txt = "successful_polys_c_zero.txt"
    output_png = "successful_roots_c_zero.png"
    
    successful_roots = []
    successful_polys = []
    
    print(f"Searching for c=0 polynomials (deg 1-{max_degree})...")
    
    count = 0
    found = 0
    
    with open(output_txt, "w") as f:
        f.write(f"Polynomials with c=0 relations in SL_2(Z[t]/p)\n")
        f.write(f"Search parameters: max_degree={max_degree}, coeff limit 2^(d-i)\n")
        f.write("-" * 40 + "\n")
        
        for coeffs in generate_polynomials(max_degree):
            count += 1
            poly_str = get_poly_str(coeffs)
            
            # Skip trivial or invalid polys
            if not poly_str or poly_str == "0": continue
            
            if count % 100 == 0:
                print(f"Checked {count} polynomials... (Found {found})")
            
            try:
                # Use UpperTriangularSearcher
                # We suppress verbose output for bulk search unless found
                searcher = UpperTriangularSearcher(poly_str, width=1000, randomness=0.3)
                
                # Check d=1 case carefully or just run search
                # max_depth=30 should be sufficient for many relations
                result = searcher.search(max_depth=40, verbose=False)  
                
                if result:
                    print(f"FOUND: {poly_str}")
                    found += 1
                    successful_polys.append(poly_str)
                    f.write(f"{poly_str}\n")
                    f.flush() 
                    
                    # Calculate roots (numpy expects highest degree first)
                    roots = np.roots(coeffs[::-1])
                    successful_roots.extend(roots)
            except Exception as e:
                # print(f" Error searching {poly_str}: {e}")
                pass
            
    print(f"\nSearch complete.")
    print(f"Checked {count} polynomials.")
    print(f"Found relations for {found} polynomials.")
    
    # Plotting
    if successful_roots:
        plt.figure(figsize=(12, 12))
        
        reals = [r.real for r in successful_roots]
        imags = [r.imag for r in successful_roots]
        
        plt.scatter(reals, imags, alpha=0.5, s=20, c='blue', edgecolors='none')
        plt.axhline(0, color='black', linewidth=0.5)
        plt.axvline(0, color='black', linewidth=0.5)
        
        circle = plt.Circle((0, 0), 1, color='red', fill=False, linestyle='--', alpha=0.5)
        plt.gca().add_patch(circle)
        
        plt.grid(True, linestyle='--', alpha=0.3)
        plt.title(f"Roots of Polynomials with 'c=0' Relations (Found {found}/{count})")
        plt.xlabel("Re")
        plt.ylabel("Im")
        
        # Determine strict limits or auto-scale
        # Many roots might be near unit circle or spread out.
        # Let's use auto-scale but ensure 0,0 is centered?
        max_range = max(max(abs(r) for r in reals), max(abs(i) for i in imags), 2.5)
        plt.xlim(-max_range, max_range)
        plt.ylim(-max_range, max_range)
        
        plt.savefig(output_png, dpi=300)
        print(f"Plot saved to {output_png}")
    else:
        print("No roots to plot.")

if __name__ == "__main__":
    main()
