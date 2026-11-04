Node checks for the pure modules (no browser needed):

    node tests/presets.mjs     # every example replays, closes up, and reports its facets' χ, ∂, genus
    node tests/fuzz.mjs 1 150  # seed, runs: random move sequences; expect crashes/invalid/badFacet = 0
    node tests/iso.mjs         # isotopy matching: renamed copies match, altered copies do not
    node tests/crossings.mjs   # knotted webs: slides (R2/R3/R4) and kinks (R1), depth at crossings

fuzz.mjs also reports `safetyNet`: moves refused because they would have produced an invalid web
(the user just sees a clean "would leave an invalid web" message); a handful per thousand runs is expected.
