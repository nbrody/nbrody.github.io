# LPS: source (Stage 0)

## Citation

A. Lubotzky, R. Phillips, P. Sarnak, *Ramanujan graphs*, Combinatorica **8** (3) (1988), 261–277. Akadémiai Kiadó / Springer-Verlag. Received June 25, 1986; revised August 5, 1987. AMS subject classification (1980): 05C35. DOI [10.1007/BF02126799](https://doi.org/10.1007/BF02126799) (checked against Crossref: Combinatorica 8(3), 261–277, September 1988).

Affiliations as printed: Lubotzky, Institute of Mathematics and Computer Science, Hebrew University, Jerusalem; Phillips and Sarnak, Department of Mathematics, Stanford University.

Announced earlier as [17]: *Ramanujan conjecture and explicit construction of expanders*, Proc. STOC 1986, 240–246.

## Status

Refereed and published in 1988. Not formally verified (no Lean or other formalization is known to us). The paper thanks a referee for the more direct argument in Remark 2.

## Where the source lives

- `~/Dropbox/Textbooks/Geometric Group Theory/Lubotzky Phillips Sarnak - Ramanujan Graphs.pdf`: 17 pages, a scan (`PageGenie PDFGenerator`, 2005) with an OCR text layer.
- The OCR text finds the section and statement structure but garbles almost every formula. All statements in `outline.md` were transcribed from page images rendered with PyMuPDF at 2× (`fitz.Matrix(2, 2)`, grayscale), not from the OCR text.
- The PDF is Springer's copyright: do not put it, or page images, in this folder. Link to the publisher instead.

## The deep inputs the paper rests on

| Input | Used for | Credited to |
|---|---|---|
| Jacobi's four-square theorem (1.2) | counting the generators; uniqueness in Lemma 3.1 | Jacobi (via Hardy–Wright [9]) |
| Factorization of odd quaternions | existence in Lemma 3.1 | Dickson [5]; the lemma itself is cited to Gerritzen–van der Put [8] |
| Representations by quaternary forms in residue classes (singular series) | Proposition 3.3 (the image mod $q$ is all of PSL or PGL) | Malyshev [20], after Hardy–Littlewood; Remark 1 notes strong approximation [16] also works |
| Theta series = Eisenstein series + cusp form | splitting $r_Q(n)$ into $C(n)$ plus an error | Hecke [10]; Ogg [21] |
| The Ramanujan conjecture for weight-2 cusp forms | the error term $O_\varepsilon(p^{k(1/2+\varepsilon)})$ in (1.5) | Eichler [6] (1954), completed by Igusa [12] (1959); Ramanujan [22]; Weil [26] |
| Moments of the tree's spectral measure | Proposition 4.3 | Kesten [15] |
| Spherical functions on the tree | (4.10) | the authors' own [18] |
| Alon–Boppana | (1.1), reproved as Proposition 4.2 | Alon [3] |
| Independence number of Ramanujan graphs | Proposition 5.2 | Alon [1], [2] |
| Chromatic number bound | Remark 3 | Hoffman [11] (printed "Hofmann") |

Remark 4: Margulis independently obtained similar results (three Russian-language sources, 1984–1988).

## Slips in the printed paper

Keep the paper's text and numbering on the page, but don't repeat these slips; add a quiet note where one matters.

1. (1.1) and Proposition 4.2 print "lim". The statement is a liminf, which the proof gives (the underlined-lim notation may have been lost in the scan).
2. The case split on p. 263 uses the Legendre symbol $\left(\frac qp\right)$; everywhere else it is $\left(\frac pq\right)$. They are equal by quadratic reciprocity, because $p\equiv q\equiv 1 \pmod 4$.
3. The sum before (4.14) is printed over $r<k/2$. It must include $r=k/2$ when $k$ is even (the identity, $\alpha=\pm p^{k/2}$), matching (4.9). Our check confirms this: $r_Q(p^2)=2$ comes from that term alone.
4. In Case i of the proof of Theorem 4.1, the index range of the remaining sum is printed as both $j=1$ and $j=2$ to $n-2$. The intended range is every $j$ except $0$ and $n-1$, the eigenvalues $\pm(p+1)$.
5. §5 says $k_m$ and $K_m$ were "defined in (4.4)" and "(4.5)"; they are (4.6) and (4.7).
6. $H_t$ names two different polynomial families: in Remark 2, $H_t=xH_{t-1}-pH_{t-2}$; in (5.3), $H_l(x)=\cos(l\arccos x)$. Use two names on the page.
7. Lemma 4.4 and Theorem 4.4 share a number. Keep both as printed and always write the word ("Lemma 4.4", "Theorem 4.4").

## Not in the paper

The old deck required $q>2\sqrt p$. The paper imposes no size condition on $q$. Small $q$ can give loops or repeated edges (for $(p,q)=(13,5)$, 14 generators act on a group of order 120), so the page should say which $(p,q)$ give simple graphs rather than invent a hypothesis.

## Numerical checks run (November 2, 2026)

Scripts in `checks/`. Both rebuild $X^{p,q}$ from the paper's generators (2.1).

- `lps415.py`: identity (4.15) in Remark 2's form, $r_Q(p^t)=\frac2n\sum_j H_t(\lambda_j)$, holds **exactly** for $(p,q)=(13,5),(5,13),(13,17),(17,13)$ and $t=0,\dots,6$. Vertex counts and bipartiteness match §2. All four graphs are Ramanujan, and their girths (4, 8, 6, 3) meet Theorem 3.4.
- `mainterm.py`: with $c_1=c_2=4/(q(q^2-1))$ (from (4.19), (4.20)), $(r_Q(p^k)-C(p^k))/p^{k/2}$ stays between about $-0.6$ and $+0.6$ once $k\ge 1$, for five pairs up to $p^k\le 2\cdot 10^8$.
- For $k$ below the girth, $r_Q(p^k)$ is exactly 2 ($k$ even) or 0 ($k$ odd); it first exceeds that at $k=$ girth (checked for all four graphs above). That is (4.14) seen from the other side: the only quaternions counted are $\pm p^{k/2}$ until a nontrivial element of $\Lambda(2q)$ fits.
