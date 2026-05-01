Linear algebra begins with one of the oldest questions in mathematics: when can we
solve a system of equations like

$$
\begin{aligned}
2x + 3y &= 7 \\
x - y &= 1
\end{aligned}
$$

and when we can, what does the answer *mean* geometrically?

> [!def] Linear equation
> A **linear equation** in the variables $x_1, x_2, \dots, x_n$ is an equation of the form
> $$ a_1 x_1 + a_2 x_2 + \dots + a_n x_n = b $$
> where $a_1, \dots, a_n, b$ are real numbers (the *coefficients* and the *constant term*).

Notice what is **not** allowed: products like $x_1 x_2$, powers like $x_1^2$, and
transcendental functions like $\sin(x_1)$. Linearity is the property that makes the
whole subject tractable — and surprisingly, the property that makes it powerful enough
to model an enormous fraction of the modern world, from computer graphics to quantum
mechanics to Google's PageRank.

## Systems

A **system of linear equations** is just a collection of linear equations in the same
variables. We will study three fundamental questions about such a system:

1. Does it have any solution at all?
2. If so, is the solution unique?
3. How can we find the solution(s) efficiently?

> [!ex] A system in two unknowns
> The system at the top of the page has the unique solution $x = 2,\ y = 1$. We will
> verify this by row reduction in the next section.

## What can go wrong

Three things can happen for any linear system:

- It has **exactly one** solution — the equations are consistent and independent.
- It has **infinitely many** solutions — the equations are consistent but dependent.
- It has **no** solution — the equations are inconsistent.

> [!thm] Trichotomy for linear systems
> Every system of linear equations has either no solutions, exactly one solution,
> or infinitely many solutions.

The proof of this theorem will fall out naturally from the row-reduction algorithm.
That algorithm is the workhorse of the entire course — once you know it cold, much
of linear algebra becomes a matter of *interpreting* what it computes.
