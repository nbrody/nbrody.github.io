# Outline

Numbers and pages from the compiled source. "new" = the paper's own argument; "cited" = imported; "routine" = standard estimates.

## §1 Introduction (p. 2)

- **Theorem 1.1 (Cannon's conjecture).** $G$ hyperbolic, $\partial G\cong S^2$ ⇒ a homomorphism $\rho:G\to\mathrm{Isom}(\mathbb H^3)$, proper and cocompact, finite kernel. Orientation-reversing elements allowed.
- History: Cannon 1994 (combinatorial Riemann mapping), Cannon–Swenson 1998, Cannon–Floyd–Parry 1999, Bonk–Kleiner 2002/2005, Bourdon–Kleiner 2013; algebraic routes (Kahn–Marković, Bergeron–Wise, Agol, Marković, Haïssinsky, Groves–Haïssinsky–Manning–Osajda–Sisto–Walsh).
- Outline: $\sup_n M(n)\lt\infty$ suffices. If not: records ⇒ scalar limit $u$ with measure $\mu$; exponential growth (§4) or subexponential (§5–6), each a contradiction.

## §2 Boundary geometry and the modulus criterion (pp. 4–8)

- (2.1) visual metric $C_v^{-1}a^{-(y|z)_e}\le d(y,z)\le C_va^{-(y|z)_e}$; $r_k=a^{-k}$. routine.
- **Lemma 2.1 (Expansion formula)** (2.2) $d(hy,hz)\asymp R\,d(y,z)/(D_yD_z)$, $D_y=\max\{R,d(x,y)\}$; (2.3) puncture $d(hy,p)\lesssim R/D_y$, $\asymp$ near $x$; (2.4) $(v^{-1}|p)_e\ge k-C$. routine (thin triangles), but the complement control is essential later.
- **Lemma 2.2 (Prefixes)** (i), (ii). routine.
- **Lemma 2.3 (Packing)** $Q\ge2$, $s$-separated in $t$-ball ≤ $C_P(t/s)^Q$. routine.
- **Lemma 2.4 (Controlled paths)** constant $L$. Uses $\partial G\cong S^2$ (first use of the hypothesis: path connectedness at all scales via a homeomorphism to the sphere).
- Uniform quasi-Möbius cross-ratio bound for the action (unnumbered).
- (2.5) $\mathcal F_0=\{\diam\pi\ge d_0\}$, $M(n)=\mathrm{Mod}_2(\mathcal F_0,T_n)$ over cells $B(q,2r_n)$, $q\in T_n$ maximal $r_n$-separated.
- **Theorem 2.5 (Bonk–Kleiner; Bourdon–Kleiner)** $\sup M(n)\lt\infty$ ⇒ quasi-Möbius to the round sphere. cited (BK Cor. 3.5 from BK Thm 10.4); paper verifies hypotheses (approximate self-similarity from Lemma 2.1, $\kappa$-approximations).
- **Proposition 2.6 (From the boundary to hyperbolic space)** quasi-Möbius uniformization ⇒ proper cocompact action, finite kernel. Proof: uniform quasiconformality; Sullivan–Tukia circumcenter of the orbit of the round form in the hyperbolic plane of conformal structures (orientation-reversing kept); measurable Riemann mapping; action on ordered triples proper and cocompact. cited method, written out.

## §3 A scalar limit from unbounded modulus (pp. 8–14)

- (3.1) records: $\lambda>1$ if $\limsup M(n)^{1/n}>1$, else $\lambda=1$; $M(N-l)\le\lambda^{-l}M(N)$. new (bookkeeping).
- **Lemma 3.1 (Localization to a rectangle)** $\mathcal Q=[0,1]^2\subset\widehat{\mathcal Q}=[0,1]\times[-1,2]$, left–right modulus $\ge cM(N)$. routine.
- **Lemma 3.2 (Crossings and blockers)** (i) lateral continuum meets every top–bottom path (Jordan); (ii) a compact blocker contains a lateral continuum (grid labelling A/B, parity of interface ends, Hausdorff limit). classical, proved.
- **Lemma 3.3 (Crossing dual weights)** (3.2) admissible top–bottom weights with $\sum\rho_q^2\le C/M(N)$. Least-norm point $P$ of the convex hull of crossing incidence vectors. discrete extremal length (Cannon–Floyd–Parry; Albin–Poggi-Corradini), reproved.
- **Lemma 3.4 (Regularization and level continua)** envelopes $F_N,H_N$ of the interpolated cost function; (3.3) $\osc_K H_N\le\osc_KF_N\le\osc_KU^0_N$; level $\{H_N=t\}\cap\mathcal Q$ contains a lateral continuum $C_{N,t}$ of diameter $\ge d_1$ met by every straddling path. new. **Paper's Figure 1** (p. 11).
- **Lemma 3.5 (Local oscillation)** (3.4) $\osc_{\overline B(x,Jr_N)}H_N\le\sum_{d(q,x)\le C(J)r_N}\rho_q$; translated energies $\mathcal E_N^{(J)}(H_N\circ g^{-1};K')\le C/M(N)\to0$. new.
- **Lemma 3.6 (Annular estimate)** (3.5) $\Delta^2\le CM(N-l)\sum_{R/4\le d(q,x)\le4R}\rho_q^2$. new; where records enter.
- **Proposition 3.7 (Scalar limit)** $H_N\to u$ locally uniformly, $\mu_N\rightharpoonup\mu$, $u$ nonconstant, Hölder if $\lambda>1$ (exponent $\log\lambda/(2\log a)$); (3.6) $(\osc_{\overline B(x,s)}u)^2\le C\mu(\overline B(x,C_\mu s))$; level continua $C_t$. new.
- **Lemma 3.8 (A finite-cell level comparison)** (3.7) $b_0|I|\le\sum_q\osc f\,\osc w$. new; the engine of §4 and §6.
- **Lemma 3.9 (Stopping a continuum at a sphere)**. point-set topology.

## §4 Exponential records (pp. 14–18), $\lambda>1$

- **Lemma 4.1 (Hölder magnification)** (4.1) $F_i=(f\circ h_i^{-1}-f(x_i))/\sigma_i\to F$ nonconstant on $Z\setminus\{b\}$; (4.2)–(4.5).
- **Lemma 4.2 (Diagonal approximants)** (4.6) translated energies of $f_j\circ g^{-1}$ → 0; continua $D_{j,t}$ escaping to the puncture $b$.
- **Lemma 4.3 (Transform comparison)** (4.7) $V=W\circ g^{-1}$ constant ($=V(b)$) on $\mathcal N(W)\setminus\{c\}$ when $c=gb\ne b$; (4.8) two transforms. Uses Lemma 3.8 + vanishing energies.
- **Lemma 4.4 (Stabilizer directions)** (4.9) $\#\{q\in\mathrm{Stab}(b):|q|\le t\}\le C'(t+1)$; at most two accumulation directions.
- **Proposition 4.5** $\lambda>1$ impossible: second magnification gives two disks with disjoint ranges; (4.8) forces one value. new.

## §5 A probability flow in the subexponential case (pp. 18–24), $\lambda=1$, (5.1)

- Nodes $(x,R,J)$, (5.2) straddling; candidates $Y$ in an annulus, (5.3) $\#Y\le C_Ya^{QD}$; $t_y=|J_y|/\Delta$, (5.4).
- Good node (5.5)–(5.6): two candidates with inner ranges in the bottom/top quarters and outer ranges $\Delta/4$ apart.
- (5.7) $b_*=1/2$, $\tau=1/20$, $\beta=\tau/(4(Q+1))$, $\gamma=\beta/2$; (5.8) not good: $p_y\le a^{-\gamma D}t_y$, $p_y\le a^{-b_*D}t_y^2$; (5.9) good: $p_y\le a^{-\gamma D}t_y$, $p_y\le a^{\tau D}t_y^2$.
- (5.10) constant choice. **Lemma 5.1 (Many children at a node that is not good)** $\ge c_Ha^D$ separated candidates with $t_y\ge1/8$.
- **Lemma 5.2 (Separated capacity)** (5.11) $\sum\min\{a^{-\gamma D}t_y,a^{\tau D}t_y^2\}\ge1$; proof (5.12)–(5.17) removes large ranges and detects remaining levels by modulus at relative scale $r/s$; uses subexponential growth: $M(D-D')\le a^{\tau D/4}$.
- (5.18) patterns: finitely many target ball pairs.
- (5.19)–(5.20) $\sum_i\Delta_i^2\le E_0$ at each level (from (3.6), disjoint enlargements).
- (5.21) $P_i\le a^{-\gamma Dn}\Delta_i/\Delta_0$, $\Delta_i^2\ge\Delta_0^2P_ia^{D((b_*+\tau)m_i-\tau n)}$; (5.22) conditional.
- **Lemma 5.3 (Levels with substantial good mass)** Jensen: average bad mass $\le\tau/(b_*+\tau)+O(1/n)=1/11+O(1/n)$ ⇒ infinitely many levels with good mass $\ge1/2$. new.
- **Proposition 5.4 (Properties of the flow)**. summary.

## §6 Same-depth expansions and the measure comparison (pp. 24–29)

- **Proposition 6.1** unbounded + subexponential impossible.
- (6.1) flow input. **Lemma 6.2 (Bounded puncture multiplicity)**. (6.2)–(6.3) a probability class $\mathcal I$ with $\mathcal NP_*\ge c/(2k)$; $\zeta=\gamma/Q$, $m=\lfloor\zeta n\rfloor$, $l=Dm$.
- **Lemma 6.3 (Probability near a puncture)** (6.4) $\sum_{d(p_j,p_i)\le a^{-l}}P_j\le Ca^{-\gamma Dm}$; split geodesic word $v_j^{-1}=w_ju_j'$. ⇒ (6.5) $\ge c\mathcal N^2$ far pairs $d_{ij}>a^{-l}$.
- (6.6) exterior preimage; $E_i=\overline B(p_i,A_hR)$.
- **Lemma 6.4 (Pair alternative)** (6.7) $\osc_{h_i^{-1}E_j}u\ge\kappa\Delta_i/16$ for one endpoint. Uses Lemma 3.8 again.
- (6.8) $D_{z_{ij}}\asymp R/d_{ij}$; (6.9) $h_i^{-1}E_j\subseteq\overline B(z_{ij},s_{ij})$, $s_{ij}=C_2R^2/d_{ij}^2$; (6.10) $\mu(\mathcal D_{ij})\ge c\kappa^2\Delta_i^2$; (6.11) $h_i\mathcal D_{ij}\subseteq\overline B(p_j,C_3R)$; **paper's Figure 2** (p. 28); (6.12) $\mathcal D_{ij}\subseteq\overline B(x_i,C_4Ra^l)$.
- (6.13) total cost $\le Ca^{Ql}\mu(Z)$; (6.14) total cost $\ge c'k^{-2}a^{2\gamma Dn}$ ⇒ $a^{\gamma Dn}\le Ck^2$, contradiction.

## §7 Completion, §8 Consequences (p. 29)

- Completion: records ⇒ exponential (Prop. 4.5) or subexponential (Prop. 6.1), both impossible; Theorem 2.5 + Proposition 2.6.
- **Corollary 8.1** torsion-free ⇒ closed hyperbolic 3-manifold (maybe nonorientable).
- **Corollary 8.2 (Virtual structure in the torsion-free case)** virtually $\pi_1(\Sigma)\rtimes\mathbb Z$, $b_1^{\rm virt}>0$, virtually compact special, residually finite. cited (Agol; Bergeron–Wise).

## Where the weight sits

1. Lemma 3.4: turning dual weights into continuous functions whose level sets are honest separating continua, with oscillation controlled by the weights.
2. Lemma 3.8 with Lemma 3.5: two transforms with different punctures cannot both have vanishing local energy along a family of level continua. Used in §4 (Lemma 4.3) and §6 (Lemma 6.4).
3. §5: the transition bounds and the Jensen budget (1/11), in particular Lemma 5.2, the only place subexponential growth is used inside the tree.
4. §6: the far-pair counting, Lemma 6.3 (word splitting) and the cost-ball scale separation (6.8)–(6.12).

## Slips noticed

None affecting the argument was found in the first read. (The paper calls $y=0$ the top edge of $\mathcal Q=[0,1]^2$, with the "bottom band" $[0,1]\times[1,2]$: top is the low $y$ coordinate. The page follows that convention and draws $y$ downward.)
