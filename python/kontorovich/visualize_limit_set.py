
import numpy as np
import matplotlib.pyplot as plt

def main():
    # Matrices from kontorovich.py
    # a = ((1,1,2),(0,1,1),(0,-3,-2))
    # b = ((-2,0,-1),(-5,1,-1),(3,0,1))
    
    a = np.array([
        [1, 1, 2],
        [0, 1, 1],
        [0, -3, -2]
    ], dtype=float)
    
    b = np.array([
        [-2, 0, -1],
        [-5, 1, -1],
        [3, 0, 1]
    ], dtype=float)
    
    # Inverses (a and b are order 3, so inv = square)
    A = a @ a
    B = b @ b
    
    generators = [a, A, b, B]
    gen_names = ['a', 'A', 'b', 'B']
    
    # Type 0: a, A
    # Type 1: b, B
    gen_types = [0, 0, 1, 1]
    
    # Valid next types
    # 0 -> 1
    # 1 -> 0
    
    # Initial point in R^3 (homogeneous coordinates for z=1 patch origin)
    # Using a generic point to avoid being stuck in a proper subspace if [0,0,1] is special
    start_point = np.array([0, 0, 1], dtype=float)
    
    points_2d = []
    
    # BFS to generate orbit
    # Queue stores: (current_matrix, last_type)
    # We apply matrices on the left: M * v
    # Or should we accumulate the total matrix M and then compute M * v? Yes.
    
    # (Matrix, last_type_index)
    current_level = [(np.eye(3), -1)] 
    
    depth = 12
    print(f"Generating group elements to depth {depth}...")
    
    # Collect points from all levels
    all_matrices = [np.eye(3)]
    
    visited_hashes = set() # To simple avoid total duplicates if any
    
    for d in range(depth):
        next_level = []
        print(f"Depth {d}, level size: {len(current_level)}")
        
        for mat, last_type in current_level:
            # Try all generators
            for i, gen in enumerate(generators):
                this_type = gen_types[i]
                
                # Rule: Alternate types
                if last_type != -1 and this_type == last_type:
                    continue
                
                new_mat = gen @ mat
                
                # Check duplication? (Floating point is tricky, skip rigorous check for now, just visual)
                # Store
                new_v = new_mat @ start_point
                
                # We can store the point immediately
                all_matrices.append(new_mat)
                next_level.append((new_mat, this_type))
        
        current_level = next_level

    print(f"Total matrices generated: {len(all_matrices)}")
    
    # Project and collect coordinates
    xs = []
    ys = []
    
    print("Projecting points...")
    for mat in all_matrices:
        v = mat @ start_point
        x, y, z = v[0], v[1], v[2]
        
        if abs(z) > 1e-9:
            xs.append(x / z)
            ys.append(y / z)
        else:
            # Point at infinity in this chart
            pass
            
    # Plotting
    print("Plotting...")
    plt.figure(figsize=(10, 10))
    plt.scatter(xs, ys, s=0.5, alpha=0.5, c='blue', marker='.')
    plt.title(f"Limit Set Visualization (Depth {depth}, z=1 patch)")
    plt.xlabel("x/z")
    plt.ylabel("y/z")
    plt.grid(True, linestyle=':', alpha=0.6)
    
    # Save
    output_path = "limit_set_z1.png"
    plt.savefig(output_path, dpi=300)
    print(f"Saved plot to {output_path}")

if __name__ == "__main__":
    main()
