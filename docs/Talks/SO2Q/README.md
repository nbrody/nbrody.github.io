# SO₂(ℚ) is prime factorization in ℤ[i]

A ten-minute talk: SO₂(ℚ) ≅ ℤ/4 × ⊕_{p≡1 (4)} ℤ, and *why*. A rotation is a
Gaussian rational with z̄ = 1/z; conjugation fixes the ramified and inert primes
and swaps π_p ↔ π̄_p; so unique factorization forces e(π̄_p) = −e(π_p) and kills
every other exponent.

The full script, with timings and backup facts, is in `script.md`. The same text is
in the speaker notes (press **S**). It's a reveal.js deck in the style of
`../SO3Q/1/`, with the same design system, vendored assets and Firebase phone remote.

## Presenting

```bash
./serve.sh        # then open http://localhost:8784/Talks/SO2Q/
```

Or use the `so2qTalk` launch config. `file://` also works, apart from the remote.

- → / Space / the remote's Next step through every slide and fragment. The backup
  slide sits below the last one (↓).
- **Present** (title slide) shows a QR code for the phone remote. For a same-machine
  remote, open `?remote=1` in a second window.
- After typing in the factorizer, press Enter or Esc (or click the background) to
  hand the arrow keys back to the deck.

## The slides

| # | Slide | Time | What happens |
|---|---|---|---|
| 1 | Title | 0:00 | The crown of rational points turns behind the title |
| 2 | Rotations with rational entries | 0:15 | The line through −1 cycles through rational slopes; "as a group?" |
| 3 | The answer | 1:15 | ℤ/4 × ⊕ℤ, generators r_p = π_p/π̄_p for 5, 13, 17 |
| 4 | Step 1 · Rotations are Gaussian rationals | 1:55 | SO₂(ℚ) = {z z̄ = 1}, i.e. z̄ = z⁻¹ (mirror picture) |
| 5 | Step 2 · ℤ[i] has unique factorization | 2:45 | Euclid's rounding disks; ℚ(i)ˣ/units is free abelian on the primes |
| 6 | Step 3 · The Gaussian primes | 3:45 | The plane of primes; ramified / inert / split light up one per click |
| 7 | Step 4 · Conjugation is a mirror | 5:00 | The plane flips over ℝ: blue π's land on pink π̄'s, gold and teal stay put |
| 8 | Step 5 · Solve z̄ = 1/z | 5:40 | Exponents compared prime by prime ⇒ the theorem |
| 9 | Every rotation, factored | 7:00 | Live factorizer + exponent ledger (ramified/inert columns 0, split pairs mirror) |
| 10 | What falls out | 8:00 | Torsion, denominators ∏p^{\|e_p\|} and 2^{k−1} triangles, SO₂(ℤ[1/n]) |
| 11 | The moral | 9:10 | One bit per prime; ℤ[ω], ℤ[√−5]; SO₃(ℚ) and quaternions |
| 12 | Thank you (+ backup ↓) | 10:00 | Wilson, π ≁ π̄, Hilbert 90, denominators, local picture |

## Files

- `index.html`: the slides, speaker notes (the script) and remote UI
- `deck.js`: the reveal set-up, stereographic picture, Euclid picture, Gaussian-prime
  plots (kinds + conjugation flip), factorizer and ledger, title crown
- `gauss.js`: exact SO₂(ℚ) arithmetic (copied from `../SO3Q/1/viz/common/gauss.js`)
- `remote.js`: the phone remote (copied from `../SO3Q/1/`, own BroadcastChannel)
- `style.css`: the theme. `--c-ram`, `--c-inert`, `--c-pi` and `--c-pibar` colour the
  four kinds of Gaussian prime everywhere
- `vendor/`: reveal.js 5.2, MathJax 3, Inter + Playfair Display (copied from SO3Q/1)

## The math, checked

Every number on the slides was checked with `gauss.js` in Node: the generators and
angles, (−33 + 56i)/65 = r₅r₁₃, (63 − 16i)/65 = r₅r₁₃⁻¹, r₅³ = (−117 + 44i)/125,
(943 + 576i)/1105 = −r₅⁻¹r₁₃⁻¹r₁₇⁻¹, and the stereographic points. The 2^{k−1} count
was checked for every primitive hypotenuse up to 1200.
