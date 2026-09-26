# SO₃(ℚ) · Part 3 — Subgroups

The last of three talks on SO₃(ℚ). It covers Sections 3 and 4 of
`../script.md`, with the advanced material from
`../../notabilityTalks/SubgroupsofSO3Q.pdf`, and ends with a suggested route
to the classification conjecture.

The arc: the central question (what does a finite set of rotations
generate?) and where it came from (Long–Reid, totally unitary
representations, a non-faithful one) → three ways to build subgroups:
**algebra** (fix an axis: norm-one groups of imaginary quadratic fields),
**geometry** (the hidden trees; hyperbolic and elliptic elements; ping pong;
primary groups are virtually free), **arithmetic** (SO₃(ℤ[1/n]) acting on a
jungle) → the conjecture that that's all, a full test case and its
consequences (no surface groups; coherence is not geometric) → Section 4:
geometric rigidity, a reformulation for two primes (finite index ⇔ the slice
is finitely generated), computer evidence, coarse maximality and invariant
partitions (the green-circle proof over ℝ and its rational shadow), and a
six-step route with each step marked known, new or open.

It uses the same deck machinery as `../1/` and `../2/`: reveal.js, the
Firebase phone remote with a BroadcastChannel fallback, and full-bleed
scenes driven by fragments.

## Presenting

```bash
./serve.sh        # then open http://localhost:8780/Talks/SO3Q/3/
```

Or use the `so3qTalk3` launch config (port 8780, no-store). → / Space / the
remote's Next step through everything. **S** opens the speaker view, which
has the outline's sentences, Nic's slide wording, and proof details.
`?remote=1` in a second window gives a same-machine remote.

`serve.sh` (in all three talks) now uses a listen queue of 128 and
HTTP/1.1. `python3 -m http.server` queues only 5 connections, and when the
deck and its scenes load together it sometimes resets one: a scene then comes
up without MathJax, or doesn't load at all.

## Slides

| # | Slide | What happens |
|---|---|---|
| 1 | Title | |
| 2 | Last time | Quaternions, trees, the jungle |
| 3 | The central question | Over ℝ it's hopeless; over ℚ there is a conjecture |
| 4 | Where it came from | Long–Reid; a totally unitary rep of ⟨a, b ∣ [a,b]²⟩ into SO₃(ℤ[1/39]) that is not faithful |
| 5 | Three ways | Algebra / Geometry / Arithmetic, then "Conjecture: that's all!" |
| 6 | Algebra: fix an axis | Rotations about v are the norm-one group of ℚ(√−∣v∣²) |
| 7 | *sphere* scene | Rotations about k (part 1's circle) → about (1,1,1) (a denominator of 7) → six axes, six fields |
| 8 | Geometry: the hidden trees | Translation length v_p(N) − 2v_p(a); line or bounded fixed set; the **local portrait** widget |
| 9 | *tree* scene | T₆: the tree → 1+2k slides its axis → 3+2i fixes the axis of 1+2i → 2+i+j+k fixes only o |
| 10 | Ping pong and primary groups | Definition, and primary ⇒ virtually free |
| 11 | *tree* scene | Ping pong for ⟨1+2k, 1+2i⟩ |
| 12 | Arithmetic: SO₃(A) | Lattices in jungles |
| 13 | Conjecture | Virtually abelian, primary, or commensurable with SO₃(ℤ[1/n]) |
| 14 | A test case | Nic's a, b: ⟨aᴺ, bᴺ⟩ is full |
| 15 | *tree* scene | The powers of 3+2j fix fatter and fatter tubes: not discrete at 5 |
| 16 | If the conjecture holds | No surface groups; SO₃(ℚ) coherent; coherence not geometric |
| 17 | Section 4 | Towards a classification |
| 18 | Geometric rigidity | Nic's theorem and its proof (Chiswell, self-normalizing, strong approximation) |
| 19 | Two primes: slices | Finite index ⇔ the slice is finitely generated, with proof |
| 20 | Evidence | Todd–Coxeter / Stallings indices in Γ₅,₁₃ and Γ₃,₅; the open squared pair |
| 21 | Coarse maximality | Nic's question, stated for tori of full rank |
| 22 | Invariant partitions | Transitivity on S²(ℤ[1/n]); partitions ↔ intermediate subgroups |
| 23 | *sphere* scene | The green circle → the open sweep → the scatter over ℤ[1/65] |
| 24 | A route to the conjecture | Reduce, rigidity, slices, flats, maximality, induction |
| 25 | Questions | CSP; thinness in a simple factor; integral traces; arithmetic pieces |
| 26 | Thank you | The series in three pictures |
| 27 | Appendix | Translation lengths, the local dichotomy, the computer checks |

## Files

- `viz/common/quat.js`: part 2's quaternion module plus `localType(q, p)` (how R_q acts on T_{p+1}), `axisField(q)`, `splits(sf, p)`, `vp`, and a BigInt layer `big` with `pWord(q, p)`: the vertex q·o of T_{p+1}, as a reduced word in A_p
- `viz/common/viz.js`, `viz.css`, `view3d.js`: the scene kit from part 2
- `viz/sphere/`: abelian subgroups (orbit circles of exact rotations) and the O₂ maximality proof
- `viz/tree/`: the ball of radius 4 in T₆, any rotation acting on it (with a morph and a displacement heat map), ping pong, and the tubes
- `deck.js`: stage sync, the title sphere, the local-portrait widget
- `remote.js`: the remote, on channel `so3q-3-sync`

## Checked by computer

- **Hurwitz words.** `big.pWord` agrees with an independent implementation on 8000 random quaternions, and the normalized left divisor is unique (12,000 tests, p = 3, 5, 7, 13).
- **Translation lengths.** The minimum displacement over a ball equals max(0, v_p(N) − 2v_p(a)) on 900 random rotations. Elliptic elements with odd v_p(N) invert an edge. Fixed sets contain a line exactly in the split case.
- **The tree scene.** Every vertex word is its own normal form. 1+2k moves its axis by 1. The fixed set of 3+2i is exactly the axis of 1+2i. The fixed set of 2+i+j+k is {o}. h = 3+2j, h⁴, h²⁰ and h¹⁰⁰ fix exactly the 0-, 1-, 2- and 3-neighbourhoods of the axis of 1+2j (9, 37, 137 and 437 vertices of the ball).
- **Transitivity.** SO₃(ℤ[1/n]) is transitive on S²(ℤ[1/n]) for n = 3, 5, 13, 15, 21, 65, up to denominators 27, 125, 169, 15, 21 and 65. There are 6(p − (−1∣p)) points with denominator p.
- **The motivating representation.** a ↦ R_{2+3j} and b ↦ R_{1+2i+2j+3k} reproduce the matrices on Nic's slide. [a, b] maps to a half-turn. Among reduced words of length ≤ 7 there are 3833 distinct elements of G (Dehn's algorithm) but only 3681 images: for example a²ba⁻¹b⁻¹ and baba⁻¹b⁻¹a⁻¹b.
- **Evidence table.** Re-run with `quaternion-5-13-cosets.py` (repository root): ⟨1+2i, 3+2j⟩ has index 96 in Γ₅,₁₃, with slices 96 and 96. In Γ₃,₅ the pairs (1,1), (1,2), (2,1), (2,2), (4,1) have indices 2, 88, 8, 352, 32.

## Notes on the mathematics

- **Slices.** The slide *Two primes: slices* is a reformulation proposed in this talk: for full Γ ≤ SO₃(ℤ[1/pq]), finite index ⇔ Γ ∩ SO₃(ℤ[1/p]) is finitely generated. The proof is on the slide and in its notes. It should be checked before it is quoted.
- **Small corrections to the source slides.**
  - The conjecture needs *virtually* abelian: O₂(ℤ[1/65]) is neither abelian, nor primary, nor a lattice.
  - The stabilizers in S²(ℤ[1/n]) have rank #{p ∣ n : p ≡ 1 (4)}, not the number of prime factors of n.
  - The rough-maximality question needs tori of full rank. For n = 15, SO₂(ℤ[1/15]) = SO₂(ℤ[1/5]) ⊂ SO₃(ℤ[1/5]) ⊂ SO₃(ℤ[1/15]), with infinite index at both steps.
