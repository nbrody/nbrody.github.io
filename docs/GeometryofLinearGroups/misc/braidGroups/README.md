# braidGroups — Burau representation research & visualizers

Tools for exploring (un)faithfulness of the reduced Burau representation of
the braid group B₄, focused on Birman's free subgroup
F₂ = ⟨X, Y⟩ with X = σ₃σ₁⁻¹, Y = σ₂σ₃σ₁⁻¹σ₂⁻¹
(lowercase `x, y` denote inverses in word notation).

## Layout

```
braidGroups/
├── index.html, style.css, js/   Braid visualizer webapp (Bₙ braids, disk model, 3D)
├── burau/index.html             Static Burau explorer: theory, relation search UI,
│                                word calculator, and the t=2 kernel-word writeup
├── python/                      Research scripts (see table below)
├── data/                        Result databases (JSON)
└── README.md
```

Published URLs (GitHub Pages): `…/misc/braidGroups/index.html` and
`…/misc/braidGroups/burau/index.html`. A former Flask app (`app.py` +
`templates/`) and an `_archive/` of superseded experiments were removed in
June 2026; see git history if needed.

## Python scripts

| Script | Purpose | Deps |
|---|---|---|
| `rationalKernelSearch.py` | **Main result.** Kernel words of Burau(B₄) at rational t = p/q via the parabolic-commutator construction (below). Exact `Fraction` arithmetic; writes `data/rational_kernel_db.json`. | stdlib |
| `symbolicParabolicSweep.py` | One-pass sweep over ℤ[t,t⁻¹]: finds **all** specializations (rational and algebraic) reachable by parabolic words of length ≤ L, via gcd of first-row entries. | python-flint |
| `relation_database.py` | Older systematic relation finder at fixed algebraic specializations (t = −1, i, ζ₃, ζ₅, φ, …) using companion-matrix embeddings; writes `data/relation_db.json`. | python-flint |
| `flashbeam_f2.py` | Original FlashBeam search at concrete t values. **Caveat:** float arithmetic — only exact at dyadic t; its 62-letter "t=2 relation" was a float artifact (disproved by exact arithmetic). | numpy |
| `beamB4mod3.py` | Beam search over 𝔽₃[t,t⁻¹] with exact Laurent arithmetic. | python-flint |
| `mpsBeam.py` | GPU (PyTorch/MPS) beam search over ℤ/5ℤ[t,t⁻¹] windows. | torch |
| `padicTriBeam.py` | p-adic beam search for triangular words at t = p/q (plateaus; superseded by the collision search in `rationalKernelSearch.py`). | stdlib |

Examples:

```sh
python3 python/rationalKernelSearch.py -t 2 3 3/2        # per-t search
python3 python/symbolicParabolicSweep.py -L 12           # all-t sweep
```

## Databases

- `data/rational_kernel_db.json` — 84 rational specializations |p|, q ≤ 8:
  status, parabolic word `p`, unipotent `v = [p,u]`, exponents, and the
  explicit verified kernel word where small. Headline findings in `_meta`.
- `data/relation_db.json` — relations at algebraic specializations
  (t = −1, i, ζ₃, ζ₅, ζ₈, ζ₁₂, golden ratio, …) from the older searches.

## Headline results (June 2026)

**Mechanism.** Over ℤ[t,t⁻¹], u = x Y X y is lower triangular with diagonal
(t⁴, t⁻², t⁻²) and *central* Levi block t⁻²I. Hence for any word p whose
specialized matrix has first row ∝ e₁ᵀ ("parabolic"), v = [p,u] lies in the
abelian unipotent group N = I + (a e₂ + b e₃)e₁ᵀ, where conjugation by u⁻¹
is multiplication by t⁶ and vᵏ = I + k(v−I). At t = p/q this gives the exact
Baumslag–Solitar relation

    u⁻¹ v^(q⁶) u = v^(p⁶)

so u⁻¹v^(q⁶)u·v^(−p⁶) is a nontrivial element of F₂ (conjugate powers in a
free group force equal exponents) in the kernel of the specialized Burau
representation. This explains the exponent 64 = 2⁶ in the original t=2
discovery.

**Findings.**
- t = 2: shortest known witness p = `X X X y X X y y X X Y Y X Y X` (15
  letters), v = [p,u] (36 letters), kernel word u⁻¹vuv⁻⁶⁴ (2340 letters),
  verified in exact rational arithmetic. The older 92-letter w₂ relation is
  also exact; the 62-letter float-search "relation" is not.
- Among all 84 rationals with |p|, q ≤ 8, only t = 2 and t = 1/2 (mirror
  under t ↔ 1/t) admit parabolic words at search depth (collision
  constituents ≤ 11; t = 3 excluded to parabolic length ≤ 30).
- Symbolic sweep of all 1,062,880 words of length ≤ 12: **no** word is
  parabolic at any rational t ∉ {0, ±1}; 145,184 are parabolic at algebraic
  points — dominated by t² − t + 1 (ζ₆, degenerate since t⁶ = 1), plus
  usable non-cyclotomic values (roots of t² + t − 1, t³ − t² + 1,
  t⁴ + t − 1, …). Both length-15 parabolics at t = 2 have first-row gcd
  (t − 2)(t² − t + 1).
- The only words ≤ 12 parabolic identically in t are the powers of u.
