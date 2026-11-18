# The Classification Conjecture in $\PSL_2(\overline{\Q})$

Suppose $k$ is a number field and $\Gamma \le \PSL_2(k)$ is a finitely generated subgroup.

[[conj:classification]] (Classification Conjecture)
Every subgroup $\Gamma \le \PSL_2(k)$ is at least one of:
1. **Algebraic:** $\Gamma \le \mathbf{H}(\Q)$ for a proper $\Q$-algebraic subgroup $\mathbf{H} \lneq \mathrm{Res}_{k/\Q}\PSL_2$.
2. **Geometric:** $\Gamma \le \PSL_2(k_v)$ is discrete for some nontrivial place $v$ of $k$.
3. **Arithmetic:** $\Gamma$ is commensurable with $\PSL_2(A)$ for some subring $A \subseteq k$.

## First examples

[[ex:sanov]] (Sanov's free group — Geometric, thin)
The matrices $A = \mat{1}{2}{0}{1}$ and $B = \mat{1}{0}{2}{1}$ play ping-pong on four cones in $\Z^2$; see [[The ping-pong lemma]] and [[Examples]].
$$\langle A, B \rangle \cong F_2, \qquad [\PSL_2(\Z) : \langle A, B \rangle] = \infty.$$

[[ex:arith]] (Allowing $\frac{1}{2}$ in the denominator — Arithmetic)
Adding $D(z) = 2z$ to $\PSL_2(\Z)$ gives $\PGL_2(\Z[\tfrac{1}{2}])$: dense in $\PGL_2(\R)$, bounded on a vertex of $T_3$, and a discrete lattice in $\PGL_2(\R) \times \PGL_2(\Q_2)$.
