Node checks for the engine (no browser needed; run from this folder's parent):

    node tests/examples.mjs        # every example builds to an embedding with healthy clearance
    node tests/gradcheck.mjs       # analytic gradients of each energy term vs finite differences
    node tests/barrier.mjs         # same, with the contact barrier active
    node tests/chol.mjs            # the envelope Cholesky solves the preconditioner system (vs CG)
    node tests/isotopy.mjs fig8    # no step moves a bead more than half the clearance before it
    node tests/coarsen.mjs         # exact build + guarded bead thinning keeps every example's invariants
    node tests/invariants.mjs      # knot determinants / linking numbers unchanged by relaxing
    node tests/settle.mjs k4,cube  # which point group each example settles into (slow for big graphs)
    node tests/explore.mjs theta-tangled 6   # basin hopping, as the Explore button does it

Expected: examples, gradcheck, chol, isotopy, coarsen and invariants all pass; settle gives
θ → D3h, K4 → Td, cube → Oh, dodecahedron → Ih, K3,3 → D3h, K5 → Td, trefoil → D3.
