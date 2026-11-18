## The 3-adic solenoid

**Entry notes.** Interactive · desktop and mobile · tap to interact on mobile (click on desktop).
Tags: Topology, Dynamical systems, Number theory.
Palette: main `#818cf8`, secondary `#2dd4bf`, highlight `#fbbf24`, background `#060a14`, text `#eef1f8` (dark);
light theme main `#5f67cf`, secondary `#0d9488`, highlight `#d97706`, background `#ffffff`, text `#16181e`.
Feed mode has no text. Esc (or ✕) returns from interact mode to the feed. `?embed=true` hides all chrome,
`?mode=interact` opens engaged, `?theme=light|dark` overrides the system setting.

A 3-adic integer is an endless string of digits, *x* = *a*₀ + 3*a*₁ + 9*a*₂ + ⋯ with each *a*ᵢ ∈ {0, 1, 2}. Sort them by *a*₀ into three disks, each of those by *a*₁ into three smaller disks, and so on: the 3-adic integers ℤ₃ form a Cantor set. Adding 1 is an odometer: bump *a*₀ and carry, so …222 + 1 = …000.

The **3-adic solenoid** is the mapping torus of that odometer,

    Sol₃ = ℤ₃ × [0, 1] / (x, 1) ∼ (x + 1, 0),

the Cantor set carried once around a circle and glued back to itself after adding 1. It is also the inverse limit of circles under *z* ↦ *z*³, and the Pontryagin dual of ℤ[1/3].

### What you're seeing
The solid torus is *T*₀. Keeping only *k* digits gives ℤ/3ᵏ, and its mapping torus is a single circle that winds 3ᵏ times around; thickened, that is the tube *T*ₖ. Each tube lies inside the one before and winds 3 times around it. These are exactly the nested solid tori of the Smale–Williams map

    f(θ, w) = (3θ, λw + c e^{iθ}),  λ = 0.35, c = 0.5,

which stretches the solid torus to three times its length, thins it and wraps it inside itself. Its attractor, the intersection of all the *T*ₖ, is Sol₃. In the cross-section at angle ψ, the point *x* sits at

    w(ψ, x) = Σ_{j≥1} λ^{j−1} c · e^{i(ψ + 2π(x mod 3^j))/3^j}

(turned a quarter so that 0 starts at the top). Every level of disks turns at its own rate, 1/3ʲ of a turn per trip around, like an orrery, and after one full trip *w*(ψ + 2π, *x*) = *w*(ψ, *x* + 1): every disk has moved into the slot of its successor.

The cut shows that cross-section. In the feed the tubes draw themselves one level at a time, then the cut opens and travels twice around while the bead rides along; it comes back in the slot of 1, then of 2.

### Connected, but not path-connected
A path in Sol₃ can only move in the circle direction, so each path component is a line that winds around forever without closing up, and every one of them is dense. All the ordinary integers lie on the same line, the one through 0, because *w*(ψ, *n*) = *w*(ψ + 2π*n*, 0). The bead's lit path is a piece of such a line.

### Try this
- Press **+1** (or Space): the cut travels once around and every label lands where its successor began. **−1** (Shift+Space) goes back. The slider scrubs within a turn, and the arrow keys nudge.
- Tap a disk in the cross-section to move the bead there, then go around a few times and watch its address count up, with carries.
- Change the depth (1–6). Depth *k* draws ℤ/3ᵏ: one strand, 3ᵏ times around.
- Turn off **Turn the torus with the cut** to hold the torus still and watch the wedge travel instead.
- **View → Face** looks straight into the cut; **Whole** backs out. Drag to orbit, scroll or pinch to zoom.

**References.** S. Smale, "Differentiable dynamical systems", *Bull. AMS* 73 (1967), 747–817. R. F. Williams, "One-dimensional non-wandering sets", *Topology* 6 (1967), 473–487. D. van Dantzig, "Über topologisch homogene Kontinua", *Fund. Math.* 15 (1930), 102–125.
