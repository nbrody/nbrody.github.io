import marimo

__generated_with = "alphaPy"
app = marimo.App()


@app.cell(hide_code=True)
def _():
    import marimo as mo
    import matplotlib.pyplot as plt
    from flint import fmpz_mat
    return (fmpz_mat, mo, plt)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # Ping pong for Sanov's group

    $A = \begin{pmatrix} 1 & 2 \\ 0 & 1 \end{pmatrix}$ and $B = \begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}$ generate a free group. Every reduced word $g$ sends the point $i$ of the upper half-plane somewhere; we draw $g \cdot i$ in the Poincaré disk, colored by the **first letter** of $g$.

    [[lem:pingpong]] (Ping pong)
    $A^{\pm1}$ moves $X_B = \{|x| < 1\}$ into $X_A = \{|x| > 1\}$, and $B^{\pm1}$ moves $X_A$ into $X_B$.

    The notebook is reactive: move the slider and every cell below it runs again.
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    length = mo.ui.slider(1, 7, value=4, label="Word length $n$")
    show_sets = mo.ui.checkbox(value=True, label="Show the ping-pong sets")
    mo.hstack([length, show_sets], gap=2)
    return (length, show_sets)


@app.cell(hide_code=True)
def _(fmpz_mat, length):
    A = fmpz_mat([[1, 2], [0, 1]])
    B = fmpz_mat([[1, 0], [2, 1]])
    letters = {"A": A, "a": fmpz_mat([[1, -2], [0, 1]]), "B": B, "b": fmpz_mat([[1, 0], [-2, 1]])}
    inverse = {"A": "a", "a": "A", "B": "b", "b": "B"}

    # Every reduced word of length 1..n, built letter by letter (exact integer matrices).
    words = {"": fmpz_mat([[1, 0], [0, 1]])}
    frontier = dict(words)
    for _ in range(length.value):
        _next = {}
        for _w, _m in frontier.items():
            for _x, _g in letters.items():
                if _w and inverse[_x] == _w[-1]:
                    continue
                _next[_w + _x] = _m * _g
        words.update(_next)
        frontier = _next
    return (A, B, frontier, inverse, letters, words)


@app.cell(hide_code=True)
def _(length, mo, words):
    _distinct = len({tuple(int(e) for e in m.entries()) for m in words.values()})
    _expected = 1 + sum(4 * 3 ** (k - 1) for k in range(1, length.value + 1))
    mo.md(rf"""
    **{len(words) - 1:,} reduced words** of length $1$ to $n = {length.value}$, giving **{_distinct - 1:,} distinct matrices** besides the identity (a free group has $4 \cdot 3^{{k-1}}$ of each length $k$, so {_expected - 1:,} in all). Computed exactly with python-flint.
    """)
    return


@app.cell(hide_code=True)
def _(plt, show_sets, words):
    def _disk(m):
        a, b, c, d = (int(e) for e in m.entries())
        z = (a * 1j + b) / (c * 1j + d)          # g · i in the upper half-plane
        return (z - 1j) / (z + 1j)                # Cayley map to the unit disk

    _colors = {"A": "#e08a1e", "a": "#c2410c", "B": "#0d9488", "b": "#155e75"}
    _fig, _ax = plt.subplots(figsize=(4.6, 4.6))
    from math import cos as _cos, sin as _sin
    _theta = [t / 200 * 6.2832 for t in range(201)]
    _ax.plot([_cos(t) for t in _theta], [_sin(t) for t in _theta], color="#94a3b8", lw=1)
    if show_sets.value:
        # The Cayley map sends |x| > 1 to the right half of the circle and |x| < 1 to the left.
        _right = [-1.5708 + 3.1416 * k / 100 for k in range(101)]
        _left = [1.5708 + 3.1416 * k / 100 for k in range(101)]
        _ax.plot([1.04 * _cos(t) for t in _right], [1.04 * _sin(t) for t in _right], color="#e08a1e", lw=5, alpha=0.5, label="$X_A$")
        _ax.plot([1.04 * _cos(t) for t in _left], [1.04 * _sin(t) for t in _left], color="#0d9488", lw=5, alpha=0.5, label="$X_B$")
    for _x, _c in _colors.items():
        _pts = [_disk(m) for w, m in words.items() if w.startswith(_x)]
        _ax.scatter([p.real for p in _pts], [p.imag for p in _pts], s=6, color=_c, label=f"starts with ${_x if _x in 'AB' else _x.upper() + '^{-1}'}$")
    _ax.scatter([0], [0], s=30, color="black", zorder=3)
    _ax.set(xlim=(-1.15, 1.15), ylim=(-1.15, 1.15), aspect="equal")
    _ax.axis("off")
    _ax.legend(loc="upper left", fontsize=7, frameon=False, bbox_to_anchor=(0.85, 1.02))
    _fig
    return


if __name__ == "__main__":
    app.run()
