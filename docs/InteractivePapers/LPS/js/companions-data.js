// Content for the companion pages (dependency graph, definitions, notation, cited results, print slips).
// Plain data: HTML strings with $…$ math. Numbered references written as plain text ("Lemma 3.1", "(4.15)", "§3")
// become links with previews automatically (refs.js). Links to another companion page: href="#view-defs/cayley".

const R = String.raw;

// ───────────────────────── dependency graph ─────────────────────────
// kind: def | lemma | prop | thm | goal | eq | remark | input
// target: id on the page (null for inputs that live only on the Cited results page; then `cite` names that entry)
// uses: ids of the nodes this one rests on

export const DEP_NODES = [
  // cited inputs
  { id: 'jacobi', kind: 'input', label: R`Jacobi (1.2)`, gist: R`$r_4(n)=8\sum_{4\nmid d\mid n}d$`, target: 'eq-1-2', uses: [] },
  { id: 'dickson', kind: 'input', label: 'Dickson', gist: 'factorization of odd quaternions', cite: 'dickson', uses: [] },
  { id: 'malyshev', kind: 'input', label: 'Malyshev', gist: 'representations in residue classes', cite: 'malyshev', uses: [] },
  { id: 'simple', kind: 'input', label: R`$\PSL_2(\F_q)$ simple`, gist: R`for $q>3$`, cite: 'simple', uses: [] },
  { id: 'cyclic', kind: 'input', label: R`$(\Z/q^2)^*$ cyclic`, gist: R`$X_0^2\equiv p^{2r}$ has two roots`, cite: 'cyclic', uses: [] },
  { id: 'kesten', kind: 'input', label: 'Kesten', gist: R`moments of $\mu_k$ are tree walks`, cite: 'kesten', uses: [] },
  { id: 'spherical', kind: 'input', label: 'Spherical functions', gist: R`the expansion (4.10), from [18]`, cite: 'spherical', uses: [] },
  { id: 'hecke', kind: 'input', label: 'Hecke', gist: R`$\theta_Q$ = Eisenstein + cusp form`, cite: 'hecke', uses: [] },
  { id: 'eichler', kind: 'input', label: R`Eichler–Igusa (1.5)`, gist: R`$r_Q(p^k)=C(p^k)+O(p^{k/2+\varepsilon})$`, target: 'eq-1-5', uses: ['qform', 'hecke'] },

  // §1–2
  { id: 'def11', kind: 'def', label: 'Definition 1.1', gist: R`Ramanujan: $\lambda(X)\le2\sqrt{k-1}$`, target: 'def-1-1', uses: [] },
  { id: 'qform', kind: 'def', label: R`(1.3)–(1.4)`, gist: R`the form $Q$ and $r_Q(n)$`, target: 'eq-1-3', uses: [] },
  { id: 'gens', kind: 'def', label: R`(2.1)`, gist: R`$p+1$ generators, matrices mod $q$`, target: 'eq-2-1', uses: ['jacobi'] },

  // §3
  { id: 'lem31', kind: 'lemma', label: 'Lemma 3.1', gist: R`unique factorization, norm $p^k$`, target: 'lem-3-1', uses: ['jacobi', 'dickson', 'gens'] },
  { id: 'cor32', kind: 'lemma', label: 'Corollary 3.2', gist: R`$\Lambda(2)$ is free; its Cayley graph is the tree`, target: 'cor-3-2', uses: ['lem31'] },
  { id: 'prop33', kind: 'prop', label: 'Proposition 3.3', gist: R`image mod $q$ is $\PSL_2$ or $\PGL_2$`, target: 'prop-3-3', uses: ['malyshev', 'gens'] },
  { id: 'eq31', kind: 'eq', label: '(3.1)', gist: 'a cycle is a small quaternion', target: 'eq-3-1', uses: ['cor32', 'prop33'] },
  { id: 'thm34', kind: 'thm', label: 'Theorem 3.4', gist: R`girth $\ge 2\log_pq$ or $4\log_pq-\log_p4$`, target: 'thm-3-4', uses: ['eq31', 'cyclic'] },
  { id: 'nonbip', kind: 'remark', label: 'Not bipartite', gist: R`when $\leg pq=1$ (end of §3)`, target: 'p-nonbip', uses: ['prop33', 'simple'] },

  // §4
  { id: 'prop42', kind: 'prop', label: 'Proposition 4.2', gist: R`Alon–Boppana, proving (1.1)`, target: 'prop-4-2', uses: ['def11'] },
  { id: 'prop43', kind: 'prop', label: 'Proposition 4.3', gist: R`spectrum $\to\mu_k$ when girth $\to\infty$`, target: 'prop-4-3', uses: ['kesten', 'thm34'] },
  { id: 'eq410', kind: 'eq', label: '(4.10)', gist: R`$L_t$ in the eigenbasis`, target: 'eq-4-10', uses: ['spherical'] },
  { id: 'eq414', kind: 'eq', label: '(4.14)', gist: R`$r_Q(p^k)=2L_k(e,e)$`, target: 'eq-4-14', uses: ['qform', 'cor32', 'prop33'] },
  { id: 'rem2', kind: 'remark', label: 'Remark 2', gist: R`$\TR H_t(\Delta)$, no harmonic analysis`, target: 's4-remark2', uses: ['eq414'] },
  { id: 'eq415', kind: 'eq', label: '(4.15)', gist: 'counting quaternions = a trace', target: 'eq-4-15', uses: ['eq414', 'eq410', 'rem2'], key: true },
  { id: 'eq416', kind: 'eq', label: '(4.16)', gist: R`main term + error = spectral sum`, target: 'eq-4-16', uses: ['eq415', 'eichler'] },
  { id: 'lem44', kind: 'lemma', label: 'Lemma 4.4', gist: 'periodic divisor sums', target: 'lem-4-4', uses: [] },
  { id: 'eq419', kind: 'eq', label: '(4.19)', gist: R`Case i: $C(p^k)$ exactly`, target: 'eq-4-19', uses: ['eq416', 'lem44', 'hecke'] },
  { id: 'eq420', kind: 'eq', label: '(4.20)', gist: R`Case ii: $C(p^k)$ exactly`, target: 'eq-4-20', uses: ['eq416', 'lem44', 'hecke', 'nonbip'] },
  { id: 'thm41', kind: 'goal', label: 'Theorem 4.1', gist: R`$X^{p,q}$ is Ramanujan`, target: 'thm-4-1', uses: ['eq419', 'eq420', 'def11'] },
  { id: 'thm44', kind: 'thm', label: 'Theorem 4.4', gist: R`$Y^{p,q}$ is Ramanujan`, target: 'thm-4-4', uses: ['thm41', 'prop33'] },

  // §5
  { id: 'eq54', kind: 'eq', label: '(5.4)', gist: R`Chebyshev kernel in the eigenbasis`, target: 'eq-5-4', uses: ['eq410'] },
  { id: 'thm51', kind: 'thm', label: 'Theorem 5.1', gist: R`$\diam\le2\log_pn+2\log_p2+1$`, target: 'thm-5-1', uses: ['eq54', 'thm41'] },
  { id: 'prop52', kind: 'prop', label: 'Proposition 5.2', gist: R`Alon: $i(X)\le\frac{2\sqrt{k-1}}k n$`, target: 'prop-5-2', uses: ['def11'] },
  { id: 'eq59', kind: 'eq', label: '(5.9)', gist: R`$\chi(X^{p,q})\ge\frac{p+1}{2\sqrt p}$`, target: 'eq-5-9', uses: ['prop52', 'thm41', 'nonbip'] },
];

// ───────────────────────── definitions ─────────────────────────
// level: basic | intermediate | specialized · origin: paper | background · where: text with references

export const DEF_TOPICS = ['Graphs and their spectra', 'Groups', 'Quaternions', 'Number theory', 'Modular forms', 'Trees and harmonic analysis'];

export const DEFINITIONS = [
  // Graphs and their spectra
  { key: 'regular', topic: 0, level: 'basic', origin: 'background', term: 'Regular graph',
    text: R`A graph is $k$-<em>regular</em> if every vertex has exactly $k$ neighbours. The graphs here may have loops and repeated edges when $q$ is small; each counts toward the degree.` },
  { key: 'adjacency', topic: 0, level: 'basic', origin: 'background', term: R`Adjacency matrix`,
    text: R`$A_{xy}$ is the number of edges joining $x$ and $y$. It is symmetric, so its eigenvalues are real: $k=\lambda_0\ge\lambda_1\ge\dots\ge\lambda_{n-1}\ge-k$ for a $k$-regular graph. <b>The paper writes $\Delta$ for it</b> (not the Laplacian).`, where: '§1, (4.5)' },
  { key: 'bipartite', topic: 0, level: 'basic', origin: 'background', term: 'Bipartite',
    text: R`The vertices split into two sides with every edge crossing between them. A connected $k$-regular graph is bipartite exactly when $-k$ is an eigenvalue.`, where: '§1, §2' },
  { key: 'girth', topic: 0, level: 'basic', origin: 'paper', term: R`Girth $g(X)$, diameter $\diam(X)$`,
    text: R`The girth is the length of the shortest cycle; the diameter is the largest distance between two vertices.`, where: 'Theorem 3.4, Theorem 5.1' },
  { key: 'independence', topic: 0, level: 'basic', origin: 'paper', term: R`Independence number $i(X)$, chromatic number $\chi(X)$`,
    text: R`$i(X)$ is the size of the largest set of vertices with no edges among them. $\chi(X)$ is the fewest colours needed so that adjacent vertices differ. Each colour class is independent, so $\chi(X)\ge n/i(X)$.`, where: 'Proposition 5.2, (5.9)' },
  { key: 'cheeger', topic: 0, level: 'intermediate', origin: 'background', term: R`Cheeger constant $h(X)$`,
    text: R`$h(X)=\min_{0\lt|S|\le n/2}|\partial S|/|S|$, where $\partial S$ is the set of edges leaving $S$. Small $h$ means a bottleneck.` },
  { key: 'expander', topic: 0, level: 'intermediate', origin: 'background', term: 'Expander family',
    text: R`A sequence of $k$-regular graphs with $n\to\infty$ and $h(X)$ bounded away from $0$. By the Cheeger inequalities $\frac{k-\lambda_1}2\le h(X)\le\sqrt{2k(k-\lambda_1)}$, this is the same as a uniform spectral gap $k-\lambda_1$.` },
  { key: 'lambdaX', topic: 0, level: 'intermediate', origin: 'paper', term: R`$\lambda(X)$`,
    text: R`The largest $|\lambda_j|$ among eigenvalues other than $\pm k$. Equivalently, $\lambda(X)^2$ is the next-to-largest eigenvalue of $\Delta^2$.`, where: '§1' },
  { key: 'ramanujan', topic: 0, level: 'intermediate', origin: 'paper', term: 'Ramanujan graph',
    text: R`A $k$-regular graph with $\lambda(X)\le2\sqrt{k-1}$: every nontrivial eigenvalue is as small as the Alon–Boppana bound (1.1) allows. Named for the Ramanujan conjecture, which is what proves it for $X^{p,q}$.`, where: 'Definition 1.1, Theorem 4.1' },
  { key: 'cayley', topic: 0, level: 'intermediate', origin: 'paper', term: 'Cayley graph',
    text: R`For a group $G$ and a set $S\subset G$ closed under inverses: vertices $G$, and $x$ joined to $sx$ for each $s\in S$. It is $|S|$-regular and looks the same from every vertex.`, where: '§2' },
  { key: 'Xpq', topic: 0, level: 'intermediate', origin: 'paper', term: R`The graphs $X^{p,q}$ and $Y^{p,q}$`,
    text: R`$X^{p,q}$: the Cayley graph of $\PSL_2(\Z/q)$ (if $\leg pq=1$) or $\PGL_2(\Z/q)$ (if $\leg pq=-1$) with the $p+1$ generators (2.1). $Y^{p,q}$: the same generators acting on the $q+1$ points of $\PP^1(\F_q)$.`, where: '§2, Theorem 4.4' },
  { key: 'spectralmeasure', topic: 0, level: 'specialized', origin: 'paper', term: R`Spectral measure $\mu_X$, weak-$*$ convergence`,
    text: R`$\mu_X=\frac1n\sum_j\delta_{\lambda_j}$, a probability measure on $[-k,k]$. Measures $\mu_n\to\mu$ weak-$*$ if $\int f\,d\mu_n\to\int f\,d\mu$ for every continuous $f$; for measures on an interval it is enough to check moments.`, where: 'Proposition 4.3' },
  { key: 'kestenmeasure', topic: 0, level: 'specialized', origin: 'paper', term: R`Kesten's measure $\mu_k$`,
    text: R`The spectral measure of the $k$-regular tree at a vertex: density $\frac{\sqrt{k-1-t^2/4}}{\pi k(1-(t/k)^2)}$ on $|t|\le2\sqrt{k-1}$. Its moments are the tree's closed-walk counts $\rho(l)$. Also called the Kesten–McKay law.`, where: 'Proposition 4.3' },
  { key: 'nonbacktracking', topic: 0, level: 'intermediate', origin: 'background', term: 'Non-backtracking walk',
    text: R`A walk that never immediately reverses the edge it just used. In a Cayley graph of a free group these are the reduced words. Counting them is what $H_t(\Delta)$ does in Remark 2.`, where: 'Remark 2' },

  // Groups
  { key: 'freegroup', topic: 1, level: 'intermediate', origin: 'paper', term: 'Free group, reduced word',
    text: R`A group generated by $\alpha_1,\dots,\alpha_s$ with no relations except those forced by inverses. A word is <em>reduced</em> if no letter sits next to its inverse; in a free group distinct reduced words are distinct elements, and the Cayley graph is a $2s$-regular tree.`, where: 'Lemma 3.1, Corollary 3.2' },
  { key: 'pgl', topic: 1, level: 'intermediate', origin: 'paper', term: R`$\PGL_2(\F_q)$ and $\PSL_2(\F_q)$`,
    text: R`$\PGL_2$ is invertible $2\times2$ matrices modulo scalars; it has $q(q^2-1)$ elements. $\PSL_2$ is the image of the determinant-one matrices, of index two for odd $q$, with $q(q^2-1)/2$ elements. A matrix lies in $\PSL_2$ exactly when its determinant is a square.`, where: '§2, Proposition 3.3' },
  { key: 'simplegroup', topic: 1, level: 'intermediate', origin: 'background', term: 'Simple group',
    text: R`A group with no normal subgroups except itself and the identity. $\PSL_2(\F_q)$ is simple for $q>3$, so it has no index-two subgroup — which rules out a bipartition of $X^{p,q}$ when $\leg pq=1$.`, where: '§3' },
  { key: 'normal', topic: 1, level: 'basic', origin: 'background', term: 'Normal subgroup, quotient',
    text: R`$N\trianglelefteq G$ if $gNg^{-1}=N$ for all $g$; then $G/N$ is a group. Dividing the tree $\Lambda(2)$ by a normal subgroup of finite index gives a finite Cayley graph of the quotient.`, where: '§3' },
  { key: 'lambda2', topic: 1, level: 'intermediate', origin: 'paper', term: R`$\Lambda(2)$`,
    text: R`Quaternions $\alpha\equiv1\pmod2$ of norm a power of $p$, with $\alpha$ and $\beta$ identified when $\pm p^{v_1}\alpha=p^{v_2}\beta$. A free group on $[\alpha_1],\dots,[\alpha_s]$, so its Cayley graph is the $(p+1)$-regular tree.`, where: 'Corollary 3.2' },
  { key: 'congruence', topic: 1, level: 'specialized', origin: 'paper', term: R`Congruence subgroup $\Lambda(2m)$`,
    text: R`For $(m,p)=1$, the classes $[\alpha]\in\Lambda(2)$ with $2m\mid a_1,a_2,a_3$: the kernel of reduction mod $2m$. With $m=q$, $\Lambda(2)/\Lambda(2q)$ is $\PGL_2(\Z/q)$ or $\PSL_2(\Z/q)$, and $X^{p,q}$ is the tree folded up by $\Lambda(2q)$.`, where: '§3, (4.12)' },
  { key: 'projline', topic: 1, level: 'intermediate', origin: 'paper', term: R`Projective line $\PP^1(\F_q)$`,
    text: R`The $q+1$ points $\{0,1,\dots,q-1,\infty\}$, on which $\PGL_2(\F_q)$ acts by $z\mapsto\frac{az+b}{cz+d}$. The stabilizer of $0$ is the lower-triangular matrices.`, where: 'Theorem 4.4' },

  // Quaternions
  { key: 'quaternions', topic: 2, level: 'basic', origin: 'paper', term: R`Integral quaternions $H(\Z)$`,
    text: R`$\alpha=a_0+a_1\bi+a_2\bj+a_3\bk$ with $a_j\in\Z$, $\bi^2=\bj^2=\bk^2=-1$, $\bi\bj=-\bj\bi=\bk$. Multiplication is associative but not commutative.`, where: '§3' },
  { key: 'qnorm', topic: 2, level: 'basic', origin: 'paper', term: R`Conjugate $\bar\alpha$, norm $N(\alpha)$`,
    text: R`$\bar\alpha=a_0-a_1\bi-a_2\bj-a_3\bk$ and $N(\alpha)=\alpha\bar\alpha=a_0^2+a_1^2+a_2^2+a_3^2$. The norm is multiplicative, $N(\alpha\beta)=N(\alpha)N(\beta)$, and $\bar\alpha$ is $N(\alpha)\,\alpha^{-1}$.`, where: '§3' },
  { key: 'units', topic: 2, level: 'intermediate', origin: 'paper', term: 'Units, associates',
    text: R`The units of $H(\Z)$ are the eight elements $\pm1,\pm\bi,\pm\bj,\pm\bk$ of norm $1$. Two quaternions are associates if one is a unit times the other. Each norm-$p$ quaternion has exactly one associate that is $\equiv1\pmod 2$ with $a_0>0$.`, where: '§3' },
  { key: 'odd', topic: 2, level: 'specialized', origin: 'paper', term: R`$\alpha\equiv1\pmod 2$`,
    text: R`$a_0$ odd and $a_1,a_2,a_3$ even. This normalization picks one associate in each class and makes the generators of §2 well defined.`, where: 'Corollary 3.2' },
  { key: 'gens', topic: 2, level: 'intermediate', origin: 'paper', term: R`The generators $S$`,
    text: R`The $p+1$ quaternions of norm $p$ with $a_0>0$ odd and $a_1,a_2,a_3$ even, in conjugate pairs $\alpha_j,\bar\alpha_j$. Their matrices (2.1) mod $q$ generate $X^{p,q}$.`, where: '§2, §3' },
  { key: 'severibrauer', topic: 2, level: 'specialized', origin: 'background', term: 'Severi–Brauer variety, splitting',
    text: R`The Severi–Brauer variety of a quaternion algebra is the conic of its minimal left ideals; for $H$ it is $x^2+y^2+z^2=0$, with no rational points because $H$ is not split over $\Q$. A field $F$ <em>splits</em> $H$ if $H\otimes F\cong M_2(F)$; then the conic becomes $\PP^1(F)$. $H$ splits at every odd prime $p$; for $p\equiv1\pmod4$ an explicit splitting is $\mathbf i\mapsto\left(\begin{smallmatrix}j&0\\0&-j\end{smallmatrix}\right)$ with $j^2\equiv-1$, as in (2.1). A rank-one matrix, such as a norm-$p$ quaternion mod $p$, picks out a point: its kernel.`, where: 'Figure 1' },
  { key: 'foursquares', topic: 2, level: 'basic', origin: 'paper', term: 'Sums of four squares',
    text: R`Every positive integer is a sum of four squares (Lagrange). Jacobi counts the ways: $r_4(n)=8\sum_{d\mid n,\,4\nmid d}d$. For a prime $p$ this is $8(p+1)$.`, where: '(1.2), Lemma 3.1' },

  // Number theory
  { key: 'legendre', topic: 3, level: 'basic', origin: 'paper', term: R`Legendre symbol $\leg aq$`,
    text: R`For an odd prime $q\nmid a$: $1$ if $a$ is a square mod $q$, $-1$ if not. It equals $a^{(q-1)/2}\bmod q$ (Euler).`, where: '§2, Proposition 3.3' },
  { key: 'reciprocity', topic: 3, level: 'intermediate', origin: 'background', term: 'Quadratic reciprocity',
    text: R`For odd primes $p\ne q$, $\leg pq\leg qp=(-1)^{\frac{p-1}2\frac{q-1}2}$. Since $p\equiv q\equiv1\pmod4$ here, $\leg pq=\leg qp$, which is why the paper can use either.`, where: '§1' },
  { key: 'divisorsum', topic: 3, level: 'basic', origin: 'background', term: 'Divisor sum',
    text: R`$\sum_{d\mid n}d$. For $n=p^k$ it is $1+p+\dots+p^k=\frac{p^{k+1}-1}{p-1}$, which is also $H_k(p+1)$ — the trivial eigenvalue's contribution in (4.15).` },
  { key: 'reprnum', topic: 3, level: 'intermediate', origin: 'paper', term: R`Quadratic form $Q$, representation number $r_Q(n)$`,
    text: R`$Q=x_1^2+4q^2(x_2^2+x_3^2+x_4^2)$, and $r_Q(n)$ counts $v\in\Z^4$ with $Q(v)=n$. A solution with $Q(v)=p^k$ is a quaternion of norm $p^k$ whose $\bi,\bj,\bk$ parts are divisible by $2q$.`, where: '(1.3), (1.4), (4.14)' },
  { key: 'padic', topic: 3, level: 'intermediate', origin: 'background', term: R`$p$-adic numbers $\Q_p$, $\Z_p$`,
    text: R`$\Q_p$ completes $\Q$ for $|x|_p=p^{-v_p(x)}$; $\Z_p$ is its unit ball. They give the paper's second picture of the tree, $\PGL_2(\Q_p)/\PGL_2(\Z_p)$.`, where: '§1' },
  { key: 'singular', topic: 3, level: 'specialized', origin: 'paper', term: 'Singular series',
    text: R`The Hardy–Littlewood prediction for $r_Q(n)$, made from the singularities of $\theta_Q$ at the cusps $a/m$: a sum of Gauss sums over all $a/m$, which factors as a product of local densities, one for each prime, times the volume factor at infinity. For four or more variables it is the coefficient of the Eisenstein part of the theta series; here it is $C(n)$.`, where: '(4.16), Proposition 3.3, Figure S3' },
  { key: 'strongapprox', topic: 3, level: 'specialized', origin: 'background', term: 'Strong approximation',
    text: R`For a simply connected group such as the norm-one quaternions, noncompact at a place $v$, the rational points are dense in the adelic points away from $v$. Taking $v=p$, it says $\Lambda(2)$ reduces onto $\PSL_2(\F_q)$: Remark 1's route to Proposition 3.3.`, where: 'Proposition 3.3' },

  // Modular forms
  { key: 'modform', topic: 4, level: 'specialized', origin: 'background', term: 'Modular form of weight $k$',
    text: R`A holomorphic function on the upper half-plane with $f\big(\frac{az+b}{cz+d}\big)=(cz+d)^kf(z)$ for all $\left(\begin{smallmatrix}a&b\\c&d\end{smallmatrix}\right)$ in a congruence subgroup of $\SL_2(\Z)$, and holomorphic at the cusps. It has a Fourier expansion $\sum a_ne^{2\pi inz}$.` },
  { key: 'theta', topic: 4, level: 'specialized', origin: 'paper', term: R`Theta series $\theta_Q$`,
    text: R`$\theta(z)=\sum_{v\in\Z^4}e^{2\pi iQ(v)z}=\sum_nr_Q(n)e^{2\pi inz}$: a modular form of weight $4/2=2$ for $\Gamma(16q^2)$, whose coefficients are the counts $r_Q(n)$.`, where: '(4.16)' },
  { key: 'eisenstein', topic: 4, level: 'specialized', origin: 'paper', term: 'Eisenstein series',
    text: R`The modular forms orthogonal to all cusp forms. Their coefficients are explicit divisor sums, here $C(n)=\sum_{d\mid n}dF(d)$ with $F$ periodic of period $4q^2$.`, where: '(4.16), Lemma 4.4' },
  { key: 'cusp', topic: 4, level: 'specialized', origin: 'background', term: 'Cusp form',
    text: R`A modular form vanishing at every cusp. Its coefficients are much smaller than an Eisenstein series': this is where the error term in (1.5) comes from.`, where: '(1.5)' },
  { key: 'rpconj', topic: 4, level: 'specialized', origin: 'paper', term: 'Ramanujan–Petersson conjecture',
    text: R`For a cusp form of weight $k$, the coefficients satisfy $a_n=O(n^{(k-1)/2+\varepsilon})$. Weight $2$ was proved by Eichler and Igusa using Weil's Riemann hypothesis for curves over finite fields; all weights by Deligne (1974). For $\theta_Q$ it gives the $p^{k/2+\varepsilon}$ error in (1.5) — and that square root is exactly $2\sqrt{k-1}$ on the graph.`, where: '(1.5)' },
  { key: 'heckeop', topic: 4, level: 'specialized', origin: 'background', term: 'Hecke operator (the modern view)',
    text: R`An averaging operator $T_p$ on modular or automorphic forms. In the modern reading, the adjacency operator of $X^{p,q}$ <em>is</em> a Hecke operator on automorphic forms for the quaternion algebra, so its eigenvalues are Hecke eigenvalues. The paper does not use this language; it counts instead.` },

  // Trees and harmonic analysis
  { key: 'tree', topic: 5, level: 'basic', origin: 'paper', term: R`The $k$-regular tree $T_k$`,
    text: R`The connected graph with no cycles in which every vertex has degree $k$. It is the universal cover of every connected $k$-regular graph; its adjacency operator has spectrum $[-2\sqrt{k-1},2\sqrt{k-1}]$.`, where: 'Proposition 4.2, §4' },
  { key: 'bruhattits', topic: 5, level: 'specialized', origin: 'background', term: 'Bruhat–Tits tree',
    text: R`For $\PGL_2(\Q_p)$: vertices are rank-two $\Z_p$-lattices in $\Q_p^2$ up to scaling, joined when one contains the other with index $p$. It is the $(p+1)$-regular tree $\PGL_2(\Q_p)/\PGL_2(\Z_p)$. In this picture $\Lambda(2)$ sits inside $\PGL_2(\Q_p)$ and acts simply transitively on the vertices, which is why its Cayley graph is this tree.`, where: '§1' },
  { key: 'pointpair', topic: 5, level: 'specialized', origin: 'paper', term: R`Point-pair function $k_l$, kernel $K_l$`,
    text: R`$k_l(x,y)=1$ if $d(x,y)=l$; $K_l(x,y)=\sum_{\gamma\in\Gamma}k_l(\gamma x,y)$ counts orbit points at distance $l$. Summed over alternate shells it gives $L_t$, whose trace is the quaternion count.`, where: '(4.6), (4.7), (4.9)' },
  { key: 'thetaj', topic: 5, level: 'specialized', origin: 'paper', term: R`Spectral angle $\theta_j$`,
    text: R`$\lambda_j=2\sqrt p\cos\theta_j$. Real exactly when $|\lambda_j|\le2\sqrt p$; otherwise $i\mu$ or $\pi+i\mu$. The Ramanujan property says every nontrivial $\theta_j$ is real.`, where: '(4.11)' },
  { key: 'chebyshev', topic: 5, level: 'intermediate', origin: 'paper', term: 'Chebyshev polynomials',
    text: R`Second kind: $U_t(\cos\theta)=\frac{\sin(t+1)\theta}{\sin\theta}$; the paper's $H_t(x)=p^{t/2}U_t(x/2\sqrt p)$ (Remark 2). First kind: $T_l(\cos\theta)=\cos l\theta$, used in (5.3).`, where: 'Remark 2, (5.3)' },
  { key: 'closedwalks', topic: 5, level: 'intermediate', origin: 'paper', term: R`Closed walks $\rho(l)$`,
    text: R`The number of walks of length $l$ in the tree that start and end at a given vertex. $\frac1n\sum_j\lambda_j^l$ counts closed walks in a graph, so the two agree below the girth.`, where: 'Proposition 4.2, (4.4)' },

  // From the harmonic-analysis supplement (background, not in the paper)
  { key: 'laplacian', topic: 0, level: 'intermediate', origin: 'background', term: 'Graph Laplacian',
    text: R`$(p+1)-\Delta$ on a $(p+1)$-regular graph. Its eigenvalue is small exactly when $\Delta$'s is near $p+1$: the eigenfunction barely changes across edges, which on a finite graph means a bottleneck.`, where: 'the supplement before §4' },
  { key: 'spherical', topic: 5, level: 'specialized', origin: 'background', term: R`Spherical function $\varphi_\lambda$`,
    text: R`The radial $\lambda$-eigenfunction on the tree with $\varphi_\lambda(o)=1$: $\varphi(n-1)+p\varphi(n+1)=\lambda\varphi(n)$, so $\varphi_\lambda(n)\approx p^{-n/2}\cos(n\theta+\cdot)$ with $\lambda=2\sqrt p\cos\theta$. Averaging any $\lambda$-eigenfunction over a sphere of radius $l$ multiplies it by $\varphi_\lambda(l)$; that is why the kernels of §4 are diagonal.`, where: '(4.8), (4.10), Figures S1, S2' },
  { key: 'planewave', topic: 5, level: 'specialized', origin: 'background', term: 'Plane wave, horofunction',
    text: R`For an end $\xi$ of the tree and a horofunction $b$ (one neighbour with $b-1$, $p$ with $b+1$), $p^{-s\,b(x)}$ is an eigenfunction with $\lambda=p^s+p^{1-s}$; on $\mathbb H$, $y^s$ has $\Delta_{\mathbb H}$-eigenvalue $s(1-s)$. Averaged over all ends they give the spherical function.`, where: 'Figure S1' },
  { key: 'tempered', topic: 5, level: 'specialized', origin: 'background', term: 'Tempered',
    text: R`A wave, or a representation, that decays exactly like the inverse square root of the volume: $p^{-n/2}$ on the tree, $e^{-\rho/2}$ on $\mathbb H$. On the tree this is $|\lambda|\le2\sqrt p$, $\theta$ real; on $\mathbb H$ it is $\lambda\ge\frac14$. A Ramanujan graph is one whose nontrivial eigenvalues are all tempered.`, where: 'Figures S1, S4' },
  { key: 'complementary', topic: 5, level: 'specialized', origin: 'background', term: 'Complementary series',
    text: R`Unitary representations that are not tempered: $2\sqrt p<|\lambda|<p+1$ on the tree, $0<\lambda<\frac14$ on $\mathbb H$. An eigenvalue of a graph or surface in this range is called exceptional; Theorem 4.1 says $X^{p,q}$ has none.`, where: 'Figure S4' },
  { key: 'plancherel', topic: 5, level: 'specialized', origin: 'background', term: 'Plancherel measure',
    text: R`How $L^2$ of a group or homogeneous space decomposes into irreducible representations. For the tree's vertices it is Kesten's measure $\mu_{p+1}$; for $\mathbb H$ it is a density on the principal series; for $\PGL_2(\R)$ it also has atoms, the discrete series.`, where: 'Proposition 4.3, Figure S4' },
  { key: 'discreteseries', topic: 4, level: 'specialized', origin: 'background', term: R`Discrete series $D_k$`,
    text: R`The representations of $\PGL_2(\R)$, $k=2,4,6,\dots$, that occur discretely in $L^2(\PGL_2(\R))$: their matrix coefficients are square-integrable. They have no $O(2)$-fixed vector, and a holomorphic modular form of weight $k$ generates $D_k$. Under Jacquet–Langlands the eigenfunctions of $X^{p,q}$ correspond to forms with $D_2$ at $\infty$, which is why the Ramanujan bound is known for them.`, where: 'Figure S4' },
  { key: 'maass', topic: 4, level: 'specialized', origin: 'background', term: 'Maass form',
    text: R`A square-integrable eigenfunction of $\Delta_{\mathbb H}$ on $\Gamma\backslash\mathbb H$, cuspidal. At $\infty$ it generates a principal or complementary series representation. The Ramanujan conjecture for Maass forms is open, at $\infty$ (Selberg's $\lambda_1\ge\frac14$) and at every prime.`, where: 'Figure S4' },
  { key: 'selberg', topic: 4, level: 'specialized', origin: 'background', term: 'Selberg eigenvalue conjecture',
    text: R`$\lambda_1(\Gamma(N)\backslash\mathbb H)\ge\frac14$ for every congruence subgroup. Selberg proved $\frac3{16}$; the best known bound is $\frac{975}{4096}$ (Kim–Sarnak). It is the surface analogue of the Ramanujan property, and it makes the Cayley graphs of $\SL_2(\Z/q\Z)$ with the elementary generators expanders, but not Ramanujan graphs.`, where: 'the supplement before §4' },
  { key: 'satake', topic: 4, level: 'specialized', origin: 'background', term: R`Satake parameter $z$`,
    text: R`The number with $\lambda=\sqrt p\,(z+z^{-1})$, that is $z=e^{i\theta}$. Tempered means $|z|=1$. For a weight-two form, $z=\alpha/\sqrt p$ with $\alpha$ an eigenvalue of Frobenius, so the Ramanujan bound is a Riemann hypothesis.`, where: 'Figure S4' },
  { key: 'jl', topic: 4, level: 'specialized', origin: 'background', term: 'Jacquet–Langlands correspondence',
    text: R`Matches automorphic forms on the units of a quaternion algebra with cusp forms on $\mathrm{GL}_2$ having the same Hecke eigenvalues wherever the algebra splits. For the definite algebra $H$ it sends the trivial representation of $SO(3)$ at $\infty$ to $D_2$, so functions on $X^{p,q}$ become holomorphic forms of weight two.`, where: 'Figure S4' },
  { key: 'eichlershimura', topic: 4, level: 'specialized', origin: 'background', term: 'Eichler–Shimura relation',
    text: R`For a weight-two Hecke eigenform, $a_p$ is the trace of Frobenius on the Jacobian of a modular curve over $\F_p$. With Weil's Riemann hypothesis for curves this gives $|a_p|\le2\sqrt p$, the case of the Ramanujan conjecture that (1.5) uses.`, where: '(1.5), Figure S4' },
  { key: 'squarecomplex', topic: 5, level: 'specialized', origin: 'background', term: R`The square complex $S^{p,q}$`,
    text: R`One vertex, a loop for each pair $\alpha^{\pm1}$ of norm $p$ and $\beta^{\pm1}$ of norm $q$, and a square for each relation $\alpha\beta=\pm\beta'\alpha'$. The link of the vertex is $K_{p+1,q+1}$, so the universal cover is $T_{p+1}\times T_{q+1}$.`, where: 'Figure S5' },
  { key: 'hyperplane', topic: 5, level: 'specialized', origin: 'background', term: 'Hyperplane of a square complex',
    text: R`The graph made of the midlines of squares that cross a given family of edges. Slicing at $\frac14$ and $\frac34$ instead gives its double cover. In $S^{p,q}$ these slices are exactly $Y^{p,q}$ and $Y^{q,p}$.`, where: 'Figure S5' },
  { key: 'localdensity', topic: 3, level: 'specialized', origin: 'background', term: R`Local density $\delta_\ell(n)$`,
    text: R`$\lim_k\ell^{-3k}\#\{v\bmod\ell^k:Q(v)\equiv n\}$ for a quaternary form: how much more or less often $Q(v)\equiv n$ holds modulo powers of $\ell$ than for random residues. The singular series is $\prod_\ell\delta_\ell(n)$.`, where: 'Figure S3' },
];

// ───────────────────────── notation ─────────────────────────
// first: where the symbol first appears (references are linked); note: collisions and conventions

export const NOTATION_GROUPS = [
  { title: 'Primes and graphs', rows: [
    [R`$p,\ q$`, R`distinct primes, both $\equiv1\pmod4$`, '§1'],
    [R`$k=p+1$`, 'the degree', '§1', R`In §4 and §5 also $k$ = an exponent ($p^k$) and $k_l$ = a kernel.`],
    [R`$\leg pq$`, 'Legendre symbol', '§1', R`Stated with $\leg qp$ on p. 263; equal by reciprocity.`],
    [R`$X_{n,k}$`, R`any $k$-regular graph on $n$ vertices`, '§1'],
    [R`$X^{p,q}$`, 'the Cayley graph of §2', '§2'],
    [R`$Y^{p,q}$`, R`the graph on $\PP^1(\F_q)$`, 'Theorem 4.4'],
    [R`$n$`, R`$|X^{p,q}|=q(q^2-1)$ or $q(q^2-1)/2$`, '§2'],
    [R`$T_k,\ T$`, R`the $k$-regular tree`, 'Proposition 4.2'],
  ]},
  { title: 'Graph invariants', rows: [
    [R`$\Delta$`, 'the adjacency matrix', '§1', R`Not the Laplacian. This page writes $A$ in the background section.`],
    [R`$\lambda_j$`, R`eigenvalues, $k=\lambda_0\ge\dots\ge\lambda_{n-1}$`, '§1'],
    [R`$\lambda(X)$`, R`largest $|\lambda_j|$ with $\lambda_j\ne\pm k$`, '§1'],
    [R`$g(X)$`, 'girth', '§1'],
    [R`$\diam(X)$`, 'diameter', '§1'],
    [R`$i(X)$`, 'independence number', '§1'],
    [R`$\chi(X)$`, 'chromatic number', '§1'],
    [R`$h(X)$, $\partial S$`, 'Cheeger constant, edge boundary', '#before', 'Background only; the paper does not use them.'],
  ]},
  { title: 'Quaternions and groups', rows: [
    [R`$H(\Z)$`, 'integral quaternions', '§3', R`$H(\Z/2m\Z)^*$: invertible quaternions mod $2m$.`],
    [R`$\bi,\bj,\bk$`, 'quaternion units', '§3', R`Bold. The plain $i$ of (2.1) is a square root of $-1$ mod $q$.`],
    [R`$i$`, R`an integer with $i^2\equiv-1\pmod q$`, '(2.1)', R`Also an index ($\delta^{(l)}_{ij}$) and, in $i(X)$, the independence number.`],
    [R`$\alpha=a_0+a_1\bi+a_2\bj+a_3\bk$`, 'a quaternion', '§3'],
    [R`$\bar\alpha,\ N(\alpha)$`, 'conjugate, norm', '§3'],
    [R`$\tilde\alpha$`, R`the matrix (2.1) of $\alpha$ mod $q$`, '(2.1)', R`In §3 also $\tilde\gamma$, a quaternion lifting $\gamma$.`],
    [R`$\varepsilon$`, R`a unit $\pm1,\pm\bi,\pm\bj,\pm\bk$`, 'Lemma 3.1', R`Also the $\varepsilon$ of $O_\varepsilon$.`],
    [R`$S,\ \alpha_j,\ \bar\alpha_j$`, R`the $p+1$ generators, in conjugate pairs`, '§3'],
    [R`$s=\frac{p+1}2$`, 'number of conjugate pairs', '§3'],
    [R`$R_m(\alpha_1,\dots,\bar\alpha_s)$`, R`a reduced word of length $m$`, 'Lemma 3.1'],
    [R`$\delta(k)$`, R`$1$ if $k$ even, $0$ if odd`, 'Lemma 3.1', R`Distinct from $\delta^{(l)}_{ij}$ in (4.1).`],
    [R`$\Lambda'(2),\ \Lambda(2)$`, 'odd quaternions of $p$-power norm; their classes', '§3'],
    [R`$\Lambda(2m),\ \Lambda(2q)$`, 'congruence subgroups', '§3'],
    [R`$\pi,\ \varphi$`, R`reduction maps $\Lambda(2)\to H(\Z/2m)^*/Z$, $\Lambda(2)\to\PGL_2(\Z/q)$`, '§3', R`$Z$ is the scalar subgroup.`],
    [R`$\Gamma$`, 'a group acting freely on the tree', '§4', R`Also $\Gamma(16q^2)$, a congruence subgroup of $\SL_2(\Z)$, in the theta series.`],
  ]},
  { title: 'Counting', rows: [
    [R`$r_4(n)$`, 'representations as a sum of four squares', '(1.2)'],
    [R`$Q,\ r_Q(n)$`, 'the form (1.3) and its representation numbers', '(1.3)', R`Written $Q$ again at the start of the counting step, with $(2q)^2$ for $4q^2$.`],
    [R`$C(n)$`, 'the main term (singular series)', '(1.5)'],
    [R`$c_1,\ c_2$`, R`its constants, both $\frac{4}{q(q^2-1)}$`, '(1.5)', R`Not the $c$ of (5.5).`],
    [R`$F,\ G$`, R`periodic functions in $C(n)=\sum_{d\mid n}dF(d)$ and Lemma 4.4`, '(4.16)'],
    [R`$\alpha_k$`, R`$\sum_{d\mid p^k}dG(d)$ in the proof of Lemma 4.4`, '(4.17)', R`Not a quaternion.`],
    [R`$O_\varepsilon(\cdot)$`, R`big-$O$ with a constant depending on $\varepsilon$`, '(1.5)'],
  ]},
  { title: 'Spectrum and the tree', rows: [
    [R`$\mu_X,\ \mu_k$`, 'spectral measure of a graph; Kesten\'s measure', 'Proposition 4.3'],
    [R`$\rho(l),\ \rho'(2l)$`, 'closed walks in the tree; first returns', 'Proposition 4.2'],
    [R`$\delta^{(l)}_{ij}$`, R`entries of $\Delta^l$: paths of length $l$ from $i$ to $j$`, '(4.1)'],
    [R`$u_j$`, 'orthonormal eigenfunctions', '(4.5)'],
    [R`$k_l,\ K_l,\ L_t$`, 'point-pair function, its periodization, alternate-shell sum', '(4.6)'],
    [R`$h_j(l)$`, R`coefficient of $u_j(x)u_j(y)$ in $K_l$`, '(4.8)'],
    [R`$\theta_j$`, R`spectral angle, $\lambda_j=2\sqrt p\cos\theta_j$`, '(4.11)', R`Not the theta function $\theta(z)$.`],
    [R`$\theta(z)$`, R`theta series of $Q$`, '(4.16)'],
    [R`$H_t$`, R`$H_t=xH_{t-1}-pH_{t-2}$ (Remark 2)`, 'Remark 2', R`(5.3) reuses $H_l$ for $\cos(l\arccos x)$, a different polynomial. Figures on this page use Remark 2's.`],
    [R`$a_m$`, R`coefficients of $\cos(l\arccos x)$`, '(5.3)'],
  ]},
  { title: 'Section 5', rows: [
    [R`$A$`, 'an independent set', '(5.5)', R`On this page $A$ is also the adjacency matrix (the paper's $\Delta$).`],
    [R`$r=|A|,\ \nu=r/n$`, 'its size and proportion', '(5.5)', R`Not the $r$ of $p^r$ in Lemma 3.1.`],
    [R`$c$, $f$`, R`the constant and test function in (5.5)`, '(5.5)'],
  ]},
  { title: 'Supplement (not in the paper)', rows: [
    [R`$\varphi_\lambda(n)$`, R`spherical function: the radial $\lambda$-eigenfunction on the tree`, 'Figure S1'],
    [R`$b(x)$, $\xi$`, R`a horofunction and its end`, 'Figure S1'],
    [R`$s$`, R`spectral parameter: $\lambda=p^s+p^{1-s}$ on the tree, $s(1-s)$ on $\mathbb H$`, 'Figure S1', R`Not the $s=\frac{p+1}2$ of §3.`],
    [R`$\Delta_{\mathbb H},\ \lambda_{\mathbb H}$`, R`hyperbolic Laplacian $-y^2(\partial_x^2+\partial_y^2)$ and its eigenvalue`, 'Figure S1'],
    [R`$z$`, R`Satake parameter, $\lambda=\sqrt p\,(z+z^{-1})$`, 'Figure S4', R`Not the variable $z$ of the theta series.`],
    [R`$G(a/m)$`, R`normalized Gauss sum of $Q$ at the cusp $a/m$`, 'Figure S3', R`Not the periodic $G$ of Lemma 4.4.`],
    [R`$\mathfrak S(n),\ \delta_\ell(n)$`, R`singular series and its local densities`, 'Figure S3'],
    [R`$D_k$`, R`discrete series of $\PGL_2(\R)$, weight $k$`, 'Figure S4'],
    [R`$a_p$`, R`Hecke eigenvalue of a weight-two form at $p$`, 'Figure S4'],
    [R`$S^{p,q}$`, R`the square complex of norms $p$ and $q$`, 'Figure S5'],
    [R`$\beta_j$`, R`quaternions of norm $q$, the vertical loops of $S^{p,q}$`, 'Figure S5', R`The paper's generators $\alpha_j$ have norm $p$.`],
  ]},
];

// ───────────────────────── cited results ─────────────────────────

export const CITED = [
  { key: 'jacobi', name: "Jacobi's four-square theorem", who: 'Jacobi (1834); see Hardy–Wright [9]',
    statement: R`$r_4(n)=8\sum_{d\mid n,\ 4\nmid d}d$.`, used: R`(1.2): there are $p+1$ generators (§2), and the count in the proof of Lemma 3.1.` },
  { key: 'dickson', name: 'Factorization of quaternions', who: 'Dickson, Proc. London Math. Soc. (1922) [5]',
    statement: R`Quaternions of odd norm have greatest common divisors and factor on the left and on the right; a quaternion is prime exactly when its norm is prime.`, used: 'existence in Lemma 3.1, which the paper credits to Gerritzen–van der Put [8].' },
  { key: 'malyshev', name: 'Representations in residue classes', who: 'Malyshev (1962) [20], after Hardy–Littlewood',
    statement: R`Let $f$ be an integral quadratic form in $n\ge4$ variables with discriminant $d$, and $g$ prime to $2d$. If $m$ is large enough (depending on $f$ and $g$), generic for $f$, with $(g,2md)=1$, and $f(b)\equiv m\pmod g$ for some $b$ with $(b_1,\dots,b_n,g)=1$, then $f(a)=m$ for some integers $a\equiv b\pmod g$. The proof gives an asymptotic count (the singular series).`, used: 'Proposition 3.3 (the image mod $q$ is everything). Remark 1 notes strong approximation [16] also works.' },
  { key: 'hecke', name: 'Theta series as modular forms', who: 'Hecke [10]; Ogg [21]',
    statement: R`$\theta_Q(z)=\sum_nr_Q(n)e^{2\pi inz}$ is a weight-$2$ modular form, a sum of Eisenstein series and a cusp form, and the Eisenstein part has coefficients $C(n)=\sum_{d\mid n}dF(d)$ with $F$ periodic.`, used: '(4.16) and the shape of $C$ used with Lemma 4.4.' },
  { key: 'eichler', name: 'The Ramanujan conjecture in weight 2', who: 'Eichler (1954) [6], Igusa (1959) [12]; via Weil [26]',
    statement: R`Cusp-form coefficients of weight $2$ satisfy $a_n=O(n^{1/2+\varepsilon})$. Eichler's results left out finitely many unspecified primes; Igusa's work fills the gap.`, used: R`(1.5), and through it Theorem 4.1. The only deep input.` },
  { key: 'kesten', name: "Kesten's spectral measure", who: 'Kesten, Trans. AMS (1959) [15]',
    statement: R`The moments of $\mu_k$ are the closed-walk counts $\rho(l)$ of the $k$-regular tree.`, used: 'Proposition 4.3.' },
  { key: 'spherical', name: 'Spherical functions on the tree', who: "the authors' earlier work [18]",
    statement: R`The coefficient of $u_j(x)u_j(y)$ in the alternate-shell kernel $L_t$ is $p^{t/2}\frac{\sin(t+1)\theta_j}{\sin\theta_j}$.`, used: '(4.10). Remark 2 gives a self-contained route.' },
  { key: 'simple', name: R`Simplicity of $\PSL_2(\F_q)$`, who: 'classical (Jordan, Dickson)',
    statement: R`$\PSL_2(\F_q)$ is simple for $q>3$.`, used: R`End of §3: $X^{p,q}$ is not bipartite when $\leg pq=1$.` },
  { key: 'cyclic', name: R`Cyclic unit group mod $q^2$`, who: 'classical',
    statement: R`For an odd prime $q$, $(\Z/q^2\Z)^*$ is cyclic, so $X^2\equiv a\pmod{q^2}$ has at most two solutions.`, used: R`Theorem 3.4, case $\leg pq=-1$.` },
  { key: 'alonboppana', name: 'Alon–Boppana bound', who: 'Alon [3], Boppana',
    statement: R`$\liminf_n\lambda(X_{n,k})\ge2\sqrt{k-1}$.`, used: 'stated as (1.1), proved in the paper as Proposition 4.2.' },
  { key: 'alon', name: 'Independence number of Ramanujan graphs', who: 'Alon [1], [2]',
    statement: R`A non-bipartite Ramanujan graph has $i(X)\le\frac{2\sqrt{k-1}}kn$.`, used: 'Proposition 5.2, proved in the paper; gives (5.9).' },
  { key: 'hoffman', name: "Hoffman's bound", who: 'Hoffman (1970) [11]',
    statement: R`$\chi(X)\ge1-\lambda_{\max}/\lambda_{\min}$.`, used: 'Remark 3: another route to (5.9).' },
  { key: 'ihara', name: 'Ramanujan quotients of the tree', who: "Ihara [13]; the authors' [18]",
    statement: R`For suitable arithmetic $\Gamma\subset\mathrm{GL}_2(\Q_p)$, the finite graphs $\Gamma\backslash\PGL_2(\Q_p)/\PGL_2(\Z_p)$ are Ramanujan.`, used: R`Context in §1: $X^{p,q}$ is an explicit case.` },
];

// ───────────────────────── print slips ─────────────────────────

export const SLIPS = [
  { where: '(1.1), Proposition 4.2', text: R`Printed as "lim"; the statement and proof are a liminf.` },
  { where: '§1', text: R`The cases on p. 263 use $\leg qp$; everywhere else it is $\leg pq$. They agree by quadratic reciprocity, since $p\equiv q\equiv1\pmod4$.` },
  { where: '(4.14)', text: R`The sum before (4.14) is printed over $r\lt k/2$. It must include $r=k/2$ (the identity, $\alpha=\pm p^{k/2}$), as in (4.9); without it $r_Q(p^2)=2$ would be counted as $0$. Checked numerically.` },
  { where: '(4.16)–(4.18)', text: R`$C(n)=\sum_{d\mid n}dF(d)$ with $F$ periodic cannot hold in Case i, where $C(p^k)$ vanishes for odd $k$: it would force $F(p^{2j})=c_2(1+p^{-1}+\dots+p^{-2j})$. The Eisenstein coefficients carry a character of $n/d$: $C(n)=\frac{c_2}2\sum_{d\mid n}d\,(1+\leg dq\leg{n/d}q)$ for $n\equiv1\pmod4$ prime to $q$ (checked for $n<3000$, $q=5,13$). Along even $k$ it is a periodic divisor sum again, so the proof stands, and (4.19) is correct. Found while building Figure S3.` },
  { where: '(4.19)', text: R`In Case i the remaining sum is printed once from $j=1$ and once from $j=2$ to $n-2$; it runs over every $j$ except $0$ and $n-1$.` },
  { where: '(5.2)', text: R`§5 cites (4.4) and (4.5) for $k_m$ and $K_m$, which are (4.6) and (4.7).` },
  { where: 'Remark 2, (5.3)', text: R`$H_t$ names two different polynomials: Remark 2's $H_t=xH_{t-1}-pH_{t-2}$, and (5.3)'s $H_l(x)=\cos(l\arccos x)$.` },
  { where: 'Lemma 4.4, Theorem 4.4', text: 'Two statements share the number 4.4. This page keeps both and always writes the word.' },
];

// ───────────────────────── reading guide ─────────────────────────

export const GUIDE_HTML = R`<h3 class="cmp-h3" id="guide-parts">Status of each part</h3>
<div class="table-scroll">
<table class="params">
<tr><th>Part</th><th>Status</th><th>Where the weight sits</th></tr>
<tr><td>§2, the generators</td><td>new, explicit</td><td>choosing $S$ so that it is symmetric and generates all of $\PSL_2$ or $\PGL_2$</td></tr>
<tr><td>Lemma 3.1, Cor. 3.2</td><td>classical arithmetic, repackaged</td><td>the counting proof of uniqueness, via Jacobi</td></tr>
<tr><td>Prop. 3.3</td><td>cited (Malyshev; or strong approximation)</td><td>surjectivity mod $q$</td></tr>
<tr><td>Thm. 3.4</td><td>new, elementary</td><td>Case i uses that $(\Z/q^2\Z)^*$ is cyclic</td></tr>
<tr><td>Props. 4.2, 4.3</td><td>known (Alon–Boppana, Kesten), reproved</td><td>closed walks in the tree</td></tr>
<tr><td>(4.14)–(4.15)</td><td>new; elementary given §3</td><td>the bridge from eigenvalues to representation numbers</td></tr>
<tr><td>(1.5)</td><td>deep input (Eichler, Igusa)</td><td>the only place the Ramanujan conjecture enters</td></tr>
<tr><td>Lemma 4.4, (4.19)–(4.20)</td><td>new, elementary</td><td>matching the main terms exactly; positivity for even $k$</td></tr>
<tr><td>Thm. 4.4, §5</td><td>consequences</td><td>routine once Theorem 4.1 is in hand</td></tr>
</table>
</div>

<p>A reader checking the argument should spend time on two places. The first is (4.14): it needs both the uniqueness in Corollary 3.2 (so each solution of $Q(v)=p^k$ is counted once) and the identification $\Lambda(2)/\Lambda(2q)\cong\PGL_2$ or $\PSL_2$ from Proposition 3.3 (so the count is about $X^{p,q}$ and not some other quotient). The second is the end of the two cases, where an $O(p^{\varepsilon k})$ bound has to force every $\theta_j$ to be real.</p>

<h3 class="cmp-h3" id="guide-routes">Three ways through the paper</h3>
<ol class="guide-routes">
  <li><b>The spectral argument only.</b> Definition 1.1 and (1.1); the generators (2.1); Corollary 3.2 and Proposition 3.3, for the identification $X^{p,q}=\Lambda(2)/\Lambda(2q)$; then (4.14), (4.15), (1.5), Lemma 4.4, (4.19)–(4.20) and Theorem 4.1. Figures 5 and 6 follow this route.</li>
  <li><b>The combinatorics.</b> §2, Lemma 3.1 and Theorem 3.4 for the girth; then Theorem 5.1 and Proposition 5.2 for the diameter, independence and chromatic numbers. Figures 2, 3 and 8.</li>
  <li><b>Background first.</b> "Before the paper", then Propositions 4.2 and 4.3 (what every large graph must do, Figure 4), then Theorem 4.1 as the statement that $X^{p,q}$ meets that limit exactly.</li>
</ol>
<p>If the harmonic analysis in §4 is new to you, open the orange supplement just before §4 first: what the eigenvalues mean on the tree (Figures S1, S2), where the main term comes from (Figure S3), and why the Ramanujan bound is known for these forms (Figure S4). It is not part of the paper and nothing in the proof depends on it.</p>`;

// ───────────────────────── wording for the shared companion framework ─────────────────────────
export const TEXT = {
  kicker: 'Ramanujan Graphs · companion',
  trace: 'Trace what Theorem 4.1 rests on',
  intro: {
    defs: 'Every definition the paper makes, and the background terms it assumes. Filter by level — <b>basic</b> (an undergraduate course), <b>intermediate</b> (a first graduate course), <b>specialized</b> (number theory and automorphic forms) — or search. References are links: hover to preview, click to jump.',
    notation: 'Every symbol in the paper, where it first appears, and where the paper uses one letter for two things (marked <span class="clash">clash</span>). The paper writes $\\Delta$ for the adjacency matrix; this page often writes $A$.',
    cited: 'The results the paper takes from elsewhere, stated, with where each one is used. The deep one is the Ramanujan conjecture in weight two; the rest is classical.',
    slips: 'Small errors in the printed paper (Combinatorica 8, 1988), found while transcribing it. The page states the intended reading and marks each place with a quiet "In print" note. None affects the results.',
  },
};
