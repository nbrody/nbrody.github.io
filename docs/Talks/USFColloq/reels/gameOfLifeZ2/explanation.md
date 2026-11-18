## Game of Life in (ℤ/2)²

**Entry notes.** Interactive · desktop and mobile · tap to interact on mobile (click on desktop).
Tags: Dynamical systems, Group theory, Combinatorics.
Palette: the field uses *Nebula* in dark mode, background `#07080f` with `a` `#ff5d73`, `b` `#38d9f5`, `c` `#ffd166`, and *Paper* in light mode, background `#f1ece1` with `a` `#d1495b`, `b` `#00798c`, `c` `#e0a030`. The panel uses `#818cf8` on `#060a14` (dark) or `#5f67cf` on `#ffffff` (light). Other palettes are in the Look section.
Feed mode has no text; in interact mode the stories speak again as chapter captions. Esc (or ✕) returns from interact mode to the feed. `?embed=true` hides all chrome, `?mode=interact` opens engaged, `?theme=light|dark` overrides the system setting, `?t=` starts the feed at that second.

Ported from the Game of Life page of nicjams.github.io's Graphics Studio; the engine, patterns and stories are the same.

### The group
The **Klein four-group** is *V* = (ℤ/2)², the four elements 0, *a*, *b*, *c* with *x* + *x* = 0 and any two of the nonzero ones adding to the third: *a* + *b* = *c*, *b* + *c* = *a*, *a* + *c* = *b*. Encode 0, *a*, *b*, *c* as 0, 1, 2, 3 and addition is XOR. Its automorphism group is GL₂(𝔽₂) ≅ *S*₃, and

    σ : a → b → c → a

is one of its two elements of order 3.

### The rule
Every live cell carries a charge in *V*, one of the three nonzero elements, drawn as three colours. Whether a cell lives is **ordinary Life** (B3/S23 unless you change it), decided by the *number* of live neighbours and blind to their colours. So the field's black-and-white shadow is plain Life, and a pattern of a single colour evolves exactly as it does in Life under every law below. The colours are extra structure on top, decided by a *law*:

- **Heredity.** A newborn is the sum of its three parents. Three of a kind give that kind, and two of one kind with a third give the third, so a newborn is the odd one out. Parents *a*, *b*, *c* sum to 0: the birth is **stillborn**, and colour has changed the shadow. Survivors keep their colour.
- **Alchemy.** Births as in Heredity. A survivor *x* also absorbs the sum *s* of its neighbours and becomes *x* + *s* (unless that is 0). One-colour patterns are untouched, but mixed ones shimmer.
- **Predation.** σ gives every colour a predator: *b* eats *a*, *c* eats *b*, *a* eats *c*. A birth with only *x* and σ(*x*) among its parents takes σ(*x*), and each σ(*x*) neighbour of a survivor *x* may convert it (the *bite*).
- **Tribes.** Newborns take the majority colour, and survivors defect to any colour that outnumbers their own among their neighbours (at least two).

**Mutation** recolours a newborn at random. The **lens** recolours the display without touching the state: *Mod ⟨g⟩* shows the image in *V*/⟨*g*⟩ ≅ ℤ/2, with cells equal to *g* in grey and the other two in one colour; *Shadow* shows alive or dead only.

### What the feed shows
Three of the page's five stories, time-lapsed and silent.

- **Genesis.** An R-pentomino of a single colour burns in an empty field. Then births start to make mistakes, and the one live state splits into all three elements of *V*. The mistakes stop and Heredity takes over, with its stillborn triads.
- **Seasons.** A soup of all three colours under Conway's rule, then Life without death, Maze (B3/S12345) and Coral (B3/S45678), with the colours reshuffled by the arithmetic.
- **Three Kingdoms.** Three single-colour realms flood into one another under Day & Night, then Predation sweeps conversion fronts through them, and rare mutations turn the fronts into spirals.

### Try this
- Tap the story chips for **Three Forges** (three Gosper guns, one per colour), **The Garden**, or the full-length versions of the others. Captions narrate each chapter.
- Change the **colour law** in the middle of a run and watch the same cells recolour differently.
- Pick **One kind** to drop the colours and get plain Life: with a single colour there are no triads to cancel, so the shadow is exactly Conway's.
- In **Look**, try the **lens** *Mod ⟨a⟩*: the three-colour picture collapses to the two-colour quotient.
- Stamp a **Gosper glider gun** in colour *a* and another in colour *b* so their streams cross. Where gliders of different colours collide, the sum rule colours the wreckage.
- Drag to paint with a chosen ink, or pick a pattern and tap to stamp it. Rotate stamps with **T**.

**References.** J. H. Conway, in M. Gardner, "Mathematical Games: The fantastic combinations of John Conway's new solitaire game 'life'", *Scientific American* 223 (October 1970). F. Klein, *Vorlesungen über das Ikosaeder und die Auflösung der Gleichungen vom fünften Grade* (1884), where the *Vierergruppe* appears.
