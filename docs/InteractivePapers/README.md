# Interactive Papers — Style Guide

An *interactive paper* is a long-form web page that walks a reader through one mathematical paper, section by section, with live figures for the mechanisms that carry the argument.

**Reference implementation:** [`cannon/`](cannon/), a walkthrough of *A Modulus Proof of Cannon's Conjecture* (October 2026). When this guide and that page disagree, the page wins; update this guide.

---

## 1. Principles

1. **The paper is the spine.** Use the paper's section titles and its lemma, theorem and equation numbers exactly. A reader with the PDF open should always know where they are.
2. **Honest framing comes first.** Before any mathematics, a status box says what the source is, where and when it appeared, whether it is refereed, and exactly what (if anything) is formally verified. A Lean file that ends in `sorry` is a *statement*, not a proof. Say so.
3. **Explain, don't transcribe.** Restate results faithfully in your own words. Paraphrase proofs as sketches. Never paste paragraphs from the source. Formulas may be reproduced; prose may not.
4. **Every figure computes something real.** A figure models one numbered step and *checks it live*: a ratio stays in its band, an inequality chain holds, a circumcenter matches. Prefer exact models (a real Kleinian group, exact Möbius maps, the algorithm from the proof itself) to cartoons.
5. **Figures are models, not proof.** Say this once in the status box and once in the footer. Label made-up constants as "illustrative".
6. **Neutral voice.** Present tense, third person ("the paper shows…"), no "I". Point to load-bearing steps without inventing criticisms.

---

## 2. Directory layout

```
InteractivePapers/<slug>/
  index.html        all prose, theorem boxes, figure shells and captions
  style.css         copied from cannon/style.css (shared design system)
  js/main.js        lazy-mounts figures, theme toggle, TOC highlighting
  js/common.js      shared helpers (canvas, controls, pointer, palette, Heap)
  js/fig-<name>.js  one ES module per figure: export function mount(root)
```

- No build step and no bundler. Plain ES modules (`<script type="module" src="js/main.js">`).
- External resources are limited to **MathJax 3** (`cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js`) and **Google Fonts** (Inter, Source Serif 4). Everything else lives in the folder. Per the repo's convention, copy files from `cannon/` rather than importing them across folders.
- Use a short lowercase `<slug>` that names the paper (`cannon`, `nonsofic`).

### Starting a new paper

1. Read the **entire** source paper before writing anything. Note its section structure, every numbered statement, and where the new ideas sit versus the cited inputs.
2. `mkdir <slug>/js` and copy `cannon/style.css`, `cannon/js/common.js` and `cannon/js/main.js`.
3. Use `cannon/index.html` as the skeleton: keep the `<head>` (fonts, theme bootstrap, MathJax config), the theme button, `.page`, `nav.toc` and the hero. Replace the content.
4. In `main.js`, replace the `modules` map with your figures.
5. Choose **5–8 figures**, one per load-bearing mechanism (see §6). Write the prose first, then the figures, then run the checklist in §9.

---

## 3. Page anatomy (in order)

| Block | Markup | Notes |
|---|---|---|
| Theme toggle | `button.theme-toggle#theme-toggle` | Fixed top right. The preference is stored in `localStorage['ip-theme']` and shared across all papers. |
| Contents | `nav.toc > ol > li (.sub) > a` | Sticky sidebar at ≥ 1120px, hidden below. One entry per `h2`, plus `.sub` entries for important `h3`s. Active link is highlighted on scroll. |
| Hero | `header.hero` → `.kicker`, `h1`, `p.sub` | Kicker is "Interactive walkthrough". The title is a short phrase, not the paper's full title. The sub line gives the result in one sentence. |
| Status | `.status` with a `<strong>Status (date)</strong>` label | Source link, date, where it was posted (commit or arXiv id), refereed or not, formal-verification status, and "figures are models". |
| §1 | `section#s1 > h2` | The statement, in a `.thm.key` box. What it means, earlier work as a short bulleted list, what is new about the approach. |
| Proof at a glance | `h3#map` + `div.map` | Clickable flowchart of the logic (see §5). |
| One `section` per paper section | `section#sN > h2 > span.secnum` | `h3#sN-M > span.secnum` for subsections, using the paper's numbering. |
| Reading guide | `section#guide` + `table.params` | Columns: Part / Status (classical, new, elementary) / Where the weight sits. Then one paragraph on which steps a checker should spend the most time on. |
| References | `section#refs > ol.refs` | Source link first, then the works the page mentions. |
| Footer | `footer.end` | One line: the page explains the claimed proof and does not verify it; the figures are models. |

### Statement boxes

```html
<div class="thm"><span class="label">Lemma 3.5 (Local oscillation).</span> … </div>          <!-- supporting lemma -->
<div class="thm key"><span class="label">Lemma 3.8 (…).</span> … </div>                       <!-- load-bearing new step -->
<div class="thm classical"><span class="label">Theorem 2.5 (Bonk–Kleiner).</span> … </div>     <!-- cited input -->
```

- `.thm.key` (vermillion bar) marks the steps the argument rests on. Use it sparingly, about one per section.
- `.thm.classical` (gray bar) marks results imported from the literature.
- After every box, write a plain-language paragraph: what it says, and why the argument needs it.

### Proofs and asides

```html
<details class="proof"><summary>Proof idea</summary> <p>…</p> </details>
<div class="note"><span class="label">The shape of the argument</span> … </div>
```

- Summaries: "Proof", "Proof idea", or a specific label such as "How the scales are chosen" or "Where subexponential growth is used".
- Use one `.note` near the end to summarize the whole argument in a paragraph.

---

## 4. Writing

- **Lead with intuition.** Before a formula, say in words what it measures. Example: "$M(n)$ measures how expensive it is to block all macroscopic paths with cells of size $r_n$."
- **Name the role of each hypothesis** where it is first used. Example: "Lemma 2.4 is the first place the hypothesis $\partial G\cong S^2$ enters."
- **Short paragraphs, one idea each.** Use bulleted or numbered lists for parallel items, such as the four steps of a classical proposition.
- **Cross-reference figures from the prose** ("Figure 2 computes these moduli") and **sections from figures**.
- **Dates are absolute** ("posted October 6, 2026"), never "yesterday".
- **Math notation:** keep the paper's symbols. Define macros in the MathJax config (`\Hyp`, `\Mod`, `\osc`, `\diam`, `\Stab`, `\dist`, `\Isom`) rather than repeating `\operatorname`.

### Figure captions

A caption has three parts:

1. **What you are looking at.** Name the model, and say why it is a faithful stand-in for the paper's object.
2. **What to do.** Use bold imperative verbs: **Drag**, **Click**, **Raise the mesh**, **Look at the puncture**.
3. **What to notice.** Name the lemma or equation it illustrates, and what the live readout confirms.

Color words in captions should match the figure: `<b style="color:var(--accent)">blue</b>`.

---

## 5. The "proof at a glance" map

The map is HTML, not SVG, so it reflows on phones. Use `.map` with `.node` links, `.arrow` rows, and `.split` / `.col` for branches.

| Class | Meaning |
|---|---|
| `.node` | a new step of the argument (white) |
| `.node.classic` | a classical input (shaded) |
| `.node.contra` | a contradiction (vermillion) |
| `.node.goal` | the main theorem (green) |
| `.branch-label` | small caps above a branch ("suppose M(n) is unbounded") |
| `.legend` | one line explaining the shading |

Each node is an `<a href="#section">` with a `<b>` title and a `<span>` giving the section number and a one-line gist.

---

## 6. Figures

### Choosing figures

Pick the mechanisms a reader cannot see from the text alone. The Cannon page used:

- **the geometric setting:** an actual group's boundary, with zoom, showing self-similarity and expansion;
- **a key algorithm:** the proof of the duality lemma, run as Frank–Wolfe;
- **a topological lemma:** the paper's labeling argument, made interactive;
- **the engine inequality:** both sides computed on a mesh;
- **a counting or probabilistic argument:** a budget chart where the adversary loses;
- **a scale bookkeeping picture:** the paper's own figure, made exact with Möbius maps;
- **the classical endgame:** the conformal-structure circumcenter.

### Shell (in `index.html`)

```html
<figure class="fig" id="fig-name" data-fig="name">
  <div class="fig-head"><span class="num">Figure 3</span><span class="title">Short title naming the idea</span></div>
  <div class="fig-mount"></div>
  <figcaption> … three-part caption with MathJax … </figcaption>
</figure>
```

`main.js` mounts the module when the figure comes within 600px of the viewport.

### Module contract (`js/fig-name.js`)

```js
import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, fmt, rgba, ramp } from './common.js';

// Pure math: exported, no DOM at module top level, so node can import and test it.
export function computeSomething(params) { /* … */ }

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const st = { /* state with INTERESTING defaults */ };
  const cv = makeCanvas(left, { aspect: 1, maxHeight: 560, draw });
  function draw(ctx, w, h) { const P = palette(); /* read colors at draw time */ updateReadout(); }

  const ctl = controls(right); ctl.style.marginTop = '0';
  slider(ctl, { label: 'mesh n', min: 10, max: 96, step: 2, value: 40, fmt: (v) => v, oninput: (v) => { /* … */ cv.redraw(); } });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' }); right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Drag … · click …'));

  function updateReadout() { ro.innerHTML = `<table>…<span class="ok">holds</span>…</table>`; }
  pointer(cv.wrap, { down(x, y) { /* hit test, return true to capture */ }, move(x, y) {}, up() {} });
  onTheme(() => cv.redraw());
}
```

### Layout

- **Default:** canvas on the left (`.grow`), controls and readout on the right (`.side`). They stack automatically on narrow screens.
- **Several panels:** use `.fig-row` with multiple `.grow` children and `style="flex: 1 1 230px"`, each with a small `.hint` title above its canvas.
- **Wide figures:** put charts below the panels at full width (`makeCanvas(root, { aspect: 0.3, maxHeight: 220 })`), with controls in a `controls(root)` row.
- **Mode switches:** `segmented(...)` under the canvas. Show mode-specific sliders only in their mode.

### Behavior rules

1. **Interesting on load.** The first frame must already show the phenomenon. A uniform board looked dead, so the default became a wall with a gap. A variation path that crossed only a few level curves showed nothing, so it was moved to run radially.
2. **A live check in every figure.** The readout states the paper's inequality and colors it `.ok` (green) or `.bad` (vermillion). When an inequality has three terms, show them as `.bars`.
3. **Presets.** Add buttons for the canonical scenarios, including the degenerate case where the hypothesis fails ("Put c on b, φ = θ"), so the reader sees why the hypothesis is needed.
4. **Handles.** Drag targets are 6–7px dots with a 2px panel-colored stroke, with a 13–16px hit radius. Label them with the paper's symbol (`hy`, `pⱼ`, `c = gb`).
5. **Heavy computation** runs in `requestAnimationFrame` chunks of about 10ms. The readout shows `running…` until `converged`, and iterations are capped. Show certified two-sided bounds where they exist (`lower … upper`).
6. **WebGL** only when the pixel work needs it (per-pixel group folding). Read theme colors into uniforms, antialias lines with `fwidth`, and fall back to a `.fallback` message without WebGL2.
7. **Text inside canvases** uses Inter 10–12px. Write exponents as `a^(τD)`, not TeX.

---

## 7. Design tokens

All colors are CSS variables on `:root`, redefined for dark mode both under `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme="light"])`) and under `:root[data-theme="dark"]`. Canvas code reads them through `palette()`. Never hard-code a color in a figure except for theme-specific ramps chosen with `P.dark`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fbfaf7` | `#131419` | page (warm paper / ink) |
| `--fg` | `#1e1d1b` | `#e7e5df` | text |
| `--muted` | `#6b675f` | `#9b978e` | captions, labels, secondary text |
| `--rule` | `#e2ded4` | `#2b2e37` | hairlines, borders |
| `--panel` / `--panel-2` | `#fff` / `#f3f1eb` | `#1a1c23` / `#21242d` | figure cards / readouts, chart backgrounds |
| `--accent` | `#2f5fd0` | `#7ea4ff` | **primary object**: the first function, given data, links |
| `--accent-2` | `#cf5427` | `#ff8b5e` | **second object or the key move**: the other puncture, the contradiction, `.thm.key` |
| `--accent-3` | `#23865a` | `#5ccf97` | **success**: certified checks (`.ok`), the goal, chains found |
| `--accent-4` | `#8146c9` | `#c49cff` | **tertiary**: orientation-reversing elements, a middle term |
| `--thm-bg` | `#f5f7fd` | `#1b1f2b` | statement boxes |
| `--warn-bg` / `--warn-border` | `#fff7e3` / `#e0b04a` | `#2a2416` / `#8f7330` | status box |
| `--cv-*` | | | canvas-specific background, ink, grid, fills |

Keep the color roles consistent within a paper. If blue is $W$ in one figure, blue is the primary function everywhere.

**Typography:** body is Source Serif 4, 1.08rem, line height 1.62. All UI (figure heads, controls, readouts, map, contents, labels) is Inter. `h2` is 1.62rem, weight 600, with a top rule and the section number in `--accent`. `h3` numbers are in `--muted`.

**Shape:** figure cards have 12px radius, a 1px `--rule` border and a soft shadow. Readouts and controls have 6–8px radius. The page has a 16px side gutter, and the main column is at most 52rem.

---

## 8. MathJax gotchas

- **`<` inside math breaks the HTML.** `$0<t<1$` makes the browser parse `<t` as a tag and silently garbles the sentence. Always write `\lt` (`$0\lt t\lt 1$`), and also `\gt` for symmetry. Check before shipping. The script pairs the dollar signs and looks only inside math; the quoted `'EOF'` keeps zsh from expanding `$[`.
  ```bash
  python3 - index.html <<'EOF'
  import re, sys
  s = open(sys.argv[1]).read()
  body = s.split('<body', 1)[-1]
  off = len(s) - len(body)
  bad = 0
  for m in re.finditer(r'\$\$.+?\$\$|\$.+?\$', body, re.S):
      if re.search(r'<[A-Za-z/!]', m.group(0)):
          bad += 1
          print(s.count('\n', 0, off + m.start()) + 1, m.group(0)[:70])
  print('ok: no unescaped < in math' if not bad else f'{bad} math segment(s) need \\lt')
  EOF
  ```
- **Tagged displays (`\tag{3.7}`) carry an inline `min-width`.** This widens the whole page on phones. `style.css` overrides it:
  `mjx-container[jax="CHTML"][display="true"] { min-width: 0 !important; max-width: 100%; overflow-x: auto; }`
- **Skip canvases.** Add `canvas` to `options.skipHtmlTags`.
- **Check for errors:** `document.querySelectorAll('mjx-merror').length` should be `0`.

---

## 9. Verification checklist

Run every item before calling a paper done.

1. **Math in node.** Import every `fig-*.js` (this catches syntax errors), then test the exported math against the paper's claims. Examples: right dihedral angles, the ratio band in an expansion formula, odd interface ends, "level set contains a crossing" over thousands of random trials.
2. **Preview** (any repo-root static server, such as the `poincare` launch config on port 8777). Load the page with no console errors. Visit every figure and check its default state and live readout.
3. **Light and dark.** Use the theme toggle and the `prefers-color-scheme` emulation.
4. **Phone width, done properly.** Headless `--window-size` has a minimum width of about 500px, so its screenshots lie. Use CDP `Emulation.setDeviceMetricsOverride({ width: 390, height: 844, deviceScaleFactor: 2, mobile: true })`. Then require `innerWidth === 390 && document.documentElement.scrollWidth === 390`. If `innerWidth` balloons, some element forces a minimum width. Find it with:
   ```js
   [...document.querySelectorAll('body *')].filter(e => {
     const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.right > innerWidth + 1)) return false;
     for (let a = e.parentElement; a; a = a.parentElement)
       if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= innerWidth + 1) return false;
     return !e.parentElement || e.parentElement.getBoundingClientRect().right <= innerWidth + 1;
   }).map(e => e.tagName + ' ' + (e.textContent || '').slice(0, 50))
   ```
5. **A hidden preview pane** freezes `IntersectionObserver` and `requestAnimationFrame`, so figures never mount there. Use headless Chrome over CDP, and scroll each figure into view with a pause before capturing.
6. **Interaction.** Drag every handle, press every preset, and move every slider to both ends. Readouts must stay finite and the `.ok` checks must hold.
