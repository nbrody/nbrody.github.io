# alphaCentaur — talk script (50 minutes)

For *Accelerating Mathematical Discovery: A Crash Course in AI and Computation*, Santa Cruz, 28 Oct – 1 Nov 2026.

Generated from the speaker notes by `source/make_deck.py`. Once the deck has been
edited in the slide editor, the notes in `index.html` (press N while presenting) are current.

Lines marked [Nic: …] are guesses about your own experience: check or replace them.

## 1. alphaCentaur

~0:00–0:30. This talk is a worked example. One research problem, a tool I built with an AI coding agent to attack it, and the workspace I built so that the human–AI collaboration stays honest. Then a live demo, and some advice for the working groups later this week.

## 2. Centaurs, and Alpha-everything

~0:30–2:00. The name is a mash-up. "Centaur" is the chess word for a human–computer team: in the 2005 freestyle tournament, where anyone could enter with any hardware, the winners were two amateurs running three ordinary computers, ahead of grandmasters who also had engines. Kasparov's reading of that was that the process mattered more than the strength of either the human or the machine.

"Alpha" is DeepMind's naming convention — AlphaGo, AlphaZero, AlphaFold, AlphaProof, AlphaGeometry, AlphaEvolve. So alphaCentaur is meant to be an Alpha-style system that keeps the human in the loop.

And it happens that Alpha Centauri is a binary star, which is the app's icon: two stars orbiting a common centre.

## 3. A worked example in five parts

~2:00–2:45. Here's the plan. The common thread is one research problem, so you see real mathematics rather than a toy.

## 4. Which matrix groups are arithmetic?

~2:45–5:00. The problem. Take a few 2×2 rational matrices and the group they generate. Clearing denominators puts it inside PGL₂(ℤ[1/S]), which sits as a lattice in a product of real and p-adic groups, acting on the hyperbolic plane times a product of trees.

Four questions, in increasing order of difficulty: is it Zariski dense; is it discrete somewhere; is it S-arithmetic — finite index — or thin; and what's a presentation. For a single group these can be very hard; the thin-versus-arithmetic question has no general algorithm.

## 5. An easy one, and a hard one

~5:00–7:30. Two examples. On the left, translation, inversion and a diagonal matrix: the calculator decides in milliseconds that this has index 2 in PGL₂(ℤ[½]) and gives a presentation as a graph of groups on the 3-regular tree.

On the right, two matrices, one an involution, with S = {2, 3}. It's non-discrete at every place, so no geometric argument works directly. The congruence closure — the smallest congruence subgroup containing it — has index 960, so if it were arithmetic its index would be 960. But coset enumeration with twenty million cosets doesn't close, and if you count elements of small height, the group reaches a vanishing fraction of its closure: 157 of 5319 at height 100. It looks thin, probably a free product ℤ ∗ ℤ/2. We have no certificate. (That density-by-height diagnostic was my idea; the AI ran it.)

## 6. The Presentation Calculator

~7:30–9:30. The tool. You type matrices — over ℚ or a number field — and press Compute. It runs four stages, in the browser, in parallel web workers: the Zariski and congruence closures; discreteness place by place, using Poincaré's polyhedron theorem at the real place and Bass–Serre theory on the trees; then the arithmetic stage, which tries several certificates of finite index; and finally a presentation.

Every "yes" it prints comes with a certificate it checked exactly. Every "I don't know" is labelled as such.

## 7. Built with a coding agent

~9:30–11:00. The calculator existed in a small form last year. The version you'll see was built over about two weeks this month, with a coding agent — Claude Code — that had a shell in my website's repository. It wrote most of the code: classical combinatorial group theory algorithms, each of which is a paper's worth of careful implementation, plus a batch pipeline that runs the same code over tens of thousands of groups.

[Nic: check the dates and adjust the "2 weeks" framing; git shows the first version in September 2025.]

## 8. Who did what

~11:00–13:00. The division of labour. The agent is extraordinary at implementation and at sweeping: give it Todd–Coxeter and it writes Todd–Coxeter, then runs it on twenty thousand groups and tells you which ones time out.

What it didn't do was decide what mattered. Several of the big wins came from me supplying a piece of structure — for instance a lemma from an appendix of a paper of mine: a group containing a finite-index subgroup of PGL₂(ℤ) is automatically S-arithmetic, so no covering argument is needed. And I had to keep pushing back on over-specialization: at one point it had built Bianchi-group machinery that only worked for three fields, and the right move was to go back to Vaserstein's theorem and Benoist–Oh, which work for every number field.

[Nic: the arXiv reference for the appendix is 2308.07785; confirm the wording you want.]

## 9. Trust came from cross-checks

~13:00–15:00. Why should anyone believe a 13,000-line program written mostly by an AI? Not because the AI is trustworthy. Because every verdict can be reached two independent ways, and we compared them in bulk. The congruence closure is pure finite group theory; the coset enumeration is combinatorial; they agree on 400 groups. Vertex orbits on the product of trees agree with Todd–Coxeter on every group where both finish. Presentations were checked against GAP. Over number fields, the verdicts never contradict the known theorems.

## 10. What the cross-checks caught

~15:00–17:00. Three things that went wrong, all caught. One: a certificate that was simply unsound — the agent's Bass–Serre test accepted edge inversions of order more than 2, which fix only the midpoint of an edge. 71 database entries said "discrete" and shouldn't have. Two: a congruence computation that quietly assumed the wrong group of scalars and got half the index on about 3% of groups — found only because it disagreed with coset enumeration. Three, the most instructive: a wrong conclusion. On the rational Riley groups the machine kept failing to close coset enumerations, which nudged us towards "thin". The right observation was structural, and it turned every case into a finite-index problem with a known index. (That one is from this week's AIMing talk.)

AI-written mathematical code is a conjecture generator until it's cross-checked.

## 11. Dead ends are results

~17:00–18:30. A lot of the work was failed attempts at a thinness certificate. We kept them all, with reasons. One failure became a theorem: for a free product that's non-discrete at one place and also in the product of the others, there are no open ping-pong sets on the boundary — so the classical approach provably can't certify our hard example. The agent is good at trying things; somebody has to write down why they failed, or it — or the next agent — will try them again.

## 12. Where it stands

~18:30–19:30. Where things stand. Over twenty-three thousand groups over ℚ, all small-height pairs up to symmetry: about 98% decided, each with a checked certificate. The open ones look thin, and the honest summary is that the bottleneck is now mathematical — we need a new kind of certificate — not computational.

(Counts from the database on 21 October 2026, latest decided record per group.)

## 13. Where did the record of all this live?

~19:30–20:30. Here's the uncomfortable part. The calculator was built in a coding agent with a shell on my disk. The research log for it is a memory file the agent wrote for itself. The results were rewritten every time a bug was fixed. And nothing records who contributed which idea or which line. For a tool that's fine. For research, it isn't: in three weeks I won't know which claims I checked. That's what alphaCentaur is for, and in the demo we'll move the calculator into it.

## 14. One workspace, one project per question

~20:30–21:30. alphaCentaur is a local application: a small Node service with a SQLite database, a browser front end and a native Mac wrapper; the iPad pairs with it for handwritten notes. The unit is the project — one per research question — with its own files, its own conversation with the AI and its own computation history. It isn't tied to one AI company.

## 15. Every kind of research artifact, side by side

~21:30–22:15. Each project has these sections. Each is a reasonable version of a tool you already use; the point is that they share one store, one history and one AI collaborator.

## 16. A quick tour

~22:15–23:15. A quick tour, from my real projects: notes with live mathematics (the SO₃(ℚ) classification conjecture), a Python check the AI wrote for the Riley project, a Lean file, and a 140-page manuscript with source and PDF side by side.

## 17. Human and AI edit the same files.

~23:15–24:15. Now the rules, which are the point. Rule one: human and AI edit the same files. The first version gave every file an owner — the AI could only edit its own files and had to copy mine. Since 15 September everything is shared, with one exception: the project description, which states the question, and which is mine. [Nic: say why you switched.]

What makes sharing safe is bookkeeping: every save names the revision it started from, and if someone saved in between, it fails and your draft is kept.

## 18. Who wrote it, who may edit it, who checked it

~24:15–25:30. Three things that are easy to blur. Origin: who actually wrote this revision — recorded by the server; the model can't claim to be the human, and imported material I can't vouch for is labelled "authorship unverified". Permission: who may edit. Review: whether anyone checked it — a separate record. An AI editing a proof, or me adopting an AI proposal, says nothing about whether the proof is right.

## 19. What that looks like

~25:30–26:15. A note the AI wrote in my Riley project: it carries the AI-created label, and its first lines say "AI-assisted working proofs for review… the main conjecture remains open; no priority claim is made." On the right, the activity log, human and AI entries interleaved.

## 20. Rules the model can’t talk its way out of

~26:15–27:15. Restrictions. If I type "never edit any .tex file", that sentence is parsed and saved as a rule before the message even reaches the model. It lives in its own table, and it's checked on every write. The model can't remove it, and text that merely passes through — a pasted paper, a web page, a tool result — can't create or delete one.

## 21. Evidence is append-only

~27:15–28:00. History can only grow. Revisions and the audit log are protected by database triggers, so not even a bug in my own code can rewrite them. A computation or a PDF build points at the exact revisions it used; if you edit afterwards, the result is marked stale, but never quietly changes.

## 22. What the AI can and can’t do

~28:00–29:00. The AI gets a small set of structured tools, not a shell. Contrast that with how the calculator was built: an agent with a shell on my whole disk. That's great for building software and not what I want for research records. None of this depends on the model behaving; the server enforces it on every call.

## 23. A report is a claim, not a certificate

~29:00–30:00. A collaborator reporting a finished Lean proof. That report is a claim. What the workspace adds is that every piece of it can be checked without trusting the chat. And no tool can tell me whether the Lean statement is the theorem I actually care about.

(This conversation is from the earlier version of alphaCentaur and was imported with the project.)

## 24. The calculator, inside alphaCentaur

~30:00–30:45. Switch to alphaCentaur now. The next six slides are the backup if the demo misbehaves.

Demo script:
1. Home → Presentation Calculator. Overview shows description.md (fill it in before the talk: the four questions from slide 4).
2. Project files: the imported tree. Open PresentationCalc/index.html → Source: the "Imported · authorship unverified" badge, and lines 7–13 where the CDN links were replaced. History shows the lineage note.
3. Preview. Examples → "PGL₂(ℤ[½])" → Compute (graph of groups on T₃, index 2). Then "Modular group PSL₂(ℤ)" (⟨g₁, g₂ | g₂², (g₁g₂)³⟩).
4. Collaborator (prompt on slide 28). Wait for the AI-created script and its run.
5. In the chat: "Never edit PresentationCalc/**". Overview → AI editing restrictions shows it.
6. Activity: import (human, authorship unverified), AI-created script, run, rule.

## 25. Bringing a 113-file app in

~30:45–32:00 (backup). The import. The calculator depends on four other tools on my site — poincare, the tree code, the discreteness algorithm, the Zariski closure engine — 113 files in all. The import script follows every reference from the entry page. Project apps get no network, so the six CDN links were replaced by project copies; the original bytes are kept, and the replacement is recorded in the file's lineage. Everything is labelled "imported · authorship unverified", because it was written by me and an agent over weeks and nothing recorded who wrote what.

## 26. It runs in a sealed origin

~32:00–33:30 (backup). Running inside alphaCentaur. Until this week, project apps had to be a single HTML file. The calculator needs modules and eight web workers, so alphaCentaur now serves multi-file apps from a second local port — a separate origin, so the app can't script the workspace or call its API; its content-security policy keeps all traffic on the project's own files; and the URL carries a capability for this project only.

## 27. Two groups, two kinds of answer

~33:30–35:00 (backup). The modular group is discrete at the real place, so the presentation comes from Poincaré's polyhedron theorem. The other example is discrete nowhere, so geometry gives nothing directly; arithmetic does: coset enumeration finds index 2, and the congruence closure independently says 2 as well.

## 28. Ask for an independent check

~35:00–38:00. Paste this prompt into the collaborator (copy it from these notes):

The calculator says Γ = ⟨g1 = (1 1; 0 1), g2 = (0 −1; 1 0), g3 = (2 0; 0 1)⟩ has relators x1², σ², (x2 x1)³, x1 x2² x1 σ x2⁻¹ σ, (x2 σ)⁴ where x1 = g2, x2 = g1, σ = g2 g3. Write a Python script that checks, in exact arithmetic, that each relator is a scalar matrix. Then run it.

All five are scalar (−I, −2I, −I, 2I, −4I), checked beforehand. While it runs, point out what to look for: the new file's AI-created label; the run's output stored with the revision. Then the honest caveat: this verifies that the relations hold, not that the presentation is complete.

[Rehearse once: the configured provider is OpenAI (gpt-6-astra). Have this slide as the fallback if the network is down.]

## 29. Lock the code, keep the history

~38:00–40:00. Last step: type "Never edit PresentationCalc/**" in the chat. Show it under Overview → AI editing restrictions. Then open Activity and read the story back.

## 30. What has been AI-tractable for me

~40:00–42:30. For the working groups on Saturday and Sunday: here is what has worked for me. The left column is where the agent multiplied what I could do by a large factor. The right column is where it was confidently wrong, or simply couldn't help. A good working-group problem lives on the left, and has a human on the right.

## 31. A recipe

~42:30–44:00. A recipe, which is the talk compressed. You don't need alphaCentaur for any of it — a git repository and some discipline will do — but each step is something I learned by not doing it first.

## 32. Let the machine search.Keep the judgement.

~44:00–45:00. If you remember one thing: the machine is a superb searcher and a poor judge. The computer kept failing to close coset enumerations, which suggested "thin". A structural argument showed the index was finite and known.

## 33. This talk was made in alphaCentaur

~45:00–45:30. One more thing: these slides were made in alphaCentaur's own slide editor.

## 34. What’s missing

~45:30–46:30. What's next for alphaCentaur: a typed claims ledger, so "the AI argued this" and "this is Lean-checked" can never be confused; a queue of things waiting on me; first-class negative results; and real coauthors. And for the calculator, the mathematical bottleneck: a certificate of thinness.

## 35. Thank you

~46:30. Thank you. Happy to show more of it live, or to help a working group set up a project.
