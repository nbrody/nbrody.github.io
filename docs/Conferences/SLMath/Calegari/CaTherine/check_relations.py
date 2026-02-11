import numpy as np

def complex_matrix(a, b, c, d):
    return np.array([[a, b], [c, d]], dtype=complex)

def mat_eq(A, B, label=""):
    """Check if A = B or A = -B (projective equality)"""
    diff_plus = np.linalg.norm(A - B)
    diff_minus = np.linalg.norm(A + B)
    best = min(diff_plus, diff_minus)
    sign = "+" if diff_plus < diff_minus else "-"
    status = "✓" if best < 1e-8 else "✗"
    print(f"  {status} {label}: diff={best:.2e} (sign={sign})")
    return best < 1e-8

def check_jorgensen(n):
    print(f"\n{'='*60}")
    print(f"  JORGENSEN PAPER VERIFICATION, n = {n}")
    print(f"{'='*60}")
    
    psi = (1 + np.sqrt(17 - 8 * np.cos(np.pi / n))) / 2
    theta = np.pi / (2 * n)
    lam = np.exp(1j * theta)
    rho = (np.sqrt(psi + 2) + np.sqrt(psi - 2)) / 2
    denom_x = 2 * np.sqrt(psi - 2)
    x_val = (np.sqrt(3 - psi) + 1j * np.sqrt(psi + 1)) / denom_x
    y_val = (-np.sqrt(3 - psi) + 1j * np.sqrt(psi + 1)) / denom_x
    
    T = complex_matrix(rho, 0, 0, 1/rho)
    Ti = np.linalg.inv(T)
    X = complex_matrix(-lam * x_val, -(1 + x_val**2), 1, (1/lam) * x_val)
    Xi = np.linalg.inv(X)
    
    # Y as defined in math.js: Y = T X^-1 T^-1 X
    Y = T @ Xi @ Ti @ X
    Yi = np.linalg.inv(Y)
    
    # ==============================================
    # From Jorgensen's paper (page 2 and page 12):
    # The automorphism is (X, YX) -> (XY^-1, Y) 
    # i.e. phi(X) = XY^-1, phi(YX) = Y
    # which means phi(Y) = Y (phi(X))^-1 = Y (XY^-1)^-1 = Y YX^-1 = Y^2 X^-1
    # Wait... let me re-read.
    # ==============================================
    # Paper says: (X, YX) |-> (XY^-1, Y)
    # So: phi(X) = XY^-1, and phi(YX) = Y
    # phi(YX) = phi(Y) phi(X) = phi(Y) * XY^-1 = Y
    # => phi(Y) = Y * (XY^-1)^-1 = Y * YX^-1 = Y^2 X^-1
    # Hmm, that doesn't look right for a surface group automorphism...
    # 
    # Actually, wait. The automorphism maps generators TO generators.
    # (X, YX) |-> (XY^-1, Y) means:
    # The pair (X, YX) is mapped to (XY^-1, Y).
    # So X |-> XY^-1 (which is TXT^-1 = XY^-1)
    # and YX |-> Y (which is T(YX)T^-1 = Y)
    # 
    # T(YX)T^-1 = Y
    # (TYT^-1)(TXT^-1) = Y
    # (TYT^-1)(XY^-1) = Y
    # TYT^-1 = Y (XY^-1)^-1 = Y * YX^-1
    # TYT^-1 = Y^2 X^-1
    # Hmm, that doesn't look like a standard form.
    #
    # Actually let me re-read: the paper says on p.2:
    # "The automorphism will be the one determined by 
    #  (X, YX) |-> (XY^-1, Y)"
    # But maybe this is written as ordered pairs (first gen, second gen)?
    # i.e. first generator X maps to XY^-1, second generator YX maps to Y
    # So TXT^-1 = XY^-1 and T(YX)T^-1 = Y
    #
    # From T(YX)T^-1 = Y:
    # TYT^-1 * TXT^-1 = Y
    # TYT^-1 * XY^-1 = Y
    # TYT^-1 = YYX^-1 = Y^2 X^-1  ... hmm
    # 
    # But wait, there could be a different reading:
    # On p.12: "X should be conjugate to XY^-1 and YX to Y under T"
    # Same thing.
    
    print("\n--- Paper's automorphism: (X, YX) -> (XY^-1, Y) ---")
    print("  i.e. TXT^-1 = XY^-1, T(YX)T^-1 = Y")
    
    print("\n  Checking TXT^-1 = XY^-1:")
    mat_eq(T @ X @ Ti, X @ Yi, "TXT^-1 = XY^-1")
    
    print("\n  Checking T(YX)T^-1 = Y:")
    mat_eq(T @ Y @ X @ Ti, Y, "T(YX)T^-1 = Y")
    
    # Derive what TYT^-1 actually is:
    # T(YX)T^-1 = TYT^-1 * TXT^-1 = TYT^-1 * XY^-1 = Y
    # => TYT^-1 = Y * (XY^-1)^-1 = Y * YX^-1
    print("\n  Derived: TYT^-1 = Y * YX^-1 = Y^2 X^-1")
    mat_eq(T @ Y @ Ti, Y @ Y @ Xi, "TYT^-1 = Y^2 X^-1")
    
    # Actually, let me just search what TYT^-1 equals among many candidates
    TYT = T @ Y @ Ti
    
    candidates = {
        "Y^2 X^-1": Y @ Y @ Xi,
        "Y * (XY^-1)^-1": Y @ np.linalg.inv(X @ Yi),
        "Y * YX^-1": Y @ Y @ Xi,  # same as Y^2 X^-1
    }
    
    print("\n  TYT^-1 candidate check:")
    for name, mat in candidates.items():
        mat_eq(TYT, mat, f"TYT^-1 = {name}")
    
    # ==============================================
    # HTML says: TYT^-1 = YXY^-1
    # Paper says: TYT^-1 = Y^2 X^-1
    # ==============================================
    print("\n--- Comparing HTML vs Paper ---")
    print("  HTML relation 3: TYT^-1 = YXY^-1")
    mat_eq(TYT, Y @ X @ Yi, "TYT^-1 = YXY^-1 (HTML)")
    print("  Paper derived: TYT^-1 = Y^2 X^-1")
    mat_eq(TYT, Y @ Y @ Xi, "TYT^-1 = Y^2 X^-1 (Paper)")
    
    # ==============================================
    # Check [X, Y]^n = 1
    # ==============================================
    comm = X @ Y @ Xi @ Yi
    comm_n = np.linalg.matrix_power(comm, n)
    print(f"\n--- [X,Y]^{n} = ±I ---")
    mat_eq(comm_n, np.eye(2), f"[X,Y]^{n} = I")
    mat_eq(comm_n, -np.eye(2), f"[X,Y]^{n} = -I")
    print(f"  tr([X,Y]) = {np.trace(comm):.6f}")
    
    # ==============================================
    # Check Jorgensen's inequality  
    # ==============================================
    trT = np.trace(T)
    commTX = T @ X @ Ti @ Xi
    trComm = np.trace(commTX)
    j_val = abs(trT**2 - 4) + abs(trComm - 2)
    print(f"\n--- Jorgensen's Inequality ---")
    print(f"  |tr^2(T)-4| + |tr([T,X])-2| = {j_val:.6f} >= 1: {'✓' if j_val >= 1-1e-10 else '✗'}")

if __name__ == "__main__":
    check_jorgensen(2)
    check_jorgensen(3)
    check_jorgensen(4)
