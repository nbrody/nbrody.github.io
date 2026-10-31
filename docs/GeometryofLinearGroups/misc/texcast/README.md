# texcast

Animated LaTeX stored as text, like asciinema for formulas. A recording holds
only the LaTeX and its timing. The player typesets it in the browser with KaTeX
and morphs each formula into the next: matching glyphs glide to their new
places, and the rest fade out or in.

- `player.js`: the player and the `<texcast-player>` element. It has no build
  step and loads KaTeX from jsDelivr if the page hasn't already.
- `recorder.js`: the in-page recorder used by `index.html`.
- `casts/`: demo recordings (0.8–1.3 KB each).

## Embed

```html
<script src="texcast/player.js"></script>
<texcast-player src="derivation.texcast" autoplay loop></texcast-player>
```

You can also put the recording inline with
`<script type="text/texcast">…</script>` inside the element. Attributes:
`src`, `autoplay` (starts once it scrolls into view), `loop`, `poster`
(seconds, or `end`).

Keys: Space plays or pauses, ←/→ steps between frames, and Home/End jumps to
either end.

## Format

JSON lines, like asciicast v3. The first line is a header, and each line after
it is an event that starts with the delay in seconds since the previous event.
Lines starting with `#` are comments.

```
{"version": 1, "title": "Completing the square", "morph": 0.8}
[0,   "show",    "x^2 + 6x + 5 = 0"]
[0,   "caption", "Move the constant over."]
[2.5, "show",    "x^2 + 6x = -5"]
```

| Event | Meaning |
| --- | --- |
| `[dt, "show", latex, {morph}?]` | Replace the formula. |
| `[dt, "edit", pos, del, text, {morph}?]` | Splice the current LaTeX. Positions are JavaScript string indices. The keystroke recorder writes these. |
| `[dt, "caption", text]` | Set the caption. `$…$` is inline math, and `""` clears it. |

Unknown event types are ignored.

Header fields, all optional except `version`:

- `title`
- `morph`: seconds per transition, default 0.6
- `hold`: seconds held on the last frame, default 2
- `duration`
- `source`: show the LaTeX as it's typed
- `poster`
- `size`: type scale
- `macros`: extra KaTeX macros

Colour macros that follow light and dark mode: `\blue{}`, `\red{}`, `\green{}`,
`\gold{}`, `\purple{}`, `\faint{}`.

If a frame's LaTeX doesn't parse (someone halfway through typing `\frac{`),
the last frame that did parse stays on screen.

## How the morph works

Each frame is rendered by KaTeX and split into units: single characters,
rules such as fraction bars, and SVG pieces such as radicals. Units are
matched between frames by key, first in reading order (longest common
subsequence) and then by nearest position for leftovers, so a term can cross
the equals sign. During a transition, free-floating copies of the units
animate from the old positions to the new ones, then the real new frame is
swapped in.

## Not done yet

- **Full LaTeX (TikZ, any package).** Render each frame with
  `latex` + `dvisvgm --no-fonts` at build time. Glyph outlines are stored once,
  so frames stay small, and the same morph logic applies.
- **Explicit pairing.** A way to say "this term is that term" when automatic
  matching guesses wrong, like Manim's `TransformMatchingTex` keys.
- **Video export.** Play the recording in a headless browser and capture
  frames, for places that only accept MP4.
