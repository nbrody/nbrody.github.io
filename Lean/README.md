# Lean Projects

This directory is a single Lean 4 / Mathlib workspace with one Lake build cache.

## Projects

- `BHC/`: Borel-Harish-Chandra formalization. The Lean library is `BorelHarishChandra`.
- `Golg/`: Golg conjecture formalization. The Lean library is `Golg`.
- `4DPC/`: empty placeholder directory.
- `GPS/`: empty placeholder directory.

## Setup

Run Lake commands from this directory:

```sh
lake update
lake exe cache get
lake build
```

The root `lakefile.lean`, `lake-manifest.json`, `lean-toolchain`, and `.lake/`
are shared by the active libraries. Project-specific notes stay in
`BHC/README.md` and `Golg/README.md`.
