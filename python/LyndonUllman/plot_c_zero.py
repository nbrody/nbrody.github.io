import matplotlib.pyplot as plt
import numpy as np
import re
from flint import fmpz_poly

def parse_poly_str(poly_str):
    # Hacky parse to coefficients
    # Better to reuse the parser from lyndonBeam logic via flint if available
    # But here we just want coeffs for numpy roots
    
    # We can use flint to parse string if simple
    # "t^3 - 3t + 1"
    # fmpz_poly(list) constructor doesn't take string.
    # But I can eval it if I setup t variable.
    
    try:
        t = fmpz_poly([0, 1])
        s = poly_str.replace('^', '**')
        # Insert *
        s = re.sub(r'(\d)t', r'\1*t', s)
        val = eval(s, {"t": t})
        if isinstance(val, int): return [val]
        return val.coeffs()
    except:
        return []

def main():
    try:
        with open("successful_polys_c_zero.txt", "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        print("File successful_polys_c_zero.txt not found.")
        return

    roots = []
    
    count = 0
    for line in lines:
        line = line.strip()
        if not line or line.startswith("Polynomials") or line.startswith("Search") or line.startswith("-"):
            continue
            
        coeffs = parse_poly_str(line)
        if coeffs:
            # Flint coeffs are [c0, c1, ...]. Numpy wants [cn, ..., c0]
            coeffs_rev = [int(x) for x in coeffs][::-1]
            r = np.roots(coeffs_rev)
            roots.extend(r)
            count += 1
            
    print(f"Loaded {count} polynomials. Found {len(roots)} roots.")
    
    if roots:
        plt.figure(figsize=(10, 10))
        reals = [r.real for r in roots]
        imags = [r.imag for r in roots]
        
        plt.scatter(reals, imags, alpha=0.5, s=20, c='blue', edgecolors='none')
        plt.axhline(0, color='black', linewidth=0.5)
        plt.axvline(0, color='black', linewidth=0.5)
        
        circle = plt.Circle((0, 0), 1, color='red', fill=False, linestyle='--', alpha=0.5)
        plt.gca().add_patch(circle)
        
        plt.grid(True, linestyle='--', alpha=0.3)
        plt.title(f"Roots of 'c=0' Relation Polynomials")
        plt.xlabel("Re")
        plt.ylabel("Im")
        
        # Limit to relevant area
        plt.xlim(-2.5, 2.5)
        plt.ylim(-2.5, 2.5)
        
        plt.savefig("successful_roots_c_zero.png", dpi=300)
        print("Plot saved to successful_roots_c_zero.png")

if __name__ == "__main__":
    main()
