import sys
import time

def mat_mul(A, B, p):
    """Multiplies two 3x3 matrices A and B modulo p."""
    C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for i in range(3):
        for j in range(3):
            val = 0
            for k in range(3):
                val += A[i][k] * B[k][j]
            C[i][j] = val % p
    return tuple(tuple(row) for row in C)

def get_identity():
    return ((1, 0, 0), (0, 1, 0), (0, 0, 1))

def mat_scalar_add(A, s, p):
    """Computes A + s*I modulo p."""
    # Convert tuple back to list for editing
    C = [list(row) for row in A]
    for i in range(3):
        C[i][i] = (C[i][i] + s) % p
    return tuple(tuple(row) for row in C)

def mat_sq(A, p):
    """Computes A^2 modulo p."""
    return mat_mul(A, A, p)

def sl3_order(p):
    """Calculates the theoretical order of SL(3, F_p)."""
    # Order = p^3 * (p^2 - 1) * (p^3 - 1)
    return (p**3) * ((p**2) - 1) * ((p**3) - 1)

def explore_group(p, limit=6000000):
    print(f"--- Exploring group for p={p} ---")
    
    # 1. Define Generator 'a'
    # a = ((0, 1, 0), (1, 0, -1), (0, -1, -1))
    a = (
        (0, 1, 0),
        (1, 0, -1 % p),
        (0, -1 % p, -1 % p)
    )

    # 2. Define Generator 'b' = a^2 - 2I
    # First compute a^2
    a2 = mat_sq(a, p)
    # Subtract 2I (which is adding -2 mod p along diagonal)
    b = mat_scalar_add(a2, -2, p)

    # 3. Define Generator 't'
    # t = ((3, 4, 6), (2, 3, 4), (2, 3, 5))
    t = (
        (3 % p, 4 % p, 6 % p),
        (2 % p, 3 % p, 4 % p),
        (2 % p, 3 % p, 5 % p)
    )

    gens = [a, b, t]
    
    # Verify determinants (Sanity Check)
    # Not strictly necessary for the BFS, but good for debugging math
    # skipping for speed, assumed correct by problem statement.

    # 4. BFS Initialization
    identity = get_identity()
    visited = {identity}
    queue = [identity]
    
    # Statistics
    full_sl3 = sl3_order(p)
    print(f"Theoretical size of SL(3, {p}): {full_sl3:,}")
    print("Starting BFS enumeration (this may take a while for p >= 7)...")
    
    start_time = time.time()
    count = 0
    
    # 5. BFS Loop
    # We use a pointer based queue approach for slightly better memory in pure Python
    # though a deque is usually preferred, list is okay for simple int/tuple storage here.
    import collections
    queue = collections.deque([identity])
    
    while queue:
        current = queue.popleft()
        count += 1
        
        if count % 100000 == 0:
            elapsed = time.time() - start_time
            print(f"Found {count:,} elements... ({elapsed:.2f}s)")
            if count > limit:
                print(f"⚠️ LIMIT REACHED ({limit}). Stopping early.")
                print(f"The group is likely SL(3, {p}) or very large.")
                return

        # Multiply current by all generators
        for g in gens:
            # We multiply from the right: current * g
            nxt = mat_mul(current, g, p)
            if nxt not in visited:
                visited.add(nxt)
                queue.append(nxt)
                
    elapsed = time.time() - start_time
    print(f"--- Finished ---")
    print(f"Total Group Order found: {len(visited):,}")
    
    if len(visited) == full_sl3:
        print(f"✅ MATCH: This is the full SL(3, {p}).")
    else:
        index = full_sl3 / len(visited)
        print(f"❌ SUBGROUP: Index {index:.2f} in SL(3, {p}).")

def main():
    print("SL(3, Z) Subgroup Order Calculator")
    print("Generators: a, b=a^2-2I, t")
    
    while True:
        try:
            val = input("\nEnter a prime p (or 'q' to quit): ")
            if val.lower() == 'q':
                break
            p = int(val)
            if p < 2:
                print("Please enter a prime >= 2.")
                continue
            
            # Warn for large primes
            if p == 7:
                print("Warning: p=7 will generate ~5.6 million elements.")
                print("This requires ~1GB RAM and may take 30-60 seconds.")
            elif p > 7:
                print("Warning: p > 7 yields massive groups.")
                print("p=11 is ~200 million elements (likely MemoryError).")
                print("Proceeding with a safety limit...")
                
            explore_group(p)
            
        except ValueError:
            print("Invalid input. Please enter an integer.")
        except KeyboardInterrupt:
            print("\nInterrupted.")
            break

if __name__ == "__main__":
    main()