import marimo

__generated_with = "alphaPy"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    from fractions import Fraction
    from itertools import groupby
    from math import atan, cos, pi, sin
    from time import perf_counter

    import matplotlib.pyplot as plt
    from flint import fmpq, fmpq_mat, fmpz_mat
    return (Fraction, atan, cos, fmpq, fmpq_mat, fmpz_mat, groupby, mo, perf_counter, pi, plt, sin)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # The ping-pong lemma

    Two matrices generate a free group when they can play ping-pong: there are four disjoint sets, one for each of $a, a^{-1}, b, b^{-1}$, and each letter throws the other sets into its own. This notebook tests that idea by computer, with exact arithmetic throughout.

    [[def:reduced]] (Reduced words)
    Let $S = \{a, a^{-1}, b, b^{-1}\}$. A word in $S$ is **reduced** if no letter is next to its inverse. There are $4 \cdot 3^{n-1}$ reduced words of length $n \ge 1$.

    [[thm:ping-pong]] (Ping-pong lemma)
    Let a group $G$ act on a set $X$ and let $a, b \in G$. Suppose $D_a, D_{a^{-1}}, D_b, D_{b^{-1}} \subseteq X$ are nonempty and pairwise disjoint, and $s(D_t) \subseteq D_s$ for all $s, t \in S$ with $t \ne s^{-1}$. Then $a$ and $b$ freely generate a free group of rank $2$.

    The proof is in the notes and the manuscript. In one line: a nonempty reduced word $w$ moves a well-chosen point of some $D_t$ into the set of its first letter, which is disjoint from $D_t$, so $w \ne 1$.

    The sections: **1.** Brenner's family $G_t$ and the four sets. **2.** Every reduced word in Sanov's matrices, multiplied out. **3.** A search for relations in Kim and Koberda's groups $G_q$. **4.** Ping-pong on the projective line. The notebook is reactive: change a widget and the cells that depend on it run again.
    """)
    return


@app.cell
def _(groupby):
    # The four letters are 0, 1, 2, 3 for a, a⁻¹, b, b⁻¹ (or A, A⁻¹, B, B⁻¹).
    # The inverse of letter s is s ^ 1.
    COLORS = ("#d1495b", "#edae49", "#00798c", "#30638e")  # red, amber, teal, blue
    INK, MUTED = "#1f2a36", "#6b7785"
    LETTER_TEX = ("A", "A^{-1}", "B", "B^{-1}")
    SET_TEX = ("D_A", "D_{A^{-1}}", "D_B", "D_{B^{-1}}")

    def inverse(word):
        return tuple(s ^ 1 for s in reversed(word))

    def free_reduce(word):
        """Cancel adjacent inverse pairs until none are left."""
        out = []
        for s in word:
            if out and out[-1] == s ^ 1:
                out.pop()
            else:
                out.append(s)
        return tuple(out)

    def syllables(word, names=("a", "b")):
        """The word as LaTeX powers: (0, 0, 3, 0) is a^{2} b^{-1} a."""
        parts = []
        for s, run in groupby(word):
            k = len(list(run)) * (-1 if s % 2 else 1)
            parts.append(names[s // 2] if k == 1 else f"{names[s // 2]}^{{{k}}}")
        return parts

    def word_tex(word, names=("a", "b")):
        """A word in LaTeX, written as a power when it is one: (a^{2} b^{-1})^{3}."""
        if not word:
            return "1"
        n = len(word)
        for p in range(1, n):
            if n % p == 0 and word == word[:p] * (n // p):
                inner = " ".join(syllables(word[:p], names))
                if len(syllables(word[:p], names)) > 1:
                    inner = f"({inner})"
                return f"{inner}^{{{n // p}}}"
        return " ".join(syllables(word, names))

    def frac_tex(x):
        """A Fraction in LaTeX: 2, -3 or \\frac{7}{4}."""
        if x.denominator == 1:
            return str(x.numerator)
        return ("-" if x < 0 else "") + rf"\frac{{{abs(x.numerator)}}}{{{x.denominator}}}"

    def up_to_sign(M):
        """A flint matrix's entries, the same tuple for M and -M."""
        e = tuple(M.entries())
        return max(e, tuple(-x for x in e))

    def product(word, gens):
        """gens[s₁] gens[s₂] ⋯ gens[sₙ] for the word (s₁, …, sₙ)."""
        M = type(gens[0])([[1, 0], [0, 1]])
        for s in word:
            M = M * gens[s]
        return M
    return (COLORS, INK, LETTER_TEX, MUTED, SET_TEX, frac_tex, free_reduce, inverse, product, syllables, up_to_sign, word_tex)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 1. Brenner's family $G_t$

    For a real number $t$ let
    $$A_t = \mat{1}{t}{0}{1}, \qquad B_t = \mat{1}{0}{t}{1}, \qquad G_t = \gen{A_t, B_t}.$$
    They act on the plane by $A_t(x, y) = (x + ty, y)$ and $B_t(x, y) = (x, tx + y)$. The axes and the diagonals cut the plane into eight wedges, and opposite wedges pair up into four open sets:
    $$D_{A^{\pm 1}} = \{\abs{x} > \abs{y},\ \pm t\,xy > 0\}, \qquad D_{B^{\pm 1}} = \{\abs{y} > \abs{x},\ \pm t\,xy > 0\}.$$

    [[prop:brenner]] (Sanov 1947, Brenner 1955)
    If $\abs{t} \ge 2$, these four sets satisfy the hypotheses of the ping-pong lemma, so $G_t$ is free of rank $2$. Sanov's example is $t = 2$.

    The key inequality: if $\abs{y} > \abs{x}$ then $\abs{x + ty} \ge \abs{t}\abs{y} - \abs{x} > \abs{y}$, and $x + ty$ has the sign of $ty$. So $A_t$ maps $D_B$ and $D_{B^{-1}}$ into $D_A$.

    [[rem:schottky]] (Why four sets)
    The usual Schottky hypothesis $s(X \setminus D_{s^{-1}}) \subseteq D_s$ implies the one in the lemma. With these sets, Sanov's example only satisfies the weaker one: points on the axes and the diagonals are in no $D_s$.

    Below, the twelve containments $s(D_u) \subseteq D_s$ with $u \ne s^{-1}$ are checked exactly on every integer point of each set with $\abs{x}, \abs{y} \le 12$. For $0 < \abs{t} < 2$ some containment fails, and the computation finds a point where it does. At $t = 1$ the group is $G_1 = \SL_2(\Z)$, which is not free: $A_1 B_1^{-1} A_1 = \mat{0}{1}{-1}{0}$ has order $4$.
    """)
    return


@app.cell
def _(mo):
    t_input = mo.ui.number(start=-4, stop=4, step=0.25, value=2, label="$t$ =")
    mo.md(f"**Choose $t$.** {t_input} Then try $t = 1$ or $t = 1.75$.")
    return (t_input,)


@app.cell
def _(Fraction, mo, t_input):
    t = Fraction(str(t_input.value))  # exact: "1.75" is 7/4
    mo.stop(t == 0, mo.callout(mo.md("At $t = 0$ both matrices are the identity, and the four sets are empty."), kind="warn"))

    def act(s, x, y):
        """Letter s (0–3 for A_t, A_t⁻¹, B_t, B_t⁻¹) applied to the point (x, y)."""
        return [(x + t * y, y), (x - t * y, y), (x, t * x + y), (x, y - t * x)][s]

    def region(x, y):
        """The set containing (x, y) as a letter 0–3 (D_A, D_A⁻¹, D_B, D_B⁻¹), or None."""
        sign = t * x * y
        if sign == 0 or abs(x) == abs(y):
            return None
        return (0 if abs(x) > abs(y) else 2) + (0 if sign > 0 else 1)

    box = 12
    sample = {s: [(x, y) for x in range(-box, box + 1) for y in range(-box, box + 1) if region(x, y) == s]
              for s in range(4)}

    # failures[s, u]: the sample points p of D_u with s(p) outside D_s (u ≠ s⁻¹).
    failures = {}
    for _s in range(4):
        for _u in range(4):
            if _u != _s ^ 1:
                failures[_s, _u] = [p for p in sample[_u] if region(*act(_s, *p)) != _s]
    _total = sum(len(sample[u]) for _, u in failures)
    _failed = sum(len(f) for f in failures.values())
    print(f"t = {t}: {_total} checks of s(D_u) ⊆ D_s on sample points, {_total - _failed} passed, {_failed} failed")
    return (act, box, failures, region, sample, t)


@app.cell
def _(COLORS, INK, MUTED, SET_TEX, act, box, cos, failures, frac_tex, mo, pi, plt, region, sample, sin, t):
    _gen = ("A_t", "A_t^{-1}", "B_t", "B_t^{-1}")
    _total = sum(len(sample[u]) for _, u in failures)
    _passed = _total - sum(len(f) for f in failures.values())

    # Row s, column D_u: how many sample points p of D_u have s(p) in D_s.
    _rows = ["| | " + " | ".join(f"${SET_TEX[u]}$" for u in range(4)) + " |", "| --- " * 5 + "|"]
    for _s in range(4):
        _cells = []
        for _u in range(4):
            if (_s, _u) not in failures:
                _cells.append("—")
            else:
                _n = len(sample[_u])
                _ok = _n - len(failures[_s, _u])
                _cells.append(f"{_ok}/{_n} {'✓' if _ok == _n else '✗'}")
        _rows.append(f"| ${_gen[_s]}$ | " + " | ".join(_cells) + " |")
    _table = mo.md("\n".join(_rows) + "\n\n*Row $s$, column $D_u$: sample points $p \\in D_u$ with $s(p) \\in D_s$.*")

    # The smallest failure, if there is one: (size, s, u, p).
    _fails = [(abs(p[0]) + abs(p[1]), s, u, p) for (s, u), ps in failures.items() for p in ps]
    _example = min(_fails) if _fails else None

    _fig, _ax = plt.subplots(figsize=(4.6, 4.6))
    _lim = box + 0.5
    if _example:
        _, _s, _u, _p = _example
        _img = act(_s, *_p)
        _lim = max(_lim, float(abs(_img[0])) + 1.5, float(abs(_img[1])) + 1.5)
    for _k in range(8):  # the eight wedges between the axes and the diagonals
        _a0, _a1 = _k * pi / 4, (_k + 1) * pi / 4
        _w = region(cos(_a0 + pi / 8), sin(_a0 + pi / 8))
        _ax.fill([0, 3 * _lim * cos(_a0), 3 * _lim * cos(_a1)], [0, 3 * _lim * sin(_a0), 3 * _lim * sin(_a1)],
                 color=COLORS[_w], alpha=0.13, lw=0)
    for _d in [(1, 0), (0, 1), (1, 1), (1, -1)]:
        _ax.axline((0, 0), _d, color=MUTED, lw=0.6, zorder=1)
    for _s in range(4):
        _ax.scatter([float(x) for x, _ in sample[_s]], [float(y) for _, y in sample[_s]], s=7,
                    color=COLORS[_s], label=f"${SET_TEX[_s]}$", zorder=2)
    if _example:
        _, _s, _u, _p = _example
        _img = act(_s, *_p)
        _ax.annotate("", xy=(float(_img[0]), float(_img[1])), xytext=(float(_p[0]), float(_p[1])),
                     arrowprops=dict(arrowstyle="->", color=INK, lw=1.4), zorder=5)
        _ax.scatter([float(_p[0])], [float(_p[1])], s=80, facecolors="none", edgecolors=INK, lw=1.5, zorder=5)
        _ax.scatter([float(_img[0])], [float(_img[1])], s=60, marker="X", color=INK, zorder=5)
        _box = dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.85)
        _ax.annotate("$p$", (float(_p[0]), float(_p[1])), xytext=(-8, -16), textcoords="offset points",
                     fontsize=11, bbox=_box, zorder=6)
        _ax.annotate(rf"${_gen[_s]}\,p$", (float(_img[0]), float(_img[1])), xytext=(8, 6),
                     textcoords="offset points", fontsize=11, bbox=_box, zorder=6)
    _ax.set(xlim=(-_lim, _lim), ylim=(-_lim, _lim), aspect="equal")
    _ax.set_title(rf"$t = {frac_tex(t)}$", fontsize=11)
    _ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.07), ncol=4, frameon=False, fontsize=10,
               handletextpad=0.1, columnspacing=1)
    for _side in ("top", "right"):
        _ax.spines[_side].set_visible(False)
    _ax.tick_params(labelsize=8, colors=MUTED)

    _summary = f"**{_passed:,} of {_total:,}** checks pass at $t = {frac_tex(t)}$."
    if not _fails:
        _note = mo.callout(mo.md(_summary + " Every sample point lands where ping-pong says it should."
                                 + (" A finite sample is not a proof; the inequality above is." if abs(t) >= 2 else
                                    " For $0 < \\abs{t} < 2$ some point of the plane still fails, just not one in this sample.")),
                           kind="success" if abs(t) >= 2 else "neutral")
    else:
        _, _s, _u, _p = _example
        _img = act(_s, *_p)
        _where = region(*_img)
        _image = f"${_gen[_s]}\\,p = ({frac_tex(_img[0])}, {frac_tex(_img[1])})"
        _line = "a diagonal" if abs(_img[0]) == abs(_img[1]) else "an axis"
        _lands = (f"{_image} \\in {SET_TEX[_where]}$, not in ${SET_TEX[_s]}$" if _where is not None else
                  f"{_image}$ lies on {_line}, so it is not in ${SET_TEX[_s]}$")
        _note = mo.callout(mo.md(
            f"{_summary} The smallest failure: $p = ({frac_tex(_p[0])}, {frac_tex(_p[1])}) \\in {SET_TEX[_u]}$, "
            f"but {_lands}. "
            "So these four sets don't play ping-pong for this $t$. That alone doesn't decide whether $G_t$ is free: "
            "$G_1 = \\SL_2(\\Z)$ is not, but $G_t$ is free for every transcendental $t$ (a word equal to $I$ at a "
            "transcendental $t$ would equal $I$ at every $t$, including $t = 2$)."), kind="warn")
    mo.vstack([_note, mo.hstack([_table, _fig], gap=2, align="start")], gap=1)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 2. Reduced words in Sanov's group

    Take $t = 2$: Sanov's matrices $A = \mat{1}{2}{0}{1}$ and $B = \mat{1}{0}{2}{1}$. By ping-pong, no nonempty reduced word in $A$ and $B$ is the identity. The next cells check this head-on: they multiply out every reduced word of length at most $n$ with python-flint's exact integer matrices (`fmpz_mat`), count the words of each length, and look for products equal to $\pm I$.

    They also check something stronger. A nonempty reduced word $w$ of length at most $2n$ splits as $w = uv^{-1}$ with $u \ne v$ reduced of length at most $n$, and $w = \pm I$ exactly when $u = \pm v$. So if the reduced words of length at most $n$ all have different products, even up to sign, then no nonempty reduced word of length at most $2n$ is $\pm I$. Section 3 turns this around to search for relations.

    Switch to the modular group, $t = 1$, to see what happens when ping-pong fails.
    """)
    return


@app.cell
def _(mo):
    matrices = mo.ui.dropdown({"Sanov (free)": 2, "modular group (not free)": 1}, value="Sanov (free)",
                              label="Matrices")
    max_length = mo.ui.slider(1, 10, value=8, label="Longest word $n$")
    mo.hstack([matrices, max_length], gap=2)
    return (matrices, max_length)


@app.cell
def _(fmpz_mat, matrices, max_length, mo, perf_counter, up_to_sign, word_tex):
    _t, _n = matrices.value, max_length.value
    _gens = [fmpz_mat([[1, _t], [0, 1]]), fmpz_mat([[1, -_t], [0, 1]]),
             fmpz_mat([[1, 0], [_t, 1]]), fmpz_mat([[1, 0], [-_t, 1]])]
    _one = fmpz_mat([[1, 0], [0, 1]])
    _start = perf_counter()

    # Grow the reduced words one letter at a time, keeping each product.
    _level = [((), _one)]
    _seen = {up_to_sign(_one)}  # the different products up to sign, empty word included
    word_counts, _trivial = [], []
    for _k in range(1, _n + 1):
        _level = [(w + (s,), M * _gens[s]) for w, M in _level for s in range(4) if not w or s != w[-1] ^ 1]
        _hits = [(w, "I" if M == _one else "-I") for w, M in _level if M == _one or M == -_one]
        _trivial += _hits
        _seen.update(up_to_sign(M) for _, M in _level)
        word_counts.append((_k, len(_level), len(_hits), len(_seen), 2 * 3**_k - 1))
    print(f"{word_counts[-1][4] - 1:,} reduced words of length 1 to {_n} in {perf_counter() - _start:.2f} s; "
          f"{len(_trivial)} equal ±I; {len(_seen):,} different products up to sign (with the empty word)")

    _rows = [r"| $k$ | reduced words | $4 \cdot 3^{k-1}$ | equal to $\pm I$ | different products, lengths $\le k$ |",
             "| ---: | ---: | ---: | ---: | ---: |"]
    _rows += [f"| {k} | {c:,} | {4 * 3**(k - 1):,} | {z:,} | {d:,} of {tot:,} |" for k, c, z, d, tot in word_counts]
    _ok_counts = all(c == 4 * 3**(k - 1) for k, c, _, _, _ in word_counts)
    _total = word_counts[-1][4]
    if not _trivial and len(_seen) == _total:
        _verdict = (rf"Every count is $4 \cdot 3^{{k-1}}$ {'✓' if _ok_counts else '✗'}, no product is $\pm I$ ✓, "
                    rf"and the {_total:,} reduced words of length at most {_n} (the empty word included) have "
                    rf"{_total:,} different products up to sign ✓. So no nonempty reduced word of length at most "
                    rf"{2 * _n} is $\pm I$.")
    else:
        _first = (rf", the first at length {len(_trivial[0][0])}: "
                  rf"${word_tex(_trivial[0][0], ('A', 'B'))} = {_trivial[0][1]}$" if _trivial else "")
        _verdict = (rf"Every count is $4 \cdot 3^{{k-1}}$ {'✓' if _ok_counts else '✗'}, but {len(_trivial):,} products "
                    rf"are $\pm I${_first}. The {_total:,} words of length at most {_n} have only {len(_seen):,} "
                    rf"different products up to sign. So $A$ and $B$ do not generate a free group here.")
    mo.md("\n".join(_rows) + "\n\n" + _verdict)
    return (word_counts,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 3. Relations for rational $q$

    Kim and Koberda normalize differently: $a = \mat{1}{0}{1}{1}$, $b_q = \mat{1}{q}{0}{1}$ and $G_q = \gen{a, b_q}$. Conjugating by a diagonal matrix shows that $G_q$ is conjugate to $G_t$ when $q = t^2$, so Sanov's group is $q = 4$.

    [[prop:free-large-q]] (Free for large $q$)
    If $\abs{q} \ge 4$ then $G_q$ is free. Take $U = \{\abs{x} > 2\abs{y}\}$ and $V = \{\abs{x} < 2\abs{y}\}$: for $n \ne 0$, $a^n(U) \subseteq V$ and $b_q^n(V) \subseteq U$, and the two-set ping-pong lemma applies to $\gen{b_q}$ and $\gen{a}$.

    [[q:rational]] (Open)
    Is $G_q$ non-free for every nonzero rational $q$ with $\abs{q} < 4$? Kim and Koberda prove that it is when $q = s/r$ in lowest terms with $\abs{s} \le 27$, except possibly $s = 24$.

    Non-free means there is a **relation**: a nonempty reduced word $w$ in $a, b$ (with $b = b_q$) such that $w = I$. The search below looks for $w = \pm I$, which is enough: if $w = -I$ then $w^2 = I$.

    [[rem:meet-in-the-middle]] (Meet in the middle)
    Two different reduced words $u, v$ of length at most $L$ with $u = \pm v$ give the relation $uv^{-1}$, freely reduced, of length at most $2L$. Conversely, every relation of length $m \le 2L$ splits as $uv^{-1}$ with $u$ and $v$ of length about $m/2$. So comparing the products of the $2 \cdot 3^L - 1$ reduced words of length at most $L$ finds every relation of length at most $2L$, without trying all $4 \cdot 3^{2L-1}$ words of length $2L$.
    """)
    return


@app.cell
def _(mo):
    q_text = mo.ui.text(value="3/2", label="$q$ =", placeholder="a fraction")
    search_length = mo.ui.slider(1, 10, value=8, label="Half-length $L$")
    mo.md(f"**Choose $q$ and how far to search.** {q_text} {search_length}")
    return (q_text, search_length)


@app.cell
def _(Fraction, frac_tex, mo, q_text):
    try:
        q = Fraction(q_text.value.strip().replace(" ", "").replace("−", "-"))
    except (ValueError, ZeroDivisionError):
        q = None
    mo.stop(q is None, mo.callout(mo.md(f"“{q_text.value}” isn't a rational number. Write it like `3/2` or `-17/5`."),
                                  kind="warn"))

    if abs(q) >= 4:
        # Check the ping-pong containments exactly on sample points, for 1 ≤ |n| ≤ 3.
        def _in_U(x, y):
            return abs(x) > 2 * abs(y)

        def _in_V(x, y):
            return abs(x) < 2 * abs(y)

        _checked = _passed = 0
        for _n in (-3, -2, -1, 1, 2, 3):
            for _x in range(-12, 13):
                for _y in range(-12, 13):
                    if _in_U(_x, _y):  # a^n (x, y) = (x, nx + y)
                        _checked, _passed = _checked + 1, _passed + _in_V(_x, _n * _x + _y)
                    elif _in_V(_x, _y):  # b_q^n (x, y) = (x + nqy, y)
                        _checked, _passed = _checked + 1, _passed + _in_U(_x + _n * q * _y, _y)
        print(f"q = {q}: {_checked} ping-pong checks with 1 ≤ |n| ≤ 3, {_passed} passed")
        mo.stop(True, mo.callout(mo.md(
            rf"**$G_q$ is free.** Since $\abs{{q}} = {frac_tex(abs(q))} \ge 4$, ping-pong applies with "
            r"$U = \{\abs{x} > 2\abs{y}\}$ and $V = \{\abs{x} < 2\abs{y}\}$. For $n \ne 0$, $a^n(U) \subseteq V$ "
            r"because $\abs{nx + y} \ge \abs{x} - \abs{y} > \abs{x}/2$, and $b_q^n(V) \subseteq U$ because "
            r"$\abs{x + nqy} \ge 4\abs{y} - \abs{x} > 2\abs{y}$. "
            rf"Checked exactly on sample points with $1 \le \abs{{n}} \le 3$: {_passed:,} of {_checked:,} pass. "
            "No relation to search for."), kind="success"))

    _s = abs(q.numerator)
    if q == 0:
        _covered = r"Here $b_q = I$, so $G_q = \gen{a}$ is cyclic."
    elif _s <= 27 and _s != 24:
        _covered = rf"Kim and Koberda's theorem covers it ($\abs{{s}} = {_s} \le 27$), so a relation exists."
    else:
        _covered = r"Kim and Koberda's theorem does not cover it."
    mo.md(rf"$q = {frac_tex(q)}$ has $\abs{{q}} < 4$, so the sets $U$ and $V$ no longer work. {_covered}")
    return (q,)


@app.cell
def _(fmpq, fmpq_mat, frac_tex, free_reduce, inverse, mo, perf_counter, product, q, search_length, syllables, up_to_sign, word_tex):
    _L = search_length.value
    _q = fmpq(q.numerator, q.denominator)
    _gens = [fmpq_mat([[1, 0], [1, 1]]), fmpq_mat([[1, 0], [-1, 1]]),
             fmpq_mat([[1, _q], [0, 1]]), fmpq_mat([[1, -_q], [0, 1]])]
    _one = fmpq_mat([[1, 0], [0, 1]])
    _start = perf_counter()

    # Breadth first: each product up to sign remembers the first word that reached it.
    # A later word with the same product is a coincidence (u, v). Finish the level where
    # the first coincidence appears: its shortest relations are the shortest there are.
    _first = {up_to_sign(_one): ()}
    _level, _hits, _k = [((), _one)], [], 0
    while _k < _L and not _hits:
        _k += 1
        _next = []
        for _w, _M in _level:
            for _s in range(4):
                if _w and _s == _w[-1] ^ 1:
                    continue
                _u, _N = _w + (_s,), _M * _gens[_s]
                _key = up_to_sign(_N)
                if _key in _first:
                    _hits.append((_u, _first[_key]))
                else:
                    _first[_key] = _u
                    _next.append((_u, _N))
        _level = _next
    _seconds = perf_counter() - _start
    print(f"q = {q}: {len(_first):,} different products of reduced words of length ≤ {_k}, "
          f"{len(_hits)} coincidences, {_seconds:.2f} s")

    mo.stop(not _hits, mo.callout(mo.md(
        rf"**No relation of length at most {2 * _L}.** The {len(_first):,} reduced words of length at most {_L} "
        rf"have different products, even up to sign, so no nonempty reduced word of length at most {2 * _L} is $\pm I$. "
        "This does not show that $G_q$ is free: a relation could be longer. Move $L$ up to search further."),
        kind="info"))

    # Among the coincidences, the shortest relations; show the one with the fewest syllables.
    def _relation(hit):
        return free_reduce(hit[0] + inverse(hit[1]))

    _m = min(len(_relation(h)) for h in _hits)
    _u, _v = min((h for h in _hits if len(_relation(h)) == _m),
                 key=lambda h: (len(syllables(_relation(h))), _relation(h)))
    relation = _relation((_u, _v))
    _P = product(relation, _gens)
    _sign = "I" if _P == _one else "-I" if _P == -_one else None
    assert _sign, "the relation does not multiply out to ±I"
    print(f"u = {_u}, v = {_v}, relation of length {_m}: {relation} = {_sign}")

    # Why no relation is shorter: none has length ≤ 2(k - 1), since level k - 1 had no coincidence,
    # and one of length 2k - 1 would be some u of length k meeting the first word v of length k - 1
    # with its product, a coincidence the search records.
    if _m == 1:
        _shortest = "No relation can be shorter."
    elif _k == 1:
        _shortest = r"No single letter is $\pm I$, so no relation is shorter."
    elif _m == 2 * _k - 1:
        _shortest = (f"No two words of length at most {_k - 1} have the same product up to sign, "
                     f"so no relation is shorter than {_m}.")
    else:
        _shortest = (f"No two words of length at most {_k - 1} have the same product up to sign, so no relation is "
                     f"shorter than {_m - 1}, and one of length {_m - 1} would have shown up here as a word of "
                     f"length {_k} meeting one of length {_k - 1}. So no relation is shorter than {_m}.")
    _square = (r" Since it is $-I$, its square is a relation of length "
               rf"{2 * _m} equal to $I$." if _sign == "-I" else "")
    _uv = "u = v" if product(_u, _gens) == product(_v, _gens) else "u = -v"
    mo.md(rf"""
    At half-length {_k}, two different reduced words have the same product up to sign:
    $$u = {word_tex(_u)}, \qquad v = {word_tex(_v)}, \qquad {_uv}.$$
    So $u v^{{-1}}$ freely reduces to a relation of length **{_m}**:
    $$ {word_tex(relation)} = {_sign}.$$
    {_shortest} Multiplying it out exactly with `fmpq_mat` gives
    $\mat{{{frac_tex(_P[0, 0])}}}{{{frac_tex(_P[0, 1])}}}{{{frac_tex(_P[1, 0])}}}{{{frac_tex(_P[1, 1])}}}$ ✓.{_square}
    So $G_q$ is not free on $a$ and $b_q$.
    """)
    return (relation,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 4. Ping-pong on the projective line

    Sanov's matrices also act on the lines through the origin, which form the projective line $\RP^1 = \R \cup \{\infty\}$: the line through $(x, y)$ is the point $z = x/y$, and $\mat{\alpha}{\beta}{\gamma}{\delta}$ acts by $z \mapsto (\alpha z + \beta)/(\gamma z + \delta)$. So $A(z) = z + 2$ and $B(z) = z/(2z + 1)$. The four wedges become four arcs:
    $$D_A = (1, \infty), \quad D_{A^{-1}} = (-\infty, -1), \quad D_B = (0, 1), \quad D_{B^{-1}} = (-1, 0).$$
    Start at $x_0 = 2/5 \in D_B$. Ping-pong says that for every reduced word $w = s_1 s_2 \cdots s_n$ whose last letter $s_n$ is not $B^{-1}$, the point $w x_0$ lies in $D_{s_1}$. The figure puts $\RP^1$ on a circle and colors each $w x_0$ by its first letter $s_1$; the cell checks every point exactly with Python's fractions.
    """)
    return


@app.cell
def _(mo):
    orbit_length = mo.ui.slider(1, 8, value=6, label="Words up to length")
    show_rings = mo.ui.checkbox(value=True, label="One ring per word length")
    return (orbit_length, show_rings)


@app.cell
def _(Fraction, orbit_length):
    SANOV = (((1, 2), (0, 1)), ((1, -2), (0, 1)), ((1, 0), (2, 1)), ((1, 0), (-2, 1)))

    def mobius(M, z):
        """M acting on z in Q ∪ {∞}, with None for ∞."""
        (al, be), (ga, de) = M
        if z is None:
            return None if ga == 0 else Fraction(al, ga)
        num, den = al * z + be, ga * z + de
        return None if den == 0 else num / den

    def arc(z):
        """The arc containing z, as a letter 0–3 (D_A, D_A⁻¹, D_B, D_B⁻¹), or None."""
        if z is None or z in (0, 1, -1):
            return None
        if z > 1:
            return 0
        if z < -1:
            return 1
        return 2 if z > 0 else 3

    x0 = Fraction(2, 5)
    # orbit: (length n, first letter s₁, w x₀) for reduced w = s₁ ⋯ sₙ with sₙ ≠ B⁻¹.
    # Words grow by adding a new first letter.
    _layer = [(s, mobius(SANOV[s], x0)) for s in range(3)]
    orbit = [(1, s, z) for s, z in _layer]
    for _n in range(2, orbit_length.value + 1):
        _layer = [(s, mobius(SANOV[s], z)) for f, z in _layer for s in range(4) if s != f ^ 1]
        orbit += [(_n, s, z) for s, z in _layer]
    _good = sum(arc(z) == s for _, s, z in orbit)
    print(f"{len(orbit):,} points w x0, {_good:,} in the arc of their first letter")
    return (SANOV, arc, mobius, orbit, x0)


@app.cell
def _(COLORS, INK, LETTER_TEX, MUTED, SET_TEX, arc, atan, cos, mo, orbit, orbit_length, pi, plt, show_rings, sin, x0):
    def _angle(z):  # z ↦ 2 arctan z, with 0 at the top and 1 on the right
        return pi if z is None else 2 * atan(z)

    _n = orbit_length.value
    _fig, _ax = plt.subplots(figsize=(4.8, 4.8))
    _gap = 0.04
    for _s, (_lo, _hi) in enumerate([(pi / 2, pi), (pi, 3 * pi / 2), (0, pi / 2), (-pi / 2, 0)]):
        _ts = [_lo + _gap + (_hi - _lo - 2 * _gap) * i / 60 for i in range(61)]
        _ax.plot([sin(a) for a in _ts], [cos(a) for a in _ts], color=COLORS[_s], lw=6, solid_capstyle="butt")
        _mid = (_lo + _hi) / 2
        _ax.text(1.2 * sin(_mid), 1.2 * cos(_mid), f"${SET_TEX[_s]}$", ha="center", va="center",
                 fontsize=12, color=COLORS[_s])
    for _a, _label in [(0, "0"), (pi / 2, "1"), (pi, r"\infty"), (-pi / 2, "-1")]:
        _ax.text(1.12 * sin(_a), 1.12 * cos(_a), f"${_label}$", ha="center", va="center", fontsize=10, color=MUTED)

    def _radius(k):
        return 0.93 - 0.62 * (k - 1) / max(1, _n - 1) if show_rings.value and _n > 1 else 0.93

    if show_rings.value:
        for _k in range(1, _n + 1):
            _ax.add_patch(plt.Circle((0, 0), _radius(_k), fill=False, color=MUTED, lw=0.3, alpha=0.5))
    for _s in range(4):
        _pts = [(_radius(k) * sin(_angle(z)), _radius(k) * cos(_angle(z))) for k, s, z in orbit if s == _s]
        if _pts:
            _ax.scatter(*zip(*_pts), s=6 if len(orbit) > 2000 else 12, color=COLORS[_s], lw=0, zorder=3)
    _ax.scatter([sin(_angle(x0))], [cos(_angle(x0))], s=50, color=INK, zorder=4)
    _ax.annotate("$x_0$", (sin(_angle(x0)), cos(_angle(x0))), xytext=(-16, -12), textcoords="offset points",
                 fontsize=11, color=INK)
    _ax.set(xlim=(-1.35, 1.35), ylim=(-1.35, 1.35), aspect="equal")
    _ax.axis("off")

    _rows = [r"| first letter $s_1$ | points $w x_0$ | in $D_{s_1}$ |", "| --- | ---: | ---: |"]
    for _s in range(4):
        _mine = [z for _, s, z in orbit if s == _s]
        _in = sum(arc(z) == _s for z in _mine)
        _rows.append(f"| ${LETTER_TEX[_s]}$ | {len(_mine):,} | {_in:,} {'✓' if _in == len(_mine) else '✗'} |")
    _rows.append(f"\nWords of length {'1 to ' if _n > 1 else ''}{_n} not ending in $B^{{-1}}$."
                 + (" The ring for length $k$ is drawn inside the one for $k - 1$; the outer circle is $\\RP^1$."
                    if show_rings.value and _n > 1 else ""))
    mo.hstack([mo.md("\n".join(_rows)), mo.vstack([_fig, show_rings, orbit_length])], gap=2, align="start")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Things to try

    - In section 1, set $t = 1$, $1.75$ or $-2.5$. Negative $t$ swaps which wedges belong to $A_t$ and $A_t^{-1}$.
    - In section 2, switch to the modular group: the first products equal to $\pm I$ appear at length $6$. The counting cell prints to its console.
    - In section 3, try $q = 1$, $2$, $3$, $1/2$, $5/2$ (it needs $L = 8$) and $17/5$. For $q = 17/5$ Kim and Koberda's theorem says a relation exists, but at $L = 10$ the search shows that none has length at most $20$. A $q$ with $\abs{q} \ge 4$, like $9/2$, stops with the ping-pong certificate instead.
    - Add a cell (Alt+Enter) that uses `relation`, `word_counts`, `orbit` or `mobius`: a name defined in one cell can be used in every other. Names starting with `_` stay private to their cell.
    - **Record run** runs the notebook from scratch and keeps a log of every cell, with its figures.
    """)
    return


if __name__ == "__main__":
    app.run()
