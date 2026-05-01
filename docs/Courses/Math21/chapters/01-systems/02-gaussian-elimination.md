Gaussian elimination is a systematic way to simplify a system of linear equations
without changing its solution set. We do this by repeatedly applying three
**elementary row operations**:

1. **Swap** two rows.
2. **Scale** a row by a nonzero constant.
3. **Add** a multiple of one row to another.

The goal is to transform the system into an *echelon* form where the solution can be
read off by back-substitution.

## The augmented matrix

Instead of carrying around variables, we just track coefficients in an
**augmented matrix**. The system

$$
\begin{aligned}
2x + 3y &= 7 \\
x - y &= 1
\end{aligned}
$$

becomes

$$
\left[\begin{array}{cc|c}
2 & 3 & 7 \\
1 & -1 & 1
\end{array}\right].
$$

The vertical bar separates the coefficient matrix from the right-hand side.

## Try it yourself

Use the operations below to row-reduce the matrix. Try: swap $R_1$ and $R_2$ first,
then replace $R_2$ with $R_2 - 2 R_1$, then scale $R_2$ by $1/5$.

<div data-demo="row-reduction" data-config='{"matrix":[[2,3,7],[1,-1,1]],"augmented":true}'></div>

You should end with $\left[\begin{smallmatrix} 1 & -1 & 1 \\ 0 & 1 & 1 \end{smallmatrix}\right]$,
from which back-substitution gives $x = 2$, $y = 1$. ✓

## Why row operations are safe

> [!thm] Row operations preserve the solution set
> If a matrix $B$ is obtained from $A$ by a sequence of elementary row operations,
> then the systems $A\mathbf{x} = \mathbf{b}$ and $B\mathbf{x} = \mathbf{c}$
> (where $[B \mid \mathbf{c}]$ is the result of applying those operations to
> $[A \mid \mathbf{b}]$) have **exactly the same solutions**.

We will give a careful proof in the next section, but the intuition is simple:
each of the three operations is reversible, and reversibility means we cannot lose
or gain solutions.

## Echelon form

A matrix is in **row echelon form** if:

- All zero rows are at the bottom.
- The first nonzero entry of each row (its **pivot**) is to the right of the pivot
  of the row above it.

Once a matrix is in echelon form, the system can be solved by back-substitution.
Pushing further to *reduced* echelon form — where each pivot is $1$ and is the only
nonzero entry in its column — lets us read off the solution directly. That is the
subject of the next section.
