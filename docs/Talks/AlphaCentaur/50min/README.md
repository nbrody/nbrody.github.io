# alphaCentaur — the talk

A 50-minute talk for *Accelerating Mathematical Discovery: A Crash Course in AI
and Computation* (Santa Cruz, 28 Oct – 1 Nov 2026). 35 slides, built with
alphaCentaur's own slide editor (`private/alphaCentaur/presentations`).

The talk is a worked example in five parts. I: the research problem (which
subgroups of PGL₂(ℚ) are S-arithmetic, and which are thin?). II: the
Presentation Calculator, built with a coding agent: who did what, the
cross-checks, and the bugs they caught. III: alphaCentaur and its rules.
IV: a live demo of the calculator inside alphaCentaur. V: advice for the
working groups.

The per-slide script, with timings, is in `script.md`. It is also in the speaker
notes: press **N** while presenting. Lines marked `[Nic: …]` need checking.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The deck. Fonts and libraries load from CDNs. This file opens in the slide editor. |
| `offline.html` | The same deck, self-contained (works without Wi-Fi). |
| `script.md` | The talk script (generated from the speaker notes). |
| `source/make_deck.py` | Writes `source/deck.json` and `script.md`. This is the bootstrap: see below. (`make_deck_25min.py.bak` is the earlier 25-minute draft.) |
| `source/orbit.html` | The binary-star applet (slides 1, 2 and 35). |
| `source/shots/` | App screenshots: `live-*` from the Presentation Calculator project in the live workspace, the rest from a scratch copy of the database. |
| `build.html`, `build_server.py` | Render `deck.json` with the editor's own exporter. |

## Presenting

Open `index.html` in a browser, or `offline.html` without internet. → / Space
advance through the builds, ← goes back, **N** shows notes, **F** goes
fullscreen, and a number followed by Enter jumps to that slide.

## Editing

**In the slide editor (recommended).** Run
`python3 private/alphaCentaur/presentations/serve.py` and open
http://localhost:8786/, then choose **File → Open** and select `index.html`. In
Chrome, **⌘S** writes the file back in place. To refresh `offline.html`, use
**File → Download → Self-contained**. It can also be imported into an
alphaCentaur project's Presentation section.

**From the generator.** Edit `source/make_deck.py` and run it, then start the
`alphaCentaurTalk` launch config (or `python3 build_server.py`) and open
http://localhost:8799/nbrody.github.io/docs/Talks/AlphaCentaur/50min/build.html. That
page rewrites `index.html` and `offline.html`.

**Edits in the editor and the generator don't mix.** Once the deck has been
changed in the editor, `index.html` is the source of truth. Re-running
`make_deck.py` and `build.html` would overwrite those edits.

## The live demo (slides 24–29)

The project **Presentation Calculator** in the live workspace holds the
calculator, imported with
`private/alphaCentaur/scripts/import-app.mjs`. That is 113 files (92 editable,
labelled "imported · authorship unverified"), with KaTeX, jQuery and MathQuill
as project copies, because project apps have no network. It runs in **Apps → PresentationCalc/index.html →
Preview**, served from alphaCentaur's apps origin (port 4311).

Before the talk:
- Write the question in the project's `description.md` (only you can).
- Rehearse the collaborator step once. The prompt is in slide 28's notes, and the
  configured provider is OpenAI. Slides 25–29 are the backup if the network fails.
- The demo script is in slide 24's notes.

## Numbers on the slides

The calculator counts on slides 7 and 12 come from
`PresentationCalc/database/*.jsonl` (latest decided record per group), read on
21 October 2026. To check alphaCentaur's own usage:

```sh
sqlite3 -readonly ~/Library/Application\ Support/alphaCentaur-local/workspace.sqlite \
  "select count(*) from projects; select count(*) from artifacts;
   select origin, count(*) from revisions group by origin;
   select kind, count(*) from runs group by kind;"
```
