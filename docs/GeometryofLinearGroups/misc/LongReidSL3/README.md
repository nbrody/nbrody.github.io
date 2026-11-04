# LongReidSL3 — SL₃(ℤ[1/p]) representations of the torus orbifold group

Sibling of `../LongReid` (the PGL₂ Magnus curve / Long–Reid action).  Here the
target is a single 2-dimensional Euclidean building: the Bruhat–Tits building
of SL₃(ℚ_p).

    G = π₁ᵒʳᵇ(T²(2)) = ⟨a, b | [a,b]²⟩,   c := [a,b]  (order 2)

G contains a genus-2 surface group with index 4, so a proper action of G gives
one of the surface group.

## Properness criterion

For Γ = ρ(G) ≤ SL₃(ℤ[1/p]) acting on the building X_p of SL₃(ℚ_p), with o = [ℤ_p³]:

* γ is elliptic ⇔ its eigenvalues are p-adic units ⇔ χ_γ ∈ ℤ_p[x] ⇔ tr γ, tr γ⁻¹ ∈ ℤ.
* Vertex stabilisers are Γ ∩ g SL₃(ℤ) g⁻¹, which are virtually torsion-free.
* So **ρ is proper ⇔ Γ ∩ SL₃(ℤ) is finite ⇔ no infinite-order g ∈ G has
  χ_{ρ(g)} ∈ ℤ[x]**.  (Stab(o) finite already suffices: the building is
  locally finite.)
* Since J = ρ(c) ∈ SL₃(ℤ) fixes the unbounded sub-building Fix(J)
  (line × tree), properness also forces Γ·o ∩ Fix(J) to be finite.
  Otherwise Stab(o) contains infinitely many distinct conjugates x c x⁻¹.

The archimedean place plays no role.

## The character variety (main component, dim 4)

Normalise c ↦ J = diag(1, −1, −1).  Then, generically:

* (ρ(a), J) is determined up to conjugacy by χ_a(x) = x³ − s x² + t x − 1
  alone, with normal form

      A(s,t) = [[s, 0, 1], [1 − st, 0, −t], [0, 1, 0]]      (A ~ JA automatically)

* K' = diag(−1, 1, −1) satisfies K' A K' = J A, so

      b ↦ B = K'·h(A),   h ∈ T_{s,t} = { h ∈ ℚ[A] : det h = 1 }

  where T_{s,t} is the 2-dimensional norm-one torus (twist + bulge along a).
  [A, B] = J identically (`sym1.py`-style checks in sympy).
* So X⁰(G, SL₃) ≅ {(s, t, h)}: a torus bundle over the plane of
  characteristic polynomials of ρ(a).  h ↦ hA is the automorphism b ↦ ba.
* tr B = −h(s), with h reduced mod χ_a to degree ≤ 2 and evaluated at s = tr A.
  Likewise tr B⁻¹ = −(h⁻¹)(s).
* ℤ[1/p]-points: A(s,t) ∈ SL₃(ℤ[1/p]) for every s, t ∈ ℤ[1/p].  The twists
  are norm-one units of ℤ[1/p][A].  The obvious ones are A − r with
  χ(r) = ±p^k, and χ(r) is *linear* in (s, t).

### Necessary conditions

* χ_a must be reducible over ℚ_p.  If it were irreducible, all roots would be
  Galois-conjugate units and a would be elliptic.
* tr [a, c] = tr [a, c]⁻¹ = 4st − 1, so v_p(4st) < 0 is necessary.
* The same holds for every primitive γ in place of a, since (γ, c) has the
  same shape.

## The polynomial family ρ_{s,r} (dim 2)

det(A − r) = −χ(r) = 1 ⇔ t = rs − r².  This gives ρ_{s,r} : G → SL₃(ℤ[s, r]):

    A = [[s, 0, 1], [1 − rs(s−r), 0, −r(s−r)], [0, 1, 0]]
    B = K'(A − r) = [[r−s, 0, −1], [1 − rs(s−r), −r, −r(s−r)], [0, −1, r]]
    [A, B] = J = diag(1, −1, −1)

With q = r − s, the pairs (tr, tr⁻¹) are:

| element | tr | tr⁻¹ |
|---|---|---|
| a | s | −rq |
| b | q | −rs |
| ab | sq | −r |
| [a,c], [b,c] | −4rsq − 1 | −4rsq − 1 |

* The swap a ↔ b acts by (s, r) ↦ (r − s, r).
* ρ_{s,r} is irreducible (A, B span M₃) and not in the SO(2,1) locus (tr A ≠ tr A⁻¹).
* At p it needs v_p(4rsq) < 0.
* Simplest point: s = 1/3, r = 1 at p = 3 (later refuted: it lies on an accidental-unipotent curve).  There t = −2/3, ρ(a) is regular
  hyperbolic (Newton slopes 1, 0, −1), and so is ρ(b).

## Scripts (`python/`, stdlib only; sympy checks used the alphaCentaur venv)

| Script | Purpose |
|---|---|
| `sl3core.py` | Normal form, exact ℤ[1/p] word evaluation, Newman/Dehn word problem for G (torsion ⇔ w² = 1), integral-charpoly sweep. |
| `family.py` | ρ_{s,r}. |
| `search1.py` | Scan (s, t) ∈ ℤ[1/p]² with p-unit twists built from A − r; sweep each. |
| `gridsweep.py` | Parallel sweep of ρ_{s,r} over simple s, r and several p. |
| `displacement.py` | p-adic vertex displacement D_p vs hyperbolic displacement in a Fuchsian model (tr = 1+√3 symmetric cone torus); lower envelope per shell. Use s = 1/P with P a large prime to get the generic, degree-in-s envelope. |
| `beam.py` | Best-first beam over the orbit Γ·o (prepend letters; exact HNF vertex state; Dehn-reduced words; score (D, −d_H); no revisits; loop elements tested for infinite order). Writes `data/beam_*.json` and `.log`. |
| `translation.py` | Translation-length spectrum: building ℓ_p (Newton polygon) vs hyperbolic ℓ_H per conjugacy class; the minimal ratio falls to 0.27 by length 12 at (1/3, 1). |
| `verify_witness.py` | Independent check of beam witnesses (sympy + mpmath). |
| `collision.py` | Schreier/meet-in-the-middle: hash ρ(w)·o by the Hermite normal form of the lattice; collisions give Stab(o) elements up to length 2L.  Infinite order ⇒ witness.  Also counts distinct torsion stabiliser elements (> 48 ⇒ not proper) and closes them up. |

## Results (Oct 2026)

**Grid of ρ_{s,r}** with s, r ∈ {±1, ±2, ±3, ±1/p, ±2/p, ±3/p}, charpoly sweep to
word length 13 (`data/gridsweep.json`):

* p = 2 fails at [a,c] everywhere in this grid.  It needs v₂(rsq) ≤ −3, so deeper
  denominators are required.
* For p ∈ {3, 5, 7}, the outcome is governed by (v(s), v(r), v(q)):

| pattern | meaning | outcome |
|---|---|---|
| (−1, 0, −1) | s = k/p, r ∈ ℤ | survives (85/88; 3 short hits) |
| (0, −1, −1) and its swap (−1, −1, 0) | s ∈ ℤ, r = k/p | survives (all) |
| (−1, −1, −1) | s, r, r−s all non-integral | many hits at length 10–13 |
| some v = +1 with two −1 | | hits (p = 3) |
| v(rsq) ≥ 0 | | [a,c] elliptic |

  Most short hits are **accidental unipotents**: ρ(w) unipotent, or −1 times a
  unipotent on a 2-plane, e.g. w = AABBBAbaBAAb at (s, r) = (1/3, −1/3).
  Some are genuine hyperbolic elements of a conjugate of SL₃(ℤ), e.g.
  tr = tr⁻¹ = −89 at (−1/3, −2).

**Top candidates.**  These have no infinite-order element with integral
charpoly up to the stated length, and no infinite-order element of
Γ ∩ SL₃(ℤ) up to word length 2L (`collision.py`).  Torsion found in Stab(o)
is just {I, J}.

| p | (s, r) | t = tr ρ(a)⁻¹ | charpoly sweep | Stab(o) collision |
|---|---|---|---|---|
| 3 | (1/3, 1) | −2/3 | L = 15 (21.5M cyclic words) | 2L = 24 — **refuted by beam, see below** |
| 3 | (2/3, 1), (1, 1/3) | −1/3, 2/9 | 14 | 24 |
| 3 | (1/3, −1) | −4/3 | 13 | 24 |
| 5 | (1/5, 1), (1, 1/5), (2/5, 1) | | 14 / 14 / 13 | 22 |
| 7 | (1/7, 1), (1, 1/7) | | 14 / 13 | 22 |

* At the generic point s = 1/P (P = 1000003, r = 1) the sweep is clean to
  length 14.  So no word up to that length has charpoly constant in s.  The
  (−1, 0, −1) survivors are p-adic shadows of the place s = ∞ of ℚ(s).
* `displacement.py` at (1/3, 1): of 773k elements, only I and one involution
  lie in SL₃(ℤ).  The lower envelope of D_p plateaus around 4–6 for
  hyperbolic distance 2–12, then rises.  That shape is identical for p = 3
  and for generic s.  So the action, if proper, is distorted.  That much is
  forced: an Anosov action would give a continuous injection S¹ → flag
  variety, and the p-adic flag variety is totally disconnected.

### (1/3, 1) at p = 3 is NOT proper (beam search, Oct 2026)

`beam.py` (width 100 000, depth 500) runs a best-first beam over the orbit Γ·o.
* Words are built by prepending letters, so the state is the vertex ρ(w)·o.
  It is kept exactly as an HNF lattice basis, with no precision loss.
* Words are Dehn-reduced.
* The score is (D, −d_H).
* Revisiting a vertex is a loop.  The loop element is tested for infinite
  order and the state is dropped.

It found witnesses from depth 82 on:

* **Accidental transvection of length 24:** w = `BBabbaBABAbbabAAbABaaaBA`
  (the shortest cyclic conjugate of a length-26 witness).  ρ(w) − I has rank 1
  and (ρ(w) − I)² = 0.  w is hyperbolic in G (Fuchsian |tr| ≈ 1.4·10⁵).  A
  unipotent is bounded at p, so it fixes a vertex and the action is not proper.

      ρ(w) = [[5305/729, −416/27, −104/243], [1936/729, −149/27, −44/243], [−7744/2187, 704/81, 905/729]]

  This is not structural.  On the whole family,
  tr ρ_{s,r}(w) − 3 = tr ρ_{s,r}(w)⁻¹ − 3 = 4(1 − st)·P(s, r), with P
  irreducible of degree 15, so w is unipotent along the curve {P = 0}.
  On the line r = 1, P(s, 1) = −(s−1)(3s−1)(6s⁴ − 14s³ + 4s² + 5s + 1), and
  **s = 1/3 is a root**: the simplest candidate sits exactly on this curve.
  **(2/3, 1) is the same representation up to a ↔ b**, since (s, r) ↦ (r − s, r).
  The swapped word AAbaabABABaabaBBaBAbbbAB is the transvection there, and
  its beam found the same depth-82, length-163 witnesses.  Always quotient by
  this swap when choosing candidates.
  P does not vanish at the other candidates (2/3,1), (1,1/3), (1/3,−1),
  (1/5,1), (1,1/5), (2/5,1), (1/7,1), (1,1/7).
* **Hyperbolic integer matrices of length 163:** anchored at o, so ρ(g) ∈ SL₃(ℤ),
  with charpoly x³ + 19965418436602 x² + 2252371387485 x − 1.  Also a length-72
  unipotent class.

Verified independently by `verify_witness.py` (sympy exact arithmetic, plus
the Fuchsian trace in mpmath at 60 digits).

### (1, 1/3) at p = 3 is NOT faithful (beam, depth 56)

* The length-60 word `baBABABBAABBABABBBBABBABABabbbbababbbabABAbbbaaBABaabbabbaba`
  maps to I.  It is hyperbolic in G (Fuchsian |tr| ≈ 5.4·10¹²) and Dehn-reduced.
* So the kernel is infinite and the action is not proper.
* The relation is isolated, not structural:
  * along s = 1, ρ(w) − I vanishes iff 2(3r − 1)(r² − r + 1) = 0;
  * along r = 1/3, only at s = 1.
* This is the second "simplest" point on an accidental coincidence: a
  transvection curve for (1/3, 1), an isolated relation here.

### Both refuted points are S-arithmetic (Oct 2026)

Γ = ρ_{1,1/3}(G) and Γ = ρ_{1/3,1}(G) have **finite index in SL₃(ℤ[1/3])**.
Equivalently, Γ ∩ SL₃(ℤ) has finite index in SL₃(ℤ).  Γ itself cannot lie
in SL₃(ℤ): tr A⁻¹ ∉ ℤ.  This explains the non-properness: these are lattices
in SL₃(ℝ) × SL₃(ℚ₃).

Proof (`tits_frame.py`, `tits_frame2.py`, certificate in `data/arithmeticity_s1_r1_3.json`):
1. Take a transvection u = I + c·vφ ∈ Γ found by the beam.
2. `stabsearch.py` (meet-in-the-middle on the orbit of v in ℙ²(ℚ), and of φ
   in the dual plane) finds:
   * g ∈ Stab(v) moving the axis: `bbABBBBabb` for (1, 1/3), `BBabaaaBA` for (1/3, 1);
   * h ∈ Stab(ker φ) moving the center: `babABB`, resp. `aBABaBabAAbabA`.
3. Then u and gug⁻¹ span a rank-2 lattice in U_v.  Also AuA⁻¹ and
   A h⁻¹uh A⁻¹ span a rank-2 lattice in the opposite radical U^{A·ker φ},
   since v ∉ A·ker φ.
4. In a basis P = (v, basis of A·ker φ) this gives E₁₂(m), E₁₃(m), E₂₁(m),
   E₃₁(m) ∈ Γ.  Commutators give E₂₃(m²) and E₃₂(m²).  Tits: E(3, m²) ⊇ Γ(m⁴),
   so Γ ∩ SL(Pℤ³) has finite index.
5. Γ is unbounded at 3 and its closure there contains an open subgroup, so
   it is all of SL₃(ℚ₃) (Tits).  Hence Γ·(SL₃(ℝ)×SL₃(ℤ₃)) = G_S, and Γ is a
   lattice in G_S, so it has finite index in SL₃(ℤ[1/3]).

**Index for (1, 1/3)** (by CSP the level divides 2^a 7^b 17^c; GAP `cong*.g`):
* 2-adic: 96, stable at 4, 8, 16, so it contains Γ(4).  The image mod 2 is cyclic of order 7.
* 7-adic: 4788, equal at 7 and 49.  The image mod 7 (order 1176) is reducible.
* 17, 5, 11, 13: surjective.
* Mod 28: 96·4788 = **459 648**.
* A 2–7 entanglement would need a shared quotient ℤ/2 (visible by level 56)
  or ℤ/7 (by level 98).  Neither occurs: index 459 648 at level 56, and
  114 912 = 24·4788 at level 98.
* So **[SL₃(ℤ[1/3]) : ρ_{1,1/3}(G)] = 459 648 = 2⁷·3³·7·19**.

### (1/5, 1) at p = 5: arithmeticity check inconclusive, everything points to thin

* **Congruence closure has index 24.**  Γ surjects mod 3, 7, 9, 11, 13, 17,
  19, 27.  At 2 the index is 24 at levels 2, 4, 8, 16.  This is forced for
  the whole family: [A,B] = J ≡ I mod 2, so the image mod 2 is abelian
  (here C₇), and abelian subgroups of SL₃(𝔽₂) have index ≥ 24.  So *if*
  arithmetic, Γ = {γ ∈ SL₃(ℤ[1/5]) : γ mod 2 ∈ C₇}.
* **No unipotent to start the Tits frame:**
  * no infinite-order element with integral charpoly up to length 16
    (64.6M conjugacy-class words);
  * no loop of any kind in the full beam (width 100k, depth 500; 1.68M torsion
    loops, 0 others);
  * min D grows linearly (24, 40, 57, 72, 89 at depths 100–500; D/d_H settling
    near 0.15), and only 119 orbit vertices
    within distance 6 were ever found.

  At the two arithmetic p = 3 points, the beam produced transvections by
  depth 56–82 and kept min D ≤ 6 throughout.
* **Property (T) dichotomy:** arithmetic ⇒ Γ has (T) ⇒ ρ is not faithful,
  since G is virtually a surface group.  The same argument shows ρ_{1/3,1}
  is non-faithful.  So a proof that ρ_{1/5,1} is faithful, or proper, would
  rule out arithmeticity.

**Caveat on the collision test.**  It only finds elements of Stab(o).  On
the controls (−1/3, −2), (1/3, −1/3) and (−2/7, −2) it finds nothing up to
length 18, although the charpoly sweep has witnesses of length 10–12.  Their
fixed vertices are far from the orbit of o: for the (1/3, −1/3) unipotent,
the first power in SL₃(ℤ) is about u^(3⁶).  Use both tests.
