#!/usr/bin/env python3
"""Writes deck.json (alphaCentaur Presentations source) and ../script.md for the
50-minute alphaCentaur talk at "Accelerating Mathematical Discovery: A Crash
Course in AI and Computation" (Santa Cruz, 28 Oct – 1 Nov 2026). Render with
../build.html (see ../README.md).

This is the bootstrap. Once the deck has been edited in the slide editor, the
exported ../index.html is the source of truth: re-running this script would
overwrite those edits. (make_deck_25min.py.bak is the earlier 25-minute draft.)"""
import base64, io, json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
n = 0
def eid():
    global n; n += 1; return f"e{n}"

# ---------------------------------------------------------------- elements --
def text(role, x, y, w, h, html, **kw):
    return {"id": eid(), "type": "text", "role": role, "x": x, "y": y, "w": w, "h": h, "html": html, **kw}
def math(x, y, w, h, tex, size=56, **kw):
    return {"id": eid(), "type": "math", "x": x, "y": y, "w": w, "h": h, "tex": tex, "size": size, **kw}
def rect(x, y, w, h, fill="surface", radius=24, **kw):
    return {"id": eid(), "type": "shape", "shape": "rect", "x": x, "y": y, "w": w, "h": h, "fill": fill, "radius": radius, "stroke": "none", "strokeW": 0, **kw}
def image(asset, x, y, w, h, alt, **kw):
    return {"id": eid(), "type": "image", "x": x, "y": y, "w": w, "h": h, "asset": asset, "fit": "cover", "radius": 16, "shadow": "lifted", "alt": alt, **kw}
def applet(code, name, x, y, w, h, **kw):
    return {"id": eid(), "type": "applet", "x": x, "y": y, "w": w, "h": h, "code": code, "name": name, "radius": 0, "fill": "transparent", **kw}
def eyebrow(t):
    return text("eyebrow", 140, 62, 1640, 40, f"<p>{t}</p>")
def heading(t):
    return text("heading", 140, 40, 1640, 170, f"<p>{t}</p>", autoH=False, valign="bottom")
def ul(*items):
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
def ol(*items):
    return "<ol>" + "".join(f"<li>{i}</li>" for i in items) + "</ol>"
def hl(t, c="accent"):
    return f'<span style="color:var(--pz-{c})">{t}</span>'
M = r"\left(\begin{smallmatrix}"
E = r"\end{smallmatrix}\right)"
def mat(a, b, c, d):
    return f"{M}{a} &amp; {b}\\\\ {c} &amp; {d}{E}"

slides = []
def slide(sid, els, notes, **kw):
    slides.append({"id": sid, "notes": notes.strip(), "elements": els, **kw})

# ------------------------------------------------------------------ assets --
assets = {}
def asset(name, crop=None, width=None, quality=84):
    """Screenshots are 2160×1350 (1440×900 CSS px at 1.5×). crop is in CSS px."""
    im = Image.open(os.path.join(HERE, "shots", name + ".jpg")).convert("RGB")
    if crop:
        im = im.crop(tuple(round(v * 1.5) for v in crop))
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    key = name + ("-crop" if crop else "")
    assets[key] = {"name": key + ".jpg", "mime": "image/jpeg", "data": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}
    return key, im.width / im.height

ORBIT = open(os.path.join(HERE, "orbit.html")).read()
def orbit(**cfg):
    line = "const CFG = " + json.dumps({"labels": False, "ellipses": True, "names": ["A", "B"], **cfg}, ensure_ascii=False) + ";"
    return ORBIT.replace("const CFG = { labels: false, ellipses: true, names: ['A', 'B'] };", line)

def shot_left(key, alt):
    return image(key, 140, 250, 1000, 625, alt)
def side_text(html, size=36, x=1190, w=590, **kw):
    return text("body", x, 250, w, 600, html, size=size, lh=1.38, **kw)
def card(x, y, w, h, title, body, color="accent", size=34, build=0):
    return [rect(x, y, w, h, fill="surface", radius=26, build=build),
            text("heading", x + 36, y + 28, w - 72, 60, f"<p>{title}</p>", size=40, color=color, build=build),
            text("body", x + 36, y + 96, w - 72, h - 120, body, size=size, lh=1.38, build=build)]

# =================================================================== slides ==

# ─────────────────────────────────────────────────────────────── opening ──
slide("title", [
    applet(orbit(), "Alpha Centauri A and B", 940, 40, 980, 1000),
    text("eyebrow", 160, 300, 900, 40, "<p>Accelerating Mathematical Discovery · Santa Cruz</p>"),
    text("title", 160, 360, 1000, 180, "<p>alphaCentaur</p>", size=120, autoH=False, valign="bottom"),
    rect(166, 562, 120, 12, fill="accent", radius=6),
    text("subtitle", 160, 605, 820, 160, "<p>Research mathematics with an AI collaborator: a worked example</p>"),
    text("caption", 160, 830, 800, 50, "<p>Nic Brody · UC Santa Cruz</p>", size=34, color="text"),
], """
~0:00–0:30. This talk is a worked example. One research problem, a tool I built with an AI coding agent to attack it, and the workspace I built so that the human–AI collaboration stays honest. Then a live demo, and some advice for the working groups later this week.
""", bg={"kind": "gradient", "color": "bg", "color2": "surface", "angle": 160})

slide("centaurs", [
    eyebrow("The name"),
    heading("Centaurs, and Alpha-everything"),
    text("body", 140, 250, 900, 520,
         ul("<b>Centaur</b> is the chess word for a human–computer team. In the 2005 freestyle tournament, two amateurs with three ordinary PCs beat grandmasters with engines.",
            "<b>Alpha</b> is DeepMind’s convention: AlphaGo, AlphaZero, AlphaFold, AlphaProof, AlphaGeometry, AlphaEvolve.",
            "So: an Alpha-style system where the human stays in the loop."),
         size=38, build=1, buildBy="paragraph"),
    rect(140, 760, 900, 170, fill="surface", radius=24, build=4),
    text("body", 180, 785, 820, 130,
         f"<p>weak human + machine + {hl('<b>better process</b>')}</p><p>beat strong human + machine + worse process.</p>",
         size=36, lh=1.3, build=4),
    applet(orbit(labels=True, names=["A · you", "B · the machine"]), "Alpha Centauri A and B", 1080, 160, 760, 740),
    text("caption", 1080, 900, 760, 90, "<p>And α Centauri is a binary star: A and B orbit a common centre. Neither one is the planet.</p>", align="center"),
], """
~0:30–2:00. The name is a mash-up. "Centaur" is the chess word for a human–computer team: in the 2005 freestyle tournament, where anyone could enter with any hardware, the winners were two amateurs running three ordinary computers, ahead of grandmasters who also had engines. Kasparov's reading of that was that the process mattered more than the strength of either the human or the machine.

"Alpha" is DeepMind's naming convention — AlphaGo, AlphaZero, AlphaFold, AlphaProof, AlphaGeometry, AlphaEvolve. So alphaCentaur is meant to be an Alpha-style system that keeps the human in the loop.

And it happens that Alpha Centauri is a binary star, which is the app's icon: two stars orbiting a common centre.
""")

slide("plan", [
    eyebrow("This talk"),
    heading("A worked example in five parts"),
    text("body", 140, 250, 1640, 700,
         ol("<b>A research problem:</b> which groups of rational matrices are arithmetic?",
            "<b>A tool built with an AI agent:</b> the Presentation Calculator — and what went wrong.",
            "<b>A workspace for the collaboration:</b> alphaCentaur, and its rules.",
            "<b>Live demo:</b> the calculator running inside alphaCentaur.",
            "<b>For your working groups:</b> what has been AI-tractable for me, and a recipe."),
         size=42, lh=1.55, build=1, buildBy="paragraph"),
], """
~2:00–2:45. Here's the plan. The common thread is one research problem, so you see real mathematics rather than a toy.
""")

# ─────────────────────────────────────────────────────── I · the problem ──
slide("question", [
    eyebrow("I · A research problem"),
    heading("Which matrix groups are arithmetic?"),
    text("body", 140, 240, 1640, 120,
         r"<p>Pick $g_1, \dots, g_k \in \PGL_2(\Q)$ and let $\Gamma = \langle g_1, \dots, g_k \rangle$. Its entries have finitely many primes $S$ in their denominators, so</p>",
         size=38),
    math(140, 370, 1640, 110, r"\Gamma \;\le\; \PGL_2(\Z[1/S]) \;\hookrightarrow\; \PGL_2(\R) \times \prod_{p \in S} \PGL_2(\Q_p) \quad\text{acting on}\quad \HH^2 \times \prod_{p\in S} T_p", size=40),
    text("body", 140, 520, 1640, 440,
         ol("Is $\\Gamma$ Zariski dense?",
            "Is it discrete at some place — in $\\PGL_2(\\R)$, or on some tree $T_p$?",
            "Does it have finite index in $\\PGL_2(\\Z[1/S])$ (<b>S-arithmetic</b>), or infinite index (<b>thin</b>)?",
            "What is a presentation $\\langle g_1, \\dots, g_k \\mid r_1, r_2, \\dots \\rangle$?"),
         size=38, lh=1.5, build=1, buildBy="paragraph"),
], """
~2:45–5:00. The problem. Take a few 2×2 rational matrices and the group they generate. Clearing denominators puts it inside PGL₂(ℤ[1/S]), which sits as a lattice in a product of real and p-adic groups, acting on the hyperbolic plane times a product of trees.

Four questions, in increasing order of difficulty: is it Zariski dense; is it discrete somewhere; is it S-arithmetic — finite index — or thin; and what's a presentation. For a single group these can be very hard; the thin-versus-arithmetic question has no general algorithm.
""")

slide("examples", [
    eyebrow("I · A research problem"),
    heading("An easy one, and a hard one"),
    *card(140, 240, 790, 640, "Easy",
          r"<p>$\Gamma = \langle T, S, \mathrm{diag}(2,1) \rangle$ with $T = " + mat(1, 1, 0, 1) + r"$, $S = " + mat(0, -1, 1, 0) + r"$.</p>"
          r"<p>Zariski dense; not discrete at $\R$ or $\Q_2$; index 2 in $\PGL_2(\Z[\tfrac12])$ by coset enumeration, in 3 ms.</p>"
          r"<p>Presentation: a graph of groups on the tree $T_3$, five relations.</p>", size=34),
    *card(990, 240, 790, 640, "Hard",
          r"<p>$\Gamma = \langle g = " + mat(0, 1, 1, -2) + r",\; w = " + mat(0, 2, 3, 0) + r" \rangle$ with $S = \{2, 3\}$</p>"
          r"<p>Not discrete at $\R$, $\Q_2$ or $\Q_3$. Its congruence closure has index 960, but coset enumeration with 20 million cosets doesn’t close.</p>"
          r"<p>Of the elements of the closure of height ≤ 100, $\Gamma$ reaches 157 of 5319. Probably thin ($\cong \Z * \Z/2$). No certificate.</p>",
          color="accent2", size=34, build=1),
], """
~5:00–7:30. Two examples. On the left, translation, inversion and a diagonal matrix: the calculator decides in milliseconds that this has index 2 in PGL₂(ℤ[½]) and gives a presentation as a graph of groups on the 3-regular tree.

On the right, two matrices, one an involution, with S = {2, 3}. It's non-discrete at every place, so no geometric argument works directly. The congruence closure — the smallest congruence subgroup containing it — has index 960, so if it were arithmetic its index would be 960. But coset enumeration with twenty million cosets doesn't close, and if you count elements of small height, the group reaches a vanishing fraction of its closure: 157 of 5319 at height 100. It looks thin, probably a free product ℤ ∗ ℤ/2. We have no certificate. (That density-by-height diagnostic was my idea; the AI ran it.)
""")

k, _ = asset("live-pcalc")
slide("calculator", [
    eyebrow("I · A research problem"),
    heading("The Presentation Calculator"),
    shot_left(k, "The Presentation Calculator computing a graph-of-groups presentation"),
    side_text(ol("<b>Algebraic:</b> Zariski closure, congruence closure.",
                 "<b>Geometric:</b> each place — Poincaré’s theorem at $\\R$, Bass–Serre theory on the trees.",
                 "<b>Arithmetic:</b> coset enumeration in a presentation of $\\PGL_2(\\Z[1/S])$, coverings, vertex orbits with Stallings folding, cusp certificates.",
                 "<b>Presentation:</b> Poincaré, Reidemeister–Schreier, or a graph of groups."),
              size=33, build=1, buildBy="paragraph"),
], """
~7:30–9:30. The tool. You type matrices — over ℚ or a number field — and press Compute. It runs four stages, in the browser, in parallel web workers: the Zariski and congruence closures; discreteness place by place, using Poincaré's polyhedron theorem at the real place and Bass–Serre theory on the trees; then the arithmetic stage, which tries several certificates of finite index; and finally a presentation.

Every "yes" it prints comes with a certificate it checked exactly. Every "I don't know" is labelled as such.
""")

# ──────────────────────────────────────────────── II · building it with AI ──
stats = [("2 weeks", "of evenings, 5–20 Oct"), ("13,666", "lines of JavaScript, 39 modules"), ("98", "tests"), ("23,198", "groups run through it")]
els = [eyebrow("II · Building it with an AI agent"), heading("Built with a coding agent")]
for i, (big, small) in enumerate(stats):
    x = 140 + i * 420
    els += [rect(x, 250, 380, 300, fill="surface", radius=28),
            text("title", x + 20, 285, 340, 130, f"<p>{big}</p>", align="center", color="accent", size=78, autoH=False, valign="middle"),
            text("body", x + 30, 430, 320, 100, f"<p>{small}</p>", align="center", size=30, lh=1.3)]
els.append(text("body", 140, 610, 1640, 360,
                ul("A coding agent (Claude Code) with a shell, working in my site’s repository.",
                   "It implemented: Todd–Coxeter (HLT and Felsch), Reidemeister–Schreier with Tietze moves, Stallings folding over $\\PSL_2(\\Z) = \\Z/2 * \\Z/3$, the Bass–Serre amalgam presentation of $\\PGL_2(\\Z[1/S])$, congruence closures, number-field arithmetic.",
                   "Plus a batch pipeline that runs the page’s own code over thousands of groups."),
                size=34, lh=1.42, build=1, buildBy="paragraph"))
slide("built", els, """
~9:30–11:00. The calculator existed in a small form last year. The version you'll see was built over about two weeks this month, with a coding agent — Claude Code — that had a shell in my website's repository. It wrote most of the code: classical combinatorial group theory algorithms, each of which is a paper's worth of careful implementation, plus a batch pipeline that runs the same code over tens of thousands of groups.

[Nic: check the dates and adjust the "2 weeks" framing; git shows the first version in September 2025.]
""")

slide("who", [
    eyebrow("II · Building it with an AI agent"),
    heading("Who did what"),
    *card(140, 240, 790, 700, "The agent",
          ul("Implemented algorithms from papers and specs, fast.",
             "Ran thousands of examples, sorted the failures, profiled.",
             "Cross-checked methods against each other, and against GAP.",
             "Wrote exact research scripts for one-off questions.",
             "Kept a running log — in a memory file it wrote for itself."), color="accent2", size=34),
    *card(990, 240, 790, 700, "Me",
          ul("Chose the questions, and the order to attack them.",
             "Brought the structure: a finite-index subgroup of $\\PGL_2(\\Z)$ forces S-arithmeticity (no covering needed).",
             "Invented the density-by-height diagnostic.",
             "Pushed back: <i>“too specialized — check against Vaserstein and Benoist–Oh”</i>; new methods must help typical groups, not just a test suite.",
             "Decided what counted as a certificate."), size=34, build=1),
], """
~11:00–13:00. The division of labour. The agent is extraordinary at implementation and at sweeping: give it Todd–Coxeter and it writes Todd–Coxeter, then runs it on twenty thousand groups and tells you which ones time out.

What it didn't do was decide what mattered. Several of the big wins came from me supplying a piece of structure — for instance a lemma from an appendix of a paper of mine: a group containing a finite-index subgroup of PGL₂(ℤ) is automatically S-arithmetic, so no covering argument is needed. And I had to keep pushing back on over-specialization: at one point it had built Bianchi-group machinery that only worked for three fields, and the right move was to go back to Vaserstein's theorem and Benoist–Oh, which work for every number field.

[Nic: the arXiv reference for the appendix is 2308.07785; confirm the wording you want.]
""")

slide("checks", [
    eyebrow("II · Building it with an AI agent"),
    heading("Trust came from cross-checks"),
    text("body", 140, 250, 1640, 560,
         ul("Congruence-closure index vs. coset enumeration: <b>400</b> S-arithmetic groups, <b>0</b> mismatches (313 exact, 85 lower bounds).",
            "Vertex orbits vs. Todd–Coxeter on 246 groups: 221 agree, <b>0</b> disagree, 25 where Todd–Coxeter gives up.",
            "Presentations vs. GAP: indices, abelian invariants and low-index subgroup counts agree.",
            "Number fields vs. the theorems (Vaserstein, Benoist–Oh): 1,753 groups, <b>0</b> contradictions."),
         size=38, lh=1.45, build=1, buildBy="paragraph"),
    text("quote", 140, 840, 1640, 120, "<p>Two independent methods for every number I believe.</p>", align="center", size=50, color="accent", build=5),
], """
~13:00–15:00. Why should anyone believe a 13,000-line program written mostly by an AI? Not because the AI is trustworthy. Because every verdict can be reached two independent ways, and we compared them in bulk. The congruence closure is pure finite group theory; the coset enumeration is combinatorial; they agree on 400 groups. Vertex orbits on the product of trees agree with Todd–Coxeter on every group where both finish. Presentations were checked against GAP. Over number fields, the verdicts never contradict the known theorems.
""")

slide("caught", [
    eyebrow("II · Building it with an AI agent"),
    heading("What the cross-checks caught"),
    *card(140, 240, 520, 640, "Unsound certificate",
          "<p>A Bass–Serre test certified free products with edge inversions of order 2k > 2. Such an element fixes only an edge’s midpoint.</p><p>71 “discrete” records removed and rerun.</p>", size=32),
    *card(700, 240, 520, 640, "Wrong quotient",
          "<p>Level-by-level quotients $\\PGL_2(\\Z/q)$ gave half the true index on ~3% of groups: the scalars of $\\PGL_2(\\Z[1/S])$ are only the S-units.</p><p>Caught by disagreeing with coset enumeration.</p>",
          size=32, build=1),
    *card(1260, 240, 520, 640, "Wrong conclusion",
          "<p>“Coset enumeration doesn’t close, so it’s probably thin.” For rational Riley groups, a structural argument showed the index is finite and known: 2304 at 51/13.</p><p>Searching longer would never have found that.</p>",
          size=32, color="accent2", build=2),
], """
~15:00–17:00. Three things that went wrong, all caught. One: a certificate that was simply unsound — the agent's Bass–Serre test accepted edge inversions of order more than 2, which fix only the midpoint of an edge. 71 database entries said "discrete" and shouldn't have. Two: a congruence computation that quietly assumed the wrong group of scalars and got half the index on about 3% of groups — found only because it disagreed with coset enumeration. Three, the most instructive: a wrong conclusion. On the rational Riley groups the machine kept failing to close coset enumerations, which nudged us towards "thin". The right observation was structural, and it turned every case into a finite-index problem with a known index. (That one is from this week's AIMing talk.)

AI-written mathematical code is a conjecture generator until it's cross-checked.
""")

slide("deadends", [
    eyebrow("II · Building it with an AI agent"),
    heading("Dead ends are results"),
    text("body", 140, 240, 1000, 700,
         ul("Klein combination at ∞: 0 of 12 open groups.",
            "Fricke’s trace test: sound, agrees with Poincaré on 334 groups — and decides none of the open ones.",
            "Abelianization / congruence certificates of thinness: impossible in principle (thin groups are profinitely dense).",
            "Ping-pong on boundaries of trees: led to a theorem."),
         size=36, lh=1.45, build=1, buildBy="paragraph"),
    rect(1180, 240, 600, 640, fill="surface", radius=28, build=4),
    text("eyebrow", 1220, 275, 520, 40, "<p>Proved along the way</p>", build=4),
    text("body", 1220, 335, 520, 520,
         "<p>If $\\Gamma = A * B$ is non-discrete at a place $v$ <i>and</i> in the product of the other places, then no open ping-pong sets exist on $\\prod_v \\mathbb{P}^1(\\Q_v)$ — for <i>any</i> free-product decomposition.</p><p>So no boundary ping-pong can certify the hard example.</p>",
         size=31, lh=1.42, build=4),
], """
~17:00–18:30. A lot of the work was failed attempts at a thinness certificate. We kept them all, with reasons. One failure became a theorem: for a free product that's non-discrete at one place and also in the product of the others, there are no open ping-pong sets on the boundary — so the classical approach provably can't certify our hard example. The agent is good at trying things; somebody has to write down why they failed, or it — or the next agent — will try them again.
""")

slide("database", [
    eyebrow("II · Building it with an AI agent"),
    heading("Where it stands"),
    *[e for i, (big, small, col) in enumerate([("13,305", "S-arithmetic", "accent"), ("5,853", "discrete at some place", "accent2"),
                                                ("3,513", "not Zariski dense", "muted"), ("525", "open", "text")])
      for e in (rect(140 + i * 420, 250, 380, 290, fill="surface", radius=28),
                text("title", 160 + i * 420, 285, 340, 130, f"<p>{big}</p>", align="center", color=col, size=84, autoH=False, valign="middle"),
                text("body", 170 + i * 420, 430, 320, 90, f"<p>{small}</p>", align="center", size=30, lh=1.3))],
    text("body", 140, 600, 1640, 340,
         ul("23,198 groups over $\\Q$ — every pair of small height ($\\sigma_1 \\le 4$) up to symmetry, plus samples.",
            "Also 2,424 pairs over nine number fields (76 open) and 500 random draws (73 open).",
            "The open ones all look thin. What’s missing is a certificate of thinness."),
         size=36, lh=1.45, build=1, buildBy="paragraph"),
], """
~18:30–19:30. Where things stand. Over twenty-three thousand groups over ℚ, all small-height pairs up to symmetry: about 98% decided, each with a checked certificate. The open ones look thin, and the honest summary is that the bottleneck is now mathematical — we need a new kind of certificate — not computational.

(Counts from the database on 21 October 2026, latest decided record per group.)
""")

slide("record", [
    eyebrow("II · Building it with an AI agent"),
    heading("Where did the record of all this live?"),
    text("body", 140, 250, 1640, 420,
         ul("The code: my website’s repository, mostly uncommitted.",
            "The research log: a 140-line memory file the agent wrote for itself.",
            "The results: 46,000 lines of JSON, rewritten as bugs were fixed.",
            "Who wrote which lemma, which certificate, which conclusion: <i>nowhere.</i>"),
         size=40, lh=1.5, build=1, buildBy="paragraph"),
    text("quote", 140, 760, 1640, 160, "<p>That is the problem alphaCentaur is for.</p>", align="center", size=56, color="accent", build=5),
], """
~19:30–20:30. Here's the uncomfortable part. The calculator was built in a coding agent with a shell on my disk. The research log for it is a memory file the agent wrote for itself. The results were rewritten every time a bug was fixed. And nothing records who contributed which idea or which line. For a tool that's fine. For research, it isn't: in three weeks I won't know which claims I checked. That's what alphaCentaur is for, and in the demo we'll move the calculator into it.
""")

# ───────────────────────────────────────────────────── III · alphaCentaur ──
k, _ = asset("home")
slide("what", [
    eyebrow("III · alphaCentaur"),
    heading("One workspace, one project per question"),
    text("body", 140, 250, 590, 640,
         ul("Runs on my Mac: a local web service and a native app. The iPad connects for handwriting.",
            "A project owns its files, its chat and its runs. Nothing leaks between projects.",
            "Bring your own model: Anthropic, OpenAI, Gemini, or a local Ollama."),
         size=36, lh=1.38, build=1, buildBy="paragraph"),
    image(k, 780, 250, 1000, 625, "The alphaCentaur project list"),
], """
~20:30–21:30. alphaCentaur is a local application: a small Node service with a SQLite database, a browser front end and a native Mac wrapper; the iPad pairs with it for handwritten notes. The unit is the project — one per research question — with its own files, its own conversation with the AI and its own computation history. It isn't tied to one AI company.
""")

tiles = [
    ("Notes", "Markdown with live LaTeX, theorem blocks and links"),
    ("Handwriting", "Pencil notebooks on the iPad; the original ink is kept"),
    ("Bibliography", "Annotated references, primary or background; writes the .bib"),
    ("Computations", "Python with SymPy and FLINT, in a sandboxed process"),
    ("Formalization", "Lean 4 against one shared Mathlib, with blueprints"),
    ("Apps", "Interactive tools — now multi-file, with workers"),
    ("Manuscript", "Overleaf-style LaTeX with SyncTeX"),
    ("Presentation", "A slide editor — this talk"),
    ("Activity", "Every revision, run and decision, with who did it"),
]
els = [eyebrow("III · alphaCentaur"), heading("Every kind of research artifact, side by side")]
for i, (name, desc) in enumerate(tiles):
    x, y = 140 + (i % 3) * 560, 250 + (i // 3) * 260
    els += [rect(x, y, 520, 228, fill="surface", radius=24),
            text("heading", x + 36, y + 30, 448, 60, f"<p>{name}</p>", size=42, color="accent"),
            text("body", x + 36, y + 98, 448, 110, f"<p>{desc}</p>", size=30, lh=1.3, color="text")]
slide("sections", els, """
~21:30–22:15. Each project has these sections. Each is a reasonable version of a tool you already use; the point is that they share one store, one history and one AI collaborator.
""")

ko, _ = asset("overview", width=1300)
kp, _ = asset("python", width=1300)
kl, _ = asset("lean", width=1300)
km, _ = asset("manuscript", width=1300)
grid = [(ko, "Notes: live LaTeX"), (kp, "Computations: an AI-written exact check"), (kl, "Formalization: Lean"), (km, "Manuscript: 140 pages, SyncTeX")]
els = [eyebrow("III · alphaCentaur"), heading("A quick tour")]
for i, (key, cap) in enumerate(grid):
    x, y = 140 + (i % 2) * 840, 230 + (i // 2) * 400
    els += [image(key, x, y, 800, 320, cap, radius=12, fit="cover"),
            text("caption", x, y + 326, 800, 50, f"<p>{cap}</p>", size=26)]
slide("tour", els, """
~22:15–23:15. A quick tour, from my real projects: notes with live mathematics (the SO₃(ℚ) classification conjecture), a Python check the AI wrote for the Riley project, a Lean file, and a 140-page manuscript with source and PDF side by side.
""")

slide("rule", [
    eyebrow("III · The rules"),
    text("quote", 140, 250, 1640, 160, "<p>Human and AI edit the same files.</p>", size=80, italic=False, weight=700, font="heading"),
    rect(146, 440, 120, 12, fill="accent", radius=6),
    text("body", 140, 500, 1500, 400,
         "<p>Every editable artifact is shared — except one: " + hl("<code>description.md</code>") + ", which only the human may write.</p>"
         "<p>No forks, no “AI copy” of the paper. A save names the revision it started from; a stale save fails instead of overwriting.</p>",
         size=42, lh=1.4, build=1, buildBy="paragraph"),
], """
~23:15–24:15. Now the rules, which are the point. Rule one: human and AI edit the same files. The first version gave every file an owner — the AI could only edit its own files and had to copy mine. Since 15 September everything is shared, with one exception: the project description, which states the question, and which is mine. [Nic: say why you switched.]

What makes sharing safe is bookkeeping: every save names the revision it started from, and if someone saved in between, it fails and your draft is kept.
""", bg={"kind": "gradient", "color": "bg", "color2": "surface", "angle": 160})

cols = [
    ("Origin", "Who wrote it", "Human, AI, imported (authorship unverified), or mixed — recorded on every revision by the server, never by the model."),
    ("Permission", "Who may edit it", "Shared by default. <code>description.md</code> is human-only. Saved restrictions narrow what the AI may touch."),
    ("Review", "Who checked it", "Adopting, reviewing and checking are recorded separately. Editing a proof doesn’t make it correct."),
]
els = [eyebrow("III · The rules"), heading("Who wrote it, who may edit it, who checked it")]
for i, (name, sub, body) in enumerate(cols):
    x = 140 + i * 560
    els += [rect(x, 250, 520, 620, fill="surface", radius=28, build=i + 1),
            text("heading", x + 40, 290, 440, 70, f"<p>{name}</p>", size=52, color="accent", build=i + 1),
            text("eyebrow", x + 40, 375, 440, 40, f"<p>{sub}</p>", color="muted", build=i + 1),
            text("body", x + 40, 440, 440, 400, f"<p>{body}</p>", size=36, lh=1.4, build=i + 1)]
els.append(text("caption", 140, 915, 1640, 60, "<p>Three separate records. Mixing them up is how “the AI proved it” sneaks into a paper.</p>",
                align="center", size=32, color="text", build=4))
slide("three", els, """
~24:15–25:30. Three things that are easy to blur. Origin: who actually wrote this revision — recorded by the server; the model can't claim to be the human, and imported material I can't vouch for is labelled "authorship unverified". Permission: who may edit. Review: whether anyone checked it — a separate record. An AI editing a proof, or me adopting an AI proposal, says nothing about whether the proof is right.
""")

kn, rn = asset("note", crop=(269, 62, 1115, 862))
ka, ra = asset("activity", crop=(90, 62, 1100, 900))
h = 680
wn, wa = round(h * rn), round(h * ra)
gap = 1640 - wn - wa
slide("provenance", [
    eyebrow("III · The rules"),
    heading("What that looks like"),
    image(kn, 140, 240, wn, h, "An AI-created research note"),
    image(ka, 140 + wn + gap, 240, wa, h, "The project activity log, with human and AI entries"),
    text("caption", 140, 945, wn, 80, "<p>An AI-written note says so: in its label, and in its first line.</p>"),
    text("caption", 140 + wn + gap, 945, wa, 80, "<p>Every change and every run, with who did it.</p>"),
], """
~25:30–26:15. A note the AI wrote in my Riley project: it carries the AI-created label, and its first lines say "AI-assisted working proofs for review… the main conjecture remains open; no priority claim is made." On the right, the activity log, human and AI entries interleaved.
""")

slide("restrictions", [
    eyebrow("III · The rules"),
    heading("Rules the model can’t talk its way out of"),
    text("code", 140, 260, 800, 200,
         "<pre>you › Never edit **/*.tex\nyou › Please never edit \"my notes.md\"\nyou › Do not modify notes/*.md</pre>",
         size=32, autoH=False),
    text("caption", 140, 490, 800, 80, "<p>Plain sentences in the chat. Each becomes a saved rule before the model sees the message.</p>"),
    text("body", 1000, 250, 780, 700,
         ul("Saved in their own table, outside every file the AI can edit.",
            "Included in every run, and checked again on every write — create, edit, rename, adopt.",
            "Only a human can remove one.",
            "Quoted documents and tool results can’t add or remove rules."),
         size=36, lh=1.4, build=1, buildBy="paragraph"),
], """
~26:15–27:15. Restrictions. If I type "never edit any .tex file", that sentence is parsed and saved as a rule before the message even reaches the model. It lives in its own table, and it's checked on every write. The model can't remove it, and text that merely passes through — a pasted paper, a web page, a tool result — can't create or delete one.
""")

slide("evidence", [
    eyebrow("III · The rules"),
    heading("Evidence is append-only"),
    text("code", 140, 260, 900, 400,
         "<pre>CREATE TRIGGER revisions_no_update\n  BEFORE UPDATE ON revisions\n  BEGIN SELECT RAISE(ABORT, 'Immutable revision'); END;\n\n"
         "CREATE TRIGGER revisions_no_delete\n  BEFORE DELETE ON revisions\n  BEGIN SELECT RAISE(ABORT, 'Immutable revision'); END;</pre>",
         size=27, autoH=False),
    text("caption", 140, 690, 900, 60, "<p>The same two triggers guard the audit log and imported originals.</p>"),
    text("body", 1100, 250, 680, 700,
         ul("No revision or audit entry can be changed or deleted — not even by the app.",
            "Imported originals are kept byte for byte.",
            "A build or run records the exact revision of every input: later edits make it stale, never different."),
         size=36, lh=1.4, build=1, buildBy="paragraph"),
], """
~27:15–28:00. History can only grow. Revisions and the audit log are protected by database triggers, so not even a bug in my own code can rewrite them. A computation or a PDF build points at the exact revisions it used; if you edit afterwards, the result is marked stale, but never quietly changes.
""")

slide("toolbox", [
    eyebrow("III · The rules"),
    heading("What the AI can and can’t do"),
    rect(140, 250, 790, 620, fill="surface", radius=28),
    text("heading", 190, 285, 690, 70, "<p>Can</p>", size=50, color="accent2"),
    text("body", 190, 370, 690, 480,
         ul("read the files you select",
            "create and edit files, as itself",
            "propose a revision for review",
            "run Python, LaTeX and Lean in a sandbox",
            "look up references (Crossref)"),
         size=36, lh=1.4),
    rect(990, 250, 790, 620, fill="surface", radius=28, build=1),
    text("heading", 1040, 285, 690, 70, "<p>Can’t</p>", size=50, color="accent", build=1),
    text("body", 1040, 370, 690, 480,
         ul("run a shell, or touch files outside the project",
            "reach the network from a worker",
            "see other projects, or your API keys",
            "edit <code>description.md</code> or anything you’ve restricted",
            "approve its own proposals"),
         size=36, lh=1.4, build=1),
    text("caption", 140, 910, 1640, 60, "<p>Every check is made by the server, on every call — not by asking the model nicely.</p>",
         align="center", size=32, color="text", build=2),
], """
~28:00–29:00. The AI gets a small set of structured tools, not a shell. Contrast that with how the calculator was built: an agent with a shell on my whole disk. That's great for building software and not what I want for research records. None of this depends on the model behaving; the server enforces it on every call.
""")

k, r = asset("chat", crop=(1115, 165, 1440, 705))
slide("report", [
    eyebrow("III · The rules"),
    heading("A report is a claim, not a certificate"),
    image(k, 1780 - round(800 * r), 230, round(800 * r), 800, "The project collaborator reporting a finished Lean proof"),
    text("body", 140, 260, 1060, 660,
         ul("The collaborator says: <i>compiles, no axioms, no sorries, lake build successful.</i>",
            "The workspace makes that checkable without trusting the chat: the Lean file, its revisions, the check and its log are all in the project.",
            "Whether we formalized the theorem we meant is still my job."),
         size=40, lh=1.42, build=1, buildBy="paragraph"),
], """
~29:00–30:00. A collaborator reporting a finished Lean proof. That report is a claim. What the workspace adds is that every piece of it can be checked without trusting the chat. And no tool can tell me whether the Lean statement is the theorem I actually care about.

(This conversation is from the earlier version of alphaCentaur and was imported with the project.)
""")

# ──────────────────────────────────────────────────────────── IV · demo ──
slide("demo", [
    eyebrow("IV · Live demo"),
    heading("The calculator, inside alphaCentaur"),
    text("body", 140, 250, 1640, 700,
         ol("A new project, <b>Presentation Calculator</b>: the question in <code>description.md</code>.",
            "Import the app: 113 files, followed from one <code>index.html</code>.",
            "Run it in <b>Apps</b>, in a sealed origin. Compute two groups.",
            "Ask the collaborator for an <b>independent exact check</b> of the relations.",
            "Lock the app code with a rule.",
            "Read the story back from <b>Activity</b>."),
         size=42, lh=1.5, build=1, buildBy="paragraph"),
], """
~30:00–30:45. Switch to alphaCentaur now. The next six slides are the backup if the demo misbehaves.

Demo script:
1. Home → Presentation Calculator. Overview shows description.md (fill it in before the talk: the four questions from slide 4).
2. Project files: the imported tree. Open PresentationCalc/index.html → Source: the "Imported · authorship unverified" badge, and lines 7–13 where the CDN links were replaced. History shows the lineage note.
3. Preview. Examples → "PGL₂(ℤ[½])" → Compute (graph of groups on T₃, index 2). Then "Modular group PSL₂(ℤ)" (⟨g₁, g₂ | g₂², (g₁g₂)³⟩).
4. Collaborator (prompt on slide 28). Wait for the AI-created script and its run.
5. In the chat: "Never edit PresentationCalc/**". Overview → AI editing restrictions shows it.
6. Activity: import (human, authorship unverified), AI-created script, run, rule.
""")

k, r = asset("live-source", crop=(250, 85, 1440, 520))
slide("import", [
    eyebrow("IV · Live demo"),
    heading("Bringing a 113-file app in"),
    image(k, 140, 230, 1640, round(1640 / r), "The imported index.html with CDN links replaced by project copies"),
    text("body", 140, 230 + round(1640 / r) + 30, 1640, 200,
         ul("<code>scripts/import-app.mjs</code> follows every script, module, worker, stylesheet and font from <code>index.html</code>.",
            "Six CDN links become project copies (KaTeX, jQuery, MathQuill). The originals are kept, and the rewrite is in the file’s lineage."),
         size=32, lh=1.4, build=1, buildBy="paragraph"),
], """
~30:45–32:00 (backup). The import. The calculator depends on four other tools on my site — poincare, the tree code, the discreteness algorithm, the Zariski closure engine — 113 files in all. The import script follows every reference from the entry page. Project apps get no network, so the six CDN links were replaced by project copies; the original bytes are kept, and the replacement is recorded in the file's lineage. Everything is labelled "imported · authorship unverified", because it was written by me and an agent over weeks and nothing recorded who wrote what.
""")

k, _ = asset("live-pcalc")
slide("sealed", [
    eyebrow("IV · Live demo"),
    heading("It runs in a sealed origin"),
    shot_left(k, "The Presentation Calculator running in alphaCentaur's Apps section"),
    side_text(ul("Served from a second local port: its own origin, so it can’t touch the workspace or its API.",
                 "Web workers and ES modules work; the network stops at the project’s own files.",
                 "The URL carries a per-session capability for this project only."),
              size=34, build=1, buildBy="paragraph"),
], """
~32:00–33:30 (backup). Running inside alphaCentaur. Until this week, project apps had to be a single HTML file. The calculator needs modules and eight web workers, so alphaCentaur now serves multi-file apps from a second local port — a separate origin, so the app can't script the workspace or call its API; its content-security policy keeps all traffic on the project's own files; and the URL carries a capability for this project only.
""")

kd, _ = asset("live-details", crop=(373, 230, 1440, 900))
kmod, _ = asset("live-modular", crop=(373, 230, 1440, 900))
slide("results", [
    eyebrow("IV · Live demo"),
    heading("Two groups, two kinds of answer"),
    image(kmod, 140, 240, 800, round(800 * 670 / 1067), "The modular group: a Poincaré presentation"),
    image(kd, 980, 240, 800, round(800 * 670 / 1067), "PGL₂(ℤ[½]) example: arithmetic by coset enumeration"),
    text("caption", 140, 760, 800, 120, r"<p>$\PSL_2(\Z)$: discrete at $\R$, so Poincaré’s theorem gives $\langle g_1, g_2 \mid g_2^2, (g_1 g_2)^3 \rangle$, index 2 in $\PGL_2(\Z)$.</p>", size=28),
    text("caption", 980, 760, 800, 120, r"<p>$\langle T, S, \mathrm{diag}(2,1)\rangle$: discrete nowhere, but index 2 in $\PGL_2(\Z[\tfrac12])$, matching its congruence closure.</p>", size=28),
], """
~33:30–35:00 (backup). The modular group is discrete at the real place, so the presentation comes from Poincaré's polyhedron theorem. The other example is discrete nowhere, so geometry gives nothing directly; arithmetic does: coset enumeration finds index 2, and the congruence closure independently says 2 as well.
""")

slide("check", [
    eyebrow("IV · Live demo"),
    heading("Ask for an independent check"),
    text("code", 140, 250, 1640, 330,
         "<pre>you › The calculator says Γ = ⟨g1 = (1 1; 0 1), g2 = (0 −1; 1 0), g3 = (2 0; 0 1)⟩\n"
         "      has relators x1², σ², (x2 x1)³, x1 x2² x1 σ x2⁻¹ σ, (x2 σ)⁴\n"
         "      where x1 = g2, x2 = g1, σ = g2 g3. Write a Python script that checks,\n"
         "      in exact arithmetic, that each relator is a scalar matrix. Then run it.</pre>",
         size=30, autoH=False),
    text("body", 140, 630, 1640, 330,
         ul("Expect: a new script labelled <b>AI-created</b>, a sandboxed run, output stored with the exact revision.",
            "It checks the relations <i>hold</i>. It does not check that they are <i>all</i> the relations — that’s the calculator’s certificate, and my job to understand."),
         size=36, lh=1.45, build=1, buildBy="paragraph"),
], """
~35:00–38:00. Paste this prompt into the collaborator (copy it from these notes):

The calculator says Γ = ⟨g1 = (1 1; 0 1), g2 = (0 −1; 1 0), g3 = (2 0; 0 1)⟩ has relators x1², σ², (x2 x1)³, x1 x2² x1 σ x2⁻¹ σ, (x2 σ)⁴ where x1 = g2, x2 = g1, σ = g2 g3. Write a Python script that checks, in exact arithmetic, that each relator is a scalar matrix. Then run it.

All five are scalar (−I, −2I, −I, 2I, −4I), checked beforehand. While it runs, point out what to look for: the new file's AI-created label; the run's output stored with the revision. Then the honest caveat: this verifies that the relations hold, not that the presentation is complete.

[Rehearse once: the configured provider is OpenAI (gpt-6-astra). Have this slide as the fallback if the network is down.]
""")

slide("lock", [
    eyebrow("IV · Live demo"),
    heading("Lock the code, keep the history"),
    text("code", 140, 260, 900, 120, "<pre>you › Never edit PresentationCalc/**</pre>", size=34, autoH=False),
    text("body", 140, 430, 900, 500,
         ul("The rule is saved before the model sees the message.",
            "From now on the collaborator can read the calculator, but any write under <code>PresentationCalc/</code> is refused.",
            "Activity shows the whole story: import, run, the AI’s script, the rule."),
         size=36, lh=1.42, build=1, buildBy="paragraph"),
    *card(1100, 260, 680, 620, "The point",
          "<p>The same agent capabilities that built the calculator, but with a record:</p>"
          "<p>what was imported, what the AI wrote, what ran, on which revision, and what it’s allowed to touch.</p>",
          size=36, build=4),
], """
~38:00–40:00. Last step: type "Never edit PresentationCalc/**" in the chat. Show it under Overview → AI editing restrictions. Then open Activity and read the story back.
""")

# ────────────────────────────────────────────── V · for your working groups ──
slide("tractable", [
    eyebrow("V · For your working groups"),
    heading("What has been AI-tractable for me"),
    *card(140, 240, 790, 700, "Good fits",
          ul("Implementing known algorithms at research scale.",
             "Sweeping thousands of examples and sorting the failures.",
             "Cross-checking one method against another.",
             "Exact scripts that verify one specific claim.",
             "Literature lookups, conventions, boilerplate Lean."), color="accent2", size=34),
    *card(990, 240, 790, 700, "Poor fits (so far)",
          ul("Deciding which question matters.",
             "Noticing the structure that makes a problem easy.",
             "Certificates nobody knows how to state yet — like thinness.",
             "Judging whether its own output is a proof."), size=34, build=1),
], """
~40:00–42:30. For the working groups on Saturday and Sunday: here is what has worked for me. The left column is where the agent multiplied what I could do by a large factor. The right column is where it was confidently wrong, or simply couldn't help. A good working-group problem lives on the left, and has a human on the right.
""")

slide("recipe", [
    eyebrow("V · For your working groups"),
    heading("A recipe"),
    text("body", 140, 250, 1640, 720,
         ol("<b>Write the question</b> in a file only you edit.",
            "<b>Ask for tools, not proofs:</b> a calculator, a search, a checker.",
            "<b>Two independent methods</b> for every number you’ll believe.",
            "<b>Keep the dead ends,</b> with the reason each one failed.",
            "<b>Label who wrote what,</b> and keep the history.",
            "<b>Put the rules where the model can’t edit them.</b>"),
         size=42, lh=1.55, build=1, buildBy="paragraph"),
], """
~42:30–44:00. A recipe, which is the talk compressed. You don't need alphaCentaur for any of it — a git repository and some discipline will do — but each step is something I learned by not doing it first.
""")

slide("judgement", [
    eyebrow("V · For your working groups"),
    text("quote", 140, 330, 1640, 200, "<p>Let the machine search.<br>Keep the judgement.</p>", align="center", size=88, italic=False, weight=700, font="heading"),
    rect(900, 590, 120, 12, fill="accent", radius=6),
    text("body", 240, 650, 1440, 200,
         "<p>On the Riley groups the search kept saying “thin?”. The structure said “index 2304”.</p>",
         align="center", size=40, color="muted"),
], """
~44:00–45:00. If you remember one thing: the machine is a superb searcher and a poor judge. The computer kept failing to close coset enumerations, which suggested "thin". A structural argument showed the index was finite and known.
""", bg={"kind": "gradient", "color": "bg", "color2": "surface", "angle": 160})

ke, _ = asset("editor")
slide("meta", [
    eyebrow("One more thing"),
    heading("This talk was made in alphaCentaur"),
    text("body", 140, 250, 800, 700,
         ul("The Presentation section is a slide editor: live LaTeX, images, embeds, live applets, builds, notes.",
            "A deck is one HTML file whose source is a JSON block inside it. The AI collaborator edits only that JSON.",
            "The binary star is an applet: a few dozen lines of JavaScript, sandboxed."),
         size=36, lh=1.4, build=1, buildBy="paragraph"),
    image(ke, 1000, 300, 780, 488, "This deck open in the alphaCentaur slide editor"),
], """
~45:00–45:30. One more thing: these slides were made in alphaCentaur's own slide editor.
""")

slide("next", [
    eyebrow("Next"),
    heading("What’s missing"),
    text("body", 140, 250, 1640, 700,
         ul("<b>A claims ledger:</b> each claim with its status — conjectured, AI-argued, reviewed, Lean-checked, refuted — and what it depends on.",
            "<b>A “your turn” queue</b> for the decisions only I can make.",
            "<b>Negative results as records,</b> so nobody — human or AI — repeats a failed search.",
            "<b>Coauthors:</b> more than one human.",
            "<b>For the calculator:</b> a certificate of thinness."),
         size=42, lh=1.5, build=1, buildBy="paragraph"),
], """
~45:30–46:30. What's next for alphaCentaur: a typed claims ledger, so "the AI argued this" and "this is Lean-checked" can never be confused; a queue of things waiting on me; first-class negative results; and real coauthors. And for the calculator, the mathematical bottleneck: a certificate of thinness.
""")

slide("thanks", [
    applet(orbit(labels=True, names=["you", "AI"]), "Alpha Centauri A and B", 940, 40, 980, 1000),
    text("title", 160, 360, 820, 160, "<p>Thank you</p>", autoH=False, valign="bottom"),
    rect(166, 552, 120, 12, fill="accent", radius=6),
    text("subtitle", 160, 595, 820, 80, "<p>Questions?</p>"),
], """
~46:30. Thank you. Happy to show more of it live, or to help a working group set up a project.
""", bg={"kind": "gradient", "color": "bg", "color2": "surface", "angle": 160})

# ===================================================================== deck ==
deck = {
    "version": 1, "id": "alphacentaurtalk", "title": "alphaCentaur",
    "theme": {"palette": "custom", "fontPair": "editorial",
              "colors": {"bg": "#0d2326", "surface": "#173c40", "text": "#f4f1df", "muted": "#9dbdb5", "accent": "#f2d493", "accent2": "#7cc4b5"},
              "fonts": {"heading": "Fraunces", "body": "Source Sans 3", "mono": "JetBrains Mono"}},
    "settings": {"nav": "linear", "dots": True, "arrows": False, "numbers": True, "progress": True, "speed": 600},
    "assets": assets,
    "slides": slides,
}
json.dump(deck, open(os.path.join(HERE, "deck.json"), "w"))

def plain(s):
    import re, html
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s)
lines = ["# alphaCentaur — talk script (50 minutes)", "",
         "For *Accelerating Mathematical Discovery: A Crash Course in AI and Computation*, Santa Cruz, 28 Oct – 1 Nov 2026.", "",
         "Generated from the speaker notes by `source/make_deck.py`. Once the deck has been",
         "edited in the slide editor, the notes in `index.html` (press N while presenting) are current.", "",
         "Lines marked [Nic: …] are guesses about your own experience: check or replace them.", ""]
for i, s in enumerate(slides, 1):
    title = next((plain(e["html"]) for e in s["elements"] if e["type"] == "text" and e.get("role") in ("heading", "title", "quote")), s["id"])
    lines += [f"## {i}. {title}", "", s["notes"], ""]
open(os.path.join(OUT, "script.md"), "w").write("\n".join(lines))
print("wrote deck.json,", len(slides), "slides,", sum(len(a["data"]) for a in assets.values()) // 1024, "KB of images")
