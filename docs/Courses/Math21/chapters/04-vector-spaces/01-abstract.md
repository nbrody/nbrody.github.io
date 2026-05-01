So far we have worked entirely with vectors in $\mathbb{R}^n$. But linear algebra
is much more than the study of arrows and tuples — it is a theory of any structure
that supports addition and scaling in a sensible way.

> [!def] Vector space
> A **vector space** over $\mathbb{R}$ is a set $V$ together with two operations:
>
> - **Addition**: a rule that takes $\mathbf{u}, \mathbf{v} \in V$ and produces $\mathbf{u} + \mathbf{v} \in V$.
> - **Scalar multiplication**: a rule that takes $c \in \mathbb{R}$ and $\mathbf{v} \in V$ and produces $c\mathbf{v} \in V$.
>
> These must satisfy the eight axioms below for all $\mathbf{u}, \mathbf{v}, \mathbf{w} \in V$ and $a, b \in \mathbb{R}$.

The axioms come in two groups. The first four govern addition:

1. $\mathbf{u} + \mathbf{v} = \mathbf{v} + \mathbf{u}$
2. $(\mathbf{u} + \mathbf{v}) + \mathbf{w} = \mathbf{u} + (\mathbf{v} + \mathbf{w})$
3. There is a **zero vector** $\mathbf{0} \in V$ with $\mathbf{v} + \mathbf{0} = \mathbf{v}$.
4. Every $\mathbf{v} \in V$ has an additive inverse $-\mathbf{v}$ with $\mathbf{v} + (-\mathbf{v}) = \mathbf{0}$.

The last four govern scalar multiplication and how it interacts with addition:

5. $a(\mathbf{u} + \mathbf{v}) = a\mathbf{u} + a\mathbf{v}$
6. $(a + b)\mathbf{v} = a\mathbf{v} + b\mathbf{v}$
7. $(ab)\mathbf{v} = a(b\mathbf{v})$
8. $1 \mathbf{v} = \mathbf{v}$

## Examples beyond $\mathbb{R}^n$

> [!ex] Polynomials
> Let $\mathcal{P}_n$ be the set of polynomials of degree at most $n$ with real
> coefficients. Adding two polynomials and scaling a polynomial give back another
> polynomial, and the eight axioms hold. So $\mathcal{P}_n$ is a vector space.

> [!ex] Functions
> Let $C[0,1]$ be the set of continuous functions $f \colon [0,1] \to \mathbb{R}$.
> Pointwise addition $(f+g)(x) = f(x) + g(x)$ and scaling $(cf)(x) = c f(x)$ make
> $C[0,1]$ into a vector space — an *infinite-dimensional* one.

> [!ex] Matrices
> The set $M_{m \times n}(\mathbb{R})$ of $m \times n$ real matrices is a vector
> space under entrywise addition and scaling.

> [!note] What is **not** a vector space
> The set $\{(x, y) \in \mathbb{R}^2 : x \ge 0\}$ is not a vector space — scaling
> by $-1$ takes you out of the set, so axiom 4 fails.

## Why bother?

Generality earns its keep when one theorem can be proved once and then applied
everywhere. Once we prove a fact about all vector spaces — say, that any linearly
independent set can be extended to a basis — we get the corresponding fact for
$\mathbb{R}^n$, polynomials, matrices, and continuous functions for free.

This is the abstraction that makes linear algebra the lingua franca of modern
mathematics.
