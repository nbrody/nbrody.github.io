# LPS: figure plan (Stage 3)

Every figure builds the paper's own objects in the browser from the generators (2.1): the quaternions, the group $\Lambda(2)/\Lambda(2q)$, the graph $X^{p,q}$, its spectrum. Shared math lives in `js/lps.js` (pure, tested in node by `tests/lps.test.mjs`); spectra are computed in `js/spectrum-worker.js`.

Default pair: $(p,q)=(5,13)$ wherever a figure needs a full spectrum ($n=2184$ is too slow for a dense eigen-solver in the browser, so spectrum figures default to $(17,13)$, $n=1092$, and offer $(13,5)$, $(29,5)$, $(5,13)$ as a "slow" option). Figures that only count or walk use larger $q$.

| Figure | id | Statement | What it computes | Live check | Default state | Presets |
|---|---|---|---|---|---|---|
| 1 | `generators` | (1.2), §2, Prop. 3.3 | the $p+1$ normalized four-square solutions of $p$, drawn as $(a_1,a_2,a_3)$ in 3-space (conjugates antipodal), and their matrices (2.1) mod $q$ | count $=p+1=r_4(p)/8$; $\det\equiv p$; $\tilde{\bar\alpha}=\tilde\alpha^{-1}$ in PGL; $\left(\frac pq\right)$ picks PSL or PGL | $p=13$, $q=17$, slowly rotating | $p\in\{5,13,17,29,37,41\}$, $q$ picker |
| 2 | `tree` | Lemma 3.1, Cor. 3.2 | click a path in the $(p+1)$-regular tree to build a reduced word; its quaternion; then *factor* any quaternion of norm $p^k$ by peeling one generator at a time | at each step exactly one generator divides; the count of norm-$p^k$ quaternions equals the count of expressions (Jacobi) | $p=5$, a word of length 4 highlighted | "random quaternion", "multiply by $p$" (the $p^r$ factor) |
| 3 | `girth` | Thm. 3.4, (3.1), (4.14) | $r_Q(p^t)$ for $t=0,1,2,\dots$ on a log bar chart; the first $t$ with a nontrivial solution is the girth; its quaternion factored into the shortest relation | girth $\ge 2\log_pq$ or $4\log_pq-\log_p4$ | $(5,13)$: girth 8, bound 5.51 | several $(p,q)$ incl. one each sign of $\left(\frac pq\right)$ |
| 5 | `trace` ★ | (4.15), Remark 2 | spectrum of $X^{p,q}$ with the window $[-2\sqrt p,2\sqrt p]$; the polynomial $H_t$ drawn over it; $\frac2n\sum_jH_t(\lambda_j)$ next to the direct count $r_Q(p^t)$ | the two columns agree exactly for every $t$ | $(17,13)$, $t=4$ | $t$ slider, pair picker |
| 6 | `mainterm` | (1.5), Lemma 4.4, (4.19), (4.20) | $r_Q(p^k)$ vs. $C(p^k)=\frac{4}{q(q^2-1)}\sum_{d\mid p^k}d$; the error on the $p^{k/2}$ scale; a hypothetical eigenvalue $\lambda^\ast>2\sqrt p$ and the term it would add | error stays in a band of width $O(p^{k/2})$; the hypothetical term leaves the band | $(13,17)$, no hypothetical eigenvalue | slider for $\lambda^\ast$ |
| 4 | `kesten` | Prop. 4.2, Prop. 4.3 | eigenvalue histogram vs. the density $\mu_{p+1}$; moments $\frac1n\sum\lambda_j^l$ vs. tree closed-walk counts $\rho(l)$ | moments agree for $l$ below the girth | $(5,13)$ (girth 8; $(17,13)$ has girth 3, so its moments show little) | pair picker |
| 7 | `projective` | Thm. 4.4 | $Y^{p,q}$ on the $q+1$ points of $\mathbb P^1(\mathbb F_q)$ around a circle; its spectrum against the window (and inside $\operatorname{spec}X$ when that is available) | Ramanujan; $-(p+1)$ is not an eigenvalue | $(5,29)$ | $q$ up to ~200 |
| 8 | `balls` | Thm. 5.1, Prop. 5.2 | sphere sizes $|S(r)|$ of $X^{p,q}$ from the identity vs. the tree's $(p+1)p^{r-1}$; diameter; a greedy independent set | diameter $\le 2\log_pn+2\log_p2+1$; independent set $\le \frac{2\sqrt p}{p+1}n$ | $(5,29)$, $n=12180$ | pair picker |

Order on the page: 1 in §2, 2 and 3 in §3, 6 in §4 (first subsection), 4 and 5 in §4 (counting and theta subsections), 7 at Theorem 4.4, 8 in §5.

## As built (November 2, 2026)

All eight figures exist (`js/fig-*.js`); Figure 5 (`trace`) by the main session, the others by parallel helpers, reviewed and caption-matched. Node tests: `tests/lps.test.mjs` (3946), `fig-counts` (598, Figures 3/6/8), `fig-kesten` (101), `fig-projective` (273), `fig-tree` (132). Page check: `../tools/check-page.mjs` — desktop and phone, light and dark, 45 live ✓ per pass, no errors, exact phone width.

Changes from the plan: Figure 4 defaults to $(5,13)$; Figure 5's table also splits the sum into the $\pm(p+1)$ part (exactly $C(p^t)$) and the rest (below $2(t+1)p^{t/2}$); Figure 6's "it leaves the band" line is a deliberate red demonstration, not a failed check.
