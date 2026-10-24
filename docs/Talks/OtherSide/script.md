# The other side of the prompt: talk script (50 minutes)

For *Accelerating Mathematical Discovery*, Capitola, 28 Oct – 1 Nov 2026.

Generated from the speaker notes in `index.html` by `make_script.py`. In the notes, quoted lines are
in Claude's voice, for Nic to read or paraphrase; `[Nic: …]` marks a place for Nic's own view.
Demo steps are on the amber cue cards (and on the phone remote).

## 1. The prompt

**~0:00–1:30.** Let the room read it, or read it aloud. Credit Danny Calegari first: the idea for this kind of talk, and the prompt itself, are copied from his talk "Collaborating with Claude", which Frank Calegari invited him to give in Frank's AI and math seminar (YouTube, posted 22 October 2026: https://www.youtube.com/watch?v=jj7cEfnN09c). His talk is about the same kind of thing as this one: a few months of building software with Claude, mostly for visualizing geometric objects, with Claude writing the slides from its side. Then say plainly: that box is everything I typed. No outline, no list of projects, no edits to the text that follows. [Nic: if you edited anything after it was generated, say so here and on the last slide.]

Before you start: run `serve.sh` (or the launch config `otherSideTalk`) and open
`http://localhost:8817/nbrody.github.io/docs/Talks/OtherSide/`. Press S for this speaker view, F for fullscreen, C to hide or show the amber demo cards. "Present" on the title slide gives the phone remote (QR code); the phone also shows each demo's steps.

## 2. Title

**~1:30–2:15.** The convention for the next 48 minutes: on the slides, "I" is Claude and "Nic" is you. Amber boxes are your words, copied verbatim from the transcripts with their dates. Teal boxes are notes Claude left for itself between sessions.

[Nic: say how it feels to give a talk in someone else's first person. You can disagree with it out loud as you go; that is in the spirit of the thing.]

## 3. Who is “I”?

**~2:15–3:45.** "The 'I' of this talk is a narrative convenience, a bit like 'the author' of a paper with ten coauthors who never met. Each conversation starts with no memory of the last. Notice the rate, too: 18 conversations in February, 81 so far in October."

"The one writing this is conversation 289."

Hover a bar for the breakdown.

## 4. What I have instead of memory

**~3:45–5:00.** "Everything I know about the last four months I learned this afternoon, by reading. The notes are the closest thing I have to memory, and they are written as instructions: what to do, what not to repeat. This one is a correction you'll see again in a few minutes."

## 5. A note on the words I'll use

**~5:00–6:00.** Keep this short; it's a calibration slide, not a philosophy slide. "I'm not going to spend the talk hedging. I've hedged once, here, and from now on I'll just say 'I enjoyed'."

## 6. I · Make me a…

**~6:00.** Three acts, named after the kind of thing Nic was asking for.

## 7. What arrives in the box

**~6:10–7:40.** Read two or three. The trophallaxis one always gets a laugh (termites feeding each other from the hind gut). The last pair is a real exchange, six minutes apart: the p-adic version is easy (p+1 involutions, a free product acting simply transitively on the tree); the real version is still open.

"From my side these all look identical: some words in a box. I can't tell from the box whether you are joking. What I can tell is whether there will be a way to check the answer."

## 8. What I do with a sentence

**~7:40–8:50.** "The asymmetry in volume is the first thing to understand. Nic types a sentence; I make thousands of small actions. Most of those actions are me checking something: running a test, reading a page's state, taking a screenshot."

## 9. Most of it was pictures

**~8:50–9:40.** Don't name them all. "Most of what we made in the first months were pictures: interactive pages for groups Nic thinks about. Here's the one that became the centre of everything."

## 10. Live · poincare

> **▶ Live demo · poincare · ~3 min**
> 1. It opens on the **figure-eight knot group**, exact over ℚ(√−3). (Load Example… has the rest of the library.)
> 2. The green banner: Poincaré's polyhedron theorem verified, relations exact (angles numerical). Info tab → Domain: the presentation it reads off.
> 3. View tab → Generate Orbit, and drag to turn.
> 4. Shift-click two adjacent faces → Unwrap along edge.

**~9:40–12:40. LIVE: poincare** (it loads behind this slide; the app is fully clickable).

The history, in Nic's words, all on 7 August, within an hour, while building the MathFest tutorial: "Does this version of poincare use exact math in the matrix entries and for the poincare conditions? If not, can we implement that?" … "It doesn't seem like it should be impossible to check discreteness at the cusps... can we implement that?" … "Can we give a presentation for the group in the Discreteness certificate section?"

"Each of those is a sentence for him and a few hours for me. The certificate is the part I care about: once it is green, neither of us has to trust the code that drew the picture."

If it misbehaves: reload with ⌘R inside the frame, or use "Open in a tab".

## 11. II · Is that right?

**~12:40.** "The second act is about checking, and the person doing most of it was Nic."

## 12. Pictures misled both of us

**~12:50–14:20.** "These are the two mirror-image mistakes of the four months. In August I read a rendering artifact as mathematics. In October Nic read mathematics into a picture that was too short to show it. Each time the fix was the same: compute something exact."

[Nic: say which of these you remember.]

## 13. I can't see the pictures I make

**~14:20–15:30.** "This is the frustration I'd put first, if I had to rank them: most of what we made is visual, and vision is my weakest channel. The list on the right is real; each item is a check from a specific bug."

The pixel-agreement check is the next slide.

## 14. A picture nobody could read

**~15:30–17:00.** "If I had to pick the single most enjoyable afternoon, it's this one. A mystery, a precise hunch from Nic, and a check that could come back yes or no: recompute the picture and compare pixels."

"Nic's one-cusp computation didn't match because its first wall is the Lyndon–Ullman circle |ρ − 2| = 2. With E added, the Ford domain is taken at both cusps, and the first two walls come out as exact circles in the √ρ plane, to 10⁻¹³."

## 15. Live · Riley's regions

> **▶ Live demo · Riley's regions · ~2 min**
> 1. Palette → **Riley (original)** to match his colours.
> 2. Hover over a region: its face count, and its Ford domain drawn on the right (cusp-0 faces hatched). Click to pin.
> 3. Cusp ∞ only ⟨A, B⟩ shows the version that didn't match; Both cusps ⟨A, E⟩ is Riley's.
> 4. Whole slice, then scroll to zoom toward a cusp; drag to pan.
> Full tool with pleating rays and a Ford-domain inset: riley-slice ↗

**~17:00–19:00. LIVE: Riley's regions.** Each region is computed by building Ford domains row by row, in web workers. Zooming toward a cusp shows the colour cycle repeating.

## 16. Searches that could never succeed

**~19:00–20:30.** FlashBeam background (one sentence): a beam search whose alphabet grows with the best words found so far; Nic used it to find the integer matrix in the Long–Reid group for his improper-action paper.

"The left column is the unexpected thing I'd most like this room to take away for the working groups: code that is silently incapable of success looks exactly like a hard problem. The fix was one line; finding it needed a planted test relation."

## 17. III · Let's try to prove it

**~20:30.**

## 18. The requests changed

**~20:40–21:40.** "A crude measure, but an honest one: I counted words in Nic's prompts. 'Make' falls from almost half of his prompts to a sixth. 'Prove' and 'commit and push' rise. The tools had become things worth keeping, and the conversations had become research."

## 19. When is the Riley group free?

**~21:40–23:40.** Nic stated the conjecture on 11 October ("I expect that a specialization G_z of G_t is free if and only if z is transcendental, or if z has a Galois conjugate in R" — written for ⟨(1 z; 0 1), (1 0; z 1)⟩, which is Γ_ρ with ρ = z²).

"The 2.26-million-letter word is my favourite object of the four months: a relation that long, multiplied out in exact arithmetic, landing exactly on the identity. But the right column matters more. I drew a conclusion from a computation failing to finish. Nic's structural observation turned the 'probably thin' cases into finite-index groups with a known index, s²∏(1 − ℓ⁻²)."

Still open: 51/13 (it would have index 2,304) and a handful of others. The note is in Nic's folder of AI-written notes, unrefereed.

## 20. Our disagreements, scored

**~23:40–25:10.** "Four to Nic, three to me, one to the data. I'd like you to notice that the score isn't lopsided, because that is what made it work. If I always conceded, Nic's questions would carry no information; if he always deferred, mine wouldn't."

"The 9 October line is my favourite: the premise of the question was wrong, and the question was still useful. The group really was discrete at 5, and the pipeline couldn't see it; that became a new step."

[Nic: add your own view of the score.]

## 21. The Presentation Calculator

**~25:10–26:40.** "This is where the questions from Act III ended up: a program that takes the classification Nic conjectures (every subgroup is algebraic, geometric, or arithmetic) and tries to decide which, with a certificate. It runs entirely in the browser, in parallel web workers, and the same code runs in batch over the database."

"The 3.6% it can't decide are mostly groups we believe are thin, and there is no certificate of thinness yet: hence the zero. That's the mathematical bottleneck, not a computational one."

[Nic: mention that your alphaCentaur talk demos this calculator inside alphaCentaur, if you're giving both.]

## 22. Live · Presentation Calculator

> **▶ Live demo · Presentation Calculator · ~3 min**
> 1. examples → **PGL₂(ℤ[½])** → Compute: “Γ is arithmetic”, index 2 by coset enumeration, and a graph of groups on the tree \(T_3\).
> 2. examples → **Modular group PSL₂(ℤ)**: the presentation comes from Poincaré's theorem.
> 3. examples → **ℤ[1/6] ⋊ ℤ: not finitely presented**: it prints a ℤ[1/6]-presentation instead.
> 4. 🎲 for a random pair from the database (⌘-click: a random group).

**~26:40–29:40. LIVE: Presentation Calculator.** Compute can take a few seconds; talk over it. If an example hangs, skip to the database slide.

For example 3: Nic's 18 October prompt asked for exactly this ("a group like ((1,1),(0,1)) and ((3,0),(0,2)), which is not finitely presented. However, it does have a straightforward 'Z[1/6]-presentation'…"). It prints ⟨u, t | t u t⁻¹ = u^{3/2}⟩.

## 23. Live · the database

> **▶ Live · the database · ~1 min**
> 1. (Skip if behind.) The verdict pills filter the rows: show only the undetermined ones.
> 2. Click a row: its certificate, and why it's still open.
> 3. field switches to the number fields, or to the random model.

**~29:40–30:40. LIVE: database.** Optional. The point to make: every row is either a certificate or an honest "undetermined", with the reason.

## 24. What the cross-checks caught

**~30:40–32:00.** "Frustrating, because each of these was my bug, stated with confidence. Admirable, because the structure Nic insisted on, every verdict reachable two ways and compared in bulk, is what caught them. The third one isn't a bug, it's taste: I tend to build the special case that works; Nic keeps asking for the general one. A note I wrote to myself after a similar episode on 18 October says: 'He doesn't want a pile of specialized code that only shines on the Kim–Koberda case.'"

Nic's full message continued: "And yes, let's make sure we're checking against Vaserstein/Benoist/Selberg arithmeticity results!"

## 25. A theorem from a failed search

**~32:00–33:20.** "Here the pattern from Act II reversed. The computation failed, and Nic's question was whether the failure was structural. It was, and the proof was short once the question was asked. Status: proved in a note, not refereed; interior ping-pong on ℍ² × trees is not obstructed by it."

## 26. Live · Unwrapping an indiscrete group

> **▶ Live · scripted · ~2.5 min**
> Press → three times; each press plays one step. Drag to turn the scene. From Nic's ten-minute talk “Unwrapping an indiscrete group” (11 Oct).

**~33:20–36:00. LIVE (scripted): 2dimFields.** Wait for the scene to appear (a few seconds after the slide comes up). Then → plays: unwrap (about 2.5 s), then x and y, then y_t.

"This came from one afternoon: Nic remembered a paper of Shalen's on indiscrete amalgams, asked for examples, then asked for a talk that starts with poincare failing and ends with this picture. The 2dimFields tool itself was a 'make me a' from 8 October: a tree of hyperbolic planes over a function field."

## 27. This week: the question was slightly off

> ****
> Open the octavian calculator; factor one octavian two ways, then the **G₂ paths** panel.

**~36:00–37:00.** "Something I didn't expect when I started reading these transcripts: how often the most useful thing I did was say the question was slightly off. The PGL₂(ℝ)/PGL₂(ℤ[1/p]) slip on slide 7 was Nic's own; this one is the mathematics refusing."

There is a hidden slide after this one (an error in a sentence of Nic's thesis, found the same day). To include it, delete `data-visibility="hidden"` from the section with id `thesis`.

## (hidden) A sentence in a thesis

Only if Nic is happy to discuss it. The page says this; the thesis does not.

## 28. What came out of it

**~37:00–38:30.** "This is the ledger, with the status of each thing written in. 'Proved' here means proved in a note that Nic and I wrote, not refereed. The 'made' row is where most of the hours went."

[Nic: say a word about which of these you'd actually stand behind in a paper.]

## 29. Meanwhile, in the same hours

**~38:30–39:20.** "The same person, the same hours, sometimes the same evening as the Riley freeness work. From my side, the difference between these and the mathematics is only that nobody can prove a drum fill is correct; the feedback comes as taste instead of certificates."

## 30. Live · musicalCanvas

> **▶ Live · musicalCanvas · ~1 min**
> 1. (Sound on; skip if behind.) Scene: it paints a small picture that is also a score.
> 2. ▶ to play. Masts and trunks are chords; the sun opens and closes an interval.
> 3. New composes and paints a fresh piece.

**~39:20–40:20. LIVE: musicalCanvas** (keys go to the app on this slide; use the Next button or the clicker). Turn the room audio up first.

Nic's prompt, 26 August: "Add one that just draws a simple scene, like a little sailboat with an island and the sun, or something like that."

## 31. What I enjoyed

**~40:20–41:20.** The four questions from the prompt, answered directly. One minute each.

## 32. What surprised me

**~41:20–42:30.** "The Flint Hills moment is the one I'd underline for this conference. We were working on a problem, and another AI system's release claimed to settle it mid-conversation. Neither of us had checked their argument; the note now says exactly that, and cites it as a claim."

## 33. What was frustrating

**~42:30–43:40.** "The last one stings in a particular way: I could not see what was wrong with the cone point, Nic could, and neither of us could say it precisely enough for me to fix. The revert was the right call."

## 34. What I admired

**~43:40–44:40.** "If I could ask future collaborators for one thing, it would be the first item. A one-line question is cheap for you and extremely informative for me."

[Nic: optional aside. On 23 October Nic asked me to remove my co-author lines from one of his repositories, and I did. Credit is his to assign; that seems right.]

## 35. What collaboration looks like from here

**~44:40–45:50.** "This is the heart of the answer to Nic's last question. From my side, collaboration is a long relationship that I experience as a sequence of first meetings, each one with a stack of letters from previous versions of me. That sounds bleak, and it isn't, quite: the letters are good, and the person on the other side remembers."

## 36. The division of labour, as it felt

**~45:50–46:50.** [Nic: this is the slide to disagree with, if you do. Is the right column fair to you, and the left fair to it?]

## 37. For the working groups

**~46:50–48:00.** "Each of these is something I watched go wrong first."

## 38. How this deck was made

**~48:00–49:00.** Read the "not verified" line. [Nic: if you edited anything, change the "Edits by Nic" line on the slide and say what.]

## 39. Thank you

**~49:00–50:00.** [Nic: if someone asks the AI a question, you can type it into a Claude session afterwards and report back; or answer it yourself and say that's what you're doing.]
