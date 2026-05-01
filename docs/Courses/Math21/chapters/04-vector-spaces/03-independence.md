Two vectors $\mathbf{v}_1, \mathbf{v}_2$ in $\mathbb{R}^2$ are **linearly independent**
if neither is a scalar multiple of the other. More generally:

> [!def] Linear independence
> Vectors $\mathbf{v}_1, \dots, \mathbf{v}_k$ are **linearly independent** if the only
> solution to
> $$ c_1 \mathbf{v}_1 + c_2 \mathbf{v}_2 + \cdots + c_k \mathbf{v}_k = \mathbf{0} $$
> is $c_1 = c_2 = \cdots = c_k = 0$. If a nonzero solution exists, the vectors are
> **linearly dependent**.

Geometrically: a set is dependent if some vector in the set is a linear combination
of the others — that is, *redundant*. The set's span doesn't grow when you add it.

## Span as a workshop

Drag the tips of $\mathbf{v}_1$ and $\mathbf{v}_2$, or move the sliders to explore
their linear combinations. When the two vectors point in the same line, the
"span dim" drops to 1 and the dashed line shows the span — every point you can
reach is on it.

<div data-demo="linear-combination" data-config='{"v1":[2,1],"v2":[-1,2]}'></div>

> [!ex] A quick check
> Set the sliders to $c_1 = 0,\ c_2 = 0$. The result is the zero vector — that's
> the trivial combination. Now try to make $\mathbf{w} = \mathbf{0}$ in some
> *other* way. With $\mathbf{v}_1 = (2,1)$ and $\mathbf{v}_2 = (-1,2)$ you can't:
> the only way to write zero is $0 \mathbf{v}_1 + 0 \mathbf{v}_2$. They are
> linearly independent. But move $\mathbf{v}_2$ to $(4, 2)$ and suddenly
> $-2 \mathbf{v}_1 + 1 \mathbf{v}_2 = \mathbf{0}$.

## How dependence is detected

In $\mathbb{R}^n$, the question of whether $\{\mathbf{v}_1, \dots, \mathbf{v}_k\}$
is independent reduces to row reduction: form the matrix whose columns are the
$\mathbf{v}_i$'s, row-reduce, and count pivots.

> [!thm] Pivot test
> The vectors $\mathbf{v}_1, \dots, \mathbf{v}_k \in \mathbb{R}^n$ are linearly
> independent if and only if the matrix $[\mathbf{v}_1 \mid \cdots \mid \mathbf{v}_k]$
> has $k$ pivot columns after row reduction.

This connects independence directly to the existence/uniqueness story of
Chapter 1 — they are two faces of the same coin.
