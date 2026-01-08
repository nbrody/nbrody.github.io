from flint import fmpz

def solve_diophantine(limit=20):
    print(f"{'a':<3} {'b':<3} {'c':<3} {'d':<3} | {'x':<3} {'y':<3}")
    print("-" * 30)
    
    seen = set()
    
    # Iterate through possible coefficients
    for a in range(limit):
        for c in range(limit):
            s1 = fmpz(a)**2 + fmpz(c)**2
            
            for b in range(limit):
                for d in range(limit):
                    s2 = fmpz(b)**2 + fmpz(d)**2
                    
                    if s2 <= s1: continue
                    
                    # We need (S2 - S1) / (S2 + S1) to be a square (x/y)^2
                    num = s2 - s1
                    den = s2 + s1
                    
                    # Check if num*den is a perfect square
                    product = num * den
                    root = product.isqrt()
                    
                    if root * root == product:
                        # Calculate primitive x, y
                        # x/y = sqrt(num/den) = sqrt(num*den)/den = root/den
                        common = root.gcd(den)
                        x = int(root // common)
                        y = int(den // common)
                        
                        # Store and print unique structural solutions
                        sol = (a, b, c, d, x, y)
                        if sol not in seen:
                            seen.add(sol)
                            print(f"{a:<3} {b:<3} {c:<3} {d:<3} | {x:<3} {y:<3}")

if __name__ == "__main__":
    solve_diophantine()