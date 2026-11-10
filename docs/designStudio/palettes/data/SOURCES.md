# Palette sources

`tools/build.mjs` reads these files and writes `js/corpus.js` (the palettes and the trained model). Rebuild after changing anything here:

```
node docs/designStudio/palettes/tools/build.mjs
node --test docs/designStudio/palettes/tests/*.test.mjs
```

| File | What | Source | License |
|---|---|---|---|
| `sources/metbrewer.R` | 56 palettes from works at the Metropolitan Museum of Art, with a published order for picking subsets | [BlakeRMills/MetBrewer](https://github.com/BlakeRMills/MetBrewer), `R/PaletteCode.R` | CC0 1.0 |
| `sources/wes.R` | 22 Wes Anderson film palettes | [karthik/wesanderson](https://github.com/karthik/wesanderson), `R/colors.R` | MIT |
| `sources/wada.json` | Sanzo Wada, *A Dictionary of Color Combinations* (1933): 157 colors in 348 combinations of 2–4 | [mattdesl/dictionary-of-colour-combinations](https://github.com/mattdesl/dictionary-of-colour-combinations) | MIT (the book itself is public domain in Japan) |
| `sources/nice1000.json` | The 1000 most-loved 5-color palettes on COLOURlovers | [Jam3/nice-color-palettes](https://github.com/Jam3/nice-color-palettes) v3.0.0 | MIT; the palettes are COLOURlovers community content under CC BY-NC-SA 3.0 |

Hand-entered in `tools/build.mjs`, from each project's published values: Okabe–Ito; Paul Tol's bright, vibrant, muted and light sets; Tableau 10; Observable 10; d3 Category 10; ColorBrewer qualitative sets (Set1–3, Dark2, Pastel1–2, Accent, Paired); IBM's accessible set; Flexoki 400 and 600; the accent colors of Nord, Solarized, Catppuccin (Mocha, Latte), Gruvbox, Dracula, Rosé Pine (and Dawn), Tokyo Night, Kanagawa, Everforest, One Dark and Monokai; and viridis, magma, inferno, plasma and cividis sampled at 8–10 points.

Duplicate palettes (same set of colors) are kept once. Wes Anderson's `Zissou1Continuous` is skipped (a gradient, not a palette).
