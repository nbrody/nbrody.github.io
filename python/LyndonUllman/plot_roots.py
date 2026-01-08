import numpy as np
import matplotlib.pyplot as plt
import re

def parse_poly(poly_str):
    """
    Parses a string like "-1-t+t^2" into a list of coefficients [a0, a1, a2, ...]
    where p(t) = a0 + a1*t + a2*t^2 + ...
    """
    # Normalize string: remove spaces
    poly_str = poly_str.replace(" ", "")
    
    # Split by + or - but keep the delimiter
    # Lookahead to split before + or -
    terms = re.findall(r'[+-]?[^-+]+', poly_str)
    
    coeffs = {}
    
    for term in terms:
        # Check for 't'
        if 't' not in term:
            # Constant term
            degree = 0
            val = int(term)
            coeffs[0] = coeffs.get(0, 0) + val
        else:
            # Term with t
            # Check for power
            if '^' in term:
                base, exp = term.split('^')
                degree = int(exp)
                coeff_str = base.replace('t', '')
            else:
                # Just 't' -> degree 1
                degree = 1
                coeff_str = term.replace('t', '')
            
            # Parse coefficient
            if coeff_str in ['', '+']:
                coeff = 1
            elif coeff_str == '-':
                coeff = -1
            else:
                try:
                    coeff = int(coeff_str)
                except:
                    # Case like '2t' -> coeff_str is '2'
                    coeff = int(coeff_str)
                    
            coeffs[degree] = coeffs.get(degree, 0) + coeff
            
    # Convert coeffs dict to list [a0, a1, ...]
    if not coeffs:
        return [0]
        
    max_deg = max(coeffs.keys())
    poly_coeffs = [0] * (max_deg + 1)
    for deg, val in coeffs.items():
        poly_coeffs[deg] = val
        
    return poly_coeffs

def find_roots_and_plot(filename="successful_polys.txt"):
    all_roots = []
    
    with open(filename, 'r') as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        if not line or line.startswith('-') and 'Search' in line: continue # Skip headers
        if line.startswith('Polynomials'): continue
        if line.startswith('--'): continue
        
        # Parse polynomial
        # Note: line might start with '-' which is fine for parse_poly
        # However, checking degree to ensure it's a polynomial line
        if 't' not in line and '1' not in line and '2' not in line: 
             continue # Empty or weird line
             
        try:
            c = parse_poly(line)
            # numpy roots expects [an, an-1, ... a0] (highest degree first)
            # Our parse_poly returns [a0, a1, ...] (lowest degree first)
            # So reverse it
            roots = np.roots(c[::-1])
            all_roots.extend(roots)
        except Exception as e:
            # print(f"Skipping {line}: {e}")
            pass

    # Plot
    plt.figure(figsize=(10, 10))
    
    # Extract real and imaginary parts
    X = [r.real for r in all_roots]
    Y = [r.imag for r in all_roots]
    
    plt.scatter(X, Y, s=10, alpha=0.5, c='blue', marker='.')
    plt.axhline(0, color='black', linewidth=0.5)
    plt.axvline(0, color='black', linewidth=0.5)
    plt.grid(True, linestyle='--', alpha=0.3)
    plt.title(f"Roots of {len(lines)} Successful Polynomials")
    plt.xlabel("Real Part")
    plt.ylabel("Imaginary Part")
    
    # Ensure aspect ratio is 1:1 to see symmetry
    plt.axis('equal')
    
    plt.savefig('successful_roots.png')
    print("Plot saved to successful_roots.png")

if __name__ == "__main__":
    find_roots_and_plot()
