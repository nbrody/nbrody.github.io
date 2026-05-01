Of all the things a linear transformation $T \colon V \to V$ can do, the simplest
is to *stretch*: send a vector $\mathbf{v}$ to a scalar multiple of itself. Such
vectors play a special role in the structure of $T$, and the scalars by which they
get stretched encode an enormous amount of information.

> [!def] Eigenvalue and eigenvector
> Let $A$ be an $n \times n$ matrix. A nonzero vector $\mathbf{v} \in \mathbb{R}^n$
> is an **eigenvector** of $A$ if there is a scalar $\lambda$ with
> $$ A \mathbf{v} = \lambda \mathbf{v}. $$
> The scalar $\lambda$ is then called the **eigenvalue** associated with $\mathbf{v}$.

The requirement $\mathbf{v} \neq \mathbf{0}$ is essential — the zero vector
satisfies $A \mathbf{0} = \lambda \mathbf{0}$ for every $\lambda$, which would
make the definition useless.

## The characteristic equation

Rewriting $A\mathbf{v} = \lambda \mathbf{v}$ as $(A - \lambda I)\mathbf{v} = \mathbf{0}$,
we see that $\mathbf{v}$ is an eigenvector exactly when it lies in the null space
of $A - \lambda I$. This null space is nontrivial precisely when

$$ \det(A - \lambda I) = 0. $$

> [!thm] Characteristic equation
> The eigenvalues of $A$ are exactly the roots of the polynomial
> $$ p_A(\lambda) = \det(A - \lambda I). $$
> This polynomial is called the **characteristic polynomial** of $A$, and the
> equation $p_A(\lambda) = 0$ is the **characteristic equation**.

> [!ex] A 2×2 example
> Let $A = \begin{pmatrix} 4 & 1 \\ 2 & 3 \end{pmatrix}$. Then
> $$ p_A(\lambda) = \det\begin{pmatrix} 4-\lambda & 1 \\ 2 & 3-\lambda \end{pmatrix} = (4-\lambda)(3-\lambda) - 2 = \lambda^2 - 7\lambda + 10 = (\lambda - 2)(\lambda - 5). $$
> So the eigenvalues are $\lambda_1 = 2$ and $\lambda_2 = 5$. Try plugging values in:
> $p_A(\lambda)$ at $\lambda =$
> <span data-demo="tweakable" data-config='{"expr":"x*x - 7*x + 10","var":"x","init":2,"min":-2,"max":8,"step":0.5}'></span>
> — values that hit $0$ are the eigenvalues.

## See it geometrically

The matrix below shears the plane. Drag the tips of $\mathbf{i}$ and $\mathbf{j}$
or type entries directly. The green dashed lines are the (real) eigen-directions —
notice that vectors along those lines stay on the line under the transformation.

<div data-demo="vector-playground" data-config='{"matrix":[[4,1],[2,3]],"showEigen":true}'></div>

## Geometric meaning

When $A\mathbf{v} = \lambda \mathbf{v}$:

- If $\lambda > 1$, the eigenvector is *stretched* in its direction.
- If $0 < \lambda < 1$, it is *compressed*.
- If $\lambda < 0$, it is reflected and possibly stretched.
- If $\lambda = 0$, the eigenvector is sent to the origin — meaning $\mathbf{v}$
  lies in the null space of $A$.

The eigenvectors carve $\mathbb{R}^n$ into the directions along which $A$ acts as a
pure scaling. When there are enough such directions to form a basis, $A$ becomes
*diagonalizable* — and that, as we will see, makes computing $A^k$ for large $k$
nearly free.
