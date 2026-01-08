
import re
import numpy as np
from collections import Counter

def parse_poly_str(poly_str):
    """
    Parses a string like "-1-t+t^2" into a list of coefficients [a0, a1, a2, ...]
    """
    poly_str = poly_str.replace(" ", "")
    terms = re.findall(r'[+-]?[^-+]+', poly_str)
    coeffs = {}
    
    for term in terms:
        if 't' not in term:
            degree = 0
            val = int(term)
        else:
            if '^' in term:
                base, exp = term.split('^')
                degree = int(exp)
                coeff_str = base.replace('t', '')
            else:
                degree = 1
                coeff_str = term.replace('t', '')
            
            if coeff_str in ['', '+']:
                coeff = 1
            elif coeff_str == '-':
                coeff = -1
            else:
                coeff = int(coeff_str)
                
        coeffs[degree] = coeffs.get(degree, 0) + coeff
            
    if not coeffs: return [0]
    
    max_deg = max(coeffs.keys())
    poly_coeffs = [0] * (max_deg + 1)
    for deg, val in coeffs.items():
        poly_coeffs[deg] = val
        
    return poly_coeffs

def analyze_polynomials(filename="successful_polys.txt"):
    with open(filename, 'r') as f:
        # Better filtering: skip header lines explicitly by content or typical header markers
        lines = []
        for l in f:
            l = l.strip()
            if not l: continue
            if l.startswith("Polynomials"): continue
            if l.startswith("Search"): continue
            if l.startswith("---"): continue
            lines.append(l)

    valid_polys = []
    for line in lines:
        try:
            coeffs = parse_poly_str(line)
            # Ensure it's not just a single number unless it is likely a poly (degree > 0)
            if len(coeffs) > 1 or 't' in line:
                 valid_polys.append((line, coeffs))
        except:
            pass

    print(f"Analyzed {len(valid_polys)} polynomials.")
    
    # Check 1: Reciprocity / Palindromic
    # A polynomial is reciprocal if coeffs are palindromic (or anti-palindromic)
    reciprocal_count = 0
    roots_on_unit_circle_count = 0
    real_rooted_count = 0
    low_mahler_count = 0 
    
    print("\n{:<25} | {:<5} | {:<5} | {:<7} | {:<8} | {:<5}".format("Polynomial", "Recip", "Real", "UnitCir", "Mahler", "Type"))
    print("-" * 75)

    sorted_polys = sorted(valid_polys, key=lambda x: len(x[1])) # Sort by degree approx (length of coeffs)

    for poly_str, coeffs in sorted_polys:
        # Pad coeffs to ensure high degree is last? parse_poly_str returns [a0, a1 ... an]
        # remove trailing zeros if any (shouldn't be for valid polys)
        temp_coeffs = list(coeffs) # Copy
        while temp_coeffs and temp_coeffs[-1] == 0:
            temp_coeffs.pop()
        
        if not temp_coeffs: temp_coeffs = [0]
            
        is_reciprocal = False
        # direct palindrome
        if temp_coeffs == temp_coeffs[::-1]:
            is_reciprocal = True
        # anti-palindrome
        elif temp_coeffs == [-c for c in temp_coeffs[::-1]]:
            is_reciprocal = True
            
        if is_reciprocal:
            reciprocal_count += 1
            
        # Roots analysis
        # numpy roots expects highest degree first
        roots = np.roots(temp_coeffs[::-1])
        
        # Check if roots are on unit circle
        # Allow some epsilon
        magnitudes = np.abs(roots)
        on_unit_circle = np.allclose(magnitudes, 1.0, atol=1e-3)
        if on_unit_circle:
            roots_on_unit_circle_count += 1
            
        # Check if all real
        # complex part is small
        if np.all(np.abs(roots.imag) < 1e-5):
            real_rooted_count += 1
            
        # Mahler measure
        # Leading coefficient contribution? Mahler measure is |an| * prod max(1, |root|)
        # For our polys, they look monic usually, but let's be safe.
        an = temp_coeffs[-1]
        mahler = abs(an) * np.prod([max(1.0, m) for m in magnitudes])
        
        if mahler < 1.001:
             low_mahler_count += 1
        
        # Trace (sum of roots)
        trace = np.sum(roots)
        
        # Pisot / Salem check
        # Filter zero roots first (t factors)
        nonzero_roots = [r for r in roots if abs(r) > 1e-6]
        nonzero_mags = np.abs(nonzero_roots)
        
        is_pisot = False
        is_salem = False
        
        if len(nonzero_roots) > 0:
            # Count roots outside unit circle (> 1 + eps)
            outside_uc = [r for r in nonzero_roots if abs(r) > 1.001]
            # Count roots inside unit circle (< 1 - eps)
            inside_uc = [r for r in nonzero_roots if abs(r) < 0.999]
            # Count roots on unit circle
            on_uc = [r for r in nonzero_roots if 0.999 <= abs(r) <= 1.001]
            
            # Pisot: Exactly 1 outside, rest inside.
            if len(outside_uc) == 1 and len(inner_roots := inside_uc) == len(nonzero_roots) - 1:
                # Must be real and > 1
                 if abs(outside_uc[0].imag) < 1e-5 and outside_uc[0].real > 1:
                     is_pisot = True
                 # Case for negative Pisot? (<-1)
                 if abs(outside_uc[0].imag) < 1e-5 and outside_uc[0].real < -1:
                     is_pisot = True
            
            # Salem: Exactly 1 outside, 1 inside (reciprocal), rest on boundary? 
            # Or just 1 outside, 1 inside, others on boundary.
            if len(outside_uc) == 1 and len(on_uc) > 0 and (len(inside_uc) == 1):
                 if abs(outside_uc[0].imag) < 1e-5 and abs(outside_uc[0].real) > 1:
                     is_salem = True
                     
        type_str = ""
        if is_pisot: type_str = "Pisot"
        elif is_salem: type_str = "Salem"
        elif mahler < 1.001: type_str = "Cyclo"
        
        print(f"{poly_str:<25} | {str(is_reciprocal)[0]:<5} | {str(bool(np.all(np.abs(roots.imag) < 1e-5)))[0]:<5} | {str(on_unit_circle)[0]:<7} | {mahler:.4f}  | {type_str}")

    print("-" * 75)
    print(f"Total: {len(valid_polys)}")
    print(f"Reciprocal: {reciprocal_count} ({reciprocal_count/len(valid_polys)*100:.1f}%)")
    print(f"Real Rooted: {real_rooted_count} ({real_rooted_count/len(valid_polys)*100:.1f}%)")
    print(f"All Roots on Unit Circle: {roots_on_unit_circle_count} ({roots_on_unit_circle_count/len(valid_polys)*100:.1f}%)")
    print(f"Mahler Measure = 1 (Kronecker/Cyclotomic): {low_mahler_count}")


if __name__ == "__main__":
    analyze_polynomials()
