A **linear map** $T \colon V \to W$ between vector spaces is a function that
respects the two operations:

> [!def] Linear map
> A function $T \colon V \to W$ is **linear** if for all $\mathbf{u}, \mathbf{v} \in V$
> and all $c \in \mathbb{R}$,
> $$ T(\mathbf{u} + \mathbf{v}) = T(\mathbf{u}) + T(\mathbf{v}) \quad\text{and}\quad T(c \mathbf{v}) = c\, T(\mathbf{v}). $$

Linear maps are exactly the right notion of "structure-preserving function" between
vector spaces — they take the operations of $V$ to the operations of $W$.

## Matrices act linearly

The most important class of linear maps is multiplication by a matrix. Given a
$2 \times 2$ matrix $A$, the map $T(\mathbf{v}) = A\mathbf{v}$ from $\mathbb{R}^2$
to $\mathbb{R}^2$ is linear — and conversely every linear map $\mathbb{R}^2 \to \mathbb{R}^2$
is of this form.

Drag the basis vectors below to change $A$ directly, or type values into the matrix.
Watch how the unit square (dashed) is taken to a parallelogram. The signed area of
the parallelogram is the **determinant** of $A$.

<div data-demo="vector-playground" data-config='{"matrix":[[1,0.5],[0.3,1]],"showEigen":true,"showSquare":true}'></div>

## What linearity buys us

> [!thm] Determined by a basis
> A linear map $T \colon V \to W$ is completely determined by its values on any
> basis of $V$. If $\{\mathbf{b}_1, \dots, \mathbf{b}_n\}$ is a basis and we know
> $T(\mathbf{b}_i)$ for each $i$, then for any $\mathbf{v} = c_1 \mathbf{b}_1 + \cdots + c_n \mathbf{b}_n$,
> $$ T(\mathbf{v}) = c_1 T(\mathbf{b}_1) + \cdots + c_n T(\mathbf{b}_n). $$

This is why a $2 \times 2$ matrix carries enough information to describe every
linear map $\mathbb{R}^2 \to \mathbb{R}^2$: its two columns are the images of
the two standard basis vectors.

## Try a 3D transformation

In three dimensions, a $3 \times 3$ matrix takes a unit cube to a parallelepiped.
Drag to orbit, scroll to zoom.

<div data-demo="transform-3d" data-config='{"matrix":[[1,0.4,0],[0.2,1,0.3],[0,0.2,1.2]]}'></div>
