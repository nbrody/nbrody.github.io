# Interactive Papers

*How we turn a mathematics paper into an interactive web page. Revised November 3, 2026, after building LPS. The reference implementation is [`LPS/`](LPS/).*

An interactive paper is one long web page that walks a reader through one paper, in the paper's own order and numbering, with live figures for the steps that carry the argument. Every paper shares one design system and one set of page controls, so a reader who has used one knows them all.

**Contents:** [0. Quick start](#0-quick-start) · [1. What we are making](#1-what-we-are-making) · [2. The pipeline](#2-the-pipeline) · [3. The page](#3-the-page) · [4. The global controls](#4-the-global-controls) · [5. Look](#5-look) · [6. Figures](#6-figures) · [7. Writing](#7-writing) · [8. Verification](#8-verification) · [9. Publishing](#9-publishing) · [10. The papers](#10-the-papers) · [11. Decision log](#11-decision-log)

---

## 0. Quick start

| File | What it is |
|---|---|
| [`interactivePaper.css`](interactivePaper.css) | The design system and every global control: tokens, the four page styles, light/dark, type, statement boxes, figures and their controls, the contents rail, reference previews, collapsible sections, supplements, the style menu, the companion pages. Every paper links it first. |
| [`interactivePaper.js`](interactivePaper.js) | `initPaper(config)`: wires all of the above into a page. |
| [`core/`](core/) | The modules behind it: `common.js` (figure helpers), `refs.js`, `collapse.js`, `look.js`, `companions.js`. |
| [`template/`](template/) | A complete small paper to copy: page skeleton, colour roles, `main.js`, `companions-data.js`, one figure and its node test. It loads and passes the page check as is. |
| [`tools/check-page.mjs`](tools/check-page.mjs) | Headless check of a finished page in every mode (§8). |
| [`index.html`](index.html) | The index of all papers: one featured paper, then rows with preview stills that follow light and dark. Add every new paper here (§9). |
| [`tools/make-previews.mjs`](tools/make-previews.mjs) | Photographs each paper's signature figure, light and dark, into `previews/<slug>-{light,dark}.webp` for the index. |
| [`LPS/`](LPS/) | The reference paper: 13 figures, 2 supplements, 6 companion pages. When this file and LPS disagree, LPS wins; update this file. |

To start a paper:

1. Copy `template/` to `<Slug>/`. Use a short folder name that names the paper (`LPS`, `CannonModulus`).
2. Run the pipeline in §2. Each stage leaves a file in `<Slug>/notes/`, so a later session can pick up where one stopped.
3. Serve the repo root (any static server; we use a Python `ThreadingHTTPServer` on port 8847 with `Cache-Control: no-store`) and open `http://localhost:8847/docs/InteractivePapers/<Slug>/`.

[`README.md`](README.md) is the older style guide, written from the October 2026 `cannon/` page. It still describes `cannon/`, `residual/` and `catalan/`. New papers follow this file.

---

## 1. What we are making

What a reader should feel, in Nic's words from Taste Lab: *"Intrigued, inspired, satisfied, motivated."*

A paper is done when:

1. A reader understands the statement, the shape of the proof, and where the weight sits, faster than from the PDF alone.
2. Every figure computes something true about the paper's actual objects and checks it live.
3. Nothing on the page misstates the paper. Every numbered statement has been checked against the source.
4. It works on a phone, in light and dark, in every page style, with no console errors.

**Principles**

1. **The paper is the spine.** The page's sections are the paper's sections, with the same titles, numbers, and statement and equation numbers, even where the numbering collides (LPS has both a Lemma 4.4 and a Theorem 4.4). A reader with the PDF open always knows where they are.
2. **Honest framing first.** A context box says where and when the paper appeared, whether it is refereed, whether anything is formally verified, and what deep inputs it rests on. A Lean file that ends in `sorry` is a statement, not a proof.
3. **The paper's own route.** Explain the proof the paper gives, with the paper's attributions, not the route later textbooks take. Say so when a modern gloss differs.
4. **Explain, don't transcribe.** Restate in your own words. Formulas may be reproduced; prose may not.
5. **Every figure computes something real** and checks it live. Figures are models, not proof; say so once in the context box and once in the footer.
6. **What is not in the paper is marked.** Primers, asides and new pictures go behind an orange Supplement button (§3.8).
7. **Neutral voice.** Present tense, third person ("the paper shows"), no "I". Point to load-bearing steps without inventing criticism. Correct slips quietly (§3.6).

---

## 2. The pipeline

Stages marked ◆ end with a check-in with Nic before going on.

### Stage 0: Intake

- Find the best source. In order of preference: arXiv or preprint LaTeX, a publisher PDF with a real text layer, a scan. A scan's OCR finds the structure but garbles math, so read statements from the page images.
- Keep source files out of the published folder: the repo is public on GitHub Pages. Put them under `~/Dropbox/Textbooks/…` and link to the publisher, arXiv or the repository instead.
- Record the full citation, where the source lives on disk, the date and venue, whether it is refereed, and any formal verification.
- **Leaves:** `notes/source.md`.

### Stage 1: Read and outline ◆

- Read the whole paper before writing anything.
- Write `notes/outline.md`:
  - the section tree, with page numbers;
  - every numbered statement and equation, transcribed in LaTeX, with its page;
  - a dependency graph: which statement uses which (this becomes the companion page's `DEP_NODES`);
  - for each step: new, a classical input, or routine; whom the paper credits for each input;
  - where each hypothesis is first used;
  - slips in the source, each with the intended reading and a check;
  - the paper's own proof route.
- Recompute anything that can be recomputed (small cases, constants, identities) in a script under `notes/checks/`. LPS found three print slips this way.
- **Check-in:** is this the right story, at the right level?

### Stage 2: Spine and map

- The page's `h2` sections are the paper's sections. Decide what goes in "Before the paper" (background the reader needs, short) and in "Afterwards" (what came next).
- Draw the proof-at-a-glance map (§3.7) and write the context box (§3.3).
- Plan the companion pages from the outline: definitions, notation, cited results, slips, the dependency graph, the reading guide (§4.6).

### Stage 3: Figure plan ◆

- For each candidate figure, write down: the numbered statement it illustrates; what it computes, exactly; its live check (an identity or inequality that turns green); its default state, which must already show the phenomenon on load; its presets, including the case where a hypothesis fails.
- Keep the 5–8 that carry the argument. Anything not in the paper (a primer figure, a picture the paper doesn't draw) is a supplement figure, numbered S1, S2, … so the paper's figure numbers never move.
- Write each figure's math as a pure exported function and test it in node before building any UI.
- **Leaves:** `notes/figures.md`. **Check-in:** Nic approves the list.

### Stage 4: Write the prose

- Prose, statement boxes, equations, figure shells with full captions (§3, §7).
- After every statement box, one paragraph: what it says, and why the argument needs it.
- Fill `js/companions-data.js`.

### Stage 5: Build the figures

- One ES module per figure, following §6. Independent figures can be built in parallel by subagents; give each one the module contract, the colour roles, the statement it checks, and its test file.

### Stage 6: Verify ◆

- Node tests, the `\lt` check, and `tools/check-page.mjs` in all four styles (§8).
- **Accuracy pass:** read the paper and the page side by side. Check each numbered statement. Recompute or cite each number on the page.
- **Check-in:** Nic reads the finished page.

### Stage 7: Publish

- Add the paper to [`index.html`](index.html): a row in its group (or the featured slot, moving the previous one into the list), with an entry in `PREVIEWS` in `tools/make-previews.mjs` naming its signature figure. Run `node docs/InteractivePapers/tools/make-previews.mjs <baseUrl> <Slug>`.
- Commit only this paper's paths (with its previews and the index) and push (§9).

---

## 3. The page

Start from [`template/index.html`](template/index.html). Everything below is plain HTML in that one file; the shared code finds it by class and attribute.

### 3.1 Head

In this order:

1. The Google Fonts link for the other styles (Atkinson Hyperlegible, EB Garamond, JetBrains Mono, Playfair Display). Latin Modern, the LaTeX font, comes from `interactivePaper.css`.
2. `<link rel="stylesheet" href="../interactivePaper.css">`, then the paper's own `style.css`.
3. The early script that applies the saved light/dark mode and page style before first paint, and preloads Latin Modern when the style is LaTeX. Copy it as is.
4. The MathJax config: the paper's macros (`\PSL`, `\Z`, `\leg`, …), `skipHtmlTags` including `canvas`, and **`chtml: { scale: 1, matchFontHeight: false }`**. Math size comes from the style's `--math-size` token, which MathJax's own matching cannot follow when the reader changes style.
5. MathJax 3.2.2 from jsDelivr (`defer`).
6. An importmap, only if a figure uses three.js (`"three": "https://unpkg.com/three@0.160.0/build/three.module.js"`).
7. `<script type="module" src="js/main.js">`.

`js/main.js` is one call:

```js
import { initPaper } from '../../interactivePaper.js';
import * as companions from './companions-data.js';
initPaper({
  subtitle: 'Lubotzky · Phillips · Sarnak, 1988',   // under the title in the contents panel
  filterHint: 'Jump to… (e.g. 4.15, girth)',        // the contents filter's placeholder
  companions,                                       // optional
  modules: { tree: () => import('./fig-tree.js') }, // figure modules by data-fig
});
```

### 3.2 Body

```html
<button class="theme-toggle" id="theme-toggle" type="button" aria-label="Theme and page style"
        aria-haspopup="dialog" aria-expanded="false" aria-controls="look-menu"></button>
<div class="rail" id="rail"></div>
<main class="paper">
  <header class="hero">…</header>
  <section><h2 id="before" data-nav="Before the paper">Before the paper <span class="tag">background</span></h2> …</section>
  <section><h2 id="s1" data-nav="Introduction"><span class="secnum">1.</span>Introduction</h2> …</section>
  …
  <section><h2 id="after">Afterwards</h2> … <h2 id="refs">References</h2> <ol class="refs">…</ol>
    <footer class="end">…</footer></section>
</main>
```

- One `<section>` per paper section; `h2[id]` with `<span class="secnum">N.</span>` for numbered sections and `<span class="tag">background</span>` for the unnumbered parts.
- `h3[id]` for subsections. **Subsection titles are unnumbered** unless the paper numbers them (in LPS, "4.3" would collide with Proposition 4.3).
- `data-nav` gives a heading's label in the contents rail when the heading text is long or holds markup. It may contain `$…$`.
- `.wide` lets a block (figure, map, table) be wider than the reading column, up to 58rem.

### 3.3 Hero and context box

```html
<header class="hero">
  <div class="kicker">Interactive paper</div>
  <h1>Ramanujan Graphs</h1>
  <div class="byline">Authors · <em>Venue</em> volume (year), pages</div>
  <p class="lede">Three or four sentences: the objects, the result, the one idea.</p>
  <div class="context"><span class="label">Context</span><p>…</p><p>…</p></div>
</header>
```

The context box gives dates and venue, refereed or not, formally verified or not, the deep inputs, and the line "figures are models, not proof" with a pointer to the contents rail. For a recent preprint, lead with its status; for a classical paper, lead with what it rests on.

### 3.4 Numbered items

Any element with an `id` and a `data-ref` is a numbered item. An equation numbered inside a statement box (a `\tag` in the box's own display) gets no element of its own: list it in the box's `data-alias` (`data-alias="(2.2)|(2.3)"`), so references to it preview the statement. It becomes a target for reference links, gets a hover preview, and appears in the contents rail.

| Attribute | Example | Meaning |
|---|---|---|
| `data-ref` | `"Theorem 4.1"`, `"(4.15)"`, `"Figure 5"`, `"Figure S2"` | how prose refers to it |
| `data-title` | `"the trace identity"` | a short name, shown in the rail and the preview |
| `data-alias` | `"Remark 2\|the remark"` | more names, separated by `\|` |
| `data-href` | `"../other/#thm-1"` | on an empty element: a target on another page |

**Ids:** `thm-4-1`, `lem-3-1`, `prop-3-3`, `cor-3-2`, `def-1-1`, `eq-4-15`, `fig-<name>`. Kinds the linker knows: Definition, Lemma, Corollary, Proposition, Theorem, Remark, Figure (with abbreviations and plurals: "Props. 4.2, 4.3", "Lemmas 3.1 and 3.2"), equation numbers "(4.15)" and "(3.2)′", and "§3" for any `h2` with a `.secnum`.

### 3.5 Statement boxes, equations, proofs

```html
<div class="thm" id="lem-3-1" data-ref="Lemma 3.1"><span class="label">Lemma 3.1 <span class="who">(Gerritzen–van der Put)</span>.</span> …</div>
<div class="thm key" …>        <!-- a load-bearing new step: about one per section -->
<div class="thm classical" …>  <!-- a result imported from the literature -->
<div class="eq" id="eq-4-15" data-ref="(4.15)" data-title="counting is a trace">$$ … \tag{4.15}$$</div>
<details class="proof"><summary>Proof</summary> … </details>   <!-- or "Proof idea", or a specific label -->
<div class="note" id="why-real"><span class="label">Why every θ is real</span> … </div>
```

### 3.6 Slips in the source

A slip gets a quiet note right after the corrected statement, and an entry in the Print slips companion page:

```html
<p class="slip">The sum is printed over $r\lt k/2$. It must include $r=k/2$ …</p>
```

The page states the intended reading in the box itself; the note says what is printed. CSS adds "In print:" in front.

### 3.7 The proof at a glance

HTML, not SVG, so it reflows on phones:

```html
<div class="map wide">
  <div class="row"><a class="node" href="#s2"><b>Title</b><span>§2 · one-line gist</span></a></div>
  <div class="arrow">↓</div>
  <div class="row">
    <a class="node key" …>      <!-- a key step (shaded) -->
    <a class="node classic" …>  <!-- an input from the literature (dashed) -->
  </div>
  <div class="arrow">↓</div>
  <div class="row"><a class="node goal" href="#thm-4-1">…</a></div>   <!-- the main theorem (green) -->
  <!-- class="node contra": a branch that ends in a contradiction (red, dashed) -->
  <div class="legend">Shaded: the paper's key steps. Dashed: inputs from the literature. Green: the main theorem.</div>
</div>
```

Follow it with one line pointing to the reading guide companion page (`<a href="#view-guide">`).

### 3.8 Supplements: what is not in the paper

Anything the paper does not contain (a primer on background, a picture the paper does not draw, a lab) goes behind an orange button. It starts closed, opens in place, and is remembered per page in the reader's browser.

```html
<div class="supp" id="supp-harmonic" data-title="The harmonic analysis, in pictures"
     data-meta="What an eigenvalue of $\Delta$ means, the singular series, the discrete series. Four figures.">
  <h2 id="supp-ha" class="supp-h2" data-nav="Supplement: the harmonic analysis">…</h2>   <!-- or h3 for one inside a section -->
  …
</div>
```

- The shared code builds the button from `data-title` and `data-meta` (both may hold math) and adds a "Close this supplement" button at the end. Add class `inline` for a short aside inside a section. The long form with an explicit `.supp-toggle` and `.supp-body` (as in LPS) also works.
- A supplement's own `h2` takes class `supp-h2`, so it is not a collapsible section of the paper.
- Orange means "we added this" everywhere: the button, a rule in the left margin while it is open, its entries and ticks in the contents rail, and links that point into it (`supp-ref`). Point to a supplement from the paper with `<p class="supp-pointer">… <a class="supp-link" href="#s-eigen">…</a></p>`.
- Supplement figures are numbered S1, S2, … (`data-ref="Figure S2"`).
- "Expand all" leaves supplements closed. The page checker opens them all.

### 3.9 Tables

Wrap wide tables in `<div class="table-scroll">`. `table.params` is the house style for parameter and status tables.

---

## 4. The global controls

Everything here comes from `initPaper` and `interactivePaper.css`; a paper writes none of it.

### 4.1 The contents rail

A 52px strip on the left edge (a **Contents** button on phones). It shows a progress line, a numbered circle per numbered section (filled for the current one, outlined once passed), dots for unnumbered parts, ticks for subsections, orange ticks for supplements, and the companion pages as icons at the foot. Hovering opens a panel with the whole tree: sections, subsections, and every numbered item, collapsed except around the current position. A filter box jumps to any statement ("4.15", "girth"), and Expand all / Collapse all act on the paper's sections.

### 4.2 Reference links and previews

Every numbered reference in prose, captions, tables, companion pages and live figure readouts becomes a link: "Theorem 4.1", "Props. 4.2, 4.3", "(4.15)", "Figure S2", "§3". A reference whose target is not on the page stays plain text. Hovering a link shows the statement in a popover; clicking jumps to it (opening any collapsed section on the way). Figure readouts are linked when they are set with `setTex`.

### 4.3 Collapsible sections

Every `h2` and `h3` of the paper gets a small wiki-style caret (in the left margin on desktop, inline on phones). Collapsed state is remembered per page. A link or address that points inside a collapsed section opens it.

### 4.4 Supplements

See §3.8.

### 4.5 The theme and style menu

The round button at the top right opens a menu:

- **Mode:** Light, Dark, or Auto (follow the system). The button's icon shows the current mode.
- **Style:** the page's whole look. Each works in light and dark.

| Style | Text and headings | Paper | Size | Math |
|---|---|---|---|---|
| **LaTeX** (default) | Latin Modern (Computer Modern), bold headings, regular-weight title, as in `article` | the Taste Lab palette | 20px, line height 1.45, 62ch | 100% |
| **Modern** | Atkinson Hyperlegible, Playfair Display headings | the same | 19px, 1.4, 60ch | 114.1% |
| **Book** | EB Garamond | warm paper, brick accents | 21px, 1.45, 62ch | 97% |
| **Large print** | Atkinson Hyperlegible throughout | higher contrast, underlined links | 22px (20px on phones), rem 18px | 112% (106%) |

The choice is saved in `localStorage` as `ip-theme` (`light`, `dark`, or absent for Auto) and `ip-style`, shared by every paper on the site, and applied before first paint. Changing it fires the `ip-theme` event twice: at once, and again when the new fonts have loaded, so canvases that measure text draw again. Arrow keys move within the menu and Escape closes it. `window.ipLook.set(mode, style)` sets both (the page checker uses it).

### 4.6 Companion pages

Pages that open over the paper as a sheet, each with its own address (`#view-graph`, `#view-defs/cayley`), closed by ×, Escape, the backdrop or the browser's Back button. A paper gets the pages its `js/companions-data.js` fills; an empty or missing export drops that page.

| Page | Export | Each entry |
|---|---|---|
| Reading guide | `GUIDE_HTML` | HTML: a "Status of each part" table (Part / Status: new, cited, classical / Where the weight sits), then "Three ways through the paper" |
| Dependency graph | `DEP_NODES` | `{ id, kind, label, gist, target, cite, uses }`; `kind` is `def`, `lemma`, `prop`, `thm`, `goal`, `eq`, `remark` or `input`; `target` is the page id; an `input` with no target names its `CITED` key in `cite`; `uses` lists the ids it rests on. Hovering lights up what a box rests on and what rests on it; a toggle traces everything the goal rests on. |
| Definitions | `DEF_TOPICS`, `DEFINITIONS` | `{ key, term, topic, level, origin, text, where }`; `level` is `basic`, `intermediate` or `specialized`; `origin` is `paper` or `background`; filterable and searchable; address `#view-defs/<key>` |
| Notation atlas | `NOTATION_GROUPS` | `{ title, rows: [[symbol, meaning, first, note]] }`; `first` is a reference or `#id` of a heading; a note starting "Not …", "Also …", "Distinct …" is marked as a clash |
| Cited results | `CITED` | `{ key, name, who, statement, used }` |
| Print slips | `SLIPS` | `{ where, text }` |
| (wording) | `TEXT` | `{ kicker, trace, intro: { guide, graph, defs, notation, cited, slips }, blurbs }`: the paper's own words for the sheet's kicker, the trace toggle, and each page's intro |

All strings are HTML with `$…$` math; write them with `String.raw` so backslashes survive. Numbered references inside them become links.

---

## 5. Look

### 5.1 Tokens

All colours are CSS variables on `:root` in `interactivePaper.css`, defined for light, for `[data-theme="dark"]`, and for the system's dark mode when the reader chose Auto. Figures read them at draw time through `palette()`. Never hard-code a colour in a figure, except theme-specific ramps chosen with `P.dark`.

| Token | Use |
|---|---|
| `--bg`, `--surface`, `--surface-2`, `--field` | page, cards, readouts, inputs |
| `--text`, `--muted`, `--border` | text, secondary text, hairlines |
| `--accent`, `--accent-ink`, `--accent-soft` | cobalt: the primary object, buttons, section numbers |
| `--link` | links: a subtler blue, no underline, the full accent on hover |
| `--accent-2`, `--accent-3`, `--neutral` | teal (second object), violet (third), gray (lines, the background object) |
| `--good`, `--bad` | live checks only (`.ok`, `.bad`) |
| `--supp`, `--supp-ink`, `--supp-soft` | orange: material not in the paper |
| `--thm-bg`, `--thm-key-bg`, `--thm-key-bd` | statement boxes |
| `--cv-ink`, `--cv-grid` | canvas ink and grid lines |
| `--font-body`, `--font-head`, `--font-num`, `--font-mono` | text, headings, numbers in readouts, code |
| `--fs`, `--lh`, `--measure`, `--math-size`, `--head-weight` | set by the page style |

### 5.2 Colour roles

Each paper names its objects once, as `--c-<role>` in its own `style.css` (light, dark, and Auto-dark), and adds them to `palette()` in its `js/common.js`:

```js
export * from '../../core/common.js';
import { palette as basePalette, cssVar } from '../../core/common.js';
export function palette() {
  return Object.assign(basePalette(), { graph: cssVar('--c-graph'), count: cssVar('--c-count') });
}
```

A role keeps its colour in every figure and in every caption that names it (`<b style="color:var(--c-graph)">blue</b>`). LPS: cobalt for the graph and its eigenvalues, teal for the quaternion counts, violet for the trivial eigenvalues and the main term, gray for the tree.

### 5.3 Rules

- **Math is always LaTeX**, through MathJax: in prose, captions, buttons, chips, slider labels, readouts, and labels over canvases (use `labelLayer`, never `fillText` for math). No Unicode math such as g₁, ℚ₃, ⌊x⌋.
- Figures are unframed, with the caption below. Panels have hairline borders; statement boxes are softly shaded.
- Buttons are solid filled; chips are pills; corners are 12px (8px for small controls).
- Subtle motion only: fades and short transitions.

---

## 6. Figures

### 6.1 Choosing figures

Pick the mechanisms a reader cannot see from the text alone: the paper's central object, built for real; the identity or inequality the proof turns on, with both sides computed; the counting or limiting argument, run; the classical input, made visible. Each figure models one numbered step and checks it live.

### 6.2 The shell

```html
<figure class="fig wide" id="fig-trace" data-fig="trace" data-ref="Figure 5" data-title="counting is a trace">
  <div class="fig-head"><span class="num">Figure 5</span><span class="title">Counting is a trace</span></div>
  <div class="fig-mount"></div>
  <figcaption>…</figcaption>
</figure>
```

A figure is mounted when it comes within 700px of the viewport, or when an address points at it.

### 6.3 The module contract

```js
// js/fig-trace.js
import { el, makeCanvas, labelLayer, slider, chips, controls, setTex, palette, onTheme, pointer } from './common.js';

export function countBoth(p, q, k) { … }     // pure math, exported: no DOM at module top level

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);
  const st = { … };                            // defaults that already show the phenomenon
  const cv = makeCanvas(left, { aspect: 0.7, maxHeight: 460, draw });
  const labels = labelLayer(cv.wrap);
  function draw(ctx, w, h) { const P = palette(); … labels.set([{ id, x, y, tex, anchor }]); readout(); }
  const ctl = controls(right);
  chips(ctl, { label: 'Pair $(p,q)$', options: [['5,13', '$(5,13)$'], …], value: '5,13', onchange: … });
  slider(ctl, { label: 'length $k$', min: 1, max: 8, value: 4, fmt: (v) => v, oninput: … });
  const ro = el('div', { class: 'readout' }); right.append(ro);
  function readout() { setTex(ro, `<table>… (4.15) <span class="ok">✓</span></table>`); }
  onTheme(() => cv.redraw());
}
```

**`core/common.js`, through the paper's `js/common.js`:**

| Helper | Does |
|---|---|
| `el(tag, attrs, ...kids)` | make an element (`class`, `style`, `html`, `on…` handlers) |
| `palette()`, `role(name)`, `cssVar(name)`, `isDark()`, `onTheme(fn)` | colours at draw time; redraw on mode or style change |
| `setTex(node, html)` | set HTML with `$…$`, typeset it, link its references; skips work when unchanged |
| `typeset(nodes)`, `mathJaxReady()` | serialized MathJax typesetting |
| `labelLayer(wrap).set([{ id, x, y, tex \| html, anchor, cls, color }])` | MathJax labels over a canvas (`anchor`: `c`, `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`; `cls: 'halo'` for a background halo) |
| `makeCanvas(parent, { aspect, maxHeight, minHeight, draw })` | a responsive, HiDPI canvas; `.redraw()`, `.wrap` |
| `controls(parent)`, `slider`, `button`, `segmented`, `chips` | controls; every label may hold math |
| `pointer(target, { down, move, up, hover, leave })` | mouse and touch dragging; `down` returns true to capture |
| `fmt`, `ticks(lo, hi, n)`, `rgba`, `mix`, `hexToRgb` | number formats, axis ticks, colour math |
| `chunked(fn, budget)` | run long work in ~10ms animation-frame slices |

### 6.4 Behaviour

1. **Interesting on load.** The first frame already shows the phenomenon.
2. **A live check in every figure.** The readout states the paper's identity or inequality and marks it `✓` (`.ok`) or `✗` (`.bad`). The page checker counts them, so a `✗` on load is a bug unless it is the point of a preset.
3. **Presets**, including the case where a hypothesis fails, so the reader sees why it is needed.
4. **Handles:** 6–7px dots with a 2px surface-coloured stroke and a 13–16px hit radius, labelled with the paper's symbol.
5. **Heavy computation** runs in `chunked` slices or a module worker; the readout says "running…" until done, and exact or certified results are preferred to floating point.
6. **Canvas text** (axis numbers) uses `cssVar('--font-body')` at 11px, so it follows the page style. Math labels go in a `labelLayer`.
7. **WebGL** only when the pixel work needs it. Read theme colours into uniforms and fall back to a `.fallback` message. For three.js, use the importmap (§3.1); shared viewers from the site's tools may be imported across folders.
8. **Captions** have three parts: what you are looking at and why it is a faithful model; what to do, with bold imperatives (**Drag**, **Choose**, **Raise**); what to notice, naming the statement the live check confirms.

### 6.5 Tests

Each figure's math has a node test in `tests/fig-<name>.test.mjs` that imports the module (catching syntax errors) and checks the paper's claims over many cases. Modules imported by figures must not touch `document`, `location` or `localStorage` at load, or the tests cannot import them.

---

## 7. Writing

- **Lead with intuition.** Before a formula, say in words what it measures.
- **Name the role of each hypothesis** where it is first used.
- **Short paragraphs, one idea each.** Lists for parallel items.
- **Cross-reference** figures from the prose ("Figure 5 computes both sides") and statements from figures; the links are automatic.
- **Dates are absolute** ("posted October 6, 2026").
- **Keep the paper's symbols.** Define macros in the MathJax config rather than repeating `\operatorname`. Write `\lt` and `\gt` inside math (§8).
- Long inline formulas break the phone layout in the larger styles; make them displayed equations.
- "Before the paper" is short and marked as background; "Afterwards" is a short history with dates; the references list the source first.

---

## 8. Verification

1. **Node tests:** `for t in tests/*.test.mjs; do node $t; done`.
2. **`<` inside math** breaks the HTML (`$0<t<1$` parses `<t` as a tag). Use `\lt`. To check:
   ```bash
   python3 - index.html <<'EOF'
   import re, sys
   s = open(sys.argv[1]).read(); body = s.split('<body', 1)[-1]; off = len(s) - len(body); bad = 0
   for m in re.finditer(r'\$\$.+?\$\$|\$.+?\$', body, re.S):
       if re.search(r'<[A-Za-z/!]', m.group(0)):
           bad += 1; print(s.count('\n', 0, off + m.start()) + 1, m.group(0)[:70])
   print('ok' if not bad else f'{bad} math segment(s) need \\lt')
   EOF
   ```
3. **The page checker**, once per style:
   ```bash
   node docs/InteractivePapers/tools/check-page.mjs http://localhost:8847/docs/InteractivePapers/<Slug>/ /tmp/check
   IP_STYLE=book node docs/InteractivePapers/tools/check-page.mjs …     # also modern, large
   ```
   It loads the page in headless Chrome at desktop (1280) and phone (390, mobile emulation) widths, light and dark; opens every supplement; scrolls every figure into view; opens every companion page; and reports console errors, MathJax errors, unlinked numbered references, page width wider than the viewport (with the widest element), and per figure: mounted, canvases, ✓ and ✗ counts. It saves a screenshot of every figure. Run one check at a time: two at once can make the simple Python server drop connections.
4. **Interaction:** press every preset, move every control to both ends, open the style menu and switch styles with a figure on screen.
5. **Accuracy pass** (§2, Stage 6).

**Gotchas**

- A hidden preview pane freezes `requestAnimationFrame` and `IntersectionObserver`, so figures never mount there. Verify with headless Chrome over CDP (the checker does).
- Headless `--window-size` has a minimum width of about 500px. Use CDP `Emulation.setDeviceMetricsOverride` for phone widths.
- Smooth scrolling stops figures from mounting during scripted checks; set `scroll-behavior: auto` first.
- Click a `.supp-toggle` only after it has `aria-controls` (the page wires it after load).
- Headless WebGL needs `--enable-unsafe-swiftshader --use-angle=swiftshader`.
- Tagged displays (`\tag`) carry an inline `min-width`; the shared CSS overrides it.

---

## 9. Publishing

- GitHub Pages builds `docs/` with Jekyll, so URLs drop the `/docs` prefix: `https://nbrody.github.io/InteractivePapers/<Slug>/`. Make sure no `.md` or `.html` file contains a Liquid opener (two left braces, or a left brace followed by a percent sign): Pages renders Markdown without front matter, and Liquid would break the build.
- Several sessions share the working tree. Commit only this paper's paths (and the shared files if they changed), with a temporary index based on `origin/main`, and push that commit; never ship another session's changes.
- A change to `interactivePaper.css`, `interactivePaper.js` or `core/` affects every paper: run the checker on LPS too before pushing.
- Notes in `<Slug>/notes/` are published; keep copyrighted material out of them.

---

## 10. The papers

| Folder | Paper | Built on | Notes |
|---|---|---|---|
| [`LPS/`](LPS/) | Lubotzky–Phillips–Sarnak, *Ramanujan graphs*, Combinatorica 8 (1988) | this skill | the reference: 13 figures, 2 supplements, 6 companion pages; notes in `LPS/notes/`; source scan in `~/Dropbox/Textbooks/Geometric Group Theory/` |
| [`CannonModulus/`](CannonModulus/) | OpenAI, *A Modulus Proof of Cannon's Conjecture* (preprint, September 23, 2026) | this skill | the first paper built from the skill; the October `cannon/` page stays as it was |
| [`cannon/`](cannon/), [`residual/`](residual/), [`catalan/`](catalan/) | OpenAI preprints, October 2026 | `README.md` | the older style; scroll pages with exact figures |
| [`nonsofic/`](nonsofic/) | OpenAI, a non-sofic group | reveal.js deck | several widgets are placeholders |
| `brooksMatelski/`, `martelli/`, `superrigidity/`, `jorgensen.html` | older pages | their own styles | |

All of them are listed on [`index.html`](index.html), the page at `/InteractivePapers/`. Without it, GitHub Pages would render `README.md` there.

---

## 11. Decision log

Every choice made while building LPS, with the reason, in order. The rules above are distilled from it.

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
| 2026-11-02 | **Supplements**: material that is not in the paper (primers, asides, new pictures) sits behind an **orange button** (`.supp`: kicker "Supplement · not in the paper", title, one-line summary, Show/Hide) and opens in place. Closed by default; open ones are remembered per browser; "Expand all" leaves them closed. Open, a supplement is marked by an orange rule in the left margin (outside even the wide figures) and its headings, rail markers, tree entries and every link into it are orange, so a reader always knows when they have left the paper. Links into a closed supplement open it. Its figures are numbered S1, S2, … so the paper's own figure numbers never move. The Severi–Brauer aside in §3 became a small inline supplement. `js/collapse.js` (`makeSupplement`); `tools/check-page.mjs` opens every supplement before checking. | Nic: "These 'supplemental' aspects of a paper should be distinguished somehow - maybe make an orange button that reveals these sections." Blue stays the paper's colour; orange is reserved for what we added. |
| 2026-11-02 | First full supplement: **the harmonic analysis, in pictures**, between §3 and §4, for a reader who does not know the background: what an eigenvalue of $\Delta$ means (the local equation, spherical and plane waves, $\theta$ as a frequency, why $2\sqrt p$ is the volume-growth threshold, the $\mathbb H$ analogue with $\frac14$ and Selberg), eigenvectors of $X^{p,q}$ seen from the tree (sphere averages are the spherical function, which is (4.8)–(4.10)), the singular series (the singularities of $\theta_Q$ at the cusps, Gauss sums, local densities, Eisenstein + cusp; four squares has no cusp forms so Jacobi is exact), and the discrete series (unitary duals of $\mathrm{PGL}_2(\mathbb R)$ and $\mathrm{PGL}_2(\mathbb Q_p)$, Plancherel atoms, definite algebra → Jacquet–Langlands → $D_2$ → Eichler–Shimura → Weil), with Figures S1–S4 and a three-column dictionary. Pointers (orange) from §1 and §4 at the places a reader gets stuck. 13 new background definitions and a notation group. | Nic: "I don't really get the harmonic analysis stuff. Can you create a detailed visual of what the Laplace eigenvalues mean, and help me understand the singular series and discrete series?" For the skill: when the reader's background runs out, add a supplement rather than bloating the paper's own sections. |
| 2026-11-03 | Second supplement, inside §4 after Figure 7: a **square complex lab** (Figure S5). $S^{p,q}$ has one vertex, loops $\alpha_i$ (norm $p$) and $\beta_j$ (norm $q$), and a square for each relation $\alpha\beta=\pm\beta'\alpha'$. Its ¼/¾ hyperplane slices are $Y^{p,q}$ (horizontal) and $Y^{q,p}$ (vertical), edge for edge, under $\beta\mapsto$ the image of $\tilde\beta$ mod $q$, because $\xi(\beta')=\alpha\cdot\xi(\beta)$. Checked for every pair of primes $\equiv1\ (4)$ with $pq\le700$, together with the link $K_{p+1,q+1}$ (`tests/fig-squares.test.mjs`). The 3D view **reuses the quaternion calculator's `FoldedComplexView`** (imported across folders, three.js via an importmap in the page head), with its fold slider from the flat net to the folded space; its Unicode sprite labels are hidden and replaced by MathJax labels projected into an HTML layer, including side labels on the flat net. Below it, $Y^{p,q}$ and $Y^{q,p}$ are drawn as in Figure 7, linked both ways to the squares. | Nic: "Let's add a Supplemental Square complex lab, where we draw the square complex S^{p,q}, and allow for highlighting Y^{p,q} and Y^{q,p} within it", then "We've done this elsewhere, and can even fold the flat square complex gluing data into a topological space." For the skill: reuse a site tool's module in place rather than rebuild it. |
| 2026-11-03 | **Default font is LaTeX's**: Computer Modern (Latin Modern, from the pinned `latex.css@1.11.0` npm package on jsDelivr) for text and headings, bold headings and a regular-weight title as in `article`, readout numbers in the same font. MathJax sizes math by a `--math-size` token (`matchFontHeight: false`, `scale: 1`), 100% here, so text and math are one typeface at one size. **The theme button opens a menu** (`js/look.js`): Light / Dark / Auto, and a page style set as `<html data-style>`: *LaTeX* (default), *Modern* (the earlier Taste Lab tokens, unchanged), *Book* (EB Garamond on warm paper, brick accents) and *Large print* (Atkinson 22px, larger rem, higher contrast, underlined links; one step smaller on phones). Saved as `ip-style` / `ip-theme`, applied before first paint; figures redraw on `ip-theme`. `check-page.mjs` takes `IP_STYLE=…`; all four styles pass. | Nic: "Let's make the default font the same as LaTeX default font. But let's give different global css style options one can choose by clicking on the light/dark mode." Overrides the Atkinson/Playfair row of 2026-11-02 (and Taste Lab's "avoid Academic / LaTeX") for the default; that look stays available as *Modern*. |
| 2026-11-03 | **One shared layer for every paper.** `interactivePaper.css` (design system and global controls), `interactivePaper.js` (`initPaper(config)`), `core/` (common, refs, collapse, look, companions) and a working `template/`. LPS keeps only its colour roles, figures and companion data; companion wording (`TEXT`) and the set of companion pages come from the data. Supplements gain a short form (`data-title`, `data-meta`). This file is rewritten from a protocol into the skill; the earlier protocol text (open decisions, the LPS first-pass tables) is in git history. | Nic: "rewrite the InteractivePaper.md skill to include all of the relevant details in this page … link that .md to an interactivePaper.css that we'll use as global controls across these papers." |
| 2026-11-03 | **Second paper from the skill: Cannon** (`CannonModulus/`, a new folder; the October `cannon/` page is kept as it was). Source is the preprint's LaTeX from `openai/math` (stored outside the site); every statement and equation number comes from the compiled `.aux`. The paper has two figures of its own: page figures are numbered 1–8 in page order, and the paper's are called "the paper's first figure" and "the paper's second figure", made live as Figures 5 and 8, so no number means two things. Equations numbered inside a statement box are `data-alias` targets on that box. The proof map gains `.node.contra` for the two branches that end in contradictions. Eight figures were built in parallel by subagents from `notes/figures.md`, porting the October page's math where it was sound. | Nic: "create an interactive paper for the OpenAI proof the Cannon conjecture"; Nic chose a new folder over rewriting `cannon/` in place. |
| 2026-11-03 | **An index page** (`index.html`) lists every paper: one featured paper (the newest), then rows grouped as shared design / October 2026 walkthroughs / earlier pages / tools, each with a preview still that follows light and dark, and a "Making one" section linking the skill, the template and the shared code. Built on `interactivePaper.css` with the style menu. Previews come from `tools/make-previews.mjs` (Chrome writes WebP directly, 720 px, about 20–35 KB each). | Nic: "Write an index.html in /interactivePapers/ so we see what the options are." Layout from Taste Lab's index-page section: one large featured item followed by a list, flat panels, avoiding both picture-card grids and bare text lists. |
