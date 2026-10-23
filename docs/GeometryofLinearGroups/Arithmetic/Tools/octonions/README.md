# Octavians & G₂ buildings

Exact arithmetic in Coxeter's integral octonions 𝕆 (the "octavians", an E₈ lattice), factorization along
any ordering of the rational primes and any bracketing, and the Bruhat–Tits buildings of G₂(ℚ_p).

Open `index.html` through a local server (ES modules), e.g. the `golg-site` launch config, then go to
`/GeometryofLinearGroups/Arithmetic/Tools/octonions/`. `?a=<expression>` preloads α and `?tab=box|g2|notes` opens a tab.

## What it does

- **Factor**: enter α in a MathQuill field (type `1/2` for a fraction, `e1` for e₁, `*` for ·; products, powers and
  i, j, k are accepted), or pick an example; the norm field takes e.g. `3^2*5*7` for a random α of that norm. Then
  drag the prime chips to reorder, re-associate the bracketing tree with ↶/↷, and step through the 240
  metamigrations at any node. The product is re-multiplied in the chosen bracketing as a check.
- **Box & paths**: the lattices B_d(α) = α𝕆 + d𝕆 (d | N(α)) form a canonical product of geodesic segments
  in ∏_p B(Spin₈(ℚ_p)). The current ordering is a staircase through it, and every left- or right-spine
  subproduct of the bracketing is marked on or off the box.
- **G₂ building**: an apartment of B(G₂(ℚ_p)) with vertex types and counts at each position. The link of a
  hyperspecial vertex, the split Cayley hexagon H(p), is built from 𝕆/p𝕆 for p ≤ 7.
- **G₂(ℤ[1/N])**: explicit elements, either random with prescribed positions or entered as g(e₁), g(e₂), g(e₃).
  Each one is factored as g = h₁⋯h_m·u along any ordering of its short and long steps, and drawn as a staircase
  in the product of parallelograms and as a path in each apartment.
- **Fano & E₈**: the Fano plane of the multiplication, where clicking two points multiplies them, and the 240 units
  of 𝕆 as the E₈ root system in its Coxeter plane, with highlights for E₇, D₄ and a chosen Fano line.
- **Notes**: the mathematics, with references.

## Layout

| file | contents |
|---|---|
| `js/octavian.js` | octavians in doubled coordinates (BigInt): product, norm, content, primary test, parser, formatting |
| `js/lattice.js` | Hermite form, exact integral LLL (Cohen 2.6.7), Fincke–Pohst; α𝕆 + m𝕆 and 𝕆α + m𝕆; Hurwitz sub-order |
| `js/factor.js` | integer factorization, divisors, the 240 splits of a node, bracketing trees and rotations, `factorize` |
| `js/g2.js` | 𝕆/p𝕆 arithmetic, Cayley hexagon, apartment geometry, Macdonald counts |
| `js/g2group.js` | G₂(ℤ[1/N]): rational automorphisms, rational lattices (sum, meet, dual), positions from p-adic elementary divisors, step-vertex formulas, isomorphism search, `factorG2`, `randomG2` |
| `js/fanoE8.js` | Fano plane and the E₈ Coxeter-plane projection |
| `js/tex.js` | KaTeX helpers (inline, `$…$` rich text, labels inside SVG via foreignObject) and MathQuill glue: `latexToExpr` turns MathQuill LaTeX into the parser's grammar |
| `js/app.js`, `js/boxview.js`, `js/g2view.js`, `js/ui.js` | the page; all mathematics is typeset with KaTeX |
| `tests/run.mjs` | `node tests/run.mjs`: 56 checks of the arithmetic claims and the LaTeX round trips (about 5 s) |

## Conventions

- Basis 1, e₁, …, e₇ with e_i e_{i+1} = e_{i+3} (indices mod 7). 𝕆 = ℤ⁸ + ½C, where C is the Hamming code
  containing {0124, 0136, 0157, 0235, 0267, 0347, 0456}. It is one of the 7 maximal orders containing ℤ⁸, and
  contains the Hurwitz order on ⟨1, e₁, e₂, e₄⟩ (i, j, k in the parser).
- Divisors: for primitive α and m | N(α), the left divisors of norm m are exactly the 240 minimal vectors of
  α𝕆 + m𝕆 ≅ √m·E₈ (Rehm). They are found by LLL plus enumeration on Gram/m, an integral E₈ Gram matrix, so the
  float step is safe at any size.
- Normalization: at each node the right factor is *primary* (≡ 1 mod 2𝕆, first nonzero coordinate > 0),
  which is unique when its norm is odd. If the right norm is even and the left norm odd, the left factor is
  normalized instead; otherwise the lexicographically largest divisor is used. Signs are then collected in
  the first factor. For the left comb this is Rehm's unique factorization.

## G₂(ℤ[1/N]) method

- Element = automorphism g of O_ℚ given by the basic triple g(e₁), g(e₂), g(e₃) (then e₄ = e₁e₂, e₅ = e₂e₃,
  e₆ = e₃e₄, e₇ = e₄e₅), stored as an integer matrix over a common denominator. G₂ is orthogonal, so g⁻¹ = gᵀ.
- Position of g𝕆 at p: the p-adic elementary divisors of the transition matrix are ±(a+2b), ±(a+b), ±b, 0, 0.
- Step vertex toward T at p: short (p⁻¹𝕆 ∩ pᵇT) + (𝕆 ∩ p⁻ᵇT) + p𝕆; long (p⁻²𝕆 ∩ p^{a+b−1}T) + (p⁻¹𝕆 ∩ T) +
  (𝕆 ∩ p^{1−b}T) + (p𝕆 ∩ p^{1−a−b}T) + p²𝕆. Intersections are computed as duals of sums of duals.
- G₂-prime for a vertex R: the first basic triple among the 126 imaginary units of R (sorted) whose
  automorphism maps the half-integral basis of 𝕆 into R. Seeds per prime come from Hurwitz-quaternion
  automorphisms (conjugation by a of norm p on ⟨1, e₁, e₂, e₄⟩, with e₃ ↦ (bā/p)e₃).

## Ideas for later

- A D̃₄/triality view of the octavian box at a single prime (points of Q₇⁺(p) and solids via x ↦ x𝕆, 𝕆x).
- Rehm's computer-chosen set P(2) as a genuine normalization at p = 2.
- Words in G₂-primes: relations among the canonical primes at two primes (the G₂ analogue of the quaternion square complexes).

## References

Conway–Smith, *On Quaternions and Octonions* (2003) ch. 9–10; Rehm, Ann. Fac. Sci. Toulouse 2 (1993) 271–289;
Coxeter, Duke Math. J. 13 (1946); van der Blij–Springer (1959); Gross, *Groups over ℤ* (1996);
Gan–Yu, Bull. SMF 131 (2003); Tokorcheck, arXiv:1209.1420; Dahan–Tillich, arXiv:1011.2642 (withdrawn).
