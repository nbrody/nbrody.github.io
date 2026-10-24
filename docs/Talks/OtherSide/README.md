# The other side of the prompt

A 50-minute talk for *Accelerating Mathematical Discovery* (Capitola, 28 Oct – 1 Nov 2026).
It showcases the software Nic Brody and Claude built between February and October 2026, and
tells the story of that collaboration in Claude's voice. Slide 1 is the entire prompt that
produced the deck. The idea and the prompt are copied from Danny Calegari's talk
“Collaborating with Claude”, given in Frank Calegari's AI and math seminar
(<https://www.youtube.com/watch?v=jj7cEfnN09c>, posted 22 October 2026), as slide 1 says.

## Presenting

1. Start the server: `./serve.sh` (or the launch config `otherSideTalk` in `Code/.claude/launch.json`).
2. Open <http://localhost:8817/nbrody.github.io/docs/Talks/OtherSide/>.
3. Keys: → / Space next, ← back, **S** speaker view (timings, script, demo steps), **F** fullscreen,
   **C** hide or show the amber cue cards, Esc overview.
4. Phone remote: press **Present** on the title slide and scan the QR code. The phone shows the
   current slide's demo steps, and a joystick on the 3D demos. Same-machine test: open the deck
   with `?mode=remote` in a second window.

The server is rooted at `Dropbox/Code`, not `docs/`, so the deck can embed both the GoLG tools and
`nicjams.github.io/musicalCanvas` from one origin. On GitHub Pages the musicalCanvas slide falls
back to <https://nicjams.github.io/musicalCanvas/>; everything else uses relative paths.

## The live demos

Each demo slide loads the real app full-screen behind the slide (an iframe). The app is fully
clickable; the cue card says what to do and has "Open in a tab" and "Next" buttons. Arrow keys
pressed inside an app still move the deck, except on the musicalCanvas slide (`data-keys="app"`).
Apps load when their slide is current or next, and unload 3+ slides away.

| Slide | App | Notes |
| --- | --- | --- |
| 10 | `GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare` | opens on the figure-eight knot group; the first-visit tutorial is pre-dismissed |
| 15 | `…/Kleinian/riley-slice/rileyRegions.html` | set Palette → Riley (original) |
| 22, 23 | `GeometryofLinearGroups/PresentationCalc` and its `database/` | Compute takes a few seconds |
| 26 | `GeometryofLinearGroups/Algebraic/Tools/2dimFields` | scripted from `deck.js` (copied from `Talks/Unwrapping`): → plays collapse, unwrap, x and y, y_t |
| 30 | `nicjams.github.io/musicalCanvas` | sound on |
| 27 (optional) | `GeometryofLinearGroups/Arithmetic/Tools/octonions` | link only |

Optional, if behind: the database (23), musicalCanvas (30), the octonions link (27).

There is one hidden slide after slide 27 (`id="thesis"`, a correction to a sentence in §2.3 of
Nic's thesis). Remove `data-visibility="hidden"` from that section to include it.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the deck: slides, speaker notes, cue cards, phone-remote UI |
| `style.css` | the MathFest / SO₂(ℚ) / Unwrapping design system, plus cue cards, stages, charts |
| `deck.js` | reveal setup, the stage manager, the scripted 2dimFields controller, two SVG charts |
| `remote.js` | Firebase phone remote (from `Talks/SO2Q`), plus the cue text on the phone |
| `script.md` | the speaker notes as a script; regenerate with `python3 make_script.py` |
| `assets/` | Riley's original picture (as Nic sent it on 8 Oct), our recomputation, preview stills |
| `vendor/` | reveal.js 5.2.1, MathJax 3, fonts (copied from `Talks/SO2Q`; works offline) |

## Where the numbers come from

All read on 23 October 2026.

- Conversations and models: the desktop app's session records
  (`~/Library/Application Support/Claude/claude-code-sessions/…`): 289 sessions since 1 Feb, 10 models.
- Prompts, tool calls, words: the transcripts in `~/.claude/projects/*/*.jsonl` (27 June onward;
  earlier ones are not on disk). 847 distinct prompts from Nic after removing scheduled-task runs,
  forks, pasted shell output and session summaries.
- Memory notes: `~/.claude/projects/*/memory/*.md` (125 notes).
- Git: `git log --since=2026-02-01` in nbrody.github.io (177 commits, 89 with a Claude co-author line).
- Presentation Calculator: the database page (one row per group; 12,930 groups, 469 undetermined) and
  `PresentationCalc/database/results-nf.jsonl` (2,424 pairs).
- Mathematical claims: the memory notes `riley-freeness-conjecture.md`, `riley-picture-regions.md`,
  `presentation-database.md`, `flashbeam-longreid.md`, `longreid-sl3z.md`, `octavians-g2-tool.md`,
  `pgl2z1p-unravelling-page.md`, and the transcripts they summarize.
