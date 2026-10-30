# Ping pong

[[lem:pingpong]] (Ping-pong lemma)
Let $a, b$ act on $X$, with disjoint nonempty $X_a, X_b \subseteq X$. If $a^n(X_b) \subseteq X_a$ and $b^n(X_a) \subseteq X_b$ for all $n \ne 0$, then $\langle a, b\rangle \cong F_2$.

[[ex:sanov]] (Sanov)
$A = \begin{pmatrix} 1 & 2 \\ 0 & 1\end{pmatrix}$ and $B = \begin{pmatrix} 1 & 0 \\ 2 & 1\end{pmatrix}$ play ping pong on $\mathbb{R} \cup \{\infty\}$ with $X_A = \{|x| > 1\}$ and $X_B = \{|x| < 1\}$.

The notebook `pingpong.py` draws the orbit of $i$ under words in $A$ and $B$, colored by first letter. Back to [[Classification Conjecture]].
