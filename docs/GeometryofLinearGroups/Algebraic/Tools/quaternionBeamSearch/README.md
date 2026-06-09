# Quaternion beam search: `⟨1+2i, 3+2j⟩` in projective integer quaternions

A `python-flint` tool that explores the group

> **G = ⟨a, b⟩**,  with  **a = 1 + 2i**  (reduced norm 5),  **b = 3 + 2j**  (reduced norm 13)

inside the projective integer (Lipschitz) quaternions, and proves that **G
contains a finite-index subgroup of `PH(Z[1/5])`** — an explicit subgroup of
**index 96** in the free group `F₃ = ⟨1+2i, 1+2j, 1+2k⟩`.

This is the "prioritise the prime 5" half of showing `G` is a finite-index
subgroup of `PH(Z[1/65])` (= `H(Z[1/(5·13)])` projectively).

## The mathematics

**The two primes split the Hamilton algebra.** `5 ≡ 13 ≡ 1 (mod 4)`, so the
Hamilton quaternion algebra splits at both 5 and 13:
`H ⊗ Q_p ≅ M₂(Q_p)` via `i ↦ diag(s,−s), j ↦ [[0,1],[−1,0]]`, where `s² = −1`
in `Z_p`. Hence `G` acts on the Bruhat–Tits trees `T₆` (at 5) and `T₁₄` (at 13).

**`PH(Z[1/5]) ≅ F₃` (Lubotzky–Phillips–Sarnak).** The six quaternions of norm 5
are `1±2i, 1±2j, 1±2k`; they pair off by conjugation into three generators
`x = 1+2i, y = 1+2j, z = 1+2k`. Every primitive quaternion of norm `5ᵏ` has a
**unique reduced word** in these (LPS unique factorisation), so the norm-`5ᵏ`
quaternions form a free group `F = ⟨x,y,z⟩` of finite index in `PH(Z[1/5])`.
`quaternions.lps_factor` computes that word; it is verified to be a genuine
homomorphism (`tests.py`).

**Which elements of `G` land in `PH(Z[1/5])`?** Reduced words in `a,b` have norm
`5^p · 13^q`. The relevant invariant is the **13-content** `d = v₁₃(N)` of the
primitive form, which equals the displacement of the base vertex `v₀` in `T₁₄`.
An element is in `PH(Z[1/5])` iff `d = 0`, i.e. iff it **fixes `v₀` in `T₁₄`**.
So

> **H₅ := G ∩ PH(Z[1/5]) = Stab_G(v₀)** in the tree `T₁₄`.

On `T₁₄`, `a` is *elliptic* (norm 5 is a unit at 13, so `a` fixes `v₀`) and `b`
is *hyperbolic* (it translates `v₀`). On the link of `v₀` (`= P¹(F₁₃)`), `a` acts
as `diag(11,4) ~ diag(6,1)`, and **6 has order 12 mod 13** — so `a¹²` fixes the
whole radius-1 ball and the `a`-action on the 14 neighbours breaks into
**12-cycles**. Closing such a cycle gives the first non-trivial element of `H₅`:
`b⁻¹a¹²b` (and `b a¹² b⁻¹`, whose `F₃`-word is `zXYYXZZXyyXz`, norm `5¹²`).

## The beam search

`H₅` is found by **Reidemeister–Schreier on the `T₁₄` orbit of `v₀`**, run as a
best-first / beam search ordered by tree distance (so we stay near `v₀`, where
the relevant folds live):

1. BFS the orbit of `v₀` under the left action `W ↦ gW`, keeping one transversal
   word per vertex.
2. Every **fold** (a generator mapping an already-seen vertex onto another
   already-seen vertex) yields a Schreier generator `t(v')⁻¹ · g · t(v)` that
   **fixes `v₀`**, i.e. an element of `H₅`.
3. Each such element is translated, via LPS factorisation, into a reduced word in
   `F₃ = ⟨x,y,z⟩`.
4. The words are folded into a **Stallings graph**. The subgroup has **finite
   index in `F₃` iff the graph is complete** (every vertex has all of
   `x,y,z,x⁻¹,y⁻¹,z⁻¹`); the index is then the number of vertices.

**Result:** the graph closes up at **96 vertices** (rank `193 = 2·96 + 1`, exactly
Nielsen–Schreier for an index-96 subgroup of `F₃`). The index is stable: adding
thousands more `H₅` generators never lowers it, so

> **[F₃ : H₅] = 96.**

Since `F₃` is finite index in `PH(Z[1/5])`, `G` contains a finite-index subgroup
of `PH(Z[1/5])`. ∎

## Files

| file | contents |
|------|----------|
| `quaternions.py` | exact projective Lipschitz-quaternion arithmetic (flint `fmpz`), LPS factorisation into `F₃` words |
| `tree.py` | Bruhat–Tits tree vertices of `PGL₂(Q_p)` via the `H ⊗ Q_p ≅ M₂(Q_p)` splitting |
| `stallings.py` | Stallings folding / finite-index test for subgroups of `F₃` |
| `search.py` | the beam search (Reidemeister–Schreier on `T₁₄`) + driver |
| `tests.py` | sanity checks (LPS round-trip, homomorphism property, Stallings on known subgroups) |

## Usage

```bash
python3 search.py 80000      # node budget
python3 tests.py             # validation suite
```

Requires `python-flint`.
