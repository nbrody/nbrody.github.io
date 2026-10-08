# SO₂(ℚ) is prime factorization in ℤ[i]

*A ten-minute talk. About 1,350 spoken words. Times are cumulative.*

The deck (`index.html`) has this text in its speaker notes (press **S**).

---

## 1 · Title (0:00 to 0:15)

I want to tell you about a group I love: SO₂ of the rationals, the rotations of
the plane whose matrices have rational entries. The punchline is in the title.
The structure of this group is nothing more than prime factorization in the
Gaussian integers.

## 2 · Rotations with rational entries (0:15 to 1:15)

A rotation matrix looks like (x, −y; y, x) with x² + y² = 1. Asking for rational
entries is asking for a rational point on the unit circle. Clear denominators and
that's a Pythagorean triple. So 3-4-5 gives a rotation, 5-12-13 gives a rotation,
8-15-17 gives a rotation.

As a *set*, this is easy. Draw a line through the point −1 with rational slope t.
It hits the circle again at a rational point, and every rational point comes from
some t. So there are infinitely many rational rotations, one for each rational
number.

But this parametrization knows nothing about the group law. If I rotate by the
3-4-5 angle and then by the 5-12-13 angle, which triple do I land on? Does some
power of the 3-4-5 rotation come back to the identity? What *is* this group?

## 3 · The answer (1:15 to 1:55)

Here is the answer. SO₂(ℚ) is a cyclic group of order four, the quarter turns,
times a free abelian group of countably infinite rank, with one generator for
each prime congruent to 1 mod 4.

The generator for p comes from the factorization of p in ℤ[i]. Write
p = π_p · π̄_p, and the generating rotation is r_p = π_p / π̄_p. For p = 5 that's
(2 + i)/(2 − i), which is exactly the 3-4-5 rotation.

The rest of the talk is *why*. The slogan: the group structure of SO₂(ℚ) is a
census of how the rational primes factor in the Gaussian integers.

## 4 · Step 1: rotations are numbers (1:55 to 2:45)

Step one: identify the matrix (x, −y; y, x) with the complex number x + yi.
Multiplying the matrices is multiplying the numbers, and the determinant
x² + y² is the norm, z times z-bar.

So SO₂(ℚ) is the group of norm-one elements of the field ℚ(i). I want to write
the norm-one condition in a slightly odd way: z z̄ = 1 says z̄ = 1/z. *The
conjugate of a rotation is its inverse*, as in the picture: z and z̄ are mirror
images. That one equation is what we're going to solve, using factorization.

## 5 · Step 2: unique factorization (2:45 to 3:45)

Step two: the Gaussian integers have unique factorization. The reason is that
they have a division algorithm. To divide α by β, round α/β to the nearest
lattice point κ. Every point of the plane is within √2/2 of the lattice (these
disks cover everything), so the remainder α − κβ has strictly smaller norm than
β, and Euclid's algorithm runs exactly as it does in ℤ.

So every nonzero Gaussian integer factors into Gaussian primes, uniquely up to
the four units ±1, ±i. Allow denominators, and every nonzero element of ℚ(i) is
uniquely a unit times a product of primes to integer powers, with negative
exponents for the denominator.

Another way to say it: modulo units, ℚ(i)ˣ is a free abelian group with one basis
vector for each Gaussian prime. An element is just its exponent vector.

## 6 · Step 3: the Gaussian primes (3:45 to 5:00)

So we need to know the Gaussian primes. Here they are, in the plane. Each one
divides exactly one ordinary prime p, and an ordinary prime can behave in three
ways.

*[click]* The prime 2 is special: 2 = −i(1 + i)². It's the square of a single
prime, up to a unit. We say 2 *ramifies*.

*[click]* A prime congruent to 3 mod 4 stays prime, because a sum of two squares is
never 3 mod 4, so nothing has norm q. These are the primes on the axes: 3, 7, 11,
and so on. They're *inert*.

*[click]* A prime congruent to 1 mod 4 *splits* into two different primes:
5 = (2 + i)(2 − i), 13 = (3 + 2i)(3 − 2i), 17 = (4 + i)(4 − i). This is Fermat's
two-squares theorem. −1 is a square mod p, so p divides x² + 1 = (x + i)(x − i)
without dividing either factor, so p can't be prime in ℤ[i].

## 7 · Step 4: conjugation is a mirror (5:00 to 5:40)

Complex conjugation is a ring automorphism of ℤ[i], so it sends primes to
primes. Geometrically it reflects the picture across the real axis. Watch.
*[click: the plane flips]*

1 + i goes to 1 − i, which is −i times 1 + i: the same prime. The inert primes
land on themselves, up to sign. But the split primes trade places. The blue ones
land where the pink ones were. 2 + i and 2 − i are genuinely different primes.

*[click]* So conjugation fixes the ramified and inert primes, and swaps the two
halves of every split prime.

## 8 · Step 5: solve z̄ = 1/z (5:40 to 7:00)

Now we can solve z̄ = 1/z. Write z as a unit times a product of primes π to powers
e_π. Then z̄ is the conjugate unit times the product of the π̄'s to the same
powers, and 1/z is the inverse unit times the π's to the negative powers.

Unique factorization says we can compare exponents, prime by prime.

*[click]* At 1 + i, conjugation doesn't move the prime, so its exponent equals its
own negative. It's zero. *[click]* The same goes for every inert prime. Ramified and
inert primes can't appear in a rotation at all.

*[click]* At a split pair, conjugation swaps π and π̄, so the condition is
e(π̄) = −e(π). Whatever power of π shows up upstairs, the same power of π̄ shows up
downstairs.

*[click]* So z is a unit times a product of the ratios π_p / π̄_p to the powers e_p.
Conversely, every such product has norm one, and unique factorization says the
exponents are determined by z. That's the theorem: ℤ/4 times a free abelian group
on the primes that split.

## 9 · Every rotation, factored (7:00 to 8:00)

Let's see it. *[chip 3-4-5]* The 3-4-5 rotation is (2 + i)/(2 − i).
*[chip 5-12-13]* The 5-12-13 rotation is (3 + 2i)/(3 − 2i). *[chip 33-56-65]*
Compose them and you get (−33 + 56i)/65, the 33-56-65 triangle, with exponent
vector (1, 1). *[chip 63-16-65]* Use the inverse of the 13-generator instead,
exponent vector (1, −1), and you get (63 − 16i)/65, the 16-63-65 triangle.

The ledger at the bottom is the proof in pictures. The ramified and inert columns
are always empty, and each split pair is a mirror image.

*[optional: ask the audience for a Pythagorean triple and type it in]*

## 10 · What falls out (8:00 to 9:10)

Three consequences fall right out.

*[click]* **Torsion.** The only rotations of finite order are the four quarter
turns. So the 3-4-5 angle, 53.13 degrees, is not a rational number of degrees.
Better: π, together with all the generating angles θ₅, θ₁₃, θ₁₇, …, is linearly
independent over ℚ.

*[click]* **Denominators.** π_p and π̄_p never cancel against each other, so in
lowest terms the denominator is exactly the product of p^|e_p|. So the hypotenuses
of primitive Pythagorean triangles are exactly the products of primes that are
1 mod 4. A hypotenuse with k distinct prime factors has 2^(k−1) primitive
triangles, one for each choice of signs up to symmetry. 65 has two: 33-56-65 and
16-63-65. 1105 = 5 · 13 · 17 has four.

*[click]* **Restricted denominators.** If you only allow primes dividing n in the
denominator, you get ℤ/4 times ℤ to the number of primes dividing n that are
1 mod 4. So SO₂(ℤ[1/3]) is just the quarter turns, and SO₂(ℤ[1/5]) is the quarter
turns times the powers of the 3-4-5 rotation.

## 11 · The moral (9:10 to 10:00)

Here's the moral. SO₂(ℚ) remembers exactly one bit about each prime p: does p
split in ℤ[i]? If it ramifies or stays inert, it contributes nothing. If it
splits, it contributes a copy of ℤ.

*[click]* The same proof works in other rings. For the Eisenstein integers ℤ[ω],
the norm-one elements of ℚ(ω), which are the rotations that are rational in
hexagonal-lattice coordinates, form ℤ/6 times a free abelian group on the primes
that are 1 mod 3. When unique factorization fails, as in ℤ[√−5], the class group
gets in the way.

*[click]* And one dimension up, SO₃(ℚ) is governed by the integer quaternions.
Quaternions don't commute, factorization is unique only once you fix an order for
the primes, and instead of a free abelian group you find free groups acting on
trees. That's a story for another day.

Thank you.

---

## Backup facts for questions

- **Why −1 is a square mod p ≡ 1 (4).** Wilson: (p − 1)! ≡ −1. Pair x with −x to
  get (p − 1)! ≡ (−1)^((p−1)/2) · ((p−1)/2)!², so ((p−1)/2)!² ≡ −1.
- **Why π and π̄ are not associates.** The associates of a + bi are ±(a + bi) and
  ±(−b + ai). If one of them were a − bi then ab = 0 or a = ±b, so p = a² + b² is a
  square or 2a², neither of which is an odd prime.
- **Stereographic projection is Hilbert 90.** The slope-t point is
  (1 + ti)/(1 − ti) = (1 + ti)²/(1 + t²) = w/w̄ with w = 1 + ti. Factor w and
  w/w̄ = (u/ū) ∏ (π/π̄)^(e_π): the inert and ramified primes cancel, and that gives
  existence directly.
- **Why the denominator is ∏ p^|e_p|.** Writing β = ∏ π_p^(e_p) (using π̄_p when
  e_p < 0), the rotation is u · β/β̄ = u · β²/N(β). The numerator β² is divisible
  by only one of π_p, π̄_p, so no rational prime p cancels.
- **Linear independence of the angles.** If Σ n_p θ_p = (r/s)π, then
  ∏ r_p^(s·n_p) = ±1 is torsion, so every s·n_p = 0.
- **Counting.** Denominator exactly c = ∏ p^(f_p): e_p = ±f_p and four units give
  4 · 2^k points. Exactly 2^k lie in the open first quadrant, and swapping a, b pairs
  them up, so there are 2^(k−1) triangles. 1105: 47-1104, 264-1073, 576-943,
  744-817.
- **ℤ[√−5].** The norm-one group is still {±1} × (free abelian), since it embeds in
  ⊕ ℤ over the split primes. But only exponent vectors with Σ 2e_p[𝔭_p] = 0 in the
  class group occur. For p = 3, 𝔭² = (2 + √−5) gives the generator
  (2 + √−5)/(2 − √−5) = (−1 + 4√−5)/9.
- **Local picture.** SO₂ is the norm-one torus of ℚ(i)/ℚ. It's compact over ℚ_p
  unless p splits, and then SO₂(ℚ_p) ≅ ℚ_pˣ has valuation map onto ℤ. The coordinate
  e_p is the π_p-adic valuation.
