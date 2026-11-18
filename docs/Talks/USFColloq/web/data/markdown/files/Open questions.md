# Open questions

Ping-pong can only ever prove that a group is free. When the sets don't exist, the group may still be free, and deciding which is often hard. Here is a famous case.

[[def:Gq]] (Two parabolic generators)
For $q \in \C$, let $a = \mat1011$, $b_q = \mat1q01$ and $G_q = \gen{a, b_q}$. This is Kim and Koberda's normalization. When $q = t^2$, conjugating by $\operatorname{diag}(t, 1)$ takes $A_t$ to $b_q$ and $B_t$ to $a$, so $G_q$ is conjugate to $G_t$ from [[notes/Examples]]. Sanov's group is $G_4$.

[[thm:big]] (Large $q$)
If $\abs q \ge 4$, then $G_q$ is free of rank $2$.

[[prf:big]]
Let $U = \{(x, y) \in \C^2 : \abs x > 2\abs y\}$ and $V = \{(x, y) : \abs x < 2\abs y\}$. For $n \ne 0$ and $(x, y) \in U$, $a^n(x, y) = (x, nx + y)$ and $\abs{nx + y} \ge \abs x - \abs y > \abs x / 2$, so $a^n(U) \subseteq V$. For $(x, y) \in V$, $b_q^n(x, y) = (x + nqy, y)$ and $\abs{x + nqy} \ge 4\abs y - \abs x > 2\abs y$, so $b_q^n(V) \subseteq U$. Now apply the two-set form of [[notes/The ping-pong lemma]].

[[q:rational]] (Rational parameters)
Is $G_q$ non-free for every nonzero rational $q$ with $\abs q < 4$? (At $q = 0$, $G_0 = \gen a \cong \Z$ is free of rank $1$.)

This is open. Some of what is known:
- At $q = 1$, $a$ and $b_1$ generate $\SL_2(\Z)$, which has torsion, so $G_1$ is not free.
- Lyndon and Ullman (1969) began the systematic study of which parameters give free groups.
- Kim and Koberda (2019) prove $G_q$ is non-free when $q = s/r$ with $\abs s \le 27$, except possibly when $s = 24$. Some of their proofs are computer assisted.
- Nyberg-Brodda (2023) conjectures that for $q = r/p$ with $p$ prime, $G_q$ is an explicit congruence subgroup of $\SL_2(\Z[1/p])$, and proves it for $r \le 4$.

These summaries come from the abstracts; the reading notes in Bibliography say what has been checked.

## What we can do by computer

A relation is a certificate of non-freeness that anyone can check by multiplying matrices. [[computations/ping_pong.py]] searches for short relations at a rational $q$ you type in, and verifies any it finds with exact arithmetic. When it finds none, that proves nothing: the next relation may simply be longer.

[[ex:threehalves]] ($q = 3/2$)
The notebook's default finds $(a^2 b_q^{-1})^3 = I$. By hand: $a^2 b_q^{-1} = \mat1{-3/2}2{-2}$ has determinant $1$ and trace $-1$, so by Cayley–Hamilton it satisfies $M^2 + M + I = 0$, hence $M^3 = I$. So $G_{3/2}$ is not free.

Questions to try:
- For which $q = 1/n$ does the search find a relation, and how long is the shortest one it finds?
- How does the length of the shortest relation found grow as $q$ approaches $4$ from below?
