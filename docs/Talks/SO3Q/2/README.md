# SO₃(ℚ) · Part 2 — One dimension up

The second of three talks on SO₃(ℚ). It covers Section 2 of `../script.md` and
goes on to metacommutation and products of trees. It follows the Part III
slides of `../../notabilityTalks/TwobyTwoMatrices.pdf` and the matching slides
of `SubgroupsofSO3Q.pdf`.

The arc: SO₃(ℤ) is finite → quaternion conjugation fixes the real part, so it
rotates ℝ³ (and ℚ³) → integer quaternions give rational rotations →
Jacobi (8(p+1) quaternions of norm p) and Hurwitz (unique left divisors) as
the analogues of last time's sums of two squares and ℤ[i] → one
(p+1)-regular tree per odd prime → metacommutation squares → an
infinite-dimensional product of trees ∏′ T_{p+1}, with last time's lattice
as a flat inside it.

It uses the same deck machinery as `../1/`: reveal.js, the Firebase phone
remote with its BroadcastChannel fallback, and full-bleed scenes driven by
fragments.

## Presenting

```bash
./serve.sh        # then open http://localhost:8779/Talks/SO3Q/2/
```

Or use the `so3qTalk2` launch config (port 8779, no-store). → / Space / the
remote's Next step through everything. **S** opens the speaker view, which
holds the outline's sentences verbatim and background facts. `?remote=1` in a
second window gives a same-machine remote.

## Slides

| # | Slide | What happens |
|---|---|---|
| 1 | Title | Rational points of the sphere, turning |
| 2 | Last time | Recap of SO₂(ℚ): triples, primes ≡ 1 (4), ⊕ℤ |
| 3 | *space* scene | ℤ³ and a die → all 24 rotations (a Hamiltonian cycle of quarter turns) → e₁ has 6 places, e₂ has 4 |
| 4 | Finite, then infinite | SO₃(ℤ) ≅ S₄; an infinite-order rational rotation |
| 5 | Quaternions | ℍ, norm, N(qr) = N(q)N(r) |
| 6 | Conjugation fixes the real part | Re(xy) = Re(yx) ⇒ an action on ℝ³ and ℚ³ |
| 7 | *space* scene | ℍ = ℝ·1 ⊕ ℝ³ with a real gauge → conjugation by 1+i+j (the real part is FIXED) → axis and angle |
| 8 | Integer quaternions, rational rotations | Euler–Rodrigues; 1+i+j, 3+i+j+k (last time's example), a+bi (last time's rotations) |
| 9 | *space* scene | The images of i, j, k under R_{1+i+j} → an explorer for any integer quaternion |
| 10 | Counting: Jacobi | r₂ vs r₄; 2 primes vs p+1 primes of norm p |
| 11 | The p+1 primes of norm p | Explorer: A_p for p = 3…23, with the rotation axes on a small sphere |
| 12 | Factoring: Hurwitz | The fundamental theorem of quaternion arithmetic |
| 13 | *tree* scene | The orbit tangle → T₆ (each edge along its prime's rotation axis) → last time's line as a geodesic → T₄ (the H-tree) → T₁₄ |
| 14 | The plane and space so far | A comparison table ending in "?" |
| 15 | Metacommutation | πσ = ±σ′π′; the example; Cohn–Kumar |
| 16 | *product* scene | One square → sorting a staircase word by six metacommutations |
| 17 | SO₃(ℤ[1/65]) | All 21 squares (click one). The 3 commuting squares tile periodic flats: last time's ℤ² |
| 18 | *product* scene | T₄ × T₆ with the sorted grid as a flat → the 3-5-7 cube → one tree per odd prime |
| 19 | Punchline | X = ∏′ T_{p+1}; stabilizers SO₃(ℤ); Γ = ⟨⋃A_p⟩ is simply transitive |
| 20 | Next time / Thanks | Section 3 of the outline |
| 21 | Appendix | Bruhat–Tits trees, Hilbert reciprocity, the 24-cell |

## Files

- `viz/common/quat.js`: quaternion arithmetic and the Euler–Rodrigues matrix, counts (`jacobi4`, `jacobi2`), the normalized prime sets `A(p)`, `metacommute` / `metaPerm`, and the trees
- `viz/common/view3d.js`: a small orbit camera, depth-sorted draw list and quaternion labels (canvas 2D)
- `viz/common/viz.js`, `viz.css`: the scene kit from part 1. A scene now replays its step when it comes back on stage
- `viz/space/`, `viz/tree/`, `viz/product/`: the three scenes. Each also works standalone with ←/→
- `deck.js`: stage sync, the title sphere, the primes explorer and the square gallery
- `remote.js`: part 1's remote (async Firebase, deduplicated commands), on channel `so3q-2-sync`

## Checked by computer

- **Algebra.** Conjugation fixes the real part and equals the Euler–Rodrigues matrix, and q ↦ R_q is a homomorphism (2000 random checks). Jacobi's r₄ and r₂ formulas hold for n ≤ 80 and n ≤ 200.
- **Primes.** |A_p| = p+1 for all odd p ≤ 31, and the sets match the lists in your slides.
- **Metacommutation.** It is unique with both sides normalized. The permutation's sign is (q/p), and its fixed-point count is 1 + ((t²−4q)/p).
- **Trees and products.** Reduced words in A₃, A₅ and A₁₃ are all distinct: the groups are free and the Cayley graphs are trees.
- **Transitivity.** Exactly 24(p+1) rotations have denominator p (p = 3, 5, 7), and exactly 576 = 24·4·6 have denominator 15. Those 576 are precisely (w₅·w₃)·SO₃(ℤ).
- **Fractions of ℤ³.** R_{1+i+j} sends exactly 1/3 of ℤ³ to ℤ³.
- **The cube.** The 3-5-7 cube agrees in all six orders.
- **The 21-square table.** No choice of one representative per inverse pair makes a rows × columns table hit each of the 21 squares exactly once: the naive table gets 19. So the deck shows all 21 squares as a gallery instead.
