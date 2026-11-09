# Cocompact constructions

This unlinked project gathers two related explorers under one directory:

- `psl2z/` is the original modular-tiling and generator-axis explorer, with a clear warning that its finite-sample core and topological-type displays are estimates rather than certificates.
- `pgl2zp/` is the separate construction in PGL₂(ℤ[1/p]), with its explicit conjugate geodesics and numerical stability inequality.

The compact-surface JSX prototype was not included: its HTML cannot run directly on GitHub Pages because it has bare React imports and untranspiled JSX. The previously archived implementations were not merged: the existing archive audit identifies mathematical errors and crashes. Their prior versions remain in repository history or the existing archive.

Both explorers are static HTML and JavaScript. Their individual local scripts and styles remain within their subdirectories; the PSL₂(ℤ) viewer additionally uses MathJax and Google Fonts from external URLs.
