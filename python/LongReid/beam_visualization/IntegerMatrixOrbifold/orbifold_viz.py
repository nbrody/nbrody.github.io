import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Polygon
import cmath

# --- Configuration ---
RES = 10000  # Resolution for geodesic discretization

# --- Group Generators (SL2R) ---
# a = [[3, 0], [0, 1/3]]
# b = 1/8 * [[82, 2], [9, 1]]

MAT_a = np.array([[3.0, 0.0], [0.0, 1.0/3.0]])
MAT_b = (1.0/8.0) * np.array([[82.0, 2.0], [9.0, 1.0]])

MAT_ai = np.linalg.inv(MAT_a)
MAT_bi = np.linalg.inv(MAT_b)

GENERATORS = {
    'a': MAT_a,
    'ai': MAT_ai,
    'b': MAT_b,
    'bi': MAT_bi
}

# --- Hyperbolic Geometry Helpers ---

def to_disk(z):
    """Maps Upper Half Plane to Poincaré Disk (i -> 0)."""
    # w = (z - i) / (z + i)
    return (z - 1j) / (z + 1j)

def from_disk(w):
    """Maps Poincaré Disk to Upper Half Plane (0 -> i)."""
    # z = i * (1 + w) / (1 - w)
    return 1j * (1 + w) / (1 - w)

def mobius(M, z):
    """Applies Mobius transform M to complex number z."""
    a, b = M[0, 0], M[0, 1]
    c, d = M[1, 0], M[1, 1]
    return (a * z + b) / (c * z + d)

def get_bisector_circle(w):
    """
    Returns (center, radius) of the Euclidean circle representing the 
    perpendicular bisector between 0 and w in the Poincaré disk.
    
    The bisector is the locus of points z such that d(z, 0) = d(z, w).
    In the disk metric, this is equivalent to |z| = |(z-w)/(1-w_bar*z)|.
    Squaring and rearranging yields a Euclidean circle equation.
    
    |z|^2 = |z-w|^2 / |1-w_bar*z|^2
    |z|^2 |1 - w_bar z|^2 = |z - w|^2
    
    Let k = |w|^2.
    |z|^2 (1 - w_bar z - w z_bar + k |z|^2) = |z|^2 - w_bar z - w z_bar + k
    |z|^2 - z w_bar |z|^2 - z_bar w |z|^2 + k |z|^4 = |z|^2 - w_bar z - w z_bar + k
    k |z|^4 - z w_bar |z|^2 - z_bar w |z|^2 = - w_bar z - w z_bar + k - |z|^2 ? No.
    
    Let's use the formula:
    Center C = w / |w|^2 * (1 + |w|^2)/2 ? No.
    
    The bisector of 0 and w is the geodesic passing through the hyperbolic midpoint m of [0, w]
    and orthogonal to the radius [0, w].
    
    Hyperbolic midpoint m of 0 and w:
    dist(0, m) = 1/2 dist(0, w).
    dist(0, r) = 2 atanh(r).
    r_m = tanh( 1/2 * 2 atanh(|w|) ) = tanh(atanh(|w|)) = |w| ? No.
    r_m = tanh( 1/2 * dist(0, w) ).
    dist(0, w) = 2 atanh(|w|).
    So r_m = tanh( atanh(|w|) ) = |w|. Wait.
    Midpoint distance is half.
    d = 2 atanh(|w|).
    d_mid = atanh(|w|).
    r_mid = tanh(d_mid) = |w| / (1 + sqrt(1-|w|^2)) ? 
    Identity: tanh(x/2) = (cosh x - 1)/sinh x = sinh x / (cosh x + 1).
    Let x = 2 atanh(|w|). tanh(x) = |w|.
    tanh(x/2) = |w| / (1 + sqrt(1 - |w|^2)).
    
    So m = (w / |w|) * r_mid.
    
    The bisector is a circle (or line) passing through m and orthogonal to the line 0-w.
    In Euclidean geometry, a circle orthogonal to a line through the origin at point m
    has its center on the line 0-w? No, the tangent at m is orthogonal to 0-w.
    So the circle itself is tangent to the line perpendicular to 0-w at m? No.
    
    The bisector of 0 and w is a Euclidean circle.
    Points z satisfying |z| = |(z-w)/(1-w'z)|.
    |z|^2 |1 - w'z|^2 = |z-w|^2
    z z' (1 - w'z - wz' + |w|^2 z z') = z z' - w z' - w' z + |w|^2
    |z|^2 - z^2 w' - |z|^2 w z' + |w|^2 |z|^4 = |z|^2 - w z' - w' z + |w|^2
    |w|^2 |z|^4 - |z|^2 (w' z + w z') + (w z' + w' z) - |w|^2 = 0
    
    Let P = w z' + w' z (which is real).
    |w|^2 |z|^4 - P |z|^2 + P - |w|^2 = 0.
    This doesn't look like a circle equation A|z|^2 + Bz + ...
    
    Wait, the bisector of 0 and w is simply the isometric circle of the transformation mapping 0 to w?
    No.
    
    Let's use the property that the bisector is the geodesic perpendicular to the segment [0, w] at its midpoint.
    Midpoint m = w * (1 - sqrt(1-|w|**2)) / |w|**2  (using tanh(x/2) formula simplification)
    Actually simpler: m = w / (1 + sqrt(1 - |w|**2)).
    
    The bisector is a generalized circle orthogonal to the unit circle and orthogonal to the line 0-w at m.
    Wait, it's orthogonal to the line 0-w at m? Yes.
    So it is a circle centered on the line 0-w (extended)? No.
    If it's orthogonal to the radius 0-w, its tangent at m is perpendicular to 0-w.
    So the circle itself is NOT centered on the line 0-w.
    
    Actually, for the Dirichlet domain centered at 0, the bisectors are the loci |z| = |g^{-1}(z)|.
    Since g(0) = w, this is |z| = |(z-w)/(1-w'z)|.
    
    Let's use a numerical approach or a known formula.
    Formula: The perpendicular bisector of [0, w] is the Euclidean circle with:
    Center c_E = w * (1 + |w|^2) / (2 * |w|^2) ? No.
    
    Let's derive from |z|^2 |1-w'z|^2 = |z-w|^2.
    |z|^2 (1 - w'z - wz' + |w|^2 |z|^2) = |z|^2 - wz' - w'z + |w|^2
    |z|^2 - |z|^2 w'z - |z|^2 wz' + |w|^2 |z|^4 = |z|^2 - wz' - w'z + |w|^2
    |w|^2 |z|^4 - |z|^2 (w'z + wz') + (wz' + w'z) - |w|^2 = 0
    
    This equation involves |z|^4, which implies it's not a circle?
    Ah, |(z-w)/(1-w'z)| is the distance from w.
    We want d(z, 0) = d(z, w).
    So |z| = dist_M(z, w).
    
    Wait, standard result: The bisector of 0 and a point r (real) is a circle.
    Let w = r (real).
    |z|^2 |1-rz|^2 = |z-r|^2
    |z|^2 (1 - 2rx + r^2 |z|^2) = |z|^2 - 2rx + r^2
    |z|^2 - 2rx|z|^2 + r^2 |z|^4 = |z|^2 - 2rx + r^2
    - 2rx|z|^2 + r^2 |z|^4 = - 2rx + r^2
    r^2 |z|^4 - 2rx |z|^2 + 2rx - r^2 = 0.
    
    This still looks quartic.
    
    Let's step back. The bisector of [0, w] is the geodesic passing through m and perpendicular to 0-w.
    Geodesics in D are circles orthogonal to the boundary.
    So we need a circle passing through m, orthogonal to the unit circle, and orthogonal to the line 0-w.
    A circle orthogonal to the line 0-w must have its center on the line perpendicular to 0-w? No.
    If a circle is orthogonal to a line at point m, its center lies on the tangent to the line at m.
    The tangent to 0-w at m is the line L perpendicular to 0-w at m.
    So the center of our geodesic circle lies on L.
    Also, the circle is orthogonal to the unit circle.
    Let the center be C. Radius R. |C|^2 = R^2 + 1.
    C lies on the line L.
    L is the line through m perpendicular to w.
    Equation of L: (z - m) . w = 0 (dot product of vectors).
    
    Let's implement `get_geodesic_perp_bisector(w)`.
    1. Compute midpoint m = w / (1 + sqrt(1 - |w|^2)).
    2. We need a circle (Center C, Radius R) such that:
       - C is orthogonal to unit circle: |C|^2 - R^2 = 1.
       - Circle passes through m: |m - C|^2 = R^2.
       - Circle is orthogonal to radius 0-w at m.
         The tangent of the circle at m is perpendicular to 0-w? No, the curve is perpendicular.
         So the tangent vector of the circle at m is orthogonal to w.
         This means the radius vector C-m is parallel to w.
         So C lies on the line passing through m with direction w.
         This means C lies on the line 0-w!
         
         Wait, if C lies on 0-w, and it passes through m, and is orthogonal to unit circle...
         Then it intersects 0-w at m.
         Is it orthogonal to 0-w? No, it's tangent to the perpendicular.
         Yes, if C is on the line 0-w, the circle is perpendicular to the *circles centered at origin*.
         So the bisector of 0 and w is indeed a circle centered on the line extending 0-w.
         
    Let's verify.
    We need a geodesic perpendicular to the radius 0-w.
    The radius 0-w is a geodesic.
    So we need a geodesic orthogonal to the geodesic 0-w at m.
    Yes.
    
    So, Center C is on the line extending 0-w. C = k * w.
    We need |C|^2 - R^2 = 1.
    And |m - C|^2 = R^2.
    Substitute R^2: |C|^2 - |m - C|^2 = 1.
    Let C and m be treated as vectors (or complex numbers). C is parallel to m.
    |C|^2 - (|C| - |m|)^2 = 1  (assuming C is further out than m, which it should be).
    |C|^2 - (|C|^2 - 2|C||m| + |m|^2) = 1.
    2|C||m| - |m|^2 = 1.
    2|C||m| = 1 + |m|^2.
    |C| = (1 + |m|^2) / (2|m|).
    
    So C = (w / |w|) * (1 + |m|^2) / (2|m|).
    R = sqrt(|C|^2 - 1).
    
    This defines the circle.
    
    """
    w_abs = abs(w)
    if w_abs == 0: return None
    
    # Hyperbolic midpoint m
    m_abs = w_abs / (1 + np.sqrt(1 - w_abs**2))
    m = w * (m_abs / w_abs)
    
    # Center C of the bisector circle
    # C lies on the ray 0-w.
    # |C| = (1 + |m|^2) / (2|m|)
    c_abs = (1 + m_abs**2) / (2 * m_abs)
    C = w * (c_abs / w_abs)
    
    # Radius R
    R = np.sqrt(c_abs**2 - 1)
    
    return C, R, m

def fold_point(z, generators, max_iter=100):
    """
    Iteratively applies generators to move z into the fundamental domain.
    Strategy: If |g(z)| < |z|, update z = g(z).
    """
    current_z = z
    for _ in range(max_iter):
        improved = False
        # Check neighbors: a, ai, b, bi
        # We want to minimize distance to origin => minimize |z| in disk
        current_dist = abs(current_z)
        
        best_z = current_z
        best_dist = current_dist
        
        for name, mat in generators.items():
            # Apply Mobius in Disk:
            # Convert D -> H -> apply -> D
            z_h = from_disk(current_z)
            z_h_new = mobius(mat, z_h)
            z_d_new = to_disk(z_h_new)
            
            dist_new = abs(z_d_new)
            if dist_new < best_dist - 1e-9: # Tolerance
                best_dist = dist_new
                best_z = z_d_new
                improved = True
        
        if improved:
            current_z = best_z
        else:
            break
            
    return current_z

# --- Main Execution ---

def main():
    fig, ax = plt.subplots(figsize=(10, 10))
    
    # Draw Unit Circle
    unit_circle = Circle((0, 0), 1, color='black', fill=False, linewidth=2)
    ax.add_patch(unit_circle)
    
    # --- 1. Draw Dirichlet Domain ---
    # The domain is bounded by the bisectors of 0 and g(0) for g in the index 2 subgroup
    # Generators: a^2, a b^{-1} a, a^2 b^{-1}
    
    # Define the specific side-pairing elements requested
    # a^2
    mat_a2 = np.dot(GENERATORS['a'], GENERATORS['a'])
    # a b^{-1} a
    mat_a_bi_a = np.dot(np.dot(GENERATORS['a'], GENERATORS['bi']), GENERATORS['a'])
    # a^2 b^{-1}
    mat_a2_bi = np.dot(np.dot(GENERATORS['a'], GENERATORS['a']), GENERATORS['bi'])
    
    # Inverses
    mat_ai2 = np.linalg.inv(mat_a2)
    mat_ai_b_ai = np.linalg.inv(mat_a_bi_a)
    mat_b_ai2 = np.linalg.inv(mat_a2_bi)
    
    DOMAIN_GENERATORS = {
        'a2': mat_a2,
        'ai2': mat_ai2,
        'a.bi.a': mat_a_bi_a,
        'ai.b.ai': mat_ai_b_ai,
        'a2.bi': mat_a2_bi,
        'b.ai2': mat_b_ai2
    }
    
    z0_h = 1j
    images = {}
    for name, mat in DOMAIN_GENERATORS.items():
        img_h = mobius(mat, z0_h)
        img_d = to_disk(img_h)
        images[name] = img_d
        
    # Draw bisectors
    # Colors: Pair inverses with same color
    colors = {
        'a2': 'red', 'ai2': 'red',
        'a.bi.a': 'green', 'ai.b.ai': 'green',
        'a2.bi': 'blue', 'b.ai2': 'blue'
    }
    
    # LaTeX Label Mapping
    latex_labels = {
        'a2': r"$a^2$",
        'ai2': r"$a^{-2}$",
        'a.bi.a': r"$a b^{-1} a$",
        'ai.b.ai': r"$a^{-1} b a^{-1}$",
        'a2.bi': r"$a^2 b^{-1}$",
        'b.ai2': r"$b a^{-2}$"
    }

    def dist_disk(z1, z2):
        # Hyperbolic distance metric (or monotonic function of it)
        # d = |(z1-z2)/(1-z1*z2.conj)|
        if abs(1 - z1 * z2.conjugate()) < 1e-9: return float('inf')
        return abs((z1 - z2) / (1 - z1 * z2.conjugate()))

    def draw_clipped_bisector(ax, name, mat, all_gens, color):
        img_h = mobius(mat, 1j)
        img_d = to_disk(img_h)
        C, R, m = get_bisector_circle(img_d)
        
        # Discretize circle
        thetas = np.linspace(0, 2*np.pi, 1000)
        points = C + R * np.exp(1j * thetas)
        
        # Filter points inside the unit disk
        points = points[abs(points) < 1.0]
        
        valid_points = []
        
        # Pre-calculate images for all generators to speed up check
        other_images = []
        for g_name, g_mat in all_gens.items():
            if g_name == name: continue
            im_h = mobius(g_mat, 1j)
            other_images.append(to_disk(im_h))
            
        # Check Dirichlet condition
        # A point p on bisector of g is valid if d(p, 0) <= d(p, h(0)) for all h != g
        # Since p is on bisector, d(p, 0) = d(p, g(0)).
        
        # Optimization: We only need to check against other generators.
        # Tolerance needed for floating point comparisons
        tol = 1e-5
        
        for p in points:
            d0 = dist_disk(p, 0)
            is_valid = True
            for other_img in other_images:
                # We use a slight tolerance to avoid noise at vertices
                if dist_disk(p, other_img) < d0 - tol:
                    is_valid = False
                    break
            if is_valid:
                valid_points.append(p)
                
        if not valid_points:
            return

        # Group into segments (indices are not continuous due to filtering)
        # But we iterated theta.
        # We need to detect jumps.
        # Actually, `points` array was filtered by abs<1, so indices might jump.
        # Let's just iterate and split when distance is large.
        
        segments = []
        current_segment = [valid_points[0]]
        
        for i in range(1, len(valid_points)):
            if abs(valid_points[i] - valid_points[i-1]) > 0.1: # Jump
                segments.append(current_segment)
                current_segment = []
            current_segment.append(valid_points[i])
        segments.append(current_segment)
        
        # Draw segments
        for seg in segments:
            if len(seg) < 2: continue
            xs = [p.real for p in seg]
            ys = [p.imag for p in seg]
            ax.plot(xs, ys, color=color, linewidth=2)
            
        # Label at midpoint of the longest segment
        longest_seg = max(segments, key=len)
        mid_idx = len(longest_seg) // 2
        mid_point = longest_seg[mid_idx]
        
        # Offset label slightly towards the generator (away from origin)
        # Direction is from 0 to mid_point
        label_pos = mid_point * 1.1
        
        lbl = latex_labels.get(name, name)
        ax.text(label_pos.real, label_pos.imag, lbl, color=color, 
                fontsize=14, ha='center', va='center') # Removed fontweight bold for math text

    print("Drawing Dirichlet Domain boundaries (Hexagon)...")
    for name, mat in DOMAIN_GENERATORS.items():
        draw_clipped_bisector(ax, name, mat, DOMAIN_GENERATORS, colors[name])
        
        # Plot the generator point
        # ax.plot(img_d.real, img_d.imag, 'o', color=colors[name], markersize=5)

    # --- 2. Draw Geodesic ---
    word_str = "b.ai.bi.ai.b.a.a.a.bi.ai.bi.a.a.b.ai.bi.bi.a.a.a.a.b.ai.bi.ai.ai.ai.ai.b.a.b.ai.bi.ai.b.a.b.ai.ai.ai.bi.a.b.a.bi.ai"
    ops = word_str.split('.')
    
    # Compute the total matrix M for the word
    M_total = np.eye(2)
    # Word is applied right to left? Or left to right?
    # Usually "b.a" means b then a? Or b applied to a?
    # In geometric group theory, path starts at origin.
    # z1 = g1(z0), z2 = g1(g2(z0))...
    # So M_total = g1 * g2 * ...
    
    # Let's assume standard concatenation
    matrix_list = []
    for op in ops:
        matrix_list.append(GENERATORS[op])
        
    # Compute fixed points of the word (Axis)
    # M = M1 * M2 * ... * Mn
    M_word = np.eye(2)
    for mat in matrix_list:
        M_word = np.dot(M_word, mat)
        
    # Fixed points: z = (az+b)/(cz+d) => cz^2 + (d-a)z - b = 0
    a, b = M_word[0,0], M_word[0,1]
    c, d = M_word[1,0], M_word[1,1]
    
    delta = (d - a)**2 + 4*b*c
    # Since trace > 2 (likely), delta > 0.
    
    if c != 0:
        z1 = (-(d - a) + cmath.sqrt(delta)) / (2*c)
        z2 = (-(d - a) - cmath.sqrt(delta)) / (2*c)
    else:
        # Linear case (shouldn't happen for hyperbolic)
        z1 = 0 # Placeholder
        z2 = 0
        
    # Map fixed points to disk
    w1 = to_disk(z1)
    w2 = to_disk(z2)
    
    print(f"Geodesic endpoints in Disk: {w1}, {w2}")
    
    # Generate points along the geodesic in D
    # The geodesic between w1 and w2 in D is a circle arc orthogonal to boundary.
    # We can parameterize it.
    # Or simpler: Generate points on the axis in H (vertical line or semi-circle) and map to D.
    
    # Axis in H connects z1 and z2.
    # Parametrization:
    # If z1, z2 real: Center (z1+z2)/2, Radius |z1-z2|/2.
    # z(t) = Center + R * e^(i t).
    
    # Ensure z1, z2 are real (they should be for hyperbolic element in SL2R)
    if abs(z1.imag) < 1e-9: z1 = z1.real
    if abs(z2.imag) < 1e-9: z2 = z2.real
    
    axis_points_h = []
    # Parameter s represents hyperbolic distance along the geodesic from the highest point
    # Range [-50, 50] covers a very long portion of the geodesic
    s_values = np.linspace(-50, 50, RES)
    
    if abs(z1.imag) < 1e-9 and abs(z2.imag) < 1e-9:
        # Semi-circle in H
        center = (z1 + z2) / 2
        radius = abs(z1 - z2) / 2
        
        # theta(s) = 2 * arctan(e^s)
        # But we need to be careful with direction. 
        # s -> -inf => theta -> 0
        # s -> +inf => theta -> pi
        thetas = 2 * np.arctan(np.exp(s_values))
        
        axis_points_h = center + radius * np.exp(1j * thetas)
    else:
        # Fallback (shouldn't be reached for this group)
        pass
        
    # Map to D
    axis_points_d = to_disk(axis_points_h)
    
    # Fold points into Fundamental Domain
    print("Folding geodesic into fundamental domain...")
    folded_points = []
    point_colors = []
    
    # Create a color map value for each point (0 to 1)
    # We want the color to shift along the geodesic
    color_vals = np.linspace(0, 1, len(axis_points_d))
    
    for i, p in enumerate(axis_points_d):
        if abs(p) >= 0.999: continue # Skip points too close to boundary
        # Use the domain generators for folding
        p_folded = fold_point(p, DOMAIN_GENERATORS)
        folded_points.append(p_folded)
        point_colors.append(color_vals[i])
        
    # Plot folded points
    fx = [p.real for p in folded_points]
    fy = [p.imag for p in folded_points]
    
    # Scatter with color gradient
    # s=1 for finer dots
    sc = ax.scatter(fx, fy, s=1, c=point_colors, cmap='hsv', label='Folded Geodesic', zorder=10)
    
    # Styling
    ax.set_aspect('equal')
    ax.set_xlim(-1.1, 1.1)
    ax.set_ylim(-1.1, 1.1)
    ax.axis('off')
    
    # Legend
    # Create custom legend handles
    from matplotlib.lines import Line2D
    legend_elements = [
        Line2D([0], [0], color='red', lw=2, label='a2 / ai2'),
        Line2D([0], [0], color='blue', lw=2, label='a2.bi / b.ai2'),
        Line2D([0], [0], color='green', lw=2, label='a.bi.a / ai.b.ai'),
        Line2D([0], [0], marker='o', color='w', markerfacecolor='purple', markersize=5, label='Geodesic (Color varies)')
    ]
    ax.legend(handles=legend_elements, loc='upper right')
    
    plt.title("Dirichlet Domain & Folded Geodesic")
    plt.savefig("orbifold_viz.png", dpi=300, bbox_inches='tight')
    print("Saved visualization to orbifold_viz.png")

if __name__ == "__main__":
    main()
