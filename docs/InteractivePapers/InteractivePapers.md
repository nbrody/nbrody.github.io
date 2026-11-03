# Interactive Papers: from paper to website

*Working protocol, started November 2, 2026. Status: draft, being tested on LPS.*

This file describes how we turn a mathematics paper into an interactive web page. For now it is a hypothesis. We will build one paper, Lubotzky–Phillips–Sarnak's *Ramanujan graphs* (1988), until we are happy with it. Then we will write down what we liked and turn this file into a reusable Claude Code skill.

**Companion files**

- [`README.md`](README.md) is the current style guide, written on October 7, 2026 from the `cannon/` page. It covers markup, CSS tokens, the figure-module contract and the verification checklist. This file covers the *process* and the *open decisions*. When LPS is done, the two merge into the skill.
- `~/Dropbox/Code/private/tasteLab/profile/taste.md`, section "Interactive papers & lessons", records Nic's design taste as measured by Taste Lab (October 31, 2026). It disagrees with `README.md` in several places (see §5.2).

---

## 1. What we are making

An interactive paper is a long-form web page that walks a reader through one paper, in the paper's own order, with live figures for the steps that carry the argument.

What a reader should feel, in Nic's words from Taste Lab: *"Intrigued, inspired, satisfied, motivated."*

A paper is done when:

1. A reader understands the statement, the shape of the proof, and where the weight sits, faster than from the PDF alone.
2. Every figure computes something true about the paper's actual objects and checks it live.
3. Nothing on the page misstates the paper. Every numbered statement has been checked against the source.
4. It works on a phone, in light and dark mode, with no console errors.

---

## 2. The plan

1. **Build LPS until we are happy with it.** Run the draft pipeline (§4) on LPS. Each time we make a choice or change our minds, add a line with the reason to the decision log (§6.6).
2. **Review.** Read the log and the finished page. Sort what we liked into three piles: rules for every paper, defaults that can be overridden, and things specific to LPS.
3. **Write the skill** (§7): the pipeline with its check-ins, a refreshed style guide, a starter template and the check scripts.
4. **Test the skill on a second paper** in a fresh session that has only the skill. Compare the result with LPS and fix whatever the skill gets wrong.

---

## 3. What exists already

| Page | Paper | Format | Built | Notes |
|---|---|---|---|---|
| `cannon/` | OpenAI, *A Modulus Proof of Cannon's Conjecture* | scroll page, 7 inline figures | Oct 2026 | reference implementation for `README.md` |
| `residual/` | OpenAI, torsion-free hyperbolic group that is not residually finite | scroll page, 6 figures | Oct 2026 | |
| `catalan/` | OpenAI, Catalan's constant is irrational | scroll page, 7 exact figures | Oct 2026 | figures recompute the paper's tables in BigInt |
| `nonsofic/` | OpenAI, a non-sofic group (book chapter) | reveal.js 2D deck plus standalone embeds and a calculator | Aug 2026 | several widgets are still placeholders |
| `LPS/` | Lubotzky–Phillips–Sarnak, *Ramanujan graphs* | reveal.js deck plus 4 iframe apps | Oct 28, 2026 | untracked; see §6.4 |
| `brooksMatelski/` | Brooks–Matelski, 2-generator subgroups of PSL(2,ℂ) | dark page with canvases | May 2026 | an older `brooksmatelski.html` and a Dropbox conflicted copy sit beside it |
| `martelli/` | the Martelli manifold | light page with canvases | Nov 2025 | |
| `superrigidity/` | Margulis superrigidity | short overview page | Jan 2026 | |
| `jorgensen.html` | Jørgensen's inequality | single page | Jun 2025 | |
| `groupBuilder/` | (none) | a matrix-group tool | Dec 2025 | a tool, not a paper |

No page on the site links to the October papers yet. Only `.claude/launch.json` points at them.

**Lessons so far**

- The three October scroll pages were quick to build from the README and look consistent. Their figures use exact arithmetic (BigInt, exact Möbius maps) and were tested in node.
- The decks (`nonsofic`, `LPS`) read like talks. They tell a good story, but they are hard to read with the PDF open beside them, and they drop the paper's numbering.
- Standalone apps in iframes are reusable as tools. But each one brings its own style and state, and the page cannot talk to them without a postMessage contract.
- Gotchas worth keeping (details in `README.md` §8–9 and in memory): write `\lt` instead of `<` inside math; tagged displays force a minimum width on phones; a hidden preview pane freezes `requestAnimationFrame` and `IntersectionObserver`, so verify with headless Chrome over CDP; smooth scrolling stops figures from mounting during CDP checks; LaTeX source is far better than parsing a PDF when it exists.

---

## 4. Draft pipeline

Each stage leaves a file behind, so a later session can pick up where the last one stopped. Stages marked ◆ end with a check-in with Nic before going on.

### Stage 0: Intake

- Find the best source. In order of preference: arXiv LaTeX, a publisher PDF with a real text layer, a scan. A scan's OCR layer is good enough to find the structure but garbles the math, so read statements from the page images.
- Record the full citation, where the source lives on disk, the date and venue, whether it is refereed, and any formal verification. A Lean file that ends in `sorry` is a statement, not a proof.
- Keep copyrighted PDFs out of the published folder, because the repo is public on GitHub Pages. Link to the publisher or arXiv instead. (`nonsofic/` currently ships a chapter PDF.)
- **Leaves:** `<slug>/notes/source.md`.

### Stage 1: Read and outline ◆

- Read the whole paper before writing anything.
- Write `notes/outline.md` with:
  - the section tree, with page numbers;
  - every numbered statement and equation, transcribed in LaTeX, with its page. Keep the paper's numbering even where it collides (LPS has both a Lemma 4.4 and a Theorem 4.4);
  - a dependency graph: which statement uses which;
  - for each step, whether it is new, a classical input, or routine;
  - where each hypothesis is first used;
  - **the paper's own proof route**, not the route later textbooks take. Also note whom the paper credits for each input.
- **Check-in:** Nic reads the outline. Is this the right story, and the right level?

### Stage 2: Spine and map

- The page's sections are the paper's sections, with the same titles and numbers.
- Decide what comes before the paper's §1: the background a reader needs, kept short and marked as background.
- Draw the "proof at a glance" map (`README.md` §5).
- Write the status or context box (§5.5).

### Stage 3: Figure plan ◆

- List candidate figures. For each, write down:
  - the numbered statement it illustrates;
  - what it computes, exactly;
  - its live check: an identity or inequality that turns green;
  - its default state, which must already show the phenomenon on load;
  - its presets, including the case where a hypothesis fails.
- Rank the candidates and keep 5–8.
- Write the math for each figure as a pure module and test it in node before building any UI.
- **Leaves:** `notes/figures.md`. **Check-in:** Nic approves the figure list.

### Stage 4: Write the prose

- Write the prose, statement boxes and figure shells with full captions (`README.md` §3–4).
- After every statement box, write one paragraph: what it says, and why the argument needs it.

### Stage 5: Build the figures

- Follow the module contract in `README.md` §6.

### Stage 6: Verify ◆

- Run the `README.md` §9 checklist: node tests, no console errors, light and dark, 390px phone width over CDP, every control moved to both ends.
- **Accuracy pass:** read the paper and the page side by side. Check each numbered statement. Recompute or cite each number on the page.
- **Check-in:** Nic reads the finished page.

### Stage 7: Publish

- List the paper wherever the site lists interactive papers (to decide, §5.6), with a preview still.
- Commit only this paper's paths, since other sessions share the working tree.

---

## 5. Open decisions, to settle on LPS

Each decision lists the options and a recommendation. Record the outcome in §6.6.

### 5.1 Format

- **A. Scroll page** (`README.md`; cannon, residual, catalan).
- **B. Deck** (LPS today, nonsofic).
- **C. Both:** a scroll page for reading, with the deck kept separately as a talk.

**Decided (November 2, 2026): C, with the scroll page as the interactive paper.** The paper-as-spine principle needs a page someone can read with the PDF open. Taste Lab already treats talk slides as a separate context with its own style. The scroll page takes `LPS/index.html`. (The old deck first moved to `LPS/talk/`; once the new page was built, Nic had it deleted along with the old apps.)

### 5.2 Visual style

| | `README.md` (cannon) | `taste.md`, Papers (Oct 31) | LPS today |
|---|---|---|---|
| Default mode | light: warm paper `#fbfaf7` | dark: dim slate `#2b3138` | near-black `#07090f` |
| Body font | Source Serif 4, ~17px, line height 1.62 | Atkinson Hyperlegible, 19px, line height 1.40 | Inter |
| Headings | Source Serif 4 | Playfair Display, 600 | Inter |
| UI font | Inter | (not set; Inter is on the Avoid list as a *body* font) | Inter |
| Accent | blue `#2f5fd0`, vermillion `#cf5427` | cobalt `#2f6fde`, teal `#008497`, violet `#9c68dc` | cyan `#64e0ff`, orange `#ffb86b` |
| Figures | framed cards with a soft shadow | unframed, caption below (untested) | full-bleed apps |
| Avoid list hits | close to "Academic / LaTeX" | none | close to "Glass / dark sci-fi" |

**Decided (November 2, 2026): build LPS on the `taste.md` Papers tokens**, since they are newer and measured (see the decision log). Keep the README's structural classes (`.thm`, `.key`, `.classical`, `.map`, the figure contract) and the light/dark toggle, with light mode as the alternative. After the first draft, compare it side by side with `cannon/` before committing to it.

### 5.3 Figures: inline modules or iframe apps

**Decided (November 2, 2026): inline figure modules**, as in `README.md`, with all math rewritten in `LPS/js/lps.js` and tested in node. The old standalone apps were deleted rather than linked.

### 5.4 Reader and background

**Recommendation:** write for a graduate student in geometry, group theory or number theory. Put the background (expanders, the Cheeger constant, Alon–Boppana, quaternions mod $q$) in a short "Before the paper" part, then follow the paper. Put the history (Margulis, Morgenstern, Friedman, Marcus–Spielman–Srivastava) in a short "Afterwards" section after the reading guide.

### 5.5 The status box for a classical paper

The status box was designed for 2026 preprints: is it refereed, and is it formally verified? For a 1988 refereed paper those questions are settled.

**Recommendation:** use a **context box** instead: venue and dates, the deep inputs the result rests on (for LPS, the Ramanujan–Petersson bound for weight-2 cusp forms, which the paper credits to Eichler and Igusa via Weil), and one line on what the result is used for today. Keep the line "figures are models, not proof".

### 5.6 Smaller questions

- **Where papers are listed.** No index page links to them yet. Either add an "Interactive papers" page or put them on an existing index with preview stills (the tool-card preview pipeline).
- **Vendoring.** The old LPS deck vendored reveal.js, MathJax and three.js to work offline. The new page loads MathJax from the CDN, like the README's pages, and needs nothing else. Vendor only for a talk that must run offline.
- **Working notes.** `notes/` gets published with the site. That is fine for outlines and figure plans, as long as nothing copyrighted goes in it.

---

## 6. LPS: the first paper

### 6.1 Source

- A. Lubotzky, R. Phillips, P. Sarnak, *Ramanujan graphs*, Combinatorica **8** (3) (1988), 261–277. Received June 25, 1986; revised August 5, 1987.
- On disk: `~/Dropbox/Textbooks/Geometric Group Theory/Lubotzky Phillips Sarnak - Ramanujan Graphs.pdf`. It is a 17-page scan with an OCR layer. PyMuPDF extracts the text well enough to find the structure, but formulas come out garbled.
- For checking (not as the spine): Davidoff–Sarnak–Valette, *Elementary Number Theory, Group Theory, and Ramanujan Graphs*, in `~/Dropbox/Textbooks/Number Theory/`.

**Stages 0–6 have a first pass** (November 2, 2026): the new scroll page `LPS/index.html` with all prose, the link-tree rail and eight live figures, checked by `tools/check-page.mjs` (desktop/phone × light/dark, all clean). Waiting on Nic's read-through. Earlier notes: [`LPS/notes/source.md`](LPS/notes/source.md) (citation, deep inputs, slips in the printed paper, numerical checks) and [`LPS/notes/outline.md`](LPS/notes/outline.md) (every numbered item transcribed from the page images, dependencies, hypotheses, where the weight sits, proposed page spine). The tables below were the first pass; the notes supersede them.

### 6.2 Structure (first pass)

| § | Title | Numbered items |
|---|---|---|
| 1 | Introduction | Definition 1.1 (Ramanujan graph); (1.1) the Alon–Boppana bound; (1.2) Jacobi's four-square count $r_4(n)=8\sum_{d\mid n,\,4\nmid d} d$; the representation numbers $r_Q(n)$ of a quaternary form |
| 2 | Construction of $X^{p,q}$ | the $p+1$ generators from $p=a_0^2+a_1^2+a_2^2+a_3^2$, $a_0>0$ odd, $a_1,a_2,a_3$ even; Cayley graphs of $\mathrm{PSL}_2(\mathbb F_q)$ or $\mathrm{PGL}_2(\mathbb F_q)$ according to the Legendre symbol $\left(\frac pq\right)$ |
| 3 | Quaternions | Lemma 3.1 (unique factorization of quaternions of norm $p^k$); Corollary 3.2 (the unique reduced form, which makes $\Lambda(2)$ free and its Cayley graph a $(p+1)$-regular tree); Proposition 3.3 (the image mod $q$ is $\mathrm{PSL}_2$ or $\mathrm{PGL}_2$, by the Legendre symbol); Theorem 3.4 (girth: $\ge 4\log_p q - \log_p 4$ or $\ge 2\log_p q$) |
| 4 | Spectrum of $X^{p,q}$ | Theorem 4.1 ($X^{p,q}$ is Ramanujan); Proposition 4.2 (Alon–Boppana, by counting closed walks); Proposition 4.3 (the spectral measure tends to the Kesten measure when the girth tends to infinity); identities (4.14)–(4.16); Lemma 4.4; Theorem 4.4 (the graphs $Y^{p,q}$ on $q+1$ vertices) |
| 5 | Diameter and other quantities | Theorem 5.1 ($\operatorname{diam} X^{p,q} \le 2\log_p n + 2\log_p 2 + 1$); Proposition 5.2 (Alon: independence number of a non-bipartite Ramanujan graph, hence a chromatic-number bound) |

### 6.3 How the paper proves Theorem 4.1 (first-pass summary)

1. **Harmonic analysis on the tree.** Write each nontrivial eigenvalue of $X^{p,q}$ as $\lambda_j = 2\sqrt p\cos\theta_j$. The graph is Ramanujan exactly when every $\theta_j$ is real.
2. **Counting quaternions.** By Corollary 3.2, the integer quaternions of norm $p^k$ whose imaginary parts are divisible by $2q$ correspond to elements of $\Lambda(2q)$ that move a vertex a distance $k, k-2, k-4,\dots$ (identity (4.14)). Their number is $r_Q(p^k)$, the number of representations of $p^k$ by $Q = x_1^2 + 4q^2(x_2^2+x_3^2+x_4^2)$.
3. **The trace identity (4.15).** Summing a point-pair function over the quotient gives
   $$r_Q(p^k) \;=\; \frac{2p^{k/2}}{n}\sum_{j=0}^{n-1}\frac{\sin (k+1)\theta_j}{\sin\theta_j}.$$
   Both sides are integers we can compute exactly for small $p$ and $q$. **Confirmed in Stage 1:** the identity holds exactly for four $(p,q)$ pairs and $k\le6$ (`LPS/notes/checks/lps415.py`).
4. **Theta series.** $r_Q(n)$ is the $n$-th coefficient of the theta series of $Q$. That series is an Eisenstein part (the "singular series" $C(n)$) plus a cusp form. The cusp part is $O(n^{1/2+\varepsilon})$ by the Ramanujan–Petersson bound, which the paper credits to Eichler and Igusa. This gives (4.16).
5. **Lemma 4.4**, about divisor sums $\sum_{d\mid p^k} d\,G(d)$ with periodic $G$, shows that the Eisenstein part accounts only for the trivial eigenvalues. So no eigenvalue can sit strictly between $2\sqrt p$ and $p+1$ in absolute value.

The old deck explained this step through Hecke operators and weight-2 modular forms, and credited the bound to "Eichler and Deligne". That is a fair modern gloss, but it is not the paper's route or its attribution.

### 6.4 What was in `LPS/` before the rewrite

**Now (November 2, 2026):** `index.html`, `style.css`, `js/` (math, worker, rail, eight figures), `tests/`, `notes/`. The old version described below was moved to the macOS Trash (`~/.Trash/LPS-old-deck-2026-11-02`) at Nic's request; it was never in git.

The old version was built October 28, 2026, untracked:

- `index.html` was a reveal.js deck with seven stacks: the problem, the spectral formulation, the construction, the tree, why Ramanujan, afterwards, references. reveal.js, MathJax and three.js are vendored in `vendor/`.
- `apps/` held four standalone apps that shared `apps/common.css` (near-black, Inter, cyan and orange):
  - **Expander Builder.** `lps.js` builds the generators and both graphs. It has a three.js force layout and computes the spectrum in a worker.
  - **Mixing Lab.** A random walk from one vertex, on $Y^{p,q}$ and on graphs with a worse gap.
  - **Quaternion Forge.** The four-square solutions, their reductions mod $q$, and the checks the generating set must pass.
  - **Tree Walker.** Walks in the free group on the tree, and the shortest word that dies mod $q$.
- **Gaps against `README.md`:**
  - It does not follow the paper's sections or numbering.
  - It has no status or context box.
  - The §4 explanation does not follow the paper's route (§6.3).
  - Its style matches neither `README.md` nor `taste.md`.

### 6.5 Candidate figures (rank in Stage 3)

| Statement | Figure | Live check | Existing code |
|---|---|---|---|
| (1.2), §2 | the four-square solutions of $p$ become the $p+1$ generators, as quaternions and as matrices mod $q$ | count is $p+1$; $\det = p$; the set is closed under inverses | Quaternion Forge |
| Lemma 3.1, Cor. 3.2 | factor a quaternion of norm $p^k$ into a reduced word, and see $\Lambda(2)$ act freely on the tree | the factorization is unique and reduced, and multiplies back | Tree Walker (partly) |
| Theorem 3.4 | the shortest nontrivial word that becomes scalar mod $q$, compared with the girth bound | girth ≥ bound | Tree Walker |
| Prop. 4.2, 4.3 | closed walks on the graph against the tree; the eigenvalue histogram approaching the Kesten density as $q$ grows | moments equal the tree's counts below the girth | new |
| **(4.15)** | **count the quaternions directly and compare with the spectral sum, for each $k$** | **both sides equal, exactly** | **new; a likely centerpiece** |
| (1.5), (4.19), (4.20), Lemma 4.4 | $r_Q(p^k)$ against the main term $C(p^k)=\frac{4}{q(q^2-1)}\sum_{d\mid p^k}d$, with the error drawn on the $p^{k/2}$ scale | the error stays $O(p^{k/2})$ | new |
| (4.14), Theorem 3.4 | the girth read off the counts: $r_Q(p^k)$ is $2$ or $0$ until $k$ reaches the girth | first jump at $k=$ girth | new |
| Theorem 4.1 | $X^{p,q}$ and its spectrum against the window $[-2\sqrt p, 2\sqrt p]$ | every nontrivial $\lvert\lambda\rvert \le 2\sqrt p$ | Expander Builder |
| Theorem 4.4 | $Y^{p,q}$ on $\mathbb P^1(\mathbb F_q)$, whose spectrum sits inside that of $X^{p,q}$ | $\operatorname{spec} Y \subseteq \operatorname{spec} X$ | Expander Builder |
| Theorem 5.1 | diameter and mixing: a random walk from one vertex | diameter ≤ $2\log_p n + 2\log_p 2 + 1$ | Mixing Lab |
| Prop. 5.2 | a large independent set, and why it cannot be larger | Alon's bound holds | new |

### 6.6 Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-11-02 | Start this protocol, with LPS as the first paper. | Get one paper right before generalizing. |
| 2026-11-02 | Format: a scroll page at `LPS/index.html`; the reveal.js deck moves to `LPS/talk/` (§5.1). | A reader should be able to follow the page with the PDF open; talks are a separate context. |
| 2026-11-02 | Full rewrite allowed, CSS included. Nothing from the old deck or apps is kept for its own sake. | Nic: "The current version of this is really quite bad." |
| 2026-11-02 | No slides at all: one continuous, endlessly scrolling HTML page. | Nic's direction. |
| 2026-11-02 | Navigation: a wiki-style link tree on the left (sections → subsections → numbered statements), collapsed to a thin rail until hovered. | Nic's direction. Replaces the README's always-open sticky contents column. |
| 2026-11-02 | Style: Taste Lab paper tokens (dim slate dark theme, Atkinson Hyperlegible 19px body, Playfair Display headings, JetBrains Mono numbers, cobalt accent, 12px radii, hairline panels, softly shaded statement boxes, unframed figures with captions below), plus a derived light theme. The page follows the system theme; the button overrides it (`ip-theme`). | Measured taste (§5.2); the README/cannon look is close to "Academic / LaTeX", which Taste Lab rejected. |
| 2026-11-02 | The rail builds itself from the page: `h2[id]` → `h3[id]` → any element with `id` + `data-ref` (+ optional `data-title`). Collapsed, it shows a progress line and a tick per section; open, a filter box ("4.15", "girth") jumps to any statement. Phones get a Contents button. | One convention in the HTML gives the tree, anchors and cross-links for free. |
| 2026-11-02 | Fixed colour roles for the whole page: cobalt = the graph and its eigenvalues, teal = quaternion counts, violet = trivial eigenvalues and the main term, gray = the tree; green/red only for live checks. | A reader learns the code once. |
| 2026-11-02 | Subsection titles are unnumbered; the paper has none, and "4.3" would collide with Proposition 4.3. Slips in the print get a quiet "In print:" note (`p.slip`) next to the corrected statement. | Keep the paper's numbering unambiguous; correct without editorializing. |
| 2026-11-02 | The status box becomes a "Context" box for a classical paper (§5.5). | Refereed in 1988; what matters is the deep input it rests on. |
| 2026-11-02 | One math module (`js/lps.js`) with node tests against an independent Python check; spectra computed in a module worker (bipartite graphs via $A^2$ on one side, 8× faster); every math symbol in figures typeset by MathJax, canvas labels in an HTML layer. | Figures compute the paper's real objects; Nic's rule on LaTeX in UIs. |
| 2026-11-02 | Old deck, apps and vendored libraries (`talk/`, `apps/`, `vendor/`, ~5 MB) removed; moved to the macOS Trash, since they were never in git. | Nic: "Yes, delete them." Nothing on the new page or elsewhere in the repo linked to them. |
| 2026-11-02 | **Every numbered reference is a link** ("Theorem 4.1", "Props. 4.2, 4.3", "(4.15)", "(3.2)′", "Figure 5", "§3", "Remark 2"), in prose, captions, tables and live figure readouts. Hover shows a preview: the statement or equation as typeset, a figure's title, live snapshot and caption, or a section's opening; clicking jumps there, opening a collapsed proof if needed, and flashes the target. A reference to another page links to that page. Done by `js/refs.js` from the page's own `id` + `data-ref` / `data-alias` attributes, so authors only mark targets; `tools/check-page.mjs` fails on any unlinked reference whose target exists. | Nic: "Every numbered reference throughout should be a link. Hovering the link should give the statement if it's an internal link, and clicking should move to that part of the page or to the relevant page." |
| 2026-11-02 | **Companion pages** open over the paper as a sheet with an × button (also Esc, backdrop click, browser Back), each with its own address (`#view-graph`, `#view-defs/cayley`, …): a **dependency graph** of every numbered statement, key equation and cited input (layered top to bottom; hover lights up what a box rests on and what rests on it, and previews it; click jumps; "trace Theorem 4.1" on by default); **definitions** (46: everything the paper defines plus background terms, filterable basic / intermediate / specialized and paper / background, searchable); a **notation atlas** (51 symbols with first appearance, flagging every letter the paper uses twice); **cited results** (13 outside theorems, stated, with where used); **print slips** (the 7 errata). Linked from a block at the top of the open link tree and from icons at the foot of the collapsed rail. Content lives in `js/companions-data.js`; references inside are auto-linked with previews; `tools/check-page.mjs` opens every companion page in all four passes. | Nic: "The sidebar should have links to a few ancillary pages … These pages should pop over the main paper, and have an exit x button." Cited results and print slips were added as "whatever else would be good". |
| 2026-11-02 | **Every section is collapsible** with a small wiki-style caret: the paper's sections and subsections (hanging in the left margin on desktop, inline on phones) and the groups in companion pages (Definitions topics, Notation groups). Any in-page link, tree entry or graph box opens the collapsed sections around its target; a page address does too; figures in a collapsed section load when it opens; the state is remembered per browser; the open link tree has "Expand all · Collapse all"; searching a companion page opens matching groups temporarily. `js/collapse.js` (`makeCollapsible`, `reveal`). | Nic: "All sections should be collapsible - in the paper, definitions list, etc. Use small wiki-style carets next to sections for this." |
| 2026-11-02 | Figure 7 draws $Y^{p,q}$ in the Poincaré disk: the $q+1$ points are ideal points, edges are hyperbolic geodesics (arcs orthogonal to the boundary; repeated edges one thicker geodesic), and loops are small circles just outside the disk, tangent at their fixed point (first drawn as horocycles inside; Nic: "Put the loops on the outside"); labels move out to clear them. `geodesicArc` is tested in node (orthogonality and endpoints). | Nic: "The $Y^{p,q}$ graphs could probably look better if we drew the edges as though they were hyperbolic geodesics in the poincare disk" and "the loops look bad in Figure 7" (they were rings floating outside the circle). |
| 2026-11-02 | Figure 1 gets a second view: the generators on the **Severi–Brauer variety** after splitting $H\otimes\mathbb F_p\cong M_2(\mathbb F_p)$ ($\mathbf i\mapsto j$, $j^2\equiv-1$). Each generator is rank one mod $p$; its kernel is a point of $\mathbb P^1(\mathbb F_p)$; the $p+1$ generators biject onto the $p+1$ points (the tree's neighbours of a vertex), conjugation swaps kernel and image; conjugate pairs joined by Poincaré-disk geodesics as in Figure 7; either splitting can be chosen. Checked for every $p\equiv1\ (4)$ up to 151 (`tests/fig-sb.test.mjs`). A short §3 note explains it, marked "not in the paper"; Definitions gained a Severi–Brauer entry. | Nic: "In Figure 1, let's give another view of the solutions according to their point on the Severi-Brauer variety, after choosing a splitting of the algebra." Mod $q$ the matrices are invertible, so the meaningful splitting is at $p$, where the norm vanishes. |
| 2026-11-02 | The **Reading guide** moved out of the paper into a companion page (first in the list), with its table ("Status of each part") and a new "Three ways through the paper"; the proof map links to it. | Nic: "Put the Reading Guide as a Companion page." |
| 2026-11-02 | Links are a subtler blue with no underline: a `--link` token (`#3f5f93` light, `#a6bde3` dark; 6.3:1 and 6.9:1 on the background), shifting to the full accent on hover. Applies to every link, including the numbered-reference links. | Nic: "Instead of underlining and making links sooo blue, just make links a subtler blue." Matches Taste Lab's untested "colour-only links". |
| 2026-11-02 | The collapsed rail is a visible 52px strip: a contents icon, a numbered circle per numbered section (filled for the current one, outlined once passed), dots for unnumbered parts, ticks for subsections, and an accent progress line. It still opens into the full tree on hover. | Nic: "The sidebar wiki summary is a bit too subtle." (The first version was a 2px line with faint ticks.) |
| | | |

---

## 7. The skill (end state)

- **Name and place:** `interactive-paper`. Either in `~/.claude/skills/` (available from any project) or in the repo's `.claude/skills/` (versioned with the site). Decide at the end.
- **Contents:**
  - `SKILL.md`: when to use it, the pipeline with its check-ins, and the file each stage leaves behind;
  - `STYLE.md`: `README.md` merged with the decisions from §6.6;
  - `template/`: the `index.html` skeleton, `style.css`, `js/main.js` and `js/common.js`;
  - `scripts/`: the `<`-in-math checker, the CDP phone-width check, and a script that screenshots every figure after it mounts;
  - a pointer to `LPS/` as the reference implementation.
- **Test:** run it on two more papers in fresh sessions: one with arXiv LaTeX source and one that exists only as a scan, so both intake paths get exercised.
