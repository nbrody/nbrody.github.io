# Quaternion beam search — web frontend

A fully client-side (BigInt, no backend) generalisation of the Python tool one
level up. Choose any two integer quaternions `a, b` whose reduced norms are
prime powers `p^x` and `q^y`; the page runs the same Reidemeister–Schreier beam
search to certify that `⟨a,b⟩` contains a finite-index subgroup of `PH(Z[1/p])`,
and draws the resulting Stallings graph.

## Run it

It uses ES-module Web Workers, so it must be served over HTTP (not `file://`):

```bash
python3 -m http.server 8120     # then open http://localhost:8120
```

(There is a `quaternionBeamSearch` entry in the repo `.claude/launch.json`.)

## What the inputs must satisfy

* `N(a) = p^x` and `N(b) = q^y` with `p ≠ q` distinct **odd** primes.
* `p ≡ 1 (mod 4)` — required for the Lubotzky–Phillips–Sarnak identification
  `PH(Z[1/p]) ≅ F_{(p+1)/2}` that makes the Stallings finite-index test exact.
  (`q` may be any odd prime; the tree splitting at `q` uses `α²+β² = −1`.)
* `a` and `b` must not commute. If they lie in a common `Q(√−1)` plane (e.g.
  `a = 1+2i`, `b = 4+i`) the group is abelian and the tool says so up front.

## Pipeline (all in `js/`)

| module | role |
|--------|------|
| `quaternion.js` | BigInt projective quaternion arithmetic; LPS generators and factorisation at `p` |
| `tree.js` | Bruhat–Tits tree vertices of `PGL₂(Q_q)` via `H ⊗ Q_q ≅ M₂(Q_q)` (general odd `q`) |
| `stallings.js` | Stallings folding / finite-index test in `F_r` |
| `beam.js` | the beam search (Reidemeister–Schreier on `T_q`, best-first by tree distance) |
| `worker.js` | runs `beam.js` off the main thread |
| `app.js` | UI, validation, progress, force-directed graph drawing |

The search keeps tree vertices exact by never exploring past tree distance
`precision − 2`; raise the **q-adic precision** control if a run reports the cap
was hit before closing up.

## Verified presets

| a | b | p, q | index in `F_{(p+1)/2}` |
|---|---|------|------|
| `1+2i` | `3+2j` | 5, 13 | 96 |
| `3+2j` | `1+2i` | 13, 5 | 96 |
| `1+2i` | `3+2i+2j` | 5, 17 | 8 |
