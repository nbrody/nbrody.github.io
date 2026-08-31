# LongReid — integral points on the Magnus curve

Tools for hunting **infinite-order integer matrices** in the Magnus curve
group

    Γ_t = ⟨ A, B ⟩,   A = [[t, 0], [0, 1]],   B = [[t² + 1, 2], [t, 1]]

at algebraic and rational values of t.  The curve is Magnus's parametrization
of the PGL₂ character variety of the torus-orbifold group
π₁(T²(2)) = ⟨x, y | [x,y]²⟩ (Magnus 1981); Long–Reid (1999) proposed
specializing it to act properly on a product of trees, and the integral
points hunted here are exactly the obstructions: at t = 9 the group
normalizes into PSL₂(Z[1/6]) acting on T₃ × T₄, and the action is proper iff
Γ ∩ PGL₂(Z) is finite.  **Brody, *An improper surface group action*,
arXiv:2512.19760** exhibits a length-82 word evaluating to an infinite-order
integer matrix, so that action is not proper; this project verifies the
witness and extends the hunt.  Related: Long–Reid, *Integral points on
character varieties*; Fisher–Larsen–Spatzier–Stover 2018; Schwartz's notes
on the Long–Reid conjecture.

det A = t and det B = (t − 1)², so all word entries lie in
Z[t, t⁻¹, (t−1)⁻²]; at algebraic t a word gives a *rational integer point*
when its specialized matrix lands in M₂(Z) — equivalently, when all d
Galois-conjugate specializations of the representation collide on that word.

## Layout

```
LongReid/
├── index.html, style.css, js/   Informational frontend: theory writeup,
│                                database browser, exact word calculator
├── python/                      Research scripts (see table below)
│   ├── magnusCore.py            Shared exact number-field arithmetic + DB IO
│   ├── fieldSweep.py            Exhaustive short-word sweep (ground truth)
│   ├── integerBeam.py           Deep beam search, scored by gcd(denominators)
│   └── longReidBeam.py          Rational square t (default 9): PSL₂-normalized
│                                witness search; verifies arXiv:2512.19760
├── data/integer_matrix_db.json  Result database
└── README.md
```

Published URL (GitHub Pages): `…/misc/LongReid/index.html`.
Word alphabet everywhere: `A B a b` with lowercase = inverse.

## Python scripts

| Script | Purpose | Deps |
|---|---|---|
| `magnusCore.py` | Library: Q[t]/(m) with exact `Fraction` power-basis coordinates, Magnus generators, integrality + infinite-order tests (M¹² = I criterion), beam scores, JSON database IO. | stdlib |
| `fieldSweep.py` | Exhaustive DFS over all freely reduced words of length ≤ L for a panel of minimal polynomials; records every integral matrix. | stdlib |
| `integerBeam.py` | Beam search to larger depth: keeps the `--width` best states per depth, scored by `(log₂ gcd(entry denominators), off-rational coordinate mass, …)`; `--score lcm`/`mixed` variants. At unit specializations denominators are identically 1 and the off-rational mass drives the search. | stdlib |
| `longReidBeam.py` | Rational square t (default 9, the Long–Reid group): generators normalized into PSL₂, hits = elements of PSL₂(Z) of infinite order in PGL₂ (`M¹² ≠ ±I`) — witnesses of non-properness of the T₃ × T₄ action. Verifies and seeds the arXiv:2512.19760 length-82 witness. | stdlib |

Examples:

```sh
python3 python/fieldSweep.py -L 12                 # default panel
python3 python/fieldSweep.py -p t^2-7t+1 -L 10
python3 python/integerBeam.py -p t^2-t-1 -d 32 -w 6000
python3 python/integerBeam.py -p t^3-t-1 --score mixed
python3 python/longReidBeam.py -t 9 -d 90 -w 6000  # non-properness witnesses
```

Both scripts merge into `data/integer_matrix_db.json` via a locked
`update_db()` reload-merge-save cycle (safe to run concurrent savers).

## Structure found so far (June 2026)

- **Universal torsion.** tr [A,B] = 0 and det [A,B] = 1 *identically in t*,
  so [A,B]² = −I on the whole curve: the PGL₂ image is a representation of
  the torus orbifold group π₁(T²(2)) = ⟨x, y | [x,y]²⟩.  Every specialization
  therefore contains −I and order-4 torsion; the database flags
  `infinite_order` to separate this background from the real quarry.
- **The t + 1/t ∈ Z family.** BA⁻¹ = [[t + t⁻¹, 2], [1, 1]], so every root of
  t² − nt + 1 gives the length-2 integer point [[n, 2], [1, 1]] with
  det = n − 2: hyperbolic in SL₂(Z) for n = 3 (t = φ²), det 2 at n = 4
  (t = 2 + √3), infinite order for all n ≥ 3.
- **Golden ratio contrast.** At t² − t − 1 (where t + t⁻¹ = √5 ∉ Q) the only
  integer matrices found — exhaustively to length 12 and by deep beams — are
  the universal −I torsion.  The determinant obstruction forces integral
  words there to have exponent sums α(A) = 2·β(B).
- **Non-unit t.** At t = √2 the points include the obvious A² = [[2,0],[0,1]]
  (flagged `power_of_generator`) but also e.g. ABAbaBAb = [[−2,0],[0,−1]],
  det 2.  Integer points need not be unimodular: |det| ≠ 1 already implies
  infinite order.
- **Degree ≥ 3 is hard.** Integrality demands a simultaneous collision of d
  Galois conjugates; at the cubic/quartic unit fields searched so far only
  ±I-torsion appears.
- **t = 9 (Long–Reid group).** The arXiv:2512.19760 length-82 witness is
  verified exactly (det 1, trace ≈ 6.06·10²³, infinite order in PGL₂) and
  seeded into the DB.  Plain beams (gcd/lcm/mixed, width 6000, depth 90)
  stall in the *torsion valley*: the relator floods short words evaluating
  to ±I, and greedy denominator-descent circles them without escaping —
  rediscovering witnesses needs a more structured (e.g. collision-style)
  search.

## Database

`data/integer_matrix_db.json` — per minimal polynomial: unit data for t and
t − 1, search coverage (exhaustive length, beam parameters), and deduplicated
records `{word, matrix, trace, det, infinite_order, found_by, …}` capped at
60 per field, shortest first (`total_distinct` keeps the full count).
