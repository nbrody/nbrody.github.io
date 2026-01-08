import re
import numpy as np
import matplotlib.pyplot as plt

def parse_poly_str(poly_str):
    # Parses string like "1-2t+t^2" into list of coefficients [c_0, c_1, ..., c_n]
    # Assumes variable is 't'
    
    # Replace - with +- to split by +
    s = poly_str.replace("-", "+-")
    if s.startswith("+-"):
        s = s[1:] # Remove leading + from +-
        
    terms = s.split("+")
    coeffs = {}
    max_deg = 0
    
    for term in terms:
        term = term.strip()
        if not term: continue
        
        coeff = 1
        deg = 0
        
        if "t" not in term:
            # Constant
            if term == "-": coeff = -1 # Should not happen with split logic usually but good to be safe
            else: coeff = int(term)
            deg = 0
        else:
            # Has t
            parts = term.split("t")
            # parts[0] is coeff, parts[1] is exponent part
            
            # Parse coeff
            c_str = parts[0]
            if c_str == "": coeff = 1
            elif c_str == "-": coeff = -1
            else: coeff = int(c_str)
            
            # Parse degree
            exp_part = parts[1]
            if exp_part == "":
                deg = 1
            elif exp_part.startswith("^"):
                deg = int(exp_part[1:])
            else:
                # Should not happen in our format
                deg = 1
                
        coeffs[deg] = coeffs.get(deg, 0) + coeff
        max_deg = max(max_deg, deg)
        
    # Construct list [c_0, ..., c_n]
    coeff_list = [0] * (max_deg + 1)
    for d, c in coeffs.items():
        coeff_list[d] = c
        
    return coeff_list

def main():
    filename = "successful_polys.txt"
    roots = []
    count = 0
    
    print(f"Reading polynomials from {filename}...")
    
    with open(filename, "r") as f:
        lines = f.readlines()
        
    for line in lines:
        line = line.strip()
        if not line or line.startswith("Polynomials") or line.startswith("Search") or line.startswith("---"):
            continue
            
        try:
            coeffs = parse_poly_str(line)
            # numpy roots expects [c_n, ..., c_0]
            r = np.roots(coeffs[::-1])
            roots.extend(r)
            count += 1
        except Exception as e:
            print(f"Error parsing '{line}': {e}")
            
    print(f"Parsed {count} polynomials.")
    print(f"Total roots found: {len(roots)}")
    
    # Plotting
    plt.figure(figsize=(12, 12))
    
    reals = [r.real for r in roots]
    imags = [r.imag for r in roots]
    
    plt.scatter(reals, imags, alpha=0.5, s=20, c='blue', edgecolors='none')
    plt.axhline(0, color='black', linewidth=0.5)
    plt.axvline(0, color='black', linewidth=0.5)
    
    # Unit circle
    circle = plt.Circle((0, 0), 1, color='red', fill=False, linestyle='--', alpha=0.5)
    plt.gca().add_patch(circle)
    
    plt.grid(True, linestyle='--', alpha=0.3)
    plt.title(f"Roots of {count} Polynomials with Relations in SL_2(Z[t]/p)")
    plt.xlabel("Re")
    plt.ylabel("Im")
    plt.xlim(-2.5, 2.5)
    plt.ylim(-2.5, 2.5)
    
    output_file = "successful_roots.png"
    plt.savefig(output_file, dpi=300)
    print(f"Plot saved to {output_file}")

if __name__ == "__main__":
    main()
