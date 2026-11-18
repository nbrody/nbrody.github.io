# Welcome to AlphaCentaur

This demo project works through one piece of mathematics, the ping-pong lemma, with every tool AlphaCentaur has. Each section in the sidebar holds part of it. Visit them in any order. Nothing here can break: every save is kept, and History brings back any earlier version.

[[thm:pingpong]] (The ping-pong lemma, in one line)
If $a$ and $b$ push four disjoint nonempty sets into one another, so that $s(D_t) \subseteq D_s$ whenever $t \ne s^{-1}$, then $a$ and $b$ generate a free group.

## A tour, section by section

**Overview.** The project description, which only you can edit: the AI can read it but never change it. Below it, *AI editing restrictions* holds one rule, `notes/scratch/**`, which keeps the collaborator out of [[notes/scratch/Ideas]].

**Agent Instructions.** One skill, *Check a ping-pong configuration*, is turned on. The collaborator follows it when you ask it to check whether some elements play ping-pong. Skills are Markdown files you write; an edit by the AI waits for your approval.

**Notes.** [[notes/The ping-pong lemma]] has the statement and proof, written with theorem blocks and live math. Click any formula to edit its LaTeX. Macros such as `\mat` and `\gen` come from the project's `macros.tex`, and apply in notes, slides, the notebook and the paper alike. Then read [[notes/Examples]] and [[notes/Open questions]]. Open History on the first note to see an earlier draft that forgot a hypothesis.

**Handwriting.** [[handwriting/Ping-pong sketches]] has three pages of pen-and-highlighter sketches: the four discs, the proof, and Sanov's cones. Write on them with an Apple Pencil, a mouse or a trackpad.

**Bibliography.** Ten references with reading notes. Their citation keys feed `alphacentaur.bib`, which every LaTeX build uses. The two arXiv papers have **Get PDF**, which downloads the paper so you can read it beside your notes. **Add reference** looks up a DOI or an arXiv number.

**Apps.** [[apps/ping-pong-explorer]] lets you drag four Schottky discs and watch the limit set, or push Sanov's cones around with the generators. [[apps/word-reducer.html]] is a single-file app: edit its source and the preview follows.

**Computations.** [[computations/ping_pong.py]] is a reactive notebook. Change $t$ or $q$ and every cell that depends on it runs again. It tests the ping-pong sets with exact arithmetic and searches for relations when they fail. [[computations/count_reduced_words.py]] is a plain script. **Record run** keeps a run's output, figures and files, with the exact versions of its inputs.

**Formalization.** [[lean/PingPong/Lemma.lean]] proves the four-set lemma in Lean, and [[lean/PingPong/Sanov.lean]] applies it to Sanov's matrices: both check with no `sorry`. [[lean/PingPong/Exercises.lean]] leaves its proofs as `sorry` on purpose, so it is labeled incomplete. [[lean/blueprint.tex]] matches the paper's statements with the Lean names.

**Presentation.** [[talks/ping-pong]] is a 15-minute talk with builds, speaker notes, a live applet, the explorer app embedded on a slide, and a Python console that runs on its slide. Press Present. With a phone remote set up (Settings → Phone remote for slides), your phone shows notes, a timer and the applet's controls.

**EigenReel.** [[reels/ping-pong]] is a short looping piece for the EigenReel feed. Tap it to play ping-pong yourself. **Ready for EigenReel** checks it against the feed's rules.

**Manuscript.** [[manuscript/main.tex]] is the paper, with sections, figures, cross-references and citations from Bibliography. Compile it, then click the PDF to jump to the source.

**Project files and Activity.** Project files shows everything as one folder tree; the Trash holds an old outline you can restore, and Export saves the whole project as a ZIP. Activity lists every change and run, and who made it.

## The collaborator

Connect an AI provider in Settings, then open the chat. It works only inside this project, sees the documents you select, and follows the editing restrictions and skills above. It has already left one suggestion for you to review: an example to add to [[notes/Examples]]. Look for **Review suggested revision** in the chat panel, then adopt or reject it.

## Runs on this computer

When this project was created, AlphaCentaur ran the notebook and the script, compiled the paper and checked the Lean files, as far as this computer has the tools: LaTeX needs [MacTeX](https://tug.org/mactex/), and Lean needs [elan](https://lean-lang.org/install/). Their results are in each document's runs.
