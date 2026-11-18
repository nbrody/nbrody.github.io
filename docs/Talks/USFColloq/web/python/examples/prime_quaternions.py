import marimo

__generated_with = "alphaPy"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    import re
    from math import cos, isqrt, sin, tau

    import matplotlib.pyplot as plt
    from flint import fmpz, nmod_mat
    return (cos, fmpz, isqrt, mo, nmod_mat, plt, re, sin, tau)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Prime quaternions above $p$

    A **Lipschitz quaternion** is $q = a + b\mathbf{i} + c\mathbf{j} + d\mathbf{k}$ with $a, b, c, d \in \mathbb{Z}$. Its conjugate is $\bar q = a - b\mathbf{i} - c\mathbf{j} - d\mathbf{k}$, and its norm $N(q) = q\bar q = a^2 + b^2 + c^2 + d^2$ is multiplicative. A quaternion of norm $p$ is a **prime above** $p$.

    [[thm:jacobi]] (Jacobi's four-square theorem)
    An odd prime $p$ is a sum of four squares in exactly $8(p + 1)$ ways.

    The eight units $\pm 1, \pm\mathbf{i}, \pm\mathbf{j}, \pm\mathbf{k}$ permute these solutions, so up to units there are $p + 1$ primes above $p$. This notebook finds them, matches them with the points of the projective line $\mathbb{P}^1(\mathbb{F}_p)$, and checks that they generate a free group. It follows the conventions of the quaternionCalculator.

    The notebook is reactive: change $p$ and every cell that depends on it runs again.
    """)
    return


@app.cell
def _(mo):
    p_input = mo.ui.number(start=3, stop=499, step=2, value=13, label="$p$ =")
    mo.md(f"**Choose an odd prime.** {p_input}")
    return (p_input,)


@app.cell
def _(fmpz, mo, p_input):
    p = p_input.value
    _factors = r" \cdot ".join(f"{q}^{{{e}}}" if e > 1 else f"{q}" for q, e in fmpz(p).factor())
    mo.stop(
        not fmpz(p).is_prime(),
        mo.callout(mo.md(f"**${p} = {_factors}$ is not prime.** Try 13, 19 or 101."), kind="warn"),
    )
    mo.md(rf"$p = {p}$ is prime, and $p \equiv {p % 4} \pmod 4$.")
    return (p,)


@app.cell
def _():
    # A quaternion is a tuple (a, b, c, d), meaning a + bi + cj + dk.
    UNITS = [(1, 0, 0, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, -1, 0, 0),
             (0, 0, 1, 0), (0, 0, -1, 0), (0, 0, 0, 1), (0, 0, 0, -1)]

    def mul(q, r):
        a1, b1, c1, d1 = q
        a2, b2, c2, d2 = r
        return (a1*a2 - b1*b2 - c1*c2 - d1*d2,
                a1*b2 + b1*a2 + c1*d2 - d1*c2,
                a1*c2 - b1*d2 + c1*a2 + d1*b2,
                a1*d2 + b1*c2 - c1*b2 + d1*a2)

    def conj(q):
        return (q[0], -q[1], -q[2], -q[3])

    def norm(q):
        return sum(x * x for x in q)

    def tex(q, plain=False):
        """q written out: LaTeX as quaternionCalculator writes it, or plain text."""
        letters = "", "i", "j", "k"
        if not plain:
            letters = "", r"\mathbf{i}", r"\mathbf{j}", r"\mathbf{k}"
        terms = [("-" if x < 0 else "+", ("" if abs(x) == 1 and u else str(abs(x))) + u)
                 for x, u in zip(q, letters) if x]
        if not terms:
            return "0"
        first = ("-" if terms[0][0] == "-" else "") + terms[0][1]
        return first + "".join(f" {sign} {t}" for sign, t in terms[1:])
    return (UNITS, conj, mul, norm, tex)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 1. Sums of four squares

    Search $|a|, |b|, |c| \le \sqrt p$ and solve for $d$. Each prime has exactly one associate with $a > 0$ odd and, when $p \equiv 3 \pmod 4$, $d$ even. Those are the **canonical** primes: $b, c, d$ are even when $p \equiv 1 \pmod 4$, and $b, c$ are odd when $p \equiv 3 \pmod 4$.
    """)
    return


@app.cell
def _(isqrt, mo, p):
    def four_squares(n):
        """Every (a, b, c, d) with a² + b² + c² + d² = n."""
        r = isqrt(n)
        out = []
        for a in range(-r, r + 1):
            for b in range(-r, r + 1):
                for c in range(-r, r + 1):
                    d2 = n - a*a - b*b - c*c
                    if d2 >= 0 and isqrt(d2) ** 2 == d2:
                        d = isqrt(d2)
                        out += [(a, b, c, d), (a, b, c, -d)] if d else [(a, b, c, 0)]
        return out

    def canonical(q):
        a, b, c, d = q
        return a > 0 and a % 2 == 1 and (p % 4 == 1 or d % 2 == 0)

    solutions = four_squares(p)
    primes = [q for q in solutions if canonical(q)]
    print(f"{len(solutions)} solutions of a² + b² + c² + d² = {p}, {len(primes)} canonical")

    _ok = len(solutions) == 8 * (p + 1) and len(primes) == p + 1
    mo.md(rf"""
    There are **{len(solutions)}** $= 8 \cdot {p + 1}$ solutions, as Jacobi's theorem says,
    and **{len(primes)}** canonical primes above {p}. {'✓' if _ok else '✗'}
    """)
    return (canonical, four_squares, primes, solutions)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 2. Quaternions mod $p$ are matrices

    Choose $x_0, y_0$ with $x_0^2 + y_0^2 \equiv -1 \pmod p$: the smallest $x_0$, then the smallest $y_0$. Then

    $$\mathbf{i} \mapsto \begin{pmatrix} x_0 & y_0 \\ y_0 & -x_0 \end{pmatrix}, \qquad \mathbf{j} \mapsto \begin{pmatrix} -y_0 & x_0 \\ x_0 & y_0 \end{pmatrix}, \qquad \mathbf{k} \mapsto \begin{pmatrix} 0 & -1 \\ 1 & 0 \end{pmatrix}$$

    is an isomorphism from the quaternions over $\mathbb{F}_p$ to the $2 \times 2$ matrices, and the determinant of $q$'s matrix is $N(q)$. The matrices are python-flint `nmod_mat`s.
    """)
    return


@app.cell
def _(fmpz, mo, nmod_mat, p):
    def sqrt_minus_one(p):
        """x0, y0 with x0² + y0² ≡ -1 (mod p), as quaternionCalculator picks them."""
        if p % 4 == 1:
            r = int(fmpz(p - 1).sqrtmod(p))
            return min(r, p - r), 0
        for x in range(p):
            r = (-1 - x * x) % p
            if fmpz(r).jacobi(p) == 1:
                s = int(fmpz(r).sqrtmod(p))
                return x, min(s, p - s)

    x0, y0 = sqrt_minus_one(p)

    def to_matrix(q):
        """q mod p as a 2 × 2 matrix over F_p."""
        a, b, c, d = q
        return nmod_mat([[a + b*x0 - c*y0, b*y0 + c*x0 - d],
                         [b*y0 + c*x0 + d, a - b*x0 + c*y0]], p)

    def matrix_tex(M):
        a, b, c, d = map(int, M.entries())
        return r"\begin{pmatrix} %d & %d \\ %d & %d \end{pmatrix}" % (a, b, c, d)

    _one, _i, _j, _k = map(to_matrix, [(1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)])
    _ok = _i * _i == _j * _j == _k * _k == -_one and _i * _j == _k
    mo.md(rf"""
    Here $x_0 = {x0}$ and $y_0 = {y0}$, since
    ${x0}^2 + {y0}^2 = {x0**2 + y0**2} \equiv -1 \pmod{{{p}}}$. In $M_2(\mathbb{{F}}_{{{p}}})$,

    $$\mathbf{{i}} \mapsto {matrix_tex(_i)}, \qquad \mathbf{{j}} \mapsto {matrix_tex(_j)},
    \qquad \mathbf{{k}} \mapsto {matrix_tex(_k)},$$

    and these satisfy $\mathbf{{i}}^2 = \mathbf{{j}}^2 = \mathbf{{k}}^2 = -1$ and
    $\mathbf{{i}}\mathbf{{j}} = \mathbf{{k}}$. {'✓' if _ok else '✗'}
    """)
    return (matrix_tex, sqrt_minus_one, to_matrix, x0, y0)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 3. The projective line

    A prime $\pi$ above $p$ has $\det \pi = N(\pi) \equiv 0$, so its matrix has rank one and its kernel is a line in $\mathbb{F}_p^2$: a point $[x : y]$ of $\mathbb{P}^1(\mathbb{F}_p) = \mathbb{F}_p \cup \{\infty\}$, written $x/y$, or $\infty$ when $y = 0$.

    [[prop:line]] (Primes are points)
    The map $\pi \mapsto \ker \pi$ is a bijection from the $p + 1$ canonical primes above $p$ to $\mathbb{P}^1(\mathbb{F}_p)$.
    """)
    return


@app.cell
def _(mo, p, primes, to_matrix):
    def point(q):
        """The kernel of q's matrix mod p: x/y in F_p, or "∞"."""
        M = to_matrix(q)
        assert M.rank() == 1, f"{q} has rank {M.rank()} mod {p}"
        kernel, _ = M.nullspace()
        x, y = int(kernel[0, 0]), int(kernel[1, 0])
        return "∞" if y == 0 else x * pow(y, -1, p) % p

    def point_tex(t):
        return r"\infty" if t == "∞" else str(t)

    points = {q: point(q) for q in primes}
    projective_line = list(range(p)) + ["∞"]
    _ok = sorted(points.values(), key=projective_line.index) == projective_line
    mo.md(rf"""
    The {len(primes)} primes have {len(set(points.values()))} different kernels, so each point
    of $\mathbb{{P}}^1(\mathbb{{F}}_{{{p}}})$ comes from exactly one prime. {'✓' if _ok else '✗'}
    """)
    return (point, point_tex, points, projective_line)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 4. Generators

    The conjugate of a canonical prime is canonical, and $\pi\bar\pi = p$, so $\bar\pi$ is $\pi^{-1}$ up to the scalar $p$. The primes come in $(p + 1)/2$ pairs $g_k, \bar g_k$: $g_k$ is the one whose first nonzero coefficient among $b, c, d$ is positive, and the pairs are ordered as quaternionCalculator orders them (by $b$, then $c$, $d$ and $a$, largest first). In the pinwheel, a chord joins the points of $g_k$ and $\bar g_k$.
    """)
    return


@app.cell
def _(conj, primes):
    def positive(q):
        return next(x for x in q[1:] if x) > 0

    generators = sorted(filter(positive, primes),
                        key=lambda q: (q[1], q[2], q[3], q[0]), reverse=True)
    names = {}
    for _k, _g in enumerate(generators, 1):
        names[_g] = f"g_{{{_k}}}"
        names[conj(_g)] = rf"\bar g_{{{_k}}}"
    return (generators, names, positive)


@app.cell
def _(mo):
    show_labels = mo.ui.checkbox(value=True, label="Label the points")
    return (show_labels,)


@app.cell
def _(conj, cos, generators, mo, names, p, plt, point_tex, points, projective_line, show_labels, sin, tau, tex):
    _rows = [f"| ${names[g]}$ | ${tex(g)}$ | ${point_tex(points[g])}$ "
             f"| ${tex(conj(g))}$ | ${point_tex(points[conj(g)])}$ |" for g in generators[:16]]
    _more = [f"\n*… and {len(generators) - 16} more pairs.*"] if len(generators) > 16 else []
    _head = [r"| | $g_k$ | point | $\bar g_k$ | point |", "| --- | --- | --- | --- | --- |"]
    _table = mo.md("\n".join(_head + _rows + _more))

    # P¹(F_p) around a circle: ∞ at the top, then 0, 1, 2, … clockwise. A chord for each pair.
    _order = projective_line[-1:] + projective_line[:-1]
    _at = {t: (sin(tau * n / (p + 1)), cos(tau * n / (p + 1))) for n, t in enumerate(_order)}
    _fig, _ax = plt.subplots(figsize=(3.8, 3.8))
    for _n, _g in enumerate(generators):
        (_x1, _y1), (_x2, _y2) = _at[points[_g]], _at[points[conj(_g)]]
        _color = plt.cm.plasma(0.85 * _n / max(1, len(generators) - 1))
        _ax.plot([_x1, _x2], [_y1, _y2], color=_color, lw=1.6, alpha=0.9)
    _ax.scatter(*zip(*_at.values()), s=max(4, 400 // (p + 1)), color="#2c4250", zorder=3)
    if show_labels.value and p < 60:
        _size = 8 if p < 30 else 6
        for _t, (_x, _y) in _at.items():
            _ax.text(1.14 * _x, 1.14 * _y, str(_t), ha="center", va="center", fontsize=_size)
    _ax.set_title(rf"$\mathbb{{P}}^1(\mathbb{{F}}_{{{p}}})$ and its {len(generators)} chords",
                  fontsize=10, pad=14)
    _ax.set(xlim=(-1.25, 1.25), ylim=(-1.25, 1.25), aspect="equal")
    _ax.axis("off")

    mo.hstack([_table, mo.vstack([_fig, show_labels])], gap=2, align="start")
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 5. A free group

    A word in the primes is **reduced** if no $\pi$ in it is followed by $\bar\pi$. There are $(p + 1)p^{n-1}$ reduced words of length $n$.

    [[thm:factorization]] (Unique factorization)
    Every quaternion $q$ with $N(q) = p^k$ is $q = p^m\, u\, \pi_1 \pi_2 \cdots \pi_n$ for exactly one power $p^m$, unit $u$ and reduced word $\pi_1 \cdots \pi_n$ in the canonical primes. Then $2m + n = k$.

    So distinct reduced words never agree up to a unit, and modulo scalars the $g_k$ generate a free group of rank $(p + 1)/2$. It acts simply transitively on the vertices of the $(p + 1)$-regular tree. The next cell lists every reduced word of length $n$ and checks the first claim.
    """)
    return


@app.cell
def _(mo):
    word_length = mo.ui.slider(1, 4, value=2, label="Word length $n$")
    word_length
    return (word_length,)


@app.cell
def _(UNITS, conj, mo, mul, norm, p, primes, word_length):
    _n = word_length.value
    _expected = (p + 1) * p ** (_n - 1)
    mo.stop(
        _expected > 60_000,
        mo.callout(mo.md(f"There are {_expected:,} reduced words of length {_n}, "
                         "too many to list here. Lower $n$ or $p$."), kind="warn"),
    )

    def associate(q):
        """One representative of q up to units."""
        return min(mul(u, q) for u in UNITS)

    words = [((g,), g) for g in primes]  # (word, product)
    for _ in range(_n - 1):
        words = [(w + (g,), mul(q, g)) for w, q in words for g in primes if g != conj(w[-1])]
    _classes = {associate(q) for _, q in words}
    print(f"{len(words):,} reduced words of length {_n}, "
          f"{len(_classes):,} different products up to units")

    _ok = len(words) == len(_classes) == _expected and all(norm(q) == p**_n for _, q in words)
    mo.md(rf"""
    There are $(p + 1)p^{{n-1}} = {_expected:,}$ reduced words of length {_n}. Their products
    are {len(_classes):,} quaternions of norm ${p}^{{{_n}}}$, no two of them equal up to a unit.
    {'✓' if _ok else '✗'}
    """)
    return (associate, words)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## 6. Factor a quaternion

    To factor $q$, find the prime $\pi$ with $q\bar\pi \equiv 0 \pmod p$. It is the last letter, and $q\bar\pi / p$ is what is left. Type $q$ as `a + bi + cj + dk` or as `a, b, c, d`. Its norm must be a power of $p$.
    """)
    return


@app.cell
def _(conj, generators, mo, mul, tex):
    _g = generators
    _example = mul((0, 0, 0, 1), mul(mul(_g[0], conj(_g[-1])), _g[0]))
    q_input = mo.ui.text(value=tex(_example, plain=True), label="$q$ =")
    q_input
    return (q_input,)


@app.cell
def _(re):
    def parse_quaternion(text):
        """'3 - 2i + j + 4k' or '3, -2, 1, 4' as (3, -2, 1, 4); None if it doesn't read."""
        s = text.replace(" ", "").replace("−", "-").replace("*", "")
        if re.fullmatch(r"-?\d+(,-?\d+){3}", s):
            return tuple(int(x) for x in s.split(","))
        q = {"": 0, "i": 0, "j": 0, "k": 0}
        terms = re.findall(r"[+-]?[^+-]+", s)
        if not terms or "".join(terms) != s:
            return None
        for t in terms:
            m = re.fullmatch(r"([+-]?)(\d*)([ijk]?)", t)
            if not m or not (m[2] or m[3]):
                return None
            q[m[3]] += (-1 if m[1] == "-" else 1) * int(m[2] or 1)
        return (q[""], q["i"], q["j"], q["k"])
    return (parse_quaternion,)


@app.cell
def _(conj, mo, mul, names, norm, p, parse_quaternion, primes, q_input, tex):
    _q = parse_quaternion(q_input.value)
    _hint = mo.md(f"“{q_input.value}” isn't a quaternion. Write it like `3 - 2i + j + 4k`.")
    mo.stop(_q is None, mo.callout(_hint, kind="warn"))
    _rest, _k = norm(_q), 0
    while _rest > 1 and _rest % p == 0:
        _rest, _k = _rest // p, _k + 1
    _hint = mo.md(f"$N(q) = {norm(_q):,}$ is not a power of {p}.")
    mo.stop(_rest != 1, mo.callout(_hint, kind="warn"))

    def factor(q):
        """(m, u, word) with q = p^m · u · (product of word)."""
        m = 0
        while all(x % p == 0 for x in q):
            q, m = tuple(x // p for x in q), m + 1
        word = []
        while norm(q) > 1:
            g = next(g for g in primes if all(x % p == 0 for x in mul(q, conj(g))))
            word.insert(0, g)
            q = tuple(x // p for x in mul(q, conj(g)))
        return m, q, word

    _m, _u, _word = factor(_q)
    _back = _u
    for _g in _word:
        _back = mul(_back, _g)
    _ok = tuple(p ** _m * x for x in _back) == _q

    _parts = [f"{p}^{{{_m}}}" if _m > 1 else f"{p}"] if _m else []
    _parts += [] if _u[0] else [tex(_u)]
    _parts += [" ".join(names[g] for g in _word)] if _word else []
    _rhs = ("-" if _u == (-1, 0, 0, 0) else "") + (r" \cdot ".join(_parts) or "1")
    _rhs = "" if _rhs == tex(_q) else f" = {_rhs}"
    mo.md(rf"""
    $$q = {tex(_q)}{_rhs}$$

    $N(q) = {p}^{{{_k}}}$, so $m = {_m}$ and the reduced word has length {len(_word)}.
    Multiplying back gives $q$. {'✓' if _ok else '✗'}
    """)
    return (factor,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Things to try

    - Set $p = 7$ or $19$. When $p \equiv 3 \pmod 4$, $y_0 \ne 0$ and the canonical primes have $b$ and $c$ odd.
    - Move $n$ to 4. The counting cell prints to its console. Past 60,000 words, `mo.stop` halts it.
    - Factor your own quaternion, such as a product of the $g_k$, or one of them times $p$.
    - Add a cell (Alt+Enter) that uses `primes`, `points` or `factor`: a name defined in one cell can be used in every other. Names starting with `_` stay private to their cell.
    - **Record run** runs the notebook from scratch and keeps a log of every cell, with its figures.
    """)
    return


if __name__ == "__main__":
    app.run()
