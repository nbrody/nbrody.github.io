# The Classification Conjecture

Given finitely many matrices $S \subseteq \PGL_2(\Qbar)$, what is $\langle S \rangle$?

[[conj:class]] (Classification Conjecture)
Let $k$ be a number field and $\G$ an absolutely simple $k$-group. Every subgroup $\Gamma \le \G(k)$ is **algebraic**, **geometric** or **arithmetic**.

## The three kinds

[[def:geometric]] (Geometric)
$\Gamma$ is *geometric* if it is discrete in $\G(k_v)$ for some place $v$ of $k$.

- **Algebraic**: inside a proper algebraic subgroup. For $\PGL_2$: solvable or unitary.
- **Geometric**: discrete at one place. See [[Ping pong]] for how to build them.
- **Arithmetic**: commensurable with $\G(A)$ for a subring $A \le k$, such as $\PGL_2(\Z[\tfrac12])$.

## For PGL₂

[[prop:product]]
If $\Gamma$ is finitely generated, then $\Gamma \le \PGL_2(\mathcal{O}_k[S^{-1}])$, which is discrete in
$$\prod_{v \mid \infty} \PGL_2(k_v) \times \prod_{p \in S} \PGL_2(k_p).$$

[[prf]]
The entries of finitely many matrices have finitely many denominators, and $\mathcal{O}_k[S^{-1}]$ is a lattice in $\mathbb{R}^r \times \mathbb{C}^s \times \prod_{p \in S} k_p$.

## Questions

- [ ] Is there a discreteness algorithm in $\PGL_2(\mathbb{C})$ over $\Qbar$?
- [ ] What replaces trees for two-dimensional fields?
