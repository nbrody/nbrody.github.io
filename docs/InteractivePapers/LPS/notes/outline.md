# LPS: outline (Stage 1)

Transcribed from the page images on November 2, 2026. Page numbers are the journal's (261–277). Slips in the printed text are listed in `source.md`; the transcriptions below give the intended reading.

## 0. Notation

- $p\ne q$ are primes, both $\equiv 1 \pmod 4$. $k=p+1$ is the degree. $\left(\frac pq\right)=\left(\frac qp\right)$ by reciprocity.
- $X=X_{n,k}$ is a $k$-regular graph on $n$ vertices. The paper writes $\Delta$ for the **adjacency matrix**, with eigenvalues $k=\lambda_0\ge\lambda_1\ge\dots\ge\lambda_{n-1}\ge -k$. $\lambda(X)$ is the largest $|\lambda_j|$ with $\lambda_j\ne\pm k$.
- $H(\mathbb Z)$ is the integral quaternions, $\bar\alpha=a_0-a_1\mathbf i-a_2\mathbf j-a_3\mathbf k$, $N(\alpha)=\alpha\bar\alpha$.
- $S=\{\alpha_1,\bar\alpha_1,\dots,\alpha_s,\bar\alpha_s\}$, $s=\frac{p+1}2$: the $p+1$ quaternions of norm $p$ with $a_0>0$ odd and $a_1,a_2,a_3$ even.
- $\Lambda(2)$ is the free group on $[\alpha_1],\dots,[\alpha_s]$, and also its Cayley graph, the $(p+1)$-regular tree $T$. $\Lambda(2q)\trianglelefteq\Lambda(2)$ is the congruence subgroup ($2q\mid a_1,a_2,a_3$).
- $\lambda_j=2\sqrt p\cos\theta_j$ (4.11). $\theta_j$ is real exactly when $|\lambda_j|\le 2\sqrt p$.

## 1. Section tree

| § | Title | Pages | Contents |
|---|---|---|---|
| — | Abstract | 261 | (i) eigenvalues $\pm k$ or $|\lambda|\le 2\sqrt{k-1}$; (ii) girth asymptotically $\ge\frac43\log_{k-1}|X|$ |
| 1 | Introduction | 261–264 | Definition 1.1; (1.1)–(1.5); the list of inequalities (Cases i, ii); history; the $p$-adic picture; plan of the paper |
| 2 | Construction of $X^{p,q}$ | 264 | (2.1); the Cayley graphs |
| 3 | Quaternions | 265–269 | Lemma 3.1; Corollary 3.2; $\Lambda(2)$, $\Lambda(2m)$, $\varphi$; Proposition 3.3; Remark 1; Theorem 3.4 with (3.1)–(3.3); non-bipartiteness |
| 4 | Spectrum of $X^{p,q}$ | 269–274 | Theorem 4.1; Propositions 4.2, 4.3; (4.1)–(4.20); Lemma 4.4; Remark 2; $Y^{p,q}$; Theorem 4.4 |
| 5 | Diameter and other quantities | 275–276 | (5.1)–(5.9); Theorem 5.1; Proposition 5.2; Remarks 3, 4 |
| — | References | 277 | [1]–[27] |

## 2. Every numbered item

### §1 Introduction

**Definition 1.1.** $X_{n,k}$ is a *Ramanujan graph* if $\lambda(X)\le 2\sqrt{k-1}$.

**(1.1)** (Alon–Boppana [3]; proved as Proposition 4.2) $\displaystyle\liminf_{n\to\infty}\lambda(X_{n,k})\ge 2\sqrt{k-1}$.

**(1.2)** (Jacobi) $\displaystyle r_4(n)=8\sum_{d\mid n,\ 4\nmid d}d$.

**(1.3)** $Q(x_1,x_2,x_3,x_4)=x_1^2+4q^2x_2^2+4q^2x_3^2+4q^2x_4^2$.

**(1.4)** $r_Q(n)$ is the number of $v\in\mathbb Z^4$ with $Q(v)=n$.

**(1.5)** (Eichler [6], Igusa [12]) For $n=p^k$, as $k\to\infty$, for every $\varepsilon>0$:
$$r_Q(p^k)=C(p^k)+O_\varepsilon\!\left(p^{k(1/2+\varepsilon)}\right),\qquad
C(p^k)=\begin{cases} c_1\sum_{d\mid p^k}d & \left(\frac pq\right)=1,\\ c_2\sum_{d\mid p^k}d & \left(\frac pq\right)=-1,\ k\text{ even},\\ 0 & \left(\frac pq\right)=-1,\ k\text{ odd}.\end{cases}$$
The constants are found in §4: $c_1=c_2=\frac{4}{q(q^2-1)}$ (from (4.19), (4.20); checked numerically).

**The inequalities (p. 263).** $X^{p,q}$ is $(p+1)$-regular.

- *Case i*, $\left(\frac qp\right)=-1$: $X^{p,q}$ is bipartite, $n=q(q^2-1)$.
  (a) $g(X^{p,q})\ge 4\log_p q-\log_p 4$; (b) $\operatorname{diam}(X^{p,q})\le 2\log_p n+2\log_p 2+1$.
- *Case ii*, $\left(\frac qp\right)=1$: not bipartite, $n=q(q^2-1)/2$.
  (a) $g\ge 2\log_p q$; (b) the same diameter bound; (c) $i(X^{p,q})\le\frac{2\sqrt p}{p+1}n$; (d) $\chi(X^{p,q})\ge\frac{p+1}{2\sqrt p}$.

Context the paper gives: the main results are the Ramanujan property and the girth; (b), (c) follow from Ramanujan, and (d) from (c). Case i gives $g\gtrsim\frac43\log_{k-1}n$, beating Erdős–Sachs [7] ($g>\log_{k-1}n$, by counting), Margulis [19] and Imrich [14] ($g\ge\frac49\log_{k-1}n$); the easy upper bound is $g\le 2\log_{k-1}n$; Weiss [27] matched it for $k=3$. (c), (d) are due to Alon; together with (a) they give explicit graphs of girth $\ge g$ and independence number $\le n^{1-1/8g}$. Finally, the $(p+1)$-regular tree is $\mathrm{PGL}_2(\mathbb Q_p)/\mathrm{PGL}_2(\mathbb Z_p)$, and $\Gamma\backslash\mathrm{PGL}_2(\mathbb Q_p)/\mathrm{PGL}_2(\mathbb Z_p)$ is Ramanujan by automorphic forms (Ihara [13], [18 II]); $X^{p,q}$ is the explicit case with $\Gamma$ a congruence subgroup of $H(\mathbb Z[1/p])^*$, which is a Cayley graph because the class number is one.

### §2 Construction

There are $8(p+1)$ solutions of $a_0^2+a_1^2+a_2^2+a_3^2=p$, and $p+1$ of them have $a_0>0$ odd and $a_1,a_2,a_3$ even. Fix $i$ with $i^2\equiv-1\pmod q$.

**(2.1)** $\tilde\alpha=\begin{pmatrix}a_0+ia_1 & a_2+ia_3\\ -a_2+ia_3 & a_0-ia_1\end{pmatrix}\in\mathrm{PGL}_2(\mathbb Z/q\mathbb Z)$, with $\det\tilde\alpha=p$.

$X^{p,q}$ is the Cayley graph (edges $x\sim sx$) of $\mathrm{PGL}_2(\mathbb Z/q)$ if $\left(\frac pq\right)=-1$, and of $\mathrm{PSL}_2(\mathbb Z/q)$ if $\left(\frac pq\right)=1$ (all generators have square determinant, so the PGL graph would be disconnected). In the first case it is bipartite, with parts $\mathrm{PSL}_2$ and its complement.

### §3 Quaternions

Units of $H(\mathbb Z)$: $\pm1,\pm\mathbf i,\pm\mathbf j,\pm\mathbf k$. For $N(\alpha)=p\equiv1\ (4)$ exactly one $a_i$ is odd, and each $\alpha$ has exactly one associate $\varepsilon\alpha\equiv1\ (2)$ with $a_0>0$. A *reduced word* contains no $\alpha_j\bar\alpha_j$ or $\bar\alpha_j\alpha_j$.

**Lemma 3.1** ([8]). Every $\alpha\in H(\mathbb Z)$ with $N(\alpha)=p^k$ can be written uniquely as $\alpha=\varepsilon p^rR_m(\alpha_1,\dots,\bar\alpha_s)$ with $\varepsilon$ a unit, $2r+m=k$ and $R_m$ a reduced word of length $m$.
*Proof.* Existence: factor (Dickson [5]) and peel off one generator at a time. Uniqueness: there are $(p+1)p^{m-1}$ reduced words of length $m\ge1$, so the number of expressions is $8\big(\sum_{0\le r\lt k/2}(p+1)p^{k-2r-1}+\delta(k)\big)=8\frac{p^{k+1}-1}{p-1}=8\sum_{d\mid p^k}d$, which by Jacobi is the number of $\alpha$ with $N(\alpha)=p^k$.

**Corollary 3.2.** If $\alpha\equiv1\ (2)$ and $N(\alpha)=p^k$, then $\alpha=\pm p^rR_m(\alpha_1,\dots,\bar\alpha_s)$ with $2r+m=k$, uniquely.

Consequences: the classes $\Lambda(2)$ form a group, free on $[\alpha_1],\dots,[\alpha_s]$, whose Cayley graph is the $(p+1)$-regular tree. For $(m,p)=1$, $\Lambda(2m)$ is the kernel of $\pi:\Lambda(2)\to H(\mathbb Z/2m)^*/Z$. Define $\varphi:\Lambda(2)\to\mathrm{PGL}_2(\mathbb Z/q)$ by $[\alpha]\mapsto\alpha\bmod q\mapsto$ the matrix (2.1).

**Proposition 3.3.** $\operatorname{Image}\varphi=\mathrm{PGL}_2(\mathbb Z/q)$ if $\left(\frac pq\right)=-1$, and $\mathrm{PSL}_2(\mathbb Z/q)$ if $\left(\frac pq\right)=1$.
*Proof.* Lift a norm-1 quaternion $\beta$ mod $q$ to $\alpha$ of norm $p^k$, $\alpha\equiv1\ (2)$, $\alpha\equiv\beta\ (q)$: this is representing $p^k$ by $x_1^2+4x_2^2+4x_3^2+4x_4^2$ in a prescribed class mod $q$, which Malyshev [20] supplies for $p^k$ large and generic. **Remark 1:** strong approximation [16] also gives it.

So $\Lambda(2)/\Lambda(2q)\cong\mathrm{PGL}_2$ or $\mathrm{PSL}_2(\mathbb Z/q)$, $X^{p,q}\cong\Lambda(2)/\Lambda(2q)$, and $X^{p,q}$ is connected.

**Theorem 3.4.** If $\left(\frac pq\right)=-1$: $g(X^{p,q})\ge4\log_pq-\log_p4$ and $|X^{p,q}|=q(q^2-1)$. If $\left(\frac pq\right)=1$: $g(X^{p,q})\ge2\log_pq$ and $|X^{p,q}|=q(q^2-1)/2$.
*Proof.* A shortest cycle through $e$ is a nontrivial $\gamma\in\Lambda(2q)$ of length $t$, i.e. a quaternion of norm $p^t$:

**(3.1)** $p^t=a_0^2+4q^2a_1^2+4q^2a_2^2+4q^2a_3^2$, with some $a_1,a_2,a_3\ne0$.

If $\left(\frac pq\right)=1$, then $p^t\ge4q^2$. If $\left(\frac pq\right)=-1$, then $t=2r$ is even (reduce mod $q$), and

**(3.2)** $X_0^2\equiv p^t \pmod{q^2}$ has only the solutions **(3.2)′** $X_0\equiv\pm p^r\pmod{q^2}$, since $(\mathbb Z/q^2)^*$ is cyclic.

If **(3.3)** $p^t\lt q^4/4$, then $p^r\lt q^2/2$, so a nontrivial solution has $|a_0|\ge q^2/2$, so $p^t\gt q^4/4$: a contradiction. Hence $p^t\ge q^4/4$.

Non-bipartite when $\left(\frac pq\right)=1$: a bipartition would be an index-two subgroup of $\mathrm{PSL}_2(\mathbb Z/q)$, which is simple for $q>3$.

### §4 Spectrum

**Theorem 4.1.** $X^{p,q}$ is a Ramanujan graph.

**Proposition 4.2.** $\liminf_{n\to\infty}\lambda(X_{n,k})\ge2\sqrt{k-1}$.
**(4.1)** $\sum_j\lambda_j^l=\sum_j\delta_{jj}^{(l)}$, where $\delta^{(l)}_{ij}$ counts paths of length $l$ from $i$ to $j$.
**(4.2)** $\sum_j\lambda_j^l\ge n\rho(l)$, where $\rho(l)$ counts closed paths of length $l$ in the tree $T^k$.
**(4.3)** $\lambda(X)^{2l}\ge\rho(2l)-\frac{2k^{2l}}{n-2}$.
With $\rho(2l)\ge\rho'(2l)=\frac1l\binom{2l-2}{l-1}k(k-1)^{l-1}$ (first returns) and $\binom{2l-2}{l-1}^{1/2l}\to2$.

**Proposition 4.3.** If $n\to\infty$ and $g(X_{n,k})\to\infty$, then the spectral measures $\mu_{X_{n,k}}$ (mass $\frac1n$ at each eigenvalue) converge weak* to $\mu_k$:
$$d\mu_k(t)=\frac{\sqrt{k-1-t^2/4}}{\pi k\,(1-(t/k)^2)}\,dt\quad\text{for }|t|\le2\sqrt{k-1},\qquad 0\text{ otherwise.}$$
**(4.4)** $\int t^l\,d\mu_{n,k}\to\int t^l\,d\mu_k$ for each $l$: below the girth the graph's closed-walk counts are the tree's, and those are the moments of $\mu_k$ (Kesten [15]).
For $X^{p,q}$ (girth $\to\infty$ by Theorem 3.4), the spectrum lies in $[-2\sqrt p,2\sqrt p]$ apart from $\pm(p+1)$, distributed by $\mu_{p+1}$ as $q\to\infty$.

*Harmonic analysis on the tree.* $\Gamma$ acts freely on $T=T^k$ with $n=|T/\Gamma|$; $L^2(T/\Gamma)$ is the $\Gamma$-periodic functions.
**(4.5)** $\Delta u_j=\lambda_ju_j$, $u_0=1/\sqrt n$, $\lambda_0=p+1$ (orthonormal basis).
**(4.6)** $k_l(x,y)=1$ if $d(x,y)=l$, else $0$ (point-pair function).
**(4.7)** $K_l(x,y)=\sum_{\gamma\in\Gamma}k_l(\gamma x,y)$, the number of points of $\Gamma x$ at distance $l$ from $y$.
**(4.8)** $K_l(x,y)=\sum_jh_j(l)u_j(x)u_j(y)$ (diagonal because $\Delta$ commutes with $k_l$).
**(4.9)** $L_t(x,y)=\sum_{0\le r\le t/2}K_{t-2r}(x,y)$ (alternate shells).
**(4.10)** $\displaystyle L_t(x,y)=p^{t/2}\sum_{j=0}^{n-1}\frac{\sin(t+1)\theta_j}{\sin\theta_j}u_j(x)u_j(y)$ (from [18]).
**(4.11)** $\lambda_j=2\sqrt p\cos\theta_j$: real $\theta_j$ if $|\lambda_j|\le2\sqrt p$; $\theta_j=i\mu$, $\mu>0$, if $\lambda_j>2\sqrt p$; $\theta_j=\pi+i\mu$ if $\lambda_j<-2\sqrt p$. E.g. $\theta_0=i\log\sqrt p$, and $\theta_{n-1}=\pi+i\log\sqrt p$ if $\lambda_{n-1}=-(p+1)$.
Now take $T=\Lambda(2)$, $\Gamma=\Lambda(2q)$:
**(4.12)** $K_l(x,x)=|\{\gamma\in\Lambda(2q):d(\gamma e,e)=l\}|$ (normality).
**(4.13)** $L_t(x,x)=L_t(e,e)$ for all $x$.

*Counting quaternions.* By Corollary 3.2, $r_Q(p^k)$ counts $\alpha$ with $2q\mid\alpha-a_0$ and $N(\alpha)=p^k$, and these are $\pm p^rR_t$ with $[\alpha]\in\Lambda(2q)$. So $r_Q(p^k)=2\sum_{r\le k/2}|\{\alpha\in\Lambda(2q):d(\alpha,e)=k-2r\}|$, that is:

**(4.14)** $r_Q(p^k)=2L_k(e,e)=2L_k(x,x)$.

**(4.15)** $\displaystyle r_Q(p^k)=\frac{2p^{k/2}}n\sum_{j=0}^{n-1}\frac{\sin(k+1)\theta_j}{\sin\theta_j}$. *(Checked exactly; see `source.md`.)*

**(4.16)** $\displaystyle C(p^k)+O_\varepsilon(p^{k(1/2+\varepsilon)})=\frac{2p^{k/2}}n\sum_{j=0}^{n-1}\frac{\sin(k+1)\theta_j}{\sin\theta_j}$, combining with (1.5).
$C$ comes from the Eisenstein part of $\theta(z)=\sum_{v\in\mathbb Z^4}e^{2\pi iQ(v)z}$ (weight 2, level $16q^2$; Hecke [10]), so $C(n)=\sum_{d\mid n}dF(d)$ with $F$ periodic of period $4q^2$.

**Lemma 4.4.** If $G:\mathbb N\to\mathbb C$ is periodic and $\sum_{d\mid p^k}dG(d)=o(p^k)$ as $k\to\infty$, then $\sum_{d\mid p^k}dG(d)=0$ for all $k$.
*Proof.* **(4.17)** With $\alpha_k=\sum_{d\mid p^k}dG(d)$: $\frac{\alpha_k}{p^k}-\frac{\alpha_{k-1}}{p^{k-1}p}=G(p^k)$. The left side tends to 0 and $G(p^k)$ is periodic in $k$, so $G(p^k)=0$.

**(4.18)** $\sum_{d\mid p^k}dF(d)+O_\varepsilon(\dots)=$ the right side of (4.16).

*Case i,* $\left(\frac pq\right)=-1$: bipartite, eigenvalues in pairs $\pm\lambda$, and $\pm(p+1)$ simple. The trivial pair contributes $0$ for $k$ odd and $\frac{4(p^{k+1}-1)}{n(p-1)}$ for $k$ even. By Lemma 4.4:
**(4.19)** $C(p^k)=0$ ($k$ odd), $\frac{4(p^{k+1}-1)}{n(p-1)}$ ($k$ even).
Cancelling, for $k$ even: $\sum_{j\ne0,n-1}\frac{\sin(k+1)\theta_j}{\sin\theta_j}=O_\varepsilon(p^{\varepsilon k})$, so every such $\theta_j$ is real.

*Case ii,* $\left(\frac pq\right)=1$: not bipartite, so $|\lambda_j|\lt p+1$ for $j\ne0$, and
**(4.20)** $C(p^k)=\frac{2(p^{k+1}-1)}{n(p-1)}$; then $\sum_{j=1}^{n-1}\frac{\sin(k+1)\theta_j}{\sin\theta_j}=O_\varepsilon(p^{k\varepsilon})$, so all $\theta_j$ are real. This proves Theorem 4.1.

**Remark 2** (a referee's shortcut). With $H_0=1$, $H_1=x$, $H_t=xH_{t-1}-pH_{t-2}$ and $L_t=H_t(\Delta)$: $\operatorname{TR}(L_t)=n\,r_Q(p^t)/2$ by the counting above, and $\operatorname{TR}(L_t)=\sum_jH_t(\lambda_j)=\sum_jp^{t/2}\frac{\sin(t+1)\theta_j}{\sin\theta_j}$ spectrally. Equating gives (4.15) with no harmonic analysis.

*The graphs $Y^{p,q}$.* Let $\mathrm{PGL}_2(\mathbb Z/q)$ act on $\mathbb P^1(\mathbb F_q)$ and join $\xi$ to $\gamma\xi$ for $\gamma\in S$: a $(p+1)$-regular graph on $q+1$ vertices. An eigenfunction $f$ of $Y$ gives $F(g)=f(g(0))$ on $X$ with the same eigenvalue, so $Y$ is Ramanujan. $-(p+1)$ is not an eigenvalue: $F$ would be $\pm1$ on $\mathrm{PSL}_2$ and its complement, yet constant on the stabilizer of $0$, $\left\{\left(\begin{smallmatrix}\alpha&0\\\gamma&\delta\end{smallmatrix}\right)\right\}$, which meets both.

**Theorem 4.4.** The graphs $Y^{p,q}$ are non-bipartite Ramanujan graphs of order $q+1$ and degree $p+1$.

### §5 Diameter and other quantities

**(5.1)** $\operatorname{diam}(X^{p,q})=\sup_{x,y\in T}\inf_{\gamma\in\Lambda(2q)}d(x,\gamma y)$.
**(5.2)** If $d_X(x,y)\gt l$ then $\sum_{m\le l}a_mK_m(x,y)=0$ for any coefficients $a_m$.
**(5.3)** Take $\cos(l\arccos x)=\sum_{m=0}^la_mx^m$ (Chebyshev, first kind; the paper calls it $H_l$).
**(5.4)** $\sum_ma_mK_m(x,y)=p^{l/2}\sum_j\cos(l\theta_j)u_j(x)u_j(y)$.
For $l$ even and $d_X(x,y)>l$: $\frac{p^l+1}{2n}\le p^{l/2}\sum_{j\ne0}|u_j(x)u_j(y)|\le p^{l/2}$, so $p^{l/2}\le2n$, i.e. $l\le2\log_p(2n)$.

**Theorem 5.1.** If $n=|X^{p,q}|$ then $\operatorname{diam}(X^{p,q})\le2\log_pn+2\log_p2+1$. (And trivially $\operatorname{diam}\ge\log_pn$.)

From here on, $\left(\frac pq\right)=1$.

**Proposition 5.2** (Alon). If $X_{n,k}$ is a non-bipartite Ramanujan graph, then $i(X)\le\frac{2\sqrt{k-1}}k\,n$.
*Proof.* For an independent set $A$, $|A|=r$:
**(5.5)** $f=1$ on $A$, $-c$ on $A^c$, with $r-(n-r)c=0$, so $f\perp1$.
**(5.6)** $\|\Delta f\|_2^2\le4(k-1)\|f\|_2^2$ (Ramanujan, non-bipartite).
**(5.7)** $\|\Delta f\|_2^2\ge c^2k^2r$ (on $A$, $\Delta f=-ck$).
**(5.8)** $c^2k^2r\le4(k-1)(r+c^2(n-r))$, which with $c=\nu/(1-\nu)$, $\nu=r/n$, gives $\nu\le\frac{2\sqrt{k-1}}k$.

**(5.9)** $\chi(X_{n,k})\ge\frac{k}{2\sqrt{k-1}}$ for non-bipartite Ramanujan $X_{n,k}$.

**Remark 3.** (5.9) also follows from Hoffman [11]. **Remark 4.** Margulis has similar results. Acknowledgements: N. Alon, N. Pippenger.

## 3. Dependencies

```
Jacobi (1.2) ─┐
Dickson [5] ──┴→ Lemma 3.1 → Cor 3.2 → Λ(2) free, the tree
Malyshev [20] ───→ Prop 3.3 → X ≅ Λ(2)/Λ(2q), connected ──┐
Cor 3.2 + Prop 3.3 ──────────→ Thm 3.4 (girth, via (3.1)–(3.3))
PSL₂ simple ───────────────────→ non-bipartite when (p/q)=1
tree = universal cover ────────→ Prop 4.2 (Alon–Boppana); Prop 4.3 (+ Kesten [15], + Thm 3.4)
tree harmonic analysis (4.5)–(4.13), [18]  ┐
Cor 3.2 + Prop 3.3 → (4.14)               ├→ (4.15) ──┐
Remark 2 (Chebyshev trace) ───────────────┘           │
Eichler–Igusa (1.5) + Hecke theta series ─────────────┴→ (4.16) → Lemma 4.4 → (4.19), (4.20) → Thm 4.1
Thm 4.1 + action on ℙ¹ ──→ Thm 4.4 (Y^{p,q})
Thm 4.1 + (5.1)–(5.4) ───→ Thm 5.1 (diameter)
Thm 4.1 + non-bipartite ─→ Prop 5.2 → (5.9) → the introduction's (ii)(c), (d)
```

## 4. New, classical, routine

- **New:** the explicit generators (2.1) and the identification $X^{p,q}\cong\Lambda(2)/\Lambda(2q)$; the counting identity (4.14)–(4.15), which turns a question about eigenvalues into one about representation numbers; the use of Lemma 4.4 to pin down $C(p^k)$ exactly from the graph's trivial eigenvalues; the girth argument (3.1)–(3.3); the graphs $Y^{p,q}$ (Theorem 4.4).
- **Classical inputs:** Jacobi; Dickson's factorization; Malyshev (or strong approximation); Hecke's theta series; Eichler–Igusa (the Ramanujan conjecture in weight 2); Kesten's measure; Alon–Boppana; Alon's independence bound; Hoffman.
- **Routine:** Corollary 3.2 from Lemma 3.1; Propositions 4.2 and 4.3; Theorem 5.1 once (5.4) is in hand; Proposition 5.2.

## 5. Where each hypothesis is used

| Hypothesis | Where |
|---|---|
| $p\equiv1\pmod4$ | exactly one $a_i$ of a norm-$p$ quaternion is odd, so the normalization gives exactly $p+1$ generators in conjugate pairs (§3) |
| $q\equiv1\pmod4$ | $i=\sqrt{-1}$ exists mod $q$, so (2.1) makes sense (§2); with $p\equiv1$, $\left(\frac pq\right)=\left(\frac qp\right)$ |
| $p\ne q$ | the generators are invertible mod $q$; $(m,p)=1$ for $\Lambda(2m)$ (§3) |
| $q>3$ | $\mathrm{PSL}_2(\mathbb Z/q)$ is simple, so $X^{p,q}$ is not bipartite when $\left(\frac pq\right)=1$ (end of §3); automatic since $q\equiv1\ (4)$ |
| $\left(\frac pq\right)=\pm1$ | PSL or PGL; non-bipartite or bipartite; girth $2\log_pq$ or $4\log_pq-\log_p4$; the shape of $C(p^k)$; Proposition 5.2 needs $+1$ |
| no size condition on $q$ | the paper imposes none; small $q$ can give loops or repeated edges |

## 6. Where the weight sits (Theorem 4.1)

1. **(4.15) is exact.** Counting quaternions *is* taking a trace on the graph. Everything about the spectrum is now encoded in the integers $r_Q(p^k)$, $k=0,1,2,\dots$
2. **(1.5) is the deep input.** The cusp-form part of $r_Q(p^k)$ is $O(p^{k/2+\varepsilon})$: Eichler–Igusa, via Weil's Riemann hypothesis for curves. This is the only place the Ramanujan conjecture enters, and the reason for the graphs' name.
3. **Lemma 4.4 removes the main term.** The trivial eigenvalues $\pm(p+1)$ produce exactly a divisor sum $\sum_{d\mid p^k}d$, and the Eisenstein part $C(p^k)$ is a divisor sum with periodic weights. Their difference is $o(p^k)$, so by Lemma 4.4 they agree *exactly*. That fixes $c_1=c_2=4/(q(q^2-1))$.
4. **Why it forces real $\theta_j$.** What is left is $\sum_{j\text{ nontrivial}}\frac{\sin(k+1)\theta_j}{\sin\theta_j}=O(p^{\varepsilon k})$. A non-real $\theta_j=i\mu$ or $\pi+i\mu$ contributes about $\pm e^{k\mu}$, growing exponentially, while real ones are bounded by $k+1$. For **even** $k$ every non-real term is positive, so they cannot cancel each other. The paper says "clearly"; the page should say why. This is also why Case i is run with $k$ even.

## 7. Proposed page spine (for the left-rail link tree)

The paper has no subsections, so subsection titles on the page are **unnumbered** (numbers like "4.3" would collide with Proposition 4.3). The rail shows three levels: part → subsection → statement.

- **Before the paper** (marked as background, short)
  - Expanders and the spectral gap
  - Why $2\sqrt{k-1}$: the tree
- **§1 Introduction**: Definition 1.1 · (1.1) · (1.2)–(1.5) · the list of inequalities · where the graphs come from ($p$-adic picture)
- **§2 Construction of $X^{p,q}$**: (2.1)
- **§3 Quaternions**
  - The free group and its tree: Lemma 3.1 · Corollary 3.2
  - Reducing mod $q$: Proposition 3.3 · Remark 1
  - Girth: Theorem 3.4 · (3.1)–(3.3) · non-bipartiteness
- **§4 Spectrum of $X^{p,q}$**: Theorem 4.1
  - What every large graph must do: Proposition 4.2 · Proposition 4.3
  - Harmonic analysis on the tree: (4.5)–(4.13)
  - Counting quaternions is taking a trace: (4.14) · **(4.15)**
  - Theta series and the main term: (4.16) · Lemma 4.4 · (4.18)
  - The two cases: (4.19) · (4.20) · end of proof
  - Remark 2: the referee's shortcut
  - The graphs $Y^{p,q}$: Theorem 4.4
- **§5 Diameter and other quantities**: Theorem 5.1 · Proposition 5.2 · (5.9) · Remarks 3, 4
- **Reading guide** · **Afterwards** · **References**

## 8. For the check-in

1. Is this the right story and level (a graduate student, with a short background part)?
2. The likely centerpiece figure is (4.15): count quaternions on one side, sum over the spectrum on the other, and watch them agree for each $k$. A companion figure plots $r_Q(p^k)$ against $C(p^k)$, with the error on the $p^{k/2}$ scale.
3. Style: the Taste Lab paper tokens (dim slate, Atkinson Hyperlegible, Playfair Display headings, cobalt accent) are the recommendation, now that the CSS is a full rewrite.
