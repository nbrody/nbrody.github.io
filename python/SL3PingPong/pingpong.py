import flint
from flint import arb_mat, arb, acb_mat

# Set precision (bits)
flint.ctx.prec = 100

def normalize_proj(v):
    """Normalize a vector for projective space (max norm 1)."""
    norm = max(abs(x) for x in v)
    if norm == 0: return v
    return [x / norm for x in v]

def vector_angle_sin(v1, v2):
    """
    Computes |sin(theta)| between two vectors v1, v2.
    Used as a projective metric d(v1, v2).
    For complex vectors, uses Hermitian-like norms.
    """
    # |v1 x v2| / (|v1|*|v2|)
    # For 3D, cross product is convenient.
    # Convert to standard python lists of arbs for calculation
    x = [v1[i,0] for i in range(3)]
    y = [v2[i,0] for i in range(3)]
    
    # Cross product
    c = [x[1]*y[2] - x[2]*y[1],
         x[2]*y[0] - x[0]*y[2],
         x[0]*y[1] - x[1]*y[0]]
    
    norm_c = (abs(c[0])**2 + abs(c[1])**2 + abs(c[2])**2).sqrt()
    norm_x = (abs(x[0])**2 + abs(x[1])**2 + abs(x[2])**2).sqrt()
    norm_y = (abs(y[0])**2 + abs(y[1])**2 + abs(y[2])**2).sqrt()
    
    return norm_c / (norm_x * norm_y)

def dist_point_plane(v, normal):
    """
    Computes projective distance between point v and plane defined by 'normal'.
    d(v, H) = |v . normal| / (|v| * |normal|)
    """
    x = [v[i,0] for i in range(3)]
    n = [normal[i,0] for i in range(3)]
    
    dot = abs(x[0]*n[0] + x[1]*n[1] + x[2]*n[2])
    norm_x = (abs(x[0])**2 + abs(x[1])**2 + abs(x[2])**2).sqrt()
    norm_n = (abs(n[0])**2 + abs(n[1])**2 + abs(n[2])**2).sqrt()
    
    return dot / (norm_x * norm_n)

def compute_invariant_conic(M):
    """
    Compute the invariant conic for an SL(3) element in the Z=1 affine patch.
    
    For a matrix with eigenvectors v1, v2, v3 and eigenvalues λ1, λ2, λ3,
    the invariant conic in the eigenbasis has the form:
        α*x² + β*y² + γ*z² = 0
    where the coefficients are related to log(|λi|).
    
    Returns: dict with 'coeffs' (a,b,c,d,e,f for ax²+bxy+cy²+dx+ey+f=0),
             'type' ('ellipse', 'hyperbola', 'parabola', or 'degenerate'),
             'eigenvecs' (the three eigenvectors in affine coords)
    """
    import math
    
    # Get eigenvalues and eigenvectors
    eig_res = M.eig(right=True)
    if len(eig_res) == 2:
        vals, vecs = eig_res
    elif len(eig_res) == 3:
        vals = eig_res[0]
        vecs = eig_res[2]
    else:
        vals = eig_res[0]
        vecs = eig_res[-1]
    
    # Sort by magnitude
    indices = sorted(range(3), key=lambda i: abs(vals[i]), reverse=True)
    
    # Extract eigenvalues and eigenvectors (real parts)
    eig_vals = [float(vals[indices[i]].real) for i in range(3)]
    eig_vecs = []
    for j in range(3):
        idx = indices[j]
        v = [float(vecs[i, idx].real) for i in range(3)]
        eig_vecs.append(v)
    
    # Check for complex or zero eigenvalues
    if any(abs(v) < 1e-10 for v in eig_vals):
        return None
    
    # Compute log ratios for the conic coefficients
    # The invariant conic in the eigenbasis is: α*x² + β*y² + γ*z² = 0
    # where α = log|λ2/λ3|, β = log|λ3/λ1|, γ = log|λ1/λ2|
    # (These sum to zero, ensuring a proper conic)
    try:
        log_vals = [math.log(abs(v)) for v in eig_vals]
    except (ValueError, ZeroDivisionError):
        return None
    
    # Coefficients in eigenbasis (for homogeneous coords)
    alpha = log_vals[1] - log_vals[2]  # log|λ2/λ3|
    beta = log_vals[2] - log_vals[0]   # log|λ3/λ1|  
    gamma = log_vals[0] - log_vals[1]  # log|λ1/λ2|
    
    # Build the conic matrix in eigenbasis: diag(alpha, beta, gamma)
    # Transform to standard basis using eigenvector matrix P
    # C_std = P^T * C_eig * P
    
    # P is the matrix with eigenvectors as columns
    P = [[eig_vecs[j][i] for j in range(3)] for i in range(3)]
    
    # C_eig = diag(alpha, beta, gamma)
    C_eig = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    C_eig[0][0] = alpha
    C_eig[1][1] = beta
    C_eig[2][2] = gamma
    
    # Compute P^T * C_eig * P
    # First: temp = C_eig * P
    temp = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for i in range(3):
        for j in range(3):
            temp[i][j] = sum(C_eig[i][k] * P[k][j] for k in range(3))
    
    # Then: C_std = P^T * temp
    C_std = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for i in range(3):
        for j in range(3):
            C_std[i][j] = sum(P[k][i] * temp[k][j] for k in range(3))
    
    # Make symmetric (should already be, but numerical precision)
    for i in range(3):
        for j in range(i+1, 3):
            avg = (C_std[i][j] + C_std[j][i]) / 2
            C_std[i][j] = avg
            C_std[j][i] = avg
    
    # Extract affine conic coefficients for Z=1 patch
    # Homogeneous conic: C[0][0]*x² + 2*C[0][1]*xy + C[1][1]*y² + 2*C[0][2]*xz + 2*C[1][2]*yz + C[2][2]*z² = 0
    # Set z=1: a*x² + b*xy + c*y² + d*x + e*y + f = 0
    a = C_std[0][0]
    b = 2 * C_std[0][1]  
    c = C_std[1][1]
    d = 2 * C_std[0][2]
    e = 2 * C_std[1][2]
    f = C_std[2][2]
    
    # Determine conic type from discriminant B² - 4AC
    disc = b*b - 4*a*c
    if abs(disc) < 1e-10:
        conic_type = 'parabola'
    elif disc > 0:
        conic_type = 'hyperbola'
    else:
        conic_type = 'ellipse'
    
    # Also return eigenvector projections to affine coords
    affine_eigenvecs = []
    for v in eig_vecs:
        if abs(v[2]) > 1e-10:
            affine_eigenvecs.append([v[0]/v[2], v[1]/v[2]])
        else:
            affine_eigenvecs.append(None)  # Point at infinity
    
    return {
        'coeffs': [a, b, c, d, e, f],
        'type': conic_type,
        'affine_eigenvecs': affine_eigenvecs,
        'homogeneous_eigenvecs': eig_vecs
    }


def get_spectral_data(M):
    """
    Returns (attractor_vec, repelling_normal_vec, contraction_ratio)
    
    Handles cases with repeated eigenvalues:
    - If dominant eigenvalue has multiplicity 1: attractor is the dominant eigenvector
    - If dominant eigenvalue has multiplicity 2: attractor is the repelling eigenvector's complement
      (we return one arbitrary direction in the attracting plane)
    - If all eigenvalues are equal: matrix is essentially scalar, no meaningful dynamics
    """
    # Force computation of right eigenvectors
    eig_res = M.eig(right=True)
    if len(eig_res) == 2:
        vals, vecs = eig_res
    elif len(eig_res) == 3:
        # Likely (vals, left, right) or similar structure
        vals = eig_res[0]
        vecs = eig_res[2] # Take the last one as right eigenvectors
    else:
        # Fallback
        vals = eig_res[0]
        vecs = eig_res[-1]
    
    # Sort by magnitude of eigenvalues
    indices = sorted(range(3), key=lambda i: abs(vals[i]), reverse=True)
    
    # Check for repeated eigenvalues (within a tolerance)
    def eigenvalues_equal(i, j, tol=1e-6):
        return abs(abs(vals[i]) - abs(vals[j])) < tol * max(abs(vals[i]), abs(vals[j]), 1e-10)
    
    # Determine multiplicity of dominant eigenvalue
    dom_idx = indices[0]
    dom_mult = 1
    if eigenvalues_equal(indices[0], indices[1]):
        dom_mult = 2
        if eigenvalues_equal(indices[1], indices[2]):
            dom_mult = 3
    
    if dom_mult == 3:
        # All eigenvalues equal - essentially a scalar matrix
        # Return arbitrary directions
        attractor = acb_mat(3, 1)
        attractor[0, 0] = 1; attractor[1, 0] = 0; attractor[2, 0] = 0
        normal_mat = acb_mat(3, 1)
        normal_mat[0, 0] = 0; normal_mat[1, 0] = 0; normal_mat[2, 0] = 1
        return attractor, normal_mat, 1.0
    
    elif dom_mult == 2:
        # Dominant eigenvalue has multiplicity 2 - we have an "attracting plane"
        # The repelling direction is the eigenvector for the smallest eigenvalue
        rep_idx = indices[2]
        repelling_vec = [vecs[i, rep_idx] for i in range(3)]
        
        # The repelling vector IS the normal to the attracting plane
        # We can pick any vector in the attracting plane as the "attractor"
        # Let's pick the first dominant eigenvector
        try:
            attractor = vecs[:, indices[0]]
        except TypeError:
            attractor = acb_mat(3, 1)
            for i in range(3): attractor[i, 0] = vecs[i, indices[0]]
        
        # The repelling plane normal in this case is actually the attractor of M^(-1)
        # which is the eigenvector of the smallest eigenvalue
        normal_mat = acb_mat(3, 1)
        for i in range(3): 
            normal_mat[i, 0] = repelling_vec[i]
        
        ratio = abs(vals[indices[2]]) / abs(vals[indices[0]])
        return attractor, normal_mat, float(ratio)
    
    else:
        # Normal case: distinct eigenvalues
        # 1. Attracting Eigenvector (Dominant)
        try:
            attractor = vecs[:, dom_idx]
        except TypeError:
            attractor = acb_mat(3, 1)
            for i in range(3): attractor[i, 0] = vecs[i, dom_idx]
        
        # 2. Repelling Plane (Spanned by other two)
        # Check if the two non-dominant eigenvalues are equal (repelling plane case)
        idx2 = indices[1]
        idx3 = indices[2]
        
        if eigenvalues_equal(idx2, idx3):
            # Two smallest eigenvalues are equal - we have a "repelling plane"
            # The normal to the repelling plane is the dominant eigenvector
            # But for consistency, compute the left eigenvector for smallest eigenvalue
            # Actually, the normal should be from the transpose's dominant eigenvector
            # For simplicity, use cross product (will still work if eigenvectors are independent)
            pass
        
        # Extract columns manually to be safe
        v2 = [vecs[i, idx2] for i in range(3)]
        v3 = [vecs[i, idx3] for i in range(3)]
        
        # Cross product
        normal = [v2[1]*v3[2] - v2[2]*v3[1],
                  v2[2]*v3[0] - v2[0]*v3[2],
                  v2[0]*v3[1] - v2[1]*v3[0]]
        
        # Check if cross product is near zero (parallel vectors, shouldn't happen with distinct eigs)
        norm_sq = sum(abs(x)**2 for x in normal)
        if float(norm_sq.real) < 1e-12:
            # Fallback: use a perpendicular to attractor
            att_vec = [attractor[i, 0] for i in range(3)]
            # Find a vector not parallel to attractor
            if abs(att_vec[0]) < 0.9:
                perp = [1, 0, 0]
            else:
                perp = [0, 1, 0]
            # Cross product to get normal
            normal = [att_vec[1]*perp[2] - att_vec[2]*perp[1],
                      att_vec[2]*perp[0] - att_vec[0]*perp[2],
                      att_vec[0]*perp[1] - att_vec[1]*perp[0]]
        
        # Convert normal back to acb_mat column
        normal_mat = acb_mat(3, 1)
        for i in range(3): normal_mat[i, 0] = normal[i]
        
        # 3. Contraction strength estimate (ratio of |lambda_2| / |lambda_1|)
        ratio = abs(vals[indices[1]]) / abs(vals[indices[0]])
        
        return attractor, normal_mat, float(ratio)

def analyze_ping_pong(k, user_generators, extra_words=None):
    """
    Analyzes ping pong property for a set of generators.
    user_generators: dict mapping name (str) -> matrix object
    k: power to raise generators to
    extra_words: list of strings, e.g. ["a.b", "a.b.a_inv"]
    """
    
    # Default fallback if empty (though app should prevent this)
    if not user_generators:
        # P = ((1,0,0),(1,1,0),(0,0,1))
        a = arb_mat([[1,0,0],[1,1,0],[0,0,1]])
        t = arb_mat([[0,0,1],[1,0,0],[0,1,0]])
        user_generators = {'a': a, 't': t}
    
    # Build the full set of generators (including inverses) for Ping Pong Analysis
    # And build the map of inverses
    generators_map = {} # name -> matrix (raised to power k)
    base_generators_map = {} # name -> matrix (original, for word computation)
    inv_map = {}
    
    # Process inputs
    for name, mat in user_generators.items():
        # Store base generator
        base_generators_map[name] = mat
        
        # Try to compute inverse for base map
        try:
            mat_inv = mat.inv()
            base_generators_map[f"{name}_inv"] = mat_inv
        except Exception:
            pass # Maybe not invertible? App handles errors before this call ideally.
            
        # Power k for ping pong domains
        try:
            mat_k = mat ** k
            mat_inv_k = mat_k.inv()
        except Exception as e:
             return {'success': False, 'valid': False, 'error': f"Matrix {name} error: {str(e)}", 'warnings': [], 'generators': {}}
             
        generators_map[name] = mat_k
        generators_map[f"{name}_inv"] = mat_inv_k
        
        inv_map[name] = f"{name}_inv"
        inv_map[f"{name}_inv"] = name

    names = list(generators_map.keys())
    data = {}

    # 1. Compute Eigen-stuff for all generators
    for name in names:
        M = generators_map[name]
        try:
            att, rep_norm, ratio = get_spectral_data(M)
        except Exception as e:
            return {'success': False, 'valid': False, 'error': f"Spectral analysis failed for {name}: {str(e)}", 'warnings': [], 'generators': {}}
        
        # att and rep_norm are acb_mat, so entries are acb. Use .real for visualization.
        att_list = [float(att[i,0].real) for i in range(3)]
        rep_norm_list = [float(rep_norm[i,0].real) for i in range(3)]
        
        # Also send the full matrix for animation purposes
        mat_list = []
        for r in range(3):
            row_vals = []
            for c in range(3):
                val = M[r,c]
                try:
                    row_vals.append(float(val.real))
                except:
                    row_vals.append(float(val))
            mat_list.append(row_vals)
        
        # Compute invariant conic
        conic_data = None
        try:
            conic_result = compute_invariant_conic(M)
            if conic_result:
                conic_data = {
                    'coeffs': conic_result['coeffs'],
                    'type': conic_result['type'],
                    'affine_eigenvecs': conic_result['affine_eigenvecs']
                }
        except Exception as e:
            pass  # Conic computation failed, that's okay
        
        data[name] = {
            'att': att, 
            'rep_norm': rep_norm, 
            'ratio': float(ratio),
            'att_vec': att_list,
            'rep_norm_vec': rep_norm_list,
            'mat': mat_list,
            'conic': conic_data
        }

    # Check pairwise separation and determine radii
    min_separation = 1000.0
    
    # Calculate per-generator radius based on local separation
    for n1 in names:
        my_min_dist = 1000.0
        for n2 in names:
            if n1 == n2: continue
            dist = vector_angle_sin(data[n1]['att'], data[n2]['att'])
            
            # Convert arb to float for comparison
            dist_float = float(dist) if hasattr(dist, '__float__') else float(dist.real) if hasattr(dist, 'real') else dist
            
            if dist_float < my_min_dist:
                my_min_dist = dist_float
            # Update global min
            if dist_float < min_separation: 
                min_separation = dist_float
        
        # Set radius to slightly less than half the distance to nearest neighbor
        # This ensures domains are disjoint
        data[n1]['radius'] = float((my_min_dist / 2.0) * 0.90)

    # Verification Logic:
    # Heuristic check for Ping Pong condition
    
    max_radius = float(min_separation / 2.0)
    valid = True
    warnings = []
    
    for g_name in names:
        for other_name in names:
            if other_name == g_name: continue
            if other_name == inv_map.get(g_name): continue
            
            # Check if g maps U_{other} into U_g
            # Condition: U_{other} must be away from Repelling Plane of g
            # specifically, U_{other} shouldn't intersect the "repelling zone".
            
            dist_to_rep = dist_point_plane(data[other_name]['att'], data[g_name]['rep_norm'])
            
            # Check if the ball U_{other} effectively crosses the repelling plane?
            # heuristic: center distance should be > radius
            if float(dist_to_rep) < data[other_name]['radius']: 
                warnings.append(f"Generator {other_name}'s domain might intersect repelling plane of {g_name}")
                valid = False
            elif float(dist_to_rep) < 0.05: # Global fail-safe
                valid = False
                warnings.append(f"Attractor of {other_name} dangerously close to repelling plane of {g_name}")
                
    # Process Extra Words
    word_results = []
    if extra_words:
        for word_str in extra_words:
            # Word is dot separated, e.g. "a.b_inv.a"
            parts = word_str.split('.')
            if not parts or parts == ['']: continue
            
            try:
                # Use base_generators_map which has originals and inverses
                if not all(p in base_generators_map for p in parts):
                    continue

                res_mat = base_generators_map[parts[0]]
                for p in parts[1:]:
                    res_mat = res_mat * base_generators_map[p]
                
                # Get attractor (dominant eigenvector) of the word
                att, _, _ = get_spectral_data(res_mat)
                att_list = [float(att[i,0].real) for i in range(3)]
                
                word_results.append({
                    'word': word_str,
                    'att_vec': att_list
                })
            except Exception as e:
                pass

    result = {
        'k': k,
        'generators': data,
        'min_separation': float(min_separation),
        'max_radius': float(max_radius),
        'valid': valid,
        'warnings': warnings,
        'words': word_results
    }
    return result

if __name__ == "__main__":
    # Run for powers 1 through 4
    for k in range(1, 5):
        res = analyze_ping_pong(k)
        print(f"--- k={res['k']} ---")
        if res['valid']:
            print("Valid Ping Pong structure found!")
        else:
            print("Invalid structure.")
        for w in res['warnings']:
            print(w)
        print("")